import { useEffect, useState } from "react";
import { ROTULO_PAPEL, senhaSchema } from "@dc360/shared";
import {
  MODO, desativarSegundoFator, situacaoSegundoFator, trocarSenha,
  type SituacaoSegundoFator,
} from "../dados/repositorio";
import { useSessaoObrigatoria } from "../estado/sessao";
import { Aviso, AvisoDeObrigatorios, Carregando, Cartao } from "../componentes/comuns";
import { Campo } from "../componentes/Campo";
import { AtivarSegundoFator } from "../componentes/SegundoFator";
import { useTitulo } from "../seo/titulo";

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

          <VerificacaoEmDuasEtapas />
        </div>
      </div>
    </>
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
