---
validador: seguranca-aplicacao
modelo: claude-sonnet-5-5
etapa: V2-F00-E10
sha_validado: 4b96ea7
ci_run: 38445527075
rodada: 2
herdado_de:
tags: [LGPD, SEGURANCA, API, UI]
nivel_de_prova_exigido: [E1, E2]
nivel_de_prova_obtido: [E1, E2]
veredito: PASS
confianca: media
humano_necessario: nao
escalar: nenhum
---
## Critérios verificados

Veredito na primeira linha: **PASS**, com um defeito de código que precisa estar corrigido antes do CP-19 (achado 1). O foco da missão era a alegação do LGPD de que `abrir_recuperacao` dá erro só para e-mail existente quando o endereço do cliente não é um IP válido, o que viraria oráculo de enumeração. **Reproduzi o defeito no nível de código e derrubei a exploração externa na configuração do `fly.toml`**: um atacante anônimo não consegue fazer o IP chegar inválido atrás da borda do Fly, e a produção está com a recuperação desligada. Base de evidência: `C:/Users/Rfasg/AppData/Local/Temp/claude/c--Projetos-city-hall/b62645e7-c436-45b4-8ce0-4d68f4fb420f/scratchpad/seg/` (`seg/`).

| Critério | Resultado | Evidência |
| --- | --- | --- |
| Pedido responde 202 neutro, igual para e-mail existente, inexistente, desativado | PASS | `recuperacao.test.ts`, `recuperacao-sem-oraculo.test.ts`; sonda `4x-e05-oraculo.txt` (três respostas idênticas) |
| Token de uso único, vence, o de uma conta não serve a outra, guardado só como hash | PASS | `consumir_recuperacao` (005): `usada_em IS NULL AND expira_em > now()` com `FOR UPDATE`; testes verdes |
| Resposta não revela existência pelo tempo (envio fora do pedido) | PASS | mutação m12b: voltar a aguardar o envio derruba 7 de 15 casos |
| Teto por e-mail (5 por hora, contado ANTES de consultar o banco) e por IP (`LOGIN_POR_IP`, 10 em 5 minutos) | PASS | mutação m12a (sem o teto por e-mail): 2 vermelhos de 29 |
| Produção desligada (`RECUPERACAO_ATIVA = "nao"`), `config.ts` recusa ligar sem e-mail e recusa `NOTIFICADOR_ARQUIVO` em produção | PASS | `recuperacao-em-producao.test.ts`, `recuperacao-desligada.test.ts` verdes; mutação m12c (tirar o 503 de `/auth/redefinir`) derruba 1 de 3 |
| `Referrer-Policy: no-referrer` e `X-Robots-Tag: noindex` em `/recuperar-senha` e `/redefinir-senha`; token sai da barra de endereço | PASS (leitura) | `dc360/vercel.json` bloco `headers`; `RecuperarSenha.tsx` linha 342, `history.replaceState`. Cabeçalho servido pelo Vercel e tela no navegador: não exercitei (UX/QA) |
| O IP gravado nunca derruba o pedido nem distingue conta que existe | **PARCIAL** | achado 1, derrubado como exploração externa |

## Evidência

- `10-api-auth.txt` (inclui `recuperacao.test.ts`, `recuperacao-sem-oraculo.test.ts`, `recuperacao-desligada.test.ts`, `recuperacao-em-producao.test.ts`, `endereco-de-origem.test.ts`): 12 de 12, 131 testes.
- Sonda `e10-ip.test.ts` (`4x-e10-ip.txt`): servidor montado com a configuração de PRODUÇÃO do `fly.toml` (`NODE_ENV=production`, `PROXY_DE_BORDA=fly`, `trustProxy` por salto, recuperação ligada só para a sonda) e, em paralelo, com `PROXY_DE_BORDA=nenhum`, pedindo recuperação de um e-mail que existe e de um que não existe:

| Situação do cabeçalho | E-mail existente | E-mail inexistente |
| --- | --- | --- |
| `Fly-Client-IP: nao-e-ip` (borda `fly`) | 500 `erro_interno` | 202 |
| só `X-Forwarded-For: nao-e-ip`, sem `Fly-Client-IP` (borda `fly`) | 500 | 202 |
| só `X-Forwarded-For: nao-e-ip` (borda `nenhum`, o proxy não acrescenta) | 500 | 202 |
| `X-Forwarded-For: nao-e-ip, 203.0.113.9` (borda `nenhum`, o proxy acrescenta) | 202 | 202 |
| `Fly-Client-IP` válido + `X-Forwarded-For` lixo (borda `fly`) | 202 | 202 |

  O defeito de código é real: o texto cai direto em `nullif(p_ip,'')::inet` dentro de `abrir_recuperacao`, depois do `SELECT` que acha a conta.
- **Verificação da borda real.** Mandei `Fly-Client-IP` com lixo, duplicado, em três caixas diferentes e vazio, mais `X-Forwarded-For` hostil, para o app de eco público do Fly (`debug.fly.dev`). A borda **sobrescreveu `Fly-Client-Ip` com o IP real em todos os casos** e **acrescentou** o IP real e o do próprio edge ao `X-Forwarded-For` (`lixo2, <ip real>, <ip do edge>`). Ou seja: atrás do Fly, com `PROXY_DE_BORDA=fly`, o valor lido é sempre um IP, e mesmo na ausência do cabeçalho o último salto de `X-Forwarded-For` é do edge. O atacante não escolhe o valor.
- Mutações (`apps/api/src`, vermelho, `git restore`, árvore limpa; `seg/m12*.txt`): m12a, m12b, m12c, acima.

