import { useCallback, useEffect, useState } from "react";
import {
  ROTULO_PAPEL, cadastroUsuarioSchema, papeisQuePodeConceder, type Papel,
} from "@dc360/shared";
import {
  MODO, alternarUsuarioAtivo, atualizarUsuario, criarUsuario, encerrarSessoesDeUsuario,
  listarEquipes, listarUsuarios, redefinirSenhaDeUsuario, sessoesDeUsuario,
  type LinhaEquipe, type LinhaUsuario, type SenhaRedefinida, type SessoesAbertasDeOutrem,
} from "../dados/repositorio";
import { useSessaoObrigatoria } from "../estado/sessao";
import {
  DICA_DO_EMAIL_TRAVADO, motivoParaNaoAdministrar, podeTrocarEmail,
} from "./usuarios-regras";
import { fraseDasSessoesAbertas, fraseDasSessoesQueCairam } from "./sessoes-regras";
import {
  Aviso, AvisoDeObrigatorios, Carregando, Cartao, TabelaEnvolucro, Vazio, formatarDataHora,
  iniciais,
} from "../componentes/comuns";
import { Campo } from "../componentes/Campo";
import { ConfirmarAcao } from "../componentes/ConfirmarAcao";
import { IconeCheck, IconeMais } from "../componentes/Icones";
import { Modal } from "../componentes/Modal";
import { Toast } from "../componentes/Toast";
import { useTitulo } from "../seo/titulo";
import { depoisDePintar, focarPrimeiroInvalido } from "../componentes/foco";

/**
 * Usuários do município.
 *
 * O papel escolhido aqui não é rótulo: ele decide o que a pessoa vê no menu e
 * quais transições ela pode disparar. Agente de campo não despacha, operador
 * não encerra. É o mesmo princípio de menor privilégio que o RLS aplica no
 * banco, expresso na camada de gente.
 */
