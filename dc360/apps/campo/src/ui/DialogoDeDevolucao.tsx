import { useState } from "react";
import { TextInput, View } from "react-native";
import {
  MOTIVOS_DE_DEVOLUCAO,
  ROTULO_MOTIVO_DE_DEVOLUCAO,
  type MotivoDeDevolucao,
} from "@dc360/shared";

import { Tocavel, Txt, useTema } from "./componentes";
import { Dialogo } from "./Dialogo";
import { borda, espaco, fonte, raio, toque } from "./tokens";

/**
 * A pergunta que precede devolver uma tarefa vencida para a coordenação.
 *
 * TRÊS DECISÕES, e nenhuma é de estilo:
 *
 * 1. **O verbo é "devolver", e nunca "descartar".** A ocorrência não some: ela
 *    volta para quem despacha, com nome, hora e motivo. Quem lê "descartar"
 *    acredita que está limpando lixo, e apertaria o botão achando que resolve o
 *    problema quando está pedindo que outra pessoa assuma.
 * 2. **O diálogo diz o que vai acontecer, em uma frase, antes de qualquer
 *    escolha.** Confirmação que não diz a consequência não é confirmação: é um
 *    obstáculo que a pessoa aprende a atravessar sem ler.
 * 3. **A lista de motivos é fechada, com escape.** Quem está na chuva não
 *    redige: uma tela que exige texto produz "n/a" e "nao deu". E cada motivo
 *    leva a uma ação DIFERENTE da coordenação (endereço errado pede correção de
 *    coordenada, morador ausente pede reagendamento, risco pede apoio de outro
 *    órgão), então um campo de texto só destruiria a informação que decide o
 *    próximo passo. O escape existe porque a realidade não cabe em cinco linhas,
 *    e aí, só aí, o texto é obrigatório: "outro" sozinho não responde nada.
 *
 * É `Dialogo`, e não `Alert.alert`, pela razão escrita naquele arquivo: o
 * alerta nativo ignora o tema (retângulo branco no plantão noturno), ignora a
 * régua de tipografia e usa o alvo de toque do sistema, não os 52 pontos que
 * este aplicativo exige de quem está de luva, na chuva, num barranco.
 */

/** O mesmo piso do contrato e do banco. Não mede redação: recusa o "ok". */
const MINIMO_DA_OBSERVACAO = 10;

export type PedidoDeDevolucao = {
  motivo: MotivoDeDevolucao;
  observacao?: string;
};

