---
validador: arbitragem
modelo: claude-opus-5-5
etapa: V2-F00-E09
sha_validado: 4ce0433
ci_run: ausente
rodada: 5
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

Arbitragem da dimensão UX (seção 7 de `docs/roadmap-v2/28-execucao-e-validacao.md`, "Conflito entre validadores"). O validador de UX deu PASS (`ux.md`) e classificou como "corrige antes de crescer" ou "anotado" três defeitos que a seção 0 de `docs/roadmap-v2/19-definicao-de-pronto.md` trata como defeito da etapa. Régua aplicada, sem acréscimo: a seção 0 ("Não se aceita ... texto cortado ou sobreposto ... nem texto mal escrito"; portão: "Nada fora do lugar: sem texto cortado, sobreposto, quebrado no meio da palavra ... ou escondido atrás de outro elemento"; "Texto bem escrito: português do Brasil correto ... mensagem de erro que diz o que fazer"; "defeito visual é defeito da etapa, não 'polimento' adiado"). Um item reproduzido, dentro do escopo e que viola a seção 0 reprova a dimensão; o que fica fora do escopo não reprova.

Escopo da etapa usado na decisão (pacote `V2-F00-E09.md`, bloco da etapa e Fatos): `Usuarios.tsx` com `BotaoRedefinirSenha`, `BotaoEncerrarSessoes`, `SenhaTemporaria` e "Toast ao encerrar"; `MinhaConta.tsx`; teste positivo "administrador redefine a senha de um operador e o login com a temporária exige a troca"; E2E "a agente entra com a temporária, troca"; validação humana "Rafael faz o fluxo no painel". O RESUMO declara ainda: "As três mensagens de `/auth/trocar-senha` e `/auth/encerrar-sessoes` que saíam sem acento ... foram corrigidas para português (aparecem no painel)" e o "Ajuste de layout da lista de usuários ... piso de largura na coluna Pessoa".

| Item em disputa | Reproduzido | No escopo da etapa | Viola a seção 0 | Decisão |
| --- | --- | --- | --- | --- |
| 1. "A senha atual nao confere." | sim, em duas telas | sim | sim (português errado; o erro não diz o que fazer) | reprova |
| 2. Aviso passageiro sobre a janela da senha temporária | sim, e com perda da senha | sim | sim (botões escondidos atrás de outro elemento) | reprova |
| 3. E-mails quebrados no meio da palavra em Usuários | sim | sim (a etapa refez essa tabela e essa coluna) | sim (quebrado no meio da palavra) | reprova |

Prova item a item em "Achados". Painel construído do SHA (árvore de `dc360/` idêntica a `4ce0433`, `git diff 4ce0433 -- dc360` vazio) com `VITE_API_URL`, ligado à API do SHA (PGlite semeado); Chromium do Playwright. Capturas em `docs/evidencias-v2/G00/V2-F00-E09/validacao/4ce0433/capturas/` com prefixo `arb-` (abaixo, `capturas/`).

Itens do "Motivo do veredito" da rodada 4 que tocam a tela: (1) o id em maiúsculas: conferi pela API do SHA que a administradora, com o próprio id em MAIÚSCULAS, recebe 422 nas três rotas (`autoredefinicao`, `autoencerramento`, `autodesativacao`), com frases em português correto (`saidas/r4.txt`); o painel não oferece os botões na própria linha (`capturas/arb-usuarios-emails-sha-api-1280-claro.png`, linha da Rita só com "Corrigir" e "Desativar" desabilitado). Consertado no que a tela alcança. (2) A corrida da troca em voo não é visível em tela; fora desta arbitragem.

## Evidência

Diretório de trabalho: `/private/tmp/claude-501/-Users-rafaelgomes-Documents-city-hall/768bf074-5845-4f2d-bff9-57106bf57383/scratchpad/val/A01-arbitragem-ux/` (abaixo, `W/`).

