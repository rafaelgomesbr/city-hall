# V2-F00-E10: Recuperação de senha por e-mail, fluxo completo com notificador de teste

Situação: IMPLEMENTADA E MEDIDA em 2026-10-06. FALTAM a validação humana (Rafael faz o fluxo com o notificador de arquivo e confere que a produção continua desligada) e o ENVIO REAL de e-mail, que é o checkpoint CP-19 (provedor e domínio), aberto. Por isso a etapa está EM ANDAMENTO no STATUS.

O que o CP-19 trava é só o envio real. O fluxo completo, na API e no painel, funciona agora com o notificador de teste (`NOTIFICADOR_ARQUIVO`), e a produção segue desligada (`RECUPERACAO_ATIVA = "nao"` no `fly.toml`, provado por teste).

## O que foi entregue

API (sem migração):
- `POST /auth/recuperar` passou a enviar a mensagem DEPOIS de responder (`auth/servico.ts#enviarSemEsperar`). Antes o envio era aguardado dentro do pedido: com provedor real, quem tem conta esperava a viagem até o provedor e quem não tem voltava na hora (o relógio contava quais e-mails existem), e um provedor fora do ar derrubava o pedido com 500 só para quem tem conta (o status contava o mesmo). A falha do provedor agora vai para o log sem o link e sem o e-mail (`semOsEnderecos`), e o encerramento do servidor espera os envios em voo (`onClose`).
- Teto de pedidos por e-mail: `RECUPERACAO_POR_EMAIL_HORA` (padrão 5, de 1 a 60), contado pelo hash do e-mail, igual para e-mail que existe e que não existe, sem distinguir maiúscula. Acima do teto o pedido responde o mesmo 202 e não envia nada. É por processo (ver limitações).
- `GET /auth/recuperacao`: sem token, devolve só `{ ativa }`, para a tela saber se a recuperação está ligada antes de pedir o e-mail. Entrou na lista de rotas sem token de `superficie.test.ts`, com a razão.
- Três mensagens com acento: o 202 ("link de redefinição"), o 401 de link que não vale mais ("Este link de redefinição não vale mais. Peça um novo.") e o 503 da recuperação desligada.
- O que já existia e foi provado de novo por teste, sem mexer: link de uso único, vence em `RECUPERACAO_MINUTOS`, token só como hash (base64url do SHA-256), pedido novo invalida o anterior, redefinir derruba todas as sessões, o município vem do registro e nunca do pedido, e `config.ts` recusa em produção `RECUPERACAO_ATIVA=sim` sem `EMAIL_ATIVO=sim` e o `NOTIFICADOR_ARQUIVO`.

Painel:
- `paginas/RecuperarSenha.tsx` reescrita em peças de decisão (estado e chamadas) e peças de desenho (`TelaDoPedido`, `TelaDaRedefinicao`), para cada estado ser desenhado e capturado sozinho. Estados do pedido: verificando, desligada (os quatro passos para quem administra, que apontam o botão Redefinir senha da lista de Usuários da E09), formulário, enviando, enviado (frase neutra, igual para qualquer e-mail), erro de campo (vazio e formato), limite de pedidos (429), sem rede, falha do servidor, 503 `recuperacao_desligada` no pedido e modo de demonstração. Estados da senha nova: formulário, senha curta e senhas diferentes (cada erro no campo certo), salvando, falha de rede, de servidor e de limite, link que não vale mais (UMA frase para vencido, já usado, trocado por pedido mais novo e inventado, com o caminho de pedir outro), endereço sem link, recuperação desligada e sucesso.
- `paginas/recuperar-regras.ts`: as frases e as regras de qual frase vale para qual falha, fora do React, testadas. A mensagem do servidor nunca vai para a tela.
- O token é lido uma vez para o estado e some da barra de endereço (`history.replaceState`).
- `dados/http.ts`: pedido SEM SESSÃO (`semSessao`) para `pedirRecuperacao`, `redefinirSenha` e `situacaoDaRecuperacao`. Achado real da etapa, por sonda: o link de redefinição aberto num navegador onde outra pessoa está logada (a rota é alcançável com sessão ativa de propósito) levava o token dela, tentava renovar a sessão dela e, no 401 `sessao_encerrada` do link vencido, apagava os tokens e mandava a tela para a entrada. Quem só abriu o link perdia a própria sessão.
- `vercel.json`: `Referrer-Policy: no-referrer` e `X-Robots-Tag: noindex` em `/recuperar-senha` e `/redefinir-senha`, e SÓ nelas (premissa, ver abaixo). As saídas dessas telas são links comuns (recarregam a página), para a política não seguir a pessoa para dentro do painel.
- `estilos/app.css`: só tokens `--ds-*`; o link do rodapé da entrada ganhou alvo de toque de 44 px (vale para "Esqueceu a senha?" também).

