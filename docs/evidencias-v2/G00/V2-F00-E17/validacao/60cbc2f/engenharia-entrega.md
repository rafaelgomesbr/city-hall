---
validador: engenharia-entrega (general-purpose)
modelo: claude-sonnet-5-5
etapa: V2-F00-E17
sha_validado: 60cbc2f
ci_run: 39524190207
rodada: 8
herdado_de:
tags: [LGPD, INFRA]
nivel_de_prova_exigido: [E1]
nivel_de_prova_obtido: [E1, E2]
veredito: PASS
confianca: alta
humano_necessario: nao
escalar: nenhum
---
## Critérios verificados

Notação: `$A` = `/private/tmp/claude-501/-Users-rafaelgomes-Documents-city-hall/d1c50ef6-d495-4393-82c6-d7e2ba48b9a4/scratchpad/r8/infra-4`. Esta rodada fecha a pendência que a rodada 7 deixou (Windows). Nesta dimensão a pergunta é se o job 118974893833 "Windows (auditar, test:scripts e conferir:numeros)" prova a DoD da E17 de verdade neste SHA.

| Critério (Infra e CI) | Resultado | Prova |
| --- | --- | --- |
| Run do CI do SHA, job a job | Run 39524190207, `head_sha` c680f8d (difere de 60cbc2f só em `STATUS.md` e `ESTADO-ATUAL.md`), 12 de 12 `success` | `$A/run.json`, `$A/jobs.json` |
| `test:scripts` com 0 falhas no Windows | Job 118974893833, passo 9 "Testes dos scripts em Windows (npm run test:scripts)" `success`. Log: "# tests 353", "# pass 349", "# fail 0", "# cancelled 0", "# skipped 4", "# todo 0" | `$A/w.txt` linhas 2498-2507 (log com cores removidas de `log-118974893833.txt`) |
| Os três casos que a E17 consertou rodaram no Windows e passaram | "ok 60 - rodando da raiz, --conferir confere e NÃO aplica" (caso 19, `npm` virando `npm.cmd`), "ok 70 - a pasta de copias recusa o repositorio, a nuvem de arquivos e a Area de Trabalho" (caso 22, caminhos a partir de `parse(resolve(".")).root`, ou seja `D:\\`), "ok 85 - a escolha do ambiente continua morando no app.config.ts, e não escrita à mão" e "ok 86 - a conferência do ambiente reprova o mode escrito à mão num rascunho" (caso 37). Nenhum deles com `# SKIP` | `$A/w.txt` linhas 1105, 1391, 1481, 1487 |
| Os 4 pulados são os previstos pela DoD ("seguem por ambiente, sem pasta ios/") | Sim, e só esses: ok 83, 84, 87 e 88, "# SKIP sem pasta ios/ nesta máquina" e "sem projeto iOS gerado" | `$A/w.txt` linhas 1469, 1475, 1493, 1499 |
| O Windows executou o MESMO conjunto de testes que o Linux | Extraí as 364 linhas "ok N - nome" do passo de Linux (job 118974893692, passo 11) e do de Windows, normalizei CRLF e numeração, ordenei e comparei: `diff` vazio, 364 de 364 idênticas. Totais iguais: 353 / 349 / 0 / 4 | `$A/a2.txt`, `$A/b2.txt` |
| `conferir:numeros` sem divergência no Windows | Passo 10 "Os números do README batem em Windows (npm run conferir:numeros)" `success`. Log: "Afirmações conferidas: 25", "O roteiro da linha de base (scripts/baseline.mjs) espera o mesmo total de casos que a árvore tem, nas oito suítes." e "Todos os números da documentação batem com a realidade." (00:58:59, depois de 1 min 37 s de leitura de testes, não passo vazio) | `$A/w.txt` linhas 2508-2546, artefato `windows-c680f8d...`, arquivo `05-conferir-numeros-windows.txt` |
| Linux no mesmo run | Job 118974893692: passo 11 "Testes dos scripts" 353/349/0/4 e passo 12 "Os números do README batem com a realidade", "Afirmações conferidas: 25", "Todos os números da documentação batem com a realidade." Também o passo `test-scripts` (codigo 0, confere, 17 s) e `conferir-numeros` (codigo 0, confere, 61 s) da linha de base | `$A/l-118974893692.txt` linhas 3806-3852, `$A/l-118974893889.txt` |
| Plataforma real | Artefato `00-contexto.txt` e `00-versoes.txt`: "runner: Windows X64 (imagem win25-vs2026)", "uname: MINGW64_NT-10.0-26100", node v22.23.3, npm 10.9.9, shell `C:\Program Files\Git\bin\bash.EXE`, SHA do run c680f8d | `$A/art/windows/00-contexto.txt`, `$A/art/windows/00-versoes.txt` |
| O job não ficou verde por passo mascarado | Passos 9 e 10 têm `if: !cancelled() && ...outcome == 'success'` das instalações (`npm ci` da raiz e do aplicativo, ambos `success`), saída por `| tee` com `shell: bash` (pipefail), nenhum `continue-on-error`, nenhum `|| true`. A dependência do aplicativo (`apps/campo/node_modules`) existiu | `verificar.yml` de 60cbc2f, job `windows`; `$A/verificar-60cbc2f.yml` |
| Os números do README e do COLOCAR-DE-PE mudaram no intervalo e continuam provados | `conferir:numeros` verde em Linux e Windows no SHA (acima); na cópia de 60cbc2f no Mac: código 0 e, com 5550 trocado por 5549 em `COLOCAR-DE-PE.md:41`, código 1 ("Afirmações que não batem (1)", "o valor real é 1997 ou 5550") | `$A/c1.txt`, `$A/c2.txt` |

