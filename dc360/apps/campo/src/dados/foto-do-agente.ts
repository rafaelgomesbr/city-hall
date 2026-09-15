import { useEffect, useState } from "react";
import * as ImagePicker from "expo-image-picker";
import { ImageManipulator, SaveFormat } from "expo-image-manipulator";
import { Directory, File, Paths } from "expo-file-system";
import {
  SemSinal, autorizarEnvioDaFoto, confirmarFoto, quemSouEu, removerFoto,
} from "./api";

/**
 * A FOTO DE PERFIL DO AGENTE: escolher, reduzir, enviar, guardar, tirar.
 *
 * O pedido, na letra de quem paga: "a foto de avatar no topo com o nome e o
 * cargo, com opção de adicionar ou trocar a foto". É a primeira coisa deste
 * aplicativo que o servidor escolhe sobre si mesmo, e por isso é dado pessoal
 * DELE (não do cidadão), com as regras escritas em `docs/PRIVACIDADE.md`,
 * seção 2.2. Este módulo é a parte do aparelho dessas regras.
 *
 * ## Por que a galeria não pede a permissão de biblioteca
 *
 * `app.config.ts` promete, na declaração das lojas, que o aplicativo não
 * acessa a biblioteca de fotos além do que o agente escolhe. As duas
 * plataformas permitem cumprir isso: o Android abre o Photo Picker do sistema
 * e o iOS abre o `UIImagePickerController`, os dois FORA do processo do
 * aplicativo, e só a imagem tocada volta para cá. Pedir
 * `requestMediaLibraryPermissionsAsync` daria acesso a todas as fotos para
 * usar uma, e no Android abaixo do 13 pediria `READ_EXTERNAL_STORAGE`, que
 * este aplicativo bloqueia de propósito no manifesto. A câmera é outra
 * história: ela é do processo, e a permissão dela continua sendo pedida.
 *
 * ## Por que reduz ANTES de enviar, e a 512
 *
 * Um retrato de câmera moderna passa de cinco megabytes. O avatar maior deste
 * aplicativo tem 96 pontos, e numa tela de densidade três isso são 288 pixels:
 * 512 cobre com folga qualquer tela, e pesa dezenas de kilobytes em JPEG.
 * Sobe pelo 3G do morro em segundos em vez de minutos, e cabe folgado no teto
 * de dois megabytes que o servidor impõe à foto de perfil. A fotografia de
 * vistoria NÃO passa por aqui: ela é prova, e prova não se reduz.
 *
 * ## Sem sinal: recusa, e não fila. A decisão, escrita.
 *
 * A fila de sincronização existe para não perder TRABALHO feito no morro:
 * vistoria, foto de evidência, devolução. Trocar a foto de perfil não é
 * trabalho, e não se faz no morro: se faz na base, olhando para a própria
 * tela. Pôr a foto na fila exigiria um tipo novo de item no motor de campo
 * (`packages/campo`), faria o retrato aparecer na aba Envio ao lado de
 * vistorias esperando sinal, e transformaria "Tudo sincronizado" numa frase
 * que também fala de um selfie. O custo de recusar é uma frase: "precisa de
 * sinal, faça na base". O custo de enfileirar é confundir a peça mais
 * importante do produto. A tela desabilita a troca sem sinal e diz por quê, e
 * este módulo, se for chamado mesmo assim, recusa com a mesma frase.
 *
 * ## A cópia local, e por que ela existe
 *
 * A URL da foto é assinada e vence em minutos, então ela não se guarda. O que
 * se guarda é o ARQUIVO, em `Paths.document`, com o id do usuário no nome:
 * assim a tela abre com a foto sem sinal, e assim a limpeza do logout sabe o
 * que apagar (o aparelho é compartilhado entre turnos, e o rosto do agente da
 * manhã não pertence ao da noite). A cópia só é gravada DEPOIS de o servidor
 * confirmar: uma foto que só existe no aparelho seria uma foto que a equipe
 * nunca vê, mostrada como se fosse a do cadastro.
 */

/** O lado do quadrado, em pontos, depois da redução. */
export const LADO_DA_FOTO = 512;

/**
 * A compressão do JPEG. Mesma faixa da evidência (0,6 lá, 0,8 aqui): um
 * retrato de 512 pontos a 0,8 pesa dezenas de kilobytes, e abaixo disso o
 * rosto ganha blocos. A evidência pode ser mais dura porque precisa mostrar
 * a trinca, não a pessoa.
 */
