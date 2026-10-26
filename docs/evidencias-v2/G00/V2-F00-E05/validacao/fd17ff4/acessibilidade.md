---
validador: acessibilidade
modelo: claude-opus-5-5
etapa: V2-F00-E05
sha_validado: fd17ff4
ci_run: 39420436042
rodada: 7
herdado_de:
tags: [UI, A11Y, AUTH, API]
nivel_de_prova_exigido: [E1, E2]
nivel_de_prova_obtido: [E1, E2]
veredito: PASS
confianca: media
humano_necessario: sim
escalar: nenhum
---
## Critérios verificados

Montagem toda minha. `A` é o scratchpad do validador (`/private/tmp/claude-501/-Users-rafaelgomes-Documents-city-hall/20850765-8640-418e-ace7-9257aa515baf/scratchpad/val-acessibilidade`). API do SHA em 127.0.0.1:3893 (PGlite semeado); painel do SHA construído com `VITE_API_URL` e servido na 4893; Chromium, Firefox e WebKit do Playwright 1.62.1; axe-core 4.10.2 injetado (regras WCAG 2.0, 2.1 e 2.2, A e AA; o projeto não tem axe). O diff desde a rodada 6 toca o mapa desta etapa pela guarda de códigos de erro da API e do console (lado do servidor, sem interface) e por `Entrar.tsx` (só o passo "Defina a sua senha", que passou a focar por `useFocoDepoisDeRenderizar`). A dimensão olha a parte de tela: as três frases da entrada e o foco depois da recusa.

| Critério | WCAG | Resultado (Chromium, Firefox, WebKit) | Prova |
| --- | --- | --- | --- |
| "Sua sessão expirou." (os dois tokens inválidos, a próxima leitura leva à entrada) | 4.1.3, 1.4.1, 1.4.3 | `Aviso` com `role=status`, ícone `aria-hidden` mais título em negrito e frase; contraste 6,37 (claro, 1280) e 11,41 (escuro, 320); axe 0 violações; foco em BODY e o primeiro Tab no `#entrada-email` | `A/saidas/e05.txt` |
| "Sua sessão foi encerrada." (quem administra encerra as sessões; a próxima chamada leva à entrada) | 4.1.3, 1.4.1, 1.4.3 | `role=status`, ícone e texto; 6,37 e 11,41; axe 0 violações | `A/saidas/e05.txt`; `capturas/a11y-entrada-encerrada-chromium-1280-claro.png` |
| "Sua conta foi desativada." (conta desativada, a renovação diz 403 `conta_desativada`) | 4.1.3, 1.4.1, 1.4.3 | `role=alert`, ícone e texto; 4,75 (claro) e 7,93 (escuro); axe 0 violações | `A/saidas/e05.txt`; `capturas/a11y-entrada-desativada-chromium-320-escuro.png` |
| Recusa ao entrar (a pessoa desativada tenta de novo; senha errada), enviada por Enter no campo de senha | 3.3.1, 4.1.3, 2.4.3 | OK: frase genérica "Email ou senha inválidos." em `ErroCampo` com `role=alert` e ícone; os dois campos com `aria-invalid=true` e `aria-describedby="entrada-erro"`; foco fica no `#entrada-senha`; contraste 5,46 e 7,27 | `A/saidas/e05.txt` |
| Recusa ao entrar enviada pelo botão (Espaço no botão focado, ou clique) | 2.4.3 | **Foco cai em BODY nos três motores** (o botão fica `disabled` enquanto entra); o erro é anunciado (`role=alert`); no Chromium e no Firefox o Tab seguinte vai a "Esqueceu a senha?", no WebKit ao começo da página. Achado 1 (anterior, fora do diff) | `A/saidas/e05.txt`; `capturas/a11y-entrada-recusa-espaco-firefox-1280-claro.png` |
| "Defina a sua senha" (parte de `Entrar.tsx` que mudou): foco depois da provisória errada | 2.4.3, 2.4.11 | OK nos três motores a 640x450, 320x256 e 320x640: `#senha-nova-atual`, 15 de 15 pontos visíveis | `A/saidas/e09-provisoria.txt` |
| 320 px e dois temas na entrada | 1.4.10 | sem rolagem horizontal (e2e de tela estreita verde nos três motores) | `A/saidas/12-layout-estreito-*.txt` |
| Aplicativo de campo: mensagens de conta desativada com rótulo falado | 4.1.2 | jest do aplicativo 1997 de 1997 (139 suítes), incluindo "conta_desativada: o rótulo falado do chip não diz que a coleta espera sinal" e "conta desativada: diz que falta a coordenação reativar a conta" | `A/saidas/20-jest-campo.txt`, `A/saidas/21-jest-campo-a11y.txt` |
| Testes estáticos do painel | | 699 de 699, código 0 | `A/saidas/10-vitest-web.txt` |

## Evidência

