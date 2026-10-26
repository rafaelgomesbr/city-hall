---
validador: qa (agente general-purpose com o papel da dimensão)
modelo: claude-opus-5-5
etapa: V2-F00-E24
sha_validado: 52952a1
ci_run: 38618369218
rodada: 3
herdado_de:
tags: []
nivel_de_prova_exigido: [E1, E2]
nivel_de_prova_obtido: [E1, E2]
veredito: PASS
confianca: media
humano_necessario: sim
escalar: nenhum
---
## Critérios verificados

| Critério (DoD e cinco campos) | Prova | Resultado |
| --- | --- | --- |
| Nenhum documento promete a declaração no aplicativo sem ressalva | varredura própria em 80 arquivos `.md` e `.html` rastreados (raiz, `docs/`, `dc360/`, `mockup/`, `relatorio/`, fora evidência, roteiro e auditorias), padrões "quem está em campo", "saída a campo", "saída declarada", "declara a saída", "retorno não confirmado", "prazo estourado", "sem retorno", "agente sozinho": 49 linhas (`E24-01-grep.txt`), lidas uma a uma | PASS |
| Nenhum documento diz que o operador acompanha quem está em campo como coisa pronta (defeito da rodada 2) | `docs/apresentacao-produto-alyson.html:333` ("quando a saída a campo estiver no aplicativo (em construção), acompanha"), `:381` ("Acompanhar quem está em campo (em construção)"), `:387` (nota); `dc360/docs/apresentacao/2026-09-15-para-o-alyson.html:498` (Operador, selo "Parcial", "em construção ... V2-F14-E01"); `dc360/docs/PAPEIS_E_RESPONSABILIDADES.md:40` e `:47-57`; `dc360/README.md:1011-1019`; `dc360/docs/PRIVACIDADE.md:97-102` ("Recurso em construção") | PASS |
| Nenhum "Pronto" na linha de segurança do agente, e PDF coerente | HTML `:394` selo `p-parcial` "Parcial"; PDF extraído com o PDFKit do macOS (24 páginas, `E24-02-pdf-texto.txt`): "Segurança do agente sozinho ... Parcial", "Operador / plantonista Parcial ... (em construção ...)", "O aviso de retorno não confirmado depende da saída a campo, que está em construção". O "Pronto" que a extração mostra logo depois de "Parcial" é o selo da linha seguinte ("Foto perdida não destrói a vistoria"), lido fora de ordem na quebra de página (conferido no HTML, `:395`) | PASS |
| Nenhum passo do cartão manda declarar a saída no aplicativo | `dc360/docs/CARTAO-DO-AGENTE.md:17-26`: passo 2 manda avisar a coordenação por rádio ou telefone e diz "O aplicativo ainda não registra a sua saída ... não avisa ninguém se você não voltar no prazo" | PASS |
| O guia diz que a tela "Quem está em campo" fica vazia até a F14-E01 | `GUIA-DO-COORDENADOR.md:213-221` ("Tela vazia, hoje, não quer dizer que ninguém está no morro"); `SEGURANCA-DO-AGENTE.md:10-14` | PASS |
| Afirmação técnica do quadro de estado confere com o código | `apps/campo/src` só cita `/saida-a-campo` num comentário de `dados/api.ts:518` (lê se o colega tem saída aberta); o painel só lista e encerra (`apps/web/src/dados/http.ts:1335`, `:1347`) | PASS |
| As 27 provas da API seguem verdes, nada removido | `test/saida-a-campo.test.ts (27 tests)` verde dentro de `R-01-npm-test.txt` | PASS |
| `npm test` com `regras-de-conteudo` verde | `test/regras-de-conteudo.test.ts (8 tests)` verde em `R-01` | PASS |
| CP-02 registrado | `docs/evidencias-v2/CP-02/decisao.md` existe; a decisão é premissa D-25, com a confirmação pendente (H01) | PASS como premissa |

Defeito da rodada 2, reexecutado: "o operador acompanha quem está em campo" sem ressalva em `apresentacao-produto-alyson.html` (333, 381), na tabela de 15/09 (perfil Operador) e `PRIVACIDADE.md:95-99`. NÃO MORDE MAIS: os quatro pontos têm a ressalva "em construção", no HTML e no PDF regenerado.

## Evidência

Saídas em `$SP/val/qa/lote4/`:

- `E24-arquivos.txt` (os 80 arquivos varridos) e `E24-01-grep.txt` (as 49 linhas).
- `E24-02-pdf-texto.txt`: texto do PDF de 15/09 extraído por `osascript -l JavaScript` com `PDFKit` (o `pdftotext` e o `pypdf` não existem aqui).
- `R-01-npm-test.txt`.

## Cenários positivos

- Todas as superfícies que se mostram a município (as duas apresentações, o PDF, o cartão, o guia, o documento de segurança, papéis, privacidade e README) dizem o estado real: servidor e tela da coordenação prontos, aplicativo ainda não declara.

## Cenários negativos

- Nenhum selo "Pronto" na linha de segurança do agente; nenhum passo do cartão manda declarar no aplicativo; a funcionalidade da API e do painel não foi removida (27 testes verdes).

## Tentativas de reprovar

- Varri também `relatorio/`, `relatorio-apresentacao-alyson.html`, `mockup/`, `docs/APRESENTACAO.md` e `docs/ROTEIRO_VIDEO.md`: nenhuma frase sobre acompanhar saída (os dois acertos de `relatorio/` são "sem retorno" num texto sobre cor, fora do assunto).
- Procurei a frase de capacidade sem ressalva em tabela: `README.md:974` ("Operador de plantão ... acompanhar quem está em campo agora") é a tabela de permissões gerada de `packages/shared/src/permissoes.ts`; descreve a permissão, que existe, e o parágrafo que a explica (`:1011-1019`) traz a ressalva. Não conto como promessa.
- Conferi a linha "Perfil com foto e números" (selo "Pronto") da apresentação de 15/09: o texto diz que o indicador de quem está em campo "depende da saída a campo declarada, que o aplicativo ainda não faz, e por isso hoje não acende".
- Conferi se o PDF foi mesmo regenerado: o texto extraído traz as frases novas da correção 2.

## Achados

- Nenhum que bloqueie.
- anotado: `README.md:932`, na mesma seção "O agente que sobe o morro sozinho", justifica "O sino, e não push" com "o orçamento está em quinze de quinze e o portão CA-06 reprova a décima sexta", o que o código desmente (teto 27). Não é promessa de segurança física, é justificativa técnica falsa; registrado como bloqueante no relatório da E22, que é a etapa da documentação desatualizada.

## Não verificado

- A leitura da apresentação pelo Rafael e pelo Alyson antes de qualquer demonstração (critério humano da etapa).
- O visual das páginas ajustadas (capturas da correção 2 existem; a dimensão UX desta rodada cobre o portão visual).

## Risco residual

Baixo para a promessa de segurança. Quando a V2-F14-E01 entrar, as ressalvas têm de sair de todos os pontos listados no `correcao-2/` desta etapa.

## Motivo do humano

A premissa D-25 (implementar a saída a campo no aplicativo) ainda não foi confirmada pelo Rafael e pelo Alyson (CP-02, H01), e a etapa exige que eles leiam a apresentação ajustada antes de qualquer demonstração a município. É decisão de produto e de domínio.
