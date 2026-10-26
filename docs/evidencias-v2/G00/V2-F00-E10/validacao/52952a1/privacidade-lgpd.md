---
validador: privacidade-lgpd (agente general-purpose com o papel da dimensão)
modelo: claude-sonnet-5-5
etapa: V2-F00-E10
sha_validado: 52952a1
ci_run: 38618369218
rodada: 3
herdado_de:
tags: [LGPD, SEGURANCA, API, UI]
nivel_de_prova_exigido: [E1, E3a]
nivel_de_prova_obtido: [E1, E2, E3a]
veredito: PASS
confianca: media
humano_necessario: sim
escalar: nenhum
---
Aviso: não sou advogado e isto não é parecer jurídico. Cobre a parte técnica. Base legal, operador de e-mail, transferência internacional e prazo de retenção ficam para pessoa. `$SP` é a pasta de trabalho da sessão do gatekeeper (`.../scratchpad`).

## Critérios verificados

### Inventário dos dados tocados

| Dado | Onde | Controle |
| --- | --- | --- |
| E-mail do titular (servidor público) | `usuarios`; lido por `abrir_recuperacao` só para montar a mensagem | resposta 202 igual exista a conta ou não (`apps/api/src/rotas/autenticacao.ts:176-190`); conta inativa e inexistente não geram linha |
| Token de recuperação | `recuperacoes_senha.token_hash` | só o hash SHA-256 (base64url) vai ao banco; o token em claro só existe no link (`auth/servico.ts:845`) |
| Prazo e uso único | `expira_em` (`RECUPERACAO_MINUTOS`, 30 por padrão), `usada_em` | `consumir_recuperacao` (migração 049, versão vigente) exige `usada_em IS NULL AND expira_em > now()` com `FOR UPDATE`; `abrir_recuperacao` invalida os pedidos anteriores |
| IP do pedido | `recuperacoes_senha.ip` | sem expurgo no código (grep: nenhum `DELETE FROM recuperacoes_senha` fora do teste de isolamento); F05-E12 |
| Link e e-mail no notificador | arquivo (teste), log de erro (provedor), provedor | ver abaixo |
| Telemetria do navegador | barra de endereço, `Referer` | `history.replaceState` (`apps/web/src/paginas/RecuperarSenha.tsx:372`), `Referrer-Policy: no-referrer` e `X-Robots-Tag` só em `/(recuperar-senha|redefinir-senha)` (`vercel.json:21`) |

### Fluxo e controles

1. Produção desligada: `fly.toml:67` `RECUPERACAO_ATIVA = "nao"`. As duas rotas respondem 503 antes de tocar banco ou notificador. `config.ts:702-752` recusa a partida em produção com `NOTIFICADOR_ARQUIVO`, com recuperação ligada sem provedor e com recuperação ligada sem `EMAIL_ATIVO=sim`. O padrão do código é `sim` (`config.ts:83`): a segurança vem da trava de produção, que `test/recuperacao-em-producao.test.ts` lê do `fly.toml` de verdade.
2. Notificador de log: grava só destinatário encoberto e assunto, nunca o corpo (`auth/notificador.ts`, `notificadorDeLog`). Notificador de arquivo: grava e-mail e link inteiros por desenho, só em teste, e o `config.ts` o recusa em produção.
3. Token no corpo do POST de redefinição está em `CAMINHOS_REDIGIDOS` (`servidor.ts:213-220`); o serializador de `req` não leva a query string; o e-mail do pedido (corpo) não é logado.
4. Enumeração: corpo, status e (em teto) tempo iguais. O envio sai depois da resposta (`enviarSemEsperar`, `auth/servico.ts:249`), o teto por e-mail (5 por hora, em hash do e-mail) conta existente e inexistente igual.
5. Mudança desta rodada na etapa: só a tela de sucesso (sem redirecionamento por tempo, foco na confirmação, hover do botão). Não toca dado pessoal. O token continua lido uma vez e retirado da barra.

