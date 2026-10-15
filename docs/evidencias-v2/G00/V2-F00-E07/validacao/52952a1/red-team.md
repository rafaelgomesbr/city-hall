---
validador: red-team (agente general-purpose com o papel da dimensão)
modelo: claude-opus-5-5
etapa: V2-F00-E07
sha_validado: 52952a1
ci_run: 38618369218
rodada: 3
herdado_de:
tags: [AUTH, DB, MIGRATION, API]
nivel_de_prova_exigido: [E1, E2]
nivel_de_prova_obtido: [E1, E2, E3a]
veredito: FAIL
confianca: media
humano_necessario: nao
escalar: arbitragem em Opus sobre o achado 1, junto com o FAIL do banco desta rodada (mesmo defeito)
---
## Critérios verificados

Ambiente e convenções como no relatório da E04 desta rodada (Postgres 17.10 descartável na porta 55541 com os papéis do job `implantavel`, API do SHA com `dc360_api`, saídas em `$SP/val/red-team/`).

| Critério | Resultado | Prova |
| --- | --- | --- |
| Defeito da rodada 2 (renovação concorrente com encerramento deixa sessão viva) | NÃO MORDE MAIS | `renovacao-contra-encerramento.test.ts` com `DC360_POSTGRES_DE_PROVA` no meu Postgres 17: 14 de 14, sem pulo (`30-e07-prova-pg17.txt`); log do servidor sem nenhuma linha "deadlock" (`pg17-red-team.log`) |
| Cadeia rotacionada só vale enquanto a família vive | PASS | varredura `e04/estado-cadeia-encerrada-token-rotacionado.*`: o token anterior à renovação recebe 401 `sessao_encerrada` nas 67 escritas, banco intacto; mutação M4 |
| Papel alterado: 401 `nao_autenticado`, a renovação traz o papel novo | PASS | `estado-papel-rebaixado` 67 de 67; mutação M5; suítes verdes |
| Senha provisória vencida não escreve nem se troca | PASS | `estado-provisoria-vencida` 67 de 67 (401 `sessao_encerrada`, inclusive `/auth/trocar-senha`); mutações M6 e M6+M7 |
| Migrações 049 e 050 | PASS no que testei | prova de Postgres real acima (casos 8 e 9 cobrem suspensão e `FOR SHARE`); `npm run test:isolamento` 345 aprovados e 3 pulados (`60`); mutações das migrações feitas e provadas pelo banco nesta rodada, não repetidas por mim |
| `/auth/sair` com token rotacionado | comportamento anotado | `43-sair-com-token-rotacionado.txt`: 204, a cadeia continua renovando e o token de acesso anterior continua escrevendo; `sair` com o token vivo encerra e o token anterior passa a levar 401 `sessao_encerrada` |
| Item "sessão revogada" do G00 e item 2 da seção 7 de `28` | **FAIL** | achado 1 |

## Evidência

- `30-e07-prova-pg17.txt`: bloco de Postgres real do repositório, 14 de 14, código 0.
- `44-abrir-sessao-sem-guarda.txt`: com a conta do Diego DESATIVADA, `abrir_sessao(..., p_familia_id => NULL)` chamada como `dc360_api` com `SET ROLE dc360_app` (exatamente como `emitirPar` chama) abre a sessão, `revogada_em` nulo, família nova. Sessão revogada e conta reativada logo depois.
- Mutações (diff e saída arquivados, `git restore` depois de cada uma, `git status --porcelain` só com relatórios):
  - M4 `31-*`: `lerVigencia` aceita sessão rotacionada sem conferir a família: 8 de 43 vermelhos (`familia-da-sessao`, `get-com-efeito`, `vigencia-na-escrita`).
  - M5 `32-*`: `exigirVigencia` sem a conferência de papel: 5 de 43 vermelhos.
  - M6 `33-*` e `36-*`: `trocarSenha` sem recusar a provisória vencida: verde em `senha-provisoria` e `senha-e-sessoes`, 1 de 20 vermelho em `familia-da-sessao` (o caso "pelo SERVIÇO"). Morde.
  - M7 `34-*` e `37-*`: `exigirVigencia` sem o prazo da provisória: TUDO VERDE (27 de 27 em `familia-da-sessao` e `senha-provisoria`). Ver achado 3.
  - M6 e M7 juntas `35-*`: 3 vermelhos.

## Cenários positivos

Renovação normal não expulsa (caso 5 em Postgres real); `sair` com o token vivo encerra a cadeia; rebaixado renova e recebe o papel novo (suíte).

## Cenários negativos

Quem administra encerra, cadeia encerrada, provisória vencida, papel diferente: nenhuma escrita aceita (varredura da E04). Corrida de renovação contra encerramento em Postgres real: 0 sessão viva (prova do repositório).

