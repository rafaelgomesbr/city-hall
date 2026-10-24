# V2-F01-E06: Dependências, Dependabot e política de atualização

## Fatos

### O que mudou

- `.github/dependabot.yml` (novo): quatro frentes, todas semanais (segunda, 06:00 de Brasília), `cooldown` de 7 dias, sem auto-merge.
  - `npm` em `/dc360` (máximo 5 PRs; ferramentas de desenvolvimento minor e patch em um grupo só).
  - `npm` em `/dc360/apps/campo` (máximo 3 PRs). `ignore` de major e minor para `expo`, `react-native`, `react-native-reanimated` e `react-native-worklets` (os quatro da etapa) e para o resto da família do SDK (`expo-*`, `@expo/*`, `react-native-*`, `@react-native/*`, `jest-expo`, `react`, `react-dom`). Patch da família só no grupo `expo-sdk-patch` (um PR).
  - `github-actions` em `/` (minor e patch em um grupo).
  - `docker` em `/dc360` (`Dockerfile` e `Dockerfile.console`); major do `node` ignorado.
- `.github/workflows/auditoria-semanal.yml` (novo): `schedule` segunda 07:17 UTC e `workflow_dispatch`; `permissions: contents: read`; `runs-on: ubuntu-24.04`; `timeout-minutes: 15`; `checkout`, `setup-node` e `upload-artifact` fixados por SHA completo com a versão em comentário (v4.4.0, v4.4.0, v4.6.2; SHAs lidos com `git ls-remote` em 2026-10-24). Roda `node scripts/auditar.mjs` (a política do CP-03, a mesma do job `dependencias` de `verificar.yml`), sem `continue-on-error` e sem `|| true`. Não tem gatilho de PR nem permissão de escrita.
- `dc360/docs/DEPENDENCIAS.md` (novo): o que é decidido (CP-03) e o que é proposta; prazo por situação; como cada PR chega e é revisado; por que o SDK do Expo sobe por inteiro; a agenda semanal.
- `dc360/scripts/dependabot.test.mjs` (novo, 12 casos) e uma linha em `dc360/scripts/baseline.mjs` (`V2-F01-E06: 12`, mais o arquivo na tabela de arquivos por etapa).
- `dc360/README.md`: parágrafo "Atualização de dependências e auditoria agendada" ao lado da política do CP-03.
- Não foram tocados: `dc360/package.json`, `verificar.yml`, `demonstracao.yml`, `CODEOWNERS`, `CLAUDE.md`, STATUS, ESTADO-ATUAL, pendências, dívidas.

### Comandos e resultados (saídas em `saidas/`)

| Arquivo | Comando | Resultado |
| --- | --- | --- |
| `01-dependabot-test.txt` | `node --test scripts/dependabot.test.mjs` | 12 de 12, código 0 |
| `02-regras-de-conteudo.txt` | `npx vitest run --root packages/shared test/regras-de-conteudo.test.ts` | 10 de 10, código 0 (uma primeira rodada reprovou por um travessão que eu tinha escrito no teste; corrigido e repetido) |
| `03-dependabot-test-SEM-O-IGNORE-DO-EXPO.txt` | o mesmo teste, com a regra `ignore` do `expo` apagada de `dependabot.yml` (arquivo restaurado em seguida) | 10 de 12, 2 falhas (`expo: major não está ignorado`, `expo: minor não está ignorado`), código 1: é a prova de que o teste morde |
| `04-auditar.txt` | `node scripts/auditar.mjs` | código 1, ver "Vermelho que não é desta etapa" |
| `05-test-scripts.txt` | `npm run test:scripts` | 365 testes, 360 ok, 4 pulados, 1 falha; a falha é `conferir-indices-de-evidencia: a evidência real`, porque esta pasta ainda não tinha `INDEX.md` na hora da rodada. Repetida depois do `INDEX.md`: verde (linha abaixo) |
| `06-conferir-numeros.txt` | `npm run conferir:numeros` | "Todos os números da documentação batem com a realidade", código 0 |
| `07-baseline-test.txt` | `node --test scripts/baseline.test.mjs` | 29 de 29, código 0 |
| `08-test-scripts-com-index.txt` | `npm run test:scripts` com o `INDEX.md` presente | 365 testes, 361 ok, 4 pulados, 0 falhas, código 0 |

Contagem de `scripts/`: 353 antes, 365 depois (12 casos novos). Não há número desse total no README nem no `COLOCAR-DE-PE.md` para atualizar (o `conferir:numeros` confere e passa).

### Vermelho que não é desta etapa

`node scripts/auditar.mjs` sai 1 hoje (2026-10-24): `npm audit --omit=dev` na raiz acusa 3 avisos em dependência de runtime que não existiam quando a F00 fechou, a saber `fast-uri` (moderada, 4 avisos), `fastify` 5.12.2 a 5.12.5 (baixa) e `zod` abaixo de 4.6.6 (alta, GHSA-mrhx-c7xc-m3w5, correção com salto de versão). Esta etapa não toca `package.json` nem `package-lock.json` (e a etapa proíbe corrigir advisory atual). Efeito prático: o job `dependencias` de `verificar.yml` e a primeira execução da auditoria semanal ficam vermelhos até alguém atualizar essas três dependências. É exatamente o caso que a auditoria agendada existe para pegar.

