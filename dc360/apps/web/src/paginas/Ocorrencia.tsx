import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  PRAZO_PADRAO_HORAS, ROTULO_CANAL, ROTULO_CHECKLIST, ROTULO_PAPEL, ROTULO_SEVERIDADE,
  ROTULO_TIPO_COBRADE, SEVERIDADES, podeExecutar,
  DESFECHOS_PROVIDENCIA, ROTULO_DESFECHO, respostaProvidenciaSchema,
  type DesfechoProvidencia,
  despachoSchema, encerramentoSchema, providenciaSchema, triagemSchema,
  type Severidade,
} from "@dc360/shared";
import {
  buscarOcorrencia, classificarNaTriagem, despacharEquipe, encaminharProvidencia,
  encerrarOcorrencia, listarEquipes, providenciasDaOcorrencia, trilhaDaOcorrencia,
  vistoriaDaOcorrencia, abrirDocumento, listarEvidencias, responderProvidencia,
  vinculosDaOcorrencia, MODO,
  type LinhaEquipe, type LinhaEvento, type LinhaEvidencia, type LinhaOcorrencia,
  type LinhaProvidencia, type LinhaVistoria, type VinculoOcorrencia,
} from "../dados/repositorio";
import { useSessaoObrigatoria } from "../estado/sessao";
import {
  Aviso, Carregando, Cartao, ErroCampo, Prazo, SeloSeveridade, SeloStatus, formatarDataHora,
} from "../componentes/comuns";
import { IconeDocumento, IconeEvento, IconeVoltar } from "../componentes/Icones";

const ORGAOS = [
  "Secretaria de Obras",
  "Secretaria de Assistência Social",
  "Secretaria de Saúde",
  "Companhia de Energia",
  "Companhia de Saneamento",
  "Corpo de Bombeiros Militar",
];

type Conjunto = {
  ocorrencia: LinhaOcorrencia;
  trilha: LinhaEvento[];
  vistoria: LinhaVistoria | null;
  providencias: LinhaProvidencia[];
  equipes: LinhaEquipe[];
  evidencias: LinhaEvidencia[];
  vinculadaA: VinculoOcorrencia | null;
  vinculadas: VinculoOcorrencia[];
};

/**
 * Detalhe da ocorrência: onde o fluxo acontece de verdade.
 *
 * Cada ação aqui é uma transição de estado validada pelo pacote
 * compartilhado, gravada no banco e registrada na trilha auditável com autor,
 * papel e origem. Não existe caminho para mudar um status sem deixar rastro:
 * a trilha não tem policy de UPDATE nem de DELETE, então nem a aplicação
 * consegue reescrever o que já passou.
 */
