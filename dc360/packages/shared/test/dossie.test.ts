import { describe, expect, it } from "vitest";
import {
  CAMPOS_DO_DOSSIE,
  CHAVES_DO_MINIMO_FIXO,
  COLUNAS_DE_TEXTO_LIVRE_FORA_DO_DOSSIE,
  JUSTIFICATIVA_MINIMA_DO_DOSSIE,
  PEDIDO_MINIMO_DO_DOSSIE,
  ROTULO_PEDIDO_EM_REVISAO,
  TEXTO_MAXIMO_DO_DOSSIE,
  montarDossie,
  montarDossieDeMigracao,
  type DossieMontado,
  type EscolhaDoDossie,
  type OcorrenciaParaDossie,
  type ResultadoDaMontagemDoDossie,
} from "../src/index.js";

/**
 * O dossiê é o que sai da Defesa Civil para uma secretaria. Estes testes provam
 * a regra de INCLUSÃO: o que não está no catálogo nunca sai, o que é sensível só
 * sai marcado e justificado, e o texto livre antigo de `providencias` e de
 * `oficios` não tem caminho nenhum até o órgão.
 *
 * Os valores abaixo são sentinelas únicas: se qualquer uma aparecer no JSON de
 * um resultado em que não deveria, o teste acusa o vazamento pelo nome dela.
 */

const NOME = "SENTINELA-NOME Marilda Souza Prado";
const CONTATO = "SENTINELA-CONTATO (11) 98888-7777";
const VULNERABILIDADE = "SENTINELA-VULNERABILIDADE idosa acamada e duas crianças";
const RELATO = "SENTINELA-RELATO a barreira cedeu atrás da casa de dona Zilda";
const DOCUMENTO = "SENTINELA-DOCUMENTO 123.456.789-09";
const EMAIL = "SENTINELA-EMAIL marilda@exemplo.invalid";
const TEXTO_DA_PROVIDENCIA = "SENTINELA-PROVIDENCIA ligar para o filho dela no 99999-0000";
const TEXTO_DO_OFICIO = "SENTINELA-OFICIO avisar o vizinho do lado";

function ocorrencia(extra: Record<string, unknown> = {}): OcorrenciaParaDossie {
  return {
    protocolo: "DC-2026-000123",
    tipo: "deslizamento",
    endereco: "Rua das Acácias, 245",
    solicitante_nome: NOME,
    solicitante_contato: CONTATO,
    vulnerabilidade_presente: true,
    vulnerabilidade_descricao: VULNERABILIDADE,
    descricao: RELATO,
    /* Colunas que existem (ou existirão) na linha e que o catálogo não conhece. */
    solicitante_documento: DOCUMENTO,
    solicitante_email: EMAIL,
    latitude: -23.5,
    longitude: -46.6,
    ...extra,
  };
}

const PEDIDO = "Vistoriar o talude e informar se há risco de novo deslizamento.";
const JUSTIFICATIVA = "O órgão precisa falar com a família para agendar a vistoria.";

function escolha(extra: Partial<EscolhaDoDossie> = {}): EscolhaDoDossie {
  return { pedido: PEDIDO, ...extra };
}

function dossieOk(r: ResultadoDaMontagemDoDossie): DossieMontado {
  if (!r.ok) throw new Error(`esperava dossiê, veio recusa: ${JSON.stringify(r.erros)}`);
  return r.dossie;
}

function motivos(r: ResultadoDaMontagemDoDossie): string[] {
  if (r.ok) throw new Error("esperava recusa, veio dossiê");
  return r.erros.map((e) => `${e.chave}:${e.motivo}`);
}

function congelarFundo<T>(valor: T): T {
  if (valor !== null && typeof valor === "object") {
    for (const v of Object.values(valor as object)) congelarFundo(v);
    Object.freeze(valor);
  }
  return valor;
}

const SENTINELAS = [
  NOME,
  CONTATO,
  VULNERABILIDADE,
  RELATO,
  DOCUMENTO,
  EMAIL,
  TEXTO_DA_PROVIDENCIA,
  TEXTO_DO_OFICIO,
];

