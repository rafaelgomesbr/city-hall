# Baseline Zero da V2: Operação (§19 backup, continuidade e desastre; §20 observabilidade; §21 SDLC e segurança de desenvolvimento)

- Data: 30/09/2026. Repositório: branch master, HEAD e82719e (17/09/2026). Frente OPS. Somente leitura.
- Convenção de caminhos: `dc360/...` é relativo a `C:\Projetos\city-hall`; o workflow está em `.github/workflows/verificar.yml` (raiz do repositório).
- Comandos que executei (todos de leitura): `git log/ls-tree/show/grep`, `npm audit` (raiz de `dc360` e `apps/campo`, sem alterar nada), um recálculo em Node do md5 das impressões de migração, e buscas por padrão (grep). Não rodei suíte de teste, `npm install/ci`, `npm audit fix`, docker nem fly/supabase/vercel.

## Resumo

1. **Backup.** O único restore provado é de 09/09/2026 (`dc360/docs/COLOCAR-DE-PE.md`, Parte 6): banco de 15 tabelas e 15 migrações, dump de 6,2 s, restore de 0,4 s. A evidência é narrativa, mas recalculei o md5 das impressões de migração a partir dos arquivos do repositório e ele é idêntico ao do documento (`b446363ca68b430a7ab01e380eaa0a17`), o que corrobora que os números vieram de um banco real. Hoje o esquema tem 46 migrações e 36 relações; o restore não foi refeito desde então e o roteiro provavelmente falha em `dc360_console` (migração 023) e `pg_trgm` (041) (inferência, não testada).
2. **RPO e RTO:** nenhum medido; periodicidade do reteste segue `[[a definir]]` (INDISPONIBILIDADE.md:104). Backup automático do provedor e PITR: NÃO CONFIRMADO (só o painel do Supabase prova). Fotos e assinaturas (Storage) ficam fora do dump e não têm nenhuma cópia. Não há agendamento nem monitoramento de backup, e os roteiros de cópia e migração só rodam num Mac (chaveiro `security`).
3. **Observabilidade.** Existem: logs JSON (pino) com redação testada, id de requisição no servidor, `/saude`, métricas agregadas por município no console, varredura de push que relata o que fez. Não existem: erro centralizado (Sentry ou equivalente), alertas, métricas de aplicação, tracing, página de status, destino e retenção de log, crash report no app e no painel. Falha das rotinas de minimização, resumo e órfãos é registrada em nível `info`.
4. **SDLC.** CI com 5 jobs (typecheck, portão CA-06, suíte, e2e em Chromium e Firefox, API contra Postgres 16 real, app de campo). Não existem: lint, SAST, secret scanning, SBOM, licenças, DAST, scan de contêiner, Dependabot/Renovate, build da imagem Docker no CI, agendamento do CI, tags, changelog, CD, staging.
5. **`npm audit` hoje (medido):** sai com código 1 nos dois lockfiles (dc360: 1 moderada em runtime, `fast-uri`; `apps/campo`: 4, sendo 1 alta só de desenvolvimento). O CI roda `npm audit --audit-level=low` e bloqueia, então o CI tende a estar vermelho sem nenhuma mudança de código (status real do CI: NÃO CONFIRMADO). README afirma "em zero".
6. **Revisão de código:** 119 commits direto em master, 0 merges, 0 marcas de PR, 1 autor. Branch protection só se verifica no GitHub.
7. **Mobile:** `eas.json` com homologação apontando para `exemplo.gov.br`, submit iOS `PREENCHER`, `projectId` vazio, sem `expo-updates`; nenhum build EAS comprovado. Bundle id `com.solerte.dc360.campo` segue o mesmo apesar de o guia mandar trocar. Contas Apple/Google: só verificáveis nas lojas.
8. **V2:** push do cidadão exige modelo de aparelho sem usuário e suporte a mais de um `APNS_BUNDLE`; e-mail das secretarias exige provedor ligado com domínio verificado; dois apps em loja; staging não existe.

---

## 1. Narrativa por seção

### 1.1 §19 Backup, continuidade e desastre

#### 1.1.1 Resposta ponto a ponto

| Pergunta | Resposta | Evidência |
| --- | --- | --- |
| Tecnologia atual de backup | (a) cópia automática do provedor (Supabase) e PITR: **documentados, NÃO CONFIRMADOS**; (b) dump lógico manual `pg_dump --format=custom --schema=public`, feito só antes de migrar; (c) nada para o Storage; (d) nada para segredos | COLOCAR-DE-PE.md:111-118, 594-597; `dc360/scripts/copiar-producao.mjs:62-282` |
| Onde está documentado | `docs/COLOCAR-DE-PE.md` Parte 6 (restore), `docs/INDISPONIBILIDADE.md` 3.4, `docs/IMPLANTACAO.md` seção 8 (cópia antes de migrar) | os três arquivos |
| Último restore realmente executado | 09/09/2026, no Mac do autor, contra cluster PostgreSQL 17.6 descartável; origem Supabase `sa-east-1` | COLOCAR-DE-PE.md:347-352 |
| Evidência datada no repositório | Só a narrativa, commitada em a8e100f (09/09/2026 02:26). Não há log bruto, transcrição, nem relatório assinado. **Corroboração independente feita por mim:** o md5 `b446363c...` citado em COLOCAR-DE-PE.md:532 é reproduzido pelo script abaixo sobre os arquivos de migração 001 a 015 (em HEAD e em a8e100f) | recálculo Node: sha256 do SQL com espaço normalizado (igual a `db/src/migrar.ts:59-68`), `md5(versao:impressao, ...)`; resultado `b446363ca68b430a7ab01e380eaa0a17` nos dois commits. A lista de 15 tabelas do documento também bate com os `CREATE TABLE` das migrações 001 a 015 mais `schema_migracoes` |
| RPO medido | **Não medido.** O documento mede duração de comando, não perda de dados. Com backup manual sem agenda, o RPO efetivo é a idade da última cópia, que ninguém registra | ESPECIFICACAO RNF-06 (linha 260) é hipótese 24 h; levantamento 5.5 recomenda 15 min |
| RTO medido | **Não medido.** "Menos de 10 segundos de comando" e "primeira meia hora instalando pg_dump"; a API não foi apontada para o banco restaurado | COLOCAR-DE-PE.md:577-582, 607-609 |
| Anexos (Storage) incluídos | **Não.** `--schema=public` não leva `storage.objects`; o documento diz que a cópia do balde é procedimento "ainda não escrito e não testado"; nenhum script de cópia de balde existe (grep negativo: rclone, s3 sync, copiar-balde) | COLOCAR-DE-PE.md:586-593, 600-603 |
| Banco incluído | Sim, só o esquema `public` (tabelas do produto). Não leva papéis e senhas, extensões, nem esquemas do provedor | COLOCAR-DE-PE.md:600-606 |
| Segredos necessários para restaurar | Senha do papel de setup (chaveiro macOS `senha-do-banco-dc360`), senha e `DATABASE_URL` de `dc360_api` (não vem no dump), `JWT_SEGREDO`, **`SEGUNDO_FATOR_CHAVE`** (sem ela os segredos TOTP guardados no banco ficam ilegíveis), `CONSOLE_DATABASE_URL`, `CONSOLE_JWT_SEGREDO`, `CONSOLE_SEGUNDO_FATOR_CHAVE`, `S3_*`, `APNS_*`, chave do Resend, `MAPS_KEY`, `ROUTES_KEY`. O inventário existe nos guias; **não há cofre nem cópia de guarda documentada**: só `fly secrets` e o chaveiro de uma máquina | COLOCAR-DE-PE.md:177-191; IMPLANTACAO.md:259-290; `dc360/scripts/producao.mjs:14-16,73-92` |
| Procedimento | Escrito e detalhado (comandos, erros encontrados, conferências) para o esquema de 15 migrações. Não cria `dc360_console` nem instala `pg_trgm` (ver 1.1.2) | COLOCAR-DE-PE.md:340-616 |
| Periodicidade | **"a definir"**: INDISPONIBILIDADE.md:104 `[[periodicidade a definir]]`. COLOCAR-DE-PE.md:611-616 diz "pelo menos uma vez por mês enquanto o piloto estiver de pé". Levantamento 5.5: trimestral com relatório assinado. Três versões, nenhuma decidida | os três |
| Automação | **Nenhuma.** O workflow só dispara em push e pull_request (verificar.yml:13-16); `fly.toml` não tem rotina; o único "gatilho" é a recusa do migrador sem cópia de 30 min | verificar.yml; `dc360/scripts/migrar-producao.mjs:58-70,115-121` |
| Monitoramento de backup | **Nenhum.** Nada avisa se a cópia do provedor parou, se o último dump é velho, ou se o restore falha | grep negativo |
| Teste de restauração | Um, em 09/09/2026, em banco novo e descartável. Não testados: PITR, restaurar sobre a produção, subir a API contra a cópia, ciclo de login | COLOCAR-DE-PE.md:594-609 |

#### 1.1.2 Por que o restore de 09/09 não vale automaticamente para o esquema de hoje

Fato: o teste cobriu 15 migrações e 15 tabelas (COLOCAR-DE-PE.md:523-532). Hoje `dc360/db/migrations` tem 46 arquivos (até `046_senha_provisoria...`) e as migrações criam 35 tabelas, mais `schema_migracoes`. O próprio documento manda refazer o teste "depois de cada migração que mexa em papel, policy ou grant" (611-614). Desde então houve várias: 023 (`CREATE ROLE dc360_console`), 034, 036, 038, 039, 046.

Inferência (NÃO testada, marcada como tal): o passo 2 do roteiro de restore cria apenas `dc360_app`, `dc360_api`, `anon`, `authenticated`, `service_role` e `supabase_admin` (COLOCAR-DE-PE.md:430-438). Um dump do esquema atual traz `GRANT ... TO dc360_console` e `CREATE POLICY ... TO dc360_console` (023:180-192, 344-347), e o `pg_restore --exit-on-error` pararia em `role "dc360_console" does not exist`, o mesmo tipo de erro que o documento registra para `supabase_admin`. A migração 041 cria `pg_trgm` e quatro índices `gin_trgm_ops` (041:284-322) dentro de um bloco condicional; o roteiro não instala a extensão no destino. Nada disso foi exercitado.

Mais: `db/PENDENCIAS.md` descreve o console como não construído e `resumir_municipio()` como "nada a chama" (linhas 1-46), o que é falso hoje (`apps/console` existe; `dc360/apps/api/src/index.ts:338-380` agenda o resumo). É documentação velha, não serve de prova de nada.

#### 1.1.3 O que depende de infraestrutura externa e NÃO pode ser provado só pelo repositório