export const QUALIDADE_DA_FOTO = 0.8;

export type OrigemDaFoto = "camera" | "galeria";

export type FotoEscolhida = {
  /** O arquivo já recortado e reduzido, no cache do sistema. */
  uri: string;
  tamanhoBytes: number;
  tipoConteudo: "image/jpeg";
};

export type ResultadoDaEscolha =
  | { situacao: "escolhida"; foto: FotoEscolhida }
  | { situacao: "cancelada" }
  | { situacao: "sem_permissao"; origem: OrigemDaFoto };

const OPCOES_DO_SELETOR: ImagePicker.ImagePickerOptions = {
  mediaTypes: ["images"],
  allowsEditing: true,
  aspect: [1, 1],
  /* Qualidade máxima AQUI: quem comprime é a redução logo abaixo, uma vez só.
     Comprimir duas vezes (no seletor e na redução) é como um retrato de
     512 pontos ganha blocos. */
  quality: 1,
  /* Sem EXIF: a foto de perfil não precisa de onde nem quando foi tirada, e
     coordenada dentro de um retrato é dado a mais sem finalidade nenhuma. */
  exif: false,
  base64: false,
};

/**
 * Abre a câmera ou a galeria, e devolve a foto já quadrada e reduzida.
 *
 * Nunca estoura por "cancelou": cancelar é a resposta mais comum de quem abriu
 * a galeria por curiosidade, e tratá-la como erro poria uma tarja vermelha na
 * tela de quem não fez nada de errado.
 */
export async function escolherFoto(origem: OrigemDaFoto): Promise<ResultadoDaEscolha> {
  let resultado: ImagePicker.ImagePickerResult;
  if (origem === "camera") {
    const permissao = await ImagePicker.requestCameraPermissionsAsync();
    if (!permissao.granted) return { situacao: "sem_permissao", origem };
    resultado = await ImagePicker.launchCameraAsync({ ...OPCOES_DO_SELETOR, cameraType: ImagePicker.CameraType.front });
  } else {
    resultado = await ImagePicker.launchImageLibraryAsync(OPCOES_DO_SELETOR);
  }

  const escolhida = resultado.canceled ? null : (resultado.assets?.[0] ?? null);
  if (!escolhida) return { situacao: "cancelada" };

  return { situacao: "escolhida", foto: await reduzir(escolhida) };
}

/**
 * Recorta ao quadrado CENTRAL e reduz a 512 por 512, em JPEG.
 *
 * O recorte existe mesmo com `allowsEditing`: o iOS sempre recorta em
 * quadrado, o Android costuma obedecer ao `aspect`, e "costuma" não é
 * garantia. Reduzir uma imagem 3000 por 4000 direto a 512 por 512 esticaria o
 * rosto, e um avatar achatado é pior que nenhum.
 */
async function reduzir(asset: { uri: string; width: number; height: number }): Promise<FotoEscolhida> {
  const lado = Math.min(asset.width, asset.height);
  const contexto = ImageManipulator.manipulate(asset.uri);
  if (lado > 0 && asset.width !== asset.height) {
    contexto.crop({
      originX: Math.floor((asset.width - lado) / 2),
      originY: Math.floor((asset.height - lado) / 2),
      width: lado,
      height: lado,
    });
  }
  contexto.resize({ width: LADO_DA_FOTO, height: LADO_DA_FOTO });
  const imagem = await contexto.renderAsync();
  const gravada = await imagem.saveAsync({ compress: QUALIDADE_DA_FOTO, format: SaveFormat.JPEG });

  /* O tamanho é lido do arquivo que FICOU, como na evidência: é esse número
     que vai na autorização, e o servidor confere contra os bytes. */
  return {
    uri: gravada.uri,
    tamanhoBytes: new File(gravada.uri).size ?? 0,
    tipoConteudo: "image/jpeg",
  };
}

/**
 * O nome da cópia local: `perfil-foto-<usuario>-<carimbo>.jpg`.
 *
 * O carimbo existe por causa do CACHE de imagem do sistema: o `Image` do
 * React Native guarda o que já desenhou por URI, e uma foto nova gravada com
 * o mesmo nome continuaria aparecendo como a antiga até o aplicativo ser
 * morto. Nome novo por foto é o que faz a troca aparecer no mesmo quadro.
 * A cópia anterior do mesmo usuário é apagada ao gravar a nova.
 */
