---
validador: qa (general-purpose com o papel da dimensão)
modelo: claude-opus-5-5
etapa: V2-F00-E06
sha_validado: bb0f654
ci_run: ausente (39143791434 citado pelo implementador, não lido)
rodada: 4
herdado_de:
tags: [MOBILE, OFFLINE, A11Y, AUTH, AUTHZ]
nivel_de_prova_exigido: [E1, E2]
nivel_de_prova_obtido: [E1, E2]
veredito: PASS
confianca: media
humano_necessario: sim
escalar: nenhum
---

Pasta das saídas citadas abaixo (S): `/private/tmp/claude-501/-Users-rafaelgomes-Documents-city-hall/ded47d25-806d-4495-ac61-f9e84518cc35/scratchpad/validadores/qa-E06-E14-E15-E16/`. A árvore validada é a do HEAD `0290af5`, que só difere de `bb0f654` em `docs/roadmap-v2/STATUS.md` e `ESTADO-ATUAL.md` (conferido: a pasta da evidência das quatro etapas é idêntica nos dois SHAs). `node_modules` do app confere com o `package-lock.json` de `bb0f654` (expo 57.0.30, expo-router 57.0.28, expo-file-system 57.0.7).

## Critérios verificados

| Critério (bloco da etapa) | Como foi provado | Resultado |
| --- | --- | --- |
| DoD: nenhum item bloqueado ou descartado por 401 ou 403 de sessão ou conta | sonda própria S1 a S6, S9 com `transporteHttp` REAL e servidor falso com estado e idempotência (`10-sonda-e06.txt`); jest do app e do pacote | PASS |
| Domínio: `FalhaDeSessao` distinta, lançada por `falhaDaResposta`, `chamar`, `enviar` e sem token | leitura de `transporte.ts` e S3 (sem token: zero pedido na rede, `paradaPor` `sessao_encerrada`, item `pendente`) | PASS |
| Domínio: dreno para, item `pendente`, tentativas inalteradas, `paradaPor` | S1, S2, S4, S6 conferem `estado` e `tentativas` item a item; o item 2 nem é tocado (nenhum pedido com a chave da foto dele) | PASS |
| Mobile: 401 `nao_autenticado` renova UMA vez, com trava e piso | S4: servidor sempre 401 e `obterToken` sempre devolvendo token NOVO, exatamente 2 pedidos por dreno; mutação do piso em `token.ts` derruba 3 casos (`13-mut-token-piso.txt`) | PASS |
| Mobile: frase "suas coletas continuam guardadas neste aparelho, procure a coordenação" | `falha-de-atualizacao.ts:186-187`, `pausa-da-fila.ts:66-69`; mutação da frase da faixa derruba 3 casos do jest (`14-mut-frase-conta-desativada.txt`) | PASS (texto de produto: aprovação é do Rafael) |
| Autorização: item de outro autor espera o autor | S8: item da B pausado, A entra, nenhum pedido sai, `pausadaPor` nulo para a A, `deOutroAutor` 1 | PASS |
| `campo-integracao.test.ts`: desativar entre enfileirar e drenar, 403 e item no aparelho | executado contra a API real (PGlite): 17 de 17 (`05-api-campo-integracao.txt`) | PASS |
| Compatibilidade: 403 `sem_permissao` continua permanente | S7 (`sem_permissao` e 403 sem código viram `bloqueado`) | PASS |
| Regressão obrigatória | `npm run test --workspace @dc360/campo` 223/223 (`02`); `npm run test:campo` 134 suítes, 1927/1927, tipos limpos (`01`); `npm run test:api` 1326 passam, 20 pulados, 1 falha só em `openssl-do-teste` (LibreSSL do macOS, divergência conhecida da máquina) (`06`) | PASS |
| E2E no emulador | não há emulador Android nesta máquina (`adb`/`emulator` ausentes); Simulador de iOS existe mas sem build do app e o build exigiria `pod install` (proibido) | NÃO EXECUTADO (ver Não verificado) |
| Evidência: `INDEX.md` byte a byte | script próprio contra os blobs de `bb0f654` (`21-index-E06.txt`): 63 de 63 SHA-256 batem; os únicos arquivos fora do índice são `saidas/antes/INDEX.md` e `saidas/baseline-depois/INDEX.md`, que `montarIndice` exclui por regra; `conferir-evidencia.mjs V2-F00-E06 --sha bb0f654` código 0 (`20-conferir-evidencia-E06.txt`) | PASS |

