import { describe, expect, it } from "vitest";
import {
  ESTADOS_DO_ENCAMINHAMENTO,
  ESTADOS_TERMINAIS_DO_ENCAMINHAMENTO,
  EVENTOS_DE_INSERCAO_DIRETA,
  EVENTOS_DO_ENCAMINHAMENTO,
  EVENTOS_GERADOS_PELO_BANCO,
  EVENTOS_QUE_DECLARAM_VERSAO_DO_DOSSIE,
  PAPEIS,
  PAPEIS_DA_DEFESA_CIVIL_NO_ENCAMINHAMENTO,
  PAPEIS_NO_ORGAO,
  PAPEIS_QUE_RESPONDEM_EM_NOME_DO_ORGAO,
  ROTULO_ESTADO_DO_ENCAMINHAMENTO,
  TIPOS_DE_EVENTO_DO_ENCAMINHAMENTO,
  TIPOS_DE_INSERCAO_DIRETA_POR_ATOR,
  TRANSICOES_DO_ENCAMINHAMENTO,
  atorPodeFazerATransicao,
  avaliarTransicaoDoEncaminhamento,
  destinosDoEstado,
  encaminhamentoEncerrado,
  eventoDaTransicao,
  podeExecutar,
  transicaoDoEncaminhamento,
  transicaoEmNomeDoOrgao,
  type AtorDoEncaminhamento,
  type EstadoDoEncaminhamento,
  type Papel,
  type PapelNoOrgao,
  type TipoDeEventoDoEncaminhamento,
} from "../src/index";

/**
 * A máquina de estados do encaminhamento (V2-F04-E03, parte shared, 0D).
 *
 * A tabela esperada abaixo é ESCRITA À MÃO a partir da decisão 9 da ADR 0010,
 * e não lida do módulo: um teste que deriva o esperado da própria tabela não
 * pega erro na tabela.
 */

type Quem = "dc" | "orgao_com_substituto" | "orgao";

const ESPERADO: ReadonlyArray<
  readonly [
    EstadoDoEncaminhamento | null,
    EstadoDoEncaminhamento,
    TipoDeEventoDoEncaminhamento,
    Quem,
  ]
> = [
  [null, "enviado", "enviado", "dc"],
  ["enviado", "aceito", "aceito", "orgao_com_substituto"],
  ["enviado", "devolvido", "devolvido", "orgao"],
  ["enviado", "cancelado", "cancelado", "dc"],
  ["aceito", "respondido", "respondido", "orgao_com_substituto"],
  ["aceito", "aguardando_dc", "esclarecimento_solicitado", "orgao"],
  ["aceito", "cancelado", "cancelado", "dc"],
  ["aguardando_dc", "aceito", "esclarecimento_respondido", "dc"],
  ["aguardando_dc", "cancelado", "cancelado", "dc"],
  ["respondido", "concluido", "concluido", "dc"],
  ["respondido", "aceito", "complemento_solicitado", "dc"],
  ["devolvido", "enviado", "reenviado", "dc"],
  ["devolvido", "cancelado", "cancelado", "dc"],
];

/** Todo ator que o sistema conhece, para provar que o errado reprova. */
const TODOS_OS_ATORES: readonly AtorDoEncaminhamento[] = [
  ...PAPEIS.map((papel): AtorDoEncaminhamento => ({ tipo: "servidor", papel })),
  ...PAPEIS_NO_ORGAO.map((papelNoOrgao): AtorDoEncaminhamento => ({
    tipo: "usuario_orgao",
    papelNoOrgao,
  })),
  { tipo: "sistema" },
  { tipo: "link" },
];

