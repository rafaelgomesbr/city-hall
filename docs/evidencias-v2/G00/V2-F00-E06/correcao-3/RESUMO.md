# V2-F00-E06, correção 3: com a fila pausada, nenhuma tela manda esperar sinal

Base: `b17949a`, ramo `trab/correcao-5`. Motivo: rodada 5 da E06 (QA, `validacao/4ce0433/qa.md`), FAIL por defeito de texto em estado criado pela etapa, achado já visto na rodada 3 e não consertado.

## Fatos

**O defeito.** Com a fila PAUSADA (conta desativada, sessão encerrada ou senha provisória), tocar em "Enviar agora" no cartão da tarefa vencida com coleta guardada (`apps/campo/src/app/(agente)/index.tsx`, `enviarAgora`) mostrava a tarja "Ainda não deu para enviar" / "sai quando o aplicativo estiver aberto e houver sinal". Sinal não resolve nenhum dos três casos, e a tela contradizia a faixa do topo e o cartão que a correção 2 já tinha consertado.

**O conserto em "Enviar agora".** `enviarAgora` guarda o resultado do dreno. Quando o item continua `pendente`, o motivo da pausa vem de `dreno.paradaPor` e, se o dreno voltou sem dizer (outro dreno já rodava, o laço de fundo), da pausa que a fila já avisou (uma `ref`, `pausaAtual`, alimentada pela assinatura que a tela já tinha). Com motivo, a tarja usa a fonte única das frases, `frasesDaPausa` (`dados/pausa-da-fila.ts`): título `faixaTitulo` ("Sessão encerrada", "Conta desativada", "Defina a sua senha") e texto `doCartao`, as mesmas palavras da faixa do topo e do cartão da fila. Sem motivo, a tarja de sempre. Nenhum texto novo foi escrito para a pausa.

**A varredura (outros pontos que, com a fila pausada, prometiam sinal ou envio).** Procurei no aplicativo inteiro por "houver sinal", "com sinal", "quando a conexão voltar", "esperando envio", "sobe/sai quando o aplicativo estiver aberto" e afins. Achei e consertei mais seis, todos com `frasesDaPausa`:

1. `fila.tsx`, cartão da DEVOLUÇÃO pendente: "vai sair quando o aplicativo estiver aberto e houver sinal". Com pausa: rótulo "Devolução guardada" e "Motivo: ... + doCartao".
2. `fila.tsx`, tarja "Sem sinal agora": "sai quando a conexão voltar". Com pausa: "Nada se perde: o que está aqui continua guardado neste aparelho." (a promessa fica só na frase da pausa, no alto da lista).
3. `fila.tsx`, legenda do botão "Tentar enviar agora": "com sinal, o envio acontece sem você tocar". Com pausa: a legenda não aparece (o aviso do alto da lista já diz o que destrava).
4. `fila.tsx`, retorno de "Tentar de novo": "se houver sinal, ela sai agora". Com pausa: "O envio foi pedido de novo." + `doCartao`.
5. `vistoria/[id].tsx`, tela de depois de guardar ("Ela sobe com o aplicativo aberto") e tela da ocorrência já coletada ("sobe quando ... houver sinal" e "pode demorar horas sem sinal"): com pausa, mostram `titulo` e `detalhe` da pausa. A tela passou a assinar a fila só quando uma dessas duas está aberta (fila que não abre deixa a frase de sempre).
6. `aviso-da-saida.ts` (pergunta de "Sair da conta", `perfil.tsx` passa a pausa do resumo que já assinava): "volta a subir quando você entrar de novo, com sinal". Com pausa: a parte do laudo fica e o resto é `detalhe`.

Examinados e deixados como estão, com o motivo: a tela de entrada (`entrar.tsx`, é antes de haver fila), o estado vazio da fila ("Tudo o que você fez já chegou": o motor limpa a pausa quando não há nada pronto, então vazio e pausada não coexistem), "A fila não abriu" (a fila nem existe para ter pausa), o rodapé do perfil e do mapa (sem promessa de envio), o aviso de "Entrar de novo" na fila (já é a pausa).