- Construção: `vite build` do painel em modo API e em modo local, código 0 (`W/saidas/build-api.txt`, `W/saidas/build-local.txt`); painel da base da fase `afde25c` (anterior à E09), extraído por `git archive` para o scratchpad e construído em modo local, código 0 (`W/saidas/build-antes.txt`). API do SHA por `W/subir-api.sh` (porta 3991, PGlite).
- `node W/item1.mjs`, código 0, saída `W/saidas/item1.txt`.
- `node W/item2.mjs` e `node W/item2b.mjs`, código 0, saídas `W/saidas/item2.txt` e `W/saidas/item2b.txt`.
- `node W/item3.mjs` e `node W/item3b.mjs`, código 0, saída `W/saidas/item3.txt`.
- `node W/r4.mjs`, saída `W/saidas/r4.txt`.
- Capturas: `capturas/arb-minha-conta-senha-atual-errada-{390-claro,1280-claro,320-escuro}.png`, `capturas/arb-senha-nova-obrigatoria-provisoria-errada-{390-claro,1280-escuro}.png`, `capturas/arb-toast-sobre-senha-temporaria-{320-claro,390-escuro,1280-claro}.png` e as `-depois`, `capturas/arb-toast-toque-no-texto-320-claro.png`, `capturas/arb-toast-toque-no-fechar-320-claro.png`, `capturas/arb-usuarios-emails-sha-api-1280-claro.png`, `capturas/arb-usuarios-emails-sha-api-1440-escuro.png`, `capturas/arb-usuarios-emails-antes-da-fase-local-1280-claro.png`.
- Leitura de código: `git grep "nao confere" 4ce0433` (três pontos na API: `auth/servico.ts:1094`, `:1178`, `auth/segundo-fator.ts:341`); `git log -S"nao confere"` (a linha `:1178` nasce em `b6afdb0`, correção 4 da E07, dentro deste candidato); `git diff afde25c 4ce0433` das mensagens de `/auth/trocar-senha` (a E09 acentuou "Senha trocada. As outras sessões foram encerradas." e "Nenhuma outra sessão estava aberta..."); `Entrar.tsx` (`PassoDaSenhaNova` mostra `e.message` do servidor), `MinhaConta.tsx` (idem), `Toast.tsx` e `.toast` em `app.css` (`z-index: var(--ds-z-toast)`, 50, acima de `--ds-z-modal`, 40), `.tabela__pessoa` e `.tabela__secundario` em `app.css`.

## Cenários positivos

- Encerrar sessões e depois redefinir a senha da mesma pessoa (o "perdi o celular"): a janela da senha temporária abre, com a senha em fonte tabular (`capturas/arb-toast-sobre-senha-temporaria-390-escuro.png`).
- Redefinir a senha do Jonas pela rota da etapa (200 com `senhaTemporaria`) e entrar com a temporária: a tela "Defina a sua senha" aparece (`saidas/item1.txt`).
- Na API, o próprio id em maiúsculas é recusado com 422 e frase em português nas três rotas (`saidas/r4.txt`).

## Cenários negativos

- Senha atual errada em Minha conta: 401 `credenciais` com "A senha atual nao confere.", mostrada como está.
- Senha provisória errada na tela obrigatória que vem depois da temporária da etapa: a mesma frase.
- Tocar no aviso passageiro com a janela da senha temporária aberta, a 320 px: o toque cai no botão escondido e a janela fecha.
- Agir sobre a própria conta com o id em outra caixa: 422 nas três rotas.

## Tentativas de reprovar

- Procurei se a frase sem acento fica fora do fluxo da etapa: não fica. Ela aparece na tela "Defina a sua senha", o passo seguinte obrigatório da senha temporária que a etapa entrega (teste positivo e E2E da etapa passam por ela), e em Minha conta, página que a etapa alterou.
- Procurei se o aviso sobre a janela é só estético: não é. A 320x568, `elementFromPoint` no centro de "Copiar senha" e de "Já anotei a senha" devolve o próprio botão, embora o aviso esteja desenhado por cima (o aviso está dentro da página `inert`, então o navegador o ignora no toque). Tocar no texto do aviso aciona "Já anotei a senha", a janela fecha e a senha temporária, que "não aparece de novo", se perde; o foco vai para "Redefinir senha" (`saidas/item2b.txt`, `capturas/arb-toast-toque-no-texto-320-claro.png`). O "Fechar" do aviso não responde (clique recusado em 1500 ms nas três larguras; `saidas/item2.txt`).
- Procurei se a quebra dos e-mails é anterior e alheia: é anterior (a base da fase `afde25c` já quebrava no meio, `capturas/arb-usuarios-emails-antes-da-fase-local-1280-claro.png`), mas não é alheia: a etapa refez essa tabela (`tabela--justa`), estreitou a coluna Pessoa de 251 para 212 px a 1280 px (medido) e escreveu em `app.css`, no bloco `.tabela__pessoa`, que "o email ... continua quebrando onde precisar".
- Procurei largura em que a quebra some: a 1440 px três dos quatro e-mails ainda quebram, um deles em "gov.b / r" (`saidas/item3.txt`).
- Procurei o aviso sobre os botões a 390 e 1280 px: a 390 px ele cobre a borda de baixo da janela, não os botões; a 1280 px não cobre (`saidas/item2.txt`). O defeito é da largura mínima exigida pela DoD (320 px).

## Achados

