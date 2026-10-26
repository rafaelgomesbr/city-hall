import type { GrupoDoContrato } from "../tipos.js";

/**
 * O sigilo da ocorrência (`rotas/sigilo.ts`, V2-F03-E21). VAZIO na abertura da
 * API da F03 (parte 1C): o dono (E21) acrescenta as entradas aqui, uma por
 * rota, com `resposta` e `nova: true`. Sem rotas, o teste de paridade com o
 * servidor segue verde.
 */
export const grupo: GrupoDoContrato = {
  nome: "sigilo",
  rotas: [],
  pendentes: [],
};
