---
validador: engenharia-entrega
modelo: claude-sonnet-5-5
etapa: V2-F00-E19
sha_validado: 4b96ea7
ci_run: 38445527075
rodada: 2
herdado_de:
tags: [INFRA]
nivel_de_prova_exigido: [E1, E2]
nivel_de_prova_obtido: [E1, E2]
veredito: FAIL
confianca: alta
humano_necessario: nao
escalar: nenhum
---
## Critérios verificados

- Exceção sem prazo, sem dono, sem motivo, com prazo inválido ou vencido reprova (defeito da rodada 1): CONSERTADO. `problemasDasExcecoes` em `dc360/scripts/auditar-excecoes.mjs` valida TODAS as entradas das duas listas (`ACEITAS_NO_APLICATIVO` e `ACEITAS_EM_DESENVOLVIMENTO`) antes de qualquer auditoria, e `auditar.mjs` sai 1 com a frase por defeito. Prazo exige AAAA-MM-DD existente no calendário.
- Runtime vulnerável reprova sempre: PASS pelo teste ("reprova vulnerabilidade de runtime") e pelo código (`auditar.mjs:97`).
- Exceção com correção disponível reprova, salvo `comCorrecao: true` (só `brace-expansion` e `shell-quote`, CP-03 de 2026-10-07): PASS.
- `npm audit` da raiz sai 1 só por ferramenta de desenvolvimento: PASS. `npm audit --omit=dev` da raiz: `total: 0` no artefato do CI (`03-audit-raiz-runtime.json`); o `npm audit` completo traz 3 (vitest, `@vitest/mocker`, tinypool), todos nomeados em `ACEITAS_EM_DESENVOLVIMENTO` com dono Rafael e prazo 2027-01-05.
- `expo-doctor` 21 de 21 sem pular a checagem de versões: PASS (`baseline/17-expo-doctor.txt` do CI Linux: "21/21 checks passed", e `15-expo-doctor.txt` do gatekeeper). O job "Aplicativo de campo" continua pulando só a checagem de versão de pacote (`EXPO_DOCTOR_SKIP_DEPENDENCY_VERSION_CHECK=1`, 20 de 20 no artefato `07-expo-doctor.txt`), e isso está documentado no comentário do passo (`verificar.yml:523-536`) e em `README.md:1585`.
- O portão não pode dar verde quando não auditou: FAIL (achado 1).

## Evidência

Run 38445527075 (sobre `c9895e9`, success, 9 de 9 jobs; `git diff 4b96ea7..c9895e9` só toca `ROTEIRO-G00.md`, `ESTADO-ATUAL.md` e `STATUS.md`). Job "Dependências com vulnerabilidade conhecida (auditar)" (115462783948) success; artefato `dependencias-c9895e9...`: `01-auditar.txt` "Runtime limpo, e o aplicativo sem advisory nova", seis aceitas no aplicativo e três de desenvolvimento, todas com dono e prazo. `npm run auditar` rodado por mim hoje: código 0, mesma saída (`scratchpad/eng/out/e19-auditar-real-hoje.txt`). `node --test scripts/auditar.test.mjs`: 23 de 23 (`out/e19-auditar-test-base.txt`).

## Cenários positivos

Runtime limpo passa; aceita nomeada com prazo futuro passa; dev nomeado aparece como "aceita (desenvolvimento) ... dono Rafael, até 2027-01-05"; cópia do portão sem adulteração passa (controle do próprio teste).

## Cenários negativos

- Sonda pedida (exceção sem prazo): removi `ate: PRAZO` de `node-forge` no arquivo real e rodei `npm run auditar`: código 1, "REPROVADO: 1 defeito(s) na lista de exceções ... node-forge: exceção sem prazo" (`out/e19-mut1-sem-prazo.txt`). `git restore`, verde de novo.
- Mordida do teste: desliguei a checagem de prazo ausente em `problemasDasExcecoes` e rodei os testes: 20 de 23, três vermelhos ("reprova exceção sem prazo", "aponta todos os defeitos de uma vez" e "reprova a exceção sem prazo, mesmo que o pacote esteja no relatório", este de ponta a ponta com cópia do portão) (`out/e19-mut2-funcao-sem-checar-prazo.txt`). `git restore`, 23 de 23.
- Dono ausente na lista de desenvolvimento (`tinypool`): `npm run auditar` código 1, "(desenvolvimento) tinypool: exceção sem dono" (`out/e19-mut3-dev-sem-dono.txt`). `git restore`.
- Os testes leem também prazo vencido (2020-01-01), prazo fora de calendário (nove formas) e dono e motivo em branco.
- Registro fora do ar: `npm_config_registry=http://127.0.0.1:9 node scripts/auditar.mjs` (FAIL, ver achado 1).

