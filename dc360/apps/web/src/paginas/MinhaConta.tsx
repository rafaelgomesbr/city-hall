import { useCallback, useEffect, useRef, useState } from "react";
import { ROTULO_PAPEL, senhaSchema } from "@dc360/shared";
import {
  MODO, desativarSegundoFator, encerrarMinhasSessoes, listarMinhasSessoes,
  situacaoSegundoFator, trocarSenha,
  type SessaoDaConta, type SituacaoSegundoFator,
} from "../dados/repositorio";
import { useSessaoObrigatoria } from "../estado/sessao";
import {
  Aviso, AvisoDeObrigatorios, Carregando, Cartao, formatarDataHora,
} from "../componentes/comuns";
import { Campo } from "../componentes/Campo";
import { ConfirmarAcao } from "../componentes/ConfirmarAcao";
import { IconeCheck } from "../componentes/Icones";
import { AtivarSegundoFator } from "../componentes/SegundoFator";
import {
  SO_ESTA_SESSAO, fraseDeOutrasEncerradas, rotuloDeEncerrarOutras,
} from "./sessoes-regras";
import { useTitulo } from "../seo/titulo";
import { erroDaSenhaAtual } from "./senha-provisoria-regras";

/**
 * A conta de quem está usando o sistema, e a troca da própria senha.
 *
 * Esta tela fecha um buraco aberto pelo provisionamento: criar um município
 * entrega uma senha inicial sorteada, ditada por telefone, com o pedido de que
 * seja trocada na primeira entrada. Não havia como. O único caminho era pedir
 * link de recuperação por email, que é o caminho de quem esqueceu a senha, não
 * o de quem quer trocá-la, e que depende de um provedor de email que ainda não
 * existe. Na prática, a senha ditada por telefone ficaria valendo para sempre.
 *
 * A rota já existia no servidor (`POST /auth/trocar-senha`), com o cuidado que
 * importa: ela exige a senha atual e derruba as outras sessões. Faltava a
 * tela.
 */
