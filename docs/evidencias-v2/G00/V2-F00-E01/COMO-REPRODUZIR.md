# Como reproduzir a linha de base, do zero (V2-F00-E01)

Para quem vai repetir a medição numa máquina sem estado prévio do projeto: uma segunda pessoa, ou o Rafael noutro computador. Leva cerca de uma hora e meia, a maior parte em espera.

Este texto foi reescrito na correção 1 da etapa (2026-10-13). O roteiro deixou de esperar a linha vermelha de 2026-09-30 e passou a esperar o que a árvore verde produz hoje. A linha vermelha original ficou preservada na seção "Histórico" no fim.

## O que a máquina precisa ter

- Node 22 (o arquivo `dc360/.nvmrc` diz `22`). Com `nvm`, `nvm use` dentro de `dc360`.
- npm 10 (vem com o Node 22).
- Git, e acesso de leitura ao repositório (privado).
- Acesso à internet: `npm ci`, o download dos navegadores do Playwright, o `npm audit` e o `expo-doctor` precisam.
- Cerca de 6 GB livres em disco.

## Passo a passo

1. Clone o repositório e entre em `dc360`.
2. Não instale as dependências à mão: o roteiro roda o `npm ci` das duas árvores (raiz e `apps/campo`, que são independentes) como primeiros passos.

3. Instale os navegadores dos testes de ponta a ponta:

   ```bash
   npx playwright install chromium firefox
   ```

4. Veja o roteiro sem executar nada:

   ```bash
   node scripts/baseline.mjs --so-listar
   ```

5. Rode tudo e arquive a saída em uma pasta sua (não suba para o repositório sem conferir):

   ```bash
   node scripts/baseline.mjs --saida=../baseline-da-minha-maquina
   ```

   Não use `--sem-instalar` numa máquina nova: ele existe para quem já tem as árvores instaladas e não quer apagá-las. Para repetir só alguns passos: `--so=typecheck,teste-db`.

6. Olhe o código de saída e abra `RESUMO.md` na pasta de saída.

## Como ler o resultado

O código de saída do roteiro diz o que esperar:

| Código | Significa | O que fazer |
| --- | --- | --- |
| 0 | Todos os 19 passos "confere" | Nada. |
| 1 | Há divergência, mas SÓ de passo "divergente-explicada" | Ler a linha do `RESUMO.md`: ela traz o nome do achado e o arquivo que o descreve. |
| 3 | Há passo "divergente" (sem explicação) | É defeito, deriva externa nova ou contabilidade atrasada. Não se anexa um resumo assim sem explicar cada linha. |
| 2 | O próprio roteiro quebrou (opção inválida, pasta ilegível) | Corrigir o roteiro. |

Cada linha do `RESUMO.md` tem uma situação:

- `confere`: o resultado é o esperado (código de saída, contagens e trecho da saída).
- `divergente-explicada`: o resultado difere do esperado, mas é um achado conhecido, NOMEADO no próprio roteiro, e a saída bate com a descrição inteira (código de saída e trechos). A divergência continua escrita na linha; ela só deixa de ser um mistério.
- `divergente`: o resultado é outro e ninguém o explicou. Pode ser melhor ou pior que o esperado; nos dois casos é achado.

## O que esperar

O esperado de cada passo está em `PASSOS`, dentro de `scripts/baseline.mjs`, e o total de casos de cada suíte é a soma de uma base mais o que cada etapa da fase F00 declarou mudar. Em resumo, na árvore verde de 2026-10-13 (Windows e Linux do CI; o que mudou na rodada de 2026-10-14 está no fim desta seção):

- passam, com código 0: `typecheck`, as suítes de `packages/shared`, `db` (inclui o isolamento, com 3 pulados por ambiente em `busca.test.ts`), `packages/campo`, `apps/api` (9 pulados por ambiente: o bloco de Postgres real de `renovacao-contra-encerramento.test.ts`, que só roda com `DC360_POSTGRES_DE_PROVA`; o `vitest run` imprime 1319 casos contra 1310 da lista), `apps/console` e `apps/web`, o jest do aplicativo de campo, `npm run test:campo`, `npm run test:scripts` (4 pulados por ambiente, a pasta `ios/` que não existe), `conferir:numeros`, `auditar` e os dois E2E;
- falham de propósito: os dois `npm audit` crus (raiz e `apps/campo`). A política do CP-03 aceita o que eles apontam, e quem decide é o `auditar`, que sai 0. Se um deles fechar em 0, o passo diverge de propósito: é a notícia de que a exceção pode sair;
- nenhuma divergência explicada: o `expo-doctor` deu 21 de 21 em 2026-10-13, 20 de 21 na manhã de 2026-10-14 (cinco patches novos do Expo) e 21 de 21 de novo nesse mesmo dia, depois da correção 4 da E19 (ver o fim desta seção). A deriva que o roteiro nomeava como **V-DEP-4** (seis pacotes do Expo um patch atrás do que o SDK 57 exige, publicados depois do 21 de 21 de 2026-10-08) foi fechada em 2026-10-13: o Rafael decidiu atualizar, os seis patches foram aplicados (item 17 de `dc360/apps/campo/PENDENCIAS.md`) e o passo confere sozinho. Se a deriva voltar (o Expo publica patch novo a toda hora), o passo diverge de propósito e a causa se descreve em `divergenciaExplicada` só se a decisão for não atualizar na hora.

