/**
 * A foto da vistoria não pode morar no cache do sistema.
 *
 * O defeito que este arquivo trava: `takePictureAsync` devolve um caminho no
 * diretório de cache, nada copiava a foto de lá, e o sistema apaga cache sozinho
 * quando o armazenamento aperta, num aparelho de entrada que vive cheio. A
 * coleta espera horas por sinal. Quando o envio finalmente acontece, ele lê os
 * bytes da foto ANTES de mandar o envelope: o arquivo não existe mais, a leitura
 * estoura, e o envelope inteiro (checklist, GPS, assinatura, observações) nunca
 * sai. Uma foto apagada pelo sistema destruía a vistoria inteira.
 */

/* Prefixo `mock`: é o que o jest permite dentro da fábrica de `jest.mock`. */
const mockCopias: { de: string; para: string }[] = [];
const mockTamanhos = new Map<string, number>();
/** O sistema recusando a exclusão, que é o caso em que a limpeza não pode
    derrubar quem a chamou. */
let mockRecusaApagar = false;
/** O `size` do aparelho vindo zerado, como no iPhone de 15/09/2026. */
let mockSizeZerado = false;
/** O sistema recusando a cópia (disco cheio), com a frase nativa em inglês.
    Na biblioteca real a recusa chega como Promise REJEITADA, porque `copy` é
    assíncrona. */
let mockRecusaCopiar = false;
/** A recusa que sai SÍNCRONA (caminho de destino inválido): é o que o
    construtor e `copySync` podem fazer, e o `try/catch` da função cobre. */
let mockRecusaCopiarSincrono = false;
/** Quantas cópias terminaram de verdade (a Promise de `copy` resolveu). */
let mockCopiasTerminadas = 0;
/** Quantas vezes o arquivo INTEIRO foi lido para ser medido. */
let mockLeiturasDeBytes = 0;

jest.mock("expo-file-system", () => ({
  Paths: { document: "file:///documentos" },
  File: class {
    uri: string;
    constructor(base: string | { document: string }, nome?: string) {
      const raiz = typeof base === "string" ? base : base.document;
      this.uri = nome ? `${raiz}/${nome}` : raiz;
    }
    /*
      DUBLÊ FIEL AO `expo-file-system` 57 (V2-F00-E16, correção 2).

      `size` é documentado como "0 se o arquivo não existe ou não pôde ser
      lido", e não nulo. E `copy` é ASSÍNCRONA (`AsyncFunction("copy")` no
      módulo Android, `Promise<void>` na tipagem): o arquivo de destino só
      existe quando a Promise resolve. A versão anterior deste dublê tinha
      `copy(): void` síncrono, e por isso a suíte inteira ficou verde enquanto
      no Android toda foto era recusada como "arquivo saiu vazio": o código
      lia o tamanho na linha seguinte, antes de a cópia existir. `copySync`
      existe na biblioteca e materializa na hora.
    */
    get size(): number {
      if (mockSizeZerado) return 0;
      return mockTamanhos.get(this.uri) ?? 0;
    }
    get exists(): boolean {
      return mockTamanhos.has(this.uri);
    }
    async bytes(): Promise<Uint8Array> {
      return new Uint8Array(mockTamanhos.get(this.uri) ?? 0);
    }
    bytesSync(): Uint8Array {
      mockLeiturasDeBytes += 1;
      if (!mockTamanhos.has(this.uri)) throw new Error("File does not exist");
      return new Uint8Array(mockTamanhos.get(this.uri) ?? 0);
    }
    async copy(destino: { uri: string }): Promise<void> {
      if (mockRecusaCopiarSincrono) throw new Error("Invalid destination");
      // A cópia acontece em outra thread: só vira arquivo depois de um tick.
      await new Promise<void>((resolver) => { setTimeout(resolver, 0); });
      if (mockRecusaCopiar) throw new Error("ENOSPC: no space left on device");
      mockCopias.push({ de: this.uri, para: destino.uri });
      mockTamanhos.set(destino.uri, mockTamanhos.get(this.uri) ?? 0);
      mockCopiasTerminadas += 1;
    }
    copySync(destino: { uri: string }): void {
      if (mockRecusaCopiarSincrono) throw new Error("Invalid destination");
      if (mockRecusaCopiar) throw new Error("ENOSPC: no space left on device");
      mockCopias.push({ de: this.uri, para: destino.uri });
      mockTamanhos.set(destino.uri, mockTamanhos.get(this.uri) ?? 0);
      mockCopiasTerminadas += 1;
    }
    delete(): void {
      if (mockRecusaApagar) throw new Error("EPERM: operation not permitted");
      mockTamanhos.delete(this.uri);
    }
  },
}));

