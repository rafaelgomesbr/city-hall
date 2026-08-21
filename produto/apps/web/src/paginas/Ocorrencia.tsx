import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  PRAZO_PADRAO_HORAS, ROTULO_CANAL, ROTULO_PAPEL, ROTULO_SEVERIDADE,
  ROTULO_TIPO_COBRADE, SEVERIDADES,
  despachoSchema, encerramentoSchema, providenciaSchema, triagemSchema,
  type Severidade,
} from "@dc360/shared";
import {
  buscarOcorrencia, classificarNaTriagem, despacharEquipe, encaminharProvidencia,
  encerrarOcorrencia, listarEquipes, providenciasDaOcorrencia, trilhaDaOcorrencia,
  vistoriaDaOcorrencia,
  type LinhaEquipe, type LinhaEvento, type LinhaOcorrencia,
  type LinhaProvidencia, type LinhaVistoria,
} from "../dados/repositorio";
import { useSessaoObrigatoria } from "../estado/sessao";
import {
  Aviso, Carregando, Cartao, Prazo, SeloSeveridade, SeloStatus, formatarDataHora,
} from "../componentes/comuns";
import { IconeEvento, IconeVoltar } from "../componentes/Icones";

const ROTULO_CHECKLIST: Record<string, string> = {
  risco_iminente: "Risco iminente identificado",
  evacuacao_necessaria: "Evacuação necessária",
  interdicao_indicada: "Interdição indicada",
  acionar_outro_orgao: "Necessário acionar outro órgão",
};

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
    const [ocorrencia, trilha, vistoria, providencias, equipes] = await Promise.all([
      buscarOcorrencia(sessao, id),
      trilhaDaOcorrencia(sessao, id),
      vistoriaDaOcorrencia(sessao, id),
      providenciasDaOcorrencia(sessao, id),
      listarEquipes(sessao),
    ]);
    if (!ocorrencia) throw new Error("Ocorrência não encontrada nesta organização");
    setDados({ ocorrencia, trilha, vistoria, providencias, equipes });
  }, [sessao, id]);

  useEffect(() => {
    setDados(null);
    recarregar().catch((e: unknown) => setErro(e instanceof Error ? e.message : String(e)));
  }, [recarregar]);

  async function executar(acao: () => Promise<void>, mensagem: string) {
    setErro(null);
    try {
      await acao();
      await recarregar();
      setAviso(mensagem);
    } catch (e: unknown) {
      setErro(e instanceof Error ? e.message : String(e));
    }
  }

  if (erro && !dados) return <Aviso tom="perigo">{erro}</Aviso>;
  if (!dados) return <Carregando />;

  const { ocorrencia: o, trilha, vistoria, providencias, equipes } = dados;
  const podeAgir = sessao.papel === "coordenador" || sessao.papel === "administrador";
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

          {podeAgir && !encerrada && o.status === "registrada" && (
            <BlocoTriagem
              onEnviar={(t) => executar(
                () => classificarNaTriagem(sessao, o.id, t),
                "Triagem registrada. O prazo de atendimento foi calculado pela severidade.",
              )}
            />
          )}

          {podeAgir && !encerrada && o.status === "triagem" && (
            <BlocoDespacho
              equipes={equipes.filter((e) => e.ativa)}
              severidade={o.severidade}
              onEnviar={(d) => executar(
                () => despacharEquipe(sessao, o.id, d),
                "Equipe despachada. A ocorrência aparece agora no aplicativo de campo.",
              )}
            />
          )}

          {podeAgir && !encerrada && o.status === "vistoria_concluida" && (
            <BlocoProvidencia
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

          {providencias.length > 0 && (
            <Cartao titulo="Providências encaminhadas">
              <div className="tabela-envolucro">
                <table className="tabela">
                  <thead>
                    <tr>
                      <th scope="col">Órgão de destino</th>
                      <th scope="col">Responsável</th>
                      <th scope="col">Encaminhada em</th>
                      <th scope="col">Prazo</th>
                    </tr>
                  </thead>
                  <tbody>
                    {providencias.map((p) => (
                      <tr key={p.id}>
                        <td>
                          <div>{p.orgao_destino}</div>
                          <div className="tabela__secundario">{p.descricao}</div>
                        </td>
                        <td>{p.responsavel}</td>
                        <td>{formatarDataHora(p.encaminhada_em)}</td>
                        <td>
                          <Prazo prazoEm={p.prazo_em} criadoEm={p.encaminhada_em}
                                 encerrada={p.respondida_em !== null} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Cartao>
          )}

          {podeAgir && !encerrada && (
            <BlocoEncerramento
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

function BlocoTriagem({ onEnviar }: { onEnviar: (t: { severidade: Severidade; vulnerabilidadePresente: boolean; vulnerabilidadeDescricao?: string }) => void }) {
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
                      aria-invalid={!!erro} />
          </div>
        )}

        {erro && <p className="campo__erro">{erro}</p>}
        <button type="submit" className="botao botao--primario">Registrar triagem</button>
      </form>
    </Cartao>
  );
}

function BlocoDespacho({ equipes, severidade, onEnviar }: {
  equipes: LinhaEquipe[];
  severidade: Severidade | null;
  onEnviar: (d: { equipeId: string; prazoHoras: number; instrucoes?: string }) => void;
}) {
  const [equipeId, setEquipeId] = useState(equipes[0]?.id ?? "");
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
      <Cartao titulo="Despachar equipe">
        <Aviso tom="alerta">
          Nenhuma equipe ativa cadastrada. Cadastre uma em <Link to="/equipes">Equipes</Link> para
          poder despachar.
        </Aviso>
      </Cartao>
    );
  }

  return (
    <Cartao titulo="Despachar equipe">
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

        {erro && <p className="campo__erro">{erro}</p>}
        <button type="submit" className="botao botao--primario">Despachar</button>
      </form>
    </Cartao>
  );
}

function BlocoProvidencia({ onEnviar }: {
  onEnviar: (p: { orgaoDestino: string; descricao: string; responsavel: string; prazoHoras: number }) => void;
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

        {erro && <p className="campo__erro">{erro}</p>}
        <button type="submit" className="botao botao--primario">Encaminhar providência</button>
      </form>
    </Cartao>
  );
}

function BlocoEncerramento({ onEnviar }: { onEnviar: (e: { motivo: string }) => void }) {
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
                    placeholder="Vistoria constatou ausência de risco remanescente e o morador foi orientado" />
          <span className="campo__dica">O banco recusa encerramento sem motivo: a regra não é da tela.</span>
        </div>
        {erro && <p className="campo__erro">{erro}</p>}
        <button type="submit" className="botao botao--perigo">Encerrar ocorrência</button>
      </form>
    </Cartao>
  );
}
