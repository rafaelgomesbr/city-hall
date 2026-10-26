---
validador: qa (general-purpose com o papel da dimensão)
modelo: claude-opus-5-5
etapa: V2-F00-E21
sha_validado: bb0f654
ci_run: ausente (39143791434 citado pelo implementador, não lido)
rodada: 4
herdado_de:
tags: [INFRA]
nivel_de_prova_exigido: [E1, E2]
nivel_de_prova_obtido: [E1, E2]
veredito: BLOCKED
confianca: media
humano_necessario: sim
escalar: nenhum
---
## Critérios verificados

Saídas em `/private/tmp/claude-501/-Users-rafaelgomes-Documents-city-hall/ded47d25-806d-4495-ac61-f9e84518cc35/scratchpad/validadores/qa-E03-E21-E22/` (abreviado `V/`). Dois clones novos do repositório no SHA `bb0f654`, feitos no scratchpad a partir do repositório local: `clone-lf` (`core.autocrlf` sem valor, como no CI) e `clone-crlf` (`git clone -c core.autocrlf=true`, a configuração do Windows do autor). Máquina: Mac, Node 24, LibreSSL 3.3.6.

| Critério | Resultado | Prova |
| --- | --- | --- |
| Correção 1: todo `INDEX.md` da evidência bate byte a byte num checkout novo | PASS | `clone-lf`: `node scripts/conferir-indices-de-evidencia.mjs` (de `dc360/`) e da raiz, código 0, "61 INDEX.md, 2017 arquivo(s) conferido(s) byte a byte", "RESULTADO: OK" (`V/21-clone-lf-indices.txt`) |
| O mesmo com `core.autocrlf=true` (Windows simulado) | PASS | `clone-crlf`: código 0, mesma contagem (`V/21-clone-crlf-indices.txt`); `git ls-files --eol` no clone: 2491 `i/lf`, 811 `i/-text`, 0 `i/crlf`, 0 `i/mixed`; só 2 `w/crlf`, os dois `.ps1` com `eol=crlf` (`V/21-ls-files-eol-clone-crlf.txt`) |
| Árvore principal no SHA | PASS | código 0, mesma contagem (`V/21-arvore-principal-indices.txt`); `git ls-files --eol`: 0 `i/crlf` |
| Passo novo no CI | PASS (leitura do arquivo; execução no CI não lida) | `.github/workflows/verificar.yml:263-265`, job `roadmap`, "Os INDEX.md da evidência batem com os arquivos (SHA-256)", `node dc360/scripts/conferir-indices-de-evidencia.mjs 2>&1 \| tee ...`; o job declara `defaults.run.shell: bash` (`:233-235`), o que liga `pipefail`, então o código 1 do script reprova o passo apesar do `tee` |
| O teste do script morde | PASS com ressalva (achado 1) | `conferir-indices-de-evidencia.test.mjs` 26 de 26 no clone; dentro de `npm run test:scripts` (288 de 288, `V/04-test-scripts.txt`); mutantes no clone: hash nunca comparado, 8 de 26 reprovam; `i/crlf` e `i/mixed` não acusados, 1 reprova; **saída sempre 0, 26 de 26 passam** (`V/21-mutantes-do-script.txt`) |
| O script morde em evidência adulterada | PASS | no clone: um byte a mais num arquivo da E21, código 1 e a linha do índice nomeada; o mesmo arquivo em CRLF, código 1, com a causa e o aviso de fim de linha no git; arquivo intruso, 2 índices reprovam; `INDEX.md` da E22 apagado, reprova "a pasta da etapa não tem INDEX.md"; restaurado, código 0 (`V/21-mutacoes.txt`) |
| Caso 1, CRLF em `ocorrencia-encerramento` | PASS (macOS) | no clone, `Ocorrencia.tsx` LF e convertido a CRLF (2476 linhas com CR): 13 de 13 nos dois; negativo: segunda ocorrência de `onEnviar(` dentro de `BlocoEncerramento` com o arquivo em CRLF, o caso "nada grava o encerramento fora do ramo de confirmação" reprova (`V/21-crlf-ocorrencia-encerramento.txt`) |
| Caso 2, `OPENSSL_CONF` em `banco-tls` | PASS (macOS) | sem a variável e com `OPENSSL_CONF=/nao/existe/odbc/openssl.cnf`: 13 de 13 nos dois, com o aviso "o openssl do teste roda sem a variável"; controle: o `openssl req` cru com a mesma variável sai 1 ("Unable to load config info") (`V/21-openssl-conf.txt`) |
| Caso 3, cache `.expo/types` velho | PASS (macOS) | no clone, `router.d.ts` sem `/mapa`, `/perfil` e `/avisos`: `tsc` direto código 2 com os dois TS2345 (`perfil.tsx(1221,44)`, `Sino.tsx(154,73)`); `node scripts/testar-campo.mjs` apaga o cache ("o cache de rotas tipadas não conhece /avisos, /mapa, /perfil: apagado") e termina com código 0, 1927 casos (`V/21-cache-expo-velho.txt`, `V/21-test-campo-cache-velho-clone.txt`) |
| DoD: os três casos verdes em Windows e em Linux | **BLOCKED** | não há Linux nesta máquina (sem Docker, podman, colima ou lima) e o run do CI não foi lido; Windows só simulado pelo `core.autocrlf=true` |

## Evidência

