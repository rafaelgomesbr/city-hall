---
validador: qa
modelo: claude-sonnet-5-5
etapa: V2-F00-E01
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

Saídas em `C:/Users/Rfasg/AppData/Local/Temp/claude/c--Projetos-city-hall/b62645e7-c436-45b4-8ce0-4d68f4fb420f/scratchpad/qa-infra/` (abreviado `qa-infra/` abaixo).

| Critério (DoD e testes da etapa) | Resultado | Prova |
| --- | --- | --- |
| `baseline.mjs --so-listar` imprime os comandos sem executar | PASS | `qa-infra/06-so-listar.txt`: código 0, 19 passos |
| `node --test scripts/baseline.test.mjs` verde | PASS | `qa-infra/03-baseline-test-base.txt`: 26 de 26 |
| O roteiro reproduz o estado de hoje | PASS | Saída do gatekeeper (`scratchpad/baseline/RESUMO.md`): 17 de 17 "confere", 0 divergentes. Eu repeti 3 passos reais (`test-scripts`, `auditar`, `expo-doctor`): todos "confere", código 0 (`qa-infra/07-baseline-subset.txt`). `expo-doctor` dá 21 de 21 |
| Divergência sem explicação reprova (código 3) e não se esconde | PASS | Mutações abaixo (A e B), mais `avaliar` lido em `scripts/baseline.mjs:650-676` |
| Redação mascara JWT, `Bearer`, URL com credencial antes de gravar | PASS | `qa-infra/redigir-sonda.mjs`, 12 amostras: JWT, `Bearer` e `bearer`, `postgres:` com usuário e senha, `postgresql://` com senha codificada, `mysql://`, `https:` com usuário e senha (amostra descrita por extenso pelo gatekeeper em 2026-10-13: o literal disparava a varredura de segredo do `conferir-evidencia`), `Basic`, JWT dentro de JSON, `DATABASE_URL=...`, pasta de usuário `C:/Users/<nome>` e `/c/Users/<nome>` viram `[REDIGIDO]`/`[usuario]`; U+2014 vira `[travessao]` |
| Documentação de como reproduzir bate com o que o roteiro faz | FAIL | Achado 1 |
| `.nvmrc` com `22`; matriz de versões | PASS | `dc360/.nvmrc` = `22`; `README.md:1059` |

## Evidência

- `qa-infra/03-baseline-test-base.txt` (26 de 26), `04-mutA-explicacao-ignora-codigo.txt`, `05-mutB-falha-esperada-aceita-verde.txt`, `06-so-listar.txt`, `07-baseline-subset.txt`, `90-baseline-audit-offline.txt`.
- Leitura direta de `docs/evidencias-v2/G00/V2-F00-E01/COMO-REPRODUZIR.md` e `dc360/README.md`.

## Cenários positivos

`node scripts/baseline.mjs --sem-instalar --so=expo-doctor,test-scripts,auditar --saida=<scratchpad>`: código 0, os três passos "confere" (`expo-doctor` 21 de 21 sem pular a checagem de versões).

## Cenários negativos

- Mutação A (`explicacaoServe` passa a ignorar o código de saída): `baseline.test.mjs` fica 25 de 26, vermelho em "a deriva do expo-doctor, quando descrita num passo, é divergência EXPLICADA e nomeada; sem descrição, é divergente". `git restore`, 26 de 26.
- Mutação B (`avaliar` deixa de marcar "esperava falha e ficou verde"): vermelho em "avaliar marca divergente quando fica verde sem esperar, e quando a contagem muda". `git restore`, 26 de 26.
- Registro npm fora do ar (`npm_config_registry=http://127.0.0.1:9`): `--so=audit-raiz,audit-campo` sai 0 e os dois passos ficam "confere" com `npm audit` falhando por `ECONNREFUSED` (`qa-infra/90-baseline-audit-offline.txt`). Ver achado 2.

## Tentativas de reprovar

1. Procurei texto que ainda descreva a linha vermelha: achado 1.
2. Procurei passo que "confere" sem ter medido: `audit-raiz` e `audit-campo` (achado 2).
3. Procurei suíte fora da conferência de contagens: `conferir:numeros` mede as oito suítes (`qa-infra/02-conferir-numeros.txt`, antes de os testes temporários de outro validador entrarem em `apps/api/test`: 24 afirmações, "espera o mesmo total de casos que a árvore tem, nas oito suítes").
4. Segredo e caminho de usuário na saída do roteiro: a redação cobre; não procurei `PGPASSWORD=`, `ghp_` nem `Cookie:` (a etapa não promete).
5. Mutações em `scripts/baseline.mjs` desfeitas com `git restore`; `git status` sem arquivo meu.

## Achados

1. **BLOQUEIA (documental, correção de minutos).** `docs/evidencias-v2/G00/V2-F00-E01/COMO-REPRODUZIR.md` linhas 65, 67 e 78 afirmam que o `expo-doctor` dá 20 de 21, que é a divergência explicada V-DEP-4 e que "uma árvore verde e rede disponível dão código **1**; código 0 só volta quando os seis patches do Expo forem aplicados". `dc360/README.md:1172-1173` repete: "Hoje a única divergência explicada é o `expo-doctor` (V-DEP-4)". Os seis patches foram aplicados (E19, correção 2) e o roteiro sai 0 com 17 de 17 (gatekeeper) e 19 de 19 (CI Linux, relatado por engenharia-entrega). A tabela de códigos do mesmo arquivo (linha 48) diz que 0 é "Todos os 19 passos confere": o texto se contradiz. A DoD pede que a segunda pessoa obtenha o mesmo resultado; quem seguir o texto espera 1 e recebe 0. Reprodução: `node scripts/baseline.mjs --sem-instalar --so=expo-doctor` (código 0) contra o texto. Dono: E01. Remédio: reescrever os dois trechos ("código 0; nenhuma divergência explicada hoje").
2. **Corrige antes de crescer.** `audit-raiz` e `audit-campo` esperam `codigo: "falha"`, que aceita qualquer código diferente de zero. Sem rede o `npm audit` também sai 1 e o passo "confere" sem ter auditado nada (reprodução acima). Mesma classe do achado da E19.
3. Anotado. `docs/evidencias-v2/G00/V2-F00-E01/AMBIENTE.md` descreve a medição de 2026-10-05 (Node 22.17.0, `e82719e`) e o próprio arquivo diz que não é máquina limpa; a prova de máquina limpa em Linux é o job do CI, não este arquivo.

## Não verificado

- `npm ci` limpo e execução completa dos 19 passos localmente (proibido por `29-operacao-do-ambiente.md`); vale o gatekeeper (17 de 17) e o Linux do CI, que eu não baixei de novo.
- Segunda máquina e macOS.
- Redação de `PGPASSWORD=`, `ghp_`, `Cookie:`.

## Risco residual

Documento de reprodução desatualizado leva a segunda pessoa a duvidar de um resultado certo. O roteiro aceita `npm audit` fora do ar como "confere".

## Motivo do humano

Não aplicável: a emenda D-30 substitui a segunda pessoa humana para esta etapa.
