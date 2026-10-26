---
validador: ux
modelo: claude-opus-5-5
etapa: V2-F00-E09
sha_validado: fd17ff4
ci_run: 39420436042
rodada: 7
herdado_de:
tags: [UI, A11Y, AUTH, API, LGPD]
nivel_de_prova_exigido: [E2, E3a]
nivel_de_prova_obtido: [E2, E3a]
veredito: FAIL
confianca: alta
humano_necessario: sim
escalar: nenhum
---
## Critérios verificados

Montagem (toda minha, no scratchpad `val-ux/`): API do SHA (`apps/api`, `npx tsx src/index.ts`, PGlite semeado, notificador de arquivo) na porta 3797; painel construído do SHA com `VITE_API_URL` apontado para ela, em pasta do scratchpad, servido por `vite preview` na 4797; `npm run build:shared` antes (código 0). Playwright 1.62.1 com Chromium, Firefox e WebKit. A árvore de `dc360/` em HEAD `55209ab` é idêntica à de `fd17ff4`. Capturas em `capturas/` desta pasta, prefixo `ux-E09-`, com o motor no nome. Saídas brutas em `SCRATCH/val-ux/saidas/` (SCRATCH é o scratchpad da sessão do gatekeeper).

Pistas da rodada 6 conferidas de novo, e o que foi tentado contra cada critério desta etapa na dimensão UX:

| Critério (bloco, correções 4 e 5, portão da seção 0 de `19`) | Resultado | Prova |
| --- | --- | --- |
| Foco depois da senha atual errada em Minha conta vai ao campo inválido (o FAIL da rodada 6, achado 1) | OK no elemento: `#conta-senha-atual` em 90 de 90 envios (clique, Espaço no botão focado, Enter no último campo; 320, 360, 390, 768 e 1280; dois temas; três motores), com anel de foco (`:focus-visible` e `box-shadow`) | `saidas/e09-{chromium,firefox,webkit}.txt`, `ux-E09-minha-conta-senha-errada-foco-{320,360,390,768,1280}-{claro,escuro}-{chromium,firefox,webkit}.png` (30) |
| Foco depois da provisória errada em "Defina a sua senha" | OK: `#senha-nova-atual` em 90 de 90, com anel e à vista (tela pública, sem topo fixo) | `ux-E09-defina-a-senha-provisoria-errada-foco-*` (30), mesmas saídas |
| O campo focado e o rótulo dele ficam À VISTA, fora do topo fixo (correção 5, achado próprio; pedido do gatekeeper) | **FALHA** acima de 600 px e no zoom de 200 por cento (achado 1); **FALHA** quando o campo inválido está abaixo da janela, atrás da barra do pé, até 600 px (achado 2) | `saidas/e09-faixa.txt`, `saidas/e09-zoom.txt`, `saidas/foco-abaixo-sha.txt`, `saidas/e09-enter.txt` |
| Email não quebra no meio da palavra nas janelas "Redefinir senha" e "Desativar usuário" (o FAIL da rodada 6, achado 2) | OK com email real de pontos de 62 caracteres (`maria.aparecida.figueiredo.santos@defesacivil.serraalta.gov.br`): só quebra depois de "@" ou ".", cabe na janela, sem rolagem, nas 5 larguras, 2 temas, 3 motores (60 janelas). Com parte local de 38 letras sem ponto, a 320 px a parte local quebra dentro (anotado 5), sem sair da janela | `saidas/e09-*.txt` linhas `[janela ...]`; `ux-E09-janela-{redefinir,desativar}-{pontos,sem-ponto}-*` (120) |
| Linha "Tentativa N para email" do histórico do ofício (correção 5, mesmo conserto) | OK com o email de pontos; **FALHA** com o email de parte local sem ponto: o texto sai do cartão a 360 px e a página rola na horizontal a 320 px, nos três motores (achado 3) | `saidas/oficio-email.txt`, `saidas/oficio-email-webkit.txt`, `ux-E09-oficio-tentativa-email-sem-ponto-320-claro-*.png` |
| Sessões: selo "Esta sessão" com ícone e texto, confirmação, foco na confirmação depois de encerrar | OK nos três motores e cinco larguras: foco em `DIV.aviso--sucesso` "As outras 2 sessões foram encerradas. Esta continua aberta." | `ux-E09-minha-conta-sessoes-*`, `ux-E09-minha-conta-confirmar-outras-*`, `ux-E09-minha-conta-depois-de-encerrar-*` |
| Frases de erro da senha (correção 4) | OK, iguais nos três motores: "A senha que você usa hoje não confere. Confira e digite de novo." e "A senha provisória que você recebeu não confere. Confira como ela foi anotada e digite de novo." | saídas acima |

