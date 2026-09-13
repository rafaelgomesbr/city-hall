import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ROTULO_SEVERIDADE, ROTULO_TIPO_COBRADE, coordenadaEmTexto } from "@dc360/shared";
import { pontosDoMapa, type PontoNoMapa, type PontosDoMapa } from "../dados/repositorio";
import { useSessaoObrigatoria } from "../estado/sessao";
import { useConfiguracaoDoPainel } from "../estado/configuracao";
import {
  Aviso, Carregando, Cartao, SeloSeveridade, SeloStatus, TipoDaOcorrencia, Vazio,
} from "../componentes/comuns";
import { FormaSeveridade } from "../componentes/Icones";
import { MapaDoGoogle } from "./MapaDoGoogle";
import {
  chaveDoGoogleMaps, modoDoMapa, tokenDaSeveridade, type ModoDoMapa,
} from "./mapa-de-base";

/**
 * Distribuição geográfica das ocorrências ativas.
 *
 * Esta tela tem DOIS modos e DOIS tetos, e todos os quatro são ditos em voz
 * alta para quem está olhando.
 *
 * OS DOIS MODOS estão em `mapa-de-base.ts`. Com chave configurada, as ruas vêm
 * do Google e a coordenada de cada ocorrência ativa desenhada sai do país a
 * cada carregamento, que também é cobrado. A chave vem da API, em tempo de
 * execução (`GET /configuracao`), e NÃO do build: o painel é um build só
 * servindo todos os municípios, então a chave assada ali seria a do
 * fornecedor pagando o mapa de todas as prefeituras. Com a chave vazia, que é
 * o padrão, as mesmas coordenadas são
 * projetadas em escala sobre um plano quadriculado desenhado aqui, sem
 * nenhuma requisição ao Google. O segundo modo não é consolo: é o que
 * `docs/SUBPROCESSADORES.md` seção 2.2 prometeu ao município que recusar o
 * envio. Sem a legenda de modo, a mesma tela seria lida como produto
 * quebrado, e produto que parece quebrado é abandonado antes de alguém
 * perguntar por quê.
 *
 * O TETO DE DESENHO, que já existia. Antes esta tela pedia a lista comum e
 * desenhava o que viesse. A lista sempre foi paginada, e o painel pedia cem
 * por página: numa enxurrada com duzentas ocorrências ativas, o coordenador
 * via cem marcadores, metade da cidade, e nada dizia que faltava a outra
 * metade. Isso não é lentidão, é informação falsa numa tela de decisão
 * operacional. O total vem junto com os pontos, e o cabeçalho, o aviso e o
 * rodapé repetem quantas existem, quantas estão desenhadas e quantas nem
 * coordenada têm.
 *
 * O TETO DE PRECISÃO. A coordenada aparece com seis casas, que é o que o
 * laudo e a minuta imprimem. A tela mostrava quatro: onze metros de diferença
 * entre o que o coordenador lê e o que o documento assinado diz, no mesmo
 * ponto, o que é o começo de uma discussão sobre qual dos dois está certo.
 */
