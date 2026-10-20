import {
  useCallback, useEffect, useRef, useState, type ReactNode,
} from "react";
import { Animated, Easing, ScrollView, View } from "react-native";
import { router } from "expo-router";
import {
  autoriaDaColeta,
  evidenciasPerdidasDoItem,
  recusaEstaNoDado,
  CODIGO_ARQUIVO_SUMIU,
  type Autoria,
  type FilaDeSincronizacao,
  type ItemDeDevolucao,
  type ItemFila,
  type MotivoDeSessao,
} from "@dc360/campo";
import { ROTULO_MOTIVO_DE_DEVOLUCAO, rotuloDoCampo } from "@dc360/shared";
import { enderecoDaApi } from "../../dados/api";
import { devolverParaCorrecao } from "../../dados/correcao-da-coleta";
import { obterFila } from "../../dados/fila";
import { useSinal } from "../../dados/conectividade";
import { frasesDaPausa } from "../../dados/pausa-da-fila";
import { useSessao } from "../../dados/sessao";
import {
  Aviso, Botao, Cartao, Carregando, Dado, Separador, Txt, Vazio, useTema,
} from "../../ui/componentes";
import { useRecuoDoMenu } from "../../ui/BarraDeAbas";
import { useComecarDoTopo } from "../../ui/CenaDaAba";
import { Chip, type TomDoChip } from "../../ui/Chip";
import { Dialogo } from "../../ui/Dialogo";
import {
  IconeAguardando, IconeAlerta, IconeArquivado, IconeDevolucao, IconeEnvio,
  IconeEquipe, IconeInformacao, IconePerigo, IconeSucesso,
  type ComponenteDeIcone,
} from "../../ui/icones";
import {
  borda, easing, espaco, icone as tamanhoDeIcone, movimento, peso, raio,
} from "../../ui/tokens";
import { useReducaoDeMovimento } from "../../ui/useReducaoDeMovimento";
import { atrasoEmCascata } from "../../ui/hierarquia";
import { ItemDeLista } from "../../ui/ItemDeLista";
import { retornoTatil } from "../../ui/retornoTatil";

/**
 * A fila de envio, item a item.
 *
 * Esta tela existe por uma razão de confiança, e não de função. Uma coleta
 * guardada e ainda não enviada é indistinguível, para quem olha de fora, de
 * uma coleta perdida. Se o agente não puder ver a dela ali, com nome e estado,
 * ele vai refazer a vistoria por precaução, e refazer é o custo que este
 * produto inteiro existe para evitar.
 *
 * Por isso cada item mostra o protocolo, o que aconteceu na última tentativa e
 * quantas vezes já tentou. Nada de "sincronizando" genérico.
 *
 * ## O que mudou nesta passagem, e por quê
 *
 * O TEXTO CONTINUA O MESMO, a FORMA dele é que mudou. Metade deste arquivo era
 * copywriting bom escrito no formato errado: dezesseis parágrafos corridos,
 * cada um entregue a um único `Txt` cinza dentro do cartão. O pior deles tinha
 * quarenta e cinco palavras, e as últimas vinte eram instrução operacional
 * ("peça para fulano entrar neste aparelho", "avise a coordenação") enterrada
 * no fim de um parágrafo em cor discreta. Instrução que se lê em pé, na rua,
 * não pode estar no fim de um parágrafo.
 *
 * Então cada estado passou a responder três perguntas separadas, e cada uma
 * tem um lugar próprio no cartão:
 *
 * - **quem**, quando o fato tem dono (a coleta é de outra pessoa);
 * - **por quê**, uma frase, que é o estado explicado;
 * - **o que fazer**, em passos, e só quando existe algo a fazer.
 *
 * Nenhuma palavra foi jogada fora: as frases que estavam grudadas foram
 * separadas nos pontos finais que elas já tinham.
 */

/**
 * Uma lista só decide a palavra, o símbolo, o desenho e o tom de cada estado.
 *
 * Antes eram duas: este `switch` escolhia a palavra, e trezentas linhas abaixo
 * uma cadeia de ternários escolhia as cores do selo. Quando o estado
 * "arquivado" nasceu, ele entrou aqui e não entrou lá, e o resultado é o defeito
 * que o teste desta tela agora trava: uma coleta ARQUIVADA (a ocorrência foi
 * encerrada no painel enquanto ela esperava sinal, e ela nunca vai chegar)
 * ficava com exatamente o mesmo desenho de uma coleta AGUARDANDO envio, que vai
 * chegar assim que houver sinal. Os dois estados são opostos, e o agente lia os
 * dois como o mesmo.
 *
 * O símbolo não é enfeite e por isso é campo obrigatório do `Chip`: esta tela é
 * lida em pé, na rua, com sol na tela, onde âmbar e verde são a mesma mancha.
 * O ícone entrou AO LADO do símbolo, e não no lugar dele: o `Chip` continua
 * carregando o segundo canal dele (símbolo mais palavra), e o desenho é o
 * terceiro, na margem esquerda do cartão, onde o olho varre a lista de cima a
 * baixo sem ler.
 */
/**
 * Depois de quantas tentativas a frase muda de "vai tentar de novo" para "a
 * conexão daqui não está dando conta".
 *
 * Oito era o antigo teto que BLOQUEAVA a coleta, e ele mentia: cerca de cinco
 * minutos de sinal ruim pintavam o cartão de vermelho com "repetir o envio não
 * resolve sozinho" ao lado de um botão "Descartar", sobre uma vistoria que
 * subiria sozinha na janela de sinal seguinte. O número continua sendo oito,
 * mas agora ele só troca a frase: a coleta continua tentando, e a frase manda a
 * pessoa procurar sinal, que é a única coisa que resolve.
 */
const TENTATIVAS_ATE_AVISAR = 8;

/**
 * Quanto tempo a confirmação de um toque fica na tela.
 *
 * Oito segundos, e não um valor de `movimento`: isto não é animação, é quanto
 * tempo uma frase fica legível para quem está lendo em pé e distraído. Curto
 * demais e o agente perde a única prova de que o toque pegou; longo demais e a
 * confirmação de um minuto atrás vira ruído em cima de um estado que já mudou.
 */
const RETORNO_NA_TELA_MS = 8_000;

/**
 * Quanto o emblema do clímax passa do tamanho final antes de voltar.
 *
 * O gesto é o mesmo da `FaixaDeSincronizacao`, e é de propósito: as duas peças
 * respondem à MESMA pergunta ("o meu trabalho chegou?"), uma no alto de toda
 * tela e a outra aqui, e duas comemorações com desenhos diferentes seriam duas
 * respostas diferentes para o mesmo fato.
 *
 * O salto é um pouco menor que o da faixa (que vai a 1,28) porque a peça é
 * maior: o emblema da faixa tem 28 pontos e este ocupa o círculo inteiro do
 * estado vazio. Excesso de escala numa peça grande deixa de ler como alívio e
 * passa a ler como sobressalto.
 */
const SALTO_DO_EMBLEMA = 1.18;

/**
 * Que fração do clímax é a subida do emblema. O resto é a volta.
 *
 * Menos da metade na subida e mais da metade na volta: é o que faz o gesto
 * terminar assentando em vez de parar de repente. Os mesmos dois tempos da
 * faixa, pela mesma razão de serem o mesmo gesto.
 */
const SUBIDA_DO_EMBLEMA = 0.4;


/**
 * O que a tela sabe dizer sobre um item, separado em campos.
 *
 * Era uma string só, chamada `explicacao`, e é por isso que o texto virava
 * parágrafo: um campo só não tem onde guardar hierarquia. Com quatro campos, a
 * mesma frase de antes se distribui, e o cartão ganha forma sem ninguém
 * reescrever nada.
 */
type EstadoDoItem = {
  /** A palavra do selo. */
  rotulo: string;
  /** O segundo canal do selo, além da cor. Obrigatório no `Chip`. */
  simbolo: string;
  tom: TomDoChip;
  /** O desenho, na margem do cartão, para a lista ser varrida sem leitura. */
  Icone: ComponenteDeIcone;
  /** Quem, quando o fato tem dono. Vazio quando o item é de quem está logado. */
  quem?: string;
  /** Por que o item está assim. Uma frase, e não um parágrafo. */
  porque: string;
  /** O que dá para fazer, em passos. Ausente quando não há nada a fazer. */
  oQueFazer?: readonly string[];
  /**
   * Os campos que o servidor apontou no 422, cada um com a frase dele.
   *
   * Existe porque o cartão dizia "Alguns campos precisam ser corrigidos." e
   * mais nada, com a lista exata do que corrigir chegando no mesmo corpo e
   * sendo guardada na fila desde 09/09/2026. O agente lia a frase seca, em pé,
   * sem ter como agir. O rótulo é o do pacote compartilhado, o mesmo do painel.
   */
  campos?: ReadonlyArray<{ rotulo: string; mensagem: string }>;
};

/**
 * O cartão de uma devolução, estado por estado.
 *
 * Separado de `descreverEstado` para caber a explicação de cada desfecho sem
 * transformar aquele `switch` num labirinto de ternários, que foi exatamente
 * como o estado "arquivado" nasceu sem desenho próprio.
 */
function descreverDevolucao(
  item: ItemDeDevolucao,
  pausadaPor: MotivoDeSessao | null = null,
): EstadoDoItem {
  const motivo = ROTULO_MOTIVO_DE_DEVOLUCAO[item.devolucao.motivo];
  switch (item.estado) {
    case "pendente":
      /*
        A DEVOLUÇÃO TAMBÉM PARA NA PAUSA DA SESSÃO, e "vai sair quando houver
        sinal" é a promessa que a pausa quebra: o servidor já respondeu que a
        sessão acabou, que a conta foi desativada ou que a senha é provisória, e
        repetir não muda isso. A frase é a do cartão da coleta
        (`frasesDaPausa`), a mesma da faixa do topo (V2-F00-E06, correção 3).
      */
      if (pausadaPor) {
        return {
          rotulo: "Devolução guardada",
          simbolo: "⏸",
          tom: "alerta",
          Icone: IconeAguardando,
          porque: `Motivo: ${motivo}. ${frasesDaPausa(pausadaPor).doCartao}`,
        };
      }
      return {
        rotulo: "Devolução aguardando",
        simbolo: "…",
        tom: "neutro",
        Icone: IconeAguardando,
        porque: item.tentativas === 0
          ? `Motivo: ${motivo}. Ainda não saiu do aparelho, e vai sair quando `
            + "o aplicativo estiver aberto e houver sinal. A tarefa já saiu da sua lista."
          : `Motivo: ${motivo}. Já tentou ${item.tentativas}x e vai continuar `
            + "tentando enquanto o aplicativo estiver aberto. Até ela chegar, a "
            + "coordenação não sabe que esta tarefa voltou.",
      };
    case "enviando":
      return {
        rotulo: "Devolução saindo", simbolo: "↑", tom: "neutro", Icone: IconeEnvio,
        porque: `Motivo: ${motivo}. Saindo do aparelho agora.`,
      };
    case "confirmado":
      return {
        rotulo: "Devolvida",
        simbolo: "✓",
        tom: "ok",
        Icone: IconeSucesso,
        porque:
          "A coordenação recebeu e a ocorrência voltou para quem despacha. Some "
          + "desta lista em instantes.",
      };
    /*
      Recusada, e a tarefa JÁ VOLTOU para a lista de tarefas. Dizer isso aqui não
      é redundância: sem a frase, o agente lê "precisa de atenção" e não sabe se
      a tarefa continua com ele ou não, que é a única coisa que ele precisa
      decidir agora. E ela é PASSO, e não explicação: é o que ele faz a seguir.
    */
    case "bloqueado":
    case "arquivado":
      return {
        rotulo: "Devolução recusada",
        simbolo: "!",
        tom: "perigo",
        Icone: IconePerigo,
        porque: item.ultimaFalha?.mensagem
          ?? "O servidor recusou a devolução por um motivo que repetir não resolve.",
        oQueFazer: [
          "A tarefa voltou para a sua lista: ou você a vistoria, ou tenta devolver "
          + "de novo por aqui.",
        ],
      };
  }
}

