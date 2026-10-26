# V2-F00-E09, correção 2: Minha conta cabe a 320 px e o foco não cai em BODY depois de encerrar

Base: `4b96ea7` (SHA validado na rodada 2), ramo `v2/f00`. Motivo: rodada 2 reprovada por UX, QA e acessibilidade. As outras duas dimensões (LGPD e red-team) passaram e o funcional não mudou.

## Fatos

**O que a validação provou.** (1) Em Minha conta, a 320 px, o botão "Encerrar minhas outras sessões" passava cerca de 16 px da coluna. (2) Depois de confirmar o encerramento das outras sessões o botão some e o foco ia para `BODY` (WCAG 2.4.3). O e2e de tela estreita não media Minha conta.

**Causa medida (saída `02`, painel construído da `4b96ea7`).** O botão ia de 41 a 295 px contra a área útil de 41 a 279 px do cartão (16 px de excesso): `.botao` é `white-space: nowrap` e a correção 1 só tinha coberto `.modal__rodape .botao`. O foco: `document.activeElement` era `BODY` depois que a lista era relida (o `Modal` devolve o foco ao botão que deixa de existir).

**O que mudou.**

- `dc360/apps/web/src/estilos/app.css`: classe nova `.botao--quebra` (rótulo quebra em linhas, `max-width: 100%`, altura automática, `line-height` por token) e, até 600 px, `width: 100%`. Só tokens `--ds-*`: nenhuma cor, raio, sombra ou duração nova.
- `dc360/apps/web/src/paginas/MinhaConta.tsx`: o botão "Encerrar minhas outras sessões" usa `botao--quebra`; a confirmação de sucesso é o próprio `Aviso` com a prop `foco` (`tabIndex={-1}` guardado por `ref`, sem `role`; na primeira leva era um `div` sem papel em volta de um aviso `role="status"`, ver a rodada de conserto abaixo), e um efeito sobre `sucesso` leva o foco para ela. É efeito, e não chamada dentro de `encerrar`, porque o `Modal` devolve o foco ao gatilho na limpeza do efeito dele, que roda antes do efeito do pai.
- `dc360/apps/web/test/layout-estreito.e2e.mjs`: função `foraDoLugar` que mede por retângulo, em qualquer tela, cada botão, link-botão, campo, selo, aviso e item de lista contra a área útil (dentro do padding) do cartão ou da janela, o texto cortado, o alvo de toque abaixo de 44 px de altura e a rolagem horizontal da página (o que está dentro de envoltório que rola de propósito, a tabela, fica de fora). Seção 5: Minha conta a 320, 390, 768 e 1280 px com duas ou mais sessões abertas (o teste exige pelo menos duas: a criada pela API e a do navegador, e o rótulo da janela traz o N real). Seção 6: Usuários a 320, 390 e 768 px e a janela da senha temporária a 320 e 390 px. Seção 7: foco real depois de encerrar (não é `BODY`, está conectado e é a confirmação).
- `dc360/apps/web/test/minha-conta-estreita.test.ts` (novo, 6 testes): a regra `.botao--quebra`, o `width: 100%` até 600 px, o uso no botão, ausência de número solto de cor, duração ou padding, o `ref`/`tabIndex` e o efeito do foco.
- `dc360/apps/web/PENDENCIAS.md`: seção 12 nova.

**O teste morde (ANTES-VERMELHO, DEPOIS-VERDE).**

- `saidas/01`: os dois arquivos de teste novos contra `MinhaConta.tsx`, `RecuperarSenha.tsx`, `recuperar-regras.ts` e `app.css` da `4b96ea7`: 9 falhas e 36 aprovados (as 6 de `minha-conta-estreita` mais 3 de E10).
- `saidas/02`: `layout-estreito.e2e.mjs` contra o painel construído da `4b96ea7` (API de pé): 60 aprovadas, 3 falhas: "Minha conta a 320 px: nada fora do lugar (button.botao.botao--perigo "Encerrar minhas outras sessões" sai da area util (41..295 contra 41..279))" e as duas da seção 7, medida a 390 px (foco em `BODY`: "continua num elemento que existe" e "esse elemento é a confirmação").
- `saidas/03`: o mesmo e2e depois do conserto, dentro de `npm run test:e2e:api`: 63 aprovadas, 0 falha, zero erro de console.

