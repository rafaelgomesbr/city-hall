import { podeExecutar, type Papel } from "@dc360/shared";
import type {
  GrupoDeBusca, RespostaDeBusca, ResultadoDeBusca, TipoDeResultado,
} from "../dados/tipos";
import type { ItemDoIndice, ResultadoLocal } from "./indice";
import { idDaOpcao } from "./combobox";
import { normalizar } from "./pontuador";

/**
 * Os registros na busca: o lado do servidor, e a demonstração fazendo as
 * vezes dele.
 *
 * `classificarRegistros` é o que o modo de demonstração roda sobre o banco da
 * aba para responder à mesma caixa que o servidor responde. Devolve a forma
 * exata do contrato de `GET /busca?q=`, para que a tela não saiba qual dos
 * dois respondeu.
 *
 * A RÉGUA É A DO SERVIDOR, transcrita da migração 041 (sabor sem `pg_trgm`),
 * e não mais a do índice de funções. O pontuador de `pontuador.ts` foi feito
 * para achar "Ocorrências" digitando "ocorencia": ele compara a consulta com
 * o PREFIXO de cada palavra e tolera um erro em quatro letras. Sobre
 * registro isso vira ruído, e o revisor provou: "sair" trazia uma
 * ocorrência porque "sair" está a uma letra de "bair", de "Bairro". O
 * servidor não faria isso, e a demonstração não pode achar o que o produto
 * não acha.
 *
 * O PROTOCOLO é a exceção deliberada, nos dois lados: número casa só por
 * prefixo. "000471" é um pedido por aquele protocolo, e os oito vizinhos
 * "0004xx" que se parecem com ele por trigramas são exatamente o que a
 * pessoa não pediu.
 */

/** Um registro do banco preparado para o classificador. */
export type RegistroPesquisavel = {
  tipo: TipoDeResultado;
  id: string;
  titulo: string;
  detalhe: string;
  /**
   * Tudo que pode ser digitado para achar este registro além do título e do
   * protocolo: nome do solicitante, matrícula, email, sigla... Quando é um
   * destes que casa, ele entra no detalhe do resultado, porque a linha da
   * lista não o mostra e a pessoa precisa ver por que aquilo apareceu.
   */
  termos: readonly string[];
  /** Só ocorrência tem. Casa por prefixo do número, e nada mais. */
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

/**
 * `normalizar_busca` da migração 041: caixa baixa, sem acento, e tudo que não
 * é letra ASCII nem dígito vira UM espaço, com as pontas aparadas. É o que
 * faz "SA-1042" e "sa 1042" serem a mesma coisa nos dois lados.
 */
export function chaveDeBusca(texto: string): string {
  return normalizar(texto).replace(/[^a-z0-9]+/g, " ").trim();
}

/**
 * `cobertura_de_trigramas` da migração 041: a fração dos trigramas do TERMO
 * que aparece na chave, com a string inteira ganhando as bordas (dois
 * espaços antes, um depois). O limiar de 0,6 é o mesmo do servidor.
 */
export function coberturaDeTrigramas(termo: string, alvo: string): number {
  const preenchido = `  ${termo} `;
  const trigramas = new Set<string>();
  for (let i = 0; i + 3 <= preenchido.length; i++) trigramas.add(preenchido.slice(i, i + 3));
  if (trigramas.size === 0) return 0;
  const bordado = ` ${alvo} `;
  let achados = 0;
  for (const t of trigramas) if (bordado.includes(t)) achados++;
  return achados / trigramas.size;
}

const LIMIAR_DE_PARECIDO = 0.6;

/**
 * `pontuar_busca` da migração 041, sobre chave e termo já normalizados:
 * igual 1,0; prefixo 0,9; início de palavra 0,8; substring 0,7; parecido por
 * trigramas até 0,6, e zero abaixo do limiar. Parecido nunca passa na frente
 * de igual, de propósito.
 */
export function pontuarChave(chave: string, termo: string): number {
  if (chave === termo) return 1;
  if (chave.startsWith(termo)) return 0.9;
  if (` ${chave}`.includes(` ${termo}`)) return 0.8;
  if (chave.includes(termo)) return 0.7;
  const cobertura = coberturaDeTrigramas(termo, chave);
  return cobertura >= LIMIAR_DE_PARECIDO ? cobertura * 0.6 : 0;
}

/**
 * O protocolo casa por prefixo do número, e só. "000471" acha "000471/2026";
 * "000471/2026" também; "000478" não acha "000471" por se parecer.
 */
function pontuarProtocolo(protocolo: string, termo: string): number {
  const numero = chaveDeBusca(protocolo);
  if (numero === termo) return 1;
  return numero.startsWith(termo) ? 0.9 : 0;
}

/** O melhor casamento de um registro, e QUAL termo casou. */
function casar(registro: RegistroPesquisavel, termo: string): { pontuacao: number; termo: string | null } {
  let melhor = { pontuacao: pontuarChave(chaveDeBusca(registro.titulo), termo), termo: null as string | null };
  if (registro.protocolo) {
    const p = pontuarProtocolo(registro.protocolo, termo);
    if (p > melhor.pontuacao) melhor = { pontuacao: p, termo: null };
  }
  for (const candidato of registro.termos) {
    const p = pontuarChave(chaveDeBusca(candidato), termo);
    if (p > melhor.pontuacao) melhor = { pontuacao: p, termo: candidato };
  }
  return melhor;
}

/**
 * O detalhe com o trecho que casou, quando ele não está na linha.
 *
 * "Marilda" achava a ocorrência e a linha mostrava "Rua das Acácias, 245" e
 * "Deslizamento, em campo": nada explicava por que aquilo apareceu. O nome
 * entra no fim do detalhe, uma vez, e só quando não está lá.
 */
function detalheComOQueCasou(detalhe: string, termoQueCasou: string | null): string {
  if (!termoQueCasou) return detalhe;
  if (chaveDeBusca(detalhe).includes(chaveDeBusca(termoQueCasou))) return detalhe;
  return detalhe ? `${detalhe}, ${termoQueCasou}` : termoQueCasou;
}

export function classificarRegistros(
  consulta: string,
  registros: readonly RegistroPesquisavel[],
  teto = TETO_POR_GRUPO,
): RespostaDeBusca {
  const q = chaveDeBusca(consulta);
  const porTipo = new Map<TipoDeResultado, ResultadoDeBusca[]>();
  if (q.length === 0) return { consulta: q, teto, grupos: [] };

  for (const registro of registros) {
    const { pontuacao, termo } = casar(registro, q);
    if (pontuacao <= 0) continue;
    const item: ResultadoDeBusca = {
      id: registro.id,
      titulo: registro.titulo,
      detalhe: detalheComOQueCasou(registro.detalhe, termo),
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

/**
 * Para onde o Enter SEM item escolhido leva, e a frase que a caixa diz.
 *
 * O menu esconde "Ocorrências" de quem registra vistoria, de propósito: o
 * agente de campo trabalha sobre o que foi despachado para a equipe dele, e
 * não sobre a fila do município. A caixa de busca aparece para todo mundo, e
 * mandava todos para `/ocorrencias`. O destino e a frase saem da mesma
 * função para a caixa não prometer uma tela e abrir outra.
 */
export function destinoDoEnter(papel: Papel): { para: string; frase: string } {
  if (podeExecutar(papel, "registrar_vistoria")) {
    return { para: "/meu-trabalho", frase: "Enter abre Meu trabalho filtrado por esse texto." };
  }
  return { para: "/ocorrencias", frase: "Enter abre a lista de ocorrências filtrada por esse texto." };
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
