import { View } from "react-native";

import type { DecisaoDoMapa, MotivoDoModo } from "../../dados/mapa";
import { EXPLICACAO_DO_MODO } from "../../dados/mapa";
import { Txt, useTema } from "../componentes";
import type { ComponenteDeIcone } from "../icones";
import {
  IconeAlerta, IconeGps, IconeLocalizacao, IconeSemSinal,
} from "../icones";
import { borda, espaco, icone, raio } from "../tokens";

/**
 * A TELA DIZ EM QUE MODO ELA ESTÁ, com ícone e com palavra.
 *
 * O painel aprendeu isto primeiro, em `ModoDoMapaDito`, e a frase que ficou
 * escrita lá vale igual aqui: um mapa sem ruas e sem legenda de modo parece
 * produto quebrado, e produto que parece quebrado é desligado pelo usuário
 * antes de alguém perguntar por quê. Dizer o modo transforma a mesma tela de
 * "faltou alguma coisa" em "o município escolheu isto".
 *
 * No aplicativo há uma segunda razão, que o painel não tem: o modo aqui também
 * responde por uma promessa. `docs/SUBPROCESSADORES.md` seção 2.2 diz ao
 * município, por escrito, que existe um modo em que a coordenada não sai do
 * aparelho. Enquanto a tela disser em qual dos dois está, o agente e o
 * encarregado de dados do município podem conferir a promessa olhando, em vez
 * de acreditar.
 *
 * NUNCA SÓ COR. O ícone mais a palavra, sempre, porque é a regra da casa e
 * porque quem lê esta tela pode estar com o brilho no máximo sob sol, onde
 * duas tonalidades de fundo viram a mesma.
 */

/**
 * O ícone de cada motivo, e a escolha de cada um.
 *
 * `binario-sem-chave` recebe o de ALERTA porque é o único dos quatro que é
 * defeito de quem montou o aplicativo, e não escolha nem circunstância: o
 * município configurou mapa, e a versão instalada não consegue desenhá-lo.
 * Sem essa distinção, um erro de compilação ficaria parecido com uma decisão
 * de privacidade, e ninguém conserta o que parece intencional.
 */
const ICONE_DO_MOTIVO: Record<MotivoDoModo, ComponenteDeIcone> = {
  autorizado: IconeLocalizacao,
  "municipio-nao-autorizou": IconeGps,
  "binario-sem-chave": IconeAlerta,
  "google-recusou": IconeSemSinal,
};

export type PropsDoModo = {
  decisao: DecisaoDoMapa;
  /** O parágrafo inteiro, para onde houver espaço. Fora dele, só o rótulo. */
  comDetalhe?: boolean;
};

export function ModoDoMapaDito({ decisao, comDetalhe = false }: PropsDoModo) {
  const tema = useTema();
  const explicacao = EXPLICACAO_DO_MODO[decisao.motivo];
  const Icone = ICONE_DO_MOTIVO[decisao.motivo];
  /*
    O alerta é o único que muda de cor, e ele muda para a cor semântica de
    alerta e não para a de marca: ver a régua em `regua.ts`. Os outros três
    ficam em tinta discreta, porque legenda de modo é rodapé de mapa e não
    aviso: pintar os quatro faria o único que precisa ser notado deixar de ser.
  */
  const corDoIcone = decisao.motivo === "binario-sem-chave" ? tema.alertaTexto : tema.textoDiscreto;

  return (
    <View
      accessibilityRole="summary"
      accessibilityLabel={`${explicacao.titulo}. ${explicacao.detalhe}`}
      style={{
        gap: espaco.e1,
        padding: espaco.e2,
        borderRadius: raio.normal,
        borderWidth: borda.fio,
        borderColor: tema.borda,
        backgroundColor: tema.superficie,
      }}
    >
      <View style={{ flexDirection: "row", alignItems: "center", gap: espaco.e2 }}>
        <Icone cor={corDoIcone} tamanho={icone.rotulo} />
        <Txt variante="corpoP" negrito>{explicacao.titulo}</Txt>
      </View>
      {comDetalhe && <Txt variante="legenda" discreto>{explicacao.detalhe}</Txt>}
      {/*
        A DIVERGÊNCIA DE CHAVE aparece sempre, mesmo sem detalhe, e é o único
        caso em que a legenda fala de dinheiro.

        Ela quer dizer que alguém trocou `MAPS_KEY` no servidor do município e
        não gerou o aplicativo de novo: o mapa continua desenhando, porque quem
        o SDK nativo usa é a chave que está dentro do binário, e a conta
        continua caindo na chave antiga. Sem esta linha, ninguém descobre nunca,
        porque não há nada quebrado para investigar.
      */}
      {decisao.chaveDivergente && (
        <Txt variante="legenda" discreto>
          A chave de mapa configurada pelo município é diferente da que está
          nesta versão do aplicativo. O mapa usa a que foi compilada aqui dentro.
          Avise a coordenação para gerar o aplicativo de novo.
        </Txt>
      )}
    </View>
  );
}
