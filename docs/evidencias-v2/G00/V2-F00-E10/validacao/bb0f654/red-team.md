---
validador: red-team (general-purpose com o papel da dimensão)
modelo: claude-opus-5-5
etapa: V2-F00-E10
sha_validado: bb0f654
ci_run: ausente (39143791434 citado pelo implementador, não lido)
rodada: 4
herdado_de:
tags: [UI, A11Y, AUTH, API, LGPD, INFRA]
nivel_de_prova_exigido: [E1, E2]
nivel_de_prova_obtido: [E1, E2]
veredito: PASS
confianca: media
humano_necessario: nao
escalar: CP-19 (ligar RECUPERACAO_ATIVA e EMAIL_ATIVO em produção) não pode acontecer com os achados 1 a 3 abertos; autenticação, seção 7 item 2 de 28, sem risco aceito
---
## Critérios verificados

| Critério da etapa | Resultado | Prova |
| --- | --- | --- |
| Pedido responde 202 neutro; e-mail inexistente com a mesma resposta | PASS | Mesmo status, corpo e cabeçalhos (fora data e contadores) para conta de Serra Alta, conta de Vale Fundo, inexistente e e-mail em maiúsculas (saída `01`, E10.I). |
| Pedido com e-mail de conta do município B "pela tela do município A" idêntico ao inexistente | PASS | Idem; o painel é um só domínio e nada no painel ou na API escolhe município pelo host (busca por `hostname`, `headers.host`, `x-organizacao` sem ocorrência de escolha de município). |
| O mesmo link duas vezes, a segunda recusada | PASS | 10 usos PARALELOS do mesmo link em Postgres 17: exatamente um 200 e nove 401 (E10.K). |
| Token inventado: mesma mensagem | PASS | Corpo idêntico ao do link já usado (E10.K). |
| O token de uma conta não serve para outra | PASS | O link de Vale Fundo troca só a senha dela; a conta de Serra Alta segue entrando (E10.O). |
| Produção: `RECUPERACAO_ATIVA = "nao"`, e `config.ts` recusa ligar sem destino e recusa `NOTIFICADOR_ARQUIVO` | PASS | `git show bb0f654:dc360/fly.toml` linha 67; `config.test.ts`, `recuperacao-em-producao.test.ts` e `recuperacao-desligada.test.ts` verdes (saída `02`). |
| Teto de pedidos e relógio sem oráculo | PASS com observação | Medido; diferença de mediana de 0,09 ms no servidor (achado 4). |
| Regressão da correção 3 da E07 (`emitirPar`) na recuperação | PASS | Depois do link, a senha nova entra e a antiga não (E10.K, E10.O); `consumir_recuperacao` toma a trava depois do UPDATE (migração 049), coberto pelo bloco de Postgres real verde (saída `02`). |

## Evidência

Saídas em `/private/tmp/claude-501/-Users-rafaelgomes-Documents-city-hall/ded47d25-806d-4495-ac61-f9e84518cc35/scratchpad/validadores/red-team-E09-E10-E13-E15/`:

- `sonda-api.mts` contra a API real e um PostgreSQL 17.6 próprio (porta 55479, só TCP local), com notificador injetado que guarda as mensagens (equivale ao `NOTIFICADOR_ARQUIVO`), `RECUPERACAO_POR_EMAIL_HORA=60` só para caber a medição de tempo: `01-sonda-api.txt`, código 0.
- `npx vitest run` (API) com o bloco de Postgres real ligado: `02-vitest-api-etapas.txt`, código 0, 159 de 159 (inclui `recuperacao.test.ts`, `recuperacao-desligada.test.ts`, `recuperacao-sem-oraculo.test.ts`, `recuperacao-em-producao.test.ts`, `config.test.ts`, `superficie.test.ts`).
- `npm run test --workspace @dc360/web`: `04-vitest-web.txt`, 665 de 665 (inclui `recuperar-senha.test.ts` e `recuperar-senha-e-sessao.test.ts`).
- Leitura de `dc360/vercel.json` (cabeçalho `Referrer-Policy: no-referrer` e `X-Robots-Tag` em `/(recuperar-senha|redefinir-senha)`) e de `RecuperarSenha.tsx:361-372` (token lido uma vez, `history.replaceState` sem a query).

## Cenários positivos

- Pedido para conta existente: 202 neutro; o notificador recebe a mensagem para Jonas (Serra Alta) e para Simone (Vale Fundo), e para o e-mail em maiúsculas (mesma conta).
- O link do notificador redefine a senha; a nova entra; a antiga não.
- Link de Vale Fundo troca só a senha de Vale Fundo.

## Cenários negativos

- E-mail inexistente: 202 idêntico e nenhuma mensagem enviada.
- Conta desativada pedindo de novo: 202 idêntico e nenhuma mensagem nova (contagem de mensagens para Jonas não muda).
- Link reusado em paralelo (10 pedidos): nove recusas iguais.
- Token inventado de 43 caracteres: a mesma recusa, mesma frase.

