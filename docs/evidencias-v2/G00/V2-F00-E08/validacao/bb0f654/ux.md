---
validador: ux (general-purpose com o papel da dimensão)
modelo: claude-opus-5-5
etapa: V2-F00-E08
sha_validado: bb0f654
ci_run: ausente (39143791434 citado pelo implementador, não lido)
rodada: 4
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

Pasta das capturas (geradas por mim, Chromium do Playwright, painel do SHA ligado à API real semeada): `/private/tmp/claude-501/-Users-rafaelgomes-Documents-city-hall/ded47d25-806d-4495-ac61-f9e84518cc35/scratchpad/validadores/ux-E05-E08-E09-E10/capturas/` (abaixo, `capturas/`).

O que a etapa muda na tela: o dossiê da ocorrência deixa de pedir e de desenhar o cartão "Ofícios de encaminhamento" para quem não tem `consultar_oficio` (agente de campo), sem faixa de erro; o sino do agente mostra só avisos da equipe dele. Checklist do portão visual para o dossiê do agente, o do operador e o sino:

| Item | Resultado | Prova |
| --- | --- | --- |
| Alinhamento | OK: sem o cartão de ofícios, a coluna esquerda do agente termina em "Providências encaminhadas" sem buraco nem cartão órfão | `E08-agente-dossie-1280-claro.png` |
| Espaçamento | OK: mesmo respiro entre cartões nos dois papéis | `E08-agente-dossie-*`, `E08-operador-dossie-*` |
| Nada fora do lugar | OK no que a etapa toca. Medidor de geometria: nos dossiês, só "Corrigir a coordenada" do operador com 24 px de altura (já existente, fora da etapa); no sino, as pílulas de filtro de `/ocorrencias` com 36 px (já existentes, fora da etapa) | `geometria.json` (chaves `E08-*`) |
| Hierarquia | OK | idem |
| Texto | OK: a etapa não cria texto visível (o rótulo "consultar os ofícios de encaminhamento" não é desenhado em tela nenhuma: `ROTULO_ACAO` não é usado em `apps/web/src`) | busca no código |
| Responsivo | OK em 1280 e 390 | capturas |
| Temas, foco, contraste, cor | OK nos dois temas | `E08-agente-dossie-390-escuro.png` |
| Estado de erro | OK: o dossiê do agente abre SEM faixa de perigo (`agente faixas de erro: []` em `saidas/e08.txt`): o 403 que derrubaria a página não é mais pedido | `saidas/e08.txt` |

Heurísticas: visibilidade (o agente não vê algo que depois falha), consistência (operador continua com o cartão), prevenção de erro (o painel não pede o que vai negar): OK. Ver "Achados" sobre a linha do tempo.

## Evidência

- API e painel: mesma montagem da validação de UX das E05, E09 e E10 (API real na 3791 com PGlite semeado; painel construído do SHA em pasta do scratchpad, servido na 4791; ambos derrubados no fim).
- Roteiro `capturar.mjs e08`: a administradora emite o ofício da providência da ocorrência `...00c4` (000474/2026, Equipe Alfa) pela API (201); Diego (agente da Alfa) e Jonas (operador) entram pela tela e abrem o dossiê; depois abrem o sino em `/ocorrencias`. Saída `saidas/e08.txt`; console `console-e08.txt`: ZERO erros.
- Capturas (16): `E08-agente-dossie-{1280,390}-{claro,escuro}.png`, `E08-operador-dossie-*`, `E08-agente-sino-*`, `E08-operador-sino-*`. Olhadas: `E08-agente-dossie-1280-claro.png` inteira, o dossiê do agente a 390 escuro em colunas (`folhas/e08-ag-390.png`), a metade de baixo do operador a 1280 escuro (`folhas/e08-op-baixo.png`) e os sinos (`folhas/e08-sino.png`).
- Comparadas com as arquivadas pelo implementador (`docs/evidencias-v2/G00/V2-F00-E08/capturas/agente-dossie-390-claro.png`): as arquivadas são de código ANTERIOR ao SHA (barra do pé da tela em fila de rótulos, com "Tema" cortado na borda, e atalho "Ctrl K"); no SHA a barra é de ladrilhos (correção 1 da E09) e não corta. As minhas substituem as arquivadas como prova do SHA.

