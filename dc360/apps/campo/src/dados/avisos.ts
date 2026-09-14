import {
  baixarAvisos, marcarAvisosLidos,
  type AvisoDoCampo, type CursorDeAvisos, type RespostaDeAvisos,
} from "./api";
import { bancoLocal } from "./banco-local";

/**
 * O SINO DO AGENTE, guardado no aparelho.
 *
 * `GET /avisos` e `POST /avisos/lidos` existem no servidor desde o T8, escritas
 * **sem `exigirPermissao`, expressamente para não deixar "operador e agente de
 * campo sem sino nenhum"**, e o aplicativo nunca as chamou. Este arquivo é a
 * metade que faltava.
 *
 * ## Por que ele guarda em disco, como todo o resto deste aplicativo
 *
 * O sino é o único recurso do produto que depende da rede para ter conteúdo, e
 * a tela que o mostra abre do DISCO, como todas as outras. Um sino que só
 * existisse com sinal seria um sino que só existe na base, ou seja, exatamente
 * onde ninguém precisa dele: quem desce o morro no fim da tarde quer saber o
 * que aconteceu enquanto esteve fora, e nesse momento o sinal ainda é o do
 * morro.
 *
 * Mora em `marcas`, num registro só, pela mesma razão de "meu trabalho": é
 * pequeno, é lido inteiro de uma vez para desenhar a lista, e nunca é
 * consultado por parte. E `marcas` é apagada no logout, o que aqui é
 * obrigação e não efeito colateral: o aparelho de plantão passa de turno em
 * turno, e o que o sino guarda é fato operacional de um município só.
 *
 * ## As três regras que este arquivo existe para não deixar ninguém quebrar
 *
 * 1. **O cursor é um PAR, e é eco.** Ver `CursorDeAvisos` em `api.ts`. O
 *    instante sozinho perde os empatados de uma sincronização que gravou várias
 *    vistorias na mesma transação, e o relógio do aparelho não serve de marco.
 * 2. **Resposta cortada pede continuação, na hora.** `truncada` é o servidor
 *    dizendo "há mais, e o cursor aponta para onde". Esperar a próxima abertura
 *    da tela faria um aparelho que ficou dias fora alcançar o presente numa
 *    semana.
 * 3. **Marcar como lido sobrevive à falta de sinal.** Quem lê os avisos no alto
 *    do morro e sai da tela não pode encontrar tudo por ler de novo na descida.
 */

const MARCA_AVISOS = "avisos.estado";

/**
 * Quantos avisos a tela guarda.
 *
 * A CONTAGEM de não lidos não sai daqui: ela vem do servidor, e é por isso que
 * cortar a lista é honesto. O número continua dizendo a verdade sobre quanto
 * falta mesmo quando a lista mostra menos.
 *
 * Trinta e não os duzentos da rota: isto é a tela de um telefone, rolada com
 * luva, e ninguém desce trezentas linhas procurando o que aconteceu ontem.
 */
export const TETO_NA_TELA = 30;

/**
 * Quantas continuações uma sincronização encadeia antes de parar.
 *
 * Existe para o caso do aparelho que ficou semanas fora: sem teto, uma abertura
 * de tela viraria uma rajada de dezenas de requisições no 3G do morro, e a
 * regra desta casa é que o sino é o recurso menos crítico do produto, ou seja,
 * o primeiro que deve sair da frente quando as coisas apertam, não o último.
 *
 * Cinco voltas trazem mil avisos, que é muito mais do que um município produz
 * entre duas aberturas do aplicativo. O que sobrar continua atrás do cursor, e
 * o cursor está gravado: a abertura seguinte continua de onde esta parou, sem
 * buraco.
 */
export const TETO_DE_VOLTAS = 5;

export type AvisosGuardados = {
  /** Do mais novo para o mais antigo, que é a ordem em que a tela lê. */
  itens: AvisoDoCampo[];
  cursor: CursorDeAvisos;
  naoLidos: number;
  /** A contagem bateu no teto do servidor: o número é um piso, não o total. */
  naoLidosTruncado: boolean;
  /**
   * Marcados como lidos NESTE APARELHO e ainda não confirmados pelo servidor.
   *
   * Sem esta lista, marcar como lido sem sinal seria um gesto que o aplicativo
   * finge aceitar e esquece: o agente lê os avisos no alto do morro, troca de
   * aba, volta, e encontra tudo por ler de novo. Pior que isso, a próxima
   * sincronização traria os mesmos avisos com `lido: false` do servidor e
   * apagaria a leitura que ele fez.
   */
  lidosPendentes: string[];
  /** Quando o servidor foi ouvido pela última vez. Nulo: nunca foi. */
  baixadoEm: string | null;
};