Portão visual (seção 0 de `19-definicao-de-pronto.md`), item a item:

| Item | Resultado |
| --- | --- |
| Alinhamento | OK nas janelas, em Minha conta e em "Defina a sua senha"; botões das janelas empilhados com a mesma largura a 320 px (`ux-E09-janela-desativar-pontos-320-escuro-firefox.png`) |
| Espaçamento | OK: nada grudado; respiro igual entre os campos |
| Nada fora do lugar (cortado, escondido atrás de outro elemento, rolagem horizontal) | **FALHA**: rótulo e campo focados atrás do topo fixo (achado 1) e atrás da barra do pé (achado 2); texto cortado e rolagem horizontal no histórico do ofício (achado 3). Nas janelas e nas telas a 1280 px com altura de sobra, nada fora do lugar (`geometria()` em todas as 330 telas da rodada) |
| Hierarquia | OK |
| Texto bem escrito | OK nas frases desta etapa; ver anotado 6 (frase do cartão do ofício, anterior) |
| Responsivo, 320, 768, desktop, zoom 200 | **FALHA** no zoom de 200 por cento (640x450 de CSS): o campo inteiro focado fica atrás do topo nos três motores (`ux-E09-zoom200-minha-conta-senha-errada-640-claro-{chromium,firefox,webkit}.png`). A janela "Redefinir senha" no zoom de 200 cabe inteira (`ux-E09-zoom200-janela-redefinir-640-escuro-*`) |
| Dois temas, foco visível, contraste, estado não só por cor | Temas completos em todas as telas; anel de foco presente; selo da sessão com ícone e texto; mas o foco está ESCONDIDO nos casos dos achados 1 e 2 (WCAG 2.4.11, foco não encoberto) |
| Estados vazios e de erro | Desenhados; o erro de campo é o objeto da etapa |

Heurísticas de Nielsen: reconhecer, diagnosticar e recuperar do erro falha nos casos dos achados 1 e 2 (a pessoa erra, o foco vai ao campo, mas o campo e o rótulo estão encobertos; na Nova ocorrência a 390 px nada na tela mostra o que falta); visibilidade do estado e prevenção de erro OK nas sessões e nas janelas.

## Evidência

