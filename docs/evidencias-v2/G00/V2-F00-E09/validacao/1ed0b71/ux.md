---
validador: ux
modelo: claude-opus-5-5
etapa: V2-F00-E09
sha_validado: 1ed0b71
ci_run: ausente
rodada: 6
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

Montagem: API do SHA (árvore de `dc360/` idêntica a `1ed0b71`; HEAD `5044e7a` só muda STATUS e ESTADO-ATUAL) na porta 3791, PGlite semeado, `NOTIFICADOR_ARQUIVO` no scratchpad; painel construído do SHA com `VITE_API_URL` em pasta do scratchpad e servido por `vite preview` na 4791. Chromium e Firefox do Playwright 1.62.1 (`dc360/node_modules`). Capturas minhas em `capturas/` desta pasta (prefixo `ux-E09-`). Saídas brutas em `SCRATCH/validadores/ux/saidas/` (SCRATCH é o scratchpad da sessão do gatekeeper).

Critérios da etapa que tocam a dimensão, e o que foi tentado contra cada um:

| Critério (bloco da etapa e correções) | Resultado | Prova |
| --- | --- | --- |
| Botões por linha só quando `motivoParaNaoAdministrar` é nulo e nunca na própria conta | OK: administradora sem botões na própria linha ("Desativar" desabilitado); coordenadora com 0 botões na administradora, 0 na própria, 2 no operador | `ux-E09-usuarios-administradora-1280-claro.png`, `ux-E09-usuarios-coordenadora-1280-claro.png`, `saidas/e09.txt` |
| `ConfirmarAcao` destrutiva com o nome da pessoa | OK: "Encerrar sessões de Marcos Vinicius Teles de Albuquerque Sobrinho" e "Redefinir a senha de ..." quebram em linhas dentro do botão; foco inicial em "Cancelar" | `ux-E09-confirmar-encerrar-{1280,390,320}-{claro,escuro}.png`, `ux-E09-confirmar-redefinir-*` |
| `SenhaTemporaria`: senha uma vez, fonte tabular, copiar, frase de que não volta, janela no topo (correção 4) | OK: título à vista nas seis telas; a 320 px o foco vai ao painel sem rolar; "Copiar senha" e "Já anotei a senha" recebem o toque (`elementFromPoint`) | `ux-E09-senha-temporaria-*`, `saidas/e09.txt` |
| Aviso passageiro que espera a janela (correção 4) | OK: com a janela aberta o aviso não é desenhado (`avisoVisivel: false`); fechada a janela, ele aparece e o foco volta a "Redefinir senha" | `ux-E09-aviso-depois-da-janela-*` |
| `MinhasOutrasSessoes`: selo "Esta sessão" com ícone e texto, confirmação que diz que esta continua aberta, foco na confirmação | OK em Chromium nos quatro tamanhos e dois temas: foco em `DIV.aviso--sucesso` "As outras N sessões foram encerradas. Esta continua aberta." | `ux-E09-minha-conta-sessoes-*`, `ux-E09-minha-conta-confirmar-outras-*`, `ux-E09-minha-conta-depois-de-encerrar-*` |
| Frase da senha atual errada com acento, nomeando o campo e dizendo o que fazer (correção 4) | OK: "A senha que você usa hoje não confere. Confira e digite de novo." e "A senha provisória que você recebeu não confere. Confira como ela foi anotada e digite de novo.", ligadas ao campo | `ux-E09-minha-conta-senha-errada-*`, `ux-E09-defina-a-senha-provisoria-errada-*` |
| Foco depois de enviar a senha errada vai ao campo inválido, e não a BODY (correção 4, item 3; camada 12 da DoD) | **FALHA em Firefox** (achado 1) | `saidas/foco.txt`, `saidas/layout-estreito-firefox.txt`, `ux-E09-minha-conta-senha-errada-foco-firefox-390-claro.png` |
| Email que não quebra no meio da palavra (correção 4; portão "quebrado no meio da palavra") | OK na tabela de Usuários para emails com pontos; **FALHA na janela "Redefinir senha"** (achado 2) | `ux-E09-janela-dica-redefinir-ana-390-claro.png`, `ux-E09-confirmar-redefinir-320-claro.png`, `saidas/e09-dica.txt` |
| Estados de erro e vazio das sessões | OK: "Não foi possível carregar as suas sessões." com "Tentar de novo" (ver anotação 4) | `ux-E09-minha-conta-sessoes-erro-*` |

