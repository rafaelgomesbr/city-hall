import { useState } from "react";
import { ROTULO_PAPEL, senhaSchema } from "@dc360/shared";
import { MODO, trocarSenha } from "../dados/repositorio";
import { useSessaoObrigatoria } from "../estado/sessao";
import { Aviso, AvisoDeObrigatorios, Cartao } from "../componentes/comuns";
import { Campo } from "../componentes/Campo";

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
      setErro(e instanceof Error ? e.message : String(e));
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
                à API, que é o caminho de produção.
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
        </div>
      </div>
    </>
  );
}