export function MinhaConta() {
  useTitulo("Minha conta");
  const sessao = useSessaoObrigatoria();

  const [atual, setAtual] = useState("");
  const [nova, setNova] = useState("");
  const [repetida, setRepetida] = useState("");
  const [errosDeCampo, setErrosDeCampo] = useState<Record<string, string>>({});
  const [erro, setErro] = useState<string | null>(null);
  const [sucesso, setSucesso] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  async function submeter(evento: React.FormEvent) {
    evento.preventDefault();
    const problemas: Record<string, string> = {};

    if (!atual) problemas["atual"] = "Informe a senha que você usa hoje";

    const conferida = senhaSchema.safeParse(nova);
    if (!conferida.success) {
      problemas["nova"] = conferida.error.issues[0]?.message ?? "Senha inválida";
    } else if (nova === atual) {
      // Trocar por ela mesma daria "sucesso" sem trocar nada, e a pessoa sairia
      // achando que resolveu.
      problemas["nova"] = "A senha nova precisa ser diferente da atual";
    }

    if (repetida !== nova) problemas["repetida"] = "As duas senhas não são iguais";

    if (Object.keys(problemas).length > 0) {
      setErrosDeCampo(problemas);
      setErro(null);
      setSucesso(null);
      return;
    }

    setErrosDeCampo({});
    setErro(null);
    setEnviando(true);
    try {
      const mensagem = await trocarSenha(atual, nova);
      setSucesso(mensagem);
      setAtual(""); setNova(""); setRepetida("");
    } catch (e: unknown) {
      const daSenha = erroDaSenhaAtual(e, "minha-conta");
      if (daSenha) setErrosDeCampo({ atual: daSenha });
      else setErro(e instanceof Error ? e.message : String(e));
    } finally {
      setEnviando(false);
    }
  }

  return (
    <>
      <div className="cabecalho-pagina">
        <div>
          <h1>Minha conta</h1>
          <p>{sessao.organizacaoNome}</p>
        </div>
      </div>

      <div className="detalhe">
        <div className="coluna">
          <Cartao titulo="Quem está usando este painel">
            <div className="linha-campos">
              <div className="par">
                <span className="par__rotulo">Nome</span>
                <span className="par__valor">{sessao.usuarioNome}</span>
              </div>
              <div className="par">
                <span className="par__rotulo">Papel</span>
                <span className="par__valor">{ROTULO_PAPEL[sessao.papel]}</span>
              </div>
              <div className="par">
                <span className="par__rotulo">Município</span>
                <span className="par__valor">{sessao.municipio}, {sessao.uf}</span>
              </div>
              <div className="par">
                <span className="par__rotulo">Órgão</span>
                <span className="par__valor">{sessao.organizacaoNome}</span>
              </div>
            </div>
          </Cartao>

          <Cartao titulo="Trocar minha senha">
            {MODO === "local" ? (
              <Aviso tom="info">
                Neste painel a entrada é por escolha de perfil, sem senha, então
                não há o que trocar. A troca existe quando o painel está ligado
                ao servidor da prefeitura, que é o caminho de produção.
              </Aviso>
            ) : (
              <>
                {erro && <Aviso tom="perigo">{erro}</Aviso>}
                {sucesso && <Aviso tom="sucesso">{sucesso}</Aviso>}

                <p className="campo__dica" style={{ marginTop: 0 }}>
                  Trocar a senha encerra as suas outras sessões, em outros
                  navegadores e aparelhos. Esta continua aberta.
                </p>

                <form onSubmit={submeter} noValidate>
                  <AvisoDeObrigatorios />
                  <Campo
                    id="conta-senha-atual"
                    rotulo="Senha que você usa hoje"
                    erro={errosDeCampo["atual"]}
                  >
                    {(campo) => (
                      <input {...campo} type="password" value={atual}
                             autoComplete="current-password"
                             onChange={(e) => setAtual(e.target.value)} />
                    )}
                  </Campo>

                  <Campo
                    id="conta-senha-nova"
                    rotulo="Senha nova"
                    erro={errosDeCampo["nova"]}
                    dica={"Mínimo de 12 caracteres. Sem exigência de símbolo ou número: "
                      + "regra de composição só produz senha pior e mais difícil de lembrar."}
                  >
                    {(campo) => (
                      <input {...campo} type="password" value={nova}
                             autoComplete="new-password"
                             onChange={(e) => setNova(e.target.value)} />
                    )}
                  </Campo>

                  <Campo
                    id="conta-senha-repetida"
                    rotulo="Repita a senha nova"
                    erro={errosDeCampo["repetida"]}
                  >
                    {(campo) => (
                      <input {...campo} type="password" value={repetida}
                             autoComplete="new-password"
                             onChange={(e) => setRepetida(e.target.value)} />
                    )}
                  </Campo>

                  <button type="submit" className="botao botao--primario" disabled={enviando}>
                    {enviando ? "Trocando" : "Trocar senha"}
                  </button>
                </form>
              </>
            )}
          </Cartao>

          <MinhasOutrasSessoes />

          <VerificacaoEmDuasEtapas />
        </div>
      </div>
    </>
  );
}

/**
 * As sessões abertas da própria conta, e o botão de sair de todas as outras.
 *
 * É o caminho de quem perdeu o celular ou esqueceu o painel aberto no
 * computador da recepção, e de quem não precisa trocar a senha só para expulsar
 * um aparelho: trocar a senha CONCEDE acesso novo, encerrar sessão só RETIRA, e
 * por isso este botão não pede a senha atual (decisão do servidor, em
 * `/auth/encerrar-sessoes`).
 *
 * A LISTA VEM ANTES DO BOTÃO porque ninguém decide derrubar o que não
 * consegue ver: com "Chrome em Windows, entrou ontem" na tela, a pessoa
 * reconhece o computador da recepção. A tela não recebe IP nem o user-agent
 * inteiro, só a frase do aparelho.
 *
 * ESTA SESSÃO CONTINUA ABERTA, e a frase está na pergunta e na confirmação:
 * um botão que desloga quem o aperta é um botão que ninguém aperta.
 */
