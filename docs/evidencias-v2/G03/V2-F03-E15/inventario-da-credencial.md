# Inventário da credencial (V2-F03-E15, antes do passo 1 da P-04)

A ADR 0009 (decisão 1, "Inventário") pede à E15 a lista completa e conferida de
tudo o que lê ou grava a credencial (`senha_hash`, `falhas_login`,
`bloqueado_ate`, `senha_provisoria_ate`), o e-mail que recebe a recuperação, a
ligação entre conta e pessoa, e todo emissor de prova de autenticação, inclusive
o console. Foi levantada no SHA da base desta parte (`4c809533`, `origin/v2/f03`)
mais a 054, por duas vias:

- **banco:** toda função do esquema `public` cujo corpo cita um desses termos,
  perguntada ao catálogo depois de toda a cadeia de migrações. A lista é
  CONFERIDA por `dc360/db/test/pessoas.test.ts` ("o inventário da credencial
  bate com o banco"): função nova que cite um dos termos e não esteja no
  inventário reprova, salvo se nascer numa migração depois da 054;
- **código:** busca por `senha_hash`, `falhas_login`, `bloqueado_ate`,
  `senha_provisoria_ate`, `credenciais_para_login`, `abrir_recuperacao`,
  `consumir_recuperacao`, `trocar_senha`, `registrar_tentativa_login` e
  `INSERT INTO usuarios` / `UPDATE usuarios` em `apps/*/src`, `db/seeds`,
  `db/src` e `scripts`.

A coluna "Na ADR?" diz se o item já constava do ponto de partida da ADR. Os
itens marcados **NÃO** são as divergências que vão para o RESUMO.

## 1. Banco: funções, gatilhos e sementes

| Item | O que faz hoje (depois da 054) | Na ADR? | Etapa dona e o que ela faz |
| --- | --- | --- | --- |
| `credenciais_para_login(text)` (002, 013, 046) | SECURITY DEFINER, antes do tenant: lê `senha_hash`, `bloqueado_ate`, `senha_provisoria_ate` e o e-mail na CONTA | sim | E02 troca a leitura por `credenciais_da_pessoa`; E08 a retira ou a deixa só de leitura em `pessoas`; caminho antigo da 064 |
| `credenciais_da_pessoa(text)` (054) | SECURITY DEFINER, antes do tenant: lê a credencial na PESSOA, com cada conta dela | nova | E15 cria; E02 chama; E09 (056) redefine |
| `registrar_tentativa_login(uuid,boolean,integer,interval)` (002) | grava `falhas_login`, `bloqueado_ate` e `ultimo_acesso` na conta pelo id recebido; o espelho leva falhas e bloqueio à pessoa | sim | E08 grava em `pessoas`, conferindo quem pede; `ultimo_acesso` fica na conta; E20 (066) redefine |
| `trocar_senha(uuid,text,uuid)` (005, 049) | grava `senha_hash`, zera falhas e bloqueio na conta pelo id recebido; espelhado | sim | E08: só a própria pessoa, senha atual relida sob a trava, escopo global |
| `abrir_recuperacao(text,text,interval,text)` (005) | procura o e-mail em `usuarios` ativos e cria o link para a conta | sim | E08 procura em `pessoas`, link para a PESSOA, consulta fora do pedido (trabalhador) |
| `consumir_recuperacao(text,text)` (005, 049, 051) | grava `senha_hash`, zera falhas e bloqueio da conta do link; espelhado | sim | E08 grava em `pessoas`, escopo global |
| `senha_trocada_deixa_de_ser_provisoria()` (046, gatilho BEFORE UPDATE OF senha_hash de `usuarios`) | zera `senha_provisoria_ate` na conta quando a senha muda sem carimbo novo; o espelho leva o valor final | sim | E08 move para `pessoas` |
| `invalidar_recuperacoes_pendentes()` (051, gatilho `recuperacoes_morrem_com_a_credencial`) | mata os links da conta quando `senha_hash` ou `ativo` muda | sim | E08 separa: credencial na pessoa mata os da pessoa (global); `ativo` da conta mata os da conta (local) |
| `sessao_por_token(text)` (002, 013, 046) | SECURITY DEFINER, antes do tenant: na RENOVAÇÃO lê `senha_provisoria_ate` e `ativo` da CONTA | **NÃO** | sem dono escrito na ADR. Proposta: E02 (passo 2, a API lê da pessoa) troca a leitura de `senha_provisoria_ate` para a pessoa, ou a E08 a redefine; ver RESUMO |
| `dono_do_token(text)` (002, 046, 048) | devolve conta e motivo de recusa do token de renovação (não lê credencial) | sim | E08 devolve a organização e confere o tenant |
| `abrir_sessao(...)` (002, 047, 049, 050) | emite a sessão; desde a 054 o gatilho `sessao_carrega_a_pessoa` põe a pessoa na sessão | sim | E08 confere conta, pessoa e município juntos; E16 os chama na escolha e na troca |
| `revogar_sessao`, `revogar_sessoes_do_usuario`, `travar_sessoes_do_usuario` (002, 049) | trava e revoga por CONTA | sim | E08 mantém por conta (local) e cria o escopo global por pessoa |
| `travar_pessoa(uuid)`, `travar_pessoa_da_conta(uuid)` (054) | trava N2 da pessoa, chave própria | sim (criadas aqui) | E15 cria; E08, E09, E10, E11 usam |
| `conta_ganha_pessoa()` (054, gatilhos `usuarios_ganha_pessoa` e `usuarios_origem_da_pessoa`) | cria a pessoa NOVA da conta que chega sem pessoa, grava a marca `criador`; o adiado confere a origem | sim (criado aqui) | E15 cria; E10 (058) redefine para aceitar a marca `aceite` |
| `pessoa_espelha_a_conta()` (054, gatilho `usuarios_espelha_credencial_na_pessoa`) | espelha credencial e e-mail da conta na pessoa (passo 1) | sim (criado aqui) | E08 desliga (passo 3) |
| `pessoa_da_conta_nao_muda()` (054, dois gatilhos) | recusa mudança de `usuarios.pessoa_id` | sim (criado aqui) | permanente |
| `sessao_carrega_a_pessoa()` (054) | preenche `sessoes.pessoa_id` | nova | permanente |
| `vigencia_da_sessao(uuid,uuid,uuid)` (054) | vigência de (pessoa, org, sid), lê `senha_provisoria_ate` e `ativo` da PESSOA | sim (criada aqui) | E03 e E02 passam a chamar |
| `provisionar_municipio(...)` (036, 046) | o console cria o primeiro administrador com `senha_hash` e senha provisória; o criador cria a pessoa nova junto | sim | E15 (o criador cobre, sem redefinir a função); E08 grava a credencial só em `pessoas` |
| `executar_eliminacoes_vencidas()` e `ordem_de_apagamento_por_municipio()` (038) | apagam `sessoes` e `usuarios` do município; a pessoa e a marca de origem ficam | sim | E09 toma as travas da decisão 7 |
| `console_suspender_municipio(uuid,text)` (038, 049) | console: suspende e revoga as sessões do município (escopo local) | não citada | sem mudança: escopo local, como a ADR descreve na tabela da decisão 7 |
| `console_consumir_recuperacao(uuid,text,text)`, `console_recuperacao_por_email(text)`, `console_renovar_codigos(...)` (039) | credencial e recuperação dos OPERADORES do console (`console_operadores`), não de pessoa de município | não citada | fora do alcance de `pessoas`: o console é do fornecedor (ADR 0008). Emissor de prova de autenticação do CONSOLE, inventariado aqui como pedido; nada a mudar na F03 |
| `console_agendar_eliminacao`, `console_cancelar_eliminacao`, `console_reativar_municipio` (038) | citam o e-mail do OPERADOR (autoria do ato) | não citadas | fora do alcance de `pessoas` |
| `interesse_recente(text)` (011) e `envio_so_para_dominio_do_catalogo()` (017) | e-mail do formulário público e domínio de e-mail de órgão do ofício | não citadas | não são credencial nem pessoa; ficam no inventário só porque citam "e-mail" |
| `db/seeds/desenvolvimento.sql`, `db/seeds/homologacao.sql` | `INSERT INTO usuarios` com `senha_hash` (a de homologação, nulo) | sim (como "sementes") | E15: o criador cria a pessoa nova de cada conta; E08 precisa gravar a credencial da semente em `pessoas` |

## 2. API, painel e console (código, não muda nesta parte)

| Item | O que faz hoje | Na ADR? | Etapa dona e o que ela faz |
| --- | --- | --- | --- |
| `auth/servico.ts`, `entrar` (por volta da linha 311) | chama `credenciais_para_login`, confere a senha na aplicação, chama `registrar_tentativa_login` | sim | E02 lê de `credenciais_da_pessoa`; E16 login em dois passos |
| `auth/servico.ts`, `emitirPar` e o desafio do segundo fator (`cr`, linhas 432, 558, 584, 701) | lê `senha_hash, ativo FROM usuarios` para conferir que a credencial do desafio ainda é a mesma | sim | E02 lê da pessoa; E11 e E16 estendem a ligação à pessoa |
| `auth/servico.ts`, renovação (linha 607) | monta a linha de sessão com `senha_provisoria_ate` vinda de `sessao_por_token` | **NÃO** (só pela função) | ver `sessao_por_token` acima |
| `auth/servico.ts`, `pedirRecuperacao` e `redefinirComLink` (linhas 1015, 1045) | `abrir_recuperacao` e `consumir_recuperacao` | sim | E08 (banco) e 5C (`pedirRecuperacao` pela fila) |
| `auth/servico.ts`, `trocarSenha` (linhas 1071 a 1187) | lê `senha_hash, senha_provisoria_ate` da CONTA (a segunda vez `FOR NO KEY UPDATE`) e chama `trocar_senha` | parcial (a ADR cita `trocar_senha`, não a leitura com trava na rota) | E02 (leitura da pessoa) e E08 (a trava passa a ser N2 e a releitura na pessoa) |
| `auth/segundo-fator.ts`, `desativar` (linha 336) | lê `senha_hash FROM usuarios` | sim | E02 lê da pessoa; E11 move o fator |
| `auth/vigencia.ts`, `lerVigencia` | lê `usuarios.senha_provisoria_ate` e `ativo` sob o tenant, na escrita | **NÃO** (a ADR cita `lerVigencia` só como quem chama `vigencia_da_sessao`) | E03 (vigência em toda requisição) e E02 trocam por `vigencia_da_sessao`; até lá a cópia da conta é a fonte, igual à da pessoa pelo espelho |
| `rotas/administracao.ts`, `POST /usuarios` (linha 165) | `INSERT INTO usuarios` com `senha_hash` digitada por quem cria | sim | E15 (o criador dá a pessoa nova); E10 troca por convite |
| `rotas/administracao.ts`, `PATCH /usuarios/:id` (linha 365) | UPDATE de nome, matrícula, **e-mail**, papel e equipe; o e-mail é espelhado na pessoa | sim | E09 retira o e-mail do PATCH |
| `rotas/administracao.ts`, `PATCH /usuarios/:id/ativo` (linha 266) | UPDATE de `ativo` (não espelhado: o `ativo` da pessoa é da E09) | sim (pela E09) | E09 toma a trava da pessoa |
| `rotas/administracao.ts`, `redefinir-senha` (linha 496) | UPDATE de `senha_hash`, falhas, bloqueio e `senha_provisoria_ate` da conta; espelhado | sim | E08 grava em `pessoas` sob a trava; E16 forma final |
| `auth/sessoes.ts` | revoga sessões da conta sob `travar_sessoes_do_usuario` | sim (como escopo local) | E08 |
| `apps/api/src/provisionar.ts` (CLI, linha 117) | `INSERT INTO usuarios` do primeiro administrador com `senha_hash` e senha provisória, como `dc360_app` | **NÃO** | E15: o criador cobre (sem mudança); E08 precisa fazer a credencial ir para `pessoas` |
| `apps/api/src/semear-homologacao.ts` (linha 199) | `UPDATE usuarios SET senha_hash` das contas da semente de homologação, como dono | **NÃO** | E15: o espelho cobre; E08 precisa gravar em `pessoas` (depois do passo 3 a coluna da conta é esvaziada e não tem mais efeito) |
| `apps/api/src/saida/pacote.ts` (`COLUNAS_QUE_NUNCA_SAEM`) | o pacote de saída do município leva toda coluna de `usuarios` menos `senha_hash`; desde a 054 leva também **`pessoa_id`** | **NÃO** | ver RESUMO: `pessoa_id` é identificador global da pessoa e não deveria sair no pacote de um município (dono de `pacote.ts`: 2B, 3A, 4B) |
| `apps/web/src/dados/local.ts` (modo local, linhas 1365 e 1400) | `INSERT INTO usuarios` sem senha e `UPDATE` de nome, matrícula, e-mail, papel e equipe | sim ("modo local") | E15: o criador e o espelho cobrem; o modo local não tem senha |
| `apps/console/src/operadores.ts`, `recuperacao.ts`, `servidor.ts` | login, segundo fator e recuperação dos OPERADORES do console (`console_operadores`) e a chamada a `provisionar_municipio` | parcial (só `provisionar_municipio`) | fora do alcance de `pessoas` (o operador do console não é pessoa de município, ADR 0008); emissor de prova do console inventariado; nada a mudar na F03 |

## 3. Ligação entre conta e pessoa

| Item | Quem grava | Proteção |
| --- | --- | --- |
| `usuarios.pessoa_id` | só o gatilho criador (`conta_ganha_pessoa`, BEFORE INSERT) e o backfill da 054; a partir da E10, `aceitar_convite` | NOT NULL; imutável (dois gatilhos); `UNIQUE (pessoa_id)` total até a 064; o `dc360_app` não tem UPDATE na coluna e o INSERT informando-a é recusado (42501) |
| `sessoes.pessoa_id` | o gatilho `sessao_carrega_a_pessoa` | chave composta `(organizacao_id, usuario_id, pessoa_id)` com a conta |
| `origens_de_conta` | só a migração (marca `backfill`) e `conta_ganha_pessoa` (marca `criador`) | RLS forçada sem policy; nenhum privilégio de papel do produto; não se altera nem se apaga; só uma função cita a tabela (regra da 0D) |
| `pessoas` | o criador (INSERT da pessoa nova) e o espelho (UPDATE da credencial e do e-mail) | as quatro travas da decisão 3; não se apaga |
