# V2-F00-E11: bug `/pacote.zip` e prova do pacote de saída ponta a ponta contra a API real

Situação: IMPLEMENTADA E MEDIDA em 2026-10-06. FALTA a validação humana que a etapa pede
(Rafael baixa o pacote pelo painel com a API local e abre o ZIP). Por isso a etapa está
EM ANDAMENTO no STATUS.

Esta etapa foi INTERROMPIDA em 2026-10-06 por uma pausa pedida por Rafael e retomada no
mesmo dia. O que estava commitado em `5d6bc57` era parcial e NÃO tinha sido validado. Na
retomada tudo foi conferido e rodado de novo, e a conferência encontrou um defeito que o
trabalho parcial tinha introduzido (ver "O que a retomada corrigiu").

## O que foi entregue

Painel (`apps/web`):
- `src/dados/http.ts`: `baixarPacoteDeSaida` chama `POST /saida/pacote.zip` (era
  `/pacote.zip`, sem o prefixo que `servidor.ts` registra: todo clique dava 404 desde o
  commit b793e82, de 2026-09-17) e passa por `chamar`, com a opção nova `arquivo: true`,
  em vez de `fetch` solto. Com isso o download ganha o que o resto do painel já tinha:
  401 de token vencido renova UMA vez e repete, a recusa vira `ErroDaApi` com a frase do
  servidor, e a queda de rede (inclusive no meio da leitura do corpo) vira a frase de
  `SemConexao`. A classe `SemConexao` ganhou a terceira forma, `"arquivo"`: "O arquivo não
  foi baixado" em vez de "O que você preencheu não foi enviado", que mandava a pessoa
  procurar um formulário que não existe.
- `src/paginas/Organizacao.tsx`: o endereço do objeto (`URL.createObjectURL`) só é
  liberado 30 segundos depois do clique, e não logo após `ancora.click()` como antes
  (liberar na hora pode cancelar o download, porque o navegador só lê o endereço quando
  começa a baixar). O relógio vive num `useEffect` com limpeza, de modo que sair da tela
  cancela o temporizador e libera a memória do pacote.

Testes:
- `apps/api/test/pacote-de-saida-contrato.test.ts` (novo, 8 casos) e
  `apps/api/test/ler-zip.ts` (apoio: leitor de ZIP independente do escritor do produto).
  O contrato prende o que o cliente assume: a rota existe só sob `/saida` (a da raiz é 404
  em POST e em GET, e `GET /saida/pacote.zip` também é 404); a organização vem do token e
  não de parâmetro, cabeçalho ou corpo; toda linha de toda tabela é do município de quem
  pediu, conferida uma a uma pelo `organizacao_id` e não por procura de texto; coluna
  proibida não aparece em cabeçalho de CSV nem em chave de JSON e o valor sentinela que a
  própria semente do teste plantou (`aparelhos.ficha`) não aparece em arquivo nenhum; a
  soma SHA-256 de cada arquivo confere e nenhum arquivo falta em `SOMAS-SHA256.txt`; a
  coordenadora recebe 403 `sem_permissao`; município suspenso recebe 403 `acesso_suspenso`
  sem registro de exportação nenhum.
- `apps/web/test/pacote-de-saida.test.ts` (novo, 7 casos): o caminho e o método que o
  cliente manda, o token no cabeçalho, 401 que renova uma vez e baixa com o token novo,
  renovação que não adianta (para, avisa a tela, não entra em laço), 403 `sem_permissao` e
  403 `acesso_suspenso` com a frase do servidor sem derrubar a sessão, rede caída e rede
  que cai no meio do corpo do arquivo.
- `apps/web/test/fluxo-api.e2e.mjs`, seção 28 nova (36 verificações): a administradora da
  semente entra, abre Organização, clica no botão e o NAVEGADOR recebe o arquivo; nome
  `dc360-pacote-de-saida-AAAA-MM-DD.zip`, assinatura `PK`, tamanho maior que zero,
  download sem falha; o ZIP é aberto por leitor independente e o conteúdo conferido
  (índice, `tabelas/ocorrencias.csv`, laudo em `documentos/`, soma de cada arquivo, só
  linhas de Serra Alta, nenhuma citação a Vale Fundo, nenhuma coluna nem tabela de
  credencial); `/pacote.zip` na raiz é 404; 401 no primeiro pedido renova uma vez e baixa;
  o botão diz "Gerando" e fica desabilitado enquanto gera; as três recusas mostram a frase
  do servidor sem derrubar a sessão; e o cartão cabe em 1280 e em 390 px, com 44 px de
  altura de toque.

