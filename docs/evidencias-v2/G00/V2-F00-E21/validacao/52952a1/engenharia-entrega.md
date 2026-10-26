---
validador: engenharia-entrega (agente general-purpose com o papel da dimensão)
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
confianca: media
humano_necessario: nao
escalar: nenhum
---
## Critérios verificados

- **Caso 1, CRLF em `ocorrencia-encerramento`.** No Mac: com o checkout LF, 13 de 13; convertendo `apps/web/src/paginas/Ocorrencia.tsx` para CRLF (2476 linhas com CR), 13 de 13; com CRLF e `normalizarFimDeLinha` desligado em `apps/web/test/ler-fonte.ts` (mutante), 1 falha ("nada grava o encerramento fora do ramo de confirmação"). Restaurado com `git restore` (`e21-02-crlf-ocorrencia-encerramento.txt`). Linux: "✓ test/ocorrencia-encerramento.test.ts (13 tests)" no job "Testes, tipos e scripts". Atende.
- **Caso 2, `OPENSSL_CONF` em `banco-tls`.** No Mac, sem a variável e com `OPENSSL_CONF=/nao/existe/odbc/openssl.cnf`: `banco-tls.test.ts` 13 de 13 nos dois, com a mensagem "OPENSSL_CONF aponta para ... que não existe; o openssl do teste roda sem a variável" (`e21-03-openssl-conf.txt`). Linux: "✓ test/banco-tls.test.ts (13 tests)" e "✓ test/openssl-do-teste.test.ts (10 tests)". Atende em Windows (rodadas anteriores) e Linux. No macOS o caso negativo "respeita OPENSSL_CONF válido" falha em `openssl-do-teste.test.ts:119` ("expected false to be true"): o controle "sem a variável o autoassinado sai como CA" é comportamento do OpenSSL 3, e o `/usr/bin/openssl` é LibreSSL 3.3.6. Fora da DoD (Windows e Linux), documentado no `README.md:1116-1126`; vai como achado.
- **Caso 3, cache `.expo/types` velho.** No Mac, plantei um `router.d.ts` sem as rotas `avisos`, `mapa` e `perfil` (cópia do original guardada fora do repositório): `npm run test:campo` imprimiu "Cache .expo/types desatualizado (... não conhece /avisos, /mapa, /perfil): apagado" e passou, código 0 (`e21-04-cache-expo-velho.txt`, `e21-04b-test-campo-cache-velho.txt`); o arquivo original foi devolvido byte a byte (`cmp`). Ressalva honesta: o meu cache plantado também ficou sintaticamente quebrado (o `tsc` direto deu 54 erros de sintaxe, não os TS2345 do relato), então provei o remédio e não reproduzi o erro original. Linux: "Cache .expo/types: não há cache de rotas tipadas" e `test:campo` verde.
- **`.gitattributes` em vigor e zero `i/crlf`.** `git ls-files --eol`: 0 `i/crlf`, 0 `i/mixed`, 0 `w/crlf` neste checkout. Atende.
- **Linux provado pelo CI.** Run 38618369218: os três casos verdes no Linux (acima) e linha de base 19 de 19. Atende.
- **Risco declarado da etapa: "`eol=lf` mal marcado ... altera o hash de arquivo arquivado como evidência; por isso `binary` explícito e conferência com `git ls-files --eol`". NÃO ATENDE.** `node scripts/roadmap/conferir-evidencia.mjs V2-F00-Enn --sha 52952a1` neste checkout (`e21-01-conferir-evidencia.txt` e `sondas/conf-ev-*.txt`): FALHA de índice em E02, E05, E08, E11, E14, E15, E20 e na PRÓPRIA E21 ("`baseline-antes/04-test-campo.txt` tem SHA-256 diferente do INDEX.md; `saidas/06-typecheck-campo-com-e-sem-cache-velho.txt` tem SHA-256 diferente"), e dezenas de AVISO "só bate normalizando LF para CRLF" (E17, E18, E21, E25). Mecanismo, reproduzido: o arquivo de saída foi gravado no Windows com fim de linha misto (cabeçalho do roteiro em LF, saída da ferramenta em CRLF); o `INDEX.md` foi calculado sobre o arquivo do disco; no commit (`99390e0`, o mesmo que trouxe o `.gitattributes`) o `* text=auto eol=lf` normalizou o conteúdo para LF (`git show 52952a1:<arquivo> | grep -c $'\r'` = 0; `git ls-files --eol` = `i/lf w/lf attr/text=auto eol=lf`). O SHA-256 registrado (`bd1f2040...` no INDEX) não bate com o conteúdo de qualquer checkout novo (`47718e33...`), e o original não pode ser recuperado do git. A lista `binary` cuida de imagem, dump e PDF, mas saída bruta de texto com CRLF ou misto, que é a maior parte da evidência da fase, ficou sem proteção; o comentário do próprio `.gitattributes` ("uma saída bruta de evidência com CR solto ... continua sendo guardada byte a byte") só vale para CR solto, não para CRLF.
- **O CI pega?** Não. O job "Ferramentas do roadmap e estado gerado" roda só `node --test scripts/roadmap/*.test.mjs` e `gerar-estado.mjs --conferir`; nenhum job roda `conferir-evidencia.mjs` sobre as pastas de evidência, e `gerar-estado.mjs` não confere SHA-256 de `INDEX.md`. As rodadas 1 e 2 passaram porque a conferência foi feita na árvore do Windows, que continuava CRLF (não renormalizada); num checkout novo (Mac, Linux, ou Windows clonado depois do `.gitattributes`) falha.

