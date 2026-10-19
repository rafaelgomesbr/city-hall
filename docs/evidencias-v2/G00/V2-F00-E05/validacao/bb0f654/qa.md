---
validador: qa (general-purpose com o papel da dimensão)
modelo: claude-opus-5-5
etapa: V2-F00-E05
sha_validado: bb0f654
ci_run: ausente (39143791434 citado pelo implementador, não lido)
rodada: 4
herdado_de:
tags: [UI, A11Y, AUTH, API]
nivel_de_prova_exigido: [E1, E2]
nivel_de_prova_obtido: [E1, E2]
veredito: FAIL
confianca: media
humano_necessario: sim
escalar: nenhum
---
## Critérios verificados

Pasta das saídas: `/private/tmp/claude-501/-Users-rafaelgomes-Documents-city-hall/ded47d25-806d-4495-ac61-f9e84518cc35/scratchpad/validadores/qa-E04-E05-E08/` (abreviada como `$O`). Árvore em `0290af5`, que só difere de `bb0f654` em `STATUS.md` e `ESTADO-ATUAL.md`.

| Item (DoD e cinco campos de teste) | Resultado | Prova |
| --- | --- | --- |
| DoD: os três códigos emitidos e testados | PASS | sonda própria `$O/31-sonda-qa.txt`: token ausente e adulterado 401 `nao_autenticado`; sessão encerrada 401 `sessao_encerrada` (POST, GET e HEAD com efeito, renovar); conta desativada 403 `conta_desativada` (POST, GET com efeito, renovar sem par novo), com a mensagem do catálogo; `codigos-de-erro.test.ts` 22 de 22 em `$O/01` |
| DoD: catálogo no shared | PASS | `packages/shared/src/codigos-de-erro.ts`, exportado; `packages/shared/test/codigos-de-erro.test.ts` 10 de 10 (`$O/03`); a sonda importa o catálogo do `dist` e confere status e código de cada 401 e 403 observado: todos batem |
| DoD: nenhuma ocorrência do texto `sessao` como código | PASS | `grep` em `apps` e `packages`: sobram o discriminante interno `tipo: "sessao"` do resultado de entrada (não é código de erro) e os testes negativos que provam que `"sessao"` não derruba sessão; nenhuma resposta da sonda trouxe `sessao` |
| DoD: item "códigos de erro corretos" do G00 | não é desta dimensão | marca do gate |
| Positivo: vencido 401 `nao_autenticado`; encerrada 401 `sessao_encerrada`; desativada 403 `conta_desativada`; teste compara o catálogo com o servidor | PASS nos três códigos | sonda e testes acima |
| Negativo: `/auth/entrar` com conta desativada igual à senha errada | PASS | sonda: conta desativada com a senha certa, senha errada e e-mail inexistente devolvem o mesmo status e o mesmo corpo, byte a byte |
| Negativo: código fora do catálogo reprova o teste de catálogo | **FAIL** | ver Achados: o servidor emite hoje um 403 de permissão fora do catálogo (`posto_insuficiente`) e, sob mutação, um 403 com o código antigo `inativo`; o teste de catálogo fica verde nos dois casos (`$O/22`) |
| Autorização e isolamento: conta desativada de A em ocorrência de B recebe `conta_desativada` sem confirmar nada; 404 entre municípios não muda | PASS | sonda: conta desativada de Serra Alta em ocorrência própria, de Vale Fundo e inexistente: mesmo 403, mesmo corpo; conta ativa de Vale Fundo em ocorrência de Serra Alta: 404 na escrita e na leitura |
| Regressão: `test:api`, `test:isolamento`, `test --workspace @dc360/web`, `test:campo`, `superficie.test.ts` | PASS (com a falha de ambiente conhecida) | `$O/01` 1326 aprovados, 1 falha de LibreSSL, 20 pulados da E07; `$O/02` 345 e 3 pulados; `$O/04` 44 arquivos, 665 de 665; `$O/07` 134 suítes, 1927 de 1927; `$O/08` pacote do campo 223 de 223; `$O/05` 9 de 9 |
| E2E: desativar no painel e a próxima chamada leva à entrada com a frase certa | PASS | `$O/06`, seção 23 completa no roteiro inteiro (não numa cópia aparada): 19 OK, incluindo "token vencido + conta desativada leva a tela de entrada" e "a entrada continua com a recusa generica"; 288 OK e 0 falha no total, zero erro de console |
| Painel: `http.ts` trata `sessao_encerrada` como sessão morta e `conta_desativada` com aviso próprio | PASS | `sessao-e-entrada.test.ts` 27 de 27; mutação em `sessaoMorta` (desativada vira encerrada) reprova o caso (`$O/16`) |
| Documentação: tabela de códigos no README; guia do coordenador | PASS na tabela; achado no guia | README linhas 140 a 172 conferidas contra o código e a sonda; guia linhas 162 e 163 desmentidas pelo código atual (ver Achados) |
| Índice da evidência bate | PASS | `$O/20`: 58 de 58 linhas batem com os blobs de `bb0f654`; sub-índices `saidas/antes` 4 de 4 e `saidas/baseline-depois` 6 de 6; `conferir-indices-de-evidencia.mjs` OK (`$O/21`). O motivo do BLOCKED da rodada 3 está removido |

