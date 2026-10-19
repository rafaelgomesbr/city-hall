# V2-F00-E05, correção 3: a varredura reprova as quatro formas do red-team e a família delas

Base: `ca5a38f`, ramo `trab/correcao-5` (correção 4 da E09 sobre `4ce0433`). Motivo: red-team da rodada 5 (SHA `4ce0433`), achado 1, bloqueante: quatro formas de responder 403 com código fora do catálogo passavam caladas pela varredura `apps/api/test/varredura-de-erros.ts` e pela prova dinâmica (que para na validação do corpo), desmentindo o cabeçalho de `packages/shared/src/codigos-de-erro.ts` e o README.

## Fatos

**O defeito, reproduzido antes do conserto.** O script do red-team (`scripts/mutar-e05.mjs`, cópia sem alteração; `scripts/mutar-e05-com-mensagens.mjs` é a mesma coisa com o filtro da saída incluindo as linhas `orgaos.ts:`) planta cada forma em `POST /orgaos`, depois de `orgaoSchema.parse(req.body)`, roda `tsc`, a varredura e, opcionalmente, a prova dinâmica, e restaura o arquivo. Em `ca5a38f`, as quatro passam: `tsc` 0 e `codigos-de-erro.test.ts` 116 de 116 (`saidas/01` a `04`).

| Forma | O que é | Por que passava |
| --- | --- | --- |
| A_ponto | `const recusaA = { erro: "sem_permissao" }; recusaA.erro = "vazou"; send(recusaA)` | a constante era lida pelo inicializador, e a escrita depois não era vista |
| B_reatribuicao | `let recusaB = {...}; recusaB = { erro: "vazou" }; send(recusaB)` | o mapa de constantes aceitava `let` e lia o primeiro objeto |
| C_colchete | `resposta["code"](403)["send"]({ erro: "vazou" })` | só a forma com ponto era lida; o `code` por colchete escapava da regra do `.code` órfão |
| N_statusCode_abreviado | `throw Object.freeze({ code: "FST_ERR_CTP_MUTACAO", statusCode })` | só `statusCode: n` por extenso era lido; o tratador global repassa o status de `FST_ERR_CTP_*` |

Achado no caminho: a forma D (parâmetro homônimo de uma constante do módulo) só era pega por acaso, porque a mutação do red-team também passava por uma variável intermediária; o mapa de constantes era do arquivo inteiro e por nome, então `(corpo) => resposta.code(403).send(corpo)` lia a constante `corpo` do módulo.

**O que mudou** (`diff-da-correcao.patch`).

- `apps/api/test/varredura-de-erros.ts`:
  - Corpo por nome (A, B, D): o mapa de constantes por nome saiu. `send(X)` só é lido quando `X` resolve, PELO ESCOPO, a um `const` não exportado com objeto literal, e todo outro uso de `X` no arquivo é leitura (`X.campo` ou `X["campo"]` sem escrita, `...X`, outro `send(X)`, `typeof X`, posição de tipo). `let`, `var`, parâmetro, exportação, escrita em campo, passar a uma função, apelidar ou converter com `as` deixam o corpo sem leitura, e corpo sem leitura em resposta 401, 403 ou de status calculado reprova (a mensagem diz o motivo e a linha).
  - Escrita (família A): escrever em `erro` ou `corpo` de qualquer objeto reprova, por ponto, colchete literal, operador composto, `delete`, `++`/`--`, desestruturação ou `for...of`; para `status`, `statusCode` e `codigo`, a escrita que não é o `=` simples (que as regras antigas já liam) também reprova.
  - Colchete e método tirado (família C): colchete com chave literal nos nomes que a varredura lê com ponto (`send`, `code`, `status`, `statusCode`, `erro`, `codigo`, `corpo`, `raw`, `hijack`, `writeHead`, `addHook`, `setErrorHandler`, `httpErrors`, `assign`, `defineProperty(ies)`, `setPrototypeOf`, `create`, `call`, `apply`, `bind`, `__proto__`, `prototype`, `constructor`, `serializer`), ou com o nome de classe de erro rastreada, ou `Reflect`, reprova; chamada por chave calculada (`resposta[m](403)`) reprova; `.send` usado sem ser chamado reprova; qualquer `.call`, `.apply` e `.bind` reprova, salvo `Object.prototype.hasOwnProperty.call`.
  - Status e classe que o texto não mostra (família N): `statusCode` em objeto por abreviação, método ou acessor reprova; chave calculada que não resolve a um `const` de texto, em objeto ou classe, reprova; texto com `FST_` reprova; `Object.setPrototypeOf`, `Object.create`, `__proto__` e `extends` de expressão que não é nome (forjam a classe que o tratador reconhece por `instanceof`) reprovam.
  - Corpo trocado depois do `send`, sem gancho: `toJSON`, `setReplySerializer`, `setSerializerCompiler`, `.serializer(...)`, `eval`, `Function` e `.redirect(url, status)` fora de 3xx reprovam. Corpo de `send` com `erro` por getter, setter ou método, ou com chave calculada, reprova em resposta de acesso; vale a ÚLTIMA ocorrência de `erro` no literal, como no JavaScript.
