import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ROTULO_TIPO_COBRADE, podeExecutar } from "@dc360/shared";
import {
  indicadores as carregarIndicadores,
  listarOcorrencias,
  providenciasPendentes,
  type Indicadores,
  type LinhaOcorrencia,
  type ProvidenciaPendente,
} from "../dados/repositorio";
import { useSessaoObrigatoria } from "../estado/sessao";
import {
  Aviso, Carregando, Cartao, Prazo, SeloSeveridade, SeloStatus, Vazio, formatarDataHora,
} from "../componentes/comuns";
import { IconeMais } from "../componentes/Icones";

/**
 * Painel do coordenador. A pergunta que ele responde ao ser aberto de manhã é
 * uma só: o que exige decisão agora?
 *
 * Por isso a ordem é atenção primeiro (críticas e atrasadas em destaque),
 * volume depois. Cada indicador é clicável e leva à lista já filtrada: número
 * que não leva a lugar nenhum é enfeite.
 */
export function Painel() {
  const sessao = useSessaoObrigatoria();
  const navegar = useNavigate();
  const [dados, setDados] = useState<{
    ind: Indicadores;
    fila: LinhaOcorrencia[];
    providencias: ProvidenciaPendente[];
  } | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    let vivo = true;
    Promise.all([
      carregarIndicadores(sessao),
      listarOcorrencias(sessao, { status: "ativas" }),
      providenciasPendentes(sessao),
    ])
      .then(([ind, fila, providencias]) => {
        if (vivo) setDados({ ind, fila, providencias: providencias as ProvidenciaPendente[] });
      })
      .catch((e: unknown) => { if (vivo) setErro(e instanceof Error ? e.message : String(e)); });
    return () => { vivo = false; };
  }, [sessao]);

  if (erro) return <Aviso tom="perigo">Falha ao carregar o painel: {erro}</Aviso>;
  if (!dados) return <Carregando />;

  const { ind, fila, providencias } = dados;
  const prioritarias = fila.slice(0, 6);

  const cartoes: Array<{ rotulo: string; valor: number; para: string; alerta?: boolean }> = [
    { rotulo: "Na fila", valor: ind.na_fila, para: "/ocorrencias?status=ativas" },
    { rotulo: "Em campo", valor: ind.em_campo, para: "/ocorrencias?status=em_campo" },
    { rotulo: "Atrasadas", valor: ind.atrasadas, para: "/ocorrencias?status=ativas&atrasadas=1", alerta: ind.atrasadas > 0 },
    { rotulo: "Críticas ativas", valor: ind.criticas, para: "/ocorrencias?status=ativas&severidade=critica", alerta: ind.criticas > 0 },
    { rotulo: "Encerradas em 7 dias", valor: ind.encerradas_7d, para: "/ocorrencias?status=encerrada" },
    {
      rotulo: "Providências vencidas",
      valor: ind.providencias_vencidas ?? 0,
      para: "/painel",
      alerta: (ind.providencias_vencidas ?? 0) > 0,
    },
  ];



  return (
    <>
      <div className="cabecalho-pagina">
        <div>
          <h1>Painel operacional</h1>
          <p>{sessao.organizacaoNome}</p>
        </div>
        <div className="cabecalho-pagina__acoes">
          {/*
            Só aparece para quem consegue concluir. Sem esta guarda, o agente
            de campo via o botão, preenchia endereço, relato e coordenada, e o
            recusa vinha no fim, da camada de dados. Esconder não é controle de
            acesso (quem impede é `exigirPermissao`), mas oferecer o que vai
            ser negado é um beco sem saída construído de propósito.
          */}
          {podeExecutar(sessao.papel, "abrir_ocorrencia") && (
            <Link className="botao botao--primario" to="/ocorrencias/nova">
              <IconeMais /> Registrar ocorrência
            </Link>
          )}
        </div>
      </div>

      {ind.criticas > 0 && (
        <Aviso tom="perigo">
          <strong>{ind.criticas} ocorrência{ind.criticas > 1 ? "s" : ""} de severidade crítica</strong> em
          atendimento. Prazo padrão de 4 horas.
        </Aviso>
      )}

      <div className="grade-indicadores">
        {cartoes.map((c) => (
          <button key={c.rotulo} type="button"
                  className={`indicador${c.alerta ? " indicador--alerta" : ""}`}
                  onClick={() => navegar(c.para)}>
            <span className="indicador__valor">{c.valor}</span>
            <span className="indicador__rotulo">{c.rotulo}</span>
          </button>
        ))}
      </div>

      <Cartao
        titulo="Fila de atendimento"
        acoes={<Link className="botao botao--secundario" to="/ocorrencias">Ver todas</Link>}
      >
        {prioritarias.length === 0 ? (
          <Vazio titulo="Nenhuma ocorrência ativa">
            <p>Tudo que entrou foi encerrado. A fila volta a aparecer aqui no próximo registro.</p>
          </Vazio>
        ) : (
          <div className="tabela-envolucro">
            <table className="tabela">
              <caption className="oculto-visualmente">
                Ocorrências ativas ordenadas por severidade e depois por data de abertura
              </caption>
              <thead>
                <tr>
                  <th scope="col">Protocolo</th>
                  <th scope="col">Tipo e endereço</th>
                  <th scope="col">Severidade</th>
                  <th scope="col">Situação</th>
                  <th scope="col">Equipe</th>
                  <th scope="col">Prazo</th>
                </tr>
              </thead>
              <tbody>
                {prioritarias.map((o) => (
                  <tr key={o.id}>
                    <td>
                      <Link className="tabela__protocolo" to={`/ocorrencias/${o.id}`}>{o.protocolo}</Link>
                      <div className="tabela__secundario">{formatarDataHora(o.criado_em)}</div>
                    </td>
                    <td>
                      <div>{ROTULO_TIPO_COBRADE[o.tipo]}</div>
                      <div className="tabela__secundario">{o.endereco}</div>
                    </td>
                    <td><SeloSeveridade severidade={o.severidade} /></td>
                    <td><SeloStatus status={o.status} /></td>
                    <td>{o.equipe_nome ?? <span className="tabela__secundario">Não despachada</span>}</td>
                    <td>
                      <Prazo prazoEm={o.prazo_em} criadoEm={o.criado_em}
                             encerrada={o.status === "encerrada"} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Cartao>

      {providencias.length > 0 && (
        <Cartao titulo={`Providências aguardando resposta (${providencias.length})`}>
          <p style={{ marginTop: 0, fontSize: "var(--ds-fs-body-sm)", color: "var(--ds-text-muted)" }}>
            Elas somem da fila assim que a ocorrência é encerrada, e é justamente
            aí que ficam esquecidas. Por isso continuam aqui.
          </p>
          <div className="tabela-envolucro">
            <table className="tabela">
              <caption className="oculto-visualmente">
                Providências encaminhadas e ainda sem resposta do órgão
              </caption>
              <thead>
                <tr>
                  <th scope="col">Órgão</th>
                  <th scope="col">Protocolo</th>
                  <th scope="col">Encaminhada em</th>
                  <th scope="col">Prazo</th>
                </tr>
              </thead>
              <tbody>
                {providencias.slice(0, 8).map((p) => (
                  <tr key={p.id}>
                    <td>
                      <div className="tabela__principal">{p.orgao_destino}</div>
                      <div className="tabela__secundario">{p.descricao}</div>
                    </td>
                    <td>
                      <Link className="tabela__protocolo" to={`/ocorrencias/${p.ocorrencia_id}`}>
                        {p.protocolo}
                      </Link>
                      {p.status === "encerrada" && (
                        <div className="tabela__secundario">ocorrência já encerrada</div>
                      )}
                    </td>
                    <td>{formatarDataHora(p.encaminhada_em)}</td>
                    <td>
                      <Prazo prazoEm={p.prazo_em} criadoEm={p.encaminhada_em} encerrada={false} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Cartao>
      )}
    </>
  );
}
