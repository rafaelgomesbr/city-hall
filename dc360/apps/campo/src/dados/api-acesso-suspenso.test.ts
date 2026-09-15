import { ErroDaApi, entrar } from "./api";

/**
 * Entrar num município suspenso pelo fornecedor.
 *
 * A API responde 403 `acesso_suspenso` à entrada com senha certa em município
 * suspenso, e a tela de entrada mostra `mensagemAmigavel()` do erro. Até aqui
 * `mensagemAmigavel` lia todo 403 como "este perfil não pode registrar
 * vistoria, fale com a coordenação", que é uma frase para o CADASTRO do
 * agente. Aqui o cadastro está certo, o município é que está suspenso, e a
 * pessoa que resolve não é a coordenação da Defesa Civil: é quem administra o
 * contrato na prefeitura. Mandar o agente falar com a coordenação sobre o
 * cadastro dele é mandar duas pessoas procurarem um defeito que não existe.
 */

jest.mock("expo-constants", () => ({
  __esModule: true,
  default: { expoConfig: { extra: { apiUrl: "https://api.exemplo.test" } } },
}));

function servidorQueResponde(status: number, corpo: unknown): jest.Mock {
  return jest.fn(async () => ({
    status,
    ok: status >= 200 && status < 300,
    json: async () => corpo,
  }));
}

afterEach(() => { jest.restoreAllMocks(); });

describe("entrar em município suspenso", () => {
  it("lança ErroDaApi com o código acesso_suspenso", async () => {
    globalThis.fetch = servidorQueResponde(403, {
      erro: "acesso_suspenso",
      mensagem: "O acesso deste município ao sistema foi suspenso pelo fornecedor.",
    }) as unknown as typeof fetch;

    await expect(entrar("diego@serraalta.exemplo.gov.br", "senha-certa"))
      .rejects.toMatchObject({ status: 403, codigo: "acesso_suspenso" });
  });

  it("a frase amigável fala do fornecedor e do contrato, e não do cadastro do agente", () => {
    const erro = new ErroDaApi(403, "acesso_suspenso", "O acesso deste município foi suspenso.");
    const frase = erro.mensagemAmigavel();
    expect(frase).toMatch(/fornecedor/i);
    expect(frase).toMatch(/contrato/i);
    expect(frase).not.toMatch(/perfil|cadastro|coordenação/i);
    expect(frase).not.toMatch(/senha/i);
  });

  it("a frase diz que entrar de novo não resolve, e que a coleta continua guardada", () => {
    const erro = new ErroDaApi(403, "acesso_suspenso", "O acesso deste município foi suspenso.");
    const frase = erro.mensagemAmigavel();
    expect(frase).toMatch(/não resolve/i);
    expect(frase).toMatch(/continua guardad/i);
  });

  it("um 403 de outro código continua sendo o aviso de perfil", () => {
    const erro = new ErroDaApi(403, "sem_permissao", "Seu perfil não tem permissão.");
    expect(erro.mensagemAmigavel()).toMatch(/perfil/i);
  });
});
