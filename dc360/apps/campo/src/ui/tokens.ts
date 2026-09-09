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

/**
 * Tokens de ARTEFATO DE DOCUMENTO. Não seguem o tema, de propósito.
 *
 * Existe uma classe de tela neste aplicativo que não é superfície de
 * aplicativo: é papel desenhado na tela. O quadro de assinatura e a minuta do
 * laudo são as duas. Papel não tem modo escuro, e tratá-las como se tivessem
 * produziu um defeito real, encontrado no teste de campo de 08/09/2026:
 *
 * O quadro de assinatura desenhava o traço com `tema.texto`. No tema escuro
 * isso é `tinta.gelo`, quase branco. `toDataURL` do react-native-svg rasteriza
 * exatamente o que está desenhado, então o PNG saía com traço branco, e esse
 * PNG entra no laudo oficial, cujo papel é `#FFFFFF`. Traço branco em papel
 * branco: a assinatura do morador, que é a prova de que ele estava no local
 * quando a casa foi interditada, ficava invisível no documento. Nada reclamava,
 * porque na tela do agente, escura, o traço aparecia perfeitamente.
 *
 * A minuta falhava pelo mesmo motivo, com consequência mais barata: o agente
 * vira o telefone para o morador ver o que vai assinar, e no tema escuro aquilo
 * não parecia documento nenhum.
 *
 * Os valores são os mesmos do papel de verdade, em
 * `apps/api/src/documentos/folha.ts`: é o mesmo documento visto antes e depois
 * de virar arquivo, e ele precisa ser reconhecível como o mesmo.
 *
 * `fundo` precisa ser OPACO. Cor com transparência aqui vira PNG transparente,
 * e o traço passa a depender do que estiver atrás dele no visualizador de quem
 * abrir o laudo.
 */
export const papel = {
  /** O papel. Branco nos dois temas, igual ao `--papel` da folha impressa. */
  fundo: tinta.branco,
  /** A tinta do traço e do texto, igual ao `--tinta` da folha impressa. */
  tinta: tinta.t900,
  /** Tinta secundária, para rótulo e legenda: o `--tinta-fraca` da folha. */
  tintaDiscreta: "#4A5763",
  /** Fio de régua, separador e borda da folha: o `--linha` da folha. */
  linha: "#C9D2D8",
  /** A mesa sob a folha, para a folha ter onde terminar. */
  mesa: tinta.t100,
  /** A tarja de "isto não é o documento", também fixa nos dois temas. */
  avisoFundo: "#FEF3C7",
  avisoTinta: "#92400E",
} as const;

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

/**
 * Duração de movimento, em milissegundos.
 *
 * Três valores e não sete, porque escala de movimento com sete degraus vira
 * escolha por gosto a cada componente, e o resultado é uma tela onde nada tem
 * o mesmo ritmo de nada.
 *
 * `respostaAoToque` é curto porque ele responde ao dedo: acima de uns 150 ms o
 * toque começa a parecer que não pegou, e o agente toca de novo. `mudancaDeEstado`
 * é para o que muda sozinho e precisa ser percebido sem atrapalhar. `climax` é
 * um só, para um momento só: a fila esvaziando.
 *
 * O clímax é mais longo de propósito, e essa é a única duração deste arquivo
 * que existe por razão emocional em vez de funcional. O agente subiu o morro,
 * coletou sem sinal e desceu sem saber se o trabalho dele chegou. Ver a fila
 * zerar é a resposta a essa dúvida, e ela merece durar o suficiente para ser
 * vista. Um piscar de 150 ms comunicaria o mesmo fato e não resolveria a
 * dúvida.
 *
 * Nada aqui roda quando o aparelho pede redução de movimento: ver
 * `useReducaoDeMovimento`.
 */
export const movimento = {
  respostaAoToque: 120,
  mudancaDeEstado: 260,
  climax: 520,
} as const;
