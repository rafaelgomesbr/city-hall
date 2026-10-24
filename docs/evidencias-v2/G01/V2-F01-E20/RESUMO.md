# V2-F01-E20: scan de contêiner (Trivy) no CI com política de exceção

## Fatos

**O que mudou (3 arquivos novos, 6 editados):**

- `dc360/scripts/varrer-imagem.sh` (novo): o lugar único da varredura, chamado pelo PR e pela agenda. Dois subcomandos.
  `instalar <destino>` baixa o Trivy **0.75.0** do release oficial, confere o **SHA-256 do tarball**
  (`c6e65abd...b3f3f`, igual ao `trivy_0.75.0_checksums.txt` do release) **antes de extrair** e imprime o caminho do
  binário. `varrer <trivy> <saida> <nome> <fonte...>` varre uma imagem com `--scanners vuln,secret --severity CRITICAL,HIGH
  --ignore-unfixed --ignorefile .trivyignore`, grava `<nome>.json`, `.sarif` e `.txt` e sai **0** (limpa), **1**
  (achado que reprova) ou **2** (o Trivy não conseguiu varrer, ou falta o `.trivyignore`): falha da ferramenta nunca vira
  verde. Sem segredo, sem telemetria, sem verificação de versão nova.
- `.github/workflows/verificar.yml`, **só o job `imagens`**: dois passos novos logo depois de construir as imagens
  ("Instalar o Trivy (versão fixa, SHA-256 conferido)" e "Varrer as duas imagens"). Os dois scans rodam sempre, para o
  artefato trazer os dois relatórios, e o passo reprova se qualquer um reprovou. O relatório sai em `trivy/` do artefato
  `imagens-<sha>`. Comentário do cabeçalho do job atualizado (o antigo dizia que o scan era da E20, "não feito"). Nenhum
  outro job foi tocado, e o nome de exibição do job não mudou (é contrato com o ruleset).
- `.github/workflows/auditoria-semanal.yml`: segundo job `imagens` ("Varredura semanal das imagens (Trivy)"): constrói as
  duas imagens do ramo padrão (a `master`, na agenda de segunda-feira) e as varre pelo mesmo script, com a mesma e única
  porta de exceção. CVE nasce sem commit; fica vermelho e avisa por e-mail como o job de dependências. Mesmas regras
  de CI do arquivo: `permissions: contents: read`, `ubuntu-24.04`, 40 minutos, ações por SHA, artefato
  `varredura-semanal-imagens-<run>`.
- `.trivyignore` (novo, na raiz): a política no cabeçalho e a triagem inicial, 9 identificadores (ver abaixo).
  Formato por linha: `<ID> exp:AAAA-MM-DD # motivo: ...; dono: ...`.
- `dc360/scripts/excecoes-de-seguranca.mjs`: nova função `analisarTrivyignore(texto, hoje)`, que reaproveita
  `problemasDaExcecao` (motivo de 20 caracteres ou mais, dono, prazo vigente de até 366 dias) e acrescenta: ID repetido,
  linha fora do formato e `exp:` igual a hoje (ver "Descoberta" abaixo).
- `dc360/scripts/excecoes-de-seguranca.test.mjs`: de 26 para 42 casos (+16): 7 da política do `.trivyignore`
  (completo, sem motivo/dono/prazo, motivo curto e data impossível e prazo longo, vencida e `exp:` de hoje, repetido e
  fora do formato, o arquivo real, e toda linha com os quatro campos), 1 do `varrer-imagem.sh` fixando versão, checksum e
  régua, 5 que **rodam o script de verdade** com um `trivy` de mentira (limpa sai 0, achado sai 1, ferramenta que falha
  sai 2, sem `.trivyignore` sai 2 sem chamar o Trivy, checksum errado interrompe a instalação antes de extrair), 1 que
  trava os dois workflows (instala antes de varrer, varre depois de construir as duas imagens, as duas imagens, o passo
  reprova se qualquer uma reprovou, nada de `continue-on-error` nem `|| true`, sem `secrets.`, sem `permissions` no job),
  e 2 de nome e agenda. Os de script em bash têm `skip` só no Windows (por ambiente, como os do hook de segredos).
- `dc360/scripts/baseline.mjs`: a linha `V2-F01-E05` passou de 26 para 42 (o arquivo é o mesmo), com a explicação.
- `dc360/docs/DEPENDENCIAS.md`: seção nova "Imagens de contêiner: a varredura do Trivy".

