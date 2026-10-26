import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  CATEGORIAS_DE_ERRO,
  CODIGOS_DA_ENTRADA,
  CODIGOS_DE_ERRO,
  CODIGOS_DE_ERRO_DE_ACESSO,
  CODIGOS_RESERVADOS,
  DESCRICAO_DAS_CATEGORIAS,
  categoriaDoCodigo,
  categoriaDoErro,
  categoriaPadraoDoStatus,
  ehCodigoDeErro,
  ehCodigoReservado,
  erroDaApiSchema,
  tabelaDoCatalogoEmMarkdown,
} from "../src/index.js";

/**
 * O CATÁLOGO COMPLETO DE ERROS (V2-F02-E03, parte do pacote compartilhado).
 *
 * O que este arquivo prende, nesta ordem:
 *
 * 1. a forma de cada entrada (status inteiro de 4xx ou 5xx, categoria das cinco,
 *    título sem travessão);
 * 2. o catálogo de acesso e o da entrada continuam dentro deste, com o mesmo
 *    status (os dois são fonte de verdade de outra coisa: o que o cliente FAZ);
 * 3. a lista reservada não invade a emitida;
 * 4. o catálogo cobre os códigos literais de `apps/api/src` nos dois sentidos.
 *    É leitura de texto, uma rede mais larga e mais simples que a varredura por
 *    árvore sintática da API (`apps/api/test/catalogo-de-erros.test.ts`): se as
 *    duas discordarem, vale a mais rigorosa;
 * 5. o esquema do corpo de erro e as funções que o cliente usa.
 */

const AQUI = dirname(fileURLToPath(import.meta.url));
const RAIZ_PRODUTO = join(AQUI, "..", "..", "..");
const TRAVESSAO = "—";

function arquivosDeFonte(dir: string): string[] {
  const achados: string[] = [];
  for (const nome of readdirSync(dir)) {
    const caminho = join(dir, nome);
    if (statSync(caminho).isDirectory()) achados.push(...arquivosDeFonte(caminho));
    else if (nome.endsWith(".ts") && !nome.endsWith(".d.ts")) achados.push(caminho);
  }
  return achados;
}

