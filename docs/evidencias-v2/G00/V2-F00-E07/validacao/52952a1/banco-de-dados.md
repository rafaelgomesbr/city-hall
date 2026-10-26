---
validador: banco-de-dados (agente general-purpose com o papel da dimensão)
modelo: claude-opus-5-5
etapa: V2-F00-E07
sha_validado: 52952a1
ci_run: 38618369218
rodada: 3
herdado_de:
tags: [AUTH, DB, MIGRATION, API, TENANT, RLS]
nivel_de_prova_exigido: [E1, E2]
nivel_de_prova_obtido: [E1, E2]
veredito: FAIL
confianca: media
humano_necessario: nao
escalar: arbitragem em Opus sobre o escopo do achado 1 (login no mesmo instante da troca ou redefinição de senha); o defeito da rodada 2 está consertado e provado
---
## Critérios verificados

Ambiente: cluster PostgreSQL 17.10 descartável (binários do gatekeeper em `$SP/pg/x`, `initdb` meu, porta 55531, `log_lock_waits=on`, `deadlock_timeout=200ms`), papéis exatamente como o job `implantavel` (`dc360_setup` CREATEROLE BYPASSRLS NOSUPERUSER; `dc360_api` login restrito, membro de `dc360_app WITH SET TRUE`). API do SHA rodando por `tsx src/index.ts` com `dc360_api` contra esse banco (porta 55631, `LOGIN_POR_IP=10000` só para permitir as rajadas). Cluster, API e pastas apagados no fim. Saídas em `$SP/val/banco-de-dados/` (abaixo, só o nome do arquivo).

1. Defeito da rodada 2 (renovação concorrente com "encerrar sessões" deixava sessão viva em família encerrada, 5 de 60): NÃO MORDE MAIS. Campanha própria pela API real, em Postgres 17, 890 disputas com atraso sorteado nos dois sentidos (`20-corrida-verde-pg17.txt`): quem administra encerra (200), a própria pessoa encerra as outras (150), reuso de token rotacionado (150), troca de senha pela própria pessoa (100), desativação da conta (150), redefinição por quem administra (100) e quem renova sem parar enquanto a administradora encerra (40). Em todas: 0 sessão viva na família ou no usuário encerrado, 0 par emitido na disputa que renovou depois, 0 escrita aceita com o token de acesso anterior, 0 resposta 500. A mistura de resultados (por exemplo 121 renovações 200 e 79 401 no caso do administrador) mostra que as disputas caíram dos dois lados da trava.
2. O teste do repositório em Postgres real (`apps/api/test/renovacao-contra-encerramento.test.ts`, bloco com `DC360_POSTGRES_DE_PROVA`): 14 de 14, três vezes seguidas, sem "skipped" (`10-corrida-repo-1..3.txt`). No CI (run 38618369218, job "A API sobe contra Postgres real", Postgres 16): "14 passed (14)" e o passo reprova se houver pulo (`41-ci-implantavel.log`).
3. O teste morde (desfazer o conserto, ver vermelho, restaurar): ver "Tentativas de reprovar", itens 1 e 2. Mutação A (sem a trava na renovação): minha campanha volta a deixar sessão viva (7 de 100, 5 de 60, 6 de 15) e o teste do repositório fica 6 de 14 vermelhos, inclusive o caso 6 sem grampo com 20 de 60 rodadas com sessão viva. Mutações B e C (049 sem a trava na suspensão; 050 sem `FOR SHARE`): casos 8 e 9 vermelhos, o 9 pelo efeito real (a sessão do login renovou 200 depois da reativação). Restaurado com `git restore`; `git status --porcelain` vazio depois de cada uma.
4. Impasse (deadlock): nenhum. Caos com 12 atos simultâneos sobre a mesma pessoa (renovação em laço, encerrar as minhas, trocar a própria senha, encerrar por quem administra, redefinir, desativar, mudar papel, entrar, renovar outro aparelho, sair, suspender e reativar o município pelo console), 160 iterações (`80-caos-impasse.txt`, `81-caos-impasse-com-papel.txt`): 0 erro 40P01, 0 resposta 500, e o log do Postgres sem nenhuma linha "deadlock" (`pg17-cluster-a.log`). A ordem da 049 (linha de `usuarios` antes da trava; a renovação não atualiza `usuarios` e a chave estrangeira só pede FOR KEY SHARE) confere com o que medi.
5. Teto de SECURITY DEFINER: 27, nenhuma sem `search_path` (`06-catalogo.txt`). `travar_sessoes_do_usuario` é SECURITY INVOKER, dono `dc360_setup`, EXECUTE só para `dc360_app`; as cinco funções recriadas mantêm dono `dc360_setup` e as permissões (`console_suspender_municipio` só para `dc360_console`). `db/test/isolamento.test.ts` não mudou desde 4b96ea7 (teto `toBeLessThanOrEqual(27)` na linha 626).
6. Migração aplicada editada: nenhuma. `git diff --name-status afde25c..52952a1 -- db/migrations` só ACRESCENTA 047 a 050; 047 e 048 inalteradas desde 4b96ea7.
7. As 50 migrações do zero, em Postgres 17 com o papel de setup: `--conferir` no banco vazio acusa as 50 e sai 1; `migrar` aplica as 50; `--conferir` "Esquema em dia."; segunda execução "Nada a fazer: 50" (`02` a `05`).
8. Sobre banco existente: banco levado só até a 048 pelo `aplicarMigracoes` do repositório, semeado, com sessões de cadeia viva (Jonas, rotacionada e viva), de família encerrada por quem administra (Helena) e de outro município (Tarcísio) (`90`, `91`). `--conferir` antes: falta 049 e 050, código 1; `migrar` aplica só as duas; depois "Esquema em dia." e "Nada a fazer: 50" (`92`). Sessões intactas (`93`). Depois da 049/050, como `dc360_app`: herdar a família encerrada da Helena recusa com DC369; herdar a família viva do Jonas aceita; família de outro município recusa com DC369; sem contexto, 0 sessão visível (`94`).
9. RLS: 35 de 36 tabelas do `public` com RLS ativada e forçada (a de fora é `schema_migracoes`) (`06`). `npm run test:isolamento` 345 aprovados e 3 pulados de 348, código 0 (`50-test-isolamento.txt`).
10. Cinco campos de teste da etapa no que toca o banco: rotação normal não é expulsão (caso 5 do repositório, verde); administrador, própria pessoa, reuso e troca de senha encerram a cadeia e o token anterior recebe `sessao_encerrada` (campanha do item 1, `antigoEscreveu: 0` em todos). Papel e senha provisória não mudaram nesta correção e não foram retestados por mim além do caos (troca de papel concorrente sem impasse).
11. Item "sessão revogada" do G00 e da seção 7 de `28`: FALHA por um caminho que a trava não cobre, ver Achados 1.