## Evidência

- Job 118974893833 Windows: `success` (00:55:04 a 00:59:04). Passos 5 "Política de dependências (node scripts/auditar.mjs) em Windows", 6 e 7 `npm ci`, 8 `build:shared`, 9 `test:scripts`, 10 `conferir:numeros`, 11 redigir, 12 publicar: todos `success`.
- Job 118974893692 Testes, tipos e scripts: `success`, mesmos números em Linux.
- Job 118974893889 Linha de base: `success`, "o baseline saiu com código 0".
- Jobs 118974893948 e 118974894002 (ambiente hostil Ubuntu e Windows, E21): `success`; não são prova da E17, só confirmam que o checkout em `autocrlf=true` não perturba as suítes de scripts.
- Artefato `windows-c680f8d...` (19775 bytes, `sha256:b7ff0453...`), baixado com token: `04-test-scripts-windows.txt` repete "# tests 353 ... # fail 0 ... # skipped 4"; sem JWT, Bearer ou URL com credencial.
- Mutante local do caso 22 na cópia de 60cbc2f (Mac): `"OneDrive"` trocado por `"OneDriveX"` em `copiar-producao.mjs:116` faz o caso 70 reprovar ("pass 12, fail 1"); restaurado, 13 de 13. O negativo da DoD (iCloud, Dropbox, Google Drive, OneDrive, Área de Trabalho recusados; pasta fora disso aceita) morde.

## Cenários positivos

- `test:scripts` 0 falhas no Windows (windows-latest, Git Bash) e no Linux, com as mesmas 364 linhas de resultado.
- `conferir:numeros` sem divergência nos dois.

## Cenários negativos

- O caso 22 recusa repositório, nuvem de arquivos e Área de Trabalho e aceita `dc360-copias` (dentro do teste que passou no Windows); mutante reprova.
- `conferir:numeros` reprova número alterado (mutante, código 1).
- O caso 37 reprova o `mode` escrito à mão (ok 86 no Windows).

## Tentativas de reprovar

