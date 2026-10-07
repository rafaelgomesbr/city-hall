# V2-F00-E24: saída a campo na documentação e na apresentação (K14)

Executada em 2026-10-07, no Windows 11 (Git Bash, Node 22.17.0). Sem commit.
Só documentação e apresentação. Nenhuma linha de API, painel ou aplicativo
mudou; a funcionalidade no aplicativo é da V2-F14-E01.

## Decisão aplicada

CP-02 está DECIDIDO como premissa (D-25, alternativa A: implementar no
aplicativo), com a recomendação "A com B imediato". Por isso cada documento
passa a dizer o estado real (servidor e tela da coordenação prontos, aplicativo
do agente ainda não declara) e deixa de instruir o agente a declarar no
aplicativo. Como a D-25 não foi confirmada por escrito, nenhum texto promete
data: "planejado, sem data marcada". Registro em `docs/evidencias-v2/CP-02/decisao.md`.

## Prova do estado real (conferida hoje no código)

- API: `dc360/apps/api/src/rotas/saida-a-campo.ts` registra `POST /`,
  `POST /prorrogar`, `POST /retorno`, `GET /`, `POST /encerrar`, `GET /minha`.
- Painel: `dc360/apps/web/src/paginas/QuemEstaEmCampo.tsx`.
- Aplicativo: a única menção a `/saida-a-campo` em `dc360/apps/campo/src` é o
  comentário de `src/dados/api.ts:518` (o campo `emCampo` dos colegas). Nenhuma
  chamada de declarar, prorrogar, retorno ou `/minha`.

## Tabela antes e depois

| # | Arquivo | Antes | Depois |
| --- | --- | --- | --- |
| 1 | `dc360/docs/SEGURANCA-DO-AGENTE.md`, cabeçalho | "Versão 1, de 14/09/2026", sem aviso de estado | Versão 2, de 07/10/2026, e quadro "Estado atual: recurso em construção, ainda não disponível para o agente": tela vazia, nenhum prazo estourado aparece, "Não conte com este recurso", planejado na V2-F14-E01 sem data |
| 2 | `SEGURANCA-DO-AGENTE.md`, seção 1 | "O agente, ainda na base e com sinal, declara no aplicativo" | "Quando a parte do aplicativo existir, o agente ... vai declarar"; "Hoje o servidor já sabe fazer as três coisas; quem ainda não sabe pedir é o aplicativo" |
| 3 | `SEGURANCA-DO-AGENTE.md`, seção 5 | "No aplicativo do agente: Antes de subir, um passo a mais" (presente) | "No aplicativo do agente (planejado, ainda não existe)": "O aplicativo de hoje não tem esta tela. O desenho planejado é..." |
| 4 | `dc360/docs/CARTAO-DO-AGENTE.md`, passo 2 | "declare a saída" no aplicativo; "Prorrogue. É um toque" | "AVISE A COORDENAÇÃO PARA ONDE VOCÊ VAI" pelo meio combinado (rádio, telefone); quadro "O aplicativo ainda não registra a sua saída ... não avisa ninguém se você não voltar no prazo"; prorrogar vira avisar de novo |
| 5 | `CARTAO-DO-AGENTE.md`, "Ao voltar" | "CONFIRME O RETORNO ... continua marcado como em campo" | "AVISE A COORDENAÇÃO QUE VOLTOU, pelo mesmo meio. O aplicativo ainda não registra o retorno" |
| 6 | `dc360/docs/GUIA-DO-COORDENADOR.md`, seção 9 | "O agente declara, antes de subir e com sinal..." (presente) | quadro "Estado atual: a tela existe, mas fica vazia": o sino não avisa prazo estourado, "Tela vazia, hoje, não quer dizer que ninguém está no morro", acompanhar pelo procedimento do município; o desenho passa ao futuro |
| 7 | `dc360/docs/LEIA-ME.md`, linha do `SEGURANCA-DO-AGENTE.md` | só o que a declaração faz e não faz | acrescenta "Em construção: o servidor e a tela da coordenação estão prontos, o aplicativo do agente ainda não declara a saída" |
| 8 | `dc360/README.md`, "O agente que sobe o morro sozinho" | "O agente declara, antes de subir e com sinal" (presente, sem ressalva) | quadro "Estado em 07/10/2026: pela metade" com os arquivos da API e do painel, o que o aplicativo não chama e "planejada na V2-F14-E01, sem data"; a frase do desenho ganha "(o servidor já cumpre a sua parte, o aplicativo ainda não)" |
| 9 | `dc360/docs/apresentacao/2026-09-15-para-o-alyson.html`, "Segurança do agente sozinho" | selo **Pronto**, "Saída a campo declarada antes de subir, com sinal" | selo **Parcial**: pronto no servidor e na tela da coordenação; o aplicativo ainda não declara, não prorroga e não confirma; a tela fica vazia; planejada, sem data; "Corrigido em 07/10/2026: a versão anterior desta tabela dizia Pronto" |
| 10 | mesma apresentação, "Perfil com foto e números" | "equipe com quem está em campo agora" | acrescenta "(o indicador depende da saída a campo declarada, que o aplicativo ainda não faz, e por isso hoje não acende)" |
| 11 | `dc360/docs/apresentacao/2026-09-15-para-o-alyson.pdf` | 890477 bytes, 24 páginas, selo "Pronto" | regenerado por `gerar-pdf.mjs`: 837204 bytes, 24 páginas, 0 erro de console, fontes carregadas (sem aviso); texto extraído com `pdftotext` mostra "Parcial" e a ressalva |

