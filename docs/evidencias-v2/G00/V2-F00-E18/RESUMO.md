# V2-F00-E18: E2E de navegador (3) e CORS do PUT de evidência

Executada em 2026-10-07, no Windows 11, Node 22.17.0, Playwright com Chromium e Firefox já instalados.

## O que foi feito

1. **CORS do PUT de evidência** (`dc360/apps/api/src/servidor.ts`): `if-none-match` entrou em `allowedHeaders`, nome a nome. Sem curinga, sem mexer em `origin` (continua `ORIGENS_PERMITIDAS`) e sem mexer em métodos. O comentário diz que é o cabeçalho da escrita única que a URL de envio manda repetir (`armazenamento/memoria.ts` e `s3.ts`).
2. **Teste de preflight** novo, `dc360/apps/api/test/cors-do-envio-de-evidencia.test.ts`, com 8 casos pela rota real:
   - positivos: `OPTIONS` com `access-control-request-headers: content-type,if-none-match` devolve 204, a origem do painel e `if-none-match` em `access-control-allow-headers`; todo cabeçalho que a autorização devolve (menos `content-length`, que o navegador põe sozinho) está liberado;
   - negativos: origem fora da lista fica sem `access-control-allow-origin`; `x-qualquer` não é liberado e a lista é exatamente `accept, authorization, content-type, if-none-match`, sem `*`; o segundo PUT na mesma chave recebe 412 (escrita única);
   - autorização e isolamento: URL de envio vencida (relógio controlado) recebe 403 "URL expirada"; assinatura trocada recebe 403 "assinatura inválida"; URL assinada para a chave do município A com a chave trocada para a do município B recebe 403, e nada é gravado em nenhuma das duas.
   - Antes do conserto: 3 de 8 reprovam (os três que pedem `if-none-match`), saída `07`. Depois: 8 de 8, saída `08`.
3. **O arquivo inteiro do e2e contra a API** (`dc360/apps/web/test/fluxo-api.e2e.mjs`) rodou de ponta a ponta, sem cópia aparada. Com a seção 13 passando, apareceram quatro coisas que a cópia aparada escondia:
   - **Defeito de produto (seção 19), consertado no código:** ao apertar "Registrar e gerar protocolo" com o sinal caído, a tela dizia "Não foi possível carregar esta tela", porque o primeiro passo do envio é a checagem de duplicidade, um GET, e GET leva a frase de leitura. `possiveisDuplicidades` (`dc360/apps/web/src/dados/http.ts`) passou a devolver a frase de escrita ("O que você preencheu não foi enviado"). Teste novo `dc360/apps/web/test/duplicidade-sem-rede.test.ts` (3 casos; 1 reprova sem o conserto, saída `09`, que foi gerada desligando a linha do conserto por um instante e religando em seguida; 3 de 3 depois, saída `10`).
   - **Teste velho (seção 15), reescrito com registro:** "filtrar por autor funciona" contava as linhas das TRÊS tabelas da Prestação de contas (exportações, consultas e trilha); 26 linhas, uma de outra pessoa. Agora acha a tabela pela legenda e espera o total do título mudar, em vez de 1500 ms. Registro em `docs/DECISOES-DE-TESTE-DA-FASE-00.md`.
   - **Roteiro (`dc360/scripts/e2e-api.mjs`):** nunca terminava quando tudo passava (os pipes dos filhos seguravam o Node), deixando as portas 3691 e 4691 ocupadas. Agora sai com `process.exit(0)` e o `exit` derruba a API e o painel. A primeira execução verde ficou pendurada e foi derrubada à mão com `taskkill`.
   - **Firefox, dois ajustes de teste com registro:** a miniatura da galeria é `loading="lazy"` e o Gecko só a busca perto da área visível (o teste agora rola e espera o `load`); e o Gecko registra os abortos de propósito das seções 19 e 27 como "Cross-Origin Request Blocked" e a fonte cancelada pela navegação com status 2152398850 (NS_BINDING_ABORTED). Os três padrões novos de console esperado ficam presos ao caminho abortado e ao código de aborto. Registro em `docs/DECISOES-DE-TESTE-DA-FASE-00.md`.
4. **Documentação:** `dc360/README.md` (Como testar: o e2e contra a API por `npm run test:e2e:api` e `node scripts/e2e-api.mjs firefox`, o pré-requisito `npx playwright install chromium firefox`, as correções que vieram da suíte; os números de teste), `dc360/docs/COLOCAR-DE-PE.md` (números), `dc360/apps/web/PENDENCIAS.md` (seção 10), `dc360/scripts/baseline.mjs` (API +8, painel +3, `e2e-api` espera código 0 e "Passou: 271   Falhou: 0").

