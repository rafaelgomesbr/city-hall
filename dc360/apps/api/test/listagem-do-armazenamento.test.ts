import { describe, expect, it } from "vitest";
import { lerListagem } from "../src/armazenamento/s3.js";

/**
 * A leitura da resposta do `ListObjectsV2`.
 *
 * ELE É O ÚNICO PEDAÇO DA VARREDURA QUE NÃO DÁ PARA EXERCITAR EM MEMÓRIA, e por
 * isso ele tem teste próprio: o armazenamento de teste devolve objetos de um
 * mapa, o provedor devolve XML. Um defeito aqui não apareceria como erro,
 * apareceria como lista MENOR, e lista menor de objetos existentes é a coisa
 * mais perigosa que este caminho pode produzir, porque ela some do relatório.
 *
 * O que estes casos cobrem é exatamente o que separa "funciona no exemplo da
 * documentação" de "funciona no balde de um município com três anos": a
 * paginação, o escape de XML numa chave com caractere especial, e a resposta
 * sem nenhum objeto.
 */

/** O formato publicado da resposta, com os campos que a varredura lê. */
function resposta(
  itens: Array<{ chave: string; tamanho: number; data: string }>,
  extras: { truncado?: boolean; token?: string } = {},
): string {
  return (
    '<?xml version="1.0" encoding="UTF-8"?>'
    + '<ListBucketResult xmlns="http://s3.amazonaws.com/doc/2006-03-01/">'
    + "<Name>evidencias</Name>"
    + `<IsTruncated>${extras.truncado ? "true" : "false"}</IsTruncated>`
    + (extras.token ? `<NextContinuationToken>${extras.token}</NextContinuationToken>` : "")
    + itens.map((i) => (
      "<Contents>"
      + `<Key>${i.chave}</Key>`
      + `<LastModified>${i.data}</LastModified>`
      + '<ETag>"abc"</ETag>'
      + `<Size>${i.tamanho}</Size>`
      + "<StorageClass>STANDARD</StorageClass>"
      + "</Contents>"
    )).join("")
    + "</ListBucketResult>"
  );
}

describe("A resposta do ListObjectsV2", () => {
  it("lê chave, tamanho e data de cada objeto", () => {
    const pagina = lerListagem(resposta([
      {
        chave: "tenant/11111111-1111-4111-8111-000000000001/ocorrencias/a/IMG_1.jpg",
        tamanho: 2_097_152,
        data: "2026-08-01T13:45:00.000Z",
      },
      {
        chave: "tenant/11111111-1111-4111-8111-000000000001/ocorrencias/a/IMG_2.jpg",
        tamanho: 1_048_576,
        data: "2026-08-01T13:46:00.000Z",
      },
    ]));

    expect(pagina.objetos).toHaveLength(2);
    expect(pagina.objetos[0]!.tamanhoBytes).toBe(2_097_152);
    expect(pagina.objetos[0]!.modificadoEm).toBe("2026-08-01T13:45:00.000Z");
    expect(pagina.continuacao).toBeNull();
  });

  it("continua a paginação só quando o provedor diz que truncou", () => {
    /*
      Ler o token sem olhar para `IsTruncated` faria a varredura pedir mais uma
      página depois da última, e o laço terminaria por acidente em vez de por
      decisão.
    */
    const truncada = lerListagem(
      resposta([{ chave: "tenant/a/x.jpg", tamanho: 1, data: "2026-08-01T00:00:00.000Z" }],
        { truncado: true, token: "AAA/BBB+CCC=" }),
    );
    expect(truncada.continuacao).toBe("AAA/BBB+CCC=");

    const inteira = lerListagem(
      resposta([{ chave: "tenant/a/x.jpg", tamanho: 1, data: "2026-08-01T00:00:00.000Z" }],
        { truncado: false, token: "AAA" }),
    );
    expect(inteira.continuacao).toBeNull();
  });

  it("desfaz o escape de XML na chave", () => {
    /*
      O nome de arquivo é higienizado por `chaveDeStorage`, mas a chave inteira
      passa por concatenação, e um `&` num prefixo faria o provedor devolver
      `&amp;`. Lida crua, a chave ficaria diferente da que está no banco, e o
      objeto viraria "órfão" por causa de cinco caracteres.
    */
    const pagina = lerListagem(resposta([
      { chave: "tenant/a/oc/foto&amp;1&lt;2&gt;.jpg", tamanho: 10, data: "2026-08-01T00:00:00.000Z" },
    ]));
    expect(pagina.objetos[0]!.chave).toBe("tenant/a/oc/foto&1<2>.jpg");
  });

  it("balde vazio devolve lista vazia, e isso é diferente de falha", () => {
    /*
      Aqui a lista vazia é a verdade: o provedor respondeu e não havia objeto.
      Quem transforma erro em lista vazia é `listar`, e ele não faz isso de
      propósito (devolve `falha`): ver `tipos.ts`.
    */
    const pagina = lerListagem(resposta([]));
    expect(pagina.objetos).toHaveLength(0);
    expect(pagina.continuacao).toBeNull();
  });

  it("objeto sem chave é ignorado em vez de virar entrada de chave vazia", () => {
    const xml =
      "<ListBucketResult><IsTruncated>false</IsTruncated>"
      + "<Contents><Size>10</Size></Contents>"
      + "<Contents><Key>tenant/a/oc/boa.jpg</Key><Size>10</Size></Contents>"
      + "</ListBucketResult>";

    const pagina = lerListagem(xml);
    expect(pagina.objetos).toHaveLength(1);
    expect(pagina.objetos[0]!.chave).toBe("tenant/a/oc/boa.jpg");
  });
});
