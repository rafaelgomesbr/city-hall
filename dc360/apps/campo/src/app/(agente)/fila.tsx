import { useCallback, useEffect, useState } from "react";
import { ScrollView, View } from "react-native";
import {
  autoriaDaColeta,
  type Autoria,
  type FilaDeSincronizacao,
  type ItemDeDevolucao,
  type ItemFila,
} from "@dc360/campo";
import { ROTULO_MOTIVO_DE_DEVOLUCAO } from "@dc360/shared";
import { enderecoDaApi } from "../../dados/api";
import { obterFila } from "../../dados/fila";
import { useSinal } from "../../dados/conectividade";
import { useSessao } from "../../dados/sessao";
import {
  Aviso, Botao, Cartao, Carregando, Separador, Txt, Vazio,
} from "../../ui/componentes";
import { Chip, type TomDoChip } from "../../ui/Chip";
import { Dialogo } from "../../ui/Dialogo";
import { espaco } from "../../ui/tokens";

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
 */

/**
 * Uma lista só decide a palavra, o símbolo e o tom de cada estado.
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
 * O cartão de uma devolução, estado por estado.
 *
 * Separado de `descreverEstado` para caber a explicação de cada desfecho sem
 * transformar aquele `switch` num labirinto de ternários, que foi exatamente
 * como o estado "arquivado" nasceu sem desenho próprio.
 */
function descreverDevolucao(item: ItemDeDevolucao): {
  rotulo: string; explicacao: string; simbolo: string; tom: TomDoChip;
} {
  const motivo = ROTULO_MOTIVO_DE_DEVOLUCAO[item.devolucao.motivo];
  switch (item.estado) {
    case "pendente":
      return {
        rotulo: "Devolução aguardando",
        simbolo: "…",
        tom: "neutro",
        explicacao: item.tentativas === 0
          ? `Motivo: ${motivo}. Ainda não saiu do aparelho, e vai sair assim que `
            + "houver sinal. A tarefa já saiu da sua lista."
          : `Motivo: ${motivo}. Já tentou ${item.tentativas}x e vai continuar `
            + "tentando sozinha. Enquanto ela não chegar, a coordenação não sabe "
            + "que esta tarefa voltou.",
      };
    case "enviando":
      return {
        rotulo: "Devolução saindo", simbolo: "↑", tom: "neutro",
        explicacao: `Motivo: ${motivo}. Saindo do aparelho agora.`,
      };
    case "confirmado":
      return {
        rotulo: "Devolvida",
        simbolo: "✓",
        tom: "ok",
        explicacao:
          "A coordenação recebeu e a ocorrência voltou para quem despacha. Some "
          + "desta lista em instantes.",
      };
    /*
      Recusada, e a tarefa JÁ VOLTOU para a lista de tarefas. Dizer isso aqui não
      é redundância: sem a frase, o agente lê "precisa de atenção" e não sabe se
      a tarefa continua com ele ou não, que é a única coisa que ele precisa
      decidir agora.
    */
    case "bloqueado":
    case "arquivado":
      return {
        rotulo: "Devolução recusada",
        simbolo: "!",
        tom: "perigo",
        explicacao: (
          item.ultimaFalha?.mensagem
          ?? "O servidor recusou a devolução por um motivo que repetir não resolve."
        ) + " A tarefa voltou para a sua lista: ou você a vistoria, ou tenta "
          + "devolver de novo por aqui.",
      };
  }
}

/** O primeiro nome, que é como o colega é chamado no plantão. */
function primeiroNome(nome: string): string {
  return nome.trim().split(/\s+/)[0] ?? nome;
}

