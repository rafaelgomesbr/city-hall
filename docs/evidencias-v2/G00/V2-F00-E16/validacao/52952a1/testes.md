---
validador: testes (agente general-purpose com o papel da dimensão)
modelo: claude-opus-5-5
etapa: V2-F00-E16
sha_validado: 52952a1
ci_run: 38618369218
rodada: 3
herdado_de:
tags: [MOBILE, A11Y]
nivel_de_prova_exigido: [E1]
nivel_de_prova_obtido: [E1]
veredito: PASS
confianca: media
humano_necessario: nao
escalar: nenhum
---
## Critérios verificados

Veredito: **PASS** na dimensão testes. O defeito que reprovou a rodada 2 nesta dimensão (dublê de `File.copy` síncrono que escondia a foto recusada no Android) está fechado: o dublê novo segue o contrato instalado e o teste reprova sem o `await`. Dois achados "corrige antes de crescer": (1) os dublês ainda prendem a implementação a `copy` assíncrona e reprovam o conserto alternativo `copySync`, que é válido pelo contrato, e a alegação de que "com `copySync` os 18 casos passam" não vale mais neste SHA; (2) o portão de segundo plano deixa passar 13 de 20 promessas plantadas. Decido que o portão é MELHORIA e não critério da etapa (motivo abaixo).

Base: `$SP/val/testes/` (prefixo `e16-`).

| Critério (bloco da E16 e rodada 2) | Resultado | Prova |
| --- | --- | --- |
| contrato real de `File.copy` | conferido | `apps/campo/node_modules/expo-file-system` 57.0.7: `copy(...): Promise<void>` e `copySync(...): void` (`build/internal/NativeFileSystem.types.d.ts:182,186`); `AsyncFunction("copy") Coroutine` e `Function("copySync")` em `android/.../FileSystemModule.kt:203,207`; `size` "0 if the file does not exist" (linha 220); `delete()` síncrono |
| R2: dublê síncrono escondia o defeito | FECHADO, morde | `evidencia-no-disco.test.ts` e `vistoria-a-foto-com-o-disco-fiel.test.tsx` têm `copy` assíncrona (destino só existe depois de um tick). Sem o `await` em `evidencia-no-disco.ts`: 2 suítes reprovam, uma delas derrubada inteira por rejeição solta (`e16-10-D1-sem-await-na-copia.txt`). Sem o `await` na tela (`vistoria/[id].tsx`): o teste de tela com o disco fiel reprova (`e16-11-...`) |
| foto vazia e cópia pela metade não deixam arquivo órfão | morde | sem a limpeza do `catch`: 1 reprova (`e16-13-...`); sem a limpeza do arquivo de tamanho 0: 1 reprova (`e16-14-...`) |
| contraste de "Voltar sem fotografar" sobre o visor | morde | sem `SobreOVisor`: 1 reprova (tema claro) (`e16-12-...`) |
| R2: o teste reprovava o conserto certo (`copySync`) | PARCIAL | com `copySync` no lugar de `await copy`: 2 de 21 reprovam (`e16-15-D6-copySync-alternativo.txt`): "o pedaço que uma cópia interrompida deixou também é apagado" (o dublê só simula a cópia pela metade em `copy`, não em `copySync`) e o teste de tela, cujo dublê "FIEL ao expo-file-system 57" não tem `copySync` e cai em "o armazenamento pode estar cheio". O comportamento travado agora é correto, mas o conserto alternativo correto continua reprovado |
| sete casos de `vistoria-o-teclado-a-camera-e-o-que-ela-promete` e vizinhos, independentes da ordem | PASS | 11 arquivos com `--randomize`, sementes 1 a 5: 228 de 228 (`e16-01-...`) |
| portões do app verdes | PASS | `node --test` nos 4 portões do aplicativo: 48 de 48, código 0 (`e16-21-portoes-do-app.txt`) |
| nenhuma promessa de segundo plano na interface (DoD) | PASS | portão verde; varredura minha por verbos de envio em literais do app: nenhuma promessa de envio com afastamento ou autonomia sem a condição "aberto" (ver Tentativas) |
| o portão de segundo plano morde no arquivo real | PASS | promessa "sobe mesmo com o aplicativo fechado" plantada em `vistoria/[id].tsx`: 1 reprova; restaurado (`e16-22-...`) |
| o portão pega promessas fora da lista dele | NÃO (melhoria) | 6 de 6 frases do QA desta rodada e 7 de 14 minhas passam (`e16-20-portao-variantes.txt`) |

## Evidência

- Lote de 11 arquivos (`evidencia-no-disco`, `vistoria-a-foto-com-o-disco-fiel`, `vistoria-camera-legivel-sobre-o-visor`, `vistoria-o-teclado-a-camera-e-o-que-ela-promete`, `vistoria-como-produto`, `vistoria-nao-sai-quebrada`, `vistoria-ao-voltar-ao-foco`, `vistoria-mapa-e-historico`, `dialogo-na-fila`, `fila-como-produto`, `foto-do-agente`): `npx jest --ci --randomize --seed=N`, N de 1 a 5, código 0, 228 de 228.
- Mutações D1 a D6 em `apps/campo/src`, cada uma desfeita com `git restore src`, `git status --porcelain src` vazio depois: `e16-10` a `e16-15` (saída completa em `*.full`).
- Portão: script `$SP/val/testes/portao-variantes-testes.mjs` importa `promessasEm` do portão e aplica cada frase como JSX e como literal; saída `e16-20`. Plantio no arquivo real e restauração: `e16-22`.

## Cenários positivos

