---
validador: qa (general-purpose)
modelo: claude-sonnet-5-5
etapa: V2-F00-E09
sha_validado: dda7557
ci_run: 40132234324
rodada: 9
herdado_de:
tags: [UI, A11Y, AUTH, TENANT, LGPD]
nivel_de_prova_exigido: [E1, E2]
nivel_de_prova_obtido: [E1, E2]
veredito: PASS
confianca: media
humano_necessario: sim
escalar: nenhum
---
## Critérios verificados

SCRATCH = `/tmp/claude-501/-Users-rafaelgomes-Documents-city-hall/d900a13c-1e42-4b88-9465-82d873257632/scratchpad/qa-E09` (saídas numeradas; scripts em `SCRATCH/rig/`). Árvore em `d4683cc` (produto idêntico a `dda7557`), Node 24.15.0, macOS. Painel construído do código da árvore para `SCRATCH/rig/dist*` (nunca no `dist` da árvore), API real (PGlite) em 6811/6821, painel em 6812/6822/6823. A máquina estava com carga 30 a 64 (outros validadores): nada do que rodei depende de tempo curto.

| Critério (DoD e cinco campos de teste) | Resultado | Prova |
| --- | --- | --- |
| 8 casos de `seguranca-da-conta.test.ts` verdes | atende | `01-test-web.txt`: painel 737 de 737, 48 arquivos, código 0 (inclui `seguranca-da-conta` 8, `paridade-dos-modos` 10, `correcao-7-da-e09` 14) |
| Administradora redefine a senha de um operador; o login com a temporária exige a troca | atende | API `20-sonda-api.txt` (100 de 100): 200 com `senhaTemporaria`, sessão antiga 401, senha antiga não entra, temporária entra com `trocaDeSenhaObrigatoria: true`, escrita 403 `troca_de_senha_obrigatoria`, troca 200, definitiva entra, temporária não entra mais. Navegador: `21-sonda-ui-*.txt` (a temporária mostrada na janela é a que entra, nos 4 tamanhos) |
| `GET /auth/sessoes` marca a sessão atual, sem IP nem user-agent completo | atende | `20`: 4 sessões, exatamente uma `atual`, resposta sem o marcador de user-agent enviado nem IP; UI `21`: lista sem IP/UA |
| Encerrar "as outras" mantém a de onde se clicou | atende | `20` (a sessão de origem renova 200, as três outras 401) e `21` (Minha conta, 390 e 1280: confirmação com o foco, lista relida com 1 item, a sessão segue valida, os outros aparelhos caem na escrita) |
| Negativo: coordenadora não vê os botões em posto igual ou maior | atende | `24-papeis-ui.txt`: Helena vê os dois botões em Diego e Jonas, nenhum em Rita (administradora) nem na própria linha; `posto-abaixo-do-seu.test.ts` (em `14-test-api-e09.txt`) |
| Negativo: API recusa `autoredefinicao` e `autoencerramento` (422) | atende | `20`: Rita e Helena, id próprio e em MAIÚSCULAS, nas duas rotas: 422 |
| Negativo: `GET /usuarios/:id/sessoes` de posto acima: 403 `posto_insuficiente` | atende | `20`: Helena sobre Rita nas três rotas, corpo `{"erro":"posto_insuficiente",...}` |
| Isolamento: outro município responde 404 nas três rotas | atende | `20`: Aurélio (Vale Fundo) sobre Diego, Jonas, Rita e Diego em maiúsculas, nas três rotas: 404 com o mesmo código do id inexistente; `organizacaoId` no corpo e `x-organizacao-id` no cabeçalho não mudam nada; Rita (Serra Alta) sobre Simone (Vale Fundo): 404; as senhas de Diego e Simone seguem valendo |
| Autorização: agente e operador nas três rotas: 403 `sem_permissao`; sem token 401 | atende | `20`: Jonas, Diego, Simone, Tarcísio, 12 combinações, 403 `sem_permissao`; sem token e com token lixo, 401 nas três rotas e em `/auth/sessoes` |
| O botão escondido não é o controle | atende | os 403 e 404 acima vêm de chamada direta à API, sem passar pelo painel; `24`: agente e operador em `/usuarios` não veem tabela nem botões |
| Telas: senha temporária mostrada uma vez, "Já anotei a senha" | atende | `21-sonda-ui-{chromium,firefox,webkit}.txt`, 320x568, 390x664, 1280x800, 320x256: abre no topo (`scrollTop` 0), formato `xxxx-xxxx-xxxx`, título à vista, Tab e Shift+Tab ficam dentro da janela, "Copiar senha" copia (Chromium lê a área de transferência), "Já anotei" tira a senha do DOM, ela não vai a storage nem à URL, recarregar não a mostra |
| Minha conta (listar, encerrar as outras, cancelar não derruba) | atende | `21` P7; cancelar mantém o outro aparelho vivo |
| Botões e listagem nos dois modos | atende | modo API acima; modo local (`rig/sonda-local2.mjs`, painel sem `VITE_API_URL`): Usuários e Minha conta explicam em vez de oferecer ("não há senha para redefinir nem sessão para encerrar", "não há o que listar nem encerrar"), zero erro de console. É o que o bloco diz ("O modo local explica em vez de oferecer") |
| Nenhuma rota nova sem permissão | atende | `superficie.test.ts` 9 de 9 e as duas rotas de leitura recusam sem token, com token lixo, com papel errado |
| E2E: seção 26 de `fluxo-api.e2e.mjs` | atende | local: Chromium 288 de 288 e Firefox 288 de 288, código 0, zero erro de console, 50 verificações OK na seção 26 em cada (`12-fluxo-api-chromium.txt`, `13-fluxo-api-firefox.txt`) |
| Regressão obrigatória | atende | web 737/737; API, 9 arquivos da E09 e do lote: 474 de 474 (`14-test-api-e09.txt`); `superficie` e `paridade-dos-modos` verdes |
| Validação humana (Rafael faz o fluxo e confere a frase da senha única) | pendente | fora do alcance do validador (H39) |

