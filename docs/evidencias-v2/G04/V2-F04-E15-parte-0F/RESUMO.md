# V2-F04-E15, parte 0F: competência dos órgãos no pacote shared

## Fatos

- `dc360/packages/shared/src/competencia.ts`: funções puras `orgaosCompetentes(tipo, competencias)` (sugere os órgãos com competência ativa para o tipo COBRADE, sem repetição, em ordem estável) e `conferirEscolha(tipo, orgaoEscolhido, competencias, justificativa?)` (diz se a escolha está entre os sugeridos e, quando não está, se falta justificativa de ao menos 20 caracteres depois de aparar espaços). Nunca lança erro por escolha fora da sugestão: a pendência volta como dado.
- `dc360/packages/shared/test/competencia.test.ts`: 14 casos, todos passando (`saidas/01-testes-competencia.txt`).
- `dc360/scripts/baseline.mjs`: chave `V2-F04-E15-parte-0F` com 14 casos; totais do README e do `COLOCAR-DE-PE.md` ajustados; `conferir:numeros` confere.
- Portões rodados: typecheck, `formato:conferir`, `conferir:numeros`, `baseline.test.mjs`.

## Justificativa

- Premissa do CP-53, alternativa A para a competência (plano da F04): o sistema sugere e valida, pede justificativa e nunca bloqueia o encaminhamento.
- Primeira versão escrita pelo Codex (sem rodar testes nem commitar, pelo limite do sandbox); revisão do código, testes, formatação, contagens e commit feitos pelo orquestrador (Claude Opus). A revisão não mudou nenhuma regra: o código cumpre o pedido sem extrapolar.
- Os tipos COBRADE vêm de `TipoCobrade` do próprio shared: nenhuma taxonomia nova.

## Para o orquestrador

- Linha do STATUS sugerida: `V2-F04-E15 (parte 0F, shared) | IMPLEMENTADA (candidato) | orgaosCompetentes e conferirEscolha, 14 casos`.
- Dívidas pagas: nenhuma. Pendências humanas: nenhuma nova (as sugestões entram na validação de domínio com a Alyson, já registrada).
