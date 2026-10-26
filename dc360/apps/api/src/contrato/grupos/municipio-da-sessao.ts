import type { GrupoDoContrato } from "../tipos.js";

/**
 * O município da sessão: escolha no login e troca de município
 * (`rotas/municipio-da-sessao.ts`, V2-F03-E16). VAZIO na abertura da API da F03
 * (parte 1C): o dono (E16) acrescenta as entradas aqui, uma por rota, com
 * `resposta` e `nova: true`. Sem rotas, o teste de paridade com o servidor
 * segue verde.
 */
export const grupo: GrupoDoContrato = {
  nome: "municipio-da-sessao",
  rotas: [],
  pendentes: [],
};