- `BASE_WEB=http://localhost:4797 BASE_API=http://127.0.0.1:3797 MOTOR=<motor> node test/layout-estreito.e2e.mjs` em `dc360/apps/web`, cada motor contra uma API recém-semeada: Firefox código 0, "Passou: 197 Falhou: 0"; WebKit código 0, 196 e 0; Chromium código 0, 197 e 0 (`saidas/10-layout-estreito-{firefox,webkit,chromium}.txt`). As primeiras execuções de WebKit e Chromium contra a instância já usada falharam por estado sujo (409 do órgão de teste repetido) e foram refeitas com a API reiniciada; o roteiro avisa que não é re-executável.
- `MOTOR=<motor> node SCRATCH/val-ux/e09.mjs` (código 0 nos três): 110 capturas por motor; resumo: foco certo, com anel e à vista 60 de 60 (Chromium), 60 de 60 (Firefox), 54 de 60 (WebKit; as 6 são o Enter com a página no alto, explicadas no achado 2) (`saidas/e09-{chromium,firefox,webkit}.txt`).
- `node SCRATCH/val-ux/e09-enter.mjs` (código 0): o Enter no último campo com o campo à vista, com a página no alto e o toque no botão, a 320 e 390, três motores (`saidas/e09-enter.txt`).
- `node SCRATCH/val-ux/e09-faixa.mjs` (código 0): de 601 a 1280 px de largura com 450 a 1024 de altura, três motores (`saidas/e09-faixa.txt`); `e09-faixa-notebook.mjs` a 1366x657 e 1280x720 (`saidas/e09-faixa-notebook.txt`).
- `node SCRATCH/val-ux/e09-zoom.mjs` (código 0): 640x450, três motores (`saidas/e09-zoom.txt`).
- `ROTULO=sha node SCRATCH/val-ux/foco-abaixo.mjs` (código 0): Nova ocorrência e Minha conta com o campo inválido abaixo da janela (`saidas/foco-abaixo-sha.txt`).
- Mutação para separar regressão de defeito antigo: `git show 1ed0b71:dc360/apps/web/src/componentes/foco.ts > dc360/apps/web/src/componentes/foco.ts`, construção do painel em `SCRATCH/val-ux/web-dist-mut` (`saidas/02-build-web-mutacao-foco.txt`, código 0), `git restore dc360/apps/web/src/componentes/foco.ts` logo em seguida (`git status --porcelain dc360` vazio). O painel mutado foi servido na mesma porta para `foco-abaixo.mjs` e `e09-faixa-mut.mjs` (`saidas/foco-abaixo-mutacao-foco-1ed0b71.txt`, `saidas/e09-faixa-mutacao-foco-1ed0b71.txt`) e trocado de volta pelo do SHA.
- `node SCRATCH/val-ux/oficio-email.mjs` e `oficio-email-webkit.mjs` (código 0 no segundo; o primeiro parou no WebKit por tempo de entrada sob carga, refeito à parte): a linha do histórico do ofício na tela de Ocorrência de verdade, com a resposta do detalhe do ofício acrescida de uma tentativa (o envio real exige provedor de email; o markup e o CSS são os do painel do SHA) (`saidas/oficio-email.txt`, `saidas/oficio-email-webkit.txt`).
- Erros de console: só os 401 provocados pela senha errada ("Failed to load resource", 30 por motor em Chromium e WebKit); nenhum `pageerror`.

## Cenários positivos

1. Senha atual errada em Minha conta por clique, Espaço e Enter, a 320, 360, 390, 768 e 1280 com a altura de um aparelho: foco no campo, anel visível, frase certa, nos três motores.
2. Provisória errada em "Defina a sua senha": o mesmo, nos três motores.
3. Janelas "Redefinir senha" e "Desativar usuário" com email institucional de 62 caracteres: quebra só depois de "@" e ".", nos três motores, cinco larguras, dois temas.
4. Encerrar as outras sessões: confirmação com a contagem, foco no aviso de sucesso, "Esta sessão" preservada.

## Cenários negativos

1. Senha errada (servidor responde 401, o cliente renova e repete): o foco espera o fim do envio e cai no campo, sem BODY em nenhum motor (o defeito da rodada 6 está consertado neste ponto).
2. Conferência da tela (senha nova curta) com a página no alto e Enter no último campo: o foco vai a `#conta-senha-nova`, que fica atrás da barra do pé em Chromium e WebKit (achado 2).
3. Email de parte local sem ponto nas janelas e no ofício (achados 3 e anotado 5).

## Tentativas de reprovar

