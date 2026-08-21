import type { ReactNode } from "react";
import {
  ROTULO_SEVERIDADE,
  ROTULO_STATUS,
  type Severidade,
  type StatusOcorrencia,
} from "@dc360/shared";
import { IconeAlerta, IconeCheck } from "./Icones";

/**
 * Peças reaproveitadas entre páginas. Duas regras do design system são
 * cumpridas aqui de uma vez para todo o sistema: nenhum estado é comunicado
 * só por cor (todo selo carrega texto) e o violeta da marca nunca é usado
 * para severidade.
 */

export function SeloSeveridade({ severidade }: { severidade: Severidade | null }) {
  if (!severidade) {
    return <span className="selo selo--neutro">Sem classificação</span>;
  }
  return (
    <span className={`selo selo--${severidade}`}>
      <span className="selo__ponto" aria-hidden="true" />
      {ROTULO_SEVERIDADE[severidade]}
    </span>
  );
}

const TOM_STATUS: Record<StatusOcorrencia, string> = {
  rascunho: "neutro",
  registrada: "info",
  triagem: "info",
  em_campo: "alta",
  vistoria_concluida: "sucesso",
  providencia_pendente: "media",
  encerrada: "neutro",
};

export function SeloStatus({ status }: { status: StatusOcorrencia }) {
  return <span className={`selo selo--${TOM_STATUS[status]}`}>{ROTULO_STATUS[status]}</span>;
}

/** Prazo com barra: a proporção consumida é mais legível que a data crua. */
export function Prazo({ prazoEm, criadoEm, encerrada }: {
  prazoEm: string | null;
  criadoEm: string;
  encerrada: boolean;
}) {
  if (encerrada) return <span className="tabela__secundario">Encerrada</span>;
  if (!prazoEm) return <span className="tabela__secundario">Aguarda triagem</span>;

  const inicio = new Date(criadoEm).getTime();
  const fim = new Date(prazoEm).getTime();
  const agora = Date.now();
  const total = Math.max(1, fim - inicio);
  const consumido = Math.min(1, Math.max(0, (agora - inicio) / total));
  const estourado = agora > fim;
  const restanteHoras = (fim - agora) / 3_600_000;

  const texto = estourado
    ? `Vencido há ${formatarDuracao(-restanteHoras)}`
    : `Restam ${formatarDuracao(restanteHoras)}`;

  return (
    <div className={`prazo${estourado ? " prazo--estourado" : ""}`}>
      <div className="prazo__trilho">
        <div className="prazo__preenchido" style={{ width: `${consumido * 100}%` }} />
      </div>
      <span className="prazo__texto">{texto}</span>
    </div>
  );
}

export function formatarDuracao(horas: number): string {
  const h = Math.abs(horas);
  if (h < 1) return `${Math.round(h * 60)} min`;
  if (h < 48) return `${Math.round(h)} h`;
  return `${Math.round(h / 24)} dias`;
}

export function formatarDataHora(iso: string): string {
  return new Date(iso).toLocaleString("pt-BR", {
    day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

export function Aviso({ tom, children }: { tom: "info" | "perigo" | "sucesso" | "alerta"; children: ReactNode }) {
  return (
    <div className={`aviso aviso--${tom}`} role={tom === "perigo" ? "alert" : "status"}>
      {tom === "sucesso" ? <IconeCheck tamanho={20} /> : <IconeAlerta tamanho={20} />}
      <div>{children}</div>
    </div>
  );
}

export function Carregando({ mensagem = "Carregando" }: { mensagem?: string }) {
  return (
    <div className="carregando" role="status" aria-live="polite">
      <div className="girador" aria-hidden="true" />
      <p>{mensagem}</p>
    </div>
  );
}

export function Vazio({ titulo, children }: { titulo: string; children?: ReactNode }) {
  return (
    <div className="vazio">
      <p className="vazio__titulo">{titulo}</p>
      {children}
    </div>
  );
}

export function Cartao({ titulo, acoes, children }: {
  titulo?: string;
  acoes?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="cartao">
      <div className="cartao__corpo">
        {(titulo || acoes) && (
          <div style={{ display: "flex", alignItems: "center", gap: "var(--ds-sp-3)" }}>
            {titulo && <h2 className="cartao__titulo" style={{ marginBottom: 0 }}>{titulo}</h2>}
            {acoes && <div style={{ marginLeft: "auto" }}>{acoes}</div>}
          </div>
        )}
        {(titulo || acoes) && <div style={{ height: "var(--ds-sp-4)" }} />}
        {children}
      </div>
    </section>
  );
}

export function iniciais(nome: string): string {
  const partes = nome.trim().split(/\s+/);
  const primeira = partes[0]?.[0] ?? "";
  const ultima = partes.length > 1 ? partes[partes.length - 1]?.[0] ?? "" : "";
  return (primeira + ultima).toUpperCase();
}