/**
 * O que se perdeu desta coleta, separado por papel.
 *
 * A conta de QUANTOS vem de `evidenciasPerdidasDoItem`, no pacote, e nunca de
 * um filtro escrito aqui: é a mesma linha que o dreno usa para decidir o que
 * pode subir sem os bytes. Duas contas para o mesmo fato divergem na primeira
 * pressa, e a divergência aqui seria a tela perguntando "enviar sem 2
 * registros?" para uma coleta que vai subir sem três.
 *
 * A ASSINATURA SAI SEPARADA DAS FOTOS, e essa separação é a parte cara. Somada
 * ao número, ela viraria "3 registros" e a tela nunca diria a única coisa que
 * muda o documento: quando o arquivo que sumiu é o traço de quem estava no
 * local, o laudo imprime a linha de assinatura em branco. Em branco, ela é
 * indistinguível de uma vistoria em que ninguém assinou, que é a lacuna mais
 * grave que aquele documento pode ter. O laudo declara a causa (ver
 * `blocoEvidenciasPerdidas`, na API), e quem autoriza a declaração precisa ter
 * lido que ela vai existir.
 */
function perdaDeRegistro(item: ItemFila): {
  quantas: number; fotos: number; assinatura: boolean;
} {
  const perdidas = evidenciasPerdidasDoItem(item);
  return {
    quantas: perdidas.length,
    fotos: perdidas.filter((f) => f.papel === "foto").length,
    assinatura: perdidas.some((f) => f.papel === "assinatura"),
  };
}

/**
 * "1 registro" ou "N registros", num lugar só.
 *
 * A contagem aparece em quatro frases desta tela (o rótulo do botão para quem
 * ouve, a pergunta do diálogo, o texto dele e a confirmação do toque), e o
 * plural escrito à mão em quatro lugares é o tipo de coisa que sai certa em
 * três e errada na quarta, sempre na que ninguém abre.
 */
function registros(quantos: number): string {
  return quantos === 1 ? "1 registro" : `${quantos} registros`;
}

/** Uma frase só, dizendo o que sumiu, com o nome de cada coisa. */
function frasePerda(perda: { fotos: number; assinatura: boolean }): string {
  const fotos = perda.fotos === 1
    ? "1 fotografia"
    : `${perda.fotos} fotografias`;
  if (perda.assinatura && perda.fotos === 0) {
    return "A assinatura de quem estava no local não está mais neste aparelho, e "
      + "não há como recuperá-la.";
  }
  if (perda.assinatura) {
    return `A assinatura de quem estava no local e ${fotos} desta vistoria não estão `
      + "mais neste aparelho, e não há como recuperá-las.";
  }
  return perda.fotos === 1
    ? "1 fotografia desta vistoria não está mais neste aparelho, e não há como "
      + "recuperá-la."
    : `${fotos} desta vistoria não estão mais neste aparelho, e não há como `
      + "recuperá-las.";
}

/**
 * A coleta travada porque um arquivo sumiu do aparelho, que é o único estado
 * desta tela em que a decisão é da PESSOA e não do sistema.
 *
 * Separado do resto de "bloqueado" por três razões, e nenhuma é organização de
 * código:
 *
 * 1. **O rótulo não podia continuar "Precisa de atenção".** Atenção é olhar;
 *    aqui é decidir, e ninguém além do agente pode. Enquanto os dois estados
 *    dividiram a mesma palavra, esta coleta ficava no meio de uma lista de
 *    problemas de servidor esperando alguém tentar de novo, e tentar de novo
 *    nunca vai resolver: arquivo apagado não volta.
 * 2. **A frase do motor tinha quarenta palavras.** Ela diz a coisa certa (o
 *    número, e que dá para enviar sem), e num nó só ela é o parágrafo que esta
 *    tela inteira existe para não ter. Aqui ela se distribui: o número e o que
 *    sumiu viram o POR QUÊ, a saída vira o passo, e o botão vira botão.
 * 3. **A saída não pode ser um toque.** O laudo passa a declarar a perda e a
 *    trilha é append-only: o que for autorizado aqui não se reescreve. Por isso
 *    o botão abre pergunta, e a pergunta diz o número e o que o documento vai
 *    dizer.
 */
function descreverPerdaDeRegistro(item: ItemFila): EstadoDoItem {
  return {
    rotulo: "Precisa de decisão",
    /*
      Símbolo e desenho continuam os de perigo, e o tom também: o cartão ainda
      é o único da lista que pede o dedo do agente, e trocar a cor aqui tiraria
      dele o peso que a régua de densidade reserva justamente para este caso.
      O que muda é a PALAVRA, que é o canal que diz o que se espera de quem lê.
    */
    simbolo: "!",
    tom: "perigo",
    Icone: IconePerigo,
    porque: frasePerda(perdaDeRegistro(item)),
    /*
      "Você pode", e nunca "Envie". Quem decide é o agente: o aplicativo sabe
      que o arquivo acabou e não sabe o que aquela fotografia provava. Um passo
      no imperativo seria o produto empurrando a perda de prova, e a perda vira
      frase num documento com brasão assinado por quem esteve no local.
    */
    oQueFazer: [
      "Você pode enviar a vistoria assim mesmo: o resto da coleta sobe inteiro, "
      + "e o laudo declara a perda.",
    ],
  };
}

/** O primeiro nome, que é como o colega é chamado no plantão. */
function primeiroNome(nome: string): string {
  return nome.trim().split(/\s+/)[0] ?? nome;
}

function descreverEstado(
  item: ItemFila,
  autoria: Autoria,
  pausadaPor: MotivoDeSessao | null = null,
): EstadoDoItem {
  /*
    A AUTORIA VEM ANTES DO ESTADO, e a ordem é o conteúdo.

    Um item de outro agente fica em `pendente` no disco, e "Aguardando" prometia
    que ele sai assim que houver sinal. Não sai: o dreno não toca em coleta que
    não é de quem está logado, porque o servidor tira o autor da vistoria de
    quem apresentou o token. Mostrar a promessa da espera aqui seria a mesma
    mentira de sempre, só que na tela em vez de no laudo.

    Este é o cartão que tinha quarenta e cinco palavras num parágrafo só, e é o
    que mais ganha com a separação: o nome de quem coletou é a primeira coisa
    que o agente precisa ler, e estava na quinta linha.
  */
  if (autoria === "de_outro" && item.autor) {
    return {
      rotulo: "De outro agente",
      simbolo: "⏸",
      tom: "alerta",
      Icone: IconeEquipe,
      /*
        A devolução também é uma declaração assinada: quem devolveu responde
        pelo ato na trilha, que é append-only. Enviá-la com a credencial de
        quem está no aparelho agora atribuiria a decisão à pessoa errada, do
        mesmo jeito que o laudo com autor trocado.
      */
      quem: item.tipo === "devolucao"
        ? `Devolvida por ${item.autor.nome}`
        : `Coletada por ${item.autor.nome}`,
      porque: item.tipo === "devolucao"
        ? "Ela só pode ser enviada pela conta de quem decidiu devolver, porque é "
          + "esse nome que vai para a coordenação."
        : "Ela só pode ser enviada pela conta de quem fez a vistoria, porque é "
          + "esse nome que vai para o laudo.",
      oQueFazer: [
        `Peça para ${primeiroNome(item.autor.nome)} entrar neste aparelho com sinal.`,
        "Se isso não for possível, avise a coordenação e informe o protocolo acima.",
      ],
    };
  }

  /*
    A DEVOLUÇÃO TEM AS PALAVRAS DELA, e não as da coleta.

    "Aguardando", no cartão de uma devolução, seria lido como vistoria esperando
    envio, e é o contrário: aqui o agente está dizendo que NÃO vistoriou. Um
    rótulo que descreve outro ato é uma frase falsa numa tela que existe para
    dissolver a dúvida "cadê o que eu fiz?".
  */
  if (item.tipo === "devolucao") {
    return descreverDevolucao(item, autoria === "propria" ? pausadaPor : null);
  }
  /*
    A COLETA GUARDADA PELA PAUSA DA SESSAO: "Aguardando" prometeria que ela sai
    assim que houver sinal, e nao sai: o servidor ja respondeu que a sessao
    acabou (ou que a conta foi desativada), e repetir nao muda isso. O estado
    do disco continua `pendente`, de proposito, e e so a frase que muda.
  */
  if (pausadaPor && autoria === "propria" && item.estado === "pendente") {
    return {
      rotulo: "Guardada",
      simbolo: "⏸",
      tom: "alerta",
      Icone: IconeAguardando,
      porque: frasesDaPausa(pausadaPor).doCartao,
    };
  }
  if (autoria === "sem_autor") {
    return {
      rotulo: "Sem autor registrado",
      simbolo: "?",
      tom: "alerta",
      Icone: IconeAlerta,
      porque:
        "Esta coleta ficou guardada por uma versão anterior do aplicativo, que não "
        + "registrava quem tinha feito a vistoria.",
      oQueFazer: [
        "Se ela é sua, toque em \"Esta coleta é minha\" para enviá-la com o seu "
        + "nome no laudo.",
        "Se não for sua, avise a coordenação antes de descartar.",
      ],
    };
  }

  switch (item.estado) {
    case "pendente":
      return {
        rotulo: "Aguardando",
        simbolo: "…",
        tom: "neutro",
        Icone: IconeAguardando,
        porque: item.tentativas === 0
          ? "Ainda não saiu do aparelho. Vai sair quando o aplicativo estiver aberto e houver sinal."
          : item.tentativas < TENTATIVAS_ATE_AVISAR
            ? `Já tentou ${item.tentativas}x. Vai tentar de novo em instantes, enquanto `
              + "o aplicativo estiver aberto."
            /*
              Muitas tentativas não viram acusação nem convite ao descarte: a
              coleta continua tentando, e o que falta é sinal. A frase diz
              isso COM a condição (enquanto o aplicativo estiver aberto):
              "sozinha" sem ela sugeria tentativa com o aplicativo fechado, que
              não existe (V2-F00-E16, correção 2). A única ação que resolve saiu
              do fim do parágrafo e virou passo.
            */
            : `Já tentou ${item.tentativas}x e vai continuar tentando enquanto o `
              + "aplicativo estiver aberto. A conexão daqui não está completando o envio.",
        oQueFazer: item.tentativas >= TENTATIVAS_ATE_AVISAR
          ? ["Procure um lugar com sinal melhor ou uma rede Wi-Fi que funcione."]
          : undefined,
      };
    case "enviando":
      return {
        rotulo: "Enviando", simbolo: "↑", tom: "neutro", Icone: IconeEnvio,
        porque: "Saindo do aparelho agora.",
      };
    case "confirmado":
      return {
        rotulo: "Enviada",
        simbolo: "✓",
        tom: "ok",
        Icone: IconeSucesso,
        porque: "A coordenação recebeu. Some desta lista em instantes.",
      };
    case "bloqueado":
      /*
        A perda de arquivo vem ANTES do bloqueio genérico, e a ordem é o
        conteúdo: ela é o único bloqueio desta tela que tem saída pela mão do
        agente, e a frase genérica ("repetir não resolve") mandaria esperar por
        alguém que não existe.
      */
      if (item.ultimaFalha?.codigo === CODIGO_ARQUIVO_SUMIU) {
        return descreverPerdaDeRegistro(item);
      }
      /*
        A RECUSA DO DADO, com os campos, e o botão de editar como saída.

        Vistoria 000009/2026, 15/09/2026, nas capturas do dono: o servidor
        recusou a fotografia com 422 três vezes, e o cartão mostrava "Precisa
        de atenção", "Alguns campos precisam ser corrigidos.", "Tentar de novo"
        e "Descartar". Nenhum campo, nenhum jeito de editar. A lista de campos
        chegava no corpo do 422 e estava guardada em `ultimaFalha.campos` desde
        09/09/2026, e ninguém a desenhava.

        "Correção", e não "atenção": atenção é olhar, e aqui é editar. O passo
        diz o que o botão faz e o que NÃO acontece (nada duplica, porque a
        chave é a mesma), que é a dúvida de quem já viu esta fila criar laudo
        duplo uma vez.
      */
      if (item.ultimaFalha && recusaEstaNoDado(item.ultimaFalha)) {
        const campos = item.ultimaFalha.campos;
        return {
          rotulo: "Precisa de correção",
          simbolo: "!",
          tom: "perigo",
          Icone: IconePerigo,
          porque: campos.length === 0
            ? item.ultimaFalha.mensagem
            : campos.length === 1
              ? "O servidor recusou 1 campo desta vistoria. Ele está listado abaixo."
              : `O servidor recusou ${campos.length} campos desta vistoria. Eles estão listados abaixo.`,
          campos: campos.map((c) => ({ rotulo: rotuloDoCampo(c.campo), mensagem: c.mensagem })),
          oQueFazer: [
            "Toque em \"Corrigir a vistoria\": ela volta para a tela de coleta com tudo "
            + "preenchido, para ajustar só o que está marcado.",
            "Ao concluir de novo, o envio usa a mesma chave: nada duplica no servidor.",
          ],
        };
      }
      return {
        rotulo: "Precisa de atenção",
        simbolo: "!",
        tom: "perigo",
        Icone: IconePerigo,
        /*
          O 404 ganha frase própria, e não a do servidor.

          "Ocorrência não encontrada" não diz nada a quem está na rua, e o
          aplicativo não tem como saber o motivo: a API responde 404 (nunca 403)
          também para recurso de outro município, justamente para não confirmar
          que ele existe. Então a frase diz o que se sabe e o passo diz o que
          fazer, em vez de inventar um motivo como o "Arquivada" fazia.
        */
        porque: item.ultimaFalha?.codigo === "nao_encontrada"
          ? "O servidor não encontrou esta ocorrência para a sua conta."
          : item.ultimaFalha?.mensagem
            ?? "O servidor recusou por um motivo que repetir não resolve.",
        oQueFazer: item.ultimaFalha?.codigo === "nao_encontrada"
          ? [
            "Fale com a coordenação e informe o protocolo acima antes de "
            + "descartar: a coleta continua guardada aqui.",
          ]
          : undefined,
      };
    /*
      Coleta arquivada é a que perdeu o destino: a ocorrência foi encerrada no
      painel enquanto ela esperava sinal. Precisa de rótulo próprio porque
      "Precisa de atenção" seria mentira duas vezes: o agente não errou nada, e
      não existe nada que ele possa fazer para o envio passar.

      O caso não é decoração. Sem ele o `switch` fica sem saída para um estado
      que já existe no motor, e a tela renderiza um cartão sem rótulo nem
      explicação para uma coleta que a pessoa acabou de fazer, que é
      exatamente a dúvida ("cadê a minha vistoria?") que esta tela existe para
      dissolver.
    */
    case "arquivado":
      return {
        rotulo: "Arquivada",
        /*
          Símbolo, desenho e tom próprios, e não os de "Aguardando". Arquivada
          não é uma espera mais longa: é uma coleta que perdeu o destino e nunca
          vai chegar. Repetir o desenho da espera aqui seria prometer ao agente
          uma entrega que não vem.
        */
        simbolo: "✕",
        tom: "alerta",
        Icone: IconeArquivado,
        porque: item.ultimaFalha?.mensagem
          ?? "A ocorrência foi encerrada no painel enquanto esta coleta esperava sinal. "
             + "Ela fica guardada aqui como registro do que foi feito.",
      };
  }
}

