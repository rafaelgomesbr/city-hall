---
validador: qa
modelo: claude-opus-5-5
etapa: V2-F00-E10
sha_validado: 1ed0b71
ci_run: ausente
rodada: 6
herdado_de:
tags: [UI, MOBILE, OFFLINE, A11Y, AUTH, AUTHZ, TENANT, RLS, DB, MIGRATION, API, LGPD, DOCUMENTO, ARQUIVO, INFRA]
nivel_de_prova_exigido: [E1, E2]
nivel_de_prova_obtido: [E1, E2]
veredito: PASS
confianca: alta
humano_necessario: sim
escalar: nenhum
---
## Critérios verificados

Pasta das saídas: `SCRATCH/validadores/qa-r6/` (SCRATCH é `/private/tmp/claude-501/-Users-rafaelgomes-Documents-city-hall/743e49ef-b0cc-448c-8891-518b9ad66083/scratchpad`). Árvore principal em `5044e7a`, produto idêntico a `1ed0b71`. Nada da E10 mudou entre `4ce0433` e `1ed0b71` (`git diff --stat 4ce0433..1ed0b71`), mas validei do zero.

| Critério (DoD e cinco campos de teste) | Resultado | Prova |
| --- | --- | --- |
| Pedido responde 202 neutro | atende | `31-sonda-e10-principal.txt`: 202 e corpo idêntico para conta existente, inexistente, de outro município e email em maiúsculas |
| O link do arquivo de teste redefine a senha; a nova entra e a antiga não (o FAIL da rodada 4) | atende | `31-...` (sequencial); `20-corrida-postgres17.txt`, Postgres 17.6 real: casos 12, 22 e 29 (troca em voo contra o link) e 32 (link contra a redefinição por quem administra) verdes, 60 de 60, nenhum pulado; e2e seção 27 |
| `recuperar-senha.test.ts` cobre os estados da tela | atende | 47 de 47 em `12-test-web.txt`; mordida: sem o `history.replaceState`, 1 de 47 reprova (`25-mutacao-e10-sem-replacestate.txt`), restaurado |
| Negativo: o mesmo link duas vezes | atende | `31-...`: segunda vez 401 `sessao_encerrada`, a senha da segunda tentativa não entra; e2e seção 27 |
| Negativo: link vencido | atende | `37-sonda-e10-link-vencido.txt`: API com `RECUPERACAO_MINUTOS=5`, link usado 5 min 51 s depois do pedido: 401, mesma resposta do token inventado, a senha do link não entra, a antiga entra; controle `39-controle-helena-4min.txt`: link pedido no mesmo segundo, usado com 4 min 15 s, 200 |
| Negativo: token inventado com a mesma mensagem | atende | `31-...` e `37-...`: corpo idêntico ao do link usado e ao do vencido |
| Negativo: email inexistente com a mesma resposta | atende | `31-...` |
| Negativo: produção com `RECUPERACAO_ATIVA=sim` e `EMAIL_ATIVO=nao` não sobe | atende | `32-sonda-config-producao.txt`: controle com `RECUPERACAO_ATIVA=nao` sobe; com `sim` e `EMAIL_ATIVO=nao` (mesmo com URL e chave do provedor) não sobe; `NOTIFICADOR_ARQUIVO` em produção não sobe; `RECUPERACAO_ATIVA` omitida sem provedor não sobe; `fly.toml:67` `RECUPERACAO_ATIVA = "nao"` |
| Isolamento: email de conta do município B pedido pela tela do A tem resposta idêntica à de email inexistente | atende | `31-...`; e2e seção 27 ("email de conta de qualquer municipio: a mesma frase") |
| Isolamento: o token de uma conta não serve para outra | atende | `31-...`: o link da Simone (Vale Fundo) só mudou a senha dela; a do Jonas (Serra Alta) intacta; e2e seção 27 |
| Links pendentes morrem com redefinição por quem administra, troca pela própria pessoa e desativação (achados da rodada 4) | atende | `31-...`: os três 401, a reativação não ressuscita o link, o link anterior morre quando se pede outro, conta desativada não redefine; mordida: sem o gatilho da migração 051, 3 de 7 casos de `recuperacao-morre-com-a-credencial.test.ts` reprovam (`21-mutacao-e10-sem-gatilho.txt`), restaurado |
| Tela: token sai da barra de endereço; `Referrer-Policy: no-referrer` | atende | e2e seção 27 ("o token sai da barra de endereco assim que a tela o le"); `dc360/vercel.json:24-25` |
| Regressão obrigatória | atende | `test:api` 1590 aprovados, 34 pulados, código 0 (`10`); web 688 (`12`); `test:e2e:api` 288 e 149, zero erro de console (`40`); `test:scripts` 288 de 288 (`14`) |
| E2E: seção 14 mantida, mais o caso do link usado duas vezes | atende | `40-...`: seção 14 e seção 27 (42 verificações) OK |
| Validação humana (Rafael faz o fluxo com o notificador de arquivo) | pendente | fora do alcance do validador |

