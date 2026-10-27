# V2-F03-E15, correção 1: gatilho preso à tabela, sem TEMP, credenciais sem atravessar município, sem oráculo e sem órfão

Ramo `trab/f03-1b-e15-pessoas`, sobre o candidato `fbd09bfa`. Origem: revisão independente do Codex sobre `4c809533..fbd09bfa` (5 bloqueios, 2 dívidas). A 054 nunca foi aplicada fora de teste nem juntada, por isso é reescrita no mesmo arquivo (com o `desfazer/` acompanhando). Norma: ADR 0009 (decisões 1, 3 e 7). Risco CRÍTICO. Implementador: Claude Opus 5.5.

## Fatos

### Cada achado: o teste que falhava antes e passa depois

Antes = os testes novos rodados contra a 054 de `fbd09bfa` (`saidas/00-antes-pessoas-com-postgres-real.txt`, 13 falhas, todas pelos motivos dos achados). Depois = a 054 desta correção (`saidas/01-depois-pessoas-com-postgres-real.txt`, 86 de 86).

| # | Achado | Teste (em `dc360/db/test/pessoas.test.ts`) | Antes | Depois |
| --- | --- | --- | --- | --- |
| 1 | Função de gatilho reutilizável em tabela temporária | "o ataque relatado: o dc360_app cria TEMP `usuarios`, anexa o espelho e escreve a credencial de outra pessoa" (PGlite, com o TEMP padrão devolvido ao PUBLIC antes da 054) e "num banco criado com CREATE DATABASE" (Postgres real) | o ataque passa inteiro e grava `senha-do-atacante` na pessoa de outro município | 42501 no `CREATE TEMP TABLE`, a pessoa não muda |
| 1 | idem | "o dc360_app, o dc360_console e PUBLIC não têm TEMP no banco" | os três com TEMP | nenhum |
| 1 | idem | "nenhum papel do produto executa função de gatilho da 054; e mesmo com TEMP devolvido, o app não anexa o espelho nem o criador" | `conta_ganha_pessoa` e `pessoa_espelha_a_conta` com EXECUTE do app; `CREATE TRIGGER` passa | nenhum EXECUTE; `CREATE TRIGGER` dá "permission denied for function" |
| 1 | idem | "anexadas pelo DONO a uma tabela que não é `public.usuarios`, as duas funções privilegiadas recusam, sem escrever nada" | as duas agem na tabela falsa (o criador cria pessoa e marca) | 42501 "so serve", nenhuma pessoa nem marca nova |
| 1 | idem | "falha fechada: se um papel do produto continua com TEMP depois do REVOKE (herdado de outro papel), a 054 não aplica" | a 054 aplica | a 054 para, nada fica |
| 2 | `credenciais_da_pessoa` devolve B no contexto de A | "com município no contexto, recusa (42501), seja o e-mail de outro município ou do próprio" e "sem contexto, continua respondendo" | devolve a conta de B dentro de A | 42501 com contexto; sem contexto, a mesma resposta de antes |
| 3 | Oráculo de e-mail no criador sem contexto | "sem contexto: o mesmo erro (código, mensagem, detalhe, restrição, tabela) para e-mail existente e livre" e "com o contexto de outro município" | 23505 (existe) contra 42501 (livre) | 42501 idêntico nos dois casos, o erro da policy de inserção, nenhuma pessoa nova |
| 4 | `ON CONFLICT DO NOTHING` deixa pessoa e marca órfãs | "matrícula já existente, id novo e e-mail livre, pelo dc360_app no município e pelo dono: a transação volta inteira" e "o mesmo comando sem conflito continua passando" | o comando passa e ficam pessoa e marca sem conta | 23514 (`usuarios_origem_da_pessoa`), contagens de pessoas e marcas iguais |
| 5 | Ordem das travas (N7 antes de N4) | "entre os gatilhos AFTER UPDATE de `usuarios`, o do espelho vem antes do da 051" (PGlite) e "redefinição por quem administra contra um caminho na ordem (N4 e depois N7): espera na pessoa sem segurar o link, e sem 40P01" (Postgres real, três conexões) | espelho depois da 051; o NOWAIT no link dá 55P03 (o UPDATE segura o link enquanto espera a pessoa) | espelho antes; o link fica livre enquanto o UPDATE espera a pessoa; sem 40P01 |
| 5 | idem, `consumir_recuperacao` | o mesmo caso de Postgres real com `consumir_recuperacao`, em `it.fails` | 55P03 | 55P03 (divergência REGISTRADA, dono E08; ver abaixo) |
| 6 | Casos de Postgres real fora do CI | passo novo no job `implantavel` de `.github/workflows/verificar.yml` | o arquivo não rodava com `DC360_POSTGRES_DE_PROVA` | roda, e "skipped" no passo reprova |
| 7 | `UPDATE pessoas SET id` | "UPDATE de `pessoas.id` pelo dono, direto: recusado; reescrever o mesmo valor passa" | passa e deixa contas apontando para o id antigo | 23514 (`pessoas_id_nao_muda`) |

