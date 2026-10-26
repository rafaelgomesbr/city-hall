---
validador: privacidade-lgpd (general-purpose com o papel da dimensão)
modelo: claude-sonnet-5-5
etapa: V2-F00-E15
sha_validado: bb0f654
ci_run: ausente (39143791434 citado pelo implementador, não lido)
rodada: 4
herdado_de:
tags: [MOBILE, OFFLINE, A11Y, LGPD]
nivel_de_prova_exigido: [E1, E2, E3a]
nivel_de_prova_obtido: [E1, E2, E3a]
veredito: PASS
confianca: media
humano_necessario: sim
escalar: nenhum
---
Aviso: não sou advogado e isto não é parecer jurídico. Cobre a parte técnica (inventário, fluxo, controles, evidência). Base legal, controlador e operador, DPO e prazo de retenção ficam para pessoa. `$SP` é `/private/tmp/claude-501/-Users-rafaelgomes-Documents-city-hall/ded47d25-806d-4495-ac61-f9e84518cc35/scratchpad/validadores/privacidade-lgpd-e09-e10-e11-e15-e17`. Nada foi herdado; tudo foi executado nesta rodada no HEAD `0290af5` (produto de `bb0f654`). A prova de app é jest com SQLite real do Node no lugar do `expo-sqlite`, e dublê do disco: não houve emulador nem aparelho, por isso a confiança é média e a etapa é de risco alto (ver "Não verificado").

## Critérios verificados

Critérios da E15 que tocam dado pessoal, e o que o bloco chama de regra de privacidade ("quem entra depois não vê o dado de quem saiu"):

1. O diálogo "Sair da conta?" conta e diz o que sair apaga (rascunhos, fotos, assinatura), com singular e plural, sem expor o conteúdo; sem rascunho e sem fila volta à frase curta.
2. Sair da conta apaga o dado local do turno (rascunhos, lista de tarefas em cache, lápides de coleta, marca de dono, fotos de perfil, arquivos de prova que a fila não usa), e mantém a fila (coleta já feita no morro) sob carimbo de autor.
3. Outra pessoa que entra no aparelho recebe o aparelho limpo (`acolherNoAparelho`); a mesma pessoa que volta de sessão vencida reencontra a vistoria.
4. A precisão de GPS abaixo de 0,5 m vira 1 e o esquema continua recusando 0 e negativo, com frase em português (minimização: nenhum dado novo).
5. Nada de dado pessoal em log do aplicativo; credencial em armazenamento seguro; backup automático do Android desligado.
6. A troca de conta com pedido em voo não faz a credencial de uma pessoa sair com a identidade de outra.
7. O que o próprio produto declara que fica no aparelho depois de sair está declarado e delimitado.

## Evidência

Inventário dos dados pessoais que o aparelho guarda (código de `apps/campo/src/dados/banco-local.ts`, `rascunho.ts`, `sessao.tsx`):

| Dado | Onde | Sai no "Sair da conta"? |
| --- | --- | --- |
| rascunho de vistoria (checklist, observações, nome de quem assina, coordenada), fotos e assinatura em disco | tabela `rascunhos` e arquivos `foto-*.jpg`, `assinatura-*.png` | SIM (apagados), salvo arquivo que a fila usa |
| lista de tarefas em cache (JSON da ocorrência: endereço, contato do cidadão, vulnerabilidade) | tabela `pendencias` | SIM |
| lápides de coleta (protocolo, horário) | tabela `coletas` | SIM |
| marca de dono dos dados locais | tabela `marcas` | SIM (junto com o dado) |
| fila de sincronização (coleta pronta e não enviada, com autor carimbado) | tabela `fila_sincronizacao` e seus arquivos | NÃO, de propósito (perda de dado do campo é inegociável); só sobe com a conta do autor |
| tema claro/escuro | `preferencias` | não é dado de pessoa |
| credenciais e identidade | `expo-secure-store` (`WHEN_UNLOCKED_THIS_DEVICE_ONLY`) | SIM |
| ficha de push | guardada pelo módulo de push | calada no servidor e esquecida no aparelho depois de usada |

Controles e linhas: `banco-local.ts:200-300` (dono e `acolherNoAparelho`), `:300-392` (`apagarDadosLocais`), `dados/sessao.tsx:168-215` (`sair`, `encerrarSessaoVencida`), `dados/aviso-da-saida.ts:31-104` (texto do diálogo; recebe contagens, nunca o conteúdo), `app.config.ts:396-398` (`allowBackup: false`). Logs do app: `grep console.` encontra 7 chamadas, todas com `erro` como objeto, nenhuma com rascunho, token ou coordenada.

