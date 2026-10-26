---
validador: seguranca-aplicacao
modelo: claude-sonnet-5-5
etapa: V2-F00-E06
sha_validado: 7005a60cd70b30a4f455a96a64c4d7a3abb2819f
ci_run: 37739535524
rodada: 1
herdado_de:
tags: [MOBILE, OFFLINE, A11Y, AUTH, AUTHZ]
nivel_de_prova_exigido: [E1, E2]
nivel_de_prova_obtido: [E1]
veredito: PASS
confianca: media
humano_necessario: nao
escalar: nenhum
---
## Critérios verificados

HEAD 665b2be difere de 7005a60 só no STATUS. Esta dimensão olhou token, autoria, laço de renovação e dado em repouso. O FAIL já gravado em `testes.md` (403 `troca_de_senha_obrigatoria`) é de outra superfície e vale como bloqueio da etapa; não o repito. O PASS abaixo é só desta dimensão e não desfaz aquele FAIL.

1. **O que o app faz com os tokens ao pausar.** Leitura de `packages/campo/src/fila.ts` (`guardarPausaDeSessao`), `transporte.ts` e `apps/campo/src/dados/sessao.tsx`: a pausa NÃO apaga nem troca token. Acesso e renovação ficam no `SecureStore` até a pessoa tocar em sair ou entrar de novo (`encerrarSessaoVencida`, `fila.tsx:1748`). Conferi por execução que os tokens mantidos estão mortos no servidor (S2 e S3 abaixo), então manter não dá acesso a nada. Aceitável pela régua (ASVS V3.3: o encerramento vale no servidor).
2. **Renovação em laço depois de 401 `sessao_encerrada`.** Não há. S2 (obtentor real de `apps/campo/src/dados/token.ts` + `transporteHttp` + fila + API real, sessão revogada no banco), 6 drenos seguidos: `paradaPor: sessao_encerrada` nos 6, **0 chamadas de renovação**, 6 requisições ao total, token mantido. O atalho `entrar_de_novo` em `pedir()` evita gastar o refresh rotativo.
3. **401 `nao_autenticado` com refresh morto.** S2b (token ilegível + refresh de sessão revogada), 6 drenos: 1 renovação (a API respondeu 401 `sessao_encerrada`), depois o piso de 60 s do obtentor segura as outras 5; pausa `sessao_encerrada`. Sem laço. O laço de fundo em `dados/fila.ts` espera 60 s (`ESPERA_COM_A_FILA_PAUSADA_MS`) com a fila pausada, então o pior caso é 1 pedido por minuto por aparelho.
4. **Conta desativada e refresh.** S3: `/auth/renovar` de conta desativada responde 403 `conta_desativada`; depois da reativação o MESMO refresh responde 401 `sessao_encerrada` (a desativação revogou a sessão no servidor). Confere com a frase do app ("entrar de novo só depois que reativar").
5. **Fila pausada de A drenada com a identidade de B (caminho normal).** Não ocorre: `prontos()` só entrega item cuja `autoria` é `propria` para a sessão atual (`autoriaDaColeta`), e o servidor recusa qualquer envelope/devolução com `coletadaPor`/`devolvidaPor` diferente do token (409 `autor_divergente`, antes da leitura da ocorrência e antes da idempotência, `rotas/sincronizacao.ts:460` e `:1031`). Cobertura por testes do SHA (`pausa-de-sessao.test.ts`, verde no CI). Itens sem autor (coleta antiga) nunca saem.
6. **Dado da fila legível depois de sair.** `apagarDadosLocais` NÃO apaga `fila_sincronizacao` por decisão documentada (promessa "a coleta continua guardada"); o SQLite local é sem criptografia. O resumo de B só conta `deOutroAutor`, sem expor conteúdo, e a tela não lista item de outro autor. Criptografia local é F14-E04, expressamente fora desta etapa.

## Evidência

Sonda temporária `apps/api/test/zz-seg-sonda.test.ts` (API real em porta efêmera, Postgres em memória, `transporteHttp`, fila e `criarObtentorDeToken` reais), rodada com `npx vitest run test/zz-seg-sonda.test.ts --testTimeout=120000` em `dc360/apps/api`: exit 0, 3 de 3. Saídas no scratchpad da sessão: `.../scratchpad/sonda.txt` (S1 com Helena, inválido porque coordenador não tem `registrar_vistoria`; S2; S3) e `sonda2.txt` (S1 válido com um segundo agente inserido no banco de teste). Arquivo da sonda APAGADO; `git status --porcelain` só mostra pastas `validacao/`.

