import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import {
  PRAZO_PADRAO_HORAS, ROTULO_CANAL, ROTULO_CHECKLIST, ROTULO_PAPEL, ROTULO_SEVERIDADE,
  ROTULO_TIPO_COBRADE, SEVERIDADES, podeExecutar,
  DESFECHOS_PROVIDENCIA, ROTULO_DESFECHO, respostaProvidenciaSchema,
  type DesfechoProvidencia,
  despachoSchema, desinterdicaoSchema, providenciaSchema, triagemSchema,
  type Severidade, rotuloEventoTrilha } from "@dc360/shared";
import {
  buscarOcorrencia, classificarNaTriagem, despacharEquipe, encaminharProvidencia,
  encerrarOcorrencia,
  levantarInterdicao, listarEquipes, providenciasDaOcorrencia, trilhaDaOcorrencia,
  vistoriaDaOcorrencia, abrirDocumento, listarEvidencias, responderProvidencia,
  vinculosDaOcorrencia, possiveisDuplicidades, MODO,
  type LinhaEquipe, type LinhaEvento, type LinhaEvidencia, type LinhaOcorrencia,
  type LinhaProvidencia, type LinhaVistoria, type VinculoOcorrencia,
} from "../dados/repositorio";
import { useSessaoObrigatoria } from "../estado/sessao";
import {
  Aviso, AvisoDeObrigatorios, Carregando, Cartao, ErroCampo, Prazo, SeloSeveridade, SeloStatus,
  Vazio, formatarDataHora,
} from "../componentes/comuns";
import { Campo } from "../componentes/Campo";
import { ConfirmarAcao } from "../componentes/ConfirmarAcao";
import { Modal } from "../componentes/Modal";
import { Toast } from "../componentes/Toast";
import { IconeDocumento, IconeEvento, IconeVoltar } from "../componentes/Icones";
import {
  avisoDoRegistro, montarVerTambem, podeOferecerEncerramento, proximoPassoDoEncerramento,
  rotuloDoBotaoDeEncerrar, type ItemVerTambem, type PassoDoEncerramento,
  type RelacaoVerTambem,
} from "./ocorrencia-regras";

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
  /**
   * Outros chamados no mesmo endereço, ou `null` quando a consulta falhou.
   *
   * Os dois casos são diferentes e a tela precisa saber qual é: lista vazia é
   * "não há nada", e `null` é "não sei". Colapsar os dois faria o cartão
   * afirmar que não existe chamado vizinho justamente quando a busca por eles
   * não funcionou.
   */
  mesmoEndereco: LinhaOcorrencia[] | null;
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
  const local = useLocation();
  const [dados, setDados] = useState<Conjunto | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  /*
    A confirmação do registro só existe nesta tela, e não na que gravou.

    Quem abre o chamado está com o telefone no ombro e sai da tela de registro
    no mesmo instante em que ela grava, então um aviso lá dentro não seria
    lido por ninguém. O número do protocolo também não pode viajar junto pela
    navegação: a rota de gravação devolve o `id` da ocorrência, e o protocolo
    quem gera é o banco. Ele é lido aqui, do próprio registro, o que dá de
    graça a garantia que importa: o número dito no aviso é o mesmo que está
    no título da tela, e não uma cópia que pode divergir.
  */
  const chegouDoRegistro =
    (local.state as { recemRegistrada?: boolean } | null)?.recemRegistrada === true;
  const [anunciarRegistro, setAnunciarRegistro] = useState(chegouDoRegistro);

  /*
    A marca sai do histórico assim que é lida.

    Sem isto, ela fica guardada na entrada do histórico: recarregar a aba
    semanas depois faria a tela anunciar de novo "ocorrência registrada", sobre
    um chamado que já foi a campo e voltou. Aviso que mente uma vez é aviso que
    ninguém lê na segunda.
  */
  useEffect(() => {
    if (!chegouDoRegistro) return;
    navegar(`${local.pathname}${local.search}`, { replace: true, state: null });
  }, [chegouDoRegistro, navegar, local.pathname, local.search]);

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
    /*
      A vizinhança é consultada depois das outras, porque depende do tipo e do
      endereço que só a própria ocorrência informa, e a falha dela não derruba
      a página. O cartão "Ver também" é apoio; o detalhe da ocorrência é o
      trabalho. Deixar a exceção subir trocaria a tela inteira por uma faixa
      vermelha por causa de um cartão lateral.
    */
    const mesmoEndereco = await possiveisDuplicidades(sessao, ocorrencia.tipo, ocorrencia.endereco)
      .catch(() => null);
    setDados({
      ocorrencia, trilha, vistoria, providencias, equipes, evidencias, mesmoEndereco,
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

  /**
   * Para onde o olho vai depois de uma ação.
   *
   * As duas faixas ficam no TOPO de uma página de duas colunas que rola muito,
   * e o botão de encerrar fica no fim da coluna esquerda. Quem clica está no
   * rodapé: se a ação falha, o botão volta ao normal e nada mais acontece onde
   * essa pessoa está olhando. O `role="alert"` do `Aviso` resolve para quem usa
   * leitor de tela e não resolve para quem enxerga.
   */
  const faixaDeAviso = useRef<HTMLDivElement>(null);

  async function executar(acao: () => Promise<void>, mensagem: string) {
    if (gravando) return;
    setGravando(true);
    /*
      Limpar o aviso ANTERIOR é o ponto.

      Sem isto, a faixa verde de "triagem registrada" ficava na tela para
      sempre. O coordenador despachava, encaminhava providência, tentava
      encerrar e falhava, e a tela mostrava a faixa verde velha e a vermelha
      nova na mesma altura: o sistema dizendo "deu certo" e "deu errado" ao
      mesmo tempo, sobre coisas diferentes, sem dizer qual é qual.
    */
    setAviso(null);
    setErro(null);
    try {
      await acao();
      await recarregar();
      setAviso(mensagem);
    } catch (e: unknown) {
      setErro(e instanceof Error ? e.message : String(e));
    } finally {
      setGravando(false);
      // Depois de pintar o resultado, leva o olho e o foco até ele.
      requestAnimationFrame(() => {
        faixaDeAviso.current?.scrollIntoView({ block: "center", behavior: "smooth" });
        faixaDeAviso.current?.focus();
      });
    }
  }

  if (erro && !dados) return <Aviso tom="perigo">{erro}</Aviso>;
  if (!dados) return <Carregando />;

  const {
    ocorrencia: o, trilha, vistoria, providencias, equipes, evidencias,
    vinculadaA, vinculadas, mesmoEndereco,
  } = dados;
  // Mesma tabela que o repositório usa para recusar a escrita. A tela decide
  // o que desenhar; quem impede de verdade é a camada de dados.
  const podeTriagem = podeExecutar(sessao.papel, "classificar_triagem");
  const podeDespachar = podeExecutar(sessao.papel, "despachar_equipe");
  const podeProvidencia = podeExecutar(sessao.papel, "encaminhar_providencia");
  // Permissão E momento do fluxo, na mesma resposta. Ver `ocorrencia-regras`:
  // o encerramento não é oferecido enquanto o chamado é só um telefonema.
  const ofereceEncerramento = podeOferecerEncerramento(sessao.papel, o.status);
  const podeLevantar = podeExecutar(sessao.papel, "levantar_interdicao");
  const interditada = Boolean(o.interditada_em) && !o.desinterditada_em;
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

      <div ref={faixaDeAviso} tabIndex={-1} style={{ outline: "none" }}>
        {erro && <Aviso tom="perigo">{erro}</Aviso>}
        {aviso && <Aviso tom="sucesso">{aviso}</Aviso>}
      </div>

      {/*
        O aviso passageiro do registro. Ele repete o protocolo que já está no
        título logo acima e diz qual é o próximo passo, porque quem acabou de
        gravar não sabe se o trabalho terminou ali. Some sozinho, e nada se
        perde quando some: o protocolo continua no título e o passo seguinte
        continua sendo o cartão aberto na coluna da esquerda.
      */}
      {anunciarRegistro && (
        <Toast
          tom="sucesso"
          mensagem={avisoDoRegistro({ protocolo: o.protocolo, papel: sessao.papel })}
          aoFechar={() => setAnunciarRegistro(false)}
        />
      )}
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

          {/*
            A interdição vem ANTES do encerramento na ordem da tela, e a ordem
            é a decisão. Encerrar o caso com a família ainda fora de casa é
            legítimo (a interdição é medida de prazo indeterminado), mas quem
            está com o dedo no botão de encerrar precisa ver primeiro que tem
            gente esperando para voltar.
          */}
          {interditada && (
            <BlocoDesinterdicao
              gravando={gravando}
              podeLevantar={podeLevantar}
              interditadaEm={o.interditada_em!}
              onEnviar={(motivo) => executar(
                () => levantarInterdicao(sessao, o.id, motivo),
                "Interdição levantada. O termo de desinterdição já pode ser emitido em Documentos oficiais.",
              )}
            />
          )}

          {o.desinterditada_em && (
            <Cartao titulo="Interdição levantada">
              <div className="par">
                <span className="par__rotulo">Levantada em</span>
                <span className="par__valor">{formatarDataHora(o.desinterditada_em)}</span>
              </div>
              <div className="par">
                <span className="par__rotulo">Motivo</span>
                <span className="par__valor">{o.desinterdicao_motivo}</span>
              </div>
            </Cartao>
          )}

          {ofereceEncerramento && (
            <BlocoEncerramento
              gravando={gravando}
              protocolo={o.protocolo}
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
                  <div className="trilha__titulo">{rotuloEventoTrilha(e.tipo)}</div>
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

          {vistoria && podeDocumento && (
            <CartaoDocumentos ocorrenciaId={o.id} desinterditada={Boolean(o.desinterditada_em)} />
          )}

          <CartaoVerTambem
            itens={montarVerTambem({
              ocorrenciaId: o.id,
              tipo: o.tipo,
              vinculadaA,
              vinculadas,
              mesmoEndereco: mesmoEndereco ?? [],
            })}
            consultaFalhou={mesmoEndereco === null}
          />
        </div>
      </div>
    </>
  );
}

function descreverDetalhe(detalhe: Record<string, unknown>): string {
  return Object.entries(detalhe)
    .filter(([, v]) => v !== null && v !== undefined && v !== "")
    .map(([k, v]) => `${k}: ${String(v)}`)
    .join(" · ");
}

const GRUPOS_VER_TAMBEM: ReadonlyArray<{ relacao: RelacaoVerTambem; rotulo: string }> = [
  { relacao: "continuacao", rotulo: "Este chamado é continuação de" },
  { relacao: "mesmo_evento", rotulo: "Mesmo evento" },
  { relacao: "mesmo_endereco", rotulo: "Mesmo endereço, nas últimas 48 horas" },
];

/**
 * Os outros chamados que têm a ver com este.
 *
 * Cada linha diz protocolo, tipo quando ele é conhecido, data e situação, e
 * nada além disso. A tentação seria mostrar o relato para poupar um clique:
 * seria expor o texto que o solicitante ditou, e junto com ele a
 * vulnerabilidade social do vizinho, num cartão lateral de um caso que a
 * pessoa nem abriu. Quem precisa do conteúdo clica e o acesso fica na trilha
 * do caso certo.
 *
 * O estado vazio diz o que foi procurado, e não só que não achou. "Nada
 * relacionado" sozinho é ambíguo entre "não existe" e "não procurei direito",
 * e é o tipo de ambiguidade que faz a pessoa desconfiar da tela inteira.
 */
export function CartaoVerTambem(
  { itens, consultaFalhou }: { itens: ItemVerTambem[]; consultaFalhou: boolean },
) {
  const grupos = GRUPOS_VER_TAMBEM
    .map((g) => ({ ...g, itens: itens.filter((i) => i.relacao === g.relacao) }))
    .filter((g) => g.itens.length > 0);

  return (
    <Cartao titulo="Ver também">
      {grupos.length === 0 ? (
        <Vazio titulo="Nada relacionado">
          {/*
            Vazio com a busca quebrada não é a mesma frase. Afirmar "nenhum
            outro neste endereço" quando a consulta nem respondeu seria dar
            como fato o que a tela não sabe.
          */}
          <p style={{ margin: 0 }}>
            {consultaFalhou
              ? "Nenhum chamado vinculado a este. A busca por outros no mesmo "
                + "endereço não respondeu agora."
              : "Nenhum chamado vinculado a este, e nenhum outro do mesmo tipo "
                + "neste endereço nas últimas 48 horas."}
          </p>
        </Vazio>
      ) : (
        grupos.map((g) => (
          <div key={g.relacao} className="relacionados__grupo">
            <h3 className="relacionados__rotulo">{g.rotulo}</h3>
            <ul className="relacionados">
              {g.itens.map((i) => (
                <li key={i.id}>
                  <Link className="relacionados__item" to={`/ocorrencias/${i.id}`}>
                    <span className="relacionados__topo">
                      <span className="mono">{i.protocolo}</span>
                      <SeloStatus status={i.status} />
                    </span>
                    <span className="relacionados__meta">
                      {i.tipo ? `${ROTULO_TIPO_COBRADE[i.tipo]}, aberta em ` : "Aberta em "}
                      {formatarDataHora(i.criadoEm)}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))
      )}

      {consultaFalhou && grupos.length > 0 && (
        <p className="campo__dica" style={{ marginBottom: 0 }}>
          A busca por outros chamados neste endereço não respondeu agora, então
          esta lista pode estar incompleta.
        </p>
      )}
    </Cartao>
  );
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
      {/*
        `noValidate` não é descuido: a validação é a do esquema compartilhado,
        a mesma que o servidor roda. Sem ele, o navegador barra o envio antes
        com a bolha nativa dele, em texto que não é nosso, e as mensagens
        escritas para este domínio nunca aparecem. O `required` de cada campo
        continua fazendo o trabalho que importa aqui, que é ser anunciado pelo
        leitor de tela junto do rótulo.
      */}
      <form onSubmit={enviar} noValidate>
        <AvisoDeObrigatorios />
        <Campo id="triagem-severidade" rotulo="Severidade"
               dica="A severidade define o prazo de atendimento, não o contrário.">
          {(campo) => (
            <select {...campo} value={severidade}
                    onChange={(e) => setSeveridade(e.target.value as Severidade)}>
              {SEVERIDADES.map((s) => (
                <option key={s} value={s}>
                  {ROTULO_SEVERIDADE[s]} (prazo de {PRAZO_PADRAO_HORAS[s]} horas)
                </option>
              ))}
            </select>
          )}
        </Campo>

        {/*
          Esta marcação fica FORA de `Campo`, e não por descuido.

          `Campo` amarra rótulo e controle por `htmlFor`/`id`, e essa amarração
          é justamente a que se desfaz em silêncio quando alguém renomeia um
          dos dois. Aqui o rótulo ENVOLVE a caixa: não existe par de
          identificadores para divergir, e clicar no texto marca a caixa porque
          o texto é o rótulo, não porque alguém lembrou de apontar para ela.

          E a convenção de obrigatoriedade não se aplica: `required` numa caixa
          de marcação significa "precisa estar marcada", e esta pode ficar
          desmarcada, que é o caso mais comum. Marcá-la como obrigatória seria
          o leitor de tela anunciando uma exigência que não existe.
        */}
        <label className="caixa-marcacao">
          <input type="checkbox" checked={vulneravel} onChange={(e) => setVulneravel(e.target.checked)} />
          <span>
            Há vulnerabilidade social envolvida
            <br />
            <span className="campo__dica">Idoso, criança, pessoa com deficiência ou pessoa acamada no local.</span>
          </span>
        </label>

        {vulneravel && (
          <Campo id="triagem-vuln" rotulo="Descreva a vulnerabilidade">
            {(campo) => (
              <textarea {...campo} value={descricao}
                        onChange={(e) => setDescricao(e.target.value)}
                        aria-invalid={erro ? true : undefined}
                        aria-describedby={erro ? "triagem-erro" : undefined} />
            )}
          </Campo>
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
      <form onSubmit={enviar} noValidate>
        <AvisoDeObrigatorios />
        <div className="linha-campos">
          <Campo id="despacho-equipe" rotulo="Equipe">
            {(campo) => (
              <select {...campo} value={equipeId} onChange={(e) => setEquipeId(e.target.value)}>
                {equipes.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.nome} ({e.em_atendimento} em atendimento)
                  </option>
                ))}
              </select>
            )}
          </Campo>
          <Campo id="despacho-prazo" rotulo="Prazo em horas">
            {(campo) => (
              <input {...campo} type="number" min={1} max={720} value={prazo}
                     onChange={(e) => setPrazo(Number(e.target.value))} />
            )}
          </Campo>
        </div>

        <Campo id="despacho-instrucoes" rotulo="Instruções para a equipe" opcional>
          {(campo) => (
            <textarea {...campo} value={instrucoes}
                      onChange={(e) => setInstrucoes(e.target.value)}
                      placeholder="Acesso pela lateral do lote, cuidado com fiação exposta" />
          )}
        </Campo>

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
      <form onSubmit={enviar} noValidate>
        <AvisoDeObrigatorios />
        <div className="linha-campos">
          <Campo id="prov-orgao" rotulo="Órgão de destino">
            {(campo) => (
              <select {...campo} value={orgao} onChange={(e) => setOrgao(e.target.value)}>
                {ORGAOS.map((o) => <option key={o} value={o}>{o}</option>)}
              </select>
            )}
          </Campo>
          <Campo id="prov-responsavel" rotulo="Responsável no órgão">
            {(campo) => (
              <input {...campo} type="text" value={responsavel}
                     onChange={(e) => setResponsavel(e.target.value)} />
            )}
          </Campo>
          <Campo id="prov-prazo" rotulo="Prazo em horas">
            {(campo) => (
              <input {...campo} type="number" min={1} max={2160} value={prazo}
                     onChange={(e) => setPrazo(Number(e.target.value))} />
            )}
          </Campo>
        </div>

        <Campo id="prov-descricao" rotulo="O que se pede ao órgão">
          {(campo) => (
            <textarea {...campo} value={descricao}
                      onChange={(e) => setDescricao(e.target.value)}
                      placeholder="Execução de contenção provisória no talude e remoção do material deslizado" />
          )}
        </Campo>

        {erro && <ErroCampo id="providencia-erro">{erro}</ErroCampo>}
        <button type="submit" className="botao botao--primario" disabled={gravando}>
          {gravando ? "Encaminhando" : "Encaminhar providência"}
        </button>
      </form>
    </Cartao>
  );
}

/**
 * Encerrar: o formulário na tela, a pergunta numa janela.
 *
 * Este é o botão de consequência mais definitiva do painel: encerrada é estado
 * terminal, e o evento entra numa trilha sem policy de UPDATE nem de DELETE.
 * Não existe desfazer, existe evento novo dizendo que o anterior estava
 * errado.
 *
 * A confirmação já foi dois toques no próprio bloco, e o comentário que
 * justificava aquilo dizia por quê: modal de verdade (foco preso, Escape, foco
 * devolvido a quem abriu) era outro turno de trabalho, e meia biblioteca de
 * modal escrita às pressas dentro desta página seria uma armadilha de teclado,
 * que é pior do que não ter confirmação nenhuma. Esse turno aconteceu, e a
 * peça é `ConfirmarAcao`. Os dois toques saem, e com eles saem os dois
 * defeitos que ninguém tinha como consertar aqui dentro:
 *
 * - o botão que trocava de texto por baixo do dedo. Quem estava com o foco
 *   nele via o rótulo virar "Confirmar encerramento de ..." sem que nada fosse
 *   anunciado, e o segundo toque gravava. A janela obriga o foco a se mover,
 *   e ele começa em "Cancelar";
 * - a página inteira continuava clicável durante a pergunta. Agora ela fica
 *   `inert`, então não há como responder a pergunta mexendo em outra coisa.
 *
 * O estado de dois passos FICA, porque ele não era só desenho: é ele que
 * garante que editar o motivo derruba a confirmação. O que foi confirmado é o
 * texto que estava na tela naquele instante, e deixar a janela de pé enquanto
 * o texto muda gravaria motivo diferente do confirmado.
 */
export function BlocoEncerramento({ protocolo, onEnviar, gravando }: {
  protocolo: string;
  onEnviar: (e: { motivo: string }) => void;
  gravando: boolean;
}) {
  const [motivo, setMotivo] = useState("");
  const [passo, setPasso] = useState<PassoDoEncerramento>("editando");
  const [erro, setErro] = useState<string | null>(null);

  /*
    Um caminho só, chamado de dois lugares: o envio do formulário e o botão da
    janela. Duas cópias da mesma decisão divergiriam na primeira correção, e a
    que ficaria para trás seria justamente a de dentro da janela, que é a que
    grava.
  */
  function avancar(): void {
    const decisao = proximoPassoDoEncerramento(passo, motivo);
    if (decisao.tipo === "erro") {
      setErro(decisao.mensagem);
      // Fecha a janela junto: erro anunciado atrás de uma pergunta aberta é
      // erro que ninguém lê.
      setPasso("editando");
      return;
    }
    setErro(null);
    if (decisao.tipo === "perguntar") {
      setPasso("confirmando");
      return;
    }
    onEnviar({ motivo: decisao.motivo });
  }

  return (
    <Cartao titulo="Encerrar ocorrência">
      <p style={{ marginTop: 0, fontSize: "var(--ds-fs-body-sm)", color: "var(--ds-text-muted)" }}>
        Ocorrência não é apagada, é encerrada com motivo. O registro continua consultável e a
        trilha continua íntegra depois do fato.
      </p>
      <form onSubmit={(evento) => { evento.preventDefault(); avancar(); }} noValidate>
        <Campo
          id="encerrar-motivo"
          rotulo="Motivo do encerramento"
          erro={erro}
          dica="O banco recusa encerramento sem motivo: a regra não é da tela."
        >
          {(campo) => (
            <textarea {...campo} value={motivo}
                      onChange={(e) => { setMotivo(e.target.value); setPasso("editando"); }}
                      placeholder="Vistoria constatou ausência de risco remanescente e o morador foi orientado" />
          )}
        </Campo>
        {/*
          O rótulo do botão que ABRE a pergunta não muda mais: ele diz o ato, e
          a janela é que repete o ato com o protocolo dentro.
        */}
        <button type="submit" className="botao botao--perigo" disabled={gravando}>
          {rotuloDoBotaoDeEncerrar("editando", protocolo, gravando)}
        </button>
      </form>

      <ConfirmarAcao
        aberto={passo === "confirmando"}
        titulo="Encerrar ocorrência"
        consequencia={
          <>
            Encerrar o protocolo <span className="mono">{protocolo}</span> não tem desfazer:
            a correção depois entra como evento novo na trilha, e o encerramento errado
            fica registrado do mesmo jeito.
          </>
        }
        rotuloDaAcao={rotuloDoBotaoDeEncerrar("confirmando", protocolo, false)}
        destrutiva
        ocupado={gravando}
        aoConfirmar={avancar}
        aoCancelar={() => setPasso("editando")}
      >
        {/*
          O motivo digitado é repetido dentro da janela porque ele sai no
          registro e não tem correção: é a última chance de ver que o texto é o
          da outra aba, ou que ficou pela metade.
        */}
        <p className="campo__dica" style={{ marginTop: "var(--ds-sp-3)" }}>
          Motivo que fica registrado: {motivo.trim()}
        </p>
      </ConfirmarAcao>
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
function CartaoDocumentos(
  { ocorrenciaId, desinterditada }: { ocorrenciaId: string; desinterditada: boolean },
) {
  const sessao = useSessaoObrigatoria();
  const [abrindo, setAbrindo] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  async function abrir(
    tipo:
      | "laudo" | "termo-de-interdicao" | "termo-de-desinterdicao"
      | "laudo.pdf" | "termo-de-interdicao.pdf",
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
          {/*
            O termo de desinterdição só aparece quando a interdição foi
            levantada. Antes disso não há o que emitir, e o botão seria uma
            promessa vazia igual à que a mensagem de sucesso fazia.
          */}
          {desinterditada && (
            <button type="button" className="botao botao--secundario"
                    disabled={abrindo !== null}
                    onClick={() => void abrir("termo-de-desinterdicao")}>
              <IconeDocumento />
              {abrindo === "termo-de-desinterdicao" ? "Gerando" : "Termo de desinterdição"}
            </button>
          )}

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

  /*
    A foto ampliada era uma janela pela metade.

    Ela declarava `role="dialog"` e `aria-modal="true"`, que é a promessa, ao
    leitor de tela, de que aquilo tem começo e fim e que nada atrás dela
    responde. Levava o foco ao abrir, devolvia ao fechar e fechava no Escape,
    mas não prendia o Tab: da terceira tabulação em diante o foco saía pela
    borda e voltava para a página de trás, que continuava desenhada embaixo do
    fundo escuro. Quem navega por teclado passava a operar controles que não
    via, achando que ainda estava na foto, e o Enter caía em qualquer coisa,
    inclusive em "Encerrar ocorrência".

    `Modal` faz as quatro coisas de uma vez, e num lugar só.
  */
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
        <Modal
          aberto
          titulo={ampliada.legenda ?? "Fotografia da vistoria"}
          aoFechar={() => setAmpliada(null)}
        >
          <img
            src={ampliada.url}
            alt={ampliada.legenda ?? "Fotografia da vistoria"}
            style={{
              display: "block", width: "100%", height: "auto",
              borderRadius: "var(--ds-radius)", background: "var(--ds-surface-2)",
            }}
          />
          <p className="campo__dica" style={{ marginTop: "var(--ds-sp-3)", marginBottom: 0 }}>
            Capturada em {formatarDataHora(ampliada.capturadaEm)}.
          </p>
        </Modal>
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
  /*
    A resposta do órgão é gravada uma vez e não tem correção: o próprio cartão
    diz isso a quem preenche. Antes disso era um clique só, no fim de um
    formulário de quatro campos, com o telefone no ouvido e a secretaria
    ditando. Trocar o desfecho sem querer ("recusada" onde era "atendida")
    imprime no laudo o contrário do que o órgão disse, e o conserto vira
    encaminhar providência nova, que reabre o caso.
  */
  const [confirmando, setConfirmando] = useState(false);

  /** Um caminho só: o envio do formulário pergunta, o botão da janela grava. */
  function avancar(): void {
    const resultado = respostaProvidenciaSchema.safeParse({
      desfecho, resposta: texto.trim(), respondidaPor: quem.trim(),
    });
    if (!resultado.success) {
      setErro(resultado.error.issues[0]?.message ?? "Dados inválidos");
      setConfirmando(false);
      return;
    }
    setErro(null);
    if (!confirmando) {
      setConfirmando(true);
      return;
    }
    setConfirmando(false);
    onEnviar(alvo, resultado.data);
  }

  /*
    Toda edição derruba a pergunta, e por isso cada `onChange` abaixo começa
    por `setConfirmando(false)`: o que foi confirmado é o texto que estava na
    tela naquele instante, e deixar a janela de pé enquanto os campos mudam
    gravaria uma resposta diferente da que apareceu nela.
  */
  const alvoAberto = abertas.find((p) => p.id === alvo) ?? abertas[0];

  return (
    <form onSubmit={(evento) => { evento.preventDefault(); avancar(); }} noValidate
          style={{ marginTop: "var(--ds-sp-5)" }}>
      <h3 className="cartao__titulo" style={{ fontSize: "var(--ds-fs-body-lg)" }}>
        Registrar resposta do órgão
      </h3>
      <AvisoDeObrigatorios />

      <div className="linha-campos">
        {abertas.length > 1 && (
          <Campo id="resposta-alvo" rotulo="Qual providência">
            {(campo) => (
              <select {...campo} value={alvo}
                      onChange={(e) => { setConfirmando(false); setAlvo(e.target.value); }}>
                {abertas.map((p) => (
                  <option key={p.id} value={p.id}>{p.orgao_destino}</option>
                ))}
              </select>
            )}
          </Campo>
        )}
        <Campo id="resposta-desfecho" rotulo="Desfecho">
          {(campo) => (
            <select {...campo} value={desfecho}
                    onChange={(e) => { setConfirmando(false); setDesfecho(e.target.value as DesfechoProvidencia); }}>
              {DESFECHOS_PROVIDENCIA.map((d) => (
                <option key={d} value={d}>{ROTULO_DESFECHO[d]}</option>
              ))}
            </select>
          )}
        </Campo>
        <Campo id="resposta-quem" rotulo="Quem respondeu">
          {(campo) => (
            <input {...campo} type="text" value={quem}
                   onChange={(e) => { setConfirmando(false); setQuem(e.target.value); }}
                   placeholder="Fiscal da Secretaria de Obras" />
          )}
        </Campo>
      </div>

      <Campo
        id="resposta-texto"
        rotulo="O que o órgão informou"
        dica={"A resposta não pode ser alterada depois: corrigir seria apagar o que o "
          + "órgão disse. Se algo mudar, encaminhe uma providência nova."}
      >
        {(campo) => (
          <textarea {...campo} value={texto}
                    aria-invalid={erro ? true : undefined}
                    aria-describedby={erro ? "resposta-erro" : undefined}
                    onChange={(e) => { setConfirmando(false); setTexto(e.target.value); }}
                    placeholder="Estrutura removida da via. Escoramento fica para a próxima semana." />
        )}
      </Campo>

      {erro && <ErroCampo id="resposta-erro">{erro}</ErroCampo>}
      <button type="submit" className="botao botao--primario" disabled={gravando}>
        {gravando ? "Registrando" : "Registrar resposta"}
      </button>

      <ConfirmarAcao
        aberto={confirmando}
        titulo="Registrar resposta do órgão"
        consequencia={
          <>
            A resposta entra no registro do jeito que está e não tem correção
            depois: o desfecho aparece no laudo e fecha a cobrança daquela
            providência.
          </>
        }
        rotuloDaAcao={`Registrar resposta como ${ROTULO_DESFECHO[desfecho]}`}
        destrutiva
        ocupado={gravando}
        aoConfirmar={avancar}
        aoCancelar={() => setConfirmando(false)}
      >
        <p className="campo__dica" style={{ marginTop: "var(--ds-sp-3)" }}>
          {alvoAberto?.orgao_destino ?? "Providência"}, respondida por {quem.trim()}: {texto.trim()}
        </p>
      </ConfirmarAcao>
    </form>
  );
}

/**
 * Levantar a interdição.
 *
 * O botão é vermelho e o texto não é gentil, de propósito. Autorizar uma
 * família a voltar para uma casa que o município declarou insegura é o ato de
 * maior consequência desta tela: se o barranco cair depois, a pergunta será
 * quem assinou isto e com base em quê. O motivo sai impresso no termo, é o que
 * responde essa pergunta, e por isso o esquema compartilhado exige quinze
 * caracteres em vez de aceitar "ok".
 *
 * Quem não tem a permissão vê o cartão e não vê o formulário. Ver que existe
 * uma interdição em aberto é informação de trabalho para a equipe inteira;
 * levantá-la é da coordenação. E esconder o formulário não é o controle: o
 * controle é `exigirPermissao`, no servidor.
 */
function BlocoDesinterdicao({
  gravando, podeLevantar, interditadaEm, onEnviar,
}: {
  gravando: boolean;
  podeLevantar: boolean;
  interditadaEm: string;
  onEnviar: (motivo: string) => void;
}) {
  const [motivo, setMotivo] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  /*
    Era um clique só, e é a escrita de maior consequência do produto.

    Levantar a interdição autoriza uma família a dormir de novo numa casa que o
    município declarou insegura. O botão vermelho e o texto duro já estavam
    aqui, e não impediam nada: um clique distraído no fim de um formulário
    gravava a autorização, e o desfazer não existe (o levantamento vira evento
    na trilha, e desinterditar de novo não apaga o primeiro). Se o barranco
    cair depois, a pergunta é quem assinou isto e com base em quê.
  */
  const [confirmando, setConfirmando] = useState(false);

  const dias = Math.floor((Date.now() - new Date(interditadaEm).getTime()) / 86_400_000);

  /** Um caminho só: o envio pergunta, o botão da janela grava. */
  function avancar(): void {
    const resultado = desinterdicaoSchema.safeParse({ motivo: motivo.trim() });
    if (!resultado.success) {
      setErro(resultado.error.issues[0]?.message ?? "Dados inválidos");
      // Fecha a janela junto: erro atrás de uma pergunta aberta não é lido.
      setConfirmando(false);
      return;
    }
    setErro(null);
    if (!confirmando) {
      setConfirmando(true);
      return;
    }
    setConfirmando(false);
    onEnviar(resultado.data.motivo);
  }

  return (
    <Cartao titulo="Imóvel interditado">
      <div className="par">
        <span className="par__rotulo">Interditado em</span>
        <span className="par__valor">
          {formatarDataHora(interditadaEm)}
          {dias > 0 && ` (há ${dias} ${dias === 1 ? "dia" : "dias"})`}
        </span>
      </div>

      {!podeLevantar ? (
        <p style={{ fontSize: "var(--ds-fs-body-sm)", color: "var(--ds-text-muted)" }}>
          O levantamento da interdição é registrado pela coordenação.
        </p>
      ) : (
        <form onSubmit={(evento) => { evento.preventDefault(); avancar(); }} noValidate>
          <Campo
            id="desinterdicao-motivo"
            rotulo="Motivo do levantamento"
            erro={erro}
            dica={"Sai impresso no termo de desinterdição. É o que responde, anos depois, "
              + "por que a família foi autorizada a voltar."}
          >
            {(campo) => (
              <textarea {...campo} value={motivo}
                        onChange={(e) => { setConfirmando(false); setMotivo(e.target.value); }}
                        placeholder="Contenção do talude executada e conferida em nova vistoria técnica" />
            )}
          </Campo>
          <button type="submit" className="botao botao--perigo" disabled={gravando}>
            {gravando ? "Registrando" : "Levantar interdição"}
          </button>

          <ConfirmarAcao
            aberto={confirmando}
            titulo="Levantar a interdição"
            consequencia={
              <>
                O imóvel deixa de constar como interditado e a família fica
                autorizada a voltar para dentro. Não tem desfazer: interditar de
                novo é ato novo, com vistoria nova, e este levantamento continua
                registrado na trilha com o seu nome.
              </>
            }
            rotuloDaAcao="Levantar a interdição deste imóvel"
            destrutiva
            ocupado={gravando}
            aoConfirmar={avancar}
            aoCancelar={() => setConfirmando(false)}
          >
            {/*
              O motivo é repetido dentro da janela porque ele sai impresso no
              termo. É a última chance de ver que ele ficou pela metade, ou que
              descreve outra vistoria.
            */}
            <p className="campo__dica" style={{ marginTop: "var(--ds-sp-3)" }}>
              Interditado há {dias} {dias === 1 ? "dia" : "dias"}. Motivo que sai no
              termo: {motivo.trim()}
            </p>
          </ConfirmarAcao>
        </form>
      )}
    </Cartao>
  );
}
