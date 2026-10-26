# V2-F02-E02 (parte 2A, painel web): o painel fala /v1 e a renovação segue a categoria do erro (leitura da E03)

## Fatos

**Autoria.** A primeira versão do código foi feita pelo Codex (sem poder rodar vitest nem commitar); a revisão cética, o ajuste descrito abaixo, a execução dos portões, as contagens, a evidência e o commit são desta sessão (Claude).

**O que mudou (só `dc360/apps/web/**`, mais contagens e README):**

- `apps/web/src/dados/http.ts`: `ORIGEM` (o `VITE_API_URL` sem barras finais, `/+$/`) e `BASE = ORIGEM + "/v1"`, ponto único de todas as chamadas (`chamar`, `renovar`, `encerrarSessao`, e os três downloads `documentos`, `relatorios/ocorrencias.csv` e `oficios/:id/documento`). Com origem vazia o painel chama `/v1/...` no servidor onde está. URLs assinadas que a API devolve (`/armazenamento/objeto`, `/publico/oficio/:token`) são usadas como vieram, sem `/v1`.
- Mesmo arquivo, `chamar`: o corpo do erro é lido uma vez, antes da decisão de renovar. A decisão usa `categoriaDoErro(corpo)` do shared, depois `categoriaPadraoDoStatus(status)`, e, para 401 sem código reconhecível, mantém o comportamento de hoje (renova e repete uma vez). As mensagens ao usuário não mudaram (a frase do servidor continua chegando à tela).
- Testes: `apps/web/test/http-v1-e-categorias.test.ts` (novo, 23 casos); `sessao-e-entrada.test.ts` e `pacote-de-saida.test.ts` (asserções de `/v1` e de "categoria reentrar não renova"); E2E `fluxo-api.e2e.mjs` e `layout-estreito.e2e.mjs` com a base `/v1` (sem verificação nova: a contagem de `ok(` não mudou). `scripts/e2e-api.mjs` fica intacto (`/saude` não leva prefixo).
- Contagens: `baseline.mjs` ganhou `"V2-F02-E02-parte-2A": { total: 23, falhas: 0 }` em `MUDANCAS_DO_TESTE_WEB_POR_ETAPA`; web 791 para 814; `README.md` (814 do painel, 4221 em `npm test`) e `docs/COLOCAR-DE-PE.md` (6218) ajustados; `conferir:numeros` verde.

**O que eu mudei na revisão do código do Codex, e por quê:**

1. O Codex fez a renovação valer para qualquer status com categoria `renovar` e tirou `assinatura` da lista "403 não renova" de `sessao-e-entrada.test.ts`. No catálogo (`packages/shared/src/erros.ts`) `assinatura` (403) é de fato categoria `renovar`, mas porque pede ENDEREÇO novo (URL assinada ausente, adulterada ou vencida), e não token novo. Renovar a sessão não conserta endereço assinado: seria gastar uma rotação do token de renovação e repetir o mesmo pedido, que falharia igual. Não vira laço (o `repetiu` limita a uma repetição), mas é renovação gasta à toa e desfaz a correção 2 da V2-F00-E05. Corrigi: a renovação exige `resposta.status === 401` E categoria `renovar` (a categoria passa a servir para NÃO renovar nos 401 de `sessao_encerrada`, `credenciais`, `senha_provisoria_vencida`, `dados_invalidos`, `excesso_de_requisicoes` e para categoria aditiva do servidor). `assinatura` voltou à lista de 403 que não renovam, e o caso "403 renova" do Codex foi trocado por "403 assinatura não gasta a renovação da sessão" (tokens intactos, 1 chamada). Acrescentei também um caso de "uma renovação só" (segunda recusa depois de renovar não renova de novo; o ouvinte de expiração segue como antes, então sessão encerrada não é mascarada).
2. Formatação do arquivo de teste novo pelo `formato-conferir --formatar`.
3. O resto do código do Codex foi conferido e mantido: `VITE_API_URL` com barra final não gera `//v1` (3 sufixos testados), nenhum `fetch` fora do ponto único (em `apps/web/src` só `http.ts` chama `fetch`, todos via `BASE`), URLs assinadas intactas.

**Prova de mordida:** com o `http.ts` do commit anterior (sem `/v1` e renovando em todo 401), os testes novos e o de pacote de saída reprovam (17 de 30 falham): `saidas/11-prova-de-mordida-codigo-antigo.txt`.

