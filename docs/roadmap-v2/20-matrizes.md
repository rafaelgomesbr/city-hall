# Matrizes do Roadmap V2

Três matrizes de consulta: (A) capacidades por superfície, (B) autorização futura por ator, recurso e contexto, e (C) em qual gate cada fluxo ponta a ponta fica completo. Elas apontam para etapas e gates definidos nos arquivos de fase; em caso de divergência, vale o arquivo de fase.

Em 2026-10-01 a V2 foi ampliada (decisões D-07 a D-29 de `01-decisoes-e-principios.md`, seção 11) e passou a ter 36 fases. As fases novas F29 a F35 têm NÚMERO que não é a ORDEM de execução: vale a tabela de `STATUS.md`, seção 5, e de `02-mapa-de-dependencias.md`, seção 1B (F00 a F09 com a F32 logo depois da F08; F10 a F14; F33; F15 a F18; F34; F19; F29, F30, F31 e F35; F20 a F28). Quando uma célula abaixo diz "G34", leia "o gate da F34, que na ordem de execução vem antes do G19".

---

## A. Matriz das cinco superfícies

Legenda das células: **existe** = já existe e a V2 MANTÉM ou CORRIGE; **Fnn-Enn** = etapa que cria ou altera; **n/a** = não se aplica por decisão (o motivo está na nota); "-" = sem mudança na V2.

Nomes de tabelas e de arquivos marcados como novos são provisórios: o nome definitivo é fixado na etapa de migration correspondente.

As cinco superfícies: PREFEITURA = `apps/web`; CAMPO = `apps/campo`; CONSOLE = `apps/console`; PORTAL = `apps/portal` (novo); CIDADÃO = `apps/cidadao` (novo). BACKEND = `apps/api` e `packages/shared`; BANCO = `db/migrations`.

Desde 2026-10-01 todas as cinco superfícies tocam também os módulos novos (incidentes, abrigos, logística, integrações, território, configuração, canal ampliado, idiomas) e a identidade visual por município (logotipo, nome e uma cor de destaque, D-11). Eles aparecem na segunda parte da matriz.

### A.1 Base: identidade, acesso, dados e documentos