| Item | O que o Rafael confere e onde |
| --- | --- |
| Backup automático do banco ligado, plano, retenção, PITR | Painel Supabase do projeto (Database, Backups; Project Settings, Add-ons). Anotar data do último backup e janela de retenção |
| Região e redundância do Storage, versionamento, política de retenção do balde `dc360-evidencias` | Painel Supabase, Storage. O repositório não contém nenhuma configuração de balde |
| Se existe cópia do balde em outra conta ou outra região | Não existe no repositório. Só se sabe olhando o provedor |
| Estado do app Fly `defesa-civil` e `defesa-civil-console` (máquinas, regiões, secrets existentes, releases anteriores para rollback) | `fly status`, `fly secrets list` (mostra nomes, não valores), `fly releases` |
| Quem tem acesso a Fly, Supabase, Vercel, GitHub, Apple, Google, Expo; se há segundo dono | Cada console de conta/organização |
| Existência de cópia dos segredos fora do Fly (cofre) | Com o Rafael; o repositório não tem |
| Se a cópia `~/dc360-copias` existe hoje, em que máquina e com que prazo | Máquina do operador (macOS) |
| Plano e limites do Resend, domínio verificado | Painel do Resend (hoje não ligado) |

### 1.2 §20 Observabilidade

Prova por código e configuração, capacidade a capacidade:

| Capacidade | Existe? | Prova |
| --- | --- | --- |
| Logs estruturados | **Sim (API).** pino via Fastify, nível `info` em produção, `redact` de senha, token, código do segundo fator, ficha de push, posição do agente; serializador de `req` sem query string e sem segredo de URL (`caminhoParaLog`); serializador de `err` sem o `detail` do pg. Testado em `apps/api/test/log.test.ts`. Console: pino com serializadores padrão, sem `redact` | `apps/api/src/servidor.ts:139-311`; `apps/console/src/servidor.ts:257-261` |
| Nível configurável | Não. Não há variável de nível de log | `apps/api/src/config.ts` (chaves do esquema) |
| Correlation/request id | **Parcial.** `genReqId: () => crypto.randomUUID()` e o corpo do 500 traz `requisicao: req.id`; o pino registra `reqId` nas linhas de requisição (não há `disableRequestLogging`). Não há header de resposta, não aceita id vindo do cliente, nenhum cliente o exibe (grep negativo em `apps/web/src` e `apps/campo/src`), nenhum teste o afirma (grep negativo em `apps/api/test`) | `servidor.ts:316, 581-586` |
| Métricas de aplicação | **Não.** Sem prom-client, OpenTelemetry, Datadog etc.; `fly.toml` sem seção `[metrics]` | grep negativo |
| Métricas de negócio por município | **Sim, agregadas.** `metricas_municipio` (uma linha por município por dia), escrita a cada 15 min por rotina dentro da API, lida pelo console; a visão `console_situacao_dos_municipios` parte de `organizacoes` para que silêncio vire sinal (`sem_escrita_recente` após 36 h) | `db/migrations/023_metricas_do_municipio.sql:89-130, 291-321`; `apps/api/src/index.ts:338-380` |
| Health check | **Sim.** `GET /saude` (API): consulta `schema_migracoes` e devolve `status`, `banco`, `ultimaMigracao`, contadores de eliminação e o resumo da última rodada de push; 503 se o banco falha. Fly consulta a cada 15 s. CI prova o 200 contra Postgres real | `servidor.ts:597-663`; `fly.toml:115-120`; `verificar.yml:314-330` |
| Readiness | **Parcial.** Mesma rota. A recusa de esquema atrasado acontece só na partida (`index.ts:44-56`). O comentário de `servidor.ts:592` fala em `esquemaEmDia`, campo que a resposta não tem; README:1043-1044 e `fly.toml:112-114` dizem que o 503 cobre "esquema atrasado", mas o código só devolve 503 se a consulta falhar. O ramo 503 não tem teste (grep negativo) | idem |
| Alertas | **Não.** Nenhum destino de alerta (pager, e-mail, chat, webhook). Falha só aparece para quem olha `fly logs` ou o console | grep negativo |
| Erro centralizado (Sentry ou equivalente) | **Não**, em nenhuma das quatro pontas. Painel sem ErrorBoundary nem handler global; app de campo sem ErrorBoundary nem crash report | grep negativo em `apps/web/src`, `apps/campo/src`, `apps/api/src`, `apps/console/src` |
| Rotinas agendadas | **Parcial.** Cinco relógios dentro do processo da API (varredura de push 5 min, minimização 1 h, resumo 15 min, órfãos 24 h atrás de chave, eliminação 15 min), cada um com trava `pg_try_advisory_lock` e pool próprio. Sinal externo só para push e eliminação (`/saude`). **Falha de minimização, resumo e órfãos entra no log com `app.log.info`** (`index.ts:314, 377, 428`); só a eliminação usa `warn` (491) | `index.ts:183-494`; `push/trava.ts:81-124` |
| Sincronização | **Parcial.** Recusas específicas em `req.log.warn` (autoria divergente e similares); `aparelhos_sem_aparecer` (dois dias) na métrica diária. Sem profundidade nem idade de fila, sem taxa de erro de sync, sem relato do aparelho | `rotas/sincronizacao.ts:461,764,771,1032,1570`; 023:237-238 |
| Push | **Parcial.** Linha de log por rodada (warn com motivos agregados se houve falha, info se entregou tudo), `push` em `/saude`, coluna `notificacoes_enviadas.detalhe`, guia de diagnóstico. **`PUSH_ATIVO` está comentado em `fly.toml:90`**: na configuração versionada o push está desligado; o estado real do ambiente é NÃO CONFIRMADO. `/saude` mostra a última rodada só da máquina que responde | `push/varredor.ts:379-381`; `servidor.ts:656-662`; IMPLANTACAO.md:502-537 |
| E-mail | **Parcial.** `oficio_envios` guarda desfecho e `provedor_id`; `req.log.error` em falha de envio. Sem webhook de entrega ou rejeição. `RECUPERACAO_ATIVA="nao"` em `fly.toml:67`; `EMAIL_ATIVO` fora do `fly.toml` (padrão `nao`) | migração 027; `rotas/oficios.ts:563` |
| Armazenamento | **Parcial.** Uso por município e teto de 80/100/150 % (`GET /armazenamento/uso`, CLI `--uso`); varredura de órfãos desligada por padrão e nunca executada contra o provedor real; o consumo não aparece no console; nenhuma sonda de storage em `/saude` | `docs/ARMAZENAMENTO.md:21-110, 262-270, 287-293` |
| Tracing | **Não** | grep negativo |
| Auditoria operacional | **Sim, de negócio e administração** (`trilha_eventos`, `trilha_administrativa`, `exportacoes`, `ocorrencia_consultas`, append-only por ausência de policy). Não há a trilha "técnica" (deploy, job) nem encadeamento por hash que o levantamento 5.6 pede (grep por `previous_hash`/cadeia não acha nada no produto). Profundidade dessas trilhas fica com as outras frentes | migrações 001:300, 010:33, 007, 021:209 |
| Versão implantada visível | **Não.** `/saude` não traz versão nem SHA; `fly deploy` parte da máquina do operador; sem tag | `servidor.ts:662` |
| Timeouts de banco | **Parcial.** Pool de 10, ociosa 30 s, conexão 5 s; sem `statement_timeout` | `apps/api/src/banco/postgres.ts:152-155` |

#### 1.2.1 O que o console enxerga de saúde dos tenants

O console (`apps/console`, processo e segredo separados, segundo fator obrigatório) lê somente a visão `console_situacao_dos_municipios`, a tabela `metricas_municipio` e `organizacoes` (`apps/console/src/consultas.ts:26-93`). Por município ele mostra: ocorrências registradas, encerradas, abertas e atrasadas do dia; vistorias recebidas; ofícios emitidos; usuários ativos; aparelhos ativos e aparelhos sem aparecer há dois dias; mediana de minutos até a primeira vistoria; `atualizado_em`, `sem_escrita_recente` (36 h) e `horas_desde_a_escrita`; estado de acesso (suspenso, eliminação agendada, eliminada). Ordena os sem escrita primeiro.

O que o console NÃO enxerga: fila de sincronização (profundidade, idade), entrega de push, e-mail, consumo de armazenamento, taxa de erro, versão do app ou da API, estado das rotinas de minimização, erro de qualquer tipo. `grep` por armazenamento, push, sincronização e fila em `apps/console/src/servidor.ts` não acha nada. É uma tela de consulta: não avisa ninguém. O `/saude` do console responde `{ ok: true }` e não confere o banco (`servidor.ts:1338`; o próprio `IMPLANTACAO.md:389-392` declara isso).

### 1.3 §21 SDLC e segurança de desenvolvimento

#### A. CONFIGURAÇÃO PRESENTE NO REPOSITÓRIO (prova)

**Integração contínua: o que cada job faz** (`.github/workflows/verificar.yml`; gatilho `push` em main/master e todo `pull_request`, linhas 13-16; `concurrency` cancela a execução anterior do mesmo ramo, 20-22; último commit do arquivo em 30/08/2026, 552b4d8):

| Job | O que faz | Observações |
| --- | --- | --- |
| `produto` (25-60) | `npm ci`; `npm run typecheck` (tsc estrito em todos os workspaces); portão CA-06 (`npm run test:isolamento` = suíte do pacote `db`); `npm test` (suíte completa dos 6 workspaces); `npm audit --audit-level=low`; `conferir:numeros` (os números do README contra `vitest list`) | `npm audit` bloqueia o job. Ordem faz o audit vermelho mascarar `conferir:numeros` |
| `navegador` (62-134) | Instala Chromium e Firefox, constrói o painel, sobe `vite preview`, roda e2e no modo local em 2 motores e `test:e2e:api` (sobe API e painel do zero, caminho de produção) | Explicação no próprio arquivo: 49 de 103 verificações ficaram cegas por um tempo |
| `demonstracao` (136-174) | Empacota o protótipo `mockup/` (PowerShell `pwsh`), extrai o zip, roda o roteiro de dez minutos em 2 motores | Pertence ao protótipo, não ao produto; mesmo assim consome minutos do CI |
| `aplicativo` (176-242) | Compila `shared` e `campo`; no `apps/campo`: `npm ci`, typecheck, `npm test` (jest), `npm ls` (árvore coerente), `expo-doctor` (sem checagem de versão), `npm audit --audit-level=low` | Não compila o binário nativo |
| `implantavel` (244-330) | Sobe `postgres:16`, cria os três papéis (setup, dc360_app, dc360_api), migra, confere idempotência com `--conferir`, sobe a API como papel restrito com `NODE_ENV=development` e exige `/saude` com `status=ok` e `banco=ok` | **Não constrói a imagem Docker**; `NODE_ENV=development` (316) não exercita as recusas de produção de `config.ts` |

**O que o CI NÃO roda** (grep no workflow por `test:scripts`, `test:campo`, `auditar`, `verificar`, `docker`: nenhuma ocorrência): os 18 arquivos `dc360/scripts/*.test.mjs` (portões de acessibilidade, design e mapa do app, paridade de tokens, entitlements do iOS, variáveis de ambiente documentadas, cópia e migração de produção, rotação de segredo), o script `auditar.mjs` e qualquer build de imagem. Esses portões existem e só rodam em `npm run verificar` na máquina de quem desenvolve.

**Gates e ferramentas de fato presentes**