## Evidência

- `npm run test:api`: código 0, 1590 aprovados, 34 pulados (`10-test-api.txt`); `recuperacao` 14, `recuperacao-sem-oraculo` 15, `recuperacao-desligada` 3, `recuperacao-em-producao` 10, `recuperacao-morre-com-a-credencial` 7.
- `DC360_POSTGRES_DE_PROVA=<URL de conexão do cluster descartável> npx vitest run test/renovacao-contra-encerramento.test.ts test/recuperacao-morre-com-a-credencial.test.ts`: código 0, 60 de 60 (`20-corrida-postgres17.txt`; Postgres 17.6 em 127.0.0.1:55871, `log_lock_waits=on`, derrubado e apagado no fim).
- `npm run test --workspace @dc360/web`: código 0, 688 (`12`). `npm run test:scripts`: código 0, 288 (`14`).
- `npm run test:e2e:api` (Chromium): código 0 (`40-e2e-api-chromium.txt`).
- Sondas contra API própria (PGlite, porta 3795, `NOTIFICADOR_ARQUIVO`, `RECUPERACAO_MINUTOS=5`): `31` (27 de 27), `37` (4 de 4), `39`; script `sonda-e10.mjs`. Configuração: `sonda-config.mts`, saída `32`.
- Mutações restauradas com `git restore` e conferidas com `git diff --stat` vazio: `21` (gatilho da 051) e `25` (`replaceState`).
- Uma primeira tentativa do link vencido ficou inválida (a conta usada tinha sido desativada por outra sonda antes, e o gatilho matou o link por isso): arquivada como `37-INVALIDA-tarcisio-desativado-antes.txt` e refeita com outra conta.

## Cenários positivos

- Pedido, link no arquivo, redefinição, senha nova entra e antiga não (`31`, e2e 27).
- Link dentro do prazo vale (`39`).
- Produção com recuperação desligada sobe (`32`, controle).

## Cenários negativos

- Link repetido, vencido, inventado: mesma resposta 401 (`31`, `37`).
- Email inexistente e de outro município: resposta idêntica (`31`).
- Token de uma conta não altera outra (`31`).
- Link pendente morre com redefinição por quem administra, troca pela própria pessoa, desativação e novo pedido; conta desativada não redefine (`31`).
- Produção mal configurada não sobe (`32`).
- Corrida da troca em voo contra o link em Postgres real (`20`).

## Tentativas de reprovar

1. A troca em voo (o FAIL da rodada 4) em Postgres 17.6 real, pelos casos de corrida do repositório que seguram a transação num ponto exato: verdes.
2. Reativação depois da desativação para ver se o link volta: não volta.
3. Email em maiúsculas no pedido, para procurar diferença de corpo: idêntico.
4. Link pedido por conta desativada: resposta neutra, e nenhum link redefine.
5. Link vencido comparado byte a byte com token inventado: idêntico.
6. Mordida dos consertos: sem o gatilho (3 vermelhos) e sem o `replaceState` (1 vermelho).

## Achados

1. **anotado.** Efeito declarado pelo implementador e confirmado: quem tem sessão e a senha atual e troca a senha mata o link que a pessoa acabou de pedir (`31`, "link pendente morre com a troca pela própria pessoa"); a pessoa vê "este link não vale mais". Está em `PENDENCIAS.md`.

Nenhum achado que bloqueia.

## Não verificado

- Só Chromium no e2e; Firefox e WebKit não rodados nesta validação.
- A corrida em Postgres 16 (a do CI): rodei em 17.6; CI ausente (H32).
- Envio real de email (CP-19): fora do escopo, a produção segue desligada.
- Leitor de tela real na confirmação por foco.
- Não medi tempo de resposta entre pedido com e sem conta (oráculo de tempo é da dimensão red-team).

## Risco residual

O gatilho da 051 roda sob RLS forçada com o papel de quem atualizou `usuarios`; um caminho futuro sem município no contexto marcaria zero links sem erro (registrado em `PENDENCIAS.md`, item 6 da seção da E10). Enquanto `RECUPERACAO_ATIVA=nao` em produção, o risco não se materializa.

## Motivo do humano

A etapa pede que Rafael faça o fluxo com o notificador de arquivo e confira que a produção continua desligada; isso não é verificável por execução do validador.