export const AVISOS_VAZIOS: AvisosGuardados = {
  itens: [],
  cursor: null,
  naoLidos: 0,
  naoLidosTruncado: false,
  lidosPendentes: [],
  baixadoEm: null,
};

/**
 * Mais novo primeiro, com o identificador desempatando.
 *
 * O desempate não é enfeite, é a mesma razão do cursor: uma sincronização traz
 * várias vistorias na mesma transação e todas recebem o mesmo `now()`. Sem ele
 * a ordem entre empatados é indefinida, e indefinida quer dizer que ela pode
 * mudar entre duas renderizações do mesmo conteúdo, que é a lista piscando
 * debaixo do dedo de quem está tentando ler.
 */
function maisNovoPrimeiro(a: AvisoDoCampo, b: AvisoDoCampo): number {
  const instante = Date.parse(b.criadoEm) - Date.parse(a.criadoEm);
  if (instante !== 0) return instante;
  return b.id.localeCompare(a.id);
}

/**
 * O cursor que a próxima pergunta deve levar, lido da resposta e de mais nada.
 *
 * Uma função de uma linha, exportada, porque o dia em que alguém "melhorar"
 * isto para `new Date().toISOString()` é o dia em que o sino deste aplicativo
 * começa a pular aviso em silêncio, e uma função com nome é onde esse dia
 * reprova num teste em vez de acontecer.
 */
export function cursorDaResposta(resposta: RespostaDeAvisos): CursorDeAvisos {
  return { desde: resposta.ate, desdeId: resposta.ateId };
}

/**
 * Junta a resposta ao que já estava no aparelho.
 *
 * A marca de leitura PENDENTE ganha do que o servidor disse, e essa é a única
 * inversão deste arquivo: enquanto o `POST` não confirmou, quem sabe que aquele
 * aviso foi lido é o aparelho, e não o servidor. Sem isso, a sincronização que
 * acontece antes do envio dos pendentes reacenderia na tela tudo que o agente
 * acabou de marcar.
 */
export function mesclarAvisos(
  atual: AvisosGuardados,
  resposta: RespostaDeAvisos,
): AvisosGuardados {
  const porId = new Map(atual.itens.map((a) => [a.id, a] as const));
  for (const chegou of resposta.itens) {
    /*
      O mesmo aviso pode voltar: a continuação de uma resposta cortada reentrega
      o item do cursor, e uma consulta repetida depois de falha reentrega a
      janela inteira. Guardar por identificador é o que impede a lista de ganhar
      duas linhas do mesmo fato.
    */
    porId.set(chegou.id, chegou);
  }

  const pendentes = new Set(atual.lidosPendentes);
  const itens = [...porId.values()]
    .map((a) => (pendentes.has(a.id) && !a.lido ? { ...a, lido: true } : a))
    .sort(maisNovoPrimeiro)
    .slice(0, TETO_NA_TELA);

  return {
    itens,
    cursor: cursorDaResposta(resposta),
    /*
      A contagem do servidor descontada do que este aparelho já marcou e ainda
      não conseguiu enviar. Sem o desconto o número diria "3 por ler" logo
      abaixo de uma lista em que os três estão marcados como lidos, que é a tela
      contradizendo a si mesma.

      Com a contagem TRUNCADA o número não se mexe: truncada quer dizer "pelo
      menos quinhentos", e subtrair de um piso produz um número que parece exato
      e não é.
    */
    naoLidos: resposta.naoLidosTruncado
      ? resposta.naoLidos
      : Math.max(0, resposta.naoLidos - pendentesAindaNaoLidos(atual, resposta)),
    naoLidosTruncado: resposta.naoLidosTruncado,
    lidosPendentes: atual.lidosPendentes,
    baixadoEm: new Date().toISOString(),
  };
}

/**
 * Quantos dos pendentes deste aparelho o servidor ainda conta como por ler.
 *
 * Só conta os que a resposta trouxe: de um pendente que não veio na janela não
 * dá para saber se ele já estava marcado no servidor, e chutar produziria um
 * número menor que a verdade, que é o erro que não se pode cometer num contador
 * de coisas por ler.
 */
function pendentesAindaNaoLidos(
  atual: AvisosGuardados,
  resposta: RespostaDeAvisos,
): number {
  const pendentes = new Set(atual.lidosPendentes);
  return resposta.itens.filter((a) => pendentes.has(a.id) && !a.lido).length;
}

