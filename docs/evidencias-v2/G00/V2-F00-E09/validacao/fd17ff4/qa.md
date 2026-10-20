---
validador: qa
modelo: claude-opus-5-5
etapa: V2-F00-E09
sha_validado: fd17ff4
ci_run: 39420436042
rodada: 7
herdado_de:
tags: [UI, A11Y, AUTH, API, LGPD]
nivel_de_prova_exigido: [E1, E2]
nivel_de_prova_obtido: [E1, E2]
veredito: PASS
confianca: alta
humano_necessario: sim
escalar: nenhum
---
## Critérios verificados

SCRATCH abaixo é `/private/tmp/claude-501/-Users-rafaelgomes-Documents-city-hall/20850765-8640-418e-ace7-9257aa515baf/scratchpad/val-qa-e09a13`. Árvore principal em `55209ab` (produto idêntico a `fd17ff4`; só `STATUS.md` e `ESTADO-ATUAL.md` diferem). Node 24.15.0 (o `.nvmrc` pede 22; nada do que rodei depende de API do Node que mude entre as duas). `npm run build:shared` antes de tudo (`00-build-shared.txt` no diretório da rodada, código 0).

| Critério (DoD e cinco campos de teste) | Resultado | Prova |
| --- | --- | --- |
| Os 8 casos de `seguranca-da-conta.test.ts` verdes | atende | `SCRATCH/01-test-web.txt`: 8 de 8, painel 699 de 699 em 46 arquivos, código 0 |
| Administrador redefine a senha de um operador e o login com a temporária exige a troca | atende | `SCRATCH/50-sonda-e09-api.txt` (parte "temporaria"): redefinição 200 com `senhaTemporaria`; a sessão antiga não renova (401 `sessao_encerrada`); entrar com a temporária devolve `trocaDeSenhaObrigatoria: true`; escrita com essa sessão 403 `troca_de_senha_obrigatoria`; troca 200; a definitiva entra. No navegador, nos três motores: `SCRATCH/40-sonda-foco-chromium.txt`, `41-sonda-foco-firefox.txt`, `41-sonda-foco-webkit.txt` (Jonas entra com a temporária, cai em "Defina a sua senha", define, a definitiva entra sem troca obrigatória e a temporária não entra mais). E2e seção 26 em Chromium e Firefox |
| `GET /auth/sessoes` marca a sessão atual, sem IP e sem user-agent completo | atende | `SCRATCH/50-...`: exatamente uma com `atual: true`, `aparelho: "Chrome em macOS"`, sem os marcadores de user-agent enviados nem IP |
| Encerrar "as outras" mantém a de onde se clicou | atende | `SCRATCH/50-...`: a sessão de onde se clicou renova (200), a outra 401 `sessao_encerrada`; e2e seção 26 (segundo navegador cai) |
| Negativo: coordenador não vê os botões em usuário de posto igual ou maior | atende | e2e seção 26 em Chromium e Firefox (50 verificações OK em cada, `SCRATCH/10-e2e-api-chromium.txt`, `11-e2e-api-firefox.txt`); `posto-abaixo-do-seu.test.ts` 7 de 7 (`SCRATCH/02-test-api.txt`) |
| Negativo: a API recusa `autoredefinicao` e `autoencerramento` (422), inclusive com o id em maiúsculas | atende | `SCRATCH/50-...`: id próprio em maiúsculas, caixa mista e hífens codificados: 422 com o código da recusa nas três rotas; chaves, sem hífens, `urn:uuid:` e espaço: nunca 200; a conta intacta. `id-da-propria-conta.test.ts` 13 de 13 |
| Negativo: `GET /usuarios/:id/sessoes` de posto acima: 403 `posto_insuficiente` | atende | `SCRATCH/50-...`: coordenadora sobre a administradora, 403 `posto_insuficiente` na leitura e na redefinição |
| Isolamento: redefinir senha e ler sessões de usuário de outro município: 404 | atende | `SCRATCH/50-...`: coordenador de Vale Fundo sobre Serra Alta, 404 nas três rotas, corpo idêntico ao do id inexistente. Tentativa nova desta rodada (`SCRATCH/51-sonda-e09-extra.txt`, 19 de 19): administradora de Serra Alta com o id de Vale Fundo em MAIÚSCULAS e com hífens codificados, nas três rotas: 404 com o mesmo código do inexistente; corpo com `organizacaoId` de Vale Fundo não leva a redefinição para lá; a senha da pessoa de Vale Fundo continua a mesma |
| Autorização: agente e operador nas três rotas: 403 `sem_permissao` | atende | `SCRATCH/50-...`: agente e operadora de Vale Fundo, 403 `sem_permissao` nas três; `51-...`: sem token e com token lixo, 401 nas cinco rotas (as três de quem administra e as duas da própria conta) |
| Foco depois da senha errada (motivo do FAIL da rodada 6), nos três motores | atende | `layout-estreito.e2e.mjs` seção 10: Chromium 197 de 197 (`10-...`), Firefox 197 de 197 (`11-...`), WebKit 196 de 196 com `--so-layout` (`SCRATCH/12-e2e-api-webkit-so-layout.txt`), zero erro de console nos três. Sonda própria (`SCRATCH/sondas/sonda-foco-e09.mjs`) por caminhos que a seção 10 não percorre, 20 verificações de foco em cada motor, todas OK nos três (`40`, `41-firefox`, `41-webkit`, `41-sonda-foco-webkit-repeticao.txt`) |
| E-mail inteiro na janela "Redefinir senha" (segundo motivo da rodada 6), lado QA | atende | sonda própria nos três motores: o texto da linha da janela é "matrícula, email inteiro, papel." (o `<wbr>` não come nem acrescenta caractere). A geometria a 320 e 390 px é da seção 12 de `layout-estreito`, verde nos três motores |
| Regressão obrigatória | atende | painel 699 de 699 (`01`); `test:api` 1685 aprovados e 34 pulados, código 0 (`02`), `superficie.test.ts` 9 de 9; `paridade-dos-modos.test.ts` 10 de 10; corrida em Postgres 17.6 real (`SCRATCH/90-corrida-postgres17.txt`): `renovacao-contra-encerramento` e `recuperacao-morre-com-a-credencial`, 60 de 60, nenhum pulado |
| E2E: a administradora redefine a senha da agente, ela entra com a temporária, troca, a sessão antiga cai; encerrar as outras derruba um segundo navegador | atende | seção 26 de `fluxo-api.e2e.mjs`, 50 OK em Chromium e 50 OK em Firefox (`10`, `11`), roteiro 288 de 288 nos dois, código 0 |
| DoD: botões e listagem nos dois modos; nenhuma rota nova sem permissão | atende | `paridade-dos-modos.test.ts` verde; as duas rotas novas recusam sem token, com token lixo e com papel errado (`50`, `51`) |
| Validação humana (Rafael faz o fluxo e confere a frase da senha única) | pendente | fora do alcance do validador |