1. bloqueia (item 1 da disputa: reproduzido, no escopo, viola a seção 0). "A senha atual nao confere." aparece sem acento em Minha conta (`capturas/arb-minha-conta-senha-atual-errada-390-claro.png`, `-1280-claro`, `-320-escuro`) e na tela "Defina a sua senha" depois da senha temporária (`capturas/arb-senha-nova-obrigatoria-provisoria-errada-390-claro.png`, `-1280-escuro`). Nesta segunda, o campo se chama "Senha provisória que você recebeu" e o erro fala em "senha atual" e não diz o que fazer (conferir e digitar de novo a senha provisória). Reprodução: Rita redefine a senha do Jonas (`POST /usuarios/:id/redefinir-senha`, 200), Jonas entra com a temporária, troca o conteúdo do primeiro campo, preenche a senha nova duas vezes e clica "Definir senha e entrar" (`W/item1.mjs`). Escopo: a tela é o passo obrigatório do fluxo que a etapa promete e manda o Rafael fazer; a mensagem é da rota `/auth/trocar-senha`, cujas mensagens a etapa declarou ter corrigido para português "porque aparecem no painel", e deixou esta; Minha conta é página da etapa. Viola "português do Brasil correto" e "mensagem de erro que diz o que fazer". Origem: `dc360/apps/api/src/auth/servico.ts:1094` e `:1178` (esta criada na correção 4 da E07, `b6afdb0`, no mesmo candidato; o defeito também é da E07) e `auth/segundo-fator.ts:341` (MFA, fora desta tela).
2. bloqueia (item 2 da disputa: reproduzido, no escopo, viola a seção 0). A 320x568, o aviso passageiro "Sessões de Diego Nakamura Alves encerradas..." (`z-index` 50) fica por cima da janela da senha temporária (40) e esconde "Copiar senha" e "Já anotei a senha" por cerca de 6 s (`capturas/arb-toast-sobre-senha-temporaria-320-claro.png`; some depois, `-320-claro-depois.png`). O "Fechar" do aviso está à vista e não responde; tocar no texto do aviso fecha a janela pelo botão escondido e a senha de uso único se perde (`capturas/arb-toast-toque-no-texto-320-claro.png`). As duas peças (Toast ao encerrar e `SenhaTemporaria`) são entregas nomeadas da etapa, e a sequência é a do "perdi o celular" que a etapa resolve. Viola "sobreposto ... ou escondido atrás de outro elemento"; a seção 0 não isenta o que é passageiro. Pendente desde a rodada 3 como "decisão do Rafael", sem decisão registrada no STATUS nem risco aceito. Conserto mínimo: fechar o aviso ao abrir uma janela, ou desenhá-lo abaixo do fundo do modal.
3. bloqueia (item 3 da disputa: reproduzido, no escopo, viola a seção 0). Na coluna Pessoa de Usuários os e-mails quebram no meio da palavra a 1280 px ("diego.alves@serraalta.ex / emplo.gov.br", "rita.lopes@serraalta.exe / mplo.gov.br"), a 1440 px ("...exemplo.gov.b / r"), e a 768 e 390 px dentro da tabela que rola (`saidas/item3.txt`, `capturas/arb-usuarios-emails-sha-api-1280-claro.png`, `-1440-escuro.png`). Já quebrava antes da fase, mas a etapa refez essa tabela e essa coluna, estreitou-a e registrou no CSS que o e-mail "continua quebrando onde precisar": é superfície que a etapa toca e decidiu, não defeito alheio. Viola "quebrado no meio da palavra" do portão. Conserto possível: permitir quebra só depois do "@" e dos pontos (por exemplo, `<wbr>` nesses pontos e `overflow-wrap: normal` no e-mail).
4. anotado (fora da disputa, mantido como o validador anotou): as frases 422 da própria conta só aparecem por API.

## Não verificado

- Os demais critérios do relatório `ux.md` (botões por posto, confirmações, foco, estados vazio e de erro, modo local) não foram refeitos: a arbitragem decide só os itens em disputa; não copio a conclusão deles.
- Firefox, WebKit, zoom de 200 por cento e leitor de tela.
- A tela "Defina a sua senha" na entrada em duas etapas (com segundo fator): reproduzi trocando o conteúdo do campo já preenchido; o código (`Entrar.tsx`, comentário de `PassoDaSenhaNova`) diz que nessa entrada a pessoa digita a provisória de novo, o que torna o erro mais provável, mas não exercitei o segundo fator.

## Risco residual

Alto para a experiência da etapa: a janela mais sensível da etapa (senha de uso único) pode ser fechada por um toque no aviso a 320 px, e quem recebe a temporária e erra a digitação lê uma frase sem acento que não diz o que fazer. Os três consertos são pequenos e localizados (texto em três linhas da API, ordem ou fechamento do aviso, ponto de quebra do e-mail).

## Motivo do humano

A seção 7 de `28` prevê que, persistindo o conflito depois desta arbitragem, a decisão vai ao Rafael. Além disso, a validação humana da etapa continua dele (fazer o fluxo e conferir a frase da senha única e as confirmações), e o achado do aviso sobre a janela está pendente de decisão dele desde a rodada 3. Capturas para ele: `capturas/arb-toast-sobre-senha-temporaria-320-claro.png`, `capturas/arb-toast-toque-no-texto-320-claro.png`, `capturas/arb-senha-nova-obrigatoria-provisoria-errada-390-claro.png`, `capturas/arb-minha-conta-senha-atual-errada-390-claro.png`, `capturas/arb-usuarios-emails-sha-api-1280-claro.png`.
