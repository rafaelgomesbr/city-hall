import { enderecoDaApi } from "./api";

/**
 * O QUE JÁ ACONTECEU NESTA CASA, e por que isto existe num arquivo próprio.
 *
 * `GET /ocorrencias/:id` e `GET /evidencias/ocorrencia/:id` estão de pé desde
 * sempre, exigem só autenticação (nenhuma permissão a mais, ou seja: o agente
 * de campo pode chamá-las) e o aplicativo nunca chamou nenhuma das duas. A
 * consequência é diária e ninguém a mede: **o agente bate na porta sem saber
 * que outra equipe já esteve ali**, que já existe laudo, que já houve uma
 * devolução com motivo escrito, ou que o mesmo endereço já produziu outro
 * protocolo na semana passada.
 *
 * ## Por que não entra em `api.ts`
 *
 * `api.ts` é o lugar de "chamada que acontece COM sinal e cujo fracasso não
 * precisa de fila", e ele tem dois tetos de tempo justamente porque já
 * reconheceu que nem todo fracasso custa o mesmo. Esta chamada é de uma
 * terceira categoria, e ela é mais fraca que as duas:
 *
 * - baixar a lista de tarefas é caro de perder (o agente sobe o morro sem
 *   trabalho), por isso lá são vinte segundos;
 * - baixar "minha equipe" é barato de perder, mas acontece com a pessoa parada
 *   olhando para uma tela de espera, por isso lá são oito;
 * - isto aqui não bloqueia NADA. Acontece por baixo de um formulário que já
 *   abriu, que já está gravando no disco a cada toque e que nunca dependeu de
 *   sinal. Se não chegar, a vistoria é feita igual.
 *
 * E, por causa disso, esta função **não estoura nunca**. Ela devolve o estado
 * "não chegou" em qualquer fracasso (sem sinal, tempo esgotado, 404, 500,
 * corpo que não é JSON). Deixá-la lançar obrigaria a tela a tratar um erro que
 * não é erro dela, e o jeito mais provável de tratar seria mandar a frase para
 * a tarja vermelha da coleta, que é o destino de seis falhas de verdade. Um
 * aviso vermelho dizendo "sem sinal" no alto de uma tela cuja promessa inteira
 * é "nada aqui depende de sinal" é o produto desmentindo a si mesmo.
 *
 * ## Por que o resultado tem estado, e não é só `null`
 *
 * "Não deu para consultar" e "não há nada nesta casa" são respostas opostas
 * para o agente na porta, e um `null` para as duas faria a tela afirmar a
 * segunda quando a verdade é a primeira. A casa que nunca foi vistoriada e a
 * casa cujo histórico não desceu por falta de sinal exigem condutas
 * diferentes, e só uma delas permite ao agente concluir alguma coisa.
 */

/** Sete segundos, e o que ele significa é "desiste antes de alguém notar". */
const PRAZO_MS = 7_000;

/**
 * A vistoria anterior desta ocorrência, como o dossiê a entrega.
 *
 * `agente_nome` é o campo que muda a conversa na porta: "a Defesa Civil já
 * esteve aqui" é uma frase, "o Carlos esteve aqui no dia 3" é outra. Ele é
 * nulo quando a conta de quem coletou saiu do cadastro, e a tela precisa
 * aguentar isso sem sumir com a linha inteira.
 */
export type VistoriaAnterior = {
  coletada_em: string;
  sincronizada_em: string | null;
  agente_nome: string | null;
  assinante_nome: string | null;
  observacoes: string | null;
};

/** Uma providência já encaminhada a um órgão, com o desfecho se houve. */
export type ProvidenciaAnterior = {
  id: string;
  orgao_destino: string;
  descricao: string;
  encaminhada_em: string;
  respondida_em: string | null;
};

/** Outra ocorrência do mesmo endereço, ligada a esta na abertura. */
export type OcorrenciaVinculada = {
  id: string;
  protocolo: string;
  status: string;
  endereco: string;
  criado_em: string;
};

/**
 * A última devolução do campo, com o motivo.
 *
 * O texto livre (`observacao`) vem junto porque esta rota é o dossiê de UMA
 * ocorrência e registra a consulta no banco, que é o desenho que o T11 deixou
 * pronto para dado de cidadão. `observacao_removida_em` preenchido significa
 * que o texto foi descartado pelo prazo de retenção do município, e não que
 * nunca existiu: são dois fatos diferentes e a tela diz os dois.
 */
export type DevolucaoAnterior = {
  decidida_em: string;
  motivo: string;
  observacao: string | null;
  observacao_removida_em: string | null;
  devolvida_por_nome: string | null;
};