/**
 * O bloco "o que fazer", que é a metade operacional do texto.
 *
 * Ele tem fundo próprio de propósito: o que o agente precisa FAZER não pode
 * ter o mesmo peso visual da explicação de por que aquilo aconteceu. Antes os
 * dois eram o mesmo parágrafo cinza, e a instrução ficava no fim dele.
 *
 * Numeração só quando há mais de um passo. Um "1." sozinho é ruído, e dois
 * passos sem número viram um parágrafo de novo, que é justamente o que se está
 * desfazendo aqui.
 */
function OQueFazer({ passos, testID }: { passos: readonly string[]; testID?: string }) {
  const tema = useTema();
  return (
    <View
      testID={testID}
      style={{
        backgroundColor: tema.superficie2,
        borderRadius: raio.normal,
        padding: espaco.e3,
        gap: espaco.e2,
      }}
    >
      <View style={{ flexDirection: "row", alignItems: "center", gap: espaco.e2 }}>
        {/* O desenho é a segunda pista da palavra ao lado, nunca o lugar dela.
            Escondido do leitor de tela porque "O que fazer" já está escrito. */}
        <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
          <IconeInformacao cor={tema.textoDiscreto} tamanho={tamanhoDeIcone.rotulo} />
        </View>
        <Txt variante="corpoP" peso={peso.forte}>O que fazer</Txt>
      </View>
      {passos.map((passo, i) => (
        <View key={passo} style={{ flexDirection: "row", gap: espaco.e2 }}>
          {passos.length > 1 && (
            <Txt variante="corpoP" mono discreto>{`${i + 1}.`}</Txt>
          )}
          <View style={{ flex: 1 }}>
            <Txt variante="corpoP">{passo}</Txt>
          </View>
        </View>
      ))}
    </View>
  );
}

/**
 * A lista do que o servidor recusou, um campo por linha.
 *
 * Sem fundo semântico de propósito: o cartão da coleta parada já tem o selo
 * vermelho como único bloco preenchido (R1 da régua em `ui/regua.ts`), e uma
 * segunda mancha pintada a três linhas dele foi defeito medido nesta tela. O
 * que marca cada linha é o desenho de alerta em cor discreta, e a hierarquia
 * vem do peso: o rótulo forte, a frase do servidor logo abaixo.
 */
function CamposRecusados({ campos }: {
  campos: ReadonlyArray<{ rotulo: string; mensagem: string }>;
}) {
  const tema = useTema();
  return (
    <View
      accessibilityRole="list"
      style={{
        backgroundColor: tema.superficie2,
        borderRadius: raio.normal,
        padding: espaco.e3,
        gap: espaco.e2,
      }}
    >
      {campos.map((c, i) => (
        <View
          key={`${c.rotulo}-${i}`}
          accessible
          accessibilityLabel={`${c.rotulo}: ${c.mensagem}`}
          style={{ flexDirection: "row", gap: espaco.e2, alignItems: "flex-start" }}
        >
          <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
            <IconeAlerta cor={tema.textoDiscreto} tamanho={tamanhoDeIcone.rotulo} />
          </View>
          <View style={{ flex: 1, gap: espaco.e1 }}>
            <Txt variante="corpoP" peso={peso.forte}>{c.rotulo}</Txt>
            <Txt variante="corpoP" discreto>{c.mensagem}</Txt>
          </View>
        </View>
      ))}
    </View>
  );
}

/**
 * O cabeçalho de uma seção, que deixou de ser um `h2` solto no meio do fluxo.
 *
 * As quatro seções desta tela são semanticamente MUITO diferentes (o que é meu
 * e vai sair, o que eu devolvi, o que é de outra pessoa, e o que já não tem
 * para onde ir) e se distinguiam só por um texto de vinte e um pontos. Três
 * coisas resolvem isso sem barulho: a régua acima, que declara onde uma seção
 * termina e a outra começa; o desenho, que dá identidade à seção antes da
 * leitura; e o contador em pílula, que tira o número de dentro da frase.
 *
 * O contador é lido junto com o título pelo leitor de tela, numa frase só: dois
 * elementos separados fariam o leitor anunciar "Arquivadas" e, depois, um "3"
 * solto sem dono.
 */
function Secao({ Icone, titulo, quantos, children }: {
  Icone: ComponenteDeIcone;
  titulo: string;
  quantos: number;
  children: ReactNode;
}) {
  const tema = useTema();
  return (
    <View style={{ gap: espaco.e3 }}>
      {/* A régua. Ela é o que faz duas seções vizinhas pararem de parecer uma
          lista só com um texto maior no meio. */}
      <View style={{ height: borda.fio, backgroundColor: tema.borda }} />
      <View
        /*
          `accessible` junta o desenho, o título e o contador num elemento só.
          Sem ele o leitor de tela percorre três paradas (um SVG mudo, o texto e
          um número solto) e o papel de cabeçalho não chega a lugar nenhum.
        */
        accessible
        accessibilityRole="header"
        accessibilityLabel={`${titulo}, ${quantos === 1 ? "1 item" : `${quantos} itens`}`}
        style={{ flexDirection: "row", alignItems: "center", gap: espaco.e3 }}
      >
        <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
          <Icone cor={tema.textoDiscreto} tamanho={tamanhoDeIcone.acao} />
        </View>
        <Txt variante="h3">{titulo}</Txt>
        <View style={{ flex: 1 }} />
        <View
          style={{
            backgroundColor: tema.superficie2,
            borderRadius: raio.pilula,
            paddingHorizontal: espaco.e3,
            paddingVertical: espaco.e1,
          }}
        >
          <Txt variante="corpoP" mono negrito discreto>{String(quantos)}</Txt>
        </View>
      </View>
      {children}
    </View>
  );
}

/*
  O CARTÃO QUE SAI MUDOU DE ENDEREÇO, e o porquê vale mais que a mudança.

  Ele nasceu aqui, e enquanto morou aqui foi a única lista do aplicativo com
  saída desenhada: a de tarefas continuou perdendo item no quadro seguinte, e
  lá o item que some acabou de ser DEVOLVIDO para a coordenação. Duas listas
  vizinhas com saídas diferentes (ou com uma saída e um corte seco) é o defeito
  que ninguém relata e todo mundo sente. Agora as duas chamam a mesma peça, em
  `ui/ItemDeLista.tsx`.
*/