| CAPACIDADE | PREFEITURA | CAMPO | CONSOLE | PORTAL | CIDADÃO | BACKEND | BANCO | GATE |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Login | existe, F00-E13; escolha de município F03-E16 | existe | existe (TOTP obrigatório) | F11-E04 (dois passos: pessoa, depois município) | e-mail OTP F17-E04; gov.br, SMS, Google e Apple F34-E13, E15, E16, E17 | F03-E02, F03-E16, F15-E04, F34-E12 | `pessoas` (global) e `usuarios` (conta no município) F03-E15; `cidadaos` F15-E02; `cidadao_identidades` F15-E18 | G03, G11, G15, G34 |
| Sessão e refresh | existe; troca de município F03-E16 | existe | existe | F11-E04, F11-E23 | F15-E05 | auth/sessoes.ts | sessoes | G03, G15 |
| Vigência e revogação | F00-E04, F03-E03 | F00-E06 | n/a (token próprio) | F11-E04 | F15-E05, F15-E06 | auth/vigencia.ts, comTenant | sessoes, usuarios | G00, G03, G15 |
| MFA | F03-E11 (coordenador, administrador) | opcional, tela de código F14-E16 | existe (obrigatório) | F11-E05 | n/a (OTP por e-mail) | auth/segundo-fator.ts | pessoas | G03, G11, G14 |
| Recuperação de senha ou de acesso | F00-E10 | n/a (usa o painel) | existe (recuperação do console) | F11 reutiliza | n/a (sem senha) | auth/servico.ts | recuperacoes_senha | G00 |
| Convite de conta | F10-E03 (pessoa nova ou já existente) | n/a | existe (primeiro administrador; F20-E18 cria pessoa e vínculo) | F11-E06 | n/a | F03-E10 | convites (migration) | G03, G11, G20 |
| Sessões e conta do usuário | F00-E09, F10-E01, F10-E30 (minha atividade) | existe (Perfil) | - | F11-E19 | F17-E12 | rotas/usuarios-eu.ts, F03-E20 | sessoes | G00, G03, G10 |
| Autorização por papel e ação | existe, F03-E12 | n/a (só vistoria, incidente e estoque pelas ações do agente) | n/a (operador do console) | F03-E12, F04-E08 | F15-E06 | manifesto rota x ação; ações novas de F29 a F35 | RLS, domínio de papel | G03, G04, G29, G30 |
| Isolamento por município | MANTER | MANTER | MANTER (n/a lê dado) | MANTER | MANTER (via realm) | comTenant | RLS forçada | G00 a G35 |
| Isolamento por órgão | vê tudo do município | n/a | n/a | F04-E05, F11-E09 | n/a | F04-E08 | F04-E05, F04-E06 | G04, G11 |
| Pessoa global e troca de município | seletor F10-E01 | n/a | n/a | F11-E23, F11-E29 (caixa e sino de todos os municípios) | n/a | F03-E16, F03-E18 | `pessoas`, `usuarios.pessoa_id` | G03, G11 |
| Órgão externo (concessionária, órgão estadual, bombeiros) | F10-E02, F10-E03 | n/a | n/a | F11-E24 | n/a | F03-E17 | `orgaos.tipo`, `orgaos.externo`, `orgao_vinculos` | G03, G11, G12 |
| Escalonamento e competência do órgão | F10-E06, F10-E17, F10-E18, F10-E19 | n/a | n/a | F11-E28 | n/a | F04-E15, F04-E16, F32-E10 | competências, cadeia de escalonamento | G04, G10, G11, G32 |
| Isolamento do cidadão ("só o meu") | n/a | n/a | n/a | n/a | F15-E06 | F15-E03 | policy por ator | G15 |
| Nível de sigilo da ocorrência | F10-E31 | n/a (equipe vê o que é dela) | n/a | n/a (órgão não consulta ocorrência) | n/a | F03-E21 | `ocorrencias.sigilo` | G03, G10 |
| Encaminhamento ao órgão | F10-E04 a E06, F10-E14, F10-E34 | n/a | n/a | F11-E09 a E16 | n/a | F04-E08 | providencias expandida (F04-E02) | G04, G10, G11 |
| Dossiê mínimo | F04-E04, F10-E04 | n/a (só reinspeção, F13-E05) | n/a | F11-E10 | n/a | F04-E04 | dossies (snapshot) | G04, G12 |
| Relato do cidadão | F18 (triagem) | n/a (só após conversão, F19) | n/a | n/a | F17-E06 a E12 | F16 | relatos e eventos | G16, G17, G18 |
| CPF do cidadão (obrigatório no relato identificado) | F18-E13 (máscara e revelação com finalidade) | n/a (nunca desce ao aparelho) | n/a | n/a | F17-E20, F34-E17 | F05-E13, F05-E14, F15-E16, F16-E16 | CPF cifrado e hash | G05, G15, G18, G34 |
| Reinspeção e reabertura | F13-E04, F13-E10 | F14-E09 | n/a | n/a (vê resultado no histórico) | n/a | F13-E03, F13-E06, F13-E09 | rodada de vistoria (F13-E02) | G13, G14 |
| Vistoria de campo | acompanha | existe (MANTER motor offline) | n/a | n/a | n/a | rotas/campo, sincronizacao | vistorias, evidencias | G00, G14 |
| Arquivos e anexos | F10 (documentos), F06-E12, F10-E29 (anexo da prefeitura) | existe (foto de evidência), F14-E22 | n/a | F11-E13 | F17-E07 | F06, F07-E04, F06-E17 | arquivos e vínculos | G06, G07 |
| Notificação por push | sino existente | F14-E05 | n/a | sino F11-E17 | F17-E13 | push/ | aparelhos multiaplicativo | G14, G17 |
| Notificação por e-mail | recuperação F00-E10 | n/a | n/a | F11-E17 | OTP F15-E04, F15-E14 | auth/notificador.ts | - | G00, G11, G15 |
| Documento oficial (laudo, termo, notificação, relatório fotográfico) | F09, F10-E07, F10-E33, F10-E36 | prévia da minuta (existe) | n/a | n/a (secretaria não emite na V2) | n/a | F09-E02 a E11, F09-E16 a E18 | documentos_emitidos | G09 |
| Aprovação autenticada | F09-E06, F09-E07 | n/a | n/a | n/a | n/a | F09-E07 | aprovacoes | G09 |
| Assinatura por provedor externo (avançada, ICP-Brasil) | F10-E32, F10-E35 | n/a | n/a | n/a | n/a | F09-E19 a E28 | solicitações e artefato assinado (F09-E21, E24) | G09, G10 |
| Offline | n/a | existe (motor MANTIDO), F14; módulos novos na fila: F29-E13, F30-E14, F33-E07 | n/a | n/a | rascunho local F17-E08 | sincronizacao | - | G14, G17, G29, G30, G33 |
| Acessibilidade | F10-E11 | F14-E10 | existe (a reforçar F08-E06) | F11-E21 | F17-E15 | n/a | n/a | G08, G10, G11, G14, G17, G23 |
| Exportação (saída do município) | F00-E11, F10-E08, F10-E25 (relatório com cabeçalho) | n/a | n/a | n/a | n/a | saida/pacote.ts, F09-E11 | manifesto (F05-E05); tabelas dos módulos novos entram: F29-E16, F30-E17, F31-E19, F32-E15, F33-E16, F34-E19 | G00, G05, G09, G28 |
| Eliminação do município | n/a | n/a | F20-E04, F20-E17 (livro de eliminações) | n/a | n/a | eliminacao/relogio.ts | manifesto (F05-E05) | G05, G20, G28 |
| LGPD: aceite e política | F05-E06, F05-E07 | n/a | n/a | F05-E06 | F17-E14 | F05 | aceites versionados | G05, G15 |
| LGPD: pedidos de titular | fila do município F05-E08 | n/a | executa operação técnica sob instrução (F20-E09) | n/a | pedido pelo app (F17-E19) | F05-E08 | pedidos_titular | G05, G15 |
| Auditoria e trilha | existe (consulta); F03-E20 (login, saída e falha na trilha) | n/a | F20-E05 (auditoria própria); F20-E16 (prefeitura lê os atos do fornecedor) | histórico F11-E16 | etapas públicas F17-E10 | trilha.ts | trilha append-only | G03, G04, G20 |
| Observabilidade, tracing e SLO | F10-E10 | crash F14-E07 | F21-E05, painel de SLO F21-E14 | F11-E20 | crash F17-E16 | F01-E14, F21-E10 a E13 | n/a | G01, G21 |
| Versão mínima e compatibilidade | n/a (web) | F14-E08 | n/a | n/a (web) | F15-E12 | F02-E06 | n/a | G02, G14 |
| Idempotência | F02-E07 | fila (existe) | n/a | F11 | F17-E08 | F02-E07 | UNIQUE de criação | G02 |
| Provisionamento de município | n/a | n/a | existe, F20-E18 | n/a | n/a | provisionar.ts | organizacoes | G20 |
| Mapa e geografia | existe (mapa); filtros F10-E23 | existe (mapa); mapa offline F14-E21 | n/a | n/a | F17-E06 | F16-E05, F16-E06, F32-E03 | codigo_ibge, malha municipal comum | G16, G32 |
| Busca | existe | n/a | n/a | F11-E18 (só o órgão) | n/a | F04-E09 | índices existentes | G04, G11 |
| Foto de perfil | F10-E09 (CP-18) | existe | n/a | n/a | n/a | rotas/usuarios-eu.ts | - | G10 |
| Painel e portal instaláveis (PWA), sem offline | F10-E15 | n/a (app nativo) | n/a | F11-E26 | n/a (app nativo) | n/a | n/a | G10, G11, G23 |
| Suporte assistido do fornecedor (somente leitura) | F10-E16 (o administrador libera e revoga) | n/a | F20-E11 (leitura só com concessão vigente) | n/a | n/a | F10-E16, F20-E11 | `suporte_concessoes` | G10, G20, G25 |
| Contrato e demonstrativo por município | n/a | n/a | F20-E14 | n/a | n/a | rotas do console | contratos_de_municipio | G20 |
| Ciclo de vida do operador do console | n/a | n/a | F20-E12, F20-E13 | n/a | n/a | rotas do console | console_operadores | G20 |

