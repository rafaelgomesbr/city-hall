# V2-F00-E05, correção 2: o teste de catálogo varre toda resposta de erro de acesso do servidor

Base: `cd38410`, ramo `v2/f00`. Motivo: rodada 4 reprovada (SHA `bb0f654`), QA FAIL arbitrado FAIL em `validacao/bb0f654/arbitragem.md`. Sem commit (o orquestrador commita).

Este RESUMO foi atualizado depois de uma revisão independente (Opus) que BLOQUEOU a primeira versão: a prova dinâmica dela foi limpa (95 rotas, 1716 requisições, nenhum `erro` fora do catálogo), mas 11 formas reais de emitir erro, plantadas uma a uma, ficavam verdes (39 de 39) na varredura estática, enquanto o README, o cabeçalho e este texto prometiam "todas as formas". A seção "Segunda rodada (revisão independente)" abaixo diz o que mudou; o resto vale como estava, com os números atualizados.

## Fatos

**O defeito provado (antes).** O servidor respondia 403 com quatro códigos fora do catálogo: `posto_insuficiente` (`servidor.ts`, tratador global), `posto_insuficiente_para_dado_pessoal` (`rotas/prestacao-de-contas.ts`, `RegraDeNegocio`), `email_so_por_administrador` (`rotas/administracao.ts`, `RegraDeNegocio`) e `assinatura` (`rotas/armazenamento-local.ts`, dois `send`). O leitor de fonte do teste antigo era por expressão regular e só via `new FalhaAutenticacao("x")` e `readonly codigo = "x" as const`. Com o fonte mutado, o teste antigo ficou verde nas três formas que a arbitragem apontou (`saidas/02`, `03`, `04`: os três casos de emissão passam; a única falha dessas saídas é o caso "tem os seis códigos", que reprova porque o catálogo agora tem dez, e não tem relação com a mutação). A nova varredura, rodada contra o catálogo antigo de seis códigos, reprova exatamente os quatro códigos (`saidas/01`).

**O que mudou.**

- `packages/shared/src/codigos-de-erro.ts`: o catálogo passa de seis para dez códigos. Entram `posto_insuficiente`, `posto_insuficiente_para_dado_pessoal`, `email_so_por_administrador` e `assinatura`, todos 403 e `acao: "nenhuma"` (erro comum para os clientes), com a mensagem em português no estilo do catálogo (as duas das `RegraDeNegocio` são idênticas às que a rota já devolve). Nova lista `CODIGOS_DA_ENTRADA` (`credenciais` 401, `senha_provisoria_vencida` 401, `bloqueado` 429) e `ehCodigoDaEntrada`: fica FORA do catálogo de acesso (`ehCodigoDeErroDeAcesso("credenciais")` continua `false`, o que impede senha errada na troca de senha de derrubar a tela). O cabeçalho passou a dizer exatamente o que o teste prende e o que não prende.
- `apps/api/test/varredura-de-erros.ts` (novo, apoio de teste): varredura do fonte pela árvore sintática do TypeScript, cobrindo as formas da lista da segunda rodada (abaixo). O que ela não consegue ler, ela reprova.
- `apps/api/test/codigos-de-erro.test.ts`: o bloco "Nada sai fora do catálogo" (4 casos, leitura por texto) foi substituído por 94 casos da varredura; mais 4 casos de execução para os quatro códigos novos. 22 para 116 casos. Arquivo novo `prova-dinamica-dos-codigos-de-erro.test.ts`, 1 caso.
- Escopo do portão, dito sem folga: toda resposta com status 401, 403 ou que o texto não resolve, na API inteira e no console do fornecedor (este contra a lista de contrato própria dele, porque é outro processo, com sessão e erros próprios, e não fala com o painel nem com o aplicativo). Outros status (404, 409, 422, 429, 5xx) e os códigos de regra de negócio são da V2-F02-E03. O portão também reprova código do catálogo emitido com status diferente do escrito e código do catálogo que nenhum ponto emite.
- Repasses conferidos à mão (lista fechada no teste, cada um com o porquê): `erro.codigo` e `suspenso.codigo` no tratador global (repassam o `codigo` das classes, que a varredura lê nos literais), e o status do `corpo_invalido` (400, 413 ou 415 do Fastify, nunca de acesso). No console, `recusa.corpo`.
- Clientes: o painel (`apps/web/src/dados/http.ts`) e o transporte do aplicativo (`packages/campo/src/transporte.ts`) leem a ação do catálogo; as quatro entradas novas têm ação `nenhuma`, então caem onde já caíam (erro comum, recusa permanente). Nenhum código de cliente mudou. Provado por teste: painel, 4 casos (403 de cada código novo não renova, não repete, não derruba a sessão); pacote do campo, 4 linhas na matriz de classificação (recusa permanente com o código, nas quatro rotas da fila).
- Documentação: `README.md` (parágrafo e tabela dos códigos de erro de acesso, com o que o teste prende e o que não prende, mais os números), `apps/campo/LEIA-ME.md` e `docs/COLOCAR-DE-PE.md` (só números, pedidos por `conferir:numeros`), `scripts/baseline.mjs` (entrada `V2-F00-E05-correcao-2` em API, shared, web e pacote do campo).

