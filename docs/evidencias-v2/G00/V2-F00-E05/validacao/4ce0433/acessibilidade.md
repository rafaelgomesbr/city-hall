---
validador: acessibilidade
modelo: claude-opus-5-5
etapa: V2-F00-E05
sha_validado: 4ce0433
ci_run: ausente
rodada: 5
herdado_de:
tags: [UI, A11Y, AUTH, API]
nivel_de_prova_exigido: [E1, E2]
nivel_de_prova_obtido: [E1, E2]
veredito: PASS
confianca: alta
humano_necessario: sim
escalar: nenhum
---

Pasta de trabalho deste validador (fora do repositório): `/private/tmp/claude-501/-Users-rafaelgomes-Documents-city-hall/768bf074-5845-4f2d-bff9-57106bf57383/scratchpad/val/L07-acessibilidade/` (abaixo, `saidas/` e `sondas/` são relativas a ela). API real (`npx tsx src/index.ts`, PGlite semeado, `NOTIFICADOR_ARQUIVO`) na porta 3777 e painel construído com `vite build --outDir` na pasta de trabalho (sem tocar em `apps/web/dist`), servido por `vite preview` na 4777. axe-core 4.10.2 instalado SÓ na pasta de trabalho (`axe/`), injetado pelo Playwright do repositório; regras WCAG 2.0 e 2.1, níveis A e AA. O produto em `3ce67c7` é o de `4ce0433` (`git diff 4ce0433 HEAD -- dc360` vazio); desde `bb0f654` o painel só mudou em `busca/pontuador.ts`.

## Critérios verificados

Critérios da etapa que tocam acessibilidade: "Frontend: `http.ts` trata `sessao_encerrada` como sessão morta e `conta_desativada` com aviso próprio na tela de entrada", o E2E ("desativar um usuário e ver a próxima chamada dele levar à tela de entrada com a frase certa") e o portão visual da seção 0 de `19` (foco visível, contraste AA, estado nunca só por cor). As três frases foram produzidas de verdade (sem interceptar o servidor) e a tela foi navegada só pelo teclado.

| Item WCAG 2.1 AA | Resultado | Prova |
| --- | --- | --- |
| 1.1.1 ícone do aviso fora da árvore | OK nas três | `saidas/10`: svg com `aria-hidden="true"` |
| 1.3.1 e 4.1.2 papéis: expirou e encerrada `role="status"`, desativada `role="alert"` | OK | `saidas/10` e `saidas/11` (Firefox) |
| 1.4.1 estado nunca só por cor | OK | tom, ícone e frase em negrito; capturas abaixo |
| 1.4.3 contraste, claro e escuro | OK | axe sem violação nos dois temas, nas três situações (`saidas/10`, `saidas/11`); único nó "incompleto" é a sigla "DC" (`aria-hidden`, logotipo sobre gradiente) |
| 1.4.10 reflow 320 px (400%) e 640 px (200%) | OK | sem rolagem horizontal; aviso de x 32 a 288 em 320 px; `a11y-entrada-desativada-320-escuro.png` |
| 2.1.1 a escrita que derruba a sessão feita pelo teclado | OK | Minha conta, campos digitados e Enter (encerrada) |
| 2.4.3 ordem do Tab na entrada | OK | email, senha, Entrar, "Esqueceu a senha?", "Quero conhecer", nas três situações e nos dois motores |
| 2.4.7 foco visível | OK | anel em "Quero conhecer" na captura de 320 px |
| 3.3.1 e 4.1.3 recusa da entrada com conta desativada | OK | `role="alert"` "Email ou senha inválidos.", igual à de email inexistente; foco fica no campo |
| 4.1.3 anúncio da frase ao chegar | não verificável por agente | ver Não verificado |

## Evidência

- `npx vitest run` em `apps/web`: 44 arquivos, 669 de 669, código 0 (`saidas/01-vitest-web-completo.txt`). Recorte de acessibilidade, foco, Modal, Toast, sessão e entrada (11 arquivos, `--reporter=verbose`): 209 de 209, código 0 (`saidas/02-vitest-a11y-verbose.txt`); inclui "Contraste AA calculado a partir dos tokens" nos dois temas e os 7 casos da E05 em `sessao-e-entrada.test.ts`.
- `node sondas/sonda-e05.mjs` (Chromium): 29 de 29, código 0 (`saidas/10-sonda-e05-chromium.txt`). `MOTOR=firefox`: 29 de 29, código 0 (`saidas/11-sonda-e05-firefox.txt`).
- E2E do repositório contra o meu par recém-semeado: `node test/fluxo-api.e2e.mjs` (Chromium) "Passou: 288 Falhou: 0, Zero erro de console", código 0 (`saidas/20-fluxo-api-e2e-chromium.txt`); a seção 23 (sessão encerrada, conta desativada e renovação recusada, 23c) passa inteira.
- Capturas desta rodada (em `capturas/`): `a11y-entrada-expirou-1280-claro.png`, `a11y-entrada-expirou-1280-escuro.png`, `a11y-entrada-encerrada-1280-claro.png`, `a11y-entrada-encerrada-1280-escuro.png`, `a11y-entrada-desativada-320-escuro.png` (olhada: aviso de perigo com ícone, frase inteira em 5 linhas dentro da caixa, anel de foco visível), `a11y-entrada-desativada-640-claro.png`.

