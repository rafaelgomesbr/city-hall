---
validador: banco-de-dados
modelo: claude-opus-5-5
etapa: V2-F00-E05
sha_validado: 4ce0433
ci_run: ausente
rodada: 5
herdado_de:
tags: [UI, A11Y, AUTH, API]
nivel_de_prova_exigido: [E1, E2]
nivel_de_prova_obtido: [E1, E2]
veredito: PASS
confianca: media
humano_necessario: nao
escalar: nenhum
---
## Critérios verificados

Escopo desta dimensão na E05: o que o catálogo de códigos de erro de acesso recebe do BANCO (funções e gatilhos com SQLSTATE próprio), a resposta 403 `conta_desativada` sem confirmar nada de outro município, e o 404 entre municípios, em Postgres real. O catálogo em si, a varredura do fonte, as frases e as telas são de QA, UX e Acessibilidade. Ambiente: PostgreSQL 17.6 real, cluster próprio na porta 56317, papéis do job `implantavel`, API construída com `bancoPostgres` (cada transação faz `SET LOCAL ROLE dc360_app`). Caminhos de saída relativos a `/private/tmp/claude-501/-Users-rafaelgomes-Documents-city-hall/768bf074-5845-4f2d-bff9-57106bf57383/scratchpad/val/L03-banco/`.

1. **Códigos que nascem no banco e chegam ao cliente como erro de acesso**: levantei todo `ERRCODE` das migrações (DC360 a DC369, 42501, 53100). Só dois chegam à API como recusa de acesso: `DC367` (município suspenso, `abrir_sessao`), mapeado em `dc360/apps/api/src/servidor.ts:580` para `AcessoSuspenso`, que sai 403 `acesso_suspenso`, código do catálogo; e `DC369` (família alheia ou encerrada em `abrir_sessao`), absorvido em `dc360/apps/api/src/auth/servico.ts:898` (a renovação perdedora vira 401 `sessao_encerrada`, também do catálogo). Os demais são do console (DC360 a DC366, outro processo com lista própria), da minimização (DC368, tarefa sem pessoa logada) ou do teto de armazenamento (42501, 53100): nenhum responde 401 ou 403 pela API. Prova executada: `abrir_sessao` como dc360_app para município suspenso levanta `SQLSTATE DC367`, e o login com o município suspenso responde 403 `acesso_suspenso`, código presente em `CODIGOS_DE_ERRO_DE_ACESSO` (`saidas/22-e05-e12-pg-real.txt`).
2. **Conta desativada de A escrevendo em B** (teste de autorização e isolamento da etapa): 403 `conta_desativada`, corpo IGUAL ao da mesma escrita num id inexistente, então nada sobre B é confirmado (`saidas/22`).
3. **404 de recurso de outro município não muda** (teste de isolamento da etapa): a administradora de A em seis atos sobre recursos de B (redefinir senha, desativar, encerrar sessões e editar usuário de B; ler e despachar ocorrência de B) recebe 404 com corpo idêntico ao do id inexistente; despachar ocorrência de A para equipe de B responde 404 `equipe_inexistente`, igual à equipe inexistente; nenhum 403, nenhum 500 (`saidas/22`). O 403 `posto_insuficiente` (código que a correção 2 trouxe ao catálogo) só sai depois de o alvo ser lido sob RLS, então nunca aparece para conta de outro município.
4. **A correção 4 não regrediu o que o banco entrega à E05**: nenhuma migração alterada (só a 051 adicionada, que não levanta SQLSTATE novo), `test:isolamento` 345 aprovados e 3 pulados (`saidas/19-test-isolamento-no-sha.txt`); `codigos-de-erro.test.ts`, `prova-dinamica-dos-codigos-de-erro.test.ts` e `saida-de-municipio.test.ts`, 154 de 154 no worktree em `4ce0433` (`saidas/24-e05-e12-suites.txt`).
5. **Renovar de conta desativada responde `conta_desativada`** depende de `dono_do_token` (048) devolver `usuario_ativo`; a função está instalada, é uma das 27 SECURITY DEFINER com `search_path` fixo e sem EXECUTE para PUBLIC (`saidas/06-catalogo.txt`); o comportamento ponta a ponta em Postgres real está nos casos 13 e 23 do arquivo da corrida (desativação no meio da troca, 403), verdes (`saidas/10-corrida-pg17-real.txt`).

