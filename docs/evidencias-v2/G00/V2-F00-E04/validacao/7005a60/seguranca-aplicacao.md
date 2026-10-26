---
validador: seguranca-aplicacao
modelo: claude-sonnet-5-5
etapa: V2-F00-E04
sha_validado: 7005a60cd70b30a4f455a96a64c4d7a3abb2819f
ci_run: 37739535524
rodada: 1
herdado_de:
tags: [AUTH, AUTHZ, TENANT, API]
nivel_de_prova_exigido: [E1, E2]
nivel_de_prova_obtido: [E1, E2]
veredito: PASS
confianca: media
humano_necessario: sim
escalar: risco aceito explícito do Rafael sobre GET que escreve e exporta dado pessoal com conta desativada (Achado 1)
---
## Critérios verificados

HEAD 665b2be só muda `docs/roadmap-v2/STATUS.md`; o código de produto é o de 7005a60. Régua: ASVS 4.0 nível 2, V3 (sessão) e V4 (acesso).

- **Escrita com conta desativada, papel diferente do token e sessão encerrada nega, em TODA rota de escrita (V4.1.1, V3.3.1)**: varredura própria, `seg/sonda.test.ts` (scratchpad). Quatro papéis reais (administrador, coordenador, operador, agente de campo) x três estados (conta desativada, papel diferente no banco, sessão revogada) x as 51 rotas não-GET que exigem token (enumeradas pelo `rotasRegistradas` do próprio servidor montado, corpo `{}`). Resultado: 12 de 12 combinações, 612 requisições, zero fora do esperado. Esperado: 403 `conta_desativada`, 401 `nao_autenticado`, 401 `sessao_encerrada`, nessa ordem, antes de validar o corpo e antes de `exigirPermissao`.
- **Ordem dos controles em `exigirAutenticacao`**: suspensão do município vem antes da conta (`auth/vigencia.ts:148-149`). Mutação M1 (troca de ordem): 1 caso reprova de 33. O teste morde.
- **Papel do token diferente do banco**: rebaixamento e promoção negam com 401. Mutação M6 (`if (false)` no papel): 4 de 33 reprovam.
- **`sid` de outra pessoa**: mutação M3 (tirar `s.usuario_id = u.id`): 1 de 33 reprova.
- **Senha provisória vinda do banco**: mutação M2 (voltar a `conteudo.sp`): 1 de 33 reprova.
- **Sessão rotacionada só vale com a cadeia viva (E07, mas é a mesma consulta)**: mutação M5 (tirar o `EXISTS` da família): 7 de 33 reprovam.
- **Zero `skip` e o teste original religado**: `vigencia-na-escrita.test.ts` + `familia-da-sessao.test.ts`, 33 de 33 verdes sem mutação (base das mutações acima).
- **Isolamento e resposta 404, nunca 403**: `seg/iso.test.ts`. Administrador do município B, 84 comparações (rotas com `:id` x ocorrência, usuário e equipe reais do município A x id inexistente): corpo e status idênticos nas 84, zero diferença. `vigencia.ts` faz `LEFT JOIN usuarios ... AND u.organizacao_id = o.id`, então `sub` de outro município vira 401 `sessao_encerrada`, não 403 `conta_desativada`: não distingue "existe em outro município" de "não existe".
- **Rotas de escrita sem `exigirAutenticacao`**: só as da lista `SEM_TOKEN` (entrar, segundo-fator, renovar, sair, recuperar, redefinir, `PUT /armazenamento/objeto` por URL assinada, `POST /publico/interesse`). Cada uma autentica por outro artefato; fora do contrato da E04 (renovação é E07).

## Evidência

Saídas em `C:/Users/Rfasg/AppData/Local/Temp/claude/c--Projetos-city-hall/78869014-3ace-4efd-a059-e24f265aea3c/scratchpad/seg/`:
- `saida1.txt`: varredura 12 combinações, exit 0, "51 rotas, fora do esperado: 0" em todas.
- `saida2.txt`: GETs com conta desativada (contagem de linhas de todas as tabelas antes e depois de cada GET), exit 0.
- `saida3.txt`: CSV nível completo com administrador desativado, exit 0.
- `saida4.txt`: isolamento A/B, exit 0.
- `mut_M1_ordem.txt`, `mut_M2_sp_do_token.txt`, `mut_M3_sid_alheio.txt`, `mut_M5_familia.txt`, `mut_M6_papel.txt`: exit 1 (reprovam, como deve).
- `mut_M7_sweep.txt` e `mut_M7_resto.txt`: ver Achado 2.
- Todas as mutações desfeitas com `git restore`; `git status --porcelain` termina só com `?? docs/evidencias-v2/G00/V2-F00-E04/validacao/`.

## Cenários positivos