## Evidência

- `npm run build:shared` (código 0). API: os 11 arquivos de `$SP/val/privacidade-lgpd/10-api-sessoes-recuperacao.txt` (inclui `recuperacao`, `recuperacao-desligada`, `recuperacao-em-producao`, `recuperacao-sem-oraculo` com 15 casos, `log`, `notificador-http`): 148 passaram, 9 pulados por ambiente (não são desta etapa), 0 falha.
- Painel: `recuperar-senha.test.ts` (47) e `recuperar-senha-e-sessao.test.ts` (3), 74 de 74 no conjunto (`80-web.txt`); entre eles o que lê `vercel.json`.
- Navegador contra a API real (E2, `30-e2e-api-chromium.txt`): seção 27, 42 conferências OK, entre elas "email que nao existe: a tela diz exatamente o mesmo", "email de conta de qualquer municipio: a mesma frase, sem pista de qual municipio e a conta", "o notificador de teste recebeu o link das duas contas que existem e de nenhum email inexistente", "o token sai da barra de endereco assim que a tela o le", "o mesmo link duas vezes: a segunda e recusada", "a senha que a segunda tentativa quis definir NAO vale", "link inventado: exatamente a mesma frase do link usado", "com sessao aberta, o link que nao vale ... e a sessao de quem estava logado continua de pe". Total 288 e 64, 0 falha.
- Sonda de IP e tempo (`sonda-ip-e-tempo.mts`, saída `11-sonda-ip-e-tempo.txt`): API com `PROXY_DE_BORDA=fly`, pedido para e-mail que existe e para inexistente, variando o cabeçalho `Fly-Client-IP`:

| `Fly-Client-IP` | e-mail que existe | e-mail inexistente |
| --- | --- | --- |
| ausente | 202 | 202 |
| `203.0.113.9` | 202 | 202 |
| `nao-e-ip` | 500 `erro_interno` | 202 |
| `fe80::1%eth0` | 500 `erro_interno` | 202 |

  Medianas de 50 pedidos por caso (PGlite em memória): existe 0,83 ms, inexistente 0,71 ms.
- Sonda do eco do provedor (`sonda-eco-do-provedor.mts`, `13-sonda-eco-do-provedor.txt`): notificador que lança erro repetindo o conteúdo, e o log do Fastify capturado:
  - erro que ecoa a mensagem inteira em JSON: o link e o e-mail somem (`[email removido]`), mas o NOME COMPLETO do servidor ("Olá, ...") vai para o log em `motivo`;
  - erro que ecoa `token=<token>` sem a URL inteira: o TOKEN vivo vai para o log;
  - erro que ecoa a URL com barras escapadas (`https:\/\/...`): a URL não bate com o texto do corpo, então o link com o token vai para o log.

## Cenários positivos

Pedido gera hash e link; redefinição troca a senha, derruba as sessões e desbloqueia a conta; o link do arquivo de teste redefine, a nova senha entra e a antiga não.

## Cenários negativos

Mesmo link duas vezes (recusado); token inventado (mesma frase); e-mail inexistente e de conta de outro município (mesma resposta); conta desativada não recebe link; produção com `RECUPERACAO_ATIVA=sim` e `EMAIL_ATIVO=nao`, ou com `NOTIFICADOR_ARQUIVO`, não sobe; recuperação desligada: 503 nas duas rotas.

## Tentativas de reprovar

