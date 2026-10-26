---
validador: qa
modelo: claude-opus-5-5
etapa: V2-F00-E21
sha_validado: 1ed0b71
ci_run: ausente
rodada: 6
herdado_de:
tags: [INFRA]
nivel_de_prova_exigido: [E1, E2]
nivel_de_prova_obtido: [E1, E2]
veredito: BLOCKED
confianca: alta
humano_necessario: sim
escalar: nenhum
---
## Critérios verificados

Saídas em `SCRATCH/validadores/qa/e21e22/` (SCRATCH é o scratchpad da sessão do gatekeeper). Execuções feitas num worktree descartável no SHA `1ed0b71` (mutações) e na árvore principal (HEAD `5044e7a`, que só difere em `STATUS.md` e `ESTADO-ATUAL.md`) para a regressão. Mac arm64, Node v24.15.0 (o `.nvmrc` pede 22; nada divergiu por isso), `openssl` do sistema = LibreSSL 3.3.6.

| Critério (DoD e cinco campos) | Prova | Resultado no Mac |
| --- | --- | --- |
| `.gitattributes` em vigor (`* text=auto eol=lf`, `.ps1`/`.bat`/`.cmd` CRLF, binários `binary`) | leitura do arquivo; `git ls-files --eol` no SHA (`e21-12`); checkout com `core.autocrlf=true` de um `.ts` e do `scripts/conferir-demo.ps1` | 3174 `i/lf`, 1592 `i/-text` (1573 png, fontes, pdf, 1 txt de evidência com CR solto), 0 `i/crlf`; o `.ts` sai `w/lf` e o `.ps1` sai `w/crlf` mesmo com autocrlf ligado |
| `git add --renormalize .` não muda nada | numa CÓPIA do índice do worktree (`e21-11`) | 0 arquivos mudam |
| Caso 1, CRLF: `ocorrencia-encerramento.test.ts` passa com árvore LF e CRLF | `e21-03` (LF, 20 de 20 com `ler-fonte.test.ts`); `e21-04`: TODA a fonte e os testes de `apps/web` convertidos a CRLF no worktree e a suíte inteira do painel rodada | LF: verde. CRLF: 45 arquivos, 688 de 688, código 0 |
| Negativo do caso 1: o helper não esconde mudança real | `e21-05-crlf-mudanca-real`: na árvore CRLF, uma segunda chamada `onEnviar(` plantada antes do desvio "perguntar" de `BlocoEncerramento` | reprova (`expected length 1 but got 2`), restaurado, volta a 13 de 13. O caso "chave movida" também está em `ler-fonte.test.ts` (verde na suíte) |
| Caso 2, `OPENSSL_CONF` inexistente: `banco-tls` 13 de 13 | `e21-00` (o `openssl req` cru com a variável quebrada sai 1 neste Mac, então o caso é real aqui); `e21-01` | 13 de 13 + 10 de 10 de `openssl-do-teste`, código 0, com o motivo impresso |
| Prova de que o conserto morde | `e21-02`: mutante que devolve o ambiente sem tirar a variável | `banco-tls` cai no `beforeAll`, 13 pulados, código 1 |
| Negativo do caso 2: com `OPENSSL_CONF` válido o teste o respeita | caso "respeita OPENSSL_CONF válido" verde em `e21-01`; `e21-10`: mutante que apaga a variável sempre | 2 casos reprovam ("mantém a variável..." e "respeita OPENSSL_CONF válido"), código 1 |
| Caso 3, cache `.expo/types` velho | `router.d.ts` sem `/avisos`, `/mapa`, `/perfil` (cópia em `router-velho.d.ts`); `tsc` direto (`e21-06`); `npm run test:campo` (`e21-07`) | `tsc` direto: os 2 TS2345 (`perfil.tsx(1224,44)`, `Sino.tsx(154,73)`), código 2; `test:campo`: apaga o cache, tipos limpos, 139 suítes, 1997 de 1997, contagem cruzada, código 0 |
| Controle da correção 1 (INDEX de evidência) | `conferir-indices-de-evidencia.mjs` no worktree do SHA (`e21-08`); arquivo de evidência da E21 adulterado (`e21-09`) | limpo: 73 INDEX, 3291 arquivos, código 0; adulterado: `FALHA G00/V2-F00-E21/INDEX.md`, código 1 |
| Regressão obrigatória | `npm run typecheck` (`r-01`), `npm test` na raiz (`r-02`: inclui `@dc360/web`, `@dc360/api` e `test:isolamento`), `npm run test:campo` (`e21-07`), `npm run test:scripts` (`r-03`) | todos código 0: campo-pacote 238, shared 223, API 1590 e 34 pulados por ambiente, console 274, painel 688, banco 345 e 3 pulados; scripts 288 de 288 |
| Teste de isolamento ("nada mudou") | `@dc360/db` dentro de `r-02` | 345 passam, 3 pulados por ambiente |
| Documentação (README "Como testar", plataformas; LEIA-ME do campo) | leitura conferida contra a execução acima | o parágrafo do cache no `LEIA-ME` bate com o que medi (typecheck direto reprova com cache velho, `test:campo` limpa); a matriz do README diz Windows e Linux sem afirmar o que não foi rodado; ver Achados 2 |
| DoD: três casos verdes em Windows E Linux | nada nesta máquina prova Windows nem Linux; CI do SHA ausente (H32) | NÃO VERIFICÁVEL aqui: é o bloqueio |

