import type { Identidade } from "./api";
import {
  criarFilaDeSincronizacao,
  depositoSobreChaveValor,
  lojaSqlite,
  prepararSqlite,
  transporteHttp,
  type AutorDaColeta,
  type FilaDeSincronizacao,
} from "@dc360/campo";
import { bancoLocal } from "./banco-local";
import { arquivosDoAparelho } from "./evidencia-no-disco";

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

let fila: FilaDeSincronizacao | null = null;

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
export async function obterFila(
  baseUrl: string,
  obterToken: () => Promise<string | null>,
  lerIdentidade: () => Identidade | null,
): Promise<FilaDeSincronizacao> {
  if (fila) return fila;

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

  fila = criarFilaDeSincronizacao({
    deposito: depositoSobreChaveValor(lojaSqlite(db)),
    transporte: transporteHttp({ baseUrl, obterToken }),
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

  return fila;
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
      if (temSinal()) {
        await fila.drenar().catch(() => undefined);
      }
      await fila.aguardarProximaJanela();
      // Piso de espera: sem ele, uma fila vazia giraria em laço apertado.
      await new Promise((r) => setTimeout(r, 15_000));
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
