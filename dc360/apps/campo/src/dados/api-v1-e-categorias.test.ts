/**
 * A base com /v1 do aplicativo e a categoria do catálogo exposta em
 * `ErroDaApi.categoria` (V2-F02-E02 e E03).
 *
 * A categoria aqui é informação aditiva: ela vem do código do catálogo, com o
 * status como padrão, e nenhuma tela decide por ela nesta etapa. A atualização
 * (`falha-de-atualizacao.ts`) continua decidindo pelo código e pelo 401, e a
 * fila decide no transporte de `packages/campo`, onde a tabela "categoria
 * para ação da fila" está escrita e testada
 * (`packages/campo/test/categorias-do-transporte.test.ts`).
 */

function carregar(origem = "https://api.exemplo.test/"): typeof import("./api") {
  jest.resetModules();
  jest.doMock("expo-constants", () => ({
    __esModule: true,
    default: { expoConfig: { extra: { apiUrl: origem } } },
  }));
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require("./api") as typeof import("./api");
}

const buscarOriginal = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = buscarOriginal;
});

function responder(status: number, corpo: unknown): jest.Mock {
  const buscar = jest.fn(async () => ({
    ok: status >= 200 && status < 300,
    status,
    json: async () => corpo,
  }));
  globalThis.fetch = buscar as unknown as typeof fetch;
  return buscar;
}

describe("origem exibida e base versionada", () => {
  it("separa a origem exibida da base com /v1 usada nas chamadas", async () => {
    const api = carregar("https://api.exemplo.test");
    expect(api.enderecoDaApi("origem")).toBe("https://api.exemplo.test");
    expect(api.enderecoDaApi()).toBe("https://api.exemplo.test/v1");
    const buscar = responder(200, { itens: [] });
    await api.baixarPendencias("token");
    expect(buscar).toHaveBeenCalledWith(
      "https://api.exemplo.test/v1/sincronizacao/pendencias",
      expect.anything(),
    );
  });

  it("origem com barra final não gera //v1", async () => {
    const api = carregar();
    const buscar = responder(200, { itens: [] });
    await api.baixarPendencias("token");
    expect(api.enderecoDaApi("origem")).toBe("https://api.exemplo.test");
    expect(buscar).toHaveBeenCalledWith(
      "https://api.exemplo.test/v1/sincronizacao/pendencias",
      expect.anything(),
    );
  });

  it("origem não configurada continua vazia e impede pedido relativo a /v1", async () => {
    const api = carregar("");
    const buscar = responder(200, {});
    expect(api.enderecoDaApi()).toBe("");
    expect(api.enderecoDaApi("origem")).toBe("");
    await expect(api.baixarPendencias("token")).rejects.toThrow("Endereço da API não configurado");
    expect(buscar).not.toHaveBeenCalled();
  });

  it("preserva as URLs assinadas devolvidas pela API sem acrescentar /v1", async () => {
    const api = carregar();
    const url = "https://api.exemplo.test/armazenamento/objeto?assinatura=teste";
    responder(200, { chave: "foto", url, cabecalhos: {}, expiraEm: "2026-10-25T14:00:00Z" });
    expect(
      (await api.autorizarEnvioDaFoto("token", { tipoConteudo: "image/jpeg", tamanhoBytes: 1 }))
        .url,
    ).toBe(url);
    responder(200, { fotoUrl: url });
    expect((await api.confirmarFoto("token", "foto")).fotoUrl).toBe(url);
  });
});

async function conferirCategoria(codigo: string, categoria: string) {
  const api = carregar();
  // Mesmo status em todos os casos: quem decide é o código do catálogo.
  responder(401, { erro: codigo, mensagem: "Mensagem preservada." });
  const erro: unknown = await api.baixarPendencias("token").catch((falha: unknown) => falha);
  expect(erro).toBeInstanceOf(api.ErroDaApi);
  expect(erro).toMatchObject({ status: 401, codigo, categoria, message: "Mensagem preservada." });
}

describe("categorias lidas pela API do aplicativo", () => {
  it("renovar vem do código nao_autenticado", async () => {
    await conferirCategoria("nao_autenticado", "renovar");
  });

  it("reentrar vem do código sessao_encerrada", async () => {
    await conferirCategoria("sessao_encerrada", "reentrar");
  });

  it("corrigir vem do código dados_invalidos mesmo em 401", async () => {
    await conferirCategoria("dados_invalidos", "corrigir");
  });

  it("aguardar vem do código envio_pendente mesmo em 401", async () => {
    await conferirCategoria("envio_pendente", "aguardar");
  });

  it("permanente vem do código sem_permissao mesmo em 401", async () => {
    await conferirCategoria("sem_permissao", "permanente");
  });

  it("código desconhecido usa o padrão do status e mantém a mensagem", async () => {
    const api = carregar();
    responder(503, { erro: "codigo_futuro", mensagem: "Mensagem preservada." });
    await expect(api.baixarPendencias("token")).rejects.toMatchObject({
      categoria: "aguardar",
      message: "Mensagem preservada.",
    });
    expect(new api.ErroDaApi(404, "codigo_futuro", "Mensagem preservada.").categoria).toBe(
      "permanente",
    );
  });

  it("401 sem corpo mantém o erro e a mensagem anteriores sem inventar categoria", async () => {
    const api = carregar();
    globalThis.fetch = jest.fn(async () => ({
      ok: false,
      status: 401,
      json: async () => {
        throw new Error("Corpo vazio.");
      },
    })) as unknown as typeof fetch;
    await expect(api.baixarPendencias("token")).rejects.toMatchObject({
      status: 401,
      codigo: "erro",
      categoria: null,
      message: "Não foi possível concluir a operação.",
    });
    expect(new api.ErroDaApi(401, "erro", "").mensagemAmigavel()).toBe(
      "Email ou senha não conferem. Confira e tente de novo.",
    );
  });

  it("a atualização continua tratando todo 401 como sessão encerrada, qualquer que seja a categoria", () => {
    const api = carregar();
    const { motivoDaFalha } =
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      require("./falha-de-atualizacao") as typeof import("./falha-de-atualizacao");
    expect(motivoDaFalha(new api.ErroDaApi(401, "envio_pendente", ""))).toBe("sessao-encerrada");
    expect(motivoDaFalha(new api.ErroDaApi(401, "senha_provisoria_vencida", ""))).toBe(
      "sessao-encerrada",
    );
    expect(motivoDaFalha(new api.ErroDaApi(401, "erro", ""))).toBe("sessao-encerrada");
    expect(motivoDaFalha(new api.ErroDaApi(409, "autor_divergente", ""))).toBe("outro");
  });
});
