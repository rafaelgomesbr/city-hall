---
validador: red-team
modelo: claude-opus-5-5
etapa: V2-F00-E05
sha_validado: 4ce0433
ci_run: ausente
rodada: 5
herdado_de:
tags: [UI, A11Y, AUTH, API]
nivel_de_prova_exigido: [E1, E2]
nivel_de_prova_obtido: [E1, E2]
veredito: FAIL
confianca: media
humano_necessario: nao
escalar: arbitragem-opus
---
## Critérios verificados

Diretório de trabalho: `/private/tmp/claude-501/-Users-rafaelgomes-Documents-city-hall/768bf074-5845-4f2d-bff9-57106bf57383/scratchpad/val/L10-red-team/` (abaixo, `$W`). Toda mutação foi feita num worktree meu (`$W/wt`, `git worktree add --detach` em `4ce0433`, `node_modules` por link), nunca na árvore principal.

| Critério (DoD e campos de teste) | Resultado | Prova |
| --- | --- | --- |
| Os três códigos emitidos e testados (`nao_autenticado`, `sessao_encerrada`, `conta_desativada`) | OK | `npx vitest run test/codigos-de-erro.test.ts test/prova-dinamica-dos-codigos-de-erro.test.ts` no worktree: 117 de 117, código 0 (`$W/e05-00-base.txt`) |
| Nenhuma ocorrência do texto `sessao` como código | OK | grep em `apps/api/src`, `apps/web/src`, `apps/campo/src`, `packages/*/src`: só a etiqueta `tipo: "sessao"` da união do painel e comentários |
| Negativo: código fora do catálogo reprova o teste de catálogo | **FALHA** | quatro formas de emitir 403 com código fora do catálogo passam pela varredura E pela prova dinâmica, com `tsc` 0 (ver Achados 1) |
| Negativo: `/auth/entrar` de conta desativada igual à senha errada | OK | casos verdes do arquivo de catálogo (`/auth/entrar não conta nada...`) na mesma execução |
| Isolamento: conta desativada de A contra recurso de B não confirma nada sobre B; 404 de outro município não muda | OK | sonda de oráculo (1560 pedidos, zero diferença entre id real e id aleatório) em `$W/saidas/e05-sonda-oraculo-e-vazamento.json` |
| Nada de SQLSTATE, pilha, nome de tabela ou detalhe interno nas respostas de erro | OK | mesma sonda e a variante com id hostil (`1' OR 1=1--` codificado, byte nulo): zero 500, zero casamento do padrão de vazamento (`$W/saidas/e05-sonda-id-hostil.json`) |

Itens do "Motivo do veredito" da rodada 4:

1. `posto_insuficiente`, `posto_insuficiente_para_dado_pessoal`, `email_so_por_administrador` e `assinatura` fora do catálogo: **consertado** (entraram no catálogo; a varredura do fonte real fica verde, 116 de 116).
2. O teste não mordia código novo em `send({ erro })` nem em `RegraDeNegocio` com 403: **consertado para essas duas formas**. Reapliquei as mutações da rodada 4 num ramo profundo de `POST /orgaos`: ambas reprovam (`$W/saidas/e05-mut-R4_send_literal.txt`, `$W/saidas/e05-mut-R4_RegraDeNegocio_403.txt`: "1 failed | 115 passed", nomeando `src/rotas/orgaos.ts:116`).
3. README e cabeçalho desmentidos pelo teste: **não consertado por inteiro**. O texto novo continua prometendo mais do que o teste prende (Achados 1).

## Evidência

