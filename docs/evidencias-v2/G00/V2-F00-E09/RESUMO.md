# V2-F00-E09: Telas de sessões e de redefinição de senha no painel

Situação: IMPLEMENTADA E MEDIDA em 2026-10-06. FALTA a validação humana (Rafael faz o fluxo no painel e confere a frase da senha única e as confirmações; ver "O que falta"). Por isso a etapa está EM ANDAMENTO no STATUS.

## O que foi entregue

API (sem migração, duas leituras novas):
- `GET /auth/sessoes` (`rotas/autenticacao.ts`, `auth/servico.ts#listarMinhasSessoes`): as sessões vivas da PRÓPRIA conta, uma linha por família da renovação (o "entrou em" é o do login, não o da última renovação), com `entrouEm`, `validaAte`, `aparelho` (uma frase) e `atual`. A marca "atual" é por família, então continua na linha certa com um token de acesso anterior à renovação. Qualquer papel; só a própria conta.
- `GET /usuarios/:id/sessoes` (`rotas/administracao.ts`): `gerenciar_usuarios` antes de abrir transação, 404 para conta de outro município (igual a id que não existe), `exigirPostoParaGerir` (403 `posto_insuficiente`). Devolve só `sessoesAbertas`, `ultimaEntradaEm` e `validaAte`.
- `auth/aparelho.ts#resumirAparelho`: o user-agent vira "Chrome em Windows", "Safari em iOS", "Aplicativo de campo" ou "Aparelho não identificado". Nenhuma das duas rotas devolve IP nem o texto do user-agent (IDN-29 do REL:06).
- As três mensagens de `/auth/trocar-senha` e `/auth/encerrar-sessoes` que saíam sem acento ("sessoes", "sessao") foram corrigidas para português (aparecem no painel).

Painel:
- `Usuarios.tsx`: por linha, `BotaoRedefinirSenha` e `BotaoEncerrarSessoes`, cada um atrás de `ConfirmarAcao` destrutiva com o nome da pessoa no botão, só quando `motivoParaNaoAdministrar(sessao.papel, u)` é nulo, nunca na própria conta e só no modo com servidor. A pergunta de "Encerrar sessões" lê `GET /usuarios/:id/sessoes` e diz quantas estão abertas (e continua valendo se a leitura falhar). `SenhaTemporaria` (exportado): janela que não fecha por clique fora, senha em fonte tabular com seleção de um toque, "Anote agora... não aparece de novo", botão "Copiar senha" com região de status, "Já anotei a senha", e a contagem de sessões que caíram. `Toast` de sucesso ao encerrar (role=status). O modo local explica em vez de oferecer.
- `MinhaConta.tsx`: `MinhasOutrasSessoes` (lista com selo "Esta sessão" em ícone mais texto, carregando, erro com "Tentar de novo", só-esta-sessão, e o botão "Encerrar minhas outras sessões" atrás de `ConfirmarAcao` que diz que "Esta sessão continua aberta").
- `dados/http.ts`, `local.ts`, `repositorio.ts`, `tipos.ts`: `listarMinhasSessoes` e `sessoesDeUsuario` (o modo local recusa explicando, e a paridade dos dois modos continua verde).
- `paginas/sessoes-regras.ts`: as frases (plural, zero) como funções puras e testadas. `estilos/app.css`: só tokens `--ds-*`.
- Ajuste de layout da lista de usuários, achado pelas capturas: com quatro botões por linha a coluna Ação quebrava em três fileiras e a tabela passava de 902 px. Ficou em grade de duas colunas, com respiro lateral de 12 px só nessa tabela (`tabela--justa`) e piso de largura na coluna Pessoa: em 1280 px a tabela mede 902 de 902 (sem rolagem).

Testes: `apps/api/test/sessoes-da-conta.test.ts` (27), `apps/web/test/sessoes-e-senha-temporaria.test.ts` (18), seção 26 de `apps/web/test/fluxo-api.e2e.mjs` (50 verificações). `baseline.mjs`: esperado por etapa (API +27, web +18 com 8 falhas a menos).

## Os 8 vermelhos do painel (V-WEB-04 a V-WEB-11)

