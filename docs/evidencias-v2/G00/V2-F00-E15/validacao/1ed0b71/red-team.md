---
validador: red-team
modelo: claude-opus-5-5
etapa: V2-F00-E15
sha_validado: 1ed0b71
ci_run: ausente
rodada: 6
herdado_de:
tags: [MOBILE, OFFLINE, A11Y, LGPD]
nivel_de_prova_exigido: [E1, E2]
nivel_de_prova_obtido: [E1, E2]
veredito: PASS
confianca: alta
humano_necessario: sim
escalar: nenhum
---
## Critérios verificados

Risco ALTO. Mutação na árvore principal, desfeita com `git restore`, `git status` conferido. Saídas em `SCRATCH/validadores/red-team`.

| Critério | Resultado | Prova |
| --- | --- | --- |
| Isolamento entre agentes: "outro agente entra no aparelho com o rascunho do primeiro: `acolherNoAparelho` limpa" pelo CAMINHO REAL do login (a lacuna que reprovou as rodadas 4 e 5) | OK | Correção 3 criou `src/__tests__/entrar-de-outra-pessoa-limpa-o-aparelho.test.tsx` (11 casos) com `ProvedorDeSessao`, `banco-local` e `rascunho` reais sobre SQLite do Node, entrando por `entrar`. 11 de 11 no SHA. |
| O teste morde no caminho real (prova exigida em risco alto) | OK | Apliquei S9b (removi `await acolherNoAparelho(...)` de `entrar` em `sessao.tsx` E o nome do `import`): `tsc` código 0 e, no arquivo novo, 5 de 11 reprovam (o Bruno que entra por `entrar` depois da sessão vencida da Ana passa a ver o rascunho/fotos/assinatura dela; dono do disco). Restaurado. |
| A mesma pessoa reencontra a vistoria | OK | Caso "contraste: a Ana que entra de novo reencontra tudo" verde (e segue verde sob S9b, como deve). |
| O item da fila de A não é ENVIADO pela credencial de B | OK | `packages/campo/src/fila.ts`: o dreno filtra `autoriaDaColeta(item, sessao) === "propria"` (linhas 330, 374, 583, 1425). Motor offline MANTER, não alterado pela E15. |

## Evidência

- `$W/e15-base.txt`: `entrar-de-outra-pessoa-limpa-o-aparelho.test.tsx` 11 de 11 no SHA.
- `$W/e15-S9b.txt`: sob S9b (login sem `acolherNoAparelho`, import removido, `tsc` 0), 5 de 11 reprovam, incluindo "a sessão da Ana venceu: o Bruno entra e o aparelho vem sem rascunho, foto nem assinatura dela". Restaurado (`grep "await acolherNoAparelho"` confirma a linha de volta).

## Cenários positivos

- Ana entra, deixa rascunho/foto/assinatura e coleta pendente; sessão vence; Ana volta por `entrar`: reencontra tudo.
- Bruno entra por `entrar` depois da Ana: aparelho limpo, mas o item de fila da Ana segue `pendente` e intacto.

## Cenários negativos

- Bruno entrando no aparelho da Ana (sessão vencida ou "Sair da conta") pelo `entrar` real: `listarRascunhos()` vazio, foto e assinatura fora do disco, dono do disco passa a ser o Bruno.
- Sob S9b, o Bruno veria o rascunho da Ana: o teste novo reprova (a trava existe e morde no caminho real).
- Envio: o dreno nunca sobe coleta de outro autor com a credencial de quem está no aparelho (filtro de autoria).

## Tentativas de reprovar

1. S9b (login sem `acolherNoAparelho`, a mutação que passou verde por toda a suíte nas rodadas 4 e 5): agora o arquivo novo reprova 5 casos pelo caminho real. A lacuna está fechada.
2. B ENVIAR coleta de A: o dreno filtra `autoriaDaColeta === "propria"`; coleta de outro autor não é enviada pela credencial de B. Não escapa.
3. B VER coleta de A na tela da fila: o agente seguinte VÊ protocolo, nome do autor e data da coleta que está na FILA (não o rascunho) e pode descartá-la; é comportamento da tela da fila (E06), fora do escopo da E15, já anotado na rodada 5. Não é vazamento do rascunho nem envio trocado.

## Achados

- **anotado.** A tela da fila (`app/(agente)/fila.tsx`) mostra ao agente seguinte o protocolo, o nome do autor e a data de uma coleta de OUTRO autor que ficou na fila, e permite descartá-la (com o nome do autor na confirmação). É da E06/desenho da fila, não da E15 (que trata rascunho começado e isolamento no login), e já estava anotado na rodada 5. Não reprova esta etapa.
- **anotado.** A falha aberta de `acolherNoAparelho` (marca de dono ausente ou limpeza que falha no meio devolvendo `apagou:true`) continua classificada para a F14-E02 (decisão do Rafael), fora do escopo da E15.

## Não verificado

- Aparelho físico ou emulador: o app Expo não renderiza neste ambiente. O cofre (`expo-secure-store`), o disco (`expo-file-system`) e o SQLite nativo são simulados; a garantia do chaveiro do Android/iOS e o resíduo físico (WAL, cache da câmera) só se confirmam em aparelho. É a pendência humana da etapa e da F14-E12.
- A corrida real de duas limpezas/logins concorrentes em SQLite nativo (o teste prova a ORDEM com um portão no dublê do SQLite, não concorrência de hardware).
- Run do CI do SHA (ausente, H32).

## Risco residual

Baixo no código, mas o aparelho de plantão é compartilhado entre turnos e a garantia última do apagamento físico (chaveiro e disco nativos) não é observável aqui. A trava do caminho real do login, que faltava nas rodadas 4 e 5, agora existe e morde: uma refatoração do login que perca a linha de limpeza é pega pela suíte. O descarte de coleta de outro autor na tela da fila (vazamento de metadado) é da E06.

## Motivo do humano

Sim. Só num aparelho real dá para confirmar que o chaveiro guarda a credencial com `WHEN_UNLOCKED_THIS_DEVICE_ONLY` e que o rascunho, as fotos e a assinatura somem de fato do disco quando outro agente entra (os dois fluxos pedidos pela etapa, E4). O ambiente não tem emulador nem aparelho.
