import { useEffect, useState, type ReactNode } from "react";
import { ActivityIndicator, ScrollView, View } from "react-native";
import { router } from "expo-router";
import Constants from "expo-constants";
import { ROTULO_PAPEL } from "@dc360/shared";
import { enderecoDaApi } from "../../dados/api";
import { obterFila } from "../../dados/fila";
import { useSessao } from "../../dados/sessao";
import { useSinal } from "../../dados/conectividade";
import { usePush } from "../../push/contexto";
import { frasesDoEstado, ofereceAjustes } from "../../push/permissao";
import type { PreferenciaDeTema } from "../../dados/preferencia-de-tema";
import {
  Aviso, Botao, Cartao, Separador, Tocavel, Txt, Vazio, useEstadoDoTema, useTema,
} from "../../ui/componentes";
import { Chip, type TomDoChip } from "../../ui/Chip";
import { Dialogo } from "../../ui/Dialogo";
import {
  IconeAparelho, IconeEnvio, IconeSemSinal, IconeSinal,
} from "../../ui/icones";
import { borda, espaco, icone, peso, raio, toque } from "../../ui/tokens";

/**
 * A conta do agente, e a saída.
 *
 * A parte que importa desta tela é a recusa em sair com coleta pendente. Sair
 * apaga a sessão, e sem sessão a fila não consegue enviar: uma vistoria feita
 * no morro ficaria presa no aparelho até alguém entrar de novo, sem ninguém
 * saber que ela existe. A tela conta quantas estão esperando e pede
 * confirmação explícita.
 *
 * ---
 *
 * **O que a frente F7 arrumou aqui: identidade e estado deixaram de ser a
 * mesma coisa.**
 *
 * A tela era nove pares rótulo/valor idênticos, empilhados com o mesmo
 * espaçamento e o mesmo peso. "Conexão agora: Com sinal, por WIFI" tinha
 * exatamente o desenho de "Nome: Rafael Gomes". São duas naturezas opostas:
 *
 * - **Identidade** é quem assina o laudo. Não muda enquanto a sessão durar,
 *   não tem nada a fazer a respeito, e o que se precisa dela é reconhecer de
 *   relance ("é a minha conta mesmo?"). Ela virou um bloco de TIPOGRAFIA: nome
 *   grande, papel abaixo, órgão e município em linha discreta. Nenhum rótulo,
 *   porque ninguém precisa da palavra "Nome" para saber que aquilo é um nome.
 * - **Estado** é o que muda sozinho, o que o agente CONFERE antes de guardar o
 *   telefone, e o que às vezes pede ação. Ele virou linha com ícone, rótulo à
 *   esquerda e valor alinhado à direita, numa coluna só. Três linhas alinhadas
 *   se conferem de relance; nove blocos empilhados se leem um a um.
 *
 * A ficha técnica do binário (versão e servidor) fica num terceiro grupo,
 * depois de um separador: não é quem está usando nem o que está acontecendo,
 * é qual programa está instalado, e ela só é procurada quando algo deu errado.
 */

/**
 * Uma linha de ESTADO: ícone, rótulo à esquerda, valor à direita.
 *
 * O alinhamento à direita é o ponto. Com os valores numa coluna, "Com sinal" e
 * "3 esperando" se comparam sem o olho procurar onde cada um começa, que é o
 * que nove blocos empilhados obrigavam a fazer.
 */
function LinhaDeEstado({ desenho, rotulo, children }: {
  /** O ícone da linha, quando ele acrescenta alguma coisa ao rótulo. */
  desenho?: ReactNode;
  rotulo: string;
  children: ReactNode;
}) {
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: espaco.e3,
        paddingVertical: espaco.e1,
      }}
    >
      {desenho && (
        /* O ícone é a segunda pista ao lado da palavra, nunca o lugar dela: o
           rótulo está logo à direita, e quem ouve a tela não vê desenho. */
        <View
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          style={{ width: icone.rotulo, alignItems: "center" }}
        >
          {desenho}
        </View>
      )}
      <View style={{ flex: 1 }}>
        <Txt variante="corpoP" discreto>{rotulo}</Txt>
      </View>
      <View style={{ alignItems: "flex-end", flexShrink: 1 }}>{children}</View>
    </View>
  );
}

