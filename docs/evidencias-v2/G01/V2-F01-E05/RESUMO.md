# V2-F01-E05: SAST (Semgrep CE) no CI, com política de exceção

Implementada em 2026-10-24 (ramo de trabalho `worktree-agent-a413c3562321a8571`, a partir de `v2/f00` em `bc3c535`). Esta etapa está IMPLEMENTADA, não validada: a validação é do gatekeeper.

## Fatos

### O que foi entregue

- `.github/workflows/sast.yml`: job `SAST (Semgrep)` (nome é contrato com o ruleset), `ubuntu-24.04`, `timeout-minutes: 15`, `permissions: contents: read`, três ações por SHA completo com a versão em comentário (`actions/checkout` v4.2.2, `actions/setup-python` v5.6.0, `actions/upload-artifact` v4.6.2, SHAs lidos com `git ls-remote`), dispara em push para `main`, `master` e `v2/**`, em pull request e manualmente. Instala `semgrep==1.136.0`, com `--metrics=off`, sem login e sem token. Passos, nesta ordem: `semgrep --test` das regras próprias, varredura de `dc360/`, `sast-baseline.mjs conferir`, publicação das saídas como artefato `sast-<sha>` (30 dias).
- `.semgrep/regras/` (três arquivos, quatro regras, todas ERROR) e `.semgrep/test/` (casos `ruleid` e `ok` para cada regra):
  - `dc360-organizacao-lida-da-requisicao`: `organizacaoId`, `organizacao_id`, `org`, `tenant` (e `x-organizacao-id`) lidos de `body`, `params`, `query` ou `headers`, inclusive por desestruturação, em `dc360/apps/api/src`.
  - `dc360-organizacao-da-requisicao-chega-no-tenant` (taint): qualquer valor que nasce em `req.body|params|query|headers` e chega ao primeiro argumento de `comTenant(...)`, mesmo passando por `schema.parse` e variável.
  - `dc360-sql-por-interpolacao` (taint): template com `${...}` ou concatenação com literal que chega a `query(` (com ou sem `<T>`, com ou sem `await`).
  - `dc360-log-de-authorization`: `req.headers.authorization` (ou `req.headers` inteiro) em `log|trace|debug|info|warn|error|fatal(...)`, em argumento, em objeto ou em template.
- Os pacotes do registro (`p/typescript`, `p/nodejs`, `p/react`, `p/jwt`) NÃO estão no repositório: ele é público (decisão de 2026-10-20) e essas regras são da Semgrep Rules License v1.0 (uso interno, sem redistribuição). Um passo do job, "Relatório dos pacotes do registro (não reprova)", baixa os pacotes na hora (`--config p/...`), com `continue-on-error: true` e `|| true`, e publica a saída no artefato (`04-registro-relatorio.json` e `.txt`). Só as 4 regras próprias bloqueiam. A versão anterior deste candidato tinha uma cópia fixada em `.semgrep/registro/` (com `SNAPSHOT.json` e um atualizador); foi removida por inteiro.
- `.semgrep/baseline.json`: 33 achados antigos triados (ver abaixo), cada um com classe, motivo, dono e prazo.
- `.semgrepignore`: exclui `mockup/`, `docs/`, `relatorio/`, `.semgrep/test/`, testes automatizados, `e2e/`, `node_modules/` e `dist/`.
- `dc360/scripts/sast-baseline.mjs` (+ `sast-baseline.test.mjs`, 10 casos): compara o JSON do Semgrep com a baseline; reprova só ERROR novo; impressão digital do achado = regra + arquivo + primeira linha do trecho + ordem entre iguais (sem número de linha); erro de análise do Semgrep reprova (código 2); aviso novo de severidade menor só avisa.
- `dc360/scripts/excecoes-de-seguranca.mjs` + `excecoes-de-seguranca.test.mjs` (26 casos): todo `nosemgrep` exige id de regra, motivo (mínimo 20 caracteres), dono e `ate: AAAA-MM-DD` vigente (vale até o fim do dia, máximo 366 dias à frente); supressão cega é proibida; a baseline obedece à mesma política; nenhuma cópia das regras do registro existe no repositório (`.semgrep/registro/` e o atualizador não podem existir; só os três arquivos de regra próprios); toda regra própria tem `ruleid` e `ok` em `.semgrep/test/`; o workflow não contém token, login nem `--config auto`, fixa a versão, só consulta `p/...` num passo de relatório com `continue-on-error` e segue as regras de CI da E02.
- `dc360/scripts/baseline.mjs`: duas linhas novas nas tabelas de contagem (`V2-F01-E05`: 25, `V2-F01-E05-baseline`: 10).
- `dc360/README.md`: seção "Análise estática (SAST) e política de exceção" dentro de "Integração contínua".

