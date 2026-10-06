# V2-F00-E08: Fechar vazamentos P0 de leitura ao agente (GET /oficios, GET /oficios/:id, GET /avisos)

Situação: IMPLEMENTADA E MEDIDA em 2026-10-06; FALTA A VALIDAÇÃO HUMANA (Rafael vê a sonda do agente antes e depois, ver abaixo). Por isso a etapa está EM ANDAMENTO no STATUS e o item "vazamentos de leitura ao agente" do G00 não foi marcado (só se marca no próprio gate).

## O que foi entregue

Pacote compartilhado:
- `packages/shared/src/permissoes.ts`: ação nova `consultar_oficio` (em `ACOES`, em `ROTULO_ACAO` como "consultar os ofícios de encaminhamento" e em `PERMISSOES`), concedida a operador, coordenador e administrador, e NÃO ao agente de campo. A regra mora no shared, não num `if` de papel na rota. O operador consulta mas continua sem emitir (`emitir_documento`) e sem enviar (`encaminhar_providencia`).

API:
- `apps/api/src/rotas/oficios.ts`: `GET /oficios` e `GET /oficios/:id` passam por `autorizar(..., "consultar_oficio")` (autenticação mais `exigirPermissao`) ANTES de abrir transação e antes de validar o id. O agente recebe 403 `sem_permissao`, igual para ofício que existe, que não existe e que é de outro município (a resposta não confirma nada). Ofício de outro município, para quem tem a ação, segue 404 (RLS).
- `apps/api/src/rotas/avisos.ts`: `GET /avisos` aplica `eRecorteDoAgente(quem, "o", params)` na lista E na contagem de não lidos (que agora junta `ocorrencias`, como a lista). Sem o recorte na contagem o número do sino denunciava os avisos que a lista esconde. Agente sem equipe: lista vazia e `naoLidos` 0. Coordenação, operador e administração não mudam.
- `POST /avisos/lidos` (acréscimo mínimo, mesma causa): o agente só marca o que pode ver. Antes, `marcados: 1` confirmava a ele que o aviso de outra equipe existe. Fora do recorte responde `marcados: 0`, igual a identificador de outro município.
- A escrita dentro do `GET /avisos` CONTINUA (idempotente, em lote, só no município do token), como a etapa manda, e foi registrada em `apps/api/PENDENCIAS.md` com o caminho (F07-E03 e F04-E11). Um teste a fixa.

Painel:
- `apps/web/src/paginas/Ocorrencia.tsx`: só chama `listarOficios` e só desenha o cartão "Ofícios de encaminhamento" quando o papel tem `consultar_oficio`. Sem isso o 403 derrubaria a página inteira do dossiê do agente (o `Promise.all` rejeita junto).
- `apps/web/src/dados/local.ts` (modo de demonstração): `listarOficios` e `detalharOficio` recusam por papel, como a API.

Testes (novos):
- `apps/api/test/leitura-do-agente-oficios-e-avisos.test.ts` (14 casos): agente 403 na lista (com e sem filtro) e na ficha (ofício da equipe dele, de outra equipe, de outro município e id inexistente; sem e-mail, observações nem IP no corpo); agente de outro município também 403; sem token 401; operador, coordenador e administrador 200 com o conteúdo de sempre; coordenador de outro município 404 e lista sem o ofício de Serra Alta; sino do agente da Alfa e da Bravo iguais ao oráculo calculado no banco; contagem de não lidos igual à lista; agente sem equipe vazio e 0; coordenação, operador e administração com o município inteiro; aviso de outro município nunca aparece; marcar como lido não funciona como oráculo; a escrita do GET segue idempotente.
- `packages/shared/test/permissoes.test.ts` (+3), `apps/web/test/oficio-so-para-quem-consulta.test.ts` (4: modo local e fonte da tela), seção 25 de `apps/web/test/fluxo-api.e2e.mjs` (14 verificações, API real mais navegador).
- Nenhum teste existente foi reescrito ou enfraquecido (só um comentário em `sino-de-avisos.test.ts`).

