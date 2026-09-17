import { useEffect, useState } from "react";
import {
  MODO, baixarPacoteDeSaida, lerRetencaoDoMunicipio, salvarRetencaoDoMunicipio,
} from "../dados/repositorio";
import { useSessaoObrigatoria } from "../estado/sessao";
import { Aviso, AvisoDeObrigatorios, Carregando, Cartao } from "../componentes/comuns";
import { Campo } from "../componentes/Campo";
import { IconeDocumento } from "../componentes/Icones";
import { useTitulo } from "../seo/titulo";

/**
 * Organização: as duas únicas ações que pertencem ao município inteiro, e não
 * a uma ocorrência ou a uma conta.
 *
 * Fica atrás de `gerenciar_organizacao`, a permissão que só o administrador
 * tem (`packages/shared/src/permissoes.ts`). As duas rotas já existiam prontas
 * na API (`administracao.ts` e `saida.ts`); faltava a tela.
 */
export function Organizacao() {
  useTitulo("Organização");
  const sessao = useSessaoObrigatoria();

  const [carregando, setCarregando] = useState(true);
  const [nome, setNome] = useState("");
  const [solicitanteDias, setSolicitanteDias] = useState("");
  const [vulnerabilidadeDias, setVulnerabilidadeDias] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [sucesso, setSucesso] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    if (MODO === "local") { setCarregando(false); return; }
    let cancelado = false;
    lerRetencaoDoMunicipio(sessao)
      .then((r) => {
        if (cancelado) return;
        setNome(r.nome);
        setSolicitanteDias(r.solicitanteDias === null ? "" : String(r.solicitanteDias));
        setVulnerabilidadeDias(r.vulnerabilidadeDias === null ? "" : String(r.vulnerabilidadeDias));
      })
      .catch((e: unknown) => { if (!cancelado) setErro(e instanceof Error ? e.message : String(e)); })
      .finally(() => { if (!cancelado) setCarregando(false); });
    return () => { cancelado = true; };
  }, [sessao]);

  async function salvar(evento: React.FormEvent) {
    evento.preventDefault();
    setErro(null);
    setSucesso(null);
    setSalvando(true);
    try {
      await salvarRetencaoDoMunicipio(sessao, {
        solicitanteDias: solicitanteDias === "" ? null : Number(solicitanteDias),
        vulnerabilidadeDias: vulnerabilidadeDias === "" ? null : Number(vulnerabilidadeDias),
      });
      setSucesso("Prazo de retenção salvo.");
    } catch (e: unknown) {
      setErro(e instanceof Error ? e.message : String(e));
    } finally {
      setSalvando(false);
    }
  }

  return (
    <>
      <div className="cabecalho-pagina">
        <div>
          <h1>Organização</h1>
          <p>{sessao.organizacaoNome}</p>
        </div>
      </div>

      {MODO === "local" ? (
        <Aviso tom="info">
          A configuração do município fica disponível quando o painel está ligado
          ao servidor da prefeitura. Este painel está em modo de demonstração, sem servidor.
        </Aviso>
      ) : (
        <div className="detalhe">
          <div className="coluna">
            <Cartao titulo="Retenção de dado pessoal">
              {carregando ? (
                <Carregando />
              ) : (
                <>
                  <p className="campo__dica" style={{ marginTop: 0 }}>
                    Por quantos dias {nome || "o município"} guarda o nome e o contato
                    de quem aciona a Defesa Civil, e a descrição de vulnerabilidade
                    social. Deixe em branco para não definir prazo.
                  </p>
                  {erro && <Aviso tom="perigo">{erro}</Aviso>}
                  {sucesso && <Aviso tom="sucesso">{sucesso}</Aviso>}

                  <form onSubmit={salvar} noValidate>
                    <AvisoDeObrigatorios />
                    <Campo id="org-retencao-solicitante" opcional
                           rotulo="Nome e contato do solicitante, em dias">
                      {(campo) => (
                        <input {...campo} type="number" min={1} max={36500}
                               value={solicitanteDias}
                               onChange={(e) => setSolicitanteDias(e.target.value)} />
                      )}
                    </Campo>

                    <Campo id="org-retencao-vulnerabilidade" opcional
                           rotulo="Descrição de vulnerabilidade social, em dias"
                           dica="Não pode ser maior que o prazo do nome do solicitante.">
                      {(campo) => (
                        <input {...campo} type="number" min={1} max={36500}
                               value={vulnerabilidadeDias}
                               onChange={(e) => setVulnerabilidadeDias(e.target.value)} />
                      )}
                    </Campo>

                    <button type="submit" className="botao botao--primario" disabled={salvando}>
                      {salvando ? "Salvando" : "Salvar prazo de retenção"}
                    </button>
                  </form>
                </>
              )}
            </Cartao>

            <CartaoDeSaida />
          </div>
        </div>
      )}
    </>
  );
}

/**
 * A saída de município: pacote completo, ato do administrador, dos dois
 * jeitos (ver `apps/api/src/rotas/saida.ts`).
 */
function CartaoDeSaida() {
  const sessao = useSessaoObrigatoria();
  const [baixando, setBaixando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function baixar() {
    setErro(null);
    setBaixando(true);
    try {
      const { url, nome } = await baixarPacoteDeSaida(sessao);
      const ancora = document.createElement("a");
      ancora.href = url;
      ancora.download = nome;
      ancora.click();
      URL.revokeObjectURL(url);
    } catch (e: unknown) {
      setErro(e instanceof Error ? e.message : String(e));
    } finally {
      setBaixando(false);
    }
  }

  return (
    <Cartao titulo="Saída de município">
      <p style={{ marginTop: 0, fontSize: "var(--ds-fs-body-sm)", color: "var(--ds-text-muted)" }}>
        Gera o pacote com toda a base do município: ocorrências, vistorias,
        evidências e cadastro. É o arquivo mais sensível do sistema, e baixar
        não apaga nada.
      </p>
      {erro && <Aviso tom="perigo">{erro}</Aviso>}
      <button type="button" className="botao botao--secundario"
              disabled={baixando} onClick={() => void baixar()}>
        <IconeDocumento /> {baixando ? "Gerando" : "Baixar pacote de saída"}
      </button>
    </Cartao>
  );
}
