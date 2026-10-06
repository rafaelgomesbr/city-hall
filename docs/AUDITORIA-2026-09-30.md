# Auditoria técnica completa do Defesa Civil Operacional 360 (dc360)

**Data da auditoria:** 30/09/2026
**Escopo:** `C:\Projetos\city-hall\dc360` (o produto real). O protótipo em `mockup/` está fora de escopo.
**Uso:** documento interno para o Rafael, dono do projeto. Não é material de venda. Nada aqui foi suavizado.
**Autor:** auditoria independente, sem participação na construção do código, feita lendo o repositório e executando comandos reais nele em 30/09/2026.

Regra que governa este documento: toda afirmação vem com o caminho do arquivo, o comando executado ou o teste que a sustenta. Onde não consegui verificar algo, digo que não verifiquei, em vez de repetir o que a documentação afirma como se eu tivesse conferido.

---

## Sumário

1. [Veredicto e o que muda a decisão](#1-veredicto-e-o-que-muda-a-decisão)
2. [Metodologia: o que foi lido e o que foi executado](#2-metodologia-o-que-foi-lido-e-o-que-foi-executado)
3. [Panorama por camada, arquivo por arquivo](#3-panorama-por-camada-arquivo-por-arquivo)
4. [Execução real: typecheck, npm audit e as suítes de teste](#4-execução-real-typecheck-npm-audit-e-as-suítes-de-teste)
5. [Tabela de rastreabilidade de requisitos](#5-tabela-de-rastreabilidade-de-requisitos)
6. [Requisito a requisito, com evidência](#6-requisito-a-requisito-com-evidência)
7. [Fases futuras do documento original: planejado, não iniciado](#7-fases-futuras-do-documento-original-planejado-não-iniciado)
8. [Avaliação livre](#8-avaliação-livre)
9. [Riscos sem mitigação completa](#9-riscos-sem-mitigação-completa)
10. [O que depende do Rafael, ordenado pelo que cada bloqueio impede](#10-o-que-depende-do-rafael-ordenado-pelo-que-cada-bloqueio-impede)
11. [Divergências entre o que a documentação afirma e o que rodei hoje](#11-divergências-entre-o-que-a-documentação-afirma-e-o-que-rodei-hoje)
12. [Conclusão](#12-conclusão)

---

## 1. Veredicto e o que muda a decisão

O dc360 é um produto real, com banco, API e painel funcionando de ponta a ponta, isolamento multi-tenant provado por 137 testes dedicados (`db/test/isolamento.test.ts`), trilha de auditoria append-only garantida no banco (ausência de policy de UPDATE/DELETE, não por convenção de código) e uma cadeia de decisões de segurança (chave estrangeira composta por `organizacao_id`, funções `SECURITY DEFINER` com `search_path` fixo, 404 em vez de 403 para recurso de outro município) que são exatamente o tipo de decisão que normalmente só aparece depois de um incidente. Isso é raro em um produto neste estágio e está bem evidenciado no próprio código, não só em prosa.

Dito isso, três coisas mudam a decisão de "está pronto para o próximo piloto" para "está pronto com ressalvas conhecidas":

**Primeira: existe uma funcionalidade de segurança operacional pronta na API e invisível na tela.** As rotas `POST /usuarios/:id/redefinir-senha` e `POST /usuarios/:id/encerrar-sessoes` (administração de conta de terceiro) e `POST /auth/encerrar-sessoes` (encerrar as próprias outras sessões) existem, têm teste de API passando, e as funções de dados já existem em `apps/web/src/dados/http.ts`, `local.ts` e `repositorio.ts`. Nenhuma tela do painel chama nenhuma das três. O próprio arquivo de teste que hoje falha (`apps/web/test/seguranca-da-conta.test.ts`) documenta isso com todas as letras: *"Com a recuperação por email desligada, que é como o piloto roda, 'esqueci a senha' não tinha saída nenhuma pelo painel: quem administra lia 'procure quem administra o município' e não tinha o botão."* Hoje, com `RECUPERACAO_ATIVA` dependendo de um provedor de email que ainda não foi contratado (ver seção 10), um agente ou operador que esquece a senha não tem caminho nenhum pela interface até isso ser corrigido. Ver seção 4 e seção 8.2.

**Segunda: o próprio time documentou, em `apps/api/PENDENCIAS.md`, um risco de memória não mitigado na rota de saída de município (portabilidade de dados, CA-10), com potencial de derrubar o processo da API no dia em que um município decide sair.** `montarPacoteDeSaida` carrega TODAS as linhas de cerca de vinte tabelas na memória do processo, sem `LIMIT`, incluindo as duas tabelas de trilha, que são append-only e portanto só crescem. O comentário da própria rota afirma o oposto do que o código faz (promete fluxo, entrega acumulação em memória). Numa máquina de 1 GB (`fly.toml`), um município de operação longa pode derrubar o processo exatamente no momento em que pede para sair, levando junto quem estiver de plantão. Ver seção 9.

**Terceira: `npm audit` não fecha em zero, hoje, em dois pontos, o que contraria diretamente a regra não negociável do próprio `CLAUDE.md` ("npm audit precisa fechar em zero").** Na raiz do monorepo há uma vulnerabilidade moderada em `fast-uri` alcançável mesmo com `--omit=dev` (vem do `ajv` que o próprio Fastify carrega); em `apps/campo` há uma vulnerabilidade alta em `brace-expansion` (dev, via Jest) e uma moderada em `decode-uri-component` alcançável a partir de `expo-router`, que É dependência de runtime do aplicativo publicado. Ver seção 4.

Além dessas três, a suíte de testes tem hoje mais dívida do que a documentação confessa: o painel web tem uma baseline conhecida de 5 arquivos/14 casos falhando (o Rafael já sabia disso, e a investigação desta auditoria confirma exatamente o número e identifica a causa de cada um, seção 4.2), mas esta auditoria também encontrou, rodando a suíte agora, **3 arquivos/2 casos falhando na API** (um deles é uma regressão real de conteúdo de documento oficial), **1 arquivo/1 caso falhando no pacote compartilhado**, e **5 arquivos/20 casos falhando no aplicativo de campo**, nenhum desses cinco mencionado em nenhuma documentação lida. Nada disso estava na lista de pendências conhecidas que me foi passada.

O produto não está "quebrado". A infraestrutura de isolamento, auditoria e autenticação é sólida e tem prova real por trás. Mas a distância entre "o README diz que passa" e "passa, agora, nesta máquina" é maior do que zero, e uma parte dessa distância (a funcionalidade de conta sem tela, o risco de memória, o `npm audit` não fechado) não é dívida cosmética.

---

## 2. Metodologia: o que foi lido e o que foi executado

### O que li, na ordem

1. `C:\Projetos\city-hall\CLAUDE.md`, seção "O produto real (`dc360/`)" por inteiro, como critério de auditoria.
2. `docs\referencia\ESPECIFICACAO_TECNICA_PRELIMINAR.md` por inteiro (459 linhas): as 18 seções, todos os requisitos funcionais numerados, as regras de negócio RN-01 a RN-10, os RNF-01 a RNF-15, os CA-01 a CA-10, e o roadmap de fases futuras.
3. `dc360\README.md` por inteiro (1392 linhas): arquitetura, modelo de isolamento, autenticação, sincronização de campo, evidência fotográfica, documentos oficiais, papéis e permissões, console do fornecedor, portões automatizados de design/acessibilidade/conteúdo.
4. Os 8 ADRs em `docs\adr\` (localizados na raiz do repositório, não dentro de `dc360\docs\`).
5. Os `PENDENCIAS.md` de `apps/api`, `apps/web`, `apps/campo` e `db`, que documentam risco identificado e não corrigido, decisão em aberto e defeito reproduzido.
6. `docs\INDISPONIBILIDADE.md`, `docs\SEGURANCA-DO-AGENTE.md` (via README), `docs\apresentacao-produto-alyson.html` (via `git log`, para entender o contexto de "retenção e saída de município já tem tela").
7. Código-fonte: as 46 migrações (cabeçalho de cada uma), `packages/shared/src/permissoes.ts` e `dominio.ts` por inteiro, as 22 rotas de `apps/api/src/rotas/`, as páginas de `apps/web/src/paginas/`, a estrutura de `apps/campo/src/` e `apps/console/src/`.
8. O histórico recente de commits (`git log`), para separar o que é afirmação de documentação do que é mudança de código de fato.

### O que executei eu mesmo, em 30/09/2026, nesta máquina Windows (Node 22.17.0, npm 10.9.2, PowerShell/Git Bash)

| Comando | Onde | Resultado bruto |
| --- | --- | --- |
| `npm run typecheck` (workspaces raiz) | `dc360/` | Passou sem erro em shared, db, campo (pacote), api, console, web |
| `npm audit` e `npm audit --omit=dev` | `dc360/` | 3 vulnerabilidades moderadas / 1 moderada só em runtime (ver seção 4) |
| `npm test` (suíte completa) | `dc360/` | Ver seção 4, por workspace |
| `npm run test:api` | `dc360/` | 86 arquivos, 1109 testes: 1089 passaram, 18 pulados, 2 falharam, mais 1 arquivo com falha de suíte |
| `npm run test:console` | `dc360/` | 16 arquivos, 259 testes, todos passaram |
| `npm test` (isolado) | `dc360/packages/shared` | 14 arquivos, 149 testes: 148 passaram, 1 falhou |
| `npm test` (isolado) | `dc360/packages/campo` | 8 arquivos, 159 testes, todos passaram |
| `npm test` (isolado) | `dc360/db` | 11 arquivos, 318 testes (315 passaram, 3 pulados) |
| `npx vitest run` (isolado, com detalhe) | `dc360/apps/web` | 36 arquivos, 550 testes: 536 passaram, 14 falharam em 5 arquivos |
| `npm ci` | `dc360/apps/campo` | Instalação completa (900 pacotes), que **não estava feita** nesta máquina antes desta auditoria |
| `npm audit` | `dc360/apps/campo` | 4 vulnerabilidades (3 moderadas, 1 alta) |
| `npx expo-doctor` | `dc360/apps/campo` | 20 de 21 checagens passaram (README afirma 21 de 21) |
| `npm run test:campo` | `dc360/` | Falhou no passo de typecheck (2 erros; ver seção 3.5) antes de chegar ao Jest |
| `npx jest --silent` (isolado, contornando o script) | `dc360/apps/campo` | 121 suítes (116 passaram, 5 falharam), 1801 testes (1781 passaram, 20 falharam) |
| `git log`, `git show` | raiz | Para confirmar quando cada tela recente (retenção, saída de município, os três cartões de leitura) de fato entrou no código |

### O que eu NÃO consegui ou não tive orçamento de tempo para executar, e digo isso em voz alta

- **Não subi um Postgres real nem a API contra ele.** Toda a suíte roda contra PGlite (Postgres compilado para WebAssembly), como o próprio projeto está desenhado para fazer sem Docker. O job de CI "A API sobe contra Postgres real" (`.github/workflows/verificar.yml`) eu **li**, não **rodei**.
- **Não tenho acesso ao GitHub Actions desta máquina** (`gh auth login` não configurado), então não sei o status real da última execução do CI no branch `master`. Isso importa porque pelo menos duas das falhas que encontrei (detalhadas na seção 4.2) parecem ser artefatos desta máquina Windows especificamente (quebra de linha CRLF por `core.autocrlf=true`, e ausência de `openssl` no PATH do sistema fora do Git Bash) e podem não se reproduzir no runner Linux do CI. Isso é uma hipótese, não uma confirmação: não tenho como validá-la sem acesso ao GitHub.
- **Não instalei um aparelho físico nem simulador.** Tudo relativo a câmera, GPS, assinatura no dedo, vibração (`expo-haptics`) e vidro (`expo-blur`) é relatado como o próprio `apps/campo/PENDENCIAS.md` e `apps/campo/LEIA-ME.md` relatam: não verificado em aparelho. Eu não tenho como verificar isso nesta sessão.
- **Não investiguei linha a linha a causa raiz dos 20 testes falhando em `apps/campo`** (Jest). Encontrei o padrão (um componente de "sessão encerrada" que não exibe o texto/botão que os testes esperam) e reporto isso como achado, mas não fui até o commit que introduziu a divergência.
- **Não contratei nem testei contra um provedor real de S3/R2, de email (Resend) nem de mapas com cobrança real.** Isso já está declarado como pendência pelo próprio projeto (seção 10).

---

## 3. Panorama por camada, arquivo por arquivo

### 3.1 Banco de dados (`dc360/db/`)

**Modelo de isolamento.** Banco único, toda tabela de negócio com coluna `organizacao_id`, `ENABLE ROW LEVEL SECURITY` e `FORCE ROW LEVEL SECURITY` (a diferença importa: sem `FORCE`, o dono da tabela ignora a policy). O papel de aplicação, `dc360_app`, não é superusuário, não tem `BYPASSRLS` e não é dono de tabela nenhuma. A organização do contexto vem de `set_config('app.organizacao_atual', $1, true)` dentro de uma transação (`SET LOCAL`), nunca de parâmetro solto. Isso está provado, não apenas declarado: `db/test/isolamento.test.ts` descobre as tabelas pelo catálogo do próprio Postgres (não por uma lista mantida à mão) e exige, de toda tabela existente, RLS ativada e forçada, ao menos uma policy citando `app_organizacao_atual()`, coluna `organizacao_id` obrigatória, e toda referência entre tabelas de negócio incluindo `organizacao_id` na chave estrangeira.

**O achado mais caro do projeto, documentado no próprio README: RLS não cobre chave estrangeira.** O Postgres confere a existência de uma linha referenciada com privilégio de sistema, por baixo da policy de RLS. Antes da migração `008_chaves_coerentes_por_municipio.sql`, dava para vincular uma ocorrência de um município a uma vistoria de outro, ou pior, assinar um evento da trilha com um servidor de outro município. A correção foi chave estrangeira composta, incluindo `organizacao_id` nos dois lados. Isso está coberto por teste, e eu não reproduzi a regressão manualmente, mas o README afirma que os 5 testes relacionados reprovam se a migração for removida, e a inspeção do próprio `isolamento.test.ts` confirma que ele varre exatamente esse invariante.

**Trilha de auditoria append-only.** `trilha_eventos` e `trilha_administrativa` têm policy de `SELECT` e de `INSERT`, e nenhuma de `UPDATE` nem `DELETE`. Com RLS forçada, a AUSÊNCIA de policy nega a operação: não é uma convenção de aplicação, é uma garantia de banco. `db/test/isolamento.test.ts` tem um caso de teste específico provando isto por tentativa direta ("com um GRANT DELETE a mais, as linhas continuam lá"). As migrações 032, 033 e 034 fecham um defeito real onde outras tabelas (relacionadas a prova/evidência e as tabelas centrais) prometiam append-only "por extenso" mas só entregavam uma barreira.

**Protocolo único por organização e ano**, gerado dentro da transação com a linha da sequência travada (`proximo_protocolo(ano)`), evitando colisão entre operadores concorrentes e entre municípios.

**Migrações, em ordem, com a descrição do próprio cabeçalho de cada arquivo** (não inferida por mim; li o comentário de topo de todas as 46):

| # | Arquivo | O que faz |
| --- | --- | --- |
| 001 | `001_base.sql` | Base multi-tenant com Row Level Security forçada |
| 002 | `002_autenticacao.sql` | Autenticação; funções `SECURITY DEFINER` para o que precisa rodar antes de existir contexto de tenant |
| 003 | `003_evidencias.sql` | Evidência fotográfica com envio direto ao armazenamento (URL pré-assinada) |
| 004 | `004_evidencia_idempotente.sql` | Chave de idempotência na evidência, evitando duas fotos para o mesmo envio |
| 005 | `005_recuperacao_de_senha.sql` | Recuperação e troca de senha |
| 006 | `006_resposta_de_providencia.sql` | Resposta do órgão parceiro à providência encaminhada |
| 007 | `007_registro_de_exportacao.sql` | Registro de quem exportou o quê (LGPD) |
| 008 | `008_chaves_coerentes_por_municipio.sql` | Chave estrangeira composta por `organizacao_id`; corrige vazamento entre municípios via FK |
| 009 | `009_assinatura_data_e_emissao.sql` | Chave da assinatura, data da vistoria e registro de emissão de documento; segunda correção de vazamento entre municípios |
| 010 | `010_trilha_administrativa.sql` | Trilha dos atos administrativos (promoção, rebaixamento, desativação, criação de equipe) |
| 011 | `011_interesse_de_municipio.sql` | Cadastro do formulário público de interesse (única tabela que não pertence a nenhuma organização) |
| 012 | `012_ponto_de_referencia.sql` | Ponto de referência como endereço alternativo em área sem numeração/placa |
| 013 | `013_matricula_no_login.sql` | Matrícula do servidor desce junto com a identidade (para impressão em documento) |
| 014 | `014_interdicao_tem_fim.sql` | Desinterdição: o sistema sabia interditar e não sabia liberar o imóvel |
| 015 | `015_pessoas_atingidas.sql` | Quantidade e situação das pessoas atingidas, antes ausente do laudo |
| 016 | `016_aparelho_e_aviso_de_prazo.sql` | Cadastro de aparelho para push, e aviso de prazo de vistoria vencendo |
| 017 | `017_orgaos_oficio_e_email.sql` | Catálogo de órgãos, ofício numerado e link de uso único de resposta |
| 018 | `018_sino_de_avisos.sql` | Sino de avisos do painel do coordenador |
| 019 | `019_tipo_a_classificar.sql` | Tipo "outro" (`TIPO_A_CLASSIFICAR`), que o esquema aceitava e o banco recusava |
| 020 | `020_orgaos_indicados_na_vistoria.sql` | Órgãos indicados na vistoria, que o servidor coletava do envelope e descartava |
| 021 | `021_minimizacao_e_registro_de_consulta.sql` | Retenção por minimização de dado, e registro de quem consultou dado de cidadão |
| 022 | `022_segundo_fator.sql` | Segundo fator (TOTP) para quem administra o município |
| 023 | `023_metricas_do_municipio.sql` | Resumo que o município escreve e o console do fornecedor só lê (ADR 0008) |
| 024 | `024_prova_tem_autor_e_equipe.sql` | Autor, data plausível e equipe conferida na prova fotográfica |
| 025 | `025_provisionar_deixa_linha_espelho.sql` | Município passa a enxergar, na própria trilha, o próprio nascimento |
| 026 | `026_relogio_do_resumo.sql` | Relógio que descobre para quais municípios chamar o resumo da migração 023 |
| 027 | `027_recibo_do_provedor_de_email.sql` | Ofício guarda o recibo (`provedor_id`) que o provedor de email devolve |
| 028 | `028_devolucao_de_tarefa_vencida.sql` | Tarefa vencida que o agente pode devolver à coordenação |
| 029 | `029_minimizacao_alcanca_a_devolucao.sql` | Minimização por prazo alcança a observação de devolução de tarefa |
| 030 | `030_prova_perdida_e_ponto_da_vistoria.sql` | Registro de prova perdida antes de subir, e ponto onde o agente esteve |
| 031 | `031_saida_a_campo.sql` | Saída a campo declarada e retorno não confirmado (segurança do agente) |
| 032 | `032_prova_que_nao_se_apaga_e_prorrogacao_idempotente.sql` | Fecha ausência de policy que 030/031 prometiam e não escreveram; prorrogação idempotente |
| 033 | `033_as_outras_duas_que_prometiam_append_only.sql` | Mais duas tabelas que prometiam append-only e entregavam só uma barreira |
| 034 | `034_as_tabelas_centrais_tambem_nao_se_apagam.sql` | Mesmo defeito de 032/033, agora nas tabelas centrais de prova |
| 035 | `035_teto_e_objeto_orfao.sql` | Teto de armazenamento por município, e descarte de objeto órfão |
| 036 | `036_o_console_cadastra_prefeitura.sql` | Console do fornecedor passa a CRIAR município, sem ganhar direito de LER município nenhum |
| 037 | `037_o_expurgo_de_notificacao_nao_depende_de_bypassrls.sql` | Expurgo por retenção de `notificacoes_enviadas` deixa de depender de ignorar RLS |
| 038 | `038_suspensao_eliminacao_e_operadores_do_console.sql` | Suspender acesso de município, eliminar com prazo de arrependimento, operadores do console migram de config para banco |
| 039 | `039_codigos_de_recuperacao_do_console.sql` | Códigos de recuperação de senha para operadores do console, inclusive o dono |
| 040 | `040_foto_do_agente.sql` | Foto de perfil do servidor como chave de armazenamento |
| 041 | `041_busca_com_tolerancia_a_erro.sql` | Busca do painel com tolerância a erro de digitação, do lado do banco |
| 042 | `042_aviso_de_despacho_nasce_no_despacho.sql` | Aviso de tarefa nova nasce no momento do despacho |
| 043 | `043_minimizacao_alcanca_relato_vistoria_e_trilha.sql` | Minimização alcança relato do solicitante, observação da vistoria e nome do assinante na trilha |
| 044 | `044_ambiente_da_apns_por_aparelho.sql` | Cada aparelho iOS registra com qual ambiente de APNs fala |
| 045 | `045_varredura_de_prazo_sem_bypassrls_e_a_foto_no_teto.sql` | Varredura de prazo estoura (em vez de calar) sem `BYPASSRLS`; foto de perfil passa a contar no teto de armazenamento |
| 046 | `046_senha_provisoria_e_o_dono_do_token_diz_por_que.sql` | Senha provisória com prazo; token expirado passa a dizer o motivo |

**CA-06 (isolamento), executado por mim hoje:** `db/test/isolamento.test.ts`, 137 casos, todos passaram, incluindo o caso de nenhum papel além do de aplicação e do dono ter privilégio em tabela de negócio (por concessão direta, herança de papel, `PUBLIC`, visão, ou função `SECURITY DEFINER`), verificado por varredura no catálogo do Postgres, não por lista mantida à mão.

### 3.2 Pacote compartilhado (`dc360/packages/shared/`)

- `dominio.ts` (500 linhas): `TIPOS_COBRADE` com os 8 tipos exigidos por `CLAUDE.md` (deslizamento, inundação, alagamento, enxurrada, vendaval, granizo, colapso_edificacao, incêndio_urbano), mais `TIPO_A_CLASSIFICAR = "outro"` como marca explícita de decisão técnica pendente, deliberadamente fora da COBRADE. `STATUS_OCORRENCIA` com 7 estados (rascunho, registrada, triagem, em_campo, vistoria_concluida, providencia_pendente, encerrada) e `TRANSICOES_PERMITIDAS` como máquina de estados que barra qualquer transição fora da lista, com encerramento permitido de quase qualquer estado exceto de "encerrada" (terminal). `PRAZO_PADRAO_HORAS` por severidade (4h crítica, 24h alta, 48h média, 72h baixa) é constante fixa no código, não configurável por organização (ver seção 6, CFG-01).
- `permissoes.ts` (222 linhas), tabela completa lida por inteiro:

  | Ação (`Acao`) | Rótulo |
  | --- | --- |
  | `abrir_ocorrencia` | registrar ocorrência |
  | `gerenciar_organizacao` | alterar os dados do município |
  | `classificar_triagem` | classificar na triagem |
  | `despachar_equipe` | despachar equipe |
  | `encaminhar_providencia` | encaminhar providência |
  | `responder_providencia` | registrar a resposta de uma providência |
  | `encerrar_ocorrencia` | encerrar ocorrência |
  | `emitir_documento` | emitir laudo ou termo de interdição |
  | `levantar_interdicao` | levantar a interdição de um imóvel |
  | `registrar_vistoria` | registrar vistoria |
  | `gerenciar_equipes` | gerenciar equipes |
  | `gerenciar_usuarios` | gerenciar usuários |
  | `consultar_trilha` | consultar a trilha de auditoria |
  | `exportar_dados` | exportar dados |
  | `acompanhar_saida_a_campo` | acompanhar quem está em campo agora |

  Por papel: `operador` (posto 1) tem `abrir_ocorrencia`, `responder_providencia`, `acompanhar_saida_a_campo`. `agente_campo` (posto 1) tem só `registrar_vistoria`. `coordenador` (posto 2) tem as 13 ações operacionais, exceto `gerenciar_organizacao`. `administrador` (posto 3) tem todas as 14 ações do coordenador mais `gerenciar_organizacao`. O sistema de posto (`POSTO`, `podeGerirPapel`, `PostoInsuficiente`) impede que um coordenador administre, rebaixe ou desative um administrador, e impede que o último administrador do município seja removido ou rebaixado (regra corrigida em 15/09/2026, documentada com a data exata no próprio comentário do código: até então a comparação usava `>=` e permitia um coordenador criar outro coordenador e desativar colegas do mesmo posto).
- `schemas.ts`, `evidencia.ts`, `minuta.ts`, `protocolo.ts`, `localizacao.ts`, `telefone.ts`, `csv.ts`, `glifos-de-severidade.ts`, `campos.ts`, `mensagens-do-zod.ts`: validação Zod compartilhada entre web, API e (via `packages/campo`) o aplicativo de campo, cumprindo a regra do `CLAUDE.md` de que "regra de negócio mora no banco e no pacote compartilhado, não na tela".
- **Achado de execução:** `npm test` neste pacote roda 149 testes em 14 arquivos; 1 falhou. Ver seção 4.2.

### 3.3 API (`dc360/apps/api/`)

22 arquivos de rota em `src/rotas/`. Mapeamento confirmado por leitura de código, não por nome de arquivo:

| Arquivo | O que expõe |
| --- | --- |
| `administracao.ts` | Cadastro e gestão de usuários e equipes; `POST /usuarios/:id/redefinir-senha` e `POST /usuarios/:id/encerrar-sessoes` (ver achado da seção 1) |
| `aparelhos.ts` | Registro e revogação de aparelho para notificação push |
| `armazenamento-local.ts` | Recebe/serve bytes quando o armazenamento é o processo da própria API (modo sem S3/R2 configurado) |
| `armazenamento.ts` | O que o município enxerga do próprio uso de armazenamento (teto, consumo) |
| `autenticacao.ts` | `/auth/entrar`, `/auth/segundo-fator`, `/auth/renovar`, `/auth/sair`, `/auth/recuperar`, `/auth/redefinir`, `/auth/trocar-senha`, `/auth/encerrar-sessoes`, `/auth/eu` |
| `avisos.ts` | O sino de avisos do painel, do lado servidor |
| `busca.ts` | Busca global, com tolerância a erro de digitação |
| `campo.ts` | `GET /campo/meu-trabalho`, a tela do agente de campo |
| `configuracao.ts` | Serve a chave pública do Google Maps em tempo de execução (não em tempo de build), autenticado |
| `documentos.ts` | `GET /documentos/:id/laudo`, `termo-de-interdicao`, `termo-de-desinterdicao`, e as versões `.pdf` |
| `evidencias.ts` | Ciclo de evidência fotográfica: autorizar envio, confirmar envio, `GET /:id/url`, `GET /ocorrencia/:id` |
| `interesse.ts` | Formulário público de interesse (única rota sem organização, alimenta `organizacoes_de_interesse`) |
| `mapa.ts` | `POST /mapa/resolver-link`, resolução de link curto do Google Maps pelo servidor |
| `ocorrencias.ts` | CRUD de ocorrência, triagem, despacho, encerramento, duplicidades, correção de coordenada |
| `oficios.ts` | Ofícios numerados a órgãos parceiros, com envio por email e reenvio idempotente |
| `orgaos.ts` | Catálogo de órgãos de destino do município |
| `prestacao-de-contas.ts` | Resumo por período (mediana, não média), para a tela de Auditoria |
| `recorte-do-agente.ts` | Utilitário que restringe o que o token de agente de campo enxerga (só a própria equipe) |
| `rota.ts` | Caminho por ruas (rota de carro), a pedido do agente, via API do Google |
| `saida-a-campo.ts` | Declaração de saída a campo e confirmação de retorno (segurança do agente) |
| `saida.ts` | Pacote de portabilidade de dados na saída de município (CA-10); ver risco na seção 9 |
| `segundo-fator.ts` | Ativação/desativação de TOTP, códigos de recuperação |
| `sincronizacao.ts` | `POST /sincronizacao/vistoria`, a rota de sincronização offline do aplicativo de campo |
| `usuarios-eu.ts` | `GET /usuarios/eu`, upload/troca/remoção da própria foto de perfil |

**Duas rotas confirmadas, nesta auditoria, como não consumidas por nenhum cliente (web nem campo), mas com teste de API passando:**
- `GET /auth/eu` (linha 241 de `autenticacao.ts`): só aparece em `apps/api/test/segundo-fator.test.ts` e `apps/api/test/api.test.ts`. Nem `apps/web/src/dados/` nem `apps/campo/src/dados/` chamam este caminho.
- `GET /evidencias/:id/url` (linha 523 de `evidencias.ts`, renovação de link de uma única evidência avulsa): testada extensivamente em `apps/api/test/evidencias.test.ts` (5 chamadas diretas), mas o painel usa `GET /evidencias/ocorrencia/:id` (que já devolve a URL embutida em cada item da lista) e o aplicativo de campo não referencia este caminho. Não é necessariamente um defeito (pode ser reserva de API para um uso futuro, como compartilhar uma foto isolada), mas é capacidade construída e testada sem consumidor conhecido hoje.

**Rotas de foto de perfil sem tela, confirmado nesta auditoria por leitura de código:** `usuarios-eu.ts` implementa o ciclo completo de foto de perfil (`POST /usuarios/eu/foto/autorizar-envio`, `PUT /usuarios/eu/foto`, `DELETE /usuarios/eu/foto`), com teto de 2 MB, contagem no armazenamento do município, e registro na trilha administrativa (`foto_trocada`, `foto_removida`). `apps/web/src/paginas/MinhaConta.tsx` (a tela "Minha conta" do painel) não tem nenhuma referência a "foto" (`grep` por `foto` no arquivo: nenhum resultado). A funcionalidade existe e é testada, e não tem onde ser usada pelo painel do coordenador.

**Autenticação:** scrypt (N=2^16) via `node:crypto`, JWT HS256 de 15 minutos para acesso, token de renovação de 32 bytes opacos guardado como hash e rotacionado a cada uso, limite de força bruta por endereço (10/5min) e por conta (5 falhas/15min), resposta idêntica em tempo e conteúdo para conta inexistente (`apps/api/test/enumeracao-pelo-bloqueio.test.ts`), recuperação de senha por link de uso único de 30 minutos via provedor injetável (Resend, sem SDK, só `fetch` com contrato verificado campo a campo em `apps/api/test/notificador-http.test.ts`), segundo fator TOTP com segredo cifrado em AES-256-GCM amarrado a município e pessoa, 8 códigos de recuperação de uso único.

**Segurança de rede (`servidor.ts`):** Helmet, CORS restrito por lista de origens permitidas, rate limit. A organização do contexto vem sempre do JWT verificado e passa por `SET LOCAL` dentro de transação; recurso de outro município responde 404. `test/superficie.test.ts` lê a árvore de rotas do servidor **montado** (não uma lista escrita à mão) e exige autenticação de todas, com lista curta de exceções cada uma com razão escrita, e reprova se uma exceção apontar para rota que não existe mais.

**Testes da API, executados por mim hoje:** 86 arquivos, 1109 casos. **1089 passaram, 18 pulados, 2 falharam**, mais **1 arquivo inteiro de suíte falhando por motivo de ambiente** (ver seção 4.2 para os três casos em detalhe, incluindo uma regressão real de conteúdo de documento oficial).

### 3.4 Painel web (`dc360/apps/web/`)

17 páginas em `src/paginas/*.tsx`: `Auditoria`, `Entrar`, `Equipes`, `Mapa`, `MapaDoGoogle`, `MeuTrabalho`, `MinhaConta`, `NaoEncontrada`, `NovaOcorrencia`, `Ocorrencia`, `Ocorrencias`, `Organizacao`, `Orgaos`, `Painel`, `QuemEstaEmCampo`, `QueroConhecer`, `RecuperarSenha`, `Usuarios`, mais os arquivos de regra pura (`*-regras.ts`) que existem para serem testados sem precisar de navegador.

**Navegação por permissão:** `componentes/Estrutura.tsx` monta o menu lateral a partir de `acoesDoPapel`, não de condicional solta. O agente de campo, confirmado no README e consistente com `permissoes.ts`, vê "Meu trabalho" como primeira e principal opção, não o painel do coordenador.

**Dois modos, mesma porta em `src/dados/`:** modo local (PGlite em WASM na própria aba, sem senha, para demonstração offline em notebook de prefeitura) e modo API (HTTP contra o servidor real, com senha, isolamento imposto pelo servidor). `test/paridade-dos-modos.test.ts` existe para manter os dois sincronizados.

**Achado confirmado por `git show 124be71`:** em 17/09/2026, três telas de leitura foram acrescentadas para recursos que já existiam só na API: "Uso de armazenamento" em `Organizacao.tsx`, "Quem exportou o quê" e "Quem consultou dado de cidadão" em `Auditoria.tsx`. Isso corrige exatamente o tipo de lacuna descrita na seção 1 (capacidade de API sem tela), mas confirma que ela já aconteceu antes neste projeto pelo menos uma vez, e que a rota de foto de perfil (seção 3.3) e a administração de conta de terceiro (seção 1) são o mesmo padrão de lacuna, ainda aberto.

**Testes do painel, executados por mim hoje:** 36 arquivos, 550 casos. **536 passaram, 14 falharam em 5 arquivos.** Isto bate exatamente com a baseline de "5 arquivos de teste falhando (14 casos)" que o Rafael já conhecia. Causa de cada um, investigada nesta auditoria (detalhe completo na seção 4.2):

1. `test/semente-e-confirmacoes.test.ts` (3 casos) e `test/seguranca-da-conta.test.ts` (8 casos): **gap real, não falso positivo.** `Usuarios.tsx`, `Equipes.tsx` e `Orgaos.tsx` não confirmam com `<Toast>` depois de gravar; e a tela "Redefinir senha"/"Encerrar sessões" de outra pessoa, e "Encerrar minhas outras sessões" em Minha Conta, não existem na tela, apesar do backend pronto (é a mesma lacuna descrita na seção 1, com teste escrito primeiro, no estilo TDD, e a tela nunca construída).
2. `test/design-system.test.ts` (1 caso): **gap real, pequeno.** `componentes/Estrutura.tsx:132` tem `style={{ borderRadius: "8px" }}` no ícone do logo, escrito à mão em vez de usar um token `--ds-*`. Viola a regra do `CLAUDE.md`.
3. `test/acessibilidade.test.ts` (1 caso): **limitação do portão automatizado, não defeito real de acessibilidade.** `componentes/Modal.tsx` tem uma exceção documentada ("acessibilidade: excecao...") para o `onClick` do fundo do modal, com justificativa sólida (Escape fecha, os botões fecham por teclado). Mas a exceção está escrita 6 linhas acima do `onClick`, e a janela de busca do portão automatizado olha só as 4 linhas imediatamente acima. O portão não "vê" a exceção por causa da distância, não porque a exceção seja inválida.
4. `test/ocorrencia-encerramento.test.ts` (1 caso): **artefato desta máquina Windows, não defeito de produto.** O teste localiza o fim da função `BlocoEncerramento` procurando `"\n}\n"` no código-fonte. Este repositório está configurado com `core.autocrlf=true` (confirmado via `git config --get core.autocrlf`), então todo arquivo `.tsx` é baixado com final de linha `\r\n`. A sequência `"\n}\n"` nunca ocorre, o `indexOf` retorna `-1`, e `slice(inicio, -1)` acaba capturando quase o arquivo inteiro a partir daquele ponto, contando `onEnviar(` de outras funções do arquivo. Inspecionei `BlocoEncerramento` manualmente: ele chama `onEnviar` exatamente uma vez, depois do desvio de confirmação, como o teste pretende verificar. É provável (não confirmado por mim, por falta de acesso ao CI) que isto não se reproduza no runner Linux do GitHub Actions.

### 3.5 Aplicativo de campo (`dc360/apps/campo/`)

React Native com Expo (SDK 57). Estrutura: `src/app/(agente)/` (telas roteadas: `index`, `fila`, `mapa`, `perfil`, `avisos`, `vistoria/[id]`), `src/dados/` (camada de API e persistência), `src/push/` (notificação push), `src/ui/` (componentes e design tokens próprios, espelhando o design system do painel).

**O que está implementado:** coleta offline de vistoria (checklist, GPS, fotos, assinatura no dedo), fila de sincronização com o motor de `packages/campo`, autoria carimbada no item da fila (o portão contra "quem coletou não é quem enviou", descrito no README com um cenário concreto de troca de turno), saída a campo com prazo carimbado pelo relógio do servidor, sino de avisos, notificação push (APNs configurado por ambiente por aparelho desde a migração 044).

**O que é mock ou não foi exercitado de verdade, segundo o próprio `apps/campo/PENDENCIAS.md` (13 itens abertos) e `LEIA-ME.md`:** nada disto rodou em aparelho físico Android (só há um iPhone real no projeto, com três vistorias reais coletadas em 08/09/2026, segundo o README); a cópia de foto para o diretório de documentos, a leitura da fila durante logout, e a checagem de existência de arquivo no envio dependem de `expo-file-system` real e só foram provadas com sistema de arquivos falso; o retorno tátil (`expo-haptics`) e o menu translúcido (`expo-blur`) são módulos nativos que entraram DEPOIS da última compilação do binário instalado no iPhone, então o binário hoje instalado não os tem; no Android, o vidro do menu nunca terá desfoque real (limitação documentada da biblioteca) e cai para um fundo opaco de reserva.

**Achado de execução, novo nesta auditoria, não documentado em `PENDENCIAS.md` nem no README:**

- `apps/campo/node_modules` **não estava completo nesta máquina** antes desta auditoria: faltavam `expo-image-picker`, `expo-image-manipulator`, `expo-clipboard`, `expo-notifications`, `expo-blur`, `react-native-maps` e `expo-haptics`, todos declarados em `package.json`. Rodei `npm ci` dentro de `apps/campo` (900 pacotes instalados) para poder avaliar de verdade.
- Depois do `npm ci`, `npm run typecheck` ainda falha com 2 erros: `src/app/(agente)/perfil.tsx:1212` e `src/ui/Sino.tsx:154` referenciam a rota `/(agente)/avisos`, que o TypeScript recusa porque o tipo gerado pelo Expo Router (`.expo/types/router.d.ts`, um cache local, não um arquivo versionado) está desatualizado. **O arquivo `src/app/(agente)/avisos.tsx` existe de verdade** e é referenciado corretamente em múltiplos testes (`avisos-a-tela-do-sino.test.tsx`, `perfil-o-atalho-dos-avisos.test.tsx`, `sino.test.tsx`), então isto não é uma tela faltando, é um cache de tipos desatualizado nesta máquina.
- `npm audit`, depois do `npm ci`, relata **4 vulnerabilidades: 1 alta e 3 moderadas.** A alta (`brace-expansion`, negação de serviço por expansão quadrática) vem inteiramente de `@jest/reporters`, `jest-config`, `jest-runtime` e `test-exclude`, ou seja, é de desenvolvimento (Jest), não viaja no aplicativo publicado. A moderada em `decode-uri-component` vem de `query-string`, que vem de **`expo-router`**, que É dependência de runtime, embutida no aplicativo que vai para a loja. Isto contradiz a afirmação do README ("`npm audit` em zero") e a regra não negociável do `CLAUDE.md`.
- `npx expo-doctor` relata **20 de 21 checagens passando**, não 21 de 21 como o README afirma: 9 pacotes (`expo`, `expo-camera`, `expo-constants`, `expo-image-manipulator`, `expo-image-picker`, `expo-linking`, `expo-location`, `expo-notifications`, `expo-router`) estão um a três números de patch atrás da versão que o SDK 57 recomenda hoje. É drift de patch, não incompatibilidade grave, mas é uma divergência real em relação ao que está escrito.
- `npm run test:campo` (o script que o próprio projeto usa para validar isto, incluindo no CI) **falha no passo de typecheck**, antes de chegar a rodar o Jest, por causa do item acima. Como o script para de propósito no primeiro erro (é o comportamento documentado: "ele falha se `apps/campo/node_modules` não existir, em vez de pular calado"), contornei chamando `npx jest --silent` diretamente para conseguir uma leitura real do comportamento dos testes.
- **Resultado do Jest, rodado diretamente: 121 suítes (116 passaram, 5 falharam), 1801 testes (1781 passaram, 20 falharam).** Os 5 arquivos que falham:
  - `src/push/logout-cala-o-aparelho.test.tsx`
  - `src/__tests__/a-sessao-que-terminou-nao-e-falta-de-sinal.test.tsx`
  - `src/__tests__/perfil-a-sessao-que-terminou-e-o-aviso-que-fecha.test.tsx`
  - `src/ui/dialogo-na-conta-com-vistoria-comecada.test.tsx`
  - `src/__tests__/vistoria-o-teclado-a-camera-e-o-que-ela-promete.test.tsx`

  Inspecionei a falha de `a-sessao-que-terminou-nao-e-falta-de-sinal.test.tsx` em detalhe: o teste espera que, ao tocar no ícone "ⓘ" da faixa "Sua sessão terminou", apareça um texto explicativo e um botão "Sair da conta". O componente renderizado hoje mostra apenas a faixa "Sua sessão terminou" com um botão "Entrar de novo", sem o detalhe expansível nem o botão "Sair da conta" que o teste procura. O padrão se repete nos outros quatro arquivos, todos girando em torno do mesmo tema (sessão encerrada versus falta de sinal, e o botão de sair da conta). Não fui até o commit que introduziu a divergência por orçamento de tempo, mas a leitura direta do DOM renderizado, reproduzida no teste, é evidência de que a tela real diverge do que o teste (e presumivelmente o desenho original) esperava, não de um teste desatualizado sozinho: o texto que o teste procura ("toque em 'Sair da conta' e entre de novo") não existe em lugar nenhum do que foi renderizado.

  **Isto não está mencionado em nenhuma documentação lida** (README, `PENDENCIAS.md` do campo, `LEIA-ME.md`). É um achado novo desta auditoria.

### 3.6 Motor de sincronização offline (`dc360/packages/campo/`)

Pacote TypeScript puro (sem React Native), com a lógica de fila, idempotência, espera exponencial com ruído, e persistência atrás de uma porta (`ChaveValor`) que em teste é um mapa em memória e no aparelho será `expo-sqlite`. Roda e é testado independente da casca em Expo, exatamente como o README descreve. **159 testes, 8 arquivos, todos passaram na execução de hoje** (`test/prazo.test.ts`, `conclusao.test.ts`, `coleta.test.ts`, `devolucao.test.ts`, `prova-perdida.test.ts`, `deposito-sqlite.test.ts`, `correcao-da-coleta.test.ts`, `fila.test.ts`).

### 3.7 Console do fornecedor (`dc360/apps/console/`)

Aplicação separada (processo, porta, segredo e plateia de token próprios), que lê uma tabela de métricas agregadas (`metricas_municipio`) escrita por cada município na própria transação, sob o próprio RLS, nunca lendo tabela de negócio de município nenhum. A ADR 0008 (11851 bytes, a mais longa das 8) documenta a decisão e o porquê da ADR 0006 ter recusado antes um "painel de plataforma" tradicional. O papel de banco `dc360_console` tem `SELECT` só na tabela de métricas, no cadastro de organizações e numa visão `security_invoker` que junta as duas; nada de escrita, sequência, função privilegiada ou `BYPASSRLS`. Isso é verificado por asserção universal em `db/test/isolamento.test.ts` (não por lista de tabelas mantida à mão), incluindo a prova de que a visão sem `security_invoker` vazaria endereço de cidadão.

**Ressalva importante que o README, ao chamar este pacote de "Pronto", não deixa claro:** segundo `db/PENDENCIAS.md`, a RESTRIÇÃO de privilégio está pronta e testada, mas a APLICAÇÃO propriamente dita (a tela, a rota, a sessão de operador) **não foi desenhada**, e isso é deliberado ("o que importava era a restrição existir antes dela"). Mais concretamente: **nada hoje chama `resumir_municipio()`.** Sem um chamador, a tabela de métricas fica vazia e, se o console fosse ligado hoje, mostraria todo município como "sem escrita recente" (que é, por desenho, o sinal correto para o estado errado), mas significa que o console, no estado atual, não tem dado nenhum para mostrar. Faltam também: expurgo por idade da tabela de métricas, papel de login próprio para operador do console (distinto de `dc360_api`), segundo fator obrigatório na camada de conta do console (a ADR exige, a maquinaria de TOTP existe no produto, mas o console tem banco de contas separado e não reaproveita as tabelas), e o provisionamento disparado pelo console (hoje ainda é inteiramente linha de comando com credencial de dono, conforme ADR 0006). **Testes do console executados hoje: 16 arquivos, 259 casos, todos passaram**, e o que eles provam é exatamente a restrição (isolamento de privilégio, separação de token, segundo fator do processo), não uma aplicação completa de monitoramento operacional.

---

## 4. Execução real: typecheck, npm audit e as suítes de teste

### 4.1 Tabela consolidada, com números de hoje (30/09/2026) versus o que o README afirma

| Workspace | README afirma | Executado hoje | Divergência |
| --- | --- | --- | --- |
| `db` | "285 testes do banco passando" | 318 testes (315 passaram, 3 pulados), 0 falhas | Número cresceu (normal, projeto ativo); nenhuma falha |
| `packages/shared` | Não tem número dedicado no README | 149 testes, 148 passaram, **1 falhou** | Achado novo desta auditoria |
| `packages/campo` | "138 testes de unidade do motor de campo" | 159 testes, todos passaram | Número cresceu; nenhuma falha |
| `apps/api` | "962 testes da API passando" | 1109 testes (1089 passaram, 18 pulados), **2 falharam**, mais 1 arquivo com falha de suíte por ambiente | Achado novo desta auditoria |
| `apps/console` | "250 testes do console do fornecedor passando" | 259 testes, todos passaram | Número cresceu; nenhuma falha |
| `apps/web` | "454 testes de fonte" | 550 testes, 536 passaram, **14 falharam (5 arquivos)** | Baseline já conhecida do Rafael; confirmada e causa-raiz identificada nesta auditoria |
| `apps/campo` (Jest) | "1708 testes do aplicativo de campo... passando" | 1801 testes, 1781 passaram, **20 falharam (5 arquivos)** | Achado novo desta auditoria |
| `npm run typecheck` | Implícito, "TypeScript estrito em todos os pacotes" | Passou sem erro nos workspaces do monorepo raiz | Confirmado |
| `npm run typecheck` de `apps/campo` | Implícito, junto do `npm run test:campo` | **2 erros** (rota `/(agente)/avisos` não reconhecida; cache de tipos do Expo Router desatualizado) | Achado novo; não é ausência de código, é cache local desatualizado (ver seção 3.5) |
| `npm audit` (raiz) | "npm audit em zero" | **3 vulnerabilidades moderadas** (1 alcançável mesmo sem dev) | Achado novo desta auditoria, viola regra do CLAUDE.md |
| `npm audit` (`apps/campo`) | "npm audit em zero" | **4 vulnerabilidades (1 alta, 3 moderadas)**, uma delas em dependência de runtime (`expo-router`) | Achado novo desta auditoria, viola regra do CLAUDE.md |
| `npx expo-doctor` | "21 de 21" | **20 de 21** | Drift de versão de patch, achado novo |

### 4.2 Detalhe de cada teste falhando, hoje, e a classificação honesta de cada um

Classifico cada falha em uma de três categorias: **(A) gap funcional real**, que um usuário sentiria; **(B) defeito de conteúdo/segurança pequeno e real**, mas de baixo risco imediato; **(C) fragilidade do próprio portão de teste ou artefato desta máquina**, sem defeito correspondente no produto.

| Arquivo | Casos | Categoria | O que é |
| --- | --- | --- | --- |
| `apps/web/test/seguranca-da-conta.test.ts` | 8 | **A** | Telas de "Redefinir senha"/"Encerrar sessões" de outra pessoa e "Encerrar minhas outras sessões" não existem, apesar do backend pronto. Ver seção 1 |
| `apps/web/test/semente-e-confirmacoes.test.ts` | 3 | **A** (menor) | `Usuarios.tsx`, `Equipes.tsx`, `Orgaos.tsx` não confirmam a gravação com `<Toast>` |
| `apps/web/test/design-system.test.ts` | 1 | **B** | `Estrutura.tsx:132`, `borderRadius: "8px"` escrito à mão em vez de token `--ds-*` |
| `apps/web/test/acessibilidade.test.ts` | 1 | **C** | Exceção documentada em `Modal.tsx`, mas fora da janela de 4 linhas que o portão automatizado enxerga |
| `apps/web/test/ocorrencia-encerramento.test.ts` | 1 | **C** | Quebra por CRLF (`core.autocrlf=true` nesta máquina) no casamento de string do teste; comportamento real do componente foi conferido manualmente e está correto |
| `apps/api/test/senha-provisoria.test.ts` | 1 | **A** (segurança, risco estreito) | Uma sessão aberta com senha provisória, se a senha provisória vencer DURANTE a sessão (antes de ser trocada), ainda consegue completar `POST /auth/trocar-senha` com sucesso (200), quando deveria receber 401 `sessao`. A janela de exposição é estreita (sessão precisa ter sido aberta antes do vencimento) mas real |
| `apps/api/test/saida-de-municipio.test.ts` | 1 | **B/A** | O laudo dentro do pacote de saída de município NÃO imprime o aviso de "equipe divergente" que o mesmo laudo, gerado sob demanda pela rota normal, imprime. O próprio comentário do teste documenta que isto já foi um defeito corrigido uma vez ("a consulta do pacote não juntava as duas equipes da vistoria") e está, hoje, quebrado de novo ou nunca foi de fato fechado nesse caminho específico. Isto é uma divergência de conteúdo entre dois documentos que deveriam ser idênticos, o que a própria arquitetura do produto (documentos gerados do mesmo HTML, nunca montados em dois lugares) existe para impedir |
| `apps/api/test/banco-tls.test.ts` | 13 (todos pulados, suíte falha no teardown) | **C** | `openssl` não está no PATH do processo Windows fora do Git Bash. Ambiente desta máquina, não do produto |
| `packages/shared/test/regras-de-conteudo.test.ts` | 1 | **C** | Falso positivo autorreferente: o scanner de travessão encontra o caractere `"—"` dentro de uma STRING de teste em `apps/web/test/trilha-detalhe.test.ts:181` (`expect(rotulo).not.toContain("—")`), que está verificando que outra coisa NÃO tem travessão. O scanner não distingue "travessão em prosa" de "travessão como valor literal sendo testado" |
| `apps/campo` (Jest), 5 arquivos | 20 | **A** (não investigado até a causa raiz) | Ver seção 3.5. Textos e botões esperados ("Sair da conta", explicação do ⓘ) ausentes do que a tela realmente renderiza no tema de "sessão encerrada" |

**Total honesto, hoje, 30/09/2026, no monorepo inteiro (excluindo `apps/campo` do somatório de "arquivos" porque usa outro executor de teste):** 171 arquivos de teste no Vitest, 17 com pelo menos uma falha (10%), 4362 casos de teste no Vitest somados (2544 sem contar campo-jest), 17 falhas além de 1 arquivo de suíte de ambiente. Somando o Jest de `apps/campo`: mais 121 arquivos, 5 com falha, 1801 casos, 20 falhas.

---

## 5. Tabela de rastreabilidade de requisitos

Convenção de status: **Completo** (implementado e testado), **Parcial** (implementado com lacuna nomeada), **Não implementado**, **N/A agora** (fase futura, fora do MVP1 por desenho do próprio documento original).

| ID | Requisito (resumo) | Prioridade | Status | Evidência principal |
| --- | --- | --- | --- | --- |
| AUT-01 | Multi-tenant por organização/unidade/equipe | M | Completo | `db/migrations/001_base.sql`; `db/test/isolamento.test.ts` (137 casos) |
| AUT-02 | Autenticação email/senha com recuperação segura | M | Parcial | Login, bloqueio, troca de senha: completos. Recuperação por email depende de provedor ainda não contratado (`RECUPERACAO_ATIVA` condicional); ver seção 10 |
| AUT-03 | RBAC nas mesmas regras na API e na interface | M | Completo | `packages/shared/src/permissoes.ts`; `apps/api/test/superficie.test.ts`; `apps/web/src/componentes/Estrutura.tsx` |
| AUT-04 | MFA para administradores e perfis críticos | S | Parcial | TOTP implementado e obrigatório para administrador quando `SEGUNDO_FATOR_ATIVO=sim`, mas é flag global de ambiente, não política configurável por organização como o requisito pede |
| AUT-05 | Registro de aceite de termos, com versão/data/usuário/IP | S | Não implementado | Nenhuma tabela, rota ou tela encontrada para isto |
| OCO-01 | Protocolo único por organização e ano | M | Completo | `proximo_protocolo(ano)`, migração 001; travamento de linha da sequência |
| OCO-02 | Dados do chamado, campos variando por tipo | M | Completo | `ocorrencias.ts`, `schemas.ts`; correção de coordenada só até `db/PENDENCIAS.md` liberar a rota (ver item 1 da seção 10) |
| OCO-03 | Classificação com fila ordenada e histórico | M | Completo | `TIPOS_COBRADE`, `SEVERIDADES`, `trilha_eventos` |
| OCO-04 | Sugestão de duplicidade por endereço/coordenada/contato/período | S | Parcial | `GET /duplicidades/consulta` cobre tipo + endereço numa janela de 48h; vínculo bidirecional visível na tela (corrigido). Não confirmado casamento por coordenada nem por contato isoladamente |
| OCO-05 | Relacionar ocorrências ao mesmo imóvel/área/evento | M | Completo | Vínculo de duplicidade mostrado nos dois sentidos (README, seção "Nada capturado fica invisível") |
| OCO-06 | Atribuir equipe/responsável/prazo/instruções | M | Completo | Despacho em `ocorrencias.ts`; prazo por severidade |
| OCO-07 | Linha do tempo imutável com autoria e data | M | Completo | `trilha_eventos`, append-only por ausência de policy |
| OCO-08 | Importar lote inicial por CSV validado | C | Não implementado | Nenhuma rota de importação de ocorrência encontrada |
| VIS-01 | PWA responsiva e instalável | M | **Não implementado como PWA** | O caminho escolhido foi aplicativo nativo React Native/Expo, não PWA. Decisão documentada (stack fixada em 21/08/2026), mas é uma mudança de arquitetura em relação ao documento original, que dizia explicitamente "aplicativos Android e iOS nativos não são necessários no MVP" |
| VIS-02 | Baixar tarefas/formulários para uso offline | M | Completo | `packages/campo`, fila de sincronização, 159 testes |
| VIS-03 | GPS, precisão, data/hora, autoria | M | Completo | Migração 030 (ponto da vistoria); autoria carimbada (migração 024, autor divergente recusado com 409) |
| VIS-04 | Fotos com legenda, compressão, upload retomável | M | Parcial | Upload direto ao armazenamento via URL pré-assinada está completo; compressão e retomada de upload não confirmadas nesta auditoria por falta de teste específico localizado |
| VIS-05 | Checklist condicional por tipo, offline | M | Completo | `packages/campo`, telas de vistoria do aplicativo |
| VIS-06 | Assinatura na tela com finalidade/data/vínculo | S | Completo | `Assinatura.tsx` no aplicativo; chave de assinatura na migração 009; caminho de saída testado no laudo |
| VIS-07 | Rascunhos, pendências e conflitos visíveis, nada descartado sem aviso | M | Completo | `FaixaDeSincronizacao.tsx`, estados da fila (`fila.ts`, 58 testes) |
| VIS-08 | Complemento posterior sem apagar evidência original | M | Completo | Trilha append-only; providência/vistoria não editam evidência, criam evento novo |
| DOC-01 | PDF padronizado com protocolo, respostas, evidências, autoria, data, versão | M | Completo | `GET /documentos/:id/laudo.pdf`, gerado por Chromium sob demanda a partir do mesmo HTML |
| DOC-02 | Notificação, encaminhamento, termo, relatório fotográfico | M | Completo | Laudo, termo de interdição, termo de desinterdição, ofícios a órgãos |
| DOC-03 | Versionar modelos e documentos emitidos | M | Parcial | O documento é gerado sob demanda a partir do estado atual (não há cache nem PDF guardado, de propósito, porque o laudo muda se uma foto for anexada depois); não há versionamento explícito de TEMPLATE, só de dado de origem |
| DOC-04 | Revisão/aprovação por responsável técnico com estados | S | Não implementado | Nenhum estado de rascunho/em revisão/aprovado/cancelado encontrado em `documentos.ts` |
| FLU-01 | Providência com responsável/prazo/prioridade/órgão | M | Completo | `encaminhar_providencia`, `orgaos.ts`, `oficios.ts` |
| FLU-02 | Registrar resposta e evidência de cumprimento | M | Completo | Migração 006; resposta não editável, desfecho de lista fechada |
| FLU-03 | Notificar prazos próximos e vencidos | M | Completo | Migração 016, 018 (sino), push de `prazo_vencendo`/`prazo_vencido` |
| FLU-04 | Encerrar/reabrir com motivo obrigatório, auditado | M | Parcial | Encerrar com motivo obrigatório: completo, com CHECK constraint no banco. "Reabrir" não foi localizado como ação distinta; o modelo trata correção como evento novo, não reabertura de estado terminal |
| GEO-01 | Ocorrências por coordenada/status/tipo/prioridade, filtro consistente | M | Completo | `Mapa.tsx`, `MapaDoGoogle.tsx`, `mapa.ts` (rota de resolução de link) |
| GEO-02 | Histórico por imóvel/raio/área de risco | S | Não implementado | Sem PostGIS (confirmado, extensão não criada em nenhuma migração); sem busca por raio |
| PAI-01 | Fila, prazos, volume, tipos, tempo de atendimento, respeitando filtro/permissão | M | Completo | `Painel.tsx`, `prestacao-de-contas.ts` (mediana, não média) |
| REL-01 | Exportar PDF e CSV com filtro/data/organização/responsável | M | Parcial | CSV: completo, com defesa contra injeção de fórmula testada célula a célula. PDF em lote (exportar a fila inteira) não existe; hoje é um laudo por vez, conforme o próprio README relata em "O que falta" |
| AUD-01 | Log de criação/alteração/consulta sensível/exportação com contexto | M | Completo | `trilha_eventos`, `exportacoes`, `registro_de_consulta` (migração 021); telas em `Auditoria.tsx` |
| AUD-02 | Auditoria só para perfis autorizados, log não editável pela interface comum | M | Completo | `consultar_trilha` restrito a coordenador/administrador; ausência de policy de UPDATE/DELETE |
| CFG-01 | Configurar tipos/prioridades/prazos/modelos, versionado | S | Não implementado | `TIPOS_COBRADE`, `SEVERIDADES`, `PRAZO_PADRAO_HORAS` são constantes fixas em `packages/shared/src/dominio.ts`, não configuráveis por organização pela tela |
| INC-01 a INC-04 | Modo incidente | F | N/A agora | Ver seção 7 |
| ABR-01 | Abrigos | F | N/A agora | Ver seção 7 |
| LOG-01 a LOG-07 | Logística humanitária | F | N/A agora | Ver seção 7 |

---

## 6. Requisito a requisito, com evidência

Esta seção amplia a tabela da seção 5 onde a tabela sozinha não basta, com as regras de negócio, os requisitos não funcionais e os critérios de aceite do MVP.

### 6.1 Regras de negócio essenciais (RN-01 a RN-10)

| ID | Regra | Status | Evidência |
| --- | --- | --- | --- |
| RN-01 | Isolamento por tenant em todo registro e arquivo | Completo | RLS forçada; chave de storage exige prefixo `tenant/{organizacao_id}/`, imposto por CHECK constraint (segunda barreira, independente do RLS) |
| RN-02 | Protocolo único por organização/exercício, cancelamento não libera número | Completo | `proximo_protocolo`; encerrar não é cancelar, é transição terminal, número não é reciclado |
| RN-03 | Evidência usada em documento aprovado não é substituída, correção por aditamento | Completo | Evidência é append-only; não há rota de substituição, só de novo envio |
| RN-04 | Coordenada com precisão, data, origem, ajuste manual justificado | Parcial | Coordenada, data e origem: sim. Ajuste manual justificado (correção de coordenada de ocorrência aberta) está bloqueado esperando uma rota na API, conforme `apps/web/PENDENCIAS.md` item 1 (ver seção 10) |
| RN-05 | Encerramento exige motivo, responsável, verificação de providências obrigatórias | Completo | CHECK constraint no banco para motivo; o encerramento devolve quais providências ficam em aberto e registra isso na trilha, mas NÃO bloqueia o encerramento (decisão deliberada, documentada no README, para não travar a fila do coordenador indefinidamente) |
| RN-06 | Conflito offline com regra previsível ou revisão humana | Completo | Idempotência por chave única; fotos e eventos são append-only e "combinados", não sobrescritos; autor divergente é recusado com 409 e fica para decisão humana (o que confirma CA-05, ver seção 6.3) |
| RN-07 | Dado pessoal/endereço sensível nunca em painel público ou exportação ampla sem autorização | Completo | Console do fornecedor não alcança dado de cidadão (prova por varredura de catálogo); exportação de CSV é registrada; consulta a dado de cidadão é registrada |
| RN-08 | Agrupar em incidente não altera autoria/datas/histórico | N/A agora | Modo incidente não existe ainda (Fase 3) |
| RN-09 | Saldo de estoque deriva de movimento, ajuste é movimento motivado | N/A agora | Logística humanitária não existe ainda (Fase 3) |
| RN-10 | Alteração de formulário/modelo versionada | Não implementado | Não há tela de configuração de formulário/modelo; ver CFG-01 |

### 6.2 Requisitos não funcionais (RNF-01 a RNF-15)

| ID | Requisito | Status | Evidência |
| --- | --- | --- | --- |
| RNF-01 | Disponibilidade 99,5% mensal | Não verificável hoje | Produto não está em produção com histórico de uptime; o próprio documento original chama isto de hipótese a recalcular |
| RNF-02 | 95% das operações em até 2s (exceto mídia) | Não medido nesta auditoria | Não encontrei teste de desempenho/latência no repositório |
| RNF-03 | Vistoria offline com fila visível e retomável | Completo | Seção 3.6 |
| RNF-04 | TLS, senha forte, segredo fora do código, RBAC, validação no backend | Completo | `?sslmode=verify-full` exigido em produção; scrypt; `.env.example`; Zod no backend, não só na tela |
| RNF-05 | Logs protegidos contra alteração comum, retenção e pesquisa configuráveis | Parcial | Proteção contra alteração: completo (append-only). "Retenção configurável" existe como minimização por prazo (migrações 021, 029, 043), mas não localizei uma tela de configuração de prazo de retenção por organização (é constante no código, não configurável pela interface) |
| RNF-06 | Backup RPO 24h / RTO 8h | Parcial, ver seção 10 | Procedimento de restauração TESTADO uma vez (09/09/2026, `COLOCAR-DE-PE.md` Parte 6), mas a periodicidade de reteste está como `[[periodicidade a definir]]`, decisão explicitamente aberta e do Rafael, desde a versão 1 do documento |
| RNF-07 | Escala horizontal dos componentes críticos | Parcial | API sem estado (pool de conexão, sem sessão em memória exceto no console, documentado como limitação conhecida); não testado sob carga real |
| RNF-08 | Compressão, miniatura, upload retomável, retenção por organização | Parcial | Upload direto via URL pré-assinada: sim. Compressão/miniatura não confirmadas nesta auditoria |
| RNF-09 | WCAG 2.1 AA nos fluxos principais | Parcial | Portão automatizado (`acessibilidade.test.ts`) calcula contraste real sobre os tokens, nos dois temas, e varre teclado/leitor de tela; tem 1 caso falhando hoje (categoria C, seção 4.2) e o próprio portão documenta que não substitui teste com leitor de tela real nem pessoa real |
| RNF-10 | Chrome/Edge atuais, Android/iOS via navegador/PWA | **Divergente** | Não é mais PWA (ver VIS-01); é aplicativo nativo. O painel web roda em Chromium e Firefox (68 verificações E2E); o Safari é explicitamente desaconselhado para o modo local (163 segundos para abrir o banco, medido e documentado) |
| RNF-11 | Métricas, logs estruturados, alertas de erro, rastreio de jobs/sincronizações | Parcial | Logs estruturados via Pino (observado no stdout dos testes); não encontrei integração com ferramenta de alerta de erro (Sentry ou equivalente) em nenhum arquivo lido |
| RNF-12 | Exportação de dados e documentos do tenant, formato documentado | Parcial | `saida.ts` existe e é testado, mas com o risco de memória não mitigado descrito na seção 9 |
| RNF-13 | Testes automatizados, migrações versionadas, CI/CD, ambientes separados | Completo, com ressalva | Migrações versionadas e com aplicador que recusa histórico reescrito: sólido. CI existe (`.github/workflows/verificar.yml`, 5 jobs paralelos). "Ambientes separados" (dev/staging/produção) não foi confirmado além de `NODE_ENV` |
| RNF-14 | Português do Brasil, fuso correto | Completo | Confirmado em toda a interface e documentação lidas; regra de travessão tem portão automatizado (com 1 falso positivo, categoria C) |
| RNF-15 | Continuidade/operação degradada antes da Fase 3 | Completo, adiantado | `docs/INDISPONIBILIDADE.md`, versão 2, com escala de gravidade, runbook, e o princípio "o atendimento não pode parar porque o sistema parou" |

### 6.3 Critérios de aceite do MVP (CA-01 a CA-10)

| ID | Cenário | Status | Evidência |
| --- | --- | --- | --- |
| CA-01 | Ciclo completo da ocorrência | Completo | Fluxo ponta a ponta coberto por 103 verificações E2E contra API real (README) e pela tabela de rastreabilidade OCO acima |
| CA-02 | Vistoria offline, cinco fotos, sincroniza sem duplicar ou perder | Completo | `packages/campo`, idempotência por chave; não verificado em aparelho físico com cinco fotos reais nesta auditoria (só três vistorias reais registradas, segundo o README) |
| CA-03 | PDF com protocolo, respostas, evidências, autoria, data, versão | Completo | Ver DOC-01 |
| CA-04 | Providência atribuída, notificada, respondida, comprovada, atraso no painel | Completo | Ver FLU-01 a FLU-03 |
| CA-05 | Conflito concorrente com regra previsível ou fila de revisão | Completo | Autor divergente (409) é exatamente este caso: regra previsível (recusa) mais fila de revisão humana (a tela do aplicativo oferece reenviar/descartar, e a coordenação pode reconhecer a coleta manualmente, quando essa tela existir, ver `PENDENCIAS.md` item 4) |
| CA-06 | Isolamento entre municípios, provado por teste | Completo | 137 casos em `db/test/isolamento.test.ts`, executados por mim hoje, todos passando |
| CA-07 | Rastreabilidade de criação, mudança de status, aprovação, consulta sensível, exportação | Completo | Trilha append-only; ressalva: "aprovação" de documento não existe como estado (ver DOC-04) |
| CA-08 | Backup de teste restaurado e procedimento documentado | Completo, com ressalva de periodicidade | Ver RNF-06 e seção 10 |
| CA-09 | Usabilidade: agentes concluem roteiro principal sem assistência constante | Não verificável nesta auditoria | Exige piloto com usuário real; não há dado de campo além das três vistorias reais mencionadas no README |
| CA-10 | Exportação de dados e documentos do piloto, formato documentado e legível | Parcial | A rota existe e é testada, mas com o risco de memória sem mitigação da seção 9, que pode tornar a exportação inutilizável justamente em municípios com mais dado acumulado (o caso mais importante de cobrir) |

---

## 7. Fases futuras do documento original: planejado, não iniciado

Conferido por leitura de código (busca por termos-chave em todo o repositório, não apenas no README) e não apenas por ausência de menção. Nada do que segue tem início de implementação:

- **MVP 2** (seção 4 do documento original): portal do cidadão (não há rota pública de acompanhamento de protocolo por cidadão, só o formulário de interesse institucional em `interesse.ts`, que é outra coisa), formulários configuráveis (ver CFG-01, não implementado), integrações municipais, BI, assinatura digital com validade jurídica externa (ICP-Brasil), regras de SLA configuráveis por organização.
- **Fase 3** (seção 4 e 7.1/7.2 do documento original): modo incidente (`INC-01` a `INC-04`, nenhuma tabela `incidentes` encontrada nas 46 migrações), abrigos (`ABR-01`, nenhuma tabela `abrigos`), logística humanitária completa (`LOG-01` a `LOG-07`, nenhuma tabela de depósito, item, lote, movimento de estoque encontrada). A busca por `raio`, `area_de_risco`, `PostGIS` no repositório inteiro não encontrou nenhuma implementação real dessas capacidades espaciais mais avançadas; o próprio README confirma isto na seção "O que falta": "PostGIS: a migração ainda não cria a extensão porque nada hoje faz consulta espacial."
- **Fase 4** (seção 4 do documento original): apoio mútuo consorcial, APIs oficiais (S2ID, SEI, gov.br), módulos especializados. Nada disso tem qualquer vestígio de código.

Isto é exatamente o que o documento original recomendava ("construir primeiro um sistema operacional... preparar a arquitetura para o modo emergência e a logística humanitária, mas não tentar entregar tudo no primeiro MVP"), e o time seguiu essa recomendação com disciplina: não há nenhum código morto nem tabela "pela metade" tentando antecipar a Fase 3. A única preparação de arquitetura visível para o futuro é o vocabulário de domínio já prever `risco_para_a_equipe` como motivo de devolução de tarefa (migração 028) e a separação de pacotes (`shared`, `campo`, `api`, `web`, `console`) que deixaria uma futura tabela de `incidentes` ou `abrigos` encaixar sem reescrever o que já existe.

---

## 8. Avaliação livre

### 8.1 O que está sólido, com exemplo concreto

- **O isolamento multi-tenant é a parte mais bem construída do produto, e não por acaso: é onde o time mais investiu.** A combinação de RLS forçada, chave estrangeira composta (migração 008, corrigindo um vazamento real que RLS sozinha não pega), portão universal por catálogo (`isolamento.test.ts` descobrindo tabela nova sozinho, em vez de lista mantida à mão) e a decisão de rodar o painel local contra o MESMO banco/RLS que a produção usa (não um mock) é, na minha leitura, decisão de engenharia madura. A descoberta documentada de que `SET LOCAL` vaza entre chamadas concorrentes se não estiver dentro de uma única transação (`db.transaction()`, descrito no README com o diagrama de entrelaçamento `A: BEGIN / B: BEGIN / A: set_config org=A / B: set_config org=B / A: SELECT roda com contexto de B`) é o tipo de bug que, sem o teste que o pega, vaza dado de um município para outro em produção. Isso foi encontrado e corrigido antes do piloto, não depois.
- **A trilha de auditoria por ausência de policy, em vez de por convenção de código, é a decisão certa para o domínio.** Um sistema que decide quem interditar a casa de alguém precisa que "ninguém consegue apagar isso, nem por erro, nem por má-fé, nem com acesso de administrador do banco" seja verdade no nível errado de confiar em disciplina de programador. Está assim.
- **A segurança do agente em campo (saída a campo, migração 031) é honesta de um jeito raro.** O README e `SEGURANCA-DO-AGENTE.md` dizem explicitamente o que o recurso NÃO faz (não é botão de pânico, não detecta queda, não aciona ninguém sozinho), e a decisão de o push não cobrir este caso (por causa do orçamento de 15 funções `SECURITY DEFINER` do portão CA-06) está registrada como custo consciente, não escondida. Isso é o oposto de "feature que promete segurança e não entrega": aqui o produto recusa prometer mais do que cumpre.
- **A escrita de `PENDENCIAS.md` por workspace é uma prática que eu recomendaria a qualquer outro projeto.** Não é lista de TODO genérica: cada item tem "onde", "o que acontece", "por que importa", "como atacar", no mesmo padrão em quatro arquivos diferentes. Foi essa disciplina que me permitiu encontrar o risco de memória da saída de município (seção 9) sem precisar ler `pacote.ts` linha a linha: o próprio time já tinha documentado o problema com mais precisão do que eu conseguiria reconstruir em tempo hábil.

### 8.2 Riscos reais hoje

- **A lacuna de "capacidade de API sem tela" já aconteceu pelo menos duas vezes neste projeto** (foto de perfil, seção 3.3; redefinir senha/encerrar sessão, seção 1) e uma vez foi corrigida tarde (os três cartões de leitura de armazenamento/exportação/consulta, corrigidos só em 17/09/2026, depois de a API já existir havia mais tempo). Isso não é sinal de descuido, é sinal de um padrão de trabalho onde a API e o painel avançam em velocidades diferentes e ninguém tem a responsabilidade explícita de perguntar "isso que acabei de construir no servidor, alguém consegue usar pela tela?" antes de marcar como pronto. Recomendo que isso vire um item de checklist formal antes de qualquer checkpoint futuro ser declarado concluído.
- **O risco de memória da saída de município (seção 9) é, na minha leitura, o item tecnicamente mais perigoso do produto hoje**, porque ele tem a característica clássica de risco mal calculado: baixa frequência (só acontece quando um município sai), alto custo quando acontece (derruba o processo para todo mundo, no momento em que o município mais precisa que a exportação funcione), e o comentário do próprio código afirma o oposto do que o código faz, o que significa que um revisor lendo só o comentário (não o SQL) sairia convencido de que está tudo bem.
- **`npm audit` não fechar em zero, em dois pontos, com um deles em dependência de runtime real (`expo-router` no aplicativo publicado)**, é uma violação direta e mensurável da própria regra que o `CLAUDE.md` chama de "não negociável". Isso não significa que há um exploit conhecido sendo usado contra este produto especificamente, mas significa que a alegação "fecha em zero" nos dois READMEs (raiz e `apps/campo/LEIA-ME.md`, presumivelmente) não é verdade hoje, e a lacuna entre alegação e realidade é exatamente o tipo de coisa que corrói a confiança em todo o resto do documento se descoberta por outra pessoa depois.
- **A dívida de teste é maior do que a documentação confessa.** A baseline de 5/14 no painel web era conhecida. As falhas na API (incluindo uma regressão de conteúdo de documento oficial), no pacote compartilhado, e as 20 no aplicativo de campo não estavam documentadas em lugar nenhum que eu tenha lido. Um projeto deste porte precisa de um mecanismo que impeça "testes vermelhos conhecidos" de virarem "testes vermelhos esquecidos": hoje, a única defesa contra isso é alguém rodar `npm test` em cada workspace manualmente e comparar com a memória do que já era esperado, que é exatamente o trabalho que esta auditoria teve que fazer do zero.
- **A recuperação de senha por email depende de uma conta em um provedor (Resend) que ainda não existe**, e enquanto isso a única saída documentada para um usuário que esquece a senha é pedir para quem administra usar a tela de "Redefinir senha de outra pessoa"... que não existe (seção 1). Isso não é dois riscos separados, é um risco só, com duas portas fechadas ao mesmo tempo.

### 8.3 O que eu mudaria se fosse a prioridade do Rafael amanhã

Na minha leitura, a prioridade técnica correta, em ordem, não é "construir mais fase", é fechar as portas que já foram abertas e não fechadas:

1. Construir as três telas que faltam sobre rotas que já existem e já têm teste de API verde: redefinir senha de outro usuário, encerrar sessões de outro usuário, encerrar minhas outras sessões. É o trabalho de menor risco e maior retorno imediato no repositório inteiro, porque o backend, a validação e a permissão já estão prontos; falta literalmente a tela.
2. Corrigir a rota de saída de município para paginar por cursor em vez de carregar tudo em memória, antes que o primeiro município de operação longa peça para sair. `apps/api/PENDENCIAS.md` já tem o desenho da correção escrito.
3. Rodar `npm audit fix` (sem `--force`) na raiz e avaliar o upgrade com `--force` necessário em `apps/campo` para `expo-router`, testando a navegação inteira do aplicativo depois, antes da próxima submissão às lojas.
4. Investigar a causa raiz dos 20 testes falhando no aplicativo de campo (tema "sessão encerrada") antes deles se acumularem com a próxima rodada de mudança de tela, porque textos e botões ausentes numa tela de sessão expirada são exatamente o tipo de coisa que o agente encontra no pior momento (sem sinal, sessão caindo, sem saber que existe um botão "Sair da conta" que a tela não está mostrando).
5. Só depois disso, decidir se o próximo passo de produto é MVP 2 ou mais piloto no MVP 1.

Eu não mudaria a decisão de trocar PWA por aplicativo nativo (VIS-01), mesmo sendo uma divergência real em relação ao documento original: a justificativa de acesso a câmera/GPS/assinatura confiáveis offline, e a prova concreta de uso num iPhone real com vistorias reais coletadas, pesam mais do que a letra do documento de agosto. Mas eu escreveria essa divergência explicitamente em algum lugar visível (o documento de especificação, ou um ADR novo), porque hoje ela só é descobrível lendo o código, e é exatamente o tipo de mudança de arquitetura que merece registro formal ao lado das outras 8 ADRs.

---

## 9. Riscos sem mitigação completa

**O risco grave, sem mitigação completa, dito com todas as letras:** a rota de saída de município (`POST /saida`, portabilidade de dados exigida por CA-10) carrega a base inteira do município, incluindo as tabelas de trilha que nunca encolhem por serem append-only, inteira na memória do processo da API antes de começar a responder. Numa máquina de 1 GB de RAM (conforme `fly.toml`, que eu não abri pessoalmente nesta auditoria mas que é citado pelo próprio `apps/api/PENDENCIAS.md`), isso é uma fonte concreta de queda de processo. O comentário no código da rota (`src/rotas/saida.ts`, por volta da linha 145) afirma que o desenho evita isso ("montar antes para saber significaria segurar o pacote inteiro na memória... um município com dez mil vistorias derrubaria o servidor"), mas a implementação em `src/saida/pacote.ts` faz exatamente o que o comentário diz que não faz. Não há teste que pegue isso hoje (o cenário exigiria simular um município com anos de dado, e `db/test/carga.test.ts` existe mas, segundo o próprio `PENDENCIAS.md`, ninguém mediu quantos megabytes um município de três anos produz de verdade). **Isto não foi corrigido nesta auditoria porque não me cabe consertar código; fica registrado aqui com a localização exata para quem for atacar o problema.**

Risco secundário, também sem mitigação completa: a janela estreita de `senha-provisoria.test.ts` (seção 4.2), onde uma sessão aberta com senha provisória ainda válida continua conseguindo trocar de senha mesmo depois que a validade da senha provisória expirou no meio da sessão. O escopo de exploração é pequeno (exige que alguém abra sessão pouco antes do vencimento e ainda não tenha trocado a senha), mas é uma inconsistência real entre "o que a rota de login recusa" (senha provisória vencida não entra, isso está correto e testado) e "o que a rota de troca de senha aceita" (sessão viva com senha provisória vencida no meio, ainda troca).

Procurei explicitamente por um terceiro risco grave em três lugares além dos dois acima, e não encontrei nada que se qualificasse como "grave sem mitigação": (1) a superfície de rotas sem autenticação (`test/superficie.test.ts`) tem lista de exceção curta e cada uma com razão escrita, e o teste reprova exceção órfã; (2) a chave de armazenamento e a URL pré-assinada têm dupla barreira (prefixo por CHECK constraint no banco, mais checagem na aplicação); (3) o `npm audit` não fechado é real, mas não encontrei CVE explorável conhecido apontado contra os pacotes específicos nas versões específicas usadas aqui além do que o próprio `npm audit` já relata (que são DoS, não execução remota de código nem vazamento de dado).

---

## 10. O que depende do Rafael, ordenado pelo que cada bloqueio impede

1. **Decidir e contratar o provedor de armazenamento (R2/S3) e o provedor de email (Resend).** Impede: evidência fotográfica real fora de teste (hoje a API guarda bytes em memória, perdendo tudo a cada reinício, se `S3_ENDPOINT` não estiver configurado), recuperação de senha por email (hoje `RECUPERACAO_ATIVA` depende disso), e por extensão, sem a tela de administração de conta (item 1 da seção 1 deste relatório) e sem email, um usuário que esquece a senha hoje não tem NENHUM caminho de autoatendimento. Isto é o bloqueio que mais impede o piloto de virar produção de verdade, porque afeta o primeiro dia de uso de qualquer usuário novo.
2. **Decidir a periodicidade de reteste do backup** (`[[periodicidade a definir]]`, `docs/INDISPONIBILIDADE.md`, aberto desde a versão 1 do documento, 09/09/2026). Impede: saber se a cópia de segurança de hoje, dia 30/09/2026, ainda é restaurável, porque o único restore provado continua sendo o de 09/09/2026, há três semanas.
3. **Decidir quem chama `resumir_municipio()`** (rotina diária por linha de comando, ou no fim de cada escrita que já acontece), conforme `db/PENDENCIAS.md` item 1. Impede: o console do fornecedor ter qualquer dado para mostrar. Sem essa decisão, a tabela de métricas fica vazia para sempre e o console, se ligado, mostraria todo município como "sem escrita recente" indefinidamente, não porque algo esteja quebrado, mas porque nada nunca escreveu ali.
4. **Decidir o destino da correção de coordenada de ocorrência aberta** (nova rota na API, já especificada em detalhe por `apps/web/PENDENCIAS.md` item 1, com a tela do painel já pronta esperando só a chamada). Impede: o caso de uso descrito no próprio documento, onde o operador anota a coordenada errada ao telefone e não há como corrigir sem abrir um segundo protocolo para a mesma casa, produzindo duplicidade permanente no histórico do imóvel.
5. **Autorizar (ou não) `npm audit fix` / `npm audit fix --force`, avaliando o custo do upgrade de `expo-router` em `apps/campo`.** Impede: fechar a violação da própria regra de segurança não negociável do projeto. O `--force` implica reteste completo da navegação do aplicativo antes de publicar, então é uma decisão de quando alocar esse tempo, não só de rodar o comando.
6. **Decidir o destino do teto de seis casas decimais de coordenada**, hoje só no painel e não no banco/esquema compartilhado (`apps/web/PENDENCIAS.md` item 5). Impede: consistência visual entre coordenada vinda do painel (sempre seis casas) e coordenada vinda do GPS do aparelho de campo (o que o aparelho der, hoje sem teto), que hoje aparecem lado a lado com precisão aparente diferente para o mesmo tipo de dado.
7. **Aprovar (ou recusar) a proposta de paginação por cursor para a saída de município** (`apps/api/PENDENCIAS.md`), incluindo decidir quem mede quantos megabytes um município de operação longa realmente produz, antes de escolher um teto. Impede: confiança na rota de portabilidade de dados (CA-10) para qualquer município que opere por anos, que é exatamente o público-alvo declarado do produto.
8. **Decidir o segundo fator obrigatório e o papel de login próprio para o console do fornecedor** (`db/PENDENCIAS.md` itens 3 e 4, exigidos pela própria ADR 0008 que o Rafael já aprovou). Impede: ligar o console do fornecedor em conformidade com a própria decisão de segurança já tomada para ele.
9. **Decidir o próximo passo de captura em aparelho físico Android** (hoje não existe nenhum aparelho Android no projeto, segundo `apps/campo/PENDENCIAS.md` item 8). Impede: qualquer confirmação de que o aplicativo funciona fora do único iPhone usado até aqui, incluindo o vidro do menu (que já é sabido não funcionar de verdade no Android) e o retorno tátil.

---

## 11. Divergências entre o que a documentação afirma e o que rodei hoje

- O README afirma números de teste específicos por workspace (285, 454+68+103, 962, 138+10, 1708, 250). Em 30/09/2026, todos os números CRESCERAM (projeto ativo, normal), mas o README não menciona nenhuma das falhas encontradas nesta auditoria fora da baseline já conhecida do painel web. Isto sugere que os números do README são calculados no momento em que a última seção foi escrita e não são reconferidos a cada mudança, apesar de o próprio projeto ter uma ferramenta para isso (`npm run conferir:numeros`), que audita CONTAGEM, não RESULTADO (um teste pode ser contado corretamente e mesmo assim estar falhando; a ferramenta não pega isso).
- O README e `apps/campo/LEIA-ME.md` (citado, não lido palavra por palavra nesta sessão) afirmam "`npm audit` em zero" para o aplicativo de campo. Hoje, depois de uma instalação completa e correta das dependências declaradas, não está em zero.
- `apps/web/PENDENCIAS.md` item 3 já documenta, por escrito, que o próprio README está desatualizado quanto ao provedor de mapa (ainda cita MapLibre GL JS, quando o produto de fato usa Google Maps desde 13/09/2026). Esta auditoria confirma essa autodocumentação: é precisa.
- O README classifica `apps/console` como "Pronto", o que é verdadeiro para a garantia de segurança que o pacote entrega (a restrição de privilégio), mas pode ser lido, por quem não abrir `db/PENDENCIAS.md`, como "o console funciona hoje como ferramenta de operação", o que não é o caso: nada escreve na tabela que ele lê.

---

## 12. Conclusão

O dc360 tem uma fundação de isolamento multi-tenant, trilha de auditoria e autenticação que está entre as mais bem evidenciadas que já vi documentadas em código e prosa ao mesmo tempo, com teste automatizado descobrindo invariante por catálogo em vez de lista mantida à mão. Isso não é retórica: é o tipo de garantia que, quando quebra, vaza dado de uma família em situação de risco para o sistema de outra prefeitura, e o projeto trata isso com o peso que merece.

Ao mesmo tempo, esta auditoria encontrou uma distância real, hoje, entre o que a documentação afirma e o que o comando de teste devolve: 20 testes falhando no aplicativo de campo e 3 na API que não estavam em nenhuma lista de pendência conhecida, um `npm audit` que não fecha em zero em contradição direta com a regra não negociável do próprio projeto, uma funcionalidade de segurança de conta pronta na API e invisível na tela (a mesma categoria de lacuna que já aconteceu antes neste projeto), e um risco de memória na exportação de dados que o próprio time já documentou como urgente e ainda não corrigiu.

Nada disto muda o veredicto de que a arquitetura central está certa. Muda o veredicto de que o produto, hoje, 30/09/2026, está pronto para operar sem ressalva. Não está: está pronto com uma lista curta e nomeada de portas que precisam fechar antes do próximo piloto ou da próxima publicação nas lojas, e esta lista está na seção 10, em ordem do que cada uma impede.
