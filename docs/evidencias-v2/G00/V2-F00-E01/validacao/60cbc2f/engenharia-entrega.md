---
validador: engenharia-entrega (general-purpose)
modelo: claude-sonnet-5-5
etapa: V2-F00-E01
sha_validado: 60cbc2f
ci_run: 39524190207
rodada: 8
herdado_de:
tags: [INFRA]
nivel_de_prova_exigido: [E1]
nivel_de_prova_obtido: [E1, E2]
veredito: PASS
confianca: media
humano_necessario: sim
escalar: nenhum
---
## Critérios verificados

Notação: `$A` = `/private/tmp/claude-501/-Users-rafaelgomes-Documents-city-hall/d1c50ef6-d495-4393-82c6-d7e2ba48b9a4/scratchpad/r8/infra-4` (logs, artefatos e a cópia do SHA). Pergunta da rodada: o que a Infra e CI da rodada 7 provou para a E01 continua provado depois da mudança do `verificar.yml` e do `baseline.mjs`?

| Critério (Infra e CI) | Resultado | Prova |
| --- | --- | --- |
| Run do CI do SHA | Run 39524190207, push em `v2/f00`, tentativa 1, `head_sha` c680f8d, que difere de 60cbc2f só em `STATUS.md` e `ESTADO-ATUAL.md` (`git diff --stat 60cbc2f..c680f8d`: 2 arquivos). 12 de 12 jobs `success`. HEAD (bc3c535) difere de 60cbc2f só em registro; `git diff --stat 60cbc2f HEAD -- .github` vazio | `$A/run.json`, `$A/jobs.json` |
| Linha de base em Linux (`baseline.mjs`) continua sendo executada pelo workflow | Sim. O job 118974893889 "Linha de base (baseline.mjs) em Linux" tem o mesmo `if:` da rodada 7 (`workflow_dispatch`, `schedule` ou push com `[ci completo]`); no diff `fd17ff4..60cbc2f` o `if:` aparece só como contexto, as mudanças nesse job são de comentário. A mensagem de c680f8d traz `[ci completo]` e o job rodou (`success`, não `skipped`) | `git diff fd17ff4..60cbc2f -- .github/workflows/verificar.yml`, `$A/jobs.json` |
| O verde do passo quer dizer "todo passo confere" | Sim, e lido no log: "o baseline saiu com código 0"; 20 passos, todos "codigo N, confere". O passo do workflow continua decidindo pelo código (3 e outros reprovam, 1 só com aviso), pelos três arquivos de resultado e pela contagem de passos | `$A/l-118974893889.txt` linhas 629-707 |
| Os números do REL:01 3.4 reproduzidos | RESUMO.md do artefato: "Conferem: 20 de 20. Divergentes sem explicação: 0. Divergentes explicadas: 0." Contagens novas do `baseline.mjs` (console 307, web, API, e2e 287) conferem no mesmo run; `test-scripts` com os 4 pulados por ambiente fechou | `$A/art/baseline/baseline/RESUMO.md`, `$A/l-118974893889.txt` linhas 692-706 |
| `baseline.mjs` mudou entre as rodadas, e a mudança não afrouxa | O diff `fd17ff4..60cbc2f` em `baseline.mjs` só sobe números esperados (E19 54 para 75, nova linha E21-correcao-3 com 8, API e web, console 286 para 307, e2e-api 197 para 287) e acrescenta comentários. Nenhum passo foi removido, nenhum `divergenciaExplicada` foi criado, nenhum `esperado` virou condicional | `git diff fd17ff4..60cbc2f -- dc360/scripts/baseline.mjs` |
| Artefato | `baseline-c680f8d...` (80528 bytes, `sha256:8673af0a...`), `workflow_run.id` 39524190207, `head_sha` c680f8d. Baixei com token (HTTP 200): traz `00-contexto.txt`, `03-baseline-stdout.txt` e a pasta `baseline/` com RESUMO.md, INDEX.md e resultados.json | `$A/artifacts.json`, `$A/art/baseline/` |
| `.nvmrc` 22 coerente com o CI | Sim: `dc360/.nvmrc` = 22 em 60cbc2f; os jobs usam `node-version: "22"` (o runner resolveu v22.23.3) | cópia de 60cbc2f, `$A/art/windows/00-versoes.txt` |
| Sem segredo na evidência | Varredura nos 6 artefatos baixados (JWT, `Bearer` longo, `postgres://usuario:senha@`): zero ocorrências | `grep -rIlE` sobre `$A/art` |
| `baseline.test.mjs` | 29 de 29, código 0, na cópia de 60cbc2f no Mac; `--so-listar` imprime 20 passos | `$A/copia/dc360` |

## Evidência

Job a job do run 39524190207 (todos `success`; ids do enunciado, passos lidos em `jobs.json`):

