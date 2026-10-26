---
validador: qa (agente general-purpose com o papel da dimensão)
modelo: claude-opus-5-5
etapa: V2-F00-E21
sha_validado: 52952a1
ci_run: 38618369218
rodada: 3
herdado_de:
tags: [INFRA]
nivel_de_prova_exigido: [E1, E2]
nivel_de_prova_obtido: [E1, E2]
veredito: FAIL
confianca: alta
humano_necessario: nao
escalar: nenhum
---
## Critérios verificados

Saídas em `$SP/val/qa/lote-scripts/` (abreviado `L/`). Máquina: Mac arm64, `openssl` do sistema LibreSSL 3.3.6.

| Critério (DoD e cinco campos) | Resultado | Prova |
| --- | --- | --- |
| Positivo: `ocorrencia-encerramento.test.ts` passa com árvore LF e com CRLF | PASS | LF: 13 de 13. `src/paginas/Ocorrencia.tsx` convertido para CRLF (2476 CR): 13 de 13 (`L/e21-01-crlf-ocorrencia-encerramento.txt`) |
| O helper é o que segura o CRLF (o teste morde) | PASS | CRLF mais `normalizarFimDeLinha` desligado: "não fecha com uma chave na coluna zero", 12 de 13; restaurado |
| Negativo: o helper não esconde mudança real | PASS | CRLF mais o `return` do desvio "perguntar" removido em `BlocoEncerramento` (o primeiro toque gravaria): "nada grava o encerramento fora do ramo de confirmação" vermelho; restaurado, 13 de 13 e `ler-fonte.test.ts` 7 de 7 |
| Positivo: `banco-tls.test.ts` 13 de 13 com `OPENSSL_CONF` apontando para arquivo inexistente | PASS | `OPENSSL_CONF=/nao/existe/openssl.cnf`: 13 de 13, com o aviso em stderr "o openssl do teste roda sem a variável"; controle: o `openssl` cru com a mesma variável falha ("Unable to load config info"), código 1 (`L/e21-02-banco-tls-openssl-conf.txt`) |
| Negativo: com `OPENSSL_CONF` válido o teste o respeita | PASS no Linux, FALHA de máquina no Mac | aqui o caso "respeita OPENSSL_CONF válido" reprova pelo LibreSSL (divergência de máquina conhecida); no CI Linux `openssl-do-teste.test.ts` 10 de 10 (`L/ci-job-116039196254.log`) |
| Positivo: typecheck do campo com 0 erros com `.expo/types` velho presente e sem ele | PASS | plantei um `router.d.ts` sem `/mapa`, `/perfil` e `/avisos`; `npm run test:campo` disse "Cache .expo/types desatualizado ... apagado", tipos limpos e 1927 de 1927, código 0; o arquivo original foi reposto e conferido por SHA-256 (`L/e21-03-typecheck-cache-velho.txt`). Observação: com o meu cache adulterado o `tsc` direto também deu 0, então o vermelho original (TS2345) não foi reproduzido aqui; provei a limpeza, não o vermelho |
| Negativo: `git ls-files --eol` sem nenhum `i/crlf` | PASS | 0 `i/crlf` e 0 `i/mixed` no índice |
| Linux provado (CI) | PASS | job 116039196254: `banco-tls` 13, `openssl-do-teste` 10, `ocorrencia-encerramento` 13, `ler-fonte` 7, todos verdes |
| `.gitattributes` em vigor | PASS | `* text=auto eol=lf`, `.ps1`, `.bat` e `.cmd` em CRLF, binários marcados |
| Risco declarado pela etapa: "`eol=lf` mal marcado ... altera o hash de arquivo arquivado como evidência; por isso `binary` explícito e conferência com `git ls-files --eol`" | FAIL | ver achado 1: o hash de evidência arquivada mudou, inclusive o da própria E21, e a conferência escolhida mostrava o problema |
| Evidência íntegra | FAIL | `node scripts/roadmap/conferir-evidencia.mjs V2-F00-E21 --sha 52952a1`: "1 FALHA(S), 2 aviso(s)": `baseline-antes/04-test-campo.txt` e `saidas/06-typecheck-campo-com-e-sem-cache-velho.txt` não batem com o INDEX |

Defeitos das rodadas anteriores: rodadas 1 e 2 deram PASS; o achado de antes de crescer ("a matriz do README diz Linux não provado") NÃO morde mais (`dc360/README.md:1140` registra o run do CI).

## Evidência

| Comando | Código | Saída |
| --- | --- | --- |
| `npx vitest run test/ocorrencia-encerramento.test.ts` com LF, CRLF, CRLF sem helper, CRLF com mudança real, restaurado | 0, 0, 1, 1, 0 | `L/e21-01-crlf-ocorrencia-encerramento.txt` |
| `npx vitest run test/banco-tls.test.ts test/openssl-do-teste.test.ts` sem e com `OPENSSL_CONF` inexistente; `openssl req` cru | 1 (LibreSSL), 1 (LibreSSL), 1 | `L/e21-02-banco-tls-openssl-conf.txt` |
| cache `.expo/types` velho plantado, `npm run test:campo`, original reposto | 0 | `L/e21-03-typecheck-cache-velho.txt`, `L/e21-03b-test-campo-cache-velho.txt` |
| `node scripts/roadmap/conferir-evidencia.mjs` nas 25 etapas | ver arquivo | `L/00b-conferir-evidencia-25-etapas.txt` |
| força bruta das combinações LF e CRLF por linha contra o hash do INDEX | 0 | `L/forca-bruta-eol.mjs` (saída no achado 1) |
| `npm run typecheck`, `test:scripts`, shared, web, `test:isolamento` | 0 em todos | `L/93`, `L/90`, `L/92`, `L/91`, `L/e01-10` |

