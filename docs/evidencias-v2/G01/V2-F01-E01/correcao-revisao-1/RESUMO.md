# V2-F01-E01 (e E12), correção da revisão 1: ruleset dos ramos de implantação versionado

## O achado

O ruleset da `master` está versionado em `.github/rulesets/master.json`, mas os
ramos `producao` e `homologacao` (de onde a Vercel publica o painel de PROD e de
HML) só tinham a recomendação, em prosa, de bloquear exclusão e push de pessoas.
Sem o ruleset, quem tem escrita no repositório empurra o ramo `producao` à mão e
o painel de PROD sai sem passar pela promoção.

## O que mudou

- `.github/rulesets/ramos-de-implantacao.json` (novo): mira
  `refs/heads/producao` e `refs/heads/homologacao`; regras `creation`, `update`
  (push direto), `deletion` e `non_fast_forward` (force-push); a única exceção
  (`bypass_actors`) é o app do GitHub Actions (`Integration`, id 15368, o mesmo
  `integration_id` dos checks da `master`), porque é o `GITHUB_TOKEN` dos dois
  workflows que cria e move os ramos (com force, ao promover uma versão mais
  antiga). O ruleset da `master` continua sem exceção nenhuma.
- `dc360/docs/IMPLANTACAO.md`, seção 10.2, passo 4: deixa de ser "recomendado" e
  passa a dizer que importar esse ruleset é CONDIÇÃO DA PRIMEIRA PROMOÇÃO, com o
  que conferir depois de importar.
- `dc360/scripts/ruleset-master.test.mjs`: 4 casos novos (14 no total). O
  arquivo real passa na regra pura `problemasDoRulesetDeImplantacao`; os ramos
  do ruleset são os que os workflows movem e a `master` fica de fora; o
  `IMPLANTACAO.md` traz a condição; e o negativo prova que a regra morde (sem
  `creation`, `update`, `deletion` ou `non_fast_forward`, com pessoa ou papel no
  bypass, sem bypass, mirando um ramo só, ou inativo).
- `dc360/scripts/baseline.mjs`: a linha de V2-F01-E01 passa de 10 para 14.

## Limites declarados

- O ruleset só vale depois que o Rafael o importa (Settings > Rules > Rulesets >
  Import). Nenhum teste enxerga o GitHub. É pendência humana, e agora está
  escrita como condição da primeira promoção.
- Não foi possível provar fora do GitHub que o bypass por `Integration` 15368
  deixa o `GITHUB_TOKEN` criar e forçar o ramo; é o que o primeiro `Implantar
  HML` real confirma (passo registrado no `IMPLANTACAO.md`).

## Saídas

`saidas/01-teste-da-area.txt` (o arquivo de teste), `02-test-scripts.txt`
(`CI=true npm run test:scripts`, 0 falha), `03-lint-teto-formato-numeros.txt`.