### Limitações

- O Dependabot e o `schedule` só agem a partir do ramo padrão: nada disto foi exercitado de verdade ainda. Não há PR automático para mostrar. A prova desta etapa é a configuração, o teste de configuração e a execução manual do workflow depois do merge.
- O YAML dos dois arquivos foi lido com `ruby -ryaml` (sintaxe válida, `updates` com os quatro pares ecossistema e pasta esperados). O Dependabot não foi consultado: não há validador offline dele.
- O teste lê o YAML por blocos de texto (não há biblioteca de YAML no repositório); se alguém reformatar o arquivo de outro jeito, o teste reclama em vez de passar em falso.
- O workflow `auditoria-semanal.yml` não foi executado no GitHub (nada foi enviado). Os comandos dos passos são os mesmos do job `dependencias`, que roda em CI.
- Que o Dependabot encontre `Dockerfile.console` com `directory: /dc360` não foi confirmado; confira na aba Insights, Dependency graph, Dependabot depois da ligação.
- Atualização de segurança do Dependabot pode ou não respeitar o `ignore` do Expo; o documento diz para não contar com isso.

## Justificativa

- Família do Expo inteira no `ignore`, e não só os quatro nomeados: os `expo-*`, o `react` e o `react-native-*` têm versão atrelada ao SDK (`~57.x`), e um PR de minor em `expo-router` sozinho reproduz a mistura de SDK 57 com 58 que o CP-03 descartou. A decisão "pacotes do Expo sobem só em grupo" fica inteira: patch em um PR (`expo-sdk-patch`), major e minor só na subida planejada do SDK.
- Prazos em dias marcados como PROPOSTA: o CP-03 decidiu a regra (runtime reprova, desenvolvimento avisa, exceção nomeada com dono e prazo, hoje 2027-01-05), não números de dias. Os 7 e 30 dias vêm do roadmap e ficam como padrão de trabalho até o Rafael confirmar. Escrever como decidido seria inventar uma decisão.
- Major do `node` ignorado no Docker e Postgres/PostGIS fora do Dependabot: ambos pedem plano de migração ou ADR, não PR de rotina.
- `cooldown` de 7 dias: reduz a janela de pacote recém-publicado sequestrado, e a atualização de segurança não espera.
- O workflow chama o `auditar` pelo `node`, com a guarda de `.npmrc` versionado, como o CI faz, para nenhuma configuração do npm decidir se o portão roda. Roda às 07:17 UTC por evitar o topo da hora e a agenda do `verificar` (09:00 UTC).
- Sem biblioteca de YAML no teste de propósito: a raiz do repositório não instala nada e o teste precisa rodar em `test:scripts` sem dependência nova.

## Para o orquestrador

Linha do STATUS sugerida:

`| V2-F01-E06 | Dependências: Dependabot e política de atualização | S | P1 | IMPLEMENTADA | Candidato <sha7>. Dependabot em quatro frentes (npm raiz, npm campo, github-actions, docker) com ignore de major e minor da família do Expo e patch só em grupo; auditoria semanal (agenda e manual) chamando o portão do CP-03; DEPENDENCIAS.md com prazos marcados como PROPOSTA. 12 testes novos em scripts/dependabot.test.mjs (baseline V2-F01-E06: 12). Nada exercitado no GitHub ainda (precisa do ramo padrão). auditar sai 1 hoje por fast-uri, fastify e zod na raiz (não é desta etapa). |`

Pendências humanas (o Rafael faz fora do repositório):

1. Ligar no GitHub: Settings, Code security, "Dependabot alerts" e, se quiser, "Dependabot security updates" (o `dependabot.yml` cuida das atualizações de versão; os alertas são ligação à parte).
2. Confirmar ou trocar os prazos propostos em `dc360/docs/DEPENDENCIAS.md` (runtime crítica ou alta 7 dias; moderada e baixa 30 dias; desenvolvimento 30 dias). Registrar como PREMISSA na seção 9 do STATUS até haver resposta.
3. Depois do merge no ramo padrão: disparar `Auditoria semanal` à mão (Actions, Run workflow) e conferir os primeiros PRs do Dependabot (validação humana prevista na etapa). Conferir em Insights, Dependency graph, Dependabot que `Dockerfile.console` foi encontrado.
4. Notificação: confirmar em Settings, Notifications, Actions que falha de workflow agendado chega por e-mail para quem deve agir.
5. Decisão a tomar fora desta etapa: atualizar `fast-uri`, `fastify` e `zod` (a pasta de advisories atuais é da F00-E19 e de correção de dependência); sem isso o job `dependencias` fica vermelho.
