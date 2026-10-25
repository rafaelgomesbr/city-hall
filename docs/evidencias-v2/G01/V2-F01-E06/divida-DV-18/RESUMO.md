# V2-F01-E06, dívida DV-18: o Dependabot passa a vigiar a imagem do `compose.yaml`

Conserto no commit `9bbfc4a` (junto com a DV-27). Evidência desta dívida em `saidas/`.

## Fatos

### O defeito

O Dependabot vigiava o ecossistema `docker` só em `/dc360` (os `Dockerfile`). A imagem do Postgres/PostGIS
do `dc360/compose.yaml` (`postgis/postgis:17-3.5@sha256:...`, usada nos serviços `banco` e `papeis`) não
estava em nenhuma frente, e o comentário do arquivo dizia que ficava de fora de propósito. O banco de
desenvolvimento e de teste envelhecia sem aviso.

### O conserto

- `.github/dependabot.yml`: nova frente `docker-compose` em `/dc360`, semanal como as outras, `cooldown` de
  7 dias, no máximo 2 PRs, prefixo `dependencias(banco)`. **Major do `postgis/postgis` ignorado**
  (`version-update:semver-major`): trocar a versão do banco exige plano de migração, não PR de rotina. Minor e
  patch (inclusive o rebuild de segurança da imagem) entram. O comentário antigo, que dizia que o compose
  ficava de fora, foi trocado.
- `dc360/scripts/dependabot.test.mjs` continua verde, agora com **seis** frentes (a quinta é esta; a sexta é a
  da DV-27): o teste das frentes confere a de `docker-compose`, e um caso novo prende que a pasta tem o
  `compose.yaml`, que toda imagem dele é `postgis/postgis:*`, que o major é ignorado e que há `cooldown`.
- `dc360/docs/DEPENDENCIAS.md` e o parágrafo da E06 no `dc360/README.md` descrevem a frente nova.

### Provas (`saidas/`)

- `01`: o `dependabot.yml` lido pelo `js-yaml` (parser de verdade) lista as frentes, com a de `docker-compose`
  em `/dc360` e o ignore do major do banco; as duas imagens do `compose.yaml` que ela vigia.
- `02`: `dependabot.test.mjs`, todos os casos passam.

### Limitações

- Quem abre o PR é o Dependabot, no GitHub, e só no ramo padrão: o PR de fato não pôde ser observado. O
  que está provado é a configuração e o formato (YAML válido, ecossistema `docker-compose` e pasta com o
  `compose.yaml`). Como o Dependabot interpreta a tag `17-3.5` para decidir o que é "major" também não foi
  observado; o `ignore` de major está escrito no nome do pacote, e se o Dependabot não o reconhecer o efeito
  seria um PR a mais para o Rafael ler, nunca uma troca automática (não há auto-merge).

## Justificativa

A dívida pedia a frente `docker-compose` mantendo o teste verde. A frente existe, o teste foi atualizado
para a nova contagem e ganhou um caso próprio, e a única decisão que o comentário antigo protegia (não trocar a
versão do banco de graça) continua protegida pelo ignore de major.
