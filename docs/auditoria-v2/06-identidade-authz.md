# 06 Identidade, autorização e multi-tenancy (seções 13 e 14)

Auditoria Baseline Zero da V2, somente leitura. Repositório C:\Projetos\city-hall, produto em dc360/. HEAD e82719e (17/09/2026). Nada do repositório foi alterado. Os scripts de prova estão em `scratchpad\v2\tmp\` (catalogo.mjs/json, matriz.mts/out, prova.mts/out, prova2-4.mts, definer.mjs); todos rodam em memória (PGlite) e não tocam no repositório. Rodei UM arquivo de teste: `apps/api/test/senha-provisoria.test.ts` (1 falha, 6 passam, ver IDN-10).

Convenções: "prova" = executei e vi o resultado; "código" = li o trecho citado; "documentado, NÃO CONFIRMADO" = só a documentação afirma.

## Resumo

1. O modelo de identidade de servidor é UMA tabela `usuarios`: 1 conta = 1 pessoa x 1 município x 1 papel (enum de 4 valores gravado em 4 CHECKs) x 1 equipe opcional. Não existe entidade Pessoa, nem vínculo, nem competência como dado. E-mail é único GLOBAL (`usuarios_email_global_idx`, 002:31), inclusive de conta desativada (prova: 409 entre municípios).
2. Existem 6 tipos de identidade hoje: servidor (4 papéis), operador do console (tabela, audiência, segredo e papel de banco próprios, TOTP obrigatório), órgão parceiro por link de uso único (sem conta), visitante do formulário público, operador de plataforma com credencial de dono do banco (CLI) e os relógios internos. Secretaria e cidadão NÃO existem (nenhuma rota, coluna, tabela ou policy).
3. REGRESSÃO P0: a verificação de vigência (conta ativa, papel, sessão viva) foi DESLIGADA no commit b4439ac (17/09/2026). Prova: conta desativada continua LENDO e ESCREVENDO (200/201) com o token de acesso por até 15 min, e o evento fica na trilha append-only assinado por ela. O teste que cobre isso está `describe.skip`, um teste vivo falha (senha-provisoria.test.ts:183) e 3 comentários de código ainda dizem que está em vigor.
4. O isolamento entre municípios no banco está sólido e provado por catálogo: 35 tabelas com RLS ativada e FORÇADA, 81 FKs (49 compostas com organizacao_id, 30 para organizacoes, 2 só do console), 27 funções SECURITY DEFINER todas com search_path fixo e sem EXECUTE para PUBLIC, `dc360_app` sem BYPASSRLS nem propriedade de tabela. Pela API, 19 sondas cruzadas (token de B contra ids de A) deram 404.
5. O que o teste de isolamento NÃO cobre e é o ponto fraco: (a) funções SECURITY DEFINER de autenticação agem sobre qualquer uuid de usuário sem conferir o tenant do contexto (provado: `trocar_senha` e `revogar_sessoes_do_usuario` com contexto de A atuaram sobre usuário de B; `registrar_tentativa_login` tem a mesma forma, por leitura de código); (b) autorização por papel dentro do tenant (nenhum teste varre rota x papel); (c) 32 das 96 rotas exigem só autenticação, e o recorte de equipe existe apenas para `agente_campo` (fail-open para qualquer papel novo); `GET /oficios` e `GET /oficios/:id` vazam ao agente ofícios de ocorrências de outras equipes (prova).
6. Para a V2: reutilizar `usuarios` indiscriminadamente para secretaria e cidadão seria perigoso (namespace de e-mail global, enum de papel em 4 CHECKs, leituras abertas a qualquer autenticado, tenant obrigatório no token, `GET /usuarios` tenant inteiro para quem tem gerenciar_usuarios). O console já é o precedente de "conta separada por superfície" e mostra o custo (auth duplicada).
7. Decisões humanas pendentes: modelo (contas separadas x pessoa com vínculos x híbrido), MFA por papel, recuperação, política de revogação, competência como dado ou papel, teto de sessão, snapshot de assinatura do laudo, retenção de IP/UA.
8. NÃO CONFIRMADO: estado real da produção (papéis de banco `dc360_api`/`dc360_console_login`, BYPASSRLS do dono, `SEGUNDO_FATOR_ATIVO` em segredo do Fly, S3), porque só li o repositório.

---

## 13. Modelo de identidade

### 13.1 Inventário de identidades que existem hoje

| # | Identidade | Representação | Autenticação | Token / audiência | Papel de banco | Evidência |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | Operador de plantão | `usuarios` (papel `operador`, posto 1) | e-mail + senha scrypt (+TOTP opcional) | JWT HS256 15 min, iss `dc360-api`, aud `dc360`, claims sub/org/papel/nome/sid/sp; refresh opaco 32 B em `sessoes` (hash SHA-256), 14 dias deslizantes | `dc360_app` via `SET LOCAL ROLE` + `app.organizacao_atual` | 001:79-99, tokens.ts:25-80, postgres.ts:233-243 |
| 2 | Agente de campo | `usuarios` (papel `agente_campo`, posto 1) + `equipe_id` + `aparelhos` (ficha de push) | idem; app guarda em SecureStore `WHEN_UNLOCKED_THIS_DEVICE_ONLY` | mesmo JWT; mesmo `/auth/entrar` do painel | `dc360_app` | apps/campo/src/dados/sessao.tsx:2,75-79; sincronizacao.ts:462 (`coletadaPor` opcional) |
| 3 | Coordenador | `usuarios` (papel `coordenador`, posto 2) | idem | idem | `dc360_app` | permissoes.ts |
| 4 | Administrador municipal | `usuarios` (papel `administrador`, posto 3); TOTP obrigatório SE `SEGUNDO_FATOR_ATIVO=sim` (padrão `nao`) | idem + desafio | idem; token de desafio aud `dc360-desafio`, 5 min | `dc360_app` | segundo-fator.ts:114-116, config.ts:291 |
| 5 | Operador do console (dono ou operador) | tabela `console_operadores` (038), papel `dono`/`operador`, exatamente 1 dono (índice parcial) | senha scrypt + TOTP OBRIGATÓRIO para todos; códigos de recuperação (039) | JWT aud `dc360-console`, 30 min, SEM refresh, `sv` = resumo do hash (troca de senha derruba sessões); conta relida do banco a CADA pedido (ativo, sv, papel) | `dc360_console` (NOLOGIN) via login role `dc360_console_login` (documentado, NÃO CONFIRMADO em produção) + `app.console_operador` | 038:200-260, apps/console/src/tokens.ts, servidor.ts:596-620 |
| 6 | Órgão parceiro externo | NÃO tem conta. Destino = linha do catálogo `orgaos` (nome, sigla, e-mail, telefone) por município; acesso = link de uso único em `oficio_envios.token_hash` | posse do segredo de 32 B no e-mail; expira; abre uma vez (índice parcial `oficio_link_abre_uma_vez`); IP e user-agent gravados em `oficio_aberturas` | sem token de sessão | `dc360_app` sem contexto, função `abrir_oficio` (SD) | 017:559-640; oficios.ts:602 |
| 7 | Visitante do formulário público | `interesse_municipio` (insert-only, sem organizacao_id) | nenhuma | nenhum | `dc360_app` (INSERT, sem SELECT) | 011; superficie.test.ts (isenção) |
| 8 | Operador de plataforma por CLI | credencial de DONO do banco (`postgres`, BYPASSRLS): `provisionar.ts`, `armazenamento/cli.ts`, migrações, `UPDATE` manual. Identidade pessoal = texto `p_operador` | credencial compartilhada de banco | nenhum | dono (BYPASSRLS) | provisionar.ts:188-243, cli.ts:75-110, 036:60-100 |
| 9 | Relógios internos (5) | sem ator: varredor de push, minimização, resumo, órfãos, eliminação | n/a | n/a | `dc360_app` sem contexto + funções SD | index.ts, 016/021/026/038/042 |
| 10 | Aparelho (sub-identidade) | `aparelhos` (org, usuario_id, ficha); a mesma ficha reatribui `usuario_id` ao último que registrar | não autentica | n/a | `dc360_app` | aparelhos.ts:115-150 |
| 11 | Portador de URL assinada | posse da URL (GET 5 min, PUT 15 min) | bearer, sem vínculo a usuário ou IP | n/a | n/a | s3.ts:62-63 |

Papéis de banco (catálogo gerado por `catalogo.mjs` aplicando as 46 migrações em PGlite): `dc360_app` NOLOGIN NOSUPERUSER NOBYPASSRLS; `dc360_console` NOLOGIN NOSUPERUSER NOBYPASSRLS NOINHERIT; dono `postgres` superusuário BYPASSRLS. Em produção o modelo documentado é de 3 papéis (setup/dono, `dc360_api` LOGIN membro de `dc360_app WITH SET TRUE`, `dc360_console_login`): docs/COLOCAR-DE-PE.md:120-150 e IMPLANTACAO.md:200-215. Documentado, NÃO CONFIRMADO em produção.

Existe ainda o pseudo-papel `operador_da_plataforma` em `trilha_administrativa.autor_papel` (025:62-71): não é conta, é o carimbo de quem o console/CLI representa.

### 13.2 Como o sistema trata cada ponto pedido

**E-mail.** Único GLOBAL case-insensitive (`CREATE UNIQUE INDEX usuarios_email_global_idx ON usuarios (lower(email))`, 002:31), além de `UNIQUE (organizacao_id, email)` (001:94). O índice NÃO é parcial: e-mail de conta desativada fica reservado para sempre. Prova (prova.out P3): coordenador do município B criando usuário com e-mail de A recebe `409 usuario_repetido`; e-mail em caixa alta também 409; e-mail de conta desativada (`diego.alves@...`) recriado em A: 409. A mensagem ("matrícula ou e-mail") não diz qual, mas confirma a um administrador que o e-mail existe em algum município (oráculo de existência entre tenants, contra a regra "404 nunca 403").

**Matrícula.** `UNIQUE (organizacao_id, matricula)` (001:93), case-sensitive (`SA-1042` e `sa-1042` coexistem) e editável por coordenador/administrador (`PATCH /usuarios/:id`). Prova: matrícula igual à de outro município criada sem erro (201). A matrícula é impressa no laudo lida AO VIVO de `usuarios` (documentos.ts:107 `u.matricula AS agente_matricula`). Prova (prova3): após o administrador editar nome e matrícula do agente, o mesmo laudo já emitido passou a imprimir o nome e a matrícula NOVOS e deixou de conter os antigos. A trilha guarda `autor_nome`/`autor_papel` como snapshot, a matrícula não.

**Troca de papel.** Coluna `papel` atualizada por `PATCH /usuarios/:id`; histórico só em `trilha_administrativa` (`papel_alterado`, antes/depois). A rota NÃO revoga sessões. Prova (prova.out P2): após rebaixar Helena de coordenador para operador, o token antigo continuou com `GET /usuarios` = 200 e `POST /equipes` (gerenciar_equipes) = 201; a renovação posterior já emitiu token com `papel=operador`. Janela = `ACESSO_MINUTOS` (padrão 15, máx 60, config.ts:356).

**Desativação.** `PATCH /usuarios/:id/situacao` marca `ativo=false` e chama `revogar_sessoes_do_usuario` (administracao.ts:259). Não há DELETE em `usuarios` para `dc360_app` (catálogo de grants: INSERT, SELECT, UPDATE), então o registro e a trilha permanecem (correto, cumpre "registro não se apaga"). O que acontece depois, por prova (prova.out P1):

| Item | Resultado |
| --- | --- |
| Renovar refresh token | 401 (sessões revogadas: `todas_revogadas:true`) |
| Novo login | 401 |
| LEITURA com access token antigo | 200 (troca documentada, suspensao.ts:33-38) |
| ESCRITA com access token antigo (`POST /ocorrencias/:id/coordenada`) | 200 (o teste desligado espera 401) |
| ESCRITA administrativa com access token antigo (`POST /equipes`) | 201 |
| Trilha | último evento: `correcao_de_coordenada`, autor "Helena Vasques Coutinho", papel coordenador, conta já desativada |
| Aparelho push do usuário | `revogado_em` continua NULL (prova P4); o efeito vem só do filtro `u.ativo` nas varreduras (042:208, ocorrencias.ts:920) |
| Reativar | sessões não voltam; aparelho reaparece no JOIN automaticamente |

Causa: `servidor.ts:449-467` só chama `exigirAcessoAtivo` (suspensão do município) na escrita; o comentário nas linhas 454-461 diz "DESLIGADO NESTA IMPLANTAÇÃO, DE PROPÓSITO" para `auth/vigencia.ts`. `git show b4439ac` remove o import e as duas chamadas (`lerVigencia`/`exigirVigencia`). Três lados divergentes: (i) código de `servidor.ts`: desligado; (ii) comentários em `auth/suspensao.ts:39-41`, `auth/sessoes.ts:20` e `vigencia.ts` (cabeçalho) dizem "desde 15/09/2026 a escrita confere a vigência"; `administracao.ts:200` diz que sem revogar "continuaria trabalhando até o token expirar" (verdadeiro só para a parte da leitura hoje); (iii) testes: `vigencia-na-escrita.test.ts:102` está `describe.skip`, e `senha-provisoria.test.ts:172` ("sessão viva cuja senha provisória venceu no meio não escreve nem renova") FALHA hoje (executei: `expected 200 to be 401`, linha 183). O teste `api.test.ts:615` "desativar usuário derruba as sessões dele na hora" só afirma que o REFRESH cai. A marca `sp` (senha provisória) continua funcionando porque vem do token (servidor.ts:464-478).

**Sessão e revogação.** `abrir_sessao` (002, redefinida em 038:1157) grava `expira_em = now() + RENOVACAO_DIAS`; cada renovação abre sessão nova com o mesmo prazo: janela DESLIZANTE sem teto absoluto (código: servico.ts:482-580; config.ts:357 padrão 14 dias). Reúso de refresh só derruba a família quando o token foi ROTACIONADO (046, `dono_do_token` devolve motivo). Revogam sessões: troca de senha própria (preserva a atual), redefinição por link, redefinição por administrador, encerrar sessões (própria e de terceiro), desativação, suspensão do município (038:528-600), reúso. Não revogam: troca de papel, troca de e-mail.

**Autenticação.** scrypt N=131072 (2^17), r=8, p=1 (senha.ts:34; a auditoria de 30/09 diz 2^16, divergência), mínimo 12 caracteres e máximo 200, sem checagem de senha vazada (schemas.ts:961). Login resistente a enumeração (tempo e mensagem iguais), bloqueio por conta 5 falhas/15 min em `usuarios.falhas_login` e limite por IP (em memória por processo, rotas/autenticacao.ts:95). Criação de conta: o administrador/coordenador DIGITA a senha inicial (`POST /usuarios`, administracao.ts:143-175) e ela NÃO é provisória (o INSERT não grava `senha_provisoria_ate`); não há convite, ativação nem verificação de e-mail.

**Recuperação.** Link por e-mail (005) só funciona com `RECUPERACAO_ATIVA=sim`; o `fly.toml:67` do piloto define `nao`. Fallback: administrador/coordenador sorteia senha temporária de 72 h (046), ditada "por telefone ou em mãos" (administracao.ts:400-432). Durante as 72 h quem redefiniu conhece a credencial e pode trocá-la por outra e assumir a conta (as ações depois ficam atribuídas à vítima; só o ato `senha_redefinida` fica na trilha). Não existe rota para resetar o TOTP de OUTRA pessoa (README.md:1373-1380 admite; a matriz empírica confirma: só `/segundo-fator/*` próprio). Último administrador que perde telefone e códigos: sem caminho pela tela.

**MFA.** TOTP (022) com segredo cifrado AES-256-GCM amarrado a município+pessoa, 8 códigos de recuperação em resumo, anti-replay `ultimo_passo`. Global por flag `SEGUNDO_FATOR_ATIVO` (padrão `nao`; `fly.toml` não define; segredo do Fly NÃO CONFIRMADO). Quando ligado, obrigatório só para `administrador` (segundo-fator.ts:114-116); coordenador, que pode redefinir senha de operador/agente e exportar dados, fica opcional. O console exige TOTP de todos (apps/console/src/servidor.ts:503-560). A auditoria de 30/09 (§3.7 e linha AUT-04) afirma que o console não tem conta de operador com segundo fator: isso está DESATUALIZADO frente ao código (migrações 038/039, `console_operadores.segundo_fator NOT NULL`), e `db/PENDENCIAS.md` (itens 3 e 4) não é alterado desde 09/09/2026.

**Auditoria de identidade.** Vão para `trilha_administrativa`: `usuario_criado`, `usuario_editado`, `papel_alterado`, `usuario_desativado`/`reativado`, `senha_redefinida`, `sessoes_encerradas`, `segundo_fator_ativado`/`desativado`, `foto_trocada`/`removida`, equipe/órgão/retenção/saída (grep `acao:`). NÃO vão: login com sucesso ou falha, bloqueio por tentativas, troca da própria senha (`trocarSenha` não chama `registrarAtoAdministrativo`), conclusão da recuperação por link, entrada com código de recuperação, reúso de refresh (só fica `sessoes.motivo_revogacao`). `sessoes.ip/user_agent`, `recuperacoes_senha.ip` e `oficio_aberturas.ip` não têm expurgo (nenhum DELETE; sem grant) e `docs/PRIVACIDADE.md` não os menciona (grep vazio).

**Desativação de município.** `acesso_suspenso_em` (038) revoga todas as sessões, `abrir_sessao` recusa (DC367) e a escrita recebe 403 (503 na fila do campo). Leitura com token vivo continua até 15 min.

### 13.3 Novos atores da V2 contra o modelo atual

| Ator | Suporta hoje? | O que falta (evidência) |
| --- | --- | --- |
| Usuário de secretaria | NÃO (estado E/D) | (1) valor de papel: enum em `usuarios` 001:89, `trilha_eventos` 001:307, `trilha_administrativa` 010:43 (+025:62), `ocorrencia_consultas` 021:220, `PAPEIS`/`POSTO`/`PERMISSOES`/`ROTULO_PAPEL` (dominio.ts:257, permissoes.ts), enum zod do JWT (tokens.ts:25); (2) vínculo usuário->órgão: não há coluna (`orgaos` não referencia usuários); (3) competência: não há dado (`equipes.especialidade` é texto livre); (4) RLS só por tenant; (5) `trilha_eventos.origem` só `campo`/`escritorio` e `ocorrencia_id NOT NULL`; (6) `providencias.respondida_por` é texto digitado por servidor da Defesa Civil, o órgão não tem identidade |
| Gestor de secretaria | NÃO (E) | `gerenciar_usuarios` e `podeGerirPapel` são por POSTO (hierarquia), não por ESCOPO: `GET /usuarios` lista o município inteiro e `PATCH` edita qualquer conta de posto abaixo. Um gestor com essa ação administraria todas as contas do tenant |
| Cidadão | NÃO (E) | não existe tabela, rota, canal (`canal_entrada` enum sem app), nem verificação de e-mail ou telefone; `usuarios.organizacao_id NOT NULL ON DELETE RESTRICT` e `sessoes`/JWT exigem `org` |

**Reutilizar `usuarios`/login/JWT sem separar traria estes riscos concretos:**

1. Namespace de e-mail compartilhado: o índice global faz o cadastro de cidadão colidir com servidores (aquele que registrar primeiro "ocupa" o e-mail institucional; o servidor legítimo recebe 409 e descobre a colisão). Já hoje vaza existência entre tenants.
2. Falha aberta por omissão: 30 rotas exigem só autenticação (lista em §14a). Qualquer papel novo válido no JWT as acessa, e o recorte de equipe existe só para `agente_campo` (recorte-do-agente.ts:35 retorna `null` para os demais). Secretaria ou cidadão herdariam `GET /ocorrencias`, `/mapa`, `/interditados`, `/indicadores/painel`, `/busca`, `/oficios`, `/avisos`, `/evidencias/*` do município inteiro. `POST /rota` consome a chave paga do Google.
3. Mesma audiência `dc360` e mesma chave para todos: um token de cidadão seria aceito por toda rota do painel. O console mostra o remédio (audiência própria), o desafio do MFA também.
4. Tenant obrigatório no token: cidadão pode relatar em mais de um município; o `SET LOCAL app.organizacao_atual` não tem como representar "global".
5. Direito de apagamento de cidadão x "registro não se apaga": `usuarios` não tem DELETE, FKs da trilha são RESTRICT/SET NULL.
6. Política de MFA hoje é `administrador` e flag global; não há "por papel/superfície/tenant".
7. Funções pré-tenant: cada nova porta de login multiplica `SECURITY DEFINER` (teto do teste = 27, igual ao catálogo: não há folga).
8. `sessoes.organizacao_id NOT NULL`, `aparelhos (org, usuario)`, `trilha_eventos.autor_papel` CHECK: cidadão não cabe sem migração destrutiva de CHECKs.

O precedente de "conta separada por superfície" é `console_operadores` (tabela, audiência, segredo, papel de banco, TOTP próprios), e seu custo também é visível: auth reimplementada (apps/console/src/operadores.ts, recuperacao.ts, tokens.ts espelham apps/api/src/auth/*).

---

## 14. Autorização e multi-tenancy

### 14a. Matriz real ator x recurso x ação x tenant x contexto

Método: (i) enumerei as rotas do servidor montado (`printRoutes`, mesmo método de `superficie.test.ts`): 111 entradas, 96 rotas distintas (15 são a mesma rota com barra final); (ii) para cada rota chamei com token de operador, agente, coordenador, administrador (Serra Alta) e coordenador de Vale Fundo, corpo vazio (a autorização precede o `parse`, então 403 `sem_permissao` = barrado por ação; 422/404/200 = autorizado); (iii) li o handler onde a resposta era ambígua. Saída bruta: `tmp\matriz.out`. Resultado: 11 públicas por desenho, 53 com ação nomeada de `permissoes.ts`, 32 só autenticadas (11 "da própria conta", 4 de sino e aparelho, 4 utilidades incluindo `POST /rota` paga, 13 leituras de dados).

Tenant em TODAS as rotas autenticadas: vem do JWT verificado (`quem.organizacaoId`), nunca de cabeçalho, rota ou corpo (grep de `comTenant(` mostra só `quem.organizacaoId` nas rotas; as demais chamadas recebem org de função de banco ou de token de desafio verificado). Contexto: escrita confere suspensão do município; leitura não.

Prefeitura, por ação (S = autorizado, N = 403 `sem_permissao`):

| Recurso | Rota | Ação (permissoes.ts) | Oper | Agente | Coord | Adm | Contexto / recorte |
| --- | --- | --- | :-: | :-: | :-: | :-: | --- |
| Ocorrência | POST /ocorrencias | abrir_ocorrencia | S | N | S | S | tenant do token |
| Ocorrência | POST /:id/coordenada | abrir_ocorrencia | S | N | S | S | qualquer ocorrência aberta, com motivo na trilha |
| Ocorrência | GET /ocorrencias, /mapa, /interditados, /indicadores/painel, /providencias/pendentes, /duplicidades/consulta, /:id | só autenticação | S | S | S | S | agente: `equipe_id` do CADASTRO (recorte-do-agente.ts); demais papéis: município inteiro; `/:id` grava consulta em `ocorrencia_consultas` |
| Triagem | POST /:id/triagem | classificar_triagem | N | N | S | S | |
| Despacho | POST /:id/despacho | despachar_equipe | N | N | S | S | equipe do mesmo tenant (FK composta) |
| Devolvidas | GET /ocorrencias/devolvidas | despachar_equipe | N | N | S | S | |
| Providência | POST /:id/providencia | encaminhar_providencia | N | N | S | S | |
| Providência | POST .../resposta | responder_providencia | S | N | S | S | `respondida_por` texto livre |
| Encerramento | POST /:id/encerramento | encerrar_ocorrencia | N | N | S | S | motivo obrigatório (CHECK) |
| Desinterdição | POST /:id/desinterdicao | levantar_interdicao | N | N | S | S | |
| Ofício | POST /oficios | emitir_documento | N | N | S | S | |
| Ofício | GET /oficios/:id/documento | emitir_documento | N | N | S | S | |
| Ofício | POST /oficios/:id/envio | encaminhar_providencia | N | N | S | S | 503 com `EMAIL_ATIVO=nao` |
| Ofício | GET /oficios, GET /oficios/:id | só autenticação | S | S | S | S | SEM recorte de equipe (prova: ver AUT-12) |
| Órgão (catálogo) | GET /orgaos | só autenticação | S | S | S | S | |
| Órgão (catálogo) | POST, PATCH, desativação, reativação | gerenciar_equipes | N | N | S | S | |
| Equipe | GET /equipes | só autenticação | S | S | S | S | nomes e contagem |
| Equipe | POST, PATCH | gerenciar_equipes | N | N | S | S | |
| Usuário | GET /usuarios, POST, PATCH /:id, PATCH /:id/situacao, POST /:id/redefinir-senha, POST /:id/encerrar-sessoes | gerenciar_usuarios + `exigirPostoParaGerir` | N | N | S | S | posto: coordenador só administra posto 1; troca de e-mail de terceiro só administrador; último administrador protegido (só na API) |
| Organização | GET/PATCH /organizacao/retencao, GET /armazenamento/uso | gerenciar_organizacao | N | N | N | S | |
| Documento | GET /documentos/:id/laudo(.pdf), termo-de-interdicao(.pdf), termo-de-desinterdicao | emitir_documento | N | N | S | S | |
| Documento | GET /documentos/validar/:codigo | só autenticação | S | S | S | S | devolve protocolo e ocorrenciaId sem recorte |
| Trilha | GET /trilha, /trilha/tipos, /relatorios/exportacoes, /relatorios/consultas | consultar_trilha | N | N | S | S | |
| Exportação | GET /relatorios/ocorrencias.csv, /relatorios/resumo | exportar_dados | N | N | S | S | nível completo só administrador + justificativa + registro em `exportacoes` (prestacao-de-contas.ts:129,325) |
| Saída de município | POST /saida/pacote.zip | exportar_dados + gerenciar_organizacao | N | N | N | S | registra `exportacoes` e trilha ANTES do primeiro byte |
| Evidência | POST /evidencias/autorizar-envio, /confirmar-envio | registrar_vistoria | N | S | N | N | só o agente; chave `tenant/{org}/...` montada no servidor |
| Evidência | GET /evidencias/ocorrencia/:id, GET /evidencias/:id/url | só autenticação | S | S | S | S | agente recortado por equipe; URL assinada 5 min |
| Campo | GET /campo/meu-trabalho, /sincronizacao/*, /saida-a-campo (POST, prorrogar, retorno, /minha) | registrar_vistoria | N | S | N | N | coordenador e administrador NÃO podem (pessoa com dupla função precisa de 2 contas) |
| Saída a campo | GET /saida-a-campo, POST /encerrar | acompanhar_saida_a_campo | S | N | S | S | |
| Busca | GET /busca | só autenticação | S | S | S | S | agente: só `em_campo` da própria equipe; grupo usuários só com gerenciar_usuarios; grava consulta quando casa por nome do solicitante |
| Sino | GET /avisos, POST /avisos/lidos | só autenticação | S | S | S | S | avisos do município inteiro para qualquer papel; GET ESCREVE (prazos vencidos, saída sem retorno) |
| Mapa | POST /mapa/resolver-link | abrir_ocorrencia | S | N | S | S | SSRF tratado em mapa.ts (fora do meu escopo) |
| Rota | POST /rota | só autenticação | S | S | S | S | consome chave Google; 503 sem `ROUTES_KEY` |
| Configuração | GET /configuracao | só autenticação | S | S | S | S | chave pública do mapa |
| Aparelho | POST /aparelhos, /aparelhos/revogar | só autenticação | S | S | S | S | ato sobre a própria conta; 503 com `PUSH_ATIVO=nao` |
| Conta própria | /auth/trocar-senha, /auth/encerrar-sessoes, /auth/eu, /usuarios/eu, foto, /segundo-fator/* | só autenticação | S | S | S | S | |

Outros atores:

| Ator | Recurso e ação | Autenticação | Tenant | Contexto |
| --- | --- | --- | --- | --- |
| Operador do console (dono) | suspender, reativar, agendar e cancelar eliminação (funções SD), usuários do console, cadastro de prefeitura (`provisionar_municipio`) | JWT aud `dc360-console` + conta relida do banco a cada pedido | nenhum: lê `metricas_municipio`, `organizacoes` e a visão `console_situacao_dos_municipios` (`security_invoker`); sem acesso a tabela de negócio | `app.console_operador`; "só o dono" imposto por policy e por `console_operador_e_dono()` |
| Operador do console (operador) | lê números e cadastra prefeitura | idem | idem | não altera linha do dono (policy de UPDATE) |
| Órgão parceiro | GET /publico/oficio/:token (abrir o ofício) | segredo no caminho, uso único, expira | resolvido pela função `abrir_oficio`, que devolve `organizacao_id`, e a rota monta o documento via `comTenant(abertura.organizacao_id)` | IP e user-agent gravados; caminho redigido no log (servidor.ts:159-178) |
| Visitante | POST /publico/interesse | nenhuma | nenhum | INSERT sem SELECT |
| Secretaria (usuário, gestor) | (V2) | GAP: não existe | GAP | GAP: nenhuma coluna, rota ou policy |
| Cidadão | (V2) | GAP: não existe | GAP | GAP |

Rotas que NÃO passam por `autorizar`/`exigirPermissao` e por quê (as 32 só autenticadas): 11 são atos sobre a própria conta (senha, sessões, 2FA, foto, `/auth/eu`, `/usuarios/eu`), comentadas como deliberadas (aparelhos.ts:75-93, avisos.ts:201-213); 4 são de sino e aparelho; 13 são leituras de dados (7 de `/ocorrencias`, 2 de `/evidencias`, `/oficios` x2, `/orgaos`, `/equipes`) sem ação nomeada; 4 utilidades (`/busca`, `/configuracao`, `/rota`, `/documentos/validar`). Exceção à regra do CLAUDE.md "toda escrita passa por exigirPermissao": `GET /avisos` insere linhas (prova prova.out P6: avisos `prazo_vencido` criados por um GET do agente) e a rota pública `/publico/oficio` escreve `oficio_aberturas` por função SD.

### 14b. Verificações e documentação

**RLS e FORCE RLS (catálogo PGlite, 46 migrações, `catalogo.json`).** 35 tabelas em `public`, todas com `relrowsecurity` e `relforcerowsecurity` verdadeiros. `schema_migracoes` é criada pelo aplicador e fica fora (GRANT SELECT a `dc360_app`, sem dado de município: db/src/migrar.ts:216). Sem `organizacao_id` (por desenho): `organizacoes` (policy por `id`), `interesse_municipio`, `console_operadores`, `console_codigos_de_recuperacao` (policies `TO dc360_console` amarradas a `console_operador_atual()`). `eliminacoes_de_municipio` tem coluna mas sem FK de propósito. Policies por tabela (comando): todas as de negócio têm SELECT e INSERT; UPDATE onde o app altera; DELETE só em `avisos` (`avisos_expurgo`) e `notificacoes_enviadas` (`notificacoes_expurgo`); nenhuma policy ALL; `trilha_eventos`, `trilha_administrativa`, `oficios`, `oficio_aberturas`, `saidas_a_campo` etc. sem UPDATE/DELETE (append-only por ausência). Tabelas de auditoria com policy só SELECT/INSERT: `trilha_eventos` (001:317-322), `trilha_administrativa` (010:95-102).

**FKs compostas.** 81 FKs: 49 `(organizacao_id, x) -> (organizacao_id, id)`, 30 para `organizacoes(id)`, 2 só do console (`console_operadores.criado_por`, `console_codigos_de_recuperacao.operador_id`). Nenhuma FK de negócio sem organizacao_id (consulta no catálogo).

**Funções SECURITY DEFINER: 27 no catálogo final** (teto do teste `isolamento.test.ts:~628` é 27, sem folga). Todas com `search_path=public, pg_temp`, nenhuma com EXECUTE para PUBLIC (ACL só dono e o papel nomeado). Dono: `postgres`.

| Função | Migração | Finalidade | Expõe / faz | EXECUTE | row_security off |
| --- | --- | --- | --- | --- | --- |
| credenciais_para_login(email) | 002, 013, 046 | login antes de haver tenant | hash da senha, papel, org, bloqueio, `senha_provisoria_ate`; não filtra `ativo` | dc360_app | não |
| registrar_tentativa_login(uuid, ...) | 002 | contador de falhas/bloqueio | UPDATE `usuarios` por uuid SEM conferir tenant | dc360_app | não |
| sessao_por_token(hash) | 002, 013, 046 | renovação | sessão viva, nome, papel, org | dc360_app | não |
| abrir_sessao(org, usuario, ...) | 002, 038 | emitir sessão; recusa município suspenso | INSERT em `sessoes` (FK composta garante par coerente) | dc360_app | não |
| revogar_sessao(hash, motivo) | 002 | revogar por token | UPDATE | dc360_app | não |
| revogar_sessoes_do_usuario(uuid, motivo) | 002 | revogar família | UPDATE por uuid SEM conferir tenant (prova) | dc360_app | não |
| dono_do_token(hash) | 002, 046 | distinguir reúso de vencimento | uuid do dono e motivo | dc360_app | não |
| abrir_recuperacao(email, ...) | 005 | pedido de recuperação | cria token; devolve nome e e-mail ao servidor | dc360_app | não |
| consumir_recuperacao(hash, hash) | 005 | trocar senha com link | troca senha e revoga sessões | dc360_app | não |
| trocar_senha(uuid, hash, sessao) | 005 | troca pelo próprio | UPDATE de senha por uuid SEM conferir tenant (prova) | dc360_app | não |
| interesse_recente(email) | 011 | antispam do formulário | booleano | dc360_app | não |
| varrer_prazos(...) | 016 | push de prazo | protocolo, endereço, ficha; entre municípios, sem parâmetro de município | dc360_app | sim |
| abrir_oficio(hash, ip, agente) | 017 | link de ofício | resultado, `oficio_id`, `organizacao_id` | dc360_app | não |
| minimizar_por_prazo(teto) | 021, 029, 043 | retenção LGPD | apaga dados de pessoa vencidos; devolve contagens | dc360_app | sim |
| municipios_a_resumir(frescor) | 026, 038 | relógio de métricas | `setof uuid` | dc360_app | não |
| provisionar_municipio(...) | 036, 046 | console cria município e 1o administrador | 2 uuid; grava org, usuário (senha provisória 72 h) e trilha | dc360_console | não |
| console_suspender_municipio, console_reativar_municipio, console_agendar_eliminacao, console_cancelar_eliminacao | 038 | ciclo de suspensão e eliminação | exigem `console_operador_e_dono()`; revogam sessões | dc360_console | sim |
| executar_eliminacoes_vencidas(), concluir_eliminacao(org), eliminacoes_pendentes() | 038 | relógio da API apaga município vencido | DELETE em ordem topológica; 3a só conta | dc360_app | sim |
| console_renovar_codigos, console_recuperacao_por_email, console_consumir_recuperacao | 039 | recuperação dos operadores do console | `console_recuperacao_por_email` devolve hash do CÓDIGO sem sessão | dc360_console | sim |
| varrer_tarefas_novas(...) | 042 | push de tarefa nova | fichas, ids | dc360_app | sim |

**Prova do ponto fraco das funções de autenticação (definer.mjs):** com `SET LOCAL ROLE dc360_app` e `app.organizacao_atual` = município A: `SELECT` direto no usuário de B = 0 linhas; `UPDATE` direto = 0; mas `revogar_sessoes_do_usuario(usuarioDeB)` devolveu 1 e a sessão de B foi revogada, e `trocar_senha(usuarioDeB, hashDoAtacante, NULL)` trocou a senha de B. `registrar_tentativa_login` tem a mesma forma (por leitura de código; no script foi sobrescrita pela troca de senha que a seguiu). Hoje nenhuma rota passa uuid estrangeiro (as chamadas usam `sessao.usuario_id` lido do banco, `identidade.usuarioId` do token, ou `id` validado sob RLS antes em administracao.ts:190-259), então a exploração exige SQL injection ou bug de código; é defesa em profundidade ausente. Os testes (`isolamento.test.ts`) cobrem forma (contagem, search_path, ACL) mas não citam essas funções (grep: 0 ocorrências de `revogar_sessoes_do_usuario`, `trocar_senha`, `registrar_tentativa_login`, `abrir_recuperacao`, `sessao_por_token` nos testes de banco).

**Dependência do dono com BYPASSRLS.** As funções de login e os relógios só funcionam se o dono for isento de RLS (docs/COLOCAR-DE-PE.md:134; migrações 037, 045 fazem a falha ser alta). Em PGlite o dono é superusuário, então o teste não distingue. Produção: NÃO CONFIRMADO.

**Papéis e grants.** `dc360_app`: INSERT/SELECT/UPDATE nas tabelas de negócio (sem DELETE, exceto `avisos`), INSERT/SELECT em tabelas append-only, UPDATE por coluna em `oficio_envios`, `devolucoes_de_tarefa`, `saidas_a_campo`, `objetos_orfaos`; `interesse_municipio` só INSERT. `dc360_console`: SELECT em `metricas_municipio`, `organizacoes`, `console_situacao_dos_municipios`; INSERT/SELECT (+UPDATE em `console_operadores` e 2 colunas em `eliminacoes_de_municipio`) nas tabelas do fornecedor; EXECUTE em 10 funções. O portão de privilégios do `isolamento.test.ts:3562-4210` cobre 6 caminhos (concessão direta, coluna, herança, PUBLIC, visão, função SD).

**Como o tenant chega ao banco.** `bancoPostgres.emTransacao` (postgres.ts:230-251): `BEGIN`, `SET LOCAL ROLE dc360_app`, `set_config('app.organizacao_atual', $1, true)` (equivale a `SET LOCAL`), consulta, `COMMIT`/`ROLLBACK`, `release()`. `comTenant(org)` recebe `quem.organizacaoId` do JWT (verificado por `verificarAcesso`, zod uuid). `semTenant` faz o mesmo sem contexto (policies então retornam 0 linhas; `app_organizacao_atual()` NULL é fail-closed). Caminhos fora do helper: `push/trava.ts` (advisory lock, sem consulta de negócio), `armazenamento/cli.ts` e `provisionar.ts` (credencial de dono, CLIs), `db/src` (migrações), `apps/console/src/banco.ts` (`SET LOCAL ROLE dc360_console`). Nenhuma rota de negócio escapa.

**Storage.** Chave `tenant/{org}/ocorrencias/{oc}/...` e `tenant/{org}/usuarios/{uid}/...` montada no servidor (sincronizacao.ts:718, usuarios-eu.ts:126), com CHECK no banco (001:`chave_com_prefixo_do_tenant`, 040). Sem URL pública: leitura pré-assinada 5 min, escrita 15 min com `if-none-match: *` (s3.ts:62-63, tipos.ts). Uma credencial única do balde serve todos os municípios: o isolamento de objeto é por prefixo e pela aplicação, não por IAM. URL assinada é bearer (qualquer portador, sem vínculo a usuário/IP). Nenhuma rota lê chave vinda do cliente; a rota local `/armazenamento/objeto` é por assinatura e a configuração a proíbe em produção (config.ts:~745, NÃO retestado).

**Exports e pacote de saída.** CSV básico e completo (completo: posto administrador, justificativa mínima 20 caracteres, linha em `exportacoes`, teto 5000); saída de município só administrador, registra antes do primeiro byte. O pacote exclui por lista de tabelas (`TABELAS_QUE_NAO_SAEM`: sessoes, recuperacoes_senha, segundo_fator, segundo_fator_recuperacao...) e por DENY-LIST de colunas (`usuarios.senha_hash`, `aparelhos.ficha`, `oficio_envios.token_hash`, saida/pacote.ts:205-216): coluna sensível nova em `usuarios` sairia por padrão (fail-open a nível de coluna). Carrega TUDO em memória (PENDENCIAS da API, fora deste escopo).

**Busca global (migração 041).** Coluna gerada `busca` em `ocorrencias` (protocolo, endereço, ponto de referência, nome do solicitante), `usuarios` (nome, matrícula, e-mail), `equipes`, `orgaos`. Isolada por RLS. Agente: só `em_campo` e da própria equipe; demais papéis: município inteiro; grupo de usuários só com `gerenciar_usuarios`; casar por nome do solicitante grava `ocorrencia_consultas`. Não há busca entre municípios.

**Mapa.** `/ocorrencias/mapa` com recorte; `POST /mapa/resolver-link` exige `abrir_ocorrencia`; `POST /rota` só autenticação. Cache de caminhos em memória do processo (rota.ts:230, teto 2000, 24 h, chave origem arredondada + destino, SEM tenant): conteúdo é geometria pública, sem dado de município.

**Notificações, sino e push.** Push: vitrine genérica sem protocolo nem endereço (push/mensagem.ts:55-110); destinatário = aparelho de usuário ATIVO da equipe responsável (016, 042:208, ocorrencias.ts:920). `varrer_prazos` devolve protocolo e endereço ao processo do relógio (não ao provedor de push). Sino: ver AUT-13.

**Jobs.** 5 relógios dentro do processo da API (push, minimização, resumo, órfãos, eliminação) usando `semTenant` para listar municípios por funções SD sem parâmetro de município e `comTenant(org)` por município. Em várias máquinas do Fly o limitador de taxa em memória multiplica o teto (NÃO CONFIRMADO o nº de máquinas).

**Métricas e logs.** `metricas_municipio`: agregados escritos pelo próprio município sob RLS; o console lê todos (teste "nada que identifique pessoa ou imóvel" no catálogo). `/saude` responde só números. Logs Fastify: `redact` de authorization, cookie, senha, token, código, desafio, segredo, origem/destino, ficha; `req` serializado com método, caminho sem query, segredo de ofício redigido, host e `remoteAddress` (IP); erros sem `detail` do `pg`. Linhas de log com ids (usuarioId, ocorrenciaId, organização) em sincronizacao.ts, ocorrencias.ts:936, saida.ts:128. O console registra o e-mail do operador (servidor.ts:511,559). Nenhum log cruza dado de pessoa entre municípios (mesmo stream para todos, sem nome de cidadão). `notificadorDeLog` (link de recuperação em texto claro no `console.log`) é bloqueado em produção por `config.ts:690-745`.

### 14c. O que o teste de isolamento cobre e o que não cobre

**Cobre** (`db/test/isolamento.test.ts`, 5159 linhas, em PGlite com `SET LOCAL ROLE dc360_app`): leitura/alteração/criação cruzada e sem contexto; RLS ativada e forçada por descoberta no catálogo; policy amarrada a `app_organizacao_atual()`; coluna `organizacao_id`; FK sempre com organização; teto de 27 funções SD, `search_path` fixo, sem EXECUTE a PUBLIC; `dc360_app` não é superusuário nem dono; trilha append-only; ausência de DELETE (varredura universal com casos-irmãos); regras de banco (encerramento, protocolo, prefixo de chave); concorrência na mesma conexão; FKs cruzadas caso a caso; aparelhos, sino, ofício, segundo fator, métricas; varredura de privilégios do console (6 caminhos); `provisionar_municipio`. Complementos: `superficie.test.ts` (toda rota responde 401 sem token), `api.test.ts:240-326` (isolamento pela API em 6 casos), `eliminacao-de-municipio.test.ts`, suíte do console (259 casos, não executada por mim).

**NÃO cobre (buracos):**

1. Autorização por papel dentro do tenant: não há varredura rota x papel; `superficie.test.ts` só exige 401; `api.test.ts` "Autorização por papel" tem 4 casos. Uma rota nova só com `exigirAutenticacao` passa em todos os portões.
2. Recorte de equipe fora de `agente_campo` e fora de ocorrências/evidências/busca: os vazamentos de `/oficios` e `/avisos` passam (prova em AUT-12 e AUT-13).
3. Argumentos das funções SD de autenticação (prova definer.mjs).
4. Vigência do token: teste `describe.skip` (vigencia-na-escrita.test.ts:102); um teste vivo reprova.
5. Papéis de banco de produção (`dc360_api`, `dc360_console_login`, BYPASSRLS do dono): PGlite roda como superusuário; só a semântica de `dc360_app` é testada.
6. Isolamento de armazenamento no balde (credencial única) e de URLs assinadas por portador; busca e exportação só indiretamente (por RLS).
7. Pool real do `pg` sob concorrência (teste usa uma conexão; o job "sobe contra Postgres real" do CI foi lido pela auditoria de 30/09, não rodado).
8. Nenhum caso para atores da V2 (secretaria, cidadão): o portão universal acusaria tabela nova sem `organizacao_id`, mas uma identidade global (cidadão) exige uma nova lista de exceções (`SEM_TENANT` já tem 4) e uma nova policy, e o teste não diz como validá-la.
9. Escrita de `GET` (sino) e das rotas "da própria conta" não passa por teste de permissão.

Provas adicionais executadas por mim e NÃO previstas nos testes: 19 sondas de B contra ids de A (ocorrência, encerramento, despacho, providência, resposta, laudo, laudo.pdf, evidência url, usuário situacao/patch/redefinir-senha/encerrar-sessoes, equipe, órgão, ofício) todas 404, exceto `triagem` (422 por payload incompleto, inconclusivo) e `/evidencias/ocorrencia/:id` (200 com lista vazia, por desenho); controle com token de A = 200.

### 14d. Cruzamento com 05-secretarias.md (confirmado, não reinvestigado)

| Achado do relatório 05 | Minha verificação | Resultado |
| --- | --- | --- |
| Vigência removida em b4439ac, `describe.skip`, comentários desatualizados | Li `servidor.ts:449-467`, `git show b4439ac -- servidor.ts`, executei `senha-provisoria.test.ts`, e provei por API (prova P1, P2) | CONFIRMADO, com prova de ESCRITA 200/201 e evento na trilha, e acréscimo: um teste vivo reprova (`senha-provisoria.test.ts:183`) |
| `GET /oficios` e `/oficios/:id` sem permissão nem recorte (05 declara que NÃO executou como agente) | Executei como `agente_campo` (prova2, Q1) sobre ofício de ocorrência de outra equipe | CONFIRMADO POR EXECUÇÃO: ocorrência 404, lista e ficha do ofício 200 (inclui `observacoes`, `orgao_email`) |
| "Pelo menos 16 handlers de leitura só com autenticação" | Varredura empírica das 96 rotas: 32 só autenticadas, das quais 13 leituras de dados + `GET /avisos` + `POST /avisos/lidos` + `/busca` + `/documentos/validar` (mesma família dos 16 do 05) | CONFIRMADO; o total de rotas sem ação nomeada é 32 (11 da própria conta, 4 sino/aparelho, 4 utilidades, 13 leituras de dados) |
| `respondida_por` e `responsavel` em texto livre | Li `providencias` (006) e `ocorrencias.ts:1038-1078` | CONFIRMADO (IDN-24) |
| RLS por órgão exige mecanismo novo; policy `OR app_orgao_atual() IS NULL` seria fail-open | No banco não existe nenhum GUC de ator além de `app.organizacao_atual` (e `app.console_operador` no console); funções SD do portão de privilégios reprovam papel de banco novo que herde privilégio | CONFIRMADO (AUT-38, AUT-39) |

---

## Matriz D

| ID | SUPERFÍCIE | DOMÍNIO | REQUISITO / CAPACIDADE | ESTADO | EVIDÊNCIA | RISCO | DEPENDÊNCIAS | DECISÃO HUMANA? | OBSERVAÇÃO |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| IDN-01 | Web/Campo | Identidade | Conta de servidor municipal (`usuarios`): tenant, e-mail, matrícula, papel, equipe, ativo | A | 001:79-99; catálogo: RLS+FORCE; grants sem DELETE | Médio | IDN-02,03 | Não | 1 conta = 1 pessoa x 1 município x 1 papel x 1 equipe |
| IDN-02 | Transversal | Identidade | Papel como enum de 4 valores (coordenador, operador, agente_campo, administrador) | B | CHECKs 001:89, 001:307, 010:43, 021:220; dominio.ts:257; tokens.ts:25; permissoes.ts | Alto p/ V2 | AUT-35 | Sim (IDN-38/39) | Novo papel exige migração em 4 tabelas + shared + JWT + UI + web local |
| IDN-03 | Transversal | Identidade | Tenant por conta, obrigatório e imutável na prática (`organizacao_id NOT NULL`, FK RESTRICT) | A | 001:81; `sessoes`/JWT com `org` | Médio | IDN-14,37 | Sim | Não representa pessoa em 2 municípios nem cidadão global |
| IDN-04 | Transversal | Identidade | E-mail único global e case-insensitive, inclusive conta desativada | B | 002:31; prova P3: 409 entre municípios, caixa alta e desativada | Médio | IDN-41 | Sim | Oráculo de existência entre tenants para coordenador/administrador |
| IDN-05 | Transversal | Identidade | Matrícula única por município, case-sensitive, editável | B | 001:93; prova P3 (mesma matrícula em 2 municípios = 201) | Baixo | IDN-30 | Não | `SA-1042` e `sa-1042` coexistem |
| IDN-06 | Transversal | Autenticação | Login e-mail+senha, scrypt N=2^17, mín. 12, sem checagem de senha vazada | B | senha.ts:34; schemas.ts:961; autenticacao.ts | Médio | | Não | Auditoria de 30/09 diz 2^16 (divergência) |
| IDN-07 | Transversal | Sessão | JWT de acesso HS256 15 min, aud `dc360`, lista de segredos p/ rotação | A | tokens.ts:25-110; config.ts:356 | Baixo | | Não | Mesma audiência para painel e campo |
| IDN-08 | Transversal | Sessão | Refresh opaco rotacionado, reúso só de token rotacionado derruba a família; janela deslizante sem teto absoluto | B | servico.ts:482-580; 002 `abrir_sessao`; config.ts:357 | Médio | IDN-09 | Sim | ASVS 3.3 pede reautenticação periódica; campo offline usa 14 dias |
| IDN-09 | Transversal | Revogação | Revogação de refresh em desativação, troca/redefinição de senha, encerrar sessões e suspensão do município | A | administracao.ts:259; 005; 038:528-600; api.test.ts:615 | Baixo | | Não | Teste "na hora" só prova o refresh |
| IDN-10 | Web/Campo | Revogação | Revogação do token de ACESSO e checagem de vigência na escrita (conta ativa, papel, sessão viva) | B (regressão) | servidor.ts:449-467; b4439ac; vigencia-na-escrita.test.ts:102 skip; senha-provisoria.test.ts:183 falha; prova P1/P2 | Alto | IDN-13,AUT-19 | Sim (D5) | Conta desativada escreveu 200/201 e o evento entrou na trilha; 3 comentários afirmam o contrário |
| IDN-11 | Transversal | Desativação | Desativar sem apagar (registro e trilha preservados) | A | grants sem DELETE; administracao.ts:190-200; FK autor SET NULL | Baixo | | Não | Cumpre a regra do projeto |
| IDN-12 | Campo | Desativação | Aparelho de push de conta desativada | C | prova P4 (revogado_em NULL); 042:208; ocorrencias.ts:920 | Baixo | | Não | Bloqueio só por filtro nas varreduras |
| IDN-13 | Transversal | Papel | Troca de papel: coluna + trilha antes/depois; sem revogação de sessão | B | administracao.ts:294-375; prova P2 (POST /equipes 201 após rebaixar) | Médio | IDN-10 | Sim | Sem vigência de papel |
| IDN-14 | Transversal | Vínculo | Transferir pessoa entre municípios | D | e-mail reservado (IDN-04); sem entidade Pessoa | Médio | IDN-38 | Sim | Hoje: contas distintas, e-mail antigo liberado só editando a conta antiga |
| IDN-15 | Web/Campo | Vínculo | Pessoa com duas funções (coordenador que vistoria) | D | matriz: coord/adm = 403 em `/sincronizacao`, `/campo/meu-trabalho`, evidências | Médio | IDN-04 | Sim | Exige 2 contas com 2 e-mails |
| IDN-16 | Web | MFA | TOTP de servidor: opcional; obrigatório só para administrador e só com `SEGUNDO_FATOR_ATIVO=sim` | C | segundo-fator.ts:114-116; config.ts:291 (padrão nao); fly.toml não define | Alto | | Sim (D3) | Produção NÃO CONFIRMADO |
| IDN-17 | Web | Recuperação | Recuperação de senha por link | C | 005; autenticacao.ts:176; fly.toml:67 `RECUPERACAO_ATIVA="nao"` | Médio | provedor de e-mail | Sim (D4) | Desligada no piloto |
| IDN-18 | Web | Recuperação | Senha temporária de 72 h por redefinição do administrador, com troca obrigatória | A | 046; administracao.ts:433-535; senha-provisoria.test.ts (3 de 4 casos de sessão passam) | Médio | IDN-10 | Sim | Quem redefiniu conhece a credencial (personificação por 72 h) |
| IDN-19 | Web | Criação | Criação de conta: senha inicial digitada por quem cria, NÃO provisória, sem convite nem verificação de e-mail | B | administracao.ts:143-175 (INSERT sem `senha_provisoria_ate`) | Médio | | Sim (D11) | ASVS 2.3.1: segredo inicial não pode virar definitivo |
| IDN-20 | Web | MFA | Resetar o TOTP de outra pessoa | D | README.md:1373-1380; matriz sem rota | Médio | | Sim (D4) | Último administrador sem telefone e códigos: sem saída pela tela |
| IDN-21 | Console | Identidade | Operador do console (dono/operador), TOTP obrigatório, aud própria, sessão 30 min, conta relida por pedido | A | 038:200-260; console tokens.ts; servidor.ts:503-620 | Baixo | | Não | Auditoria de 30/09 (§3.7) está desatualizada |
| IDN-22 | Console | Recuperação | Códigos de recuperação do console | A | 039; db/test/recuperacao-do-console.test.ts (existe; não executei) | Baixo | | Não | |
| IDN-23 | Transversal | Identidade | Órgão parceiro por link de uso único, sem conta | A (como link) / D (como identidade) | 017:559-640; oficios.ts:602 | Médio | IDN-24,35 | Sim | IP e user-agent do abridor gravados |
| IDN-24 | Web | Identidade | Entidade órgão (catálogo) sem usuários; resposta por texto livre | C | 017:95-140; 006 `respondida_por text`; ocorrencias.ts:1038-1078 | Alto p/ V2 | IDN-35 | Sim | Resposta é atribuída ao servidor da Defesa Civil na trilha |
| IDN-25 | Banco | Identidade | Papéis de banco: dc360_app, dc360_console (NOLOGIN), logins e dono BYPASSRLS | A (catálogo) / G (produção) | catalogo.json roles; COLOCAR-DE-PE.md:120-150 | Alto | | Não | Produção só documentada |
| IDN-26 | Plataforma | Identidade | Operador de plataforma por credencial de dono (CLI, migração, SQL manual) | C | provisionar.ts:188-243; armazenamento/cli.ts:75-110; 036:60-100 | Alto | | Sim | Sem identidade individual nem trilha por pessoa |
| IDN-27 | Banco | Identidade | Relógios internos sem ator | A | index.ts; 016/021/026/038/042 | Baixo | | Não | |
| IDN-28 | Transversal | Auditoria | Eventos de identidade na trilha administrativa | C | grep `acao:`; servico.ts (trocarSenha sem trilha) | Médio | | Não | Faltam login, falha, bloqueio, troca da própria senha, recuperação, reúso |
| IDN-29 | Transversal | LGPD | IP e user-agent em `sessoes`, `recuperacoes_senha`, `oficio_aberturas` sem expurgo nem menção na política | C | 002:39-52; sem DELETE; PRIVACIDADE.md sem ocorrência | Médio | | Sim (D10) | Base legal e prazo = decisão humana |
| IDN-30 | Transversal | Auditoria | Snapshot do autor na trilha (nome, papel) | B | 001:307; laudo lê matrícula ao vivo (documentos.ts:107); prova L3 | Alto | | Sim (D9) | Editar nome/matrícula reescreve a assinatura do laudo |
| IDN-31 | Transversal | Identidade | Segredos de credencial fora do pacote de saída | A | saida/pacote.ts:150-216 | Médio | | Não | Deny-list de colunas é fail-open para coluna nova |
| IDN-32 | Campo | Autenticação | Token no SecureStore; gate de autoria `coletadaPor` (opcional no envelope) | A/B | sessao.tsx:75-79; sincronizacao.ts:462 | Baixo | | Não | Envelope sem `coletadaPor` passa |
| IDN-33 | Web | Autenticação | Tokens em `sessionStorage` (legível por JS) | A | apps/web/src/dados/http.ts:40-50; estado/sessao.tsx | Médio | | Não | Risco se houver XSS (fora do escopo) |
| IDN-34 | Transversal | Autenticação | Bloqueio por conta (5/15 min), limite por IP, resposta uniforme | A | servico.ts:80-200; enumeracao-pelo-bloqueio.test.ts | Baixo | | Não | Limitador por IP em memória do processo |
| IDN-35 | Secretarias | Identidade | Usuário de secretaria | E | sem tabela, coluna ou rota; ver 13.3 | Alto | IDN-02,38,39 | Sim | |
| IDN-36 | Secretarias | Identidade | Gestor de secretaria (administração escopada) | E | `podeGerirPapel` por posto, não por escopo (permissoes.ts) | Alto | IDN-35 | Sim | |
| IDN-37 | Cidadão | Identidade | Conta de cidadão | E | `usuarios.organizacao_id NOT NULL`; `canal_entrada` sem app | Alto | IDN-41 | Sim | |
| IDN-38 | Transversal | Modelo | Entidade Pessoa + vínculos (pessoa x tenant x órgão x papel) | D | não existe | Alto | | Sim (D1) | |
| IDN-39 | Transversal | Competência | Competência como dado (órgão, tipo COBRADE, território) | D | `equipes.especialidade` texto livre; nenhuma tabela | Alto | IDN-38 | Sim (D6) | |
| IDN-40 | Transversal | Modelo | Contas separadas por superfície (precedente: console) | C | console_operadores, aud separada, auth duplicada | Médio | | Sim (D1) | |
| IDN-41 | Cidadão | Identidade | Namespace de e-mail/telefone de cidadão versus servidor | E | índice global 002:31 | Alto | | Sim (D2) | |
| IDN-42 | Transversal | Identidade | Leitor externo somente leitura (auditor, câmara) | F | docs/PAPEIS_E_RESPONSABILIDADES.md pergunta 4 | Médio | | Sim (D8) | Só documentação |
| IDN-43 | Transversal | MFA | Política de MFA por papel/superfície/tenant | F | hoje só `administrador` + flag global | Alto | IDN-16 | Sim (D3) | |
| AUT-01 | Banco | Tenant | RLS ativada e FORÇADA em todas as tabelas | A | catalogo.json: 35/35; isolamento.test.ts:260 | Baixo | | Não | |
| AUT-02 | API | Tenant | Tenant só do JWT, via `SET LOCAL` em transação, sem rota que escape | A | postgres.ts:230-251; grep `comTenant(`; 19 sondas 404 | Baixo | | Não | |
| AUT-03 | Banco | Tenant | FKs compostas com `organizacao_id` | A | catálogo: 49 compostas, 30 p/ organizacoes, 2 do console | Baixo | | Não | |
| AUT-04 | Banco | Tenant | 27 funções SECURITY DEFINER, search_path fixo, sem EXECUTE a PUBLIC | A | catálogo; isolamento.test.ts:629-654 | Médio | | Não | Teto do teste = 27 = atual |
| AUT-05 | Banco | Tenant | Funções SD de autenticação sem conferir tenant do argumento | B | definer.mjs: trocar_senha e revogar_sessoes_do_usuario agiram sobre usuário de B | Alto | AUT-04 | Não | Sem caminho de API hoje; defesa em profundidade |
| AUT-06 | Banco | Grants | `dc360_app` sem DELETE (salvo avisos), colunas restritas; `dc360_console` estreito | A | catálogo de grants; portão 3562-4210 | Baixo | | Não | |
| AUT-07 | Banco | Tenant | Dependência de dono com BYPASSRLS em funções SD | B / G | COLOCAR-DE-PE.md:134; 037, 045 | Médio | IDN-25 | Não | Produção NÃO CONFIRMADO |
| AUT-08 | API | Papel | `exigirPermissao` antes do parse nas 53 rotas com ação | A | matriz.out: 403 nos papéis sem ação | Baixo | | Não | |
| AUT-09 | API | Papel | Posto e "último administrador" só na API | B | permissoes.ts `podeGerirPapel`; administracao.ts:232-255,338-350; sem trigger em `usuarios` (catálogo) | Médio | | Não | O console impõe regra equivalente no banco; o município não |
| AUT-10 | API | Papel | 32 rotas só autenticadas (11 da conta, 4 sino/aparelho, 13 leituras de dados, 4 utilidades) | B | matriz.out | Alto p/ V2 | AUT-11 | Sim | |
| AUT-11 | API | Recorte | Recorte de equipe só para `agente_campo`, em 9 leituras; fail-open para outros papéis | B | recorte-do-agente.ts:35; ocorrencias.ts; evidencias.ts; busca.ts:150 | Alto p/ V2 | AUT-10 | Sim | |
| AUT-12 | Campo | Recorte | `GET /oficios` e `/oficios/:id` ao agente: ofícios de ocorrências de OUTRA equipe | B | prova2 (Q1): ocorrência c2 dá 404 ao agente, mas lista e ficha do ofício dão 200 com `observacoes`, `orgao_email`, ids; oficios.ts:177-239 | Alto | | Não | Confirma achado do relatório de secretarias |
| AUT-13 | Campo/Web | Recorte | `GET /avisos` devolve avisos do município inteiro a qualquer papel e ESCREVE | B | avisos.ts:201-330; prova P6 | Médio | | Não | Protocolo e tipo de fato; GET com INSERT |
| AUT-14 | Transversal | Recorte | `GET /documentos/validar/:codigo` a qualquer papel, sem recorte | B | documentos.ts:877-920 | Baixo | | Não | Devolve protocolo e ocorrenciaId |
| AUT-15 | Transversal | Papel | Exceções à regra "toda escrita por exigirPermissao" | C | 11 rotas da conta + 4 sino/aparelho + `GET /avisos` + públicas | Médio | | Não | As da conta são deliberadas e comentadas |
| AUT-16 | API | Tenant | Recurso de outro município responde 404 | A | prova4: 17 de 19 = 404 (+2 explicados) | Baixo | | Não | Exceção: e-mail existente (IDN-04) responde 409 |
| AUT-17 | API | Papel | Posto insuficiente e dado pessoal no mesmo tenant respondem 403 | A | servidor.ts:543; prestacao-de-contas.ts:129 | Baixo | | Não | Decisão consciente |
| AUT-18 | API | Contexto | Escrita confere suspensão do município; leitura com token vivo não | A | suspensao.ts; servidor.ts:463-467 | Baixo | | Não | |
| AUT-19 | API | Contexto | Vigência na escrita (conta, papel, sessão) | B (regressão) | ver IDN-10 | Alto | IDN-10 | Sim | |
| AUT-20 | Web/Campo | Mapa | Rota por ruas só autenticada; resolver-link por `abrir_ocorrencia` | C | rota.ts:261; mapa.ts:478 | Baixo | | Não | Custo de API externa |
| AUT-21 | Web/Campo | Busca | Busca global por tenant; agente recortado; usuários só com gerenciar_usuarios | A/B | busca.ts:140-240; 041:216-232 | Médio | AUT-11 | Não | Fail-open para papéis novos |
| AUT-22 | Web | Exportação | CSV 2 níveis, resumo e saída de município com trilha | A | prestacao-de-contas.ts:129-330; saida.ts:39-130 | Baixo | | Não | |
| AUT-23 | Web | Exportação | Pacote de saída exclui credenciais por lista de tabelas e deny-list de colunas | A/B | saida/pacote.ts:150-216 | Médio | | Não | Coluna nova sensível sai por padrão |
| AUT-24 | API | Storage | Chave por tenant com CHECK, URL pré-assinada curta, credencial única do balde | B | 001 CHECK; s3.ts:62-63 | Médio | | Sim | Isolamento por prefixo, não por IAM |
| AUT-25 | API | Storage | URL assinada é bearer (sem vínculo a usuário ou IP) | C | s3.ts; tipos.ts | Baixo | | Sim | |
| AUT-26 | Campo | Push | Vitrine genérica; só aparelho de usuário ativo da equipe | A | push/mensagem.ts:55-110; 042:208 | Baixo | | Não | Revogação por logout só com ficha |
| AUT-27 | Transversal | Jobs | 5 relógios via funções SD sem parâmetro de município | A | index.ts; catálogo SD | Médio | AUT-07 | Não | |
| AUT-28 | API | Cache | Cache de rotas Google sem tenant; contadores em memória por processo | C | rota.ts:230; servico.ts:110-135; servidor.ts:381 | Baixo | | Não | Conteúdo não sensível |
| AUT-29 | Console | Métricas | Métricas agregadas pelo município; console só lê | A | 023; isolamento.test.ts:4530 | Baixo | | Não | |
| AUT-30 | API | Logs | Redact, caminho sem segredo, IP e ids em log, e-mail do operador do console | B | servidor.ts:129-310; console servidor.ts:511 | Médio | IDN-29 | Sim | IP é dado pessoal; sem política de retenção de log |
| AUT-31 | Console | Papel | Conta e papel relidos do banco a cada pedido | A | console servidor.ts:596-620 | Baixo | | Não | Contraste com IDN-10 |
| AUT-32 | Teste | Cobertura | Teste de isolamento de banco completo no nível tabela/FK/função/privilégio | A | isolamento.test.ts | Baixo | | Não | |
| AUT-33 | Teste | Cobertura | Não há varredura rota x papel nem cobertura de recorte intra-tenant | B | superficie.test.ts só 401; api.test.ts:327-375 | Alto | | Não | |
| AUT-34 | Teste | Cobertura | Não cobre argumentos de funções SD, vigência, papéis de produção, balde, pool real | B | 14c | Médio | | Não | |
| AUT-35 | Secretarias | Autorização | Autorização por competência do órgão | E | sem coluna, rota, policy | Alto | IDN-35,39 | Sim | |
| AUT-36 | Secretarias | Autorização | Administração escopada ao órgão | E | IDN-36 | Alto | | Sim | |
| AUT-37 | Cidadão | Autorização | Relato próprio sem acesso ao município | E | sem rota | Alto | IDN-37 | Sim | |
| AUT-38 | Banco | Tenant | RLS intra-tenant por órgão, equipe ou papel | E | policies só por `organizacao_id`; o banco não conhece o ator (`app.usuario_atual` não existe) | Alto | | Sim | |
| AUT-39 | Banco | Identidade | Papel de banco e audiência de token por superfície nova | E/F | padrão do console | Médio | | Sim (D1) | |
| AUT-40 | Banco | Trilha | `trilha_eventos.origem` só `campo`/`escritorio`, `autor_papel` em CHECK, `ocorrencia_id NOT NULL` | B p/ V2 | 001:307-308 | Médio | | Não | Relato do cidadão não cabe |
| AUT-41 | API | Papel | Comparações de papel espalhadas no código | B | administracao.ts:240,326,338; busca.ts:150; recorte-do-agente.ts:35; evidencias.ts:192; prestacao-de-contas.ts:129; web local.ts:1362,2059; campo perfil.tsx:312,1144 | Médio | | Não | |
| AUT-42 | API | Taxa | Limite global 300/min por usuário e login por IP | A | servidor.ts:381-398 | Baixo | | Não | |

## Fluxos

| FLUXO | PASSO | ESTADO (EXISTE/PARCIAL/AUSENTE/NOVO V2) | EVIDÊNCIA |
| --- | --- | --- | --- |
| Login do servidor | e-mail+senha -> `credenciais_para_login` -> scrypt -> bloqueio -> suspensão -> senha provisória -> sessão + JWT | EXISTE | servico.ts:155-240 |
| Login do administrador | senha -> desafio aud `dc360-desafio` (5 min) -> TOTP ou código de recuperação -> sessão | PARCIAL (só com flag ligada) | servico.ts:232-330; segundo-fator.ts:114 |
| Renovação | refresh rotacionado, reúso derruba família, suspensão e senha provisória conferidas | EXISTE | servico.ts:482-580 |
| Desativação de conta | `ativo=false` + revogação de refresh + trilha | EXISTE | administracao.ts:202-292 |
| Desativação de conta | bloqueio imediato do access token e da escrita | AUSENTE (regressão) | servidor.ts:454-467; prova P1 |
| Troca de papel | edição + trilha antes/depois | EXISTE | administracao.ts:294-375 |
| Troca de papel | efeito imediato no token e nas sessões | AUSENTE | prova P2 |
| Criação de conta | administrador digita senha; sem convite nem verificação | PARCIAL | administracao.ts:143-175 |
| Redefinição por administrador | senha temporária 72 h, revoga sessões, trilha | EXISTE | administracao.ts:433-535 |
| Recuperação por e-mail | pedido -> link 30 min -> senha nova -> revoga sessões | PARCIAL (desligada no piloto) | 005; fly.toml:67 |
| Reset de TOTP de terceiro | | AUSENTE | README.md:1373 |
| Provisionar município | CLI ou console cria org + administrador provisório + linha espelho | EXISTE | 036, 046; provisionar.ts |
| Suspensão de município | console -> revoga sessões -> `abrir_sessao` recusa -> escrita 403/503 | EXISTE | 038; suspensao.ts |
| Console | senha -> desafio -> TOTP -> sessão 30 min, conta relida por pedido | EXISTE | console servidor.ts:503-620 |
| Órgão abre ofício | e-mail com link -> `abrir_oficio` -> documento uma vez -> registro de IP | EXISTE | 017:559-640 |
| Órgão responde | resposta digitada por servidor da Defesa Civil (texto livre) | PARCIAL | ocorrencias.ts:1038-1078 |
| Secretaria autenticada | login, ver só sua competência, aceitar/devolver, responder com evidência | NOVO V2 | sem rota nem tabela |
| Cidadão | cadastro, relato, triagem, conversão em ocorrência | NOVO V2 | sem rota nem tabela |

## Gaps

1. P0 SEGURANÇA: vigência de conta/papel/sessão desligada na escrita (servidor.ts:454-467); conta desativada ou rebaixada escreve por até 15 min (prova P1, P2); comentários e testes divergem (IDN-10, AUT-19).
2. P0 INTEGRIDADE: a trilha append-only recebeu evento assinado por conta já desativada (prova P1); laudo reimpresso reflete nome e matrícula editados depois (prova L3) (IDN-30).
3. P0 SEGURANÇA: funções SD de autenticação (`trocar_senha`, `revogar_sessoes_do_usuario`, `registrar_tentativa_login`, e as que recebem uuid) não conferem o tenant do contexto (AUT-05).
4. P0 SEGURANÇA: `GET /oficios` e `GET /oficios/:id` sem recorte; `GET /avisos` sem recorte e com escrita em GET (AUT-12, AUT-13).
5. P0 SEGURANÇA: padrão fail-open de papel novo: 13 leituras de dados abertas a qualquer autenticado e recorte só para `agente_campo` (AUT-10, AUT-11). Precondição para a V2.
6. P0 SEGURANÇA: senha inicial digitada por quem cria a conta, não provisória, sem convite nem verificação de e-mail (IDN-19).
7. P0 LGPD: IP e user-agent em `sessoes`/`recuperacoes_senha`/`oficio_aberturas` sem expurgo e fora da política de privacidade; base legal e prazo são decisão humana (IDN-29).
8. P1 PRODUTO: 1 conta = 1 município x 1 papel, e-mail global inclusive de desativadas; dupla função e transferência exigem contas separadas (IDN-04, 14, 15).
9. P1 PRODUTO: modelo não suporta secretaria nem cidadão (enum em 4 CHECKs, sem vínculo, sem competência, sem audiência própria) (IDN-35 a 41, AUT-35 a 40).
10. P1 OPERAÇÃO: auditoria de autenticação incompleta (sem login, falha, bloqueio, troca da própria senha, recuperação, reúso) (IDN-28).
11. P1 OPERAÇÃO: sem varredura rota x papel; a única defesa é revisão humana (AUT-33).
12. P1 OPERAÇÃO: recuperação desligada, redefinição por terceiro que conhece a senha por 72 h, sem reset de TOTP de outra pessoa (IDN-17, 18, 20).
13. P1 CONTINUIDADE: último administrador sem telefone e sem códigos depende de SQL com credencial de dono (IDN-20, IDN-26).
14. P1 OPERAÇÃO: documentação desatualizada: 3 comentários dizem que a vigência está em vigor; auditoria de 30/09 afirma console sem MFA e N=2^16; `db/PENDENCIAS.md` parado em 09/09; comentário de avisos.ts cita "doze" funções SD (são 27).
15. A DEFINIR: MFA desligado por padrão, obrigatório só a administrador; estado de produção desconhecido (IDN-16, IDN-43).
16. A DEFINIR: sessão deslizante sem teto absoluto (IDN-08).
17. A DEFINIR: e-mail de outro município revelado por 409 a coordenador/administrador (IDN-04).
18. A DEFINIR: dependência de BYPASSRLS do dono e dos logins `dc360_api`/`dc360_console_login` não verificável no repositório (IDN-25, AUT-07).
19. P2 EVOLUÇÃO: credencial única do balde; URL assinada bearer (AUT-24, AUT-25).
20. P2 EVOLUÇÃO: cache Google sem tenant; limitador de taxa em memória por máquina (AUT-28).
21. P2 EVOLUÇÃO: matrícula case-sensitive; deny-list de colunas do pacote de saída é fail-open (IDN-05, AUT-23).
22. P1 PRODUTO: `providencias.respondida_por` é texto livre; o órgão não tem identidade nem estados de aceite/devolução (IDN-24).

## Decisões humanas

**D1. Modelo de identidade: contas separadas por superfície, pessoa única com vínculos, ou híbrido?**
Por que importa: define tabelas, tokens, papéis de banco e quanto da auth é reescrito. Bloqueia: secretaria, cidadão, dupla função, transferência entre municípios, e o escopo de `gerenciar_usuarios`.
Alternativas e riscos: (a) contas separadas por superfície (precedente: console): isolamento forte de audiência e namespace, mas auth duplicada (senha, TOTP, recuperação), pessoa com dois papéis vira duas contas; (b) pessoa única + vínculos (pessoa x tenant x órgão x papel): uma credencial para dupla função e transferência, mas exige nova entidade global fora do RLS por tenant, novas funções pré-tenant e migração dos `usuarios` existentes; (c) híbrido (cidadão separado, servidores e secretarias com vínculos): menor superfície de colisão, dois mecanismos a manter.

**D2. Identidade do cidadão: namespace e forma de login.**
Por que importa: índice global de e-mail, squatting de e-mail institucional, verificação, recuperação por e-mail ou telefone, relato em mais de um município. Bloqueia o app do cidadão. Alternativas: e-mail, telefone com código único, login federado (decisão de negócio, não assumo base legal). Riscos: e-mail no mesmo namespace dos servidores (colisão, enumeração); telefone (troca de chip, custo de SMS); federado (dependência externa e adequação).

**D3. MFA por papel, superfície e município.**
Por que importa: hoje só `administrador` e só com flag global; coordenador redefine senha e exporta dados. Bloqueia: política de gestor de secretaria e de acesso do cidadão. Alternativas: obrigatório a todos os servidores; obrigatório por papel; configurável por município; opcional. Riscos: atrito no campo e no plantão; conta travada de administrador (ver D4); uniformidade x flexibilidade por município.

**D4. Recuperação de conta e quem pode resetar o MFA de outra pessoa.**
Por que importa: piloto roda sem e-mail; redefinição por terceiro cria janela de personificação de 72 h; último administrador sem telefone depende de SQL. Alternativas: ligar e-mail; reset de TOTP por administrador com dupla aprovação; reset por console com dono; códigos impressos. Riscos: porta para retirar proteção alheia; dependência do fornecedor; custo de provedor.

**D5. Política de revogação do token de acesso.**
Por que importa: hoje 15 min de leitura e escrita após desativar. Alternativas: religar `vigencia.ts` na escrita (1 consulta por escrita); também na leitura (1 por pedido); encurtar `ACESSO_MINUTOS`; lista de revogação em cache. Riscos: latência em noite de chuva, 401 na fila do campo (tratado como falha permanente em packages/campo/src/transporte.ts, segundo o próprio comentário de vigencia.ts), consistência em várias máquinas.

**D6. Competência: dado ou papel?**
Por que importa: define se "Obras só vê Obras" é um papel por secretaria, um papel genérico com vínculo a `orgao_id`, ou permissões por tipo COBRADE/território. Bloqueia o portal das secretarias. Alternativas: (a) um papel por secretaria (simples, explosão de papéis e CHECKs); (b) papel genérico + vínculo ao órgão + RLS intra-tenant por órgão; (c) competência como dado configurável por município. Riscos: (a) migração a cada secretaria; (b) o banco passa a precisar conhecer o ator (`app.usuario_atual`); (c) complexidade e erro de configuração do município.

**D7. Teto absoluto de sessão e vida do refresh.**
Por que importa: janela deslizante infinita x campo offline por 14 dias. Alternativas: manter; teto de 30/90 dias; teto por superfície. Riscos: re-login no morro sem sinal; refresh roubado vivo indefinidamente.

**D8. Leitor externo somente leitura (auditor, câmara) existe?** Pergunta 4 de PAPEIS_E_RESPONSABILIDADES.md. Bloqueia o papel e sua política. Riscos: expor dado de cidadão; ou omitir a demanda de transparência.

**D9. Quem assina o laudo: identidade congelada ou viva?**
Por que importa: editar nome ou matrícula reescreve documento já emitido. Alternativas: snapshot na vistoria; snapshot na emissão; manter vivo com histórico. Riscos: snapshot exige migração e regra de correção; vivo compromete a prova.

**D10. Retenção de IP e user-agent (sessões, recuperação, abertura de ofício) e de logs.** Bloqueia a política de privacidade. Riscos: guardar sem finalidade; apagar e perder investigação de incidente.

**D11. Quem cria usuários de secretaria e como recebem a primeira credencial.** Alternativas: administrador da Defesa Civil; gestor da secretaria; autocadastro com aprovação; convite por e-mail. Riscos: credencial conhecida por quem cria; convite depende de e-mail (hoje desligado).

**D12. Permitir e-mail compartilhado ou institucional em mais de um vínculo?** Bloqueia a unicidade de e-mail. Riscos: responsabilização individual x conveniência.

## Riscos arquiteturais

1. Falta a entidade Pessoa: tudo gira em torno de `usuarios` (tenant, papel, e-mail, senha e equipe na mesma linha).
2. O banco não conhece o ator: só `app.organizacao_atual`. Toda regra de papel, posto, equipe e competência mora em `if` de rota, inclusive "último administrador". Escalar para órgão e cidadão multiplica esses `if`.
3. Falha aberta por omissão: o recorte é exceção para um papel, o padrão é município inteiro.
4. Token sem revogação efetiva e sem superfície: mesma audiência e mesma chave para painel e campo; vigência desligada.
5. Portas pré-tenant como `SECURITY DEFINER` crescem por superfície, o teto está colado em 27, e as de autenticação não conferem tenant do argumento.
6. Dependência operacional do dono com BYPASSRLS, invisível em PGlite.
7. Duplicação de auth entre `apps/api/src/auth` e `apps/console/src`, e regras duplicadas em `apps/web/src/dados/local.ts`.
8. Enumerações espalhadas (4 CHECKs, shared, JWT, trilha, UI, web local, campo) sem fonte única.
9. Credencial única do armazenamento para todos os municípios.
10. Operação de plataforma por credencial de dono compartilhada, sem trilha por pessoa.

## Dívidas técnicas

1. Religar ou remover `auth/vigencia.ts`, o `describe.skip`, o teste reprovado (`senha-provisoria.test.ts:172`) e os 3 comentários que afirmam vigência ativa.
2. Varredura rota x papel x tenant como teste (a matriz de `tmp\matriz.mts` mostra como).
3. Conferir `app_organizacao_atual()` nas funções SD que recebem uuid de usuário, ou movê-las para dentro de `comTenant`.
4. Registrar na trilha: login, falha, bloqueio, troca da própria senha, recuperação, reúso de refresh.
5. Expurgo e política para `sessoes.ip/user_agent`, `recuperacoes_senha.ip`, `oficio_aberturas.ip`.
6. `POST /usuarios` com senha provisória ou convite.
7. `GET /avisos` escreve: separar leitura de materialização.
8. Matrícula com unicidade case-insensitive; índice de e-mail parcial (ou política explícita) para contas desativadas.
9. Atualizar `db/PENDENCIAS.md`, comentários sobre "doze funções SD", README sobre armazenamento, auditoria de 30/09 (§3.7, N do scrypt).
10. Conferir nos comentários de `administracao.ts:200` e `suspensao.ts` a janela real de 15 min (leitura e escrita).
11. Deny-list de colunas do pacote de saída vs lista positiva.
12. Comparações de papel espalhadas (AUT-41) atrás de uma função única.

## NÃO CONFIRMADO

1. Papéis de banco de produção (`dc360_api`, `dc360_console_login`, membership `WITH SET TRUE`, NOINHERIT) e BYPASSRLS do dono: só documentação (COLOCAR-DE-PE.md, IMPLANTACAO.md).
2. `SEGUNDO_FATOR_ATIVO`, `PUSH_ATIVO`, `S3_*`, número de máquinas do Fly: não estão no repositório (segredos).
3. Execução de `db/test/isolamento.test.ts`, suítes do console e `recuperacao-do-console.test.ts`: não rodei (somente um arquivo de teste pontual).
4. Conteúdo do código de triagem (`POST /ocorrencias/:id/triagem` cruzado entre municípios): a sonda deu 422 por payload incompleto, sem conclusão.
5. SSRF de `mapa/resolver-link`, XSS do painel e CSP da SPA: fora do escopo desta frente.