## Evidência

- `01`, `03` a `06`, `08`: provisionamento como o CI, migração do zero, conferência, idempotência, semente, catálogo (definers, donos, ACL, RLS, papéis). Código 0 em todos.
- `02`: `migrar --conferir` em banco vazio, código 1 (faltam 50).
- `10-corrida-repo-1..3.txt`: teste do repositório em Postgres 17, 14 de 14, três vezes, código 0.
- `20-corrida-verde-pg17.txt` (script `corrida.mjs`): 890 disputas pela API, 0 sobra.
- `30` a `33` (script `login-corrida.mjs`): o achado 1.
- `41-ci-implantavel.log`: job do CI com a prova da corrida, 14 de 14.
- `50-test-isolamento.txt`: `npm run test:isolamento`, código 0.
- `70` a `72` e os `.diff`: as três mutações e a restauração.
- `80`, `81` (script `caos.mjs`): caça ao impasse.
- `90` a `94` (script `ate-048/aplicar.mts`): 049 e 050 sobre banco existente.
- `98-sair-com-token-rotacionado.txt`: achado anotado 4.
- `pg17-cluster-a.log`: log do servidor da rodada inteira (0 "deadlock").

## Cenários positivos

Renovação normal: o token de antes escreve durante e depois dela (caso 5, verde). Login abre família nova; renovação herda; 049 e 050 aplicam do zero e sobre banco com sessões; quem perde a disputa da trava recebe 401 `sessao_encerrada` sem par (`renov401` sem sobra).

## Cenários negativos

