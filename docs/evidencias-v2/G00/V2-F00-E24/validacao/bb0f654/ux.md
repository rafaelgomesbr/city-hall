---
validador: ux (general-purpose com o papel da dimensão)
modelo: claude-opus-5-5
etapa: V2-F00-E24
sha_validado: bb0f654
ci_run: ausente (39143791434 citado pelo implementador, não lido)
rodada: 4
herdado_de:
tags: []
nivel_de_prova_exigido: [E2, E3a]
nivel_de_prova_obtido: [E2, E3a]
veredito: FAIL
confianca: media
humano_necessario: sim
escalar: conflito entre o objetivo da etapa e o "não implementar" (texto do painel); critério E4 explícito (Rafael e Alyson leem a apresentação)
---

Pasta das saídas e capturas deste validador (scratchpad, fora do repositório):
`/private/tmp/claude-501/-Users-rafaelgomes-Documents-city-hall/ded47d25-806d-4495-ac61-f9e84518cc35/scratchpad/validadores/ux-E11-E13-E24/`
(abaixo, `SP/` abrevia esse caminho; `SP/capturas/` tem os PNG citados).

## Critérios verificados

O "produto visual" desta etapa são os documentos e as apresentações. Abri renderizados no Chromium os dois HTML tocados (`dc360/docs/apresentacao/2026-09-15-para-o-alyson.html` e `docs/apresentacao-produto-alyson.html`), em 1280, 390 e 320 px, claro e escuro (`prefers-color-scheme`), e li pelo texto os Markdown (`SEGURANCA-DO-AGENTE.md`, `CARTAO-DO-AGENTE.md`, `GUIA-DO-COORDENADOR.md` seção 9, `LEIA-ME.md`, `README.md` "O agente que sobe o morro sozinho", `PAPEIS_E_RESPONSABILIDADES.md`, `PRIVACIDADE.md`). Conferi a coerência com a D-25 (premissa: implementar no aplicativo, com ressalva imediata) e com o app de hoje.

| Item | Resultado | Prova |
| --- | --- | --- |
| Objetivo: nada que se mostre a município afirma que o agente declara a saída no aplicativo | **FALHA** fora dos documentos: a tela "Quem está em campo" do painel, que é mostrada em demonstração, diz no estado vazio "Declarar a saída é um passo do aplicativo do agente, feito na base e com sinal." (`dc360/apps/web/src/paginas/QuemEstaEmCampo.tsx:192`). O aplicativo não tem esse passo (única menção a `/saida-a-campo` em `apps/campo/src` é o comentário de `src/dados/api.ts:518`). Nenhum documento, pendência ou ressalva registra essa frase | `SP/capturas/e24-painel-quem-esta-em-campo-1280-claro.png`, `SP/saidas` (saída do `quem.mjs` transcrita em Tentativas) |
| Documentos com ressalva explícita | OK: `SEGURANCA-DO-AGENTE.md` abre com o quadro "Estado atual: recurso em construção" que cobre o documento inteiro; cartão manda avisar a coordenação pelo meio combinado e diz que o aplicativo não registra saída nem retorno; guia seção 9 com "a tela existe, mas fica vazia"; README com "Estado em 07/10/2026: pela metade"; PAPEIS e PRIVACIDADE com "em construção" | Grep em Tentativas, item 1 |
| Selo da apresentação de 15/09 | OK: "Segurança do agente sozinho" com selo Parcial e a ressalva inteira, legível nos dois temas | `e24-15-09-1-1280-claro.png`, `e24-15-09-1-390-escuro.png` |
| Apresentação do Alyson (cartão do Operador, matriz, nota) | OK: "(em construção)" nos três pontos, sem corte em 1280, 390 e 320 | `e24-alyson-1-1280-claro.png`, `e24-alyson-1-320-escuro.png`, `e24-alyson-2-390-escuro.png` |
| Alinhamento e nada fora do lugar | OK no que a etapa mudou; sem rolagem horizontal da página em 12 renderizações. Anotado: no cartão "Coordenador" a linha divisória do rodapé fica 14 px acima das dos outros três cartões (rodapé de quatro linhas contra três), igual na captura `antes-` da correção 2 | `e24-alyson-1-1280-claro.png`, `docs/evidencias-v2/G00/V2-F00-E24/correcao-2/capturas/antes-alyson-cards-e-matriz-1280-claro.png` |
| Texto bem escrito | OK: português correto, sem travessão; nenhuma data prometida ("planejada, sem data") | leitura |
| Coerência com o app de hoje | OK nos documentos. O quadro "SEM SINAL" do cartão (mudado depois da rodada 3, na correção da E22) bate com os títulos reais da faixa em `apps/campo/src/ui/FaixaDeSincronizacao.tsx` ("Sem sinal", "Com sinal", "Enviando", "Precisa de correção", "Coleta de outro agente no aparelho", "Tudo sincronizado") | Grep em Tentativas, item 4 |
| Rafael e Alyson leem a apresentação | PENDENTE (E4 explícito da etapa) | |

## Evidência