- Repeti o achado 1 da rodada 6 nos três motores, nos três modos de envio, com conta nova por combinação (para não bater no bloqueio por tentativas) e esperando o botão voltar a ficar habilitado: consertado (90 de 90 no elemento certo).
- Procurei onde o "rótulo não fica atrás do topo" não vale: o conserto (`scroll-padding-top` maior e `scroll-margin-top`) está só no bloco de até 600 px, mas o topo tem duas linhas (141 px) também entre 601 e cerca de 700 px, e de uma linha (81 px) acima disso com o `scroll-padding-top` de 80. Medido: a 601x700 e 640x450 o campo inteiro fica atrás do topo; a 700x600, 768x600 e 900x600 o rótulo fica atrás do topo; a 1024x600 e 1280x600 também, nos três motores (`saidas/e09-faixa.txt`). O zoom de 200 por cento de uma tela de 1280x900 é exatamente 640x450.
- Procurei o caminho inverso: campo inválido ABAIXO da janela. `focar` agora faz `focus({ preventScroll: true })` mais `scrollIntoView({ block: "nearest" })`; "nearest" encosta o campo na borda de baixo da janela, e a barra do pé (sticky, 79 px) fica por cima, porque não há `scroll-padding-bottom`. Na Nova ocorrência, a pessoa digita o nome do solicitante e aperta Enter (o "Ir" do teclado do celular): o foco vai a "Endereço", que fica atrás da barra a 320 e 390 px nos três motores, com o rótulo e a frase "Informe o endereço" escondidos.
- Separei regressão de defeito antigo com a mutação descrita na Evidência: com o `foco.ts` de `1ed0b71`, a 390 px em Chromium e Firefox o campo "Endereço" ficava CENTRADO e à vista (`ux-E09-foco-abaixo-nova-ocorrencia-mutacao-foco-1ed0b71-390-claro-chromium.png`); no SHA ele está atrás da barra (`ux-E09-foco-abaixo-nova-ocorrencia-sha-390-claro-chromium.png`). Também regrediu o zoom de 200 por cento em Chromium e Firefox (antes: campo a 243..287 com o topo até 141; agora 80..124) e 1024x600 e 1280x600 (antes rótulo a 286; agora 48). A 320 px e no WebKit a 390 o defeito já existia antes.
- Email de 62 caracteres sem ponto na parte local (`plantaocoordenacaodefesacivilserraalta@...`), como pedido: nas janelas, a 320 px a parte local de 38 letras quebra dentro, sem sair da janela; na linha do ofício o mesmo email empurra o texto para fora do cartão a 360 px e a página rola na horizontal a 320 px (351 de 320), cortando o resto do cartão.
- Tema escuro, 360 e 768 px, zoom de 200 e os três motores em todas as telas da etapa.

## Achados

1. **bloqueia.** Acima de 600 px de largura e no zoom de 200 por cento, depois da senha atual errada em Minha conta, o campo focado ou o rótulo dele ficam atrás do topo fixo, nos três motores. A 640x450 (1280x900 com zoom de 200 por cento) o campo inteiro "Senha que você usa hoje" está encoberto e só a frase de erro aparece sob o topo (`ux-E09-zoom200-minha-conta-senha-errada-640-claro-{chromium,firefox,webkit}.png`, `ux-E09-faixa-minha-conta-senha-errada-640x450-claro-*`); a 601x700 também; a 768x600 o rótulo aparece cortado pelo topo (`ux-E09-faixa-minha-conta-senha-errada-768x600-claro-firefox.png`); a 1024x600 e 1280x600 o rótulo fica atrás do topo. Reprodução: entrar, Minha conta, janela de 768x600, preencher os três campos com a senha atual errada, tocar "Trocar senha". É o critério que a correção 5 declarou consertado ("rótulo ou campo escondido atrás do topo"), consertado só até 600 px; viola o portão ("escondido atrás de outro elemento", "zoom de 200 por cento sem perda") e WCAG 2.4.11. Parte é regressão desta correção (zoom 200, 1024x600 e 1280x600 em Chromium e Firefox, provado pela mutação), parte é defeito que a correção não alcançou (601 a 900 px).
2. **bloqueia.** Até 600 px, quando o primeiro campo inválido está abaixo da janela, `focar` (`componentes/foco.ts`, mudado nesta correção e usado por todas as telas com `focarPrimeiroInvalido`) o encosta na borda de baixo, atrás da barra fixa do pé. Caso natural: Nova ocorrência a 390 px, digitar o nome do solicitante e apertar Enter; o foco vai a "Endereço", que fica atrás da barra nos três motores, sem nada à vista que diga o que falta (`ux-E09-foco-abaixo-nova-ocorrencia-sha-390-claro-chromium.png`). Com o `foco.ts` anterior o campo ficava centrado e à vista em Chromium e Firefox (`...-mutacao-foco-1ed0b71-390-claro-chromium.png`): é regressão. O mesmo vale em Minha conta com a página no alto (`ux-E09-minha-conta-senha-errada-enter-pagina-no-alto-390-claro-webkit.png`). Conserto provável: `scroll-padding-bottom` da altura da barra no bloco de até 600 px, ou `block: "center"`.
3. **bloqueia.** A linha "Tentativa N para email" do histórico de envio do ofício (`Ocorrencia.tsx`, mudada nesta correção) não tem a "rede de segurança" que o comentário do CSS promete: o `<span>` é item de uma linha `flex`, e `overflow-wrap: break-word` não reduz a largura mínima de item flex. Com email cujo pedaço sem ponto passa de cerca de 30 caracteres (o teste pedido pelo gatekeeper, `plantaocoordenacaodefesacivilserraalta@serraalta.exemplo.gov.br`), o texto sai do cartão a 360 px e a página rola na horizontal a 320 px, cortando o resto do cartão ("Remoção da estrutura metá", "provedor de em"), nos três motores (`ux-E09-oficio-tentativa-email-sem-ponto-320-claro-{chromium,firefox,webkit}.png`; `saidas/oficio-email.txt`). Com email de pontos fica certo. Conserto provável: `min-width: 0` no `<span>`. Limite da prova: a tentativa foi acrescida à resposta do detalhe do ofício (o envio real exige provedor de email); a tela, o markup e o CSS são os do SHA.
4. **corrige antes de crescer.** No WebKit, com a página no alto e Enter no último campo, o mesmo efeito do achado 2 aparece em Minha conta a 320 e 390 px (6 das 60 medições do WebKit em `saidas/e09-webkit.txt`). Com o campo à vista (o caso natural) o WebKit acerta (`saidas/e09-enter.txt`).
5. **anotado.** Parte local de email sem nenhum ponto e maior que a largura útil (38 letras a 320 px) quebra dentro nas janelas ("...defesacivilserraal / ta@"): é a rede de segurança funcionando, sem alternativa a não ser sair da janela. Aceitável; registro para Rafael.
6. **anotado.** Fora do escopo desta etapa e anterior a ela, visto no cartão do ofício: "As 2 tentativas ficou registrada e o provedor de email não aceitou a mensagem" (`oficio-regras.ts:58`, concordância) e o botão "Ver as 1 tentativa" / "Esconder as 1 tentativa" (`Ocorrencia.tsx`, concordância no singular) (`ux-E09-oficio-tentativa-email-sem-ponto-320-claro-webkit.png`). Texto mal escrito pelo portão; não é desta correção.
7. **anotado.** O texto de exemplo da busca do topo aparece cortado a 320 px ("Buscar registro ou funç") em todas as telas logadas; anterior, da busca global.

