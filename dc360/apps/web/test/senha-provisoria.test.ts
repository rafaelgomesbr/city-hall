import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { conferirSenhaNova, passoDepoisDeEntrar } from "../src/paginas/senha-provisoria-regras";
import type { Sessao } from "../src/dados/tipos";

/**
 * Quem entra com senha provisória define a senha ANTES de ver o painel.
 *
 * O servidor (migração 046) responde 403 `troca_de_senha_obrigatoria` a toda
 * rota que não seja a troca de senha enquanto a senha for a sorteada. Seguir
 * para o painel nesse estado é mostrar uma tela inteira de erros. A tela de
 * entrada lê `trocaDeSenhaObrigatoria` na resposta e pede a senha nova ali,
 * como já faz com a ativação obrigatória do segundo fator.
 */

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), "..", "src");
const fonte = (relativo: string) => readFileSync(join(RAIZ, relativo), "utf8");

const sessao: Sessao = {
  organizacaoId: "o", organizacaoNome: "DC", municipio: "Serra Alta", uf: "MG",
  usuarioId: "u", usuarioNome: "Diego", papel: "agente_campo",
};

describe("O passo depois de entrar", () => {
  it("sessão comum segue; sessão de senha provisória para na troca; desafio vai ao segundo fator", () => {
    expect(passoDepoisDeEntrar({ tipo: "sessao", sessao })).toEqual({ passo: "seguir", sessao });
    expect(passoDepoisDeEntrar({ tipo: "sessao", sessao, trocaDeSenhaObrigatoria: true }))
      .toEqual({ passo: "definir-senha", sessao });
    expect(passoDepoisDeEntrar({
      tipo: "segundo-fator",
      desafio: { segundoFator: "codigo", desafio: "d", expiraEm: 300, mensagem: "" },
    })).toEqual({ passo: "segundo-fator" });
  });
});

describe("O formulário da senha nova", () => {
  it("exige a provisória, doze caracteres, diferente da provisória e repetida igual", () => {
    const r = conferirSenhaNova({ atual: "", nova: "curta", repetida: "outra" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(Object.keys(r.erros).sort()).toEqual(["atual", "nova", "repetida"]);

    const igual = conferirSenhaNova({ atual: "abcd-efgh-ijkm", nova: "abcd-efgh-ijkm", repetida: "abcd-efgh-ijkm" });
    expect(igual.ok).toBe(false);
    if (!igual.ok) expect(igual.erros["nova"]).toMatch(/diferente/);

    expect(conferirSenhaNova({
      atual: "abcd-efgh-ijkm", nova: "serra-alta-chuva-2026", repetida: "serra-alta-chuva-2026",
    })).toEqual({ ok: true });
  });
});

describe("A tela e a camada de dados", () => {
  it("a entrada passa toda sessão nova por passoDepoisDeEntrar, nos dois caminhos", () => {
    const tela = fonte("paginas/Entrar.tsx");
    expect(tela).toContain("passoDepoisDeEntrar(resultado)");
    // O caminho da senha e o do segundo fator chegam ao mesmo lugar.
    expect((tela.match(/receber\(resultado, /g) ?? []).length).toBeGreaterThanOrEqual(2);
    expect(tela).toContain("<PassoDaSenhaNova");
    // E só entra na sessão DEPOIS de a senha ter sido trocada.
    expect(tela).toMatch(/aoConcluir=\{\(\) => seguir\(definirSenha\.sessao\)\}/);
  });

  it("trocarSenha guarda o token de acesso novo que o servidor devolve", () => {
    const http = fonte("dados/http.ts");
    const inicio = http.indexOf("export async function trocarSenha(");
    const corpo = http.slice(inicio, http.indexOf("\n}\n", inicio));
    expect(corpo).toMatch(/guardarTokens\(\{ acesso: r\.acesso, renovacao: tokens\.renovacao \}\)/);
  });
});