**Testes novos (41 casos, mordem).** `__tests__/enviar-agora-com-a-fila-pausada.test.tsx` (7: controle com a fila andando, e por motivo, o dreno devolvendo `paradaPor` e o dreno sem motivo com a pausa já conhecida), `ui/fila-pausada-nao-promete-sinal.test.tsx` (14, os quatro pontos da fila por motivo e os controles), `__tests__/vistoria-guardada-com-a-fila-pausada.test.tsx` (8, as duas telas), 9 em `dados/aviso-da-saida.test.ts` e 3 em `ui/dialogo-na-conta.test.tsx`. As frases esperadas vêm de `frasesDaPausa`, não são copiadas. Ajuste de um dublê: `a-vistoria-recebida-sai-da-lista.test.tsx` tinha `drenar` devolvendo `undefined`, contra o contrato (`ResultadoDreno`); passou a devolver o resultado.

**Mordida.** Sem o conserto (código de produção revertido, testes novos mantidos): `saidas/10` (arquivo de "Enviar agora" sozinho: 6 de 7 reprovam, só o controle passa) e `saidas/11` (todos os arquivos novos: 34 de 57 reprovam). Por arquivo de produção (`saidas/12`): `index.tsx` 6 de 7; `fila.tsx` 12 de 14; `vistoria/[id].tsx` 6 de 8; `aviso-da-saida.ts` com `perfil.tsx` 10 de 28. Os que passam sem o conserto são os controles com a fila andando (a frase de sempre continua valendo). Os mesmos arquivos passam todos com o conserto.

**Regressão (todas com código 0).**
- `npm run test:campo` (`saidas/20`): tipos limpos, 138 suítes, 1983 de 1983 (era 1942), "a leitura do código e o jest concordam: 1983 casos".
- `npm run test --workspace @dc360/campo` (`saidas/21`): 10 arquivos, 231 de 231.
- `node --test scripts/portao-*.test.mjs` (`saidas/22`): 79 de 79, inclusive o portão sem promessa de segundo plano. A primeira rodada reprovou o portão de densidade (R1: a tela de "guardada" ficou com dois blocos preenchidos); o aviso novo passou a `peso="leve"`, como a régua manda.
- Portão de conteúdo `regras-de-conteudo.test.ts` (`saidas/23`): 10 de 10.
- `npm run conferir:numeros` (`saidas/25`): "Todos os números da documentação batem". Antes dos números atualizados reprovava de propósito (`saidas/24`). `scripts/baseline.mjs` ganhou `"V2-F00-E06-correcao-3": { total: 41, falhas: 0 }` (puladas não mudam); README (1942 para 1983, duas ocorrências) e `docs/COLOCAR-DE-PE.md` (5263 para 5304, duas ocorrências) atualizados. `scripts/baseline.test.mjs`: 29 de 29 (`saidas/26`).
- `node scripts/conferir-indices-de-evidencia.mjs`, a partir de `dc360` (`saidas/27`): verde, com a pasta `correcao-3` e as linhas dela no INDEX de topo da E06.

**Limitações.** Nada foi visto em aparelho nem em emulador: a prova é teste de componente, nível E1. A pendência E4 da rodada 5 (Rafael ver no aparelho as frases da conta desativada e da sessão encerrada, e aprová-las) continua aberta e não é desta correção. Não rodei `test:api` nem `test:isolamento` (nada de API, banco ou autorização foi tocado). O aviso de saída fala "nada foi apagado" (do `detalhe`) em parágrafo próprio, depois do parágrafo dos rascunhos que apaga: a frase se refere às coletas, e foi mantida por ser a da fonte única.

## Justificativa

O estado do item no disco continua `pendente` na pausa, de propósito (a coleta não é recusada, não conta tentativa). Por isso o estado não distingue "sem sinal" de "pausada", e cada tela que olhava só o estado caía na promessa de sinal. O que distingue é o motivo da sessão, que o motor já entrega (no resumo da fila e em `paradaPor`). A correção 2 tinha ligado esse motivo ao cartão da tarefa; esta o liga aos demais pontos, sempre pela mesma fonte de frases, porque o defeito original era exatamente duas telas dizendo coisas diferentes sobre a mesma conta. Escrever uma frase nova em cada tela reabriria isso.

Em "Enviar agora" o motivo vem primeiro do dreno e depois da pausa conhecida porque o toque pode correr contra o laço de fundo: um dreno que já roda devolve `interrompido` sem `paradaPor`, e confiar só no retorno do dreno reabriria o defeito nessa corrida. A legenda do botão da fila some em vez de ganhar outra frase porque o aviso do alto da lista, logo acima, já diz o que destrava, e repetir a mesma frase duas vezes na tela foi defeito relatado neste aplicativo.
