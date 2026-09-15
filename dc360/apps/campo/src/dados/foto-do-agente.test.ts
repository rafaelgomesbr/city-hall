/**
 * A foto de perfil, do dedo na galeria até o servidor, e de volta ao disco.
 *
 * O que estes casos travam, e por que cada um importa:
 *
 * 1. **A galeria não pede permissão de biblioteca.** As duas plataformas abrem
 *    o seletor do sistema fora do processo (Photo Picker no Android,
 *    UIImagePickerController no iOS), e só a imagem escolhida chega ao
 *    aplicativo. Pedir a permissão de biblioteca inteira seria pedir acesso a
 *    todas as fotos do servidor para usar uma, que é justamente o que
 *    `docs/PRIVACIDADE.md` promete não fazer. A câmera continua pedindo a dela.
 * 2. **A foto sai recortada em quadrado e reduzida a 512 pontos** antes de
 *    subir: um retrato de 12 megapixels pelo 3G do morro é dado do agente
 *    gasto à toa, e o teto do servidor para foto de perfil é de dois megabytes.
 * 3. **O envio segue o ciclo da evidência**: autorizar, subir os bytes direto
 *    ao armazenamento, confirmar. E a cópia local só é gravada depois da
 *    confirmação, senão o aparelho mostraria uma foto que o servidor não tem.
 * 4. **Sem sinal, recusa com frase clara** em vez de entrar na fila: a razão
 *    está no módulo.
 * 5. **A cópia local sai no logout**, porque o aparelho é compartilhado entre
 *    turnos e o rosto do agente da manhã não pertence ao da noite.
 */

const mockArquivos = new Map<string, { tamanho: number; conteudo: Uint8Array }>();
const mockApagados: string[] = [];
const mockBaixados: Array<{ url: string; destino: string }> = [];

jest.mock("expo-file-system", () => ({
  Paths: { document: "file:///documentos" },
  Directory: class {
    uri: string;
    constructor(base: string | { document: string }) {
      this.uri = typeof base === "string" ? base : base.document;
    }
    list() {
      return [...mockArquivos.keys()]
        .filter((uri) => uri.startsWith(`${this.uri}/`))
        .map((uri) => new (jest.requireMock("expo-file-system").File)(uri));
    }
  },
  File: class {
    uri: string;
    constructor(base: string | { document: string }, nome?: string) {
      const raiz = typeof base === "string" ? base : base.document;
      this.uri = nome ? `${raiz}/${nome}` : raiz;
    }
    get name(): string { return this.uri.split("/").pop() ?? ""; }
    get size(): number { return mockArquivos.get(this.uri)?.tamanho ?? 0; }
    get exists(): boolean { return mockArquivos.has(this.uri); }
    async bytes(): Promise<Uint8Array> {
      return mockArquivos.get(this.uri)?.conteudo ?? new Uint8Array(0);
    }
    async copy(destino: { uri: string }): Promise<void> {
      const origem = mockArquivos.get(this.uri);
      if (!origem) throw new Error("origem não existe");
      mockArquivos.set(destino.uri, origem);
    }
    delete(): void {
      mockApagados.push(this.uri);
      mockArquivos.delete(this.uri);
    }
    static async downloadFileAsync(url: string, destino: { uri: string }): Promise<{ uri: string }> {
      mockBaixados.push({ url, destino: destino.uri });
      mockArquivos.set(destino.uri, { tamanho: 7, conteudo: new Uint8Array(7) });
      return { uri: destino.uri };
    }
  },
}));

let mockPermissaoDaCamera = true;
const mockPedirCamera = jest.fn(async () => ({ granted: mockPermissaoDaCamera }));
const mockPedirBiblioteca = jest.fn(async () => ({ granted: true }));
const mockAbrirCamera = jest.fn();
const mockAbrirGaleria = jest.fn();
jest.mock("expo-image-picker", () => ({
  CameraType: { front: "front", back: "back" },
  requestCameraPermissionsAsync: () => mockPedirCamera(),
  requestMediaLibraryPermissionsAsync: () => mockPedirBiblioteca(),
  launchCameraAsync: (opcoes: unknown) => mockAbrirCamera(opcoes),
  launchImageLibraryAsync: (opcoes: unknown) => mockAbrirGaleria(opcoes),
}));

