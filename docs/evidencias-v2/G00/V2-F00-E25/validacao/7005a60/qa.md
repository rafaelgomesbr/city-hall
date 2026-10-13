---
validador: qa
modelo: claude-sonnet-5-5
etapa: V2-F00-E25
sha_validado: 7005a60cd70b30a4f455a96a64c4d7a3abb2819f
ci_run: 37739535524
rodada: 1
herdado_de:
tags: [DB, INFRA]
nivel_de_prova_exigido: [E1, E2]
nivel_de_prova_obtido: [E1, E2]
veredito: PASS
confianca: media
humano_necessario: sim
escalar: nenhum
---
## Critérios verificados

Critério CA-08 (restore do esquema atual em banco novo, RLS intacta, API sobe contra a cópia). Observação: o título diz 46 migrações, o esquema tem 47 (a E07 acrescentou a 047); a prova e o roteiro usam 47, correto.

- Restore sem erro com `--exit-on-error`: PASS. Segui `dc360/docs/RESTORE-DO-BANCO.md` a frio em três clusters PostgreSQL 18.3 descartáveis (`initdb`, portas 55461 a 55463, senha aleatória). 47 migrações aplicadas, `--conferir` "Esquema em dia.", semente, dump com `--extension=pg_trgm` (373.717 bytes), restore exit 0.
- Linhas por tabela iguais: PASS. `linhas.sql` da evidência, 37 linhas, `diff` vazio, total 106. Conferi também por contagem exata própria (`query_to_xml`, 36 tabelas): `diff` vazio, soma 106.
- Hashes de `schema_migracoes` iguais: PASS. md5 próprio das 47 linhas idêntico nos dois lados (`46a273ff...`).
- RLS ativada e forçada: PASS. Consulta própria em `pg_class`: 35 de 36 tabelas com `relrowsecurity` e `relforcerowsecurity` nos dois lados; a única fora é `schema_migracoes` (catálogo). `pg_trgm` 1.6 e 4 índices `gin_trgm_ops` no restaurado.
- Estrutura: `estrutura.sql` (1.063 linhas) com exatamente as duas diferenças que o roteiro prevê (ACL do `public` em outra ordem; parênteses de `provedor_id_plausivel`, conferi as duas definições: equivalentes).
- Isolamento no restaurado como `dc360_api` assumindo `dc360_app`: PASS. `isolamento.sql` e `scripts/restore/isolamento-afirmado.sql` (este com `ON_ERROR_STOP`, sai com 3 se falhar): sem contexto 0 linhas nas 31 tabelas lidas; contexto A: 47 linhas de A, 0 fora; contexto B: 2 ocorrências, 0 de A; `UPDATE` e `DELETE` em `trilha_eventos` e `UPDATE` em `trilha_administrativa` com `permission denied`; `interesse_municipio` recusa leitura.
- API contra a cópia: PASS. API construída do SHA, `DATABASE_URL` do `dc360_api` no restaurado: `/saude` 200 (`banco: ok`, `ultimaMigracao: 047`), sonda `api-contra-a-copia.mjs` 9 de 9, login, lista (6), detalhe, busca `pg_trgm` 200. Cruzado por mim: token de Vale Fundo lendo ocorrência de Serra Alta 404; própria 200; id inexistente 404; sem token 401.
- Regressão: `npm run test:isolamento` 327 passados e 3 pulados (12 arquivos); `migrar --conferir` no restaurado "Esquema em dia.".
- CI run 37739535524, SHA 7005a60, push, job "Restore do banco, Postgres 17 (CA-08)" (id 113186786420) success. Li o log: PostgreSQL 17.11 nos dois lados e `pg_dump` 17; 47 migrações; negativos (sem `dc360_console`, sem `--extension`) reprovam com a mensagem esperada; restore sem erro; linhas idênticas (37 linhas, total 106); estrutura idêntica (809 linhas); RLS ativada e forçada em 35 tabelas, nos dois lados; nenhuma tabela com dono da aplicação; trilha sem policy de UPDATE/DELETE; isolamento afirmado nos dois bancos ("TODAS AS AFIRMACOES PASSARAM"); `migrar --conferir` na cópia; `/saude` 200; login; 404 cruzado; busca `pg_trgm`; sem dump na saída. Cobre tudo o que o bloco pede, e em 17, o que eu não pude rodar.

## Evidência

Tudo rodado nesta sessão, saída no terminal; a pasta de trabalho do scratchpad foi apagada no fim por conter dump e senhas (política da etapa). Log da API preservado em `scratchpad/api-qa.log`. Log do CI baixado com `gh run view 37739535524 --log --job 113186786420`.

## Cenários positivos

Os acima: dump, restore, diff de linhas e de estrutura, isolamento, API.

## Cenários negativos

- Destino sem `dc360_console`, `--exit-on-error`: exit 1, `role "dc360_console" does not exist` na policy `console_codigos_insercao`. Mensagem clara. Confirma a inferência do REL:10.
- Mesmo caso sem `--exit-on-error`: exit 1 com `errors ignored on restore: 30`, banco com 84 de 94 policies e grants do console faltando. O roteiro diz que termina "com aparência de sucesso"; no 18.3 o código de saída é 1 (achado 3).
- Dump sem `--extension=pg_trgm` (0 entradas EXTENSION no sumário): exit 1, `operator class "public.gin_trgm_ops" does not exist` em `equipes_busca_idx`. Falha, mas a mensagem não cita `pg_trgm`; só o roteiro faz a ligação.
- Restore em banco sem `DROP SCHEMA public`: `schema "public" already exists`. Restore repetido no banco já restaurado: mesma mensagem.
- Restore por quem não tem `CREATE` no banco: `permission denied for database`.
- Mutações no restaurado, todas detectadas: `DISABLE ROW LEVEL SECURITY` em `ocorrencias` (afirmado: `SEM CONTEXTO A TABELA ocorrencias MOSTRA 10 LINHA(S)`, exit 3; diff de estrutura acusa `rls_habilitada` 35 para 34); `GRANT UPDATE ON trilha_eventos` a `dc360_app` (`UPDATE em trilha_eventos foi PERMITIDO`, exit 3); `ALTER ROLE dc360_app BYPASSRLS` (`papel da aplicacao com superusuario ou BYPASSRLS`, exit 3). Revertidos; o restaurado limpo voltou a passar.

