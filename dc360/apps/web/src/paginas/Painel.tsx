import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { podeExecutar } from "@dc360/shared";
import {
  indicadores as carregarIndicadores,
  listarOcorrencias,
  providenciasPendentes,
  devolucoesPendentes,
  imoveisInterditados,
  type Indicadores,
  type LinhaDaListaDeOcorrencias,
  type ImovelInterditado,
  type ProvidenciaPendente,
  type DevolucaoPendente,
} from "../dados/repositorio";
import { avisoDoPainel, marcaDaLista, porOcorrencia } from "../devolucao";
import { useSessaoObrigatoria } from "../estado/sessao";
import {
  Aviso, Carregando, Cartao, Prazo, SeloSeveridade, SeloStatus, TipoDaOcorrencia, Vazio,
  formatarDataHora,
} from "../componentes/comuns";
import { IconeMais, IconeVoltar } from "../componentes/Icones";
import { useTitulo } from "../seo/titulo";

/**
 * Quantas linhas cada cartao de apoio do painel desenha.
 *
 * O painel e tela de olhar de relance, entao um cartao com quarenta linhas
 * deixa de ser resumo. O numero e pequeno de proposito; o que nao pode e ele
 * cortar em silencio, e por isso quem passa dele ganha aviso com a contagem do
 * que ficou de fora.
 */
const TETO_DA_PREVIA = 8;

/**
 * De quanto em quanto tempo o painel busca de novo, com a aba a vista.
 *
 * Um minuto, e nao os trinta segundos do sino: o painel faz cinco consultas e
 * uma delas lista as ocorrencias ativas inteiras. Um minuto e curto o bastante
 * para o numero na tela nunca estar mais de um minuto velho, e longo o bastante
 * para nao pesar no dia de pico, que e justamente o dia em que a tela importa.
 */
const INTERVALO_DE_ATUALIZACAO_MS = 60_000;

/**
 * Painel do coordenador. A pergunta que ele responde ao ser aberto de manhã é
 * uma só: o que exige decisão agora?
 *
 * Por isso a ordem é atenção primeiro (críticas e atrasadas em destaque),
 * volume depois. Cada indicador é clicável e leva à lista já filtrada: número
 * que não leva a lugar nenhum é enfeite.
 */