function esperadoParaAtor(quem: Quem, ator: AtorDoEncaminhamento): boolean {
  if (ator.tipo === "servidor") {
    if (quem === "dc") return ator.papel === "coordenador" || ator.papel === "administrador";
    if (quem === "orgao_com_substituto") {
      return (
        ator.papel === "operador" || ator.papel === "coordenador" || ator.papel === "administrador"
      );
    }
    return false; // devolver e pedir esclarecimento nunca são em nome do órgão
  }
  if (ator.tipo === "usuario_orgao") {
    if (quem === "dc") return false; // D-24: nem o gestor do órgão faz transição da Defesa Civil
    return ator.papelNoOrgao === "executor" || ator.papelNoOrgao === "gestor";
  }
  return false; // sistema e link não mudam estado
}

function nome(a: AtorDoEncaminhamento): string {
  if (a.tipo === "servidor") return `servidor ${a.papel}`;
  if (a.tipo === "usuario_orgao") return `órgão ${a.papelNoOrgao}`;
  return a.tipo;
}

describe("os estados", () => {
  it("são sete, na ordem da ADR 0010, e `prazo_vencido` e `sem_aceite` não são estados", () => {
    expect([...ESTADOS_DO_ENCAMINHAMENTO]).toEqual([
      "enviado",
      "aceito",
      "aguardando_dc",
      "respondido",
      "devolvido",
      "concluido",
      "cancelado",
    ]);
    expect(ESTADOS_DO_ENCAMINHAMENTO).not.toContain("prazo_vencido");
    expect(ESTADOS_DO_ENCAMINHAMENTO).not.toContain("sem_aceite");
  });

  it("têm rótulo em português, sem repetição e sem o nome técnico com sublinhado", () => {
    const rotulos = ESTADOS_DO_ENCAMINHAMENTO.map((e) => ROTULO_ESTADO_DO_ENCAMINHAMENTO[e]);
    expect(new Set(rotulos).size).toBe(rotulos.length);
    for (const rotulo of Object.values(ROTULO_ESTADO_DO_ENCAMINHAMENTO)) {
      expect(rotulo.length).toBeGreaterThan(3);
      expect(rotulo).not.toContain("_");
      expect(rotulo[0]).toBe(rotulo[0]!.toUpperCase());
    }
  });

  it("os terminais são `concluido` e `cancelado`", () => {
    expect([...ESTADOS_TERMINAIS_DO_ENCAMINHAMENTO].sort()).toEqual(["cancelado", "concluido"]);
    for (const e of ESTADOS_DO_ENCAMINHAMENTO) {
      expect(encaminhamentoEncerrado(e)).toBe(e === "concluido" || e === "cancelado");
    }
  });
});

