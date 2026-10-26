---
validador: qa
modelo: claude-sonnet-5-5
etapa: V2-F00-E11
sha_validado: 4b96ea7
ci_run: 38445527075
rodada: 2
herdado_de:
tags: [API, TENANT, DADO_PESSOAL, EXPORTACAO]
nivel_de_prova_exigido: [E1, E2]
nivel_de_prova_obtido: [E1, E2]
veredito: PASS
confianca: alta
humano_necessario: nao
escalar: nenhum
---
## Critérios verificados

Veredito: PASS na dimensão QA/API. O botão no painel (revogar URL depois do download, frase de erro na tela, Firefox) é da dimensão do painel. Árvore em `24aed19` (difere do candidato só em registro). Saídas em `scratchpad/qa-api/`.

| Critério | Resultado | Evidência |
| --- | --- | --- |
| `POST /saida/pacote.zip` ponta a ponta com o administrador do município | PASS | probe própria: 200, `application/zip`, `Content-Disposition: attachment; filename="saida-serra-alta-mg-AAAA-MM-DD.zip"`, `cache-control: no-store`, bytes começam por `PK`, 237254 bytes, 110 entradas, `tabelas/ocorrencias.csv` e 3 arquivos em `documentos/` (2 laudos e 1 termo) (`16-pacote.positivo.json`) |
| `POST /pacote.zip` na raiz, `GET`/`HEAD`/`PUT /saida/pacote.zip`: 404 | PASS | `16-pacote.negativos.json`: 404 nos quatro |
| Só administrador: coordenador, operador e agente de campo | PASS | 403 `sem_permissao` nos três |
| Sem token e token lixo | PASS | 401 e 401 |
| Município suspenso | PASS | 403 `acesso_suspenso` (`16-pacote.vigencia.json`) |
| Administrador com conta desativada | PASS | 403 `conta_desativada` |
| Isolamento: pacote de A não leva nada de B e vice-versa | PASS | ver tentativas 1 e 2 |
| A organização vem só do token | PASS | `?organizacaoId=B&org=B` e cabeçalho `X-Organizacao-Id: B` com o token de A devolvem o pacote de A (mesmos nomes, mesmos dados) |
| Segredos não saem (hash de senha, token, ficha de notificação) | PASS | nenhum `scrypt$` no conteúdo dos dois pacotes; teste "nem hash de senha, nem token..." verde |
| Ato fica registrado (trilha e `exportacoes`) antes do primeiro byte | PASS | `exportacoes`: 3 linhas em A e 1 em B nas minhas chamadas; teste "deixa trilha, registra a exportação e NÃO apaga nada" verde |
| `contrato painel x API` aponta `/saida/pacote.zip` | PASS | E23 |

## Evidência

- `npx vitest run test/saida-de-municipio.test.ts test/pacote-de-saida-contrato.test.ts test/saida-nao-declara-inexistente.test.ts test/contrato-do-painel.test.ts`: 59 de 59 (`15-e11-e12-e23.txt`). `npm run test:api` completo 1299 de 1299 (`22-test-api-completo.txt`).
- `node scripts/e2e-api.mjs` (Chromium): 279 de 279, seção 28 ("Baixar o pacote de saída pelo painel, contra a API real") verde, zero erro de console (`23-e2e-api.txt`).
- Probe própria em PGlite com o servidor real, semente de Serra Alta e Vale Fundo (promovi o coordenador de Vale Fundo a administrador por `UPDATE` só para o teste): `scratchpad/qa-api/sondas-temporarias/zz-qa-pacote.test.ts`.

## Cenários positivos

- Administrador de A baixa o pacote de A: 200, 110 entradas, índice, `LEIA-ME.txt`, esquema, tabelas CSV e JSON, evidências, documentos.
- Administrador de B baixa o de B: 200, 107 entradas.
- Duas extrações concorrentes (dois cliques) com o mesmo token: 200 e 200, mesmo tamanho. O total de linhas em `exportacoes` ao fim da probe (6) é coerente com os pedidos que tiveram sucesso (A: 3 na primeira passada e 2 no fim, B: 1).

## Cenários negativos

- Coordenador (`helena`), operador (`jonas`) e agente (`diego`): 403 `sem_permissao`.
- Método e caminho errados: 404.
- Conta desativada, município suspenso, token adulterado: 403 `conta_desativada`, 403 `acesso_suspenso`, 401 `nao_autenticado`.

## Tentativas de reprovar

1. Isolamento de dados: comparei o texto de todos os arquivos do pacote de A com marcas do município B (`valefundo`, `Vale Fundo`, `VF-0101`, `Aurélio`, `Equipe Única`) e o contrário. Os protocolos que só existem em B não aparecem no CSV de A (0 de 2) e os de A não aparecem no CSV de B (0 de 8). A única ocorrência de "Vale Fundo" no pacote de A está em 7 comentários dos arquivos `esquema/*.sql` (texto das migrações, não dado); idem "Serra Alta" no de B. Nenhum nome de pessoa, e-mail ou matrícula do outro município.
2. Tentei trocar o município por parâmetro de rota, query e cabeçalho (`organizacaoId`, `org`, `X-Organizacao-Id`): o pacote é sempre o do token.
3. Tentei pedir como papel abaixo do administrador, como conta desativada e com sessão do município suspenso: todos negados com o código do catálogo.
4. Dois cliques/extrações concorrentes: sem erro, sem pacote truncado (tamanhos iguais).
5. Procurei o defeito original (`/pacote.zip` sem prefixo): a rota na raiz responde 404, e o contrato painel x API (E23) reprova a chamada (mutação na E23).
6. Procurei segredo no pacote: nenhum `scrypt$` (hash de senha) no conteúdo textual dos dois pacotes; os nomes das colunas de token e de ficha de notificação não procurei por conta própria, confio no teste "nem hash de senha, nem token de sessão, nem ficha de notificação" (verde).

## Achados

**BLOQUEIA:** nenhum.

**ANOTADO**

1. O diretório `esquema/` do pacote traz as migrações com comentários que citam nomes de municípios fictícios de exemplo (Serra Alta, Vale Fundo) e, por isso, o pacote de um município real leva texto sobre "outro município" de exemplo. Sem dado pessoal. Dono: E11 ou F09, se o texto for revisado.

## Não verificado

- Firefox no e2e (o roteiro do repositório roda Chromium; a evidência do implementador cita Firefox pela seção 28 aparada).
- Pacote com volumes grandes (ZIP64, memória): o teste do escritor exercita ZIP64 com o teto rebaixado; o pacote inteiro é montado em memória (F07-E06 trata isso).
- Retomada de download interrompido e o comportamento do botão com 401 no meio (apps/web, outra dimensão).
- Postgres real: PGlite no `test:api`; a RLS do gatekeeper (`test:isolamento`) cobre as tabelas lidas.
- Qualquer conteúdo de dado pessoal real: a prova usa só a semente sintética, como o bloco manda.

## Risco residual

- O pacote real traz dado pessoal e vulnerabilidade social em um arquivo só; o controle é o papel administrador mais o registro em `exportacoes` e na trilha.
- Extrações simultâneas de municípios grandes podem pressionar a memória (F07-E06).

## Motivo do humano

Nenhum. O ZIP aberto pelo Rafael que o bloco previa foi substituído por leitura independente do diretório central (`ler-zip.ts`) e por uma busca de marcas do outro município.
