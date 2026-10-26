---
validador: engenharia-entrega
modelo: claude-opus-5-5
etapa: V2-F00-E21
sha_validado: 1ed0b71
ci_run: ausente
rodada: 6
herdado_de:
tags: [INFRA]
nivel_de_prova_exigido: [E1]
nivel_de_prova_obtido: [E1 local no macOS, E2]
veredito: BLOCKED
confianca: alta
humano_necessario: sim
escalar: nenhum
---
## Critérios verificados

- Evidência mínima de Infra e CI: run do CI do SHA, job a job, com artefato. NÃO EXISTE (run 39366804765 do registro `7644420` recusado pelo GitHub por faturamento, H32; `gh` sem login). A DoD pede "três casos verdes em Windows e Linux"; Linux só pelo run (ou contêiner, que esta máquina não tem) e Windows só pela validação humana. BLOCKED pela seção 6 de `28`.
- O workflow cobre a etapa? Sim, por leitura de `.github/workflows/verificar.yml` no SHA: o job `produto` roda a suíte inteira (`npm test`, que inclui o painel com `ocorrencia-encerramento` e a API com `banco-tls`), `test:scripts` e, no job `aplicativo`, `npm run test:campo` (o comando que limpa o cache `.expo/types`); o job `roadmap` roda `node dc360/scripts/conferir-indices-de-evidencia.mjs` no checkout limpo (linha 265), que confere os `INDEX.md` byte a byte e o fim de linha no git.
- `.gitattributes` em vigor no SHA: `* text=auto eol=lf`, `.ps1`, `.bat` e `.cmd` em CRLF, binários marcados. `git ls-files --eol`: 3174 `i/lf`, 1592 `i/-text` (1573 png, fontes, pdf, um wav, um docx e uma saída de teste com CR solto), **zero `i/crlf` e zero `i/mixed`**.
- CRLF: converti `apps/web/src/paginas/Ocorrencia.tsx` para CRLF no disco (`i/lf w/crlf`), rodei `ocorrencia-encerramento.test.ts` e `ler-fonte.test.ts`: 20 de 20 (`e21-06`). Restaurei com `git restore` (`w/lf` de novo).
- `OPENSSL_CONF` apontando para arquivo inexistente: `banco-tls.test.ts` e `openssl-do-teste.test.ts`, 23 de 23, com a frase "OPENSSL_CONF aponta para ... que não existe; o openssl do teste roda sem a variável" (`e21-05`). O `openssl` desta máquina é o LibreSSL 3.3.6.
- Cache do Expo: planto um `router.d.ts` sem `/mapa` e `/perfil` (arquivo ignorado pelo git; o original foi guardado e devolvido), `npm run test:campo`: "Cache .expo/types desatualizado (o cache de rotas tipadas não conhece /mapa, /perfil): apagado", tipos limpos, 1997 casos, código 0 (`e21-07`).
- Conferidor do job `roadmap` na árvore principal: código 0, 73 `INDEX.md`, 3291 arquivos (`e21-01`). Num `git worktree` limpo de `1ed0b71` com `core.autocrlf=false` (o que o CI vê): código 0, os mesmos números (`e21-02`).

## Evidência

Em `SCRATCH/validadores/engenharia-entrega/`:

- `e21-01-conferir-indices.txt` (árvore principal) e `e21-02-indices-worktree-limpo.txt` (worktree de `1ed0b71`): código 0.
- `e21-03-indices-MUTANTE-byte.txt`: no worktree, um byte a mais em `G00/V2-F00-E21/saidas/01-git-ls-files-eol-resumo.txt`: código 1, "SHA-256 diferente do índice".
- `e21-04-indices-MUTANTE-wcrlf.txt`: no worktree, `dc360/scripts/auditar-excecoes.mjs` convertido para CRLF no disco (`i/lf w/crlf attr/text=auto eol=lf`): código 1, "1 arquivo(s) com fim de linha errado no git".
- `e21-05-banco-tls-openssl-conf-inexistente.txt`: código 0, 23 de 23.
- `e21-06-encerramento-com-fonte-crlf.txt`: código 0, 20 de 20.
- `e21-07-test-campo-cache-velho.txt`: código 0, cache velho apagado e 1997 casos.
- O worktree foi removido (`git worktree remove`), e todas as mudanças da árvore principal foram desfeitas com `git restore`.

## Cenários positivos

- Os três casos da etapa (CRLF, `OPENSSL_CONF`, cache do Expo) verdes no Mac com a condição hostil presente.
- Conferidor de índices verde em checkout limpo, como no CI.

## Cenários negativos

- Arquivo de evidência alterado: o conferidor reprova (código 1).
- Arquivo de texto em CRLF no disco com `eol=lf`: o conferidor reprova (código 1), que é o falso verde local que a correção 1 prometeu fechar.

## Tentativas de reprovar

- Procurei arquivo de texto com CRLF no índice do git: nenhum.
- Rodei o conferidor no checkout que o CI usa (worktree sem `autocrlf`), não só na árvore de trabalho: passa.
- Pus o cache do Expo velho de volta antes do comando do CI: o `test:campo` o apaga e passa.
- Testei o fail-closed do conferidor contra dois mutantes; os dois o derrubam.

## Achados

- Anotado (da rodada 4, continua): nenhum teste prende o código de saída do `conferir-indices-de-evidencia.mjs` como o CI o chama; aqui o código de saída foi conferido à mão nos dois mutantes e está certo.
- Nenhum achado bloqueia. O bloqueio é a falta do run.

## Não verificado

- Linux: o job `produto`, o `aplicativo` e o `roadmap` em Linux não rodaram para este SHA (H32), e esta máquina não tem contêiner.
- Windows (Git Bash e PowerShell): fora de alcance; é a validação humana da etapa.
- O `openssl` 3 de verdade com `OPENSSL_CONF` válido: aqui o openssl é o LibreSSL.

## Risco residual

A DoD é explicitamente multiplataforma e nenhuma das duas plataformas exigidas foi exercida neste SHA. O Mac prova o código, não a plataforma.

## Motivo do humano

O run do CI do SHA só existe depois de o Rafael resolver o faturamento do GitHub (H32). A execução no Windows (`npm run verificar`) é a validação humana da etapa.