Documentação: `dc360/docs/LIGAR-O-EMAIL.md` (o que já está pronto sem provedor, como repetir o fluxo com o notificador de teste, a política de referenciador), `dc360/README.md` (tabela de autenticação, o notificador de log não imprime o link), `dc360/docs/COLOCAR-DE-PE.md`, `dc360/docs/GUIA-DO-COORDENADOR.md`, `dc360/apps/api/PENDENCIAS.md`, `dc360/apps/web/PENDENCIAS.md` (item 7), `dc360/apps/api/.env.example` e `docs/DECISOES-DE-TESTE-DA-FASE-00.md` (uma asserção com acento, sem enfraquecer nada).

## Sonda: falha antes, passa depois

- API, `apps/api/test/recuperacao-sem-oraculo.test.ts` (15 casos): com o código anterior, 9 reprovam (`saidas/02-sonda-antes-do-conserto-api.txt`). Oito são defeito real: pedido com provedor fora do ar (500 só para quem tem conta), falha do provedor no log, pedido que espera o envio (pendurado até o limite de 8 s da sonda), teto de 5 por e-mail (oito mensagens saíam), maiúscula e minúscula no teto, frase acentuada do 401, frase acentuada do 202 e `GET /auth/recuperacao` (404). O nono reprovou por erro do PRÓPRIO teste (comparava o token com um SHA-256 em hexadecimal, e o servidor guarda em base64url): corrigido antes do conserto e não conta como sonda. Depois: 15 de 15.
- Painel, `apps/web/test/recuperar-senha-e-sessao.test.ts` (3 casos): com o cliente anterior, 3 de 3 reprovam (`saidas/03-sonda-antes-do-conserto-web.txt`): o pedido levava o token da sessão aberta, o link vencido renovava e derrubava a sessão de quem estava logado, e `situacaoDaRecuperacao` não existia. Depois: 3 de 3.
- Cobertura que já passava e fica como regressão (não é sonda): município que não se escolhe pelo pedido, o token de uma conta não serve a outra, token só como hash, link que vence, limite por endereço com `X-Forwarded-For` trocado (429 no quarto pedido).

## Resultados medidos (2026-10-06, depois de `npm run build:shared`)

| Passo | Antes (E09) | Depois |
| --- | --- | --- |
| `npm run test:api` | 1195 testes, 1 falha (laudo, E12), 13 pulados | 1220 testes, 1 falha (a mesma), 13 pulados, 1206 passam (25 novos), mais a suíte `banco-tls` que já não carregava (pré-existente) |
| `npm run test:isolamento` | 330 (327 e 3 pulados) | 330, igual (nada de banco mudou) |
| `apps/api/test/superficie.test.ts` | 9 de 9 | 9 de 9 |
| `packages/shared` | 162 com 1 falha pré-existente | 162 com a mesma 1 falha (a do travessão em arquivo antigo) |
| `apps/web` | 581 com 6 falhas | 621 com as mesmas 6 falhas (E13: 5, E21: 1); 40 novos |
| `apps/console` | 259 | 259 |
| `typecheck` | verde | verde |
| `test:scripts` | 198 com 3 falhas (E17) e 4 pulados | igual |
| `conferir:numeros` | 13 afirmações | 13 (o README corrigido de 175 para 208 verificações de e2e) |
| `baseline.mjs --so=teste-shared,teste-db,teste-api,teste-web` | | 4 de 4 `confere` (`saidas/baseline-depois/`; esperado por etapa: API +25, web +40) |
| `regras-de-conteudo.test.ts` | só as linhas pré-existentes | só elas |
| E2E, seção 27 (cópia aparada) | | 33 de 33 `OK`, zero erro de console (`saidas/05-e2e-secao-27.txt`) |
| E2E, seção 14 (cópia aparada) | | 7 de 7 `OK`, zero erro de console (`saidas/04-e2e-secao-14.txt`) |
| Contraste AA e foco visível | | 16 de 16 estados e 2 de 2 temas dentro do mínimo (`saidas/06-contraste-e-foco.txt`) |

