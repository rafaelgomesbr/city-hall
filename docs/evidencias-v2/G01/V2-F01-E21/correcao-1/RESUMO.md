# V2-F01-E21, correção 1: a imagem comunitária do PostGIS passa pelo Trivy

Achado: codex-f01-C item 5 (DÍVIDA), atribuído a esta parte.

## Fatos

- Confirmado: o job `imagens` do `verificar.yml` e o job `imagens` do `auditoria-semanal.yml` varrem com o Trivy
  apenas `dc360-api:ci` e `dc360-console:ci` (laço `for par in "api:..." "console:..."`). A imagem
  `postgis/postgis:17-3.5@sha256:01a6a70e...` (digest fixado na E21, usada nos serviços do `verificar.yml` e no
  `compose.yaml`) não era varrida, apesar de o comentário da E21 afirmar a varredura; uma CVE corrigível nela não
  mexia no resultado.
- Conserto: o passo "Varrer as três imagens" dos dois workflows baixa a imagem (`docker pull --quiet`, pelo digest)
  e a inclui NO MESMO laço, com a mesma régua (`varrer-imagem.sh varrer`: CRITICAL e HIGH com correção publicada,
  mais segredo), a mesma porta de exceção (`.trivyignore.yaml`) e o mesmo "reprova se qualquer uma falhou"
  (`exit "$falhou"`). Os relatórios saem em `trivy/postgis.{json,sarif,txt}` no artefato.
- Teste novo (`excecoes-de-seguranca.test.mjs`, 1 caso): o digest varrido nos dois workflows é o MESMO do
  `compose.yaml` e de todos os serviços `image:` do `verificar.yml`, a imagem entra no laço das nossas, o `docker
  pull` existe e nada mascara a falha. `saidas/01` reprova contra os workflows antigos, `saidas/02` passa contra
  os novos.

## Justificativa

Imagem de terceiros que o projeto executa (aqui, no CI e no compose local) é cadeia de suprimentos. Reutilizar o laço e o `.trivyignore.yaml` mantém UMA política de exceção, como o pedido dizia.

## Riscos e pendências

- **Não rodei o Trivy** (sem Docker neste ambiente). A primeira execução pode reprovar por CVE corrigível já
  presente na imagem do digest atual. Se acontecer, o caminho é subir o digest (o Dependabot propõe tag e digest
  do `compose.yaml`), e NÃO afrouxar a régua. A política do `.trivyignore.yaml` só aceita caminhos do npm
  embutido na imagem base de Node (`usr/local/lib/node_modules/npm/`); perdoar algo no PostGIS exigiria mudar essa
  política de propósito (`excecoes-de-seguranca.mjs`), decisão do Rafael.
- O digest dos serviços do `verificar.yml` e do laço de varredura estão em linhas separadas; o teste novo reprova
  se divergirem do `compose.yaml`.