function MinhasOutrasSessoes() {
  const [sessoes, setSessoes] = useState<SessaoDaConta[] | null>(null);
  const [erroDeLeitura, setErroDeLeitura] = useState<string | null>(null);
  const [perguntando, setPerguntando] = useState(false);
  const [encerrando, setEncerrando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [sucesso, setSucesso] = useState<string | null>(null);
  const confirmacao = useRef<HTMLDivElement>(null);

  /*
    O FOCO NÃO PODE CAIR EM `BODY` DEPOIS DE ENCERRAR (WCAG 2.4.3).

    O botão "Encerrar minhas outras sessões" só existe enquanto há outra
    sessão. Ao confirmar, a lista é relida, o botão some, e o foco que o
    `Modal` devolveu a ele ia junto: teclado e leitor de tela recomeçavam do
    topo da página (validação da V2-F00-E09, rodada 2). O foco vai para a
    confirmação, que continua na tela e é o que a pessoa precisa ouvir.

    UM mecanismo só: a confirmação é o próprio alvo do foco (`Aviso` com
    `foco`) e, por isso, não é região viva. Antes o foco ia para uma `div` sem
    papel que embrulhava um aviso `role="status"`, e o leitor podia dizer a
    mesma frase duas vezes (uma pelo foco, outra pela região). É o mesmo
    mecanismo da tela de redefinição de senha, para os dois fluxos se
    comportarem igual.

    É um efeito sobre `sucesso`, e não uma chamada dentro de `encerrar`, por
    causa da ordem: o `Modal` devolve o foco ao gatilho na limpeza do efeito
    dele, que roda antes deste (filho antes de pai). Mover o foco aqui, depois
    do commit que mostrou a confirmação, é o que não deixa o gatilho ter a
    última palavra.
  */
  useEffect(() => {
    if (sucesso) confirmacao.current?.focus();
  }, [sucesso]);

  const carregar = useCallback((): (() => void) => {
    let cancelado = false;
    setErroDeLeitura(null);
    listarMinhasSessoes()
      .then((lista) => { if (!cancelado) setSessoes(lista); })
      .catch((e: unknown) => {
        if (!cancelado) setErroDeLeitura(e instanceof Error ? e.message : String(e));
      });
    return () => { cancelado = true; };
  }, []);

  // No modo local não existe sessão para ler: a entrada é por escolha de perfil.
  useEffect(() => (MODO === "local" ? undefined : carregar()), [carregar]);

  async function encerrar(): Promise<void> {
    if (encerrando) return;
    setEncerrando(true);
    setErro(null);
    try {
      const r = await encerrarMinhasSessoes();
      setPerguntando(false);
      setSucesso(fraseDeOutrasEncerradas(r.sessoesEncerradas));
      carregar();
    } catch (e: unknown) {
      setErro(e instanceof Error ? e.message : String(e));
    } finally {
      setEncerrando(false);
    }
  }

  if (MODO === "local") {
    return (
      <Cartao titulo="Minhas sessões">
        <Aviso tom="info">
          Neste painel a entrada é por escolha de perfil, sem senha e sem sessão em outros
          aparelhos, então não há o que listar nem encerrar. Esta lista existe quando o
          painel está ligado ao servidor da prefeitura, que é o caminho de produção.
        </Aviso>
      </Cartao>
    );
  }

  const outras = sessoes ? sessoes.filter((s) => !s.atual).length : 0;

  return (
    <Cartao titulo="Minhas sessões">
      {sucesso && (
        <Aviso tom="sucesso" foco={confirmacao}>{sucesso}</Aviso>
      )}

      {/*
        O `Carregando` da página tem 60vh de altura, que dentro de um cartão
        empurraria o resto da tela para baixo. Aqui o mesmo desenho, no tamanho
        do cartão.
      */}
      {!sessoes && !erroDeLeitura && (
        <div className="carregando carregando--no-cartao" role="status" aria-live="polite">
          <div className="girador" aria-hidden="true" />
          <p>Carregando as suas sessões</p>
        </div>
      )}

      {erroDeLeitura && (
        <>
          <Aviso tom="perigo">
            Não foi possível carregar as suas sessões. {erroDeLeitura}
          </Aviso>
          <button type="button" className="botao botao--secundario" onClick={() => carregar()}>
            Tentar de novo
          </button>
        </>
      )}

      {sessoes && (
        <>
          <ul className="sessoes" aria-label="Sessões abertas na sua conta">
            {sessoes.map((s, i) => (
              <li key={`${s.entrouEm}-${i}`} className="sessoes__item">
                <div className="sessoes__topo">
                  <span className="sessoes__aparelho">{s.aparelho}</span>
                  {s.atual && (
                    <span className="selo selo--info">
                      <IconeCheck tamanho={12} /> Esta sessão
                    </span>
                  )}
                </div>
                <div className="sessoes__datas">
                  <span>Entrou em {formatarDataHora(s.entrouEm)}</span>
                  <span>Expira em {formatarDataHora(s.validaAte)}</span>
                </div>
              </li>
            ))}
          </ul>

          {outras === 0 ? (
            <p className="campo__dica" style={{ margin: 0 }}>{SO_ESTA_SESSAO}</p>
          ) : (
            <>
              <p className="campo__dica" style={{ marginTop: 0 }}>
                Encerrar as outras não mexe nesta: você continua aqui, sem precisar entrar de novo.
              </p>
              {/* `botao--quebra`: a 320 px o rótulo comprido quebra em linhas e o botão ocupa a coluna. */}
              <button type="button" className="botao botao--perigo botao--quebra"
                      onClick={() => { setErro(null); setSucesso(null); setPerguntando(true); }}>
                Encerrar minhas outras sessões
              </button>
            </>
          )}
        </>
      )}

      <ConfirmarAcao
        aberto={perguntando}
        titulo="Encerrar minhas outras sessões"
        consequencia={
          <>
            Os outros navegadores e aparelhos da sua conta saem agora e precisam entrar de novo
            com a sua senha. Esta sessão continua aberta, e a senha não muda.
          </>
        }
        rotuloDaAcao={rotuloDeEncerrarOutras(outras)}
        destrutiva
        ocupado={encerrando}
        aoConfirmar={() => void encerrar()}
        aoCancelar={() => setPerguntando(false)}
      >
        {erro && <Aviso tom="perigo">{erro}</Aviso>}
      </ConfirmarAcao>
    </Cartao>
  );
}

/**
 * A verificação em duas etapas da própria conta.
 *
 * Ela fica aqui, e não numa tela de segurança separada, porque é aqui que a
 * pessoa já vem trocar a senha: um recurso de segurança escondido em outro
 * lugar do menu é um recurso que só quem já sabe que ele existe encontra, e o
 * público desta tela é justamente quem nunca ouviu falar dele.
 *
 * O ESTADO DELA É LIDO DO SERVIDOR, e não do papel de quem está logado. Parece
 * detalhe e não é: "esta conta é administradora, então a verificação está
 * ligada" seria uma inferência da tela sobre um fato que mora no banco, e ela
 * fica errada no minuto seguinte a alguém desligar o recurso no servidor.
 */
function VerificacaoEmDuasEtapas() {
  const [situacao, setSituacao] = useState<SituacaoSegundoFator | null>(null);
  const [ligando, setLigando] = useState(false);
  const [senha, setSenha] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [sucesso, setSucesso] = useState<string | null>(null);
  const [desligando, setDesligando] = useState(false);

  function recarregar() {
    let cancelado = false;
    situacaoSegundoFator()
      .then((s) => { if (!cancelado) setSituacao(s); })
      .catch((e: unknown) => {
        if (!cancelado) setErro(e instanceof Error ? e.message : String(e));
      });
    return () => { cancelado = true; };
  }

  // A bandeira de cancelamento é o equivalente, para um pedido em voo, do
  // temporizador limpo no desmonte: resposta que chega depois da tela não
  // escreve estado nenhum.
  useEffect(recarregar, []);

  async function desligar(evento: React.FormEvent) {
    evento.preventDefault();
    setErro(null);
    setSucesso(null);
    setDesligando(true);
    try {
      const mensagem = await desativarSegundoFator(senha);
      setSenha("");
      setSucesso(mensagem);
      recarregar();
    } catch (e: unknown) {
      setErro(e instanceof Error ? e.message : String(e));
    } finally {
      setDesligando(false);
    }
  }

  if (!situacao) {
    return (
      <Cartao titulo="Verificação em duas etapas">
        {erro ? <Aviso tom="perigo">{erro}</Aviso> : <Carregando />}
      </Cartao>
    );
  }

  if (!situacao.disponivel) {
    return (
      <Cartao titulo="Verificação em duas etapas">
        <Aviso tom="info">
          {MODO === "local"
            ? "Neste painel a entrada é por escolha de perfil, sem senha, então "
              + "não há segunda etapa a ligar. Ela existe quando o painel está "
              + "ligado ao servidor da prefeitura, que é o caminho de produção."
            : "Este servidor está com a verificação em duas etapas desligada. "
              + "Quem cuida da instalação do sistema pode ligá-la."}
        </Aviso>
      </Cartao>
    );
  }

  if (ligando) {
    return (
      <Cartao titulo="Ligar a verificação em duas etapas">
        <AtivarSegundoFator
          aoConcluir={() => {
            setLigando(false);
            setSucesso("Verificação em duas etapas ligada nesta conta.");
            recarregar();
          }}
          aoDesistir={() => setLigando(false)}
        />
      </Cartao>
    );
  }

  return (
    <Cartao titulo="Verificação em duas etapas">
      {erro && <Aviso tom="perigo">{erro}</Aviso>}
      {sucesso && <Aviso tom="sucesso">{sucesso}</Aviso>}

      {situacao.ativo ? (
        <>
          <Aviso tom="sucesso">
            Ligada. Ao entrar, além da senha, o sistema pede o código de seis
            dígitos do seu aplicativo de autenticação. Você ainda tem
            {" "}{situacao.codigosRestantes}{" "}
            {situacao.codigosRestantes === 1 ? "código" : "códigos"} de recuperação.
          </Aviso>

          <p className="campo__dica" style={{ marginTop: 0 }}>
            Trocou de telefone? Desligue aqui e ligue de novo: o aparelho antigo
            para de valer no mesmo ato, e você recebe códigos de recuperação
            novos.
          </p>

          <form onSubmit={desligar} noValidate>
            <Campo
              id="segundo-fator-senha"
              rotulo="Sua senha, para desligar"
              dica="Desligar retira a proteção da conta, então o sistema confirma que é você. Um painel esquecido aberto na recepção não desliga nada."
            >
              {(campo) => (
                <input {...campo} type="password" value={senha}
                       autoComplete="current-password"
                       onChange={(e) => setSenha(e.target.value)} />
              )}
            </Campo>
            <button type="submit" className="botao botao--perigo" disabled={desligando}>
              {desligando ? "Desligando" : "Desligar a verificação"}
            </button>
          </form>
        </>
      ) : (
        <>
          {situacao.exigido ? (
            <Aviso tom="alerta">
              Esta conta administra o município, e o município exige a verificação
              em duas etapas para ela. Enquanto não estiver ligada, a próxima
              entrada vai pedir para ligar antes de continuar.
            </Aviso>
          ) : (
            <Aviso tom="info">
              Desligada. Com ela, uma senha descoberta não basta para entrar na
              sua conta: o sistema passa a pedir também o código de seis dígitos
              do seu aplicativo de autenticação.
            </Aviso>
          )}

          {situacao.pendente && (
            <p className="campo__dica" style={{ marginTop: 0 }}>
              Você começou a ligar e não confirmou nenhum código, então nada
              mudou. Comece de novo: o segredo anterior é descartado.
            </p>
          )}

          <button type="button" className="botao botao--primario"
                  onClick={() => { setSucesso(null); setErro(null); setLigando(true); }}>
            Ligar a verificação em duas etapas
          </button>
        </>
      )}
    </Cartao>
  );
}
