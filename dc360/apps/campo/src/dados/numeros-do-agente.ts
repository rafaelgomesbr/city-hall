/**
 * OS NÚMEROS DO AGENTE, contados no aparelho a partir do que já desce.
 *
 * O pedido, na letra de quem paga: "números do agente, com gráfico". E a
 * restrição: nada de rota nova se der para calcular com o que já vem. Dá. A
 * lista de concluídas de `GET /campo/meu-trabalho` traz `coletada_em` de cada
 * vistoria que o agente assinou (as cinquenta mais recentes) e, desde a foto
 * de perfil, `despachada_em`, lido da trilha. Tudo aqui é conta em cima
 * dessas duas datas.
 *
 * ## A honestidade do corte
 *
 * A lista é cortada em cinquenta pelo servidor. Um agente com sessenta
 * vistorias nos últimos trinta dias tem SESSENTA no mês, e a lista só tem
 * cinquenta. Por isso `concluidasNaJanela` devolve `piso`: quando a lista
 * bateu no teto e a mais antiga dela ainda cabe na janela, o número que se
 * contou é um mínimo, e a tela escreve "50+" em vez de afirmar 50. É a mesma
 * regra que o total de concluídas já segue ("Este aparelho baixou as 50
 * últimas"), aplicada à janela.
 *
 * ## Por que tudo recebe `agora` de fora
 *
 * Função que lê `new Date()` por dentro é função cujo teste passa ou reprova
 * conforme o dia em que é rodado. A tela passa o relógio dela, que já avança
 * de trinta em trinta segundos por outro motivo.
 */

/** O que este módulo precisa de uma vistoria concluída, e só isso. */
export type ConcluidaDatada = {
  coletada_em: string;
  /** Nula quando a trilha não tem despacho antes da coleta (dado antigo). */
  despachada_em?: string | null;
};

const DIA_MS = 24 * 60 * 60 * 1000;

/** Sete dias para trás, e não "esta semana": no domingo a semana teria um dia. */
export const JANELA_DA_SEMANA_MS = 7 * DIA_MS;
/**
 * Trinta dias para trás, e não o mês do calendário: no dia 2 o mês teria dois
 * dias e o número diria quase nada. É a MESMA janela que o servidor usa para
 * `devolvidasNoMes`, de propósito: dois números "do mês" com duas janelas
 * seriam dois números que ninguém consegue somar.
 */
export const JANELA_DO_MES_MS = 30 * DIA_MS;

export type ContagemNaJanela = {
  total: number;
  /** O número é um mínimo: a lista veio cortada e pode haver mais na janela. */
  piso: boolean;
};

export function concluidasNaJanela(
  concluidas: readonly ConcluidaDatada[],
  janelaMs: number,
  agora: Date,
  tetoDaLista: number,
): ContagemNaJanela {
  const limite = agora.getTime() - janelaMs;
  const instantes = concluidas
    .map((c) => Date.parse(c.coletada_em))
    .filter((t) => Number.isFinite(t));
  const total = instantes.filter((t) => t >= limite).length;
  const maisAntiga = instantes.length > 0 ? Math.min(...instantes) : null;
  const piso = concluidas.length >= tetoDaLista && maisAntiga !== null && maisAntiga >= limite;
  return { total, piso };
}

/** Uma barra do gráfico, no formato que `ui/Grafico.tsx` desenha. */
export type Barra = {
  /** O texto curto embaixo da barra: "seg", "ter", "abr". */
  rotulo: string;
  valor: number;
  /** A frase inteira para quem ouve a tela: dia ou mês por extenso, e quantas. */
  descricao: string;
};

const DIAS_DA_SEMANA = [
  "domingo", "segunda-feira", "terça-feira", "quarta-feira", "quinta-feira", "sexta-feira", "sábado",
];
const DIAS_CURTOS = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];
const MESES = [
  "janeiro", "fevereiro", "março", "abril", "maio", "junho",
  "julho", "agosto", "setembro", "outubro", "novembro", "dezembro",
];
const MESES_CURTOS = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

function quantas(n: number): string {
  if (n === 0) return "nenhuma vistoria concluída";
  return n === 1 ? "1 vistoria concluída" : `${n} vistorias concluídas`;
}

function primeiraMaiuscula(texto: string): string {
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}

/** A meia-noite LOCAL do dia de uma data. O agente vive no fuso do aparelho. */
function inicioDoDia(data: Date): Date {
  const d = new Date(data);
  d.setHours(0, 0, 0, 0);
  return d;
}