function vazamentos(r: ResultadoDaMontagemDoDossie): string[] {
  const texto = JSON.stringify(r);
  return SENTINELAS.filter((s) => texto.includes(s));
}

describe("o catálogo do dossiê", () => {
  it("o mínimo fixo é protocolo, tipo e endereço, e mais nada", () => {
    expect([...CHAVES_DO_MINIMO_FIXO]).toEqual(["protocolo", "tipo", "endereco"]);
  });

  it("não repete chave", () => {
    const chaves = CAMPOS_DO_DOSSIE.map((c) => c.chave);
    expect(new Set(chaves).size).toBe(chaves.length);
  });

  it("os quatro dados pessoais da ocorrência são sensíveis e exigem justificativa", () => {
    for (const chave of [
      "solicitante_nome",
      "solicitante_contato",
      "vulnerabilidade_descricao",
      "descricao",
    ]) {
      const campo = CAMPOS_DO_DOSSIE.find((c) => c.chave === chave);
      expect(campo, chave).toBeDefined();
      expect(campo?.sensivel, chave).toBe(true);
      expect(campo?.exigeJustificativa, chave).toBe(true);
      expect(campo?.obrigatorio, chave).toBe(false);
    }
  });

  it("pedido e observações são texto livre dirigido ao órgão, em campos_sensiveis (correção 1)", () => {
    const pedido = CAMPOS_DO_DOSSIE.find((c) => c.chave === "pedido");
    const observacoes = CAMPOS_DO_DOSSIE.find((c) => c.chave === "observacoes_da_coordenacao");
    expect(pedido?.categoria).toBe("texto_livre_dirigido_ao_orgao");
    expect(observacoes?.categoria).toBe("texto_livre_dirigido_ao_orgao");
    expect(pedido?.sensivel).toBe(true);
    expect(observacoes?.sensivel).toBe(true);
    expect(pedido?.obrigatorio).toBe(true);
    expect(observacoes?.obrigatorio).toBe(false);
  });

  it("nenhum campo do dossiê tem origem em providencias ou oficios", () => {
    for (const campo of CAMPOS_DO_DOSSIE) {
      if (campo.origem.de === "ocorrencias") {
        const completo = `ocorrencias.${campo.origem.coluna}`;
        expect(COLUNAS_DE_TEXTO_LIVRE_FORA_DO_DOSSIE).not.toContain(completo);
      }
      expect(JSON.stringify(campo.origem)).not.toMatch(/providencias|oficios/);
    }
  });

  it("nomeia as seis colunas de texto livre que nunca chegam ao órgão", () => {
    expect([...COLUNAS_DE_TEXTO_LIVRE_FORA_DO_DOSSIE].sort()).toEqual(
      [
        "oficios.observacoes",
        "providencias.descricao",
        "providencias.orgao_destino",
        "providencias.resposta",
        "providencias.respondida_por",
        "providencias.responsavel",
      ].sort(),
    );
  });

  it("o catálogo é imutável", () => {
    expect(Object.isFrozen(CAMPOS_DO_DOSSIE)).toBe(true);
    expect(Object.isFrozen(CAMPOS_DO_DOSSIE[0])).toBe(true);
    expect(() => {
      (CAMPOS_DO_DOSSIE as unknown as unknown[]).push({});
    }).toThrow();
  });
});

describe("o padrão conservador", () => {
  it("sem marcar nada, sai o mínimo fixo e o pedido, e nenhum dado pessoal", () => {
    const r = montarDossie(ocorrencia(), escolha());
    const d = dossieOk(r);
    expect(d.origem).toBe("dc");
    expect(d.campos).toEqual({
      protocolo: "DC-2026-000123",
      tipo: "deslizamento",
      endereco: "Rua das Acácias, 245",
    });
    expect(d.campos_sensiveis).toEqual({ pedido: PEDIDO });
    expect(d.justificativas).toEqual({});
    expect(d.chaves_incluidas).toEqual(["protocolo", "tipo", "endereco", "pedido"]);
    expect(d.pedido_em_revisao).toBe(false);
    expect(vazamentos(r)).toEqual([]);
  });
});

