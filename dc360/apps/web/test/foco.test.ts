import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import {
  SELETOR_INVALIDO, SELETOR_PRIMEIRO_CAMPO, depoisDePintar, focarPrimeiroCampo,
  focarPrimeiroInvalido, proximoPendente, type RaizDeBusca,
} from "../src/componentes/foco";

/**
 * Para onde o foco vai depois de uma ação, provado sem navegador.
 *
 * As decisões estão em `src/componentes/foco.ts` como funções que recebem o
 * mínimo (uma raiz que sabe achar um seletor, um nó que sabe receber foco), e
 * é isso que se prova aqui, com dublês. Os testes de "a tela chama" existem
 * pelo buraco conhecido do `Modal`: função pura certa que ninguém chama passa
 * em tudo e não faz nada.
 *
 * O que só o navegador prova, e por isso fica dito: que `focus()` move o
 * cursor de verdade (o Chromium recusa focar nó com `display: none`), que o
 * quadro seguinte já vê o DOM novo, e que o leitor de tela anuncia o campo.
 * Isso é teste com pessoa.
 */

const FONTE = join(dirname(fileURLToPath(import.meta.url)), "..", "src");
const ler = (relativo: string) => readFileSync(join(FONTE, relativo), "utf8");

/** Uma raiz de mentira: responde a um seletor com um nó que anota o foco. */
function raizCom(respostas: Record<string, string | null>) {
  const focados: string[] = [];
  const raiz: RaizDeBusca = {
    querySelector: (seletor) => {
      const nome = respostas[seletor];
      return nome ? { focus: () => { focados.push(nome); } } : null;
    },
  };
  return { raiz, focados };
}

describe("Depois de uma submissão recusada", () => {
  it("o foco vai para o primeiro campo marcado como inválido, e a função diz que achou", () => {
    const { raiz, focados } = raizCom({ [SELETOR_INVALIDO]: "nova-solicitante" });
    expect(focarPrimeiroInvalido(raiz)).toBe(true);
    expect(focados).toEqual(["nova-solicitante"]);
  });

  it("sem campo inválido nada é focado, e sem raiz também não explode", () => {
    const { raiz, focados } = raizCom({});
    expect(focarPrimeiroInvalido(raiz)).toBe(false);
    expect(focarPrimeiroInvalido(null)).toBe(false);
    expect(focarPrimeiroInvalido(undefined)).toBe(false);
    expect(focados).toEqual([]);
  });

  it("o seletor é exatamente a marca que `Campo` escreve no controle", () => {
    // `ligacoesDoCampo` escreve `aria-invalid: true` só quando há erro; é essa
    // marca, e não uma classe de CSS, que o foco procura.
    expect(SELETOR_INVALIDO).toBe('[aria-invalid="true"]');
    expect(ler("componentes/Campo.tsx")).toContain('"aria-invalid": true');
  });
});

describe("Quando um formulário aparece no lugar do botão que o abriu", () => {
  it("o foco vai para o primeiro campo editável", () => {
    const { raiz, focados } = raizCom({ [SELETOR_PRIMEIRO_CAMPO]: "corrigir-coordenada-ponto" });
    expect(focarPrimeiroCampo(raiz)).toBe(true);
    expect(focados).toEqual(["corrigir-coordenada-ponto"]);
  });

  it("o seletor deixa de fora o que não recebe foco: campo escondido e desabilitado", () => {
    expect(SELETOR_PRIMEIRO_CAMPO).toContain('input:not([type="hidden"]):not([disabled])');
    expect(SELETOR_PRIMEIRO_CAMPO).toContain("select:not([disabled])");
    expect(SELETOR_PRIMEIRO_CAMPO).toContain("textarea:not([disabled])");
  });
});