- `apps/api/test/codigos-de-erro.test.ts`: 116 para 169 casos (+53). Seis mutações do red-team aplicadas ao texto REAL de `rotas/orgaos.ts`, em memória, cada uma exigindo o motivo certo na mensagem (A, B, C, N, N2, D); 46 formas da família em fonte de exemplo (A1 a A14, B1 a B4, C1 a C10, N1 a N12, S1 a S6); 1 controle (constante só lida, chave por `const` de texto, `hasOwnProperty.call`, `extends` de nome, 503 por constante, 200 com parâmetro: nada reprova). Seis repasses novos, cada um com o porquê e preso a arquivo, expressão e, onde cabe, origem: o tratador global LENDO o prefixo `FST_ERR_CTP_` (`chamada:startsWith`), a chave calculada do serializador de log (`funcao:manter`, `servidor.ts`), os dois cabeçalhos HTTP/2 do pedido ao APNs (`push/apns.ts`), `app.log[nivel]` (`index.ts`) e `GERADOR[documento]` (`rotas/documentos.ts`). Fora desses seis, as regras novas não acham nada no fonte real.
- Cabeçalho de `packages/shared/src/codigos-de-erro.ts`, cabeçalho de `codigos-de-erro.test.ts` e README (seção "Códigos de erro de acesso"): a lista do que a varredura lê e reprova passa a incluir as regras acima, o "lê TODAS as formas" do teste saiu, e o parágrafo do que NENHUM teste prende passou a nomear exatamente o que sobra (abaixo).
- Números: `scripts/baseline.mjs` ganha `"V2-F00-E05-correcao-3": { total: 53, falhas: 0, puladas: 0 }` na API; README (1464 para 1517 testes da API, 3172 para 3225 em seis pacotes) e `docs/COLOCAR-DE-PE.md` (5104 para 5157) pedidos por `conferir:numeros`.

**O teste morde.**

- Depois do conserto, o script do red-team, sem alteração, contra este worktree: as nove mutações dele reprovam (`saidas/30` a `38`: A, B, C, N, N2, D, as duas da rodada 4 e o controle). `tsc` continua 0 em todas, ou seja, são código TypeScript válido. As saídas `40` a `43` (A, B, C, N, com as mensagens e com a prova dinâmica) mostram o motivo de cada reprovação e que a prova dinâmica continua verde (1 de 1) sob as quatro, como o red-team mediu: quem fecha estas formas é a varredura.
  - A: "escrita em `erro` de um objeto (`recusaA.erro`)" e "corpo que a varredura não resolve (`recusaA`): a constante é usada na linha 117 de um jeito que não é só leitura".
  - B: "corpo que a varredura não resolve (`recusaB`): o nome é `let` ou `var` e pode ser reatribuído".
  - C: "acesso por colchete a `code`" e "acesso por colchete a `send`".
  - N: "`statusCode` abreviado, por método ou por acessor" e "texto com `FST_` (`"FST_ERR_CTP_MUTACAO"`)".
- Cada saída `30` a `43` conta "7 failed | 162 passed (169)": a varredura da API inteira (o caso que importa) e os seis casos novos que mutam `rotas/orgaos.ts` em memória, cuja pré-condição ("o original passa", com a âncora do red-team) deixa de valer quando o arquivo em disco já está mutado. Em disco limpo os 169 passam.
- O teste novo contra a varredura de `ca5a38f` (`saidas/05`): 46 falham e 123 passam. Falham as 6 mutações reais e 40 das 46 formas da família, isto é, a varredura antiga era cega a elas. As 6 formas que ela já pegava (A2 colchete `["erro"] =`, B4 constante que não é objeto, C1, C2, C6 e N10) ficaram como cobertura. O controle passa nas duas versões.

