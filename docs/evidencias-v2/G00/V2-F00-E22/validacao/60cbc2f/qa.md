---
validador: qa (general-purpose)
modelo: claude-sonnet-5-5
etapa: V2-F00-E22
sha_validado: 60cbc2f
ci_run: 39524190207
rodada: 8
herdado_de:
tags: [DB]
nivel_de_prova_exigido: [E1, E2]
nivel_de_prova_obtido: [E1, E2, E3a]
veredito: PASS
confianca: media
humano_necessario: sim
escalar: conflito com o QA da E19 (achado 1): a premissa do Dockerfile que o README escreve é verdadeira com o npm 10 da imagem node:22 e falsa com o npm 11; o gatekeeper decide se o achado da E19 continua bloqueando
---
## Critérios verificados

Trabalhei numa cópia de `60cbc2f` (`git archive`), com `npm ci` e `build:shared`. Saídas em `/private/tmp/claude-501/-Users-rafaelgomes-Documents-city-hall/d1c50ef6-d495-4393-82c6-d7e2ba48b9a4/scratchpad/r8/qa-E22/`. Linhas citadas são as de `60cbc2f`.

| # | Afirmação (arquivo:linha) | Prova |
| --- | --- | --- |
| 1 | `dc360/README.md:16`, `:10-15` e `docs/COLOCAR-DE-PE.md:41,352`: totais (5550, 3553, 1717, 723, 307) | `npm run conferir:numeros` na cópia: 25 afirmações, "Todos os números da documentação batem", saída 0 (`conferir-numeros.txt`). Não recontei à mão, como pedido |
| 2 | `README.md:151-153`: "toda resposta 401 ou 403 do servidor tem código nele, salvo pelos caminhos que a guarda não vê (...)" | Sonda de socket cru com servidor real em modo `corrigir`: 403 com `{erro:"vazou_qa"}` sai `sem_permissao`; 401 com texto livre sai `nao_autenticado` (`sonda-node22.txt`, `sonda-node24.txt`). Ver pista 2 |
| 3 | `README.md:171-175`: "quinze das dezesseis formas... (todas menos a M08)" e "os dezesseis escapes" | `grep -o 'r("m..")'` em `apps/api/test/guarda-de-codigos-de-erro.test.ts`: m01 a m07 e m09 a m16 (15), sem m08; `ESCAPES_DA_REVISAO` com 16. O arquivo roda 140 de 140 em Node 22.23.4 e 24.15.0 (`guarda-api-node22.txt`, `guarda-api-node24.txt`) |
| 4 | `README.md:277-287` (seção da API): console sem `transfer-encoding: identity` nem `writeHead(403)` + `flushHeaders` | `grep -c` no teste do console: `identity` 0, `flush` 0; no da API 4 e 12. Console 48 de 48 nos dois Node (`guarda-console-node22.txt`, `guarda-console-node24.txt`) |
| 5 | `README.md:252-266`: 1xx como resposta final vira 500 (`erro_interno` na API), pedido seguinte recebe a sua resposta | Sonda `wh103` (`writeHead(103)` + `end` por hijack): `500 erro_interno` e depois o `/saude` com 200 intacto, em Node 22 e 24 |
| 6 | `README.md:289-296`: corpo menor que o `content-length` em resposta que não é 401 nem 403 derruba a conexão sem resposta | Sonda `curto200`: conexão fechada sem nenhum byte, nem para o pedido seguinte do pipeline, em Node 22 e 24 |
| 7 | `README.md:272-280`: 401 ou 403 do catálogo com `content-length` errado sai como resposta válida | Sonda `cat403cl` (`content-length: 99` declarado): sai `403 sem_permissao` com `content-length: 39`, e o `/saude` seguinte responde |
| 8 | `README.md:283-291`: Early Hints, CR ou LF recusados também no Node 22; 103 legítimo antes de 403 do catálogo passa | Sondas `eh` (valor com CRLF e uma cabeça HTTP inteira) e `eh-ok`, Node 22.23.4: `eh` sai `500 erro_interno`, nenhum `HTTP/1.1 403` forjado no fio; `eh-ok` sai `103 Early Hints` e depois `403 sem_permissao` |
| 9 | `README.md:884-896`: `ressalva-saida-a-campo.test.ts` confere "nove arquivos" (seis por unidade, quatro quadros, o README nas duas) | Lido `packages/shared/test/ressalva-saida-a-campo.test.ts:76-92`: `REGRAS` 6, `QUADROS` 4, README repetido, 9 distintos; `semTabela` no README e na privacidade. 48 de 48 com `regras-de-conteudo` (`pos-conteudo.txt`) |
| 10 | `README.md:1305-1316` e `:1950-1957`: `auditar` chamado por `node scripts/auditar.mjs`; `dependencias` recusa `.npmrc` versionado; `windows` repete `auditar`, `test:scripts`, `conferir:numeros`; "onze ao todo, doze execuções" | `.github/workflows/verificar.yml:209-217` (recusa `.npmrc`, `node scripts/auditar.mjs`), `:606-662` (job `windows` em `windows-latest`, os três passos). API do GitHub no run 39524190207: 12 jobs `success`, onze nomes distintos com o `plataformas` duplicado em `windows-latest` e `ubuntu-latest` (`ci-jobs.txt`) |
| 11 | `README.md:1392-1418`: o que o `plataformas` faz (autocrlf, `OPENSSL_CONF`, `router.d.ts.velho`, `scripts/ambiente-hostil.mjs`) | `verificar.yml:674-897` (comentário e passos: `git ls-files --eol`, `ambiente-hostil.mjs crlf`, `shell: powershell` só no Windows, controle `TS2345` na linha 857); os dois arquivos existem; a fixture não tem `/avisos`, `/mapa` nem `/perfil` |
| 12 | `verificar.yml:31-42`: todo job publica `<job>-<sha>` com retenção de 30 dias e `00-contexto.txt`; `redigir` antes | Lido: o job `windows` tem "Contexto do run" (`:622-625`), "Redigir segredo" (`:661-663`) e `retention-days: 30` (`:670`), `produto` idem. O comentário de topo bate com o arquivo |
| 13 | `verificar.yml:39-44` e `:1089,:1208`: `baseline` e `restore` só com `[ci completo]`, disparo manual ou agenda | Linhas `if:` lidas; o run 39524190207 (push com `[ci completo]`) tem os dois verdes |
| 14 | `README.md:1620-1700` (política do `auditar`): `CHAVES_PERMITIDAS`, `--package-lock=true`, shrinkwrap sai 2, `workspaces` fora da lista, consulta de controle | Lista de `scripts/auditar-excecoes.mjs:388-410` igual à do texto. Negativos executados (ver abaixo): `.npmrc` com `workspaces=false`, `omit=dev`, `include-workspace-root=false` sai 2; `npm-shrinkwrap.json` sai 2 |
| 15 | `README.md:1387-1395`: histórico de runs | API do GitHub: 39241470718 sobre `766bc0a` (2026-10-19, 9 de 9); 39420436042 sobre `55209ab` (2026-10-20, 9 de 9); 39366804765 sobre `7644420`: tentativa 1 `failure` (recusada), tentativa 2 `success` com 9 de 9. Ver achado 3 |
| 16 | `apps/campo/LEIA-ME.md:55-64`: o `plataformas` põe o cache velho, confere TS2345 e roda `test:campo` | `verificar.yml:850-880` e a fixture; confere |
| 17 | `COLOCAR-DE-PE.md:41-42`: contagem "em 2026-10-20" | Contagem real 5550 no SHA; data coerente com os commits de 2026-10-20 do roteiro de fatos |
| 18 | Negativos da etapa: "DESLIGADO NESTA IMPLANTAÇÃO", "sem ida ao banco", "NUNCA RODOU EM APARELHO", "MapLibre" | `grep -rn` na cópia: uma ocorrência de "sem ida ao banco", em comentário de código do console (`apps/console/src/servidor.ts:804`, 404 sem ida ao banco para UUID inválido), legítima; "MapLibre" só em `apps/web/PENDENCIAS.md:167-176`, no item riscado "(resolvido)" como registro; LEIA-ME do campo diz "sem artefato de aparelho físico arquivado" |

