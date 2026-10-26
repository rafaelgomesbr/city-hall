import {
  devolucaoDeTarefaSchema,
  encerramentoDeSaidaSchema,
  envelopeSincronizacaoSchema,
  prorrogacaoDeSaidaSchema,
  retornoDeCampoSchema,
  saidaACampoSchema,
} from "@dc360/shared";
import { ERROS_AUTENTICADA, ERROS_AUTORIZADA, parametroId } from "../comuns.js";
import { rota, type GrupoDoContrato } from "../tipos.js";

/**
 * O trabalho do agente de campo: fila de sincronização, tarefa, saída a campo
 * e evidências (`rotas/sincronizacao.ts`, `campo.ts`, `saida-a-campo.ts`,
 * `evidencias.ts`). Parte 3C2 do lote 3.
 *
 * Em `pendentes`, as três rotas cujo esquema de corpo mora dentro do arquivo
 * da rota (`reconciliacaoSchema` e o `pedidoSchema`/`confirmacaoSchema` de
 * evidência): a 3C2 os exporta e tira a rota da lista. `evidencias.ts` é
 * tocado pela parte 2E; o registro só descreve as rotas.
 */
export const grupo: GrupoDoContrato = {
  nome: "campo",
  rotas: [
    rota({
      metodo: "POST",
      caminho: "/v1/sincronizacao/vistoria",
      resumo: "Recebe o envelope de uma vistoria feita em campo, de forma idempotente por chave.",
      corpo: envelopeSincronizacaoSchema,
      erros: [...ERROS_AUTORIZADA, "dados_invalidos"],
    }),
    rota({
      metodo: "POST",
      caminho: "/v1/sincronizacao/devolucao",
      resumo: "Recebe a devolução de uma tarefa pelo agente, de forma idempotente por chave.",
      corpo: devolucaoDeTarefaSchema,
      erros: [...ERROS_AUTORIZADA, "dados_invalidos"],
    }),
    rota({
      metodo: "GET",
      caminho: "/v1/sincronizacao/pendencias",
      resumo:
        "Lista as ocorrências despachadas para as equipes do agente: o que o aparelho baixa para trabalhar sem sinal (limitada, com aviso de truncamento).",
      erros: ERROS_AUTORIZADA,
    }),
    rota({
      metodo: "GET",
      caminho: "/v1/campo/meu-trabalho",
      resumo:
        "A tela do agente: a equipe dele, os chamados da equipe e as vistorias que ele já concluiu.",
      erros: ERROS_AUTORIZADA,
    }),
    rota({
      metodo: "POST",
      caminho: "/v1/saida-a-campo",
      resumo: "O agente declara que saiu a campo, com a duração prevista e se vai sozinho.",
      corpo: saidaACampoSchema,
      erros: [...ERROS_AUTORIZADA, "dados_invalidos"],
    }),
    rota({
      metodo: "POST",
      caminho: "/v1/saida-a-campo/prorrogar",
      resumo: "O agente prorroga o prazo de retorno da saída aberta.",
      corpo: prorrogacaoDeSaidaSchema,
      erros: [...ERROS_AUTORIZADA, "dados_invalidos"],
    }),
    rota({
      metodo: "POST",
      caminho: "/v1/saida-a-campo/retorno",
      resumo: "O agente declara que voltou do campo.",
      corpo: retornoDeCampoSchema,
      erros: [...ERROS_AUTORIZADA, "dados_invalidos"],
    }),
    rota({
      metodo: "POST",
      caminho: "/v1/saida-a-campo/encerrar",
      resumo: "A coordenação encerra uma saída a campo, registrando o desfecho.",
      corpo: encerramentoDeSaidaSchema,
      erros: [...ERROS_AUTORIZADA, "dados_invalidos"],
    }),
    rota({
      metodo: "GET",
      caminho: "/v1/saida-a-campo",
      resumo: "Lista as saídas a campo abertas e as que estouraram o prazo, para a coordenação.",
      erros: ERROS_AUTORIZADA,
    }),
    rota({
      metodo: "GET",
      caminho: "/v1/saida-a-campo/minha",
      resumo: "Lê a saída a campo aberta do próprio agente.",
      erros: ERROS_AUTORIZADA,
    }),
    rota({
      metodo: "GET",
      caminho: "/v1/evidencias/:id/url",
      resumo: "Devolve a URL assinada, de vida curta, para ver uma evidência do município.",
      parametros: parametroId,
      erros: [...ERROS_AUTENTICADA, "dados_invalidos"],
    }),
    rota({
      metodo: "GET",
      caminho: "/v1/evidencias/ocorrencia/:id",
      resumo: "Lista as evidências de uma ocorrência.",
      parametros: parametroId,
      erros: [...ERROS_AUTENTICADA, "dados_invalidos"],
    }),
  ],
  pendentes: [
    "POST /v1/sincronizacao/pendencias/reconciliar",
    "POST /v1/evidencias/autorizar-envio",
    "POST /v1/evidencias/confirmar-envio",
  ],
};
