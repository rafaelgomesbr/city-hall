import { useCallback, useEffect, useState } from "react";
import {
  ErroDaApi, atualizarOrgao, criarOrgao, desativarOrgao, listarOrgaos, reativarOrgao,
  type LinhaOrgao,
} from "../dados/repositorio";
import { useSessaoObrigatoria } from "../estado/sessao";
import {
  Aviso, AvisoDeObrigatorios, Carregando, Cartao, ErrosDoServidor, Vazio,
} from "../componentes/comuns";
import { Campo } from "../componentes/Campo";
import { ConfirmarAcao } from "../componentes/ConfirmarAcao";
import { IconeMais } from "../componentes/Icones";
import { Toast } from "../componentes/Toast";
import { FORMULARIO_VAZIO, conferirMotivo, conferirOrgao } from "./orgaos-regras";
import { useTitulo } from "../seo/titulo";

/**
 * O catálogo de órgãos de destino do município.
 *
 * Ele existe porque `providencias.orgao_destino` era texto livre, e texto livre
 * digitado por pessoas diferentes ao longo de um ano produz "Corpo de
 * Bombeiros", "Bombeiros", "CBMSC" e "corpo de bombeiros" como quatro destinos
 * diferentes. A conta de "quantas providências foram para os bombeiros" não
 * fecha, e é justamente essa conta que sustenta a conversa de orçamento.
 *
 * O email não é um campo a mais: ele é a lista fechada de domínios que o banco
 * cobra na hora de enviar ofício. Sem ele, o painel viraria um encaminhador de
 * documento oficial, com o cabeçalho da prefeitura em cima, para endereço
 * qualquer.
 *
 * ÓRGÃO NÃO SE APAGA, SE DESATIVA COM MOTIVO. A rota de exclusão não existe, e
 * a ausência é a decisão: o órgão aparece em ofício já emitido e na trilha de
 * quem encaminhou o quê. Apagar a linha apagaria junto a resposta para "para
 * onde foi este ofício", que é a pergunta que uma auditoria faz.
 */

function mensagemDoErro(erro: unknown): string {
  return erro instanceof Error ? erro.message : String(erro);
}

