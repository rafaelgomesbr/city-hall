# V2-F01-E13: perfil EAS de HML com bundle ids distintos (a parte que não depende do CP-04)

## Fatos

**Escopo desta rodada:** identidade por perfil no `app.config.ts`, URL de HML real no `eas.json`, `APNS_BUNDLE` e
`APNS_AMBIENTE` no `fly.hml.toml` e o teste que prende tudo. Ficam FORA, por serem do CP-04 ou ação externa: o valor
final do identificador-base, as contas Apple, Google e Expo, o App ID da Apple, o cliente Android de HML no Firebase,
build real, envio às lojas e push real (F14-E05).

**O que mudou (em `dc360/`):**

- `apps/campo/app.config.ts`: o identificador-base é UMA constante provisória (`IDENTIFICADOR_BASE`,
  `com.solerte.dc360.campo`, sem mudança de valor). Com `EAS_BUILD_PROFILE=homologacao`, `ios.bundleIdentifier` e
  `android.package` viram o base mais `.hml`, o nome vira "DC360 HML" e o esquema de link `dc360-hml` (dois aplicativos
  com `dc360://` brigariam). Perfis `producao`, `desenvolvimento` e fora do EAS resolvem exatamente o que resolviam.
  Nada além de configuração foi tocado no app.
- `apps/campo/eas.json`: `homologacao` deixa de apontar para `api-homologacao.exemplo.gov.br` e aponta para
  `https://defesa-civil-hml.fly.dev`, que é `https://<app>.fly.dev` do `app` de `fly.hml.toml` (a mesma regra do endereço
  de PROD, `defesa-civil.fly.dev`). Não foi inventado domínio: o domínio próprio de HML segue marcador até o CP-05.
  Canal próprio e `distribution: internal` já existiam e foram mantidos.
- `fly.hml.toml`: `APNS_BUNDLE = "com.solerte.dc360.campo.hml"` (é o `apns-topic`) e `APNS_AMBIENTE = "teste"`.
  `PUSH_ATIVO` continua `nao`, e nenhum segredo de push de PROD entrou.
- `scripts/perfis-do-eas.test.mjs` (novo, 17 casos): roda o `app.config.ts` DE VERDADE com cada perfil (outro processo,
  `--experimental-strip-types`) e confere bundle, pacote, nome, esquema e `pushAmbiente`; bundle de HML diferente do de
  PROD e do de desenvolvimento; PROD, desenvolvimento e fora do EAS inalterados; URL de HML do `eas.json` igual à
  derivada do `fly.hml.toml` e concordando com `ambientes.json` quando ele declarar o app; só `producao` com a URL de
  PROD; zero endereço de exemplo; `APNS_BUNDLE` e `APNS_AMBIENTE` dos dois toml; `google-services.json` com o cliente de
  PROD e sem pacote desconhecido; e 6 negativos (sintéticos e sobre uma cópia estragada do `app.config.ts`).
- `apps/api/test/fly-hml.test.ts`: UMA asserção trocada. Ela dizia que `APNS_BUNDLE` não podia existir no toml de HML
  (E11, antes de a E13 declarar a identidade de HML); agora exige que seja diferente do de PROD e que `APNS_AMBIENTE`
  seja `teste`. Sem esta troca o `fly-hml.test.ts` quebrava com a própria mudança pedida pela etapa.
- `scripts/baseline.mjs`: `V2-F01-E13: 17` nas duas tabelas (total do `test-scripts` de 678 para 695).
- `apps/campo/LOJAS.md` (o perfil deixa de ser inutilizável e a tabela de identificadores ganha HML) e
  `docs/AMBIENTES.md` (seção 12, tabela de perfil, bundle e endereço, e a seção 9 deixou de dizer que o perfil é da E13).

**Testes (ver `saidas/`):**

- `node --test scripts/perfis-do-eas.test.mjs`: 17 de 17 (`saidas/01-perfis-do-eas.txt`).
- Prova de mordida nos arquivos REAIS (`saidas/02-prova-de-mordida.txt`): HML na URL de PROD reprova 2 casos; sufixo
  vazio (bundle de HML igual ao de PROD) reprova 3; endereço de exemplo de volta reprova 3; `APNS_BUNDLE` de HML
  diferente do bundle reprova 1. Restaurado, 17 de 17.
