---
validador: seguranca-aplicacao
modelo: claude-sonnet-5-5
etapa: V2-F00-E15
sha_validado: 4b96ea7
ci_run: 38445527075
rodada: 2
herdado_de:
tags: [MOBILE, OFFLINE, A11Y, LGPD]
nivel_de_prova_exigido: [E1, E2]
nivel_de_prova_obtido: [E1]
veredito: PASS
confianca: media
humano_necessario: nao
escalar: nenhum
---
## Critérios verificados

Veredito na primeira linha: **PASS** para a dimensão segurança de aplicação, com nível de prova E1 (execução dos testes e leitura do código); não exercitei o aplicativo no emulador nem mutei o campo, por restrição desta rodada. O que a dimensão olhou: o aparelho compartilhado não entrega rascunho, foto ou assinatura de A para B; "Entrar de novo" preserva o dado sem deixar sessão viva no servidor; o GPS abaixo de 0,5 m deixou de ser recusado sem afrouxar o esquema. Base de evidência: `C:/Users/Rfasg/AppData/Local/Temp/claude/c--Projetos-city-hall/b62645e7-c436-45b4-8ce0-4d68f4fb420f/scratchpad/seg/` (`seg/`).

| Critério | Resultado | Evidência |
| --- | --- | --- |
| Outra pessoa entra no aparelho que tem rascunho, foto ou assinatura da primeira: o dado é apagado ANTES de a sessão abrir | PASS | `sair-e-entrar-nao-perde-a-coleta.test.ts` ("o Bruno entra: o rascunho da Ana é limpo"); leitura de `acolherNoAparelho` (apaga se o dono marcado é outro) e de `entrar` em `sessao.tsx` (chama `acolherNoAparelho` antes de guardar as credenciais) |
| A mesma pessoa que entra de novo reencontra a vistoria; a fila dela segue pendente | PASS | mesmo arquivo; `vistoria-sessao-vencida-preserva-o-rascunho.test.tsx` (módulos reais de sessão, banco e rascunho; só cofre, rede e disco simulados) |
| "Entrar de novo" na faixa da vistoria NÃO apaga e NÃO deixa sessão viva | PASS | `encerrarSessaoVencida`: marca o dono, esquece as credenciais e chama `sairDaApi` com o token de renovação e a ficha do aparelho (revoga no servidor); teste do 401 exige `encerrarSessaoVencida` chamado uma vez e `sair` nunca |
| A saída explícita ("Sair da conta") continua apagando e avisa o que apaga | PASS | caso de contraste do mesmo arquivo; `dialogo-na-conta-com-vistoria-comecada.test.tsx` verde |
| GPS abaixo de 0,5 m deixa de virar 0 e o esquema continua recusando 0 e negativo | PASS | `gpsPrecisaoMetrosSchema = z.number().positive().nullable()` intacto (`packages/shared/src/schemas.ts:369`); `precisao-do-gps-na-sincronizacao.test.ts` verde (`13-api-gps-autoria.txt`: 3 arquivos, 16 testes) |
| O servidor não aceita autoria forjada da coleta | PASS | `autoria-da-coleta.test.ts` e os 409 `autor_divergente` (ver E06) |

## Evidência

- Jest do app (`21-campo-app-e06-e15.txt`): 8 suítes, 84 testes, todos verdes, incluindo as quatro suítes de E15 acima.
- `packages/campo` 223 de 223 (`20-pacote-campo.txt`); API `precisao-do-gps-na-sincronizacao`, `autoria-da-coleta`, `vistoria-e-da-equipe` 16 de 16.
- Leitura de `apps/campo/src/dados/sessao.tsx` e `banco-local.ts` (comentário de `apagarDadosLocais` agora verdadeiro: lista as três telas que não apagam e a que apaga).
- Mutação própria: **não feita**, por restrição (só `apps/api` e `db` podem ser mutados por esta dimensão). A mordida do campo vem das mutações INDEPENDENTES do QA do campo desta rodada, que li e conferi nos arquivos: tela da vistoria voltando a chamar `sair()` em vez de `encerrarSessaoVencida()` derruba 3 de 13 (`scratchpad/qa-campo/85-mutE15b.txt`), e o piso de GPS sem `Math.max(1, ...)` derruba 3 de 22 (`84-mutE15a.txt`). Para a regra de `acolherNoAparelho` (apagar quando outra pessoa entra) não há mutação de ninguém. Li `sair-e-entrar-nao-perde-a-coleta.test.ts`: ele chama a função REAL sobre SQLite e afirma `apagou === true`, a lista de rascunhos vazia e a foto e a assinatura do rascunho fora do disco, então uma regressão que deixe de apagar reprova por construção; a mordida por mutação, porém, ficou sem execução (item de "Não verificado").

