---
validador: qa
modelo: claude-opus-5-5
etapa: V2-F00-E10
sha_validado: fd17ff4
ci_run: 39420436042
rodada: 7
herdado_de:
tags: [UI, A11Y, AUTH, API, LGPD, INFRA]
nivel_de_prova_exigido: [E1, E2]
nivel_de_prova_obtido: [E1, E2]
veredito: PASS
confianca: alta
humano_necessario: sim
escalar: nenhum
---
## Critérios verificados

SCRATCH abaixo é `/private/tmp/claude-501/-Users-rafaelgomes-Documents-city-hall/20850765-8640-418e-ace7-9257aa515baf/scratchpad/val-qa-e09a13`. Árvore principal em `55209ab` (produto idêntico a `fd17ff4`). O diff `1ed0b71..fd17ff4` não toca `RecuperarSenha.tsx`, `config.ts`, `rotas/autenticacao.ts` nem `vercel.json`, mas toca a guarda de códigos de erro (`servidor.ts`, `guarda-de-codigos-de-erro.ts`, `packages/shared/src/codigos-de-erro.ts`), `e2e-api.mjs` e o painel (foco); por isso refiz tudo do zero.

| Critério (DoD e cinco campos de teste) | Resultado | Prova |
| --- | --- | --- |
| Pedido responde 202 neutro | atende | `SCRATCH/60-sonda-e10-api.txt` (27 de 27): 202 e corpo idêntico para conta existente, inexistente, de outro município e email em maiúsculas |
| O link do arquivo de teste redefine a senha; a nova entra e a antiga não | atende | `60-...`; e2e seção 14 (7 OK) e seção 27 (42 OK) em Chromium e Firefox (`SCRATCH/10-e2e-api-chromium.txt`, `11-e2e-api-firefox.txt`) |
| `recuperar-senha.test.ts` cobre os estados da tela | atende | 47 de 47 em `SCRATCH/01-test-web.txt` (painel 699 de 699); `recuperar-senha-e-sessao.test.ts` 3 de 3 |
| Negativo: o mesmo link duas vezes | atende | `60-...`: segunda vez 401 `sessao_encerrada`, a senha da segunda tentativa não entra; e2e seção 27 |
| Negativo: link vencido | atende | API com `RECUPERACAO_MINUTOS=5` (o mínimo do esquema): link pedido às 13:31:51, usado às 13:37:16 (5 min 25 s): 401 `sessao_encerrada`, corpo idêntico ao do token inventado, a senha do link não entra, a antiga entra (`SCRATCH/62-sonda-e10-link-vencido.txt`, pedido em `61-vencido-pedido.txt`). Controle positivo na mesma configuração: link usado na hora, 200 (`63-controle-link-5min-imediato.txt`) |
| Negativo: token inventado com a mesma mensagem | atende | `60-...` e `62-...` |
| Negativo: email inexistente com a mesma resposta | atende | `60-...` |
| Negativo: produção com `RECUPERACAO_ATIVA=sim` e `EMAIL_ATIVO=nao` não sobe | atende | `SCRATCH/30-sonda-e10-config-producao.txt`: `nao` sobe (como `fly.toml:67`); `sim` com `EMAIL_ATIVO=nao`, mesmo com URL e chave, não sobe; `NOTIFICADOR_ARQUIVO` em produção não sobe; recuperação omitida sem provedor não sobe. Tentativas novas (`31-sonda-e10-config-extra.txt`): `sim` com `EMAIL_ATIVO=sim`, provedor completo e `NOTIFICADOR_ARQUIVO`: não sobe; `SIM`, `talvez` e `nao ` com espaço: não sobem; controle com provedor completo: sobe |
| `fly.toml` com `RECUPERACAO_ATIVA = "nao"`; `Referrer-Policy: no-referrer` | atende | `dc360/fly.toml:67`; `dc360/vercel.json:24-25`; e2e seção 27 ("o token sai da barra de endereco") |
| Isolamento: email de conta do município B pedido pela tela do A tem resposta idêntica à de inexistente | atende | `60-...`; e2e seção 27 |
| Isolamento: o token de uma conta não serve para outra | atende | `60-...`: o link da Simone (Vale Fundo) só mudou a senha dela; Jonas (Serra Alta) intacto |
| Links pendentes morrem com redefinição por quem administra, troca pela própria pessoa e desativação | atende | `60-...` (os três 401, a reativação não ressuscita, o anterior morre quando se pede outro, conta desativada não redefine); Postgres 17.6 real: `recuperacao-morre-com-a-credencial.test.ts` e os casos de link de `renovacao-contra-encerramento.test.ts`, 60 de 60 (`SCRATCH/90-corrida-postgres17.txt`) |
| Regressão obrigatória | atende | `test:api` 1685 aprovados, 34 pulados, código 0 (`02`; `recuperacao` 14, `recuperacao-sem-oraculo` 15, `recuperacao-desligada` 3, `recuperacao-em-producao` 10, `recuperacao-morre-com-a-credencial` 7); painel 699 (`01`); `test:e2e:api` Chromium e Firefox código 0 (`10`, `11`); `test:scripts` 324 de 324 (`03`) |
| E2E: seção 14 mantida, mais o link usado duas vezes | atende | `10`, `11`: seções 14 e 27 inteiras OK nos dois motores |
| Validação humana (Rafael faz o fluxo com o notificador de arquivo) | pendente | fora do alcance do validador |