Documentação: `dc360/docs/SAIDA-DE-MUNICIPIO.md` (capítulo 4, estado da implementação, o
que o painel diz quando o pacote não sai) e `dc360/apps/web/PENDENCIAS.md` (seção 8, o que
ficou de fora). `dc360/scripts/baseline.mjs` ganhou os esperados da etapa (API +8, web +7).

## O que a retomada corrigiu

O trabalho parcial tinha deixado em `Organizacao.tsx` um `setTimeout` solto dentro do
tratador do clique. O portão `apps/web/test/portoes-de-componente.test.ts` ("todo
setTimeout de componente é cancelado no desmonte") reprovava por causa dele, e isso não
tinha sido medido antes da pausa: a primeira rodada da retomada marcou o painel como
DIVERGENTE, com 7 falhas onde o esperado eram 6
(`saidas/baseline-depois/05-teste-web-com-o-temporizador-solto.txt`, achado em
`paginas/Organizacao.tsx:231`). O relógio passou para um `useEffect` com limpeza, e a
segunda rodada fechou em 6 falhas, todas pré-existentes
(`saidas/baseline-depois/07-teste-web-depois-do-conserto.txt`).

## Sonda: falha antes, passa depois

- Painel, `apps/web/test/pacote-de-saida.test.ts`: com o cliente anterior (`fetch` solto
  para `/pacote.zip`), 5 dos 7 casos reprovam
  (`saidas/02-sonda-antes-do-conserto-web.txt`; a sonda trocou o cliente pelo que havia
  antes, `sondas/cliente-anterior.py`). Os 2 de recusa já passavam, porque a recusa chega
  igual pelos dois caminhos. Depois: 7 de 7.
- E2E, seção 28 em cópia aparada com o cliente anterior: 6 verificações passam e a 7ª
  falha, que é a do download (`saidas/03-sonda-antes-do-conserto-e2e.txt`): o clique
  terminava em 404 e nenhum arquivo chegava ao navegador. É a prova de que o defeito
  existia e de que a seção nova o pega.
- API: os 8 casos do contrato passam TAMBÉM sem o conserto do painel, e isso é
  intencional: a API sempre esteve certa, o defeito era do cliente. O contrato existe para
  prender a rota, e a sonda do defeito é a do painel e a do e2e.

## Resultados medidos (2026-10-06, depois de `npm run build:shared`)

| Passo | Resultado | Situação |
| --- | --- | --- |
| `npm run typecheck` | verde (0) | confere |
| `npm run test --workspace @dc360/shared` | 162 testes, 1 falha | confere (a falha é o travessão em arquivo antigo, E20) |
| `npm run test:isolamento` | 330 testes, 0 falhas, 3 pulados | confere |
| `npm run test:api` | 1228 testes, 1 falha, 13 pulados | confere (a falha é o laudo do pacote sem o aviso de equipe, E12; os 13 pulados são `banco-tls`, E21) |
| `npm run test --workspace @dc360/web` (1ª rodada) | 628 testes, 7 falhas | DIVERGENTE: a 7ª era o temporizador solto desta etapa |
| `npm run test --workspace @dc360/web` (2ª rodada, depois do conserto) | 628 testes, 6 falhas | confere (E13: 5, mais `ocorrencia-encerramento`) |
| `apps/api/test/pacote-de-saida-contrato.test.ts` e `saida-de-municipio.test.ts` | 27 testes, 1 falha | a falha é a da E12; os 8 do contrato passam |
| E2E, seção 28 em cópia aparada, Chromium | 36 de 36 `OK`, zero erro de console | verde |
| E2E, seção 28 em cópia aparada, Firefox | 36 de 36 `OK`, zero erro de console | verde |
| `npm run test:e2e:api` completo | para na seção 13 | vermelho PRÉ-EXISTENTE (CORS do PUT de evidência, E18) |

ZIP baixado pelo botão, nas duas rodadas: 109 arquivos; 235 462 bytes no Chromium e
235 430 bytes no Firefox (o tamanho muda porque o pacote carrega o instante da extração).
A lista de nomes e a soma SHA-256 de cada rodada estão em `pacote/`. O arquivo baixado é
apagado pelo próprio teste; nada de dado, só a lista e a soma, entra como evidência.

## Por que a seção 28 foi provada em cópia aparada

`npm run test:e2e:api` completo não chega à seção 28: ele morre na seção 13 (galeria de
evidência, `Failed to fetch` no PUT por CORS), que é vermelho conhecido e é justamente o
que a V2-F00-E18 conserta. A saída está arquivada em
`saidas/06-e2e-api-completo-cai-na-secao-13.txt`, para não haver dúvida sobre o que
acontece. A seção 28 foi então rodada numa CÓPIA APARADA do mesmo arquivo
(`sondas/e2e-aparado-secao-28.mjs`: cabeçalho, ajudantes e a seção 28, sem alterar uma
linha; a conferência de igualdade byte a byte com o trecho de `fluxo-api.e2e.mjs` foi
feita antes de rodar), com o mesmo roteiro de subida de API e painel
(`sondas/e2e-aparado-runner.mjs`, cópia de `scripts/e2e-api.mjs` em portas próprias).
Quando a E18 fechar, a seção passa a rodar dentro do roteiro completo, sem cópia.

## Capturas reais (Playwright, Chromium, 1280 e 390 px, claro e escuro)

Cinco estados do cartão "Saída de município", cada um em quatro combinações
(`capturas/`, 20 arquivos):

- `saida-normal`: o botão "Baixar pacote de saída" em repouso.
- `saida-carregando`: o botão diz "Gerando" e está desabilitado (provado também por
  `isDisabled()` no e2e).
- `saida-erro-sem-permissao`: a frase do servidor para quem não administra.
- `saida-erro-suspenso`: a frase de contrato do município suspenso.
- `saida-erro-rede`: "Sem conexão com o servidor. O arquivo não foi baixado."

Portão visual conferido nas capturas e por medida no próprio e2e: sem rolagem horizontal
em 1280 e em 390 px, o botão inteiro dentro da tela, e 44 px de altura no celular. Nenhum
texto cortado, grudado ou fora do lugar.

## Limitações e o que NÃO foi feito

- A validação humana da etapa (Rafael baixa o pacote pelo painel com a API local e abre o
  ZIP) não pode ser feita por mim e fica pendente.
- Fora do escopo desta etapa, e registrado em `dc360/apps/web/PENDENCIAS.md` seção 8: os
  outros downloads do painel (`baixarCsvDeOcorrencias`, `abrirDocumento`, `abrirOficio`)
  continuam com `fetch` solto, sem renovação de 401 (E23 ou F10); o pacote continua montado
  inteiro na memória do servidor e da aba (F07-E06); a frase de quem não administra fala em
  "alterar" onde a pessoa quis "baixar" (texto do catálogo de permissões, F03).
- Município com o acesso suspenso NÃO baixa o pacote (toda escrita confere a suspensão).
  É o que a etapa pediu e está provado, mas é decisão de contrato: ver a premissa da etapa
  na seção 9 do STATUS.
- O aviso de equipe divergente no laudo DENTRO do pacote continua faltando: é a V2-F00-E12,
  e é a única falha de `saida-de-municipio.test.ts`.
- Não foram rodados (nada neles mudou e a etapa não os pede): jest do app de campo,
  `test:campo`, `test:scripts`, `conferir:numeros`, `auditar`, `npm audit`, `test:e2e` do
  modo local, `apps/console`.

## Arquivos desta evidência

- `saidas/00-build-shared.txt`: `npm run build:shared` antes de tudo.
- `saidas/01-antes-api-saida.txt`: a API do pacote antes da etapa (o vermelho da E12 já
  estava lá).
- `saidas/02-sonda-antes-do-conserto-web.txt` e `saidas/03-sonda-antes-do-conserto-e2e.txt`:
  as duas sondas com o cliente anterior.
- `saidas/04-e2e-secao-28-chromium.txt` e `saidas/05-e2e-secao-28-firefox.txt`: a seção 28
  em cópia aparada, 36 de 36 nos dois motores, com o código final.
- `saidas/06-e2e-api-completo-cai-na-secao-13.txt`: o roteiro completo e onde ele para.
- `saidas/07-api-contrato-e-saida-de-municipio.txt`: os dois arquivos de teste do pacote.
- `saidas/baseline-depois/`: a regressão inteira, nas duas rodadas.
- `pacote/`: lista de nomes e soma SHA-256 do ZIP baixado em cada motor.
- `capturas/`: as 20 capturas.
- `sondas/`: a cópia aparada do e2e, o roteiro que a sobe e o recorte do cliente anterior.
