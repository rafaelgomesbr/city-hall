---
validador: acessibilidade
modelo: claude-sonnet-5-5
etapa: V2-F00-E05
sha_validado: 7005a60cd70b30a4f455a96a64c4d7a3abb2819f
ci_run: 37739535524
rodada: 1
herdado_de:
tags: [UI, A11Y, AUTH, API]
nivel_de_prova_exigido: [E1, E2]
nivel_de_prova_obtido: [E1, E2]
veredito: PASS
confianca: media
humano_necessario: sim
escalar: nenhum
---
Escopo de acessibilidade desta etapa: as três frases mostradas na tela de entrada quando a sessão acaba (`Entrar.tsx`, componente `Aviso`), o erro de login e o diálogo de desativar conta. Régua: WCAG 2.2 AA; ordem de ataque teclado, contraste, rótulo, semântica, ARIA. Base: HEAD 665b2be (só STATUS difere de 7005a60). Toda sonda abaixo rodou contra API real e painel real construídos no SHA, em portas próprias (3791 e 4791), Chromium, e foi encerrada; nada foi gravado no repositório.

## Critérios verificados

1. Teste estático e de teclado do painel: `vitest run` de `acessibilidade`, `foco`, `toast`, `modal`, `sessao-e-entrada`, `formularios`, `semente-e-confirmacoes`, `design-system`, `paridade-dos-modos`: 9 arquivos, 143 testes, 0 falhas (`scratchpad/acess/vitest.txt`, código 0). `fluxo.e2e.mjs` (modo local, inclui "primeiro Tab cai no atalho de pular", "o atalho aparece ao receber foco", "todo item da lateral é alcançável por teclado"): 70 de 70, zero erro de console (`scratchpad/acess/e2e-local.txt`).
2. As três frases são anunciáveis e distintas (3.3.1, 4.1.3). Medido no DOM real depois de provocar cada motivo (`sonda-e05.txt`, `sonda-e05-expirou.txt`):
   - sessão encerrada (administradora encerra as sessões de Diego, ele faz a primeira escrita): `role=status`, texto "Sua sessão foi encerrada. Entre de novo...".
   - conta desativada (administradora desativa Jonas): `role=alert`, "Sua conta foi desativada. Entrar de novo não resolve: procure a coordenação do seu município...".
   - sessão expirou (respostas 401 `nao_autenticado` e renovação recusada, por interceptação de rota; o resto real): `role=status`, "Sua sessão expirou...".
   Cada aviso tem ícone mais texto (`aria-hidden` no ícone decorativo não se aplica: o ícone acompanha o texto), então a informação não depende só de cor (1.4.1).
3. Contraste AA das frases, medido em getComputedStyle com composição de transparência (`sonda-contraste.txt`):

| Aviso | Tema | Texto/ícone sobre o fundo do aviso | Borda sobre a página (mínimo 3:1) |
| --- | --- | --- | --- |
| expirou, encerrada (alerta) | claro | 6,37:1 | 6,60:1 |
| expirou, encerrada (alerta) | escuro | 8,98:1 | 11,41:1 |
| desativada (perigo) | claro | 4,75:1 | 5,08:1 |
| desativada (perigo) | escuro | 6,59:1 | 7,93:1 |

   Todos passam 4,5:1 (texto de 14 px). A margem menor é a do perigo claro (4,75:1). O auditor não é vazio: um parágrafo plantado com `#bbb` sobre branco foi reprovado a 1,92:1 na mesma varredura.
4. Auditoria de DOM nas telas de entrada com cada aviso, claro e escuro, 1280, 390 e 320 px (`sonda-e05.txt`): zero texto abaixo de AA, zero alvo menor que 24x24 (2.5.8), zero controle sem nome acessível, zero campo sem `label`, zero `id` duplicado, `lang="pt-BR"`, um único `h1`, título "Entrar · Defesa Civil 360", sem rolagem horizontal a 390 e 320 px (1.4.10).
5. Erro de login ligado ao campo (3.3.1, 1.3.1): com senha errada, `#entrada-erro` tem `role=alert` ("Email ou senha inválidos."), e `#entrada-email` e `#entrada-senha` têm `aria-describedby="entrada-erro"` e `aria-invalid="true"`. Com campos vazios: `entrada-email-erro` e `entrada-senha-erro`, ambos `role=alert`, e o campo de email referencia o seu. A frase de recusa genérica não revela qual dos dois falhou (resistência a enumeração preservada).
6. Foco visível e ordem de foco na entrada (2.4.7, 2.4.3): a ordem de Tab é email, senha, Entrar, "Esqueceu a senha?", "Quero conhecer", na ordem visual, sem armadilha. Cada parada tem `:focus-visible` e anel de duas camadas (`box-shadow` 2 px de fundo e 2 px violeta: claro `#6d28d9` sobre `#f5f7f8`, escuro `#a78bfa` sobre `#101519`, ambos acima de 3:1) (`sonda-foco.txt`; a primeira leitura imediata mostrou sombra transparente por causa da transição, a leitura 450 ms depois mostra o anel; capturas `foco-entrar-claro.png` e `foco-entrar-escuro.png` na pasta `sonda`).
7. Desativar conta em Usuários (diálogo): coberto por `modal.test.ts` e `foco.test.ts` (verdes); não reabri o diálogo no navegador nesta rodada, ver "Não verificado".

