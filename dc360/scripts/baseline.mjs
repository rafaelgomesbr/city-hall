#!/usr/bin/env node
/**
 * Repete a linha de base e arquiva a saída, sem segredo.
 *
 * O buraco que este arquivo fecha: o baseline do Baseline Zero (REL:01,
 * seção 3.4) foi medido numa única máquina, à mão, e nada dizia como outra
 * pessoa chegaria nos mesmos números. Sem isso, "o teste está vermelho" vira
 * opinião de quem rodou por último. Aqui a ordem dos comandos, o que se espera
 * de cada um e o que fazer com a saída estão escritos em código.
 *
 * O ESPERADO É O DE HOJE. Em 2026-09-30 a linha era vermelha de propósito (63
 * linhas, que a F00 consertou; a medição original segue arquivada em REL:01 3.4
 * e nas saídas de 2026-10-05). Depois das correções 1 da fase, a árvore está
 * verde, e o esperado de cada passo passou a ser o que a árvore verde produz.
 * Roteiro que espera o vermelho velho sai com código 1 numa árvore saudável, e
 * quem lê "divergente" deixa de saber se é defeito ou contabilidade atrasada
 * (foi o que reprovou a E01 em 2026-10-13).
 *
 * Quatro decisões que valem explicação:
 *
 * 1. NÃO ESCONDE DIVERGÊNCIA. O passo "confere" quando o resultado é o
 *    esperado. Quando é outro, há duas situações, e a diferença é a razão de
 *    ser deste arquivo:
 *    - "divergente-explicada": o passo declara em `divergenciaExplicada` um
 *      achado NOMEADO (id, onde está registrado, motivo, código de saída e o
 *      trecho exato da saída). Só vale se a saída bater com a descrição inteira;
 *      saída diferente da descrita volta a ser "divergente". Hoje não há
 *      nenhuma: a última foi o `expo-doctor` (V-DEP-4), fechada em 2026-10-13, que voltou na manhã de 2026-10-14 e foi fechada de novo no mesmo dia (E19, correção 4).
 *    - "divergente": sem explicação, ou com a explicação não casando. É defeito
 *      do produto, deriva externa nova ou contabilidade atrasada; nunca é
 *      maquiado: ou se conserta, ou se nomeia e se registra.
 *    Código de saída: 0 tudo confere; 1 há divergência, mas SÓ explicada; 3 há
 *    divergência sem explicação (reprova); 2 o próprio roteiro quebrou.
 *
 * 2. A CONTAGEM ESPERADA DE CADA SUÍTE TEM UMA FONTE ÚNICA E UM CONFERIDOR. As
 *    tabelas abaixo (base mais o que cada etapa declarou mudar) são a única
 *    fonte do total de cada suíte, e `npm run conferir:numeros` lê estas
 *    tabelas (`conferirContagensDoRoteiro`) e as compara com os casos que a
 *    árvore tem de verdade. Acrescentar teste sem declarar aqui reprova o
 *    conferidor, com a diferença e o nome da tabela a atualizar.
 *
 * 3. A SAÍDA É REDIGIDA ANTES DE IR PARA O DISCO. O raw de 2026-09-30 chegou a
 *    trazer um JWT de teste dentro de uma asserção. JWT, `Bearer`, `Basic`,
 *    URL com usuário e senha e a pasta pessoal do usuário viram marcadores
 *    antes de qualquer gravação, e o travessão também (a regra de conteúdo do
 *    repositório reprova o caractere em `docs/`, onde a evidência mora). A varredura automática de segredo (gitleaks)
 *    chegou com a F01-E04; este filtro continua como primeira defesa.
 *
 * 4. `--so-listar` imprime os comandos sem executar nada e sem criar pasta,
 *    para quem quer conferir o roteiro antes de gastar uma hora de máquina.
 *
 * O que ele NÃO faz: não conserta nada, não mexe no CI e não sobe banco.
 *
 * Uso:
 *   node scripts/baseline.mjs                 roda tudo e arquiva
 *   node scripts/baseline.mjs --so-listar     só lista os comandos
 *   node scripts/baseline.mjs --sem-instalar  pula os dois `npm ci`
 *   node scripts/baseline.mjs --so=id,id      roda só estes passos
 *   node scripts/baseline.mjs --pular=id,id   roda tudo menos estes
 *   node scripts/baseline.mjs --saida=PASTA   pasta de saída (padrão abaixo)
 */
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const AQUI = dirname(fileURLToPath(import.meta.url));
export const RAIZ_DO_PRODUTO = resolve(AQUI, "..");
const RAIZ_DO_REPOSITORIO = resolve(RAIZ_DO_PRODUTO, "..");
export const SAIDA_PADRAO = join(
  RAIZ_DO_REPOSITORIO,
  "docs",
  "evidencias-v2",
  "G00",
  "V2-F00-E01",
  "saidas",
);

/**
 * Quantos testes a própria E01 acrescenta ao `test:scripts`
 * (`baseline.test.mjs`). O baseline de 2026-09-30 mediu 165 sem ele; o total
 * esperado é 165 mais esta constante, e quem acrescentar teste ali atualiza
 * o número aqui. 16 da entrega original mais 10 da correção 1 (divergência
 * explicada, código de saída, conferidor de contagens com número velho
 * plantado). Mais 2 da correção 4 da E03 (V-ROT-02: o passo `e2e-firefox` e o
 * motor que vai por ambiente, não por prefixo de shell).
 */
export const TESTES_DA_E01_EM_SCRIPTS = 29;

/**
 * Quantos testes cada etapa SEGUINTE da fase F00 soma ao `test:scripts`, por ID.
 * O baseline de 2026-09-30 não os conhece (165 testes), e o esperado do passo
 * `test-scripts` é 165 mais a E01 mais tudo o que está aqui. Sem este registro,
 * cada etapa nova que ganha teste em `scripts/` faria o roteiro marcar
 * "divergente" por um motivo bom (teste a mais), e o sinal de "divergente"
 * perderia valor.
 *
 * Regra: a etapa que acrescenta teste em `scripts/` acrescenta uma linha aqui com
 * quantos casos o `node --test` passou a imprimir a mais (conta DINÂMICA: o laço
 * que gera caso vale um por volta, e três arquivos de `scripts/` fazem isso, por
 * isso contar `test(` no texto dá 226 onde o node imprime 230).
 *
 * Quem confere: `npm run conferir:numeros` roda `node --test` em `scripts/`, lê o
 * "# tests" e compara com o esperado do passo `test-scripts`, que é a soma desta
 * tabela. Número esquecido reprova ali, com a diferença na mensagem. (A promessa
 * antiga, "o baseline.test.mjs confere", era falsa: ele só olhava os arquivos da
 * segunda tabela e contava só `test(` na coluna zero. Reprovou a E01 em
 * 2026-10-13.)
 */