export function Orgaos() {
  useTitulo("Órgãos de destino");
  const sessao = useSessaoObrigatoria();
  const [orgaos, setOrgaos] = useState<LinhaOrgao[] | null>(null);
  const [incluirInativos, setIncluirInativos] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [camposRecusados, setCamposRecusados] = useState<
    ReadonlyArray<{ campo: string; mensagem: string }>
  >([]);
  const [errosDeCampo, setErrosDeCampo] = useState<Record<string, string>>({});
  const [editando, setEditando] = useState<string | null>(null);
  const [formulario, setFormulario] = useState(FORMULARIO_VAZIO);
  const [gravando, setGravando] = useState(false);

  /*
    Qual órgão está a um passo de sair da lista, e o motivo digitado para ele.

    Os dois andam juntos de propósito: trocar de órgão no meio da pergunta
    precisa apagar o motivo, senão a explicação escrita para um acaba gravada
    no outro, e ela é o que responde a auditoria depois.
  */
  const [aDesativar, setADesativar] = useState<LinhaOrgao | null>(null);
  const [motivo, setMotivo] = useState("");
  const [erroDoMotivo, setErroDoMotivo] = useState<string | null>(null);
  /*
    A confirmação passageira de que a gravação aconteceu.

    Antes, gravar limpava o formulário e a linha aparecia na tabela, sem uma
    frase. Quem enxerga fica na dúvida se o clique pegou; quem usa leitor de
    tela não vê a linha nova e não ouve nada. O `Toast` tem `role="status"`, e
    é ele quem anuncia.
  */
  const [aviso, setAviso] = useState<string | null>(null);

  const recarregar = useCallback(async () => {
    setOrgaos(await listarOrgaos(sessao, incluirInativos));
  }, [sessao, incluirInativos]);

  useEffect(() => {
    recarregar().catch((e: unknown) => setErro(mensagemDoErro(e)));
  }, [recarregar]);

  function limparFormulario(): void {
    setEditando(null);
    setFormulario(FORMULARIO_VAZIO);
    setErrosDeCampo({});
    setCamposRecusados([]);
  }

  /** O que a tela recusou, e o que o servidor recusou, no mesmo lugar. */
  function absorverRecusa(e: unknown): void {
    if (e instanceof ErroDaApi) {
      const porCampo: Record<string, string> = {};
      for (const campo of e.campos) porCampo[campo.campo] ??= campo.mensagem;
      setErrosDeCampo(porCampo);
      // Campo que não tem caixa na tela (caminho aninhado, por exemplo) ficaria
      // invisível se só o mapa acima existisse.
      setCamposRecusados(e.campos.filter((c) => !(c.campo in FORMULARIO_VAZIO)));
    }
    setErro(mensagemDoErro(e));
  }

  async function submeter(evento: React.FormEvent): Promise<void> {
    evento.preventDefault();
    const conferido = conferirOrgao(formulario);
    if (!conferido.ok) {
      setErrosDeCampo(conferido.erros);
      setErro(null);
      return;
    }
    const dados = conferido.dados;

    setGravando(true);
    setErro(null);
    setErrosDeCampo({});
    setCamposRecusados([]);
    try {
      if (editando) {
        await atualizarOrgao(sessao, editando, dados);
        setAviso("Órgão corrigido. A lista abaixo já mostra o que mudou.");
      } else {
        await criarOrgao(sessao, dados);
        setAviso("Órgão cadastrado. Ele já aparece na lista abaixo.");
      }
      limparFormulario();
      await recarregar();
    } catch (e: unknown) {
      absorverRecusa(e);
    } finally {
      setGravando(false);
    }
  }

  /** Um caminho só: o botão pergunta, e o botão da janela grava. */
  async function confirmarDesativacao(): Promise<void> {
    const alvo = aDesativar;
    if (!alvo || gravando) return;
    const conferido = conferirMotivo(motivo);
    if (!conferido.ok) {
      setErroDoMotivo(conferido.erro);
      return;
    }
    setGravando(true);
    setErroDoMotivo(null);
    try {
      await desativarOrgao(sessao, alvo.id, conferido.motivo);
      setADesativar(null);
      setMotivo("");
      await recarregar();
    } catch (e: unknown) {
      setErro(mensagemDoErro(e));
      setADesativar(null);
    } finally {
      setGravando(false);
    }
  }

  async function reativar(alvo: LinhaOrgao): Promise<void> {
    if (gravando) return;
    setGravando(true);
    try {
      await reativarOrgao(sessao, alvo.id);
      await recarregar();
    } catch (e: unknown) {
      setErro(mensagemDoErro(e));
    } finally {
      setGravando(false);
    }
  }

  if (!orgaos && !erro) return <Carregando />;

  return (
    <>
      <div className="cabecalho-pagina">
        <div>
          <h1>Órgãos de destino</h1>
          <p>{sessao.organizacaoNome}</p>
        </div>
      </div>

      {erro && (
        <Aviso tom="perigo">
          {erro}
          <ErrosDoServidor campos={camposRecusados} />
        </Aviso>
      )}

      <div className="detalhe">
        <div className="coluna">
          <Cartao titulo={editando ? "Editar órgão" : "Cadastrar órgão"}>
            {/*
              `noValidate` porque a validação é a mesma que o servidor roda:
              sem isto o navegador barra o envio antes, com a bolha nativa
              dele, e a mensagem escrita para este domínio nunca chega à tela.
            */}
            <form onSubmit={(evento) => void submeter(evento)} noValidate>
              <AvisoDeObrigatorios />
              <div className="linha-campos">
                <Campo id="orgao-nome" rotulo="Nome do órgão" erro={errosDeCampo["nome"]}>
                  {(campo) => (
                    <input {...campo} type="text" value={formulario.nome}
                           onChange={(e) => setFormulario({ ...formulario, nome: e.target.value })}
                           placeholder="Corpo de Bombeiros Militar" />
                  )}
                </Campo>
                <Campo id="orgao-sigla" rotulo="Sigla" opcional erro={errosDeCampo["sigla"]}>
                  {(campo) => (
                    <input {...campo} type="text" value={formulario.sigla}
                           onChange={(e) => setFormulario({ ...formulario, sigla: e.target.value })}
                           placeholder="CBM" />
                  )}
                </Campo>
              </div>
              <div className="linha-campos">
                <Campo
                  id="orgao-email"
                  rotulo="Email oficial"
                  opcional
                  erro={errosDeCampo["email"]}
                  dica={"É por ele que o ofício sai do sistema, e é o domínio dele que "
                    + "o banco aceita como destino. Sem email, o ofício é emitido e "
                    + "impresso normalmente, só não é enviado daqui."}
                >
                  {(campo) => (
                    <input {...campo} type="email" value={formulario.email}
                           onChange={(e) => setFormulario({ ...formulario, email: e.target.value })}
                           placeholder="protocolo@bombeiros.exemplo.gov.br" />
                  )}
                </Campo>
                <Campo id="orgao-telefone" rotulo="Telefone" opcional
                       erro={errosDeCampo["telefone"]}>
                  {(campo) => (
                    <input {...campo} type="text" value={formulario.telefone}
                           onChange={(e) => setFormulario({ ...formulario, telefone: e.target.value })}
                           placeholder="(00) 0000-0000" />
                  )}
                </Campo>
              </div>
              <div style={{ display: "flex", gap: "var(--ds-sp-2)" }}>
                <button type="submit" className="botao botao--primario" disabled={gravando}>
                  <IconeMais /> {editando ? "Salvar alterações" : "Cadastrar órgão"}
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

          <Cartao
            titulo="Órgãos cadastrados"
            acoes={
              <label className="caixa-marcacao">
                <input type="checkbox" checked={incluirInativos}
                       onChange={(e) => setIncluirInativos(e.target.checked)} />
                Mostrar desativados
              </label>
            }
          >
            {orgaos && orgaos.length === 0 ? (
              <Vazio titulo="Nenhum órgão cadastrado">
                <p>
                  Cadastre o primeiro órgão para encaminhar providência sem digitar
                  o destino à mão.
                </p>
              </Vazio>
            ) : (
              <div className="tabela-envolucro">
                <table className="tabela">
                  <thead>
                    <tr>
                      <th scope="col">Órgão</th>
                      <th scope="col">Contato</th>
                      <th scope="col">Providências</th>
                      <th scope="col">Situação</th>
                      <th scope="col">Ações</th>
                    </tr>
                  </thead>
                  <tbody>
                    {orgaos?.map((o) => (
                      <tr key={o.id}>
                        <td>
                          <div className="tabela__principal">{o.nome}</div>
                          <div className="tabela__secundario">
                            {o.sigla ?? "Sem sigla"}
                          </div>
                        </td>
                        <td>
                          {/*
                            "Sem email" é dito, e não deixado em branco: célula
                            vazia parece dado que não carregou, e a diferença
                            importa, porque é ela que decide se o ofício sai do
                            sistema ou vai impresso.
                          */}
                          <div className="tabela__secundario">{o.email ?? "Sem email"}</div>
                          <div className="tabela__secundario">{o.telefone ?? "Sem telefone"}</div>
                        </td>
                        <td className="mono">
                          {o.providencias} {o.abertas > 0 && `(${o.abertas} em aberto)`}
                        </td>
                        <td>
                          <span className={`selo selo--${o.ativo ? "sucesso" : "neutro"}`}>
                            {o.ativo ? "Ativo" : "Desativado"}
                          </span>
                          {!o.ativo && o.motivo_desativacao && (
                            <div className="tabela__secundario">{o.motivo_desativacao}</div>
                          )}
                        </td>
                        <td>
                          <div style={{ display: "flex", gap: "var(--ds-sp-2)" }}>
                            <button type="button" className="botao botao--secundario"
                                    onClick={() => {
                                      setEditando(o.id);
                                      setErrosDeCampo({});
                                      setCamposRecusados([]);
                                      setFormulario({
                                        nome: o.nome,
                                        sigla: o.sigla ?? "",
                                        email: o.email ?? "",
                                        telefone: o.telefone ?? "",
                                      });
                                    }}>
                              Editar
                            </button>
                            {/*
                              Só a DESATIVAÇÃO pergunta. Reativar devolve o
                              órgão à lista de destinos, não tira nada de
                              ninguém, e exigir confirmação para o gesto
                              inofensivo é o jeito conhecido de ensinar a
                              clicar em "sim" sem ler, o que estraga a pergunta
                              que importa.
                            */}
                            <button type="button" className="botao botao--discreto"
                                    disabled={gravando}
                                    onClick={() => {
                                      if (!o.ativo) { void reativar(o); return; }
                                      setMotivo("");
                                      setErroDoMotivo(null);
                                      setADesativar(o);
                                    }}>
                              {o.ativo ? "Desativar" : "Reativar"}
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
              Órgão desativado some da lista de destinos e para de receber ofício novo,
              mas continua existindo nos ofícios já emitidos e na trilha de quem
              encaminhou o quê. Apagar a linha apagaria a resposta para "para onde foi
              este ofício", que é a pergunta que uma auditoria faz. Reativar devolve
              tudo.
            </p>
          </Cartao>

          <Cartao titulo="O nome digitado à mão é o problema">
            <p style={{ margin: 0, fontSize: "var(--ds-fs-body-sm)", lineHeight: "var(--ds-lh-body-sm)" }}>
              Antes do catálogo, o destino da providência era texto livre. Ao longo de
              um ano, o mesmo órgão vira quatro destinos diferentes por causa de
              abreviação e maiúscula, e a conta de quantas providências foram para cada
              um deixa de fechar. É essa conta que sustenta a conversa de orçamento.
            </p>
          </Cartao>
        </div>
      </div>

      <ConfirmarAcao
        aberto={aDesativar !== null}
        titulo="Desativar órgão"
        consequencia={
          <>
            O órgão some da lista de destinos e para de receber ofício novo. As
            providências e os ofícios antigos continuam apontando para ele, e
            reativar devolve tudo.
          </>
        }
        rotuloDaAcao={`Desativar ${aDesativar?.nome ?? "órgão"}`}
        destrutiva
        ocupado={gravando}
        aoConfirmar={() => void confirmarDesativacao()}
        aoCancelar={() => { setADesativar(null); setMotivo(""); setErroDoMotivo(null); }}
      >
        {aDesativar && aDesativar.abertas > 0 && (
          <Aviso tom="alerta">
            Este órgão tem {aDesativar.abertas}{" "}
            {aDesativar.abertas === 1 ? "providência" : "providências"} sem resposta
            agora. Desativar não devolve nada para a fila: elas continuam apontando
            para ele, e alguém precisa cobrar uma por uma.
          </Aviso>
        )}
        {/*
          O motivo é digitado DENTRO da pergunta porque ele é a resposta à
          pergunta, e não um dado do cadastro: ele explica esta desativação, e
          fica gravado na trilha junto com ela.
        */}
        <Campo
          id="orgao-motivo"
          rotulo="Por que este órgão sai da lista"
          erro={erroDoMotivo}
          dica="Fica na trilha. É o que responde, daqui a um ano, para onde foi a competência dele."
        >
          {(campo) => (
            <textarea {...campo} value={motivo}
                      onChange={(e) => setMotivo(e.target.value)}
                      placeholder="Competência transferida para a Secretaria de Obras em 01/2026" />
          )}
        </Campo>
      </ConfirmarAcao>

      {aviso && <Toast tom="sucesso" mensagem={aviso} aoFechar={() => setAviso(null)} />}
    </>
  );
}
