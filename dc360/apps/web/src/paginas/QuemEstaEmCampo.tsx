import { useCallback, useEffect, useState } from "react";
import {
  DESFECHOS_DA_COORDENACAO,
  ROTULO_DESFECHO_DE_SAIDA,
  encerramentoDeSaidaSchema,
  type DesfechoDeSaida,
} from "@dc360/shared";
import {
  encerrarSaidaEmCampo, quemEstaEmCampo,
  type QuemEstaEmCampo as Situacao, type SaidaEmCampo,
} from "../dados/repositorio";
import { useSessaoObrigatoria } from "../estado/sessao";
import {
  Aviso, Carregando, Cartao, SeloSeveridade, Vazio, formatarDataHora,
} from "../componentes/comuns";
import { Campo } from "../componentes/Campo";
import { useTitulo } from "../seo/titulo";

/**
 * Quem está em campo agora, e quem estourou o prazo.
 *
 * =====================================================================
 * POR QUE ESTA TELA EXISTE
 * =====================================================================
 *
 * O vocabulário deste produto reconhece, por escrito e desde a migração 028,
 * que o agente entra em lugar que oferece risco à integridade física dele:
 * `risco_para_a_equipe` é um dos seis motivos de devolução de tarefa. E não
 * existia nada para o caso de ele ter entrado. O agente subia o morro sozinho,
 * sem sinal, para vistoriar um talude que acabara de escorregar, e nada no
 * sistema mudava de cor se ele não descesse.
 *
 * =====================================================================
 * O QUE ESTA TELA NÃO É, E ELA DIZ ISSO EM VOZ ALTA
 * =====================================================================
 *
 * Ela não é um painel de monitoramento. O produto não sabe onde a pessoa está
 * agora, não detecta queda, não detecta imobilidade e não aciona ninguém
 * sozinho. Ela mostra o que os agentes DECLARARAM antes de sair, e o relógio.
 *
 * Isso não é rodapé em letra miúda: a frase de limite fica no topo, fixa, em
 * todos os estados da tela, inclusive no estado vazio. Uma tela de segurança
 * que promete mais do que cumpre é pior que tela nenhuma, porque a coordenação
 * passa a confiar num alarme que não existe e para de telefonar.
 *
 * A palavra que a tela usa é "prazo estourado", nunca "em perigo". "Vencida"
 * quer dizer exatamente uma coisa: ninguém teve notícia dele desde o prazo que
 * ele mesmo declarou. Pode ser um talude cedendo e pode ser bateria acabada, e
 * a tela não sabe qual dos dois é.
 *
 * =====================================================================
 * NUNCA SÓ POR COR
 * =====================================================================
 *
 * Regra da casa, e aqui ela decide o desenho: "sozinho", "prazo estourado" e o
 * atraso em minutos aparecem ESCRITOS, em palavra, ao lado do selo. Um selo
 * vermelho sozinho é invisível para quem não distingue vermelho, e esta é a
 * última tela do produto em que isso poderia ser tratado como detalhe.
 */

function mensagemDoErro(erro: unknown): string {
  return erro instanceof Error ? erro.message : String(erro);
}

/**
 * De quanto em quanto tempo a tela se refaz sozinha, em milissegundos.
 *
 * Sessenta segundos, e o número tem razão nos dois sentidos. Mais curto seria
 * desperdício: um prazo que estoura não muda nada dentro de um minuto. Mais
 * longo transformaria "prazo estourado há 1 minuto" numa informação que só
 * aparece cinco minutos depois, e esta é a única tela do produto em que cinco
 * minutos de atraso podem importar.
 *
 * Isso NÃO substitui alguém olhando. A tela que ninguém abriu não atualiza
 * coisa nenhuma, e é por isso que o limite escrito no topo diz o que diz.
 */
const INTERVALO_DE_ATUALIZACAO_MS = 60_000;

/** Minutos viram uma frase que se lê de relance, e nunca "137 min". */
function comoAtraso(minutos: number): string {
  if (minutos < 1) return "menos de um minuto";
  if (minutos < 60) return `${minutos} ${minutos === 1 ? "minuto" : "minutos"}`;
  const horas = Math.floor(minutos / 60);
  const resto = minutos % 60;
  const parteHoras = `${horas} ${horas === 1 ? "hora" : "horas"}`;
  return resto === 0 ? parteHoras : `${parteHoras} e ${resto} min`;
}