### A.2 Módulos novos de 2026-10-01 (F29 a F35)

| CAPACIDADE | PREFEITURA | CAMPO | CONSOLE | PORTAL | CIDADÃO | BACKEND | BANCO | GATE |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Incidente (agrupar ocorrências sem alterá-las, quadro, equipes, turnos, tarefas, presença) | F29-E10, F29-E11 | F29-E13, F29-E14 | métricas agregadas (F20-E07) | n/a | n/a | F29-E03 a E08 | incidentes e vínculos (F29-E02) | G29 |
| Abrigo (local, ocupação, necessidades; só contagens) | F29-E12 (inclui camada no mapa) | F29-E14 (ocupação pela fila) | métricas agregadas (F20-E07) | n/a | n/a | F29-E09 | `locais`, ocupação (F29-E09) | G29 |
| Relatório de situação | F29-E15 | n/a | n/a | n/a | n/a | F29-E15 | documento imutável (F09) | G29 |
| Logística: depósitos, itens, lotes, razão de movimentos e saldo | F30-E12 | F30-E14, F30-E15 | métricas agregadas (F20-E07) | n/a | n/a | F30-E02 a E07 | `estoque_movimentos`, view de saldo (F30-E04) | G30 |
| Necessidades, doações, cargas, entregas, kits e alertas | F30-E13 | F30-E15 (entrega com assinatura, contagem) | n/a | n/a | n/a | F30-E08 a E11, F30-E16 | F30-E08 a E10 | G30 |
| Território: raio, imóvel, área de risco, competência por área | F32-E11, F32-E12 | F32-E13 (contexto guardado para uso sem sinal) | `console_definir_codigo_ibge` (F32-E03) | n/a | resolução do município no relato (F16-E05) | F32-E04 a E10 | PostGIS, áreas, imóvel (F32-E02 a E07) | G32 |
| Configuração versionada (tipos, severidades, prazos, formulário de abertura, textos de modelo) | F33-E11 | cache da versão (F33-E07) | n/a | n/a | n/a | F33-E03, E04, E09, E10 | versões imutáveis (F33-E02) | G33 |
| Checklist por tipo com perguntas condicionais | n/a | F33-E07, F33-E08 | n/a | n/a | n/a | F33-E05, F33-E06 | F33-E05 | G33 |
| Importação de lote por CSV | F33-E15 | n/a | n/a | n/a | n/a | F33-E12 a E14 | lote e linhas (F33-E13) | G33 |
| Integrações: WhatsApp oficial, camadas GeoJSON, KML e WMS, Cemaden, S2ID, SEI, Defesa Civil Alerta | F31-E18 (tela), F31-E13 (camadas no mapa), consentimento F31-E08 | n/a (camada GIS no aparelho está fora) | F31-E18 (liberar e ler, sem segredo) | consentimento F31-E08 | n/a | F31-E02 a E17 | `integracoes_municipio` (F31-E03), trilha (F31-E04) | G31 |
| Vídeo do relato (30 s, 50 MB, um por relato) | F34-E09 (reprodução por URL assinada), F34-E10 | n/a (nunca desce) | n/a | n/a | F34-E03, F34-E04 | F06-E18 a E21, F07-E10, F34-E02 | arquivos, classe `video_cidadao` | G06, G07, G34 |
| Conversa por relato (sem tempo real) | F34-E09, F34-E10 | n/a (nunca desce) | n/a | n/a | F34-E08 | F34-E05 a E07 | relato_mensagens ampliada (F34-E05) | G34 |
| Idiomas pt-BR, en e es | F35-E11 | F35-E11 | F35 só nos textos atuais | F11-E27 | F17-E15 | F08-E08, F08-E09, F35-E09, F35-E10 | preferência de idioma (F35-E09) | G08, G35 |
| VLibras | F35-E12 | F35-E12 | n/a | F11-E30 | F17-E15, F35-E12 | F08-E12 | n/a | G08, G23, G35 |
| Identidade visual por município (logotipo, nome, uma cor de destaque com contraste AA) | F35-E04 (tela), F35-E05 | F35-E06 (inclusive offline) | F35-E13 (restaurar o tema DC360 por suporte) | F11-E07, F35-E05 | F35-E07 | F08-E10, F08-E11, F35-E02, F35-E03, F35-E08 (cabeçalho do documento) | colunas em `organizacoes` (F35-E02) | G08, G35 |

---

## B. Matriz de autorização futura

**Princípio:** o padrão é NEGADO. Uma ação só é permitida quando existe regra explícita para o ator naquele recurso, dentro do tenant e, quando aplicável, do órgão. O modelo que a V2 completa nas fases F03 e F04 é este, estendido pelas fases F29 a F35.

### B.1 Atores

Desde a D-08 (que revogou D-02 e A-01) a identidade é a PESSOA GLOBAL (`pessoas`: uma credencial, um segundo fator) com uma CONTA em cada município (`usuarios`: papel, equipe e situação da conta) e, para o órgão, um vínculo temporal por município (`orgao_vinculos`). O token vale para UM município por vez, a pessoa escolhe o município ao entrar (F03-E16) e troca de município com token e sessão novos. `pessoas` não tem `organizacao_id`: é exceção nomeada ao isolamento, sem grant ao papel da aplicação, lida só por funções SECURITY DEFINER da lista nominal (F03-E01, F03-E15).

