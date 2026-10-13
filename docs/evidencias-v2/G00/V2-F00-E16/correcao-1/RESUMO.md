# V2-F00-E16, correção 1: nenhuma promessa de segundo plano na interface do aplicativo

Base: `a5da710`, ramo `v2/f00`. Motivo: rodada 1 reprovada (arbitragem em Opus FAIL, SHA `7005a60`; QA e Testes tinham dado PASS e anotado o fato como "corrige antes de crescer").

## Fatos

**O defeito provado pela arbitragem.** A DoD da E16 diz "nenhuma promessa de segundo plano na interface". A fila (`dc360/apps/campo/src/app/(agente)/fila.tsx`) mostrava "o envio do que vier depois acontece sozinho, em segundo plano" (fila zerada) e "O envio acontece sozinho, em segundo plano" (legenda do botão de enviar). A fila só drena com o aplicativo ABERTO (`iniciarSincronizacaoContinua`, no layout das abas); não há `expo-task-manager` nem modo de fundo; segundo plano é a F14-E06, só se o CP-24 aprovar. A E16 só tinha blindado a tela de vistoria guardada.

**Varredura de `dc360/apps/campo/src` (texto de tela, fora de comentário).** Padrões: segundo plano, background, fechado, sozinho/sozinha, automaticamente, assim que houver sinal, e variações. Doze frases trocadas, em cinco arquivos. Todas passam a dizer a condição verdadeira, no estilo da E16 ("quando o aplicativo estiver aberto e houver sinal").

| # | Onde | Antes | Depois |
| --- | --- | --- | --- |
| 1 | `fila.tsx`, fila zerada ("Tudo o que você fez já chegou") | "...e o envio do que vier depois acontece sozinho, em segundo plano." | "...e o que vier depois sobe quando o aplicativo estiver aberto e houver rede." |
| 2 | `fila.tsx`, legenda do botão de enviar | "O envio acontece sozinho, em segundo plano. Este botão é para quando você quer ver acontecer." | "Com o aplicativo aberto e com sinal, o envio acontece sem você tocar em nada. Este botão é para quando você quer ver acontecer." |
| 3 | `fila.tsx`, aviso "Sem sinal agora" | "Nada se perde: o que está aqui sai sozinho quando a conexão voltar, sem você precisar fazer nada." | "Nada se perde: o que está aqui sai quando a conexão voltar, com o aplicativo aberto, sem você precisar tocar em nada." |
| 4 | `fila.tsx`, "A fila não abriu" | "...continua no aparelho e sai sozinho quando a conexão voltar. Dá para tentar abrir de novo." | "...continua no aparelho e sai quando o aplicativo estiver aberto e a conexão voltar. Dá para tentar abrir de novo." |
| 5 | `fila.tsx`, cartão "Aguardando" (nenhuma tentativa) | "Ainda não saiu do aparelho. Vai sair assim que houver sinal." | "Ainda não saiu do aparelho. Vai sair quando o aplicativo estiver aberto e houver sinal." |
| 6 | `fila.tsx`, cartão da tarefa devolvida (nenhuma tentativa) | "...Ainda não saiu do aparelho, e vai sair assim que houver sinal. A tarefa já saiu da sua lista." | "...Ainda não saiu do aparelho, e vai sair quando o aplicativo estiver aberto e houver sinal. A tarefa já saiu da sua lista." |
| 7 | `index.tsx`, aviso "Ainda não deu para enviar" | "A coleta continua guardada no aparelho e sai sozinha assim que houver sinal." | "A coleta continua guardada no aparelho e sai quando o aplicativo estiver aberto e houver sinal." |
| 8 | `vistoria/[id].tsx`, vistoria já coletada | "A vistoria está na fila de envio e sobe assim que houver sinal." | "A vistoria está na fila de envio e sobe quando o aplicativo estiver aberto e houver sinal." |
| 9 | `dados/falha-de-atualizacao.ts`, acesso suspenso | "...continua guardado no aparelho e sobe sozinho se o acesso voltar." | "...continua guardado no aparelho e sobe se o acesso voltar, com o aplicativo aberto." |
| 10 | `dados/pausa-da-fila.ts`, sessão encerrada, detalhe | "...assim que você entrar, elas sobem sozinhas." | "...com o aplicativo aberto, elas sobem depois que você entrar." |
| 11 | `dados/pausa-da-fila.ts`, sessão encerrada, cartão | "Guardada neste aparelho. Sobe sozinha depois que você entrar de novo." | "Guardada neste aparelho. Sobe depois que você entrar de novo." |
| 12 | `dados/pausa-da-fila.ts`, senha provisória, detalhe | "...e depois entre aqui de novo: assim que você entrar, elas sobem sozinhas." | "...e depois entre aqui de novo: com o aplicativo aberto, elas sobem depois que você entrar." |

