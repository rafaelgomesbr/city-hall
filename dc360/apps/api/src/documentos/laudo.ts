import { createHash } from "node:crypto";
import {
  ROTULO_CANAL, ROTULO_SEVERIDADE, ROTULO_TIPO_COBRADE,
  type CanalEntrada, type Severidade, type TipoCobrade,
} from "@dc360/shared";
import { assinatura, campo, escapar, formatarDataHora, montarFolha } from "./folha.js";

/**
 * Laudo de vistoria e termo de interdição.
 *
 * Duas regras de conteúdo que não são estéticas:
 *
 * 1. **As duas marcas de tempo aparecem sempre que diferem.** Coleta e
 *    sincronização em horários distintos é o normal de uma vistoria feita sem
 *    sinal. Mostrar só a segunda faria o documento afirmar que a vistoria
 *    aconteceu na hora em que o sinal voltou, o que é falso e é justamente o
 *    tipo de coisa que derruba um laudo quando alguém contesta.
 *
 * 2. **Nenhuma norma é citada além das que o projeto autoriza, e nenhum
 *    artigo é inventado.** Um número de artigo errado num termo de interdição
 *    é munição para anular o ato. Onde a base normativa é mencionada, ela vem
 *    sem artigo, porque a lista autorizada não os especifica.
 */

export type DadosDocumento = {
  organizacao: { nome: string; municipio: string; uf: string };
  ocorrencia: {
    id: string;
    protocolo: string;
    tipo: TipoCobrade;
    severidade: Severidade | null;
    endereco: string;
    latitude: number | null;
    longitude: number | null;
    solicitante_nome: string;
    solicitante_contato: string | null;
    canal_entrada: string;
    descricao: string;
    vulnerabilidade_presente: boolean;
    vulnerabilidade_descricao: string | null;
    criado_em: string;
    equipe_nome: string | null;
  };
  vistoria: {
    id: string;
    checklist: Array<{ chave: string; resposta: boolean }>;
    gps_precisao_metros: number | null;
    assinante_nome: string;
    observacoes: string | null;
    coletada_em: string;
    sincronizada_em: string;
    agente_nome: string | null;
    agente_matricula: string | null;
  };
  fotos: Array<{ url: string; legenda: string | null; capturadaEm: string }>;
  emitidoPor: string;
  emitidoEm: Date;
  /** Marca d'água. Vazio em ambiente definitivo. */
  marcaDagua?: string;
};

const ROTULO_CHECKLIST: Record<string, string> = {
  risco_iminente: "Risco iminente identificado",
  evacuacao_necessaria: "Evacuação necessária",
  interdicao_indicada: "Interdição indicada",
  acionar_outro_orgao: "Necessário acionar outro órgão",
  danos_estruturais: "Danos estruturais visíveis",
  acesso_comprometido: "Acesso ao imóvel comprometido",
};

/**
 * Identificador curto e estável do documento emitido.
 *
 * Deriva do protocolo mais a vistoria, então o mesmo laudo tem sempre o mesmo
 * código, e dois laudos diferentes nunca compartilham um. Não é assinatura
 * digital e não pretende ser: é o que permite conferir, ao receber um papel,
 * que ele corresponde ao registro no sistema.
 */
export function codigoDeValidacao(protocolo: string, vistoriaId: string): string {
  return createHash("sha256")
    .update(`${protocolo}|${vistoriaId}`)
    .digest("hex")
    .slice(0, 12)
    .toUpperCase();
}

function blocoIdentificacao(d: DadosDocumento): string {
  const o = d.ocorrencia;
  return `<h2>Identificação da ocorrência</h2>
  <div class="campos">
    ${campo("Protocolo", o.protocolo, { mono: true })}
    ${campo("Tipo (COBRADE)", ROTULO_TIPO_COBRADE[o.tipo])}
    ${campo("Severidade", o.severidade ? ROTULO_SEVERIDADE[o.severidade] : "não classificada")}
    ${campo("Registrada em", formatarDataHora(o.criado_em))}
    ${campo("Endereço", o.endereco, { largo: true })}
    ${campo("Coordenada",
      o.latitude !== null && o.longitude !== null
        ? `${o.latitude.toFixed(6)}, ${o.longitude.toFixed(6)}`
        : "não registrada",
      { mono: true })}
    ${campo("Equipe responsável", o.equipe_nome ?? "não designada")}
    ${campo("Solicitante", o.solicitante_nome)}
    ${campo("Canal de entrada",
      ROTULO_CANAL[o.canal_entrada as CanalEntrada] ?? o.canal_entrada)}
  </div>

  <h2>Relato recebido</h2>
  <p class="relato">${escapar(o.descricao)}</p>

  ${o.vulnerabilidade_presente
    ? `<h2>Vulnerabilidade social identificada</h2>
       <p class="relato">${escapar(o.vulnerabilidade_descricao ?? "")}</p>`
    : ""}`;
}