describe("a tabela de transições", () => {
  it("tem exatamente as treze linhas da decisão 9, com o evento de cada uma", () => {
    expect(TRANSICOES_DO_ENCAMINHAMENTO).toHaveLength(ESPERADO.length);
    for (const [de, para, evento] of ESPERADO) {
      const t = transicaoDoEncaminhamento(de, para);
      expect(t, `${de} -> ${para}`).toBeDefined();
      expect(t?.evento, `${de} -> ${para}`).toBe(evento);
      expect(eventoDaTransicao(de, para)).toBe(evento);
    }
  });

  it("não tem par repetido", () => {
    const pares = TRANSICOES_DO_ENCAMINHAMENTO.map((t) => `${t.de}>${t.para}`);
    expect(new Set(pares).size).toBe(pares.length);
  });

  it("só a criação nasce de fora: nenhuma outra linha tem `de` nulo", () => {
    const criacoes = TRANSICOES_DO_ENCAMINHAMENTO.filter((t) => t.de === null);
    expect(criacoes).toHaveLength(1);
    expect(criacoes[0]).toMatchObject({ para: "enviado", evento: "enviado" });
  });

  it("cada transição válida é aceita para o ator certo", () => {
    for (const [de, para, , quem] of ESPERADO) {
      const t = transicaoDoEncaminhamento(de, para)!;
      const certos = TODOS_OS_ATORES.filter((a) => esperadoParaAtor(quem, a));
      expect(certos.length, `${de} -> ${para} tem ao menos um ator`).toBeGreaterThan(0);
      for (const ator of certos) {
        expect(atorPodeFazerATransicao(ator, t), `${nome(ator)}: ${de} -> ${para}`).toBe(true);
        if (de !== null) {
          const r = avaliarTransicaoDoEncaminhamento(ator, de, para);
          expect(r.ok, `${nome(ator)}: ${de} -> ${para}`).toBe(true);
        }
      }
    }
  });

  it("cada ator errado é recusado, em todas as transições", () => {
    for (const [de, para, , quem] of ESPERADO) {
      const t = transicaoDoEncaminhamento(de, para)!;
      const errados = TODOS_OS_ATORES.filter((a) => !esperadoParaAtor(quem, a));
      for (const ator of errados) {
        expect(atorPodeFazerATransicao(ator, t), `${nome(ator)}: ${de} -> ${para}`).toBe(false);
        if (de !== null) {
          expect(avaliarTransicaoDoEncaminhamento(ator, de, para)).toEqual({
            ok: false,
            recusa: "sem_permissao",
          });
        }
      }
    }
  });

  it("o leitor do órgão não faz transição nenhuma", () => {
    const leitor: AtorDoEncaminhamento = { tipo: "usuario_orgao", papelNoOrgao: "leitor" };
    for (const t of TRANSICOES_DO_ENCAMINHAMENTO) {
      expect(atorPodeFazerATransicao(leitor, t)).toBe(false);
    }
  });

  it("D-24: usuário de órgão nunca faz transição da Defesa Civil, nem o gestor", () => {
    const gestor: AtorDoEncaminhamento = { tipo: "usuario_orgao", papelNoOrgao: "gestor" };
    for (const [de, para, , quem] of ESPERADO) {
      if (quem !== "dc") continue;
      expect(atorPodeFazerATransicao(gestor, transicaoDoEncaminhamento(de, para)!)).toBe(false);
    }
  });

  it("D-24: o operador só aceita e responde, e em nome do órgão", () => {
    const operador: AtorDoEncaminhamento = { tipo: "servidor", papel: "operador" };
    const permitidas = TRANSICOES_DO_ENCAMINHAMENTO.filter((t) =>
      atorPodeFazerATransicao(operador, t),
    );
    expect(permitidas.map((t) => `${t.de}>${t.para}`).sort()).toEqual([
      "aceito>respondido",
      "enviado>aceito",
    ]);
    for (const t of permitidas) {
      expect(transicaoEmNomeDoOrgao(operador, t)).toBe(true);
    }
  });

  it("o agente de campo não faz transição nenhuma", () => {
    const agente: AtorDoEncaminhamento = { tipo: "servidor", papel: "agente_campo" };
    for (const t of TRANSICOES_DO_ENCAMINHAMENTO) {
      expect(atorPodeFazerATransicao(agente, t)).toBe(false);
    }
  });

  it("sistema e link nunca mudam estado", () => {
    for (const t of TRANSICOES_DO_ENCAMINHAMENTO) {
      expect(atorPodeFazerATransicao({ tipo: "sistema" }, t)).toBe(false);
      expect(atorPodeFazerATransicao({ tipo: "link" }, t)).toBe(false);
    }
  });

  it("D-24 e P-12 batem com `permissoes.ts`: as listas de papéis são as das ações existentes", () => {
    const comEncaminhar = PAPEIS.filter((p) => podeExecutar(p, "encaminhar_providencia"));
    expect([...PAPEIS_DA_DEFESA_CIVIL_NO_ENCAMINHAMENTO].sort()).toEqual([...comEncaminhar].sort());
    const comResponder = PAPEIS.filter((p) => podeExecutar(p, "responder_providencia"));
    expect([...PAPEIS_QUE_RESPONDEM_EM_NOME_DO_ORGAO].sort()).toEqual([...comResponder].sort());
  });
});

