import { describe, expect, it } from "vitest";
import {
  CASAS_DE_COORDENADA,
  aberturaOcorrenciaSchema,
  coordenadaGravadaSchema,
  envelopeSincronizacaoSchema,
  evidenciaFotoSchema,
} from "../src/index.js";

/**
 * O CONTRATO das duas coisas que a coleta passou a carregar.
 *
 * Os casos daqui olham só o esquema, que é onde a regra precisa morar: se ela
 * existir apenas na rota, a próxima rota não a tem, e se existir apenas no
 * formulário ela não existe. O caminho completo (banco, trilha e laudo) está em
 * `apps/api/test/prova-perdida-e-ponto-da-vistoria.test.ts`.
 */

/** O que um GPS de celular devolve de verdade: o resto binário do `Number`. */
const CRUA = { lat: -22.410382999999987, lng: -45.456789123456789 };
const SEIS = { lat: -22.410383, lng: -45.456789 };

const COLETADA_EM = "2026-09-14T12:00:00.000Z";

function envelope(vistoria: Record<string, unknown>) {
  return {
    idempotencyKey: "11111111-1111-4111-8111-111111111111",
    ocorrenciaId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    coletadaEm: COLETADA_EM,
    vistoria: {
      checklist: [
        { chave: "risco_iminente", resposta: true },
        { chave: "evacuacao_necessaria", resposta: false },
        { chave: "interdicao_indicada", resposta: false },
        { chave: "acionar_outro_orgao", resposta: false },
      ],
      fotos: [],
      gpsPrecisaoMetros: 6,
      assinanteNome: "Marilda Souza Prado",
      assinaturaChave: null,
      coletadaEm: COLETADA_EM,
      ...vistoria,
    },
  };
}

const PERDA = {
  idempotencyKey: "foto-a",
  capturadaEm: "2026-09-14T11:42:00.000Z",
  papel: "foto" as const,
};

describe("O teto de seis casas decimais mora no contrato, não na tela", () => {
  it("o número é um só, e não uma cópia que envelhece sozinha", () => {
    expect(CASAS_DE_COORDENADA).toBe(6);
    expect(coordenadaGravadaSchema.parse(CRUA)).toEqual(SEIS);
  });

  it("a ABERTURA arredonda, e era a porta por onde a coordenada nasce", () => {
    const lida = aberturaOcorrenciaSchema.parse({
      solicitanteNome: "Joana", canalEntrada: "telefone",
      endereco: "Rua das Acácias, 100", tipo: "deslizamento",
      descricao: "Trinca nova depois da chuva.",
      coordenada: CRUA,
    });
    expect(lida.coordenada).toEqual(SEIS);
  });

  it("a FOTO arredonda, e era por onde o GPS do aparelho entrava", () => {
    const lida = evidenciaFotoSchema.parse({
      chave: "tenant/org/ocorrencias/x/f.jpg",
      capturadaEm: COLETADA_EM,
      coordenada: CRUA,
    });
    expect(lida.coordenada).toEqual(SEIS);
  });

  it("a coordenada da VISTORIA viaja no envelope, e arredondada", () => {
    /*
      Ela não viajava: subia só `gpsPrecisaoMetros`, ou seja, a QUALIDADE de uma
      medida cujo VALOR ficava no celular. O agente é a fonte mais confiável de
      onde o imóvel está, e era o único que não conseguia reportar.
    */
    const lido = envelopeSincronizacaoSchema.parse(envelope({ coordenada: CRUA }));
    expect(lido.vistoria.coordenada).toEqual(SEIS);
  });

  it("a coordenada da vistoria é OPCIONAL, e o envelope antigo continua entrando", () => {
    /*
      Vistoria em vão de morro com o céu tapado fica sem leitura de GPS, e exigir
      o ponto faria a coleta ser recusada exatamente onde ela é mais difícil de
      refazer. Vale também para todo aparelho que ainda não atualizou.
    */
    const lido = envelopeSincronizacaoSchema.parse(envelope({}));
    expect(lido.vistoria.coordenada).toBeUndefined();
  });

  it("coordenada fora da faixa continua sendo recusada: 190 graus não é um ponto", () => {
    expect(() => coordenadaGravadaSchema.parse({ lat: 190, lng: -45 })).toThrow();
  });
});

describe("A prova perdida entra no envelope com o que ela precisa provar", () => {
  it("aceita a perda com papel, hora da captura e o metadado que sobreviveu", () => {
    const lido = envelopeSincronizacaoSchema.parse(envelope({
      evidenciasPerdidas: [{
        ...PERDA,
        legenda: "Trinca na parede dos fundos",
        coordenada: CRUA,
      }],
    }));
    const perda = lido.vistoria.evidenciasPerdidas![0]!;
    expect(perda.papel).toBe("foto");
    expect(perda.capturadaEm).toBe(PERDA.capturadaEm);
    expect(perda.legenda).toBe("Trinca na parede dos fundos");
    // Mesmo teto de todas as outras coordenadas do produto.
    expect(perda.coordenada).toEqual(SEIS);
  });

  it("a chave NÃO é uuid, e isso é o que deixa a assinatura perdida subir", () => {
    /*
      A assinatura usa `<chave-da-coleta>-assinatura`, que é a forma já gravada
      em aparelho hoje. Exigir uuid aqui recusaria justamente a perda da
      assinatura, que é a mais grave das duas: sem ela o laudo imprime uma linha
      de assinatura em branco, indistinguível de uma vistoria em que ninguém
      assinou.
    */
    const lido = envelopeSincronizacaoSchema.parse(envelope({
      evidenciasPerdidas: [{
        idempotencyKey: "11111111-1111-4111-8111-111111111111-assinatura",
        capturadaEm: PERDA.capturadaEm,
        papel: "assinatura",
      }],
    }));
    expect(lido.vistoria.evidenciasPerdidas![0]!.papel).toBe("assinatura");
  });

  it("papel fora do catálogo não entra", () => {
    expect(() => envelopeSincronizacaoSchema.parse(envelope({
      evidenciasPerdidas: [{ ...PERDA, papel: "croqui" }],
    }))).toThrow();
  });

  it("o teto de vinte existe, e ele é sobre um documento com brasão", () => {
    /*
      Cada linha desta lista vira uma frase de perda no laudo de uma família. Um
      cliente adulterado poderia encher o documento com vinte mil declarações de
      prova ausente, que é o mesmo argumento do teto dos órgãos indicados.
    */
    const vinte = Array.from({ length: 20 }, (_, i) => ({
      ...PERDA, idempotencyKey: `foto-${i}`,
    }));
    expect(() => envelopeSincronizacaoSchema.parse(envelope({
      evidenciasPerdidas: vinte,
    }))).not.toThrow();
    expect(() => envelopeSincronizacaoSchema.parse(envelope({
      evidenciasPerdidas: [...vinte, { ...PERDA, idempotencyKey: "foto-21" }],
    }))).toThrow();
  });

  it("é OPCIONAL: a coleta gravada antes deste campo não vira 422 permanente", () => {
    /*
      A razão é a mesma de `coletadaPor` e de `orgaosParaAcionar`, e ela é o
      avesso do defeito que este campo existe para consertar: campo obrigatório
      transformaria a coleta que já está guardada no morro em recusa para
      sempre, destruindo a manhã de trabalho que o campo veio salvar.
    */
    const lido = envelopeSincronizacaoSchema.parse(envelope({}));
    expect(lido.vistoria.evidenciasPerdidas).toBeUndefined();
  });
});
