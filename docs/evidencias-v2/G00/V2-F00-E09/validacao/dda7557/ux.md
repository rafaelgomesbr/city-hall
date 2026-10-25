---
validador: ux (general-purpose)
modelo: claude-sonnet-5-5
etapa: V2-F00-E09
sha_validado: dda7557
ci_run: 40132234324
rodada: 9
herdado_de:
tags: [UI, MOBILE, A11Y]
nivel_de_prova_exigido: [E2, E3a]
nivel_de_prova_obtido: [E2, E3a]
veredito: PASS
confianca: media
humano_necessario: sim
escalar: nenhum
---
## Critérios verificados

Medido com sonda Playwright MINHA (não o e2e do implementador), sobre o painel construído da árvore (`dist` do HEAD d4683cc, que só difere de dda7557 em registro) e API local na 6911, painel na 6912. Medida por retângulo (`getBoundingClientRect`), por `elementFromPoint` em 9 pontos do elemento e pelos elementos `fixed` ou `sticky` da página (topo e barra do pé), sem depender da noção de "borda" do código.

1. **Defeito 1 da rodada 8 (frase "A outra sessão foi encerrada. Esta continua aberta." fora da vista no WebKit): CONSERTADO.** Em Minha conta, confirmar "Encerrar minhas outras sessões" por clique, toque (`hasTouch` e `tap()`) e teclado, 19 tamanhos (360x640, 390x664, 375x667, 375x553, 320x568, 640x450 da rodada 8, mais 414x736, 360x740, 320x480, 360x500, 412x915, 768x1024, 667x375, 568x320, 320x256, 1280x720, 800x400, 375x812, 393x500), 3 motores: 171 de 171 passam (57 por motor, `saidas/sessoes-*-claro.txt`). Em todos a frase fica inteira na janela, 9 de 9 pontos descobertos, abaixo do topo fixo e acima da barra do pé, com o foco nela, medida em 0, 150, 600, 1500 e 3500 ms. Exemplo WebKit 360x640: frase 141..225, topo até 129, barra desde 561 (antes, em 60cbc2f: 10..94, 0 de 9 pontos).
   - Atraso de rede de 2,5 s na releitura da lista (o caso que encolhe a página tarde), WebKit, 360x640, 320x568, 375x553, clique e toque: 6 de 6 (`saidas`, comando no relatório abaixo).
   - Dispositivos WebKit emulados (iPhone SE, 13, 13 deitado, 12 Pro Max), tema escuro, 4 outras sessões, toque e clique: todos passam (13 deitado: frase 93..139, topo até 81, barra desde 263).
   - Tema escuro nos 3 motores, 360x640, 320x568, 375x553, clique, toque e teclado: 27 de 27.
2. **Defeito 2 da rodada 8 (foco inicial "Cancelar" fora da parte visível do painel): CONSERTADO.** Janelas "Redefinir senha" e "Encerrar sessões" (Usuários) e "Encerrar minhas outras sessões" (Minha conta), 20 tamanhos (320x256, 320x450, 390x450, 640x300, 568x320, 640x450 da rodada 8, mais 320x300, 360x400, 360x300, 375x350, 280x300, 320x200, 667x375, 812x375, 400x500, 360x640, 320x568, 1280x720, 320x180, 300x240), clique, toque e teclado, 3 motores: 540 casos. Resultado: 0 falhas reais. 26 casos deram erro de infraestrutura meu (login com 429/lentidão por 3 motores em paralelo) e foram repetidos um a um: 26 de 26 passam. Critério: foco em "Cancelar", dentro do painel, retângulo inteiro dentro da área útil do painel (`clientTop`..`clientHeight`), dentro da janela do navegador, 9 de 9 pontos descobertos, sem rolagem lateral, e medido de novo em 50, 300, 1000 e 2500 ms (cobre a frase de contagem de "Encerrar sessões", que chega depois e cresce). Anel de foco exigido no teclado: 56/56 Chromium, 57/57 Firefox, 57/57 WebKit mais as repetições. Clique e toque abrem sem anel (comportamento padrão de `:focus-visible` do motor para foco por código depois de ponteiro), anotado abaixo.
   - Tema escuro nos 3 motores, 320x256, 568x320, 360x640, teclado e toque, 3 janelas: 54 de 54.
