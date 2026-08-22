import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ROTULO_PAPEL, ROTULO_TIPO_COBRADE } from "@dc360/shared";
import { MODO, meuTrabalhoDeCampo, type MeuTrabalho as Trabalho } from "../dados/repositorio";
import { useSessaoObrigatoria } from "../estado/sessao";
import {
  Aviso, Carregando, Cartao, Prazo, SeloSeveridade, SeloStatus, Vazio, formatarDataHora,
} from "../componentes/comuns";

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
  const sessao = useSessaoObrigatoria();
  const [dados, setDados] = useState<Trabalho | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    meuTrabalhoDeCampo(sessao)
      .then(setDados)
      .catch((e: unknown) => setErro(e instanceof Error ? e.message : String(e)));
  }, [sessao]);

  if (erro) return <Aviso tom="perigo">{erro}</Aviso>;
  if (!dados) return <Carregando />;

  const { equipe, colegas, designadas, concluidas } = dados;

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
        guarda tudo no aparelho e envia sozinho quando o sinal volta.
      </Aviso>

      {!equipe && (
        <Aviso tom="info">
          Você ainda não está em nenhuma equipe, e é por isso que não há
          vistoria designada aqui. Quem resolve isso é a coordenação do
          município: peça para incluírem você numa equipe.
        </Aviso>
      )}

      <Cartao titulo="Vistorias designadas para a minha equipe">
        {designadas.length === 0 ? (
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

      <Cartao titulo={`Vistorias que eu concluí (${concluidas.length})`}>
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
