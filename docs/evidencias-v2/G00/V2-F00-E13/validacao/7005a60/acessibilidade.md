---
validador: acessibilidade
modelo: claude-sonnet-5-5
etapa: V2-F00-E13
sha_validado: 7005a60cd70b30a4f455a96a64c4d7a3abb2819f
ci_run: 37739535524
rodada: 1
herdado_de:
tags: [UI, A11Y, AUTH]
nivel_de_prova_exigido: [E1, E2]
nivel_de_prova_obtido: [E1, E2]
veredito: PASS
confianca: media
humano_necessario: sim
escalar: nenhum
---
Escopo de acessibilidade: (a) o `Toast` de confirmação em Usuários, Equipes e Órgãos; (b) a rota índice e a entrada a partir de `/`; (c) o portão de acessibilidade (`acessibilidade.test.ts`) reescrito para ler o bloco de comentário inteiro. Base: HEAD 665b2be (só STATUS difere de 7005a60). Sondas contra API real e painel real do SHA (portas 3791 e 4791, Chromium); servidores derrubados ao fim e nada gravado no repositório.

## Critérios verificados

1. Testes: 9 arquivos de `apps/web/test` (inclui `acessibilidade`, `foco`, `toast`, `modal`, `semente-e-confirmacoes`, `design-system`, `sessao-e-entrada`): 143 testes, 0 falhas (`scratchpad/acess/vitest.txt`). `fluxo.e2e.mjs` em Chromium: 70 de 70, zero erro de console, com o atalho de pular, o Tab da lateral e "entrar a partir de /" (`e2e-local.txt`). O QA anterior rodou também Firefox e o e2e de API.
2. Portão de acessibilidade MORDE (prova por planta, arquivo temporário `src/paginas/ZZValidadorA11y.tsx`, apagado):
   - Planta 1: `<div onClick>` sem exceção e `<img>` sem `alt`: `acessibilidade.test.ts` reprovou 2 casos ("nenhum onClick pendurado..." em `ZZValidadorA11y.tsx:4`, e "toda imagem tem texto alternativo" em `:5`), código 1 (`plantado1.txt`).
   - Planta 2: marca "acessibilidade: excecao" escrita num comentário no fim da linha de OUTRO elemento, logo acima de um `<div onClick>`: o portão PASSOU (18 de 18), ou seja, aprovou o clique só de mouse (`plantado2.txt`). Achado 2.
   - Depois de cada planta: arquivo removido, `git status --porcelain` sem nada fora de `validacao/`.
3. Região viva do Toast (4.1.3): `role="status"` e `aria-live="polite"` presentes (`sonda-e13.txt`: `toastRole: status`, `live: polite`). A região NÃO é pré-montada: a página tinha antes só o sino (`status: Avisos, 3 por ler`) e uma região vazia de outra origem; o `.toast` foi inserido com o texto já dentro ("Cadastro corrigido. A lista abaixo já mostra o que mudou."), nas duas vezes seguidas. Prova estrutural sim, prova de anúncio não (achado 1).
4. Foco e teclado (2.1.1, 2.4.3, 2.2.1): o botão "Fechar" do toast mede 64x44 px (2.5.8 ok), é alcançado por Tab (15 paradas a partir do formulário, porque o toast fica no fim do `main`), o relógio pausa com o foco dentro (após 7 s, mais que os 6 s da duração, o toast seguia na tela) e Enter fecha. A confirmação também é dita na própria tela ("a lista abaixo já mostra o que mudou"), então o toast não é o único portador (2.2.1 sem perda de informação).
5. Contraste AA do toast, claro e escuro (1.4.3): auditoria de DOM com o toast aberto, zero texto abaixo do mínimo nos dois temas (`sonda-e13.txt`). O toast tem fundo opaco (comentário em `app.css`), então no escuro a tinta de 12 por cento não deixa o texto da página atravessar.
6. Entrada a partir de `/` (2.4.2, 2.4.3): sem sessão, `/` leva a `/entrar` sem passar por "Esta página não existe"; entrando com Enter no campo de senha, vai a `/painel`, título "Painel · Defesa Civil 360", foco em `MAIN#conteudo` (a rota focaliza o conteúdo); com sessão, `/` desvia para `/painel` com `h1` "Painel operacional". A ordem de Tab no painel é "Registrar ocorrência", depois os indicadores, na ordem visual (`sonda-entrada.txt`).
7. Auditoria de DOM de `/usuarios`, `/equipes`, `/orgaos` e `/entrar` nos dois temas: zero contraste abaixo de AA, zero controle sem nome, zero campo sem rótulo, zero `id` duplicado, hierarquia `h1` > `h2` sem pulo. Único alvo abaixo de 24 px: o checkbox de 20x20 em `/orgaos`, que fica dentro de um `label` de 44 px de altura (a área de clique inteira é o rótulo), então não reprova 2.5.8 na prática; não é código desta etapa.
8. `Estrutura.tsx` (raio do `.lateral__marca` virou token): sem efeito de acessibilidade observável; `design-system.test.ts` verde.
9. Movimento: `prefers-reduced-motion` coberto pelo teste existente; não medi o toast com a preferência ligada (ver "Não verificado").