/**
 * A FILA ZERADA, que é o clímax desta tela e o momento assinatura do produto.
 *
 * `movimento.climax` existe, nas palavras do próprio `tokens.ts`, "para um
 * momento só: a fila esvaziando". É este. O agente subiu o morro, coletou sem
 * sinal e desceu sem saber se o trabalho chegou; a lista zerando é a resposta.
 *
 * ## Por que ele não dispara à toa, que é a metade que faltava
 *
 * Havia DOIS canais comemorando o mesmo fato aqui, e só um deles tinha guarda.
 * O retorno tátil já exigia a TRANSIÇÃO (`tinhaAlgo && novos.length === 0`),
 * pela razão escrita na própria `FaixaDeSincronizacao`: um aparelho que vibra
 * toda vez que a pessoa entra na aba ensina depressa a ignorar a vibração. O
 * movimento não exigia nada: ele rodava na montagem, ou seja, ABRIR a aba com a
 * fila já vazia produzia a comemoração inteira, e DESCARTAR o último item
 * (jogar fora trabalho feito) produzia exatamente a mesma, enquanto o aparelho
 * ficava calado de propósito. Dois canais para um fato só, um guardado e o
 * outro não, na tela que o `CLAUDE.md` chama de clímax da demonstração.
 *
 * Agora os dois saem da MESMA decisão, tomada uma vez em `recarregar`. E ela é
 * lida UMA vez aqui dentro, como no `ItemDeLista`: enquanto o gesto roda, a
 * tela já pode ter relido a fila e a propriedade já virou falsa, e ler o valor
 * corrente a cada quadro interromperia a comemoração no meio dela.
 *
 * ## Os dois movimentos, e por que são dois
 *
 * O bloco CHEGA (sobe e aparece, com `easing.entrada`, que desacelera e assenta)
 * e o emblema ASSENTA COM EXCESSO (`easing.climax`, a única curva do produto que
 * passa do alvo e volta, e que o `tokens.ts` reserva para este momento). A
 * diferença entre "o estado mudou" e "conseguimos" está no segundo; o primeiro
 * é o que impede o segundo de parecer um piscar fora de contexto.
 *
 * Os dois rodam em paralelo, com `useNativeDriver`, sobre opacidade e
 * transformação: a linha de JavaScript deste aplicativo pode estar ocupada
 * drenando a fila neste exato instante, e uma comemoração travada é pior que
 * nenhuma. Nada de confete, som ou parallax, que continuam proibidos sem
 * exceção.
 */
function FilaZerada({ comemorar, children }: {
  comemorar: boolean;
  /*
    O conteúdo recebe a escala do emblema, em vez de a peça montá-lo.

    A razão é de faixa: o emblema mora DENTRO do círculo que o `Vazio` desenha,
    e `Vazio` recebe o ícone como nó pronto. `src/ui/` não se toca nesta frente,
    então quem desenha o estado vazio entrega o desenho já animado, e esta peça
    continua sendo só o movimento.
  */
  children: (escalaDoEmblema: Animated.Value) => ReactNode;
}) {
  const reduzirMovimento = useReducaoDeMovimento();
  const animar = useRef(comemorar && !reduzirMovimento).current;
  const chegada = useRef(new Animated.Value(animar ? 0 : 1)).current;
  const emblema = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (!animar) return;
    Animated.parallel([
      Animated.timing(chegada, {
        toValue: 1,
        duration: movimento.climax,
        easing: Easing.bezier(...easing.entrada),
        useNativeDriver: true,
      }),
      Animated.sequence([
        Animated.timing(emblema, {
          toValue: SALTO_DO_EMBLEMA,
          duration: movimento.climax * SUBIDA_DO_EMBLEMA,
          easing: Easing.bezier(...easing.climax),
          useNativeDriver: true,
        }),
        Animated.timing(emblema, {
          toValue: 1,
          duration: movimento.climax * (1 - SUBIDA_DO_EMBLEMA),
          easing: Easing.bezier(...easing.entrada),
          useNativeDriver: true,
        }),
      ]),
    ]).start();
  }, [animar, chegada, emblema]);

  return (
    <Animated.View
      style={{
        opacity: chegada,
        transform: [
          /* Ele SOBE para o lugar, e não cresce do nada: crescer é o gesto que
             `ItemDeLista` já usa para item entrando e saindo, e repeti-lo aqui
             faria o momento mais importante da tela parecer mais um item. */
          { translateY: chegada.interpolate({ inputRange: [0, 1], outputRange: [espaco.e5, 0] }) },
        ],
      }}
    >
      {children(emblema)}
    </Animated.View>
  );
}

