---
validador: qa
modelo: claude-sonnet-5-5
etapa: V2-F00-E22
sha_validado: 7005a60cd70b30a4f455a96a64c4d7a3abb2819f
ci_run: 37739535524
rodada: 1
herdado_de:
tags: [DB]
nivel_de_prova_exigido: [E1, E2]
nivel_de_prova_obtido: [E1, E2]
veredito: FAIL
confianca: alta
humano_necessario: sim
escalar: nenhum
---
## Critérios verificados

Conferi a tabela antes e depois de `docs/evidencias-v2/G00/V2-F00-E22/RESUMO.md` contra o código de hoje.

| # | Item | Resultado |
| --- | --- | --- |
| 1 | README: números e `conferir:numeros` | PASS: `npm run conferir:numeros` saída 0, 24 afirmações, "Todos os números da documentação batem". |
| 1 | README: `npm audit` e `expo-doctor` | FAIL: restos falsos depois da E19 (achado 2). |
| 1 | README:130 token sem ida ao banco | PARCIAL: corrigido, mas só cita `GET /avisos` como leitura que escapa (achado 1). |
| 1 | README: console tem rota de escrita, mesmo Postgres | PASS: `apps/console/src/servidor.ts` tem 12 `app.post` (prefeituras, suspender, reativar, eliminar, cancelar, operadores, senha, códigos); README:618-629 lista exatamente isso. |
| 1 | README: assinatura e mapa | PASS: sem "MapLibre" no README; `Assinatura.tsx` existe. |
| 2 | `db/PENDENCIAS.md` | Não conferi linha a linha (ver Não verificado). |
| 3 | `apps/api/PENDENCIAS.md` | FAIL: o item 4 e a tabela do topo dizem que `fastify` e `fast-uri` ainda têm aviso em execução; `npm audit --omit=dev` na raiz dá 0 (achado 2). Também incompleto sobre leitura que escreve (achado 1). |
| 4 | ADR 0008 | PASS: "Nota de revisão de 2026-10-07 (V2-F00-E22)" na linha 204, texto original preservado. |
| 5 | `SAIDA-DE-MUNICIPIO.md` cap. 2 x 5 | PASS: linhas 49-63 dizem que o sistema fica no ar do passo 1 ao 5 e cortam só na suspensão e no agendamento, com o 403 `acesso_suspenso` alinhado à nota da API. |
| 6 | `LEIA-ME` do campo | PARCIAL: linha 3 "sem artefato de aparelho arquivado" correta; linha 24 falsa (achado 2). |
| 7 | `apps/web/PENDENCIAS.md` | Não conferi (ver Não verificado). |
| 8 | Comentários de vigência | FAIL: achado 1. |

## Evidência

- `cd dc360 && npm run conferir:numeros`: saída 0, 24 conferidas.
- `grep` no README, `apps/campo/LEIA-ME.md`, `apps/api/PENDENCIAS.md`.
- Leitura de `apps/api/src/servidor.ts:465-481`, `apps/api/src/rotas/prestacao-de-contas.ts:310-420`, `apps/api/src/rotas/documentos.ts:679-755`, `apps/api/src/trilha.ts:72-95`.

## Cenários positivos

Os comentários da vigência em `auth/vigencia.ts` descrevem corretamente a cadeia de sessão (migração 047), o papel diferente do token e a janela da renovação.

## Cenários negativos

Procurei no código toda leitura (GET) que escreve, porque o texto promete que só `GET /avisos` escapa da vigência.

## Tentativas de reprovar

1. **Leituras que escrevem.** `servidor.ts:465` só confere vigência se o método não é GET nem HEAD. Rotas GET com efeito colateral:
   - `GET /avisos` (documentado);
   - `GET /relatorios/ocorrencias.csv` (`rotas/prestacao-de-contas.ts:310`) faz `INSERT INTO exportacoes` (linha 415) e entrega a base, inclusive no nível completo com nomes;
   - `GET /documentos/:id/laudo`, `/termo-de-interdicao` e `/termo-de-desinterdicao` (`rotas/documentos.ts:728-751`) chamam `responder`, que chama `registrarEmissao` (`trilha.ts:72`, `INSERT INTO trilha_eventos`) e, no caminho de interdição, `marcarInterditada`.