function descreverEstado(item: ItemFila, autoria: Autoria): {
  rotulo: string; explicacao: string; simbolo: string; tom: TomDoChip;
} {
  /*
    A AUTORIA VEM ANTES DO ESTADO, e a ordem é o conteúdo.

    Um item de outro agente fica em `pendente` no disco, e "Aguardando" prometia
    que ele sai assim que houver sinal. Não sai: o dreno não toca em coleta que
    não é de quem está logado, porque o servidor tira o autor da vistoria de
    quem apresentou o token. Mostrar a promessa da espera aqui seria a mesma
    mentira de sempre, só que na tela em vez de no laudo.
  */
  if (autoria === "de_outro" && item.autor) {
    return {
      rotulo: "De outro agente",
      simbolo: "⏸",
      tom: "alerta",
      explicacao: item.tipo === "devolucao"
        /*
          A devolução também é uma declaração assinada: quem devolveu responde
          pelo ato na trilha, que é append-only. Enviá-la com a credencial de
          quem está no aparelho agora atribuiria a decisão à pessoa errada, do
          mesmo jeito que o laudo com autor trocado.
        */
        ? `Devolvida por ${item.autor.nome}. Ela só pode ser enviada pela conta de `
          + `quem decidiu devolver, porque é esse nome que vai para a coordenação. `
          + `Peça para ${primeiroNome(item.autor.nome)} entrar neste aparelho com `
          + `sinal. Se isso não for possível, avise a coordenação e informe o `
          + `protocolo acima.`
        : `Coletada por ${item.autor.nome}. Ela só pode ser enviada pela conta de `
          + `quem fez a vistoria, porque é esse nome que vai para o laudo. Peça para `
          + `${primeiroNome(item.autor.nome)} entrar neste aparelho com sinal. Se isso `
          + `não for possível, avise a coordenação e informe o protocolo acima.`,
    };
  }

  /*
    A DEVOLUÇÃO TEM AS PALAVRAS DELA, e não as da coleta.

    "Aguardando", no cartão de uma devolução, seria lido como vistoria esperando
    envio, e é o contrário: aqui o agente está dizendo que NÃO vistoriou. Um
    rótulo que descreve outro ato é uma frase falsa numa tela que existe para
    dissolver a dúvida "cadê o que eu fiz?".
  */
  if (item.tipo === "devolucao") return descreverDevolucao(item);
  if (autoria === "sem_autor") {
    return {
      rotulo: "Sem autor registrado",
      simbolo: "?",
      tom: "alerta",
      explicacao:
        "Esta coleta ficou guardada por uma versão anterior do aplicativo, que não "
        + "registrava quem tinha feito a vistoria. Se ela é sua, toque em "
        + "\"Esta coleta é minha\" para enviá-la com o seu nome no laudo. Se não for "
        + "sua, avise a coordenação antes de descartar.",
    };
  }

  switch (item.estado) {
    case "pendente":
      return {
        rotulo: "Aguardando",
        simbolo: "…",
        tom: "neutro",
        explicacao: item.tentativas === 0
          ? "Ainda não saiu do aparelho. Vai sair assim que houver sinal."
          : item.tentativas < TENTATIVAS_ATE_AVISAR
            ? `Já tentou ${item.tentativas}x. Vai tentar de novo em instantes.`
            /*
              Muitas tentativas não viram acusação nem convite ao descarte: a
              coleta continua tentando sozinha, e o que falta é sinal. A frase
              diz isso e termina na única ação que resolve.
            */
            : `Já tentou ${item.tentativas}x e vai continuar tentando sozinha. A `
              + "conexão daqui não está completando o envio: procure um lugar com "
              + "sinal melhor ou uma rede Wi-Fi que funcione.",
      };
    case "enviando":
      return {
        rotulo: "Enviando", simbolo: "↑", tom: "neutro",
        explicacao: "Saindo do aparelho agora.",
      };
    case "confirmado":
      return {
        rotulo: "Enviada",
        simbolo: "✓",
        tom: "ok",
        explicacao: "A coordenação recebeu. Some desta lista em instantes.",
      };
    case "bloqueado":
      return {
        rotulo: "Precisa de atenção",
        simbolo: "!",
        tom: "perigo",
        /*
          O 404 ganha frase própria, e não a do servidor.

          "Ocorrência não encontrada" não diz nada a quem está na rua, e o
          aplicativo não tem como saber o motivo: a API responde 404 (nunca 403)
          também para recurso de outro município, justamente para não confirmar
          que ele existe. Então a frase diz o que se sabe e termina na ação, em
          vez de inventar um motivo como o "Arquivada" fazia.
        */
        explicacao: item.ultimaFalha?.codigo === "nao_encontrada"
          ? "O servidor não encontrou esta ocorrência para a sua conta. Fale com a "
            + "coordenação e informe o protocolo acima antes de descartar: a coleta "
            + "continua guardada aqui."
          : item.ultimaFalha?.mensagem
            ?? "O servidor recusou por um motivo que repetir não resolve.",
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
          Símbolo e tom próprios, e não os de "Aguardando". Arquivada não é uma
          espera mais longa: é uma coleta que perdeu o destino e nunca vai
          chegar. Repetir o desenho da espera aqui seria prometer ao agente uma
          entrega que não vem.
        */
        simbolo: "✕",
        tom: "alerta",
        explicacao: item.ultimaFalha?.mensagem
          ?? "A ocorrência foi encerrada no painel enquanto esta coleta esperava sinal. "
             + "Ela fica guardada aqui como registro do que foi feito.",
      };
  }
}

