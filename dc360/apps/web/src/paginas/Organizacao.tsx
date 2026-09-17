import { useEffect, useState } from "react";
import {
  MODO, baixarPacoteDeSaida, lerRetencaoDoMunicipio, lerUsoDeArmazenamento,
  salvarRetencaoDoMunicipio, type UsoDeArmazenamento,
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
                    Enquanto uma ocorrência está aberta, nada é apagado: é assim que a
                    equipe continua avisando a família da vistoria e da interdição.
                    Depois que {nome || "o município"} <strong>encerra</strong> a
                    ocorrência, os prazos abaixo contam a partir do encerramento e
                    apagam só o dado pessoal sensível, um pedaço de cada vez: o
                    protocolo, o endereço, o tipo e as datas continuam no histórico
                    para sempre. Deixe em branco para nunca apagar nada.
                  </p>
                  {erro && <Aviso tom="perigo">{erro}</Aviso>}
                  {sucesso && <Aviso tom="sucesso">{sucesso}</Aviso>}

                  <form onSubmit={salvar} noValidate>
                    <AvisoDeObrigatorios />
                    <Campo id="org-retencao-solicitante" opcional
                           rotulo="Nome e telefone de quem chamou, em dias após o encerramento"
                           dica="Ex.: 365 para um ano. É o nome e o contato de quem acionou a Defesa Civil.">
                      {(campo) => (
                        <input {...campo} type="text" inputMode="numeric" placeholder="Ex.: 365"
                               value={solicitanteDias}
                               onChange={(e) => setSolicitanteDias(e.target.value.replace(/\D/g, "").slice(0, 5))} />
                      )}
                    </Campo>

                    <Campo id="org-retencao-vulnerabilidade" opcional
                           rotulo="Descrição de vulnerabilidade social, em dias após o encerramento"
                           dica="Ex.: 'mora com idoso acamado'. Nunca fica guardada por mais tempo que o nome do solicitante.">
                      {(campo) => (
                        <input {...campo} type="text" inputMode="numeric" placeholder="Ex.: 365"
                               value={vulnerabilidadeDias}
                               onChange={(e) => setVulnerabilidadeDias(e.target.value.replace(/\D/g, "").slice(0, 5))} />
                      )}
                    </Campo>

                    <button type="submit" className="botao botao--primario" disabled={salvando}>
                      {salvando ? "Salvando" : "Salvar prazo de retenção"}
                    </button>
                  </form>
                </>
              )}
            </Cartao>

            <CartaoDeArmazenamento />
            <CartaoDeSaida />
          </div>
        </div>
      )}
    </>
  );
}

const UNIDADES = ["B", "KB", "MB", "GB", "TB"];

function formatarBytes(bytes: number): string {
  if (bytes <= 0) return "0 B";
  const ordem = Math.min(Math.floor(Math.log2(bytes) / 10), UNIDADES.length - 1);
  const valor = bytes / 2 ** (ordem * 10);
  return `${ordem === 0 ? valor : valor.toFixed(1)} ${UNIDADES[ordem]}`;
}

const TOM_POR_SITUACAO: Record<UsoDeArmazenamento["situacao"], "info" | "alerta" | "perigo"> = {
  sem_teto: "info",
  normal: "info",
  aviso: "alerta",
  acima_do_teto: "perigo",
  recusado: "perigo",
};

const FRASE_POR_SITUACAO: Record<UsoDeArmazenamento["situacao"], string> = {
  sem_teto: "Este município ainda não tem um teto contratado.",
  normal: "Dentro do contratado.",
  aviso: "Perto do teto contratado. Vale avisar quem cuida do contrato.",
  acima_do_teto: "Passou do teto contratado. As fotos continuam sendo aceitas, mas é hora de "
    + "renegociar antes que a margem também acabe.",
  recusado: "Passou da margem: novo envio de foto está sendo recusado. Fale com a plataforma.",
};

/**
 * O que o município enxerga do próprio armazenamento contratado. Só leitura:
 * quem amplia o teto é a plataforma, não esta tela (ver `armazenamento.ts`).
 */
function CartaoDeArmazenamento() {
  const sessao = useSessaoObrigatoria();
  const [uso, setUso] = useState<UsoDeArmazenamento | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    let cancelado = false;
    lerUsoDeArmazenamento(sessao)
      .then((r) => { if (!cancelado) setUso(r); })
      .catch((e: unknown) => { if (!cancelado) setErro(e instanceof Error ? e.message : String(e)); });
    return () => { cancelado = true; };
  }, [sessao]);

  return (
    <Cartao titulo="Uso de armazenamento">
      {erro && <Aviso tom="perigo">{erro}</Aviso>}
      {!uso && !erro ? (
        <Carregando />
      ) : uso && (
        <>
          <p style={{ marginTop: 0 }}>
            <strong>{formatarBytes(uso.bytesUsados)}</strong>
            {uso.tetoBytes !== null && <> de {formatarBytes(uso.tetoBytes)} contratados</>}
          </p>
          <Aviso tom={TOM_POR_SITUACAO[uso.situacao]}>{FRASE_POR_SITUACAO[uso.situacao]}</Aviso>
        </>
      )}
    </Cartao>
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