describe("a marca `em_nome_do_orgao` (P-12)", () => {
  const aceite = transicaoDoEncaminhamento("enviado", "aceito")!;
  const resposta = transicaoDoEncaminhamento("aceito", "respondido")!;

  it("deriva do ator: o servidor que aceita ou responde tem a marca; o usuário de órgão não", () => {
    for (const t of [aceite, resposta]) {
      for (const papel of PAPEIS_QUE_RESPONDEM_EM_NOME_DO_ORGAO) {
        expect(transicaoEmNomeDoOrgao({ tipo: "servidor", papel }, t)).toBe(true);
      }
      for (const papelNoOrgao of ["executor", "gestor"] as PapelNoOrgao[]) {
        expect(transicaoEmNomeDoOrgao({ tipo: "usuario_orgao", papelNoOrgao }, t)).toBe(false);
      }
    }
  });

  it("o servidor numa transição da Defesa Civil age em nome dela mesma: sem marca", () => {
    for (const t of TRANSICOES_DO_ENCAMINHAMENTO) {
      if (t === aceite || t === resposta) continue;
      expect(transicaoEmNomeDoOrgao({ tipo: "servidor", papel: "coordenador" }, t)).toBe(false);
    }
  });

  it("só `enviado` para `aceito` e `aceito` para `respondido` admitem o servidor em nome do órgão", () => {
    const comMarca = TRANSICOES_DO_ENCAMINHAMENTO.filter((t) => t.servidor?.emNomeDoOrgao);
    expect(comMarca.map((t) => `${t.de}>${t.para}`).sort()).toEqual([
      "aceito>respondido",
      "enviado>aceito",
    ]);
  });
});

describe("D-23: devolução só antes do aceite", () => {
  const gestor: AtorDoEncaminhamento = { tipo: "usuario_orgao", papelNoOrgao: "gestor" };
  const executor: AtorDoEncaminhamento = { tipo: "usuario_orgao", papelNoOrgao: "executor" };

  it("devolver em `enviado` é permitido ao executor e ao gestor", () => {
    for (const ator of [executor, gestor]) {
      const r = avaliarTransicaoDoEncaminhamento(ator, "enviado", "devolvido");
      expect(r.ok).toBe(true);
      if (r.ok) expect(r.transicao.evento).toBe("devolvido");
    }
  });

  it.each(["aceito", "aguardando_dc", "respondido"] as const)(
    "devolver em `%s` é recusado com `devolucao_so_antes_do_aceite`, para qualquer ator",
    (estado) => {
      expect(transicaoDoEncaminhamento(estado, "devolvido")).toBeUndefined();
      expect(destinosDoEstado(estado)).not.toContain("devolvido");
      for (const ator of TODOS_OS_ATORES) {
        expect(avaliarTransicaoDoEncaminhamento(ator, estado, "devolvido"), nome(ator)).toEqual({
          ok: false,
          recusa: "devolucao_so_antes_do_aceite",
        });
      }
    },
  );

  it("devolver em `devolvido` é transição inválida (já devolvido), e nos terminais o encaminhamento está encerrado", () => {
    expect(avaliarTransicaoDoEncaminhamento(gestor, "devolvido", "devolvido")).toEqual({
      ok: false,
      recusa: "transicao_invalida",
    });
    for (const terminal of ESTADOS_TERMINAIS_DO_ENCAMINHAMENTO) {
      expect(avaliarTransicaoDoEncaminhamento(gestor, terminal, "devolvido")).toEqual({
        ok: false,
        recusa: "encaminhamento_encerrado",
      });
    }
  });

  it("nenhuma transição da tabela leva a `devolvido` que não saia de `enviado`", () => {
    const paraDevolvido = TRANSICOES_DO_ENCAMINHAMENTO.filter((t) => t.para === "devolvido");
    expect(paraDevolvido.map((t) => t.de)).toEqual(["enviado"]);
  });
});

