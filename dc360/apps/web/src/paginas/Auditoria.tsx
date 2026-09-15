import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ROTULO_PAPEL, rotuloEventoTrilha } from "@dc360/shared";
import {
  MODO, baixarCsvDeOcorrencias, consultarTrilha, resumoDoPeriodo, tiposDeEvento,
  type LinhaTrilha, type ResumoPeriodo,
} from "../dados/repositorio";
import { useSessaoObrigatoria } from "../estado/sessao";
import { Aviso, Carregando, Cartao, Vazio, formatarDataHora } from "../componentes/comuns";
import { IconeDocumento, IconeEvento } from "../componentes/Icones";
import { useTitulo } from "../seo/titulo";

/**
 * Prestação de contas.
 *
 * Reúne o que um órgão público precisa responder e que não cabe na tela de uma
 * ocorrência: quem alterou o quê, o que foi feito no período, e a base em
 * planilha para quem quer cruzar por conta própria.
 *
 * A trilha aqui é a mesma tabela append-only que cada transição alimenta. Não
 * existe um registro de auditoria separado que alguém precise lembrar de
 * escrever: se um evento falta, é porque a mudança não aconteceu.
 */

const POR_PAGINA = 25;

export function Auditoria() {
  useTitulo("Auditoria");
  const sessao = useSessaoObrigatoria();
  const [trilha, setTrilha] = useState<LinhaTrilha[] | null>(null);
  const [total, setTotal] = useState(0);
  const [pagina, setPagina] = useState(1);
  const [tipos, setTipos] = useState<Array<{ tipo: string; total: number }>>([]);
  const [resumo, setResumo] = useState<ResumoPeriodo | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  const [autor, setAutor] = useState("");
  const [tipo, setTipo] = useState("");
  const [protocolo, setProtocolo] = useState("");
  const [rascunhoAutor, setRascunhoAutor] = useState("");
  const [rascunhoProtocolo, setRascunhoProtocolo] = useState("");

  const carregar = useCallback(async () => {
    const r = await consultarTrilha(sessao, { autor, tipo, protocolo, pagina });
    setTrilha(r.itens);
    setTotal(r.total);
  }, [sessao, autor, tipo, protocolo, pagina]);

  useEffect(() => {
    if (MODO === "local") {
      setErro("A auditoria consolidada exige a API. Este painel está em modo local.");
      return;
    }
    carregar().catch((e: unknown) => setErro(e instanceof Error ? e.message : String(e)));
  }, [carregar]);

  useEffect(() => {
    if (MODO === "local") return;
    tiposDeEvento(sessao).then(setTipos).catch(() => setTipos([]));
    resumoDoPeriodo(sessao).then(setResumo).catch(() => setResumo(null));
  }, [sessao]);

  if (erro && !trilha) {
    return (
      <>
        <div className="cabecalho-pagina">
          <div><h1>Prestação de contas</h1></div>
        </div>
        <Aviso tom="alerta">{erro}</Aviso>
      </>
    );
  }

  const paginas = Math.max(1, Math.ceil(total / POR_PAGINA));

  return (
    <>
      <div className="cabecalho-pagina">
        <div>
          <h1>Prestação de contas</h1>
          <p>{sessao.organizacaoNome}</p>
        </div>
      </div>

      {erro && <Aviso tom="perigo">{erro}</Aviso>}

      {resumo && <ResumoDoPeriodo resumo={resumo} />}

      <CartaoExportacao />

      <Cartao titulo={`Trilha de auditoria (${total})`}>
        <form
          className="filtros"
          onSubmit={(e) => {
            e.preventDefault();
            setPagina(1);
            setAutor(rascunhoAutor);
            setProtocolo(rascunhoProtocolo);
          }}
        >
          <label className="oculto-visualmente" htmlFor="trilha-autor">Filtrar por autor</label>
          <input id="trilha-autor" type="search" value={rascunhoAutor}
                 placeholder="Nome de quem agiu" className="campo--medio"
                 onChange={(e) => setRascunhoAutor(e.target.value)} />

          <label className="oculto-visualmente" htmlFor="trilha-protocolo">Filtrar por protocolo</label>
          <input id="trilha-protocolo" type="search" value={rascunhoProtocolo}
                 placeholder="Protocolo" className="campo--curto"
                 onChange={(e) => setRascunhoProtocolo(e.target.value)} />

          <button type="submit" className="botao botao--secundario">Filtrar</button>
          {(autor || tipo || protocolo) && (
            <button type="button" className="botao botao--discreto"
                    onClick={() => {
                      setAutor(""); setTipo(""); setProtocolo("");
                      setRascunhoAutor(""); setRascunhoProtocolo(""); setPagina(1);
                    }}>
              Limpar
            </button>
          )}
        </form>

        <div className="filtros" role="group" aria-label="Filtrar por tipo de evento">
          <button type="button" className="filtros__pilula" aria-pressed={tipo === ""}
                  onClick={() => { setTipo(""); setPagina(1); }}>
            Todos os eventos
          </button>
          {tipos.map((t) => (
            <button key={t.tipo} type="button" className="filtros__pilula"
                    aria-pressed={tipo === t.tipo}
                    onClick={() => { setTipo(t.tipo); setPagina(1); }}>
              {rotuloEventoTrilha(t.tipo)} ({t.total})
            </button>
          ))}
        </div>

        {!trilha ? (
          <Carregando />
        ) : trilha.length === 0 ? (
          <Vazio titulo="Nenhum evento com esses filtros">
            Limpe o filtro de tipo, ou amplie o período, para ver o que existe.
          </Vazio>
        ) : (
          <>
            <div className="tabela-envolucro">
              <table className="tabela">
                <caption className="oculto-visualmente">
                  Eventos da trilha, do mais recente para o mais antigo
                </caption>
                <thead>
                  <tr>
                    <th scope="col">Quando</th>
                    <th scope="col">O que aconteceu</th>
                    <th scope="col">Quem</th>
                    <th scope="col">Ocorrência</th>
                  </tr>
                </thead>
                <tbody>
                  {trilha.map((e) => (
                    <tr key={e.id}>
                      <td>
                        {/*
                          Duas horas, e a distinção entre elas é o que sustenta
                          a trilha como prova.

                          `ocorrido_em` é o relógio do aparelho do agente: é a
                          hora do ato no barranco, e é a que o laudo imprime.
                          Mas ela é DECLARADA, e um celular pode estar com o
                          fuso trocado ou ajustado à mão. `registrado_em` é
                          `now()` do banco, e ninguém escolhe.

                          Por isso o filtro de período desta tela recorta pela
                          segunda, e a primeira aparece rotulada. Sem o rótulo,
                          quem lê a auditoria trata declaração como apuração.
                        */}
                        <div>{formatarDataHora(e.ocorrido_em)}</div>
                        {e.origem === "campo" && (
                          <div className="tabela__secundario">
                            hora informada pelo aparelho
                          </div>
                        )}
                        {e.registrado_em !== e.ocorrido_em && (
                          <div className="tabela__secundario">
                            recebido em {formatarDataHora(e.registrado_em)}
                          </div>
                        )}
                      </td>
                      <td>
                        <span style={{ display: "inline-flex", alignItems: "center",
                                       gap: "var(--ds-sp-2)" }}>
                          <IconeEvento tipo={e.tipo} tamanho={14} />
                          {rotuloEventoTrilha(e.tipo)}
                        </span>
                        {e.detalhe && Object.keys(e.detalhe).length > 0 && (
                          <div className="tabela__secundario">{descrever(e.detalhe)}</div>
                        )}
                      </td>
                      <td>
                        <div className="tabela__principal">{e.autor_nome}</div>
                        <div className="tabela__secundario">
                          {ROTULO_PAPEL[e.autor_papel]},
                          {e.origem === "campo" ? " em campo" : " no escritório"}
                        </div>
                      </td>
                      <td>
                        <Link className="tabela__protocolo" to={`/ocorrencias/${e.ocorrencia_id}`}>
                          {e.protocolo}
                        </Link>
                        <div className="tabela__secundario">{e.endereco}</div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="paginacao">
              <span>
                Mostrando {(pagina - 1) * POR_PAGINA + 1} a{" "}
                {Math.min(pagina * POR_PAGINA, total)} de {total}
              </span>
              <div className="paginacao__controles">
                <button type="button" className="botao botao--secundario"
                        disabled={pagina === 1} onClick={() => setPagina((p) => p - 1)}>
                  Anterior
                </button>
                <button type="button" className="botao botao--secundario"
                        disabled={pagina >= paginas} onClick={() => setPagina((p) => p + 1)}>
                  Próxima
                </button>
              </div>
            </div>
          </>
        )}
      </Cartao>
    </>
  );
}

function descrever(detalhe: Record<string, unknown>): string {
  return Object.entries(detalhe)
    .filter(([, v]) => v !== null && v !== undefined && v !== "" &&
      !(Array.isArray(v) && v.length === 0))
    .map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(", ") : String(v)}`)
    .join(" · ");
}

function ResumoDoPeriodo({ resumo }: { resumo: ResumoPeriodo }) {
  return (
    <>
      <div className="grade-indicadores">
        <div className="indicador" style={{ cursor: "default" }}>
          <span className="indicador__valor">{resumo.total}</span>
          <span className="indicador__rotulo">Ocorrências registradas</span>
        </div>
        <div className="indicador" style={{ cursor: "default" }}>
          <span className="indicador__valor">{resumo.encerradas}</span>
          <span className="indicador__rotulo">Encerradas</span>
        </div>
        <div className="indicador" style={{ cursor: "default" }}>
          <span className="indicador__valor">{resumo.criticas}</span>
          <span className="indicador__rotulo">Severidade crítica</span>
        </div>
        <div className="indicador" style={{ cursor: "default" }}>
          <span className="indicador__valor">{resumo.comVulnerabilidade}</span>
          <span className="indicador__rotulo">Com vulnerabilidade social</span>
        </div>
        <div className="indicador" style={{ cursor: "default" }}>
          <span className="indicador__valor">
            {resumo.medianaHorasAteEncerrar !== null
              ? `${resumo.medianaHorasAteEncerrar}h`
              : "sem dados"}
          </span>
          <span className="indicador__rotulo">Tempo mediano até encerrar</span>
        </div>
      </div>

      <div className="detalhe" style={{ marginBottom: "var(--ds-sp-5)" }}>
        <Cartao titulo="Por tipo de ocorrência">
          {resumo.porTipo.length === 0 ? (
            <Vazio titulo="Sem dados no período" />
          ) : (
            <ul className="barras">
              {resumo.porTipo.map((t) => (
                <li key={t.tipo}>
                  <span className="barras__rotulo">{t.rotulo}</span>
                  <span className="barras__trilho">
                    <span className="barras__preenchido"
                          style={{ width: `${(t.total / resumo.porTipo[0]!.total) * 100}%` }} />
                  </span>
                  <span className="barras__valor mono">{t.total}</span>
                </li>
              ))}
            </ul>
          )}
        </Cartao>

        <Cartao titulo="Onde mais aconteceu">
          {resumo.porBairro.length === 0 ? (
            <Vazio titulo="Sem bairro identificado nos endereços" />
          ) : (
            <ul className="barras">
              {resumo.porBairro.map((b) => (
                <li key={b.bairro}>
                  <span className="barras__rotulo">{b.bairro}</span>
                  <span className="barras__trilho">
                    <span className="barras__preenchido"
                          style={{ width: `${(b.total / resumo.porBairro[0]!.total) * 100}%` }} />
                  </span>
                  <span className="barras__valor mono">{b.total}</span>
                </li>
              ))}
            </ul>
          )}
        </Cartao>
      </div>
    </>
  );
}

/**
 * Exportação da base.
 *
 * A planilha carrega nome, contato e relato de cidadãos, e o texto abaixo diz
 * isso em voz alta: quem baixa precisa saber o que está levando, e o sistema
 * registra quem levou.
 */
function CartaoExportacao() {
  const sessao = useSessaoObrigatoria();
  const [baixando, setBaixando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function baixar() {
    setErro(null);
    setBaixando(true);
    try {
      const { url, nome } = await baixarCsvDeOcorrencias(sessao, {});
      const ancora = document.createElement("a");
      ancora.href = url;
      ancora.download = nome;
      ancora.click();
      URL.revokeObjectURL(url);
    } catch (e: unknown) {
      setErro(e instanceof Error ? e.message : String(e));
    } finally {
      setBaixando(false);
    }
  }

  return (
    <Cartao titulo="Exportar a base">
      <p style={{ marginTop: 0, fontSize: "var(--ds-fs-body-sm)", color: "var(--ds-text-muted)" }}>
        A planilha traz nome, contato e relato de quem acionou a Defesa Civil.
        Ela é dado pessoal fora do sistema: quem baixa responde por onde ela vai
        parar, e o sistema registra quem baixou e qual recorte levou.
      </p>
      {erro && <Aviso tom="perigo">{erro}</Aviso>}
      <button type="button" className="botao botao--secundario"
              disabled={baixando} onClick={() => void baixar()}>
        <IconeDocumento /> {baixando ? "Gerando" : "Baixar ocorrências em CSV"}
      </button>
    </Cartao>
  );
}