`apps/web/test/seguranca-da-conta.test.ts` (8 casos) passou de 8 vermelhos para 8 verdes SEM mudar uma linha do arquivo. Regra T42: o teste descrevia defeito real (nenhuma página chamava as funções), então vale e o código foi consertado. Nenhum teste foi reescrito nem enfraquecido, logo não há registro novo em `docs/DECISOES-DE-TESTE-DA-FASE-00.md`. O painel foi de 14 falhas para 6 (as da E13: acessibilidade do Modal, valor de design no `Estrutura.tsx`, três "Cadastrar confirma", e a da E21: fim de linha no `ocorrencia-encerramento.test.ts`).

## Sonda antes e depois

- API: com as duas rotas desligadas (renomeadas só para a sonda), 11 dos 27 casos reprovam (`saidas/02-sonda-antes-do-conserto-api.txt`); com elas, 27 de 27.
- Painel: antes, 14 falhas de 563 (`docs/evidencias-v2/G00/V2-F00-E08/saidas/10-web.txt` e `saidas/01-web-antes.txt`); depois, 6 de 581.

## Resultados medidos (2026-10-06, depois de `npm run build:shared`)

| Passo | Antes (E08) | Depois |
| --- | --- | --- |
| `npm run test:api` | 1168 testes, 1 falha (laudo, E12), 13 pulados | 1195 testes, 1 falha (a mesma), 13 pulados, 1181 passam |
| `npm run test:isolamento` | 330 (327 e 3 pulados) | 330, igual (nada de banco mudou) |
| `apps/api/test/superficie.test.ts` | 9 de 9 | 9 de 9 |
| `packages/shared` | 162 com 1 falha pré-existente | 162 com a mesma 1 falha |
| `apps/web` | 563 com 14 falhas | 581 com 6 falhas (18 novos, 8 fechados) |
| `apps/console` | 259 | 259 |
| `typecheck` | verde | verde |
| `test:scripts` | 198 com 3 falhas (E17) e 4 pulados | igual |
| `conferir:numeros` | 13 afirmações | 13 (o README corrigido de 126 para 175 verificações de e2e) |
| `baseline.mjs --so=teste-shared,teste-db,teste-api,teste-web` | | 4 de 4 `confere` (`saidas/baseline-depois/`) |
| `regras-de-conteudo.test.ts` | só as linhas pré-existentes | só elas |
| E2E, seção 26 | | 50 de 50 `OK`, zero erro de console (`saidas/05-e2e-secao-26.txt`) |

Não rodado, e por quê: o jest do app de campo e o pacote `packages/campo` (nada neles mudou; o contrato do app é o mesmo); `npm run test:e2e:api` completo, porque cai na seção 13 (CORS do PUT, E18) como no baseline, e por isso a seção 26 foi provada numa cópia aparada do arquivo (`sondas/e2e-aparado-secao-26.mjs`: cabeçalho, ajudantes e a seção) contra uma API recém-semeada (PGlite) e o painel construído com `VITE_API_URL`. O Firefox não foi medido. O `e2e` do modo local (`npm run test:e2e`) não foi rodado: a etapa não o manda e ele já era vermelho na linha de base.

A seção 26 prova: botões só nas linhas certas (administradora em todas menos na dela; coordenadora só em operador e agente); a pergunta traz o nome e a mesma contagem que a API; Cancelar devolve o foco ao botão; confirmar derruba os tokens de renovação; a senha temporária aparece uma vez, no formato ditável, não fecha por clique fora, some ao fechar e o foco volta ao botão; a senha antiga morre, as sessões caem, a temporária entra e exige a troca; a agente define a senha e a sessão aberta com a temporária cai; o agente de campo recebe 403 `sem_permissao` nas três rotas; "Encerrar minhas outras sessões" derruba um segundo navegador (renovação 401 e escrita 401 `sessao_encerrada`) e preserva este.

## Capturas reais (Playwright, Chromium)

`capturas/` (68 imagens), 1280 e 390, claro e escuro, no padrão `nome-largura-tema.png`:
- Normal: `usuarios-administradora`, `usuarios-coordenadora`, `minha-conta-sessoes`, `minha-conta-sessoes-depois`.
- Confirmações e resultado: `usuarios-confirmar-encerrar`, `usuarios-confirmar-redefinir`, `usuarios-senha-temporaria`, `usuarios-sessoes-encerradas-aviso`, `minha-conta-confirmar-outras`.
- Vazio (só esta sessão): `minha-conta-sessao-unica`.
- Carregando: `minha-conta-sessoes-carregando`. Erro: `minha-conta-sessoes-erro`, `usuarios-confirmar-encerrar-erro`, `usuarios-confirmar-encerrar-sem-contagem`, `usuarios-confirmar-redefinir-erro`.
- Modo de demonstração: `usuarios-modo-demonstracao`, `minha-conta-modo-demonstracao`.

