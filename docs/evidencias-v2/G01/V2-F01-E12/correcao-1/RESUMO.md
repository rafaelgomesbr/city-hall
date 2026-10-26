# V2-F01-E12, correção 1 (parte B): digest preservado, SHA implantado como fonte e painel publicado antes do selo

Revisão independente da F01 (Codex, somente leitura), achados 3, 4 e 5 de
`codex-f01-B`. Ramo `trab/f01-corr-b`, sobre `v2/f01` em `e483a22`. Nenhum
workflow foi disparado no GitHub; a prova é estática (regras do
`conferir-workflows.test.mjs`, YAML lido, `bash -n` de cada bloco `run:`) e por
dublê (o `esperar-painel.mjs`).

## Fatos

### Achado 3 (BLOQUEIA): a criação do selo podia mudar o digest

- **Confirmado** por leitura, contra a documentação do Docker citada pelo
  revisor: `docker buildx imagetools create` com UMA fonte usa por padrão
  `--prefer-index=true`, e um manifesto simples vira um índice novo, com OUTRO
  digest. O selo `hml-ok-<sha>` ficaria diferente de `sha-<sha>`, e a promoção
  (que exige os dois iguais) recusaria a versão que acabou de passar por HML.
  O mesmo valia para as cópias para o registro do Fly, nos dois workflows: o
  `flyctl deploy --image registry.fly.io/<app>@<digest>` pediria um digest que
  não existiria lá. Docker não foi executado.
- **Conserto:** toda `imagetools create` (selo e cópias, em `deploy-hml.yml` e
  `promover-producao.yml`) leva `--prefer-index=false` (cópia carbono) e é
  seguida da leitura do digest do destino no registro
  (`imagetools inspect ... --format '{{.Manifest.Digest}}'`) e da comparação com
  o digest construído; diferente reprova com `::error::`. No selo, um laço só
  sobre API e console.

### Achado 4 (BLOQUEIA): a promoção procurava o run pelo SHA errado

- **Confirmado** por leitura, contra a semântica do evento `workflow_run`: o
  run do `deploy-hml.yml` tem como `head_sha` a ponta do ramo padrão, e não o
  commit do `Verificar` que o disparou (que é o que o deploy implanta, pelo
  `github.event.workflow_run.head_sha`). Se o CI de A termina depois de B
  entrar na `master`, o run que implanta A tem `head_sha` de B; A ganha selo e
  depois a promoção (ou o rollback para A) não acha o run. Não reproduzido no
  Actions.
- **Conserto:** o `deploy-hml.yml` registra o SHA implantado no título do run
  (`run-name: Implantar HML ${{ github.event.workflow_run.head_sha }}`). A
  promoção monta `titulo="Implantar HML ${COMMIT}"`, lista os runs do
  `deploy-hml.yml` com `event=workflow_run&status=success`, paginado
  (`gh api --paginate`, `jq -s`), e filtra por `display_title == $titulo`,
  evento `workflow_run`, conclusão `success` e o arquivo do run; depois segue
  exigindo o job `aprovar` verde. Nada filtra mais por `head_sha`. O caso "A
  termina depois de B" fica coberto: o título é o do commit que AQUELE run
  implantou, em qualquer ordem.

### Achado 5 (BLOQUEIA): o selo nascia antes de saber se o painel foi publicado

- **Confirmado** por leitura: o job `painel` terminava quando o ramo
  `homologacao` se movia, e o `aprovar` (que depende dele) punha o selo sem
  ninguém olhar a Vercel. Uma falha de build do painel liberava PROD.