describe("estados terminais", () => {
  it.each([...ESTADOS_TERMINAIS_DO_ENCAMINHAMENTO])("`%s` não tem saída", (terminal) => {
    expect(TRANSICOES_DO_ENCAMINHAMENTO.filter((t) => t.de === terminal)).toHaveLength(0);
    expect(destinosDoEstado(terminal)).toEqual([]);
    for (const para of ESTADOS_DO_ENCAMINHAMENTO) {
      for (const ator of TODOS_OS_ATORES) {
        expect(
          avaliarTransicaoDoEncaminhamento(ator, terminal, para),
          `${nome(ator)} ${terminal}>${para}`,
        ).toEqual({
          ok: false,
          recusa: "encaminhamento_encerrado",
        });
      }
    }
  });

  it("concluir não volta a `aceito` e o órgão não conclui", () => {
    expect(
      avaliarTransicaoDoEncaminhamento(
        { tipo: "servidor", papel: "coordenador" },
        "concluido",
        "aceito",
      ),
    ).toEqual({
      ok: false,
      recusa: "encaminhamento_encerrado",
    });
    expect(
      avaliarTransicaoDoEncaminhamento(
        { tipo: "usuario_orgao", papelNoOrgao: "gestor" },
        "respondido",
        "concluido",
      ),
    ).toEqual({ ok: false, recusa: "sem_permissao" });
  });
});

describe("transição fora da tabela", () => {
  it("todo par que não é linha da tabela é `transicao_invalida` (fora os terminais e a D-23)", () => {
    const ator: AtorDoEncaminhamento = { tipo: "servidor", papel: "administrador" };
    const validos = new Set(ESPERADO.map(([de, para]) => `${de}>${para}`));
    for (const de of ESTADOS_DO_ENCAMINHAMENTO) {
      if (encaminhamentoEncerrado(de)) continue;
      for (const para of ESTADOS_DO_ENCAMINHAMENTO) {
        if (validos.has(`${de}>${para}`)) continue;
        const esperado =
          para === "devolvido" && ["aceito", "aguardando_dc", "respondido"].includes(de)
            ? "devolucao_so_antes_do_aceite"
            : "transicao_invalida";
        expect(avaliarTransicaoDoEncaminhamento(ator, de, para), `${de}>${para}`).toEqual({
          ok: false,
          recusa: esperado,
        });
      }
    }
  });

  it("a ordem das recusas de estado vem antes da do ator: o leitor em terminal recebe `encerrado`", () => {
    const leitor: AtorDoEncaminhamento = { tipo: "usuario_orgao", papelNoOrgao: "leitor" };
    expect(avaliarTransicaoDoEncaminhamento(leitor, "concluido", "aceito")).toEqual({
      ok: false,
      recusa: "encaminhamento_encerrado",
    });
  });
});

