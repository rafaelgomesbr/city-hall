import { podeExecutar, type Papel } from "@dc360/shared";
import type {
  GrupoDeBusca, RespostaDeBusca, ResultadoDeBusca, TipoDeResultado,
} from "../dados/tipos";
import type { ItemDoIndice, ResultadoLocal } from "./indice";
import { idDaOpcao } from "./combobox";
import { normalizar, pontuar } from "./pontuador";

/**
 * Os registros na busca: o lado do servidor, e a demonstração fazendo as
 * vezes dele.
 *
 * `classificarRegistros` é o que o modo de demonstração roda sobre o banco da
 * aba para responder à mesma caixa que o servidor responde. Devolve a forma
 * exata do contrato de `GET /busca?q=`, para que a tela não saiba qual dos
 * dois respondeu. O pontuador é o mesmo do índice de funções: uma régua só
 * de tolerância a erro no painel inteiro.
 */

/** Um registro do banco preparado para o pontuador. */
export type RegistroPesquisavel = {
  tipo: TipoDeResultado;
  id: string;
  titulo: string;
  detalhe: string;
  /** Tudo que pode ser digitado para achar este registro: protocolo, nome, matrícula... */
  termos: readonly string[];
  protocolo?: string;
  severidade?: ResultadoDeBusca["severidade"];
  status?: ResultadoDeBusca["status"];
};

/** O mesmo teto por grupo que a rota do servidor aplica. */
export const TETO_POR_GRUPO = 8;

const ORDEM_DOS_GRUPOS: readonly TipoDeResultado[] = ["ocorrencia", "usuario", "equipe", "orgao"];

export const ROTULO_DO_GRUPO: Record<TipoDeResultado, string> = {
  ocorrencia: "Ocorrências",
  usuario: "Pessoas",
  equipe: "Equipes",
  orgao: "Órgãos",
};

export function classificarRegistros(
  consulta: string,
  registros: readonly RegistroPesquisavel[],
  teto = TETO_POR_GRUPO,
): RespostaDeBusca {
  const q = normalizar(consulta);
  const porTipo = new Map<TipoDeResultado, ResultadoDeBusca[]>();

  for (const registro of registros) {
    const pontuacao = pontuar(q, { rotulo: registro.titulo, sinonimos: registro.termos });
    if (pontuacao <= 0) continue;
    const item: ResultadoDeBusca = {
      id: registro.id,
      titulo: registro.titulo,
      detalhe: registro.detalhe,
      pontuacao: Math.min(1, pontuacao),
    };
    if (registro.tipo === "ocorrencia") {
      item.protocolo = registro.protocolo;
      item.severidade = registro.severidade ?? null;
      item.status = registro.status;
    }
    const lista = porTipo.get(registro.tipo) ?? [];
    lista.push(item);
    porTipo.set(registro.tipo, lista);
  }

  const grupos: GrupoDeBusca[] = [];
  for (const tipo of ORDEM_DOS_GRUPOS) {
    const itens = porTipo.get(tipo);
    if (!itens || itens.length === 0) continue;
    itens.sort((a, b) => b.pontuacao - a.pontuacao || a.titulo.localeCompare(b.titulo, "pt-BR"));
    grupos.push({ tipo, itens: itens.slice(0, teto) });
  }
  return { consulta: q, teto, grupos };
}

/**
 * Para onde cada resultado leva.
 *
 * Ocorrência tem página própria. Usuário, equipe e órgão abrem a LISTA: as
 * telas de cadastro não aceitam id na URL hoje, e mandar um id que ninguém
 * lê seria prometer um foco que não acontece.
 */
export function destinoDoResultado(tipo: TipoDeResultado, id: string): string {
  switch (tipo) {
    case "ocorrencia": return `/ocorrencias/${id}`;
    case "usuario": return "/usuarios";
    case "equipe": return "/equipes";
    case "orgao": return "/orgaos";
  }
}

/** A permissão que a tela de destino de cada grupo exige, igual à rota. */
const EXIGE_PARA_ABRIR: Partial<Record<TipoDeResultado, Parameters<typeof podeExecutar>[1]>> = {
  usuario: "gerenciar_usuarios",
  equipe: "gerenciar_equipes",
  orgao: "gerenciar_equipes",
};

/**
 * Só os grupos cujas telas o papel pode abrir.
 *
 * O servidor decide o que devolve. Mas se ele devolver um usuário para o
 * operador, a caixa o levaria para `/usuarios`, que responde "seu perfil não
 * tem acesso". É o mesmo `podeExecutar` do menu e da rota.
 */
export function gruposVisiveis(papel: Papel, grupos: readonly GrupoDeBusca[]): GrupoDeBusca[] {
  return grupos.filter((g) => {
    const exige = EXIGE_PARA_ABRIR[g.tipo];
    return !exige || podeExecutar(papel, exige);
  });
}

/** Uma linha da lista, de qualquer origem, com o que a tela precisa desenhar. */
export type OpcaoDaLista = {
  id: string;
  grupo: string;
  rotulo: string;
  detalhe: string;
  origem:
    | { tipo: "interface"; item: ItemDoIndice }
    | { tipo: "registro"; tipoDoRegistro: TipoDeResultado; item: ResultadoDeBusca };
};

/** A lista linear que as setas percorrem: "Ir para" primeiro, depois os grupos do servidor. */
export function achatar(
  locais: readonly ResultadoLocal[],
  grupos: readonly GrupoDeBusca[],
): OpcaoDaLista[] {
  const lista: OpcaoDaLista[] = [];
  for (const r of locais) {
    lista.push({
      id: idDaOpcao(lista.length),
      grupo: "Ir para",
      rotulo: r.item.rotulo,
      detalhe: r.item.detalhe,
      origem: { tipo: "interface", item: r.item },
    });
  }
  for (const g of grupos) {
    for (const item of g.itens) {
      lista.push({
        id: idDaOpcao(lista.length),
        grupo: ROTULO_DO_GRUPO[g.tipo],
        rotulo: item.titulo,
        detalhe: item.detalhe,
        origem: { tipo: "registro", tipoDoRegistro: g.tipo, item },
      });
    }
  }
  return lista;
}
