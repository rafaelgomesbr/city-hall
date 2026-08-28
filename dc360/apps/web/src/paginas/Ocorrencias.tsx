import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  ROTULO_STATUS, ROTULO_TIPO_COBRADE, SEVERIDADES, ROTULO_SEVERIDADE, podeExecutar,
  type Severidade, type StatusOcorrencia,
} from "@dc360/shared";
import { listarOcorrencias, type LinhaOcorrencia } from "../dados/repositorio";
import { useSessaoObrigatoria } from "../estado/sessao";
import {
  Aviso, Carregando, Prazo, SeloSeveridade, SeloStatus, Vazio, formatarDataHora,
} from "../componentes/comuns";
import { IconeMais } from "../componentes/Icones";

const POR_PAGINA = 10;

const FILTROS_STATUS: Array<{ chave: string; rotulo: string }> = [
  { chave: "ativas", rotulo: "Ativas" },
  { chave: "todas", rotulo: "Todas" },
  { chave: "registrada", rotulo: ROTULO_STATUS.registrada },
  { chave: "triagem", rotulo: ROTULO_STATUS.triagem },
  { chave: "em_campo", rotulo: ROTULO_STATUS.em_campo },
  { chave: "vistoria_concluida", rotulo: ROTULO_STATUS.vistoria_concluida },
  { chave: "providencia_pendente", rotulo: ROTULO_STATUS.providencia_pendente },
  { chave: "encerrada", rotulo: ROTULO_STATUS.encerrada },
];

/**
 * Lista de ocorrências: busca, filtros e paginação.
 *
 * Os filtros vivem na URL de propósito. É o que faz um indicador do painel
 * abrir esta tela já filtrada, e é o que permite ao coordenador mandar o link
 * de uma visão específica para outra pessoa da equipe.
 */