- `SP/apresentacao.mjs` (Chromium, `file://`): código 0, `SP/saidas/apresentacao.txt`; zero erro de console; sem rolagem horizontal da página nas 12 combinações; as linhas de 15/09 ficam dentro do contêiner `.rolavel` (rolagem lateral da tabela, anterior à etapa).
- Capturas: `SP/capturas/e24-15-09-{1..4}-{1280,390,320}-{claro,escuro}.png` (Segurança do agente sozinho, Perfil com foto e números, Sino do painel, Operador / plantonista), `SP/capturas/e24-alyson-{1..3}-{1280,390,320}-{claro,escuro}.png` (cartão do Operador, linha da matriz, nota), `SP/capturas/e24-painel-quem-esta-em-campo-1280-claro.png`.
- Olhadas: `e24-15-09-1-1280-claro`, `e24-15-09-1-390-escuro`, `e24-alyson-1-1280-claro`, `e24-alyson-1-320-escuro`, `e24-alyson-2-390-escuro`, `e24-painel-quem-esta-em-campo-1280-claro`.
- A tela do painel foi aberta como a coordenadora da semente, com o painel de `bb0f654` ligado à API real (mesma montagem do relatório ux da E11), por `SP/quem.mjs`.

## Cenários positivos

- O selo "Pronto" sumiu da linha de segurança do agente; a linha diz "Corrigido em 07/10/2026: a versão anterior desta tabela dizia Pronto".
- O cartão de bolso não manda declarar nem confirmar no aplicativo em passo nenhum.

## Cenários negativos

- Grep de "declara a saída", "declare a saída", "confirme o retorno", "prorrogue", "saída declarada" em `dc360/docs`, `dc360/README.md`, `docs/*.html`, `docs/*.md`, raiz e apresentação: toda ocorrência está sob ressalva ("ainda não declara", quadro de estado atual, ou futuro).
- O painel, porém, afirma o passo no aplicativo (ver Achados 1).

## Tentativas de reprovar

1. Grep acima, fora de `docs/roadmap-v2`, evidência e auditorias: 10 ocorrências, todas ressalvadas; `SEGURANCA-DO-AGENTE.md:122` e `:173` falam de "saída declarada" no presente, mas sob o quadro do topo que diz que o documento descreve o desenho e não o que existe.
2. Procurei a promessa fora dos documentos, em superfície que se mostra a município: abri "Quem está em campo" no painel. Texto lido da tela: "Ninguém declarou saída a campo. Declarar a saída é um passo do aplicativo do agente, feito na base e com sinal. Lista vazia significa que ninguém declarou, e não que ninguém está na rua." A primeira frase do corpo afirma um passo que o aplicativo não tem. A segunda mitiga o risco físico, mas não desfaz a afirmação.
3. Renderizei as apresentações em 320 px e no tema escuro (a etapa não pede): sem corte nem rolagem da página.
4. Conferi se o cartão de bolso (mudado depois da rodada 3) descreve faixas que o aplicativo tem: os seis títulos batem com `FaixaDeSincronizacao.tsx`.
5. Conferi o link novo de `LEIA-ME.md` para `apresentacao/README.md`: o arquivo existe.
6. Procurei travessão nos HTML tocados: nenhum; na matriz do Alyson as células "não" usam o traço curto (U+2013), que não é travessão.

## Achados

1. **FAIL contra o objetivo da etapa:** a tela "Quem está em campo" do painel afirma, no estado vazio, que "Declarar a saída é um passo do aplicativo do agente" (`apps/web/src/paginas/QuemEstaEmCampo.tsx:192`, de `bcb02c0`, anterior à etapa). É exatamente a promessa que o objetivo manda tirar de "nada que se mostre ou entregue a município", e a tela é mostrada em demonstração. A etapa proíbe mudar o painel, e nenhum documento, pendência (`apps/web/PENDENCIAS.md`), registro do CP-02 (`docs/evidencias-v2/CP-02/decisao.md`) ou ressalva no guia menciona esta frase. Correção possível sem violar o escopo: registrar a frase como pendência com dono (V2-F14-E01) e acrescentar no guia seção 9 e na apresentação que o texto da tela descreve o fluxo planejado; ou Rafael emenda a etapa para trocar uma frase do painel. A decisão é de Rafael.
2. **Anotado (anterior à etapa):** na apresentação do Alyson a 1280, a linha divisória do rodapé do cartão "Coordenador" fica 14 px acima das dos outros três cartões, mesmo antes da correção 2.

## Não verificado

- O PDF regenerado (`2026-09-15-para-o-alyson.pdf`) não foi aberto por mim: sem `pdftotext` nesta máquina; o texto do PDF é da dimensão QA.
- `relatorio-apresentacao-alyson.html` não foi renderizado (o grep não acha menção ao recurso).
- O aplicativo de campo não foi aberto (não renderiza aqui); a ausência da declaração foi conferida só no código.
- A confirmação da D-25 por Rafael e Alyson.

## Risco residual

Médio: numa demonstração, a tela do painel diz que o agente declara a saída no aplicativo, quando o aplicativo não faz isso. O risco físico é mitigado pela frase seguinte da própria tela ("Lista vazia significa que ninguém declarou, e não que ninguém está na rua") e pelos documentos, mas a promessa falsa de funcionalidade continua visível.

## Motivo do humano

Critério E4 explícito da etapa: Rafael e Alyson decidem o CP-02 (D-25 é premissa) e leem a apresentação ajustada antes de qualquer demonstração. Decisão de produto pedida a Rafael: como tratar a frase do painel (achado 1), já que a etapa proíbe mudar o painel. Capturas que ele precisa olhar, em `SP/capturas/`: `e24-painel-quem-esta-em-campo-1280-claro.png`, `e24-15-09-1-1280-claro.png`, `e24-15-09-1-390-escuro.png`, `e24-alyson-1-1280-claro.png`, `e24-alyson-2-390-escuro.png`.
