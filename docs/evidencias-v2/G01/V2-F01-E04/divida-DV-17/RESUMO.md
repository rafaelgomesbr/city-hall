# V2-F01-E04, dívida DV-17: a exceção da migração 046 só perdoa a linha inteira em formato conhecido

Conserto no commit `a15510d`. Evidência desta dívida em `saidas/`.

## Fatos

### O defeito

A exceção do `.gitleaks.toml` para a migração 046 era uma regex SEM âncora sobre o conteúdo da linha
(`046_senha_provisoria_e_o_dono_do_token_diz_por_que\.sql`, `regexTarget = "line"`, regra `generic-api-key`).
Qualquer linha, em qualquer arquivo, que citasse esse nome deixava de ser vista pelo detector de entropia,
inclusive uma que trouxesse um segredo ao lado do nome.

### O conserto

- A exceção virou **quatro** exceções, uma por formato de linha que o repositório de fato produz, todas com
  `^` e `$` e todas só na regra `generic-api-key`. Em todas, cada item da lista é um nome de migração
  (`[0-9]{3}_[a-z0-9_]+\.sql`) e o nome da 046 tem de estar na linha:
  1. elemento de lista TypeScript, com no máximo um vizinho (o detector lê o par de linhas
     `"046...sql",` e `"047...sql",`; só existe no histórico, em `dc360/db/src/regras-de-migracao.ts`);
  2. `Aplicadas: a, b, c` (o que a saída de `migrar` imprime);
  3. JSON de `migrar`, com o nome em `aplicadas`;
  4. JSON de `migrar`, com o nome em `jaEstavam`.
  Todas começam por `^\s*` porque o trecho que o gitleaks compara pode trazer espaço ou quebra de linha
  antes do texto (a exceção do rótulo de rodada, que já existia, também começa assim). O formato 1 precisou
  aceitar o par de linhas porque o achado do detector abrange `"046...sql",` e a linha seguinte (StartLine 79,
  EndLine 80 no relatório, ver `03`).
- `dc360/scripts/politica-de-segredos.test.mjs` ganhou 2 casos: um que prende os quatro formatos (casa os
  reais, recusa seis linhas com segredo ou texto ao lado do nome) e um que reprova QUALQUER regex de linha
  sem `^` no começo e `$` no fim (a trava geral, que vale para as próximas exceções por conteúdo).

### Prova com o gitleaks 8.30.1 oficial (`saidas/`)

- `01`: binário do release oficial de `gitleaks/gitleaks` v8.30.1; o SHA-256 do tarball baixado bate com o
  `gitleaks_8.30.1_checksums.txt` do mesmo release (macOS arm64, `b40ab0ae...`); o SHA-256 do tarball Linux
  da mesma lista (`551f6fc8...`) é o `GITLEAKS_SHA256` do `segredos.yml`.
- `02`: histórico completo (`HEAD`, 321 commits, com os commits deste conserto) com a config nova:
  **0 achados**.
- `03`: a mesma varredura sem a exceção da 046 dá 6 achados (os cinco de evidência da G00 e o par de linhas
  de `regras-de-migracao.ts`): é isso que o conserto continua perdoando, e só isso.
- `04`: matriz de três configurações por duas pastas. `pos` tem linhas reais do repositório com o nome da
  046 (lista de `migrar`, JSON, par de elementos); `neg` tem o nome da 046 ao lado de um segredo sintético
  gerado na hora (nunca gravado). Sem a exceção: pos 5 achados, neg 5. **Config antiga: pos 0, neg 1**, isto é,
  a antiga perdoou 4 das 5 linhas com segredo (o defeito). **Config nova: pos 0, neg 5**: os mesmos 5 da
  varredura sem exceção, nenhuma linha com segredo foi perdoada.
- `05`: o teste novo contra a config antiga reprova (2 falhas: a política geral e o formato).
- `06`: `politica-de-segredos.test.mjs` com a config nova, 21 de 21.

### Limitações

- O gitleaks usado na prova foi o de macOS (mesma versão e mesmo código do de Linux do CI). O run de
  `segredos.yml` com a config nova só existe depois do push do ramo.
- A exceção ainda é por conteúdo: uma linha que imite um dos quatro formatos (lista de nomes
  `NNN_nome.sql`) e esconda um segredo dentro de um "nome de migração" é perdoada. É o piso de uma exceção por
  conteúdo, e o formato é bem mais estreito que o anterior.

## Justificativa

A dívida pedia que a exceção deixasse de absolver qualquer linha que citasse o nome. Os quatro formatos
são os únicos que o histórico limpo exigia (provado: sem eles o histórico tem 6 achados; com eles, 0), e a
matriz prova a outra metade: a mesma config que limpa o histórico reprova as linhas com segredo que a antiga
perdoava. A trava geral de âncora no teste de política impede que a próxima exceção por conteúdo nasça frouxa.
