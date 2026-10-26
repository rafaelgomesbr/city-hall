/**
 * O catálogo de HOJE (migrações 001 a 052): o que o portão de isolamento
 * aceitava por número e por conjunto solto, agora com nome, motivo e a forma
 * de conferir o tenant. Parte 0B do lote 0 da F03 (V2-F03-E08, antecipada pela
 * premissa P-03 do plano).
 *
 * Nada aqui é novo: são as 27 funções `SECURITY DEFINER` que o teto `<= 27`
 * contava, as isenções de `SEM_TENANT` e `SEM_POLICY_DE_TENANT` e a lista de
 * UPDATE por coluna que o portão já cobrava. A história de cada subida do teto
 * (12, 13, 14, 15, 16, 22, 23, 26 e 27) que vivia num comentário de 120 linhas
 * dentro de `isolamento.test.ts` mora agora no `motivo` de cada função.
 *
 * Esta lista só CRESCE por etapa, no arquivo da etapa (`f03-eNN.ts`). Mexer
 * neste arquivo é mexer na história: só uma etapa que REDEFINE uma função
 * daqui (nova migração) declara a entrada nova com `redefine: true` no
 * arquivo dela.
 */
import type {
  ColunaComUpdate,
  ContribuicaoDoCatalogo,
  ExcecaoAoIsolamento,
  FuncaoPrivilegiada,
  PreparoDeTabela,
} from "./tipos.js";

const APP = ["dc360_app"] as const;
const CONSOLE = ["dc360_console"] as const;