Portão visual (seção 0 de `19-definicao-de-pronto.md`), item a item:

| Item | Resultado |
| --- | --- |
| Alinhamento | OK: grade 2x2 dos botões alinhada entre as linhas; tabela cabe em 1280 px sem rolagem (`ux-E09-usuarios-administradora-1280-claro.png`) |
| Espaçamento | OK: nada grudado; botões empilhados com respiro igual nas janelas a 320 e 390 px |
| Nada fora do lugar | FALHA: email quebrado no meio da palavra na janela "Redefinir senha" (achado 2). Sem rolagem horizontal de página em nenhuma tela medida (`saidas/e09.txt`). O cabeçalho e a barra fixos aparecem no meio das capturas de página inteira (artefato da captura de página inteira, não da tela) |
| Hierarquia | OK |
| Texto bem escrito | OK nas frases da etapa; ver anotação 4 sobre "Erro interno." |
| Responsivo (320, 768, desktop, zoom) | 320, 390, 768 e 1280 sem rolagem de página; zoom de 200 por cento não medido nesta etapa (ver Não verificado) |
| Dois temas, foco visível, contraste, estado não só por cor | Temas completos; selo "Esta sessão" com ícone e texto; foco: FALHA em Firefox (achado 1) |
| Estados vazio e de erro | OK no desenho |

Heurísticas de Nielsen: visibilidade do estado (confirmação focada, contagem de sessões na pergunta) OK; prevenção de erro (senha temporária protegida contra clique fora e contra o aviso por cima) OK; reconhecer, diagnosticar e recuperar do erro: o texto diz o que fazer, mas em Firefox quem usa teclado fica em BODY depois do erro, sem ser levado ao campo que precisa corrigir (achado 1).

## Evidência

- `node SCRATCH/validadores/ux/foco.mjs` (código 0), saída `saidas/foco.txt`: Chromium e Firefox, Minha conta e "Defina a sua senha", três modos de envio (clique, Espaço no botão focado, Enter no último campo), três repetições cada.
- `MOTOR=firefox node test/layout-estreito.e2e.mjs` em `dc360/apps/web`, contra a minha API recém-semeada e o meu painel: código 1, "Passou: 142 Falhou: 7" (`saidas/layout-estreito-firefox.txt`). O mesmo arquivo em Chromium contra uma API recém-semeada: código 0, "Passou: 149 Falhou: 0" (`saidas/layout-estreito-chromium.txt`). Uma segunda execução em Chromium contra a instância já usada falhou por estado sujo (pessoas e órgão de teste repetidos, 409) e foi descartada (`saidas/layout-estreito-chromium-instancia-suja.txt`).
- `node SCRATCH/validadores/ux/e09.mjs` (código 0), saída `saidas/e09.txt`, 80 capturas `ux-E09-*` (lista de usuários a 1280, 768, 390 e 320 nos dois temas; confirmações, senha temporária e aviso a 1280, 390 e 320 nos dois temas; Minha conta nos quatro tamanhos; erro de sessões; "Defina a sua senha").
- `node SCRATCH/validadores/ux/e09-dica.mjs` e `dica390.mjs` (código 0), saídas `saidas/e09-dica.txt` e `saidas/dica390.txt`, capturas `ux-E09-janela-dica-*` e `ux-E09-janela-redefinir-ana-*`.
- Capturas do foco: `ux-E09-minha-conta-senha-errada-foco-{chromium,firefox}-390-claro.png`, `ux-E09-defina-senha-provisoria-errada-foco-{chromium,firefox}-390-claro.png`.
- Medidor de geometria próprio (`SCRATCH/validadores/ux/lib.mjs`, função `geometria`): rolagem horizontal, elemento fora da janela, controle cortado, toque abaixo de 44 px e palavra quebrada no meio (por caractere, com `Range`).

