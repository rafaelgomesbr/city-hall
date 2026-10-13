---
validador: qa
modelo: claude-sonnet-5-5
etapa: V2-F00-E11
sha_validado: 7005a60cd70b30a4f455a96a64c4d7a3abb2819f
ci_run: 37739535524
rodada: 1
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
Base: HEAD 665b2be (só difere de 7005a60 no STATUS, conferido por `git diff 7005a60 HEAD --stat`). Árvore sem arquivo alterado além de pastas `validacao/`.

- Botão baixa o ZIP em dois navegadores contra a API real: `node scripts/e2e-api.mjs chromium` e `... firefox`, ambos 271 de 271 OK, zero erro de console, código 0 (scratchpad `e2e-chromium.txt`, `e2e-firefox.txt`). A seção 28 (36 verificações) confere nome `dc360-pacote-de-saida-AAAA-MM-DD.zip`, assinatura PK, tamanho > 0, `tabelas/ocorrencias.csv`, laudo em `documentos/`, soma SHA-256 de cada arquivo, só Serra Alta. CI 37739535524 (9 de 9 verdes, inclui "Fluxo ponta a ponta no navegador" e "Testes, tipos e scripts") confere com o SHA.
- 401 renova uma vez e baixa: caso de `apps/web/test/pacote-de-saida.test.ts` (passou) e verificação da seção 28 ("com 401 no primeiro pedido o painel renova UMA vez e baixa"). Renovação que não adianta para sem laço: caso próprio, passou.
- Revogação do endereço depois do download: lido em `Organizacao.tsx` (relógio de 30 s em `useEffect` com limpeza). O portão de temporizador não reprova o arquivo (`npm run test --workspace @dc360/web`: 43 arquivos, 643 testes, 0 falhas).
- Frase do servidor na recusa: seção 28 ("a tela mostra a frase do servidor: Seu perfil não tem permissão..." e "...O acesso deste município ao sistema foi suspenso...") e a captura `capturas/saida-erro-sem-permissao-390-escuro.png` (vista por mim).
- Regressão: `npm run typecheck` código 0; `npx vitest run test/saida-de-municipio.test.ts test/pacote-de-saida-contrato.test.ts` 33 de 33.

## Evidência
- `cd dc360 && npm run build:shared` 0; `npm run test --workspace @dc360/web` 0 (scratchpad `web.txt`).
- API: 2 arquivos, 33 testes, 0 falhas (`api-saida.txt`).
- e2e API: Chromium e Firefox, 271/271 (arquivos acima). Local `node test/fluxo.e2e.mjs` Chromium e Firefox, 70/70 (para provar que a E11 não quebrou o modo local).
- ZIP abrido por leitor independente da seção 28 e do `ler-zip.ts`; lista de nomes arquivada em `docs/evidencias-v2/G00/V2-F00-E11/pacote/` (109 nomes nas duas rodadas).

## Cenários positivos
Administradora de Serra Alta clica e recebe o arquivo (Chromium e Firefox); 401 provocado renova e baixa; botão diz "Gerando" e fica desabilitado; volta ao normal; 1280 e 390 px sem rolagem horizontal e toque de 44 px.

## Cenários negativos
- `POST /pacote.zip` na raiz: 404 (seção 28 e contrato). `GET /saida/pacote.zip`: 404.
- Coordenadora (tem `exportar_dados`, não tem `gerenciar_organizacao`): 403 `sem_permissao` pela API real, e a tela mostra a frase. Outro papel digitando `/organizacao` esbarra em `Exige`.
- Município suspenso: 403 `acesso_suspenso`, sem registro de exportação (contrato). Na tela a frase de contrato aparece por interceptação (o e2e não suspende município).
- Isolamento: contrato confere linha a linha o `organizacao_id`; o pacote de Serra Alta não cita Vale Fundo; organização pedida por parâmetro, cabeçalho ou corpo não troca de município.
- Rede caída, inclusive no meio do corpo: "O arquivo não foi baixado".

## Tentativas de reprovar
- Mutação 1: troquei `/saida/pacote.zip` por `/pacote.zip` em `http.ts`. `pacote-de-saida.test.ts`: 2 de 7 reprovam (caminho e 401 que renova). Os outros 5 passam porque o mock aceita qualquer URL (esperado: recusa e rede não dependem do caminho). Desfeito com `git restore`.
- Procurei corrida de dois cliques (botão desabilitado em `baixando`), saída da tela antes dos 30 s (a limpeza do efeito revoga na hora, o download já começou: aceitável) e `cache-control` do pacote (`servidor.ts:368` aplica `no-store` global).
- Caminho antigo e GET na rota nova: 404, não 403 nem 200.
- Não achei como baixar o pacote com papel menor ou de outro município.

## Achados
1. ANOTADO. A frase do 403 diz "alterar os dados do município" para quem tentou baixar (a captura mostra). Já registrada pelo implementador em `apps/web/PENDENCIAS.md` seção 8.3, dono F03.
2. ANOTADO. Município suspenso não consegue levar os próprios dados. É premissa registrada (CP-29, jurídico), não defeito de código.
3. ANOTADO. Os outros downloads do painel (CSV, documento, ofício) seguem com `fetch` solto, sem renovar 401. Registrado (E23 ou F10).

Nenhum item bloqueia.

## Não verificado
- Validação humana pedida pela etapa (Rafael baixa o pacote e abre o ZIP).
- Download com ZIP grande (o pacote da semente tem ~235 KB; o cancelamento de blob grande ao sair da tela em menos de 1 s não foi testado). Pacote montado inteiro em memória: F07-E06.
- WebKit, Android e iOS.
- Recusa de município suspenso na tela com suspensão real (só interceptação).
- Não rodei `test:isolamento` nesta etapa (a E11 não toca o banco; o CI roda).

## Risco residual
Memória do servidor e da aba com município grande (F07-E06). Frase de permissão enganosa (F03).

## Motivo do humano
A etapa exige que uma pessoa baixe o ZIP pelo painel e o abra. Não bloqueia o veredito de QA, é conferência pendente registrada no STATUS.
