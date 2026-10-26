# V2-F00-E19, correção 8: a configuração do npm passa por uma lista permitida, e o lockfile é sempre o que se audita

Defeito de origem: validação da rodada 7, QA, sobre `fd17ff4` (`docs/evidencias-v2/G00/V2-F00-E19/validacao/fd17ff4/qa.md`, achado 1 bloqueante e anotados 2 e 3). Feita sobre `f37bdac`, no ramo `trab/correcao-7`. macOS arm64, Node 24.15.0, npm 11.12.1 e, em `saidas/05-npm-10.txt`, npm 10.9.2 (o do Node 22 do CI), com rede.

## Fatos

- **Antes (`saidas/02-copias-ANTES.txt`):** cópias do `dc360` por `git archive` (sem `node_modules`, como o job do CI), com `fast-uri` 3.0.1 (advisory alta, runtime) plantado no `package-lock.json` da raiz, e o portão de `f37bdac`:
  - `package-lock=false` no `.npmrc` da raiz: **0, "Runtime limpo"** (o achado 1 da rodada 7, reproduzido).
  - `before=2020-01-01` no `.npmrc` da raiz, `omit=dev` no npmrc global (por `prefix`), no do usuário (`HOME` falso) e em `npm_config_omit`: 1. Davam o resultado certo, mas nenhuma regra conferia essas chaves.
  - Uma dependência direta na raiz (`@electric-sql/pglite`): **2**, mas só por acaso (o canário do desenvolvimento sumiu); o runtime saía 0.
- **Defeito novo achado nesta correção (`saidas/04-workspaces-false-esconde-runtime.txt`):** a bandeira `--workspaces=false` que a correção 7 pôs em toda chamada faz o npm aplicar `excludeWorkspacesDependencySet`: ele audita só o que a RAIZ declara. Hoje a raiz não declara dependência nenhuma, o filtro sai vazio e não filtra nada; com uma dependência direta na raiz, o `npm audit --omit=dev` real dá `total=0` com a bandeira e `total=1 (fast-uri)` sem ela. É a mesma classe de verde falso, então a bandeira saiu.
- **O que mudou** (`diff-da-correcao.patch`: `dc360/scripts/auditar.mjs`, `auditar-excecoes.mjs`, `auditar.test.mjs` e o parágrafo do `auditar` no `README.md`; o trecho de outra pessoa no README, perto da linha 1338, ficou fora):
  1. **Lista permitida de chaves (`CHAVES_PERMITIDAS`).** Antes de qualquer auditoria, para a raiz e para o aplicativo, o portão junta três leituras:
     - `npm config list`, rodado com o mesmo ambiente das auditorias. É o próprio npm dizendo, por fonte, o que carregou: npmrc embutido, global, do usuário, do projeto e ambiente.
     - O `.npmrc` do projeto, lido do disco.
     - As `npm_config_*` que sobram no ambiente.
     Qualquer chave fora da lista sai **2**, com o nome e a origem (fonte e arquivo, ou nome da variável). O npm também tem de confirmar a pasta como projeto (`npm local prefix`, comparado pelo caminho real); se não confirmar, ou se o `npm config list` falhar, sai 2.
  2. **As chaves permitidas, e por quê:**
     - Só mexem no terminal: `loglevel`, `color`, `progress`, `fund`, `update-notifier`.
     - Pastas que não entram no que o `npm audit` olha: `cache`, porque a consulta vai com `--prefer-online`; e `prefix`, cujo npmrc global também é lido e conferido.
     - A credencial do registro oficial: `//registry.npmjs.org/:_authToken`.
     - As que toda chamada anula na linha de comando, que vence a configuração: `registry`, `offline`, `prefer-offline`, `prefer-online`, `dry-run`, `package-lock`, `package-lock-only`, `audit-level`, `json`.
     - `workspace`, `workspaces`, `include-workspace-root`, `omit`, `include`, `before`, os de proxy e `global` ficaram de fora (um teste confere isso).
     - Prova com o npm real (`saidas/03-copias-DEPOIS.txt`, variante `permitidas`): todas as chaves permitidas no `.npmrc` da raiz em valor hostil (`registry=http://127.0.0.1:9/`, `offline=true`, `package-lock=false`, `package-lock-only=true`, `audit-level=critical`, `json=false`, `cache` e `prefix` em pastas falsas, entre outras), e o runtime plantado continua saindo **1**. A credencial falsa também dá 1.
  3. **`--package-lock=true` em toda chamada** e **`--package-lock-only=false` nas três consultas reais**. A de controle continua com `--package-lock-only`.
  4. **As variáveis que o `npm run` exporta para o script saem do ambiente das chamadas:** `cache`, `global-prefix`, `globalconfig`, `init-module`, `local-prefix`, `node-gyp`, `noproxy`, `npm-version`, `prefix`, `user-agent`, `userconfig`, além das de workspace da correção 7. Sem elas o npm usa os próprios padrões, e são esses os arquivos que o `npm config list` mostra e o portão confere.
  5. **`--workspaces=false` saiu** (ver acima). O filtro por workspace fica fechado de outro jeito:
     - `cwd` fixo, da correção 7;
     - variáveis de workspace anuladas;
     - `workspace`, `workspaces` e `include-workspace-root` recusados em qualquer `.npmrc`;
     - o npm tem de confirmar a pasta do projeto.
  6. **Prazo no fuso de São Paulo** (anotado 3): `hojeEmSaoPaulo()` (Intl, `America/Sao_Paulo`) no lugar de `toISOString()`. Às 22h do dia 5 no Brasil (01h UTC do dia 6), a data ainda é o dia 5.
  7. **README:** o parágrafo do `auditar` diz:
     - como funciona a lista, quais chaves ela permite e por que a `--workspaces=false` saiu;
     - que o prazo vale no fuso de São Paulo;
     - o que continua fora do alcance: npm falso no `PATH`, proxy que reescreve só a advisory nova, as variáveis de proxy do sistema (`HTTPS_PROXY` não é configuração do npm) e as listas de aceitas vazias;
     - o anotado 2: um lockfile adulterado com `dev: true` num pacote de runtime passa, porque o portão confia na marca, e o `npm ci --omit=dev` do Dockerfile também não instala o pacote.