### O que mudou na 054 (cabeçalho "CORRECAO 1", itens C1 a C6)

- **C1.** `conta_ganha_pessoa` e `pessoa_espelha_a_conta` conferem `TG_RELID = 'public.usuarios'::regclass` (oid, com esquema), o nome, o momento e o nível do gatilho; qualquer outra coisa dá 42501. O `GRANT EXECUTE ... TO dc360_app` das duas saiu (`REVOKE ALL ... FROM PUBLIC` e nada mais): o Postgres só confere EXECUTE de função de gatilho no `CREATE TRIGGER`, não no disparo, e a suíte inteira da API, do painel e do console passou sem ele. Seção 14: `REVOKE TEMPORARY ON DATABASE <banco atual> FROM PUBLIC, dc360_app, dc360_console`, e a conferência depois, que FALHA FECHADA se algum dos três continuar com TEMP (herança, ou quem migra sem ser dono do banco, caso em que o REVOKE vira só um aviso). Nada do produto usa tabela temporária (busca no repositório: nenhuma ocorrência de `CREATE TEMP`, `TEMPORARY TABLE`, `ON COMMIT DROP` ou `pg_temp.` fora destes testes).
- **C2.** `credenciais_da_pessoa` passou a plpgsql e recusa (42501) com município no contexto.
- **C3.** Gatilho comum novo `conta_nasce_no_municipio_do_contexto` (função `conta_nasce_no_contexto`, SECURITY INVOKER, sem EXECUTE de papel nenhum), BEFORE INSERT em `usuarios`, que dispara antes do criador (ordem alfabética): para quem o RLS de `usuarios` vale (`row_security_active`), recusa a conta fora do contexto, ou sem contexto, com o erro da policy (`new row violates row-level security policy for table "usuarios"`, 42501), antes de qualquer consulta a `pessoas`. Para o dono com BYPASSRLS nada muda.
- **C4.** Gatilho de comando novo `usuarios_nenhuma_pessoa_sem_conta` (AFTER INSERT FOR EACH STATEMENT, a mesma `conta_ganha_pessoa`, a única que pode citar `origens_de_conta`): no fim de cada INSERT, marca `criador` da transação sem a sua conta faz o comando voltar (23514). Índice novo `origens_de_conta_transacao_idx`. O gatilho de comando só confere a EXISTÊNCIA da conta; a coerência da pessoa continua no adiado, para que o caso obrigatório da ADR ("BEFORE posterior que troca o `pessoa_id` é recusado no fim da transação pelo adiado") continue valendo.
- **C5.** O gatilho do espelho virou `pessoa_recebe_a_credencial_da_conta` e dispara antes de `recuperacoes_morrem_com_a_credencial` (051): o UPDATE da credencial vai de N3 a N4 e só depois a N7. Duas divergências ficam registradas no cabeçalho, dono E08 (abaixo).
- **C6.** `chave_da_pessoa_nao_muda()` nos gatilhos `pessoas_id_nao_muda` (BEFORE) e `pessoas_id_nao_muda_no_estado_final` (AFTER), `WHEN (OLD.id IS DISTINCT FROM NEW.id)`.
- `desfazer/054` derruba o que entrou. O TEMP NÃO volta no desfazer (escrito no cabeçalho dele): é endurecimento que não depende de objeto da 054.

