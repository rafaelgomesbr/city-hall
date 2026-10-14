---
validador: acessibilidade
modelo: claude-sonnet-5-5
etapa: V2-F00-E11
sha_validado: 4b96ea7
ci_run: 38445527075
rodada: 2
herdado_de:
tags: [UI, A11Y, API]
nivel_de_prova_exigido: [E1, E2]
nivel_de_prova_obtido: [E1, E2]
veredito: PASS
confianca: media
humano_necessario: sim
escalar: F10-E11
---
Escopo de acessibilidade da E11: o cartão "Saída de município" em `/organizacao` (botão "Baixar pacote de saída", estado "Gerando", faixa de erro). A etapa não declara requisito de acessibilidade próprio; a régua é a WCAG 2.2 AA aplicável. Nada herdado da rodada 1; o `Organizacao.tsx` não mudou desde ela (o diff `7005a60..4b96ea7` toca outros arquivos), mas reexecutei tudo. SHA 4b96ea7, API real (3891), painel do SHA (4891), Chromium, administradora Rita. `axe` ausente (não existe em `node_modules`; nada instalado). Pasta: `C:/Users/Rfasg/AppData/Local/Temp/claude/c--Projetos-city-hall/b62645e7-c436-45b4-8ce0-4d68f4fb420f/scratchpad/a11y/` (`a11y/`).

## Critérios verificados

1. Testes estáticos (E1): `acessibilidade.test.ts` 21 de 21; seis arquivos de portão 103 de 103; quinze arquivos de painel, inclusive `pacote-de-saida.test.ts`, 260 de 260 (`a11y/vitest-a11y-base.txt`, `vitest-6-limpo.txt`, `vitest-15-limpo.txt`).
2. Nome e teclado (2.1.1, 4.1.2): o botão é um `<button type="button">` nativo com nome "Baixar pacote de saída" (ícone mais texto); `focus()` e Enter disparam o pedido (`a2.log`, bloco E11), o download termina com o nome `dc360-pacote-de-saida-AAAA-MM-DD.zip` (outro agente, T6, 111 entradas).
3. Contraste AA (1.4.3, 1.4.11), `/organizacao`, 1280, 390 e 320 px, claro e escuro (`a1.log`): zero texto abaixo de AA (o avatar é falso positivo de gradiente, medido à mão), zero controle sem nome, zero campo sem rótulo, zero `id` duplicado, `h1` e `h2` sem salto, `lang="pt-BR"`, `main` e `nav` presentes, sem rolagem horizontal da página a 390 e 320 px.
4. Alvo (2.5.8): o botão tem 44 px de altura na visão móvel; nenhum alvo da página abaixo de 24 px (`a1.log`). Único abaixo de 44 px a 390: o link do logotipo (40x44).
5. Foco visível (2.4.7): anel de duas camadas, 6,61:1 e 6,75:1 contra a página, e `outline` em Alto Contraste (`a4.log`).
6. Reflow e zoom (1.4.10): 640x450 css a 2x e 320 css a 4x, sem rolagem horizontal (`a1.log`).
7. Faixa de erro (3.3.1, 4.1.3): a recusa 403 aparece como `role="alert"` com a frase da API, inserida após o clique (prova da rodada 1, `sonda-e11b`, NÃO reexecutada nesta rodada porque o componente não mudou; a faixa foi lida só no código e nas capturas `E11-organizacao-*` do outro agente); ícone mais texto.

## Evidência

`a11y/a2.log` (bloco "E11 Organização: botão do pacote (teclado)"), `a11y/a1.log`, `a11y/a4.log`, testes em `a11y/vitest-*.txt`. Capturas do outro agente `web/capturas/E11-organizacao-antes-*`, `E11-organizacao-gerando-*`, `E11-organizacao-concluido-*` (1280, 768, 390, 320, dois temas), lidas para alinhamento: nada cortado, botão visível, "Gerando" legível.

## Cenários positivos

Chegar ao botão por Tab, acionar com Enter e receber o arquivo; estado "Gerando" legível nos dois temas; botão volta ao rótulo normal ao fim.

## Cenários negativos

Recusa do servidor (403) mostra a faixa com `role="alert"`; coordenadora não vê "Organização" no menu.

## Tentativas de reprovar

- Acionei o botão por Enter com a resposta retida e li o estado: `disabled` verdadeiro, texto "Gerando", `aria-busy` e `aria-disabled` ausentes, foco em `BODY` (`a2.log`: FALHA "durante 'Gerando' o foco permanece no botão" e FALHA "o estado 'Gerando' é anunciável"), nenhuma região viva modificada durante o pedido nem depois do download (`regiões vivas ... []`).
- Depois do download o foco continua em `BODY` e um segundo Enter não faz nada (achados 1 e 2, iguais aos da rodada 1).
- Procurei alvo pequeno, contraste fraco, rótulo ausente, `id` duplicado, rolagem horizontal a 320 px e a 640 px com zoom: nada.
- Procurei ARIA supérfluo no botão: nenhum.
- Procurei o duplo clique (gera dois pacotes sensíveis): com o botão `disabled` o segundo clique não age, mas o teclado perde o foco (achado 1).

## Achados

1. corrige antes de crescer (dono F10-E11, "estados do pacote"), igual à rodada 1: `disabled={baixando}` tira o foco do botão e ele não volta depois do download ou da recusa; teclado e leitor de tela recomeçam do topo (2.4.3). Reprodução: `a2.log`, bloco E11. Conserto simples: `aria-disabled` em vez de `disabled`, ou devolver o foco ao botão no `finally`.
2. corrige antes de crescer (dono F10-E11): nada anuncia "Gerando" nem o fim do download (4.1.3): sem `aria-busy`, sem região viva. O texto do botão muda, mas com foco perdido quem ouve não recebe nada.
3. anotado: a frase da faixa de erro ("alterar os dados do município" para quem queria baixar) está no `ux.md`; sendo `role="alert"`, é lida em voz alta.

Não declaro FAIL porque a E11 não prometia anúncio nem foco, o componente não foi reescrito na correção desta rodada, e a regra de acessibilidade dinâmica pertence à F10-E11 (escalar para lá). Se o gatekeeper entender que 2.4.3 vale para toda etapa que reescreve a função, os achados 1 e 2 são o motivo.

## Não verificado

- Leitor de tela real (NVDA, JAWS, VoiceOver, TalkBack): nenhum.
- Firefox e WebKit nas minhas sondas (o outro agente repetiu T6 nos três motores, download incluído, sem diferença funcional; o comportamento do foco ao desabilitar pode variar por motor).
- Pacote lento de verdade: o estado "Gerando" foi observado com a resposta retida por interceptação de rota.
- Alto Contraste do Windows real e zoom de página do navegador real (simulados por `forcedColors` e por viewport com DPR).

## Risco residual

Quem usa teclado perde a posição ao baixar o pacote; sem confirmação sonora pode acionar duas vezes (o botão desabilitado protege do duplo clique, não do usuário perdido).

## Motivo do humano

Leitor de tela real (CP-32) para confirmar o que é dito ao acionar o botão, durante "Gerando" e depois do download; e abrir o ZIP (item de produto já pendente no `ux.md`).