## Evidência

- `npm run test --workspace @dc360/web`: código 0, 699 de 699, 46 arquivos (`SCRATCH/01-test-web.txt`); inclui `correcao-5-da-e09.test.ts` 11 de 11.
- `npm run test:api`: código 0, 1685 aprovados, 34 pulados, 106 arquivos (`SCRATCH/02-test-api.txt`).
- `node scripts/e2e-api.mjs chromium`: código 0, 288 e 197, zero erro de console (`SCRATCH/10-e2e-api-chromium.txt`).
- `node scripts/e2e-api.mjs firefox`: código 0, 288 e 197, zero erro de console (`SCRATCH/11-e2e-api-firefox.txt`). Na rodada 6 este mesmo comando saía 1 com 7 falhas na seção 10.
- `node scripts/e2e-api.mjs webkit --so-layout`: código 0, 196 (1 verificação PULADA pelo próprio roteiro, o Tab que o WebKit não leva a links), zero erro de console (`SCRATCH/12-e2e-api-webkit-so-layout.txt`).
- Sonda de foco própria contra API e painel próprios (API com PGlite nova a cada motor na porta 3795; painel construído com `vite build --outDir` no SCRATCH e servido por `vite preview` na 4795, para não tocar no `dist` da árvore): `SCRATCH/sondas/sonda-foco-e09.mjs` e `sondas/com-api.sh`; saídas `40-sonda-foco-chromium.txt` (21 de 21), `41-sonda-foco-firefox.txt` (21 de 21), `41-sonda-foco-webkit.txt` e `41-sonda-foco-webkit-repeticao.txt` (20 de 21: as 20 de foco e fluxo OK; a de erro de console reprova, ver Achados 2).
- Sondas HTTP: `SCRATCH/50-sonda-e09-api.txt` (40 de 40 mais a sequência da temporária), `SCRATCH/51-sonda-e09-extra.txt` (19 de 19). Scripts em `SCRATCH/sondas/` (os da rodada 6 de outro validador, relidos e reaproveitados, mais `sonda-e09-extra.mjs` novo).
- Postgres 17.6 real descartável em 127.0.0.1:55913, `DC360_POSTGRES_DE_PROVA` apontado para ele: código 0, 60 de 60 (`SCRATCH/90-corrida-postgres17.txt`); cluster derrubado e apagado no fim.
- `npm run test:scripts`: código 0, 324 de 324 (`SCRATCH/03-test-scripts.txt`).

