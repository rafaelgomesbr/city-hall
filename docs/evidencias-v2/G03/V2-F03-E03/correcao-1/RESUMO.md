# V2-F03-E03, correção 1: recusas de vigência no contrato e textos que prometiam leitura depois do corte

Ramo `trab/f03-1d-e03-vigencia`, sobre o candidato `ba764090`. Origem: revisão do Codex (REPROVA por 1 BLOQUEIA, 3 notas e 2 dívidas). A etapa continua IMPLEMENTADA; nada aqui é VALIDADA nem CONCLUÍDA.

## Fatos

### 1. BLOQUEIA: o contrato OpenAPI declara as recusas novas (tocando `apps/api/src/contrato/**`, autorizado)

- `contrato/openapi.ts`: o gerador acrescenta, DERIVADOS e nunca declarados entrada a entrada, os códigos da vigência (`CODIGOS_DA_VIGENCIA`: `sessao_encerrada`, `conta_desativada`, `acesso_suspenso`, `troca_de_senha_obrigatoria`) a toda entrada que declara `nao_autenticado`, isto é, a toda rota autenticada. O que `exigirVigencia` e a senha provisória emitem foi conferido no código (`auth/vigencia.ts`, `auth/autenticacao-da-requisicao.ts`): 401 `sessao_encerrada` e 401 `nao_autenticado` (papel diferente), 403 `conta_desativada`, `acesso_suspenso` (503 nas rotas da fila, que o catálogo já mapeia por `tambemSai`) e `troca_de_senha_obrigatoria`. Nada além disso.
- `contrato/comuns.ts`: só o comentário de `ERROS_AUTENTICADA`/`ERROS_AUTORIZADA`, dizendo que a vigência é derivada pelo gerador.
- `openapi/v1.json` regenerado por `npm run openapi` (nunca à mão). Por exemplo, `GET /v1/auth/eu` passa a ter 401 `nao_autenticado` + `sessao_encerrada` e 403 `conta_desativada`, `acesso_suspenso`, `troca_de_senha_obrigatoria`.
- Teste: `vigencia-em-toda-requisicao.test.ts` ganhou o bloco "O contrato declara cada recusa que a varredura observou". A varredura registra cada recusa 401, 403 e 503 com `erro` (`MÉTODO caminho|status|código`); o bloco exige que cada uma delas, em rota de `/v1` (o espelho mapeia para `/v1`), esteja em `responses[status]["x-codigos-de-erro"]` da operação do `v1.json`, e que nenhuma rota observada fique sem operação no contrato. Piso: mais de 80 conferências. Provado que reprova: com o `v1.json` da base o caso falha com 802 recusas não declaradas (`saidas/07-contrato-reprova-sem-a-correcao.txt`).
- `openapi.test.ts`: o caso que fixava `["nao_autenticado"]` e `["sem_permissao"]` na triagem passou a fixar também os códigos derivados.

### 2. Textos que ficaram falsos

- `apps/web/src/paginas/Usuarios.tsx` (três janelas: "Desativar usuário", "Redefinir senha", "Encerrar sessões") e `MinhaConta.tsx` ("Encerrar minhas outras sessões") não prometem mais "pode continuar consultando por alguns minutos". Dizem que renovar, gravar e consultar são recusados na hora, e que o que já estava aberto na tela fica visível mas nenhuma consulta nova é atendida.
- Testes do painel que afirmavam o texto antigo atualizados: `correcao-8-da-e09.test.ts` e `correcao-8b-da-e09.test.ts` (este ganhou 1 caso: nenhuma tela promete "alguns minutos"). `seguranca-da-conta.test.ts` (que exige a frase contígua "Esta sessão continua aberta") passou depois de reajustar a quebra de linha de `MinhaConta.tsx`.
- `dc360/docs/GUIA-DO-COORDENADOR.md`: a desativação vale no próximo pedido (gravar ou consultar), o papel gravado vale na escrita e na leitura, o corte vale para sessão encerrada, conta desativada e município suspenso, e a frase do alcance (item 4).
- `servidor.ts`, comentário de `ROTA_GET_COM_EFEITO` (autorizado, só comentário): a vigência de leitura deixou de ser "da F03-E03" e a marca já não é lida pela autenticação.
- **Pendência de recaptura (humana):** as capturas de referência da E09 mostram o texto antigo: `docs/evidencias-v2/G00/V2-F00-E09/capturas/usuarios-confirmar-encerrar-*.png` (e `-erro`, `-sem-contagem`), `usuarios-confirmar-redefinir-*.png` (e `-erro`) e `minha-conta-confirmar-outras-*.png`, em 1280 e 390, claro e escuro. É evidência arquivada de outra etapa (não se reescreve); a recaptura é do fechamento da F03, com o painel no ar. Não toquei nelas.