- `$W/e05-00-base.txt`: os dois arquivos do catálogo no SHA, 117 de 117, código 0.
- `$W/scripts/mutar-e05.mjs`: aplica UMA mutação em `src/rotas/orgaos.ts` do worktree, roda `tsc --noEmit`, a varredura e (opcional) a prova dinâmica, e restaura. Saídas `$W/saidas/e05-mut-*.txt`.
- `$W/saidas/e05-sonda-runtime-mutacoes-juntas.txt`: as quatro mutações juntas, `tsc` 0, os três arquivos (varredura, prova dinâmica, sonda) 118 de 118 verdes, e a sonda mostrando o que o servidor mutado RESPONDE de verdade:
  - `POST /orgaos {"nome":"Mutacao A"} -> 403 {"erro":"vazou_por_ponto",...}`
  - `POST /orgaos {"nome":"Mutacao B","sigla":"MB"} -> 403 {"erro":"vazou_por_reatribuicao",...}`
  - `POST /orgaos {"nome":"Mutacao C"} -> 403 {"erro":"vazou_por_colchete",...}`
  - `POST /orgaos {"nome":"Mutacao N"} -> 403 {"erro":"corpo_invalido",...}` (`corpo_invalido` não é do catálogo nem da entrada)
- `$W/saidas/e05-mut-CTRL_C_antes_da_validacao.txt`: controle. A mesma forma C posta ANTES da validação do corpo é pega pela prova dinâmica (FAIL nomeando `POST /orgaos como coordA: 403 vazou_por_colchete`), e a varredura continua verde (116 de 116). Ou seja: a prova dinâmica funciona onde chega, a varredura é cega para a forma.
- `$W/scripts/cegos-da-varredura.mjs` e `$W/saidas/e05-cegos-no-fonte-real.txt`: procura as quatro formas no fonte real (API, shared, console; 103 arquivos). Quatro ocorrências, todas inofensivas (abreviações `status`/`codigo` em retorno de função de push, rota do Google e validação de documento, nenhuma resposta de acesso). O produto, hoje, não emite nada fora do catálogo.
- `$W/scripts/sonda-e05-oraculo.test.ts` (copiado para o worktree só durante a execução, apagado depois): servidor real com PGlite, municípios A e B, perfis coordenador, administrador, agente e operador de B mais a conta desativada de A; para as 26 rotas com parâmetro, compara a resposta com o id REAL do outro município (ocorrência, usuário, equipe, órgão) contra um uuid aleatório. 1560 pedidos, `oraculos=0`, `vazou=0`; status vistos 200, 403, 404, 422, 429, 503, nenhum 500.

## Cenários positivos

- Os dez códigos do catálogo saem do servidor real com o status do catálogo (casos de execução verdes).
- A forma comum (`send({ erro: "x" })` literal e `new RegraDeNegocio("x", m, 403)`) com código novo é reprovada pela varredura em ramo que a prova dinâmica não alcança.
- A prova dinâmica reprova código novo em ramo que ela alcança (controle CTRL_C).

## Cenários negativos

- Coordenador, administrador, agente e operador de B pedindo ocorrência, usuário, equipe e órgão REAIS de A recebem exatamente o mesmo status e corpo que para um id inexistente (26 rotas, dois corpos por rota de escrita): nenhuma confirmação de existência.
- Conta desativada de A contra os recursos de B: idem, sem diferença entre real e aleatório.
- Id hostil (aspas, comentário SQL, byte nulo codificado) em todas as rotas com parâmetro: 422 ou 404, nunca 500, nenhum SQLSTATE, `relation`, `violates`, pilha, caminho `.ts`, `organizacao_id` ou `FST_` no corpo.

## Tentativas de reprovar

1. Mutar uma constante de corpo depois de declarada (`recusa.erro = "x"`): passou pelos dois testes (forma A).
2. `let` com objeto literal e reatribuição antes do `send` (`recusa = { erro: "x" }`): a varredura lê o primeiro objeto e dá verde (forma B).
3. Chamada por colchete (`resposta["code"](403)["send"]({ erro: "x" })`): a varredura não vê nem o `code` nem o `send` (forma C).
4. `statusCode` abreviado num objeto lançado com `code` começando por `FST_ERR_CTP_`: o tratador global repassa o status 403 com `corpo_invalido`, e a varredura só olha `statusCode: n` escrito por extenso (forma N).
5. Parâmetro homônimo de uma constante de corpo do mesmo arquivo (forma D): a varredura PEGOU (1 falha). Não escapa.
6. As duas formas da rodada 4: pegas.
7. Oráculo de existência entre municípios e vazamento de detalhe interno: nada encontrado.
8. Procurei as formas A, B, C e N no fonte real: nenhuma resposta de acesso as usa hoje.

