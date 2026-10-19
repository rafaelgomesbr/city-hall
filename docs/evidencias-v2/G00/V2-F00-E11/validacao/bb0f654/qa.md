---
validador: qa (general-purpose com o papel da dimensão)
modelo: claude-opus-5-5
etapa: V2-F00-E11
sha_validado: bb0f654
ci_run: ausente (39143791434 citado pelo implementador, não lido)
rodada: 4
herdado_de:
tags: [UI, A11Y, LGPD]
nivel_de_prova_exigido: [E1, E2]
nivel_de_prova_obtido: [E1, E2]
veredito: PASS
confianca: alta
humano_necessario: nao
escalar: nenhum
---
## Critérios verificados

Árvore em `0290af5` (difere de `bb0f654` só em `docs/roadmap-v2/STATUS.md` e `ESTADO-ATUAL.md`). Todas as saídas estão em `/private/tmp/claude-501/-Users-rafaelgomes-Documents-city-hall/ded47d25-806d-4495-ac61-f9e84518cc35/scratchpad/validadores/qa-E11-E12/` (abaixo, "pasta da validação").

| Critério da etapa | Como foi provado | Resultado |
| --- | --- | --- |
| DoD: o botão baixa o ZIP em dois navegadores contra a API real | `npm run test:e2e:api` completo (roteiro inteiro, sem cópia aparada), Chromium e Firefox, seção 28: 36 de 36 nos dois | PASS |
| DoD: 401 renova | e2e seção 28 "com 401 no primeiro pedido o painel renova UMA vez e baixa o ZIP" nos dois motores; `apps/web/test/pacote-de-saida.test.ts` 7 de 7 | PASS |
| DoD: prova no e2e | seção 28 roda dentro de `fluxo-api.e2e.mjs` e o roteiro completo chega a ela (288 OK, 0 falha, código 0, nos dois motores) | PASS |
| DoD: item "bug /pacote.zip" do G00 marcado | a caixa da linha 783 de `03-fase-00-estabilizacao.md` continua `[ ]`; pelo protocolo (`00-README.md`, "Execute o gate") a caixa é conferida na execução do gate, não pelo implementador | não aplicável a esta rodada (registrado) |
| Teste positivo: download completa em Chromium e Firefox; 401 renova e baixa | e2e, dois motores | PASS |
| Teste negativo: `/pacote.zip` na raiz 404 | e2e e sonda independente (POST raiz 404; GET `/saida/pacote.zip` 404) | PASS |
| Teste negativo: coordenador 403 e a tela mostra a frase | API: 403 `sem_permissao` na sonda e no e2e; tela: e2e mostra a frase do corpo real da API (por interceptação) | PASS |
| Teste negativo: município suspenso recebe `acesso_suspenso` com a frase | `pacote-de-saida-contrato.test.ts` caso "recebe 403 acesso_suspenso ... nada é extraído nem registrado" verde; tela pelo e2e (interceptação) | PASS |
| Autorização e isolamento: pacote de A sem linha de B; coordenador de A 403 | sonda independente com leitor `zipfile` do Python: 0 linhas de outro município, `organizacoes.json` só Serra Alta mesmo com cabeçalho, consulta e corpo apontando Vale Fundo; agente 403; coordenador de Vale Fundo 403; 404 (não 403) entre municípios em `/documentos/:id/laudo` e `/ocorrencias/:id` | PASS |
| Regressão obrigatória: `test:api` (saida), `test --workspace @dc360/web`, `test:e2e:api`, `test:isolamento` | todos rodados nesta sessão | PASS (a única falha de `test:api` é `openssl-do-teste`, LibreSSL do macOS, divergência de máquina conhecida) |
| Evidência arquivada: `INDEX.md` bate byte a byte com o commitado | script próprio: SHA-256 de cada linha do INDEX contra `git show bb0f654:<caminho>` e contra a árvore; `node scripts/conferir-indices-de-evidencia.mjs` | PASS: 45 de 45 linhas batem, nenhum arquivo commitado fora do índice (fora `VEREDITO.md`, `RISCO-ACEITO.md` e `validacao/`, que o próprio INDEX declara excluídos) |
| Documentação: `SAIDA-DE-MUNICIPIO.md` cap. 4 e `apps/web/PENDENCIAS.md` | leitura: linha "Botão no painel" (`:99`) e seção 8 de `PENDENCIAS.md` (8.1 a 8.4) | PASS |

## Evidência

Comandos (em `dc360/` salvo indicação), código de saída e arquivo na pasta da validação:

