/**
 * O que o PAINEL sabe sobre uma tarefa devolvida pelo agente de campo.
 *
 * O ato acontece no aplicativo: o agente abre uma tarefa vencida que ele não
 * conseguiu vistoriar e devolve para a coordenação, com motivo. O servidor põe
 * a ocorrência de volta em `triagem`, limpa a equipe, NÃO toca no `prazo_em`
 * (ela continua atrasada, e continua contando no indicador de atrasadas, que é
 * o certo) e grava um evento na trilha com autor, motivo, o prazo que foi
 * perdido e o AVISO de que houve observação, nunca a observação em si.
 *
 * ONDE CADA COISA É LIDA, porque as três fontes deixaram de carregar as mesmas
 * informações, e por decisão de privacidade e não por esquecimento:
 *
 * | O que a tela mostra | De onde ela lê | Por quê |
 * | --- | --- | --- |
 * | Faixa no alto da ocorrência | o campo `devolucao` do dossiê | é a única fonte com o texto livre, e a rota do dossiê registra a consulta |
 * | Linha do tempo | o `detalhe` do evento | ele nunca teve o texto: a trilha é append-only, e o texto precisa poder ser descartado no prazo |
 * | Marca da fila e da lista | `GET /ocorrencias/devolvidas` | é o município inteiro a cada carregamento, sem registro de consulta: sai o motivo e o booleano |
 *
 * Deste lado sobra a pergunta que interessa ao coordenador: o que fazer com ela
 * agora. Este módulo é o único lugar do painel que responde isso, e ele existe
 * separado das telas por dois motivos:
 *
 * 1. as três superfícies que precisam da resposta (a ocorrência, a fila do
 *    painel e a lista) chegariam a versões diferentes dela se cada uma
 *    decidisse por conta própria, que é como o mapa de rótulos da trilha já
 *    divergiu uma vez neste produto;
 * 2. regra em função pura é regra que o teste alcança sem navegador.
 *
 * A lista de motivos e os rótulos vêm do pacote compartilhado, e NÃO são
 * reescritos aqui: o agente lê uma frase no aparelho e a coordenação precisa
 * ler a mesma, senão a conversa por telefone é sobre dois textos diferentes.
 */
import { ROTULO_MOTIVO_DE_DEVOLUCAO, type MotivoDeDevolucao } from "@dc360/shared";
/*
  O tipo da linha mora em `dados/tipos.ts`, com os outros tipos da porta, e não
  aqui: quem o devolve é o repositório, e as duas implementações dele precisam
  prometer a mesma forma. Este módulo só raciocina sobre ela.
*/
import type { DevolucaoDaOcorrencia, DevolucaoPendente } from "./dados/tipos";

export type { DevolucaoDaOcorrencia, DevolucaoPendente };

/**
 * O tipo do evento da trilha, que a rota de devolução grava
 * (`apps/api/src/rotas/sincronizacao.ts`).
 *
 * Escrito uma vez só, porque é o acoplamento desta faixa com a do servidor: se
 * o nome mudar lá, muda aqui e o painel inteiro acompanha. O rótulo em
 * português dele vive em `ROTULO_EVENTO_TRILHA`, no pacote compartilhado, e um
 * caso de `test/devolucao.test.ts` reprova se ele sumir de lá, porque a linha
 * do tempo passaria a imprimir esta chave crua para o coordenador.
 */
export const TIPO_EVENTO_DEVOLUCAO = "devolucao_de_tarefa";

/** O que o evento da trilha carrega, depois de lido. */
export type DevolucaoLida = {
  /**
   * Texto cru, e não `MotivoDeDevolucao`.
   *
   * O valor vem do banco, e o banco guarda o que o aparelho mandou. Declarar
   * aqui o tipo fechado seria o compilador afirmando uma garantia que nenhuma
   * das duas pontas dá: aparelho de versão mais nova com motivo que este painel
   * ainda não conhece produz exatamente esse caso.
   */
  motivo: string;
  /**
   * QUE houve observação, e não qual foi.
   *
   * O texto livre não está aqui, e não vai passar a estar. `trilha_eventos` não
   * tem policy de UPDATE nem de DELETE, então o que entra fica permanente, e a
   * observação é escrita na rua: ela nomeia moradora e descreve condição de
   * saúde, que são exatamente os dados que a minimização por prazo existe para
   * descartar. A trilha guarda o fato do ato; o texto vive na devolução, onde o
   * prazo que o município fixou o alcança.
   */
  temObservacao: boolean;
  /** O prazo que já estava vencido quando a tarefa voltou. */
  prazoPerdidoEm: string | null;
};