Família de outro usuário, de outro município ou encerrada: DC369. Sem contexto de município, 0 sessão lida como `dc360_app`. Encerramento no meio da renovação, nos sete caminhos: 0 sessão viva, 0 par que renova depois, 0 escrita com o token anterior.

## Tentativas de reprovar

1. Mutação A, desfazer a trava na renovação (`apps/api/src/auth/servico.ts`, linha 718, `SELECT travar_sessoes_do_usuario` trocado por comentário; diff em `70-mutacao-A.diff`): campanha pela API reiniciada com o código mutado, administrador 7 de 100 com sessão viva, própria pessoa 5 de 60, renovando sem parar 6 de 15 (com até 392 renovações 200 depois do encerramento) (`70`); teste do repositório 6 de 14 vermelhos, o caso 6 com "rodadas com sessão viva depois do encerrar: 0, 2, 3, 5, 8, ..." (20 de 60) e os seguros por "a disputa não aconteceu" (`71`). Restaurado: `git status --porcelain` vazio.
2. Mutações B e C nas migrações em disco (o teste cria banco novo a cada execução): `console_suspender_municipio` sem a trava (`PERFORM 1` no lugar de `PERFORM travar_sessoes_do_usuario`) e `abrir_sessao` da 050 sem `FOR SHARE` (`72-mutacao-B-C.diff`): casos 8 e 9 vermelhos; o 9 com "a sessão aberta no instante da suspensão renovou depois da reativação: expected 200 to be 401" (`72`). Restaurado: `git status --porcelain` vazio.
3. Impasse entre todos os caminhos ao mesmo tempo, incluindo console e troca de papel: não quebrou (item 4).
4. Login no mesmo instante de troca de senha, redefinição e desativação: QUEBROU nos dois primeiros (achado 1).
5. Renovação perdendo a trava para a desativação: o código devolvido é 401 `sessao_encerrada` e não 403 `conta_desativada` (achado 2).
6. "Sair" com o token já rotacionado: 204 e a cadeia continua renovando (achado 4, desenho anterior).

## Achados

1. **FAIL (bloqueia): o login com a senha ANTIGA no mesmo instante de uma troca ou redefinição de senha abre uma sessão que sobrevive a ela.** O login (`entrar`, `apps/api/src/auth/servico.ts` 276 a 375) lê o hash em uma transação, gasta o scrypt (cerca de 230 ms medidos), registra o acerto e só então abre a sessão em OUTRA transação (`emitirPar`, linha 564), sem a trava por pessoa da 049 e sem reler a credencial. Se `trocar_senha` ou a redefinição por quem administra (`/usuarios/:id/redefinir-senha`, que chama `encerrarSessoes` sob a trava) confirma nesse intervalo, o UPDATE de `sessoes` deles não vê a sessão que ainda não existe, e o login a cria depois. A 050 fechou exatamente esse caminho para a SUSPENSÃO (o login lê a linha do município com `FOR SHARE`), mas não para a troca de senha, a redefinição nem a desativação.
   Reprodução em Postgres 17 pela API real (`login-corrida.mjs`, conta do Diego, login com a senha antiga disparado junto do encerramento):
   - redefinição por quem administra: 30 de 60 rodadas com a sessão do login viva depois do 200 da redefinição, e as 30 renovaram (200) (`30`); repetido, 14 de 30 (`33`). Nesse caso o banco marca a senha como provisória, e a escrita comum da sessão sobrevivente leva 403 `troca_de_senha_obrigatoria`, mas a LEITURA segue pela assinatura e a sessão renova até a provisória vencer (72 horas) ou a pessoa definir a senha nova;
   - troca de senha pela própria pessoa (o remédio de quem desconfia que a senha vazou): 13 de 30 rodadas com a sessão do login viva, renovando (200) e escrevendo (a escrita de prova passou pela vigência) (`31`). Aqui a sobrevivente tem acesso completo e renova por catorze dias;
   - desativação: 18 de 30 com sessão viva no banco, mas inerte (a renovação seguinte responde 403 `conta_desativada` e derruba tudo; a escrita leva `conta_desativada`) (`32`). É o mesmo padrão que a 050 tratou como defeito na suspensão (a sessão volta a valer se a conta for reativada sem ter sido usada antes).
   Por que é desta etapa: o bloco da E07 e o item do G00 "Sessão revogada, conta desativada, papel alterado e senha provisória vencida provados" são da E07; o item 2 da seção 7 de `28` (sessão revogada) não admite risco aceito; e a própria correção 2 tomou o login como caminho a fechar (050) quando o defeito era com a suspensão. Atenuantes medidos ou lidos: a janela é a do scrypt mais duas idas ao banco; em produção `/auth/entrar` tem `LOGIN_POR_IP` de 10 por 5 minutos por endereço; quem tem a senha precisa acertar o instante (ou entrar em laço por muitos endereços). Não é regressão da correção 2: o padrão vem da 002 e da 005. Conserto mínimo sugerido (o validador não implementa): abrir a sessão do login na mesma transação da releitura da credencial, sob `travar_sessoes_do_usuario` e conferindo que o hash e `ativo` ainda são os que o scrypt conferiu (ou uma versão da credencial que a troca incrementa), mais um caso no bloco de Postgres real com a disputa segurada. Dono: implementador da E07.
