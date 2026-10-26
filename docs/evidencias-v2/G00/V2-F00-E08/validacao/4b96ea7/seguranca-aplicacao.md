---
validador: seguranca-aplicacao
modelo: claude-sonnet-5-5
etapa: V2-F00-E08
sha_validado: 4b96ea7
ci_run: 38445527075
rodada: 2
herdado_de:
tags: [API, AUTH, TENANT, VAZAMENTO]
nivel_de_prova_exigido: [E1, E2]
nivel_de_prova_obtido: [E1, E2]
veredito: PASS
confianca: alta
humano_necessario: nao
escalar: nenhum
---
## Critérios verificados

Veredito na primeira linha: **PASS**. O token do agente de campo não lê ofício (403 `sem_permissao`, igual para ofício que existe e que não existe), o sino dele mostra e conta só a equipe dele, ofício de outro município responde 404, e coordenação, operador e administração seguem vendo o que viam. Achei um vazamento menor na vizinhança (achado 1, `GET /documentos/validar/:codigo`), fora do escopo declarado da etapa. Base de evidência: `C:/Users/Rfasg/AppData/Local/Temp/claude/c--Projetos-city-hall/b62645e7-c436-45b4-8ce0-4d68f4fb420f/scratchpad/seg/` (`seg/`).

| Critério | Resultado | Evidência |
| --- | --- | --- |
| Agente em `GET /oficios` e `GET /oficios/:id`: 403 `sem_permissao` | PASS | `leitura-do-agente-oficios-e-avisos.test.ts` e sonda `4x-e08-ofico-cruzado.txt` (Diego e Tarcísio: 403 em lista, ficha, documento e envio) |
| O 403 é da AÇÃO e não confirma nada: igual para ofício existente e inexistente, antes de validar o id | PASS | mesma sonda: ficha existente e UUID inexistente dão ambos 403 `sem_permissao` ao agente |
| Operador, coordenador e administrador listam e abrem ofício (200) | PASS | sonda: Jonas e Helena 200 na lista e na ficha; Helena 200 no documento (Jonas 403: operador não emite documento) |
| Ofício do município A visto por B: 404, indistinguível de inexistente | PASS | sonda: Aurélio (coordenador de B) e Simone (operadora de B) recebem 404 `nao_encontrado` na ficha de A e na de UUID inexistente; a lista de B vem com 0 itens, mesmo filtrando pela ocorrência de A |
| `GET /avisos`: agente só vê e conta os avisos da própria equipe; sem equipe, lista vazia e `naoLidos` 0 | PASS | testes da etapa e do sino (`sino-de-avisos.test.ts`) verdes; mutações m09a e m09b |
| `POST /avisos/lidos` não confirma aviso de outra equipe (`marcados: 0`) | PASS | teste da etapa; mutação m09c |
| A ação nova mora no shared, não num `if` de papel na rota | PASS | `consultar_oficio` em `packages/shared/src/permissoes.ts` (operador, coordenador, administrador); 26 testes do shared verdes (`12-shared.txt`) |
| Escrita dentro do `GET /avisos` passa pela vigência | PASS | rota marcada com `ROTA_GET_COM_EFEITO` (E04); `get-com-efeito.test.ts` verde |

## Evidência

- `11-api-e06-e08-e12.txt`: `leitura-do-agente-oficios-e-avisos`, `orgaos-e-oficio`, `sino-de-avisos`, `agente-so-ve-a-equipe` e mais cinco arquivos, 9 de 9, 167 testes.
- Sondas próprias (API real, PGlite, ofício inserido como dono das tabelas): `e08-ofico-cruzado.test.ts` (seis contas x sete pedidos, `4x-e08-ofico-cruzado.txt`), `sweep-agente.test.ts` (papel x rota para as 51 rotas GET, `4x-sweep-agente.txt`), `avisos-entrada.test.ts` (entrada hostil, `4x-avisos-entrada.txt`), `validar.test.ts` (`4x-validar.txt`).
- Provas de que o teste morde (mutação em `apps/api/src/rotas`, vermelho, `git restore`, árvore limpa):

| Mutação | Resultado |
| --- | --- |
| m08a: `GET /oficios` volta a exigir só autenticação | 2 vermelhos de 38 |
| m08b: `GET /oficios/:id` volta a exigir só autenticação | 2 vermelhos de 38 |
| m09a: lista de `GET /avisos` sem o recorte do agente | 5 vermelhos de 33 |
| m09b: contagem `naoLidos` sem o recorte | 2 vermelhos de 33 |
| m09c: `POST /avisos/lidos` sem o recorte | 1 vermelho de 33 |