### Comandos e resultados reais (saídas em `saidas/`)

Ambiente: macOS, Node 24.15.0, Semgrep CE 1.136.0 instalado em venv Python 3.9 fora do repositório (nenhum lockfile tocado; `npm ci` em `dc360/` só para rodar os portões).

| Arquivo | Comando | Resultado |
| --- | --- | --- |
| `02-semgrep-test.txt` | `semgrep --test --config .semgrep/regras .semgrep/test` | código 0, 4/4 regras passam |
| `03-semgrep-scan.txt` | `semgrep scan --config .semgrep/regras --json ... dc360` | código 0; 4 regras, 72 arquivos, 33 achados (todos ERROR) |
| `04-baseline-conferir.txt` | `node dc360/scripts/sast-baseline.mjs conferir semgrep.json` | código 0; 33 na baseline, 0 novos |
| `05` e `06` | PR de prova simulado: `req.body.organizacaoId` + `comTenant(organizacaoId, ...)` acrescentados a `rotas/orgaos.ts` (restaurado depois) | varredura acha 2 ERROR novos (as duas regras de organização); `conferir` sai com código 1 |
| `07-prova-semgrep-test-morde.txt` | regra de organização enfraquecida de propósito (sem `body`) | `semgrep --test` sai com código 1 (linhas 15, 21 e 41 sem achado) |
| `08-nosemgrep-respeitado-pelo-semgrep.txt` | `nosemgrep: <regra> -- motivo; dono; ate` na linha e na linha de cima | o Semgrep suprime as duas; mantém a de outra regra e a sem supressão |
| `09`, `10`, `11` | exceção sem data, vencida (2026-01-01) e supressão cega, acrescentadas a `rotas/orgaos.ts` | `excecoes-de-seguranca.test.mjs` sai com código 1 e diz o arquivo, a linha e o problema |
| `12-prova-registro-copiado-reprova.txt` | um `.semgrep/registro/typescript.yml` criado de volta | teste sai com código 1 ("nenhuma cópia das regras do registro mora no repositório") |
| `18-relatorio-do-registro.txt` | o passo de relatório rodado à mão: `semgrep scan --config p/typescript --config p/nodejs --config p/react --config p/jwt dc360` | código 0; 1 achado e 1 erro de análise, informativos (não bloqueiam nada) |
| `13-teste-excecoes-e-baseline.txt` | `node --test` dos dois arquivos novos | 35 de 35 |
| `14-test-scripts.txt` | `npm run test:scripts` | ver abaixo |
| `15-baseline-test.txt` | `node --test scripts/baseline.test.mjs` | 29 de 29 |
| `16-conferir-numeros.txt` | `npm run conferir:numeros` | código 0, "Todos os números da documentação batem com a realidade" |
| `17-regras-de-conteudo.txt` | portão de conteúdo (`regras-de-conteudo.test.ts`) | 10 de 10 |

`npm run test:scripts`: 389 casos (353 antes desta etapa, mais 36), 385 passam, 4 pulados por ambiente (os mesmos 4 de antes), 0 falhas. A primeira rodada, feita antes de existir o `INDEX.md` desta pasta, reprovou 1 caso (`conferir-indices-de-evidencia`: "a pasta da etapa não tem INDEX.md"), como esperado; a saída arquivada em `14` é a da rodada depois de o índice existir.

