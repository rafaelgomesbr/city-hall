# V2-F01-E14: observabilidade P0 inicial (id da requisição, erro centralizado, rotinas em `error`, alerta de storage)

## Fatos

**Base:** `origin/v2/f01` em `f511b4c` (E01 a E08 e E16 integradas). Sem SDK, sem rede nova, sem migração, sem mudança
em `config.ts` (API e console), em `.github/workflows/`, `package.json` ou lockfile.

**API (`dc360/apps/api/src`):**

- `observabilidade/id-de-requisicao.ts` (novo, sem dependência): `idDeRequisicaoRecebido` aceita só UUID (qualquer
  caixa, devolve minúsculas). `servidor.ts` usa em `genReqId`; o hook `onSend` passa a pôr `X-Request-Id: <req.id>` em
  TODA resposta; o `cors` ganha `exposedHeaders: ["x-request-id"]`. `allowedHeaders` NÃO mudou (o painel não envia o
  cabeçalho).
- `observabilidade/reportador.ts` (novo): porta `ReportadorDeErros.reportar(erro, contexto)`; `criarReportador({log,
  enviar?})` escreve em nível `error` (mensagem `erro nao tratado`, com `requisicao`, `origem`, `metodo`, molde da
  rota, `status`), com mensagem e pilha mascaradas, e, se houver `enviar`, entrega o evento já filtrado (a falha do
  `enviar` é engolida). `montarEvento` monta o evento no formato de entrada do Sentry. `NivelDoRegistro`.
- `observabilidade/filtro.ts` (novo): `filtrarEventoParaTerceiros` (o futuro `beforeSend`). Remove por chave
  `authorization`, `cookie(s)`, `headers`, `query`, `query_string`, `body`, `data`, `ip`, `ip_address`, `user`, `vars`,
  `senha`, `token` e afins; reconstrói `request` só com `method` e `route`; mascara toda string. Devolve cópia.
- `observabilidade/ambiente.ts` (novo): lê `ERROS_DSN` e `S3_COTA_BYTES` de `process.env`, fora de `config.ts` (mesmo
  padrão de `versao-do-build.ts`). Valor inválido desliga e vira aviso; o DSN nunca é registrado.
- `observabilidade/captura-de-processo.ts` (novo): `uncaughtException` e `unhandledRejection` passam pelo reportador e
  saem com código 1 (o que o Node já fazia).
- `servidor.ts`: o tratador do 500 chama `reportador.reportar` (era `req.log.error`); a frase do 500 passou de "Informe
  o código abaixo ao suporte." para "Se precisar de ajuda, informe o código de suporte."; `Dependencias.reportador?`
  (o teste injeta).
- Rotinas: `minimizacao.ts`, `resumo.ts` e `orfaos.ts` (`varrerOrfaos`, `descartarOrfaos`, relógio) ganham o terceiro
  parâmetro `nivel` em `registrar`. Falha sai `error`: minimização "falhou inteira", resumo por município e "falhou
  inteira", órfãos "falhou inteira", e órfãos/descarte concluídos COM falhas. Rodada sem falha continua `info`.
  `index.ts` passa `registrarDaRotina` (o nível pedido, `info` por padrão) às três.
- `armazenamento/alerta-de-cota.ts` (novo): `conferirCotaDeArmazenamento` lista o balde inteiro, soma os bytes e
  compara com a cota: estritamente acima de 80% é `error`, até 80% é `info`, listagem que falha ou não termina é
  `error` sem número. O log leva só `objetos`, `bytes`, `cotaBytes`, `percentual` (nenhuma chave de objeto). Trava
  própria (`CHAVE_DO_ALERTA_DE_COTA = 5410360047`). `agendarAlertaDeCota` roda na partida e a cada 24 h. `index.ts` só
  liga com `S3_COTA_BYTES` válido.

**Console (`dc360/apps/console/src/servidor.ts`):** `genReqId` pela mesma regra (importa o arquivo sem dependência da API),
`onSend` com `X-Request-Id`, e o 500 passa a responder `{ erro: "falha_interna", requisicao }` e a registrar `requisicao`.

**Compartilhado (`packages/shared/src/observabilidade.ts`, novo):** `mascararDadoPessoal` troca token (`Bearer`, JWT),
e-mail, CPF, telefone e coordenada (4 casas ou mais) por marcador e poupa UUID.

**Painel (`dc360/apps/web/src`):** `ErroDaApi` ganha `requisicao` (lida do cabeçalho `X-Request-Id` e, na falta dele, do
corpo; só vale UUID); nos 5xx a mensagem termina com "Código de suporte: `<uuid>`" (4xx não). `observabilidade.ts` (novo)
e `main.tsx`: `instalarErrosGlobais(window)` registra `error` e `unhandledrejection` no console do navegador, com a
mesma máscara, sem pilha, sem endereço da página e sem rede.