describe("campo fora da lista nunca sai", () => {
  it.each([
    "solicitante_documento",
    "solicitante_email",
    "latitude",
    "providencias.descricao",
    "oficios.observacoes",
    "resposta",
    "respondida_por",
    "orgao_destino",
    "__proto__",
    "constructor",
    "toString",
    "",
  ])("pedir %j reprova e não copia nada", (chave) => {
    const r = montarDossie(
      ocorrencia({ [chave || "vazio"]: "SENTINELA-FORA" }),
      escolha({ incluir: [chave], justificativas: { [chave]: JUSTIFICATIVA } }),
    );
    expect(r.ok).toBe(false);
    expect(motivos(r)).toContain(`${chave}:fora_da_lista`);
    expect(JSON.stringify(r)).not.toContain("SENTINELA-FORA");
    expect(vazamentos(r)).toEqual([]);
  });

  it("coluna que existe na ocorrência mas não no catálogo não aparece mesmo sem ser pedida", () => {
    const r = montarDossie(ocorrencia(), escolha());
    const texto = JSON.stringify(r);
    expect(texto).not.toContain(DOCUMENTO);
    expect(texto).not.toContain(EMAIL);
    expect(texto).not.toContain("latitude");
    expect(texto).not.toContain("-23.5");
  });

  it("pedir um campo fora da lista junto com campos válidos recusa o dossiê inteiro", () => {
    const r = montarDossie(
      ocorrencia(),
      escolha({
        incluir: ["solicitante_nome", "solicitante_documento"],
        justificativas: { solicitante_nome: JUSTIFICATIVA },
      }),
    );
    expect(r.ok).toBe(false);
    expect(motivos(r)).toEqual(["solicitante_documento:fora_da_lista"]);
    expect(vazamentos(r)).toEqual([]);
  });

  it("uma chave herdada do Object não passa por campo do catálogo", () => {
    const r = montarDossie(ocorrencia(), escolha({ incluir: ["hasOwnProperty", "valueOf"] }));
    expect(r.ok).toBe(false);
    expect(motivos(r)).toEqual(["hasOwnProperty:fora_da_lista", "valueOf:fora_da_lista"]);
  });
});

describe("o texto livre de providencias e de oficios não tem caminho até o órgão", () => {
  const COM_TEXTO_ANTIGO = {
    descricao_da_providencia: TEXTO_DA_PROVIDENCIA,
    responsavel: TEXTO_DA_PROVIDENCIA,
    orgao_destino: TEXTO_DA_PROVIDENCIA,
    resposta: TEXTO_DA_PROVIDENCIA,
    respondida_por: TEXTO_DA_PROVIDENCIA,
    observacoes: TEXTO_DO_OFICIO,
    "providencias.descricao": TEXTO_DA_PROVIDENCIA,
    "oficios.observacoes": TEXTO_DO_OFICIO,
  };

  it("mesmo presente na linha entregue, não sai", () => {
    const r = montarDossie(
      ocorrencia(COM_TEXTO_ANTIGO),
      escolha({
        incluir: ["solicitante_nome"],
        justificativas: { solicitante_nome: JUSTIFICATIVA },
      }),
    );
    const d = dossieOk(r);
    expect(Object.keys(d.campos_sensiveis ?? {}).sort()).toEqual(["pedido", "solicitante_nome"]);
    expect(JSON.stringify(r)).not.toContain("SENTINELA-PROVIDENCIA");
    expect(JSON.stringify(r)).not.toContain("SENTINELA-OFICIO");
  });

  it.each(COLUNAS_DE_TEXTO_LIVRE_FORA_DO_DOSSIE)("pedir %s reprova", (coluna) => {
    const curta = coluna.split(".")[1] as string;
    /* O nome curto de "providencias.descricao" é "descricao", que no catálogo é o
       relato da OCORRÊNCIA: só os nomes curtos que o catálogo não conhece entram. */
    const conhecidas = new Set(CAMPOS_DO_DOSSIE.map((c) => c.chave));
    for (const chave of [coluna, curta].filter((c) => !conhecidas.has(c))) {
      const r = montarDossie(
        ocorrencia(COM_TEXTO_ANTIGO),
        escolha({ incluir: [chave], justificativas: { [chave]: JUSTIFICATIVA } }),
      );
      expect(r.ok, chave).toBe(false);
      expect(motivos(r), chave).toContain(`${chave}:fora_da_lista`);
      expect(JSON.stringify(r), chave).not.toContain("SENTINELA-PROVIDENCIA");
      expect(JSON.stringify(r), chave).not.toContain("SENTINELA-OFICIO");
    }
  });

  it("o que a Defesa Civil quer dizer ao órgão só vai pelo pedido e pelas observações", () => {
    const d = dossieOk(
      montarDossie(
        ocorrencia(COM_TEXTO_ANTIGO),
        escolha({ observacoes_da_coordenacao: "Prioridade: há criança na casa." }),
      ),
    );
    expect(d.campos_sensiveis).toEqual({
      pedido: PEDIDO,
      observacoes_da_coordenacao: "Prioridade: há criança na casa.",
    });
  });
});

