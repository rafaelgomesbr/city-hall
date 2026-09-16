/**
 * A COLETA QUE VOLTA DA FILA PARA VIRAR RASCUNHO, campo a campo.
 *
 * É a metade "reconstruir" do botão "Corrigir a vistoria": o motor devolve o
 * envelope e os arquivos (`retirarParaCorrecao`), e esta função os transforma
 * no rascunho que a tela de vistoria já sabe abrir, com tudo preenchido, para
 * o agente ajustar só o que o servidor apontou e concluir de novo.
 *
 * O que os casos travam: nenhum campo cai no chão na volta (checklist, órgãos,
 * coordenada, precisão, nomes, contagens, observações, fotos com as URIs
 * locais, assinatura), a chave de idempotência é a MESMA (chave nova seria
 * segunda coleta do mesmo protocolo para o servidor), e a chave da assinatura
 * que não era UUID não volta: ela é o defeito que parou a coleta.
 */

/* O banco local é do aparelho. O que se prova aqui é a conversão, que é pura. */
jest.mock("./banco-local", () => ({ bancoLocal: jest.fn() }));

import type { ColetaParaCorrecao } from "@dc360/campo";
import { rascunhoDaColeta } from "./rascunho";

const CHAVE = "11111111-1111-4111-8111-000000000009";
const OCORRENCIA = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const CHAVE_DA_FOTO = "ffffffff-1111-4111-8111-000000000001";
const CHAVE_DA_ASSINATURA = "ffffffff-2222-4222-8222-000000000002";

function coletaDeHoje(mudanca: Partial<ColetaParaCorrecao> = {}): ColetaParaCorrecao {
  return {
    ocorrenciaId: OCORRENCIA,
    protocolo: "000009/2026",
    envelope: {
      idempotencyKey: CHAVE,
      ocorrenciaId: OCORRENCIA,
      coletadaEm: "2026-09-15T20:40:00.000Z",
      vistoria: {
        checklist: [
          { chave: "risco_iminente", resposta: true },
          { chave: "evacuacao_necessaria", resposta: false },
          { chave: "interdicao_indicada", resposta: true },
          { chave: "acionar_outro_orgao", resposta: true },
          { chave: "danos_estruturais", resposta: true },
          { chave: "acesso_comprometido", resposta: false },
        ],
        orgaosParaAcionar: [{ orgaoId: null, nome: "Corpo de Bombeiros" }],
        fotos: [],
        coordenada: { lat: -27.595378, lng: -48.54805 },
        gpsPrecisaoMetros: 11,
        assinanteNome: "Klaus",
        assinaturaChave: null,
        coletadaEm: "2026-09-15T20:40:00.000Z",
        observacoes: "Trinca no muro dos fundos.",
        desalojados: 2,
        obitos: 0,
      },
    },
    fotos: [
      {
        papel: "foto", idempotencyKey: CHAVE_DA_FOTO,
        uriLocal: "file:///documentos/foto-1.jpg", nomeArquivo: "vistoria-000009-2026-1.jpg",
        tipoConteudo: "image/jpeg", tamanhoBytes: 0, capturadaEm: "2026-09-15T20:41:00.000Z",
        coordenada: { lat: -27.595378, lng: -48.54805 }, ordem: 0,
        chave: null, evidenciaId: null, enviada: false,
      },
      {
        papel: "assinatura", idempotencyKey: CHAVE_DA_ASSINATURA,
        uriLocal: "file:///documentos/assinatura-1.png", nomeArquivo: "assinatura-000009-2026.png",
        tipoConteudo: "image/png", tamanhoBytes: 4_096, capturadaEm: "2026-09-15T20:58:00.000Z",
        legenda: "Assinatura de quem estava no local", ordem: 1,
        chave: null, evidenciaId: null, enviada: false,
      },
    ],
    ultimaFalha: {
      codigo: "dados_invalidos",
      mensagem: "Alguns campos precisam ser corrigidos.",
      campos: [{ campo: "tamanhoBytes", mensagem: "O arquivo está vazio ou o aparelho não conseguiu medir o tamanho dele." }],
      permanente: true,
      em: "2026-09-15T21:04:04.000Z",
    },
    ...mudanca,
  };
}

