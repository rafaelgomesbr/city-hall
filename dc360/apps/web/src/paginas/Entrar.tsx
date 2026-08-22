import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ROTULO_PAPEL } from "@dc360/shared";
import {
  MODO, bancoSemPersistencia, contasDisponiveis, entrarComSenha, type ContaDisponivel,
} from "../dados/repositorio";
import { useSessao } from "../estado/sessao";
import { Aviso, Carregando, ErroCampo, iniciais } from "../componentes/comuns";

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
  const { entrar } = useSessao();
  const navegar = useNavigate();

  async function enviar(evento: React.FormEvent) {
    evento.preventDefault();
    setErro(null);
    setEntrando(true);
    try {
      const sessao = await entrarComSenha(email.trim(), senha);
      entrar(sessao);
      navegar("/painel");
    } catch (e: unknown) {
      setErro(e instanceof Error ? e.message : String(e));
      setEntrando(false);
    }
  }

  return (
    <>
      <section className="cartao">
        <div className="cartao__corpo">
          <form onSubmit={enviar} noValidate>
            <div className="campo">
              <label htmlFor="entrada-email">Email funcional</label>
              <input
                id="entrada-email" type="email" value={email} autoComplete="username"
                aria-invalid={!!erro} aria-describedby={erro ? "entrada-erro" : undefined}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            <div className="campo">
              <label htmlFor="entrada-senha">Senha</label>
              <input
                id="entrada-senha" type="password" value={senha} autoComplete="current-password"
                aria-invalid={!!erro} aria-describedby={erro ? "entrada-erro" : undefined}
                onChange={(e) => setSenha(e.target.value)}
              />
            </div>

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