## Cenários positivos

1. Operador: cartões "Registrar resposta do órgão" e "Ofícios de encaminhamento" presentes, com 000001/2026, Secretaria de Obras e o selo "Não enviado por email".
2. Agente: dossiê completo (dados, vistoria, fotos, providências, linha do tempo, prazo, ver também) sem o cartão de ofícios e sem faixa de erro.
3. Sino do operador: 3 avisos (000474 duas vezes e 000473, da Bravo), "Marcar como lidos os 3 desta lista".

## Cenários negativos

1. Sino do agente da Alfa: 2 avisos, os dois de 000474; o de 000473 (Bravo) não aparece, e o número do sino é 2, igual à lista ("Marcar como lidos os 2 desta lista").
2. O agente não recebe faixa de erro nem 403 no console ao abrir o dossiê (zero erros de console).

## Tentativas de reprovar

- Procurei o buraco de layout deixado pelo cartão que some: não há (grade de duas colunas segue alinhada; o cartão "Ver também" já era alto, igual nos dois papéis).
- Procurei o 403 de `/oficios` vazando para a tela do agente como frase de falha: nenhuma faixa `.aviso--perigo`, nenhum erro de console.
- Procurei o sino contando o que a lista esconde: badge 2 e lista 2 para o agente; badge 3 e lista 3 para o operador.
- Procurei outra superfície que mostre o ofício ao agente: a "Linha do tempo auditável" mostra o evento "Ofício de encaminhamento emitido" com órgão e número (achado 1).

## Achados

1. **Anotado (encaminhar à dimensão de segurança e LGPD; consistência de UX).** O agente não vê o cartão de ofícios, mas a linha do tempo do mesmo dossiê mostra "Ofício de encaminhamento emitido ... Órgão: Secretaria de Obras · Número: 000001/2026" (`E08-agente-dossie-1280-claro.png`, coluna direita; `folhas/e08-ag-390.png`, terceira coluna). Não traz e-mail do órgão, observações nem IP, que são o que a etapa protege, e a ocorrência é da equipe dele; por isso não quebra critério da etapa. Fica para a dimensão de segurança e LGPD decidir se o número do ofício na trilha é aceitável para o agente.
2. **Anotado (fora da etapa, já existente).** Pílulas de filtro de `/ocorrencias` com 36 px de altura a 390 px (alvo de toque abaixo de 44); "Corrigir a coordenada" com 24 px; tabela "Providências encaminhadas" muito espremida a 1280 (órgão e responsável em 2 a 4 linhas) e rolando a 390.
3. **Anotado (evidência).** As capturas arquivadas pelo implementador são de código anterior ao SHA validado (barra do pé diferente). As desta validação são do SHA.

## Não verificado

- 320 e 768 px do dossiê (a etapa não pede; não capturei).
- Firefox e WebKit; leitor de tela; zoom de 200 por cento.
- A sonda HTTP antes e depois (200 contra 403) não é desta dimensão: não a reproduzi (é das dimensões de QA, segurança e red-team).
- O modo de demonstração (`local.ts`) não foi aberto no navegador.

## Risco residual

Baixo para a interface: a etapa só tira um cartão. O achado 1 é de autorização e minimização, e precisa do olhar da dimensão de segurança e LGPD, não de correção de layout.

## Motivo do humano

Gatilho visual pelo diff (seção 10 de `28`): **nova jornada relevante** (seção 25 nova de `apps/web/test/fluxo-api.e2e.mjs`). Os outros não disparam: nenhuma tela, rota ou componente novo, nenhum texto visível criado (a etapa só deixa de desenhar um cartão). E4 visual do Rafael: conferir, lado a lado, `capturas/E08-agente-dossie-1280-claro.png` e `capturas/E08-operador-dossie-1280-escuro.png` (o cartão some só para o agente, sem faixa de erro), `capturas/E08-agente-dossie-390-escuro.png`, e os sinos `capturas/E08-agente-sino-1280-claro.png` e `capturas/E08-operador-sino-1280-escuro.png`; e decidir sobre o achado 1 (número do ofício na linha do tempo do agente). A "Validação humana" original da etapa (ver a sonda 200 contra 403) não é visual e fica com as outras dimensões.