- **Depois (`saidas/03-copias-DEPOIS.txt`, as mesmas variantes):**

  | Variante | Antes | Depois |
  | --- | --- | --- |
  | `plantada` | 1 | 1 |
  | `plock` (`package-lock=false`) | **0** | **1** |
  | `raiz-com-dep` | 2 (por acaso) | **1** (o runtime aparece) |
  | `proibida` (`before`) | 1 | 2, "before (de project ...)" |
  | `permitidas` | 1 | 1 |
  | `credencial` | 1 | 1 |
  | `global` (`omit=dev` no npmrc global) | 1 | 2, com o arquivo |
  | `usuario` (`omit=dev` no `~/.npmrc`) | 1 | 2, com o arquivo |
  | `env-proibida` (`npm_config_omit=dev`) | 1 | 2 |
  | `env-permitida` (`npm_config_package_lock=false`, `NPM_CONFIG_OFFLINE=true`, `npm_config_userconfig` anulada) | 2 | 1 |

  Com o npm 10.9.2 (`saidas/05-npm-10.txt`): `plock` dá 1, `proibida` dá 2, e a árvore do worktree dá 0. O formato do `npm config list` é o mesmo nas duas versões.
- **Testes (`saidas/07-testes-auditar-DEPOIS.txt`):** 70 de 70. Em `f37bdac` eram 58 (`saidas/01-testes-auditar-ANTES.txt`): **12 casos novos**. Os de ponta a ponta:
  - `package-lock=false` no `.npmrc` anulado, com o runtime reprovando;
  - chave proibida no `.npmrc` da raiz, em 8 formas, saindo 2 antes de auditar;
  - chave proibida no `.npmrc` do aplicativo;
  - `npm_config_*` proibida, em qualquer caixa;
  - as variáveis do `npm run` anuladas e as permitidas passando;
  - chave que só o npm conhece (usuário e global);
  - `npm config list` que falha, sem prefixo ou com outro prefixo.

  Os de regra pura: `chavesDoNpmrc`, `lerNpmConfigList` (formato do npm 10 e 11), `normalizarChave` com `chavesProibidas`, `hojeEmSaoPaulo` e `ambienteDaConsulta`. Dois testes mudaram: o das bandeiras agora exige `--package-lock=true`, `--package-lock-only=false` e a AUSÊNCIA de `--workspaces`; o de workspace da correção 7 exige a ausência. O npm falso dos testes passou a responder `npm config list` no formato do real, e os testes rodam com um ambiente sem nenhuma `npm_config_*`.
