# V2-F01-E13, dívida DV-29: o `app.config.ts` deixa de depender do `--experimental-strip-types` do Node

Dívida registrada em `docs/roadmap-v2/dividas.md` (riscos de `docs/evidencias-v2/G01/V2-F01-E13/RESUMO.md`, 2026-10-24), prazo "antes do G01". Feito sobre `c78a98a` (ponta de `v2/f01`), macOS arm64. Conserto no commit `2563fd8`.

## Fatos

- **O defeito.** `scripts/perfis-do-eas.test.mjs` carregava o `apps/campo/app.config.ts` com `node --experimental-strip-types`, que só APAGA anotações de tipo. No Node 22.17 a bandeira é obrigatória (e some quando o recurso vira padrão), e `enum`, `namespace` e propriedade de parâmetro (sintaxe que gera código) fazem o Node recusar o arquivo com `ERR_UNSUPPORTED_TYPESCRIPT_SYNTAX` em qualquer versão. Quem usasse um `enum` no `app.config.ts` quebraria este teste por um motivo que não é o contrato dos perfis.
- **O conserto.** `emJavaScript(texto, nome)` converte o TypeScript com o compilador `typescript` que a raiz já instala (`ts.transpileModule`, módulo ES2022); `resolverConfiguracao` grava o resultado numa pasta temporária (`app.config.mjs`), importa de lá num processo filho (`file://`, o mesmo cuidado do Windows de antes) e apaga a pasta. Nenhuma bandeira experimental do Node. Erro de sintaxe no TypeScript reprova com o nome do arquivo e a mensagem do compilador, em vez de entregar um módulo pela metade.
- **Funciona no Node 22 do `.nvmrc` e no 24 (`saidas/01`, `02`, `03`).** `perfis-do-eas.test.mjs`: 22 de 22 no Node **22.17.0** (a versão da dívida), **22.23.4** (último 22) e **24.15.0**. Os 20 casos de antes (bundle, pacote, nome e esquema por perfil, URLs, `google-services.json`, negativos) passam sem mudança.
- **Casos novos (2).** (1) um `app.config` de fixture com `enum`, `namespace` e `class` com propriedade de parâmetro carrega e resolve `ios`, `android` e `pushAmbiente`; (2) `emJavaScript` reprova TypeScript com erro de sintaxe e apaga as anotações de tipo (`as number`).
- **Prova de mordida (`saidas/04-mordida-carregador-antigo.txt`).** O `perfis-do-eas.test.mjs` de `c78a98a` (carregador antigo) mais os dois casos novos: no Node 24.15.0 e no 22.17.0 o caso do `enum` fica vermelho com `ERR_UNSUPPORTED_TYPESCRIPT_SYNTAX: TypeScript enum is not supported in strip-only mode`. O segundo caso fica vermelho no carregador antigo porque `emJavaScript` não existe nele; a mordida de verdade do conserto é o primeiro.
- **Contagem.** `V2-F01-E13` em `scripts/baseline.mjs`: 20 para **22**; `test:scripts` de 794 para **807** junto com a DV-04 (11 casos). `conferir:numeros` e `baseline.test.mjs` verdes.
- **Portões do fim (todos verdes):** os mesmos da DV-04, em `docs/evidencias-v2/G00/V2-F00-E19/divida-DV-04/saidas/07` a `15` (um conjunto de execução só para as duas dívidas, no mesmo ramo).

## Justificativa

- **Por que o compilador e não "cuidado".** A alternativa de manter o strip-types e documentar a restrição deixa o teste dependente da versão do Node e de uma disciplina de quem edita o arquivo. O `typescript` já é dependência do repositório (instalado na raiz pelo `npm ci`) e entende o TypeScript inteiro; o resultado é o mesmo no 22 e no 24.
- **Por que gravar um módulo temporário e não `data:` URL.** O `file://` já era o caminho que o CI 2 do Windows exigiu (`especificadorDoModulo`); manter esse caminho evita um terceiro formato. A pasta temporária é removida num `finally`.
- **Limite honesto.** O carregador serve a arquivo sem import de VALOR (o `app.config.ts` só importa o tipo `ExpoConfig`, que a conversão apaga). Import de valor de pacote não resolveria a partir da pasta temporária e falharia alto, com o nome do pacote. Está dito no comentário de `emJavaScript`.

## Não verificado

- Windows e o runner do CI (o caminho `file://` é o mesmo de antes; a conversão é JavaScript puro).