export const TESTES_DAS_ETAPAS_SEGUINTES_EM_SCRIPTS = {
  "V2-F00-E02": 17, // scripts/portao-de-skip.test.mjs
  /*
    V2-F00-E17: um caso novo em `scripts/entitlements-do-ios.test.mjs` (o
    negativo que prova que o `mode` escrito à mão reprova). O arquivo já
    existia, então ele NÃO entra na tabela de arquivos abaixo, que confere o
    arquivo inteiro contra a contagem da etapa.
  */
  "V2-F00-E17": 1,
  /*
    V2-F00-E21: 7 casos novos em `scripts/testar-campo.test.mjs` (o arquivo
    de `src/app` vira a rota do expo-router, o cache velho de `.expo/types` é
    apagado dizendo quais rotas faltam, o cache em dia fica, sem cache não se
    faz nada, rota prefixo de outra não conta, as rotas reais do disco, e a
    limpeza vem antes do typecheck). O arquivo já existia: fora da tabela de
    arquivos abaixo.
  */
  "V2-F00-E21": 7,
  /*
    V2-F00-E19: `scripts/auditar.test.mjs` já existia com 7 casos (que a tabela
    nunca registrou) e a correção 1 acrescentou 13 (a regra do CP-03: sem prazo,
    prazo inválido, sem dono, sem motivo, vencida, válida, a lista real, e a
    cópia adulterada do portão); a decisão D3 Q5 de 2026-10-13 acrescentou 3 (aviso de
    desenvolvimento nomeado na lista, o que não está na lista só avisa, e a lista real
    de desenvolvimento). Conferido por `node --test scripts/auditar.test.mjs`: 23.
    O arquivo entra na tabela de arquivos abaixo (a E01, correção 1, trocou o
    contador de `test(` na coluna zero por um que vê `it(` com recuo; o antigo
    dava 0 para este arquivo e por isso ele ficou de fora).
  */
  "V2-F00-E19": 88, // DV-04 (2026-10-25) acrescentou 11 (o runtime sai do GRAFO de dependências de execução e não da marca `dev` do lockfile: o grafo, as marcas, o defeito do grafo, a equivalência com `npm ls --omit=dev --all` nos dois lockfiles reais e num sintético, e cinco ponta a ponta com lockfile adulterado na raiz e no aplicativo); 28 até a correção 5; a correção 6 (2026-10-20) acrescentou 17 casos (prova de consulta real ao registro, exceções por advisory) e a 6b mais 9 (advisories aceitas como canário dentro das auditorias reais, gravidade aceita); a correção 7 (2026-10-20) mais 4 (a raiz é auditada na raiz e sem variável de workspace: de dentro de um workspace, com npm_config_workspace, o ambiente puro e a reprovação de runtime; a correção 8 (2026-10-20) mais 12 (lista permitida de chaves da configuração do npm, lockfile sempre auditado, workspaces auditados de novo pela raiz); a correção 9 (2026-10-20) mais 5 (npm-shrinkwrap.json na raiz, no aplicativo ou num workspace sai 2, padrão de workspace que não se expande sai 2, caminho com UUID que o npm mascara com ***, e as regras puras mesmoProjeto e shrinkwrapsPresentes); a correção 10 (2026-10-24) mais 2 (a exceção por advisory ganha `somenteEm`, que a restringe à cópia no caminho nomeado, como a do `zod` que o `@expo/cli` carrega por dentro, e a cópia do próprio projeto reprova; a lista do aplicativo deixa de ter `braces` e `sprintf-js`)
  /*
    V2-F00-E16, correção 1: `scripts/portao-sem-promessa-de-segundo-plano-do-aplicativo.test.mjs`
    é novo, com 4 casos (o portão que impede o aplicativo de prometer envio em
    segundo plano). Faltava aqui desde 81a5223; o roteiro de 2026-10-13 mostrava
    226 esperado contra 230 obtidos.

    V2-F00-E16, correção 2: o mesmo arquivo ganhou 5 casos (as quatro frases
    que a validação plantou, as variações fora da lista, a condição "aberto",
    as frases inofensivas e o plantio na fila real), então o arquivo tem 9.
    A tabela de arquivos abaixo confere o arquivo inteiro contra este número.

    V2-F00-E16, correção 2, segunda rodada de conserto: a regra deixou de ser
    por lista de palavras e passou a ser por classe (radicais de largar o
    aplicativo e de prometer envio), e o arquivo ganhou 6 casos (as promessas
    que o revisor plantou e suas variações, a promessa em duas frases, a forma
    antiga de "vai tentar de novo em instantes", o "aberto" negado, os avisos
    verdadeiros e o plantio da forma antiga na fila real). O arquivo tem 15.
  */
  "V2-F00-E16-correcao-1": 15,
  /*
    V2-F00-E21, correção 1: `scripts/conferir-indices-de-evidencia.test.mjs` é
    novo, com 26 casos (índice correto, tabela com nota em citação, arquivos do
    gatekeeper fora da conta, hash adulterado, arquivo editado, arquivo faltando,
    fim de linha trocado nos dois sentidos e misturado, CRLF a mais sem normalizar,
    hash inválido, linha repetida e caminho que sai da pasta, índice sem tabela,
    arquivo da pasta fora do índice, nome que só contém "validacao", etapa sem
    INDEX.md, índice que só lista o gatekeeper, índice aninhado, a evidência
    real inteira sem lista de tolerância, o script sem lista de exceções, a
    pasta CP-xx sem INDEX.md e cinco sobre CRLF no git: no índice (`-text`), no
    disco com `eol=lf` (o falso verde local), com `.ps1` e binário, sem git e o
    repositório real). O arquivo inteiro entra na conta.

    V2-F00-E21, correção 2: o mesmo arquivo ganha 6 casos que rodam o script
    como COMANDO, em processo filho, e conferem o código de saída que o CI lê
    (tudo certo dá 0; índice adulterado, CRLF, etapa sem INDEX.md, arquivo fora do
    índice e CRLF no disco segundo o git dão 1; e o script chamado por link
    simbólico confere do mesmo jeito). De 26 para 32; o arquivo inteiro segue
    na conta, por isso é o mesmo número da correção 1.
  */
  "V2-F00-E21-correcao-1": 36, // 26 na correção 1; a correção 2 (2026-10-20) acrescentou 6 e depois 4 casos que rodam o script como comando
  /*
    V2-F00-E21, correção 3: `scripts/ambiente-hostil.test.mjs` é novo, com 8
    casos (o montador das condições hostis do job `plataformas` do CI: LF para
    CRLF sem duplicar CR, a agulha antiga que some em CRLF, arquivo misto, o
    resumo de `git ls-files --eol` que aceita e o que reprova, a fixture do
    cache velho sem as três rotas, e o comando `eol` saindo com 1 diante de
    `i/crlf` e de saída vazia, e com 2 diante de subcomando desconhecido).
    A dívida DV-13/DV-14 acrescenta 4 casos ao MESMO arquivo (12 no total): o
    `crlf-pelo-git` (o git escreve o CRLF no disco, o índice segue LF, a árvore
    não aparece modificada, binário e o que está fora das pastas intocados; e
    pasta sem arquivo rastreado reprova) e o `conferir-painel` (total, falha e
    pulo contra o `baseline.mjs`, e o comando saindo com 1).
  */
  "V2-F00-E21-correcao-3": 12,
  /*
    V2-F01-E04: `scripts/politica-de-segredos.test.mjs` é novo, com 19 casos
    (a allowlist do `.gitleaks.toml` só com arquivo existente, razão e regra-alvo,
    e as reprovações de caminho órfão, pasta, curinga e regex ampla; o hook de
    pre-commit que avisa sem gitleaks e barra quando ele acusa; o workflow com
    histórico completo, `--redact`, permissão mínima, binário fixado por SHA-256 e
    ações fixadas por SHA; e o script `preparar`).
  */
  "V2-F01-E04": 21, // 19 na E04; a DV-17 acrescentou 2 (a exceção por conteúdo da migração 046 só perdoa a linha inteira nos formatos conhecidos, e regex de linha sem âncora reprova)
  /*
    V2-F01-E05 (SAST com Semgrep CE): `scripts/excecoes-de-seguranca.test.mjs` é
    novo, com 26 casos (a política de exceção `nosemgrep` com motivo, dono e
    prazo, a baseline triada, a ausência de cópia das regras do registro (o
    repositório é público), o teste das regras próprias e as travas do workflow
    `sast.yml`, entre elas a de que o registro só roda num passo de relatório
    que nunca reprova), e
    `scripts/sast-baseline.test.mjs` é novo, com 10 (a comparação com a baseline
    triada e a linha de comando).
  */
  "V2-F01-E05": 48, // a DV-15 acrescentou 3 (dependências do Semgrep por hash) e a DV-22 mais 1 (o script recusa exceção que não é YAML; os 7 testes do .trivyignore viraram 7 do .trivyignore.yaml); antes: // 26 na E05; a V2-F01-E20 acrescentou 16 no mesmo arquivo (a política de exceção do `.trivyignore` do Trivy, o `varrer-imagem.sh` com um Trivy de mentira e os dois workflows que o chamam); a correção 1 do CI acrescentou 2 (o stdout do `instalar` é só o caminho do binário, e a prova de que essa trava morde)
  "V2-F01-E05-baseline": 14, // 10 na E05; a DV-16 acrescentou 4 (erro de análise em warn também reprova em dc360/apps/api/src)
  /*
    V2-F01-E06: `scripts/dependabot.test.mjs` e novo, com 12 casos. Prende a
    configuracao de atualizacao de dependencias (`.github/dependabot.yml`: os
    quatro ecossistemas, semanais, major e minor da familia do Expo ignorados no
    aplicativo, patch so em grupo, sem auto-merge, com cooldown), o workflow da
    auditoria semanal (permissoes minimas, runner fixo, acoes por SHA, o portao
    do CP-03 chamado pelo node, sem mascarar falha) e a pagina
    `docs/DEPENDENCIAS.md`. Um caso e a prova de que o teste morde: uma
    configuracao sintetica sem o `ignore` do Expo reprova.
  */
  "V2-F01-E06": 13, // 12 na E06; a DV-18 acrescentou 1 (a frente docker-compose); a DV-27 mudou o teste das frentes para seis, sem caso novo
  /*
    V2-F01-E07: `scripts/versao.test.mjs` é novo, com 32 casos (SemVer e próxima
    versão, os positivos e negativos do conferidor de versões e de CHANGELOG, o
    nome de tag, e o comando com código de saída e a árvore real).
  */
  "V2-F01-E07": 32,
  /*
    V2-F01-E01: `scripts/ruleset-master.test.mjs` é novo, com 10 casos. Prende o
    ruleset da master (`.github/rulesets/master.json`: PR com 0 aprovações, só
    squash, sem force-push, exclusão nem exceção, branch atualizado) a nomes de
    check que existem de verdade nos workflows e rodam em todo pull request, e
    confere o CODEOWNERS e o modelo de PR. Dois casos são a prova de que o
    teste morde: rulesets sintéticos estragados reprovam.
    A correção da revisão 1 da F01 acrescenta 4 casos ao MESMO arquivo (14 no
    total): o ruleset dos ramos `producao` e `homologacao`
    (`.github/rulesets/ramos-de-implantacao.json`, exceção só para o app do
    Actions), o vínculo dele com os ramos que os workflows movem, a frase do
    `IMPLANTACAO.md` que faz da importação condição da primeira promoção e o
    caso negativo.
  */
  "V2-F01-E01": 14,
  /*
    V2-F01-E02 e V2-F01-E03: `scripts/conferir-workflows.test.mjs` é novo, com 24
    casos (15 da E02 e 9 da E03; é um arquivo só, por isso uma linha só). Aplica
    as regras de CI a TODOS os workflows de `.github/workflows/` (permissions de
    topo sem escrita, `timeout-minutes` em todo job, `uses:` por SHA de 40
    caracteres com a versão em comentário, nenhum `pull_request_target`, runner
    com versão) e prende os nomes dos quatro jobs do ruleset, o job da
    demonstração em arquivo próprio com filtro de caminho, `cancel-in-progress`
    só em pull_request e o cache do Playwright. Os casos negativos estragam um
    workflow sintético de cada jeito e provam que a regra morde. A E03 acrescenta
    a regra "todo comando do script `verificar` aparece em algum `run:`" (com
    `node scripts/auditar.mjs` valendo por `npm run auditar`), a proibição de
    `npm audit` que decide e os casos negativos dela.
    V2-F01-E12 acrescenta 20 casos ao MESMO arquivo (44 no total): as regras dos
    dois workflows de implantação (`deploy-hml.yml` e `promover-producao.yml`:
    gatilho, ambiente protegido, token por app, imagem por digest, migration de
    HML antes da API, `/saude` com versão e commit, selo de HML, escritas de job
    nomeadas) e os casos negativos que estragam o workflow real de cada jeito.
    A correção da revisão 1 da F01 acrescenta 4 casos ao MESMO arquivo (48 no
    total): a promoção exige o run bem-sucedido do `deploy-hml.yml` pela API do
    Actions, o digest do selo igual ao construído e a atestação de proveniência
    assinada pelo `deploy-hml.yml`, e o deploy de HML atesta as duas imagens.
    As dívidas DV-26 e DV-39 acrescentam 3 casos ao MESMO arquivo (51 no
    total): o job `aplicativo` empacota com o Metro (`expo export`, tempo limite
    no passo, conferidor e artefato), o job `windows` roda `lint`, `lint:teto` e
    `formato:conferir`, e o `plataformas` deixa o git escrever o CRLF e fixa a
    contagem do painel.
  */
  "V2-F01-E02": 51,
  /*
    DV-39: `scripts/conferir-empacotamento-do-campo.test.mjs` é novo, com 3 casos
    (o pacote do Metro com o zod 4 e o código do shared passa; sem um deles,
    pequeno demais, ausente ou sem plataforma reprova; e o comando com 0, 1 e 2).
  */
  "V2-F01-E02-empacotamento": 3,
  /*
    V2-F01-E10: `scripts/conferir-dominio.test.mjs` é novo, com 20 casos (os
    julgamentos puros de TLS, redirecionamento, HSTS, cabeçalhos do painel e
    preflight de CORS aceito e negado, a orquestração com a rede substituída, o
    `pedir` contra um servidor HTTP local e o comando com código de saída 2).
    `scripts/vercel-json.test.mjs` é novo, com 9 (o `vercel.json` real sem URL
    de API além da exceção declarada, os cabeçalhos de segurança, e os casos
    sintéticos que provam que a regra morde). V2-F01-E12 acrescenta 2 casos ao
    `vercel-json.test.mjs` (11 no total): a `master` deixa de ser publicada.
  */
  "V2-F01-E10": 20,
  "V2-F01-E10-vercel-json": 11,
  /*
    V2-F01-E12: `scripts/conferir-saude-remota.test.mjs` é novo, com 7 casos. É a
    régua que os workflows de deploy usam depois de cada `flyctl deploy`: o commit
    e a versão carimbados no build têm de aparecer em `/saude` (a imagem trocou de
    verdade), com tentativas, sem rede nem relógio reais.
  */
  "V2-F01-E12": 7,
  /*
    V2-F01-E16: `scripts/runbooks.test.mjs` é novo, com 15 casos. Prende os
    runbooks de `docs/runbooks/` ao que o repositório tem: as seções que a etapa
    exige, todo `node scripts/X.mjs` apontando para arquivo, opção e subcomando
    que existem, todo `npm run` um script do `package.json`, todo subcomando de
    `fly`, `eas` e `gh` numa lista nomeada, todo arquivo citado existente (salvo
    os nomeados que ainda nascerão), toda `depende de V2-F01-Enn` apontando para
    etapa do roadmap, e nenhum valor de segredo nem travessão. Quatro casos são
    a prova de que o conferidor morde: texto estragado reprova. O `rollback.md`
    é da E08 e não é varrido.
  */
  "V2-F01-E16": 15,
  /*
    V2-F01-E08: `scripts/smoke-das-imagens.test.mjs` é novo, com 15 casos. Prova a
    régua do smoke das imagens Docker com um `docker` de mentira (a imagem boa
    passa; root, falta de Chromium, usuário errado, versão ou commit trocados e
    `/saude` fora do ar reprovam) e prende os arquivos: a base por digest e o
    carimbo do build antes do `USER node` nos dois Dockerfiles, o job `imagens`
    (sem segredo, com Postgres 17, as duas imagens e as conferências), o job
    `implantavel` no Postgres 17, o check no ruleset e o `rollback.md`.
  */
  "V2-F01-E08": 18, // 15 na E08; a V2-F01-E21 acrescentou 3 no mesmo arquivo (PostGIS 17 por digest igual no compose e nos dois jobs, o `test:espacial` obrigatório no `implantavel` e os scripts/configs que o separam do `npm test`)
  /*
    V2-F01-E09: `scripts/conferir-ambiente.test.mjs` é novo, com 42 casos (a
    matriz `ambientes.json` bem formada e cobrindo exatamente o que cada
    `config.ts` lê; a lista de domínios compartilhados igual à do código; o
    repositório sintético estragado de cada jeito, com o controle intacto: toml
    de PROD sem `AMBIENTE_DC360`, segredo no `[env]`, HML com a identidade e o
    domínio de PROD, Node e Postgres divergentes; os nomes de `fly secrets list`
    contra a coluna do ambiente, incluindo o segredo exclusivo de PROD no app de
    HML; e o comando com código de saída 0, 1 e 2, sem nunca imprimir valor).
    A correção da revisão 1 da F01 acrescenta 4 casos ao MESMO arquivo (46 no
    total): as listas de papel de banco e de pedaço de host iguais às da API,
    `problemaNaIdentidadeDoBanco` recusando papel, host do provedor, região e
    palavra curta, e a matriz e os dois `fly*.toml` de PROD reprovando a
    identidade genérica.
  */
  "V2-F01-E09": 46,
  /*
    V2-F01-E17 (lint e formatação com baseline que só desce):
    `scripts/lint-teto.test.mjs` é novo, com 20 casos (o teto é exatamente a
    soma das duas baselines do ESLint, com folga ou a menos reprova; contra o
    ramo-base nada sobe, nem o total, nem uma regra, nem regra nova, nem arquivo
    novo na baseline de formatação; a leitura do ramo-base num repositório git
    de verdade; e onde o `package.json` e o workflow chamam o lint),
    `scripts/formato-conferir.test.mjs` é novo, com 8 (a comparação com a
    baseline de formatação, o Prettier de verdade numa pasta temporária e a
    baseline do repositório), e `scripts/lint-regras.test.mjs` é novo, com 10
    (as regras mordem: promessa solta e `async` mal usado em `apps/api/src`,
    hook com dependência faltando em `apps/web/src`, `eval`, `Function`, `any`
    explícito, `setTimeout` com texto, e as mesmas duas no aplicativo de campo).
  */
  "V2-F01-E17": 20,
  "V2-F01-E17-formato": 8,
  "V2-F01-E17-regras": 10,
  /*
    V2-F01-E15: `scripts/producao.test.mjs` é novo, com 19 casos (`--ambiente`
    obrigatório e só hml ou prod, a URL e o cofre por ambiente, HML sem banco
    que recusa em vez de herdar o de PROD, a senha por variável, chaveiro do
    macOS e do Linux, pergunta sem eco e a ajuda de cada sistema, sem nunca
    levar segredo, e o npm sem shell).
  */
  "V2-F01-E15": 19,
  /*
    V2-F01-E15, acréscimos em arquivos que já existiam (por isso não estão em
    `ARQUIVOS_DAS_ETAPAS_SEGUINTES_EM_SCRIPTS`, que ata uma linha a um arquivo
    inteiro): `copiar-producao.test.mjs` ganhou 12 casos (o
    `--extension=pg_trgm`, os candidatos de `pg_dump` de cada sistema, a ACL do
    Windows, a cópia de HML que não vale para PROD) e
    `migrar-producao.test.mjs` ganhou 4 (a recusa por ambiente).
  */
  "V2-F01-E15-acrescimos": 16,
  /*
    V2-F01-E19 (SBOM por release e licenças): `scripts/licencas.test.mjs` é
    novo, com 15 casos (o estado real passa; a leitura do lockfile de produção;
    as expressões SPDX; AGPL, componente sem licença, licença fora das listas e
    exceção vencida, malformada, órfã ou desnecessária reprovam com a política
    decidida ou como defeito da política; a linha de comando e o passo do job
    `produto`) e `scripts/sbom.test.mjs` é novo, com 11 (o conferidor de SBOM, o
    script que anexa ao Release com um `gh` de mentira e as travas do
    `sbom.yml`: escrita só no job `publicar`, só em tag).
  */
  "V2-F01-E19": 15,
  "V2-F01-E19-sbom": 14, // 11 na E19; a DV-27 acrescentou 3 (o gerador de SBOM instalado por lockfile próprio)
  /*
    V2-F01-E13: `scripts/perfis-do-eas.test.mjs` é novo, com 20 casos (o
    `app.config.ts` resolvido de verdade por perfil: bundle, pacote, nome e
    esquema de HML distintos dos de PROD; PROD e desenvolvimento inalterados; a
    URL de HML do `eas.json` vinda do `fly.hml.toml` e do `ambientes.json`; só
    `producao` com a URL de PROD; zero endereço de exemplo; `APNS_BUNDLE` e
    `APNS_AMBIENTE` dos dois toml; o `google-services.json`; e os negativos que
    provam que o teste reprova HML na URL de PROD, endereço de exemplo, canal
    repetido e o bundle igual ao de PROD; mais 3 casos do especificador de
    `import()` como URL `file://`, com o caminho do Windows simulado, que o CI 2
    mostrou derrubar o arquivo inteiro em Windows com
    `ERR_UNSUPPORTED_ESM_URL_SCHEME`).
  */
  "V2-F01-E13": 22, // 20 na E13; a DV-29 (2026-10-25) acrescentou 2 (o carregador do `app.config.ts` entende `enum`, `namespace` e propriedade de parâmetro, que o strip-types do Node recusa, e recusa TypeScript com erro de sintaxe)
  /*
    V2-F01-E22 (PostGIS no provedor): `scripts/conferir-extensoes.test.mjs` é
    novo, com 24 casos (a avaliação dos fatos: HML saudável, extensão ausente,
    em `public` ou em outro schema, PUBLIC ou `anon` com privilégio, `dc360_app`
    sem USAGE, SELECT ou EXECUTE, PROD só com a disponibilidade; as consultas
    são só leitura; a coleta; os argumentos; o comando com código 0, 1 e 2 sem
    nunca imprimir URL; e as consultas com o endurecimento num Postgres real do
    PGlite, com `pg_trgm` no lugar do PostGIS; e a coleta feita por um papel sem
    USAGE no schema, que o CI 2 mostrou falhar com 42501).
  */
  "V2-F01-E22": 24,
};

/** Arquivo de teste (em `scripts/`) que cada etapa da tabela acima acrescentou, para o conferidor. */
export const ARQUIVOS_DAS_ETAPAS_SEGUINTES_EM_SCRIPTS = {
  "V2-F00-E02": "portao-de-skip.test.mjs",
  "V2-F00-E19": "auditar.test.mjs",
  "V2-F00-E16-correcao-1": "portao-sem-promessa-de-segundo-plano-do-aplicativo.test.mjs",
  "V2-F00-E21-correcao-1": "conferir-indices-de-evidencia.test.mjs",
  "V2-F00-E21-correcao-3": "ambiente-hostil.test.mjs",
  "V2-F01-E04": "politica-de-segredos.test.mjs",
  "V2-F01-E05": "excecoes-de-seguranca.test.mjs",
  "V2-F01-E05-baseline": "sast-baseline.test.mjs",
  "V2-F01-E06": "dependabot.test.mjs",
  "V2-F01-E07": "versao.test.mjs",
  "V2-F01-E01": "ruleset-master.test.mjs",
  "V2-F01-E02": "conferir-workflows.test.mjs",
  "V2-F01-E02-empacotamento": "conferir-empacotamento-do-campo.test.mjs",
  "V2-F01-E10": "conferir-dominio.test.mjs",
  "V2-F01-E10-vercel-json": "vercel-json.test.mjs",
  "V2-F01-E12": "conferir-saude-remota.test.mjs",
  "V2-F01-E16": "runbooks.test.mjs",
  "V2-F01-E08": "smoke-das-imagens.test.mjs",
  "V2-F01-E09": "conferir-ambiente.test.mjs",
  "V2-F01-E17": "lint-teto.test.mjs",
  "V2-F01-E17-formato": "formato-conferir.test.mjs",
  "V2-F01-E17-regras": "lint-regras.test.mjs",
  "V2-F01-E15": "producao.test.mjs",
  "V2-F01-E19": "licencas.test.mjs",
  "V2-F01-E19-sbom": "sbom.test.mjs",
  "V2-F01-E13": "perfis-do-eas.test.mjs",
  "V2-F01-E22": "conferir-extensoes.test.mjs",
};

const SOMA_DAS_ETAPAS_SEGUINTES = Object.values(TESTES_DAS_ETAPAS_SEGUINTES_EM_SCRIPTS).reduce((a, b) => a + b, 0);

/** O que a API media em 2026-10-05 (E01), antes de qualquer conserto da fase. */
export const BASE_DO_TESTE_API = { total: 1109, falhas: 2, puladas: 18 };

/**
 * O que cada etapa SEGUINTE muda na contagem do `npm run test:api`, por ID,
 * para o esperado do passo `teste-api` acompanhar o conserto em vez de
 * marcar "divergente" por um motivo bom. Cada linha diz o porquê, e o
 * `baseline.test.mjs` confere que a soma bate com o esperado do passo.
 *
 * V2-F00-E04: os 5 casos do `describe.skip` da vigência passaram a rodar
 * (puladas 18 para 13, total sem mudança por eles), 4 casos novos de borda
 * entraram no mesmo arquivo (total 1109 para 1113), e a falha de
 * `senha-provisoria.test.ts` ("sessão viva cuja senha provisória venceu")
 * passou a ficar verde sozinha, porque ela depende da vigência na escrita
 * (falhas 2 para 1; a falha que sobra é o laudo do pacote, da E12). A suíte
 * `banco-tls` continua falhando na carga do arquivo e não entra na contagem.
 *
 * V2-F00-E04, correção 1: `apps/api/test/get-com-efeito.test.ts` é novo, com
 * 10 casos (o controle de quem está vigente, as quatro sondas contra os GET
 * que escrevem, a lista explícita pelo comportamento, a varredura do fonte, a
 * varredura de escrita com conta desativada e a preservação da cadeia em
 * `/auth/encerrar-sessoes`). Total 4 para 14, sem falha nem pulo novos.
 */