| Item | Estado | Prova |
| --- | --- | --- |
| Typecheck | Sim | `strict` e `noUncheckedIndexedAccess` em api, console, web, shared, db e campo; `verificar.yml:46-47, 201-202` |
| Testes | Sim (Vitest em 6 pacotes; Jest no app; Playwright e2e) | `dc360/package.json` scripts; CI |
| Lint/formatação | **Não** | sem ESLint, Prettier, EditorConfig, nem script `lint` |
| SAST | **Não** (levantamento 5.1 exige CodeQL ou Semgrep por PR) | sem `.github/workflows` de análise; o mais próximo são testes estruturais caseiros como `apps/api/test/superficie.test.ts` (toda rota exige token) |
| SCA / `npm audit` | **Sim, bloqueante, mas vermelho hoje** | ver abaixo |
| Dependabot/Renovate | **Não** | sem `dependabot.yml` nem `renovate.json` |
| Secret scanning | **Não** no repositório (sem gitleaks, sem hooks: `.git/hooks` só tem amostras, `core.hooksPath` vazio). `.gitignore` cobre `.env*`, `*.p8`, `*.mobileprovision`, contas de serviço Firebase e `apps/campo/segredos/`. Varredura manual minha (só nomes de arquivo): os únicos PEM no histórico são fixtures falsas de teste; `google-services.json` é rastreado de propósito; a CA do Supabase é pública | `.gitignore` (raiz); git grep |
| SBOM | **Não** | sem CycloneDX/syft |
| Licenças | **Não** (sem verificador e sem arquivo LICENSE; licença das fontes fica ao lado delas) | grep negativo |
| DAST | **Não** (levantamento exige ZAP em staging; não há staging) | |
| Container scanning | **Não** | sem trivy/grype; imagem nunca construída no CI |
| Versionamento e release | **Não** | todos os `package.json` em 0.1.0; `git tag` vazio; sem CHANGELOG; `app.config.ts:22,80` `VERSAO="0.1.0"`, `BUILD=1` |
| Endurecimento do Actions | **Não** | ações por tag móvel (`@v4`), sem `permissions:`, sem `timeout-minutes` |

**`npm audit`, medido por mim hoje (30/09/2026), sem nenhuma mudança de código desde 17/09:**

- `dc360/` (raiz): `npm audit --omit=dev --audit-level=low` sai com **código 1**. Uma moderada em runtime: `fast-uri` (GHSA-hrr3-gc8f-f4qj e GHSA-jvvf-x445-j334), transitiva por `ajv`, correção disponível sem salto maior (`npm audit fix`). O audit completo lista 3 moderadas.
- `dc360/apps/campo`: `npm audit --audit-level=low` sai com **código 1**: 4 vulnerabilidades. `brace-expansion` (alta, só desenvolvimento, via Jest) e a cadeia `decode-uri-component`, `query-string`, `expo-router` (moderadas, runtime, que `scripts/auditar.mjs` já aceita por nome com motivo escrito).
- Consequência: os passos `npm audit --audit-level=low` do CI (verificar.yml:56-57 e 241-242) **falham** com essas advisories, e dependência nova publicada deixa o CI vermelho sem o código mudar (não há execução agendada para pegar isso antes). README:1310, 1336 e 1345 afirmam "em zero"; o `CLAUDE.md` trata vulnerabilidade de runtime como bug. O critério do CI (tudo reprova) difere do critério local `scripts/auditar.mjs` (runtime reprova, desenvolvimento só avisa, uma advisory nomeada aceita). Status real do último run do CI: NÃO CONFIRMADO.

**Migrations** (`dc360/db/src/migrar.ts`, `cli.ts`, `test/migrar.test.ts`)

- Aplicador: ordem pelo nome, cada arquivo uma vez, uma transação por migração com `ROLLBACK` em falha, tabela `schema_migracoes` com `versao`, `impressao`, `aplicada_em`, `duracao_ms` (migrar.ts:19-23, 137-199).
- Recusa de histórico reescrito: impressão SHA-256 do SQL com espaço normalizado; arquivo aplicado que mudou lança `HistoricoAlterado` (migrar.ts:46-55, 159-165); coberto por teste, incluindo "reindentar não conta" (migrar.test.ts:136-172).
- `--conferir` diz o que falta e sai 1 (cli.ts:83-90); a API e o console recusam subir com esquema atrasado (`index.ts:44-56`).
- **Rollback: não existe.** Só migração para frente; o mitigador é a regra humana "aditiva ou compatível" (IMPLANTACAO.md:565-580) e a cópia prévia. **Trava contra migração concorrente: não existe** (sem advisory lock no aplicador; a regra é "passo separado do deploy").
- Produção: `scripts/migrar-producao.mjs` (padrão é só conferir; `--aplicar` exige cópia de até 30 min ou `--sem-copia` escrito à mão; o escape só aparece na saída do terminal), depois passo manual de endurecimento `db/provedores/supabase-endurecer.sql` que o próprio guia declara não automatizado (IMPLANTACAO.md:674-677).

**Ambientes.** Dev local (PGlite ou `compose.yaml` com postgis 16), CI (Postgres 16 em serviço) e um único ambiente de produção. `LOJAS.md:58-62` diz que não há ambiente de homologação de pé; o perfil `homologacao` de `eas.json:19` aponta para `api-homologacao.exemplo.gov.br`. A API só distingue ambientes por `NODE_ENV`; o piloto roda como `production` com `MARCA_DAGUA` (fly.toml:69). Versões de Postgres: CI e PGlite 16, produção 17.6 (COLOCAR-DE-PE.md:348). Não há dev/staging/prod separados no sentido do levantamento 5.4.

**Deploy.**
- API (Fly, app `defesa-civil`): `fly deploy` manual a partir de `dc360/` (fly.toml:9-10; IMPLANTACAO.md:658). Não há workflow de CD, nem `release_command`, nem gate de CI. Uma máquina `shared-cpu-1x` de 1 GB (fly.toml:109, 122-127), região `gru`, `kill_timeout=30`.
- Console (Fly, app `defesa-civil-console`): idem, com `-c fly.console.toml --ha=false`.
- Painel (Vercel, projeto `dc360-painel-web`): publica sozinho a cada push em `master` (VERCEL-PAINEL.md:49-52); nenhuma evidência de que o deploy espere o CI; a ordem "API antes do painel" é convenção humana (IMPLANTACAO.md:658-662).
- Imagens: `Dockerfile` e `Dockerfile.console` rodam como `USER node`, usam `npm ci` e `--omit=dev`; base por tag móvel (`node:22-bookworm-slim`), Chromium via `apt` sem versão fixa, sem `HEALTHCHECK` (o check está no `fly.toml`), shell presente. Os três arquivos (Dockerfile:3-9, Dockerfile.console:12-16, compose.yaml:3-9) e README:1051-1054 afirmam que **nunca foram construídos** nesta máquina e atribuem a conferência ao job `implantavel` do CI; esse job, como mostrado, **não constrói imagem**. O que prova que a imagem constrói é a API estar de pé no Fly (externo, NÃO CONFIRMADO pelo repositório).

**Rollback de código.** API: `fly deploy` da versão anterior ou `fly machine restart` (INDISPONIBILIDADE.md:81-88). Painel: redeploy na Vercel. Banco: sem reversão. App: nenhum caminho (sem OTA).

**Mobile (`apps/campo/eas.json`, `app.config.ts`)**

- Perfis: `desenvolvimento` (dev client, interno), `homologacao` (APK interno, endpoint de exemplo), `producao` (loja, `app-bundle`, `DC360_API_URL=https://defesa-civil.fly.dev`, `autoIncrement`) (eas.json:3-29). `appVersionSource: remote`.
- `submit.producao.ios` ainda com `PREENCHER` para `appleId`, `ascAppId`, `appleTeamId` (37-41); `submit.producao.android.serviceAccountKeyPath` aponta para `./segredos/play-console.json`, pasta que não existe nesta cópia (ignorada pelo git, como deve).
- `extra.eas.projectId` vem de `EAS_PROJECT_ID`, vazio se não definido (`app.config.ts:669`); nenhuma evidência de `eas init` feito.
- **Sem `expo-updates`, `runtimeVersion` ou bloco `updates`** (grep negativo): os canais de `eas.json` são inertes e toda correção do app exige build novo e, nas lojas, nova revisão.
- Bundle id e package: `com.solerte.dc360.campo` (app.config.ts:228, 313), com o comentário "Identificador definitivo" e `LOJAS.md:73` repetindo; `COLOCAR-DE-PE.md:53-67` classifica a troca como "CRÍTICO 1, antes do primeiro build". Os documentos divergem entre si e o código não mudou.
- O job de CI do app não gera binário nativo; o próprio comentário (verificar.yml:211-220) conta que um defeito de dependência só apareceu "seis minutos build adentro".
- Estado de "o app já rodou em aparelho" diverge em três lugares: `README.md:13` ("instalado e usado em iPhone de verdade, 08/09/2026, três vistorias reais"), `apps/campo/LEIA-ME.md:3` ("NUNCA RODOU EM APARELHO") e `COLOCAR-DE-PE.md:45-47` ("verificado inteiro no emulador Android, nunca rodou em iOS"). Não escolho uma: marco G.

#### B. CONFIGURAÇÃO QUE SÓ PODE SER VERIFICADA NO GITHUB / CLOUD / STORE (o que o Rafael confere, e como)

**GitHub** (repositório `rafaelgomesbr/city-hall`; a API anônima devolve 404, então é privado ou não existe com esse nome, e `gh` não está autenticado aqui)

| Conferir | Como |
| --- | --- |
| Status dos últimos runs do `Verificar` em `master`, por job | Aba Actions. Confirmar se `produto` e `aplicativo` estão vermelhos no passo `npm audit` |
| Branch protection em `master`: PR obrigatório, aprovações, checks obrigatórios (`produto`, `navegador`, `implantavel`, `aplicativo`), bloqueio de force-push, "include administrators" | Settings, Branches (ou Rulesets) |
| Permissão padrão do `GITHUB_TOKEN` (somente leitura ou leitura e escrita) | Settings, Actions, General, Workflow permissions |
| Secret scanning e push protection; Dependabot alerts e security updates; code scanning | Settings, Code security and analysis |
| Quem tem acesso (colaboradores, equipes), 2FA obrigatório, chaves de deploy | Settings, Collaborators and teams; organização, People |
| Secrets e variáveis de Actions cadastrados (o workflow não usa nenhum) | Settings, Secrets and variables |
| Se o repositório é privado | Settings, General |

**Fly.io** (`defesa-civil`, `defesa-civil-console`): `fly status`, `fly releases`, `fly secrets list` (só nomes), `fly checks list`, número de máquinas (o repositório diz 1, e o comentário de `index.ts:300-303` fala em duas), plano de log e retenção, quem está na organização, se há `PUSH_ATIVO`, `EMAIL_ATIVO`, `SEGUNDO_FATOR_ATIVO`, `VARREDURA_DE_ORFAOS_ATIVA` definidos por secret (o estado real pode diferir do `fly.toml`).

**Supabase:** plano, backups automáticos e retenção, PITR, região, configuração do Storage (balde `dc360-evidencias`, versionamento), `public` fora dos esquemas expostos em Settings, API (o guia manda, o repositório não prova), resultado da consulta de conferência do endurecimento (IMPLANTACAO.md:643-652), quem tem acesso ao projeto, versão do Postgres.