describe("campo sensível só com justificativa", () => {
  const SENSIVEIS = [
    "solicitante_nome",
    "solicitante_contato",
    "vulnerabilidade_descricao",
    "descricao",
  ];

  it.each(SENSIVEIS)("%s marcado sem justificativa reprova", (chave) => {
    const r = montarDossie(ocorrencia(), escolha({ incluir: [chave] }));
    expect(r.ok).toBe(false);
    expect(motivos(r)).toEqual([`${chave}:sensivel_sem_justificativa`]);
    expect(vazamentos(r)).toEqual([]);
  });

  it.each(SENSIVEIS)("%s com justificativa só de espaços conta como sem justificativa", (chave) => {
    const r = montarDossie(
      ocorrencia(),
      escolha({ incluir: [chave], justificativas: { [chave]: " ".repeat(40) } }),
    );
    expect(r.ok).toBe(false);
    expect(motivos(r)).toEqual([`${chave}:sensivel_sem_justificativa`]);
  });

  it.each(SENSIVEIS)("%s com justificativa de 19 caracteres reprova", (chave) => {
    const r = montarDossie(
      ocorrencia(),
      escolha({ incluir: [chave], justificativas: { [chave]: "a".repeat(19) } }),
    );
    expect(r.ok).toBe(false);
    expect(motivos(r)).toEqual([`${chave}:justificativa_curta`]);
    expect(vazamentos(r)).toEqual([]);
  });

  it("o piso conta o texto aparado, não os espaços em volta", () => {
    const r = montarDossie(
      ocorrencia(),
      escolha({
        incluir: ["solicitante_nome"],
        justificativas: { solicitante_nome: `   ${"a".repeat(10)}   ` },
      }),
    );
    expect(motivos(r)).toEqual(["solicitante_nome:justificativa_curta"]);
  });

  it("com exatamente 20 caracteres o campo sai", () => {
    expect(JUSTIFICATIVA_MINIMA_DO_DOSSIE).toBe(20);
    const vinte = "a".repeat(20);
    const d = dossieOk(
      montarDossie(
        ocorrencia(),
        escolha({ incluir: ["solicitante_nome"], justificativas: { solicitante_nome: vinte } }),
      ),
    );
    expect(d.campos_sensiveis?.["solicitante_nome"]).toBe(NOME);
  });

  it("a justificativa fica registrada pela chave do campo, nunca pelo valor", () => {
    const d = dossieOk(
      montarDossie(
        ocorrencia(),
        escolha({
          incluir: ["solicitante_nome", "vulnerabilidade_descricao"],
          justificativas: {
            solicitante_nome: "O órgão precisa chamar a pessoa pelo nome.",
            vulnerabilidade_descricao: "Há idosa acamada: o órgão precisa saber para a remoção.",
          },
        }),
      ),
    );
    expect(d.justificativas).toEqual({
      solicitante_nome: "O órgão precisa chamar a pessoa pelo nome.",
      vulnerabilidade_descricao: "Há idosa acamada: o órgão precisa saber para a remoção.",
    });
    expect(d.chaves_incluidas).toEqual([
      "protocolo",
      "tipo",
      "endereco",
      "solicitante_nome",
      "vulnerabilidade_descricao",
      "pedido",
    ]);
    /* As justificativas não carregam o valor do campo que justificam. */
    expect(JSON.stringify(d.justificativas)).not.toContain(NOME);
    expect(JSON.stringify(d.justificativas)).not.toContain(VULNERABILIDADE);
  });

  it("só registra a justificativa de quem exige ou deu, e a aparada", () => {
    const d = dossieOk(
      montarDossie(
        ocorrencia(),
        escolha({
          incluir: ["descricao"],
          justificativas: { descricao: `   ${JUSTIFICATIVA}   ` },
        }),
      ),
    );
    expect(d.justificativas).toEqual({ descricao: JUSTIFICATIVA });
  });

  it("justificativa de campo que não foi marcado reprova (não fica registro de envio que não houve)", () => {
    const r = montarDossie(
      ocorrencia(),
      escolha({ justificativas: { solicitante_nome: JUSTIFICATIVA } }),
    );
    expect(r.ok).toBe(false);
    expect(motivos(r)).toEqual(["solicitante_nome:justificativa_de_campo_nao_incluido"]);
  });

  it("os erros nunca trazem o valor do campo", () => {
    const r = montarDossie(
      ocorrencia(),
      escolha({ incluir: ["solicitante_nome", "descricao", "solicitante_contato"] }),
    );
    expect(r.ok).toBe(false);
    expect(vazamentos(r)).toEqual([]);
  });

  it("marcado mas sem dado na ocorrência reprova em vez de enviar vazio", () => {
    const r = montarDossie(
      ocorrencia({ solicitante_contato: null, vulnerabilidade_presente: false }),
      escolha({
        incluir: ["solicitante_contato", "vulnerabilidade_descricao"],
        justificativas: {
          solicitante_contato: JUSTIFICATIVA,
          vulnerabilidade_descricao: JUSTIFICATIVA,
        },
      }),
    );
    expect(r.ok).toBe(false);
    expect(motivos(r)).toEqual([
      "solicitante_contato:campo_vazio_na_ocorrencia",
      "vulnerabilidade_descricao:campo_vazio_na_ocorrencia",
    ]);
    expect(vazamentos(r)).toEqual([]);
  });
});

