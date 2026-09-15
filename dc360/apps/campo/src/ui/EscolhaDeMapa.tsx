import { FolhaDeEscolha, type OpcaoDaFolha } from "./FolhaDeEscolha";
import { IconeAparelho, IconeGps, IconeLocalizacao } from "./icones";
import { icone as tamanhoDeIcone } from "./tokens";

/**
 * AS TRÊS RESPOSTAS DO BOTÃO DO MAPA, na tela de vistoria.
 *
 * "Abrir no mapa" tinha uma resposta só, e ela levava o agente para FORA do
 * aplicativo, no meio de uma coleta de quarenta minutos, sem perguntar.
 * Quem paga olhou a tela e disse: "leva o usuário pra fora do app, deveria
 * perguntar se quer abrir o maps externo ou abrir o mapa dentro do app com a
 * rota, tem que ter uma opção de copiar as coordenadas".
 *
 * As três, e o que separa uma da outra:
 *
 * 1. **Abrir no aplicativo de mapas do aparelho.** É a rota de verdade, com voz
 *    e trânsito, no aplicativo que a pessoa já usa e cujos mapas ela já baixou.
 *    O preço é sair do DC360, e a folha diz isso na letra, porque descobrir
 *    depois de sair é descobrir tarde.
 * 2. **Ver o mapa aqui dentro.** É o mapa que a própria tela de vistoria já
 *    desenha, no cartão de localização: um toque rola até ele. Não sai do
 *    aplicativo e não interrompe a coleta.
 * 3. **Copiar a coordenada.** A única das três que funciona num aparelho sem
 *    nenhum aplicativo de mapas instalado, e a única que serve para o que o
 *    agente faz com mais frequência do que navegar: ditar o ponto por rádio
 *    para a base, ou mandar para a equipe que está subindo atrás.
 *
 * ## O invólucro mora em `FolhaDeEscolha`
 *
 * Desde que a tela do mapa das tarefas precisou de duas perguntas próprias, o
 * modal, o véu, a animação e a regra de conteúdo (verbo no rótulo, saída
 * nomeada, fundo escondido do leitor de tela) moram em `FolhaDeEscolha`, e
 * este arquivo passou a ser só a pergunta da vistoria: o que ela oferece e o
 * que cada resposta diz. A assinatura e os `testID`s são os mesmos de antes,
 * e `escolha-de-mapa.test.tsx` continua provando isto sem uma linha mudada.
 *
 * ## O cuidado de privacidade, e por que ele NÃO é repetido aqui
 *
 * "Ver o mapa aqui dentro" pode desenhar o mapa do Google (a coordenada sai do
 * aparelho) ou o plano esquemático (nenhuma requisição), conforme o município
 * tenha ou não autorizado. Esta folha **não afirma qual dos dois**, e isso é
 * deliberado: quem decide é `useMapaDoMunicipio`, quem diz é a legenda de modo
 * dentro de `MapaDoImovel`, e ela é a seção 2.2 do `docs/SUBPROCESSADORES.md`
 * virada tela. Uma segunda frase, aqui, afirmando o modo antes de a autorização
 * ter sido lida seria exatamente o defeito que o painel pagou para aprender em
 * 13/09: a tela afirma "nenhuma coordenada sai daqui" e um segundo depois
 * desenha o mapa do Google. O que esta folha faz é APONTAR para a legenda, que
 * é a única frase do produto autorizada a dizer o modo.
 */

/** Qual das três o agente escolheu. Quem age é a tela, não a folha. */
export type RespostaDoMapa = "aplicativo" | "aqui-dentro" | "copiar";

export function EscolhaDeMapa({
  aberto, endereco, coordenada, aoEscolher, aoFechar,
}: {
  aberto: boolean;
  /** Para onde se vai. Uma folha sem destino é uma pergunta sem sujeito. */
  endereco: string;
  /** Já formatada por `coordenadaEmTexto`, para a folha não ter um segundo formato. */
  coordenada: string;
  aoEscolher: (resposta: RespostaDoMapa) => void;
  aoFechar: () => void;
}) {
  const opcoes: [OpcaoDaFolha<RespostaDoMapa>, OpcaoDaFolha<RespostaDoMapa>, OpcaoDaFolha<RespostaDoMapa>] = [
    {
      chave: "aplicativo",
      testID: "mapa-no-aparelho",
      titulo: "Abrir no aplicativo de mapas",
      detalhe:
        "Sai do DC360 e abre a rota no mapa do aparelho. A vistoria fica "
        + "guardada como está, e volta inteira quando você voltar.",
      desenho: (cor) => <IconeAparelho cor={cor} tamanho={tamanhoDeIcone.acao} />,
    },
    {
      chave: "aqui-dentro",
      testID: "mapa-aqui-dentro",
      titulo: "Ver o mapa aqui dentro",
      detalhe:
        "Rola até o mapa desta tela, sem sair do aplicativo. A legenda dele diz "
        + "se a coordenada sai do aparelho ou se o plano é desenhado aqui.",
      desenho: (cor) => <IconeGps cor={cor} tamanho={tamanhoDeIcone.acao} />,
    },
    {
      chave: "copiar",
      testID: "mapa-copiar",
      titulo: "Copiar a coordenada",
      detalhe: `Copia ${coordenada} para colar em outro aplicativo, ou para ditar por rádio.`,
      desenho: (cor) => <IconeLocalizacao cor={cor} tamanho={tamanhoDeIcone.acao} />,
    },
  ];

  return (
    <FolhaDeEscolha
      aberto={aberto}
      testID="escolha-de-mapa"
      titulo="Como chegar até lá?"
      assunto={endereco}
      opcoes={opcoes}
      /*
        A saída nomeia o que faz, e não "Cancelar". Num aplicativo de campo,
        "Cancelar" é ambíguo do jeito mais caro possível: cancelar a escolha,
        ou cancelar a vistoria? É a mesma decisão que o diálogo de nova
        vistoria já tomou ("Manter só a vistoria que já fiz").
      */
      saida={{ titulo: "Continuar na vistoria", testID: "mapa-continuar" }}
      aoEscolher={aoEscolher}
      aoFechar={aoFechar}
    />
  );
}
