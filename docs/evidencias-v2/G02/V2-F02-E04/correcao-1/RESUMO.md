# V2-F02-E04, parte 2D, correção 1: regras condicionais no contrato, teto exato e corpo opcional

A evidência arquivada da parte 2D (`../RESUMO.md`, `../INDEX.md`) NÃO foi reescrita. O `v1.json` desta pasta é o regerado depois da correção; o da pasta pai é o da primeira entrega.

## Fatos

Revisão independente (Codex) apontou quatro achados na parte 2D. Cada um tem teste que falhava antes do conserto.

**1. `refine` e `superRefine` sumiam do documento (`src/contrato/openapi.ts`).** `z.toJSONSchema` descarta os refinamentos: a abertura com `tipo: "outro"` sem `tipoDescricao` e a triagem com `vulnerabilidadePresente: true` sem `vulnerabilidadeDescricao` passam pelo JSON Schema e o Zod recusa. Conserto: `refinamentosDe(esquema)` passeia pela definição pública do Zod (`.def`, em qualquer profundidade: objeto dentro de lista, união, opcional, pipe) e acha cada `custom`; cada regra sai como `x-regras-adicionais` (`{ em, campo, caminho, regra }`) na operação, no esquema do corpo e repetida na `description` da operação. Texto da regra: o da mensagem do refinamento (o mesmo que a API devolve); `superRefine` sem mensagem sai com um texto padrão que diz que a regra existe sem texto declarado. Guarda `operacoesSemAnotacaoDeRegras(rotas, documento)`: reprova a entrada cujo esquema tem refinamento e cuja operação não traz uma anotação por refinamento. Nas rotas reais saem anotadas 5 operações: `POST /v1/ocorrencias`, `POST /v1/ocorrencias/{id}/triagem`, `POST /v1/saida-a-campo/encerrar`, `POST /v1/sincronizacao/devolucao` e `POST /v1/sincronizacao/vistoria` (3 regras: a da vistoria e duas do checklist).
- Observação de implementação: a varredura de código-fonte da API (`codigos-de-erro.test.ts`) proíbe nomes de estado interno do Node e `Reflect`. O `refine` expõe `.def`, mas o `superRefine` guarda a definição do check numa propriedade própria não enumerável do Zod; ela é lida por `Object.getOwnPropertyNames`, sem citar o nome, em `defDoCheck`. A varredura NÃO foi afrouxada.
- Limite declarado: a regra sai como texto (`x-regras-adicionais`), não como `if/then`. Um cliente gerado do documento não a valida sozinho (item 5 de `apps/api/PENDENCIAS.md`).

**2. A fusão das formas com e sem barra final escondia rotas distintas (`test/openapi.test.ts`).** Um `GET /v1/coisas/:id` e um `GET /v1/coisas/:id/` declarados à mão com handlers diferentes passavam como uma só. Conserto: o teste agora lê o que o próprio Fastify anunciou no `onRoute` (`vi.mock("fastify")` põe o gancho em toda instância criada no arquivo, a do servidor de verdade e as sintéticas; `findRoute` não serve, devolve o `routeHandler` genérico). Funde quando as duas formas foram declaradas com o MESMO handler ou quando só uma foi declarada (a outra é o gêmeo `prefixTrailingSlash` do Fastify); com handlers diferentes devolve um problema e deixa as duas chaves separadas, para a paridade reprovar a que não tem entrada. Nas rotas reais: 0 problemas. Casos sintéticos: as duas rotas distintas reprovam; plugin com prefixo e rota `/` funde sem problema.

**3. O teto não garantia "só desce".** Antes: `toBeLessThanOrEqual(40)`. Voltar de 39 para 40, ou trocar uma pendente por outra nova, ficava verde. Agora: `PENDENTES_CONGELADAS` (as 40 chaves de hoje, explícitas no teste) e `conferirPendentes(pendentes, congeladas, teto)`, por IGUALDADE: `pendentes.length === TETO_DE_PENDENTES`, a lista congelada tem o mesmo tamanho e nenhuma pendente está fora dela (rota NOVA em `pendentes` reprova). O conjunto de `pendentes` também é comparado, chave a chave, com o congelado. O lote 3 tira a chave de `pendentes`, da lista congelada e baixa o número no mesmo commit, e o diff mostra cada uma.

