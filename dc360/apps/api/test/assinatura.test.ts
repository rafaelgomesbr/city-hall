import { describe, expect, it } from "vitest";
import { assinarUrl, codificarRfc3986 } from "../src/armazenamento/assinatura.js";

/**
 * Vetor de teste oficial da AWS para URL pré-assinada.
 *
 * Publicado na documentação de Signature Version 4 ("Query String Request
 * Authentication Alternative"). Bater com ele é prova, não indício: uma
 * assinatura de 256 bits não coincide por acaso.
 */
const VETOR = {
  accessKeyId: "AKIAIOSFODNN7EXAMPLE",
  secretAccessKey: "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY",
  host: "examplebucket.s3.amazonaws.com",
  caminho: "/test.txt",
  regiao: "us-east-1",
  data: new Date("2013-05-24T00:00:00.000Z"),
  expira: 86400,
  assinaturaEsperada: "aeeed9bbccd4d02ee5c0109b86d86835f995330da4c265957d157751f604d404",
};

describe("Assinatura SigV4", () => {
  it("reproduz o vetor de teste oficial da AWS", () => {
    const url = assinarUrl({
      metodo: "GET",
      host: VETOR.host,
      caminho: VETOR.caminho,
      regiao: VETOR.regiao,
      credenciais: { accessKeyId: VETOR.accessKeyId, secretAccessKey: VETOR.secretAccessKey },
      agora: VETOR.data,
      expiraEmSegundos: VETOR.expira,
    });

    const assinatura = new URL(url).searchParams.get("X-Amz-Signature");
    expect(assinatura).toBe(VETOR.assinaturaEsperada);
  });
});
