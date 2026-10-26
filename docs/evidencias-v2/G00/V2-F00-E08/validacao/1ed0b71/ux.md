---
validador: ux
modelo: claude-opus-5-5
etapa: V2-F00-E08
sha_validado: 1ed0b71
ci_run: ausente
rodada: 6
herdado_de:
tags: [UI, A11Y, AUTH, AUTHZ, API, LGPD]
nivel_de_prova_exigido: [E2, E3a]
nivel_de_prova_obtido: [E2, E3a]
veredito: PASS
confianca: alta
humano_necessario: sim
escalar: nenhum
---
## Critérios verificados

Montagem: API do SHA na porta 3791 (PGlite semeado) e painel construído do SHA na 4791, Chromium do Playwright. Capturas em `capturas/` desta pasta (prefixo `ux-E08-`); saídas em `SCRATCH/validadores/ux/saidas/`.

O que a etapa muda na tela: o dossiê deixa de pedir e de desenhar o cartão "Ofícios de encaminhamento" para quem não tem `consultar_oficio` (agente de campo), sem faixa de erro; o sino do agente mostra e conta só os avisos da equipe dele. Preparação real: a administradora emite o ofício da providência pendente da ocorrência 000474/2026 (Equipe Alfa) pela API (201, 000001/2026).

| Critério | Resultado | Prova |
| --- | --- | --- |
| Painel esconde "Ofícios" de quem não tem a ação | OK: agente sem o cartão em 1280, 390 e 320 px, dois temas | `ux-E08-agente-dossie-{1280,390}-{claro,escuro}.png`, `ux-E08-agente-dossie-320-claro.png` |
| A página do agente não cai pelo 403 | OK: zero faixa `.aviso--perigo`, zero erro de console e de página | `saidas/e08.txt` |
| Operador continua vendo o cartão com o ofício | OK: cartão presente, com 000001/2026 | `ux-E08-operador-dossie-*` |
| Sino do agente só com a equipe dele, contagem igual à lista | OK: 2 itens e selo 2 (ambos de 000474); administradora com 3 | `ux-E08-agente-sino-{1280,390}-{claro,escuro}.png`, `ux-E08-operador-sino-*` |
| API do agente em ofício | 403 nas duas rotas (contexto, para o que a tela evita pedir) | `saidas/e08.txt` |

Portão visual, item a item:

| Item | Resultado |
| --- | --- |
| Alinhamento | OK: sem o cartão, a coluna esquerda do agente termina em "Providências encaminhadas" sem buraco nem cartão órfão (`ux-E08-agente-dossie-1280-claro.png`) |
| Espaçamento | OK: mesmo respiro entre cartões nos dois papéis |
| Nada fora do lugar | OK medido: sem rolagem horizontal, nada fora da janela, nenhuma palavra quebrada no meio, nas 18 telas (`saidas/e08.txt`) |
| Hierarquia | OK |
| Texto | A etapa não cria texto visível (o rótulo da ação nova não é desenhado no painel) |
| Responsivo | OK a 1280, 390 e 320 px; o painel do sino ancorado na tela a 390 px, inteiro (`ux-E08-agente-sino-390-claro.png`) |
| Temas, contraste, estado não só por cor | OK nos dois temas; prazo vencido com texto ("Vencido há 4 h") além da cor |
| Estados de erro e vazio | O estado de erro que a etapa evita (403 derrubando o dossiê) não aparece |

Heurísticas: prevenção de erro (o painel não pede o que vai negar), consistência entre papéis, visibilidade (o número do sino é o da lista).

## Evidência

- `node SCRATCH/validadores/ux/e08.mjs` (código 0), saída `saidas/e08.txt` e `saidas/e08-run.txt`: 18 capturas; console e página sem erro.

## Cenários positivos

1. Operador abre o dossiê de 000474/2026 e vê "Ofícios de encaminhamento" com 000001/2026.
2. Sino do operador: 3 avisos e selo 3.

## Cenários negativos

1. Agente da Equipe Alfa abre o mesmo dossiê: sem cartão de ofícios, sem faixa de erro, sem erro de console.
2. Sino do agente: 2 avisos (os de 000474), o de outra equipe não aparece; selo 2.

## Tentativas de reprovar

- Procurei o buraco de layout deixado pelo cartão que some, a 1280 e a 390 px: não há.
- Procurei o 403 vazando para a tela do agente: nenhuma faixa de perigo, nenhum erro de console.
- Procurei o sino contando o que a lista esconde: selo e lista iguais nos dois papéis.
- Largura mínima de 320 px e tema escuro nos dois papéis.
- Procurei outra superfície com o ofício para o agente: a linha do tempo mostra "Ofício de encaminhamento emitido" com órgão e número (anotação 1).

## Achados

1. **anotado** (mantido da rodada 4). A "Linha do tempo auditável" mostra ao agente o evento do ofício com órgão e número (000001/2026), embora o cartão fique escondido; sem email, observações nem IP (`ux-E08-agente-dossie-1280-claro.png`). Fora do que a etapa pede (as rotas de ofício), mas é a mesma informação.
2. **anotado** (anterior, fora da etapa). No dossiê do operador a 390 e 320 px, "Corrigir a coordenada" tem 24 px de altura de toque (`saidas/e08.txt`).

## Não verificado

- Firefox e WebKit; leitor de tela.
- O aplicativo de campo (o sino do aparelho usa a mesma rota, sem aparelho nem emulador nesta máquina).
- Sonda HTTP do agente antes do conserto (é prova das dimensões de QA e segurança).

## Risco residual

Baixo para a experiência. O resíduo é de informação, não de tela: o número e o órgão do ofício continuam visíveis ao agente na linha do tempo.

## Motivo do humano

A validação humana da etapa é do Rafael (ver a sonda do agente antes e depois) e o gatilho visual da rodada 4 (jornada nova da seção 25) pede o olhar dele nas capturas: `ux-E08-agente-dossie-1280-claro.png`, `ux-E08-operador-dossie-1280-claro.png`, `ux-E08-agente-sino-390-claro.png`.
