---
validador: qa (agente general-purpose com o papel da dimensão)
modelo: claude-opus-5-5
etapa: V2-F00-E11
sha_validado: 52952a1
ci_run: 38618369218
rodada: 3
herdado_de:
tags: [UI, A11Y, LGPD]
nivel_de_prova_exigido: [E1, E2]
nivel_de_prova_obtido: [E1, E2]
veredito: PASS
confianca: alta
humano_necessario: sim
escalar: nenhum
---
Veredito: PASS. O botão "Baixar pacote de saída" baixa o ZIP da API real em Chromium e em WebKit (seção 28 do e2e, 36 de 36 nos dois, e sonda própria), o 401 renova uma vez e não entra em laço, `/pacote.zip` na raiz é 404 e o pacote do navegador não cita outro município. Um achado menor novo: o nome do arquivo usa a data UTC, e entre 21h e meia-noite de Brasília sai com a data do dia seguinte.

Saídas em `$SP/val/qa/painel/` (abaixo, `painel/`). O diff da rodada 3 tocou `apps/api/src/saida/pacote.ts` (conferência da assinatura, dono E12); conferi que o pacote continua baixando e abrindo.

## Critérios verificados

| # | Critério | Resultado e prova |
| --- | --- | --- |
| 1 | O botão baixa o ZIP em dois navegadores contra a API real | PASS. `npm run test:e2e:api` seção 28: Chromium 36 de 36 (`painel/04-test-e2e-api-chromium.txt`), WebKit 36 de 36 (`painel/04-test-e2e-api-webkit.txt`). Sonda própria: `dc360-pacote-de-saida-2026-10-14.zip`, assinatura PK, 112 arquivos, `tabelas/ocorrencias.csv` e laudo em `documentos/`, nos dois motores (`painel/25-e11-sonda-*.txt`). Firefox não está instalado: o segundo motor foi WebKit |
| 2 | 401 renova e repete uma vez | PASS. e2e: 401 provocado no primeiro pedido, uma renovação real, ZIP baixado, a pessoa continua em Organização. Sonda negativa própria: 401 em todo pedido, 2 pedidos ao pacote e 1 renovação, depois a entrada com "Sua sessão expirou..." (sem laço), nos dois motores |
| 3 | `/pacote.zip` na raiz 404; GET na rota nova não baixa | PASS (e2e seção 28) |
| 4 | Coordenador 403 com a frase; município suspenso com `acesso_suspenso` | PASS. API real para o coordenador (403 `sem_permissao`, frase na tela); suspenso por interceptação no e2e e por `acesso-suspenso.test.ts` na API (verde em `painel/06-test-api.txt`). Sonda: as três contas de Vale Fundo da semente recebem 403 `sem_permissao`; sem token 401 |
| 5 | Isolamento: o pacote de A não traz B | PASS. Pacote baixado pelo navegador (Serra Alta): nenhum arquivo de dado cita "Vale Fundo" nem o id dele (sonda e e2e, este linha a linha pelo `organizacao_id`). O lado de Vale Fundo: `pacote-de-saida-contrato.test.ts` ("a de Vale Fundo é só de Vale Fundo"; organização forjada em parâmetro, cabeçalho e corpo não troca) e `saida-de-municipio.test.ts` 32 de 32 verdes; a semente não tem administrador em Vale Fundo para eu baixar pelo navegador |
| 6 | URL do objeto revogada depois do início do download | PASS por leitura (`Organizacao.tsx`, relógio de 30 s num efeito com limpeza) e pelos três downloads seguidos da seção 28 sem falha |
| 7 | Regressão obrigatória | PASS. `npm run test:api` (1 falha alheia, openssl do macOS), `npm run test --workspace @dc360/web` 665 de 665, `npm run test:e2e:api` Chromium 0 falha. `npm run test:isolamento` não rodado por mim nesta rodada: o QA do outro lote rodou no mesmo SHA (`$SP/val/qa/02-test-isolamento.txt`) e o banco não muda nesta etapa |

## Evidência

- `painel/04-test-e2e-api-chromium.txt` (código 0), `04-test-e2e-api-webkit.txt` (seção 28 inteira verde; a suíte sai 1 por 5 falhas de foco e Tab do motor em outras seções).
- `painel/scripts/e11-sonda.mjs`, saídas `painel/25-e11-sonda-chromium.txt` e `-webkit.txt` (5 de 6; a falha é a anotação do fuso). Os 2 erros de console são os 401 que eu provoquei.
- O teste de contrato pega o caminho errado: com `chamar<Blob>("/pacote.zip", ...)` plantado em `http.ts`, `contrato-do-painel.test.ts` reprova "POST /pacote.zip (http.ts linha 1106)" (`painel/35-e23-plantios.txt`, plantio P1), restaurado com `git restore`.

## Cenários positivos

Download pela administradora, conteúdo conferido, segundo e terceiro downloads seguidos (401 e carregando), nos dois motores.

## Cenários negativos

Rota na raiz (404), GET (404), coordenadora (403 com frase), contas de Vale Fundo sem `gerenciar_organizacao` (403), sem token (401), 401 permanente (sem laço, volta à entrada), suspenso, rede caída.

## Tentativas de reprovar

1. 401 em TODO pedido para achar laço de renovação: um só retry.
2. Fuso: navegador em `America/Sao_Paulo` com o relógio fixo em 14/10/2026 23h30: o arquivo sai `dc360-pacote-de-saida-2026-10-15.zip` com a data local do navegador em 14/10/2026 (`painel/25-`). O e2e não pega porque calcula o esperado do mesmo jeito (`toISOString`).
3. Procurei Vale Fundo e o id dele em todo arquivo do ZIP baixado pelo navegador: nada.
4. Tentei baixar o pacote com cada conta de Vale Fundo para provar o lado inverso pelo navegador: nenhuma tem a permissão (403), então esse lado ficou com os testes de API.

## Achados

- corrige antes de crescer: `baixarPacoteDeSaida` (`apps/web/src/dados/http.ts:1109`) monta o nome com `new Date().toISOString().slice(0, 10)`, data UTC; das 21h à meia-noite de Brasília o arquivo leva a data de amanhã, e o pacote é peça de prestação de contas na saída de município. Reprodução: `painel/scripts/e11-sonda.mjs` (bloco do fuso). Dono provável: F07-E06 (pacote) ou correção pontual.
- anotado (rodadas 1 e 2, ainda vale por leitura): `disabled` no botão durante "Gerando" tira o foco; F10-E11.

## Não verificado

- Firefox (não instalado; usei WebKit como segundo motor); abrir o ZIP num descompactador do sistema (abri pelo diretório central, como o e2e); pacote ZIP64 grande (coberto só pelo teste de API); download pelo navegador por uma conta administradora de Vale Fundo (a semente não tem).

## Risco residual

Nome do arquivo com a data errada em parte do dia; nenhum risco funcional novo.

## Motivo do humano

A etapa pede que o Rafael baixe o pacote pelo painel com a API local e abra o ZIP.
