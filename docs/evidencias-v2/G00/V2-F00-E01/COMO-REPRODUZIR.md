# Como reproduzir a linha de base, do zero (V2-F00-E01)

Para quem vai repetir a medição numa máquina sem estado prévio do projeto: uma segunda pessoa, ou o Rafael noutro computador. Leva cerca de uma hora e meia, a maior parte em espera.

## O que a máquina precisa ter

- Node 22 (o arquivo `dc360/.nvmrc` diz `22`). Com `nvm`, `nvm use` dentro de `dc360`.
- npm 10 (vem com o Node 22).
- Git, e acesso de leitura ao repositório (privado).
- Acesso à internet: `npm ci`, o download dos navegadores do Playwright e o `expo-doctor` precisam.
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

6. Abra `RESUMO.md` na pasta de saída. Cada linha diz `confere` (o resultado é o esperado de 2026-09-30, vermelho inclusive) ou `divergente` (é outro, para melhor ou para pior). Divergência tem de ter explicação escrita: versão de dependência que mudou, advisory novo, diferença de sistema operacional.

## O que esperar

A linha de base é vermelha de propósito: as etapas V2-F00-E02 a E25 consertam. Os números esperados estão em `RESUMO.md` e em `PASSOS` dentro de `scripts/baseline.mjs`. Em resumo, de 2026-09-30:

- passam: `typecheck`, db (318 testes, 3 pulados de propósito), `packages/campo` (159), console (259);
- falham: shared (1 de 149, o travessão), web (14 de 550), API (2 de 1109, mais 18 pulados), jest do aplicativo (20 de 1801), `test:scripts` (3), `conferir:numeros` (13 afirmações), `auditar`, `npm audit` das duas árvores, `expo-doctor` (20 de 21) e os dois E2E.

Em Windows o `auditar` quebra por `spawnSync npm ENOENT`; em Linux e macOS isso não deve acontecer, e se não acontecer é uma divergência esperada e explicável (a etapa V2-F00-E21 trata).

## Anexar ao fechar a validação humana

- O último run do workflow **Verificar** no GitHub (link ou captura), porque o repositório é privado e o resultado do CI é NÃO CONFIRMADO sem isso.
- O `RESUMO.md` da segunda máquina, com a explicação de cada divergência.
- Nada de segredo: o roteiro redige JWT, `Bearer`, `Basic`, URL com senha e a pasta pessoal, mas confira o texto antes de anexar.