## Cenários positivos

- A sessão vence com uma vistoria começada; "Entrar de novo" leva a `/entrar`; a identidade vira nula; rascunho, foto e assinatura continuam; a mesma pessoa reencontra checklist, observações, assinatura e foto.
- Precisão 0,3 vira 1 e 12,4 vira 12; ausente continua `null`.

## Cenários negativos

- Outra pessoa entra: `acolherNoAparelho` limpa o dado do turno antes de a lista de tarefas aparecer. A coleta da primeira na fila continua intacta e pendente, e só sobe quando ela voltar (autoria no motor e 409 no servidor).
- Sair explicitamente com vistoria começada apaga (contraste), depois do diálogo que diz isso.
- O rótulo antigo "Sair e entrar de novo" não existe mais em lugar nenhum.

## Tentativas de reprovar

1. **Fail-open do dono do dado.** `donoDosDadosLocais()` devolve `null` quando a leitura da tabela `marcas` falha (captura o erro e segue), e `acolherNoAparelho` só apaga se `dono !== null && dono !== usuarioId`. Se a leitura falhar, ou se a marca não existir (aparelho atualizado de versão sem a marca, janela de uma atualização), a pessoa que entra herda os rascunhos, as fotos e a assinatura de quem usou antes. É decisão documentada ("marca sem dono não apaga"), mas num controle de privacidade o erro de leitura deveria falhar para o lado de apagar, ou de bloquear a entrada. Não consegui provocar a falha de leitura sem mutar o campo; é leitura de código (achado 1).
2. **`rascunhos` não tem coluna de usuário.** A separação entre pessoas depende só da marca de dono; não há segunda barreira por linha.
3. **Sessão derrubada por `encerrarSessaoVencida` deixando refresh vivo.** Não deixa: a rotina revoga no servidor com o token e a ficha antes de esquecer a ficha.
4. **GPS 0,3 m enviando 0.** O app arredonda para o mínimo 1 e o esquema do servidor segue recusando 0 e negativo; app antigo que ainda envie 0 continua recebendo 422.
5. **Dado de repouso.** O aparelho guarda a fila (com coleta já feita), os arquivos de foto e assinatura e o SQLite em texto claro; a saída explícita só apaga o que não está na fila. Os cinco achados de LGPD (fila e arquivos sem prazo, JPEG e PNG de coleta enviada só saem no logout, original da câmera no cache, coordenada com 6 casas, resíduo de WAL) já constam no relatório do LGPD e em `PENDENCIAS.md`; não os repito.

## Achados

**CORRIGE ANTES DE CRESCER**

1. `acolherNoAparelho` falha aberto quando não consegue ler o dono do dado local (ver tentativa 1). Sugestão: tratar erro de leitura como "dono desconhecido" e apagar (ou recusar a entrada), mantendo o "sem marca não apaga" apenas para o caso comprovadamente vazio. Dono: F14-E02 (CP-24) ou F14-E04.

**ANOTADO**

2. O rascunho não carrega o autor (item da tentativa 2); uma coluna `usuario_id` daria defesa em profundidade.
3. Os dois fluxos de aparelho (sair com vistoria começada; concluir com GPS simulado) seguem como pendência E4/F14-E12; o QA tem o emulador.

## Não verificado

- Emulador e aparelho: não executei o app (E2 de UX e QA).
- Mutação própria do campo: vedada nesta rodada; a de `acolherNoAparelho` (outra pessoa entra e o dado é apagado) não foi feita por ninguém.
- Falha real de leitura da tabela `marcas` (exigiria mutar `banco-local.ts`).
- Cofre real (`expo-secure-store`) e o armazenamento em disco do Android (as fotos e assinaturas são nomes num conjunto simulado nos testes).
- iOS.

## Risco residual

- Achado 1: janela de uma atualização (ou erro de disco) em que a pessoa seguinte vê o dado da anterior.
- Dado de repouso em texto claro até a F14-E04.

## Motivo do humano

Nenhum para esta dimensão.
