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

import { CHAVE_ACIONAR_ORGAO } from "@dc360/shared";

export type EstadoParaConcluir = {
  /** Chaves do checklist já respondidas. */
  checklist: Readonly<Record<string, unknown>>;
  /**
   * Os órgãos que o agente indicou acionar.
   *
   * Obrigatório no tipo, e não opcional com valor padrão. Um campo opcional aqui
   * seria uma tela que esquece de passar a lista e um botão que libera assim
   * mesmo, sem nada reclamando: exatamente a forma do defeito que fez esta
   * função existir, quando a assinatura sumiu de uma lista e não da outra.
   */
  orgaosParaAcionar: ReadonlyArray<{ nome: string }>;
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

  /*
    O desdobramento do item, e ele vem logo depois do checklist porque é a
    resposta do checklist se abrindo, não um assunto novo.

    O agente responde "sim, precisa acionar outro órgão" e vai embora. O laudo
    chega à coordenação afirmando isso e sem dizer quem, e a primeira providência
    do coordenador vira um telefonema para o agente, horas depois, para perguntar
    o que estava claro no barranco.

    Aqui é o único lugar que pode cobrar, e essa é a diferença entre esta regra e
    a validação do envelope: o servidor NÃO pode recusar a coleta que já está
    guardada no aparelho antigo, porque recusar destrói o trabalho de uma manhã.
    O aparelho atualizado cobra ANTES, quando o agente ainda está no local e a
    resposta custa um toque.

    Basta UM órgão, e ele pode ter sido digitado à mão: aparelho novo, que nunca
    sincronizou, tem catálogo vazio, e um item obrigatório sem resposta possível
    travaria a vistoria justamente sem sinal, que é a condição normal de trabalho
    deste aplicativo.
  */
  if (estado.checklist[CHAVE_ACIONAR_ORGAO] === true
      && estado.orgaosParaAcionar.length === 0) {
    faltas.push("dizer qual órgão precisa ser acionado");
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
