---
validador: acessibilidade
modelo: claude-sonnet-5-5
etapa: V2-F00-E09
sha_validado: 4b96ea7
ci_run: 38445527075
rodada: 2
herdado_de:
tags: [UI, A11Y, AUTH, API]
nivel_de_prova_exigido: [E1, E2]
nivel_de_prova_obtido: [E1, E2]
veredito: FAIL
confianca: media
humano_necessario: sim
escalar: nenhum
---
Escopo de acessibilidade da E09: `Usuarios.tsx` (botões "Redefinir senha" e "Encerrar sessões" por linha, diálogo `ConfirmarAcao`, janela "Senha temporária", Toast), `MinhaConta.tsx` (`MinhasOutrasSessoes`), e a correção de layout (rodapé do diálogo, barra do pé, sino). A DoD da etapa diz: "confirmação anunciada por `role=status`, foco devolvido ao botão, ícone mais texto". Esta etapa não teve relatório de acessibilidade na rodada 1 (só QA, UX e outros); tudo abaixo é prova nova. Nada herdado. SHA 4b96ea7, API real na porta 3891, painel do SHA na 4891, Chromium. `axe` ausente (`@axe-core/playwright` e `axe-core` não existem em `node_modules`; nada instalado). Pasta: `C:/Users/Rfasg/AppData/Local/Temp/claude/c--Projetos-city-hall/b62645e7-c436-45b4-8ce0-4d68f4fb420f/scratchpad/a11y/` (`a11y/`).

## Critérios verificados

1. Portões estáticos (E1): `acessibilidade.test.ts` 21 de 21 (`a11y/vitest-a11y-base.txt`); seis arquivos de portão (`acessibilidade`, `portoes-de-componente`, `formularios`, `foco`, `modal`, `toast`) 103 de 103 no estado limpo (`a11y/vitest-6-limpo.txt`); quinze arquivos de painel ligados a E05, E09, E10, E11 e E13 (os seis mais `sessoes-e-senha-temporaria`, `seguranca-da-conta`, `recuperar-senha`, `recuperar-senha-e-sessao`, `semente-e-confirmacoes`, `design-system`, `sessao-e-entrada`, `pacote-de-saida`, `devolucao`) 260 de 260 (`a11y/vitest-15-limpo.txt`). Os testes novos da correção de layout (rodapé da janela quebra e empilha, barra em ladrilhos, sino ancorado) estão dentro dos 21.
2. Diálogos por teclado (`a11y/a2.log`), nos três gatilhos (Redefinir senha, Encerrar sessões, Encerrar minhas outras sessões) e em Desativar usuário (E05, mesmo `Modal`):
   - `role="dialog"` com nome acessível via `aria-labelledby`, `aria-modal="true"`, e o `#root` atrás com `aria-hidden="true"` e `inert`.
   - Foco inicial em "Cancelar" (não no botão que grava): correto para ação destrutiva.
   - 10 Tab e 10 Shift+Tab: o foco nunca sai da janela (0 fugas nos três).
   - Esc fecha, e o foco volta ao botão que abriu (marcado por atributo antes de abrir): OK nos três. Cancelar também devolve o foco ao gatilho (provado em Redefinir senha).
3. Janela "Senha temporária": `role="dialog"` com nome, foco inicial em "Copiar senha", Tab preso (8 passos, 0 fugas). A frase "Anote agora..." está num aviso `role="status"`. "Copiar senha" escreve "Senha copiada." numa região PRÉ-MONTADA `role="status" aria-live="polite"` (`a3.log`: antes texto vazio, depois " Senha copiada."), com o foco mantido no botão: o jeito certo. A senha é um `<p>` em fonte mono com `user-select: all`, sem papel estranho. Esc fecha a janela e a senha some (observado também pelo outro agente); o clique fora não fecha. O foco, ao fechar, volta ao gatilho.
4. Toast ao encerrar sessões: `role="status"` e `aria-live="polite"`, texto "Sessões de Diego Nakamura Alves encerradas. 1 sessão caiu." mais botão "Fechar". Foco permanece no botão "Encerrar sessões" da linha (não vai a `BODY`). A contagem da janela ("Conferindo quantas sessões estão abertas." vira "... tem 1 sessão aberta...") é uma região `role="status"` pré-montada que recebe o texto depois: correto.
5. Contraste AA, nos dois temas, de Usuários e Minha conta a 1280, 390 e 320 px (`a1.log`): zero texto abaixo de AA (a única linha do auditor, o avatar de iniciais, é gradiente medido à mão: branco sobre `#5B21B6` no claro e `#101519` sobre `#A78BFA` no escuro, acima de 6:1). Zero controle sem nome, zero campo sem rótulo, zero `id` duplicado, cabeçalhos sem salto, `lang="pt-BR"`.
6. Alvo de toque (a 390 px, `a1.log`): todos os controles de Usuários e Minha conta com 44 px ou mais, inclusive o botão do rodapé da janela (empilhado, largura inteira). Única exceção na página, o link do logotipo "Início, Defesa Civil 360" com 40x44 (passa 2.5.8, 24 px).
7. Reflow e zoom (1.4.10): Usuários e Minha conta a 640x450 css com DPR 2 (zoom de 200 por cento) e 320 css com DPR 4: sem rolagem horizontal da página (`a1.log`, 16 verificações OK). A tabela de Usuários (918 px) rola dentro do próprio contêiner, que é o caso permitido (tabela de dados). Espaçamento de texto aumentado (1.4.12: line-height 1,5, letter-spacing 0,12 em, word-spacing 0,16 em, parágrafo 2 em) na janela a 390 px: nada cortado, botões dentro da janela (`a4.log`).
8. Foco visível (2.4.7): anel de duas camadas, 6,61:1 no claro e 6,75:1 no escuro contra a página; em `forcedColors: active` vira `outline: solid 3px` (`a4.log`).
9. Movimento reduzido (`prefers-reduced-motion: reduce`): janela e Toast com `animation-name: none` e duração de 0,01 ms (`a4.log`).
10. Barra do pé e sino da correção de layout: ver E13 (a barra a 390, 360 e 320 px alcança 11 itens por Tab, todos inteiros e com 44 px).

