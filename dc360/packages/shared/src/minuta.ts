import {
  CHAVE_ACIONAR_ORGAO, ROTULO_CHECKLIST, ROTULO_SEVERIDADE, ROTULO_TIPO_COBRADE,
} from "./dominio.js";
import type { Severidade, TipoDeEntrada } from "./dominio.js";
import { CAMPOS_PESSOAS, type PessoasAtingidas } from "./schemas.js";

/**
 * A minuta do laudo, montada no aparelho, sem sinal e sem servidor.
 *
 * O QUE ELA RESOLVE. Hoje o agente termina a vistoria no morro, guarda o
 * telefone e vai embora. O laudo só existe depois, quando a coordenação abre
 * o painel. Isso significa que a pessoa que estava presente na vistoria, e
 * que assinou dizendo que estava, não viu o que foi escrito sobre a casa
 * dela. Também significa que o agente descobre um item marcado errado só no
 * dia seguinte, quando voltar ao morro custa outra viagem.
 *
 * A minuta é o texto do laudo montado no próprio aparelho, na hora, para ser
 * lido em voz alta e conferido antes de o agente ir embora.
 *
 * O QUE ELA NÃO É, E ISSO PRECISA ESTAR NA CARA. Ela não tem valor de
 * documento, não tem código de validação, não substitui o laudo, e a marca
 * d'água diz isso em toda tela. O laudo oficial continua saindo do servidor,
 * assinado pela coordenação, com os dados que o banco tem. A minuta é o
 * rascunho conferido em campo, e é assim que ela se apresenta.
 *
 * POR QUE MORA AQUI, E NÃO NA TELA DO APLICATIVO. Se o aplicativo escrevesse
 * o próprio texto, ele e o laudo oficial começariam iguais e divergiriam na
 * primeira alteração de um dos dois. O agente leria uma coisa para o morador
 * e o documento diria outra, e a assinatura do morador estaria embaixo da
 * versão que ele não ouviu. `minuta.test.ts` tem um caso que reprova se o
 * laudo oficial passar a imprimir um campo que a minuta não mostra.
 */

export const AVISO_MINUTA =
  "MINUTA SEM VALOR DE DOCUMENTO. Aguardando conferência e emissão pela coordenação.";

export type DadosMinuta = {
  organizacao: { nome: string; municipio: string; uf: string };
  ocorrencia: {
    protocolo: string;
    /*
      `TipoDeEntrada` e não `TipoCobrade`: a minuta é montada no aparelho a
      partir da tarefa que desceu do servidor, e um chamado que entrou como
      "outro" e escapou da reclassificação precisa imprimir a palavra em vez de
      um branco no lugar do tipo. Documento com campo vazio não denuncia nada.
    */
    tipo: TipoDeEntrada;
    severidade: Severidade | null;
    endereco: string;
    pontoReferencia: string | null;
    latitude: number | null;
    longitude: number | null;
    solicitanteNome: string;
    criadoEm: string;
    descricao: string;
    vulnerabilidadePresente: boolean;
    vulnerabilidadeDescricao: string | null;
  };
  vistoria: {
    checklist: Array<{ chave: string; resposta: boolean }>;
    observacoes: string | null;
    assinanteNome: string;
    gpsPrecisaoMetros: number | null;
    coletadaEm: string;
    agenteNome: string;
    agenteMatricula: string;
    /** Contagem de pessoas. Ausente significa não contado, e não zero. */
    pessoas: PessoasAtingidas;
    /**
     * Quem precisa ser acionado, quando o checklist respondeu que sim.
     *
     * Opcional porque rascunho gravado antes desta mudança não tem a lista, e
     * porque o texto lido em voz alta precisa ser montável do que existe no
     * aparelho naquele instante, nunca do que falta.
     */
    orgaosParaAcionar?: ReadonlyArray<{ nome: string }>;
  };
  quantasFotos: number;
};

export type LinhaMinuta = { rotulo: string; valor: string; mono?: boolean };

export type SecaoMinuta =
  | { tipo: "campos"; titulo: string; linhas: LinhaMinuta[] }
  | { tipo: "texto"; titulo: string; corpo: string }
  | { tipo: "checklist"; titulo: string; itens: Array<{ rotulo: string; resposta: boolean }> };