Um comentário de `index.tsx` (não é interface) também dizia "acontece sozinho, em segundo plano" e foi corrigido para não ensinar o erro a quem lê o código.

**Ocorrências examinadas e mantidas, com o motivo.**

- "vai continuar tentando sozinha" (`fila.tsx`, cartão após muitas tentativas): descreve a nova tentativa do aplicativo aberto, não promete envio fora dele; o teste `dialogo-na-fila.test.tsx` o trava e o portão não o proíbe.
- "nunca em segundo plano" (`app.config.ts`, texto da permissão de localização) e `docs/DECLARACAO-NAS-LOJAS.md`: dizem que a localização NÃO roda em segundo plano, e isso é verdade.
- Texto de permissão da câmera ("enviadas ... quando houver sinal", `app.config.ts`): declaração de loja ligada a `docs/DECLARACAO-NAS-LOJAS.md`; não afirma envio autônomo. Fica para a revisão de texto de loja, se o Rafael quiser.
- Avisos de push ("chega com o aplicativo fechado", `push/`): o push do sistema chega mesmo com o aplicativo fechado, é verdade.
- `apps/campo/LEIA-ME.md:94`: já diz "não há envio em segundo plano, e o aplicativo fechado não envia nada".

**Testes (todos com o código de `a5da710` como "antes", saídas em `saidas/`, passadas por `redigir`).**

- Portão novo `dc360/scripts/portao-sem-promessa-de-segundo-plano-do-aplicativo.test.mjs` (4 casos): varre a fonte de todo o aplicativo, menos comentários e testes; emenda as frases partidas em várias linhas (`"vai sair assim que " + "houver sinal"`); reprova segundo plano, aplicativo fechado, "sai/sobe/acontece sozinho" e "assim que houver sinal". Antes: reprova com 15 achados em 5 arquivos (`01`). Depois: 4 de 4 (`05`). Os outros três casos provam que ele morde nas frases da arbitragem, não pune comentário e aceita as frases verdadeiras.
- Casos de tela em `src/ui/fila-como-produto.test.tsx` (5): fila zerada, com coleta e sinal, sem sinal, com muitas tentativas, e fila que não abriu. Cada um lê todo texto desenhado e exige que nenhum prometa, e que a frase certa exista. Casos de frase em `src/dados/pausa-da-fila.test.ts` (4) e `src/dados/falha-de-atualizacao.test.ts` (7).
- Antes do conserto (`02`): 12 casos reprovam nos quatro arquivos tocados, depois: 116 de 116. Os cinco arquivos de teste tocados somam 133 de 133 (`06`).
- Testes reescritos (2, com registro em `docs/DECISOES-DE-TESTE-DA-FASE-00.md`): `fila-como-produto.test.tsx` (frase de "A fila não abriu") e `fila-pausada-pela-sessao.test.tsx` (frase do cartão pausado).
- Achados "corrigir antes de crescer" do `testes.md`: (a) o `catch` de `Linking.openSettings` ganhou um caso que usa uma rejeição real e escuta `unhandledRejection`; sem o `catch` ele reprova (`03`, 1 de 17). (b) o fallback de `FotoNaoGuardada` ganhou 2 casos (erro sem mensagem; valor que nem é `Error`); com a frase trocada, os dois reprovam (`04`). Os dois em `src/__tests__/vistoria-o-teclado-a-camera-e-o-que-ela-promete.test.tsx`, que passa a ter 17 casos.
- Registro que faltava, em `docs/DECISOES-DE-TESTE-DA-FASE-00.md`: a troca "Precisão de 1 metros" para "Precisão de 1 metro", feita na E15.

