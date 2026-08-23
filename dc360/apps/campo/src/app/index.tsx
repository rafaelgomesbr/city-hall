import { Redirect } from "expo-router";
import { useSessao } from "../dados/sessao";

/**
 * A porta de entrada decide para onde ir, e não mostra nada.
 *
 * Quem já entrou vai direto às tarefas; quem não entrou vai à identificação.
 * `replace` e não `push`: o botão voltar do Android não pode devolver o agente
 * para uma tela de entrada por cima de uma sessão ativa.
 */
export default function Inicio() {
  const { identidade } = useSessao();
  return <Redirect href={identidade ? "/(agente)" : "/entrar"} />;
}
