/**
 * O portão do conjunto de ícones.
 *
 * Ele existe porque iconografia apodrece de um jeito específico: alguém com
 * pressa cola um traçado exportado de outro lugar, com preenchimento em vez de
 * traço, ou com espessura 2 em vez de 1.8, e o desenho fica bonito sozinho e
 * errado ao lado dos outros. Ninguém reclama, porque cada ícone continua
 * aparecendo. O que se perde é a coisa que faz um conjunto ser um conjunto: o
 * peso igual na mesma linha de texto.
 *
 * Por isso as regras aqui são cobradas de TODOS os ícones de uma vez, lendo o
 * registro `ICONES`, e não ícone a ícone com uma lista escrita à mão que o
 * vigésimo quinto esqueceria de atualizar. E há um caso que prova a própria
 * varredura, com um ícone deliberadamente errado: portão cego dá verde para
 * sempre.
 *
 * COMO A COR É CONFERIDA. O `react-native-svg` não guarda a cor como texto: no
 * limite com o nativo ela vira um inteiro ARGB. Então "#123456" chega ao nó
 * como `{ type: 0, payload: 4279383126 }`, e a comparação honesta é contra
 * `processColor` do próprio React Native, e não contra a string.
 */

import { processColor } from "react-native";
import { act, render, screen } from "@testing-library/react-native";
import Svg, { Path } from "react-native-svg";
import { caminhosDoGlifo, glifoDeSeveridade, type Severidade } from "@dc360/shared";

import * as modulo from "./icones";
import { ICONES, IconeSeveridade, type ComponenteDeIcone, type NomeDeIcone } from "./icones";

const COR = "#123456";

/* O tamanho do cartão de lista, que é onde a maioria destes ícones vive. */
const TAMANHO_NO_CARTAO = 16;

type No = { type: string; props: Record<string, unknown>; children: unknown };

function todosOsNos(no: unknown): No[] {
  if (!no || typeof no !== "object") return [];
  if (Array.isArray(no)) return no.flatMap(todosOsNos);
  const atual = no as No;
  if (typeof atual.type !== "string") return [];
  return [atual, ...todosOsNos(atual.children)];
}

/**
 * Os nós que desenham tinta.
 *
 * O `RNSVGSvgView` é a moldura e o `RNSVGGroup` é o grupo que o `fill="none"`
 * do `Svg` produz: nenhum dos dois desenha nada, e cobrar traço deles
 * reprovaria todo ícone correto.
 */
function nosDesenhados(nos: No[]): No[] {
  return nos.filter(
    (n) => n.type.startsWith("RNSVG")
      && n.type !== "RNSVGSvgView"
      && n.type !== "RNSVGGroup",
  );
}

/** O que o nó declarou de fato. O `fill` preto que aparece em todo nó é o padrão do nativo, não uma escolha de quem desenhou. */
function declarou(no: No, prop: string): boolean {
  const lista = no.props.propList;
  return Array.isArray(lista) && lista.includes(prop);
}

async function desenhar(Icone: ComponenteDeIcone, tamanho?: number) {
  await act(async () => {
    await render(<Icone cor={COR} tamanho={tamanho} />);
  });
  const nos = todosOsNos(screen.toJSON());
  return { raiz: nos[0]!, desenhados: nosDesenhados(nos) };
}

/**
 * A tabela dos casos, escrita à mão de propósito.
 *
 * `Object.entries(ICONES)` seria mais curto e deixaria o portão de contagem de
 * casos do repositório cego: ele lê a fonte e recusa um `each` cuja tabela ele
 * não consegue contar, porque número de teste que ninguém sabe de onde vem é o
 * tipo de número que aparece em relatório e não significa nada.
 *
 * A cópia não pode divergir do registro em silêncio: o último caso deste
 * arquivo reprova se alguém acrescentar ícone ao `ICONES` e esquecer daqui, que
 * é justamente o jeito de um desenho novo escapar de todas as regras acima.
 */
