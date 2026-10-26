import type { Identidade } from "./api";
import {
  criarFilaDeSincronizacao,
  depositoSobreChaveValor,
  lojaSqlite,
  prepararSqlite,
  transporteHttp,
  type AutorDaColeta,
  type FilaDeSincronizacao,
  type ObterToken,
} from "@dc360/campo";
import { bancoLocal } from "./banco-local";
import { arquivosDoAparelho } from "./evidencia-no-disco";
import { ESPERA_COM_A_FILA_PAUSADA_MS } from "./pausa-da-fila";
import { geracaoDaSessao } from "./geracao-da-sessao";
import { versaoDoAplicativo } from "./versao-do-aplicativo";

/**
 * Onde a parte testada encontra o aparelho.
 *
 * Este é o único arquivo do aplicativo que importa `expo-*`, e é curto de
 * propósito: toda a lógica que decide o que reenviar, quando esperar e o que
 * bloquear vive em `packages/campo`, com 43 testes rodando fora do celular.
 * Aqui só se conectam os fios.
 *
 * ATENÇÃO: nunca foi executado em aparelho. Ver `apps/campo/LEIA-ME.md`.
 */

/**
 * A PROMESSA da fila, e não a fila (V2-F00-E06, correção 2).
 *
 * Esta variável já foi `FilaDeSincronizacao | null`, conferida logo na
 * primeira linha de `obterFila`. Mas a fila só existe depois de `await
 * bancoLocal()`, e na abertura do aplicativo a faixa, a barra de abas, o laço
 * de fundo e a tela da fila a pedem no mesmo instante: todas passavam pela
 * conferência com a variável ainda nula e cada uma montava a sua fila. Cada
 * instância tem a sua pausa da sessão, a sua marca de cancelamento e o seu
 * `drenando`, então a pausa nascia numa fila que ninguém mais escutava, e a
 * faixa global mostrava "Tudo sincronizado" sobre uma coleta parada (achado no
 * emulador Android pela validação de 13/10/2026). Guardar a promessa faz quem
 * chega em segundo esperar a mesma criação em vez de começar outra.
 */
let fila: Promise<FilaDeSincronizacao> | null = null;

/**
 * A fila, criada uma vez e reaproveitada.
 *
 * CONTRATO, e ele é a parte perigosa: a fila guarda o PRIMEIRO `obterToken`
 * que recebe e ignora todos os seguintes. Quem passar essa função precisa
 * garantir que ela seja estável e que leia as credenciais de fonte viva, e
 * não de uma closure congelada. É o que `sessao.tsx` faz, mantendo as
 * credenciais numa ref. Passar aqui uma função que fecha sobre um valor de
 * estado faz o aplicativo reapresentar, a cada envio, um token de renovação
 * já rotacionado, o que a API lê como roubo e responde derrubando todas as
 * sessões do agente.
 *
 * O MESMO contrato vale para `lerIdentidade`, e ali o preço de errar é pior que
 * uma sessão derrubada: é um laudo assinado pela pessoa errada. Ver
 * `sessaoAtual` logo abaixo.
 */
export function obterFila(
  baseUrl: string,
  obterToken: ObterToken,
  lerIdentidade: () => Identidade | null,
): Promise<FilaDeSincronizacao> {
  fila ??= criarFila(baseUrl, obterToken, lerIdentidade).catch((erro: unknown) => {
    /*
      A falha NÃO fica guardada AQUI: a variável da fila volta a nula, para a
      próxima chamada tentar criar de novo em vez de receber a mesma promessa
      rejeitada. Isso é só metade do caminho. `criarFila` começa por
      `bancoLocal()`, e ele memoiza a PRÓPRIA promessa, rejeitada inclusive
      (ver `banco-local.ts`): se foi a abertura do banco que falhou, a nova
      tentativa recebe a mesma rejeição até `esquecerConexao()` ou o aplicativo
      ser reaberto. Falha em outro ponto da criação (depois de o banco abrir)
      é a que a nova chamada de fato refaz.
    */
    fila = null;
    throw erro;
  });
  return fila;
}

/**
 * Só para teste: esquece a fila, para o caso seguinte começar do zero.
 *
 * Mesmo papel de `esquecerConexao` em `banco-local.ts`, e deve ser usada junto
 * com ela (a fila guarda o banco que foi aberto). A fila é um singleton do
 * aparelho; sem isto, um teste herda o estado do anterior.
 */
export function esquecerFila(): void {
  fila = null;
}

