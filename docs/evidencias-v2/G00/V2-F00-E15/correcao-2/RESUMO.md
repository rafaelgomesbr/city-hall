# V2-F00-E15, correção 2: o teste do botão de perigo passa a morder, e o disco ilegível e o item recusado ganham teste

Base: `cd38410`, ramo `v2/f00`. Motivo: rodada 4 reprovada pela dimensão Testes, confirmada por arbitragem em Opus (`VEREDITO.md`, `validacao/bb0f654/testes.md` e `arbitragem.md`). QA, Segurança, Red-team e LGPD passaram.

## Fatos

**O defeito provado pela validação.** O caso "o botão de confirmar é o de perigo, porque o ato apaga" (`dc360/apps/campo/src/ui/dialogo-na-conta-com-vistoria-comecada.test.tsx`) conferia só `accessibilityLabel`, `accessibilityViewIsModal` e que `sair` não foi chamado. Trocando `destrutiva: true` por `false` na ação "Sair da conta" de `perfil.tsx`, o jest inteiro continuava verde. O código de produção já estava certo (`Dialogo.tsx` desenha `tipo={acao.destrutiva ? "perigo" : "primario"}`); o defeito era a prova. Não há mudança de código de produção nesta correção.

**O que mudou (só o arquivo de teste).** O arquivo foi de 6 para 11 casos.

- O caso do botão de perigo agora compara o botão do diálogo com um `Botao tipo="perigo"` e um `Botao tipo="primario"` de referência, desenhados no mesmo tema (`ProvedorDeTema`, mesmo padrão de `botoes-que-chamam.test.tsx`): fundo e cor do rótulo iguais aos da referência de perigo, diferentes da referência primária e do botão "Continuar conectado". Não fixa cor, então não quebra com inversão legítima do desenho do perigo (mutação T1, verde).
- Caso novo (revisão independente, E8b): o disco responde "zero vistorias" na primeira pergunta, a pessoa recusa, o disco falha e ela toca de novo em "Sair da conta". O diálogo avisa "Não deu para conferir…" e não repete "nada a perder". Sem este caso, tirar `setRascunhosNaSaida(null)` do `catch` deixava tudo verde.
- Caso novo (E8): o disco falha já na primeira pergunta.
- Caso novo (E9): `bloqueados: 2` e nada pendente: "2 coletas ainda não enviadas".
- Caso novo (revisão): `enviando: 1` conta como não enviado (tirar `enviando` da conta sobrevivia a todas as suítes).
- Caso novo (revisão): o título do diálogo é "Sair da conta?" e, na árvore, a ação vem antes de "Continuar conectado" (inverter a ordem dos botões em `Dialogo.tsx` sobrevivia).
- O caso "sem vistoria começada e sem fila" confere também que o texto não contém "apaga".
- O dublê de `listarRascunhos` ganhou o interruptor `mockDiscoQuebrado`, e `resumoCom` os parâmetros `bloqueados` e `enviando`.
- `dc360/scripts/baseline.mjs`: entrada `V2-F00-E15-correcao-2` (+5). `dc360/README.md` (1927 para 1932, duas ocorrências) e `dc360/docs/COLOCAR-DE-PE.md` (4977, que inclui o que outras correções somaram no mesmo dia): números que o `conferir:numeros` mandou.

**E8, o código de hoje está certo.** `perfil.tsx` (`perguntarSaida`) grava `null` no `catch`, e `avisoDaSaida(…, null)` avisa. Não há conserto de código: os testes passam no código atual e reprovam com a mutação.

**Mordida (mutação no código de produção, desfeita com `git checkout` depois de cada uma; `saidas/10` contra o arquivo da rodada 4, `saidas/11` contra o arquivo novo).**

| Mutação | Teste da rodada 4 | Teste novo |
| --- | --- | --- |
| D1: `destrutiva: false` na ação "Sair da conta" (`perfil.tsx`) | 6 de 6 verdes | 1 reprova (o botão de perigo) |
| E8: o `catch` de `perguntarSaida` grava `contarRascunhos([])` | 6 de 6 verdes | 2 reprovam (disco falha; segunda pergunta) |
| E8b: o `catch` não grava `null` | 6 de 6 verdes | 1 reprova (segunda pergunta) |
| E9: `pendentes` sem `bloqueados` | 6 de 6 verdes | 1 reprova |
| C1: `pendentes` sem `enviando` | 6 de 6 verdes | 1 reprova |
| F3: título "Até logo" | 6 de 6 verdes | 1 reprova |
| O1: recusa antes da ação em `Dialogo.tsx` | 6 de 6 verdes | 1 reprova (ordem) |
| T1: inversão legítima do desenho do perigo (`componentes.tsx`, fundo e texto trocados) | n/a | 11 de 11 verdes (`12`), como deve |

Sem mutação: 11 de 11 (`13`).

**Testes, depois.**

| Comando | Resultado |
| --- | --- |
| `npm run test:campo` (`05`) | tipos limpos, 1932 testes verdes (eram 1927), "A leitura do código e o jest concordam: 1932 casos" |
| `npm run test --workspace @dc360/campo` (`06`) | 223 de 223 |
| portão de conteúdo (`07`) | 10 de 10 |
| portões do app, `scripts/portao-*.test.mjs` (`08-*`) | 6 de 6 arquivos, código 0 |
| `npm run conferir:numeros` (`09`) | 23 afirmações, código 0 |

`node scripts/conferir-indices-de-evidencia.mjs` (a partir de `dc360/`) e `conferir-evidencia.mjs` rodam por último, depois do `INDEX.md`, e não podem ser arquivados dentro do que conferem.

**Limitações.**

- O botão é conferido pelo estilo renderizado contra referência do mesmo tema, não por captura. O fluxo no aparelho (E4) continua pendência humana do Rafael.
- A ordem dos botões é conferida pela ordem dos `testID` na árvore de teste, não pela posição na tela.
- E2 (dono nulo em `acolherNoAparelho`) e o bloqueio de piloto (falha aberta de `acolherNoAparelho`) seguem fora desta etapa: dono F14-E02, decisão do Rafael.
- O total 4977 de `COLOCAR-DE-PE.md` depende das outras correções em andamento; quem commitar por último reconfere com `conferir:numeros`.

## Justificativa

O bloco da etapa manda o diálogo usar o botão destrutivo, e a seção 8 de `28` exige teste que morda em risco alto. Um caso que leva o nome da promessa e não a confere é pior que a falta do caso: dá a quem lê a sensação de que o botão de perigo está preso. O conserto está no teste e não no código porque o código já estava certo; conferir o fundo e o texto renderizados contra os tokens do tema é a forma que o resto do aplicativo já usa (`dialogo.test.tsx`, `botoes-que-chamam.test.tsx`) e não depende de expor propriedade nova só para teste.

E8 entrou junto porque é o mesmo diálogo e o modo de falha é exatamente o objetivo da etapa: se a leitura do disco falhar e a tela tratar isso como "nada a perder", a confirmação apaga a vistoria começada sem uma palavra. E9 entrou porque custava uma linha e a arbitragem a listou. Os casos de título, ordem dos botões, `enviando` e do disco que falha na segunda pergunta vieram do revisor independente: eram mutações que sobreviviam a todas as suítes e que o critério da etapa (o diálogo) cobre. Ficaram de fora E2 e a falha aberta de `acolherNoAparelho`: pertencem à regra de isolamento entre agentes e à decisão do CP-24 (F14-E02), não ao diálogo de saída.
