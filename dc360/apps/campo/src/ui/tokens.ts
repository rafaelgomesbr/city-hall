/**
 * Os mesmos tokens do painel, no formato que o React Native entende.
 *
 * O painel e o aplicativo são o mesmo produto visto de dois lugares, e o
 * agente que abre os dois no mesmo dia precisa reconhecer. Os valores aqui são
 * cópia literal de `apps/web/src/estilos/tokens.css`, e um teste reprova se
 * divergirem: no React Native não existe CSS custom property, então cópia é o
 * único jeito, e cópia sem portão vira divergência em três meses.
 *
 * O que NÃO é cópia, e por quê: o tamanho mínimo de alvo. No painel a régua é
 * 44 px porque é ponteiro de mouse; aqui é dedo, muitas vezes com luva, dentro
 * de um barranco, com o aparelho molhado. A régua sobe para 52.
 */

export const violeta = {
  v300: "#C4B5FD",
  v400: "#A78BFA",
  v500: "#7C3AED",
  v600: "#6D28D9",
  v700: "#5B21B6",
  v800: "#4C1D95",
} as const;

export const tinta = {
  t950: "#101519",
  t900: "#14191D",
  t850: "#171E24",
  t800: "#1E262D",
  t700: "#2A343C",
  t500: "#5A6B76",
  t400: "#9BAAB5",
  t200: "#DDE3E7",
  t100: "#E9EDF1",
  t50: "#F5F7F8",
  branco: "#FFFFFF",
  gelo: "#ECF1F4",
} as const;

export type Tema = {
  fundo: string;
  superficie: string;
  superficie2: string;
  borda: string;
  texto: string;
  textoDiscreto: string;
  destaque: string;
  destaqueEscuro: string;
  sobreDestaque: string;
  okTexto: string; okFundo: string;
  alertaTexto: string; alertaFundo: string;
  perigoTexto: string; perigoFundo: string;
  /* Severidade, mesmas cores do painel. Nunca a cor de marca. */
  sevBaixaTexto: string; sevBaixaFundo: string;
  sevMediaTexto: string; sevMediaFundo: string;
  sevAltaTexto: string; sevAltaFundo: string;
  sevCriticaTexto: string; sevCriticaFundo: string;
};

export const temaClaro: Tema = {
  fundo: tinta.t50,
  superficie: tinta.branco,
  superficie2: tinta.t100,
  borda: tinta.t200,
  texto: tinta.t900,
  textoDiscreto: tinta.t500,
  destaque: violeta.v700,
  destaqueEscuro: violeta.v800,
  sobreDestaque: tinta.branco,
  okTexto: "#14702F", okFundo: "#E6F6EA",
  alertaTexto: "#92400E", alertaFundo: "#FEF3C7",
  perigoTexto: "#C92A2A", perigoFundo: "#FDEBEB",
  sevBaixaTexto: "#4A5763", sevBaixaFundo: tinta.t100,
  sevMediaTexto: "#92400E", sevMediaFundo: "#FEF3C7",
  sevAltaTexto: "#B91C1C", sevAltaFundo: "#FEE2E2",
  sevCriticaTexto: "#FFFFFF", sevCriticaFundo: "#B91C1C",
};

export const temaEscuro: Tema = {
  fundo: tinta.t950,
  superficie: tinta.t850,
  superficie2: tinta.t800,
  borda: tinta.t700,
  texto: tinta.gelo,
  textoDiscreto: tinta.t400,
  destaque: violeta.v400,
  destaqueEscuro: violeta.v300,
  sobreDestaque: tinta.t950,
  okTexto: "#69DB7C", okFundo: "#17301D",
  alertaTexto: "#FCC419", alertaFundo: "#332B10",
  perigoTexto: "#FF8787", perigoFundo: "#331D1D",
  sevBaixaTexto: "#AEB9C2", sevBaixaFundo: "#242B31",
  sevMediaTexto: "#FCC419", sevMediaFundo: "#332B10",
  sevAltaTexto: "#FF8787", sevAltaFundo: "#331D1D",
  sevCriticaTexto: "#FFFFFF", sevCriticaFundo: "#B91C1C",
};

export const espaco = {
  e1: 4, e2: 8, e3: 12, e4: 16, e5: 24, e6: 32, e7: 48, e8: 64,
} as const;

export const raio = { normal: 8, cartao: 12, pilula: 999 } as const;

export const fonte = {
  display: 32, h1: 26, h2: 21, h3: 18,
  corpoG: 17, corpo: 16, corpoP: 14, legenda: 12,
} as const;

export const linha = {
  display: 38, h1: 32, h2: 27, h3: 24,
  corpoG: 25, corpo: 24, corpoP: 20, legenda: 16,
} as const;

/**
 * Alvo mínimo de toque.
 *
 * 52 e não 44. A régua de 44 vem do guia da Apple para uso normal; este
 * aplicativo é usado em pé, na chuva, com uma mão, às vezes com luva, por
 * alguém olhando para um barranco e não para a tela. Errar o botão de
 * concluir vistoria e apagar o rascunho é o tipo de coisa que só acontece em
 * campo, e não na mesa de quem desenha.
 */
export const toque = 52;

/** O texto da interface nunca encolhe abaixo disto, mesmo em tela pequena. */
export const fonteMinima = 14;
