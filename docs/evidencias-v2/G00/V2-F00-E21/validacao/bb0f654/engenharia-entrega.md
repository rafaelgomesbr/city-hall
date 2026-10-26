---
validador: engenharia-entrega (general-purpose com o papel da dimensão)
modelo: claude-opus-5-5
etapa: V2-F00-E21
sha_validado: bb0f654
ci_run: ausente (39143791434 citado pelo implementador, não lido)
rodada: 4
herdado_de:
tags: [INFRA]
nivel_de_prova_exigido: [E1]
nivel_de_prova_obtido: [E1 local no macOS, E2]
veredito: BLOCKED
confianca: alta
humano_necessario: nao
escalar: nenhum
---
## Critérios verificados

Saídas em `/private/tmp/claude-501/-Users-rafaelgomes-Documents-city-hall/ded47d25-806d-4495-ac61-f9e84518cc35/scratchpad/validadores/engenharia-entrega-E01-E17-E18-E19-E21-E25/` (abaixo, `<V>`).

| Critério | Prova local (Mac) | Prova que depende do CI | Situação |
| --- | --- | --- | --- |
| `.gitattributes` em vigor, zero `i/crlf` | `git ls-files --eol`: 2491 `i/lf`, 811 `i/-text`, zero `i/crlf` e zero `i/mixed`; na árvore, zero `w/crlf` e zero `w/mixed` | n/a | PASS |
| `ocorrencia-encerramento.test.ts` passa (helper `ler-fonte`) | `npx vitest run --root apps/web test/ler-fonte.test.ts test/ocorrencia-encerramento.test.ts`: 20 de 20 (`<V>/10-e21-casos.txt`); painel inteiro 665 de 665 | job `produto` (Linux) | local PASS; Linux BLOCKED |
| `banco-tls` 13 de 13 com `OPENSSL_CONF` inexistente e sem ele | com `OPENSSL_CONF=/nao/existe/openssl.cnf`: 13 de 13 e a frase do motivo impressa; sem a variável: 13 de 13 | job `produto` | local PASS; Linux BLOCKED |
| `typecheck` do campo sem depender do cache `.expo` | `test:campo` código 0 na linha de base; `testar-campo.test.mjs` 28 de 28 | job `aplicativo` | local PASS |
| Correção 1: `conferir-indices-de-evidencia` no CI | lido: passo "Os INDEX.md da evidência batem com os arquivos (SHA-256)" no job `roadmap`, `if: !cancelled()`, saída no artefato `03-indices-de-evidencia.txt`, `shell: bash` (pipefail) | execução no checkout limpo do CI | estrutura PASS; execução BLOCKED |
| O conferidor passa na árvore e nos bytes do git | `node dc360/scripts/conferir-indices-de-evidencia.mjs`: 61 INDEX.md, 2017 arquivos, OK, código 0 (`<V>/01-conferir-indices.txt`); sobre `git archive bb0f654 docs/evidencias-v2` (bytes que o CI recebe): 61 INDEX.md, 2017 arquivos, OK, código 0 (`<V>/03-conferir-indices-bytes-do-git-bb0f654.txt`) | n/a | PASS |
| O conferidor morde | 4 mutantes, todos código 1, desfeitos (`<V>/02-mutantes-conferir-indices.txt`): byte a mais em `E01/AMBIENTE.md`; o mesmo arquivo em CRLF no disco (pega o índice e a regra b2 de fim de linha); arquivo novo fora do índice em `E25/saidas/`; arquivo listado apagado em `E19/saidas/`. Controle depois de desfazer: OK | n/a | PASS |
| Linux | não há Linux aqui | job `produto` e `roadmap` | BLOCKED |

## Evidência

- `<V>/01-conferir-indices.txt`, `<V>/02-mutantes-conferir-indices.txt`, `<V>/03-conferir-indices-bytes-do-git-bb0f654.txt`, `<V>/10-e21-casos.txt`, `<V>/04-workflow-jobs.txt`.
- O teste `conferir-indices-de-evidencia.test.mjs` roda dentro do `test:scripts` da linha de base (288 aprovados, 0 falhas).

## Cenários positivos

- Os três casos da etapa verdes no macOS; o conferidor de índices verde na árvore e nos bytes do git de `bb0f654`.

## Cenários negativos

- Hash adulterado, CRLF no disco com `eol=lf`, arquivo fora do índice e arquivo faltando: os quatro reprovam com a causa escrita.
- `OPENSSL_CONF` apontando para arquivo inexistente: o teste tira a variável e diz por quê.

## Tentativas de reprovar

1. Mutantes no conteúdo e no fim de linha da evidência (acima): todos pegos.
2. Simulei o checkout do CI com `git archive` (bytes LF do git, sem `autocrlf`): passa, então o FAIL da rodada 3 (índices calculados sobre CRLF) não volta.
3. Procurei arquivo com fim de linha errado no índice do git: zero.
4. Rodei o `openssl-do-teste.test.ts` no LibreSSL do macOS (achado 1).

## Achados

1. Anotado (fora das plataformas da etapa, que são Windows e Linux): `apps/api/test/openssl-do-teste.test.ts:119` ("respeita OPENSSL_CONF válido") reprova no macOS com LibreSSL 3.3.6, porque supõe que o `openssl req -x509` sem configuração gera certificado com `CA:TRUE`, o que é configuração padrão do OpenSSL e não do LibreSSL. É exatamente o tipo de dependência da máquina que a etapa quer tirar; quem desenvolve no Mac vê `test:api` vermelho. Já é divergência conhecida da máquina nas instruções da rodada.
2. Anotado: o conferidor ignora qualquer `validacao/` na raiz da pasta da etapa; os relatórios desta rodada (não commitados) não afetam o resultado.

## Não verificado

- O run do CI (Linux): os três casos e o passo do conferidor no checkout limpo não foram lidos.
- Windows (Git Bash e PowerShell).

## Risco residual

Baixo. O controle contra o defeito da rodada 3 existe, morde e está ligado ao CI; falta ver o run.

## Motivo do humano

Nenhum: falta só a leitura do run do CI pelo gatekeeper.