/**
 * Lê o `detalhe` do evento de devolução.
 *
 * As chaves são as que `rotas/sincronizacao.ts` grava: `motivo`, `temObservacao`
 * e `prazoEm`, o prazo que já estava vencido no ato. O evento carrega também
 * `motivoRotulo`, `devolucaoId`, `equipeId` e `statusAnterior`, e esta leitura
 * ignora os quatro: o rótulo o painel tira do pacote compartilhado (senão seriam
 * dois textos para o mesmo motivo, um gravado em 2026 e outro na tela de hoje), e
 * os outros três não mudam decisão nenhuma desta tela.
 *
 * `observacao` NÃO é procurada, e isso é a regra e não um descuido: mesmo que um
 * evento antigo a trouxesse, o texto não sairia por aqui. Quem o mostra é a
 * faixa da ocorrência, que o recebe do dossiê, e o dossiê registra a consulta.
 *
 * Nada aqui recusa evento que não tenha tudo: motivo é o único obrigatório,
 * porque sem ele não há o que dizer nem para onde apontar.
 */
export function lerDevolucao(detalhe: Record<string, unknown> | null): DevolucaoLida | null {
  if (!detalhe) return null;
  const motivo = texto(detalhe["motivo"]);
  if (!motivo) return null;
  return {
    motivo,
    temObservacao: detalhe["temObservacao"] === true,
    prazoPerdidoEm: texto(detalhe["prazoEm"]),
  };
}

function texto(valor: unknown): string | null {
  if (typeof valor !== "string") return null;
  const limpo = valor.trim();
  return limpo === "" ? null : limpo;
}

/** O motivo por extenso, do pacote compartilhado, com desfecho honesto. */
export function rotuloDoMotivo(motivo: string): string {
  return ROTULO_MOTIVO_DE_DEVOLUCAO[motivo as MotivoDeDevolucao]
    ?? `Motivo não reconhecido por esta versão do painel (${motivo})`;
}

/**
 * Um evento da trilha, do jeito mínimo que este módulo precisa enxergar.
 *
 * Duas colunas, e a magreza é a mensagem: depois do T12 a trilha serve a esta
 * decisão apenas para responder "houve despacho depois?". Autor, hora do ato e
 * `detalhe` saíram daqui porque a faixa passou a ler tudo isso do dossiê, e um
 * campo a mais no tipo seria convite para alguém voltar a garimpar o JSON.
 */
export type EventoDaTrilha = {
  tipo: string;
  ocorrido_em: string;
};

/**
 * O que a faixa pode dizer sobre a observação, e os três casos são diferentes.
 *
 * `null` na coluna `observacao` não distingue "o agente não escreveu nada" de
 * "o município descartou o texto no prazo que ele mesmo fixou", e a migração
 * 029 acrescentou `observacao_removida_em` exatamente para isso. Colapsar os
 * dois faria a tela afirmar "sem observação" sobre uma frase que existiu, foi
 * lida e foi descartada de propósito. Numa tela que vira prova em processo
 * administrativo, isso não é imprecisão, é afirmação falsa.
 */
export type ObservacaoDaDevolucao =
  | { estado: "ausente" }
  | { estado: "descartada"; em: string }
  | { estado: "escrita"; texto: string };

export type DevolucaoEmAberto = {
  /** Nulo quando quem devolveu não está mais no cadastro. */
  quem: string | null;
  quando: string;
  motivo: string;
  prazoPerdidoEm: string | null;
  observacao: ObservacaoDaDevolucao;
};

/**
 * Em que estado está a observação daquela devolução.
 *
 * A ordem das perguntas é deliberada: a marca de descarte vence o texto. Se as
 * duas viessem preenchidas (o que só aconteceria por defeito na minimização),
 * imprimir a frase seria o painel desfazendo na tela um descarte que o
 * município determinou. Diante da dúvida, o produto se comporta como se o texto
 * já não existisse, que é o lado em que errar não vaza nada.
 */