const mockAcoes: Array<Record<string, unknown>> = [];
let mockOpcoesDeSalvar: Record<string, unknown> | null = null;
jest.mock("expo-image-manipulator", () => ({
  SaveFormat: { JPEG: "jpeg", PNG: "png" },
  ImageManipulator: {
    manipulate: (uri: string) => {
      const contexto = {
        crop: (rect: unknown) => { mockAcoes.push({ crop: rect }); return contexto; },
        resize: (tamanho: unknown) => { mockAcoes.push({ resize: tamanho }); return contexto; },
        renderAsync: async () => ({
          saveAsync: async (opcoes: Record<string, unknown>) => {
            mockOpcoesDeSalvar = opcoes;
            const saida = `${uri}-reduzida.jpg`;
            mockArquivos.set(saida, { tamanho: 4321, conteudo: new Uint8Array([1, 2, 3]) });
            return { uri: saida, width: 512, height: 512 };
          },
        }),
      };
      return contexto;
    },
  },
}));

const mockAutorizar = jest.fn();
const mockConfirmar = jest.fn();
const mockQuemSouEu = jest.fn();
const mockRemover = jest.fn();
jest.mock("./api", () => ({
  enderecoDaApi: () => "https://api.exemplo",
  SemSinal: class SemSinal extends Error {
    constructor() { super("Sem sinal agora. O que você já registrou continua guardado no aparelho."); }
  },
  autorizarEnvioDaFoto: (...args: unknown[]) => mockAutorizar(...args),
  confirmarFoto: (...args: unknown[]) => mockConfirmar(...args),
  quemSouEu: (...args: unknown[]) => mockQuemSouEu(...args),
  removerFoto: (...args: unknown[]) => mockRemover(...args),
}));

const mockFetch = jest.fn();
(globalThis as { fetch: unknown }).fetch = mockFetch;

import {
  LADO_DA_FOTO, apagarFotosLocais, baixarFotoDoAgente, enviarFoto, escolherFoto,
  fotoLocalDoAgente, removerFotoDoAgente,
} from "./foto-do-agente";

const EU = "u1";
const ASSET = { uri: "file:///cache/escolhida.jpg", width: 3000, height: 4000 };

beforeEach(() => {
  mockArquivos.clear();
  mockApagados.length = 0;
  mockBaixados.length = 0;
  mockAcoes.length = 0;
  mockOpcoesDeSalvar = null;
  mockPermissaoDaCamera = true;
  mockPedirCamera.mockClear();
  mockPedirBiblioteca.mockClear();
  mockAbrirCamera.mockReset();
  mockAbrirGaleria.mockReset();
  mockAutorizar.mockReset();
  mockConfirmar.mockReset();
  mockQuemSouEu.mockReset();
  mockRemover.mockReset();
  mockFetch.mockReset();
  mockArquivos.set(ASSET.uri, { tamanho: 900_000, conteudo: new Uint8Array(3) });
});