- 118974893889 Linha de base em Linux: passo 7 "Roteiro da linha de base" `success`; log "o baseline saiu com código 0" e 20 linhas "codigo N, confere" (de "[1/20] instalar" a "[20/20] e2e-api: codigo 0, confere"). Duração 00:55 a 01:19.
- 118974893692 Testes, tipos e scripts: `test:isolamento` com "isolamento.test.ts (137 tests)", `npm test`, `test:scripts` "# tests 353, # pass 349, # fail 0, # skipped 4", `conferir:numeros` "Todos os números da documentação batem com a realidade." O mesmo ponto de partida do isolamento que a DoD da E01 pede.
- 118974893919 auditar: `success` em 21/10 (ver Achados 1).
- 118974893942 Ferramentas do roadmap e estado gerado, 118974893974 API contra Postgres real, 118974894086 restore, 118974893838 e2e, 118974893844 campo, 118974894032 demonstração, 118974893833 windows, 118974893948 e 118974894002 ambiente hostil: todos `success`. Nenhum é pré-requisito da E01, mas nenhum foi enfraquecido.
- Diff do workflow lido inteiro: mudou o comentário do topo, o job `dependencias` (recusa `.npmrc` versionado, chama `node scripts/auditar.mjs`), o comentário do job `aplicativo`, dois jobs novos (`windows`, `plataformas`) e comentários de `baseline` e `restore`. Nada removeu, condicionou ou deslocou passo de `produto`, `baseline` ou `restore`.

## Cenários positivos

- Linha de base em Linux com 20 de 20 passos conferindo, no SHA desta rodada.
- `baseline.test.mjs` e `--so-listar` verdes no SHA.

## Cenários negativos

- `baseline.test.mjs` cobre a redação de JWT, `Bearer` e URL com credencial e o código 3 diante de "divergente" (29 de 29, verde, e dentro de `test:scripts`, que passou no CI).
- Varredura de segredo nos artefatos: nada.
- Cenário da DoD "divergência sem explicação sai com código 1 e não esconde": coberto pelo teste; não montei divergência de propósito no workflow (não posso disparar workflow).

## Tentativas de reprovar

1. Procurei job ou passo que o novo workflow tenha tornado condicional ou removido: o diff não toca `produto`, `baseline` e `restore` além de comentário; `concurrency` e `on:` intactos (em `v2/**` nada é cancelado).
2. Procurei mascaramento nos jobs novos: nenhum `continue-on-error`; os `|| true` do arquivo são os de evidência (`npm audit --json`, log do servidor de pré-visualização, `openssl version`, limpeza de contêiner), nenhum decide verde.
3. Procurei artefato de outro SHA: `workflow_run.id` 39524190207 e `head_sha` c680f8d em todos; `00-contexto.txt` do artefato traz o SHA do run.
4. Procurei o falso verde do `script-shell` em `.npmrc` (vetor da E19) afetando o passo `auditar` da linha de base: `git ls-files` não lista nenhum `.npmrc` em 60cbc2f, e o job `dependencias` do mesmo run tem o passo novo "Nenhum .npmrc versionado no repositório" `success`.
5. Perguntei se a E01 depende do `auditar` verde: depende (Achado 1). Rodei `node scripts/auditar.mjs` na cópia de 60cbc2f hoje (24/10): código 1, "Runtime (vai para a imagem): 3 vulnerabilidade(s)", "REPROVADO: 1 high, 1 moderate, 1 low". Só para medir a dependência, sem rejulgar a E19.
6. Rodei `conferir:numeros` na cópia (código 0, 25 afirmações) e um mutante (5550 trocado por 5549 em `COLOCAR-DE-PE.md:41`): código 1, "Afirmações que não batem (1)". O conferidor ainda morde depois das edições de README e COLOCAR-DE-PE do intervalo.

## Achados

1. **Dívida, dono E19 (D-31 item 1: defeito fora do escopo da E01, na etapa dona; a vulnerabilidade de runtime em si é critério da E19, seção 7 item 7).** O passo 14 da linha de base (`npm run auditar`, esperado código 0) é um dos 20 de que o "código 0" do roteiro depende. No run (21/10) saiu 0. Hoje, no mesmo SHA, ele sai 1 por advisories publicadas depois do run: qualquer REPETIÇÃO da linha de base a partir de 22/10 sai com código 3 ("divergente sem explicação") no passo `auditar`. A prova do SHA continua válida (é o run de 21/10); o que quebra é a repetição por segunda pessoa, a pendência humana da E01. Recomendação: a repetição por segunda pessoa só faz sentido depois de a E19 fechar o `auditar`.
2. **Anotado.** O passo 14 da linha de base ainda chama `npm run auditar`, e o workflow passou a chamar `node scripts/auditar.mjs` no job `dependencias`. Não há `.npmrc` versionado (o CI agora reprova se houver), então o resultado é o mesmo; a diferença só existiria com `.npmrc` na máquina de quem repete (fora do modelo de ameaça da D-31 item 2).
3. **Anotado.** O runner `ubuntu-latest` já é Ubuntu 26.04 (log do job de restore: `pgdg26.04`); a linha de base fechou verde nessa imagem.

## Não verificado

- O download dos artefatos foi feito com token (leitura sem token dá 401); li o RESUMO.md, o stdout e os arquivos de contexto, não os 20 arquivos de saída bruta passo a passo.
- Não executei a linha de base completa localmente (D-31 item 5: o CI do SHA cobre; o Mac não é Linux limpo) nem disparei workflow.
- A repetição por segunda pessoa, do zero, em outra máquina, que a DoD pede.
- O run é de c680f8d, não de 60cbc2f: a equivalência vem do diff de dois arquivos de registro, não de um run próprio de 60cbc2f.

## Risco residual

Baixo para o SHA (linha de base verde, workflow não enfraquecido). Médio para a repetição futura enquanto a E19 estiver aberta: o roteiro sai 3 por causa do `auditar`.

## Motivo do humano

A DoD exige que uma segunda pessoa (ou Rafael noutra máquina) repita o procedimento do zero; nenhum agente aqui substitui isso. A repetição deve esperar o `auditar` voltar a fechar em 0 (E19), senão o resultado diverge por motivo externo à E01.