export const MUDANCAS_DO_TESTE_API_POR_ETAPA = {
  "V2-F00-E04": { total: 14, falhas: -1, puladas: -5 },
  /*
    V2-F00-E05: `apps/api/test/codigos-de-erro.test.ts` e novo, com 16
    casos (os seis códigos saindo do servidor real, renovação de conta
    desativada, resistência a enumeração na entrada, isolamento e o leitor de
    fonte do catálogo). Os testes que esperavam o código `sessao` foram
    atualizados no lugar, sem mudar a contagem. Nenhuma falha nova nem pulo.
  */
  "V2-F00-E05": { total: 16, falhas: 0, puladas: 0 },
  /*
    V2-F00-E06: `apps/api/test/campo-integracao.test.ts` ganhou 5 casos (conta
    desativada entre enfileirar e drenar, sessão encerrada, token vencido que
    renova uma vez, token vencido sem renovação que pausa, e o 403
    `sem_permissao` que continua bloqueando). O caso "token vencido bloqueia o
    item" foi reescrito no lugar (agora a fila pausa), sem mudar a contagem.
  */
  "V2-F00-E06": { total: 5, falhas: 0, puladas: 0 },
  /*
    V2-F00-E07: `apps/api/test/familia-da-sessao.test.ts` e novo, com 20 casos
    (a cadeia da sessao rotacionada, o papel alterado e a senha provisoria
    vencida pelo servico). Os dois testes que esperavam `sessao_encerrada` para
    papel diferente do token foram atualizados no lugar, sem mudar a contagem.
    Nenhuma falha nova nem pulo.
  */
  "V2-F00-E07": { total: 20, falhas: 0, puladas: 0 },
  /*
    V2-F00-E08: `apps/api/test/leitura-do-agente-oficios-e-avisos.test.ts` e
    novo, com 14 casos (o agente recebe 403 em `GET /oficios` e `GET
    /oficios/:id`, o sino e a contagem dele sao os da equipe, o aviso de outra
    equipe nao se marca como lido, e a escrita dentro do GET segue idempotente).
    Nenhum teste existente mudou. Nenhuma falha nova nem pulo.
  */
  "V2-F00-E08": { total: 14, falhas: 0, puladas: 0 },
  /*
    V2-F00-E09: `apps/api/test/sessoes-da-conta.test.ts` e novo, com 27 casos
    (as duas leituras novas, `GET /auth/sessoes` e `GET /usuarios/:id/sessoes`,
    com o que elas nao podem entregar: IP, user-agent, sessao de outra pessoa ou
    de outro municipio; posto, 404 e 403 nas tres rotas; as duas recusas 422; e
    o resumo do aparelho). Nenhum teste existente mudou. Nenhuma falha nova nem
    pulo.
  */
  "V2-F00-E09": { total: 27, falhas: 0, puladas: 0 },
  /*
    V2-F00-E10: dois arquivos novos. `apps/api/test/recuperacao-sem-oraculo.test.ts`
    (15 casos: o envio sai depois da resposta, a falha do provedor nao vira 500
    so para quem tem conta, o teto de pedidos por email, municipio que nao se
    escolhe pelo pedido, o token so como hash, o link que vence, as frases com
    acento, `GET /auth/recuperacao` e o limite por endereco; 8 reprovam antes do
    conserto) e `apps/api/test/recuperacao-em-producao.test.ts` (10 casos: o
    `fly.toml` desligado e a partida de producao que recusa as combinacoes
    perigosas). `recuperacao.test.ts` e `superficie.test.ts` mudaram no lugar,
    sem mudar a contagem. Nenhuma falha nova nem pulo.
  */
  "V2-F00-E10": { total: 25, falhas: 0, puladas: 0 },
  /*
    V2-F00-E11: `apps/api/test/pacote-de-saida-contrato.test.ts` e novo, com 8
    casos (a rota existe so sob `/saida`, o pacote traz so as linhas do municipio
    do token conferidas uma a uma, coluna proibida e valor sentinela nao saem, a
    soma SHA-256 de cada arquivo confere, a coordenadora recebe 403 e o municipio
    suspenso recebe 403 `acesso_suspenso` sem deixar registro de exportacao).
    `ler-zip.ts` e apoio, nao conta. Nenhum teste existente mudou. Nenhuma falha
    nova nem pulo; os 8 passam tambem sem o conserto (a API ja estava certa: o
    defeito era do cliente, e a sonda dele esta no painel).
  */
  "V2-F00-E11": { total: 8, falhas: 0, puladas: 0 },
  /*
    V2-F00-E12: `apps/api/test/saida-de-municipio.test.ts` ganhou 6 casos no
    bloco novo do aviso de equipe (os dois laudos com o mesmo trecho quando as
    equipes divergem, equipes iguais sem aviso, agente sem equipe com a frase
    propria, as duas colunas nulas da vistoria anterior a migracao 024 sem aviso
    falso, a coleta sem despacho com a nota propria no lugar da de divergencia, e
    o isolamento do nome de equipe do outro municipio). A falha que a E04 deixou
    anotada como "o laudo do pacote, da E12" fica verde aqui (falhas 1 para 0),
    e com ela a API fecha a fase SEM nenhuma falha de teste. A suite
    `banco-tls` continua reprovando na carga do arquivo (E21) e segue fora da
    contagem; as 13 puladas sao dela.
  */
  "V2-F00-E12": { total: 6, falhas: -1, puladas: 0 },
  /*
    V2-F00-E12, correcao 1: o mesmo arquivo ganha o bloco "O laudo do pacote e o
    da rota, campo por campo", com 3 casos: a coordenada da vistoria igual nos
    dois laudos (consertada, duas colunas na consulta do pacote) e duas
    DIFERENCAS CONHECIDAS travadas ate a F09-E02 (as duas secoes que o pacote nao
    tem, e a foto avulsa que o pacote mistura no registro da vistoria). Nenhuma
    falha nem pulo.
  */
  "V2-F00-E12-correcao-1": { total: 3, falhas: 0, puladas: 0 },
  /*
    V2-F00-E15: `apps/api/test/precisao-do-gps-na-sincronizacao.test.ts` e novo,
    com 3 casos pela rota de verdade: o piso de 1 metro que o aparelho passou a
    mandar responde 201, a precisao nula continua aceita, e o 0 de aplicativo
    antigo continua 422 com o campo nomeado e a frase em portugues. Nenhum
    codigo da API mudou; o esquema compartilhado so ganhou o nome
    `gpsPrecisaoMetrosSchema`, com a mesma regra.
  */
  "V2-F00-E15": { total: 3, falhas: 0, puladas: 0 },
  /*
    V2-F00-E18: `apps/api/test/cors-do-envio-de-evidencia.test.ts` e novo, com 8
    casos (o preflight do PUT de envio libera `if-none-match` para a origem do
    painel, todo cabecalho que a autorizacao manda repetir passa, origem fora da
    lista fica sem `access-control-allow-origin`, `x-qualquer` nao passa, a
    escrita unica segue com 412, e a URL vencida, a assinatura trocada e a chave
    de outro municipio seguem com 403). 3 reprovam antes do conserto. Nenhum
    teste existente mudou. Nenhuma falha nova nem pulo.
  */
  "V2-F00-E18": { total: 8, falhas: 0, puladas: 0 },
  /*
    V2-F00-E21: os 13 casos de `banco-tls.test.ts` deixam de ser pulados e
    RODAM (puladas 13 para 0, total sem mudança por eles): o `beforeAll`
    caía porque o `openssl req` herdava um OPENSSL_CONF apontando para arquivo
    inexistente (instalador do driver ODBC do PostgreSQL). Entra
    `apps/api/test/openssl-do-teste.test.ts`, com 10 casos (a variável quebrada
    sai e diz por quê, a válida fica, ausente passa igual, qualquer caixa, o
    ambiente de quem chamou não muda; o `openssl` achado no PATH, ao lado do
    `git` no Windows quando o PATH não o tem (o PowerShell), e a reprovação
    com frase quando não existe; e o `openssl` de verdade com a variável
    inexistente e com uma configuração válida que ele comprovadamente lê).
    `openssl-do-teste.ts` é apoio, não conta. Com isso `npm run test:api` sai
    com código 0.
  */
  "V2-F00-E21": { total: 10, falhas: 0, puladas: -13 },
  /*
    V2-F00-E23: `apps/api/test/contrato-do-painel.test.ts` e novo, com 12 casos
    (6 contra a arvore atual: rotas lidas, cada chamada de `dados/http.ts` com
    metodo e caminho registrados, ancora de contagem, chamadas sem token so nas
    isencoes, excecoes sem entrada morta, expansao dos tipos de documento; e 6
    sinteticos: o caminho certo do pacote passa, `POST /pacote.zip` reprova,
    `GET /saida/pacote.zip` reprova, parametro faltando reprova, chamada nao
    lida fura a ancora, extrator que perde uma chamada reprova).
    `superficie-registrada.ts` e apoio (a leitura de `printRoutes` e a lista
    `SEM_TOKEN`, movidas de `superficie.test.ts` sem mudar caso nenhum), nao
    conta. Nenhuma falha nova nem pulo.
  */
  "V2-F00-E23": { total: 12, falhas: 0, puladas: 0 },
  /*
    V2-F00-E05, correcao 1: seis casos em `apps/api/test/codigos-de-erro.test.ts`
    ("Renovar depois de desativar PELO ENDPOINT real": a renovacao da conta
    desativada pelo painel responde 403 `conta_desativada`, o token ja
    rotacionado, os tres negativos e a entrada generica). O caso de
    `api.test.ts` que esperava 401 foi reescrito no lugar, sem mudar a conta.
  */
  "V2-F00-E05-correcao-1": { total: 6, falhas: 0, puladas: 0 },
  /*
    V2-F00-E06, correcao 1: `apps/api/test/evidencia-so-do-autor.test.ts` e novo,
    com 11 casos (autorizar e confirmar o envio da foto conferem o autor: 409
    `autor_divergente`, autor certo aceito, outro municipio 404, a recusa nao
    vira oraculo), e `campo-integracao.test.ts` ganha 2 (a senha redefinida de
    ponta a ponta e a troca de conta com a foto em voo). Nenhuma falha nem pulo.
  */
  "V2-F00-E06-correcao-1": { total: 13, falhas: 0, puladas: 0 },
  /*
    Correções 2 (2026-10-14), contadas contra o `4b96ea7` pelo `vitest list`:
    V2-F00-E04 acrescentou 2 casos a `acesso-suspenso.test.ts` (18 para 20);
    V2-F00-E07 trouxe `renovacao-contra-encerramento.test.ts`, novo: 5 casos de
    PGlite que rodam sempre e 9 de Postgres real (`describe.skipIf`), que só
    rodam com `DC360_POSTGRES_DE_PROVA` (o job `implantavel` do CI define; o
    roteiro da linha de base não). No roteiro eles são 9 PULADOS por ambiente:
    o `vitest run` imprime 1319 casos (1310 mais esses 9) e 9 pulados, e a lista
    do `vitest list` enumera 1310. V2-F00-E12 acrescentou 4 casos a
    `saida-de-municipio.test.ts` (28 para 32: o controle positivo da assinatura,
    o armazenamento que lança, o armazenamento fora do ar e a diferença
    conhecida). Soma 11 na lista (de 1299 para 1310) e 20 no `vitest run`.
  */
  "V2-F00-E04-correcao-2": { total: 2, falhas: 0, puladas: 0 },
  "V2-F00-E07-correcao-2": { total: 14, falhas: 0, puladas: 9 },
  "V2-F00-E12-correcao-2": { total: 4, falhas: 0, puladas: 0 },
  /*
    V2-F00-E07, correção 3 (2026-10-14), contada contra o `52952a1`:
    `renovacao-contra-encerramento.test.ts` ganha 4 casos de PGlite (o login
    com a senha antiga contra a troca, a redefinição e a desativação, e a
    renovação que perde a trava para a desativação) e 7 de Postgres real
    (`describe.skipIf`, pulados no roteiro: os mesmos 4 mais as três disputas
    com a trava já tomada pelo login); `segundo-fator.test.ts` ganha 2 (o
    desafio da senha antiga, no código e na ativação); `corpo-ilegivel.test.ts`
    é novo, com 3 (corpo vazio e JSON torto respondem 400, e o pedido sem
    corpo segue aceito). Soma 9 na lista (de 1310 para 1319) e 16 no `vitest
    run` (1335, com 16 pulados por ambiente).
  */
  "V2-F00-E07-correcao-3": { total: 16, falhas: 0, puladas: 7 },
  /*
    V2-F00-E07, complemento da correção 3 (2026-10-14), contado contra o
    `3ee020c`: `renovacao-contra-encerramento.test.ts` ganha 1 caso de PGlite
    (a sequência do login: abrir a sessão, a trava, a releitura) e 4 de
    Postgres real (pulados no roteiro: as três disputas seguradas entre abrir
    a sessão e a trava, e o login com a trava contra a suspensão pelo
    console); `senha-provisoria.test.ts` ganha 1 (a escrita comum com a
    provisória vencida responde 401) e `segundo-fator.test.ts` ganha 1 (a
    senha que muda no meio da confirmação não liga o recurso). Soma 3 na
    lista (de 1319 para 1322) e 7 no `vitest run` (1342, com 20 pulados por
    ambiente).
  */
  "V2-F00-E07-correcao-3-complemento": { total: 7, falhas: 0, puladas: 4 },
  /*
    V2-F00-E12, correção 3 (2026-10-15), contada contra o `11d9446`:
    `saida-de-municipio.test.ts` ganha 5 casos no bloco "campo por campo" (a
    seção dos registros perdidos igual nos dois laudos, o isolamento das
    perdas com controle positivo, a assinatura coletada e perdida igual no
    laudo e no termo de interdição, a re-vistoria sem a perda da ida
    anterior, e a diferença conhecida do termo de interdição depois da
    re-vistoria); o caso das "duas seções" que faltavam no pacote foi
    reescrito no lugar (agora falta uma), sem mudar a contagem. De 32 para 37
    no arquivo. Nenhuma falha nova nem pulo.
  */
  "V2-F00-E12-correcao-3": { total: 5, falhas: 0, puladas: 0 },
  // V2-F00-E05, correção 2: `codigos-de-erro.test.ts` foi de 22 para 116 casos: saem os 4 de leitura por texto e entram 98, sendo 4 de execução (as quatro recusas de permissão por posto e URL assinada saindo do servidor real) e 94 da varredura pela árvore sintática (API, pacote compartilhado e console, código morto, `sessao`, os dez códigos, as formas de emitir que reprovam e que falham para o lado seguro em fonte de exemplo, inclusive as da revisão independente das três passadas, os repasses presos à origem, o controle negativo e as mutações no fonte real, em memória); e `prova-dinamica-dos-codigos-de-erro.test.ts` é novo, com 1 caso (todos os pares método + caminho registrados, 12 perfis, endereço distinto por pedido, zero 429, alcance medido com piso, todo 401 e 403 no catálogo com o status do catálogo). Total 22 para 117. Sem pulo nem falha novos.
  "V2-F00-E05-correcao-2": { total: 95, falhas: 0, puladas: 0 },
  /*
    V2-F00-E07, correção 4 (2026-10-19), contada contra o `0290af5`:
    `renovacao-contra-encerramento.test.ts` ganha 9 casos de PGlite (a troca
    de senha do invasor segurada depois de ler a senha atual contra cinco
    reações, a mesma sessão trocando duas vezes, a provisória que vence no
    meio, a troca com o token de antes da renovação preservando a própria
    cadeia, e a ordem dos comandos da troca) e 11 de Postgres real
    (`describe.skipIf`, pulados no roteiro: os mesmos 7 da troca segurada e as
    quatro disputas com a troca já segurando a linha e a trava). Soma 9 na
    lista (de 1327 para 1336) e 20 no `vitest run` (1367, com 31 pulados por
    ambiente).
  */
  "V2-F00-E07-correcao-4": { total: 20, falhas: 0, puladas: 11 },
  /*
    V2-F00-E09, correção 3 (2026-10-19), contada contra o commit da correção 4
    da E07: `id-da-propria-conta.test.ts` é novo, com 13 casos de PGlite (as
    três recusas sobre a própria conta com o id em minúsculas, em maiúsculas e
    com caixa misturada, os formatos alternativos de uuid nas três rotas, e o
    id de outra pessoa em maiúsculas continuando a valer). Soma 13 na lista
    (de 1336 para 1349) e 13 no `vitest run` (1380, com 31 pulados).
  */
  "V2-F00-E09-correcao-3": { total: 13, falhas: 0, puladas: 0 },
  /*
    V2-F00-E10, correção 3 (2026-10-19), contada contra o commit da correção 3
    da E09: `recuperacao-morre-com-a-credencial.test.ts` é novo, com 7 casos de
    PGlite (o controle, o link pendente contra a redefinição, a troca e a
    desativação, o link vivo numa conta desativada, dois links pendentes, e o
    que não é senha nem desativação não matando o link);
    `renovacao-contra-encerramento.test.ts` ganha 1 de Postgres real
    (`describe.skipIf`, pulado no roteiro: o link e a redefinição no mesmo
    instante). Soma 7 na lista (de 1349 para 1356) e 8 no `vitest run` (1388,
    com 32 pulados).
  */
  "V2-F00-E10-correcao-3": { total: 8, falhas: 0, puladas: 1 },
  /*
    V2-F00-E07, complemento da correção 4 (2026-10-19), pedido da revisão:
    `renovacao-contra-encerramento.test.ts` ganha 2 casos de Postgres real
    (`describe.skipIf`, pulados no roteiro: a troca chegando com um
    encerramento e com uma renovação já segurando a trava da pessoa). A lista
    não muda (1356) e o `vitest run` soma 2 (1390, com 34 pulados).
  */
  "V2-F00-E07-correcao-4-complemento": { total: 2, falhas: 0, puladas: 2 },
  /*
    V2-F00-E09, correção 4 (2026-10-19), arbitragem da rodada 5:
    `mensagens-visiveis-com-acento.test.ts` é novo, com 12 casos (a varredura
    morde numa fonte sintética, e a árvore real da API, do painel, do
    compartilhado e do motor de campo não tem frase de tela sem acento), e
    `senha-provisoria.test.ts` ganha 1 caso de PGlite (a senha atual errada na
    troca responde 401 com a frase acentuada que diz o que fazer). Soma 13 na
    lista e 13 no `vitest run`, sem pulo novo.
  */
  "V2-F00-E09-correcao-4": { total: 13, falhas: 0, puladas: 0 },
  /*
    V2-F00-E05, correção 3 (2026-10-19), contada contra o `ca5a38f`:
    `codigos-de-erro.test.ts` vai de 116 para 169 casos. Entram 6 mutações do
    red-team da rodada 5 no texto real de `rotas/orgaos.ts`, em memória (A, B,
    C, N, N2 e o homônimo D), 46 formas da família delas em fonte de exemplo
    (corpo por constante escrito, `let`, exportado ou apelidado, colchete,
    chave calculada, `.call`/`.apply`/`.bind`, `statusCode` abreviado, texto
    com `FST_`, classe forjada, `toJSON`, serializador, `eval`, `redirect`) e
    1 caso de controle (o que é só lido passa). Sem pulo nem falha novos.
    Segunda parte da correção 3 (depois da revisão independente): a GUARDA em
    tempo de execução. `codigos-de-erro.test.ts` ganha mais 2 (escrita no
    socket e `code(200).code(403)`), indo a 171; `guarda-de-codigos-de-erro.test.ts`
    é novo, com 49 (as dezesseis formas da revisão como rotas, nos dois modos,
    o `JSON.stringify` trocado nos dois, status trocado e 401 fora, HEAD,
    controles e 10 casos da conferência isolada). 53 + 2 + 49 = 104.
    Terceira parte (a guarda passou do `onSend` para a resposta do Node):
    `guarda-de-codigos-de-erro.test.ts` vai de 49 para 71 (+16 escapes da
    revisão da primeira guarda, +1 e08, +1 log sem dado pessoal, +1 globais
    trocados depois da carga, e a conferência isolada troca 2 casos e ganha 3:
    teto, chave repetida com escape e chave `erro` aninhada). 104 + 22 = 126.
  */
  "V2-F00-E05-correcao-3": { total: 126, falhas: 0, puladas: 0 },
  /*
    V2-F00-E05, correção 4 (2026-10-20): status não inteiro na guarda e na
    varredura: guarda da API de 71 para 95 casos (+24) e
    `codigos-de-erro.test.ts` de 171 para 193 (+22); na segunda parte
    (resposta crua, `_storeHeader`, chave calculada) guarda de 95 para 108
    (+13) e `codigos-de-erro.test.ts` de 193 para 213 (+20). Na terceira parte
    (socket por `.client` e ouvintes do servidor) `codigos-de-erro.test.ts`
    de 213 para 229 (+16). Soma 95, sem
    falha nem pulo novos. A guarda do console (+12) está no número do
    próprio passo.
  */
  "V2-F00-E05-correcao-4": { total: 95, falhas: 0, puladas: 0 },
  /*
    V2-F00-E05, correção 6 (2026-10-20): corpo além do `content-length`,
    trailer no desvio e `flushHeaders`: guarda da API de 108 para 119 (+11).
    A guarda do console (+2) está no número do próprio passo.
  */
  "V2-F00-E05-correcao-6": { total: 11, falhas: 0, puladas: 0 },
  /*
    V2-F00-E05, correção 7 (2026-10-20): as formas da rodada 7 sobre `fd17ff4`
    (ReadableStream e content-length 0, 403 do catálogo com content-length
    errado, transfer-encoding identity, addTrailers, status 1xx como resposta
    final): guarda da API de 119 para 138 (+19). A guarda do console (+16) está
    no número do próprio passo.
  */
  "V2-F00-E05-correcao-7": { total: 19, falhas: 0, puladas: 0 },
  /*
    V2-F00-E05, correção 7b (2026-10-20, CI em Node 22): a guarda recusa CR ou
    LF nas Early Hints em qualquer versão do Node, e o 103 legítimo antes do
    403 do catálogo passa: guarda da API de 138 para 140 (+2). A guarda do
    console (+3) está no número do próprio passo.
  */
  "V2-F00-E05-correcao-7b": { total: 2, falhas: 0, puladas: 0 },
  /*
    V2-F01-E08: `apps/api/test/saude-versao.test.ts` e novo, com 7 casos (a leitura
    pura de `versao-do-build.ts`: a versao e o SHA do build, o SHA abreviado, a
    ausencia fora de uma imagem e o formato que a rota publica nao aceita, mais
    `GET /saude` repetindo o carimbo, dizendo `desconhecida` e nao ecoando valor
    fora do formato). O console ganha 3 casos no mesmo assunto, que estao no
    numero do proprio passo (teste-console). Nenhuma falha nem pulo.
  */
  "V2-F01-E08": { total: 7, falhas: 0, puladas: 0 },
  /*
    V2-F01-E09: dois arquivos novos na API. `apps/api/test/contrato-de-ambiente.test.ts`
    (50 casos: prod e hml válidos partem; produção sem `AMBIENTE_DC360`, `dev`
    ou valor desconhecido recusam; a DATABASE_URL de PROD em HML (e a de HML em
    PROD) recusa sem repetir a URL; identidade por segmento; domínio do
    ambiente, compartilhado e mal formado; URL_PAINEL e ORIGENS_PERMITIDAS de
    outro ambiente; o endurecimento das origens (http, barra final, caminho,
    consulta, usuário, porta padrão, maiúsculas, lista vazia); MARCA_DAGUA vazia
    e e-mail sem lista de teste em HML; o filtro de teste proibido em PROD; o
    esquema sem variável de organização; e o `[env]` do `fly.toml` de verdade
    subindo com segredos de mentira) e `apps/api/test/dominios-de-teste.test.ts`
    (10 casos do filtro de e-mail de HML e da ligação em `index.ts`). Os helpers
    de `config.test.ts`, `banco-tls.test.ts`, `log.test.ts` e
    `recuperacao-em-producao.test.ts` ganharam as três declarações, sem mudar a
    contagem. Nenhuma falha nem pulo novos.
  */
  "V2-F01-E09": { total: 60, falhas: 0, puladas: 0 },
  /*
    V2-F01-E09, correção da revisão 1: `IDENTIDADE_DO_BANCO` genérica (papel de
    banco, pedaço de host do provedor, região, palavra curta) passa a recusar a
    partida. 3 casos novos em `apps/api/test/contrato-de-ambiente.test.ts`
    (as identidades recusadas com o motivo, a URL de PROD que "constava" e a
    referência real continuando aceita). Os helpers de `config.test.ts`,
    `banco-tls.test.ts`, `log.test.ts` e `recuperacao-em-producao.test.ts`
    ganharam uma referência de projeto no lugar de identidades curtas, sem mudar
    a contagem. O console ganha 1 caso (`contrato-de-ambiente.test.ts`), que está
    no número do próprio passo (teste-console, +1: 338 para 339).
  */
  "V2-F01-E09-correcao-revisao-1": { total: 3, falhas: 0, puladas: 0 },
  // V2-F01-E14: `request-id.test.ts` (13), `reportador-de-erros.test.ts` (17), `rotinas-em-nivel-error.test.ts` (8) e `alerta-de-armazenamento.test.ts` (11).
  "V2-F01-E14": { total: 49, falhas: 0, puladas: 0 },
  /*
    V2-F01-E11: dois arquivos novos na API. `apps/api/test/semear-homologacao.test.ts`
    (22 casos: o sorteio da senha; o SQL de HML sem hash, sem a senha pública e só
    com e-mail em example.org e telefone do bloco 90000; as recusas do ambiente
    (fora de `hml`, sem URL ou identidade, identidade de PROD declarada ou na
    URL, URL de outro banco, o marcador do `fly.hml.toml`); a semente de verdade
    no Postgres em WebAssembly, com login pela senha sorteada, a senha pública
    recusada em toda conta, a conta de Serra Alta recebendo 404 num recurso de
    Vale Fundo, semear de novo recusando sem trocar senha; banco com município
    real recusando sem escrever; falha no meio desfazendo tudo; e o comando de
    verdade recusando antes de conectar) e `apps/api/test/fly-hml.test.ts`
    (9 casos: a API configurada como o `fly.hml.toml` manda parte em HML com a
    marca d'água e o push desligado, e NÃO parte com a `DATABASE_URL` de PROD,
    com o marcador de identidade, com origem ou painel de PROD ou sem marca
    d'água). O console ganha 4 casos (`apps/console/test/fly-hml.test.ts`, o
    mesmo para o `fly.console.hml.toml`), que estão no número do próprio passo
    (teste-console, +4: de 330 para 334 com a E11 sozinha, e 338 junto com os 4 da E14). Nenhuma falha nem pulo novos.
  */
  "V2-F01-E11": { total: 31, falhas: 0, puladas: 0 },
  // V2-F00-E19, correção 11: `apps/api/test/campo-obrigatorio-ausente.test.ts` e novo, com 2 casos (o 422 real de `POST /ocorrencias` sem `tipo` e sem `canalEntrada` diz "Campo obrigatório" e nenhum "undefined" ou "null" sai no corpo; o enum presente e errado continua dizendo o valor e os aceitos).
  "V2-F00-E19-correcao-11": { total: 2, falhas: 0, puladas: 0 },
  /*
    V2-F02-E01: `apps/api/test/versao-v1.test.ts` e novo, com 31 casos (a
    paridade entre `/v1` e o espelho sem prefixo, a mesma resposta nos dois,
    o isolamento entre municipios, o que fica fora do prefixo, os cabecalhos
    de depreciacao, `ESPELHO_LEGADO_ATE`, a senha provisoria, a marca da fila
    do campo e o limitador). `campo-integracao-v1.test.ts` e novo e importa
    `campo-integracao.test.ts` com o prefixo `/v1` ligado, entao roda os 17
    casos dele uma segunda vez. `log.test.ts` ganha 1 caso (o token do
    oficio colado sob `/v1` nao sai no log). Os demais arquivos tocados
    (`superficie`, `get-com-efeito`, `prova-dinamica`) mudaram por dentro,
    sem caso novo. Nenhuma falha nem pulo novos.
  */
  "V2-F02-E01": { total: 49, falhas: 0, puladas: 0 },
  // V2-F02-E09: `apps/api/test/fuso-do-protocolo.test.ts` e novo, com 9 casos (o ano do protocolo na virada de 01/01/2027 em São Paulo e no Acre, o fuso vindo da organização do token, UF desconhecida, a sequência por ano, e as datas e o nome do CSV no fuso do município com o servidor em UTC).
  "V2-F02-E09": { total: 9, falhas: 0, puladas: 0 },
  // V2-F02-E03, parte 1C (DV-01 e DV-03): `apps/api/test/guarda-de-codigos-de-erro.test.ts` ganhou 18 casos (9 do retrato dos cabeçalhos, 2 de tempo linear e 7 da contagem de chaves `erro`). O console ganhou 18 no mesmo arquivo de teste (número do próprio passo teste-console, 339 para 357).
  "V2-F02-E03-parte-1C": { total: 18, falhas: 0, puladas: 0 },
  // V2-F02-E04, parte 2D: `apps/api/test/openapi.test.ts` e novo, com 24 casos (a paridade com as rotas que o Fastify registrou e os quatro defeitos que ela reprova, o teto das pendências, `nova` sem resposta, o relatório das existentes sem resposta, o `v1.json` igual ao regenerado, a forma OpenAPI 3.1, as referências, o gerador que falha com parâmetro de caminho sem esquema e o documento que não é rota).
  "V2-F02-E04-parte-2D": { total: 24, falhas: 0, puladas: 0 },
  // V2-F02-E04, correção 1: `apps/api/test/openapi.test.ts` ganhou 4 casos (a fusão das formas com e sem barra final provada pelo handler, a lista congelada de pendentes por igualdade) e `apps/api/test/openapi-regras.test.ts` é novo, com 10 casos (as regras `refine` anotadas em `x-regras-adicionais`, o guarda que reprova esquema refinado sem anotação, o corpo opcional com `required: false`).
  "V2-F02-E04-correcao-1": { total: 14, falhas: 0, puladas: 0 },
  // V2-F02-E04, parte 3C2: `apps/api/test/contrato-3c2-respostas.test.ts` e novo, com 15 casos (as 34 rotas de ocorrências, campo e mapa e busca chamadas por `inject` e o corpo real lido pelo esquema de resposta do registro, sem campo cortado; o reenvio idempotente que responde 200, as duas formas da autorização de evidência e da tela do agente, e a cobertura das 34). `openapi.test.ts` só trocou o teto (40 para 30) e tirou 10 chaves da lista congelada, sem caso novo.
  "V2-F02-E04-parte-3C2": { total: 15, falhas: 0, puladas: 0 },
  // V2-F02-E07: `apps/api/test/chave-de-criacao.test.ts` e novo, com 16 casos (a mesma chave devolve o mesmo id e protocolo e a sequencia avanca uma vez, o corpo diferente nao altera o chamado, sem chave sao dois chamados, chave nao uuid e 422, sem credencial e 401, a mesma chave em A e em B cria um chamado em cada, a corrida que cai no 23505 com a transacao voltando inteira, e a chave de foto: mesma ocorrencia devolve a mesma evidencia, outra ocorrencia e 409 chave_ja_usada_em_outro_registro, o indice do banco tambem recusa, A e B gravam uma cada e a ocorrencia de outro municipio segue 404).
  "V2-F02-E07": { total: 16, falhas: 0, puladas: 0 },
  // V2-F02-E07, correcao 1: `apps/api/test/chave-de-criacao.test.ts` ganha 3 casos liquidos (o caso do municipio B virou dois, chave usada em B e depois a mesma em A sem 409 e sem ver nada de B, e o 404 do agente de A na ocorrencia de B; mais dois da corrida da foto, em que o segundo INSERT cai no indice: outra ocorrencia vira 409 e a mesma ocorrencia devolve a evidencia existente).
  "V2-F02-E07-correcao-1": { total: 3, falhas: 0, puladas: 0 },
  // V2-F02-E03, parte 2C (API): `apps/api/test/catalogo-de-erros.test.ts` e novo, com 27 casos (a varredura nos dois sentidos, o compilador recusando código fora do catálogo, o tratador que lança fora do catálogo em qualquer status, a forma do corpo, `frameworkErrors` e o isolamento do PATCH de órgão), e `guarda-de-codigos-de-erro.test.ts` ganhou 2 (o desvio não restaura os cabeçalhos do corpo trocado). O console ganhou os mesmos 2 no mesmo arquivo de teste (número do próprio passo teste-console).
  "V2-F02-E03-parte-2C": { total: 29, falhas: 0, puladas: 0 },
  // V2-F02-E03, parte 2C, correção 1: `catalogo-de-erros.test.ts` ganhou 10 casos (a conferência que lança só existe em `NODE_ENV=test` mesmo com a opção ligada; a varredura de `.code(N).send(...)`: árvore real, erro por variável, corpo em texto, `message` no lugar de `mensagem`, código fora do catálogo, corpo por constante, status calculado, controles e a exceção nomeada). Content-Disposition e Accept-Ranges entraram nos casos que já existiam das guardas.
  "V2-F02-E03-parte-2C-correcao-1": { total: 10, falhas: 0, puladas: 0 },
  // V2-F02-E03, parte 2C, correção 2 (junção do lote 3): `apps/api/test/cors-dos-erros-do-fastify.test.ts` é novo, com 8 casos (as respostas do `frameworkErrors`, 400 `url_invalida` e 414 `parametro_longo_demais`, levam o CORS da lista `ORIGENS_PERMITIDAS` em `/v1` e no espelho; origem fora da lista e pedido sem origem ficam sem o cabeçalho; corpo e demais cabeçalhos iguais).
  "V2-F02-E03-parte-2C-correcao-2": { total: 8, falhas: 0, puladas: 0 },
  // V2-F02-E06, parte 3A (API): `apps/api/test/versao-do-aplicativo.test.ts` e novo, com 41 casos (versao igual ou acima do minimo, pre-lancamento, o painel que nunca e recusado, o minimo de cada aplicativo, minimo vazio, a rota publica com e sem minimo, o CORS; 426 em varias rotas, antes do 401 e da validacao; 12 formas de cabecalho malformado mais o repetido, sem 500; o cabecalho ausente contado em log sem usuario, municipio, token nem IP; o mesmo corpo para qualquer municipio e id; token de B contra recurso de A segue 404; a rota so existe em /v1; a configuracao).
  "V2-F02-E06-parte-3A": { total: 41, falhas: 0, puladas: 0 },
  // V2-F02-E08: `apps/api/test/versao-v1.test.ts` ganhou 19 casos (o espelho encerrado responde 426 com Link, antes do 401 e igual para todo municipio, data futura e chave desligada atendem com os cabecalhos, o fim do dia vale inteiro, a infraestrutura fica fora; a chave e a data na configuracao e na partida em producao; o contador de uso sem usuario, municipio, token, IP, corpo nem consulta).
  "V2-F02-E08": { total: 19, falhas: 0, puladas: 0 },
  // V2-F02-E04, parte 3C1: `apps/api/test/contrato-auth-respostas.test.ts` (7 casos) e `contrato-conta-administracao-respostas.test.ts` (8 casos) sao novos: cada resposta descrita no contrato dos grupos autenticacao, conta e administracao confere com a que a API devolve por `inject`, e os tres grupos nao tem rota pendente nem sem resposta.
  "V2-F02-E04-parte-3C1": { total: 15, falhas: 0, puladas: 0 },
  // V2-F02-E04, parte 3C3 (contrato de documentos, ofícios e órgãos, prestação de contas e público): `apps/api/test/contrato-respostas-3c3.test.ts` é novo, com 14 casos (cada rota dos quatro grupos chamada de verdade por `/v1` e a resposta conferida contra a `resposta` que o registro do contrato declara: status, esquema sem chave de sobra ou o tipo de mídia dos arquivos HTML, PDF, CSV e ZIP; mais o guarda de que nenhuma entrada dos quatro grupos fica sem resposta).
  "V2-F02-E04-parte-3C3": { total: 14, falhas: 0, puladas: 0 },
  // V2-F02-E05, parte 4A (contrato cliente x rota): `apps/api/test/contrato-cliente-rota.test.ts` e novo, com 82 casos (o painel, o campo com a fila offline e o console lidos como texto e confrontados com as rotas /v1 do servidor montado: caminho, metodo, corpo e consulta contra o esquema do registro, pedido sem token, ancora de chamadas por arquivo; a varredura que reprova fetch solto fora da base e das duas URLs assinadas declaradas; 18 casos sinteticos, entre eles POST /pacote.zip, GET contra rota POST e chamada do campo sem rota; o relatorio das rotas /v1 sem cliente). `contrato-do-painel.test.ts` e `superficie.test.ts` passaram a usar `apoio/rotas.ts` e `apoio/extrair-chamadas.ts`, sem caso novo nem removido.
  "V2-F02-E05": { total: 82, falhas: 0, puladas: 0 },
};