- **Conserto:** o job `painel` (agora com `deployments: read`, leitura, e
  `timeout-minutes: 25`) faz checkout do commit implantado e, DEPOIS de mover o
  ramo, roda `node scripts/esperar-painel.mjs --ambiente=hml
  --projeto="$PAINEL_HML_PROJETO_VERCEL" --commit="$COMMIT" --limite-min=15`.
  O script novo lê pela API do GitHub o deployment que a integração da Vercel
  registra para o commit no projeto de HML (`Production – dc360-painel-hml`),
  espera o estado `success` (o `Ready`), reprova LOGO em `failure`, `error` ou
  `inactive` (com o link do log), e depois exige `200` com HTML no endereço de
  HML, que vem de `scripts/ambientes.json` (`ambientes.hml.dominio`). Tempo
  esgotado reprova com o último estado visto. O `aprovar` continua dependendo
  do `painel`, então o selo só nasce com o painel publicado e respondendo.
- **Hoje o job reprova de propósito:** `ambientes.hml.dominio` é `null` (CP-05)
  e o projeto `dc360-painel-hml` ainda não existe na Vercel. É falha para o
  lado seguro, e está escrito no `docs/runbooks/deploy.md`.

## Testes

- `dc360/scripts/conferir-workflows.test.mjs`: 57 casos (eram 51; 6 novos:
  três regras, cada uma com o seu negativo). Dois casos que já existiam
  prendiam o defeito do achado 4 (a consulta por `head_sha=` e o
  `select(.head_sha == $sha ...)`); foram trocados pelo equivalente novo (a
  consulta por título com o SHA implantado), e a regra nova reprova
  explicitamente quem voltar a filtrar por `head_sha`.
- `dc360/scripts/esperar-painel.test.mjs`: novo, 10 casos, rede e relógio de
  mentira.

Saídas:

- `saidas/01-conferir-workflows-antes-do-conserto.txt`: as regras novas
  contra os workflows antigos: 8 reprovações (as 6 novas e as 2 que passaram a
  exigir a consulta por título).
- `saidas/02-esperar-painel-antes-do-script.txt`: os testes do script antes
  dele existir.
- `saidas/03-esperar-painel-depois.txt`: 10 de 10.
- `saidas/04-conferir-workflows-depois.txt`: 57 de 57.
- `saidas/05-sintaxe-bash-dos-run.txt`: `bash -n` de cada bloco `run:` dos dois
  workflows (15 e 13 blocos), sem erro.
- `saidas/06-yaml-valido.txt`: os dois workflows lidos como YAML (`js-yaml` do
  produto), com o `run-name`, os `needs` e as permissões de cada job.

- `saidas/07-portoes-finais.txt`: os portões da rodada inteira (as quatro
  etapas da parte B), com as falhas de ambiente do Windows aceitas.
- `saidas/08-portoes-depois-dos-indices.txt`: `test:scripts` e o conferidor de
  índices de evidência depois de acrescentar as linhas da correcao-1.

`actionlint` não está instalado nesta máquina e não foi rodado.

## Justificativa

- `--prefer-index=false` é a opção documentada para a cópia carbono; ler o
  digest de volta do registro transforma a premissa em verificação, e uma
  versão do buildx que ignorasse a opção reprovaria ali, em vez de produzir um
  selo que a promoção recusa.
- O título do run é escrito pelo próprio workflow, a partir do arquivo da
  `master` (todo `workflow_run` roda o arquivo do ramo padrão): mudar o que ele
  diz exige mudar o workflow, que tem revisão. A consulta continua exigindo o
  job `aprovar` verde, o digest igual e a atestação (as provas 3b e 3c não
  mudaram).
- A Vercel é observada pelo GitHub, sem token da Vercel no workflow: o
  `GITHUB_TOKEN` só ganhou leitura de deployments no job `painel`. A lista de
  escritas permitidas (`ESCRITAS_PERMITIDAS`) não mudou.
- Pendências que dependem de pessoa ou provedor (não tocadas): criar o projeto
  `dc360-painel-hml` na Vercel com o ramo de produção `homologacao` e declarar
  o domínio em `ambientes.hml.dominio` (CP-05, E10/H63); o ensaio real dos dois
  workflows no Actions (CP-05).