const funcoes: readonly FuncaoPrivilegiada[] = [
  // ---------------------------------------------------------------- autenticação
  {
    nome: "credenciais_para_login",
    assinatura: "public.credenciais_para_login(text)",
    migracao: "046",
    etapa: "base",
    executavelPor: APP,
    motivo:
      "O login acontece antes de existir contexto de município: o papel de aplicação não enxerga " +
      "uma linha de `usuarios` sem ele. Função nomeada e estreita no lugar de uma exceção geral ao " +
      "RLS (migração 002): busca por igualdade de e-mail, sem filtro, sem ordenação, sem limite, " +
      "devolve só o que a autenticação decide. Não compara senha.",
    tenant: "antes_do_tenant",
    confere:
      "O e-mail é o único caminho: o índice único global `usuarios_email_global_idx` garante uma " +
      "conta por e-mail, e a conta traz o município com ela. A E15/E16 troca isto por " +
      "`credenciais_da_pessoa` e pela escolha de município.",
    provas: ["db/test/isolamento.test.ts"],
  },
  {
    nome: "registrar_tentativa_login",
    assinatura: "public.registrar_tentativa_login(uuid,boolean,integer,interval)",
    migracao: "002",
    etapa: "base",
    executavelPor: APP,
    motivo:
      "Grava falha, bloqueio temporário e último acesso na conta ANTES de haver município no " +
      "contexto (a falha de senha é registrada na tentativa de login). O bloqueio é por conta e " +
      "temporário: bloqueio permanente viraria negação de serviço contra o servidor público.",
    tenant: "ainda_nao_confere",
    confere:
      "Hoje NÃO confere: age sobre qualquer `usuarios.id` que receba (achado REL:06 14b). Quem " +
      "chama é a API, com o id que ela mesma achou pelo e-mail, mas a função não exige que o " +
      "município do contexto seja o da conta.",
    corrigidaEm: "V2-F03-E08",
    provas: ["apps/api/test/renovacao-contra-encerramento.test.ts"],
  },
  {
    nome: "sessao_por_token",
    assinatura: "public.sessao_por_token(text)",
    migracao: "046",
    etapa: "base",
    executavelPor: APP,
    motivo:
      "A renovação apresenta o token de renovação antes de existir contexto de município, e o " +
      "papel de aplicação não enxerga `sessoes` sem ele. Só devolve sessão viva (não expirada, " +
      "não revogada).",
    tenant: "antes_do_tenant",
    confere:
      "O hash do token de renovação, que só o dono da sessão tem, é a chave; " +
      "a linha devolvida traz o município da sessão.",
    provas: ["apps/api/test/renovacao-contra-encerramento.test.ts"],
  },
  {
    nome: "abrir_sessao",
    assinatura: "public.abrir_sessao(uuid,uuid,text,interval,text,text,uuid)",
    migracao: "050",
    etapa: "base",
    executavelPor: APP,
    motivo:
      "Cria a sessão no login e na renovação, fora do contexto de município. Recusa município " +
      "suspenso (DC367) e família de sessão inexistente ou encerrada (DC369), e toma a trava de " +
      "suspensão por FOR SHARE no login.",
    tenant: "antes_do_tenant",
    confere:
      "Recebe o município como parâmetro, mas a chave estrangeira composta " +
      "`(organizacao_id, usuario_id)` de `sessoes` impede sessão de um usuário em município que " +
      "não é o dele, e a família só é herdada do mesmo usuário no mesmo município.",
    provas: [
      "db/test/familia-da-sessao.test.ts",
      "db/test/login-e-suspensao-na-mesma-linha.test.ts",
    ],
  },
  {
    nome: "revogar_sessao",
    assinatura: "public.revogar_sessao(text,text)",
    migracao: "002",
    etapa: "base",
    executavelPor: APP,
    motivo: "Encerra a sessão do token apresentado, fora do contexto de município.",
    tenant: "antes_do_tenant",
    confere: "O hash do token de renovação é a chave: só quem o apresenta encerra aquela sessão.",
    provas: ["db/test/renovacao-e-encerramento-na-mesma-trava.test.ts"],
  },
  {
    nome: "revogar_sessoes_do_usuario",
    assinatura: "public.revogar_sessoes_do_usuario(uuid,text)",
    migracao: "049",
    etapa: "base",
    executavelPor: APP,
    motivo:
      "Derruba todas as sessões de um usuário: reuso de token de renovação (sinal clássico de " +
      "token roubado) e desativação da conta. Toma a trava por pessoa da 049 para serializar com " +
      "a renovação.",
    tenant: "ainda_nao_confere",
    confere:
      "Hoje NÃO confere: age sobre qualquer `usuarios.id` (achado REL:06 14b). Com `pessoas` " +
      "global, a conta de um município alcançaria quem também atua em outro.",
    corrigidaEm: "V2-F03-E08",
    provas: ["db/test/renovacao-e-encerramento-na-mesma-trava.test.ts"],
  },
  {
    nome: "dono_do_token",
    assinatura: "public.dono_do_token(text)",
    migracao: "048",
    etapa: "base",
    executavelPor: APP,
    motivo:
      "Reuso de token exige saber de quem era um token que NÃO vale mais, e `sessao_por_token` " +
      "de propósito não devolve esses. Responde só isso: o dono, o motivo da revogação, o " +
      "vencimento e se a conta está ativa. Token desconhecido não devolve linha.",
    tenant: "antes_do_tenant",
    confere:
      "O hash do token é a chave. Hoje devolve o `usuario_id` sem o município; a E08 passa a " +
      "devolver também `organizacao_id`.",
    // Até a parte 0D era `semProva` (exercitada só por dentro da rota de renovação).
    provas: ["db/test/funcoes-antes-do-tenant.test.ts"],
  },
  {
    nome: "trocar_senha",
    assinatura: "public.trocar_senha(uuid,text,uuid)",
    migracao: "049",
    etapa: "base",
    executavelPor: APP,
    motivo:
      "Troca a senha da própria pessoa e encerra as outras sessões dela, numa operação só, sob " +
      "a trava por pessoa da 049.",
    tenant: "ainda_nao_confere",
    confere:
      "Hoje NÃO confere: age sobre qualquer `usuarios.id` (achado REL:06 14b). A E08 exige conta " +
      "ativa no município do contexto e só aceita a pessoa do próprio `sub`.",
    corrigidaEm: "V2-F03-E08",
    provas: ["db/test/renovacao-e-encerramento-na-mesma-trava.test.ts"],
  },
  {
    nome: "abrir_recuperacao",
    assinatura: "public.abrir_recuperacao(text,text,interval,text)",
    migracao: "005",
    etapa: "base",
    executavelPor: APP,
    motivo:
      "A recuperação de senha parte do e-mail, antes de existir contexto de município. Invalida " +
      "as recuperações anteriores do mesmo usuário (dois links vivos dobram a janela de ataque). " +
      "Devolve nome e e-mail para a API enviar a mensagem; a resposta ao cliente é a mesma " +
      "exista a conta ou não.",
    tenant: "antes_do_tenant",
    confere:
      "O e-mail é o único caminho (índice único global); a recuperação nasce já presa ao " +
      "usuário e ao município da conta achada.",
    // Até a parte 0D era `semProva` (exercitada só por dentro da rota de recuperação).
    provas: ["db/test/funcoes-antes-do-tenant.test.ts"],
  },
  {
    nome: "consumir_recuperacao",
    assinatura: "public.consumir_recuperacao(text,text)",
    migracao: "051",
    etapa: "base",
    executavelPor: APP,
    motivo:
      "Redefine a senha pelo link de e-mail, sem sessão e sem município no contexto. Consome o " +
      "link, troca a senha e encerra as sessões da pessoa na mesma transação, sob a trava por " +
      "pessoa; conta desativada gasta o link e não muda nada (migrações 049 e 051).",
    tenant: "antes_do_tenant",
    confere:
      "O hash do link de uso único é a chave; a recuperação carrega o usuário e o município, e " +
      "a função devolve `(usuario_id, organizacao_id)` para a API seguir debaixo dele.",
    provas: ["db/test/renovacao-e-encerramento-na-mesma-trava.test.ts"],
  },
  // ---------------------------------------------------------------- formulário e link público
  {
    nome: "interesse_recente",
    assinatura: "public.interesse_recente(text)",
    migracao: "011",
    etapa: "base",
    executavelPor: APP,
    motivo:
      "O papel de aplicação INSERE e não LÊ `interesse_municipio` (a tabela é anterior ao " +
      "município). Para o formulário público não duplicar o pedido num clique duplo, a rota " +
      "precisa saber se aquele e-mail já pediu nas últimas seis horas: um booleano, sem linha, " +
      "sem contagem, sem filtro livre.",
    tenant: "antes_do_tenant",
    confere:
      "Não há município: a tabela é anterior a qualquer município. A rota NÃO repassa o " +
      "booleano ao cliente (resposta idêntica nos dois casos).",
    // Até a parte 0D era `semProva` (nenhum teste a chamava pelo nome).
    provas: ["db/test/funcoes-antes-do-tenant.test.ts"],
  },
  {
    nome: "abrir_oficio",
    assinatura: "public.abrir_oficio(text,text,text)",
    migracao: "017",
    etapa: "base",
    executavelPor: APP,
    motivo:
      "Quem clica no link de uso único do ofício é uma pessoa do órgão destinatário, sem conta, " +
      "sem token e sem município. Abre o link e registra a abertura numa operação só (separar " +
      "abriria uma janela em que o mesmo link serve duas vezes). Não devolve o conteúdo do " +
      "ofício: devolve o resultado e os identificadores.",
    tenant: "antes_do_tenant",
    confere:
      "O hash do link é o único caminho até a organização; a função devolve `organizacao_id` e a " +
      "rota monta o documento pelo caminho normal, com `SET LOCAL` nesse município.",
    provas: ["db/test/isolamento.test.ts"],
  },
  // ---------------------------------------------------------------- relógios
  {
    nome: "varrer_prazos",
    assinatura: "public.varrer_prazos(interval,interval,integer,integer,interval)",
    // Era "016" até a parte 0D: a 045 mudou a forma por `ALTER FUNCTION ... SET row_security = off`.
    migracao: "045",
    etapa: "base",
    executavelPor: APP,
    motivo:
      "O varredor roda sem ninguém logado: não há token, não há município no contexto, e sem ele " +
      "o papel de aplicação não enxerga uma linha sequer, nem para descobrir QUAIS municípios " +
      "têm prazo vencendo. Reivindica e devolve na mesma chamada (a idempotência), e faz o " +
      "expurgo por idade na mesma passada.",
    tenant: "relogio",
    confere:
      "Sem município de parâmetro e sem filtro livre; não avisa prazo já vencido; não devolve " +
      "nome de pessoa, contato, relato nem descrição de vulnerabilidade.",
    provas: ["db/test/varredura-de-prazo-sem-bypassrls.test.ts"],
  },
  {
    nome: "varrer_tarefas_novas",
    assinatura: "public.varrer_tarefas_novas(interval,integer,integer)",
    migracao: "042",
    etapa: "base",
    executavelPor: APP,
    motivo:
      "O aviso de tarefa nova é enfileirado pelo despacho, dentro do contexto do município, mas " +
      "quem o ENVIA é o relógio, sem ninguém logado: sem município no contexto o papel de " +
      "aplicação não enxergaria uma pendente sequer. Mesma forma da `varrer_prazos`, e mais " +
      "estreita na saída.",
    tenant: "relogio",
    confere:
      "Sem município de parâmetro, sem filtro de quem chama; não devolve protocolo nem endereço.",
    provas: ["db/test/isolamento.test.ts"],
  },
  {
    nome: "minimizar_por_prazo",
    assinatura: "public.minimizar_por_prazo(integer)",
    migracao: "043",
    etapa: "base",
    executavelPor: APP,
    motivo:
      "Roda num relógio, sem ninguém logado: sem município no contexto não teria nem como " +
      "descobrir QUAIS municípios têm prazo de minimização vencido. A alternativa (a aplicação " +
      "carregar a lista de municípios por fora do RLS) é a mesma porta com o cadeado do lado de " +
      "dentro. Descarta o dado pessoal que o prazo de retenção manda descartar.",
    tenant: "relogio",
    confere: "Sem município de parâmetro e sem prazo de parâmetro; sem dado de pessoa na saída.",
    provas: ["db/test/minimizacao-do-relato-e-da-trilha.test.ts"],
  },
  {
    nome: "municipios_a_resumir",
    assinatura: "public.municipios_a_resumir(interval)",
    migracao: "038",
    etapa: "base",
    executavelPor: APP,
    motivo:
      "O relógio do resumo precisa saber para quais municípios chamar `resumir_municipio()`, que " +
      "é SECURITY INVOKER de propósito (a métrica é escrita pelo próprio município, debaixo do " +
      "RLS dele; é essa inversão que sustenta a ADR 0008). Sem contexto o papel de aplicação não " +
      "enxerga uma linha de `organizacoes`.",
    tenant: "relogio",
    confere:
      "Devolve `setof uuid` e nada mais, e não aceita município de parâmetro. Lê `organizacoes` " +
      "(só as não eliminadas) com junção em `metricas_municipio` (a métrica do dia e quando foi " +
      "atualizada, para saber quem está vencido pelo `p_frescor`); nenhuma outra tabela.",
    provas: ["db/test/eliminacao-de-municipio.test.ts"],
  },
  {
    nome: "eliminacoes_pendentes",
    assinatura: "public.eliminacoes_pendentes()",
    migracao: "038",
    etapa: "base",
    executavelPor: APP,
    motivo:
      "A rota de saúde da API precisa dizer se o relógio de eliminação tem trabalho, e o papel de " +
      "aplicação não enxerga uma linha de `organizacoes` sem município no contexto.",
    tenant: "relogio",
    confere: "Sem parâmetro; devolve dois inteiros (agendadas e vencidas), nenhum nome nem id.",
    provas: ["db/test/eliminacao-de-municipio.test.ts"],
  },
  {
    nome: "executar_eliminacoes_vencidas",
    assinatura: "public.executar_eliminacoes_vencidas()",
    migracao: "038",
    etapa: "base",
    executavelPor: APP,
    motivo:
      "O relógio executa o irreversível (eliminar o município) sem ninguém logado e sem " +
      "município no contexto, apagando linha em tabelas que não têm policy de DELETE para papel " +
      "nenhum. É uma das DUAS únicas funções do banco que apagam dado de município, e por isso " +
      "uma das mais vigiadas.",
    tenant: "relogio",
    confere:
      "Só age no que está vencido, não cancelado E marcado na organização (marca que só a função " +
      "do console escreve); confere que restou zero linha depois de cada DELETE e estoura " +
      "nomeando a tabela se o dono for barrado pela RLS. Casos em " +
      "`db/test/eliminacao-de-municipio.test.ts`.",
    provas: ["db/test/eliminacao-de-municipio.test.ts"],
  },
  {
    nome: "concluir_eliminacao",
    assinatura: "public.concluir_eliminacao(uuid)",
    migracao: "038",
    etapa: "base",
    executavelPor: APP,
    motivo:
      "A outra função do banco que apaga dado de município: conclui a eliminação de UM município " +
      "cujo banco o relógio já apagou, depois de a API purgar o armazenamento. Roda sem ninguém " +
      "logado.",
    tenant: "relogio",
    confere:
      "O município vem de parâmetro, e a ÚNICA condição para agir é `organizacoes.eliminada_em` " +
      "preenchido (só `executar_eliminacoes_vencidas` o escreve); sem ela estoura DC365 e não " +
      "muda nada. Apaga de novo, tabela a tabela, as linhas que entraram depois do apagamento e " +
      "as registra no livro em `sobras_na_conclusao`; depois apaga a linha de `organizacoes` e " +
      "estoura DC366 se não apagar exatamente uma.",
    provas: ["db/test/eliminacao-de-municipio.test.ts"],
  },
  // ---------------------------------------------------------------- console do fornecedor
  {
    nome: "provisionar_municipio",
    assinatura: "public.provisionar_municipio(text,text,text,text,text,text,text,text)",
    migracao: "046",
    etapa: "base",
    executavelPor: CONSOLE,
    motivo:
      "O console do fornecedor precisa criar a prefeitura e o primeiro administrador dela, e " +
      "quem chama não pode ter privilégio nenhum: a alternativa seria dar INSERT em " +
      "`organizacoes` e `usuarios` ao papel do console, o que a decisão 3 da ADR 0008 proíbe " +
      "(com INSERT em `usuarios` o console criaria administrador dentro de município que já " +
      "existe).",
    tenant: "console",
    confere:
      "Só cria município NOVO: dois uuid de saída, nenhum parâmetro vira consulta, nenhuma tabela " +
      "de negócio no corpo além das três que escreve, e o console continua sem privilégio em " +
      "tabela nenhuma depois de usá-la. O administrador nasce com senha provisória de 72 h.",
    provas: ["db/test/isolamento.test.ts"],
  },
  {
    nome: "console_suspender_municipio",
    assinatura: "public.console_suspender_municipio(uuid,text)",
    migracao: "049",
    etapa: "base",
    executavelPor: CONSOLE,
    motivo:
      "O console escreve INTENÇÃO (suspender o acesso de um município) sem ter UPDATE em " +
      "`organizacoes` nem em `sessoes` nem INSERT em `trilha_administrativa` (decisão 3 da ADR " +
      "0008). Revoga todas as sessões do município sob as travas por pessoa da 049.",
    tenant: "console",
    confere:
      "Exige que o operador da sessão do console seja o dono do console (e motivo escrito); só " +
      "age em município ativo, não eliminado; devolve o número de sessões revogadas.",
    provas: ["db/test/eliminacao-de-municipio.test.ts"],
  },
  {
    nome: "console_reativar_municipio",
    assinatura: "public.console_reativar_municipio(uuid)",
    migracao: "038",
    etapa: "base",
    executavelPor: CONSOLE,
    motivo: "Mesma razão de `console_suspender_municipio`: reativa o acesso sem UPDATE de tabela.",
    tenant: "console",
    confere:
      "Exige o dono do console como operador da sessão; recusa se houver eliminação agendada e " +
      "não cancelada.",
    provas: ["db/test/eliminacao-de-municipio.test.ts"],
  },
  {
    nome: "console_agendar_eliminacao",
    assinatura: "public.console_agendar_eliminacao(uuid,text)",
    migracao: "038",
    etapa: "base",
    executavelPor: CONSOLE,
    motivo:
      "O console agenda a eliminação (intenção); quem executa o irreversível é o relógio da API, " +
      "guardado pelo estado no banco. O console não tem escrita nas tabelas de município.",
    tenant: "console",
    confere:
      "Exige o dono do console (só ele agenda) e motivo escrito; só age em município ativo e " +
      "sem eliminação já agendada; suspende o município e devolve quando o relógio vai apagar " +
      "(sete dias).",
    provas: ["db/test/eliminacao-de-municipio.test.ts"],
  },
  {
    nome: "console_cancelar_eliminacao",
    assinatura: "public.console_cancelar_eliminacao(uuid)",
    migracao: "038",
    etapa: "base",
    executavelPor: CONSOLE,
    motivo: "Cancela a eliminação agendada, pela mesma razão de `console_agendar_eliminacao`.",
    tenant: "console",
    confere:
      "Exige o dono do console como operador da sessão; recusa município inexistente ou já " +
      "apagado; escreve o cancelamento no livro e na trilha administrativa e não devolve nada.",
    provas: ["db/test/eliminacao-de-municipio.test.ts"],
  },
  {
    nome: "console_renovar_codigos",
    assinatura: "public.console_renovar_codigos(text[])",
    migracao: "039",
    etapa: "base",
    executavelPor: CONSOLE,
    motivo:
      "Gerar códigos de recuperação novos marca os anteriores como usados, que é um UPDATE, e o " +
      "console não tem UPDATE na tabela de códigos (com ele uma sessão comprometida desmarcaria " +
      "um código gasto). Quem chama não pode ter privilégio.",
    tenant: "console",
    confere: "Exige o operador da sessão, ativo; devolve um inteiro. Não toca tabela de município.",
    provas: ["db/test/recuperacao-do-console.test.ts"],
  },
  {
    nome: "console_recuperacao_por_email",
    assinatura: "public.console_recuperacao_por_email(text)",
    migracao: "039",
    etapa: "base",
    executavelPor: CONSOLE,
    motivo:
      "Quem perdeu a senha do console NÃO TEM SESSÃO, então não há operador no contexto e a " +
      "policy de SELECT da tabela de códigos, amarrada ao operador da sessão, devolveria vazio. " +
      "É a única função do banco que devolve hash de credencial sem sessão.",
    tenant: "console",
    confere:
      "Três colunas (id do operador, id do código, hash do CÓDIGO), sem nome, sem papel e sem " +
      "`senha_hash`; e-mail inexistente e operador inativo devolvem vazio, nunca erro. Não toca " +
      "tabela de município. Casos em `db/test/recuperacao-do-console.test.ts`.",
    provas: ["db/test/recuperacao-do-console.test.ts"],
  },
  {
    nome: "console_consumir_recuperacao",
    assinatura: "public.console_consumir_recuperacao(uuid,text,text)",
    migracao: "039",
    etapa: "base",
    executavelPor: CONSOLE,
    motivo:
      "Gasta o código de recuperação e troca senha E segundo fator do operador, sem sessão. É a " +
      "única função que reescreve `senha_hash` e `segundo_fator` de um operador sem ser ele " +
      "mesmo, escrevendo como dono das tabelas com `row_security = off`.",
    tenant: "console",
    confere:
      'Só com um código vivo; com um dono sem BYPASSRLS ela estoura em vez de dizer "senha ' +
      'redefinida" com a senha velha no lugar. Não toca tabela de município.',
    provas: ["db/test/recuperacao-do-console.test.ts"],
  },
];

