# V2-F00-E05: Códigos de erro 401 nao_autenticado, 401 sessao_encerrada e 403 conta_desativada, com catálogo

Situação: IMPLEMENTADA E MEDIDA em 2026-10-06; FALTA A VALIDAÇÃO HUMANA (Rafael lê as três frases mostradas ao usuário e aprova). Por isso a etapa está EM ANDAMENTO no STATUS e o item "códigos de erro corretos" do G00 não foi marcado (só se marca no próprio gate).

## O que foi entregue

- `dc360/packages/shared/src/codigos-de-erro.ts` (novo, exportado por `index.ts`): catálogo `CODIGOS_DE_ERRO_DE_ACESSO` com os seis códigos (`nao_autenticado`, `sessao_encerrada`, `conta_desativada`, `acesso_suspenso`, `troca_de_senha_obrigatoria`, `sem_permissao`), cada um com status, ação do cliente e mensagem padrão, mais `ehCodigoDeErroDeAcesso` e `acaoParaOCodigo`. Código fora da lista (inclusive o antigo `sessao`) é recusado.
- `dc360/apps/api/src/auth/conta-desativada.ts` (novo): `ContaDesativada`, 403, tratada em `setErrorHandler` de `servidor.ts`.
- `dc360/apps/api/src/auth/vigencia.ts`: `Vigencia` ganha `contaDesativada` (conta existe e `ativo = false`, diferente de conta que sumiu); `exigirVigencia` lança `ContaDesativada` ANTES dos demais casos (desativar encerra as sessões, então a ordem inversa daria `sessao_encerrada`, que manda entrar de novo e não resolve) e `sessao_encerrada` nos outros. A suspensão do município continua primeiro.
- `dc360/apps/api/src/auth/servico.ts`: `FalhaAutenticacao` troca `sessao` por `sessao_encerrada` (cinco pontos); `/auth/renovar` de conta desativada responde 403 `conta_desativada` (revogando as sessões como antes); o código solto `inativo` (segundo fator e ativação) virou `credenciais` com a mensagem genérica, o que também mantém a entrada sem vazar estado da conta. `/auth/entrar` não mudou.
- Painel (`apps/web/src/dados/http.ts`, `estado/sessao.tsx`, `paginas/entrar-regras.ts`, `paginas/Entrar.tsx`, `dados/tipos.ts`, `dados/local.ts`): `chamar` reconhece as três respostas pelo catálogo, apaga o token e avisa a tela com o motivo (`expirou`, `encerrada`, `desativada`); a renovação recusada por conta desativada leva ao motivo `desativada` (e não a "expirou"); a tela de entrada mostra a frase de cada motivo. `sessao_encerrada` e `conta_desativada` só derrubam a sessão quando o pedido mandou token (o desafio de segundo fator vencido e o link de redefinição inválido também saem como `sessao_encerrada` e acontecem sem sessão).
- Testes: `apps/api/test/codigos-de-erro.test.ts` (16, novo), `packages/shared/test/codigos-de-erro.test.ts` (10, novo), 7 casos novos em `apps/web/test/sessao-e-entrada.test.ts`, seção 23 em `apps/web/test/fluxo-api.e2e.mjs`; as oito ocorrências do código `sessao` nos testes foram atualizadas (registro em `docs/DECISOES-DE-TESTE-DA-FASE-00.md`).
- `dc360/scripts/baseline.mjs` e `baseline.test.mjs`: o esperado de `teste-api` ganha a linha `V2-F00-E05` em `MUDANCAS_DO_TESTE_API_POR_ETAPA`; o mesmo mecanismo passou a existir para `teste-shared` e `teste-web` (que a etapa também mudou).
- Documentação: `dc360/README.md` (tabela de códigos na seção da API, linha do token e nota da fila), `dc360/apps/api/PENDENCIAS.md`, `dc360/docs/GUIA-DO-COORDENADOR.md` (o que a pessoa desativada vê, e o aviso de não descartar enquanto a E06 não existir).

## Frases mostradas ao usuário (para Rafael aprovar)

Tela de entrada do painel (capturas em `capturas/`):

- Sessão expirou (já existia): "Sua sessão expirou. Entre de novo para continuar de onde estava. Nada do que já tinha sido gravado se perdeu."
- Sessão encerrada: "Sua sessão foi encerrada. Entre de novo para continuar de onde estava. Isso acontece quando o acesso é encerrado em outro aparelho, por quem administra o sistema, ou quando o seu cadastro muda. Nada do que já tinha sido gravado se perdeu."
- Conta desativada: "Sua conta foi desativada. Entrar de novo não resolve: procure a coordenação do seu município. Nada do que você já registrou se perdeu."

Mensagens da API (catálogo): `sessao_encerrada`: "Sua sessão foi encerrada ou o seu cadastro mudou. Entre novamente."; `conta_desativada`: "Sua conta foi desativada. Procure a coordenação do seu município: o que você já registrou continua guardado."

## A sonda, antes e depois

Antes do conserto (código velho de volta: `sessao`, conta desativada como 401, renovação com `inativo`; `saidas/02-sonda-antes-do-conserto.txt`): 8 dos 16 casos de `codigos-de-erro.test.ts` reprovam (sessão encerrada, papel diferente, conta desativada, conta desativada com sessões revogadas, renovação de conta desativada, renovação de sessão encerrada, o par de isolamento e o leitor de fonte do catálogo). Depois: 16 de 16 (`03-api-completa-depois.txt`). Os casos que já passavam antes são guardas: token vencido continua `nao_autenticado`, a leitura com token vivo segue 200, os três códigos que já existiam seguem emitidos, a entrada segue genérica, o 404 de outro município segue 404.

