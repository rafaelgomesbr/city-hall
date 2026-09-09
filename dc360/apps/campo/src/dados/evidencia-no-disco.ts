import { File, Paths } from "expo-file-system";
import { FalhaPermanente, type Arquivos } from "@dc360/campo";

/**
 * Onde a prova da vistoria fica guardada no aparelho até subir.
 *
 * `takePictureAsync` devolve um caminho no diretório de CACHE do sistema, e
 * cache é, por definição, o que o sistema operacional apaga sozinho quando o
 * armazenamento aperta, sem avisar ninguém. O aparelho de campo é modelo de
 * entrada, vive cheio, e a coleta pode passar horas (ou o fim de semana) na
 * fila esperando sinal.
 *
 * O desfecho, quando o sistema limpava o cache antes da sincronização: o envio
 * lê os bytes da foto ANTES de mandar o envelope, estourava em arquivo
 * inexistente, e o envelope inteiro (checklist, GPS, assinatura, observações)
 * nunca saía. Uma foto apagada pelo sistema destruía a vistoria inteira, e o
 * erro chegava ao agente em inglês.
 *
 * O quadro de assinatura já resolvia isso do lado dele, e pelo mesmo motivo:
 * ver a decisão 2 no cabeçalho de `ui/Assinatura.tsx`. Aqui a foto passa a
 * seguir a mesma regra, e o nome do arquivo segue o mesmo formato reconhecido
 * pela limpeza do logout em `banco-local.ts`, que preserva o que a fila ainda
 * referencia.
 */
export function guardarFotoNoAparelho(
  uriDaCamera: string,
  ordem: number,
): { uriLocal: string; tamanhoBytes: number } {
  /*
    `foto-<carimbo>-<ordem>.jpg`, e os dois números importam.

    O carimbo separa vistorias diferentes; a ordem separa duas fotos tiradas no
    mesmo milissegundo, que acontece quando o agente segura o botão. Nome
    repetido sobrescreveria a foto anterior, e a foto anterior é prova.
  */
  const destino = new File(Paths.document, `foto-${Date.now()}-${ordem}.jpg`);
  new File(uriDaCamera).copy(destino);

  /*
    O tamanho é lido do arquivo que ficou, e não do que a câmera devolveu.

    É esse número que vai na autorização de envio, e o servidor confere. Ler do
    original faria a conferência bater por acaso, e deixaria de bater no dia em
    que a cópia falhasse pela metade, que é o dia em que ela precisa ser
    percebida.
  */
  const gravado = new File(destino.uri);
  return { uriLocal: destino.uri, tamanhoBytes: gravado.size ?? 0 };
}

/**
 * De onde a fila tira os bytes na hora de enviar.
 *
 * O arquivo pode não estar mais lá: aparelho que atualizou trazendo coleta
 * antiga (com a foto ainda no cache do sistema, de antes de
 * `guardarFotoNoAparelho` existir), ou pessoa que limpou os arquivos do
 * aplicativo pelos ajustes do Android.
 *
 * Duas coisas dependem desta função dizer isso direito, e as duas são falhas
 * que já aconteceram:
 *
 * 1. **A falha precisa ser PERMANENTE.** A fila insiste para sempre em falha
 *    temporária, de propósito (sinal ruim é a condição normal de trabalho e não
 *    pode aposentar coleta boa). Um arquivo que não existe nunca vai existir:
 *    deixar a leitura estourar com o erro cru do sistema faria a fila
 *    classificá-lo como problema de rede e tentar de novo a cada cinco minutos,
 *    para sempre, com a tela dizendo "vai continuar tentando sozinha".
 * 2. **A frase precisa ser em português e terminar numa ação.** O erro do
 *    `expo-file-system` chega em inglês, e ele apareceria na tela do agente,
 *    na rua, como texto final.
 */
export const arquivosDoAparelho: Arquivos = {
  async ler(uriLocal: string): Promise<Uint8Array> {
    const arquivo = new File(uriLocal);
    if (!arquivo.exists) {
      throw new FalhaPermanente(
        "Um arquivo desta vistoria não está mais neste aparelho, então ela não "
        + "pode ser enviada inteira. Avise a coordenação e informe o protocolo "
        + "desta coleta.",
        "arquivo_sumiu",
      );
    }
    /*
      `bytes()` devolve o binário direto. A versão anterior lia em base64 e
      decodificava à mão com `atob`, o que gastava memória três vezes (arquivo,
      string base64, array) e derrubava aparelho de entrada numa foto de doze
      megapixels.
    */
    return arquivo.bytes();
  },
};