## Cenários positivos

- Operador, coordenador e administrador abrem a ficha do ofício; coordenação e administração abrem o documento; o sino do coordenador devolve o município inteiro.
- O agente lista os avisos da equipe dele.

## Cenários negativos

- Agente de outra equipe e agente de outro município: 403 em todas as rotas de ofício, lista, ficha, documento e envio.
- Coordenador de B: 404 na ficha e no documento de A; operadora de B: 404 na ficha (403 no documento, que o papel dela não emite); a lista de B não traz o ofício de A.
- `POST /oficios/:id/envio` por B responde 503 `envio_desligado` antes de procurar o ofício, igual para ofício de A e inexistente: não vira oráculo.
- Entrada hostil em `/avisos` (`desde=lixo`, `desdeId=lixo`, SQL no cursor, 5000 ids): 422; cursor no futuro é descartado e vira primeira carga (200).

## Tentativas de reprovar

1. Procurei o agente lendo ofício por outra porta: `/oficios/:id/documento` (403 para o operador também, exige `emitir_documento`), `/oficios` com `ocorrenciaId` de outra equipe (403 antes de olhar), `POST /oficios/:id/envio` (403).
2. Procurei a contagem do sino como oráculo: lista e contagem passam pelo MESMO recorte e juntam `ocorrencias`; a mutação m09b prova que a diferença seria pega.
3. Procurei IDOR em `POST /avisos/lidos`: o INSERT passa por dentro de `avisos` com o recorte e `ON CONFLICT DO NOTHING`; id de outro município some sem erro de banco.
4. Varri todas as rotas GET por papel (sonda `sweep-agente`): o agente recebe 200 só no que o recorte cobre (ocorrências, mapa, interditados, providências, indicadores, fotos da própria equipe, minhas saídas, meu trabalho, pendências) e 403 em trilha, relatórios, usuários, sessões de terceiros, retenção, armazenamento, documentos e ofícios.
5. Procurei vazamento no que o agente ainda alcança: `GET /orgaos` (catálogo institucional de destinos, aberto por desenho) e `GET /equipes`. Sem dado pessoal de cidadão. `GET /documentos/validar/:codigo` vaza: achado 1.
6. Token de papel rebaixado: um coordenador rebaixado a agente ainda lê o município inteiro pelo token antigo até vencer. É a vigência em leitura (F03-E03), fora desta etapa.

## Achados

**CORRIGE ANTES DE CRESCER**

1. `GET /documentos/validar/:codigo` não aplica o recorte do agente. Com o código de 12 hexadecimais de um laudo da Bravo, o Diego (Equipe Alfa) recebe 200 com `protocolo`, `ocorrenciaId`, `vistoriaId`, formato, data e o nome de quem emitiu, enquanto o dossiê dessa ocorrência responde 404 a ele (`4x-validar.txt`). Exige conhecer o código (48 bits, impresso no documento), então o vazamento é de quem já viu o papel, e não enumerável. Correção: aplicar `eRecorteDoAgente` na consulta, ou negar a ação ao agente. Fora do escopo declarado da E08 (AUT-12 e AUT-13).

**ANOTADO**

2. A mesma rota lê TODA a trilha de emissões e todos os ofícios do município a cada chamada, para qualquer papel autenticado (custo O(n) por pedido, sob 300 pedidos por minuto por usuário).
3. O `GET /avisos` ainda escreve dentro de um GET (decisão registrada, F07-E03 e F04-E11); a vigência vale para ele.

## Não verificado

- Navegador: o painel do operador (`Ocorrencia.tsx`, `listarOficios`) e o esconder do menu de ofícios (UX/QA).
- Papéis futuros (default deny para papéis novos é F03-E12 e F03-E14).
- Postgres real: usei PGlite.
- Ofício com abertura registrada: o IP de quem abriu o link só sai na ficha, e a ficha agora é fechada ao agente; não ampliei a prova para o conteúdo do IP.
- Carga do sino em município grande.

## Risco residual

- Achado 1 (menor, exige o código do papel).
- Leitura com token de papel antigo até o vencimento (F03-E03).

## Motivo do humano

Nenhum.
