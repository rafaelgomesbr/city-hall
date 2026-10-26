---
validador: qa
modelo: claude-opus-5-5
etapa: V2-F00-E11
sha_validado: 4ce0433
ci_run: ausente
rodada: 5
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

Comandos rodados por mim no SHA `4ce0433` (árvore principal em `3ce67c7`) ou num worktree meu destacado em `4ce0433`. Saídas em `/private/tmp/claude-501/-Users-rafaelgomes-Documents-city-hall/768bf074-5845-4f2d-bff9-57106bf57383/scratchpad/val/L13-qa/saidas/` (abaixo, `saidas/`). A correção 4 não tocou os arquivos da etapa (`git diff bb0f654..4ce0433` vazio em `http.ts`, `Organizacao.tsx`, `rotas/saida.ts`); só o texto do capítulo de suspensão de `SAIDA-DE-MUNICIPIO.md` mudou, e o capítulo 4 continua descrevendo o botão como está.

| Critério | Resultado | Prova |
| --- | --- | --- |
| DoD e positivo: o botão baixa o ZIP em dois navegadores contra a API real | PASS | `node scripts/e2e-api.mjs chromium` e `firefox` (roteiro completo, sem cópia aparada): "Passou: 288 Falhou: 0" nos dois, código 0; seção 28 com 36 de 36 OK em cada motor: "o navegador recebe o download com o nome combinado", "o arquivo baixado comeca com a assinatura PK e nao esta vazio", "traz tabelas/ocorrencias.csv", "traz um laudo de vistoria em documentos/" (`saidas/e2e-01-api-chromium.txt`, `saidas/e2e-02-api-firefox.txt`) |
| Positivo: um 401 no primeiro pedido renova e baixa | PASS | e2e 28 "com 401 no primeiro pedido o painel renova UMA vez e baixa o ZIP" e "a pessoa continua no painel"; `apps/web/test/pacote-de-saida.test.ts` 7 de 7 dentro de 669 de 669 |
| Negativo: `/pacote.zip` na raiz responde 404 | PASS | e2e 28 "POST /pacote.zip na raiz e 404" e "GET /saida/pacote.zip tambem nao baixa nada"; `pacote-de-saida-contrato.test.ts` 8 de 8 |
| Negativo: coordenador recebe 403 e a tela mostra a frase | PASS | e2e 28 "a coordenadora recebe 403 sem_permissao da API" e "a tela mostra a frase do servidor"; contrato da API |
| Negativo: município suspenso recebe `acesso_suspenso` com a frase de contrato | PASS | contrato da API (403 `acesso_suspenso`, sem registro de exportação); e2e 28 "a tela mostra a frase do servidor: O acesso deste município ao sistema foi suspenso" |
| Autorização e isolamento: pacote de A sem linha de B; coordenador de A: 403 | PASS | e2e 28 "toda linha de toda tabela e de Serra Alta", "nenhum arquivo de dado cita Vale Fundo nem o id dele", "o cadastro de organizacoes do pacote e so o de Serra Alta"; contrato confere linha a linha pelo `organizacao_id` |
| Regressão: `npm run test:api` (`saida-de-municipio.test.ts`) | PASS | 1451 aprovados, 34 pulados (Postgres real, outro arquivo), código 0; `saida-de-municipio.test.ts` 37 de 37 e `pacote-de-saida-contrato.test.ts` 8 de 8 (`saidas/reg-01-test-api.txt`) |
| Regressão: `npm run test --workspace @dc360/web` | PASS | 669 de 669, código 0 (`saidas/reg-02-test-web.txt`) |
| Regressão: `npm run test:e2e:api` | PASS | acima |
| Regressão: `npm run test:isolamento` | PASS | 345 e 3 pulados, código 0 |
| Documentação | PASS | `dc360/docs/SAIDA-DE-MUNICIPIO.md` linhas 84 e 99 (rota certa, botão provado pela seção 28); `apps/web/PENDENCIAS.md` seção 8 |

## Evidência