## Evidência

- `npm run build:shared`: código 0 (`00-build-shared.txt`). `npm run test --workspace @dc360/web`: código 0, 737 de 737 (`01-test-web.txt`).
- `layout-estreito.e2e.mjs` com a seção 14 nova, painel construído por mim contra API própria, API nova por motor (`rig/matriz.sh`): Chromium 325 e 0, código 0 (`10-layout-chromium.txt`); Firefox 325 e 0 (`11-layout-firefox.txt`); WebKit 324 e 0 (`11-layout-webkit.txt`); "Zero erro de console" nos três (`11-matriz.log`). A seção 14 tem as 38 verificações novas, todas OK.
- CI `40132234324` (sobre `d4683cc`): 12 de 12 `success` (`50-ci.txt`). Log do job "Fluxo ponta a ponta no navegador" lido (`51-ci-e2e-log.txt`): Chromium `fluxo-api` 288 e 0 e layout 325 e 0; Firefox 288 e 0 e 325 e 0; WebKit Linux (`--so-layout`) 325 e 0; zero "FALHA" no log.
- Sonda HTTP própria contra a API real, 100 de 100 (`20-sonda-api.txt`, `rig/sonda-api.mjs`).
- Sonda de navegador própria nos três motores (`21-sonda-ui-chromium.txt`: 83 OK e 1 FALHA; `-firefox.txt`: 79 e 1; `-webkit.txt`: 77 e 3; as falhas estão em Achados), mais papéis (`24`), mensagens (`23`), modo local (`rig/sonda-local2.mjs`).
- Mutações do teste da correção 7 (`30-mutacoes.txt`), todas desfeitas com `git restore`; `git status` da árvore ao final só tem as pastas não rastreadas de outros validadores.
- Mordida do conserto no navegador: o mesmo `sonda-ui.mjs` contra o painel construído de `60cbc2f` (`22-sonda-ui-chromium-60cbc2f.txt`) reprova "Cancelar dentro do painel" a 320x256 (o defeito da rodada 8) e contra `dda7557` passa (`21`).
- `npm run test:api` completo NÃO foi rodado por mim (o CI o roda, job "A API sobe contra Postgres real" e "Testes, tipos e scripts", verdes); rodei os 9 arquivos da E09 e do lote de erros.

## Cenários positivos

- Administradora: redefinir, ver a janela da senha (uma vez), copiar, anotar, entrar com a temporária, trocar. Coordenadora: encerra as sessões de Diego (conta antes = encerradas depois, a leitura volta a zero e datas nulas).
- Minha conta: 3 sessões listadas, uma marcada "Esta sessão"; encerrar as outras diz "As outras 2 sessões foram encerradas. Esta continua aberta.", a confirmação recebe o foco, a lista relida fica com 1 item.
- Uma redefinição derruba as sessões da pessoa; duas redefinições concorrentes: ambas 200, exatamente uma das duas senhas entra (a última gravada).

## Cenários negativos

