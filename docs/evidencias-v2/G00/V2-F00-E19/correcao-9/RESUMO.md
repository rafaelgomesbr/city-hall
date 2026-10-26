# V2-F00-E19, correção 9: `npm-shrinkwrap.json` sai 2, e o prefixo mascarado pelo npm 11 é reconhecido

Defeitos de origem: revisão independente da correção 8 (`b72e371`). Feita sobre `ed2cccf`, no ramo `trab/correcao-7`. macOS arm64, Node 24.15.0, npm 11.12.1 e, em `saidas/04-npm-10.txt`, npm 10.9.2 (o do Node 22 do CI), com rede.

## Fatos

- **Antes (`saidas/02-copias-ANTES.txt`).** O portão de `ed2cccf` rodou com o npm real em cópias do `dc360` por `git archive` (sem `node_modules`), com `fast-uri` 3.0.1 (advisory alta, runtime) plantado no `package-lock.json` da raiz:
  - **Variante `shrinkwrap`:** o `package-lock.json` limpo foi copiado para `npm-shrinkwrap.json` e só depois houve o plantio no lockfile. O portão saiu **0, "Runtime limpo"**. O npm lê o shrinkwrap no lugar do lockfile (`sw || lock` no arborist), e o Dockerfile copia e instala o `package-lock.json`. É o defeito 1 da revisão, reproduzido.
  - **Variante `uuid`:** a cópia plantada numa pasta `123e4567-e89b-12d3-a456-426614174000`. O portão saiu **2**: "o npm não tomou ... como projeto (npm local prefix = .../***/uuid/dc360)". O npm 11 mascara com `***` todo trecho com cara de UUID (`@npmcli/redact`), e `npm prefix` também mascara. É o defeito 2, reproduzido.
  - **Variante `shrinkwrap-app`** (shrinkwrap em `apps/campo`): 1, porque o plantio está na raiz. Nada conferia o shrinkwrap do aplicativo.
- **O que mudou** (`diff-da-correcao.patch`: `dc360/scripts/auditar.mjs`, `auditar-excecoes.mjs`, `auditar.test.mjs`, `baseline.mjs` e o parágrafo do `auditar` no `README.md`):
  1. **`shrinkwrapsPresentes`.** Procura `npm-shrinkwrap.json` na raiz, no aplicativo e em cada workspace do `package.json` da raiz. Os padrões `pasta/*` e caminho literal são expandidos; um padrão com outro curinga volta como "não sei expandir". Qualquer achado sai **2** antes de auditar, com o caminho do arquivo. O repositório não usa shrinkwrap, então existir já é defeito.
  2. **`mesmoProjeto` e `mascararComoONpm`.** O `npm local prefix` é aceito se for igual ao caminho dado ou ao real, ou igual a eles depois da MESMA máscara do npm: UUID vira `***`, segredo do npm vira `npm_***`. A máscara do portão é a mesma regra de `@npmcli/redact` 11.x. Fora do que essa máscara produz, um prefixo diferente continua saindo 2. Um prefixo vazio ou ausente também sai 2.
  3. **Rótulos.** "o projeto da raiz" e "o projeto do aplicativo de campo" (antes "a raiz NÃO foi auditado").
  4. **README.** O parágrafo do `auditar` diz que um shrinkwrap faz o portão sair 2 e que o prefixo é comparado também com a máscara do npm 11.
  5. **`baseline.mjs`.** A E19 vai de 70 para **75**, com o comentário. `npm run conferir:numeros` sai 0 (`saidas/08-conferir-numeros.txt`).
- **Depois (`saidas/03-copias-DEPOIS.txt`, as 13 variantes das correções 8 e 9):**
  - `shrinkwrap`: **2**, "npm-shrinkwrap.json existe, e o npm o lê NO LUGAR do package-lock.json".
  - `shrinkwrap-app`: **2**, nomeando `apps/campo/npm-shrinkwrap.json`.
  - `uuid`: **1**. O projeto é reconhecido e o runtime plantado reprova.
  - As outras 10 dão o mesmo que na correção 8: `plantada`, `plock`, `raiz-com-dep`, `permitidas`, `credencial` e `env-permitida` dão 1; `proibida`, `global`, `usuario` e `env-proibida` dão 2.
  - Com o npm 10.9.2 (`saidas/04-npm-10.txt`): `shrinkwrap` dá 2 e `uuid` dá 1.
- **Testes (`saidas/05-testes-auditar-DEPOIS.txt`): 75 de 75.** Eram 70 (`saidas/01-testes-auditar-ANTES.txt`), então são **5 casos novos**:
  - shrinkwrap na raiz, no aplicativo, num workspace `packages/*` e num workspace literal (`db`): sai 2 sem nenhuma chamada a `npm audit`. Sem shrinkwrap, passa.
  - padrão de workspace que não se expande: sai 2.
  - pasta da cópia com cara de UUID, e o npm falso mascarando como o npm 11: passa.
  - regra pura `mesmoProjeto` com `mascararComoONpm`.
  - regra pura `shrinkwrapsPresentes`.
  - O npm falso dos testes passou a mascarar UUID no `npm local prefix`, como o real.
- **Os testes mordem (`saidas/10-testes-mordem.txt`).** Cada uma das 4 mutações deixa testes vermelhos:
  - sem procurar shrinkwrap: 2;
  - shrinkwrap só na raiz: 3;
  - prefixo sem a máscara (como na correção 8): 2;
  - prefixo aceito sempre: 2.
- **`npm run auditar` real, com rede (`saidas/06-auditar-com-rede.txt`): código 0.**
- **`npm run test:scripts` (`saidas/07-test-scripts.txt`):** 353 testes, 348 passam, 4 pulados (iOS) e **1 falha**. A falha é o `conferir-indices`, que reclamava destes arquivos ainda fora do índice. O `baseline.test` já passa com 75. Depois de gravar os índices, `saidas/11-conferir-indices.txt` dá OK.
- **Portão de conteúdo (`saidas/09-regras-de-conteudo.txt`):** 10 de 10.
- **Ferramentas (`ferramentas/`):**
  - `preparar-copia.sh`, com as variantes novas `shrinkwrap` e `shrinkwrap-app`;
  - `rodar-copias.sh`, com a variante `uuid` e a variável `VARIANTES`;
  - `mutar.sh`, com as mutações desta correção.
- **Não verificado:**
  - O runner do CI (H32).
  - Windows.
  - Shrinkwrap dentro de `node_modules` de uma dependência: o npm o ignora quando há lockfile na raiz, e ele não está no escopo da revisão.

## Justificativa

O shrinkwrap é o mesmo tipo de defeito da rodada 7: o npm audita um arquivo e o Dockerfile instala outro. A regra que fecha é "só o `package-lock.json` existe". Por isso a mera presença de um shrinkwrap, onde o npm o leria, sai 2 com o caminho. A máscara do npm 11 é cosmética, mas fazia o portão sair 2 em qualquer pasta com UUID, o que é comum em pasta temporária, worktree e runner. A tolerância aplica ao caminho real a MESMA regra do npm e compara mascarado com mascarado. Assim, ela não aceita nenhuma diferença além da que o próprio npm introduz.