**Regressão (depois do conserto).** `npm run test --workspace @dc360/web`: 44 arquivos, 659 testes, 0 falha (649 na correção 1; mais 6 de `minha-conta-estreita`, 2 de `recuperar-senha` do checkpoint (E10) e 2 de hover (E10)). `npm run typecheck`: código 0. `npm run test:e2e:api` (sobe API e painel do zero, Chromium): suíte principal 284 aprovadas, 0 falha (279 antes; a diferença são conferências novas da seção 14, do E10), geometria 63 aprovadas (50 antes), zero erro de console. `npm run test:e2e` (modo local, Chromium): 70 aprovadas, 0 falha. Portão de conteúdo: 8 testes. Números novos para o `conferir:numeros` (que NÃO foi refeito aqui): painel 649 para 659; e2e contra a API 279 para 284 mais 50 para 63 da geometria.

**Capturas reais** (Playwright, Chromium, 320, 390, 768 e 1280 px, claro e escuro, página inteira por janela com a altura do conteúdo, em `capturas/antes` e `capturas/depois`): `E09-minha-conta-sessoes-*` (os quatro tamanhos, nos dois estados) e `E09-minha-conta-depois-de-encerrar-*` (320 e 390 px, com a confirmação e o foco nela). Olhadas uma a uma: antes, o botão passa da borda direita do cartão a 320 px; depois, ocupa a coluna com o rótulo em duas linhas, sem corte, a 320, 390, 768 e 1280 px, nos dois temas. A saída `09` registra o foco medido: antes `BODY`, depois `DIV` com "As outras N sessões foram encerradas. Esta continua aberta.".

**Rodada de conserto (refutação do revisor independente em Opus).** Três achados da E09 (os da E10 estão no RESUMO dela).

1. **Anúncio duplo na confirmação (menor).** O foco ia para um `div` sem papel que envolvia um `Aviso` já `role="status"`: o leitor podia dizer a frase pelo foco e de novo pela região. Ajustado ao mesmo mecanismo da E10 (UM só, o foco): `<Aviso tom="sucesso" foco={confirmacao}>` em `MinhaConta.tsx`; com `foco` o aviso é o alvo do foco e não é região viva. Os dois fluxos (Minha conta e recuperação de senha) ficaram coerentes. Detalhe e justificativa no RESUMO da E10. `componentes/comuns.tsx` (`Aviso`) é compartilhado com a E10.
2. **Texto do RESUMO batendo com o teste (menor).** O RESUMO dizia "três ou mais sessões" e o teste exige `>= 2`: o texto agora diz duas ou mais.
3. **Geometria em mais de um motor (importante).** O veredito mediu o estouro em três motores e a prova da correção foi só Chromium. `layout-estreito.e2e.mjs` rodou também em **WebKit** (`saidas/13`): 63 aprovadas, 0 falha, zero erro de console. A única conferência que falhava, a da seção 3 ("o primeiro Tab cai em Pular para o conteúdo"), falhava também antes e **não é do painel**: confirmei com uma página mínima (`saidas/15`, `sondas/sonda-tab-webkit.mjs`) que o WebKit do Playwright no macOS não leva o Tab a links e botões (o 1º Tab cai no campo, o 2º em `BODY`; no Chromium cai no link e depois no botão). A conferência agora sonda isso primeiro e, onde o Tab não alcança nem um link numa página mínima, fica **PULADA** com a mensagem na saída, em vez de reprovar o painel por comportamento do motor; no Chromium roda e passa. **Firefox não está instalado** nesta máquina (`saidas/14` registra o erro de lançamento): não há prova em Firefox nesta rodada.

