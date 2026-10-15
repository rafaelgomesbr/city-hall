---
validador: engenharia-entrega (agente general-purpose com o papel da dimensão)
modelo: claude-opus-5-5
etapa: V2-F00-E19
sha_validado: 52952a1
ci_run: 38618369218
rodada: 3
herdado_de:
tags: [INFRA]
nivel_de_prova_exigido: [E1, E2]
nivel_de_prova_obtido: [E1, E2]
veredito: PASS
confianca: alta
humano_necessario: sim
escalar: nenhum
---
## Critérios verificados

- **FAIL da rodada 2 (`auditar` saía 0 sem auditar com o registro fora do ar; item 7 da seção 7 de `28`).** Não morde mais. Reexecutado neste SHA, sem tocar arquivo do repositório:
  - `npm_config_registry=http://127.0.0.1:9 npm_config_fetch_retries=0 node scripts/auditar.mjs`: código **2**, "ERRO: o conjunto de runtime da raiz NÃO foi auditado, então este portão NÃO aprova", motivo ECONNREFUSED.
  - `npm_config_registry=http://registro-inexistente.invalid npm run auditar`: código **2** (ENOTFOUND).
  - Registro falso local (sonda minha, `$SP/val/engenharia-entrega/sondas/registro-falso.mjs`): HTTP 500, 404, HTML de portal cativo e "responde as duas auditorias da raiz e cai na do aplicativo": todos código **2**, o último com "o aplicativo de campo NÃO foi auditado" (`e19-03-codigos-registro-falso.txt`).
  - Com rede: código 0, "Runtime limpo, e o aplicativo sem advisory nova" (`e19-01-auditar-sem-registro.txt`).
- **O teste morde.** `node --test scripts/auditar.test.mjs`: 28 de 28. Mutação: `relatorioValido` devolvendo sempre `null`: 4 de 28 falham ("sai 2 e diz que NÃO auditou quando o runtime da raiz volta com erro do registro", idem para a árvore completa, para o aplicativo e para JSON vazio) (`e19-05`, `e19-06`). Restaurado com `git restore`, conferido byte a byte.
- **O CI pega.** Job "Dependências com vulnerabilidade conhecida (auditar)" (116039196116): `npm run auditar 2>&1 | tee`, shell `bash` (com `pipefail`), sem `continue-on-error`; código 2 derruba o job. Hoje: "Runtime (vai para a imagem): 0", 3 de desenvolvimento aceitas, aplicativo com as 6 nomeadas. No job de linha de base, registro fora do ar faz `auditar`, `audit-raiz` e `audit-campo` divergirem (código 3, que o passo do CI transforma em falha) (`e19-04-baseline-sem-registro.txt`).
- **Lista de exceções com motivo, dono e prazo (CP-03).** `scripts/auditar-excecoes.mjs`: aplicativo (`decode-uri-component`, `brace-expansion`, `braces`, `node-forge`, `shell-quote`, `sprintf-js`) e desenvolvimento (`vitest`, `@vitest/mocker`, `tinypool`), todas com `motivo`, `dono: "Rafael"` e `ate: "2027-01-05"`; `comCorrecao: true` só em `brace-expansion` e `shell-quote`, com o motivo do CP-03 (o `npm audit fix` mistura SDK 57 e 58). Sonda de `problemasDasExcecoes` (`e19-08-sonda-excecoes.txt`): sem prazo, vencida (ontem), data inexistente (2026-02-30), sem dono, sem motivo e motivo só com espaços reprovam; prazo de hoje vale.
- **Zero runtime vulnerável na raiz.** CI e aqui: 0. Os 3 avisos de desenvolvimento (inclusive `tinypool`, gravidade crítica, execução de código no processo de teste) estão aceitos pela D3 Q5 do Rafael, com dono e prazo.
- **`expo-doctor` 21 de 21 sem pular a checagem de versões.** Aqui, hoje (2026-10-15), `npx expo-doctor` em `apps/campo`, sem `EXPO_DOCTOR_SKIP_DEPENDENCY_VERSION_CHECK`: "21/21 checks passed", código 0 (`e19-07-expo-doctor-hoje.txt`). No CI, o passo `expo-doctor` do job de linha de base (sem pular) "confere" (`17-expo-doctor.txt`, 21 de 21); o job "Aplicativo de campo" pula a checagem de versão (20 de 20), decisão documentada no workflow.
- **Suíte depois da atualização dos pacotes do Expo (correção 4).** CI "Aplicativo de campo": jest 134 suítes, 1927 testes, todos passando; `test:campo` idem; `npm ls` coerente. Linha de base Linux 19 de 19.
- **Documentação.** `dc360/README.md:1348-1362` descreve a política do CP-03 e o código 2; a linha do `expo-doctor` diz 21 de 21 com o histórico datado.