Portanto uma árvore verde e rede disponível dão código **0**: 19 de 19 passos "confere" numa máquina nova, ou 17 de 17 com `--sem-instalar` (o `npm ci` das duas árvores não roda), **no dia em que o `expo-doctor` está verde**. **Medido em 2026-10-14 num Mac (Node 24, `--sem-instalar`), sobre a árvore final: 15 de 17, código 3**, por dois passos que dependem da máquina, e nenhum é regressão de teste de produto: `teste-api` (o `openssl` do macOS é LibreSSL e o caso "respeita OPENSSL_CONF válido" de `openssl-do-teste.test.ts` espera o OpenSSL 3: 1 falha, 1309 aprovados e 9 pulados de 1319) e `test-scripts` (a pasta `apps/campo/ios/` existe nesta máquina, os 4 testes que pulam sem ela rodam: 0 pulados contra 4 esperados). Os outros 15 conferem, o `expo-doctor` entre eles (21 de 21). Histórico do mesmo dia: a medição da manhã (E22, correção 2) deu 14 de 17, porque o `expo-doctor` estava em 20 de 21 (cinco patches novos do Expo, `apps/campo/PENDENCIAS.md`, item 17); a E19, correção 4, subiu esses cinco e o passo voltou a conferir (premissa: o Rafael decidiu atualizar os seis pacotes de 2026-10-13, não estes cinco, e a confirmação dele está pendente). As saídas da árvore final estão em `docs/evidencias-v2/G00/V2-F00-E19/correcao-4/saidas/linha-de-base-final/` (as 17 saídas brutas e o `RESUMO.md`; o LibreSSL e a pasta `ios/` estão em `saidas/09-ambiente-do-mac.txt`). Nesse caso quem reproduz vê código 3, e o RESUMO.md diz qual passo e por quê. Sem rede o resultado NÃO vale: `npm audit` e `expo-doctor` dependem do registro, e o roteiro não confere um `npm audit` cru que saiu "falha" sem trazer o relatório (`# npm audit report`), justamente porque registro fora do ar também sai com código diferente de zero sem ter auditado. Nesse caso o passo diverge (código 3).

## Quem garante que o roteiro não fica velho

O total esperado de cada suíte tem uma fonte única, as tabelas de `scripts/baseline.mjs`, e `npm run conferir:numeros` as lê (`conferirContagensDoRoteiro`) e compara com os casos que a árvore tem: `vitest list` por pacote, a leitura estática do aplicativo e o `node --test` de `scripts/`. Quem acrescenta ou remove teste sem declarar a diferença no roteiro reprova ali, com a diferença e o nome da tabela a atualizar na mensagem. O `conferir:numeros` roda no job do CI "Testes, tipos e scripts" em todo push.

Isso não cobre, e é dito aqui para não parecer que cobre: as verificações que só existem na execução dos dois E2E de navegador (o "Passou: N" que eles imprimem ao terminar, conferido só pelo roteiro completo), e o conteúdo exato das saídas do `npm audit` e do `expo-doctor`.

## Anexar ao fechar a validação

- O último run do workflow **Verificar** no GitHub (link ou captura), porque o repositório é privado e o resultado do CI é NÃO CONFIRMADO sem isso. O job "Linha de base (baseline.mjs) em Linux" só roda com `[ci completo]` na mensagem do commit, por `workflow_dispatch` ou na rodada semanal.
- O `RESUMO.md` da segunda máquina, com a explicação de qualquer divergência (hoje não há nenhuma esperada).
- Nada de segredo: o roteiro redige JWT, `Bearer`, `Basic`, URL com senha e a pasta pessoal, mas confira o texto antes de anexar.

## Histórico: a linha vermelha de 2026-09-30

Até a correção 1, este texto descrevia a linha de base como vermelha de propósito, com as etapas V2-F00-E02 a E25 consertando-a. Os números esperados eram os de 2026-09-30 (REL:01, seção 3.4):

- passavam: `typecheck`, db (318 testes, 3 pulados de propósito), `packages/campo` (159), console (259);
- falhavam: shared (1 de 149, o travessão), web (14 de 550), API (2 de 1109, mais 18 pulados), jest do aplicativo (20 de 1801), `test:scripts` (3), `conferir:numeros` (13 afirmações), `auditar`, `npm audit` das duas árvores, `expo-doctor` (20 de 21) e os dois E2E.

Em Windows o `auditar` quebrava por `spawnSync npm ENOENT` (tratado na V2-F00-E21). Esses números seguem arquivados em `docs/auditoria-v2/` e em `docs/evidencias-v2/G00/V2-F00-E01/saidas/`. Não são mais o que o roteiro espera.
