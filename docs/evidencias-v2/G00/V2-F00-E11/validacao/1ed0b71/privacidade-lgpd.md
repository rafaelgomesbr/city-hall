---
validador: privacidade-lgpd
modelo: claude-sonnet-5-5
etapa: V2-F00-E11
sha_validado: 1ed0b71
ci_run: ausente
rodada: 6
herdado_de:
tags: [UI, A11Y, LGPD]
nivel_de_prova_exigido: [E1, E2, E3a]
nivel_de_prova_obtido: [E1, E2, E3a]
veredito: PASS
confianca: alta
humano_necessario: sim
escalar: nenhum
---
## Critérios verificados

Critério da etapa (campo "Impacto LGPD"): "em produção o pacote traz dado pessoal; na prova só há dado sintético, e como evidência entram apenas a lista de nomes e o hash". Risco de segurança: "o pacote é o arquivo mais sensível do produto; a rota continua exigindo `exportar_dados` e `gerenciar_organizacao`". Autorização e isolamento: "o pacote do administrador do município A não contém nenhuma linha do município B; coordenador de A: 403".

Inventário dos dados pessoais que SAEM no pacote (execução minha, `/private/tmp/claude-501/-Users-rafaelgomes-Documents-city-hall/743e49ef-b0cc-448c-8891-518b9ad66083/scratchpad/validadores/lgpd/e11/e11-colunas.txt`, 25 tabelas, 112 arquivos):

| Titular | Campos | Tabela e arquivo |
| --- | --- | --- |
| cidadão solicitante | nome, contato, endereço, coordenada, descrição, descrição de vulnerabilidade, assinatura do morador (imagem), fotos | `ocorrencias`, `vistorias`, `evidencias`, `evidencias/`, `documentos/` |
| servidor municipal | nome, matrícula, e-mail, papel, equipe, último acesso, falhas de login, foto de perfil (`usuarios/`), nome do autor em cada evento | `usuarios`, `trilha_eventos`, `trilha_administrativa`, `vistorias` |
| servidor e terceiros | IP de quem exportou ou consultou dossiê | `exportacoes.ip`, `ocorrencia_consultas.ip` |
| destinatário externo (órgão) | e-mail, IP e user-agent completo de quem abriu o link do ofício | `oficio_envios.destinatario_email`, `oficio_aberturas.ip`, `oficio_aberturas.agente_do_navegador` |

O que NÃO sai (`apps/api/src/saida/pacote.ts:206` `COLUNAS_QUE_NUNCA_SAEM`, `:149` `TABELAS_QUE_NAO_SAEM`): `usuarios.senha_hash`, `aparelhos.ficha`, `oficio_envios.token_hash`; tabelas `sessoes`, `recuperacoes_senha`, `segundo_fator`, `segundo_fator_recuperacao`, `interesse_municipio`, `eliminacoes_de_municipio`.

Controles: quem exporta (`apps/api/src/rotas/saida.ts:57-58`: `exportar_dados` e `exigirPermissao(quem.papel, "gerenciar_organizacao")`, as duas ANTES de qualquer consulta); organização só do token (`quem.organizacaoId`); registro de exportação (`exportacoes` nível `completo`, com IP) e ato administrativo gravados na mesma transação ANTES do primeiro byte (`saida.ts:76-126`); log só com ids (`saida.ts:128`); `cache-control: no-store` global (`servidor.ts:421`); método só POST em `/saida/pacote.zip` (GET e a rota da raiz dão 404).

## Evidência

- API, 12 arquivos, 187 testes, código 0, incluindo `pacote-de-saida-contrato` (8) e `saida-de-municipio` (37): `/private/tmp/claude-501/-Users-rafaelgomes-Documents-city-hall/743e49ef-b0cc-448c-8891-518b9ad66083/scratchpad/validadores/lgpd/api-e09-e10-e11.txt`. Painel `pacote-de-saida.test.ts` (7) verde em `/private/tmp/claude-501/-Users-rafaelgomes-Documents-city-hall/743e49ef-b0cc-448c-8891-518b9ad66083/scratchpad/validadores/lgpd/web-testes.txt`.
- Exportação executada por mim (API completa com semente de Serra Alta e Vale Fundo, PGlite; arquivo temporário já removido; saídas em `/private/tmp/claude-501/-Users-rafaelgomes-Documents-city-hall/743e49ef-b0cc-448c-8891-518b9ad66083/scratchpad/validadores/lgpd/e11/`):
  - plantei, na mesma conexão, user-agent e IP de sessão, hash de recuperação, ficha de push e o fluxo de login; varri TODO o conteúdo textual do ZIP (menos `evidencias/` e `usuarios/`, binários) atrás de marcador de user-agent, IPs plantados, prefixos de hash scrypt e os nomes de coluna proibidos: o único acerto está em `esquema/*.sql` (DDL genérico, igual em toda instalação, que cita `senha_hash`, `token_hash`, `user_agent`, `familia_id` como NOMES de coluna). Nenhum valor de tabela de dado. `e11-achados.txt`.
  - `e11-usuarios.json`: colunas `id, organizacao_id, nome, matricula, email, papel, equipe_id, ativo, criado_em, falhas_login, bloqueado_ate, ultimo_acesso, foto_chave, busca, foto_bytes, senha_provisoria_ate`, sem `senha_hash`.
  - Minimização por prazo versus pacote (`e11b-*`): município com retenção de 30 dias, ocorrência encerrada há 100 dias com marcadores no nome, contato, descrição e vulnerabilidade; depois de `minimizarPorPrazo` (4 campos), o pacote NÃO traz nenhum dos marcadores (varredura de todos os arquivos); o endereço (que a política não minimiza) continua. A coluna derivada `busca` também saiu limpa (`e11b-linha-depois.json`: `"... removido por prazo"`).

