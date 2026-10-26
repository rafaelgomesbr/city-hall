# V2-F02-E05, parte 4A: teste de contrato cliente x rota para o painel, o campo e o console

Ramo `trab/f02-4a-e05-contrato-clientes`, a partir de `origin/v2/f02` (`35830cb2`, lote 3 inteiro juntado). Toca só testes, o ajudante de teste, o `baseline.mjs`, o README, `apps/api/PENDENCIAS.md`, `docs/COLOCAR-DE-PE.md` (um número) e esta pasta. Não toca `apps/api/src/` (nem `contrato/tipos.ts` e `openapi.ts`, da parte 4B) nem o código de produto de nenhum cliente.

## Fatos

**O que foi feito:**

- `apps/api/test/apoio/rotas.ts` (novo): a leitura de `printRoutes` que morava em `superficie-registrada.ts`, mais `normalizarRota` (parâmetro vira `:p`, barra final sai: o Fastify registra `/x` e `/x/` como a mesma rota) e `rotasDaV1` (as rotas sob `/v1` com o prefixo tirado, que é o que um cliente escreve porque o prefixo vive na base). `superficie-registrada.ts` agora só reexporta a leitura (os outros seis testes que importavam dali seguem iguais) e `superficie.test.ts` importa direto do ajudante. Nenhum caso mudou.
- `apps/api/test/apoio/extrair-chamadas.ts` (novo): o extrator que nasceu em `contrato-do-painel.test.ts`, generalizado por um PERFIL (nome das funções de chamada de cada arquivo, e onde estão o método, o corpo e o sinal de "sem token": opção `metodo`, `method`, terceiro argumento, fixo). Lê o texto SEM comentários (`semComentarios`, que preserva a posição das linhas e sabe de literais, templates aninhados e expressões regulares: o contador antigo por "linha que começa com asterisco" não via comentário de bloco sem asterisco), lê o caminho como literal, template ou concatenação com `+` (o console), lê as chaves do corpo literal e da query, e declara o que não lê. `contrato-do-painel.test.ts` passou a importar dele (os 12 casos seguem iguais).
- `apps/api/test/apoio/esquemas.ts` (novo): lê as chaves de primeiro nível de um esquema Zod do registro (objeto, `pipe`, opcional, `lazy`, interseção) e quais são obrigatórias. União e união discriminada devolvem `null` (ilegível), nunca um palpite.
- `apps/api/test/contrato-cliente-rota.test.ts` (novo, 82 casos). Confronta cada chamada dos clientes com as rotas `/v1` do servidor MONTADO:
  - **painel** `apps/web/src/dados/http.ts`; **campo** `apps/campo/src/dados/{api,historico-da-casa,mapa,rota,foto-do-agente}.ts` e `packages/campo/src/transporte.ts` (a fila offline); **console** o script que o console serve (`JS_DO_CONSOLE`), contra as rotas lidas de `apps/console/src/servidor.ts`.
  - Por arquivo: toda chamada lida (`naoLidas` vazio); o caminho existe; o método bate (`metodoErrado` separado de `faltando`, para a mensagem dizer qual dos dois); o corpo e a consulta casam com o esquema do registro (nenhuma chave desconhecida, toda obrigatória presente); pedido sem token só mira rota isenta (`SEM_TOKEN`); âncora (chamadas lidas + mecanismo = chamadas contadas por outro caminho, com piso por arquivo).
  - Regra "todo `fetch` passa por `chamar` ou pela base": a varredura de TODO arquivo de código de `apps/web/src`, `apps/campo/src`, `packages/campo/src` e `apps/console/src` reprova `fetch(`, `XMLHttpRequest`, `sendBeacon` e `axios` fora dos arquivos declarados. As duas URLs assinadas (foto de perfil em `foto-do-agente.ts`, evidência em `transporte.ts`) estão declaradas com a razão.
  - 18 casos sintéticos, entre eles `POST /pacote.zip` contra o servidor montado, `GET` contra rota `POST`, chamada do campo e da fila offline sem rota, corpo com chave desconhecida, corpo sem chave obrigatória, consulta sem a obrigatória, `fetch` solto, URL assinada não declarada, comentário que cita a chamada, e o extrator que perde uma chamada.
  - O relatório das rotas sem cliente sai do teste (e é gravado em `RELATORIO_CONTRATO_CLIENTE_ROTA=<arquivo>`); não reprova.