**Prova local (ver `saidas/`), com o Trivy 0.75.0 de macOS (também com SHA-256 conferido) e sem Docker:**

- `01`: o hash do tarball Linux que o CI vai baixar foi baixado agora e bate com o `checksums.txt` do release e com
  o que está em `varrer-imagem.sh`.
- `02`: três imagens montadas à mão (arquivo `docker-archive`, sem Docker) passam pelo `varrer-imagem.sh` real:
  **limpa sai 0**; **`app/.env` com uma chave de acesso AWS sai 1** (o "COPY .env de prova": CRITICAL, 2 achados de
  `secrets`); **`lodash 4.17.15` sai 1** (HIGH com correção). O relatório (`05`) não vaza o valor do segredo.
- `03`: com um arquivo de exceções de prova, a linha **vencida** (`exp:2026-10-01`) volta a reprovar, e as outras (com
  e sem motivo, para o Trivy) são ignoradas; e o `exp:` do Trivy é **exclusivo**.
- `04`: a **base real** das duas imagens (`node:22-bookworm-slim@sha256:de170b39...`), lida do registro sem Docker:
  sem exceção nenhuma ela reprova com 10 achados HIGH com correção (9 identificadores), todos no **npm embutido na
  imagem base** (`brace-expansion`, `ip-address`, `pacote`, `picomatch`, `sigstore`); com o `.trivyignore` da raiz ela
  sai 0; com o arquivo vazio, 1. O sistema operacional (Debian 12.15) deu 0.
- `06`: `excecoes-de-seguranca.test.mjs`, 42 de 42. `07`: `baseline`, `conferir-workflows`, `dependabot`,
  `smoke-das-imagens`, `ruleset-master`: 90 de 90. `08`: `node --test "scripts/*.test.mjs"` inteiro: ver limitações.

**Descoberta que mudou o desenho:** o `exp:` do `.trivyignore` é **exclusivo** no Trivy 0.75.0. Conferido às 21:04 UTC
de 2026-10-24: `exp:2026-10-24` já NÃO ignora o achado, e `exp:2026-10-25` ignora. Por isso o cabeçalho do
`.trivyignore` diz "primeiro dia sem exceção" e o teste trata `exp:` igual a hoje como linha sem efeito (reprova com a
razão), em vez de deixar o teste passar e o scan reprovar em silêncio. O Trivy também **honra a linha vencida por conta
própria** (volta a reprovar), então a exceção envelhece mesmo se o teste deixar de rodar.

**Triagem inicial (o Rafael lê, critério "Validação humana"):** 9 identificadores no `.trivyignore`, todos
`exp:2026-12-15`, dono Rafael, mesmo motivo: pacote do npm embutido em `/usr/local/lib/node_modules/npm` da imagem base,
que o processo de produção nunca executa (`CMD node`). Correção real = a próxima imagem base do Node (o Dependabot
propõe a troca de tag e digest, E06) ou tirar o npm da imagem no `Dockerfile`. Identificadores:
CVE-2026-102276, CVE-2026-102278, CVE-2026-13149, CVE-2026-14257, CVE-2026-69152, CVE-2026-69192, CVE-2026-9496,
CVE-2026-33671, CVE-2026-48815.

## Limitações, ditas sem rodeio

- **Nenhuma imagem foi construída nem varrida aqui.** Esta máquina não tem Docker. O que prova que as DUAS imagens
  reais passam é o job `imagens` do CI, que ainda não rodou. Foram varridos aqui: a base real (sem o que o `Dockerfile`
  acrescenta) e imagens de prova montadas à mão.
- **A primeira rodada do CI pode reprovar por achado que não vi.** O Chromium e as fontes vêm do `apt` no build
  (`apt-get install chromium`), e as dependências do app entram com `npm ci --omit=dev`: nada disso estava na base
  que varri. Se aparecer achado novo, a triagem é iterativa: corrigir (subir o pacote) ou escrever a linha no
  `.trivyignore` com motivo, dono e prazo. O critério "as duas imagens passam depois da triagem" só se fecha com esse run.
- **A exceção vale para o identificador na imagem inteira, não por caminho** (o formato `.trivyignore` do Trivy não
  tem caminho; o `.trivyignore.yaml` tem, mas a etapa pede o formato por linha). Hoje a lista é só do npm embutido;
  se `brace-expansion`, `picomatch` ou `pacote` aparecer também nas dependências do app, o scan não o dirá. A
  proteção que resta é o `npm audit` de runtime do `auditar` (E03/CP-03), que cobre a árvore do app. Está dito no
  cabeçalho do `.trivyignore` e em `DEPENDENCIAS.md`.