describe("rascunhoDaColeta", () => {
  it("reconstrói o rascunho inteiro a partir do envelope e dos arquivos", () => {
    const r = rascunhoDaColeta(coletaDeHoje());

    expect(r.ocorrenciaId).toBe(OCORRENCIA);
    expect(r.protocolo).toBe("000009/2026");
    // A MESMA chave: o servidor reconhece o reenvio e nada duplica.
    expect(r.idempotencyKey).toBe(CHAVE);
    expect(r.coletadaEm).toBe("2026-09-15T20:40:00.000Z");
    expect(r.checklist).toEqual({
      risco_iminente: true,
      evacuacao_necessaria: false,
      interdicao_indicada: true,
      acionar_outro_orgao: true,
      danos_estruturais: true,
      acesso_comprometido: false,
    });
    expect(r.orgaosParaAcionar).toEqual([{ orgaoId: null, nome: "Corpo de Bombeiros" }]);
    expect(r.coordenada).toEqual({ lat: -27.595378, lng: -48.54805 });
    expect(r.gpsPrecisaoMetros).toBe(11);
    expect(r.assinanteNome).toBe("Klaus");
    expect(r.observacoes).toBe("Trinca no muro dos fundos.");
    // Contagens voltam como TEXTO, que é como o campo de digitação as guarda;
    // "0" é contado e deu zero, e o que não foi contado fica ausente.
    expect(r.pessoas).toEqual({ desalojados: "2", obitos: "0" });
  });

  it("as fotos voltam como fotos locais, sem o que era da fila", () => {
    const r = rascunhoDaColeta(coletaDeHoje());

    expect(r.fotos).toEqual([{
      idempotencyKey: CHAVE_DA_FOTO,
      uriLocal: "file:///documentos/foto-1.jpg",
      nomeArquivo: "vistoria-000009-2026-1.jpg",
      tipoConteudo: "image/jpeg",
      tamanhoBytes: 0,
      capturadaEm: "2026-09-15T20:41:00.000Z",
      coordenada: { lat: -27.595378, lng: -48.54805 },
      ordem: 0,
    }]);
  });

  it("a assinatura volta com o traço e com a chave UUID dela", () => {
    const r = rascunhoDaColeta(coletaDeHoje());

    expect(r.assinaturaUri).toBe("file:///documentos/assinatura-1.png");
    expect(r.assinaturaIdempotencyKey).toBe(CHAVE_DA_ASSINATURA);
  });

  it("a chave de assinatura que não era UUID não volta: ela é o defeito", () => {
    const coleta = coletaDeHoje();
    coleta.fotos[1]!.idempotencyKey = `${CHAVE}-assinatura`;

    const r = rascunhoDaColeta(coleta);

    expect(r.assinaturaUri).toBe("file:///documentos/assinatura-1.png");
    // Nula: a conclusão cunha uma UUID nova e a guarda no rascunho.
    expect(r.assinaturaIdempotencyKey).toBeNull();
  });

  it("as fotografias que o servidor já confirmou ficam marcadas: a tela não deixa apagá-las", () => {
    /*
      Achado 3 do revisor de integridade: apagar na correção uma foto já
      confirmada faria o laudo declará-la anexada fora do fluxo, sem agente.
    */
    const coleta = coletaDeHoje();
    coleta.fotos[0] = { ...coleta.fotos[0]!, enviada: true, chave: "tenant/org/foto-1.jpg" };

    expect(rascunhoDaColeta(coleta).fotosJaEnviadas).toEqual([CHAVE_DA_FOTO]);
    // A assinatura enviada não entra: ela não é "mais uma foto" e não se apaga.
    expect(rascunhoDaColeta(coletaDeHoje()).fotosJaEnviadas).toEqual([]);
  });

  it("a recusa do servidor vai junto, para a tela apontar os campos", () => {
    const r = rascunhoDaColeta(coletaDeHoje());
    expect(r.camposRecusados).toEqual([
      { campo: "tamanhoBytes", mensagem: "O arquivo está vazio ou o aparelho não conseguiu medir o tamanho dele." },
    ]);
  });

  it("coleta sem assinatura, sem órgãos e sem observações volta com os valores neutros", () => {
    const coleta = coletaDeHoje({ ultimaFalha: null });
    coleta.fotos = coleta.fotos.filter((f) => f.papel === "foto");
    delete coleta.envelope.vistoria.orgaosParaAcionar;
    delete coleta.envelope.vistoria.observacoes;
    delete coleta.envelope.vistoria.coordenada;

    const r = rascunhoDaColeta(coleta);

    expect(r.assinaturaUri).toBeNull();
    expect(r.assinaturaIdempotencyKey).toBeNull();
    expect(r.orgaosParaAcionar).toEqual([]);
    expect(r.observacoes).toBe("");
    expect(r.coordenada).toBeNull();
    expect(r.camposRecusados).toEqual([]);
  });
});