### Catálogo (`dc360/db/test/catalogo/f03-e15.ts`)

`conta_ganha_pessoa()` e `pessoa_espelha_a_conta()` com `executavelPor: []`, motivos e `confere` atualizados; `credenciais_da_pessoa(text)` com a recusa sob contexto no `confere`. As funções novas (`conta_nasce_no_contexto`, `chave_da_pessoa_nao_muda`) são SECURITY INVOKER e não entram.

### Fora do banco

- `.github/workflows/verificar.yml`: passo "Pessoa e conta no município (054), em Postgres real" no job `implantavel`, no mesmo padrão dos outros (variável, `tee`, `PIPESTATUS`, "skipped" reprova); `REVOKE TEMPORARY ON DATABASE dc360 FROM PUBLIC` no provisionamento dos jobs `implantavel` e `imagens` (como `postgres`, o dono), porque lá quem migra é o `dc360_setup`, que não é dono e não consegue revogar o TEMP do PUBLIC.
- A mesma linha na receita de papéis do README, em `docs/COLOCAR-DE-PE.md`, em `docs/RESTORE-DO-BANCO.md` e em `scripts/ensaiar-restore.sh` (origem e cópia restaurada).
- `docs/DICIONARIO-DE-DADOS.md` (seção da 054), parágrafo da E15 no README, totais do README e do `COLOCAR-DE-PE.md` (+13 na contagem estática do banco), `scripts/baseline.mjs` (chave `V2-F03-E15`: 86 casos, 9 pulados).

### Correções ao RESUMO e ao inventário da 1B (a pasta pai não foi editada: o INDEX dela só ganha linhas)

- O RESUMO da 1B dizia que os 6 casos de Postgres real "rodam no CI onde `DC360_POSTGRES_DE_PROVA` existe". **Não rodavam**: a variável só estava nos passos de outros arquivos. Rodam a partir desta correção (achado 6).
- O RESUMO dizia que o EXECUTE do `dc360_app` nas duas funções de gatilho era "inerte". **Não era**: servia para anexá-las a uma tabela temporária (achado 1). Saiu.
- O gatilho do espelho não se chama mais `usuarios_espelha_credencial_na_pessoa`: é `pessoa_recebe_a_credencial_da_conta`.
- `pessoas.test.ts` tem 86 casos (77 em PGlite, 9 só em Postgres real), e não 70.
- Inventário da credencial (`../inventario-da-credencial.md`), o que muda: `credenciais_da_pessoa` recusa com contexto; `conta_ganha_pessoa` serve também ao gatilho de comando `usuarios_nenhuma_pessoa_sem_conta`, só a `public.usuarios`, sem EXECUTE de papel do produto; `pessoa_espelha_a_conta` está no gatilho `pessoa_recebe_a_credencial_da_conta`; entram `conta_nasce_no_contexto()` (gatilho `conta_nasce_no_municipio_do_contexto`, não cita a credencial) e `chave_da_pessoa_nao_muda()` (recusa mudança de `pessoas.id`), as duas na lista conferida do teste; `consumir_recuperacao` e `trocarSenha` (API) carregam as divergências da decisão 7 abaixo.

### Portões (a partir de `dc360/`, saídas em `saidas/`)

