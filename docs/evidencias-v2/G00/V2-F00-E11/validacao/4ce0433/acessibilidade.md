---
validador: acessibilidade
modelo: claude-opus-5-5
etapa: V2-F00-E11
sha_validado: 4ce0433
ci_run: ausente
rodada: 5
herdado_de:
tags: [UI, A11Y, LGPD]
nivel_de_prova_exigido: [E1, E2]
nivel_de_prova_obtido: [E1, E2]
veredito: PASS
confianca: media
humano_necessario: sim
escalar: nenhum
---

Pasta de trabalho deste validador (fora do repositório): `/private/tmp/claude-501/-Users-rafaelgomes-Documents-city-hall/768bf074-5845-4f2d-bff9-57106bf57383/scratchpad/val/L07-acessibilidade/` (abaixo, `saidas/` e `sondas/`). API real (PGlite semeado) na 3777, painel construído na pasta de trabalho e servido na 4777, download real do ZIP; axe-core 4.10.2 só na pasta de trabalho (WCAG 2.0 e 2.1 A e AA). O ZIP baixado foi gravado em `run/` e é apagado com a pasta no fim.

## Critérios verificados

DoD da etapa: "botão baixa o ZIP em dois navegadores contra a API real; 401 renova; prova no e2e". Frontend: `Organizacao.tsx` "mostra a frase da API quando recusado". Portão visual da seção 0 de `19`: foco visível, contraste AA, estado nunca só por cor. A etapa não tem linha "Acessibilidade:". O cartão "Saída de município" (`/organizacao`, administradora) foi acionado SÓ pelo teclado (20 Tabs até o botão, Enter).

| Item WCAG 2.1 AA | Resultado | Prova |
| --- | --- | --- |
| 2.1.1 baixar o pacote pelo teclado | OK | Chromium e Firefox, `dc360-pacote-de-saida-2026-10-19.zip`, 249 029 e 249 209 bytes (`saidas/17`) |
| 4.1.2 botão com nome "Baixar pacote de saída" | OK | `saidas/17` |
| 2.4.7 anel de foco no botão | OK | `saidas/17` |
| 4.1.3 e 1.4.1 erros (403 sem permissão, rede caída) em `role="alert"` com ícone e a frase | OK | `saidas/17`; `a11y-saida-erro-foco-1280-claro.png` e `-escuro.png` |
| 1.4.3 contraste do cartão, com e sem erro, claro e escuro | OK | axe sem violação (`saidas/17`) |
| 1.4.10 reflow 320 e 390 px, alvo de 44 px | OK | sem rolagem horizontal, botão inteiro com 44 px de altura; `a11y-saida-390-escuro.png` |
| 2.4.3 foco depois de acionar o botão | FALHA (não decide a etapa, classificação arbitrada na rodada 4) | ver Achados |

## Evidência

- `npx vitest run` em `apps/web`: 669 de 669, código 0 (`saidas/01`), com `pacote-de-saida.test.ts` (7 casos) dentro do recorte de 209 (`saidas/02`).
- `node sondas/sonda-e11.mjs`: Chromium 15 aprovadas e 3 falhas, Firefox 15 aprovadas e 1 falha, código 0 nos dois (`saidas/17-sonda-e11-chromium.txt`, `saidas/17-sonda-e11-firefox.txt`). Todas as falhas são de foco depois do Enter.
- E2E do repositório contra par recém-semeado: `test/fluxo-api.e2e.mjs` Chromium 288 de 288, zero erro de console, código 0 (`saidas/20`); a seção 28 (o download pelo botão, 401 que renova, as três recusas com a frase) passa inteira.
- `git diff bb0f654 4ce0433 -- dc360/apps/web/src`: só `busca/pontuador.ts`. `Organizacao.tsx` igual ao da rodada 4.
- Capturas desta rodada (`capturas/`): `a11y-saida-erro-foco-1280-claro.png`, `a11y-saida-erro-foco-1280-escuro.png` (o aviso de perigo acima do botão e o botão SEM anel de foco, prova visual de que o foco saiu dele), `a11y-saida-390-escuro.png`.

## Cenários positivos

- Tab até o botão, Enter, o ZIP chega ao navegador nos dois motores; o botão diz "Gerando" enquanto gera.
- 403 e rede caída: a frase aparece acima do botão em `role="alert"`, com ícone.

## Cenários negativos

- Sucesso, 403 e rede caída: foco perdido para `BODY` (Chromium 3 de 3; Firefox no sucesso). No Chromium o Tab seguinte também fica em `BODY` (o botão é o último controle da página); no Firefox o Tab seguinte recomeça em "Pular para o conteúdo".

## Tentativas de reprovar

1. Rodei axe-core no cartão, com e sem erro, nos dois temas: zero violação.
2. Medi `document.activeElement` 80 ms depois do Enter e depois do fim (download ou aviso), e o Tab seguinte, em dois motores e três casos: reprovou (abaixo).
3. Conferi se a correção 4 tocou o cartão: não tocou.
4. Conferi a 320 e 390 px se o botão sai da tela ou fica abaixo de 44 px: não.

## Achados

1. **Motivo do veredito da rodada 4 (Acessibilidade FAIL, arbitrado como "corrige antes de crescer", dono V2-F10-E11): NÃO consertado.** O defeito continua idêntico em `4ce0433`: ao acionar "Baixar pacote de saída" pelo teclado o foco cai em `BODY`, porque o botão que tem o foco vira `disabled` enquanto gera (`apps/web/src/paginas/Organizacao.tsx:269`, `disabled={baixando}`), e "Gerando" e a conclusão não são anunciados (sem `aria-busy`, sem região viva; no sucesso não aparece frase nenhuma). Medido agora: Chromium 3 de 3 casos (sucesso, 403, rede), Firefox 1 de 3 (sucesso; nos erros o aborto chega antes de o React aplicar o `disabled`). Mantenho a classificação arbitrada (o DoD e os campos da etapa não pedem foco; a linha é anterior à etapa, `b793e828`) e por isso não reprovo; o registro está no `VEREDITO.md` da rodada 4 (linha 78), não em `apps/web/PENDENCIAS.md`, e o texto da V2-F10-E11 não cita botão desabilitado: o dono precisa constar onde a F10 vai ler. Reprodução: `node sondas/sonda-e11.mjs`.
2. Anotado: o mesmo padrão "desabilita o botão que tem o foco enquanto grava" aparece em `ConfirmarAcao.tsx:141,149` (E09), `RecuperarSenha.tsx:160` (E10) e `Orgaos.tsx:241` (E13), todos medidos nesta rodada com o mesmo efeito no Chromium. É um defeito de classe; um conserto só no componente de botão do painel fecharia os quatro.

## Não verificado

- Anúncio real por VoiceOver ou NVDA dos erros `role="alert"`.
- Abrir o ZIP no sistema operacional (validação humana da etapa, fora desta dimensão).
- WebKit no teclado (o Tab do WebKit do Playwright no macOS não alcança botões).

## Risco residual

Médio para quem usa só teclado ou leitor de tela: perde a posição a cada uso do botão e, no sucesso, não ouve que o pacote foi gerado. Quem enxerga vê o download do navegador.

## Motivo do humano

Leitor de tela (VoiceOver, NVDA) para os anúncios e, depois do conserto, para conferir que o foco permanece no botão; Rafael baixa e abre o ZIP (validação humana da etapa). Limite da seção 4 de `28`.