Motivo do veredito da rodada 4 que toca o banco: o FAIL (códigos 403 fora do catálogo e teste de catálogo que não mordia) é de fonte e de documentação, não de banco; "Banco não olhou o ponto" foi dito na arbitragem. Nesta rodada olhei a parte do banco: nenhum SQLSTATE próprio do banco sai como 401 ou 403 fora do catálogo; o único que vira 403 vira `acesso_suspenso`, que está no catálogo. A mordida do teste de catálogo é da dimensão QA e não refiz.

## Evidência

| Comando | Código | Saída |
| --- | --- | --- |
| `grep ERRCODE` nas migrações e nos mapeamentos da API | 0 | listado neste relatório (critério 1) |
| sonda E05 e E12 em Postgres real (`sonda-banco-e05-e12.test.ts`), 4 casos | 0 | `saidas/22-e05-e12-pg-real.txt` |
| `vitest` de `codigos-de-erro`, `prova-dinamica-dos-codigos-de-erro`, `saida-de-municipio` no worktree | 0 (154 de 154) | `saidas/24-e05-e12-suites.txt` |
| `npm run test:isolamento` no worktree | 0 | `saidas/19-test-isolamento-no-sha.txt` |
| catálogo do banco (definidoras, dono, `search_path`, PUBLIC) | 0 | `saidas/06-catalogo.txt` |
| arquivo da corrida em Postgres real | 0 (53 de 53, dentro dos 101) | `saidas/10-corrida-pg17-real.txt` |

## Cenários positivos

- Município suspenso: 403 `acesso_suspenso` no login, código do catálogo; a barreira do banco (`DC367`) existe e está mapeada.
- Operador pedindo o pacote de saída do próprio município: 403 `sem_permissao`, código do catálogo (`saidas/22`).

## Cenários negativos

- Conta desativada de A em ocorrência de B: 403 `conta_desativada`, igual ao id inexistente (não confirma B).
- Administradora de A em seis recursos de B: 404 igual ao inexistente, nunca 403.
- Equipe de B no despacho de A: 404 igual à equipe inexistente.

## Tentativas de reprovar

1. Procurei SQLSTATE do banco que escapasse como 500 numa recusa que deveria ser de acesso (por exemplo, `DC367` na janela entre a conferência da API e `abrir_sessao`): a função levanta `DC367` como dc360_app e o tratador o converte em 403 `acesso_suspenso`; o caso 9 da corrida em Postgres real (login no instante da suspensão) está verde (`saidas/10`).
2. Procurei 403 que confirmasse existência em outro município (`posto_insuficiente`, `email_so_por_administrador`, `sem_permissao`) chamando as rotas de gestão de usuário com ids de B: todas 404 idênticos ao inexistente.
3. Procurei diferença de corpo entre "existe em B" e "não existe" para a conta desativada: corpos iguais.
4. Procurei policy permissiva que deixasse dc360_app ver B (`USING (true)`): as cinco que existem são `TO dc360_console`, fora a de INSERT do formulário público de interesse (`saidas/25-visoes-e-grants-extra.txt`).

## Achados

Nenhum que toque esta etapa. Os achados de banco desta rodada (link de recuperação que sobrevive à desativação do mesmo instante, e troca de email que não gasta link) estão no relatório da E07 desta dimensão e são da E10.

## Não verificado

- A varredura do fonte e a prova dinâmica nas 114 rotas não foram auditadas por mim (dimensão QA); só confirmei que passam no SHA.
- As frases mostradas ao usuário, as telas e o aplicativo de campo (UX, Acessibilidade e a validação humana do Rafael).
- O run do CI do SHA (ausente nesta sessão).
- Os códigos do console (DC360 a DC366): o console é outro processo, com lista própria, e não foi exercitado contra o banco real nesta rodada.

## Risco residual

Baixo para o banco: os dois SQLSTATE que o banco usa como recusa de acesso estão mapeados para códigos do catálogo, e o isolamento responde 404 em Postgres real. Um SQLSTATE novo levantado por migração futura cairia no 500 genérico, não num código fora do catálogo; o esquema único de erro é da V2-F02-E03.

## Motivo do humano

Não se aplica a esta dimensão. A validação humana da etapa (Rafael aprovar as três frases) é de conteúdo de produto e não depende do banco.