## Evidência

- Comandos e saídas arquivadas no scratchpad indicado: `conferir-numeros.txt`, `guarda-*-node22.txt`, `guarda-*-node24.txt`, `sonda-node22.txt`, `sonda-node24.txt`, `saida-pista1.txt`, `auditar-negativos.txt`, `auditar-hoje.txt`, `auditar-devtrue.txt`, `pos-conteudo.txt`, `neg0.txt` a `neg5.txt`, `ci-jobs.txt`.
- Node 22.23.4 (tarball oficial, npm 10.9.9) e Node 24.15.0 (npm 11.12.1), os dois no Mac. Sem Docker, sem Windows.
- Os arquivos de sonda que criei (`apps/api/test/sonda-qa*.test.ts`) ficaram só na cópia do scratchpad; no repositório não toquei em nada além deste relatório (`git status` só mostra os relatórios dos outros validadores).

## Cenários positivos

1. `conferir:numeros` 0 sobre `60cbc2f` limpo (25 afirmações).
2. `regras-de-conteudo` mais `ressalva-saida-a-campo`: 2 arquivos, 48 de 48.
3. Testes da guarda: API 140 de 140 e console 48 de 48, em Node 22 e em Node 24.
4. As seis sondas de socket cru da seção da API do README (itens 2, 5 a 8) conferem em Node 22 e em Node 24.
5. Run 39524190207: 12 de 12 `success`, com `windows`, `plataformas` (duas vezes), `baseline` e `restore`.