import { CODIGO_ARQUIVO_SUMIU, FalhaPermanente } from "@dc360/campo";
import {
  apagarFotoDoAparelho, arquivosDoAparelho, guardarFotoNoAparelho, medirArquivoNoAparelho,
} from "./evidencia-no-disco";

beforeEach(() => {
  mockCopias.length = 0;
  mockTamanhos.clear();
  mockRecusaApagar = false;
  mockSizeZerado = false;
  mockRecusaCopiar = false;
  mockRecusaCopiarSincrono = false;
  mockCopiasTerminadas = 0;
  mockLeiturasDeBytes = 0;
  jest.spyOn(Date, "now").mockReturnValue(1_757_000_000_000);
});

afterEach(() => { jest.restoreAllMocks(); });

const DA_CAMERA = "file:///cache/ImagePicker/abc123.jpg";

describe("a foto recém tirada", () => {
  it("é copiada do cache para o diretório de documentos", async () => {
    mockTamanhos.set(DA_CAMERA, 812_345);

    const r = await guardarFotoNoAparelho(DA_CAMERA, 0);

    expect(mockCopias).toEqual([
      { de: DA_CAMERA, para: "file:///documentos/foto-1757000000000-0.jpg" },
    ]);
    // O rascunho não pode guardar o caminho do cache.
    expect(r.uriLocal).toBe("file:///documentos/foto-1757000000000-0.jpg");
    expect(r.uriLocal).not.toContain("cache");
  });

  it("declara o tamanho do arquivo que ficou, e não o do original", async () => {
    /*
      É esse número que vai na autorização de envio, e o servidor confere. Ler
      do original faria a conferência bater por acaso, e deixaria de bater no
      dia em que a cópia falhasse pela metade.
    */
    mockTamanhos.set(DA_CAMERA, 812_345);

    expect((await guardarFotoNoAparelho(DA_CAMERA, 0)).tamanhoBytes).toBe(812_345);
  });

  it("o tamanho vem dos bytes de verdade, e não do `size` que pode vir zerado", async () => {
    /*
      A VISTORIA 000009/2026, em 15/09/2026: o `size` da API nova do
      `expo-file-system` é documentado como "0 se o arquivo não existe ou não
      pôde ser lido", esta função devolvia `size ?? 0`, e o zero foi para a
      autorização de envio. O servidor recusou com 422 três vezes, com a foto de
      812 KB inteira no aparelho. Agora a medida é `bytesSync().length`, que só
      responde com o arquivo aberto de verdade.
    */
    mockTamanhos.set(DA_CAMERA, 812_345);
    mockSizeZerado = true;

    expect((await guardarFotoNoAparelho(DA_CAMERA, 0)).tamanhoBytes).toBe(812_345);
  });

  it("zero bytes é arquivo perdido, e não um tamanho: a foto não entra na coleta", async () => {
    // A cópia deixou um arquivo vazio (disco cheio no meio da gravação).
    mockTamanhos.set(DA_CAMERA, 0);

    await expect(guardarFotoNoAparelho(DA_CAMERA, 0)).rejects.toThrow(/não ficou guardada/);
  });

  it("a cópia recusada pelo sistema (Promise rejeitada) sai em português e com o que fazer, e não em inglês", async () => {
    /*
      V2-F00-E16: a tela de vistoria passou a mostrar a frase que esta função
      lança. A frase nativa ("ENOSPC: no space left on device") não pode chegar
      à tarja do agente. E, na biblioteca real, a recusa chega como Promise
      REJEITADA (a cópia é assíncrona): a versão anterior deste teste fazia
      `copy` lançar de forma síncrona, caminho que a biblioteca nunca produz, e
      deixava a rejeição real solta (derrubava o processo com ENOSPC).
    */
    mockTamanhos.set(DA_CAMERA, 812_345);
    mockRecusaCopiar = true;

    const falha = await guardarFotoNoAparelho(DA_CAMERA, 0).then(
      () => null,
      (e: unknown) => e as Error,
    );
    expect(falha).toBeInstanceOf(Error);
    expect(falha?.message).toMatch(/não ficou guardada neste aparelho.*tire a foto de novo/i);
    expect(falha?.message).not.toMatch(/ENOSPC/);
  });

  it("a recusa que sai síncrona (destino inválido) também sai em português", async () => {
    mockTamanhos.set(DA_CAMERA, 812_345);
    mockRecusaCopiarSincrono = true;

    await expect(guardarFotoNoAparelho(DA_CAMERA, 0)).rejects.toThrow(
      /não ficou guardada neste aparelho.*tire a foto de novo/i,
    );
  });

  it("ESPERA a cópia terminar antes de medir (a cópia do expo-file-system é assíncrona)", async () => {
    /*
      O defeito do emulador Android (rodada 2 da validação, 13/10/2026): o
      código chamava `copy(...)` sem esperar e lia o tamanho na linha seguinte,
      quando o arquivo de destino ainda não existia. O `size` zerado virou
      "o arquivo saiu vazio" para uma foto inteira, em 5 de 5 tentativas.

      Este teste só passa se a função esperar a Promise da cópia: o dublê só
      materializa o destino depois de um tick. Quem trocar para `copySync`
      também passa (o dublê tem a síncrona fiel), e é uma correção igualmente
      válida: o que o teste proíbe é medir antes de a cópia existir.
    */
    mockTamanhos.set(DA_CAMERA, 812_345);

    const r = await guardarFotoNoAparelho(DA_CAMERA, 0);

    expect(mockCopiasTerminadas).toBe(1);
    expect(r.tamanhoBytes).toBe(812_345);
    expect(mockTamanhos.get(r.uriLocal)).toBe(812_345);
  });

  it("duas fotos no mesmo milissegundo não viram uma só", async () => {
    // Acontece quando o agente segura o botão. Nome repetido sobrescreveria a
    // foto anterior, e a foto anterior é prova.
    mockTamanhos.set(DA_CAMERA, 812_345);
    const primeira = await guardarFotoNoAparelho(DA_CAMERA, 0);
    const segunda = await guardarFotoNoAparelho(DA_CAMERA, 1);

    expect(primeira.uriLocal).not.toBe(segunda.uriLocal);
  });
});