describe("a forma de cada entrada do catálogo", () => {
  const entradas = Object.entries(CODIGOS_DE_ERRO);

  it("o código é minúsculo, com sublinhado, e o catálogo tem o tamanho esperado", () => {
    for (const [codigo] of entradas) expect(codigo, codigo).toMatch(/^[a-z][a-z_0-9]{1,63}$/);
    /* 95 códigos (92 do levantamento de `apps/api/src` de 2026-10-25, mais
       `chave_ja_usada_em_outro_registro`, que a V2-F02-E07 passou a emitir, e
       `url_invalida` e `parametro_longo_demais`, da V2-F02-E03 parte 2C).
       Subir é normal; cair significa que alguém tirou código que clientes
       instalados leem. */
    expect(entradas.length).toBeGreaterThanOrEqual(95);
  });

  it("status é inteiro de 400 a 599, categoria é uma das cinco e o título não tem travessão", () => {
    for (const [codigo, e] of [...entradas, ...Object.entries(CODIGOS_RESERVADOS)]) {
      expect(
        Number.isInteger(e.status) && e.status >= 400 && e.status <= 599,
        `${codigo} status`,
      ).toBe(true);
      expect(CATEGORIAS_DE_ERRO as readonly string[], `${codigo} categoria`).toContain(e.categoria);
      expect(e.titulo.trim().length, `${codigo} título`).toBeGreaterThan(5);
      expect(e.titulo.includes(TRAVESSAO), `${codigo} travessão`).toBe(false);
      expect(e.titulo.endsWith("."), `${codigo} termina com ponto`).toBe(false);
      for (const outro of ("tambemSai" in e ? e.tambemSai : []) as readonly number[]) {
        expect(Number.isInteger(outro) && outro >= 400 && outro <= 599, `${codigo} tambemSai`).toBe(
          true,
        );
        expect(outro, `${codigo} repete o status principal`).not.toBe(e.status);
      }
    }
  });

  it("toda categoria tem descrição e as cinco são exatamente as combinadas", () => {
    expect([...CATEGORIAS_DE_ERRO]).toEqual([
      "renovar",
      "reentrar",
      "corrigir",
      "aguardar",
      "permanente",
    ]);
    for (const c of CATEGORIAS_DE_ERRO)
      expect(DESCRICAO_DAS_CATEGORIAS[c].length, c).toBeGreaterThan(20);
  });

  it("todas as categorias são usadas por algum código (categoria sem uso é promessa vazia)", () => {
    const usadas = new Set(entradas.map(([, e]) => e.categoria));
    for (const c of CATEGORIAS_DE_ERRO) expect(usadas.has(c), c).toBe(true);
  });

  it("os dois 404 mistos continuam com os dois nomes, ambos permanentes", () => {
    for (const nome of ["nao_encontrado", "nao_encontrada"] as const) {
      expect(CODIGOS_DE_ERRO[nome]).toMatchObject({ status: 404, categoria: "permanente" });
    }
  });

  it("nenhum código de 404 é recuperável por repetição (recurso alheio nunca vira 403 nem 'tente de novo')", () => {
    for (const nome of ["nao_encontrado", "nao_encontrada", "conta_nao_encontrada"] as const) {
      expect(CODIGOS_DE_ERRO[nome].categoria, nome).toBe("permanente");
    }
  });

  it("status 5xx e 429 esperam, como o transporte do aplicativo sempre tratou (temporário)", () => {
    for (const [codigo, e] of entradas) {
      if (e.status === 429 || e.status >= 500) expect(e.categoria, codigo).toBe("aguardar");
    }
  });
});

describe("o catálogo de acesso e o da entrada estão dentro deste, sem divergir", () => {
  it("todo código de acesso está aqui, com o mesmo status", () => {
    for (const [codigo, e] of Object.entries(CODIGOS_DE_ERRO_DE_ACESSO)) {
      expect(ehCodigoDeErro(codigo), codigo).toBe(true);
      expect(CODIGOS_DE_ERRO[codigo as keyof typeof CODIGOS_DE_ERRO].status, codigo).toBe(e.status);
    }
  });

  it("acesso_suspenso também sai como 503 (a fila do aparelho), e só ele tem esse desvio", () => {
    expect(CODIGOS_DE_ERRO.acesso_suspenso.tambemSai).toEqual([503]);
  });

  it("todo código da entrada está aqui, com o mesmo status", () => {
    for (const [codigo, e] of Object.entries(CODIGOS_DA_ENTRADA)) {
      expect(ehCodigoDeErro(codigo), codigo).toBe(true);
      expect(CODIGOS_DE_ERRO[codigo as keyof typeof CODIGOS_DE_ERRO].status, codigo).toBe(e.status);
    }
  });

  it("as categorias de acesso dizem o que o cliente já faz com cada uma", () => {
    expect(CODIGOS_DE_ERRO.nao_autenticado.categoria).toBe("renovar");
    expect(CODIGOS_DE_ERRO.sessao_encerrada.categoria).toBe("reentrar");
    expect(CODIGOS_DE_ERRO.troca_de_senha_obrigatoria.categoria).toBe("reentrar");
    expect(CODIGOS_DE_ERRO.conta_desativada.categoria).toBe("permanente");
    expect(CODIGOS_DE_ERRO.sem_permissao.categoria).toBe("permanente");
    expect(CODIGOS_DE_ERRO.acesso_suspenso.categoria).toBe("aguardar");
    expect(CODIGOS_DE_ERRO.bloqueado.categoria).toBe("aguardar");
  });
});