## Cenários negativos

- Número errado de propósito: `COLOCAR-DE-PE.md` com 5551 em vez de 5550 reprova `conferir:numeros` (saída 1, "valor real é 1997 ou 5550, e não 5551"); README com 1700 testes da API no lugar de 1717 reprova (saída 1). Restaurado e verde (`neg0.txt` a `neg2.txt`).
- Travessão (U+2014) inserido em frase nova do README: `regras-de-conteudo` reprova ("nenhum travessão em texto nenhum"). Norma inventada ("Lei 99.999/2031, art. 7"): reprova ("nenhuma norma citada fora da lista autorizada"). Ressalva "fica vazia" tirada do quadro do README: `ressalva-saida-a-campo` reprova ("o quadro não diz /fica\s+vazia/i") (`neg3.txt` a `neg5.txt`).
- `auditar` com `.npmrc` contendo `workspaces=false`, `omit=dev` ou `include-workspace-root=false`: saída 2 com o nome da chave. Com `package-lock=false` (permitida porque anulada) segue saída 1 sobre o runtime vulnerável de hoje, como o README diz. Com `npm-shrinkwrap.json` ao lado: saída 2 ("o que o npm audita não é o package-lock.json").
- Lockfile com `dev: true` nas quatro entradas vulneráveis (`zod`, `fastify`, `fast-uri`): o `auditar` cai de 3 para 0 de runtime. Confirma a frase do README de que o portão confia nessa marca (`auditar-devtrue.txt`).

## Tentativas de reprovar