describe("nenhum dado pessoal do solicitante sai sem ser marcado com justificativa", () => {
  it("nome, telefone, vulnerabilidade, relato e documento: nenhum aparece no padrão", () => {
    const r = montarDossie(ocorrencia(), escolha());
    expect(vazamentos(r)).toEqual([]);
  });

  it("marcar um não libera os outros", () => {
    const r = montarDossie(
      ocorrencia(),
      escolha({
        incluir: ["solicitante_contato"],
        justificativas: { solicitante_contato: JUSTIFICATIVA },
      }),
    );
    const texto = JSON.stringify(r);
    expect(texto).toContain(CONTATO);
    for (const outro of [NOME, VULNERABILIDADE, RELATO, DOCUMENTO, EMAIL]) {
      expect(texto).not.toContain(outro);
    }
  });

  it("marcados e justificados os quatro, saem os quatro, e o documento continua fora", () => {
    const chaves = [
      "solicitante_nome",
      "solicitante_contato",
      "vulnerabilidade_descricao",
      "descricao",
    ];
    const r = montarDossie(
      ocorrencia(),
      escolha({
        incluir: chaves,
        justificativas: Object.fromEntries(chaves.map((c) => [c, JUSTIFICATIVA])),
      }),
    );
    const d = dossieOk(r);
    expect(d.campos_sensiveis).toEqual({
      solicitante_nome: NOME,
      solicitante_contato: CONTATO,
      vulnerabilidade_descricao: VULNERABILIDADE,
      descricao: RELATO,
      pedido: PEDIDO,
    });
    const texto = JSON.stringify(r);
    expect(texto).not.toContain(DOCUMENTO);
    expect(texto).not.toContain(EMAIL);
  });

  it("o dado sensível mora só em campos_sensiveis, nunca em campos", () => {
    const d = dossieOk(
      montarDossie(
        ocorrencia(),
        escolha({
          incluir: ["solicitante_nome"],
          justificativas: { solicitante_nome: JUSTIFICATIVA },
        }),
      ),
    );
    expect(Object.keys(d.campos)).toEqual(["protocolo", "tipo", "endereco"]);
    expect(JSON.stringify(d.campos)).not.toContain(NOME);
    expect(d.campos_sensiveis?.["solicitante_nome"]).toBe(NOME);
  });

  it("a ordem de chaves_incluidas é a do catálogo, não a do pedido", () => {
    const d = dossieOk(
      montarDossie(
        ocorrencia(),
        escolha({
          incluir: ["descricao", "solicitante_nome"],
          justificativas: { descricao: JUSTIFICATIVA, solicitante_nome: JUSTIFICATIVA },
        }),
      ),
    );
    expect(d.chaves_incluidas).toEqual([
      "protocolo",
      "tipo",
      "endereco",
      "solicitante_nome",
      "descricao",
      "pedido",
    ]);
  });

  it("repetir uma chave em incluir não duplica nada", () => {
    const d = dossieOk(
      montarDossie(
        ocorrencia(),
        escolha({
          incluir: ["solicitante_nome", "solicitante_nome"],
          justificativas: { solicitante_nome: JUSTIFICATIVA },
        }),
      ),
    );
    expect(d.chaves_incluidas.filter((c) => c === "solicitante_nome")).toHaveLength(1);
  });
});