## Tentativas de reprovar

1. Login simultâneo à troca de senha, à redefinição e à desativação (o FAIL do banco desta rodada). Li o caminho inteiro: `entrar` (`apps/api/src/auth/servico.ts` 276 a 375) lê a credencial numa transação (`credenciais_para_login`), confere o scrypt fora do banco, registra o acerto e só então abre a sessão em OUTRA transação (`emitirPar`, linha 564). `abrir_sessao` da 050 (`db/migrations/050_login_e_suspensao_na_mesma_linha.sql`), no ramo sem família, confere só a suspensão do município: não toma `travar_sessoes_do_usuario`, não relê `usuarios.ativo` nem a credencial. Provei em execução que o banco não tem essa segunda barreira (`44`: sessão aberta para conta desativada). Com isso, o que `trocar_senha`, a redefinição (`rotas/administracao.ts`, `encerrarSessoes` sob a trava) e a desativação revogam é só o que existia no instante deles, e a sessão que o login cria depois sobrevive. O validador de banco mediu a corrida pela API real em Postgres 17 (li `$SP/val/banco-de-dados/30`, `31`, `33`): troca de senha pela própria pessoa 13 de 30 com sessão viva que renova e escreve; redefinição 30 de 60 (sessão com a marca da provisória). Não executei uma campanha de concorrência própria nesta sessão (ver "Não verificado").
2. Segundo fator (E3a, não executado): `conferirSegundoFator` e `sessaoAposAtivacao` relêem a conta e conferem `ativo`, mas não conferem se a senha mudou depois de emitido o desafio (válido por 5 minutos). Quem tem a senha antiga e o código consegue abrir sessão até 5 minutos depois da troca. O caminho do desafio de ATIVAÇÃO não exige código prévio, mas o `ON CONFLICT ... WHERE` de `iniciarAtivacao` recusa trocar segredo já ativo, e a redefinição deixa a sessão com a marca da provisória, o que estreita o caso.
3. `/auth/sair` com o token rotacionado: no-op silencioso (`43`).
4. Mutações nos ramos de família, papel e provisória: mordem, salvo M7 isolada (achado 3).

## Achados

1. **FAIL (bloqueia; item 2 da seção 7 de `28`, não admite risco aceito): sessão aberta por login que conferiu a senha antiga no instante da troca de senha, da redefinição ou da desativação sobrevive à revogação.** Mecanismo lido no código e provado em execução no banco (`44`); corrida medida pelo validador de banco nesta rodada. É a mesma classe de defeito que a 050 fechou para a suspensão; ficou aberta para troca, redefinição e desativação. Conserto mínimo (o validador não implementa): abrir a sessão do login sob `travar_sessoes_do_usuario` e, na mesma transação, reler `ativo` e uma versão da credencial (ou o próprio hash) que a troca altera, recusando se mudou desde o scrypt; a mesma conferência no segundo fator e na ativação; caso no bloco de Postgres real com a disputa segurada. Dono: E07.
2. CORRIGE ANTES DE CRESCER (mesmo dono): desafio de segundo fator emitido antes de uma troca de senha continua abrindo sessão por até 5 minutos (tentativa 2, E3a).
3. CORRIGE ANTES DE CRESCER (teste): nenhum teste reprova se `exigirVigencia` deixar de conferir o prazo da provisória (M7 verde). O comportamento real está certo (varredura: 401 `sessao_encerrada`), mas sem esse ramo a escrita de quem tem a provisória vencida passaria a sair como 403 `troca_de_senha_obrigatoria` e a troca só seria barrada pela conferência do serviço. Falta um caso que fixe 401 `sessao_encerrada` numa escrita comum com prazo vencido.
4. ANOTADO (desenho anterior): `/auth/sair` com token já rotacionado responde 204 e não encerra a cadeia nem trata como reuso.
5. ANOTADO: renovação que perde a trava para a desativação responde 401 `sessao_encerrada` (relatado na E05).

## Não verificado

- Reprodução própria, por concorrência, do achado 1 pela API: não executada nesta sessão; a medida é a do validador de banco (`$SP/val/banco-de-dados/30` a `33`), e a minha prova é a ausência da barreira no banco (`44`) mais a leitura do código.
- Segundo fator em execução (achado 2): só leitura.
- Mutações das migrações 049 e 050: feitas pelo validador de banco nesta rodada, não repetidas por mim.
- Postgres 16 (provado no CI, job `implantavel`, não por mim) e pooler em modo transação.

## Risco residual

A troca de senha, que é o remédio de quem desconfia de vazamento, não fecha com certeza uma sessão aberta no mesmo instante com a senha antiga. A janela é a do scrypt (centenas de milissegundos), e o limite de login por endereço a estreita, mas a regra é inegociável.

## Motivo do humano

Não se aplica.
