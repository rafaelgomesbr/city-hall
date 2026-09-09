import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ROTULO_SEVERIDADE, ROTULO_TIPO_COBRADE } from "@dc360/shared";
import { pontosDoMapa, type PontoNoMapa, type PontosDoMapa } from "../dados/repositorio";
import { useSessaoObrigatoria } from "../estado/sessao";
import { Aviso, Carregando, Cartao, SeloSeveridade, SeloStatus, Vazio } from "../componentes/comuns";
import { FormaSeveridade } from "../componentes/Icones";

/**
 * Distribuição geográfica das ocorrências ativas.
 *
 * O mapa de base (MapLibre GL JS sobre um provedor de tiles) entra junto com
 * a API, porque tile é custo recorrente e a escolha do provedor é decisão
 * orçamentária, não técnica. Até lá, o que já é real e já responde à pergunta
 * do coordenador está aqui: as coordenadas gravadas, projetadas em escala,
 * com severidade codificada por forma e por texto, nunca só por cor.
 *
 * Esta tela tem um teto de desenho, e ele é DITO em voz alta.
 *
 * Antes ela pedia a lista comum e desenhava o que viesse. A lista sempre foi
 * paginada, e o painel pedia cem por página: numa enxurrada com duzentas
 * ocorrências ativas, o coordenador via cem marcadores, metade da cidade, e
 * nada na tela dizia que faltava metade. Isso não é lentidão, é informação
 * falsa numa tela de decisão operacional. Agora o total vem junto com os
 * pontos, e o cabeçalho, o aviso e o rodapé repetem quantas existem, quantas
 * estão desenhadas e quantas nem coordenada têm.
 */
export function Mapa() {
  const sessao = useSessaoObrigatoria();
  const [dados, setDados] = useState<PontosDoMapa | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [selecionada, setSelecionada] = useState<string | null>(null);
  const [pagina, setPagina] = useState(1);

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
  if (!dados) return <Carregando />;

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
            ) : (
              <div style={{
                position: "relative", width: "100%", aspectRatio: "4 / 3",
                background: "var(--ds-surface-2)", borderRadius: "var(--ds-radius-card)",
                border: "1px solid var(--ds-border)", overflow: "hidden",
              }}>
                <svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true"
                     style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }}>
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
                        color: corDaSeveridade(o.severidade),
                      }}
                    >
                      <FormaSeveridade severidade={o.severidade}
                                       tamanho={o.severidade === "critica" ? 18 : 15} />
                    </button>
                  );
                })}
              </div>
            )}

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
                          <div>{ROTULO_TIPO_COBRADE[o.tipo]}</div>
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
              <p style={{ margin: 0, color: "var(--ds-text-muted)", fontSize: "var(--ds-fs-body-sm)" }}>
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
                  <span className="par__valor">{ROTULO_TIPO_COBRADE[foco.tipo]}</span>
                </div>
                <div className="par">
                  <span className="par__rotulo">Endereço</span>
                  <span className="par__valor">{foco.endereco}</span>
                </div>
                <div className="par">
                  <span className="par__rotulo">Coordenada</span>
                  <span className="par__valor mono">
                    {foco.latitude.toFixed(4)}, {foco.longitude.toFixed(4)}
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
            <p style={{ margin: 0, fontSize: "var(--ds-fs-body-sm)", lineHeight: "var(--ds-lh-body-sm)",
                        color: "var(--ds-text-muted)" }}>
              A camada cartográfica prevista é MapLibre GL JS. Ela depende de um provedor de tiles,
              que é custo recorrente por carregamento, então entra junto com a decisão de provedor,
              não antes dela. As coordenadas mostradas aqui já são as reais do banco.
            </p>
          </Cartao>
        </div>
      </div>
    </>
  );
}

function corDaSeveridade(severidade: string | null): string {
  switch (severidade) {
    case "critica": return "var(--ds-sev-critica-bg)";
    case "alta": return "var(--ds-sev-alta-fg)";
    case "media": return "var(--ds-sev-media-fg)";
    case "baixa": return "var(--ds-sev-baixa-fg)";
    default: return "var(--ds-text-muted)";
  }
}
