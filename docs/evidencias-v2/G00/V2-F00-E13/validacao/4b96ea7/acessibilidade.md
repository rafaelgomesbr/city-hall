---
validador: acessibilidade
modelo: claude-sonnet-5-5
etapa: V2-F00-E13
sha_validado: 4b96ea7
ci_run: 38445527075
rodada: 2
herdado_de:
tags: [UI, A11Y, AUTH]
nivel_de_prova_exigido: [E1, E2]
nivel_de_prova_obtido: [E1, E2]
veredito: PASS
confianca: media
humano_necessario: sim
escalar: F10-E11
---
Escopo de acessibilidade da E13: (a) o `Toast` de confirmação em Usuários, Equipes e Órgãos; (b) a rota índice e a entrada a partir de `/`; (c) o portão de acessibilidade reescrito para ler o bloco de comentário contíguo; (d) por herança da correção da E09, a barra do pé a 390 px (onze itens, ladrilhos), o sino ancorado e o rodapé da janela. Nada herdado da rodada 1. SHA 4b96ea7, API real (3891), painel do SHA (4891), Chromium. `axe` ausente (não existe em `node_modules`; nada instalado). Pasta: `C:/Users/Rfasg/AppData/Local/Temp/claude/c--Projetos-city-hall/b62645e7-c436-45b4-8ce0-4d68f4fb420f/scratchpad/a11y/` (`a11y/`).

## Critérios verificados

1. Portões estáticos (E1): `acessibilidade.test.ts` 21 de 21 (`a11y/vitest-a11y-base.txt`); seis arquivos de portão 103 de 103 (`a11y/vitest-6-limpo.txt`); quinze arquivos de painel 260 de 260 (`a11y/vitest-15-limpo.txt`, inclui `semente-e-confirmacoes`, `design-system`, `sessao-e-entrada`, `toast`).
2. O portão MORDE no caso da etapa (prova por planta, arquivo temporário `apps/web/src/paginas/ZZValidadorA11y2.tsx`, apagado depois de cada rodada; `git status` limpo):
   - planta 1, `<div onClick>` sem exceção e sem teclado: `acessibilidade.test.ts` reprovou "nenhum onClick pendurado em elemento que o teclado não alcança" (1 falha, 102 passam; `a11y/planta1-div-onclick.txt`). Cumpre o teste negativo da etapa.
   - restaurado: arquivo removido, 103 de 103.
3. O portão NÃO morde em quatro formas (achados 1 a 3), todas com planta e saída arquivada:
   - planta 2, `<span>oi</span> {/* acessibilidade: excecao: so para enganar */}` na linha acima de `<div onClick>`: 103 de 103, verde com a violação (`a11y/planta2-furo-comentario-na-linha-de-codigo.txt`). O furo da rodada 1 continua aberto, sem nenhuma mudança em `comentarioAcima` (o diff `7005a60..4b96ea7` do teste só adiciona casos de CSS).
   - planta 4b, `<h3 onClick>` e `<svg onClick>` sem teclado: 21 de 21 (`a11y/planta4b-h3-svg.txt`). `NAO_INTERATIVOS` só cobre `div|span|li|section|article|p|tr|td|ul|ol|header|footer|figure|img`.
   - planta 5, `onClick` em linha seguinte a um atributo que contém `=>` (`data-x={() => 1}` na linha de cima): 103 de 103 (`a11y/planta5-seta-antes-do-onclick.txt`). `elementos()` encerra a junção na primeira linha que contém `>`, e o `=>` conta.
   - planta 6, `<button><svg/></button>` sem nome, `<input type="text">` sem rótulo, `<a href="#x"></a>` vazio: 103 de 103 (`a11y/planta6-botao-sem-nome-input-sem-rotulo.txt`). Nenhum portão do painel pega botão ou link sem nome acessível (só `<label>` fora de `Campo`).
   Hoje só há duas exceções declaradas no código (`BuscaGlobal.tsx:154`, `Modal.tsx:254`), ambas legítimas e em comentário contíguo; nenhum `onClick` em `h1..h6`, `svg`, `label`, `a` ou `nav` no código. Os furos são só de quem quiser (ou errar) no futuro.
