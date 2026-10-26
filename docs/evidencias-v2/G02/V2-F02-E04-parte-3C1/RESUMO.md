# V2-F02-E04, parte 3C1: rotas de autenticação, conta e administração descritas no contrato

## Fatos

**O que mudou (tudo em `dc360/apps/api`; nenhuma rota, status, campo ou mensagem mudou):**

- `src/contrato/grupos/autenticacao.ts`, `conta.ts` e `administracao.ts`: os três grupos agora têm `pendentes: []`. As 18 rotas que estavam pendentes viraram entradas com `corpo`/`consulta`/`parametros` (os esquemas que o handler aplica), `resposta` descrita e `erros` do catálogo. As 14 entradas que existiam sem resposta (administracao 10, autenticacao 2, conta 2) ganharam `resposta` pelo que o handler devolve. Nenhum `esquema` de resposta foi copiado do shared (não há resposta no shared): os de RESPOSTA moram no próprio grupo.
- `src/rotas/autenticacao.ts`, `segundo-fator.ts`, `usuarios-eu.ts`, `aparelhos.ts`, `avisos.ts`, `administracao.ts`: SÓ `export` na frente do esquema que era local (`entradaSchema`, `segundoFatorSchema`, `renovacaoSchema`, `saidaSchema`, `recuperacaoSchema`, `redefinicaoSchema`, `trocaSchema`; `codigoSchema`, `desativacaoSchema`, `inicioSchema`; `pedidoSchema`, `confirmacaoSchema`; `registroSchema`, `revogacaoSchema`; `consultaSchema`, `leituraSchema`; `retencaoSchema`). Uma única extração: o `z.object({ ativo: z.boolean() })` que estava inline em `PATCH /usuarios/:id/situacao` virou `situacaoSchema` exportado (mesma forma, mesmo uso). Comportamento, nomes de campo, status e mensagens intactos.
- `openapi/v1.json`: regerado por `npm run openapi --workspace @dc360/api`, nunca à mão.
- `test/openapi.test.ts`: tirei as 18 chaves de `PENDENTES_CONGELADAS` e baixei `TETO_DE_PENDENTES` de 40 para 22. Uma linha a mais, inevitável: o caso "operação sem resposta descrita se declara pendente" usava `GET /v1/equipes` (agora com resposta) como exemplo de rota sem resposta; passou a usar uma rota sintética, para não depender de quais rotas reais ainda estão sem resposta (as 3C2 e 3C3 vão zerar o resto).

**Contagem antes e depois (de `saidas/01-relatorio-antes.txt` e `saidas/02-relatorio-depois.txt`):**

| | antes | depois |
| --- | --- | --- |
| Rotas com entrada | 55 | 73 |
| Rotas pendentes | 40 | 22 |
| Total sob /v1 | 95 | 95 |
| Entradas existentes sem resposta | 49 | 35 |

Por grupo (entradas / com resposta / sem resposta / pendentes):

| Grupo | antes | depois |
| --- | --- | --- |
| administracao | 10 / 0 / 10 / 2 | 12 / 12 / 0 / 0 |
| autenticacao | 5 / 3 / 2 / 10 | 15 / 15 / 0 / 0 |
| conta | 4 / 2 / 2 / 6 | 10 / 10 / 0 / 0 |

Os 22 pendentes e as 35 sem resposta que sobram são todos de `ocorrencias`, `campo`, `mapa-e-busca`, `documentos`, `oficios-e-orgaos` e `prestacao-de-contas` (3C2 e 3C3).

**Os esquemas de resposta criados (todos em `grupos/`, fiéis ao handler):** sessão (`Autenticado`: `acesso`, `renovacao`, `expiraEm` em segundos, `usuario` com matrícula e município, e os três campos opcionais que só aparecem na segunda etapa e na senha provisória), desafio de entrada, sessão da conta, situação do segundo fator, aviso do sino e resposta do sino, linhas de equipe e de usuário, retenção. `POST /auth/entrar` descreve a união sessão ou desafio. `POST /segundo-fator/iniciar` tem `corpo` opcional (`inicioSchema.optional()`), porque o handler lê `req.body ?? {}`; o documento sai com `required: false`. Os campos de `GET /equipes` e `GET /usuarios` são os nomes de coluna em snake (`em_atendimento`, `equipe_id`, `ultimo_acesso`, `equipe_nome`), como a API devolve hoje.

**Testes novos (15, todos passam):**

