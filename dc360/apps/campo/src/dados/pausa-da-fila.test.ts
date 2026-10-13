import { ESPERA_COM_A_FILA_PAUSADA_MS, frasesDaPausa } from "./pausa-da-fila";

/**
 * As frases da fila parada pela sessão (V2-F00-E06).
 *
 * São dois atos opostos: sessão encerrada se resolve entrando de novo; conta
 * desativada, só pela coordenação. Quem trocar uma frase pela outra manda a
 * pessoa fazer a única coisa que não resolve.
 */
describe("frases da pausa", () => {
  const sessao = frasesDaPausa("sessao_encerrada");
  const conta = frasesDaPausa("conta_desativada");

  it("as duas prometem que a coleta continua guardada", () => {
    for (const f of [sessao, conta]) {
      expect(f.detalhe).toMatch(/continuam guardadas/i);
      expect(f.faixaDetalhe).toMatch(/guardadas/i);
      expect(f.doCartao).toMatch(/guardada/i);
    }
  });

  it("sessão encerrada manda entrar de novo", () => {
    expect(sessao.detalhe).toMatch(/entre de novo/i);
    expect(sessao.faixaDetalhe).toMatch(/entre de novo/i);
    expect(sessao.doCartao).toMatch(/entrar de novo/i);
  });

  it("conta desativada manda procurar a coordenação e diz que entrar de novo não resolve", () => {
    expect(conta.detalhe.toLowerCase()).toContain(
      "suas coletas continuam guardadas neste aparelho, procure a coordenação",
    );
    expect(conta.detalhe).toMatch(/não resolve/i);
    expect(conta.faixaDetalhe).not.toMatch(/entre de novo/i);
    expect(conta.doCartao).toMatch(/coordenação/i);
  });

  it("as frases das duas pausas não se confundem", () => {
    expect(sessao.titulo).not.toBe(conta.titulo);
    expect(sessao.faixaTitulo).not.toBe(conta.faixaTitulo);
    expect(sessao.doCartao).not.toBe(conta.doCartao);
  });

  it("nenhuma frase tem travessão", () => {
    for (const f of [sessao, conta]) {
      for (const texto of Object.values(f)) expect(texto).not.toContain(String.fromCharCode(0x2014));
    }
  });

  it("senha provisória manda definir a senha no painel e não manda procurar a coordenação", () => {
    const senha = frasesDaPausa("troca_de_senha_obrigatoria");
    expect(senha.titulo).toMatch(/senha provisória/i);
    expect(senha.detalhe).toMatch(/continuam guardadas/i);
    expect(senha.detalhe).toMatch(/painel/i);
    expect(senha.faixaDetalhe).toMatch(/guardadas/i);
    expect(senha.doCartao).toMatch(/guardada/i);
    expect(senha.doCartao).toMatch(/definir a sua senha/i);
    expect(senha.detalhe).not.toMatch(/procure a coordenação/i);
    for (const texto of Object.values(senha)) expect(texto).not.toContain(String.fromCharCode(0x2014));
  });

  it("as três pausas têm frases diferentes", () => {
    const todas = (["sessao_encerrada", "conta_desativada", "troca_de_senha_obrigatoria"] as const)
      .map((m) => frasesDaPausa(m));
    expect(new Set(todas.map((f) => f.titulo)).size).toBe(3);
    expect(new Set(todas.map((f) => f.faixaTitulo)).size).toBe(3);
    expect(new Set(todas.map((f) => f.doCartao)).size).toBe(3);
  });

  it("com a fila parada o laço espera mais que o piso normal de 15 s", () => {
    expect(ESPERA_COM_A_FILA_PAUSADA_MS).toBeGreaterThan(15_000);
  });
});
