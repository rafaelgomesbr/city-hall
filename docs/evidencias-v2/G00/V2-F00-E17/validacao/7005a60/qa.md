---
validador: qa
modelo: claude-sonnet-5-5
etapa: V2-F00-E17
sha_validado: 7005a60cd70b30a4f455a96a64c4d7a3abb2819f
ci_run: 37739535524
rodada: 1
herdado_de:
tags: [LGPD, INFRA]
nivel_de_prova_exigido: [E1, E2]
nivel_de_prova_obtido: [E1, E2]
veredito: PASS
confianca: alta
humano_necessario: sim
escalar: nenhum
---
## Critérios verificados
- `npm run test:scripts` no Windows: saiu 0, 213 testes, 209 ok, 0 falhas, 4 pulados por ambiente (sem `ios/`).
- `npm run conferir:numeros` no Windows: saiu 0, 24 afirmações, "Todos os números da documentação batem".
- Linux, log do CI (job "Testes, tipos e scripts", run 37739535524): `# tests 213 / # pass 209 / # fail 0 / # skipped 4` e "Afirmações conferidas: 24 ... batem".
- Caso 19 (`shell` no win32), caso 22 (caminhos com `join` a partir de `parse(resolve(".")).root`) e caso 37 (`PERFIL_DE_PRODUCAO` e as três pontas): diff lido.
- Negativo de `conferir:numeros`: criei `dc360/docs/zz-temp-qa.md` com "999 testes da API" e "12 contra a API". Saiu 1, "Afirmações que não batem (2)", "a frase fala de uma grandeza cujo valor real é 1267 ou 251, e não 999". Apaguei o arquivo; depois saiu 0.

## Evidência
- Windows, scratchpad: `ts.txt` (exit 0), `cn.txt` (exit 0), `cn_planta.txt` (exit 1 com o número falso).
- Mutações (aplicadas e desfeitas por script):
  - `copiar-producao.mjs` sem "OneDrive" na lista de nuvem: MORTA (caso 22).
  - `Desktop` trocado por `Desktopx`: MORTA.
  - checagem de repositório desligada: MORTA.
  - `app.config.ts` com `mode: "production"` escrito à mão: MORTA (caso 37).
  - `comando-de-migracao.test.mjs` sem `shell` no win32: MORTA (reproduz o ENOENT original).
- `git status` limpo fora de `validacao/`.

## Cenários positivos
Repositório, iCloud/Mobile Documents, Dropbox, Google Drive, OneDrive e Área de Trabalho recusados, e pasta fora disso aceita, em caminho nativo do Windows.

## Cenários negativos
Número falso reprova; `mode` à mão reprova; cada recusa do caso 22 sobrevive à mutação.

## Tentativas de reprovar
- Pergunta do lote, 206 contra 213: `baseline.mjs` soma 165 + 16 (E01) + 17 (E02) + 1 (E17) + 7 (E21) = 206, e `test:scripts` executa 213. Os 7 de diferença são `scripts/auditar.test.mjs`, entrado no commit e2d4aec (E19) sem linha em `TESTES_DAS_ETAPAS_SEGUINTES_EM_SCRIPTS`. `conferir:numeros` NÃO deveria ter pego: ele só varre números escritos em `.md` e não lê `baseline.mjs` (nenhum documento afirma a contagem de `test:scripts`); `baseline.test.mjs` só confere as tabelas entre si. É lacuna de portão, dono E19 (registro) e E22 (conferência final), não defeito da E17.
- Tentei contornar a recusa do caso 22 variando maiúscula e minúscula no Windows: contorna (achado 1).
- Procurei teste que trave comportamento errado: nenhum.

## Achados
1. corrige antes de crescer (LGPD; código pré-existente que a E17 diz preservar): `razaoParaRecusarAPasta` compara texto com distinção de caixa, e o Windows não distingue. Reprodução (raiz e casa vindas de `resolve`): `c:/projetos/city-hall/dc360/copias` devolve `null` (deveria recusar: repositório); `C:/Users/Rfasg/onedrive/x` devolve `null` (deveria recusar: nuvem); `c:/users/rfasg/desktop/x` devolve `null`. A grafia exata recusa. O teste da E17 só exercita a grafia exata, então "portabilidade provada" vale só para ela. Dono: quem toca `scripts/copiar-producao.mjs`.
2. corrige antes de crescer: `baseline.mjs` espera 206 em `test:scripts` e são 213, então o roteiro sai 1 numa árvore verde. Falta `"V2-F00-E19": 7` e o arquivo nas tabelas. Nenhum portão liga a contagem real de `scripts/*.test.mjs` ao esperado. Dono: E19; a E22 deve repetir a conferência.
3. anotado: o README diz "251 verificações contra a API" e a execução imprime 271; está declarado no próprio README:13 ("a execução imprime mais"), não é divergência escondida.

## Não verificado
Linux por execução própria (só o log do CI; não há WSL nem Docker). A E17 pede a saída de Windows e de Linux arquivada: a de Linux está no log do CI, não em `saidas/`. O Rafael rodar os dois comandos na máquina dele.

## Risco residual
Baixo para a etapa. O achado 1 é risco LGPD real, condicionado ao operador digitar o caminho em caixa diferente.

## Motivo do humano
O bloco pede que o Rafael rode os dois comandos na máquina dele.
