import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { PAPEIS, podeGerirPapel, type Papel } from "@dc360/shared";
import {
  DICA_DO_EMAIL_TRAVADO, motivoParaNaoAdministrar, podeTrocarEmail,
} from "../src/paginas/usuarios-regras";

/**
 * O que a tela de usuários oferece segue o posto (ADR 0006), e o email de
 * terceiro é do administrador.
 *
 * A PARIDADE que este arquivo cobra é entre três lugares que precisam dizer a
 * mesma coisa: `podeGerirPapel` no pacote compartilhado (a regra), a tela
 * (que não oferece o que vai ser negado) e o modo de demonstração (que recusa
 * como a API recusa). Antes de 15/09/2026 a regra dizia `>=`, e um
 * coordenador via os botões "Corrigir" e "Desativar" na linha de outro
 * coordenador, clicava, e conseguia.
 */

const PAGINA = join(dirname(fileURLToPath(import.meta.url)), "..", "src", "paginas", "Usuarios.tsx");
const LOCAL = join(dirname(fileURLToPath(import.meta.url)), "..", "src", "dados", "local.ts");

describe("Quem a tela deixa administrar", () => {
  it("é exatamente quem podeGerirPapel deixa, para todo par de papéis", () => {
    for (const quem of PAPEIS) {
      for (const alvo of PAPEIS) {
        const motivo = motivoParaNaoAdministrar(quem, { papel: alvo });
        expect(motivo === null, `${quem} sobre ${alvo}`).toBe(podeGerirPapel(quem, alvo));
      }
    }
  });

  it("o coordenador não administra outro coordenador, e a frase diz a quem pedir", () => {
    const motivo = motivoParaNaoAdministrar("coordenador", { papel: "coordenador" });
    expect(motivo).toMatch(/administrador do município/);
    expect(motivo).toMatch(/mesmo posto/);
    expect(motivoParaNaoAdministrar("coordenador", { papel: "administrador" })).toMatch(/acima do seu posto/);
    expect(motivoParaNaoAdministrar("coordenador", { papel: "operador" })).toBeNull();
    expect(motivoParaNaoAdministrar("administrador", { papel: "administrador" })).toBeNull();
  });
});

describe("O email no formulário", () => {
  it("qualquer um que cadastre digita o email; ao corrigir, só o administrador", () => {
    for (const papel of PAPEIS) {
      expect(podeTrocarEmail(papel, false), `${papel} cadastrando`).toBe(true);
    }
    expect(podeTrocarEmail("coordenador", true)).toBe(false);
    expect(podeTrocarEmail("administrador", true)).toBe(true);
    expect(DICA_DO_EMAIL_TRAVADO).toMatch(/administrador/);
  });
});

describe("A tela e o modo de demonstração usam a regra", () => {
  it("os botões da tabela e o campo de email passam pelas funções puras", () => {
    const fonte = readFileSync(PAGINA, "utf8");
    // Duas ocorrências por botão (disabled e title), dois botões.
    expect((fonte.match(/motivoParaNaoAdministrar\(sessao\.papel, u\)/g) ?? []).length).toBeGreaterThanOrEqual(4);
    expect(fonte).toMatch(/disabled=\{!podeTrocarEmail\(sessao\.papel, editando !== null\)\}/);
  });

  it("o modo local recusa a troca de email por quem não é administrador, como a API", () => {
    const fonte = readFileSync(LOCAL, "utf8");
    const inicio = fonte.indexOf("export async function atualizarUsuario(");
    const corpo = fonte.slice(inicio, fonte.indexOf("\n}\n", inicio));
    expect(corpo).toMatch(/s\.papel !== "administrador"/);
    expect(corpo).toMatch(/dados\.email\.trim\(\)\.toLowerCase\(\) !== atual\.email/);
  });
});

// O tipo é exercitado para o arquivo não compilar se `Papel` mudar de nome.
const _papel: Papel = "coordenador";
void _papel;
