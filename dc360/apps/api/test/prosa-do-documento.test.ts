import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { laudoDeVistoria, termoDeInterdicao, termoDeDesinterdicao, type DadosDocumento } from "../src/documentos/laudo.js";

/*
  Defeitos encontrados renderizando o laudo REAL do protocolo 000001/2026 em
  09/09/2026 e olhando o papel, coisa que nenhum teste de marcação pegava.

  Primeiro: a prosa que o sistema escreve saía com as quebras de linha do
  arquivo `.ts`. "A contagem de pessoas atingidas não foi registrada nesta"
  quebrava ali, no meio da frase, e o aviso de coleta sem conexão saía com recuo
  pendurado. Causa: a prosa do sistema usava a classe `.relato`, que tem
  `white-space: pre-wrap` porque ela existe para o texto que o SOLICITANTE
  digitou, onde a quebra é dele e precisa ser respeitada.

  Segundo: o traço de assinatura apagava o meio da linha de assinatura. O PNG
  que o aparelho grava tem papel branco opaco de propósito, e ele subia dois
  pixels em cima da linha, deixando dois tocos, um de cada lado.

  Documento oficial com aparência de mal impresso é documento que o servidor
  público não assina.
*/

const BASE: DadosDocumento = {
  organizacao: { nome: "Coordenadoria Municipal de Proteção e Defesa Civil", municipio: "Florianópolis", uf: "SC" },
  ocorrencia: {
    id: "bc457c05-1253-494a-bf85-f58e088f5bf9",
    protocolo: "000001/2026",
    tipo: "deslizamento",
    severidade: "alta",
    endereco: "Servidão Boa Esperança, 148, Monte Cristo, Florianópolis/SC",
    latitude: -27.5762,
    longitude: -48.5389,
    solicitante_nome: "Joana Ferreira da Silva",
    solicitante_contato: "(48) 99612-4477",
    canal_entrada: "telefone",
    descricao: "Primeira linha do relato.\nSegunda linha, que a moradora separou de propósito.",
    vulnerabilidade_presente: false,
    vulnerabilidade_descricao: null,
    criado_em: "2026-09-08T19:31:25.429596+00:00",
    equipe_nome: "Equipe Alfa",
  },
  vistoria: {
    id: "7512e182-1a14-43da-9c89-fff2ab53b644",
    checklist: [{ chave: "risco_iminente", resposta: true }],
    gps_precisao_metros: 11,
    assinante_nome: "Rafael",
    observacoes: null,
    // Duas datas diferentes acionam o aviso de coleta sem conexão, que é uma
    // das notas cuja quebra vazava.
    coletada_em: "2026-09-08T20:39:14.566+00:00",
    sincronizada_em: "2026-09-08T20:57:21.980358+00:00",
    agente_nome: "Marina Rocha",
    agente_matricula: "DC-0412",
    desalojados: null,
    desabrigados: null,
    feridos: null,
    desaparecidos: null,
    obitos: null,
  },
  fotos: [],
  emitidoPor: "Rafael Gomes",
  emitidoEm: new Date("2026-09-09T15:00:00.000Z"),
} as unknown as DadosDocumento;

const DESINTERDICAO = {
  em: "2026-09-20T13:00:00.000Z",
  motivo: "Talude contido e drenagem executada.",
  porNome: "Rafael Gomes",
  interditadaEm: "2026-09-09T13:00:00.000Z",
};

/** Conteúdo de todo `<p class="nota">` do documento. */
function notas(html: string): string[] {
  return [...html.matchAll(/<p class="nota">([\s\S]*?)<\/p>/g)].map((m) => m[1]);
}

const DOCUMENTOS: Array<[string, string]> = [
  ["laudo de vistoria", laudoDeVistoria(BASE)],
  ["termo de interdição", termoDeInterdicao(BASE)],
  ["termo de desinterdição", termoDeDesinterdicao({ ...BASE, desinterdicao: DESINTERDICAO })],
];