## Cenários positivos

Administradora recebe 200 e ZIP (247 298 bytes na minha execução) com índice, `LEIA-ME.txt`, `SOMAS-SHA256.txt` e `PENDENCIAS-DA-EXTRACAO.txt`; a exportação aparece em `exportacoes` (`e11-exportacoes-banco.json`: nível `completo`, tipo `saida_de_municipio`) e em `trilha_administrativa` (`e11-trilha_administrativa.json`, com `nadaFoiApagado: true`).

## Cenários negativos

Executados por mim (`/private/tmp/claude-501/-Users-rafaelgomes-Documents-city-hall/743e49ef-b0cc-448c-8891-518b9ad66083/scratchpad/validadores/lgpd/neg/negativos.json`):
- administrador 200; coordenador 403 `sem_permissao`; operador 403; agente 403; sem token 401.
- com token de administradora de Serra Alta, `?organizacao_id=<Vale Fundo>` na URL, cabeçalhos `x-organizacao-id` e `x-organizacao` e corpo com `organizacao_id`/`organizacaoId` de Vale Fundo: 200, mas o único id em `organizacoes.json` é o de Serra Alta e nenhum arquivo de dado cita um id de Vale Fundo (varredura textual). A organização vem só do token.
- Mutação (tirei `senha_hash` e `ficha` de `COLUNAS_QUE_NUNCA_SAEM`; restaurado com `git restore` e `cmp`): 2 testes reprovam, um em `pacote-de-saida-contrato` ("coluna proibida não sai, nem o valor dela") e um em `saida-de-municipio` ("nem hash de senha, nem token de sessão, nem ficha"), 43 verdes (`/private/tmp/claude-501/-Users-rafaelgomes-Documents-city-hall/743e49ef-b0cc-448c-8891-518b9ad66083/scratchpad/validadores/lgpd/mut-colunas-e11.txt`). O teste morde.
- Município suspenso: 403 `acesso_suspenso` sem registro de exportação (`pacote-de-saida-contrato`, verde).

## Tentativas de reprovar

1. Procurei segredo no ZIP por varredura de valor (não só de coluna): nada.
2. Procurei dado de cidadão que a minimização já devia ter apagado: não volta.
3. Procurei dado de outro município por parâmetro, cabeçalho e corpo: não entra.
4. Tentei exportar com cada papel diferente de administrador e sem token: 403 e 401.
5. Tentei achar a senha, o token ou o IP no log do servidor durante a exportação: o log da rota grava só `organizacao` e `por` (ids).
6. Desfiz a proteção das colunas para ver o teste reprovar: reprova.

## Achados

- anotado: o pacote leva IP completo de servidor (`exportacoes`, `ocorrencia_consultas`) e IP mais user-agent completo de destinatário externo (`oficio_aberturas`). É registro do próprio município e serve à prestação de contas, mas é mais do que a finalidade "reconstituir a operação" exigiria; avaliar na V2-F05-E12 (expurgo) se o pacote leva a versão expurgada.
- anotado: a coluna derivada `busca` repete nome, matrícula e e-mail do servidor (e dados da ocorrência) no CSV e no JSON; redundância sem ganho para o titular.
- anotado: o ZIP sai sem cifra nem senha, e o próprio `LEIA-ME.txt` e `docs/SAIDA-DE-MUNICIPIO.md` admitem que viaja por e-mail ou pen drive; a proteção é de processo (quem pode baixar, registro prévio), não do arquivo. Revisar com profissional.
- anotado (fora da dimensão): a frase de 403 do coordenador diz "alterar os dados do município" onde a pessoa quis baixar (texto do catálogo de permissões, F03).
- o contexto aponta `TRAVA [dependencia]: V2-F00-E01 BLOQUEADA`: assunto do gatekeeper, não desta dimensão.

## Não verificado

- Pacote com dados de produção real, volume grande e armazenamento real (fotos e assinaturas): a prova usa a semente sintética e armazenamento em memória; o conteúdo binário de `evidencias/` e `usuarios/` não foi inspecionado, só listado.
- Que o download no navegador apague ou não deixe cópia (cache, pasta Downloads): fora do controle do produto.
- Base legal da saída, papel do fornecedor como operador, prazo de guarda do ZIP no município e cifra em trânsito: profissional.
- Firefox, WebKit e a UI do botão: dimensões de UX e acessibilidade.
- Postgres 17 real: não necessário para esta prova (PGlite aplica as mesmas migrações e policies).

## Risco residual

O pacote concentra toda a base de cidadãos em arquivo sem cifra nas mãos de quem baixa; mitigado por permissão dupla, registro prévio e `no-store`, mas a guarda posterior é do município.

## Motivo do humano

Um profissional precisa confirmar a base legal da entrega do pacote ao controlador, a cláusula de reversibilidade no contrato e a orientação de guarda e cifra do ZIP no município. Rafael ainda precisa baixar o pacote pelo painel e abrir o ZIP (validação humana da etapa).
