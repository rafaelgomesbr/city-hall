import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { ROTULO_PAPEL, ROTULO_TIPO_COBRADE } from "@dc360/shared";
import { MODO, meuTrabalhoDeCampo, type MeuTrabalho as Trabalho } from "../dados/repositorio";
import { useSessaoObrigatoria } from "../estado/sessao";
import { useTitulo } from "../seo/titulo";
import {
  Aviso, Carregando, Cartao, Prazo, SeloSeveridade, SeloStatus, Vazio, formatarDataHora,
} from "../componentes/comuns";
import { filtrarTarefas } from "./meu-trabalho-regras";

/**
 * A tela do agente de campo.
 *
 * Antes desta página o agente entrava no sistema e caía no painel do
 * coordenador: a fila do município inteiro, o mapa da cidade, a tabela de
 * todas as ocorrências, e nenhuma ação disponível em lugar nenhum, porque o
 * papel dele não pode triar, despachar, encaminhar nem encerrar. Ele via tudo
 * o que não é da conta dele e nada do que é.
 *
 * Aqui estão as três perguntas que ele faz, na ordem em que faz:
 *
 * 1. **O que é meu agora?** As ocorrências despachadas para a equipe dele, com
 *    o prazo correndo, mais urgente primeiro.
 * 2. **O que eu já terminei?** As vistorias que ele assinou, com as duas
 *    marcas de tempo, que é onde aparece o que foi coletado sem sinal.
 * 3. **Quem é a minha equipe?** Nome, especialidade e colegas.
 *
 * E uma coisa que a tela precisa dizer com todas as letras: **este painel
 * exige conexão.** O trabalho sem sinal é o do aplicativo de campo, que ainda
 * não existe. Deixar isso implícito seria deixar um agente descobrir no
 * barranco, sem sinal, que o navegador não guarda nada.
 */