describe("prosa escrita pelo sistema no documento oficial", () => {
  for (const [nome, html] of DOCUMENTOS) {
    it(`${nome}: nenhuma nota carrega a quebra de linha do arquivo fonte`, () => {
      const comQuebra = notas(html).filter((t) => /\s{2,}|\n/.test(t));
      // A mensagem lista o trecho, porque procurar a quebra no HTML inteiro é
      // o que fez este defeito sobreviver a duas rodadas de revisão.
      expect(comQuebra, `notas com quebra ou recuo do fonte: ${JSON.stringify(comQuebra)}`).toEqual([]);
    });

    it(`${nome}: tem pelo menos uma nota, senão o teste acima passa por vazio`, () => {
      expect(notas(html).length).toBeGreaterThan(0);
    });
  }

  /*
    As afirmações acima olham a classe. Esta olha o texto, que é o que sai no
    papel: se alguém "consertar" trocando a classe de volta, as notas somem e o
    teste de quebra passaria por vazio. A frase inteira, com espaço simples, é a
    única coisa que não dá para satisfazer por acidente.
  */
  const FRASES_INTEIRAS: Array<[string, string, string]> = [
    ["laudo de vistoria", DOCUMENTOS[0][1],
      "A contagem de pessoas atingidas não foi registrada nesta vistoria."],
    ["laudo de vistoria", DOCUMENTOS[0][1],
      "coletada em campo sem conexão e transmitida ao sistema posteriormente."],
    ["termo de interdição", DOCUMENTOS[1][1],
      "declara ciência da interdição, das razões que a motivaram"],
    ["termo de desinterdição", DOCUMENTOS[2][1],
      "O levantamento alcança exclusivamente o risco descrito neste processo"],
  ];

  for (const [nome, html, frase] of FRASES_INTEIRAS) {
    it(`${nome}: a frase "${frase.slice(0, 32)}..." sai inteira, sem quebra no meio`, () => {
      expect(html).toContain(frase);
    });
  }

  it("o relato do solicitante CONTINUA preservando a quebra que ele escreveu", () => {
    // A correção não pode virar "tirar `pre-wrap` de tudo": a quebra que a
    // pessoa digitou é conteúdo do relato, e o documento a reproduz.
    const html = laudoDeVistoria(BASE);
    expect(html).toContain('<p class="relato">Primeira linha do relato.\nSegunda linha');
    expect(html).toMatch(/\.relato\s*\{[^}]*white-space:\s*pre-wrap/);
  });
});

describe("linha de assinatura no documento oficial", () => {
  /*
    O traço é lido do CSS da própria folha, e não da imagem renderizada, porque
    a suíte não abre navegador. O que se afirma aqui é a causa direta do que se
    viu no papel: o PNG opaco só apaga a linha se estiver por cima dela.
  */
  it("o traço não sobe em cima da linha, senão o papel opaco a apaga", () => {
    const regra = laudoDeVistoria(BASE).match(/\.assinatura \.traco \{([^}]*)\}/)?.[1] ?? "";
    expect(regra, "regra de .assinatura .traco não encontrada na folha").not.toBe("");
    expect(regra).not.toMatch(/margin[^;]*-\d/);
  });

  it("a linha de assinatura existe nos dois lados do bloco", () => {
    const html = laudoDeVistoria(BASE);
    expect([...html.matchAll(/<div class="linha"><\/div>/g)]).toHaveLength(2);
  });
});

describe("o roteiro de conferência a olho continua existindo", () => {
  it("scripts/renderizar-laudo.mjs exige o dist compilado", () => {
    /*
      A primeira conferência a olho de 09/09/2026 foi feita contra um `dist`
      velho, e o laudo mostrado não era o laudo do código: a lápide de
      assinatura ausente, já implementada, não aparecia. Conferência contra
      build velho é pior que nenhuma, porque produz confiança falsa.
    */
    const roteiro = readFileSync(new URL("../../../scripts/renderizar-laudo.mjs", import.meta.url), "utf8");
    expect(roteiro).toContain("dist");
    expect(roteiro).toMatch(/mais nov|desatualizad|velho/);
  });
});