1. A mudança do `verificar.yml` removeu ou enfraqueceu algo de que a E17 dependia? Não. Os passos 11 e 12 do job `produto` (`test:scripts` e `conferir:numeros` em Linux) não aparecem no diff; o que a E17 ganhou é o job `windows`, novo.
2. O job Windows pode estar verde sem executar nada? O número de casos (353) é igual ao do Linux, o conjunto de nomes é idêntico, os 4 pulados são só os de iOS, e o `conferir:numeros` levou 97 s lendo as listas de teste.
3. O Windows poderia estar herdando o falso verde do `script-shell` em `.npmrc` (vetor da E19 que também alcançaria `npm run test:scripts`)? `git ls-files` em 60cbc2f não lista `.npmrc`; o job `dependencias` do mesmo run tem o passo "Nenhum .npmrc versionado no repositório" `success`.
4. O `auditar` reprovando hoje (fato da E19) contamina a prova? Não para o critério da E17. No job Windows o `auditar` é o passo 5 e os passos 9 e 10 têm `if: !cancelled()` mais o resultado das instalações, não dependem do resultado do passo 5: numa repetição de hoje o job inteiro ficaria vermelho pelo passo 5, mas os passos 9 e 10 rodariam e se leriam isoladamente. A prova da E17 é a leitura desses dois passos, que no run de 21/10 são `success`.
5. A invocação portátil do caso 19: o caso passou no Windows com `npm` resolvido como `npm.cmd` (sem ENOENT), que era o defeito original. Sem `# SKIP`.
6. Procurei invocação não portátil nova em `scripts/*.mjs` (`execFileSync("npm"` sem `shell`): nenhuma fora do que já tem `shell: process.platform === "win32"` (leitura).

## Achados

1. **Anotado, não bloqueia.** O runner é `windows-latest` (Windows Server 2025, imagem win25-vs2026) com Git Bash, e não o Windows 11 do autor com PowerShell ou cmd como shell de entrada. A diferença relevante para os três casos (`npm.cmd`, letra de unidade, `path.sep`) é exercida: o caso 19 chama o `npm` por dentro de `cmd.exe` (`shell: true`), e o caso 22 monta caminhos com a raiz da unidade. Não é critério escrito da DoD (que diz "Windows e Linux").
2. **Anotado.** `test:scripts` está ligado ao CI desde o job `produto` (Linux) e agora ao job `windows`; o "NÃO fazer" da E17 (ligar ao CI é F01-E03) refere-se à entrega dela, não ao workflow atual.

## Não verificado

- Execução em máquina Windows 11 de cliente, em PowerShell ou cmd como shell de entrada, com nome de usuário com acento ou espaço no caminho (o runner usa `D:\a\city-hall\city-hall`). A DoD não pede, mas o desenho do CI não cobre.
- Não rodei `test:scripts` completo localmente (o CI cobre; a cópia no Mac só rodou `conferir:numeros` e o arquivo do caso 22).
- Não disparei workflow.
- A análise de LGPD do caso 22 (dump não mora em repositório, nuvem ou Área de Trabalho) é da dimensão LGPD, não desta.

## Risco residual

Baixo. O risco que sobra é um caso novo de `test:scripts` que só quebre num Windows de cliente com shell ou caminho exótico.

## Motivo do humano

Nenhum para esta dimensão. A pendência humana da rodada 7 ("rodar `npm run test:scripts` e `npm run conferir:numeros` no Windows") PODE ser substituída pela prova do CI: o job 118974893833 prova os dois comandos em Windows neste SHA, com 353 testes (349 passam, 4 pulados por falta de `ios/`, 0 falhas; linha do log "# fail 0" a 00:57:22Z) e "Todos os números da documentação batem com a realidade." (00:58:59Z), com o mesmo conjunto de 364 resultados do Linux. D-31 item 5 e a seção 8 de 28 ("não se pede E4 quando E1 ou E2 provam") sustentam a substituição; a decisão de fechar o campo "Validação humana" da DoD é do gatekeeper.
