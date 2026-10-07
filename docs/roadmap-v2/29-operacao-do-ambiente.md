# Operação do ambiente de execução da V2

Armadilhas e comandos que valem para qualquer sessão que execute ou valide etapa nesta máquina (Windows 11, Git Bash e PowerShell, Node 22.17.0, npm 10.9.2). Veio dos handoffs de 2026-10-06 e 2026-10-07, que são efêmeros e ficam fora do git (D-30). Quando uma armadilha deixar de existir, apague a linha aqui no mesmo commit que a resolve.

## Git e commits

- `git commit -F - @'...'@` no PowerShell NÃO passa a mensagem pela entrada padrão: o commit falha em silêncio e deixa tudo preparado. Grave a mensagem num arquivo do scratchpad e use `git commit -F <arquivo>`.
- Depois do `.gitattributes` (E21), todo `git add` imprime "CRLF will be replaced by LF": é esperado e inofensivo. O índice é LF; a árvore atual pode estar em CRLF. Ao editar, preserve o fim de linha que o arquivo tem na árvore.
- Nunca reescrever histórico (amend, rebase, squash, force-push). No ramo da fase `v2/fnn` o commit candidato, o de correção, o de registro e o push não pedem autorização a cada vez (D-30); merge e push em master são do Rafael.
- O CI (`.github/workflows/verificar.yml`) roda em push para master, em push para `v2/**` e em pull request. Ler o resultado exige `gh` autenticado (`gh auth login`, feito pelo Rafael).
- Os jobs longos `baseline` (35 a 50 min) e `restore` (7 a 9 min) NÃO rodam em todo push: só com `[ci completo]` na mensagem do commit que sobe, por `workflow_dispatch` ou na rodada semanal (os dois últimos só depois que o workflow chegar a master). Use o marcador no candidato de fechamento de gate e nas etapas com tag DB, MIGRATION ou RLS. Cada push em `v2/**` custa minutos do plano do GitHub Actions: junte commits antes de subir quando der.

## Ferramentas que não existem aqui

- O `rtk` citado no CLAUDE.md global NÃO existe nesta máquina (nem no Git Bash nem no PowerShell). Use os comandos sem prefixo.
- Não há WSL nem Docker. Linux só pelo CI.
- O PostgreSQL local é 18.3; a produção é 17. Prova em 17 só pelo CI.
- Há um emulador Android (AVD `Medium_Phone`, em `%LOCALAPPDATA%/Android/Sdk`); o APK de 2026-08-27 em `apps/campo/android/` é anterior às E06 a E16 e não serve para validar. Captura de emulador é evidência E2, nunca substitui aparelho físico quando a etapa o exige.

## Testes e carga da máquina

- `test:isolamento`, `dominio.test.ts`, `resolver-link.test.ts` e o próprio `regras-de-conteudo.test.ts` podem estourar o tempo limite ou dar erro de RPC do vitest por carga (outro processo pesado aberto). Rode de novo, isolado ou com `--testTimeout=120000`, antes de culpar a mudança. Instabilidade confirmada entra na política T42.
- `npm run build:shared` é obrigatório antes de rodar teste da API ou do app: os dois leem o `dist` do pacote comum.
- Não rodar `npm ci` nem apagar `node_modules` nesta máquina: o estado deles é o que as etapas mediram. `npm ci` só em máquina limpa ou no CI.
- O app de campo (Expo) não renderiza no ambiente do agente: a prova de interface do app é teste de componente e, quando houver build atual, captura de emulador.
- Contagens de teste afirmadas em documentos mudam a cada etapa que acrescenta teste: rode `npm run conferir:numeros` ao fim de toda etapa.

## Evidência

- Saída bruta de teste traz travessão e às vezes JWT de teste: passe por `redigir` de `dc360/scripts/baseline.mjs` antes de arquivar. O portão de conteúdo reprova travessão em qualquer `.md`, inclusive `RESUMO.md` de evidência.
- Mexeu em arquivo de evidência: regenere o `INDEX.md` com `montarIndice` de `dc360/scripts/baseline.mjs`.
- Python via heredoc no Git Bash quebra acentos: use `python -X utf8 -` ou um arquivo `.py`.

## Agentes

- Agente que morre por limite de sessão da API: retome o MESMO agente com SendMessage (ele mantém o contexto), dizendo o que está na árvore e o que não é dele.
- Os agentes do usuário (`~/.claude/agents/`) não declaram modelo: passe o modelo explicitamente em toda chamada (D-30, seção 9 de `28-execucao-e-validacao.md`).
- Atribuição de commit: a linha `Co-Authored-By` que o sistema indicar na sessão.
