# V2-F00-E19, correção 7: o `auditar` audita a raiz na raiz, de onde quer que o comando seja dado

Defeito de origem: achado de pré-validação da rodada 7 (saídas fora do repositório, reproduzidas aqui). Feita sobre `fd17ff4`, no ramo `trab/correcao-7`. macOS arm64, Node 24.15.0, npm 11.12.1.

## Fatos

- **Defeito (`saidas/03-repro-real-ANTES.txt`):** `auditar()` recebia `cwd` undefined nas duas consultas da raiz (runtime e completa), então o `npm audit` rodava no diretório do PROCESSO. Dentro de um workspace o npm audita só aquele workspace. Com `packages["node_modules/fastify"].version = "4.10.0"` no `package-lock.json` (dependência de runtime vulnerável), a raiz saía 1 e `cd packages/shared && node ../../scripts/auditar.mjs` saía **0** com "Runtime (vai para a imagem): 0" e "Runtime limpo". Com `npm_config_workspace=packages/shared` no ambiente a consulta também voltava com runtime 0 (aqui o portão saía 2 só porque a consulta de controle falhava, por acaso).
- **O que mudou** (`diff-da-correcao.patch`, só o E19: `scripts/auditar.mjs`, `scripts/auditar-excecoes.mjs`, `scripts/auditar.test.mjs`, `scripts/baseline.mjs` e o parágrafo do `auditar` no `README.md`):
  1. `auditar()` exige `cwd` (lança erro se faltar) e as consultas da raiz passam `RAIZ`; o aplicativo continua com `apps/campo` e o controle com a pasta temporária. Conferidas todas as 5 chamadas.
  2. `ambienteDaConsulta(env)` (novo, em `auditar-excecoes.mjs`) tira do ambiente do filho `npm_config_workspace`, `npm_config_workspaces` e `npm_config_include_workspace_root` (qualquer caixa, `_` ou `-`).
  3. `--workspaces=false` entrou em `BANDEIRAS_DA_CONSULTA_REAL`, então toda chamada o leva. Um `workspace=` fixado em `.npmrc` (que a linha de comando não anula) faz o npm recusar a chamada com erro, e o portão sai **2** (`saidas/06-npmrc-com-workspace-recusa-com-2.txt`), não 0.
  4. README: o escopo da auditoria não depende de onde o comando é dado.
- **Testes (`saidas/01` ANTES, `saidas/02` DEPOIS):** `node --test scripts/auditar.test.mjs`, **58 de 58** (eram 54; **4 casos novos**: audita a raiz de dentro de um workspace real, o ambiente não leva variável de workspace, runtime vulnerável reprova de dentro do workspace e com `npm_config_workspace`, e a função pura `ambienteDaConsulta`). Com o `auditar.mjs` de `fd17ff4` os dois casos de ponta a ponta ficam vermelhos (o `cwd` da consulta da raiz era o do workspace; a variável chegava ao npm): 56 de 58, 2 falham.
- **Reprodução com npm real (`saidas/04-repro-real-DEPOIS.txt`):** com o mesmo lockfile adulterado, a raiz, `packages/shared`, `packages/shared` com `npm_config_workspace` e a raiz com `npm_config_workspace` saem todas **1**, "Runtime: 1 vulnerabilidade(s)", "REPROVADO". O `package-lock.json` foi restaurado e conferido com `cmp` (`saidas/05`); `git status` não o mostra modificado.
- **`npm run auditar` real, com rede (`saidas/07`):** código 0, runtime 0, desenvolvimento 3 aceitas, aplicativo com as 8 aceitas, controle confirmado. De dentro de `packages/shared`, com o lockfile limpo (`saidas/08`): código 0 com os mesmos números.
- **Regressão:** `npm run test:scripts` 328 testes, 324 passam, 4 pulados (iOS, sem `ios/`), 0 falham (`saidas/09`); `baseline.mjs` passou de 54 para 58 em `V2-F00-E19` (e `baseline.test.mjs`, 29 de 29); `npm run conferir:numeros` código 0, "Todos os números da documentação batem" (`saidas/10`); portão de conteúdo 10 de 10 (`saidas/11`).
- **Não verificado:** Windows e Linux (sem as plataformas); a interação com `workspace` num `.npmrc` foi vista só no `userconfig`, com o npm real.

## Justificativa

O item 7 da seção 7 de `28` não admite portão que diz "limpo" sem ter olhado a raiz. O escopo da auditoria não pode depender do diretório do processo nem do ambiente: fixar o `cwd`, tirar as variáveis de workspace e pedir `--workspaces=false` fecha os caminhos conhecidos, e o que sobra (`workspace=` em `.npmrc`) vira recusa com código 2.