/**
 * Marca como lidos, no aparelho, e anota que o servidor ainda não sabe.
 *
 * Devolve O MESMO OBJETO quando nada muda, que é o caso de tocar em "marcar
 * tudo" numa lista já inteira lida: sem isso o React redesenharia a lista por
 * nada, e a lista redesenhada debaixo do dedo é o defeito que o sino do painel
 * já teve.
 */
export function marcarComoLidos(
  atual: AvisosGuardados,
  ids: readonly string[],
): AvisosGuardados {
  const alvo = new Set(ids);
  const virando = atual.itens.filter((a) => alvo.has(a.id) && !a.lido);
  if (virando.length === 0) return atual;

  const pendentes = new Set(atual.lidosPendentes);
  for (const a of virando) pendentes.add(a.id);

  return {
    ...atual,
    itens: atual.itens.map((a) => (alvo.has(a.id) && !a.lido ? { ...a, lido: true } : a)),
    naoLidos: atual.naoLidosTruncado
      ? atual.naoLidos
      : Math.max(0, atual.naoLidos - virando.length),
    lidosPendentes: [...pendentes],
  };
}

/* ========================================================================
   As palavras de cada aviso
   ======================================================================== */

/**
 * A frase de cada tipo de aviso.
 *
 * O tipo é lista fechada no banco (migração 018), e o aplicativo não é quem
 * decide o que entra nela. O caso desconhecido devolve uma frase genérica em
 * vez de nada, e essa é a decisão que importa: um tipo novo criado no servidor
 * antes de este aplicativo aprender a palavra faria o sino CONTAR avisos que a
 * lista desenha como linhas em branco, e linha em branco não diz nada a
 * ninguém. Impreciso ainda é legível.
 *
 * As frases são as mesmas do painel (`apps/web/src/componentes/sino-regras.ts`)
 * de propósito: o agente e a coordenação falam do mesmo fato pelo rádio, e duas
 * palavras diferentes para um fato só é como uma conversa de emergência vira
 * uma discussão sobre vocabulário.
 */
const FRASES: Record<string, string> = {
  vistoria_recebida: "Vistoria recebida do campo",
  prazo_vencido: "Prazo de atendimento vencido",
  providencia_respondida: "Órgão respondeu a providência",
  /*
    A frase diz o FATO, e nunca a interpretação dele. Não é "agente em perigo",
    porque o produto não sabe disso: ele sabe que o prazo que o próprio agente
    declarou passou e ninguém confirmou o retorno. Pode ser um talude cedendo e
    pode ser bateria acabada.
  */
  retorno_nao_confirmado: "Agente não confirmou o retorno de campo",
};

export function fraseDoAviso(tipo: string): string {
  return FRASES[tipo] ?? "Atualização na ocorrência";
}

/**
 * O complemento curto, quando ele diz alguma coisa.
 *
 * A severidade crua do banco não é traduzida aqui, e a ausência é deliberada:
 * `ROTULO_SEVERIDADE` do pacote compartilhado é quem sabe disso, e a tela é
 * quem o chama. Este arquivo devolve o texto do servidor tal como veio, mais a
 * tradução do único detalhe que NÃO é severidade.
 */
export function complementoDoAviso(aviso: { tipo: string; detalhe: string | null }): string | null {
  const detalhe = aviso.detalhe?.trim();
  if (!detalhe) return null;
  if (aviso.tipo === "retorno_nao_confirmado") {
    if (detalhe === "sozinho") return "Foi sozinho";
    if (detalhe === "acompanhado") return "Foi acompanhado";
  }
  return detalhe;
}

/* ========================================================================
   O disco
   ======================================================================== */

export async function avisosGuardados(): Promise<AvisosGuardados> {
  const db = await bancoLocal();
  const linha = await db.getFirstAsync<{ valor: string }>(
    "SELECT valor FROM marcas WHERE chave = ?", [MARCA_AVISOS],
  );
  if (!linha) return AVISOS_VAZIOS;
  try {
    const lido = JSON.parse(linha.valor) as Partial<AvisosGuardados>;
    /*
      Cada campo com padrão próprio, e não `{...AVISOS_VAZIOS, ...lido}`.

      Um registro gravado por uma versão anterior deste arquivo não tem os
      campos que nasceram depois, e a difusão deixaria `undefined` no lugar
      deles: a tela leria `estado.lidosPendentes.length` e estouraria na
      abertura, sem sinal, que é quando ninguém tem como investigar.
    */
    return {
      itens: lido.itens ?? [],
      cursor: lido.cursor ?? null,
      naoLidos: lido.naoLidos ?? 0,
      naoLidosTruncado: lido.naoLidosTruncado ?? false,
      lidosPendentes: lido.lidosPendentes ?? [],
      baixadoEm: lido.baixadoEm ?? null,
    };
  } catch {
    /*
      Registro ilegível vira "nunca baixou", e não erro na tela. O cursor se
      perde e a próxima pergunta é uma primeira carga: custa uma volta, não
      custa histórico, e é bem melhor que uma aba que não abre.
    */
    return AVISOS_VAZIOS;
  }
}