### Triagem da baseline (33 achados; Rafael lê)

Nenhum defeito real foi encontrado. Todos os 33 foram lidos no código e classificados `falso-positivo`, com dono Rafael e prazo 2027-01-31 (reavaliar até lá ou antes, na V2-F25-E01).

| Regra | Onde | Qtd | Por que é falso positivo |
| --- | --- | --- | --- |
| `dc360-sql-por-interpolacao` | `rotas/ocorrencias.ts` (10), `rotas/prestacao-de-contas.ts` (8), `rotas/avisos.ts` (3), `rotas/evidencias.ts` (2), `rotas/busca.ts` (1) | 24 | A parte interpolada é um fragmento de SQL escrito no código: o recorte do agente (`eRecorteDoAgente`/`recorteDoAgente`, que devolve `alias.equipe_id = (SELECT ... WHERE u.id = $N)` e empilha o valor em `params`), a lista de condições (`condicoes.join(" AND ")`, em que cada condição usa `$N`), `condicaoAtrasada(alias)`, o teto numérico `LIMIT 5001` (constante do módulo) e colunas extras escolhidas entre literais. Nenhum valor da requisição é colado; todos viajam em `params`. |
| `dc360-sql-por-interpolacao` | `rotas/saida-a-campo.ts` (6), `push/varredor.ts` (2) | 8 | Interpola constantes do módulo (`COLUNAS_DA_SAIDA`, `DE_ONDE`, `COLUNAS_DO_ALVO`), listas fixas de colunas e junções. |
| `dc360-sql-por-interpolacao` | `saida/pacote.ts` (1) | 1 | Interpola identificadores: tabela vem de `TABELAS_DA_SAIDA` (lista fixa), colunas do catálogo do banco, ambas por `citar` (aspas duplas com escape); a ordem é literal. |

Observação de critério: as regras de organização (1) e o log de Authorization (3) não acharam nada no código atual, como a etapa previa. A regra (2) achou as 33 ocorrências onde a busca textual simples não achava nenhuma, porque o repositório monta SQL em várias linhas e por variável (`onde`, `recorte`). São todas do mesmo idioma seguro (fragmento estático com marcador posicional). Isso é ruído previsível da regra, e o preço é uma linha de baseline com motivo para cada consulta nova do mesmo estilo. Sugestão para a V2-F25-E01: um construtor tipado de fragmento (`sql\`...\``) que a regra reconheça como sanitizador, o que zera o ruído sem relaxar a regra.

### Limitações e o que NÃO foi feito

- O workflow nunca rodou no GitHub (sem push, por instrução): a prova de execução em Linux e o PR de prova real reprovado e fechado estão pendentes. O que existe é a simulação local equivalente (arquivos 05 a 12 e 18), com o Semgrep 1.136.0 em macOS e Python 3.9; o runner usa Python 3.12 e a mesma versão do Semgrep.
- O check `SAST (Semgrep)` não foi posto no ruleset (ação no GitHub, pendência humana).
- A instalação no CI é `pip install semgrep==1.136.0`: a versão do Semgrep é fixa, as dependências transitivas do pip não (sem `--require-hashes`). Risco registrado.
- A mensagem do Semgrep CE não traz o texto do trecho (`lines` vem como "requires login"), por isso a impressão digital lê a linha do arquivo no disco.
- Um limite do analisador de TypeScript do Semgrep, achado na etapa: `c.query<T>(...)` NÃO casa depois de `await` sem o `await` no padrão. A regra de SQL trata os dois formatos e há casos de teste para ambos; outra forma de chamada com tipo genérico ainda pode escapar.
- Fora do escopo, como pedido: CodeQL, DAST (F25-E10), tratamento dos achados (F25-E01), scan de contêiner e SBOM.
- O conferidor de workflows da E02 (`conferir-workflows.test.mjs`) ainda não existe neste ramo; `sast.yml` foi escrito segundo as regras descritas para ele (permissions, timeout, runner fixo, SHA) e o `excecoes-de-seguranca.test.mjs` confere essas mesmas regras para o próprio `sast.yml`.

