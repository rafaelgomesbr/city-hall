import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import * as SecureStore from "expo-secure-store";
import { entrar as entrarNaApi, renovar, sair as sairDaApi, type Credenciais, type Identidade } from "./api";

/**
 * A sessão do agente, guardada no cofre do aparelho.
 *
 * `expo-secure-store` e não `AsyncStorage`: o token dá acesso aos dados de
 * risco de famílias do município inteiro, e AsyncStorage é um arquivo comum,
 * legível por qualquer aplicativo num aparelho com root. O cofre usa o
 * Keychain no iOS e o Keystore no Android, com o material de chave protegido
 * por hardware quando o aparelho tem.
 *
 * A sessão sobrevive ao aplicativo fechar de propósito. O agente não pode
 * precisar digitar senha no alto do morro, sem sinal, para abrir a vistoria
 * que baixou antes de sair.
 */

const CHAVE_CREDENCIAIS = "dc360.credenciais";
const CHAVE_IDENTIDADE = "dc360.identidade";

type EstadoSessao = {
  carregando: boolean;
  identidade: Identidade | null;
  entrar(email: string, senha: string): Promise<void>;
  sair(): Promise<void>;
  /** Devolve um token de acesso válido, renovando se necessário. */
  obterToken(): Promise<string | null>;
};

const Contexto = createContext<EstadoSessao | null>(null);

async function guardar(chave: string, valor: unknown): Promise<void> {
  if (valor === null) {
    await SecureStore.deleteItemAsync(chave);
    return;
  }
  await SecureStore.setItemAsync(chave, JSON.stringify(valor), {
    // Sem exigir biometria a cada leitura: o agente lê a fila dezenas de
    // vezes por vistoria, e pedir digital a cada vez faria ele deixar o
    // aplicativo aberto o dia inteiro, que é pior.
    keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
  });
}

async function ler<T>(chave: string): Promise<T | null> {
  const bruto = await SecureStore.getItemAsync(chave).catch(() => null);
  if (!bruto) return null;
  try {
    return JSON.parse(bruto) as T;
  } catch {
    // Cofre com conteúdo corrompido é sessão perdida, não travamento.
    await SecureStore.deleteItemAsync(chave).catch(() => undefined);
    return null;
  }
}

export function ProvedorDeSessao({ children }: { children: ReactNode }) {
  const [carregando, setCarregando] = useState(true);
  const [identidade, setIdentidade] = useState<Identidade | null>(null);
  const [credenciais, setCredenciais] = useState<Credenciais | null>(null);

  useEffect(() => {
    void (async () => {
      const [c, i] = await Promise.all([
        ler<Credenciais>(CHAVE_CREDENCIAIS),
        ler<Identidade>(CHAVE_IDENTIDADE),
      ]);
      /*
        Os dois ou nenhum. Credencial sem identidade deixaria a tela sem saber
        de quem é a sessão; identidade sem credencial mostraria o nome de
        alguém que não consegue sincronizar nada.
      */
      if (c && i) { setCredenciais(c); setIdentidade(i); }
      setCarregando(false);
    })();
  }, []);

  const entrar = useCallback(async (email: string, senha: string) => {
    const r = await entrarNaApi(email.trim().toLowerCase(), senha);
    await Promise.all([
      guardar(CHAVE_CREDENCIAIS, r.credenciais),
      guardar(CHAVE_IDENTIDADE, r.identidade),
    ]);
    setCredenciais(r.credenciais);
    setIdentidade(r.identidade);
  }, []);

  const sair = useCallback(async () => {
    /*
      Esquece do lado de cá ANTES de avisar o servidor.

      Se a ordem fosse a outra e o aparelho estivesse sem sinal, o agente
      ficaria preso numa sessão que ele mandou encerrar. Revogar no servidor é
      o que importa para a segurança, mas não pode ser condição para sair.
    */
    const atual = credenciais;
    setCredenciais(null);
    setIdentidade(null);
    await Promise.all([
      guardar(CHAVE_CREDENCIAIS, null),
      guardar(CHAVE_IDENTIDADE, null),
    ]);
    if (atual) await sairDaApi(atual.renovacao);
  }, [credenciais]);

  /**
   * Token de acesso válido para a fila usar.
   *
   * A fila chama isto a cada tentativa de envio, e não uma vez no começo: o
   * dreno pode durar minutos com o sinal indo e vindo, e o token de acesso
   * vive quinze minutos. Buscar uma vez só faria a segunda metade do dreno
   * falhar com 401.
   */
  const obterToken = useCallback(async (): Promise<string | null> => {
    if (!credenciais) return null;
    try {
      const novas = await renovar(credenciais.renovacao);
      await guardar(CHAVE_CREDENCIAIS, novas);
      setCredenciais(novas);
      return novas.acesso;
    } catch {
      /*
        Falhou a renovação: pode ser sinal, pode ser sessão morta. Devolver o
        token atual é o certo nos dois casos. Se for sinal, o token ainda vale
        e o envio vai tentar; se estiver morto, o servidor responde 401, que o
        transporte já classifica como falha permanente, e a fila para de
        insistir em vez de queimar bateria.
      */
      return credenciais.acesso;
    }
  }, [credenciais]);

  const valor = useMemo<EstadoSessao>(
    () => ({ carregando, identidade, entrar, sair, obterToken }),
    [carregando, identidade, entrar, sair, obterToken],
  );

  return <Contexto.Provider value={valor}>{children}</Contexto.Provider>;
}

export function useSessao(): EstadoSessao {
  const valor = useContext(Contexto);
  if (!valor) throw new Error("useSessao fora do ProvedorDeSessao");
  return valor;
}