const excecoes: readonly ExcecaoAoIsolamento[] = [
  {
    tabela: "organizacoes",
    dispensa: ["organizacao_id"],
    mantem: [
      "policy_de_contexto",
      "rls_forcada",
      "grants_declarados",
      "fk_com_organizacao",
      "sem_delete",
    ],
    grants: { dc360_app: ["INSERT", "SELECT", "UPDATE"], dc360_console: ["SELECT"], PUBLIC: [] },
    etapa: "base",
    motivo: "A raiz do tenant: ela não tem `organizacao_id`, ela É a organização.",
    trava:
      "Policy amarrada ao contexto (`id = app_organizacao_atual()`), ativada e forçada; o " +
      "console só lê (SELECT), por autorização expressa da ADR 0008.",
  },
  {
    tabela: "interesse_municipio",
    dispensa: ["organizacao_id", "policy_de_contexto"],
    mantem: ["rls_forcada", "grants_declarados", "fk_com_organizacao", "sem_delete"],
    grants: { dc360_app: ["INSERT"], dc360_console: [], PUBLIC: [] },
    etapa: "base",
    motivo:
      "Pedidos vindos do formulário público. É a única tabela do produto ANTERIOR ao município: " +
      "quem preenche ainda não é cliente, não tem token e não tem organização. Exigir " +
      "`organizacao_id` aqui seria exigir que a pessoa já pertencesse ao que pede para conhecer.",
    trava:
      "O papel de aplicação INSERE e NÃO LÊ (sem SELECT, o formulário aberto na internet não " +
      "vira lista de contatos de servidores públicos). A leitura é do dono do banco. Provado em " +
      '"o formulário público escreve e NÃO lê" e pela função estreita `interesse_recente`.',
  },
  {
    tabela: "console_operadores",
    dispensa: ["organizacao_id", "policy_de_contexto", "fk_com_organizacao"],
    mantem: ["rls_forcada", "grants_declarados", "sem_delete"],
    grants: { dc360_app: [], dc360_console: ["INSERT", "SELECT", "UPDATE"], PUBLIC: [] },
    doFornecedor: true,
    etapa: "base",
    motivo:
      "Os operadores do CONSOLE DO FORNECEDOR (migração 038): contas de quem opera a plataforma, " +
      "de município nenhum, como `organizacoes` existe acima de qualquer município.",
    trava:
      "Só o papel do console a alcança; o par de policies amarradas ao operador da sessão " +
      "(`console_operador_atual()`), comando a comando, sem FOR ALL e sem DELETE, cobrado no " +
      "bloco `DO_FORNECEDOR` do portão.",
  },
  {
    tabela: "console_codigos_de_recuperacao",
    dispensa: ["organizacao_id", "policy_de_contexto", "fk_com_organizacao"],
    mantem: ["rls_forcada", "grants_declarados", "sem_delete"],
    grants: { dc360_app: [], dc360_console: ["INSERT", "SELECT"], PUBLIC: [] },
    doFornecedor: true,
    etapa: "base",
    motivo:
      "Os códigos de recuperação de senha desses operadores (migração 039): do fornecedor, não " +
      "de município nenhum.",
    trava:
      "Policy amarrada ao operador da sessão, na leitura também; sem UPDATE nem DELETE (marcar " +
      "usado é ato das funções da 039). Caso-irmão em `db/test/recuperacao-do-console.test.ts`.",
  },
];