export function Painel() {
  useTitulo("Painel");
  const sessao = useSessaoObrigatoria();
  const navegar = useNavigate();
  const [dados, setDados] = useState<{
    ind: Indicadores;
    fila: LinhaDaListaDeOcorrencias[];
    providencias: ProvidenciaPendente[];
    interditados: ImovelInterditado[];
    /**
     * As devolvidas, ou `null` quando a consulta não respondeu.
     *
     * Lista vazia é "nenhuma voltou do campo"; `null` é "não sei". Colapsar os
     * dois faria a fila afirmar que nada foi devolvido justamente quando a
     * pergunta não pôde ser feita.
     */
    devolvidas: DevolucaoPendente[] | null;
  } | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [carregadoEm, setCarregadoEm] = useState<Date | null>(null);
  /*
    "Tentar de novo" sem recarregar a página. Com o servidor fora, a tela
    ficava numa faixa vermelha sem saída: o relógio de um minuto só corre
    depois de a primeira busca dar certo, e a única ação era o F5, que
    ninguém sabe que resolve. O contador reinicia o efeito de carga.
  */
  const [tentativa, setTentativa] = useState(0);

  /*
    O PAINEL SE ATUALIZA, e DIZ de quando sao os numeros.

    Antes ele carregava uma vez ao montar e nunca mais: sem botao de atualizar,
    sem relogio, sem marca de hora. Enquanto isso o sino, no MESMO cabecalho,
    consulta o servidor a cada trinta segundos. As 8h a coordenadora abria o
    painel com "Atrasadas 3"; as 11h o sino mostrava dezessete avisos por ler,
    varios de prazo vencido, e os cartoes ao lado continuavam dizendo 3. Pior
    nos prazos: `Restam 4 h` e calculado no instante da renderizacao, entao ele
    congela e passa a mentir por horas.

    Numero errado numa tela de decisao operacional e o defeito recorrente deste
    produto, e aqui ele nem avisava que estava velho.

    A janela e de um minuto, e nao de trinta segundos como a do sino: o painel
    faz cinco consultas e uma delas lista as ocorrencias ativas inteiras. E
    aba escondida NAO consulta, porque coordenador deixa o painel aberto o dia
    todo numa aba de fundo, e mil e quatrocentas requisicoes por dia por pessoa,
    a troco de nada, sao o tipo de coisa que derruba o teto de requisicao.
  */
  useEffect(() => {
    let vivo = true;

    const buscar = () => {
      Promise.all([
        carregarIndicadores(sessao),
        listarOcorrencias(sessao, { status: "ativas" }),
        providenciasPendentes(sessao),
        imoveisInterditados(sessao),
        /*
          A ÚNICA das cinco que falha para dentro, e agora por decisão e não
          por andaime.

          O `catch` nasceu porque a rota não existia: até semana passada o modo
          com servidor respondia 404 aqui, e engolir era a forma de a tela viver
          sem um recurso que faltava. A rota existe. Engolir continua certo, mas
          por outro motivo: a marca é acessória, e derrubar a fila inteira por
          ela trocaria a tela que o coordenador abre de manhã por uma faixa
          vermelha, por causa de um rótulo embaixo de um selo.

          O que mudou é que a falha deixou de ser invisível. `null` quer dizer
          "não sei", e a tela passa a dizer isso em voz alta logo acima da fila,
          em vez de desenhar linhas sem marca com cara de linhas sem devolução.
          Marca ausente por falha é indistinguível de nada devolvido, e essa
          confusão custa uma equipe mandada para um endereço que já derrubou
          uma viagem.
        */
        devolucoesPendentes(sessao).catch(() => null),
      ])
        .then(([ind, fila, providencias, interditados, devolvidas]) => {
          if (!vivo) return;
          setDados({
            ind, fila,
            providencias: providencias as ProvidenciaPendente[],
            interditados: interditados as ImovelInterditado[],
            devolvidas,
          });
          setCarregadoEm(new Date());
          /* Uma busca boa apaga o erro da anterior: erro que fica pendurado
             depois de a rede voltar e o painel mentindo na outra direcao. */
          setErro(null);
        })
        .catch((e: unknown) => { if (vivo) setErro(e instanceof Error ? e.message : String(e)); });
    };

    buscar();
    const relogio = setInterval(() => {
      if (!document.hidden) buscar();
    }, INTERVALO_DE_ATUALIZACAO_MS);
    /* Voltar para a aba busca na hora: quem volta depois de uma hora quer o
       numero de agora, e nao esperar o proximo tique. */
    const aoVoltar = () => { if (!document.hidden) buscar(); };
    document.addEventListener("visibilitychange", aoVoltar);

    return () => {
      vivo = false;
      clearInterval(relogio);
      document.removeEventListener("visibilitychange", aoVoltar);
    };
  }, [sessao, tentativa]);

  if (erro) {
    return (
      <Aviso tom="perigo">
        Falha ao carregar o painel: {erro}{" "}
        <button type="button" className="botao botao--secundario"
                onClick={() => { setErro(null); setTentativa((t) => t + 1); }}>
          Tentar de novo
        </button>
      </Aviso>
    );
  }
  if (!dados) return <Carregando />;

  const { ind, fila, providencias, interditados, devolvidas } = dados;
  const devolucaoPor = porOcorrencia(devolvidas);

  /**
   * Indicador que aponta para outra tela navega; indicador cuja lista já está
   * nesta tela rola até ela e leva o foco junto, senão quem usa teclado clica
   * e não vai a lugar nenhum.
   */
  function irPara(destino: string): void {
    if (!destino.startsWith("#")) {
      navegar(destino);
      return;
    }
    const alvo = document.getElementById(destino.slice(1));
    if (!alvo) return;
    alvo.scrollIntoView({ behavior: "smooth", block: "start" });
    alvo.focus({ preventScroll: true });
  }
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
      // Este não navega: a lista dele já está mais abaixo, nesta mesma tela.
      // Antes apontava para "/painel", o que era clicar e não acontecer nada.
      para: "#providencias-pendentes",
      alerta: (ind.providencias_vencidas ?? 0) > 0,
    },
  ];



  return (
    <>
      <div className="cabecalho-pagina">
        <div>
          <h1>Painel operacional</h1>
          <p>
            {sessao.organizacaoNome}
            {/*
              A HORA DOS NUMEROS, dita na tela.

              Sem ela, quem passa a manha com a aba aberta nao tem como saber se
              o "Atrasadas 3" e de agora ou das 8h. Numero de tela de decisao
              operacional sem carimbo de hora e numero em que ninguem deveria
              confiar, e o produto estava pedindo essa confianca.
            */}
            {carregadoEm && (
              <>
                {" \u00b7 "}
                <span className="tabela__secundario">
                  {`números de ${carregadoEm.toLocaleTimeString("pt-BR", {
                    hour: "2-digit", minute: "2-digit",
                  })}`}
                </span>
              </>
            )}
          </p>
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

      {/*
        AS DEVOLVIDAS APARECEM COMO AVISO, E NÃO COMO SÉTIMO INDICADOR.

        A fila de indicadores tem seis cartões e já ocupa a primeira dobra. Um
        sétimo empurraria a fila de atendimento para baixo, e a fila é o motivo
        de alguém abrir esta tela de manhã. Além disso, devolvida não é um
        número que se acompanha ao longo do mês, como "em campo" ou "encerradas
        em 7 dias": é um punhado de casos que precisa de decisão hoje e some
        quando a decisão sai. Número pequeno e efêmero em cartão grande vira
        ruído; número pequeno e efêmero em aviso vira trabalho.

        Ele leva para a lista em triagem, e não para a fila logo abaixo: a fila
        mostra seis linhas, e uma devolvida de severidade baixa pode não estar
        entre elas. Filtro próprio de "devolvidas" na URL seria melhor e exige
        filtro do lado do servidor; peneirar no navegador uma lista que o
        servidor pagina é o defeito que a própria tela de ocorrências corrigiu.
      */}
      {devolvidas && devolvidas.length > 0 && (
        <Aviso tom="alerta">
          <strong>{avisoDoPainel(devolvidas.length)}</strong>{" "}
          O prazo continua correndo, e a equipe foi liberada.{" "}
          <Link to="/ocorrencias?status=triagem">Ver as ocorrências em triagem</Link>
        </Aviso>
      )}

      <div className="grade-indicadores">
        {cartoes.map((c) => (
          <button key={c.rotulo} type="button"
                  className={`indicador${c.alerta ? " indicador--alerta" : ""}`}
                  onClick={() => irPara(c.para)}>
            <span className="indicador__valor">{c.valor}</span>
            <span className="indicador__rotulo">{c.rotulo}</span>
          </button>
        ))}
      </div>

      <Cartao
        titulo="Fila de atendimento"
        acoes={<Link className="botao botao--secundario" to="/ocorrencias">Ver todas</Link>}
      >
        {/*
          A consulta das devolvidas falhou, e a fila diz isso em vez de fingir.
          Texto e ícone, nunca cor sozinha, e discreto de propósito: é uma
          limitação do que está na tela, não um erro do atendimento.
        */}
        {devolvidas === null && (
          <p className="tabela__secundario" style={{ marginTop: 0 }}>
            <IconeVoltar tamanho={12} />{" "}
            A consulta das ocorrências devolvidas do campo não respondeu agora.
            As linhas abaixo podem estar sem essa marca. Atualize a página para
            tentar de novo.
          </p>
        )}
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
                      <div><TipoDaOcorrencia tipo={o.tipo} /></div>
                      <div className="tabela__secundario">{o.endereco}</div>
                    </td>
                    <td><SeloSeveridade severidade={o.severidade} /></td>
                    <td>
                      <SeloStatus status={o.status} />
                      {/*
                        "Em triagem" é o mesmo selo para a que nunca saiu daqui
                        e para a que já foi até a porta e voltou, e as duas
                        pedem decisões diferentes. A marca vai embaixo do selo,
                        com ícone E texto: estado nenhum se comunica só por cor
                        neste produto, e este também não.
                      */}
                      {devolucaoPor.has(o.id) && (
                        <div className="tabela__secundario">
                          <IconeVoltar tamanho={12} />{" "}
                          {marcaDaLista(devolucaoPor.get(o.id)!)}
                        </div>
                      )}
                    </td>
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

      {/*
        O TETO DE OITO E DITO, e nao calado.

        As duas tabelas abaixo desenhavam `slice(0, 8)` e o titulo mostrava o
        total: quatorze imoveis interditados viravam "Imoveis interditados (14)"
        com oito linhas na tela, e as seis interdicoes mais recentes nao
        apareciam em lugar nenhum do PRODUTO INTEIRO, porque estas duas consultas
        so sao chamadas aqui. A ordem e do mais antigo para o mais recente, entao
        o que sumia era justamente o que acabou de acontecer, depois do temporal.

        Teto calado ja foi defeito real deste produto duas vezes nesta semana (o
        mapa desenhava cem ocorrencias sem avisar, e a lista de tarefas do
        aplicativo cortava em duzentas). Aqui ele nao vira paginacao, porque o
        painel e tela de olhar de relance: ele vira AVISO com o numero do que
        ficou de fora, mais o caminho para a lista completa.
      */}
      {providencias.length > 0 && (
        <div id="providencias-pendentes" tabIndex={-1}>
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
                {providencias.slice(0, TETO_DA_PREVIA).map((p) => (
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
          {providencias.length > TETO_DA_PREVIA && (
            <Aviso tom="info">
              {`Mostrando as ${TETO_DA_PREVIA} mais antigas. Outras `}
              {providencias.length - TETO_DA_PREVIA}
              {" aguardam resposta e não cabem neste cartão."}
            </Aviso>
          )}
        </Cartao>
        </div>
      )}

      {/*
        Imóveis interditados, e a lista não se esvazia sozinha.

        Ela existe pela mesma razão que a de providências sem resposta: o que
        some da tela some da cabeça. Uma interdição não tem prazo, ninguém é
        cobrado por ela, e a ocorrência pode até ser encerrada com a família
        ainda fora de casa. Sem esta lista, o único jeito de lembrar de uma
        interdição de quatro meses é alguém reclamar.

        A mais antiga vem primeiro, e o tempo aparece em dias, porque é assim
        que a pergunta é feita: há quanto tempo essa gente está fora.
      */}
      {interditados.length > 0 && (
        <div id="imoveis-interditados" tabIndex={-1}>
        <Cartao titulo={`Imóveis interditados (${interditados.length})`}>
          <p style={{ marginTop: 0, fontSize: "var(--ds-fs-body-sm)", color: "var(--ds-text-muted)" }}>
            Interdição não tem prazo e ninguém é cobrado por ela. Enquanto o
            levantamento não for registrado, tem gente fora de casa.
          </p>
          <div className="tabela-envolucro">
            <table className="tabela">
              <caption className="oculto-visualmente">
                Imóveis interditados sem levantamento registrado, do mais antigo para o mais recente
              </caption>
              <thead>
                <tr>
                  <th scope="col">Endereço</th>
                  <th scope="col">Protocolo</th>
                  <th scope="col">Interditado em</th>
                  <th scope="col">Há quanto tempo</th>
                </tr>
              </thead>
              <tbody>
                {interditados.slice(0, TETO_DA_PREVIA).map((i) => (
                  <tr key={i.id}>
                    <td>
                      <div className="tabela__principal">{i.endereco}</div>
                      {i.ponto_referencia && (
                        <div className="tabela__secundario">{i.ponto_referencia}</div>
                      )}
                    </td>
                    <td>
                      <Link className="tabela__protocolo" to={`/ocorrencias/${i.id}`}>
                        {i.protocolo}
                      </Link>
                      {i.status === "encerrada" && (
                        <div className="tabela__secundario">ocorrência já encerrada</div>
                      )}
                    </td>
                    <td>{formatarDataHora(i.interditada_em)}</td>
                    <td>{diasDesde(i.interditada_em)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {interditados.length > TETO_DA_PREVIA && (
            <Aviso tom="info">
              {`Mostrando os ${TETO_DA_PREVIA} mais antigos. Outros `}
              {interditados.length - TETO_DA_PREVIA}
              {" seguem interditados e não cabem neste cartão."}
            </Aviso>
          )}
        </Cartao>
        </div>
      )}
    </>
  );
}

/**
 * Há quanto tempo, em dias inteiros.
 *
 * Em dias, e não "há 3 meses": a conversa sobre uma família fora de casa é
 * feita em dias, e arredondar para mês esconde justamente a diferença entre
 * vinte e nove e trinta e um.
 */
function diasDesde(iso: string): string {
  const dias = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  if (dias <= 0) return "hoje";
  return `${dias} ${dias === 1 ? "dia" : "dias"}`;
}
