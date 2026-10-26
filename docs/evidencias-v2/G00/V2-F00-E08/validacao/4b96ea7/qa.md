---
validador: qa
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

Veredito: PASS. Etapa de risco alto: provei por mutação que cada trava morde. Árvore em `24aed19` (difere do candidato só em registro). Saídas em `scratchpad/qa-api/`.

| Critério | Resultado | Evidência |
| --- | --- | --- |
| Ação `consultar_oficio` no shared: operador, coordenador, administrador, não o agente | PASS | `packages/shared/src/permissoes.ts` linhas 93, 105 e 122, comentário do agente; nenhum `if` de papel na rota |
| `GET /oficios` e `GET /oficios/:id` respondem 403 `sem_permissao` ao agente, com ou sem filtro, de ofício da equipe dele, de outra equipe e de id inexistente; a resposta não revela o que existe | PASS | `leitura-do-agente-oficios-e-avisos.test.ts`, 14 casos verdes |
| A permissão vem antes do `idSchema` (id malformado não vira 422 ao agente) | PASS | caso "responde 403 ... de um id que não existe" e leitura de `oficios.ts` (`autorizar` antes de `idSchema.parse`) |
| Operador, coordenador, administrador listam e abrem ofício (200); o sino da coordenação devolve a contagem de sempre | PASS | casos verdes |
| Coordenador do município B abre ofício de A: 404; lista dele não traz o de A | PASS | caso verde |
| `GET /avisos`: agente da Alfa vê só os avisos da Alfa e a contagem `naoLidos` é a do recorte; agente da Bravo o contrário; agente sem equipe: lista vazia e `naoLidos` 0 | PASS | casos verdes (`sino-de-avisos.test.ts`, `leitura-do-agente-...`, `agente-so-ve-a-equipe.test.ts`) |
| `POST /avisos/lidos` não é oráculo: aviso de outra equipe responde `marcados: 0`, nada gravado | PASS | caso verde |
| `GET /avisos` passa pela vigência (conta desativada, papel rebaixado, sessão encerrada, cadeia) | PASS | `get-com-efeito.test.ts` (lista comportamental); mutação abaixo |
| Escrita dentro do GET continua idempotente e só do município do token | PASS | caso "o token do agente também materializa o prazo vencido do município, uma vez só" |
| Painel esconde "Ofícios" de quem não tem a ação | não avaliado (apps/web, outra dimensão) | |

## Evidência

- Arquivos ligados (`leitura-do-agente-oficios-e-avisos`, `orgaos-e-oficio`, `sino-de-avisos`, `agente-so-ve-a-equipe`, `superficie`): 75 de 75 (`09-e08.txt`). `npm run test:api` completo: 1299 de 1299 (`22-test-api-completo.txt`). E2E: 279 de 279, seção 25 ("Agente de campo não lê ofício e o sino dele é o da equipe") verde (`23-e2e-api.txt`).
- Provas de que o teste morde (mutação em `src`, vermelho, `git restore`, árvore limpa conferida):

| Mutação | Resultado |
| --- | --- |
| `oficios.ts` `GET /`: trocar `autorizar(..., "consultar_oficio")` por só `exigirAutenticacao` | 2 vermelhos (agente recebe 200; agente de outro município) (`10-mut-oficios-lista.txt`) |
| `oficios.ts` `GET /:id`: o mesmo | 2 vermelhos (`11-mut-oficios-ficha.txt`) |
| `avisos.ts`: lista sem `eRecorteDoAgente` | 5 vermelhos (os 4 do recorte e o da escrita no GET) (`12-mut-avisos-lista.txt`) |
| `avisos.ts`: contagem de não lidos sem recorte | 2 vermelhos (a contagem denunciaria avisos de outra equipe; agente sem equipe) (`13-mut-avisos-contagem.txt`) |
| `avisos.ts`: tirar `ROTA_GET_COM_EFEITO` | 2 vermelhos (`14-mut-avisos-sem-marca.txt`) |

## Cenários positivos

- Operador, coordenador e administrador listam e abrem ofício, com o conteúdo de sempre; coordenação e administração veem o município inteiro no sino.
- Agente com equipe vê os avisos da própria equipe; marca como lido o que vê.

## Cenários negativos

- Agente em `GET /oficios` e `GET /oficios/:id`: 403 `sem_permissao`, também com token de agente de outro município (a 403 não muda com o município do ofício), e 401 sem token.
- Agente da Bravo não vê nem conta o aviso da ocorrência da Alfa, da ocorrência sem equipe nem do vizinho.
- Municípios: o aviso de outro município nunca aparece em papel nenhum; coordenador de B abre ofício de A: 404.
- Dado sujo: id malformado em `/oficios/:id` com token de agente: pela leitura do código o 403 vem antes do 422 (o teste usa id inexistente, e não executei o id malformado).

## Tentativas de reprovar

1. Procurei rota irmã que ainda devolva ofício ao agente: `GET /oficios/:id/documento` usa `emitir_documento`, que o agente também não tem (shared); `POST` de ofício usa `emitir_documento`/`encaminhar_providencia`. `GET /documentos/validar/:codigo` aceita qualquer papel autenticado e devolve protocolo, id da ocorrência e quem emitiu para um código de ofício; não testei se o código é adivinhável (ver "Não verificado").
2. Tentei oráculo no sino: contagem maior que a lista (coberta por mutação), `POST /avisos/lidos` com id de outra equipe (`marcados: 0`, igual a id de outro município).
3. A vigência no `GET /avisos` com a conta em quatro estados e município suspenso: 403/401 corretos (`06-varredura.*`, `24-suspenso.txt`).
4. Agente sem equipe: lista vazia e `naoLidos` 0 (caso verde).
5. Corpo do 401 cancelado no cliente (`apps/web/src/dados/http.ts`, linha 297): o e2e que travava em `networkidle` passa agora (seção 25 e geometria, sem timeout).
6. A escrita do sino com o token do agente continua só do município do token (caso verde, "materializa o prazo vencido ... uma vez só").

## Achados

**BLOQUEIA:** nenhum.

**CORRIGE ANTES DE CRESCER**

1. `GET /avisos` ainda escreve dentro de um GET (materializa e expurga). A vigência passou a valer nele, mas a escrita em si, por qualquer papel, continua até F07-E03/F04-E11. Registrada em `apps/api/PENDENCIAS.md`. Dono: F07-E03.

**ANOTADO**

2. `GET /documentos/validar/:codigo` não aplica recorte nem permissão por papel (qualquer papel autenticado, inclusive agente, recebe protocolo e quem emitiu se acertar o código). Fora do escopo da E08; verificar na F03-E12.

## Não verificado

- Se o código de `/documentos/validar/:codigo` é adivinhável por um agente (função `codigoDeEmissao`): não li nem tentei força bruta.
- Painel escondendo "Ofícios" para operador e agente (apps/web).
- Postgres real (usei PGlite no `test:api`; o `test:isolamento` do gatekeeper cobre RLS).
- Dados reais do ambiente com muitos avisos (teto e truncamento do cursor).
- Sonda "antes e depois" do Rafael: substituída por mutação e execução.

## Risco residual

- O sino do coordenador, operador e administrador ainda entrega protocolo e tipo de fato de todas as equipes do município (decisão registrada, é a fila de trabalho deles).
- A escrita dentro do GET depende de a F07-E03 tirá-la.

## Motivo do humano

Nenhum.
