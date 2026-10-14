---
validador: qa
modelo: claude-sonnet-5-5
etapa: V2-F00-E17
sha_validado: 4b96ea7
ci_run: 38445527075
rodada: 2
herdado_de:
tags: [INFRA]
nivel_de_prova_exigido: [E1, E2]
nivel_de_prova_obtido: [E1, E2]
veredito: PASS
confianca: media
humano_necessario: nao
escalar: nenhum
---
## Critérios verificados

Saídas em `C:/Users/Rfasg/AppData/Local/Temp/claude/c--Projetos-city-hall/b62645e7-c436-45b4-8ce0-4d68f4fb420f/scratchpad/qa-infra/` (abreviado `qa-infra/`).

| Critério | Resultado | Prova |
| --- | --- | --- |
| `npm run test:scripts` com 0 falhas no Windows | PASS | `qa-infra/01-test-scripts.txt`: 243 casos, 239 ok, 0 falhas, 4 pulados (sem pasta `ios/`), código 0 |
| ... e no Linux | PASS | Log do CI (job "Testes, tipos e scripts", run 38445527075): `# tests 243 / # pass 239 / # fail 0 / # skipped 4`; `qa-infra/71-ci-testes-scripts-log.txt` |
| `conferir:numeros` sem divergência | PASS | `qa-infra/02-conferir-numeros.txt` (rodado antes de outro validador criar testes temporários em `apps/api/test`): 24 afirmações, "espera o mesmo total de casos que a árvore tem, nas oito suítes", código 0; idem no CI Linux |
| Caso 22 (`copiar-producao`) recusa repositório, iCloud (`Mobile Documents`), Dropbox, `Google Drive`, OneDrive e Área de Trabalho, e aceita pasta fora disso | PASS | Teste lido (`copiar-producao.test.mjs`) e mutado (abaixo); sonda própria `qa-infra/19-sonda-copiar.txt` |
| Caso 37 (`entitlements`) reprova se o `mode` voltar a ser escrito à mão | PASS | Teste lido (`entitlements-do-ios.test.mjs`, caso "a conferência do ambiente reprova o mode escrito à mão num rascunho"): três rascunhos estragados (mode à mão, perfil que deixa de nascer de `EAS_BUILD_PROFILE`, `pushAmbiente` à mão) e cada um reprova com a frase certa |
| Caso 19 (`comando-de-migracao`) portátil | PASS | `shell: process.platform === "win32"` no teste; verde no Windows (acima) e no Linux (CI) |
| `conferir-numeros.mjs` declara os `describe.skip` marcados pela política | PASS | Sonda: acrescentei ao fim de `packages/shared/test/regras-de-conteudo.test.ts` um `describe.skip` com marca T42 válida; a saída passou a dizer "1 ponto(s) de pulo incondicional com marca T42 nos pacotes do vitest; os casos dentro deles NÃO estão nas contagens acima" (`22-conferir-com-describe-skip-marcado.txt`). Desfeito com `git restore` |
| `conferir:numeros` reprova um número alterado de propósito num rascunho | PASS com ressalva | Ver cenários negativos e achado 1 |

## Evidência

`01-test-scripts.txt`, `02-conferir-numeros.txt`, `14-sonda-4827.txt` a `18-sonda-maisde.txt`, `80-base-a.txt`, `81-sonda-4827.txt`, `82-sonda-casos.txt`, `20-mut-sem-onedrive.txt`, `21-mut-repo-so-raiz.txt`, `19-sonda-copiar.txt`, `22-conferir-com-describe-skip-marcado.txt`, `71-ci-testes-scripts-log.txt`.

## Cenários positivos

`node --test scripts/copiar-producao.test.mjs scripts/comando-de-migracao.test.mjs scripts/entitlements-do-ios.test.mjs`: 22 casos, 18 ok, 0 falhas, 4 pulados por ambiente.

## Cenários negativos