/**
 * Os últimos sete dias, da mais antiga para hoje, contados pelo dia LOCAL.
 *
 * Local e não UTC: uma vistoria das 22h de terça no Brasil é 01h de quarta em
 * UTC, e para quem a fez ela foi terça. Sete e não cinco: fim de semana
 * também tem chuva.
 */
export function concluidasPorDia(concluidas: readonly ConcluidaDatada[], agora: Date): Barra[] {
  const hoje = inicioDoDia(agora);
  const dias: Date[] = [];
  for (let i = 6; i >= 0; i -= 1) {
    const d = new Date(hoje);
    d.setDate(hoje.getDate() - i);
    dias.push(d);
  }

  const porDia = new Map<string, number>();
  for (const c of concluidas) {
    const t = Date.parse(c.coletada_em);
    if (!Number.isFinite(t)) continue;
    const chave = inicioDoDia(new Date(t)).toDateString();
    porDia.set(chave, (porDia.get(chave) ?? 0) + 1);
  }

  return dias.map((d, i) => {
    const valor = porDia.get(d.toDateString()) ?? 0;
    const nome = DIAS_DA_SEMANA[d.getDay()] ?? "";
    const ehHoje = i === dias.length - 1;
    return {
      rotulo: DIAS_CURTOS[d.getDay()] ?? "",
      valor,
      descricao: ehHoje
        ? `Hoje, ${nome}: ${quantas(valor)}`
        : `${primeiraMaiuscula(nome)}: ${quantas(valor)}`,
    };
  });
}

/** Os últimos seis meses, do mais antigo ao atual, pelo mês LOCAL. */
export function concluidasPorMes(concluidas: readonly ConcluidaDatada[], agora: Date): Barra[] {
  const meses: Array<{ ano: number; mes: number }> = [];
  for (let i = 5; i >= 0; i -= 1) {
    const d = new Date(agora.getFullYear(), agora.getMonth() - i, 1);
    meses.push({ ano: d.getFullYear(), mes: d.getMonth() });
  }

  const porMes = new Map<string, number>();
  for (const c of concluidas) {
    const t = Date.parse(c.coletada_em);
    if (!Number.isFinite(t)) continue;
    const d = new Date(t);
    const chave = `${d.getFullYear()}-${d.getMonth()}`;
    porMes.set(chave, (porMes.get(chave) ?? 0) + 1);
  }

  return meses.map(({ ano, mes }) => {
    const valor = porMes.get(`${ano}-${mes}`) ?? 0;
    return {
      rotulo: MESES_CURTOS[mes] ?? "",
      valor,
      descricao: `${primeiraMaiuscula(MESES[mes] ?? "")}: ${quantas(valor)}`,
    };
  });
}

/**
 * A média, em milissegundos, entre o despacho e a coleta, nas que têm despacho.
 *
 * Nula quando nenhuma tem: uma média de zero vistorias não é zero, é nada, e
 * a tela precisa distinguir "ainda não dá para medir" de "instantâneo".
 * Intervalo negativo (relógio do aparelho atrasado em relação ao servidor)
 * vira zero em vez de puxar a média para baixo.
 */
export function tempoMedioAteAVistoria(concluidas: readonly ConcluidaDatada[]): number | null {
  const intervalos: number[] = [];
  for (const c of concluidas) {
    if (!c.despachada_em) continue;
    const coleta = Date.parse(c.coletada_em);
    const despacho = Date.parse(c.despachada_em);
    if (!Number.isFinite(coleta) || !Number.isFinite(despacho)) continue;
    intervalos.push(Math.max(0, coleta - despacho));
  }
  if (intervalos.length === 0) return null;
  return intervalos.reduce((a, b) => a + b, 0) / intervalos.length;
}

/**
 * Um intervalo em número e unidade, para o `Dado` desenhar o número grande e
 * o rótulo discreto. Uma casa decimal quando ela muda a leitura ("3,6 horas"),
 * nenhuma quando não muda ("3 horas"). Vírgula, porque a tela é em português.
 */
export function tempoEmPalavras(ms: number): { valor: string; unidade: string } {
  const minutos = ms / 60_000;
  const horas = minutos / 60;
  const dias = horas / 24;

  const formatar = (n: number) => {
    const arredondado = Math.round(n * 10) / 10;
    return Number.isInteger(arredondado)
      ? String(arredondado)
      : arredondado.toFixed(1).replace(".", ",");
  };

  if (dias >= 2) return { valor: formatar(dias), unidade: "dias" };
  if (horas >= 1) {
    const valor = formatar(horas);
    return { valor, unidade: valor === "1" ? "hora" : "horas" };
  }
  const valor = String(Math.round(minutos));
  return { valor, unidade: valor === "1" ? "minuto" : "minutos" };
}