## Segunda rodada (revisão independente): o que a primeira varredura deixava passar

Formas plantadas pelo revisor, cada uma verde (39 de 39) na primeira versão, e o que a varredura passou a fazer. Todas reprovam agora (`saidas/30-REVISAO-*`, mutação em disco, fonte restaurado com cópia de segurança; os mesmos casos existem no teste, em memória):

| Forma plantada | Como a varredura reprova |
| --- | --- |
| M1b `class X extends RegraDeNegocio` com `super("x", .., 403)` | `rastrearClasses` acha as subclasses (ponto fixo, na pasta inteira e em qualquer profundidade) e o `super(...)` vira emissão da família |
| M3 `import { RegraDeNegocio as R }` e `new R(..)` | importações e reexportações com `as` entram no mesmo mapa de nomes rastreados |
| M6 `import * as S` e `new S.RegraDeNegocio(..)` | o nome da classe é lido pelo último segmento do acesso |
| M2c, M2d classe com `this.codigo = ..` no construtor (literal e calculado), enviada pelo tratador como `erro.codigo` | toda classe com `codigo` vira emissão: literal é conferido contra o catálogo, calculado precisa de repasse próprio |
| M7 getter `get codigo()` | idem, pelos `return` do getter |
| M8 `constructor(readonly codigo = "x")` | idem, pela propriedade de parâmetro |
| M4 `resposta.raw.writeHead(403)` e `raw.end` | `.raw`, `.hijack()` e `.writeHead()` reprovam sempre |
| M11 `resposta.code(CONST_403); return { erro }` | `.code()`/`.status()` fora de uma cadeia com `send` reprova com argumento calculado ou literal 401 e 403 |
| M9 console `{ status: 403, corpo: variavel }` | todo par `status` + `corpo` precisa de corpo literal com `erro` |
| M9b console `{ status: calculado, corpo: { erro } }` | status calculado vira "não resolvido" e exige catálogo |

Também novo: uso do nome de uma classe de erro de negócio fora de `new`, `extends`, `instanceof`, importação e tipo (`const R = RegraDeNegocio`, `Reflect.construct`) reprova; `statusCode` calculado, `httpErrors` e `createError` reprovam; a permissão `erro.codigo` do tratador global deixou de valer "para qualquer classe": só vale porque toda classe com `codigo` é varrida, e as duas bases têm repasse próprio (`RegraDeNegocio.codigo`, `FalhaAutenticacao.codigo`); o pacote compartilhado (`packages/shared/src`) entrou na varredura. Descoberta no caminho: `this.status = status` nos construtores de erro era falso positivo e passou a valer só quando o literal é 401 ou 403.