Conta ativa escreve 200 (casos "antes" dos 33 testes; antes do bloqueio na sonda de CSV). Rotação mantém o token antigo valendo; marca `sp` do token sem prazo no banco não tranca; quem encerra "as outras sessões" mantém a sua. Todos verdes sem mutação.

## Cenários negativos

- 12 combinações de varredura acima (papel x estado), 51 rotas cada.
- Município suspenso com conta desativada: 403 `acesso_suspenso` (suspensão primeiro).
- Município B contra id do município A: resposta indistinguível de id inexistente (84 comparações). Limite: com corpo `{}` parte das rotas devolve 422 antes de consultar o recurso; os casos com lookup (GET e DELETE por id, 404) estão dentro das 84.
- Conta desativada tentando `POST /ocorrencias/:id/coordenada` depois de exportar: 403 `conta_desativada`.

## Tentativas de reprovar

1. Procurei rota de escrita que escape de `exigirVigencia`: varredura de 51 rotas x 12 combinações. Nenhuma escapa no SHA.
2. Procurei o caminho que o teste não cobre: mutei a definição de "escrita" para só `POST` (M7). A varredura própria reprova 7 rotas por combinação (`PATCH /usuarios/:id`, `PATCH /usuarios/:id/situacao`, `PATCH /equipes/:id`, `PATCH /orgaos/:id`, `PATCH /organizacao/retencao`, `PUT` e `DELETE /usuarios/eu/foto`), mas os 33 testes de vigência/família e mais 11 arquivos relacionados (232 testes: api, superficie, sessoes-da-conta, senha-e-sessoes, senha-provisoria, acesso-suspenso, codigos-de-erro, familia-da-sessao, saida-de-municipio, eliminacao-de-municipio, foto-do-agente) PASSAM com a mutação. Ver Achado 2. Não rodei a suíte inteira com M7.
3. GET que escreve com conta desativada (contagem de linhas de todas as tabelas públicas antes/depois, 3 papéis): `GET /avisos` (Rita) e `GET /relatorios/ocorrencias.csv` (Rita e Helena) escrevem. Detalhe no Achado 1. Nenhum outro GET escreve.
4. CSV nível `completo` com administrador DESATIVADO: 200, 3198 bytes com as colunas de pessoa, e a trilha administrativa ganhou uma linha (1 para 2). Ver Achado 1.
5. `sid` de outra pessoa com `sub` da vítima, `sp` forjado, `sub` de outro município: todos negados (testes e mutação M3).
6. Ordem suspensão x conta, papel e família: mutações M1, M5, M6 reprovam teste. Os testes mordem.
7. Corrida entre desativar e escrever: não construí teste. Pela leitura de `servidor.ts:481` e das rotas, `lerVigencia` abre transação própria (`comTenant`) e a rota abre outra depois de `exigirAutenticacao`: há uma janela de milissegundos em que uma desativação concorrente passa. O PGlite dos testes é de conexão única, então a corrida real não se reproduz ali. Ver Achado 3.

## Achados

1. **corrige antes de crescer (registrar como risco aceito ou fechar antes de produção): `GET /relatorios/ocorrencias.csv` escreve em GET e entrega dado pessoal a conta desativada.**
   Reprodução (`seg/gets.test.ts` e `seg/csv.test.ts`): ativar sessão, desativar a conta por SQL, `GET /relatorios/ocorrencias.csv?nivel=completo&justificativa=...` com o token antigo. Resposta 200 com as colunas de pessoa (nome e contato do solicitante, vulnerabilidade, descrição), `INSERT INTO exportacoes` e `registrarAtoAdministrativo` na trilha (append-only) com a identidade desativada. A mesma conta, no mesmo instante, recebe 403 `conta_desativada` em qualquer POST.
   Respondendo à pergunta do gatekeeper:
   - É escrita escondida em GET? Sim, no sentido do banco: duas linhas em tabelas de auditoria. Não é bypass de `exigirPermissao`: a rota chama `autorizar(app, req, "exportar_dados")` e `exigirPostoParaDadoPessoal`. O que falta é a vigência, não a permissão.
   - A régua ASVS: V4.1.1 (controle de acesso no serviço confiável, a cada pedido) e V3.3.1 (sessão que deveria ter acabado) são violadas pela leitura de dado pessoal, que é o dano maior. A escrita de auditoria é o sintoma, não o dano: o registro correto de quem exportou é desejável, só que não deveria acontecer porque a conta deveria ter sido barrada antes.
   - Dentro ou fora da E04? Fora pela letra do bloco: "vigência em LEITURAS (F03-E03)" e "leituras que escrevem seguem fora". Mas o bloco, `PENDENCIAS.md` e o comentário em `vigencia.ts:47-50` nomeiam só `GET /avisos` como a exceção. O CSV é da mesma classe e a lista está incompleta, e o impacto é maior do que a lista sugere: administrador desativado por suspeita de credencial roubada ou desligamento exporta a base de nomes de cidadãos (LGPD) por até 15 minutos (60 se `ACESSO_MINUTOS` subir). Por isso não bloqueia a etapa, mas a decisão de implantar com esse risco é do Rafael, registrada em RISCO-ACEITO. Correção barata: marcar rotas com efeito (`config: { comEfeito: true }`) e fazer `escrita ||= req.routeOptions.config.comEfeito` em `servidor.ts:478`, cobrindo `GET /avisos` e o CSV sem esperar a F03-E03; ou, no mínimo, acrescentar o CSV (e a trilha) à lista de `PENDENCIAS.md` e do comentário de `vigencia.ts`.