## Resultados medidos

| Passo | Antes (esta sessão, `saidas/antes/`) | Depois |
| --- | --- | --- |
| `npm run test:api` | 1113 testes, 1 falha (laudo do pacote, E12), 13 pulados | 1129 testes (1115 passam), 1 falha (a mesma), 13 pulados (`banco-tls`) |
| `npm run test --workspace @dc360/shared` | 149, 1 falha (travessão pré-existente) | 159, 1 falha (a mesma, só as 3 linhas pré-existentes) |
| `npm run test --workspace @dc360/web` | 550, 14 falhas (E01) | 557, as MESMAS 14 falhas (diferença de lista vazia) |
| `npm run test:isolamento` | 318 (315 e 3 pulados) | 318 (315 e 3 pulados) |
| `apps/api/test/superficie.test.ts` | dentro da API | 9 de 9 isolado |
| `npm run test --workspace @dc360/campo` | 159 | 159 |
| `npx jest --silent` em `apps/campo` | 1801, 20 falhas (E01) | 1801, 20 falhas |
| `npm run test:campo` | cai no typecheck do campo (2 erros, E15/E16) | igual |
| `npm run test:scripts` | 198, 3 falhas (E17), 4 pulados | 198, 3 falhas, 4 pulados |
| `npm run conferir:numeros` | 13 afirmações que não batem | 13 |
| `npm run test:e2e:api` | 40 OK, cai na seção 13 (CORS do PUT, E18) | 40 OK, cai na mesma seção 13 |
| `node scripts/baseline.mjs --so=teste-api,teste-shared,teste-web,teste-db` | n/a | os quatro conferem (`saidas/baseline-depois/`) |
| `npm run typecheck` de api, web e shared | verde | verde |

E2E do painel: a seção 23 de `fluxo-api.e2e.mjs` (duas pessoas, dois contextos de navegador; a coordenação encerra as sessões do Marcos e depois o desativa pelo botão "Desativar"; o próximo pedido dele leva à tela de entrada com a frase certa, token apagado, e a entrada continua com a recusa genérica) NÃO é alcançada pelo roteiro completo porque ele cai na seção 13 (E18). Foi provada numa cópia aparada do arquivo (seções 9 e 23) contra uma API recém-semeada e o painel construído: 16 de 16 `OK` e zero erro de console (`saidas/06-e2e-secao-23-em-api-limpa.txt`). A cópia foi apagada depois.

Capturas reais (Chromium, `capturas/`): as três frases da tela de entrada em 1280 e 390, tema claro e escuro (12 imagens), geradas pelo mesmo fluxo (a sessão expirada com o token corrompido no navegador; a encerrada e a desativada pela coordenação). Portão visual: nada cortado, desalinhado ou grudado; o aviso de conta desativada usa o tom de perigo com ícone e texto, o de sessão encerrada o tom de alerta; no celular as frases quebram em três a sete linhas sem estourar a caixa.

## Compatibilidade e o que NÃO se quebrou

- O app de campo lê o 401 como falha permanente da fila e o 403 também (`packages/campo/src/transporte.ts`), exatamente como antes: 401 `sessao` era permanente, 401 `sessao_encerrada` e 403 `conta_desativada` seguem sendo. Nada piorou, mas a fila ainda não para sem bloquear o item: isso é a E06. Hoje o 403 aparece no aparelho como erro comum (a frase do servidor chega ao item travado), e a lista de hoje o classifica como "outro". NÃO implantar a E04 e a E05 sozinhas em produção. Está avisado em `PENDENCIAS.md` e no guia do coordenador.
- Nenhum outro cliente lia o texto `sessao`: o painel só lia `nao_autenticado`, o campo lê o status. Os 8 testes que o liam foram atualizados.
- Banco, migração e RLS não foram tocados; `npm run test:isolamento` segue 318.

## Limitações

- O E2E completo do painel (`test:e2e:api`) continua caindo na seção 13 (E18). A seção 23 existe no arquivo e foi provada numa cópia aparada, não no roteiro completo.
- O texto das três frases é conteúdo de produto: falta Rafael aprovar.
- Leitura continua pela assinatura do token até a F03-E03: a conta desativada ainda lê por até 15 minutos. Declarado, testado ("leitura com token vivo segue 200").
- O esquema de erro único da API e o catálogo completo (validação, regra de negócio) são da F02-E03; este catálogo cobre só os erros de acesso.
- `npm run test:api` não reconstrói o `shared` (usa o `dist`): depois de mudar `packages/shared/src` é preciso `npm run build:shared` antes, senão a API enxerga o catálogo velho. O roteiro `baseline.mjs --so=...` também não o faz. Não foi alterado aqui (fora do escopo); o passo `typecheck` do roteiro completo já reconstrói.

## O que falta

- Validação humana: Rafael lê as três frases e aprova.
- Item "códigos de erro corretos" do G00: só no gate.
- E06 (fila do campo trata os três códigos sem perder item) é a próxima e é pré-condição para ir a produção.