## Evidência

- `npm run build:shared` e `npm run test:api` (`$O/00`, `$O/01`): 101 arquivos, 1347 testes, 1326 aprovados; a única falha é `openssl-do-teste.test.ts` (LibreSSL do macOS, conhecida); 20 pulados são de `renovacao-contra-encerramento.test.ts` (Postgres de prova, E07).
- `npm run test --workspace @dc360/shared` (código 0, `$O/03`): 16 arquivos, 170 de 170, incluindo `codigos-de-erro.test.ts` 10 e o portão de conteúdo (`$O/19`, 10 de 10).
- `npm run test --workspace @dc360/web` (código 0, `$O/04`): 665 de 665.
- `npm run test:campo` (código 0, `$O/07`) e `npm run test --workspace @dc360/campo` (código 0, `$O/08`).
- `npm run test:isolamento` (código 0, `$O/02`) e `superficie.test.ts` (`$O/05`).
- `npm run test:e2e:api` (código 0, `$O/06`): roteiro completo, seções 23 e 24 inclusas.
- `npm run conferir:numeros` (código 0, `$O/09`).
- Sonda HTTP própria (`$O/scripts/sonda-qa.mjs`, saída `$O/31-sonda-qa.txt`, 85 OK, 0 falha) contra a API real recém-semeada na porta 3791, derrubada no fim.
- Mutações (todas restauradas com `git restore`, árvore limpa ao fim):
  - `$O/11`: tirei `if (vigencia.contaDesativada) throw new ContaDesativada()` de `auth/vigencia.ts`: 4 reprovam (conta desativada não escreve, 403 e não 401, desativada com sessões encerradas, isolamento da conta desativada).
  - `$O/16`: em `apps/web/src/dados/http.ts`, `parar_e_avisar` passou a dar `encerrada`: 1 reprova ("conta desativada derruba a tela com o motivo 'desativada'").
  - `$O/22`: em `servidor.ts`, o 403 de `PostoInsuficiente` passou a sair com `erro: "inativo"` (o código antigo que o teste diz pegar): `codigos-de-erro.test.ts` **22 de 22 verdes**. É a prova do achado.

## Cenários positivos

- Os seis códigos do catálogo observados na sonda saem com o status do catálogo (`sem_permissao` 403, `nao_autenticado` 401, `sessao_encerrada` 401, `conta_desativada` 403).
- Reativada a conta, entrar volta a funcionar (seção 23 do e2e: "a coordenacao reativa o Marcos").
- Papel alterado: a escrita responde 401 `nao_autenticado`, o painel renova e repete sem mandar à entrada (seção 24 do e2e; sonda HTTP do mesmo caso).
- Tela de entrada: as três frases presentes em `Entrar.tsx` são exatamente as do pacote (expirou, encerrada, desativada), a de conta desativada em tom de perigo, as outras em alerta; a seção 23 confere a frase certa por motivo.

## Cenários negativos

- `/auth/entrar` com conta desativada e senha certa: mesma recusa genérica da senha errada e do e-mail inexistente (sonda, corpo idêntico).
- Conta desativada de A contra ocorrência de B: o mesmo 403 de uma ocorrência própria ou inexistente (sonda).
- Conta ativa de B contra ocorrência de A: 404 (sonda).
- Código antigo `sessao`: não derruba a sessão no painel (`sessao-e-entrada.test.ts`) e não é aceito por `ehCodigoDeErroDeAcesso` (shared).
- Código fora do catálogo: ver Achados (o negativo pedido não se sustenta para todo caminho de emissão).

## Tentativas de reprovar

1. Tirei `ContaDesativada` da vigência: 4 testes reprovam (`$O/11`).
2. Fiz o painel ler conta desativada como sessão encerrada: 1 teste reprova (`$O/16`).
3. Procurei todos os 401 e 403 que a API emite (`grep` de `code(401)`, `code(403)`, `new FalhaAutenticacao(`, `readonly codigo =`): além dos seis do catálogo e dos da entrada (`credenciais`, `bloqueado`, `senha_provisoria_vencida`), saem 403 `posto_insuficiente` (`servidor.ts:610`, recusa de PERMISSÃO por posto ao gerir usuário) e 403 `assinatura` (URL assinada do armazenamento, sem token). O primeiro é erro de acesso pela definição do próprio catálogo ("autenticação, vigência e permissão") e não está nele.
4. Emiti um código fora do catálogo por literal (`$O/22`): o teste de catálogo não reprova. O leitor do teste só olha `new FalhaAutenticacao("...")` e `readonly codigo = "..." as const`; não olha `send({ erro: "..." })` nem `new RegraDeNegocio("...", ..., 401 ou 403)`.
5. Conferi o guia do coordenador contra o comportamento atual (ver Achados).
6. Conferi o `INDEX.md` byte a byte contra os blobs do commit, independente do script do repositório: bate.

