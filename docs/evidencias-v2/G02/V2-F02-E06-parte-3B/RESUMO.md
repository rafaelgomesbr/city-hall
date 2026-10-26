# V2-F02-E06 (parte 3B, clientes): `X-App-Version` no campo e no painel, e o 426 que pausa a fila sem perder item

## Fatos

**Escopo.** Só os clientes. A API (hook de versão, `VERSAO_MINIMA_*`, rota pública de versão mínima, CORS com `x-app-version`, 426 no espelho) é da parte 3A, que corre ao mesmo tempo; `apps/api/**` e `packages/shared/src/versao.ts` não foram tocados. Base: `origin/v2/f02` em `41af9f79` (lote 2 inteiro juntado).

**O que mudou (só `dc360/`):**

- `packages/campo/src/transporte.ts`: `OpcoesTransporte.versaoDoAplicativo` (opcional, recebida por PARÂMETRO; o pacote continua sem depender do Expo). Todo pedido à API que passa por `pedir` (vistoria, autorização e confirmação de foto, devolução, e o pedido repetido depois da renovação do 401) leva `x-app-version: campo/<versão>`. O PUT de `enviarBytes` (URL assinada) não leva: os cabeçalhos dele entram na assinatura e ele não fala com a API. Versão ausente ou vazia: o pedido sai como antes, sem o cabeçalho. Nova função exportada `cabecalhosDaVersao(versao)`, o único lugar que monta `campo/<versão>`. Em `falhaDaResposta`, o status 426 vira `FalhaDeSessao("versao_do_aplicativo_antiga")`, com a frase do servidor (ou uma frase de reserva, que a tela não mostra).
- `packages/campo/src/tipos.ts`: `MotivoDeSessao` ganha `versao_do_aplicativo_antiga` (o nome é o código do catálogo).
- `apps/campo/src/dados/versao-do-aplicativo.ts` (novo): `versaoDoAplicativo()` lê `Constants.expoConfig.version`; `cabecalhoDaVersao()` devolve o cabeçalho. Mora fora de `api.ts` porque vários testes dublam `./api` inteiro.
- `apps/campo/src/dados/api.ts` (todas as chamadas, inclusive entrar e renovar), `rota.ts`, `mapa.ts` e `historico-da-casa.ts` (os outros três `fetch` do aplicativo que falam com a API) mandam o cabeçalho. `fila.ts` passa `versaoDoAplicativo()` ao `transporteHttp`. O `fetch` de `foto-do-agente.ts` (PUT na URL assinada) não muda.
- `apps/campo/src/dados/pausa-da-fila.ts`: a entrada `versao_do_aplicativo_antiga` nas frases da pausa (faixa "Atualize o aplicativo", aviso, cartão e lista), com a mesma promessa das outras três ("Suas coletas continuam guardadas neste aparelho e nada foi apagado"). `ui/FaixaDeSincronizacao.tsx`: o estado novo no tipo `EstadoDaFaixa["chave"]` (a faixa já desenhava qualquer pausa por `frasesDaPausa`). Nenhuma tela, rota ou botão novo.
- `apps/web/src/dados/http.ts`: `x-app-version: painel/desconhecido` em todo pedido à API (as seis chamadas de `fetch`: `chamar`, renovação, saída e os três downloads). Nenhuma variável do Vite carrega hoje o número do build (só existem `VITE_API_URL` e `VITE_GOOGLE_MAPS_CHAVE`), então o valor é fixo; ver "Para o orquestrador". O 426 no painel não ganhou tratamento: já chegava como `ErroDaApi` com a frase do corpo, sem renovar (só o 401 renova) e sem derrubar a sessão (o código não é de acesso); os testes provam isso.
- Documentação: `apps/campo/LEIA-ME.md` (o cabeçalho, o comportamento com 426 e o passo 10 de aparelho), `README.md` (parágrafo "A versão do cliente em todo pedido (V2-F02-E06, parte 3B)" e as contagens).
- Testes novos: `packages/campo/test/versao-do-aplicativo.test.ts` (19 casos), `apps/campo/src/dados/versao-do-aplicativo.test.ts` (8), `apps/web/test/versao-do-aplicativo.test.ts` (4). `apps/campo/src/ui/faixa-de-sincronizacao.test.tsx` só ganhou o estado novo no mapa de estados tipado (sem caso novo).
- Contagens: chave `V2-F02-E06-parte-3B` em `MUDANCAS_DO_TESTE_CAMPO_PACOTE_POR_ETAPA` (19), `MUDANCAS_DO_TESTE_CAMPO_APP_POR_ETAPA` (8) e `MUDANCAS_DO_TESTE_WEB_POR_ETAPA` (4). README: pacote de campo 280, aplicativo 2018, painel 824, `npm test` 4389; `COLOCAR-DE-PE.md`: 6407; `apps/campo/LEIA-ME.md`: 280.

