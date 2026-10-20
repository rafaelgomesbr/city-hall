---
validador: banco-de-dados
modelo: claude-opus-5-5
etapa: V2-F00-E12
sha_validado: 4ce0433
ci_run: ausente
rodada: 5
herdado_de:
tags: [API, DOCUMENTO]
nivel_de_prova_exigido: [E1, E2]
nivel_de_prova_obtido: [E1, E2]
veredito: PASS
confianca: alta
humano_necessario: nao
escalar: nenhum
---
## Critérios verificados

Escopo desta dimensão na E12: a leitura do pacote de saída sob o município (RLS) e o critério de autorização e isolamento da etapa ("o ZIP do município A não contém nome de equipe do município B; `npm run test:isolamento` verde"). O conteúdo do laudo (aviso de equipe, assinatura, coordenada, registros perdidos) é da Especificação e do QA. Ambiente: PostgreSQL 17.6 real, cluster próprio na porta 56317, papéis do job `implantavel`, API com `bancoPostgres` (cada transação faz `SET LOCAL ROLE dc360_app` e grava o município por `set_config`). Caminhos de saída relativos a `/private/tmp/claude-501/-Users-rafaelgomes-Documents-city-hall/768bf074-5845-4f2d-bff9-57106bf57383/scratchpad/val/L03-banco/`.

1. **A correção 4 não tocou a E12**: `git diff --stat bb0f654 4ce0433` em `apps/api/src/saida`, `apps/api/src/documentos`, `apps/api/src/rotas/documentos.ts` e `apps/api/test/saida-de-municipio.test.ts` é vazio; a única mudança da E12 na rodada é de texto em `dc360/docs/SAIDA-DE-MUNICIPIO.md`. Nenhuma migração alterada (só a 051 adicionada, que não toca tabela lida pelo pacote).
2. **O pacote lê tudo numa transação sob o município** (`dc360/apps/api/src/saida/pacote.ts:475`, `banco.comTenant`), e a guarda do isolamento é a RLS. Prova em Postgres real: a administradora de A baixa `/saida/pacote.zip` (200, 62 arquivos fora de `esquema/`) e nenhum arquivo cita o id do município B, "Vale Fundo", "valefundo", "Equipe Única" ou "Aurélio"; o administrador de B baixa o dele (59 arquivos) e nenhum cita o id de A, "Serra Alta", "serraalta", "Equipe Alfa" ou "Helena"; as marcas do próprio município estão presentes nos dois (controle positivo) (`saidas/22-e05-e12-pg-real.txt`).
3. **A sonda morde**: com `ALTER TABLE equipes DISABLE ROW LEVEL SECURITY` na base descartável, o pacote de A passa a conter o id do município B e "Equipe Única", e o caso reprova (`saidas/23-mordida-e12-rls-desligada.txt`). Ou seja: o que impede o vazamento em Postgres real é a RLS forçada, e ela está ligada.
4. **Autorização**: o operador do próprio município pedindo o pacote recebe 403 `sem_permissao`, código do catálogo (`saidas/22`).
5. **RLS ativada e forçada** nas 35 tabelas de negócio, inclusive `equipes`, `vistorias`, `vistoria_evidencias_perdidas` e `evidencias`, que o pacote lê (`saidas/06-catalogo.txt`, seções 1 e 2).
6. **`npm run test:isolamento` verde**: 345 aprovados e 3 pulados de 348, código 0 (`saidas/19-test-isolamento-no-sha.txt`); `saida-de-municipio.test.ts` 37 de 37, inclusive "isolamento: a perda registrada em Vale Fundo não entra no pacote de Serra Alta" (`saidas/24-e05-e12-suites.txt`).

Motivo do veredito da rodada 4: E12 foi PASS em todas as dimensões, com o banco provando que a leitura das evidências perdidas respeita a RLS. A correção 4 não mudou código nem teste da E12; a prova desta rodada (pacotes dos dois municípios em Postgres real, com mutação que morde) confirma que nada regrediu.

