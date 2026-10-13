# V2-F00-E09, correção 1: telas estreitas sem nada cortado e o painel que não pede o que o papel não vê

Base: `81a5223`, ramo `v2/f00`. Motivo: rodada 1 reprovada pela UX (portão visual da seção 0 de `docs/roadmap-v2/19-definicao-de-pronto.md`), SHA validado `7005a60`. As outras três dimensões passaram.

## Fatos

**O que a validação provou.** A 390 px o botão "Encerrar sessões de Marcos Vinicius Teles" passava da janela e perdia a borda; "Mapa da cidade" aparecia cortado na barra do pé da tela. A UX anotou ainda o painel do sino cortado a 390 px e uma palavra quebrada no Painel a 1280 px, e o agente de capturas viu `GET /ocorrencias/devolvidas` responder 403 em todo carregamento do Painel por operador.

**Causas medidas no navegador (saída `01`).**

1. `.botao` é `white-space: nowrap` e o botão de `ConfirmarAcao` repete o objeto por regra: o painel da janela chegava a `scrollWidth` 527 contra 270 (320 px) e 340 (390 px). Vale para toda janela do `Modal`.
2. A barra era uma fila de itens de rótulo em linha única: "Mapa da cidade" ia de 255 a 416 px numa tela de 320, 360, 361 ou 390.
3. O painel do sino ficava ancorado no botão (`right: 0`), que está no meio do topo: saía 48 px pela esquerda a 390 px.
4. `.tabela__secundario` usa `overflow-wrap: anywhere` (certo para endereço), que encolhe a coluna "Equipe" a uma letra: "Não despach / ada".
5. `Painel.tsx` e `Ocorrencias.tsx` pediam as devolvidas a todo papel; a rota exige `despachar_equipe`. O operador levava 403 por visita e lia a frase "a consulta das ocorrências devolvidas do campo não respondeu agora", falsa para quem nunca poderia ver a lista.
6. Achado novo, mesma tela: a linha "matrícula, e-mail, papel" da janela (`.campo__dica`) trazia o e-mail inteiro e, a 320 px, passava do respiro da borda (247 px de e-mail numa caixa de 222).

**O que mudou.**

- `dc360/apps/web/src/estilos/app.css`: `.modal__rodape .botao` quebra linha e nunca passa da janela; até 600 px os botões empilham, cada um com a largura toda; `.modal__painel .campo__dica` quebra onde precisar. Barra do pé da tela (até 900 px) em ladrilhos de ícone e rótulo (até duas linhas) com número fixo de ladrilhos inteiros por `--barra-visiveis` (6 até 900, 4 até 600, 3 até 360); grupos e rodapé viram `display: contents` para a conta ser a da barra; altura da barra e deslocamento do aviso passageiro vêm da mesma conta (`--barra-altura`); `.sino` e `.sino__painel` ancorados na tela até 600 px; `.tabela__secundario--frase`. Só tokens `--ds-*`: nenhuma cor, raio, sombra ou duração nova (a única medida nova em `px` é o ícone de 18 px, que `.lateral__item svg` já usava).
- `componentes/Estrutura.tsx`: rótulo em `span.lateral__texto`; ao trocar de rota a barra rola (por `scrollLeft`, não `scrollIntoView`) até o ladrilho da tela atual ficar à vista. A primeira versão usava `scrollIntoView` e o e2e local pegou o defeito: o Chromium toma isso como ponto de partida do Tab e o primeiro Tab deixava de cair em "Pular para o conteúdo". Trocado e travado por verificação nova.
- `devolucao.ts`: `ACAO_PARA_VER_DEVOLUCOES` (`despachar_equipe`) e `podeVerDevolucoes(papel)`, que lê `podeExecutar` do pacote compartilhado. `Painel.tsx` e `Ocorrencias.tsx` só pedem a lista a quem pode; quem não pode recebe lista vazia e nenhuma frase de falha. O servidor continua recusando com 403 (esconder o pedido não é controle de acesso).
- `scripts/e2e-api.mjs` roda `test/layout-estreito.e2e.mjs` depois da suíte principal, na mesma API e no mesmo painel.
- Docs: `apps/web/PENDENCIAS.md` (seção 11 nova e a linha da tabela do item 9.2), `README.md` (643 para 649; 2916 para 2922) e `docs/COLOCAR-DE-PE.md` (4819 para 4825).

**Provas.**