## Achados

1. **bloqueia** (critério negativo da etapa e a afirmação escrita pela própria correção). A varredura deixa passar, calada, quatro formas de responder 403 com código fora do catálogo, e a prova dinâmica não as vê porque estão depois da validação do corpo (66 das 114 rotas nunca chegam a 2xx na prova, como o README declara). Reprodução: `node $W/scripts/mutar-e05.mjs $W/wt A_ponto <saida> dinamica` (e `B_reatribuicao`, `C_colchete`, `N_statusCode_abreviado`): `tsc` 0, `codigos-de-erro.test.ts` 116 de 116, prova dinâmica 1 de 1, e o servidor responde 403 com o código novo (`$W/saidas/e05-sonda-runtime-mutacoes-juntas.txt`). Isso desmente, no SHA: o cabeçalho de `packages/shared/src/codigos-de-erro.ts` ("O que a varredura NÃO consegue ler, ela REPROVA em vez de deixar passar"; "`statusCode` ou `status` escritos à mão por qualquer forma"), o README (seção "Códigos de erro de acesso": "O que ela não consegue ler, ela reprova"; "Lê `send({ erro })` literal ou por constante", quando a "constante" pode ser `let` reatribuída ou ter `erro` trocado) e o cabeçalho de `apps/api/test/codigos-de-erro.test.ts` ("lê TODAS as formas de emitir erro"). As formas A e B são código TypeScript comum, não truque. É o mesmo tipo de defeito que reprovou a rodada 4 (teste que não morde código novo, texto que promete mais do que o teste prende), agora mais estreito. Conserto mínimo: a varredura reprovar `X.erro = ...` (e `X.codigo`, que já pega), corpo de `send` vindo de `let` ou de variável com atribuição posterior, acesso por colchete a `code`, `status` e `send`, e `statusCode`/`status` abreviados; ou o README e os dois cabeçalhos passarem a listar essas lacunas em vez de dizer que o que não é lido reprova.
2. **anotado**. O produto, hoje, não emite resposta de acesso fora do catálogo: as formas cegas não aparecem no fonte real (`$W/saidas/e05-cegos-no-fonte-real.txt`), e a sonda dinâmica do implementador mais a minha não acharam código fora da lista. O defeito do Achado 1 é da guarda e do texto, não de resposta que o cliente recebe hoje.
3. **anotado**. Na sonda de oráculo, 60 de 1560 pedidos deram 429 (limitador por usuário). Saíram sempre em par (real e aleatório), então não esconderam diferença, mas nesses pares a comparação não chegou ao handler.

## Não verificado

- O texto das frases na tela de entrada do painel (dimensão UX e validação humana).
- Comportamento do app de campo diante de `conta_desativada` (E06; fora do foco desta dimensão aqui).
- O console do fornecedor contra as quatro formas cegas (a mutação foi só na API; a varredura é a mesma função, então a lacuna vale lá também, mas não executei).
- Run do CI do SHA (ausente nesta sessão).
- Oráculo de existência com recursos além de ocorrência, usuário, equipe e órgão (vistoria, evidência, ofício, documento, tarefa): os ids desses tipos não foram semeados; nessas rotas o id real usado foi de outro tipo.

## Risco residual

Hoje nenhuma resposta de acesso sai fora do catálogo, mas a guarda que deveria impedir a próxima tem lacunas em formas comuns de escrever código, e o texto da etapa diz que não tem. Uma rota nova que monte o corpo numa variável e troque o `erro` depois passa pelo portão e chega ao cliente como erro comum (ação `nenhuma`), sem a ação certa do catálogo.

## Motivo do humano

Não se aplica a esta dimensão. A validação humana da etapa (Rafael ler e aprovar as três frases) continua pendente e é de outra dimensão.