4. Toast (4.1.3, 2.2.1, 2.5.8): `role="status"` e `aria-live="polite"` presentes; texto "Usuário cadastrado. Ele já aparece na lista abaixo." mais botão "Fechar" (`a2.log`). A região NÃO é pré-montada: é inserida já com o texto (achado 4). Foco permanece no botão que gravou. O outro agente mediu as seis frases em 1280, 768, 390 e 320 px, claro e escuro, `role="status"`, acima da barra com folga de 15 px e fundo opaco (`web/RELATORIO.md`, T1). Com `prefers-reduced-motion` o Toast e a janela ficam com `animation-name: none` e duração de 0,01 ms (`a4.log`).
5. Erro de formulário em Usuários (3.3.1): enviar vazio põe `aria-invalid` nos quatro campos, `aria-describedby` apontando para `usuario-*-erro` com `role="alert"`, e o foco no primeiro campo (`usuario-nome`) (`a2.log`).
6. **Barra do pé a 390, 360 e 320 px** (pedido: "o Tab precisa alcançar e mostrar os dez itens"): a barra tem onze itens para a administradora (Painel, Ocorrências, Mapa da cidade, Quem está em campo, Equipes, Órgãos de destino, Usuários, Prestação de contas, Organização, Tema escuro, Sair). O primeiro Tab cai em "Pular para o conteúdo" nas três larguras; o Tab alcança os 11 itens; cada item focado fica inteiro dentro da barra (esquerda e direita da barra), sem rótulo cortado (`scrollWidth <= clientWidth` do `.lateral__texto`) e com altura de 44 px ou mais; 0 problema nas três larguras (`a11y/a2.log`, bloco "E13 barra do pé"). Capturas ao fim do Tab: `a11y/capturas/e13-barra-390-fim-do-tab.png`, `-360-`, `-320-`.
7. Entrada a partir de `/` (2.4.2, 2.4.3): sem sessão `/` leva a `/entrar`; entrando, o destino por papel (Painel para a coordenadora, Meu trabalho para o agente) e o foco na região de conteúdo (`MAIN#conteudo`); entrada só por teclado (Tab, texto, Tab, texto, Enter) chega ao painel (outro agente, T1, três motores). O `<title>` muda por tela ("Painel · Defesa Civil 360").
8. Contraste AA, claro e escuro, 1280, 390 e 320 px, de Usuários, Equipes, Órgãos, Painel e entrada (`a1.log`): zero texto abaixo de AA (avatar e sigla em gradiente são falsos positivos, medidos à mão acima de 6:1), zero controle sem nome, zero campo sem rótulo, zero `id` duplicado, cabeçalhos sem salto. Alvos: abaixo de 24 px só os links de protocolo da tabela do Painel (92x19, cada um numa linha alta, passam pela exceção de espaçamento de 2.5.8), e abaixo de 44 px a 390 px só esses links e o logotipo (40x44).
9. Foco visível: anel de duas camadas, 6,61:1 e 6,75:1; em Alto Contraste vira `outline: solid 3px` (`a4.log`).
10. Reflow (1.4.10): 640x450 css a 2x e 320 css a 4x de Usuários, Equipes e Órgãos, sem rolagem horizontal da página; as tabelas rolam dentro do próprio contêiner (permitido para dados tabulares). Espaçamento de texto aumentado (1.4.12) em Usuários a 390: nada cortado (`a4.log`). A observação do outro agente (Órgãos a 320 px, "Mostrar desativados" passando 15 px da caixa do cartão, ainda dentro do respiro) não afeta a rolagem da página; não a reproduzi como falha de acessibilidade.
11. Sino e janela (herança da correção): sino ancorado na tela até 600 px e rodapé da janela empilhado (portões estáticos verdes, `acessibilidade.test.ts`; capturas do outro agente `E09-janela-*` e `E13-*`).

## Evidência

`a11y/a2.log`, `a11y/a1.log`, `a11y/a4.log`, `a11y/vitest-a11y-base.txt`, `a11y/vitest-6-limpo.txt`, `a11y/vitest-15-limpo.txt`, `a11y/planta1-div-onclick.txt`, `planta2-furo-comentario-na-linha-de-codigo.txt`, `planta3-comentario-solto-apos-codigo.txt` (planta mal posta, o comentário ficou duas linhas acima; não conta), `planta4-h3-svg-label-onclick.txt` (reprovou só por `<label>` fora de `Campo`, outro portão), `planta4b-h3-svg.txt`, `planta5-seta-antes-do-onclick.txt`, `planta6-botao-sem-nome-input-sem-rotulo.txt`. Capturas: `a11y/capturas/e13-barra-*-fim-do-tab.png`. Tudo em `C:/Users/Rfasg/AppData/Local/Temp/claude/c--Projetos-city-hall/b62645e7-c436-45b4-8ce0-4d68f4fb420f/scratchpad/a11y/`.

## Cenários positivos

