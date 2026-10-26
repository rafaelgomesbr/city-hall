---
validador: red-team
modelo: claude-opus-5-5
etapa: V2-F00-E04
sha_validado: 1ed0b71
ci_run: ausente
rodada: 6
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

Ambiente: PostgreSQL 17.6 real (`SCRATCH/pg17`), porta 55931 só em 127.0.0.1, API em processo sobre `bancoPostgres` real, `DC360_POSTGRES_DE_PROVA` apontando para o cluster. Node v24.15.0. Cluster derrubado no fim.

- Vigência na escrita (conta desativada, papel rebaixado, sessão encerrada) e, o que a etapa acrescenta, nos GET e HEAD COM EFEITO (laudo, termo de interdição e desinterdição, PDFs, CSV, sino): `get-com-efeito.test.ts` verde, 10 de 10, com as quatro sondas (conta desativada, papel rebaixado, sessão encerrada por quem administra, cadeia encerrada depois da renovação) contra cada rota em GET e HEAD, exigindo a mesma recusa que um POST e nada gravado.
- `vigencia-na-escrita.test.ts` e `acesso-suspenso.test.ts` verdes (município suspenso: GET com efeito e token vivo respondem a suspensão, 403; fila responde 503).
- Isolamento preservado: `test:isolamento` não rodado aqui, mas a sonda de E07 confirma 404 cruzando município.

## Evidência

- Execução de 16 arquivos (inclui `get-com-efeito`, `vigencia-na-escrita`, `acesso-suspenso`) em Postgres real: código 0, 447 de 447, 0 pulado (`SCRATCH/validadores/red-team/saidas/00-testes-do-repo-no-sha.txt`).
- Prova de que morde: mutação em `servidor.ts` tirando `comEfeito` da decisão de escrita; `get-com-efeito.test.ts` reprova 5 de 10 (as quatro sondas e a lista comportamental) (`saidas/40-e04-mutacao.txt`). Arquivo restaurado (`git diff` vazio).

## Cenários positivos

- Conta vigente emite o termo (interdita e grava) e exporta o CSV (controle do `get-com-efeito`, verde).

## Cenários negativos

- Conta desativada, papel rebaixado, sessão encerrada e cadeia encerrada após renovação: GET e HEAD de laudo, termos, PDFs e CSV respondem como um POST do mesmo token (403/401) e não gravam `documento_emitido`, `ocorrencia_consultas`, `exportacoes` nem `interditada_em`.
- A lista `COM_EFEITO`: com a conta desativada, o conjunto de GET que responde `conta_desativada` é exatamente a lista, nem mais nem menos.

## Tentativas de reprovar

- Desliguei a metade `comEfeito` da decisão de escrita: as sondas voltaram a passar os GET sem conferir vigência (5 reprovados), confirmando que o teste morde.
- Procurei GET que escreve e não está marcado pela lista comportamental do teste: a varredura do fonte do repositório cobre isso e está verde.

## Achados

- Anotado (lido na documentação do implementador, não é defeito): dossiê e busca (`GET /ocorrencias/:id`, `GET /busca`) continuam fora da vigência por decisão registrada; só gravam o registro da própria leitura. Fecha na F03-E03.

## Não verificado

- Vigência em leitura pura: fora do escopo (F03-E03); conta desativada ainda lê até o token vencer.
- `test:e2e:api` completo (cai na seção 13, E18) e o run do CI do SHA (ausente, H32).
- A janela de milissegundos entre a conferência de conta ativa e o INSERT (achado "corrige antes de crescer" da rodada 4): não remedido nesta etapa por decisão de escopo; permanece como risco residual anotado.

## Risco residual

Baixo para o critério escrito. Persiste a janela de disputa entre a conferência da vigência e a escrita (confirmada em rodadas anteriores), apontada para a F03-E03; não viola o critério "responde no pedido seguinte".

## Motivo do humano

Não se aplica: tudo o que esta dimensão exige foi executado localmente.