Uma observação de honestidade: na primeira rodada de `packages/shared` o caso "ninguém redefine o checklist fora do pacote compartilhado" estourou o limite de 5 s por carga da máquina (acabara de rodar o isolamento). Sozinho leva 252 ms e a segunda rodada completa passou. É o tipo de instabilidade por carga que a E21 trata; não tem relação com esta etapa.

Não rodado, e por quê: `npm run test:e2e:api` completo, porque cai na seção 13 (CORS do PUT, E18, pré-existente) como no baseline, e por isso as seções 14 e 27 foram provadas em cópias aparadas (`sondas/e2e-aparado-secao-14.mjs` e `sondas/e2e-aparado-secao-27.mjs`: cabeçalho, ajudantes e a seção, sem alterar uma linha) contra uma API recém-semeada (PGlite) com `NOTIFICADOR_ARQUIVO` e o painel construído com `VITE_API_URL`. O Firefox não foi medido. O e2e do modo local (`npm run test:e2e`) não foi rodado: a etapa não o manda e ele já era vermelho na linha de base. O jest e o pacote do app de campo também não: nada neles mudou.

A seção 27 prova: formulário só depois de perguntar ao servidor; e-mail em branco e torto com a frase que diz o que digitar e o foco de volta no campo; resposta IDÊNTICA para e-mail de conta, de conta de outro município e inexistente; o notificador de teste recebe o link das duas contas que existem e de nenhum inexistente; o token sai da barra de endereço; senha curta e senhas diferentes no campo certo; redefine, vai sozinha para a entrada com recarga completa, a senha antiga morre e a nova entra, e o link de uma conta não mexe em nenhuma outra; o MESMO link duas vezes recusa a segunda com a frase de pedir outro e a senha tentada NÃO vale (também 401 pela API); link inventado dá exatamente a mesma frase; endereço sem link; com sessão aberta o link que não vale não derruba a sessão; recuperação desligada (leitura e 503 no pedido), limite de pedidos (429) e rede caída; alvos de toque de 44 px no celular nas duas telas; Tab do e-mail ao botão e ao link de voltar.

Não provado por e2e: o link vencido por relógio (a API prova com `expira_em` no passado, e a tela mostra a mesma frase do link usado); o cabeçalho `Referrer-Policy` na Vercel (`vite preview` não aplica o `vercel.json`: a prova é o teste que lê o arquivo e a conferência na URL de produção fica para o primeiro deploy).

## Capturas reais (Playwright, Chromium)

`capturas/` (96 imagens, 24 estados), 1280 e 390, claro e escuro, no padrão `nome-largura-tema.png`:
- Pedido: `pedido-normal`, `pedido-verificando`, `pedido-enviando`, `pedido-enviado`, `pedido-erro-vazio`, `pedido-erro-formato`, `pedido-erro-excesso`, `pedido-erro-rede`, `pedido-erro-servidor`, `pedido-desligada`, `pedido-desligada-pelo-pedido`, `pedido-modo-demonstracao`.
- Senha nova: `definir-normal`, `definir-erro-curta`, `definir-erro-diferentes`, `definir-salvando`, `definir-erro-rede`, `definir-erro-servidor`, `definir-erro-excesso`, `definir-link-ja-usado`, `definir-sem-link`, `definir-desligada`, `definir-sucesso`.
- Entrada, para o alvo de toque do rodapé: `entrada-esqueceu-a-senha`.

Estado vazio: o formulário em branco é o estado normal; o "vazio" com erro é `pedido-erro-vazio`, e o "sem link" é `definir-sem-link`. Os estados de espera e de falha vêm de `sondas/capturas-estados-e10.mjs` (interceptação de rota, por isso o navegador registra 500 e 503 de propósito e esse roteiro não confere console); o sucesso usa um link REAL do notificador de arquivo, com a ida automática para a entrada suspensa só para a foto.