## Tentativas de reprovar

Tentei: seguir o roteiro literalmente (falhou em dois pontos, achados 1 e 2); contagem de linhas por método independente da sonda; mutação de RLS, de grant da trilha e de atributo do papel para ver a sonda morder; token do município B lendo A e id inexistente (404 igual, sem vazamento de existência); restore duplicado; restore sem papel; sem extensão; sem `CREATE`. Procurei se a comparação de estrutura "exata" do CI esconde defeito: a cópia `scripts/restore/estrutura.sql` remove todos os parênteses do md5 das restrições e ordena a ACL; para o caso real é seguro, mas enfraquece a detecção de mudança de precedência (anotado). Procurei dump na árvore do repositório: nenhum.

## Achados

Nenhum bloqueia. Todos são do roteiro (documentação) e voltam para o dono do contrato.

CORRIGE ANTES DE CRESCER

1. Senha de `dc360_setup` ambígua no roteiro. O Passo 0 exporta `PGPASSWORD` como a senha do superusuário `postgres`, mas os passos 3 a 6 usam `-U dc360_setup` (cuja senha é a `'...'` do Passo 2) sem dizer para trocar `PGPASSWORD`. Reprodução: seguir à letra; `pg_dump -U dc360_setup` e `psql -U dc360_setup -p 55462` falham com `password authentication failed for user "dc360_setup"`. Remédio: definir senhas nomeadas no Passo 0 e usá-las em todo comando.
2. O Passo 6 manda subir `node apps/api/dist/index.js`, mas nenhum passo manda construir. Em clone limpo `apps/api/dist` não existe (`dist/` é ignorado) e o comando falha; precisa de `npm ci` e `npm run build` em `shared`, `db` e `api`. Também falta dizer como obter o segundo argumento da sonda (id de uma ocorrência de Vale Fundo; obtive por `SELECT` em `ocorrencias` junto a `organizacoes`) e que `linhas.sql`, `estrutura.sql` e `isolamento.sql` precisam de caminho completo ou `cd` (o roteiro escreve `-f "$f.sql"`).

ANOTADO

3. Imprecisão: o roteiro diz que sem `--exit-on-error` o `pg_restore` "termina com aparência de sucesso"; no 18.3 sai com 1 e `errors ignored on restore: 30`. O perigo real (banco pela metade) existe, a descrição do sinal está errada. Falta dizer "falhou: apague o banco e recomece" (após `--exit-on-error` o banco fica com 36 tabelas parciais).
4. Roteiro desatualizado em relação ao próprio SHA: diz "o CI usa 16" e lista Postgres 17 como não provado, mas o job `restore` prova em 17.11; diz que corrigir o CI e o README "não é desta etapa", mas `GRANT CREATE ON DATABASE` já está no workflow (linha 627) e no README (linha 1214); não menciona `dc360/scripts/ensaiar-restore.sh` nem `dc360/scripts/restore/`, que são a versão executável do roteiro (e já divergem das cópias na evidência: a do CI tem ACL ordenada e md5 sem parênteses). Dois caminhos para os mesmos SQL, risco de deriva.
5. A conferência de estrutura do CI remove parênteses de todas as restrições (`translate(... '()', '')`). Aceitável aqui; registrar que não detecta mudança de agrupamento.
6. A mensagem do erro sem `pg_trgm` não cita a extensão; o roteiro cobre com a tabela de erros. Sem ação.

## Não verificado

- Postgres 17 por mim: só o CI (17.11) prova; local foi 18.3. Li o log do CI, não baixei o artefato `restore-7005a60...`.
- Linux e macOS: não executados por mim; o CI cobre Linux (via `ensaiar-restore.sh`, não pelo texto do roteiro).
- "Máquina limpa" de verdade e Node/dependências do zero: esta máquina já tinha `node_modules` (a política do ambiente proíbe `npm ci`). Repeti a frio o roteiro em clusters novos, não a instalação.
- Origem Supabase com o esquema atual: fora de escopo declarado (F01-E15).
- `pg_trgm` indisponível no servidor de destino (contrib ausente): não simulável aqui; o caso "sem `CREATE` no banco" é só aproximação.
- Segunda pessoa humana seguindo o roteiro do zero: pendência de validação humana declarada na etapa.
- Fotos e assinaturas (storage), RPO e RTO: fora da etapa.

## Risco residual

Produção real (Supabase 17.6) tem papéis do provedor e `sslmode`; o primeiro restore real pode achar algo que o sintético não mostra. O roteiro com os achados 1 e 2 trava um leitor novo antes do primeiro restore bem-sucedido, o que pesa porque o objetivo do CA-08 é outra pessoa conseguir repetir.

## Motivo do humano

A etapa pede explicitamente segunda pessoa (ou Rafael noutra máquina) seguindo `RESTORE-DO-BANCO.md` do zero; fiz a leitura a frio por agente que a emenda D-30 aceita, e ela achou duas lacunas reais do roteiro. Convém que o dono do contrato corrija os achados 1 e 2 antes da repetição humana. Estado da árvore ao fim: `git status --porcelain` só mostra pastas `validacao/`; clusters apagados; `apps/*/dist` reconstruídos (ignorados pelo git).