3. **Sonda morde na versão antiga (prova de que não é teste frouxo):** com o painel de 60cbc2f construído por mim, a mesma sonda reproduz os números da rodada 8 (WebKit: 10..94 a 360x640 clique e toque, 0 de 9 pontos; -136..-52 a 320x568; 74..138 a 390x664) e o botão fora da janela (Chromium 320x256: 408..452 numa área útil de 21..234; 568x320: 288..332 em 27..294; 320x450: 399..443 em 37..413). Capturas `ux-01` e `ux-02`.
4. **Contrapartida declarada (título e parte do texto saem por cima em janela baixa): aceitável pelo portão visual da seção 0 de 19, com ressalva (achado A1).** Capturas `ux-06` e `ux-07`: o painel rola por dentro, o corte é pela borda do painel (não por outro elemento), nada sobreposto, o botão destrutivo repete a ação e a pessoa ("Redefinir a senha de Diego Nakamura Alves"), "Cancelar" está inteiro com respiro. A alternativa (foco fora da vista) é pior. Ressalva: não há pista visual de que o painel rola.
5. **Janela da senha temporária abre no topo, título à vista:** 7 tamanhos x clique e teclado x 3 motores = 42 de 42: `scrollTop` 0, título dentro da área útil (ex.: 320x256 título 45..69 em 21..234), sem rolagem lateral, foco no painel quando "Copiar senha" não cabe, no botão quando cabe (390x664, 1280x720). Capturas `ux-08` e `ux-09`. Observação: a 320x450, 568x320 e 640x300 a senha em si e "Já anotei a senha" ficam abaixo da dobra (exigem rolar), por desenho da correção 4, não alterado agora.
6. **Telas tocadas pelo ajuste do Tab (`usar-bordas-fixas.ts`):** passeio de Tab (até 45 paradas por tela) em Usuários, Minha conta, Nova ocorrência, Órgãos, Equipes, Organização, Auditoria a 320x568, 390x400, 640x450: Chromium 18 de 18, Firefox 18 de 18, WebKit (claro) 20 de 20 depois de repetir os 5 que o 429 e um 403 esperado (administradora em "Meu trabalho") derrubaram na primeira passada, WebKit escuro 6 de 6. Nenhum campo ficou sob o topo ou a barra do pé, nenhuma rolagem lateral a 320 px, zero erro de console. Em Painel, Mapa e "Quem está em campo" o WebKit do Playwright não dá Tab em links (comportamento do motor), por isso 0 paradas medidas lá; no Chromium, Painel 48 e Mapa 43 paradas passam.
7. **Frases (português, sem travessão, sem inglês):** textos coletados de Usuários (página, formulário vazio e inválido, janela de confirmar, janela da senha, "Encerrar sessões", Toast), Minha conta (página, erros do formulário, janela, sucesso, depois): nenhuma ocorrência de U+2014 nem de termo em inglês (`saidas/textos-chromium-claro.txt`). Mapa de erros do Zod 4 conferido pela API (`POST /usuarios` e `/auth/entrar` com corpos inválidos): "Campo obrigatório", "Era esperado um texto, veio um número", "Não é um identificador válido (UUID)", "Valor não reconhecido: \"rei\". Os aceitos são: ...", "Informe um email válido", "A senha precisa de pelo menos 12 caracteres": tudo em português. Exceção no achado A2.
8. **Dois temas:** claro e escuro medidos em todos os itens acima (escuro: sessões, 3 janelas, passeio de Tab, senha temporária). Capturas `ux-03`, `ux-04`, `ux-05`, `ux-12` (escuro), `ux-06` a `ux-10` (claro). Contraste e anel legíveis nas capturas escuras (anel violeta em "Cancelar").

## Evidência
- Sondas minhas (no scratchpad, não no repositório): `/tmp/claude-501/-Users-rafaelgomes-Documents-city-hall/d900a13c-1e42-4b88-9465-82d873257632/scratchpad/ux-E09/` (`lib.mjs`, `sessoes.mjs`, `janelas.mjs`, `senhaT.mjs`, `tab.mjs`, `textos.mjs`, `zod.mjs`, `dv10.mjs`); saídas em `.../ux-E09/saidas/` e JSON `*.json` na raiz dessa pasta.
- Sessões: `saidas/sessoes-{chromium,firefox,webkit}-claro.txt` (57/57 cada), `sessoes-webkit-claro-delay.json`, `sessoes-webkit-escuro-disp.json`, `saidas/sessoes-dk-*.txt` (9/9 cada).
- Janelas: `janelas-{motor}-claro-a.json` (180 por motor), `janelas-{motor}-claro-re.json` (repetição dos erros de infra), `saidas/janelas-dk-*.txt` (18/18 cada), reavaliação por números em `pos.mjs` (ignora o anel só para clique e toque).
- Senha temporária: `saidas/senhaT-*.txt` (14 de 14 por motor). Tab: `saidas/tab-*.txt`. Textos: `saidas/textos-chromium-claro.txt`, `zod.mjs` (saída colada em "Cenários").
- Capturas arquivadas (12 menos 1 retirada, ver abaixo): `docs/evidencias-v2/G00/V2-F00-E09/validacao/dda7557/capturas/ux-01..ux-12` (a `ux-11`, que mostrava uma senha temporária sintética, foi retirada por regra de evidência; 11 arquivos).
- Rig: API 6911, painel novo 6912, painel antigo (worktree de 60cbc2f) 6913; derrubados ao fim.

## Cenários positivos
Frase de confirmação à vista por clique, toque e teclado nos 3 motores; "Cancelar" inteiro e com anel (teclado) nas 3 janelas; janela da senha temporária no topo; Tab sem campo sob as bordas; dois temas; português correto.

## Cenários negativos
Painel de 60cbc2f sob a mesma sonda: falha como na rodada 8 (item 3). Atraso de 2,5 s na lista de sessões não desfaz o conserto. Janela "Encerrar sessões" com a contagem chegando depois: passa em 320x256, 320x450 e 568x320 nos 3 motores. Erros de API com corpo inválido: frases em português (item 7).

