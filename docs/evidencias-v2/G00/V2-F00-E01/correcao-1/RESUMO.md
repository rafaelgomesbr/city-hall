# V2-F00-E01, correção 1: o roteiro da linha de base espera o que a árvore verde produz, e número velho reprova

Base: `6b01ac6`, ramo `v2/f00`. Motivo: rodada 1 reprovada (Infra e CI FAIL, confirmado pela arbitragem em Opus) no SHA `7005a60`. Itens do achado: V-ROT-01 do registro de vermelhos da E03.

## Fatos

**O defeito provado (três coisas).**

1. O roteiro saía com código 1 numa árvore verde. Em 7005a60 esperava 206 casos em `test:scripts` e rodavam 213; `auditar` e `expo-doctor` esperavam uma falha que não acontecia. Em 6b01ac6, antes da correção, a divergência tinha crescido: `test:scripts` 226 esperados contra 230, painel 643 contra 649, jest do aplicativo 1880 contra 1903, E2E da API "271" contra "279 e 50" (dois arquivos), `auditar` ainda esperando vermelho, `expo-doctor` esperando 20 de 21 com `codigo: "falha"` (que dá o mesmo código que um desastre qualquer).
2. A promessa em comentário "o `baseline.test.mjs` confere as duas tabelas contra os arquivos, então número esquecido reprova" era falsa por duas razões: o teste só percorria a tabela de arquivos (uma etapa, a E02), e o contador `/^test\(/gm` só via `test(` na coluna zero, então dava 0 para `auditar.test.mjs` (casos `it(` dentro de `describe`). O `conferir:numeros` também não lia `baseline.mjs`.
3. `COMO-REPRODUZIR.md` e o `RESUMO.md` da E01 descreviam a linha vermelha de 2026-09-30.

**O conserto, em quatro partes.**

- **(1) O esperado é o de hoje.** Em `dc360/scripts/baseline.mjs`: tabelas de esperado atualizadas (scripts +4 da E16 correção 1; painel +6 da E09 correção 1; aplicativo +4 da E15 correção 1 e +19 da E16 correção 1, medidos contando o aplicativo em cada commit com `contarCasosDoAplicativo`: 1880 em `a1760af`, 1884 em `a5da710`, 1903 em `81a5223`); `auditar` passa a esperar código 0; o E2E da API espera os dois "Passou:" (279 e 50); os dois `npm audit` crus continuam esperando falha, com o porquê escrito (política do CP-03 no `auditar`).
- **(2) Divergência explicada e nomeada.** Novo campo `divergenciaExplicada` no passo, com `id`, `onde`, `motivo`, `codigo` e `contem` (trechos). Nova situação `divergente-explicada`, que só vale quando a saída bate com a descrição inteira (código de saída e todos os trechos); saída diferente volta a `divergente`. O `expo-doctor` espera 21 de 21 e declara V-DEP-4 (item 17 de `dc360/apps/campo/PENDENCIAS.md`, deriva externa do Expo). Códigos de saída do roteiro: 0 tudo confere, 1 só divergência explicada, 3 divergência sem explicação, 2 roteiro quebrado (era: 1 para qualquer divergência). `contem` passou a aceitar lista. O `RESUMO.md` do roteiro diz quais divergências são explicadas e por quê.
- **(3) Fonte única mais conferidor.** As tabelas do `baseline.mjs` são a única fonte do total de cada suíte. Nova função exportada `conferirContagensDoRoteiro(medidas)`, usada por `scripts/conferir-numeros.mjs`, que mede as oito suítes (`vitest list` nos seis pacotes, com o pulo por ambiente descontado só onde a lista não o enumera; leitura estática do aplicativo; e o `node --test` real de `scripts/`, porque a conta dinâmica dá 230 onde `test(` no texto dá 226) e compara com o esperado de cada passo. Reprova com a diferença e o nome da tabela a atualizar. Também reprova passo com total esperado e sem medida, e medida sem passo. O `conferir:numeros` já roda no job "Testes, tipos e scripts" do CI.
- **(4) Documentação.** `COMO-REPRODUZIR.md` reescrito para o estado de hoje (histórico de 2026-09-30 preservado numa seção final); `dc360/README.md`, seção do roteiro, corrigida; `RESUMO.md` da E01 ganhou a seção da correção 1.

