---
validador: seguranca-aplicacao
modelo: claude-opus-5-5
etapa: V2-F00-E10
sha_validado: 4ce0433
ci_run: ausente
rodada: 5
herdado_de:
tags: [UI, A11Y, AUTH, API, LGPD, INFRA]
nivel_de_prova_exigido: [E1, E2]
nivel_de_prova_obtido: [E1, E2, E3a]
veredito: PASS
confianca: media
humano_necessario: sim
escalar: nenhum
---
## Critérios verificados

Régua: OWASP ASVS 4.0 nível 2 (V2.5 recuperação de credencial, V3 sessão, V14 configuração). Execução num worktree meu em `4ce0433` (`src` da API idêntico ao SHA), PostgreSQL 17.6 real (porta 56337), recuperação ligada só no servidor de teste com notificador que guarda a mensagem.

Itens do "Motivo do veredito" da rodada 4 (bb0f654):

1. **A redefinição pelo link perdia para a troca em voo da sessão que ela derruba (o FAIL, 12 de 12).** CONSERTADO pelo conserto de `trocarSenha` da E07. Prova minha: casos 12, 22, 29 e 32 de `renovacao-contra-encerramento.test.ts` verdes em 17.6 (`saidas/01`); vermelhos com o `servico.ts` de `bb0f654` (12, 22 e 29 na lista de 23 vermelhos, `saidas/02`); sonda de caos própria, 12 rodadas de link contra a troca do invasor sem grampo: 11 vencidas pelo link (troca 401, senha do link entra, senha do invasor não, cadeia do invasor sem sessão) e 1 com a troca primeiro e o link recusado às claras (401), 0 sobrevivente (`saidas/03`, `[C]`); com o `servico.ts` de `bb0f654`, 5 de 6 rodadas de link com a senha do invasor valendo (`saidas/12`).
2. **Link pendente sobrevivendo à redefinição por quem administra, à troca pela própria pessoa e à desativação; `consumir_recuperacao` sem conferir `ativo`.** CONSERTADO pela 051 (`dc360/db/migrations/051_link_de_recuperacao_morre_com_a_credencial.sql`). Prova minha: L1, link pedido pela rota e depois redefinição: link 401 com a frase única, temporária entra; L2, link pedido e conta desativada: 401; link gravado DEPOIS da desativação: 401; depois de reativar, a senha do link não entra (`saidas/03`). A troca pela própria pessoa matando o link: `recuperacao-morre-com-a-credencial.test.ts` 7 de 7 em 17.6 (`saidas/01`). O teste morde (mutação no banco da sonda, depois de migrar): sem o gatilho, L1 vermelho (link 200 depois da redefinição); `consumir_recuperacao` com o corpo da 049, L2 vermelho (link 200 na conta desativada, senha do link entra depois da reativação) (`saidas/04-mutacao-051-gatilho.txt`, `04-mutacao-051-consumir.txt`).

Critérios da etapa que tocam a dimensão:

- **Resposta uniforme, sem enumeração** (Testes negativos e de isolamento): 20 pedidos de cada tipo (e-mail que existe, que não existe, de conta do município B): UMA só forma de resposta (202 e o mesmo corpo); mediana 0,5 ms nos três (`[L4]`). O envio sai depois da resposta (`servico.ts:1006-1031`).
- **Uso único, vencido, inventado:** primeiro uso 200; o mesmo link de novo, um link vencido e um token inventado: 401 com o MESMO corpo (`[L4]`).
- **O token de uma conta não serve a outra:** o token só se resolve pelo hash e devolve o dono gravado (`consumir_recuperacao`, 051); o município vem do registro, nunca do pedido.
- **Token fora da URL e Referer fechado:** painel construído no worktree e servido localmente com os cabeçalhos de `dc360/vercel.json` emulados, Chromium (Playwright): `/redefinir-senha?token=...` responde `Referrer-Policy: no-referrer`; depois de carregar, `location.href` é `/redefinir-senha` sem o token; voltar no histórico também mostra a URL limpa; dos 20 pedidos da página, nenhum levou o token na URL nem no `Referer`; zero erro de console (`saidas/10`).
- **Produção desligada:** `fly.toml` declara `RECUPERACAO_ATIVA = "nao"` (linha 67). Partida REAL da API (`node --import tsx src/index.ts`, `NODE_ENV=production`): `RECUPERACAO_ATIVA=sim` com `EMAIL_ATIVO=nao` e provedor preenchido sai com código 1 e a mensagem do EMAIL_ATIVO; `RECUPERACAO_ATIVA=sim` sem provedor sai 1; `NOTIFICADOR_ARQUIVO` em produção sai 1; o controle com `RECUPERACAO_ATIVA=nao` passa da configuração e só cai ao procurar o banco inexistente (`saidas/07`, roteiro `sondas/partida.sh`). Nenhum processo ficou escutando.
- **Link pendente morrendo com a credencial (051):** acima, item 2.

## Evidência

Saídas em `/private/tmp/claude-501/-Users-rafaelgomes-Documents-city-hall/768bf074-5845-4f2d-bff9-57106bf57383/scratchpad/val/L02-seguranca/saidas/`; sondas em `.../L02-seguranca/sondas/` (`zz-sonda-l02.test.ts`, `partida.sh`, `navegador-token.mjs`).

