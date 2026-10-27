/**
 * Contribuição da etapa V2-F03-E15 (parte 1B) ao catálogo nominal do portão de
 * isolamento: a pessoa global e a conta no município, migração
 * `054_pessoas_e_conta_no_municipio.sql` (ADR 0009, decisões 1, 3 e 7).
 *
 * O que entra, e por quê, em uma linha cada:
 *
 *   - `pessoas` e `origens_de_conta` como EXCEÇÕES NOMEADAS: sem
 *     `organizacao_id` e sem policy de contexto, e mantendo RLS forçada, zero
 *     grant (nem SELECT) para `dc360_app`, `dc360_console` e `PUBLIC`, nenhuma
 *     chave estrangeira sem município e nenhum DELETE (as quatro travas da
 *     decisão 3, conferidas pelo portão);
 *   - quatro funções SECURITY DEFINER: o gatilho criador, adiado e de
 *     comando (`conta_ganha_pessoa`, a ÚNICA que cita `origens_de_conta`,
 *     marca `criador`), o espelho da credencial (`pessoa_espelha_a_conta`,
 *     passo 1 da P-04), `vigencia_da_sessao` e `credenciais_da_pessoa`;
 *   - as duas funções de GATILHO privilegiadas com `executavelPor: []`
 *     (correção 1, C1): nenhum papel do produto as executa, porque o Postgres
 *     só confere o EXECUTE de função de gatilho no `CREATE TRIGGER`, e o
 *     EXECUTE só servia para anexá-las a outra tabela. Na forma do portão da
 *     parte 0G: `gatilhoEm`, os `gatilhos` declarados um a um e a linha real
 *     da prova da recusa fora da tabela (`semearParaProva`);
 *   - o UPDATE e o INSERT de `usuarios` por coluna, em listas positivas sem
 *     `pessoa_id` (`privilegiosDeColuna`; a 054 tira o UPDATE e o INSERT de
 *     TABELA que vinham da 001);
 *   - a chave `usuarios_pessoa_id_fkey` para a pessoa global
 *     (`chavesParaGlobais`), e `pessoas` (global) e `origens_de_conta`
 *     (protegida) com o destino na eliminação provado (`semMunicipio`: a pessoa
 *     fica, a marca some com a conta, correção 4 da ADR 0009);
 *   - o preparo de `origens_de_conta` para a prova comportamental (a coluna
 *     `transacao` é `xid8`, que a fábrica genérica não sabe gerar).
 *
 * `travar_pessoa`, `travar_pessoa_da_conta`, `pessoa_da_conta_nao_muda`,
 * `chave_da_pessoa_nao_muda`, `conta_nasce_no_contexto`, `linha_permanente` e
 * `sessao_carrega_a_pessoa` são SECURITY INVOKER e por isso não entram aqui:
 * rodam com o privilégio e o RLS de quem chama.
 */
import type { ContribuicaoDoCatalogo, DestinoNaEliminacao, PrivilegioDeColuna } from "./tipos.js";

const ETAPA = "V2-F03-E15";
const PROVA = "db/test/pessoas.test.ts";

/**
 * As colunas de `usuarios` que o papel de aplicação ATUALIZA hoje, e só
 * elas. Fora: `id`, `organizacao_id`, `criado_em`, `ultimo_acesso` (gravado
 * só por `registrar_tentativa_login`, do dono), `busca` (gerada) e
 * `pessoa_id` (decisão 1 da ADR 0009: atribuída uma vez, na criação, pelo
 * gatilho criador, e nunca muda). A E08 (passo 3) encolhe a lista: tira a
 * credencial e o e-mail.
 */
const UPDATE_DE_USUARIOS: ReadonlyArray<readonly [string, string]> = [
  ["nome", "o cadastro e a edição da conta por quem administra (`PATCH /usuarios/:id`)"],
  ["matricula", "o cadastro e a edição da conta por quem administra (`PATCH /usuarios/:id`)"],
  [
    "email",
    "a edição da conta por quem administra; a E09 tira o e-mail do PATCH e a E08 desta lista",
  ],
  [
    "papel",
    "a mudança de papel por quem administra, com a regra do posto e do último administrador",
  ],
  ["equipe_id", "a troca de equipe da conta por quem administra (`PATCH /usuarios/:id`)"],
  [
    "ativo",
    "a desativação e a reativação da conta (`PATCH /usuarios/:id/ativo`); a E09 a põe sob a trava da pessoa",
  ],
  [
    "senha_hash",
    "a redefinição de senha por quem administra (F00-E09), espelhada na pessoa; sai na E08",
  ],
  [
    "falhas_login",
    "a redefinição de senha por quem administra zera as falhas, espelhadas na pessoa; sai na E08",
  ],
  [
    "bloqueado_ate",
    "a redefinição de senha por quem administra solta o bloqueio, espelhado na pessoa; sai na E08",
  ],
  [
    "senha_provisoria_ate",
    "a redefinição de senha por quem administra carimba o prazo da senha provisória; sai na E08",
  ],
  ["foto_chave", "a foto da própria conta (`PUT /usuarios/eu/foto` e a remoção dela)"],
  ["foto_bytes", "o tamanho da foto da própria conta, que o teto de armazenamento confere (045)"],
];

