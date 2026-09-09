import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  ROTULO_STATUS, ROTULO_TIPO_COBRADE, SEVERIDADES, ROTULO_SEVERIDADE, podeExecutar,
  type Severidade, type StatusOcorrencia,
} from "@dc360/shared";
import { listarPaginaDeOcorrencias, type PaginaDeOcorrencias } from "../dados/repositorio";
import { useSessaoObrigatoria } from "../estado/sessao";
import {
  Aviso, Carregando, Prazo, PrazoVenceEm, SeloSeveridade, SeloStatus, Vazio, formatarDataHora,
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
  const [dados, setDados] = useState<PaginaDeOcorrencias | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  const busca = params.get("busca") ?? "";
  const status = params.get("status") ?? "ativas";
  const severidade = params.get("severidade") ?? "todas";
  const soAtrasadas = params.get("atrasadas") === "1";
  /*
    A página vive na URL junto com os filtros, pelo mesmo motivo que eles: o
    link que o coordenador manda para a equipe precisa reabrir a MESMA tela.
    Guardá-la em estado, com os filtros na URL, também deixava as duas fontes
    saírem de sincronia quando o painel abria esta tela já filtrada.
  */
  const pagina = Math.max(1, Math.trunc(Number(params.get("pagina") ?? "1")) || 1);

  const [rascunhoBusca, setRascunhoBusca] = useState(busca);
  useEffect(() => { setRascunhoBusca(busca); }, [busca]);

  /*
    Busca, filtros e página vão TODOS para o servidor.

    Antes, a tela baixava as cem primeiras e peneirava as atrasadas aqui, no
    navegador. Isso mentia duas vezes: mostrava só as atrasadas que couberam
    nas cem, e contava essas no rodapé. Numa enxurrada, o painel dizia trinta
    atrasadas e a lista dizia doze, sem nada na tela explicando a diferença.
  */
  useEffect(() => {
    let vivo = true;
    setDados(null);
    listarPaginaDeOcorrencias(sessao, {
      busca,
      status: status as StatusOcorrencia | "todas" | "ativas",
      severidade: severidade as Severidade | "todas",
      atrasadas: soAtrasadas,
      pagina,
      porPagina: POR_PAGINA,
    })
      .then((r) => { if (vivo) setDados(r); })
      .catch((e: unknown) => { if (vivo) setErro(e instanceof Error ? e.message : String(e)); });
    return () => { vivo = false; };
  }, [sessao, busca, status, severidade, soAtrasadas, pagina]);

  function trocar(chave: string, valor: string | null) {
    const proximos = new URLSearchParams(params);
    if (valor === null || valor === "") proximos.delete(chave);
    else proximos.set(chave, valor);
    /*
      Trocar qualquer filtro devolve para a primeira página.

      Continuar na página 3 do filtro anterior dava tabela com cabeçalho e
      nenhuma linha, e a leitura óbvia disso é "não tem nenhuma", que é
      justamente a conclusão errada no clique que o coordenador dá quando
      alguma coisa acabou de vencer.
    */
    if (chave !== "pagina") proximos.delete("pagina");
    setParams(proximos, { replace: true });
  }

  const total = dados?.total ?? 0;
  const paginas = Math.max(1, Math.ceil(total / POR_PAGINA));

  /*
    Página além do fim se corrige sozinha.

    Com a paginação no servidor, a lista pode encurtar embaixo de quem está na
    página 3 (alguém encerrou, alguém respondeu a providência). O servidor
    devolve zero linhas e o total verdadeiro, e é por isso que o total precisa
    vir junto: sem ele a tela só saberia dizer "nenhuma ocorrência" com a
    cidade cheia.
  */
  useEffect(() => {
    if (dados && dados.itens.length === 0 && dados.total > 0 && pagina > paginas) {
      trocar("pagina", String(paginas));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dados, pagina, paginas]);

  if (erro) return <Aviso tom="perigo">Falha ao carregar as ocorrências: {erro}</Aviso>;

  const visiveis = dados?.itens ?? [];

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
        {!dados ? (
          <Carregando />
        ) : total === 0 ? (
          <Vazio titulo="Nenhuma ocorrência com esses filtros">
            <p>Ajuste a busca ou volte para a visão de ativas.</p>
          </Vazio>
        ) : visiveis.length === 0 ? (
          /*
            Página vazia com total cheio: o efeito acima já está trazendo a
            página certa. Desenhar a tabela neste instante daria cabeçalho sem
            linha nenhuma e um rodapé dizendo "Mostrando 21 a 2 de 2", que se
            lê como "não tem nenhuma" bem na hora em que existem.
          */
          <Carregando mensagem="Ajustando a página" />
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
                    <th scope="col">Vence em</th>
                    <th scope="col">Restam</th>
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
                        <PrazoVenceEm prazoEm={o.prazo_em}
                                      encerrada={o.status === "encerrada"} />
                      </td>
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
              {/*
                O total é o do SERVIDOR, contado sobre o mesmo filtro. Ele é a
                diferença entre "estas são as ocorrências" e "estas são as que
                couberam nesta página", e essa frase é a única coisa que impede
                o coordenador de achar que viu a cidade inteira.
              */}
              <span aria-live="polite">
                Mostrando {(pagina - 1) * POR_PAGINA + 1} a {Math.min(pagina * POR_PAGINA, total)} de {total}
                {" "}ocorrência(s), página {pagina} de {paginas}
              </span>
              <div className="paginacao__controles">
                <button type="button" className="botao botao--secundario"
                        disabled={pagina === 1} onClick={() => trocar("pagina", String(pagina - 1))}>
                  Anterior
                </button>
                <button type="button" className="botao botao--secundario"
                        disabled={pagina >= paginas} onClick={() => trocar("pagina", String(pagina + 1))}>
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
