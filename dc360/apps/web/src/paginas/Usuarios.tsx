import { useCallback, useEffect, useState } from "react";
import {
  ROTULO_PAPEL, cadastroUsuarioSchema, papeisQuePodeConceder, type Papel,
} from "@dc360/shared";
import {
  MODO, alternarUsuarioAtivo, criarUsuario, listarEquipes, listarUsuarios,
  type LinhaEquipe, type LinhaUsuario,
} from "../dados/repositorio";
import { useSessaoObrigatoria } from "../estado/sessao";
import { Aviso, Carregando, Cartao, ErroCampo, Vazio, iniciais } from "../componentes/comuns";
import { IconeMais } from "../componentes/Icones";

/**
 * Usuários do município.
 *
 * O papel escolhido aqui não é rótulo: ele decide o que a pessoa vê no menu e
 * quais transições ela pode disparar. Agente de campo não despacha, operador
 * não encerra. É o mesmo princípio de menor privilégio que o RLS aplica no
 * banco, expresso na camada de gente.
 */
export function Usuarios() {
  const sessao = useSessaoObrigatoria();
  const [usuarios, setUsuarios] = useState<LinhaUsuario[] | null>(null);
  const [equipes, setEquipes] = useState<LinhaEquipe[]>([]);
  const [erro, setErro] = useState<string | null>(null);
  const [errosDeCampo, setErrosDeCampo] = useState<Record<string, string>>({});

  const [nome, setNome] = useState("");
  const [matricula, setMatricula] = useState("");
  const [email, setEmail] = useState("");
  const [papel, setPapel] = useState<Papel>("agente_campo");
  const [equipeId, setEquipeId] = useState("");
  const [senha, setSenha] = useState("");

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
    const molde = MODO === "api"
      ? cadastroUsuarioSchema
      : cadastroUsuarioSchema.omit({ senha: true });

    const conferido = molde.safeParse({
      nome, matricula, email, papel,
      equipeId: papel === "agente_campo" && equipeId ? equipeId : null,
      ...(MODO === "api" ? { senha } : {}),
    });

    if (!conferido.success) {
      const porCampo: Record<string, string> = {};
      for (const problema of conferido.error.issues) {
        const campo = String(problema.path[0] ?? "");
        porCampo[campo] ??= problema.message;
      }
      setErrosDeCampo(porCampo);
      setErro(null);
      return;
    }

    setErrosDeCampo({});
    setErro(null);
    try {
      await criarUsuario(sessao, {
        nome, matricula, email, papel,
        equipeId: papel === "agente_campo" && equipeId ? equipeId : null,
        ...(MODO === "api" ? { senha } : {}),
      });
      setNome(""); setMatricula(""); setEmail(""); setEquipeId(""); setSenha("");
      setErrosDeCampo({});
      await recarregar();
    } catch (e: unknown) {
      const texto = e instanceof Error ? e.message : String(e);
      setErro(/duplicate key|unique/i.test(texto)
        ? "Já existe usuário com essa matrícula ou esse email neste município."
        : texto);
    }
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
          <Cartao titulo="Cadastrar usuário">
            <form onSubmit={submeter}>
              <div className="linha-campos">
                <div className="campo">
                  <label htmlFor="usuario-nome">Nome completo</label>
                  <input id="usuario-nome" type="text" value={nome}
                         aria-invalid={Boolean(errosDeCampo["nome"])}
                         aria-describedby={errosDeCampo["nome"] ? "usuario-nome-erro" : undefined}
                         onChange={(e) => setNome(e.target.value)} />
                  {errosDeCampo["nome"] && (
                    <ErroCampo id="usuario-nome-erro">{errosDeCampo["nome"]}</ErroCampo>
                  )}
                </div>
                <div className="campo">
                  <label htmlFor="usuario-matricula">Matrícula</label>
                  <input id="usuario-matricula" type="text" value={matricula}
                         aria-invalid={Boolean(errosDeCampo["matricula"])}
                         aria-describedby={errosDeCampo["matricula"] ? "usuario-matricula-erro" : undefined}
                         onChange={(e) => setMatricula(e.target.value)} placeholder="SA-4001" />
                  {errosDeCampo["matricula"] && (
                    <ErroCampo id="usuario-matricula-erro">{errosDeCampo["matricula"]}</ErroCampo>
                  )}
                </div>
              </div>
              <div className="linha-campos">
                <div className="campo">
                  <label htmlFor="usuario-email">Email funcional</label>
                  <input id="usuario-email" type="email" value={email}
                         aria-invalid={Boolean(errosDeCampo["email"])}
                         aria-describedby={errosDeCampo["email"] ? "usuario-email-erro" : undefined}
                         onChange={(e) => setEmail(e.target.value)} />
                  {errosDeCampo["email"] && (
                    <ErroCampo id="usuario-email-erro">{errosDeCampo["email"]}</ErroCampo>
                  )}
                </div>
                <div className="campo">
                  <label htmlFor="usuario-papel">Papel</label>
                  <select id="usuario-papel" value={papel} onChange={(e) => setPapel(e.target.value as Papel)}>
                    {/*
                      Só os papéis que este posto concede. Um coordenador não
                      cria administrador, e o servidor recusa; oferecer a opção
                      seria construir a recusa de propósito.
                    */}
                    {papeisQuePodeConceder(sessao.papel).map((p) => (
                      <option key={p} value={p}>{ROTULO_PAPEL[p]}</option>
                    ))}
                  </select>
                </div>
              </div>
              {papel === "agente_campo" && (
                <div className="campo">
                  <label htmlFor="usuario-equipe">Equipe</label>
                  <select id="usuario-equipe" value={equipeId} onChange={(e) => setEquipeId(e.target.value)}>
                    <option value="">Sem equipe fixa</option>
                    {equipes.map((e) => <option key={e.id} value={e.id}>{e.nome}</option>)}
                  </select>
                </div>
              )}
              {MODO === "api" && (
                <div className="campo">
                  <label htmlFor="usuario-senha">Senha inicial</label>
                  <input id="usuario-senha" type="password" value={senha}
                         autoComplete="new-password"
                         aria-invalid={Boolean(errosDeCampo["senha"])}
                         aria-describedby={errosDeCampo["senha"] ? "usuario-senha-erro" : undefined}
                         onChange={(e) => setSenha(e.target.value)} />
                  {errosDeCampo["senha"] && (
                    <ErroCampo id="usuario-senha-erro">{errosDeCampo["senha"]}</ErroCampo>
                  )}
                  <span className="campo__dica">
                    Mínimo de 12 caracteres. Sem exigência de símbolo ou número: regra de
                    composição só produz senha pior e mais difícil de lembrar.
                  </span>
                </div>
              )}
              <button type="submit" className="botao botao--primario">
                <IconeMais /> Cadastrar usuário
              </button>
            </form>
          </Cartao>

          <Cartao titulo="Usuários do município">
            {usuarios && usuarios.length === 0 ? (
              <Vazio titulo="Nenhum usuário cadastrado">
                <p>Cadastre o primeiro usuário no formulário ao lado para que alguém possa
                  registrar chamado, ir a campo e assinar laudo.</p>
              </Vazio>
            ) : (
              <div className="tabela-envolucro">
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
                          <button type="button" className="botao botao--discreto"
                                  disabled={u.id === sessao.usuarioId}
                                  title={u.id === sessao.usuarioId
                                    ? "Você não pode desativar a própria conta"
                                    : undefined}
                                  onClick={() => {
                                    alternarUsuarioAtivo(sessao, u.id, !u.ativo)
                                      .then(recarregar)
                                      .catch((e: unknown) =>
                                        setErro(e instanceof Error ? e.message : String(e)));
                                  }}>
                            {u.ativo ? "Desativar" : "Reativar"}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
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
      </div>
    </>
  );
}
