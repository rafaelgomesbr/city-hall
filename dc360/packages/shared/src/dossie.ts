import { TIPOS_COBRADE, type TipoDeEntrada } from "./dominio.js";

/**
 * O dossiê do encaminhamento: o que sai da Defesa Civil para uma secretaria.
 *
 * É a única coisa da ocorrência que o órgão alcança (ADR 0010, decisões 1, 5 e
 * 10). Por isso a regra aqui é de INCLUSÃO: `CAMPOS_DO_DOSSIE` é a lista
 * fechada do que pode sair, e `montarDossie` só copia o que está nela E foi
 * marcado. A minimização por lista de exclusão já vazou uma vez
 * (`semOQueSoODossieEntrega`), porque coluna nova na ocorrência passava para
 * fora sem ninguém decidir. Aqui, coluna nova na ocorrência não sai: para sair
 * ela precisa ganhar uma linha no catálogo, num commit que a revisão de LGPD vê.
 *
 * Três camadas, da mais aberta para a mais fechada:
 *
 * 1. O MÍNIMO FIXO (protocolo, tipo COBRADE e endereço): sai sempre, sem
 *    justificativa. É o que o órgão precisa para saber de que local se trata.
 * 2. O DADO SENSÍVEL DA OCORRÊNCIA (nome do solicitante, contato, descrição da
 *    vulnerabilidade e descrição livre do relato): só sai se a Defesa Civil
 *    marcar o campo E escrever uma justificativa de no mínimo 20 caracteres, que
 *    fica registrada pela CHAVE do campo (nunca pelo valor).
 * 3. O TEXTO LIVRE DIRIGIDO AO ÓRGÃO (`pedido` e `observacoes_da_coordenacao`):
 *    são os únicos canais de texto livre ao órgão fora dos eventos (decisão 5).
 *    Quem os escreve sabe que vão para fora, e a tela avisa; por isso não pedem
 *    a justificativa da camada 2. Ficam, como ela, em `campos_sensiveis`, a
 *    coluna sujeita à retenção.
 *
 * O texto livre das colunas de `providencias` e de `oficios` NUNCA entra: foi
 * escrito sem esta regra e pode carregar contato, relato ou informação interna.
 * `COLUNAS_DE_TEXTO_LIVRE_FORA_DO_DOSSIE` as nomeia, para que a rota do órgão e
 * o ofício provem que não as imprimem.
 *
 * Este módulo é puro: não lê banco, não escreve nada, não muta o que recebe. A
 * composição acontece na rota da Defesa Civil, sob o ator dela, que lê a
 * ocorrência e entrega a linha aqui.
 */

/** Piso da justificativa de um campo sensível. O mesmo da exportação completa (migração 021). */
export const JUSTIFICATIVA_MINIMA_DO_DOSSIE = 20;

/** Teto do texto do pedido e das observações; o mesmo da descrição do relato. */
export const TEXTO_MAXIMO_DO_DOSSIE = 4000;

/** Piso do pedido: separa um pedido de um "x" digitado para liberar o formulário. */
export const PEDIDO_MINIMO_DO_DOSSIE = 10;

/** O que o painel e o portal mostram enquanto um encaminhamento legado espera a recomposição. */
export const ROTULO_PEDIDO_EM_REVISAO = "Pedido em revisão pela Defesa Civil";

export type CategoriaDoCampoDoDossie =
  "minimo_fixo" | "dado_sensivel_da_ocorrencia" | "texto_livre_dirigido_ao_orgao";

export type OrigemDoCampoDoDossie =
  | { readonly de: "ocorrencias"; readonly coluna: string }
  | { readonly de: "escolha_da_defesa_civil" };

export type CampoDoDossie = {
  /** O nome do campo no snapshot, nas justificativas e no evento `enviado`. */
  readonly chave: string;
  readonly rotulo: string;
  readonly categoria: CategoriaDoCampoDoDossie;
  /** Vai para `campos_sensiveis` (a coluna sujeita à retenção) e não para `campos`. */
  readonly sensivel: boolean;
  /** Só sai com justificativa escrita de no mínimo `JUSTIFICATIVA_MINIMA_DO_DOSSIE` caracteres. */
  readonly exigeJustificativa: boolean;
  /** Entra em todo dossiê, sem a Defesa Civil marcar. */
  readonly obrigatorio: boolean;
  readonly origem: OrigemDoCampoDoDossie;
};