describe("o catálogo de eventos (decisão 17)", () => {
  const todos = TIPOS_DE_EVENTO_DO_ENCAMINHAMENTO.map((t) => EVENTOS_DO_ENCAMINHAMENTO[t]);

  it("tem uma entrada por tipo, a chave igual ao tipo, e rótulo em português sem repetição", () => {
    expect(Object.keys(EVENTOS_DO_ENCAMINHAMENTO).sort()).toEqual(
      [...TIPOS_DE_EVENTO_DO_ENCAMINHAMENTO].sort(),
    );
    for (const [chave, def] of Object.entries(EVENTOS_DO_ENCAMINHAMENTO)) {
      expect(def.tipo).toBe(chave);
      expect(def.rotulo).not.toContain("_");
    }
    const rotulos = todos.map((d) => d.rotulo);
    expect(new Set(rotulos).size).toBe(rotulos.length);
  });

  it("os tipos da ADR estão todos, inclusive `dossie_recomposto`", () => {
    for (const t of [
      "enviado",
      "visualizado",
      "aceito",
      "devolvido",
      "esclarecimento_solicitado",
      "esclarecimento_respondido",
      "respondido",
      "complemento_solicitado",
      "prazo_alterado",
      "prioridade_alterada",
      "cobrado",
      "escalonado",
      "lembrete",
      "concluido",
      "cancelado",
      "reenviado",
      "reencaminhado",
      "dossie_recomposto",
      "migracao",
    ] as const) {
      expect(TIPOS_DE_EVENTO_DO_ENCAMINHAMENTO).toContain(t);
    }
  });

  it("concorda com a tabela de transições: todo evento de transição é de alguma linha, e toda linha tem o seu", () => {
    const eventosDasLinhas = new Set(TRANSICOES_DO_ENCAMINHAMENTO.map((t) => t.evento));
    const doTipoTransicao = new Set(
      todos.filter((d) => d.nascimento === "transicao").map((d) => d.tipo),
    );
    expect(doTipoTransicao).toEqual(eventosDasLinhas);
    for (const t of TRANSICOES_DO_ENCAMINHAMENTO) {
      expect(EVENTOS_DO_ENCAMINHAMENTO[t.evento].nascimento).toBe("transicao");
    }
  });

  it("um evento por par: dois pares só compartilham o evento quando é o `cancelado`", () => {
    const porEvento = new Map<string, number>();
    for (const t of TRANSICOES_DO_ENCAMINHAMENTO)
      porEvento.set(t.evento, (porEvento.get(t.evento) ?? 0) + 1);
    for (const [evento, n] of porEvento) {
      if (n > 1) expect(evento).toBe("cancelado");
    }
    expect(porEvento.get("cancelado")).toBe(4);
  });

  it("`devolvido` para `enviado` dá `reenviado` e nunca `enviado`: o tipo é do par, não do comando", () => {
    expect(eventoDaTransicao("devolvido", "enviado")).toBe("reenviado");
    expect(eventoDaTransicao(null, "enviado")).toBe("enviado");
  });

  it("o banco gera transição, fato de linha e `reencaminhado`; a inserção direta é só `visualizado`, `lembrete` e `escalonado`", () => {
    expect([...EVENTOS_DE_INSERCAO_DIRETA].sort()).toEqual([
      "escalonado",
      "lembrete",
      "visualizado",
    ]);
    for (const t of EVENTOS_GERADOS_PELO_BANCO) {
      expect(EVENTOS_DE_INSERCAO_DIRETA).not.toContain(t);
      // O dc360_app nunca os insere, sob ator nenhum.
      expect(EVENTOS_DO_ENCAMINHAMENTO[t].atoresDeInsercaoDireta).toEqual([]);
    }
    expect(EVENTOS_GERADOS_PELO_BANCO).toContain("reencaminhado");
    expect(EVENTOS_GERADOS_PELO_BANCO).toContain("dossie_recomposto");
    expect(EVENTOS_GERADOS_PELO_BANCO).not.toContain("migracao");
    // Os três conjuntos mais o backfill cobrem todos os tipos, sem sobreposição.
    const cobertos = [...EVENTOS_GERADOS_PELO_BANCO, ...EVENTOS_DE_INSERCAO_DIRETA, "migracao"];
    expect(cobertos.sort()).toEqual([...TIPOS_DE_EVENTO_DO_ENCAMINHAMENTO].sort());
  });

  it("a lista positiva de inserção direta por ator: órgão só `visualizado`, sistema só `lembrete` e `escalonado`, servidor nenhum", () => {
    expect(TIPOS_DE_INSERCAO_DIRETA_POR_ATOR.usuario_orgao).toEqual(["visualizado"]);
    expect([...TIPOS_DE_INSERCAO_DIRETA_POR_ATOR.sistema].sort()).toEqual([
      "escalonado",
      "lembrete",
    ]);
    expect(TIPOS_DE_INSERCAO_DIRETA_POR_ATOR.servidor).toEqual([]);
  });

  it("o autor `link` só grava `visualizado`, pela função `abrir_oficio`, e nenhum ator de sessão é `link`", () => {
    const comFuncao = todos.filter((d) => d.gravadoPorFuncao);
    expect(comFuncao.map((d) => d.tipo)).toEqual(["visualizado"]);
    expect(comFuncao[0]!.gravadoPorFuncao).toBe("abrir_oficio");
    for (const d of todos) {
      expect(d.atoresDeInsercaoDireta).not.toContain("link");
    }
  });

  it("`fato_seq`: leva o que nasce de transição ou de fato de linha, e só esse", () => {
    for (const d of todos) {
      const esperado = d.nascimento === "transicao" || d.nascimento === "fato_de_linha";
      expect(d.levaFatoSeq, d.tipo).toBe(esperado);
    }
    for (const t of [
      "reencaminhado",
      "visualizado",
      "lembrete",
      "escalonado",
      "migracao",
    ] as const) {
      expect(EVENTOS_DO_ENCAMINHAMENTO[t].levaFatoSeq, t).toBe(false);
    }
  });

  it("só `enviado`, `reenviado` e `dossie_recomposto` declaram versão nova do dossiê", () => {
    expect([...EVENTOS_QUE_DECLARAM_VERSAO_DO_DOSSIE].sort()).toEqual([
      "dossie_recomposto",
      "enviado",
      "reenviado",
    ]);
    // O `visualizado` aponta a versão exibida, mas não declara versão nova.
    expect(EVENTOS_DO_ENCAMINHAMENTO.visualizado.dossieVersao).toBe("exibida");
    for (const d of todos) {
      if (!["enviado", "reenviado", "dossie_recomposto", "visualizado"].includes(d.tipo)) {
        expect(d.dossieVersao, d.tipo).toBe("nenhuma");
      }
    }
    // Quem declara versão nova leva `fato_seq`: a versão é presa ao fato.
    for (const t of EVENTOS_QUE_DECLARAM_VERSAO_DO_DOSSIE) {
      expect(EVENTOS_DO_ENCAMINHAMENTO[t].levaFatoSeq).toBe(true);
    }
  });

  it("`dossie_recomposto` é fato de linha da marca do legado, não transição de estado", () => {
    const d = EVENTOS_DO_ENCAMINHAMENTO.dossie_recomposto;
    expect(d.nascimento).toBe("fato_de_linha");
    expect(d.fatoDeLinha).toBe("marca_pedido_em_revisao");
    expect(TRANSICOES_DO_ENCAMINHAMENTO.map((t) => t.evento)).not.toContain("dossie_recomposto");
    expect(d.quemProduz?.servidor).toEqual(["coordenador", "administrador"]);
  });

  it("`reencaminhado` nunca é visível ao órgão, e nenhum outro tipo de fato interno do pai vaza o destino", () => {
    expect(EVENTOS_DO_ENCAMINHAMENTO.reencaminhado.visivelAoOrgao).toBe(false);
    expect(EVENTOS_DO_ENCAMINHAMENTO.reencaminhado.nascimento).toBe("filho");
    expect(EVENTOS_DO_ENCAMINHAMENTO.reencaminhado.chavesDeTexto).toEqual([]);
    expect(EVENTOS_DO_ENCAMINHAMENTO.reencaminhado.chavesEstruturadas).toEqual([]);
  });

  it("todo fato de linha declara qual fato é, e só eles", () => {
    for (const d of todos) {
      if (d.nascimento === "fato_de_linha") expect(d.fatoDeLinha, d.tipo).toBeDefined();
      else expect(d.fatoDeLinha, d.tipo).toBeUndefined();
    }
    expect(
      todos
        .filter((d) => d.nascimento === "fato_de_linha")
        .map((d) => d.tipo)
        .sort(),
    ).toEqual([
      "atribuicao_alterada",
      "cobrado",
      "dossie_recomposto",
      "prazo_alterado",
      "prioridade_alterada",
    ]);
  });

  it("os fatos de linha da Defesa Civil são de coordenação e administrador; a atribuição é do gestor do órgão", () => {
    const dc: Papel[] = ["coordenador", "administrador"];
    for (const t of [
      "prazo_alterado",
      "prioridade_alterada",
      "cobrado",
      "dossie_recomposto",
    ] as const) {
      expect(EVENTOS_DO_ENCAMINHAMENTO[t].quemProduz?.servidor, t).toEqual(dc);
      expect(EVENTOS_DO_ENCAMINHAMENTO[t].quemProduz?.usuarioOrgao, t).toBeUndefined();
    }
    expect(EVENTOS_DO_ENCAMINHAMENTO.atribuicao_alterada.quemProduz).toEqual({
      usuarioOrgao: ["gestor"],
    });
  });

  it("texto livre só entra pelas chaves de inclusão declaradas, e o tipo que não tem texto não declara chave", () => {
    const comTexto = todos
      .filter((d) => d.chavesDeTexto.length > 0)
      .map((d) => d.tipo)
      .sort();
    expect(comTexto).toEqual([
      "cancelado",
      "cobrado",
      "complemento_solicitado",
      "devolvido",
      "esclarecimento_respondido",
      "esclarecimento_solicitado",
      "prazo_alterado",
      "prioridade_alterada",
      "respondido",
    ]);
    for (const d of todos) {
      // Nenhuma chave aparece como texto e como estruturada ao mesmo tempo.
      for (const c of d.chavesDeTexto) expect(d.chavesEstruturadas).not.toContain(c);
      // Os de inserção direta e o backfill nunca carregam texto livre.
      if (d.nascimento === "insercao_direta" || d.nascimento === "backfill") {
        expect(d.chavesDeTexto, d.tipo).toEqual([]);
      }
    }
    // A resposta da rodada vive em `respondido`, e a justificativa do campo sensível não é chave de evento.
    expect(EVENTOS_DO_ENCAMINHAMENTO.respondido.chavesDeTexto).toEqual(["resposta"]);
    expect(EVENTOS_DO_ENCAMINHAMENTO.enviado.chavesDeTexto).toEqual([]);
    // O `enviado` registra as chaves do dossiê, nunca os valores.
    expect(EVENTOS_DO_ENCAMINHAMENTO.enviado.chavesEstruturadas).toEqual(["campos_do_dossie"]);
  });

  it("a transição do órgão gera aviso para a Defesa Civil, e a da Defesa Civil gera aviso para o órgão", () => {
    for (const t of TRANSICOES_DO_ENCAMINHAMENTO) {
      const def = EVENTOS_DO_ENCAMINHAMENTO[t.evento];
      const daDefesaCivil = t.orgao === null;
      if (daDefesaCivil) {
        expect(def.avisoDoOrgao, t.evento).toBe(true);
        expect(def.avisosParaADefesaCivil, t.evento).toEqual([]);
      } else {
        expect(def.avisoDoOrgao, t.evento).toBe(false);
        expect(def.avisosParaADefesaCivil.length, t.evento).toBeGreaterThan(0);
      }
    }
  });

  it("toda transição tem espelho na trilha; o relógio e a visualização não têm (não cabem em `origem`)", () => {
    for (const t of TRANSICOES_DO_ENCAMINHAMENTO) {
      expect(EVENTOS_DO_ENCAMINHAMENTO[t.evento].espelhoNaTrilha, t.evento).toBe(true);
    }
    for (const t of ["lembrete", "escalonado", "visualizado", "migracao"] as const) {
      expect(EVENTOS_DO_ENCAMINHAMENTO[t].espelhoNaTrilha, t).toBe(false);
    }
  });

  it("os eventos de transição do órgão são visíveis ao órgão, e só `reencaminhado` e `migracao` não são", () => {
    const invisiveis = todos
      .filter((d) => !d.visivelAoOrgao)
      .map((d) => d.tipo)
      .sort();
    expect(invisiveis).toEqual(["migracao", "reencaminhado"]);
  });
});
