# V2-F01-E02: CI confiável (permissions mínimas, timeouts, ações fixadas por SHA, cache)

## Fatos

### O que já existia e o que mudou

O planejador acertou: `permissions: contents: read` e `concurrency` já estavam no topo do `verificar.yml` quando esta etapa começou (ponta `cd0da03`). O que faltava e foi feito:

- `.github/workflows/verificar.yml`:
  - `timeout-minutes` nos cinco jobs que não tinham (`produto` 30, `navegador` 35, `aplicativo` 15, `implantavel` 10; o quinto, `demonstracao`, saiu do arquivo, ver abaixo).
  - Todas as `uses:` (checkout, setup-node, upload-artifact) fixadas por SHA de 40 caracteres com a versão em comentário: `actions/checkout@11d5960a... # v4.4.0`, `actions/setup-node@49933ea5... # v4.4.0`, `actions/upload-artifact@ea165f8d... # v4.6.2`. São os mesmos SHAs de `auditoria-semanal.yml` (lote 1) e o commit para o qual o `@v4` flutuante apontava hoje. `sast.yml` e `segredos.yml` usam checkout v4.2.2 (`11bd7190...`): versão anterior da mesma linha, não conflita; o Dependabot (frente github-actions) alinha. SHAs lidos com `git ls-remote` em 2026-10-24.
  - `runs-on: ubuntu-latest` virou `ubuntu-24.04` em todos os jobs, inclusive na matriz do `plataformas` (`[windows-latest, ubuntu-24.04]`). O Windows ficou em `windows-latest` de propósito: o job `plataformas` quer reproduzir o Windows do autor, e o cabeçalho do arquivo diz isso.
  - `concurrency`: `cancel-in-progress` agora só em `pull_request`, com o mesmo padrão de `sast.yml` (grupo por SHA fora de PR). Antes, um push em `master` ou `main` cancelava o run anterior.
  - Cache dos navegadores do Playwright (`actions/cache@0057852b... # v4.3.0`, `~/.cache/ms-playwright`, chave `playwright-<os>-<navegadores>-<hash do package-lock.json>`) nos jobs `produto`, `navegador` e `baseline`. No acerto, só `playwright install-deps` (as bibliotecas de sistema não moram no cache); no erro, `install --with-deps` como antes. O cache do npm do `setup-node` já existia e o `aplicativo` já tinha os dois lockfiles em `cache-dependency-path`.
  - Cabeçalho do arquivo com as regras de CI.
- `.github/workflows/demonstracao.yml` (novo): o job `demonstracao` (nome de exibição "Pacote da demonstração" intacto) saiu do `verificar.yml`. Filtro `paths` em push e em pull_request: `mockup/**`, `scripts/**`, os três documentos que o empacotador põe no zip (`docs/APRESENTACAO.md`, `docs/ROTEIRO_DEMO.md`, `docs/ROTEIRO_VIDEO.md`), `dc360/package-lock.json` (o Playwright vem de lá) e o próprio workflow. A etapa pedia só `mockup/**` e `scripts/**`; o resto é o que `scripts/empacotar-demo.ps1` realmente copia, e sem ele uma mudança só no roteiro não revalidaria o zip. Também tem `workflow_dispatch`, cache do Playwright e `timeout-minutes: 10`.
- `dc360/scripts/conferir-workflows.test.mjs` (novo, 15 casos): lê todo `.github/workflows/*.yml` como texto e reprova: workflow sem `permissions` de topo (ou com escrita), job sem `timeout-minutes` (ou acima de 120), `uses:` sem SHA de 40 caracteres ou sem a versão em comentário, `pull_request_target`, `ubuntu-latest`/`macos-latest` (inclusive em matriz) e job sem `runs-on`. Prende também: os quatro nomes de job do ruleset, o job da demonstração em arquivo próprio com filtro de caminho, `cancel-in-progress` só em pull_request, cache onde há `playwright install`, e os dois lockfiles no cache do `aplicativo`. Os casos negativos aplicam cada regra a um workflow sintético estragado.
- `dc360/scripts/baseline.mjs`: linha `V2-F01-E02: 15` e o arquivo na tabela de arquivos por etapa.
- `dc360/README.md`: seção de integração contínua (matriz com `ubuntu-24.04`, o pacote da demonstração em arquivo próprio, o parágrafo das regras de CI).