/**
 * O privilégio de UPDATE por COLUNA que o papel de aplicação tem. É o caminho
 * mais fácil de esquecer, porque passa por fora de `role_table_grants`. Cada
 * linha é uma decisão: a tabela é registro do ato, e só este bloco pode mudar
 * depois de gravado. Sem privilégio de coluna, uma rota futura reescreveria o
 * que o registro existe para não deixar reescrever.
 */
const colunasComUpdate: readonly ColunaComUpdate[] = [
  {
    tabela: "oficio_envios",
    coluna: "desfecho",
    migracao: "017",
    etapa: "base",
    motivo:
      "O desfecho da entrega chega DEPOIS de a linha existir. A restrição por coluna impede um " +
      "caminho futuro de esticar `expira_em` ou trocar `token_hash` numa tentativa já gravada: " +
      "um link que a aplicação prorroga não expira de verdade, e um `token_hash` substituível " +
      "transforma uma tentativa antiga num link novo para outro endereço.",
  },
  {
    tabela: "oficio_envios",
    coluna: "detalhe",
    migracao: "017",
    etapa: "base",
    motivo: "O detalhe do desfecho da entrega, pelo mesmo motivo de `desfecho`.",
  },
  {
    tabela: "oficio_envios",
    coluna: "provedor_id",
    migracao: "027",
    etapa: "base",
    motivo:
      "O recibo que o provedor de e-mail devolve chega depois da linha existir: entra nomeado, " +
      "e não como GRANT UPDATE na tabela.",
  },
  {
    tabela: "devolucoes_de_tarefa",
    coluna: "observacao",
    migracao: "029",
    etapa: "base",
    motivo:
      "A minimização por prazo precisa descartar a observação em texto livre que o agente " +
      "escreveu na rua (ela pode nomear um morador). Motivo, prazo perdido, equipe e autoria " +
      "são o registro de que uma equipe não chegou ao imóvel e nada disso se reescreve.",
  },
  {
    tabela: "devolucoes_de_tarefa",
    coluna: "observacao_removida_em",
    migracao: "029",
    etapa: "base",
    motivo: "A marca de quando a observação foi descartada, pela mesma decisão da 029.",
  },
  {
    tabela: "saidas_a_campo",
    coluna: "desfecho",
    migracao: "031",
    etapa: "base",
    motivo:
      "O bloco de encerramento da saída a campo muda depois de gravado. O que nunca muda: quem " +
      "saiu, para onde, quando, se estava sozinho, a duração declarada e o PRAZO INICIAL. Sem " +
      "privilégio de coluna, uma rota nova reescreveria o prazo inicial de uma saída vencida e " +
      "faria o atraso de um agente que não desceu do morro sumir sem rastro.",
  },
  {
    tabela: "saidas_a_campo",
    coluna: "encerrada_em",
    migracao: "031",
    etapa: "base",
    motivo: "Parte do bloco de encerramento da saída a campo (031).",
  },
  {
    tabela: "saidas_a_campo",
    coluna: "encerrada_por",
    migracao: "031",
    etapa: "base",
    motivo: "Parte do bloco de encerramento da saída a campo (031).",
  },
  {
    tabela: "saidas_a_campo",
    coluna: "observacao",
    migracao: "031",
    etapa: "base",
    motivo: "Parte do bloco de encerramento da saída a campo (031).",
  },
  {
    tabela: "saidas_a_campo",
    coluna: "prorrogacoes",
    migracao: "031",
    etapa: "base",
    motivo: "O contador de prorrogações muda pela prorrogação, e só por ela (031).",
  },
  {
    tabela: "saidas_a_campo",
    coluna: "retorno_previsto_em",
    migracao: "031",
    etapa: "base",
    motivo: "O prazo corrente muda pela prorrogação; o prazo inicial nunca muda (031).",
  },
  {
    tabela: "saidas_a_campo",
    coluna: "prorrogacao_key",
    migracao: "032",
    etapa: "base",
    motivo:
      "A chave de idempotência do pedido de prorrogação: a resposta se perde no sinal ruim do " +
      "morro e o aparelho repete, e o reenvio não pode contar a prorrogação duas vezes nem " +
      "escrever dois eventos numa trilha que não se corrige.",
  },
  {
    tabela: "objetos_orfaos",
    coluna: "decisao",
    migracao: "035",
    etapa: "base",
    motivo:
      "A varredura escreve a linha inteira e nunca mais a toca; o único UPDATE é o bloco da " +
      "decisão humana (descarte deliberado, com operador nomeado e motivo). Sem privilégio de " +
      "coluna, um caminho novo reescreveria a espécie ou o tamanho de um objeto listado e faria " +
      "uma fotografia em uso parecer lixo na lista que alguém vai autorizar a apagar.",
  },
  {
    tabela: "objetos_orfaos",
    coluna: "decisao_motivo",
    migracao: "035",
    etapa: "base",
    motivo: "Parte do bloco da decisão humana sobre o objeto órfão (035).",
  },
  {
    tabela: "objetos_orfaos",
    coluna: "decidido_em",
    migracao: "035",
    etapa: "base",
    motivo: "Parte do bloco da decisão humana sobre o objeto órfão (035).",
  },
  {
    tabela: "objetos_orfaos",
    coluna: "decidido_por",
    migracao: "035",
    etapa: "base",
    motivo: "Parte do bloco da decisão humana sobre o objeto órfão (035).",
  },
];