function estadoDaObservacao(d: DevolucaoDaOcorrencia): ObservacaoDaDevolucao {
  const descartadaEm = marcaDeTempo(d.observacao_removida_em);
  if (descartadaEm) return { estado: "descartada", em: descartadaEm };
  const escrita = texto(d.observacao);
  if (escrita) return { estado: "escrita", texto: escrita };
  return { estado: "ausente" };
}

/**
 * A devolução que ainda espera decisão, ou nada.
 *
 * A DEVOLUÇÃO VEM DO DOSSIÊ, e a trilha entra só para responder se ela já foi
 * resolvida. Até o T12 esta função remontava tudo a partir do `detalhe` do
 * evento, e aquilo deixou de funcionar no dia em que o servidor parou de gravar
 * a observação na trilha: a faixa passaria a dizer para sempre que nenhuma
 * devolução teve observação, inclusive as que tiveram. O campo `devolucao` de
 * `GET /ocorrencias/:id` é a fonte que tem o texto, e é a rota que registra
 * quem o leu.
 *
 * "Ainda espera decisão" é o ponto todo: devolvida e já despachada de novo é
 * história, e história mora na linha do tempo, não num aviso no alto da tela.
 * Um aviso que não some depois de resolvido ensina o coordenador a ignorar
 * avisos, e o próximo que ele ignorar será o de vulnerabilidade social.
 *
 * O critério é a ordem dos fatos, e não o status: status é o que aconteceu por
 * último com a ocorrência, e ler "voltou para triagem" como "espera decisão"
 * confundiria a devolvida com a que nunca saiu do prédio, que é o defeito que
 * este módulo inteiro existe para consertar. Por isso a trilha continua sendo
 * consultada: ela é quem sabe se houve despacho DEPOIS do ato. O `detalhe` dos
 * eventos não é lido aqui, e é essa a diferença.
 */
export function devolucaoEmAberto(
  devolucao: DevolucaoDaOcorrencia | null,
  trilha: readonly EventoDaTrilha[],
): DevolucaoEmAberto | null {
  if (!devolucao) return null;
  const motivo = texto(devolucao.motivo);
  if (!motivo) return null;

  /*
    Comparação por instante, e não por texto. O modo com servidor entrega as
    duas marcas de tempo como texto ISO, e o modo de demonstração entrega o que
    o driver do Postgres devolve; comparar com `>` direto daria certo por
    coincidência num dos dois e erraria calado no outro, e o preço do erro é a
    faixa pedindo uma decisão que já foi tomada.
  */
  const quando = marcaDeTempo(devolucao.decidida_em);
  if (!quando) return null;

  const decididaEm = instante(devolucao.decidida_em);
  const despachadaDepois = trilha.some(
    (e) => e.tipo === "despacho" && instante(e.ocorrido_em) > decididaEm,
  );
  if (despachadaDepois) return null;

  return {
    quem: texto(devolucao.devolvida_por_nome),
    quando,
    motivo,
    prazoPerdidoEm: marcaDeTempo(devolucao.prazo_em),
    observacao: estadoDaObservacao(devolucao),
  };
}

function instante(valor: unknown): number {
  return new Date(valor as string).getTime();
}

/**
 * A marca de tempo como texto, venha ela como texto ou como data.
 *
 * Os dois modos entregam formas diferentes para a MESMA coluna: o modo com
 * servidor manda JSON, onde `timestamptz` é texto ISO, e o modo de demonstração
 * fala com o Postgres pelo driver, que devolve `Date`. O tipo declara `string`
 * porque é o contrato da porta, e o que chega em tempo de execução não obedece
 * ao compilador. Uma leitura que só aceitasse texto descartaria calada o prazo
 * perdido e a data do descarte na demonstração, e a tela mostraria menos do que
 * sabe justamente na reunião com a prefeitura.
 */
function marcaDeTempo(valor: unknown): string | null {
  if (valor instanceof Date) return valor.toISOString();
  return texto(valor);
}

/**
 * Para onde o aviso leva, e o que ele diz que a coordenação faça.
 *
 * `destino` que começa com `#` é âncora nesta mesma tela; o resto é rota do
 * painel.
 */
export type ProximoPasso = {
  texto: string;
  destino: string;
};

/**
 * A âncora de cada bloco que o aviso pode abrir.
 *
 * São os `id` dos ENVOLUCROS dos cartões, e não os dos campos, com uma razão
 * medida: o formulário da coordenada nasce fechado, então `#corrigir-
 * coordenada-ponto` aponta para um elemento que não existe até alguém clicar, e
 * um link que não rola para lugar nenhum é pior que nenhum link.
 */
