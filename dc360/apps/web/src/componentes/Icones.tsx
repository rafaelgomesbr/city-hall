/**
 * Ícones em SVG inline. Nada de biblioteca e nada de rede: o traço é
 * desenhado aqui e herda `currentColor`, então acompanha os dois temas.
 *
 * Regra do design system que vale para todos: ícone nunca comunica estado
 * sozinho. Ele sempre acompanha texto.
 */
import {
  TRACO_DO_GLIFO, VIEWBOX_DO_GLIFO, glifoDeSeveridade, type Severidade,
} from "@dc360/shared";
import { TIPO_EVENTO_DEVOLUCAO } from "../devolucao";

type Props = { tamanho?: number; titulo?: string };

function base(tamanho: number, titulo: string | undefined) {
  return {
    width: tamanho,
    height: tamanho,
    viewBox: "0 0 24 24",
    fill: "none" as const,
    stroke: "currentColor",
    strokeWidth: 1.8,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": titulo ? undefined : (true as const),
    role: titulo ? ("img" as const) : undefined,
  };
}

export function IconePainel({ tamanho = 18, titulo }: Props) {
  return (
    <svg {...base(tamanho, titulo)}>
      {titulo && <title>{titulo}</title>}
      <rect x="3" y="3" width="7" height="9" rx="1.5" />
      <rect x="14" y="3" width="7" height="5" rx="1.5" />
      <rect x="14" y="12" width="7" height="9" rx="1.5" />
      <rect x="3" y="16" width="7" height="5" rx="1.5" />
    </svg>
  );
}

export function IconeOcorrencias({ tamanho = 18, titulo }: Props) {
  return (
    <svg {...base(tamanho, titulo)}>
      {titulo && <title>{titulo}</title>}
      <path d="M8 3h8a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Z" />
      <path d="M9 8h6M9 12h6M9 16h3" />
    </svg>
  );
}

export function IconeMapa({ tamanho = 18, titulo }: Props) {
  return (
    <svg {...base(tamanho, titulo)}>
      {titulo && <title>{titulo}</title>}
      <path d="M9 4 3 6.5v13L9 17l6 2.5 6-2.5v-13L15 6.5 9 4Z" />
      <path d="M9 4v13M15 6.5v13" />
    </svg>
  );
}

export function IconeEquipes({ tamanho = 18, titulo }: Props) {
  return (
    <svg {...base(tamanho, titulo)}>
      {titulo && <title>{titulo}</title>}
      <circle cx="9" cy="8" r="3.2" />
      <path d="M3.5 20a5.5 5.5 0 0 1 11 0" />
      <path d="M16 5.5a3.2 3.2 0 0 1 0 5M17.5 14.8A5.5 5.5 0 0 1 20.5 20" />
    </svg>
  );
}

export function IconeUsuarios({ tamanho = 18, titulo }: Props) {
  return (
    <svg {...base(tamanho, titulo)}>
      {titulo && <title>{titulo}</title>}
      <circle cx="12" cy="8" r="3.5" />
      <path d="M5 20a7 7 0 0 1 14 0" />
    </svg>
  );
}

export function IconeBusca({ tamanho = 18, titulo }: Props) {
  return (
    <svg {...base(tamanho, titulo)}>
      {titulo && <title>{titulo}</title>}
      <circle cx="11" cy="11" r="6.5" />
      <path d="m16 16 4.5 4.5" />
    </svg>
  );
}

