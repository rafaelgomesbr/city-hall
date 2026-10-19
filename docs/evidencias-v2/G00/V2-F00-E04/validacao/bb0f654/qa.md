---
validador: qa (general-purpose com o papel da dimensão)
modelo: claude-opus-5-5
etapa: V2-F00-E04
sha_validado: bb0f654
ci_run: ausente (39143791434 citado pelo implementador, não lido)
rodada: 4
herdado_de:
tags: [AUTH, AUTHZ, API]
nivel_de_prova_exigido: [E1, E2]
nivel_de_prova_obtido: [E1, E2]
veredito: PASS
confianca: alta
humano_necessario: nao
escalar: nenhum
---
## Critérios verificados

Pasta das saídas (todas citadas abaixo): `/private/tmp/claude-501/-Users-rafaelgomes-Documents-city-hall/ded47d25-806d-4495-ac61-f9e84518cc35/scratchpad/validadores/qa-E04-E05-E08/` (abreviada como `$O`). Árvore em `0290af5`, que só difere de `bb0f654` em `STATUS.md` e `ESTADO-ATUAL.md` (`git diff --stat bb0f654 HEAD` conferido).

| Item (DoD e cinco campos de teste) | Resultado | Prova |
| --- | --- | --- |
| DoD: sonda de conta desativada não escreve | PASS | sonda própria `$O/31-sonda-qa.txt` (403 `conta_desativada` em POST e no GET com efeito `/avisos`); `vigencia-na-escrita.test.ts` 13 de 13 em `$O/01-test-api.txt`; mutação sem a vigência reprova 18 casos (`$O/10`) |
| DoD: zero `skip` em vigência | PASS | `grep` de `.skip`, `.todo`, `.only`, `skipIf`, `runIf` em `vigencia-na-escrita.test.ts`, `get-com-efeito.test.ts`, `acesso-suspenso.test.ts`, `codigos-de-erro.test.ts`: só a menção histórica no comentário da linha 38; `node scripts/portao-de-skip.mjs` código 0; o arquivo roda 13 testes, nenhum pulado |
| DoD: comentários batem com o código | PASS | lidos frase a frase contra o código: `servidor.ts` (bloco da escrita e `ROTA_GET_COM_EFEITO`), `auth/vigencia.ts`, `auth/suspensao.ts` (seções "SESSÃO VIVA" e "FILA RECEBE 503"), `auth/sessoes.ts` (cabeçalho), README linha 130 e `apps/api/PENDENCIAS.md` linhas 15 a 26 e 81 a 106; cada afirmação executável foi provada pela sonda ou pelos testes (abaixo) |
| DoD: item "vigência" do G00 marcado | não é desta dimensão | marca do gate, depois do veredito |
| Positivo: conta ativa escreve (200) | PASS | sonda: controle `POST /avisos/lidos` com conta ativa responde 200; `get-com-efeito.test.ts` caso de controle |
| Negativo: conta desativada, papel rebaixado e sessão encerrada por administrador recebem 401 (hoje 403 `conta_desativada` e 401 pela E05 e E07) | PASS | sonda: desativada 403 `conta_desativada`; papel diferente 401 `nao_autenticado`; sessão encerrada 401 `sessao_encerrada`, inclusive em GET e HEAD de `/avisos` |
| Negativo: quem encerra "as outras sessões" mantém a sua | PASS | sonda: Helena com duas sessões, `POST /auth/encerrar-sessoes` pela segunda; a segunda escreve (200), a primeira recebe 401 `sessao_encerrada` |
| Autorização e isolamento: B contra ocorrência de A continua 404; `test:isolamento` verde | PASS | sonda: Vale Fundo contra ocorrência de Serra Alta, 404 na escrita e na leitura; `$O/02-test-isolamento.txt` 345 aprovados e 3 pulados, código 0 |
| Regressão: `test:api`, `test:isolamento`, `superficie.test.ts`, `test:e2e:api` | PASS (com a falha de ambiente conhecida) | `$O/01` (1326 aprovados, 1 falha `openssl-do-teste.test.ts` do LibreSSL do macOS, 20 pulados do `renovacao-contra-encerramento.test.ts` que exigem Postgres de prova, da E07); `$O/05` 9 de 9; `$O/06` 288 OK e 0 falha no roteiro principal, mais 64 OK no de geometria, zero erro de console |
| E2E: desativar no painel e o próximo pedido dele falha | PASS | `$O/06`, seção 23 do `fluxo-api.e2e.mjs`: "a coordenacao desativa o Marcos pelo painel", "conta desativada leva a tela de entrada"; e a sonda HTTP: `PATCH /usuarios/:id/situacao` seguido de POST com o token vivo dá 403 |