O diff completo dos textos está em `diff-dos-documentos.txt`.

## Conferido por Grep e não alterado

- `relatorio-apresentacao-alyson.html` e `.pdf` (raiz): nenhuma menção a saída
  a campo, segurança do agente, prazo estourado ou "sozinho" (o PDF lido com
  `pdftotext`). Nada a mudar.
- `dc360/docs/PRIVACIDADE.md`: descreve o dado que a API guarda; segue
  verdadeiro (a etapa diz o mesmo).
- `dc360/docs/PAPEIS_E_RESPONSABILIDADES.md:40` e a tabela de permissões do
  README: falam da permissão de acompanhar, que existe no painel.
- `docs/AUDITORIA-2026-09-30.md` e `docs/AUDITORIA-V2-BASELINE-ZERO.md`: são as
  auditorias que acharam o problema; registro histórico, não promessa.
- `mockup/` e `docs/` fora do dc360: nenhuma frase sobre declarar a saída.

## Capturas do portão visual

`capturas/seguranca-{1280,390}-{claro,escuro}.png`: a tabela "O aplicativo do
agente de campo" da apresentação com a linha nova (selo Parcial) e a do Perfil.
Playwright, 4 combinações, 0 erro de console, sem rolagem horizontal da página.
Conferidas a olho a de 1280 claro (selo legível, texto inteiro, nada grudado)
e a de 390 escuro: ali a tabela fica dentro do contêiner `.rolavel`, que já
rolava de lado antes desta etapa, e a captura mostra só a parte visível da
coluna "Observação". O corte é a rolagem do contêiner, não texto quebrado; o
layout da apresentação não foi mexido (tema sério e neutro do commit e82719e).

## Testes

| Comando | Antes (`antes/`) | Depois (`depois/`) |
| --- | --- | --- |
| `npm test` (raiz do dc360) | código 0: pacote campo 187, shared 168, API 1267, console 259, painel 643, isolamento 327 (+3 pulados por ambiente) | código 0, os mesmos números |
| `apps/api`: `saida-a-campo.test.ts` e `saida-nao-declara-inexistente.test.ts` | (dentro dos 1267) | 2 arquivos, 38 casos verdes |
| `apps/web`: `quem-esta-em-campo.test.ts` | (dentro dos 643) | 4 casos verdes |
| `npx vitest run packages/shared/test/regras-de-conteudo.test.ts` | (dentro dos 168) | 8 de 8, código 0 |
| `npm run conferir:numeros` | 24 afirmações, 0 divergência (STATUS da E23) | 24 afirmações, "Todos os números da documentação batem", código 0 |
| `gerar-pdf.mjs` | n/a | 837204 bytes, 24 páginas, 0 erro de console (`gerar-pdf.txt`) |

Teste negativo da etapa: nenhum arquivo de teste foi tocado e nenhum caso
sumiu (as contagens são iguais antes e depois). Grep final:
"Segurança do agente sozinho" está com `p-parcial`; nenhum passo do cartão
manda declarar a saída ou confirmar o retorno no aplicativo; as frases no
presente sobre o agente declarar ficaram só sob quadro de "Estado atual" ou
reescritas no futuro.

Nada ficou vermelho.

## Limitações e pendências humanas

- A D-25 segue PREMISSA: Rafael e Alyson confirmam ou revertem (ver
  `docs/evidencias-v2/CP-02/decisao.md`). Revertida, os mesmos arquivos passam de
  ressalva a retirada.
- Rafael e Alyson leem a apresentação ajustada antes de qualquer demonstração a
  município. Até a V2-F14-E01, demonstração não mostra a saída a campo como
  pronta.
- O cartão de bolso agora manda avisar a coordenação "pelo meio que o seu
  município combinou (rádio, telefone)": é instrução genérica e conservadora
  (PREMISSA no STATUS seção 9), o procedimento real é do município.
- O item "K14" do G00 não foi marcado: item de gate só se marca no próprio gate.
- A rodada "antes" do `npm test` foi lançada antes da primeira edição e correu
  em paralelo com as edições de documentação; as suítes de código não leem
  esses arquivos, e o portão de conteúdo foi rodado de novo depois.