- Roda no job `produto` do CI por `npm test` (o job roda a suíte completa, que inclui o workspace `@dc360/api`): sem passo novo, nenhum arquivo de workflow tocado.

**Números da medição** (`relatorio-de-rotas-sem-cliente.md`, `saidas/06`):

| | |
| --- | --- |
| Rotas `/v1` registradas (normalizadas, sem as `/x/`) | 96 |
| Chamadas distintas (método e caminho) do painel / do campo / do console | 75 / 21 / 15 |
| Chamadas lidas por arquivo | `http.ts` 71 (de 74 contadas, 3 de mecanismo); `api.ts` 13 (de 15); `historico-da-casa.ts` 2 (de 4); `mapa.ts` 1; `rota.ts` 1; `foto-do-agente.ts` 0 (1 URL assinada); `transporte.ts` 4 (de 9: 2 definições, 1 repetição, 1 envio, 1 URL assinada); console 15 (de 19) |
| Corpo conferido contra o esquema do registro (painel e campo, 96 chamadas) | 27 conferidos; 19 não lidos; 50 sem corpo |
| Consulta (painel e campo) | 3 conferidas; 9 não lidas (montadas em tempo de execução); 84 sem consulta |
| Esquema ilegível (união) / rota pendente / sem esquema | 0 / 0 / 0 |
| Rotas `/v1` sem cliente | 9 (versão mínima do aplicativo, `GET /auth/eu`, validação pública de documento, URL de evidência, `GET /saida-a-campo/minha`, revogação de aparelho, e as três escritas da saída a campo: declarar, prorrogar e retorno) |
| Rotas do console sem chamada no script | 1 (`GET /municipios/:id/serie`) |

**O que NÃO deu para ler estaticamente (declarado, não ignorado):** 19 corpos e 9 consultas, listados um a um no fim do relatório. São corpos que vêm de variável (`corpo: dados`, `corpo: t`, `corpo: d`...) ou de expressão (`ficha ? { renovacao, ficha } : { renovacao }`, `destinatario ? { destinatario } : {}`, `pedidoDeEvidenciaDaFoto(...)`), e consultas montadas em tempo de execução (`?${p.toString()}`, `partes.join("&")`). Para eles o teste confere caminho, método e o que o texto mostra da consulta (as chaves escritas), e mais nada. As chaves do corpo, nesses casos, são garantidas pelo tipo do parâmetro no `typecheck` do cliente, e não por este teste (limite 1 de `apps/api/PENDENCIAS.md`). O console não tem registro de contrato, então lá o corpo nunca é conferido.

**Achados nos clientes:** nenhum. Todas as 111 chamadas distintas lidas existem, com o método certo, e todo corpo ou consulta que o texto mostra casa com o esquema. Nada foi consertado em cliente. A varredura de `fetch` não achou nenhum fora da base ou das duas URLs assinadas declaradas.

**Prova de que o teste pega o defeito nos clientes REAIS** (`saidas/07-mutacoes-nos-clientes-reais.txt`, roteiro em `roteiro-das-mutacoes.sh`): nove mutações temporárias no código de produto (depois revertidas com `git checkout`, árvore limpa ao fim), cada uma reprovou exatamente um caso do teste e o resto seguiu verde (81 de 82):

1. painel: `/saida/pacote.zip` vira `/pacote.zip` (o defeito da E11): reprova "o caminho existe";
2. campo `api.ts`: `/aparelhos` vira `/aparelho`: reprova "o caminho existe";
3. fila offline: vistoria enviada com `GET`: reprova "o método bate";
4. `mapa.ts`: `/configuracao` vira `/configuracoes`;
5. `rota.ts`: `/rota` vira `/rota/calcular`;
6. console: `/operadores` vira `/operador`;
7. painel: o corpo de `/auth/entrar` ganha a chave `lembrar`: reprova "o corpo casa com o esquema";
8. campo: `/auth/renovar` manda `renovar` em vez de `renovacao`: reprova a mesma verificação (chave desconhecida e obrigatória faltando);
9. campo: um `fetch` solto em `token.ts`: reprova a varredura.

