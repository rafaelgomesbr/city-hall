import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ROTULO_PAPEL } from "@dc360/shared";
import {
  MODO, bancoSemPersistencia, conferirSegundoFator, contasDisponiveis, entrarComSenha,
  type ContaDisponivel, type DesafioDeEntrada, type Sessao,
} from "../dados/repositorio";
import { useSessao } from "../estado/sessao";
import {
  Aviso, AvisoDeObrigatorios, Carregando, ErroCampo, iniciais,
} from "../componentes/comuns";
import { Campo } from "../componentes/Campo";
import { AtivarSegundoFator } from "../componentes/SegundoFator";

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

        {MODO === "api" ? <FormularioSenha /> : <EscolhaDePerfil />}
      </div>
    </div>
  );
}

function FormularioSenha() {
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [entrando, setEntrando] = useState(false);
  /*
    O estado intermediário do login em duas etapas.

    Ele guarda o DESAFIO, e não a sessão: enquanto isto estiver preenchido, a
    pessoa provou a senha e mais nada, e o painel não tem token de acesso
    nenhum guardado. Quem impõe isso é o servidor (o desafio tem plateia
    própria e não abre rota nenhuma); aqui a tela apenas não finge o contrário.
  */
  const [desafio, setDesafio] = useState<DesafioDeEntrada | null>(null);
  const { entrar } = useSessao();
  const navegar = useNavigate();

  function seguir(sessao: Sessao) {
    entrar(sessao);
    navegar("/painel");
  }

  async function enviar(evento: React.FormEvent) {
    evento.preventDefault();
    setErro(null);
    setEntrando(true);
    try {
      const resultado = await entrarComSenha(email.trim(), senha);
      if (resultado.tipo === "segundo-fator") {
        setDesafio(resultado.desafio);
        // A senha sai do estado no instante em que deixa de ser necessária.
        setSenha("");
        setEntrando(false);
        return;
      }
      seguir(resultado.sessao);
    } catch (e: unknown) {
      setErro(e instanceof Error ? e.message : String(e));
      setEntrando(false);
    }
  }

  if (desafio?.segundoFator === "codigo") {
    return (
      <PassoDoCodigo
        desafio={desafio}
        aoEntrar={seguir}
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
            <Campo id="entrada-email" rotulo="Email funcional">
              {(campo) => (
                <input
                  {...campo} type="email" value={email} autoComplete="username"
                  aria-invalid={erro ? true : undefined}
                  aria-describedby={erro ? "entrada-erro" : undefined}
                  onChange={(e) => setEmail(e.target.value)}
                />
              )}
            </Campo>
            <Campo id="entrada-senha" rotulo="Senha">
              {(campo) => (
                <input
                  {...campo} type="password" value={senha} autoComplete="current-password"
                  aria-invalid={erro ? true : undefined}
                  aria-describedby={erro ? "entrada-erro" : undefined}
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
    aoEntrar: (sessao: Sessao) => void;
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
  const [gastou, setGastou] = useState<{ sessao: Sessao; restantes: number } | null>(null);

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
        setGastou({ sessao: r.sessao, restantes: r.codigosDeRecuperacaoRestantes ?? 0 });
        setEnviando(false);
        setCodigo("");
        return;
      }
      aoEntrar(r.sessao);
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
                  onClick={() => aoEntrar(gastou.sessao)}>
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

function EscolhaDePerfil() {
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
    navegar("/painel");
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