## Evidência

`a11y/a2.log` (diálogos, Toast, regiões vivas, foco), `a11y/a3.log` (Copiar senha), `a11y/a1.log` (auditoria e reflow), `a11y/a4.log` (foco, Alto Contraste, movimento, 1.4.12), `a11y/dbg3.mjs` (reprodução do achado 1). Capturas: `a11y/capturas/e09-dialogo-redefinir.png`, `e09-dialogo-senha-temporaria.png`, `e09-dialogo-encerrar.png`, `e09-dialogo-espacamento-390.png`, `e09-minha-conta-depois.png`; do outro agente `web/capturas/E09-janela-*` e `E09-minha-conta-*` (1280, 768, 390, 320, dois temas).

## Cenários positivos

Três diálogos presos ao foco, Esc fecha, foco volta ao gatilho; Toast com `role="status"`; resultado da cópia em região pré-montada; contagem de sessões em região pré-montada; foco com anel; reflow a 320 e a 200 por cento.

## Cenários negativos

Cancelar com botão e com Esc não grava nada e devolve o foco. Esc na janela da senha temporária fecha e a senha some da tela (não grava nada novo). Clique fora da janela da senha não fecha (`a2.log`, `web` T2).

## Tentativas de reprovar

- Executei 20 passos de Tab e Shift+Tab em cada diálogo, tentando sair da janela: 0 fugas.
- Procurei fundo inerte: `#root` com `aria-hidden` e `inert`.
- Procurei região viva montada já com o texto: o Toast e o aviso de Minha conta são inseridos com o texto dentro (achado 3); a contagem e a cópia são pré-montadas.
- Procurei perda de foco depois da confirmação: em Usuários o foco volta ao botão da linha; em Minha conta vai a `BODY` (achado 1, defeito).
- Procurei botões repetidos sem nome da pessoa: "Redefinir senha", "Encerrar sessões", "Corrigir", "Desativar" em cada linha, nome acessível igual ao texto visível (2.5.3 ok), sem a pessoa no nome (achado 4).
- Zoom de 200 por cento, 400 por cento e 1.4.12 na janela: nada cortado.
- Alto Contraste e movimento reduzido: cobertos.

## Achados

1. **FAIL (2.4.3, e a DoD "foco devolvido ao botão")**: em Minha conta, depois de confirmar "Encerrar minhas outras sessões", o botão que abriu a janela deixa de existir (`MinhasOutrasSessoes` só mostra o botão quando há outra sessão) e o foco cai em `BODY`; o teclado e o leitor de tela recomeçam do topo da página e a rolagem ainda volta (`y=-619` no retângulo do `BODY`). Reprodução: `a11y/dbg3.mjs` (duas sessões da Helena, Tab, Enter, confirmar): `botao ainda existe: 0 | foco: BODY`, e `a2.log` linha "depois de confirmar em Minha conta o foco não está em BODY" FALHA. O aviso `role="status"` aparece, mas quem usa teclado perde a posição. Conserto: mover o foco para o aviso de confirmação (com `tabIndex={-1}`) ou para o título da seção quando o botão sumir. O caso de Usuários (botão permanece) passa.
2. corrige antes de crescer (dono F10-E11): o Toast de Usuários e o aviso de Minha conta entram no DOM já com o texto (`a2.log`: `regiao-inserida` com texto). A região viva ideal existe vazia e recebe o texto depois; a anunciação de região inserida com conteúdo é inconsistente em leitor de tela (4.1.3). Sem leitor de tela não declaro falha.
3. anotado: a janela "Senha temporária" fecha com Esc e a senha única some (o clique fora é protegido, o Esc não). É decisão de produto; do lado de acessibilidade, Esc fechar é o esperado, e o texto da janela avisa que fechar sem anotar obriga a redefinir.
4. anotado: os botões por linha têm nome acessível igual ao texto visível e não dizem de quem são ("Redefinir senha" repetido). Cumpre 2.5.3 e 4.1.2; usuários de leitor de tela que listam botões ouvem a lista repetida. Melhoria possível: `aria-label` com o nome da pessoa começando pelo texto visível.

## Não verificado

- Leitor de tela real (NVDA, JAWS, VoiceOver, TalkBack): nenhum. O que é dito ao abrir cada janela, ao copiar a senha e ao receber o Toast não foi ouvido.
- Firefox e WebKit nas minhas sondas de foco e Esc (o outro agente repetiu T2 nos três motores sem diferença de resultado, inclusive a janela e a barra); Safari e VoiceOver reais.
- Mutação do portão estático sobre o componente `ConfirmarAcao`: o portão não tem regra de "foco devolvido", então não há como pegar o achado 1 por teste estático (nenhum teste do repositório cobre a perda de foco em Minha conta).

## Risco residual

Quem usa teclado em Minha conta perde a posição ao encerrar as outras sessões. Anúncio por leitor de tela do Toast e do aviso não provado.

## Motivo do humano

Leitor de tela real (CP-32) para confirmar o que é dito ao abrir as janelas, ao copiar a senha temporária e ao receber o Toast; e se a perda de posição em Minha conta incomoda na prática.