export function Ocorrencia() {
  const sessao = useSessaoObrigatoria();
  const { id = "" } = useParams();
  const navegar = useNavigate();
  const [dados, setDados] = useState<Conjunto | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  const recarregar = useCallback(async () => {
    const [ocorrencia, trilha, vistoria, providencias, equipes, evidencias, vinculos] =
      await Promise.all([
      buscarOcorrencia(sessao, id),
      trilhaDaOcorrencia(sessao, id),
      vistoriaDaOcorrencia(sessao, id),
      providenciasDaOcorrencia(sessao, id),
      listarEquipes(sessao),
      listarEvidencias(sessao, id),
      vinculosDaOcorrencia(sessao, id),
    ]);
    if (!ocorrencia) throw new Error("Ocorrência não encontrada nesta organização");
    setDados({
      ocorrencia, trilha, vistoria, providencias, equipes, evidencias,
      vinculadaA: vinculos.vinculadaA as VinculoOcorrencia | null,
      vinculadas: vinculos.vinculadas as VinculoOcorrencia[],
    });
  }, [sessao, id]);

  useEffect(() => {
    setDados(null);
    recarregar().catch((e: unknown) => setErro(e instanceof Error ? e.message : String(e)));
  }, [recarregar]);

  /**
   * Uma escrita por vez.
   *
   * O `disabled` nos botões abaixo é conforto; esta trava é o controle. Numa
   * conexão de prefeitura o segundo clique chega antes de a primeira resposta
   * voltar, e o resultado era duas providências para o mesmo órgão, ou dois
   * eventos de encerramento numa trilha que não tem como ser corrigida.
   *
   * Repare na ironia que isto conserta: o botão de LER documento já recusava
   * clique concorrente. Os cinco de GRAVAR, não.
   */
  const [gravando, setGravando] = useState(false);

  async function executar(acao: () => Promise<void>, mensagem: string) {
    if (gravando) return;
    setGravando(true);
    setErro(null);
    try {
      await acao();
      await recarregar();
      setAviso(mensagem);
    } catch (e: unknown) {
      setErro(e instanceof Error ? e.message : String(e));
    } finally {
      setGravando(false);
    }
  }

  if (erro && !dados) return <Aviso tom="perigo">{erro}</Aviso>;
  if (!dados) return <Carregando />;

  const {
    ocorrencia: o, trilha, vistoria, providencias, equipes, evidencias,
    vinculadaA, vinculadas,
  } = dados;
  // Mesma tabela que o repositório usa para recusar a escrita. A tela decide
  // o que desenhar; quem impede de verdade é a camada de dados.
  const podeTriagem = podeExecutar(sessao.papel, "classificar_triagem");
  const podeDespachar = podeExecutar(sessao.papel, "despachar_equipe");
  const podeProvidencia = podeExecutar(sessao.papel, "encaminhar_providencia");
  const podeEncerrar = podeExecutar(sessao.papel, "encerrar_ocorrencia");
  const podeDocumento = podeExecutar(sessao.papel, "emitir_documento");
  const podeResponder = podeExecutar(sessao.papel, "responder_providencia");
  const encerrada = o.status === "encerrada";

  return (
    <>
      <div className="cabecalho-pagina">
        <div>
          <button type="button" className="botao botao--discreto" onClick={() => navegar(-1)}
                  style={{ marginBottom: "var(--ds-sp-2)" }}>
            <IconeVoltar /> Voltar
          </button>
          <h1>
            <span className="mono">{o.protocolo}</span>
          </h1>
          <p>{ROTULO_TIPO_COBRADE[o.tipo]} em {o.endereco}</p>
        </div>
        <div className="cabecalho-pagina__acoes">
          <SeloSeveridade severidade={o.severidade} />
          <SeloStatus status={o.status} />
        </div>
      </div>

      {erro && <Aviso tom="perigo">{erro}</Aviso>}
      {aviso && <Aviso tom="sucesso">{aviso}</Aviso>}
      {(vinculadaA || vinculadas.length > 0) && (
        <Aviso tom="info">
          {vinculadaA ? (
            <>
              Este chamado foi registrado como continuação de{" "}
              <Link to={`/ocorrencias/${vinculadaA.id}`} className="mono">
                {vinculadaA.protocolo}
              </Link>
              , em {vinculadaA.endereco}.
            </>
          ) : (
            <>
              {vinculadas.length === 1 ? "Há outro chamado" : `Há ${vinculadas.length} chamados`}
              {" "}sobre o mesmo evento:{" "}
              {vinculadas.map((v, i) => (
                <span key={v.id}>
                  {i > 0 && ", "}
                  <Link to={`/ocorrencias/${v.id}`} className="mono">{v.protocolo}</Link>
                </span>
              ))}
              . Encerrar este não encerra os outros.
            </>
          )}
        </Aviso>
      )}

      {o.vulnerabilidade_presente && (
        <Aviso tom="alerta">
          <strong>Vulnerabilidade social registrada.</strong> {o.vulnerabilidade_descricao}
        </Aviso>
      )}

      <div className="detalhe">
        <div className="coluna">
          <Cartao titulo="Dados do chamado">
            <div className="linha-campos">
              <div className="par">
                <span className="par__rotulo">Solicitante</span>
                <span className="par__valor">{o.solicitante_nome}</span>
              </div>
              <div className="par">
                <span className="par__rotulo">Contato</span>
                <span className="par__valor">{o.solicitante_contato ?? "Não informado"}</span>
              </div>
              <div className="par">
                <span className="par__rotulo">Canal de entrada</span>
                <span className="par__valor">
                  {ROTULO_CANAL[o.canal_entrada as keyof typeof ROTULO_CANAL] ?? o.canal_entrada}
                </span>
              </div>
              <div className="par">
                <span className="par__rotulo">Aberta em</span>
                <span className="par__valor">{formatarDataHora(o.criado_em)}</span>
              </div>
              <div className="par">
                <span className="par__rotulo">Equipe designada</span>
                <span className="par__valor">{o.equipe_nome ?? "Ainda não despachada"}</span>
              </div>
              <div className="par">
                <span className="par__rotulo">Coordenada</span>
                <span className="par__valor mono">
                  {o.latitude !== null && o.longitude !== null
                    ? `${o.latitude.toFixed(4)}, ${o.longitude.toFixed(4)}`
                    : "Não informada"}
                </span>
              </div>
            </div>
            <div className="par" style={{ marginBottom: 0 }}>
              <span className="par__rotulo">Relato</span>
              <span className="par__valor">{o.descricao}</span>
            </div>
          </Cartao>

          {podeTriagem && !encerrada && o.status === "registrada" && (
            <BlocoTriagem
              gravando={gravando}
              onEnviar={(t) => executar(
                () => classificarNaTriagem(sessao, o.id, t),
                "Triagem registrada. O prazo de atendimento foi calculado pela severidade.",
              )}
            />
          )}

          {podeDespachar && !encerrada && o.status === "triagem" && (
            <BlocoDespacho
              gravando={gravando}
              equipes={equipes.filter((e) => e.ativa)}
              severidade={o.severidade}
              onEnviar={(d) => executar(
                () => despacharEquipe(sessao, o.id, d),
                "Equipe despachada. A ocorrência aparece agora no aplicativo de campo.",
              )}
            />
          )}

          {/*
            Redespachar já era possível no servidor e não existia na tela.
            Acontece na rua: a equipe designada trava noutro atendimento, o
            prazo se mostra curto demais, o caso muda de mão. A saída era
            encerrar e reabrir, o que inventa um protocolo novo para o mesmo
            evento. A troca entra como evento novo na trilha, então quem
            despachou antes continua registrado.
          */}
          {podeDespachar && !encerrada && o.status === "em_campo" && (
            <BlocoDespacho
              gravando={gravando}
              titulo="Trocar equipe ou prazo"
              equipes={equipes.filter((e) => e.ativa)}
              severidade={o.severidade}
              equipeAtual={o.equipe_id}
              onEnviar={(d) => executar(
                () => despacharEquipe(sessao, o.id, d),
                "Despacho atualizado. A troca ficou registrada na trilha.",
              )}
            />
          )}

          {podeProvidencia && !encerrada && o.status === "vistoria_concluida" && (
            <BlocoProvidencia
              gravando={gravando}
              onEnviar={(p) => executar(
                () => encaminharProvidencia(sessao, o.id, p),
                "Providência encaminhada e registrada na trilha.",
              )}
            />
          )}

          {vistoria && (
            <Cartao titulo="Vistoria de campo">
              <div className="linha-campos">
                <div className="par">
                  <span className="par__rotulo">Coletada em campo</span>
                  <span className="par__valor">{formatarDataHora(vistoria.coletada_em)}</span>
                </div>
                <div className="par">
                  <span className="par__rotulo">Sincronizada no servidor</span>
                  <span className="par__valor">{formatarDataHora(vistoria.sincronizada_em)}</span>
                </div>
                <div className="par">
                  <span className="par__rotulo">Agente responsável</span>
                  <span className="par__valor">{vistoria.agente_nome ?? "Não identificado"}</span>
                </div>
                <div className="par">
                  <span className="par__rotulo">Precisão do GPS</span>
                  <span className="par__valor mono">
                    {vistoria.gps_precisao_metros !== null ? `${vistoria.gps_precisao_metros} m` : "Não registrada"}
                  </span>
                </div>
              </div>

              <div className="par">
                <span className="par__rotulo">Checklist respondido</span>
                <ul style={{ margin: 0, paddingLeft: "var(--ds-sp-5)", fontSize: "var(--ds-fs-body-sm)" }}>
                  {vistoria.checklist.map((item) => (
                    <li key={item.chave}>
                      {ROTULO_CHECKLIST[item.chave] ?? item.chave}: <strong>{item.resposta ? "Sim" : "Não"}</strong>
                    </li>
                  ))}
                </ul>
              </div>

              {vistoria.observacoes && (
                <div className="par" style={{ marginBottom: 0 }}>
                  <span className="par__rotulo">Observações do agente</span>
                  <span className="par__valor">{vistoria.observacoes}</span>
                </div>
              )}
            </Cartao>
          )}

          {vistoria && <CartaoEvidencias fotos={evidencias} />}

          {providencias.length > 0 && (
            <Cartao titulo="Providências encaminhadas">
              <div className="tabela-envolucro">
                <table className="tabela">
                  <thead>
                    <tr>
                      <th scope="col">Órgão de destino</th>
                      <th scope="col">Responsável</th>
                      <th scope="col">Encaminhada em</th>
                      <th scope="col">Situação</th>
                    </tr>
                  </thead>
                  <tbody>
                    {providencias.map((p) => (
                      <tr key={p.id}>
                        <td>
                          <div className="tabela__principal">{p.orgao_destino}</div>
                          <div className="tabela__secundario">{p.descricao}</div>
                          {p.resposta && (
                            <div className="trilha__detalhe" style={{ marginTop: "var(--ds-sp-2)" }}>
                              <strong>Resposta:</strong> {p.resposta}
                              <br />
                              <span className="tabela__secundario">
                                por {p.respondida_por} em{" "}
                                {p.respondida_em ? formatarDataHora(p.respondida_em) : ""}
                              </span>
                            </div>
                          )}
                        </td>
                        <td>{p.responsavel}</td>
                        <td>{formatarDataHora(p.encaminhada_em)}</td>
                        <td>
                          {p.desfecho ? (
                            <span className={`selo selo--${p.desfecho === "recusada" ? "perigo" : "sucesso"}`}>
                              {ROTULO_DESFECHO[p.desfecho as DesfechoProvidencia] ?? p.desfecho}
                            </span>
                          ) : (
                            <Prazo prazoEm={p.prazo_em} criadoEm={p.encaminhada_em}
                                   encerrada={false} />
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {podeResponder && providencias.some((p) => !p.respondida_em) && (
                <BlocoRespostaProvidencia
              gravando={gravando}
                  abertas={providencias.filter((p) => !p.respondida_em)}
                  onEnviar={(providenciaId, r) => executar(
                    () => responderProvidencia(sessao, o.id, providenciaId, r),
                    "Resposta do órgão registrada.",
                  )}
                />
              )}
            </Cartao>
          )}

          {podeEncerrar && !encerrada && (
            <BlocoEncerramento
              gravando={gravando}
              onEnviar={(e) => executar(
                () => encerrarOcorrencia(sessao, o.id, e),
                "Ocorrência encerrada com motivo registrado.",
              )}
            />
          )}

          {encerrada && (
            <Cartao titulo="Encerramento">
              <div className="par">
                <span className="par__rotulo">Encerrada em</span>
                <span className="par__valor">
                  {o.encerrado_em ? formatarDataHora(o.encerrado_em) : "Sem data"}
                </span>
              </div>
              <div className="par" style={{ marginBottom: 0 }}>
                <span className="par__rotulo">Motivo</span>
                <span className="par__valor">{o.motivo_encerramento}</span>
              </div>
            </Cartao>
          )}
        </div>

        <div className="coluna">
          <Cartao titulo="Linha do tempo auditável">
            <ol className="trilha">
              {trilha.map((e) => (
                <li className="trilha__item" key={e.id}>
                  <span className="trilha__marca" aria-hidden="true">
                    <IconeEvento tipo={e.tipo} />
                  </span>
                  <div className="trilha__titulo">{rotuloEvento(e.tipo)}</div>
                  <div className="trilha__autoria">
                    {formatarDataHora(e.ocorrido_em)} por {e.autor_nome} ({ROTULO_PAPEL[e.autor_papel]}),
                    {e.origem === "campo" ? " em campo" : " no escritório"}
                  </div>
                  {e.detalhe && Object.keys(e.detalhe).length > 0 && (
                    <div className="trilha__detalhe">{descreverDetalhe(e.detalhe)}</div>
                  )}
                </li>
              ))}
            </ol>
          </Cartao>

          <Cartao titulo="Prazo de atendimento">
            <Prazo prazoEm={o.prazo_em} criadoEm={o.criado_em} encerrada={encerrada} />
            <p style={{
              marginTop: "var(--ds-sp-3)", marginBottom: 0,
              fontSize: "var(--ds-fs-caption)", lineHeight: "var(--ds-lh-caption)",
              color: "var(--ds-text-muted)",
            }}>
              O prazo vem da severidade definida na triagem: crítica em 4 horas, alta em 24,
              média em 48 e baixa em 72.
            </p>
          </Cartao>

          {vistoria && podeDocumento && <CartaoDocumentos ocorrenciaId={o.id} />}

          <Cartao titulo="Ver também">
            <Link className="botao botao--secundario" to="/ocorrencias" style={{ width: "100%" }}>
              Voltar para a lista
            </Link>
          </Cartao>
        </div>
      </div>
    </>
  );
}

function rotuloEvento(tipo: string): string {
  const mapa: Record<string, string> = {
    registro: "Chamado registrado",
    triagem: "Classificado na triagem",
    despacho: "Equipe despachada",
    vistoria: "Vistoria concluída em campo",
    providencia: "Providência encaminhada",
    encerramento: "Ocorrência encerrada",
  };
  return mapa[tipo] ?? tipo;
}

function descreverDetalhe(detalhe: Record<string, unknown>): string {
  return Object.entries(detalhe)
    .filter(([, v]) => v !== null && v !== undefined && v !== "")
    .map(([k, v]) => `${k}: ${String(v)}`)
    .join(" · ");
}

// ---------------------------------------------------------------------------
// Blocos de ação
// ---------------------------------------------------------------------------

function BlocoTriagem({ onEnviar, gravando }: { onEnviar: (t: { severidade: Severidade; vulnerabilidadePresente: boolean; vulnerabilidadeDescricao?: string }) => void; gravando: boolean }) {
  const [severidade, setSeveridade] = useState<Severidade>("media");
  const [vulneravel, setVulneravel] = useState(false);
  const [descricao, setDescricao] = useState("");
  const [erro, setErro] = useState<string | null>(null);

  function enviar(evento: React.FormEvent) {
    evento.preventDefault();
    const resultado = triagemSchema.safeParse({
      severidade,
      vulnerabilidadePresente: vulneravel,
      vulnerabilidadeDescricao: descricao.trim() || undefined,
    });
    if (!resultado.success) {
      setErro(resultado.error.issues[0]?.message ?? "Dados inválidos");
      return;
    }
    setErro(null);
    onEnviar(resultado.data);
  }

  return (
    <Cartao titulo="Classificar na triagem">
      <form onSubmit={enviar}>
        <div className="campo">
          <label htmlFor="triagem-severidade">Severidade</label>
          <select id="triagem-severidade" value={severidade}
                  onChange={(e) => setSeveridade(e.target.value as Severidade)}>
            {SEVERIDADES.map((s) => (
              <option key={s} value={s}>
                {ROTULO_SEVERIDADE[s]} (prazo de {PRAZO_PADRAO_HORAS[s]} horas)
              </option>
            ))}
          </select>
          <span className="campo__dica">A severidade define o prazo de atendimento, não o contrário.</span>
        </div>

        <label className="caixa-marcacao">
          <input type="checkbox" checked={vulneravel} onChange={(e) => setVulneravel(e.target.checked)} />
          <span>
            Há vulnerabilidade social envolvida
            <br />
            <span className="campo__dica">Idoso, criança, pessoa com deficiência ou pessoa acamada no local.</span>
          </span>
        </label>

        {vulneravel && (
          <div className="campo">
            <label htmlFor="triagem-vuln">Descreva a vulnerabilidade</label>
            <textarea id="triagem-vuln" value={descricao} onChange={(e) => setDescricao(e.target.value)}
                      aria-invalid={!!erro}
                      aria-describedby={erro ? "triagem-erro" : undefined} />
          </div>
        )}

        {erro && <ErroCampo id="triagem-erro">{erro}</ErroCampo>}
        <button type="submit" className="botao botao--primario" disabled={gravando}>
          {gravando ? "Registrando" : "Registrar triagem"}
        </button>
      </form>
    </Cartao>
  );
}

function BlocoDespacho({ equipes, severidade, onEnviar, titulo, equipeAtual, gravando }: {
  equipes: LinhaEquipe[];
  severidade: Severidade | null;
  onEnviar: (d: { equipeId: string; prazoHoras: number; instrucoes?: string }) => void;
  gravando: boolean;
  /** "Despachar equipe" na primeira vez, "Trocar equipe ou prazo" depois. */
  titulo?: string;
  /** Já despachada: o seletor começa em quem está com o caso hoje. */
  equipeAtual?: string | null;
}) {
  const rotulo = titulo ?? "Despachar equipe";
  const [equipeId, setEquipeId] = useState(equipeAtual ?? equipes[0]?.id ?? "");
  const [prazo, setPrazo] = useState(severidade ? PRAZO_PADRAO_HORAS[severidade] : 24);
  const [instrucoes, setInstrucoes] = useState("");
  const [erro, setErro] = useState<string | null>(null);

  function enviar(evento: React.FormEvent) {
    evento.preventDefault();
    const resultado = despachoSchema.safeParse({
      equipeId, prazoHoras: Number(prazo), instrucoes: instrucoes.trim() || undefined,
    });
    if (!resultado.success) {
      setErro(resultado.error.issues[0]?.message ?? "Dados inválidos");
      return;
    }
    setErro(null);
    onEnviar(resultado.data);
  }

  if (equipes.length === 0) {
    return (
      <Cartao titulo={rotulo}>
        <Aviso tom="alerta">
          Nenhuma equipe ativa cadastrada. Cadastre uma em <Link to="/equipes">Equipes</Link> para
          poder despachar.
        </Aviso>
      </Cartao>
    );
  }

  return (
    <Cartao titulo={rotulo}>
      <form onSubmit={enviar}>
        <div className="linha-campos">
          <div className="campo">
            <label htmlFor="despacho-equipe">Equipe</label>
            <select id="despacho-equipe" value={equipeId} onChange={(e) => setEquipeId(e.target.value)}>
              {equipes.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.nome} ({e.em_atendimento} em atendimento)
                </option>
              ))}
            </select>
          </div>
          <div className="campo">
            <label htmlFor="despacho-prazo">Prazo em horas</label>
            <input id="despacho-prazo" type="number" min={1} max={720} value={prazo}
                   onChange={(e) => setPrazo(Number(e.target.value))} />
          </div>
        </div>

        <div className="campo">
          <label htmlFor="despacho-instrucoes">Instruções para a equipe (opcional)</label>
          <textarea id="despacho-instrucoes" value={instrucoes}
                    onChange={(e) => setInstrucoes(e.target.value)}
                    placeholder="Acesso pela lateral do lote, cuidado com fiação exposta" />
        </div>

        {erro && <ErroCampo id="despacho-erro">{erro}</ErroCampo>}
        <button type="submit" className="botao botao--primario" disabled={gravando}>
          {gravando ? "Enviando" : equipeAtual ? "Salvar troca" : "Despachar"}
        </button>
      </form>
    </Cartao>
  );
}

function BlocoProvidencia({ onEnviar, gravando }: {
  onEnviar: (p: { orgaoDestino: string; descricao: string; responsavel: string; prazoHoras: number }) => void;
  gravando: boolean;
}) {
  const [orgao, setOrgao] = useState(ORGAOS[0]!);
  const [descricao, setDescricao] = useState("");
  const [responsavel, setResponsavel] = useState("");
  const [prazo, setPrazo] = useState(72);
  const [erro, setErro] = useState<string | null>(null);

  function enviar(evento: React.FormEvent) {
    evento.preventDefault();
    const resultado = providenciaSchema.safeParse({
      orgaoDestino: orgao, descricao: descricao.trim(),
      responsavel: responsavel.trim(), prazoHoras: Number(prazo),
    });
    if (!resultado.success) {
      setErro(resultado.error.issues[0]?.message ?? "Dados inválidos");
      return;
    }
    setErro(null);
    onEnviar(resultado.data);
  }

  return (
    <Cartao titulo="Encaminhar providência">
      <form onSubmit={enviar}>
        <div className="linha-campos">
          <div className="campo">
            <label htmlFor="prov-orgao">Órgão de destino</label>
            <select id="prov-orgao" value={orgao} onChange={(e) => setOrgao(e.target.value)}>
              {ORGAOS.map((o) => <option key={o} value={o}>{o}</option>)}
            </select>
          </div>
          <div className="campo">
            <label htmlFor="prov-responsavel">Responsável no órgão</label>
            <input id="prov-responsavel" type="text" value={responsavel}
                   onChange={(e) => setResponsavel(e.target.value)} />
          </div>
          <div className="campo">
            <label htmlFor="prov-prazo">Prazo em horas</label>
            <input id="prov-prazo" type="number" min={1} max={2160} value={prazo}
                   onChange={(e) => setPrazo(Number(e.target.value))} />
          </div>
        </div>

        <div className="campo">
          <label htmlFor="prov-descricao">O que se pede ao órgão</label>
          <textarea id="prov-descricao" value={descricao} onChange={(e) => setDescricao(e.target.value)}
                    placeholder="Execução de contenção provisória no talude e remoção do material deslizado" />
        </div>

        {erro && <ErroCampo id="providencia-erro">{erro}</ErroCampo>}
        <button type="submit" className="botao botao--primario" disabled={gravando}>
          {gravando ? "Encaminhando" : "Encaminhar providência"}
        </button>
      </form>
    </Cartao>
  );
}

function BlocoEncerramento({ onEnviar, gravando }: { onEnviar: (e: { motivo: string }) => void; gravando: boolean }) {
  const [motivo, setMotivo] = useState("");
  const [erro, setErro] = useState<string | null>(null);

  function enviar(evento: React.FormEvent) {
    evento.preventDefault();
    const resultado = encerramentoSchema.safeParse({ motivo: motivo.trim() });
    if (!resultado.success) {
      setErro(resultado.error.issues[0]?.message ?? "Dados inválidos");
      return;
    }
    setErro(null);
    onEnviar(resultado.data);
  }

  return (
    <Cartao titulo="Encerrar ocorrência">
      <p style={{ marginTop: 0, fontSize: "var(--ds-fs-body-sm)", color: "var(--ds-text-muted)" }}>
        Ocorrência não é apagada, é encerrada com motivo. O registro continua consultável e a
        trilha continua íntegra depois do fato.
      </p>
      <form onSubmit={enviar}>
        <div className="campo">
          <label htmlFor="encerrar-motivo">Motivo do encerramento</label>
          <textarea id="encerrar-motivo" value={motivo} onChange={(e) => setMotivo(e.target.value)}
                    aria-invalid={!!erro}
                    aria-describedby={erro ? "encerramento-erro" : undefined}
                    placeholder="Vistoria constatou ausência de risco remanescente e o morador foi orientado" />
          <span className="campo__dica">O banco recusa encerramento sem motivo: a regra não é da tela.</span>
        </div>
        {erro && <ErroCampo id="encerramento-erro">{erro}</ErroCampo>}
        <button type="submit" className="botao botao--perigo" disabled={gravando}>
          {gravando ? "Encerrando" : "Encerrar ocorrência"}
        </button>
      </form>
    </Cartao>
  );
}

/**
 * Documentos oficiais da ocorrência.
 *
 * Eles são gerados no servidor e abertos numa aba nova. O painel não monta o
 * documento: o mesmo laudo precisa sair igual na tela, na impressora e no PDF
 * anexado ao processo, e montar em três lugares produziria três documentos
 * diferentes com o mesmo número de protocolo.
 */
function CartaoDocumentos({ ocorrenciaId }: { ocorrenciaId: string }) {
  const sessao = useSessaoObrigatoria();
  const [abrindo, setAbrindo] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  async function abrir(
    tipo: "laudo" | "termo-de-interdicao" | "laudo.pdf" | "termo-de-interdicao.pdf",
  ) {
    setErro(null);
    setAbrindo(tipo);
    try {
      const endereco = await abrirDocumento(sessao, ocorrenciaId, tipo);
      window.open(endereco, "_blank", "noopener");
    } catch (e: unknown) {
      setErro(e instanceof Error ? e.message : String(e));
    } finally {
      setAbrindo(null);
    }
  }

  return (
    <Cartao titulo="Documentos oficiais">
      {MODO === "local" ? (
        <p style={{ margin: 0, fontSize: "var(--ds-fs-body-sm)", color: "var(--ds-text-muted)" }}>
          O laudo e o termo de interdição são gerados pelo servidor, para saírem
          idênticos na tela, na impressora e no arquivo anexado ao processo.
          Este painel está em modo local, sem servidor.
        </p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "var(--ds-sp-2)" }}>
          <button type="button" className="botao botao--secundario"
                  disabled={abrindo !== null} onClick={() => void abrir("laudo")}>
            <IconeDocumento /> {abrindo === "laudo" ? "Gerando" : "Laudo de vistoria"}
          </button>
          <button type="button" className="botao botao--secundario"
                  disabled={abrindo !== null} onClick={() => void abrir("termo-de-interdicao")}>
            <IconeDocumento />
            {abrindo === "termo-de-interdicao" ? "Gerando" : "Termo de interdição"}
          </button>

          <p style={{
            margin: "var(--ds-sp-2) 0 0", fontSize: "var(--ds-fs-caption)",
            lineHeight: "var(--ds-lh-caption)", color: "var(--ds-text-muted)",
          }}>
            Em PDF, para anexar ao processo:
          </p>
          <div style={{ display: "flex", gap: "var(--ds-sp-2)" }}>
            <button type="button" className="botao botao--discreto"
                    disabled={abrindo !== null} onClick={() => void abrir("laudo.pdf")}>
              {abrindo === "laudo.pdf" ? "Gerando" : "Laudo em PDF"}
            </button>
            <button type="button" className="botao botao--discreto"
                    disabled={abrindo !== null}
                    onClick={() => void abrir("termo-de-interdicao.pdf")}>
              {abrindo === "termo-de-interdicao.pdf" ? "Gerando" : "Termo em PDF"}
            </button>
          </div>
          {erro && <ErroCampo id="documento-erro">{erro}</ErroCampo>}
        </div>
      )}
    </Cartao>
  );
}

