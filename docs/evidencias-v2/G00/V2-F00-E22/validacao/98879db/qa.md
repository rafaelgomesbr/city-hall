---
validador: qa
modelo: claude-sonnet-5-5
etapa: V2-F00-E22
sha_validado: 98879db
ci_run: 40179451002
rodada: 10
herdado_de:
tags: [DOC]
nivel_de_prova_exigido: [E1, E2]
nivel_de_prova_obtido: [E1, E2]
veredito: PASS
confianca: alta
humano_necessario: nao
escalar: nenhum
---
## Critérios verificados

Escopo por diferença (D-31, item 4): só o pagamento da DV-08 (commit 34892c9, mais a entrada em Resolvidas no 452dee6). O código de produto da E22 não mudou desde a rodada 8 (`git diff --stat 98879db..HEAD -- .github dc360` sem arquivo).

1. A frase nova de `dc360/README.md:1387-1391` (run 39366804765 "do candidato `1ed0b71`, SHA do run `7644420`", tentativa 1 recusada antes de começar por faturamento (H32), tentativa 2 em 2026-10-20 depois de o repositório virar público, 9 de 9 trabalhos verdes) bate com a API do GitHub: SIM, em todos os campos conferidos.
2. "do candidato 1ed0b71" não é enganoso: o `head_sha` do run, `7644420`, é o registro do candidato e difere de `1ed0b71` só em documentação: SIM.
3. O parágrafo inteiro continua coerente (a frase seguinte sobre o run 39420436042, o corte "correções posteriores a `fd17ff4` não estão nesse run"): SIM.
4. As entradas DV-08 e DV-09 em `docs/roadmap-v2/dividas.md` (Resolvidas) descrevem o que foi feito: SIM. DV-08: "só a tentativa 1 foi recusada, a 2 rodou 9 de 9 verdes (consulta à API pública)", com SHA `34892c9`.
5. Texto falso NOVO introduzido pelo pagamento (D-31, item 1, caso a): NÃO encontrado.
6. Sem travessão nas linhas adicionadas pelos três commits: 0 ocorrências. Nenhuma norma citada.
7. O `INDEX.md` de `divida-DV-08/` bate com os arquivos: os dois SHA-256 recalculados por mim (`git show 98879db:... | sha256sum`) são iguais aos do índice (`442cd028...` e `8957e0a9...`).

## Evidência

Saídas em `C:/Users/Rfasg/AppData/Local/Temp/claude/C--Projetos-city-hall/7e9c51d9-373a-4fc4-ba93-37b771571739/scratchpad/qa-doc/` (`run-39366804765-a1.json`, `run-39366804765-a2.json`, `jobs-39366804765-a1.json`, `jobs-39366804765-a2.json`, `annot-a1.json`).

E2 (API do GitHub, `gh api repos/rafaelgomesbr/city-hall/actions/runs/39366804765/attempts/N`, feita por mim, independente do arquivo arquivado pelo implementador):
- Tentativa 1: `conclusion: failure`, `run_started_at` 2026-10-20T03:55:13Z, `updated_at` 03:55:16Z (3 s), `head_sha` 76444203b15c87fd4c6b0f8797a5f33bf6503308, evento `push`, ramo `v2/f00`. Os 9 jobs: `failure`, `steps: 0`, `runner_name` vazio, iniciados e encerrados em 2 s: não começaram. A anotação do job 118445386883 diz: "The job was not started because recent account payments have failed or your spending limit needs to be increased. Please check the 'Billing & plans' section in your settings". Confirma "antes de começar, por faturamento".
- Tentativa 2: `conclusion: success`, `run_started_at` 2026-10-20T11:54:23Z, `updated_at` 12:12:02Z, mesmo `head_sha`. 9 jobs `success`, cada um com 11 a 19 passos e runner real. Confirma "9 de 9 trabalhos verdes" e a data.
- Repositório hoje `visibility: public`, `private: false`; as duas tentativas trazem `repository.private: false`. A pendência H32 em `docs/roadmap-v2/pendencias-humanas.md:99` registra a decisão de tornar o repositório público em 2026-10-20 e o rerun do 39366804765. "Depois de o repositório virar público" é coerente com a tentativa 2 ter rodado no mesmo dia. Não consegui o instante exato da mudança de visibilidade (a API de eventos não devolveu `PublicEvent`), então o "depois" é provado por consequência (a cobrança de Actions não se aplica a repositório público e o job rodou), não por carimbo.
- `head_sha` 7644420 versus candidato 1ed0b71 (E1, git local): `git log --oneline 1ed0b71..7644420` lista um único commit, "V2-F00: registro do candidato 1ed0b71 da rodada 6 (correção 5) [ci completo]"; `git diff --stat 1ed0b71 7644420` toca só `docs/roadmap-v2/ESTADO-ATUAL.md` e `docs/roadmap-v2/STATUS.md`. Portanto o código de produto do run é o de 1ed0b71, e "do candidato `1ed0b71`, SHA do run `7644420`" é exato.
- O arquivo arquivado pelo implementador, `saidas/01-api-do-github-run-39366804765.txt`, coincide com a minha consulta nos campos que comparei (tentativas, conclusões, datas, SHA, 9 jobs por tentativa).

## Cenários positivos