export function IconeMais({ tamanho = 18, titulo }: Props) {
  return (
    <svg {...base(tamanho, titulo)}>
      {titulo && <title>{titulo}</title>}
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}

export function IconeAlerta({ tamanho = 18, titulo }: Props) {
  return (
    <svg {...base(tamanho, titulo)}>
      {titulo && <title>{titulo}</title>}
      <path d="M12 4.5 2.8 20h18.4L12 4.5Z" />
      <path d="M12 10v4.5M12 17.3v.2" />
    </svg>
  );
}

export function IconeCheck({ tamanho = 18, titulo }: Props) {
  return (
    <svg {...base(tamanho, titulo)}>
      {titulo && <title>{titulo}</title>}
      <path d="m4.5 12.5 5 5 10-11" />
    </svg>
  );
}

export function IconeVoltar({ tamanho = 18, titulo }: Props) {
  return (
    <svg {...base(tamanho, titulo)}>
      {titulo && <title>{titulo}</title>}
      <path d="M19 12H5M11 6l-6 6 6 6" />
    </svg>
  );
}

export function IconeSol({ tamanho = 18, titulo }: Props) {
  return (
    <svg {...base(tamanho, titulo)}>
      {titulo && <title>{titulo}</title>}
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.2 5.2l1.4 1.4M17.4 17.4l1.4 1.4M18.8 5.2l-1.4 1.4M6.6 17.4l-1.4 1.4" />
    </svg>
  );
}

export function IconeLua({ tamanho = 18, titulo }: Props) {
  return (
    <svg {...base(tamanho, titulo)}>
      {titulo && <title>{titulo}</title>}
      <path d="M20 14.2A8.2 8.2 0 0 1 9.8 4 8.2 8.2 0 1 0 20 14.2Z" />
    </svg>
  );
}

export function IconeSair({ tamanho = 18, titulo }: Props) {
  return (
    <svg {...base(tamanho, titulo)}>
      {titulo && <title>{titulo}</title>}
      <path d="M14 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3" />
      <path d="M10 8 6 12l4 4M6 12h9" />
    </svg>
  );
}

export function IconeDocumento({ tamanho = 18, titulo }: Props) {
  return (
    <svg {...base(tamanho, titulo)}>
      {titulo && <title>{titulo}</title>}
      <path d="M13 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V9l-6-6Z" />
      <path d="M13 3v6h6" />
    </svg>
  );
}

/** Prancheta: o que o agente leva a campo. */
export function IconePrancheta({ tamanho = 18, titulo }: Props) {
  return (
    <svg {...base(tamanho, titulo)}>
      {titulo && <title>{titulo}</title>}
      <path d="M9 4h6a1 1 0 0 1 1 1v1H8V5a1 1 0 0 1 1-1Z" />
      <path d="M16 5h2a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h2" />
      <path d="M9 12.5l2 2 4-4" />
    </svg>
  );
}

/** Sino: o que aconteceu enquanto a pessoa olhava outra tela. */
export function IconeSino({ tamanho = 18, titulo }: Props) {
  return (
    <svg {...base(tamanho, titulo)}>
      {titulo && <title>{titulo}</title>}
      <path d="M18 8a6 6 0 1 0-12 0c0 5-2 6-2 6h16s-2-1-2-6Z" />
      <path d="M10.3 19a2 2 0 0 0 3.4 0" />
    </svg>
  );
}

/** Prédio: o órgão de destino do catálogo do município. */
export function IconePredio({ tamanho = 18, titulo }: Props) {
  return (
    <svg {...base(tamanho, titulo)}>
      {titulo && <title>{titulo}</title>}
      <path d="M4 21V6a1 1 0 0 1 1-1h8a1 1 0 0 1 1 1v15" />
      <path d="M14 10h5a1 1 0 0 1 1 1v10" />
      <path d="M7 9h4M7 13h4M7 17h4M17 14h1M17 18h1M2 21h20" />
    </svg>
  );
}

/**
 * Informação: o "i" dentro do círculo. Existe porque o `Aviso` de tom "info"
 * saía com o TRIÂNGULO de alerta, e um triângulo em cima de "mais 3
 * ocorrências estão sem coordenada" é lido como problema, quando é contexto.
 * Alerta e perigo continuam com o triângulo; sucesso com a marca; informação
 * com este.
 */
export function IconeInfo({ tamanho = 18, titulo }: Props) {
  return (
    <svg {...base(tamanho, titulo)}>
      {titulo && <title>{titulo}</title>}
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 11v5M12 7.7v.2" />
    </svg>
  );
}

export function IconeEscudo({ tamanho = 18, titulo }: Props) {
  return (
    <svg {...base(tamanho, titulo)}>
      {titulo && <title>{titulo}</title>}
      <path d="M12 3 4.5 6v6c0 4.6 3.2 7.9 7.5 9 4.3-1.1 7.5-4.4 7.5-9V6L12 3Z" />
      <path d="M12 9v4M12 15.6v.2" />
    </svg>
  );
}

/** Ícone por tipo de evento da trilha. */
/*
  O tipo do evento de devolução vem do módulo que o define, e não de uma
  segunda cópia da chave: chave repetida é a que deixa de casar quando a
  primeira muda, e o sintoma aqui seria silencioso (o ícone genérico volta e
  ninguém percebe).
*/
export function IconeEvento({ tipo, tamanho = 12 }: { tipo: string; tamanho?: number }) {
  switch (tipo) {
    case TIPO_EVENTO_DEVOLUCAO:
      return <IconeVoltar tamanho={tamanho} />;
    case "encerramento":
      return <IconeCheck tamanho={tamanho} />;
    case "vistoria":
      return <IconeDocumento tamanho={tamanho} />;
    case "despacho":
      return <IconeEquipes tamanho={tamanho} />;
    case "triagem":
      return <IconeAlerta tamanho={tamanho} />;
    default:
      return <IconeOcorrencias tamanho={tamanho} />;
  }
}

/**
 * Marcador do mapa: o MESMO glifo do selo, cheio.
 *
 * A FORMA carrega a severidade, não só a cor: cerca de 8% dos homens têm
 * alguma deficiência na percepção de cor, e o mapa é justamente a tela feita
 * para leitura rápida no olho. Até 15/09/2026 as formas daqui (círculo,
 * triângulo, quadrado, losango) eram outras que as do aplicativo, e em outra
 * ordem: o coordenador via crítica como círculo e o agente via crítica como
 * triângulo. Agora a geometria vem de `@dc360/shared` (círculo, quadrado,
 * triângulo, octógono, círculo tracejado), e é a mesma da pílula.
 *
 * Como pino, o contorno vira mancha em `currentColor` (a cor do pino, que
 * `tokenDaSeveridade` escolhe) com borda na superfície, e a marca de dentro
 * (ponto, traço, exclamação) vai por cima na cor da superfície. Sem
 * classificação fica vazado, em traço: um círculo cinza cheio pareceria mais
 * um degrau da escala.
 */
export function FormaSeveridade({ severidade, tamanho = 16 }: {
  severidade: Severidade | null;
  tamanho?: number;
}) {
  const glifo = glifoDeSeveridade(severidade);
  return (
    <svg
      width={tamanho} height={tamanho} viewBox={VIEWBOX_DO_GLIFO}
      aria-hidden="true"
      fill="none"
      strokeWidth={TRACO_DO_GLIFO} strokeLinecap="round" strokeLinejoin="round"
    >
      {glifo.preenche
        ? <path d={glifo.contorno} fill="currentColor" stroke="var(--ds-surface)" />
        : <path d={glifo.contorno} stroke="currentColor" />}
      {glifo.marca.map((d) => (
        <path key={d} className="forma-severidade__marca" d={d} stroke="var(--ds-surface)" />
      ))}
    </svg>
  );
}

/** Ícone por situação da ocorrência: selo nunca comunica só por cor. */
export function IconeStatus({ status, tamanho = 12 }: { status: string; tamanho?: number }) {
  switch (status) {
    case "rascunho": return <IconeDocumento tamanho={tamanho} />;
    case "registrada": return <IconeOcorrencias tamanho={tamanho} />;
    case "triagem": return <IconeAlerta tamanho={tamanho} />;
    case "em_campo": return <IconeMapa tamanho={tamanho} />;
    case "vistoria_concluida": return <IconeCheck tamanho={tamanho} />;
    case "providencia_pendente": return <IconeEquipes tamanho={tamanho} />;
    case "encerrada": return <IconeEscudo tamanho={tamanho} />;
    default: return <IconeOcorrencias tamanho={tamanho} />;
  }
}