## Evidência

- `cd dc360 && npm run build:shared` código 0 (`00-build-shared.txt`).
- `cd dc360 && npm run test:campo` código 0: "Test Suites: 134 passed", "Tests: 1927 passed", "A leitura do código e o jest concordam: 1927 casos" (`01-test-campo.txt`).
- `cd dc360 && npm run test --workspace @dc360/campo` código 0: 10 arquivos, 223 de 223 (`02-pacote-campo.txt`).
- `node --test` dos oito portões do app (acessibilidade, densidade, design, segundo plano, testar-campo, abertura, paridade de tokens, mapa) código 0, 106 de 106 (`03-portoes-do-app.txt`); `npm run test:scripts` inteiro código 0, 288 de 288 (`04-test-scripts.txt`).
- `cd dc360/apps/api && npx vitest run test/campo-integracao.test.ts test/evidencia-so-do-autor.test.ts test/precisao-do-gps-na-sincronizacao.test.ts` código 0, 31 de 31 (`05-api-campo-integracao.txt`).
- `cd dc360 && npm run test:api` código 1 por um único caso de `openssl-do-teste.test.ts` (LibreSSL), 1326 passam, 20 pulados (`06-test-api.txt`).
- Sonda própria (arquivo temporário `dc360/packages/campo/test/zz-validador-qa-e06.test.ts`, cópia em `zz-validador-qa-e06.test.ts.txt`, APAGADO do repositório ao fim): `npx vitest run test/zz-validador-qa-e06.test.ts` código 0, 9 de 9 (`10-sonda-e06.txt`).
- A sonda morde: com o ramo `FalhaDeSessao` de `fila.ts` desligado, 8 de 9 reprovam (`11-sonda-e06-mutacao-fila.txt`); com `transporte.ts` voltando a ler 401 e falta de token como `FalhaPermanente`, 5 de 9 reprovam (`12-sonda-e06-mutacao-transporte.txt`). Os dois arquivos foram restaurados com `git restore` e o SHA-1 conferido igual ao de antes (`sha-antes.txt`, "RESTAURADO").
- `npx expo-doctor` em `apps/campo`: 21 de 21 (`60-expo-doctor.txt`), regressão da troca para expo 57.0.30 e expo-router 57.0.28.

## Cenários positivos

- S1: depois da reativação e de um token novo, as duas vistorias sobem; o servidor grava cada chave de vistoria UMA vez e cada foto é confirmada UMA vez; a pausa some (`pausadaPor` nulo).
- S2: depois de entrar de novo, só o envelope sobe; a foto que já tinha subido não é reenviada (`bytes` 1) e a vistoria é gravada uma vez.
- S5: 401 `nao_autenticado`, renovação, o segundo pedido sai com o token novo (`Bearer t1` no log).
- `campo-integracao.test.ts` contra a API real: conta desativada entre enfileirar e drenar sobe depois da reativação com nova entrada; sessão encerrada sobe depois da nova entrada; senha redefinida sobe UMA vez.

## Cenários negativos

- S1: 403 `conta_desativada` no `confirmar-envio` da primeira foto, no meio da vistoria: dreno para, `paradaPor` `conta_desativada`, os dois itens `pendente` com 0 tentativas, `bloqueados` 0, a segunda vistoria não gera nenhum pedido. Cinco drenos seguidos com a conta ainda desativada: no máximo 3 pedidos por dreno, estado e tentativas inalterados (sem laço, sem desgaste do item).
- S2: 401 `sessao_encerrada` no envelope, depois das fotos: nenhum pedido de renovação forçada (`renovarJa` zero vezes), item `pendente`, 0 tentativas.
- S3: sessão sem token: nenhum pedido sai pela rede, `sessao_encerrada`, nada bloqueado.
- S4: servidor que só responde 401 `nao_autenticado` e obtentor de token defeituoso que sempre devolve token novo: 2 pedidos no total, os dois itens `pendente` com 0 tentativas.
- S6: 401 com corpo que não é JSON e renovação que devolve o mesmo token: 1 pedido só, pausa `sessao_encerrada`.
- S7: 403 `sem_permissao` e 403 sem código: `bloqueado`, sem `paradaPor` (o comportamento que a etapa manda manter).
- S8: autoria: item da B com a A logada não sai, a pausa da B não aparece para a A.
- S9: dois drenos simultâneos com 401: nada regride; depois, dois drenos simultâneos com sessão boa gravam a vistoria uma vez só.