| Portão | Resultado |
| --- | --- |
| `pessoas.test.ts` com Postgres real (PostgreSQL 18.3 local descartável, porta 55917) | 86/86 (`01`); antes, 13 falhas (`00`) |
| `pessoas.test.ts` só PGlite | 77 passam, 9 pulados (`02`) |
| `npm run test:isolamento` | 677 casos: 640 passam, 15 pulados (6 de antes e os 9 de Postgres real desta parte), 22 falham: 8 de ambiente Windows aceitas (`desfazer-migracao` 5, `guarda-da-semente` 3) e **14 que dependem da 0G** (abaixo) (`03`) |
| o mesmo portão com a regra da 0G simulada (patch descartável em `conferir.ts`, `sondas/simula-regra-da-0G.patch`, desfeito depois) | `isolamento`, `catalogo-nominal` e `portao-comportamental`: 260/260 (`03b`) |
| `npm test` (seis pacotes) | campo 261/261; shared 417/418 (`regras-de-conteudo` 1, DV-46); API 2039 passam, 34 pulados, 2 falham (`semear-homologacao`, ambiente aceito); console 379/379 com `no-navegador` estourando sob carga, 8/8 sozinho (`04b`); painel 820/820; banco como acima (`04`) |
| `npm run typecheck` | verde (`05`) |
| `npm run lint`, `lint:teto` (431, igual), `formato:conferir` | verdes (`06`, `07`, `08`) |
| `npm run conferir:numeros` | verde (`09`) |
| `node --test scripts/baseline.test.mjs` | verde (`10`) |
| `npx vitest run packages/shared/test/regras-de-conteudo.test.ts` | 9/10, a falha aceita (DV-46) (`11`) |
| `node scripts/auditar.mjs` | runtime limpo (`12`) |
| `CI=true npm run test:scripts` | `13` |
| `node scripts/roadmap/gerar-estado.mjs --conferir` (raiz) | confere |
| `test:e2e:api` | não rodado (o CI cobre) |

### Limitações

- Os jobs `implantavel`, `imagens` e `restore` do CI não rodam aqui (Linux com serviço Postgres). A linha `REVOKE TEMPORARY` foi acrescentada nos três caminhos, mas só o CI prova que eles continuam verdes.
- A recusa da 054 sem TEMP revogável (quem migra não é dono) foi provada com TEMP herdado num papel, no PGlite; o caso "`dc360_setup` não dono" é o do job `implantavel`, que passa a revogar antes, como dono.
- O Supabase e o Neon entregam um papel administrativo que, pela receita do README, é o dono do banco que ele cria; se o banco de produção tiver outro dono, a 054 para com a instrução do comando a rodar (falha fechada, nenhuma meia aplicação).

## Justificativa

- **Separar a recusa do contexto num gatilho COMUM (C3).** Dentro de uma função SECURITY DEFINER o `current_user` é o dono, e não há como saber se o RLS valeria para quem inseriu. O gatilho comum roda como quem insere, e `row_security_active` responde exatamente isso. O erro é o da própria policy, então a resposta do cadastro sem contexto é a mesma de antes da 054, com e-mail existente ou livre.
- **Gatilho de comando em vez de gatilho adiado em `pessoas` e em `origens_de_conta` (C4).** As duas funções presas a tabela teriam de citar `origens_de_conta` (o `TG_RELID` da segunda) e a regra da 0D só deixa uma função citá-la; e a sugestão de criar a pessoa no AFTER INSERT quebraria o caso obrigatório da ADR (o adiado é quem pega o BEFORE posterior que troca o valor). O gatilho de comando dispara mesmo quando o `ON CONFLICT DO NOTHING` não insere nada, fica em `public.usuarios`, e é ramo da mesma função.
- **`consumir_recuperacao` não foi redefinida aqui.** A redefinição (conta, pessoa, link) foi escrita e provada no Postgres real, mas reprova a sonda 10 de `catalogo-nominal.test.ts` ("com a migração que recria a função de verdade, a origem passa"), que junta só a base e uma sonda com as migrações REAIS e por isso não aceita migração nenhuma que recrie função da base. O arquivo é congelado. Ficou a divergência registrada, com prova em `it.fails`.
- **`executavelPor: []` agora, e não depois.** O pedido manda revogar o EXECUTE e usar a forma da 0G. O portão de hoje recusa função privilegiada sem papel com EXECUTE; as 14 falhas do `test:isolamento` são essa uma regra, nas duas funções, repetida pelas sondas de `catalogo-nominal` que esperam "exatamente um problema". Com a regra da 0G simulada, o portão fica verde (`03b`).
- **O TEMP não volta no desfazer.** Voltar devolveria um caminho de ataque sem devolver dado nenhum; a volta continua sem perda.

