# V2-F00-E19, dívida DV-05: `expo-doctor` 21 de 21 sem pular a checagem de versões (NÃO paga, nota de estado)

Dívida de `docs/roadmap-v2/dividas.md` (rodada 8, `60cbc2f`), prazo "antes do G01". Conferida sobre `c78a98a` (ponta de `v2/f01`) em 2026-10-25. A linha continua em "Abertas", com uma nota.

## Fatos

- **O briefing disse que a linha já tinha prova de CI desde a rodada 9. Não tem.** No `.github/workflows/verificar.yml` do `c78a98a` (e também no de `origin/v2/f00`), o passo "Saúde do projeto Expo" do job `aplicativo` roda com `EXPO_DOCTOR_SKIP_DEPENDENCY_VERSION_CHECK: "1"`, e o comentário do próprio passo registra que a checagem de versões fica DE FORA por decisão (ela consulta a rede e reprova a cada patch publicado pela Expo). Nenhum run de CI, portanto, prova o critério "21 de 21 sem pular a checagem de versões". A linha de `dividas.md` descrevia isto corretamente e continua descrevendo.
- **Prova local de hoje (`saidas/01-expo-doctor-sem-pular-versoes.txt`).** `npx expo-doctor` em `dc360/apps/campo`, sem a variável de pulo: "21/21 checks passed. No issues detected!". É a prova que a dívida chama de perecível: vale para o SHA e para o dia, porque a deriva dos pacotes do Expo volta a cada patch (H24 de `pendencias-humanas.md`).
- **Por que não foi paga aqui.** Torná-la durável exige mudar o workflow (um passo à parte, sem bloquear o job, ou agendado, que rode o `expo-doctor` sem o pulo e publique o resultado) e decidir a H24 (se a deriva do Expo passa a ser tratada sempre por subida de patch). O `.github/workflows/` é de outro agente neste pagamento, e a H24 é decisão do Rafael. Nada em `dc360/scripts/` resolveria isto sem rede no teste, o que traria de volta o vermelho "por motivo que não é nosso" que o comentário do passo evita.

## Justificativa

- Marcar como paga com a prova local seria declarar durável uma prova que o próprio registro da dívida diz ser perecível. A linha fica aberta, com a nota do estado e o que falta (passo de CI não bloqueante ou agendado, mais a H24).

## Não verificado

- Que um passo agendado sem o pulo fique verde por tempo suficiente para ser prova: depende do workflow e da Expo.
