---
validador: seguranca-aplicacao
modelo: claude-sonnet-5-5
etapa: V2-F00-E07
sha_validado: 4b96ea7
ci_run: 38445527075
rodada: 2
herdado_de:
tags: [API, AUTH, MIGRATION, TENANT]
nivel_de_prova_exigido: [E1, E2]
nivel_de_prova_obtido: [E1, E2]
veredito: PASS
confianca: media
humano_necessario: nao
escalar: nenhum
---
## Critérios verificados

Veredito na primeira linha: **PASS** para a dimensão segurança de aplicação, com um achado funcional que falha para o lado seguro (achado 1). Os três casos de borda da etapa (papel alterado, sessão rotacionada, senha provisória) se comportam como o bloco pede, e a família de sessão (migração 047) não abre caminho para manter uma cadeia viva depois de encerrada. Base de evidência: `C:/Users/Rfasg/AppData/Local/Temp/claude/c--Projetos-city-hall/b62645e7-c436-45b4-8ce0-4d68f4fb420f/scratchpad/seg/` (`seg/`).

| Critério | Resultado | Evidência |
| --- | --- | --- |
| Sessão rotacionada só vale enquanto a cadeia vive: administrador, a própria pessoa, reúso de refresh, `sair` e troca de senha em OUTRA sessão encerram a cadeia e o token pré-renovação cai com 401 `sessao_encerrada` | PASS | `familia-da-sessao.test.ts` e `get-com-efeito.test.ts` verdes (`10-api-auth.txt`); mutações m02, m03, m07 |
| Renovação normal: o token antigo escreve até vencer e o novo também | PASS | `vigencia-na-escrita.test.ts` verde |
| Papel diferente do token responde 401 `nao_autenticado`, renovar traz o papel novo, o ex-coordenador rebaixado a operador não despacha (403) | PASS | `familia-da-sessao.test.ts` (7 casos do bloco "Papel alterado"); mutação m06 |
| Senha provisória vencida: nem escreve, nem se troca, nem renova | PASS | 4 casos do bloco "Senha provisória vencida no meio"; mutação m04 (serviço) |
| Isolamento: coordenador de A rebaixado não vê nada de B (404) | PASS | caso de isolamento do mesmo bloco; sonda `4x-e05-oraculo.txt` |
| A migração 047 (`abrir_sessao` com família) não amplia a superfície | PASS | leitura do SQL, abaixo |
| A própria pessoa que troca a senha mantém a sessão de onde trocou | **PARCIAL** | achado 1 |

## Evidência

- `10-api-auth.txt`: 12 arquivos, 131 testes verdes, incluindo `familia-da-sessao.test.ts`, `senha-provisoria.test.ts`, `vigencia-na-escrita.test.ts`, `get-com-efeito.test.ts` e `codigos-de-erro.test.ts`.
- Leitura de `db/migrations/047_familia_da_sessao.sql`: `abrir_sessao` com sétimo parâmetro opcional; só herda família que EXISTE para o MESMO usuário e o MESMO município (erro `DC369` que não diz qual das três condições falhou); a assinatura antiga é derrubada (`DROP FUNCTION`), não convive com a nova (o teto de 27 funções `SECURITY DEFINER` não muda); `REVOKE ALL FROM PUBLIC` e `GRANT EXECUTE` só a `dc360_app` repetidos depois do `DROP`; backfill `familia_id = id`, `DEFAULT gen_random_uuid()`, `NOT NULL` e índice parcial `WHERE revogada_em IS NULL`. A recusa de município suspenso (038) é preservada.
- Leitura de `auth/vigencia.ts`: a sessão rotacionada só conta como viva se existe sessão da MESMA família com `revogada_em IS NULL`; a consulta liga `s.usuario_id = u.id` e filtra por município pelo RLS do `comTenant`, então um `sid` de outra pessoa ou de outro município não vale.
- Provas de que o teste morde (mutação em `apps/api/src`, vermelho, `git restore`, árvore limpa; `seg/mNN-*.txt`):

| Mutação | Resultado |
| --- | --- |
| m02: `vigencia.ts` aceita rotacionada sempre (sem consultar a família) | 8 vermelhos de 43 |
| m03: `servico.ts` `renovar` não passa a família (cada renovação abre família nova) | 10 vermelhos de 33 |
| m04: `trocarSenha` não recusa provisória vencida | 1 vermelho de 27 (o caso "pelo SERVIÇO") |
| m06: `exigirVigencia` não confere o papel | 4 vermelhos de 33 |
| m07: `encerrarSessoes` preserva só a linha, não a família | 1 vermelho de 30 |

