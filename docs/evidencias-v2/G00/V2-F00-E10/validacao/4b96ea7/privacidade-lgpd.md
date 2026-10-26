---
validador: privacidade-lgpd
modelo: claude-sonnet-5-5
etapa: V2-F00-E10
sha_validado: 4b96ea7
ci_run: 38445527075
rodada: 2
herdado_de:
tags: [LGPD, SEGURANCA, API, UI]
nivel_de_prova_exigido: [E1, E3a]
nivel_de_prova_obtido: [E1, E2, E3a]
veredito: PASS
confianca: media
humano_necessario: sim
escalar: nenhum
---
Aviso: não sou advogado e isto não é parecer jurídico. Cobre a parte técnica. Base legal, operador de e-mail e transferência internacional ficam para pessoa.

## Critérios verificados

Inventário dos dados tocados:

| Dado | Onde | Controle |
| --- | --- | --- |
| e-mail do titular | `usuarios`; lido por `abrir_recuperacao` só para enviar o link | resposta 202 igual exista a conta ou não (`apps/api/src/rotas/autenticacao.ts:176-190`) |
| token de recuperação | `recuperacoes_senha.token_hash` | só o hash SHA-256 vai ao banco (`servico.ts:805-811`); o token em claro só existe no link |
| prazo e uso único | `expira_em` (`RECUPERACAO_MINUTOS`), `usada_em` | `consumir_recuperacao` exige `usada_em IS NULL AND expira_em > now()` com `FOR UPDATE` (`db/migrations/005`, linhas 92-125); `abrir_recuperacao` invalida os anteriores |
| IP do pedido | `recuperacoes_senha.ip` | retido sem expurgo até a F05-E12 (fora do escopo) |
| link e e-mail no notificador | log, arquivo ou provedor | ver abaixo |

Fluxo e controles:

1. Produção desligada: `fly.toml:67` `RECUPERACAO_ATIVA = "nao"`; as duas rotas respondem 503 antes de tocar banco ou notificador (`autenticacao.ts:176-181,203-205`). `config.ts:702-752` recusa a partida em produção com `NOTIFICADOR_ARQUIVO`, com recuperação ligada sem provedor, ou com recuperação ligada e `EMAIL_ATIVO != sim`. O padrão do código é `sim` (`config.ts:83`): a segurança vem da trava de produção, não do padrão. `apps/api/test/recuperacao-em-producao.test.ts` lê o `fly.toml` de verdade e prova a linha, a ausência de `EMAIL_ATIVO=sim` e de `NOTIFICADOR_ARQUIVO`, e que a partida com o que o arquivo declara sobe.
2. Notificador: `notificadorDeLog` grava só o destinatário encoberto e o assunto, nunca o corpo (`auth/notificador.ts`). `notificadorDeArquivo` grava e-mail e link inteiros em texto puro, por desenho, só em teste (e2e usa pasta temporária e a apaga). Falha de provedor passa por `semOsEnderecos` (tira links e o e-mail do texto) antes do log (`servico.ts:249-269`).
3. Token fora da barra e do Referer: `RecuperarSenha.tsx` (`DefinirNovaSenha`) lê o token uma vez para o estado e faz `history.replaceState(..., window.location.pathname)`; `vercel.json` põe `Referrer-Policy: no-referrer` e `X-Robots-Tag: noindex` em `/(recuperar-senha|redefinir-senha)`, e nenhum bloco global põe `no-referrer` (a chave do Google Maps depende de Referer). A navegação depois do sucesso é completa (`location.assign("/entrar")`) para a política não seguir a pessoa. O corpo do POST `/auth/redefinir` leva o token, e `req.body.token` está em `CAMINHOS_REDIGIDOS` (`servidor.ts:213-220`); o serializador de `req` descarta a query string. O link nunca passa por uma rota da API com token na URL.
4. Resposta uniforme e tempo: o envio sai depois da resposta (`enviarSemEsperar`), e o teto de pedidos por e-mail (5 por hora, em hash) conta e-mail inexistente igual a existente (`servico.ts:200-237`). Ver achado 1 para o resíduo de tempo que medi.

## Evidência

- `npx vitest run --root apps/web test/recuperar-senha.test.ts test/recuperar-senha-e-sessao.test.ts`: 40 testes verdes, entre eles o que lê `vercel.json` (cabeçalhos corretos e ausência de `no-referrer` global) e o que confere o `history.replaceState` no código (teste textual, fraco por si; o comportamento está no e2e). Saída em `scratchpad/lgpd/web.txt`.
- Linha de base no SHA: `scratchpad/baseline/17-e2e-api.txt`, seção 27, 32 verificações OK, entre elas "email que nao existe: a tela diz exatamente o mesmo", "email de conta de qualquer municipio: a mesma frase", "o notificador de teste recebeu o link das duas contas que existem e de nenhum email inexistente", "o token sai da barra de endereco assim que a tela o le", "o link de uma conta nao mexeu em nenhuma outra", "o mesmo link duas vezes: a segunda e recusada", "link inventado: exatamente a mesma frase do link usado". `05-teste-api.txt`: `recuperacao-sem-oraculo.test.ts` 15 testes verdes (entre eles "o banco guarda o hash do token e nunca o token", "campos de município no corpo e nos cabeçalhos são ignorados", "o token de uma conta troca a senha dela e de mais ninguém", teto por e-mail igual para inexistente), suíte da API 1299 verdes.
- Sonda de tempo (E2 indicativo, PGlite em memória, sem rede nem fsync): `scratchpad/lgpd/tempo.mjs`, 600 chamadas de `abrir_recuperacao` por caso. Medianas: e-mail que existe 4,4 e 3,1 ms; e-mail que não existe 2,0 e 2,1 ms (duas rodadas). A conta que existe faz UPDATE e INSERT; a que não existe só um SELECT.
- Sonda de IP (`scratchpad/lgpd/ip.mjs`): com IP válido as duas respostas são iguais; com texto que não é `inet` (`nao-e-ip`, `fe80::1%eth0`) a função levanta erro SÓ para e-mail que existe.