**Teste novo que morde** (`dc360/scripts/baseline.test.mjs`, de 16 para 26 casos; 10 novos):

| Prova | Saída | Resultado |
| --- | --- | --- |
| Os 10 casos novos contra o `baseline.mjs` de ANTES (HEAD) | `saidas-de-regressao/01-baseline-test-ANTES.txt` | VERMELHO: o arquivo nem carrega (`SyntaxError: ... does not provide an export named 'codigoDeSaida'`) |
| Os 26 casos contra o `baseline.mjs` novo | `saidas-de-regressao/02-baseline-test-DEPOIS.txt` | 26 de 26 |
| `conferir:numeros` com número velho PLANTADO no roteiro (scripts sem o +4 da E16, painel sem o +6 da E09) | `saidas-de-regressao/03-conferir-numeros-NUMERO-VELHO-PLANTADO.txt` | VERMELHO, código 1: "`test-scripts` ... espera 236 casos e a árvore tem 240 (+4) ... declara a diferença em TESTES_DAS_ETAPAS_SEGUINTES_EM_SCRIPTS" e idem para `teste-web` (643 contra 649, +6) |
| `conferir:numeros` com o roteiro certo | `saidas-de-regressao/04-conferir-numeros-DEPOIS.txt` | VERDE, código 0, 24 afirmações |

Os casos novos: o esperado é o da árvore verde; o `expo-doctor` 20 de 21 é explicado, e 19 de 21, outra verificação falhando ou outro código de saída continuam divergentes; `contem` em lista exige todos os trechos; os três códigos de saída; o resumo conta as explicadas; o conferidor reprova o 206 plantado contra 213 (a mensagem diz onde atualizar) e passa com o certo; desconto de pulo só onde cabe; suíte sem medida e medida sem passo reprovam; todo passo com total esperado aparece no `conferir-numeros.mjs`; a divergência explicada aponta para registros que existem (item 17 e V-DEP-4). O contador de casos da tabela de arquivos passou a ver `it(` com recuo, e a tabela ganhou `auditar.test.mjs` (20) e `portao-sem-promessa-de-segundo-plano-do-aplicativo.test.mjs` (4).

**Roteiro inteiro rodado do zero, hoje** (`saidas/`, redigida pelo próprio roteiro, com `RESUMO.md`, `resultados.json` e `INDEX.md`; `roteiro-stdout.log`): `node scripts/baseline.mjs --sem-instalar`, **código de saída 1**, 17 passos, **16 conferem, 0 divergentes sem explicação, 1 divergente explicada**:

| Passo | Medido |
| --- | --- |
| typecheck | código 0 |
| shared / db / campo (pacote) / API / console / painel | 168 / 327 e 3 pulados (330) / 223 / 1299 / 259 / 649, todos sem falha |
| jest do aplicativo | 1903 de 1903 |
| `test:campo` | código 0 |
| `test:scripts` | 240 casos, 236 ok, 0 falhas, 4 pulados |
| `conferir:numeros` | código 0 (24 afirmações; oito suítes do roteiro conferidas) |
| `auditar` | código 0 |
| `npm audit` raiz e campo | código 1 (esperado: vermelhos por desenho) |
| E2E do painel / E2E da API | "Passou: 70   Falhou: 0" / "Passou: 279   Falhou: 0" e "Passou: 50   Falhou: 0" |
| **`expo-doctor`** | **20/21, código 1: DIVERGENTE EXPLICADA, V-DEP-4** |

**A divergência explicada é uma só:** o `expo-doctor` dá 20 de 21 porque seis pacotes do Expo estão um patch atrás do que o SDK 57 exige hoje (`expo`, `expo-crypto`, `expo-location`, `expo-router`, `expo-splash-screen`, `jest-expo`). Deriva externa: o Expo publicou os patches depois do 21 de 21 de 2026-10-08. Está no item 17 de `dc360/apps/campo/PENDENCIAS.md` com dono Rafael. Não atualizei nada (o CP-03 não quer misturar SDK 57 e 58, e subir patch sem a suíte do aplicativo e o prebuild não é conserto de uma linha). O critério "expo-doctor 21 de 21" do gate G00 continua bloqueado por isso, e esta correção NÃO o fecha: ela só impede que o roteiro finja que está verde ou que fique "divergente" sem explicação.