function blocoVistoria(d: DadosDocumento): string {
  const v = d.vistoria;
  const coleta = new Date(v.coletada_em).getTime();
  const sincronia = new Date(v.sincronizada_em).getTime();
  // Um minuto de folga: diferença menor que isso é latência, não coleta
  // offline, e poluiria o documento sem informar nada.
  const offline = sincronia - coleta > 60_000;

  const linhas = v.checklist
    .map((item) => `<tr>
        <td>${escapar(ROTULO_CHECKLIST[item.chave] ?? item.chave)}</td>
        <td class="resposta">${item.resposta ? "SIM" : "NÃO"}</td>
      </tr>`)
    .join("");

  return `<h2>Vistoria realizada</h2>
  <div class="campos">
    ${campo("Data e hora da vistoria em campo", formatarDataHora(v.coletada_em))}
    ${offline
      ? campo("Recebida pelo sistema em", formatarDataHora(v.sincronizada_em))
      : campo("Registrada no sistema em", formatarDataHora(v.sincronizada_em))}
    ${campo("Agente responsável", v.agente_nome ?? "não identificado")}
    ${campo("Matrícula", v.agente_matricula ?? "não informada", { mono: true })}
    ${campo("Precisão do GPS",
      v.gps_precisao_metros !== null ? `${v.gps_precisao_metros} metros` : "não registrada")}
    ${campo("Presente no local", v.assinante_nome)}
  </div>

  ${offline
    ? `<p class="relato">Esta vistoria foi coletada em campo sem conexão e transmitida
       ao sistema posteriormente. As duas datas acima constam por essa razão, e a
       data de referência do ato é a da vistoria em campo.</p>`
    : ""}

  <h2>Checklist técnico</h2>
  <table class="checklist"><tbody>${linhas}</tbody></table>

  ${v.observacoes
    ? `<h2>Observações do agente</h2><p class="relato">${escapar(v.observacoes)}</p>`
    : ""}`;
}

function blocoFotos(d: DadosDocumento): string {
  if (d.fotos.length === 0) {
    return `<h2>Registro fotográfico</h2>
      <p class="relato">Nenhuma fotografia foi anexada a esta vistoria.</p>`;
  }
  const itens = d.fotos
    .map((f, i) => `<figure class="foto">
        <img src="${escapar(f.url)}" alt="Fotografia ${i + 1} da vistoria">
        <figcaption class="legenda">
          Foto ${i + 1}. ${escapar(f.legenda ?? "sem legenda")}<br>
          Capturada em ${escapar(formatarDataHora(f.capturadaEm))}
        </figcaption>
      </figure>`)
    .join("");
  return `<h2>Registro fotográfico</h2><div class="fotos">${itens}</div>`;
}

export function laudoDeVistoria(d: DadosDocumento): string {
  const corpo = `
    ${blocoIdentificacao(d)}
    ${blocoVistoria(d)}
    ${blocoFotos(d)}
    <div class="assinaturas">
      ${assinatura(d.vistoria.agente_nome ?? "Agente de campo", "Agente de proteção e defesa civil")}
      ${assinatura(d.vistoria.assinante_nome, "Presente no local")}
    </div>`;

  return montarFolha({
    titulo: "Laudo de vistoria",
    protocolo: d.ocorrencia.protocolo,
    cabecalho: {
      orgao: d.organizacao.nome,
      municipio: d.organizacao.municipio,
      uf: d.organizacao.uf,
    },
    corpo,
    validacao: codigoDeValidacao(d.ocorrencia.protocolo, d.vistoria.id),
    emitidoEm: d.emitidoEm,
    emitidoPor: d.emitidoPor,
    ...(d.marcaDagua ? { marcaDagua: d.marcaDagua } : {}),
  });
}

export function termoDeInterdicao(d: DadosDocumento): string {
  const o = d.ocorrencia;

  /**
   * Base normativa sem número de artigo, de propósito.
   *
   * A lista de normas que este projeto autoriza citar não especifica artigos,
   * e inventar um número num termo de interdição é dar motivo para anular o
   * ato. O texto abaixo cita a lei pelo que ela é, e nada além disso.
   */
  const corpo = `
    ${blocoIdentificacao(d)}

    <h2>Fundamento</h2>
    <p class="relato">O presente termo é lavrado no exercício das competências do órgão
municipal de proteção e defesa civil, nos termos da Lei 12.608/2012, que institui a
Política Nacional de Proteção e Defesa Civil, alterada pela Lei 14.750/2023, diante do
risco constatado na vistoria técnica registrada sob o protocolo ${escapar(o.protocolo)}.</p>

    <h2>Decisão</h2>
    <p class="relato">Fica INTERDITADO o imóvel situado em ${escapar(o.endereco)}, em caráter
preventivo, ficando vedada a permanência de pessoas no local até que as condições de
segurança sejam restabelecidas e nova vistoria ateste a cessação do risco.</p>

    <h2>Ciência do responsável</h2>
    <p class="relato">O responsável abaixo identificado declara ciência da interdição, das
razões que a motivaram e da vedação de permanência no imóvel.</p>

    ${blocoVistoria(d)}
    ${blocoFotos(d)}

    <div class="assinaturas">
      ${assinatura(d.vistoria.agente_nome ?? "Agente de campo", "Agente de proteção e defesa civil")}
      ${assinatura(d.vistoria.assinante_nome, "Responsável pelo imóvel, ciente")}
    </div>`;

  return montarFolha({
    titulo: "Termo de interdição",
    protocolo: o.protocolo,
    cabecalho: {
      orgao: d.organizacao.nome,
      municipio: d.organizacao.municipio,
      uf: d.organizacao.uf,
    },
    corpo,
    validacao: codigoDeValidacao(`INT-${o.protocolo}`, d.vistoria.id),
    emitidoEm: d.emitidoEm,
    emitidoPor: d.emitidoPor,
    ...(d.marcaDagua ? { marcaDagua: d.marcaDagua } : {}),
  });
}