Documentação: `dc360/README.md` (tabela de permissões, seção "Autorização por papel", número de verificações do e2e de 112 para 126), `dc360/docs/PAPEIS_E_RESPONSABILIDADES.md`, `dc360/apps/api/PENDENCIAS.md`, `dc360/scripts/baseline.mjs` (esperado por etapa: API +14, shared +3, web +4).

## A sonda, antes e depois

Antes do conserto (testes novos contra o código da E07, `saidas/01-sonda-antes-do-conserto-vitest.txt`): 9 dos 14 casos reprovam e 5 passam (as guardas que já valiam: 401 sem token, 200 de quem consulta, 404 de outro município, aviso de outro município, coordenação com o município inteiro).

Sonda HTTP contra a API semeada (`sondas/sonda-agente-http.mjs`; antes rodada com as duas rotas do `HEAD` temporariamente no lugar, depois com o código novo):

| Pedido com o token do agente Diego (Equipe Alfa) | Antes | Depois |
| --- | --- | --- |
| `GET /oficios` | 200 com o ofício do município | 403 `sem_permissao` |
| `GET /oficios/:id` | 200 com a ficha completa (e-mail do órgão e IP de quem abriu o link quando existem) | 403 `sem_permissao` |
| `GET /avisos`, avisos de outra equipe na lista | 1 de 3 (protocolo 000473/2026, que é da Bravo) | 0 de 2 |
| `GET /avisos`, `naoLidos` | 3, contando o aviso que não é da equipe dele | 2, igual à lista dele (o município tem 3) |

Saídas: `saidas/03-sonda-http-antes.txt` (RESULTADO: VAZAMENTO, sai com 1) e `saidas/04-sonda-http-depois.txt` (RESULTADO: fechado, sai com 0). Na sonda "antes" o e-mail do órgão aparece nulo porque o órgão semeado não tem e-mail; o vitest cadastra um e prova o conteúdo (`orgao_email` e `aberturas[0].ip` voltam a quem consulta e nunca ao agente).

Para reproduzir (Rafael): `npx vitest run --root apps/api test/leitura-do-agente-oficios-e-avisos.test.ts` passa 14 de 14. Para ver o ANTES, em `apps/api/src/rotas/oficios.ts` troque `autorizar(app, req, "consultar_oficio")` por `app.exigirAutenticacao(req)` nas duas rotas de leitura, e rode o mesmo arquivo: os casos do agente em ofício reprovam. Restaure e rode de novo.

## Resultados medidos (2026-10-06)

| Passo | Antes (E07) | Depois |
| --- | --- | --- |
| `npm run test:api` | 1154 testes, 1 falha (laudo do pacote, E12), 13 pulados | 1168 testes, 1 falha (a mesma), 13 pulados; 1154 passam (14 novos) |
| `npm run test:isolamento` | 330 (327 e 3 pulados) | 330, igual (nada de banco mudou) |
| `apps/api/test/superficie.test.ts` | 9 de 9 | 9 de 9 |
| `packages/shared` | 159 com 1 falha pré-existente (E20) | 162 com a mesma 1 falha (3 novos) |
| `packages/campo` | 187 | 187 |
| `apps/web` | 559 com 14 falhas (E09, E13, E21) | 563 com as MESMAS 14 (4 novos) |
| `apps/console` | 259 | 259 |
| `typecheck` (todos os pacotes) | verde | verde |
| `test:scripts` | 198 com 3 falhas (E17), 4 pulados | igual |
| `baseline.test.mjs` e `portao-de-skip.test.mjs` | 33 de 33 | 33 de 33 |
| `conferir:numeros` | 13 afirmações | 13 (o README foi corrigido de 112 para 126 no mesmo passo: a seção 25 somou 14 verificações) |
| `baseline.mjs --so=teste-shared,teste-db,teste-campo-pacote,teste-api,teste-web` | | 5 de 5 `confere` (`saidas/baseline-depois/`) |
| `regras-de-conteudo.test.ts` | só as linhas pré-existentes | só elas |
| E2E, seção 25 | | 14 de 14 `OK`, zero erro de console (`saidas/05-e2e-secao-25-depois.txt`) |

