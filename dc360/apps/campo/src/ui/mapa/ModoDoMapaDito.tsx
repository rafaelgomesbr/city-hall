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
 *
 * ## O aviso de chave divergente MORAVA aqui, e saiu em 15/09/2026
 *
 * Ele dizia "a chave de mapa configurada pelo município é diferente da que
 * está nesta versão do aplicativo (...) avise a coordenação para gerar o
 * aplicativo de novo", e comparava a chave que `GET /configuracao` manda com a
 * do binário. Desde que as chaves são por plataforma (commit `b5afd64`: a da
 * API é a do painel, restrita a sites; a do binário é restrita a Apps iOS ou
 * Android) elas SEMPRE diferem, e o aviso disparava em toda instalação certa,
 * mandando a coordenação refazer um aplicativo que estava certo. Ver
 * `decidirModoDoMapa` em `src/dados/mapa.ts`, que deixou de comparar chave:
 * esta legenda fala de para onde a coordenada vai, e chave é assunto do
 * console do Google, não do agente.
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
        `contentDescription` do agrupamento ganhava dos filhos, e o que era só
        filho desenhado não era falado.

        Com `accessible`, os dois lados leem a MESMA frase, e o rótulo abaixo
        passa a ser obrigado a carregar tudo que este bloco diz.
      */
      accessible
      accessibilityRole="summary"
      /*
        O rótulo carrega TUDO que este bloco diz. Um resumo com rótulo próprio
        é lido como uma coisa só: no Android o `contentDescription` do
        agrupamento ganha dos filhos, então qualquer linha desenhada abaixo que
        não estiver aqui não é falada por ninguém. Foi assim que o aviso de
        chave divergente, enquanto existiu, ficou mudo por uma versão inteira.
      */
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
    </View>
  );
}
