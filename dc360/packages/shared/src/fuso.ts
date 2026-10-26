/**
 * Fuso horário do estado do município, num lugar só (V2-F02-E09).
 *
 * Moram aqui, e não na API, porque três pontos precisam da mesma resposta: a
 * hora impressa nos documentos, o ano do protocolo e as datas do CSV. Cada um
 * lendo o relógio do processo seria o mesmo defeito em três lugares.
 */

/**
 * O fuso de cada unidade da federação, para o documento não depender do
 * relógio do contêiner.
 *
 * O DEFEITO QUE ISTO ACABA, e ele foi medido. `formatarDataHora` chamava
 * `toLocaleString("pt-BR")` sem `timeZone`, então o horário impresso era o do
 * processo. Não existe `TZ` em lugar nenhum deste produto: nem no Dockerfile,
 * nem no fly.toml, nem no `.env.example`. Contêiner Node sem tzdata configurada
 * roda em UTC. Uma coleta de 09/09/2026 às 21:30 de Brasília imprime
 * "09/09/2026, 21:30" na máquina de quem desenvolve e "10/09/2026, 00:30" em
 * produção: toda coleta entre 21h e a meia-noite, que é justamente a janela de
 * temporal, sai no laudo com o DIA SEGUINTE.
 *
 * E o laudo declara, em texto, que "a data de referência do ato é a da vistoria
 * em campo". Um termo de interdição que erra o dia do ato é papel contestável.
 *
 * POR QUE A UF, E NÃO UMA VARIÁVEL DE AMBIENTE. Fixar `TZ` no contêiner
 * resolveria hoje e só hoje: este produto é um banco só para muitos municípios,
 * e no dia em que entrar uma prefeitura do Acre ou de Mato Grosso o documento
 * dela sairia no horário de Brasília, com a mesma cara de certo. O fuso é
 * propriedade do MUNICÍPIO, e o município já tem UF cadastrada, que é dado
 * obrigatório de organização. Vindo daí, o documento sai igual em qualquer
 * servidor, em qualquer região de nuvem, e o teste que confere isso vale
 * também na máquina de quem desenvolve.
 *
 * Os identificadores são os da IANA, um por estado, mesmo onde vários compartem
 * o mesmo deslocamento hoje. Bahia e Tocantins tiveram horário de verão em anos
 * em que outros estados de UTC-3 não tiveram, e um documento que imprime data
 * antiga precisa continuar imprimindo a hora que era naquele dia.
 */
const FUSO_POR_UF: Record<string, string> = {
  AC: "America/Rio_Branco",
  AL: "America/Maceio",
  AM: "America/Manaus",
  AP: "America/Belem",
  BA: "America/Bahia",
  CE: "America/Fortaleza",
  DF: "America/Sao_Paulo",
  ES: "America/Sao_Paulo",
  GO: "America/Sao_Paulo",
  MA: "America/Fortaleza",
  MG: "America/Sao_Paulo",
  MS: "America/Campo_Grande",
  MT: "America/Cuiaba",
  PA: "America/Belem",
  PB: "America/Fortaleza",
  PE: "America/Recife",
  PI: "America/Fortaleza",
  PR: "America/Sao_Paulo",
  RJ: "America/Sao_Paulo",
  RN: "America/Fortaleza",
  RO: "America/Porto_Velho",
  RR: "America/Boa_Vista",
  RS: "America/Sao_Paulo",
  SC: "America/Sao_Paulo",
  SE: "America/Maceio",
  SP: "America/Sao_Paulo",
  TO: "America/Araguaina",
};

/**
 * O fuso de reserva quando a UF não é reconhecida.
 *
 * Nunca o do processo: cair no relógio do contêiner é exatamente o defeito, e
 * ele é silencioso. Um fuso brasileiro fixo erra no máximo em horas, num
 * cadastro com UF inválida, e erra igual em toda máquina, o que faz o problema
 * aparecer em teste em vez de aparecer em produção.
 */
export const FUSO_PADRAO = "America/Sao_Paulo";

export function fusoDoEstado(uf: string | null | undefined): string {
  return (
    FUSO_POR_UF[
      String(uf ?? "")
        .trim()
        .toUpperCase()
    ] ?? FUSO_PADRAO
  );
}

/**
 * Os componentes de um instante no fuso dado, sem passar pelo relógio do
 * processo. `hourCycle: "h23"` evita o "24:00" que alguns motores imprimem na
 * meia-noite.
 */
function partesNoFuso(instante: Date, fuso: string) {
  const partes = new Intl.DateTimeFormat("en-US", {
    timeZone: fuso,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).formatToParts(instante);
  const pegar = (tipo: string) => partes.find((p) => p.type === tipo)?.value ?? "";
  return {
    ano: pegar("year"),
    mes: pegar("month"),
    dia: pegar("day"),
    hora: pegar("hour"),
    minuto: pegar("minute"),
  };
}

/**
 * O ano civil do instante no fuso do município.
 *
 * `new Date().getFullYear()` devolve o ano do PROCESSO, que em contêiner é UTC:
 * às 22h de 31 de dezembro em Brasília o ano já é o seguinte. O protocolo é
 * numerado por ano, então ocorrência registrada na noite de réveillon recebia
 * número do ano seguinte.
 */
export function anoNoFuso(instante: Date, fuso: string): number {
  return Number(partesNoFuso(instante, fuso).ano);
}

/** A data civil `AAAA-MM-DD` do instante no fuso do município. */
export function dataNoFuso(instante: Date, fuso: string): string {
  const p = partesNoFuso(instante, fuso);
  return `${p.ano}-${p.mes}-${p.dia}`;
}

/**
 * `dd/MM/yyyy HH:mm` no fuso do município, o formato que o Excel em português
 * reconhece sozinho.
 */
export function dataHoraNoFuso(instante: Date, fuso: string): string {
  const p = partesNoFuso(instante, fuso);
  return `${p.dia}/${p.mes}/${p.ano} ${p.hora}:${p.minuto}`;
}
