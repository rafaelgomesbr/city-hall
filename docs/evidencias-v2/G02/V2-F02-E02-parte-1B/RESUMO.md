# V2-F02-E02 (parte 1B, console): o console fala /v1 com a própria API e responde validação em português (DV-38)

## Fatos

**O que mudou (só `dc360/apps/console/**`, mais a imagem do console, a chave de contagem e o texto de números):**

- `apps/console/src/servidor.ts`: todas as rotas de negócio (`/entrar`, `/entrar/codigo`, `/municipios`, `/municipios/:id/serie`, `/prefeituras`, as quatro ações por município, `/operadores` e suas ações, `/senha`, `/codigos-de-recuperacao`, `/recuperar`) moram na função única `registrarRotasDeNegocio`, registrada duas vezes: sob o prefixo `/v1` e na raiz (espelho para a página aberta antes da troca). `/saude`, a casca da página, os estáticos e as fontes ficam só sem prefixo. O diff grande do arquivo é reindentação (53 linhas de mudança real, `git diff -w`). O tratador de 429 passou a olhar `rotaLogica(req.url)`: o texto de espera do cadastro (`req.url.startsWith("/prefeituras")` no código antigo) continua valendo sob `/v1/prefeituras`.
- `apps/console/src/limite-por-rota.ts` (novo): loja do `@fastify/rate-limit` que mantém UM contador por rota lógica (método mais caminho sem `/v1`). Sem ela cada rota registrada duas vezes teria teto próprio, e alternar `/entrar` e `/v1/entrar` dobraria o teto de tentativas da porta (cada tentativa gasta uma derivação scrypt).
- `apps/console/src/pagina.ts`: `BASE_DA_API = "/v1"` e o único `fetch` da página (em `pedir`) passa a `fetch(BASE_DA_API + caminho, opcoes)`. Os chamadores continuam escrevendo `/entrar`, `/municipios`.
- `apps/console/src/validacao.ts` (novo, DV-38): `validar(esquema, valor)` faz `safeParse` com `mensagensDoZodEmPortugues` do `@dc360/shared` e `recusaDePedido` monta o 400 `{ erro: "pedido_invalido", mensagem, campos: [{ campo, mensagem }] }`. Status e `erro` não mudam; `mensagem` segue sendo a do primeiro problema; `campos` é aditivo. Todo `safeParse` de corpo do console passou por `validar`. `apps/console/package.json` ganhou a dependência `@dc360/shared` (lockfile ajustado).
- `Dockerfile.console`: a imagem de produção passa a copiar `packages/shared/dist` e `package.json`, porque o atalho `node_modules/@dc360/shared` agora é resolvido em tempo de execução.
- Testes: `test/v1-e-mensagens.test.ts` (novo, 19 casos: paridade `/v1` e espelho, porta inteira sob `/v1`, infraestrutura e estáticos sem prefixo, ponto único do `fetch`, 400 em português nas cinco rotas com os dois prefixos, teto único nos dois prefixos, 429 do cadastro sob `/v1`); `superficie.test.ts` (+1 de paridade das rotas, isenções declaradas uma vez e valendo nos dois lados); `a-tela-responde.test.ts` (caminhos esperados agora com `/v1`).
- Contagens: `baseline.mjs` passo `teste-console` 339 para 359 (o console não tem tabela `MUDANCAS_*`; o total é literal na linha do passo); README (359 do console, 3941 em `npm test`) e `COLOCAR-DE-PE.md` (5938) ajustados. Meu parágrafo no README: "Versão no endereço (V2-F02-E02)".

**Pontos do roteiro da E02 que NÃO são desta parte:** painel (`apps/web/src/dados/http.ts`) e campo (`apps/campo/src/dados/api.ts`) não foram tocados.

## Limites declarados (leia antes de dar PASS)

- Não há Docker nesta máquina: a mudança do `Dockerfile.console` (cópia do `shared/dist`) NÃO foi construída aqui. Provar no job de imagem do CI do SHA.
- Os testes do console de rota (`acoes-perigosas`, `cadastro-de-prefeitura` e demais) continuam chamando o caminho sem prefixo (o espelho); a cobertura sob `/v1` é a de `v1-e-mensagens.test.ts` e `superficie.test.ts`, além de `a-tela-responde.test.ts` (a página pede `/v1`). Não dupliquei as suítes funcionais nos dois prefixos.
- `plateia-nao-atravessa.test.ts` trabalha sobre tokens, não sobre caminhos, e passa sem alteração; o caso "sem sessão em `GET /v1/municipios` responde 401" está em `v1-e-mensagens.test.ts`.
- Falhas de ambiente Windows, as mesmas conhecidas e fora desta parte: `regras-de-conteudo.test.ts` 1 caso (EPERM em symlink, DV-46), `desfazer-migracao.test.ts` 5, `guarda-da-semente.test.ts` 3 e `semear-homologacao.test.ts` 2 (`spawnSync` do tsx com status nulo). Nenhuma outra falha.
- Ordem de implantação: o console novo serve as duas formas e a página vem do mesmo processo, então não há ordem a respeitar.

## Provas (em `saidas/`)

1. `01-typecheck.txt` (código 0). 2. `02-lint.txt` (OK monorepo e campo). 3. `03-lint-teto.txt` (431, não sobe). 4. `04-formato.txt` (OK). 5. `05-conferir-numeros.txt` (25 afirmações, tudo bate; total 5938). 6. `06-test-scripts.txt` (831 casos, 808 passam, 0 falham, 23 pulados; a primeira rodada, sem o INDEX.md da pasta, reprovou só "todo INDEX.md real bate"; esta é a rodada com o INDEX). 7. `07-regras-de-conteudo.txt` (9 de 10; o 1 é o EPERM do Windows). 8. `08-auditar.txt` (código 0, runtime limpo). 9. `09-npm-test.txt` (campo pacote 238, shared 244 de 245, api 1867 de 1869 com 34 pulados, console 359 de 359, web 791, db 431 de 445 com 6 pulados; as falhas são só as de ambiente listadas). 10. `10-test-isolamento.txt` (`isolamento.test.ts` CA-06: 137 de 137; as 8 falhas do pacote são as de ambiente do `desfazer-migracao` e da `guarda-da-semente`).

## Para o orquestrador

- **Linha do STATUS sugerida:** `V2-F02-E02 (parte 1B, console) | IMPLEMENTADA (candidato) | console serve as rotas sob /v1 e no espelho (função única registrarRotasDeNegocio), página pede /v1 por ponto único, teto de tentativas único por rota lógica, validação em português com campos (DV-38), imagem leva shared/dist. 359 testes do console. Painel e campo são de outras partes da E02.`
- **Dívidas pagas:** DV-38 (o console importa e instala `mensagensDoZodEmPortugues` do shared em `src/validacao.ts`, e o 400 sai em português na forma `{ erro, mensagem, campos }`).
- **Ao integrar:** a linha `teste-console` de `baseline.mjs` (total 339 para 359) e o parágrafo do README/`COLOCAR-DE-PE.md` podem conflitar com a parte 1C (que também acrescenta testes do console); recalcular o total na junção. O diff de `servidor.ts` conflita se a 1C mexer nele (ela não deveria: só a cópia da guarda).
- **Pendências humanas:** nenhuma nova. Validação humana da E02 (DevTools do painel e simulador do campo) é das outras partes.
- **Ao validar:** conferir a imagem do console no CI (cópia do `shared/dist`); rodar `npm run test:console` e `apps/console/test/v1-e-mensagens.test.ts`.