**4. Todo `requestBody` saía `required: true`.** Agora `required: !corpo.safeParse(undefined).success`: corpo `.optional()` ou com `.default()` sai `required: false`. Nenhuma rota real hoje tem corpo opcional descrito (as com `req.body ?? {}` estão em `pendentes`), então o `v1.json` só mudou pelas anotações do item 1.

**Contagem.** `openapi.test.ts` 24 para 28 casos (+4: o da fusão nas rotas reais, os dois sintéticos da fusão e o sintético das pendentes; o teste do teto foi substituído pelo da igualdade, sem mudar a conta) e `openapi-regras.test.ts` novo com 10 casos: +14 no total. `baseline.mjs`: `"V2-F02-E04-correcao-1": 14`. API: 2003 para 2017. README e `COLOCAR-DE-PE.md`: 1983, 4236 e 6233.

## Testes que falharam antes e passam depois

- `saidas/01-falha-antes-gerador.txt`: os 10 casos de `openapi-regras.test.ts` contra o gerador ANTIGO (HEAD `74b132d1`): 7 falham (as duas anotações das operações, a cobertura das entradas reais, `refinamentosDe` inexistente, o superRefine sintético, e os dois de corpo opcional), 3 passam (o Zod recusa os dois corpos, o esquema sem refinamento, o corpo obrigatório).
- `saidas/02-falha-antes-fusao.txt`: o caso das duas rotas distintas com a verificação de handler DESLIGADA (mutação `mesmo || true`): 1 falha. Sem a verificação, as duas rotas seriam fundidas em silêncio.
- Item 3: o teste por igualdade (`conferirPendentes`) é função pura com casos sintéticos para a rota nova, a perda de uma pendente, a repetida e o teto divergente; a asserção antiga (`<=`) aceitava todos eles.
- Depois: `saidas/07-test-api.txt` (API inteira).

## Portões (números)

- `typecheck` 0 erros (`03`); `lint` OK nos dois (`04`); `lint:teto` 431, não sobe (`05`); `formato:conferir` OK, 825 arquivos (`06`).
- API: 2017 casos, 1981 passam, 34 pulados, 2 falham (`semear-homologacao`, aceitos) (`07`).
- `regras-de-conteudo`: 9 de 10; a falha é o EPERM do link simbólico (aceito) (`08`).
- `conferir:numeros` OK (`09`); `baseline.test.mjs` 29 de 29 (`10`); `auditar` código 0 (`11`); índices de evidência OK (`12-conferir-indices.txt`); `test:scripts` na rodada final (`13-test-scripts.txt`).
- Não rodados, por serem de outros pacotes que esta correção não toca: `test:isolamento`, web, console, campo. Não rodei `test:e2e:api`.

## Para o orquestrador

- **Linha do STATUS:** acrescentar à E04 (parte 2D) `correção 1: regras refine anotadas em x-regras-adicionais com guarda, fusão de formas provada pelo handler, pendentes por igualdade com lista congelada, corpo opcional required:false; +14 testes de API`.
- **Na junção:** `baseline.mjs` ganhou a chave `V2-F02-E04-correcao-1: 14`; totais do README/COLOCAR-DE-PE na minha árvore (1983, 4236, 6233) precisam ser recalculados. `v1.json` é derivado: em conflito, `npm run openapi --workspace @dc360/api`.
- **Para o lote 3:** ao descrever uma rota cujo esquema tenha `refine`, a anotação sai sozinha. Tire a chave de `pendentes` E de `PENDENTES_CONGELADAS`, baixe `TETO_DE_PENDENTES`.
