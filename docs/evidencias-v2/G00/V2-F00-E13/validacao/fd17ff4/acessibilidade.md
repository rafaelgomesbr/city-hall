---
validador: acessibilidade
modelo: claude-opus-5-5
etapa: V2-F00-E13
sha_validado: fd17ff4
ci_run: 39420436042
rodada: 7
herdado_de:
tags: [UI, A11Y, AUTH]
nivel_de_prova_exigido: [E1, E2]
nivel_de_prova_obtido: [E1, E2]
veredito: PASS
confianca: alta
humano_necessario: sim
escalar: nenhum
---
## Critérios verificados

Montagem toda minha. `A` é o scratchpad do validador (`/private/tmp/claude-501/-Users-rafaelgomes-Documents-city-hall/20850765-8640-418e-ace7-9257aa515baf/scratchpad/val-acessibilidade`). API do SHA em 127.0.0.1:3893 (PGlite semeado); painel do SHA na 4893; Chromium, Firefox e WebKit; axe-core 4.10.2 injetado (WCAG 2.0, 2.1 e 2.2, A e AA). A linha "Acessibilidade" da etapa: confirmações anunciadas por `role=status`. O diff desde a rodada 6 toca `app.css`, `foco.ts` e páginas do painel (`Usuarios.tsx`, `MinhaConta.tsx`, `Ocorrencia.tsx`, `Entrar.tsx`): procurei a regressão nos Toasts de Equipes, Órgãos e Usuários e no foco depois do erro de campo nessas telas.

| Critério | WCAG | Resultado (três motores) | Prova |
| --- | --- | --- | --- |
| Confirmação de gravação em Equipes por `role=status` | 4.1.3 | OK: Toast `role=status`, `aria-live=polite`, "Equipe criada. Ela já aparece na lista abaixo." | `A/saidas/e13.txt` |
| Confirmação de gravação em Usuários por `role=status` | 4.1.3 | OK: "Usuário cadastrado. Ele já aparece na lista abaixo." com `role=status` | `A/saidas/e13.txt` |
| Ícone mais texto, contraste | 1.4.1, 1.4.3 | ícone e frase; contraste 17,7 (claro) e 14,79 (escuro) | `A/saidas/e13.txt`; `capturas/a11y-toast-equipes-firefox-390x844-escuro.png` |
| O Toast não cobre a barra do pé nem o campo focado | 1.4.10, 2.4.11 | a 390x844 o Toast fica em 680..750 e a barra em 765..844; a 320x640, 460..546 e 561..640; o campo focado (`#equipe-nome`, 406..450) fica inteiro à vista nos três motores a 390 e 320 | `A/saidas/e13.txt`, `A/saidas/e13-toast-foco.txt` |
| O foco fica no formulário ao gravar pelo teclado | 2.4.3 | OK: `#equipe-nome` e `#usuario-senha` continuam com o foco depois do Enter | `A/saidas/e13.txt` |
| Erro de campo em Usuários (nome e Enter, faltam matrícula, email e senha) | 3.3.1, 2.4.3, 2.4.11 | OK: foco em `#usuario-matricula`, `aria-invalid=true`, "Informe a matrícula", 15 de 15 visíveis a 390x844, 320x640 e 1280x900 | `A/saidas/e13.txt` |
| axe em Equipes e Órgãos | | 0 violações a 1280x900; a 390 e 320, 1 violação `link-name` em `.identidade` (anterior à fase; relatório da E09, achado 3) | `A/saidas/e13.txt` |
| Painel com zero vermelhos e testes estáticos de acessibilidade | | 699 de 699 (46 arquivos); no recorte, `acessibilidade.test.ts` 21, `toast.test.ts` 17 e `portoes-de-componente.test.ts` 11, todos verdes; `design-system.test.ts` verde na suíte inteira | `A/saidas/10-vitest-web.txt`, `A/saidas/11-vitest-a11y.txt` |

## Evidência

- `cd A && node e13.mjs` (código 0): Equipes, Órgãos e Usuários, três motores, 390x844 escuro, 320x640 claro e 1280x900 claro (`A/saidas/e13.txt`); `node e13-toast-foco.mjs` (código 0, quatro janelas, `A/saidas/e13-toast-foco.txt`). Zero erro de console.
- `npm run test --workspace @dc360/web` código 0; recorte de acessibilidade código 0 (124 de 124).
- CI: run 39420436042 sobre `55209ab`, 9 de 9 `success` conforme lido pelo gatekeeper; não reli a API.
- Captura (minha, no SHA): `capturas/a11y-toast-equipes-firefox-390x844-escuro.png`.

## Cenários positivos

- Gravações em Equipes e Usuários anunciadas por `role=status`, com ícone, contraste e sem cobrir a barra do pé.

## Cenários negativos

- Gravação recusada pela tela (campos faltando): o foco vai ao primeiro campo inválido, à vista, com o erro ligado.

## Tentativas de reprovar

- Procurei se o `focar` novo (`scrollIntoView` com `nearest`) deixava o campo inválido de Usuários atrás da barra do pé no celular, como acontece na Nova ocorrência (relatório da E09, achado 1): em Usuários o primeiro inválido fica no meio da tela nas três larguras, 15 de 15 visíveis.
- Procurei o Toast cobrindo o campo focado: a 390 e 320 não cobre. A 640x450 o campo `#equipe-nome` fica encoberto, mas pela barra do pé e não pelo Toast, e por rolagem do próprio navegador ao receber o foco (o campo foi focado antes de gravar); o mesmo acontece no código de `1ed0b71` (relatório da E09, achado 2: Tab natural atrás da barra). Não é regressão desta etapa.
- Em Órgãos, nome e Enter grava (só o nome é obrigatório) e o foco fica no `#orgao-nome`; a 320x640 o campo fica atrás da barra do pé pelo mesmo motivo de rolagem do navegador ao focar (achado 2 da E09), igual antes.
- Rodei axe nas telas da etapa nos dois temas: a única violação é anterior à fase.

## Achados

1. **corrige antes de crescer** (anterior à fase, não é desta etapa). Até 600 px e a 640x450, o elemento que recebe o foco perto do pé da janela fica atrás da barra fixa do pé (sem `scroll-padding-bottom`). Visto em Equipes e Órgãos; detalhe e medição no relatório da E09, achado 2.
2. **corrige antes de crescer** (anterior à fase). Link do topo para Minha conta sem nome acessível até 600 px (axe `link-name`; relatório da E09, achado 3).

## Não verificado

- Leitor de tela real: leitura do Toast com `aria-live=polite`.
- Órgãos com erro de servidor (email repetido) e a tela de Órgãos com todos os erros de campo: não provocados.
- `fluxo.e2e.mjs` do modo local (entrar a partir de `/`): não rodei nesta rodada; o diff não toca `App.tsx` nem `rotaInterna`, e a dimensão QA cobre.
- Zoom real do navegador (emulado), espaçamento de texto.

## Risco residual

Baixo para a entrega da etapa (Toasts com `role=status` intactos). O encobrimento pela barra do pé é anterior e global, e o achado 1 da E09 tem a mesma raiz.

## Motivo do humano

A leitura do Toast por VoiceOver ou NVDA só uma pessoa confere; a etapa também pede que o Rafael digite só o domínio e chegue à tela do papel.