/**
 * O UPDATE e o INSERT de `usuarios` por coluna, cada um num grupo (a forma da
 * parte 0G: a E08 encolhe cada lista com `redefine`, no arquivo dela). O
 * INSERT é a lista positiva das colunas que o cadastro de conta grava (API,
 * painel local, provisionamento por linha de comando), sem `pessoa_id`.
 */
const privilegiosDeColuna: readonly PrivilegioDeColuna[] = [
  {
    tabela: "usuarios",
    papel: "dc360_app",
    privilegio: "UPDATE",
    colunas: UPDATE_DE_USUARIOS.map(([coluna]) => coluna),
    migracao: "054",
    etapa: ETAPA,
    motivo:
      "UPDATE por coluna, e não mais de tabela (054), numa lista positiva das colunas que a API " +
      "grava hoje (" +
      UPDATE_DE_USUARIOS.map(([c, uso]) => `${c}: ${uso}`).join("; ") +
      "). `pessoa_id` fica fora; a E08 encolhe a lista com redefine.",
  },
  {
    tabela: "usuarios",
    papel: "dc360_app",
    privilegio: "INSERT",
    colunas: [
      "id",
      "organizacao_id",
      "nome",
      "matricula",
      "email",
      "papel",
      "equipe_id",
      "ativo",
      "senha_hash",
      "falhas_login",
      "bloqueado_ate",
      "senha_provisoria_ate",
      "foto_chave",
      "foto_bytes",
    ],
    migracao: "054",
    etapa: ETAPA,
    motivo:
      "INSERT por coluna, e não mais de tabela (decisão 1 da ADR 0009, junção do lote 1): o " +
      "cadastro de conta não informa `pessoa_id`, que o gatilho criador atribui; a recusa do " +
      "`pessoa_id` informado passa a ser de privilégio (42501), e o gatilho fica como segunda trava.",
  },
];

/** A conta da prova da eliminação e da recusa fora da tabela, pelo caminho de produção. */
const SEMEAR_CONTA =
  "INSERT INTO usuarios (organizacao_id, nome, matricula, email, papel) " +
  "VALUES (:org, 'Servidor da Prova', 'P-1', 'prova-eliminacao@exemplo.gov.br', 'administrador')";

const SEMEAR_CONTA_DO_OUTRO =
  "INSERT INTO usuarios (organizacao_id, nome, matricula, email, papel) " +
  "VALUES (:org, 'Servidor do Outro', 'P-2', 'outro-municipio-eliminacao@exemplo.gov.br', 'administrador')";

const PESSOA_FICA: DestinoNaEliminacao = {
  destino: "fica",
  porque:
    "A pessoa não se apaga na eliminação do município (ADR 0009, consequências; H98 decide o " +
    "destino definitivo): ela pode ter conta noutro município, e a linha é global.",
  semear: SEMEAR_CONTA,
  semearOutroMunicipio: SEMEAR_CONTA_DO_OUTRO,
  linhasDoMunicipio: "SELECT pessoa_id AS chave FROM usuarios WHERE organizacao_id = :org",
  coluna: "id",
};

/**
 * A marca SAI COM A CONTA (correção 4 da ADR 0009): nasce `some`, já na E15,
 * porque a correção 1 da 0G preserva regime e destino numa redefinição.
 */