## Cenários positivos

- Redefinição por quem administra pelo id em maiúsculas de OUTRA pessoa (Jonas): 200 com temporária, nos três motores (o id de terceiro normalizado continua valendo).
- Temporária leva a "Defina a sua senha"; depois de duas provisórias erradas a certa conclui e a definitiva entra sem troca obrigatória (três motores).
- Encerrar as próprias outras sessões mantém a atual, provado pela renovação e não só pela tela.
- Administradora lê as sessões de outra pessoa só com id, quantidade e datas.

## Cenários negativos

- Senha atual errada em Minha conta: por Enter no campo do MEIO (a seção 10 usa o último), e a mesma senha errada uma segunda vez, por clique, saindo de outro campo: o foco volta ao campo da senha atual nos três motores, e o campo focado fica à vista abaixo do topo fixo a 390 px.
- Conferência local sem servidor em Minha conta: senhas diferentes por Enter no primeiro campo (foco na repetição, `aria-invalid`), senha nova curta logo depois do erro do servidor (foco na senha nova, e o erro velho da senha atual sai).
- "Defina a sua senha": senhas diferentes (foco na repetição), provisória errada por Enter no PRIMEIRO campo e de novo por clique saindo da repetição: foco na provisória, três motores.
- Sete formas do próprio id nas três rotas: nenhuma 200. Id de outro município em maiúsculas e codificado: 404 igual ao inexistente. Posto acima: 403 `posto_insuficiente`. Agente e operadora: 403 `sem_permissao`. Sem token e token lixo: 401.

## Tentativas de reprovar

