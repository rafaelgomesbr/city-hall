import { ErroDaApi } from "./api";

/**
 * A frase do aparelho para a conta desativada (V2-F00-E06).
 *
 * O 403 caía na frase do perfil ("este perfil não pode registrar vistoria, fale
 * com a coordenação para ajustar o seu cadastro"), que fala de um defeito de
 * cadastro que não existe: a conta foi desativada de propósito. A frase certa
 * diz o fato, diz que entrar de novo não resolve e promete que o que foi
 * coletado continua guardado.
 */

jest.mock("expo-constants", () => ({
  __esModule: true,
  default: { expoConfig: { extra: { apiUrl: "https://api.exemplo.test" } } },
}));

describe("conta desativada", () => {
  const erro = new ErroDaApi(403, "conta_desativada", "Sua conta foi desativada.");

  it("diz o fato, o que NÃO resolve e quem resolve", () => {
    const frase = erro.mensagemAmigavel();
    expect(frase).toMatch(/foi desativada/i);
    expect(frase).toMatch(/não resolve/i);
    expect(frase).toMatch(/coordenação/i);
  });

  it("promete que o que já foi registrado continua guardado", () => {
    expect(erro.mensagemAmigavel()).toMatch(/guardado no aparelho/i);
  });

  it("não é a frase do perfil sem permissão", () => {
    const semPermissao = new ErroDaApi(403, "sem_permissao", "Seu perfil não tem permissão.");
    expect(erro.mensagemAmigavel()).not.toBe(semPermissao.mensagemAmigavel());
    expect(erro.mensagemAmigavel()).not.toMatch(/ajustar o seu cadastro/i);
  });
});
