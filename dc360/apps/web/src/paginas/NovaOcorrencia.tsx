import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  CANAIS_ENTRADA, ROTULO_CANAL, ROTULO_TIPO_COBRADE, TIPOS_DE_ENTRADA,
  aberturaOcorrenciaSchema, coordenadaEmTexto, digitosDoTelefone, errosPorCampo,
  linkParaMapa, mascararTelefone, precisaReclassificar, telefoneParecePlausivel,
  type AberturaOcorrencia, type CanalEntrada, type TipoDeEntrada,
} from "@dc360/shared";
import {
  ErroDaApi, abrirOcorrencia, possiveisDuplicidades, type LinhaOcorrencia,
} from "../dados/repositorio";
import { lerLocalizacaoColada } from "./coordenada-colada";
import { descricaoDoTipoNaAbertura } from "./ocorrencia-regras";
import { useSessaoObrigatoria } from "../estado/sessao";
import {
  Aviso, AvisoDeObrigatorios, Cartao, ErrosDoServidor, formatarDataHora,
} from "../componentes/comuns";
import { Campo } from "../componentes/Campo";
import { IconeVoltar } from "../componentes/Icones";

/**
 * Abertura de ocorrência: a tela que o operador de plantão usa com o telefone
 * no ombro.
 *
 * Duas decisões de produto estão aqui. A primeira: o protocolo não é digitado,
 * é gerado pelo banco dentro da transação, com sequência por município e ano,
 * porque dois operadores registrando ao mesmo tempo não podem receber o mesmo
 * número. A segunda: a checagem de duplicidade acontece ANTES de gravar, e
 * mostra o que já existe em vez de bloquear, porque quem sabe se é o mesmo
 * evento é a pessoa, não o sistema.
 */