/** Soma a base de um passo com o que cada etapa seguinte declarou mudar nele. */
function somarMudancas(base, mudancas) {
  const soma = { ...base };
  for (const m of Object.values(mudancas)) {
    for (const campo of Object.keys(m)) soma[campo] += m[campo];
  }
  return soma;
}

export function esperadoDoTesteApi() {
  return somarMudancas(BASE_DO_TESTE_API, MUDANCAS_DO_TESTE_API_POR_ETAPA);
}

/**
 * O mesmo mecanismo para `packages/shared` e para `apps/web`, que a E05 passou a
 * tocar. Base: o que a E01 mediu. Cada etapa seguinte que acrescenta teste ali
 * declara aqui quantos, e a falha pré-existente (laudo de conteúdo no shared,
 * 14 testes de tela no web) segue contada como vermelho conhecido das etapas
 * E20 e E13.
 */
export const BASE_DO_TESTE_SHARED = { total: 149, falhas: 1 };
export const MUDANCAS_DO_TESTE_SHARED_POR_ETAPA = {
  // `packages/shared/test/codigos-de-erro.test.ts`, catálogo dos códigos de acesso.
  "V2-F00-E05": { total: 10, falhas: 0 },
  // `packages/shared/test/permissoes.test.ts`: a acao `consultar_oficio` (3 casos novos).
  "V2-F00-E08": { total: 3, falhas: 0 },
  // `packages/shared/test/precisao-do-gps.test.ts`: o `positive()` de `gpsPrecisaoMetrosSchema` continua recusando 0 e negativo, em português (3 casos novos).
  "V2-F00-E15": { total: 3, falhas: 0 },
  // `packages/shared/test/regras-de-conteudo.test.ts`: 3 casos de âncora das isenções (árvore real e repositório sintético, o que reprova e o que passa). A falha pré-existente do travessão fecha: o literal de `trilha-detalhe.test.ts` virou escape e a saída bruta e a auditoria de 2026-09-30 saíram da varredura. O shared fecha sem vermelho.
  "V2-F00-E20": { total: 3, falhas: -1 },
  // V2-F00-E03, correção 4 (V-INS-04): 2 casos novos em `regras-de-conteudo.test.ts` (o arquivo que some entre a listagem e a leitura não derruba a varredura; só o ENOENT é tolerado).
  "V2-F00-E03-correcao-4": { total: 2, falhas: 0 },
  // V2-F00-E05, correção 2: `codigos-de-erro.test.ts` ganha 5 casos (as quatro recusas novas do catálogo, quem tem ação para o cliente e os três da lista da entrada); o catálogo passa de seis para dez códigos.
  "V2-F00-E05-correcao-2": { total: 5, falhas: 0 },
  // V2-F00-E22, correção 4: `packages/shared/test/permissoes-no-readme.test.ts` (10 casos) prende a tabela de permissões do README e a de `docs/PAPEIS_E_RESPONSABILIDADES.md` ao catálogo `acoesDoPapel` (falta, sobra, papel sem linha, ordem, marcador, sim ou não trocado). A base do shared não conta puladas, por isso a entrada também não traz o campo.
  "V2-F00-E22-correcao-4": { total: 10, falhas: 0 },
  // V2-F00-E24, correção 3: `packages/shared/test/ressalva-saida-a-campo.test.ts` (38 casos: 8 eram da correção 3 e a revisão independente a ampliou; os 30 casos a mais entram nesta entrada) leva para o `npm test` o guarda que vivia só na pasta da evidência: nenhum documento promete "acompanhar quem está em campo" ou a saída declarada pelo agente sem a ressalva "em construção". 9 casos de documento (seis com ocorrência a conferir e quatro com quadro de estado exigido; o README tem os dois), 25 mutações que têm de reprovar (M0 a M19, cada defeito da revisão) e 4 casos das regras (ressalva negada, tabela por linha, lista por item, frase quebrada em duas linhas). Sem campo de puladas, pelo mesmo motivo da entrada anterior.
  "V2-F00-E24-correcao-3": { total: 38, falhas: 0 },
  // V2-F00-E19, correção 10: `mensagens-em-portugues.test.ts` ganha 1 caso (o `uuidSchema` do Zod 4 aceita o v4 e o nulo e recusa o 8-4-4-4-12 que não é UUID, com a frase em português). Sem campo de puladas, pelo mesmo motivo das entradas anteriores.
  "V2-F00-E19-correcao-10": { total: 1, falhas: 0 },
  // V2-F01-E14: `packages/shared/test/observabilidade.test.ts` (9 casos: a máscara de dado pessoal que poupa o código de suporte).
  "V2-F01-E14": { total: 9, falhas: 0 },
  // V2-F00-E19, correção 11: `mensagens-em-portugues.test.ts` ganha 12 casos (campo obrigatório ausente em qualquer regra, 4; o mapa nunca imprime `undefined` nem `null` crus, 4; NaN com frase própria, 3; `tamanhoBytes` separa ausente de não numérico, 1). Sem campo de puladas, pelo mesmo motivo das entradas anteriores.
  "V2-F00-E19-correcao-11": { total: 12, falhas: 0 },
  // V2-F02-E03 (parte do shared, 1D): `catalogo-de-erros.test.ts` (26 casos: forma de cada entrada, acesso e entrada dentro do catálogo, reservados, cobertura dos códigos literais de `apps/api/src` nos dois sentidos, `erroDaApiSchema`, funções do cliente e tabela gerada), `varredura-de-esquemas.test.ts` (17 casos: DV-20 e DV-37, comportamento do Zod 4 preso e varredura de todos os esquemas exportados e do texto do produto) e 5 casos de item de lista ausente em `mensagens-em-portugues.test.ts` (DV-44). Sem campo de puladas, pelo mesmo motivo das entradas anteriores.
  "V2-F02-E03": { total: 48, falhas: 0 },
  // V2-F02-E03, parte 2C (DV-47): `mensagens-em-portugues.test.ts` ganha 4 casos (união discriminada sem o discriminador, com ele desconhecido, e `numeroDoTexto` ausente, não numérico e com default). Sem campo de puladas, pelo mesmo motivo das entradas anteriores.
  "V2-F02-E03-parte-2C": { total: 4, falhas: 0 },
  // V2-F02-E09: `packages/shared/test/fuso.test.ts` e novo, com 115 casos (a virada do dia, um minuto antes e na meia-noite local, nas 27 unidades da federação, com o processo em UTC e em Pacific/Auckland; a janela de 03:30Z; o mapa de UF e o fuso padrão).
  "V2-F02-E09": { total: 115, falhas: 0 },
  // V2-F02-E07: `packages/shared/test/chave-de-criacao.test.ts` e novo, com 4 casos (a chave e opcional, aceita uuid, recusa o que nao e uuid com o caminho do campo, e o codigo saiu da reserva para o catalogo emitido), e `catalogo-de-erros.test.ts` ganha 1 (a saida da reserva), alem de duas assercoes trocadas no lugar.
  "V2-F02-E07": { total: 5, falhas: 0 },
  // V2-F02-E06, parte 3A: `packages/shared/test/versao.test.ts` e novo, com 16 casos (`lerVersao`, `compararVersoes` com pre-lancamento ignorado, `lerCabecalhoDeVersao` com formas malformadas, `estaAbaixoDoMinimo` e os aplicativos com minimo), e `catalogo-de-erros.test.ts` ganha 1 (`versao_do_aplicativo_antiga` saiu da reserva para o catalogo emitido).
  "V2-F02-E06-parte-3A": { total: 17, falhas: 0 },
};
export function esperadoDoTesteShared() {
  return somarMudancas(BASE_DO_TESTE_SHARED, MUDANCAS_DO_TESTE_SHARED_POR_ETAPA);
}