**Vercel:** projeto `dc360-painel-web` ligado a `master`, Root Directory `dc360`, se há "Deployment Protection", se a produção espera checks do GitHub, variáveis de ambiente, e o projeto antigo `dc360-painel` (VERCEL-PAINEL.md:4-10) ainda existente. Observação: `vercel.json` só define `Cache-Control`; nenhum cabeçalho de segurança do painel é declarado no repositório.

**Apple Developer / App Store Connect:** tipo de conta (pessoal ou organização), Team ID, App ID `com.solerte.dc360.campo` existente, capacidade Time Sensitive Notifications, chave APNs `.p8` (existe, pois as credenciais falaram com a Apple em 13/09 segundo DECLARACAO-NAS-LOJAS.md:588-595), perfis e certificados, TestFlight, se há build enviado.

**Google Play Console e Firebase:** conta criada, verificação de identidade da organização, Play App Signing, app `com.solerte.dc360.campo`, conta de serviço para submissão, projeto Firebase `defesa-civil-360` (arquivo `google-services.json` rastreado), faturamento e restrições das chaves de mapa por plataforma.

**Expo/EAS:** conta, projeto (`eas init`), builds existentes, credenciais gerenciadas. **Resend:** conta, domínio, chave, plano. **Google Cloud (Maps, Routes):** chaves, restrições e faturamento. **Registro.br/DNS:** domínio próprio (o endereço público atual é `*.fly.dev` e `*.vercel.app`).

#### C. O padrão que o projeto impôs a si mesmo, contra a realidade (levantamento 5.1, 5.4, 5.5)

| Prática exigida | Realidade no repositório |
| --- | --- |
| SAST (CodeQL ou Semgrep) por PR | Ausente |
| SCA: `npm audit` mais Dependabot/Renovate com SLA por severidade | `npm audit` no CI (vermelho hoje); Dependabot/Renovate e SLA ausentes |
| Secret scanning: gitleaks no pre-commit e no CI | Ausente |
| SBOM CycloneDX por release | Ausente (e não há release) |
| DAST: ZAP em staging por release | Ausente (sem staging) |
| Pentest externo antes do primeiro cliente | Sem evidência |
| PR obrigatório mesmo trabalhando só | Sem evidência de PR (0 merges em 119 commits); regra de proteção só no GitHub |
| Segregação dev, staging, prod | Sem staging |
| Backup: RPO 15 min (PITR), RTO 4 h, restore trimestral com relatório assinado, runbook testado por quem não escreveu | RPO/RTO não medidos; um restore, pelo autor, sem relatório assinado; PITR NÃO CONFIRMADO |
| Storage com versionamento, object lock, replicação | Ausente ou não documentado |
| Observabilidade: OpenTelemetry, logs JSON, Grafana/Loki | Só logs JSON |
| Contêiner: usuário não-root, imagem mínima, sem shell, FS somente leitura | Só não-root e `npm ci`; imagem com Chromium e shell |
| Incidente: plano escrito, simulação anual | Plano parcial em INDISPONIBILIDADE.md; sem simulação |

---

## Matriz D

Legenda de ESTADO: A existe e comprovado; B existe com gap ou regressão; C existe parcialmente; D não existe; E novo requisito da V2; F decisão humana necessária; G não confirmado.