## Evidência

Comandos (em `dc360`, todos com saída arquivada em `$O`):

- `npm run build:shared` (código 0, `$O/00-build-shared.txt`) e `npm run test:api` (código 1 só pela falha de ambiente, `$O/01-test-api.txt`): 101 arquivos, 1347 testes, 1326 aprovados, 1 falha, 20 pulados. Arquivos da etapa: `vigencia-na-escrita.test.ts` 13, `get-com-efeito.test.ts` 10, `acesso-suspenso.test.ts` 20, `codigos-de-erro.test.ts` 22, `superficie.test.ts` 9, todos verdes.
- `npm run test:isolamento` (código 0, `$O/02`): 14 arquivos, 345 aprovados, 3 pulados.
- `npx vitest run --root apps/api test/superficie.test.ts` (código 0, `$O/05`): 9 de 9.
- `npm run test:e2e:api` (código 0, `$O/06-test-e2e-api.txt`): API e painel reais, Chromium; "Passou: 288 Falhou: 0" e "Passou: 64 Falhou: 0", "Zero erro de console", "TUDO CERTO".
- `npm run conferir:numeros` (código 0, `$O/09`): todos os números da documentação batem.
- Sonda HTTP independente, escrita por este validador (`$O/scripts/sonda-qa.mjs`), contra uma API recém-semeada que eu subi na porta 3791 (`npx tsx src/index.ts`, banco em memória com a semente), sem usar ajudante dos testes do repositório: `$O/31-sonda-qa.txt`, 85 OK e 0 falha, código 0. API derrubada no fim.
- Prova de que morde (E1 de risco alto): `$O/10-mutacao-E04-sem-vigencia.txt`. Troquei, em `servidor.ts`, `lerVigencia` mais `exigirVigencia` por `exigirAcessoAtivo` (só a suspensão, o estado anterior à E04) e rodei `vigencia-na-escrita`, `get-com-efeito` e `codigos-de-erro`: 18 reprovados de 45 (conta desativada, papel rebaixado, sessões encerradas, `sid` de outra pessoa, senha provisória do banco, as quatro sondas de GET com efeito, a lista comportamental, a varredura de PATCH, PUT, DELETE e POST). Restaurado com `git restore`; `git status` limpo.
- Índice da evidência: `$O/20-index-contra-blobs-bb0f654.txt`, conferência própria (`$O/scripts/conferir-index.mjs`) do `INDEX.md` contra os blobs do git em `bb0f654`, que são os bytes de um checkout novo: 38 de 38 linhas batem; o sub-índice `baseline-teste-api/INDEX.md` 3 de 3. O único "não listado" é o próprio sub-índice, que a regra do conferidor exclui de propósito e que confere por si. `node scripts/conferir-indices-de-evidencia.mjs` OK (`$O/21`). A evidência da etapa não muda entre `bb0f654` e o HEAD.

## Cenários positivos

- Conta ativa escreve: `POST /avisos/lidos` com a conta do operador responde 200 (sonda).
- Token de acesso antigo depois de renovar continua escrevendo enquanto a cadeia vive ("rotação não é expulsão"): caso de `vigencia-na-escrita.test.ts`, verde, e verde também sob a mutação (é guarda, não depende da vigência).
- A sessão de onde a pessoa clicou em "encerrar as outras" continua escrevendo (sonda).
- Papel rebaixado: a renovação devolve o token com o papel novo, e com ele a rota que o papel novo não tem responde 403 `sem_permissao` (sonda: operador rebaixado a agente, `GET /oficios` 403 com o token renovado).

## Cenários negativos