## Evidência

Todos os caminhos relativos a `SCRATCH/validadores/qa/e21e22/`:

- `e21-00-openssl-cru-conf-inexistente.txt` (código 1 do `openssl req` cru com `OPENSSL_CONF` quebrado)
- `e21-01-tls-conf-inexistente.txt` (código 0, 23 de 23)
- `e21-02-mutante-sem-limpeza.txt` (código 1, 13 pulados)
- `e21-03-web-lf.txt` (código 0), `e21-04-web-crlf-suite.txt` (código 0, 688 de 688 em árvore CRLF)
- `e21-05-crlf-mudanca-real.txt` (código 1, mudança real acusada em CRLF)
- `e21-06-tsc-cache-velho.txt` (código 2), `e21-07-test-campo-cache-velho.txt` (código 0, cache apagado)
- `e21-08-indices-sha.txt` (código 0), `e21-09-indices-adulterado.txt` (código 1)
- `e21-10-mutante-apaga-conf-valido.txt` (código 1)
- `e21-11-renormalize.txt` (vazio: nada muda), `e21-12-ls-files-eol.txt`
- `r-01-typecheck.txt`, `r-02-npm-test.txt`, `r-03-test-scripts.txt` (todos código 0)

## Cenários positivos

- Painel inteiro verde com toda a fonte e os testes em CRLF (688 de 688), não só o arquivo da etapa.
- `banco-tls` 13 de 13 com `OPENSSL_CONF` apontando para arquivo inexistente, num `openssl` em que a variável quebrada derruba o comando cru.
- `test:campo` com cache velho presente apaga o cache e passa (1997).
- Checkout com `core.autocrlf=true` sai LF para texto e CRLF só para `.ps1`.
- Regressão obrigatória toda em código 0.

## Cenários negativos

- Mudança real de código numa árvore CRLF reprova (`onEnviar` duplicado).
- Sem a limpeza do `OPENSSL_CONF`, a suíte de TLS cai (o teste morde).
- Com a variável válida, apagá-la sempre reprova 2 casos (a regra estreita é presa).
- `tsc` direto com cache velho reprova com os dois TS2345 originais.
- INDEX com arquivo adulterado: código 1.
- Isolamento: não se aplica à etapa; `test:isolamento` verde como prova de que nada mudou.

