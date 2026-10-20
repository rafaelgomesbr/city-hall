---
validador: acessibilidade
modelo: claude-opus-5-5
etapa: V2-F00-E11
sha_validado: 1ed0b71
ci_run: ausente
rodada: 6
herdado_de:
tags: [UI, A11Y, LGPD]
nivel_de_prova_exigido: [E1, E2]
nivel_de_prova_obtido: [E1, E2]
veredito: PASS
confianca: media
humano_necessario: sim
escalar: nenhum
---
## Critérios verificados

Montagem própria (API do SHA em 127.0.0.1:3891, PGlite recém-semeado; painel do SHA na 4891; Chromium e Firefox do Playwright). `V` é `SCRATCH/validadores/acessibilidade`. A etapa não tem linha "Acessibilidade:" e o DoD é "botão baixa o ZIP em dois navegadores contra a API real; 401 renova; prova no e2e". A arbitragem da rodada 4 (VEREDITO da etapa) decidiu que o foco depois do download é "corrige antes de crescer" com dono V2-F10-E11; conferi se continua igual e se algo piorou.

| Critério | WCAG | Resultado | Prova |
| --- | --- | --- | --- |
| Botão acionável pelo teclado e o download acontece | 2.1.1 | OK nos dois motores (Tab até o botão e Enter; `dc360-pacote-de-saida-2026-10-20.zip`) | `V/saidas/11-sonda-telas.txt` |
| Alvo de toque | 2.5.8 | 216x44 px, nos dois motores e larguras | idem |
| Ícone mais texto no botão | 1.4.1, 1.1.1 | OK ("Baixar pacote de saída" com ícone) | `capturas/a11y-E11-recusa-*` |
| Recusa mostra a frase da API como alerta | 4.1.3, 3.3.1 | OK: `role=alert`, ícone, contraste 4,75 (claro) e 5,96 (escuro) | `11-sonda-telas.txt`; `capturas/a11y-E11-recusa-{chromium,firefox}-{1280-light,390-dark}.png` |
| Foco depois do download | 2.4.3 | BODY nos dois motores (achado 1, já decidido) | `11-sonda-telas.txt` |
| "Gerando" e a conclusão anunciados | 4.1.3 | nenhuma região viva muda (achado 1) | idem |
| E2E da etapa (seções 28 e 29 de `fluxo-api.e2e.mjs`) em dois navegadores | | OK: 288 de 288 em Chromium e em Firefox | `V/saidas/05-fluxo-api-{chromium,firefox}.txt` |

## Evidência

- `node V/sondas/telas.mjs` (código 0, `V/saidas/11-sonda-telas.txt`): administradora da semente em `/organizacao`, foco no botão, Enter, espera o evento de download, amostra `document.activeElement` três vezes, observa mutações em `[role=status]`, `[role=alert]` e `[aria-live]`; depois intercepta `**/saida/pacote.zip` com 403 e confere o aviso. 1280 claro e 390 escuro, dois motores.
- `node test/fluxo-api.e2e.mjs`: 288 de 288 em Chromium e em Firefox, zero erro de console.
- `npm run test --workspace @dc360/web`: 688 de 688.
- Capturas: `capturas/a11y-E11-recusa-chromium-1280-light.png`, `-chromium-390-dark.png`, `-firefox-1280-light.png`, `-firefox-390-dark.png`.

## Cenários positivos

Download pelo teclado nos dois motores; botão com 44 px de altura; arquivo com o nome do dia.

## Cenários negativos

Recusa simulada (403 `sem_permissao`): a frase aparece como alerta com ícone, nos dois motores e nos dois temas. O 403 real do coordenador e o `acesso_suspenso` são da `fluxo-api` (verde).

## Tentativas de reprovar

1. Acionei pelo teclado em vez do clique: download acontece, mas o foco cai em BODY (no Firefox o Tab seguinte vai a "Pular para o conteúdo"; no Chromium o próximo Tab continua sem destino útil na amostra).
2. Na recusa, o foco varia: no Firefox a 1280 px fica no botão, nas outras combinações vai a BODY; o alerta é anunciado em todas.
3. Procurei anúncio de "Gerando" ou de conclusão em região viva: nenhum.

## Achados

1. **corrige antes de crescer (WCAG 2.4.3 e 4.1.3; decidido pela arbitragem da rodada 4, dono V2-F10-E11; continua igual neste SHA).** O botão fica `disabled` enquanto gera, e o foco cai em BODY ao terminar; "Gerando" e a conclusão não são anunciados. Causa: `disabled={baixando}` em `Organizacao.tsx:269`, linha anterior à etapa. Não reprova a etapa pelo motivo já arbitrado (o DoD não pede foco).

## Não verificado

- Leitor de tela; WebKit; zoom de 200 por cento a 1280 px; o caminho real do 401 que renova pelo navegador (coberto pela `fluxo-api` e pelos testes de unidade, não medido por mim do ponto de vista de foco).

## Risco residual

Quem usa teclado ou leitor de tela baixa o pacote, mas não ouve "Gerando" nem a conclusão e perde o lugar na página. O dono e o prazo já estão registrados.

## Motivo do humano

Só uma pessoa com leitor de tela confere o silêncio durante a geração; a validação humana da etapa (Rafael baixa o pacote e abre o ZIP) segue pendente.