- `node scripts/e2e-api.mjs chromium` e `node scripts/e2e-api.mjs firefox` no worktree (API e painel novos em 3691 e 4691, derrubados pelo próprio roteiro; conferi as portas livres depois): código 0 nos dois.
- `npm run test:api`, `npm run test --workspace @dc360/web`, `npm run test:isolamento`: código 0.
- Mutação no worktree: `chamar<Blob>("/saida/pacote.zip"` trocado por `"/pacote.zip"` (o defeito original): `pacote-de-saida.test.ts` 2 falhas de 7, código 1 (`saidas/e11-e13-mutacoes/E11-M1-caminho-antigo.txt`); arquivo restaurado.

## Cenários positivos

- Download real pelo botão em Chromium e Firefox, ZIP aberto por leitor independente, somas SHA-256 conferidas arquivo a arquivo.
- 401 no primeiro pedido renova uma vez e baixa; a pessoa fica em Organização.
- Botão "Gerando" desabilitado durante a geração e de volta depois; 44 px de altura a 390 px, sem rolagem horizontal em 1280 e 390.

## Cenários negativos

- Rota da raiz 404 em POST e GET, e `GET /saida/pacote.zip` também não baixa.
- Coordenadora: 403 `sem_permissao` real da API.
- Suspenso: 403 `acesso_suspenso` (contrato na API; tela por interceptação, porque o e2e não suspende município).
- Rede caída: "o arquivo nao foi baixado", e não a frase de formulário.
- Isolamento: nenhuma linha, id ou nome de Vale Fundo no pacote de Serra Alta; nenhuma coluna proibida (`senha_hash`, `ficha`, `token_hash`) nem tabela de credencial.

## Tentativas de reprovar

1. Devolvi o caminho antigo no cliente: o teste do painel reprova (mutação E11-M1). A prova do defeito continua mordendo.
2. Rodei o roteiro e2e COMPLETO (não a cópia aparada da evidência original) nos dois motores: a seção 28 é alcançada e passa, o que a rodada 3 não conseguia por causa da E18.
3. Procurei como uma pessoa sem `gerenciar_organizacao` chegaria ao botão: a página está atrás de `<Exige acao="gerenciar_organizacao">` (`App.tsx:155`), então o 403 na tela só aparece para quem perdeu o papel com a tela aberta; nesse caso a frase do servidor é "Seu perfil não tem permissão para alterar os dados do município", que fala em alterar quando a pessoa quis baixar. A etapa a declara em `apps/web/PENDENCIAS.md` seção 8 (texto do catálogo de permissões, F03). Português correto, e o estado só é alcançável por rebaixamento no meio da sessão; anotado.
4. Conferi que a correção 4 não mexeu nos arquivos da etapa e que o texto novo de `SAIDA-DE-MUNICIPIO.md` (leitura sob suspensão grava `ocorrencia_consultas`) não contradiz o capítulo 4.

## Achados

- Anotado: a frase do 403 `sem_permissao` no cartão de saída diz "alterar os dados do município" para um download (item 3 acima). Declarada pela etapa, dona F03; fora do que a E11 cria (a frase vem do catálogo de permissões do shared).
- Anotado (declarado): os outros downloads do painel (`baixarCsvDeOcorrencias`, `abrirDocumento`, `abrirOficio`) seguem com `fetch` solto, sem renovação de 401 (E23 ou F10).

Motivo do veredito da rodada 4: PASS (QA, UX, LGPD; Acessibilidade rebaixada para "corrige antes de crescer", dono V2-F10-E11). Nada a consertar pela correção 4 nesta etapa; nada regrediu: e2e completo verde nos dois motores e a mutação do caminho morde.

## Não verificado

- Abrir o ZIP à mão e julgar o conteúdo como entrega ao município: validação humana.
- WebKit (a etapa pede Chromium e Firefox).
- CI do SHA: ausente nesta sessão.

## Risco residual

O pacote continua montado inteiro na memória do servidor e da aba (F07-E06); para um município grande, o botão pode falhar por memória. A prova usa só a semente sintética.

## Motivo do humano

A etapa pede que Rafael baixe o pacote pelo painel com a API local e abra o ZIP: é aceite de entrega a município, não reproduzível por teste.