export function DialogoDeDevolucao({
  aberto,
  protocolo,
  endereco,
  aoConfirmar,
  aoFechar,
}: {
  aberto: boolean;
  protocolo: string;
  /** Para o agente reconhecer a tarefa sem fechar o diálogo e conferir. */
  endereco: string;
  aoConfirmar: (pedido: PedidoDeDevolucao) => void;
  aoFechar: () => void;
}) {
  const tema = useTema();
  const [motivo, setMotivo] = useState<MotivoDeDevolucao | null>(null);
  const [observacao, setObservacao] = useState("");

  /*
    ABRIR começa em branco, e isso é deliberado.

    O diálogo é um por tela, e não um por tarefa (ver o comentário na fila de
    envio: uma dezena de modais montados por trás da lista o tempo todo). Sem
    esta limpeza, o motivo escolhido para uma tarefa apareceria pré-marcado na
    pergunta sobre OUTRA tarefa, e o agente confirmaria um motivo que ele não
    escolheu para aquele endereço.

    É na ABERTURA, e não no fechamento, por causa da saída animada do
    `Dialogo`: a folha continua na tela por um instante depois de `aberto`
    virar falso. Esquecer o motivo nesse instante fazia o agente ver, enquanto
    a folha desce, o motivo que acabou de confirmar se desmarcar, o aviso
    "escolha um motivo" voltar e o botão apagar.

    E é AJUSTE DE ESTADO DURANTE A RENDERIZAÇÃO, não um efeito: o efeito roda
    depois da pintura, e com a redução de movimento ligada a folha chega
    inteira no primeiro quadro, então haveria um quadro com o motivo da tarefa
    anterior marcado. Ajustar aqui faz o React descartar esta renderização e
    refazer com o estado limpo antes de qualquer pintura.
  */
  const [abertoNaRenderizacaoAnterior, setAbertoNaRenderizacaoAnterior] = useState(aberto);
  if (aberto !== abertoNaRenderizacaoAnterior) {
    setAbertoNaRenderizacaoAnterior(aberto);
    if (aberto) {
      setMotivo(null);
      setObservacao("");
    }
  }

  const precisaEscrever = motivo === "outro";
  const textoCurto = observacao.trim().length < MINIMO_DA_OBSERVACAO;
  const faltaResponder = motivo === null || (precisaEscrever && textoCurto);

  const oQueFalta = motivo === null
    ? "Escolha um motivo para a coordenação saber o que fazer com esta ocorrência."
    : "Com o motivo \"Outro motivo\", escreva em uma linha o que aconteceu.";

  return (
    <Dialogo
      aberto={aberto}
      testID="dialogo-devolucao"
      titulo="Devolver esta tarefa?"
      /*
        A CONSEQUÊNCIA, em uma frase, e ela diz as duas metades: o que o agente
        ganha (a tarefa sai da lista dele) e o que a coordenação recebe (a
        ocorrência de volta, com o nome dele e o motivo). A terceira frase existe
        porque é a dúvida que faz o agente não tocar: não, a vistoria não fica
        registrada como feita, e não, nada é apagado.
      */
      texto={
        `Protocolo ${protocolo}, ${endereco}.\n\n`
        + "Esta tarefa sai da sua lista e a ocorrência volta para a coordenação, "
        + "com o seu nome, a hora e o motivo. Ela não é encerrada e nada é "
        + "apagado: quem decide o que fazer com ela passa a ser quem despacha."
      }
      conteudo={
        <View style={{ gap: espaco.e2 }}>
          <Txt variante="corpoP" negrito>Por que não deu para vistoriar?</Txt>

          {MOTIVOS_DE_DEVOLUCAO.map((opcao) => {
            const marcado = motivo === opcao;
            return (
              /*
                `Tocavel`, e não `Pressable` cru: é o que traz o retorno do
                dedo (`useRespostaAoToque`) com duração e curva de token, na
                camada nativa e respeitando a redução de movimento. Enquanto
                foi `Pressable` com estilo parado, o botão logo abaixo respondia
                com transição e a opção logo acima, não.
              */
              <Tocavel
                key={opcao}
                testID={`motivo-${opcao}`}
                onPress={() => { setMotivo(opcao); }}
                accessibilityRole="radio"
                accessibilityState={{ checked: marcado }}
                accessibilityLabel={ROTULO_MOTIVO_DE_DEVOLUCAO[opcao]}
                estilo={{
                  minHeight: toque,
                  paddingHorizontal: espaco.e3,
                  flexDirection: "row",
                  alignItems: "center",
                  gap: espaco.e3,
                  borderRadius: raio.normal,
                  borderWidth: marcado ? 0 : borda.fio,
                  borderColor: tema.borda,
                  backgroundColor: marcado ? tema.destaque : "transparent",
                }}
              >
                {/*
                  Símbolo além da cor, como no resto do aplicativo: sob sol
                  forte, violeta e transparente são a mesma mancha, e o que se
                  comunica aqui é qual motivo vai para a coordenação.
                */}
                <Txt variante="corpo" negrito cor={marcado ? tema.sobreDestaque : tema.texto}>
                  {marcado ? "◉" : "○"}
                </Txt>
                <View style={{ flex: 1 }}>
                  <Txt
                    variante="corpo"
                    negrito={marcado}
                    cor={marcado ? tema.sobreDestaque : tema.texto}
                  >
                    {ROTULO_MOTIVO_DE_DEVOLUCAO[opcao]}
                  </Txt>
                </View>
              </Tocavel>
            );
          })}

          {precisaEscrever && (
            <View style={{ gap: espaco.e2 }}>
              <Txt variante="corpoP" negrito>O que aconteceu?</Txt>
              <TextInput
                testID="devolucao-observacao"
                value={observacao}
                onChangeText={setObservacao}
                multiline
                placeholder="Uma linha basta"
                placeholderTextColor={tema.textoDiscreto}
                accessibilityLabel="Escreva o que aconteceu, para a coordenação entender o caso"
                style={{
                  minHeight: toque,
                  borderWidth: borda.fio,
                  borderColor: tema.borda,
                  borderRadius: raio.normal,
                  backgroundColor: tema.superficie,
                  color: tema.texto,
                  paddingHorizontal: espaco.e3,
                  paddingVertical: espaco.e2,
                  fontSize: fonte.corpo,
                }}
              />
            </View>
          )}

          {/*
            O que falta, escrito, e não só o botão apagado. Botão desabilitado
            sem explicação é a tela dizendo "não" sem dizer por quê, e quem está
            em pé na chuva toca três vezes antes de desistir.
          */}
          {faltaResponder && (
            <Txt variante="legenda" cor={tema.alertaTexto}>! {oQueFalta}</Txt>
          )}
        </View>
      }
      acao={{
        rotulo: "Devolver para a coordenação",
        desabilitada: faltaResponder,
        aoTocar: () => {
          if (motivo === null) return;
          aoConfirmar({
            motivo,
            /*
              A observação só viaja quando foi escrita. Mandar string vazia
              encheria a coluna do banco de nada e faria a tela da coordenação
              mostrar um campo de observação em branco em toda devolução.
            */
            ...(observacao.trim() ? { observacao: observacao.trim() } : {}),
          });
        },
      }}
      /*
        "Manter comigo" e não "Cancelar": a recusa também diz o que acontece.
        Quem não devolve continua com a tarefa, e é isso que a palavra precisa
        dizer para quem lê com pressa.
      */
      recusa={{ rotulo: "Manter comigo" }}
      aoFechar={aoFechar}
    />
  );
}