| ID | SUPERFÍCIE | DOMÍNIO | REQUISITO / CAPACIDADE | ESTADO | EVIDÊNCIA | RISCO | DEPENDÊNCIAS | DECISÃO HUMANA? | OBSERVAÇÃO |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| OPS-01 | Plataforma | Backup | Backup automático gerenciado do banco (Supabase) | G | COLOCAR-DE-PE.md:111-118, 594-597 ("não foi conferido se o backup automático está ligado nem qual é a retenção") | Alto | Plano e painel do Supabase | SIM | Nenhum arquivo do repositório prova plano, retenção ou PITR. COLOCAR-DE-PE.md:326 cita Neon como exemplo de custo, e o banco real é Supabase (SUBPROCESSADORES.md:21) |
| OPS-02 | Plataforma | Backup | Dump lógico manual antes de migrar (`copiar-producao.mjs`) | B | `scripts/copiar-producao.mjs:62-282`; `scripts/migrar-producao.mjs:58-70,115-121`; testes `copiar-producao.test.mjs`, `migrar-producao.test.mjs` | Médio | pg_dump 17+, chaveiro macOS, pooler Supabase | NÃO | Só existe antes de migração; `--schema=public`; escape `--sem-copia`; só roda em macOS |
| OPS-03 | Plataforma | Backup | Backup agendado e automatizado pelo projeto | D | verificar.yml:13-16 (sem `schedule`); fly.toml sem rotina; grep negativo por rotina de backup na API | Alto | Decisão de destino | SIM | O RPO efetivo é a idade da última cópia manual, que ninguém registra |
| OPS-04 | Plataforma | Backup | Procedimento de restauração documentado | B | COLOCAR-DE-PE.md:340-616 | Alto | pg_dump e pg_restore 17.x | NÃO | Escrito para 15 migrações; não cria `dc360_console` nem instala `pg_trgm` (1.1.2); inferência, não testada |
| OPS-05 | Plataforma | Backup | Último restore executado, com evidência datada | B | COLOCAR-DE-PE.md:347 (09/09/2026), 402 (dump 6,2 s, 99 KiB), 455 (restore 0,4 s), 498-536 (contagens e estrutura iguais); md5 `b446363c...` recalculado por mim a partir de 001-015 e idêntico | Médio | Nenhuma | NÃO | Execução única, 21 dias antes desta auditoria, pelo autor do sistema; evidência narrativa sem log bruto nem relatório assinado. O md5 bate, o que corrobora dados reais, não prova o restore |
| OPS-06 | Plataforma | Backup | Restore cobre o esquema atual (46 migrações, 36 relações) | G | Teste com 15 migrações e 15 tabelas (COLOCAR-DE-PE.md:523-532); hoje 46 arquivos em `db/migrations` e 35 `CREATE TABLE` | Alto | Reteste | NÃO | O documento manda refazer após migração que mude papel, policy ou grant (611-614); houve 023, 034, 036, 038, 039, 046 |
| OPS-07 | Plataforma | Backup | Periodicidade do teste de restauração | F | INDISPONIBILIDADE.md:104 `[[periodicidade a definir]]`; COLOCAR-DE-PE.md:611-616 (mensal); levantamento 5.5 (trimestral, relatório assinado) | Alto | Decisão do dono | SIM | Três valores divergentes; nenhum decidido |
| OPS-08 | Plataforma | Backup | RPO medido | D | Sem medição em nenhum documento ou script; ESPECIFICACAO RNF-06 (linha 260) hipótese 24 h; levantamento 5.5 sugere 15 min | Alto | Decisão de alvo | SIM | "Hipótese, não promessa" (ESPECIFICACAO:271) |
| OPS-09 | Plataforma | Backup | RTO medido | D | COLOCAR-DE-PE.md:577-582 (10 s de comando, meia hora instalando pg_dump), 607-609 (API não apontada para a cópia) | Alto | Decisão de alvo | SIM | Só há tempo de comando |
| OPS-10 | Plataforma | Backup | PITR (recuperação a ponto no tempo) | G | COLOCAR-DE-PE.md:594-597 ("depende do plano contratado, e não foi testado") | Alto | Plano do provedor | SIM | Recurso do provedor |
| OPS-11 | Plataforma | Backup | Anexos (fotos e assinaturas no Storage) no backup | D | COLOCAR-DE-PE.md:586-593, 600-603; `copiar-producao.mjs:258-261`; nenhum script de cópia de balde; sem versionamento citado | Alto | Supabase Storage, credenciais S3 | SIM | Fotos são a prova material (ARMAZENAMENTO.md:187-190). Levantamento 4.2 pede versionamento e object lock |
| OPS-12 | Plataforma | Backup | Banco incluído no backup | C | `copiar-producao.mjs:266-268` (`--schema=public`); COLOCAR-DE-PE.md:600-606 | Médio | Nenhuma | NÃO | Não leva papéis, senhas, extensões, esquemas do provedor |
| OPS-13 | Plataforma | Backup | Segredos necessários para restaurar: inventário e guarda | D | Inventário em COLOCAR-DE-PE.md:177-191 e IMPLANTACAO.md:259-290; guarda só em `fly secrets` e chaveiro macOS (`scripts/producao.mjs:14-16,73-92`); sem cofre documentado | Alto | Fly, máquina do operador | SIM | Sem `SEGUNDO_FATOR_CHAVE` os TOTP do banco restaurado ficam ilegíveis (COLOCAR-DE-PE.md:190) |
| OPS-14 | Plataforma | Continuidade | Runbook de indisponibilidade | C | `docs/INDISPONIBILIDADE.md` v2 (15/09/2026): tabela do que cai, escala de gravidade, passos, contingência em papel | Médio | Contatos (OPS-15) | NÃO | Bom, nunca simulado; levantamento 5.7 pede simulação anual |
| OPS-15 | Plataforma | Continuidade | Contatos e plantão | D | INDISPONIBILIDADE.md:195-210 (quatro linhas `[[nome]]`, compromisso "melhor esforço") | Alto | Decisão do dono e do município | SIM | Vazias desde a v1 (09/09/2026) |
| OPS-16 | Plataforma | Continuidade | Página de status externa | D | INDISPONIBILIDADE.md:122-149 ("Ainda não existe") | Médio | Escolha de hospedagem fora de Fly, Vercel e Supabase | SIM | Se for terceiro, entra em SUBPROCESSADORES antes de ligar |
| OPS-17 | Campo | Continuidade | Operação offline do agente com API e banco fora do ar | C | INDISPONIBILIDADE.md:16-29; `packages/campo` (fila SQLite, testes); LOJAS.md:290-298 (durabilidade sob morte de processo nunca provada em aparelho) | Médio | Aparelho real | NÃO | Lógica provada por teste de unidade; comportamento no aparelho G. Três documentos divergem sobre o app já ter rodado em aparelho |
| OPS-18 | Plataforma | Continuidade | Gate "cópia recente antes de migrar" | B | `migrar-producao.mjs:58-95` (função pura `decidirSobreACopia`); teste `scripts/migrar-producao.test.mjs` | Médio | Nenhuma | NÃO | `--sem-copia` fica só no terminal; o teste não roda no CI (OPS-63) |
| OPS-19 | Plataforma | Continuidade | Dumps com dado de cidadão: destino, cifragem, prazo de eliminação | F | `copiar-producao.mjs:26-39` (~/dc360-copias, 0600, sem cifragem de arquivo); IMPLANTACAO.md:664-665 (apagar à mão); SAIDA-DE-MUNICIPIO.md:61-63 `[[prazo do ciclo]]`; PRIVACIDADE.md não cita backup nem dump (grep) | Alto | Decisão e encarregado | SIM | A política de privacidade não cobre cópia de segurança |
| OPS-20 | Plataforma | Continuidade | Independência de máquina e pessoa para migrar e copiar | B | `scripts/producao.mjs:73-92` (`security find-generic-password`, macOS); `copiar-producao.mjs:166-189` (Homebrew); COLOCAR-DE-PE.md:4-5 | Alto | Segundo operador | SIM | No Windows o roteiro sai com "Não achei a senha do banco no chaveiro do Mac". Fator de ônibus 1 |
| OPS-21 | Plataforma | Continuidade | Reconstrução da infraestrutura do zero (DR de ambiente) | C | fly.toml, fly.console.toml, Dockerfile e Dockerfile.console, vercel.json, COLOCAR-DE-PE.md Parte 3; sem IaC (levantamento 4.2 prevê Terraform) | Médio | Contas Fly, Vercel, Supabase | SIM | Segredos e DNS manuais; nunca ensaiado |
| OPS-22 | Plataforma | Continuidade | Restaurar dentro do Supabase de produção ou em projeto novo | D | COLOCAR-DE-PE.md:598-599 (não ensaiado); `db/provedores/supabase-endurecer.sql` precisa rodar depois | Alto | Reteste | NÃO | O teste foi em cluster local |
| OPS-23 | API | Continuidade | Saída de município como via parcial de recuperação por tenant | C | `apps/api/PENDENCIAS.md:7-53` (pacote carrega todas as tabelas em memória, máquina de 1 GB, não medido); SAIDA-DE-MUNICIPIO.md | Médio | Medição de volume | NÃO | Não é backup |
| OPS-30 | API | Observabilidade | Logs estruturados com redação de dado pessoal | A | `apps/api/src/servidor.ts:139-311`; `apps/api/test/log.test.ts` | Baixo | Nenhuma | NÃO | Nível fixo; sem variável de nível |
| OPS-31 | Console | Observabilidade | Logs do console | C | `apps/console/src/servidor.ts:257-261` (sem `redact`, sem `genReqId`) | Baixo | Nenhuma | NÃO | Serializador padrão não grava corpo |
| OPS-32 | Plataforma | Observabilidade | Destino e retenção de logs | D | INDISPONIBILIDADE.md:153-172 ("Não está definido"; stdout no Fly; acesso é quem tem a conta) | Alto | Fly ou coletor novo | SIM | O log leva e-mail de servidor e IP (documento); prazo não escrito em PRIVACIDADE |
| OPS-33 | API | Observabilidade | Request/correlation id | B | `servidor.ts:316` (randomUUID), `581-586` (corpo do 500 com `requisicao`); pino loga `reqId` | Médio | Cliente exibir o código | NÃO | Sem header de resposta, não aceita id de entrada, nenhum cliente o mostra, nenhum teste o afirma |
| OPS-34 | Plataforma | Observabilidade | Métricas de aplicação (latência, erros, filas) | D | grep negativo por prom-client, opentelemetry etc.; fly.toml sem `[metrics]` | Alto | Escolha de ferramenta | SIM | Levantamento:88 exige SLA com evidência automática |
| OPS-35 | Console | Observabilidade | Métricas de negócio agregadas por município | B | `db/migrations/023_metricas_do_municipio.sql:89-130,291-321`; `apps/api/src/index.ts:338-380`; `apps/console/src/consultas.ts:73-93` | Médio | Nenhuma | NÃO | Só contagens de ocorrência, vistoria, ofício, usuário, aparelho |
| OPS-36 | API | Observabilidade | Health check | B | `servidor.ts:597-663`; fly.toml:115-120; verificar.yml:314-330 | Médio | Nenhuma | NÃO | Ramo 503 sem teste; rota pública expõe `ultimaMigracao` e contadores |
| OPS-37 | API | Observabilidade | Readiness separada de liveness | C | Rota única; comentário `servidor.ts:592` cita `esquemaEmDia` que a resposta não tem; checagem de esquema só na partida (`index.ts:44-56`); README:1043-1044 e fly.toml:112-114 prometem 503 por esquema atrasado | Médio | Nenhuma | NÃO | Documentação e código divergem |
| OPS-38 | Console | Observabilidade | Health do console | C | `apps/console/src/servidor.ts:1338` (`{ ok: true }`); fly.console.toml:125-134 | Baixo | Nenhuma | NÃO | Declarado como não coberto (IMPLANTACAO.md:389-392) |
| OPS-39 | Plataforma | Observabilidade | Alertas em qualquer canal | D | grep negativo por pager, uptime, webhook, e-mail de alerta; console é tela de consulta | Alto | Ferramenta e canal | SIM | Falha só é vista por quem abre `fly logs` ou o console |
| OPS-40 | Plataforma | Observabilidade | Erro centralizado (Sentry ou equivalente) | D | grep negativo em api, console, web e campo | Alto | Ferramenta; subprocessador | SIM | Painel sem ErrorBoundary; app sem crash report |
| OPS-41 | API | Observabilidade | Monitoramento das rotinas agendadas | C | `index.ts:183-494`; `push/trava.ts:81-124`; falha de minimização, resumo e órfãos em `app.log.info` (`index.ts:314,377,428`), eliminação em `warn` (491) | Alto | Alertas (OPS-39) | NÃO | Minimização executa obrigação de retenção prometida (index.ts:288-302) e não tem sinal em `/saude` |
| OPS-42 | API | Observabilidade | Monitoramento da sincronização | C | `rotas/sincronizacao.ts:461,764,771,1032,1570`; métrica `aparelhos_sem_aparecer` (023:237-238) | Médio | Métrica de fila | NÃO | Sem profundidade, idade de fila ou taxa de erro |
| OPS-43 | API | Observabilidade | Monitoramento de push | C | `push/varredor.ts:379-381`; `servidor.ts:656-662`; `notificacoes_enviadas.detalhe`; testes `push-rodada-diz-o-que-fez`, `push-saude-e-despertar` | Médio | Estado real do Fly | NÃO | `PUSH_ATIVO` comentado em fly.toml:90; `/saude` é por máquina |
| OPS-44 | API | Observabilidade | Monitoramento de e-mail | C | migração 027 (`provedor_id`); `rotas/oficios.ts:563`; `RECUPERACAO_ATIVA="nao"` em fly.toml:67 | Baixo hoje | Provedor | NÃO | Sem webhook de entrega ou rejeição |
| OPS-45 | API | Observabilidade | Monitoramento de armazenamento | C | ARMAZENAMENTO.md:21-110, 262-270, 287-293 | Médio | Varredura real contra o provedor | NÃO | Não aparece no console; sem sonda em `/saude` |
| OPS-46 | Plataforma | Observabilidade | Tracing distribuído | D | grep negativo | Baixo | Ferramenta | SIM | Levantamento 4.2 cita OpenTelemetry |
| OPS-47 | Plataforma | Observabilidade | Auditoria operacional (negócio e administração) | B | migrações 001:300, 007, 010:33, 021:209; ADR 0002 | Médio | Outras frentes | NÃO | Sem trilha técnica (deploy, job) nem cadeia de hash (levantamento 5.6); grep por `previous_hash` sem resultado |
| OPS-48 | API | Observabilidade | Versão ou commit implantado visível | D | `servidor.ts:662` (resposta sem versão); fly.toml sem build arg | Médio | Nenhuma | NÃO | Só o painel do Fly responde "o que está rodando" |
| OPS-49 | API | Observabilidade | Limites de tempo no banco | C | `apps/api/src/banco/postgres.ts:152-155` (pool 10, ociosa 30 s, conexão 5 s); sem `statement_timeout` | Médio | Nenhuma | NÃO | Consulta lenta não é limitada |
| OPS-50 | Campo | Observabilidade | Crash e erro no aplicativo | D | grep negativo por ErrorBoundary, Sentry, crashlytics em `apps/campo/src` | Alto | Ferramenta; declaração nas lojas | SIM | Afeta também a declaração de dados das lojas |
| OPS-51 | Web | Observabilidade | Erro no painel | D | grep negativo em `apps/web/src` | Médio | Ferramenta | SIM | |
| OPS-52 | Console | Observabilidade | Saúde dos tenants visível ao fornecedor | B | `apps/console/src/consultas.ts:26-93` | Médio | Colunas novas na 023 | NÃO | Ver 1.2.1; consulta passiva, sem aviso |
| OPS-60 | Plataforma | SDLC | Integração contínua | A | `.github/workflows/verificar.yml` (5 jobs, push e PR) | Baixo | GitHub Actions | NÃO | Último commit do arquivo: 30/08/2026 (552b4d8) |
| OPS-61 | Plataforma | SDLC | CI verde no HEAD | G | `gh` não autenticado; API anônima do GitHub devolve 404 para `rafaelgomesbr/city-hall` | Médio | Acesso ao GitHub | NÃO | `npm audit` sai 1 hoje (OPS-66); hipótese de CI vermelho, não confirmada |
| OPS-62 | Plataforma | SDLC | Typecheck estrito | A | `strict` e `noUncheckedIndexedAccess` nos 6 tsconfig; verificar.yml:46-47, 201-202 | Baixo | Nenhuma | NÃO | |
| OPS-63 | Plataforma | SDLC | Testes automatizados no CI | B | verificar.yml:50-54, 110-134, 208-209; grep no workflow por `test:scripts`, `test:campo`, `auditar`: vazio | Médio | Nenhuma | NÃO | 18 arquivos `scripts/*.test.mjs` só rodam em `npm run verificar`. Testes em PGlite/Postgres 16 contra produção 17.6 |
| OPS-64 | Plataforma | SDLC | Lint e formatação | D | Sem ESLint, Prettier, EditorConfig; nenhum script `lint` | Baixo | Decisão de ferramenta | NÃO | |
| OPS-65 | Plataforma | SDLC | SAST | D | Sem CodeQL ou Semgrep; levantamento 5.1 exige | Médio | Ferramenta | SIM | Substitutos caseiros (ex.: `apps/api/test/superficie.test.ts`) não são SAST |
| OPS-66 | Plataforma | SDLC | SCA: `npm audit` no CI e bloqueante | B | verificar.yml:56-57, 241-242 (`--audit-level=low`); hoje exit 1 em `dc360` (1 moderada runtime, fast-uri) e em `apps/campo` (4, 1 alta só de desenvolvimento) | Médio | Correção de dependência | SIM | README:1310, 1336, 1345 dizem "em zero"; critério do CI difere de `scripts/auditar.mjs` |
| OPS-67 | Plataforma | SDLC | Dependabot ou Renovate | D | Sem `dependabot.yml` nem `renovate.json` | Médio | GitHub | SIM | |
| OPS-68 | Plataforma | SDLC | Secret scanning e pre-commit | D | Sem gitleaks; `.git/hooks` só amostras; `.gitignore` cobre `.env*`, `*.p8`, `*.mobileprovision`, contas Firebase, `apps/campo/segredos/` | Médio | GitHub push protection (G) | SIM | Varredura manual minha achou só fixtures falsas |
| OPS-69 | Plataforma | SDLC | SBOM | D | Sem CycloneDX ou syft | Baixo | Release (OPS-77) | SIM | |
| OPS-70 | Plataforma | SDLC | Licenças das dependências | D | Sem verificador e sem arquivo LICENSE | Baixo | Decisão jurídica | SIM | Licença das fontes está ao lado delas (SUBPROCESSADORES.md:38-41) |
| OPS-71 | Plataforma | SDLC | DAST | D | Levantamento:51, 374 exige ZAP em staging; não há staging nem workflow | Médio | Staging (OPS-83) | SIM | |
| OPS-72 | Plataforma | SDLC | Scan de contêiner | D | Sem trivy ou grype; imagem não é construída no CI | Médio | OPS-73 | SIM | |
| OPS-73 | Plataforma | SDLC | Build da imagem Docker exercitado no CI | D | verificar.yml sem `docker`; Dockerfile:3-9, Dockerfile.console:12-16, compose.yaml:3-9 e README:1051-1054 atribuem a conferência ao job `implantavel`, que só roda `npm run build` e `node apps/api/dist/index.js` (278-330) | Médio | Nenhuma | NÃO | Documentos e CI divergem |
| OPS-74 | Plataforma | SDLC | Endurecimento da imagem | C | Dockerfile:97 (`USER node`), `npm ci`, `--omit=dev`; base por tag móvel (:37), Chromium via apt sem versão (:73-75), sem `HEALTHCHECK`, shell presente | Médio | Nenhuma | NÃO | Levantamento 5.4 pede sem shell e FS somente leitura |
| OPS-75 | Plataforma | SDLC | Endurecimento dos workflows | D | Ações por `@v4`, sem `permissions:`, sem `timeout-minutes` | Médio | Nenhuma | NÃO | |
| OPS-76 | Plataforma | SDLC | Branch protection e revisão de código | G | `git log`: 119 commits, 0 merges, 0 assuntos com `(#n)` ou "Merge pull request", 1 autor, 0 assinados; proteção só no GitHub | Alto | Acesso ao GitHub | SIM | Levantamento 5.1 exige PR obrigatório mesmo solo |
| OPS-77 | Plataforma | SDLC | Versionamento e release | D | Todos `package.json` 0.1.0; `git tag` vazio; sem CHANGELOG; `app.config.ts:22,80` | Médio | Política de versão | SIM | |
| OPS-78 | Banco | SDLC | Aplicador de migrations | A | `db/src/migrar.ts:19-23,137-199`; `db/src/cli.ts`; `db/test/migrar.test.ts` | Baixo | Nenhuma | NÃO | Ordem, uma vez, transação por migração |
| OPS-79 | Banco | SDLC | Recusa de histórico reescrito | A | `migrar.ts:46-55,59-68,159-165`; `migrar.test.ts:136-172` | Baixo | Nenhuma | NÃO | Impressão SHA-256 normalizando espaço |
| OPS-80 | Banco | SDLC | Rollback de migration | D | Só `ROLLBACK` de transação (migrar.ts:187); IMPLANTACAO.md:565-580 (regra "aditiva ou compatível", revisão humana) | Médio | Cópia prévia (OPS-02) | NÃO | Migração só avança |
| OPS-81 | Banco | SDLC | Trava contra migração concorrente | D | Sem advisory lock em `migrar.ts`; README:1046-1047 confia na regra "passo separado" | Baixo | Nenhuma | NÃO | |
| OPS-82 | Banco | SDLC | Migração em produção: roteiro, cópia, endurecimento | C | `scripts/migrar-producao.mjs`; IMPLANTACAO.md:558-677; endurecimento manual (674-677) | Médio | macOS, pooler | NÃO | Tabela nova nasce concedida aos papéis do provedor até o passo 4 rodar |
| OPS-83 | Plataforma | SDLC | Ambientes dev, staging e prod separados | D | LOJAS.md:58-62; eas.json:19; só `NODE_ENV`; piloto roda como `production` com `MARCA_DAGUA` (fly.toml:69) | Alto | Custo, dados sintéticos | SIM | Levantamento 5.4: dado de produção não vai para staging |
| OPS-84 | API | SDLC | Deploy da API | C | `fly deploy` manual (fly.toml:9-10; IMPLANTACAO.md:658); sem CD, sem `release_command`, uma máquina (fly.toml:109) | Médio | Decisão de CD | SIM | |
| OPS-85 | Web | SDLC | Deploy do painel | B | VERCEL-PAINEL.md:49-52; IMPLANTACAO.md:658-662 | Médio | Proteção de deploy na Vercel (G) | SIM | Publica a cada push em master, sem gate de CI conhecido; ordem API antes do painel é convenção humana |
| OPS-86 | Plataforma | SDLC | Rollback de código | C | INDISPONIBILIDADE.md:81-88; VERCEL-PAINEL.md:51-52 | Médio | Releases no Fly | NÃO | Banco sem reversão; app sem caminho |
| OPS-87 | Campo | SDLC | Configuração EAS (perfis e submit) | C | `eas.json:14-20` (homologação com exemplo.gov.br), `27`, `33`, `37-41` (PREENCHER); `app.config.ts:669` (`projectId` vazio sem variável) | Médio | Contas e `eas init` | SIM | `homologacao` inutilizável (LOJAS.md:58-62) |
| OPS-88 | Campo | SDLC | Build nativo provado (EAS ou local) | G | LOJAS.md:299 ("Nenhum build foi gerado"); README:13 (iPhone, 08/09/2026); COLOCAR-DE-PE.md:45-47 (emulador Android) | Alto | Aparelho e contas | NÃO | Três versões divergentes |
| OPS-89 | Campo | SDLC | Atualização OTA | D | grep negativo por `expo-updates`, `runtimeVersion`, `updates` | Médio | Decisão de política | SIM | Canais de `eas.json` inertes |
| OPS-90 | Campo | SDLC | CI compila o app nativo | D | verificar.yml:176-242; comentário 211-220 | Médio | Conta EAS | NÃO | O defeito do `react-native-worklets` só apareceu no build |
| OPS-91 | Campo | SDLC | Assinatura e distribuição (Apple e Google) | G | Só na loja; DECLARACAO-NAS-LOJAS.md:585-587 ("identificadores de conta não existem": D-U-N-S e verificação Google); 588-595 (APNs e FCM responderam em 13/09) | Alto | Contas | SIM | Ver 1.3.B |
| OPS-92 | Campo | SDLC | Identidade do app (bundle id e package) | F | `app.config.ts:228,313` `com.solerte.dc360.campo` ("definitivo"); COLOCAR-DE-PE.md:53-67 manda trocar; LOJAS.md:73 | Alto | Nome e CNPJ | SIM | Trocar depois de publicar cria outro app |
| OPS-93 | Plataforma | SDLC | Segredos de CI e deploy | B | CI sem segredos (JWT de teste em verificar.yml:320); produção só em `fly secrets`; scripts lêem chaveiro macOS | Médio | Cofre | SIM | Sem cofre nem rotação documentada além de `JWT_SEGREDO` (`scripts/rotacionar-segredo.mjs`) |
| OPS-94 | Plataforma | SDLC | Rastreabilidade commit para artefato implantado | D | Sem SHA em `/saude`; deploy partindo da máquina do operador; sem tag | Médio | OPS-77 | NÃO | |
| OPS-95 | Plataforma | SDLC | Teste contra Postgres real com os três papéis | B | verificar.yml:244-330 (`postgres:16`, linha 259; `NODE_ENV: development`, linha 316) | Médio | Nenhuma | NÃO | Produção é 17.6 e roda `production`; recusas de `config.ts` (TLS verify-full etc.) não são exercitadas ali |
| OPS-96 | Plataforma | SDLC | CI agendado contra deriva de dependência | D | Sem `schedule:` em verificar.yml | Médio | Nenhuma | NÃO | Advisory nova só aparece no próximo push |
| OPS-97 | Plataforma | SDLC | Pentest externo | G | Sem evidência no repositório | Alto | Orçamento | SIM | Levantamento 5.1: antes do primeiro cliente e anual |
| OPS-100 | Portal (V2) | Operação | Staging e dados sintéticos para o portal das secretarias | E | Não existe staging (OPS-83) | Alto | OPS-83 | SIM | O portal recebe usuários externos à Defesa Civil |
| OPS-101 | Cidadão (V2) | Loja | Segundo app React Native em loja pública: EAS, bundle id, contas, revisão | E | Hoje um app interno (`LOJAS.md:12-37` recomenda distribuição interna); EAS sem build comprovado (OPS-88) | Alto | Contas Apple e Google | SIM | App público e a guideline de login/4.2 mudam de natureza |
| OPS-102 | Cidadão (V2) | Push | Push para cidadão sem conta de servidor | E | `aparelhos.usuario_id NOT NULL` com FK (`db/migrations/016_aparelho_e_aviso_de_prazo.sql:78-110`); um único `APNS_BUNDLE` (`config.ts:229`, `index.ts:193-198`, `push/apns.ts:188`); FCM não configurado (IMPLANTACAO.md:481-483); `PUSH_ATIVO` comentado (fly.toml:90) | Alto | Modelo de identidade do aparelho; LGPD | SIM | O push atual é só para servidores autenticados |
| OPS-103 | Portal (V2) | E-mail | E-mail para secretarias e órgãos | E | Resend escolhido e não ligado (SUBPROCESSADORES.md:43-47; LIGAR-O-EMAIL.md); `EMAIL_ATIVO` padrão `nao`; faixa gratuita de 100/dia e 3000/mês (LIGAR-O-EMAIL.md:32-34, 213); ofício atual é link de uso único sem login (`servidor.ts:742-752`) | Alto | Domínio remetente verificado; plano pago | SIM | Nenhuma recusa 429 de cota tem tratamento de fila |
| OPS-104 | Plataforma | Continuidade | Subprocessadores novos declarados antes de ligar | F | SUBPROCESSADORES.md:359-364 (30 dias de aviso), 399-401 | Médio | Jurídico | SIM | Push do cidadão, e-mail de órgãos, status page, coletor de log e ferramenta de erro entram aqui |
| OPS-105 | Plataforma | Capacidade | API em uma máquina de 1 GB com Chromium do PDF e cinco relógios no mesmo processo, sob portal e rotas públicas do cidadão | E | fly.toml:109, 122-127; index.ts:183-494 | Alto | Teste de carga | SIM | `apps/api/PENDENCIAS.md:28-34` já alerta para memória |
| OPS-106 | Portal e Cidadão (V2) | Observabilidade | Observabilidade e SLA por superfície nova | E | Levantamento:88 ("SLA mensurável com evidência automática"); hoje não há métrica nem alerta (OPS-34, OPS-39) | Alto | OPS-34, OPS-39, OPS-40 | SIM | |

