import { useCallback, useEffect, useState } from "react";
import { cadastroEquipeSchema } from "@dc360/shared";
import {
  atualizarEquipe, criarEquipe, listarEquipes, type LinhaEquipe,
} from "../dados/repositorio";
import { useSessaoObrigatoria } from "../estado/sessao";
import { Aviso, Carregando, Cartao, ErroCampo, Vazio } from "../componentes/comuns";
import { IconeMais } from "../componentes/Icones";

/**
 * Equipes do município.
 *
 * Equipe não é apagada quando some do plantão: é desativada. Ela aparece em
 * despacho antigo e em laudo já emitido, e esses registros precisam continuar
 * apontando para algo depois do fato.
 */
export function Equipes() {
  const sessao = useSessaoObrigatoria();
  const [equipes, setEquipes] = useState<LinhaEquipe[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [errosDeCampo, setErrosDeCampo] = useState<Record<string, string>>({});
  const [editando, setEditando] = useState<string | null>(null);
  const [nome, setNome] = useState("");
  const [especialidade, setEspecialidade] = useState("");

  const recarregar = useCallback(async () => {
    setEquipes(await listarEquipes(sessao));
  }, [sessao]);

  useEffect(() => {
    recarregar().catch((e: unknown) => setErro(e instanceof Error ? e.message : String(e)));
  }, [recarregar]);

  async function submeter(evento: React.FormEvent) {
    evento.preventDefault();

    // Mesmo schema do servidor, erro no campo. Ver a explicação em Usuarios.tsx:
    // a anatomia de erro do produto é `aria-invalid` mais texto sob o campo.
    const conferido = cadastroEquipeSchema.safeParse({ nome, especialidade });
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
      if (editando) {
        const atual = equipes?.find((e) => e.id === editando);
        await atualizarEquipe(sessao, editando, nome, especialidade, atual?.ativa ?? true);
      } else {
        await criarEquipe(sessao, nome, especialidade);
      }
      setNome(""); setEspecialidade(""); setEditando(null); setErrosDeCampo({});
      await recarregar();
    } catch (e: unknown) {
      const texto = e instanceof Error ? e.message : String(e);
      setErro(/duplicate key|unique/i.test(texto)
        ? "Já existe uma equipe com esse nome neste município."
        : texto);
    }
  }

  async function alternarAtiva(e: LinhaEquipe) {
    try {
      await atualizarEquipe(sessao, e.id, e.nome, e.especialidade ?? "", !e.ativa);
      await recarregar();
    } catch (erroAlternar: unknown) {
      setErro(erroAlternar instanceof Error ? erroAlternar.message : String(erroAlternar));
    }
  }

  if (!equipes && !erro) return <Carregando />;

  return (
    <>
      <div className="cabecalho-pagina">
        <div>
          <h1>Equipes</h1>
          <p>{sessao.organizacaoNome}</p>
        </div>
      </div>

      {erro && <Aviso tom="perigo">{erro}</Aviso>}

      <div className="detalhe">
        <div className="coluna">
          <Cartao titulo={editando ? "Editar equipe" : "Cadastrar equipe"}>
            <form onSubmit={submeter}>
              <div className="linha-campos">
                <div className="campo">
                  <label htmlFor="equipe-nome">Nome</label>
                  <input id="equipe-nome" type="text" value={nome}
                         aria-invalid={Boolean(errosDeCampo["nome"])}
                         aria-describedby={errosDeCampo["nome"] ? "equipe-nome-erro" : undefined}
                         onChange={(ev) => setNome(ev.target.value)} placeholder="Equipe Delta" />
                  {errosDeCampo["nome"] && (
                    <ErroCampo id="equipe-nome-erro">{errosDeCampo["nome"]}</ErroCampo>
                  )}
                </div>
                <div className="campo">
                  <label htmlFor="equipe-especialidade">Especialidade (opcional)</label>
                  <input id="equipe-especialidade" type="text" value={especialidade}
                         aria-invalid={Boolean(errosDeCampo["especialidade"])}
                         aria-describedby={errosDeCampo["especialidade"] ? "equipe-especialidade-erro" : undefined}
                         onChange={(ev) => setEspecialidade(ev.target.value)}
                         placeholder="Vistoria geotécnica" />
                  {errosDeCampo["especialidade"] && (
                    <ErroCampo id="equipe-especialidade-erro">
                      {errosDeCampo["especialidade"]}
                    </ErroCampo>
                  )}
                </div>
              </div>
              <div style={{ display: "flex", gap: "var(--ds-sp-2)" }}>
                <button type="submit" className="botao botao--primario">
                  <IconeMais /> {editando ? "Salvar alterações" : "Cadastrar equipe"}
                </button>
                {editando && (
                  <button type="button" className="botao botao--secundario"
                          onClick={() => { setEditando(null); setNome(""); setEspecialidade(""); }}>
                    Cancelar
                  </button>
                )}
              </div>
            </form>
          </Cartao>

          <Cartao titulo="Equipes cadastradas">
            {equipes && equipes.length === 0 ? (
              <Vazio titulo="Nenhuma equipe cadastrada">
                <p>Cadastre a primeira equipe para poder despachar ocorrências.</p>
              </Vazio>
            ) : (
              <div className="tabela-envolucro">
                <table className="tabela">
                  <thead>
                    <tr>
                      <th scope="col">Equipe</th>
                      <th scope="col">Em atendimento</th>
                      <th scope="col">Situação</th>
                      <th scope="col">Ações</th>
                    </tr>
                  </thead>
                  <tbody>
                    {equipes?.map((e) => (
                      <tr key={e.id}>
                        <td>
                          <div className="tabela__principal">{e.nome}</div>
                          <div className="tabela__secundario">{e.especialidade ?? "Sem especialidade definida"}</div>
                        </td>
                        <td className="mono">{e.em_atendimento}</td>
                        <td>
                          <span className={`selo selo--${e.ativa ? "sucesso" : "neutro"}`}>
                            {e.ativa ? "Ativa" : "Inativa"}
                          </span>
                        </td>
                        <td>
                          <div style={{ display: "flex", gap: "var(--ds-sp-2)" }}>
                            <button type="button" className="botao botao--secundario"
                                    onClick={() => {
                                      setEditando(e.id);
                                      setNome(e.nome);
                                      setEspecialidade(e.especialidade ?? "");
                                    }}>
                              Editar
                            </button>
                            <button type="button" className="botao botao--discreto"
                                    onClick={() => void alternarAtiva(e)}>
                              {e.ativa ? "Desativar" : "Reativar"}
                            </button>
                          </div>
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
          <Cartao titulo="Por que não existe excluir">
            <p style={{ margin: 0, fontSize: "var(--ds-fs-body-sm)", lineHeight: "var(--ds-lh-body-sm)" }}>
              Equipe desativada some das listas de despacho, mas continua existindo nos registros
              antigos. Apagar quebraria a trilha de auditoria de toda ocorrência que ela atendeu,
              e é exatamente essa trilha que o servidor público precisa apresentar quando alguém
              pergunta quem foi ao local.
            </p>
          </Cartao>
        </div>
      </div>
    </>
  );
}
