# V2-F01-E01, correção 1: ruleset da master com commit de merge (nunca squash)

Achado: codex-f01-A item 2 (BLOQUEIA).

## Fatos

- `.github/rulesets/master.json` permitia só `squash` (`allowed_merge_methods: ["squash"]`) e exigia histórico
  linear (`required_linear_history`). A decisão do Rafael (H09, `docs/roadmap-v2/28-execucao-e-validacao.md`,
  seção do merge em master) é commit de merge, nunca squash, para os SHAs citados nos VEREDITOs continuarem
  existindo na master. Importar o JSON como estava tornaria o procedimento aprovado impossível.
- O achado se confirma lendo o JSON e o teste `dc360/scripts/ruleset-master.test.mjs`, que exigia exatamente
  squash e a regra de histórico linear (`saidas/01`: dois casos reprovam quando o JSON novo é testado contra o
  teste novo, antes de o JSON mudar).
- Mudanças:
  - `master.json`: `allowed_merge_methods` passa a `["merge"]`; a regra `required_linear_history` sai (ela só
    admite squash ou rebase, os dois reescrevem os SHAs); o nome do ruleset deixa de dizer "squash".
  - `ruleset-master.test.mjs`: a função pura `problemasDoRuleset` passa a exigir `["merge"]` e a REPROVAR a
    presença de `required_linear_history`; o caso negativo ganha o histórico linear e o squash permitido.
    Nenhum caso novo (14 antes e depois), nenhum afrouxado: a mesma checagem, na direção da decisão.
  - Texto: `dc360/README.md` (seção do ruleset), `CLAUDE.md` (linha da master) e o comentário de contagem em
    `dc360/scripts/baseline.mjs` deixam de dizer squash.
- Prova (`saidas/`): `01` (teste novo contra o JSON antigo: 12 passam, 2 reprovam), `02` (teste novo contra o
  JSON novo: 14 passam), `03` (o JSON final).

## Justificativa

A decisão de merge é do Rafael e está escrita (H09). O ruleset é a forma de o GitHub impor a decisão, então tem
de concordar com ela antes de ser importado. Histórico linear foi removido junto porque, no GitHub, exigir
histórico linear impede o commit de merge.

## O que continua com o Rafael (não se conserta em código)

- **Importar o ruleset continua dependendo dele (H44, H56)**: Settings, Rules, Rulesets, Import, DEPOIS do merge
  da F00. Nenhum arquivo do repositório aplica o ruleset. Até a importação, o aceite de E01 (recusa de push
  direto e de force-push, PR vermelho que não mescla) e o check obrigatório de SAST de E04 NÃO estão provados
  contra o GitHub; o JSON é só a configuração pronta.
- O texto de `docs/roadmap-v2/04-fundacao-engenharia.md` (E01, "mesclado por squash" e o item da DoD com
  "squash") é do plano e não foi alterado aqui; a decisão da H09 o supera. Quem mantém o roadmap deve acertar.
- Não houve acesso ao GitHub: nada aqui foi aplicado nem consultado no estado remoto.
