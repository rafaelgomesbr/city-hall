# V2-F00-E22, dívida DV-08: o run 39366804765 não foi recusado inteiro pelo GitHub, só a tentativa 1

Dívida da rodada 8 da E22 (sobre `60cbc2f`). Paga em 2026-10-25, sobre `e48e5e9` (ramo `v2/f00`). Mudança só de texto, em `dc360/README.md` (parágrafo da linha de base e do CI, perto das linhas 1387-1391). Nenhum código tocado.

## Fatos

- O README dizia que o run 39366804765 (candidato `1ed0b71`) foi "recusado pelo GitHub antes de começar, por faturamento (H32)". Isso vale só para a tentativa 1.
- Consulta à API pública do GitHub, sem autenticação, em 2026-10-25 (`saidas/01-api-do-github-run-39366804765.txt`):
  - **Tentativa 1** (`run_attempt` 1): criada e encerrada em 2026-10-20 entre 03:55:13Z e 03:55:16Z (3 s), conclusão `failure`, os 9 trabalhos em `failure`. É o rastro de uma recusa antes de começar, coerente com o que a H32 registrou (faturamento).
  - **Tentativa 2** (`run_attempt` 2): iniciada em 2026-10-20 às 11:54:23Z (depois de o repositório virar público), encerrada às 12:12:02Z, conclusão `success`, os **9 de 9** trabalhos em `success`.
  - O `head_sha` do run, nas duas tentativas, é `76444203b15c87fd4c6b0f8797a5f33bf6503308` (`7644420`). O README seguiu chamando o run de "do candidato `1ed0b71`", que é como o STATUS o registra; o SHA do run foi acrescentado entre parênteses.
- Texto novo no README: o run 39366804765 (candidato `1ed0b71`, SHA do run `7644420`) teve a tentativa 1 recusada pelo GitHub antes de começar, por faturamento (H32), e a tentativa 2 (2026-10-20, depois de o repositório virar público) rodou 9 de 9 trabalhos verdes.
- **Não verificado:** o que mudou entre `1ed0b71` e `7644420` (o README já separa candidato e registro, e a frase não promete cobertura de código); o log de cada passo da tentativa 2 (li só os nomes e as conclusões dos 9 trabalhos).

## Justificativa

A frase antiga era verdadeira para a tentativa 1 e falsa para o run como um todo: quem lesse o README concluiria que o candidato `1ed0b71` ficou sem CI, quando a tentativa 2 passou 9 de 9. A correção separa as duas tentativas e cita a fonte (a API pública). Não há promessa de comportamento do código envolvida, só registro histórico, que é o que a DoD da E22 cobre.