## Tentativas de reprovar

1. **Enumeração pelo corpo, status e cabeçalhos:** comparados os quatro casos byte a byte, inclusive cabeçalhos (fora `date` e contadores de limite). Não reprovou.
2. **Enumeração pelo relógio (servidor, sem rede):** 100 pedidos alternados de cada lado contra Postgres 17. Conta que existe: mediana 0,45 ms (p10 0,30, p90 0,97); que não existe: mediana 0,36 ms (p10 0,24, p90 0,72). Diferença de cerca de 0,09 ms, dentro do ruído e muito abaixo do jitter de rede; o teto por e-mail (5 por hora por processo) dá ao atacante 5 amostras por e-mail por hora, insuficientes. Não reprovou (achado 4, anotado).
3. **Adivinhar ou reusar o link:** token de 32 bytes aleatórios, guardado só como hash; reúso paralelo dá um único 200. Não reprovou.
4. **Link de outro município:** o município vem do registro do link, nunca do pedido. Não reprovou.
5. **Disputa entre o link e a redefinição por quem administra (REPROVOU como achado).** Link pedido; a administradora redefine (200, temporária entregue); o link pedido ANTES continua valendo: 200, troca a senha, derruba a sessão aberta com a temporária e a temporária deixa de entrar (E10.L).
6. **Link contra a troca de senha pela própria pessoa (REPROVOU como achado).** O dono troca a senha depois de o link sair; o link antigo ainda redefine (200) e derruba a sessão do dono (E10.M).
7. **Recuperação de conta desativada (REPROVOU como achado).** Pedido novo com a conta desativada não gera link (correto), mas o link pedido ANTES da desativação ainda redefine a senha da conta desativada (200); a conta não entra desativada (401), e na reativação vale a senha de quem tinha o link (200) e a anterior deixa de valer (E10.N).
8. **Vazamento do token pelo Referer:** o token sai da barra de endereço por `replaceState`; o cabeçalho `no-referrer` vale nas duas rotas; e a política padrão dos navegadores já corta caminho e query em pedido entre origens. Não reprovou (o cabeçalho na Vercel real não foi conferido, ver Não verificado).

## Achados

1. **Corrige antes de crescer (bloqueia o CP-19).** Redefinição por quem administra não invalida o link de recuperação pendente. Reprodução: `POST /auth/recuperar` para a conta; `POST /usuarios/:id/redefinir-senha` pela administradora; `POST /auth/redefinir` com o token do primeiro passo: 200, e a temporária entregue deixa de valer. Por 30 minutos (`RECUPERACAO_MINUTOS`) quem tem o link desfaz o remédio da E09. Causa: só `abrir_recuperacao` (pedido novo) e `consumir_recuperacao` marcam `usada_em`; nem a redefinição da rota de administração, nem `trocar_senha`, nem a desativação tocam `recuperacoes_senha`.
2. **Corrige antes de crescer (bloqueia o CP-19).** Troca de senha pela própria pessoa não invalida o link pendente (E10.M). Quem troca a senha porque desconfia de invasão continua exposto ao link já enviado.
3. **Corrige antes de crescer (bloqueia o CP-19; seção 7 item 2, vigência de conta desativada).** `consumir_recuperacao` não confere `usuarios.ativo` e a desativação não invalida o link: a senha da conta desativada é trocada por quem tinha o link, e passa a valer na reativação (E10.N).
4. **Anotado.** Diferença de 0,09 ms de mediana no tempo do pedido (escrita do link contra leitura vazia), não explorável com o teto atual e rede real.

Os três primeiros não quebram critério escrito da etapa (que trata reúso, vencimento, token inventado, resposta uniforme e produção desligada, todos verdes) e não têm efeito em produção hoje, porque a recuperação está desligada (`RECUPERACAO_ATIVA = "nao"`). Por isso o veredito é PASS, com a escalada de que o CP-19 não liga a recuperação antes do conserto (invalidar os links pendentes em toda troca, redefinição e desativação, e conferir `ativo` em `consumir_recuperacao`).

## Não verificado

- O cabeçalho `Referrer-Policy` e o `X-Robots-Tag` servidos pela Vercel real (não há deploy desta versão ao alcance; só a leitura de `vercel.json`).
- O notificador HTTP real (Resend): CP-19 aberto, sem provedor.
- Teto por e-mail com mais de uma máquina (é por processo, limitação já declarada).
- A tela `RecuperarSenha.tsx` não foi exercitada em navegador nesta dimensão (vitest do painel verde).

## Risco residual

Hoje nulo em produção (recuperação desligada). No dia em que o CP-19 ligar a recuperação, os achados 1 a 3 deixam um link de 30 minutos sobreviver à redefinição por quem administra, à troca pela própria pessoa e à desativação.

## Motivo do humano

Nenhum para esta dimensão. A decisão de ligar a recuperação é o CP-19, já registrado como do Rafael; aqui só se pede que ele não seja tomado com os achados abertos.
