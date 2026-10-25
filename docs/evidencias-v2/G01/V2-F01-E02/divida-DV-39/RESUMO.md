# V2-F01-E02, dívida DV-39: o CI não rodava o Metro sobre o aplicativo de campo

## Fatos

- **Registro:** a dívida DV-39 não tinha linha em `docs/roadmap-v2/dividas.md` neste ramo (a tabela termina na DV-32); foi registrada e paga no mesmo lote, direto em "Resolvidas".
- **Conserto:** commit `2c9d439` (`.github/workflows/verificar.yml`, `dc360/scripts/conferir-empacotamento-do-campo.mjs` e o teste dele).
- **O passo.** No job `aplicativo`, depois das verificações do Expo: `npx expo export --platform android --platform ios --no-bytecode`, com `timeout-minutes: 10` NO PASSO (além do `timeout-minutes: 15` do job), `CI=1` e `EXPO_NO_TELEMETRY=1`. `expo export` empacota só o JavaScript (sem Gradle nem Xcode): o Metro resolve `@dc360/shared`, `@dc360/campo` e o zod 4 pelo `metro.config.js` real, que o jest não exercita. Local: android 1757 módulos e ios 1630 módulos, cerca de 4 a 16 s (`saidas/01-expo-export-android-ios.txt`).
- **O conferidor.** `conferir-empacotamento-do-campo.mjs` abre o `metadata.json` e o pacote de cada plataforma e exige: pacote presente e com mais de 1 MB; a propriedade interna `_zod` (o zod 4 está DENTRO do pacote, e o zod 3 não a tem); e o código do `@dc360/shared` (o campo `gpsPrecisaoMetros`). Sai com o tamanho e o SHA-256 de cada pacote (`saidas/02-conferir-empacotamento.txt`: android 3048752 bytes, ios 2800257 bytes).
- **Artefato.** A saída do Metro (`08-expo-export.txt`), o `metadata.json` (`08-expo-export-metadata.json`) e a conferência com os SHA-256 (`08b-empacotamento-conferido.txt`) vão para `aplicativo-<sha>` pelo passo `always()` que já existia. Os pacotes em si (cerca de 3 MB cada) não sobem.
- **Prova de mordida contra o Metro real** (`saidas/04-mutante-import-inexistente-reprova-o-metro.txt`): com `import "@dc360/pacote-que-nao-existe";` em `src/app/_layout.tsx`, o `expo export` sai com código 1 e `Error: Unable to resolve module @dc360/pacote-que-nao-existe`. Revertido com `git checkout`.
- **Testes do conferidor** (`saidas/03-conferir-empacotamento-test.txt`, 3 de 3): passa com zod 4 e shared; reprova sem zod 4, sem shared, pacote pequeno, pacote ausente, plataforma que o `metadata.json` não lista e lista de plataformas vazia; e o comando com 0, 1 e 2. Teste do workflow: com o `timeout-minutes` do passo retirado, ou o `expo export` trocado por `echo`, reprova (`../divida-DV-13/saidas/03-mutantes-do-yaml.txt`).

## Justificativa

- Escolhi `expo export` (e não `expo start` ou um build nativo) por ser o equivalente mais barato que passa o aplicativo inteiro pelo Metro e é determinístico, sem emulador, sem SDK Android e sem conta EAS.
- `--no-bytecode` deixa o pacote legível para o conferidor; o bytecode Hermes só mudaria o formato do artefato, não a resolução de módulos.

## Limitações

- **Mutante que NÃO morre** (`saidas/05-mutante-exports-desligado-NAO-reprova.txt`): trocar `unstable_enablePackageExports` para `false` em `metro.config.js` NÃO faz o export reprovar, porque o Metro cai no `main` dos pacotes e o zod 4 e o shared continuam empacotados. O passo pega o que o Metro não consegue resolver, não toda mudança de configuração dele. Registrado para ninguém achar que o passo cobre esse caso.
- O passo roda em Linux; a prova final é o run do CI (nunca rodou lá). A primeira execução também mostra o tempo real do passo.
- Sem push.