## Tentativas de reprovar

1. Procurei laço de renovação contra servidor que diz não (risco de segurança do bloco): obtentor que sempre devolve token novo e servidor que sempre recusa. Limite de 2 pedidos por item segurou (S4).
2. Procurei perda de progresso de foto e reenvio duplicado com a sessão caindo depois das fotos (S2) e no meio da sequência autorizar, bytes, confirmar (S1). Nada duplicou nem se perdeu.
3. Procurei regressão de estado com dois drenos concorrentes e resposta 401 tardia (S9). Nada regrediu.
4. Procurei corpo de resposta malformado (S6) e ausência de token (S3) caindo em `FalhaPermanente`. Não caiu.
5. Procurei o item de outra pessoa subindo com a sessão de quem entrou depois (S8). Não subiu.
6. Desliguei o conserto (fila e transporte) para ver se a minha sonda e os testes do repositório reprovam: reprovam (8 de 9 e 5 de 9); tirei o piso de `token.ts` e troquei a frase da conta desativada: o jest do app reprova (3 casos em cada).
7. Procurei qualquer caminho de "Descartar" automático: a tela só oferece "Descartar" ao próprio autor quando o item está `bloqueado` ou `arquivado` (`fila.tsx:1332` e `1358`), e a pausa nunca leva a esses estados. Achei o caminho manual de outro autor (achado 1).
8. Procurei regressão da troca de expo e expo-router: `test:campo` inteiro com tipos estritos verde e `expo-doctor` 21 de 21.

## Achados

1. Anotado (já registrado em `apps/campo/PENDENCIAS.md`, "Ainda aberto", correção 1 da E06), toca o item 5 da seção 7 de `28` (perda de dado do campo): `podeDescartar = parada || autoria !== "propria"` (`apps/campo/src/app/(agente)/fila.tsx:1358`) mostra "Descartar" para a coleta guardada de OUTRO autor em qualquer estado, inclusive a coleta pausada do agente desativado. Reprodução: agente B com item `pendente` pausado por `conta_desativada`, agente A entra no aparelho, o cartão do item da B traz "Descartar" (com confirmação nominal). Não é automático nem causado por 401 ou 403, por isso não quebra a DoD desta etapa, mas é o caminho que hoje leva a coleta do desativado a sumir do aparelho. Recomendo dono e prazo antes do piloto.
2. Anotado (registrado): 401 `nao_autenticado` dentro do piso de 60 s pausa como "Sessão encerrada" quando só faltava esperar; desfaz sozinho no dreno seguinte. Sem perda de item.

## Não verificado

- O E2E da etapa no emulador ("desativar o agente no painel durante uma coleta na fila: a tela mostra a frase, nada é descartado e a coleta sobe depois da reativação"): não há emulador Android nesta máquina e não há build do app para o Simulador de iOS; montar um exigiria `pod install` (proibido) com os Pods de 15/09 desatualizados frente a expo 57.0.30. A prova ficou em duas metades: motor contra a API real e tela por teste de componente.
- A frase na tela real, nos dois temas e em 390 de largura (quebra da frase longa da faixa da conta desativada).
- O run do CI do SHA (não lido nesta sessão).
- `test:api` em PostgreSQL 17 (rodou em PGlite local); a classificação e a fila não dependem do banco, mas a integração não foi repetida em 17.

## Risco residual

- A interação real da faixa e do cartão com o sistema operacional (rolagem, quebra de linha, leitor de tela) só foi vista em teste de componente.
- Achado 1: a coleta pausada do agente desativado pode ser descartada manualmente por outro agente no mesmo aparelho.
- A pausa vive só na memória: depois de reiniciar o app, a primeira volta do laço refaz um pedido para redescobrir a pausa (comportamento registrado na premissa b; um pedido por volta, sem desgaste do item).

## Motivo do humano

- Aparelho físico e E4 explícito na etapa: Rafael vê no aparelho a frase da conta desativada e o item preservado depois de desativar o agente no painel, e a coleta subindo depois da reativação.
- Texto de produto: as frases da faixa, do aviso, do cartão "Guardada" e da lista de hoje (`pausa-da-fila.ts`, `falha-de-atualizacao.ts`) são proposta do implementador e precisam da aprovação do Rafael (premissa f).
