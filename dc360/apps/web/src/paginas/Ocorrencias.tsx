import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  ROTULO_STATUS, SEVERIDADES, ROTULO_SEVERIDADE, podeExecutar,
  type Severidade, type StatusOcorrencia,
} from "@dc360/shared";
import {
  devolucoesPendentes, listarPaginaDeOcorrencias,
  type DevolucaoPendente, type PaginaDeOcorrencias,
} from "../dados/repositorio";
import { marcaDaLista, podeVerDevolucoes, porOcorrencia } from "../devolucao";
import { useSessaoObrigatoria } from "../estado/sessao";
import {
  Aviso, Carregando, Prazo, PrazoVenceEm, SeloSeveridade, SeloStatus, TipoDaOcorrencia,
  Vazio, formatarDataHora,
} from "../componentes/comuns";
import { IconeMais, IconeVoltar } from "../componentes/Icones";
import { useTitulo } from "../seo/titulo";

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
  useTitulo("Ocorrências");
  const sessao = useSessaoObrigatoria();
  const [params, setParams] = useSearchParams();
  const [dados, setDados] = useState<PaginaDeOcorrencias | null>(null);
  /**
   * As devolvidas do município inteiro, ou `null` enquanto não se sabe.
   *
   * São poucas por definição (uma devolução é um caso que espera decisão, não
   * um estado em que ocorrência fica), então a lista cabe inteira e serve para
   * marcar qualquer página sem uma consulta por linha.
   */
  const [devolvidas, setDevolvidas] = useState<DevolucaoPendente[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  /* "Tentar de novo" sem F5: o contador reinicia o efeito de carga. Ver o
     mesmo em `Painel.tsx`. */
  const [tentativa, setTentativa] = useState(0);

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
  }, [sessao, busca, status, severidade, soAtrasadas, pagina, tentativa]);

  /*
    A marcação vem de uma consulta própria, e o fracasso dela não derruba a
    lista. O `catch` foi escrito quando a rota das devolvidas ainda não existia
    no servidor, e continua aqui por uma razão diferente e deliberada: a marca
    é acessória, e trocar a tabela inteira por uma faixa de erro por causa de um
    rótulo embaixo de um selo seria pagar caro demais por ela.

    O que deixou de ser aceitável é o silêncio. `null` significa "não sei", e
    era desenhado igual a "nenhuma devolvida": a tela mostrava linhas limpas e
    o coordenador concluía que nada voltou do campo. Agora a falha tem estado
    próprio e frase própria acima da tabela. Ver o mesmo tratamento no painel.
  */
  const [marcaFalhou, setMarcaFalhou] = useState(false);
  useEffect(() => {
    let vivo = true;
    /* Papel sem `despachar_equipe` não pede a lista: ver `podeVerDevolucoes`. */
    if (!podeVerDevolucoes(sessao.papel)) {
      setDevolvidas([]); setMarcaFalhou(false);
      return () => { vivo = false; };
    }
    devolucoesPendentes(sessao)
      .then((d) => { if (!vivo) return; setDevolvidas(d); setMarcaFalhou(false); })
      .catch(() => { if (!vivo) return; setDevolvidas(null); setMarcaFalhou(true); });
    return () => { vivo = false; };
  }, [sessao]);

  const devolucaoPor = porOcorrencia(devolvidas);

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

  if (erro) {
    return (
      <Aviso tom="perigo">
        Falha ao carregar as ocorrências: {erro}{" "}
        <button type="button" className="botao botao--secundario"
                onClick={() => { setErro(null); setTentativa((t) => t + 1); }}>
          Tentar de novo
        </button>
      </Aviso>
    );
  }

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
        {/*
          O texto de exemplo é o único que se vê (o rótulo é só para quem ouve a
          tela), então ele tem de caber a 320 px: saía cortado em "...solicitante
          ou r" (revisão da correção 6 da V2-F00-E09), e "pessoa" no lugar de
          "solicitante" ainda cortava no WebKit ("...pessoa ou relat"), que guarda
          o lugar do "x" do campo de busca. A busca continua achando pelo nome do
          solicitante; o exemplo não precisa listar tudo.
        */}
        <input id="filtro-busca" type="search" value={rascunhoBusca}
               onChange={(e) => setRascunhoBusca(e.target.value)}
               placeholder="Protocolo, endereço ou relato"
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
        {/*
          A consulta das devolvidas falhou, e a lista diz isso em vez de fingir.
          Sem esta linha, ausência de marca por falha se lê exatamente como
          "nenhuma voltou do campo", e as duas pedem decisões opostas. Ícone e
          texto, nunca cor sozinha.
        */}
        {marcaFalhou && (
          <p className="tabela__secundario" style={{ marginTop: 0 }}>
            <IconeVoltar tamanho={12} />{" "}
            A consulta das ocorrências devolvidas do campo não respondeu agora.
            As linhas abaixo podem estar sem essa marca. Atualize a página para
            tentar de novo.
          </p>
        )}
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
                        {/*
                          Um chamado "outro" está ESPERANDO classificação, e
                          isso é diferente de um classificado. Impresso igual
                          aos outros oito no meio da coluna, ele lê como
                          decisão já tomada, e a linha que exige uma decisão de
                          quem está lendo é justamente a que desaparece.
                        */}
                        <div><TipoDaOcorrencia tipo={o.tipo} /></div>
                        <div className="tabela__secundario">{o.endereco}</div>
                      </td>
                      <td>
                        {/*
                          Só o nome. O contato não desce na lista desde
                          15/09/2026 (`LinhaDaListaDeOcorrencias`): a tabela
                          nunca precisou dele para nada, e listá-lo era ler
                          o telefone de cada família do município, página a
                          página, sem registro. Ele está na ocorrência.
                        */}
                        <div>{o.solicitante_nome}</div>
                      </td>
                      <td><SeloSeveridade severidade={o.severidade} /></td>
                      <td>
                        {/*
                          Devolvida volta para "Em triagem" e passa a parecer,
                          nesta coluna, igual à que nunca saiu do prédio. É o
                          contrário: nesta alguém já foi até lá, perdeu a
                          viagem, e o prazo continua vencido. Ícone e texto, e
                          nunca cor sozinha.
                        */}
                        <SeloStatus status={o.status} />
                        {devolucaoPor.has(o.id) && (
                          <div className="tabela__secundario">
                            <IconeVoltar tamanho={12} />{" "}
                            {marcaDaLista(devolucaoPor.get(o.id)!)}
                          </div>
                        )}
                      </td>
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