| # | Comando | Código | Resultado |
| --- | --- | --- | --- |
| 01 | `npx vitest run` dos oito arquivos de autenticação e recuperação (inclui `recuperacao`, `recuperacao-sem-oraculo`, `recuperacao-desligada`, `recuperacao-morre-com-a-credencial`) em PG 17.6 | 0 | 133 de 133, nenhum pulado |
| 02 | arquivo da corrida com `servico.ts` de `bb0f654` | 1 | 23 de 53 vermelhos (12, 22, 29 entre eles) |
| 03 | `zz-sonda-l02.test.ts` | 0 | L1, L2, L4 verdes; L3 e L5 registram os achados |
| 04 | sonda E10 com `MUTAR_051=gatilho` e `MUTAR_051=consumir` | 1 e 1 | L1 vermelho; L2 vermelho |
| 05 | sonda L5 (pedido contra desativação) | 0 | achado B2 reproduzido |
| 07 | `bash sondas/partida.sh` (partida de produção) | 1 em cada caso | recusa nos três casos; controle passa da configuração |
| 08 | `npx vitest run` de `recuperar-senha.test.ts` e `recuperar-senha-e-sessao.test.ts` (web) | 0 | 50 de 50 |
| 10 | `node sondas/navegador-token.mjs` (painel construído, Chromium) | 0 | token fora da URL, 0 vazamento por Referer |

## Cenários positivos

- Controle: link pedido pela rota redefine; a senha nova entra e a antiga não (`recuperacao-morre-com-a-credencial`, 17.6; L4 primeiro uso 200).
- Pedido de recuperação responde 202 neutro (L4).
- Troca, redefinição e desativação que vêm DEPOIS do link usado não são afetadas (casos do repositório).

## Cenários negativos

- Mesmo link duas vezes, vencido, inventado: 401 idêntico (L4).
- E-mail inexistente e de outro município: resposta idêntica (L4).
- Link pendente depois de redefinição, troca, desativação; link numa conta desativada: 401, hash intacto (L1, L2, repositório).
- Produção com `RECUPERACAO_ATIVA=sim` e `EMAIL_ATIVO=nao`: não sobe (07).

## Tentativas de reprovar

1. **Mutar a 051** (sem gatilho; `consumir_recuperacao` sem conferir `ativo`): as sondas ficam vermelhas pelo motivo do achado.
2. **Desfazer o conserto da troca** (servico.ts de bb0f654): link perde para a troca em voo de novo (caos 5 de 6; casos 12, 22, 29 vermelhos).
3. **Outros jeitos de o link sobreviver à mudança da conta:** troca de e-mail por quem administra (B1, reproduzido) e pedido no mesmo instante da desativação (B2, reproduzido). Reativação, edição de cadastro e falha de login não matam o link por decisão (M4 do implementador), e isso continua.
4. **Enumeração por tempo:** medianas iguais (0,5 ms) entre e-mail que existe, que não existe e de outro município.
5. **Token pela URL e Referer:** navegador real, histórico conferido, todas as requisições inspecionadas.
6. **Partida insegura em produção:** três combinações, todas recusadas pela partida real.

## Achados

- **B1, corrige antes de crescer (bloqueia ligar a recuperação no CP-19):** o link pendente sobrevive à troca do e-mail da conta. Reprodução (`[L3]`, 17.6): pedir o link para o e-mail do Diego; quem administra troca o e-mail dele (`PATCH /usuarios/:id`, 200); o link que foi para o e-mail ANTIGO redefine a senha (200) e a senha do link entra no e-mail novo (200). Quem troca o e-mail porque a caixa antiga foi perdida ou invadida deixa o link já entregue nela valendo por `RECUPERACAO_MINUTOS`. Conserto pequeno: incluir `email` na condição do gatilho da 051 (nova migração).
- **B2, corrige antes de crescer (bloqueia o CP-19):** `abrir_recuperacao` (005) lê `usuarios` sem trava. Um pedido de link no mesmo instante de uma desativação ainda não confirmada não espera nada (2 ms), grava o link e confirma; a desativação confirma depois e o gatilho não viu o link. Reprodução (`[L5]`, 17.6, `saidas/05`): conexão 1 `BEGIN; UPDATE usuarios SET ativo = false`; pedido pela rota (202, mensagem enviada); conexão 1 revoga as sessões e confirma: 1 link vivo na conta desativada; quem administra reativa e o link redefine a senha (200). Enquanto desativada o link é recusado (consumir confere `ativo`), então o efeito exige reativação dentro do prazo do link. Conserto: `FOR SHARE` (ou `FOR NO KEY UPDATE`) na leitura de `usuarios` de `abrir_recuperacao`, na mesma ordem dos outros caminhos (linha da pessoa antes das linhas dos links).
- **B3, anotado:** `Referrer-Policy` e `X-Robots-Tag` foram conferidos com os cabeçalhos do `vercel.json` emulados localmente, não na Vercel (o implementador também registrou a conferência no primeiro deploy como pendente).

## Não verificado

- O cabeçalho servido de verdade pela Vercel (B3) e o comportamento do provedor real de e-mail (CP-19 adiado).
- CI do SHA (ausente). Postgres 16 não rodado por mim.
- Regressão `npm run test:e2e:api`, `test:scripts` e a suíte web inteira não rodadas por mim (rodei os dois arquivos web de recuperação e os oito da API).
- O teto por e-mail ser por processo (anotado pelo implementador) não foi medido com mais de uma máquina.

## Risco residual

Com a produção desligada até o CP-19, B1 e B2 não estão expostos hoje; os dois precisam de conserto antes de `RECUPERACAO_ATIVA=sim`. O link continua passando pela URL até chegar ao painel (registro de acesso da Vercel e do provedor de e-mail); a remoção pela barra e o `no-referrer` reduzem, não eliminam.

## Motivo do humano

A conferência do `Referrer-Policy` e do `X-Robots-Tag` na URL real da Vercel, no primeiro deploy, depende de quem tem acesso ao projeto da Vercel; e a validação humana da etapa (Rafael fazer o fluxo com o notificador de arquivo e conferir a produção desligada) é do processo.