2. Os mesmos documentos afirmam: `auth/vigencia.ts:47-50` "quinze minutos de leitura com token vivo não produzem registro (a exceção conhecida é `GET /avisos`)"; `apps/api/PENDENCIAS.md` e README:130 repetem a exceção única. O código desmente.
3. Procurei restos de "hoje não fecha" e "NÃO fecha" depois da E19: achei três.

## Achados

1. **Bloqueia a etapa (DoD: nenhum documento afirma o contrário do código; risco declarado pela própria etapa: documentação falsa sobre segurança).** A lista de leituras que escapam da vigência está incompleta em `apps/api/src/auth/vigencia.ts:47-50`, `apps/api/PENDENCIAS.md` (seção "A vigência..." e tabela do topo) e `dc360/README.md:130`: faltam `GET /relatorios/ocorrencias.csv` e as três `GET /documentos/:id/...`. O comentário "leitura não produz registro" é falso: produz `exportacoes` e `trilha_eventos`. Efeito de produto (já planejado para F03-E03, mas não dito): conta desativada, papel rebaixado ou sessão encerrada ainda exporta o CSV da base e emite laudo e termo por até `ACESSO_MINUTOS` (15, teto 60). Reprodução: ler as linhas citadas; para provar em execução, desativar a conta e chamar o GET com o token antigo (não executei, ver Não verificado). Dono: E22.
2. **Corrige antes de crescer.** Afirmações que ficaram falsas quando a E19 fechou (a E22 deveria rodar depois da E19, ordem sugerida do roteiro):
   - `dc360/apps/campo/LEIA-ME.md:24`: "NÃO fecha em 2026-10-07 ... a raiz tem um aviso alto de execução no fastify ... No Windows, `npm run auditar` morre com ENOENT ... A correção é da V2-F00-E19, que espera o CP-03". Falso hoje (E19 implementada, ENOENT resolvido, fastify limpo) e contradiz a linha 23 da mesma tabela. O RESUMO da E19 afirma que o LEIA-ME foi corrigido.
   - `dc360/README.md:220`: "o `npm audit` deste produto precisa fechar em zero (hoje não fecha, por dependência que não é esta)". A raiz fecha em zero em runtime.
   - `dc360/apps/api/PENDENCIAS.md:25` e `:250-253`: aviso de `fastify`/`fast-uri` em execução, "a correção é da V2-F00-E19". `npm audit --omit=dev` na raiz dá 0.
   - A rodada final de `auditar` pedida pela etapa não existe: a saída arquivada é a de 2026-10-07, com ENOENT.
3. **Anotado.** README:1612 diz que a árvore do campo "hoje NÃO fecha em zero": verdadeiro para `npm audit` puro, e o README explica a política em outro trecho; só vale conferir a redação.

## Não verificado

- `db/PENDENCIAS.md` (item 2) e `apps/web/PENDENCIAS.md` (item 7): não confrontei linha a linha com o código.
- Não desativei conta para provar em execução que o GET do CSV e dos documentos passa; a prova é de leitura de código (E3a) combinada com o `servidor.ts` e os INSERT citados. Baixa chance de erro, mas é E3a nesse ponto.
- Comentários de `sessoes.ts`, `suspensao.ts` e `servidor.ts` além de `vigencia.ts:47-50`: li `servidor.ts` e `vigencia.ts`, não `sessoes.ts` nem `suspensao.ts`.

## Risco residual

Quem ler o README ou o PENDENCIAS conclui que só o sino escreve sem vigência; um desenvolvedor da F03-E03 que partir dessa lista deixa dois caminhos de saída de dado (CSV e laudo) de fora do conserto.

## Motivo do humano

A etapa pede que Rafael leia a tabela antes e depois e confirme que nada ficou prometido sem existir; isso só uma pessoa faz.