| Ator | Identidade e realm | Audiência do token | Origem do papel | MFA |
| --- | --- | --- | --- | --- |
| administrador | pessoa global com conta em `usuarios` do município | `dc360` | `usuarios.papel` da conta lido do banco por requisição | obrigatório (F03-E11) |
| coordenador | pessoa global com conta no município | `dc360` | idem | obrigatório (F03-E11) |
| operador | pessoa global com conta no município | `dc360` | idem | opcional |
| agente_campo | pessoa global com conta no município | `dc360` | idem; recorte por equipe lido do banco | opcional, com tela de código no app (F14-E16, D-27) |
| gestor_orgao | pessoa global com conta `usuario_orgao` e vínculo | `dc360-portal` | `orgao_vinculos` (papel no órgão) lido do banco | obrigatório |
| executor_orgao | idem | `dc360-portal` | `orgao_vinculos` | obrigatório |
| leitor_orgao | idem | `dc360-portal` | `orgao_vinculos` | obrigatório |
| órgão externo (concessionária, órgão estadual, bombeiros) | os mesmos três papéis de órgão; o órgão tem `orgaos.externo` e a MESMA pessoa pode ter contas e vínculos em vários municípios, cada um convidado pelo próprio município (F03-E17) | `dc360-portal` | `orgao_vinculos` de cada município, com termo aceito | obrigatório; troca de município pede novo código? Depende de CP-50 |
| cidadao | realm separado (`cidadaos`, `cidadao_identidades`); entra por e-mail OTP, gov.br, SMS, Google ou Apple (F34-E12); CPF obrigatório no relato identificado | `dc360-cidadao` | fixo (um papel), `cidadao_id` do token | e-mail OTP no login |
| operador_console | tabela própria do console (ciclo de vida: F20-E12) | `dc360-console` | tabela de operadores do console | obrigatório (TOTP) |
| suporte assistido do fornecedor | o operador do console com UMA concessão vigente do administrador do município (F10-E16, F20-E11); não é papel do município | `dc360-console` | `suporte_concessoes` (nominal, curta, por exemplo 2 horas, revogável) | TOTP de menos de 15 minutos no ato |

Os três papéis de órgão são valores de "papel no órgão" na tabela `orgao_vinculos`; no domínio de papéis do banco entram como um único papel genérico `usuario_orgao` (F03-E04), sem papel por secretaria. O JWT carrega só `sub` (a pessoa), `org` (o município ativo), `sid`, `aud`, `exp`: papel, vínculo, órgão, equipe e situação da conta são relidos do banco na mesma transação (F03-E02, F03-E03).

**Papéis de incidente e de logística.** A F29 e a F30 NÃO criam papel novo: acrescentam ações ao manifesto e as atribuem aos quatro papéis atuais (os quatro papéis atuais não mudam). A atribuição abaixo é a PROPOSTA que libera o desenvolvimento; produção fica bloqueada até CP-63 (e CP-62) decidirem se haverá papel próprio, quem comanda e quem opera abrigo e depósito.

### B.2 Dimensões avaliadas em toda requisição

`ATOR` (quem, do token verificado: pessoa e conta no município ativo) + `RECURSO` + `AÇÃO` + `TENANT` (organização do token, nunca de parâmetro, cabeçalho ou corpo) + `ÓRGÃO` (vem da rota e é validado contra o vínculo vivo do banco; o órgão é contexto dentro do tenant, não é tenant) + `CONTEXTO` (estado do recurso, atribuição, prazo, canal habilitado, cota, vigência da conta, nível de sigilo, concessão de suporte, vínculo com o local).

### B.3 Matriz (S permite, N nega, C permite sob condição; qualquer célula não prevista é N)

Ações existentes vêm de `packages/shared/src/permissoes.ts` (15 ações). Ações marcadas com (nova) são declaradas no manifesto rota x ação da F03-E12 e criadas na etapa indicada.

