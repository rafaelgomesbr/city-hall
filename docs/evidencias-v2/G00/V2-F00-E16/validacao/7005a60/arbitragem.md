---
arbitro: arquiteto-software
modelo: claude-opus-5-5
etapa: V2-F00-E16
sha_validado: 7005a60cd70b30a4f455a96a64c4d7a3abb2819f
conflito: [qa, testes]
decisao: FAIL
confianca: alta
---
## Conflito

`qa.md` e `testes.md` deram PASS, mas `testes.md` anotou como "corrige antes de crescer" que `dc360/apps/campo/src/app/(agente)/fila.tsx` ainda diz ao agente que o envio "acontece sozinho, em segundo plano", enquanto a DoD da E16 exige "nenhuma promessa de segundo plano na interface". A divergência é entre o veredito (PASS) e o achado que o próprio validador registrou. Perguntas: a fila drena sozinha com o aplicativo aberto? E com ele fechado? A frase é promessa de segundo plano?

## Prova reproduzida

Reprodução por leitura do código no SHA (HEAD 665b2be difere só no STATUS). Esta sessão não tinha ferramenta de execução de comando.

1. Texto exibido ao agente, não comentário:
   - `fila.tsx:1686-1690`, `descricao` do `Vazio` da fila zerada: "... e o envio do que vier depois acontece sozinho, em segundo plano."
   - `fila.tsx:1854-1857`, `Txt` de legenda sob o botão de enviar: "O envio acontece sozinho, em segundo plano. Este botão é para quando você quer ver acontecer."
   - `index.tsx:842` contém a mesma expressão, mas dentro de comentário: não é interface.
2. Com o aplicativo aberto a fila drena sem toque: `app/(agente)/_layout.tsx:171-193` chama `iniciarSincronizacaoContinua` (`dados/fila.ts:117-151`), um laço JavaScript que drena quando há sinal e dorme até a próxima janela (piso de 15 s); `_layout.tsx:197-199` drena de novo quando o sinal volta. Parte "sozinho" da frase: verdadeira, só com o app aberto e o layout montado.
3. Com o aplicativo fechado nada drena: busca por `task-manager`, `background-fetch`, `background-task`, `UIBackgroundModes`, `BackgroundFetch` e `TaskManager` em `dc360/` (fora de `node_modules`) só acha os dois comentários e o teste que AFIRMAM a ausência (`vistoria/[id].tsx:2328-2334` e `vistoria-o-teclado-a-camera-e-o-que-ela-promete.test.tsx:253-256`). O laço é um `setTimeout` em JavaScript: o sistema suspende o processo em segundo plano (no iOS em segundos) e o mata quando quer. Com o app minimizado não há garantia de envio; com ele fechado não há envio.
4. O próprio produto usa "segundo plano" como o estado do app fora da tela: `push/volta-do-segundo-plano.test.tsx`, `dados/atualizacao.ts:11` ("o aplicativo voltou do segundo plano"), `index.tsx:711`. No vocabulário do produto, "em segundo plano" é exatamente "com o app fora da tela".
5. A frase corrigida pela E16 na tela de vistoria guardada (`vistoria/[id].tsx:2337-2342`): "sobe quando o aplicativo estiver aberto e houver rede ... ela sobe quando você abrir o aplicativo com sinal". A fila, duas telas depois, diz o contrário. O teste da E16 (`...promete.test.tsx:263`) só varre a tela de vistoria guardada.

## Decisão e fundamento

FAIL.

- A DoD diz "nenhuma promessa de segundo plano na INTERFACE", não "na tela de vistoria guardada". O teste negativo do bloco ("a frase nova não promete nada em segundo plano") é o mínimo provado, não o limite do critério.
- O Problema da etapa nomeia o risco: "não há sincronização em segundo plano". O Risco de segurança: "a frase falsa de envio é o risco principal (o agente acredita que a coleta subiu)". A legenda da fila produz esse mesmo engano: o agente que lê "acontece sozinho, em segundo plano" fecha o aplicativo sem sinal e acredita que a coleta vai subir.
- "O que NÃO deve ser implementado: sincronização em segundo plano (F14-E06, CP-24)" exclui a FUNÇÃO, não a correção do TEXTO; dizer a verdade sobre a ausência dela é exatamente o que a etapa entrega.
- O "Reabre se" do G00 ("a documentação ou a apresentação voltar a afirmar o que o código não faz") é item 9 da lista da seção 7 de `28`: não admite risco aceito, então o achado não pode ficar como anotação sob PASS.
- Não é BLOCKED: o texto certo já foi decidido no próprio bloco ("sobe quando o aplicativo estiver aberto e houver rede"); não há decisão de produto nova.

## Conserto mínimo no escopo

1. `fila.tsx:1686-1690`: trocar o fim por algo como "o que vier depois sobe quando o aplicativo estiver aberto e houver rede.".
2. `fila.tsx:1854-1857`: algo como "Com o aplicativo aberto e com sinal, o envio acontece sem você tocar em nada. Este botão é para quando você quer ver acontecer.".
3. Teste vermelho primeiro, de interface e não de uma tela só: renderizar a fila zerada e a fila com itens e afirmar `queryByText(/segundo plano|fechado/i)` nulo; ou um portão em `scripts/` que varre as cadeias visíveis de `apps/campo/src/app/**` (fora de comentário) por "segundo plano" e "aplicativo fechado". O primeiro é suficiente para a E16; o segundo é o que impede a volta.
4. Conferir `apps/campo/LEIA-ME.md` pela mesma promessa.