2. **corrige antes de crescer: nenhum teste do repositório prova a vigência em PATCH, PUT e DELETE.** `escrever()` de `vigencia-na-escrita.test.ts` usa só `POST /ocorrencias/:id/coordenada`. Reprodução: em `servidor.ts:478`, trocar `req.method !== "GET" && req.method !== "HEAD"` por `req.method === "POST"`; `vigencia-na-escrita`, `familia-da-sessao` e mais 9 arquivos de acesso e sessão passam (232 testes). Efeito de um erro assim: administrador, coordenador ou agente desativado voltam a editar usuários, ativar ou desativar contas, alterar retenção do município e trocar foto, sem que o portão acuse. O código atual está correto; o buraco é de teste. Correção: um teste que enumere `rotasRegistradas` e confirme, para cada método de escrita, a recusa com conta desativada (a mesma varredura de `seg/sonda.test.ts`, 40 linhas), de modo que rota nova de escrita nasça coberta.
3. **anotado: condição de corrida entre desativar e escrever.** `lerVigencia` e a transação da rota são separadas; uma desativação concorrente a uma escrita em voo passa. É inerente a não ter lista de revogação ou cache (decisão do bloco) e a janela é de milissegundos. Fechá-la exigiria conferir a vigência dentro da transação da rota (F03-E03, `comTenant`). Não testei sob concorrência.
4. **anotado**: o bloco diz 401 para conta desativada e o SHA entrega 403 `conta_desativada` (E05). Escolha defensável (401 faz o cliente entrar de novo em laço), só o texto do bloco precisa acompanhar. Já registrado no relatório de QA.
5. **anotado**: `PUT /armazenamento/objeto` autentica por URL assinada de vida curta; conta desativada logo depois de pedir a URL ainda sobe o objeto dentro da validade. O registro da evidência (`confirmar-envio`) passa pela vigência, então o objeto fica órfão. Não verifiquei o tempo de validade nem o descarte do órfão.

## Não verificado

- Corrida real (desativação concorrente a escrita em voo) e carga: PGlite é de conexão única; sem Postgres real com conexões paralelas nesta sessão.
- Execução contra Postgres real: todas as sondas rodam em PGlite (como os testes da suíte). A consulta de `lerVigencia` é SQL padrão (LEFT JOIN, EXISTS), risco baixo, não provado em Postgres 17.
- Suíte inteira da API com a mutação M7: só 11 arquivos relacionados; outro arquivo pode ter capturado M7.
- Isolamento A/B com payload válido: usei `{}`, então rotas que validam corpo antes do lookup responderam 422 igual nos dois casos; os 404 e 403 de lookup estão cobertos, mas o corpo válido não foi exercitado em todas as rotas.
- Fluxos de renovação, reuso e senha provisória em profundidade (E07), e o efeito de 401/403 sobre a fila do campo (E06).
- Validação em navegador (painel) e aparelho; E2E "desativar no painel e ver o próximo POST falhar" não existe como teste de navegador.
- Validade da URL assinada do armazenamento (Achado 5).

## Risco residual

- Até a F03-E03: conta desativada lê tudo que seu papel lê por até 15 minutos, incluindo exportação CSV (básica e, para administrador, com dado pessoal) e `GET /avisos`, com escrita de auditoria no processo.
- Sem E05 e E06, não implantar (o campo trata 401 como falha permanente; agora 403 `conta_desativada` também precisa ser tratado).
- Janela de milissegundos entre `lerVigencia` e a transação da rota.
- Cobertura de PATCH, PUT e DELETE depende de ninguém mexer na definição de "escrita" sem teste que a guarde.

## Motivo do humano

O Rafael decide se implanta com o Achado 1 aceito (registrar em `RISCO-ACEITO.md`) ou manda fechar antes, porque é risco de dado pessoal (LGPD) e não critério técnico; e a validação "ver a sonda antes e depois" do bloco continua pendente, como no relatório de QA.
