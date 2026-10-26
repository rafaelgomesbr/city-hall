# V2-F01-E19, correção 1: SBOM da imagem publicada e licença pelo grafo de runtime

Origem: revisão independente da F01 (Codex), itens 1 (BLOQUEIA) e 8 (DÍVIDA) do relatório C.

## Fatos

### Item 1: o SBOM da imagem descrevia uma reconstrução (BLOQUEIA, confirmado e consertado)

- **O defeito, confirmado lendo `.github/workflows/sbom.yml` e `deploy-hml.yml`:** o job `sbom-imagem` fazia `docker build` e inventariava a imagem recém-construída. O `deploy-hml.yml` publica a imagem no GHCR, lê o digest do registro e a promoção (`promover-producao.yml`) leva esse digest a PROD. Como o `Dockerfile` instala Chromium e bibliotecas do Debian corrente, um release posterior podia inventariar versões diferentes das implantadas.
- **Conserto em `.github/workflows/sbom.yml` (job `sbom-imagem`):** sem `docker build`. O job entra no GHCR e resolve o digest do MESMO lugar e com as MESMAS provas da promoção: `docker buildx imagetools inspect <imagem>:hml-ok-<commit>` (o selo), igual ao `sha-<commit>` construído, e `gh attestation verify` com `--signer-workflow .../deploy-hml.yml`. `<commit>` é `github.sha`, o commit da tag. O Trivy lê `ghcr.io/<repo>/dc360-<api|console>@sha256:<digest>` com `--image-src remote` (nunca uma imagem que por acaso exista no runner), e o SBOM gerado tem de citar o digest (`grep -q`), senão o job falha. Digest ausente (commit sem imagem aprovada em HML) falha com `::error::` claro e nenhum SBOM de imagem é publicado. O job ganhou `permissions: contents: read, packages: read` (só leitura, igual ao `validar` da promoção). `deploy-hml.yml` e `promover-producao.yml` não foram tocados; só li como publicam.
- **Testes:** `dc360/scripts/sbom.test.mjs`. Dois casos novos: "o SBOM da imagem lê a imagem publicada por digest, do mesmo selo que a promoção, e não reconstrói" e "usa as MESMAS provas de digest que a promoção para PROD" (este lê o `promover-producao.yml` e exige que os trechos de leitura do selo, do digest construído e da atestação existam nos dois). Dois casos antigos foram ajustados ao job novo (a matriz perdeu o `dockerfile:`, e a permissão do `sbom-imagem` passou de "nenhuma" para "só `contents: read` e `packages: read`, sem escrita"). Antes: `saidas/01-antes-sbom-teste.txt` (4 reprovam contra o workflow antigo). Depois: `saidas/03-depois-sbom-teste.txt` (12 passam). `conferir-workflows.test.mjs` (permissões de escrita, ações por SHA, timeout): `saidas/06-conferir-workflows.txt` (51 passam).

### Item 8: o conferidor de licenças confiava só em `dev: true` (DÍVIDA, confirmado e consertado)

- **O defeito, confirmado lendo `dc360/scripts/licencas.mjs`:** `componentesDeProducao` pulava todo nó com `dev: true`. Um lockfile editado ou corrompido que marque como dev um pacote que a imagem instala o tirava da conferência de licença.
- **Conserto:** importa `nosDeRuntimeDoLockfile` de `auditar-excecoes.mjs` (o mesmo grafo do `auditar`). Produção passa a ser "alcançado pelo grafo de execução OU não marcado `dev`": o nó marcado `dev: true` só sai se o grafo também não o alcança. Mantive o `devOptional` e os nós fora do grafo sem marca como estavam, para a contagem real não mudar (plataforma 83, campo 731; `saidas/05-licencas-real.txt`).
- **Testes:** `dc360/scripts/licencas.test.mjs`, dois casos novos com a marca inconsistente sintética: `fast-uri` AGPL alcançado pela raiz e marcado `dev: true` aparece e, com a política decidida, REPROVA (proibida 1); o pacote que só `devDependencies` alcança continua de fora; e a transitiva `b` de `a` marcada `dev` também entra. Antes: `saidas/02-antes-licencas-teste.txt` (2 reprovam). Depois: `saidas/04-depois-licencas-teste.txt` (17 passam).

## Justificativa

- Gerar o SBOM sobre a imagem aprovada, e falhar quando ela não existe, troca "SBOM de uma imagem parecida" por "SBOM da imagem que vai para PROD ou nenhum". É o que a DoD da E19 pede (inventário do que foi empacotado).
- Usei a UNIÃO (grafo ou sem marca `dev`) e não o grafo sozinho porque o conferidor é de licença: errar para incluir é seguro, errar para excluir é o defeito. Nos dois lockfiles reais o grafo e a marca coincidem (medido), então nada muda no estado atual.

## Limitações e pendências

- **O workflow não foi executado.** Não há como rodar o `sbom.yml` sem uma tag e sem o GHCR; a prova é a leitura estrutural (os testes acima) e a igualdade textual com o que a promoção faz. Na primeira tag real, `gh attestation verify` e a presença do digest no SBOM do Trivy (`grep -q`) são os pontos a observar. Se a imagem do commit da tag não existir no GHCR (deploy de HML não rodou), o SBOM da imagem falha de propósito.
- Pendência para o orquestrador registrar: o primeiro release real valida o `sbom.yml` de ponta a ponta (depende de tag e de HML, CP-05).
