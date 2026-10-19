---
validador: acessibilidade (general-purpose com o papel da dimensão)
modelo: claude-opus-5-5
etapa: V2-F00-E09
sha_validado: bb0f654
ci_run: ausente (39143791434 citado pelo implementador, não lido)
rodada: 4
herdado_de:
tags: [UI, A11Y, AUTH, API, LGPD]
nivel_de_prova_exigido: [E1, E2]
nivel_de_prova_obtido: [E1, E2]
veredito: PASS
confianca: alta
humano_necessario: sim
escalar: nenhum
---

Pasta das sondas e saídas deste validador (fora do repositório): `/private/tmp/claude-501/-Users-rafaelgomes-Documents-city-hall/ded47d25-806d-4495-ac61-f9e84518cc35/scratchpad/validadores/acessibilidade/` (`saidas/` e `capturas/` relativas a ela). API real (PGlite semeado) e painel construído com `VITE_API_URL`, portas próprias, derrubados no fim. `@axe-core/playwright` não existe no repositório: inspeção do DOM, `ariaSnapshot()` e contraste por cor computada no lugar do axe.

## Critérios verificados

Critérios de acessibilidade da etapa ("confirmação anunciada por `role=status`, foco devolvido ao botão, ícone mais texto") e checklist WCAG 2.1 AA nos fluxos Redefinir senha, Senha temporária, Encerrar sessões (Usuários, administradora) e Encerrar minhas outras sessões (Minha conta), feitos só pelo teclado:

| Item WCAG | Resultado | Prova |
| --- | --- | --- |
| 1.3.1 e 4.1.2 diálogos com `role="dialog"`, `aria-modal="true"`, nome pelo título, descrição pela consequência | OK | `saidas/04`, árvore de cada diálogo registrada |
| 1.3.1 contagem de sessões dentro da janela em `role="status"` | OK | "Diego Nakamura Alves tem 1 sessão aberta..." |
| 1.4.1 nada só por cor: selo "Esta sessão" com ícone e texto, avisos e Toast com ícone | OK | `saidas/04` |
| 1.4.3 contraste de todo texto dos diálogos, do Toast e de Minha conta, claro e escuro | OK | pior 4,7:1 claro, 5,43:1 escuro |
| 1.4.10 reflow 640 e 320 px | OK com achado | Senha temporária, Usuários e Minha conta sem rolagem horizontal da página; ver achado 1 (Toast sobre a janela) |
| 1.4.11 anel de foco >= 3:1 | OK | 7,1:1 (claro), 6,19:1 (escuro), depois da transição, também com `prefers-reduced-motion: reduce` (duração 1e-05 s) |
| 2.1.1 e 2.1.2 tudo por teclado, sem armadilha fora da janela | OK | Enter, Espaço, Shift+Tab, Esc |
| 2.4.3 foco inicial em Cancelar (destrutivo), Tab e Shift+Tab presos (12 teclas por diálogo), fundo `inert` e `aria-hidden` | OK | 4 diálogos |
| 2.4.3 foco devolvido: Esc e "Já anotei a senha" voltam ao botão da linha; confirmar Encerrar sessões volta ao botão; Minha conta leva o foco à confirmação | OK | `saidas/04`, `saidas/12-sonda-e09-firefox.txt` |
| 2.4.7 foco visível nos botões novos da linha e na confirmação focada | OK | `capturas/E09-anel-*` |
| 2.5.5 (boa prática no painel) botões de 44 px a 320 px | OK | "Copiar senha" e "Já anotei a senha" com 44 px |
| 4.1.3 confirmação de encerrar em `role="status"` `aria-live="polite"`, fora de subárvore inerte; região de "Senha copiada" existe vazia antes do texto | OK | `saidas/04` |

## Evidência

- `node sonda-e09.mjs`, Chromium: 55 de 55 (`saidas/04-sonda-e09-chromium.txt`); Firefox: 55 de 55 (`saidas/12-sonda-e09-firefox.txt`).
- `node sonda-anel.mjs` (anel de foco depois da transição, dois temas, com e sem movimento reduzido): 16 de 16 (`saidas/05-sonda-anel-chromium.txt`).
- `node sonda-erros.mjs` (caminhos de erro acionados pelo botão): `saidas/09-sonda-erros-chromium.txt`, `saidas/09-sonda-erros-firefox.txt`.
- `node sonda-toast-sobre-janela.mjs`: `saidas/13-toast-sobre-a-janela.txt`.
- E2E oficial: seção 26 dentro de `fluxo-api.e2e.mjs`, Chromium e Firefox 288 de 288 (`saidas/01`, `saidas/23`); `layout-estreito.e2e.mjs` Chromium 64 de 64 (`saidas/02`), Firefox 64 de 64 na terceira tentativa (`saidas/24`, ver Achados).
- Vitest do painel 665 de 665 (`saidas/16`); arquivos de acessibilidade, `minha-conta-estreita`, `sessoes-e-senha-temporaria` 109 de 109 (`saidas/17`).
- Capturas olhadas: `capturas/E09-toast-e-senha-temporaria-320-claro-chromium.png`, `capturas/E09-toast-sobre-senha-temporaria-320-claro-firefox.png`, `capturas/E09-anel-Encerrar-sessoes-escuro-no-preference-chromium.png`, `capturas/E09-usuarios-320-claro-chromium.png`, `capturas/E09-usuarios-tabela-320-claro-chromium.png`, mais `E09-confirmar-redefinir-*`, `E09-senha-temporaria-*`, `E09-confirmar-encerrar-*`, `E09-minha-conta-*`.

