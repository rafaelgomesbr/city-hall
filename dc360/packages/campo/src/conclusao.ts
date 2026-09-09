/**
 * O que ainda falta para a vistoria poder ser concluída.
 *
 * Existe por causa de um defeito confirmado com dado de produção em
 * 09/09/2026: as TRÊS vistorias reais coletadas no piloto de Florianópolis
 * chegaram ao servidor com `assinatura_chave` nula. O agente desenhou o traço
 * na tela e a assinatura não existe em documento nenhum.
 *
 * A causa é esta função não existir. A regra estava escrita direto na tela:
 *
 *   const podeConcluir = obrigatoriosFeitos && temFoto && temAssinante;
 *
 * `temAssinante` era só o campo de texto com o NOME de quem assina. O traço,
 * que é `rascunho.assinaturaUri` e só existe depois de a pessoa tocar em
 * "Confirmar assinatura", nunca entrou na conta. E o aviso do que falta era uma
 * segunda lista, escrita à mão em outro ponto do arquivo, com os mesmos três
 * itens. Foi assim que a assinatura sumiu de uma e não da outra: duas listas
 * para o mesmo fato divergem na primeira pressa.
 *
 * Agora é uma lista só, fora da tela, e o botão é `faltas.length === 0`. A
 * frase que o agente lê e a condição que libera o botão não têm como discordar,
 * porque são o mesmo array.
 */

export type EstadoParaConcluir = {
  /** Chaves do checklist já respondidas. */
  checklist: Readonly<Record<string, unknown>>;
  quantasFotos: number;
  assinanteNome: string;
  /** Caminho do PNG do traço. Só existe depois de confirmar a assinatura. */
  assinaturaUri: string | null;
};

export type ItemObrigatorio = { chave: string };

export function faltaParaConcluir(
  estado: EstadoParaConcluir,
  obrigatorios: ReadonlyArray<ItemObrigatorio>,
): string[] {
  const faltas: string[] = [];

  const pendentes = obrigatorios.filter((i) => !(i.chave in estado.checklist)).length;
  if (pendentes > 0) {
    faltas.push(
      pendentes === 1
        ? "responder o último item obrigatório do checklist"
        : `responder ${pendentes} itens obrigatórios do checklist`,
    );
  }

  if (estado.quantasFotos === 0) faltas.push("tirar ao menos uma fotografia");
  if (estado.assinanteNome.trim().length === 0) faltas.push("informar quem estava no local");

  /*
    A assinatura é a última porque é a última coisa que acontece no local, e
    porque é a que some com mais facilidade: o agente desenha, se distrai com o
    morador falando, e sai da tela sem confirmar. Antes disso não travar nada,
    a coleta ia embora sem ela e ninguém percebia até alguém abrir o laudo.
  */
  if (!estado.assinaturaUri) faltas.push("coletar e confirmar a assinatura de quem estava no local");

  return faltas;
}