## Evidência
Saídas em `C:/Users/Rfasg/AppData/Local/Temp/claude/c--Projetos-city-hall/78869014-3ace-4efd-a059-e24f265aea3c/scratchpad/acess/`: `vitest.txt`, `e2e-local.txt`, `sonda-e05.txt`, `sonda-e05-expirou.txt`, `sonda-entrada.txt` (inclui a parte E13), `sonda-contraste.txt`, `sonda-foco.txt`; scripts e imagens em `acess/sonda/`. Capturas reais do SHA do outro agente em `scratchpad/g00/capturas-ux/e05-*` (lidas pelo `ux.md`, não repetidas aqui). `@axe-core/playwright` não existe em `node_modules` (conferido com `find`), então não foi usado; a varredura própria acima cobre contraste, alvo, nome, rótulo e id e declara o que não cobre.

## Cenários positivos
Os três motivos chegam à entrada com a frase certa e o tipo de região certo; entrar de novo funciona; a entrada não rola na horizontal a 320 px.

## Cenários negativos
Senha errada e campos vazios geram erro associado ao campo. Conta desativada tentando entrar de novo recebe a recusa genérica (comportamento da E05, conferido pelo QA).

## Tentativas de reprovar
- Procurei aviso que dependa só de cor: os três têm ícone mais texto.
- Procurei contraste de borda e de ícone, não só de texto: todos acima de 3:1.
- Procurei a região viva pré-montada: não existe; as regiões entram junto com a página (ver achado 1).
- Procurei para onde vai o foco depois do redirecionamento por sessão morta: fica em `BODY` nos três casos (achado 1).
- Procurei overflow a 320 px nos três avisos: nenhum.
- Provoquei a falha do auditor de contraste plantando texto fraco: reprovou, então a varredura enxerga.
- Procurei `id` duplicado, rótulo ausente e controle sem nome: nada.

## Achados
1. corrige antes de crescer (dono F10-E11, que já tem "região anunciante única" e "foco no título"): depois do redirecionamento por sessão morta o foco fica em `BODY` e o painel não tem anunciador de rota (só existem regiões `aria-live` isoladas: busca, sino, toast, carregando). Os avisos "encerrada" e "expirou" são `role=status` inseridos já com o texto, junto com a página; "desativada" é `role=alert`. A anunciação de `status` inserido com conteúdo não é garantida em leitores de tela (4.1.3), e a frase mais urgente para quem perdeu trabalho (sessão encerrada, a que diz "Nada do que já tinha sido gravado se perdeu") é a menos garantida. Reprodução: `sonda-e05.txt`, campos `foco` e `vivasInseridasNaNavegacao`. Não prova falha, porque nenhum leitor de tela foi usado.
2. anotado (pré-existente, fora do diff da E05): a tela de entrada não tem landmark `main`, `nav` nem atalho "pular para o conteúdo" (`landmarks` todos zero em `sonda-e05.txt`); a tela é curta, mas 1.3.1 e 2.4.1 pedem ao menos `main`.
3. anotado (pré-existente): depois de enviar a entrada com o botão, ele fica `disabled` durante a chamada e o foco cai em `BODY` e não volta; quem usa teclado perde a posição e recomeça do topo. Com campos vazios o foco também não vai ao primeiro campo marcado como inválido (o `foco.test.ts` cobre três formulários, não este). Reprodução: `sonda-entrada.txt`, linhas "erro login" (`foco: BODY#`) e "campo vazio".

Nenhum item bloqueia a etapa.

## Não verificado
- Leitor de tela real (NVDA, JAWS, VoiceOver, TalkBack): nenhum; o anúncio das frases e a ordem de leitura não foram ouvidos. É tarefa humana.
- Diálogo "desativar conta" no navegador (só os testes de modal e foco); zoom de 200 por cento e 768 px; WebKit e Firefox (o e2e local do implementador cobre Firefox, eu não repeti).
- Contraste em gradiente ou imagem de fundo (a varredura ignora o que tem `background-image`); o componente `Aviso` não usa.
- Declaração de acessibilidade e eMAG: fora do escopo da etapa.

## Risco residual
Anúncio por leitor de tela da frase de sessão encerrada ou expirada não provado; foco em `BODY` depois do redirecionamento.

## Motivo do humano
Só uma pessoa com NVDA ou VoiceOver confirma que a frase de sessão encerrada é ouvida ao cair na entrada, e que o foco em `BODY` não desorienta. Fica pendente, não bloqueia.