export function QuemEstaEmCampo() {
  useTitulo("Quem está em campo");
  const sessao = useSessaoObrigatoria();
  const [situacao, setSituacao] = useState<Situacao | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [aEncerrar, setAEncerrar] = useState<SaidaEmCampo | null>(null);
  const [desfecho, setDesfecho] = useState<DesfechoDeSaida | "">("");
  const [observacao, setObservacao] = useState("");
  const [erroDoFormulario, setErroDoFormulario] = useState<string | null>(null);
  const [gravando, setGravando] = useState(false);

  const recarregar = useCallback(async () => {
    setSituacao(await quemEstaEmCampo(sessao));
  }, [sessao]);

  useEffect(() => {
    let vivo = true;
    const buscar = () => {
      recarregar().catch((e: unknown) => { if (vivo) setErro(mensagemDoErro(e)); });
    };
    buscar();
    const relogio = setInterval(buscar, INTERVALO_DE_ATUALIZACAO_MS);
    return () => { vivo = false; clearInterval(relogio); };
  }, [recarregar]);

  /*
    Trocar de saída no meio da pergunta limpa o desfecho e o texto, pela mesma
    razão do catálogo de órgãos: a explicação escrita sobre um agente não pode
    acabar gravada na linha de outro, e esta é a linha que uma apuração lê.
  */
  function abrirEncerramento(saida: SaidaEmCampo): void {
    setAEncerrar(saida);
    setDesfecho("");
    setObservacao("");
    setErroDoFormulario(null);
  }

  async function confirmarEncerramento(evento: React.FormEvent): Promise<void> {
    evento.preventDefault();
    if (!aEncerrar || desfecho === "") return;

    /*
      A validação é a MESMA do servidor, importada e não reescrita: o esquema
      compartilhado é quem exige dizer o que foi acionado quando o desfecho é
      "acionei apoio". Reimplementar a regra aqui produziria duas versões dela,
      e a da tela envelheceria sozinha.
    */
    const conferido = encerramentoDeSaidaSchema.safeParse({
      saidaId: aEncerrar.id,
      desfecho,
      observacao: observacao.trim() === "" ? undefined : observacao.trim(),
    });
    if (!conferido.success) {
      setErroDoFormulario(conferido.error.issues[0]?.message ?? "Confira os campos.");
      return;
    }

    setGravando(true);
    setErroDoFormulario(null);
    try {
      await encerrarSaidaEmCampo(sessao, conferido.data);
      setAEncerrar(null);
      await recarregar();
    } catch (e: unknown) {
      setErroDoFormulario(mensagemDoErro(e));
    } finally {
      setGravando(false);
    }
  }

  return (
    <>
      <div className="cabecalho-pagina">
        <div>
          <h1>Quem está em campo</h1>
          <p>
            O que os agentes declararam antes de sair, e o prazo de retorno que
            eles mesmos informaram.
          </p>
        </div>
      </div>

      {/*
        O LIMITE FICA NO TOPO E EM TODOS OS ESTADOS, inclusive no vazio.

        Ele vem do servidor (`situacao.limite`) para ser a mesma frase no painel,
        no aplicativo e no documento. Enquanto a primeira carga não chega, a tela
        mostra a versão local: um instante sem a ressalva seria um instante em
        que a tela promete mais do que cumpre.
      */}
      <Aviso tom="info">
        {situacao?.limite
          ?? "Esta lista mostra o que os agentes declararam, e nada além disso. "
          + "O sistema não detecta queda, não sabe onde a pessoa está agora e "
          + "não aciona ninguém sozinho."}
      </Aviso>

      {erro && <Aviso tom="perigo">{erro}</Aviso>}

      {!situacao && !erro && <Carregando mensagem="Carregando quem está em campo" />}

      {situacao && situacao.itens.length === 0 && (
        <Vazio titulo="Ninguém declarou saída a campo">
          Declarar a saída é um passo do aplicativo do agente, feito na base e
          com sinal. Lista vazia significa que ninguém declarou, e não que
          ninguém está na rua.
        </Vazio>
      )}

      {situacao && situacao.itens.length > 0 && (
        <Cartao titulo={`${situacao.emCampo} em campo, ${situacao.vencidas} com prazo estourado`}>
          <div className="tabela-envolucro">
            <table className="tabela">
              <thead>
                <tr>
                  <th scope="col">Agente</th>
                  <th scope="col">Protocolo e endereço</th>
                  <th scope="col">Saiu</th>
                  <th scope="col">Retorno previsto</th>
                  <th scope="col">Situação</th>
                  <th scope="col">
                    {/* Cabeçalho vazio confunde leitor de tela: ele lê a coluna
                        inteira sem saber do que ela trata. */}
                    <span className="oculto-visualmente">Ações</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {situacao.itens.map((s) => (
                  <tr key={s.id}>
                    <td>
                      <div className="tabela__principal">{s.agenteNome}</div>
                      <div className="tabela__secundario">
                        {/*
                          "Sozinho" ESCRITO, e não só um ícone ou uma cor.
                          Trabalhar sozinho é a categoria inteira de risco de
                          que esta tela trata, e é o que decide se a coordenação
                          larga o que está fazendo.
                        */}
                        {s.sozinho ? "Foi sozinho" : "Foi acompanhado"}
                        {s.equipeNome ? `, ${s.equipeNome}` : ""}
                      </div>
                    </td>
                    <td>
                      <div className="tabela__principal mono">{s.protocolo}</div>
                      <div className="tabela__secundario">{s.endereco}</div>
                    </td>
                    <td>
                      <div className="tabela__principal">{formatarDataHora(s.registradaEm)}</div>
                      <div className="tabela__secundario">
                        Disse que voltaria em {comoAtraso(s.duracaoMinutos)}
                      </div>
                    </td>
                    <td>
                      <div className="tabela__principal">
                        {formatarDataHora(s.retornoPrevistoEm)}
                      </div>
                      {/*
                        A prorrogação aparece, e aparece contada. Uma saída
                        prorrogada quatro vezes conta uma história diferente de
                        uma que nasceu com o prazo longo, e sem este número as
                        duas ficariam idênticas na tela.
                      */}
                      {s.prorrogacoes > 0 && (
                        <div className="tabela__secundario">
                          Prorrogada {s.prorrogacoes}{" "}
                          {s.prorrogacoes === 1 ? "vez" : "vezes"}. Combinado
                          original: {formatarDataHora(s.retornoPrevistoInicial)}
                        </div>
                      )}
                    </td>
                    <td>
                      {s.vencida ? (
                        <>
                          <span className="selo selo--perigo">
                            <span className="selo__ponto" aria-hidden="true" />
                            Prazo estourado
                          </span>
                          <div className="tabela__secundario">
                            Sem confirmação há {comoAtraso(s.atrasoEmMinutos)}
                          </div>
                        </>
                      ) : (
                        <span className="selo selo--sucesso">
                          <span className="selo__ponto" aria-hidden="true" />
                          Dentro do prazo
                        </span>
                      )}
                      <div className="tabela__secundario">
                        <SeloSeveridade severidade={s.severidade} />
                      </div>
                    </td>
                    <td>
                      <button
                        type="button"
                        className="botao botao--secundario"
                        onClick={() => abrirEncerramento(s)}
                      >
                        Encerrar saída
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Cartao>
      )}

      {/*
        O ENCERRAMENTO É O ATO QUE ESTE RECURSO EXISTE PARA REGISTRAR.

        A pergunta que uma apuração faz não é "houve alerta", é "o que fizeram
        quando ele apareceu". Sem este formulário, a única coisa que o produto
        guardaria sobre a segurança de um servidor seria o alerta, e seis meses
        depois "a prefeitura não fez nada" passaria a valer para o próprio
        agente da prefeitura.

        "O agente confirmou o retorno" NÃO está na lista, e a ausência é a
        regra: quem diz "voltei" é quem voltou. A coordenação que sabe que ele
        voltou registra COMO soube.
      */}
      {aEncerrar && (
        <Cartao titulo={`Encerrar a saída de ${aEncerrar.agenteNome}`}>
          <form onSubmit={(e) => { void confirmarEncerramento(e); }}>
            <fieldset>
              <legend>O que houve</legend>
              {DESFECHOS_DA_COORDENACAO.map((d) => (
                <label key={d} className="caixa-marcacao">
                  <input
                    type="radio"
                    name="desfecho-da-saida"
                    value={d}
                    checked={desfecho === d}
                    onChange={() => setDesfecho(d)}
                  />
                  {ROTULO_DESFECHO_DE_SAIDA[d]}
                </label>
              ))}
            </fieldset>

            {/*
              OPCIONAL de verdade, e não por comodidade: três dos quatro
              desfechos se explicam sozinhos. O único que exige texto é "acionei
              apoio", e quem cobra isso é o esquema compartilhado e o CHECK do
              banco, nesta ordem, e não um `required` que valeria para todos.

              A DICA diz o que se escreve aqui, e ela não é conselho de redação:
              esta coluna fica FORA da minimização por prazo de propósito,
              porque o sujeito dela é agente público no exercício da função. Se
              ela virar o lugar onde se conta a história da família, aquela
              decisão deixa de valer. Ver a migração 031.
            */}
            <Campo
              id="observacao-da-saida"
              rotulo="O que foi feito"
              opcional
              dica="Quem foi acionado, e a que horas. Não escreva dados do morador aqui."
            >
              {(campo) => (
                <textarea
                  {...campo}
                  value={observacao}
                  maxLength={300}
                  rows={3}
                  onChange={(e) => setObservacao(e.target.value)}
                />
              )}
            </Campo>

            {erroDoFormulario && <Aviso tom="perigo">{erroDoFormulario}</Aviso>}

            <div className="linha-campos">
              <button
                type="submit"
                className="botao botao--primario"
                disabled={gravando || desfecho === ""}
              >
                {gravando ? "Registrando" : "Registrar e encerrar"}
              </button>
              <button
                type="button"
                className="botao botao--discreto"
                onClick={() => setAEncerrar(null)}
              >
                Cancelar
              </button>
            </div>
          </form>
        </Cartao>
      )}
    </>
  );
}