- Conferência do INDEX: `python3 -I conferir_index.py V2-F00-E11 V2-F00-E12`, saída `01-conferir-index.txt` (45 de 45); `node scripts/conferir-indices-de-evidencia.mjs`, código 0, `02-conferir-indices-script.txt` (61 INDEX, 2017 arquivos, OK).
- `npm run build:shared`, código 0, `03-build-shared.txt`.
- `EVIDENCIA_E11=... EVIDENCIA_E12=... node scripts/e2e-api.mjs chromium`, código 0, `10-e2e-api-chromium.txt`: 288 OK, 0 falha, zero erro de console, geometria estreita verde, "TUDO CERTO". Lista de nomes e SHA-256 do ZIP baixado pelo navegador em `e2e-chromium-pacote/` (256 771 bytes).
- Mesmo comando com `firefox`, código 0, `13-e2e-api-firefox.txt`: 288 OK, 0 falha, zero erro de console. `e2e-firefox-pacote/` (256 777 bytes). As duas listas de nomes diferem só no nome aleatório de uma evidência criada numa seção anterior.
- `npx vitest run test/saida-de-municipio.test.ts test/pacote-de-saida-contrato.test.ts` (em `apps/api`), código 0, `11-api-saida-e-contrato.txt`: 45 de 45 (8 do contrato).
- `npx vitest run` (em `apps/web`), código 0, `12-test-web.txt`: 44 arquivos, 665 de 665; `pacote-de-saida.test.ts` 7 de 7.
- `npm run test:api`, código 1, `14-test-api.txt`: 1326 aprovados, 1 falha, 20 pulados de 1347; a falha é `openssl-do-teste.test.ts` (LibreSSL do macOS, conhecida).
- `npm run test:isolamento`, código 0, `15-test-isolamento.txt`: 345 aprovados, 3 pulados.
- Sonda independente (API real em porta própria 3791, PGlite com a semente, roteiro `sonda/rodar.sh`, cliente `sonda/sonda.mjs`, leitor `sonda/abrir_zip.py` com `zipfile` do Python): `20-sonda-independente.txt` (17 de 17 nas chamadas HTTP) e `21-leitor-independente-corrigido.txt` (20 de 20, código 0). A primeira passada do leitor acusou 2 "falhas" que eram falso positivo do meu filtro (a sequência `onerror=alert` aparece dentro do texto já escapado `&lt;img src=x onerror=alert(2)&gt;`); conferido o contexto, o filtro passou a procurar a marcação crua e repassou 20 de 20. O ZIP da sonda foi apagado depois de registrar a lista de nomes e a soma (`zip-sonda/lista-de-nomes.txt`, `zip-sonda/sha256-pacote-sonda.txt`, 113 arquivos).
- Mutações (feitas, medidas e desfeitas com `git restore`; `git status` limpo depois de cada uma): `30` a `36`, descritas em "Tentativas de reprovar".

## Cenários positivos

- Administradora de Serra Alta clica em "Baixar pacote de saída" no painel ligado à API real: nome `dc360-pacote-de-saida-2026-10-18.zip`, começa com `PK`, download sem falha, ZIP abre pelo diretório central, traz `tabelas/ocorrencias.csv`, laudo em `documentos/`, índice, LEIA-ME, pendências e somas, e cada soma SHA-256 confere (Chromium e Firefox).
- 401 provocado no primeiro pedido: uma única chamada a `/auth/renovar`, o ZIP baixa e a pessoa continua em Organização (dois motores).
- Botão "Gerando" desabilitado durante a geração e volta ao rótulo original depois.
- Leitor independente (Python) sobre o pacote baixado pela sonda: CRC de todas as entradas confere (`testzip`), `SOMAS-SHA256.txt` cobre e confere os 112 arquivos.

## Cenários negativos

- `POST /pacote.zip` na raiz: 404. `GET /saida/pacote.zip`: 404 (sonda e e2e).
- Sem token: 401. Token adulterado: 401 (sonda).
- Coordenadora de Serra Alta: 403 `sem_permissao`. Agente de campo: 403 `sem_permissao`. Coordenador de Vale Fundo: 403 (sonda).
- Município suspenso: 403 `acesso_suspenso` e nenhum registro de exportação (teste de contrato).
- Troca de município por cabeçalho (`x-organizacao-id`, `x-tenant`), por consulta (`organizacaoId`, `organizacao_id`) e por corpo: o pacote continua só de Serra Alta (sonda).
- Vale Fundo pede laudo de Serra Alta: 404; Serra Alta pede documento e ocorrência de Vale Fundo: 404, nunca 403 (sonda).
- Na tela: frase do servidor para sem permissão, para suspenso, e "O arquivo não foi baixado" sem rede, sem derrubar a sessão (e2e).

## Tentativas de reprovar