## Não verificado

- Leitor de tela (o anúncio da frase de erro e da confirmação por voz): pendência humana.
- O envio real de ofício por email (exige provedor); a linha do histórico foi medida com a resposta do detalhe acrescida.
- Safari de aparelho e navegadores Android reais (WebKit do Playwright no macOS não é o Safari do iPhone).
- O modo de demonstração (painel sem API).
- Os passos do CI em Linux com Firefox e WebKit: confiei no run 39420436042 (9 de 9 jobs com sucesso, `head_sha` 55209ab, conferido pela API pública); não baixei os artefatos (exigem token).
- A cópia da senha temporária sem permissão de área de transferência.

## Risco residual

Os dois consertos da rodada 6 valem no caso que foi medido (até 600 px, campo acima da janela): o foco não cai mais em BODY e o email das janelas quebra nos pontos. Mas a mudança de `focar` para `scrollIntoView({ block: "nearest" })` vale para todo o painel e trouxe o encobrimento do campo focado pela barra do pé no celular (Nova ocorrência, a tela mais usada) e pelo topo em tablet, janela baixa e zoom de 200 por cento. Quem usa teclado ou leitor de tela, ou só o dedo, erra e não vê onde está.

## Motivo do humano

A validação humana da etapa continua do Rafael (fazer o fluxo no painel e aprovar as frases). Capturas para ele: `ux-E09-zoom200-minha-conta-senha-errada-640-claro-chromium.png`, `ux-E09-faixa-minha-conta-senha-errada-768x600-claro-firefox.png`, `ux-E09-foco-abaixo-nova-ocorrencia-sha-390-claro-chromium.png` ao lado de `ux-E09-foco-abaixo-nova-ocorrencia-mutacao-foco-1ed0b71-390-claro-chromium.png`, `ux-E09-oficio-tentativa-email-sem-ponto-320-claro-webkit.png`, e as positivas `ux-E09-janela-redefinir-pontos-320-escuro-chromium.png` e `ux-E09-minha-conta-senha-errada-foco-390-claro-firefox.png`.
