import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { aoExpirar, type Sessao } from "../dados/repositorio";
import { esquecerConfiguracaoDoPainel } from "./configuracao";

/**
 * A sessão é a única fonte da organização usada no SET LOCAL do RLS.
 *
 * Nesta fase ela vem da tela de entrada e vive em sessionStorage. Quando o
 * provedor de identidade entrar, o que muda é a origem do objeto: as páginas
 * continuam lendo daqui, e o repositório continua sendo o único que aplica.
 */

const CHAVE = "dc360:sessao";

/**
 * Por que a sessão da tela acabou sem a pessoa pedir.
 *
 * `"expirou"` é a única razão hoje: a camada HTTP recebeu o 401 de sessão
 * morta depois de a renovação falhar. A rota protegida lê isto para mandar a
 * pessoa à entrada com o motivo escrito e o caminho de volta, em vez de
 * deixá-la numa tela que só diz "falha ao carregar" para sempre.
 */
export type MotivoDaSaida = "expirou";

type ContextoSessao = {
  sessao: Sessao | null;
  entrar: (s: Sessao) => void;
  sair: () => void;
  /** Preenchido só quando a sessão caiu sozinha; `entrar` limpa. */
  motivoDaSaida: MotivoDaSaida | null;
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

  const [motivoDaSaida, setMotivoDaSaida] = useState<MotivoDaSaida | null>(null);

  const entrar = useCallback((s: Sessao) => {
    setSessao(s);
    // Entrar de novo apaga o motivo: senão a próxima saída comum ainda diria
    // "sua sessão expirou".
    setMotivoDaSaida(null);
    try {
      sessionStorage.setItem(CHAVE, JSON.stringify(s));
    } catch {
      /* modo privado: a sessão só não sobrevive ao recarregar */
    }
  }, []);

  const sair = useCallback(() => {
    setSessao(null);
    setMotivoDaSaida(null);
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

  /*
    A expiração vem da camada de dados, que não conhece esta sessão nem
    navega: ela só avisa. Aqui a sessão da tela cai junto com os tokens, e o
    motivo fica guardado para a rota protegida levar à entrada.

    O `ref` é o que torna o aviso idempotente: uma tela abre cinco chamadas de
    uma vez e todas recebem o mesmo 401. Só a primeira encontra sessão para
    derrubar; as outras chegam com a sessão já nula e não fazem nada, em vez
    de ficarem reescrevendo o mesmo estado.
  */
  const sessaoAtual = useRef(sessao);
  sessaoAtual.current = sessao;

  useEffect(() => {
    aoExpirar(() => {
      if (!sessaoAtual.current) return;
      setSessao(null);
      setMotivoDaSaida("expirou");
      esquecerConfiguracaoDoPainel();
      try {
        sessionStorage.removeItem(CHAVE);
      } catch {
        /* idem */
      }
    });
    return () => aoExpirar(null);
  }, []);

  const valor = useMemo(
    () => ({ sessao, entrar, sair, motivoDaSaida }),
    [sessao, entrar, sair, motivoDaSaida],
  );
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
