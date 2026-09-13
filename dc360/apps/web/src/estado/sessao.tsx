import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import type { Sessao } from "../dados/repositorio";
import { esquecerConfiguracaoDoPainel } from "./configuracao";

/**
 * A sessão é a única fonte da organização usada no SET LOCAL do RLS.
 *
 * Nesta fase ela vem da tela de entrada e vive em sessionStorage. Quando o
 * provedor de identidade entrar, o que muda é a origem do objeto: as páginas
 * continuam lendo daqui, e o repositório continua sendo o único que aplica.
 */

const CHAVE = "dc360:sessao";

type ContextoSessao = {
  sessao: Sessao | null;
  entrar: (s: Sessao) => void;
  sair: () => void;
};

const Contexto = createContext<ContextoSessao | null>(null);

export function ProvedorSessao({ children }: { children: ReactNode }) {
  const [sessao, setSessao] = useState<Sessao | null>(() => {
    try {
      const bruto = sessionStorage.getItem(CHAVE);
      return bruto ? (JSON.parse(bruto) as Sessao) : null;
    } catch {
      return null;
    }
  });

  const entrar = useCallback((s: Sessao) => {
    setSessao(s);
    try {
      sessionStorage.setItem(CHAVE, JSON.stringify(s));
    } catch {
      /* modo privado: a sessão só não sobrevive ao recarregar */
    }
  }, []);

  const sair = useCallback(() => {
    setSessao(null);
    /*
      A configuração do ambiente é da IMPLANTAÇÃO e não da pessoa, então trocar
      de conta não muda o valor. Ela é esquecida aqui assim mesmo: guardar
      estado de uma sessão para a seguinte é atalho que envelhece mal, e neste
      caso ele não compra nada, porque a pergunta custa uma requisição por aba.
    */
    esquecerConfiguracaoDoPainel();
    try {
      sessionStorage.removeItem(CHAVE);
    } catch {
      /* idem */
    }
  }, []);

  const valor = useMemo(() => ({ sessao, entrar, sair }), [sessao, entrar, sair]);
  return <Contexto.Provider value={valor}>{children}</Contexto.Provider>;
}

export function useSessao(): ContextoSessao {
  const ctx = useContext(Contexto);
  if (!ctx) throw new Error("useSessao precisa estar dentro de ProvedorSessao");
  return ctx;
}

/** Para páginas que só existem depois de entrar. */
export function useSessaoObrigatoria(): Sessao {
  const { sessao } = useSessao();
  if (!sessao) throw new Error("Página exige sessão");
  return sessao;
}

// ---------------------------------------------------------------------------
// Tema
// ---------------------------------------------------------------------------

const CHAVE_TEMA = "dc360:tema";
export type Tema = "claro" | "escuro";

export function useTema(): [Tema, () => void] {
  const [tema, setTema] = useState<Tema>(() => {
    const salvo = localStorage.getItem(CHAVE_TEMA);
    if (salvo === "claro" || salvo === "escuro") return salvo;
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "escuro" : "claro";
  });

  useEffect(() => {
    // tokens.css usa [data-theme="dark"] como seletor do tema escuro.
    document.documentElement.dataset["theme"] = tema === "escuro" ? "dark" : "light";
    localStorage.setItem(CHAVE_TEMA, tema);
  }, [tema]);

  const alternar = useCallback(() => {
    setTema((t) => (t === "claro" ? "escuro" : "claro"));
  }, []);

  return [tema, alternar];
}
