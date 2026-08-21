import { useState } from "react";
import type { ReactNode } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { MODO, pedirRecuperacao, redefinirSenha } from "../dados/repositorio";
import { Aviso, ErroCampo } from "../componentes/comuns";

/**
 * Recuperação de senha, em duas telas que compartilham a mesma moldura.
 *
 * A primeira pede o email. A resposta é sempre a mesma, exista a conta ou
 * não, e a tela repete isso ao pé da letra: se ela dissesse "email não
 * encontrado", viraria um verificador de quais servidores estão cadastrados
 * na prefeitura.
 *
 * A segunda recebe o link e define a senha nova. Ela não entra no sistema
 * depois: quem redefiniu digita a senha uma vez no login, e é isso que
 * confirma que a nova senha funciona.
 */
function Moldura({ titulo, subtitulo, children }: {
  titulo: string;
  subtitulo: string;
  children: ReactNode;
}) {
  return (
    <div className="entrada">
      <div className="entrada__painel">
        <div className="entrada__marca">
          <span className="entrada__sigla" aria-hidden="true">DC</span>
          <div>
            <h1 className="entrada__titulo">{titulo}</h1>
            <p className="entrada__subtitulo">{subtitulo}</p>
          </div>
        </div>
        <section className="cartao">
          <div className="cartao__corpo">{children}</div>
        </section>
        <p className="entrada__rodape">
          <Link to="/entrar">Voltar para a entrada</Link>
        </p>
      </div>
    </div>
  );
}

export function RecuperarSenha() {
  const [email, setEmail] = useState("");
  const [aviso, setAviso] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  async function enviar(evento: React.FormEvent) {
    evento.preventDefault();
    setErro(null);
    setEnviando(true);
    try {
      setAviso(await pedirRecuperacao(email.trim()));
    } catch (e: unknown) {
      setErro(e instanceof Error ? e.message : String(e));
    } finally {
      setEnviando(false);
    }
  }

  return (
    <Moldura titulo="Redefinir senha" subtitulo="Informe seu email funcional">
      {aviso ? (
        <Aviso tom="sucesso">{aviso}</Aviso>
      ) : (
        <form onSubmit={enviar} noValidate>
          {MODO === "local" && (
            <Aviso tom="alerta">
              A recuperação de senha exige o servidor. Este painel está em modo local.
            </Aviso>
          )}
          <div className="campo">
            <label htmlFor="recuperar-email">Email funcional</label>
            <input id="recuperar-email" type="email" value={email} autoComplete="username"
                   aria-invalid={!!erro} aria-describedby={erro ? "recuperar-erro" : undefined}
                   onChange={(e) => setEmail(e.target.value)} />
          </div>
          {erro && <ErroCampo id="recuperar-erro">{erro}</ErroCampo>}
          <button type="submit" className="botao botao--primario"
                  style={{ width: "100%" }} disabled={enviando}>
            {enviando ? "Enviando" : "Enviar link de redefinição"}
          </button>
        </form>
      )}
    </Moldura>
  );
}

export function DefinirNovaSenha() {
  const [params] = useSearchParams();
  const token = params.get("token") ?? "";
  const [senha, setSenha] = useState("");
  const [repetida, setRepetida] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [pronto, setPronto] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const navegar = useNavigate();

  async function enviar(evento: React.FormEvent) {
    evento.preventDefault();
    setErro(null);

    // A conferência das duas digitações acontece aqui, e não no servidor: é
    // erro de digitação, não regra de negócio, e a ida ao servidor só
    // atrasaria a correção.
    if (senha !== repetida) {
      setErro("As duas senhas precisam ser iguais.");
      return;
    }
    if (senha.length < 12) {
      setErro("A senha precisa de pelo menos 12 caracteres.");
      return;
    }

    setSalvando(true);
    try {
      await redefinirSenha(token, senha);
      setPronto(true);
      setTimeout(() => navegar("/entrar"), 2500);
    } catch (e: unknown) {
      setErro(e instanceof Error ? e.message : String(e));
    } finally {
      setSalvando(false);
    }
  }

  if (!token) {
    return (
      <Moldura titulo="Redefinir senha" subtitulo="Link inválido">
        <Aviso tom="perigo">
          Este endereço não traz um link de redefinição válido. Peça um novo na
          tela de entrada.
        </Aviso>
      </Moldura>
    );
  }

  return (
    <Moldura titulo="Nova senha" subtitulo="Escolha uma senha para sua conta">
      {pronto ? (
        <Aviso tom="sucesso">Senha redefinida. Entre com a nova senha.</Aviso>
      ) : (
        <form onSubmit={enviar} noValidate>
          <div className="campo">
            <label htmlFor="nova-senha">Nova senha</label>
            <input id="nova-senha" type="password" value={senha} autoComplete="new-password"
                   aria-invalid={!!erro} aria-describedby={erro ? "nova-senha-erro" : undefined}
                   onChange={(e) => setSenha(e.target.value)} />
            <span className="campo__dica">
              Mínimo de 12 caracteres. Sem exigência de símbolo ou número: regra de
              composição só produz senha pior e mais difícil de lembrar.
            </span>
          </div>
          <div className="campo">
            <label htmlFor="repetir-senha">Repita a nova senha</label>
            <input id="repetir-senha" type="password" value={repetida} autoComplete="new-password"
                   onChange={(e) => setRepetida(e.target.value)} />
          </div>
          {erro && <ErroCampo id="nova-senha-erro">{erro}</ErroCampo>}
          <button type="submit" className="botao botao--primario"
                  style={{ width: "100%" }} disabled={salvando}>
            {salvando ? "Salvando" : "Definir nova senha"}
          </button>
        </form>
      )}
    </Moldura>
  );
}