## Cenários positivos

Pedido gera hash e link; redefinição troca a senha, derruba sessões e desbloqueia a conta; link do arquivo de teste redefine, a senha nova entra e a antiga não.

## Cenários negativos

Mesmo link duas vezes (recusado); token inventado e vencido (mesma frase); e-mail inexistente e de outro município (mesma resposta); conta desativada não recebe link (`u.ativo`); produção com `RECUPERACAO_ATIVA=sim` e `EMAIL_ATIVO=nao`, ou com `NOTIFICADOR_ARQUIVO`, não sobe; recuperação desligada: 503.

## Tentativas de reprovar

- Procurei token em claro no banco, no log e no corpo logado: só hash no banco; o log de notificação omite o corpo; `req.body.token` redigido.
- Procurei caminho com a variável desligada que ainda gerasse token ou enviasse: as duas rotas devolvem 503 primeiro. O `GET /auth/recuperacao` só devolve `ativa`.
- Procurei oráculo por tempo: ver achado 1 (existe, pequeno, mitigado).
- Procurei oráculo por erro: ver achado 2 (existe só se o endereço do cliente não for um IP válido).
- Procurei o token em evidência arquivada: `saidas/02-sonda-antes-do-conserto-api.txt:60` (rastreado no git desde `afde25c`) traz um link `redefinir-senha?token=...` e o e-mail sintético de Diego Alves dentro de um log de erro de teste. É de banco descartável de teste, já usado ou vencido, e o e-mail é da semente fictícia; mesmo assim o portão `conferir-evidencia` não o detectou (ver achado 3).
- Procurei o `Referer` de recursos de terceiros na tela do link: coberto pelo `no-referrer` do documento. Não testei a resposta real do Vercel (só o JSON de configuração).
- A mordida do teste (desfazer o conserto e ver vermelho) não foi refeita: a rodada proíbe modificar o repositório e os testes da API usam o banco. Risco da etapa é médio.

## Achados

1. corrige antes do CP-19 (não bloqueia a etapa, produção desligada). O comentário de `pedirRecuperacao` promete uniformidade de tempo, mas só a espera do provedor foi removida. O caminho de conta existente faz UPDATE e INSERT (com commit) e o de inexistente só lê: medi 1 a 2 ms de diferença na mediana mesmo sem fsync. Mitigação existente: no máximo 5 pedidos por hora por e-mail e 3 em 5 minutos por IP, o que deixa pouquíssimas amostras por e-mail; por isso não vi exploração prática. Sugestão: fazer a conta inexistente executar escrita equivalente, ou medir contra o Postgres real antes de ligar.
2. corrige antes do CP-19. `abrir_recuperacao` grava `nullif(p_ip,'')::inet` (`db/migrations/005`, linha 75). Se `enderecoDoCliente` devolver texto que não é IP, o pedido de e-mail existente dá erro 500 e o de inexistente dá 202: oráculo de existência. Em produção a origem é `Fly-Client-IP`, reescrito pela borda, então a condição exige servidor com `PROXY_DE_BORDA=fly` recebendo o cabeçalho sem passar pela borda. Não reproduzi por HTTP (exige a API com banco). Nenhum teste cobre cabeçalho que não é IP. Sugestão: validar o IP antes (`net.isIP`) ou gravar nulo.
3. corrige antes de crescer. Os filtros de segredo (`redigir` em `baseline.mjs`, `PADROES_DE_SEGREDO` em `conferir-evidencia.mjs`) não reconhecem `?token=`, `senhaTemporaria`, token de renovação, `scrypt$`, e-mail nem CPF (amostras em `scratchpad/lgpd/red.mjs`). Detalhe no relatório da E09.
4. anotado. O token vai na query do link e o host estático (Vercel) enxerga a URL nos logs de acesso dele. Mitigado por uso único, 30 minutos e hash no banco; entra no inventário de operadores quando o CP-19 ligar o e-mail.
5. anotado. `recuperacoes_senha.ip` e as linhas usadas ficam sem prazo até a F05-E12. A redefinição por link não grava na trilha (F03). `consumir_recuperacao` não confere `usuarios.ativo` (conta desativada depois do pedido ainda troca a senha; não entra, mas a senha muda).

## Não verificado

- Tempo medido contra o Postgres real e pela rede (só PGlite em memória).
- Resposta real do Vercel com os cabeçalhos (só o arquivo de configuração e o teste dele).
- Mordida independente dos testes.
- Operador de e-mail, contrato, transferência internacional do provedor: não se aplica hoje (desligado), é do CP-19 e de advogado.

## Risco residual

Baixo enquanto a produção permanece desligada. Os achados 1 e 2 devem entrar como condição do CP-19.

## Motivo do humano

Escolha do provedor, residência do dado, contrato de operador e base legal do tratamento do e-mail no CP-19 são decisão de pessoa (e de advogado). Rafael faz o fluxo com o notificador de arquivo e confere a produção desligada (campo "Validação humana" do bloco).
