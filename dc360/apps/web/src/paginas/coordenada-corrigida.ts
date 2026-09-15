import {
  coordenadaEmTexto, correcaoDeCoordenadaSchema, estadoTerminal, podeExecutar,
  type Coordenada, type CorrecaoDeCoordenada, type Papel, type StatusOcorrencia,
} from "@dc360/shared";
import { lerLocalizacaoColada } from "./coordenada-colada";
import { ROTULO_DO_BOTAO } from "./link-encurtado";

/**
 * As decisões da correção de coordenada que não dependem de React.
 *
 * Mesma razão de `ocorrencia-regras.ts`: decisão escondida num `&&` no meio de
 * mil linhas de componente não tem como ser exercitada, porque este painel não
 * roda em navegador de teste. Como função pura, cada regra tem teste que roda
 * em milissegundos.
 *
 * O que ESTE arquivo não é: controle de acesso. O controle é o
 * `exigirPermissao` do servidor (e o da camada local, que é a outra ponta da
 * mesma porta). Aqui só se decide o que a tela desenha e o que ela deixa de
 * mandar para levar um não previsível.
 */

/**
 * Quando o painel OFERECE a correção do ponto.
 *
 * Duas condições, e as duas espelham a rota:
 *
 * - a permissão é `abrir_ocorrencia`, a mesma competência que informa a
 *   localização quando o chamado entra. Quem registra é quem erra o ponto com
 *   o telefone no ombro, e é quem precisa poder corrigi-lo. O agente de campo
 *   fica de fora: o canal dele para dizer onde a casa fica é a vistoria, com o
 *   GPS do aparelho;
 * - encerrada não muda de lugar, e o portão é `estadoTerminal` em vez de uma
 *   lista de status escrita à mão, para um estado novo não precisar ser
 *   lembrado aqui amanhã.
 */
export function podeCorrigirCoordenada(papel: Papel, status: StatusOcorrencia): boolean {
  if (!podeExecutar(papel, "abrir_ocorrencia")) return false;
  return !estadoTerminal(status);
}

export type DecisaoDaCorrecao =
  | { tipo: "erro"; mensagem: string }
  | { tipo: "gravar"; correcao: CorrecaoDeCoordenada };

/**
 * O que o botão de corrigir faz com o que está digitado.
 *
 * O leitor do texto colado é o MESMO da abertura (`lerLocalizacaoColada`):
 * link do Google, `geo:` do Android, par com ponto, par com vírgula decimal e
 * grau/minuto/segundo, mais a recusa explícita do texto que admite duas
 * leituras. Escrever um segundo leitor aqui faria a mesma colagem ser aceita
 * numa tela e recusada na outra, o que é pior que não ler nada.
 *
 * Três recusas próprias da tela, e nenhuma delas substitui as do servidor:
 *
 * 1. **Leitura que não virou ponto** não vai para o servidor. Aqui a
 *    coordenada não é opcional como na abertura: a pessoa abriu este
 *    formulário exatamente para mexer no ponto, então mandar um corpo sem
 *    coordenada seria pedir um 422 previsível.
 * 2. **O ponto igual ao que já está gravado** é recusado. Ele não seria erro
 *    para o servidor: entraria, e deixaria na trilha append-only um evento
 *    dizendo que a coordenada foi corrigida de um lugar para o mesmo lugar.
 *    Trilha não se apaga, então evento inútil é para sempre.
 * 3. **O motivo** é conferido pelo esquema compartilhado, o mesmo do servidor,
 *    para a mensagem que a pessoa lê ser a mesma regra que vai ser aplicada.
 */
export function proximoPassoDaCorrecao(
  textoColado: string,
  motivo: string,
  atual: Coordenada | null,
): DecisaoDaCorrecao {
  const leitura = lerLocalizacaoColada(textoColado);

  if (leitura.tipo !== "coordenada") {
    return { tipo: "erro", mensagem: mensagemDaLeitura(leitura.tipo) };
  }
  if (atual && atual.lat === leitura.coordenada.lat && atual.lng === leitura.coordenada.lng) {
    return {
      tipo: "erro",
      mensagem: `Esse é o ponto que já está gravado (${coordenadaEmTexto(atual)}). `
        + "Nada a corrigir.",
    };
  }

  const resultado = correcaoDeCoordenadaSchema.safeParse({
    coordenada: leitura.coordenada,
    motivo,
  });
  if (!resultado.success) {
    return {
      tipo: "erro",
      mensagem: resultado.error.issues[0]?.message ?? "Dados inválidos",
    };
  }
  return { tipo: "gravar", correcao: resultado.data };
}

/**
 * A frase de cada leitura que não virou ponto.
 *
 * Cada uma termina no que fazer, e nenhuma diz só "inválido": quem está com o
 * telefone no ombro precisa do próximo passo, não do diagnóstico.
 */
export function mensagemDaLeitura(tipo: string): string {
  if (tipo === "vazio") {
    return "Cole o link do mapa ou a coordenada do ponto certo.";
  }
  if (tipo === "invertida") {
    return "Esse ponto cai fora do Brasil. Latitude e longitude podem estar "
      + "trocadas: confira antes de gravar.";
  }
  if (tipo === "ambigua") {
    return "Esse texto tem mais de uma leitura possível, e o painel não escolhe "
      + "por você. Aponte qual é o ponto.";
  }
  if (tipo === "encurtado") {
    /*
      O painel continua sem abrir link nenhum a partir do navegador. Quem abre
      é o servidor da prefeitura, e só no botão (`componentes/DescobrirPonto`),
      porque abrir o link é o servidor contando ao Google que o ponto foi
      consultado. A frase cita o botão pelo rótulo, que é o que a pessoa vê.
    */
    return "Esse link é encurtado e não carrega a coordenada dentro dele. Use "
      + `"${ROTULO_DO_BOTAO}" para o servidor da prefeitura abrir o link, ou `
      + "abra ele no seu navegador e cole aqui o endereço que aparecer na barra.";
  }
  return "Não reconheci coordenada nisso. Cole o link do mapa, ou o par de "
    + "números com vírgula ou com ponto.";
}

/**
 * O aviso que a tela dá DEPOIS de corrigir, quando um documento já tinha saído.
 *
 * Ele não é enfeite de confirmação. O laudo e o termo são gerados sob demanda e
 * nunca guardados, então a reimpressão vai sair com o ponto novo, diferente do
 * papel que já está dentro do processo. Quem corrigiu precisa saber disso na
 * hora, enquanto ainda pode avisar quem juntou o documento, e não numa
 * audiência.
 */
export function avisoDaCorrecao(
  { anterior, nova, documentoJaEmitido }: {
    anterior: Coordenada | null;
    nova: Coordenada;
    documentoJaEmitido: boolean;
  },
): string {
  const movimento = anterior
    ? `Coordenada corrigida de ${coordenadaEmTexto(anterior)} para `
      + `${coordenadaEmTexto(nova)}.`
    : `Coordenada registrada: ${coordenadaEmTexto(nova)}. Esta ocorrência tinha `
      + "sido aberta sem ponto no mapa.";
  const documento = documentoJaEmitido
    ? " Atenção: um documento oficial desta ocorrência já foi emitido com o "
      + "ponto anterior, e uma nova impressão vai sair com o ponto novo. A "
      + "correção está registrada na trilha, com o motivo."
    : "";
  return `${movimento}${documento}`;
}
