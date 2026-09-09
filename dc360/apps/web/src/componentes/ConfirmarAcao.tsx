import { useRef } from "react";
import type { ReactNode } from "react";
import { Modal } from "./Modal";

/**
 * A pergunta antes do ato irreversível.
 *
 * Ela existe por um defeito de leitura, não de código: a janela genérica
 * ("Tem certeza?", com "OK" e "Cancelar") não informa nada. Quem está com
 * quatro abas abertas, o rádio na mão e três protocolos parecidos na tela não
 * confirma o que leu na janela, confirma o que LEMBRA de ter clicado, e o
 * lembrete está errado com frequência suficiente para encerrar a ocorrência
 * do vizinho. Aqui a janela é obrigada a dizer três coisas:
 *
 * 1. o TÍTULO nomeia o ato;
 * 2. a CONSEQUÊNCIA cabe em uma frase e diz o que fica diferente depois,
 *    inclusive o que não tem volta;
 * 3. o BOTÃO REPETE o ato com o objeto dentro ("Encerrar 000123/2026"), nunca
 *    "OK". Botão que repete o objeto é a última chance de perceber que o
 *    protocolo na janela não é o da tela que se estava lendo.
 *
 * Duas escolhas a mais, cada uma por um jeito conhecido de errar:
 *
 * - **O foco começa em "Cancelar".** A janela abre debaixo do dedo de quem
 *   acabou de teclar Enter. Com o foco no botão de confirmar, o segundo Enter
 *   (o repique, a impaciência, o "já cliquei nisso") executa o ato sem que
 *   ninguém tenha lido a frase.
 * - **Confirmação destrutiva não fecha por clique fora.** Ver `Modal`.
 */

export type Aparencia = {
  /** Ato destrutivo tem aparência destrutiva: vermelho não é enfeite. */
  classeDoBotao: string;
  fecharAoClicarFora: boolean;
};

export function aparenciaDaConfirmacao(destrutiva: boolean): Aparencia {
  return {
    classeDoBotao: destrutiva ? "botao botao--perigo" : "botao botao--primario",
    /*
      O ato destrutivo é o único em que o clique acidental no fundo custa
      caro: ele não desfaz o que a janela ia fazer, mas apaga a pergunta do
      meio da leitura, e a pessoa volta para a tela sem saber se a coisa
      aconteceu. Em decisão comum, fechar por clique fora é conveniência
      esperada e fica.
    */
    fecharAoClicarFora: !destrutiva,
  };
}

/**
 * Palavras que não dizem o que vai acontecer.
 *
 * Um rótulo é vago quando TODAS as suas palavras são destas: "OK", "Sim",
 * "Confirmar", "Sim, confirmar". Basta uma palavra de fora (o verbo do ato, o
 * número do protocolo, o nome da pessoa) para o rótulo deixar de ser vago,
 * porque é essa palavra que diz o que se está confirmando.
 *
 * Fica exportada porque a regra vale em dois lugares e precisa ser a mesma
 * nos dois: aqui, avisando quem escreve a tela, e no portão de migração, que
 * varre as chamadas de `ConfirmarAcao` do painel inteiro.
 */
const PALAVRAS_VAGAS = new Set([
  "ok", "sim", "nao", "confirmar", "confirmo", "continuar", "prosseguir",
  "seguir", "enviar", "salvar", "concluir", "aceitar", "entendi", "certo",
  "quero", "fechar", "apagar", "excluir", "remover",
]);

export function rotuloVago(rotulo: string): boolean {
  const palavras = rotulo
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(" ")
    .filter(Boolean);
  if (palavras.length === 0) return true;
  return palavras.every((palavra) => PALAVRAS_VAGAS.has(palavra));
}

export type PropsConfirmarAcao = {
  aberto: boolean;
  /** Nomeia o ato: "Encerrar ocorrência", "Desativar usuário". */
  titulo: string;
  /** Uma frase: o que fica diferente depois, e o que não tem volta. */
  consequencia: ReactNode;
  /** O ato com o objeto dentro: "Encerrar 000123/2026". Nunca "OK". */
  rotuloDaAcao: string;
  aoConfirmar: () => void;
  aoCancelar: () => void;
  destrutiva?: boolean;
  /** Enquanto grava, os dois botões travam: dois envios gravam dois eventos. */
  ocupado?: boolean;
  rotuloDeCancelar?: string;
  /** Detalhe que não cabe na frase (o motivo digitado, a lista afetada). */
  children?: ReactNode;
};

export function ConfirmarAcao({
  aberto, titulo, consequencia, rotuloDaAcao, aoConfirmar, aoCancelar,
  destrutiva = false, ocupado = false, rotuloDeCancelar = "Cancelar", children,
}: PropsConfirmarAcao) {
  const cancelar = useRef<HTMLButtonElement>(null);
  const { classeDoBotao, fecharAoClicarFora } = aparenciaDaConfirmacao(destrutiva);

  /*
    O aviso é de desenvolvimento e não interrompe nada. Derrubar a tela por
    causa de um rótulo ruim trocaria um problema de clareza por um problema de
    funcionamento, e quem paga seria o plantão. O portão de migração é quem
    reprova de verdade.
  */
  if (import.meta.env.DEV && rotuloVago(rotuloDaAcao)) {
    console.error(
      `ConfirmarAcao: o rótulo "${rotuloDaAcao}" não diz o que vai acontecer. `
      + 'Repita o ato e o objeto no botão, como em "Encerrar 000123/2026".',
    );
  }

  return (
    <Modal
      aberto={aberto}
      titulo={titulo}
      descricao={consequencia}
      aoFechar={aoCancelar}
      fecharAoClicarFora={fecharAoClicarFora}
      /*
        Sem o "Fechar" do canto: com ele, a janela ofereceria duas saídas com
        nomes diferentes ("Fechar" e "Cancelar") para a mesma coisa, e a
        dúvida sobre se uma delas confirma aparece justamente na janela em que
        a dúvida custa mais caro.
      */
      mostrarBotaoFechar={false}
      focoInicial={cancelar}
      rodape={
        <>
          <button
            type="button"
            className={classeDoBotao}
            onClick={aoConfirmar}
            disabled={ocupado}
          >
            {ocupado ? "Gravando" : rotuloDaAcao}
          </button>
          <button
            type="button"
            className="botao botao--secundario"
            onClick={aoCancelar}
            disabled={ocupado}
            ref={cancelar}
          >
            {rotuloDeCancelar}
          </button>
        </>
      }
    >
      {children}
    </Modal>
  );
}
