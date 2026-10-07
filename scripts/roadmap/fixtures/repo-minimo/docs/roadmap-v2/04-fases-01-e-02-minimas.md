# Fase 02: Segunda na ordem, terceira no numero

**Gate da fase:** G02 SEGUNDO GATE | **Depende dos gates:** G00 | **Checkpoints da fase:** CP-01

Objetivo: prova de que a ordem de execucao vale mais que a numeracao.

## Etapas

### V2-F02-E01 - Contrato da API v1
- **Prioridade:** P0
- **Tamanho:** M  |  **Complexidade:** media  |  **Risco:** critico  |  **Paralelizável:** nao
- **Objetivo:** contrato publico da API, com rota sem autenticação para o cidadão.
- **Estado atual:** CRIAR.
- **Dependências de entrada:** F00-E03; V2-F00-E01.
- **O que deve ser implementado:**
  - API: rota publica de consulta, sem autenticação, para o cidadão.
  - Banco: policy e GRANT novos para o papel de leitura.
- **Arquivos e módulos prováveis:** `dc360/apps/api/src/rotas/interesse.ts`.
- **Impacto LGPD:** retencao de IP no log da rota publica.
- **Migração necessária:** Sim (`NNN_contrato.sql`).
- **Validação humana:** Rafael decide.
- **E2E:** Não se aplica.
- **Checkpoint:** Não.

# GATE G02 - SEGUNDO GATE

Só passa se:
- [ ] Contrato publicado (E01).

**Reabre se:** o contrato quebrar.

**Este Gate libera:** F01.

# Fase 01: Terceira na ordem

**Gate da fase:** G01 TERCEIRO GATE | **Depende dos gates:** G02 | **Checkpoints da fase:** CP-03

Objetivo: segunda fase do mesmo arquivo.

## Etapas

### V2-F01-E01 - Fundacao de CI
- **Prioridade:** P1
- **Tamanho:** S  |  **Complexidade:** baixa  |  **Risco:** baixo  |  **Paralelizável:** sim
- **Objetivo:** CI roda os testes.
- **Estado atual:** CRIAR.
- **Dependências de entrada:** G02; E01 e CP-03.
- **O que deve ser implementado:**
  - Infraestrutura: workflow em `.github/workflows/`.
- **Arquivos e módulos prováveis:** `.github/workflows/verificar.yml`.
- **Impacto LGPD:** Não se aplica.
- **Migração necessária:** Não.
- **Validação humana:** Não se aplica.
- **E2E:** Não se aplica.
- **Checkpoint:** Não.

# GATE G01 - TERCEIRO GATE

Só passa se:
- [ ] CI verde (E01).

**Reabre se:** o CI ficar vermelho.

**Este Gate libera:** o resto.