**Documentação:** `dc360/docs/OBSERVABILIDADE.md` (novo), linhas em `LEIA-ME.md`, `SUBPROCESSADORES.md` (ferramenta de
erro a decidir no CP-06 e monitor externo, ambos "ainda não contratados", com aviso de 30 dias) e `ARMAZENAMENTO.md`.
Contagens em `README.md`, `docs/COLOCAR-DE-PE.md` e `scripts/baseline.mjs` (API +49, painel +13, console +4, shared +9).

**Testes novos (75, todos verdes):**

- `apps/api/test/request-id.test.ts` (13): regra pura (UUID aceito; `\n`, `\r\n`, 200 caracteres, lista, número e
  `{}` descartados); id novo por pedido; adoção do UUID válido; o mesmo id no log (`reqId`); id hostil nunca chega ao
  log e toda linha segue sendo JSON de uma linha; 401 e 404 devolvem o id; `access-control-expose-headers`; origem
  estranha continua sem `allow-origin`; **banco fora dá 503 em `/saude`** com o id e sem detalhe; o 500 repete o id no
  corpo e no cabeçalho com log em `error`; **autorização e isolamento**: com banco que lança erro cuja mensagem traz
  e-mail e `Bearer` de "outro município", e pedido com `Authorization`, `Cookie` e query string, nada disso aparece no
  log; o reportador injetado recebe o molde `/auth/entrar` e nunca a query.
- `apps/api/test/reportador-de-erros.test.ts` (17): filtro (chaves e textos), cópia sem alterar o original, circular e
  profundidade, reportador com e sem destino, destino que lança, valor que não é `Error`, `montarEvento`, ambiente
  (`0`, `-5`, `10GB`, `1e12`, `1.5`, `abc`, `007` desligam o alerta; o aviso não repete o valor nem o DSN) e a captura
  de processo.
- `apps/api/test/rotinas-em-nivel-error.test.ts` (8): minimização, resumo (município que falha, falha inteira, sem
  falha) e órfãos (listagem com falha, rodada limpa, relógio).
- `apps/api/test/alerta-de-armazenamento.test.ts` (11): abaixo, exatamente 80% (`info`), 80% mais 1 byte (`error`),
  várias páginas, acima da cota, listagem com falha e continuação infinita (`error`, sem número), log sem chave de
  objeto, trava ocupada, trava solta ao lançar, primeira medição na partida, número da trava distinto.
- `apps/console/test/request-id.test.ts` (4), `apps/web/test/codigo-de-suporte.test.ts` (13),
  `packages/shared/test/observabilidade.test.ts` (9).

**Resultados (ver `saidas/`):** `typecheck` 0 (`08`). `npm run test:api`: 111 arquivos, 1773 passando, 34 pulados por
ambiente (os mesmos de antes), 0 falhando (`05`); antes da etapa: 107 arquivos, 1724 passando, 34 pulados (`00`, rodada
feita enquanto o código ainda estava sendo editado, vale só como ordem de grandeza). `test:console`: 314 de 314 (`07`).
`conferir:numeros` verde (`09`), `baseline.test.mjs` 29 de 29 (`10`).

**Prova de que os testes mordem (`04`):** com `genReqId` trocado por eco do cabeçalho e com a linha da minimização sem
`"error"`, 2 casos reprovam (o do id hostil e o da minimização); com `user` fora da lista do filtro, os testes de texto
NÃO reprovavam (o e-mail dentro de `user` já saía mascarado), então foi acrescentado o caso "o bloco de usuário e os
cabeçalhos somem como CHAVE", que reprova essa mutação.

**Vermelhos que NÃO são desta etapa (já estavam na ponta `f511b4c`):**

- `packages/shared/test/regras-de-conteudo.test.ts`, caso "nenhum travessão em texto nenhum": reprova por UM achado,
  `docs/evidencias-v2/G01/V2-F01-E16/RESUMO.md` linha 53 (caractere U+2014 literal, da E16). Todo o resto do caso, e os
  outros 9, passam (`11`, onde o caractere foi trocado por "(U+2014)" para a saída não repetir o defeito).
- `apps/web/test/seo.test.ts`, "vercel.json > dá cache longo a cada arquivo de marca": `/icone-192.png` sem
  `max-age` (`06`). Não toquei em `vercel.json`.
- `npm run test:scripts` NÃO foi arquivado aqui: o teste do índice de evidência confere esta pasta (autorreferente) e o
  conferidor de INDEX depende do estado do git. Rodado à parte, com a pasta no índice do git, antes do commit: `npm run test:scripts` com 547 casos, 543 passando, 0 falhando, 4 pulados por ambiente (os de sempre).

**Limitações:**

- NÃO há SDK, DSN funcional nem destino externo de erro: sem o CP-06 o único destino é o log. `ERROS_DSN` definido só
  gera um aviso na partida.
- O monitor externo de `/saude` e o recebimento do alerta de teste NÃO foram feitos (são conta e ação do dono).
- A linha `error` do alerta de armazenamento e das rotinas só vira aviso para uma pessoa quando houver regra no destino
  de logs; isso não existe.