- Procurei token em claro no banco, no log e no corpo logado: só hash no banco; o log do notificador omite o corpo; `req.body.token` redigido. Exceção na última sonda acima (eco do provedor).
- Procurei caminho com a variável desligada que ainda gerasse token ou enviasse: não há.
- Reexecutei o oráculo por IP da rodada 2 (achado 2 dela): AINDA MORDE (tabela acima). Condição: `PROXY_DE_BORDA=fly` e um cabeçalho `Fly-Client-IP` que não passou pela borda da Fly e que não é um IP. Atrás da borda da Fly o cabeçalho é reescrito, e com o padrão `nenhum` o endereço vem do socket, sempre válido; por isso mantenho PASS, mas é defeito real do código, ligado ao critério "e-mail inexistente (mesma resposta)", e não foi corrigido na correção 2.
- Reexecutei o oráculo por tempo (achado 1 da rodada 2): 0,12 ms de diferença na mediana em memória; o teto de 5 por hora por e-mail e de pedidos por IP deixa poucas amostras. Segue anotado, não medi contra Postgres real.
- Procurei o link de redefinição em evidência arquivada: `V2-F00-E10/saidas/02-sonda-antes-do-conserto-api.txt:60` (rastreado no git) ainda traz um link `redefinir-senha?token=...` e o e-mail sintético de uma conta da semente, dentro de um log de erro de teste (banco descartável, link já vencido). O portão `conferir-evidencia` não o pega (`50-redigir.txt`).
- Mordida: o teste de produção desligada está coberto por `recuperacao-em-producao.test.ts`, que lê o `fly.toml`; não o mutei (o arquivo é de configuração), anoto como não verificado.

## Achados

1. corrige antes do CP-19 (não bloqueia a etapa; produção desligada). Oráculo por erro de IP, reproduzido nesta rodada (tabela). Conserto sugerido: validar com `net.isIP` em `enderecoDoCliente` ou gravar nulo quando não for IP, e teste para o cabeçalho inválido. Dono provável: E10 (correção) ou F01.
2. corrige antes do CP-19 (NOVO nesta rodada). `semOsEnderecos` (`auth/notificador.ts:153`) só remove do texto do erro as URLs que aparecem LITERALMENTE no corpo da mensagem e o endereço `para`. Se o provedor ecoar o nome do servidor, o token isolado ou a URL com barras escapadas, isso chega ao log do Fastify (`motivo`, `rotas/autenticacao.ts`, `req.log.error`) e ao campo de detalhe do envio. O token é credencial viva por 30 minutos e o nome é dado pessoal. Conserto sugerido: nunca logar o texto do provedor; logar só o código HTTP e uma classe de erro, ou remover do texto qualquer ocorrência do token, do nome e do e-mail (não só da URL).
3. corrige antes do CP-19. O link de redefinição leva o token na query (o host estático enxerga a URL nos logs de acesso). Mitigado por uso único, 30 minutos e hash no banco; entra no inventário de operadores quando o e-mail for ligado.
4. corrige antes de crescer (transversal). Filtros de segredo do baseline e do portão de evidência não cobrem `?token=` (achado 3 da E09).
5. anotado. `recuperacoes_senha.ip` e as linhas usadas ficam sem prazo (F05-E12). A redefinição por link não grava na trilha (F03). `consumir_recuperacao` não confere `usuarios.ativo` (conta desativada depois do pedido ainda troca a senha; não entra, mas a senha muda).

## Não verificado

- Tempo medido contra Postgres real e pela rede (só PGlite).
- Resposta real da Vercel com os cabeçalhos `Referrer-Policy` e `X-Robots-Tag` (só o `vercel.json` e o teste que o lê).
- Mordida da trava de produção desligada (não mutei `fly.toml` nem `config.ts`).
- Comportamento real de um provedor de e-mail (nenhum está contratado).
- Operador de e-mail, contrato, transferência internacional: CP-19 e advogado.

## Risco residual

Baixo enquanto a produção permanece desligada. Os achados 1 e 2 devem entrar como condição do CP-19, antes de ligar `RECUPERACAO_ATIVA`.

## Motivo do humano

Escolha do provedor, residência do dado, contrato de operador e base legal do tratamento do e-mail no CP-19 são decisão de pessoa (e de advogado). Rafael faz o fluxo com o notificador de arquivo e confere a produção desligada (campo "Validação humana" do bloco).