describe("o texto livre dirigido ao órgão", () => {
  it("o pedido é obrigatório", () => {
    for (const pedido of ["", "   ", undefined as unknown as string]) {
      const r = montarDossie(ocorrencia(), { pedido });
      expect(motivos(r)).toEqual(["pedido:pedido_ausente"]);
    }
  });

  it("o pedido tem piso e teto", () => {
    expect(
      motivos(montarDossie(ocorrencia(), { pedido: "x".repeat(PEDIDO_MINIMO_DO_DOSSIE - 1) })),
    ).toEqual(["pedido:pedido_curto"]);
    expect(montarDossie(ocorrencia(), { pedido: "x".repeat(PEDIDO_MINIMO_DO_DOSSIE) }).ok).toBe(
      true,
    );
    expect(montarDossie(ocorrencia(), { pedido: "x".repeat(TEXTO_MAXIMO_DO_DOSSIE) }).ok).toBe(
      true,
    );
    expect(
      motivos(montarDossie(ocorrencia(), { pedido: "x".repeat(TEXTO_MAXIMO_DO_DOSSIE + 1) })),
    ).toEqual(["pedido:texto_longo_demais"]);
  });

  it("as observações são opcionais: vazias ou ausentes não entram", () => {
    for (const observacoes of [undefined, null, "", "   "]) {
      const d = dossieOk(
        montarDossie(ocorrencia(), escolha({ observacoes_da_coordenacao: observacoes })),
      );
      expect(d.campos_sensiveis).toEqual({ pedido: PEDIDO });
      expect(d.chaves_incluidas).not.toContain("observacoes_da_coordenacao");
    }
  });

  it("as observações entram em campos_sensiveis, e o registro leva a chave", () => {
    const d = dossieOk(
      montarDossie(
        ocorrencia(),
        escolha({ observacoes_da_coordenacao: "  Há criança na casa.  " }),
      ),
    );
    expect(d.campos_sensiveis).toEqual({
      pedido: PEDIDO,
      observacoes_da_coordenacao: "Há criança na casa.",
    });
    expect(d.chaves_incluidas).toEqual([
      "protocolo",
      "tipo",
      "endereco",
      "pedido",
      "observacoes_da_coordenacao",
    ]);
  });

  it("as observações têm teto", () => {
    const r = montarDossie(
      ocorrencia(),
      escolha({ observacoes_da_coordenacao: "x".repeat(TEXTO_MAXIMO_DO_DOSSIE + 1) }),
    );
    expect(motivos(r)).toEqual(["observacoes_da_coordenacao:texto_longo_demais"]);
  });

  it("não pedem a justificativa dos dados pessoais, mas se vier curta reprova", () => {
    expect(dossieOk(montarDossie(ocorrencia(), escolha())).justificativas).toEqual({});
    const r = montarDossie(
      ocorrencia(),
      escolha({
        observacoes_da_coordenacao: "Atenção ao acesso.",
        justificativas: { observacoes_da_coordenacao: "curta" },
      }),
    );
    expect(motivos(r)).toEqual(["observacoes_da_coordenacao:justificativa_curta"]);
  });
});