describe("escolher a foto", () => {
  it("da galeria: abre o seletor do sistema sem pedir a biblioteca inteira", async () => {
    mockAbrirGaleria.mockResolvedValue({ canceled: false, assets: [ASSET] });

    const r = await escolherFoto("galeria");

    expect(mockPedirBiblioteca).not.toHaveBeenCalled();
    expect(mockAbrirGaleria).toHaveBeenCalledTimes(1);
    const opcoes = mockAbrirGaleria.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(opcoes["allowsEditing"]).toBe(true);
    expect(opcoes["aspect"]).toEqual([1, 1]);
    expect(opcoes["mediaTypes"]).toEqual(["images"]);
    /* Sem EXIF: a foto de perfil não precisa de onde nem quando foi tirada, e
       coordenada dentro de um retrato é dado a mais sem finalidade. */
    expect(opcoes["exif"]).toBe(false);
    expect(r.situacao).toBe("escolhida");
  });

  it("recorta ao quadrado central e reduz a 512 pontos, em JPEG", async () => {
    mockAbrirGaleria.mockResolvedValue({ canceled: false, assets: [ASSET] });

    const r = await escolherFoto("galeria");

    expect(LADO_DA_FOTO).toBe(512);
    /* 3000 por 4000: o quadrado é 3000, deslocado 500 para baixo. */
    expect(mockAcoes[0]).toEqual({ crop: { originX: 0, originY: 500, width: 3000, height: 3000 } });
    expect(mockAcoes[1]).toEqual({ resize: { width: 512, height: 512 } });
    expect(mockOpcoesDeSalvar?.["format"]).toBe("jpeg");
    expect(r).toEqual({
      situacao: "escolhida",
      foto: { uri: `${ASSET.uri}-reduzida.jpg`, tamanhoBytes: 4321, tipoConteudo: "image/jpeg" },
    });
  });

  it("da câmera: pede a permissão dela, e sem ela diz que faltou", async () => {
    mockPermissaoDaCamera = false;
    expect(await escolherFoto("camera")).toEqual({ situacao: "sem_permissao", origem: "camera" });
    expect(mockAbrirCamera).not.toHaveBeenCalled();

    mockPermissaoDaCamera = true;
    mockAbrirCamera.mockResolvedValue({ canceled: false, assets: [{ ...ASSET, width: 1000, height: 1000 }] });
    const r = await escolherFoto("camera");
    expect(mockAbrirCamera).toHaveBeenCalledTimes(1);
    /* A câmera da frente: é um retrato de si mesmo, e a traseira obrigaria a
       pedir a um colega para tirar. */
    expect((mockAbrirCamera.mock.calls[0]?.[0] as Record<string, unknown>)["cameraType"]).toBe("front");
    expect(r.situacao).toBe("escolhida");
  });

  it("cancelar no seletor é cancelada, e não erro", async () => {
    mockAbrirGaleria.mockResolvedValue({ canceled: true, assets: null });
    expect(await escolherFoto("galeria")).toEqual({ situacao: "cancelada" });
  });
});

describe("enviar a foto", () => {
  const FOTO = { uri: "file:///cache/reduzida.jpg", tamanhoBytes: 4321, tipoConteudo: "image/jpeg" as const };

  beforeEach(() => {
    mockArquivos.set(FOTO.uri, { tamanho: 4321, conteudo: new Uint8Array([9, 9]) });
    mockAutorizar.mockResolvedValue({
      chave: "tenant/org/usuarios/u1/foto-x.jpg",
      url: "https://balde.exemplo/tenant/org/usuarios/u1/foto-x.jpg?assinatura=abc",
      cabecalhos: { "content-type": "image/jpeg", "content-length": "4321" },
      expiraEm: "2026-09-16T12:15:00.000Z",
    });
    mockConfirmar.mockResolvedValue({ fotoUrl: "https://balde.exemplo/lida?assinatura=def" });
  });

  it("autoriza, sobe os bytes na URL assinada com os cabeçalhos dela, e confirma com a chave", async () => {
    mockFetch.mockResolvedValue({ ok: true, status: 200 });

    const r = await enviarFoto("token", FOTO, EU);

    expect(mockAutorizar).toHaveBeenCalledWith("token", { tipoConteudo: "image/jpeg", tamanhoBytes: 4321 });
    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toContain("assinatura=abc");
    expect(init.method).toBe("PUT");
    expect(init.headers).toEqual({ "content-type": "image/jpeg", "content-length": "4321" });
    expect(mockConfirmar).toHaveBeenCalledWith("token", "tenant/org/usuarios/u1/foto-x.jpg");
    expect(r.fotoUrl).toBe("https://balde.exemplo/lida?assinatura=def");
    expect(r.uriLocal).toMatch(/^file:\/\/\/documentos\/perfil-foto-u1-[a-z0-9]+\.jpg$/);
  });

  it("guarda a cópia local DEPOIS de confirmar, com nome novo por foto, e apaga a anterior", async () => {
    mockFetch.mockResolvedValue({ ok: true, status: 200 });

    expect(fotoLocalDoAgente(EU)).toBeNull();
    const primeira = await enviarFoto("token", FOTO, EU);
    expect(fotoLocalDoAgente(EU)).toBe(primeira.uriLocal);

    /*
      Nome NOVO por foto, por causa do cache de imagem do sistema: com o mesmo
      nome, a troca só apareceria depois de matar o aplicativo. E a anterior
      sai, porque duas cópias seriam dois rostos ocupando o aparelho.
    */
    await new Promise((r) => { setTimeout(r, 2); });
    const segunda = await enviarFoto("token", FOTO, EU);
    expect(segunda.uriLocal).not.toBe(primeira.uriLocal);
    expect(fotoLocalDoAgente(EU)).toBe(segunda.uriLocal);
    expect(mockArquivos.has(primeira.uriLocal)).toBe(false);
  });

  it("sem sinal no meio do envio, recusa em português e NÃO confirma nem guarda", async () => {
    mockFetch.mockRejectedValue(new TypeError("Network request failed"));

    await expect(enviarFoto("token", FOTO, EU)).rejects.toThrow(/Sem sinal/);
    expect(mockConfirmar).not.toHaveBeenCalled();
    expect(fotoLocalDoAgente(EU)).toBeNull();
  });

  it("o armazenamento recusando os bytes vira frase, e não número", async () => {
    mockFetch.mockResolvedValue({ ok: false, status: 403 });

    await expect(enviarFoto("token", FOTO, EU)).rejects.toThrow(/não aceitou a foto/);
    expect(mockConfirmar).not.toHaveBeenCalled();
  });
});