## Tentativas de reprovar

1. Feri o prazo, o dono e o motivo em três pontos diferentes (arquivo real, função e lista de desenvolvimento): todos reprovam.
2. Procurei exceção que não depende de prazo: `comCorrecao: true` dispensa a regra "correção existe" sem exigir justificativa própria além do `motivo`; as duas entradas trazem `SEM_FIX_SEGURO` no motivo. Aceito pelo CP-03.
3. Procurei como o portão decide "limpo": ele soma `metadata.vulnerabilities.total`. Troquei o registro por uma porta fechada: `npm audit --json` devolve `{"message": "request to ... failed", "error": {...}}` com código 1 e sem `metadata` (`out/e19-audit-offline.json`); `contar()` lê `?? {}` e devolve 0. Resultado: `npm run auditar` saiu 0 imprimindo "Runtime (vai para a imagem): 0", "Aplicativo de campo: 0" e "Runtime limpo, e o aplicativo sem advisory nova" (`out/e19-auditar-registro-fora.txt`). É fail-open.
4. Procurei advisory nova num pacote já aceito: a lista é por NOME de pacote, não por advisory nem por gravidade. O aplicativo hoje tem 1 crítica e 46 altas em runtime (`05-audit-campo-runtime.json`) dentro das seis exceções; uma advisory nova (inclusive crítica) num desses seis passa até 2027-01-05.
5. Procurei texto que ainda diga 20 de 21: achei (achado 2).

## Achados

1. BLOQUEIA (corrige antes de crescer): `scripts/auditar.mjs` é fail-open quando o `npm audit` não consegue auditar. Com o endpoint de avisos inalcançável ou respondendo erro, o JSON vem sem `metadata`, a contagem é 0 e o script sai 0 com "Runtime limpo". Reprodução: `cd dc360 && npm_config_registry=http://127.0.0.1:9 npm_config_fetch_retries=0 node scripts/auditar.mjs; echo $?` imprime 0. O CI roda esse script no job "Dependências", então uma indisponibilidade do endpoint de avisos daria verde sem auditoria; o passo `audit-*` do roteiro de baseline (que espera "falha" e aceita qualquer código não zero) também vira "confere" sem auditar. É a mesma classe do defeito da rodada 1 (portão que aprova sem ter verificado) num controle P0 de segurança (BZ-F:P0-SEG; ASVS V14.2). Remédio pequeno: em `auditar()`, tratar relatório com `error` ou sem `metadata.vulnerabilities` como exit 2 com mensagem, e acrescentar um teste com o `npm` falso devolvendo `{"error": {...}}`. Hoje nenhum dos 23 testes cobre isso (o `npm` falso só devolve relatório válido).
2. Corrige antes de crescer (documental): `dc360/README.md:1613` ainda diz que o aplicativo "passa no `expo-doctor` menos uma verificação, a de versões de pacote (seis patches novos do Expo, pendência 17)", e `README.md:1173` diz que "a única divergência explicada é o `expo-doctor` (V-DEP-4)". Os dois contradizem `README.md:16`, `LEIA-ME.md:23`, o `PENDENCIAS.md` item 17 (RESOLVIDO) e o CI (21 de 21). O bloco exige que "21 de 21" só apareça se for verdade e que o README traga a política; o `conferir:numeros` não pega frase sem número.
3. Anotado: exceção por nome e não por advisory/gravidade (tentativa 4). Vale registrar no README da política que advisory nova num pacote aceito não reprova até o prazo.
4. Anotado: o `expo-doctor` 21 de 21 não se sustenta no tempo (patch novo do Expo toda semana) e só o job de baseline (com `[ci completo]`) o mede sem pular a versão; nada o vigia em todo push. Desenho documentado.

## Não verificado

`test:isolamento`, `superficie.test.ts`, `test:campo` e `test:e2e:api` depois do `npm audit fix`/`expo install --fix` (proibidos nesta rodada; vale o CI: jobs "Testes, tipos e scripts", "Aplicativo de campo" e "Fluxo ponta a ponta" verdes, e a saída de baseline do gatekeeper). Leitura da lista de exceções por Rafael (CP-03 já decidido; ele deve reler após o remédio, se quiser). Novo binário nativo com os seis pacotes do Expo (não compilado).

## Risco residual

Até o achado 1 ser corrigido, uma falha do serviço de avisos produz verde falso num controle de segurança. Exceções do aplicativo por nome aceitam advisory nova sem aviso.

## Motivo do humano

Não aplicável (o CP-03 já foi decidido por Rafael).