/**
 * A lista de inclusão. Campo que não está aqui nunca sai, seja qual for o
 * pedido. A ordem é a ordem em que o dossiê é mostrado.
 *
 * Candidatos que ficaram DE FORA de propósito até o CP-09 decidir: ponto de
 * referência (texto livre da ocorrência, pode citar nome de vizinho), severidade
 * e data de interdição. Entrar é acrescentar uma linha aqui.
 */
const CATALOGO_BRUTO: readonly CampoDoDossie[] = [
  {
    chave: "protocolo",
    rotulo: "Protocolo",
    categoria: "minimo_fixo",
    sensivel: false,
    exigeJustificativa: false,
    obrigatorio: true,
    origem: { de: "ocorrencias", coluna: "protocolo" },
  },
  {
    chave: "tipo",
    rotulo: "Tipo da ocorrência",
    categoria: "minimo_fixo",
    sensivel: false,
    exigeJustificativa: false,
    obrigatorio: true,
    origem: { de: "ocorrencias", coluna: "tipo" },
  },
  {
    chave: "endereco",
    rotulo: "Endereço do local",
    categoria: "minimo_fixo",
    sensivel: false,
    exigeJustificativa: false,
    obrigatorio: true,
    origem: { de: "ocorrencias", coluna: "endereco" },
  },
  {
    chave: "solicitante_nome",
    rotulo: "Nome do solicitante",
    categoria: "dado_sensivel_da_ocorrencia",
    sensivel: true,
    exigeJustificativa: true,
    obrigatorio: false,
    origem: { de: "ocorrencias", coluna: "solicitante_nome" },
  },
  {
    chave: "solicitante_contato",
    rotulo: "Contato do solicitante",
    categoria: "dado_sensivel_da_ocorrencia",
    sensivel: true,
    exigeJustificativa: true,
    obrigatorio: false,
    origem: { de: "ocorrencias", coluna: "solicitante_contato" },
  },
  {
    chave: "vulnerabilidade_descricao",
    rotulo: "Vulnerabilidade registrada",
    categoria: "dado_sensivel_da_ocorrencia",
    sensivel: true,
    exigeJustificativa: true,
    obrigatorio: false,
    origem: { de: "ocorrencias", coluna: "vulnerabilidade_descricao" },
  },
  {
    chave: "descricao",
    rotulo: "Descrição do relato",
    categoria: "dado_sensivel_da_ocorrencia",
    sensivel: true,
    exigeJustificativa: true,
    obrigatorio: false,
    origem: { de: "ocorrencias", coluna: "descricao" },
  },
  {
    chave: "pedido",
    rotulo: "O que a Defesa Civil pede ao órgão",
    categoria: "texto_livre_dirigido_ao_orgao",
    sensivel: true,
    exigeJustificativa: false,
    obrigatorio: true,
    origem: { de: "escolha_da_defesa_civil" },
  },
  {
    chave: "observacoes_da_coordenacao",
    rotulo: "Observações da coordenação",
    categoria: "texto_livre_dirigido_ao_orgao",
    sensivel: true,
    exigeJustificativa: false,
    obrigatorio: false,
    origem: { de: "escolha_da_defesa_civil" },
  },
];

export const CAMPOS_DO_DOSSIE: readonly CampoDoDossie[] = Object.freeze(
  CATALOGO_BRUTO.map((c) => Object.freeze({ ...c, origem: Object.freeze({ ...c.origem }) })),
);

/** As chaves do mínimo fixo, na ordem do catálogo. */
export const CHAVES_DO_MINIMO_FIXO: readonly string[] = Object.freeze(
  CAMPOS_DO_DOSSIE.filter((c) => c.categoria === "minimo_fixo").map((c) => c.chave),
);

/**
 * As colunas de texto livre de `providencias` e de `oficios` que NUNCA chegam ao
 * órgão direto da coluna (ADR 0010, decisão 5, item 2). O que a Defesa Civil
 * quer dizer ao órgão vai pelo `pedido` e pelas `observacoes_da_coordenacao` do
 * dossiê, ou pelos eventos visíveis. Nenhuma delas é origem de campo do dossiê.
 */
export const COLUNAS_DE_TEXTO_LIVRE_FORA_DO_DOSSIE: readonly string[] = Object.freeze([
  "providencias.descricao",
  "providencias.responsavel",
  "providencias.orgao_destino",
  "providencias.resposta",
  "providencias.respondida_por",
  "oficios.observacoes",
]);

