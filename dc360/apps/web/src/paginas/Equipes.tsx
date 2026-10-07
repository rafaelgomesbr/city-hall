import { useCallback, useEffect, useState } from "react";
import { cadastroEquipeSchema } from "@dc360/shared";
import {
  atualizarEquipe, criarEquipe, listarEquipes, type LinhaEquipe,
} from "../dados/repositorio";
import { useSessaoObrigatoria } from "../estado/sessao";
import {
  Aviso, AvisoDeObrigatorios, Carregando, Cartao, Vazio,
} from "../componentes/comuns";
import { Campo } from "../componentes/Campo";
import { ConfirmarAcao } from "../componentes/ConfirmarAcao";
import { IconeMais } from "../componentes/Icones";
import { Toast } from "../componentes/Toast";
import { useTitulo } from "../seo/titulo";

/**
 * Equipes do município.
 *
 * Equipe não é apagada quando some do plantão: é desativada. Ela aparece em
 * despacho antigo e em laudo já emitido, e esses registros precisam continuar
 * apontando para algo depois do fato.
 */
export function Equipes() {
  useTitulo("Equipes");
  const sessao = useSessaoObrigatoria();
  const [equipes, setEquipes] = useState<LinhaEquipe[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [errosDeCampo, setErrosDeCampo] = useState<Record<string, string>>({});
  const [editando, setEditando] = useState<string | null>(null);
  const [nome, setNome] = useState("");
  const [especialidade, setEspecialidade] = useState("");
  /*
    Qual equipe está a um passo de perder o plantão.

    Desativar era um clique só, numa célula de tabela, ao lado de "Editar", em
    linhas que só se distinguem pelo nome. Errar a linha tira do despacho a
    equipe que está atendendo agora, e quem coordena só descobre quando for
    procurar por ela na lista do próximo chamado. Reativar existe, então o
    estrago se desfaz; achar o estrago é que não é imediato.
  */
  const [aDesativar, setADesativar] = useState<LinhaEquipe | null>(null);
  const [desativando, setDesativando] = useState(false);
  /*
    A confirmação passageira de que a gravação aconteceu.

    Antes, gravar limpava o formulário e a linha aparecia na tabela, sem uma
    frase. Quem enxerga fica na dúvida se o clique pegou; quem usa leitor de
    tela não vê a linha nova e não ouve nada. O `Toast` tem `role="status"`, e
    é ele quem anuncia.
  */
  const [aviso, setAviso] = useState<string | null>(null);

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
        setAviso("Equipe corrigida. A lista abaixo já mostra o que mudou.");
      } else {
        await criarEquipe(sessao, nome, especialidade);
        setAviso("Equipe criada. Ela já aparece na lista abaixo.");
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
    if (desativando) return;
    setDesativando(true);
    try {
      await atualizarEquipe(sessao, e.id, e.nome, e.especialidade ?? "", !e.ativa);
      setADesativar(null);
      await recarregar();
    } catch (erroAlternar: unknown) {
      setErro(erroAlternar instanceof Error ? erroAlternar.message : String(erroAlternar));
    } finally {
      setDesativando(false);
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
            {/*
              `noValidate` porque a validação é a do esquema compartilhado, a
              mesma que o servidor roda: sem isto o navegador barra o envio
              antes, com a bolha nativa dele, e as mensagens escritas para
              este domínio nunca chegam à tela.
            */}
            <form onSubmit={submeter} noValidate>
              <AvisoDeObrigatorios />
              <div className="linha-campos">
                <Campo id="equipe-nome" rotulo="Nome" erro={errosDeCampo["nome"]}>
                  {(campo) => (
                    <input {...campo} type="text" value={nome}
                           onChange={(ev) => setNome(ev.target.value)} placeholder="Equipe Delta" />
                  )}
                </Campo>
                <Campo id="equipe-especialidade" rotulo="Especialidade" opcional
                       erro={errosDeCampo["especialidade"]}>
                  {(campo) => (
                    <input {...campo} type="text" value={especialidade}
                           onChange={(ev) => setEspecialidade(ev.target.value)}
                           placeholder="Vistoria geotécnica" />
                  )}
                </Campo>
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
                            {/*
                              Só a DESATIVAÇÃO pergunta. Reativar devolve a
                              equipe ao despacho, não tira nada de ninguém, e
                              exigir confirmação para o gesto inofensivo é o
                              jeito conhecido de ensinar a clicar em "sim" sem
                              ler, o que estraga a pergunta que importa.
                            */}
                            <button type="button" className="botao botao--discreto"
                                    onClick={() => {
                                      if (e.ativa) setADesativar(e);
                                      else void alternarAtiva(e);
                                    }}>
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

      <ConfirmarAcao
        aberto={aDesativar !== null}
        titulo="Desativar equipe"
        consequencia={
          <>
            A equipe some das listas de despacho e ninguém consegue mandá-la a
            campo. Os despachos e laudos antigos continuam apontando para ela,
            e reativar devolve tudo.
          </>
        }
        rotuloDaAcao={`Desativar ${aDesativar?.nome ?? "equipe"}`}
        destrutiva
        ocupado={desativando}
        aoConfirmar={() => { if (aDesativar) void alternarAtiva(aDesativar); }}
        aoCancelar={() => setADesativar(null)}
      >
        {aDesativar && aDesativar.em_atendimento > 0 && (
          <Aviso tom="alerta">
            Esta equipe está em {aDesativar.em_atendimento}{" "}
            {aDesativar.em_atendimento === 1 ? "atendimento" : "atendimentos"} agora.
            Desativar não devolve esses chamados para a fila: eles continuam com
            ela, e alguém precisa redespachar um por um.
          </Aviso>
        )}
      </ConfirmarAcao>

      {aviso && <Toast tom="sucesso" mensagem={aviso} aoFechar={() => setAviso(null)} />}
    </>
  );
}