- Sonda própria `troca-senha-cadeia.test.ts` (`4x-troca-senha-cadeia.txt`): troca de senha com o token anterior à renovação.

## Cenários positivos

- Renovação normal; papel rebaixado seguido de renovação e escrita permitida ao papel novo; senha provisória no prazo troca a senha.
- `/auth/encerrar-sessoes` com o token anterior à renovação preserva a cadeia de quem pediu (200, e o token antigo continua escrevendo).

## Cenários negativos

- Cadeia encerrada por administrador, pela pessoa, por reúso de refresh, por `sair` e por troca de senha em outra sessão: o token pré-renovação recebe 401 `sessao_encerrada`.
- Senha provisória vencida: trocar a senha e renovar respondem 401 `sessao_encerrada`.
- Promoção: papel maior no banco que no token também pede renovação; o token velho não vale como o papel novo.

## Tentativas de reprovar

1. Procurei manter uma cadeia viva depois de encerrada: tentei por troca de senha (a função `trocar_senha` da migração 005 preserva por `id`, não por família). Resultado: a cadeia morre além do pedido (fail-closed), nunca fica de pé (achado 1).
2. Procurei inserir sessão na família de outra pessoa: `abrir_sessao` recusa família que não existe para o mesmo usuário e município; o papel de aplicação só chega a essa função pela API.
3. Reúso de refresh: o teste existente cobre o token rotacionado reapresentado; confirmei por leitura que `tratarTokenRecusado` só derruba tudo quando o motivo gravado é `rotacionada na renovacao` (token vencido ou encerrado pela pessoa responde 401 sem derrubar nada).
4. Corrida de dois pedidos com o mesmo refresh (H1): `revogar_sessao` devolve a contagem e o perdedor aborta sem emitir par. Li o código; não reproduzi a corrida (`inject` é sequencial).
5. Sessão cujo refresh venceu mas que não foi revogada: `lerVigencia` não confere `expira_em`, só `revogada_em`. Como o token de acesso vive no máximo 60 minutos e nasce de uma sessão dentro do prazo, o efeito é limitado a essa janela; não construí caminho que o aproveite.
6. Token de papel antigo contra LEITURA depois do rebaixamento: segue valendo até vencer (F03-E03, por plano); só a escrita é conferida.

## Achados

**CORRIGE ANTES DE CRESCER**

1. `trocar_senha` preserva a sessão por `id` e não por família, ao contrário de `encerrarSessoes` (corrigido na E04). Reprodução (`4x-troca-senha-cadeia.txt`): entrar, renovar, trocar a senha com o token ANTERIOR à renovação. A rota responde 200 "Senha trocada. As outras sessões foram encerradas." e devolve um token novo, mas a escrita com esse token responde 401 `sessao_encerrada` e o refresh da cadeia viva responde 401: a própria pessoa fica fora. Falha para o lado seguro (nada fica de pé), e só acontece quando a tela usa um token mais velho que a última renovação (o painel usa o mais novo na maioria dos caminhos). Correção: a função da 005 deve preservar a família da sessão informada, em nova migração (migração aplicada não se edita). Dono: E07 ou F03.

**ANOTADO**

2. `lerVigencia` não confere `expira_em` da sessão viva (ver tentativa 5). Sem exploração construída.
3. Trocar o papel de alguém não revoga as sessões (decisão registrada da E07). A escrita não depende disso, a leitura sim (F03-E03).

## Não verificado

- A migração 047 em Postgres 17 (job `restore` do CI) e `migrar --conferir` por conta própria: usei PGlite; o `test:isolamento` do gatekeeper (Postgres 18.3) cobre `migrar.test.ts`.
- Corrida real entre `revogar_sessao` e `abrir_sessao` na renovação (limite documentado em `PENDENCIAS.md`); `inject` não a reproduz.
- E2E no navegador (seção 24 do e2e; é do QA).
- Reativação de conta com sessão de família antiga (coberta por teste, não repeti).

## Risco residual

- Leitura com token de papel ou de conta antigos segue válida até o vencimento (F03-E03).
- Falha para o lado seguro do achado 1 pode forçar um novo login depois de trocar a senha.

## Motivo do humano

Nenhum.