/**
 * A linha da ocorrência como a rota da Defesa Civil a leu do banco. Aceita
 * propriedades a mais (a linha tem dezenas de colunas e a de documento de
 * identificação de amanhã também): só as do catálogo são lidas, o resto é
 * ignorado e jamais copiado.
 */
export type OcorrenciaParaDossie = {
  readonly protocolo: string;
  readonly tipo: TipoDeEntrada;
  readonly endereco: string;
  readonly solicitante_nome?: string | null;
  readonly solicitante_contato?: string | null;
  readonly vulnerabilidade_presente?: boolean;
  readonly vulnerabilidade_descricao?: string | null;
  readonly descricao?: string | null;
} & { readonly [coluna: string]: unknown };

/** O que a Defesa Civil escolhe na tela de composição. */
export type EscolhaDoDossie = {
  /** O texto do que se pede ao órgão. Obrigatório. */
  readonly pedido: string;
  /** Opcional. Texto livre dirigido ao órgão. */
  readonly observacoes_da_coordenacao?: string | null;
  /** As chaves OPCIONAIS marcadas (o mínimo fixo e o pedido entram sem marcar). */
  readonly incluir?: readonly string[];
  /** Justificativa por chave de campo sensível marcado. */
  readonly justificativas?: Readonly<Record<string, string>>;
};

export type MotivoDeRecusaDoDossie =
  | "fora_da_lista"
  | "sensivel_sem_justificativa"
  | "justificativa_curta"
  | "justificativa_de_campo_nao_incluido"
  | "campo_vazio_na_ocorrencia"
  | "minimo_ausente"
  | "tipo_a_classificar"
  | "pedido_ausente"
  | "pedido_curto"
  | "texto_longo_demais";

export type ErroDoDossie = {
  readonly chave: string;
  readonly motivo: MotivoDeRecusaDoDossie;
  /** Em português, pronta para a tela; nunca carrega o valor do campo. */
  readonly mensagem: string;
};

export type OrigemDoDossie = "dc" | "migracao";

/** O snapshot. Imutável: nenhum nível pode ser alterado depois de montado. */
export type DossieMontado = {
  readonly origem: OrigemDoDossie;
  /** O mínimo fixo: vai para a coluna `campos`. */
  readonly campos: Readonly<Record<string, string>>;
  /** Vai para `campos_sensiveis`; nulo quando não há nenhum campo sensível. */
  readonly campos_sensiveis: Readonly<Record<string, string>> | null;
  /** Só as justificativas dos campos que exigem; por chave, nunca por valor. */
  readonly justificativas: Readonly<Record<string, string>>;
  /** As chaves de todos os campos incluídos, na ordem do catálogo. O evento `enviado` registra estas. */
  readonly chaves_incluidas: readonly string[];
  /** Verdadeiro na versão `migracao`: o pedido ainda não foi recomposto pela Defesa Civil. */
  readonly pedido_em_revisao: boolean;
};

export type ResultadoDaMontagemDoDossie =
  | { readonly ok: true; readonly dossie: DossieMontado }
  | { readonly ok: false; readonly erros: readonly ErroDoDossie[] };

const INDICE_DO_CATALOGO: ReadonlyMap<string, CampoDoDossie> = new Map(
  CAMPOS_DO_DOSSIE.map((c) => [c.chave, c]),
);

function temPropriedade(objeto: object, chave: string): boolean {
  return Object.prototype.hasOwnProperty.call(objeto, chave);
}

function textoPreenchido(v: unknown): v is string {
  return typeof v === "string" && v.trim().length > 0;
}

function congelar<T extends object>(objeto: T): T {
  for (const valor of Object.values(objeto)) {
    if (valor !== null && typeof valor === "object" && !Object.isFrozen(valor)) {
      congelar(valor as object);
    }
  }
  return Object.freeze(objeto);
}

function erro(chave: string, motivo: MotivoDeRecusaDoDossie, mensagem: string): ErroDoDossie {
  return { chave, motivo, mensagem };
}

/**
 * O mínimo fixo da ocorrência, ou os erros de por que não dá para montá-lo.
 * Compartilhado pela composição normal e pela versão `migracao`.
 */