async function criarFila(
  baseUrl: string,
  obterToken: ObterToken,
  lerIdentidade: () => Identidade | null,
): Promise<FilaDeSincronizacao> {
  /*
    O banco é aberto uma vez, em `banco-local.ts`, e é o MESMO que o rascunho
    e a lista de pendências usam.

    Este comentário já dizia que abrir por operação "arrisca duas conexões
    escrevendo ao mesmo tempo na mesma coleta", e mesmo assim esta linha abria
    a terceira. O risco se materializou em aparelho: escrita recusada na hora,
    com a promessa não tratada, quando o sinal volta e a lista de tarefas é
    trocada enquanto o agente grava o rascunho.
  */
  const db = await bancoLocal();
  await prepararSqlite(db);

  return criarFilaDeSincronizacao({
    deposito: depositoSobreChaveValor(lojaSqlite(db)),
    /*
      A versão vai por parâmetro (V2-F02-E06): o pacote não conhece o Expo. Com
      ela todo pedido da fila leva `x-app-version: campo/<versão>`, e o 426 de
      versão abaixo da mínima pausa a fila com o item guardado.
    */
    transporte: transporteHttp({ baseUrl, obterToken, versaoDoAplicativo: versaoDoAplicativo() }),
    /*
      QUEM esta logado, lido a cada vez, pelo mesmo motivo e com o mesmo
      cuidado do `obterToken`.

      Do lado do servidor, o autor da vistoria e simplesmente quem apresentou o
      token: o envelope nao carrega autor nenhum. Entao a fila precisa carimbar
      quem coletou no momento da coleta e recusar-se a enviar coleta de outra
      pessoa. Este getter e a fonte viva desse carimbo. Uma funcao que fechasse
      sobre um valor de estado deixaria a fila presa no agente da primeira
      renderizacao, que e o defeito ao contrario: a coleta do turno da noite
      subindo com o nome do agente da manha.

      So os tres campos que decidem a autoria atravessam. Matricula, papel e
      municipio ficam de fora porque a fila nao tem o que fazer com eles, e o
      item da fila vai para o disco do aparelho.
    */
    sessaoAtual: (): AutorDaColeta | null => {
      const eu = lerIdentidade();
      if (!eu) return null;
      return {
        usuarioId: eu.usuarioId,
        nome: eu.nome,
        organizacaoId: eu.organizacaoId,
      };
    },
    /* A pausa por sessão cai quando a pessoa entra de novo (correção 3 da E06). */
    geracaoDaSessao,
    /*
      A leitura dos bytes, com o cuidado de dizer em português (e como falha
      permanente) quando o arquivo não está mais no aparelho. Ver
      `evidencia-no-disco.ts`.
    */
    arquivos: arquivosDoAparelho,
    /*
      Tempo limite mais generoso que o padrão do pacote: a rede de borda de
      cidade é lenta, e cortar cedo transforma envio que ia completar em
      tentativa perdida, gastando bateria e dados duas vezes.
    */
  });
}

/**
 * Laço de fundo da sincronização.
 *
 * Ele NÃO tenta a cada segundo. A própria fila calcula quando o próximo item
 * fica liberado, com espera crescente e ruído, e este laço apenas dorme até
 * lá. Num aparelho que passa o dia no bolso do agente, a diferença entre isso
 * e um laço de intervalo fixo é a bateria durar ou não até o fim do plantão.
 */
export function iniciarSincronizacaoContinua(
  fila: FilaDeSincronizacao,
  temSinal: () => boolean,
): () => void {
  let ativo = true;

  void (async () => {
    while (ativo) {
      let pausadaPelaSessao = false;
      if (temSinal()) {
        const resultado = await fila.drenar().catch(() => undefined);
        pausadaPelaSessao = resultado?.paradaPor !== undefined;
      }
      await fila.aguardarProximaJanela();
      /*
        Piso de espera: sem ele, uma fila vazia giraria em laço apertado.

        Com a fila parada pela SESSÃO (401 `sessao_encerrada` ou 403
        `conta_desativada`) o piso é maior. Cada volta é uma requisição que o
        servidor já respondeu "não", e a pessoa que resolve entrando de novo
        reinicia este laço na hora (o layout das abas é desmontado e montado de
        novo com a sessão), então o piso só governa o caso em que ninguém agiu.
      */
      await new Promise((r) => setTimeout(r, pausadaPelaSessao ? ESPERA_COM_A_FILA_PAUSADA_MS : 15_000));
    }
  })();

  return () => {
    ativo = false;
    // Interrompe o dreno em andamento: o aplicativo indo para segundo plano
    // no meio de um envio não pode deixar um dreno órfão que volta a rodar
    // junto com o próximo.
    fila.cancelar();
  };
}