1. **Frase do `npm ci --omit=dev` (pista 1).** Tentei provar que o Dockerfile instala o pacote marcado `dev: true`. Com a marca em `node_modules/ajv/node_modules/fast-uri` (3.1.8) e `npm ci --workspaces --include-workspace-root --omit=dev --ignore-scripts`: com o npm 10.9.9 do Node 22 (`FROM node:22-bookworm-slim`, `Dockerfile:41`, sem `npm install -g` em lugar nenhum) o pacote NÃO é instalado; o controle com o lockfile original o instala; com o npm 11.12.1 do Node 24 ele é instalado mesmo marcado (`saida-pista1.txt`). A frase é verdadeira para o que o Dockerfile roda.
2. **Garantia da guarda (pista 2).** Mandei 403 com código fora do catálogo, 401 com texto livre, 1xx final, `content-length` errado, corpo curto e Early Hints com CRLF contra o servidor real em modo `corrigir`. Nenhum código fora do catálogo chegou ao fio em Node 22 nem em 24. Tentei também o padrão de DV-01 (cabeçalho com `toString` que muda a cada leitura, por `rep.raw.setHeader`): na minha variante a guarda trocou a resposta por `sem_permissao`, ou seja, não reproduzi DV-01. Não insisti: a política manda não gastar sonda de injeção nele.
3. **Números e totais.** Tentei fazer o `conferir:numeros` aceitar número velho (negativos acima): não aceita.
4. **Histórico de CI do README.** Conferi cada run citado na API pública (SHA, data, resultado): achei a imprecisão do run 39366804765 (achado 3).
5. **Comentários do `verificar.yml` e do README sobre os jobs.** Conferi cada afirmação de artefato, retenção, `if:` e `runs-on` contra as linhas do arquivo. O resumo de fatos do implementador dizia que o job `windows` não redige segredo, não tem retenção de 30 dias e não grava `00-contexto.txt`; no `60cbc2f` ele tem as três coisas, e o comentário de topo (que diz "todo job") está certo. Nenhum comentário contradiz o arquivo.
6. **Deriva do registro.** Rodei `auditar` hoje, 2026-10-24: sai 1 (3 advisories de runtime: `zod` alta, `fast-uri` moderada, `fastify` baixa; mais `zod` alta no aplicativo). Procurei se alguma frase NOVA desta rodada afirma o contrário: não achei (achado 4).
7. **Itens antigos da etapa (1 a 8).** Releitura por amostra dos negativos do bloco da etapa (greps do item 18 acima). Os arquivos dos itens 2 a 5 e 7 não mudaram no intervalo `fd17ff4..60cbc2f` (`git diff --stat`), então não repeti a rodada 7.

## Achados

1. **Pista 1: REFUTADA como afirmação falsa sobre o Dockerfile; dívida de precisão.** `README.md:1686-1689` ("o `npm ci --omit=dev` do Dockerfile usa a mesma marca e não instala o pacote") entrou em `b72e371`, portanto é desta rodada. Reprodução: `saida-pista1.txt`. Com Node 22.23.4 (npm 10.9.9, o toolchain do `Dockerfile:41`) o pacote com `dev: true` não é instalado e a frase vale; com npm 11 (Node 24) ele é instalado e a frase é falsa. O QA da E19 testou em Node 24 e por isso concluiu o contrário. Classificação D-31: não viola critério escrito (a), não é alcançável por usuário (b), e a premissa da imagem não cai; fica como dívida: a frase deveria dizer "com o npm 10 da imagem `node:22` (o npm 11 instala o pacote mesmo marcado)". Consequência para o gatekeeper: o argumento da E19 de que "a imagem leva a versão vulnerável" não se sustenta para o `Dockerfile` atual; o falso verde do portão com a marca adulterada continua existindo para quem usar npm 11 ou trocar a imagem base, e isso é decisão da E19, não da E22.
2. **Pista 2: CONFIRMADA como omissão, dívida.** A seção `README.md:145-324` não escreve o modelo de ameaça (defesa em profundidade contra erro de programação numa rota, não contra código hostil dentro do repositório) e não cita a DV-01 (`docs/roadmap-v2/dividas.md:11`). A frase "toda resposta 401 ou 403 do servidor tem código nele, salvo pelos caminhos que a guarda não vê (escrita direta no socket e afins...)" é verdadeira para os valores comuns que testei, em Node 22 e 24 (item 2 da tabela); a lacuna da DV-01 exige código hostil na própria rota e nenhum cliente a alcança. Não viola (a), (b) nem (c). Sugestão de uma linha: "modelo de ameaça: erro de programação, não código hostil; ver DV-01".
3. **Dívida (imprecisão menor, texto novo desta rodada).** `README.md:1387-1389` diz que o run 39366804765 "o GitHub recusou antes de começar, por faturamento (H32)". Só a tentativa 1 foi recusada; a tentativa 2, reexecutada depois de o repositório virar público, terminou com 9 de 9 `success` (API: `attempts/1` `failure`, run atual `success`). A frase não é falsa sobre a tentativa 1, mas omite o verde. O `VEREDITO.md` da rodada 7 já diz que foi reexecutado.
4. **Dívida (deriva externa, não nova, não bloqueia).** Três frases presentes tratam o `auditar` como verde e hoje (2026-10-24) o `auditar` sai 1 sobre o lockfile de `60cbc2f`: `README.md:1632` ("Na raiz, o que sobra é só de desenvolvimento"), `docs/COLOCAR-DE-PE.md:49` ("`npm run auditar` sai com código 0 pela política do CP-03: dependência de runtime em zero") e `apps/api/PENDENCIAS.md` (item datado de 2026-10-13, ainda datado). Eram verdadeiras no run de 2026-10-21 (job `dependencias` verde); as advisories `GHSA-389g-gv7q-r4x8` (2026-10-22) e `GHSA-w74x-v6f9-j3xg` (2026-10-23) são posteriores, e `GHSA-mrhx-c7xc-m3w5` (zod, 2026-10-01) só passou a acusar agora na consulta. Nenhuma dessas linhas mudou nesta rodada (a de `COLOCAR-DE-PE.md:49` está no arquivo que mudou, mas só as linhas 41 e 352 foram editadas). É o achado 2 do QA da E19 (deriva do registro). Para a E22 é dívida: o README pede "o resultado depende do dia" para o `expo-doctor` e não para o `auditar`.
5. **Anotado.** O sinal de que as três frases imprecisas da rodada 6 foram resolvidas: (1) quinze das dezesseis: certo; (2) nove arquivos: certo; (3) histórico de runs: certo, exceto o achado 3.