/**
 * Uma das três opções de tema.
 *
 * É `radio` e não `checkbox`: as três são exclusivas, e o leitor de tela
 * anuncia "selecionado" dentro de um conjunto em vez de "marcado" numa lista de
 * ligas e desligas. Quem escolheu aparece por TRÊS canais que não são cor: o
 * sinal de conferido à esquerda, o rótulo em negrito, e o contorno mais grosso.
 * Sob sol na tela, o contorno é o que sobra.
 */
function OpcaoDeTema({ valor, rotulo, detalhe, escolhida, aoEscolher }: {
  valor: PreferenciaDeTema;
  rotulo: string;
  /** A segunda linha, quando a opção tem o que explicar de si mesma. */
  detalhe?: string;
  escolhida: boolean;
  aoEscolher: (valor: PreferenciaDeTema) => void;
}) {
  const tema = useTema();

  return (
    <Tocavel
      onPress={() => { aoEscolher(valor); }}
      accessibilityRole="radio"
      accessibilityLabel={detalhe ? `${rotulo}. ${detalhe}` : rotulo}
      accessibilityState={{ checked: escolhida, selected: escolhida }}
      testID={`tema-${valor}`}
      estilo={{
        minHeight: toque,
        flexDirection: "row",
        alignItems: "center",
        gap: espaco.e3,
        paddingHorizontal: espaco.e3,
        paddingVertical: espaco.e2,
        borderRadius: raio.normal,
        /*
          A espessura é a MESMA nas três, e só a cor dela muda.

          Engrossar a escolhida seria a segunda pista mais óbvia, e foi a
          primeira tentativa. O problema é que borda ocupa espaço: um ponto a
          mais de cada lado empurra as opções de baixo dois pontos, então tocar
          numa delas faz a lista inteira andar debaixo do dedo. Quem diz qual
          está valendo, sem depender de cor, é o sinal de conferido e o peso do
          rótulo, e nenhum dos dois mexe no leiaute.
        */
        borderWidth: borda.fio,
        borderColor: escolhida ? tema.destaque : tema.borda,
        backgroundColor: escolhida ? tema.superficie2 : "transparent",
      }}
    >
      {/*
        Largura fixa para os três rótulos começarem na mesma coluna, com ou sem
        sinal à esquerda. Quem alinha é a caixa, não o caractere.

        E esta caixa NÃO se esconde do leitor de tela, ao contrário dos ícones
        de `LinhaDeEstado` logo acima. A diferença é o que está por fora: lá o
        ícone acompanha um rótulo solto, e anunciá-lo faria a tela repetir; aqui
        o invólucro já é um `radio` com rótulo e estado próprios, então o sinal
        não é anunciado de novo de qualquer forma. Esconder custou caro numa
        tentativa anterior: as consultas de teste ignoram subárvore escondida, o
        caso que jurava provar o segundo canal encontrava o ✓ de OUTRO selo da
        mesma tela, e passava verde com o sinal arrancado daqui.
      */}
      <View style={{ width: icone.rotulo, alignItems: "center" }}>
        {escolhida && (
          <Txt variante="corpo" peso={peso.negrito} cor={tema.destaque}>✓</Txt>
        )}
      </View>
      <View style={{ flex: 1, gap: espaco.e1 }}>
        <Txt variante="corpo" peso={escolhida ? peso.negrito : peso.normal}>{rotulo}</Txt>
        {detalhe && <Txt variante="corpoP" discreto>{detalhe}</Txt>}
      </View>
    </Tocavel>
  );
}