describe("Quando itens de uma lista deixam de ter ação (o sino)", () => {
  const lista = [
    { id: "a", pendente: true },
    { id: "b", pendente: false },
    { id: "c", pendente: true },
    { id: "d", pendente: true },
  ];

  it("o foco segue para o próximo pendente DEPOIS do que foi resolvido", () => {
    expect(proximoPendente(lista, ["a"])).toBe("c");
    expect(proximoPendente(lista, ["c"])).toBe("d");
  });

  it("no fim da lista, volta ao primeiro pendente que sobrou", () => {
    expect(proximoPendente(lista, ["d"])).toBe("a");
  });

  it("marcar vários de uma vez pula todos eles", () => {
    expect(proximoPendente(lista, ["a", "c"])).toBe("d");
    expect(proximoPendente(lista, ["c", "d"])).toBe("a");
  });

  it("sem pendente nenhum, devolve null, e quem chama leva o foco ao reserva (Fechar)", () => {
    expect(proximoPendente(lista, ["a", "c", "d"])).toBeNull();
    expect(proximoPendente([], ["a"])).toBeNull();
  });
});

describe("depoisDePintar", () => {
  it("fora do navegador roda na hora; com requestAnimationFrame, espera o quadro", () => {
    let rodou = 0;
    depoisDePintar(() => { rodou += 1; });
    expect(rodou).toBe(1);

    const agendadas: Array<() => void> = [];
    const janela = globalThis as { requestAnimationFrame?: (f: () => void) => number };
    janela.requestAnimationFrame = (f) => { agendadas.push(f); return 1; };
    try {
      depoisDePintar(() => { rodou += 1; });
      expect(rodou, "com rAF disponível, não pode rodar antes do quadro").toBe(1);
      agendadas.forEach((f) => f());
      expect(rodou).toBe(2);
    } finally {
      delete janela.requestAnimationFrame;
    }
  });
});

describe("As telas chamam o que foi provado acima", () => {
  it("os três formulários que deixavam o foco no botão levam o foco ao campo inválido", () => {
    for (const tela of ["paginas/NovaOcorrencia.tsx", "paginas/QueroConhecer.tsx", "paginas/Usuarios.tsx"]) {
      const fonte = ler(tela);
      expect(fonte, `${tela} não importa focarPrimeiroInvalido`).toMatch(/import \{[^}]*focarPrimeiroInvalido[^}]*\} from "\.\.\/componentes\/foco"/);
      expect(fonte, `${tela} não chama focarPrimeiroInvalido`).toMatch(/focarPrimeiroInvalido\(/);
    }
  });

  it("corrigir a coordenada leva o foco ao primeiro campo do formulário que abriu", () => {
    const fonte = ler("paginas/Ocorrencia.tsx");
    expect(fonte).toMatch(/focarPrimeiroCampo\(/);
    expect(fonte).toMatch(/focarPrimeiroInvalido\(/);
  });

  it("descobrir o ponto devolve o foco ao botão quando a tentativa falha", () => {
    const fonte = ler("componentes/DescobrirPonto.tsx");
    expect(fonte).toMatch(/useRef<HTMLButtonElement>/);
    expect(fonte, "sem o efeito na falha, o botão novo nasce sem foco").toMatch(/estado\.tipo === "falha"[\s\S]*?\.focus\(\)/);
  });

  it("o sino leva o foco ao próximo aviso por ler, ou ao Fechar, e o Escape volta a funcionar", () => {
    const fonte = ler("componentes/Sino.tsx");
    expect(fonte).toMatch(/proximoPendente\(/);
    expect(fonte, "o reserva é o botão de fechar, dentro do envoltório que ouve o Escape").toContain('id="sino-fechar"');
    expect(fonte, "cada botão de marcar leva o id do aviso, para o foco achar o próximo").toContain("data-aviso-id=");
  });

  it("emitir ofício leva o foco à faixa de resultado", () => {
    const fonte = ler("paginas/Ocorrencia.tsx");
    expect(fonte).toMatch(/faixaDoOficio\.current\?\.focus\(\)/);
  });
});