### 3. DÍVIDA fechada: a direção inversa da marca `sp`

Caso novo: token antigo com `sp: true`, banco já sem prazo de senha provisória, sessão de pé: lê (200 em `GET /ocorrencias` e `GET /auth/eu`). Documenta que a marca do token deixou de trancar quem o banco já liberou, como já não trancava na escrita.

### 4. DÍVIDAS registradas

- **URLs assinadas de arquivo seguem utilizáveis depois do corte** (`rotas/armazenamento-local.ts:73`, `armazenamento/s3.ts:141`, validade padrão de 5 minutos): a entrega dos bytes confere assinatura e validade, não a sessão. Limitação preexistente. Escrito já no README (linha "Token de acesso"), no guia do coordenador ("Alcance do corte") e em `apps/api/PENDENCIAS.md`. Fechar exigiria validade menor ou vigência na entrega: F07.
- **HEAD exclusivo (sem GET):** `test/apoio/rotas.ts` descarta HEAD e OPTIONS, e a varredura recompõe só o HEAD de cada GET. Caso novo prova que hoje não existe rota só de HEAD (todo HEAD registrado vem com o GET da mesma rota, lido de `printRoutes`); uma rota assim reprova o caso.

### Notas do Codex, sem ação

2 (nenhum desvio de vigência por token de acesso; OPTIONS, 429 e 426 respondem antes da vigência sem entregar recurso), 4 (nenhum vazamento novo de existência; sem medição de tempo, que não foi pedida), 5 e 6 (pisos coerentes; PGlite real). Concordo; a medição de tempo de resposta entre existente e inexistente fica fora desta etapa.

## Prova

| O quê | Resultado |
| --- | --- |
| Caso do contrato SEM a regeneração do `v1.json` | falha, 682 recusas não declaradas (`saidas/07-contrato-reprova-sem-a-correcao.txt`) |
| `vigencia-em-toda-requisicao.test.ts` COM a correção | 19 de 19 (`saidas/08-varredura-depois.txt`) |
| Gates (`saidas/01` a `06`, `09`) | ver a tabela em `saidas/09-portoes-finais.txt` |

Contagens: `scripts/baseline.mjs`, chaves `V2-F03-E03-correcao-1` (API, 3 casos) e `V2-F03-E03-correcao-1` (web, 1 caso); README e `COLOCAR-DE-PE.md`, só os totais (API 2328 para 2331, web 824 para 825, soma 4870 para 4874 e 6893 para 6897).

## Limitações

- `test:e2e:api` e os e2e do painel (`layout-estreito.e2e.mjs`, `fluxo-api.e2e.mjs`) não rodaram aqui (o CI cobre); nenhum deles afirma o texto antigo (conferido por busca).
- O contrato derivado declara, em rotas autenticadas que a vigência não toca de fato (por exemplo `troca_de_senha_obrigatoria` em `POST /v1/auth/trocar-senha`, que é uma das rotas abertas pela senha provisória), um código que ela nunca emite. É o custo de derivar por regra em vez de por rota; declarar a mais é seguro, declarar a menos é que seria o defeito.

## Para o orquestrador

- **Linha do STATUS:** a mesma da E03, com "correção 1 do Codex (contrato, textos, sp inverso)" e novo SHA.
- **Dívidas pagas:** as DV-A, DV-B e DV-C que o RESUMO da E03 abriu (comentário de `servidor.ts`, `GUIA-DO-COORDENADOR.md`, frases do painel). **Dívidas novas:** (1) URLs assinadas (F07); (2) recaptura das capturas da E09 que mostram as frases antigas (humana, no fechamento da F03).
- **Pendências humanas novas:** a recaptura acima.
- **Mudança de plano:** a E03 passou a tocar `contrato/**` (só `comuns.ts` comentário e `openapi.ts` gerador, mais o `v1.json` gerado), `apps/web` (duas telas e dois testes) e `docs/GUIA-DO-COORDENADOR.md`, com autorização do coordenador. Conflito provável na junção: `openapi/v1.json` (regerar em vez de mesclar) e `contrato/openapi.ts` com qualquer parte que mexa no gerador.