describe("a leitura dos bytes na hora de enviar", () => {
  it("lê o arquivo que está lá", async () => {
    mockTamanhos.set("file:///documentos/foto-1-0.jpg", 3);

    const bytes = await arquivosDoAparelho.ler("file:///documentos/foto-1-0.jpg");

    expect(bytes).toHaveLength(3);
  });

  it("arquivo que sumiu vira falha PERMANENTE, e não tentativa eterna", async () => {
    /*
      A fila insiste para sempre em falha temporária, de propósito: sinal ruim é
      a condição normal de trabalho e não pode aposentar coleta boa. Um arquivo
      que não existe nunca vai existir. Deixar o erro cru do sistema subir faria
      a fila tratá-lo como problema de rede e tentar de novo a cada cinco
      minutos, para sempre, com a tela dizendo "vai continuar tentando sozinha".
    */
    await expect(arquivosDoAparelho.ler("file:///documentos/sumiu.jpg"))
      .rejects.toBeInstanceOf(FalhaPermanente);
  });

  it("e a frase é em português, com o código que a fila reconhece", async () => {
    /*
      Duas coisas, e a segunda MUDOU DE LUGAR de propósito.

      A frase continua em português porque o erro do `expo-file-system` chega em
      inglês, e ele apareceria como texto final na tela do agente, na rua.

      A AÇÃO deixou de ser dita aqui. Enquanto não havia saída, esta frase
      terminava em "Avise a coordenação e informe o protocolo desta coleta",
      porque era tudo o que dava para oferecer. Hoje a saída existe: o agente
      pode enviar a vistoria sem o arquivo, com a perda declarada no laudo. Quem
      diz isso é o dreno (`packages/campo/src/fila.ts`), e só ele pode dizer,
      porque só ele sabe QUANTOS arquivos faltam, o que ele descobre depois de
      percorrer a coleta inteira. Repetir a frase aqui criaria duas versões da
      mesma orientação, e elas divergiriam na primeira pressa.

      O CÓDIGO é o que importa nesta ponta: ele é o contrato entre a porta, o
      dreno e a tela, e é ele que separa "o arquivo acabou" de "a leitura falhou
      por outro motivo, que pode melhorar". Vem do pacote, e não escrito à mão.
    */
    let falha: FalhaPermanente | null = null;
    try {
      await arquivosDoAparelho.ler("file:///documentos/sumiu.jpg");
    } catch (e) {
      falha = e as FalhaPermanente;
    }
    if (!falha) throw new Error("a leitura precisava ter falhado");

    expect(falha.codigo).toBe(CODIGO_ARQUIVO_SUMIU);
    expect(falha.message).toContain("não está mais neste aparelho");
    // Sem inglês do sistema operacional vazando para a rua.
    expect(falha.message).not.toMatch(/[A-Za-z]+ (?:file|does not exist)/i);
  });
});