/**
 * As fotos que o agente enviou do campo.
 *
 * Elas aparecem aqui e não só dentro do laudo porque o coordenador decide o
 * despacho olhando a foto, antes de qualquer documento existir. Os endereços
 * são assinados e de vida curta: evidência de vistoria mostra a casa e a rua
 * de uma família em situação de risco, e link permanente circularia sozinho.
 */
function CartaoEvidencias({ fotos }: { fotos: LinhaEvidencia[] }) {
  const [ampliada, setAmpliada] = useState<LinhaEvidencia | null>(null);
  const fechar = useRef<HTMLButtonElement | null>(null);
  const origem = useRef<HTMLElement | null>(null);

  /*
    Abrir a foto ampliada leva o foco junto, e fechar devolve o foco à
    miniatura de onde ela veio. Sem isso, quem navega por teclado abre a foto
    e continua com o foco lá atrás, sem alcançar o botão de fechar; e ao
    fechar, o foco cai no início da página e o lugar na galeria se perde.
  */
  useEffect(() => {
    if (!ampliada) {
      origem.current?.focus();
      origem.current = null;
      return;
    }
    origem.current = document.activeElement as HTMLElement | null;
    fechar.current?.focus();

    function aoTeclar(evento: KeyboardEvent): void {
      if (evento.key === "Escape") setAmpliada(null);
    }
    document.addEventListener("keydown", aoTeclar);
    return () => document.removeEventListener("keydown", aoTeclar);
  }, [ampliada]);

  if (fotos.length === 0) {
    return (
      <Cartao titulo="Registro fotográfico">
        <p style={{ margin: 0, fontSize: "var(--ds-fs-body-sm)", color: "var(--ds-text-muted)" }}>
          {MODO === "local"
            ? "O envio de foto depende do servidor de armazenamento. Este painel está em modo local."
            : "Nenhuma fotografia foi anexada a esta vistoria."}
        </p>
      </Cartao>
    );
  }

  return (
    <Cartao titulo={`Registro fotográfico (${fotos.length})`}>
      <ul className="galeria">
        {fotos.map((f, i) => (
          <li key={f.id}>
            <button type="button" className="galeria__item" onClick={() => setAmpliada(f)}>
              <img src={f.url} alt={f.legenda ?? `Fotografia ${i + 1} da vistoria`} loading="lazy" />
              <span className="galeria__legenda">
                {f.legenda ?? `Foto ${i + 1}`}
                <br />
                <span className="tabela__secundario">{formatarDataHora(f.capturadaEm)}</span>
              </span>
            </button>
          </li>
        ))}
      </ul>

      {ampliada && (
        // acessibilidade: excecao. Clicar no fundo é atalho de mouse. Pelo
        // teclado o mesmo fecha com Escape e pelo botão Fechar, que recebe o
        // foco assim que a foto abre, então nada aqui depende do clique.
        <div className="lightbox" role="dialog" aria-modal="true"
             aria-label={ampliada.legenda ?? "Fotografia da vistoria"}
             onClick={() => setAmpliada(null)}>
          <img src={ampliada.url} alt={ampliada.legenda ?? "Fotografia da vistoria"} />
          <button type="button" className="botao botao--secundario" ref={fechar}
                  onClick={() => setAmpliada(null)}>
            Fechar
          </button>
        </div>
      )}
    </Cartao>
  );
}