## Cenários positivos

- Redefinir senha de Jonas por teclado: foco em Cancelar, Shift+Tab no botão "Redefinir a senha de Jonas Ferreira", Enter; a janela da senha abre com o foco em "Copiar senha"; Enter em "Copiar senha" escreve "Senha copiada." na região de status (Chromium) ou a frase de copiar à mão (Firefox, sem permissão); "Já anotei a senha" devolve o foco ao botão da linha.
- Encerrar sessões de Diego: confirmação "Sessões de Diego Nakamura Alves encerradas. 1 sessão caiu." em `role="status"` com ícone, foco de volta em "Encerrar sessões".
- Minha conta com 4 sessões: janela diz "Esta sessão continua aberta"; depois de confirmar, foco em "As outras 3 sessões foram encerradas. Esta continua aberta." (`tabindex=-1`, sem `role`, com anel de foco).

## Cenários negativos

- Esc em cada diálogo fecha e devolve o foco ao gatilho, nunca a `BODY`.
- Falha do servidor (500 interceptado) em Redefinir e Encerrar: o erro aparece em `role="alert"` dentro da janela e o Tab seguinte continua dentro do diálogo (Cancelar).
- 320 px: janela da senha cabe na largura (272 de 320), botões visíveis e com 44 px.

## Tentativas de reprovar

1. Anel de foco: a primeira medição deu sombra transparente; refiz com 700 ms de espera e com `prefers-reduced-motion: reduce`: o anel existe (2 px de base mais 4 px violeta), 7,1:1 e 6,19:1. A medição inicial era o começo da transição.
2. Recorte do anel pelo envoltório da tabela que rola: folga de 4,6 px à direita para um anel de 4 px; cabe.
3. Toast aberto enquanto a janela da senha temporária abre a 320 px: o aviso fica POR CIMA da janela (achado 1).
4. Caminho de erro pelo botão de confirmar: o foco cai em `BODY` (achado 2).
5. Fechar o Toast pelo teclado: o foco cai em `BODY` (achado 3).
6. Tabela de Usuários a 320 px: confirmei que a dica "A tabela continua para a direita" e a sombra de borda aparecem (`saidas/26-tabela-usuarios-320.txt`).

## Achados

1. Corrige antes de crescer (já registrado como pendência de decisão no STATUS, agora medido em dois motores): o Toast tem `z-index` 50 e a janela modal 40. Com o aviso de "sessões encerradas" ainda na tela, abrir a senha temporária a 320 px desenha o aviso sobre a janela. Chromium: cobre 69% da altura do valor da senha e 16% de "Copiar senha"; Firefox: cobre 100% de "Já anotei a senha" e 70% de "Copiar senha", que está com o foco (o anel fica quase todo escondido). O aviso está dentro da subárvore `inert` e `aria-hidden`: não fecha por clique nem por teclado e some sozinho em cerca de 6 s. Reprodução: `sonda-toast-sobre-janela.mjs`, `saidas/13`, capturas citadas. Não quebra critério WCAG 2.1 AA (o anel continua parcialmente visível e o encobrimento é temporário), mas seria falha de 2.4.11 na WCAG 2.2.
2. Corrige antes de crescer: no erro do servidor dentro de `ConfirmarAcao`, o botão de confirmar vira `disabled` com o foco nele e o foco cai em `BODY` (Chromium nas duas janelas; Firefox em Redefinir). A operabilidade se mantém: o Tab seguinte volta ao diálogo, e o erro é `role="alert"`. `saidas/09`.
3. Corrige antes de crescer: fechar o Toast pelo botão "Fechar" (teclado) leva o foco a `BODY` (o botão some com o aviso). Medido em Usuários, Equipes e Órgãos (Chromium e Firefox, `saidas/11` e `saidas/12-sonda-e13-firefox.txt`). Componente compartilhado, anterior à etapa.
4. Anotado: `layout-estreito.e2e.mjs` em Firefox travou duas vezes no clique em "Cancelar" da seção 2 (TimeoutError na linha 180) antes de passar 64 de 64 na terceira; reproduzindo o mesmo clique isolado em 1280 e 320 px, ele responde em 40 a 60 ms (`saidas/25-firefox-clique-cancelar.txt`). Indício de instabilidade por carga, não de defeito do painel.

## Não verificado

- Anúncio por leitor de tela do Toast `role="status"` (montado já com o texto) e do foco na confirmação de Minha conta (CP-32).
- axe-core (não instalado). WebKit para teclado (motor não leva o Tab a botões no macOS).
- Zoom pela interface do navegador (usado reflow equivalente de 640 e 320 px).
- Modo de demonstração (local): não exercitado por esta dimensão.

## Risco residual

Médio-baixo: o encobrimento da senha pelo Toast a 320 px pode levar quem administra a perder a leitura da senha por alguns segundos, sem poder fechar o aviso; a senha continua na janela depois que ele some.

## Motivo do humano

Leitor de tela (VoiceOver, NVDA): confirmar o anúncio da confirmação de encerrar sessões, de "Senha copiada." e da confirmação focada em Minha conta (seção 4 de `28`). Decisão de produto sobre o Toast que cobre a janela a 320 px (já pendente no STATUS).
