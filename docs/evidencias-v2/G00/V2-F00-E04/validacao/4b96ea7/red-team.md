---
validador: red-team
modelo: claude-opus-5-5
etapa: V2-F00-E04
sha_validado: 4b96ea7
ci_run: 38445527075
rodada: 2
herdado_de:
tags: [API, AUTH, AUTHZ, TENANT]
nivel_de_prova_exigido: [E1, E2]
nivel_de_prova_obtido: [E1, E2]
veredito: FAIL
confianca: alta
humano_necessario: nao
escalar: nenhum
---
## Critérios verificados

Veredito: **FAIL**, pelo item da Definition of Done "comentários batem com o código" (achado 1). Em execução a vigência na escrita está certa e o defeito da rodada 1 (GET e HEAD com efeito passando fora da vigência) está consertado e mordido. Árvore: HEAD 24aed19, que só difere de 4b96ea7 em arquivos de registro. Evidência em `C:/Users/Rfasg/AppData/Local/Temp/claude/c--Projetos-city-hall/b62645e7-c436-45b4-8ce0-4d68f4fb420f/scratchpad/redteam` (abreviada `redteam/`).

| Critério | Resultado |
| --- | --- |
| Conta desativada, papel rebaixado, sessão e cadeia encerradas não escrevem por POST, PATCH, PUT, DELETE nem pelos GET e HEAD marcados | PASS (`out-api-suites.txt`: 16 arquivos, 296 de 296, inclui `get-com-efeito`, `vigencia-na-escrita`, `familia-da-sessao`) |
| O teste do conserto morde | PASS: troquei em `servidor.ts` a metade `comEfeito === true` por `false`; `get-com-efeito.test.ts` caiu para 5 reprovados de 10 (`out-mut-comEfeito.txt`); `git restore`, árvore limpa |
| Pista 3: existe HOJE GET, HEAD ou OPTIONS que muda estado de negócio fora dos marcados e de `ocorrencia_consultas`? | NÃO encontrado (varredura abaixo) |
| Isolamento: outro município continua 404 | PASS (suítes de isolamento por rota rodadas, ver E08 e E09) |
| Comentários batem com o código | **FAIL** (achado 1) |

## Evidência

- `redteam/gets.mjs` e `redteam/gets2.mjs`: extraem o corpo de cada um dos 46 `app.get` de `src/rotas` e `servidor.ts` e listam SQL de escrita, funções SQL chamadas e auxiliares chamados. Funções SQL encontradas em GET: `normalizar_busca` e `pontuar_busca` (IMMUTABLE), `casa_busca` (STABLE), `eliminacoes_pendentes` (LANGUAGE sql, só leitura) e `abrir_oficio` (escreve, rota pública `/publico/oficio/:token`, em `SEM_TOKEN`). Auxiliares lidos um a um: `segundoFator.situacao`, `listarMinhasSessoes`, `reunirOficio`, `exigirPostoParaGerir`, `urlParaLer`: só leitura.
- Nenhum `app.head`, `app.route` ou `app.all`; OPTIONS só existe no preflight do `@fastify/cors`, sem banco.
- Corroboração comportamental: a varredura de 408 pedidos do validador de segurança (snapshot de todas as tabelas por GET e HEAD com conta desativada) bate com a minha leitura.

## Cenários positivos

- Conta vigente emite termo, laudo e CSV (controle de `get-com-efeito.test.ts`).
- Token anterior à rotação continua escrevendo até vencer (`vigencia-na-escrita.test.ts`).

## Cenários negativos

- Quatro estados fora da vigência contra 7 rotas GET marcadas, em GET e HEAD: mesma resposta de um POST e banco intacto.
- Mutação da marca: o mesmo cenário passa a gravar e o teste reprova.

## Tentativas de reprovar

1. Procurei GET que escreve por função SQL (a mutação m11 da segurança mostrou que o portão de fonte não a vê): li as funções SQL chamadas por todo GET; nenhuma escreve, salvo `abrir_oficio`, que é da rota pública sem token.
2. Procurei escrita em auxiliar de outro diretório chamado por GET: nenhuma.
3. HEAD e OPTIONS: HEAD só existe como espelho do GET e herda a marca; OPTIONS não chega a handler.
4. Desliguei a marca (mutação) para confirmar que o teste enxerga a escrita: enxerga.

## Achados

**BLOQUEIA (DoD, documental)**

1. `dc360/apps/api/src/auth/suspensao.ts`, linhas 36 a 53, ainda diz que escrita é "qualquer método que não seja GET ou HEAD" e que `GET /avisos` "segue aceitando esse token", e que leitura "não produz registro nenhum". No SHA, `GET /avisos`, laudo, termos, PDFs e CSV levam `ROTA_GET_COM_EFEITO` e conferem vigência e suspensão, e dossiê e busca gravam `ocorrencia_consultas`. Concordo com QA e segurança. Risco concreto: quem lê o comentário remove a marca e reabre o defeito da rodada 1. Correção: reescrever o trecho.

**CORRIGE ANTES DE CRESCER**

2. O portão contra GET novo com efeito é heurístico (texto de `src/rotas`); escrita por função SQL ou auxiliar de nome novo passa. Hoje não há caso real (pista 3 derrubada), mas o portão não obriga a decidir. Sugestão: lista fechada de GET de leitura pura, e todo GET fora dela reprova.

**ANOTADO**

3. `GET /publico/oficio/:token` consome o link de uso único por GET. Leitores de link de correio (pré-carregamento de segurança) podem gastar o link antes do órgão abrir. Fora do escopo desta etapa.
4. Dossiê e busca seguem fora da vigência (decisão documentada, F03-E03).

## Não verificado

- Corrida entre a conferência da vigência e a escrita (duas transações; PGlite é de conexão única).
- Postgres real: rodei em PGlite.
- Varredura comportamental própria de todas as tabelas: não repeti; usei leitura de código e a varredura do validador de segurança.

## Risco residual

- Comentário falso convida a regressão do defeito da rodada 1 até ser corrigido.
- GET novo que escreva por função SQL entra sem vigência até alguém perceber.

## Motivo do humano

Nenhum.
