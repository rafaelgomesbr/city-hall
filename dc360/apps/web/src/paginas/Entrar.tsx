import { useEffect, useRef, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { ROTULO_PAPEL, errosPorCampo } from "@dc360/shared";
import {
  ErroDaApi, MODO, bancoSemPersistencia, conferirSegundoFator, contasDisponiveis, entrarComSenha,
  trocarSenha,
  type ContaDisponivel, type DesafioDeEntrada, type ResultadoDeEntrada, type Sessao,
} from "../dados/repositorio";
import { useSessao } from "../estado/sessao";
import {
  Aviso, AvisoDeObrigatorios, Carregando, ErroCampo, iniciais,
} from "../componentes/comuns";
import { Campo } from "../componentes/Campo";
import { AtivarSegundoFator } from "../componentes/SegundoFator";
import { useTitulo } from "../seo/titulo";
import { focarPrimeiroInvalido } from "../componentes/foco";
import { useFocoDepoisDeRenderizar } from "../componentes/usar-foco";
import { conferirEntrada, destinoDepoisDeEntrar, estadoDaEntrada } from "./entrar-regras";
import { conferirSenhaNova, erroDaSenhaAtual, passoDepoisDeEntrar } from "./senha-provisoria-regras";

/**
 * Entrada da aplicação, em duas formas conforme o painel esteja ligado à API
 * ou rodando com o banco na própria aba.
 *
 * Com API, é email e senha de verdade, com bloqueio por tentativa e sessão
 * revogável do lado do servidor.
 *
 * Sem API, a lista de contas serve para escolher com qual papel e de qual
 * município se está operando. Isso é deliberado e temporário, e a tela diz
 * isso em voz alta: uma escolha de perfil não é autenticação, e deixar a
 * ambiguidade no ar seria vender o que não existe.
 *
 * Nos dois casos, a escolha feita aqui é a ÚNICA origem da organização que
 * chega ao `SET LOCAL` do RLS.
 */
export function Entrar() {
  useTitulo("Entrar");
  /*
    Por que a pessoa está aqui, e para onde ela volta. Os dois vêm do estado
    da navegação, posto pela rota protegida (`App.tsx`): a sessão expirou no
    meio de uma tela, ou o link profundo chegou sem sessão. Lidos com
    desconfiança em `entrar-regras.ts`.
  */
  const estado = estadoDaEntrada(useLocation().state);
  return (
    <div className="entrada">
      <div className="entrada__painel">
        <div className="entrada__marca">
          <span className="entrada__sigla" aria-hidden="true">DC</span>
          <div>
            <h1 className="entrada__titulo">Defesa Civil Operacional 360</h1>
            <p className="entrada__subtitulo">
              {MODO === "api"
                ? "Entre com seu email funcional"
                : "Escolha o município e o perfil para entrar"}
            </p>
          </div>
        </div>

        {/*
          A sessão que acabou sozinha é dita com todas as letras. Sem isto, a
          pessoa que estava no meio de uma triagem cai na tela de entrada sem
          saber se fez algo errado, se o sistema caiu ou se foi desligada.
        */}
        {estado.motivo === "expirou" && (
          <Aviso tom="alerta">
            <strong>Sua sessão expirou.</strong> Entre de novo para continuar
            de onde estava. Nada do que já tinha sido gravado se perdeu.
          </Aviso>
        )}
        {estado.motivo === "encerrada" && (
          <Aviso tom="alerta">
            <strong>Sua sessão foi encerrada.</strong> Entre de novo para
            continuar de onde estava. Isso acontece quando o acesso é
            encerrado em outro aparelho, por quem administra o sistema, ou
            quando o seu cadastro muda. Nada do que já tinha sido gravado se
            perdeu.
          </Aviso>
        )}
        {estado.motivo === "desativada" && (
          <Aviso tom="perigo">
            <strong>Sua conta foi desativada.</strong> Entrar de novo não
            resolve: procure a coordenação do seu município. Nada do que você
            já registrou se perdeu.
          </Aviso>
        )}

        {MODO === "api"
          ? <FormularioSenha voltarPara={estado.voltarPara} />
          : <EscolhaDePerfil voltarPara={estado.voltarPara} />}

        {/*
          O único caminho de dentro do produto para a página pública de
          interesse: sem este link ela só era alcançável pelo endereço, e o
          coordenador que quer indicar o sistema para o município vizinho
          não tem como adivinhar `/quero-conhecer`. Discreto de propósito:
          quem chega aqui, na maioria das vezes, veio entrar.
        */}
        <p className="entrada__rodape">
          Sua prefeitura ainda não usa o sistema?{" "}
          <Link to="/quero-conhecer">Quero conhecer</Link>
        </p>
      </div>
    </div>
  );
}

function FormularioSenha({ voltarPara }: { voltarPara: string | null }) {
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [errosDeCampo, setErrosDeCampo] = useState<Record<string, string>>({});
  const [entrando, setEntrando] = useState(false);
  /*
    O estado intermediário do login em duas etapas.

    Ele guarda o DESAFIO, e não a sessão: enquanto isto estiver preenchido, a
    pessoa provou a senha e mais nada, e o painel não tem token de acesso
    nenhum guardado. Quem impõe isso é o servidor (o desafio tem plateia
    própria e não abre rota nenhuma); aqui a tela apenas não finge o contrário.
  */
  const [desafio, setDesafio] = useState<DesafioDeEntrada | null>(null);
  /*
    A SENHA PROVISÓRIA. Quem entrou com a senha sorteada por quem administra
    recebe sessão, mas uma sessão que só abre a troca de senha (o servidor
    responde 403 a tudo o mais). Enquanto isto estiver preenchido a tela NÃO
    segue para o painel: pede a senha nova aqui, com a provisória ainda na
    mão. Ver `senha-provisoria-regras.ts`.
  */
  const [definirSenha, setDefinirSenha] = useState<{ sessao: Sessao; provisoria: string } | null>(null);
  const { entrar } = useSessao();
  const navegar = useNavigate();

  function seguir(sessao: Sessao) {
    entrar(sessao);
    // De volta para onde a pessoa estava, ou para a tela do papel dela.
    navegar(destinoDepoisDeEntrar({ voltarPara }, sessao.papel), { replace: true });
  }

  /** O que fazer com uma sessão que acabou de nascer: seguir, ou definir a senha. */
  function receber(resultado: ResultadoDeEntrada, provisoria: string) {
    const passo = passoDepoisDeEntrar(resultado);
    if (passo.passo === "definir-senha") {
      setDefinirSenha({ sessao: passo.sessao, provisoria });
      setSenha("");
      return;
    }
    if (passo.passo === "seguir") seguir(passo.sessao);
  }

  async function enviar(evento: React.FormEvent) {
    evento.preventDefault();
    setErro(null);

    /*
      Vazio não sai da tela. A entrada aceitava email e senha em branco,
      mandava para o servidor e devolvia "Alguns campos precisam ser
      corrigidos" sem marcar campo nenhum: a pessoa lia a frase e não sabia
      qual dos dois faltava. O servidor está certo em recusar; a tela é que
      não deveria ter perguntado.
    */
    const conferida = conferirEntrada({ email, senha });
    if (!conferida.ok) {
      setErrosDeCampo(conferida.erros);
      return;
    }
    setErrosDeCampo({});
    setEntrando(true);
    try {
      const resultado = await entrarComSenha(conferida.dados.email, conferida.dados.senha);
      if (resultado.tipo === "segundo-fator") {
        setDesafio(resultado.desafio);
        // A senha sai do estado no instante em que deixa de ser necessária.
        setSenha("");
        setEntrando(false);
        return;
      }
      receber(resultado, conferida.dados.senha);
      setEntrando(false);
    } catch (e: unknown) {
      /*
        O 422 traz `campos` (email malformado, senha longa demais), e eles
        vão para o campo certo, como todas as outras telas fazem. A recusa
        da credencial (401) continua sendo a frase única embaixo do par: ver
        o comentário no formulário.
      */
      if (e instanceof ErroDaApi && e.campos.length > 0) {
        setErrosDeCampo(errosPorCampo(e.campos));
      } else {
        setErro(e instanceof Error ? e.message : String(e));
      }
      setEntrando(false);
    }
  }

  if (definirSenha) {
    return (
      <PassoDaSenhaNova
        provisoria={definirSenha.provisoria}
        aoConcluir={() => seguir(definirSenha.sessao)}
      />
    );
  }

  if (desafio?.segundoFator === "codigo") {
    return (
      <PassoDoCodigo
        desafio={desafio}
        // Pela segunda etapa a senha já saiu do estado: se a sessão nascer
        // provisória, a pessoa digita a senha provisória de novo na troca.
        aoEntrar={(resultado) => receber(resultado, "")}
        aoVoltar={() => { setDesafio(null); setErro(null); }}
      />
    );
  }

  if (desafio?.segundoFator === "ativacao") {
    return (
      <section className="cartao">
        <div className="cartao__corpo">
          <h2 className="cartao__titulo">Ligue a verificação em duas etapas</h2>
          <Aviso tom="info">{desafio.mensagem}</Aviso>
          <AtivarSegundoFator
            desafio={desafio.desafio}
            aoConcluir={(r) => { if (r.sessao) seguir(r.sessao); }}
            aoDesistir={() => setDesafio(null)}
          />
        </div>
      </section>
    );
  }

  return (
    <>
      <section className="cartao">
        <div className="cartao__corpo">
          <form onSubmit={enviar} noValidate>
            <AvisoDeObrigatorios />
            {/*
              A recusa da entrada NÃO é erro de campo, e por isso ela não vai
              no `erro` do `Campo`.

              O servidor responde a mesma frase para email inexistente e para
              senha errada, de propósito: dizer qual dos dois falhou entregaria
              a lista de quem tem conta na prefeitura. Pendurar essa frase em
              um dos dois campos contaria justamente o que a resposta se recusa
              a contar. Ela pertence ao par, então fica embaixo dos dois, e os
              dois a referenciam em `aria-describedby`.
            */}
            <Campo id="entrada-email" rotulo="Email funcional" erro={errosDeCampo["email"]}>
              {(campo) => (
                <input
                  {...campo} type="email" value={email} autoComplete="username"
                  aria-invalid={campo["aria-invalid"] || (erro ? true : undefined)}
                  aria-describedby={[campo["aria-describedby"], erro ? "entrada-erro" : undefined]
                    .filter(Boolean).join(" ") || undefined}
                  onChange={(e) => setEmail(e.target.value)}
                />
              )}
            </Campo>
            <Campo id="entrada-senha" rotulo="Senha" erro={errosDeCampo["senha"]}>
              {(campo) => (
                <input
                  {...campo} type="password" value={senha} autoComplete="current-password"
                  aria-invalid={campo["aria-invalid"] || (erro ? true : undefined)}
                  aria-describedby={[campo["aria-describedby"], erro ? "entrada-erro" : undefined]
                    .filter(Boolean).join(" ") || undefined}
                  onChange={(e) => setSenha(e.target.value)}
                />
              )}
            </Campo>

            {erro && <ErroCampo id="entrada-erro">{erro}</ErroCampo>}

            <button type="submit" className="botao botao--primario" style={{ width: "100%" }}
                    disabled={entrando}>
              {entrando ? "Entrando" : "Entrar"}
            </button>
          </form>
        </div>
      </section>

      <p className="entrada__rodape">
        <Link to="/recuperar-senha">Esqueceu a senha?</Link>
      </p>
    </>
  );
}

/**
 * A segunda etapa da entrada: o código do aplicativo, ou um de recuperação.
 *
 * O MESMO campo aceita os dois, e o servidor decide qual é. Um link "usar
 * código de recuperação" abrindo outro formulário seria o link que ninguém
 * acha justamente no dia em que o telefone quebrou, que é o único dia em que
 * ele importa.
 *
 * O botão de voltar existe porque a alternativa é pior: sem ele, quem digitou
 * o email errado (e só descobre aqui) fica preso numa tela que pede um código
 * de uma conta que não é a dele, e o caminho vira recarregar a página.
 */
function PassoDoCodigo(
  { desafio, aoEntrar, aoVoltar }: {
    desafio: DesafioDeEntrada;
    /** O resultado inteiro, porque a sessão pode ter nascido de senha provisória. */
    aoEntrar: (resultado: ResultadoDeEntrada) => void;
    aoVoltar: () => void;
  },
) {
  const [codigo, setCodigo] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  /*
    A parada obrigatória de quem entrou gastando um código de recuperação.

    Ela existe porque a alternativa não funciona: um aviso mostrado enquanto a
    tela já está indo embora não é lido por ninguém. Quem gastou um papel da
    gaveta precisa ver quantos sobraram AGORA, e apertar "continuar" com essa
    informação na frente, senão descobre que acabaram no dia em que gastar o
    último, que é o dia em que ele perde o município.
  */
  const [gastou, setGastou] = useState<{ resultado: ResultadoDeEntrada; restantes: number } | null>(null);

  async function enviar(evento: React.FormEvent) {
    evento.preventDefault();
    setErro(null);
    setEnviando(true);
    try {
      const r = await conferirSegundoFator(desafio.desafio, codigo.trim());
      if (r.tipo !== "sessao") {
        setErro("O servidor pediu a verificação outra vez. Entre de novo.");
        setEnviando(false);
        return;
      }
      if (r.entrouComCodigoDeRecuperacao) {
        setGastou({ resultado: r, restantes: r.codigosDeRecuperacaoRestantes ?? 0 });
        setEnviando(false);
        setCodigo("");
        return;
      }
      aoEntrar(r);
    } catch (e: unknown) {
      setErro(e instanceof Error ? e.message : String(e));
      setEnviando(false);
    }
  }

  if (gastou) {
    return (
      <section className="cartao">
        <div className="cartao__corpo">
          <h2 className="cartao__titulo">Você entrou com um código de recuperação</h2>
          <Aviso tom="alerta">
            Aquele código não vale mais. Restam {gastou.restantes}
            {gastou.restantes === 1 ? " código" : " códigos"}.
            {gastou.restantes <= 2 && (
              " Desligue e ligue a verificação de novo em Minha conta para receber outros."
            )}
          </Aviso>
          <button type="button" className="botao botao--primario" style={{ width: "100%" }}
                  onClick={() => aoEntrar(gastou.resultado)}>
            Continuar para o painel
          </button>
        </div>
      </section>
    );
  }

  return (
    <section className="cartao">
      <div className="cartao__corpo">
        <h2 className="cartao__titulo">Verificação em duas etapas</h2>
        <p className="campo__dica" style={{ marginTop: 0 }}>{desafio.mensagem}</p>

        {erro && <Aviso tom="perigo">{erro}</Aviso>}

        <form onSubmit={enviar} noValidate>
          <Campo
            id="entrada-codigo"
            rotulo="Código do aplicativo"
            dica="Seis dígitos. Se você perdeu o telefone, digite aqui um dos seus códigos de recuperação."
          >
            {(campo) => (
              <input
                {...campo} type="text" inputMode="numeric" autoComplete="one-time-code"
                value={codigo} autoFocus
                onChange={(e) => setCodigo(e.target.value)}
              />
            )}
          </Campo>

          <button type="submit" className="botao botao--primario" style={{ width: "100%" }}
                  disabled={enviando}>
            {enviando ? "Conferindo" : "Entrar"}
          </button>
        </form>

        <p className="entrada__rodape">
          <button type="button" className="botao botao--discreto" onClick={aoVoltar}>
            Voltar e digitar o email de novo
          </button>
        </p>
      </div>
    </section>
  );
}

function EscolhaDePerfil({ voltarPara }: { voltarPara: string | null }) {
  const [contas, setContas] = useState<ContaDisponivel[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const { entrar } = useSessao();
  const navegar = useNavigate();

  useEffect(() => {
    contasDisponiveis()
      .then(setContas)
      .catch((e: unknown) => setErro(e instanceof Error ? e.message : String(e)));
  }, []);

  function escolher(c: ContaDisponivel) {
    entrar({
      organizacaoId: c.organizacao_id,
      organizacaoNome: c.organizacao_nome,
      municipio: c.municipio,
      uf: c.uf,
      usuarioId: c.usuario_id,
      usuarioNome: c.usuario_nome,
      papel: c.papel,
    });
    navegar(destinoDepoisDeEntrar({ voltarPara }, c.papel), { replace: true });
  }

  if (erro) {
    return (
      <Aviso tom="perigo">
        Não foi possível preparar o banco local: {erro}. Este modo depende de
        Postgres em WebAssembly rodando na própria aba. Tente pelo Chrome, pelo
        Edge ou pelo Firefox, ou use o painel ligado à API.
      </Aviso>
    );
  }
  if (!contas) {
    return <Carregando mensagem="Preparando o banco de dados local (Postgres em WebAssembly)" />;
  }

  const municipios = [...new Set(contas.map((c) => `${c.municipio}, ${c.uf}`))];

  return (
    <>
      {bancoSemPersistencia() && (
        // Dizer isto importa: sem o aviso, alguém cadastra meia hora de dado
        // numa demonstração e descobre que sumiu só depois de fechar a aba.
        <Aviso tom="alerta">
          Este navegador não deixou o banco local guardar dado entre visitas.
          A demonstração funciona normalmente, mas tudo o que for feito aqui
          some ao fechar a aba.
        </Aviso>
      )}
      <section className="cartao">
        <div className="cartao__corpo">
          {municipios.map((m) => (
            <div key={m}>
              <p className="lista-contas__grupo">{m}</p>
              <div className="lista-contas">
                {contas
                  .filter((c) => `${c.municipio}, ${c.uf}` === m)
                  .map((c) => (
                    <button key={c.usuario_id} type="button" className="conta"
                            onClick={() => escolher(c)}>
                      <span className="conta__avatar" aria-hidden="true">{iniciais(c.usuario_nome)}</span>
                      <span>
                        <span className="conta__nome">{c.usuario_nome}</span>
                        <br />
                        <span className="conta__meta">{ROTULO_PAPEL[c.papel]}</span>
                      </span>
                    </button>
                  ))}
              </div>
            </div>
          ))}
        </div>
      </section>

      <p className="entrada__rodape">
        Modo local, sem servidor: escolher perfil aqui não é autenticação.
        Dados fictícios, nenhum dado real de pessoa. O isolamento entre municípios
        é imposto pelo banco (Row Level Security forçada), não pela interface.
      </p>
    </>
  );
}

/**
 * A senha nova de quem entrou com senha provisória.
 *
 * A sessão já existe e os tokens já estão guardados, mas o painel ainda NÃO
 * entrou nela (`entrar(sessao)` só acontece em `aoConcluir`): enquanto a
 * senha for a provisória, toda rota responde 403 `troca_de_senha_obrigatoria`,
 * e seguir para o painel seria mostrar uma tela inteira de erros. É o mesmo
 * desenho da ativação obrigatória do segundo fator, logo acima.
 *
 * A senha provisória vem preenchida quando a pessoa acabou de digitá-la; na
 * entrada em duas etapas ela já saiu do estado, e a pessoa digita de novo. O
 * servidor exige a senha atual de qualquer jeito (`/auth/trocar-senha`), e a
 * resposta traz o token de acesso novo, que `trocarSenha` já guarda.
 */
function PassoDaSenhaNova(
  { provisoria, aoConcluir }: { provisoria: string; aoConcluir: () => void },
) {
  const [atual, setAtual] = useState(provisoria);
  const [nova, setNova] = useState("");
  const [repetida, setRepetida] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [errosDeCampo, setErrosDeCampo] = useState<Record<string, string>>({});
  const [enviando, setEnviando] = useState(false);
  const formulario = useRef<HTMLFormElement>(null);

  /*
    O foco depois de enviar (V2-F00-E09, correção 4, revisão): o botão fica
    desabilitado enquanto grava e, ao terminar, o foco estava no `<body>`. Erro
    de campo leva ao campo inválido; erro que não é de campo, à própria
    mensagem (`#senha-nova-erro`, focável por código).
  */
  const levarOFocoAoErro = useFocoDepoisDeRenderizar(() => {
    if (!focarPrimeiroInvalido(formulario.current)) document.getElementById("senha-nova-erro")?.focus();
  });

  async function enviar(evento: React.FormEvent) {
    evento.preventDefault();
    setErro(null);
    const conferida = conferirSenhaNova({ atual, nova, repetida });
    if (!conferida.ok) {
      setErrosDeCampo(conferida.erros);
      levarOFocoAoErro();
      return;
    }
    setErrosDeCampo({});
    setEnviando(true);
    try {
      await trocarSenha(atual, nova);
      aoConcluir();
    } catch (e: unknown) {
      const daSenha = erroDaSenhaAtual(e, "senha-provisoria");
      if (daSenha) {
        // O erro mora no campo que a pessoa digitou errado, com o nome que ele tem na tela.
        setErrosDeCampo({ atual: daSenha });
      } else if (e instanceof ErroDaApi && e.campos.length > 0) {
        setErrosDeCampo(errosPorCampo(e.campos));
      } else {
        setErro(e instanceof Error ? e.message : String(e));
      }
      setEnviando(false);
      levarOFocoAoErro();
    }
  }

  return (
    <section className="cartao">
      <div className="cartao__corpo">
        <h2 className="cartao__titulo">Defina a sua senha</h2>
        <Aviso tom="info">
          Você entrou com uma senha provisória, que vale só para esta primeira
          entrada. Escolha agora a senha que vai usar daqui em diante: pelo
          menos 12 caracteres, e que só você saiba.
        </Aviso>
        <form onSubmit={enviar} noValidate ref={formulario}>
          <AvisoDeObrigatorios />
          <Campo id="senha-nova-atual" rotulo="Senha provisória que você recebeu"
                 erro={errosDeCampo["atual"]}>
            {(campo) => (
              <input {...campo} type="password" value={atual} autoComplete="current-password"
                     onChange={(e) => setAtual(e.target.value)} />
            )}
          </Campo>
          <Campo id="senha-nova" rotulo="Senha nova" erro={errosDeCampo["nova"]}
                 dica="Pelo menos 12 caracteres. Uma frase curta é mais fácil de lembrar que símbolos.">
            {(campo) => (
              <input {...campo} type="password" value={nova} autoComplete="new-password"
                     onChange={(e) => setNova(e.target.value)} />
            )}
          </Campo>
          <Campo id="senha-nova-repetida" rotulo="Repita a senha nova" erro={errosDeCampo["repetida"]}>
            {(campo) => (
              <input {...campo} type="password" value={repetida} autoComplete="new-password"
                     onChange={(e) => setRepetida(e.target.value)} />
            )}
          </Campo>

          {erro && <ErroCampo id="senha-nova-erro" focavel>{erro}</ErroCampo>}

          <button type="submit" className="botao botao--primario" style={{ width: "100%" }}
                  disabled={enviando}>
            {enviando ? "Gravando" : "Definir senha e entrar"}
          </button>
        </form>
      </div>
    </section>
  );
}