Execuções desta rodada:
- E1: jest do app em 8 arquivos, 58 testes, código 0 (`$SP/jest-e15.txt`): `aviso-da-saida`, `sair-e-entrar-nao-perde-a-coleta` (SQLite real: mesma pessoa reencontra, outra pessoa recebe limpo, fila intacta byte a byte e `pendente`), `dialogo-na-conta-com-vistoria-comecada`, `dialogo-na-conta`, `precisao-do-gps`, `token`, `troca-de-conta-com-pedido-em-voo`, `logout-cala-o-aparelho`.
- E2, sonda de falha no meio da limpeza (minha, `$SP/jest/sonda-limpeza.test.ts`, executada com `jest --roots` apontando para o scratchpad para não tocar o repositório; saída `$SP/jest-sonda-limpeza.txt`): SQLite real do Node, a Ana deixa rascunho, tarefa em cache e lápide e é dona da marca; falho UMA instrução do `DELETE` por vez e o Bruno entra (`acolherNoAparelho`):
  - falha em `DELETE FROM rascunhos`: `apagou: true`, sobram rascunho, tarefa e lápide da Ana, e a marca passa a ser do Bruno;
  - falha em `DELETE FROM pendencias`: `apagou: true`, sobram a tarefa (JSON com endereço, solicitante e vulnerabilidade) e a lápide, marca do Bruno;
  - falha em `DELETE FROM marcas`: `apagou: true`, sobra a lápide, marca do Bruno;
  - falha em `DELETE FROM coletas`: `apagou: true`, sobra a lápide, marca do Bruno;
  - controle positivo sem falha: aparelho limpo, marca do Bruno (passa).
  As 4 asserções de privacidade falham de propósito; o controle passa. É o Achado 1.
- Provas de que o teste morde (mutação, desfeita com `git restore`, árvore limpa conferida): M7 retirar `DELETE FROM rascunhos` de `apagarDadosLocais`: 2 testes reprovam (`$SP/mut-e15-m7.txt`); M8 `contarRascunhos` devolvendo 0 vistorias: 8 de 16 reprovam (`$SP/mut-e15-m8.txt`); M9 `acolherNoAparelho` nunca apagando: reprova "o Bruno entra: o rascunho da Ana é limpo" (`$SP/mut-e15-m9.txt`).
- Evidência arquivada da etapa (fora de `validacao/`): varredura por JWT, `Bearer`, chave, URL com credencial e CPF: nada.

## Cenários positivos

- Diálogo com 1 e com N vistorias, com e sem foto e assinatura, e a frase curta quando não há nada (testes, 10 casos de `aviso-da-saida`).
- Outra pessoa entra e recebe o aparelho limpo; a mesma pessoa que volta de sessão vencida reencontra a vistoria e a fila.
- Precisão 0,3 vira 1 e 12,4 vira 12; ausente fica `null`; o esquema recusa 0 e negativo em português.

## Cenários negativos

- Fila e arquivos da fila não são apagados no logout; coleta de outro autor aparece só como "Coletada por <nome>" com o protocolo, sem endereço nem solicitante (leitura de `fila.tsx` 369-395, 1228-1229); não sobe com a credencial de quem entrou depois.
- Sessão vencida não apaga nada (regra mantida).
- Limpeza que falha: o resultado das 4 injeções acima (Achado 1).

## Tentativas de reprovar

1. Troca de conta: cobri o caminho feliz com o teste existente e o meu controle. Passa.
2. Limpeza que falha no meio (pedido do gatekeeper): reproduzi em 4 pontos. A função devolve `apagou: true` e carimba o dono novo mesmo quando a limpeza não aconteceu, de modo que o dado da conta anterior (rascunho, tarefa com dado do cidadão, lápide) passa a ser do dono novo. Reproduzido, ver Achado 1.
3. Arquivo de prova quando a fila não pode ser lida: pelo código (`banco-local.ts` 366-370, mensagem "Arquivos de prova preservados"), todos os PNG e JPEG de prova ficam no disco; é decisão de segurança de dado do campo, mas deixa dado do turno anterior no armazenamento do app.
4. Dado do outro agente visível ao seguinte pela fila: a UI mostra nome do autor e protocolo e permite descartar a coleta dele depois de confirmação (`podeDescartar`). Não vi endereço, contato nem vulnerabilidade na tela de outro autor. Os dados completos (envelope com CPF e coordenada) continuam no SQLite do aparelho sem prazo, e isso já está registrado como achado aberto em `apps/campo/PENDENCIAS.md` (correção 1 da E15, itens 1 a 5).
5. Backup: `allowBackup: false` no Android; no iOS não achei exclusão de backup do diretório de documentos (Achado 3).
6. Log do app com dado pessoal: 7 chamadas de `console`, nenhuma com conteúdo.
7. Mutar o conserto (M7, M8, M9): os testes reprovam; o teste morde.
8. Credencial de uma pessoa com identidade de outra por pedido em voo: o teste `troca-de-conta-com-pedido-em-voo` passa; não tentei corrida no aparelho.

