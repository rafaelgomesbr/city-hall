import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { aoExpirar, aoRenovar, type Sessao } from "../dados/repositorio";
import type { MotivoDaSessaoMorta } from "../dados/tipos";
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
 * Três razões (V2-F00-E05), todas vindas da camada HTTP: `"expirou"` (o token
 * venceu e a renovação falhou), `"encerrada"` (alguém encerrou a sessão ou o
 * cadastro mudou) e `"desativada"` (a conta foi desativada). A rota protegida
 * lê isto para mandar a pessoa à entrada com o motivo escrito e o caminho de
 * volta, em vez de deixá-la numa tela que só diz "falha ao carregar" para
 * sempre.
 */
export type MotivoDaSaida = MotivoDaSessaoMorta;

type ContextoSessao = {
  sessao: Sessao | null;
  entrar: (s: Sessao) => void;
  sair: () => void;
  /** Preenchido só quando a sessão caiu sozinha; `entrar` limpa. */
  motivoDaSaida: MotivoDaSaida | null;
  /**
   * Verdadeiro quando quem saiu foi a própria pessoa, no botão "Sair".
   *
   * A rota protegida precisa distinguir isso de sessão que caiu sozinha: sair
   * de propósito não deixa caminho de volta. Sem a distinção, a tela que a
   * pessoa abandonou ficava guardada na navegação e a PESSOA SEGUINTE a entrar
   * naquele navegador caía nela, em vez de cair na tela do papel dela.
   */
  saidaVoluntaria: boolean;
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
  const [saidaVoluntaria, setSaidaVoluntaria] = useState(false);

  const entrar = useCallback((s: Sessao) => {
    setSessao(s);
    // Entrar de novo apaga o motivo: senão a próxima saída comum ainda diria
    // "sua sessão expirou".
    setMotivoDaSaida(null);
    setSaidaVoluntaria(false);
    try {
      sessionStorage.setItem(CHAVE, JSON.stringify(s));
    } catch {
      /* modo privado: a sessão só não sobrevive ao recarregar */
    }
  }, []);

  const sair = useCallback(() => {
    setSessao(null);
    setMotivoDaSaida(null);
    // Quem clicou em "Sair" não tem caminho de volta: ver `saidaVoluntaria`.
    setSaidaVoluntaria(true);
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
    aoExpirar((motivo) => {
      if (!sessaoAtual.current) return;
      setSessao(null);
      setMotivoDaSaida(motivo);
      // Caiu sozinha: o caminho de volta continua valendo, e é o que traz a
      // pessoa de volta à tela onde ela estava quando o token venceu.
      setSaidaVoluntaria(false);
      esquecerConfiguracaoDoPainel();
      try {
        sessionStorage.removeItem(CHAVE);
      } catch {
        /* idem */
      }
    });
    return () => aoExpirar(null);
  }, []);

  /*
    A renovação silenciosa pode trazer a pessoa com OUTRO papel: alguém mudou o
    perfil dela com a tela aberta (V2-F00-E07). A sessão da tela acompanha, e
    os botões que o papel novo não tem somem sem ela entrar de novo. Só muda
    quando muda: a renovação de todo dia devolve o mesmo papel, e reescrever
    o estado a cada quinze minutos refaria a tela à toa.
  */
  useEffect(() => {
    aoRenovar((usuario) => {
      const atual = sessaoAtual.current;
      if (!atual || (atual.papel === usuario.papel && atual.usuarioNome === usuario.nome)) return;
      const nova: Sessao = { ...atual, papel: usuario.papel, usuarioNome: usuario.nome };
      setSessao(nova);
      try {
        sessionStorage.setItem(CHAVE, JSON.stringify(nova));
      } catch {
        /* idem */
      }
    });
    return () => aoRenovar(null);
  }, []);

  const valor = useMemo(
    () => ({ sessao, entrar, sair, motivoDaSaida, saidaVoluntaria }),
    [sessao, entrar, sair, motivoDaSaida, saidaVoluntaria],
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