- **O SARIF não sobe ao code scanning.** "SARIF no PR" pede `security-events: write` no job, e
  `conferir-workflows.test.mjs` proíbe escrita em qualquer workflow (também rodar o `docker build` de código do PR com
  token de escrita seria um aumento de risco). O SARIF, o JSON e a tabela saem no artefato do run e um resumo vai para a
  página do run. Subir ao code scanning é decisão do Rafael (ver "Para o orquestrador").
- O download do banco de vulnerabilidades (espelho `mirror.gcr.io/aquasec/trivy-db`, com `ghcr.io` de reserva) acontece
  em todo run; sem cache. Se o espelho limitar, o scan sai 2 (nunca verde). Cache do banco é otimização futura.
- O `conferir:numeros` e o `regras-de-conteudo` (vitest) NÃO foram rodados: o worktree não tem `node_modules` e o disco
  estava com 1 GB livre (o `npm ci` não cabia). Nada que esta etapa mudou entra nessas contas (o `conferir:numeros`
  conta os testes do vitest e o README só afirma números dessas suítes); a linha de `baseline.mjs` foi conferida pelo
  `baseline.test.mjs` (29 de 29).
- Em `08`, de 563 casos 557 passam, 4 são pulados por ambiente (os de sempre) e 2 falham, **por causa do ambiente e do
  tempo**: `comando-de-migracao` precisa do `tsx` (sem `node_modules`) e o teste do índice de evidência reprova enquanto
  este `INDEX.md` não existe (autorreferente, como a E08 explicou). O segundo fica verde com o índice abaixo.
- A versão do Trivy (0.75.0, de 2026-10-01) é a mais recente com mais de duas semanas; a 0.76.x existe e fica para um PR
  de subida de versão (trocar `TRIVY_VERSAO` e `TRIVY_SHA256` juntos).

## Para o orquestrador

Linha do STATUS sugerida:

`| V2-F01-E20 | Scan de contêiner (Trivy) no CI com política de exceção | S | P1 | IMPLEMENTADA (candidato; falta o 1º run do CI do job imagens com o Trivy, que pode pedir triagem de achados do Chromium/apt) | docs/evidencias-v2/G01/V2-F01-E20/ |`

Conflitos prováveis na integração: `dc360/scripts/baseline.mjs` (linha `V2-F01-E05`; a E17 pode mexer em outras linhas do
mesmo arquivo) e `.github/workflows/verificar.yml` (eu só toquei o job `imagens`). O `Dockerfile` ainda diz, no
cabeçalho, que o CI "NÃO faz" varredura de vulnerabilidade (V2-F01-E20): não toquei nele (fora do escopo); vale
atualizar o comentário numa passada de documentação.

Pendências humanas (o que o Rafael faz fora do repositório):

1. **Ler a triagem inicial** do `.trivyignore` (9 identificadores do npm embutido, prazo 2026-12-15) e decidir entre
   deixar a exceção, tirar o npm da imagem (`rm -rf /usr/local/lib/node_modules/npm` no `Dockerfile`, que é arquivo da
   E08) ou subir a base.
2. **Olhar o primeiro run do CI** do job `imagens` depois do push. Se reprovar por achado do Chromium/apt, a
   triagem de cada um (corrigir ou excepcionar com dono e prazo) é dele ou de quem implementa a correção.
3. **Decidir sobre o SARIF no code scanning:** exige `security-events: write` no job e Code Scanning habilitado
   no repositório (configuração do GitHub), o que hoje a regra de workflows proíbe. Sem decisão, o relatório fica só no
   artefato.
4. **Disparar `auditoria-semanal.yml` à mão** (`workflow_dispatch`) uma vez, depois do push: a agenda só roda a partir
   da `master`, e esta é a única forma de provar o segundo job antes do merge.
5. **Opcional:** habilitar o cache do banco do Trivy se o espelho do banco limitar (sai 2, não verde).

## Riscos

- Achado novo da base entre o digest fixado e o dia do run reprova o PR (é o desenho: "PR pode reprovar por CVE nova da
  base"); a saída é a triagem, não desligar o passo.
- O Trivy baixa o banco de um registro público em todo run: indisponibilidade dele reprova o job (código 2), nunca passa.
- A exceção por identificador (não por caminho) pode esconder o mesmo CVE num pacote do app, ver acima.