## Evidência
`C:/Users/Rfasg/AppData/Local/Temp/claude/c--Projetos-city-hall/78869014-3ace-4efd-a059-e24f265aea3c/scratchpad/acess/`: `vitest.txt`, `e2e-local.txt`, `plantado1.txt`, `plantado2.txt`, `sonda-e13.txt`, `sonda-entrada.txt`, `sonda-foco.txt`; scripts em `acess/sonda/`. Capturas do SHA do outro agente: `scratchpad/g00/capturas-ux/e13-*` (`ux.md`). `@axe-core/playwright` não existe em `node_modules`: não usado.

## Cenários positivos
Entrar pela raiz leva à tela do papel; confirmação de gravação aparece em Usuários (cadastro e correção, 2 vezes seguidas); o toast pausa com foco, fecha por teclado e é legível nos dois temas.

## Cenários negativos
Sem sessão, `/` não concede nada e cai em `/entrar`; o portão reprova clique só de mouse e imagem sem texto alternativo (planta 1); o QA registrou a recusa de `//outro.exemplo`, esquema e `/entrar` em `rotaInterna`.

## Tentativas de reprovar
- Plantei violação em arquivo temporário (duas formas) e apaguei: uma reprovada, uma passou (achado 2).
- Procurei região viva pré-montada para o Toast: não existe (achado 1).
- Olhei para onde vai o foco ao fechar o toast com Enter: vai a `BODY`, sem voltar ao ponto de onde a pessoa veio (achado 3).
- Procurei alvo menor que 24x24, contraste fraco, rótulo faltando, hierarquia de cabeçalho com salto, `id` duplicado em Usuários, Equipes, Órgãos e entrada: só o checkbox de Órgãos, já explicado.
- Verifiquei se o toast tapa a barra inferior no celular: o teste estático `o aviso passageiro não cai em cima da barra de navegação` passa; a captura do implementador (`usuarios-confirmacao-390-escuro.png`, lida pelo QA) confere.

## Achados
1. corrige antes de crescer (dono F10-E11, que traz a "região anunciante única" e `useAnunciar()`): o Toast monta a região `role=status` já com o texto. Quem implementou a E13 deu a prova estrutural que a etapa pedia ("confirmações anunciadas por role=status"), mas a prática recomendada é a região existir vazia e receber o texto depois; a anunciação de região inserida com conteúdo é inconsistente em leitores de tela (4.1.3). Reprodução: `sonda-e13.txt`, linha "apos salvar", `log: ins status[toast] texto-ao-inserir="Cadastro corrigido..."`. Sem leitor de tela não declaro falha, só que a prova do anúncio não existe. Concorda com a anotação do QA.
2. corrige antes de crescer: o portão reescrito aceita a marca de exceção em comentário que está na linha de código de outro elemento. `comentarioAcima` lê a linha acima e, se ela termina em `*/` ou `*/}`, sobe até achar `/*` na MESMA linha de código; um `<span>oi</span> {/* acessibilidade: excecao ... */}` imediatamente antes de um `<div onClick>` isenta o `div`. Reprodução: `plantado2.txt` (18 de 18 verdes com a violação presente). O caso do enunciado da etapa (o `onClick` sem exceção reprova) segue valendo e a planta 1 prova isso; o furo é de quem quiser contornar, e a regra diz "comentário contíguo acima do elemento". Correção: exigir que a linha que abre o comentário seja só comentário.
3. anotado: ao fechar o toast com Enter, o foco cai em `BODY` (o elemento focado deixa de existir) e o toast fica a 15 paradas de Tab do formulário. Como o aviso some sozinho e a confirmação também está na tela, a perda é pequena; pode entrar na F10-E11 junto com o anúncio.
4. anotado: `Equipes` e `Orgaos` foram checados pelo teste estático e pela auditoria de DOM da página, não gravando de fato no navegador (só Usuários foi exercitado).

Nenhum item bloqueia a etapa.

## Não verificado
- Leitor de tela real (NVDA, JAWS, VoiceOver, TalkBack): nenhum; o anúncio do toast e do "foco no conteúdo" depois do login são tarefa humana.
- Toast de Equipes e Órgãos gravando no navegador; toast com `prefers-reduced-motion`; Alto Contraste (só teste estático); zoom de 200 por cento, 320 e 768 px no painel; WebKit.
- Firefox nas minhas sondas (o e2e local e o de API do QA cobrem).
- A validação humana da etapa (Rafael digita só o domínio e entra).

## Risco residual
Anúncio do toast por leitor de tela não provado; furo do portão para quem escrever exceção em comentário de fim de linha.

## Motivo do humano
Uma pessoa com leitor de tela confirma se a confirmação de gravação é ouvida nas três telas e se o foco no `main` depois da entrada pela raiz é compreensível. Fica pendente, não bloqueia.
