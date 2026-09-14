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

/**
 * O aviso de chave divergente, escrito UMA vez.
 *
 * Ele aparece desenhado e é DITO no resumo, e as duas saídas precisam ser o
 * mesmo texto. Escrito duas vezes, a segunda envelhece: é o defeito que
 * `EXPLICACAO_DO_MODO` já existe para impedir com os outros quatro textos.
 */
const AVISO_DE_CHAVE_DIVERGENTE =
  "A chave de mapa configurada pelo município é diferente da que está nesta "
  + "versão do aplicativo. O mapa usa a que foi compilada aqui dentro. "
  + "Avise a coordenação para gerar o aplicativo de novo.";

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
      /*
        UM elemento de acessibilidade, e não um agrupamento com um rótulo que
        ninguém usa.

        Sem `accessible`, o `accessibilityLabel` abaixo é decoração no iOS: a
        `View` não é elemento de acessibilidade, o VoiceOver ignora o rótulo
        dela e lê os filhos um a um. E o que está desenhado como filho é só o
        TÍTULO quando `comDetalhe` é falso, que é exatamente o caso do mapa do
        Google autorizado (ver a chamada em `MapaDoImovel`). O resultado é que o
        agente que usa leitor de tela ouvia "Mapa do Google" e nunca a frase que
        vem depois: "a coordenada deste imóvel é enviada ao Google". A legenda
        de modo existe para dizer isso, e para quem ouve ela não estava dizendo.

        No Android acontecia o contrário e pelo mesmo motivo: o
        `contentDescription` do agrupamento ganhava dos filhos, e o aviso de
        chave divergente, que é filho, não era falado.

        Com `accessible`, os dois lados leem a MESMA frase, e o rótulo abaixo
        passa a ser obrigado a carregar tudo que este bloco diz.
      */
      accessible
      accessibilityRole="summary"
      /*
        O rótulo carrega TUDO que este bloco diz, e o aviso de chave divergente
        estava de fora.

        Um resumo com rótulo próprio é lido como uma coisa só: no Android o
        `contentDescription` do agrupamento ganha dos filhos, então a linha da
        chave divergente simplesmente não era falada. Ela é dirigida ao agente
        ("avise a coordenação"), e um agente que usa leitor de tela ficava sendo
        o único que nunca fica sabendo que o mapa está sendo pago na chave
        errada, sem nada quebrado na tela para investigar.
      */
      accessibilityLabel={
        `${explicacao.titulo}. ${explicacao.detalhe}`
        + (decisao.chaveDivergente ? ` ${AVISO_DE_CHAVE_DIVERGENTE}` : "")
      }
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
        <Txt variante="legenda" discreto>{AVISO_DE_CHAVE_DIVERGENTE}</Txt>
      )}
    </View>
  );
}