**Regressão.**

| Comando | Resultado |
| --- | --- |
| `npm run test:campo` (`07`) | 1903 testes verdes (eram 1884), tipos limpos |
| testes de `dc360/packages/campo` (`08`) | 223 verdes |
| `npm run test:scripts` (`09`) | 217 casos, 213 passam, 4 pulados, 0 falha (inclui o portão novo) |
| `npm run typecheck` (`10`) | código 0 |
| `npm run conferir:numeros` (`11`) | 24 afirmações, 0 divergência, depois de `dc360/README.md` (1884 para 1903) e `dc360/docs/COLOCAR-DE-PE.md` (4800 para 4819); `baseline.mjs` não cita esses números |
| portão de conteúdo | 8 de 8 (`12`) |
| `node scripts/roadmap/conferir-evidencia.mjs V2-F00-E16 --sha a5da710` | roda por último, depois do `INDEX.md`; sem falha na entrega |

**Frases novas para o Rafael aprovar (texto de produto).** As doze da coluna "Depois" acima. A fórmula repetida é "quando o aplicativo estiver aberto e houver sinal" (ou "rede" onde a frase vizinha já dizia rede); a legenda do botão ("Com o aplicativo aberto e com sinal, o envio acontece sem você tocar em nada") é a única que muda de estrutura. A frase de piso de GPS da E15, "Precisão de 1 metro", continua pendente de aprovação pelo mesmo motivo.

**Limitações.**

- O portão lê TEXTO escrito, não o que o React Native desenha: frase montada em tempo de execução a partir de valor de fora do arquivo passa por ele (limite dos outros portões do aplicativo). Os casos de tela cobrem os estados da fila, não todos os estados de todas as telas.
- O app Expo não renderiza aqui: a prova é teste de componente. A validação humana da E16 em aparelho (teclado, área segura, Ajustes) continua pendente.
- Segundo plano real não foi implementado, de propósito (F14-E06, CP-24).
- Sem mudança de servidor, banco, migração ou regra de negócio.

## Justificativa

O risco principal que o bloco da E16 nomeia é "a frase falsa de envio: o agente acredita que a coleta subiu". Quem lê "acontece sozinho, em segundo plano" na tela da fila fecha o aplicativo sem sinal e vai embora acreditando que a vistoria vai subir; ela só sobe quando ele abrir o aplicativo com sinal. A E16 consertou a tela de vistoria guardada e deixou a fila, onde o agente olha justamente para saber se a coleta saiu, dizendo o contrário. A DoD fala em "interface", não em "uma tela", e o item 9 da lista de critérios sem risco aceito (a documentação ou a apresentação afirmando o que o código não faz) não admite deixar isso como anotação sob PASS.

Consertar só as duas frases que a arbitragem achou deixaria a mesma promessa viva em "sai sozinho quando a conexão voltar", "sobe sozinha" e "assim que houver sinal", que o agente lê do mesmo jeito: o envio depende só do sinal. Por isso a varredura foi pelo sentido (o envio parece independente de o aplicativo estar em uso) e não pela expressão exata, e as doze frases ganharam a mesma condição, a que o código cumpre e que o agente consegue comprovar sozinho. Mantive "tentando sozinha" e o texto de permissão da câmera porque não afirmam envio autônomo, e disse isso por escrito para o Rafael decidir se quer apertar mais.

O portão em `scripts/` existe porque o teste da E16 provou que blindar uma tela por vez deixa a promessa voltar na vizinha: a varredura da fonte é o que impede a regressão em qualquer tela futura, e os casos de tela leem o que o agente de fato vê em cada estado da fila. Os dois achados de teste fraco da validação (o `catch` de `openSettings` e o fallback da foto) eram pequenos e a prova de que morderiam já foi rodada (mutação, antes e depois), então entraram aqui em vez de ficarem como dívida.