## Cenários positivos

- Os três casos da etapa verdes no Mac (exceto a divergência de LibreSSL, que é do caso negativo de `OPENSSL_CONF` válido) e no Linux do CI.

## Cenários negativos

- CRLF sem o helper: vermelho. Mudança real no código com CRLF: vermelho. `openssl` cru com `OPENSSL_CONF` inexistente: falha (o teste contorna e avisa).

## Tentativas de reprovar

- Indentei a chave que fecha `BlocoEncerramento`: o teste continua verde, porque `blocoDaFuncao` recorta até a próxima chave na coluna zero (a função seguinte). Nesse caso a mudança é só de formatação e nada é escondido; não conta como achado.
- Conferi o INDEX da própria E21 num checkout como o de qualquer máquina nova (o Mac, com o `.gitattributes`, tem a árvore igual ao índice, `i/lf w/lf`): falha.
- Provei a causa por força bruta, sem confiar no texto de ninguém: para `baseline-antes/04-test-campo.txt` (17 linhas) o hash do INDEX só aparece quando as linhas 14 e 15 terminam em CRLF e as outras 15 em LF; para `saidas/06-typecheck-campo-com-e-sem-cache-velho.txt` (6 linhas), quando as linhas 2 e 3 terminam em CRLF. O INDEX foi calculado sobre a árvore de trabalho do Windows com fim de linha misto; o git guardou LF.
- Procurei se a própria E21 tinha o sinal: `saidas/02-git-ls-files-eol-completo.txt` (evidência da E21) lista 15 arquivos `i/lf w/mixed`, todos saídas de evidência (E01, E02, E05, E08, E11, E14, E15, E20, E21) mais `dc360/apps/campo/PENDENCIAS.md`. O resumo `saidas/01-git-ls-files-eol-resumo.txt` só contou o estado do índice e não olhou a coluna `w/`.
- Mutações e sondas restauradas (`git restore`; o `router.d.ts`, ignorado pelo git, reposto da cópia e conferido por SHA-256); `git status --porcelain` final só com as pastas `validacao/52952a1/`.

## Achados

1. bloqueia (dono: E21). A etapa promete que o resultado não depende da configuração da máquina do autor e declarou como risco dela, por escrito, que o fim de linha "altera o hash de arquivo arquivado como evidência". Esse risco se realizou e não foi controlado: em qualquer checkout novo, `conferir-evidencia` reprova a E21 (2 arquivos) e mais seis etapas pela mesma causa (E02, E05, E08, E11, E14, E15; `L/00b-conferir-evidencia-25-etapas.txt`), e a conferência só passou na rodada 2 porque rodou na árvore de trabalho do Windows do autor. A própria saída arquivada pela etapa (`02-git-ls-files-eol-completo.txt`) mostrava os 15 `w/mixed`. O CI não roda `conferir-evidencia`, então ninguém além da máquina do autor via a falha. Reprodução: `node scripts/roadmap/conferir-evidencia.mjs V2-F00-E21 --sha 52952a1` e `node $SP/val/qa/lote-scripts/forca-bruta-eol.mjs docs/evidencias-v2/G00/V2-F00-E21/baseline-antes/04-test-campo.txt d23b82106235f74cccab6ec9145f142d5b8a158fc2d4ee4ef6dc82a6a26b4e53`. Conserto mínimo: recalcular os SHA-256 dos 15 arquivos sobre o blob commitado (como `d5d3926` fez na E04), acrescentar à conferência da etapa a busca por `w/mixed` e, no gerador de INDEX, calcular o hash do conteúdo como o git o guarda. Ligar `conferir-evidencia` ao CI é da F01 (fora desta etapa).
2. anotado. A afirmação do `.gitattributes` de que "saída bruta de evidência com CR solto continua sendo guardada byte a byte" vale para CR solto, não para linhas CRLF dentro de arquivo LF, que são normalizadas: é exatamente o caso do achado 1.
3. anotado. O vermelho original do cache `.expo` (TS2345) não se reproduziu com o meu cache adulterado; a limpeza funciona, mas não provei aqui o vermelho que ela evita.

## Não verificado

- Windows (Git Bash e PowerShell): não há Windows aqui; valem as medições das rodadas anteriores.
- O caso "respeita OPENSSL_CONF válido" no Mac (LibreSSL): só provado no Linux do CI.

## Risco residual

- Enquanto os INDEX não forem recalculados, a integridade da evidência dessas sete etapas só se confere na máquina do autor.

## Motivo do humano

Não se aplica.
