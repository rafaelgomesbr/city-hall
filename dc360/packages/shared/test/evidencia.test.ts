import { describe, expect, it } from "vitest";
import {
  TAMANHO_MAXIMO_BYTES,
  TIPOS_ACEITOS,
  pedidoDeEvidenciaSchema,
  rotuloDoCampo,
  tipoAceito,
} from "../src/index.js";

/**
 * O PEDIDO DE AUTORIZAÇÃO DE ENVIO, agora como contrato compartilhado.
 *
 * O que estes casos travam foi visto em produção em 15/09/2026, com o aparelho
 * na mão do dono: a vistoria 000009/2026 concluiu no iPhone, a fila pediu a
 * autorização da fotografia três vezes e o servidor respondeu 422 três vezes.
 * O esquema da rota (`apps/api/src/rotas/evidencias.ts`) recusava, e o aparelho
 * não tinha como saber antes de enfileirar, porque a regra existia só lá.
 *
 * Dois campos produzidos pelo próprio aplicativo caíam fora do contrato:
 *
 * 1. `tamanhoBytes: 0`, porque `guardarFotoNoAparelho` devolvia `size ?? 0` e o
 *    `size` da API nova do `expo-file-system` é documentado como "0 se o
 *    arquivo não existe ou não pôde ser lido". Zero passava adiante como se
 *    fosse um tamanho.
 * 2. `idempotencyKey: "<uuid>-assinatura"` na assinatura, que não é UUID.
 *
 * Com o esquema no pacote compartilhado, o aparelho confere ANTES de enfileirar
 * exatamente o que o servidor vai conferir, e a mensagem que o agente lê é a
 * mesma nas duas pontas, em português.
 */

const PEDIDO_BOM = {
  ocorrenciaId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  idempotencyKey: "11111111-1111-4111-8111-111111111111",
  nomeArquivo: "vistoria-000009-2026-1.jpg",
  tipoConteudo: "image/jpeg",
  tamanhoBytes: 812_345,
  capturadaEm: new Date().toISOString(),
  coordenada: { lat: -27.595378, lng: -48.54805 },
  ordem: 0,
};

function campos(entrada: Record<string, unknown>) {
  const r = pedidoDeEvidenciaSchema.safeParse(entrada);
  if (r.success) return [];
  return r.error.issues.map((i) => ({ campo: i.path.join("."), mensagem: i.message }));
}

describe("o pedido de autorização de evidência", () => {
  it("aceita a fotografia como o aparelho a monta hoje", () => {
    expect(pedidoDeEvidenciaSchema.safeParse(PEDIDO_BOM).success).toBe(true);
  });

  it("reprova a chave de idempotência que não é UUID (a assinatura de hoje)", () => {
    const recusa = campos({
      ...PEDIDO_BOM,
      idempotencyKey: "11111111-1111-4111-8111-111111111111-assinatura",
    });
    expect(recusa.map((c) => c.campo)).toEqual(["idempotencyKey"]);
    // Em português: a frase chega ao agente na rua, e ele precisa entender.
    expect(recusa[0]!.mensagem).toMatch(/UUID/);
    expect(recusa[0]!.mensagem).not.toMatch(/Invalid/i);
  });

  it("reprova tamanho zero, que é arquivo perdido e não um tamanho", () => {
    const recusa = campos({ ...PEDIDO_BOM, tamanhoBytes: 0 });
    expect(recusa.map((c) => c.campo)).toEqual(["tamanhoBytes"]);
    expect(recusa[0]!.mensagem).toMatch(/vazio|não conseguiu medir/);
    expect(recusa[0]!.mensagem).not.toMatch(/greater than/i);
  });

  it("reprova o arquivo acima do teto, com o teto na frase", () => {
    const recusa = campos({ ...PEDIDO_BOM, tamanhoBytes: TAMANHO_MAXIMO_BYTES + 1 });
    expect(recusa.map((c) => c.campo)).toEqual(["tamanhoBytes"]);
    expect(recusa[0]!.mensagem).toMatch(/15 MB/);
  });

  it("reprova tipo fora da lista fechada, dizendo quais entram", () => {
    const recusa = campos({ ...PEDIDO_BOM, tipoConteudo: "application/pdf" });
    expect(recusa.map((c) => c.campo)).toEqual(["tipoConteudo"]);
    expect(recusa[0]!.mensagem).toMatch(/JPEG/);
  });

  it("reprova data de captura implausível, como a rota já reprovava", () => {
    expect(campos({ ...PEDIDO_BOM, capturadaEm: "2019-01-05T14:22:00.000Z" }).map((c) => c.campo))
      .toEqual(["capturadaEm"]);
    const daquiATresDias = new Date(Date.now() + 3 * 24 * 3_600_000).toISOString();
    expect(campos({ ...PEDIDO_BOM, capturadaEm: daquiATresDias }).map((c) => c.campo))
      .toEqual(["capturadaEm"]);
  });

  it("a chave é opcional e a ordem tem valor padrão, como a rota já aceitava", () => {
    const { idempotencyKey: _semChave, ordem: _semOrdem, ...resto } = PEDIDO_BOM;
    const r = pedidoDeEvidenciaSchema.safeParse(resto);
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.ordem).toBe(0);
  });

  it("a lista de tipos e o teto moram no pacote compartilhado", () => {
    expect(TIPOS_ACEITOS).toContain("image/jpeg");
    expect(TIPOS_ACEITOS).toContain("image/png");
    expect(tipoAceito("image/heic")).toBe(true);
    expect(tipoAceito("text/plain")).toBe(false);
    expect(TAMANHO_MAXIMO_BYTES).toBe(15 * 1024 * 1024);
  });
});

describe("os rótulos dos campos de arquivo", () => {
  it("o campo de uma fotografia numerada leva o número, mesmo quando o nome é conhecido", () => {
    // `fotos.0.tamanhoBytes` casava em `tamanhoBytes` sem o número: três fotos
    // vazias viravam três linhas iguais na tela.
    expect(rotuloDoCampo("fotos.0.tamanhoBytes")).toBe("Tamanho do arquivo (item 1)");
  });

  it("a assinatura tem rótulo próprio, porque não é 'mais uma foto'", () => {
    expect(rotuloDoCampo("assinatura.tamanhoBytes")).toBe("Arquivo da assinatura");
    expect(rotuloDoCampo("assinatura.idempotencyKey")).toBe("Chave da assinatura");
  });
});
