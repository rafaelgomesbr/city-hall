# Fase 00: Estabilizacao de brinquedo

**Gate da fase:** G00 BASE DE BRINQUEDO | **Depende dos gates:** nenhum | **Checkpoints da fase:** CP-01, CP-03, CP-19 (so o trecho de e-mail)

Objetivo: fase de teste, com tres etapas de forma realista.

Ordem sugerida: E01, depois E02 e E03.

## Etapas

### V2-F00-E01 - Religar a vigencia na escrita
- **Prioridade:** P0
- **Tamanho:** S  |  **Complexidade:** media  |  **Risco:** alto  |  **Paralelizável:** nao
- **Objetivo:** conta desativada deixa de escrever com o token vivo.
- **Estado atual:** CORRIGIR (o codigo existe e esta desligado).
- **Dependências de entrada:** nenhuma etapa; CP-01 decidido antes do inicio. Decisao D-02 e ADR 0001 valem aqui.
- **O que deve ser implementado:**
  - API: restaurar `exigirVigencia` na escrita.
  - Autorização: conta inativa nega; usar `exigirPermissao` antes de tocar no banco.
  - Testes: sonda antes e depois.
- **Arquivos e módulos prováveis:** `dc360/apps/api/src/auth/vigencia.ts`, `.github/workflows/verificar.yml` (só leitura).
- **Impacto LGPD:** Não se aplica: nenhum dado novo.
- **Migração necessária:** Não.
- **Validação humana:** Rafael vê a sonda antes e depois.
- **E2E:** desativar um usuario e ver o proximo POST falhar.
- **Checkpoint:** Não.

### V2-F00-E02 - Tela de aparelhos no painel
- **Prioridade:** P1
- **Tamanho:** M  |  **Complexidade:** media  |  **Risco:** medio  |  **Paralelizável:** sim
- **Objetivo:** a pessoa ve e encerra os proprios acessos.
- **Estado atual:** CRIAR (nao existe tela).
- **Dependências de entrada:** E01.
- **O que deve ser implementado:**
  - Frontend: tela nova em `dc360/apps/web/src/paginas/Sessoes.tsx` (a criar), com a frase "Encerrar sessao" e o aviso de conta desativada.
  - Acessibilidade: foco no botao de confirmar.
- **Arquivos e módulos prováveis:** `dc360/apps/web/src/paginas/Sessoes.tsx` (a criar).
- **Impacto LGPD:** o IP da sessao nao aparece na lista.
- **Migração necessária:** Não.
- **Validação humana:** Rafael aprova as frases e olha as capturas (portão visual).
- **E2E:** secao nova no e2e para a jornada de encerrar sessao.
- **Checkpoint:** Não (e-mail real: CP-19).

### V2-F00-E03 - Audit conforme politica
- **Prioridade:** P0
- **Tamanho:** M  |  **Complexidade:** media  |  **Risco:** baixo  |  **Paralelizável:** sim
- **Objetivo:** `npm audit` fecha conforme a politica do CP-03.
- **Estado atual:** EXPANDIR.
- **Dependências de entrada:** E01 a E02 e CP-03; gate G02.
- **O que deve ser implementado:**
  - Infraestrutura: job do CI roda `npm audit`.
  - Migration: nenhuma nesta etapa.
- **Arquivos e módulos prováveis:** `.github/workflows/verificar.yml`.
- **Impacto LGPD:** só dado sintético.
- **Migração necessária:** Não.
- **Validação humana:** Rafael decide o CP-03.
- **E2E:** Não se aplica.
- **Checkpoint:** CP-03 (decide a politica de audit).

# GATE G00 - BASE DE BRINQUEDO

Só passa se:
- [ ] Vigencia ligada (E01; saida dos testes).
- [x] Tela de sessoes (E02; capturas).
- [ ] Audit conforme o CP-03 (E03).

**Reabre se:** a vigencia desligar de novo.

**Este Gate libera:** F02 em diante.