## Evidência

- `$SP/val/engenharia-entrega/e21-01-conferir-evidencia.txt` (código por etapa) e `$SP/val/engenharia-entrega/sondas/conf-ev-E21.txt` (saída completa da E21).
- `e21-02-crlf-ocorrencia-encerramento.txt`, `e21-03-openssl-conf.txt`, `e21-04-cache-expo-velho.txt`, `e21-04b-test-campo-cache-velho.txt`.
- Linux: artefato `produto-7585801...` (`05-suite-completa.txt`) e `baseline-7585801...` (`11-test-campo.txt`) em `$SP/val/engenharia-entrega/art/`.
- `git status --porcelain` depois de cada mutação: só as pastas `validacao/52952a1/`.

## Cenários positivos

- Os três casos verdes em Linux (CI) e, os de CRLF e cache, também no macOS.

## Cenários negativos

- Helper sem normalizar CRLF: o teste reprova (não esconde).
- `OPENSSL_CONF` para arquivo inexistente: a variável sai e o motivo é impresso.

## Tentativas de reprovar

- Conferi a evidência da própria etapa num checkout novo: o índice não bate (o defeito acima).
- Tentei achar algum arquivo de texto ainda CRLF no índice: nenhum.
- Rodei a suíte de TLS no Mac (terceira plataforma): `banco-tls` passa, `openssl-do-teste` falha por LibreSSL.
- Procurei, no workflow, qualquer passo que confira os `INDEX.md`: não existe.

## Achados

1. bloqueia (é o risco declarado da etapa, materializado; também reprova a conferência mecânica de evidência, que é fail-closed). Oito pastas de evidência da F00, inclusive a da E21, têm `INDEX.md` com SHA-256 que não bate com o conteúdo commitado, por normalização de fim de linha. Reprodução: `node scripts/roadmap/conferir-evidencia.mjs V2-F00-E21 --sha 52952a1` (FALHA indice) e `shasum -a 256 docs/evidencias-v2/G00/V2-F00-E21/saidas/06-typecheck-campo-com-e-sem-cache-velho.txt` contra a linha do `INDEX.md`. Conserto mínimo: recalcular os `INDEX.md` afetados sobre o conteúdo commitado (com nota datada do porquê); daqui em diante, ou marcar as saídas brutas de evidência como `-text` no `.gitattributes`, ou fazer o gerador de índice ler o conteúdo normalizado que o git guarda; e pôr `conferir-evidencia.mjs` sobre todas as etapas com `INDEX.md` no job "Ferramentas do roadmap" do CI, para que um checkout Linux limpo pegue isso.
2. corrige antes de crescer (dono: E21). `openssl-do-teste.test.ts:119` assume o padrão do OpenSSL 3; no macOS com LibreSSL o `npm test` e o `test:api` ficam vermelhos. Remédio: um controle que não dependa do padrão da biblioteca (por exemplo, a configuração pedir `CA:TRUE` e o teste conferir que veio).
3. anotado (processo do gatekeeper, não da E21). Os `INDEX.md` de E05, E15 e E20 listam `VEREDITO.md`, que o gatekeeper reescreve depois; a conferência acusa diferença nesse arquivo por outro motivo.

## Não verificado

- Windows nesta rodada (não há Windows aqui): o checkout do Windows, se clonado de novo, deve falhar a conferência do mesmo jeito; não provei.
- O valor original dos arquivos de fim de linha misto (perdido na normalização do commit).

## Risco residual

- Até o conserto, nenhuma etapa da F00 com saída gravada no Windows tem integridade de evidência verificável num checkout novo, e o CI não avisa.

## Motivo do humano

Não se aplica.