const PREFIXO_DA_COPIA = "perfil-foto-";
const COPIA_LOCAL = /^perfil-foto-.+\.jpg$/;

function copiasDe(usuarioId: string): File[] {
  const pasta = new Directory(Paths.document);
  const prefixo = `${PREFIXO_DA_COPIA}${usuarioId}-`;
  return pasta.list()
    .filter((item): item is File => item instanceof File && item.name.startsWith(prefixo))
    .sort((a, b) => a.name.localeCompare(b.name));
}

function novaCopia(usuarioId: string): File {
  return new File(Paths.document, `${PREFIXO_DA_COPIA}${usuarioId}-${Date.now().toString(36)}.jpg`);
}

/** Apaga as cópias deste usuário. Nunca estoura: ver `apagarFotosLocais`. */
function apagarCopiasDe(usuarioId: string): void {
  try {
    for (const copia of copiasDe(usuarioId)) {
      try { copia.delete(); } catch { /* fica para o logout */ }
    }
  } catch { /* pasta ilegível: não há o que apagar */ }
}

/** A cópia local da foto deste usuário (a mais recente), ou nula quando o aparelho não a tem. */
export function fotoLocalDoAgente(usuarioId: string): string | null {
  try {
    const copias = copiasDe(usuarioId);
    return copias[copias.length - 1]?.uri ?? null;
  } catch {
    return null;
  }
}

/**
 * QUEM MAIS MOSTRA O ROSTO, e como fica sabendo que ele mudou.
 *
 * A foto aparece em dois lugares: no topo do Perfil, que é quem a troca, e
 * no avatar do menu, que está em toda tela. O menu não pode reler o disco a
 * cada desenho (é uma listagem de pasta) nem pode depender de o Perfil estar
 * montado. Então o disco AVISA: todo caminho que grava ou apaga uma cópia
 * chama `avisarFotoMudou`, e quem desenha o rosto assina com
 * `useFotoDoAgente`. É o mesmo desenho da fila e do sino: a fonte da verdade
 * é o disco, e o aviso é só "releia".
 */
type OuvinteDaFoto = (usuarioId: string | null) => void;
const ouvintesDaFoto = new Set<OuvinteDaFoto>();

export function assinarFotoDoAgente(ouvinte: OuvinteDaFoto): () => void {
  ouvintesDaFoto.add(ouvinte);
  return () => { ouvintesDaFoto.delete(ouvinte); };
}

/** `null` quer dizer "todas": é o logout apagando o disco inteiro. */
function avisarFotoMudou(usuarioId: string | null): void {
  for (const ouvinte of ouvintesDaFoto) {
    try { ouvinte(usuarioId); } catch { /* um ouvinte quebrado não cala os outros */ }
  }
}

/**
 * A cópia local da foto, viva: relê quando o disco avisa que mudou.
 *
 * Sem `usuarioId` (ninguém entrou) devolve nulo e não assina nada.
 */
export function useFotoDoAgente(usuarioId: string | null | undefined): string | null {
  const [uri, setUri] = useState<string | null>(() => (usuarioId ? fotoLocalDoAgente(usuarioId) : null));

  useEffect(() => {
    if (!usuarioId) { setUri(null); return; }
    setUri(fotoLocalDoAgente(usuarioId));
    return assinarFotoDoAgente((mudou) => {
      if (mudou === null || mudou === usuarioId) setUri(fotoLocalDoAgente(usuarioId));
    });
  }, [usuarioId]);

  return uri;
}

/**
 * Envia a foto pelo ciclo da evidência e guarda a cópia local no fim.
 *
 * Toda falha sai em português e termina numa ação, porque quem lê está com o
 * telefone na mão esperando a própria foto aparecer. A rede caindo no meio
 * é `SemSinal`, a mesma classe das outras chamadas, para a tela tratar igual.
 */