**Prova dinâmica no `test:api`** (`prova-dinamica-dos-codigos-de-erro.test.ts`, versão da sonda do revisor): sobe o servidor, lê as rotas que ele registrou, dispara todas com 12 perfis (a leitura das rotas estava errada nesta versão e foi corrigida na terceira rodada, abaixo) e estados negativos e exige que todo 401 e todo 403 tenha `erro` no catálogo ou na entrada. Verde, e morde: `saidas/30-REVISAO-D1-prova-dinamica-sob-mutacao.txt (primeira versão da prova)` (com `send({ erro: "sem_" + "perm" })` no tratador, um código que só a execução mostra, o teste reprova com a rota e o perfil).

Onde a forma NÃO pode ser coberta de verdade, o README e o cabeçalho do catálogo dizem exatamente: classe definida fora das pastas varridas, `Object.assign` num erro, código montado por dado externo e resposta de plugin de terceiros só são alcançados pela prova dinâmica, e só se os perfis dela criarem o estado.

## Terceira rodada (segunda passada da revisão independente)

**Bloqueio: a prova dinâmica não alcançava metade das rotas.** Ela lia o `printRoutes` aproveitando só as linhas que começam com `/` e tomava o segmento de cada linha pelo caminho inteiro: 58 dos 114 pares método + caminho reais nunca eram pedidos (todo `/ocorrencias/:id/*`, `/orgaos`, `/oficios`...) e 39 endereços pedidos não existiam (`POST /triagem`). Um 403 com código novo numa rota aninhada (`/avisos/m-teste`) deixava a prova verde (`P-M0-controle-aninhada`, antes VERDE, agora reprova). Conserto: a prova usa `rotasRegistradas` de `superficie-registrada.ts`, a leitura que `superficie.test.ts` e o contrato do painel já usam e que concatena a árvore; preenche os parâmetros (`:id` de usuário e de ocorrência, `:chave`, `:token`); exige que o número de pares pedidos seja o de pares registrados, com uma segunda contagem independente da árvore (cada `(GET, POST)` menos HEAD e OPTIONS) e mais de 100 pares; exige que nenhum pedido receba o 404 do roteador ("Rota não encontrada."); coloca por último as rotas que encerram sessão ou mudam a conta de quem está na prova; e confere o PAR código + status (código do catálogo só com o status do catálogo; `acesso_suspenso` também 503).

**Formas que ficavam verdes na varredura, e o que ela passou a fazer** (todas reprovam, `saidas/40-passada2-RESULTADOS-MUTACOES.txt` e `saidas/41-passada2/`):

| Forma | Como a varredura reprova |
| --- | --- |
| N02, N03, N14, N20 `statusCode` por chave computada, colchete ou `Object.defineProperty` | chave computada de texto é lida como nome; atribuição por colchete de `status`/`statusCode`/`codigo`/`erro` reprova; `Object.defineProperty`, `Object.defineProperties` e `Object.assign` reprovam sempre (N17 junto) |
| N06 auxiliar com `code(s)` calculado e corpo em texto | corpo em texto com status calculado ou 401/403 reprova |
| N10 `{ erro: "x", ...extra }` | spread DEPOIS de `erro` reprova, salvo objeto literal sem `erro` (ou condicional de dois assim), que é o que o tratador global usa para `campos` |
| N12 gancho `onSend` que reescreve o corpo | `onSend`/`preSerialization` com 3 parâmetros, e qualquer gancho que chame `send`/`code`/`status` ou lance erro de negócio, reprovam |
| N15 `new RegraDeNegocio(...ARGS)` | argumento espalhado em construção de erro reprova |
| N16 subclasse com `override readonly status = 403` | `status`/`statusCode` declarado em subclasse de erro de negócio (qualquer valor) ou com literal 401/403 em qualquer classe reprova |
| N13 console `{ status: 403, corpo }` abreviado | o abreviado de `corpo` ou `status` é lido; corpo que não resolve reprova |
| N18 `corpo_invalido` com qualquer status; N19 `erro.codigo` sombreado | cada repasse agora tem ORIGEM: `erro.codigo` só vale se `erro` for o primeiro parâmetro do `setErrorHandler` (e não um homônimo declarado dentro), `suspenso.codigo` só se vier de `new AcessoSuspenso`, e o status do `corpo_invalido` só se vier de `doLeitorDeCorpo.statusCode` |