**A conferência nova morde.** A seção 7 de `layout-estreito.e2e.mjs` ganhou uma conferência: o elemento com foco é o próprio aviso (`tabindex=-1`), sem `role`, e não há região viva em volta nem dentro. `saidas/11`: contra o painel construído com o `div` antigo, 1 falha ("regiaoViva": true, "eOAviso": false) e 63 aprovadas. `saidas/10`: os testes de fonte contra a fonte antiga, 6 falhas (2 deste arquivo, 4 da E10). `saidas/12`: depois do conserto, Chromium, 64 aprovadas e 0 falha. `saidas/16` a `20`: vitest do painel 44 arquivos e 665 testes (0 falha), typecheck código 0, `node scripts/e2e-api.mjs chromium` com a suíte principal em 288 aprovadas e 0 falha e a geometria em 64, `node test/fluxo.e2e.mjs` 70 aprovadas, portão de conteúdo 8 testes.

**Capturas depois do conserto** (`capturas/depois-2/E09-minha-conta-depois-de-encerrar-depois-2-*`, 320, 390 e 1280 px, claro e escuro, o encerramento confirmado pelo teclado para o anel de foco aparecer): olhadas (390 escuro, 1280 escuro e as de 320 e 390 claro): a confirmação de sucesso com o anel de foco, sem corte nem desalinhamento, as sessões abaixo dela. `saidas/21`: foco medido em `DIV` `aviso aviso--sucesso`, `tabindex=-1`, `role=null`, nos três tamanhos. O script de captura (`sondas/capturar.mjs`, o da primeira leva, e `sondas/capturar-rodada.mjs`, o desta) está arquivado, com `sondas/par.mjs`.

**Limitações.**

- A coluna Minha conta a 768 px mostra a barra do topo em duas linhas (busca, depois sino e nome); é a barra global, fora desta etapa, e não foi alterada.
- A 1280 px o conteúdo de Minha conta tem largura máxima e deixa área vazia à direita; é o desenho atual da página, não foi tocado.
- Chromium e, nesta rodada de conserto, WebKit para a geometria (a correção 1 também rodou Firefox; Firefox não está instalado agora, sem prova nele nesta rodada). Nenhum aparelho físico, nenhum leitor de tela: o foco foi medido por `document.activeElement`, e o anúncio da confirmação por leitor de tela segue como pendência humana da etapa (CP-32).
- A suíte de API tem uma falha conhecida e alheia nesta máquina (`apps/api/test/openssl-do-teste.test.ts`, o `openssl` do macOS é LibreSSL); não é do painel e não foi rodada aqui.
- O `diff-da-correcao.patch` traz os arquivos de Minha conta, o trecho de `app.css` de `.botao--quebra` e `PENDENCIAS.md` (diferença desde a `4b96ea7`; inclui o que o checkpoint `cea7837` já tinha). Nada foi commitado por esta sessão. STATUS, VEREDITO e `validacao/` não foram tocados.

## Justificativa

A causa dos dois defeitos é a mesma da correção 1 em outra tela: layout que supõe rótulo curto. O rótulo comprido é bom (diz o ato), então a correção deixa-o quebrar em vez de encurtá-lo, em classe própria (`.botao--quebra`), e não num seletor a mais na regra da janela, para que um conserto não quebre o outro. A régua do teste passou de "janela e barra do pé" para "todo controle de qualquer tela dentro da área útil", porque o defeito escapou justamente por a tela nova não estar na lista do que se media.

O foco vai para a confirmação, e não para o título da lista, porque é ela que a pessoa precisa ouvir (o que aconteceu e que esta sessão continua); o título não diz nada novo. O `tabIndex={-1}` deixa o `div` focável por código sem entrar na ordem do Tab. Mover o foco num efeito sobre `sucesso` e não dentro do `encerrar` é o que evita brigar com o `Modal`, que devolve o foco ao gatilho na limpeza do efeito dele.