## Tabela final: categoria para ação da fila (com a linha do 426)

É a tabela da parte 2B com UMA linha nova (426). O status decide primeiro; a categoria decide dentro dele, nunca por cima. A `categoria` que o servidor mande no corpo não governa a fila.

| Status | Categoria do `erro` | Ação da fila |
| --- | --- | --- |
| rede fora, tempo esgotado | (nenhuma) | Temporário: item pendente, adiado, sem teto de tentativas. |
| 5xx, 429 | qualquer | Temporário: item pendente, adiado. |
| 401 | `reentrar` (`sessao_encerrada`, `credenciais`) | Pausa sem gastar a renovação; itens intactos. |
| 401 | `renovar` (`nao_autenticado`), outra categoria, ou código desconhecido ou ausente | Renova UMA vez e repete o mesmo pedido (mesmo corpo, mesma chave, mesmo `x-app-version`); token igual ou nova recusa: pausa, itens intactos. |
| 403 | `conta_desativada` (lido pelo código) | Pausa: a conta foi recusada, não a coleta. |
| 403 | `reentrar` (`troca_de_senha_obrigatoria`) | Pausa até a pessoa definir a senha. |
| 403 | `aguardar` (`acesso_suspenso`) | Temporário. |
| 403 | `permanente` (`sem_permissao` e afins), `renovar` (`assinatura`) ou desconhecido | Item bloqueado com código; descarte só pela tela. Não renova o token. |
| **426** | **qualquer, inclusive `versao_do_aplicativo_antiga` (`permanente` no catálogo), código desconhecido ou corpo vazio** | **Pausa (`FalhaDeSessao`, motivo `versao_do_aplicativo_antiga`), na classe de `conta_desativada`: todo item fica `pendente`, com a mesma contagem de tentativas e sem `ultimaFalha`; o dreno para no primeiro 426 (os itens seguintes nem são tocados); não renova o token. Atualizado o aplicativo, a mesma coleta sobe com a mesma chave. Vale nas quatro rotas da fila (vistoria, autorização e confirmação de foto, devolução).** |
| outro 4xx | qualquer, inclusive `autor_divergente`, `tarefa_no_prazo` e `envio_pendente` | Item bloqueado com código e campos, ou arquivado se a coleta ficou sem destino. Descarte só pela tela. |
| `PUT` na URL assinada | (status do armazenamento) | Sem mudança: 403 temporário, 5xx e 429 temporários, outro 4xx (inclusive 426) permanente; sem `/v1`, sem token e sem `x-app-version`. |

Por que o status decide no 426, e não a categoria: o catálogo põe `versao_do_aplicativo_antiga` em `permanente`, e `permanente` em "outro 4xx" bloqueia o item. Mas 426 nunca fala do dado, só do binário; bloquear poria "Descartar" ao lado de uma coleta boa, que é o defeito que a V2-F00-E06 fechou para a conta desativada. Na dúvida entre perder coleta e pausar, pausa.

## Prova de que nenhum item some

`saidas/13-prova-nenhum-item-some.txt`: a mesma fila com duas coletas, contra o mesmo servidor falso (426 até o aplicativo ser "atualizado", 201 depois), rodada na base e no candidato.

- **Base (antes da 3B):** o primeiro dreno manda as duas coletas, as duas levam 426 e as duas viram `bloqueado` com `ultimaFalha=versao_do_aplicativo_antiga` (o cartão ofereceria "Descartar"). Depois da atualização, o segundo dreno não manda nada: as coletas ficaram presas, e o pedido nem levava `x-app-version`.
- **Candidato:** o primeiro dreno manda UM pedido (`x-app-version=campo/1.2.0`), leva 426, para com `paradaPor: versao_do_aplicativo_antiga` e as duas coletas continuam `pendente`, `tentativas=0`, sem falha registrada. Depois da atualização, o segundo dreno manda as duas, com as mesmas chaves, e as duas viram `confirmado`.