## Cenários positivos

- Sessão expirada (os dois tokens corrompidos no navegador, tela relida): "Sua sessão expirou...", `role="status"`, ícone mais texto.
- Sessão encerrada pela administradora pela API; a escrita seguinte (trocar senha em Minha conta, só teclado) leva à entrada com "Sua sessão foi encerrada...", `role="status"`.
- Conta desativada pela administradora; o token de acesso vence; a renovação devolve `conta_desativada` e a entrada mostra "Sua conta foi desativada...", `role="alert"`.
- Nos três casos o primeiro Tab cai no email e a ordem segue senha, Entrar, links; axe sem violação nos dois temas.

## Cenários negativos

- Entrar de novo com a conta desativada: recusa genérica "Email ou senha inválidos." em `role="alert"`, sem revelar o estado da conta; o foco fica no campo de senha (não cai em `BODY`).
- 320 e 640 px nos dois temas: nada fora da tela, nada cortado.
- Firefox: as mesmas 29 verificações, mesmo resultado.

## Tentativas de reprovar

1. Rodei axe-core (que a rodada anterior não tinha) nas três situações, nos dois temas e nos dois motores, procurando contraste, nome acessível, papel e ARIA inválido: zero violação. Os "incompletos" são a sigla decorativa sobre gradiente.
2. Tentei achar a frase da entrada fora do alcance do leitor (svg com texto, pseudo-elemento, `aria-hidden` no aviso): a frase é texto do DOM dentro do aviso; só o ícone está oculto.
3. Produzi a sessão encerrada por uma escrita real feita só pelo teclado, em vez de forjar o estado da rota, para pegar o caminho que o usuário percorre.
4. Tentei o oráculo de enumeração pela interface: a recusa de entrada da conta desativada é a mesma frase e o mesmo papel da senha errada.
5. Conferi se a correção 4 (`9111fe4`, catálogo de 10 códigos) mudou alguma frase ou ação do painel: os quatro códigos novos têm ação `nenhuma`; o painel não mudou desde `bb0f654` (só `busca/pontuador.ts`), e as três frases e papéis são os mesmos.

## Achados

- Anotado (fora do critério da etapa, mecanismo do roteador anterior à fase): depois do redirecionamento para `/entrar` o foco fica em `BODY` nos três casos (a tela de entrada não tem `#conteudo`, alvo de `TrocaDeTela`). O primeiro Tab cai no email, como numa carga de página nova. Para leitor de tela, o anúncio depende de a região `role="status"` (expirou, encerrada), inserida já com o texto, ser lida. Dono natural: V2-F10-E11 (foco em troca de rota).
- Motivo do veredito da rodada 4 (o teste de catálogo não mordia código novo; README e cabeçalho do catálogo prometiam mais do que o teste prendia) não toca acessibilidade: a correção 2 da E05 mudou catálogo, varredura e documentação, sem mudar a tela. Nada a dizer sobre ele nesta dimensão além de que a tela não regrediu.

## Não verificado

- Anúncio real por VoiceOver, NVDA ou TalkBack das três frases ao chegar na entrada: as regiões `role="status"` entram no DOM com a página e já com o texto, e leitores de tela nem sempre anunciam região viva inserida com conteúdo. Só uma pessoa com leitor de tela confirma.
- WebKit no teclado: o WebKit do Playwright no macOS não leva o Tab a botões e links (comportamento do motor, registrado na própria E09); usei Chromium e Firefox.
- Zoom pela interface do navegador: reproduzido por reflow equivalente (320 e 640 px de largura CSS).
- O texto das frases como conteúdo de produto (aprovação do Rafael), fora desta dimensão.

## Risco residual

Baixo. Se um leitor de tela não anunciar a frase `role="status"` montada com a página, a pessoa ainda a encontra como primeiro conteúdo depois do título; a de conta desativada é `role="alert"`.

## Motivo do humano

Leitor de tela (VoiceOver no Safari, NVDA no Chrome): confirmar que as três frases são lidas ao chegar na entrada. É o limite da seção 4 de `28`: o agente não substitui leitor de tela nem pessoa com deficiência.
