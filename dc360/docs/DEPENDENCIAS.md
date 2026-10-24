# Dependências: como entram, como sobem e em quanto tempo uma vulnerabilidade se resolve

Este documento é a política (V2-F01-E06). Quem a executa é o
`.github/dependabot.yml` (atualização por PR), o
`.github/workflows/auditoria-semanal.yml` (agenda semanal) e o portão
`npm run auditar` (`scripts/auditar.mjs`, com a lista nomeada em
`scripts/auditar-excecoes.mjs`). Se este texto e esses arquivos divergirem,
`node --test scripts/dependabot.test.mjs` fica vermelho.

## O que está decidido e o que é proposta

| Ponto | Situação | Onde está |
| --- | --- | --- |
| Vulnerabilidade em dependência de **runtime** (raiz e aplicativo de campo) reprova o portão | **Decidido** pelo Rafael, CP-03, 2026-10-07 | `scripts/auditar.mjs` |
| Vulnerabilidade em ferramenta de desenvolvimento aparece e não reprova | **Decidido**, CP-03 | `scripts/auditar.mjs` |
| Exceção só nomeada, com motivo, dono e prazo; prazo vencido reprova | **Decidido**, CP-03. Hoje: avisos do Expo no aplicativo, dono Rafael, prazo 2027-01-05 | `scripts/auditar-excecoes.mjs` |
| `npm audit fix` no aplicativo de campo descartado; a saída é subir o SDK do Expo por inteiro | **Decidido**, CP-03 | `scripts/auditar-excecoes.mjs` |
| Pacotes do Expo sobem só em grupo | **Decidido** (decisão do Rafael, registrada no pedido desta etapa) | `.github/dependabot.yml`, frente 2 |
| Prazos em dias por gravidade (tabela abaixo) | **PROPOSTA** da etapa, ainda sem decisão do Rafael. Vale como padrão de trabalho até ele confirmar ou trocar | esta página |

O CP-03 decidiu a regra (runtime reprova, o resto é aviso com exceção nomeada),
não números de dias. Os dias abaixo são a proposta do roadmap e estão marcados
como pendência humana.

## Prazo por situação

"Prazo" é o tempo entre o aviso aparecer (portão vermelho, alerta do GitHub ou
e-mail da auditoria semanal) e existir uma de duas saídas: a dependência
corrigida ou, quando a correção é inaplicável, uma exceção nomeada com motivo,
dono e prazo em `ACEITAS_NO_APLICATIVO` ou `ACEITAS_EM_DESENVOLVIMENTO`.

| Onde está a dependência | Gravidade | Prazo | Base |
| --- | --- | --- | --- |
| Runtime (raiz ou aplicativo de campo) | crítica ou alta | **7 dias** | Proposta. O portão fica vermelho até lá: nada novo é mesclado enquanto durar, a não ser a própria correção |
| Runtime | moderada | **30 dias** | Proposta. Mesmo vermelho, mesma regra |
| Runtime | baixa | **30 dias** | Proposta. O portão reprova qualquer gravidade em runtime, então baixa também trava |
| Ferramenta de desenvolvimento (teste, tipos, build, Expo CLI) | qualquer | **30 dias** para corrigir ou nomear exceção | Proposta. Não reprova o portão, aparece na saída |
| Exceção já nomeada (aplicativo de campo, avisos do Expo) | a aceita | até **2027-01-05** | Decidido (CP-03). Depois do prazo o portão reprova até alguém reavaliar |
| Advisory nova no mesmo pacote de uma exceção, ou exceção que mudou de gravidade | qualquer | trata-se como advisory nova | Decidido (CP-03): a exceção casa pelo id da advisory (GHSA) e pela gravidade aceita |

Regras que valem para todas as linhas:

- Quem decide o prazo não é quem está com pressa. Estender prazo é editar a
  linha da exceção (com motivo novo e data nova) num PR, nunca silenciar o
  portão, nunca `continue-on-error`.
- O portão nunca aprova sem ter auditado: registro fora do ar sai com código 2,
  não 0.
- Dependência de runtime vulnerável é bug, não pendência (CLAUDE.md).

## Como as atualizações chegam

O Dependabot abre PR toda segunda-feira de manhã (Brasília), em quatro frentes.
Cada PR passa pelos mesmos checks obrigatórios de qualquer outro. **Não há
auto-merge, em lugar nenhum**: uma pessoa lê o PR e mescla. PR de dependência é
vetor de cadeia de suprimentos.

| Frente | Pasta | O que sobe | Travas |
| --- | --- | --- | --- |
| npm, raiz do monorepo | `/dc360` | runtime em PR individual; ferramentas de desenvolvimento (minor e patch) em um PR só por semana | `cooldown` de 7 dias; no máximo 5 PRs abertos |
| npm, aplicativo de campo | `/dc360/apps/campo` | patch da família do SDK do Expo em **um** PR (`expo-sdk-patch`); o resto (jest, testing library, tipos) como na raiz | major e minor da família do Expo **ignorados** (abaixo); máximo 3 PRs |
| github-actions | `/` | minor e patch num PR só; major em PR próprio | respeita o SHA completo fixado pela E02 (o Dependabot atualiza o SHA e o comentário da versão juntos) |
| docker | `/dc360` | imagem base dos `Dockerfile` | major do `node` **ignorado**: subir de 22 para 24 é decisão de plataforma, com ADR |

`cooldown` de 7 dias atrasa versão recém-publicada, que é a janela em que
pacote sequestrado costuma ser detectado e retirado. Atualização de segurança
não espera o cooldown.