## Evidência

| Comando | Código | Saída |
| --- | --- | --- |
| `git diff --stat bb0f654 4ce0433` nos arquivos da E12 | 0 (vazio) | este relatório, critério 1 |
| sonda E05 e E12 em Postgres real, pacote de A e de B lidos por `unzip` | 0 | `saidas/22-e05-e12-pg-real.txt` |
| a mesma sonda com a RLS de `equipes` desligada (mutação) | 1 (o caso reprova) | `saidas/23-mordida-e12-rls-desligada.txt` |
| `vitest` de `saida-de-municipio.test.ts` (com os de códigos de erro) | 0 (154 de 154) | `saidas/24-e05-e12-suites.txt` |
| `npm run test:isolamento` no worktree | 0 | `saidas/19-test-isolamento-no-sha.txt` |
| catálogo de RLS | 0 | `saidas/06-catalogo.txt` |

Os ZIPs baixados ficaram só na pasta descartável da sonda e foram apagados depois de lidos (eram dados fictícios da semente).

## Cenários positivos

- Pacote de A e pacote de B baixados por quem administra cada um, 200, com as marcas do próprio município presentes.

## Cenários negativos

- Nenhuma marca do outro município em nenhum arquivo de dados ou documento do pacote (os dois sentidos).
- Operador pedindo o pacote: 403 `sem_permissao`.
- Com a RLS de `equipes` desligada, o vazamento aparece e a sonda reprova (prova de que a ausência acima não é por acaso da semente).

## Tentativas de reprovar

1. Procurei a marca do outro município no pacote inteiro. A primeira leitura achou "Vale Fundo" no pacote de A; segui até o arquivo: são os `esquema/*.sql` que o pacote leva (as migrações, cujos comentários citam os municípios de exemplo da semente), não dado de B. Refiz a busca fora de `esquema/` e limpei: nenhuma marca. Registro aqui para não parecer que escolhi a busca que passa: a busca sobre o pacote inteiro está no histórico da sonda e o motivo do único resultado foi conferido arquivo a arquivo.
2. Desliguei a RLS de uma tabela que o pacote lê para ver se a consulta tinha outro filtro por município que esconderia um defeito da RLS: não tem, o vazamento aparece. Então a RLS é a guarda, e ela está forçada.
3. Conferi que a API do pacote roda com `dc360_app` e não com superusuário (o mesmo `bancoPostgres` da sonda da E07, onde `current_user = dc360_app` foi medido, `saidas/16-tres-sondas-pg-real.txt`).

## Achados

- **Anotado (sem efeito em dado de município):** o pacote leva `esquema/` com o texto das migrações, e os comentários delas citam os dois municípios fictícios da semente pelo nome. Não é dado de outro município, mas uma busca ingênua por nome de município no pacote de um cliente real acusaria o nome do município de exemplo. Fora do escopo da E12.

## Não verificado

- O texto dos laudos e do termo dentro do pacote (aviso de equipe, assinatura, coordenada, registros perdidos): dimensão Especificação e QA.
- O pacote com armazenamento remoto real (S3) e com volume grande: a sonda usou o armazenamento em memória.
- A seção 29 do e2e de navegador (pacote baixado pelo painel).
- O run do CI do SHA (ausente nesta sessão).

## Risco residual

Baixo para o banco. O pacote depende só da RLS para não levar dado de outro município; a RLS está forçada em toda tabela de negócio e o teste de isolamento do repositório, mais a sonda desta rodada, reprovam se ela cair. Uma tabela nova que entre em `TABELAS_DA_SAIDA` sem RLS forçada seria pega por `isolamento.test.ts` ("toda tabela do esquema tem RLS ativada E forçada").

## Motivo do humano

Não se aplica a esta dimensão. A validação humana da etapa (Rafael comparar o laudo da rota com o do pacote para a vistoria F1) é de conteúdo de documento.