function minimoFixoDa(
  ocorrencia: OcorrenciaParaDossie,
): { campos: Record<string, string> } | { erros: ErroDoDossie[] } {
  const erros: ErroDoDossie[] = [];
  const campos: Record<string, string> = {};

  if (!textoPreenchido(ocorrencia.protocolo)) {
    erros.push(erro("protocolo", "minimo_ausente", "A ocorrência não tem protocolo."));
  } else {
    campos["protocolo"] = ocorrencia.protocolo;
  }

  /*
    O tipo do dossiê é COBRADE, e "outro" não é. A taxonomia é fechada, e a
    ocorrência que ainda espera classificação não vai para uma secretaria com a
    palavra "Outro" no campo do tipo: o encaminhamento só nasce depois da
    triagem, e o dossiê não deve esconder o que o despacho já recusa.
  */
  const tipo = ocorrencia.tipo as string;
  if ((TIPOS_COBRADE as readonly string[]).includes(tipo)) {
    campos["tipo"] = tipo;
  } else {
    erros.push(
      erro(
        "tipo",
        "tipo_a_classificar",
        "A ocorrência ainda não tem um tipo da COBRADE. Classifique na triagem antes de encaminhar.",
      ),
    );
  }

  if (!textoPreenchido(ocorrencia.endereco)) {
    erros.push(erro("endereco", "minimo_ausente", "A ocorrência não tem endereço."));
  } else {
    campos["endereco"] = ocorrencia.endereco;
  }

  return erros.length > 0 ? { erros } : { campos };
}

/**
 * Compõe o dossiê da versão que a Defesa Civil vai enviar.
 *
 * Devolve um objeto NOVO e congelado; a ocorrência e a escolha ficam como
 * chegaram. Reprova (sem lançar) em vez de ignorar em silêncio: pedir um campo
 * que não existe no catálogo é erro de quem chamou, e a rota o responde como
 * `dados_invalidos` (422). Os erros nunca trazem o valor de um campo.
 */
