import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ROTULO_SEVERIDADE, ROTULO_TIPO_COBRADE } from "@dc360/shared";
import { listarOcorrencias, type LinhaOcorrencia } from "../dados/repositorio";
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
 */
export function Mapa() {
  const sessao = useSessaoObrigatoria();
  const [linhas, setLinhas] = useState<LinhaOcorrencia[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [selecionada, setSelecionada] = useState<string | null>(null);

  useEffect(() => {
    let vivo = true;
    listarOcorrencias(sessao, { status: "ativas" })
      .then((r) => { if (vivo) setLinhas(r); })
      .catch((e: unknown) => { if (vivo) setErro(e instanceof Error ? e.message : String(e)); });
    return () => { vivo = false; };
  }, [sessao]);

  const comCoordenada = useMemo(
    () => linhas?.filter((o) => o.latitude !== null && o.longitude !== null) ?? [],
    [linhas],
  );

  const limites = useMemo(() => {
    if (comCoordenada.length === 0) return null;
    const lats = comCoordenada.map((o) => o.latitude!);
    const lngs = comCoordenada.map((o) => o.longitude!);
    const margem = 0.004;
    return {
      minLat: Math.min(...lats) - margem, maxLat: Math.max(...lats) + margem,
      minLng: Math.min(...lngs) - margem, maxLng: Math.max(...lngs) + margem,
    };
  }, [comCoordenada]);

  if (erro) return <Aviso tom="perigo">Falha ao carregar o mapa: {erro}</Aviso>;
  if (!linhas) return <Carregando />;

  function posicao(o: LinhaOcorrencia): { x: number; y: number } {
    if (!limites) return { x: 50, y: 50 };
    const x = ((o.longitude! - limites.minLng) / (limites.maxLng - limites.minLng)) * 100;
    // Latitude cresce para o norte, e o eixo Y da tela cresce para baixo.
    const y = 100 - ((o.latitude! - limites.minLat) / (limites.maxLat - limites.minLat)) * 100;
    return { x, y };
  }

  const foco = comCoordenada.find((o) => o.id === selecionada) ?? null;

  return (
    <>
      <div className="cabecalho-pagina">
        <div>
          <h1>Mapa da cidade</h1>
          <p>{comCoordenada.length} ocorrência(s) ativa(s) com coordenada registrada, {sessao.municipio}</p>
        </div>
      </div>

      <div className="detalhe">
        <div className="coluna">
          <Cartao>
            {comCoordenada.length === 0 ? (
              <Vazio titulo="Nenhuma ocorrência ativa com coordenada">
                <p>Registre latitude e longitude na abertura para a ocorrência aparecer aqui.</p>
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

                {comCoordenada.map((o) => {
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

            {comCoordenada.length > 0 && (
              <div className="tabela-envolucro" style={{ marginTop: "var(--ds-sp-4)" }}>
                <table className="tabela">
                  <caption className="oculto-visualmente">
                    Mesmas ocorrências do mapa em lista, para alcançar por teclado e para os casos
                    em que dois pontos ficam próximos demais para distinguir na tela
                  </caption>
                  <thead>
                    <tr>
                      <th scope="col">Protocolo</th>
                      <th scope="col">Tipo e endereço</th>
                      <th scope="col">Severidade</th>
                    </tr>
                  </thead>
                  <tbody>
                    {comCoordenada.map((o) => (
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
                    {foco.latitude!.toFixed(4)}, {foco.longitude!.toFixed(4)}
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