- Conta desativada com token vivo: POST 403 `conta_desativada`; GET com efeito `/avisos` 403 `conta_desativada`; renovar 403 sem par novo (sonda).
- Sessão encerrada por quem administra: POST 401 `sessao_encerrada`; GET e HEAD de `/avisos` 401; renovar 401 `sessao_encerrada` (sonda).
- Papel diferente do token: POST 401 `nao_autenticado` (sonda).
- Sem token e token adulterado: 401 `nao_autenticado` (sonda).
- Município B contra ocorrência de A: 404 na escrita e na leitura (sonda).
- Conta desativada de A escrevendo na ocorrência própria, na de outro município e numa inexistente: mesmo 403 e corpo idêntico, sem confirmar nada (sonda).

## Tentativas de reprovar

1. Desliguei a vigência (mutação acima): 18 testes reprovam. A suíte prende o conserto.
2. Procurei escrita que não passa por `exigirAutenticacao`: `grep` de `verificarAcesso` e `authorization` em `src`: só `servidor.ts`, `rede.ts` (chave do limitador, não autoriza) e `segundo-fator.ts` (recusa token de acesso na rota do desafio). As rotas sem token estão listadas em `SEM_TOKEN` com motivo; o caso "toda rota POST, PATCH, PUT e DELETE fora de `SEM_TOKEN` responde 403 `conta_desativada`" de `get-com-efeito.test.ts` está verde e reprova sob a mutação.
3. HEAD de rota com efeito: a sonda confirma 401 em `HEAD /avisos` com sessão encerrada.
4. Leitura pura com token vivo de sessão encerrada: 200, exatamente a troca declarada no README e em `PENDENCIAS.md` (F03-E03). Não é defeito da etapa.
5. Conferi se a documentação ainda dizia "sem ida ao banco" ou "DESLIGADO" como estado atual: o README não tem mais a frase; o bloco de `servidor.ts` agora descreve o estado ligado e o histórico.
6. Procurei `skip` residual e marca T42 da vigência: nenhuma; o portão de skip fecha em zero.
7. Conferi que a vigência e a suspensão são uma consulta só (`lerVigencia`, um `SELECT` com `LEFT JOIN usuarios` e o `EXISTS` da sessão), como o comentário afirma.

## Achados

- nenhum que quebre critério da etapa.
- Anotado (fora do escopo, já declarado): a conferência de vigência roda numa transação e a escrita em outra (`lerVigencia` abre o seu `comTenant`, a rota abre o dela). Uma desativação que entre exatamente entre as duas deixa passar uma escrita. Janela de milissegundos, consequência do desenho de "uma consulta só" que a etapa pede. Não reproduzido (exigiria injeção de atraso); registrado como risco residual.
- Anotado: `docs/roadmap-v2/03-fase-00-estabilizacao.md` ainda diz que `GET /avisos` segue fora da vigência; é texto do plano, e o produto e a documentação do produto dizem o contrário (registrado pelo implementador na correção 1).

## Não verificado

- O run do CI (39143791434) não foi lido: `gh` sem login e leitura da credencial negada nesta sessão.
- PostgreSQL 17 de produção: a API rodou com o banco em memória dos testes e o `test:isolamento` no PostgreSQL 18.3 local. Os 20 casos de `renovacao-contra-encerramento.test.ts` que exigem Postgres de prova ficaram pulados (são da E07).
- A corrida entre a leitura da vigência e a transação da escrita (ver Achados) não foi exercitada.
- Aplicativo de campo em aparelho: fora do escopo desta etapa, e o efeito na fila é da E06.
- A seção 0 do portão visual não se aplica (a etapa não tem UI).

## Risco residual

- Leitura pura (e o dossiê e a busca) com token vivo de conta desativada ou sessão encerrada segue por até `ACESSO_MINUTOS` (15, teto 60) até a F03-E03; provado e declarado.
- Janela de corrida entre a conferência e a escrita, descrita em Achados.
- A falha local de `openssl-do-teste.test.ts` é do LibreSSL do macOS; a prova do mesmo caso no Linux depende do CI, que não foi lido.

## Motivo do humano

Nenhum. A "validação humana" da etapa (Rafael ver a sonda antes e depois) é provada por E1 (a mutação reprova 18 casos e o código restaurado passa) e por E2 (sonda HTTP própria contra a API real); pela seção 8 de `28`, não se pede E4 quando E1 ou E2 provam.