export default function TelaDaFila() {
  const sinal = useSinal();
  const { obterToken, lerIdentidade, identidade } = useSessao();

  const [fila, setFila] = useState<FilaDeSincronizacao | null>(null);
  const [itens, setItens] = useState<ItemFila[] | null>(null);
  const [sincronizando, setSincronizando] = useState(false);
  /*
    Qual item está sendo perguntado, e não "o diálogo está aberto".

    Guardar o item inteiro em vez de uma bandeira é o que permite o diálogo
    dizer o protocolo, que é a única coisa que distingue uma coleta da outra
    nesta lista. Enquanto isto vale `null`, nada foi descartado: o descarte
    acontece só no toque do botão, e é isso que o teste desta tela cobra.
  */
  const [aDescartar, setADescartar] = useState<ItemFila | null>(null);

  const recarregar = useCallback(async (f: FilaDeSincronizacao) => {
    setItens(await f.itens());
  }, []);

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
      desassinar = f.assinar(() => { void recarregar(f); });
    })();
    return () => { vivo = false; desassinar?.(); };
  }, [obterToken, lerIdentidade, recarregar]);

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

  if (!itens) return <Carregando mensagem="Abrindo a fila" />;

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

  const daSessao = itens.filter((i) => autoriaDaColeta(i, eu) === "propria");
  const deOutroAutor = itens.filter((i) => autoriaDaColeta(i, eu) !== "propria");
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

  /*
    O título conta o que ainda tem destino, e a arquivada fica FORA dele.

    Coleta arquivada não vai ser enviada por ninguém: somá-la aqui produzia um
    "3 coletas na fila" que nunca descia para zero, e contador que nunca zera é
    contador que a pessoa aprende a ignorar. Ela tem a própria seção, com o
    próprio número e com saída pelo botão.
  */
  const naFila = bloqueados.length + emEspera.length
    /* Devolução de outro agente existe (aparelho de plantão troca de turno) e
       continua visível na seção dela, mas não entra numa contagem que diz
       "coletas": ela afirma o contrário de uma coleta. */
    + deOutroAutor.filter((i) => i.tipo === "vistoria").length;

  /*
    O que o botão "Tentar enviar agora" de fato faz sair.

    Era `itens.length === 0`, o que deixava o botão aceso numa fila que só tinha
    coleta arquivada ou de outro agente: a pessoa tocava, o dreno não pegava
    nada, e a tela não mudava. Botão que responde ao toque sem fazer nada ensina
    a desconfiar da tela inteira.
  */
  const prontasParaSair = [...emEspera, ...devolucoes].filter(
    (i) => i.estado === "pendente" || i.estado === "enviando",
  ).length;

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
    const estado = descreverEstado(item, autoria);
    const fotosEnviadas = item.fotos.filter((f) => f.enviada).length;
    /*
      QUEM TEM SAÍDA PELA TELA, e por quê.

      Todo item que não sai sozinho precisa de botão, sem exceção: é a regra que
      o produto inteiro afirma ter e que esta tela furava. Bloqueado e arquivado
      não saem porque o dreno não os pega; coleta de outro autor não sai porque
      a credencial é de outra pessoa.
    */
    const podeReenviar = item.estado === "bloqueado" || item.estado === "arquivado";
    const podeAssumir = autoria === "sem_autor";
    const podeDescartar = podeReenviar || autoria !== "propria";

    return (
      <Cartao key={item.id}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: espaco.e2 }}>
          <Txt variante="corpoP" mono negrito>{item.protocolo}</Txt>
          <View style={{ flex: 1 }} />
          <Chip
            texto={estado.rotulo}
            simbolo={estado.simbolo}
            tom={estado.tom}
            descricao={`Protocolo ${item.protocolo}: ${estado.rotulo}`}
          />
        </View>

        <Txt variante="corpoP" discreto>{estado.explicacao}</Txt>

        {item.fotos.length > 0 && (
          <Txt variante="legenda" discreto>
            {fotosEnviadas} de {item.fotos.length} arquivos já subiram
          </Txt>
        )}

        <Txt variante="legenda" discreto>
          {item.tipo === "devolucao" ? "Devolvida em " : "Coletada em "}
          {new Date(item.criadoEm).toLocaleString("pt-BR")}
        </Txt>

        {(podeReenviar || podeAssumir || podeDescartar) && (
          <>
            <Separador />
            <View style={{ flexDirection: "row", gap: espaco.e2 }}>
              {podeReenviar && (
                <Botao
                  titulo="Tentar de novo"
                  tipo="secundario"
                  estilo={{ flex: 1 }}
                  descricao={item.estado === "arquivado"
                    ? `Tentar enviar de novo a coleta do protocolo ${item.protocolo}, `
                      + "para o caso de a ocorrência ter sido reaberta"
                    : `Tentar enviar de novo a coleta do protocolo ${item.protocolo}`}
                  onPress={() => void (async () => {
                    await fila?.reenviar(item.id);
                    if (fila) await recarregar(fila);
                  })()}
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
                  descricao={`Assumir a autoria da coleta do protocolo ${item.protocolo} `
                    + "e enviá-la com o seu nome"}
                  onPress={() => void (async () => {
                    await fila?.assumir(item.id);
                    if (fila) await recarregar(fila);
                  })()}
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
                  descricao={`Descartar a coleta do protocolo ${item.protocolo}`}
                  onPress={() => { setADescartar(item); }}
                />
              )}
            </View>
          </>
        )}
      </Cartao>
    );
  }

  return (
    <ScrollView contentContainerStyle={{ padding: espaco.e4, gap: espaco.e4 }}>
      {!sinal.temSinal && (
        <Aviso tom="alerta">
          Sem sinal agora. Nada se perde: o que está aqui sai sozinho quando a
          conexão voltar, sem você precisar fazer nada.
        </Aviso>
      )}

      {itens.length === 0 ? (
        <Vazio
          titulo="Nada esperando envio"
          descricao="Toda vistoria concluída neste aparelho já chegou à coordenação."
        />
      ) : (
        <>
          {naFila > 0 && (
            <Txt variante="h2">
              {naFila === 1 ? "1 coleta na fila" : `${naFila} coletas na fila`}
            </Txt>
          )}

          {bloqueados.length > 0 && (
            <Aviso tom="perigo">
              {bloqueados.length === 1
                ? "Uma coleta precisa de atenção: repetir o envio não resolve sozinho."
                : `${bloqueados.length} coletas precisam de atenção: repetir o envio não resolve sozinho.`}
            </Aviso>
          )}

          {[...bloqueados, ...emEspera].map(cartaoDaColeta)}

          {/*
            As devoluções, com título próprio e número próprio.

            Elas ficam aqui embaixo das coletas de propósito: coleta é trabalho
            feito que pode se perder, e é o que o agente abre esta tela para ver.
            A devolução é uma decisão que já foi tomada e que só precisa chegar.
          */}
          {devolucoes.length > 0 && (
            <>
              <Txt variante="h2">
                {devolucoes.length === 1
                  ? "1 tarefa devolvida"
                  : `${devolucoes.length} tarefas devolvidas`}
              </Txt>
              {devolucoes.map(cartaoDaColeta)}
            </>
          )}

          {/*
            A seção de quem não é da sessão aberta.

            Ela existe para o aparelho de plantão compartilhado: a coleta do
            turno anterior continua guardada (o diálogo de saída promete isso) e
            continua VISÍVEL, com o nome de quem a fez. Escondê-la seria repetir
            o defeito por outro caminho: uma vistoria parada no aparelho que
            ninguém vê é uma vistoria perdida.
          */}
          {deOutroAutor.length > 0 && (
            <>
              <Txt variante="h2">
                {/*
                  "Envio" quando há devolução misturada: chamar de coleta um
                  pedido que declara que a vistoria NÃO foi feita seria a tela
                  afirmando o contrário do que o item diz.
                */}
                {deOutroAutor.every((i) => i.tipo === "vistoria")
                  ? (deOutroAutor.length === 1
                    ? "1 coleta de outro agente"
                    : `${deOutroAutor.length} coletas de outro agente`)
                  : (deOutroAutor.length === 1
                    ? "1 envio de outro agente"
                    : `${deOutroAutor.length} envios de outro agente`)}
              </Txt>
              <Aviso tom="alerta">
                Estas coletas não são enviadas pela sua conta: o nome de quem fez a
                vistoria é o nome que vai para o laudo. Elas ficam guardadas aqui
                até quem coletou entrar neste aparelho.
              </Aviso>
              {deOutroAutor.map(cartaoDaColeta)}
            </>
          )}

          {arquivados.length > 0 && (
            <>
              <Txt variante="h2">
                {arquivados.length === 1
                  ? "1 coleta arquivada"
                  : `${arquivados.length} coletas arquivadas`}
              </Txt>
              {arquivados.map(cartaoDaColeta)}
            </>
          )}
        </>
      )}

      <Botao
        titulo="Tentar enviar agora"
        onPress={() => void sincronizarAgora()}
        carregando={sincronizando}
        desabilitado={prontasParaSair === 0 || !sinal.temSinal}
      />

      <Txt variante="legenda" discreto alinhamento="center">
        O envio acontece sozinho, em segundo plano. Este botão é para quando
        você quer ver acontecer.
      </Txt>

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
            await recarregar(fila);
          })(),
        }}
        recusa={{ rotulo: "Manter na fila" }}
        aoFechar={() => { setADescartar(null); }}
      />
    </ScrollView>
  );
}