Os estados de erro e de carregamento vêm de `sondas/capturas-estados-e09.mjs`, que intercepta a rota (por isso o navegador registra 500 de propósito, e esse roteiro não confere console).

Portão visual, item a item (conferido olhando as imagens):
- Alinhamento e espaçamento: botões da linha em grade 2x2 alinhada entre as linhas; cartões e modais com os tokens de espaço. A primeira captura mostrou o defeito (coluna Ação em três fileiras e nome da pessoa em três linhas) e foi consertada no CSS antes de fechar.
- Nada cortado: depois do ajuste, a tabela de usuários cabe em 1280 px (902 de 902, sem rolagem). Em 390 px ela rola dentro do cartão com o aviso "A tabela continua para a direita", que é o mecanismo que já existia.
- Hierarquia, texto e travessão: frases lidas nas imagens e testadas (`sessoes-e-senha-temporaria.test.ts`); zero travessão (varredura de conteúdo só com as 4 linhas pré-existentes).
- Temas: claro e escuro de todas as telas; estado nunca só por cor (ícone mais texto no selo "Esta sessão", nos avisos e no "Senha copiada").
- Estados vazio, erro e carregando desenhados.

Observações fora do escopo, já existentes, registradas em `apps/web/PENDENCIAS.md` (item 6): o `Toast` no celular é desenhado sobre a barra de menu fixa de baixo; a barra fixa do celular aparece no meio das capturas de página inteira só porque a captura é de página inteira; a lista de usuários em 390 px deixa os quatro botões na última coluna, fora da primeira dobra (o achado da tabela de providências cortada, da E08, não passa por estas telas).

## Limitações

- Não capturei 320 px, 768 px nem zoom de 200 por cento. Contraste AA e área de toque de 44 px vêm dos tokens (`--ds-touch` no `.botao`) e não foram medidos numericamente; foco visível e ordem do Tab estão cobertos pela peça `Modal` (testada) e pela seção 26 (foco inicial em Cancelar, foco devolvido ao botão), mas não passei leitor de tela.
- A cópia da senha foi provada no Chromium com permissão de área de transferência concedida; no navegador sem permissão a tela mostra a frase de como copiar à mão (caminho coberto por código, não capturado).
- O estado "Conferindo quantas sessões estão abertas" da confirmação não foi capturado (dura milissegundos).
- A senha temporária continua conhecida por quem a sorteou (IDN-18), registrado em `apps/api/PENDENCIAS.md` e `apps/web/PENDENCIAS.md`.
- `encerrarMinhasSessoes` preserva por id de sessão (a lista marca "esta" por família): com token anterior à última renovação o botão derruba a sessão viva da própria cadeia. Registrado; fecha na F03-E02.

## Premissas assumidas (também no STATUS, seção 9)

1. `GET /auth/sessoes` e `GET /usuarios/:id/sessoes` não pedem ação nova no shared: a primeira é da própria conta (autenticação basta, como `/auth/encerrar-sessoes`) e a segunda usa `gerenciar_usuarios`, a mesma das outras duas rotas de administração de sessão.
2. A lista mostra "Entrou em" (o login da família) e "Expira em" (o vencimento da sessão viva, que se renova a cada uso), e não o `criada_em` da linha viva.
3. `GET /usuarios/:id/sessoes` e a pergunta do botão só existem no modo com servidor; o modo local não oferece o botão.
4. Os botões novos ficam ocultos (e não desabilitados com motivo) onde o posto não permite, como a etapa manda ("visíveis só quando...").

## O que falta

- Validação humana: Rafael faz o fluxo no painel (redefinir a senha de um operador, ver a senha uma vez, entrar com a temporária e trocar; encerrar sessões; "Encerrar minhas outras sessões" com dois navegadores) e confere a frase da senha única e as confirmações.
- Item "telas de sessões e redefinição" do G00: só se marca no próprio gate.
- Documentação atualizada: `dc360/README.md` (tabela de autenticação e o número de verificações do e2e), `dc360/docs/GUIA-DO-COORDENADOR.md` ("Esqueci a senha" e "Perdi o celular"), `dc360/docs/DICIONARIO-DE-DADOS.md`, `dc360/apps/web/PENDENCIAS.md`, `dc360/apps/api/PENDENCIAS.md`.
