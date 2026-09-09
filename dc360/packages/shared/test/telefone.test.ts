import { describe, expect, it } from "vitest";
import { digitosDoTelefone, mascararTelefone, telefoneParecePlausivel } from "../src/telefone.js";

describe("mascara de telefone", () => {
  it("formata celular com nono digito", () => {
    expect(mascararTelefone("48996124477")).toBe("(48) 9 9612-4477");
  });

  it("formata fixo de oito digitos", () => {
    expect(mascararTelefone("4833334444")).toBe("(48) 3333-4444");
  });

  it("formata parcialmente enquanto a pessoa digita", () => {
    expect(mascararTelefone("4")).toBe("(4");
    expect(mascararTelefone("48")).toBe("(48");
    expect(mascararTelefone("48996")).toBe("(48) 996");
    expect(mascararTelefone("489961")).toBe("(48) 9961");
  });

  it("ignora o que ja veio formatado, em vez de duplicar simbolo", () => {
    expect(mascararTelefone("(48) 9 9612-4477")).toBe("(48) 9 9612-4477");
  });

  it("nao come digito de numero longo", () => {
    // Ramal e numero internacional existem. Cortar o que a pessoa ditou seria
    // pior que uma mascara imperfeita.
    expect(digitosDoTelefone("+55 (48) 99612-4477")).toBe("5548996124477");
  });

  it("vazio continua vazio", () => {
    expect(mascararTelefone("")).toBe("");
  });
});

describe("plausibilidade, que so avisa e nunca bloqueia", () => {
  it("aceita celular e fixo validos", () => {
    expect(telefoneParecePlausivel("(48) 9 9612-4477")).toBe(true);
    expect(telefoneParecePlausivel("4833334444")).toBe(true);
  });

  it("recusa DDD impossivel", () => {
    expect(telefoneParecePlausivel("0912345678")).toBe(false);
  });

  it("recusa onze digitos que nao comecam com 9 depois do DDD", () => {
    expect(telefoneParecePlausivel("48812344477")).toBe(false);
  });

  it("recusa numero curto demais", () => {
    expect(telefoneParecePlausivel("48996")).toBe(false);
  });
});