export const BASE_DO_TESTE_WEB = { total: 550, falhas: 14 };
export const MUDANCAS_DO_TESTE_WEB_POR_ETAPA = {
  // `apps/web/test/sessao-e-entrada.test.ts`: os três motivos de sessão morta e as três frases.
  "V2-F00-E05": { total: 7, falhas: 0 },
  // Mesmo arquivo: a renovação avisa a tela do papel novo (1 caso novo de servidor antigo) e o provedor se inscreve (1 de fonte). O caso "papel mudado" foi reescrito no lugar.
  "V2-F00-E07": { total: 2, falhas: 0 },
  // `apps/web/test/oficio-so-para-quem-consulta.test.ts`: o modo local recusa o agente e a tela nao pergunta o que o servidor recusa (4 casos novos).
  "V2-F00-E08": { total: 4, falhas: 0 },
  // `apps/web/test/sessoes-e-senha-temporaria.test.ts` (18 casos novos: frases, janela da senha, modo local, telas) e os 8 casos de `seguranca-da-conta.test.ts`, vermelhos desde 5ecdf4c, que passam sem mudar uma linha do teste (V-WEB-04 a V-WEB-11 da classificacao da E03). Sobram 6 vermelhos: E13 (5) e E21 (1).
  "V2-F00-E09": { total: 18, falhas: -8 },
  // `apps/web/test/recuperar-senha.test.ts` (37 casos: cada estado das duas telas, as regras de frase e de digitacao, o token fora da barra, o vercel.json) e `recuperar-senha-e-sessao.test.ts` (3 casos: o pedido de recuperacao nao leva token nem derruba a sessao aberta; 3 reprovam antes do conserto). Nenhuma falha nova.
  "V2-F00-E10": { total: 40, falhas: 0 },
  // `apps/web/test/pacote-de-saida.test.ts` (7 casos: o cliente chama POST /saida/pacote.zip, 401 renova uma vez e baixa, a recusa traz a frase do servidor sem derrubar a sessao, rede caida diz que o arquivo nao foi baixado, inclusive no meio do corpo). 5 reprovam com o cliente anterior (os 2 de recusa ja passavam). Nenhuma falha nova.
  "V2-F00-E11": { total: 7, falhas: 0 },
  // 5 casos novos: 1 em `acessibilidade.test.ts` (a excecao vale pelo comentario inteiro), 2 em `sessao-e-entrada.test.ts` (entrar a partir de `/` e sair sem deixar caminho de volta) e 2 em `acessibilidade.test.ts` (o Tab traz o item da barra do rodape inteiro para a tela, e o aviso passageiro nao cai em cima da barra). Zera 5 dos 6 vermelhos: 3 de Toast em `semente-e-confirmacoes.test.ts`, 1 de raio a mao em `design-system.test.ts` e 1 de `onClick` em `acessibilidade.test.ts`. Sobra 1, o de CRLF em `ocorrencia-encerramento.test.ts`, que e da E21.
  "V2-F00-E13": { total: 5, falhas: -5 },
  // `apps/web/test/duplicidade-sem-rede.test.ts` (3 casos: sem rede, a checagem de duplicidade do "Registrar" diz que o preenchido nao foi enviado, e nao que a tela nao carregou; a recusa do servidor segue como ErroDaApi; com rede devolve as candidatas). 1 reprova antes do conserto. Nenhuma falha nova.
  "V2-F00-E18": { total: 3, falhas: 0 },
  // `apps/web/test/ler-fonte.test.ts` (7 casos: a mesma fonte em CRLF e em LF lê e recorta igual, o recorte aceita o texto cru, a chave de fechamento movida tira o onEnviar do bloco, função sem chave na coluna zero e assinatura ausente reprovam alto, CR solto fica). O vermelho de CRLF de `ocorrencia-encerramento.test.ts` fecha usando o helper novo `ler-fonte.ts` (apoio, não conta). O painel fecha sem vermelho.
  "V2-F00-E21": { total: 7, falhas: -1 },
  // V2-F00-E09, correção 1: 3 casos em `acessibilidade.test.ts` (diálogos e barra inferior em tela estreita) e 3 em `devolucao.test.ts`. Faltava aqui desde 39051f7 (V-ROT-01): 643 esperado contra 649.
  "V2-F00-E09-correcao-1": { total: 6, falhas: 0 },
  // V2-F00-E09, correção 2: `minha-conta-estreita.test.ts` é novo, com 6 casos (a regra `.botao--quebra`, a largura até 600 px, o uso no botão, o que não pode ter número solto, o `ref` e o foco).
  "V2-F00-E09-correcao-2": { total: 6, falhas: 0 },
  // V2-F00-E10, correção 2: `recuperar-senha.test.ts` foi de 37 para 47 casos (a tela de sucesso não promete ida automática nem tem relógio, o foco na confirmação, o rodapé, o hover e o pedido de novo). Contado contra o `4b96ea7`.
  "V2-F00-E10-correcao-2": { total: 10, falhas: 0 },
  // V2-F00-E05, correção 2: `sessao-e-entrada.test.ts` ganha 4 casos (403 de cada código novo do catálogo, sem ação, não renova nem derruba a tela).
  "V2-F00-E05-correcao-2": { total: 4, falhas: 0 },
  // V2-F00-E09, correção 4: `correcao-4-da-e09.test.ts` é novo, com 19 casos (a frase da senha atual errada por tela, o contador de janelas abertas e o aviso que espera, o email que quebra só depois do "@" e dos pontos, e os seis itens da revisão: ícone do erro, confirmação limpa no envio, foco depois de enviar, teto da linha do email, janela aberta no topo, órgãos). Nenhuma falha nova.
  "V2-F00-E09-correcao-4": { total: 19, falhas: 0 },
  // V2-F00-E09, correção 5: `correcao-5-da-e09.test.ts` é novo, com 11 casos (o detector de email solto no JSX e a varredura de todo .tsx do painel, as duas janelas e a tentativa de envio do ofício usando o EmailQuebravel, a regra da dica da janela sem `anywhere`, o hook que leva o foco depois do commit e as duas telas que o usam, o `scroll-padding-top` e a margem do campo no topo de duas linhas, e o foco que rola pelo `scrollIntoView`). `correcao-4-da-e09.test.ts` trocou uma asserção no lugar (o foco por efeito), sem caso novo. Nenhuma falha nova.
  "V2-F00-E09-correcao-5": { total: 11, falhas: 0 },
  // V2-F00-E09, correção 6: `correcao-6-da-e09.test.ts` é novo, com 17 casos (o foco que leva à vista a moldura do campo e depois o controle, as folgas medidas do topo e da barra do pé, a janela muito baixa em que os dois rolam com a página, o Tab que respeita as bordas, a margem do rótulo em qualquer largura, o ofício que encolhe abaixo da palavra mais longa, o singular e o plural das tentativas, a busca a 320 px e o nome do link de Minha conta). `correcao-5-da-e09.test.ts` trocou duas asserções no lugar (a folga medida e a regra do ofício), sem caso novo. Nenhuma falha nova.
  "V2-F00-E09-correcao-6": { total: 17, falhas: 0 },
  // V2-F00-E09, correção 6b: `correcao-6-da-e09.test.ts` ganha 7 casos (o ajuste do Tab roda na hora, numa tarefa logo depois e no quadro seguinte; o foco que vem do toque ou do clique não é ajustado; a conta do Tab pelas bordas reais, para o que cabe e para o que é mais alto que a faixa; o teto do email em qualquer largura; a paginação que quebra em linhas; o texto de exemplo curto do filtro de Ocorrências). Dois casos da correção 6 e um da correção 4 trocaram a asserção no lugar (a altura de 340 px, a conta do Tab e o teto do email em qualquer largura). Nenhuma falha nova.
  "V2-F00-E09-correcao-6b": { total: 7, falhas: 0 },
  // V2-F00-E09, correção 7: `correcao-7-da-e09.test.ts` é novo, com 14 casos (a conta que rola o painel da janela até o foco inicial, para baixo, para cima, quando já está à vista e quando o controle é mais alto que o painel; o Modal que a usa depois de abrir no topo e que a refaz quando o conteúdo muda depois de aberto; o ajuste que leva a confirmação das sessões à faixa livre entre o topo e a barra do pé, com o foco e sem ele; Minha conta que o chama quando a confirmação aparece e quando a lista relida chega; e a seção 14 do layout-estreito). `correcao-4-da-e09.test.ts` trocou uma asserção no lugar (o focus() do Modal nunca rola). Nenhuma falha nova.
  "V2-F00-E09-correcao-7": { total: 14, falhas: 0 },
  // V2-F01-E14: `apps/web/test/codigo-de-suporte.test.ts` (13 casos: o código de suporte nos 5xx e os erros globais do painel).
  "V2-F01-E14": { total: 13, falhas: 0 },
  // V2-F00-E09, correção 8: `correcao-8-da-e09.test.ts` é novo, com 33 casos (a parte do painel que a pessoa enxerga com e sem teclado virtual e zoom de pinça; o acompanhamento da janela aberta com um DOM mínimo: resize, orientationchange e a janela visual, a mesma conta no quadro seguinte, sem laço, e tudo desligado em parar(), sem acumular ouvinte em 50 aberturas; o foco que cai na página volta ao último controle, o botão travado gravando e devolvido quando volta a valer, o WebKit que leva o foco ao painel; o Esc e o Tab ouvidos no documento só com o alvo fora do painel; o Modal ligado ao acompanhamento, o fundo que não tira o foco e o título preso; as três frases que deixam de prometer a saída imediata; e a seção 15 do layout-estreito). Doze mutações do código novo, todas vermelhas. `correcao-7-da-e09.test.ts` e `correcao-4-da-e09.test.ts` trocaram asserções no lugar (o observador e a limpeza passaram para `acompanhar-janela.ts`). Nenhuma falha nova.
  "V2-F00-E09-correcao-8": { total: 33, falhas: 0 },
  // V2-F00-E09, correção 8b: `correcao-8b-da-e09.test.ts` é novo, com 8 casos (a saída da janela de confirmação, o Esc e o clique no fundo, fica travada enquanto grava e volta a valer com o erro; as quatro frases de sessão não fixam o número de minutos e "Desativar usuário" não diz que as sessões caem; a seção 15 do layout-estreito aperta o Esc e clica no fundo gravando). `correcao-8-da-e09.test.ts` trocou 4 asserções de texto no lugar. Nenhuma falha nova.
  "V2-F00-E09-correcao-8b": { total: 8, falhas: 0 },
  // V2-F02-E07: `apps/web/test/chave-de-criacao.test.ts` e novo, com 6 casos (a chave e um uuid v4 que o esquema aceita, cada chamada e uma chave nova, o plano B sem `crypto.randomUUID`, a falha em portugues sem gerador, e a leitura da tela: a chave nasce uma vez na abertura do formulario e viaja no corpo de todo envio).
  "V2-F02-E07": { total: 6, falhas: 0 },
  // V2-F02-E02, parte 2A (painel em `/v1` e renovação pela categoria do erro): `apps/web/test/http-v1-e-categorias.test.ts` é novo, com 23 casos (a base `/v1` com e sem barra final e com origem vazia, todas as formas de chamada, URLs assinadas sem prefixo, o 401 de cada categoria que não renova, a categoria aditiva do servidor, o 401 sem código que segue renovando, o 403 `assinatura` que não gasta a renovação, uma renovação só e o padrão por status). Os demais arquivos tocados mudaram por dentro, sem caso novo.
  "V2-F02-E02-parte-2A": { total: 23, falhas: 0 },
  // V2-F02-E06, parte 3B: `apps/web/test/versao-do-aplicativo.test.ts` é novo, com 4 casos (`x-app-version: painel/desconhecido` nas dez formas de pedido e no download sem token; o 426 com a frase do corpo, sem renovar e sem derrubar a sessão, numa chamada comum e num download).
  "V2-F02-E06-parte-3B": { total: 4, falhas: 0 },
};
export function esperadoDoTesteWeb() {
  return somarMudancas(BASE_DO_TESTE_WEB, MUDANCAS_DO_TESTE_WEB_POR_ETAPA);
}