Descoberta no caminho: `push/apns.ts` tem um objeto `{ status, corpo }` que é o resultado da chamada do servidor ao provedor de notificação, não resposta do servidor; entrou como repasse conferido (`par:corpo`, só nesse arquivo).

**Resultado das 37 mutações da passada 2**, plantadas em disco uma a uma, com a varredura E a prova dinâmica rodadas por mutação e o fonte restaurado com conferência de SHA-256 (`saidas/40-passada2-RESULTADOS-MUTACOES.txt`, e uma saída de varredura e uma de prova dinâmica por mutação em `saidas/41-passada2/`): a VARREDURA reprova as 37. A PROVA DINÂMICA reprova 25; as 12 que ela deixa verdes são as que só existem como classe ou ramo do tratador que nenhum pedido negativo dispara (M1b, M2c, M2d, M7, M8, N01, N05, N18, N19) ou como recusa montada no console (M9, M9b, N13), e é por isso que a varredura é a primeira linha e a prova dinâmica a segunda.

**Onde a forma NÃO é coberta de verdade** (dito no README e no cabeçalho do catálogo): recusa que só sai com um corpo ou estado que os perfis da prova não criam E que o texto esconde (código montado por dado externo, classe fora das pastas varridas, plugin de terceiros); resposta que o Fastify gera sozinho (`corpo_invalido`, 429, 404 do roteador) fora dos status 401 e 403; e a confiança no Fastify para o status do `corpo_invalido`.

## Quarta rodada (terceira passada da revisão independente)

**Bloqueio: o limitador por endereço escondia o handler de 55 rotas.** O limitador (300 por minuto) devolve 429 antes do handler para os perfis sem token válido, e a prova ignorava o 429 e passava calada: 316 pedidos nunca chegavam ao handler, e um 401 com código novo só para quem vem sem token em `/orgaos/:id/reativacao` (rota pedida tarde) deixava a prova verde (B1, B2). Conserto: cada `inject` leva um `remoteAddress` distinto, o limitador continua ligado para o resto da suíte, e o teste EXIGE zero 429. Medido nesta rodada: 114 pares, 2064 pedidos, 0 limitados.

**A prova mede e declara o que exercita** (`saidas/43-alcance-da-prova-dinamica-por-rota-e-perfil.json` traz a matriz de status por rota e por perfil; o teste grava essa matriz com `SAIDA_ALCANCE=<arquivo>` e reprova se a cobertura cair abaixo dos pisos declarados nele):

- 112 dos 114 pares chegam ao handler com algum perfil (status que não é 401, 403 nem 429);
- 48 recebem 2xx de algum perfil; 66 NUNCA recebem 2xx de perfil nenhum (só 422, 404, 409 ou 503 além das recusas de acesso), ou seja, a prova exercita a autorização deles só até a validação do corpo;
- 2 (`PUT` e `GET /armazenamento/objeto`, autenticados pela assinatura da URL) só recebem 403 `assinatura`; a lista é declarada no teste e rota nova que ninguém leva além do 401 ou 403 reprova;
- por perfil, rotas no handler: sem token, token lixo, vencido e de outra assinatura 10 cada; coordenador 93; agente 62; operador 61; administrador 100; conta desativada 47; senha provisória 49; coordenador de outro município 96; município suspenso 54.

Por isso o README e o cabeçalho do catálogo deixaram de dizer "todas as rotas, com cada perfil": dizem que a prova dinâmica é a segunda linha, com esse alcance, e que a garantia vem primeiro da varredura do fonte.