export function NovaOcorrencia() {
  const sessao = useSessaoObrigatoria();
  const navegar = useNavigate();

  const [tipo, setTipo] = useState<TipoDeEntrada>("deslizamento");
  /*
    O relato curto que só existe junto de "Outro".

    Ele é a matéria prima da triagem: sem esta linha, quem classifica abre um
    chamado que diz "Outro" e nada mais, e a decisão técnica que a triagem
    existe para tomar fica sem base nenhuma. O banco recusa "outro" mudo
    (migração 019), e o esquema compartilhado pede dez caracteres, que é o piso
    que separa uma descrição de um "x" digitado para o formulário liberar.
  */
  const [tipoDescricao, setTipoDescricao] = useState("");
  const [canal, setCanal] = useState<CanalEntrada>("telefone");
  const [solicitante, setSolicitante] = useState("");
  const [contato, setContato] = useState("");
  const [endereco, setEndereco] = useState("");
  const [descricao, setDescricao] = useState("");
  const [localizacao, setLocalizacao] = useState("");
  const [referencia, setReferencia] = useState("");

  /*
    A leitura acontece a cada tecla, e de propósito.

    O operador está com o telefone no ombro: ele cola o link e precisa ver na
    hora se o sistema entendeu. Confirmar só no envio faria a descoberta do
    erro acontecer depois de a ligação terminar, quando ninguém mais pode
    conferir o endereço.

    `lerLocalizacaoColada` é o leitor compartilhado (link do Google, `geo:`,
    par com ponto decimal) mais o que chega pelo WhatsApp num município
    brasileiro: vírgula decimal, grau/minuto/segundo, e a recusa explícita
    quando o mesmo texto admite dois pontos diferentes.
  */
  const leitura = lerLocalizacaoColada(localizacao);

  const [erros, setErros] = useState<Record<string, string>>({});
  const [duplicidades, setDuplicidades] = useState<LinhaOcorrencia[] | null>(null);
  const [gravando, setGravando] = useState(false);
  const [falha, setFalha] = useState<string | null>(null);
  /** Os campos que o servidor recusou, para o resumo do aviso vermelho. */
  const [camposRecusados, setCamposRecusados] = useState<
    ReadonlyArray<{ campo: string; mensagem: string }>
  >([]);

  function montar() {
    /*
      Só a leitura BEM SUCEDIDA vira coordenada.

      Link encurtado e texto não reconhecido não viram nada: a ocorrência é
      gravada sem ponto no mapa, com o endereço e a referência que a pessoa
      informou. Recusar o registro inteiro por causa de um campo opcional
      seria perder o chamado por causa do enfeite.
    */
    const coordenada = leitura.tipo === "coordenada" ? leitura.coordenada : undefined;
    return {
      solicitanteNome: solicitante.trim(),
      // Vai só o que serve para ligar de volta. A máscara é ajuda de
      // digitação, não formato de armazenamento: gravar o desenho faria a
      // mesma pessoa aparecer com dois telefones diferentes numa busca.
      solicitanteContato: digitosDoTelefone(contato) || undefined,
      canalEntrada: canal,
      endereco: endereco.trim(),
      coordenada,
      pontoReferencia: referencia.trim() || undefined,
      tipo,
      /*
        O texto só viaja com "Outro", e quem decide isso é a regra, não o
        estado do React: quem escolhe "Outro", digita o relato e volta atrás
        para "Vendaval" deixaria o texto para trás, e o banco recusa descrição
        pendurada em tipo da COBRADE.
      */
      tipoDescricao: descricaoDoTipoNaAbertura(tipo, tipoDescricao),
      descricao: descricao.trim(),
    };
  }

  async function verificar(evento: React.FormEvent) {
    evento.preventDefault();
    const resultado = aberturaOcorrenciaSchema.safeParse(montar());
    if (!resultado.success) {
      const mapa: Record<string, string> = {};
      for (const issue of resultado.error.issues) {
        const campo = String(issue.path[0] ?? "geral");
        mapa[campo] ??= issue.message;
      }
      setErros(mapa);
      setDuplicidades(null);
      return;
    }
    setErros({});
    setFalha(null);

    // `gravando` cobre a checagem de duplicidade também, e não só a gravação:
    // sem isso, dois cliques rápidos no botão disparam duas aberturas.
    setGravando(true);
    try {
      const candidatas = await possiveisDuplicidades(sessao, tipo, endereco);
      setDuplicidades(candidatas);
      if (candidatas.length === 0) {
        await gravar(resultado.data);
        return;
      }
    } catch (e: unknown) {
      // Sem este catch, a falha vira rejeição não tratada e o formulário
      // simplesmente para de responder, sem dizer nada a quem está no telefone.
      tratarFalha(e);
    }
    setGravando(false);
  }

  /** Revalida antes de gravar: o formulário nunca envia objeto não checado. */
  async function gravarValidando(vinculadaA?: string) {
    const resultado = aberturaOcorrenciaSchema.safeParse(montar());
    if (!resultado.success) {
      setFalha(resultado.error.issues[0]?.message ?? "Dados inválidos");
      return;
    }
    await gravar(resultado.data, vinculadaA);
  }

  /*
    Um lugar so para traduzir falha em coisa acionavel.

    O servidor sempre devolveu, num 422, a lista exata do que precisa ser
    corrigido, e o painel montava isso em `ErroDaApi.campos` e nunca exibia.
    Quem estava com o telefone no ombro lia "Alguns campos precisam ser
    corrigidos" e voltava a cacar o erro no olho.

    Agora a lista vira duas coisas ao mesmo tempo: o erro embaixo do campo
    certo, casado pelo nome, e a lista de resumo no aviso vermelho, que cobre
    campo sem input visivel na tela.
  */
  function tratarFalha(e: unknown): void {
    if (e instanceof ErroDaApi && e.campos.length > 0) {
      setCamposRecusados(e.campos);
      setErros((atuais) => ({ ...atuais, ...errosPorCampo(e.campos) }));
      setFalha(e.message);
      return;
    }
    setCamposRecusados([]);
    setFalha(e instanceof Error ? e.message : String(e));
  }

  async function gravar(dados: AberturaOcorrencia, vinculadaA?: string) {
    setGravando(true);
    setFalha(null);
    setCamposRecusados([]);
    try {
      const id = await abrirOcorrencia(sessao, vinculadaA ? { ...dados, vinculadaA } : dados);
      /*
        O protocolo não viaja daqui: a gravação devolve só o `id`, e quem gera
        o número é o banco, dentro da transação. O que viaja é a marca de que
        esta navegação veio de um registro; a tela de destino lê o protocolo do
        próprio registro e o anuncia. Assim o número do aviso é, por
        construção, o mesmo que está no título da tela, e não uma cópia que
        pode divergir dele.
      */
      navegar(`/ocorrencias/${id}`, { state: { recemRegistrada: true } });
    } catch (e: unknown) {
      tratarFalha(e);
      setGravando(false);
    }
  }

  return (
    <>
      <div className="cabecalho-pagina">
        <div>
          <button type="button" className="botao botao--discreto" onClick={() => navegar(-1)}
                  style={{ marginBottom: "var(--ds-sp-2)" }}>
            <IconeVoltar /> Voltar
          </button>
          <h1>Registrar ocorrência</h1>
          <p>O número de protocolo é gerado pelo sistema ao gravar, não é digitado.</p>
        </div>
      </div>

      {falha && (
        <Aviso tom="perigo">
          Não foi possível gravar: {falha}
          <ErrosDoServidor campos={camposRecusados} />
        </Aviso>
      )}

      {duplicidades && duplicidades.length > 0 && (
        <Cartao titulo="Já existe chamado parecido nas últimas 48 horas">
          <p style={{ marginTop: 0, fontSize: "var(--ds-fs-body-sm)" }}>
            Mesmo tipo, endereço parecido e ainda em atendimento. Confira antes de abrir outro
            protocolo para o mesmo evento.
          </p>
          <div className="tabela-envolucro">
            <table className="tabela">
              <thead>
                <tr>
                  <th scope="col">Protocolo</th>
                  <th scope="col">Endereço</th>
                  <th scope="col">Aberta em</th>
                  <th scope="col">Ação</th>
                </tr>
              </thead>
              <tbody>
                {duplicidades.map((d) => (
                  <tr key={d.id}>
                    <td><Link className="tabela__protocolo" to={`/ocorrencias/${d.id}`}>{d.protocolo}</Link></td>
                    <td>{d.endereco}</td>
                    <td>{formatarDataHora(d.criado_em)}</td>
                    <td>
                      <button type="button" className="botao botao--secundario" disabled={gravando}
                              onClick={() => void gravarValidando(d.id)}>
                        Registrar vinculando a este
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div style={{ display: "flex", gap: "var(--ds-sp-2)", marginTop: "var(--ds-sp-4)" }}>
            <button type="button" className="botao botao--primario" disabled={gravando}
                    onClick={() => void gravarValidando()}>
              É outro evento, registrar em separado
            </button>
            <button type="button" className="botao botao--secundario" onClick={() => setDuplicidades(null)}>
              Voltar e corrigir
            </button>
          </div>
        </Cartao>
      )}

      {!(duplicidades && duplicidades.length > 0) && (
        <Cartao>
          <form onSubmit={verificar} noValidate>
            <AvisoDeObrigatorios />
            <div className="linha-campos">
              {/*
                A lista da ABERTURA é mais larga que a taxonomia, e essa é a
                decisão de produto inteira.

                A COBRADE é fechada e não se inventa nome dentro dela, mas o
                plantão recebe chamado que não cabe nos oito: queda de árvore
                sobre a via, rompimento de adutora, muro do vizinho que
                desabou. Sem "Outro", quem atende escolhe o menos errado, e
                isso não produz dado incompleto, produz dado FALSO: o município
                manda para o sistema nacional um deslizamento que era outra
                coisa. A lacuna é melhor que a mentira, porque a lacuna se vê.
              */}
              <Campo
                id="nova-tipo"
                rotulo="Tipo de ocorrência"
                dica={"Taxonomia da COBRADE. Se o chamado não couber em nenhum dos oito, "
                  + "escolha \"Outro\": a classificação é feita na triagem, por quem tem "
                  + "competência técnica para decidir. Você não precisa decidir agora."}
              >
                {(campo) => (
                  <select {...campo} value={tipo}
                          onChange={(e) => setTipo(e.target.value as TipoDeEntrada)}>
                    {TIPOS_DE_ENTRADA.map((t) => (
                      <option key={t} value={t}>{ROTULO_TIPO_COBRADE[t]}</option>
                    ))}
                  </select>
                )}
              </Campo>

              <Campo id="nova-canal" rotulo="Canal de entrada">
                {(campo) => (
                  <select {...campo} value={canal}
                          onChange={(e) => setCanal(e.target.value as CanalEntrada)}>
                    {CANAIS_ENTRADA.map((c) => (
                      <option key={c} value={c}>{ROTULO_CANAL[c]}</option>
                    ))}
                  </select>
                )}
              </Campo>
            </div>

            {/*
              Só aparece com "Outro" escolhido, e é obrigatório quando aparece.

              Campo sempre visível e sempre opcional seria a lixeira de anotação
              paralela que a migração 019 proíbe do lado do banco: um lugar
              livre dentro de um registro estruturado, preenchido com o que não
              coube em outro lugar, que ninguém lê e que ninguém sabe que
              existe.
            */}
            {precisaReclassificar(tipo) && (
              <Campo
                id="nova-tipo-descricao"
                rotulo="O que foi relatado"
                erro={erros["tipoDescricao"]}
                dica={"Em poucas palavras, com as palavras de quem ligou. É o que a "
                  + "triagem vai ler para classificar."}
              >
                {(campo) => (
                  <input {...campo} type="text" value={tipoDescricao} maxLength={300}
                         onChange={(e) => setTipoDescricao(e.target.value)}
                         placeholder="Árvore de grande porte caída sobre a via"
                         autoComplete="off" />
                )}
              </Campo>
            )}

            <div className="linha-campos">
              <Campo id="nova-solicitante" rotulo="Nome do solicitante"
                     erro={erros["solicitanteNome"]}>
                {(campo) => (
                  <input {...campo} type="text" value={solicitante}
                         onChange={(e) => setSolicitante(e.target.value)} />
                )}
              </Campo>

              {/*
                Máscara na digitação, e nenhuma validação que bloqueie o
                envio. Quem liga pedindo socorro pode ditar ramal, número de
                outro estado ou telefone do vizinho, e recusar isso
                transformaria o campo de contato numa barreira no pior momento
                possível. A dica cobre o erro de digitação de verdade, que é
                dígito faltando, sem impedir nada.
              */}
              <Campo
                id="nova-contato"
                rotulo="Contato"
                opcional
                dica={contato.trim() !== "" && !telefoneParecePlausivel(contato)
                  ? "Confira o número: parece faltar dígito. Pode registrar assim mesmo."
                  : undefined}
              >
                {(campo) => (
                  <input {...campo} type="tel" inputMode="tel" autoComplete="tel"
                         value={contato}
                         onChange={(e) => setContato(mascararTelefone(e.target.value))}
                         placeholder="(48) 9 9999-0000" />
                )}
              </Campo>
            </div>

            <Campo id="nova-endereco" rotulo="Endereço" erro={erros["endereco"]}>
              {(campo) => (
                <input {...campo} type="text" value={endereco}
                       onChange={(e) => setEndereco(e.target.value)}
                       placeholder="Rua, número, bairro" />
              )}
            </Campo>

            <Campo
              id="nova-ref"
              rotulo="Ponto de referência"
              opcional
              dica={"É por aqui que o agente vai achar o lugar. Vale mais que a "
                + "coordenada quando a rua não tem placa."}
            >
              {(campo) => (
                <input
                  {...campo} value={referencia} maxLength={300}
                  onChange={(e) => setReferencia(e.target.value)}
                  placeholder="A última casa antes do córrego, portão azul"
                  autoComplete="off"
                />
              )}
            </Campo>

            {/*
              A resposta da leitura fica sempre no mesmo lugar, com a mesma
              altura, e nunca só na cor: cada estado tem ícone e texto. Um campo
              que empurra o formulário para baixo a cada tecla é um campo que
              faz o operador perder o botão de vista no meio da ligação.

              O `role="status"` fica no elemento de DENTRO da dica porque é a
              dica do `Campo` que carrega o `id` referenciado pelo campo, e a
              região viva precisa existir na tela desde o começo: marcar como
              viva uma caixa que só aparece depois faz o leitor de tela perder
              justamente o primeiro anúncio, que é a leitura do link colado.
            */}
            <Campo
              id="nova-local"
              rotulo="Localização no mapa"
              opcional
              dica={<span role="status">
                {leitura.tipo === "vazio" && (
                  <>
                    Aceita link do Google Maps, do WhatsApp, e a coordenada colada com vírgula
                    ou com ponto, inclusive em grau, minuto e segundo.
                  </>
                )}
                {leitura.tipo === "coordenada" && (
                  <span className="leitura leitura--ok">
                    <span aria-hidden="true">✓</span> Localização reconhecida:{" "}
                    <span className="mono">{coordenadaEmTexto(leitura.coordenada)}</span>.{" "}
                    <a href={linkParaMapa(leitura.coordenada)} target="_blank" rel="noreferrer noopener">
                      Conferir no mapa
                    </a>
                  </span>
                )}
                {leitura.tipo === "invertida" && (
                  <span className="leitura leitura--erro">
                    <span aria-hidden="true">!</span> Este ponto cai fora do Brasil.
                    Latitude e longitude podem estar trocadas.{" "}
                    <button
                      type="button" className="botao-texto"
                      onClick={() => setLocalizacao(coordenadaEmTexto(leitura.sugestao))}
                    >
                      Usar {coordenadaEmTexto(leitura.sugestao)}
                    </button>
                  </span>
                )}
                {leitura.tipo === "ambigua" && (
                  <span className="leitura leitura--erro">
                    <span aria-hidden="true">!</span> Este texto tem duas leituras
                    possíveis e o sistema não escolhe por você. Aponte qual é:{" "}
                    {leitura.leituras.map((c, i) => (
                      <span key={coordenadaEmTexto(c)}>
                        {i > 0 && " ou "}
                        <button
                          type="button" className="botao-texto"
                          onClick={() => setLocalizacao(coordenadaEmTexto(c))}
                        >
                          {coordenadaEmTexto(c)}
                        </button>
                      </span>
                    ))}
                  </span>
                )}
                {leitura.tipo === "encurtado" && (
                  <span className="leitura leitura--nota">
                    <span aria-hidden="true">!</span> Este link é encurtado, e o
                    painel não abre link nenhum para descobrir o que tem dentro.
                    Abra ele no seu navegador e cole aqui o endereço que aparecer
                    na barra, ou a coordenada que a página mostrar.
                  </span>
                )}
                {leitura.tipo === "nao_reconhecido" && (
                  <span className="leitura leitura--nota">
                    <span aria-hidden="true">!</span> Não reconheci coordenada
                    nisso. Pode registrar assim mesmo: o endereço e a referência
                    já levam o agente ao local.
                  </span>
                )}
              </span>}
            >
              {(campo) => (
                <input
                  {...campo} value={localizacao}
                  onChange={(e) => setLocalizacao(e.target.value)}
                  placeholder="Cole o link do Google Maps que o solicitante mandou"
                  autoComplete="off"
                />
              )}
            </Campo>

            <Campo id="nova-descricao" rotulo="Relato" erro={erros["descricao"]}>
              {(campo) => (
                <textarea {...campo} value={descricao}
                          onChange={(e) => setDescricao(e.target.value)}
                          placeholder="O que o solicitante descreveu, com as próprias palavras dele" />
              )}
            </Campo>

            <button type="submit" className="botao botao--primario" disabled={gravando}>
              {gravando ? "Gravando" : "Registrar e gerar protocolo"}
            </button>
          </form>
        </Cartao>
      )}
    </>
  );
}
