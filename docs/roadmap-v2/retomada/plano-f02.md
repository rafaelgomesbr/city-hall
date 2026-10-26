# Plano da F02 em lotes (planejador, 2026-10-25, base `v2/f01` e483a22)

Fonte das etapas: `docs/roadmap-v2/05-api-identidade-autorizacao.md`. Zod 4.6.7 gera JSON Schema sozinho (`z.toJSONSchema`), sem dependência nova. O catálogo de acesso já existe em `packages/shared/src/codigos-de-erro.ts`.

- **Lote 0 (feito, `d4cedbd`):** módulos vazios `packages/shared/src/{erros,fuso,versao}.ts`, já exportados no `index.ts`.
- **Lote 1 (em andamento, ver `briefing-f02.md`):** 1A E01 (/v1); 1B console /v1 e DV-38; 1C guardas (DV-01, DV-03); 1D catálogo e shared (DV-20, DV-37, DV-44); 1E E09 (fuso).
- **Lote 2 (depois de 1A e 1D):** 2A web, E02 e categoria (`apps/web/src/dados/http.ts`); 2B campo, E02 e categoria (`apps/campo` `api.ts`, `entrar.tsx`, `perfil.tsx`; `packages/campo/src/transporte.ts`); 2C E03 na API (`servidor.ts`, DV-36 `frameworkErrors`); 2D E04 infra do contrato (`contrato/` com gerador, `contrato/grupos/*.ts` esqueleto e `v1.json`); 2E E07 (idempotência; migração 052 com `desfazer/052_*.sql` ou cabeçalho IRREVERSIVEL; entra depois da E09 no `POST /ocorrencias`). Consolidação do lote 1 (DV-02 no README e no cabeçalho do catálogo).
- **Lote 3 (depois de 2C e 2D):** 3A E06 na API e E08 (dono do `servidor.ts`: hook de versão, `config`, `shared/versao.ts`, rota pública, CORS `x-app-version`, contador de uso do espelho, `ESPELHO_LEGADO_ENCERRADO`, 426 no espelho); 3B E06 nos clientes (cabeçalho, 426 na classe de falha que preserva a fila); 3C1 a 3C3 grupos do registro do contrato, um grupo por arquivo.
- **Lote 4:** E05 (contrato dos clientes contra o registro, inclusive o console), consolidação e gate.

**Serializar:** `servidor.ts` 1A, depois 2C, depois 3A. `http.ts` 2A, depois 3B. `v1.json` é derivado: em conflito, regerar, nunca mesclar à mão. Contagens absolutas do README e o STATUS só o integrador muda.

**Compatibilidade com o campo instalado:** espelho igual; URLs assinadas sem /v1; 426 só para quem manda o cabeçalho de versão; `ESPELHO_LEGADO_ENCERRADO` só na F28-E11, depois de medir; `categoria` e `requisicao` aditivos; `x-app-version` no CORS antes de o painel mandar; o `/v1` é concatenado no código, nunca no `eas.json`; 409 de chave alheia (E07) só se a chave de foto for UUID por foto.

**Decisão do Rafael na F02:** a data em que o espelho deixa de funcionar (E08). Recomendação: adiar, com registro.

**Custo estimado:** 310 a 510, mais 120 a 240 de revisão.