- Com o disco fiel, a foto é aceita: "Fotografias (1)", sem a tarja de arquivo vazio, e o rascunho guarda o caminho e o tamanho da cópia.
- As frases verdadeiras ("sai quando o aplicativo estiver aberto e houver sinal", "Não feche o aplicativo antes de o envio terminar", "vai continuar tentando enquanto o aplicativo estiver aberto") passam no portão.

## Cenários negativos

- Cópia recusada pelo sistema (Promise rejeitada) sai em português; cópia pela metade e arquivo vazio são apagados.
- Falha que não é de permissão não ganha o botão de ajustes (caso existente do arquivo da etapa, verde nas 5 sementes).

## Tentativas de reprovar

1. Desfiz cada conserto da correção 2 (D1 a D5): todos mordem.
2. Apliquei o conserto alternativo `copySync`, que o contrato instalado oferece e que a rodada 2 apontou como correto: 2 testes reprovam. A alegação da correção 2 ("com `copySync` no lugar do `await`, os 18 casos passam", `saidas/46`) era verdade para o arquivo de 18 casos; os 2 casos de órfão acrescentados depois e o teste de tela novo não a mantiveram.
3. Conferi os outros dublês de `guardarFotoNoAparelho` nas telas (`vistoria-como-produto`, `vistoria-nao-sai-quebrada`, `vistoria-ao-voltar-ao-foco`, `vistoria-mapa-e-historico`): devolvem objeto síncrono, e a função real agora devolve Promise. Como a tela faz `await`, eles continuam servindo; só o teste com o disco fiel pega a falta do `await` na tela (D2 mostrou isso).
4. **Portão (decisão pedida).** Plantei 14 promessas novas além das 6 do QA. Passam pelo portão: "A coleta chega à coordenação mesmo com a tela apagada.", "Assim que o sinal voltar, a coordenação recebe a vistoria.", "A vistoria é despachada para o servidor quando a rede voltar.", "Mesmo desligado, o aparelho manda a vistoria depois.", "Quando houver rede, a vistoria vai embora para a coordenação.", "Seu trabalho já está a caminho da coordenação.", "A vistoria vai para a coordenação assim que pegar sinal.", "O aplicativo envia por conta própria quando encontrar rede.", "A coleta sobe por conta própria.", "Ao recuperar o sinal, o envio é feito.", "Quando o Wi-Fi voltar, a vistoria vai.", "A vistoria fica na fila e sobe quando der.", "Você pode apagar a tela que a vistoria sobe.". Reprovam 7 de 14 minhas (as que caem nas classes: "guardar o celular", "desligar a tela", "quando a internet voltar", "app fechado", "deixar o celular").
   Decisão: **melhoria, não critério da etapa.** O bloco da E16 pede a frase nova e "nenhuma promessa de segundo plano na interface" e lista os portões do app como regressão; o portão de segundo plano é a guarda que a correção 1 criou e a rodada 2 pediu "menos dependente de lista fechada", o que foi feito (regra por classe de verbo e afastamento, 15 casos). O critério é sobre o texto que existe hoje, e esse eu conferi por varredura própria: os literais do aplicativo com verbo de envio (`sobe`, `sai`, `chega`, `recebe`, `envia`, `quando`, `assim que`) ou trazem a condição "aberto", ou não falam de autonomia nem de largar o aplicativo. O mais próximo é "A vistoria que você já fez continua guardada e vai ser enviada do mesmo jeito." (`vistoria/[id].tsx`, diálogo de nova vistoria), que promete envio sem prometer segundo plano. Um portão heurístico com lacunas não é defeito do produto; vira defeito no dia em que uma frase dessas entrar e passar.
5. O portão só varre `apps/campo/src`. Texto de produto que o aplicativo mostra e que mora em `packages/campo` (por exemplo `FRASE_DO_IMPEDIMENTO`) fica fora; hoje nenhuma dessas frases promete segundo plano.

## Achados

### CORRIGE ANTES DE CRESCER

1. **Dublês incompletos prendem a implementação a `copy` assíncrona.** O dublê de `vistoria-a-foto-com-o-disco-fiel.test.tsx` se declara fiel ao `expo-file-system` 57 e não tem `copySync`; o de `evidencia-no-disco.test.ts` só simula a cópia pela metade em `copy`. Reprodução: `e16-15-D6-copySync-alternativo.txt`. Conserto: `copySync` no dublê de tela e o caso "pela metade" também no `copySync`. Não esconde defeito (o erro é vermelho falso, não verde falso), por isso não reprova. Dono: E16.
2. **Portão de segundo plano com lacunas por classe** (achado 1 do QA desta rodada, confirmado e ampliado): 13 de 20 promessas plantadas passam. Classes que faltam: retomada do sinal como gatilho ("assim que o sinal voltar", "ao recuperar o sinal", "quando o Wi-Fi voltar", "quando der"), verbos "ir", "despachar", "a caminho", "por conta própria", "tela apagada", "mesmo desligado". Dono: E16 (portão) ou F01-E03.

### ANOTADO

- A alegação da correção 2 sobre `copySync` (`saidas/46`, 18 de 18) não se sustenta no arquivo de 20 casos de hoje; o relatório da etapa deveria dizer isso.
- `delete()` do dublê não lança para arquivo inexistente; o módulo real lança. `apagarFotoDoAparelho` engole a exceção, então não muda o resultado.

## Não verificado

- A foto aceita num aparelho ou emulador (E2): sem emulador Android nesta máquina; fora desta dimensão.
- A leitura do texto pelo React Native em tempo de execução (frase montada com valor de fora do arquivo): o portão não alcança, por desenho.

## Risco residual

Médio-baixo. O defeito de perda de foto está guardado por teste fiel ao contrato na direção que importa (verde falso). O que resta é rigidez de dublê e um portão heurístico.

## Motivo do humano

Nenhum para esta dimensão.
