---
validador: qa
modelo: claude-opus-5-5
etapa: V2-F00-E10
sha_validado: 4ce0433
ci_run: ausente
rodada: 5
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

Execução nesta sessão, worktree destacado em `4ce0433`, API real (`npx tsx src/index.ts`) sobre Postgres 17.6 descartável com os papéis do job `implantavel`, recuperação ligada (padrão fora de produção) e `NOTIFICADOR_ARQUIVO` num arquivo do meu diretório. Saídas em `/private/tmp/claude-501/-Users-rafaelgomes-Documents-city-hall/768bf074-5845-4f2d-bff9-57106bf57383/scratchpad/val/L04-qa/out/` (abaixo, `out/`).

| Critério | Prova | Resultado |
| --- | --- | --- |
| Critério decisivo da rodada 4: "o link do arquivo de teste redefine a senha; a nova entra e a antiga não", com uma troca de senha em voo da sessão que o link derruba | `scripts/sonda-troca-em-voo.mjs`, cenário link, contra a API real e Postgres 17.6: 20 rodadas com o link inteiro dentro da janela dos scrypt da troca (`out/13`, `out/14`) e 25 sorteadas (`out/10`, `out/12`) | 45 de 45 sem defeito. Nas 28 em que o link coube dentro da troca: link 200, a senha do link entra, a do invasor e a antiga não, a troca recusada (401 `sessao_encerrada`), a sessão do invasor não renova, e o mesmo link não serve de novo. Nas sorteadas em que a troca confirmou antes (4), o link respondeu 401 às claras e nenhuma das duas respostas mentiu. Controle com o `trocarSenha` de `bb0f654`: 8 de 8 com as duas respostas 200 e a senha do link sem entrar (`out/22`), o defeito da rodada 4. CONSERTADO |
| Rodada 4, "corrige antes de crescer": link pendente sobrevive à redefinição, à troca e à desativação; `consumir_recuperacao` não confere `ativo` | `scripts/sonda-criterios.mjs` (`out/11`, linhas `[E10]`); `recuperacao-morre-com-a-credencial.test.ts` 7 de 7 em Postgres real (`out/05`) | o link pendente é recusado (401) depois da redefinição por quem administra, da troca pela própria pessoa e da desativação; a reativação não o ressuscita; a senha do link morto não entra |
| Positivo: pedido responde 202 neutro | `out/11`; e2e seções 14 e 27 | 202, corpo e tipo idênticos para conta existente, inexistente e de outro município |
| Positivo: o link do arquivo de teste redefine; a nova entra e a antiga não | `out/11`; e2e seção 14 (7 conferências) e 27 (42) em Chromium e Firefox (`out/15`, `out/20`) | 200; a nova entra; a antiga 401; a sessão aberta antes cai |
| Positivo: `recuperar-senha.test.ts` cobre os estados da tela | `out/06` | 47 de 47, mais `recuperar-senha-e-sessao.test.ts` 3 de 3 |
| Negativo: o mesmo link duas vezes | `out/11`; `out/17` (dez usos paralelos, três vezes); e2e seção 27 | a segunda 401 e a senha dela não vale; em paralelo, exatamente um 200 e só a senha dele entra, 3 de 3 |
| Negativo: link vencido | `out/11` (`expira_em` vencido no banco pelo superusuário) | 401 com a mesma resposta do link usado; a senha antiga continua e a tentada não entra |
| Negativo: token inventado, mesma mensagem | `out/11`; e2e seção 27 | resposta idêntica byte a byte à do link usado |
| Negativo: e-mail inexistente, mesma resposta | `out/11`; e2e seção 27 | idêntica |
| Negativo: produção com `RECUPERACAO_ATIVA=sim` e `EMAIL_ATIVO=nao` não sobe | `scripts/sonda-config.mts` chamando `carregarConfig` com ambiente de produção (`out/16`); `recuperacao-em-producao.test.ts` 10 de 10 | recusa (também com URL e chave do provedor preenchidas, e com o padrão ausente); `NOTIFICADOR_ARQUIVO` em produção recusado com a recuperação desligada e com ela ligada e o provedor completo; o controle completo sem o arquivo sobe |
| Isolamento: e-mail de conta de B pedido pela tela de A responde como inexistente | `out/11`; e2e seção 27 | idêntica |
| Isolamento: o token de uma conta não serve para outra | `out/11` | o link de X redefine só X; Y continua com a senha dela e a senha do link de X não entra em Y |
| Infra: `Referrer-Policy: no-referrer` e produção desligada | `out/16` | `vercel.json` com o `source` das rotas `recuperar-senha` e `redefinir-senha` e `no-referrer`; `fly.toml` com `RECUPERACAO_ATIVA = "nao"` e sem `EMAIL_ATIVO = "sim"` nem `NOTIFICADOR_ARQUIVO` fora de comentário |
| Tela: token sai da barra de endereço | e2e seção 27 | "o token sai da barra de endereço assim que a tela o lê", nos dois motores |
| Regressão obrigatória | `npm run test:api` (`out/01`: 1451 aprovados, 34 pulados por ambiente, 0 falha); `npm run test --workspace @dc360/web` (`out/06`: 669 de 669); `npm run test:e2e:api` (`out/15`, `out/20`: 288 e 64 por motor); `npm run test:scripts` (`out/08`: 288 testes, 284 aprovados, 4 pulados, 0 falha) | todos código 0 |
| E2E: seção 14 mantida, mais o caso do link usado duas vezes | `out/15`, `out/20` | seção 14 com 7 conferências e a 27 com "o mesmo link duas vezes: a segunda é recusada" e "a senha que a segunda tentativa quis definir NÃO vale", verdes nos dois motores |
| DoD: fluxo provado ponta a ponta com notificador de teste; estados da tela testados; produção comprovadamente desligada | linhas acima | sim; o item "recuperação" do G00 marca-se no gate |