Portão visual, item a item (conferido olhando as imagens e medido onde há número):
- Alinhamento e espaçamento: moldura e cartão iguais nas duas telas, só tokens de espaço, respiro igual entre aviso, texto, passos e botão.
- Nada cortado nem sobreposto: nenhuma rolagem horizontal; os quatro passos quebram linha dentro do cartão em 390 px; o `.botao` tem `white-space: nowrap` e os rótulos mais longos ("Enviar link de redefinição", "Pedir um novo link") cabem em 390 px.
- Hierarquia: título, subtítulo, rótulo, dica, erro e ação com tamanho e peso dos tokens; o subtítulo da senha nova muda depois do sucesso ("Sua senha foi alterada"), achado das capturas.
- Texto: português com acento (varredura por teste), sem travessão, rótulo que diz o que digitar, erro que diz o que fazer, sem supor o gênero de quem lê nem de quem administra.
- Contraste AA medido (não presumido): pior caso 4,75:1 (aviso de perigo, tema claro) contra o mínimo de 4,5:1; foco visível (anel de 2 px mais 2 px) no campo e no botão nos dois temas. Estado nunca só por cor: ícone mais texto nos avisos.
- Alvo de toque: nenhum controle abaixo de 44 px no celular, medido no e2e. O achado das capturas foi o link do rodapé (16 px de altura), corrigido para 44 px.
- Estados vazio, de erro e de carregando desenhados com a mesma qualidade do normal.

## Limitações

- Não capturei 320 px, 768 px nem zoom de 200 por cento. Não passei leitor de tela (ordem de foco e `aria-describedby` estão cobertos por teste, e o `role="alert"` e `role="status"` aparecem nos estados).
- O teto por e-mail é por processo (mapa em memória): com mais de uma máquina é por máquina, e um reinício o zera. O limite por endereço (`LOGIN_POR_IP`) segue sendo a defesa principal. O teto também permite que quem pede cinco vezes o e-mail de outra pessoa a deixe uma hora sem pedir o link (a saída é quem administra redefinir, E09). Em `apps/api/PENDENCIAS.md`.
- Quem pediu e o provedor recusou não é avisado na tela (a tela não sabe se a conta existe, e não deve): só o log do servidor, sem o link. Auditoria de pedido e de redefinição é da F03.
- A tela diz "pouco tempo" e não "30 minutos": o prazo é do servidor.
- `NOTIFICADOR_ARQUIVO` só é recusado com `NODE_ENV=production`.
- Rodei só o Chromium.

## Premissas assumidas (também no STATUS, seção 9)

1. A política `Referrer-Policy: no-referrer` vale só em `/recuperar-senha` e `/redefinir-senha`, e não no painel inteiro como o texto da etapa dizia: a chave do Google Maps é restrita por referenciador HTTP (`docs/COLOCAR-DE-PE.md`, `MAPS_KEY`), e `no-referrer` global faria o Google recusá-la em todo município com mapa ligado. A conferência de que a política segue a pessoa para o painel só se resolve recarregando a página, e é por isso que as saídas das duas telas são links comuns.
2. `GET /auth/recuperacao` (nova, pública, só `{ ativa }`) para a tela saber antes de pedir o e-mail. A alternativa, descobrir só no 503 do pedido, está coberta também. A etapa não a cita.
3. Teto de 5 pedidos por e-mail por hora: a etapa pede "limitação de taxa", e o limite por endereço não vê muitos endereços contra o mesmo e-mail. Acréscimo pequeno, com configuração e teste.
4. O envio sai depois da resposta, e a falha do provedor não chega à tela: decisão de segurança (sem oráculo por relógio nem por status), escolhida em vez de "avisar a pessoa que falhou".
5. `/redefinir-senha` continua em `ROTAS_PUBLICAS` (o portão de `seo.test.ts` define pública como "fora de `<Protegida>`"); o robô é barrado pelo cabeçalho `X-Robots-Tag: noindex`.
6. A produção segue desligada até o CP-19, que não foi decidido por mim.

## O que falta

- Validação humana: Rafael faz o fluxo com o notificador de arquivo (passo a passo em `dc360/docs/LIGAR-O-EMAIL.md`), lê as frases das capturas e confere que a produção continua desligada (`fly.toml`).
- Conferir o `Referrer-Policy` e o `X-Robots-Tag` nas respostas das duas rotas na URL da Vercel, no primeiro deploy.
- CP-19 (contratar provedor e verificar domínio) para ligar o envio real; só depois `EMAIL_ATIVO=sim` e `RECUPERACAO_ATIVA=sim`.
- Item "recuperação" do G00: só se marca no próprio gate.