## Cenários positivos

- Pedido para e-mail existente: 202, link no notificador, redefinição com o link, senha nova entra e a antiga não; as sessões abertas caem.
- O mesmo link pela segunda vez: recusado. Link vencido e token inventado: mesma mensagem.

## Cenários negativos

- E-mail inexistente, desativado e de outro município: 202 idêntico (corpo e status).
- Sexto pedido do mesmo e-mail na hora: 202 neutro, sem envio e sem tocar no banco.
- Produção com `RECUPERACAO_ATIVA=sim` e `EMAIL_ATIVO=nao`, sem provedor ou com `NOTIFICADOR_ARQUIVO`: não sobe.

## Tentativas de reprovar

1. **Fazer o IP chegar inválido sem ter conta (a alegação do LGPD).** Com `X-Forwarded-For` lixo e `trustProxy` ligado: reproduzido em `inject` apenas quando o proxy NÃO acrescenta o salto dele (linhas 2 e 3 da tabela). Contra o edge real do Fly, `Fly-Client-IP` é sempre sobrescrito e `X-Forwarded-For` sempre acrescentado; logo, não é alcançável por quem está na internet. Só alcançaria quem falasse com o processo SEM passar pela borda (rede privada 6PN, outra aplicação do mesmo grupo) ou quem trocasse de plataforma sem voltar `PROXY_DE_BORDA` (o `fly.toml` já avisa).
2. **Diferença de tempo.** `abrir_recuperacao` faz `UPDATE` mais `INSERT` para conta que existe e só um `SELECT` para a que não existe. O LGPD mediu 1 a 2 ms em PGlite. O envio já saiu do pedido, o teto por e-mail é 5 por hora e vale igual para existente e inexistente, e `LOGIN_POR_IP` limita por endereço, então há poucas amostras por e-mail; não construí ataque estatístico. Não medi em Postgres real com rede.
3. **Reutilizar o link** (segundo uso, duas redefinições em paralelo): a função faz o `SELECT ... FOR UPDATE` e marca `usada_em` na mesma transação.
4. **Link de uma conta servindo a outra:** o token é achado pelo hash e leva ao `usuario_id` gravado; o corpo não escolhe conta nem município.
5. **Host header para montar o link:** `URL_PAINEL` vem da configuração, nunca de cabeçalho.
6. **Conta desativada recuperando a senha:** `abrir_recuperacao` filtra `u.ativo`; link pedido antes da desativação ainda redefine, mas a conta continua sem entrar (`entrar` recusa inativa).
7. **Spam de e-mail contra a vítima:** o teto por e-mail corta em 5 por hora; consequência conhecida (e documentada no código): quem insiste pode manter a vítima sem link por uma hora de cada vez, e a saída é quem administra (E09).

## Achados

**CORRIGE ANTES DO CP-19 (não bloqueia esta etapa)**

1. O IP do cliente entra em `abrir_recuperacao` sem validação. Qualquer caminho que entregue ao processo um endereço que não é IP (processo alcançado fora da borda, plataforma que não acrescenta `X-Forwarded-For` com `PROXY_DE_BORDA=nenhum`, `Fly-Client-IP` com zona IPv6 como `fe80::1%eth0`) faz o pedido de e-mail EXISTENTE responder 500 e o inexistente 202: oráculo de existência, mais um erro de banco no log. Correção de uma linha: validar com `net.isIP` em `enderecoDoCliente` (e gravar `NULL` quando inválido), ou `nullif(...)` seguro na função. Nenhum teste cobre cabeçalho que não é IP.

**ANOTADO**

2. O diferencial de tempo entre conta existente e inexistente é pequeno e não foi medido em banco real; vale medir antes de ligar.
3. O endpoint público `GET /auth/recuperacao` revela só o interruptor do servidor (`ativa`), igual para todos.
4. Corpo JSON inválido em `/auth/recuperar` responde 500 (F02-E03).

## Não verificado

- Tela e cabeçalhos no navegador e no Vercel real (UX, acessibilidade, QA); li `vercel.json` e `RecuperarSenha.tsx` apenas.
- Tempo em Postgres real com latência de rede.
- Provedor de e-mail real (CP-19): o notificador testado é o de arquivo e o de log.
- Fluxo do token na URL do Vercel: o log de requisição do Vercel pode guardar a query string do link (credencial viva por `RECUPERACAO_MINUTOS`); é decisão de operação para o CP-19.

## Risco residual

- Enquanto a recuperação estiver desligada em produção (`503` antes de qualquer consulta), o achado 1 não tem superfície. Ao ligar, ele passa a valer sem a correção.
- O painel estático não define CSP nem `frame-ancestors` (decisão 29 do roadmap, tratada na F25-E02): vale também para as telas de recuperação.

## Motivo do humano

Nenhum.
