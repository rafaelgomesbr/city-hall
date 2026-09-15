import type { ReactNode } from "react";
import {
  ROTULO_SEVERIDADE,
  ROTULO_STATUS,
  ROTULO_TIPO_COBRADE,
  TRACO_DO_GLIFO,
  VIEWBOX_DO_GLIFO,
  caminhosDoGlifo,
  glifoDeSeveridade,
  precisaReclassificar,
  type Severidade,
  type StatusOcorrencia,
  type TipoDeEntrada,
} from "@dc360/shared";
import { IconeAlerta, IconeCheck, IconeStatus } from "./Icones";
import { rotuloDoCampo } from "@dc360/shared";

/**
 * Peças reaproveitadas entre páginas. Duas regras do design system são
 * cumpridas aqui de uma vez para todo o sistema: nenhum estado é comunicado
 * só por cor (todo selo carrega texto) e o violeta da marca nunca é usado
 * para severidade.
 */

/**
 * O selo de severidade, com o glifo compartilhado ao lado da palavra.
 *
 * Até 15/09/2026 o segundo canal aqui era um PONTO na cor do selo, ou seja,
 * cor de novo: para quem não separa âmbar de vermelho, "Média" e "Alta" eram
 * duas pílulas iguais com palavras diferentes. E o aplicativo desenhava outra
 * coisa na mesma pílula. O glifo (círculo, quadrado, triângulo, octógono,
 * círculo tracejado) vem de `@dc360/shared`, em traço na cor do texto do
 * selo, e é o mesmo que o pino do mapa e o aplicativo desenham.
 *
 * Sem classificação é um estado, e não a ausência de um: leva glifo e palavra
 * como os outros quatro, em vez de ser o único selo que se distingue só pelo
 * cinza.
 */
export function SeloSeveridade({ severidade }: { severidade: Severidade | null }) {
  const glifo = glifoDeSeveridade(severidade);
  const desenho = (
    <svg
      className="selo__glifo"
      viewBox={VIEWBOX_DO_GLIFO}
      aria-hidden="true"
      fill="none"
      stroke="currentColor"
      strokeWidth={TRACO_DO_GLIFO} strokeLinecap="round" strokeLinejoin="round"
    >
      {caminhosDoGlifo(glifo).map((d) => <path key={d} d={d} />)}
    </svg>
  );
  if (!severidade) {
    return <span className="selo selo--neutro">{desenho}Sem classificação</span>;
  }
  return (
    <span className={`selo selo--${severidade}`}>
      {desenho}
      {ROTULO_SEVERIDADE[severidade]}
    </span>
  );
}

/**
 * O tipo da ocorrência, dizendo quando ele ainda NÃO é uma classificação.
 *
 * "Outro" não é a nona categoria da COBRADE: é a marca de que a decisão
 * técnica está pendente. Impresso igual aos outros oito, no meio de uma
 * coluna de tipos, ele lê como classificação já feita, e a fila de triagem
 * perde de vista justamente as linhas que exigem uma decisão de quem está
 * olhando. Aqui ele ganha selo e ícone, e o rótulo compartilhado já diz a
 * palavra: nada nesta diferença é comunicado só por cor.
 */
