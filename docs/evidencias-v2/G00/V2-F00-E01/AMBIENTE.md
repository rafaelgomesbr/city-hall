# Ambiente da medição (V2-F00-E01)

Medição feita em 2026-10-05, a partir do commit `e82719e` (a árvore de código de `dc360/` está igual a esse commit; só mudaram documentos, o roteiro `baseline.mjs` e seu teste, `.nvmrc`, README e `COLOCAR-DE-PE.md`).

| Item | Valor |
| --- | --- |
| Sistema | Windows 11 Home Single Language, versão 10.0.26200 |
| Processadores lógicos | 16 |
| Memória | cerca de 24 GB |
| Terminal | Git Bash (a execução usa `shell: true`, então `npm` resolve como no terminal) |
| Node | v22.17.0 |
| npm | 10.9.2 |
| vitest | 3.2.7 |
| PGlite | 0.2.17 (Postgres 16 em WebAssembly, nos testes) |
| Playwright | 1.62.1 |
| Expo SDK | 57 (pacote `expo` 57.0.23) |
| Postgres do CI | 16 (`postgres:16`, em `.github/workflows/verificar.yml`) |
| Postgres de produção | 17.6 (Supabase, conforme `dc360/docs/COLOCAR-DE-PE.md`, Parte 6) |

## O que esta medição NÃO é

- **Não é máquina limpa.** O `npm ci` das duas árvores de dependência NÃO foi executado nesta rodada (`--sem-instalar`), porque apagaria e reinstalaria o `node_modules` da máquina de trabalho do Rafael. As árvores já estavam instaladas. A prova de "máquina sem estado prévio" só existe quando uma segunda pessoa, ou o Rafael noutra máquina, segue `COMO-REPRODUZIR.md` do zero (validação humana da etapa).
- **Não inclui o resultado do CI.** O repositório é privado e o resultado do workflow Verificar no GitHub continua NÃO CONFIRMADO até o Rafael anexar o último run (validação humana da etapa).
- **Não mede Linux nem macOS.** Em Linux o passo `auditar` não deve quebrar como quebra em Windows; essa diferença está registrada na linha de base de 2026-09-30 e é tratada na etapa V2-F00-E21.
