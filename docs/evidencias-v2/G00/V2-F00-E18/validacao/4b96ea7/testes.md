---
validador: testes
modelo: claude-sonnet-5-5
etapa: V2-F00-E18
sha_validado: 4b96ea7
ci_run: 38445527075
rodada: 2
herdado_de:
tags: [API, ARQUIVO, INFRA]
nivel_de_prova_exigido: [E1]
nivel_de_prova_obtido: [E1]
veredito: PASS
confianca: media
humano_necessario: nao
escalar: nenhum
---
## Critérios verificados

Veredito na primeira linha: **PASS**. O teste de preflight (`cors-do-envio-de-evidencia.test.ts`) e o da frase de rede (`duplicidade-sem-rede.test.ts`) mordem em todas as mutações que apliquei, e a lista de console esperado do Firefox não engole um bloqueio de CORS de verdade. Pela restrição de paralelismo (outros validadores usam `apps/api`, `apps/web` e as portas 3791 e 4791), **não mutei nada em `apps/api` nem em `apps/web`** e **não rodei os e2e de navegador**; as mutações foram feitas em cópias "sombra" fora do repositório.

Base de evidência: `C:/Users/Rfasg/AppData/Local/Temp/claude/c--Projetos-city-hall/b62645e7-c436-45b4-8ce0-4d68f4fb420f/scratchpad/testes/` (abreviada `testes/`).

| Critério | Resultado |
| --- | --- |
| o preflight devolve `if-none-match` em `access-control-allow-headers` | PASS (8 de 8; sombra sem o cabeçalho: 3 reprovam) |
| origem fora da lista não recebe `access-control-allow-origin` | PASS (sombra com `origin: true`: 1 reprova) |
| cabeçalho fora da lista não é liberado; sem curinga | PASS (sombra com `"*"`: 4 reprovam; com `x-qualquer`: 1 reprova; sem `allowedHeaders`, o plugin ecoa o que o navegador pediu: 1 reprova) |
| segundo PUT para a mesma chave recusado (escrita única); URL vencida; assinatura trocada; chave de outro município | PASS (testes presentes, parâmetro `chave` conferido contra `memoria.ts`: o teste não passa por vazio) |
| a frase de rede da checagem de duplicidade diz que o que foi preenchido não foi enviado | PASS (sombra com a frase de leitura: 1 reprova) |
| a lista de console esperado do Firefox no e2e não engole CORS real | PASS (modelo executado contra o regex de verdade, 11 de 11 conformes) |
| nenhum teste pulado ou afrouxado | PASS (zero `skip` no diff; `portao-de-skip.mjs` código 0) |

## Evidência

- `cd dc360/apps/api && npx vitest run test/cors-do-envio-de-evidencia.test.ts`: 8 de 8 (`testes/100-cors-base.txt`). `cd dc360/apps/web && npx vitest run test/duplicidade-sem-rede.test.ts`: 3 de 3 (`testes/101-duplicidade-base.txt`). Leitura apenas; nenhum arquivo do repositório foi tocado.
- **Mutação sem tocar no repositório.** Copiei `apps/api/src/servidor.ts` para `testes/api-sombra/servidor-sem-if-none-match.ts` com os imports relativos reescritos para caminho absoluto e a alteração aplicada por `sed`; copiei o teste para `testes/api-sombra/cors-sombra.test.ts` apontando para a cópia; configuração própria do vitest em `testes/api-sombra/vitest.config.mjs` (raiz em `apps/api`, `node_modules` por junção, removida depois). Resultados:
  - `if-none-match` fora de `allowedHeaders` (o defeito original): **3 de 8 reprovam**, as mesmas três do `saidas/07` arquivado pelo implementador (`testes/103-cors-sombra-sem-if-none-match-VERMELHO.txt`).
  - `allowedHeaders: ["*"]`: 4 reprovam (`testes/104-cors-sombra-curinga.txt`).
  - `allowedHeaders` removido (o plugin passa a ecoar o pedido): 1 reprova, o da lista exata (`testes/104-cors-sombra-eco-do-que-o-navegador-pediu.txt`).
  - `origin: true`: 1 reprova (`testes/104-cors-sombra-origem-qualquer.txt`).
  - lista com `x-qualquer` a mais: 1 reprova (`testes/104-cors-sombra-cabecalho-extra.txt`).
  - `PUT` fora de `methods`: 1 reprova (`testes/104-cors-sombra-put-fora-dos-metodos.txt`).
