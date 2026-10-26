# V2-F02-E04, parte 3C2: rotas de ocorrências, campo e mapa e busca descritas no contrato

## Fatos

**O que mudou (ramo `trab/f02-3c2-contrato-ocorrencias`):**

- `apps/api/src/contrato/grupos/ocorrencias.ts`, `campo.ts` e `mapa-e-busca.ts`: os três grupos agora têm TODAS as rotas com entrada, com `resposta` descrita pelo que o handler devolve e `erros` pelos códigos do catálogo que o handler emite (lidos um a um nos arquivos de rota). `pendentes` dos três é `[]`.
- Esquemas de pedido que eram locais e foram EXPORTADOS (só a palavra `export`, mesmo objeto que o handler aplica, nenhum comportamento, nome de campo, status ou mensagem mudou): `consultaSchema` e `consultaMapaSchema` (`rotas/ocorrencias.ts`), `reconciliacaoSchema` (`rotas/sincronizacao.ts`), `confirmacaoSchema` (`rotas/evidencias.ts`), `pedidoSchema` (`rotas/mapa.ts` e `rotas/rota.ts`) e `consultaSchema` (`rotas/busca.ts`). O pedido de autorização de evidência já era o `pedidoDeEvidenciaSchema` do shared (a rota o usa direto), então o contrato aponta para ele.
- Dois movimentos de código em `rotas/ocorrencias.ts`, sem mudar o que a rota aceita: a query inline de `GET /duplicidades/consulta` virou `consultaDeDuplicidadesSchema` no módulo (exportada), e `providenciaComOrgaoSchema` saiu de dentro de `rotasOcorrencias` para o módulo (exportada, com o comentário junto). O mesmo `z.object`, o mesmo `.extend`.
- Esquemas de RESPOSTA: ficam em cada arquivo de grupo (nada no shared). Várias respostas são a linha do banco como veio (`o.*`, `SELECT *`), então o documento usa os nomes de coluna (`solicitante_nome`, `criado_em`...) e diz isso no cabeçalho do grupo.
- `apps/api/openapi/v1.json` regerado com `npm run openapi --workspace @dc360/api` (cópia em `v1.json` desta pasta). O arquivo foi de 131 KB para 320 KB, porque cada resposta descrita traz o esquema inteiro.
- `apps/api/test/openapi.test.ts`: só as linhas das minhas 10 chaves em `PENDENTES_CONGELADAS` e `TETO_DE_PENDENTES` 40 para 30.
- `apps/api/test/contrato-3c2-respostas.test.ts` (novo, 15 casos): chama as 34 rotas por `inject`, com dados reais do banco em memória, e lê o corpo pelo esquema de resposta do próprio registro. Duas conferências por rota: o status é o descrito (ou o alternativo declarado) e o esquema ACEITA o corpo e devolve algo IGUAL a ele (Zod descarta chave desconhecida, então diferença é campo que a API devolve e o contrato esqueceu). Um caso cobra a cobertura (as 34, nem mais nem menos) e outro que `pendentes` dos três grupos é vazio.
- Contagem: `baseline.mjs` ganhou `"V2-F02-E04-parte-3C2": 15`. README (linhas 14, 1789 e 1791) e `COLOCAR-DE-PE.md` (linhas 41 e 354) ajustados à minha árvore: API 2041 para 2056, `npm test` 4366 para 4381, total com o aplicativo 6376 para 6391. Não mexi no parágrafo do contrato do README (é da 2D e os outros dois pedaços do lote o tocam).

**Contagem antes e depois (de `relatorio-de-rotas-antes.txt` e `relatorio-de-rotas.txt`):**

| | antes | depois |
| --- | --- | --- |
| Rotas sob `/v1` (registradas) | 95 | 95 |
| Com entrada | 55 | 65 |
| Pendentes (sem entrada) | 40 | 30 |
| Entradas existentes sem resposta descrita | 49 | 25 |
| `ocorrencias` (entradas / com resposta / sem / pendentes) | 12 / 0 / 12 / 4 | 16 / 16 / 0 / 0 |
| `campo` | 12 / 0 / 12 / 3 | 15 / 15 / 0 / 0 |
| `mapa-e-busca` | 0 / 0 / 0 / 3 | 3 / 3 / 0 / 0 |

