import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import {
  MOTIVO_RECLASSIFICAR,
  PRAZO_PADRAO_HORAS, ROTULO_CANAL, ROTULO_CHECKLIST, ROTULO_PAPEL, ROTULO_SEVERIDADE,
  ROTULO_TIPO_COBRADE, SEVERIDADES, coordenadaEmTexto, linkParaMapa, podeExecutar,
  precisaReclassificar, type Coordenada, type CorrecaoDeCoordenada,
  DESFECHOS_PROVIDENCIA, ROTULO_DESFECHO, respostaProvidenciaSchema,
  type DesfechoProvidencia, type TipoCobrade, type TipoDeEntrada,
  despachoSchema, desinterdicaoSchema, providenciaSchema, triagemSchema,
  type Severidade, rotuloEventoTrilha } from "@dc360/shared";
import {
  buscarOcorrencia, classificarNaTriagem, despacharEquipe, encaminharProvidencia,
  encerrarOcorrencia, corrigirCoordenada,
  levantarInterdicao, listarEquipes, providenciasDaOcorrencia, trilhaDaOcorrencia,
  vistoriaDaOcorrencia, abrirDocumento, listarEvidencias, responderProvidencia,
  vinculosDaOcorrencia, possiveisDuplicidades, devolucaoDaOcorrencia, MODO,
  abrirOficio, detalharOficio, emitirOficio, enviarOficio, listarOficios, listarOrgaos,
  type LinhaEquipe, type LinhaEvento, type LinhaEvidencia, type LinhaOcorrencia,
  type LinhaOficio, type LinhaOrgao, type LinhaProvidencia, type LinhaVistoria,
  type DevolucaoDaOcorrencia,
  type OficioDetalhado, type VinculoOcorrencia,
} from "../dados/repositorio";
import { useSessaoObrigatoria } from "../estado/sessao";
import {
  Aviso, AvisoDeObrigatorios, Carregando, Cartao, ErroCampo, Prazo, SeloSeveridade, SeloStatus,
  TipoDaOcorrencia, Vazio, formatarDataHora,
} from "../componentes/comuns";
import { Campo } from "../componentes/Campo";
import { DescobrirPonto } from "../componentes/DescobrirPonto";
import { depoisDePintar, focarPrimeiroCampo, focarPrimeiroInvalido } from "../componentes/foco";
import { ConfirmarAcao } from "../componentes/ConfirmarAcao";
import { Modal } from "../componentes/Modal";
import { DURACAO_PARA_DITAR, Toast } from "../componentes/Toast";
import { IconeDocumento, IconeEvento, IconeVoltar } from "../componentes/Icones";
import {
  estadoDoEnvio, providenciasSemOficio, rotuloDoEnvio,
} from "./oficio-regras";
import {
  avisoDaCorrecao, mensagemDaLeitura, podeCorrigirCoordenada, proximoPassoDaCorrecao,
} from "./coordenada-corrigida";
import { lerLocalizacaoColada } from "./coordenada-colada";
import { origemDoPonto, textoDoPontoDescoberto } from "./link-encurtado";
import { EmailQuebravel } from "../componentes/EmailQuebravel";
import { useTitulo } from "../seo/titulo";
import { NaoEncontrada, ehIdentificadorValido } from "./NaoEncontrada";
import { paresDoDetalhe } from "./trilha-detalhe";
import {
  ANCORA_DA_COORDENADA, ANCORA_DO_DESPACHO, TIPO_EVENTO_DEVOLUCAO, devolucaoEmAberto,
  lerDevolucao, proximoPasso, rotuloDoMotivo,
  type ProximoPasso,
} from "../devolucao";
import {
  ANCORA_DA_CLASSIFICACAO, avisoDoRegistro, despachoEsperaClassificacao,
  montarVerTambem, ofereceTriagem, opcoesDeTipoNaTriagem, podeOferecerEncerramento,
  proximoPassoDoEncerramento, recusadoPorFaltaDeClassificacao, rotuloDoBotaoDeEncerrar,
  tipoEscolhidoNaTriagem, tipoInicialNaTriagem,
  type ItemVerTambem, type PassoDoEncerramento, type RelacaoVerTambem,
} from "./ocorrencia-regras";