export function TipoDaOcorrencia({ tipo }: { tipo: TipoDeEntrada }) {
  if (!precisaReclassificar(tipo)) return <>{ROTULO_TIPO_COBRADE[tipo]}</>;
  return (
    <span className="selo selo--media">
      <IconeAlerta tamanho={12} />
      {ROTULO_TIPO_COBRADE[tipo]}
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
  return (
    <span className={`selo selo--${TOM_STATUS[status]}`}>
      <IconeStatus status={status} />
      {ROTULO_STATUS[status]}
    </span>
  );
}

/**
 * A DATA do vencimento, que é a metade do prazo que faltava na tela.
 *
 * "Restam 4h" responde "está apertado?" e não responde "quando?". Quem escala
 * equipe precisa das duas: o coordenador que lê às 17h que restam quatro horas
 * ainda tem de fazer a conta para descobrir que aquilo vence às 21h, com a
 * equipe já fora do turno, e essa conta é feita de cabeça, na pressa, na
 * frente do rádio. A data por extenso tira a conta do caminho.
 *
 * O vencido é dito por cor, por ícone e pela palavra: a regra da casa é nunca
 * comunicar estado só por cor, e quem lê em tela de sol ou não distingue
 * vermelho continua vendo "Vencido" escrito.
 */
export function PrazoVenceEm({ prazoEm, encerrada }: {
  prazoEm: string | null;
  encerrada: boolean;
}) {
  // Sem triagem não existe prazo, e dizer a razão é melhor que deixar a
  // célula vazia: vazio parece dado faltando.
  if (!prazoEm) return <span className="tabela__secundario">Aguarda triagem</span>;

  const vencido = !encerrada && Date.now() > new Date(prazoEm).getTime();
  return (
    <>
      <div className="mono">{formatarDataHora(prazoEm)}</div>
      {vencido && (
        <span className="selo selo--perigo">
          <IconeAlerta tamanho={14} />
          Vencido
        </span>
      )}
    </>
  );
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

/**
 * A lista de campos que o servidor recusou, dita em português.
 *
 * Existe porque o 422 do servidor sempre trouxe `campos`, com o caminho exato e
 * a mensagem de cada um, e o painel montava isso em `ErroDaApi.campos` e NUNCA
 * exibia. Quem preenchia o formulário lia "Alguns campos precisam ser
 * corrigidos" e voltava a caçar o erro no olho.
 *
 * A tela casa a maior parte desses campos com os próprios inputs, e o erro
 * aparece embaixo do campo certo. Este componente cobre o resto: campo que não
 * tem input visível na tela (item de checklist, foto, coordenada dentro de um
 * envelope) continuaria invisível sem ele.
 */
export function ErrosDoServidor(
  { campos }: { campos: ReadonlyArray<{ campo: string; mensagem: string }> },
) {
  if (campos.length === 0) return null;
  return (
    <ul className="erros-do-servidor">
      {campos.map((c) => (
        <li key={`${c.campo}:${c.mensagem}`}>
          <strong>{rotuloDoCampo(c.campo)}:</strong> {c.mensagem}
        </li>
      ))}
    </ul>
  );
}

/**
 * A convenção do formulário, dita uma vez, no topo.
 *
 * O painel marca a EXCEÇÃO: campo opcional leva "(opcional)" no rótulo, e o
 * resto é obrigatório. A convenção é boa (marcar o comum polui a tela inteira
 * de asterisco), mas ela só funciona se alguém a tiver contado. Sem esta
 * frase, quem chega no formulário vê dez rótulos limpos e dois com
 * "(opcional)" e não tem como saber se os limpos são obrigatórios ou se os
 * dois marcados são o único destaque de alguém.
 *
 * Quem navega por leitor de tela ganha isto no `required` de cada campo, que
 * o navegador anuncia junto do rótulo. A frase é para quem enxerga, e para
 * quem lê o formulário inteiro antes de começar a preencher.
 */
export function AvisoDeObrigatorios() {
  return (
    <p className="campo__dica formulario__obrigatorios">
      Todos os campos são obrigatórios, exceto os marcados como opcional.
    </p>
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

/**
 * Erro de um campo de formulário.
 *
 * Sempre ícone mais texto, nunca cor sozinha, e sempre com `role="alert"` para
 * que um leitor de tela anuncie no momento em que o erro aparece. O `id` é o
 * que o campo referencia em `aria-describedby`, para que a pessoa navegando
 * por teclado ouça o motivo ao chegar no campo, e não só ao submeter.
 */
export function ErroCampo({ id, children }: { id: string; children: ReactNode }) {
  return (
    <p className="campo__erro" id={id} role="alert">
      <IconeAlerta tamanho={14} />
      <span>{children}</span>
    </p>
  );
}