describe("o mínimo fixo da ocorrência", () => {
  it("ocorrência ainda a classificar não vai para uma secretaria", () => {
    const r = montarDossie(ocorrencia({ tipo: "outro" }), escolha());
    expect(motivos(r)).toEqual(["tipo:tipo_a_classificar"]);
  });

  it("tipo inventado também reprova", () => {
    const r = montarDossie(ocorrencia({ tipo: "tsunami" }), escolha());
    expect(motivos(r)).toEqual(["tipo:tipo_a_classificar"]);
  });

  it("sem protocolo ou sem endereço não há dossiê", () => {
    expect(motivos(montarDossie(ocorrencia({ protocolo: "  " }), escolha()))).toEqual([
      "protocolo:minimo_ausente",
    ]);
    expect(motivos(montarDossie(ocorrencia({ endereco: "" }), escolha()))).toEqual([
      "endereco:minimo_ausente",
    ]);
  });

  it("o dossiê que falha no mínimo também aponta o erro do pedido", () => {
    const r = montarDossie(ocorrencia({ endereco: "" }), { pedido: "" });
    expect(motivos(r)).toEqual(["endereco:minimo_ausente", "pedido:pedido_ausente"]);
  });
});

describe("o resultado é um objeto novo", () => {
  it("não muta a ocorrência nem a escolha, mesmo congeladas", () => {
    const o = congelarFundo(ocorrencia());
    const e = congelarFundo(
      escolha({
        incluir: ["solicitante_nome"],
        justificativas: { solicitante_nome: JUSTIFICATIVA },
        observacoes_da_coordenacao: "Atenção ao acesso.",
      }),
    );
    const antes = JSON.stringify([o, e]);
    const r = montarDossie(o, e);
    expect(r.ok).toBe(true);
    expect(JSON.stringify([o, e])).toBe(antes);
  });

  it("não devolve referência a nenhum objeto da entrada", () => {
    const o = ocorrencia();
    const incluir = ["solicitante_nome"];
    const justificativas = { solicitante_nome: JUSTIFICATIVA };
    const d = dossieOk(montarDossie(o, escolha({ incluir, justificativas })));
    expect(d).not.toBe(o);
    expect(d.justificativas).not.toBe(justificativas);
    expect(d.chaves_incluidas).not.toBe(incluir);
    /* Mexer na entrada depois não altera o snapshot. */
    justificativas.solicitante_nome = "outra coisa";
    incluir.push("descricao");
    (o as { endereco: string }).endereco = "Outro lugar, 1";
    expect(d.justificativas["solicitante_nome"]).toBe(JUSTIFICATIVA);
    expect(d.chaves_incluidas).not.toContain("descricao");
    expect(d.campos["endereco"]).toBe("Rua das Acácias, 245");
  });

  it("duas chamadas com a mesma entrada dão objetos independentes e iguais", () => {
    const o = ocorrencia();
    const e = escolha();
    const a = dossieOk(montarDossie(o, e));
    const b = dossieOk(montarDossie(o, e));
    expect(a).not.toBe(b);
    expect(a.campos).not.toBe(b.campos);
    expect(a).toEqual(b);
  });

  it("o snapshot não pode ser alterado depois de montado", () => {
    const d = dossieOk(montarDossie(ocorrencia(), escolha()));
    expect(Object.isFrozen(d)).toBe(true);
    expect(Object.isFrozen(d.campos)).toBe(true);
    expect(Object.isFrozen(d.campos_sensiveis)).toBe(true);
    expect(Object.isFrozen(d.chaves_incluidas)).toBe(true);
    expect(() => {
      (d.campos as Record<string, string>)["protocolo"] = "outro";
    }).toThrow();
    expect(() => {
      (d.campos_sensiveis as Record<string, string>)["nome"] = "intruso";
    }).toThrow();
  });
});