export async function enviarFoto(
  token: string,
  foto: FotoEscolhida,
  usuarioId: string,
): Promise<{ fotoUrl: string; uriLocal: string }> {
  const autorizacao = await autorizarEnvioDaFoto(token, {
    tipoConteudo: foto.tipoConteudo, tamanhoBytes: foto.tamanhoBytes,
  });

  const bytes = await new File(foto.uri).bytes();
  let resposta: Response;
  try {
    resposta = await fetch(autorizacao.url, {
      method: "PUT",
      headers: autorizacao.cabecalhos,
      body: bytes,
    });
  } catch {
    throw new SemSinal();
  }
  if (!resposta.ok) {
    throw new Error(
      "O armazenamento não aceitou a foto. Tente de novo em alguns minutos, "
      + "ou escolha outra imagem.",
    );
  }

  const { fotoUrl } = await confirmarFoto(token, autorizacao.chave);

  const destino = novaCopia(usuarioId);
  try {
    apagarCopiasDe(usuarioId);
    await new File(foto.uri).copy(destino);
  } catch {
    /* A cópia local é conforto: sem ela a tela busca a foto do servidor na
       próxima abertura com sinal. O envio já deu certo, e é isso que a
       tela precisa saber. */
  }
  avisarFotoMudou(usuarioId);
  return { fotoUrl, uriLocal: destino.exists ? destino.uri : foto.uri };
}

/**
 * Traz a foto do servidor para o disco, ou apaga a cópia se lá não há foto.
 *
 * Chamada na abertura do perfil com sinal: é o que faz um aparelho novo (ou
 * o de plantão, depois de outra pessoa) mostrar a foto que a pessoa já tinha
 * escolhido em outro telefone. Devolve a URI local (ou nula) e o cadastro
 * que veio junto, porque a mesma resposta traz o email, que a tela de conta
 * mostra e que a identidade guardada no cofre não tem.
 */
export async function baixarFotoDoAgente(
  token: string,
  usuarioId: string,
): Promise<{ fotoLocal: string | null; email: string }> {
  const eu = await quemSouEu(token);
  if (!eu.fotoUrl) {
    apagarCopiasDe(usuarioId);
    avisarFotoMudou(usuarioId);
    return { fotoLocal: null, email: eu.email };
  }
  /*
    A cópia que já existe fica até a nova chegar inteira, e só então sai: um
    aparelho sem sinal no meio da baixa continua mostrando a foto anterior em
    vez de iniciais.
  */
  const destino = novaCopia(usuarioId);
  try {
    await File.downloadFileAsync(eu.fotoUrl, destino, { idempotent: true });
    for (const copia of copiasDe(usuarioId)) {
      if (copia.uri !== destino.uri) { try { copia.delete(); } catch { /* fica para o logout */ } }
    }
    avisarFotoMudou(usuarioId);
    return { fotoLocal: destino.uri, email: eu.email };
  } catch {
    /* Baixar é conforto: a tela cai na cópia anterior ou nas iniciais, e
       tenta de novo na próxima abertura. Uma tarja vermelha por causa de um
       retrato seria ruído em cima da tela que diz se a coleta subiu. */
    return { fotoLocal: fotoLocalDoAgente(usuarioId), email: eu.email };
  }
}

/** Tira a foto no servidor e a cópia do aparelho. */
export async function removerFotoDoAgente(token: string, usuarioId: string): Promise<void> {
  await removerFoto(token);
  apagarCopiasDe(usuarioId);
  avisarFotoMudou(usuarioId);
}

/**
 * Apaga TODA cópia local de foto de perfil, de qualquer usuário.
 *
 * É a parte do logout: o aparelho é compartilhado entre turnos, e a foto que
 * ficasse no disco apareceria (ou pelo menos ocuparia espaço com o rosto de
 * alguém) para quem entrar depois. Só o padrão `perfil-foto-*.jpg`: a
 * fotografia de vistoria em `Paths.document` é prova e tem limpeza própria,
 * que respeita a fila.
 *
 * Não estoura nunca, pelo mesmo contrato de `apagarFotoDoAparelho`: quem
 * chama está no meio de sair da conta, e sair não pode falhar por causa de um
 * arquivo.
 */
export function apagarFotosLocais(): void {
  try {
    const pasta = new Directory(Paths.document);
    for (const item of pasta.list()) {
      if (item instanceof File && COPIA_LOCAL.test(item.name)) {
        try { item.delete(); } catch { /* fica para a próxima limpeza */ }
      }
    }
  } catch { /* pasta ilegível: não há o que apagar */ }
  avisarFotoMudou(null);
}