type Conjunto = {
  ocorrencia: LinhaOcorrencia;
  trilha: LinhaEvento[];
  vistoria: LinhaVistoria | null;
  providencias: LinhaProvidencia[];
  equipes: LinhaEquipe[];
  /*
    O catálogo do município, só os ativos.

    A lista de destinos era uma constante de seis nomes escrita nesta tela, e
    ela era o defeito que o catálogo veio consertar: o mesmo órgão digitado de
    quatro jeitos ao longo de um ano faz a conta de "quantas providências foram
    para os bombeiros" deixar de fechar, e é essa conta que sustenta a conversa
    de orçamento.
  */
  orgaos: LinhaOrgao[];
  oficios: LinhaOficio[];
  evidencias: LinhaEvidencia[];
  vinculadaA: VinculoOcorrencia | null;
  vinculadas: VinculoOcorrencia[];
  /**
   * A última devolução do campo, com o texto livre do agente, ou nada.
   *
   * Vem do dossiê e não da trilha, e a diferença é de privacidade: a trilha é
   * append-only, então o servidor nunca grava lá a observação escrita na rua
   * (ela nomeia morador e descreve condição de saúde), e o texto vive na
   * devolução, onde o prazo de retenção do município o alcança. O dossiê é a
   * rota que registra quem consultou, e é por isso que é dela que o texto sai.
   */
  devolucao: DevolucaoDaOcorrencia | null;
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
  useTitulo(dados ? `Ocorrência ${dados.ocorrencia.protocolo}` : "Ocorrência");
  const [erro, setErro] = useState<string | null>(null);
  /*
    A falha que tem um caminho de saída, separada das que não têm.

    Erro que não termina numa ação é erro inútil: a recusa do despacho por
    falta de classificação é justamente a que tem um próximo passo óbvio, e ele
    fica a uma rolagem de distância, no cartão de triagem desta mesma coluna.
    Guardar a marca em estado, em vez de procurar palavra no texto do erro na
    hora de desenhar, é o que mantém o reconhecimento num lugar só.
  */
  const [erroLevaAClassificar, setErroLevaAClassificar] = useState(false);
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

  /*
    Ofício é leitura da coordenação (`consultar_oficio`, V2-F00-E08). O servidor
    responde 403 ao agente de campo, e uma chamada que falha derrubaria a tela
    inteira do dossiê (o `Promise.all` abaixo rejeita junto). Quem não tem a ação
    nem pergunta, e o cartão de ofícios nem é desenhado.
  */
  const podeConsultarOficio = podeExecutar(sessao.papel, "consultar_oficio");

  const recarregar = useCallback(async () => {
    const [
      ocorrencia, trilha, vistoria, providencias, equipes, evidencias, vinculos,
      orgaos, oficios, devolucao,
    ] = await Promise.all([
      buscarOcorrencia(sessao, id),
      trilhaDaOcorrencia(sessao, id),
      vistoriaDaOcorrencia(sessao, id),
      providenciasDaOcorrencia(sessao, id),
      listarEquipes(sessao),
      listarEvidencias(sessao, id),
      vinculosDaOcorrencia(sessao, id),
      listarOrgaos(sessao),
      podeConsultarOficio ? listarOficios(sessao, id) : Promise.resolve<LinhaOficio[]>([]),
      devolucaoDaOcorrencia(sessao, id),
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
      orgaos, oficios, devolucao,
      vinculadaA: vinculos.vinculadaA as VinculoOcorrencia | null,
      vinculadas: vinculos.vinculadas as VinculoOcorrencia[],
    });
  }, [sessao, id, podeConsultarOficio]);

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

  /*
    A mensagem pode ser uma FUNÇÃO, e não só um texto pronto.

    Quase toda ação daqui tem uma frase que já se sabe antes de gravar
    ("Triagem registrada"). A correção de coordenada não: ela precisa dizer de
    onde para onde o alfinete andou, e isso só existe depois que o servidor
    responde com o ponto anterior. Sem esta forma, o aviso teria que ser
    genérico justamente na ação em que o valor conferido é o assunto.
  */
  async function executar(acao: () => Promise<void>, mensagem: string | (() => string)) {
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
    setErroLevaAClassificar(false);
    try {
      await acao();
      await recarregar();
      setAviso(typeof mensagem === "function" ? mensagem() : mensagem);
    } catch (e: unknown) {
      setErro(e instanceof Error ? e.message : String(e));
      /*
        As duas pontas erram com formas diferentes (409 com código na API,
        `Error` com a frase compartilhada no modo de demonstração) e esta tela
        não sabe em qual modo está. O reconhecimento das duas mora em
        `ocorrencia-regras`, e é ele que transforma a faixa vermelha num
        caminho em vez de um beco.
      */
      setErroLevaAClassificar(recusadoPorFaltaDeClassificacao(e));
    } finally {
      setGravando(false);
      // Depois de pintar o resultado, leva o olho e o foco até ele.
      requestAnimationFrame(() => {
        faixaDeAviso.current?.scrollIntoView({ block: "center", behavior: "smooth" });
        faixaDeAviso.current?.focus();
      });
    }
  }

  /*
    Identificador que não é UUID nem chega ao banco: a resposta dele para
    `/ocorrencias/abc` era "invalid input syntax for type uuid", em inglês, na
    faixa vermelha. O endereço errado é dito como endereço errado.
  */
  if (!ehIdentificadorValido(id)) {
    return (
      <NaoEncontrada
        titulo="Ocorrência não encontrada"
        explicacao="O endereço não aponta para uma ocorrência deste município. Confira o link ou procure pelo protocolo na lista."
        voltarPara="/ocorrencias"
        rotuloDoVoltar="Ir para a lista de ocorrências"
      />
    );
  }
  if (erro && !dados) return <Aviso tom="perigo">{erro}</Aviso>;
  if (!dados) return <Carregando />;

  const {
    ocorrencia: o, trilha, vistoria, providencias, equipes, evidencias,
    vinculadaA, vinculadas, mesmoEndereco, orgaos, oficios, devolucao,
  } = dados;
  // Mesma tabela que o repositório usa para recusar a escrita. A tela decide
  // o que desenhar; quem impede de verdade é a camada de dados.
  const podeDespachar = podeExecutar(sessao.papel, "despachar_equipe");
  const podeProvidencia = podeExecutar(sessao.papel, "encaminhar_providencia");
  // Permissão E momento do fluxo, na mesma resposta. Ver `ocorrencia-regras`:
  // o encerramento não é oferecido enquanto o chamado é só um telefonema.
  const ofereceEncerramento = podeOferecerEncerramento(sessao.papel, o.status);
  const podeLevantar = podeExecutar(sessao.papel, "levantar_interdicao");
  const interditada = Boolean(o.interditada_em) && !o.desinterditada_em;
  const podeDocumento = podeExecutar(sessao.papel, "emitir_documento");
  const podeResponder = podeExecutar(sessao.papel, "responder_providencia");

  /*
    A DEVOLUÇÃO QUE AINDA ESPERA DECISÃO.

    O CONTEÚDO vem do dossiê (`devolucao`), e a trilha entra só para responder
    se a coordenação já despachou de novo. Antes a faixa inteira era remontada
    do `detalhe` do evento, e aquilo quebrou em silêncio quando o servidor parou
    de gravar a observação na trilha: o texto que o agente escreveu na rua não
    pode virar linha permanente numa tabela sem UPDATE nem DELETE, senão o
    município não consegue cumprir o próprio prazo de retenção. Ver `../devolucao`
    para o critério de "ainda espera decisão", que é a ordem dos fatos e não o
    status.
  */
  const faixaDaDevolucao = devolucaoEmAberto(devolucao, trilha);
  const passoDaDevolucao = faixaDaDevolucao ? proximoPasso(faixaDaDevolucao.motivo) : null;
  /*
    O passo só vira link quando o cartão de destino está na tela DESTA pessoa.
    Cada bloco tem a sua condição de papel e de momento do fluxo, e link para
    cartão que não foi desenhado é clique que não acontece, que é o mesmo beco
    que esta tela já evita no despacho sem classificação.
  */
  const passoDisponivel =
    passoDaDevolucao === null ? false
      : passoDaDevolucao.destino === `#${ANCORA_DA_COORDENADA}`
        ? podeCorrigirCoordenada(sessao.papel, o.status)
        : passoDaDevolucao.destino === `#${ANCORA_DO_DESPACHO}`
          ? podeDespachar && o.status === "triagem"
            && !despachoEsperaClassificacao(o.status, o.tipo)
          : podeExecutar(sessao.papel, "gerenciar_equipes");
  const encerrada = o.status === "encerrada";
  // Em três pedaços porque o do meio é um número que vai ser ditado: ver
  // `avisoDoRegistro` e o `.mono` lá embaixo.
  const registro = avisoDoRegistro({ protocolo: o.protocolo, papel: sessao.papel });

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
          {/*
            O tipo do cabeçalho passa pelo mesmo componente da lista: um
            chamado "outro" é um chamado ESPERANDO classificação, e a linha que
            abre a tela é onde isso precisa aparecer primeiro.
          */}
          <p><TipoDaOcorrencia tipo={o.tipo} /> em {o.endereco}</p>
        </div>
        <div className="cabecalho-pagina__acoes">
          <SeloSeveridade severidade={o.severidade} />
          <SeloStatus status={o.status} />
        </div>
      </div>

      <div ref={faixaDeAviso} tabIndex={-1} style={{ outline: "none" }}>
        {erro && (
          <Aviso tom="perigo">
            {erro}
            {erroLevaAClassificar && podeExecutar(sessao.papel, "classificar_triagem") && (
              <>{" "}<a href={`#${ANCORA_DA_CLASSIFICACAO}`}>Ir para a classificação</a></>
            )}
          </Aviso>
        )}
        {aviso && <Aviso tom="sucesso">{aviso}</Aviso>}
      </div>

      {/*
        O aviso passageiro do registro. Ele repete o protocolo que já está no
        título logo acima e diz qual é o próximo passo, porque quem acabou de
        gravar não sabe se o trabalho terminou ali. Some sozinho, e nada se
        perde quando some: o protocolo continua no título e o passo seguinte
        continua sendo o cartão aberto na coluna da esquerda.

        Duas coisas aqui não são enfeite. O protocolo sai em `.mono` porque ele
        é ditado ao telefone e copiado, e a fonte tabular é a que não deixa o
        zero parecer letra nem o "1" ocupar meia largura. E o relógio é o
        longo, o de ditar, porque o padrão de seis segundos termina antes de a
        pessoa acabar de passar o número para quem está na linha.
      */}
      {anunciarRegistro && (
        <Toast
          tom="sucesso"
          duracao={DURACAO_PARA_DITAR}
          mensagem={<>
            {registro.antes}
            <span className="mono">{registro.protocolo}</span>
            {registro.depois}
          </>}
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

      {/*
        A DEVOLUÇÃO NO ALTO DA TELA, e não só na linha do tempo.

        Uma ocorrência que voltou do campo sem vistoria é uma ocorrência que
        precisa de decisão agora: o prazo já venceu, ninguém entrou na casa, e
        ela acabou de sair da fila de quem estava indo até lá. Deixar isso como
        mais um item da trilha seria esconder o fato mais novo embaixo de todos
        os antigos, numa lista que se lê de cima para baixo e que ninguém rola
        até o fim.

        É UM aviso, com UMA saída, e não uma caixa de conselhos. A tela já tem o
        cartão da coordenada, o do despacho e o das providências, cada um no
        lugar certo do fluxo; repetir aqui o que cada um faz encheria o topo de
        texto que o coordenador aprende a pular. O motivo é que escolhe para
        onde a única saída aponta, e o link leva o foco até o cartão de lá.

        Ele vem DEPOIS da vulnerabilidade social de propósito: quem está em
        risco vem antes do que precisa ser decidido, mesmo quando a decisão é
        urgente. E some sozinho quando a coordenação despacha de novo, porque
        aviso que não sai de cena depois de resolvido ensina a ignorar avisos.
      */}
      {!encerrada && faixaDaDevolucao && (
        <Aviso tom="alerta">
          <strong>Devolvida do campo sem vistoria.</strong>{" "}
          {/*
            Sem nome quando a conta de quem devolveu saiu do cadastro. A linha
            precisa continuar aparecendo: o fato de a equipe ter perdido a
            viagem não deixa de ser verdade porque o servidor mudou de função.
          */}
          {faixaDaDevolucao.quem ?? "Um agente que não está mais no cadastro"} devolveu
          em {formatarDataHora(faixaDaDevolucao.quando)}.{" "}
          Motivo: {rotuloDoMotivo(faixaDaDevolucao.motivo)}.
          {/*
            TRÊS CASOS, e não dois. Texto escrito, texto descartado no prazo, e
            nenhum texto. O silêncio serve para o último: quem não escreveu nada
            não precisa ser anunciado. Para o descartado, o silêncio seria
            mentira, e mentira numa tela que acaba anexada a processo: a frase
            existiu, foi lida por quem decidiu, e o município a descartou por
            política própria. A linha do tempo, logo abaixo, continua dizendo que
            houve observação, e sem esta frase as duas telas se contradiriam.
          */}
          {faixaDaDevolucao.observacao.estado === "escrita" && (
            <> {faixaDaDevolucao.observacao.texto}</>
          )}
          {faixaDaDevolucao.observacao.estado === "descartada" && (
            <>
              {" "}A observação escrita pelo agente foi descartada
              em {formatarDataHora(faixaDaDevolucao.observacao.em)}, pelo prazo de
              retenção deste município. O motivo e o registro do ato continuam.
            </>
          )}
          {faixaDaDevolucao.prazoPerdidoEm && (
            <>
              {" "}O prazo venceu em {formatarDataHora(faixaDaDevolucao.prazoPerdidoEm)} e
              continua valendo: devolver não reabre prazo.
            </>
          )}
          {" "}
          {passoDaDevolucao && (
            <PassoDaDevolucao passo={passoDaDevolucao} disponivel={passoDisponivel} />
          )}
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
                {/*
                  Seis casas, que é o que o laudo e a minuta imprimem.

                  Aqui saíam quatro. Onze metros separam a coordenada que o
                  coordenador lê na tela da que sai no documento assinado, para
                  o mesmo ponto, e é assim que nasce a discussão sobre qual dos
                  dois está certo, dentro de um processo.
                */}
                <span className="par__valor mono">
                  {o.latitude !== null && o.longitude !== null
                    ? coordenadaEmTexto({ lat: o.latitude, lng: o.longitude })
                    : "Não informada"}
                </span>
              </div>
            </div>
            {/*
              O texto que só existe enquanto o tipo for "outro", e que a
              reclassificação apaga da coluna (o banco recusa descrição em tipo
              da COBRADE). Enquanto ele existe, é a única base da decisão da
              triagem, e escondê-lo aqui obrigaria quem classifica a garimpar a
              trilha para achar o que a pessoa contou ao telefone.
            */}
            {precisaReclassificar(o.tipo) && (
              <div className="par">
                <span className="par__rotulo">O que foi relatado, a classificar</span>
                <span className="par__valor">{o.tipo_descricao ?? "Não informado"}</span>
              </div>
            )}
            <div className="par" style={{ marginBottom: 0 }}>
              <span className="par__rotulo">Relato</span>
              <span className="par__valor">{o.descricao}</span>
            </div>
          </Cartao>

          {/*
            A CORREÇÃO DO ALFINETE, logo abaixo dos dados do chamado.

            É onde o coordenador está quando percebe o erro: o endereço, a
            referência e a coordenada aparecem no cartão de cima, e é a
            comparação entre os três que denuncia o ponto na quadra errada.
            Antes disto não havia como corrigir, e a saída que sobrava era
            abrir outro protocolo para o mesmo evento, o que faz a cidade ter
            duas ocorrências onde existe uma casa.
          */}
          {/*
            O `id` fica no ENVOLUCRO do cartão, e não no campo de dentro: o
            formulário da correção nasce fechado, então uma âncora para o campo
            apontaria para um elemento que só existe depois de alguém clicar.
            `tabIndex={-1}` é o que faz o foco ir junto com a rolagem, senão
            quem usa teclado chega ao cartão sem estar nele.
          */}
          {podeCorrigirCoordenada(sessao.papel, o.status) && (
            <div id={ANCORA_DA_COORDENADA} tabIndex={-1}>
            <BlocoCorrigirCoordenada
              gravando={gravando}
              atual={o.latitude !== null && o.longitude !== null
                ? { lat: o.latitude, lng: o.longitude }
                : null}
              onEnviar={(correcao) => {
                /*
                  A frase do aviso só existe DEPOIS da resposta: ela diz de
                  onde para onde o ponto andou, e o ponto anterior é o servidor
                  que devolve. Por isso a mensagem vai como função.
                */
                let frase = "Coordenada corrigida.";
                executar(
                  async () => {
                    const feito = await corrigirCoordenada(sessao, o.id, correcao);
                    frase = avisoDaCorrecao({
                      anterior: feito.anterior,
                      nova: feito.coordenada,
                      documentoJaEmitido: feito.documentoJaEmitido,
                    });
                  },
                  () => frase,
                );
              }}
            />
            </div>
          )}

          {ofereceTriagem(sessao.papel, o.status, o.tipo) && (
            <BlocoTriagem
              gravando={gravando}
              tipoAtual={o.tipo}
              tipoDescricao={o.tipo_descricao}
              severidadeAtual={o.severidade}
              vulnerabilidadeAtual={o.vulnerabilidade_presente}
              vulnerabilidadeDescricaoAtual={o.vulnerabilidade_descricao}
              onEnviar={(t) => executar(
                () => classificarNaTriagem(sessao, o.id, t),
                "Triagem registrada. O prazo de atendimento foi calculado pela severidade.",
              )}
            />
          )}

          {/*
            O DESPACHO RECUSADO ANTES DE SER TENTADO.

            A rota responde 409 a um chamado ainda "outro", e a restrição
            `tipo_a_classificar_nao_passa_do_despacho` (migração 019) recusa o
            mesmo UPDATE por outro caminho. Desenhar o formulário aqui seria
            fazer o coordenador escolher equipe, prazo e instruções para levar
            a recusa no fim. O aviso toma o lugar do formulário e termina numa
            ação: o link leva o foco direto ao seletor de tipo da triagem, que
            está aberto logo acima nesta mesma coluna.
          */}
          {podeDespachar && !encerrada && despachoEsperaClassificacao(o.status, o.tipo) && (
            <Cartao titulo="Despachar equipe">
              <Aviso tom="alerta">
                <strong>Falta classificar o tipo.</strong> {MOTIVO_RECLASSIFICAR}{" "}
                {podeExecutar(sessao.papel, "classificar_triagem")
                  ? <a href={`#${ANCORA_DA_CLASSIFICACAO}`}>Ir para a classificação</a>
                  : "Quem tem competência para classificar é a coordenação."}
              </Aviso>
            </Cartao>
          )}

          {podeDespachar && !encerrada && o.status === "triagem"
            && !despachoEsperaClassificacao(o.status, o.tipo) && (
            <div id={ANCORA_DO_DESPACHO} tabIndex={-1}>
            <BlocoDespacho
              gravando={gravando}
              equipes={equipes.filter((e) => e.ativa)}
              severidade={o.severidade}
              onEnviar={(d) => executar(
                () => despacharEquipe(sessao, o.id, d),
                "Equipe despachada. A ocorrência aparece agora no aplicativo de campo.",
              )}
            />
            </div>
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
              orgaos={orgaos}
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
            Os ofícios vêm logo depois das providências porque é a mesma
            conversa: a providência diz que alguém foi cobrado, e o ofício é o
            papel que o órgão de fato recebeu. Separar as duas em cantos
            diferentes da tela faria o coordenador responder "encaminhei" sem
            saber que nada saiu do prédio.
          */}
          {providencias.length > 0 && podeConsultarOficio && (
            <CartaoOficios
              providencias={providencias}
              oficios={oficios}
              podeEmitir={podeDocumento}
              podeEnviar={podeProvidencia}
              aoMudar={recarregar}
            />
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
                  {/*
                    A devolução tem leitura própria (motivo por extenso e a
                    nota sobre a observação, em `../devolucao`): é o evento que
                    a coordenação vai reler meses depois para entender por que
                    a casa ficou sem vistoria. Os demais passam por
                    `trilha-detalhe`, que traduz chave e valor e esconde os ids.
                  */}
                  {e.tipo === TIPO_EVENTO_DEVOLUCAO ? (
                    <DetalheDaDevolucao detalhe={e.detalhe} />
                  ) : e.detalhe && (
                    <DetalheDoEvento detalhe={e.detalhe} />
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

/**
 * A saída única do aviso de devolução.
 *
 * Âncora vira `<a href="#">`, porque o destino está nesta mesma tela e o
 * navegador leva o foco junto; rota vira `<Link>`, porque trocar de tela com
 * `href` recarregaria a aplicação inteira.
 *
 * Sem o cartão de destino na tela, o passo continua escrito e deixa de ser
 * link: a informação do que precisa ser feito vale para quem só lê, e quem lê
 * precisa saber que a ação é de outra pessoa, não que ela não existe.
 */
function PassoDaDevolucao({ passo, disponivel }: { passo: ProximoPasso; disponivel: boolean }) {
  if (!disponivel) {
    return <>{passo.texto}. Quem tem competência para isso é a coordenação.</>;
  }
  return passo.destino.startsWith("#")
    ? <a href={passo.destino}>{passo.texto}</a>
    : <Link to={passo.destino}>{passo.texto}</Link>;
}

/** O evento de devolução na linha do tempo, em português e por extenso. */
function DetalheDaDevolucao({ detalhe }: { detalhe: Record<string, unknown> | null }) {
  const lida = lerDevolucao(detalhe);
  if (!lida) return null;
  return (
    <div className="trilha__detalhe">
      <strong>Motivo:</strong> {rotuloDoMotivo(lida.motivo)}
      {/*
        O QUE HOUVE, e não o que foi escrito. O evento nunca carregou o texto e
        não é falta dele: `trilha_eventos` não tem policy de UPDATE nem de
        DELETE, e uma frase que nomeia moradora ficaria ali para sempre, fora do
        alcance do prazo de retenção que o município fixa. Dizer só "Motivo" e
        calar sobre a observação faria quem reler daqui a um ano concluir que o
        agente não escreveu nada, então a linha diz que houve e diz onde o texto
        vive, sem prometer que ele ainda está lá.
      */}
      {lida.temObservacao && (
        <>
          <br />
          Com observação do agente. O texto não entra na trilha, que é
          permanente: ele fica com a devolução, sujeito ao prazo de retenção do
          município, e aparece no aviso desta ocorrência enquanto ela espera
          decisão.
        </>
      )}
      {lida.prazoPerdidoEm && (
        <>
          <br />
          Prazo perdido: {formatarDataHora(lida.prazoPerdidoEm)}
        </>
      )}
    </div>
  );
}

/** O detalhe de um evento comum, em pares "Rótulo: valor", sem JSON cru. */
function DetalheDoEvento({ detalhe }: { detalhe: Record<string, unknown> }) {
  const pares = paresDoDetalhe(detalhe);
  if (pares.length === 0) return null;
  return (
    <div className="trilha__detalhe">
      {pares.map((par, i) => (
        <span key={par.rotulo + String(i)}>
          {i > 0 && " · "}
          <strong>{par.rotulo}:</strong> {par.valor}
        </span>
      ))}
    </div>
  );
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

/**
 * A triagem, que é onde a classificação técnica acontece de verdade.
 *
 * O cartão nasceu com severidade e vulnerabilidade e sem TIPO, e essa ausência
 * era o buraco no meio do caminho: `triagemSchema` já tinha o campo, a rota já
 * sabia gravá-lo, e a única tela capaz de exercer a decisão não o oferecia. Um
 * chamado aberto como "Outro" não tinha caminho nenhum até a COBRADE, e o
 * despacho o recusava para sempre.
 *
 * Os valores atuais entram como padrão do formulário, e isso não é conforto: a
 * triagem pode rodar duas vezes (severidade agora, tipo quando alguém olhar a
 * foto), e um formulário que abrisse sempre em "média, sem vulnerabilidade"
 * rebaixaria em silêncio a severidade e apagaria a vulnerabilidade social de um
 * caso já triado, no clique de quem só queria escolher o tipo.
 */
function BlocoTriagem({
  onEnviar, gravando, tipoAtual, tipoDescricao,
  severidadeAtual, vulnerabilidadeAtual, vulnerabilidadeDescricaoAtual,
}: {
  onEnviar: (t: {
    severidade: Severidade;
    tipo?: TipoCobrade;
    vulnerabilidadePresente: boolean;
    vulnerabilidadeDescricao?: string;
  }) => void;
  gravando: boolean;
  tipoAtual: TipoDeEntrada;
  /** O relato que acompanha "outro", enquanto ele existe. */
  tipoDescricao: string | null;
  severidadeAtual: Severidade | null;
  vulnerabilidadeAtual: boolean;
  vulnerabilidadeDescricaoAtual: string | null;
}) {
  const [severidade, setSeveridade] = useState<Severidade>(severidadeAtual ?? "media");
  /*
    Nunca um palpite: um chamado "outro" abre em "ainda não classificar". Um
    seletor que já viesse marcado em "Deslizamento" faria quem tria confirmar
    sem escolher, e a classificação apressada que "Outro" existe para eliminar
    voltaria pela porta da triagem, agora com o carimbo de quem tem competência
    técnica, que é pior do que a do operador de plantão.
  */
  const [tipo, setTipo] = useState<string>(tipoInicialNaTriagem(tipoAtual));
  const [vulneravel, setVulneravel] = useState(vulnerabilidadeAtual);
  const [descricao, setDescricao] = useState(vulnerabilidadeDescricaoAtual ?? "");
  const [erro, setErro] = useState<string | null>(null);

  const aClassificar = precisaReclassificar(tipoAtual);

  function enviar(evento: React.FormEvent) {
    evento.preventDefault();
    const resultado = triagemSchema.safeParse({
      severidade,
      /*
        `undefined` quando nada foi escolhido, e não `"outro"`: o esquema
        compartilhado só aceita os oito da COBRADE aqui, de propósito, porque
        reclassificar para o mesmo lugar de onde se veio transformaria o portão
        do despacho em formalidade. Omitir é o jeito de dizer "não mexi".
      */
      tipo: tipoEscolhidoNaTriagem(tipo),
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
    <Cartao titulo={aClassificar ? "Classificar o tipo e a severidade" : "Classificar na triagem"}>
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

        {/*
          O relato ao lado da decisão, e não numa aba acima.

          Quem classifica precisa ler o que o solicitante contou para poder
          decidir, e a coluna que guarda esse texto some no instante da
          reclassificação (tipo da COBRADE não guarda descrição). Ler aqui é a
          última oportunidade de comparar a decisão técnica com o relato, e é
          por isso que o texto também vai inteiro para a trilha, que ninguém
          reescreve.
        */}
        {aClassificar && (
          <Aviso tom="info">
            <strong>Chamado a classificar.</strong> O que foi relatado na abertura:{" "}
            {tipoDescricao ?? "nada foi informado"}
          </Aviso>
        )}

        {/*
          O `id` é literal, e não `{ANCORA_DA_CLASSIFICACAO}`, de propósito: a
          varredura de `test/formularios.test.ts` lê `id="..."` como texto, e um
          identificador vindo de expressão faria este campo sumir do portão sem
          que ninguém percebesse, que é o jeito silencioso de um portão parar
          de olhar. O que amarra o link a este campo é o teste, que compara os
          dois contra a mesma constante.
        */}
        <Campo
          id="triagem-tipo"
          rotulo="Tipo de ocorrência"
          dica={aClassificar
            ? "A taxonomia da COBRADE é fechada, e é ela que o município manda para o "
              + "sistema nacional. Enquanto o tipo for \"Outro\", o chamado não pode ser "
              + "despachado."
            : "Corrigir o tipo aqui é legítimo, e a troca fica registrada na trilha."}
        >
          {(campo) => (
            <select {...campo} value={tipo} onChange={(e) => setTipo(e.target.value)}>
              {opcoesDeTipoNaTriagem(tipoAtual).map((o) => (
                <option key={o.valor} value={o.valor}>{o.rotulo}</option>
              ))}
            </select>
          )}
        </Campo>

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

/**
 * Encaminhar providência, com o destino saindo do CATÁLOGO.
 *
 * O que este bloco deixou de ter é o ponto: uma lista de seis nomes escrita
 * dentro da tela. Ela produzia dois defeitos ao mesmo tempo. O primeiro é o
 * que o catálogo conserta: nome digitado de jeitos diferentes vira destinos
 * diferentes no relatório. O segundo é mais silencioso: a lista era a mesma em
 * todo município, então uma prefeitura que não tem companhia de saneamento
 * própria escolhia um destino que não existe ali.
 *
 * O CAMPO LIVRE CONTINUA EXISTINDO, e só quando o catálogo está vazio. Um
 * município que sobe o sistema durante uma chuva não pode ficar travado num
 * encaminhamento urgente esperando alguém cadastrar "Corpo de Bombeiros". O
 * banco resolve o nome contra o catálogo do próprio município e cria a entrada
 * se ela não existir (migração 017), então nem esse caminho deixa providência
 * solta fora do catálogo.
 */
function BlocoProvidencia({ orgaos, onEnviar, gravando }: {
  orgaos: LinhaOrgao[];
  onEnviar: (p: {
    orgaoDestino: string; descricao: string; responsavel: string; prazoHoras: number;
    orgaoId?: string;
  }) => void;
  gravando: boolean;
}) {
  const catalogo = orgaos.filter((o) => o.ativo);
  const [orgaoId, setOrgaoId] = useState(catalogo[0]?.id ?? "");
  const [orgaoLivre, setOrgaoLivre] = useState("");
  const [descricao, setDescricao] = useState("");
  const [responsavel, setResponsavel] = useState("");
  const [prazo, setPrazo] = useState(72);
  const [erro, setErro] = useState<string | null>(null);

  const escolhido = catalogo.find((o) => o.id === orgaoId) ?? null;

  function enviar(evento: React.FormEvent) {
    evento.preventDefault();
    const resultado = providenciaSchema.safeParse({
      orgaoDestino: escolhido ? escolhido.nome : orgaoLivre.trim(),
      descricao: descricao.trim(),
      responsavel: responsavel.trim(), prazoHoras: Number(prazo),
    });
    if (!resultado.success) {
      setErro(resultado.error.issues[0]?.message ?? "Dados inválidos");
      return;
    }
    setErro(null);
    /*
      O identificador vai junto do nome, e não no lugar dele. O nome é o
      registro do destino que o encaminhamento realmente levou, e ele precisa
      continuar valendo mesmo que o órgão seja renomeado no catálogo depois.
    */
    onEnviar(escolhido ? { ...resultado.data, orgaoId: escolhido.id } : resultado.data);
  }

  return (
    <Cartao titulo="Encaminhar providência">
      <form onSubmit={enviar} noValidate>
        <AvisoDeObrigatorios />
        <div className="linha-campos">
          {catalogo.length > 0 ? (
            <Campo
              id="prov-orgao"
              rotulo="Órgão de destino"
              dica={escolhido && !escolhido.email
                ? "Este órgão não tem email cadastrado: o ofício será emitido e "
                  + "impresso, mas não sai por email daqui."
                : undefined}
            >
              {(campo) => (
                <select {...campo} value={orgaoId} onChange={(e) => setOrgaoId(e.target.value)}>
                  {catalogo.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.sigla ? `${o.nome} (${o.sigla})` : o.nome}
                    </option>
                  ))}
                </select>
              )}
            </Campo>
          ) : (
            <Campo
              id="prov-orgao-livre"
              rotulo="Órgão de destino"
              dica={"Nenhum órgão cadastrado ainda. O que for digitado aqui entra no "
                + "catálogo do município, e a partir daí vira opção de lista."}
            >
              {(campo) => (
                <input {...campo} type="text" value={orgaoLivre}
                       onChange={(e) => setOrgaoLivre(e.target.value)}
                       placeholder="Corpo de Bombeiros Militar" />
              )}
            </Campo>
          )}
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
          dica="O motivo é obrigatório. Ele fica gravado com o encerramento e sai na prestação de contas."
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
 * Ofícios de encaminhamento: o papel que sai da prefeitura.
 *
 * A providência diz, dentro do sistema, que alguém foi cobrado. O ofício é o
 * documento que o órgão recebe, com número da sequência do município, e é ele
 * que existe fora daqui. Este cartão junta as três perguntas que ninguém tinha
 * onde responder: qual é o número, foi enviado, e alguém abriu.
 *
 * EMITIR E ENVIAR SÃO DOIS ATOS, e a separação não é burocracia. Emitir produz
 * um papel dentro do município; enviar coloca um endereço de uso único para o
 * dossiê de uma família dentro da caixa de entrada de outro órgão. Por isso só
 * o envio pergunta antes, e o botão da pergunta repete o número e o órgão: é a
 * última chance de perceber que a janela aberta não é a do ofício que se
 * estava lendo.
 *
 * Emitir não pergunta, e isso é decisão e não esquecimento: ele queima um
 * número da sequência e não tem cancelamento, mas o estrago é um número pulado
 * numa lista interna, não um documento na mão de terceiro. Pedir confirmação
 * para os dois ensinaria a clicar em "sim" sem ler, e a pergunta que importa
 * é a do envio.
 */
function CartaoOficios({ providencias, oficios, podeEmitir, podeEnviar, aoMudar }: {
  providencias: LinhaProvidencia[];
  oficios: LinhaOficio[];
  podeEmitir: boolean;
  podeEnviar: boolean;
  aoMudar: () => Promise<void>;
}) {
  const sessao = useSessaoObrigatoria();
  const [gravando, setGravando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [recibo, setRecibo] = useState<string | null>(null);
  const [aEnviar, setAEnviar] = useState<LinhaOficio | null>(null);
  const [detalhe, setDetalhe] = useState<OficioDetalhado | null>(null);
  const [abrindo, setAbrindo] = useState<string | null>(null);
  /*
    Para onde o foco vai depois de emitir: o botão "Emitir ofício para X" sai
    da lista no instante em que o ofício nasce, e o foco de quem clicou caía
    no `<body>`. A faixa de resultado (recibo ou erro) é o que a pessoa
    precisa ler em seguida, e é para ela que o foco vai, como a página faz
    com a própria faixa de aviso.
  */
  const faixaDoOficio = useRef<HTMLDivElement>(null);

  const semOficio = providenciasSemOficio(providencias, oficios);

  async function emitir(providencia: LinhaProvidencia): Promise<void> {
    if (gravando) return;
    setGravando(true);
    setErro(null);
    try {
      const criado = await emitirOficio(sessao, providencia.id);
      /*
        O número aparece no recibo E na lista logo abaixo, depois do
        recarregamento. Se ele existisse só aqui, quem desviou o olho perderia
        o número do documento que acabou de nascer, com o órgão ainda na linha.
      */
      setRecibo(`Ofício ${criado.numero} emitido para ${providencia.orgao_destino}.`);
      await aoMudar();
    } catch (e: unknown) {
      setErro(e instanceof Error ? e.message : String(e));
    } finally {
      setGravando(false);
      depoisDePintar(() => faixaDoOficio.current?.focus());
    }
  }

  /** Um caminho só: o botão pergunta, e o botão da janela envia. */
  async function enviar(oficio: LinhaOficio): Promise<void> {
    if (gravando) return;
    setGravando(true);
    setErro(null);
    try {
      const resultado = await enviarOficio(sessao, oficio.id);
      setAEnviar(null);
      setRecibo(
        `Ofício ${oficio.numero} enviado para ${resultado.destinatario}. O link `
        + `vale ${resultado.expiraEmHoras} horas e abre uma vez só. `
        + `Restam ${resultado.restantes} envios para este ofício.`,
      );
      await aoMudar();
    } catch (e: unknown) {
      setAEnviar(null);
      setErro(e instanceof Error ? e.message : String(e));
    } finally {
      setGravando(false);
    }
  }

  async function verTentativas(oficio: LinhaOficio): Promise<void> {
    setErro(null);
    try {
      setDetalhe(await detalharOficio(sessao, oficio.id));
    } catch (e: unknown) {
      setErro(e instanceof Error ? e.message : String(e));
    }
  }

  async function abrir(oficio: LinhaOficio): Promise<void> {
    setErro(null);
    setAbrindo(oficio.id);
    try {
      window.open(await abrirOficio(sessao, oficio.id), "_blank", "noopener");
    } catch (e: unknown) {
      setErro(e instanceof Error ? e.message : String(e));
    } finally {
      setAbrindo(null);
    }
  }

  return (
    <Cartao titulo="Ofícios de encaminhamento">
      <div ref={faixaDoOficio} tabIndex={-1}>
        {erro && <Aviso tom="perigo">{erro}</Aviso>}
        {recibo && <Aviso tom="sucesso">{recibo}</Aviso>}
      </div>

      {oficios.length === 0 && semOficio.length === 0 && (
        <Vazio titulo="Nenhum ofício emitido">
          <p>O ofício é emitido a partir de uma providência encaminhada.</p>
        </Vazio>
      )}

      {oficios.map((f) => {
        const envio = estadoDoEnvio(f);
        const daProvidencia = providencias.find((p) => p.id === f.providencia_id);
        return (
          <div className="oficio" key={f.id}>
            <div className="oficio__numero mono">{f.numero}</div>
            <div className="oficio__linha">
              <span>{f.orgao_sigla ? `${f.orgao_nome} (${f.orgao_sigla})` : f.orgao_nome}</span>
              <span>Emitido por {f.emitido_por_nome} em {formatarDataHora(f.emitido_em)}</span>
            </div>
            {daProvidencia && (
              <div className="oficio__linha">Providência: {daProvidencia.descricao}</div>
            )}

            {/* Estado nunca só por cor: o selo carrega a frase inteira. */}
            <div className="oficio__linha">
              <span className={`selo selo--${envio.tom}`}>{envio.rotulo}</span>
            </div>
            <p className="campo__dica" style={{ margin: 0 }}>{envio.explicacao}</p>

            <div style={{ display: "flex", gap: "var(--ds-sp-2)", flexWrap: "wrap" }}>
              {podeEmitir && MODO === "api" && (
                <button type="button" className="botao botao--secundario"
                        disabled={abrindo !== null}
                        onClick={() => void abrir(f)}>
                  <IconeDocumento />
                  {abrindo === f.id ? "Gerando" : "Abrir ofício"}
                </button>
              )}
              {podeEnviar && MODO === "api" && (
                <button type="button" className="botao botao--secundario"
                        disabled={gravando}
                        onClick={() => setAEnviar(f)}>
                  {f.envios === 0 ? "Enviar por email" : "Reenviar por email"}
                </button>
              )}
              {f.envios > 0 && (
                /*
                  Alterna em vez de só abrir: uma lista que aparece e não fecha
                  é um beco, e este cartão pode ter vários ofícios abertos ao
                  mesmo tempo empurrando o resto da tela para baixo.
                */
                <button type="button" className="botao botao--discreto"
                        onClick={() => {
                          if (detalhe?.id === f.id) setDetalhe(null);
                          else void verTentativas(f);
                        }}>
                  {detalhe?.id === f.id ? "Esconder" : "Ver"} as {f.envios}{" "}
                  {f.envios === 1 ? "tentativa" : "tentativas"}
                </button>
              )}
            </div>

            {detalhe?.id === f.id && (
              <ul style={{ margin: 0, paddingLeft: "var(--ds-sp-5)" }}>
                {detalhe.envios.map((tentativa) => (
                  <li key={tentativa.id} className="oficio__linha">
                    {/*
                      Num <span> só: a linha é `flex`, e cada <wbr> do
                      `EmailQuebravel` solto viraria um item com o respiro
                      entre os pedaços do endereço.
                    */}
                    <span>
                      Tentativa {tentativa.tentativa} para{" "}
                      <EmailQuebravel email={tentativa.destinatario_email} />,{" "}
                      por {tentativa.solicitado_por_nome} em{" "}
                      {formatarDataHora(tentativa.solicitado_em)}:
                    </span>{" "}
                    <strong>{tentativa.desfecho}</strong>
                    {tentativa.detalhe && ` (${tentativa.detalhe})`}
                  </li>
                ))}
              </ul>
            )}
          </div>
        );
      })}

      {podeEmitir && semOficio.length > 0 && (
        <div className="oficio">
          <p className="campo__dica" style={{ margin: 0 }}>
            Um ofício por providência. Emitir queima um número da sequência do
            município e não tem cancelamento.
          </p>
          <div style={{ display: "flex", gap: "var(--ds-sp-2)", flexWrap: "wrap" }}>
            {semOficio.map((p) => (
              <button type="button" className="botao botao--primario" key={p.id}
                      disabled={gravando}
                      onClick={() => void emitir(p)}>
                <IconeDocumento /> Emitir ofício para {p.orgao_destino}
              </button>
            ))}
          </div>
        </div>
      )}

      {MODO === "local" && oficios.length > 0 && (
        <p className="campo__dica" style={{ margin: 0 }}>
          O documento e o envio por email são feitos pelo servidor. Este painel está
          em modo local: o número já foi reservado, e o papel sai no ambiente real.
        </p>
      )}

      <ConfirmarAcao
        aberto={aEnviar !== null}
        titulo="Enviar ofício por email"
        consequencia={
          <>
            O órgão de destino recebe um endereço de uso único que abre o ofício
            com os dados da ocorrência. O link vale por tempo limitado, abre uma
            vez só, e a abertura fica registrada. Não tem como recolher um email
            enviado.
          </>
        }
        rotuloDaAcao={rotuloDoEnvio(aEnviar)}
        ocupado={gravando}
        aoConfirmar={() => { if (aEnviar) void enviar(aEnviar); }}
        aoCancelar={() => setAEnviar(null)}
      >
        <p className="campo__dica" style={{ marginTop: "var(--ds-sp-3)" }}>
          Vai para o email cadastrado no catálogo de órgãos. Se o endereço estiver
          errado, corrija o cadastro antes de enviar: o link já sai vivo.
        </p>
      </ConfirmarAcao>
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
/**
 * Corrigir o ponto de uma ocorrência aberta, no lugar onde o erro é percebido.
 *
 * POR QUE AQUI, E NÃO NO MAPA. O mapa desenha a cidade inteira e é a tela de
 * quem procura padrão: arrastar um alfinete lá seria mexer num registro sem o
 * endereço, o relato e o ponto de referência na frente, que são exatamente as
 * três coisas que dizem se o alfinete está no lugar errado. Pior, num mapa com
 * duzentos marcadores em cima de uma enxurrada, corrigir o pino errado é um
 * deslize de um pixel. Aqui a correção acontece encostada nos dados do chamado
 * e a poucos centímetros da trilha, que é onde ela vai aparecer.
 *
 * O leitor do campo é o MESMO da abertura (`lerLocalizacaoColada`): link do
 * Google, `geo:` do Android, par com ponto, par com vírgula decimal e
 * grau/minuto/segundo. Um segundo leitor faria a mesma colagem ser aceita numa
 * tela e recusada na outra.
 *
 * O formulário começa FECHADO. Ele é a exceção, não a rotina: aberto por
 * padrão, empurraria a triagem para baixo em toda ocorrência e convidaria a
 * mexer no ponto de casos em que ninguém desconfiou de nada.
 */
function BlocoCorrigirCoordenada({
  gravando, atual, onEnviar,
}: {
  gravando: boolean;
  atual: Coordenada | null;
  onEnviar: (correcao: CorrecaoDeCoordenada) => void;
}) {
  const [aberto, setAberto] = useState(false);
  const [texto, setTexto] = useState("");
  const [motivo, setMotivo] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  /*
    O botão "Corrigir a coordenada" some quando o formulário aparece, e o
    foco de quem o apertou caía no `<body>`. Ao abrir, o foco vai para o
    primeiro campo; ao recusar, para o campo marcado como inválido.
  */
  const formulario = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (aberto) focarPrimeiroCampo(formulario.current);
  }, [aberto]);
  // De onde veio o ponto quando foi o servidor que o descobriu a partir de um
  // link encurtado, como na abertura. Some quando a pessoa mexe no campo.
  const [origemDoLink, setOrigemDoLink] = useState<{ frase: string; link: string } | null>(null);

  // A cada tecla, como na abertura: quem cola precisa ver na hora se o sistema
  // entendeu, e não descobrir no envio.
  const leitura = lerLocalizacaoColada(texto);
  /*
    De qual campo é a recusa. `proximoPassoDaCorrecao` recusa primeiro pelo
    ponto (não lido, ou igual ao gravado) e só depois pelo motivo; o erro vai
    para o campo que o causou, senão o foco e o `aria-invalid` cairiam no
    motivo por uma coordenada que não foi entendida.
  */
  const pontoAceito = leitura.tipo === "coordenada"
    && !(atual && atual.lat === leitura.coordenada.lat && atual.lng === leitura.coordenada.lng);
  const erroDoPonto = erro && !pontoAceito ? erro : null;
  const erroDoMotivo = erro && pontoAceito ? erro : null;

  function enviar(): void {
    const decisao = proximoPassoDaCorrecao(texto, motivo, atual);
    if (decisao.tipo === "erro") {
      setErro(decisao.mensagem);
      depoisDePintar(() => focarPrimeiroInvalido(formulario.current));
      return;
    }
    setErro(null);
    onEnviar(decisao.correcao);
    setAberto(false);
    setTexto("");
    setMotivo("");
  }

  return (
    <Cartao titulo="Coordenada no mapa">
      <div className="par">
        <span className="par__rotulo">Ponto gravado</span>
        <span className="par__valor mono">
          {atual ? coordenadaEmTexto(atual) : "Não informada"}
        </span>
      </div>

      {!aberto ? (
        <>
          <button type="button" className="botao-texto" onClick={() => setAberto(true)}>
            {atual ? "Corrigir a coordenada" : "Informar a coordenada"}
          </button>
          <p className="campo__dica">
            {atual
              ? "Use quando o alfinete estiver no lugar errado. A correção fica na "
                + "trilha, com o ponto anterior e o motivo."
              : "Esta ocorrência foi aberta sem ponto no mapa, então ela não aparece "
                + "no mapa da cidade."}
          </p>
        </>
      ) : (
        <form ref={formulario} onSubmit={(evento) => { evento.preventDefault(); enviar(); }} noValidate>
          {/*
            Os dois campos são obrigatórios aqui, e o motivo é o que mais
            surpreende: na abertura a coordenada é opcional, e nesta tela não,
            porque a pessoa abriu este formulário exatamente para mexer no
            ponto.
          */}
          <AvisoDeObrigatorios />
          <Campo
            id="corrigir-coordenada-ponto"
            rotulo="Ponto correto"
            erro={erroDoPonto}
            dica={<span role="status">
              {leitura.tipo === "coordenada" ? (
                <span className="leitura leitura--ok">
                  <span aria-hidden="true">✓</span> Ponto reconhecido:{" "}
                  <span className="mono">{coordenadaEmTexto(leitura.coordenada)}</span>.{" "}
                  {origemDoLink && <>{origemDoLink.frase}{" "}</>}
                  <a
                    href={origemDoLink ? origemDoLink.link : linkParaMapa(leitura.coordenada)}
                    target="_blank" rel="noreferrer noopener"
                  >
                    Conferir no mapa
                  </a>
                </span>
              ) : leitura.tipo === "encurtado" ? (
                /*
                  O MESMO componente da abertura: o servidor da prefeitura abre
                  o link encurtado quando a pessoa aperta o botão, e o ponto
                  entra no campo como texto, com a origem dita ao lado.
                */
                <DescobrirPonto
                  url={texto}
                  onPonto={(descoberta) => {
                    setErro(null);
                    setOrigemDoLink(origemDoPonto(texto, descoberta.urlFinal));
                    setTexto(textoDoPontoDescoberto(descoberta));
                  }}
                />
              ) : (
                <span
                  className={leitura.tipo === "vazio" ? "leitura leitura--nota" : "leitura leitura--erro"}
                >
                  <span aria-hidden="true">{leitura.tipo === "vazio" ? "i" : "!"}</span>{" "}
                  {mensagemDaLeitura(leitura.tipo)}
                </span>
              )}
              {leitura.tipo === "invertida" && (
                <>
                  {" "}
                  <button
                    type="button" className="botao-texto"
                    onClick={() => setTexto(coordenadaEmTexto(leitura.sugestao))}
                  >
                    Usar {coordenadaEmTexto(leitura.sugestao)}
                  </button>
                </>
              )}
              {leitura.tipo === "ambigua" && leitura.leituras.map((c, i) => (
                <span key={coordenadaEmTexto(c)}>
                  {i > 0 ? " ou " : " "}
                  <button
                    type="button" className="botao-texto"
                    onClick={() => setTexto(coordenadaEmTexto(c))}
                  >
                    {coordenadaEmTexto(c)}
                  </button>
                </span>
              ))}
            </span>}
          >
            {(campo) => (
              <input
                {...campo} value={texto}
                onChange={(e) => { setErro(null); setOrigemDoLink(null); setTexto(e.target.value); }}
                placeholder="Cole o link do Google Maps, ou a coordenada"
                autoComplete="off"
              />
            )}
          </Campo>

          <Campo
            id="corrigir-coordenada-motivo"
            rotulo="Motivo da correção"
            erro={erroDoMotivo}
            dica={"Obrigatório, porque é obrigatório na trilha. É o que responde, "
              + "meses depois, por que o laudo impresso aponta para um ponto e o "
              + "sistema aponta para outro."}
          >
            {(campo) => (
              <textarea
                {...campo} value={motivo}
                onChange={(e) => { setErro(null); setMotivo(e.target.value); }}
                placeholder="O agente conferiu no local: o ponto caía na quadra de baixo"
              />
            )}
          </Campo>

          <button type="submit" className="botao botao--primario" disabled={gravando}>
            {gravando ? "Corrigindo" : "Corrigir a coordenada"}
          </button>{" "}
          <button
            type="button" className="botao-texto"
            onClick={() => { setAberto(false); setErro(null); }}
          >
            Cancelar
          </button>
        </form>
      )}
    </Cartao>
  );
}

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