**Varredura (formas que ficavam verdes):** S1 reatribuir o parâmetro do tratador global (`erro = ...`) reprova; S3 `(e as { codigo: string }).codigo = "x"` e qualquer atribuição ao `codigo` de um erro fora do construtor reconhecido reprovam; qualquer `Reflect` reprova (B1, `Reflect.set` do código; `Reflect.defineProperty`; `Reflect.construct`). Anotado e tratado: o repasse `par:corpo` de `push/apns.ts` aceitava qualquer `{ status, corpo }`; agora só vale como argumento de `resolver(...)` naquele arquivo, e o par abreviado em qualquer outro ponto (inclusive de `apns.ts`) reprova.

**Mutações das passadas 2 e 3**, plantadas em disco uma a uma (varredura E prova dinâmica rodadas em cada), fonte restaurado com conferência de SHA-256: as 37 da passada 2 (`saidas/40-passada2-RESULTADOS-MUTACOES.txt`, `saidas/41-passada2/`) reprovam todas na varredura; as 10 da passada 3 (`saidas/40-passada3-RESULTADOS-MUTACOES.txt`, `saidas/42-passada3/`, que incluem A1 a A5, B0, B1, B2, S1 e S3) reprovam todas na varredura e todas, menos S1, também na prova dinâmica (S1 só existe como ramo do tratador que nenhum pedido dispara, e a varredura o pega).

**Testes novos (números).** API `codigos-de-erro.test.ts` 22 para 116 e a prova dinâmica, 1 caso novo (+95); shared 170 para 175 (+5); painel 665 para 669 (+4); pacote do campo 223 para 231 (+8, são 4 linhas de matriz com 2 casos cada).

**Mordem (vermelho antes, verde depois).** Fonte real mutado em disco e restaurado (cópia de segurança, nada gravado em `administracao.ts`, `servico.ts` nem na recuperação de senha):

| Mutação | Teste antigo | Teste novo |
| --- | --- | --- |
| M1: `send({ erro: "posto_insuficiente"` vira `"inativo"` (`servidor.ts`) | 3 casos de emissão verdes (`02`) | 6 reprovam (`05`) |
| M2: `RegraDeNegocio` 403 de `prestacao-de-contas.ts` vira o nome antigo `"sessao"` | 3 verdes (`03`) | 5 reprovam (`06`) |
| M4: `send({ erro: "assinatura"` vira `"url_vencida"` (`armazenamento-local.ts`) | 3 verdes (`04`) | 4 reprovam (`07`) |

As contagens desta tabela (`saidas/02` a `07`) são da primeira versão do teste novo; as saídas da segunda rodada, com a varredura ampliada, estão em `saidas/30-REVISAO-*`.

A mutação em `administracao.ts` (`email_so_por_administrador` vira `sessao`) não foi feita em disco por ser arquivo de outra correção; ela morde no teste novo por mutação do texto REAL em memória (caso "RegraDeNegocio com 403: `email_so_por_administrador` vira o nome antigo `sessao`"), assim como `FalhaAutenticacao` (`vigencia.ts`), a classe `AcessoSuspenso` (`suspensao.ts`) e o status do `sem_permissao` no tratador. O teste ainda tem as formas de emitir que reprovam, as que falham para o lado seguro, os controles negativos e o repasse, em fonte de exemplo.

**Regressão (final, depois da quarta rodada).** `npm run test:api` 102 arquivos, 1422 passados e 20 pulados, código 0. Ver `saidas/16` (`npm run test:api` completo), `saidas/10` (`codigos-de-erro.test.ts` e a prova dinâmica, 117 de 117), `saidas/11` (shared 175 de 175), `saidas/15` (`npm run typecheck`), `saidas/19` (`conferir:numeros`) e `saidas/20` (portão de conteúdo). `npm run test --workspace @dc360/web` 669 de 669, `npm run test:campo` 134 suítes e 1932 testes e `npm run test:isolamento` 345 aprovados e 3 pulados foram rodados na primeira versão (`saidas/12` a `14b`), e nenhum arquivo deles foi tocado depois. `saidas/17` e `18` são da primeira versão: uma rodada do `test:api` que reprovou 17 casos de 9 arquivos por tempo esgotado sob carga da máquina, e os 9 arquivos rodados à parte, 240 de 240.