export function MeuTrabalho() {
  useTitulo("Meu trabalho");
  const sessao = useSessaoObrigatoria();
  const [dados, setDados] = useState<Trabalho | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  /*
    O `?busca=` que a caixa do topo manda ao dar Enter. A tela o ignorava, e
    quem digitava o protocolo chegava na lista inteira sem sinal de que a
    busca existiu. O filtro é sobre o que a tela já tem, sem consulta nova:
    a lista da equipe dele é curta por definição.
  */
  const [params, setParams] = useSearchParams();
  const busca = params.get("busca") ?? "";
  const [rascunhoBusca, setRascunhoBusca] = useState(busca);
  useEffect(() => { setRascunhoBusca(busca); }, [busca]);

  useEffect(() => {
    meuTrabalhoDeCampo(sessao)
      .then(setDados)
      .catch((e: unknown) => setErro(e instanceof Error ? e.message : String(e)));
  }, [sessao]);

  function trocarBusca(valor: string | null): void {
    const proximos = new URLSearchParams(params);
    if (!valor) proximos.delete("busca");
    else proximos.set("busca", valor);
    setParams(proximos, { replace: true });
  }

  if (erro) return <Aviso tom="perigo">{erro}</Aviso>;
  if (!dados) return <Carregando />;

  const { equipe, colegas, concluidas, totalConcluidas, tetoDeConcluidas } = dados;
  const designadas = filtrarTarefas(busca, dados.designadas);
  const escondidas = dados.designadas.length - designadas.length;

  return (
    <>
      <div className="cabecalho-pagina">
        <div>
          <h1>Meu trabalho</h1>
          <p>
            {equipe?.nome
              ? `${equipe.nome}, ${sessao.organizacaoNome}`
              : sessao.organizacaoNome}
          </p>
        </div>
        <div className="cabecalho-pagina__acoes">
          <span className="selo selo--info">
            {designadas.length === 1
              ? "1 vistoria para fazer"
              : `${designadas.length} vistorias para fazer`}
          </span>
        </div>
      </div>

      {/*
        O aviso mais importante da tela, e o primeiro. Um agente que assume que
        isto funciona sem sinal perde a vistoria inteira.
      */}
      <Aviso tom="alerta">
        <strong>Este painel precisa de conexão.</strong> Ele serve para se
        preparar antes de sair e para conferir o que já foi feito depois de
        voltar. A coleta em área sem sinal é feita no aplicativo de campo, que
        guarda tudo no aparelho e envia sozinho quando o aplicativo está aberto e o
        sinal volta.
      </Aviso>

      {!equipe && (
        <Aviso tom="info">
          Você ainda não está em nenhuma equipe, e é por isso que não há
          vistoria designada aqui. Quem resolve isso é a coordenação do
          município: peça para incluírem você numa equipe.
        </Aviso>
      )}

      <Cartao titulo="Vistorias designadas para a minha equipe">
        <form
          className="filtros"
          role="search"
          onSubmit={(e) => { e.preventDefault(); trocarBusca(rascunhoBusca.trim() || null); }}
        >
          <label className="oculto-visualmente" htmlFor="meu-trabalho-busca">
            Buscar entre as minhas vistorias
          </label>
          <input id="meu-trabalho-busca" type="search" value={rascunhoBusca}
                 onChange={(e) => setRascunhoBusca(e.target.value)}
                 placeholder="Protocolo ou endereço"
                 className="campo--longo" />
          <button type="submit" className="botao botao--secundario">Buscar</button>
          {busca && (
            <button type="button" className="botao botao--discreto"
                    onClick={() => trocarBusca(null)}>
              Limpar
            </button>
          )}
        </form>
        {/*
          O filtro é dito em voz alta, com o que ficou de fora: uma lista
          curta por causa de um `?busca=` que a pessoa não vê é lida como
          "só tenho uma vistoria", que é a conclusão errada.
        */}
        {busca && (
          <p className="tabela__secundario" style={{ marginTop: 0 }} aria-live="polite">
            {`Filtrando por “${busca}”`}
            {escondidas > 0
              ? `: ${escondidas} ${escondidas === 1 ? "vistoria escondida" : "vistorias escondidas"}.`
              : "."}
          </p>
        )}
        {designadas.length === 0 && busca ? (
          <Vazio titulo={`Nenhuma vistoria sua casa com “${busca}”`}>
            A busca olha protocolo e endereço das vistorias designadas para a
            sua equipe. Limpe o filtro para ver todas.
          </Vazio>
        ) : designadas.length === 0 ? (
          <Vazio titulo="Nenhuma vistoria em campo agora">
            Quando a coordenação despachar uma ocorrência para a sua equipe,
            ela aparece aqui com o prazo correndo.
          </Vazio>
        ) : (
          <div className="tabela-envolucro">
            <table className="tabela">
              <thead>
                <tr>
                  <th scope="col">Protocolo</th>
                  <th scope="col">Tipo</th>
                  <th scope="col">Endereço</th>
                  <th scope="col">Severidade</th>
                  <th scope="col">Prazo</th>
                </tr>
              </thead>
              <tbody>
                {designadas.map((o) => (
                  <tr key={o.id}>
                    <td>
                      <Link className="mono" to={`/ocorrencias/${o.id}`}>{o.protocolo}</Link>
                      {o.vulnerabilidade_presente && (
                        <>
                          <br />
                          <span className="tabela__secundario">
                            Vulnerabilidade social registrada
                          </span>
                        </>
                      )}
                    </td>
                    <td>{ROTULO_TIPO_COBRADE[o.tipo]}</td>
                    <td>
                      {o.endereco}
                      <br />
                      <span className="tabela__secundario">
                        Solicitante: {o.solicitante_nome}
                      </span>
                    </td>
                    <td><SeloSeveridade severidade={o.severidade} /></td>
                    <td><Prazo prazoEm={o.prazo_em} criadoEm={o.criado_em}
                               encerrada={false} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Cartao>

      {/*
        O NUMERO DO TITULO E O TOTAL, e nao o tamanho da lista.

        Antes ele imprimia o tamanho da lista, e as duas pontas cortam em
        cinquenta: um agente com sessenta e duas vistorias lia "(50)", e as doze
        mais antigas nao apareciam em lugar nenhum do produto, sem rodape, sem
        aviso e sem "ver mais". Se ele precisasse mostrar que vistoriou aquele
        imovel em janeiro, a tela AFIRMAVA que ele nunca vistoriou. Esta e a
        tela do registro do trabalho dele, e e o que ele leva quando o ato for
        questionado.
      */}
      <Cartao titulo={`Vistorias que eu concluí (${totalConcluidas})`}>
        {concluidas.length === 0 ? (
          <Vazio titulo="Você ainda não concluiu nenhuma vistoria">
            {MODO === "local"
              ? "No modo local a vistoria é registrada pelo aplicativo de campo, que ainda não existe."
              : "Assim que você concluir a primeira, ela aparece aqui com data e hora."}
          </Vazio>
        ) : (
          <div className="tabela-envolucro">
            <table className="tabela">
              <thead>
                <tr>
                  <th scope="col">Protocolo</th>
                  <th scope="col">Endereço</th>
                  <th scope="col">Coletada em campo</th>
                  <th scope="col">Recebida pelo sistema</th>
                  <th scope="col">Situação hoje</th>
                </tr>
              </thead>
              <tbody>
                {concluidas.map((v) => {
                  /*
                    Um minuto de folga: diferença menor que isso é latência de
                    rede, não coleta offline, e marcar como offline poluiria a
                    lista sem informar nada.
                  */
                  const offline =
                    new Date(v.sincronizada_em).getTime() -
                    new Date(v.coletada_em).getTime() > 60_000;
                  return (
                    <tr key={v.id}>
                      <td>
                        <Link className="mono" to={`/ocorrencias/${v.ocorrencia_id}`}>
                          {v.protocolo}
                        </Link>
                      </td>
                      <td>{v.endereco}</td>
                      <td>{formatarDataHora(v.coletada_em)}</td>
                      <td>
                        {formatarDataHora(v.sincronizada_em)}
                        {offline && (
                          <>
                            <br />
                            <span className="tabela__secundario">
                              Coletada sem sinal e enviada depois
                            </span>
                          </>
                        )}
                      </td>
                      <td><SeloStatus status={v.status} /></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        {totalConcluidas > tetoDeConcluidas && (
          <Aviso tom="info">
            {`Mostrando as ${tetoDeConcluidas} mais recentes. Outras `}
            {totalConcluidas - tetoDeConcluidas}
            {" estão registradas e não cabem nesta lista."}
          </Aviso>
        )}
      </Cartao>

      {equipe && (
        <Cartao titulo="Minha equipe">
          <div className="linha-campos">
            <div className="par">
              <span className="par__rotulo">Equipe</span>
              <span className="par__valor">{equipe.nome}</span>
            </div>
            <div className="par">
              <span className="par__rotulo">Especialidade</span>
              <span className="par__valor">{equipe.especialidade ?? "Geral"}</span>
            </div>
            <div className="par">
              <span className="par__rotulo">Situação</span>
              <span className="par__valor">{equipe.ativa ? "Ativa" : "Inativa"}</span>
            </div>
          </div>

          <ul className="lista-papeis">
            {colegas.map((c) => (
              <li key={c.id}>
                {c.nome}
                {c.id === sessao.usuarioId && " (você)"}
                <span className="tabela__secundario"> {ROTULO_PAPEL[c.papel]}</span>
              </li>
            ))}
          </ul>
        </Cartao>
      )}
    </>
  );
}