Os casos permanentes estão em `packages/campo/test/versao-do-aplicativo.test.ts`: depósito antes e depois do 426 (mesmo estado, mesma contagem, mesmo envelope), `remover` nunca chamado, `resumo.pausadaPor`, nenhuma chamada de `obterToken({ renovarJa: true })`, a devolução também pausada, e a subida das mesmas chaves depois.

## Prova de mordida

- `saidas/12-mordida-base.txt`: o teste novo do pacote contra `transporte.ts` e `tipos.ts` da base: **10 de 19 falham** (o cabeçalho ausente, o 426 virando `FalhaPermanente` em cada rota, a fila sem pausa). Os 9 que passam na base são os de não regressão (URL assinada sem o cabeçalho, pedido sem versão igual ao de antes, 401, 409, 5xx e 429) e o PUT da URL assinada que não conhece 426. Candidato: 19 de 19 (`saidas/11-test-pacote-campo.txt`). Rodado antes da formatação final do arquivo de teste (só a numeração de linhas muda).
- `saidas/17-mordida-web-base.txt`: o teste novo do painel contra o `http.ts` da base: os 2 casos do cabeçalho falham; os 2 do 426 passam nas duas versões, porque o painel já tratava o 426 como erro comum (são não regressão, como o pedido diz).
- O teste novo do aplicativo não tem mordida contra a base porque importa o módulo novo `versao-do-aplicativo.ts`; ele inclui uma varredura de todo `fetch(` do aplicativo (4 com o cabeçalho, 1 URL assinada sem) que reprova o pedido novo que alguém acrescentar sem o cabeçalho.

## Limites declarados (leia antes de dar PASS)

- **Não houve aparelho nem simulador.** O E2E da etapa ("simulador do campo com mínimo acima da versão: a fila não perde item") fica como pendência humana: é o passo 10 de `apps/campo/LEIA-ME.md`. Os testes provam o caminho por dublê de `fetch`, e `campo-integracao*.test.ts` prova a fila real contra a API real sem o cabeçalho (a API desta base ainda não lê `x-app-version`; isso é da 3A).
- **Dependência de ordem com a 3A (CORS).** O painel passa a mandar `x-app-version`, que não é cabeçalho simples de CORS. Hoje o `allowedHeaders` de `apps/api/src/servidor.ts` é `content-type, authorization, accept, if-none-match`. Com o painel numa origem diferente da API, o preflight recusaria TODO pedido do painel se esta parte fosse publicada sem a 3A. A 3A acrescenta `x-app-version` ao CORS no mesmo lote; a junção precisa levar as duas juntas (ou a 3A antes). O aplicativo de campo não passa por CORS.
- **Frases novas.** A pausa pelo 426 precisava de frases no mapa tipado `frasesDaPausa` (sem elas o aplicativo não compila). Foram escritas no padrão das outras três, sem tela nem botão. Se o orquestrador preferir outro texto, é uma troca em `pausa-da-fila.ts`; a tela própria é da V2-F14-E08.
- **Fora da fila,** o 426 ao baixar a lista cai no texto genérico que já existia em `falha-de-atualizacao.ts` ("Não deu para atualizar agora"), e na entrada a tela mostra a frase do servidor (`mensagemAmigavel` devolve a mensagem do corpo). Nenhuma frase nova ali, de propósito.
- **`painel/desconhecido`:** sem variável de build no Vite, o painel não informa a versão real; a observabilidade da 3A verá todos os painéis como `desconhecido` até alguém criar a variável.
- O cabeçalho é montado em minúsculas (`x-app-version`), como os demais cabeçalhos destes arquivos; HTTP não diferencia.
- `test:e2e:api` não foi rodado (instrução do orquestrador).
- Falhas de ambiente Windows aceitas, e só elas: `regras-de-conteudo.test.ts` 1 caso (EPERM em symlink, DV-46), `desfazer-migracao.test.ts` 5, `guarda-da-semente.test.ts` 3, `semear-homologacao.test.ts` 2.

## Provas (em `saidas/`)