/**
 * Registra o que o órgão respondeu.
 *
 * Fica dentro do cartão de providências, junto do que está sendo respondido,
 * porque a pessoa está com o telefone no ouvido enquanto a secretaria explica.
 * Formulário em outra tela significaria anotar no papel e transcrever depois,
 * que é exatamente o hábito que o sistema existe para substituir.
 */
function BlocoRespostaProvidencia({ abertas, onEnviar, gravando }: {
  abertas: LinhaProvidencia[];
  onEnviar: (
    providenciaId: string,
    r: { desfecho: DesfechoProvidencia; resposta: string; respondidaPor: string },
  ) => void;
  gravando: boolean;
}) {
  const [alvo, setAlvo] = useState(abertas[0]?.id ?? "");
  const [desfecho, setDesfecho] = useState<DesfechoProvidencia>("atendida");
  const [texto, setTexto] = useState("");
  const [quem, setQuem] = useState("");
  const [erro, setErro] = useState<string | null>(null);

  function enviar(evento: React.FormEvent) {
    evento.preventDefault();
    const resultado = respostaProvidenciaSchema.safeParse({
      desfecho, resposta: texto.trim(), respondidaPor: quem.trim(),
    });
    if (!resultado.success) {
      setErro(resultado.error.issues[0]?.message ?? "Dados inválidos");
      return;
    }
    setErro(null);
    onEnviar(alvo, resultado.data);
  }

  return (
    <form onSubmit={enviar} style={{ marginTop: "var(--ds-sp-5)" }}>
      <h3 className="cartao__titulo" style={{ fontSize: "var(--ds-fs-body-lg)" }}>
        Registrar resposta do órgão
      </h3>

      <div className="linha-campos">
        {abertas.length > 1 && (
          <div className="campo">
            <label htmlFor="resposta-alvo">Qual providência</label>
            <select id="resposta-alvo" value={alvo} onChange={(e) => setAlvo(e.target.value)}>
              {abertas.map((p) => (
                <option key={p.id} value={p.id}>{p.orgao_destino}</option>
              ))}
            </select>
          </div>
        )}
        <div className="campo">
          <label htmlFor="resposta-desfecho">Desfecho</label>
          <select id="resposta-desfecho" value={desfecho}
                  onChange={(e) => setDesfecho(e.target.value as DesfechoProvidencia)}>
            {DESFECHOS_PROVIDENCIA.map((d) => (
              <option key={d} value={d}>{ROTULO_DESFECHO[d]}</option>
            ))}
          </select>
        </div>
        <div className="campo">
          <label htmlFor="resposta-quem">Quem respondeu</label>
          <input id="resposta-quem" type="text" value={quem}
                 onChange={(e) => setQuem(e.target.value)}
                 placeholder="Fiscal da Secretaria de Obras" />
        </div>
      </div>

      <div className="campo">
        <label htmlFor="resposta-texto">O que o órgão informou</label>
        <textarea id="resposta-texto" value={texto}
                  aria-invalid={!!erro}
                  aria-describedby={erro ? "resposta-erro" : undefined}
                  onChange={(e) => setTexto(e.target.value)}
                  placeholder="Estrutura removida da via. Escoramento fica para a próxima semana." />
        <span className="campo__dica">
          A resposta não pode ser alterada depois: corrigir seria apagar o que o
          órgão disse. Se algo mudar, encaminhe uma providência nova.
        </span>
      </div>

      {erro && <ErroCampo id="resposta-erro">{erro}</ErroCampo>}
      <button type="submit" className="botao botao--primario" disabled={gravando}>
        {gravando ? "Registrando" : "Registrar resposta"}
      </button>
    </form>
  );
}