## Para o orquestrador

- **Linha do STATUS sugerida:** `V2-F03-E15 | IMPLEMENTADA (correção 1) | candidato no ramo trab/f03-1b-e15-pessoas | 054 reescrita: funções de gatilho presas a public.usuarios e sem EXECUTE, sem TEMP para os papéis do produto (falha fechada), credenciais_da_pessoa só antes do município, cadastro sem oráculo sem contexto, nenhuma pessoa nem marca sem conta (ON CONFLICT), espelho antes da 051, pessoas.id imutável; pessoas.test.ts no CI | portão de isolamento depende da 0G (14 casos, uma regra); falta validação e a humana (contagens)`.
- **DEPENDE DA 0G:** `executavelPor: []` nas duas funções de gatilho. Se o formato da 0G for outro (campo próprio para função de gatilho, por exemplo), a entrada muda só em `f03-e15.ts`. Sem a 0G juntada, `test:isolamento` reprova 14 casos (`isolamento.test.ts` 1, `catalogo-nominal.test.ts` 13), todos com a mesma causa: "sem nenhum papel com EXECUTE". A ordem sugerida é juntar a 0G antes ou junto da 1B.
- **Para a 0G:** a regra "nenhum EXECUTE em função de gatilho para papel do produto" reprova hoje 10 funções de gatilho ANTIGAS (todas SECURITY INVOKER, com EXECUTE de PUBLIC por padrão, porque nasceram sem `REVOKE`): `aviso_de_providencia_respondida`, `aviso_de_vistoria_recebida`, `envio_so_para_dominio_do_catalogo`, `evidencia_cabe_no_teto`, `foto_cabe_no_teto`, `operador_do_console_nao_muda_de_papel`, `providencia_amarra_no_catalogo`, `senha_trocada_deixa_de_ser_provisoria`, `suspensao_e_eliminacao_sao_do_fornecedor`, `teto_e_do_fornecedor`. A 054 não as revoga: o `desfazer` não conseguiria devolver o ACL nulo (o teste da volta compara ACL). A regra "nenhum TEMP" já passa com a 054.
- **Divergências da decisão 7, dono E08 (5A):** (a) `consumir_recuperacao` (051) toma o link (N7) antes de chegar à pessoa (N4) pelo espelho; (b) `trocarSenha` em `apps/api/src/auth/servico.ts` toma `travar_sessoes_do_usuario` (N8) antes do UPDATE que chega a N4 e N7. Nenhuma fecha ciclo nos passos 1 e 2 (todo caminho que chega a N4 ou N7 da mesma pessoa passa antes pela linha da conta, N3, que as duas seguram primeiro); o ciclo nasce quando um caminho tomar N4 por comando próprio, que é a E08. O caso `it.fails` de `pessoas.test.ts` passa a reprovar quando a E08 corrigir (a), e aí vira `it`.
- **Para a E08 e para o portão:** a sonda 10 de `catalogo-nominal.test.ts` reprova QUALQUER migração da F03 que recrie função da base (ela junta só a base e uma sonda com as migrações reais). A E08 vai redefinir `trocar_senha`, `consumir_recuperacao`, `abrir_recuperacao` e outras: o portão precisa de dono para essa sonda antes do lote 5.
- **Operação (pendência humana, nova):** quem implanta a 054 em homologação ou produção roda antes, como dono do banco, `REVOKE TEMPORARY ON DATABASE <banco> FROM PUBLIC` se o papel que migra não for o dono. Sem isso a 054 para, com a instrução na mensagem.
- **Arquivos fora da lista da 1B que esta correção tocou:** `.github/workflows/verificar.yml` (pedido no achado 6; e a linha do TEMP), `dc360/docs/RESTORE-DO-BANCO.md`, `dc360/scripts/ensaiar-restore.sh` e a receita de papéis do README (uma linha cada, a do TEMP), `dc360/docs/COLOCAR-DE-PE.md` (a mesma linha e os totais).
- **Dívidas pagas:** os achados 6 e 7 da revisão (não estavam no `dividas.md`).