**Limitações.**

- A varredura é estática: enxerga o que está escrito no fonte das três pastas lidas. O que ela não alcança (classe fora das pastas, `Object.assign` num erro, código vindo de dado externo, plugin de terceiros) só é pego pela prova dinâmica, que por sua vez só vê o que os 12 perfis dela provocam. Os repasses conferidos à mão são `erro.codigo` e `suspenso.codigo` no tratador global, `RegraDeNegocio.codigo` e `FalhaAutenticacao.codigo` (as duas bases) e o status do `corpo_invalido` (confiança no Fastify, `FST_ERR_CTP_*`, sem prova por execução).
- A mensagem que cada rota devolve só é presa (igual à do catálogo) nos dois casos de `RegraDeNegocio` que usam a frase padrão. `assinatura` e `posto_insuficiente` têm frase da rota (o motivo da assinatura; o perfil da conta).
- O console do fornecedor é varrido contra uma lista própria de 7 códigos, escrita no teste: cobre o que o código emite hoje e reprova código novo de 401 ou 403 nele, mas essa lista não é um contrato publicado em lugar nenhum.
- `GUIA-DO-COORDENADOR` (achado 2 da arbitragem: a frase de que trocar o papel encerra a sessão) NÃO foi tocado: fora da posse desta correção. Fica para quem tem o arquivo.
- Nenhuma tela mudou; não há captura de tela nesta correção.
- `scripts/baseline.mjs` e `docs/COLOCAR-DE-PE.md` têm hunks de outras correções em andamento (E15); o `diff-da-correcao.patch` não os inclui.

## Justificativa

O critério negativo da etapa é "código fora do catálogo reprova o teste de catálogo", e o README e o cabeçalho do catálogo prometiam isso para o servidor inteiro. A leitura por expressão regular era barata e furada: só via duas formas de emitir, e o resto passava com o teste verde. Trocar para a árvore sintática custa uma dependência que a API já tem (`typescript`, usada no typecheck) e pega o que a regex não pega, o código numa linha e o status em outra. O resto da decisão foi falhar para o lado seguro: o que a varredura não entende, ela reprova, e quem quiser liberar um ponto precisa escrever o motivo numa lista curta e visível.

Os quatro códigos que saíam fora entraram no catálogo, e não numa lista de exceção, porque são recusas de permissão e de assinatura, ou seja, erro de acesso pela definição que a própria etapa escreveu. Com `acao: "nenhuma"` o comportamento dos clientes não muda (erro comum, recusa permanente), o que as quatro linhas novas do painel e do aplicativo provam. Os códigos da entrada ficaram numa lista à parte, e não no catálogo, porque `ehCodigoDeErroDeAcesso("credenciais")` tem de continuar falso: senão a senha atual errada na troca de senha passaria a ler como sessão morta.

Escopo: só 401, 403 e status não resolvido, porque é o que o catálogo de acesso cobre. Alargar para todo código de regra de negócio (mais de cem pontos, 404 e 409 em sua maioria) seria escrever o catálogo da V2-F02-E03 por antecipação, sem decisão de produto sobre nomes. O README e o cabeçalho agora dizem exatamente isso, com a fronteira.

## Conferências finais

- Portão de conteúdo (`packages/shared/test/regras-de-conteudo.test.ts`): 10 de 10 (`saidas/20`).
- `node scripts/conferir-indices-de-evidencia.mjs` (`saidas/21`): os índices da E05 e de `correcao-2` batem byte a byte; as únicas falhas do comando são os dois índices da V2-F00-E03 (`INDEX.md` e `correcao-5/INDEX.md`), de outra correção em andamento na mesma árvore, fora da posse desta.
- `node scripts/roadmap/conferir-evidencia.mjs V2-F00-E05 --sha <sha>`: sem falha e sem aviso (`saidas/22`).
