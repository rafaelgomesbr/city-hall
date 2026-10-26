import {
  aberturaOcorrenciaSchema,
  correcaoDeCoordenadaSchema,
  desinterdicaoSchema,
  despachoSchema,
  encerramentoSchema,
  respostaProvidenciaSchema,
  triagemSchema,
} from "@dc360/shared";
import {
  ERROS_AUTENTICADA,
  ERROS_AUTORIZADA,
  parametroId,
  parametroIdEProvidencia,
} from "../comuns.js";
import { rota, type GrupoDoContrato } from "../tipos.js";

/**
 * Ocorrências (`rotas/ocorrencias.ts`). Parte 3C2 do lote 3.
 *
 * Fora do registro por enquanto, em `pendentes`, as quatro rotas cujo esquema
 * de query ou de corpo mora DENTRO de `rotas/ocorrencias.ts` (`consultaSchema`,
 * `consultaMapaSchema`, a query inline de duplicidades e
 * `providenciaComOrgaoSchema`). Copiá-los aqui criaria a segunda fonte da
 * verdade; a 3C2 os exporta e tira a rota da lista.
 */
export const grupo: GrupoDoContrato = {
  nome: "ocorrencias",
  rotas: [
    rota({
      metodo: "POST",
      caminho: "/v1/ocorrencias",
      resumo:
        "Abre uma ocorrência a partir de uma solicitação, com protocolo gerado pelo servidor.",
      corpo: aberturaOcorrenciaSchema,
      erros: [...ERROS_AUTORIZADA, "dados_invalidos"],
    }),
    rota({
      metodo: "GET",
      caminho: "/v1/ocorrencias/:id",
      resumo:
        "Lê o dossiê de uma ocorrência do município (agente de campo só vê as da própria equipe).",
      parametros: parametroId,
      erros: [...ERROS_AUTENTICADA, "dados_invalidos", "nao_encontrada"],
    }),
    rota({
      metodo: "POST",
      caminho: "/v1/ocorrencias/:id/triagem",
      resumo: "Registra a triagem: severidade, vulnerabilidade e, se mudar, o tipo COBRADE.",
      parametros: parametroId,
      corpo: triagemSchema,
      erros: [...ERROS_AUTORIZADA, "dados_invalidos", "nao_encontrada"],
    }),
    rota({
      metodo: "POST",
      caminho: "/v1/ocorrencias/:id/despacho",
      resumo: "Despacha uma equipe para a ocorrência.",
      parametros: parametroId,
      corpo: despachoSchema,
      erros: [...ERROS_AUTORIZADA, "dados_invalidos", "nao_encontrada"],
    }),
    rota({
      metodo: "POST",
      caminho: "/v1/ocorrencias/:id/providencia/:providenciaId/resposta",
      resumo: "Registra a resposta do órgão a uma providência encaminhada.",
      parametros: parametroIdEProvidencia,
      corpo: respostaProvidenciaSchema,
      erros: [...ERROS_AUTORIZADA, "dados_invalidos", "nao_encontrada"],
    }),
    rota({
      metodo: "POST",
      caminho: "/v1/ocorrencias/:id/encerramento",
      resumo: "Encerra a ocorrência com motivo (registro não se apaga, se encerra).",
      parametros: parametroId,
      corpo: encerramentoSchema,
      erros: [...ERROS_AUTORIZADA, "dados_invalidos", "nao_encontrada"],
    }),
    rota({
      metodo: "POST",
      caminho: "/v1/ocorrencias/:id/desinterdicao",
      resumo: "Levanta a interdição de uma ocorrência interditada.",
      parametros: parametroId,
      corpo: desinterdicaoSchema,
      erros: [...ERROS_AUTORIZADA, "dados_invalidos", "nao_encontrada"],
    }),
    rota({
      metodo: "POST",
      caminho: "/v1/ocorrencias/:id/coordenada",
      resumo: "Corrige a coordenada de abertura da ocorrência, sem tocar na medida em campo.",
      parametros: parametroId,
      corpo: correcaoDeCoordenadaSchema,
      erros: [...ERROS_AUTORIZADA, "dados_invalidos", "nao_encontrada"],
    }),
    rota({
      metodo: "GET",
      caminho: "/v1/ocorrencias/devolvidas",
      resumo:
        "Lista as ocorrências cujas tarefas o agente devolveu e esperam decisão da coordenação.",
      erros: ERROS_AUTORIZADA,
    }),
    rota({
      metodo: "GET",
      caminho: "/v1/ocorrencias/interditados",
      resumo:
        "Lista as ocorrências com interdição ativa (agente de campo só vê as da própria equipe).",
      erros: ERROS_AUTENTICADA,
    }),
    rota({
      metodo: "GET",
      caminho: "/v1/ocorrencias/providencias/pendentes",
      resumo: "Lista as providências encaminhadas que ainda esperam resposta do órgão.",
      erros: ERROS_AUTENTICADA,
    }),
    rota({
      metodo: "GET",
      caminho: "/v1/ocorrencias/indicadores/painel",
      resumo: "Os indicadores do painel do coordenador.",
      erros: ERROS_AUTENTICADA,
    }),
  ],
  pendentes: [
    "GET /v1/ocorrencias",
    "GET /v1/ocorrencias/mapa",
    "GET /v1/ocorrencias/duplicidades/consulta",
    "POST /v1/ocorrencias/:id/providencia",
  ],
};