## Evidência

- `npm run test:api`: código 0 (`SCRATCH/02-test-api.txt`).
- `npm run test --workspace @dc360/web`: código 0, 699 (`SCRATCH/01-test-web.txt`).
- `npm run test:scripts`: código 0, 324 (`SCRATCH/03-test-scripts.txt`).
- `node scripts/e2e-api.mjs chromium` e `firefox`: código 0, 288 e 197 cada, zero erro de console (`SCRATCH/10-...`, `11-...`).
- Sonda contra API própria (PGlite nova, porta 3795, `NOTIFICADOR_ARQUIVO` no SCRATCH, derrubada no fim): `SCRATCH/sondas/sonda-e10.mjs` (de outro validador da rodada 6, relido e reaproveitado), saídas `60`, `61`, `62`, `63`; `sondas/controle-5min.mjs` novo.
- Configuração: `npx tsx SCRATCH/sondas/sonda-config.mts` e `sonda-config-extra.mts` (novo), saídas `30` e `31`, código 0.
- Postgres 17.6 descartável em 127.0.0.1:55913: `SCRATCH/90-corrida-postgres17.txt`, 60 de 60; derrubado e apagado.

## Cenários positivos

- Pedido 202, link do arquivo de teste redefine, a nova entra e a antiga não (API e navegador, dois motores).
- Link usado na hora com o prazo mínimo de 5 minutos: 200 (controle do vencido).
- Configuração de produção com provedor completo e sem canal de teste sobe.

## Cenários negativos

- Link usado duas vezes, vencido, inventado, de conta desativada, anterior a outro pedido, anterior a troca e a redefinição: todos 401 com o mesmo corpo.
- Email inexistente e de outro município: resposta idêntica.
- Seis configurações de produção inválidas não sobem.

## Tentativas de reprovar

1. Vencido sem controle poderia passar porque o link nunca funcionaria com o prazo de 5 minutos: rodei o controle (200 na hora) para fechar essa saída.
2. Tentei ligar a recuperação em produção por valores que um operador poderia digitar (`SIM`, `nao ` com espaço, `talvez`) e por `NOTIFICADOR_ARQUIVO` junto de um provedor real completo: nada sobe.
3. Conferi se a guarda de códigos de erro nova mudou as respostas da recuperação: 202, 401 `sessao_encerrada`, 422 da senha curta e o 503 da recuperação desligada (`recuperacao-desligada.test.ts`) com os códigos de sempre, e as varreduras da API verdes.
4. Procurei vazamento do token pela barra de endereço e pelo cabeçalho: e2e seção 27 confere a remoção; `vercel.json` só tem a política nas duas rotas públicas, como a etapa decidiu.

## Achados

1. **anotado.** As recusas de configuração por valor fora do enum saem com a frase do Zod em inglês ("Invalid enum value. Expected 'sim' | 'nao', received 'SIM'", `31`). É mensagem de partida para quem opera, não tela; anterior a esta rodada.

Nenhum achado que bloqueia.

## Não verificado

- Envio real de email (CP-19 adiado): fora do escopo da etapa por decisão.
- Prova de que os testes da tela mordem: não refiz mutação nesta rodada (edição de arquivo da árvore recusada pelo ambiente); a rodada 6 registrou a mordida do `replaceState` e do gatilho da 051.
- WebKit para as seções 14 e 27: o roteiro do projeto não roda `fluxo-api` no WebKit.
- Os logs do run 39420436042 (exigem token); o resultado job a job foi lido pelo gatekeeper.

## Risco residual

O teto de pedidos por email é por processo (declarado pelo implementador): com mais de uma máquina da API o teto real multiplica. Produção segue desligada; o risco do link em log só aparece quando o CP-19 ligar o provedor.

## Motivo do humano

A etapa pede que Rafael faça o fluxo com o notificador de arquivo e confira que a produção continua desligada, e o portão visual da tela pública é obrigatório para ele (pacote de contexto).
