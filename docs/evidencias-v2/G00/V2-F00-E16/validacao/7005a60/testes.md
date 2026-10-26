---
validador: testes
modelo: claude-sonnet-5-5
etapa: V2-F00-E16
sha_validado: 7005a60cd70b30a4f455a96a64c4d7a3abb2819f
ci_run: 37739535524
rodada: 1
herdado_de:
tags: [MOBILE, A11Y]
nivel_de_prova_exigido: [E1, E2]
nivel_de_prova_obtido: [E1, E2]
veredito: PASS
confianca: media
humano_necessario: sim
escalar: nenhum
---
## Critérios verificados
- Os 7 testes originais (`vistoria-o-teclado-a-camera-e-o-que-ela-promete.test.tsx`) estão intactos: o diff só ACRESCENTA (4 casos novos e 2 asserções na frase de envio). Nenhum foi afrouxado. Única edição de asserção existente: `Precisão de 1 metros` para `1 metro`, que é da E15 (comentada no teste, citada no RESUMO da E15, não no `DECISOES-DE-TESTE-DA-FASE-00.md`).
- Registro em `DECISOES-DE-TESTE-DA-FASE-00.md`: não é exigido para a E16. O arquivo trata os 14 do campo como defeito real, conserto no código, sem reescrita de teste. Coerente com o diff.
- `evidencia-no-disco.test.ts`: caso novo para cópia recusada, com dublê de `File.copy` do `expo-file-system` (fronteira do sistema, aceitável), e a frase em português.
- Sem snapshot, `waitFor`, espera fixa ou relógio real nos arquivos da etapa.

## Evidência
- 3 rodadas dos 5 arquivos (E14 e E16 juntos): 48 de 48, sem falha. Mais 1 rodada com `--randomize` de cada arquivo: 14 de 14 e 16 de 16 verdes. Sem instabilidade.
- Mutações NOVAS em `vistoria/[id].tsx` e `evidencia-no-disco.ts` (restauradas a cada uma):
  - N2 remover `setCameraAberta(false)` no `catch` de `fotografar`: MORTA (4 falhas).
  - N3 remover o botão "Fechar" da tarja de permissão: MORTA.
  - N5 `margens.top` no lugar de `margens.bottom`: MORTA.
  - N6 `accessibilityLiveRegion="none"` na tarja: MORTA.
  - N7 tirar "tire a foto de novo" da frase do disco: MORTA.
  - N1 tirar o `.catch(() => undefined)` de `Linking.openSettings()`: SOBREVIVE (o dublê sempre resolve).
  - N4 trocar a frase de fallback de `FotoNaoGuardada` (erro sem mensagem): SOBREVIVE.
- `git status --porcelain` ao fim: só pastas `validacao/`.

## Cenários positivos
Tarja de câmera e de localização com o botão que chama `Linking.openSettings` uma vez; foto vazia mostra "Tire a foto de novo"; precisão ausente continua `null`.

## Cenários negativos
Falha de disco após permissão negada não mantém o botão; erro nativo da câmera não vaza nem ganha botão; frase nova sem "fechado", "segundo plano" ou "sozinha".

## Tentativas de reprovar
- Teste que trava comportamento errado: não achei. Os dois de teclado e o de área segura conferem PROPRIEDADES (`keyboardShouldPersistTaps`, `automaticallyAdjustKeyboardInsets`, `paddingBottom`), não comportamento; o nome "o primeiro toque AGE" promete mais do que a asserção prova. O de área segura é o mais forte (valor calculado a partir de inset injetado no provedor). É limite do jest, e o QA já o registrou; fica para F14-E12.
- Asserção que nunca falha: a asserção de teclado falha se a propriedade mudar (QA mutou). `automaticallyAdjustKeyboardInsets` é só iOS, e nenhum teste cobre Android.
- Mock do próprio módulo: `../dados/evidencia-no-disco` é dublado no teste da tela; o módulo real tem teste próprio (cobre a lacuna).

## Achados
- corrige antes de crescer: a DoD diz "nenhuma promessa de segundo plano na interface", mas o único guarda é um `queryByText` na tela de vistoria guardada. `app/(agente)/fila.tsx:1689` ("o envio ... acontece sozinho, em segundo plano") e `:1855` ("O envio acontece sozinho, em segundo plano") continuam, sem teste que os pegue. Podem querer dizer "sem tocar, com o app aberto", mas um agente lê como "com o app fechado", que é a promessa que a etapa tirou.
- anotado: `Linking.openSettings()` que rejeita não é testado (N1).
- anotado: o teste "o botão não sobrevive à falha seguinte" usa `Error("disco cheio")` do dublê, que não é a frase de produção (já dita pelo QA).
- anotado: o nome "o primeiro toque fora do campo AGE" é uma asserção de propriedade.
- anotado: a troca "1 metros" para "1 metro" é da E15 e não está em `DECISOES-DE-TESTE-DA-FASE-00.md`; cabe ao validador da E15.

## Não verificado
Teclado, área segura e Ajustes em aparelho (iPhone e Android): Expo não renderiza aqui e o APK é anterior. Capturas das tarjas e relato do aparelho prometidos no bloco não existem.

## Risco residual
Médio-baixo: teclado e área segura sem prova em aparelho até F14-E12; promessa de "segundo plano" restante na fila.

## Motivo do humano
Rafael no iPhone, e Android quando houver: negar a câmera e tocar em "Abrir os ajustes do aparelho"; digitar com o teclado aberto e tocar em "Tirar foto" no primeiro toque; obturador acima da barra do sistema. Portão visual obrigatório da etapa.