## Justificativa

- **Perfil por arquivo em vez de um extrator único:** os clientes chamam de quatro formas (`chamar(caminho, { metodo, corpo })`, `chamar(caminho, corpo, metodo = "POST")` na fila offline, `pedir(caminho, token)` só de leitura, `fetch(\`${base}/rota\`, { method })`), e o console fala com o próprio servidor. Um extrator que adivinhasse a forma erraria calado; o perfil diz o que cada arquivo faz, e o que não casa com o perfil vira `naoLidas` e reprova.
- **Comentário removido antes de ler:** o contador antigo filtrava "linhas que começam com asterisco". Há comentários de bloco em `transporte.ts` e `api.ts` sem asterisco que citam `chamar(`; o extrator os leria como chamada. `semComentarios` troca por espaços e preserva o número da linha.
- **A varredura de `fetch` olha todos os arquivos, não só os declarados:** é a regra da etapa ("todo `fetch` de cliente passa por `chamar` ou pela base"). Se só os arquivos conhecidos fossem lidos, o `fetch` solto mora justamente no arquivo que ninguém declarou. O arquivo `.tsx` é varrido por linha (sem tirar comentários), porque em JSX o apóstrofo do texto (`d'água`) quebraria o leitor de literais; o custo é um possível falso positivo num comentário de bloco sem asterisco, que seria declarado em `REDE_FORA_DO_CONTRATO`, e nunca um falso negativo.
- **Console lido do texto de `servidor.ts`, não do servidor montado:** montar o console (`construirConsole`) exige o banco do console, a semente do dono e os dublês de migração que moram no `vitest.config.ts` do console, que não existem no da API. A leitura reprova se o número de `rotas.<verbo>` do arquivo não bater com o de rotas lidas: a primeira versão deste teste leu 9 rotas de 16 porque as rotas com genérico de tipos (`rotas.post<{ Params: { id: string } }>(`) escapavam de uma expressão regular simples, e foi a própria contagem que apontou o erro.
- **`/x` e `/x/` são a mesma rota:** o registro fundiu as duas formas na E04 (correção 1). Sem a normalização o relatório listava 24 rotas sem cliente, 15 delas só a variante com barra.
- **Divergência de forma não é "aprovado por falta de dado":** corpo ilegível, esquema que não é objeto simples e rota pendente têm situação própria no relatório (`nao-lido`, `esquema-ilegivel`, `sem-entrada`), contadas e listadas. Nenhuma passa como `conferido`.
- **Falha de ambiente Windows:** só as aceitas pelo briefing (abaixo). Nenhum arquivo desses foi tocado.

## Limites declarados (leia antes de dar PASS)

- O corpo e a consulta só são conferidos quando o texto os mostra (19 corpos e 9 consultas não lidos, no relatório). Fechar de verdade é o pacote `cliente-api` da V2-F08-E04.
- O console é lido de dois textos (script e `servidor.ts`), sem registro de contrato: lá só se confere caminho e método.
- A resposta da API não é conferida aqui (é dos `contrato-*-respostas.test.ts`).
- `test:e2e:api` NÃO foi rodado (instrução do lote; o CI cobre).
- O `baseline.mjs`, o README e o `COLOCAR-DE-PE.md` valem para a MINHA árvore (API 2235, `npm test` 4600, com o aplicativo 6618); o integrador recalcula na junção.
- O item 3 da seção "O espelho legado sem prefixo (V2-F02-E01)" de `apps/api/PENDENCIAS.md` ("o painel, o campo e o console ainda falam o caminho sem prefixo") ficou desatualizado desde a V2-F02-E02, e este teste agora o prova ao contrário (todas as chamadas dos três clientes casam com `/v1`). Não o reescrevi por estar fora do meu escopo.