**A prova dinâmica (segunda opção do pedido), avaliada e não alterada.** Gerar corpo válido a partir do esquema Zod de cada rota levaria parte das 66 rotas além da validação, mas não fecharia a classe por execução: as quatro mutações do red-team só respondem 403 quando o corpo traz um valor exato (`dados.nome === "Mutacao A"`), e nenhum gerador acerta um `if` sobre o dado; além disso, depois do corpo válido a maioria dessas rotas para em 404 ou 409 por estado (ids e situações que o corpo não cria). Fica como está, declarada como segunda linha com o alcance medido na correção 2.

**O que NENHUM dos dois prende, depois desta correção** (escrito igual no cabeçalho do catálogo e no README):

1. código ou `statusCode` que vêm de DADO em tempo de execução (objeto do banco, da rede ou de `JSON.parse` lançado ou espalhado num erro);
2. classe de erro ou resposta definida FORA das pastas varridas (dependência, plugin de terceiros, inclusive método que ele acrescente à resposta: a varredura reconhece a resposta pelo nome dos métodos do Fastify, `code`, `status`, `send`, `redirect`, `statusCode`, `raw`, `hijack`, `writeHead`);
3. na prova dinâmica, ramo que dependa de um valor que o corpo mínimo dela não manda (o handler das 66 rotas que nunca recebem 2xx e qualquer `if` sobre o dado pedido): ali a garantia é só a varredura.

**Regressão** (neste worktree, com a máquina sob carga de outra sessão).

- `npm run test:api`: 105 arquivos, 1517 passados e 34 pulados, 0 falhas, código 0 (`saidas/50`).
- `npm run test --workspace @dc360/shared`: 185 de 185 (`saidas/51`). Só um comentário mudou no pacote.
- `npm run typecheck`: código 0 (`saidas/52`). Os arquivos de teste alterados não entram no `tsconfig` da API; foram conferidos à parte com um `tsconfig` temporário que os inclui (código 0, sem saída; o arquivo temporário foi apagado).
- `npm run conferir:numeros`: código 0, "Todos os números da documentação batem" (`saidas/53`).
- Portão de conteúdo (`packages/shared/test/regras-de-conteudo.test.ts`): 10 de 10 (`saidas/54`).
- `node scripts/conferir-indices-de-evidencia.mjs` (a partir de `dc360/`): "RESULTADO: OK", 70 índices, código 0 (`saidas/55`). Essa saída foi tirada antes de ela mesma entrar no índice (um arquivo não consegue conter a conferência do índice que o lista); depois de arquivá-la e refazer os dois índices, a conferência foi repetida e deu OK de novo.

**Limitações.**

- As regras novas falham para o lado seguro: o preço é reprovar construções legítimas (passar um corpo constante a uma função, `.call`/`.apply`/`.bind`, chave calculada em qualquer objeto). No fonte real isso deu seis pontos, todos conferidos e listados como repasse. Código novo que use essas construções vai precisar de repasse com o porquê, ou de ser escrito na forma que a varredura lê.
- `test:isolamento`, painel e campo não foram rodados: esta correção não toca banco, autorização, API nem cliente (só o teste da varredura, comentário do pacote compartilhado e documentação).
- Nenhuma tela mudou; não há captura de tela.

## Justificativa

O critério negativo da etapa é "código fora do catálogo reprova o teste de catálogo", e o cabeçalho prometia que o que a varredura não lê ela reprova. As quatro formas do red-team mostraram que a promessa valia para as formas que alguém tinha pensado, não para a classe. O conserto troca a pergunta: em vez de "esta construção emite um código novo?", a varredura pergunta "eu sei ler isto?", e o que não sabe ler reprova. Por isso o corpo por constante deixou de ser lido pelo nome e passou a exigir uma constante que provadamente não muda (`const`, não exportada, só lida no arquivo), em vez de tentar seguir cada escrita possível; e o colchete, o método tirado do objeto, a chave calculada e a classe forjada reprovam como forma, não como valor.

A prova dinâmica foi avaliada e não resolve o mesmo problema: um 403 escondido atrás de um `if` sobre o dado só aparece por execução se o teste mandar aquele dado, e nenhum gerador a partir do esquema faz isso. Ela continua útil para o que o texto esconde onde ela chega, e o README diz isso.

O que sobra foi escrito com nome no cabeçalho e no README, para que o texto não prometa mais do que o teste prende, que foi exatamente o que reprovou as rodadas 4 e 5.
