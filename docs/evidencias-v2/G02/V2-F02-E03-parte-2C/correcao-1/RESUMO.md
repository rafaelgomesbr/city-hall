# V2-F02-E03, parte 2C, correção 1: conferência só em teste, varredura de send e Content-Disposition

Fecha três achados da revisão independente (Codex) da parte 2C. A evidência da parte 2C (pasta acima) fica como estava. Em cada achado o teste foi escrito primeiro, falhou, e só então veio o conserto.

## Fatos

1. **Conferência que lança só existe em teste** (`apps/api/src/servidor.ts`). A opção `conferirCatalogoDeErros: true` prevalecia sobre o ambiente: com `NODE_ENV=production` um `RegraDeNegocio` de código desconhecido virava 500 `{ statusCode, error, message }` com o código e o caminho `packages/shared/src/erros.ts`. Agora `lancarSeForaDoCatalogo = NODE_ENV === "test" && (opção ?? true)`: fora de teste a opção não tem efeito e a resposta sai normal (409 `{ erro, mensagem }`), sem caminho interno. Teste: servidor com `NODE_ENV=production` simulado e a opção ligada à força. ANTES: `saidas/20-item1-ANTES.txt` (`expected 500 to be 409`, com o caminho no corpo). DEPOIS: passa.
2. **Varredura de `.code(N).send(...)`** (`apps/api/test/varredura-de-envios.ts`, novo, e 9 casos novos em `catalogo-de-erros.test.ts`). Para todo envio com N a partir de 400 (ou N calculado): `erro` literal do catálogo, corpo objeto literal (ou `const` do arquivo) com `erro` e `mensagem`, nenhuma chave fora de `erro`, `mensagem`, `campos`, `requisicao`, `categoria`, e status literal (aceita `cond ? 200 : 201`). Cobre os três exemplos do revisor: `erro` por variável, `send("erro interno")` e `message` no lugar de `mensagem`. ANTES, o critério antigo (código literal emitido está no catálogo) não reprovava nenhum dos três, e a varredura de emissões nem enxergava o segundo; DEPOIS os três reprovam: `saidas/23-item2-ANTES-e-DEPOIS.txt`. A árvore real passa com 7 exceções nomeadas, cada uma com o porquê no teste e sem linha morta: a página HTML do link do ofício (410 e 404), cinco formas do tratador central (`erro.codigo`, `suspenso.codigo`, `status:erro.status`, `status:suspenso.status`, `status:status`: códigos já tipados e conferidos pelo tratador em teste) e a sonda de prontidão 503 (`corpo:banco,status`, contrato da sonda do Fly).
3. **`Content-Disposition` sobrevivia à troca do corpo.** `CABECALHOS_DO_CORPO` (guardas da API e do console) ganhou `content-disposition` e `accept-ranges` (o outro cabeçalho de representação que estava esquecido; `etag`, `last-modified`, `content-range`, `content-md5`, `content-digest`, `repr-digest`, `digest`, `content-language` e `content-location` já estavam). Os casos `desvio-gzip-cru` e `desvio-gzip-fastify` das duas suítes de guarda agora também põem `attachment; filename="laudo.pdf"` e `accept-ranges: bytes` e exigem ausência na resposta do desvio, nos modos `corrigir` e `falhar`. ANTES: `saidas/21-item3-api-ANTES.txt` e `saidas/22-item3-console-ANTES.txt` (`expected 'attachment; filename="laudo.pdf"' to be null`). CORS, `Set-Cookie`, cabeçalhos de segurança e `x-segue` continuam preservados (o caso do Fastify ainda exige `x-segue: sim`).
4. Contagens: `baseline.mjs` ganhou `V2-F02-E03-parte-2C-correcao-1` (api +10); README (api 1984, total 4243) e `COLOCAR-DE-PE.md` (6240) ajustados. README acrescenta as duas frases novas no parágrafo do catálogo. Nenhum dado de produção mudou além do `servidor.ts` e das duas guardas.

## Limites declarados

- Windows: as 2 falhas de `semear-homologacao` da API são do ambiente (aceitas). `regras-de-conteudo` falha só no EPERM do symlink (DV-46). Console 379 de 379 desta vez (o arquivo do navegador passou).
- O 408 de timeout de cabeçalho fora do formato é anterior à etapa e vira dívida pelo orquestrador (instrução recebida): não foi tocado.
- A varredura de envios só vê `.code(N).send(...)` na mesma cadeia; erro lançado como `RegraDeNegocio` é coberto pelo tipo e pelo tratador, e escrita no `raw` pela varredura de `codigos-de-erro.test.ts`.

## Provas (em `saidas/`)

`01-typecheck.txt` (0), `02-lint.txt` (0), `03-lint-teto.txt` (431), `04-formato.txt` (0), `05-test-api.txt` (1982 passam, 2 do ambiente, 34 pulados), `06-test-console.txt` (379 de 379), `07-conferir-numeros.txt` (0), `08-regras-de-conteudo.txt` (9 de 10, o EPERM), `09-test-scripts.txt` (`CI=true`, 831 casos: 808 passam, 23 pulados, 0 falham; os arquivos desta pasta entram no `INDEX.md` da pasta pai, como nas outras etapas), `20` a `23` as saídas ANTES (e ANTES e DEPOIS do item 2).

## Para o orquestrador

- Sem dívida nova paga nem aberta aqui. O 408 fica com você.
- Pendência humana: nenhuma nova.
- Se a parte 3A tocar `servidor.ts`: preservar a linha `lancarSeForaDoCatalogo` (só em teste) e, se um envio de erro novo por `.code(N).send` aparecer fora do formato, o teste pede uma exceção nomeada com justificativa.