export type Minuta = {
  titulo: string;
  aviso: string;
  cabecalho: { orgao: string; municipio: string; uf: string };
  protocolo: string;
  secoes: SecaoMinuta[];
};

/**
 * A data em português, sem depender de `Intl` com fuso.
 *
 * `toLocaleString` num aparelho Android devolve resultado diferente conforme
 * o idioma do sistema, e um agente com o telefone em inglês leria a data no
 * formato americano enquanto o laudo oficial sai no brasileiro. Num documento
 * em que 03/04 e 04/03 são dias diferentes, isso não é detalhe.
 */
export function dataHoraBR(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "data inválida";
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()} às `
    + `${p(d.getHours())}:${p(d.getMinutes())}`;
}

function coordenadaOuNao(lat: number | null, lng: number | null): string {
  if (lat === null || lng === null) return "não registrada";
  return `${lat.toFixed(6)}, ${lng.toFixed(6)}`;
}

export function montarMinuta(d: DadosMinuta): Minuta {
  const o = d.ocorrencia;
  const v = d.vistoria;

  const secoes: SecaoMinuta[] = [
    {
      tipo: "campos",
      titulo: "Identificação da ocorrência",
      linhas: [
        { rotulo: "Protocolo", valor: o.protocolo, mono: true },
        { rotulo: "Tipo", valor: ROTULO_TIPO_COBRADE[o.tipo] },
        {
          rotulo: "Severidade",
          valor: o.severidade ? ROTULO_SEVERIDADE[o.severidade] : "não classificada",
        },
        { rotulo: "Endereço", valor: o.endereco },
        ...(o.pontoReferencia
          ? [{ rotulo: "Ponto de referência", valor: o.pontoReferencia }]
          : []),
        {
          rotulo: "Coordenada",
          valor: coordenadaOuNao(o.latitude, o.longitude),
          mono: true,
        },
        { rotulo: "Solicitante", valor: o.solicitanteNome },
        { rotulo: "Chamado registrado em", valor: dataHoraBR(o.criadoEm) },
      ],
    },
    { tipo: "texto", titulo: "Relato recebido", corpo: o.descricao },
  ];

  if (o.vulnerabilidadePresente) {
    secoes.push({
      tipo: "texto",
      titulo: "Vulnerabilidade social identificada",
      corpo: o.vulnerabilidadeDescricao ?? "Registrada sem descrição.",
    });
  }

  secoes.push({
    tipo: "campos",
    titulo: "Vistoria realizada",
    linhas: [
      { rotulo: "Data e hora em campo", valor: dataHoraBR(v.coletadaEm) },
      { rotulo: "Agente responsável", valor: v.agenteNome },
      { rotulo: "Matrícula", valor: v.agenteMatricula, mono: true },
      {
        rotulo: "Precisão do GPS",
        valor: v.gpsPrecisaoMetros !== null
          ? `${v.gpsPrecisaoMetros} metros`
          : "não registrada",
      },
      { rotulo: "Presente no local", valor: v.assinanteNome },
    ],
  });

  /*
    A contagem de pessoas vem ANTES do checklist, e a ordem é deliberada.

    É a parte que o agente lê em voz alta para conferir com quem está na porta,
    porque é a única em que a pessoa presente sabe corrigir: ela sabe quantos
    dormiram fora, o sistema não. O checklist é técnico e ela não tem como
    contestar.

    Se NADA foi contado, a seção diz isso em vez de imprimir cinco zeros. Um
    documento afirmando "0 desabrigados" quando ninguém contou é uma afirmação
    falsa, e é a mesma regra do laudo oficial.
  */
  const contadas = CAMPOS_PESSOAS.filter((c) => v.pessoas[c.chave] !== undefined);
  if (contadas.length === 0) {
    secoes.push({
      tipo: "texto",
      titulo: "Pessoas atingidas",
      corpo: "Não contadas nesta vistoria. A ausência de contagem não significa "
        + "ausência de atingidos.",
    });
  } else {
    secoes.push({
      tipo: "campos",
      titulo: "Pessoas atingidas",
      linhas: CAMPOS_PESSOAS.map((c) => ({
        rotulo: c.rotulo,
        valor: v.pessoas[c.chave] === undefined
          ? "não informado"
          : String(v.pessoas[c.chave]),
      })),
    });
  }

  secoes.push({
    tipo: "checklist",
    titulo: "Checklist técnico",
    itens: v.checklist.map((i) => ({
      rotulo: ROTULO_CHECKLIST[i.chave] ?? i.chave,
      resposta: i.resposta,
    })),
  });

  /*
    Os órgãos entram LOGO DEPOIS do checklist, e só quando a resposta foi sim.

    Depois porque é a resposta do item se abrindo: quem lê em voz alta acabou de
    dizer "necessário acionar outro órgão: sim", e a linha seguinte responde
    quem. Antes do checklist, a lista apareceria sem a pergunta que a explica.

    Quando a resposta foi sim e a lista está vazia, a seção existe assim mesmo e
    diz que não foi especificado. É o caso do aparelho que ainda não atualizou, e
    calar aqui devolveria o coordenador ao telefonema que este bloco existe para
    acabar: ele leria um laudo sem nenhuma menção a órgão nenhum e não saberia
    que a informação faltou.
  */
  const pedeOrgaos = v.checklist.some((i) => i.chave === CHAVE_ACIONAR_ORGAO && i.resposta);
  if (pedeOrgaos) {
    const nomes = (v.orgaosParaAcionar ?? []).map((o) => o.nome.trim()).filter(Boolean);
    secoes.push({
      tipo: "texto",
      titulo: "Órgãos a acionar",
      corpo: nomes.length > 0
        ? nomes.join("\n")
        : "Indicada a necessidade de acionar outro órgão, sem especificar qual.",
    });
  }

  if (v.observacoes?.trim()) {
    secoes.push({ tipo: "texto", titulo: "Observações do agente", corpo: v.observacoes.trim() });
  }

  /*
    As fotos entram como CONTAGEM, e não como imagem.

    Elas já estão na tela anterior, o agente acabou de tirá-las, e desenhá-las
    de novo aqui faria a minuta demorar a abrir num aparelho fraco justamente
    no momento em que há alguém esperando na porta. O que interessa conferir é
    se o número bate com o que ele lembra de ter fotografado.
  */
  secoes.push({
    tipo: "campos",
    titulo: "Registro fotográfico",
    linhas: [{
      rotulo: "Fotografias anexadas",
      valor: d.quantasFotos === 0
        ? "nenhuma"
        : `${d.quantasFotos} ${d.quantasFotos === 1 ? "fotografia" : "fotografias"}`,
    }],
  });

  return {
    titulo: "Minuta de laudo de vistoria",
    aviso: AVISO_MINUTA,
    cabecalho: {
      orgao: d.organizacao.nome,
      municipio: d.organizacao.municipio,
      uf: d.organizacao.uf,
    },
    protocolo: o.protocolo,
    secoes,
  };
}

/**
 * A minuta em texto corrido, para o agente ler em voz alta ou copiar.
 *
 * Sai sem enfeite de propósito: é lida numa tela pequena, na rua, e às vezes
 * copiada para o grupo da equipe no WhatsApp. O aviso vai no topo E no fim,
 * porque texto colado em conversa costuma chegar cortado, e um trecho de
 * laudo sem a marca de minuta circulando como se fosse documento é o pior
 * desfecho possível desta tela.
 */
export function minutaEmTexto(m: Minuta): string {
  const partes: string[] = [
    `*** ${m.aviso} ***`,
    "",
    m.titulo.toUpperCase(),
    `${m.cabecalho.orgao}, ${m.cabecalho.municipio}, ${m.cabecalho.uf}`,
    `Protocolo ${m.protocolo}`,
  ];

  for (const s of m.secoes) {
    partes.push("", s.titulo.toUpperCase());
    if (s.tipo === "campos") {
      for (const l of s.linhas) partes.push(`${l.rotulo}: ${l.valor}`);
    } else if (s.tipo === "texto") {
      partes.push(s.corpo);
    } else {
      for (const i of s.itens) partes.push(`${i.resposta ? "SIM" : "NAO"}  ${i.rotulo}`);
    }
  }

  partes.push("", `*** ${m.aviso} ***`);
  return partes.join("\n");
}