Confirmações anunciadas por `role="status"` em Usuários (cadastro e correção); Tab alcança e mostra os 11 itens da barra nas três larguras; entrar a partir de `/` leva à tela do papel; o portão reprova o clique só de mouse no caso simples.

## Cenários negativos

`<div onClick>` sem exceção reprova (planta 1). Sem sessão a rota índice cai em `/entrar`. Erro de formulário em Usuários com foco no primeiro campo inválido e `role="alert"` ligado ao campo.

## Tentativas de reprovar

- Cinco plantas no portão (ver critérios 2 e 3): uma reprovada, e três furos além do furo da rodada 1 (comentário em linha de código). Todas desfeitas, `git status` sem nada fora de `validacao/4b96ea7/`.
- Procurei região viva pré-montada para o Toast: não existe (achado 4).
- Procurei o foco ao fechar o Toast com Enter e a posição do Toast no Tab (r1 achou 15 paradas): o foco não vai a `BODY` ao gravar (permanece no botão), mas o botão "Fechar" fica no fim do `main`.
- Tab pelos onze itens da barra em 390, 360 e 320 px com rótulo cortado ou ladrilho pela metade: nenhum.
- Alvo menor que 24 e contraste fraco em Usuários, Equipes e Órgãos: nenhum (o checkbox de Órgãos fica dentro de rótulo de 44 px).
- Reflow a 320 e a zoom de 200 por cento: sem rolagem da página.
- `prefers-reduced-motion` no Toast: coberto.

## Achados

1. corrige antes de crescer: furo do portão de exceção (planta 2), o mesmo achado 2 da rodada 1, sem nenhuma mudança: o leitor `comentarioAcima` aceita a marca "acessibilidade: excecao" escrita em comentário que divide a linha com o código de OUTRO elemento. A etapa pede "bloco de comentário contíguo": esse caso não é bloco contíguo. Correção: exigir que a linha que abre o comentário contenha só comentário.
2. corrige antes de crescer: `NAO_INTERATIVOS` deixa fora `h1` a `h6`, `svg`, `a` sem `href`, `label`, `nav`, `main`, `aside`, `form`, `th`, `tbody` e componentes (`<Cartao onClick>`), e a junção de linhas de `elementos()` encerra no `>` de uma seta (`=>`). Planta 4b e planta 5 verdes com violação.
3. corrige antes de crescer: nenhum portão estático do painel reprova `<button>` ou `<a>` sem nome acessível nem `<input>` sem rótulo (planta 6); nome acessível e rótulo de campo são regras do perfil de acessibilidade do projeto (toda imagem com alternativa, todo campo com rótulo) e hoje só são pegos por revisão humana ou pelo auditor de DOM deste relatório. Fora do escopo da E13, mas é a razão de a etapa dizer que o portão "ainda reprova um `onClick` sem exceção" e não dizer mais que isso.
4. corrige antes de crescer (dono F10-E11, "região anunciante única" e `useAnunciar()`): o Toast monta a região `role="status"` já com o texto, igual à rodada 1. A região ideal existe vazia e recebe o texto depois (4.1.3). Sem leitor de tela não declaro falha.
5. anotado: o Toast fica a 15 paradas de Tab do formulário porque mora no fim do `main`; como a confirmação também está dita na lista (a linha nova aparece), a perda é pequena.

Nenhum item bloqueia a etapa: o que a E13 prometeu (Toast com `role="status"`, barra completa por Tab, entrada a partir de `/`, portão que lê o bloco de comentário e ainda reprova clique só de mouse) foi provado. Os achados 1 a 3 exigem intenção de contorno ou erro futuro, e hoje não há violação escondida pelo portão.

## Não verificado

- Leitor de tela real (NVDA, JAWS, VoiceOver, TalkBack): nenhum.
- Equipes e Órgãos gravando de fato no navegador (o outro agente fez as seis frases em T1; eu exercitei só Usuários), e a barra em Firefox e WebKit nas minhas sondas (o outro agente repetiu T1 nos três motores).
- Toast com o cursor ou o foco parados para pausar o relógio (2.2.1): a rodada 1 mediu o foco pausando; eu não repeti.
- Safari e VoiceOver reais.

## Risco residual

Anúncio do Toast por leitor de tela não provado. Portão de acessibilidade contornável por quem escrever exceção em linha de código, em tag fora da lista ou com seta antes do `onClick`; sem portão para botão sem nome.

## Motivo do humano

Leitor de tela real (CP-32) para ouvir o Toast e a ordem de leitura da barra do pé; e decisão de produto sobre a barra de onze itens que ainda rola na horizontal (menu "mais" ou abas, F10).
