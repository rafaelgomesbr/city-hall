import { useCallback, useEffect, useState } from "react";
import {
  ROTULO_PAPEL, cadastroUsuarioSchema, papeisQuePodeConceder, type Papel,
} from "@dc360/shared";
import {
  MODO, alternarUsuarioAtivo, atualizarUsuario, criarUsuario, listarEquipes, listarUsuarios,
  type LinhaEquipe, type LinhaUsuario,
} from "../dados/repositorio";
import { useSessaoObrigatoria } from "../estado/sessao";
import {
  DICA_DO_EMAIL_TRAVADO, motivoParaNaoAdministrar, podeTrocarEmail,
} from "./usuarios-regras";
import {
  Aviso, AvisoDeObrigatorios, Carregando, Cartao, TabelaEnvolucro, Vazio, iniciais,
} from "../componentes/comuns";
import { Campo } from "../componentes/Campo";
import { ConfirmarAcao } from "../componentes/ConfirmarAcao";
import { IconeMais } from "../componentes/Icones";
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
            {usuarios && usuarios.length === 0 ? (
              <Vazio titulo="Nenhum usuário cadastrado">
                <p>Cadastre o primeiro usuário no formulário ao lado para que alguém possa
                  registrar chamado, ir a campo e assinar laudo.</p>
              </Vazio>
            ) : (
              <TabelaEnvolucro>
                <table className="tabela">
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
                          <div style={{ display: "flex", alignItems: "center", gap: "var(--ds-sp-3)" }}>
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
    </>
  );
}