const conjunto: Array<[NomeDeIcone, ComponenteDeIcone]> = [
  ["tarefas", ICONES.tarefas],
  ["mapa", ICONES.mapa],
  ["envio", ICONES.envio],
  ["equipe", ICONES.equipe],
  ["severidade", ICONES.severidade],
  ["prazo", ICONES.prazo],
  ["prazoVencido", ICONES.prazoVencido],
  ["vulnerabilidade", ICONES.vulnerabilidade],
  ["foto", ICONES.foto],
  ["localizacao", ICONES.localizacao],
  ["gps", ICONES.gps],
  ["assinatura", ICONES.assinatura],
  ["checklist", ICONES.checklist],
  ["orgao", ICONES.orgao],
  ["devolucao", ICONES.devolucao],
  ["aguardando", ICONES.aguardando],
  ["bloqueado", ICONES.bloqueado],
  ["arquivado", ICONES.arquivado],
  ["sinal", ICONES.sinal],
  ["semSinal", ICONES.semSinal],
  ["aparelho", ICONES.aparelho],
  ["alerta", ICONES.alerta],
  ["perigo", ICONES.perigo],
  ["sucesso", ICONES.sucesso],
  ["informacao", ICONES.informacao],
  ["sino", ICONES.sino],
];

describe("cada ícone do conjunto", () => {
  it.each(conjunto)("%s desenha alguma coisa", async (_nome, Icone) => {
    const { desenhados } = await desenhar(Icone);
    expect(desenhados.length).toBeGreaterThan(0);
  });

  it.each(conjunto)("%s obedece ao tamanho que recebe", async (_nome, Icone) => {
    const { raiz } = await desenhar(Icone, TAMANHO_NO_CARTAO);
    expect(raiz.props.width).toBe(TAMANHO_NO_CARTAO);
    expect(raiz.props.height).toBe(TAMANHO_NO_CARTAO);
  });

  /*
    O padrão precisa ser conferido, e não só o valor passado: é o padrão que
    aparece na tela quando alguém escreve `<IconePrazo cor={...} />` sem
    tamanho, e é ele que vai ser trocado pelo token de tamanho de ícone assim
    que a frente dos tokens o publicar.
  */
  it.each(conjunto)("%s cai no tamanho padrão quando ninguém pede um", async (_nome, Icone) => {
    const { raiz } = await desenhar(Icone);
    expect(raiz.props.width).toBe(24);
    expect(raiz.props.height).toBe(24);
  });

  it.each(conjunto)("%s pinta todo traço com a cor que recebe", async (_nome, Icone) => {
    const { desenhados } = await desenhar(Icone);
    for (const no of desenhados) {
      expect(declarou(no, "stroke")).toBe(true);
      expect((no.props.stroke as { payload: number }).payload).toBe(processColor(COR));
    }
  });

  /*
    O mesmo `viewBox` em todos é o que faz dois ícones vizinhos, pedidos no
    mesmo tamanho, ocuparem a mesma caixa. Com grades diferentes, 16 pontos
    significa coisas diferentes em cada desenho.
  */
  it.each(conjunto)("%s desenha na grade de 24", async (_nome, Icone) => {
    const { raiz } = await desenhar(Icone);
    expect(raiz.props.vbWidth).toBe(24);
    expect(raiz.props.vbHeight).toBe(24);
  });
});

describe("o peso visual, que é o que faz disto um conjunto", () => {
  it.each(conjunto)("%s usa a espessura única de 1.8", async (_nome, Icone) => {
    const { desenhados } = await desenhar(Icone);
    for (const no of desenhados) expect(no.props.strokeWidth).toBe(1.8);
  });

  /*
    NENHUM PREENCHIMENTO, e esta é a regra que mais depende de portão.

    Um ícone cheio no meio de vinte vazados vira mancha na linha de texto, e o
    primeiro que entrar autoriza o segundo: é assim que conjunto desenhado à
    mão vira coleção. A conferência é pelo `propList`, que lista o que o
    desenho DECLAROU, porque o `fill` preto que aparece em todo nó vem do
    padrão do nativo e não de quem desenhou.
  */
  it.each(conjunto)("%s não usa preenchimento em lugar nenhum", async (_nome, Icone) => {
    const { raiz, desenhados } = await desenhar(Icone);
    expect(raiz.props.fill).toBe("none");
    for (const no of desenhados) expect(declarou(no, "fill")).toBe(false);
  });

  /*
    O teto de traços é a régua dos 16 pontos.

    Estes ícones vivem dentro de cartão de lista, onde eles são desenhados em
    16 e não em 24: cada unidade do `viewBox` vira dois terços de ponto. Acima
    de uns cinco traços por desenho, os vãos fecham e o ícone vira borrão justo
    no tamanho em que ele é mais usado. Quem precisar de mais detalhe que isso
    está desenhando ilustração, não ícone.
  */
  it.each(conjunto)("%s cabe em cinco traços", async (_nome, Icone) => {
    const { desenhados } = await desenhar(Icone);
    expect(desenhados.length).toBeLessThanOrEqual(5);
  });
});