const ORIGEM_SOME: DestinoNaEliminacao = {
  destino: "some",
  porque:
    "A marca é o registro de como a CONTA ganhou a pessoa (correção 3) e vai com a conta que " +
    "descreve (correção 4): a eliminação apaga as contas do município, e o gatilho AFTER DELETE " +
    "de `usuarios` apaga a marca de cada uma pelo `usuario_id`, e só ela. Sem `organizacao_id` e " +
    "fora da ordem de apagamento; a marca da conta da mesma pessoa noutro município fica igual.",
  semear: SEMEAR_CONTA,
  semearOutroMunicipio: SEMEAR_CONTA_DO_OUTRO,
  linhasDoMunicipio:
    "SELECT o.usuario_id AS chave FROM origens_de_conta o JOIN usuarios u ON u.id = o.usuario_id " +
    "WHERE u.organizacao_id = :org",
  coluna: "usuario_id",
};

/**
 * A linha real das duas funções de gatilho na prova da recusa fora da
 * tabela (correção 2 da 0G): uma conta nova, pelo caminho de produção, que
 * faz o gatilho criador pôr a pessoa e a marca; com isso a cópia da linha em
 * `pg_temp.usuarios` carrega chaves que existem em `pessoas` e em
 * `origens_de_conta`.
 */
const SEMEAR_PARA_PROVA = `${SEMEAR_CONTA.replace("prova-eliminacao@", "prova-gatilho@")};`;

const SEM_GRANT = { dc360_app: [], dc360_console: [], PUBLIC: [] } as const;

