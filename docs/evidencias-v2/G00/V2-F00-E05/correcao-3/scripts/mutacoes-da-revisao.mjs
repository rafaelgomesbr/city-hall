// Mutações novas (revisão da correção 3). Âncora: logo depois de `autorizar`, ANTES da validação do corpo,
// para a prova dinâmica alcançar (coordA e coordB passam de `autorizar` em POST /orgaos).
export const ANCORA = '    const quem = await autorizar(app, req, "gerenciar_equipes");\n    const dados = orgaoSchema.parse(req.body);\n\n    try {\n      const criado';
const dentro = (t) => ANCORA.replace("    const dados", t + "\n    const dados");
const r = (nome, trecho, extra = {}) => ({ nome, arquivo: "rotas/orgaos.ts", de: ANCORA, para: dentro(trecho), ...extra });
export const MUTACOES = [
  r("M01_new_por_colchete_calculado",
    '    const servidorM01 = await import("../servidor.js");\n'
    + '    const classeM01 = ("Regra" + "DeNegocio") as "RegraDeNegocio";\n'
    + '    if (quem.papel === "coordenador") throw new servidorM01[classeM01]("vazou_m01", "x", 403);'),
  r("M02_construtor_tirado_da_instancia",
    '    const baseM02 = new RegraDeNegocio("sem_permissao", "Sem permissão.", 403);\n'
    + '    const ConstrutorM02 = baseM02.constructor as typeof RegraDeNegocio;\n'
    + '    if (quem.papel === "coordenador") throw new ConstrutorM02("vazou_m02", "x", 403);'),
  r("M03_codigo_escrito_por_chave_const",
    '    const campoM03 = "codigo";\n'
    + '    const erroM03 = new RegraDeNegocio("sem_permissao", "Sem permissão.", 403);\n'
    + '    (erroM03 as unknown as Record<string, unknown>)[campoM03] = "vazou_m03";\n'
    + '    if (quem.papel === "coordenador") throw erroM03;'),
  r("M04_Object_apelidado_assign",
    '    const ObjM04 = Object;\n'
    + '    const erroM04 = new RegraDeNegocio("sem_permissao", "Sem permissão.", 403);\n'
    + '    ObjM04.assign(erroM04, { codigo: "vazou_m04" });\n'
    + '    if (quem.papel === "coordenador") throw erroM04;'),
  r("M05_globalThis_Object_defineProperty",
    '    const erroM05 = new RegraDeNegocio("sem_permissao", "Sem permissão.", 403);\n'
    + '    globalThis.Object.defineProperty(erroM05, "codigo", { value: "vazou_m05" });\n'
    + '    if (quem.papel === "coordenador") throw erroM05;'),
  r("M06_subclasse_com_codigo_entre_aspas",
    '    class RecusaM06 extends RegraDeNegocio {\n      override readonly "codigo" = "vazou_m06";\n      constructor() { super("sem_permissao", "Sem permissão.", 403); }\n    }\n'
    + '    if (quem.papel === "coordenador") throw new RecusaM06();'),
  {
    nome: "M07_onSend_nas_opcoes_da_rota", arquivo: "rotas/orgaos.ts",
    de: '  app.post("/", async (req, resposta) => {\n    const quem = await autorizar(app, req, "gerenciar_equipes");',
    para: '  app.post("/", {\n    onSend: async (_req, rep, payload) => (rep.statusCode === 403 ? String(payload).replace("sem_permissao", "vazou_m07") : payload),\n  }, async (req, resposta) => {\n    const quem = await autorizar(app, req, "gerenciar_equipes");',
  },
  r("M08_socket_da_requisicao",
    '    if (quem.papel === "coordenador") { req.socket.end("HTTP/1.1 403 Forbidden\\r\\ncontent-type: application/json\\r\\nconnection: close\\r\\n\\r\\n{\\"erro\\":\\"vazou_m08\\"}"); return; }'),
  {
    nome: "M09_JSON_stringify_trocado", arquivo: "rotas/orgaos.ts", de: ANCORA, para: ANCORA,
    fim: 'const stringifyM09 = JSON.stringify;\nJSON.stringify = ((v: unknown) => String(stringifyM09(v)).replace("sem_permissao", "vazou_m09")) as typeof JSON.stringify;',
  },
  r("M10_status_por_chave_const_e_corpo_no_return",
    '    const campoM10 = "statusCode";\n    const s403M10 = 403;\n'
    + '    if (quem.papel === "coordenador") { (resposta as unknown as Record<string, unknown>)[campoM10] = s403M10; return { erro: "vazou_m10", mensagem: "x" }; }'),
  r("M11_code_duas_vezes_na_cadeia",
    '    if (quem.papel === "coordenador") return resposta.code(200).code(403).send({ erro: "vazou_m11", mensagem: "x" });'),
  r("M12_Proxy_no_erro",
    '    const erroM12 = new Proxy(new RegraDeNegocio("sem_permissao", "Sem permissão.", 403), {\n'
    + '      get: (alvo, p) => (p === "codigo" ? "vazou_m12" : (alvo as unknown as Record<string | symbol, unknown>)[p]),\n    });\n'
    + '    if (quem.papel === "coordenador") throw erroM12;'),
  r("M13_parametro_desestruturado_homonimo",
    '    const corpoM13 = { erro: "sem_permissao", mensagem: "Sem permissão." };\n    void corpoM13.mensagem;\n'
    + '    const recusarM13 = ({ corpoM13 }: { corpoM13: { erro: string; mensagem: string } }) => resposta.code(403).send(corpoM13);\n'
    + '    if (quem.papel === "coordenador") return recusarM13({ corpoM13: { erro: "vazou_m13", mensagem: "x" } });'),
  r("M14_variavel_de_laco_homonima",
    '    const corpoM14 = { erro: "sem_permissao", mensagem: "Sem permissão." };\n    void corpoM14.mensagem;\n'
    + '    if (quem.papel === "coordenador") for (const corpoM14 of [{ erro: "vazou_m14", mensagem: "x" }]) return resposta.code(403).send(corpoM14);'),
  r("M15_status_da_classe_escrito_por_chave_const",
    '    const campoM15 = "status";\n    const s403M15 = 403;\n'
    + '    const erroM15 = new RegraDeNegocio("vazou_m15", "x", 409);\n'
    + '    (erroM15 as unknown as Record<string, unknown>)[campoM15] = s403M15;\n'
    + '    if (quem.papel === "coordenador") throw erroM15;'),
  {
    nome: "M16_arquivo_mts_dentro_de_src", arquivo: "rotas/orgaos.ts",
    de: 'import { registrarAtoAdministrativo } from "../trilha.js";',
    para: 'import { registrarAtoAdministrativo } from "../trilha.js";\nimport { recusarM16 } from "./recusa-m16.mjs";',
    novo: { caminho: "dc360/apps/api/src/rotas/recusa-m16.mts", fonte: 'import type { FastifyReply } from "fastify";\n\nexport function recusarM16(resposta: FastifyReply) {\n  return resposta.code(403).send({ erro: "vazou_m16", mensagem: "x" });\n}\n' },
    extra: { de: ANCORA, para: dentro('    if (quem.papel === "coordenador") return recusarM16(resposta);') },
  },
];
