---
validador: qa
modelo: claude-sonnet-5-5
etapa: V2-F00-E19
sha_validado: 4b96ea7
ci_run: 38445527075
rodada: 2
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

Saídas em `C:/Users/Rfasg/AppData/Local/Temp/claude/c--Projetos-city-hall/b62645e7-c436-45b4-8ce0-4d68f4fb420f/scratchpad/qa-infra/` (abreviado `qa-infra/`).

| Critério | Resultado | Prova |
| --- | --- | --- |
| `npm run auditar` verde no Windows e no Linux | PASS | `qa-infra/30-auditar-real.txt`: código 0, runtime 0, 3 avisos de desenvolvimento aceitos, 6 exceções do aplicativo; CI Linux (job "Dependências...") idêntico (`72-ci-auditar-log.txt`) |
| Exceção sem prazo reprova (defeito da rodada 1) | PASS | Mutação feita por engenharia-entrega (`node-forge` sem `ate`: código 1) e teste que morde: 23 de 23 em `auditar.test.mjs` (`37-auditar-test.txt`) |
| Exceção vencida reprova | PASS | `PRAZO` trocado para 2026-10-12: código 1, "9 defeito(s)... a exceção venceu em 2026-10-12" (`32-auditar-mut-vencida.txt`). Vence hoje (2026-10-13) passa, código 0 (`33`) |
| Prazo inexistente reprova | PASS | `PRAZO = "2027-02-30"`: código 1, "prazo inválido" (`34`) |
| Dono em branco reprova | PASS | `DONO = "   "`: código 1, "exceção sem dono" (`35`) |
| Exceção com correção disponível reprova, salvo `comCorrecao: true` do CP-03 | PASS | retirei `comCorrecao` de `brace-expansion` e `shell-quote`: código 1, "a correção já existe e não exige salto maior" (`36`) |
| Só desenvolvimento avisa | PASS | `30-auditar-real.txt`: "Aviso: 3 vulnerabilidade(s)... Não reprova." |
| Runtime vulnerável reprova | PASS (teste) | "reprova vulnerabilidade de runtime" no `auditar.test.mjs` |
| O portão não dá verde quando não conseguiu auditar | FAIL | Achado 1 |
| `expo-doctor` 21 de 21 sem pular a checagem | PASS | `qa-infra/07-baseline-subset.txt`: passo `expo-doctor` "confere", código 0 |
| README diz a verdade sobre `expo-doctor` e a política | FAIL | Achado 2 |

## Evidência

`30-auditar-real.txt`, `31-auditar-registro-fora.txt`, `32` a `36` (mutações), `37-auditar-test.txt`, `72-ci-auditar-log.txt`, `90-baseline-audit-offline.txt`.

## Cenários positivos

Runtime limpo; exceção aceita com prazo futuro; desenvolvimento nomeado como "aceita (desenvolvimento)"; controle sem adulteração do teste ponta a ponta.

## Cenários negativos

Cinco mutações de `scripts/auditar-excecoes.mjs` (vencida, vence hoje, prazo inválido, dono em branco, `comCorrecao` retirado), cada uma com o código esperado e `git restore` em seguida (`git status` limpo). O caso "sem prazo" foi provado por engenharia-entrega e pelos 3 testes que mordem; eu não o repeti.

## Tentativas de reprovar

1. **Registro npm inalcançável** (o caso pedido): `cd dc360 && npm_config_registry=http://127.0.0.1:9 npm_config_fetch_retries=0 node scripts/auditar.mjs; echo $?` imprime "Runtime (vai para a imagem): 0", "Desenvolvimento: 0", "Aplicativo de campo: 0", um aviso de que as seis exceções "não aparecem mais no relatório" e "Runtime limpo, e o aplicativo sem advisory nova", e sai com **código 0** (`31-auditar-registro-fora.txt`). Reproduzido por mim; confirma o achado de engenharia-entrega.
2. O roteiro de linha de base fica cego na mesma situação: com o registro fora do ar, `baseline.mjs --so=audit-raiz,audit-campo` marca os dois passos "confere" (código 1 por `ECONNREFUSED`, esperado "falha") e sai 0 (`90-baseline-audit-offline.txt`).
3. Lista por NOME de pacote: uma advisory nova (inclusive crítica) num dos seis pacotes aceitos passa até 2027-01-05. O aplicativo tem hoje 1 crítica e 46 altas dentro dessas seis (engenharia-entrega, `05-audit-campo-runtime.json`). É o desenho do CP-03; não reprovo, registro.
4. Lista de desenvolvimento: troquei o dono de `tinypool` por vazio (engenharia-entrega) e o mesmo caminho de código das mutações acima cobre as duas listas; o `ate` não tem teto (a lista usa 2027-01-05, 84 dias).

## Achados

1. **BLOQUEIA (controle P0 de segurança, ASVS V14.2).** `dc360/scripts/auditar.mjs` é fail-open. Em `contar()`, `relatorio.metadata?.vulnerabilities ?? {}` devolve total 0 quando o `npm audit --json` volta `{"error": ...}` sem `metadata`, e `auditar()` aceita qualquer JSON com stdout. Efeito: indisponibilidade do serviço de avisos (ou do registro) dá "Runtime limpo" e código 0 no job "Dependências" do CI e em `npm run verificar`. Reprodução e saída acima. É a mesma classe do defeito da rodada 1 (portão que aprova sem ter verificado). Remédio: tratar relatório sem `metadata.vulnerabilities` ou com `error` como código 2 e acrescentar um teste com o `npm` falso devolvendo `{"error": {...}}` (nenhum dos 23 testes cobre isso). Dono: E19.
2. **Corrige antes de crescer (documental).** `dc360/README.md:1613` ainda diz que o aplicativo "passa no `expo-doctor` menos uma verificação, a de versões de pacote (seis patches novos do Expo, pendência 17...)" e `dc360/README.md:1173` diz que "a única divergência explicada é o `expo-doctor` (V-DEP-4)"; ambos contradizem `README.md:16`, `apps/campo/LEIA-ME.md` e o CI (21 de 21). A DoD pede que "21 de 21" só apareça se for verdade e que o README traga a política.
3. Anotado: advisory nova num pacote já aceito não reprova até o prazo; vale dizer isso na seção de política do README.
4. Anotado: o `expo-doctor` 21 de 21 só é medido pelo job de baseline (que só roda com `[ci completo]`); o job do aplicativo pula a checagem de versão de pacote (documentado em `verificar.yml`).

## Não verificado

- `test:isolamento`, `superficie.test.ts`, `test:campo` e `test:e2e:api` depois do `npm audit fix` e do `expo install --fix` (restrição de paralelismo); valem o CI e a saída do gatekeeper.
- Compilação de um binário nativo com os seis pacotes novos do Expo (nada de aparelho nem de build aqui).
- Leitura da lista de exceções por Rafael (CP-03 já decidido).

## Risco residual

Enquanto o achado 1 estiver aberto, uma falha do serviço de avisos produz verde falso num controle de segurança, no CI e na máquina de quem entrega.

## Motivo do humano

Não aplicável.