- `npm run conferir:numeros`: o roteiro e a árvore concordam (`saidas/03-conferir-numeros.txt`); regras de conteúdo
  (sem travessão, sem norma inventada) 10 de 10 (`saidas/04-regras-de-conteudo.txt`).
- `npm run test:campo`: tipos limpos e 1997 de 1997, e o jest concorda com a contagem do código
  (`saidas/05-test-campo.txt`).
- `npm run test:api`: 115 arquivos, 1864 aprovados, 34 pulados (os mesmos de antes), 0 falhas (`saidas/06-test-api.txt`).
  `npm run test:console`: 338 de 338. `fly-hml.test.ts` do console: 4 de 4.
- `node --test scripts/baseline.test.mjs`: 29 de 29 (`saidas/07-baseline-test.txt`).
- `npm run test:scripts`: ver `saidas/08-test-scripts.txt`.
- Portões de qualidade: `npm run lint` (monorepo e aplicativo), `npm run lint:teto` e `npm run formato:conferir` verdes
  (`saidas/09-lint-e-formato.txt`).

**O que esta rodada NÃO prova:** que o perfil gera um binário. Sem build, sem conta Expo e sem aparelho antes do CP-04.
A prova em aparelho (os dois aplicativos instalados juntos, o de HML falando só com a API de HML e a conta de PROD
recebendo 401 lá) é F14-E12. O caso "login com conta de PROD na API de HML recebe 401" depende do ambiente de HML de pé
(CP-05) e não foi exercido.

## Para o orquestrador

**Linha sugerida para o STATUS:** `V2-F01-E13 | IMPLEMENTADA (candidato) | perfil homologacao com bundle .hml, nome e
esquema próprios, URL de HML vinda do fly.hml.toml, APNS_BUNDLE/APNS_AMBIENTE no toml de HML, perfis-do-eas.test.mjs (17)
| falta: cliente Android de HML no Firebase, identificador final e contas (CP-04), prova em aparelho (F14-E12)`.

**Pendências humanas (Rafael, fora do repositório):**

1. Criar no console do Firebase (projeto `defesa-civil-360`) o app Android `com.solerte.dc360.campo.hml` e baixar o
   `google-services.json` NOVO, com os DOIS clientes (o de PROD e o de HML), substituindo o do repositório. Sem isso o
   primeiro build de HML para no Gradle com "No matching client found for package name". O teste imprime a pendência
   enquanto o cliente não existe.
2. No portal da Apple, criar o App ID `com.solerte.dc360.campo.hml` (com Push Notifications) e, se o mapa do Google
   for usado em HML, restringir a chave ao novo identificador (iOS e Android).
3. CP-04: o valor final do identificador-base (hoje provisório) e as contas Apple, Google Play e Expo (`eas init`,
   `EAS_PROJECT_ID`). Ao trocar a constante, trocar junto o `APNS_BUNDLE` de `fly.toml` e `fly.hml.toml`; o teste cobra.
4. CP-05: quando o app do Fly de HML for criado e o nome mudar, mudar juntos `fly.hml.toml`, `scripts/ambientes.json`
   (`appsNoFly.api`) e a URL do perfil em `eas.json`; o teste reprova se um ficar para trás.

**Riscos:** (a) o teste carrega o `app.config.ts` com `--experimental-strip-types`; no Node 22.17 isso exige a flag
(já passada) e em 24 não precisa, e um `app.config.ts` que passe a usar sintaxe TypeScript não apagável (enum,
namespace) quebraria o teste, de propósito barulhento. (b) A URL de HML é a do endereço padrão do Fly; se o CP-05
escolher outro nome ou domínio próprio, a URL do perfil muda no mesmo commit. (c) A troca de uma asserção em
`apps/api/test/fly-hml.test.ts` está fora de `apps/campo`, mas é consequência direta da etapa.
