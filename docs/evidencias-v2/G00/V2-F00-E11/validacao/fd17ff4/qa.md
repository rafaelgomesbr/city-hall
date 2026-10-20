---
validador: qa
modelo: claude-opus-5-5
etapa: V2-F00-E11
sha_validado: fd17ff4
ci_run: 39420436042
rodada: 7
herdado_de:
tags: [UI, A11Y, LGPD]
nivel_de_prova_exigido: [E1, E2]
nivel_de_prova_obtido: [E1, E2]
veredito: PASS
confianca: alta
humano_necessario: sim
escalar: nenhum
---
## Critérios verificados

SCRATCH abaixo é `/private/tmp/claude-501/-Users-rafaelgomes-Documents-city-hall/20850765-8640-418e-ace7-9257aa515baf/scratchpad/val-qa-e09a13`. Árvore em `55209ab` (produto idêntico a `fd17ff4`). O diff `1ed0b71..fd17ff4` não toca `dados/http.ts`, `Organizacao.tsx` nem `rotas/saida.ts`, mas toca a guarda de códigos de erro que filtra toda resposta 401 e 403 (inclusive as do download), `AcessoSuspenso` (só 403 ou 503 agora) e `e2e-api.mjs`; por isso a prova foi refeita do zero.

| Critério (DoD e cinco campos de teste) | Resultado | Prova |
| --- | --- | --- |
| Botão baixa o ZIP contra a API real, Chromium | atende | seção 28 de `fluxo-api.e2e.mjs`, 36 de 36 OK, roteiro 288 de 288, código 0 (`SCRATCH/10-e2e-api-chromium.txt`) |
| Botão baixa o ZIP contra a API real, Firefox | atende | seção 28, 36 de 36 OK, roteiro 288 de 288, `layout-estreito` 197 de 197, código 0 (`SCRATCH/11-e2e-api-firefox.txt`). Na rodada 6 o roteiro saía 1 no Firefox por causa da seção 10 de outra suíte; agora sai 0 |
| Nome `dc360-pacote-de-saida-AAAA-MM-DD.zip`, assinatura `PK`, tamanho maior que zero, `tabelas/ocorrencias.csv`, laudo em `documentos/` | atende | verificações da seção 28 nos dois motores ("o navegador recebe o download com o nome combinado", "assinatura PK e nao esta vazio", "traz tabelas/ocorrencias.csv", "traz um laudo de vistoria em documentos/") |
| 401 no primeiro pedido renova uma vez e baixa | atende | e2e "com 401 no primeiro pedido o painel renova UMA vez e baixa o ZIP" e "a pessoa continua no painel", dois motores; `pacote-de-saida.test.ts` 7 de 7 (`SCRATCH/01-test-web.txt`) |
| Negativo: `/pacote.zip` na raiz responde 404 | atende | sonda direta (`SCRATCH/80-sonda-e11-api.txt`): POST e GET `/pacote.zip` 404 `nao_encontrado`, `GET /saida/pacote.zip` 404 |
| Negativo: coordenador recebe 403 e a tela mostra a frase | atende | sonda: 403 `sem_permissao` "alterar os dados do município"; e2e: a frase do servidor na tela e o botão volta a poder ser usado |
| Negativo: município suspenso recebe `acesso_suspenso` com a frase de contrato | atende (servidor por teste, tela por interceptação) | `pacote-de-saida-contrato.test.ts` 8 de 8 dentro de `npm run test:api` (`SCRATCH/02-test-api.txt`); e2e: "a tela mostra a frase do servidor: O acesso deste município ao sistema foi suspenso..." nos dois motores |
| Isolamento: o pacote de A não contém linha de B | atende | sonda: administradora de Serra Alta com o id de Vale Fundo forjado em cabeçalho, query e corpo: 200, o pacote é de Serra Alta (`saida-serra-alta-mg-...zip`), 27 tabelas JSON e 27 CSV, 51 linhas, zero fora de Serra Alta (`80`, `sondas/conferir-json.mjs`); os únicos arquivos que citam Vale Fundo são 7 migrações em `esquema/`, e só em comentário de SQL (conferido por `grep`); zero ocorrência de Vale Fundo ou do id dele nos CSV |
| Autorização: coordenador de A: 403; a rota exige `exportar_dados` e `gerenciar_organizacao` | atende | sonda: operador e agente 403 "exportar dados"; coordenadores de Serra Alta e de Vale Fundo 403 "alterar os dados do município"; sem token e token lixo 401 `nao_autenticado` |
| Regressão obrigatória | atende | `test:api` código 0, 1685 aprovados, 34 pulados (`saida-de-municipio.test.ts` 37 de 37); painel 699 de 699; `test:e2e:api` código 0 em Chromium e Firefox; `test:isolamento` código 0, 345 aprovados e 3 pulados (`SCRATCH/04-test-isolamento.txt`) |
| Validação humana (Rafael baixa e abre o ZIP) | pendente | fora do alcance do validador |