- Mutação em `scripts/copiar-producao.mjs`: `"OneDrive"` sai da lista de nuvens: `copiar-producao.test.mjs` fica 12 de 13 (vermelho em "a pasta de copias recusa o repositorio, a nuvem de arquivos e a Area de Trabalho"). Restaurado.
- Mutação: a recusa do repositório passa a olhar só a raiz exata (`absoluta === raizDoRepo`, sem o `startsWith(... + sep)`): o mesmo caso reprova. Restaurado.
- Rascunho errado em `docs/COLOCAR-DE-PE.md` (linha 40, "4828 testes somando o aplicativo"): trocado por "4827" e por "4999", e por "mais de 4999": `conferir:numeros` sai 1 e lista a linha editada em "Afirmações que não batem" (`14`, `15`, `18`). Trocado por "4.828" (separador de milhar): também reprova (falso positivo seguro). Restaurado a cada rodada; `git status` limpo.
- Limite da sonda: durante a minha rodada outro validador mantinha arquivos temporários não rastreados em `apps/api/test` (`zz-qa-*.test.ts`), que somam casos à API (1303 em vez de 1299). Por isso, na minha rodada, a base já reprovava 4 afirmações do README e do `COLOCAR-DE-PE.md` e a diferença limpa só aparece na sonda de redação (achado 1). A mordida limpa do conferidor está provada pela evidência do implementador (`saidas/05-sonda-conferir-numeros-com-rascunho-errado.txt`: reprova com 1 afirmação divergente) e pela mutação 3 do validador de engenharia (caso de teste a mais: "espera 243 casos e a árvore tem 244 (+1)"), que eu li.

## Tentativas de reprovar

1. Caminho do caso 22 com maiúsculas/minúsculas trocadas (`sonda-copiar.mjs`): `c:\projetos\city-hall\dc360\copias`, `C:/Users/<nome>/DESKTOP/copias` e `.../dropbox/x` são ACEITOS (a comparação é sensível a caixa, e o Windows não é). Achado 2.
2. Afirmação com outra palavra: `4999 casos` no lugar de `4828 testes` NÃO é pega (a linha deixa de aparecer entre as divergentes; `82-sonda-casos.txt` contra `80-base-a.txt`). A expressão só casa `teste`, `verificaç`, `de integraç/unidade` e `contra a API`. Achado 1.
3. `describe.skip` marcado: o total do `vitest list` não muda (a política do roteiro: declarado, não contado); o total que o `vitest run` imprime ganharia os casos pulados e o roteiro esperaria o número antigo. Está declarado na saída; só conferi que a declaração aparece.
4. Procurei `\n` dependente de plataforma e caminho POSIX literal nos três testes: não achei.

## Achados

1. Anotado (corrige antes de crescer se o README crescer em afirmações): `conferir:numeros` só confere frase com as palavras `teste`, `verificaç`, `de integraç/unidade`, `contra a API`; "N casos", "N asserções" ou "N cenários" escapam, e o separador de milhar (`4.828`) é lido como `828` (reprova, então erra para o lado seguro). Os 24 números hoje afirmados estão cobertos.
2. Anotado (sem efeito hoje): `razaoParaRecusarAPasta` compara caminho com caixa exata. A pasta de cópias é fixa (`join(homedir(), "dc360-copias")`, `copiar-producao.mjs:76`) e nasce do `homedir()` do sistema, então o chamador real não tem como errar a caixa; se algum dia a pasta passar a vir de variável de ambiente, `C:\projetos\...` entraria no repositório sem recusa. Vale um caso de teste com caixa trocada no Windows.
3. Anotado: o contador `T42` dos `describe.skip` não entra no total que o roteiro espera; basta o `describe.skip` marcado entrar para o passo `teste-shared` divergir ao rodar o roteiro completo. Já declarado na saída do conferidor.

## Não verificado

- O jest do aplicativo e a API completa (restrição de paralelismo); vale a saída do gatekeeper e o CI.
- A conferência limpa dos 24 números com o rascunho errado na minha rodada (ver o limite acima).
- Teste dos 3 casos em macOS.

## Risco residual

Uma afirmação numérica escrita com palavra fora da lista não envelhece sozinha. A recusa de pasta de cópia depende de a pasta continuar fixa.

## Motivo do humano

Não aplicável (a etapa pede que Rafael rode os dois comandos; o `test:scripts` e o `conferir:numeros` foram rodados aqui e no CI Linux).
