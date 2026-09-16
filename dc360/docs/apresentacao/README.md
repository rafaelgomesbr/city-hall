# Apresentações para o Alyson

Cada apresentação é um HTML autocontido (CSS embutido, só as fontes vêm do
Google Fonts, com pilha de reserva) e o PDF gerado a partir dele. O HTML é a
fonte; o PDF é derivado e se regenera.

| Data | Arquivo | O que é |
| --- | --- | --- |
| 15/09/2026 | `2026-09-15-para-o-alyson.html` e `.pdf` | O que está feito, o que funciona, o que falta, custos de hoje e estimados, prazo, e a comparação requisito a requisito com a especificação de 18/08/2026. Substitui a de 09/09/2026, que existia só como artefato publicado |

## Regenerar o PDF

O gerador usa o Chromium do Playwright, que já é dependência de `apps/web`.
Rode de dentro de `apps/web`, porque é lá que o `playwright` está instalado:

```bash
cd dc360/apps/web
node ../../docs/apresentacao/gerar-pdf.mjs 2026-09-15-para-o-alyson
```

Se o navegador não estiver instalado na máquina:

```bash
cd dc360/apps/web && npx playwright install chromium
```

O script espera as fontes do Google carregarem antes de imprimir (sem isso a
paginação muda de uma execução para outra), imprime em A4 com as margens do
`@page` do próprio HTML, e recusa um PDF vazio. A saída diz o tamanho em bytes,
a contagem de páginas e se houve erro de console.

## Regras que valem aqui

As mesmas do produto: português do Brasil, nenhum travessão, nenhuma norma fora
da lista de `docs/CONTEXTO.md`. A varredura de conteúdo alcança os `.html` e os
`.md` desta pasta. Números de teste citados no HTML precisam ser os do portão
`npm run conferir:numeros` no dia da apresentação.