Não tocados (proibido na etapa ou de outro dono): `CODEOWNERS`, `pull_request_template.md`, `CLAUDE.md`, `dc360/package.json`, STATUS, ESTADO-ATUAL, pendências, dívidas; `sast.yml`, `segredos.yml`, `auditoria-semanal.yml` e `dependabot.yml` (só lidos, e o teste novo os cobre: todos passam sem ajuste).

### Timeouts: o que a etapa pedia e o que foi feito

A etapa diz "o dobro da mediana das últimas execuções verdes". Medi os 8 últimos runs verdes de `verificar.yml` pela API pública do GitHub (`saidas/00-duracoes-antes.txt`). Para `produto` (mediana 11,7, máximo 21,9) e `navegador` (mediana 12,1, máximo 28,6) o dobro da mediana fica abaixo do máximo já observado, então um run verde normal estouraria. Usei o máximo observado com folga: `produto` 30, `navegador` 35. Para os rápidos, o dobro da mediana seria minúsculo (`aplicativo` 5,8; `implantavel` 4,6), e um minuto de fila lenta do GitHub reprovaria sozinho: `aplicativo` 15, `implantavel` 10, `demonstracao` 10. Todos continuam muito abaixo do padrão de 360.

### Comandos e resultados (saídas em `saidas/`)

| Arquivo | Comando | Resultado |
| --- | --- | --- |
| `00-duracoes-antes.txt` | durações dos jobs nos 8 últimos runs verdes, pela API pública do GitHub | medianas e máximos por job (base do "antes") |
| `01-conferir-workflows.txt` | `node --test scripts/conferir-workflows.test.mjs` | 15 de 15, código 0 |
| `02-prova-de-mordida.txt` | o `verificar.yml` REAL estragado de oito jeitos, um por vez, e o teste rodado em cada um (arquivo restaurado no fim, `restaurado: saída 0`) | os cinco da E02 reprovam (uses por tag, job sem timeout, sem permissions, `pull_request_target`, `ubuntu-latest`); os três últimos (tirar `auditar`, `test:campo`, `test:scripts`) NÃO reprovam aqui, e é o esperado: essa regra é da E03, que é o outro commit |
| `03-test-scripts.txt` | `npm run test:scripts` ANTES de a pasta de evidência ter `INDEX.md` | 467 testes, 1 falha: `conferir-indices-de-evidencia: a evidência real`, porque a pasta ainda não tinha índice. Repetida abaixo |
| `04-yaml-valido.txt` | `ruby -ryaml` sobre `verificar.yml` e `demonstracao.yml` | sintaxe válida; lista de jobs com runner e timeout |
| `05-conferir-numeros.txt` | `npm run conferir:numeros` | "Todos os números da documentação batem com a realidade", código 0 |
| `06-baseline-test.txt` | `node --test scripts/baseline.test.mjs` | 29 de 29, código 0 (uma primeira rodada reprovou: o teste criava um caso por arquivo num laço e o `baseline.test.mjs` conta os `test(` do texto; virou um caso só com o laço dentro) |
| `07-regras-de-conteudo.txt` | `npx vitest run --root packages/shared test/regras-de-conteudo.test.ts` | 10 de 10, código 0 |
| `08-test-scripts-com-index.txt` | `npm run test:scripts` com o `INDEX.md` presente | 467 testes, 463 ok, 4 pulados, 0 falhas, código 0 |

Contagem de `scripts/`: 452 antes, 467 depois (15 casos novos). Não há número desse total no README nem no `COLOCAR-DE-PE.md` para atualizar (o `conferir:numeros` confere e passa).

### Vermelho que não é desta etapa

O job `dependencias` está vermelho por advisories novas em `zod`, `fastify` e `fast-uri` (a correção está em outro ramo). Esta etapa não toca nele.

### Limitações

