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
 *   - quatro funções SECURITY DEFINER: o gatilho criador e adiado
 *     (`conta_ganha_pessoa`, a ÚNICA que cita `origens_de_conta`, marca
 *     `criador`), o espelho da credencial (`pessoa_espelha_a_conta`, passo 1
 *     da P-04), `vigencia_da_sessao` e `credenciais_da_pessoa`;
 *   - o UPDATE de `usuarios` por coluna, numa lista positiva sem `pessoa_id`
 *     (a 054 tira o UPDATE de TABELA que vinha da 001);
 *   - o preparo de `origens_de_conta` para a prova comportamental (a coluna
 *     `transacao` é `xid8`, que a fábrica genérica não sabe gerar).
 *
 * `travar_pessoa`, `travar_pessoa_da_conta`, `pessoa_da_conta_nao_muda`,
 * `linha_permanente` e `sessao_carrega_a_pessoa` são SECURITY INVOKER e por
 * isso não entram aqui: rodam com o privilégio e o RLS de quem chama.
 */
import type { ColunaComUpdate, ContribuicaoDoCatalogo } from "./tipos.js";

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

const colunasComUpdate: readonly ColunaComUpdate[] = UPDATE_DE_USUARIOS.map(([coluna, uso]) => ({
  tabela: "usuarios",
  coluna,
  migracao: "054",
  etapa: ETAPA,
  motivo:
    `UPDATE por coluna, e não mais de tabela (054): ${uso}. A lista positiva deixa ` +
    "`pessoa_id` fora do alcance do papel de aplicação.",
}));

const SEM_GRANT = { dc360_app: [], dc360_console: [], PUBLIC: [] } as const;

export const CATALOGO_F03_E15: ContribuicaoDoCatalogo = {
  funcoes: [
    {
      nome: "conta_ganha_pessoa",
      assinatura: "public.conta_ganha_pessoa()",
      migracao: "054",
      etapa: ETAPA,
      executavelPor: ["dc360_app"],
      motivo:
        "Função dos dois gatilhos de INSERT de `usuarios`: o criador (BEFORE) cria a pessoa NOVA " +
        "da conta que chega sem `pessoa_id` e grava a marca `criador` em `origens_de_conta`; o " +
        "adiado (constraint trigger, fim da transação) confere marca, transação e pessoa da linha " +
        "final. Privilegiada porque o `dc360_app` cadastra conta e não alcança `pessoas` nem " +
        "`origens_de_conta`. O EXECUTE ao app é inerte: função de gatilho não se chama fora de " +
        "gatilho (provado em pessoas.test.ts).",
      tenant: "contexto",
      confere:
        "Age só sobre a linha inserida (NEW), sem parâmetro e sem procurar pessoa existente. Com " +
        "município no contexto, recusa (42501) a conta de outro município antes de criar a pessoa; " +
        "o RLS de `usuarios` confere o mesmo logo depois. `pessoa_id` informado é recusado (42501).",
      provas: [PROVA],
      gravaOrigemDeConta: "criador",
    },
    {
      nome: "pessoa_espelha_a_conta",
      assinatura: "public.pessoa_espelha_a_conta()",
      migracao: "054",
      etapa: ETAPA,
      executavelPor: ["dc360_app"],
      motivo:
        "Espelho de mão única da credencial e do e-mail de `usuarios` para `pessoas` (P-04, passo " +
        "1 da ADR 0009). Privilegiada porque quem atualiza a conta pode ser o `dc360_app` (a " +
        "redefinição de senha por quem administra), que não alcança `pessoas`. A E08 a desliga. " +
        "O EXECUTE ao app é inerte (função de gatilho).",
      tenant: "contexto",
      confere:
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
        "0D, `gravaOrigemDeConta`). Nada a altera nem a apaga (gatilho de linha permanente).",
    },
  ],
  colunasComUpdate,
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