export function montarDossie(
  ocorrencia: OcorrenciaParaDossie,
  escolha: EscolhaDoDossie,
): ResultadoDaMontagemDoDossie {
  const erros: ErroDoDossie[] = [];

  const minimo = minimoFixoDa(ocorrencia);
  if ("erros" in minimo) erros.push(...minimo.erros);

  /* Quais chaves a Defesa Civil marcou. Tudo fora do catálogo reprova. */
  const marcadas = new Set<string>();
  for (const chave of escolha.incluir ?? []) {
    if (typeof chave === "string" && INDICE_DO_CATALOGO.has(chave)) {
      marcadas.add(chave);
    } else {
      erros.push(
        erro(
          String(chave),
          "fora_da_lista",
          "Este campo não faz parte do dossiê e não pode ser enviado ao órgão.",
        ),
      );
    }
  }
  const justificativasRecebidas = escolha.justificativas ?? {};
  for (const chave of Object.keys(justificativasRecebidas)) {
    if (!INDICE_DO_CATALOGO.has(chave)) {
      erros.push(
        erro(
          chave,
          "fora_da_lista",
          "Este campo não faz parte do dossiê e não pode ser enviado ao órgão.",
        ),
      );
    }
  }

  const sensiveis: Record<string, string> = {};
  const justificativas: Record<string, string> = {};
  const incluidas = new Set<string>(CHAVES_DO_MINIMO_FIXO);

  for (const campo of CAMPOS_DO_DOSSIE) {
    if (campo.categoria === "minimo_fixo") continue;

    /*
      O que a Defesa Civil escreve (pedido, observações) não precisa ser marcado:
      escrever é o ato de incluir. Os campos da ocorrência só saem se marcados.
    */
    const marcado =
      campo.obrigatorio ||
      marcadas.has(campo.chave) ||
      (campo.origem.de === "escolha_da_defesa_civil" &&
        textoPreenchido(escolha[campo.chave as keyof EscolhaDoDossie]));
    const justificativaCrua = temPropriedade(justificativasRecebidas, campo.chave)
      ? justificativasRecebidas[campo.chave]
      : undefined;
    const justificativa = typeof justificativaCrua === "string" ? justificativaCrua.trim() : "";

    if (!marcado) {
      if (justificativaCrua !== undefined) {
        erros.push(
          erro(
            campo.chave,
            "justificativa_de_campo_nao_incluido",
            "Há uma justificativa para um campo que não foi marcado para o envio.",
          ),
        );
      }
      continue;
    }

    /* A justificativa, quando exigida ou quando dada, tem de ter o piso. */
    if (campo.exigeJustificativa || justificativaCrua !== undefined) {
      if (justificativa.length === 0 && campo.exigeJustificativa) {
        erros.push(
          erro(
            campo.chave,
            "sensivel_sem_justificativa",
            `Escreva por que "${campo.rotulo}" precisa ir ao órgão.`,
          ),
        );
        continue;
      }
      if (justificativa.length < JUSTIFICATIVA_MINIMA_DO_DOSSIE) {
        erros.push(
          erro(
            campo.chave,
            "justificativa_curta",
            `A justificativa de "${campo.rotulo}" precisa de pelo menos ` +
              `${JUSTIFICATIVA_MINIMA_DO_DOSSIE} caracteres.`,
          ),
        );
        continue;
      }
    }

    /* O valor, lido SÓ da origem declarada no catálogo. */
    let valor: string | undefined;
    if (campo.chave === "pedido") {
      valor = typeof escolha.pedido === "string" ? escolha.pedido.trim() : "";
      if (valor.length === 0) {
        erros.push(erro("pedido", "pedido_ausente", "Escreva o que a Defesa Civil pede ao órgão."));
        continue;
      }
      if (valor.length < PEDIDO_MINIMO_DO_DOSSIE) {
        erros.push(
          erro(
            "pedido",
            "pedido_curto",
            `O pedido precisa de pelo menos ${PEDIDO_MINIMO_DO_DOSSIE} caracteres.`,
          ),
        );
        continue;
      }
    } else if (campo.chave === "observacoes_da_coordenacao") {
      const bruto = escolha.observacoes_da_coordenacao;
      valor = typeof bruto === "string" ? bruto.trim() : "";
      if (valor.length === 0) continue; // opcional: vazio é "não enviar"
    } else if (campo.origem.de === "ocorrencias") {
      const bruto = temPropriedade(ocorrencia, campo.origem.coluna)
        ? ocorrencia[campo.origem.coluna]
        : undefined;
      const semDado =
        !textoPreenchido(bruto) ||
        (campo.chave === "vulnerabilidade_descricao" &&
          ocorrencia.vulnerabilidade_presente !== true);
      if (semDado) {
        erros.push(
          erro(
            campo.chave,
            "campo_vazio_na_ocorrencia",
            `A ocorrência não tem "${campo.rotulo}" registrado para enviar.`,
          ),
        );
        continue;
      }
      valor = (bruto as string).trim();
    }

    if (valor === undefined) continue;
    if (valor.length > TEXTO_MAXIMO_DO_DOSSIE) {
      erros.push(
        erro(
          campo.chave,
          "texto_longo_demais",
          `"${campo.rotulo}" passa de ${TEXTO_MAXIMO_DO_DOSSIE} caracteres.`,
        ),
      );
      continue;
    }

    sensiveis[campo.chave] = valor;
    incluidas.add(campo.chave);
    if (campo.exigeJustificativa || justificativa.length > 0) {
      justificativas[campo.chave] = justificativa;
    }
  }

  if (erros.length > 0 || "erros" in minimo) {
    return { ok: false, erros: Object.freeze(erros) };
  }

  const dossie: DossieMontado = congelar({
    origem: "dc",
    campos: { ...minimo.campos },
    campos_sensiveis: Object.keys(sensiveis).length > 0 ? sensiveis : null,
    justificativas,
    chaves_incluidas: CAMPOS_DO_DOSSIE.filter((c) => incluidas.has(c.chave)).map((c) => c.chave),
    pedido_em_revisao: false,
  });
  return { ok: true, dossie };
}

/**
 * A versão 1 de origem `migracao` do encaminhamento legado.
 *
 * Copia SÓ o mínimo fixo. Não copia texto livre de coluna nenhuma (ADR 0010,
 * decisão 5, item 3): o texto antigo foi escrito antes da regra de divulgação e
 * pode carregar contato, relato ou informação interna, e copiá-lo seria
 * divulgá-lo pelo caminho novo. Não há campo sensível nem justificativa. O
 * encaminhamento aberto fica "pedido em revisão" até a Defesa Civil recompor o
 * dossiê (versão 2, pelo mesmo `montarDossie`).
 */
export function montarDossieDeMigracao(
  ocorrencia: OcorrenciaParaDossie,
): ResultadoDaMontagemDoDossie {
  const minimo = minimoFixoDa(ocorrencia);
  if ("erros" in minimo) return { ok: false, erros: Object.freeze(minimo.erros) };
  return {
    ok: true,
    dossie: congelar({
      origem: "migracao",
      campos: { ...minimo.campos },
      campos_sensiveis: null,
      justificativas: {},
      chaves_incluidas: [...CHAVES_DO_MINIMO_FIXO],
      pedido_em_revisao: true,
    }),
  };
}