- Papéis: agente e operador (dois municípios) 403 `sem_permissao` nas três rotas; coordenadora sobre administradora 403 `posto_insuficiente`; a si mesmo 422; outro município 404 igual ao inexistente (também com id em maiúsculas, `organizacaoId` no corpo, cabeçalho forjado); sem token e token lixo 401; ids malformados (`abc`, `' OR 1=1 --`, `%00`, `../usuarios`) respondem 4xx, nunca 500.
- Senha: curta, atual errada, repetição diferente, tipos errados: frases em português (`23-mensagens-ui.txt` e bloco "Mensagens" de `20`). Nenhuma frase em inglês em 10 corpos inválidos.
- Cancelar a confirmação não derruba o outro aparelho (conferido na escrita com o token do outro aparelho).
- Erro 500 simulado na redefinição (rota interceptada): a janela continua aberta, mostra "Algo deu errado no servidor." e o botão Cancelar volta a funcionar; a senha não mudou.

## Tentativas de reprovar

1. **Observador do Modal (`MutationObserver`)**: instrumentei `MutationObserver` no navegador (contagem de `observe` e `disconnect`). Abri e fechei as janelas de confirmação 40 vezes (por Cancelar, por Escape e alternando "Encerrar sessões" e "Redefinir senha"): 1 observador vivo com a janela aberta, 0 depois de fechar, total de vivos de volta ao nível base, 41 criados. Sem vazamento (Chromium). Em repouso a 320x256 o painel não emite nenhum evento de rolagem em 90 quadros: sem laço.
2. **Puxar quem já seguiu adiante**: com o foco em outro botão (depois do Tab), rolei o painel para o topo e provoquei uma mutação: o painel não volta (nada o puxa). Rolagem manual sem mutação com o foco em "Cancelar" também permanece. Com o foco em "Cancelar" e uma mutação, o painel refaz a conta (declarado pela correção).
3. **`manterNaFaixaDasBordas` roubando foco ou rolagem**: em Minha conta, depois da confirmação dei Tab (o foco sai da frase), rolei a página ao fim e esperei 1,5 s: a rolagem não foi alterada (390 e 1280). A guarda `document.activeElement === alvo` está no código e o teste de unidade a prende; a mutação M3 a derruba.
4. **A janela da senha temporária**: em 4 tamanhos e 3 motores, abre no topo, sem foco forçado em controle fora da vista (foco no painel ou no primeiro botão visível), Tab e Shift+Tab não escapam. Escape fecha (decisão documentada no código) e perde a senha: a frase "Anote agora" avisa.
5. **O teste `correcao-7-da-e09.test.ts` morde?** Seis mutações, todas desfeitas: M1 tirar o `disconnect` (2 vermelhos, um em `correcao-4-da-e09`), M2 `focus()` sem `preventScroll` (2), M3 tirar a guarda de foco do `manterNaFaixaDasBordas` (1), M4 dependências do efeito de Minha conta só `[sucesso]` (1), M5 quebrar a conta da rolagem para baixo (2), M6 mover o `scrollTop = 0` para depois (1). 5 dos 14 casos são afirmações sobre o texto do fonte (M1, M2, M4, M6 só são pegas por elas); a conta da rolagem e o `manter...` são comportamentais (M3, M5). O comportamento do observador e da janela só é provado pela seção 14 (e2e) e pela minha sonda.
6. **Mordida do e2e no navegador**: contra o painel de `60cbc2f` a minha sonda reprova o foco inicial fora do painel a 320x256 (defeito da rodada 8); contra `dda7557` passa. Não rodei a seção 14 inteira contra `60cbc2f` (10 minutos por motor sob carga); a evidência do implementador (`correcao-7/saidas/10-antes-*`) não foi reproduzida por mim.
7. **Dupla ação e concorrência**: duas redefinições simultâneas: ambas 200, só a última senha vale, sem estado intermediário. O botão de confirmar fica `disabled` enquanto grava.
8. **O botão escondido não é o controle**: bati nas três rotas com todos os papéis e os dois municípios sem passar pelo painel (tabela acima).
9. **Zod 4**: 10 corpos inválidos em quatro rotas, mais a conferência no painel de login (email inválido, senha errada) e de Minha conta (curta, repetição diferente, atual errada): tudo em português. Procurei o padrão de inglês do Zod (`Invalid`, `Required`, `Expected`, `must be`, `Too small`...) e não achei. Achei só o caso do item 2 de Achados.
10. **Regressão do foco em WebKit**: o WebKit local reprova "o foco volta ao botão que abriu" depois de Cancelar (DV-10 registrada); não piorou.

## Achados