Não rodado, e por quê: o jest do app de campo, porque o contrato do app não mudou (a resposta de `GET /avisos` e `POST /avisos/lidos` tem o mesmo formato; o app não usa ofício); `npm run test:e2e:api` completo, porque cai na seção 13 (CORS do PUT, E18) igual ao baseline, e por isso a seção 25 foi provada numa cópia aparada do arquivo (`sondas/e2e-aparado-secao-25.mjs`: cabeçalho, ajudantes e a seção) contra uma API recém-semeada e o painel construído.

## Capturas reais (Playwright, Chromium)

`capturas/`: o dossiê da ocorrência 000474/2026 (Equipe Alfa, com providência para a Secretaria de Obras e ofício emitido) em 1280 e 390, claro e escuro. `agente-dossie-*`: Diego, agente de campo, abre a página sem faixa de erro e SEM o cartão "Ofícios de encaminhamento". `operador-dossie-*`: Jonas, operador de plantão, vê o cartão com o ofício 000001/2026. Portão visual: nada desalinhado, grudado ou cortado nas telas novas; a etapa não cria tela nem texto novo (só deixa de desenhar um cartão). Observações fora do escopo, já existentes: no celular a tabela "Providências encaminhadas" rola na horizontal e corta a coluna da direita; e a barra de menu fixa do celular aparece no meio da imagem só porque a captura é de página inteira. Não há estado vazio nem de erro novos para capturar.

## Decisões e premissas (também no STATUS, seção 9)

1. O agente recebe 403 (e não 404) nas rotas de ofício: é negação da AÇÃO, igual para qualquer id, existente ou não, então não confirma nada; é o que a etapa pede. Recurso de outro município segue 404.
2. A permissão é conferida ANTES da validação do id, para o agente não distinguir 403 de 422 e deduzir o que a rota lê.
3. `POST /avisos/lidos` também ganhou o recorte (acréscimo mínimo da mesma causa); a rota não ganhou `exigirPermissao`, porque o sino segue sendo de todo papel.
4. O operador entra em `consultar_oficio` (a etapa manda), mesmo sem poder emitir nem enviar.
5. `GET /orgaos` (catálogo, com e-mail de cada órgão) também exige só autenticação e responde ao agente. Fora do escopo desta etapa; fica como achado para a F04 ou a F03-E12 (manifesto rota x ação).

## Limitações

- A escrita dentro do `GET /avisos` continua, e o token do agente também a dispara (só o que ele LÊ de volta mudou). Fecha na F07-E03 e na F04-E11.
- A vigência continua só na escrita: o agente desativado ainda LÊ avisos até o token vencer (F03-E03).
- O papel antigo ainda lê por até 15 minutos depois de rebaixado: um coordenador rebaixado a agente continua consultando ofício até o token vencer (a vigência é só de escrita até a F03-E03).
- A prova do app de campo é só a de contrato (formato igual); sem aparelho.
- O CI não foi rodado (repositório privado, `gh` sem login).
- O diff `diff-da-etapa.patch` traz só os arquivos de produto e teste da etapa; nos arquivos já alterados por etapas anteriores (nada está commitado) vêm só os trechos da E08 nos que foram editados por mim, mas `Ocorrencia.tsx` e `local.ts` podem trazer trechos de etapas anteriores.

## O que falta

- Validação humana: Rafael vê a sonda do agente antes e depois (200 com ofício, 403 depois) e as capturas.
- Item "vazamentos de leitura ao agente" do G00: só no gate.
- Implantação: a E08 não tem migração; vai com o código da API e do painel.

## Premissas assumidas

Ver STATUS, seção 9 (V2-F00-E08).
