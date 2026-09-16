import { File, Paths } from "expo-file-system";
import { CODIGO_ARQUIVO_SUMIU, FalhaPermanente, type Arquivos } from "@dc360/campo";

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

    E o zero do `size` nunca é aceito como medida. Esta linha era
    `gravado.size ?? 0`, e o `size` da API nova do `expo-file-system` é
    documentado como "0 se o arquivo não existe ou não pôde ser lido": em
    15/09/2026, no iPhone, a vistoria 000009/2026 entrou na fila com
    `tamanhoBytes: 0`, o servidor recusou a fotografia três vezes com 422, e a
    foto de 812 KB estava inteira no aparelho. `medirArquivoNoAparelho` cai
    para os bytes de verdade quando o `size` vem zerado ou nulo; o zero que
    sobrevive a isso é arquivo perdido, nunca um número que se envia.
  */
  const tamanhoBytes = medirArquivoNoAparelho(destino.uri);
  if (tamanhoBytes === 0) {
    throw new Error(
      "A foto não ficou guardada neste aparelho (o arquivo saiu vazio). "
      + "Tire a foto de novo.",
    );
  }
  return { uriLocal: destino.uri, tamanhoBytes };
}

/**
 * Quantos bytes o arquivo tem: o que o sistema informa, e os bytes de verdade
 * como régua de desempate.
 *
 * Zero quando o arquivo não existe ou não pôde ser lido: é o mesmo zero que
 * `size` devolveria, só que aqui ele nunca é confundido com tamanho. Quem chama
 * trata zero como arquivo perdido, e a conferência com o esquema do servidor
 * (`conferirColeta`) recusa com a frase própria antes de a coleta enfileirar.
 *
 * ## Por que `size` primeiro, se foi o `size` que mentiu em 15/09/2026
 *
 * A primeira versão desta função media SÓ pelos bytes (`bytesSync().length`),
 * pela razão certa: o `size` do iPhone veio zerado com a foto de 812 KB
 * inteira no aparelho. O que ela pagava por isso é o custo de ler o arquivo
 * INTEIRO, de forma síncrona, uma fotografia atrás da outra, no toque de
 * concluir: seis fotos de 800 KB são cinco megabytes passando pela memória com
 * a tela travada, num aparelho de entrada, para produzir seis números.
 *
 * O `size` responde sem abrir o arquivo, e quando ele responde um número
 * positivo esse número é o do sistema de arquivos, que é o mesmo que a leitura
 * daria. O caso em que ele mente é exatamente o caso do zero (a documentação
 * diz "0 se o arquivo não existe ou não pôde ser lido", e o iPhone provou que
 * "não pôde ser lido" acontece com arquivo são): AÍ os bytes são lidos, e só
 * aí. Nulo cai no mesmo caminho, porque não saber o tamanho não é ter tamanho
 * zero. O zero que sobrevive aos dois é arquivo perdido de verdade.
 */
export function medirArquivoNoAparelho(uriLocal: string): number {
  try {
    const arquivo = new File(uriLocal);
    const informado = arquivo.size;
    if (typeof informado === "number" && Number.isFinite(informado) && informado > 0) {
      return informado;
    }
    return arquivo.bytesSync().length;
  } catch {
    return 0;
  }
}

/**
 * A fotografia que saiu da vistoria sai TAMBÉM do aparelho.
 *
 * O diálogo de apagar promete isto com todas as letras ("o arquivo é
 * descartado deste aparelho"), e até aqui a promessa era falsa: a tela tirava
 * a foto da lista do rascunho e o JPEG ficava em `Paths.document` para sempre.
 * O único lugar que varria esses arquivos era o logout, e o agente de campo
 * não sai da conta: ele fecha o aplicativo e volta no dia seguinte. O aparelho
 * é de entrada, é compartilhado entre turnos, e o que ficava ali é a mesma
 * coisa que a limpeza do logout chama pelo nome, "lixo com dado de família
 * dentro", só que de uma foto que o agente mandou apagar.
 *
 * Não estoura NUNCA, e isso é o contrato. Quem chama está no meio de tirar a
 * foto da vistoria, e essa parte não pode falhar por causa da limpeza: arquivo
 * que já não existe, caminho que o sistema recusa, permissão perdida, tudo
 * vira silêncio aqui. O arquivo órfão volta a ser problema do logout, que é
 * onde ele sempre esteve; a foto sumir da lista é o que o agente pediu.
 *
 * Devolve se conseguiu, porque o teste precisa poder perguntar, e porque a
 * diferença entre "apaguei" e "não deu" é dizível sem ser lançável.
 */
export function apagarFotoDoAparelho(uriLocal: string): boolean {
  try {
    const arquivo = new File(uriLocal);
    if (!arquivo.exists) return false;
    arquivo.delete();
    return true;
  } catch {
    return false;
  }
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
 *
 * O CÓDIGO vem do pacote e não é escrito à mão aqui. Ele é o contrato entre
 * esta porta, o dreno (que marca a foto como perdida) e a tela (que oferece
 * enviar sem ela). Escrito em três lugares, ele divergiria na primeira
 * renomeação, e o único sintoma seria a saída sumir da tela e a coleta voltar a
 * ficar presa para sempre.
 *
 * A frase daqui é o sinal interno: quem o agente lê é a do dreno, que sabe
 * QUANTOS arquivos faltam e oferece a saída. Ela continua em português porque
 * uma falha que escape por outro caminho não pode chegar à rua em inglês.
 */
export const arquivosDoAparelho: Arquivos = {
  async ler(uriLocal: string): Promise<Uint8Array> {
    const arquivo = new File(uriLocal);
    if (!arquivo.exists) {
      throw new FalhaPermanente(
        "Um arquivo desta vistoria não está mais neste aparelho, então ela não "
        + "pode ser enviada inteira.",
        CODIGO_ARQUIVO_SUMIU,
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