export default function Conta() {
  const { identidade, sair, obterToken, lerIdentidade } = useSessao();
  const tema = useTema();
  const escolhaDeTema = useEstadoDoTema();
  const sinal = useSinal();
  const push = usePush();
  const [pendentes, setPendentes] = useState<number | null>(null);
  /*
    A pergunta é estado desta tela, e não um efeito colateral disparado no
    toque. Enquanto ela vale `true` nada aconteceu ainda: a sessão continua de
    pé e a fila continua com dono. Sair só acontece no toque do botão que
    repete o verbo, e é isso que o teste desta tela cobra.
  */
  const [perguntandoSaida, setPerguntandoSaida] = useState(false);
  /*
    O parágrafo de 48 palavras sobre a troca de senha ocupava um cartão
    INTEIRO, sempre aberto, numa tela em que ele nunca é a resposta procurada:
    ele explica por que uma coisa NÃO está ali. Agora a resposta curta fica na
    linha e o porquê fica atrás de um toque, para quem duvidar dela.
  */
  const [porQueASenha, setPorQueASenha] = useState(false);
  /** Qual das duas ações do sistema está em voo agora. Nula: nenhuma. */
  const [acaoDeAviso, setAcaoDeAviso] = useState<null | "permissao" | "ajustes">(null);
  const [pediuPermissaoAgora, setPediuPermissaoAgora] = useState(false);
  const [abriuOsAjustes, setAbriuOsAjustes] = useState(false);

  useEffect(() => {
    let vivo = true;
    void (async () => {
      const fila = await obterFila(enderecoDaApi(), obterToken, lerIdentidade);
      const resumo = await fila.resumo();
      if (vivo) {
        setPendentes(resumo.pendentes + resumo.enviando + resumo.bloqueados);
      }
    })();
    return () => { vivo = false; };
  }, [obterToken, lerIdentidade]);

  /*
    A promessa da saída, e ela precisa ser exata.

    "Continuam guardadas no aparelho" já era verdade: o logout apaga rascunho,
    pendência e assinatura, e não toca na fila. O que faltava era a segunda
    metade: elas só voltam a subir com a SUA conta. Num aparelho de plantão
    compartilhado, o agente que lê isto no fim do turno precisa saber que deixar
    a coleta para o colega enviar não é uma opção, e por quê: o nome de quem
    apresenta o token é o nome que o laudo e a trilha registram como autor da
    vistoria, e a trilha é append-only.
  */
  const avisoDaSaida = pendentes && pendentes > 0
    ? `Você tem ${pendentes} ${pendentes === 1 ? "coleta" : "coletas"} ainda não enviadas. ` +
      "Ao sair, elas continuam guardadas no aparelho e ninguém mais consegue " +
      "enviá-las: o laudo sai com o nome de quem fez a vistoria, que é você. " +
      "Elas voltam a subir quando você entrar de novo, com sinal."
    : "Você vai precisar de sinal e da sua senha para entrar de novo.";

  /*
    Sem identidade a tela devolvia `return null`, ou seja, uma aba em branco.

    Acontece de verdade: a sessão expira, o agente toca em "Minha conta" e
    encontra o nada, sem saber se o aplicativo quebrou, se a conta dele foi
    desativada ou se as coletas do turno sumiram junto. As três perguntas são
    respondidas aqui, e a saída é a única que existe.
  */
  if (!identidade) {
    return (
      <ScrollView contentContainerStyle={{ padding: espaco.e4, gap: espaco.e4 }}>
        <Vazio
          icone={<IconeAparelho cor={tema.textoDiscreto} tamanho={icone.vazio} />}
          titulo="Nenhuma conta aberta neste aparelho"
          descricao={
            "A sessão foi encerrada, ou este aparelho ainda não teve a primeira "
            + "entrada. As coletas já guardadas continuam aqui, esperando a conta "
            + "que as fez."
          }
          acao={{
            titulo: "Ir para a entrada",
            descricao: "Ir para a tela de entrar com email funcional e senha",
            onPress: () => router.replace("/entrar"),
          }}
        />
      </ScrollView>
    );
  }

  const versao = Constants.expoConfig?.version ?? "desconhecida";
  const frases = frasesDoEstado(push.permissao);

  /*
    O estado dos avisos vira chip: símbolo mais palavra, nunca a cor sozinha. O
    `?` do "ainda não perguntado" é literal: o estado dele é de fato uma
    pergunta que ninguém fez.
  */
  const selo: { tom: TomDoChip; simbolo: string } = {
    concedida: { tom: "ok" as const, simbolo: "✓" },
    negada: { tom: "alerta" as const, simbolo: "!" },
    nao_perguntada: { tom: "neutro" as const, simbolo: "?" },
    indisponivel: { tom: "neutro" as const, simbolo: "×" },
  }[push.permissao];

  /*
    O que o pedido de permissão produziu, lido do estado ATUAL e não guardado
    no momento do toque. O provedor atualiza a permissão depois que a caixa do
    sistema fecha, e uma mensagem decidida dentro do `await` falaria do estado
    anterior à resposta, que é justamente o que ninguém quer saber.
  */
  const desfechoDoPedido = !pediuPermissaoAgora ? null : {
    concedida: {
      tom: "sucesso" as const,
      titulo: "Avisos ligados neste aparelho",
      texto:
        "Você passa a ser avisado de tarefa nova e de prazo vencendo. O que "
        + "aparece na tela bloqueada não traz endereço nem protocolo.",
    },
    negada: {
      tom: "alerta" as const,
      titulo: "O sistema registrou o não",
      texto:
        "A caixa do sistema só aparece uma vez por instalação. Para voltar a "
        + "receber aviso, o caminho agora é ligar a notificação nos ajustes do "
        + "aparelho, no botão abaixo.",
    },
    nao_perguntada: {
      tom: "info" as const,
      titulo: "A caixa do sistema não chegou a abrir",
      texto: "Nada mudou neste aparelho. Você pode tocar de novo.",
    },
    indisponivel: {
      tom: "info" as const,
      titulo: "Este aparelho não recebe notificação",
      texto:
        "As tarefas continuam aparecendo quando você abre o aplicativo, e nada "
        + "do seu trabalho depende deste aviso.",
    },
  }[push.permissao];

  return (
    <ScrollView contentContainerStyle={{ padding: espaco.e4, gap: espaco.e4 }}>
      {/*
        IDENTIDADE. Sem rótulo, porque a hierarquia de tipografia já diz o que
        cada linha é, e porque nada aqui muda nem pede ação.
      */}
      <Cartao>
        <View style={{ gap: espaco.e1 }}>
          <Txt variante="h2">{identidade.nome}</Txt>
          <Txt variante="corpoP" peso={peso.forte}>{ROTULO_PAPEL[identidade.papel]}</Txt>
          <Txt variante="corpoP" discreto>
            {identidade.organizacaoNome}, {identidade.municipio}/{identidade.uf}
          </Txt>
        </View>

        <Separador />

        <LinhaDeEstado rotulo="Senha">
          <Txt variante="corpoP" peso={peso.forte}>Trocada no painel</Txt>
        </LinhaDeEstado>
        <Botao
          titulo={porQueASenha ? "Ocultar a explicação" : "Por que não aqui?"}
          tipo="discreto"
          testID="por-que-a-senha"
          descricao="Por que a troca de senha não é feita no aplicativo"
          estilo={{ alignSelf: "flex-start", paddingHorizontal: 0 }}
          onPress={() => { setPorQueASenha((v) => !v); }}
        />
        {porQueASenha && (
          <Txt variante="corpoP" discreto>
            A troca é feita no painel da coordenação, pelo navegador, em "Minha
            conta". Aqui no aparelho ela não é oferecida de propósito: trocar a
            senha encerra as outras sessões, e fazer isso no meio de uma
            vistoria deixaria a fila sem conseguir enviar.
          </Txt>
        )}
      </Cartao>

      {/* ESTADO. O que muda sozinho, alinhado numa coluna para se conferir de
          relance, mais a ficha técnica do binário depois do separador. */}
      <Cartao titulo="Este aparelho">
        <LinhaDeEstado
          rotulo="Conexão agora"
          desenho={sinal.temSinal
            ? <IconeSinal cor={tema.textoDiscreto} tamanho={icone.rotulo} />
            : <IconeSemSinal cor={tema.textoDiscreto} tamanho={icone.rotulo} />}
        >
          <Txt variante="corpoP" peso={peso.forte}>
            {sinal.temSinal
              ? `Com sinal${sinal.tipo ? `, por ${sinal.tipo}` : ""}`
              : "Sem sinal"}
          </Txt>
        </LinhaDeEstado>

        <LinhaDeEstado
          rotulo="Coletas esperando envio"
          desenho={<IconeEnvio cor={tema.textoDiscreto} tamanho={icone.rotulo} />}
        >
          {pendentes === null ? (
            /*
              O único indicador de carregamento da tela era a palavra
              "conferindo" em corpo normal, no meio de uma coluna de valores:
              indistinguível de um valor que fosse mesmo "conferindo". Agora
              quem diz que há uma leitura em voo é um indicador de verdade, com
              nome falado, e a palavra fica ao lado dele.
            */
            <View style={{ flexDirection: "row", alignItems: "center", gap: espaco.e2 }}>
              <ActivityIndicator
                testID="conferindo-coletas"
                accessibilityRole="progressbar"
                accessibilityLabel="Conferindo as coletas guardadas neste aparelho"
                color={tema.destaque}
              />
              <Txt variante="corpoP" discreto>Conferindo</Txt>
            </View>
          ) : pendentes === 0 ? (
            <Txt variante="corpoP" peso={peso.forte}>Nenhuma</Txt>
          ) : (
            <Chip
              testID="coletas-esperando"
              texto={`${pendentes} esperando`}
              simbolo="↑"
              tom="alerta"
              descricao={`${pendentes} ${pendentes === 1 ? "coleta espera" : "coletas esperam"} sinal para serem enviadas`}
            />
          )}
        </LinhaDeEstado>

        <Separador />

        <LinhaDeEstado rotulo="Versão do aplicativo">
          <Txt variante="corpoP" mono>{versao}</Txt>
        </LinhaDeEstado>
        {/* Qual servidor este binário conversa. Sem isto, descobrir que o
            aparelho ficou em homologação exige abrir o código. */}
        <LinhaDeEstado rotulo="Servidor">
          <Txt variante="corpoP" mono>{enderecoDaApi()}</Txt>
        </LinhaDeEstado>
      </Cartao>

      {/*
        A APARÊNCIA, e por que ela é um cartão próprio em vez de mais uma linha
        em "Este aparelho".

        Esta tela tinha duas naturezas, e a frente F7 as separou com esse nome:
        identidade (quem assina o laudo, não muda, não pede nada) e estado (o
        que muda sozinho e se confere de relance). A escolha de tema não é
        nenhuma das duas, e encaixá-la à força numa delas estragaria a separação
        que foi cara de conseguir:

        - Em IDENTIDADE ela prometeria o que não cumpre. Identidade é da pessoa
          e viaja com ela para qualquer aparelho onde a conta abrir; o tema fica
          neste telefone. No aparelho de plantão compartilhado a diferença é
          concreta: quem escolheu claro aqui não escolheu claro no aparelho do
          colega.
        - Em "ESTE APARELHO" ela seria um controle no meio de uma coluna de
          valores que só se leem. Aquele cartão é feito de rótulo à esquerda e
          valor à direita, e é justamente esse alinhamento que faz três linhas
          se conferirem de relance. Um tocável de 52 pontos no meio dele ou
          parece mais um valor (e ninguém descobre que dá para tocar), ou
          desmancha o alinhamento das outras linhas.

        Então: cartão próprio, ao lado de "Avisos deste aparelho", que é o outro
        lugar desta tela onde o agente DECIDE alguma coisa sobre este telefone
        em vez de conferir. Os dois ficam juntos de propósito, e depois do que
        se confere: quem abre esta aba no meio do plantão vem ver o estado, não
        ajustar preferência.
      */}
      <Cartao titulo="Aparência">
        <Txt variante="corpoP" discreto>
          A tela clara se lê melhor com sol batendo nela, e a escura cansa menos
          no plantão da noite. O sistema decide pelo horário, que nem sempre é o
          que você está vendo.
        </Txt>
        {/* `radiogroup` junta as três para o leitor de tela, que passa a
            anunciar "1 de 3" em vez de três controles soltos e sem relação. */}
        <View
          accessibilityRole="radiogroup"
          accessibilityLabel="Tema da tela"
          style={{ gap: espaco.e2 }}
        >
          <OpcaoDeTema
            valor="sistema"
            rotulo="Acompanhar o sistema"
            /*
              O detalhe diz no que a opção DÁ agora. Sem ele, "acompanhar o
              sistema" é a única das três que não mostra o próprio resultado, e
              quem está decidindo teria que sair dos ajustes do telefone para
              descobrir o que escolheu.
            */
            detalhe={escolhaDeTema.doSistema === "claro"
              ? "O sistema está no modo claro agora"
              : "O sistema está no modo escuro agora"}
            escolhida={escolhaDeTema.preferencia === "sistema"}
            aoEscolher={escolhaDeTema.escolher}
          />
          <OpcaoDeTema
            valor="claro"
            rotulo="Sempre claro"
            escolhida={escolhaDeTema.preferencia === "claro"}
            aoEscolher={escolhaDeTema.escolher}
          />
          <OpcaoDeTema
            valor="escuro"
            rotulo="Sempre escuro"
            escolhida={escolhaDeTema.preferencia === "escuro"}
            aoEscolher={escolhaDeTema.escolher}
          />
        </View>
        <Txt variante="corpoP" discreto>
          A escolha vale só neste aparelho e continua valendo depois de sair da
          conta.
        </Txt>
      </Cartao>

      {/*
        Os avisos, e o caminho de volta para quem já recusou.

        Este cartão existe por causa de uma característica do iOS que não tem
        conserto pelo código: a caixa de permissão do sistema aparece UMA vez
        por instalação, e depois de um "não" ela nunca mais abre. Quem recusou
        fica sem aviso de prazo para sempre, e nada na tela dizia isso: nem o
        agente, nem a coordenação, nem o servidor tinham como saber, porque a
        entrega continua sendo bem sucedida do lado de lá.

        Por isso o estado é escrito com todas as letras, e o único caminho que
        de fato funciona (os ajustes do sistema) é oferecido aqui, onde a pessoa
        procura quando quer, em vez de aparecer sozinho quando ela não quer.
      */}
      <Cartao titulo="Avisos deste aparelho">
        <LinhaDeEstado
          rotulo="Notificação de tarefa e de prazo"
          desenho={<IconeAparelho cor={tema.textoDiscreto} tamanho={icone.rotulo} />}
        >
          {/*
            PESO LEVE, pela régua de densidade (`src/ui/regua.ts`, R1 e R2).

            Este cartão empilhava três blocos preenchidos: este chip, o aviso do
            desfecho do último pedido e o aviso de falha no registro. Pela régua,
            na disputa ganha o mais alto, e aqui é o AVISO DE FALHA: ele é o
            único dos três que diz que alguma coisa quebrou.

            Este chip é ETIQUETA PERMANENTE: ele descreve em que estado a
            permissão está, e vai estar na tela em toda abertura, para sempre.
            Retângulo cheio permanente é textura, não recado, e ainda gasta o
            destaque que o erro eventual precisa ter.
          */}
          <Chip texto={frases.titulo} simbolo={selo.simbolo} tom={selo.tom} peso="leve" />
        </LinhaDeEstado>
        <Txt variante="corpoP" discreto>{frases.texto}</Txt>

        {/*
          Os dois botões chamam o SISTEMA, e a tela não mudava nada ao fazer
          isso: nem enquanto a chamada estava em voo, nem depois que ela voltou.
          Um toque sem consequência visível é um toque que a pessoa repete.
        */}
        {push.permissao === "nao_perguntada" && (
          <Botao
            titulo={acaoDeAviso === "permissao" ? "Perguntando ao sistema" : "Ligar os avisos"}
            tipo="secundario"
            carregando={acaoDeAviso === "permissao"}
            desabilitado={acaoDeAviso !== null}
            onPress={() => void (async () => {
              setAcaoDeAviso("permissao");
              try {
                await push.pedirPermissao();
              } finally {
                setAcaoDeAviso(null);
                setPediuPermissaoAgora(true);
              }
            })()}
          />
        )}

        {ofereceAjustes(push.permissao) && (
          <Botao
            titulo={acaoDeAviso === "ajustes" ? "Abrindo os ajustes" : "Abrir os ajustes do aparelho"}
            tipo="secundario"
            descricao="Abrir os ajustes do sistema para ligar as notificações deste aplicativo"
            carregando={acaoDeAviso === "ajustes"}
            desabilitado={acaoDeAviso !== null}
            onPress={() => void (async () => {
              setAcaoDeAviso("ajustes");
              try {
                await push.abrirAjustes();
              } finally {
                setAcaoDeAviso(null);
                setAbriuOsAjustes(true);
              }
            })()}
          />
        )}

        {/* Leve pela mesma régua: confirmação de um toque que acabou de
            acontecer. O tom `perigo` não alevia sozinho, e está certo, porque
            aí o pedido falhou de verdade. */}
        {desfechoDoPedido && (
          <Aviso tom={desfechoDoPedido.tom} peso="leve" titulo={desfechoDoPedido.titulo}>
            {desfechoDoPedido.texto}
          </Aviso>
        )}

        {/*
          A frase daqui era um contorno, e o contorno saiu junto com o defeito.

          Ela dizia "feche e abra este aplicativo de novo para ele perceber", e
          era verdade: o provedor de notificação lia a permissão na montagem e
          na troca de sessão, e nunca na volta do segundo plano. Quem ligava a
          notificação nos ajustes voltava para esta tela, encontrava a mesma
          frase de antes e concluía que não tinha funcionado. Pior que a frase
          era a ficha, que só é registrada depois da permissão concedida: o
          aparelho ficava sem ficha no servidor, e o aviso de prazo não saía.

          Hoje `ProvedorDePush` escuta `AppState` e relê a permissão ao voltar,
          registrando a ficha que faltava. Ver
          `src/push/volta-do-segundo-plano.test.tsx`.
        */}
        {abriuOsAjustes && (
          <Aviso tom="info" titulo="Os ajustes foram abertos">
            Se você ligou a notificação por lá, é só voltar para cá: o estado
            acima se atualiza sozinho.
          </Aviso>
        )}

        {/*
          Push desligado no servidor não é defeito e não pode alarmar: o agente
          não tem o que fazer a respeito. A frase existe para ele não passar a
          semana achando que o aparelho dele está quebrado.
        */}
        {push.registro === "push_desligado" && (
          <Aviso tom="info">
            A prefeitura ainda não ligou o envio de aviso neste servidor. As
            tarefas continuam aparecendo quando você abre o aplicativo.
          </Aviso>
        )}
        {push.registro === "falhou" && (
          <Aviso tom="alerta">
            Não deu para registrar este aparelho para receber aviso. Entre de
            novo com sinal, e avise a coordenação se continuar assim.
          </Aviso>
        )}
      </Cartao>

      {pendentes !== null && pendentes > 0 && (
        <Aviso tom="alerta" titulo="Espere a fila esvaziar antes de sair">
          Procure sinal e espere a fila esvaziar. Enquanto você estiver fora da
          conta, estas coletas não são enviadas, nem por quem entrar depois
          neste aparelho.
        </Aviso>
      )}

      <Botao
        titulo="Sair da conta"
        tipo="perigo"
        onPress={() => { setPerguntandoSaida(true); }}
      />

      <Dialogo
        aberto={perguntandoSaida}
        titulo="Sair da conta?"
        texto={avisoDaSaida}
        /*
          O rótulo repete o verbo. "OK" aqui responderia à pergunta do título
          sem dizer o que acontece com as coletas que estão no aparelho, e é
          exatamente essa a dúvida de quem está lendo isto no fim do plantão.
        */
        acao={{
          rotulo: "Sair da conta",
          destrutiva: true,
          aoTocar: () => void (async () => {
            await sair();
            router.replace("/entrar");
          })(),
        }}
        recusa={{ rotulo: "Continuar conectado" }}
        aoFechar={() => { setPerguntandoSaida(false); }}
      />
    </ScrollView>
  );
}