export const CATALOGO_F03_E15: ContribuicaoDoCatalogo = {
  funcoes: [
    {
      nome: "conta_ganha_pessoa",
      assinatura: "public.conta_ganha_pessoa()",
      migracao: "054",
      etapa: ETAPA,
      executavelPor: [],
      gatilhoEm: ["usuarios"],
      gatilhos: [
        {
          tabela: "usuarios",
          nome: "usuarios_ganha_pessoa",
          momento: "BEFORE",
          nivel: "ROW",
          eventos: ["INSERT"],
        },
        {
          tabela: "usuarios",
          nome: "usuarios_marca_sai_com_a_conta",
          momento: "AFTER",
          nivel: "ROW",
          eventos: ["DELETE"],
        },
      ],
      semearParaProva: SEMEAR_PARA_PROVA,
      motivo:
        "ESCRITORA de `origens_de_conta`, nos dois gatilhos de `public.usuarios`: o criador " +
        "(BEFORE INSERT) cria a pessoa NOVA da conta que chega sem `pessoa_id` e grava a marca " +
        "`criador`; o de AFTER DELETE apaga a marca da conta apagada, e só ela (correção 4 da ADR " +
        "0009). Não verifica: o verificador é a leitora `conferir_origem_da_conta` (correção 6). " +
        "Privilegiada porque o `dc360_app` cadastra conta e não alcança `pessoas` nem " +
        "`origens_de_conta`. Nenhum papel do produto a executa (correção 1, C1).",
      tenant: "contexto",
      confere:
        "Só serve aos dois gatilhos nomeados de `public.usuarios` (confere TG_RELID, a operação, " +
        "o nome, o momento e o nível; outra tabela, mesmo TEMP `usuarios`, é recusada com 42501). " +
        "Age só sobre a linha inserida (NEW) ou apagada (OLD, apagando só a marca dela), sem " +
        "parâmetro e sem procurar pessoa existente. Antes dela, " +
        "o gatilho comum `conta_nasce_no_municipio_do_contexto` recusa, com o erro da policy, a " +
        "conta que o RLS recusaria (sem oráculo de e-mail); com município no contexto, ela mesma " +
        "recusa a conta de outro município (o dono). `pessoa_id` informado é recusado (42501).",
      provas: [PROVA],
      gravaOrigemDeConta: "criador",
    },
    {
      nome: "conferir_origem_da_conta",
      assinatura: "public.conferir_origem_da_conta()",
      migracao: "054",
      etapa: ETAPA,
      executavelPor: [],
      gatilhoEm: ["usuarios"],
      gatilhos: [
        {
          tabela: "usuarios",
          nome: "usuarios_origem_da_pessoa",
          momento: "AFTER",
          nivel: "ROW",
          eventos: ["INSERT"],
          adiado: "INITIALLY DEFERRED",
        },
        {
          tabela: "usuarios",
          nome: "usuarios_nenhuma_pessoa_sem_conta",
          momento: "AFTER",
          nivel: "STATEMENT",
          eventos: ["INSERT"],
        },
      ],
      semearParaProva: SEMEAR_PARA_PROVA,
      leOrigemDeConta: "verificador",
      motivo:
        "LEITORA de `origens_de_conta` (ADR 0009, decisão 1, correção 6): o verificador adiado " +
        "(constraint trigger AFTER INSERT de linha) confere, no fim da transação, que a conta tem a " +
        "marca `criador` da MESMA transação e da MESMA pessoa da linha final, e que a pessoa existe; " +
        "o de comando (AFTER INSERT, FOR EACH STATEMENT) recusa marca `criador` da transação sem " +
        "conta (ON CONFLICT DO NOTHING). Privilegiada porque o `dc360_app` não lê `origens_de_conta` " +
        "nem `pessoas`. Nenhum papel do produto a executa.",
      tenant: "antes_do_tenant",
      confere:
        "Não consulta município: a única chave é a conta que disparou o gatilho (`NEW.id`), já gravada sob o RLS de quem inseriu. Só LÊ: corpo conferido por lista permitida (`leitora.ts`), `search_path` fixo em " +
        "`pg_catalog, public, pg_temp`, só a marca da própria conta (`usuario_id = NEW.id`) ou as " +
        "da própria transação, e a pessoa só pelo id (`NEW.pessoa_id`); a recusa sai com SQLSTATE " +
        "fixo e literais, sem valor lido. Só serve aos dois gatilhos nomeados de `public.usuarios` " +
        "(TG_RELID, operação, nome, momento e nível; outra tabela é recusada com 42501).",
      provas: [PROVA],
    },
    {
      nome: "pessoa_espelha_a_conta",
      assinatura: "public.pessoa_espelha_a_conta()",
      migracao: "054",
      etapa: ETAPA,
      executavelPor: [],
      gatilhoEm: ["usuarios"],
      gatilhos: [
        {
          tabela: "usuarios",
          nome: "pessoa_recebe_a_credencial_da_conta",
          momento: "AFTER",
          nivel: "ROW",
          eventos: ["UPDATE"],
          colunasDoUpdate: [
            "senha_hash",
            "falhas_login",
            "bloqueado_ate",
            "senha_provisoria_ate",
            "email",
          ],
          quando:
            "((old.senha_hash IS DISTINCT FROM new.senha_hash) OR (old.falhas_login IS DISTINCT FROM new.falhas_login) OR (old.bloqueado_ate IS DISTINCT FROM new.bloqueado_ate) OR (old.senha_provisoria_ate IS DISTINCT FROM new.senha_provisoria_ate) OR (old.email IS DISTINCT FROM new.email))",
        },
      ],
      semearParaProva: SEMEAR_PARA_PROVA,
      motivo:
        "Espelho de mão única da credencial e do e-mail de `usuarios` para `pessoas` (P-04, passo " +
        "1 da ADR 0009), no gatilho `pessoa_recebe_a_credencial_da_conta`, que dispara antes do " +
        "da 051 (N4 antes de N7). Privilegiada porque quem atualiza a conta pode ser o " +
        "`dc360_app` (a redefinição de senha por quem administra), que não alcança `pessoas`. A " +
        "E08 a desliga. Nenhum papel do produto a executa (correção 1, C1).",
      tenant: "contexto",
      confere:
        "Só serve ao gatilho AFTER UPDATE nomeado de `public.usuarios` (TG_RELID, nome, momento e " +
        "nível; outra tabela, mesmo TEMP `usuarios`, é recusada com 42501). " +
        "Atinge só a pessoa da própria conta atualizada (NEW.pessoa_id), cuja linha já passou " +
        "pelo RLS de quem atualizou; com município no contexto, recusa conta de outro município. " +
        "Pessoa não encontrada levanta erro: a escrita na conta volta inteira, nunca calada.",
      provas: [PROVA],
    },
    {
      nome: "vigencia_da_sessao",
      assinatura: "public.vigencia_da_sessao(uuid,uuid,uuid)",
      migracao: "054",
      etapa: ETAPA,
      executavelPor: ["dc360_app"],
      motivo:
        "A vigência de (sub, org, sid) numa consulta, lendo a pessoa (senha provisória, ativo) " +
        "que o papel de aplicação não alcança: município suspenso, conta da pessoa no município, " +
        "papel e nome da conta, sessão viva da conta e da pessoa. Sem quem a chame até a E02 e " +
        "a E03 (decisão 2 da ADR 0009).",
      tenant: "contexto",
      confere:
        "Exige `org = app_organizacao_atual()`: com outro município (ou sem contexto) não devolve " +
        "nada, nem a linha do município. A sessão só vale se for da conta E da pessoa naquele " +
        "município; pertencer a vários municípios nunca dá acesso a vários.",
      provas: [PROVA],
    },
    {
      nome: "credenciais_da_pessoa",
      assinatura: "public.credenciais_da_pessoa(text)",
      migracao: "054",
      etapa: ETAPA,
      executavelPor: ["dc360_app"],
      motivo:
        "O substituto de `credenciais_para_login` para a E02 (passo 2 da P-04: a API passa a LER " +
        "a credencial da pessoa). O login acontece antes de existir contexto de município. Busca " +
        "por igualdade de e-mail, sem filtro, ordem livre nem limite; não compara senha.",
      tenant: "antes_do_tenant",
      confere:
        "Só antes do município: com município no contexto, recusa (42501), seja qual for o " +
        "e-mail (correção 1, C2), e dentro de A nunca devolve a conta de B. " +
        "O e-mail é o único caminho: `pessoas_email_idx` (total até a E09) garante uma pessoa por " +
        "e-mail, e cada linha devolvida é uma conta DELA, com o município da própria conta. Até a " +
        "064 o `UNIQUE (pessoa_id)` garante uma conta só.",
      provas: [PROVA],
    },
  ],
  excecoes: [
    {
      tabela: "pessoas",
      dispensa: ["organizacao_id", "policy_de_contexto"],
      mantem: ["rls_forcada", "grants_declarados", "fk_com_organizacao", "sem_delete"],
      grants: SEM_GRANT,
      etapa: ETAPA,
      motivo:
        "A pessoa GLOBAL da ADR 0009 (decisão 1): nome, e-mail e credencial valem em todo " +
        "município onde a pessoa tem conta, então não pertencem a município nenhum. O que é do " +
        "município (papel, matrícula, equipe, ativo da conta) continua em `usuarios`, sob o RLS.",
      trava:
        "As quatro travas da decisão 3: RLS ativada e forçada SEM nenhuma policy (até o dono sem " +
        "BYPASSRLS lê zero linhas); nenhum privilégio de `dc360_app`, `dc360_console` ou PUBLIC, " +
        "nem SELECT (toque do app dá 42501, provado em pessoas.test.ts); acesso só pelas funções " +
        "desta lista; a lista conferida nos dois sentidos. A pessoa não se apaga (gatilho).",
      semMunicipio: { especie: "global", naEliminacao: PESSOA_FICA },
    },
    {
      tabela: "origens_de_conta",
      dispensa: ["organizacao_id", "policy_de_contexto"],
      mantem: ["rls_forcada", "grants_declarados", "fk_com_organizacao", "sem_delete"],
      grants: SEM_GRANT,
      etapa: ETAPA,
      motivo:
        "De onde veio o `pessoa_id` de cada conta (correção 3 da ADR 0009): `backfill`, `criador` " +
        "ou `aceite`, com a transação de quem gravou, para o gatilho adiado distinguir o valor " +
        "criado pelo gatilho criador do informado pelo chamador. É registro da ligação conta e " +
        "pessoa, global como a pessoa; sem `organizacao_id` para não entrar na ordem de eliminação.",
      trava:
        "RLS forçada sem policy e nenhum privilégio de papel nenhum do produto, nem SELECT: o " +
        "`dc360_app` não define a marca. Só a função do gatilho criador cita a tabela (regra da " +
        "0D, `gravaOrigemDeConta`). Nada a altera (gatilho de linha permanente), e só sai com a conta que descreve (gatilho AFTER DELETE de `usuarios`; a marca de conta viva não se apaga para ninguém, correção 4).",
      semMunicipio: { especie: "protegida", naEliminacao: ORIGEM_SOME },
    },
  ],
  colunasComUpdate: [],
  privilegiosDeColuna,
  chavesParaGlobais: [
    {
      tabela: "usuarios",
      restricao: "usuarios_pessoa_id_fkey",
      colunas: ["pessoa_id"],
      alvo: "pessoas",
      colunasReferenciadas: ["id"],
      migracao: "054",
      etapa: ETAPA,
      motivo:
        "A conta aponta para a pessoa GLOBAL (decisão 1 da ADR 0009): a chave não pode incluir " +
        "`organizacao_id`, porque a pessoa não tem município; nenhum papel do produto grava a coluna.",
    },
  ],
  preparos: [
    {
      tabela: "origens_de_conta",
      colunas: { transacao: "pg_current_xact_id()" },
      etapa: ETAPA,
      motivo:
        "A coluna `transacao` é `xid8` (o `pg_current_xact_id()` de quem gravou a marca), tipo " +
        "que a fábrica genérica da prova comportamental não sabe gerar.",
    },
  ],
};