1. **anotado (dívida, não bloqueia).** Depois de um erro do servidor na janela de confirmação ("Redefinir senha", reproduzido com a rota interceptada devolvendo 500), o foco cai em `BODY` em Chromium e Firefox: o botão "Cancelar", que tinha o foco, fica `disabled` enquanto grava e perde o foco, e ao reabilitar ele não volta. O aviso de erro aparece e o Tab alcança a janela, mas a pessoa recomeça do topo da janela (WCAG 2.4.3). Reproduzido também em `60cbc2f` (`22-...-60cbc2f.txt`): é anterior à correção 7 e não é da DoD da E09 (a DoD pede foco devolvido ao botão ao FECHAR). Só alcançável com falha do servidor. Por que não bloqueia: D-31 item 1, nem (a) nem (c); a (b) vale só em falha rara de infraestrutura e não é regressão da etapa. Dono natural: acessibilidade dinâmica (F10).
2. **anotado (dívida, não bloqueia).** O token de acesso já emitido continua lendo até `ACESSO_MINUTOS` (15) depois de "Encerrar minhas outras sessões" ou do encerrar de quem administra; escrita e renovação caem na hora (`GET /usuarios` com o token da sessão encerrada: 200; `POST /usuarios`: 401 `sessao_encerrada`). É a limitação documentada em `apps/api/src/auth/sessoes.ts:25`, anterior à etapa. A frase do painel diz "saem agora". Não bloqueia: documentada e anterior (D-31 item 1). Para o red-team e a privacidade pesarem: em "perdi o celular", a leitura por até 15 minutos fica.
3. **anotado.** Com Zod 4, um JSON com array no campo `senha` devolve duas frases ("Era esperado um texto, veio uma lista" e "A senha precisa de pelo menos 12 caracteres"), porque a regra de tamanho roda sobre o array. Só alcançável por JSON fabricado, nunca pelo painel. Mesma família da DV-19 a DV-21.
4. **anotado.** O teste de unidade da correção 7 é em parte verificação de texto do fonte (5 de 14 casos) e por isso quebra com renomeação e não prova o comportamento do observador. A cobertura de comportamento está na seção 14 do e2e e passou nos três motores.
5. **anotado, fora da minha dimensão.** `ConfirmarAcao` é a única que pede `focoInicial`; a janela agora abre rolada até "Cancelar" quando o painel rola. Não medi se isso esconde o campo de um diálogo alto com formulário (há `ConfirmarAcao` com campos em Ocorrência). É a contrapartida declarada na correção 7 e fica para UX e acessibilidade.
6. **anotado.** Uma chamada `POST` sem corpo mas com `content-type: application/json` às rotas de escrita responde 400 `corpo_invalido`; o painel sempre manda corpo e o e2e passa. Comportamento do Fastify, anterior à etapa.

Nenhum achado bloqueia.

DV-10 (foco volta ao `<main>` no WebKit depois de fechar uma janela aberta por clique): presente e igual (minha sonda no WebKit reprova só esse ponto). DV-11 (nome acessível repetido): inalterada. DV-12 (pino do mapa): fora da etapa, não toquei. H35 (frase de erro do Relato em 341 a 390 px): fora do escopo da correção, não medi. H36: a rodada 9 não reprova pela mesma classe no QA. H39: continua pendente (Safari e Android reais, VoiceOver).

## Não verificado

- Safari de iPhone, Android real e leitor de tela (VoiceOver, NVDA, TalkBack): sem aparelho (H39). O WebKit é o do Playwright no macOS; o do CI Linux passou 325 e 0 no log.
- A seção 14 inteira contra o código de `60cbc2f` (mordida do e2e): só reproduzi o defeito de foco inicial com a minha sonda; o "antes vermelho" da frase de confirmação no WebKit é do implementador.
- `npm run test:api` completo e `test:isolamento`: não rodei (o CI e o gatekeeper o fizeram); rodei os 9 arquivos de API da etapa e do lote de erros, 474 de 474.
- O observador do Modal e a janela em Firefox e WebKit: a contagem de observadores vivos foi medida nos três motores pelo mesmo script, mas o laço de rolagem e o vazamento foram analisados com número só no Chromium; nos outros dois a sonda terminou sem falha nesses pontos.
- Modo local no Firefox e no WebKit; trilha administrativa (`senha_redefinida`) e conteúdo do log da API: são do red-team e da privacidade; `/trilha` é a trilha de ocorrência e não mostra o ato administrativo.
- Janela da senha temporária com a conta desativada (frase de atenção), desligamento de rede no meio da redefinição e dois navegadores confirmando a mesma redefinição ao mesmo tempo no painel.
- A decisão humana H35 (340 contra 360 px) e a frase de erro do Relato.

## Risco residual

- A senha temporária continua conhecida por quem a sorteou durante 72 horas (IDN-18, declarado).
- Leitura por token de acesso já emitido por até 15 minutos depois de encerrar sessões (Achado 2).
- Foco perdido no caminho de erro do servidor das janelas de confirmação (Achado 1).
- A prova de que o painel funciona em aparelho real é humana.

## Motivo do humano

A etapa pede que Rafael faça o fluxo no painel e confira a frase da senha única e as confirmações (aceite de produto), e H39 pede Safari de iPhone, Android e leitor de tela. Isso não se verifica por execução automatizada.