describe("a fotografia que o agente mandou apagar", () => {
  /*
    O diálogo da vistoria promete, com todas as letras, que "o arquivo é
    descartado deste aparelho". Até aqui a foto saía da lista do rascunho e o
    JPEG ficava em `Paths.document`. O único lugar que varria esses arquivos era
    o logout, e o agente de campo não sai da conta: ele fecha o aplicativo e
    volta no dia seguinte, no mesmo aparelho, compartilhado entre turnos. É a
    mesma coisa que a limpeza do logout chama pelo nome, "lixo com dado de
    família dentro", só que de uma foto que alguém mandou apagar.
  */
  it("sai do disco de verdade", () => {
    mockTamanhos.set("file:///documentos/foto-1-0.jpg", 800_000);

    expect(apagarFotoDoAparelho("file:///documentos/foto-1-0.jpg")).toBe(true);
    expect(mockTamanhos.has("file:///documentos/foto-1-0.jpg")).toBe(false);
  });

  it("arquivo que já não existe não é erro", () => {
    /* O sistema pode ter apagado o cache antes, ou a pessoa pode ter limpado os
       arquivos do aplicativo pelos ajustes do Android. */
    expect(apagarFotoDoAparelho("file:///documentos/sumiu.jpg")).toBe(false);
  });

  it("o sistema que recusa apagar não derruba quem chamou", () => {
    /*
      O contrato inteiro desta função: quem a chama está no meio de tirar a foto
      da vistoria, e essa parte não pode falhar por causa da limpeza. O arquivo
      órfão volta a ser problema do logout, que é onde ele sempre esteve; a foto
      sumir da lista é o que o agente pediu.
    */
    mockTamanhos.set("file:///documentos/foto-1-0.jpg", 800_000);
    mockRecusaApagar = true;

    expect(() => apagarFotoDoAparelho("file:///documentos/foto-1-0.jpg")).not.toThrow();
    expect(apagarFotoDoAparelho("file:///documentos/foto-1-0.jpg")).toBe(false);
  });
});

describe("a medida de um arquivo na hora de concluir", () => {
  /*
    A assinatura e cada fotografia são medidas de novo ao concluir, com a
    mesma régua da hora de guardar: os bytes. É essa medida que entra na
    conferência com o esquema do servidor antes de enfileirar.
  */
  it("devolve os bytes do arquivo que existe", () => {
    mockTamanhos.set("file:///documentos/assinatura-1.png", 4_096);
    expect(medirArquivoNoAparelho("file:///documentos/assinatura-1.png")).toBe(4_096);
  });

  it("devolve zero para o arquivo que não existe, sem estourar", () => {
    // Zero é o sinal de "perdido" que a conferência reprova com frase própria.
    expect(medirArquivoNoAparelho("file:///documentos/sumiu.png")).toBe(0);
  });

  /*
    A MEDIDA NÃO LÊ O ARQUIVO INTEIRO quando o sistema sabe o tamanho.

    `bytesSync().length` era a única régua, e ela custa uma leitura completa e
    SÍNCRONA de cada fotografia, uma atrás da outra, no toque de concluir: seis
    fotos de 800 KB são cinco megabytes passando pela memória com a tela
    travada, num aparelho de entrada. O `size` do sistema responde sem abrir o
    arquivo. Os bytes continuam sendo a régua de DESEMPATE, porque o `size`
    pode vir zerado ou nulo com o arquivo inteiro lá (o iPhone de 15/09/2026),
    e zero nunca pode ser tomado como medida.
  */
  it("usa o tamanho que o sistema informa, sem ler os bytes", () => {
    mockTamanhos.set("file:///documentos/foto-1.jpg", 812_345);

    expect(medirArquivoNoAparelho("file:///documentos/foto-1.jpg")).toBe(812_345);
    expect(mockLeiturasDeBytes).toBe(0);
  });

  it("com o `size` zerado ou nulo, cai para os bytes de verdade", () => {
    mockTamanhos.set("file:///documentos/foto-2.jpg", 812_345);
    mockSizeZerado = true;

    expect(medirArquivoNoAparelho("file:///documentos/foto-2.jpg")).toBe(812_345);
    expect(mockLeiturasDeBytes).toBe(1);
  });
});
