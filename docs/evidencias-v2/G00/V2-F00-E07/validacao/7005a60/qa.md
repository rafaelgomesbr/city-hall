---
validador: qa
modelo: claude-sonnet-5-5
etapa: V2-F00-E07
sha_validado: 7005a60cd70b30a4f455a96a64c4d7a3abb2819f
ci_run: 37739535524
rodada: 1
herdado_de:
tags: [UI, A11Y, AUTH, TENANT, RLS, DB, MIGRATION, API]
nivel_de_prova_exigido: [E1, E2]
nivel_de_prova_obtido: [E1, E2]
veredito: FAIL
confianca: alta
humano_necessario: nao
escalar: nenhum
---
## Critérios verificados

Todos os comandos rodaram em `dc360/`, depois de `npm run build:shared` (saída 0). Saídas brutas no scratchpad da sessão (`build.txt`, `t1.txt`, `api-full.txt`, `isol.txt`, `mig-*.txt`, `sonda-api*.txt`).

1. **Cadeia rotacionada morre com a sessão** (administrador, própria pessoa, sair, reuso, troca de senha): PASS nas escritas. `familia-da-sessao.test.ts` 20 de 20. Mutação feita por mim (trocar `AND v.revogada_em IS NULL` por `AND TRUE` em `vigencia.ts`): 7 casos de cadeia reprovam; restaurado. FAIL na superfície GET com efeito, ver achado 1.
2. **Papel alterado se renova**: PASS nas escritas por POST. Token velho de coordenador rebaixado: 401 `nao_autenticado`; `/auth/renovar` devolve token do papel novo; despacho com o token novo responde 403 `sem_permissao`. Mutação (trocar o código para `sessao_encerrada`): 2 testes reprovam. FAIL via GET com efeito, ver achado 1.
3. **Senha provisória vencida nem escreve nem se troca nem renova**: PASS. Sonda S6: escrever, trocar, renovar respondem 401 `sessao_encerrada`; entrar responde 401 `senha_provisoria_vencida`. Trocar com a senha atual ERRADA e provisória vencida também responde `sessao_encerrada` (não vaza nada). Mutação (desligar o teste de prazo em `trocarSenha`): o caso "pelo SERVIÇO" reprova; restaurado. `senha-provisoria.test.ts` verde (incluindo a linha 183).
4. **Migration 047 do zero e sobre banco existente**: PASS. Cluster Postgres 18.3 descartável (porta 5599, apagado no fim). Do zero: `npm run migrar` aplicou 001 a 047, `--conferir` saiu 0 "Esquema em dia". Banco existente (até 046, com 2 sessões do município A, uma delas rotacionada, e 1 do B): `--conferir` saiu 1 antes, `migrar` aplicou só a 047, `--conferir` saiu 0 depois; as 3 sessões ficaram com `familia_id = id`; 27 funções `SECURITY DEFINER` (teto); uma só `abrir_sessao`, com 7 argumentos.
5. **`abrir_sessao` não deixa herdar família alheia**, como `dc360_app` em Postgres real: família de outro município, família de outro usuário (no mesmo município e no cruzado) e família inexistente recebem o mesmo erro `DC369`, e nenhuma linha é gravada. Login abre família nova; renovação herda.
6. **Regressão do bloco**: `npm run test:api` 97 arquivos, 1267 testes passados, 0 falhas, saída 0. `npm run test:isolamento` 12 arquivos, 327 passados, 3 pulados, saída 0; os 3 pulados são `it.runIf(comTrigramas)` de `busca.test.ts` (ambiente sem `pg_trgm`, nada a ver com a E07). `npm run test:console` 259 de 259. "desativar usuário derruba as sessões" está dentro do `test:api` verde.

## Evidência

- `npm run build:shared`: saída 0.
- `npx vitest run --root apps/api test/familia-da-sessao.test.ts test/senha-provisoria.test.ts test/vigencia-na-escrita.test.ts test/codigos-de-erro.test.ts`: saída 0, 56 de 56.
- `npm run test:api`, `npm run test:isolamento`, `npm run test:console`: saída 0 (números acima).
- `npm run migrar` e `npm run migrar -- --conferir` com `DATABASE_URL` no cluster descartável (banco do zero e banco existente): saídas conforme o item 4.
- Sondas por mim em arquivo temporário de teste (`apps/api/test/zz-qa-e07-sonda.test.ts`), já removido; a saída está em `sonda-api.txt`, `sonda-api2.txt`, `sonda-api3.txt`.
- Não rodei `npm run test:e2e:api`. Não conferi o run do CI (sem acesso a `gh` nesta sessão); aceito o dado do gatekeeper como alegação.

## Cenários positivos

- Renovação normal: o token antigo e o novo escrevem (200 nos dois).
- Várias rotações: os 3 tokens da cadeia escrevem.
- Provisória no prazo: troca a senha; senha comum continua trocando.
- Papel rebaixado, depois de renovar: ação do papel novo passa (abrir ocorrência 201).

## Cenários negativos

- Administrador encerra sessões, depois escrever com o token PRÉ-renovação: 401 `sessao_encerrada`. Idem com sair, reuso de refresh e troca de senha em outra sessão. Idem com reset de senha por administrador (sonda S4: os dois tokens, 401).
- Coordenador de A rebaixado: token antigo não despacha; B não vê A e A não vê B (404), coberto pelos testes e conferido nas 20 asserções.
- `abrir_sessao` com família de outro município ou usuário: recusa igual (item 5).
- Provisória vencida: escrever, trocar e renovar recusam (item 3).