- `test/contrato-auth-respostas.test.ts` (7): recuperação ligada, entrar/eu/sessões/renovar/sair, trocar senha e encerrar sessões, recuperar e redefinir (com o link capturado do notificador), situação do segundo fator, iniciar com e sem corpo e confirmar e segunda etapa do login com código de recuperação e desativar, e o administrador ligando pelo desafio de ativação (a sessão volta dentro de `confirmar`).
- `test/contrato-conta-administracao-respostas.test.ts` (8): os três grupos sem pendente nem sem resposta, e cada rota de `administracao` e `conta` chamada por `inject` (o ciclo da foto inclui o envio dos bytes, o aparelho confere que a ficha não volta, o sino semeia um aviso pelo banco).
- Cada caso valida o corpo enviado com o MESMO esquema do contrato (`corpo`), confere o status descrito e passa o corpo recebido no esquema da `resposta`. Mutação feita à mão: trocar `em_atendimento` por `emAtendimento` e `ate` de `string` para `number` reprovou 2 casos; revertida.

**Portões (números; todos em `saidas/`):**

- `typecheck` 0 (`04`); `lint` OK nos dois (`06`); `lint:teto` 431, não sobe (`07`); `formato:conferir` OK, 836 arquivos (`08`); `conferir:numeros` OK (`09`; o `09-...-antes-dos-totais.txt` é a rodada que pediu os totais novos); `auditar` código 0 (`12`); `baseline.test.mjs` verde (`13`).
- API isolada (`05b`): 2090 casos, 2054 passam, 34 pulados, 2 falham (`semear-homologacao`, aceitos). Antes da parte: 2075. Mais 15.
- `npm test` completo (`05`): a rodada rodou na máquina carregada por outros agentes e 4 arquivos da API reprovaram por tempo/carga (`api.test.ts` 1 caso, `codigos-de-erro.test.ts` 1, `segundo-fator.test.ts` 1, `versao-v1.test.ts` falha na suíte com `erro_interno` no login de preparação), nenhum deles tocado por esta parte; reexecutados juntos em `05c`: 4 arquivos, 335 casos, todos passam. As falhas de ambiente aceitas aparecem no `05` e no `03`: `desfazer-migracao` 5, `guarda-da-semente` 3, `semear-homologacao` 2, `regras-de-conteudo` 1 (EPERM).
- `test:isolamento` (`03`): só as 8 falhas de ambiente (`desfazer-migracao` 5 e `guarda-da-semente` 3). `regras-de-conteudo` (`11`): 9 de 10, a falha é o EPERM do link simbólico (DV-46).
- `test:scripts` (`10`): ver a nota abaixo.
- Não rodei `test:e2e:api` (o CI cobre).

**Contagem:** `baseline.mjs` ganhou só a chave `"V2-F02-E04-parte-3C1": 15`. README e `COLOCAR-DE-PE.md` ajustados à minha árvore: API 2041 para 2056, `npm test` 4366 para 4381, total com o aplicativo 6376 para 6391 (só os números; nenhum parágrafo).

## Justificativa

- **Por que exportei o esquema em vez de copiar:** a regra do registro é uma fonte só. Cada `corpo` do contrato é o objeto que o handler chama `.parse` (a mesma referência), então não há como o contrato descrever uma coisa e a rota aplicar outra.
- **Por que as respostas ficam no grupo e não no shared:** o shared guarda regra de negócio compartilhada entre as pontas; nada ali descreve a sessão, o sino ou a retenção. Os esquemas são do contrato da API, e o teste de resposta real é o que os mantém fiéis.
- **`erros` seguem o handler:** código a código, lido no handler e no serviço que ele chama (`auth/servico.ts`, `auth/segundo-fator.ts`, `armazenamento`, `auth/suspensao.ts`). Rotas atrás do limite de entrada levam `excesso_de_requisicoes`; rotas públicas não levam `nao_autenticado`; `sair` só leva `dados_invalidos` (a rota não distingue token). Nas entradas que eu já estava descrevendo em `administracao`, completei também `nao_encontrado`/`nao_encontrada`, `posto_insuficiente`, `nome_repetido`, `usuario_repetido` e os demais que o handler lança, porque o handler já estava aberto e a lista antiga só tinha os códigos da forma da rota.
- **`tipo` do aviso é `z.string()`:** o vocabulário mora no CHECK do banco (migrações 018 e 031), que pode crescer; um `enum` aqui seria uma cópia que envelhece.
- **Datas são `z.string()`:** o handler devolve o `Date`/texto do driver, que a serialização JSON entrega como texto ISO; `z.string()` descreve o que chega.
- **Sem mudança no gerador, em `servidor.ts`, `config.ts`, `rotas.ts`, `tipos.ts` ou `openapi.ts`.**