- NADA foi executado no GitHub (nada foi enviado). A prova do enunciado ("os quatro jobs exigidos passam com SHA e timeouts", "quatro PRs de prova reprovados", "o `GITHUB_TOKEN` só lê: passo com `git push` recusado", "durações antes e depois") depende do run do SHA candidato e de PRs de prova. Aqui estão a sintaxe válida, o teste que reprova no repositório real estragado e as durações de antes.
- O cache do Playwright e o ramo `install-deps` não foram exercitados num runner. O ramo de acerto do cache chama `npx playwright install-deps <navegadores>`, que existe no Playwright; a lógica do `if [ ... ]` foi conferida no bash. Se o primeiro run mostrar problema, o ramo de erro é o caminho antigo, idêntico ao que rodava.
- "Antes e depois" das durações: o "antes" está em `00-duracoes-antes.txt`. O "depois" só existe quando o run do SHA candidato terminar, e o ganho do cache só aparece no SEGUNDO run (o primeiro enche o cache). O `demonstracao` deixa de aparecer em run que só toca o produto.
- Efeito colateral aceito: como o `demonstracao` agora é um workflow à parte com filtro de caminho, um push que só muda o produto não gera o artefato `demonstracao-<sha>`. O gatekeeper (seção 6 de `28`) que espera um artefato por job do `verificar.yml` não o encontrará nesses commits, e isso é correto. Não é check obrigatório do ruleset, então o filtro não deixa PR esperando para sempre.
- O leitor de YAML do teste é por texto (não há biblioteca de YAML no repositório); reformatar o arquivo de outro jeito faz o teste reclamar em vez de passar em falso.
- `windows-latest` continua flutuante, por decisão registrada no cabeçalho.

## Justificativa

- `cancel-in-progress` só em PR, grupo por SHA fora de PR: o run da `master` é o registro de que o que entrou passou, e cada SHA candidato precisa do seu run completo. É o padrão que `sast.yml` já usa.
- SHA de checkout v4.4.0 (o mesmo de `auditoria-semanal.yml`) em vez de alinhar com v4.2.2 de `sast.yml`: é o commit para o qual o `@v4` apontava, então a mudança não troca de versão, só a prende.
- Job `demonstracao` em arquivo próprio e fora do ruleset: o filtro de caminho seria perigoso em check obrigatório (o PR esperaria para sempre), mas o ruleset exige só os quatro jobs do `verificar.yml`.
- Teste sem biblioteca de YAML, por texto, no padrão de `dependabot.test.mjs`: a raiz do repositório não instala nada e o teste precisa rodar no `npm run test:scripts` sem dependência nova.
- Um caso só com laço sobre todos os arquivos (e não um caso por arquivo): o `baseline.mjs` conta `test(` no texto.

## Para o orquestrador

Linha do STATUS sugerida:

`| V2-F01-E02 | CI confiável: permissions mínimas, timeouts, ações fixadas por SHA, cache | M | P0 | IMPLEMENTADA | Candidato <sha7>. Timeout nos jobs que faltavam, todas as uses por SHA com versão em comentário, ubuntu-24.04, cancel-in-progress só em PR, cache do Playwright, demonstracao em demonstracao.yml com filtro de caminho; 15 testes novos em scripts/conferir-workflows.test.mjs (baseline V2-F01-E02: 15), com prova de mordida sobre o verificar.yml real. Nada executado no GitHub ainda: PRs de prova e durações depois pendentes. |`

Pendências humanas (fora do repositório):

1. Ver o run do SHA candidato e comparar a duração com `saidas/00-duracoes-antes.txt` (o ganho do cache só aparece do segundo run em diante). Validação humana prevista na etapa.
2. Os quatro PRs de prova reprovados (`uses` por tag, job sem `timeout-minutes`, sem `permissions`, com `pull_request_target`) e o passo de prova do `GITHUB_TOKEN` com `git push` recusado: precisam do GitHub; a prova local equivalente está em `saidas/02-prova-de-mordida.txt`.
3. Ruleset (E01): o nome do job "Testes, tipos e scripts" é o de hoje; o texto da E01 ainda cita "Testes, tipos e auditoria". Use o nome real. O job `demonstracao` não deve entrar no ruleset por causa do filtro de caminho.