## Justificativa

- **Registro só como relatório, baixado na hora, em vez de cópia fixada.** A primeira versão copiava e fixava por SHA-256 os pacotes do registro. Isso é redistribuição, que a Semgrep Rules License v1.0 não permite, e o repositório é público desde 2026-10-20. Agora o que bloqueia é só autoria do projeto (as 4 regras e a baseline delas), e o registro roda como uso, num passo que nunca reprova (o registro muda sem aviso e quebraria o CI por culpa dele). Preço: o achado do registro (por exemplo o `gcm-no-tag-length` em `auth/cofre.ts`, falso positivo já lido) não é mais portão nem entra na baseline; ele aparece no relatório do artefato para a revisão humana.
- **Baseline própria em vez de `--baseline-commit`.** O diff por commit só existe em PR e esquece o achado antigo assim que ele sai do diff; a etapa pede uma baseline triada com defeito real apontando para a F25-E01. O Semgrep CE não entrega impressão digital própria, então ela é calculada, sem número de linha para não reabrir achado por causa de código inserido acima.
- **Duas regras para a organização.** A de acesso direto é simples e barata de ler; a de fluxo pega o caso realista (o valor passa por `schema.parse` e por variável antes de `comTenant`), que é como o erro nasceria num portal novo.
- **`nosemgrep` com motivo, dono e data na mesma linha.** O Semgrep ignora o que vem depois do id da regra (provado em `08`), então a política cabe no marcador sem inventar formato paralelo. Máximo de um ano, porque exceção sem prazo real vira decisão permanente.
- **Prazo de 2027-01-31 na baseline.** Cerca de três meses: tempo de a F25-E01 tratar o ruído da regra de SQL, e curto o bastante para a triagem não virar tapete.
- **O teste de política não depende do Semgrep.** Roda em `test:scripts` no Windows e no Linux e morde mesmo onde a ferramenta não está instalada; o Semgrep em si é provado pelo job `SAST (Semgrep)`.

## Para o orquestrador

Linha sugerida para o STATUS (a coluna de observação):

`V2-F01-E05 | IMPLEMENTADA | candidato <sha7> (worktree, sem push). SAST Semgrep CE 1.136.0: 4 regras próprias (organização da requisição, organização até comTenant, SQL por interpolação, log de Authorization), pacotes do registro só como relatório que não reprova (sem cópia no repositório público), baseline triada de 33 achados (0 defeitos reais, 33 falsos positivos), política de exceção nosemgrep com motivo, dono e prazo. test:scripts 389 (385 + 4 pulados), conferir:numeros verde.`

Conflitos previsíveis na fusão com os outros implementadores do lote: `dc360/scripts/baseline.mjs` (duas linhas acrescentadas no fim das duas tabelas de contagem: some os casos das outras etapas ao total), `dc360/README.md` (a seção nova fica antes de "O que falta, e por quê"), e o total de `test:scripts` (353 mais 36 desta etapa).

Pendências humanas:

1. Dar push do ramo e ver o job `SAST (Semgrep)` verde no GitHub; guardar o run como prova de execução em Linux.
2. Abrir o PR de prova (acrescentar `const organizacaoId = req.body.organizacaoId;` num arquivo de `dc360/apps/api/src`), ver o check reprovar, anexar o link à evidência e fechar o PR sem merge.
3. Incluir o check `SAST (Semgrep)` no ruleset da `master` (configuração do GitHub, junto com os outros checks da E01).
4. Ler a triagem da baseline (tabela acima e `.semgrep/baseline.json`) e confirmar ou discordar de alguma linha; enquanto isso `triagem_lida_por_humano` fica `false` no arquivo.
5. Ler o relatório do registro no primeiro run do GitHub (artefato `sast-<sha>`, `04-registro-relatorio.*`) e decidir se algum achado dele merece virar regra própria. O passo baixa regras na hora: se um dia a política de uso do registro mudar, é só remover esse passo.