- Teste novo `dc360/apps/web/test/layout-estreito.e2e.mjs` (Chromium e Firefox, contra API e painel de pé): cria por API uma pessoa de nome longo e uma coordenadora com e-mail único; mede retângulos das janelas "Encerrar sessões" e "Redefinir senha" a 320, 390, 768 e 1280 px e da barra a 320, 360, 361, 390 e 768 px (botão dentro da área útil, sem rolagem horizontal do painel nem da página, texto não cortado, toque mínimo de 44 px, "Mapa da cidade" inteiro à vista, ladrilho da tela atual à vista, primeiro Tab no atalho de pular); e conta os pedidos de `/ocorrencias/devolvidas` por papel (operador 0 em `/painel` e `/ocorrencias`; coordenadora com 200).
- VERMELHO antes (`saidas/01`, código-fonte da `81a5223` com o teste final): 37 aprovadas, 13 falhas, mais o erro de console de 403. DEPOIS (`saidas/02`): 50 aprovadas, 0 falha, zero erro de console. Antes da última rodada o teste ficou verde três vezes seguidas, depois de achar e consertar o item 6 (que aparecia de forma intermitente, conforme o tamanho do e-mail gerado).
- Teste estático em `test/acessibilidade.test.ts` (3 casos novos e o do aviso passageiro atualizado para `--barra-altura`) e `test/devolucao.test.ts` (3 casos: decisão igual à matriz para todos os papéis, quem pode e quem não pode, e a tela pergunta antes de pedir).
- Capturas reais com Playwright, API e painel de pé, 320, 390, 768 e 1280 px, claro e escuro: `capturas/antes/` (48, código da `81a5223`) e `capturas/depois/` (52, inclui `organizacao-administradora-*`, tela atual na parte que rola). Telas: janelas "Encerrar sessões" e "Redefinir senha" com nome de 45 caracteres, Painel e Mapa da administradora (barra), Painel com o sino aberto, Painel do operador (sem 403 e sem a frase). Eventos de console nas capturas: antes, 2 respostas 403 no operador; depois, nenhum evento em nenhuma sessão.

**Regressão (saídas `03` a `11`, todas depois do conserto).** `npm run test --workspace @dc360/web`: 43 arquivos, 649 testes (643 antes, mais 6). `npm run typecheck`: código 0. `npm run test:e2e:api` (sobe API e painel do zero): 279 aprovadas, 0 falha, mais 50 de `layout-estreito` em Chromium; o mesmo em Firefox. `npm run test:e2e` (modo local): 70 aprovadas, 0 falha, em Chromium e em Firefox. `npm run conferir:numeros`: 24 afirmações, 0 divergência (depois de atualizar os três números acima). Portão de conteúdo: 8 testes. `npm run test:scripts`: 217 testes, 213 aprovados, 4 pulados, 0 falha.

**Limitações.**

- A barra ainda rola na horizontal (onze destinos, três a quatro ladrilhos à vista); já não corta rótulo, mas só o ladrilho que espia na borda sugere a rolagem. Menu "mais" ou abas seguem como decisão da F10 (registrado em `PENDENCIAS.md`, seção 11).
- Nenhum aparelho físico: viewports de 320 a 1280 px no Chromium e no Firefox do Playwright; zoom de 200 por cento e leitor de tela não verificados.
- `scripts/baseline.mjs` ainda espera "Passou: 271" da suíte principal e a execução imprime 279 (diferença anterior a esta correção, de etapas anteriores). Não toquei no passo, por estar fora do escopo, mas a linha de base vai marcá-lo.
- A lista `ESPERADOS` de `fluxo-api.e2e.mjs` continua aceitando 403 em qualquer rota; a ausência do 403 de devolvidas é provada pelo teste novo, por papel.
- Os 11 arquivos alterados e o teste novo estão em `diff-da-correcao.patch`. Nada foi commitado nem enviado; STATUS, `VEREDITO.md` e `validacao/` não foram tocados.

## Justificativa

A causa dos dois defeitos que reprovaram a etapa era a mesma: layout que supõe rótulo curto. O botão que repete o objeto é uma regra boa de `ConfirmarAcao` (a janela que não diz o que vai acontecer foi o defeito original), então a correção não encurta o rótulo, deixa-o quebrar, no componente compartilhado e não numa tela só, para valer para toda confirmação presente e futura. Empilhar os botões no celular segue a mesma ideia de área de toque: dois alvos estreitos lado a lado com rótulo de duas linhas são piores que dois blocos de largura inteira.

Na barra, cortar um rótulo no meio é o pior dos dois mundos (a pessoa lê metade da palavra e não sabe que rola). Com número fixo de ladrilhos inteiros o corte some e "Mapa da cidade" é sempre um dos três primeiros em qualquer papel, então nunca cai na parte que rola. A conta única da altura (`--barra-altura`) mantém o aviso passageiro acima da barra sem número escolhido à mão, como a regra do design system exige. Trazer a tela atual para dentro da barra evita o efeito colateral do novo desenho: abrir "Organização" por um link e não ver nenhum ladrilho marcado.

Sobre as devolvidas, a decisão sai da matriz de permissões do pacote compartilhado, e não de um papel escrito na tela, porque é a matriz que o servidor usa: se ela mudar, a tela acompanha. A frase falsa foi o defeito pior do que o 403: ela mandava o operador desconfiar de uma marca que nunca foi dele. O 403 do servidor fica de propósito, porque a tela não é controle de acesso.

O teste mede geometria no navegador em vez de ler classes de CSS porque os dois defeitos passaram por testes que liam a folha e nunca mediam a tela; o teste estático guarda a causa (rótulo `nowrap` na barra, `flex-basis` por conta de ladrilhos) e o e2e guarda o efeito. Rodar o e2e várias vezes antes de aceitar o verde foi o que revelou o defeito do e-mail a 320 px.