1. Procurei, além das duas telas consertadas, todo `depoisDePintar` que ainda roda depois de um `await` (o padrão que causou o FAIL): sobram `Ocorrencia.tsx:1749` (foco na faixa do ofício, nó sempre montado, então não depende da renderização) e `Sino.tsx:309` (foco no próximo aviso, que já existe antes da renderização). Os demais (`Usuarios.tsx:123`, `NovaOcorrencia.tsx:141`, `QueroConhecer.tsx:76`, `Ocorrencia.tsx:2233`) rodam em manipulador síncrono, onde o lote do React já está no DOM. Medi Usuários (cadastro vazio e email inválido por Enter) e Nova ocorrência (vazia) nos três motores: foco no campo inválido, à vista, nunca em BODY. Sem regressão do `focar` com `preventScroll` e `scrollIntoView`.
2. Repeti o erro idêntico duas vezes seguidas para ver se o efeito por contador deixaria de disparar quando o estado de erro não muda: dispara (três motores).
3. Rodei o WebKit duas vezes para ver se o foco é instável: as 20 verificações de foco passaram nas duas.
4. Tentei levar a redefinição a outro município pelo id em maiúsculas, por hífens codificados e por `organizacaoId` no corpo: 404 e a senha de Vale Fundo intacta.
5. Conferi o que a guarda de códigos de erro (diff `1ed0b71..fd17ff4`) muda nas respostas da etapa: 401, 403 `posto_insuficiente`, 403 `sem_permissao`, 403 `troca_de_senha_obrigatoria`, 404 e 422 com os códigos de sempre (`50`, `51`), e as varreduras da API (`codigos-de-erro.test.ts` 229, `guarda-de-codigos-de-erro.test.ts` 108) verdes.
6. Tentei provar que o teste morde desfazendo o conserto (trocar o efeito de `usar-foco.ts` por `requestAnimationFrame` e rodar a seção 10 no Firefox). Não executado: a edição do arquivo da árvore foi recusada pela política de permissões do ambiente. Ver "Não verificado".

## Achados

1. **anotado (fora do escopo da etapa).** A primeira tela de entrada (`Entrar.tsx`, passo do email e senha, não mexido pela correção 5) deixa o foco em BODY depois da senha errada, nos três motores (`40`, `41-*`, linha `OBS`): o botão fica desabilitado durante o envio e o foco não volta a lugar nenhum. A frase de erro é `role="alert"` e é anunciada. Dono natural: acessibilidade dinâmica (F10-E11) ou a dimensão de Acessibilidade.
2. **anotado (não é desta etapa nem do diff).** Só no WebKit e só na sonda própria: navegar com recarga completa (`page.goto`) saindo do Painel recém-aberto gera 6 `pageerror` "Fetch API cannot load ... due to access control checks", um por pedido do Painel e do Sino cancelado pela navegação (`SCRATCH/42-sonda-webkit-navegacao-no-meio.txt`, `43-...-2.txt`, `requestfailed: cancelled`). O código do Painel e do Sino trata a rejeição (`.catch`); o roteiro `layout-estreito` no WebKit não vê isso (zero erro). Não reproduzido em Chromium nem Firefox. Não determinei por que o motor o publica como erro de página.

Nenhum achado que bloqueia.

## Não verificado

- Prova de que o teste morde, independente do implementador: não rodei a mutação (recusada pelo ambiente). A prova de "antes vermelho" que existe é a do implementador (`correcao-5/saidas/03`, 17 falhas no Firefox com o código de `c11ede6`) e o FAIL da rodada 6 visto por dois validadores; não a reproduzi nesta rodada. Risco médio, então a mordida não é exigência do E1 (seção 8 de `28`), mas fica registrado.
- `fluxo-api.e2e.mjs` (seção 26, a da etapa) no WebKit: o roteiro do projeto não o roda ali por desenho (`--so-layout`); cobri o WebKit com a tela estreita e com a minha sonda.
- Leitor de tela real, zoom de 200 por cento e modo de demonstração sem API.
- WebKit do Linux (o do CI) e Safari de aparelho: rodei só o WebKit do Playwright no macOS. O run 39420436042 (9 de 9 `success`, lido pelo gatekeeper) contém os passos de Firefox e WebKit; não abri os logs dele (exigem token).

## Risco residual

A senha temporária continua conhecida por quem a sorteou durante 72 horas (IDN-18, declarado em `PENDENCIAS.md`). O foco depois de erro assíncrono depende de cada tela usar `useFocoDepoisDeRenderizar`; tela nova que volte a pedir foco por `requestAnimationFrame` depois de `await` repete o defeito no Firefox, e só a seção 10 de `layout-estreito` o pega, para as duas telas que ela mede.

## Motivo do humano

A etapa pede que Rafael faça o fluxo no painel e confira a frase da senha única e as confirmações (conteúdo de produto e aceite), o que não é verificável por execução.