export function Ocorrencias() {
  const sessao = useSessaoObrigatoria();
  const [params, setParams] = useSearchParams();
  const [linhas, setLinhas] = useState<LinhaOcorrencia[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [pagina, setPagina] = useState(1);

  const busca = params.get("busca") ?? "";
  const status = params.get("status") ?? "ativas";
  const severidade = params.get("severidade") ?? "todas";
  const soAtrasadas = params.get("atrasadas") === "1";

  const [rascunhoBusca, setRascunhoBusca] = useState(busca);
  useEffect(() => { setRascunhoBusca(busca); }, [busca]);

  useEffect(() => {
    let vivo = true;
    setLinhas(null);
    listarOcorrencias(sessao, {
      busca,
      status: status as StatusOcorrencia | "todas" | "ativas",
      severidade: severidade as Severidade | "todas",
    })
      .then((r) => { if (vivo) { setLinhas(r); setPagina(1); } })
      .catch((e: unknown) => { if (vivo) setErro(e instanceof Error ? e.message : String(e)); });
    return () => { vivo = false; };
  }, [sessao, busca, status, severidade]);

  // Trocar o filtro de atrasadas devolve para a primeira página, como todo
  // outro filtro já fazia. Ele é aplicado no cliente, então não passa pelo
  // efeito acima e precisava desta linha.
  useEffect(() => { setPagina(1); }, [soAtrasadas]);

  const filtradas = useMemo(() => {
    if (!linhas) return null;
    if (!soAtrasadas) return linhas;
    const agora = Date.now();
    return linhas.filter(
      (o) => o.status !== "encerrada" && o.prazo_em !== null && new Date(o.prazo_em).getTime() < agora,
    );
  }, [linhas, soAtrasadas]);

  function trocar(chave: string, valor: string | null) {
    const proximos = new URLSearchParams(params);
    if (valor === null || valor === "") proximos.delete(chave);
    else proximos.set(chave, valor);
    setParams(proximos, { replace: true });
  }

  if (erro) return <Aviso tom="perigo">Falha ao carregar as ocorrências: {erro}</Aviso>;

  const total = filtradas?.length ?? 0;
  const paginas = Math.max(1, Math.ceil(total / POR_PAGINA));

  /*
    A página é presa ao teto, e isto conserta um caso que mentia o número.

    "Só atrasadas" filtra no cliente, depois que a lista já chegou, e ele não
    entrava nas dependências do efeito que devolve a paginação para a primeira
    página. Quem estivesse na página 3 e clicasse no filtro com duas atrasadas
    ficava com `pagina` em 3 e `total` em 2: o recorte devolvia lista vazia, o
    estado vazio NÃO aparecia (porque o total não é zero), e o rodapé escrevia
    "Mostrando 21 a 2 de 2". A tabela ficava com cabeçalho e nenhuma linha.

    A leitura óbvia disso é "não tem nenhuma atrasada", e é exatamente o clique
    que o coordenador dá quando alguma coisa acabou de vencer.
  */
  const paginaSegura = Math.min(pagina, paginas);
  const visiveis = filtradas?.slice((paginaSegura - 1) * POR_PAGINA, paginaSegura * POR_PAGINA) ?? [];

  return (
    <>
      <div className="cabecalho-pagina">
        <div>
          <h1>Ocorrências</h1>
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

      <form
        className="filtros"
        role="search"
        onSubmit={(e) => { e.preventDefault(); trocar("busca", rascunhoBusca.trim() || null); }}
      >
        <label className="oculto-visualmente" htmlFor="filtro-busca">Buscar ocorrência</label>
        <input id="filtro-busca" type="search" value={rascunhoBusca}
               onChange={(e) => setRascunhoBusca(e.target.value)}
               placeholder="Protocolo, endereço, solicitante ou relato"
               className="campo--longo" />
        <button type="submit" className="botao botao--secundario">Buscar</button>
        {(busca || soAtrasadas || severidade !== "todas" || status !== "ativas") && (
          <button type="button" className="botao botao--discreto"
                  onClick={() => setParams(new URLSearchParams(), { replace: true })}>
            Limpar filtros
          </button>
        )}
      </form>

      <div className="filtros" role="group" aria-label="Filtrar por situação">
        {FILTROS_STATUS.map((f) => (
          <button key={f.chave} type="button" className="filtros__pilula"
                  aria-pressed={status === f.chave}
                  onClick={() => trocar("status", f.chave)}>
            {f.rotulo}
          </button>
        ))}
      </div>

      <div className="filtros" role="group" aria-label="Filtrar por severidade">
        <button type="button" className="filtros__pilula" aria-pressed={severidade === "todas"}
                onClick={() => trocar("severidade", null)}>
          Toda severidade
        </button>
        {SEVERIDADES.map((s) => (
          <button key={s} type="button" className="filtros__pilula" aria-pressed={severidade === s}
                  onClick={() => trocar("severidade", s)}>
            {ROTULO_SEVERIDADE[s]}
          </button>
        ))}
        <button type="button" className="filtros__pilula" aria-pressed={soAtrasadas}
                onClick={() => trocar("atrasadas", soAtrasadas ? null : "1")}>
          Só atrasadas
        </button>
      </div>

      <section className="cartao">
        {!filtradas ? (
          <Carregando />
        ) : total === 0 ? (
          <Vazio titulo="Nenhuma ocorrência com esses filtros">
            <p>Ajuste a busca ou volte para a visão de ativas.</p>
          </Vazio>
        ) : (
          <>
            <div className="tabela-envolucro">
              <table className="tabela">
                <caption className="oculto-visualmente">
                  {total} ocorrência(s) encontrada(s), página {pagina} de {paginas}
                </caption>
                <thead>
                  <tr>
                    <th scope="col">Protocolo</th>
                    <th scope="col">Tipo e endereço</th>
                    <th scope="col">Solicitante</th>
                    <th scope="col">Severidade</th>
                    <th scope="col">Situação</th>
                    <th scope="col">Prazo</th>
                  </tr>
                </thead>
                <tbody>
                  {visiveis.map((o) => (
                    <tr key={o.id}>
                      <td>
                        <Link className="tabela__protocolo" to={`/ocorrencias/${o.id}`}>{o.protocolo}</Link>
                        <div className="tabela__secundario">{formatarDataHora(o.criado_em)}</div>
                      </td>
                      <td>
                        <div>{ROTULO_TIPO_COBRADE[o.tipo]}</div>
                        <div className="tabela__secundario">{o.endereco}</div>
                      </td>
                      <td>
                        <div>{o.solicitante_nome}</div>
                        <div className="tabela__secundario">{o.solicitante_contato ?? "Sem contato"}</div>
                      </td>
                      <td><SeloSeveridade severidade={o.severidade} /></td>
                      <td><SeloStatus status={o.status} /></td>
                      <td>
                        <Prazo prazoEm={o.prazo_em} criadoEm={o.criado_em}
                               encerrada={o.status === "encerrada"} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="paginacao">
              <span>
                Mostrando {(paginaSegura - 1) * POR_PAGINA + 1} a {Math.min(paginaSegura * POR_PAGINA, total)} de {total}
              </span>
              <div className="paginacao__controles">
                <button type="button" className="botao botao--secundario"
                        disabled={paginaSegura === 1} onClick={() => setPagina(paginaSegura - 1)}>
                  Anterior
                </button>
                <button type="button" className="botao botao--secundario"
                        disabled={paginaSegura >= paginas} onClick={() => setPagina(paginaSegura + 1)}>
                  Próxima
                </button>
              </div>
            </div>
          </>
        )}
      </section>
    </>
  );
}
