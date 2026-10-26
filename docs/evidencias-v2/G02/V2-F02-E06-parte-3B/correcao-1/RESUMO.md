# V2-F02-E06, parte 3B, correção 1: a pausa por 426 suspende a renovação antecipada do campo

Fecha a dívida da revisão independente (Codex) dos lotes 3 e 4 sobre a parte 3B: a garantia "o 426 não gasta renovação de token" só valia para o dublê de `obterToken` do teste. No aplicativo real, com o token perto do vencimento, `obterToken()` (`apps/campo/src/dados/token.ts`) tenta `/v1/auth/renovar` antes de cada envio, e depois da pausa por 426 isso se repetia a cada dreno (cada tentativa recusada com 426, já que o gancho de versão responde antes de autenticar). A evidência da parte 3B (pasta acima) fica como estava. O teste foi escrito primeiro, falhou, e só então veio o conserto.

## Fatos

1. **Reprodução com as peças reais** (`apps/campo/src/dados/renovacao-com-versao-antiga.test.ts`, novo, 3 casos): `criarFilaDeSincronizacao`, `transporteHttp` e `criarObtentorDeToken` REAIS, só a rede dublada (um `fetch` que responde 426 a tudo enquanto "o servidor exige a versão nova" e conta o que chega a `/auth/renovar`). ANTES (`saidas/01-item2-ANTES.txt`): dois drenos depois do 426, com o token dentro da folga de renovação, produzem 2 tentativas de renovação (esperado 0); e, com a versão aceita de volta, 1 tentativa que a promessa nova proíbe. É o que a revisão mediu.
2. **A promessa, exata.** Enquanto a ÚLTIMA resposta da API ao transporte da fila foi 426, o token é pedido SEM renovação antecipada: `ObterToken` ganhou o campo opcional `semRenovar` (`packages/campo/src/tipos.ts`); o transporte (`packages/campo/src/transporte.ts`) guarda `versaoRecusada`, ligada por um 426 e desligada pela primeira resposta que não seja 426 (falha de rede não diz nada sobre a versão e não desliga; o PUT da URL assinada não passa por ali); o obtentor (`apps/campo/src/dados/token.ts`) com `semRenovar` devolve o token que vale agora sem tocar a trava nem o piso. O envio continua sendo tentado a cada dreno (é assim que a fila descobre a atualização), o item fica `pendente` com a mesma contagem de tentativas e a mesma chave, e sobe depois. A suspensão some com o processo, e a atualização do aplicativo reinicia o processo.
3. **O que não muda.** O 401 `nao_autenticado` continua levando ao pedido `renovarJa`, que renova UMA vez (caso 3: token vencido durante a pausa, com a versão aceita de volta: 1 renovação, a coleta sobe). A tabela "categoria para ação da fila" da parte 2B e a linha do 426 da 3B (pausa, item pendente, qualquer 426, com ou sem corpo) seguem como estavam, e os 19 casos de `versao-do-aplicativo.test.ts` do pacote continuam verdes.
4. **O que a suspensão NÃO cobre, dito na cara.** Só os pedidos do transporte da fila. As chamadas do aplicativo fora da fila (entrar, baixar a lista) não têm essa suspensão e seguem o piso de um minuto entre tentativas do obtentor; o 426 nelas chega como qualquer recusa. README e `apps/campo/LEIA-ME.md` foram ajustados para dizer exatamente isso (antes diziam que "o token não é renovado").
5. **Testes.** `apps/campo/src/dados/renovacao-com-versao-antiga.test.ts` (3 casos), `dados/token.test.ts` (+2: `semRenovar` sem renovar, sem credenciais devolve nulo e o pedido comum logo depois renova) e `packages/campo/test/versao-do-aplicativo.test.ts` (+3: o pedido seguinte a um 426 leva `semRenovar` e a primeira resposta que não é 426 desfaz; falha de rede não desfaz; o PUT assinado não mexe). `baseline.mjs` ganhou `V2-F02-E06-parte-3B-correcao-1` nas tabelas do pacote de campo (+3) e do aplicativo (+5). README, `COLOCAR-DE-PE.md` e `LEIA-ME.md`: 283 testes do motor, 2023 do aplicativo, total 6642 com o aplicativo.

## Limites declarados

- Nunca foi executado em aparelho: a rede é dublada, como em toda a suíte do aplicativo. O que o teste prova é o encadeamento real fila, transporte e obtentor, não o fio.
- Se o servidor ainda recusar com 426 depois de a pessoa atualizar, nada muda: a fila continua pausada e sem renovar.

## Provas (em `saidas/`)

`01-item2-ANTES.txt` (2 dos 3 casos reprovam, 2 e 1 tentativas de renovação onde se esperava 0), `02-item2-DEPOIS-jest-do-app.txt` (jest do aplicativo: 142 suítes, 2023 casos, 0 falhas), `03-item2-DEPOIS-casos-novos.txt` (32 casos das três suítes tocadas), `04-pacote-campo-vitest.txt` (283 de 283), `05-typecheck-do-app.txt` (0). Os portões gerais da correção estão em `V2-F02-E04-parte-4B/correcao-1/saidas/`.

## Para o orquestrador

- Dívida paga: a de E06 nos clientes (garantia de "nenhuma tentativa de renovação" que o dublê escondia). Fica registrado que a suspensão cobre a fila, não as chamadas fora dela.
- Pendência humana: nenhuma. A prova em aparelho continua sendo a da V2-F14-E12.
- Quem mexer em `obterToken`: o pedido `{ semRenovar: true }` deve devolver o token sem tocar trava nem piso; o teste novo pega a regressão.
