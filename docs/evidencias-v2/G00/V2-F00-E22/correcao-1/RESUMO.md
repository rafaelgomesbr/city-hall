# V2-F00-E22, correção 1: o texto sobre a vigência

A parte da reprovação da E22 que cabe nesta correção (VEREDITO.md e `validacao/7005a60/qa.md`) é só a documentação da vigência: `apps/api/src/auth/vigencia.ts`, `apps/api/PENDENCIAS.md` e `dc360/README.md` diziam que só `GET /avisos` escapava da vigência, quando na verdade também escapavam o termo de interdição, o laudo, o termo de desinterdição, os PDFs e o CSV. O código, o conserto e as saídas estão na evidência da E04, em `../../V2-F00-E04/correcao-1/`.

## Fatos

- `dc360/apps/api/src/auth/vigencia.ts`: o parágrafo "LEITURA NÃO PASSA POR AQUI" passou a "LEITURA PURA", e um parágrafo novo lista as rotas GET marcadas com `ROTA_GET_COM_EFEITO` (laudo, termo de interdição, termo de desinterdição e PDFs, CSV de ocorrências e `GET /avisos`), com a regra do que fica de fora (dossiê e busca, que só gravam o registro da própria leitura).
- `dc360/apps/api/PENDENCIAS.md`: a seção da vigência e a do `GET /avisos` foram reescritas para o que o código faz agora; a tabela do início e o item 2 de "Sessões no painel" acompanham (a preservação da família em `/auth/encerrar-sessoes` deixou de ser pendência).
- `dc360/README.md` (linha do token de acesso): descreve leitura pura, escrita por método e as rotas GET marcadas, e aponta o teste que fixa a lista.
- A lista que o texto afirma é a mesma que `dc360/apps/api/test/get-com-efeito.test.ts` confere pelo comportamento, então documento e código não divergem sem um teste vermelho.
- `npm run conferir:numeros` (24 afirmações) e o portão de conteúdo (`regras-de-conteudo.test.ts`, 8 casos) passam: saídas `09` e `10` da E04.
- Fora desta correção: o restante da reprovação da E22 que não é de vigência não foi tocado.
- Limitação: `docs/roadmap-v2/03-fase-00-estabilizacao.md` ainda repete o texto antigo sobre `GET /avisos` na descrição da E04; é o plano, e não foi alterado.

## Justificativa

A documentação do produto não pode afirmar que só uma rota escapa da vigência quando o teste provou que várias escapavam. Corrigir o texto junto do código, e prender a lista do texto a um teste, é o que impede a documentação de voltar a envelhecer sozinha.
