import { useEffect, useRef } from "react";
import { ROTULO_SEVERIDADE, ROTULO_TIPO_COBRADE } from "@dc360/shared";
import type { PontoNoMapa } from "../dados/repositorio";
import {
  caminhoDaSeveridade, carregarGoogleMaps, corDoToken, tokenDaSeveridade,
  type ApiDoGoogleMaps, type MapaDoGoogle as InstanciaDoMapa, type MarcadorDoGoogle,
} from "./mapa-de-base";

/**
 * A camada cartográfica do Google, quando o município aceitou pagá-la e
 * aceitou enviar a coordenada.
 *
 * ESTE COMPONENTE NÃO É O CAMINHO PRINCIPAL DA TELA. O caminho principal é o
 * plano esquemático, porque a chave está vazia hoje e porque é ele que o
 * município que recusa o envio vai usar para sempre. Aqui só entra a camada de
 * ruas; a lista embaixo do mapa continua sendo o caminho de teclado e de
 * leitor de tela nos dois modos, e ela não muda uma linha por causa deste
 * arquivo. Quem não enxerga, quem navega por Tab e quem está sem chave leem
 * exatamente a mesma informação.
 *
 * A falha de carregamento não é escondida: ela sobe por `aoFalhar`, a tela
 * diz o que aconteceu e volta ao plano esquemático. Mapa que fica cinza para
 * sempre é a forma mais rápida de o coordenador parar de acreditar na tela.
 */
export function MapaDoGoogle({ chave, pontos, selecionada, aoSelecionar, aoFalhar }: {
  chave: string;
  pontos: readonly PontoNoMapa[];
  selecionada: string | null;
  aoSelecionar: (id: string) => void;
  aoFalhar: (motivo: string) => void;
}) {
  const caixa = useRef<HTMLDivElement | null>(null);
  const mapa = useRef<InstanciaDoMapa | null>(null);
  const marcadores = useRef<MarcadorDoGoogle[]>([]);

  /*
    `aoSelecionar` numa referência, e não na lista de dependências.

    A função é recriada a cada desenho da página. Se ela entrasse nas
    dependências, o efeito derrubaria e recriaria todos os marcadores a cada
    clique, e o clique seguinte cairia num marcador que acabou de deixar de
    existir. O ouvinte precisa enxergar sempre a versão mais nova, e é isso
    que a referência dá.
  */
  const selecionar = useRef(aoSelecionar);
  selecionar.current = aoSelecionar;
  const falhar = useRef(aoFalhar);
  falhar.current = aoFalhar;

  useEffect(() => {
    let vivo = true;

    carregarGoogleMaps(chave)
      .then((api: ApiDoGoogleMaps) => {
        const elemento = caixa.current;
        if (!vivo || !elemento) return;

        mapa.current ??= new api.Map(elemento, {
          // Sem controle de tipo de mapa, sem satélite e sem Street View: cada
          // um deles é outra família de requisição cobrada, e nenhum responde
          // a pergunta desta tela, que é onde a cidade está doendo agora.
          mapTypeControl: false,
          streetViewControl: false,
          fullscreenControl: false,
          zoom: 13,
          center: { lat: pontos[0]?.latitude ?? 0, lng: pontos[0]?.longitude ?? 0 },
        });

        for (const antigo of marcadores.current) antigo.setMap(null);
        marcadores.current = [];

        const limites = new api.LatLngBounds();
        for (const ponto of pontos) {
          const posicao = { lat: ponto.latitude, lng: ponto.longitude };
          limites.extend(posicao);
          const severidade = ponto.severidade
            ? ROTULO_SEVERIDADE[ponto.severidade]
            : "não classificada";
          const marcador = new api.Marker({
            position: posicao,
            map: mapa.current,
            /*
              O `title` é o que aparece ao parar o ponteiro e o que alguns
              leitores anunciam. Ele repete severidade por PALAVRA porque a
              forma e a cor do marcador sozinhas seriam estado comunicado só
              por desenho, que é a regra que este produto não quebra.
            */
            title: `${ponto.protocolo}, ${ROTULO_TIPO_COBRADE[ponto.tipo]}, `
              + `severidade ${severidade}, ${ponto.endereco}`,
            zIndex: ponto.id === selecionada ? 3 : 1,
            icon: {
              path: caminhoDaSeveridade(ponto.severidade),
              fillColor: corDoToken(tokenDaSeveridade(ponto.severidade)),
              fillOpacity: 1,
              strokeColor: corDoToken("--ds-surface"),
              strokeWeight: 2,
              scale: ponto.id === selecionada ? 1.4 : 1,
            },
          });
          marcador.addListener("click", () => selecionar.current(ponto.id));
          marcadores.current.push(marcador);
        }

        if (pontos.length > 0) mapa.current.fitBounds(limites, 48);
      })
      .catch((e: unknown) => {
        if (vivo) falhar.current(e instanceof Error ? e.message : String(e));
      });

    return () => {
      vivo = false;
      for (const marcador of marcadores.current) marcador.setMap(null);
      marcadores.current = [];
    };
  }, [chave, pontos, selecionada]);

  /*
    `aria-hidden` no desenho, e não um `role` de imagem sem descrição.

    Tudo que este bloco mostra está, ponto a ponto, na tabela logo abaixo, com
    protocolo, tipo, endereço e severidade em texto. Anunciar a caixa do
    Google como figura faria o leitor de tela parar num objeto que ele não
    consegue explorar, antes da lista que responde a mesma pergunta.
  */
  return (
    <div ref={caixa} className="mapa__base" aria-hidden="true" />
  );
}