/**
 * Quem quer saber que o sino mudou, sem ser a tela que o desenha.
 *
 * Existe por um motivo só, e ele é o crachá na aba Perfil: o número precisa
 * aparecer de QUALQUER tela, e quem desenha a barra de abas (`_layout.tsx`) não
 * é quem consulta o servidor. Sem isto, a barra leria o disco na montagem e
 * ficaria parada no número daquele instante, então o agente veria "3 por ler"
 * enquanto estivesse dentro do Perfil olhando os três já lidos.
 *
 * Um conjunto de funções, e não um contexto de React, porque a gravação
 * acontece dentro de `sincronizarAvisos`, que é código de dados e não pode
 * depender de árvore de componente.
 */
type OuvinteDoSino = (estado: AvisosGuardados) => void;
const ouvintes = new Set<OuvinteDoSino>();

export function assinarAvisos(ouvinte: OuvinteDoSino): () => void {
  ouvintes.add(ouvinte);
  return () => { ouvintes.delete(ouvinte); };
}

export async function guardarAvisos(estado: AvisosGuardados): Promise<void> {
  const db = await bancoLocal();
  await db.runAsync(
    `INSERT INTO marcas (chave, valor) VALUES (?, ?)
     ON CONFLICT (chave) DO UPDATE SET valor = excluded.valor`,
    [MARCA_AVISOS, JSON.stringify(estado)],
  );
  /*
    Avisa DEPOIS de gravar, e não antes. Quem ouve pode abrir a tela e ler o
    disco: com o aviso antes, ele leria o estado anterior e desenharia um número
    que acabou de deixar de valer.
  */
  for (const ouvinte of ouvintes) ouvinte(estado);
}

/**
 * Marca no aparelho e grava. Não toca na rede: quem envia é a sincronização.
 *
 * Gravar ANTES de tentar enviar é o que torna a leitura resistente a tudo que
 * pode dar errado depois dela: sem sinal, aplicativo morto pelo sistema,
 * bateria acabando no morro. O envio é uma consequência, e consequência não
 * pode ser condição.
 */
export async function marcarAvisosComoLidosNoAparelho(
  ids: readonly string[],
): Promise<AvisosGuardados> {
  const atual = await avisosGuardados();
  const novo = marcarComoLidos(atual, ids);
  if (novo !== atual) await guardarAvisos(novo);
  return novo;
}

/**
 * Pergunta ao servidor o que mudou, e entrega o que este aparelho passa a ter.
 *
 * A ORDEM É OBRIGATÓRIA, e é a mesma ordem da lápide de coleta: primeiro
 * confirmar o que este aparelho já decidiu, depois perguntar. Invertida, a
 * consulta traria os avisos com `lido: false` do servidor num momento em que o
 * servidor ainda não sabe da leitura, e a tela reacenderia o que o agente
 * acabou de marcar.
 *
 * A falha ao enviar os pendentes NÃO derruba a consulta: a lista de leitura
 * continua no aparelho e vai na próxima. Perder o aviso novo porque a marcação
 * de leitura não passou seria trocar o importante pelo secundário.
 */
export async function sincronizarAvisos(token: string): Promise<AvisosGuardados> {
  let estado = await avisosGuardados();

  if (estado.lidosPendentes.length > 0) {
    try {
      await marcarAvisosLidos(token, estado.lidosPendentes);
      estado = { ...estado, lidosPendentes: [] };
      await guardarAvisos(estado);
    } catch {
      /* Fica para a próxima. O aparelho continua sendo quem sabe da leitura. */
    }
  }

  for (let volta = 0; volta < TETO_DE_VOLTAS; volta += 1) {
    const resposta = await baixarAvisos(token, estado.cursor);
    estado = mesclarAvisos(estado, resposta);
    await guardarAvisos(estado);
    if (!resposta.truncada) break;
  }

  return estado;
}
