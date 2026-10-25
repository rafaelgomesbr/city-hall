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

O Dependabot abre PR toda segunda-feira de manhã (Brasília), em seis frentes.
Cada PR passa pelos mesmos checks obrigatórios de qualquer outro. **Não há
auto-merge, em lugar nenhum**: uma pessoa lê o PR e mescla. PR de dependência é
vetor de cadeia de suprimentos.

| Frente | Pasta | O que sobe | Travas |
| --- | --- | --- | --- |
| npm, raiz do monorepo | `/dc360` | runtime em PR individual; ferramentas de desenvolvimento (minor e patch) em um PR só por semana | `cooldown` de 7 dias; no máximo 5 PRs abertos |
| npm, aplicativo de campo | `/dc360/apps/campo` | patch da família do SDK do Expo em **um** PR (`expo-sdk-patch`); o resto (jest, testing library, tipos) como na raiz | major e minor da família do Expo **ignorados** (abaixo); máximo 3 PRs |
| github-actions | `/` | minor e patch num PR só; major em PR próprio | respeita o SHA completo fixado pela E02 (o Dependabot atualiza o SHA e o comentário da versão juntos) |
| docker | `/dc360` | imagem base dos `Dockerfile` | major do `node` **ignorado**: subir de 22 para 24 é decisão de plataforma, com ADR |
| docker-compose | `/dc360` | imagem do Postgres/PostGIS do `compose.yaml` (tag e digest juntos) | major do `postgis/postgis` **ignorado**: trocar a versão do banco exige plano de migração |
| npm, gerador de SBOM | `/dc360/scripts/sbom-gerador` | o lockfile próprio do `cyclonedx-npm` (DV-27); cada subida é PR próprio | no máximo 2 PRs; a versão do `sbom.yml` muda junto (o teste confere) |

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
exceção no `.trivyignore.yaml` da raiz, uma entrada por identificador:

```yaml
vulnerabilities:
  - id: CVE-AAAA-NNNN
    paths:
      - "usr/local/lib/node_modules/npm/**"
    statement: "motivo: <por que não dá agora>; dono: <quem responde>"
    expired_at: AAAA-MM-DD
```

A exceção vale por **caminho** (DV-22): `paths` é o arquivo do pacote afetado, e
só o npm embutido na imagem base (`usr/local/lib/node_modules/npm/`) é aceito. A
mesma CVE num pacote do app (`app/node_modules/...`) continua reprovando. Sem
motivo, sem dono, sem prazo, sem caminho, com prazo de mais de 366 dias, vencida
ou repetida, o teste `excecoes-de-seguranca.test.mjs` reprova (roda no
`npm run test:scripts`). A data do `expired_at` é o primeiro dia **sem**
exceção: o próprio Trivy volta a reprovar nesse dia. Para perdoar outro lugar da
imagem, a política e o teste mudam juntos, de propósito.

O relatório de cada imagem sai no artefato do run em tabela, JSON e SARIF. O
SARIF não é enviado ao code scanning: isso pede `security-events: write` no job,
e nenhum workflow deste repositório tem escrita. É decisão do Rafael.

## Licenças e inventário (SBOM) por release (V2-F01-E19)

Duas coisas diferentes, que respondem a perguntas diferentes.

### As licenças das dependências de produção

`node scripts/licencas.mjs` lê os dois lockfiles (`package-lock.json` e
`apps/campo/package-lock.json`), pega tudo que o npm não marca como `dev` e
compara a licença de cada componente com `politica-de-licencas.json`. Roda no
job `produto` do `verificar.yml` (passo "Licenças das dependências de produção"),
sem `npm ci`, e o teste dele (`scripts/licencas.test.mjs`) roda no
`npm run test:scripts`.

| Ponto | Situação |
| --- | --- |
| Permitidas: MIT, ISC, BSD-2-Clause, BSD-3-Clause, Apache-2.0, 0BSD, CC0-1.0, OFL-1.1. Proibidas: AGPL, GPL, SSPL e componente sem licença. | **PROPOSTA** do roadmap. É o **CP-43**, que o Rafael decide com o jurídico. **Aberto.** |
| Enquanto o CP-43 estiver aberto (`decisao.status: "proposta"`), a conferência **só avisa**: anotação no run e a lista no artefato `produto-<sha>`, código de saída 0 | Decidido pelo roadmap (sem a lista, só avisa) |
| Defeito do arquivo de política, exceção vencida ou sem motivo, dono e prazo, exceção que não casa com nenhum componente, lockfile ilegível ou vazio | **Reprova desde já**, nos dois estados |
| Licença proibida, sem licença ou fora das duas listas | Aviso hoje; **reprova** quando `decisao.status` for `"decidida"` (com `decidida_por` e `decidida_em`) |

Expressões SPDX: `MIT OR Apache-2.0` passa se uma alternativa passa (quem usa
escolhe), `MIT AND Apache-2.0` só passa se as duas passam, e `GPL-2.0 WITH
Classpath-exception-2.0` vale pela licença base. "Fora das duas listas" reprova
depois da decisão: a saída é listar a licença em `permitidas`, em `proibidas` ou
numa exceção.