### O SDK do Expo sobe por inteiro, ou não sobe

`expo`, `react-native`, `react`, `react-dom`, os `expo-*`, `@expo/*`,
`react-native-*` (reanimated, worklets, maps, svg, screens, gesture-handler,
safe-area-context), `@react-native/*` e `jest-expo` são um conjunto: o SDK
declara a versão certa de cada um. Subir um sozinho mistura SDK 57 com 58 e
troca o binário nativo (foi exatamente o que descartou o `npm audit fix` no
CP-03). Por isso, no aplicativo de campo:

- **major e minor da família são ignorados** no Dependabot (os quatro nomeados na
  etapa, `expo`, `react-native`, `react-native-reanimated` e
  `react-native-worklets`, mais o resto da família);
- **patch da família sobe só em grupo**, num único PR. Quem recebe esse PR roda
  `npx expo install --check` (e `npx expo-doctor`) em `apps/campo` antes de
  mesclar;
- **subir o SDK** é trabalho planejado, feito à mão e de uma vez: `npx expo
  install expo@<sdk> --fix`, novo binário nativo (EAS), revisão da lista
  `ACEITAS_NO_APLICATIVO` (várias entradas saem com o SDK novo). Nenhum PR
  automático faz isso.

Limite conhecido: a configuração do Dependabot decide quais PRs de *versão*
abrem. Se um alerta de *segurança* cair num pacote da família, não conte com o
Dependabot para subir o SDK: o tratamento é este documento (exceção nomeada no
CP-03 ou subida planejada do SDK).

## Como se revisa um PR de dependência

1. Os checks obrigatórios estão verdes (inclui o job `dependencias`, que roda o
   `auditar`).
2. Leia o que mudou (notas de versão do pacote). Pacote de runtime que passou a
   pedir `postinstall` ou rede é motivo de recusa.
3. Major de pacote de runtime: ADR ou nota no PR dizendo o que mudou no produto.
4. Mescle. Sem auto-merge, sem atalho do ruleset.

## A agenda semanal

`.github/workflows/auditoria-semanal.yml` roda todas as segundas-feiras às
04:17 em Brasília e executa `node scripts/auditar.mjs`, a mesma política de
todo push. Existe porque advisory nova nasce em dia sem commit. Ela falha
quando:

- sai 1: há dependência de runtime vulnerável, exceção sem motivo, dono ou
  prazo, exceção vencida ou advisory nova em pacote já aceito;
- sai 2: o portão não conseguiu auditar (registro fora do ar, relatório sem
  contagem). Nunca é verde.

Também pode ser disparada à mão (`workflow_dispatch`). O GitHub só executa a
agenda a partir do ramo padrão: antes do merge desta fase, só a execução manual
vale.

## Imagens de contêiner: a varredura do Trivy (V2-F01-E20)

O `npm audit` só enxerga pacote do npm. A imagem de produção carrega também a
base `node:22-bookworm-slim`, o Chromium do Debian (que gera o PDF do laudo) e o
npm embutido na própria base. Por isso as duas imagens (API e console) são
varridas com o Trivy:

- **A cada pull request**, no job `imagens` do `verificar.yml`, logo depois de
  construir as imagens;
- **toda segunda-feira**, no segundo job de `auditoria-semanal.yml`, que constrói
  as imagens do ramo padrão e as varre, porque CVE nasce em dia sem commit.

A régua é a mesma nos dois lugares, e mora num script só
(`dc360/scripts/varrer-imagem.sh`): CRITICAL ou HIGH **com correção publicada**
(`--ignore-unfixed`) reprova, e segredo dentro da imagem (um `.env` ou uma chave
que entrou por `COPY`) também. O Trivy é baixado numa versão fixa e o SHA-256 do
pacote é conferido antes de extrair. Subir a versão é trocar `TRIVY_VERSAO` e
`TRIVY_SHA256` juntos, com o hash do arquivo `checksums.txt` do release.

**Como se trata um achado.** Primeiro se corrige: subir a base (o Dependabot
propõe a troca de tag e digest) ou o pacote. Só quando não dá, se escreve uma
exceção no `.trivyignore` da raiz, uma linha por identificador:

```
CVE-AAAA-NNNN exp:AAAA-MM-DD # motivo: <por que não dá agora>; dono: <quem responde>
```

Sem motivo, sem dono, sem prazo, com prazo de mais de 366 dias, vencida ou
repetida, o teste `excecoes-de-seguranca.test.mjs` reprova (roda no
`npm run test:scripts`). A data do `exp:` é o primeiro dia **sem** exceção: o
próprio Trivy volta a reprovar nesse dia. Atenção: a exceção vale para o
identificador na imagem inteira, não por caminho. Antes de renovar, confira na
tabela do artefato (`trivy/api.txt`, `trivy/console.txt`) em que caminho o
achado está.

O relatório de cada imagem sai no artefato do run em tabela, JSON e SARIF. O
SARIF não é enviado ao code scanning: isso pede `security-events: write` no job,
e nenhum workflow deste repositório tem escrita. É decisão do Rafael.

## Fora desta etapa

Renovate; inventário de componentes (SBOM) e licenças (E19); lint de Dockerfile; DAST; troca de SDK do
Expo; correção das advisories atuais (F00-E19); auto-merge.

A imagem `postgis/postgis` do `compose.yaml` e a pasta `docs/relatorios-v2/site`
(sem lockfile) não estão no Dependabot: banco exige plano de migração, e o site
de relatórios não é produto.