export function Mapa() {
  const sessao = useSessaoObrigatoria();
  const [dados, setDados] = useState<PontosDoMapa | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [selecionada, setSelecionada] = useState<string | null>(null);
  const [pagina, setPagina] = useState(1);
  const [falhaDoGoogle, setFalhaDoGoogle] = useState<string | null>(null);
  const { configuracao, pronta: configuracaoPronta } = useConfiguracaoDoPainel(sessao);

  /*
    A chave vem da API, e a variável de build é só a reserva.

    `configuracao.chaveDoMapa` é o que o servidor daquele município respondeu,
    em tempo de execução. Ela ganha da variável de build, que só entra quando a
    primeira chega vazia: o lugar onde isso acontece é o desenvolvimento e a
    demonstração, onde não há API a quem perguntar. Ver `mapa-de-base.ts`.
  */
  const chave = chaveDoGoogleMaps(configuracao?.chaveDoMapa);
  /*
    A falha do Google derruba a tela para o modo esquemático, e não para o
    vazio. A cidade continua na tela com as mesmas coordenadas; o que se perde
    é a camada de ruas. Ficar com uma caixa cinza seria trocar informação
    verdadeira por nada, por causa de uma rede que caiu.
  */
  const modo: ModoDoMapa = falhaDoGoogle ? "esquematico" : modoDoMapa(chave);

  useEffect(() => {
    let vivo = true;
    setDados(null);
    pontosDoMapa(sessao, pagina)
      .then((r) => { if (vivo) setDados(r); })
      .catch((e: unknown) => { if (vivo) setErro(e instanceof Error ? e.message : String(e)); });
    return () => { vivo = false; };
  }, [sessao, pagina]);

  /*
    Leva além do fim volta para a primeira.

    A fila encolhe sozinha durante o dia (encerramento, providência
    respondida). Sem isto, quem estivesse na segunda leva de marcadores leria
    "Nenhuma ocorrência ativa com coordenada" com a cidade cheia, que é a
    mesma mentira que esta tela existe para não contar.
  */
  useEffect(() => {
    if (dados && dados.itens.length === 0 && dados.total > 0 && dados.pagina > 1) {
      setPagina(1);
    }
  }, [dados]);

  const desenhados = useMemo(() => dados?.itens ?? [], [dados]);

  const limites = useMemo(() => {
    if (desenhados.length === 0) return null;
    const lats = desenhados.map((o) => o.latitude);
    const lngs = desenhados.map((o) => o.longitude);
    const margem = 0.004;
    return {
      minLat: Math.min(...lats) - margem, maxLat: Math.max(...lats) + margem,
      minLng: Math.min(...lngs) - margem, maxLng: Math.max(...lngs) + margem,
    };
  }, [desenhados]);

  if (erro) return <Aviso tom="perigo">Falha ao carregar o mapa: {erro}</Aviso>;
  /*
    Espera a configuração antes de desenhar, e não depois.

    Sem a espera, a tela apareceria no plano esquemático, afirmaria em voz alta
    "nenhuma coordenada sai deste navegador" e um instante depois trocaria pelo
    mapa de ruas do Google. A legenda de modo teria dito uma coisa falsa, e é
    justamente por ela que o município sabe se a coordenada das famílias
    vistoriadas está saindo daqui.
  */
  if (!dados || !configuracaoPronta) return <Carregando />;

  function posicao(o: PontoNoMapa): { x: number; y: number } {
    if (!limites) return { x: 50, y: 50 };
    const x = ((o.longitude - limites.minLng) / (limites.maxLng - limites.minLng)) * 100;
    // Latitude cresce para o norte, e o eixo Y da tela cresce para baixo.
    const y = 100 - ((o.latitude - limites.minLat) / (limites.maxLat - limites.minLat)) * 100;
    return { x, y };
  }

  const foco = desenhados.find((o) => o.id === selecionada) ?? null;

  const total = dados.total;
  const paginas = Math.max(1, Math.ceil(total / dados.porPagina));
  const primeiro = total === 0 ? 0 : (dados.pagina - 1) * dados.porPagina + 1;
  const ultimo = primeiro === 0 ? 0 : primeiro + desenhados.length - 1;
  const faltamDesenhar = total - desenhados.length;

  return (
    <>
      <div className="cabecalho-pagina">
        <div>
          <h1>Mapa da cidade</h1>
          <p>
            Desenhando {desenhados.length} de {total} ocorrência(s) ativa(s) com
            coordenada registrada, {sessao.municipio}
          </p>
        </div>
      </div>

      {/*
        Dois recortes, e os dois ditos: o que o teto cortou e o que nunca teve
        coordenada para cortar. O segundo é o mais fácil de esquecer, porque
        essas ocorrências não somem do mapa, elas nunca entraram nele.
      */}
      {faltamDesenhar > 0 && (
        <Aviso tom="alerta">
          O mapa desenha até {dados.porPagina} marcadores por vez, e existem {total} ocorrências
          ativas com coordenada. Esta é a página {dados.pagina} de {paginas}: {faltamDesenhar} não
          estão neste desenho. As mais graves vêm primeiro.
        </Aviso>
      )}
      {dados.semCoordenada > 0 && (
        <Aviso tom="info">
          Mais {dados.semCoordenada} ocorrência(s) ativa(s) estão sem coordenada registrada e não
          aparecem em desenho nenhum. Elas continuam na lista de ocorrências.
        </Aviso>
      )}
      {falhaDoGoogle && (
        <Aviso tom="alerta">
          O mapa do Google não carregou, e o painel voltou ao plano esquemático com as mesmas
          ocorrências. Motivo relatado pelo navegador: {falhaDoGoogle}
        </Aviso>
      )}

      <div className="detalhe">
        <div className="coluna">
          <Cartao>
            {desenhados.length === 0 ? (
              <Vazio titulo="Nenhuma ocorrência ativa com coordenada">
                <p>
                  Na abertura, cole no campo de localização o link do mapa que o
                  solicitante mandou: a ocorrência aparece aqui em seguida.
                </p>
              </Vazio>
            ) : modo === "google" ? (
              <MapaDoGoogle
                chave={chave}
                pontos={desenhados}
                selecionada={selecionada}
                aoSelecionar={setSelecionada}
                aoFalhar={setFalhaDoGoogle}
              />
            ) : (
              <div className="mapa__plano">
                <svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true"
                     className="mapa__grade">
                  {[20, 40, 60, 80].map((v) => (
                    <g key={v} stroke="var(--ds-border)" strokeWidth="0.2">
                      <line x1={v} y1="0" x2={v} y2="100" />
                      <line x1="0" y1={v} x2="100" y2={v} />
                    </g>
                  ))}
                </svg>

                {desenhados.map((o) => {
                  const { x, y } = posicao(o);
                  return (
                    <button
                      key={o.id}
                      type="button"
                      onClick={() => setSelecionada(o.id)}
                      aria-label={`${o.protocolo}, ${ROTULO_TIPO_COBRADE[o.tipo]}, severidade ${
                        o.severidade ? ROTULO_SEVERIDADE[o.severidade] : "não classificada"
                      }, ${o.endereco}`}
                      aria-pressed={selecionada === o.id}
                      className={`mapa__pino${selecionada === o.id ? " mapa__pino--ativo" : ""}`}
                      style={{
                        position: "absolute",
                        left: `${x}%`, top: `${y}%`,
                        zIndex: selecionada === o.id ? 3 : 1,
                        color: `var(${tokenDaSeveridade(o.severidade)})`,
                      }}
                    >
                      <FormaSeveridade severidade={o.severidade}
                                       tamanho={o.severidade === "critica" ? 18 : 15} />
                    </button>
                  );
                })}
              </div>
            )}

            <ModoDoMapaDito modo={modo} />

            {desenhados.length > 0 && (
              <div className="tabela-envolucro" style={{ marginTop: "var(--ds-sp-4)" }}>
                <table className="tabela">
                  <caption className="oculto-visualmente">
                    As {desenhados.length} ocorrências desenhadas neste mapa, de {total} ativas com
                    coordenada, em lista, para alcançar por teclado e para os casos em que dois
                    pontos ficam próximos demais para distinguir na tela
                  </caption>
                  <thead>
                    <tr>
                      <th scope="col">Protocolo</th>
                      <th scope="col">Tipo e endereço</th>
                      <th scope="col">Severidade</th>
                    </tr>
                  </thead>
                  <tbody>
                    {desenhados.map((o) => (
                      <tr key={o.id}
                          style={selecionada === o.id
                            ? { background: "var(--ds-surface-2)" }
                            : undefined}>
                        <td>
                          <button type="button" className="tabela__protocolo"
                                  style={{ background: "none", border: "none", padding: 0,
                                           cursor: "pointer", font: "inherit",
                                           fontFamily: "var(--ds-font-mono)", fontWeight: 600 }}
                                  onClick={() => setSelecionada(o.id)}>
                            {o.protocolo}
                          </button>
                        </td>
                        <td>
                          <div><TipoDaOcorrencia tipo={o.tipo} /></div>
                          <div className="tabela__secundario">{o.endereco}</div>
                        </td>
                        <td><SeloSeveridade severidade={o.severidade} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {paginas > 1 && (
              <div className="paginacao">
                {/*
                  O rodapé repete o recorte em números, ao lado dos botões que
                  o mudam. O aviso do topo diz que falta gente no desenho; aqui
                  fica dito QUAL pedaço está na tela, que é o que o coordenador
                  precisa para não olhar a mesma metade duas vezes.
                */}
                <span aria-live="polite">
                  Marcadores {primeiro} a {ultimo} de {total}, página {dados.pagina} de {paginas}
                </span>
                <div className="paginacao__controles">
                  <button type="button" className="botao botao--secundario"
                          disabled={dados.pagina === 1}
                          onClick={() => { setSelecionada(null); setPagina(dados.pagina - 1); }}>
                    Anterior
                  </button>
                  <button type="button" className="botao botao--secundario"
                          disabled={dados.pagina >= paginas}
                          onClick={() => { setSelecionada(null); setPagina(dados.pagina + 1); }}>
                    Próxima
                  </button>
                </div>
              </div>
            )}

            <ul className="legenda-mapa">
              {(["critica", "alta", "media", "baixa"] as const).map((sev) => (
                <li key={sev} className={`legenda-mapa__item selo selo--${sev}`}>
                  <FormaSeveridade severidade={sev} tamanho={14} />
                  {ROTULO_SEVERIDADE[sev]}
                </li>
              ))}
            </ul>
          </Cartao>
        </div>

        <div className="coluna">
          <Cartao titulo={foco ? "Ocorrência selecionada" : "Selecione um ponto"}>
            {!foco ? (
              <p className="texto-apoio">
                Clique em um marcador para ver o protocolo, o endereço e abrir o detalhe.
              </p>
            ) : (
              <>
                <div className="par">
                  <span className="par__rotulo">Protocolo</span>
                  <span className="par__valor mono">{foco.protocolo}</span>
                </div>
                <div className="par">
                  <span className="par__rotulo">Tipo</span>
                  <span className="par__valor"><TipoDaOcorrencia tipo={foco.tipo} /></span>
                </div>
                <div className="par">
                  <span className="par__rotulo">Endereço</span>
                  <span className="par__valor">{foco.endereco}</span>
                </div>
                <div className="par">
                  <span className="par__rotulo">Coordenada</span>
                  <span className="par__valor mono">
                    {coordenadaEmTexto({ lat: foco.latitude, lng: foco.longitude })}
                  </span>
                </div>
                <div style={{ display: "flex", gap: "var(--ds-sp-2)", marginBottom: "var(--ds-sp-4)" }}>
                  <SeloSeveridade severidade={foco.severidade} />
                  <SeloStatus status={foco.status} />
                </div>
                <Link className="botao botao--primario" to={`/ocorrencias/${foco.id}`} style={{ width: "100%" }}>
                  Abrir ocorrência
                </Link>
              </>
            )}
          </Cartao>

          <Cartao titulo="Sobre o mapa de base">
            <p className="texto-apoio">
              O painel desenha as ocorrências de dois jeitos, e a diferença é quem recebe a
              coordenada. Com a chave do Google configurada no servidor deste município (a chave
              vem da API em tempo de execução, e não do build, para cada prefeitura pagar o mapa
              dela), as ruas vêm do Google e a coordenada
              de cada ocorrência desenhada é enviada aos Estados Unidos a cada carregamento desta
              tela, que também é cobrado por unidade. Sem chave, as mesmas coordenadas são
              projetadas em escala sobre o plano quadriculado, sem nenhum contato com o Google.
            </p>
            <p className="texto-apoio">
              Nos dois modos, o painel nunca pergunta ao Google o endereço de um ponto nem o ponto
              de um endereço: a coordenada já veio do aparelho do agente ou do link que o
              solicitante mandou. A escolha do modo está descrita em docs/SUBPROCESSADORES.md,
              seção 2.2, para o município decidir antes de assinar.
            </p>
          </Cartao>
        </div>
      </div>
    </>
  );
}

/**
 * A legenda de modo, que é a única parte desta tela que não fala de ocorrência.
 *
 * Fica colada embaixo do desenho, e não escondida num cartão lateral, porque
 * a pergunta que ela responde ("por que este mapa não tem rua?") nasce na
 * hora em que a pessoa olha o desenho. Ícone mais texto, nunca só cor: o modo
 * é informação de estado como qualquer outra.
 */
export function ModoDoMapaDito({ modo }: { modo: ModoDoMapa }) {
  if (modo === "google") {
    return (
      <p className="mapa__modo">
        <span aria-hidden="true">!</span>{" "}
        <strong>Mapa do Google.</strong> A coordenada de cada ocorrência desenhada é enviada ao
        Google a cada carregamento desta tela, e cada carregamento é cobrado. Para desenhar sem
        nenhum contato com o Google, deixe MAPS_KEY vazia no servidor deste município.
      </p>
    );
  }
  return (
    <p className="mapa__modo">
      <span aria-hidden="true">✓</span>{" "}
      <strong>Plano esquemático, sem chave do Google.</strong> As coordenadas são reais e estão em
      escala entre si, mas não há camada de ruas: nenhuma coordenada de ocorrência sai deste
      navegador. Para ver as ruas, o município precisa configurar MAPS_KEY no servidor dele e
      aceitar o envio descrito em docs/SUBPROCESSADORES.md, seção 2.2.
    </p>
  );
}