1. `01-typecheck.txt` (código 0). 2. `02-lint.txt` (OK monorepo e aplicativo de campo). 3. `03-lint-teto.txt` (431, não sobe). 4. `04-formato.txt` (OK). 5. `05-conferir-numeros.txt` (tudo bate; `node --test scripts/baseline.test.mjs` 29 de 29). 6. `06-test-scripts.txt` (831 casos, 808 passam, 0 falham, 23 pulados; rodado com o INDEX desta pasta já presente). 7. `07-regras-de-conteudo.txt` (9 de 10; o 1 é o EPERM do Windows, DV-46). 8. `08-auditar.txt` (código 0, runtime limpo). 9. `09-npm-test.txt` (campo pacote 280 de 280; shared 416 de 417; api 2039 de 2075 com 34 pulados e 2 falhas, as de `semear-homologacao`; console 379 de 379; web 824 de 824; db 440 de 454 com 6 pulados e 8 falhas, `desfazer-migracao` 5 e `guarda-da-semente` 3; todas as falhas são as de ambiente listadas). 10. `10-test-isolamento.txt` (`isolamento.test.ts` CA-06 137 de 137; as 8 falhas são `desfazer-migracao` e `guarda-da-semente`, de ambiente). 11. `11-test-pacote-campo.txt` (280 de 280). 12. `12-mordida-base.txt`. 13. `13-prova-nenhum-item-some.txt`. 14. `14-campo-integracao-dois-prefixos.txt` (`campo-integracao.test.ts` e `campo-integracao-v1.test.ts`, 34 de 34: a fila real contra a API real nos dois prefixos). 15. `15-test-campo-aplicativo.txt` (`npm run test:campo`: tipos limpos, 141 suítes, 2018 de 2018, leitura do código e jest concordam). 16. `16-web-versao-e-426.txt` (painel: o teste novo e o da parte 2A, 27 de 27). 17. `17-mordida-web-base.txt`.

## Justificativa

A regra desta parte era a mesma da 2B: nenhum item some, nenhuma coleta boa ganha "Descartar", e a categoria nunca passa por cima do status. O 426 é recusa do binário, e não da coleta nem da sessão; por isso entrou na classe que a V2-F00-E06 criou para a conta desativada, que é exatamente "o servidor recusou quem manda, não o que foi mandado". A pausa já tinha toda a máquina pronta (o item volta como estava, o dreno para, o laço espera um minuto, a faixa e o cartão dizem o que fazer), e o único acréscimo foi o motivo e as frases dele. O cabeçalho ficou só aditivo: sem versão, o pedido sai byte a byte como antes, o espelho sem `/v1` e os aparelhos instalados não mudam, e a URL assinada continua recebendo exatamente os cabeçalhos assinados.

## Para o orquestrador

- **Linha do STATUS sugerida:** `V2-F02-E06 (parte 3B, clientes) | IMPLEMENTADA (candidato) | campo manda x-app-version: campo/<expoConfig.version> em todo pedido à API (api.ts, rota, mapa, histórico e a fila, com a versão por parâmetro ao transporte) e nunca na URL assinada; o 426 pausa a fila (FalhaDeSessao versao_do_aplicativo_antiga, classe da conta desativada) com todo item pendente, sem renovar; painel manda painel/desconhecido (sem variável de build no Vite) e mostra o 426 como erro comum. 280 testes do pacote, 2018 do aplicativo, 824 do painel.`
- **Junção:** levar junto da 3A, ou depois dela: o painel só pode mandar `x-app-version` com o cabeçalho já no `allowedHeaders` do CORS da API. Em conflito de contagem (`baseline.mjs`, README, `COLOCAR-DE-PE.md`, `apps/campo/LEIA-ME.md`), somar as chaves; o parágrafo do README desta parte fica logo depois do da parte 2B. Se a 3A exportar de `packages/shared/src/versao.ts` uma constante com o nome do cabeçalho ou um montador de `<aplicativo>/<versão>`, trocar o literal em `cabecalhosDaVersao` (pacote de campo) e em `VERSAO_DO_PAINEL` (painel) é opcional e não muda comportamento.
- **Decisão pequena registrada:** as frases da pausa pelo 426 em `apps/campo/src/dados/pausa-da-fila.ts` (faixa "Atualize o aplicativo"); a V2-F14-E08 é dona da tela definitiva.
- **Dívidas pagas:** nenhuma.
- **Pendências humanas:** (1) o E2E manual da etapa, passo 10 de `apps/campo/LEIA-ME.md` (simulador ou aparelho com a versão mínima acima da do binário: faixa "Atualize o aplicativo", coleta "Guardada", sem "Descartar", e a mesma coleta subindo depois de esvaziar a versão mínima); (2) criar, se o Rafael quiser a versão real do painel na observabilidade, uma variável de build do Vite (hoje `painel/desconhecido`).
