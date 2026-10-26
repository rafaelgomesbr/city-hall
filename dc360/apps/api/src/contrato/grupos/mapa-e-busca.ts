import { z } from "zod";
import { SEVERIDADES, STATUS_OCORRENCIA } from "@dc360/shared";
import { consultaSchema as consultaDaBusca } from "../../rotas/busca.js";
import { pedidoSchema as pedidoDoLink } from "../../rotas/mapa.js";
import { pedidoSchema as pedidoDeRota } from "../../rotas/rota.js";
import { ERROS_AUTENTICADA, ERROS_AUTORIZADA } from "../comuns.js";
import { rota, type GrupoDoContrato } from "../tipos.js";

/**
 * Mapa, caminho por ruas e busca (`rotas/mapa.ts`, `rota.ts` e `busca.ts`).
 * Parte 3C2 do lote 3.
 *
 * Todas as três têm entrada. O esquema de pedido de cada uma (`pedidoSchema` do
 * link e da rota, `consultaSchema` da busca) morava dentro do arquivo da rota e
 * foi exportado de lá, sem mudar o que a rota aceita. Os esquemas de resposta
 * são deste arquivo e seguem o handler; `test/contrato-3c2-respostas.test.ts`
 * confere uma resposta real de cada rota.
 *
 * As três têm limite de uso por minuto (30, 30 e 60), então `excesso_de_requisicoes`
 * (429) entra em `erros`.
 */

const uuid = z.string().uuid();

/** Um item de busca que não é ocorrência (usuário, equipe ou órgão). */
const itemComum = z.object({
  id: uuid,
  titulo: z.string(),
  detalhe: z.string(),
  pontuacao: z.number().describe("A relevância do item para o termo, maior é mais parecido."),
});

const grupoDeOcorrencias = z.object({
  tipo: z.literal("ocorrencia"),
  itens: z.array(
    z.object({
      id: uuid,
      protocolo: z.string(),
      titulo: z.string().describe("O endereço da ocorrência."),
      detalhe: z.string().describe("O tipo e o estado, em linguagem de tela."),
      severidade: z.enum(SEVERIDADES).nullable(),
      status: z.enum(STATUS_OCORRENCIA),
      pontuacao: z.number(),
    }),
  ),
});

const grupoComum = z.object({
  tipo: z.enum(["usuario", "equipe", "orgao"]),
  itens: z.array(itemComum),
});

export const grupo: GrupoDoContrato = {
  nome: "mapa-e-busca",
  rotas: [
    rota({
      metodo: "POST",
      caminho: "/v1/mapa/resolver-link",
      resumo:
        "Abre um link curto do Google Maps no servidor e devolve a coordenada do ponto, sem seguir link para outro lugar.",
      corpo: pedidoDoLink,
      resposta: {
        status: 200,
        descricao:
          "O ponto onde o link cai, com a coordenada arredondada às casas do sistema e o endereço final sem parâmetros de rastreamento.",
        esquema: z.object({
          latitude: z.number(),
          longitude: z.number(),
          urlFinal: z.string(),
        }),
      },
      erros: [
        ...ERROS_AUTORIZADA,
        "dados_invalidos",
        "excesso_de_requisicoes",
        "link_nao_aceito",
        "nao_resolveu",
        "sem_ponto",
      ],
    }),
    rota({
      metodo: "POST",
      caminho: "/v1/rota",
      resumo:
        "Traça o caminho por ruas entre dois pontos pelo Google, sem a chave sair do servidor (com cache de 24 horas). A coordenada 0,0 não vale, nem na origem nem no destino.",
      corpo: pedidoDeRota,
      resposta: {
        status: 200,
        descricao: "A duração, a distância e a polilinha codificada do caminho.",
        esquema: z.object({
          duracaoSegundos: z.number().int(),
          distanciaMetros: z.number(),
          polilinha: z.string().describe("A polilinha no formato codificado do Google."),
        }),
      },
      erros: [
        ...ERROS_AUTENTICADA,
        "dados_invalidos",
        "excesso_de_requisicoes",
        "caminho_desligado",
        "caminho_indisponivel",
      ],
    }),
    rota({
      metodo: "GET",
      caminho: "/v1/busca",
      resumo:
        "Busca única do painel: ocorrências, usuários, equipes e órgãos que casam com o termo (tolerante a acento e a erro de digitação).",
      consulta: consultaDaBusca,
      resposta: {
        status: 200,
        descricao:
          "O termo já normalizado, o teto de itens por grupo e os grupos que tiveram resultado. Usuários só aparecem para quem pode gerenciar usuários; o agente de campo só acha ocorrências em campo da própria equipe.",
        esquema: z.object({
          consulta: z.string().describe("O termo depois da normalização do banco."),
          teto: z.number().int().describe("O máximo de itens por grupo."),
          grupos: z.array(z.union([grupoDeOcorrencias, grupoComum])),
        }),
      },
      erros: [...ERROS_AUTENTICADA, "dados_invalidos", "excesso_de_requisicoes"],
    }),
  ],
  pendentes: [],
};