export function Usuarios() {
  useTitulo("Usuários");
  const sessao = useSessaoObrigatoria();
  const [usuarios, setUsuarios] = useState<LinhaUsuario[] | null>(null);
  const [equipes, setEquipes] = useState<LinhaEquipe[]>([]);
  const [erro, setErro] = useState<string | null>(null);
  const [errosDeCampo, setErrosDeCampo] = useState<Record<string, string>>({});
  /* Quem está sendo corrigido. Nulo é cadastro novo. */
  const [editando, setEditando] = useState<string | null>(null);

  const [nome, setNome] = useState("");
  const [matricula, setMatricula] = useState("");
  const [email, setEmail] = useState("");
  const [papel, setPapel] = useState<Papel>("agente_campo");
  const [equipeId, setEquipeId] = useState("");
  const [senha, setSenha] = useState("");
  /*
    Quem está a um clique de perder o acesso.

    "Desativar" ficava numa célula de tabela, colado em "Corrigir", numa lista
    de linhas que só se distinguem pelo nome. Um clique na linha de cima tira
    do ar a conta de quem está de plantão agora: a sessão dela é derrubada e o
    aplicativo de campo para de sincronizar no meio de uma vistoria. Reativar
    desfaz, mas quem descobre é a pessoa em campo, sem sinal, sem saber por quê.
  */
  const [aDesativar, setADesativar] = useState<LinhaUsuario | null>(null);
  const [desativando, setDesativando] = useState(false);
  /*
    A senha que o servidor acabou de sortear, na janela que a mostra UMA vez, e
    o aviso passageiro de "sessões encerradas". Os dois moram na página, e não
    no botão da linha, porque a linha pode sumir da tela (a lista recarrega) e
    a senha não pode ir junto: ela não volta.
  */
  const [senhaGerada, setSenhaGerada] = useState<SenhaRedefinida | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  const recarregar = useCallback(async () => {
    const [u, e] = await Promise.all([listarUsuarios(sessao), listarEquipes(sessao)]);
    setUsuarios(u);
    setEquipes(e);
  }, [sessao]);

  useEffect(() => {
    recarregar().catch((e: unknown) => setErro(e instanceof Error ? e.message : String(e)));
  }, [recarregar]);

  async function submeter(evento: React.FormEvent) {
    evento.preventDefault();
    const formulario = evento.currentTarget as HTMLFormElement;

    /*
      Validação pelo mesmo schema que o servidor usa, e o erro vai para o
      campo, não para um aviso genérico no topo.

      Antes eram duas regras diferentes: a da API, completa, e uma cópia mais
      fraca aqui, que não conferia formato de email nem tamanho máximo. Quem
      preenchia descobria no envio um erro que a tela poderia ter apontado no
      lugar certo. E a anatomia do erro divergia do resto do produto, onde todo
      formulário marca o campo com `aria-invalid` e explica embaixo dele.

      No modo local não há senha: a entrada é por escolha de perfil.
    */
    // Editar não pede senha: trocar senha derruba sessões e é outro ato. No
    // modo local não há senha nem no cadastro, porque a entrada é por perfil.
    const molde = MODO === "api" && !editando
      ? cadastroUsuarioSchema
      : cadastroUsuarioSchema.omit({ senha: true });

    const conferido = molde.safeParse({
      nome, matricula, email, papel,
      equipeId: papel === "agente_campo" && equipeId ? equipeId : null,
      ...(MODO === "api" && !editando ? { senha } : {}),
    });

    if (!conferido.success) {
      const porCampo: Record<string, string> = {};
      for (const problema of conferido.error.issues) {
        const campo = String(problema.path[0] ?? "");
        porCampo[campo] ??= problema.message;
      }
      setErrosDeCampo(porCampo);
      setErro(null);
      depoisDePintar(() => focarPrimeiroInvalido(formulario));
      return;
    }

    setErrosDeCampo({});
    setErro(null);
    try {
      const dados = {
        nome, matricula, email, papel,
        equipeId: papel === "agente_campo" && equipeId ? equipeId : null,
      };
      if (editando) {
        await atualizarUsuario(sessao, editando, dados);
      } else {
        await criarUsuario(sessao, {
          ...dados,
          ...(MODO === "api" ? { senha } : {}),
        });
      }
      limparFormulario();
      await recarregar();
    } catch (e: unknown) {
      const texto = e instanceof Error ? e.message : String(e);
      setErro(/duplicate key|unique/i.test(texto)
        ? "Já existe usuário com essa matrícula ou esse email neste município."
        : texto);
    }
  }

  async function alternarAtivo(u: LinhaUsuario): Promise<void> {
    if (desativando) return;
    setDesativando(true);
    try {
      await alternarUsuarioAtivo(sessao, u.id, !u.ativo);
      setADesativar(null);
      await recarregar();
    } catch (e: unknown) {
      setErro(e instanceof Error ? e.message : String(e));
    } finally {
      setDesativando(false);
    }
  }

  function limparFormulario(): void {
    setNome(""); setMatricula(""); setEmail(""); setEquipeId(""); setSenha("");
    setPapel("agente_campo");
    setErrosDeCampo({});
    setEditando(null);
  }

  function editar(u: LinhaUsuario): void {
    setEditando(u.id);
    setNome(u.nome);
    setMatricula(u.matricula);
    setEmail(u.email);
    setPapel(u.papel);
    setEquipeId(u.equipe_id ?? "");
    setSenha("");
    setErrosDeCampo({});
    setErro(null);
  }

  if (!usuarios && !erro) return <Carregando />;

  return (
    <>
      <div className="cabecalho-pagina">
        <div>
          <h1>Usuários</h1>
          <p>{sessao.organizacaoNome}</p>
        </div>
      </div>

      {erro && <Aviso tom="perigo">{erro}</Aviso>}

      <div className="detalhe">
        <div className="coluna">
          <Cartao titulo={editando ? "Corrigir cadastro" : "Cadastrar usuário"}>
            <form onSubmit={submeter} noValidate>
              <AvisoDeObrigatorios />
              <div className="linha-campos">
                <Campo id="usuario-nome" rotulo="Nome completo" erro={errosDeCampo["nome"]}>
                  {(campo) => (
                    <input {...campo} type="text" value={nome}
                           onChange={(e) => setNome(e.target.value)} />
                  )}
                </Campo>
                <Campo id="usuario-matricula" rotulo="Matrícula" erro={errosDeCampo["matricula"]}>
                  {(campo) => (
                    <input {...campo} type="text" value={matricula}
                           onChange={(e) => setMatricula(e.target.value)} placeholder="SA-4001" />
                  )}
                </Campo>
              </div>
              <div className="linha-campos">
                <Campo id="usuario-email" rotulo="Email funcional" erro={errosDeCampo["email"]}
                       dica={podeTrocarEmail(sessao.papel, editando !== null)
                         ? undefined : DICA_DO_EMAIL_TRAVADO}>
                  {(campo) => (
                    <input {...campo} type="email" value={email}
                           /*
                             Ao corrigir, só o administrador troca o email de
                             outra pessoa: é a identidade de login, e a API
                             recusa (`email_so_por_administrador`). O campo
                             continua visível, travado, com a dica dizendo a
                             quem pedir. Ver `usuarios-regras.ts`.
                           */
                           disabled={!podeTrocarEmail(sessao.papel, editando !== null)}
                           onChange={(e) => setEmail(e.target.value)} />
                  )}
                </Campo>
                <Campo id="usuario-papel" rotulo="Papel">
                  {(campo) => (
                    <select {...campo} value={papel}
                            onChange={(e) => setPapel(e.target.value as Papel)}>
                      {/*
                        Só os papéis que este posto concede. Um coordenador não
                        cria administrador, e o servidor recusa; oferecer a opção
                        seria construir a recusa de propósito.
                      */}
                      {papeisQuePodeConceder(sessao.papel).map((p) => (
                        <option key={p} value={p}>{ROTULO_PAPEL[p]}</option>
                      ))}
                    </select>
                  )}
                </Campo>
              </div>
              {papel === "agente_campo" && (
                <Campo id="usuario-equipe" rotulo="Equipe" opcional>
                  {(campo) => (
                    <select {...campo} value={equipeId}
                            onChange={(e) => setEquipeId(e.target.value)}>
                      <option value="">Sem equipe fixa</option>
                      {equipes.map((e) => <option key={e.id} value={e.id}>{e.nome}</option>)}
                    </select>
                  )}
                </Campo>
              )}
              {MODO === "api" && !editando && (
                <Campo
                  id="usuario-senha"
                  rotulo="Senha inicial"
                  erro={errosDeCampo["senha"]}
                  dica={"Mínimo de 12 caracteres. Sem exigência de símbolo ou número: regra de "
                    + "composição só produz senha pior e mais difícil de lembrar."}
                >
                  {(campo) => (
                    <input {...campo} type="password" value={senha}
                           autoComplete="new-password"
                           onChange={(e) => setSenha(e.target.value)} />
                  )}
                </Campo>
              )}
              {editando && (
                <p className="campo__dica">
                  A senha não muda por aqui. Quem troca senha é a própria
                  pessoa, em "Minha conta", ou o link de recuperação.
                </p>
              )}
              <div style={{ display: "flex", gap: "var(--ds-sp-2)" }}>
                <button type="submit" className="botao botao--primario">
                  {editando ? "Salvar correção" : <><IconeMais /> Cadastrar usuário</>}
                </button>
                {editando && (
                  <button type="button" className="botao botao--secundario"
                          onClick={limparFormulario}>
                    Cancelar
                  </button>
                )}
              </div>
            </form>
          </Cartao>
        </div>

        <div className="coluna">
          <Cartao titulo="O que cada papel pode fazer">
            <dl className="lista-papeis">
              <dt className="par__rotulo">Operador de plantão</dt>
              <dd className="par__valor lista-papeis__descricao">
                Registra chamado e consulta. Não classifica, não despacha, não encerra.
              </dd>
              <dt className="par__rotulo">Coordenador</dt>
              <dd className="par__valor lista-papeis__descricao">
                Faz triagem, despacha equipe, encaminha providência e encerra com motivo.
              </dd>
              <dt className="par__rotulo">Agente de campo</dt>
              <dd className="par__valor lista-papeis__descricao">
                Recebe a ocorrência no aplicativo, coleta a vistoria e assina. Trabalha offline.
              </dd>
              <dt className="par__rotulo">Administrador da organização</dt>
              <dd className="par__valor lista-papeis__descricao lista-papeis__descricao--ultima">
                Gerencia equipes e usuários do próprio município, e mais nada de outro município.
              </dd>
            </dl>
          </Cartao>

          <Cartao titulo="Por que não existe excluir">
            <p style={{ margin: 0, fontSize: "var(--ds-fs-body-sm)", lineHeight: "var(--ds-lh-body-sm)" }}>
              Usuário assina laudo e aparece na trilha de auditoria. Desativar tira o acesso e
              some das listas; apagar deixaria registros oficiais sem autor identificado.
            </p>
          </Cartao>
        </div>

        {/*
          A lista ocupa a largura toda da grade, e não a coluna estreita: com
          seis colunas (pessoa, matrícula, papel, equipe, situação, ação) ela
          precisava de 854px, o cartão tinha 569 a 771 entre 1280 e 1680px de
          tela, e a barra de rolagem do macOS some quando ninguém rola.
          Equipe, Situação e os botões simplesmente não apareciam.
        */}
        <div className="detalhe__larga">
          <Cartao titulo="Usuários do município">
            {MODO === "local" && (
              <Aviso tom="info">
                Neste painel a entrada é por escolha de perfil, sem senha e sem sessão,
                então não há senha para redefinir nem sessão para encerrar. Esses dois
                botões aparecem quando o painel está ligado ao servidor da prefeitura,
                que é o caminho de produção.
              </Aviso>
            )}
            {usuarios && usuarios.length === 0 ? (
              <Vazio titulo="Nenhum usuário cadastrado">
                <p>Cadastre o primeiro usuário no formulário ao lado para que alguém possa
                  registrar chamado, ir a campo e assinar laudo.</p>
              </Vazio>
            ) : (
              <TabelaEnvolucro>
                <table className="tabela tabela--justa">
                  <thead>
                    <tr>
                      <th scope="col">Pessoa</th>
                      <th scope="col">Matrícula</th>
                      <th scope="col">Papel</th>
                      <th scope="col">Equipe</th>
                      <th scope="col">Situação</th>
                      <th scope="col">Ação</th>
                    </tr>
                  </thead>
                  <tbody>
                    {usuarios?.map((u) => (
                      <tr key={u.id}>
                        <td>
                          <div className="tabela__pessoa">
                            <span className="conta__avatar conta__avatar--pequeno" aria-hidden="true">
                              {iniciais(u.nome)}
                            </span>
                            <span>
                              <div className="tabela__principal">{u.nome}</div>
                              <div className="tabela__secundario">{u.email}</div>
                            </span>
                          </div>
                        </td>
                        <td className="mono">{u.matricula}</td>
                        <td>{ROTULO_PAPEL[u.papel]}</td>
                        <td>{u.equipe_nome ?? <span className="tabela__secundario">Sem equipe</span>}</td>
                        <td>
                          <span className={`selo selo--${u.ativo ? "sucesso" : "neutro"}`}>
                            {u.ativo ? "Ativo" : "Inativo"}
                          </span>
                        </td>
                        <td>
                          <div className="tabela__acoes">
                          {/*
                            Os dois botões seguem o POSTO (ADR 0006): o
                            coordenador administra quem está abaixo dele, e só o
                            administrador administra o próprio posto. A API
                            recusa com 403 de qualquer jeito; aqui o botão fica
                            travado com o motivo no `title`, em vez de oferecer
                            o que vai ser negado. Ver `usuarios-regras.ts`.
                          */}
                          <button type="button" className="botao botao--discreto"
                                  disabled={motivoParaNaoAdministrar(sessao.papel, u) !== null}
                                  title={motivoParaNaoAdministrar(sessao.papel, u) ?? undefined}
                                  onClick={() => editar(u)}>
                            Corrigir
                          </button>
                          {/*
                            Só a DESATIVAÇÃO pergunta. Reativar devolve o
                            acesso e não tira nada de ninguém; pedir confirmação
                            também para ela ensinaria a clicar em "sim" sem ler,
                            e a pergunta que importa perderia o efeito.
                          */}
                          <button type="button" className="botao botao--discreto"
                                  disabled={u.id === sessao.usuarioId
                                    || motivoParaNaoAdministrar(sessao.papel, u) !== null}
                                  title={u.id === sessao.usuarioId
                                    ? "Você não pode desativar a própria conta"
                                    : motivoParaNaoAdministrar(sessao.papel, u) ?? undefined}
                                  onClick={() => {
                                    if (u.ativo) setADesativar(u);
                                    else void alternarAtivo(u);
                                  }}>
                            {u.ativo ? "Desativar" : "Reativar"}
                          </button>
                          {/*
                            Redefinir a senha e encerrar as sessões de OUTRA
                            pessoa. Pela mesma função de posto da tela (nunca
                            uma cópia da regra), só em quem este posto
                            administra, e nunca na própria conta: a API recusa
                            as duas (`autoredefinicao`, `autoencerramento`) e
                            oferecer o botão seria construir a recusa. No modo
                            local não há senha nem token, e o aviso acima diz
                            por quê.
                          */}
                          {MODO === "api"
                            && motivoParaNaoAdministrar(sessao.papel, u) === null
                            && u.id !== sessao.usuarioId && (
                            <>
                              <BotaoRedefinirSenha alvo={u} aoRedefinir={setSenhaGerada} />
                              <BotaoEncerrarSessoes alvo={u} aoEncerrar={setAviso} />
                            </>
                          )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </TabelaEnvolucro>
            )}
          </Cartao>
        </div>
      </div>

      <ConfirmarAcao
        aberto={aDesativar !== null}
        titulo="Desativar usuário"
        consequencia={
          <>
            A pessoa perde o acesso agora: as sessões dela caem e o aplicativo
            de campo para de sincronizar. O nome continua nos laudos que ela
            assinou e na trilha de auditoria, e reativar devolve o acesso.
          </>
        }
        rotuloDaAcao={`Desativar ${aDesativar?.nome ?? "usuário"}`}
        destrutiva
        ocupado={desativando}
        aoConfirmar={() => { if (aDesativar) void alternarAtivo(aDesativar); }}
        aoCancelar={() => setADesativar(null)}
      >
        {aDesativar && (
          /*
            A matrícula e o email na janela não são enfeite: a lista tem
            homônimos e nomes parecidos, e é aqui que dá para perceber que a
            linha clicada não era a que se estava lendo.
          */
          <p className="campo__dica">
            <span className="mono">{aDesativar.matricula}</span>, {aDesativar.email},{" "}
            {ROTULO_PAPEL[aDesativar.papel]}
            {aDesativar.equipe_nome ? `, ${aDesativar.equipe_nome}` : ""}.
          </p>
        )}
      </ConfirmarAcao>

      {/*
        A senha sai UMA vez, e fechar sem anotar a perde. Por isso a janela não
        fecha por clique fora (o que apagaria a única cópia no meio de uma
        leitura) e não tem o "Fechar" do canto: a saída é o botão que diz que a
        senha foi anotada. Escape ainda fecha, como em toda janela do painel.
      */}
      <Modal
        aberto={senhaGerada !== null}
        titulo="Senha temporária"
        aoFechar={() => setSenhaGerada(null)}
        fecharAoClicarFora={false}
        mostrarBotaoFechar={false}
      >
        {senhaGerada && (
          <SenhaTemporaria resultado={senhaGerada} aoFechar={() => setSenhaGerada(null)} />
        )}
      </Modal>

      {aviso && <Toast tom="sucesso" mensagem={aviso} aoFechar={() => setAviso(null)} />}
    </>
  );
}

type PropsBotaoRedefinirSenha = {
  alvo: LinhaUsuario;
  aoRedefinir: (resultado: SenhaRedefinida) => void;
};

/**
 * "Redefinir senha", na linha de quem está abaixo do posto de quem olha.
 *
 * Pergunta antes porque o ato derruba o acesso de alguém AGORA: a senha antiga
 * deixa de valer, as sessões caem, e quem estava em campo para de sincronizar.
 * O botão da pergunta repete o nome da pessoa, para a linha clicada não ser a
 * errada de uma lista cheia de nomes parecidos.
 */
function BotaoRedefinirSenha({ alvo, aoRedefinir }: PropsBotaoRedefinirSenha) {
  const sessao = useSessaoObrigatoria();
  const [aberto, setAberto] = useState(false);
  const [gravando, setGravando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  // Ninguém redefine a própria senha por aqui: o servidor recusa
  // (`autoredefinicao`, 422) e exige a senha atual em "Minha conta".
  if (alvo.id === sessao.usuarioId) return null;

  async function confirmar(): Promise<void> {
    if (gravando) return;
    setGravando(true);
    setErro(null);
    try {
      const resultado = await redefinirSenhaDeUsuario(alvo.id);
      setAberto(false);
      aoRedefinir(resultado);
    } catch (e: unknown) {
      setErro(e instanceof Error ? e.message : String(e));
    } finally {
      setGravando(false);
    }
  }

  return (
    <>
      <button type="button" className="botao botao--discreto"
              onClick={() => { setErro(null); setAberto(true); }}>
        Redefinir senha
      </button>
      <ConfirmarAcao
        aberto={aberto}
        titulo="Redefinir senha"
        consequencia={
          <>
            A senha atual de {alvo.nome} deixa de valer agora e as sessões abertas
            caem. O sistema sorteia uma senha temporária, mostrada uma única vez,
            que vale por 72 horas e precisa ser trocada na primeira entrada.
          </>
        }
        rotuloDaAcao={`Redefinir a senha de ${alvo.nome}`}
        destrutiva
        ocupado={gravando}
        aoConfirmar={() => void confirmar()}
        aoCancelar={() => setAberto(false)}
      >
        <p className="campo__dica">
          <span className="mono">{alvo.matricula}</span>, {alvo.email},{" "}
          {ROTULO_PAPEL[alvo.papel]}.
        </p>
        {erro && <Aviso tom="perigo">{erro}</Aviso>}
      </ConfirmarAcao>
    </>
  );
}

type PropsBotaoEncerrarSessoes = {
  alvo: LinhaUsuario;
  /** Recebe a frase do aviso passageiro, já escrita. */
  aoEncerrar: (frase: string) => void;
};

/**
 * "Encerrar sessões": o botão do celular perdido.
 *
 * Tira o acesso agora e não mexe na senha, para quem talvez volte ao trabalho
 * em uma hora. A pergunta diz QUANTAS sessões a pessoa tem abertas (leitura
 * própria, só quantidade e datas), e continua valendo se a leitura falhar: o
 * ato não depende dela.
 */
function BotaoEncerrarSessoes({ alvo, aoEncerrar }: PropsBotaoEncerrarSessoes) {
  const sessao = useSessaoObrigatoria();
  const [aberto, setAberto] = useState(false);
  const [gravando, setGravando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  /* `null` enquanto lê, `"falhou"` se a leitura não veio. */
  const [abertas, setAbertas] = useState<SessoesAbertasDeOutrem | "falhou" | null>(null);

  // Quem quer sair dos próprios aparelhos usa "Minha conta", onde a sessão de
  // onde clicou continua aberta. Aqui o servidor recusa (`autoencerramento`).
  if (alvo.id === sessao.usuarioId) return null;

  async function perguntar(): Promise<void> {
    setErro(null);
    setAbertas(null);
    setAberto(true);
    try {
      setAbertas(await sessoesDeUsuario(alvo.id));
    } catch {
      setAbertas("falhou");
    }
  }

  async function confirmar(): Promise<void> {
    if (gravando) return;
    setGravando(true);
    setErro(null);
    try {
      const r = await encerrarSessoesDeUsuario(alvo.id);
      setAberto(false);
      aoEncerrar(
        r.sessoesEncerradas === 0
          ? `${alvo.nome} não tinha sessão aberta. Nada foi encerrado.`
          : `Sessões de ${alvo.nome} encerradas. ${
            r.sessoesEncerradas === 1 ? "1 sessão caiu" : `${r.sessoesEncerradas} sessões caíram`}.`,
      );
    } catch (e: unknown) {
      setErro(e instanceof Error ? e.message : String(e));
    } finally {
      setGravando(false);
    }
  }

  const leitura = abertas === null
    ? "Conferindo quantas sessões estão abertas."
    : abertas === "falhou"
      ? "Não foi possível conferir quantas sessões estão abertas, mas você pode encerrar mesmo assim."
      : fraseDasSessoesAbertas(
        alvo.nome,
        abertas.sessoesAbertas,
        abertas.ultimaEntradaEm ? formatarDataHora(abertas.ultimaEntradaEm) : null,
      );

  return (
    <>
      <button type="button" className="botao botao--discreto" onClick={() => void perguntar()}>
        Encerrar sessões
      </button>
      <ConfirmarAcao
        aberto={aberto}
        titulo="Encerrar sessões"
        consequencia={
          <>
            {alvo.nome} sai de todos os navegadores e aparelhos agora e precisa entrar de
            novo com a própria senha, que não muda. Quem está em campo fica sem sincronizar
            até entrar outra vez.
          </>
        }
        rotuloDaAcao={`Encerrar sessões de ${alvo.nome}`}
        destrutiva
        ocupado={gravando}
        aoConfirmar={() => void confirmar()}
        aoCancelar={() => setAberto(false)}
      >
        <p className="campo__dica" role="status">{leitura}</p>
        {erro && <Aviso tom="perigo">{erro}</Aviso>}
      </ConfirmarAcao>
    </>
  );
}

/**
 * A senha temporária, mostrada UMA vez.
 *
 * O servidor guarda só o hash e nem ele consegue mostrá-la de novo, então esta
 * janela é a única chance de quem administra anotá-la, ditá-la por telefone ou
 * entregá-la em mãos (com a recuperação por e-mail desligada não existe outro
 * canal). Por isso: fonte tabular e seleção com um toque (o zero não pode virar
 * letra nem o "1" ocupar meia largura quando se dita), botão de copiar, e a
 * frase que diz que ela não volta.
 *
 * A mensagem do servidor chega inteira porque diz DE QUEM é a senha, a
 * validade e a obrigação de trocar na primeira entrada.
 */
export function SenhaTemporaria({ resultado, aoFechar }: {
  resultado: SenhaRedefinida;
  aoFechar: () => void;
}) {
  const [copia, setCopia] = useState<"nao" | "sim" | "falhou">("nao");

  async function copiar(): Promise<void> {
    try {
      await navigator.clipboard.writeText(resultado.senhaTemporaria);
      setCopia("sim");
    } catch {
      // Copiar pode ser recusado (permissão, página sem contexto seguro): a
      // senha continua na tela, selecionável, e a frase diz o que fazer.
      setCopia("falhou");
    }
  }

  return (
    <div className="senha-temporaria">
      <Aviso tom="alerta">
        <strong>Anote agora.</strong> Esta senha não aparece de novo: o sistema não guarda o
        texto dela. Se fechar esta janela sem anotar, redefina a senha outra vez.
      </Aviso>

      <p className="senha-temporaria__mensagem">{resultado.mensagem}</p>

      <div className="senha-temporaria__bloco">
        <span className="par__rotulo">Senha temporária</span>
        <p className="senha-temporaria__valor mono">{resultado.senhaTemporaria}</p>
      </div>

      <p className="campo__dica" style={{ margin: 0 }}>
        {fraseDasSessoesQueCairam(resultado.sessoesEncerradas)}
      </p>

      <div className="senha-temporaria__acoes">
        <button type="button" className="botao botao--secundario" onClick={() => void copiar()}>
          Copiar senha
        </button>
        <button type="button" className="botao botao--primario" onClick={aoFechar}>
          Já anotei a senha
        </button>
      </div>

      {/* A região existe antes do texto, senão o leitor de tela não anuncia a mudança. */}
      <p className="senha-temporaria__estado" role="status" aria-live="polite">
        {copia === "sim" && (<><IconeCheck tamanho={16} /> Senha copiada.</>)}
        {copia === "falhou"
          && "Não foi possível copiar. Selecione a senha na tela e copie com Ctrl+C."}
      </p>
    </div>
  );
}
