import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  CANAIS_ENTRADA, ROTULO_CANAL, ROTULO_TIPO_COBRADE, TIPOS_COBRADE,
  aberturaOcorrenciaSchema,
  type AberturaOcorrencia, type CanalEntrada, type TipoCobrade,
} from "@dc360/shared";
import { abrirOcorrencia, possiveisDuplicidades, type LinhaOcorrencia } from "../dados/repositorio";
import { useSessaoObrigatoria } from "../estado/sessao";
import { Aviso, Cartao, ErroCampo, formatarDataHora } from "../componentes/comuns";
import { IconeVoltar } from "../componentes/Icones";

/**
 * Abertura de ocorrência: a tela que o operador de plantão usa com o telefone
 * no ombro.
 *
 * Duas decisões de produto estão aqui. A primeira: o protocolo não é digitado,
 * é gerado pelo banco dentro da transação, com sequência por município e ano,
 * porque dois operadores registrando ao mesmo tempo não podem receber o mesmo
 * número. A segunda: a checagem de duplicidade acontece ANTES de gravar, e
 * mostra o que já existe em vez de bloquear, porque quem sabe se é o mesmo
 * evento é a pessoa, não o sistema.
 */
export function NovaOcorrencia() {
  const sessao = useSessaoObrigatoria();
  const navegar = useNavigate();

  const [tipo, setTipo] = useState<TipoCobrade>("deslizamento");
  const [canal, setCanal] = useState<CanalEntrada>("telefone");
  const [solicitante, setSolicitante] = useState("");
  const [contato, setContato] = useState("");
  const [endereco, setEndereco] = useState("");
  const [descricao, setDescricao] = useState("");
  const [lat, setLat] = useState("");
  const [lng, setLng] = useState("");

  const [erros, setErros] = useState<Record<string, string>>({});
  const [duplicidades, setDuplicidades] = useState<LinhaOcorrencia[] | null>(null);
  const [gravando, setGravando] = useState(false);
  const [falha, setFalha] = useState<string | null>(null);

  function montar() {
    const coordenada = lat.trim() && lng.trim()
      ? { lat: Number(lat), lng: Number(lng) }
      : undefined;
    return {
      solicitanteNome: solicitante.trim(),
      solicitanteContato: contato.trim() || undefined,
      canalEntrada: canal,
      endereco: endereco.trim(),
      coordenada,
      tipo,
      descricao: descricao.trim(),
    };
  }

  async function verificar(evento: React.FormEvent) {
    evento.preventDefault();
    const resultado = aberturaOcorrenciaSchema.safeParse(montar());
    if (!resultado.success) {
      const mapa: Record<string, string> = {};
      for (const issue of resultado.error.issues) {
        const campo = String(issue.path[0] ?? "geral");
        mapa[campo] ??= issue.message;
      }
      setErros(mapa);
      setDuplicidades(null);
      return;
    }
    setErros({});
    setFalha(null);

    // `gravando` cobre a checagem de duplicidade também, e não só a gravação:
    // sem isso, dois cliques rápidos no botão disparam duas aberturas.
    setGravando(true);
    try {
      const candidatas = await possiveisDuplicidades(sessao, tipo, endereco);
      setDuplicidades(candidatas);
      if (candidatas.length === 0) {
        await gravar(resultado.data);
        return;
      }
    } catch (e: unknown) {
      // Sem este catch, a falha vira rejeição não tratada e o formulário
      // simplesmente para de responder, sem dizer nada a quem está no telefone.
      setFalha(e instanceof Error ? e.message : String(e));
    }
    setGravando(false);
  }

  /** Revalida antes de gravar: o formulário nunca envia objeto não checado. */
  async function gravarValidando(vinculadaA?: string) {
    const resultado = aberturaOcorrenciaSchema.safeParse(montar());
    if (!resultado.success) {
      setFalha(resultado.error.issues[0]?.message ?? "Dados inválidos");
      return;
    }
    await gravar(resultado.data, vinculadaA);
  }

  async function gravar(dados: AberturaOcorrencia, vinculadaA?: string) {
    setGravando(true);
    setFalha(null);
    try {
      const id = await abrirOcorrencia(sessao, vinculadaA ? { ...dados, vinculadaA } : dados);
      navegar(`/ocorrencias/${id}`);
    } catch (e: unknown) {
      setFalha(e instanceof Error ? e.message : String(e));
      setGravando(false);
    }
  }

  return (
    <>
      <div className="cabecalho-pagina">
        <div>
          <button type="button" className="botao botao--discreto" onClick={() => navegar(-1)}
                  style={{ marginBottom: "var(--ds-sp-2)" }}>
            <IconeVoltar /> Voltar
          </button>
          <h1>Registrar ocorrência</h1>
          <p>O número de protocolo é gerado pelo sistema ao gravar, não é digitado.</p>
        </div>
      </div>

      {falha && <Aviso tom="perigo">Não foi possível gravar: {falha}</Aviso>}

      {duplicidades && duplicidades.length > 0 && (
        <Cartao titulo="Já existe chamado parecido nas últimas 48 horas">
          <p style={{ marginTop: 0, fontSize: "var(--ds-fs-body-sm)" }}>
            Mesmo tipo, endereço parecido e ainda em atendimento. Confira antes de abrir outro
            protocolo para o mesmo evento.
          </p>
          <div className="tabela-envolucro">
            <table className="tabela">
              <thead>
                <tr>
                  <th scope="col">Protocolo</th>
                  <th scope="col">Endereço</th>
                  <th scope="col">Aberta em</th>
                  <th scope="col">Ação</th>
                </tr>
              </thead>
              <tbody>
                {duplicidades.map((d) => (
                  <tr key={d.id}>
                    <td><Link className="tabela__protocolo" to={`/ocorrencias/${d.id}`}>{d.protocolo}</Link></td>
                    <td>{d.endereco}</td>
                    <td>{formatarDataHora(d.criado_em)}</td>
                    <td>
                      <button type="button" className="botao botao--secundario" disabled={gravando}
                              onClick={() => void gravarValidando(d.id)}>
                        Registrar vinculando a este
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div style={{ display: "flex", gap: "var(--ds-sp-2)", marginTop: "var(--ds-sp-4)" }}>
            <button type="button" className="botao botao--primario" disabled={gravando}
                    onClick={() => void gravarValidando()}>
              É outro evento, registrar em separado
            </button>
            <button type="button" className="botao botao--secundario" onClick={() => setDuplicidades(null)}>
              Voltar e corrigir
            </button>
          </div>
        </Cartao>
      )}

      {!(duplicidades && duplicidades.length > 0) && (
        <Cartao>
          <form onSubmit={verificar} noValidate>
            <div className="linha-campos">
              <div className="campo">
                <label htmlFor="nova-tipo">Tipo de ocorrência</label>
                <select id="nova-tipo" value={tipo} onChange={(e) => setTipo(e.target.value as TipoCobrade)}>
                  {TIPOS_COBRADE.map((t) => (
                    <option key={t} value={t}>{ROTULO_TIPO_COBRADE[t]}</option>
                  ))}
                </select>
                <span className="campo__dica">Taxonomia da COBRADE.</span>
              </div>

              <div className="campo">
                <label htmlFor="nova-canal">Canal de entrada</label>
                <select id="nova-canal" value={canal} onChange={(e) => setCanal(e.target.value as CanalEntrada)}>
                  {CANAIS_ENTRADA.map((c) => (
                    <option key={c} value={c}>{ROTULO_CANAL[c]}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="linha-campos">
              <div className="campo">
                <label htmlFor="nova-solicitante">Nome do solicitante</label>
                <input id="nova-solicitante" type="text" value={solicitante}
                       aria-invalid={!!erros["solicitanteNome"]}
                       aria-describedby={erros["solicitanteNome"] ? "nova-solicitante-erro" : undefined}
                       onChange={(e) => setSolicitante(e.target.value)} />
                {erros["solicitanteNome"] && <ErroCampo id="nova-solicitante-erro">{erros["solicitanteNome"]}</ErroCampo>}
              </div>

              <div className="campo">
                <label htmlFor="nova-contato">Contato (opcional)</label>
                <input id="nova-contato" type="text" value={contato}
                       onChange={(e) => setContato(e.target.value)} placeholder="(35) 99999-0000" />
              </div>
            </div>

            <div className="campo">
              <label htmlFor="nova-endereco">Endereço</label>
              <input id="nova-endereco" type="text" value={endereco}
                     aria-invalid={!!erros["endereco"]}
                       aria-describedby={erros["endereco"] ? "nova-endereco-erro" : undefined}
                     onChange={(e) => setEndereco(e.target.value)}
                     placeholder="Rua, número, bairro" />
              {erros["endereco"] && <ErroCampo id="nova-endereco-erro">{erros["endereco"]}</ErroCampo>}
            </div>

            <div className="linha-campos">
              <div className="campo">
                <label htmlFor="nova-lat">Latitude (opcional)</label>
                <input id="nova-lat" type="text" inputMode="decimal" value={lat}
                       onChange={(e) => setLat(e.target.value)} placeholder="-22.4187" />
              </div>
              <div className="campo">
                <label htmlFor="nova-lng">Longitude (opcional)</label>
                <input id="nova-lng" type="text" inputMode="decimal" value={lng}
                       onChange={(e) => setLng(e.target.value)} placeholder="-45.4523" />
              </div>
            </div>

            <div className="campo">
              <label htmlFor="nova-descricao">Relato</label>
              <textarea id="nova-descricao" value={descricao}
                        aria-invalid={!!erros["descricao"]}
                       aria-describedby={erros["descricao"] ? "nova-descricao-erro" : undefined}
                        onChange={(e) => setDescricao(e.target.value)}
                        placeholder="O que o solicitante descreveu, com as próprias palavras dele" />
              {erros["descricao"] && <ErroCampo id="nova-descricao-erro">{erros["descricao"]}</ErroCampo>}
            </div>

            <button type="submit" className="botao botao--primario" disabled={gravando}>
              {gravando ? "Gravando" : "Registrar e gerar protocolo"}
            </button>
          </form>
        </Cartao>
      )}
    </>
  );
}