Nenhum achado reprova pelo item 1 da seção 19 de `28`: nenhum viola um critério escrito da DoD da E22 por afirmação falsa nova (o único candidato, o do Dockerfile, é verdadeiro para o toolchain da imagem), nenhum é alcançável por usuário no produto deste SHA, e nenhum cai na lista da seção 7 de `28` por conta da E22.

## Não verificado

- A tabela "antes e depois" da correção 5 e a validação humana da etapa (Rafael ler e confirmar que nada ficou prometido sem existir): é humana, segue pendente.
- A imagem Docker em si: não há Docker neste Mac. Usei o tarball oficial do Node 22.23.4 (npm 10.9.9) como substituto do toolchain do `node:22-bookworm-slim`. Não conferi qual minor 22.x a tag flutuante entrega hoje, nem versões antigas do Node 22.
- Windows (os jobs `windows` e `plataformas` foram lidos no arquivo e no resultado do run, não executados por mim) e o proxy da borda (o README já diz que não foi medido).
- Os itens 1 a 8 da etapa que não mudaram no intervalo (`PENDENCIAS.md` do banco e da API, ADR 0008, `SAIDA-DE-MUNICIPIO.md`, comentários de `sessoes.ts`, `suspensao.ts` e `servidor.ts`): confiei na rodada 7 e não reli linha a linha.
- Os logs do CI (exigem token); li só a lista de jobs pela API pública.
- Um `expo-doctor` e o `test:campo` de hoje: não rodei.
- A DV-01 em si: tentei uma variante e não reproduzi; não fiz sondas de injeção por orientação da política.

## Risco residual

- A frase do Dockerfile depende da versão do npm e não diz isso: se alguém trocar a imagem base para Node 24, ela vira falsa sem o texto mudar.
- Três frases dependem do dia do registro e já estão velhas (achado 4); sem a E19 ou uma data no texto, voltarão a desatualizar.
- A seção da API afirma "GARANTE" sem citar a DV-01; quem a ler não saberá do limite até a V2-F02-E03.
- O histórico de CI do README está certo em substância, mas omite a reexecução verde do run 39366804765.

## Motivo do humano

Rafael ainda precisa ler a tabela antes e depois da E22 (validação humana da etapa, pendência já registrada) e decidir o conflito entre este relatório e o QA da E19 sobre a frase do `npm ci --omit=dev`: aqui ela é verdadeira para a imagem `node:22`, lá foi dada como falsa por teste em Node 24.