/**
 * O mesmo mecanismo para o banco (`db`, que inclui o isolamento). Base: o que a
 * E01 mediu (318 testes, 3 pulados por ambiente em `busca.test.ts`).
 *
 * V2-F00-E07: `db/test/familia-da-sessao.test.ts` e novo, com 12 casos (backfill
 * da migracao 047, `abrir_sessao` com a familia opcional, o teto de funcoes
 * SECURITY DEFINER e as permissoes). `isolamento.test.ts` nao mudou e segue verde.
 */
export const BASE_DO_TESTE_DB = { total: 318, falhas: 0, puladas: 3 };
export const MUDANCAS_DO_TESTE_DB_POR_ETAPA = {
  "V2-F00-E07": { total: 12, falhas: 0, puladas: 0 },
  /*
    V2-F00-E07, correção 2: `renovacao-e-encerramento-na-mesma-trava.test.ts`
    é novo, com 12 casos (a 049: a trava, a ordem em que cada função a toma, a
    recusa de herdar família encerrada, as permissões), e
    `login-e-suspensao-na-mesma-linha.test.ts` é novo, com 6 (a 050: aplica sem
    tocar sessões, idempotente, teto de funções `SECURITY DEFINER`, permissões,
    `FOR SHARE` só no login, DC367 e DC369 mantidos). Soma 18, de 327 para 345.
  */
  "V2-F00-E07-correcao-2": { total: 18, falhas: 0, puladas: 0 },
  /*
    V2-F01-E11: `db/test/guarda-da-semente.test.ts` é novo, com 18 casos (a
    guarda do `--semear`: banco efêmero, loopback e serviço do Docker semeiam;
    URL de PROD pelo usuário, pelo host, em maiúsculas e pelo túnel local,
    `NODE_ENV=production`, `AMBIENTE_DC360` prod ou hml, banco de HML hospedado,
    URL ilegível e host público recusam sem repetir a senha; a identidade de PROD
    da guarda é a da matriz; e o `cli.ts` de verdade sai com código 1 antes de
    conectar, e ainda semeia o banco efêmero). Nenhuma falha nem pulo novos.
  */
  "V2-F01-E11": { total: 18, falhas: 0, puladas: 0 },
  /*
    V2-F01-E21: `db/test/postgis-decisao.test.ts` é novo, com 8 casos (a regra
    que decide se o teste espacial roda, pula com aviso ou reprova: exigindo
    PostGIS, servidor sem a extensão, sem URL ou fora do ar reprova; sem exigir,
    pula). Os `*.espacial.test.ts` ficam FORA desta conta: não entram em
    `npm run test:isolamento` (o `vitest.config.ts` os exclui), rodam por
    `npm run test:espacial` e a prova deles é o job `implantavel` do CI.
  */
  "V2-F01-E21": { total: 8, falhas: 0, puladas: 0 },
  /*
    V2-F01-E18: três arquivos novos em `db/test/`. `migracoes-regras.test.ts`
    (19 casos: a regra de migração reversível, positivos e negativos),
    `desfazer-migracao.test.ts` (18: o desfazer da última, o ciclo que deixa o
    esquema idêntico, a recusa em PROD e o `cli.ts` de verdade) e
    `trava-de-migracao.test.ts` (15: 12 em PGlite sobre a trava e 3 em Postgres
    real, com dois `pg.Client`). Os 3 de Postgres real são pulados por ambiente
    sem `DC360_POSTGRES_DE_PROVA` (o `describe.skipIf` fica fora da lista do
    vitest), então: 52 no `vitest run`, 49 na lista, 3 pulados. Nenhuma falha.
  */
  "V2-F01-E18": { total: 52, falhas: 0, puladas: 3 },
  /*
    V2-F01-E22: `db/test/endurecer-extensao.test.ts` é novo, com 9 casos (o bloco
    de extensão de `supabase-endurecer.sql` com `pg_trgm` no lugar do PostGIS:
    acha os objetos pela dependência da extensão e não toca o que não é dela,
    revoga de PUBLIC e dos três papéis do provedor, devolve o mínimo a
    `dc360_app`, é idempotente, e o arquivo inteiro roda sem a extensão e sem os
    papéis). O `postgis-provedor.espacial.test.ts` fica FORA desta conta, como
    os demais `*.espacial.test.ts`: roda por `npm run test:espacial`.
  */
  "V2-F01-E22": { total: 9, falhas: 0, puladas: 0 },
  /*
    V2-F01-E18, correção da revisão 1: `db/test/desfazer-migracao.test.ts` ganha 10
    casos (o `--desfazer` passa a ser fail-closed como o `--semear`: banco
    hospedado só desfaz se for o HML declarado; o PROD restaurado num projeto
    novo, a identidade de HML genérica, a URL de PROD com o HML declarado, a URL
    que não dá para analisar, o túnel descartável com identidade de PROD, a
    paridade das listas genéricas com a API e o comando de verdade recusando sem
    conectar). O caso "homologação e desenvolvimento podem desfazer" foi trocado
    pelo "banco descartável pode desfazer", sem mudar a contagem. Nenhuma falha
    nem pulo novos.
  */
  "V2-F01-E18-correcao-revisao-1": { total: 10, falhas: 0, puladas: 0 },
  /*
    V2-F02-E07: `db/test/chave-de-criacao-migracao.test.ts` e novo, com 9 casos
    (a 052 sobre dado antigo sem violar nada, a coluna e os dois indices unicos
    parciais, a mesma chave duas vezes no municipio e 23505, em dois municipios
    e aceita, chave nula repete, o indice da evidencia sozinho, o da 004 junto, e
    aplicar, desfazer e reaplicar deixando o esquema identico com a RLS
    forcada). `migracoes-regras.test.ts` e `desfazer-migracao.test.ts` trocaram
    nomes e uma fatia no lugar (a 052 de mentira virou 053; "a ultima das 51"
    passou a olhar so as 51), sem caso novo.
  */
  "V2-F02-E07": { total: 9, falhas: 0, puladas: 0 },
};
export function esperadoDoTesteDb() {
  return somarMudancas(BASE_DO_TESTE_DB, MUDANCAS_DO_TESTE_DB_POR_ETAPA);
}

/**
 * O mesmo mecanismo para o motor offline (`packages/campo`, vitest) e para o
 * aplicativo de campo (`apps/campo`, jest), que a V2-F00-E06 passou a tocar.
 * Base: o que a E01 mediu. O app mantém as 20 falhas pré-existentes (E14 a
 * E16), que continuam contadas como vermelho conhecido dessas etapas.
 *
 * V2-F00-E06 no pacote: `test/pausa-de-sessao.test.ts` é novo (28 casos: os três
 * códigos no transporte, a fila que para e guarda, a autoria, a renovação). Os
 * dois testes de `fila.test.ts` que afirmavam "401 é permanente" foram
 * reescritos no lugar, sem mudar a contagem.
 *
 * V2-F00-E06 no app: 35 casos novos (renovação forçada do token 5, classificação
 * da conta desativada 6, frases da pausa 6, frase da API 3, faixa de sincronização 6, tela da
 * fila pausada 9). Nenhuma falha nova.
 *
 * V2-F00-E14 no app: os 6 vermelhos de texto velho e de dublê velho ficam
 * verdes (2 de frase da sessão encerrada, 4 do logout com o dublê do banco
 * local completo) e entra 1 caso novo, o de deriva do dublê em
 * `push/logout-cala-o-aparelho.test.tsx`. Sobram 14 vermelhos, todos defeitos
 * reais: 7 da E15 e 7 da E16.
 *
 * V2-F00-E15 no app: os 7 defeitos reais dela ficam verdes (6 do diálogo de
 * saída com vistoria começada e a fila assinada, 1 da precisão de GPS) e
 * entram 20 casos novos: `dados/aviso-da-saida.test.ts` (10, o texto do
 * diálogo em todas as combinações), `dados/precisao-do-gps.test.ts` (5, o piso
 * de 1 metro contra o esquema do servidor) e
 * `dados/sair-e-entrar-nao-perde-a-coleta.test.ts` (5, a mesma pessoa
 * reencontra a vistoria, outra pessoa recebe o aparelho limpo, a fila fica
 * intacta e pendente). Sobram 7 vermelhos, todos da E16.
 *
 * V2-F00-E16 no app: os 7 defeitos reais dela ficam verdes (frase do envio, 2
 * do teclado, área segura da câmera, 2 do botão dos ajustes, foto vazia) e
 * entram 4 casos novos: 3 em
 * `__tests__/vistoria-o-teclado-a-camera-e-o-que-ela-promete.test.tsx` (o
 * botão dos ajustes não sobrevive à falha seguinte que não é de permissão, o
 * botão tem nome e 44 de altura, a câmera que não disparou continua com a
 * frase genérica) e 1 em `dados/evidencia-no-disco.test.ts` (a cópia recusada
 * sai em português). O jest do app fecha sem vermelho.
 */
export const BASE_DO_TESTE_CAMPO_PACOTE = { total: 159, falhas: 0 };
export const MUDANCAS_DO_TESTE_CAMPO_PACOTE_POR_ETAPA = {
  "V2-F00-E06": { total: 28, falhas: 0 },
  // V2-F00-E05, correcao 1: o obtentor lanca a falha de sessao da conta desativada.
  "V2-F00-E05-correcao-1": { total: 1, falhas: 0 },
  // V2-F00-E06, correcao 1: `pausa-por-senha-provisoria.test.ts` (matriz de classificacao, senha provisoria, corridas de troca de conta).
  "V2-F00-E06-correcao-1": { total: 35, falhas: 0 },
  // V2-F00-E05, correção 2: a matriz de `pausa-por-senha-provisoria.test.ts` ganha 4 linhas (403 de cada código novo do catálogo é recusa permanente), com 2 casos por linha.
  "V2-F00-E05-correcao-2": { total: 8, falhas: 0 },
  // V2-F00-E06, correção 3b: `pausa-velha.test.ts` (7 casos: a pausa cai quando a pessoa entra de novo).
  "V2-F00-E06-correcao-3b": { total: 7, falhas: 0 },
  // V2-F02-E02 e E03, parte 2B: `categorias-do-transporte.test.ts` é novo, com 23 casos (4 da base com /v1 e da URL assinada intacta, 19 da categoria do catálogo lida dentro do status, sem item perdido, sem laço de renovação e com a mesma chave na repetição).
  "V2-F02-E02-parte-2B": { total: 23, falhas: 0 },
  // V2-F02-E06, parte 3B: `versao-do-aplicativo.test.ts` é novo, com 19 casos (o cabeçalho `campo/<versão>` em todo pedido à API e nunca na URL assinada; o 426 pausa a fila com o item pendente, sem renovar, em qualquer rota e com qualquer corpo; a mesma coleta sobe depois; 401, 409, 5xx e 429 como na tabela da 2B).
  "V2-F02-E06-parte-3B": { total: 19, falhas: 0 },
};
export function esperadoDoTesteCampoPacote() {
  return somarMudancas(BASE_DO_TESTE_CAMPO_PACOTE, MUDANCAS_DO_TESTE_CAMPO_PACOTE_POR_ETAPA);
}

export const BASE_DO_TESTE_CAMPO_APP = { total: 1801, falhas: 20 };
export const MUDANCAS_DO_TESTE_CAMPO_APP_POR_ETAPA = {
  "V2-F00-E06": { total: 35, falhas: 0 },
  "V2-F00-E14": { total: 1, falhas: -6 },
  "V2-F00-E15": { total: 20, falhas: -7 },
  "V2-F00-E16": { total: 4, falhas: -7 },
  // V2-F00-E05, correcao 1: seis casos em `token.test.ts` (renovacao recusada por conta desativada).
  "V2-F00-E05-correcao-1": { total: 6, falhas: 0 },
  // V2-F00-E06, correcao 1: 13 casos (falha-de-atualizacao 5, pausa-da-fila 2, tela da fila 3, faixa 1, fila real com troca de conta 2).
  "V2-F00-E06-correcao-1": { total: 13, falhas: 0 },
  // V2-F00-E15, correção 1: `vistoria-sessao-vencida-preserva-o-rascunho.test.tsx` (4 casos). Faltava aqui desde a5da710.
  "V2-F00-E15-correcao-1": { total: 4, falhas: 0 },
  // V2-F00-E16, correção 1: 19 casos (a foto sem frase própria, o teclado e a câmera, a falha de atualização, a pausa da fila e a fila como produto; dois `it.each` entram com uma linha por valor). Faltava aqui desde 81a5223: 1880 esperado contra 1903.
  "V2-F00-E16-correcao-1": { total: 19, falhas: 0 },
  /*
    V2-F00-E06, correção 2 (17 casos, contados contra o `4b96ea7`):
    `obter-fila-uma-so.test.ts` (4), `faixa-ligada-a-fila-real.test.tsx` (3),
    `a-lista-com-a-fila-pausada-nao-pede-sinal.test.tsx` (5), 4 em
    `ordem-do-dia.test.ts` e 1 em `pausa-da-fila.test.ts`.
    V2-F00-E16, correção 2 (7 casos): 4 em `evidencia-no-disco.test.ts`, 1 em
    `vistoria-a-foto-com-o-disco-fiel.test.tsx` (novo) e 2 em
    `vistoria-camera-legivel-sobre-o-visor.test.tsx` (novo, um por tema).
    Soma 24, de 1903 para 1927.
  */
  "V2-F00-E06-correcao-2": { total: 17, falhas: 0 },
  "V2-F00-E16-correcao-2": { total: 7, falhas: 0 },
  // V2-F00-E15, correção 2: `dialogo-na-conta-com-vistoria-comecada.test.tsx` ganha 5 casos (disco ilegível, item recusado da fila, item em envio, título e ordem dos botões, disco que falha na segunda pergunta). O caso do botão de perigo foi reescrito, sem mudar a contagem.
  "V2-F00-E15-correcao-2": { total: 5, falhas: 0 },
  // V2-F00-E15, correção 3: `entrar-de-outra-pessoa-limpa-o-aparelho.test.tsx` é novo, com 10 casos (6 do login real, provedor, banco e rascunho de verdade: troca de pessoa, a ordem de limpar antes de abrir a sessão e o dono do disco; 4 da credencial e da identidade que saem do cofre).
  "V2-F00-E15-correcao-3": { total: 10, falhas: 0 },
  /*
    V2-F00-E06, correção 3 (41 casos, contados contra o `b17949a`): "Enviar
    agora" e os outros pontos que prometiam sinal com a fila pausada.
    `enviar-agora-com-a-fila-pausada.test.tsx` (7), `fila-pausada-nao-promete-sinal.test.tsx` (14),
    `vistoria-guardada-com-a-fila-pausada.test.tsx` (8), 9 em `aviso-da-saida.test.ts`
    e 3 em `dialogo-na-conta.test.tsx`; os `it.each` entram com uma linha por motivo.
  */
  "V2-F00-E06-correcao-3": { total: 41, falhas: 0 },
  /*
    V2-F00-E06, correção 3b (14 casos): `pausa-cai-ao-entrar-de-novo.test.tsx` (2),
    1 em `entrar-de-outra-pessoa-limpa-o-aparelho.test.tsx` (a geração sobe no
    login), 1 em `enviar-agora-com-a-fila-pausada.test.tsx` (acesso suspenso),
    7 em `dialogo-na-conta.test.tsx` (o Perfil pausado: controle, aviso e chip por
    motivo) e 3 em `fila-pausada-nao-promete-sinal.test.tsx` (devolução sem autor).
  */
  "V2-F00-E06-correcao-3b": { total: 14, falhas: 0 },
  // V2-F02-E02 e E03, parte 2B: `dados/api-v1-e-categorias.test.ts` é novo, com 12 casos (origem exibida e base com /v1, barra final sem //v1, URL assinada intacta, `ErroDaApi.categoria` pelo catálogo e a atualização ainda pelo 401), e 1 em `obter-fila-uma-so.test.ts` (a base do aplicativo chega à fila com /v1). Quatro testes existentes só trocaram o caminho esperado para /v1.
  "V2-F02-E02-parte-2B": { total: 13, falhas: 0 },
  // V2-F02-E06, parte 3B: `dados/versao-do-aplicativo.test.ts` é novo, com 8 casos (a versão do `expoConfig`, o cabeçalho em `api.ts`, `rota.ts`, `mapa.ts` e `historico-da-casa.ts`, a varredura de todo `fetch(` do aplicativo, o 426 fora da fila com a frase do servidor e as frases da pausa pelo 426). `faixa-de-sincronizacao.test.tsx` ganhou o estado novo no mapa de estados, sem caso novo.
  "V2-F02-E06-parte-3B": { total: 8, falhas: 0 },
};
export function esperadoDoTesteCampoApp() {
  return somarMudancas(BASE_DO_TESTE_CAMPO_APP, MUDANCAS_DO_TESTE_CAMPO_APP_POR_ETAPA);
}