## Tentativas de reprovar
- Variei o que o e2e do implementador não varia: 13 tamanhos extras nas sessões (inclui 667x375, 800x400, 320x256 e 1280x720) e 14 extras nas janelas (inclui 320x180, 300x240, 280x300, 320x200), três vias, quatro instantes de medida, 1, 2 e 4 outras sessões, atraso de rede, dispositivos WebKit com `isMobile`, tema escuro. Nenhuma falha real.
- Tentei o caminho de atraso (a lista relida chegando depois de todas as passadas do `manterNaFaixaDasBordas`): o efeito com `[sucesso, sessoes]` refaz o ajuste, passa.
- Tentei sentir se a sonda era frouxa: ela falha no painel antigo com os números da rodada 8 (item 3). Na primeira passada ela marcou "falha" em clique e toque por exigir anel; investiguei: é o `:focus-visible` do motor (foco por código depois de ponteiro não mostra anel), igual no painel antigo para o clique, e passei a exigir o anel só no teclado, onde 100 por cento passa.
- Procurei regressão fora das telas da etapa (7 telas, passeio de Tab) e rolagem lateral a 320 px (nenhuma). Procurei texto em inglês e travessão (nenhum).
- Procurei o foco devolvido depois de fechar a janela (DV-10): WebKit, clique, devolve ao `<main>` (`dv10.mjs`: `main#conteudo`); teclado devolve ao botão; Chromium devolve ao botão nos dois. Igual ao estado dívida, não piorou.

## Achados
- **A1 (anotado; dívida, não bloqueia).** Em janela baixa (320x256, 568x320, 320x450) o título da janela de confirmação e as primeiras linhas do texto saem por cima da parte visível do painel, e não há pista visual de que o painel rola (por exemplo, sombra ou borda de rolagem). Não viola critério escrito da etapa, não é texto coberto por outro elemento, e a alternativa foi pior (botão e anel fora da vista). Não cai em D-31 item 1 (a), (b) nem (c). Sugestão: pista de rolagem no painel (F00 ou depois).
- **A2 (anotado; dívida).** Com o Zod 4, um enum sem valor (`papel` ausente) devolve "Valor não reconhecido: undefined. Os aceitos são: coordenador, operador, agente_campo, administrador" (no Zod 3 era "Campo obrigatório"). Só alcançável por chamada direta à API (o seletor do painel sempre envia valor), então a pessoa do painel não vê. Condição (b) não se aplica na prática (não chega à tela); registro como dívida de mapa de erros.
- **A3 (anotado).** A 320x450, 568x320 e 640x300 a senha temporária e "Já anotei a senha" ficam abaixo da dobra na abertura (precisa rolar); estado herdado da correção 4, fora do escopo da correção 7.
- **A4 (anotado, limite da minha sonda).** Clique e toque abrem as janelas sem anel de foco em "Cancelar" (regra `:focus-visible` dos motores); o teclado mostra o anel. Não é defeito de 2.4.7.
- Dívidas registradas: DV-10 igual (acima). DV-11, DV-12 e H35 (340 px e frase de erro do Relato): não medi o Relato, não houve mudança em arquivo dele no diff (só `Modal.tsx`, `usar-bordas-fixas.ts`, `MinhaConta.tsx`), e o caminho sem foco inicial do `Modal` não mudou; não afirmo que não pioraram, afirmo que não toquei.

## Não verificado
- Safari de aparelho e VoiceOver: WebKit do Playwright no macOS não é o iOS; o defeito 1 foi reproduzido nele, e o conserto, medido nele, mas aparelho real fica com humano. CI no Linux (WebKit sem tela, que já atrasou o quadro antes) não é minha prova; os 12 jobs do run 40132234324 contam como do gatekeeper.
- Leitor de tela (a contrapartida depende de `aria-labelledby` e `aria-describedby` para o que sai por cima): não ouvi.
- Zoom real do navegador (Ctrl +); usei viewports equivalentes (320x256 = 400 por cento de 1280x1024).
- Relato (H35), DV-11 e DV-12: não medidos.
- Tab em links no WebKit (o motor não os foca), por isso Painel, Mapa e "Quem está em campo" só mediram no Chromium.
- Modo local (`local.ts`) das telas: fora do foco desta rodada.

## Risco residual
Baixo para os dois defeitos da rodada 8: medidos em 3 motores, 3 vias, dois temas e com a sonda mordendo a versão antiga. O risco que sobra é o WebKit de aparelho (tempo de quadro e rolagem corrigida por baixo) e a contrapartida de título fora da vista, que é decisão de desenho.

## Motivo do humano
Gatilho visual: (1) Rafael aprovar, olhando `ux-06` e `ux-07`, que título e primeiras linhas fora da vista em janela baixa sejam aceitáveis (a seção 0 de 19 diz que ele vê as capturas e aprova); (2) conferir a confirmação das sessões e a janela em um iPhone ou Safari real, o que só uma pessoa com o aparelho faz.