## Evidência

- `out/13-sonda-troca-em-voo-janela-pg17.txt` e `out/14-analise-da-janela.txt`: `MODO=dentro RODADAS=20 node scripts/sonda-troca-em-voo.mjs`, código 0.
- `out/10` e `out/12`: a mesma sem grampo, 25 rodadas, código 0.
- `out/22-sonda-contra-mutante-bb0f654.txt`: o controle, código 1 (esperado).
- `out/11-sonda-criterios-pg17.txt`: 22 conferências da E10, 0 falha, código 0.
- `out/17-sonda-link-corridas-pg17.txt`: dez usos paralelos (3 vezes) e 20 disputas do link contra a redefinição por quem administra, código 0.
- `out/16-sonda-config-producao.txt`: 9 de 9, código 0.
- `out/05-auth-postgres-real.txt` (inclui `recuperacao.test.ts` 14, `recuperacao-sem-oraculo.test.ts` 15, `recuperacao-desligada.test.ts` 3, `recuperacao-em-producao.test.ts` 10, `recuperacao-morre-com-a-credencial.test.ts` 7, e os casos 12, 22, 29 e 32 do arquivo da corrida), 291 de 291, código 0.
- `out/23-migrar-por-cima.txt`: a 051 aplicada por cima de um banco na 046, `--conferir` "Esquema em dia.", 27 funções SECURITY DEFINER.
- `out/24-log-do-postgres.txt`: 0 impasse, 0 resposta 500.

## Cenários positivos

- Pedido neutro, link no arquivo do notificador, redefinição, a nova entra e a antiga não, sessões anteriores derrubadas (API e painel, dois motores).
- O link vence a troca em voo quando confirma primeiro (28 de 28 rodadas nessa ordem).
- O link contra a redefinição por quem administra, sem grampo (`out/17`, 20 rodadas: 11 com o link 200 e 9 com o link recusado): a temporária sempre vale, a senha do link nunca sobra, a sessão aberta antes cai.

## Cenários negativos

- Link reutilizado, vencido, inventado: mesma recusa, senha tentada sem valor.
- Dez usos paralelos do mesmo link: um só vence.
- Link pendente depois de redefinição, troca e desativação: recusado; reativação não o ressuscita.
- Conta de outro município e e-mail inexistente: mesma resposta do pedido.
- Sete combinações de produção: só as permitidas sobem.

## Tentativas de reprovar

1. Repeti o cenário que reprovou a rodada 4 no ponto exato (a troca sai primeiro, o link 10 a 150 ms depois e termina antes dela): 20 de 20 com o link valendo. Não quebrou.
2. O link contra a redefinição por quem administra, ordem e atraso sorteados: procurei a senha do link sobrando ou a temporária sem entrar. Nenhum caso.
3. Dez usos simultâneos do mesmo link em Postgres real (a rodada 4 só os mediu em PGlite): um vencedor só.
4. Link vencido de fato (prazo no banco) e token com o prefixo trocado: mesma frase.
5. Configuração de produção com o provedor preenchido mas `EMAIL_ATIVO=nao`, e com o notificador de arquivo junto de um provedor completo: recusa nos dois.
6. Controle mutante para ter certeza de que a sonda enxerga o defeito: 8 de 8.

## Achados

- anotado: quem tem uma sessão e a senha atual e troca a senha antes de a pessoa usar o link mata o link, e a pessoa lê "este link não vale mais" (4 rodadas sorteadas em `out/10`). É o efeito aceito e escrito pelo implementador em `PENDENCIAS.md` (item 5 da seção da E10); a resposta é honesta e o remédio que vence sempre é a redefinição por quem administra, que a sonda provou vencer. Não decide o critério: o link não responde 200 sem valer.
- anotado: a resposta real da Vercel com `Referrer-Policy` não foi vista (o `vite preview` não aplica o `vercel.json`); só o arquivo.

## Não verificado

- Envio real de e-mail e o provedor (CP-19 adiado).
- Cabeçalhos na resposta real da Vercel.
- Postgres 16 e o run do CI (ausente).
- Leitor de tela e auditoria visual das telas públicas (dimensões de acessibilidade e UX).

## Risco residual

Baixo enquanto a produção roda com `RECUPERACAO_ATIVA = "nao"`. Ao ligar (CP-19), fica o efeito anotado (a troca por quem tem a senha mata o link) e a dependência de o gatilho da 051 rodar com município no contexto (registrado em `PENDENCIAS.md`, item 6).

## Motivo do humano

A etapa pede que o Rafael faça o fluxo com o notificador de arquivo e confira que a produção continua desligada, e a tela é pública (portão visual obrigatório pelo texto): frases e clareza da tela são decisão de produto. O veredito técnico não depende disso.