## Evidência

- `npm run test --workspace @dc360/web`: código 0, 699 (`SCRATCH/01-test-web.txt`).
- `npm run test:api`: código 0 (`SCRATCH/02-test-api.txt`).
- `npm run test:isolamento`: código 0, 345 e 3 pulados (`SCRATCH/04-test-isolamento.txt`).
- `node scripts/e2e-api.mjs chromium` e `firefox`: código 0 (`SCRATCH/10-...`, `11-...`).
- Sonda contra a API real (PGlite nova, porta 3795, sem `NODE_ENV`, derrubada no fim): `SCRATCH/sondas/sonda-e11-api.mjs` (de outro validador da rodada 6, relido; só o caminho do ZIP trocado para o meu SCRATCH), saída `SCRATCH/80-sonda-e11-api.txt`. Hash do ZIP da sonda (16 primeiros caracteres do SHA-256) no fim da saída; o arquivo fica só no SCRATCH, com dado sintético.

## Cenários positivos

- Download pelo painel nos dois motores, com o nome combinado, `PK`, diretório central legível, somas SHA-256 conferidas.
- 401 no primeiro pedido renova uma vez e baixa, sem mandar para a entrada.

## Cenários negativos

- Raiz `/pacote.zip` e `GET /saida/pacote.zip`: 404.
- Coordenador, operador, agente, coordenador de outro município: 403 com a frase do servidor; sem token e lixo: 401.
- Município suspenso: frase de contrato na tela (interceptação) e `acesso_suspenso` no servidor (teste).
- Organização forjada em cabeçalho, query e corpo: o pacote continua sendo só o do município do token.

## Tentativas de reprovar

1. Forjei o município de destino por três canais ao mesmo tempo (cabeçalho `x-organizacao-id` e `x-tenant`, query e corpo): ignorados.
2. Procurei qualquer menção a Vale Fundo no ZIP inteiro, não só nas tabelas: só comentários de migração em `esquema/`.
3. Conferi se a mudança de `AcessoSuspenso` (só 403 ou 503) e a guarda nova mudaram a recusa do download: o contrato (`pacote-de-saida-contrato.test.ts`) e a frase na tela continuam iguais.
4. Rodei o Firefox inteiro (não só a seção 28) para ver se a suíte agora sai 0: sai.

## Achados

Nenhum achado que bloqueia. Nenhum achado novo nesta dimensão.

## Não verificado

- Suspensão provocada de ponta a ponta contra a API (sem interceptação): não suspendi um município por fora; o servidor está coberto por teste e a tela por interceptação.
- WebKit: o roteiro do projeto não roda `fluxo-api` no WebKit; a etapa pede Chromium e Firefox.
- Mutação para provar que o e2e morde: não refeita (edição da árvore recusada pelo ambiente); a rodada 6 registrou M1 (caminho) e M2 (permissão).
- Os logs do run 39420436042 (exigem token).

## Risco residual

O pacote é montado em memória (F07-E06 fica para depois); um município grande pode estourar memória. O laudo do pacote e o da rota ainda têm dois montadores (F09-E02).

## Motivo do humano

A etapa pede que Rafael baixe o pacote pelo painel com a API local e abra o ZIP, conferindo o que ele, como cliente, leva embora.