/** Cabeçalho que o `npm audit` imprime só quando auditou e achou algo (não aparece com o registro fora do ar). */
const RELATORIO_DE_AUDITORIA = "# npm audit report";

/**
 * Os passos, na ordem em que se roda. `esperado` é o resultado que a árvore
 * verde produz hoje:
 *   - `codigo`: 0 (passa) ou "falha" (qualquer saída diferente de zero);
 *   - `total`, `falhas`, `puladas`: contagens, quando a ferramenta as imprime;
 *   - `contem`: trecho que a saída tem de trazer.
 * Passo sem `esperado` só registra.
 *
 * `divergenciaExplicada` (opcional) nomeia UM achado conhecido que faz o passo
 * divergir do esperado: `id` (o do registro de vermelhos), `onde` (o arquivo e
 * o item que o descrevem), `motivo`, `codigo` (o código de saída que o achado
 * produz) e `contem` (os trechos que a saída tem de trazer). Só vale quando a
 * saída bate com TUDO isso; fora disso o passo volta a ser "divergente".
 */
export const PASSOS = [
  { id: "instalar", titulo: "npm ci (dc360)", cmd: "npm ci", cwd: ".", instalacao: true, esperado: { codigo: 0 } },
  { id: "instalar-campo", titulo: "npm ci (apps/campo)", cmd: "npm ci", cwd: "apps/campo", instalacao: true, esperado: { codigo: 0 } },
  { id: "typecheck", titulo: "npm run typecheck", cmd: "npm run typecheck", cwd: ".", esperado: { codigo: 0 } },
  { id: "teste-shared", titulo: "vitest em packages/shared", cmd: "npm run test --workspace @dc360/shared", cwd: ".", ferramenta: "vitest", esperado: { codigo: 0, ...esperadoDoTesteShared() } }, // verde desde a V2-F00-E20
  { id: "teste-db", titulo: "vitest em db (inclui o isolamento)", cmd: "npm run test:isolamento", cwd: ".", ferramenta: "vitest", esperado: { codigo: 0, ...esperadoDoTesteDb() } },
  { id: "teste-campo-pacote", titulo: "vitest em packages/campo", cmd: "npm run test --workspace @dc360/campo", cwd: ".", ferramenta: "vitest", esperado: { codigo: 0, ...esperadoDoTesteCampoPacote() } },
  { id: "teste-api", titulo: "vitest em apps/api", cmd: "npm run test:api", cwd: ".", ferramenta: "vitest", esperado: { codigo: 0, ...esperadoDoTesteApi() } }, // verde desde a V2-F00-E21 (banco-tls roda)
  { id: "teste-console", titulo: "vitest em apps/console", cmd: "npm run test:console", cwd: ".", ferramenta: "vitest", esperado: { codigo: 0, total: 379, falhas: 0 } }, // 338 + 1 da correção da revisão 1 da V2-F01-E09 + 18 da parte 1C da V2-F02-E03 + 2 da parte 2C da V2-F02-E03 + 20 da V2-F02-E02 (19 em v1-e-mensagens.test.ts e 1 de paridade em superficie.test.ts)
  { id: "teste-web", titulo: "vitest em apps/web", cmd: "npm run test --workspace @dc360/web", cwd: ".", ferramenta: "vitest", esperado: { codigo: 0, ...esperadoDoTesteWeb() } }, // verde desde a V2-F00-E21 (CRLF)
  { id: "teste-campo-app", titulo: "jest em apps/campo (direto)", cmd: "npx jest --silent", cwd: "apps/campo", ferramenta: "jest", esperado: { codigo: 0, ...esperadoDoTesteCampoApp() } }, // verde desde a V2-F00-E16
  { id: "test-campo", titulo: "npm run test:campo", cmd: "npm run test:campo", cwd: ".", esperado: { codigo: 0 } }, // verde desde a V2-F00-E21 (cache .expo/types velho apagado antes do typecheck)
  { id: "test-scripts", titulo: "npm run test:scripts", cmd: "npm run test:scripts", cwd: ".", ferramenta: "node-test", esperado: { codigo: 0, total: 165 + TESTES_DA_E01_EM_SCRIPTS + SOMA_DAS_ETAPAS_SEGUINTES, falhas: 0, puladas: 4 } }, // verde desde a V2-F00-E17; os 4 pulados são por ambiente (sem pasta ios/)
  /*
    Verde desde a V2-F00-E17. Este é o passo que MAIS volta a divergir: toda
    etapa que acrescenta teste muda uma contagem que o README afirma, e a
    etapa só fecha com o texto corrigido. Divergir aqui depois de uma etapa
    nova quer dizer "faltou corrigir o número", e não regressão de produto.
  */
  { id: "conferir-numeros", titulo: "npm run conferir:numeros", cmd: "npm run conferir:numeros", cwd: ".", esperado: { codigo: 0, contem: "Todos os números da documentação batem com a realidade." } },
  /*
    Verde desde a V2-F00-E19 (CP-03, alternativa B): vulnerabilidade em
    dependência de runtime reprova; a de ferramenta de desenvolvimento aparece e
    não reprova; as do aplicativo de campo são uma lista nomeada, com dono,
    motivo e prazo (`scripts/auditar-excecoes.mjs`).
  */
  { id: "auditar", titulo: "npm run auditar", cmd: "npm run auditar", cwd: ".", esperado: { codigo: 0 } },
  /*
    Os dois `npm audit` crus CONTINUAM vermelhos por desenho, e é por isso que o
    esperado deles é "falha": medem o que a política do CP-03 aceita (raiz: 3
    avisos de ferramenta de desenvolvimento, entre eles dois críticos; campo: dezenas, da árvore do
    Expo SDK 57; a contagem muda com a base de avisos do dia: 61 em 2026-10-13, 59
    em 2026-10-14). A decisão está no CP-03, com prazo das exceções
    em 2027-01-05. Se algum dia um deles fechar em 0, o passo diverge de
    propósito: é a notícia de que a exceção pode sair.

    "Falha" sozinho não basta, e foi o furo da validação de 2026-10-13: o
    `npm audit` também sai diferente de zero quando o registro está fora do ar,
    e aí não auditou nada. Por isso o esperado exige o cabeçalho do relatório de
    verdade (`# npm audit report`), que só aparece quando houve auditoria e
    achados; com o registro fora do ar o passo diverge.
  */
  { id: "audit-raiz", titulo: "npm audit (dc360)", cmd: "npm audit", cwd: ".", esperado: { codigo: "falha", contem: RELATORIO_DE_AUDITORIA } },
  { id: "audit-campo", titulo: "npm audit (apps/campo)", cmd: "npm audit", cwd: "apps/campo", esperado: { codigo: "falha", contem: RELATORIO_DE_AUDITORIA } },
  /*
    O esperado é o verde de verdade: 21 de 21. Em 2026-10-13 a árvore deu 20 de 21
    por deriva externa (o Expo publicou patches de seis pacotes depois do 21 de 21
    de 2026-10-08, V-DEP-4); o Rafael decidiu atualizar (D1) e a E19, correção 2,
    subiu os seis patches com `npx expo install --fix`, rodou a suíte do aplicativo
    e voltou a 21 de 21. Ela voltou na manhã de 2026-10-14 (cinco patches novos)
    e foi fechada de novo no mesmo dia pela E19, correção 4 (21 de 21), por analogia
    com a D1, premissa que o Rafael ainda não confirmou. Se a deriva voltar (e ela
    volta a cada patch novo do Expo), o passo diverge de propósito: descreva-a em `divergenciaExplicada`, com
    o registro onde está, só se decidir não atualizar na hora.
  */
  {
    id: "expo-doctor",
    titulo: "npx expo-doctor",
    cmd: "npx expo-doctor",
    cwd: "apps/campo",
    esperado: { codigo: 0, contem: "21/21 checks passed" },
  },
  {
    id: "e2e",
    titulo: "npm run test:e2e (painel local, com o painel servido)",
    cmd: "npm run test:e2e",
    cwd: ".",
    // Fixa o motor: quem exportou `MOTOR=firefox` no terminal não troca o passo do Chromium por engano.
    ambiente: { MOTOR: "chromium" },
    // O E2E do modo local navega em `http://localhost:4173`. Sem o painel de pé a
    // falha é só "conexão recusada", que não é o vermelho que a linha de base mede.
    // O CI faz o mesmo: constrói o painel e sobe o `vite preview` antes do teste.
    servidor: {
      preparar: "npm run build --workspace @dc360/web",
      cmd: "npx vite preview --port 4173 --strictPort",
      cwd: "apps/web",
      url: "http://localhost:4173",
    },
    /*
      A V2-F00-E13 consertou o defeito que derrubava este passo: o painel nao
      tinha rota para a raiz, entao quem entrava partindo de `/` (que e o que o
      proprio E2E faz na secao 1) voltava para `/` depois do login e caia em
      "Esta pagina nao existe". O teste morria na secao 2, esperando
      `.indicador`. Agora ele fecha verde, em Chromium e em Firefox, com 70
      verificacoes (as 68 de antes mais as 2 que a E13 acrescentou na secao 2).
    */
    esperado: { codigo: 0, contem: "Passou: 70   Falhou: 0" },
  },
  /*
    O mesmo E2E do painel local no Firefox (V-ROT-02 do registro da E03, a D-4
    da validação de 2026-10-13). O texto da E01 e o item "E2E de navegador" do
    G00 pedem Chromium E Firefox, e o roteiro só rodava o Chromium: o Firefox só
    era conferido no CI, e quem repetisse a medição à mão num computador novo
    não via nada dele. O motor entra por `ambiente` (`MOTOR`, lido por
    `apps/web/test/fluxo.e2e.mjs`), não por prefixo de shell. O esperado é o
    mesmo do Chromium, de propósito: um painel que passa 70 de 70 num motor e
    outro número no outro tem defeito num dos dois. O Playwright guarda o
    Firefox em `~/.cache/ms-playwright` (ou o equivalente da máquina); quem
    ainda não o tem instala com `npx playwright install firefox`, passo 3 do
    `COMO-REPRODUZIR.md`.
  */
  {
    id: "e2e-firefox",
    titulo: "npm run test:e2e no Firefox (painel local, com o painel servido)",
    cmd: "npm run test:e2e",
    cwd: ".",
    ambiente: { MOTOR: "firefox" },
    servidor: {
      preparar: "npm run build --workspace @dc360/web",
      cmd: "npx vite preview --port 4173 --strictPort",
      cwd: "apps/web",
      url: "http://localhost:4173",
    },
    esperado: { codigo: 0, contem: "Passou: 70   Falhou: 0" },
  },
  /*
    Verde desde a V2-F00-E18. Morria na secao 13 (o CORS nao liberava
    `if-none-match` no preflight do PUT de evidencia). Com o arquivo inteiro
    rodando apareceram mais tres: a secao 15 contava as tres tabelas da tela
    como se fossem a trilha (teste), a secao 19 dizia "nao foi possivel carregar
    esta tela" ao registrar sem sinal (produto), e `e2e-api.mjs` nao terminava
    quando tudo passava (roteiro). 271 verificacoes executadas: o `conferir`
    conta as 251 chamadas de `ok(` no inicio de linha, e as demais ficam dentro
    de laco ou de funcao, e so aparecem na execucao.

    Desde a V2-F00-E09 (correcao 1) o comando roda DOIS arquivos em sequencia e
    cada um imprime o seu "Passou:": o fluxo contra a API (279 verificacoes
    executadas; eram 271 ate a E18) e a largura estreita
    (`layout-estreito.e2e.mjs`, 50, onde a correcao conferiu dialogos e barra
    inferior). Os dois trechos tem de aparecer.

    Correcoes 2 (2026-10-14): E09 e E10 acrescentaram conferencias as duas
    suites (a confirmacao com o foco nela, 5 s sem redirecionar, hover nos dois
    temas, geometria a 320 px): 288 verificacoes executadas no fluxo contra a
    API (as `ok(` no inicio de linha, que o `conferir` conta, sao 258) e 64 na
    largura estreita. Medido no Mac, Node 24, Chromium.

    Correcao 4 da E09 (2026-10-19): `layout-estreito.e2e.mjs` ganha tres secoes
    (o aviso passageiro por cima da janela da senha temporaria, o email que nao
    quebra no meio da palavra e a frase da senha atual errada nas duas telas):
    de 64 para 149 verificacoes executadas na largura estreita (104 na primeira rodada, mais 45 da revisao: icone, foco, janela no topo, teto do email e orgaos).

    Correcao 5 da E09 (2026-10-20): de 149 para 197 (mais 48): o foco depois da
    senha errada enviada com Espaco e com Enter (4), o campo focado que nao fica
    atras do topo fixo, ele e o rotulo (6) e o email nas janelas "Redefinir senha" e "Desativar
    usuario" a 320, 360, 390 e 768 px mais a linha da tentativa de envio do oficio
    a 320, 360 e 390 px (38). Medido no Mac, Node 24: 197 no Chromium e no
    Firefox; no WebKit 196 (uma verificacao do Tab
    e PULADA la, por escolha antiga do arquivo) e so a tela estreita, ver
    `e2e-api.mjs --so-layout`.

    Correcao 6 da E09 (2026-10-20): de 197 para 255 (mais 58), secao 13: o
    rotulo e o campo focados depois do erro inteiros entre o topo fixo e a barra
    do pe em Minha conta (11 tamanhos, com os zooms de 200 e 400 por cento, mais
    5 com Enter e a pagina no alto), Nova ocorrencia (6), "Defina a sua senha",
    Usuarios, Ocorrencia e Quero conhecer (12), o Tab natural em tres telas e
    quatro tamanhos (12), a linha do oficio na tela de verdade a 320 e 360 px
    (7), a busca do topo a 320 e 360 px (2) e o nome do link de Minha conta (3).
    Medido no Mac, Node 24: 255 no Chromium e no Firefox, 254 no WebKit.

    Correcao 6b da E09 (2026-10-20): de 255 para 287 (mais 32): o Tab com o
    quadro lento (requestAnimationFrame atrasado em 1 s, a condicao do WebKit
    sem tela do Linux que reprovou no CI, run 39488319365), a 390x400 e no
    Android deitado (640x360 e 740x360), agora em quatro telas com o Painel
    (de 12 para 36), Minha conta e Nova ocorrencia no Android deitado (4), e a
    rolagem horizontal a 320 px de todas as telas logadas nos dois temas, mais o
    texto de exemplo do filtro de Ocorrencias e o cadastro do agente (4). 287 no
    Chromium e no Firefox, 286 no WebKit.

    Correcao 7 da E09 (2026-10-24): de 287 para 325 (mais 38), secao 14: a frase
    de confirmacao de "Encerrar minhas outras sessoes" inteira entre o topo fixo
    e a barra do pe em sete tamanhos, por clique, toque e teclado (21), e o foco
    inicial de "Cancelar" a vista dentro da janela de confirmacao em Usuarios
    ("Redefinir senha" e "Encerrar sessoes", 7 tamanhos, 14) e em Minha conta
    (3). 325 no Chromium e no Firefox, 324 no WebKit.

    Correcao 8 da E09 (2026-10-25): de 325 para 390 (mais 65), secao 15, e o
    titulo da janela a vista passou a valer tambem na secao 14 (sem verificacao
    nova). A janela de confirmacao ABERTA acompanha a mudanca de tamanho (rotacao
    e zoom de 200 e de 400 por cento por mudanca de viewport, em Usuarios, 2
    janelas x 9 passos = 18 verificacoes, mais 3 em Minha conta), o clique e o
    toque no fundo escurecido, o foco que volta sozinho, o Tab e o Esc ouvidos
    no documento (4 tamanhos x 4 = 16) e o erro do servidor (5 tamanhos x 2
    janelas, durante a gravacao, depois do erro e o Esc: 28). 390 no Chromium e
    no Firefox, 389 no WebKit.

    Correcao 8b da E09 (2026-10-25): de 390 para 406 (mais 16), secao 15 (C):
    durante a gravacao (4 dos 5 tamanhos, os de demora de 1,2 s, x 2 janelas), o
    Esc e o clique no fundo nao fecham a janela de confirmacao. 406 no Chromium
    e no Firefox, 405 no WebKit.
  */
  {
    id: "e2e-api",
    titulo: "npm run test:e2e:api",
    cmd: "npm run test:e2e:api",
    cwd: ".",
    esperado: { codigo: 0, contem: ["Passou: 288   Falhou: 0", "Passou: 406   Falhou: 0"] },
  },
];

/** Marcadores no lugar de segredo (e do travessão). Cada regra roda antes de qualquer gravação. */
const REGRAS_DE_REDACAO = [
  [/eyJ[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]*/g, "[JWT REDIGIDO]"],
  [/(\bBearer\s+)[A-Za-z0-9._~+/=-]{8,}/gi, "$1[REDIGIDO]"],
  [/(\bBasic\s+)[A-Za-z0-9+/=]{8,}/g, "$1[REDIGIDO]"],
  [/([a-z][a-z0-9+.-]*:\/\/)[^/\s:@]+:[^/\s@]+@/gi, "$1[REDIGIDO]@"],
  [/([A-Za-z]:[\\/]+Users[\\/]+)[^\\/\s]+/g, "$1[usuario]"],
  [/(\/(?:Users|home)\/)[^/\s]+/g, "$1[usuario]"],
  // O teste de conteúdo do repositório varre `docs/` inteiro e reprova qualquer
  // travessão. A saída bruta dos testes traz o caractere dentro das mensagens de
  // falha, e arquivá-la sem trocar faria a própria evidência reprovar o portão.
  [/\u2014/g, "[travessao]"],
];

