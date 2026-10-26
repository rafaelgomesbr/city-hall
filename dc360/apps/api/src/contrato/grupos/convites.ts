import type { GrupoDoContrato } from "../tipos.js";

/**
 * O convite de conta (`rotas/convites.ts`, V2-F03-E10). VAZIO na abertura da
 * API da F03 (parte 1C): o dono (E10) acrescenta as entradas aqui, uma por
 * rota, com `resposta` e `nova: true`. Sem rotas, o teste de paridade com o
 * servidor segue verde.
 */
export const grupo: GrupoDoContrato = {
  nome: "convites",
  rotas: [],
  pendentes: [],
};