## Cenários positivos

- S2: sessão revogada, 6 drenos, 0 renovações, item continua pendente, nenhum bloqueado.
- S2b: uma renovação só, depois o piso segura.
- Testes do SHA (lidos, CI 9 de 9): renova uma vez e sobe com a mesma chave; reativação mais nova entrada sobe sem duplicar.

## Cenários negativos

- Autorização/isolamento: item de A não sobe com sessão de B (portão de autoria no motor e 409 no servidor); recurso de outro município continua 404 (não tocado pela etapa).
- S3: refresh de conta desativada recusado (403), e após reativação o refresh antigo não ressuscita a sessão.
- S1 (corrida, abaixo): o servidor segura o envelope, mas não a foto.

## Tentativas de reprovar

- Procurei token apagado/mantido indevidamente na pausa: nenhum código toca credencial na pausa; mantido, e morto no servidor.
- Procurei laço de renovação com sessão revogada, com token ilegível e com refresh morto: nenhum.
- Procurei um 403 com ação `parar_e_avisar` que não fosse `conta_desativada` (classificação errada): no catálogo (`packages/shared/src/codigos-de-erro.ts`) só `conta_desativada` tem essa ação.
- **S1, corrida de troca de conta com dreno em voo** (EXECUTADO, ACHADO): item do Diego com uma foto; o dreno começa com `sessaoAtual` = Diego, e antes da autorização da foto o token passa a ser o de outro agente (Bruno, mesma organização, `agente_campo`). Resultado: `fotosEnviadas: 1`, a linha em `evidencias` fica com `anexada_por` = Bruno e `enviada_em` preenchido; o envelope é recusado 409 `autor_divergente` e o item do Diego vira `bloqueado` (permanente, com "Descartar" ao lado). Ou seja, uma evidência (prova material) fica atribuída ao agente errado e a coleta de quem fez fica bloqueada. Caminho real no app: o desmonte do layout no logout chama `fila.cancelar()`, mas `cancelar` só vale ENTRE itens (`fila.ts:582`/`:640`); o item em voo continua e lê o token a cada chamada (`obterToken` lê `credenciais.current`), então basta B entrar antes de a foto seguinte ser autorizada. Janela estreita (exige logout e login de outra pessoa durante um item com fotos em envio), anterior à E06 e não causada por ela, mas a etapa promete explicitamente que item de A não sobe com a sessão de B.
- Procurei vazamento do conteúdo da fila para B: só contagem.

## Achados

1. **Corrige antes de crescer** (não bloqueia a etapa por esta dimensão): S1. A autorização de foto (`/evidencias/autorizar-envio`) não confere autor, ao contrário de `/sincronizacao/vistoria` e `/devolucao`; o motor só confere a autoria ao montar a lista. Correção sugerida: no motor, reconferir `autoriaDaColeta(item, sessaoAtual())` antes de cada chamada de rede do item (ou travar o token ao do autor durante o item) e tratar a mudança de sessão como `FalhaDeSessao`; e, no servidor, `anexada_por` precisa bater com o autor declarado. Teste: dreno em voo, troca de token, nenhuma evidência com `anexada_por` diferente do autor do item.
2. **Anotado**: tokens ficam no `SecureStore` até a pessoa agir depois da pausa; mortos no servidor, risco nulo, mas a faixa mantém a pessoa "logada". Sem ação.
3. **Anotado**: fila em texto claro no SQLite depois de sair (F14-E04, fora do escopo, documentado em `banco-local.ts`).
4. **Anotado (reforço de `testes.md`)**: a pausa gravada com `sessaoAtual()` no momento da resposta, e não com o autor do item, é a mesma raiz de S1 (não reproduzida aqui).

## Não verificado

- Aparelho/emulador (E2): o app Expo não renderiza no ambiente; só motor e API reais.
- Cofre real (`expo-secure-store`): usei o obtentor com credenciais em memória; a leitura do que fica no cofre é por código.
- Rede lenta real para medir a janela de S1 (reproduzi trocando o token logo depois de iniciar o dreno).
- Mais de um município no mesmo aparelho; `npm audit` e cabeçalhos HTTP (fora do foco desta etapa).
- Se o app impede o login de B enquanto há dreno em voo: não existe tal trava no código lido.

## Risco residual

Janela estreita de S1 (evidência com autoria errada e coleta bloqueada). Fora isso, tokens e renovação estão corretos e limitados (no máximo 1 pedido por minuto com a fila pausada).

## Motivo do humano

Não se aplica a esta dimensão.