As 10 chaves tiradas de `pendentes` e de `PENDENTES_CONGELADAS`: `GET /v1/ocorrencias`, `GET /v1/ocorrencias/mapa`, `GET /v1/ocorrencias/duplicidades/consulta`, `POST /v1/ocorrencias/:id/providencia`, `POST /v1/sincronizacao/pendencias/reconciliar`, `POST /v1/evidencias/autorizar-envio`, `POST /v1/evidencias/confirmar-envio`, `POST /v1/mapa/resolver-link`, `POST /v1/rota`, `GET /v1/busca`. `TETO_DE_PENDENTES` 40 para 30. As 24 entradas que existiam sem resposta nos meus grupos ganharam resposta (49 menos 24 dá os 25 que sobram, todos das partes 3C1 e 3C3).

**A rota de sincronização, com fidelidade.** `POST /v1/sincronizacao/vistoria` e `/devolucao`, e `POST /v1/saida-a-campo`, respondem 201 na primeira vez e 200 com o mesmo corpo (`duplicada: true`) no reenvio. O teste prova os dois status e que o `vistoriaId` e o `devolucaoId` se repetem. As respostas descritas são `{ vistoriaId, duplicada, foraDaEquipeDesignada }` e `{ devolucaoId, duplicada, status: "triagem" }`. Os erros incluem `acesso_suspenso` (503 na fila do campo, 403 nas demais; é a marca `ROTA_DA_FILA_DO_CAMPO` das três rotas de fila), `autor_divergente`, `data_implausivel`, `evidencia_ja_vinculada`, `evidencia_de_outro_agente`, `relogio_do_aparelho`, `tarefa_no_prazo` e os demais que o handler lança. Nada do comportamento mudou: nenhum arquivo de rota teve linha de lógica alterada.

## Justificativa

- **Esquema de resposta no grupo e não no shared**, como pedido: o aplicativo de campo instalado lê estes corpos e o contrato só os descreve. O teste contra resposta real é o que impede o contrato de mentir.
- **`toEqual(corpo)` depois do `safeParse`** é a conferência que pega campo esquecido. Prova de que ela pega: `saidas/01-falha-antes-mutacao.txt` tira `chave_de_criacao` do esquema da linha de ocorrência e 3 casos falham ("o esquema cortou campo que a API devolve"); sem a mutação, 15 de 15 passam (`saidas/02-contrato-testes.txt`, junto de `openapi.test.ts` e `openapi-regras.test.ts`: 53 de 53).
- **Enum onde o domínio tem lista fechada** (`tipo`, `status`, `severidade`, `canal_entrada`, motivo de devolução, desfecho de saída e de providência): o contrato diz os valores válidos. Os valores que o banco aceita são os mesmos das listas do shared, e o teste exercita os que o fluxo produz.
- **`meu-trabalho` é um objeto só com três chaves opcionais**, porque sem equipe a rota devolve `{ equipe: null, colegas: [], designadas: [], concluidas: [] }` sem os totais, e com equipe devolve tudo. O teste exercita as duas formas.
- **`autorizar-envio` é uma união** (`jaEnviada: true` sem URL, ou `jaEnviada: false` com URL, cabeçalhos, validade e, quando há, `armazenamento`). Também com as duas formas provadas.

## Limites e achados (leia antes de dar PASS)

