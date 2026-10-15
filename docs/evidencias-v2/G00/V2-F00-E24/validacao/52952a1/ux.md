---
validador: ux (agente general-purpose com o papel da dimensão)
modelo: claude-opus-5-5
etapa: V2-F00-E24
sha_validado: 52952a1
ci_run: 38618369218
rodada: 3
herdado_de:
tags: []
nivel_de_prova_exigido: [E3a]
nivel_de_prova_obtido: [E2, E3a]
veredito: PASS
confianca: alta
humano_necessario: sim
escalar: nenhum
---
A etapa é só documentação e apresentação (sem tag de interface; UX entra a pedido do gatekeeper, como na rodada 2). Abri os dois HTML no Chromium por `file://`, em 1280 e 390 px, claro e escuro (os dois arquivos têm tema escuro próprio), e recortei os blocos alterados pela correção 2 (`git diff 4b96ea7..52952a1 -- docs/apresentacao-produto-alyson.html dc360/docs/apresentacao/2026-09-15-para-o-alyson.html`, lido). Capturas em `docs/evidencias-v2/G00/validacao/52952a1/navegador/capturas/` (abaixo, `C/`); olhei as que cito.

## Critérios verificados

1. FAIL da rodada 2 (QA: o operador "acompanha quem está em campo" sem ressalva), do ponto de vista do texto mostrado: NÃO morde nos dois HTML.
   - `docs/apresentacao-produto-alyson.html`, cartão do Operador: "Registra o chamado, responde providência quando outra secretaria retorna e, quando a saída a campo estiver no aplicativo (em construção), acompanha quem está em campo, inclusive de madrugada." `C/E24-apresentacao-produto-alyson-papeis-{1280,390}-{claro,escuro}.png`.
   - Mesma página, matriz: linha "Acompanhar quem está em campo (em construção)" e a nota abaixo: "Acompanhar quem está em campo está em construção: a tela da coordenação já existe, mas o aplicativo do agente ainda não declara a saída, e por isso a tela fica vazia até lá." `C/E24-apresentacao-produto-alyson-matriz-{1280,390}-*.png`.
   - `dc360/docs/apresentacao/2026-09-15-para-o-alyson.html`, linha "Operador / plantonista" (selo "Parcial") com "(em construção: a tela da coordenação existe, mas o aplicativo do agente ainda não declara a saída, V2-F14-E01)"; linha "Sino do painel" com "O aviso de retorno não confirmado depende da saída a campo, que está em construção no aplicativo do agente (V2-F14-E01)"; linha "Segurança do agente sozinho" com selo "Parcial" e "O aplicativo do agente ainda não declara a saída ... hoje a tela 'Quem está em campo' fica vazia e ninguém é avisado de nada." `C/E24-apresentacao-15-09-tabela-{operador,sino,seguranca}-{1280,390}-*.png`, `C/E24-apresentacao-15-09-linha-operador-inteira-390-*.png`.
2. Não promete o que o código não faz: as frases novas dizem que a tela da coordenação existe (existe: `QuemEstaEmCampo.tsx`, rota `/quem-esta-em-campo`, que vi no menu da coordenadora em `C/E13-destino-helena-painel-1280-escuro.png`) e que o aplicativo ainda não declara a saída (o que o bloco da etapa e o VEREDITO da rodada 2 registram). Varri os dois HTML por "em campo", "saída a campo", "sozinho", "retorno" e "declara": a única frase restante sobre campo sem ressalva é "funcionando mesmo sem sinal de internet em campo" (vistoria offline, outra funcionalidade, existente).
3. Alinhamento e texto (portão visual aplicado à apresentação):
   - Os quatro cartões de papel a 1280 seguem na mesma linha com a mesma altura (medido: topo 138 e altura 334 nos quatro); a 390 empilham em coluna, sem corte.
   - A linha longa da matriz cabe em 1280; a 390 quebra em duas linhas dentro da célula.
   - Sem rolagem horizontal da página nas 8 aberturas; 0 erro de console.
   - Português correto, sem travessão (o "–" das células vazias da matriz é o traço curto U+2013, não o proibido U+2014), sem erro de digitação nas frases novas.
4. Defeito de UX da rodada 2 (tabela a 390 rola na lateral sem dica, e a ressalva só aparece depois de rolar): AINDA MORDE nas duas páginas (15/09: contêiner `.rolavel` com 560 de conteúdo em 350 de largura; apresentação do Alyson: matriz 560 em 356), sem nenhuma indicação de que continua. Anterior, anotado.

## Evidência

- `node $SP/val/ux/e24.mjs` (código 0), saída `$SP/val/ux/e24.log`; medições em `$SP/val/ux/resultados.json` (8 verificações de rolagem, 0 falha).
- Capturas lidas: `E24-apresentacao-produto-alyson-papeis-1280-claro.png`, `E24-apresentacao-produto-alyson-matriz-390-escuro.png`, `E24-apresentacao-15-09-tabela-operador-1280-escuro.png`, `E24-apresentacao-15-09-tabela-sino-390-claro.png`.

## Cenários positivos

- A ressalva "em construção" aparece nos três pontos do VEREDITO, legível nos dois temas e nas duas larguras.

## Cenários negativos

- Nenhuma frase das duas páginas afirma que o agente declara a saída hoje.

## Tentativas de reprovar

- Procurei cartão desalinhado pelo crescimento do texto do Operador a 1280: a grade iguala as alturas.
- Procurei a ressalva escondida a 390: no cartão está visível; na tabela de 15/09 fica na coluna que exige rolar (achado 1).
- Procurei contradição entre selo e texto: "Sino do painel" segue "Em uso" e diz que o aviso de retorno depende da saída em construção; os outros avisos do sino existem (vi no E08), então o selo não mente, mas mistura (achado 2).

## Achados

1. Corrige antes de crescer (rodada 2, persiste, anterior): a 390 px as tabelas e a matriz rolam na lateral sem dica, e a ressalva da linha do Operador só aparece depois de rolar. Dono: HTML das apresentações.
2. Anotado: a nota da matriz diz "tela" duas vezes na mesma oração ("a tela da coordenação já existe ... e por isso a tela fica vazia até lá"); leitura aceitável, só estilo.

## Não verificado

- O PDF regenerado de 15/09 (é da QA, que confere o gerador); `PRIVACIDADE.md`, `PAPEIS_E_RESPONSABILIDADES.md` e `README.md` (Markdown, sem renderização de tela; a frase é da QA).
- 320 e 768 px (a etapa não pede).

## Risco residual

Baixo para o visual. O risco da etapa é de afirmação, coberto pela QA.

## Motivo do humano

Critério E4 explícito na etapa (seção 10: sempre): Rafael e Alyson decidem o CP-02 e leem a apresentação ajustada antes de qualquer demonstração a município. Texto de produto alterado em peça que vai a município. Capturas `E24-*` para essa leitura.
