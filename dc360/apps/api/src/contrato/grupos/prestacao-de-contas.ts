import { ERROS_AUTORIZADA } from "../comuns.js";
import { rota, type GrupoDoContrato } from "../tipos.js";

/**
 * Prestação de contas: trilha, relatórios e a saída do município
 * (`rotas/prestacao-de-contas.ts` e `rotas/saida.ts`). Parte 3C3 do lote 3.
 *
 * Em `pendentes`, as quatro rotas de leitura cujo filtro (`filtroTrilhaSchema`,
 * `filtroExportacaoSchema`, `nivelDaExportacaoSchema`, `filtroConsultasSchema`)
 * mora dentro do arquivo da rota. A 3C3 os exporta e tira a rota da lista. O
 * CSV e o ZIP são arquivos: a `resposta` deles leva `tipo`, sem esquema.
 */
export const grupo: GrupoDoContrato = {
  nome: "prestacao-de-contas",
  rotas: [
    rota({
      metodo: "GET",
      caminho: "/v1/trilha/tipos",
      resumo: "Lista os tipos de evento da trilha de auditoria, para a tela montar o filtro.",
      erros: ERROS_AUTORIZADA,
    }),
    rota({
      metodo: "GET",
      caminho: "/v1/relatorios/exportacoes",
      resumo: "Quem exportou o quê e quando (registro de operações da LGPD).",
      erros: ERROS_AUTORIZADA,
    }),
    rota({
      metodo: "POST",
      caminho: "/v1/saida/pacote.zip",
      resumo:
        "Gera o pacote de saída do município: ato do administrador, que exige duas permissões.",
      erros: ERROS_AUTORIZADA,
    }),
  ],
  pendentes: [
    "GET /v1/trilha",
    "GET /v1/relatorios/ocorrencias.csv",
    "GET /v1/relatorios/resumo",
    "GET /v1/relatorios/consultas",
  ],
};
