---
validador: qa
modelo: claude-opus-5-5
etapa: V2-F00-E16
sha_validado: 1ed0b71
ci_run: ausente
rodada: 6
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

Notação: `$V` é `/private/tmp/claude-501/-Users-rafaelgomes-Documents-city-hall/743e49ef-b0cc-448c-8891-518b9ad66083/scratchpad/validadores/qa`. Produto de `1ed0b71` igual ao do HEAD em `dc360/`. Mutações num worktree destacado em `1ed0b71` (já removido), com restauração conferida por `git status`.

| Critério | Prova | Resultado |
| --- | --- | --- |
| DoD: "7 testes verdes" | `src/__tests__/vistoria-o-teclado-a-camera-e-o-que-ela-promete.test.tsx`, 17 de 17 (`$V/e15-teclado.txt`) | PASS |
| Frase da vistoria guardada sem "aplicativo fechado" | mutação F6 (acrescentar "mesmo com o aplicativo fechado" ao aviso): reprova "não promete envio com o aplicativo fechado" | PASS |
| Primeiro toque fora do campo age (`keyboardShouldPersistTaps`) | mutação F3 (atributo removido): reprova "o primeiro toque fora do campo AGE" | PASS |
| Câmera reserva a área segura de baixo | mutação F4 (`margens.bottom` zerado): reprova "reserva a área segura de baixo" | PASS |
| Permissão negada de câmera e de localização com "Abrir os ajustes do aparelho" | mutação F2 (permissão negada sem o botão): 5 reprovam, inclusive o de nome para leitor de tela e área de 44 | PASS |
| Falha que não é de permissão não ganha o botão (negativo) | mutação F1 (toda falha com o botão): 4 reprovam, entre eles "uma falha que não é de permissão não ganha o botão" | PASS |
| Foto vazia diz "Tire a foto de novo" | mutação F5 (volta à frase genérica): 4 reprovam | PASS |
| Precisão ausente continua `null` (negativo) | caso "aparelho que não informa a precisão grava nulo" verde; mutação G3 da E15 o derruba | PASS |
| Nenhuma promessa de segundo plano na interface (DoD) | portão `scripts/portao-sem-promessa-de-segundo-plano-do-aplicativo.test.mjs` verde; varredura própria das frases novas desde `bb0f654` em `apps/campo/src` (fora de teste e comentário): toda promessa de envio traz a condição "aberto" | PASS, com achado sobre o portão |
| Portões do app verdes | acessibilidade, densidade, design e segundo plano: 48 de 48, código 0 (`$V/e16-portoes.txt`) | PASS |
| Regressão obrigatória `npm run test:campo` | código 0, 1997 de 1997, tipos limpos (`$V/r-test-campo.txt`) | PASS |
| E2E no aparelho (negar câmera e abrir os Ajustes; teclado aberto e "Tirar foto" no primeiro toque; foto aceita no Android) | sem emulador nem aparelho | pendência humana |

## Evidência

- `npm run test:campo`: código 0, 139 suítes, 1997 de 1997. `$V/r-test-campo.txt`.
- `node --test` dos quatro portões do app: código 0, 48 de 48. `$V/e16-portoes.txt`.
- `npx jest --verbose` do arquivo da etapa: 17 de 17. `$V/e15-teclado.txt`.
- Mutações F1 a F6: lista `$V/muts-e16.json`, resumo `$V/mut-e16-resumo.txt`, saída bruta com diff em `$V/mut/F1.txt` a `$V/mut/F6.txt`; cada uma com `tsc` 0 e o jest inteiro do app.
- Sonda do portão de segundo plano: `$V/scripts/sonda-e16.mjs`, resultado `$V/sonda-e16.txt`.

## Cenários positivos

- Permissão negada de câmera e de localização: tarja com o botão que chama `Linking.openSettings`, com nome e área de 44.
- Foto que sai vazia do disco: tarja com a frase de `guardarFotoNoAparelho`.
- Vistoria guardada: "Ela sobe com o aplicativo aberto".

## Cenários negativos

- Falha que não é de permissão, e a falha seguinte depois de uma de permissão: sem o botão (F1 morde).
- Câmera que não dispara: frase genérica, não a da foto vazia.
- `Linking.openSettings` rejeitado: nada estoura, a tarja continua.
- Precisão ausente: `null`.

## Tentativas de reprovar

1. Seis mutações de produção, uma por critério (F1 a F6): todas reprovam no jest inteiro.
2. Plantei 9 promessas de envio fora do aplicativo, com palavras que o portão não lista, pela função exportada `promessasEm` (`$V/sonda-e16.txt`). Três passam: "A coleta vai para o servidor quando o celular pegar rede.", "A coordenação recebe a vistoria mesmo com a tela apagada." e "Assim que pegar 4G, a vistoria é entregue.". As outras seis reprovam ("A vistoria será sincronizada quando houver conexão.", "Tudo é sincronizado automaticamente.", "Guarde o telefone, a coleta sobe." e outras).
3. Procurei, nas frases de tela acrescentadas desde `bb0f654` (correções da E06 em `fila.tsx`, `index.tsx`, `vistoria/[id].tsx` e `perfil.tsx`), promessa de envio sem a condição: nenhuma; a única com "Se houver sinal, ela sai agora" continua na linha seguinte com "enquanto o aplicativo estiver aberto".

## Achados

- corrige antes de crescer: o portão de segundo plano ainda deixa passar promessas por classe que ele diz cobrir (3 de 9 plantadas, item 2 das tentativas), contra a afirmação da correção 2 de que a regra por classe "deixa passar 0". As três falam de entrega ("vai para o servidor", "recebe", "é entregue") com momento ("quando o celular pegar rede", "assim que pegar 4G") ou afastamento ("tela apagada") sem a condição "aberto". Hoje nenhuma frase do aplicativo tem essa forma, então o critério da etapa está atendido; o risco é de regressão futura. Reprodução: `node $V/scripts/sonda-e16.mjs dc360/scripts/portao-sem-promessa-de-segundo-plano-do-aplicativo.test.mjs`.

Nenhum achado bloqueia.

## Não verificado

- Tudo o que só o aparelho mostra: teclado cobrindo o campo no iOS e no Android, obturador acima da barra do sistema, Ajustes abrindo de verdade, foto aceita no Android depois da correção da cópia assíncrona, leitura da tarja pelo leitor de tela. Não há emulador nem aparelho nesta máquina.
- Capturas: as da correção 2 são de árvore renderizada em Chromium (E1+), não do React Native; não gerei novas.
- CI do SHA: ausente (H32).

## Risco residual

Os sete comportamentos estão presos por teste que morde. O que falta é a prova física (F14-E12) e o portão de segundo plano, que segue vazando promessas de uma forma que o aplicativo ainda não usa.

## Motivo do humano

A etapa tem E4 explícito: Rafael, no iPhone (e em Android real quando houver), nega a câmera e toca em "Abrir os ajustes do aparelho", digita o nome com o teclado aberto e toca em "Tirar foto" no primeiro toque, confere o obturador acima da barra do sistema e a foto aceita, e aprova as frases novas de envio. Só o aparelho prova teclado, área segura, Ajustes e câmera.
