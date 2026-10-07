# V2-F00-E22: Documentação desatualizada ou falsa

Executada em 2026-10-07, no Windows 11 (Git Bash, Node 22.17.0). Sem commit.
Só documentação, comentários de código e o portão `conferir-numeros.mjs`.
Nenhum comportamento de produto mudou.

## Regra usada

Cada afirmação corrigida foi conferida AGORA contra o código ou contra uma
execução real desta data (2026-10-07), e não copiada de evidência anterior.
ADR não foi reescrita: a 0008 ganhou "Nota de revisão" datada no fim.

## Tabela antes e depois (os oito itens da etapa)

As linhas "antes" são as da árvore de trabalho no início da etapa (já com as
mudanças de E11 a E21, que não foram desfeitas); as "depois" são as de hoje.

| # | Arquivo | Antes (o que dizia) | Prova (código ou execução) | Depois |
| --- | --- | --- | --- | --- |
| 1a | `dc360/README.md:16` | "21 de 21 no `expo-doctor`, `npm audit` em zero", "Instalado e usado em iPhone de verdade" | `saidas/baseline/13-expo-doctor.txt` (20/21, dez pacotes atrás do SDK 57); `saidas/baseline/12-audit-campo.txt` e `saidas/antes/audit-campo-runtime.txt`; nenhum artefato de aparelho no repositório | `README.md:16`: "sem artefato de aparelho arquivado", expo-doctor 20 de 21 e `npm audit` NÃO fecha, E19 |
| 1b | `dc360/README.md:130` | "Na LEITURA, verificado só por assinatura, sem ida ao banco" | `apps/api/src/servidor.ts:465-482` (vigência só se `escrita`); `apps/api/src/rotas/avisos.ts:286,356,377` (INSERT e DELETE dentro do GET); `apps/api/src/config.ts:356` (`ACESSO_MINUTOS` 15, teto 60) | `README.md:130`: conta, papel e sessão não consultados na leitura; `GET /avisos` escreve com esse token; 15 por padrão, teto 60 |
| 1c | `dc360/README.md:219`, `:1250`, `:1507`, `:1511`, `:1533`, `:1541-1542` | `npm audit` "fecha em zero" (quatro lugares) e "21 verificações do expo-doctor" | `saidas/baseline/11-audit-raiz.txt` (6 avisos, código 1), `saidas/antes/audit-raiz-runtime.txt` (`--omit=dev`: `fastify` alto, `fast-uri` moderado), `saidas/baseline/10-auditar.txt` (`spawnSync npm ENOENT` no Windows) | `README.md:219-221`, `:1271-1283` (parágrafo novo com o medido), `:1538`, `:1542`, `:1547-1549`, `:1564-1572`, `:1579`: "precisa fechar e hoje não fecha" |
| 1d | `dc360/README.md:570-572` | `dc360_console` "Nada mais, no banco inteiro: sem escrita, ... sem função privilegiada" | `db/migrations/038_...sql:1215-1224`, `039_...sql:438-441`, `046_...sql:376-377` (GRANT EXECUTE e escrita nas tabelas do fornecedor) | `README.md:570-580`: sem privilégio em tabela de negócio, com exceções nomeadas em `db/test/isolamento.test.ts` |
| 1e | `dc360/README.md:610-613` | "O console não tem rota de escrita ... e não provisiona município" | `apps/console/src/servidor.ts:701,820,844,885,949,988,1112,1184`; `apps/console/src/cadastro.ts:94` (`provisionar_municipio`); `apps/console/.env.example:65-71` (mesmo Postgres, papel de login) | `README.md:618-629`: lista as rotas de escrita, o que alcançam e que o banco é o MESMO Postgres |
| 1f | `dc360/README.md:631-641` | contas do console "na configuração do processo", passo de TOTP e tentativas "na memória do processo" | `apps/console/src/operadores.ts:7-31` (`console_operadores`, semente) | `README.md:647-660` |
| 1g | `dc360/README.md:835` (seção "Acima do administrador") | provisionar é "feito pela linha de comando com a credencial de dono" | `apps/console/src/servidor.ts:701`; `apps/api/src/provisionar.ts` continua existindo | `README.md:834-840`: dois caminhos, console e linha de comando |
| 1h | `dc360/README.md` "O que falta", assinatura | "O que falta é quem produz, que é o dedo na tela" | `apps/campo/src/ui/Assinatura.tsx`, usado em `apps/campo/src/app/(agente)/vistoria/[id].tsx:42`; sincronização em `apps/api/src/rotas/sincronizacao.ts` | `README.md:1597-1603`: os dois lados existem; falta a prova em aparelho |
| 1i | `dc360/README.md:1564` | "Mapa cartográfico. MapLibre GL JS depende de um provedor de tiles ... Entra junto com a decisão de provedor" | `apps/web/src/paginas/mapa-de-base.ts:1-37` (Google com chave de `GET /configuracao`, modo esquemático sem chave); `apps/campo/package.json:44` (`react-native-maps`) | `README.md:1604-1612` |
| 1j | `dc360/README.md:11`, `:17` | `packages/shared` "Pronto" sem número; console "não alcança dado de cidadão" (sem citar suspender e eliminar) | `saidas/baseline/02-teste-shared.txt` (168); rotas acima | `README.md:11` "168 testes do pacote compartilhado" (conferido pela máquina), `:17` |
| 1k | `dc360/README.md:13` | "251 contra a API": número que o portão NÃO conferia (forma elidida) | sonda abaixo | mesmo texto, agora conferido, e dito que é a contagem do código |
| 2 | `dc360/db/PENDENCIAS.md:8-13`, `:17-40`, `:78-113`, `:128-129` | aplicação do console "não foi construída", `resumir_municipio()` "Nada a chama", segundo fator e provisionamento "não feitos", "teto de definers não se mexeu" | `apps/api/src/metricas/resumo.ts:147,203` e `apps/api/src/index.ts:21,370` (`agendarResumo`); `apps/console/`; `db/test/isolamento.test.ts:541-627` (teto 27) | refeito: itens 1, 4, 5 e 6 riscados com o que os fechou; 2 (expurgo e `PRIVACIDADE.md`) e parte do 3 seguem abertos |
| 3 | `dc360/apps/api/PENDENCIAS.md` | não listava `GET /orgaos` ao agente, pacote do município suspenso, reset de segundo fator de terceiro, aviso de `fastify` | `apps/api/src/rotas/orgaos.ts:82-83`; `apps/api/test/pacote-de-saida-contrato.test.ts:227`; `apps/api/src/rotas/segundo-fator.ts:156,180,229`; `saidas/antes/audit-raiz-runtime.txt` | tabela "O que resta" no topo e seção "O que estava fora daqui" no fim; seções anteriores conferidas e mantidas |
| 4 | `docs/adr/0008-...md:51`, `:83-86`, `:156-157`, `:165-171` | "banco de dados separado", "nada em nenhuma outra tabela", "teto de dano = números agregados", "único ato de escrita é cadastrar" | `fly.console.toml:1-40`, `apps/console/.env.example:65-92`, migrações 038 e 039, rotas de suspender e eliminar | texto original intacto; "Nota de revisão de 2026-10-07" ao fim, com os quatro pontos; aponta a ADR 0018 (V2-F20-E01) e a V2-F20-E04 como lugar da decisão nova |
| 5 | `dc360/docs/SAIDA-DE-MUNICIPIO.md:49-51` | "O sistema continua no ar durante todo o processo" (contra o capítulo 5: agendar eliminação suspende, pacote 403) | `apps/api/src/auth/suspensao.ts:14,120-126`; `apps/api/test/pacote-de-saida-contrato.test.ts:227` | `SAIDA-DE-MUNICIPIO.md:49-63`: no ar do passo 1 ao 5; corte só na suspensão e no agendamento; baixar e conferir o pacote ANTES de agendar |
| 5b | `dc360/docs/SAIDA-DE-MUNICIPIO.md:237-248` | retomada da purga "depende da memória do processo"; `eliminacoes_pendentes()` "a migração 038 ainda não traz" | `apps/api/src/eliminacao/relogio.ts:49-71`; `db/migrations/038_...sql:1131`; `apps/api/src/servidor.ts:647-665` | `:249-259` riscados como resolvidos |
| 6 | `dc360/apps/campo/LEIA-ME.md:3`, `:10-12`, `:21-24` | "NUNCA RODOU EM APARELHO"; expo-doctor 21 de 21; auditoria "runtime zero" | ver 1a e 1c; BZ-N:N.7 | `LEIA-ME.md:3` "sem artefato de aparelho arquivado" até a V2-F14-E12; `:10-16`; tabela com o medido em 2026-10-07 |
| 7 | `dc360/apps/web/PENDENCIAS.md` itens 1, 3, 5, 9.1 e 10.1 | rota da coordenada "não foi feita"; README atrasado sobre o mapa; teto de seis casas "ainda não no banco"; CRLF vermelho; "Os e2e não rodam no CI" | `apps/api/src/rotas/ocorrencias.ts:1299`, `apps/web/src/dados/http.ts:691`; `packages/shared/src/schemas.ts:39-60,170`, migração 030; E21; `.github/workflows/verificar.yml:111-134` | tabela "O que REALMENTE resta" no topo; os cinco itens marcados resolvidos (ou corrigidos, no 10.1) com a prova |
| 8 | `apps/api/src/auth/sessoes.ts:20-27`, `auth/suspensao.ts:39-42,43-48`, `auth/vigencia.ts:47-48`, `servidor.ts:465-476` | "desde 15/09/2026" sem dizer que esteve desligada de 17/09 até a E04; "quinze minutos de leitura não produzem registro" sem a exceção do `GET /avisos` | `servidor.ts:473-476` (desligada de 17/09/2026 até a V2-F00-E04, commit b4439ac); `rotas/avisos.ts` | `sessoes.ts` e `suspensao.ts` com as datas certas e a família da sessão (E07); `suspensao.ts` e `vigencia.ts` com a exceção do `GET /avisos`; `servidor.ts` conferido e já correto (não mexido) |

