import { useEffect, useRef, useState } from "react";
import { resolverLinkDeMapa } from "../dados/repositorio";
import {
  FRASE_ABRINDO, FRASE_ANTES, ROTULO_DO_BOTAO, descobrirPonto,
  type Descoberta, type Resolvedor,
} from "../paginas/link-encurtado";

/**
 * O botão que pede ao servidor da prefeitura para abrir um link encurtado.
 *
 * Desenhado dentro da dica do campo de localização, nas DUAS telas que leem
 * link (abertura da ocorrência e correção da coordenada), quando o leitor
 * devolve `encurtado`. É um botão, e não um efeito de colar, porque o que ele
 * dispara é o servidor saindo para a rede em nome de quem clicou, e o Google
 * ficando sabendo que o ponto foi consultado (`docs/SUBPROCESSADORES.md`,
 * seção 2.2). A pessoa decide.
 *
 * Três estados, cada um com ícone e texto, nunca só cor: parado (a frase que
 * diz o ato e o botão), abrindo (a frase de espera, sem botão, para dois
 * cliques não virarem dois pedidos) e falha (a frase da API e o botão de
 * novo). O sucesso não é estado daqui: ele sai por `onPonto`, e quem desenha
 * o campo troca o texto e diz de onde o ponto veio.
 */
export type EstadoDaDescoberta =
  | { tipo: "parado" }
  | { tipo: "abrindo" }
  | { tipo: "falha"; mensagem: string };

export function DescobrirPonto({
  url, onPonto, resolver = resolverLinkDeMapa, estadoInicial = { tipo: "parado" },
}: {
  /** O link encurtado que está no campo. */
  url: string;
  /** Chamado uma vez, só no sucesso, com o que a tela precisa. */
  onPonto: (descoberta: Extract<Descoberta, { tipo: "ponto" }>) => void;
  /** Só o teste passa: um dublê no lugar do repositório. */
  resolver?: Resolvedor;
  /** Só o teste passa: desenha um estado sem precisar de clique. */
  estadoInicial?: EstadoDaDescoberta;
}) {
  const [estado, setEstado] = useState<EstadoDaDescoberta>(estadoInicial);
  /*
    O componente some quando o campo deixa de ser `encurtado` (o sucesso troca
    o texto do campo, então ele some no próprio sucesso). Uma resposta que
    chega depois disso não pode mexer em estado de componente desmontado.
  */
  const montado = useRef(true);
  useEffect(() => {
    montado.current = true;
    return () => { montado.current = false; };
  }, []);

  async function pedir(): Promise<void> {
    setEstado({ tipo: "abrindo" });
    const descoberta = await descobrirPonto(url, resolver);
    if (!montado.current) return;
    if (descoberta.tipo === "ponto") {
      onPonto(descoberta);
      return;
    }
    setEstado(descoberta);
  }

  if (estado.tipo === "abrindo") {
    return (
      <span className="leitura leitura--nota" aria-busy="true">
        <span aria-hidden="true">…</span> {FRASE_ABRINDO}
      </span>
    );
  }

  /*
    A falha NÃO é vermelha, pela regra escrita em `app.css` junto de
    `.leitura--erro`: vermelho é dado errado entrando (latitude e longitude
    trocadas). O servidor não ter conseguido abrir o link é aviso sobre um
    campo opcional, com o próximo passo na frase, e pintar isso de vermelho
    ensinaria o operador a ignorar vermelho.
  */
  return (
    <span className="leitura leitura--nota">
      <span aria-hidden="true">!</span>{" "}
      {estado.tipo === "falha" ? estado.mensagem : FRASE_ANTES}{" "}
      <button type="button" className="botao-texto" onClick={() => void pedir()}>
        {estado.tipo === "falha" ? `${ROTULO_DO_BOTAO} de novo` : ROTULO_DO_BOTAO}
      </button>
    </span>
  );
}