**Caminhos chamados pelo painel (todos sob `/v1`, sem token):** `/auth/{renovar,sair,recuperacao,recuperar,redefinir,sessoes,trocar-senha,encerrar-sessoes}`, `/segundo-fator{,/iniciar,/desativar}`, `/avisos{,/lidos}`, `/armazenamento/uso`, `/campo/meu-trabalho`, `/configuracao`, `/equipes{,/:id}`, `/mapa/resolver-link`, `/ocorrencias{,/:id,/:id/{coordenada,desinterdicao,despacho,encerramento,triagem,providencia,providencia/:pid/resposta},/devolvidas,/interditados,/mapa,/duplicidades/consulta,/indicadores/painel,/providencias/pendentes}`, `/oficios{,/:id,/:id/envio,/:id/documento}`, `/organizacao/retencao`, `/orgaos{,/:id,/:id/desativacao,/:id/reativacao}`, `/publico/interesse`, `/relatorios/{exportacoes,consultas,resumo,ocorrencias.csv}`, `/saida/pacote.zip`, `/saida-a-campo{,/encerrar}`, `/trilha`, `/usuarios{,/:id,/:id/{encerrar-sessoes,redefinir-senha,sessoes,situacao}}`, `/busca`, `/evidencias/ocorrencia/:id`, `/documentos/:id/:tipo`. Sem `/v1`, de propósito: URLs assinadas devolvidas pela API (`/armazenamento/objeto`, `/publico/oficio/:token`).

## Limites declarados (leia antes de dar PASS)

- NÃO rodei `npm run test:e2e:api` (o CI cobre) nem `layout-estreito.e2e.mjs`: as edições nesses dois E2E foram conferidas só por sintaxe e por leitura. O E2E do painel em modo local (`npm run test:e2e`, banco no navegador) rodou: 70 OK, 0 falha, zero erro de console (`saidas/13`). Esse modo não passa por `/v1`; a prova de `/v1` no painel em modo API é dos testes de unidade e do `test:e2e:api` do CI.
- Ordem de implantação (README): publicar a API antes do painel, porque o painel novo exige `/v1`; o bundle em cache e o campo instalado seguem no espelho.
- Validação humana da E02 (DevTools no painel apontado para a API local) não foi feita aqui.
- Falhas de ambiente Windows, só as conhecidas: `regras-de-conteudo` 1 caso (EPERM em symlink, DV-46; aparece no shared), `desfazer-migracao` 5, `guarda-da-semente` 3, `semear-homologacao` 2. Nenhuma outra falha de teste.
- Na primeira rodada de `npm test`, `apps/console/test/no-navegador.test.ts` (afterAll de 10 s) reprovou como suíte, e numa segunda rodada do console `saude-versao.test.ts` estourou 5 s: a máquina estava saturada por outros agentes (o console levou 362 s). Esta parte não toca o console; os dois arquivos rodados sozinhos passam (11 de 11, `saidas/05c`). Rodar o console no CI.
- `test:scripts`: 1 reprovação, "todo INDEX.md real bate", porque a rodada foi antes de existir o INDEX desta pasta; com o INDEX gravado, `conferir-indices-de-evidencia.mjs` fecha.

## Provas (em `saidas/`)

01 typecheck (0); 02 lint (0); 03 lint-teto (431, não sobe); 04 formato (OK, 809 conferidos); 05 `npm test` (campo pacote 238/238, shared 407 de 408, api 1943 de 1979 com 34 pulados e 2 de ambiente, console 377/377 na rodada inicial com a suíte `no-navegador` reprovada por timeout de hook, web 814/814, db 431 de 445 com 6 pulados e 8 de ambiente); 05b e 05c (console repetido e dois arquivos isolados); 06 isolamento (CA-06 verde; as 8 falhas são `desfazer-migracao` e `guarda-da-semente`); 07 test-scripts (831, 807 passam, 23 pulados, 1 o INDEX ausente na hora); 08 regras-de-conteudo (9 de 10, EPERM); 09 auditar (0); 10 conferir-numeros (OK); 11 prova de mordida; 12 build do painel; 13 E2E do painel em modo local (70 OK).

## Para o orquestrador

- **Linha do STATUS sugerida:** `V2-F02-E02 (parte 2A, painel) | IMPLEMENTADA (candidato) | painel chama só /v1 por ponto único (VITE_API_URL sem barra final, URLs assinadas sem prefixo); renovação pela categoria do shared só em 401 (sessao_encerrada, credenciais, senha_provisoria_vencida etc. não renovam; 401 sem código segue renovando); assinatura (403, categoria renovar) deliberadamente não renova a sessão. 23 testes novos do web (814). Falta: campo e validação humana no DevTools.`
- **Dívidas pagas:** nenhuma nova.
- **Ao integrar:** `baseline.mjs` (chave `V2-F02-E02-parte-2A`, web 791 para 814) e os totais do README (814, 4221) e de `COLOCAR-DE-PE.md` (6218) conflitam com as outras partes do lote 2: recalcular na junção.
- **Pendências humanas:** abrir o painel apontado para a API local e conferir no DevTools que toda chamada vai a `/v1` (roteiro da E02).
- **Ao validar:** rodar `test:e2e:api` e `layout-estreito.e2e.mjs` no CI do SHA (não rodados aqui); decidir se `assinatura` deveria um dia pedir ao painel o ENDEREÇO novo (reconsultar a listagem), que é outra mudança.