## Achados

1. **FAIL (critério negativo da etapa e documentação que a etapa escreveu).** A etapa pede "código fora do catálogo reprova o teste de catálogo", e o catálogo (`packages/shared/src/codigos-de-erro.ts`, cabeçalho) e o README (linha 146) afirmam que `apps/api/test/codigos-de-erro.test.ts` "confere que o servidor emite exatamente isto: código novo no servidor sem entrar aqui reprova". Não é verdade em `bb0f654`:
   - Hoje: `servidor.ts:610` responde `403 { erro: "posto_insuficiente" }`, recusa de permissão, fora do catálogo, e o teste está verde.
   - Reprodução: em `dc360/apps/api/src/servidor.ts`, trocar `send({ erro: "posto_insuficiente"` por `send({ erro: "inativo"` e rodar `npx vitest run --root apps/api test/codigos-de-erro.test.ts`: 22 de 22 verdes (`$O/22`). Restaurar com `git restore`.
   - Impacto: o catálogo é o contrato que o painel, o aplicativo e a fila (E06 e E07) leem, e a F02-E03 herda; um código de acesso novo emitido por literal ou por `RegraDeNegocio` com 401 ou 403 passa sem o portão que a documentação promete. O comportamento de hoje para o usuário não muda (o cliente trata `posto_insuficiente` como erro comum, que é o certo).
   - Conserto mínimo sugerido: ou o portão passa a ser comportamental (capturar o corpo de todo 401 e 403 que a suíte da API produz, por um gancho `onSend` no servidor de teste, e exigir catálogo ou lista explícita da entrada), ou o leitor passa a pegar também `send({ erro: "..." })` com 401 e 403 e `RegraDeNegocio` com esses status; e `posto_insuficiente` entra no catálogo ou é listado com motivo como fora dele, e o README e o cabeçalho dizem o que o portão cobre de fato.
2. **Corrige antes de crescer (documentação desmentida pelo código atual).** `dc360/docs/GUIA-DO-COORDENADOR.md`, linhas 162 e 163 (escritas pela E05 em 2026-10-06, `git blame`): "Quando só a sessão foi encerrada (por você, em 'encerrar sessões', ou por uma troca de papel), a frase é outra, 'Sua sessão foi encerrada', e entrar de novo resolve." Desde a E07 a troca de papel NÃO encerra a sessão: a escrita seguinte responde 401 `nao_autenticado`, o painel renova e repete em silêncio, sem tela de entrada (seção 24 do e2e: "a escrita passa, sem mandar a pessoa para a entrada"; sonda: papel diferente dá 401 `nao_autenticado` e a renovação devolve 200 com o papel novo). A frase "ou por uma troca de papel" precisa sair. A parte sobre conta desativada, que é o que a etapa pede ao guia, está certa.
3. Anotado: `/auth/renovar` com sessão encerrada responde a frase "Sessão expirada. Entre novamente." (`auth/servico.ts:793`, `:824`, `:914`, `:1090`), diferente da mensagem do catálogo para `sessao_encerrada`. O código é o contrato e o catálogo admite frase da rota; registrado porque "expirada" é justamente o que a E05 quis distinguir de "encerrada".
4. Anotado: senha atual errada em `/auth/trocar-senha` responde 401 `credenciais`; o painel, por ver 401, renova e repete uma vez antes de mostrar o erro. Não derruba a sessão (`credenciais` não está no catálogo), mas gasta uma rotação. Anterior à etapa.

## Não verificado

- O run do CI (39143791434) não foi lido.
- PostgreSQL 17: a API rodou com o banco em memória da semente; `test:isolamento` no 18.3 local.
- Aplicativo de campo em aparelho ou emulador: só os testes de componente e de módulo (`token.test.ts`, `pausa-de-sessao.test.ts`), verdes.
- Capturas das três frases e leitura por leitor de tela: são das dimensões UX e acessibilidade e da validação humana; não as julguei.
- Não testei a frase da tela de entrada em todos os navegadores (só Chromium, pelo e2e).

## Risco residual

- Enquanto o portão de catálogo não for comportamental, um código de acesso novo pode sair do servidor sem passar pelo catálogo (achado 1).
- Coordenador que leia o guia esperará que rebaixar alguém o mande à tela de entrada, o que não acontece (achado 2).
- Leitura com token vivo de conta desativada segue até 15 minutos (F03-E03), declarado.

## Motivo do humano

Texto de produto: Rafael lê e aprova as três frases da tela de entrada do painel ("Sua sessão expirou...", "Sua sessão foi encerrada... ou quando o seu cadastro muda...", "Sua conta foi desativada. Entrar de novo não resolve: procure a coordenação do seu município...") e as mensagens da API do catálogo para `sessao_encerrada` e `conta_desativada`. É a validação humana que a etapa pede e a seção 4 de `28` mantém humana. Conferi apenas que as frases do código são as do pacote e que cada uma aparece no motivo certo.