## Tentativas de reprovar

- Corrida de dois `renovar` simultâneos com o mesmo refresh (S1): um 200 e um 401; o 401 aciona a detecção de reuso e derruba a cadeia inteira (0 sessões vivas). Comportamento herdado (reuso), não regressão da E07; anotado.
- "Encerrar minhas outras sessões" chamado com o token ANTERIOR à renovação (S2): a API responde 200 "Esta continua aberta", mas a cadeia própria cai e os dois tokens passam a responder 401. Achado 2.
- Leitura com cadeia encerrada, após reset por administrador (S4): `GET /ocorrencias` e `GET /usuarios` respondem 200. Está dentro de "O que NÃO deve ser implementado" (vigência em leituras, F03-E03); só registro.
- Leitura com papel rebaixado (S5): `GET /usuarios` com token de coordenador de quem virou operador responde 200. Mesmo enquadramento (F03).
- GET com efeito em rota do domínio da etapa: achado 1.
- Corrompi a vigência por mutação em três pontos (cadeia, papel, provisória): os testes reprovam em cada um e voltam a passar com `git restore`.

## Achados

### 1. BLOQUEIA (herdado da E04, mas anula critérios da E07): GET com efeito escapa da vigência, inclusive da cadeia encerrada e do papel rebaixado

`servidor.ts:478` classifica "escrita" por método (`req.method !== "GET" && !== "HEAD"`), então `lerVigencia` e `exigirVigencia` nunca rodam em `GET /documentos/:id/termo-de-interdicao` (e `/laudo`, `/termo-de-desinterdicao`, `.pdf`), que gravam `documento_emitido` e interditam. Não está em `PENDENCIAS.md` (só `GET /avisos` está).

Reprodução, API em memória semeada (dados do `familia-da-sessao.test.ts`):
- a) Helena entra, renova, a administradora encerra as sessões dela (`POST /usuarios/:id/encerrar-sessoes`). Com o token pré-renovação, `POST .../coordenada` responde 401 `sessao_encerrada`; já `GET /documentos/<000474/2026>/termo-de-interdicao` responde 200 e `trilha_eventos` passa de `documento_emitido=1` para `documento_emitido=2`. Saída em `sonda-api3.txt`, linha "G2a".
- b) Helena entra, o banco passa a papel `operador`. Token velho: `GET .../termo-de-interdicao` de `000473/2026` responde 200. Token novo (operador): 403 `sem_permissao`. Linha "G2b".

Efeito: o token de quem foi rebaixado ou derrubado ainda emite, e interdita, com o papel antigo por até 15 minutos. É exatamente o que a E07 diz fechar ("o token velho não escreve com o papel antigo"). A correção é em `servidor.ts` (classificar por efeito, não por método; ou declarar a rota como escrita) e fecha E04 e E07 de uma vez. Não consigo aprovar enquanto a pendência estiver não declarada e aberta.

### 2. CORRIGE ANTES DE CRESCER: "Encerrar minhas outras sessões" feito com token pré-renovação derruba a própria cadeia

Reprodução: entrar, renovar (token `novo`), chamar `POST /auth/encerrar-sessoes` com o token ANTIGO. Resposta 200 "Esta continua aberta"; depois `escrever(antigo)` e `escrever(novo)` dão 401. Causa: `preservarSessaoId = identidade.sessaoId` é a sessão rotacionada (já revogada), então o `UPDATE ... id <> $3` revoga a sessão viva da mesma cadeia. A mensagem mente. Dono: `auth/servico.ts` (`encerrarMinhasSessoes`), preservar pela família. Sem teste de regressão no SHA.

### 3. ANOTADO

- `abrir_sessao` (SECURITY DEFINER) lê `sessoes` na checagem da família, o que só funciona porque o dono das tabelas tem BYPASSRLS, como as demais funções da 002; consistente com o projeto, vale um teste de dono sem BYPASSRLS se um dia mudar.
- Renovação duplicada simultânea derruba a sessão (reuso); herdado.
- `RESUMO.md` afirma "1 falha, 13 pulados" no `test:api`; no SHA validado deu 0 falhas e 0 pulados. Número desatualizado, não defeito.

## Não verificado

- `npm run test:e2e:api` e a seção 24 do `fluxo-api.e2e.mjs` (o próprio RESUMO diz que o roteiro cai na seção 13, pré-existente da E18).
- E2E do painel (rebaixar coordenador logado) e as 8 capturas: não abri nem reproduzi; não há UI nova de texto, só a renovação silenciosa em `apps/web`. Não rodei os testes do `apps/web` nem do `apps/campo`.
- Postgres 17 e Linux: só o CI. Não li o run 37739535524; os jobs `restore` e `baseline` ficam por conta do gatekeeper.
- A suíte da API roda em PGlite; no Postgres real exercitei só migrations e a função `abrir_sessao`, mais a consulta de vigência indiretamente. Não rodei a API inteira contra Postgres real.
- Dono sem BYPASSRLS (produção Supabase): não testado.

## Risco residual

- GET com efeito sem vigência (achado 1) vale para qualquer rota que escreva dentro de GET, não só a de documentos; a lista completa não foi levantada por mim.
- Leitura continua confiando no token por 15 minutos até a F03-E03 (declarado).

## Motivo do humano
Não se aplica.
