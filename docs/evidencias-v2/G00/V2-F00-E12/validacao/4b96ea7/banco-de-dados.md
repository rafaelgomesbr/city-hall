---
validador: banco-de-dados
modelo: claude-opus-5-5
etapa: V2-F00-E12
sha_validado: 4b96ea7
ci_run: 38445527075
rodada: 2
herdado_de:
tags: [TENANT, RLS, DB, API, DOC]
nivel_de_prova_exigido: [E1, E2]
nivel_de_prova_obtido: [E1, E2]
veredito: PASS
confianca: alta
humano_necessario: nao
escalar: nenhum
---
## Critérios verificados

Escopo da dimensão: a consulta de vistorias do pacote (`apps/api/src/saida/pacote.ts`, linhas 479 a 499) com `LEFT JOIN equipes ed` por `v.equipe_designada_id` e `LEFT JOIN equipes ea` por `v.equipe_do_agente_id`, sem `organizacao_id` na condição da junção. A documentação (motivo do FAIL de QA e Especificação nesta rodada) não é desta dimensão. Ambiente: cluster PostgreSQL 18.3 descartável meu, API do SHA por `tsx` contra ele. Saídas em `C:/Users/Rfasg/AppData/Local/Temp/claude/c--Projetos-city-hall/b62645e7-c436-45b4-8ce0-4d68f4fb420f/scratchpad/banco/`.

1. Primeira camada, FK composta: `vistorias_equipe_designada_do_mesmo_municipio` e `vistorias_equipe_do_agente_do_mesmo_municipio` (`(organizacao_id, equipe_*_id)` para `equipes (organizacao_id, id)`, migração 024). Como `dc360_app` com contexto de A: INSERT de vistoria de A com equipe de B e UPDATE de vistoria de A trocando para equipe de B são recusados pela FK; vistoria em nome de B com contexto de A é recusada pela RLS (`12`). A mensagem da FK não traz o valor da chave. PASS.
2. Segunda camada, RLS em `equipes`: furei a FK de propósito como superusuário (`session_replication_role = replica`) e apontei uma vistoria de A para a "Equipe Várzea Sigilosa" de B. A consulta do pacote como `dc360_app` com contexto de A devolve a vistoria com `equipe_designada_id` de B e `equipe_designada_nome` NULO; o pacote de A baixado pela API não contém o nome (`15`). Cada camada sozinha basta. PASS.
3. Controle positivo que faltava: criei em B (como `dc360_app` com contexto de B) uma segunda equipe, "Equipe Várzea Sigilosa", e uma vistoria designada à "Equipe Única" e coletada por agente da Várzea, e uma administradora de B só neste banco. Pelos dois `POST /saida/pacote.zip` reais (`13`, `14`):
   - pacote de B: o laudo `documentos/000112-2026/laudo-de-vistoria.html` traz "estava designada à Equipe Única e a vistoria foi coletada por agente lotado na Equipe Várzea Sigilosa" (a junção funciona e a sonda enxergaria um vazamento);
   - pacote de A: 0 arquivo com "Única" ou "Várzea Sigilosa"; "Vale Fundo" e identificadores `22222222-` só aparecem em `esquema/` (comentários das migrações, já anotado pela segurança), 0 fora dele. PASS.
4. `npm run test:isolamento` (CA-06): 327 aprovados, 3 pulados (`19`); mordida provada em E25 e E05 (`20` a `23`). PASS.

## Evidência

`12` (FK e RLS na escrita cruzada), `13` e `14` (`sonda-pacote.mjs`, pacotes de A e de B e a varredura), `15` (FK furada, RLS segura a junção), `06` (`isolamento-afirmado.sql`, código 0). Os ZIPs (dado sintético) foram apagados depois da varredura.

## Cenários positivos

O aviso de equipe divergente sai no laudo do pacote do próprio município, com os nomes certos.

## Cenários negativos

ZIP de A sem nome de equipe de B, com B tendo vistoria divergente e duas equipes; escrita cruzada de equipe recusada; junção sobre FK corrompida devolve nome nulo.

## Tentativas de reprovar

- Montar em B exatamente o dado que a junção leria (equipe própria, vistoria divergente) e baixar o pacote de A: nada de B.
- Corromper a FK como superusuário para testar a RLS isolada: a junção não traz o nome.
- Trocar a equipe de vistoria de A para a de B por UPDATE como aplicação: recusado.
- Inserir vistoria com `organizacao_id` de B usando contexto de A: recusado.

## Achados

1. ANOTADO (já apontado por QA e segurança nesta rodada): o teste `saida-de-municipio.test.ts:740` não tem controle positivo; a semente de B não tem vistoria com equipe. A garantia é a FK composta e a RLS, provadas aqui; o teste continua decorativo para a junção. Dono: implementador da E12.
2. ANOTADO: uma vistoria inserida diretamente no banco com `checklist` que não é lista derruba a montagem do pacote no meio do fluxo (status 200 já enviado, conexão encerrada; `TypeError: v.checklist.map is not a function` em `documentos/laudo.ts:350`). Só aconteceu com dado meu, fora da API, que valida o formato; não há CHECK no banco garantindo `jsonb_typeof(checklist) = 'array'`. Fora do escopo da E12.
3. ANOTADO: a FK `(organizacao_id, equipe_designada_id)` e a `(organizacao_id, equipe_do_agente_id)` não têm índice próprio (só o parcial `vistorias_fora_da_equipe_designada`). Como equipe não se apaga, o custo é pequeno; é da 024, não desta etapa.

## Não verificado

- Postgres 17 e 16: só 18.3 local.
- O teste da API `saida-de-municipio.test.ts` não foi rodado por mim (rodado por QA e Especificação).
- O laudo da rota comparado ao do pacote para a vistoria de B (é critério de documentação e de QA).

## Risco residual

Nenhum de isolamento para a junção nova: duas camadas independentes, cada uma provada sozinha. O risco que sobra é de teste (achado 1), não de produto.

## Motivo do humano

Não se aplica.