## Cenários positivos

1. Administradora encerra as sessões e em seguida redefine a senha da pessoa de nome longo (o "perdi o celular"): pergunta com nome, senha temporária à vista, aviso adiado até a janela fechar, foco devolvido ao botão.
2. Minha conta com 2 a 11 sessões: confirmação, encerramento, foco na confirmação, "Esta sessão" preservada.
3. Senha provisória entra e leva a "Defina a sua senha".

## Cenários negativos

1. Coordenadora não vê botões na linha da administradora nem na própria (`saidas/e09.txt`).
2. Senha atual errada em Minha conta e provisória errada em "Defina a sua senha": frase certa no campo certo, nos dois motores; foco certo só em Chromium.
3. Leitura das sessões com 500 (interceptado): estado de erro com "Tentar de novo".

## Tentativas de reprovar

- Achado cruzado do QA reproduzido de forma independente, por sonda própria e pela suíte do repositório: em Firefox o foco fica em BODY depois da senha errada, 9 de 9 por clique e por Espaço no botão focado, nas duas telas. Com Enter no último campo o foco fica nesse campo (`#conta-senha-repetida`, `#senha-nova-repetida`), e não no campo errado. Em Chromium, 27 de 27 no campo inválido. Não é intermitente nem artefato do teste: o teste de mais folga espera 1 s depois de o erro aparecer e o foco continua em BODY.
- Leitura do código para separar defeito do motor de defeito da tela: `MinhaConta.tsx:109` e `Entrar.tsx:524` chamam `depoisDePintar(() => focarPrimeiroInvalido(...))` dentro do `catch` de um `await`; `depoisDePintar` (`componentes/foco.ts:95`) é um único `requestAnimationFrame`, agendado ANTES de o React aplicar o estado. Em "Defina a sua senha" o caminho reserva (`#senha-nova-erro`) também não é achado, o que indica que o quadro roda antes da renderização com `aria-invalid`. Os casos em que o foco é levado por efeito depois da renderização (`Aviso` com `foco`) funcionam em Firefox (E10: `pedido enviado` e `definir sucesso` com foco no aviso, `saidas/e10-firefox.txt`). Causa provável, não provada por mutação.
- Emails longos: com os emails de prova do próprio e2e (subdomínios e parte local comprida), a tabela segura; a janela "Redefinir senha" não (achado 2). Com os emails da semente (`jonas.ferreira@...`, `diego.alves@...`) a janela não quebra a 320, 360 e 390 px.
- Nome de 45 caracteres nos botões da janela a 320 px: quebra em linhas dentro do botão, sem corte.
- Tema escuro em todas as telas; 768 px em Usuários e Minha conta.
- Toque no aviso por cima da janela (defeito da rodada 5): o aviso não está desenhado com a janela aberta; os botões da janela recebem o toque.

## Achados