## Tentativas de reprovar

1. Converti a árvore inteira do painel a CRLF (e não só o arquivo da etapa) para achar outro teste que lê fonte com `\n`: nenhum reprovou.
2. Mutante do conserto do `OPENSSL_CONF` (sem limpeza) e mutante oposto (limpa sempre): os dois mortos.
3. Na primeira tentativa de cache velho troquei só parte das formas de rota e o `tsc` passou; refiz trocando todas (inclusive `href`) e reproduzi os dois TS2345 do registro original. O defeito existe e o conserto do `test:campo` o cobre.
4. Inseri uma chave na coluna zero dentro da função na árvore CRLF: o arquivo deixa de compilar e o teste falha por carga, o que não distingue nada; troquei pela duplicação de `onEnviar`, que compila e é acusada pela asserção certa.
5. Procurei `i/crlf` e `i/mixed` no índice e efeito do `--renormalize`: zero.
6. Conferi se o achado da rodada 4 (código de saída do conferidor de INDEX sem teste) foi consertado: não foi (Achado 1).
7. Tentei provar Linux: não há Docker, Podman, Colima nem Lima nesta máquina, e o CI do SHA não rodou (H32).

## Achados

1. **Corrige antes de crescer (repetido da rodada 4, não consertado).** Nenhum caso de `dc360/scripts/conferir-indices-de-evidencia.test.mjs` roda o script como comando, então o contrato que o CI usa (o código de saída da última linha, `process.exit(r.falhas.length === 0 && fimDeLinha.length === 0 ? 0 : 1)`) não é preso por teste. O código entregue está certo hoje (`e21-09`: código 1 com arquivo adulterado). O script e o teste não mudaram desde `39e9899`.
2. **Anotado.** O parágrafo do README depois da matriz de plataformas diz que as correções posteriores ao run 39143791434 "ainda não passaram por CI", mas o STATUS registra o run 39241470718 (candidato `4ce0433`, 9 de 9 verdes, com a linha de base em Linux), que já as inclui. O texto subestima a cobertura Linux (direção segura), não prova nada sobre `1ed0b71` (sem CI) e está detalhado no relatório de QA da E22.
3. **Anotado (ambiente desta máquina).** `test:scripts` dá 288 de 288 com 0 pulados porque `apps/campo/ios/` existe aqui; no Linux os 4 testes de iOS pulam.

## Não verificado

- **Linux**: os três casos e a regressão em Linux. Sem contêiner nesta máquina e sem CI do SHA (run do registro `7644420` recusado pelo GitHub por faturamento, H32). É o motivo do BLOCKED.
- **Windows real** (Git Bash e PowerShell, o `openssl` ao lado do `git`, árvore CRLF de checkout antigo): só simulei a árvore CRLF e o checkout com `core.autocrlf=true`.
- `npm run verificar` no Windows (validação humana da etapa).
- Efeito colateral declarado: o `test:campo` do worktree usa o `node_modules` da árvore principal por link e regravou o arquivo ignorado `dc360/apps/campo/node_modules/.cache/dc360-contagem.json` (mesma contagem, 1997); o `npm test` reconstruiu os `dist` ignorados. Nenhum arquivo rastreado mudou.

## Risco residual

Baixo para o produto: tudo o que a etapa entrega e que roda nesta máquina passou, com as mordidas provadas. O risco é a DoD em si: Windows e Linux continuam sem prova sobre este SHA, e o passo do CI que confere os INDEX pode ficar verde com índice quebrado se alguém mexer na linha de saída (Achado 1).

## Motivo do humano

A DoD pede os três casos verdes em Windows e em Linux. Só o Rafael roda `npm run verificar` no Windows, e a prova Linux depende do CI do SHA, que está parado pela pendência de faturamento H32 (ou de um contêiner que esta máquina não tem). Até um dos dois existir, o bloqueio não sai por validação.