---

## Fluxos

| FLUXO | PASSO | ESTADO (EXISTE/PARCIAL/AUSENTE/NOVO V2) | EVIDÊNCIA |
| --- | --- | --- | --- |
| Backup do banco | Cópia automática do provedor | PARCIAL (documentada, não confirmada) | COLOCAR-DE-PE.md:111-118, 594-597 |
| Backup do banco | Dump manual antes de migrar, em pasta local 0600 | EXISTE | `copiar-producao.mjs:62-282` |
| Backup do banco | Dump agendado | AUSENTE | verificar.yml:13-16; fly.toml |
| Backup do banco | Cifrar e copiar para fora da máquina do operador | AUSENTE | `copiar-producao.mjs:26-39` (proíbe nuvem, não cifra) |
| Backup do banco | Eliminar cópia velha | PARCIAL (manual) | IMPLANTACAO.md:664-665 |
| Backup do Storage | Cópia do balde | AUSENTE | COLOCAR-DE-PE.md:586-593 |
| Backup de segredos | Cofre ou cópia de guarda | AUSENTE | grep negativo; `fly secrets` e chaveiro apenas |
| Restore | Preparar cliente 17.x e papéis | EXISTE (documentado) | COLOCAR-DE-PE.md:363-443 |
| Restore | `pg_restore --exit-on-error` em cluster descartável | EXISTE (executado uma vez, 09/09/2026) | COLOCAR-DE-PE.md:445-455 |
| Restore | Conferir linhas, estrutura e RLS | EXISTE (executado uma vez) | COLOCAR-DE-PE.md:457-566 |
| Restore | Apontar a API para a cópia e fazer login e vistoria | AUSENTE | COLOCAR-DE-PE.md:607-609 |
| Restore | Restaurar sobre a produção ou em projeto Supabase novo | AUSENTE | COLOCAR-DE-PE.md:598-599 |
| Restore | Reteste periódico com relatório | AUSENTE (periodicidade aberta) | INDISPONIBILIDADE.md:104 |
| Migração em produção | Conferir o que falta | EXISTE | `migrar-producao.mjs` (padrão conferir) |
| Migração em produção | Cópia de até 30 min como gate | EXISTE (escape `--sem-copia`) | `migrar-producao.mjs:58-70` |
| Migração em produção | Aplicar em transação por arquivo | EXISTE | `db/src/migrar.ts:178-192` |
| Migração em produção | Endurecimento dos papéis do provedor | PARCIAL (passo manual) | IMPLANTACAO.md:629-662, 674-677 |
| Migração em produção | Rollback | AUSENTE | `db/src` sem reversão |
| Deploy da API | Build e deploy | PARCIAL (manual `fly deploy`, sem CD) | fly.toml:9-10 |
| Deploy da API | Recusa de esquema atrasado na partida | EXISTE | `index.ts:44-56` |
| Deploy da API | Check de saúde do balanceador | EXISTE | fly.toml:115-120 |
| Deploy do painel | Push em master publica na Vercel | EXISTE (sem gate de CI conhecido) | VERCEL-PAINEL.md:49-52 |
| Release | Tag, versão, changelog, SBOM | AUSENTE | `git tag` vazio; package.json 0.1.0 |
| Release do app | `eas build` por perfil | PARCIAL (configurado, não comprovado) | eas.json |
| Release do app | `eas submit` (Apple e Google) | PARCIAL (campos PREENCHER; service account ausente) | eas.json:30-42 |
| Release do app | Correção sem loja (OTA) | AUSENTE | sem `expo-updates` |
| Release do app | Homologação em aparelho antes da loja | AUSENTE (endpoint de exemplo) | eas.json:14-20 |
| Incidente | Confirmar a queda (`/saude`, `fly status`, `fly logs`) | EXISTE (manual) | INDISPONIBILIDADE.md:49-66 |
| Incidente | Detecção automática e alerta | AUSENTE | OPS-39 |
| Incidente | Avisar o município | PARCIAL (sem contatos preenchidos) | INDISPONIBILIDADE.md:68-76, 195-210 |
| Incidente | Página de status | AUSENTE | INDISPONIBILIDADE.md:122-149 |
| Incidente | Contingência em papel e reentrada com data real | PARCIAL (data digitada à mão) | INDISPONIBILIDADE.md:176-189 |
| Incidente | Simulação anual | AUSENTE | sem evidência |
| Observabilidade | Falha de rotina agendada chega a alguém | AUSENTE (log `info`, sem alerta) | `index.ts:314,377,428` |
| Observabilidade | Silêncio de município aparece no console | EXISTE (consulta passiva) | 023:291-321 |
| Push do cidadão | Registrar aparelho sem usuário | NOVO V2 | 016:78-110 |
| Push do cidadão | Enviar por mais de um bundle | NOVO V2 | `config.ts:229`; `apns.ts:188` |
| E-mail das secretarias | Enviar com domínio verificado e tratar cota e rejeição | NOVO V2 | LIGAR-O-EMAIL.md; OPS-103 |
| Lojas (dois apps) | Contas, revisão, privacidade, conta de demonstração | NOVO V2 | LOJAS.md; OPS-101 |