export function redigir(texto) {
  let saida = texto;
  for (const [regra, troca] of REGRAS_DE_REDACAO) saida = saida.replace(regra, troca);
  return saida;
}

const SEM_COR = /\u001b\[[0-9;]*[A-Za-z]/g;

/**
 * Lê as contagens que a ferramenta imprime. Devolve `{}` quando não acha nada:
 * quem compara trata a ausência como divergência, nunca como zero.
 */
export function extrairContagem(texto, ferramenta) {
  const limpo = texto.replace(SEM_COR, "");
  if (ferramenta === "vitest") {
    const m = /^\s*Tests\s+(.+?)\s+\((\d+)\)\s*$/m.exec(limpo);
    if (!m) return {};
    const parte = (nome) => Number((new RegExp(`(\\d+)\\s+${nome}`).exec(m[1]) ?? [0, 0])[1]);
    return { total: Number(m[2]), falhas: parte("failed"), puladas: parte("skipped") };
  }
  if (ferramenta === "node-test") {
    /*
      O resumo do `node --test` tem duas grafias: "# tests 260" (TAP, o que o
      Node 22 imprime quando a saída não é um terminal) e "ℹ tests 260" (o
      relator `spec`, que o Node 24 usa também sem terminal). Medido em 2026-10-14
      no Mac com Node 24: só a segunda aparecia, e o passo `test-scripts` dava
      "a saída não traz a contagem" com código 0 e 260 de 260 verdes.
    */
    const num = (nome) => {
      const m = new RegExp(`^(?:#|\u2139) ${nome} (\\d+)\\s*$`, "m").exec(limpo);
      return m ? Number(m[1]) : undefined;
    };
    const total = num("tests");
    return total === undefined ? {} : { total, falhas: num("fail") ?? 0, puladas: num("skipped") ?? 0 };
  }
  if (ferramenta === "jest") {
    const m = /^Tests:\s+(.+?),\s*(\d+)\s+total\s*$/m.exec(limpo);
    if (!m) return {};
    const parte = (nome) => Number((new RegExp(`(\\d+)\\s+${nome}`).exec(m[1]) ?? [0, 0])[1]);
    return { total: Number(m[2]), falhas: parte("failed"), puladas: parte("skipped") };
  }
  return {};
}

/** Compara o resultado de um passo com o esperado. Nunca "arredonda". */
export function avaliar(passo, saida, codigo) {
  const esperado = passo.esperado;
  if (!esperado) return { status: "sem-esperado", detalhes: [] };
  const detalhes = [];
  if (esperado.codigo === 0 && codigo !== 0) detalhes.push(`código de saída ${codigo}, esperado 0`);
  if (esperado.codigo === "falha" && codigo === 0) detalhes.push("código de saída 0, esperado falha (ficou verde)");
  const contagem = passo.ferramenta ? extrairContagem(saida, passo.ferramenta) : {};
  for (const campo of ["total", "falhas", "puladas"]) {
    if (esperado[campo] === undefined) continue;
    if (contagem[campo] === undefined) detalhes.push(`${campo}: a saída não traz a contagem`);
    else if (contagem[campo] !== esperado[campo]) detalhes.push(`${campo}: obtido ${contagem[campo]}, esperado ${esperado[campo]}`);
  }
  // `contem` é um trecho ou uma lista deles (o E2E da API imprime dois "Passou:", um por arquivo).
  for (const trecho of [esperado.contem ?? []].flat()) {
    if (!saida.replace(SEM_COR, "").includes(trecho)) detalhes.push(`a saída não contém "${trecho}"`);
  }
  if (detalhes.length === 0) return { status: "confere", detalhes };
  const explicada = passo.divergenciaExplicada;
  if (explicada && explicacaoServe(explicada, saida, codigo)) {
    return {
      status: "divergente-explicada",
      detalhes,
      explicacao: { id: explicada.id, onde: explicada.onde, motivo: explicada.motivo },
    };
  }
  return { status: "divergente", detalhes };
}

/** A explicação só vale quando a saída bate com a descrição inteira: código de saída e todos os trechos. */
function explicacaoServe(explicada, saida, codigo) {
  const limpo = saida.replace(SEM_COR, "");
  return codigo === explicada.codigo && explicada.contem.every((trecho) => limpo.includes(trecho));
}

/**
 * Nomes das tabelas onde cada etapa declara o que muda na contagem do passo,
 * para a mensagem do conferidor dizer ONDE atualizar.
 */
const TABELA_DO_PASSO = {
  "teste-shared": "MUDANCAS_DO_TESTE_SHARED_POR_ETAPA",
  "teste-db": "MUDANCAS_DO_TESTE_DB_POR_ETAPA",
  "teste-campo-pacote": "MUDANCAS_DO_TESTE_CAMPO_PACOTE_POR_ETAPA",
  "teste-api": "MUDANCAS_DO_TESTE_API_POR_ETAPA",
  "teste-console": "o número do próprio passo (teste-console)",
  "teste-web": "MUDANCAS_DO_TESTE_WEB_POR_ETAPA",
  "teste-campo-app": "MUDANCAS_DO_TESTE_CAMPO_APP_POR_ETAPA",
  "test-scripts": "TESTES_DAS_ETAPAS_SEGUINTES_EM_SCRIPTS",
};

/**
 * Compara o total que o roteiro ESPERA de cada suíte com os casos que a árvore
 * TEM, e devolve uma frase por problema (lista vazia quando tudo bate).
 *
 * `medidas` é `{ idDoPasso: { quantos, descontaPuladas } }`, medido por quem
 * chama (`conferir-numeros.mjs`: `vitest list` por pacote, a leitura estática do
 * aplicativo e o `node --test` de `scripts/`). `descontaPuladas` vale para a
 * lista do vitest, que não enumera o pulo por ambiente que avalia falso na
 * coleta: o total que o vitest IMPRIME é a lista mais esses pulos.
 *
 * Passo do roteiro com total esperado e sem medida também reprova: é a brecha
 * por onde uma suíte nova escaparia da conferência.
 */
export function conferirContagensDoRoteiro(medidas, passos = PASSOS) {
  const problemas = [];
  for (const passo of passos) {
    if (passo.esperado?.total === undefined) continue;
    if (!(passo.id in medidas)) {
      problemas.push(`${passo.id}: o roteiro espera ${passo.esperado.total} casos, mas nenhuma medida foi feita desta suíte. Meça-a em scripts/conferir-numeros.mjs.`);
    }
  }
  for (const [id, medida] of Object.entries(medidas)) {
    const passo = passos.find((p) => p.id === id);
    if (passo?.esperado?.total === undefined) {
      problemas.push(`${id}: foi medido, mas o roteiro (scripts/baseline.mjs) não declara total para este passo.`);
      continue;
    }
    const esperado = medida.descontaPuladas ? passo.esperado.total - (passo.esperado.puladas ?? 0) : passo.esperado.total;
    if (esperado === medida.quantos) continue;
    const diferenca = medida.quantos - esperado;
    problemas.push(
      `${id} (${passo.cmd}): o roteiro (scripts/baseline.mjs) espera ${esperado} casos e a árvore tem ${medida.quantos} ` +
        `(${diferenca > 0 ? "+" : ""}${diferenca}). A etapa que mexeu nos testes declara a diferença em ${TABELA_DO_PASSO[id] ?? "scripts/baseline.mjs"}.`,
    );
  }
  return problemas;
}

export function listarComandos(passos = PASSOS) {
  return passos.map((p, i) => `${String(i + 1).padStart(2, "0")} ${p.id.padEnd(18)} (${p.cwd})  ${comandoParaMostrar(p)}`);
}

export function lerOpcoes(argv) {
  const opcoes = { soListar: false, semInstalar: false, so: null, pular: [], saida: SAIDA_PADRAO };
  for (const a of argv) {
    if (a === "--so-listar") opcoes.soListar = true;
    else if (a === "--sem-instalar") opcoes.semInstalar = true;
    else if (a.startsWith("--so=")) opcoes.so = a.slice(5).split(",").filter(Boolean);
    else if (a.startsWith("--pular=")) opcoes.pular = a.slice(8).split(",").filter(Boolean);
    else if (a.startsWith("--saida=")) opcoes.saida = resolve(a.slice(8));
    else throw new Error(`opção desconhecida: ${a}`);
  }
  return opcoes;
}

export function escolherPassos(opcoes, passos = PASSOS) {
  const conhecidos = new Set(passos.map((p) => p.id));
  for (const id of [...(opcoes.so ?? []), ...opcoes.pular]) {
    if (!conhecidos.has(id)) throw new Error(`passo desconhecido: ${id}`);
  }
  return passos.filter((p) => {
    if (opcoes.semInstalar && p.instalacao) return false;
    if (opcoes.so && !opcoes.so.includes(p.id)) return false;
    return !opcoes.pular.includes(p.id);
  });
}

const LIMITE_POR_PASSO_MS = 25 * 60 * 1000;
const ESPERA_DO_SERVIDOR_MS = 60 * 1000;

/**
 * O ambiente do comando de um passo: o do processo, sem cor, mais o que o passo
 * declara em `ambiente` (por exemplo `MOTOR: "firefox"`). Vai por objeto, e não
 * por `MOTOR=firefox comando` no texto do comando, porque esse prefixo é sintaxe
 * de shell POSIX e o roteiro roda também no Windows.
 */
export function ambienteDoPasso(passo, base = process.env) {
  return { ...base, NO_COLOR: "1", FORCE_COLOR: "0", ...(passo.ambiente ?? {}) };
}

/**
 * O comando como se digita à mão, com o que o passo põe no ambiente na frente
 * (`MOTOR=firefox npm run test:e2e`). É só para MOSTRAR (cabeçalho do passo,
 * listagem e resumo): quem repete o passo copiando a linha tem de ver o motor,
 * porque sem ele os dois passos do E2E parecem o mesmo comando. A execução usa
 * `ambienteDoPasso`, e não este texto, por causa do Windows.
 */
export function comandoParaMostrar(passo) {
  const prefixo = Object.entries(passo.ambiente ?? {}).map(([chave, valor]) => `${chave}=${valor}`).join(" ");
  return prefixo ? `${prefixo} ${passo.cmd}` : passo.cmd;
}

function rodar(cmd, cwd, extra = {}) {
  return spawn(cmd, { cwd: join(RAIZ_DO_PRODUTO, cwd), shell: true, env: { ...process.env, NO_COLOR: "1", FORCE_COLOR: "0" }, ...extra });
}

function encerrarArvore(filho) {
  if (!filho.pid) return;
  if (process.platform === "win32") spawn("taskkill", ["/PID", String(filho.pid), "/T", "/F"], { stdio: "ignore" });
  else {
    try {
      process.kill(-filho.pid);
    } catch {
      filho.kill();
    }
  }
}

/** Espera de verdade o endereço responder, em vez de dormir um número inventado de segundos. */
async function aguardarResposta(url, limiteMs) {
  const fim = Date.now() + limiteMs;
  while (Date.now() < fim) {
    try {
      await fetch(url);
      return true;
    } catch {
      await new Promise((r) => setTimeout(r, 500));
    }
  }
  return false;
}

function executar(passo) {
  return new Promise((resolver) => {
    const inicio = Date.now();
    let saida = "";
    let servidor = null;
    const acrescentar = (b) => (saida += b);
    const terminar = (codigo) => {
      if (servidor) encerrarArvore(servidor);
      resolver({ saida, codigo: codigo ?? 1, duracaoMs: Date.now() - inicio });
    };
    const rodarComando = () => {
      const filho = rodar(passo.cmd, passo.cwd, { env: ambienteDoPasso(passo) });
      const prazo = setTimeout(() => {
        saida += `
[baseline] passo interrompido após ${LIMITE_POR_PASSO_MS / 60000} minutos
`;
        filho.kill();
      }, LIMITE_POR_PASSO_MS);
      filho.stdout.on("data", acrescentar);
      filho.stderr.on("data", acrescentar);
      filho.on("error", (e) => {
        saida += `
[baseline] não consegui iniciar: ${e.message}
`;
      });
      filho.on("close", (codigo) => {
        clearTimeout(prazo);
        terminar(codigo);
      });
    };
    if (!passo.servidor) return rodarComando();
    const { preparar, cmd, cwd, url } = passo.servidor;
    const prep = rodar(preparar, passo.cwd);
    prep.stdout.on("data", acrescentar);
    prep.stderr.on("data", acrescentar);
    prep.on("close", async (codigoPrep) => {
      saida += `
[baseline] preparo (${preparar}) saiu com ${codigoPrep}
`;
      servidor = rodar(cmd, cwd, { detached: process.platform !== "win32" });
      servidor.stdout.on("data", () => {});
      servidor.stderr.on("data", () => {});
      if (await aguardarResposta(url, ESPERA_DO_SERVIDOR_MS)) {
        saida += `[baseline] ${url} respondeu; rodando o teste

`;
        rodarComando();
      } else {
        saida += `[baseline] ${url} não respondeu em ${ESPERA_DO_SERVIDOR_MS / 1000} s
`;
        terminar(1);
      }
    });
  });
}

const sha256 = (conteudo) => createHash("sha256").update(conteudo).digest("hex");

export function montarResumo(resultados, quando) {
  const linhas = [
    "# Resumo da linha de base",
    "",
    `Gerado em ${quando}. Resultado esperado: o da árvore verde de hoje (a linha vermelha de 2026-09-30, REL:01 seção 3.4, é o histórico). Situações: confere; divergente-explicada (achado nomeado, ver o detalhe); divergente (sem explicação, reprova).`,
    "",
    "| Passo | Comando | Saída | Duração | Situação | Detalhe |",
    "| --- | --- | --- | --- | --- | --- |",
  ];
  for (const r of resultados) {
    const s = Math.round(r.duracaoMs / 1000);
    const nota = r.explicacao ? ` EXPLICADA por ${r.explicacao.id} (${r.explicacao.onde}): ${r.explicacao.motivo}` : "";
    linhas.push(`| ${r.id} | \`${r.cmd}\` (${r.cwd}) | ${r.codigo} | ${s} s | ${r.status} | ${(r.detalhes.join("; ") + nota).trim() || "-"} |`);
  }
  const sem = resultados.filter((r) => r.status === "divergente").length;
  const explicadas = resultados.filter((r) => r.status === "divergente-explicada");
  linhas.push(
    "",
    `Conferem: ${resultados.filter((r) => r.status === "confere").length} de ${resultados.length}. Divergentes sem explicação: ${sem}. Divergentes explicadas: ${explicadas.length}${explicadas.length ? ` (${explicadas.map((r) => `${r.id} por ${r.explicacao.id}`).join(", ")})` : ""}.`,
    "",
  );
  return linhas.join("\n");
}

export async function montarIndice(pasta) {
  const nomes = (await readdir(pasta, { recursive: true, withFileTypes: true }))
    .filter((e) => e.isFile() && e.name !== "INDEX.md")
    .map((e) => relative(pasta, join(e.parentPath ?? e.path, e.name)).replaceAll("\\", "/"))
    .sort();
  const linhas = ["# INDEX", "", "| Arquivo | SHA-256 |", "| --- | --- |"];
  for (const nome of nomes) linhas.push(`| ${nome} | ${sha256(await readFile(join(pasta, nome)))} |`);
  return linhas.join("\n") + "\n";
}

async function principal() {
  const opcoes = lerOpcoes(process.argv.slice(2));
  const passos = escolherPassos(opcoes);
  if (opcoes.soListar) {
    console.log(listarComandos(passos).join("\n"));
    return 0;
  }
  const pasta = opcoes.saida;
  await mkdir(pasta, { recursive: true });
  const resultados = [];
  for (const [i, passo] of passos.entries()) {
    console.log(`[${i + 1}/${passos.length}] ${passo.id}: ${comandoParaMostrar(passo)} (${passo.cwd})`);
    const { saida, codigo, duracaoMs } = await executar(passo);
    const avaliacao = avaliar(passo, saida, codigo);
    const cabecalho = `$ ${comandoParaMostrar(passo)}   (em ${passo.cwd})\ncodigo=${codigo} duracao=${Math.round(duracaoMs / 1000)}s situacao=${avaliacao.status}\n\n`;
    const arquivo = `${String(i + 1).padStart(2, "0")}-${passo.id}.txt`;
    await writeFile(join(pasta, arquivo), redigir(cabecalho + saida));
    console.log(`    codigo ${codigo}, ${avaliacao.status}${avaliacao.detalhes.length ? `: ${avaliacao.detalhes.join("; ")}` : ""}`);
    resultados.push({ id: passo.id, cmd: comandoParaMostrar(passo), cwd: passo.cwd, codigo, duracaoMs, ...avaliacao, arquivo });
  }
  const quando = new Date().toISOString();
  await writeFile(join(pasta, "resultados.json"), JSON.stringify(resultados, null, 2) + "\n");
  await writeFile(join(pasta, "RESUMO.md"), montarResumo(resultados, quando));
  await writeFile(join(pasta, "INDEX.md"), await montarIndice(pasta));
  return codigoDeSaida(resultados);
}

/**
 * 0: tudo confere. 1: há divergência, mas só explicada. 3: há divergência sem
 * explicação. O 2 é do roteiro quebrado (ver o final deste arquivo).
 */
export function codigoDeSaida(resultados) {
  if (resultados.some((r) => r.status === "divergente")) return 3;
  return resultados.some((r) => r.status === "divergente-explicada") ? 1 : 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  principal().then(
    (codigo) => process.exit(codigo),
    (erro) => {
      console.error(erro.message);
      process.exit(2);
    },
  );
}