1. **Um só status de sucesso por entrada.** O registro (`RespostaDoContrato.status`) comporta um status, e três rotas respondem 201 e 200. O contrato declara o 201 e a descrição conta o 200, mas o documento não lista o `200` como resposta. É limite do gerador (`tipos.ts`/`openapi.ts`, que não são meus); sugestão para quem estender: `tambemResponde?: readonly { status; descricao }[]`. Vale também para `POST /v1/ocorrencias`.
2. **O guarda de regras adicionais visita cada esquema uma vez.** `POST /v1/rota` usa o mesmo `pontoSchema` (com `refine` "A coordenada 0,0 não é um lugar.") em `origem` e em `destino`; o `refinamentosDe` de `openapi.ts` usa um `WeakSet` e só anota o primeiro, então `x-regras-adicionais` sai com UMA entrada (`origem`) e a do `destino` não aparece. Não mudei o gerador. Contornei no texto: o `resumo` da rota diz que a coordenada 0,0 não vale na origem nem no destino. Correção própria do gerador: visitar por caminho e não por objeto.
3. **Respostas que são a linha do banco entregam colunas internas.** `GET /v1/ocorrencias` e o dossiê devolvem `organizacao_id` e `chave_de_criacao` (a lista tira só contato, relato, descrição de vulnerabilidade e `busca`), e o dossiê devolve também `busca` (a chave de busca normalizada). O contrato descreve o que sai hoje, sem mudar comportamento. Para a F03 (privacidade) decidir se devem sair.
4. **`npm test` completo, rodada `05-npm-test.txt`** reprovou por: `desfazer-migracao` 5, `guarda-da-semente` 3 e `semear-homologacao` 2 (as falhas de ambiente aceitas, DV-46 e vizinhas); `regras-de-conteudo` "nenhum travessão em texto nenhum" por TIMEOUT de 60 s sob a carga de outros agentes (rodando sozinho passa em 9 s, `saidas/12-regras-de-conteudo.txt`: 9 de 10, a única falha é o EPERM do link simbólico, aceito); e `openapi.test.ts` "sem deriva", porque editei o `resumo` de `/v1/rota` com a rodada em andamento. Regerei o `v1.json` e a API inteira foi rodada de novo em `06-test-api.txt`: 2090 casos, 2054 passam, 34 pulados, 2 falham (`semear-homologacao`, aceitas). Os demais pacotes de `05` (shared, db fora as aceitas, web, campo, console) não mudaram com a correção.
5. **`test:isolamento` (CA-06):** `07-isolamento.txt`, 21 arquivos, 19 passam; as 8 falhas são as aceitas (`desfazer-migracao` 5 e `guarda-da-semente` 3). O arquivo de isolamento passa.
6. **`test:scripts`:** `11-test-scripts.txt` é a rodada em que o `INDEX.md` desta pasta ainda não existia (807 passam, 1 falha, a do índice real); a rodada final com o índice está em `16-test-scripts-final.txt`.
7. **Não rodei `test:e2e:api`** (instrução do lote). **Validação humana pendente da etapa** (a mesma da 2D): abrir `v1.json` num visualizador e conferir algumas rotas.

## Provas (em `saidas/`, e na raiz `v1.json`, `relatorio-de-rotas-antes.txt` e `relatorio-de-rotas.txt`)

`01-falha-antes-mutacao.txt`, `02-contrato-testes.txt`, `04-typecheck.txt` (0), `05-npm-test.txt`, `06-test-api.txt`, `07-isolamento.txt`, `08-lint.txt`, `09-lint-teto.txt` (431, não sobe), `10-formato.txt`, `11-test-scripts.txt`, `12-regras-de-conteudo.txt`, `13-auditar.txt` (0), `14-conferir-numeros.txt`, `15-baseline-test.txt` (29 de 29), `16-test-scripts-final.txt`.

## Para o orquestrador

- **Linha do STATUS sugerida:** `V2-F02-E04 | IMPLEMENTADA (candidato, parte 3C2: ocorrências, campo, mapa e busca) | 34 rotas descritas (16 ocorrências, 15 campo, 3 mapa e busca) com resposta e erros do catálogo; pendentes 40 para 30, teto 30; entradas sem resposta 49 para 25; 15 testes novos que leem a resposta real de cada rota contra o esquema. Falta: 3C1 e 3C3 zerarem os 30 restantes; gerador aceitar mais de um status de sucesso e anotar a regra repetida; validação humana do v1.json.`
- **Dívidas pagas:** nenhuma com código DV.
- **Para quem integra:** (1) `baseline.mjs` ganhou a chave `V2-F02-E04-parte-3C2: 15`; recalcular os totais (README 2056, 4381; `COLOCAR-DE-PE.md` 6391 na minha árvore). (2) Em `openapi.test.ts`, minhas 10 linhas saíram de `PENDENTES_CONGELADAS` e o teto foi de 40 para 30: ao somar as três partes, o teto é 40 menos (10 + as chaves da 3C1 e da 3C3). (3) `v1.json` é derivado: em conflito, `npm run openapi --workspace @dc360/api`, nunca mesclar. (4) `apps/api/PENDENCIAS.md` (itens 1 e 2 da dívida de respostas) ainda fala em 49 sem resposta e 40 pendentes: atualizar na junção; e acrescentar os achados 1 a 3 acima. (5) Meus arquivos de rota só ganharam `export` (e os dois movimentos descritos): a 3C1 e a 3C3 tocam outros arquivos de `rotas/`, mas qualquer uma que exporte `consultaSchema` de `avisos.ts` ou `pedidoSchema` de outro arquivo importa com apelido, como faço em `mapa-e-busca.ts`.
- **Pendências humanas:** abrir `v1.json` num visualizador e conferir três rotas, em especial `POST /v1/sincronizacao/vistoria`. Nenhuma ação em Fly, Vercel, Supabase ou GitHub.