---

## Gaps

1. Nenhum restore foi refeito desde que o esquema passou de 15 para 46 migrações; o roteiro de restore provavelmente falha em `dc360_console` e `pg_trgm` (inferência). `P1 CONTINUIDADE`
2. Fotos e assinaturas (Storage) não têm nenhuma cópia, nem versionamento ou object lock documentado; o dump exclui `storage.objects`. `P1 CONTINUIDADE`
3. Backup automático e PITR do provedor não estão confirmados; ninguém sabe o RPO efetivo. `A DEFINIR`
4. RPO e RTO alvo não decididos e nunca medidos; periodicidade do reteste aberta (três valores divergentes). `A DEFINIR`
5. Operação de produção (cópia, migração) só roda em macOS por chaveiro de uma pessoa; fator de ônibus 1. `P1 CONTINUIDADE`
6. Inventário de segredos existe, mas não há cofre nem cópia de guarda; `SEGUNDO_FATOR_CHAVE` perdida torna ilegíveis os TOTP. `P1 CONTINUIDADE`
7. Dumps com dado de cidadão ficam em pasta local sem cifragem de arquivo e com prazo de eliminação manual; a política de privacidade não cita backup; ciclo de cópias do SAIDA-DE-MUNICIPIO é `[[prazo do ciclo]]`. `A DEFINIR`
8. Sem destino nem prazo de retenção de log; o log leva e-mail de servidor e IP. `A DEFINIR`
9. Contatos de plantão vazios, sem página de status, sem simulação de incidente. `P1 CONTINUIDADE`
10. Nenhum alerta, erro centralizado, métrica de aplicação nem tracing; painel e app sem captura de erro. `P1 OPERAÇÃO`
11. Falha das rotinas de minimização, resumo e órfãos é registrada em `info`, sem sinal em `/saude`; minimização executa obrigação de retenção prometida. `P1 OPERAÇÃO`
12. `/saude` mistura liveness e readiness, o ramo 503 não tem teste, e a documentação (README, fly.toml, comentário) promete 503 por esquema atrasado, que o código não faz. `P1 OPERAÇÃO`
13. `npm audit` falha hoje nos dois lockfiles e o CI tende a estar vermelho sem mudança de código; não há execução agendada nem Dependabot; README diz "em zero". `P1 OPERAÇÃO`
14. O CI não roda os 18 `scripts/*.test.mjs`, `test:campo` nem `auditar`, e não constrói a imagem Docker, que os documentos dizem ser conferida por ele. `P1 OPERAÇÃO`
15. Sem lint, SAST, secret scanning, SBOM, licenças, DAST, scan de contêiner; workflows sem `permissions`, sem SHA de ação, sem timeout. `P1 OPERAÇÃO`
16. Sem staging (nem para o backend, nem para o app). `P1 OPERAÇÃO`
17. Sem evidência de revisão de código ou branch protection (119 commits diretos); Vercel publica a cada push sem gate conhecido. `A DEFINIR`
18. Sem versionamento, tags, changelog, nem versão ou SHA visível em produção; deploy manual da máquina do operador. `P1 OPERAÇÃO`
19. App de campo: `eas.json` incompleto, `projectId` vazio, sem OTA, nenhum build EAS comprovado, bundle id em conflito com o próprio guia; contas de loja inexistentes ou não confirmadas. `A DEFINIR`
20. Migração sem rollback e sem trava de concorrência; o endurecimento pós-migração é manual. `P2 EVOLUÇÃO`
21. Request id não é exposto como header, não é aceito de entrada, não é mostrado pelos clientes nem testado. `P2 EVOLUÇÃO`
22. Documentação contraditória sobre operação: `db/PENDENCIAS.md` (console "não construído"), README (`audit` zero; S3 "nunca falou com provedor" enquanto COLOCAR-DE-PE relata 7 objetos no balde), três versões sobre o app ter rodado em aparelho, `LOJAS.md`. `P2 EVOLUÇÃO`
23. V2: push do cidadão exige aparelho sem usuário, mais de um bundle e FCM configurado; e-mail das secretarias exige provedor ligado, domínio e plano; dois apps em loja; capacidade da máquina única. `P1 PRODUTO`

---

## Decisões humanas

**D1. Periodicidade, dono e formato do teste de restauração**
- Pergunta: de quanto em quanto tempo o restore é refeito, por quem, e com que relatório?
- Por que importa: o único restore é de 09/09/2026 e o esquema mudou muito; três documentos dão três respostas (`[[a definir]]`, mensal, trimestral assinado).
- O que bloqueia: saber se a cópia de hoje é restaurável; cláusula de backup em contrato; critério CA-08 declarado como cumprido.
- Alternativas: (a) mensal pelo próprio autor; (b) trimestral com relatório assinado por pessoa que não escreveu o sistema; (c) automatizar um restore em cluster descartável por workflow agendado; (d) por evento (toda migração que mexa em papel, policy ou grant) mais uma periodicidade de piso.
- Riscos: (a) repete o viés de quem escreveu; (b) intervalo longo entre provas; (c) custo e manuseio de dado pessoal em runner, exige dump sintético ou anonimizado; (d) depende de disciplina humana para reconhecer a migração.

**D2. RPO e RTO alvo**
- Pergunta: quanto dado o município aceita perder (RPO) e quanto tempo aceita esperar (RTO)?
- Por que importa: ESPECIFICACAO RNF-06 dá 24 h e 8 h como hipótese; o levantamento recomenda 15 min e 4 h; o que existe hoje não mede nenhum.
- O que bloqueia: escolha de plano do provedor, PITR, frequência de dump, SLA contratual.
- Alternativas: manter 24 h e 8 h no piloto; adotar 15 min e 4 h (PITR); valores intermediários por município.
- Riscos: alvo frouxo demais expõe o dia de temporal; alvo agressivo exige plano pago e prova periódica que hoje não existe.

**D3. Destino, cifragem e retenção das cópias (banco e Storage)**
- Pergunta: onde as cópias moram, cifradas como, por quanto tempo, com que prazo de eliminação, e qual é o "ciclo" citado em SAIDA-DE-MUNICIPIO (`[[prazo do ciclo]]`)?
- Por que importa: dump tem dado de cidadão; a política de privacidade não cita backup; eliminação de município precisa dizer quando a cópia vence; o Storage não tem cópia alguma.
- O que bloqueia: texto de PRIVACIDADE e do contrato; eliminação com declaração; DR do Storage.
- Alternativas: só o provedor (sem cópia própria); cópia própria cifrada em bucket de outra conta e região do Brasil; cópia em máquina de operador (estado atual); versionamento e object lock no balde.
- Riscos: só provedor = dependência total e sem prova de restore; bucket externo = novo subprocessador e custo; máquina de operador = dado pessoal fora de controle, fator de ônibus 1; object lock conflita com eliminação exigida por prazo.

**D4. Quem opera, plantão e segunda pessoa com acesso**
- Pergunta: quem atende incidente, com que contatos e compromisso (melhor esforço ou plantão), e quem é a segunda pessoa com acesso às contas e aos segredos?
- Por que importa: INDISPONIBILIDADE.md:195-210 está vazio; os roteiros só rodam num Mac de uma pessoa.
- O que bloqueia: contrato com SLA, procedimento executável de madrugada, continuidade se o operador único faltar.
- Alternativas: manter operador único com melhor esforço escrito em contrato; segundo operador com acesso mínimo; serviço de plantão terceirizado.
- Riscos: operador único = indisponibilidade de pessoa; segundo operador amplia a superfície de acesso ao banco e segredos; terceirizar cria subprocessador e custo.