- Mesma técnica para a web: `src/dados/http.ts` copiado para `testes/web-sombra/http-sombra.ts` com `throw new SemConexao(false)` trocado por `throw erro` (a frase de leitura volta). O teste reprova 1 de 3 com a mensagem "Não foi possível carregar esta tela" (`testes/105-duplicidade-sombra-sem-conserto-VERMELHO.txt`); bate com o `saidas/09` arquivado.
- **Lista de console esperado do Firefox** (`apps/web/test/fluxo-api.e2e.mjs`, constante `ESPERADOS`). Extraí o regex do próprio arquivo e o apliquei a 11 mensagens (script `testes/esperados-do-console.mjs`, saída `testes/102-console-esperado-firefox.txt`; o formato das três mensagens de aborto é o que aparece nos logs arquivados `saidas/11` e `saidas/12`). Engolidas, por desenho: os três abortos de propósito (`/ocorrencias/duplicidades/consulta`, `/saida/pacote.zip`, `/auth/recuperar`, todos com "CORS request did not succeed"), `net::ERR_FAILED` e `status of 401/403/404/422/429/503`. **Não engolidas:** o bloqueio de preflight do PUT da foto por `if-none-match` ("header ‘if-none-match’ is not allowed according to header ‘Access-Control-Allow-Headers’"), "CORS header ‘Access-Control-Allow-Origin’ missing" em `/saida/pacote.zip` e em `/ocorrencias/duplicidades/consulta`, a falha de rede do PUT da foto ("CORS request did not succeed" em `/armazenamento/objeto`), o bloqueio do Chromium ("blocked by CORS policy") e o status 500. Divergências da expectativa: 0.
- Verificação adicional do que o `cors-do-envio-de-evidencia` prova: o preflight é feito por `app.inject`, não por navegador. A prova de que o navegador deixa o PUT passar é a seção 13 do e2e contra a API, que roda no job de CI "Fluxo ponta a ponta no navegador" (verde, 9 de 9) e nos arquivos `saidas/03` e `saidas/04` do implementador.

## Cenários positivos

Preflight com `content-type,if-none-match` devolve 204, a origem do painel, `put` em métodos e `if-none-match` nos cabeçalhos; PUT assinado grava uma vez e traz `access-control-allow-origin` na resposta de verdade; checagem de duplicidade com rede devolve as candidatas.

## Cenários negativos

Origem fora da lista sem `access-control-allow-origin` e sem curinga; `x-qualquer` não liberado e lista exata de 4 nomes; segundo PUT 412 `objeto_ja_existe`; URL vencida 403 "URL expirada"; assinatura trocada 403; assinatura de uma chave usada em outra 403 e nada gravado em nenhuma das duas; recusa 422 do servidor não vira frase de rede.

## Tentativas de reprovar

1. **Teste que passa por vazio.** O teste de chave trocada faz `searchParams.set("chave", ...)`: conferi em `armazenamento/memoria.ts:85-87` e `rotas/armazenamento-local.ts` que `chave` é o parâmetro real, entra na assinatura, e a rota o lê de `consulta["chave"]`. Não é vazio.
2. **CORS afrouxado de outra forma.** Curinga, eco do pedido, origem livre, cabeçalho a mais e método a menos: todos reprovam (acima). Não achei uma mutação plausível do `allowedHeaders` que a suíte deixe passar.
3. **Lista de console que engole CORS real.** O regex é sem âncora e vale para o arquivo inteiro, não para uma seção, então um "CORS request did not succeed" real nos três caminhos abortados em qualquer outra seção também seria engolido; mas esse texto é de falha de REDE (o pedido nem chegou), e CORS de verdade (cabeçalho ausente, preflight recusado) tem outro motivo no texto e continua reprovando. Os 11 casos confirmam. O `\.` dentro de string JS (`pacote\.zip`) vira `.` coringa: folga inofensiva.
4. **Teste cujo nome promete mais.** "todo cabeçalho que a autorização manda repetir passa no preflight" deriva a lista de `envio.cabecalhos` (menos `content-length`), então acompanha a assinatura: se a autorização passar a pedir outro cabeçalho e ele não for liberado, reprova. É o teste mais forte do arquivo.
5. **Teste de duplicidade com `fetch` falso.** Aceitável: o `fetch` é fronteira do processo, e a rejeição `TypeError("Failed to fetch")` é a que o navegador produz. A sessão é um `sessionStorage` falso mínimo.
6. **Lógica no teste.** `for (const nome of repetidos) expect(cabecalhos, nome).toContain(nome)` e `.sort()`; literais e curtos, anotado.
7. **Estabilidade.** Os dois testes rodam em menos de 7 s sem relógio real (o relógio do armazenamento é controlado e a URL "vencida" se prova andando o tempo, e restaurando-o em `finally`).

## Achados

### ANOTADO

- A lista de console esperado é global ao arquivo, não por seção, e sem âncora. Um aborto real de rede nos três caminhos listados passaria em silêncio em outra seção; mitigado porque as asserções da seção em que ele ocorresse reprovariam.
- O preflight é provado por `inject`; o navegador só é provado pelo e2e (que não reexecutei).
- `allowedHeaders` fixo (4 nomes) é política deliberada; um cabeçalho legítimo futuro (por exemplo de correlação) exigirá editar o teste. Intencional ("nome a nome, nunca curinga").

## Não verificado

- Os e2e de navegador (Chromium e Firefox, local e contra a API): **não executei**. Motivo: restrição de paralelismo (portas 3791 e 4791 e o navegador estão com outros validadores). Dependo do job de CI do SHA (9 de 9, run 38445527075, que a rodada 2 de engenharia de entrega leu job a job) e dos logs arquivados. Isso é prova de E1 do CI, não minha.
- O CORS do armazenamento S3 real (F06-E15) e o PUT contra o provedor: fora do escopo da etapa.
- As mensagens reais de console do Firefox para os cenários "não engolidos" são modeladas a partir do formato das duas mensagens arquivadas e da documentação do navegador; não as provoquei num Firefox real.

## Risco residual

Baixo. O conserto é de uma linha, estreito, e guardado por oito testes que mordem em seis variações. O ponto de atenção é a dependência do e2e de navegador para provar o fim do caminho.

## Motivo do humano

Nenhum.