export const ANCORA_DA_COORDENADA = "cartao-coordenada";
export const ANCORA_DO_DESPACHO = "cartao-despacho";

/**
 * O motivo decide a próxima ação, e é por isso que ele é lista fechada.
 *
 * Um campo de texto livre transformaria isto em leitura e interpretação; com a
 * lista, o painel consegue apontar para o lugar certo da própria tela. As
 * escolhas, e o que foi recusado em cada uma:
 *
 * - **endereço não localizado** leva à correção da coordenada, que é a única
 *   coisa que impede a próxima equipe de perder a mesma viagem. Foi o que
 *   ligou os dois recursos: a correção existe desde a semana passada e o agente
 *   não tinha como pedi-la;
 * - **ninguém no local** e **acesso impedido** levam ao despacho, porque o que
 *   falta é combinar horário e mandar de novo. Instrução para a equipe é campo
 *   do próprio despacho, então a conversa cabe no mesmo formulário;
 * - **fora da área da equipe** leva ao despacho pela outra metade: o que muda é
 *   a equipe, não o horário;
 * - **risco para a equipe** leva ao CATÁLOGO DE ÓRGÃOS, e não à providência.
 *   Providência só é oferecida depois da vistoria (é ela que fundamenta o
 *   pedido), e mandar o coordenador para um cartão que não está na tela seria
 *   um beco. O que ele pode fazer agora é ligar para quem dá o apoio, e o
 *   telefone está no catálogo;
 * - **outro** não inventa ação. O agente escreveu o que aconteceu (o esquema
 *   compartilhado exige a observação justamente aqui), então o passo é ler e
 *   decidir, com o despacho à mão porque é o desfecho mais provável.
 */
export function proximoPasso(motivo: string): ProximoPasso {
  switch (motivo) {
    case "endereco_nao_localizado":
      return { texto: "Corrigir a coordenada no mapa", destino: `#${ANCORA_DA_COORDENADA}` };
    case "risco_para_a_equipe":
      return { texto: "Ver os contatos dos órgãos de apoio", destino: "/orgaos" };
    case "morador_ausente":
    case "acesso_impedido":
      return { texto: "Combinar horário e despachar de novo", destino: `#${ANCORA_DO_DESPACHO}` };
    case "fora_da_area_da_equipe":
      return { texto: "Despachar para outra equipe", destino: `#${ANCORA_DO_DESPACHO}` };
    default:
      return { texto: "Ler a observação e despachar de novo", destino: `#${ANCORA_DO_DESPACHO}` };
  }
}

/** De lista para busca por id, que é como as tabelas consultam linha a linha. */
export function porOcorrencia(
  itens: readonly DevolucaoPendente[] | null,
): Map<string, DevolucaoPendente> {
  const mapa = new Map<string, DevolucaoPendente>();
  for (const d of itens ?? []) mapa.set(d.id, d);
  return mapa;
}

/**
 * A frase da fila e da lista, curta de propósito.
 *
 * Ela vive dentro de uma linha de tabela, embaixo do selo de situação, e a
 * tabela já é densa. O motivo por extenso cabe; a observação não cabe e nem
 * chega até aqui, porque a lista não a carrega: o que a linha faz é dizer que
 * há o que ler e onde, e quem lê abre a ocorrência, que é onde o texto está
 * inteiro e onde a consulta fica registrada.
 */
export function marcaDaLista(d: DevolucaoPendente): string {
  const motivo = `Devolvida do campo: ${rotuloDoMotivo(d.motivo).toLocaleLowerCase("pt-BR")}`;
  return d.tem_observacao ? `${motivo} (há observação do agente na ocorrência)` : motivo;
}

/**
 * A frase do aviso do painel, com a contagem.
 *
 * Contagem e não lista: o painel já tem seis indicadores, uma fila e dois
 * cartões de apoio, e uma sétima caixa empurraria a fila (que é o motivo de o
 * coordenador abrir a tela) para baixo da dobra. O aviso diz quantas são e as
 * linhas ficam marcadas na fila que já estava ali.
 */
export function avisoDoPainel(quantas: number): string {
  return quantas === 1
    ? "1 ocorrência voltou do campo sem vistoria e espera uma decisão."
    : `${quantas} ocorrências voltaram do campo sem vistoria e esperam decisão.`;
}