**O CI (`.github/workflows/verificar.yml`, passo "Roteiro da linha de base"): o tratamento do código 1 como aviso NÃO continuava certo, e foi ajustado.** Antes, qualquer divergência (código 1) virava `::warning` e o job ficava verde; como o roteiro esperava números velhos, o aviso era constante e escondia divergência de verdade (foi o que o CI mostrou em 7005a60: 3 divergências, job verde). Agora: código 0 passa; código 1 passa com aviso, porque agora só significa "divergência explicada e nomeada"; código 3 (divergência sem explicação) FALHA o job com `::error`; e um código 1 com algum passo `divergente` no `resultados.json` também falha (o código e o arquivo têm de contar a mesma coisa). Código 2, arquivo faltando e contagem de passos errada continuam falhando. Efeito prático: um `npm audit` cru que fechar em zero, um advisory novo que derrube o `auditar` ou uma deriva nova do Expo que não seja a descrita fazem o job "Linha de base" falhar até alguém explicar. Esse job só roda com `[ci completo]`, `workflow_dispatch` ou na rodada semanal.

**Regressão** (`saidas-de-regressao/`): `npm run test:scripts` 240 casos, 236 ok, 4 pulados, código 0 (`05`); `npm run conferir:numeros` código 0 (`04`); `npm run typecheck` código 0 (`06`); portão de conteúdo 8 de 8 (`07`). Não toquei banco, API nem autorização: `test:isolamento` não se aplica (roda mesmo assim dentro do passo `teste-db`: 327 e 3 pulados, verde).

**Limitações (ditas abertamente).**

- Os dois passos `npm ci` NÃO rodaram aqui (`--sem-instalar`, proibido nesta máquina, `docs/roadmap-v2/29-operacao-do-ambiente.md`): o roteiro rodado tem 17 dos 19 passos. A prova de máquina limpa e de Linux é o job do CI, que ainda não foi rodado com esta correção (nada foi commitado nem subido por mim).
- Uma só máquina (Windows 11). O `npm audit` e o `expo-doctor` dependem de rede e do dia: os números de hoje (3 avisos na raiz, 61 no campo, 6 pacotes do Expo) podem mudar.
- O passo do Firefox (D-4 do registro da E03, medido à mão) continua fora do roteiro; não era escopo desta correção.
- Os totais de verificações dos dois E2E (70, 279 e 50) só se conferem rodando o roteiro; o `conferir:numeros` não os alcança. A contagem estática de `ok(` (251 na API) é outra grandeza.
- A explicação do `expo-doctor` não expira sozinha: quando o Rafael subir os patches, o passo passa a "confere" e a declaração `divergenciaExplicada` deve ser removida de `PASSOS` à mão.
- `GUIA-DE-VALIDACAO-F00.md:414` (menciona 206) é arquivo do gatekeeper e não foi tocado.

Arquivos: `dc360/scripts/baseline.mjs`, `dc360/scripts/baseline.test.mjs`, `dc360/scripts/conferir-numeros.mjs`, `.github/workflows/verificar.yml`, `dc360/README.md`, `docs/evidencias-v2/G00/V2-F00-E01/COMO-REPRODUZIR.md` e `RESUMO.md`. Patch em `diff-da-correcao.patch`.

## Justificativa

A etapa existe para que "divergente" signifique defeito. Um roteiro que sai 1 numa árvore saudável ensina o leitor a ignorar o RESUMO, e um CI que trata esse 1 como aviso esconde exatamente a divergência que importa. Por isso a correção atacou os três elos juntos: o esperado passou a ser o de hoje; a divergência que não se pode consertar (deriva do Expo, decisão do Rafael) passou a ser nomeada, com o registro onde está descrita e a condição exata em que vale, em vez de aceita calada; e a promessa de que número esquecido reprova passou a ser verdadeira, porque o conferidor mede a árvore com a mesma conta que o roteiro (a dinâmica do `node --test`), reprova com a diferença e o nome da tabela, e tem teste que o prova com um número velho plantado. O conferidor mora no `conferir:numeros` e não no teste de `scripts/` porque medir a árvore exige rodar o `vitest list` e o próprio `node --test`, o que dentro de um teste do `node --test` seria recursão e carga. O código de saída 3 para divergência sem explicação separa o "aviso conhecido" do "reprova", sem mudar o que o 2 sempre quis dizer (roteiro quebrado).