- **Os testes mordem (`saidas/06-testes-mordem.txt`):** cada uma das 9 mutações deixa ao menos 1 teste vermelho:
  - sem conferir a configuração: 5;
  - sem `--package-lock=true`: 2;
  - `--workspaces=false` de volta: 2;
  - sem `--package-lock-only=false`: 1;
  - prazo em UTC: 1;
  - sem anular as variáveis do `npm run`: 2;
  - sem a leitura direta do disco e do ambiente: 2;
  - sem o `npm config list`: 1;
  - sem conferir o `npm local prefix`: 1.
- **`npm run auditar` real, com rede (`saidas/08-auditar-com-rede.txt`):** **código 0**, rodando por `npm run`, com as variáveis que ele exporta.
- **`npm run test:scripts` (`saidas/09-test-scripts.txt`):** 348 testes, 342 passam, 4 pulados (iOS), **2 falham**, os dois esperados:
  - `baseline.test.mjs` diz "auditar.test.mjs tem 70 testes"; o `baseline.mjs` diz 58 e fica com o orquestrador.
  - O `conferir-indices` reclamava destes arquivos ainda fora do índice; depois de gravar os índices, `saidas/11-conferir-indices.txt` dá OK.
- **Portão de conteúdo (`saidas/10-regras-de-conteudo.txt`):** 10 de 10.
- **Ferramentas** em `ferramentas/`:
  - `preparar-copia.sh`: as variantes de cópia;
  - `rodar-copias.sh`: roda o portão em cada variante;
  - `mutar.sh`: as mutações.
- **Consequência a saber:** rodar o portão por `npx` (ou com `npm run auditar --qualquer-coisa`, sem o `--` antes da opção) sai 2, porque o npm exporta `npm_config_call`, `npm_config_package`, `npm_config_yes` ou `npm_config_qualquer_coisa`, que não estão na lista. `npm run auditar` puro e `node scripts/auditar.mjs` funcionam.
- **Não verificado:**
  - O runner `ubuntu-latest` do CI (H32). Se a imagem trouxer um npmrc global ou de usuário com chave fora da lista, o job sai 2 com o nome da chave.
  - Windows.

## Justificativa

O achado da rodada 7 é o terceiro verde falso vindo da configuração do npm (offline na rodada 6, workspace antes da rodada 7, `package-lock` agora). Anular bandeira por bandeira perde sempre para a próxima chave que ninguém listou. Por isso a classe fecha ao contrário: o portão só confia na configuração cujas chaves comprovadamente não mudam o que o `npm audit` olha. Cada chave permitida ficou provada com o npm real numa cópia com runtime vulnerável plantado, e todo o resto sai 2 com o nome, para alguém olhar. A `--workspaces=false` saiu porque o código do próprio npm mostra que ela filtra para as dependências da raiz, e uma cópia com uma dependência na raiz provou que o runtime dos workspaces sumia. O prazo em São Paulo segue o que a lista promete ("até o fim do dia escrito"), e a confiança na marca `dev` do lockfile ficou dita no README, como a validação pediu.