/**
 * O registro precisa ser completo, senão os portões acima ficam cegos.
 *
 * Um ícone exportado e não registrado passaria por todas as regras sem ser
 * conferido por nenhuma, e seria descoberto na tela, por alguém reclamando que
 * um desenho ficou mais pesado que o vizinho.
 */
describe("o registro", () => {
  it("contém todos os ícones exportados pelo arquivo", () => {
    const exportados = Object.keys(modulo).filter((nome) => nome.startsWith("Icone"));
    const registrados = Object.values(ICONES);
    const faltando = exportados.filter(
      (nome) => !registrados.includes((modulo as Record<string, unknown>)[nome] as ComponenteDeIcone),
    );
    expect(faltando).toEqual([]);
    expect(exportados.length).toBe(registrados.length);
  });

  /*
    E a tabela deste arquivo precisa cobrir o registro inteiro, senão os casos
    acima rodam sobre uma amostra e dão verde sobre o que não conferiram.
  */
  it("é coberto, ícone por ícone, pela tabela de casos deste arquivo", () => {
    expect(conjunto.map(([nome]) => nome).sort()).toEqual(Object.keys(ICONES).sort());
  });
});

/**
 * A SEVERIDADE tem um glifo por nível, e ele vem do pacote compartilhado.
 *
 * O `IconeSeveridade` nasceu como um medidor com ponteiro, o mesmo desenho
 * para os quatro níveis, mudando só a cor: era o segundo canal prometido pelo
 * `SeloSeveridade` sem ser um segundo canal de verdade, porque forma igual
 * com cor diferente é cor sozinha. E o painel desenhava outra coisa. Agora o
 * glifo (círculo, quadrado, triângulo, octógono, círculo tracejado) vem de
 * `@dc360/shared`, e este arquivo cobra que o aplicativo desenhe EXATAMENTE
 * aquele caminho, e não uma cópia local que divergiria na primeira mudança.
 */
describe("o ícone de severidade desenha o glifo do nível, vindo do compartilhado", () => {
  const niveis: Array<[string, Severidade | null]> = [
    ["baixa", "baixa"],
    ["media", "media"],
    ["alta", "alta"],
    ["critica", "critica"],
    ["sem classificação", null],
  ];

  it.each(niveis)("%s: cada traço é um caminho do glifo compartilhado, na ordem", async (_nome, severidade) => {
    await act(async () => {
      await render(<IconeSeveridade cor={COR} severidade={severidade} />);
    });
    const desenhados = nosDesenhados(todosOsNos(screen.toJSON()));
    expect(desenhados.map((n) => n.props.d)).toEqual(caminhosDoGlifo(glifoDeSeveridade(severidade)));
  });

  it("os quatro níveis não compartilham desenho: a forma é o segundo canal", async () => {
    const vistos = new Set<string>();
    for (const [, severidade] of niveis) {
      await act(async () => {
        await render(<IconeSeveridade cor={COR} severidade={severidade} />);
      });
      vistos.add(JSON.stringify(nosDesenhados(todosOsNos(screen.toJSON())).map((n) => n.props.d)));
    }
    expect(vistos.size).toBe(niveis.length);
  });

  /*
    Sem nível é sem classificação, e não um medidor genérico: o registro
    `ICONES` chama todo ícone só com cor e tamanho, e o que sai daí tem de ser
    um estado que existe no produto.
  */
  it("sem nível, desenha sem classificação", async () => {
    const { desenhados } = await desenhar(ICONES.severidade);
    expect(desenhados.map((n) => n.props.d)).toEqual(caminhosDoGlifo(glifoDeSeveridade(null)));
  });
});

/**
 * A prova de que a varredura morde.
 *
 * Sem isto, todo o arquivo acima poderia estar conferindo a lista vazia e
 * dando verde para sempre. O ícone abaixo erra as três coisas que o portão
 * existe para pegar, de uma vez.
 */
describe("a própria varredura", () => {
  function IconeErrado({ cor, tamanho = 24 }: modulo.PropsDeIcone) {
    return (
      <Svg width={tamanho} height={tamanho} viewBox="0 0 32 32">
        <Path d="M4 4h16v16H4Z" fill={cor} stroke={cor} strokeWidth={3} />
      </Svg>
    );
  }

  it("reprova preenchimento, espessura fora da régua e grade diferente", async () => {
    const { raiz, desenhados } = await desenhar(IconeErrado);
    expect(desenhados).toHaveLength(1);
    expect(declarou(desenhados[0]!, "fill")).toBe(true);
    expect(desenhados[0]!.props.strokeWidth).not.toBe(1.8);
    expect(raiz.props.vbWidth).not.toBe(24);
  });
});