## Achados

1. **corrige antes de crescer, e é item 3 da seção 7 de `28` (vazamento de dado pessoal entre agentes, sem risco aceito), bloqueia piloto. Fora do critério desta etapa, e já registrado pela rodada 3 (dono F14-E02).** `acolherNoAparelho` falha aberto: se a limpeza falha no meio, devolve `apagou: true`, carimba o dono novo e o dado da conta anterior fica sob o novo dono. Reprodução independente, E2, nesta rodada: `$SP/jest-sonda-limpeza.txt` (4 pontos de injeção; comando: `cd dc360/apps/campo && npx jest --rootDir=. --roots=$SP/jest --modulePaths=$PWD/node_modules --testMatch='**/sonda-limpeza.test.ts'`, código 1 por desenho). Por que não reprovo a E15: o bloco diz "a etapa só avisa, não muda a regra" e o conserto está pedido para a F14-E02 (que ainda não tem o critério de falha fechada nem de injeção de disco, segundo `docs/roadmap-v2/pendencias-humanas.md`). Peço ao gatekeeper que mantenha o registro sem risco aceito e a condição de bloqueio de piloto.
2. **anotado (já registrado).** Fila e arquivos dela ficam sem prazo no aparelho, inclusive com outro agente logado; coordenada com 6 casas; resíduo de WAL; original da câmera no cache. Tudo em `apps/campo/PENDENCIAS.md` (correção 1 da E15), com donos F05-E09, F05-E10, F14-E02, F14-E04, F14-E15. Não reabri.
3. **anotado.** Backup do iOS: não encontrei `isExcludedFromBackup` nem equivalente para o banco local e os arquivos de prova (só `allowBackup: false` para Android). No iOS, o diretório de documentos é incluído em backup por padrão, o que levaria rascunhos e assinaturas para o backup do aparelho. Não verifiquei em aparelho; vira F14-E04.
4. **anotado.** Em `sessao.tsx` o `sair()` espera `apagarDadosLocais()` dentro de `Promise.all` junto de `guardar(..., null)`; se `guardar` lançar, a sessão do servidor não é encerrada e a ficha de push não é calada. Raro (apagar item de armazenamento seguro), não reproduzido.

## Não verificado

- Aparelho físico e emulador: o app Expo não renderiza no ambiente do agente; os dois fluxos pedidos pela etapa no aparelho (diálogo, GPS abaixo de 0,5 m sem 422) ficam para pessoa, e a prova física é F14-E12.
- `expo-sqlite` e `expo-file-system` reais: usei SQLite do Node e dublê de disco; o comportamento de `File.delete` e das instruções `DELETE` num aparelho com disco cheio ou banco bloqueado é inferido.
- Probabilidade real de a limpeza falhar no meio (disco cheio, banco travado, corrida com o envio): não medida.
- Backup do iOS e do iCloud, e o cache da câmera: não verificados em aparelho.
- A suíte completa de jest do app (`npm run test:campo`): rodei os 8 arquivos da etapa; a suíte inteira é da dimensão QA.
- CI do SHA: `ci_run` ausente.
- Texto do diálogo como texto de produto: aprovação do Rafael (seção 4 de `28`).
- Base legal e prazo de retenção dos dados do aparelho: DPO.

## Risco residual

- Alto para o piloto, e já reconhecido: Achado 1 (vazamento entre agentes se a limpeza falhar) e a fila sem prazo no aparelho compartilhado.
- Baixo hoje, porque o app ainda não está em campo.

## Motivo do humano

`humano_necessario: sim`: (a) aparelho físico, para os dois fluxos que a E15 pede ao Rafael e para o backup do iOS (seção 4 de `28`); (b) texto de produto do diálogo "Sair da conta?"; (c) decisão do DPO sobre o prazo de retenção da fila e dos arquivos no aparelho, e se o agente seguinte pode ver nome e protocolo da coleta de outro (CP-24, F14-E02). Eu não decidi nenhum desses pontos.