/** Uma fotografia já enviada desta ocorrência, com endereço assinado de leitura. */
export type FotoDeAntes = {
  id: string;
  legenda: string | null;
  capturadaEm: string;
  ordem: number;
  url: string;
};

export type HistoricoDaCasa = {
  vistoriaAnterior: VistoriaAnterior | null;
  providencias: ProvidenciaAnterior[];
  vinculadas: OcorrenciaVinculada[];
  devolucao: DevolucaoAnterior | null;
  fotosDeAntes: FotoDeAntes[];
};

export type ResultadoDoHistorico =
  | { estado: "chegou"; historico: HistoricoDaCasa }
  | { estado: "nao-chegou" };

/**
 * Tem alguma coisa para contar?
 *
 * Função à parte, e exportada, porque a tela precisa decidir se DESENHA o
 * cartão e o teste precisa poder perguntar isso sem montar tela nenhuma. Um
 * cartão "o que já aconteceu nesta casa" com cinco listas vazias é um cartão
 * que diz "nada", ocupando o lugar mais valioso da tela mais longa do produto.
 */
export function historicoTemConteudo(h: HistoricoDaCasa): boolean {
  return Boolean(
    h.vistoriaAnterior
    || h.devolucao
    || h.providencias.length > 0
    || h.vinculadas.length > 0
    || h.fotosDeAntes.length > 0,
  );
}

async function pedir<T>(caminho: string, token: string): Promise<T | null> {
  const base = enderecoDaApi().replace(/\/$/, "");
  if (!base) return null;

  const cancelador = new AbortController();
  const relogio = setTimeout(() => cancelador.abort(), PRAZO_MS);
  try {
    const resposta = await fetch(`${base}${caminho}`, {
      signal: cancelador.signal,
      headers: { accept: "application/json", authorization: `Bearer ${token}` },
    });
    if (!resposta.ok) return null;
    return (await resposta.json()) as T;
  } catch {
    /*
      Sem sinal, tempo esgotado, corpo que não é JSON, `fetch` que nem existe
      neste ambiente: tudo cai aqui e vira a mesma resposta. Ver o cabeçalho
      deste arquivo para o porquê de nada disto subir para a tela como erro.
    */
    return null;
  } finally {
    clearTimeout(relogio);
  }
}

/**
 * O histórico, ou o aviso de que ele não desceu. Nunca estoura.
 *
 * As duas rotas vão em paralelo, e não em sequência, porque são independentes
 * e porque a soma de dois prazos de sete segundos seria catorze segundos de
 * um enriquecimento que ninguém pediu.
 *
 * A regra de composição é conservadora de propósito: se o DOSSIÊ não chegou, o
 * resultado inteiro é "não chegou", mesmo que as fotos tenham chegado. Uma
 * tela dizendo "3 fotografias de antes" e calada sobre a vistoria anterior
 * afirmaria, por omissão, que ninguém esteve ali antes, que é exatamente o
 * fato que este cartão existe para contar. O contrário é tolerado: dossiê sem
 * as fotos vira histórico com `fotosDeAntes` vazio, porque ali a ausência de
 * fotografia é dita ao lado de uma vistoria que a tela mostra.
 */
export async function buscarHistoricoDaCasa(
  token: string | null,
  ocorrenciaId: string,
): Promise<ResultadoDoHistorico> {
  if (!token) return { estado: "nao-chegou" };

  const [dossie, evidencias] = await Promise.all([
    pedir<{
      vistoria: VistoriaAnterior | null;
      providencias: ProvidenciaAnterior[] | null;
      vinculadas: OcorrenciaVinculada[] | null;
      devolucao: DevolucaoAnterior | null;
    }>(`/ocorrencias/${ocorrenciaId}`, token),
    pedir<{ itens: FotoDeAntes[] | null }>(`/evidencias/ocorrencia/${ocorrenciaId}`, token),
  ]);

  if (!dossie) return { estado: "nao-chegou" };

  return {
    estado: "chegou",
    historico: {
      vistoriaAnterior: dossie.vistoria ?? null,
      /*
        `?? []` em cada lista, e não confiança no servidor. O aplicativo em
        campo é a ponta que menos pode estourar: uma versão do servidor que
        omita uma chave (ou um intermediário que devolva um corpo podado) não
        pode derrubar a tela por onde o produto existe.
      */
      providencias: dossie.providencias ?? [],
      vinculadas: dossie.vinculadas ?? [],
      devolucao: dossie.devolucao ?? null,
      fotosDeAntes: evidencias?.itens ?? [],
    },
  };
}