2. CORRIGE ANTES DE CRESCER (dono E07, efeito na E05): quem perde a trava para a desativação recebe 401 `sessao_encerrada`, e não 403 `conta_desativada`. A renovação lê `sessao_por_token` (conta ativa) antes da trava e, ao perder, devolve `null` sem perguntar a `dono_do_token`. Reprodução determinística segurando a trava (`e05-corrida-desativacao.mjs`, `96`): 5 de 5 com renovação 401 `sessao_encerrada`, e o mesmo token reapresentado logo depois leva 403 `conta_desativada`. O painel trata `sessao_encerrada` como "entre de novo" e a pessoa lê, ao entrar, a recusa genérica: é o desfecho que a correção 1 da E05 consertou, de volta numa janela estreita. Conserto: no ramo `sessaoNova === null`, chamar `tratarTokenRecusado(hash)` antes de responder.
3. ANOTADO (fora do escopo, dono provável API): corpo vazio com `content-type: application/json` em `POST /usuarios/:id/encerrar-sessoes` responde 500 `erro_interno` em vez de 400 (`FST_ERR_CTP_EMPTY_JSON_BODY` com `statusCode` 400 vira 500 no tratador de erro; 5 ocorrências no `api.log` da minha primeira rajada).
4. ANOTADO (desenho anterior, já registrado em rodadas passadas em outra forma): `/auth/sair` com o token já rotacionado responde 204 e não encerra a cadeia nem trata como reuso; o portador do token da cadeia continua renovando (`98`). A desconexão no meio de uma renovação com o mesmo token tem o mesmo efeito.
5. ANOTADO (leitura, E3a): o desafio do segundo fator (`conferirSegundoFator`, linhas 427 a 474) não confere se a senha mudou depois de emitido; quem tinha a senha antiga e o código consegue abrir sessão até 5 minutos depois de uma redefinição. Não executado (segundo fator desligado no ambiente da prova).
6. ANOTADO (rodada 2, continua): a vigência não confere `expira_em` da sessão viva da família.

## Não verificado

- Os casos 1 a 4 do achado 1 com `LOGIN_POR_IP` de produção (10): medi o mecanismo, não a probabilidade real.
- A desativação de conta e o link de recuperação por e-mail (`consumir_recuperacao`) na disputa pela API: a desativação entrou na minha campanha (150 disputas, 0 sobra); o link de recuperação só por leitura da 049 e pelo caso de ordem de trava do teste do banco (a recuperação está desligada no ambiente).
- O achado 5 (segundo fator) não foi executado.
- Pooler da Supabase em modo transação (a trava é de transação, compatível por desenho; não medido).
- Os 3 testes pulados de `test:isolamento` (busca com `pg_trgm`, por ambiente).
- Postgres 16 local: o 16 está provado pelo job `implantavel` do CI (14 de 14), não por mim.

## Risco residual

O conserto pedido na rodada 2 está provado em Postgres 17 real com 890 disputas, sem impasse e com teste que morde. Fica aberto um caminho da mesma família de risco: a sessão aberta por um login que conferiu a senha antiga no instante da troca ou da redefinição sobrevive a ela. A janela é de centenas de milissegundos e o limite por endereço a estreita, mas o critério é inegociável e é justamente o remédio de quem perdeu a senha.

## Motivo do humano

Não se aplica.