| Recurso e ação | administrador | coordenador | operador | agente_campo | gestor_orgao | executor_orgao | leitor_orgao | cidadao | operador_console |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Pessoa: escolher e trocar de município (F03-E16) | C (só município da própria lista de contas ativas; segundo fator conforme o papel da conta) | C (idem) | C (idem) | C (idem) | C (idem) | C (idem) | C (idem) | N | N |
| Ocorrência: registrar (`abrir_ocorrencia`) | S | S | S | N | N | N | N | N | N |
| Ocorrência: ler lista e detalhe | S | S | S | C (só tarefas da equipe) | N (nunca consulta `ocorrencias`) | N | N | N | N |
| Ocorrência: ler com nível de sigilo `restrito` (nova, F03-E21) | S | S | C (só a que ele abriu) | C (a equipe da tarefa) | N | N | N | N | N |
| Ocorrência: classificar e despachar (`classificar_triagem`, `despachar_equipe`) | S | S | N | N | N | N | N | N | N |
| Ocorrência: encerrar (`encerrar_ocorrencia`) | S | S | N | N | N | N | N | N | N |
| Ocorrência: reabrir dentro do prazo do município, 30 dias por padrão (`reabrir_ocorrencia`, F13-E06); depois disso, só ocorrência vinculada (F13-E09) | S | S | N | N | N | N | N | N | N |
| Interdição: levantar (`levantar_interdicao`) | S | S | N | N | N | N | N | N | N |
| Vistoria e evidência: registrar (`registrar_vistoria`) | N | N | N | C (tarefa da equipe, vigência ativa) | N | N | N | N | N |
| Rodada de reinspeção: determinar (`determinar_reinspecao`, F13-E01) | S | S | N | N | N | N | N | N | N |
| Encaminhamento: criar e compor dossiê (`encaminhar_providencia`) | S | S | N | N | N | N | N | N | N |
| Encaminhamento: ler (nova, F04-E08) | S | S | C (acompanha) | N | C (do próprio órgão) | C (do próprio órgão ou atribuído, CP-20) | C (do próprio órgão) | N | N |
| Encaminhamento: aceitar (nova, criada em F04-E08, usada em F11-E11) | N | N | N | N | C (órgão do vínculo) | C (órgão do vínculo) | N | N | N |
| Encaminhamento: responder com anexos (nova, criada em F04-E08, usada em F11-E13) | N | N | N | N | C | C (atribuído, CP-20) | N | N | N |
| Encaminhamento: devolver com destino sugerido, só ANTES do aceite (D-23; nova, criada em F04-E08, usada em F11-E15) | N | N | N | N | C | C | N | N | N |
| Encaminhamento: pedir esclarecimento à DC (nova, criada em F04-E08, usada em F11-E14) | N | N | N | N | C | C | N | N | N |
| Encaminhamento: analisar, concluir, pedir complemento, reencaminhar, cobrar e escalar (nova, criada em F04-E08, usada em F10-E05 e F10-E06) | S | S | N | N | N | N | N | N | N |
| Encaminhamento: registrar resposta em nome do órgão (`responder_providencia`) | S | S | C (órgão sem conta, enquanto CP-22 não desligar o ofício por link) | N | N | N | N | N | N |
| Escalonamento: configurar a cadeia acima do gestor do órgão (F04-E16, F10-E18; `gerenciar_organizacao`) | S | N | N | N | N | N | N | N | N |
| Competência do órgão por COBRADE e território: declarar (`gerenciar_equipes`, F04-E15, F10-E17) | S | S | N | N | N | N | N | N | N |
| Dossiê mínimo: ler | S | S | S | N | C (do encaminhamento do órgão) | C | C | N | N |
| Documento emitido: emitir e aprovar (`emitir_documento`, aprovação F09-E07; `revisar_documento`, `aprovar_documento`, `cancelar_documento`) | S | S | N | N | N | N | N | N | N |
| Documento emitido: ler e baixar | S | S | C (conforme política) | N | N | N | N | N | N |
| Documento emitido: pedir assinatura ao provedor externo (`solicitar_assinatura`, F09-E22; TOTP no ato) | S | S | N | N | N | N | N | N | N |
| Relato: criar, complementar e cancelar o próprio (nova, F17) | N | N | N | N | N | N | N | C (conta verificada, CPF, canal habilitado, cota) | N |
| Relato: ler o próprio e o andamento público (nova, F16-E09) | N | N | N | N | N | N | N | C (só o dele, lista de inclusão) | N |
| Relato: triar, vincular, rejeitar, converter (`triar_relato`, F18) | S | S | C (assumir e classificar, se a política permitir) | N | N | N | N | N | N |
| Relato: nota interna (`anotar_relato`, F18-E08) | S | S | C | N | N | N | N | N (nunca vê) | N |
| Relato: ver o CPF do solicitante (`ver_cpf`, finalidade escrita de 20 caracteres ou mais, acesso gravado) | S | S | N | N | N | N | N | N | N |
| Relato: ver o vídeo (`ver_video_de_relato`, URL assinada e registrada, F06-E20, F34-E09) | S | S | N | N | N | N | N | N | N |
| Relato: conversar com o cidadão (`conversar_com_cidadao`, F34-E07) | S | S | C (só se CP-28 definir) | N | N | N | N | C (responder só no próprio relato, com ritmo imposto no banco) | N |
| Relato: moderar vídeo e conversa, ocultar, encerrar e remover com motivo (`moderar_conversa`, F34-E10) | S | S | N | N | N | N | N | N | N |
| Conta de cidadão: bloquear (nova, F15-E11) | S | S | N | N | N | N | N | N | N |
| Canal do cidadão: habilitar, e ligar vídeo e conversa por município (`habilitar_canal_cidadao`, F15-E13, F34-E02) | S | N | N | N | N | N | N | N | N |
| Arquivo: enviar anexo (nova, F06-E04) | S | S | S | C (evidência, pela rota de vistoria) | C (do encaminhamento do órgão) | C | N | C (do relato dele) | N |
| Arquivo: anexar à ocorrência no painel (`anexar_arquivo`, F06-E17) | S | S | S | N | N | N | N | N | N |
| Arquivo: ler por URL assinada | C (mesmo teste da rota de dado) | C | C | C (tarefa da equipe) | C (do órgão) | C | C | C (do relato dele) | N |
| Arquivo: promover anexo a evidência (nova, F06-E12) | S | S | N | N | N | N | N | N | N |
| Arquivo: remover por moderação (nova, F06-E13) | S | S | N | N | N | N | N | N | N |
| Usuários: gerenciar (`gerenciar_usuarios`, com posto) | S (inclui outro administrador; nunca define senha, e-mail nem MFA de pessoa com conta em outro município) | S (só abaixo do posto 2) | N | N | C (só usuários do próprio órgão, abaixo do posto) | N | N | N | N |
| Vínculos de órgão: gerenciar (`gerir_vinculos`, F10-E03) | S | C (nomeia executor e leitor; só o administrador nomeia o gestor do órgão, DP:T37) | N | N | C (do próprio órgão) | N | N | N | N |
| Órgãos: cadastrar e desativar, inclusive órgão externo, que exige termo aceito e MFA no convite (F03-E17, F10-E02) | S | S | N | N | N | N | N | N | N |
| Organização: alterar dados e idioma (`gerenciar_organizacao`) | S | N | N | N | N | N | N | N | N |
| Identidade do município: nome, logotipo e cor de destaque (F35-E02, F35-E03; `gerenciar_organizacao`; 422 se a cor não passa AA) | S | N | N | N | N | N | N | N | C (restaura o tema DC360, com motivo, MFA e trilha, F35-E13) |
| Equipes: gerenciar (`gerenciar_equipes`) | S | S | N | N | N | N | N | N | N |
| Trilha: consultar (`consultar_trilha`) | S | S | N | N | C (histórico do próprio encaminhamento) | C | C | C (etapas públicas do relato dele) | N |
| Minha atividade: a própria trilha de sessão (F03-E20) | S (a própria) | S (a própria) | S (a própria) | S (a própria) | S (a própria) | S (a própria) | S (a própria) | N | N |
| Dados: exportar e saída do município (`exportar_dados`) | S | S | N | N | N | N | N | N | N |
| Saída a campo: acompanhar (`acompanhar_saida_a_campo`) | S | S | S | N | N | N | N | N | N |
| Território: consultar por raio, imóvel e área de risco (`consultar_territorio`, F32-E08, E09; com teto de raio, recorte e sigilo) | S | S | S | N | N | N | N | N | N |
| Território: gerir áreas e importar GeoJSON ou KML (`gerenciar_territorio`, F32-E05, E06) | S | S | N | N | N | N | N | N | N |
| Configuração: editar o rascunho (`editar_configuracao`, F33-E04) | S | S | N | N | N | N | N | N | N |
| Configuração: publicar versão (`publicar_configuracao`, F33-E04; só o administrador até CP-88) | S | N | N | N | N | N | N | N | N |
| Importação em lote: enviar, conferir a prévia, aplicar e desfazer por encerramento com motivo (`importar_ocorrencias`, F33-E12 a E15; dado real só depois de CP-90) | S | S | N | N | N | N | N | N | N |
| Incidente: criar, agrupar ocorrências, alocar equipes e turnos, encerrar (`gerenciar_incidente`, F29-E03) | S | S | N | N | N | N | N | N | N |
| Incidente: ler quadro, equipes e tarefas (F29-E05 a E07) | S | S | S | C (só a própria equipe) | N | N | N | N | N |
| Incidente: atualizar o quadro de situação (`atualizar_situacao_do_incidente`, F29-E05) | S | S | N | N | N | N | N | N | N |
| Incidente: check-in e check-out de presença (`registrar_presenca`, F29-E08) | C (só encerra a presença de outra pessoa, com motivo) | C (idem) | N | C (só da equipe alocada, vigência ativa; idempotente na fila) | N | N | N | N | N |
| Abrigo: cadastrar e desativar (`gerenciar_abrigo`, F29-E09) | S | S | N | N | N | N | N | N | N |
| Abrigo: atualizar a ocupação (`atualizar_ocupacao_de_abrigo`, F29-E09) | S | S | S | C (agente do incidente da equipe) | N | N | N | N | N |
| Relatório de situação: emitir (`emitir_relatorio_de_situacao`, F29-E15) | S | S | N | N | N | N | N | N | N |
| Logística: locais de depósito e ponto de coleta, catálogo de itens (`gerenciar_locais_de_logistica`, `gerenciar_catalogo_de_itens`, F30-E02, E03) | S | S | N | C (vê só o local em que tem vínculo vigente) | N | N | N | N | N |
| Estoque: registrar movimento ou pedir ajuste (`registrar_movimento_de_estoque`, F30-E05, E06) | S | S | C (conforme CP-63) | C (local e vínculo vigentes; da fila do aparelho, saldo negativo vira `divergencia`) | N | N | N | N | N |
| Estoque: aprovar ajuste, sempre OUTRA pessoa (`aprovar_ajuste_de_estoque`, F30-E06; 403 `aprovacao_propria`) | S | S | N | N | N | N | N | N | N |
| Entrega: registrar com prova (`registrar_entrega`, F30-E09) | S | S | S | C (agente da carga) | N | N | N | N | N |
| Doações, necessidades, kits e inventário (`gerenciar_doacoes_e_necessidades`, `gerenciar_kits_e_inventario`, F30-E08, E10) | S | S | N | C (contar exige vínculo no local) | N | N | N | N | N |
| Integrações: configurar, testar, enviar e ver chamadas (F31-E18; só administrador; `real` exige a liberação do fornecedor) | S | N | N | N | N | N | N | N | C (libera ou retira a liberação com motivo; lê estado e contagens, nunca o segredo) |
| Alerta público: preparar (`emitir_alerta_publico`, F31-E17) e aprovar por OUTRA pessoa com segundo fator | S | S | N | N | N | N | N | N | N |
| Suporte assistido: liberar e revogar a concessão (F10-E16, TOTP no ato) | S | N | N | N | N | N | N | N | C (recebe a concessão; só leitura) |
| Município: provisionar, suspender, agendar eliminação, definir `codigo_ibge`, contrato e demonstrativo (F20, F32-E03) | N | N | N | N | N | N | N | N | S (console) |
| Métricas agregadas e saúde do município | N | N | N | N | N | N | N | N | S (agregados, sem dado operacional) |
| Dado operacional de um município (ocorrências, em projeção fixa, sem contato de cidadão, relato nem arquivo) | N | N | N | N | N | N | N | N | C (SOMENTE LEITURA, só com concessão vigente do administrador; escrita e impersonation completa N, D-10) |