**D5. Ferramenta de observabilidade, alerta e status page**
- Pergunta: qual ferramenta para erro centralizado, métricas, alertas e página de status, hospedada onde?
- Por que importa: hoje nada avisa; levantamento 4.2 indica OpenTelemetry mais Grafana/Loki ou equivalente; SLA exige evidência automática; o destino do log também precisa de prazo (INDISPONIBILIDADE.md:153-172).
- O que bloqueia: detectar falha antes do município, medir SLA, atender incidente, declaração nas lojas se houver crash report no app.
- Alternativas: serviço gerenciado de erro mais uptime (terceiro); pilha aberta própria; recursos nativos do Fly com exportação; status page estática fora de Fly, Vercel e Supabase.
- Riscos: terceiro fora do país = transferência internacional e novo subprocessador (SUBPROCESSADORES.md exige aviso de 30 dias); pilha própria = operação extra para um operador único; nativo do Fly = pouco alcance em app e painel.

**D6. Ambientes**
- Pergunta: criar staging (API, banco, painel e perfil de homologação do app)? Com que dados?
- Por que importa: não existe staging; o piloto roda como produção; o levantamento exige ZAP em staging e proíbe dado de produção nele; o portal e o app do cidadão aumentam o risco de testar em produção.
- O que bloqueia: DAST, teste de release do app, ensaio de migração e de restore, o perfil `homologacao` do EAS.
- Alternativas: staging permanente; ambiente efêmero por PR; manter produção única com gates mais fortes.
- Riscos: permanente custa e exige dados sintéticos; efêmero exige automação que não existe; produção única mantém o risco atual.

**D7. Política de branch, revisão e release**
- Pergunta: PR obrigatório e checks obrigatórios em `master`, mesmo solo? Como versionar (SemVer, tags), quem aprova um deploy, e o deploy da Vercel deve esperar o CI?
- Por que importa: 119 commits diretos, sem tag, sem changelog, sem SHA em produção; a Vercel publica a cada push.
- O que bloqueia: rastreabilidade de release, SBOM por release, auditoria de mudança.
- Alternativas: proteção rígida com PR próprio e auto-aprovação registrada; proteção leve (só checks); manter direto em master.
- Riscos: rígida adiciona atrito para operador único; leve não cria revisão real; direto mantém a ausência de registro de mudança.

**D8. Conjunto mínimo de segurança de desenvolvimento e política de `npm audit`**
- Pergunta: quais ferramentas entram (SAST, secret scanning, SBOM, licenças, Dependabot ou Renovate, scan de contêiner) e com que SLA por severidade? O CI bloqueia por qualquer advisory (hoje) ou só runtime (como `auditar.mjs`)?
- Por que importa: hoje o critério do CI e o local divergem e o CI tende a ficar vermelho por advisory nova.
- O que bloqueia: confiança no gate; cumprir a régua ASVS 2 e CIS IG1 que o próprio projeto adotou.
- Alternativas: adotar as seis ferramentas; adotar só SCA, secret scanning e SAST gratuitos do GitHub; manter o estado atual e declarar exceção.
- Riscos: todas = tempo de triagem para um operador; subconjunto = lacuna declarada; manter = régua escrita que não se cumpre.

**D9. App de campo: contas, identidade e OTA**
- Pergunta: conta Apple e Google pessoal ou de organização (D-U-N-S, verificação), qual bundle id e package (hoje `com.solerte.dc360.campo`), distribuição interna ou pública, e haverá OTA (`expo-updates`)?
- Por que importa: bundle é definitivo depois de publicado; o guia manda trocar e o código não mudou; sem OTA toda correção exige nova revisão de loja.
- O que bloqueia: primeiro build EAS, `eas submit`, push em produção no iOS e Android, segundo app.
- Alternativas: conta pessoal para piloto; organização (prazo de D-U-N-S); distribuição privada (Apple Business Manager, teste interno Google); OTA ligada ou desligada.
- Riscos: pessoal = personificação e migração futura; organização = prazo longo; privada = sem vitrine; OTA = canal de código fora da revisão de loja e nova superfície de supply chain.

**D10. Dependências externas novas dos dois canais da V2 (sem escolher)**
- Pergunta: para o push do cidadão, para o e-mail das secretarias e para as lojas, quais provedores e contas entram?
- Por que importa:
  - Push do cidadão: o modelo atual exige usuário autenticado (`aparelhos.usuario_id NOT NULL`), usa um único `APNS_BUNDLE` e FCM não está configurado; precisa de segundo bundle e app, chave e tópico APNs, projeto Firebase, e decisão LGPD sobre identificar aparelho de cidadão.
  - E-mail das secretarias: Resend escolhido mas não ligado; exige conta, domínio remetente verificado no DNS, chave e plano; a faixa gratuita cita 100/dia e 3000/mês.
  - Lojas: segunda ficha pública, política de privacidade e formulários de dados, conta de demonstração.
  - Todos entram em SUBPROCESSADORES.md no mesmo commit, com 30 dias de aviso.
- O que bloqueia: superfícies 4 e 5 da V2 em produção.
- Alternativas: push via APNs e FCM diretos (como hoje) ou intermediário; e-mail com Resend, outro provedor ou relay do município; domínio remetente do fornecedor ou do município; uma conta de loja para os dois apps ou contas separadas.
- Riscos: diretos = mais código multi-bundle e manutenção de credenciais; intermediário = novo subprocessador fora do país; Resend gratuito estoura em dia de temporal (LIGAR-O-EMAIL.md:213); domínio do município exige DNS do município; conta única concentra risco de suspensão.

**D11. Capacidade e topologia da API**
- Pergunta: manter uma máquina de 1 GB com PDF, cinco relógios e rotas públicas no mesmo processo, ou separar?
- Por que importa: o portal e o cidadão trazem tráfego e rotas públicas; `apps/api/PENDENCIAS.md` já aponta risco de memória.
- O que bloqueia: dimensionar SLA e escolher onde instrumentar.
- Alternativas: escalar a máquina; segunda máquina (as travas já existem); separar PDF e relógios em processo próprio.
- Riscos: escalar só adia; segunda máquina muda a semântica de `/saude` por máquina; separar aumenta a operação.

---

## Riscos arquiteturais

1. **Relógios dentro do processo da API** (push, minimização, resumo, órfãos, eliminação) compartilham memória e ciclo de vida com o atendimento e com o Chromium do PDF, numa única máquina de 1 GB. Travas `pg_try_advisory_lock` são de sessão: dependem de o pooler estar em modo sessão (porta 5432); em modo transação (6543) a trava não se sustenta (o próprio `producao.mjs:42-50` distingue os dois modos).
2. **Observabilidade passiva**: a saúde do produto depende de alguém abrir o console, o Fly ou o log. Sem alerta, o tempo de detecção é o tempo até o município ligar.
3. **Deploy desacoplado e sem gate**: a Vercel publica a cada push, a API é implantada à mão, e a migração é um terceiro passo manual; a ordem correta é convenção humana (IMPLANTACAO.md:658-662).
4. **Migração irreversível** com mitigação apenas humana (regra aditiva) e uma cópia manual de 30 min; sem reversão, o ponto de volta é o restore, que não foi refeito para o esquema atual.
5. **Desvio de versão de Postgres entre ambientes** (testes em PGlite e CI em 16; produção 17.6; máquina local já citada em 18). Comportamento de extensão (`pg_trgm`), papéis e planos pode divergir.
6. **Segredos sem cofre**: `fly secrets` e chaveiro de uma máquina; sem a chave do segundo fator, o banco restaurado perde a autenticação de quem tem 2FA obrigatório.
7. **Dependência de provedores únicos** (Supabase para banco e Storage, Fly para API, Vercel para painel, Apple e Google para push) sem plano de troca nem cópia de Storage.
8. **Binário com endpoint fixo por build** (`DC360_API_URL` em `eas.json`): a V2 do cidadão precisa decidir como um app público descobre o município e o endpoint, e a operação de builds por município multiplicaria lojas e contas.
9. **Fator de ônibus 1** em código, contas e ferramentas de produção.

## Dívidas técnicas

1. Documentos de operação com números e afirmações envelhecidas: `db/PENDENCIAS.md` (console e resumo "não construídos"), README (audit zero; S3 nunca testado), `LOJAS.md` e `LEIA-ME.md` do app (nunca rodou) contra README e COLOCAR-DE-PE, `Dockerfile` e `compose.yaml` (conferência "pelo job implantavel" que não constrói imagem).
2. `scripts/*.test.mjs` (18) e `auditar.mjs` fora do CI.
3. Workflow sem `permissions`, sem SHA de ação, sem `timeout-minutes`, sem `schedule`; job `demonstracao` (protótipo) mistura escopos.
4. Rotinas agendadas registram falha em `info` e `registrar` sem nível.
5. `/saude`: comentário com `esquemaEmDia` inexistente, rota única para liveness e readiness, ramo 503 sem teste, exposição pública de `ultimaMigracao`.
6. Request id sem header, sem propagação e sem consumo nos clientes.
7. Sem `statement_timeout` e sem `LOG_LEVEL`.
8. `apps/api/src/servidor.ts:454-462`: a verificação de vigência de conta e sessão (`auth/vigencia.ts`) está escrita e desligada "nesta implantação"; registrado aqui por tocar operação, a análise é da frente de autenticação.
9. `apps/campo`: `eas.json` com placeholders, `projectId` vazio, `BUILD` fixo no código com `autoIncrement` no EAS, sem `expo-updates`, bundle id em conflito entre guia e código.
10. Roteiros de produção só para macOS (chaveiro, Homebrew, Desktop); sem equivalente para Windows ou Linux.
11. Migrador sem trava de concorrência e sem registro persistente de `--sem-copia`.
12. `apps/web` lista `@electric-sql/pglite` como dependência de runtime (modo local de demonstração) no build que vai à Vercel; registrado por afetar superfície de dependência, sem aprofundar.

---

## O que não consegui cobrir (NÃO CONFIRMADO)

- Estado real de GitHub (runs, branch protection, secret scanning, permissões), Fly, Supabase (backup, PITR, plano, Storage), Vercel, Apple, Google, Expo e Resend: só verificáveis nos respectivos consoles (ver 1.3.B). Nesta sessão existem conectores de Supabase e Vercel, que não usei por estar fora do escopo de "repositório"; poderiam responder parte disso em leitura.
- Se o CI está vermelho hoje: inferido pelo código de saída do `npm audit` local, não observado no GitHub.
- Se a imagem Docker constrói: não há evidência no repositório; só o app em produção no Fly (externo) sugere que sim.
- Se o restore de 09/09/2026 ocorreu exatamente como narrado: o md5 bate com as migrações do repositório, mas não há log bruto.
- Se o roteiro de restore falha hoje em `dc360_console` e `pg_trgm`: inferência por leitura de migrações, não executada.