## Portões (números; saídas em `saidas/`)

- `typecheck` 0 erros (`01`); `lint` OK, monorepo e campo (`02`); `lint:teto` 431, não sobe (`03`); `formato:conferir` OK, 852 arquivos (`04`, depois de `--formatar` em 2 arquivos novos).
- Os testes novos não são tipados pelo `tsc` do projeto (o `tsconfig` da API inclui só `src`); rodei `tsc` com um `tsconfig` temporário que inclui o teste novo, o apoio, o painel, a superfície e `pagina.ts` do console: 0 erros (temporário apagado).
- `npm test` (`05`; a API foi rodada de novo na árvore final em `05b`, mesmo resultado): campo 280 passam; shared 433 passam e 1 falha (EPERM em symlink, `regras-de-conteudo`, aceita); API 2233 passam, 2 falham (`semear-homologacao`, aceitas), 34 pulados (2269); console 379 passam; web 824 passam; db 440 passam, 8 falham (`desfazer-migracao` 5 e `guarda-da-semente` 3, aceitas), 6 pulados.
- `contrato-cliente-rota` + `contrato-do-painel` + `superficie`: 103 de 103 (`06`; 82 + 12 + 9).
- `conferir:numeros` OK (`08`); `baseline.test.mjs` 29 de 29 (`09`); `auditar` código 0 (`10`); `test:isolamento` (CA-06): só as 8 falhas de ambiente do `db` (`11`); `test:scripts` 831 casos: 808 passam, 0 falham, 23 pulados, com o `INDEX.md` desta pasta no lugar (`12`; a rodada feita antes de existir o índice tinha 1 falha, o próprio `INDEX.md` ausente); `regras-de-conteudo` 9 de 10, a falha é o EPERM aceito (`13`).

## Para o orquestrador

- **Linha do STATUS sugerida:** `V2-F02-E05 | IMPLEMENTADA (parte 4A) | contrato cliente x rota: painel, campo (com a fila offline) e console lidos como texto e confrontados com as 96 rotas /v1 do servidor montado (caminho, método, corpo e consulta contra o registro, token, âncora por arquivo) e varredura que reprova fetch solto; 82 casos novos; 9 mutações reais nos clientes reprovadas; 0 achados em cliente; 9 rotas /v1 sem cliente no relatório para o Rafael`.
- **Dívidas pagas:** nenhuma.
- **Pendências humanas:** (1) o Rafael revê `relatorio-de-rotas-sem-cliente.md` e marca as 9 rotas que deveriam ter cliente (a etapa pede essa validação humana; não bloqueia nada). Duas merecem atenção: as três escritas da saída a campo (`POST /saida-a-campo`, `prorrogar`, `retorno`) e `POST /aparelhos/revogar`, que o aplicativo de campo não chama.
- **Para quem integra:** (1) `baseline.mjs` ganhou só `"V2-F02-E05": 82` em `MUDANCAS_DO_TESTE_API_POR_ETAPA`; os totais de README (linhas 14, 1839, 1841) e `COLOCAR-DE-PE.md` (linhas 41 e 365) são da minha árvore e precisam ser recalculados na junção. (2) `superficie-registrada.ts` reexporta `rotasRegistradas` e `Rota` do novo `apoio/rotas.ts`; a 4B não mexe nesses arquivos. (3) O teste importa `JS_DO_CONSOLE` de `apps/console/src/pagina.ts` e lê `apps/console/src/servidor.ts` como texto: uma refatoração que mude o nome dessa constante, ou que registre rota do console por outro meio que `rotas.<verbo>(`, derruba o teste de propósito. (4) App novo (portal na F11, cidadão na F17) entra no teste acrescentando um `Cliente` à lista `CLIENTES` com o perfil das funções dele; a varredura reprova o cliente que usar rede sem isso. (5) Seguimento sugerido, não feito: uma correção do item 3 desatualizado de `PENDENCIAS.md`.
