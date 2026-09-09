import { createContext, useContext } from "react";

import type { EstadoDaPermissao } from "./permissao";
import type { DesfechoDoRegistro } from "./registro";

/**
 * O que as telas podem perguntar sobre a notificação deste aparelho.
 *
 * Fica separado do provedor, num arquivo que NÃO importa
 * `expo-notifications`, e a separação é deliberada: "Minha conta" precisa
 * apenas ler o estado, e se ela importasse o provedor puxaria junto o módulo
 * nativo. Módulo nativo dentro de uma tela é o que transforma um teste de tela
 * num teste de aparelho, e nós já pagamos esse preço com `Alert.alert`.
 */

export type EstadoDoPush = {
  permissao: EstadoDaPermissao;
  /** Como terminou a última tentativa de registrar a ficha. Nulo: não tentou. */
  registro: DesfechoDoRegistro | null;
  /** Faz a pergunta do sistema. Só tem efeito enquanto ela nunca foi feita. */
  pedirPermissao(): Promise<void>;
  /** Leva à tela deste aplicativo nos ajustes, para quem já recusou. */
  abrirAjustes(): Promise<void>;
};

/**
 * O valor de quem está fora do provedor.
 *
 * Uma tela é uma rota, e rota não recebe propriedade de quem a monta: não
 * existe caminho para injetar o provedor numa tela específica. Levantar erro
 * aqui faria a tela quebrar por causa de uma dependência que ela não controla,
 * e "indisponível" é a leitura honesta desse caso: sem o provedor, este
 * aparelho realmente não tem notificação ligada.
 */
const SEM_PROVEDOR: EstadoDoPush = {
  permissao: "indisponivel",
  registro: null,
  pedirPermissao: async () => undefined,
  abrirAjustes: async () => undefined,
};

export const ContextoDePush = createContext<EstadoDoPush>(SEM_PROVEDOR);

export function usePush(): EstadoDoPush {
  return useContext(ContextoDePush);
}