1. **Rodar o roteiro e2e COMPLETO em vez da cópia aparada** das rodadas anteriores: chega à seção 28 nos dois motores, 288 de 288.
2. **Carga maliciosa pelo caminho real da API** (ocorrência criada pela coordenadora com endereço `=HYPERLINK(...)`, nome `@SOMA(1+1) <b>Fulano</b>`, relato com `<script>` e `<img onerror>`, assinante `"><svg onload=...>`, coleta por agente de outra equipe): no CSV o endereço e o nome saem prefixados com apóstrofo; nenhuma célula de nenhum CSV do pacote começa com `=`, `+`, `@`, tabulação ou retorno; no laudo do pacote, no laudo da rota e no `INDICE.html` não há marcação crua, e a carga aparece como `&lt;script&gt;`.
3. **Travessia de caminho**: nenhum nome de entrada do ZIP real tem `..`, caminho absoluto, barra invertida, letra de unidade, byte nulo ou link simbólico. Mutação M5 (tirar o filtro de `.` e `..` de `normalizarCaminho`, `apps/api/src/saida/zip.ts`): 1 de 37 reprova ("não deixa um nome de arquivo escapar da pasta do pacote", `34`).
4. **Mutação M1** (cliente volta a chamar `/pacote.zip`, `apps/web/src/dados/http.ts`): `pacote-de-saida.test.ts` 2 de 7 reprovam (`30`).
5. **Mutação M2** (tirar `exigirPermissao(quem.papel, "gerenciar_organizacao")` de `rotas/saida.ts`): 3 de 45 reprovam, entre eles o da coordenadora no contrato (`31`).
6. **Mutação M6** (tirar `!opcoes.repetiu` da renovação em `chamar`): `pacote-de-saida.test.ts` continua 7 de 7 (`35`); a suíte inteira do painel cai por falta de memória de um trabalhador do vitest, sinal de laço infinito noutro arquivo (`36`). Ver achado A1.
7. **Data do nome do arquivo**: o nome vem de `new Date().toISOString().slice(0, 10)` (UTC). Ver achado A2.
8. **Dois downloads em menos de 30 s** (o e2e faz quatro seguidos: normal, 401, lento, recusas): nenhum falhou; a limpeza do efeito libera o endereço anterior ao trocar, o que só acontece depois de o download anterior ter começado.
9. **INDEX.md** recalculado contra os bytes do commit, não do disco: 45 de 45; o defeito que bloqueou a rodada 3 não se repete.

## Achados

- **A1 (anotado).** `apps/web/test/pacote-de-saida.test.ts:110`, caso "se renovar não adianta, para: uma renovação, um pedido repetido": o nome promete um pedido repetido, mas o caso só exercita a renovação RECUSADA (2 chamadas). O caminho "renovação aceita e o pedido repetido volta 401" não é coberto neste arquivo: com a trava `!opcoes.repetiu` removida, os 7 casos continuam verdes. Reprodução: trocar `if (resposta.status === 401 && !opcoes.repetiu && !opcoes.semSessao && lerTokens())` por `if (resposta.status === 401 && !opcoes.semSessao && lerTokens())` em `apps/web/src/dados/http.ts` e rodar `npx vitest run test/pacote-de-saida.test.ts` (7 de 7). A suíte inteira do painel fica vermelha, mas por estouro de memória e não por asserção. O código entregue tem a trava (conferido na leitura e pelo e2e, que conta exatamente uma renovação); não quebra critério da etapa.
- **A2 (anotado).** `apps/web/src/dados/http.ts:1109`: o nome `dc360-pacote-de-saida-AAAA-MM-DD.zip` usa a data UTC; entre 21h e 23h59 de Brasília o arquivo sai com a data do dia seguinte. O e2e calcula o esperado também em UTC, então não percebe. Baixa gravidade, nenhum dado errado dentro do pacote.
- **A3 (anotado, código anterior à etapa).** `packages/shared/src/csv.ts:19`: a neutralização prefixa com apóstrofo também número negativo (`-22.4266` vira `'-22.4266`); no pacote da sonda, 17 células numéricas (coordenadas) saem assim. O JSON do mesmo pacote preserva o valor; quem migrar pelo CSV precisa saber. Fora do escopo da E11.

Nenhum achado quebra critério da etapa.

## Não verificado

- O run 39143791434 do CI (Linux, PostgreSQL 17): não lido nesta sessão; tudo acima foi executado no Mac (PostgreSQL local 18.3 para o isolamento, PGlite para a API).
- WebKit: a etapa pede Chromium e Firefox; WebKit não foi rodado nesta rodada.
- A recusa do coordenador e a do município suspenso NA TELA são provadas por interceptação com o corpo da API (a do coordenador é o corpo real); não houve coordenador logado clicando num botão real nem município suspenso de verdade no e2e (o suspenso real está provado só no teste de contrato).
- Pacote grande (ZIP64, memória do servidor e da aba): fora do escopo (F07-E06); o leitor do e2e é do formato clássico.
- `apps/web/dist` foi reconstruído pelo `e2e-api.mjs` (pasta ignorada pelo git), nos dois motores.

## Risco residual

Baixo. O caminho do botão até a API real está provado nos dois motores pedidos, com conteúdo, recorte por município e neutralização conferidos por leitor independente. Restam A1 (lacuna de teste da trava de renovação neste arquivo), A2 (data UTC no nome) e A3 (apóstrofo em número negativo no CSV), nenhum com efeito em segurança ou isolamento.

## Motivo do humano

Nenhum. A validação humana que a etapa pede (baixar o pacote pelo painel com a API local e abrir o ZIP) foi feita por execução: o painel construído contra a API real baixou o ZIP em Chromium e Firefox, e o ZIP foi aberto e conferido por dois leitores independentes. Nada aqui depende de aparelho físico, percepção visual ou decisão de produto.