- `S3_COTA_BYTES` ainda não está no contrato de configuração (`config.ts` é da E09); hoje é lida em
  `observabilidade/ambiente.ts`.
- A medição lista o balde inteiro (chamada cobrada), na partida de cada máquina e uma vez por dia; com um balde grande e
  deploys frequentes isso é custo a observar. O listar do S3 nunca falou com o provedor de verdade (ver
  `ARMAZENAMENTO.md`).
- A máscara é rede de segurança: nome de pessoa e endereço por extenso passam. Número com 13 dígitos (instante em
  milissegundos) é mascarado como telefone (excesso consciente).
- O console continua registrando `erro.message` cru na linha `falha no console` (não passa pela máscara; só alcança
  e-mail de operador, mas é o mesmo tipo de dado). Não foi mexido porque o console não depende do pacote compartilhado.
- A eliminação por prazo continua em `warn` (decisão antiga); separar a falha dela em `error` fica como dívida.
- O E2E da etapa ("em HML, derrubar a API e confirmar o alerta") e a validação humana ("Rafael recebe o alerta")
  dependem de HML (E09 a E13) e do monitor: não foram feitos.
- Não rodei E2E de navegador do painel nem capturas de tela: não houve mudança visual além do texto de erro 5xx.

## Justificativa

- **Porta com adaptador de log e sem SDK:** o texto da etapa manda enviar a um SDK "com `ERROS_DSN` (CP-06)", e o CP-06
  (ferramenta e residência do dado) é decisão do dono com o jurídico, com aviso de 30 dias aos municípios. Instalar o
  SDK agora mexeria em lockfile (fora do escopo desta execução paralela) e criaria subprocessador antes da decisão. O
  filtro, que é a parte de risco (LGPD), fica pronto e testado antes de qualquer evento sair; o SDK entra depois como
  a função `enviar`, sem tocar em rota.
- **Só UUID no `X-Request-Id`:** o id entra em toda linha de log e volta em cabeçalho; qualquer texto livre é injeção de
  linha ou de cabeçalho. UUID não carrega dado pessoal nem identifica município.
- **Reconstruir `request` em vez de só remover campos:** é a parte que mais vaza (URL com query e, em duas rotas, segredo
  de uso único); lista do que fica falha para o lado seguro quando o SDK acrescentar um campo novo.
- **`http_status` na etiqueta:** a varredura de códigos de erro de acesso lê o nome `status` em qualquer forma e reprovou
  a etiqueta `status`.
- **Alerta de cota em rotina própria:** a cota é do balde e não do município (esse teto já existe no banco). A medição
  usa só `armazenamento.listar`, sem consultar o banco, e por isso não precisa de função privilegiada nova (o teto de
  `SECURITY DEFINER` está cheio).
- **O 500 sem "abaixo":** a frase antiga apontava para um código que nenhuma tela mostrava; agora o painel mostra.

## Para o orquestrador

**Linha sugerida para o STATUS:** `V2-F01-E14 | IMPLEMENTADA | candidato <sha7> | sem SDK (CP-06); monitor de /saude e
alerta de teste são pendências do Rafael; vermelhos herdados: regras-de-conteudo (E16 RESUMO linha 53) e seo.test.ts
(vercel.json)`.

**Linha que a E09 deve acrescentar ao contrato de `apps/api/src/config.ts`** (e tirar de `observabilidade/ambiente.ts`
quando entrar): `S3_COTA_BYTES`, inteiro positivo de bytes, opcional, sem padrão; ausente desliga o alerta de 80% do
bucket. Opcionalmente `ERROS_DSN`, texto opcional, tratado como segredo (nunca em log). Nenhuma das duas é obrigatória
para a API subir.

**Contagens para integrar:** API +49 (1724 para 1773), painel +13 (737 para 750), console +4 (310 para 314), shared +9
(224 para 233). Se outra etapa também mexer em `README.md`, `COLOCAR-DE-PE.md` e `baseline.mjs`, as linhas de contagem
vão conflitar e se somam (rode `npm run conferir:numeros`).

**Pendências humanas (o que o Rafael faz fora do repositório):**

1. Criar o monitor externo de `GET /saude` (API e console), alertando para um canal que ele leia (sugestão em
   `OBSERVABILIDADE.md`, seção 5) e **receber o alerta de teste**.
2. CP-06: escolher a ferramenta de erro e onde o dado mora; depois avisar os municípios com 30 dias e só então
   acrescentar o SDK como `enviar`.
3. Definir `S3_COTA_BYTES` em PROD (e HML) com a cota contratada do bucket, quando a E09 tiver a linha de contrato.
4. Criar, no destino de logs, a regra que transforma linha `error` das rotinas e do alerta de armazenamento em aviso.

**Riscos:** o hook `onSend` agora escreve um cabeçalho a mais em toda resposta (a guarda de 401 e 403 não é afetada;
a suíte inteira passou); o tratador de processo mantém `exit(1)`, igual ao padrão do Node; a medição do bucket lista o
balde na partida de cada máquina.
