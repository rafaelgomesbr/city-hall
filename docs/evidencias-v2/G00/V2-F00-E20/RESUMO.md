# V2-F00-E20: portão de conteúdo sem as linhas vermelhas pré-existentes

Data: 2026-10-07. Produzido pelo agente executor da etapa. Nada commitado.

## O que foi feito

- `dc360/apps/web/test/trilha-detalhe.test.ts`: o literal do travessão dentro de `expect(rotulo).not.toContain(...)` virou o escape `"\u2014"`, com a mesma asserção e um comentário do motivo. O teste continua provando que nenhum rótulo do dicionário contém o caractere (passou no painel, 636 testes).
- `dc360/packages/shared/test/regras-de-conteudo.test.ts`:
  - `CAMINHOS_IGNORADOS` passou a ter alcance por entrada: `pasta` (as três de antes, sem mudança), `pasta-fora-de-md` para `docs/auditoria-v2/raw` e `docs/evidencias-v2` (só o que não termina em `.md`, e só abaixo da pasta, com o separador no fim) e `arquivo` para `docs/AUDITORIA-2026-09-30.md` (nome exato). Cada entrada tem comentário de motivo.
  - A varredura do travessão virou a função `achadosDeTravessao(raizRepo)`, a mesma usada pelo portão de verdade e pelos casos de âncora.
  - Nota no cabeçalho do arquivo explicando as isenções.
  - 3 casos novos: âncora na árvore real (o teste do painel, o relatório Baseline Zero, os `.md` da auditoria e o `RESUMO.md`/`INDEX.md` das evidências continuam varridos; a auditoria de 2026-09-30 e a saída bruta não) e dois num repositório sintético montado em pasta temporária.
- `docs/roadmap-v2/19-definicao-de-pronto.md`, seção 3: parágrafo sobre o travessão e as isenções no padrão de evidência.
- `dc360/scripts/baseline.mjs`: `"V2-F00-E20": { total: 3, falhas: -1 }` no shared, e o passo `teste-shared` passa a esperar código 0.
- Números da documentação que a etapa mudou: `docs/COLOCAR-DE-PE.md` (4680 para 4683, duas linhas) e `README.md` (2819 para 2822).

Nenhum relatório nem saída bruta foi editado: `docs/AUDITORIA-2026-09-30.md` e `docs/auditoria-v2/raw/teste-shared.txt` estão intactos (só deixaram de ser varridos).

## Casos negativos (repositório sintético, cada arquivo com um travessão)

Reprovam (11): `docs/nota-nova.md`, `docs/evidencias-v2/G00/V2-F00-E99/RESUMO.md`, `.../INDEX.md`, `docs/auditoria-v2/raw/nota-escrita-a-mao.md`, `docs/auditoria-v2/relatorio-fora-do-raw.txt`, `docs/evidencias-v2-copia/saida.txt` (armadilha de prefixo), `docs/AUDITORIA-2026-10-01.md` e `docs/sub/AUDITORIA-2026-09-30.md` (armadilhas de nome), `dc360/apps/api/src/produto-novo.ts`, `dc360/apps/web/src/Tela.tsx`, `mockup/app/tela.js`.

Passam (4): `docs/evidencias-v2/G00/V2-F00-E99/saida-do-teste.txt`, `.../resultado.json`, `docs/auditoria-v2/raw/teste-novo.txt`, `docs/AUDITORIA-2026-09-30.md`.

## Sondas (o teste reprova quando o recorte está errado)

- `sonda-isencao-larga.txt`: isenção por prefixo solto, incluindo `.md`, e arquivo por nome em qualquer pasta. 2 falhas: a âncora real (o `RESUMO.md` das evidências sumiu da varredura) e o caso sintético de reprovar.
- `sonda-sem-isencao.txt`: só as isenções antigas. 4 falhas: o portão volta a reprovar as 4 linhas da auditoria e da saída bruta, a âncora real e os dois casos sintéticos.
- Depois de cada sonda o arquivo foi restaurado e o SHA-256 conferido igual (`e750803b...41db90`); as rodadas finais usam esse mesmo arquivo.

## Resultados medidos

- `npx vitest run packages/shared/test/regras-de-conteudo.test.ts`: 8 de 8, nenhuma linha de travessão.
- `npm test` (regressão da etapa, `npm-test-regressao.txt`): campo 187 sem falha; shared 168 sem falha (era 165 com 1); API 1245, 1232 passam e 13 pulados, o arquivo `banco-tls.test.ts` falha na coleta por falta de `openssl` (E21, pré-existente); console 259; painel 636 com 1 falha (`ocorrencia-encerramento.test.ts`, CRLF, E21, pré-existente); banco 330, 327 passam e 3 pulados. O `npm test` sai com código 1 por esses dois vermelhos da E21.
- `baseline.mjs --so=teste-shared,teste-web,test-scripts,conferir-numeros` (pasta `baseline/`): 4 de 4 conferem. `test:scripts` 199, 0 falhas, 4 pulados; `conferir:numeros` 22 afirmações, 0 divergências.

## Limitações e o que falta

- Prova de uso real: durante a escrita deste RESUMO o editor gravou o caractere no lugar do escape da linha 7, e a varredura reprovou `docs/evidencias-v2/G00/V2-F00-E20/RESUMO.md:7` (o mesmo aconteceu com duas linhas do STATUS). Corrigido; é o comportamento que a etapa quer: texto escrito à mão em evidência continua reprovando.
- Validação humana: Rafael aprova a lista de isenções (a etapa pede).
- O item "portão de conteúdo" do G00 não foi marcado aqui: item de gate se marca no próprio gate.
- Mesmo isenta, a saída bruta arquivada aqui passou por `redigir` (o travessão do diff aparece como `[travessao]`); o diff original está no `git diff` da árvore.
- As isenções também valem para a regra de norma (o mesmo `CAMINHOS_IGNORADOS`); a sonda sem isenção mostrou que nenhum desses arquivos cita norma fora da lista hoje.