describe("a lista reservada", () => {
  it("a chave de idempotência já usada saiu da reserva: a V2-F02-E07 a emite (409, permanente)", () => {
    expect(ehCodigoReservado("chave_ja_usada_em_outro_registro")).toBe(false);
    expect(CODIGOS_DE_ERRO.chave_ja_usada_em_outro_registro).toMatchObject({
      status: 409,
      categoria: "permanente",
    });
    expect(categoriaDoCodigo("chave_ja_usada_em_outro_registro")).toBe("permanente");
  });

  it("a versão do aplicativo abaixo do mínimo saiu da reserva: a V2-F02-E06 a emite (426, permanente)", () => {
    expect(ehCodigoReservado("versao_do_aplicativo_antiga")).toBe(false);
    expect(CODIGOS_DE_ERRO.versao_do_aplicativo_antiga).toMatchObject({
      status: 426,
      categoria: "permanente",
    });
  });

  it("traz os códigos que as etapas seguintes emitirão, e nenhum está na lista emitida", () => {
    expect(CODIGOS_RESERVADOS.versao_do_aplicativo_ausente).toMatchObject({
      status: 426,
      categoria: "permanente",
    });
    for (const codigo of Object.keys(CODIGOS_RESERVADOS)) {
      expect(ehCodigoDeErro(codigo), codigo).toBe(false);
      expect(ehCodigoReservado(codigo), codigo).toBe(true);
    }
  });

  it("a F03 reserva os códigos de identidade, sem repetir o que o catálogo já emite", () => {
    for (const codigo of [
      "convite_invalido",
      "escolha_de_municipio_obrigatoria",
      "termo_nao_aceito",
    ]) {
      expect(ehCodigoReservado(codigo), codigo).toBe(true);
      expect(ehCodigoDeErro(codigo), codigo).toBe(false);
    }
    /* Já emitido desde a V2-F03-E04 (PATCH /usuarios/:id): saiu da reserva. */
    expect(ehCodigoReservado("papel_nao_se_converte")).toBe(false);
    expect(CODIGOS_DE_ERRO.papel_nao_se_converte).toMatchObject({
      status: 409,
      categoria: "permanente",
    });
    /* A ADR 0009 corrigida eliminou o 409: o código não é reservado. */
    expect(ehCodigoReservado("pessoa_em_varios_municipios")).toBe(false);
    /* Já emitidos: reservar de novo duplicaria. */
    expect(ehCodigoReservado("segundo_fator_desligado")).toBe(false);
    expect(ehCodigoReservado("usuario_repetido")).toBe(false);
  });

  it("a F04 reserva os códigos do encaminhamento ao órgão no fim da lista, sem repetir o que já é emitido", () => {
    const esperados = {
      orgao_sem_gestor: 409,
      encaminhamento_encerrado: 409,
      devolucao_so_antes_do_aceite: 409,
      cadeia_esgotada: 409,
    } as const;
    for (const [codigo, status] of Object.entries(esperados)) {
      expect(ehCodigoReservado(codigo), codigo).toBe(true);
      expect(ehCodigoDeErro(codigo), codigo).toBe(false);
      expect(CODIGOS_RESERVADOS[codigo as keyof typeof esperados].status, codigo).toBe(status);
      expect(categoriaDoCodigo(codigo), codigo).toBe("permanente");
    }
    /* O bloco da F04 vem DEPOIS de `versao_do_aplicativo_ausente`; o da F03 fica no início. */
    const ordem = Object.keys(CODIGOS_RESERVADOS);
    const fim = ordem.indexOf("versao_do_aplicativo_ausente");
    for (const codigo of Object.keys(esperados)) {
      expect(ordem.indexOf(codigo), codigo).toBeGreaterThan(fim);
    }
    expect(ordem.indexOf("papel_nao_se_converte")).toBeLessThan(fim);
    /* Já emitidos: reservar de novo duplicaria. */
    expect(ehCodigoReservado("transicao_invalida")).toBe(false);
    expect(ehCodigoReservado("ja_respondida")).toBe(false);
  });

  it("reservado tem categoria (o cliente já sabe o que fazer antes de o servidor emitir)", () => {
    expect(categoriaDoCodigo("versao_do_aplicativo_ausente")).toBe("permanente");
  });
});