/**
 * Como montar a linha das tabelas que a fábrica genérica da prova
 * comportamental (`comportamental.ts`, parte 0D) não sabe semear sozinha:
 * cada uma tem um CHECK de formato que nenhum valor genérico satisfaz. O
 * preparo só diz o valor de uma coluna; a policy, o privilégio e o resto da
 * linha continuam os do banco. Conferido nos dois sentidos: sem o preparo a
 * fábrica falha, e com ele a tabela é semeada e provada.
 */
const SCRYPT = "'scrypt$131072$8$1$' || repeat('s', 80) || ':n'";

const preparos: readonly PreparoDeTabela[] = [
  {
    tabela: "console_codigos_de_recuperacao",
    colunas: { codigo_hash: SCRYPT },
    etapa: "base",
    motivo:
      "O CHECK `codigo_chega_derivado` exige o hash no formato scrypt com 80 caracteres ou mais.",
  },
  {
    tabela: "console_operadores",
    colunas: { senha_hash: SCRYPT, segundo_fator: "'v1.semente-:n'" },
    etapa: "base",
    motivo:
      "Os CHECKs `senha_chega_derivada` e `segundo_fator_vem_cifrado` exigem a senha em scrypt e o " +
      "segundo fator no envelope `v1.`.",
  },
  {
    tabela: "eliminacoes_de_municipio",
    colunas: { uf: "'MG'", executar_em: "now() + interval '8 days'" },
    etapa: "base",
    motivo:
      "O CHECK da UF exige duas letras maiúsculas, e `prazo_de_arrependimento_de_sete_dias` exige " +
      "a execução sete dias ou mais depois do pedido.",
  },
  {
    tabela: "oficios",
    colunas: { numero: "lpad(':n', 6, '0') || '/2026'" },
    etapa: "base",
    motivo: "O CHECK `oficios_numero_check` exige o número no formato 000000/AAAA.",
  },
  {
    tabela: "saidas_a_campo",
    colunas: { duracao_minutos: "60" },
    etapa: "base",
    motivo: "O CHECK da duração declarada exige de 15 a 480 minutos.",
  },
  {
    tabela: "segundo_fator",
    colunas: { segredo_cifrado: "'v1.semente-:n'" },
    etapa: "base",
    motivo:
      "O CHECK `segredo_coerente_com_a_situacao` exige o segredo cifrado quando o fator está ligado, " +
      "e a fábrica deixa nula a coluna que aceita nulo.",
  },
  {
    tabela: "segundo_fator_recuperacao",
    colunas: { codigo_hash: "rpad('semente:n', 43, 'x')" },
    etapa: "base",
    motivo:
      "O CHECK `codigo_guardado_como_resumo` exige o resumo com exatamente 43 caracteres base64url.",
  },
];

export const BASE: ContribuicaoDoCatalogo = {
  funcoes,
  excecoes,
  colunasComUpdate,
  preparos,
  semProvaComportamental: [],
  policiesRestritivas: [],
  visoesSemInvoker: [],
  tiposProprios: [],
  sequencias: [],
  leiturasDeExtensao: [
    {
      extensao: "postgis",
      relacao: "extensions.spatial_ref_sys",
      papel: "dc360_app",
      etapa: "base",
      motivo:
        "A tabela de sistemas de referência do PostGIS, que as funções de distância em metros leem; " +
        "o `supabase-endurecer.sql` dá SELECT ao papel de aplicação e tira de todo o resto. Não tem " +
        "dado de município.",
    },
  ],
};
