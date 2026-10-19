---
validador: banco-de-dados (general-purpose com o papel da dimensão)
modelo: claude-opus-5-5
etapa: V2-F00-E12
sha_validado: bb0f654
ci_run: ausente (39143791434 citado pelo implementador, não lido)
rodada: 4
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

Dimensão banco de dados da E12 sobre `bb0f654`, com foco na leitura nova da correção 3 (`4d6ee71`): a consulta a `vistoria_evidencias_perdidas` em `dc360/apps/api/src/saida/pacote.ts`.

1. A leitura das evidências perdidas pelo pacote respeita RLS e o município do token: a consulta roda dentro de `banco.comTenant(organizacaoId)` e `organizacaoId` vem de `quem.organizacaoId` (`rotas/saida.ts`, depois de `autorizar` e `exigirPermissao(..., "gerenciar_organizacao")`), nunca de parâmetro: PASS.
2. Com o contexto de outro município o pacote não lê nada do primeiro (perdas, assinatura, nomes de equipe e ids): PASS, em PostgreSQL 17.6 real e pela API.
3. A tabela continua com RLS ativada e forçada, policy `USING` e `WITH CHECK` por `app_organizacao_atual()`, e o papel de aplicação só com SELECT e INSERT: PASS.
4. Documento emitido continua imutável: gerar o pacote não escreve em `trilha_eventos` (onde a emissão fica registrada) e a trilha recusa UPDATE e DELETE ao papel de aplicação: PASS.
5. O isolamento do pacote depende de RLS e a sonda pega o vazamento quando a RLS cai (mordida): PASS.

## Evidência

Saídas em `/private/tmp/claude-501/-Users-rafaelgomes-Documents-city-hall/ded47d25-806d-4495-ac61-f9e84518cc35/scratchpad/validadores/banco-de-dados-E05-E12-E25/` (abaixo `<val>`).

- Ambiente: clone limpo de `bb0f654`, build de shared, db e api, PostgreSQL 17.6 (binários oficiais da EDB), origem com 50 migrações e a semente, restaurada num segundo cluster pelo roteiro da E25; API compilada com o login restrito `dc360_api` contra o banco restaurado, armazenamento em memória (modo desenvolvimento).
- RLS da tabela de perdas: `<val>/execucao-sonda/05-e12-rls-das-perdas.txt`.
- Pacotes pela API: `<val>/ferramentas/sonda-e12.mjs`, saída `<val>/execucao-sonda/06-pacotes.txt`. Os ZIPs foram abertos, procurados e apagados no fim (dado sintético).
- Mordida: `<val>/execucao-sonda/07-mordida-e12-e-login-e05.txt`.
- Testes do repositório no clone: `npx vitest run test/codigos-de-erro.test.ts test/saida-de-municipio.test.ts` em `apps/api`: 59 de 59, dos quais 37 de `saida-de-municipio` (`<val>/execucao-sonda/08-vitest-e05-e12.txt`).
- Estrutura da tabela depois do restore: `relrowsecurity` e `relforcerowsecurity` verdadeiros (conferido de novo depois da mutação desfeita).

## Cenários positivos

- Preparação, como `dc360_api` assumindo `dc360_app` e com `set_config('app.organizacao_atual', ...)` local à transação, igual à API: uma vistoria de Vale Fundo (a semente não tem nenhuma) e uma perda de ASSINATURA nela, legenda `PERDA-VF-SONDA`; uma perda de foto na vistoria vigente da ocorrência 000474/2026 de Serra Alta, legenda `PERDA-SA-SONDA`. As duas inserções passaram pelo `WITH CHECK`.
- Pacote de Serra Alta (administradora, `POST /saida/pacote.zip`): 200; `PERDA-SA-SONDA` em `tabelas/vistoria_evidencias_perdidas.csv`, no `.json` e no `documentos/000474-2026/laudo-de-vistoria.html`.
- Pacote de Vale Fundo (coordenador promovido a administrador só durante o caso, e devolvido): 200; `PERDA-VF-SONDA` na tabela, e o laudo `documentos/000112-2026/laudo-de-vistoria.html` imprime "não recuperada do aparelho" para a assinatura perdida (a frase da rota).

## Cenários negativos