1. **bloqueia.** Em Firefox, depois de enviar a senha atual errada, o foco cai em BODY em Minha conta e em "Defina a sua senha" (clique e Espaço no botão focado; 9 de 9 em cada tela), e com Enter fica no último campo, não no campo inválido. É exatamente o defeito que a correção 4 (item 3, "Foco depois de enviar") declarou consertado, e o mesmo que a correção 2 tratou como defeito (WCAG 2.4.3) em outra peça desta etapa; a prova da correção foi só em Chromium. O e2e da etapa reprova: `node scripts/e2e-api.mjs firefox` sai 1 porque `layout-estreito.e2e.mjs`, seção 10, falha 7 verificações (reproduzido: `saidas/layout-estreito-firefox.txt`, linhas 120 a 144); o mesmo arquivo passa 149 de 149 em Chromium. Firefox é motor suportado do painel (o README pede Chromium e Firefox para `test:e2e`, e `e2e-api.mjs` aceita `firefox`). Reprodução: entrar como Helena, Minha conta, preencher a senha atual errada e a nova duas vezes, focar "Trocar senha" e apertar Espaço; `document.activeElement` é BODY (`saidas/foco.txt`; `ux-E09-minha-conta-senha-errada-foco-firefox-390-claro.png`). Conserto provável: levar o foco por efeito sobre os erros de campo (como o `Aviso` com `foco` já faz), e não por `requestAnimationFrame` agendado antes de o estado ser aplicado.
2. **bloqueia.** Na janela "Redefinir senha" (entrega da etapa), a linha "matrícula, email, papel" (`.modal__painel .campo__dica`) quebra o email no meio da palavra: a 390 px "ana.mvggicak@coordenadoria.defesacivil.secretar / ia.serraalta..." (claro e escuro), a 360 px "...defesacivil.sec / retaria...", a 320 px "...coordenadoria.defesa / civil..." e, com um email comum de 39 caracteres, "longo.mvggicak@serraalta.exemplo.go / v.br" a 320 px. Capturas: `ux-E09-janela-dica-redefinir-ana-390-claro.png`, `ux-E09-janela-redefinir-ana-390-escuro.png`, `ux-E09-confirmar-redefinir-320-claro.png` (e `-320-escuro`). A correção 4 consertou a tabela com `EmailQuebravel` e deixou a janela com a regra da correção 1 ("quebra onde precisar"). Viola "quebrado no meio da palavra" do portão, na largura mínima exigida e também a 390 px; é o mesmo critério que decidiu a arbitragem da rodada 5 sobre a tabela. Conserto: usar `EmailQuebravel` também na dica da janela.
3. **anotado.** Na tabela, o email de parte local comprida sem ponto ("joanaplantao24horasde / fesacivilmunicipalmvggi / cak@") quebra dentro da parte local a 1280 px; o implementador registrou a escolha (não há ponto onde quebrar). Caso extremo, sintético; aceito como registrado.
4. **anotado.** O erro de leitura das sessões repassa a frase do servidor: "Não foi possível carregar as suas sessões. Erro interno." ("Erro interno." não diz nada a quem lê; o botão "Tentar de novo" diz o que fazer). Defeito de todo o painel, anterior.
5. **anotado.** Nas capturas de página inteira o cabeçalho e a barra fixos do celular aparecem no meio da página; é artefato da captura, já registrado pelo implementador.

## Não verificado

- Zoom de 200 por cento nas telas desta etapa (medi só a entrada, na E05); WebKit; leitor de tela (o anúncio da confirmação por voz segue pendência humana, CP-32).
- Modo de demonstração (painel sem API): não construí o painel em modo local nesta rodada.
- Causa do achado 1 provada só por leitura e comparação entre motores, sem mutação do código.
- A cópia da senha sem permissão de área de transferência.

## Risco residual

Quem usa teclado ou leitor de tela em Firefox, depois de errar a senha atual ou a provisória, fica sem foco útil e sem ser levado ao campo a corrigir (a frase do campo tem `role="alert"` e deve ser anunciada, mas a pessoa recomeça a página do zero). Emails institucionais longos com subdomínios, comuns em prefeitura, aparecem partidos no meio na janela de redefinição em celular. Os dois consertos são pequenos e localizados.

## Motivo do humano

A validação humana da etapa continua do Rafael (fazer o fluxo no painel e conferir a frase da senha única e as confirmações). Capturas para ele: `ux-E09-senha-temporaria-390-claro.png`, `ux-E09-aviso-depois-da-janela-390-claro.png`, `ux-E09-minha-conta-depois-de-encerrar-390-claro.png`, `ux-E09-janela-dica-redefinir-ana-390-claro.png`, `ux-E09-minha-conta-senha-errada-foco-firefox-390-claro.png`.