## Limites declarados (leia antes de dar PASS)

- **`test:scripts`:** o `INDEX.md` desta evidência só passa a existir depois das saídas; a rodada `10-test-scripts.txt` é a refeita com ele presente (ver o fim desta lista). A rodada bruta tem 1 falha por falta de `INDEX.md`, como na 2D.
- **Ambiente Windows, só as falhas aceitas:** ver acima.
- **Os esquemas de resposta são conferidos por UMA resposta real de cada rota** (o desfecho de sucesso). Os caminhos de erro dependem de `erros`, que a E05 confere no servidor real; aqui só cobrem o catálogo por tipo. Dois desfechos de sucesso que o teste não alcança por exigirem infraestrutura: `POST /auth/entrar` com `trocaDeSenhaObrigatoria` é alcançado indiretamente (a senha temporária de `redefinir-senha` entra e o teste lê o campo), mas sem passar pelo esquema do contrato; e o 503 de `push_android_desligado` não é chamado.
- **A conferência de OpenAPI continua estrutural** (sem validador externo, como na 2D); Rafael ainda precisa abrir `v1.json` num visualizador e conferir três rotas.
- **Arquivos fora desta parte que ficaram desatualizados e o integrador reescreve:** o parágrafo do README sobre o contrato e a seção 2 de `apps/api/PENDENCIAS.md` ("Quarenta rotas registradas ainda não têm entrada") citam a contagem da 2D. Não os toquei, porque as 3C2 e 3C3 mexem na mesma contagem.

## Provas (em `saidas/`, e na raiz `v1.json` e `relatorio-de-rotas.txt`)

`01-relatorio-antes.txt`, `02-relatorio-depois.txt`, `03-isolamento.txt`, `04-typecheck.txt`, `05-npm-test.txt`, `05b-test-api.txt`, `05c-reexecucao-dos-arquivos-que-falharam-sob-carga.txt`, `06-lint.txt`, `07-lint-teto.txt`, `08-formato.txt`, `09-conferir-numeros.txt`, `09-conferir-numeros-antes-dos-totais.txt`, `10-test-scripts.txt`, `11-regras-de-conteudo.txt`, `12-auditar.txt`, `13-baseline-test.txt`.

## Para o orquestrador

- **Linha do STATUS sugerida:** `V2-F02-E04 | IMPLEMENTADA (candidato, parte 3C1: autenticação, conta e administração) | 18 rotas descritas e 14 respostas completadas nos grupos autenticacao, conta e administracao (esquemas de entrada exportados das rotas, respostas fiéis ao handler no próprio grupo, erros do catálogo), pendentes de 40 para 22, sem resposta de 49 para 35, v1.json regerado. +15 testes de API (resposta real por inject contra o esquema). Faltam 3C2 e 3C3 para zerar pendentes e respostas.`
- **Dívidas pagas:** nenhuma de `dividas.md`.
- **Pendências humanas:** nenhuma nova (Rafael abrir `v1.json` e conferir três rotas, já registrado na 2D).
- **Para quem integra (3C1 + 3C2 + 3C3):**
  1. `openapi.test.ts`: `PENDENTES_CONGELADAS` perde as 18 chaves desta parte (a lista que sobra tem 22) e `TETO_DE_PENDENTES` vai de 40 para 22 nesta árvore; somando as três partes o número final é 0. O caso "operação sem resposta descrita se declara pendente" agora usa rota sintética: se a 3C2 ou a 3C3 mexer nele, é o mesmo trecho.
  2. `baseline.mjs` ganhou só `"V2-F02-E04-parte-3C1": 15` no fim de `MUDANCAS_DO_TESTE_API_POR_ETAPA`. Totais do README e do `COLOCAR-DE-PE.md` na minha árvore: 2056, 4381 e 6391; recalcular na junção.
  3. `v1.json` é derivado: em conflito, `npm run openapi --workspace @dc360/api`, nunca mesclar.
  4. Atualizar, depois das três partes, o parágrafo do README e a seção 2 de `apps/api/PENDENCIAS.md` que citam "quarenta rotas".
- **Para o lote 3 (3C2 e 3C3):** o padrão que usei: exportar o esquema da rota (só `export`), importar no grupo com alias quando o nome colide, descrever a `resposta` no grupo e conferir por `inject` contra ela. Corpo que o handler lê como `req.body ?? {}` entra como `esquema.optional()`.
