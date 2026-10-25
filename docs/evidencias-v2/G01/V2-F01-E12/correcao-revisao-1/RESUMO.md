# V2-F01-E12, correção da revisão 1: a promoção não confia mais só na tag do GHCR

## O achado

`promover-producao.yml` aceitava como prova de "passou por HML" a existência da
tag `hml-ok-<sha>` no GHCR e usava o digest dela. Quem tem escrita no pacote
consegue pôr uma tag em qualquer imagem, então a tag sozinha não prova que o
`deploy-hml.yml` rodou, nem que a imagem promovida é a que ele construiu.

## O que mudou

`.github/workflows/promover-producao.yml`, job `validar` (continua sem ambiente
e sem segredo; ganhou só `actions: read`, leitura):

1. **Run do Actions.** Pela API, exige um run de `deploy-hml.yml` com
   `head_sha == SHA`, `event == workflow_run` e `conclusion == success`, e o job
   `Marcar a versão como aprovada em HML` desse run concluído com sucesso.
2. **Digest igual.** Nas duas imagens, o digest de `hml-ok-<sha>` tem de ser
   IGUAL ao de `sha-<sha>` (o que o workflow construiu).
3. **Atestação.** `gh attestation verify oci://<imagem>@<digest> --repo ...
   --signer-workflow <repo>/.github/workflows/deploy-hml.yml
   --deny-self-hosted-runners` nas duas imagens.

`.github/workflows/deploy-hml.yml`, job `construir`: dois passos
`actions/attest-build-provenance@a2bbfa25375fe432b6a289bc6b6cd05ecd0c4c32`
(v4.1.0, fixada por SHA) atestam o digest de cada imagem com
`push-to-registry: true`.

### Permissão nova (justificada)

A atestação exige `id-token: write` (assinatura por OIDC) e `attestations: write`
no job `construir`. As duas entram em `ESCRITAS_PERMITIDAS` de
`conferir-workflows.test.mjs` (`construir:id-token`, `construir:attestations`),
com o motivo no comentário da lista, e valem só nesse job. O topo dos workflows
continua só lendo.

## Prova

`dc360/scripts/conferir-workflows.test.mjs` (48 casos, eram 44). Regras novas em
`problemasDaPromocao` e `problemasDoDeployHml`, e quatro casos negativos que
estragam o workflow real: sem a consulta ao run, sem `event=workflow_run`, sem
`conclusion == success`, sem o job de aprovação, sem `actions: read`; digest do
selo não conferido; sem `gh attestation verify` ou com outro `--signer-workflow`;
deploy de HML sem atestar uma das imagens, sem `push-to-registry`, sem
`id-token`/`attestations` ou com o job `aprovar` renomeado (a promoção o procura
pelo nome); e escrita nova em outro job reprova.

Saídas em `saidas/`: o arquivo de teste (01), a suíte `test:scripts` com
`CI=true` (02), os portões de lint, teto, formato e números (03) e a sintaxe de
bash dos blocos `run` (04).

## Segundo item da mesma revisão: ruleset dos ramos de implantação

`.github/rulesets/ramos-de-implantacao.json` passa a existir (ramos `producao` e
`homologacao`: sem criação, push direto, exclusão nem force-push, exceção só
para o app do Actions, `integration_id` 15368), e `IMPLANTACAO.md` diz que
importá-lo é condição da primeira promoção. A evidência completa está em
`docs/evidencias-v2/G01/V2-F01-E01/correcao-revisao-1/`; aqui fica a saída do
teste em `saidas/05-ruleset-ramos.txt`.

## Limites declarados

- Nada disto foi executado no GitHub: não há como rodar `gh attestation verify`
  nem a API do Actions fora do CI. O que está provado é o texto dos workflows
  (regras puras e casos negativos) e a sintaxe de bash dos blocos `run`.
- O `head_sha` de um run disparado por `workflow_run` é o último commit da
  branch padrão no momento do disparo. Se dois pushes na master se sucederem
  rápido, o run de um pode registrar o `head_sha` do outro; nesse caso a
  promoção do primeiro é recusada (falha fechada), e o remédio é promover o
  commit mais novo ou reexecutar o deploy.
- A primeira execução real (CP-05, ambientes do repositório no GitHub) é o que
  confirma o comportamento de `gh attestation verify` com `oci://` e do
  `--signer-workflow`.