describe("o catálogo cobre os códigos literais da API, nos dois sentidos", () => {
  const fontes = arquivosDeFonte(join(RAIZ_PRODUTO, "apps", "api", "src"));
  const texto = fontes.map((f) => readFileSync(f, "utf8")).join("\n");

  /* As formas de emitir que têm o código como primeiro argumento literal, e a
     forma `erro: "x"` dos corpos escritos à mão. A varredura da API lê as
     outras (constante, subclasse) pela árvore sintática. */
  const emitidos = new Set<string>();
  for (const m of texto.matchAll(
    /(?:RegraDeNegocio|FalhaAutenticacao|recusarFoto)\(\s*"([a-z][a-z_0-9]*)"/g,
  )) {
    emitidos.add(m[1]!);
  }
  for (const m of texto.matchAll(/\berro:\s*"([a-z][a-z_0-9]*)"/g)) emitidos.add(m[1]!);

  it("achou um número plausível de códigos (a leitura não ficou cega)", () => {
    expect(emitidos.size).toBeGreaterThanOrEqual(75);
  });

  it("todo código literal emitido pela API está no catálogo ou na lista reservada", () => {
    const fora = [...emitidos].filter((c) => !ehCodigoDeErro(c) && !ehCodigoReservado(c)).sort();
    expect(fora).toEqual([]);
  });

  it("todo código do catálogo aparece como texto em apps/api/src (não há código morto)", () => {
    const mortos = Object.keys(CODIGOS_DE_ERRO)
      .filter((c) => !texto.includes(`"${c}"`))
      .sort();
    expect(mortos).toEqual([]);
  });
});

describe("erroDaApiSchema, o corpo de toda resposta de erro", () => {
  it("aceita o corpo mínimo: erro e mensagem", () => {
    expect(
      erroDaApiSchema.safeParse({ erro: "nao_encontrada", mensagem: "Ocorrência não encontrada." })
        .success,
    ).toBe(true);
  });

  it("aceita campos, requisicao e categoria, e devolve tudo", () => {
    const corpo = {
      erro: "dados_invalidos",
      mensagem: "Alguns campos precisam ser corrigidos.",
      campos: [{ campo: "vistoria.fotos.2", mensagem: "Campo obrigatório" }],
      requisicao: "req-123",
      categoria: "corrigir",
    };
    const r = erroDaApiSchema.safeParse(corpo);
    expect(r.success).toBe(true);
    if (r.success) expect(r.data).toEqual(corpo);
  });

  it("campo novo é aditivo: o objeto é aberto e o que vier a mais é mantido (ex.: versaoMinima da 426)", () => {
    const r = erroDaApiSchema.safeParse({
      erro: "versao_do_aplicativo_antiga",
      mensagem: "Atualize o aplicativo.",
      versaoMinima: "1.4.0",
    });
    expect(r.success).toBe(true);
    if (r.success) expect((r.data as Record<string, unknown>)["versaoMinima"]).toBe("1.4.0");
  });

  it("um código que o cliente não conhece NÃO reprova o corpo (servidor mais novo que o aplicativo)", () => {
    expect(
      erroDaApiSchema.safeParse({ erro: "codigo_do_futuro", mensagem: "Algo novo." }).success,
    ).toBe(true);
  });

  it("reprova sem erro, sem mensagem, com categoria fora das cinco e com campos malformados", () => {
    expect(erroDaApiSchema.safeParse({ mensagem: "x" }).success).toBe(false);
    expect(erroDaApiSchema.safeParse({ erro: "", mensagem: "x" }).success).toBe(false);
    expect(erroDaApiSchema.safeParse({ erro: "x" }).success).toBe(false);
    expect(
      erroDaApiSchema.safeParse({ erro: "x", mensagem: "m", categoria: "tentar_de_novo" }).success,
    ).toBe(false);
    expect(
      erroDaApiSchema.safeParse({ erro: "x", mensagem: "m", campos: [{ campo: "a" }] }).success,
    ).toBe(false);
    expect(erroDaApiSchema.safeParse({ erro: "x", mensagem: "m", campos: "a" }).success).toBe(
      false,
    );
    expect(erroDaApiSchema.safeParse(null).success).toBe(false);
    expect(erroDaApiSchema.safeParse("erro").success).toBe(false);
  });
});

describe("o que o cliente lê do catálogo", () => {
  it("categoriaDoCodigo: do catálogo, do reservado, e nulo para o que não é", () => {
    expect(categoriaDoCodigo("nao_autenticado")).toBe("renovar");
    expect(categoriaDoCodigo("dados_invalidos")).toBe("corrigir");
    expect(categoriaDoCodigo("excesso_de_requisicoes")).toBe("aguardar");
    expect(categoriaDoCodigo("sessao")).toBeNull();
    expect(categoriaDoCodigo(undefined)).toBeNull();
    expect(categoriaDoCodigo(42)).toBeNull();
    /* Nomes herdados de Object.prototype não são códigos. */
    expect(categoriaDoCodigo("constructor")).toBeNull();
    expect(categoriaDoCodigo("__proto__")).toBeNull();
    expect(categoriaDoCodigo("toString")).toBeNull();
  });

  it("categoriaDoErro: a categoria do corpo vence, depois o catálogo, depois o status", () => {
    expect(categoriaDoErro({ erro: "dados_invalidos", categoria: "aguardar" })).toBe("aguardar");
    expect(categoriaDoErro({ erro: "dados_invalidos", categoria: "inventada" })).toBe("corrigir");
    expect(categoriaDoErro({ erro: "nao_autenticado" })).toBe("renovar");
    expect(categoriaDoErro({ erro: "codigo_do_futuro" }, 503)).toBe("aguardar");
    expect(categoriaDoErro({ erro: "codigo_do_futuro" }, 409)).toBe("permanente");
    expect(categoriaDoErro({ erro: "codigo_do_futuro" })).toBeNull();
    expect(categoriaDoErro(null, 500)).toBe("aguardar");
    expect(categoriaDoErro("texto", 404)).toBe("permanente");
  });

  it("categoriaPadraoDoStatus: 401 sem código conhecido não é adivinhado", () => {
    expect(categoriaPadraoDoStatus(401)).toBeNull();
    expect(categoriaPadraoDoStatus(429)).toBe("aguardar");
    expect(categoriaPadraoDoStatus(502)).toBe("aguardar");
    expect(categoriaPadraoDoStatus(422)).toBe("permanente");
    expect(categoriaPadraoDoStatus(200)).toBeNull();
  });
});

describe("a tabela gerada", () => {
  const tabela = tabelaDoCatalogoEmMarkdown();

  it("tem uma linha por código, emitido ou reservado, ordenada por código", () => {
    const linhas = tabela.split("\n").slice(2);
    expect(linhas.length).toBe(
      Object.keys(CODIGOS_DE_ERRO).length + Object.keys(CODIGOS_RESERVADOS).length,
    );
    for (const c of [...Object.keys(CODIGOS_DE_ERRO), ...Object.keys(CODIGOS_RESERVADOS)]) {
      expect(tabela, c).toContain(`\`${c}\``);
    }
    const emitidos = linhas
      .filter((l) => l.endsWith("| emitido |"))
      .map((l) => /^\| `([a-z_0-9]+)`/.exec(l)![1]!);
    expect(emitidos).toEqual([...emitidos].sort((a, b) => a.localeCompare(b)));
  });

  it("mostra os dois status de acesso_suspenso e não tem travessão", () => {
    expect(tabela).toMatch(/`acesso_suspenso` \| 403 ou 503 \| aguardar/);
    expect(tabela.includes(TRAVESSAO)).toBe(false);
  });
});