describe("a cópia local", () => {
  it("baixar traz a foto do servidor para o disco, com o email do cadastro junto", async () => {
    mockQuemSouEu.mockResolvedValue({ fotoUrl: "https://balde.exemplo/f?assinatura=1", email: "eu@exemplo.gov.br" });
    const r = await baixarFotoDoAgente("token", EU);
    expect(r.email).toBe("eu@exemplo.gov.br");
    expect(r.fotoLocal).toMatch(/perfil-foto-u1-/);
    expect(mockBaixados[0]?.url).toContain("assinatura=1");
    expect(fotoLocalDoAgente(EU)).toBe(r.fotoLocal);
  });

  it("baixar apaga a cópia quando o servidor diz que não há mais foto", async () => {
    mockArquivos.set("file:///documentos/perfil-foto-u1-a.jpg", { tamanho: 1, conteudo: new Uint8Array(1) });
    mockQuemSouEu.mockResolvedValue({ fotoUrl: null, email: "eu@exemplo.gov.br" });
    expect((await baixarFotoDoAgente("token", EU)).fotoLocal).toBeNull();
    expect(fotoLocalDoAgente(EU)).toBeNull();
  });

  it("remover avisa o servidor e apaga a cópia", async () => {
    mockArquivos.set("file:///documentos/perfil-foto-u1-a.jpg", { tamanho: 1, conteudo: new Uint8Array(1) });
    mockRemover.mockResolvedValue(undefined);

    await removerFotoDoAgente("token", EU);

    expect(mockRemover).toHaveBeenCalledWith("token");
    expect(fotoLocalDoAgente(EU)).toBeNull();
  });

  it("o logout apaga toda foto de perfil que estiver no aparelho, de quem for", async () => {
    mockArquivos.set("file:///documentos/perfil-foto-u1-a.jpg", { tamanho: 1, conteudo: new Uint8Array(1) });
    mockArquivos.set("file:///documentos/perfil-foto-u2-b.jpg", { tamanho: 1, conteudo: new Uint8Array(1) });
    /* Prova de vistoria NÃO é foto de perfil, e a limpeza daqui não a toca. */
    mockArquivos.set("file:///documentos/foto-1700000000-0.jpg", { tamanho: 1, conteudo: new Uint8Array(1) });

    apagarFotosLocais();

    expect(mockApagados.sort()).toEqual([
      "file:///documentos/perfil-foto-u1-a.jpg", "file:///documentos/perfil-foto-u2-b.jpg",
    ]);
    expect(mockArquivos.has("file:///documentos/foto-1700000000-0.jpg")).toBe(true);
  });
});