**Exceção.** Uma entrada em `excecoes`, por pacote **e versão exata**, com
`motivo` (mínimo 20 caracteres), `dono` e `ate` (AAAA-MM-DD, no máximo 366 dias):
a mesma régua das exceções de SAST e do Trivy. Versão nova do pacote volta a ser
conferida. Exceção desnecessária (a licença já é permitida) ou órfã (o pacote
saiu) também reprova, para a lista não virar tapete. Hoje há uma: `exit@0.1.2`,
que declara a licença MIT no formato antigo (`licenses`) que o lockfile não copia.

**O que a primeira leitura mostrou** (2026-10-24, lista proposta): nenhum
componente proibido nem sem licença; 22 componentes do aplicativo de campo ficam
fora da lista e são o que o CP-43 precisa decidir: BlueOak-1.0.0 (6, ex.: `glob`,
`minimatch`), MPL-2.0 (12, a família `lightningcss`), Unlicense (2), CC-BY-4.0
(`caniuse-lite`, dados) e Python-2.0 (`argparse`). `node-forge` é
`(BSD-3-Clause OR GPL-2.0)` e passa pela alternativa BSD. A conferência conta
`devOptional` como produção (é o que `npm ci --omit=dev` ainda instala quando o
opcional casa com a plataforma), então inclui ferramentas de teste do Expo que
não vão no pacote do telefone: é a leitura conservadora.

### O SBOM por release

`.github/workflows/sbom.yml` roda em toda tag `vX.Y.Z` e `campo-vX.Y.Z` (e à mão,
por `workflow_dispatch`, que só guarda artefatos). Gera quatro inventários
CycloneDX 1.6, anexa ao Release da tag junto com `SHA256SUMS.txt`:

| Arquivo | O que descreve | Como |
| --- | --- | --- |
| `sbom-<tag>-npm-plataforma.cdx.json` | dependências de produção do monorepo | `@cyclonedx/cyclonedx-npm` em versão fixa, sobre o lockfile |
| `sbom-<tag>-npm-campo.cdx.json` | dependências de produção do aplicativo de campo | idem |
| `sbom-<tag>-imagem-api.cdx.json` | pacotes DENTRO da imagem da API (Debian, Chromium, npm) | o mesmo Trivy fixo da E20 |
| `sbom-<tag>-imagem-console.cdx.json` | idem, imagem do console | idem |

Para conferir um arquivo baixado: `sha256sum --check SHA256SUMS.txt`.

- **Escrita só no job `publicar`**, que só roda em tag (`contents: write`). O
  topo e os jobs que geram só leem; `scripts/sbom.test.mjs` reprova qualquer
  outra escrita.
- **Release como rascunho.** O repositório é público e o SBOM lista versões de
  dependência. Se o Release da tag ainda não existe, o `scripts/publicar-sbom.sh`
  o cria como rascunho (visível só a quem tem acesso de escrita); publicar é
  decisão do Rafael.
- **Nada pela metade.** Faltando um dos quatro, ou com um deles vazio, nada é
  anexado (`scripts/conferir-sbom.mjs`).
- **Reprodutível.** Sem timestamp nem número de série (`--output-reproducible`):
  o mesmo lockfile dá o mesmo arquivo, e o SHA-256 só muda quando a árvore muda.
- **O gerador também é travado (DV-27).** O `cyclonedx-npm` e todas as
  dependências transitivas dele vêm do lockfile de `dc360/scripts/sbom-gerador/`
  (`npm ci --ignore-scripts`, com `integrity`), e não de um `npm exec` que
  resolvia as transitivas na hora. Subir o gerador é trocar a versão em três
  lugares (`CYCLONEDX_NPM_VERSAO` no `sbom.yml`, o `package.json` e o lockfile
  dele), o que o `scripts/sbom.test.mjs` confere. A pasta tem frente própria no
  Dependabot. Ela não está no `npm run auditar` (que cobre a raiz e o aplicativo):
  o gerador não roda no produto, só na hora do release.
- **Limite que fica.** O SBOM do aplicativo (667 componentes) tem menos itens que a
  conferência de licença (731): o gerador usa `npm ls --omit dev`, que exclui
  `devOptional`, e a licença conta `devOptional` como produção (leitura
  conservadora). A diferença é de critério, não de perda.
- Fica para a F25: assinar o SBOM. Fica na E20: varrer vulnerabilidade da imagem.

## Fora desta etapa

Renovate; lint de Dockerfile; DAST; assinatura do SBOM (F25); troca de SDK do
Expo; correção das advisories atuais (F00-E19); auto-merge.

A pasta `docs/relatorios-v2/site` (sem lockfile) não está no Dependabot: o site
de relatórios não é produto. A imagem `postgis/postgis` do `compose.yaml` está
(frente `docker-compose`, DV-18), com o major ignorado: o banco exige plano de
migração para trocar de versão.
