import { SEVERIDADES, glifoDeSeveridade } from "@dc360/shared";

import { temaClaro, temaEscuro } from "../tokens";
import {
  CRITICIDADES_DA_LEGENDA, aparenciaDaCriticidade, criticidadesNoMapa,
} from "./criticidade";

/**
 * O VOCABULÁRIO DO PINO, medido onde ele é decidido.
 *
 * O pino do mapa leva gravidade, e a regra da casa proíbe comunicar estado só
 * por cor. O que sustenta a permissão são três canais, e dois deles são
 * verificáveis sem montar tela nenhuma: a FORMA de cada criticidade tem que ser
 * diferente das outras, e a COR tem que sair da paleta de severidade do tema, e
 * nunca da cor de marca.
 *
 * O terceiro canal (a palavra, na legenda e no selo) é medido na tela, em
 * `src/__tests__/mapa-tela-dedicada.test.tsx`.
 */

describe("cada criticidade tem forma própria, e nenhuma se confunde com outra", () => {
  it("as formas das quatro severidades são todas diferentes", () => {
    const formas = SEVERIDADES.map((s) => aparenciaDaCriticidade(temaClaro, s).forma);
    expect(new Set(formas).size).toBe(SEVERIDADES.length);
  });

  /*
    Sem classificação é um ESTADO, e não a ausência de um: a ocorrência chegou e
    ninguém decidiu ainda. Ela precisa ser distinguível das quatro, senão o
    agente lê "baixa" numa tarefa que ninguém classificou.
  */
  it("sem classificação tem forma própria e palavra própria", () => {
    const sem = aparenciaDaCriticidade(temaClaro, null);
    const formasDaEscala = SEVERIDADES.map((s) => aparenciaDaCriticidade(temaClaro, s).forma);

    expect(formasDaEscala).not.toContain(sem.forma);
    expect(sem.palavra).toBe("Sem classificação");
  });

  it("a palavra é a mesma que o selo de severidade mostra", () => {
    expect(aparenciaDaCriticidade(temaClaro, "critica").palavra).toBe("Crítica");
    expect(aparenciaDaCriticidade(temaClaro, "baixa").palavra).toBe("Baixa");
  });

  /*
    E o DESENHO é o mesmo que o selo mostra, e o mesmo que o painel mostra: o
    glifo vem de `@dc360/shared`, e a forma é o nome da silhueta dele. Até
    15/09/2026 o pino era triângulo, losango, quadrado, círculo e anel, numa
    ordem que não era a do painel (lá crítica era círculo): o coordenador e o
    agente liam o mesmo mapa com duas legendas.
  */
  it("o glifo do pino é o glifo compartilhado do nível, e a forma é a silhueta dele", () => {
    for (const severidade of [...SEVERIDADES, null]) {
      const aparencia = aparenciaDaCriticidade(temaClaro, severidade);
      expect(aparencia.glifo).toBe(glifoDeSeveridade(severidade));
      expect(aparencia.forma).toBe(glifoDeSeveridade(severidade).silhueta);
    }
    expect(aparenciaDaCriticidade(temaClaro, "critica").forma).toBe("octogono");
    expect(aparenciaDaCriticidade(temaClaro, null).forma).toBe("circulo_tracejado");
  });
});

describe("a cor sai da paleta de severidade, e nunca da cor de marca", () => {
  /*
    `CLAUDE.md`: "nunca comunicar severidade com a cor de marca". O violeta é a
    identidade do produto e aparece em botão, em foco e no ponto do agente; se
    ele também pintasse gravidade, a tela passaria a ter duas gramáticas de cor
    disputando o mesmo significado.
  */
  it.each([temaClaro, temaEscuro])("nenhum pino é pintado de destaque", (tema) => {
    for (const severidade of [...SEVERIDADES, null]) {
      const aparencia = aparenciaDaCriticidade(tema, severidade);
      expect(aparencia.fundo).not.toBe(tema.destaque);
      expect(aparencia.fundo).not.toBe(tema.destaqueEscuro);
    }
  });

  it.each([temaClaro, temaEscuro])("cada severidade usa o par medido do tema", (tema) => {
    expect(aparenciaDaCriticidade(tema, "critica").fundo).toBe(tema.sevCriticaFundo);
    expect(aparenciaDaCriticidade(tema, "alta").fundo).toBe(tema.sevAltaFundo);
    expect(aparenciaDaCriticidade(tema, "media").fundo).toBe(tema.sevMediaFundo);
    expect(aparenciaDaCriticidade(tema, "baixa").fundo).toBe(tema.sevBaixaFundo);
  });
});

describe("a legenda explica o que está no mapa, e nada além disso", () => {
  it("só entram as criticidades presentes", () => {
    expect(criticidadesNoMapa(["critica", "baixa", "critica"])).toEqual(["critica", "baixa"]);
  });

  /*
    A ordem é sempre a da escala, da mais grave para a menos, e não a ordem em
    que os pinos apareceram: uma legenda que se reordena a cada despacho novo é
    uma legenda que se lê de novo toda vez.
  */
  it("a ordem é a da escala, e não a de chegada", () => {
    expect(criticidadesNoMapa(["baixa", "critica", "media"])).toEqual(
      ["critica", "media", "baixa"],
    );
    expect(CRITICIDADES_DA_LEGENDA[0]).toBe("critica");
    expect(CRITICIDADES_DA_LEGENDA[CRITICIDADES_DA_LEGENDA.length - 1]).toBeNull();
  });

  it("a ocorrência sem classificação também ganha chave, e ela vai por último", () => {
    expect(criticidadesNoMapa([null, "alta"])).toEqual(["alta", null]);
  });

  it("mapa sem pino nenhum não tem legenda para mostrar", () => {
    expect(criticidadesNoMapa([])).toEqual([]);
  });
});
