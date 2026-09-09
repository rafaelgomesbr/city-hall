import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import * as SecureStore from "expo-secure-store";
import { entrar as entrarNaApi, renovar, sair as sairDaApi, type Credenciais, type Identidade } from "./api";
import { apagarDadosLocais } from "./banco-local";
import { esquecerFicha, fichaGuardada } from "../push/ficha-do-aparelho";
import { criarObtentorDeToken } from "./token";

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
 *
 * A decisão de QUANDO renovar o token mora em `token.ts`, fora do React, e o
 * porquê está documentado lá.
 */

const CHAVE_CREDENCIAIS = "dc360.credenciais";
const CHAVE_IDENTIDADE = "dc360.identidade";

type EstadoSessao = {
  carregando: boolean;
  identidade: Identidade | null;
  entrar(email: string, senha: string): Promise<void>;
  sair(): Promise<void>;
  /** Devolve um token de acesso válido, renovando só se estiver perto de vencer. */
  obterToken(): Promise<string | null>;
  /**
   * Quem está logado AGORA, lido no momento da chamada.
   *
   * Existe ao lado de `identidade` (que é o valor para renderizar) pela mesma
   * razão que `obterToken` existe ao lado das credenciais: a fila de
   * sincronização é memoizada e vive o dia inteiro, atravessando logout e
   * login. Ela precisa carimbar cada coleta com quem coletou, e um valor
   * capturado na primeira renderização faria a fila continuar acreditando,
   * depois da troca de turno, que quem está no aparelho é o agente da manhã.
   *
   * Estável entre renderizações, como `obterToken`: passar uma função nova a
   * cada renderização rodaria de novo o efeito que abre a fila.
   */
  lerIdentidade(): Identidade | null;
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

  /*
    As credenciais moram numa ref, e não em estado, por duas razões.

    A primeira é correção. A fila de sincronização é memoizada: ela guarda a
    primeira função `obterToken` que recebe e usa aquela pelo resto da vida do
    aplicativo. Com as credenciais em estado, essa primeira função fechava
    sobre as credenciais da PRIMEIRA renderização e reapresentava, a cada
    envio, um token de renovação já rotacionado. O servidor lê isso como roubo
    e derruba a sessão inteira do agente. Com a ref, a função é uma só e
    sempre lê o que vale agora.

    A segunda é custo. Este provedor embrulha o aplicativo inteiro, e
    `setCredenciais` a cada renovação re-renderizava toda a árvore. Nenhuma
    tela mostra o token: ele não é dado de renderização, é dado de transporte.
  */
  const credenciais = useRef<Credenciais | null>(null);

  /*
    A identidade tambem mora numa ref, ALEM do estado, e pela mesma razao das
    credenciais.

    O estado e o que as telas desenham. A ref e o que a fila memoizada le no
    momento de carimbar o autor da coleta, e ela precisa dizer quem esta logado
    AGORA. Sem esta segunda copia, a fila carimbaria para sempre o agente da
    primeira renderizacao, e a coleta do turno da manha subiria assinada pelo
    agente da noite no aparelho de plantao compartilhado.
  */
  const identidadeViva = useRef<Identidade | null>(null);
  const lerIdentidade = useRef(() => identidadeViva.current).current;

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
      if (c && i) {
        credenciais.current = c;
        identidadeViva.current = i;
        setIdentidade(i);
      }
      setCarregando(false);
    })();
  }, []);

  /*
    Uma trava de renovação por provedor, criada na primeira renderização e
    nunca mais. Recriar o obtentor recriaria a trava, e duas travas valem o
    mesmo que trava nenhuma.
  */
  const obtentor = useRef<(() => Promise<string | null>) | null>(null);
  obtentor.current ??= criarObtentorDeToken({
    lerCredenciais: () => credenciais.current,
    guardarCredenciais: async (novas) => {
      credenciais.current = novas;
      await guardar(CHAVE_CREDENCIAIS, novas);
    },
    renovar,
  });
  const obterToken = obtentor.current;

  const entrar = useCallback(async (email: string, senha: string) => {
    const r = await entrarNaApi(email.trim().toLowerCase(), senha);
    credenciais.current = r.credenciais;
    identidadeViva.current = r.identidade;
    await Promise.all([
      guardar(CHAVE_CREDENCIAIS, r.credenciais),
      guardar(CHAVE_IDENTIDADE, r.identidade),
    ]);
    setIdentidade(r.identidade);
  }, []);

  const sair = useCallback(async () => {
    /*
      Esquece do lado de cá ANTES de avisar o servidor.

      Se a ordem fosse a outra e o aparelho estivesse sem sinal, o agente
      ficaria preso numa sessão que ele mandou encerrar. Revogar no servidor é
      o que importa para a segurança, mas não pode ser condição para sair.
    */
    const atual = credenciais.current;
    /*
      A ficha é lida ANTES de qualquer apagamento, e mandá-la ao servidor é
      OBRIGAÇÃO do aplicativo, não gentileza.

      `/auth/sair` cala a notificação daquele telefone quando recebe a ficha, e
      não tem como descobri-la sozinho: o servidor conhece a sessão, e a sessão
      não sabe de qual dos aparelhos daquela pessoa o pedido veio. Sem esta
      linha, o aparelho de quem saiu continua recebendo tarefa de uma equipe da
      qual ele não faz mais parte, e num telefone de plantão que passa de turno
      em turno isso é vazamento de dado operacional: o agente da noite lê, na
      tela bloqueada, o aviso de prazo da equipe da manhã.
    */
    const ficha = await fichaGuardada();
    credenciais.current = null;
    identidadeViva.current = null;
    setIdentidade(null);
    await Promise.all([
      guardar(CHAVE_CREDENCIAIS, null),
      guardar(CHAVE_IDENTIDADE, null),
      /*
        Apaga o dado da família do aparelho. O aparelho é compartilhado entre
        turnos, e sem isto o banco local e as assinaturas do turno anterior
        ficam para o próximo agente. É a parte do logout que protege quem está
        no laudo, não quem está segurando o telefone.
      */
      apagarDadosLocais(),
    ]);
    if (atual) await sairDaApi(atual.renovacao, ficha);
    /*
      Esquece a ficha DEPOIS de usá-la. Ela continua sendo do aparelho, mas o
      direito de apresentá-la ao servidor era da sessão que acabou; quem entrar
      depois pede a sua ao sistema e registra de novo, e é esse registro que
      carimba a linha com o usuário certo.
    */
    await esquecerFicha();
  }, []);

  const valor = useMemo<EstadoSessao>(
    () => ({ carregando, identidade, entrar, sair, obterToken, lerIdentidade }),
    [carregando, identidade, entrar, sair, obterToken, lerIdentidade],
  );

  return <Contexto.Provider value={valor}>{children}</Contexto.Provider>;
}

export function useSessao(): EstadoSessao {
  const valor = useContext(Contexto);
  if (!valor) throw new Error("useSessao fora do ProvedorDeSessao");
  return valor;
}