describe("a versão migracao dos legados, sem texto livre", () => {
  it("copia só o mínimo fixo e marca o pedido em revisão", () => {
    const r = montarDossieDeMigracao(ocorrencia());
    const d = dossieOk(r);
    expect(d.origem).toBe("migracao");
    expect(d.campos).toEqual({
      protocolo: "DC-2026-000123",
      tipo: "deslizamento",
      endereco: "Rua das Acácias, 245",
    });
    expect(d.campos_sensiveis).toBeNull();
    expect(d.justificativas).toEqual({});
    expect(d.chaves_incluidas).toEqual(["protocolo", "tipo", "endereco"]);
    expect(d.pedido_em_revisao).toBe(true);
    expect(ROTULO_PEDIDO_EM_REVISAO).toBe("Pedido em revisão pela Defesa Civil");
  });

  it("nenhum texto livre passa, venha de onde vier", () => {
    const r = montarDossieDeMigracao(
      ocorrencia({
        descricao_da_providencia: TEXTO_DA_PROVIDENCIA,
        resposta: TEXTO_DA_PROVIDENCIA,
        observacoes: TEXTO_DO_OFICIO,
        pedido: "SENTINELA-PEDIDO-ANTIGO",
        observacoes_da_coordenacao: "SENTINELA-OBSERVACAO-ANTIGA",
      }),
    );
    dossieOk(r);
    expect(vazamentos(r)).toEqual([]);
    expect(JSON.stringify(r)).not.toContain("SENTINELA-PEDIDO-ANTIGO");
    expect(JSON.stringify(r)).not.toContain("SENTINELA-OBSERVACAO-ANTIGA");
  });

  it("tem o mesmo mínimo do dossiê composto pela Defesa Civil", () => {
    const o = ocorrencia();
    expect(dossieOk(montarDossieDeMigracao(o)).campos).toEqual(
      dossieOk(montarDossie(o, escolha())).campos,
    );
  });

  it("a recomposição pela Defesa Civil tira a marca", () => {
    const o = ocorrencia();
    expect(dossieOk(montarDossieDeMigracao(o)).pedido_em_revisao).toBe(true);
    expect(dossieOk(montarDossie(o, escolha())).pedido_em_revisao).toBe(false);
  });

  it("não muta a entrada e devolve objeto novo e congelado", () => {
    const o = congelarFundo(ocorrencia());
    const antes = JSON.stringify(o);
    const d = dossieOk(montarDossieDeMigracao(o));
    expect(JSON.stringify(o)).toBe(antes);
    expect(d).not.toBe(o);
    expect(Object.isFrozen(d)).toBe(true);
    expect(Object.isFrozen(d.campos)).toBe(true);
    expect(Object.isFrozen(d.chaves_incluidas)).toBe(true);
  });

  it("legado sem tipo da COBRADE não ganha dossiê: a migração precisa decidir à parte", () => {
    expect(motivos(montarDossieDeMigracao(ocorrencia({ tipo: "outro" })))).toEqual([
      "tipo:tipo_a_classificar",
    ]);
  });
});