- `cd A && node e05.mjs` (código 0): as três frases provocadas por fluxo real (tokens corrompidos no `sessionStorage`; `POST /usuarios/:id/encerrar-sessoes` 200; `PATCH /usuarios/:id/situacao` 200, depois revertido), a recusa por Enter, Espaço e clique, três motores, 1280x900 claro e 320x640 escuro, axe e contraste calculado por elemento (`A/saidas/e05.txt`).
- `node e09-provisoria.mjs` (código 0, `A/saidas/e09-provisoria.txt`).
- `npm run test --workspace @dc360/web` código 0 (699); `npx jest` em `dc360/apps/campo` código 0 (1997); recorte por nome código 0 (226).
- CI: run 39420436042 sobre `55209ab` (só lista permitida), 9 de 9 jobs `success` conforme lido pelo gatekeeper; não reli a API.
- Capturas (minhas, no SHA): `capturas/a11y-entrada-encerrada-chromium-1280-claro.png`, `capturas/a11y-entrada-desativada-chromium-320-escuro.png`, `capturas/a11y-entrada-recusa-espaco-firefox-1280-claro.png` (tirada depois do Tab seguinte ao Espaço: o anel aparece em "Esqueceu a senha?", e não no campo de senha).

## Cenários positivos

- As três frases aparecem, cada uma com ícone, título e texto, papel de região viva (`status` para as de alerta, `alert` para a de perigo) e contraste acima de 4,5 nos dois temas.
- A recusa por Enter mantém o foco no campo de senha com o erro ligado.

## Cenários negativos

- Conta desativada que tenta entrar de novo: recusa genérica, sem revelar que a conta existe (mesma frase da senha errada), anunciada por `role=alert`.
- Sessão encerrada por quem administra: a próxima chamada leva à entrada com a frase própria.

## Tentativas de reprovar

- Procurei o mesmo defeito que reprovou a E09 na rodada 6 (foco em BODY depois da recusa) na tela de entrada: aparece quando se envia pelo botão, nos três motores, e não aparece por Enter. Conferi que o trecho (`FormularioSenha`, `Entrar.tsx` linhas 150 a 195 e o botão `disabled={entrando}` na 276) não mudou desde a base da fase (`git diff afde25c..fd17ff4 -- dc360/apps/web/src/paginas/Entrar.tsx` mexe nos avisos de motivo, que são desta etapa, e no passo da senha nova; o `FormularioSenha` não muda).
- Rodei axe nas três frases e nos dois temas: 0 violações (um item de contraste "incompleto" por fundo sobreposto, conferido à mão pelo meu cálculo: 4,75 é o menor).
- Tentei achar regressão do `focar` novo na entrada: o formulário de entrada não chama `focar`; o passo da senha nova chama, e o campo fica à vista nos zooms de 200 e 400 por cento.
- Tentei ver se o aviso de conta desativada some ou é empurrado para fora a 320 px: não, fica acima do formulário, sem rolagem horizontal.

## Achados

1. **corrige antes de crescer** (anterior à fase, fora do diff e da entrega desta etapa). Na tela de entrada, quando a pessoa envia pelo botão "Entrar" (Espaço no botão focado, ou clique) e a entrada é recusada, o foco cai em BODY nos três motores, porque o botão fica desabilitado enquanto entra e o foco não é devolvido. O erro é anunciado (`role=alert`) e, no Chromium e no Firefox, o Tab seguinte continua depois do botão ("Esqueceu a senha?"), então a ordem não se perde; no WebKit recomeça no topo. É o mesmo padrão que a correção 4 da E09 consertou em Minha conta e em "Defina a sua senha" e que não chegou ao formulário de entrada. Reprodução: `/entrar`, email e senha errada, Tab até "Entrar", Espaço; `document.activeElement` é BODY. Conserto provável: `useFocoDepoisDeRenderizar` levando o foco ao campo de senha (ou ao `#entrada-erro`) quando a recusa chega. Não o classifico como bloqueio desta etapa porque a E05 entrega as frases e os códigos, e o critério WCAG 2.4.3 não é quebrado de forma estrita no Chromium e no Firefox; o gatekeeper decide se o padrão da rodada 6 vale aqui.
2. **corrige antes de crescer** (anterior à fase). Até 600 px, o link do topo para Minha conta não tem nome acessível (axe `link-name`; detalhe no relatório da E09, achado 3). Não aparece na tela de entrada; aparece em toda tela logada.

## Não verificado

- Leitor de tela real: as frases "expirou" e "encerrada" entram na página junto com ela (navegação interna do React) num `role=status`; se o VoiceOver ou o NVDA as leem sem a pessoa navegar até elas depende do leitor. A de conta desativada é `role=alert`, que costuma ser lida. Só uma pessoa confere.
- A seção 23 de `fluxo-api.e2e.mjs` (o E2E funcional da etapa): não rodei; é da dimensão QA. Rodei as sondas acima, que provocam as três frases por fluxo real.
- A guarda de códigos de erro do console não tem interface própria nesta etapa; a acessibilidade do console não foi exercitada.
- Zoom real do navegador (emulado por janela CSS), espaçamento de texto (1.4.12).

## Risco residual

As três frases estão acessíveis por estrutura (papel, ícone, contraste, axe). O risco é a recusa enviada pelo botão deixar o foco solto na tela mais usada do produto, e a leitura automática das frases de `status` depender do leitor de tela.

## Motivo do humano

A etapa pede que o Rafael leia e aprove as três frases (conteúdo de produto). Além disso, só uma pessoa com VoiceOver ou NVDA confere se "Sua sessão expirou" e "Sua sessão foi encerrada" são lidas ao chegar à entrada, e se a recusa é lida uma vez.