**Invariantes (cada uma vira teste):**

1. Default negado: rota sem ação declarada no manifesto reprova no teste de superfície (F03-E12), inclusive as rotas das fases F29 a F35.
2. Recurso de outro município ou de outro órgão responde 404, nunca 403.
3. O tenant vem só do token verificado; o órgão vem da rota e é validado contra o vínculo vivo no banco; o cidadão vem só do token do realm do cidadão.
4. Contexto de ator ausente ou incompleto no banco devolve zero linhas (nunca `OR contexto IS NULL`).
5. Toda escrita passa por `exigirPermissao` antes de tocar o banco; esconder o botão não é controle de acesso.
6. Vigência da conta, do papel e da sessão é conferida no banco a cada requisição autenticada (F00-E04 na escrita, F03-E03 em toda requisição).
7. Papel novo nunca herda o município inteiro: o recorte é fail-closed (F03-E14).
8. Arquivos e documentos seguem a mesma regra do dado a que pertencem (a URL assinada só é emitida depois do teste de acesso da rota de dado).
9. Nenhum anexo de cidadão ou de secretaria entra em laudo sem promoção humana registrada.
10. A matriz empírica papel x rota x método é gerada e conferida por teste (F03-E13) e varrida de novo na F25-E03.
11. A pessoa com contas em A e B nunca lê dado de A com token de B (F03-E18); só ela mesma, com sessão viva, troca de município (F03-E16).
12. O suporte assistido só lê, só com concessão vigente e nunca arquivo nem relato; a expiração e a revogação valem no banco (F20-E11, F25-E15).
13. Vídeo, conversa, telefone, CPF e identidade de provedor do cidadão nunca chegam ao agente, ao laudo, ao CSV, à busca, ao sino nem à ocorrência (F34-E18).
14. Saldo de estoque nunca é coluna editável: é a soma dos movimentos, e ajuste só existe aprovado por outra pessoa (F30-E04, F30-E06).
15. Agrupar ocorrências em incidente nunca escreve em `ocorrencias` (RN-08, F29-E04).
16. Integração em modo `real` só com a dupla chave (o município liga, o fornecedor libera); segredo nunca volta em resposta, log nem trilha (F31-E03).
17. Cor de destaque sem contraste AA nunca é gravada nem renderizada; a identidade de um município nunca aparece em outro (F35-E02, G35).