- Sem contexto, `SELECT count(*) FROM vistoria_evidencias_perdidas` como o papel de aplicação: 0.
- Contexto de Serra Alta: só `PERDA-SA-SONDA`, 0 linhas de outro município. Contexto de Vale Fundo: só `PERDA-VF-SONDA`, 0 de outro.
- Contexto de Serra Alta inserindo linha com `organizacao_id` de Vale Fundo: `new row violates row-level security policy`. Com `organizacao_id` de Serra Alta e a vistoria de Vale Fundo: recusada pela FK composta `perda_vistoria_do_mesmo_municipio`.
- UPDATE e DELETE na tabela como o papel de aplicação: `permission denied` (registro de perda não se reescreve).
- Pacote de Serra Alta: `PERDA-VF-SONDA` em NENHUM arquivo; nenhum id `22222222-2222-4222-8222-...` em nenhum arquivo. As 7 menções ao nome "Vale Fundo" estão só nos comentários das migrações copiadas para `esquema/` (028, 024, 020, 030, 017, 016, 008). Espelho no pacote de Vale Fundo: nem `PERDA-SA-SONDA` nem id `11111111-1111-4111-8111-...`.
- `trilha_eventos` antes e depois dos dois pacotes: 31 linhas e md5 `3e2158f7fa25434643835a05793f686e` nos dois momentos (nenhum evento de documento emitido alterado, nenhum acrescentado).

## Tentativas de reprovar

1. A consulta nova não tem `WHERE organizacao_id`: depende só da RLS. Fui atrás disso. Desliguei a RLS da tabela como `postgres` (`ALTER TABLE vistoria_evidencias_perdidas DISABLE ROW LEVEL SECURITY`) e pedi o pacote de Serra Alta de novo: `PERDA-VF-SONDA` apareceu em `tabelas/vistoria_evidencias_perdidas.csv` e `.json` do pacote de Serra Alta. Religuei (`relrowsecurity` e `relforcerowsecurity` verdadeiros) e o pacote limpo da primeira rodada não tinha a linha. Conclusão: a garantia é a RLS forçada, que está no lugar e que o diff de estrutura da E25 confere; o padrão é o mesmo das outras leituras do pacote e da rota.
2. Procurei de onde vem o município: só de `quem.organizacaoId` (token verificado); `montarPacoteDeSaida` recebe o id e abre `comTenant` com ele; a rota não lê corpo nem parâmetro.
3. Procurei caso de vazamento pela assinatura: a perda de assinatura de Vale Fundo não aparece no laudo nem na tabela do pacote de Serra Alta.
4. Procurei escrita escondida no pacote: `saida/pacote.ts` não tem `INSERT`, `UPDATE` nem `DELETE`; a rota grava `exportacoes` e a trilha administrativa (append-only); `trilha_eventos` ficou byte a byte igual.
5. Rodei os 37 casos de `saida-de-municipio.test.ts` no clone limpo, inclusive "isolamento: a perda registrada em Vale Fundo não entra no pacote de Serra Alta": verdes.

## Achados

Nenhum. (Observação sem efeito: a semente não tem vistoria de Vale Fundo, então o isolamento de perdas só é exercitado por quem cria uma, como o teste da correção 3 e esta sonda fizeram.)

## Não verificado

- Armazenamento S3 real (o pacote rodou com o armazenamento em memória do modo desenvolvimento); a cópia de fotos e assinaturas e o `PENDENCIAS-DA-EXTRACAO.txt` com provedor real não foram exercitados aqui.
- PostgreSQL 16 e 17.11 (CI); o run do CI não foi lido.
- Igualdade do texto do laudo entre rota e pacote, campo por campo: é da dimensão de especificação e de QA; aqui só a leitura do banco e o isolamento.

## Risco residual

Baixo. A leitura nova se apoia inteira na RLS forçada da tabela; se uma migração futura desligar a RLS dela, o pacote vaza (mordida acima). Hoje isso é pego pelo `isolamento.test.ts` (CA-06) e pela conferência de estrutura.

## Motivo do humano

Nenhum nesta dimensão. A comparação humana do laudo da rota com o do pacote (validação humana da etapa) é leitura de documento, não de banco.
