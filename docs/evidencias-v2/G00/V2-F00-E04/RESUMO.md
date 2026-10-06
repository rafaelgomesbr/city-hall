# V2-F00-E04: Religar a vigência de conta, papel e sessão na escrita e tirar o skip

Situação: IMPLEMENTADA E MEDIDA em 2026-10-06; FALTA A VALIDAÇÃO HUMANA (Rafael vê a sonda antes e depois, ver abaixo). Por isso a etapa está EM ANDAMENTO no STATUS e o item "vigência" do G00 não foi marcado (só se marca no próprio gate).

## O que foi entregue

- `dc360/apps/api/src/servidor.ts`: `exigirAutenticacao` voltou a chamar `lerVigencia` e `exigirVigencia` na escrita (método que não é GET nem HEAD), na mesma ida ao banco que já conferia a suspensão; a marca de senha provisória passa a vir do banco (`senhaProvisoriaAte !== null`). O bloco "DESLIGADO" virou a explicação do que a conferência faz e do histórico (commit b4439ac, 2026-09-17).
- `dc360/apps/api/test/vigencia-na-escrita.test.ts`: `describe.skip` e a marca T42 saíram; cabeçalho ganhou o histórico; quatro casos novos de borda (município suspenso com conta desativada responde a suspensão primeiro; token com o `sid` de outra pessoa nega; B continua sem ver a ocorrência de A, 404, com a vigência ligada; senha provisória vem do banco, nos dois sentidos).
- `dc360/apps/api/test/api.test.ts`: o teste de reuso de renovação passa a fazer login de novo da Helena no fim, porque o reuso derruba todas as sessões dela e agora o token morre de verdade (registro em `docs/DECISOES-DE-TESTE-DA-FASE-00.md`). Nenhuma asserção enfraquecida.
- `dc360/scripts/portao-de-skip.test.mjs`: o teste que exigia a marca da vigência passou a exigir o contrário (nenhum skip incondicional marcado resta); mesma contagem de testes (17).
- `dc360/scripts/baseline.mjs` e `baseline.test.mjs`: esperado de `teste-api` agora é a base da E01 mais as mudanças declaradas por etapa (`MUDANCAS_DO_TESTE_API_POR_ETAPA`): total 1113, falhas 1, puladas 13. `node scripts/baseline.mjs --so=teste-api` confere (`baseline-teste-api/`).
- Documentação: `dc360/README.md` (linha do token de acesso), `dc360/apps/api/PENDENCIAS.md` (leitura segue fora da vigência até F03-E03; códigos de erro até E05 e E06), comentários de `auth/sessoes.ts`, `auth/suspensao.ts` e `auth/vigencia.ts` já descreviam a regra ativa e agora batem com o código (nenhuma edição foi necessária neles).

## A sonda, antes e depois

Antes do conserto (arquivo desbloqueado, `servidor.ts` sem a chamada, `saidas/02-sonda-antes-do-conserto.txt`): 6 reprovam e 7 passam de 13.

| Sonda | Antes | Depois |
| --- | --- | --- |
| conta desativada escreve com o token vivo | 200 (reprova) | 401 `sessao` |
| papel rebaixado escreve como o papel do token | 200 (reprova) | 401 `sessao` |
| sessões encerradas por quem administra ainda escrevem | 200 (reprova) | 401 `sessao`; a de quem clicou em "Minha conta" sobrevive |
| escrita com sessão encerrada (e leitura com token vivo continua 200) | 200 (reprova) | 401 na escrita, 200 na leitura |
| token com `sid` de outra pessoa | 200 (reprova) | 401 `sessao` |
| senha provisória: marca no token sem prazo no banco / prazo no banco sem marca | 403 onde devia ser 200 (reprova) | 200 e 403 `troca_de_senha_obrigatoria` |
| município suspenso com conta desativada | 403 `acesso_suspenso` | 403 `acesso_suspenso` (já passava, fica como guarda) |
| B escreve na ocorrência de A | 404 | 404 (já passava, fica como guarda) |
| rotação de renovação não expulsa | passa | passa |

Depois: `saidas/` (arquivo da vigência passa 13 de 13; ver `03-api-completa-depois.txt`).

Para reproduzir (Rafael): em `dc360`, `git stash` do `servidor.ts` ou apagar as duas linhas de `lerVigencia` e `exigirVigencia` e rodar `npx vitest run --root apps/api test/vigencia-na-escrita.test.ts` (reprova); restaurar e rodar de novo (passa).

## Resultados medidos

| Passo | Antes (baseline da E01, repetido hoje) | Depois |
| --- | --- | --- |
| `npm run test:api` | 1109 testes, 2 falhas, 18 pulados | 1113 testes, 1 falha, 13 pulados (1099 passam) |
| falhas da API | senha provisória (E07) e laudo do pacote (E12) | só o laudo do pacote (E12): o de senha provisória ficou verde sozinho |
| pulados | 18 = 13 de `banco-tls` + 5 da vigência | 13 de `banco-tls` |
| `npm run test:isolamento` | 318 testes, 3 pulados (E01) | 318 testes: 315 passam, 3 pulados (`04-isolamento.txt`) |
| `apps/api/test/superficie.test.ts` | dentro da API | 9 de 9 isolado |
| `npm run test:e2e:api` | 40 `OK`, cai na seção 13 (CORS do PUT, E18) | 40 `OK`, cai na mesma seção 13 |
| `npm run test:scripts` | 198, 3 falhas (E17) | 198, 3 falhas (E17) |
| `node --test scripts/baseline.test.mjs scripts/portao-de-skip.test.mjs` | verde | 33 de 33 |
| `npm run typecheck --workspace @dc360/api` | verde | verde |
| `regras-de-conteudo.test.ts` | só as linhas pré-existentes | só elas (`trilha-detalhe.test.ts:181`, `AUDITORIA-2026-09-30.md:313`, `auditoria-v2/raw/teste-shared.txt`) |

Das duas rodadas completas da API com o ajuste de fixture, uma teve `resolver-link.test.ts` vermelho (a espera fixa de 20 ms, classe F da E03); isolado passou 2 de 2, e a rodada seguinte, a arquivada em `03-api-completa-depois.txt`, fechou sem ele.

Ao ligar a vigência, 26 testes de `api.test.ts` reprovaram com 401 (o token da Helena morre no teste de reuso), e foram resolvidos pelo ajuste de fixture acima; nenhum outro teste da API precisou mudar.

## Limitações

- O E2E de navegador ("desativar um usuário no painel e ver o próximo POST dele falhar") NÃO foi feito: o caminho da API foi coberto por `inject` (o PATCH de situação seguido da escrita com o token vivo) e o e2e do painel só cobre a tela na E05. O `e2e-api` ainda cai na seção 13 (E18).
- A vigência vale só na ESCRITA. Leitura (e `GET /avisos`, que escreve) segue pela assinatura do token até a F03-E03.
- O erro é `401 sessao` para os três casos. A E05 separa os códigos e a E06 faz a fila do campo tratá-los: NÃO implantar a E04 sozinha em produção, o campo lê 401 como falha permanente.
- A suíte `banco-tls` continua falhando na carga do arquivo (E21).

## O que falta

- Validação humana: Rafael vê a sonda reproduzida antes e depois.
- Item "vigência" do G00: só no gate.