| Comando | Código | Saída |
| --- | --- | --- |
| `git clone --no-checkout` local, `checkout bb0f654`, `node scripts/conferir-indices-de-evidencia.mjs` | 0 | `V/21-clone-lf-indices.txt` |
| `git clone -c core.autocrlf=true`, idem | 0 | `V/21-clone-crlf-indices.txt` |
| `git ls-files --eol` no clone CRLF | (contagem) | `V/21-ls-files-eol-clone-crlf.txt` |
| mutações de evidência no clone (byte, CRLF, intruso, índice apagado) | 1, 1, 1, 1; restaurado 0 | `V/21-mutacoes.txt` |
| mutantes do script no clone e `node --test scripts/conferir-indices-de-evidencia.test.mjs` | ver tabela | `V/21-mutantes-do-script.txt` |
| `npx vitest run test/ocorrencia-encerramento.test.ts` (LF, CRLF, mutante) | 0, 0, 1 | `V/21-crlf-ocorrencia-encerramento.txt` |
| `npx vitest run test/banco-tls.test.ts` com e sem `OPENSSL_CONF` quebrado | 0, 0 | `V/21-openssl-conf.txt` |
| `npx tsc --noEmit` com cache velho; `node scripts/testar-campo.mjs` | 2; 0 | `V/21-cache-expo-velho.txt`, `V/21-test-campo-cache-velho-clone.txt` |
| regressão na árvore principal: `typecheck`, `test:isolamento`, `test:api`, painel, `test:campo`, `test:scripts` | 0, 0, 1 (só o LibreSSL), 0, 0, 0 | `V/01` a `V/09` |

## Cenários positivos

- Índices batem num clone novo com e sem `core.autocrlf=true`, e na árvore principal.
- Os três casos da etapa passam no macOS, inclusive com a árvore do painel em CRLF, com `OPENSSL_CONF` quebrado e com o cache velho presente.

## Cenários negativos

- Evidência adulterada de quatro jeitos: o script reprova os quatro com código 1 e nomeia a causa.
- Script mutado: os mutantes de comparação de hash e de fim de linha no git morrem.
- Helper do CRLF não esconde mudança real: com o arquivo em CRLF, uma chamada a mais dentro do bloco reprova.
- `openssl` cru com `OPENSSL_CONF` inexistente falha: o teste contorna e avisa, não pula.
- `tsc` direto com cache velho reprova; só o `test:campo` limpa, como a etapa pede.

## Tentativas de reprovar

1. Clone com `core.autocrlf=true` para pegar índice calculado sobre CRLF: passou.
2. Busca de shell sem `pipefail` no passo novo (o `| tee` engoliria o código 1 com o shell padrão `bash -e`): o job tem `shell: bash` explícito, então não engole.
3. Mutante que faz a linha de comando do script sair sempre 0: **sobrevive** ao teste (achado 1).
4. Arquivo intruso, índice apagado, byte trocado, CRLF no disco: todos pegos.
5. Mutação de `Ocorrencia.tsx` em CRLF para ver se a normalização esconde mudança: não esconde.
6. Procurei `INDEX.md` que liste `.ps1`, `.bat` ou `.cmd` (o único caso em que o checkout muda bytes por atributo): o clone com e sem `autocrlf` dá o mesmo resultado.

## Achados

1. **Corrige antes de crescer.** Nenhum dos 26 casos de `dc360/scripts/conferir-indices-de-evidencia.test.mjs` roda o script como linha de comando, então o contrato que o CI usa (o código de saída) não é coberto: trocando `process.exit(r.falhas.length === 0 && fimDeLinha.length === 0 ? 0 : 1)` por `process.exit(0)`, os 26 passam e o passo do CI ficaria verde com índice quebrado. Reprodução: num clone, aplicar a troca na última linha do script e rodar `node --test scripts/conferir-indices-de-evidencia.test.mjs` (26 de 26). O código entregue está certo hoje (mutação M1 sai 1); falta o teste que o prenda. A correção 1 lista 19 mutantes mortos, e este não está entre eles.
2. **Anotado (fora da DoD, que é Windows e Linux).** No macOS com LibreSSL, `openssl-do-teste.test.ts` "respeita OPENSSL_CONF válido" reprova, e `npm run test:api` sai 1 (`V/07-test-api.txt`). Já apontado na rodada 3; segue sem conserto. Na E03 isso é FAIL (vermelho conhecido sem registro); aqui não quebra critério.

## Não verificado

- Linux: nenhum contêiner nesta máquina e o run 39143791434 não foi lido. Os três casos em Linux e o passo novo do CI rodando de fato ficam sem prova minha.
- Windows real (Git Bash e PowerShell, o `openssl` ao lado do `git`): só simulei o checkout com `core.autocrlf=true`.
- `npm run verificar` no Windows (validação humana da etapa).
- Efeito colateral dito: o `test:campo` do clone usa o `node_modules` da árvore principal por link e regravou o arquivo ignorado `dc360/apps/campo/node_modules/.cache/dc360-contagem.json` da árvore principal (mesma contagem, 1927).

## Risco residual

- Sem teste do código de saída, uma refatoração do script pode desligar o portão do CI em silêncio (achado 1).
- O script deixa de fora, por desenho, arquivo solto em `G00/` e tudo em `validacao/`.

## Motivo do humano

A DoD pede os três casos em Windows e em Linux e a validação humana da etapa pede Rafael rodar `npm run verificar` no Windows e anexar um run Linux: ambiente externo inacessível daqui (Windows) e run do CI não lido nesta sessão.
