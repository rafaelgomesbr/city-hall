---
validador: acessibilidade (general-purpose com o papel da dimensão)
modelo: claude-opus-5-5
etapa: V2-F00-E11
sha_validado: bb0f654
ci_run: ausente (39143791434 citado pelo implementador, não lido)
rodada: 4
herdado_de:
tags: [UI, A11Y, LGPD]
nivel_de_prova_exigido: [E1, E2]
nivel_de_prova_obtido: [E1, E2]
veredito: FAIL
confianca: alta
humano_necessario: sim
escalar: nenhum
---

Pasta das sondas e saídas deste validador (fora do repositório): `/private/tmp/claude-501/-Users-rafaelgomes-Documents-city-hall/ded47d25-806d-4495-ac61-f9e84518cc35/scratchpad/validadores/acessibilidade/` (`saidas/` e `capturas/` relativas a ela). API real (PGlite semeado) e painel construído, portas próprias, derrubados no fim; download real do ZIP da API. `@axe-core/playwright` ausente do repositório: DOM, `ariaSnapshot()` e contraste por cor computada.

## Critérios verificados

Checklist WCAG 2.1 AA no cartão "Saída de município" (`/organizacao`, administradora), com o botão "Baixar pacote de saída" acionado só pelo teclado, no sucesso e nos três erros (403 sem permissão, 403 município suspenso, rede caída):

| Item WCAG | Resultado | Prova |
| --- | --- | --- |
| 4.1.2 botão com nome "Baixar pacote de saída", alcançado por Tab | OK | `saidas/07` |
| 2.4.7 anel de foco no botão | OK | 2 mais 4 px |
| 4.1.3 os três erros em `role="alert"`, com ícone e texto | OK | `saidas/07` |
| 1.4.3 contraste do cartão com erro, claro e escuro | OK | pior 4,75:1 (claro), 5,96:1 (escuro) |
| 1.4.10 reflow 640 e 320 px | OK | sem rolagem horizontal, botão inteiro, 44 px |
| **2.4.3 ordem de foco preservada depois de acionar o botão** | **FALHA** | foco cai em `BODY` no sucesso e nos três erros, Chromium e Firefox |
| 4.1.3 estado "Gerando" e conclusão do download anunciados | não atendido (ver achado 2) | |

## Evidência

- `node sonda-e11.mjs`, Chromium: 19 aprovadas, 4 falhas, todas de foco (`saidas/07-sonda-e11-chromium.txt`). Durante a geração: botão `{"disabled":true,"ariaBusy":null,"texto":"Gerando"}`, foco em `BODY`.
- `node sonda-e11-sucesso.mjs` (download real do ZIP, `dc360-pacote-de-saida-2026-10-19.zip`): Chromium e Firefox, foco em `BODY` depois do download; são precisos 21 Tabs (Chromium) e 20 Tabs (Firefox) para voltar ao botão (`saidas/10-sonda-e11-sucesso-motores.txt`).
- `node sonda-e11-tab.mjs` (erro 403): Chromium foco em `BODY`; Firefox foco em `BODY` e o Tab seguinte recomeça em "Pular para o conteúdo", o topo da página; WebKit mantém o foco no botão, mas o Tab do WebKit do Playwright no macOS não alcança botões (motor) (`saidas/08-sonda-e11-tab-motores.txt`).
- E2E oficial: seção 28 dentro de `fluxo-api.e2e.mjs`, Chromium e Firefox 288 de 288 (`saidas/01`, `saidas/23`); ela clica com o mouse e não confere foco.
- Capturas olhadas: `capturas/E11-saida-erro-rede-1280-escuro-chromium.png` (aviso de perigo com ícone, frase inteira; o botão logo abaixo SEM anel de foco, prova visual de que o foco saiu dele), `capturas/E11-saida-gerando-1280-claro-chromium.png`, `E11-saida-erro-{sem-permissao,suspenso,rede}-1280-{claro,escuro}-chromium.png`, `E11-saida-{640,320}-escuro-chromium.png`.

## Cenários positivos

- Tab chega ao botão com nome correto e anel de foco; Enter baixa o ZIP da API real.
- Os três erros aparecem acima do botão em `role="alert"` com ícone e texto, contraste AA nos dois temas.
- 640 e 320 px: cartão sem rolagem horizontal, botão de 216 por 44 px.

## Cenários negativos

- 403 sem permissão, 403 município suspenso, rede caída: aviso correto, mas foco perdido (abaixo).

## Tentativas de reprovar

1. Acionei o botão pelo teclado e medi `document.activeElement` durante e depois da geração: `BODY` nos dois momentos, em Chromium e Firefox. Reprovou.
2. Para separar "foco perdido sem consequência" de "ordem de foco quebrada", medi o Tab seguinte: no Firefox recomeça do topo ("Pular para o conteúdo"); no Chromium sai do documento (o botão é o último controle da página). Voltar ao botão custa 20 a 21 Tabs.
3. Confirmei a causa no código: `apps/web/src/paginas/Organizacao.tsx:269`, `disabled={baixando}` no botão que tem o foco, sem devolução do foco no `finally`; o navegador tira o foco de elemento que vira `disabled`.
4. Procurei anúncio do estado de geração e do sucesso: o botão não tem `aria-busy` nem região viva; no sucesso não aparece mensagem nenhuma na tela.

## Achados

1. **FALHA (WCAG 2.4.3, ordem de foco), fluxo principal da etapa.** Quem baixa o pacote pelo teclado perde o foco a cada uso, no sucesso e nos três erros: o botão vira `disabled` enquanto gera (`Organizacao.tsx:269`) e o foco cai em `BODY`, em Chromium e Firefox. No Firefox o Tab seguinte recomeça do topo; nos dois motores são precisos 20 ou 21 Tabs para voltar ao botão. É a mesma classe de defeito (foco em `BODY` depois de acionar o controle do fluxo) que reprovou a E09 na rodada 2. O código do `disabled` é anterior à etapa, mas o fluxo é o que a etapa entrega e declara pronto ("o botão baixa o ZIP"), e a acessibilidade dele não foi conferida antes. Reprodução: `sonda-e11.mjs`, `sonda-e11-sucesso.mjs`, `sonda-e11-tab.mjs`. Conserto provável de poucas linhas: manter o botão focável (`aria-disabled` com guarda contra clique duplo) ou devolver o foco ao botão no `finally`.
2. Corrige antes de crescer (WCAG 4.1.3): "Gerando" não é anunciado (sem `aria-busy` nem região viva) e o sucesso não deixa mensagem na tela; para leitor de tela o clique termina em silêncio.

## Não verificado

- Anúncio real por leitor de tela dos três erros `role="alert"` (CP-32).
- axe-core (não instalado). Zoom pela interface do navegador (usado reflow).
- Abrir o ZIP no sistema operacional (validação humana da etapa, fora desta dimensão).

## Risco residual

Médio: quem usa só teclado ou leitor de tela fica sem posição depois de baixar o pacote e precisa percorrer a página de novo; quem usa leitor de tela não ouve que o pacote está sendo gerado nem que terminou.

## Motivo do humano

Leitor de tela (VoiceOver, NVDA): conferir os anúncios dos erros e, depois do conserto, que o foco permanece no botão (seção 4 de `28`).