---

## C. Em qual gate cada fluxo ponta a ponta fica completo

A coluna "Completo em" é o gate que fecha o fluxo. A ordem em que os gates fecham é a de `STATUS.md`, seção 5: o G32 (território) fecha antes do G09; o G33 (configuração e checklist) antes do G15; o G34 (canal ampliado) entre o G18 e o G19; os G29, G30, G31 e G35 depois do G19 e antes do G20. Por isso um fluxo antigo fechado cedo (por exemplo o H, no G19) é cumulativo com os gates novos que o precedem na ordem.

| Fluxo | Descrição | Funcional em | Completo em | Reprovado de novo se... | Etapa de E2E | Observação |
| --- | --- | --- | --- | --- | --- | --- |
| A | Prefeitura registra ocorrência manual | G00 (base) | G10 | painel regride | `fluxo.e2e.mjs` existente, F00-E18 | MANTER; refeito no POC (G26) |
| B | Prefeitura, agente, vistoria, prefeitura | G00 (API e emulador) | G14 (aparelho físico) | fila perde item ou sessão apaga vistoria | F14-E12 | o gate exige Android e iOS físicos |
| C | Prefeitura, secretaria, resposta, prefeitura | G11 (HML com dados sintéticos) | G12 (secretaria real) | Obras vê Saúde, MFA desligado | F11-E22, F12-E02 | PORTAL antes do CIDADÃO (D-01) |
| D | Secretaria devolve (só antes do aceite), prefeitura reencaminha a outro órgão | G11 | G12 | secretaria consegue transferir sozinha | F11-E22, F10-E05 | secretaria devolve e sugere; a DC reencaminha |
| E | Secretaria responde, reinspeção, agente; ocorrência encerrada reabre por 30 dias | G13 | G14 (aparelho) | ocorrência encerrada reabre fora do prazo, histórico da secretaria desce ao aparelho | F13-E08, F13-E11, F14-E13 | mesma ocorrência, nova rodada; depois do prazo, ocorrência vinculada (F13-E09) |
| F | Cidadão, relato, complemento, triagem | G17 (app) | G18 (triagem) | relato aparece em métrica oficial | F17-E18, F18-E11 | relato não é ocorrência; vídeo e conversa chegam em G34 (fluxos Q e R) |
| G | Cidadão, relato, ocorrência | G18 | G18 | conversão consome protocolo duas vezes | F18-E11 | protocolo oficial só na conversão |
| H | Relato convertido, agente | G19 | G19 (cumulativo com G34, que fecha antes na ordem de execução) | nome, contato, CPF, fotos, vídeo ou conversa do cidadão descem ao aparelho | F19-E07, F34-E18 | minimização por lista de inclusão; o payload só fecha depois de provada a ausência de vídeo e conversa |
| I | Ocorrência, documento imutável | G09 (cumulativo com G32) | G09 | reimpressão diverge do emitido | F09-E10 | PDF guardado, hash e versão do template; o cabeçalho com identidade do município é congelado no snapshot (F35-E08) |
| J | Documento, substituição | G09 | G09 | versão anterior some | F09-E09 | nova versão; anterior preservada |
| K | Município, exportação completa | G00 (botão e rota corrigidos) | G28 (município de ensaio) | tabela nova fora da saída (inclusive as dos módulos novos); pacote com artefato diferente do emitido | F00-E11, F05-E05, F09-E11, F28-E10, F28-E14 | passa também pelo POC (G26); o piloto real não é eliminado; tabelas novas: F29-E16, F30-E17, F31-E19, F32-E15, F33-E16, F34-E19 |
| L | Município, eliminação | G05 (manifesto define a ordem) | G28 | eliminação para por tabela sem classificação; suspende sem aviso | F05-E05, F20-E04, F28-E10 | CP-29 define o que se preserva |
| M | Backup, restore | G00 (46 migrações em máquina limpa) | G22 | migration de papel ou policy sem restore provado; tabela nova sem cobertura de restore | F00-E25, F22-E03, F22-E07, F22-E09 | RPO e RTO medidos (CP-37) |
| N | DC360, provisionamento de município | G00 (existente) | G20 | primeiro administrador sem recuperação; provisionar sem pessoa e vínculo | F20-E18, F26-E06 | console do fornecedor |
| O | Ativação de emergência (ALY §5.2): a coordenação cria o incidente, agrupa ocorrências, aloca equipe e turno, cria tarefa; o agente, sem sinal, faz check-in, aceita a tarefa e atualiza a ocupação de um abrigo; reconecta; o painel mostra tudo uma vez só; relatório de situação e encerramento | G29 (painel, E2E em HML) | G29 (aparelho físico) | agrupar altera autoria, data ou documento da ocorrência (RN-08); presença ou ocupação duplica ou se perde na fila; a tela promete socorro ou monitoramento | F29-E18 (cenário no POC: F26-E08) | depende de G19 e G32; produção bloqueada por CP-62 e CP-63 |
| P | Suprimentos humanitários (ALY §5.3): entrada com lote e validade, transferência com trânsito, separação, ajuste aprovado por outra pessoa, entrega com assinatura no aparelho, contagem e relatório | G30 (painel e API, E2E em HML) | G30 (aparelho físico) | existe coluna de saldo; ajuste entra sem aprovação; entrega duplica ou perde na fila; foto de entrega recodificada; a view de saldo vaza entre municípios | F30-E18 (cenário no POC: F26-E08) | depende de G29; produção bloqueada por CP-66 e CP-67 |
| Q | Relato com vídeo: consentimento, captura de até 30 s, envio retomável, processamento, reprodução na triagem e moderação | G34 (HML) | G34 (aparelho) | o vídeo chega ao agente, ao laudo ou à ocorrência; passa de 30 s ou 50 MB; a alternativa em texto some | F34-E20 (etapas: F34-E03, E04, E09, E10) | desligado por padrão e por município; bloqueado por CP-47, CP-11 e CP-26 em produção |
| R | Conversa por relato: a triagem pergunta, o cidadão responde, aviso e push sem conteúdo, não lidas, ocultar mensagem | G34 (HML) | G34 (aparelho) | tempo real (WebSocket, SSE, long polling) entra; texto de mensagem oculta aparece em alguma leitura; nota interna vaza ao cidadão | F34-E20 (etapas: F34-E05 a E08, E10) | bloqueada em produção por CP-94 |
| S | Login ampliado do cidadão: gov.br com CPF verificado, SMS com teto diário, Google e Apple; vínculo e desvínculo em Minha conta | G34 (provedor falso e de teste, em HML) | G34 (aparelho; sem provedor real) | provedor novo funde contas por e-mail igual; token de outro `aud` aceito; CPF só informado vence o verificado; SMS fora do teto | F34-E20 (etapas: F34-E12 a E17) | ativação real por CP-91, CP-92, CP-93 e CP-46 |
| T | Integrações em sandbox: WhatsApp (consentimento, envio de modelo, estado de entrega, parada), camadas GeoJSON, KML e WMS no mapa, S2ID, SEI e Defesa Civil Alerta simulados, com dupla aprovação no alerta | G31 (sandbox, em HML) | G31 (sandbox) | segredo em log, trilha ou resposta; modo `real` sem liberação do fornecedor; chamada externa no caminho do pedido; alerta público sem segunda pessoa | F31-E20 (etapas: F31-E10, E13, E17) | a ativação real de cada integração é passo de produção por checkpoint (F28-E15), nunca fecha neste gate |
| U | Configuração e checklist por tipo: rascunho, publicação, vistoria offline com a versão do checklist baixada, sincronização depois de nova publicação | G33 (HML e simulador) | G33 (aparelho no E08) | publicar altera o prazo de ocorrência já aberta; vistoria feita offline com versão antiga é recusada | F33-E04, F33-E06, F33-E07, F33-E08 | bloqueado em produção por CP-88 e CP-89 |
| V | Importação de lote por CSV: enviar, prévia com erro por linha, aplicar com idempotência, desfazer por encerramento com motivo | G33 | G33 | aplicar duas vezes cria duplicata; desfazer apaga em vez de encerrar; protocolo repetido | F33-E12 a E15 | dado real só depois de CP-90 |
| W | Idiomas e identidade: o mesmo município nas cinco superfícies em pt-BR, en e es, claro e escuro, com logotipo, nome e cor de destaque, e VLibras só no clique | G35 | G35 | cor sem AA gravada; identidade de um município em outro; texto fixo ou chave pendente volta; documento emitido muda ao trocar o logotipo | F35-E14 | VLibras em produção e logotipo real bloqueados por CP-45 e CP-95 |
| X | Consulta territorial: o operador consulta ocorrências por raio, por imóvel e por área de risco, com coincidência exata ou aproximada, e o agente lê o contexto sem sinal | G32 (Postgres real, HML) | G32 | raio sem teto; consulta que deixa de usar o índice; coincidência aproximada tratada como exata; geometria de outro município | F32-E11, F32-E13, F32-E16 | testes espaciais só em Postgres real (`npm run test:espacial`); malha e áreas reais por CP-85 e CP-86 |
| Y | Pessoa global: uma pessoa com contas em dois municípios escolhe o município ao entrar, troca de município e, como órgão externo, responde encaminhamentos de cada um | G03 (API) | G12 (órgão externo no portal, F12-E08) | pessoa lê dado de A com token de B; administrador define senha, e-mail ou MFA de pessoa com conta em outro município | F03-E18, F11-E23, F11-E25, F12-E08, F25-E14 | produção por CP-49, CP-51 e CP-51 |
| Z | Suporte assistido do fornecedor: o administrador libera acesso curto e nominal, o operador lê só a projeção fixa, a concessão expira ou é revogada | G10 (liberação, F10-E16) | G20 (leitura no console, F20-E11) | o operador escreve ou lê arquivo ou relato; a leitura continua depois de expirar; ato sem trilha no município | F20-E11, F25-E15, F26-E12 | impersonation completa está fora; produção por CP-30 (parecer J10) e CP-54 |

**Regra:** um fluxo só conta como completo no gate indicado quando o E2E da etapa roda em HML (ou em aparelho, quando indicado) e a evidência está arquivada. Se uma etapa posterior quebrar um fluxo já completo, o gate onde ele fechou volta a REPROVADO. Em fluxo que depende de integração, provedor ou credencial externa, "completo" significa provado em sandbox ou provedor de teste com dado sintético: ativar o provedor real em produção é um checkpoint à parte e nunca fecha um gate.