## O portão de números (pedido da seção 11, achados da E17 e da E18)

- **Regex (E17):** `AFIRMACAO` em `dc360/scripts/conferir-numeros.mjs` ganhou o
  ramo `contra\s+a\s+API`. Antes, "251 contra a API" (README:13) passava SEM
  conferência nenhuma. Agora são 24 afirmações conferidas (eram 22; +1 desta
  regex, +1 do "168 testes do pacote compartilhado" novo).
- **Sonda:** com "103 contra a API" posto de volta no README, a regex nova
  reprova (`saidas/sonda-103-contra-a-api.txt`, código 1, "valor real é 1255 ou
  251, e não 103"); com a regex antiga a mesma mentira passa verde
  (`saidas/sonda-103-regex-antigo.txt`, 22 conferidas, código 0). README e
  script restaurados, SHA-256 conferido.
- **Estático ou executado (E18), DECISÃO desta etapa:** o número afirmado é o
  ESTÁTICO (`ok(` no início de linha, 251 contra a API e 70 local), porque é o
  único que a máquina confere sem navegador e API de pé. O README diz isso na
  própria frase ("contadas no código ... a execução imprime mais") e o
  comentário de `contarVerificacoes` registra a diferença medida (251 contra
  271 executadas pela E18). O 271 NÃO entra em documento de produto: ele
  apodreceria sem portão.
- **Não feito (é decisão do Rafael, seção 11 do STATUS):** as propostas (a), (b)
  e (c) da E17 (protocolo mandar rodar `conferir:numeros`, número num lugar só,
  CI). Continua valendo que o mesmo número aparece no README e em
  `COLOCAR-DE-PE.md`.

## Resultados medidos (2026-10-07, depois das mudanças)

`node scripts/baseline.mjs --sem-instalar --so=typecheck,teste-shared,teste-db,teste-campo-pacote,teste-api,teste-console,teste-web,test-scripts,conferir-numeros,auditar,audit-raiz,audit-campo,expo-doctor`:
13 de 13 conferem com o esperado (`saidas/baseline/`).

| Passo | Resultado |
| --- | --- |
| typecheck | código 0 |
| shared | 168, 0 falhas |
| banco (`test:isolamento`) | 327 e 3 pulados por ambiente, código 0 |
| motor de campo | 187 |
| API | 1255, 0 falhas |
| console | 259 |
| painel | 643, 0 falhas |
| `test:scripts` | 206, 0 falhas, 4 pulados por ambiente |
| `conferir:numeros` | 24 conferidas, 0 divergências, código 0 |
| `auditar` | código 1: no Windows morre com `spawnSync npm ENOENT` ANTES de auditar (achado; ver abaixo) |
| `npm audit` raiz | código 1, 6 avisos (2 moderados, 2 altos, 2 críticos) no total; só execução: `fastify` alto e `fast-uri` moderado |
| `npm audit` campo | código 1, 61 avisos no total (57 em execução) |
| `expo-doctor` | código 1, 20 de 21 |
| `npm test` (raiz) | código 0: motor 187, shared 168, API 1255, console 259, painel 643, banco 327 e 3 pulados (`saidas/npm-test.txt`) |
| portão de conteúdo (`regras-de-conteudo.test.ts`) | 8 de 8 |

`auditar`, `npm audit` e `expo-doctor` vermelhos são da V2-F00-E19 (bloqueada
pelo CP-03), pré-existentes e esperados assim pelo `baseline.mjs`. Nenhum
esperado do `baseline.mjs` mudou nesta etapa (nenhuma contagem de teste mudou).

## Testes negativos (grep, depois)

`grep` por "DESLIGADO NESTA IMPLANTAÇÃO", "NUNCA RODOU EM APARELHO", "MapLibre",
"sem ida ao banco", "21 de 21", "fecha em zero", "não tem rota de escrita",
"falta quem produz" em `dc360/**/*.md` e `docs/adr/`: acertos que sobram, todos
devidos (`saidas/grep-negativo-depois.txt`):

- `apps/web/PENDENCIAS.md` item 3: o registro histórico do MapLibre, riscado
  como resolvido.
- `apps/campo/LEIA-ME.md:23` ("Era 21 de 21 em 15/09/2026") e `:148` (relato
  de incidente passado).
- `README.md:1538` e `:1579`: "precisa fechar em zero ... hoje NÃO fecha".
- `docs/adr/0004-autenticacao-propria.md:36` e `0005...md:84`: ADR é decisão
  histórica e não se reescreve; o estado vigente está no README.

## Achados (não resolvidos aqui, registrados)

1. **`npm run auditar` não audita no Windows.** `scripts/auditar.mjs:61` chama
   `execFileSync("npm", ...)` sem shell; no Windows o `npm` é `npm.cmd` e a
   chamada morre com ENOENT. O vermelho do passo `auditar` nesta máquina NÃO é
   o de vulnerabilidade, e o `baseline.mjs` (que só espera "falha") não
   distingue. É a mesma classe do caso 19 da E17. PROPOSTA: a E19 conserta
   (`shell: process.platform === "win32"`) e o `baseline.mjs` passa a exigir a
   linha "Runtime (vai para a imagem)" na saída.
2. **Comentário velho no CI:** `.github/workflows/verificar.yml:116-125` fala
   em "49 das 103 verificações" e "As 47 verificações acima" (números antigos;
   hoje 251 e 70). `conferir:numeros` só lê `.md`. Não mexido (o arquivo de CI
   não é documento de produto da etapa); PROPOSTA para a F01-E03.
3. **O CI roda o e2e** (local em Chromium e Firefox, contra a API em
   Chromium), ao contrário do que `apps/web/PENDENCIAS.md` 10.1 dizia; nenhum
   run foi conferido nesta fase.
4. **`docs/PRIVACIDADE.md` não menciona `metricas_municipio`** (pendência da
   ADR 0008 que continua aberta, em `db/PENDENCIAS.md` item 2).

## Limitações e validação humana

- Rafael lê a tabela acima e confirma que nada ficou prometido sem existir
  (validação humana da etapa).
- A afirmação de uso em iPhone (08/09/2026) continua sem artefato: foi
  rebaixada a relato, não confirmada nem negada.
- Item "documentação desatualizada" do G00 NÃO foi marcado (regra comum: só no
  próprio gate).
- A etapa "roda depois de E17 e E19": a E19 está BLOQUEADA, então a rodada de
  `auditar` e `npm audit` arquivada é a de hoje, vermelha, e precisa ser
  repetida quando a E19 fechar; os textos que falam do `npm audit` dizem
  "hoje não fecha" e terão de mudar com ela.