export default function TelaDaFila() {
  const sinal = useSinal();
  // A pílula do menu paira sobre a cena; a tela reserva o vão no fim da rolagem.
  const recuoDoMenu = useRecuoDoMenu();
  // Toda aba começa do topo a cada foco (ver `ui/CenaDaAba.tsx`).
  const rolagem = useComecarDoTopo<ScrollView>();
  const { obterToken, lerIdentidade, identidade, encerrarSessaoVencida } = useSessao();
  const tema = useTema();
  const reduzirMovimento = useReducaoDeMovimento();

  const [fila, setFila] = useState<FilaDeSincronizacao | null>(null);
  const [itens, setItens] = useState<ItemFila[] | null>(null);
  const [sincronizando, setSincronizando] = useState(false);
  /*
    A fila esta parada pela SESSAO desta pessoa (401 `sessao_encerrada` ou 403
    `conta_desativada`, V2-F00-E06). Vem do resumo que a fila avisa a cada
    mudanca, e nao da lista de itens: a pausa e do servidor naquele momento, nao
    de nenhuma coleta, e nenhum item carrega marca dela.
  */
  const [pausadaPor, setPausadaPor] = useState<MotivoDeSessao | null>(null);
  /*
    Os itens que JÁ saíram do disco e ainda estão desaparecendo da tela.

    Eles não entram em contagem nenhuma: para a tela, eles já foram. O que
    sobra deles é o desenho saindo, e por isso a lista visível é a união das
    duas, enquanto os números vêm só da primeira.
  */
  const [saindo, setSaindo] = useState<ItemFila[]>([]);
  /*
    Qual item está sendo perguntado, e não "o diálogo está aberto".

    Guardar o item inteiro em vez de uma bandeira é o que permite o diálogo
    dizer o protocolo, que é a única coisa que distingue uma coleta da outra
    nesta lista. Enquanto isto vale `null`, nada foi descartado: o descarte
    acontece só no toque do botão, e é isso que o teste desta tela cobra.
  */
  const [aDescartar, setADescartar] = useState<ItemFila | null>(null);
  /*
    Qual coleta está sendo perguntada sobre os registros que se perderam.

    Mesmo desenho do descarte, e pela mesma razão: o item inteiro, e não uma
    bandeira, porque a pergunta precisa dizer o protocolo e QUANTOS registros
    sumiram. E, como lá, enquanto isto vale `null` nada foi autorizado: o que a
    trilha vai guardar para sempre acontece no toque do botão do diálogo.
  */
  const [aAbrirMao, setAAbrirMao] = useState<ItemFila | null>(null);
  /*
    A FILA ACABOU DE ZERAR NESTA TELA, e não "a fila está vazia".

    Uma decisão só, tomada em `recarregar`, para os DOIS canais que comemoram: a
    vibração e o movimento. Enquanto foram duas, a vibração exigia a transição e
    o movimento rodava na montagem, então abrir a aba com a fila já vazia
    comemorava com a tela e ficava calado no bolso, dizendo duas coisas
    diferentes sobre o mesmo fato.
  */
  const [zerouAgora, setZerouAgora] = useState(false);
  /*
    O RETORNO DO TOQUE, por item.

    "Tentar de novo" e "Esta coleta é minha" executavam e recarregavam a lista
    sem marca nenhuma na tela. Quando o reenvio falha de novo (que é o caso
    comum: o que falta é sinal) nada muda, e quem tocou não tem como saber se o
    toque pegou. Aqui ficam as duas metades disso: o que está em curso, que
    apaga o botão e põe a roda nele, e o que acabou de acontecer, que vira uma
    frase dentro do cartão.
  */
  const [emCurso, setEmCurso] = useState<{ id: string; verbo: string } | null>(null);
  /*
    `deuCerto` existe porque nem todo toque desta tela consegue o que pediu.

    "Enviar sem os registros perdidos" passa por um portão no motor (só sai
    coleta bloqueada, com o código certo e com arquivo marcado), e o estado pode
    ter mudado entre a pergunta e a resposta. Sem este campo, a única saída
    seria mostrar o mesmo "Pronto" verde nos dois casos, e uma confirmação que
    afirma o que não aconteceu é pior que confirmação nenhuma: ela é a tela
    mentindo na única tela que existe para não mentir.
  */
  const [retorno, setRetorno] = useState<
    { id: string; texto: string; deuCerto: boolean } | null
  >(null);
  /*
    O agente desistiu de esperar a fila abrir.

    `Carregando` sabe oferecer a saída aos seis segundos, e esta tela nunca
    passava `aoDesistir`, o que desligava metade do componente: a espera
    continuava pendurada e a tela não tinha para onde ir. A contagem existe
    para o efeito de abertura poder rodar de novo quando a pessoa pedir.
  */
  const [desistiu, setDesistiu] = useState(false);
  const [tentativaDeAbrir, setTentativaDeAbrir] = useState(0);

  /*
    A lista da leitura anterior, para saber o que SUMIU.

    Ela é `ref` e não estado porque ninguém desenha a partir dela: ela só serve
    para a comparação de uma leitura para a outra. Como estado, ela dispararia
    uma renderização a mais a cada evento da fila.
  */
  const listaAnterior = useRef<ItemFila[]>([]);
  /*
    Quem JÁ ESTAVA NA TELA, para saber quem chegou.

    É diferente de `listaAnterior`, e a diferença é de MOMENTO: aquela é
    atualizada dentro de `recarregar`, antes de a tela desenhar, então na
    renderização em que a coleta nova aparece ela já contém a coleta nova. Esta
    só é atualizada no efeito abaixo, que roda DEPOIS da pintura, e é por isso
    que a resposta "esta é nova?" sai certa no primeiro quadro, sem piscar.

    Nula até a primeira pintura, e é isso que faz a primeira pintura não animar
    nada: abrir a aba com cinco coletas guardadas não é cinco coletas chegando,
    é o aparelho terminando de ler o disco. É a mesma mecânica da lista de
    tarefas, de propósito: `tokens.ts` pede que as listas do produto entrem
    com o MESMO ritmo.
  */
  const jaVistos = useRef<Set<string> | null>(null);
  const reduzirRef = useRef(reduzirMovimento);
  reduzirRef.current = reduzirMovimento;
  /* Os temporizadores vivos, para o desmonte não deixar nenhum escrevendo
     estado em componente que já saiu da tela. */
  const relogios = useRef<ReturnType<typeof setTimeout>[]>([]);

  const agendar = useCallback((quando: number, oQue: () => void) => {
    const relogio = setTimeout(oQue, quando);
    relogios.current.push(relogio);
  }, []);

  useEffect(() => () => {
    for (const relogio of relogios.current) clearTimeout(relogio);
    relogios.current = [];
  }, []);

  /* Depois de cada pintura, tudo o que está no disco passa a ser "já visto". */
  useEffect(() => {
    if (itens === null) return;
    jaVistos.current = new Set(itens.map((i) => i.id));
  }, [itens]);

  /**
   * Relê a fila inteira do disco.
   *
   * `comemorarSeZerar` é falso só no descarte, e a distinção é de produto: a
   * fila zerar porque o servidor recebeu tudo é o momento que este aplicativo
   * inteiro existe para produzir, e a fila zerar porque o agente jogou o último
   * item fora é o oposto disso. Um retorno tátil igual nos dois casos
   * comemoraria um trabalho apagado.
   */
  const recarregar = useCallback(async (
    f: FilaDeSincronizacao,
    { comemorarSeZerar = true }: { comemorarSeZerar?: boolean } = {},
  ) => {
    const novos = await f.itens();
    const aindaExiste = new Set(novos.map((i) => i.id));
    const sumiram = listaAnterior.current.filter((i) => !aindaExiste.has(i.id));
    const tinhaAlgo = listaAnterior.current.length > 0;
    listaAnterior.current = novos;
    setItens(novos);

    /*
      A GUARDA DE ORIGEM, e ela é a mesma da `FaixaDeSincronizacao`: só
      comemora a TRANSIÇÃO. Abrir a aba com a fila já vazia não é a fila tendo
      esvaziado, e um aparelho que vibra toda vez que o agente entra aqui
      ensina depressa a ignorar a vibração, levando junto os outros três
      momentos em que ela informa alguma coisa.

      UMA decisão, DOIS canais. O tátil sai na hora; o movimento espera o último
      cartão terminar de sair, e por isso precisa ficar guardado.
    */
    const zerou = comemorarSeZerar && tinhaAlgo && novos.length === 0;
    if (zerou) retornoTatil("concluido");
    /*
      A marca vale enquanto a fila continuar vazia, e some quando voltar a ter
      algo.

      Ela não é apagada por uma releitura que chegue no meio do caminho, e isso
      é o que faz o clímax existir: o estado vazio só é montado depois de o
      último cartão terminar de sair (`movimento.mudancaDeEstado`), e a fila
      avisa de novo a cada mudança. Apagar a marca na releitura seguinte
      entregaria o momento mais importante da tela ao acaso do relógio.
    */
    if (novos.length > 0) setZerouAgora(false);
    else if (zerou) setZerouAgora(true);

    /* Com redução de movimento ligada não há saída para animar: o item some na
       hora, que é exatamente o que quem ligou a opção pediu. */
    if (sumiram.length === 0 || reduzirRef.current) return;
    setSaindo((antes) => [...antes, ...sumiram]);
    const idsQueSaem = new Set(sumiram.map((i) => i.id));
    agendar(movimento.mudancaDeEstado, () => {
      setSaindo((antes) => antes.filter((i) => !idsQueSaem.has(i.id)));
    });
  }, [agendar]);

  useEffect(() => {
    let vivo = true;
    let desassinar: (() => void) | undefined;
    void (async () => {
      const f = await obterFila(enderecoDaApi(), obterToken, lerIdentidade);
      if (!vivo) return;
      setFila(f);
      await recarregar(f);
      // A fila avisa a cada mudança de estado; a tela relê a lista inteira.
      // Reler tudo é barato aqui, e evita o estado da tela divergir do disco.
      desassinar = f.assinar((resumo) => {
        setPausadaPor(resumo?.pausadaPor ?? null);
        void recarregar(f);
      });
    })();
    return () => { vivo = false; desassinar?.(); };
  }, [obterToken, lerIdentidade, recarregar, tentativaDeAbrir]);

  async function sincronizarAgora(): Promise<void> {
    if (!fila) return;
    setSincronizando(true);
    try {
      await fila.drenar();
    } finally {
      setSincronizando(false);
      await recarregar(fila);
    }
  }

  /**
   * Um verbo do cartão, com começo e fim visíveis.
   *
   * O começo é a roda dentro do próprio botão que foi tocado (e não uma roda no
   * topo da tela, que fica fora do campo de visão de quem acabou de tocar aqui
   * embaixo). O fim é uma frase dentro do cartão, que some sozinha. Sem os
   * dois, um reenvio que falha de novo é indistinguível de um toque que não
   * pegou.
   *
   * **A FRASE SAI DE QUEM EXECUTOU O ATO**, e não de um literal escolhido antes
   * de ele acontecer. Enquanto ela veio de fora, ela só podia descrever a
   * intenção: dizia "pronto" mesmo quando o motor tinha recusado, e não tinha
   * como citar um número que só existe depois da chamada. "Enviar sem os
   * registros perdidos" precisa das duas coisas, porque o número que a tela
   * mostrou na pergunta e o número que o motor de fato abriu mão podem ser
   * diferentes, e quem manda é o segundo.
   */
  async function agir(
    item: ItemFila,
    verbo: string,
    oQue: () => Promise<{ texto: string; deuCerto: boolean }>,
  ) {
    setEmCurso({ id: item.id, verbo });
    setRetorno(null);
    try {
      const desfecho = await oQue();
      if (fila) await recarregar(fila);
      setRetorno({ id: item.id, ...desfecho });
      agendar(RETORNO_NA_TELA_MS, () => { setRetorno(null); });
    } catch {
      /*
        O VERBO QUE ESTOURA, e não o que é recusado.

        `deuCerto: false` já cobria a recusa do motor, que é uma resposta. Isto
        aqui é a AUSÊNCIA de resposta: a gravação no SQLite estourou (disco do
        telefone cheio, banco corrompido) antes de o ato acontecer. Sem este
        ramo o `finally` parava a roda do botão e mais nada mudava na tela, ou
        seja, um toque que falhou e um toque que não pegou eram a mesma coisa,
        que é exatamente o que esta tela existe para não produzir.

        A frase não inventa motivo: o aplicativo sabe que não conseguiu, e não
        sabe por quê. O que ela garante é a única coisa que importa aqui, e é a
        promessa da tela inteira: a coleta continua guardada.
      */
      setRetorno({
        id: item.id,
        deuCerto: false,
        texto: "Este aparelho não conseguiu completar a ação, e nada foi enviado. "
          + "A coleta continua guardada aqui. Tente de novo.",
      });
      agendar(RETORNO_NA_TELA_MS, () => { setRetorno(null); });
    } finally {
      setEmCurso(null);
    }
  }

  /**
   * "Corrigir a vistoria": a coleta parada volta a ser rascunho e a tela de
   * vistoria abre.
   *
   * Passa por `agir` para ter começo e fim visíveis como os outros verbos, e a
   * frase de "nada mudou" sai do motivo que o motor devolveu, e não de um
   * literal: a recusa do motor é resposta, e a resposta precisa chegar a quem
   * tocou. Quando dá certo, a confirmação é a própria tela de vistoria abrindo
   * com tudo preenchido; ainda assim a frase fica gravada no cartão, para o
   * caso de a navegação demorar num aparelho fraco.
   *
   * Sem pergunta antes, de propósito: corrigir não destrói nada (a coleta vira
   * rascunho, com a mesma chave), e transformar em pergunta o que não perde
   * nada ensina a confirmar sem ler, o que o descarte, que perde, não pode
   * pagar.
   */
  async function corrigir(item: ItemFila): Promise<void> {
    await agir(item, "corrigir", async () => {
      if (!fila) return { deuCerto: false, texto: "A fila ainda não abriu. Tente de novo." };
      const r = await devolverParaCorrecao(fila, item.id);
      if (!r.retirada) {
        return {
          deuCerto: false,
          texto: r.motivo === "de_outro_autor"
            ? "Só quem fez a vistoria pode corrigi-la: o nome que vai para o laudo é o dela."
            : r.motivo === "nao_esta_parada"
              ? "Esta coleta voltou a esperar envio e não precisa de correção agora."
              : "Esta coleta não está mais na fila. O cartão acima mostra o estado de agora.",
        };
      }
      router.push(`/(agente)/vistoria/${r.coleta.ocorrenciaId}`);
      return {
        deuCerto: true,
        texto: "A vistoria voltou para a tela de coleta, com tudo preenchido. Ao concluir "
          + "de novo, o envio usa a mesma chave.",
      };
    });
  }

  if (!itens) {
    if (desistiu) {
      return (
        <View style={{ padding: espaco.e4 }}>
          <Vazio
            icone={<IconeAlerta cor={tema.destaque} tamanho={tamanhoDeIcone.vazio} />}
            titulo="A fila não abriu"
            descricao={
              "Nada se perdeu: o que estava guardado continua no aparelho e sai "
              + "quando o aplicativo estiver aberto e a conexão voltar. Dá para "
              + "tentar abrir de novo."
            }
            acao={{
              titulo: "Tentar abrir de novo",
              descricao: "Tentar abrir a fila de envio de novo",
              testID: "abrir-a-fila-de-novo",
              onPress: () => {
                setDesistiu(false);
                setTentativaDeAbrir((n) => n + 1);
              },
            }}
          />
        </View>
      );
    }
    return (
      <Carregando
        mensagem="Abrindo a fila"
        rotuloDaSaida="Parar de esperar"
        aoDesistir={() => { setDesistiu(true); }}
      />
    );
  }

  /*
    Quem está logado agora, no formato que o motor da fila compara.

    A comparação em si NÃO é feita aqui: ela mora em `autoriaDaColeta`, no
    pacote, e é a mesma linha que o dreno usa para decidir o que enviar. Duas
    listas para o mesmo fato divergem na primeira pressa, e a divergência aqui
    seria a tela prometer "sai assim que houver sinal" num item que o dreno
    nunca vai tocar.
  */
  const eu = identidade
    ? {
        usuarioId: identidade.usuarioId,
        nome: identidade.nome,
        organizacaoId: identidade.organizacaoId,
      }
    : null;

  /*
    O que a tela DESENHA inclui o que já saiu do disco e ainda está saindo da
    tela; o que a tela CONTA, não. Um item confirmado precisa sumir do número
    no mesmo instante em que a fila o largou, senão o contador mente por um
    quarto de segundo em cima da única tela que existe para não mentir.
  */
  /* O disco manda: um item que voltou para a lista antes de o temporizador
     disparar sai da despedida, senão ele apareceria duas vezes na mesma tela,
     com a mesma chave. */
  const idsNoDisco = new Set(itens.map((i) => i.id));
  const aindaSaindo = saindo.filter((i) => !idsNoDisco.has(i.id));
  const idsSaindo = new Set(aindaSaindo.map((i) => i.id));
  const visiveis = [...itens, ...aindaSaindo];
  const contar = (lista: ItemFila[]) => lista.filter((i) => !idsSaindo.has(i.id)).length;

  /*
    QUEM CHEGOU depois de a lista já estar na tela, e em que ORDEM entra.

    A cascata conta entre os NOVOS, e não pela posição na lista inteira: uma
    coleta só, chegando no fim de uma fila de dez, esperaria o teto inteiro
    antes de aparecer, e a tela ficaria parada justamente quando tem novidade.
    A ordem é a ordem em que os cartões são desenhados (minhas coletas,
    devoluções, de outro agente, arquivadas), para a cascata descer a tela e
    não saltar de seção em seção. `atrasoEmCascata` tem teto próprio, para a
    manhã inteira de vistorias que sobe de uma vez não virar espera.
  */
  const recemChegado = (id: string) => jaVistos.current !== null
    && !jaVistos.current.has(id) && !idsSaindo.has(id);

  const daSessao = visiveis.filter((i) => autoriaDaColeta(i, eu) === "propria");
  const deOutroAutor = visiveis.filter((i) => autoriaDaColeta(i, eu) !== "propria");
  /*
    A DEVOLUÇÃO TEM SEÇÃO PRÓPRIA, e sai das contagens de coleta.

    Somá-la em "3 coletas na fila" seria contar como vistoria um pedido que
    afirma o contrário, e é justamente essa confusão que a tela existe para não
    criar. Seção própria também é o que deixa as frases de coleta intactas: elas
    já dizem a coisa certa sobre coleta.
  */
  const devolucoes = daSessao.filter((i) => i.tipo === "devolucao");
  const coletas = daSessao.filter((i) => i.tipo === "vistoria");
  const bloqueados = coletas.filter((i) => i.estado === "bloqueado");
  const arquivados = coletas.filter((i) => i.estado === "arquivado");
  const emEspera = coletas.filter(
    (i) => i.estado !== "bloqueado" && i.estado !== "arquivado",
  );
  const minhasColetas = [...bloqueados, ...emEspera];

  const ordemDaCascata = new Map<string, number>();
  for (const i of [...minhasColetas, ...devolucoes, ...deOutroAutor, ...arquivados]) {
    if (recemChegado(i.id)) ordemDaCascata.set(i.id, ordemDaCascata.size);
  }

  /*
    A CONFIRMADA TAMBÉM FICA FORA, e essa é a outra metade da mesma regra.

    Ela chegou: o cartão dela diz "Enviada. A coordenação recebeu", e ela fica
    na lista mais meio minuto como lápide, de propósito. Enquanto ela entrou na
    conta, este número dizia "2 coletas na fila" com uma delas já na
    coordenação, enquanto o crachá da aba Envio (que soma pendentes, enviando,
    bloqueados e as de outro autor, e nunca as confirmadas) dizia "1". Dois
    números para o mesmo fato, a um toque um do outro, na tela que o produto
    inteiro existe para tornar confiável. O contador já tinha a regra escrita,
    para os itens que saem do disco ("um item confirmado precisa sumir do
    número no mesmo instante em que a fila o largou"); o que faltava era ela
    valer também enquanto a lápide está de pé.

    O título conta o que ainda tem destino, e a arquivada fica FORA dele.

    Coleta arquivada não vai ser enviada por ninguém: somá-la aqui produzia um
    "3 coletas na fila" que nunca descia para zero, e contador que nunca zera é
    contador que a pessoa aprende a ignorar. Ela tem a própria seção, com o
    próprio número e com saída pelo botão.
  */
  const naFila = contar(minhasColetas.filter((i) => i.estado !== "confirmado"))
    /* Devolução de outro agente existe (aparelho de plantão troca de turno) e
       continua visível na seção dela, mas não entra numa contagem que diz
       "coletas": ela afirma o contrário de uma coleta. */
    + contar(deOutroAutor.filter((i) => i.tipo === "vistoria"));

  /*
    O que o botão "Tentar enviar agora" de fato faz sair.

    Era `itens.length === 0`, o que deixava o botão aceso numa fila que só tinha
    coleta arquivada ou de outro agente: a pessoa tocava, o dreno não pegava
    nada, e a tela não mudava. Botão que responde ao toque sem fazer nada ensina
    a desconfiar da tela inteira.
  */
  const prontasParaSair = [...emEspera, ...devolucoes].filter(
    (i) => !idsSaindo.has(i.id)
      && (i.estado === "pendente" || i.estado === "enviando"),
  ).length;

  /*
    POR QUE O BOTÃO ESTÁ APAGADO, na tela e não num comentário do código.

    A razão das duas travas estava escrita aqui em cima, para quem lê o
    arquivo, e em lugar nenhum para quem está em pé na chuva tocando num botão
    que não responde. `DialogoDeDevolucao` já fazia o certo: botão travado com a
    frase do que falta ao lado.

    A ordem importa, e a falta de sinal vem primeiro porque é a comum. E a
    frase dela NÃO repete o aviso do topo da tela: aquele já disse que não há
    sinal, e repetir o mesmo texto em dois lugares da mesma tela foi defeito
    relatado neste aplicativo. Esta aqui fala do botão.
  */
  const porQueApagado = !sinal.temSinal
    ? "Este botão volta assim que a conexão voltar."
    : prontasParaSair === 0
      ? "Nada aqui sai por este botão: o que está na lista espera outra conta ou "
        + "já não tem para onde ir."
      : null;

  /**
   * O cartão de um item, um só para todas as seções.
   *
   * Era código repetido dentro de um `map` que só sabia de dois grupos, e é
   * assim que o defeito nasceu: a linha inteira de botões estava atrás de
   * `item.estado === "bloqueado"`, então o estado "arquivado" chegou à tela sem
   * nenhuma saída. O motor já aceitava os dois verbos para ele.
   */
  function cartaoDaColeta(item: ItemFila) {
    const autoria = autoriaDaColeta(item, eu);
    const estado = descreverEstado(item, autoria, pausadaPor);
    const fotosEnviadas = item.fotos.filter((f) => f.enviada).length;
    /*
      QUEM TEM SAÍDA PELA TELA, e por quê.

      Todo item que não sai sozinho precisa de botão, sem exceção: é a regra que
      o produto inteiro afirma ter e que esta tela furava. Bloqueado e arquivado
      não saem porque o dreno não os pega; coleta de outro autor não sai porque
      a credencial é de outra pessoa.
    */
    const parada = item.estado === "bloqueado" || item.estado === "arquivado";
    /*
      O BOTÃO DE EDITAR, e quando ele é o principal.

      15/09/2026, vistoria 000009/2026 parada por 422, nas palavras do dono com
      o aparelho na mão: "cadê o botão de editar? só tem de descartar"; "o
      tentar novamente ali não faz sentido algum". Corrigir devolve a coleta
      para rascunho, com tudo preenchido e com a mesma chave, e abre a tela de
      vistoria.

      Só na coleta da PRÓPRIA pessoa, pela mesma razão de "enviar sem os
      registros perdidos": o rascunho reconstruído vai ser concluído de novo
      por quem está no aparelho, e o autor carimbado seria o da sessão aberta.
      O motor cobra o mesmo portão do lado de lá (`retirarParaCorrecao`).

      "Tentar de novo" SOME quando a recusa é do dado: repetir a mesma coleta
      recebe a mesma recusa, e um botão que promete o que não vai acontecer
      ensina a desconfiar dos que prometem certo. Ele continua para a recusa que
      não é do dado (sessão encerrada, ocorrência não encontrada, coleta
      arquivada por ocorrência encerrada), onde repetir pode dar certo sem mudar
      uma vírgula; nesses casos corrigir é a segunda saída, e não a primeira.
    */
    const recusaDoDado = item.estado === "bloqueado" && recusaEstaNoDado(item.ultimaFalha);
    const podeCorrigir = item.tipo === "vistoria" && parada && autoria === "propria";
    const podeReenviar = parada && !recusaDoDado;
    const podeAssumir = autoria === "sem_autor";
    const podeDescartar = parada || autoria !== "propria";
    const ocupado = emCurso?.id === item.id;
    /*
      A SAÍDA DA COLETA TRAVADA POR ARQUIVO PERDIDO, e as três condições dela.

      O código e a marca no disco vêm do motor, e não de dedução da tela: só ele
      sabe que a leitura dos bytes falhou por ausência, e não por permissão ou
      disco cheio, que são situações que podem melhorar. O portão de
      `abrirMaoDasEvidenciasPerdidas` cobra as mesmas coisas do lado de lá, e
      isto aqui é para o botão não aparecer onde ele não teria efeito.

      **Só na coleta da própria pessoa.** Abrir mão da prova é um ato do autor
      da vistoria: é o nome dele que assina o laudo onde a perda vai ficar
      declarada para sempre. Oferecer isso a quem pegou o aparelho de plantão
      seria a mesma assinatura trocada que o carimbo de autoria existe para
      impedir, agora numa declaração de perda de prova.
    */
    const perdidos = perdaDeRegistro(item).quantas;
    const podeAbrirMao = item.tipo === "vistoria"
      && item.estado === "bloqueado"
      && item.ultimaFalha?.codigo === CODIGO_ARQUIVO_SUMIU
      && perdidos > 0
      && autoria === "propria";

    return (
      <ItemDeLista
        key={item.id}
        entrando={recemChegado(item.id)}
        saindo={idsSaindo.has(item.id)}
        atraso={atrasoEmCascata(ordemDaCascata.get(item.id) ?? 0)}
      >
        <Cartao>
          <View style={{ flexDirection: "row", alignItems: "center", gap: espaco.e2 }}>
            {/*
              O desenho do estado, na margem, em cor discreta e não na cor do
              tom. O tom já está no `Chip`, que tem fundo próprio e contraste
              verificado; a mesma cor solta sobre o cartão seria um par que
              ninguém mediu. Aqui o ícone faz o que ícone faz bem: dar forma
              para o olho varrer a lista sem ler.
            */}
            <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
              <estado.Icone cor={tema.textoDiscreto} tamanho={tamanhoDeIcone.rotulo} />
            </View>
            <Txt variante="corpoP" mono negrito>{item.protocolo}</Txt>
            <View style={{ flex: 1 }} />
            {/*
              A devolução se declara ANTES do estado dela. "Devolvida" e
              "Enviada" são dois desfechos diferentes de dois atos diferentes, e
              o selo sozinho não diz qual dos dois atos está em jogo.
            */}
            {item.tipo === "devolucao" && (
              <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
                <IconeDevolucao cor={tema.textoDiscreto} tamanho={tamanhoDeIcone.rotulo} />
              </View>
            )}
            {/*
              O SELO É O ÚNICO BLOCO PREENCHIDO DESTE CARTÃO, e a régua do peso
              visual (`ui/regua.ts`) é o que garante isso sem esta tela pedir.

              Dois dos quatro tons que chegam aqui são `ok` ("Enviada" e
              "Devolvida"), e eles são o caso NORMAL de uma fila de envio: numa
              tela em que quase tudo dá certo, uma coluna de pílulas verdes
              cheias acende a lista inteira e deixa a coleta bloqueada, que é a
              única que precisa do dedo do agente, com o mesmo peso das outras.
              A R3 tira o fundo de todo tom `ok` dentro do próprio `Chip`, então
              o verde continua com ícone e palavra e o vermelho continua sendo o
              único que pinta.

              Por isso o tom continua vindo de `estado`, e não de um cálculo
              feito aqui: a lista de estados é uma só (a razão está no comentário
              dela, lá em cima), e a régua é do componente.
            */}
            <Chip
              texto={estado.rotulo}
              simbolo={estado.simbolo}
              tom={estado.tom}
              descricao={`Protocolo ${item.protocolo}: ${estado.rotulo}`}
            />
          </View>

          {/* QUEM. Primeira linha do cartão quando o fato tem dono, e não a
              quinta, que era onde o nome de quem coletou estava. */}
          {estado.quem && <Txt variante="corpoP" peso={peso.forte}>{estado.quem}</Txt>}

          {/* POR QUÊ. */}
          <Txt variante="corpoP" discreto>{estado.porque}</Txt>

          {/* O QUE FAZER. */}
          {estado.campos && estado.campos.length > 0 && (
            <CamposRecusados campos={estado.campos} />
          )}

          {estado.oQueFazer && (
            <OQueFazer passos={estado.oQueFazer} testID={`o-que-fazer-${item.id}`} />
          )}

          {item.fotos.length > 0 && (
            <Txt variante="legenda" discreto>
              {fotosEnviadas} de {item.fotos.length} arquivos já subiram
            </Txt>
          )}

          <Txt variante="legenda" discreto>
            {item.tipo === "devolucao" ? "Devolvida em " : "Coletada em "}
            {new Date(item.criadoEm).toLocaleString("pt-BR")}
          </Txt>

          {retorno?.id === item.id && (
            /* A região viva é o que faz a confirmação chegar a quem não vê a
               tela: sem ela, o leitor só leria a frase se a pessoa voltasse
               com o dedo até este ponto do cartão. */
            <View accessibilityLiveRegion="polite">
              {/*
                A confirmação também não pinta fundo, pela mesma R3, e aqui ela
                empilhava de verdade: o cartão de uma coleta bloqueada mostrava
                a pílula vermelha do estado E, logo abaixo, um retângulo verde
                cheio confirmando o toque de "Tentar de novo", dois blocos
                preenchidos a três linhas de distância dizendo coisas opostas.
                Agora o retângulo virou filete, o verde ficou no sinal e no
                título, e quem pinta continua sendo o estado.
              */}
              {/*
                Quando o ato NÃO aconteceu, o aviso não é de sucesso e não se
                chama "Pronto". `info` sai em `superficie2`, que a régua de
                densidade não conta como bloco preenchido, então o cartão
                continua com a pílula vermelha do estado como único preenchido:
                um segundo bloco cheio aqui empilharia duas coisas gritando a
                três linhas de distância, que foi defeito medido nesta tela.

                DOIS AVISOS COM TOM LITERAL, e não um com o tom num ternário.
                O portão de densidade lê a fonte, e tom decidido em tempo de
                execução ele conta pelo PIOR caso, que aqui seria perigo. A
                leitura dele está certa e a escrita é que estava errada: com o
                ternário, nada mais na fonte diz que este aviso nunca pinta.
              */}
              {retorno.deuCerto ? (
                <Aviso tom="sucesso" titulo="Pronto">{retorno.texto}</Aviso>
              ) : (
                <Aviso tom="info" titulo="Nada mudou">{retorno.texto}</Aviso>
              )}
            </View>
          )}

          {(podeCorrigir || podeReenviar || podeAssumir || podeDescartar) && (
            <>
              <Separador />
              {podeAbrirMao && (
                /*
                  Linha inteira, e acima das outras duas: é a única saída que
                  resolve este estado. "Tentar de novo" fica embaixo, meio a
                  meio com "Descartar", porque ele não vai resolver nada aqui
                  (arquivo apagado não volta) e continua existindo só para as
                  fotos que ainda estão inteiras no aparelho subirem.

                  Secundário, e não primário nem realce: o aplicativo não empurra
                  a perda de prova. Ele oferece, com a largura que diz "é por
                  aqui", e a cor cheia continua reservada ao que a tela quer que
                  aconteça. O realce foi considerado quando os botões ganharam
                  cor, e recusado pela mesma razão: preenchido, ele diria "faça
                  isto", e isto é abrir mão de fotografia de interdição.
                */
                <Botao
                  titulo="Enviar sem os registros perdidos"
                  tipo="secundario"
                  carregando={ocupado && emCurso?.verbo === "abrirMao"}
                  desabilitado={ocupado}
                  testID={`abrir-mao-${item.id}`}
                  descricao={`Enviar a vistoria do protocolo ${item.protocolo} sem `
                    + `${registros(perdidos)} que o aparelho não tem mais`}
                  onPress={() => { setAAbrirMao(item); }}
                />
              )}
              {podeCorrigir && !recusaDoDado && (
                /*
                  Corrigir como SEGUNDA saída, linha inteira, acima da linha em
                  que "Tentar de novo" continua sendo o principal: a recusa não
                  foi do dado, então repetir vem primeiro, e editar existe para
                  quem quer rever o que mandou antes de repetir.
                */
                <Botao
                  titulo="Corrigir a vistoria"
                  tipo="secundario"
                  carregando={ocupado && emCurso?.verbo === "corrigir"}
                  desabilitado={ocupado}
                  testID={`corrigir-${item.id}`}
                  descricao={`Corrigir a vistoria do protocolo ${item.protocolo}: ela volta `
                    + "para a tela de coleta, com tudo preenchido"}
                  onPress={() => void corrigir(item)}
                />
              )}
              <View style={{ flexDirection: "row", gap: espaco.e2 }}>
                {podeCorrigir && recusaDoDado && (
                  /*
                    Realce: é o único ato que resolve uma recusa do dado. Fica
                    onde "Tentar de novo" ficava, porque é a resposta à mesma
                    pergunta ("e agora?") com a saída que de fato existe.
                  */
                  <Botao
                    titulo="Corrigir a vistoria"
                    tipo="realce"
                    estilo={{ flex: 1 }}
                    carregando={ocupado && emCurso?.verbo === "corrigir"}
                    desabilitado={ocupado}
                    testID={`corrigir-${item.id}`}
                    descricao={`Corrigir a vistoria do protocolo ${item.protocolo}: ela volta `
                      + "para a tela de coleta, com tudo preenchido"}
                    onPress={() => void corrigir(item)}
                  />
                )}
                {podeReenviar && (
                  /*
                    Realce: é o ato que faz a fila ANDAR. "Esta coleta é minha",
                    ao lado, fica secundário de propósito: é uma declaração
                    sobre o laudo (o nome que vai assinar), e o aplicativo não
                    empurra ninguém a assumir uma coleta que talvez não seja
                    dele. Dois realces lado a lado seriam dois convites ao
                    mesmo tempo, e o cartão deixaria de dizer por onde ir.
                  */
                  <Botao
                    titulo="Tentar de novo"
                    tipo="realce"
                    estilo={{ flex: 1 }}
                    carregando={ocupado && emCurso?.verbo === "reenviar"}
                    desabilitado={ocupado}
                    descricao={item.estado === "arquivado"
                      ? `Tentar enviar de novo a coleta do protocolo ${item.protocolo}, `
                        + "para o caso de a ocorrência ter sido reaberta"
                      : `Tentar enviar de novo a coleta do protocolo ${item.protocolo}`}
                    onPress={() => void agir(item, "reenviar", async () => {
                      await fila?.reenviar(item.id);
                      return {
                        deuCerto: true,
                        /*
                          A frase não promete chegada, porque o reenvio não
                          garante nenhuma: ele devolve o item para a espera, e
                          quem completa o envio é o sinal. Prometer aqui seria
                          criar a mesma dúvida que esta tela dissolve.
                        */
                        texto: pausadaPor
                          /* Com a fila pausada, sinal não faz diferença: diz o
                             que destrava, com a frase do cartão. */
                          ? `O envio foi pedido de novo. ${frasesDaPausa(pausadaPor).doCartao}`
                          : "O envio foi pedido de novo. Se houver sinal, ela sai agora; "
                            + "se não, ela volta para a espera e continua tentando "
                            + "enquanto o aplicativo estiver aberto.",
                      };
                    })}
                  />
                )}
                {podeAssumir && (
                  /*
                    Assumir a autoria é um ato da pessoa, com o dedo, e por isso é
                    botão e não automatismo: o nome que ficar aqui é o nome que vai
                    para o laudo e para a trilha, que é append-only.
                  */
                  <Botao
                    titulo="Esta coleta é minha"
                    tipo="secundario"
                    estilo={{ flex: 1 }}
                    carregando={ocupado && emCurso?.verbo === "assumir"}
                    desabilitado={ocupado}
                    descricao={`Assumir a autoria da coleta do protocolo ${item.protocolo} `
                      + "e enviá-la com o seu nome"}
                    onPress={() => void agir(item, "assumir", async () => {
                      await fila?.assumir(item.id);
                      return {
                        deuCerto: true,
                        texto: "A coleta é sua: ela vai subir com o seu nome no laudo.",
                      };
                    })}
                  />
                )}
                {podeDescartar && (
                  /*
                    Descartar existe, e pergunta duas vezes. Sem a saída, um item
                    parado ficaria para sempre na tela, e o agente aprenderia a
                    ignorar a fila inteira. Com ela sem confirmação, um toque
                    errado apagaria a vistoria.
                  */
                  <Botao
                    titulo="Descartar"
                    tipo="perigo"
                    estilo={{ flex: 1 }}
                    desabilitado={ocupado}
                    descricao={`Descartar a coleta do protocolo ${item.protocolo}`}
                    onPress={() => { setADescartar(item); }}
                  />
                )}
              </View>
            </>
          )}
        </Cartao>
      </ItemDeLista>
    );
  }

  return (
    <ScrollView ref={rolagem} contentContainerStyle={{ padding: espaco.e4, gap: espaco.e4, paddingBottom: recuoDoMenu }}>
      {!sinal.temSinal && (
        <Aviso tom="alerta" titulo="Sem sinal agora">
          {pausadaPor
            /* Pausada pela sessão, a conexão voltar não faz nada sair: a
               promessa fica só na frase da pausa, no alto da lista. */
            ? "Nada se perde: o que está aqui continua guardado neste aparelho."
            : "Nada se perde: o que está aqui sai quando a conexão voltar, com o "
              + "aplicativo aberto, sem você precisar tocar em nada."}
        </Aviso>
      )}

      {visiveis.length === 0 ? (
        /*
          A RESPOSTA FINAL À PERGUNTA "O MEU TRABALHO CHEGOU?".

          Era um título, uma frase cinza e, logo abaixo, um botão apagado com um
          parágrafo de rodapé: a tela mais importante do produto desenhada como
          se fosse "nenhum resultado para este filtro". Agora o vazio é uma
          afirmação, com desenho, e o botão apagado saiu daqui: não há nada para
          enviar, e um botão travado embaixo de "está tudo enviado" só produz a
          dúvida que a frase acabou de resolver.
        */
        <FilaZerada comemorar={zerouAgora}>
          {(escalaDoEmblema) => (
            /*
              O VAZIO VIRA OBJETO, e é a folga que o `CLAUDE.md` autoriza desde
              a emenda de 2026-08-20 e que esta tela nunca usou: elevação com
              mais liberdade em momento de confirmação, mesmo fora de modal.

              Enquanto foi texto solto sobre o fundo da tela, a resposta à
              pergunta que o agente faz no fim do turno tinha exatamente a
              mesma presença de um "nenhum resultado para este filtro". O nível
              sai de `Cartao`, e não de uma sombra escrita aqui, para os
              destaques do produto inteiro continuarem consistentes entre telas.
            */
            <Cartao nivel="flutuante">
              <Vazio
                icone={(
                  <Animated.View style={{ transform: [{ scale: escalaDoEmblema }] }}>
                    <IconeSucesso cor={tema.destaque} tamanho={tamanhoDeIcone.vazio} />
                  </Animated.View>
                )}
                titulo="Tudo o que você fez já chegou"
                descricao={
                  "Nenhuma coleta esperando envio neste aparelho. Toda vistoria "
                  + "concluída aqui já está com a coordenação, e o que vier depois "
                  + "sobe quando o aplicativo estiver aberto e houver rede."
                }
              />
            </Cartao>
          )}
        </FilaZerada>
      ) : (
        <>
          {naFila > 0 && (
            /*
              O NÚMERO É O PROTAGONISTA DESTA TELA, e ele estava dentro de uma
              frase, na fonte do corpo.

              É a pergunta que traz o agente aqui: quanto do que eu fiz ainda
              não chegou. `Dado` é a figura que o `CLAUDE.md` pede desde o
              primeiro dia ("números grandes com rótulos discretos"), e ela
              traz junto a fonte tabular, que não é estética: os números deste
              produto são ditados por rádio, e em tipo proporcional o zero se
              parece com a letra. O aplicativo já pagou por isso uma vez, com o
              protocolo saindo dentro de uma frase no painel.

              É o ÚNICO protagonista da tela, e por isso o estado vazio não tem
              outro: dois números grandes não somam ênfase, dividem a que havia.
            */
            <Dado
              valor={String(naFila)}
              rotulo={naFila === 1 ? "coleta na fila" : "coletas na fila"}
            />
          )}

          {minhasColetas.length > 0 && (
            <Secao Icone={IconeEnvio} titulo="Minhas coletas" quantos={contar(minhasColetas)}>
              {/*
                A PAUSA DA SESSAO, no alto da lista que ela afeta. Diz o fato,
                o que resolve e a promessa (a coleta continua guardada). Só a
                sessao encerrada traz o botao: e a unica com um ato que resolve.
                Conta desativada nao tem botao, porque entrar de novo nao
                resolve, e oferecer o botao ensinaria o contrario do que a frase
                diz. O ato e o mesmo da lista de hoje: `encerrarSessaoVencida`
                derruba a sessao e deixa o disco como esta.
              */}
              {pausadaPor && (
                <Aviso
                  tom="perigo"
                  /* R1 e R2 da régua (`ui/regua.ts`): a seção já pode ter o aviso
                     de coleta recusada, também de perigo, e o que a máquina
                     cobra é um bloco preenchido por peça. A pausa desce para o
                     peso leve (filete, ícone e palavra no tom de perigo) porque
                     o fundo cheio já está na faixa do topo, que diz a mesma
                     coisa na primeira linha de toda aba. */
                  peso="leve"
                  titulo={frasesDaPausa(pausadaPor).titulo}
                  {...(pausadaPor === "sessao_encerrada"
                    ? {
                      acao: {
                        titulo: "Entrar de novo",
                        descricao: "Entrar de novo com o seu email e a sua senha, sem apagar as coletas",
                        testID: "entrar-de-novo-pela-fila",
                        onPress: () => void (async () => {
                          await encerrarSessaoVencida();
                          router.replace("/entrar");
                        })(),
                      },
                    }
                    : {})}
                >
                  {frasesDaPausa(pausadaPor).detalhe}
                </Aviso>
              )}
              {/* O número do aviso é o contado, e não o desenhado: uma coleta
                  que já saiu do disco não "precisa de atenção" de ninguém, mesmo
                  enquanto o cartão dela ainda está desaparecendo. */}
              {contar(bloqueados) > 0 && (
                <Aviso
                  tom="perigo"
                  titulo={contar(bloqueados) === 1
                    ? "Uma coleta precisa de atenção"
                    : `${contar(bloqueados)} coletas precisam de atenção`}
                >
                  Repetir o envio não resolve sozinho: cada cartão abaixo diz o que
                  aconteceu e o que fazer.
                </Aviso>
              )}
              {minhasColetas.map(cartaoDaColeta)}
            </Secao>
          )}

          {/*
            As devoluções, com seção própria e número próprio.

            Elas ficam aqui embaixo das coletas de propósito: coleta é trabalho
            feito que pode se perder, e é o que o agente abre esta tela para ver.
            A devolução é uma decisão que já foi tomada e que só precisa chegar.
          */}
          {devolucoes.length > 0 && (
            <Secao
              Icone={IconeDevolucao}
              titulo="Minhas devoluções"
              quantos={contar(devolucoes)}
            >
              {devolucoes.map(cartaoDaColeta)}
            </Secao>
          )}

          {/*
            A seção de quem não é da sessão aberta.

            Ela existe para o aparelho de plantão compartilhado: a coleta do
            turno anterior continua guardada (o diálogo de saída promete isso) e
            continua VISÍVEL, com o nome de quem a fez. Escondê-la seria repetir
            o defeito por outro caminho: uma vistoria parada no aparelho que
            ninguém vê é uma vistoria perdida.

            O título diz "envios" e não "coletas" porque a seção mistura os dois:
            chamar de coleta um pedido que declara que a vistoria NÃO foi feita
            seria a tela afirmando o contrário do que o item diz. Antes isso era
            um ternário dentro do título, que contava a mesma coisa de quatro
            jeitos conforme a composição da lista.
          */}
          {deOutroAutor.length > 0 && (
            <Secao
              Icone={IconeEquipe}
              titulo="Envios de outro agente"
              quantos={contar(deOutroAutor)}
            >
              <Aviso tom="alerta" titulo="Não saem pela sua conta">
                O nome de quem fez a vistoria é o nome que vai para o laudo. Eles
                ficam guardados aqui até quem coletou entrar neste aparelho.
              </Aviso>
              {deOutroAutor.map(cartaoDaColeta)}
            </Secao>
          )}

          {arquivados.length > 0 && (
            <Secao
              Icone={IconeArquivado}
              titulo="Arquivadas"
              quantos={contar(arquivados)}
            >
              {arquivados.map(cartaoDaColeta)}
            </Secao>
          )}

          <Botao
            titulo="Tentar enviar agora"
            onPress={() => void sincronizarAgora()}
            carregando={sincronizando}
            desabilitado={porQueApagado !== null}
            /* Quem ouve a tela precisa ouvir a razão junto com o nome do botão:
               a frase abaixo é desenho, e desenho não chega a quem não vê. */
            descricao={porQueApagado
              ? `Tentar enviar agora. ${porQueApagado}`
              : undefined}
          />

          {porQueApagado ? (
            <View style={{ flexDirection: "row", gap: espaco.e2, alignItems: "flex-start" }}>
              <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
                <IconeAlerta cor={tema.textoDiscreto} tamanho={tamanhoDeIcone.rotulo} />
              </View>
              <View style={{ flex: 1 }}>
                <Txt variante="corpoP" discreto>{porQueApagado}</Txt>
              </View>
            </View>
          ) : pausadaPor ? null : (
            /* Pausada pela sessão, a legenda calaria o que o aviso do alto da
               lista já diz: "com sinal, o envio acontece sozinho" é justamente
               o que a pausa desfaz (V2-F00-E06, correção 3). */
            <Txt variante="legenda" discreto alinhamento="center">
              Com o aplicativo aberto e com sinal, o envio acontece sem você tocar
              em nada. Este botão é para quando você quer ver acontecer.
            </Txt>
          )}
        </>
      )}

      {/*
        Um diálogo só para a lista inteira, e não um por cartão.

        A lista pode ter dezenas de itens, e um `Modal` por item seria uma
        dezena de modais montados por trás da tela o tempo todo. Quem responde
        qual coleta está em questão é o estado, e o protocolo aparece no texto.
      */}
      <Dialogo
        aberto={aDescartar !== null}
        titulo={aDescartar?.tipo === "devolucao"
          ? "Descartar esta devolução?"
          : "Descartar esta coleta?"}
        /*
          Quando a coleta é de outra pessoa, a pergunta diz o nome dela.

          Sem o nome, o agente da noite apagaria a vistoria que a colega fez no
          morro achando que estava limpando a própria fila. O protocolo sozinho
          não conta essa parte, e é a parte que faz a pessoa parar.
        */
        texto={
          aDescartar?.tipo === "devolucao"
            /*
              Descartar uma devolução não apaga trabalho nenhum: ela é um pedido
              que não chegou. O que a frase precisa dizer é o que sobra depois,
              e o que sobra é a tarefa, com o agente. Repetir aqui a frase da
              coleta ("a vistoria será apagada") assustaria com uma perda que
              não existe e esconderia a consequência que existe.
            */
            ? (aDescartar.autor && aDescartar.autor.usuarioId !== identidade?.usuarioId
              ? `Esta devolução foi decidida por ${aDescartar.autor.nome}. ` : "")
              + `O pedido de devolução do protocolo ${aDescartar.protocolo} sai deste `
              + "aparelho e a coordenação não vai saber dele. A tarefa continua na sua "
              + "lista, para vistoriar ou devolver de novo."
            : (aDescartar?.autor && aDescartar.autor.usuarioId !== identidade?.usuarioId
              ? `Esta vistoria foi feita por ${aDescartar.autor.nome}. ` : "")
              + `A vistoria do protocolo ${aDescartar?.protocolo ?? ""} será apagada deste `
              + "aparelho e não chegará à coordenação. Não dá para desfazer."
        }
        acao={{
          rotulo: aDescartar?.tipo === "devolucao"
            ? "Descartar esta devolução"
            : "Descartar esta coleta",
          destrutiva: true,
          aoTocar: () => void (async () => {
            const alvo = aDescartar;
            if (!alvo || !fila) return;
            await fila.descartar(alvo.id);
            await recarregar(fila, { comemorarSeZerar: false });
          })(),
        }}
        recusa={{ rotulo: "Manter na fila" }}
        aoFechar={() => { setADescartar(null); }}
      />

      {/*
        A PERGUNTA SOBRE OS REGISTROS QUE SE PERDERAM.

        Ela existe porque a alternativa é pior das duas maneiras. Sem saída
        nenhuma, um arquivo que o sistema operacional apagou do cache destrói o
        envelope inteiro (checklist, GPS, assinatura, observações, órgãos), ou
        seja, uma manhã de trabalho no morro some por causa de um arquivo de
        imagem. Com saída automática, uma decisão de máquina passaria a escrever
        numa trilha append-only, em nome de quem esteve no local, que houve
        registro fotográfico que não pôde ser recuperado.

        Então a decisão é da pessoa, e a pergunta diz as três coisas que ela
        precisa para decidir: quantos registros, o que o documento vai declarar,
        e o que acontece com a linha de assinatura quando o que sumiu foi o
        traço de quem estava no local.
      */}
      <Dialogo
        aberto={aAbrirMao !== null}
        titulo="Enviar sem os registros perdidos?"
        texto={aAbrirMao
          ? `O protocolo ${aAbrirMao.protocolo} sobe sem `
            + `${registros(perdaDeRegistro(aAbrirMao).quantas)} desta vistoria: os `
            + "arquivos não estão mais no aparelho."
          : ""}
        conteudo={aAbrirMao && (
          <>
            <Txt variante="corpoP">
              O laudo vai declarar que houve registro capturado em campo e não
              recuperado, com a hora de cada captura.
            </Txt>
            {/*
              O CASO PIOR, e ele ganha bloco próprio em vez de uma oração no fim
              de um parágrafo. Sem o traço, a linha de assinatura do laudo sai
              vazia, e vazia ela é indistinguível de uma vistoria em que ninguém
              assinou, que é a lacuna mais grave que aquele documento pode ter.
              O laudo escreve a causa ao lado da linha; quem autoriza precisa
              saber disso antes, e não descobrir na hora de imprimir.
            */}
            {perdaDeRegistro(aAbrirMao).assinatura && (
              <Aviso tom="alerta" titulo="A assinatura está entre eles">
                A linha de assinatura do laudo sai sem o traço, e o documento diz
                que a causa foi esta perda.
              </Aviso>
            )}
            <Txt variante="corpoP" discreto>
              Não dá para desfazer: a trilha de auditoria não se reescreve.
            </Txt>
          </>
        )}
        acao={{
          rotulo: "Enviar sem os registros perdidos",
          destrutiva: true,
          aoTocar: () => void (async () => {
            const alvo = aAbrirMao;
            if (!alvo || !fila) return;
            await agir(alvo, "abrirMao", async () => {
              /*
                O NÚMERO DA CONFIRMAÇÃO É O QUE O MOTOR DEVOLVEU, e não o que a
                tela mostrou na pergunta. Entre uma coisa e outra há uma
                releitura do disco, e quem responde pelo que subiu é quem gravou.
                Uma confirmação que repetisse o número da pergunta estaria
                afirmando, com cara de recibo, algo que ela não conferiu.
              */
              const { liberado, perdidas } = await fila.abrirMaoDasEvidenciasPerdidas(alvo.id);
              return liberado
                ? {
                    deuCerto: true,
                    texto: `A vistoria voltou para a fila sem ${registros(perdidas)}. `
                      + "O laudo vai declarar a perda.",
                  }
                : {
                    deuCerto: false,
                    texto: "Nada foi autorizado: esta coleta não está mais esperando "
                      + "essa decisão. O cartão acima mostra o estado de agora.",
                  };
            });
          })(),
        }}
        recusa={{ rotulo: "Manter na fila" }}
        aoFechar={() => { setAAbrirMao(null); }}
      />
    </ScrollView>
  );
}