## Evidência

- Arquivos em `$SP/val/engenharia-entrega/`: `e19-01-auditar-sem-registro.txt`, `e19-02-auditar-registro-falso.txt`, `e19-03-codigos-registro-falso.txt`, `e19-04-baseline-sem-registro.txt`, `e19-05-auditar-test-verde.txt`, `e19-06-auditar-test-MUTANTE.txt`, `e19-07-expo-doctor-hoje.txt`, `e19-08-sonda-excecoes.txt`; logs e artefatos do CI em `ci-job-*.log` e `art/dependencias/`, `art/baseline/`.
- O registro falso escutou só em 127.0.0.1:55531 e foi derrubado depois de cada modo (conferido com `lsof`).

## Cenários positivos

- Com rede: `auditar` 0, `expo-doctor` 21 de 21, `npm audit` crus com relatório.

## Cenários negativos

- Registro inalcançável, nome que não resolve, 500, 404, HTML e queda no meio: todos código 2.
- Exceção malformada ou vencida: reprova.

## Tentativas de reprovar

- Registro que responde `{}` às auditorias (um espelho sem base de avisos): `auditar` sai **0** e só avisa que as 6 exceções "não aparecem mais no relatório" (`sondas/out-vazio.txt`). Não é queda do registro (o npm devolveu `metadata` com total 0), e exige trocar o registro configurado; no CI o registro é o padrão. Vai como achado.
- Procurei caminho em que o erro de uma das três chamadas passasse: cada chamada passa pelo mesmo `auditar(rotulo)` com `relatorioValido`; a queda só na terceira foi pega.
- Conferi se o CI mascara o código (`|| true`): só no passo de relatórios brutos, que é evidência e roda depois do portão.

## Achados

1. corrige antes de crescer (dono: Rafael, política do CP-03). Um registro que responde relatório vazio aprova o portão. Sinal disponível e ignorado: as 6 exceções somem todas de uma vez. Remédio possível: reprovar quando o relatório do aplicativo volta sem nenhuma das exceções que estavam presentes, ou fixar `--registry` no portão. Reprodução: `node $SP/val/engenharia-entrega/sondas/registro-falso.mjs vazio 55531 &` e `npm_config_registry=http://127.0.0.1:55531/ node scripts/auditar.mjs` (código 0).
2. anotado (herdado da rodada 2). A exceção é por nome de pacote: advisory nova num pacote aceito (por exemplo, uma terceira em `tinypool`) não reprova até o prazo.
3. anotado. O `expo-doctor` com checagem de versão só roda no job de linha de base, que exige `[ci completo]`; o job de todo push pula a checagem.

## Não verificado

- Compilação do binário nativo com os pacotes novos do Expo e o aplicativo num aparelho: sem emulador Android, e `pod install` é proibido aqui. Pendência registrada (V2-F14-E12).
- Windows nesta rodada.

## Risco residual

- O 21 de 21 vale para o registro do Expo de hoje: patch novo reabre a deriva.
- O portão depende da honestidade do registro configurado (achado 1).

## Motivo do humano

A correção 4 subiu cinco pacotes do Expo por analogia com a D1, e a própria correção diz que o Rafael não decidiu isso para estes cinco: a confirmação é dele. E a mudança de pacote nativo pede recompilar e instalar o aplicativo num aparelho, o que só uma pessoa com o aparelho faz.