## As três execuções (e a quarta)

Pré-requisito: `npx playwright install chromium firefox`.

| Execução | Comando | Resultado | Saída |
| --- | --- | --- | --- |
| Local, Chromium | `npm run test:e2e` com `vite preview` na 4173 | Passou 70, Falhou 0, zero erro de console, código 0 | `saidas/05-e2e-local-chromium.txt` |
| Local, Firefox | `MOTOR=firefox npm run test:e2e` | Passou 70, Falhou 0, zero erro de console, código 0 | `saidas/06-e2e-local-firefox.txt` |
| Contra a API, Chromium | `npm run test:e2e:api` | Passou 271, Falhou 0, zero erro de console, código 0, 2 min | `saidas/03-e2e-api-chromium-final.txt` |
| Contra a API, Firefox | `node scripts/e2e-api.mjs firefox` | Passou 271, Falhou 0, zero erro de console, código 0 | `saidas/04-e2e-api-firefox-final.txt` |

Antes: `saidas/01-e2e-api-chromium-antes.txt` morre na seção 13 com "TypeError: Failed to fetch". Só com o CORS: `saidas/02-e2e-api-chromium-depois-do-cors.txt`, 269 e 2 falhas (seções 15 e 19). Firefox antes dos ajustes: `11` (miniatura e console) e `12` (271 de 271, só o console).

As seções 23 a 29 (E05 a E12), antes provadas só em cópia aparada, passam todas no arquivo inteiro, nos dois motores. A seção 13 sobe a foto pelo navegador contra a API ("os bytes sobem direto para o armazenamento", "o servidor confirma o envio", "a imagem carrega pela URL assinada").

Sobre o número: a especificação fala em "103 verificações da API", valor da E01. Hoje são 271 executadas; `conferir:numeros` conta 251 (as chamadas de `ok(` no início de linha), e a diferença vem das chamadas que ficam dentro de laço ou de função. O README afirma 251, e a conferência fecha.

## Regressão

`node scripts/baseline.mjs --so=typecheck,teste-shared,teste-db,teste-api,teste-web,test-scripts,conferir-numeros`, saída em `saidas/baseline-depois/`: 7 de 7 conferem com o esperado.

- typecheck: código 0.
- shared: 165, 1 falha (travessão, E20, pré-existente).
- banco (`test:isolamento`, inclui o CA-06): 327 passaram, 3 pulados por ambiente, código 0.
- API: 1245 (1232 passaram, 13 pulados de `banco-tls`, E21, pré-existente), 0 falhas de teste.
- painel: 636, 1 falha (CRLF em `ocorrencia-encerramento.test.ts`, E21, pré-existente).
- `test:scripts`: 199, 0 falhas, 4 pulados por ambiente.
- `conferir:numeros`: 22 afirmações, 0 divergências (corrigidas as 6 que esta etapa mudou: painel 633 para 636, API 1237 para 1245 em dois lugares, `npm test` 2808 para 2819, com o app 4669 para 4680 em dois lugares).
- `regras-de-conteudo.test.ts`: só as linhas de travessão pré-existentes.

Não rodados aqui, por não serem tocados: jest do app de campo, console, `auditar`, `npm audit`, `expo-doctor`.

## Capturas

`capturas/registrar-sem-sinal-{1280,390}-{claro,escuro}.png`: a tela "Registrar ocorrência" contra uma API real (portas 3692 e 4692), com a rota da API derrubada depois de entrar e o formulário preenchido. Nas quatro o aviso vermelho diz "Não foi possível gravar: Sem conexão com o servidor. O que você preencheu não foi enviado. Verifique o sinal e tente de novo." Nenhum erro de página. Conferidas a olho: aviso inteiro, sem corte nem sobreposição, nos dois temas e nas duas larguras.

## Limitações e o que falta

- **Validação humana:** Rafael ver o upload da foto pelo painel concluir na seção 13 (`npm run test:e2e:api`).
- Os e2e não rodam no CI (F01-E03). CORS por ambiente (F01-E10) e o CORS do armazenamento externo de verdade (F06-E15) não foram tocados: o PUT foi exercitado só contra o armazenamento local da API.
- Só Windows.