- Tentativa 1 realmente recusada antes de começar, por faturamento (anotação do GitHub).
- Tentativa 2 realmente verde, 9 de 9, com a data citada.
- Candidato e SHA do run ligados por um commit só de documentação.

## Cenários negativos

- Procurei o caso em que a frase enganaria: SHA do run com código de produto diferente do candidato. Não ocorre (diff só de STATUS e ESTADO-ATUAL).
- Procurei o caso de a tentativa 2 ter pulado job: nenhum; os 9 estão `success`, nenhum `skipped`.
- Procurei o caso de a tentativa 1 ter sido recusada só em parte: os 9 jobs recusaram, sem runner e sem passos.
- Travessão e norma inventada nas linhas novas: 0.

## Tentativas de reprovar

1. "9 de 9 trabalhos verdes" hoje é contagem de uma era: o workflow atual tem 12 jobs. Não é falso, porque a frase é presa ao SHA 7644420, cuja tentativa 2 tem 9 jobs (confirmei nos dois lados).
2. A frase diz que o run foi "do candidato 1ed0b71", mas o run é de 7644420. Testei se isso engana: não, o SHA do run vem entre parênteses e o diff mostra só documentação.
3. Procurei outras menções ao run que ainda o chamem de "recusado" sem a tentativa (`git grep 39366804765 98879db`). Achei, fora do README: `docs/evidencias-v2/G00/V2-F00-E01/RISCO-ACEITO.md:6`, `VEREDITO.md` das etapas E01, E02, E03 (tabelas de rodada e a lista de jobs "não executado") e `validacao/1ed0b71/engenharia-entrega.md:19`. São registros históricos da rodada 6, escritos quando só a tentativa 1 existia e quando o run era mesmo inexistente para a validação. Não são documentos vivos do produto e a DV-08 foi aberta só para o README. Anotado.
4. Procurei a mesma classe de imprecisão no resto do README: `git grep -n -i "todo push" 98879db -- dc360/README.md` acha a linha 1403 ("rodam em todo push: o `windows` ... e o `plataformas`") e a 1633 ("a cada push"). A linha 1948 do mesmo README diz certo (push em `main`, `master` ou `v2/**` e pull request). Ver Achados, item 1.
5. Conferi se o pagamento mexeu em número que o `conferir:numeros` lê: o diff do README no 34892c9 é de 8 linhas, só texto do parágrafo, sem número de teste. O CI do SHA (12 de 12 verdes, run 40179451002; produto idêntico ao de a60be9a) cobre `conferir:numeros`.
6. Procurei falha de formatação do parágrafo depois do reflow: a quebra de linha ficou irregular (a linha "9 de 9 verdes, linha de base em Linux inclusive, lido pelo" é curta, README linhas 1389-1391), mas é Markdown válido e não muda o sentido. Anotado como cosmético.

## Achados

Nenhum bloqueia. Nenhum cai nos critérios (a), (b) ou (c) da D-31, item 1.

1. CORRIGE ANTES DE CRESCER (dívida, não reprova): `dc360/README.md:1403` diz que o `windows` e o `plataformas` "rodam em todo push", e a 1633 diz que o `windows` roda "a cada push". Reprodução: `git grep -n -i "todo push" 98879db -- dc360/README.md` e `git grep -n -i "a cada push" 98879db -- dc360/README.md`. Não é verdade para push em ramo fora de `main`, `master` e `v2/**` (provado: zero runs nos ramos `trab/*`, ver o `qa.md` da E16 desta rodada), e o README contradiz a si mesmo na linha 1948. Condição D-31: defeito anterior, fora da frase que a DV-08 tocou (1385-1391); a DoD da E22 ("nenhum documento do produto afirma o contrário do código") o torna dívida da própria E22, sem alcance externo. O mesmo defeito foi pago no `LEIA-ME` do campo (DV-09) sem busca nas outras ocorrências.
2. ANOTADO: registros históricos das rodadas 6 em E01, E02 e E03 ainda dizem "run 39366804765 recusado" sem a tentativa 2. Corretos para a época; ninguém os lê como estado atual do CI.
3. ANOTADO: quebra de linha irregular no parágrafo editado.
4. ANOTADO (processo): li o cabeçalho da seção `## Justificativa` de `docs/evidencias-v2/G00/V2-F00-E22/divida-DV-08/RESUMO.md` (a linha 16 do recorte pedido), e nada além; no RESUMO da DV-09 (E16) li, por erro de recorte, uma frase da justificativa. O veredito não depende disso.

## Não verificado

- O instante exato em que o repositório virou público (só consequência provada, ver Evidência).
- O log de cada passo da tentativa 2 (li nomes, conclusões e contagem de passos dos 9 jobs, como o implementador).
- Os artefatos do run 39366804765 (não os baixei; a conferência foi por metadados da API).
- Não rodei `npm test` nem `conferir:numeros` localmente (sem `npm install`, como pedido); apoiei-me no CI do SHA.

## Risco residual

- Ocorrências irmãs de "todo push" no README (achado 1) continuam como dívida.
- A tentativa 2 foi lida via API pública; se o histórico de runs for apagado pelo GitHub ou por retenção, a prova do README deixa de ser reproduzível (o arquivo em `divida-DV-08/saidas/` guarda o resumo).

## Motivo do humano

Nenhum para este escopo.
