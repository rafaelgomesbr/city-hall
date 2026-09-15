import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { MODO, pedirRecuperacao, redefinirSenha } from "../dados/repositorio";
import { Aviso, AvisoDeObrigatorios } from "../componentes/comuns";
import { Campo } from "../componentes/Campo";
import { useTitulo } from "../seo/titulo";

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
  useTitulo("Recuperar senha");
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
          <Campo id="recuperar-email" rotulo="Email funcional" erro={erro}>
            {(campo) => (
              <input {...campo} type="email" value={email} autoComplete="username"
                     onChange={(e) => setEmail(e.target.value)} />
            )}
          </Campo>
          <button type="submit" className="botao botao--primario"
                  style={{ width: "100%" }} disabled={enviando}>
            {enviando ? "Enviando" : "Enviar link de redefinição"}
          </button>
        </form>
      )}
    </Moldura>
  );
}

/**
 * Quanto tempo a confirmação fica na tela antes de levar para a entrada.
 *
 * Tempo suficiente para ler "Senha redefinida" e entender que a próxima tela
 * não é erro. Menos que isto e a troca de tela parece falha; muito mais e a
 * pessoa fica olhando uma tela que não pede nada.
 */
const ESPERA_ATE_A_ENTRADA_MS = 2500;

export function DefinirNovaSenha() {
  useTitulo("Definir nova senha");
  const [params] = useSearchParams();
  const token = params.get("token") ?? "";
  const [senha, setSenha] = useState("");
  const [repetida, setRepetida] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [pronto, setPronto] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const navegar = useNavigate();

  /*
    A ida para a entrada é agendada DENTRO de um efeito, e cancelada quando a
    tela sai.

    Solta dentro do envio, ela deixava um relógio de pé que ninguém tinha como
    parar: quem redefine a senha e clica em "Voltar para a entrada" antes dos
    dois segundos e meio (ou fecha a tela por qualquer outro caminho) levava
    uma navegação disparada por cima da tela seguinte, alguns segundos depois,
    sem ter pedido nada. Em desenvolvimento isso vira aviso de atualizar
    componente desmontado; em produção vira a tela pulando sozinha, que é o
    tipo de coisa que ninguém consegue reproduzir para relatar.
  */
  useEffect(() => {
    if (!pronto) return;
    const relogio = setTimeout(() => navegar("/entrar"), ESPERA_ATE_A_ENTRADA_MS);
    return () => clearTimeout(relogio);
  }, [pronto, navegar]);

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
          <AvisoDeObrigatorios />
          {/*
            As duas mensagens possíveis ("as senhas não são iguais" e "faltam
            caracteres") falam da senha nova, então o erro fica nela. Repetir o
            mesmo texto embaixo dos dois campos faria o leitor de tela anunciar
            duas vezes o mesmo problema, e quem enxerga leria dois erros onde
            existe um.
          */}
          <Campo
            id="nova-senha"
            rotulo="Nova senha"
            erro={erro}
            dica={"Mínimo de 12 caracteres. Sem exigência de símbolo ou número: regra de "
              + "composição só produz senha pior e mais difícil de lembrar."}
          >
            {(campo) => (
              <input {...campo} type="password" value={senha} autoComplete="new-password"
                     onChange={(e) => setSenha(e.target.value)} />
            )}
          </Campo>
          <Campo id="repetir-senha" rotulo="Repita a nova senha">
            {(campo) => (
              <input {...campo} type="password" value={repetida} autoComplete="new-password"
                     onChange={(e) => setRepetida(e.target.value)} />
            )}
          </Campo>
          <button type="submit" className="botao botao--primario"
                  style={{ width: "100%" }} disabled={salvando}>
            {salvando ? "Salvando" : "Definir nova senha"}
          </button>
        </form>
      )}
    </Moldura>
  );
}
