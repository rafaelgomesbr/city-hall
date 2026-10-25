# V2-F01-E05, dívida DV-16: erro de análise em `warn` dentro de `api/src` também reprova

Conserto no commit `fa26da8`. Evidência desta dívida em `saidas/`.

## Fatos

### O defeito

`dc360/scripts/sast-baseline.mjs` só reprovava erro de análise de nível `error` (`level === "error"`).
Um arquivo com erro de sintaxe sai do Semgrep como `level: "warn"` e o Semgrep termina com código 0, mas as
regras próprias NÃO rodaram nele. O portão ficava verde sem ter lido o arquivo, e é justamente em
`dc360/apps/api/src` que as regras próprias (organização da requisição, SQL por interpolação, log de
`Authorization`) valem.

O que o Semgrep 1.136.0 escreve de verdade para um arquivo assim (`saidas/01`): `{"code": 3, "level":
"warn", "type": "Syntax error", "message": "...", "path": "dc360/apps/api/src/..."}`. O `type` também pode
ser uma lista (`["PartialParsing", ...]`, `["Timeout", ...]`), que o conserto trata.

### O conserto

`classificarErrosDeAnalise(erros)` (exportada) separa os erros em bloqueantes e avisos:

- **bloqueia**: erro de nível `error`; QUALQUER erro, de qualquer nível e tipo, em `dc360/apps/api/src/`;
  erro sem caminho (não dá para provar que está fora da pasta);
- **aviso (listado, não reprova)**: erro de arquivo fora dessa pasta, onde as regras próprias não valem.
  Nenhum erro de parse some: todos saem na saída do portão.

A mensagem imprime só a primeira linha do erro (o Semgrep copia o trecho do código na mensagem). O código de
saída continua 2 ("sem leitura confiável") nos casos que bloqueiam.

### Provas (`saidas/`)

- `02` e `03`: o MESMO JSON do Semgrep real. **Antes** (script do commit anterior): "Aprovado", código 0,
  com um arquivo de `api/src` sem análise. **Depois**: reprova, código 2, dizendo `[warn] Syntax error em
  dc360/apps/api/src/...`. A varredura real do repositório (33 achados, todos na baseline) segue aprovada.
- `04` e o teste: `sast-baseline.test.mjs` passou de 10 para 14 casos (4 novos): erro de sintaxe em `warn`
  reprova sem despejar o código; `PartialParsing` e `Timeout` (tipo em lista) reprovam; erro `warn` fora de
  `api/src` é só aviso e erro sem caminho reprova; a função aceita lista vazia ou ausente.

### Limitações

- O arquivo com erro foi criado só para a prova, no worktree, e apagado (o Semgrep só olha arquivos
  rastreados pelo git; foi rodado com `--no-git-ignore`). O repositório não tem nenhum arquivo assim.
- Erro de análise fora de `api/src` continua sem reprovar: nenhuma regra própria vale lá. As regras do
  registro rodam num passo de relatório que nunca reprova (desenho da E05).

## Justificativa

A dívida pedia reprovar ou listar todo erro de parse, com teste. Fez as duas coisas: reprova onde um arquivo
sem análise é um furo no portão (a pasta das regras próprias, mais qualquer erro de nível `error` ou sem
caminho) e lista o resto.
