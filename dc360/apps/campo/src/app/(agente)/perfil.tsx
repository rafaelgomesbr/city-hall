import { useCallback, useEffect, useState, type ReactNode } from "react";
import { ActivityIndicator, RefreshControl, ScrollView, View } from "react-native";
import { router } from "expo-router";
import Constants from "expo-constants";
import { ROTULO_PAPEL, ROTULO_SEVERIDADE, ROTULO_TIPO_COBRADE, type Severidade } from "@dc360/shared";
import {
  SemSinal, enderecoDaApi, normalizarMeuTrabalho, type MeuTrabalho,
} from "../../dados/api";
import {
  AVISOS_VAZIOS, avisosGuardados, complementoDoAviso, fraseDoAviso,
  marcarAvisosComoLidosNoAparelho, sincronizarAvisos, type AvisosGuardados,
} from "../../dados/avisos";
import { atualizarMeuTrabalho, meuTrabalhoGuardado } from "../../dados/pendencias";
import { obterFila } from "../../dados/fila";
import { useSessao } from "../../dados/sessao";
import { useSinal } from "../../dados/conectividade";
import { usePush } from "../../push/contexto";
import { frasesDoEstado, ofereceAjustes } from "../../push/permissao";
import type { PreferenciaDeTema } from "../../dados/preferencia-de-tema";
import {
  Aviso, Botao, Cartao, Carregando, Dado, Separador, Tocavel, Txt, Vazio,
  useEstadoDoTema, useTema,
} from "../../ui/componentes";
import { Chip, type TomDoChip } from "../../ui/Chip";
import { Dialogo } from "../../ui/Dialogo";
import {
  IconeAlerta, IconeAparelho, IconeAssinatura, IconeEnvio, IconeEquipe, IconeGps,
  IconeInformacao, IconeOrgao, IconePrazoVencido, IconeSemSinal, IconeSinal,
  IconeSucesso,
} from "../../ui/icones";
import { borda, espaco, icone, peso, raio, toque } from "../../ui/tokens";
import { idadeEmPalavras } from "../../dados/atualizacao";

/**
 * PERFIL: quem eu sou aqui, e como está o meu aparelho.
 *
 * Esta tela é a fusão de duas, "Minha equipe" e "Minha conta", e a fusão é a
 * correção. As duas respondiam à MESMA pergunta, e a segunda estava escondida
 * atrás de um botão no fim do rolamento da primeira: quem quisesse conferir a
 * versão do aplicativo ou trocar o tema precisava abrir a equipe, rolar dez
 * vistorias concluídas e achar um botão secundário no rodapé. Uma tela que só
 * se alcança pelo fim de outra é uma tela que a maioria nunca vê.
 *
 * ## O que a fusão preserva, porque já estava certo
 *
 * - **Identidade não se desenha como estado.** Identidade é quem assina o
 *   laudo: não muda enquanto a sessão durar, não pede nada, e o que se precisa
 *   dela é reconhecer de relance. Ela é um bloco de TIPOGRAFIA, sem rótulo
 *   nenhum, porque ninguém precisa da palavra "Nome" para saber que aquilo é um
 *   nome. Estado é o que muda sozinho e às vezes pede ação, e ele é linha com
 *   ícone, rótulo à esquerda e valor alinhado à direita, numa coluna só: três
 *   linhas alinhadas se conferem de relance, nove blocos empilhados se leem um
 *   a um.
 * - **O alternador de tema de três estados**, com a escolha dita por três
 *   canais que não são cor.
 * - **O `aoDesistir` no `Carregando`.** Esta continua sendo a única tela do
 *   aplicativo que o passa, e por isso a única em que a saída aos seis segundos
 *   funciona de fato. O que mudou é o ALCANCE dela: a espera agora acontece
 *   dentro do cartão do trabalho, e não na tela inteira. Antes, enquanto "meu
 *   trabalho" não chegava, a aba inteira era uma roda girando, e isso significa
 *   que trocar o tema ou sair da conta dependia de uma chamada de rede que nada
 *   ali exige.
 * - **Um indicador por fato.** A busca em voo é contada pelo texto; o botão só
 *   fica desabilitado, que é a outra coisa, e a única que ele tem para dizer.
 *
 * ## O que a identidade 2.0 trouxe
 *
 * O número do trabalho concluído virou `Dado`: número grande com rótulo
 * discreto, que é o que `CLAUDE.md` pede desde o primeiro dia e o aplicativo
 * ainda não fazia em lugar nenhum.
 *
 * E **"coletada sem sinal e enviada depois" saiu da lista e virou peça.** O
 * comentário que a escreveu chama isso de "transformar o offline de promessa em
 * prova", e ela já tinha subido de quinta linha cinza para etiqueta com ícone.
 * Agora ela tem cartão próprio, com elevação de destaque e número grande: é a
 * única coisa nesta tela que o agente não sabia antes de abrir, e é a resposta
 * para a dúvida que este produto inteiro existe para resolver.
 *
 * ## Onde o sino mora, e por quê
 *
 * `GET /avisos` existe desde o T8, foi escrita **sem `exigirPermissao`,
 * expressamente para não deixar "operador e agente de campo sem sino nenhum"**,
 * e o aplicativo nunca a chamou. Ela mora AQUI, e não no topo de todas as
 * telas, por quatro razões:
 *
 * 1. **O sino precisa de rede, e toda tela deste aplicativo abre do disco.** Um
 *    sino permanente no topo seria o único elemento fixo do produto que fica
 *    vazio ou velho justamente no morro, e ele ficaria ao lado da
 *    `FaixaDeSincronizacao`, que é o elemento assinatura do aplicativo e nunca
 *    mente. Dois indicadores de estado no topo, um deles desatualizado, estragam
 *    o que nunca falha para melhorar o que quase nunca importa.
 * 2. **A quarta aba já foi recusada por argumento**, em `_layout.tsx`: "Três
 *    abas, e não cinco (...) Duas abas a mais seriam duas invenções".
 * 3. **O aviso é CONTEXTO, e não trabalho.** Os quatro tipos que o sino carrega
 *    (vistoria recebida, prazo vencido, órgão respondeu, retorno não
 *    confirmado) são fatos do município escritos para o sino da coordenação. O
 *    trabalho do agente chega pela lista de tarefas, que é despachada para a
 *    equipe dele e vem do disco. Pôr contexto onde mora o trabalho é competir
 *    com o trabalho.
 * 4. **Ele pertence ao lado de "Avisos deste aparelho".** Aquele cartão diz se o
 *    CANAL funciona; o sino mostra o que passou pelo canal. É por isso que a
 *    rota existe: o push manda dois tipos de aviso e pode não alcançar. Juntos,
 *    os dois respondem "não recebi aviso nenhum" num lugar só.
 *
 * O que não se perde com isso é a visibilidade: **a contagem de não lidos vira
 * crachá na aba Perfil**, exatamente como o número da fila já faz na aba Envio.
 * O número se vê de qualquer tela, o conteúdo está a um toque, e nenhuma aba
 * nova foi inventada.
 */

/**
 * Um agrupamento de cartões, com o nome do grupo acima deles.
 *
 * Existe porque a fusão empilhou oito cartões numa aba só, e oito cartões
 * seguidos sem nada entre eles são uma lista, não uma organização: o olho não
 * tem como saber que "Aparência" e "Avisos deste aparelho" falam do telefone
 * enquanto "A minha equipe" fala do município. O rótulo em caixa alta discreta
 * é o degrau `rotulo` da régua de hierarquia, que é justamente o papel de
 * nomear sem competir.
 */
function Grupo({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <View style={{ gap: espaco.e3 }}>
      <Txt nivel="rotulo">{titulo}</Txt>
      {children}
    </View>
  );
}

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

/**
 * A inicial do colega, para a lista ter ritmo vertical em vez de ser parágrafo.
 *
 * Não é enfeite: com dez nomes empilhados, a inicial é o que permite achar o
 * colega procurado sem ler a lista inteira. Duas letras quando há sobrenome,
 * porque uma equipe com dois "Carlos" viraria dois "C" idênticos.
 */
/* Sem `export`: tudo dentro de `src/app` é rota do Expo, e um arquivo de rota
   exporta a tela, não utilitário. Quem prova a inicial é a tela renderizada. */
function iniciaisDe(nome: string): string {
  const partes = nome.trim().split(/\s+/).filter(Boolean);
  const primeira = partes[0] ?? "";
  /* Nome vazio existe: o cadastro do município é de quem cadastrou, não nosso.
     Um círculo em branco pareceria defeito; a interrogação diz o que houve. */
  if (!primeira) return "?";
  const ultima = partes.length > 1 ? (partes[partes.length - 1] ?? "") : "";
  return ((primeira[0] ?? "") + (ultima[0] ?? "")).toUpperCase();
}

/**
 * Coletada e sincronizada em momentos diferentes significa sem sinal.
 *
 * Um minuto de folga porque a sincronização imediata também leva alguns
 * segundos: sem a folga, toda vistoria concluída na base viraria "prova do
 * offline", e uma prova que vale sempre não prova nada.
 */
function foiColetadaSemSinal(v: { coletada_em: string; sincronizada_em: string }): boolean {
  return new Date(v.sincronizada_em).getTime()
    - new Date(v.coletada_em).getTime() > 60_000;
}

/** O ícone de cada tipo de aviso, pelo que o fato é. */
function DesenhoDoAviso({ tipo, cor }: { tipo: string; cor: string }) {
  const tamanho = icone.rotulo;
  if (tipo === "prazo_vencido") return <IconePrazoVencido cor={cor} tamanho={tamanho} />;
  if (tipo === "vistoria_recebida") return <IconeAssinatura cor={cor} tamanho={tamanho} />;
  if (tipo === "providencia_respondida") return <IconeOrgao cor={cor} tamanho={tamanho} />;
  if (tipo === "retorno_nao_confirmado") return <IconeAlerta cor={cor} tamanho={tamanho} />;
  /* Tipo que este aplicativo ainda não aprendeu continua com desenho, e não com
     um buraco: ver `fraseDoAviso`. Impreciso ainda é legível. */
  return <IconeInformacao cor={cor} tamanho={tamanho} />;
}

/** Quantas vistorias concluídas a tela lista. O total de verdade vem do servidor. */
const CONCLUIDAS_NA_TELA = 10;

/** Quantos avisos a tela lista de uma vez. O resto continua guardado. */
const AVISOS_NA_TELA = 8;

export default function Perfil() {
  const tema = useTema();
  const sinal = useSinal();
  const push = usePush();
  const escolhaDeTema = useEstadoDoTema();
  const { identidade, sair, obterToken, lerIdentidade } = useSessao();

  const [dados, setDados] = useState<MeuTrabalho | null>(null);
  const [baixadoEm, setBaixadoEm] = useState<string | null>(null);
  const [atualizando, setAtualizando] = useState(false);
  /*
    O agente cansou de esperar e pediu para sair da tela de espera.

    Não cancela a busca, de propósito: a resposta pode chegar meio segundo
    depois, e jogar fora uma resposta que já está a caminho gastaria o dado do
    agente duas vezes pelo mesmo dado. O que isto muda é só quem manda na tela,
    que volta a ser ele.
  */
  const [desistiuDeEsperar, setDesistiuDeEsperar] = useState(false);
  const [avisoDeRede, setAvisoDeRede] = useState<string | null>(null);
  const [agora, setAgora] = useState(() => new Date());

  const [avisos, setAvisos] = useState<AvisosGuardados>(AVISOS_VAZIOS);
  const [pendentes, setPendentes] = useState<number | null>(null);
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
    const t = setInterval(() => setAgora(new Date()), 30_000);
    return () => { clearInterval(t); };
  }, []);

  const lerDoDisco = useCallback(async () => {
    const guardado = await meuTrabalhoGuardado();
    if (guardado) {
      /*
        NORMALIZA O QUE VEIO DO DISCO, e não só o que veio da rede.

        O registro pode ter sido gravado por uma versão anterior deste
        aplicativo, quando `totalConcluidas` nem era lido: sem normalizar, o
        tipo prometeria `number` e a tela receberia `undefined` exatamente no
        caso em que ela mais precisa funcionar, que é o aparelho sem sinal.
      */
      setDados(normalizarMeuTrabalho(guardado.dados));
      setBaixadoEm(guardado.baixadoEm);
    }
    return guardado;
  }, []);

  const buscarNaRede = useCallback(async () => {
    setAtualizando(true);
    setDesistiuDeEsperar(false);
    setAvisoDeRede(null);
    try {
      const token = await obterToken();
      if (!token) return;

      /*
        AS DUAS BUSCAS SÃO UM TOQUE SÓ E DOIS FRACASSOS SEPARADOS.

        Um toque só porque duas atualizações independentes seriam duas idas ao
        3G do morro para montar uma tela só, e porque ninguém entende por que
        uma metade da tela está velha e a outra não.

        Dois fracassos separados porque as duas coisas valem diferente. O sino é
        o recurso menos crítico do produto: uma falha nele não pode apagar o
        registro do trabalho do agente da tela. E o contrário também: um
        servidor que ainda não tem a rota de "meu trabalho" não pode deixar o
        agente sem o único canal que funciona quando o push não alcança.
      */
      try {
        setDados(await atualizarMeuTrabalho(token));
        setBaixadoEm(new Date().toISOString());
      } catch (erro: unknown) {
        setAvisoDeRede(
          erro instanceof SemSinal
            ? "Sem sinal para atualizar. Mostrando o que já estava no aparelho."
            : "Não deu para atualizar agora. Mostrando o que já estava no aparelho.",
        );
      }

      try {
        setAvisos(await sincronizarAvisos(token));
      } catch {
        /* O que já estava guardado continua na tela, com a data da última vez.
           O rodapé do cartão de avisos é quem diz quando foi. */
      }
    } catch {
      /* Nem o token saiu: renovar precisa de rede, e sem ela não há o que
         buscar. A tela continua sendo a do disco, que é a promessa. */
      setAvisoDeRede(
        "Sem sinal para atualizar. Mostrando o que já estava no aparelho.",
      );
    } finally {
      setAtualizando(false);
    }
  }, [obterToken]);

  useEffect(() => {
    void (async () => {
      /* O disco primeiro, SEMPRE, e nas duas fontes: é o que faz esta aba abrir
         no alto do morro em vez de existir só na base. */
      setAvisos(await avisosGuardados());
      const guardado = await lerDoDisco();
      // Sem cópia local, buscar é a única saída. Com cópia, buscar é conforto,
      // e conforto não justifica gastar o dado do agente sem sinal.
      if (!guardado || sinal.temSinal) await buscarNaRede();
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

    Acontece de verdade: a sessão expira, o agente toca em "Perfil" e encontra o
    nada, sem saber se o aplicativo quebrou, se a conta dele foi desativada ou
    se as coletas do turno sumiram junto. As três perguntas são respondidas
    aqui, e a saída é a única que existe.
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
  const eu = identidade.usuarioId;
  const colegasAtivos = dados?.colegas.filter((c) => c.ativo) ?? [];
  const concluidas = dados?.concluidas ?? [];
  const naTela = concluidas.slice(0, CONCLUIDAS_NA_TELA);
  const semSinalNaLista = concluidas.filter(foiColetadaSemSinal).length;
  const avisosNaTela = avisos.itens.slice(0, AVISOS_NA_TELA);
  const porLer = avisos.itens.filter((a) => !a.lido).map((a) => a.id);

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
    <ScrollView
      testID="tela-do-perfil"
      contentContainerStyle={{ padding: espaco.e4, gap: espaco.e5 }}
      refreshControl={
        <RefreshControl
          refreshing={atualizando}
          onRefresh={() => void buscarNaRede()}
          tintColor={tema.destaque}
        />
      }
    >
      {/*
        PESO LEVE, pela R2 da régua de densidade, e a fusão é quem cobrou isso.

        Nas duas telas separadas este aviso era o único bloco preenchido da sua.
        Juntas, ele disputa com "espere a fila esvaziar antes de sair", que está
        logo acima do botão de saída, e os dois podem estar na tela ao mesmo
        tempo. Na disputa ganha o mais grave, e ele não é este: falhar em
        atualizar é rotina num aparelho de campo e não custa nada (a tela mostra
        o que já estava no disco), enquanto sair da conta com coleta na fila é
        trabalho que nenhum colega consegue enviar.
      */}
      {avisoDeRede && <Aviso tom="alerta" peso="leve">{avisoDeRede}</Aviso>}

      <Grupo titulo="Eu">
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
            {/*
              A MATRÍCULA, que esta tela nunca mostrou e sai impressa em todo
              documento que o agente assina (ver o tipo `Identidade`). Em fonte
              tabular, como todo número deste produto que alguém dita por rádio.
            */}
            <Txt variante="legenda" discreto mono>Matrícula {identidade.matricula}</Txt>
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

        {/*
          O TRABALHO CONCLUÍDO, com o número que o servidor manda.

          O número era o tamanho da lista, e a lista corta em cinquenta: o agente
          que assinou 62 vistorias numa temporada de chuva lia "50", e as doze
          mais antigas não apareciam em lugar nenhum, sem rodapé, sem aviso e sem
          "ver mais". Se ele precisasse mostrar que vistoriou aquele imóvel em
          janeiro, a tela AFIRMAVA que ele nunca vistoriou.
        */}
        <Cartao>
          {dados === null ? (
            atualizando && !desistiuDeEsperar ? (
              /*
                A espera mora DENTRO do cartão, e não na tela inteira.

                Enquanto ela era a aba toda, trocar o tema ou sair da conta
                dependia de uma chamada de rede que nenhuma das duas coisas
                exige. O `aoDesistir` continua aqui, e esta continua sendo a
                única espera do aplicativo que oferece a saída de verdade.
              */
              <Carregando
                mensagem="Abrindo o seu trabalho"
                aoDesistir={() => setDesistiuDeEsperar(true)}
              />
            ) : (
              <>
                <Vazio
                  icone={<IconeEquipe cor={tema.textoDiscreto} tamanho={icone.vazio} />}
                  titulo="O seu trabalho ainda não foi baixado"
                  descricao={
                    "Isto precisa de sinal uma vez só. Faça na base, antes de sair, "
                    + "e depois a sua equipe e as suas vistorias aparecem aqui mesmo "
                    + "sem conexão."
                  }
                />
                {/*
                  Um indicador por fato, e o fato aqui é um só: existe uma busca
                  em voo. Quem conta isso é o texto. O botão não repete a mesma
                  notícia com uma roda girando dentro dele: ele só fica
                  desabilitado, que é a outra coisa, e a única que ele tem para
                  dizer.
                */}
                <Botao
                  titulo="Baixar o meu trabalho"
                  testID="baixar-meu-trabalho"
                  onPress={() => void buscarNaRede()}
                  desabilitado={!sinal.temSinal || atualizando}
                />
                {atualizando && (
                  <Txt variante="corpoP" discreto alinhamento="center">
                    Buscando o seu trabalho. Você pode continuar usando as outras
                    abas.
                  </Txt>
                )}
                {!sinal.temSinal && (
                  <Aviso tom="alerta">
                    Sem sinal agora. Tente de novo quando a conexão voltar.
                  </Aviso>
                )}
              </>
            )
          ) : (
            <>
              <Dado
                testID="total-de-concluidas"
                valor={String(dados.totalConcluidas)}
                rotulo={dados.totalConcluidas === 1
                  ? "vistoria concluída" : "vistorias concluídas"}
              />
              {dados.totalConcluidas === 0 ? (
                <Txt variante="corpoP" discreto>
                  Assim que a primeira for enviada e a coordenação receber, ela
                  aparece aqui com a data.
                </Txt>
              ) : (
                <Txt variante="corpoP" discreto>
                  Todas assinadas por você, desde a primeira. É este número que
                  vale quando alguém perguntar o que você já entregou.
                </Txt>
              )}
            </>
          )}
        </Cartao>

        {/*
          A PROVA DE QUE O OFFLINE FUNCIONA, e ela ganhou cartão próprio.

          Esta frase já foi a quinta linha cinza de um bloco de cinco linhas
          cinzas, e depois virou etiqueta com ícone dentro de cada item da lista.
          O comentário que a escreveu diz o que ela é: o que "transforma o
          offline de promessa em prova, para a pessoa que mais precisa acreditar
          nele". Ela é a única coisa nesta tela que o agente não sabia antes de
          abrir, e por isso é a única que recebe elevação de destaque.

          Só aparece quando existe: um cartão em destaque dizendo "0 coletadas
          sem sinal" seria a tela chamando atenção para o nada.
        */}
        {semSinalNaLista > 0 && (
          <Cartao nivel="flutuante">
            <Dado
              testID="coletadas-sem-sinal"
              valor={String(semSinalNaLista)}
              rotulo={semSinalNaLista === 1
                ? "coletada sem sinal" : "coletadas sem sinal"}
              cor={tema.okTexto}
            />
            <View style={{ flexDirection: "row", alignItems: "center", gap: espaco.e2 }}>
              <View
                accessibilityElementsHidden
                importantForAccessibility="no-hide-descendants"
              >
                <IconeSemSinal cor={tema.okTexto} tamanho={icone.rotulo} />
              </View>
              <View style={{ flex: 1 }}>
                <Txt variante="corpoP">
                  Feitas no morro, sem conexão, e enviadas inteiras depois. O
                  aparelho guardou tudo: checklist, fotos, GPS e assinatura.
                </Txt>
              </View>
            </View>
            {/*
              O denominador é dito, e ele não é o total. A marca de "sem sinal"
              só existe nas vistorias que o aparelho baixou, e quem baixa corta
              no teto do servidor: afirmar a proporção sobre o total seria
              inventar um número que ninguém contou.
            */}
            <Txt variante="legenda" discreto>
              Entre as {concluidas.length} mais recentes que este aparelho baixou.
            </Txt>
          </Cartao>
        )}

        {concluidas.length > 0 && (
          <Cartao titulo="As mais recentes">
            <View style={{ gap: espaco.e3 }}>
              {naTela.map((v, posicao) => (
                <View key={v.id} style={{ gap: espaco.e2 }}>
                  {/* O fio entre itens existe porque cinco blocos colados de
                      três linhas cada viram um parágrafo só de longe. */}
                  {posicao > 0 && <Separador />}
                  <View style={{ flexDirection: "row", alignItems: "baseline", gap: espaco.e2 }}>
                    <View style={{ flex: 1 }}>
                      <Txt variante="corpoP" mono peso={peso.negrito}>{v.protocolo}</Txt>
                    </View>
                    <Txt variante="legenda" discreto numeroDeLinhas={1}>
                      {new Date(v.coletada_em).toLocaleString("pt-BR")}
                    </Txt>
                  </View>
                  <Txt variante="corpo">{ROTULO_TIPO_COBRADE[v.tipo] ?? v.tipo}</Txt>
                  <Txt variante="legenda" discreto>{v.endereco}</Txt>
                  {/*
                    QUEM ASSINOU E COM QUE PRECISÃO, dois campos que o SQL da
                    rota já trazia e o tipo do aplicativo não declarava, então
                    eles chegavam no aparelho e eram descartados na fronteira do
                    TypeScript.

                    Os dois respondem à mesma pergunta, meses depois: o que esta
                    vistoria prova. O nome responde quem estava na porta; a
                    precisão separa "o ponto é este" de "o ponto é por aqui", que
                    é a diferença entre prova de localização e prova de presença.
                  */}
                  {(v.assinante_nome !== null || v.gps_precisao_metros !== null) && (
                    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: espaco.e2 }}>
                      {v.assinante_nome && (
                        <Chip
                          peso="leve"
                          tom="neutro"
                          texto={`Assinada por ${v.assinante_nome}`}
                          simbolo={(cor) => <IconeAssinatura cor={cor} tamanho={icone.inline} />}
                        />
                      )}
                      {v.gps_precisao_metros !== null && (
                        <Chip
                          peso="leve"
                          tom="neutro"
                          texto={`GPS ${Math.round(v.gps_precisao_metros)} m`}
                          descricao={`Precisão do GPS: ${Math.round(v.gps_precisao_metros)} metros`}
                          simbolo={(cor) => <IconeGps cor={cor} tamanho={icone.inline} />}
                        />
                      )}
                    </View>
                  )}
                  {/*
                    A etiqueta por item CONTINUA, e não virou redundância do
                    cartão de destaque lá em cima: ele conta quantas, esta diz
                    QUAIS. Sem ela, o agente que precisa mostrar aquela vistoria
                    específica não teria como saber se foi ela que subiu depois.
                  */}
                  {foiColetadaSemSinal(v) && (
                    <Chip
                      tom="ok"
                      texto="Coletada sem sinal, enviada depois"
                      simbolo={(cor) => <IconeSemSinal cor={cor} tamanho={icone.inline} />}
                    />
                  )}
                </View>
              ))}
            </View>
            {/*
              O RODAPÉ QUE FALTAVA, e ele tem duas frases porque são dois cortes
              diferentes: um é da tela, o outro é do servidor. Sem o segundo, o
              agente com 62 vistorias continuaria sem saber que este aparelho só
              tem as 50 últimas.
            */}
            {dados && dados.totalConcluidas > naTela.length && (
              <Txt variante="legenda" discreto>
                Mostrando as {naTela.length} mais recentes de {dados.totalConcluidas}.
                {dados.totalConcluidas > dados.tetoDeConcluidas
                  ? ` Este aparelho baixou as ${dados.tetoDeConcluidas} últimas;`
                    + " as anteriores estão no painel da coordenação."
                  : ""}
              </Txt>
            )}
          </Cartao>
        )}
      </Grupo>

      {dados && (
        <Grupo titulo="A minha equipe">
          {dados.equipe === null ? (
            /*
              "Você não está em uma equipe" era um cartão com título e dois
              parágrafos, e NENHUMA ação. O agente lia, concordava, e continuava
              diante de uma tela que não oferece nada para fazer.

              A ação que existe de verdade é esta: quem acabou de ser incluído
              numa equipe pelo painel precisa BAIXAR de novo, porque esta tela
              abre do disco. Sem o botão, o caminho era fechar e reabrir o
              aplicativo.
            */
            <Vazio
              icone={<IconeEquipe cor={tema.textoDiscreto} tamanho={icone.vazio} />}
              titulo="Você ainda não está em uma equipe"
              descricao={
                "Sem equipe, a coordenação não tem para onde despachar, e é por "
                + "isso que a sua lista de tarefas está vazia. Peça à coordenação "
                + "do seu município para incluir você em uma equipe, no painel, "
                + "em Equipes."
              }
              acao={{
                titulo: "Procurar a minha equipe de novo",
                descricao: "Buscar no servidor se você já foi incluído em uma equipe",
                testID: "procurar-equipe",
                onPress: () => void buscarNaRede(),
              }}
            />
          ) : (
            // O nome já costuma trazer a palavra "Equipe" (o cadastro do
            // município chama de "Equipe Alfa"), e prefixar produzia "Equipe
            // Equipe Alfa".
            <Cartao titulo={dados.equipe.nome}>
              {/*
                AS DUAS ETIQUETAS SÃO DE PESO LEVE, e a razão é a R1 da régua.

                A situação da equipe é uma etiqueta PERMANENTE: ela está na tela
                em todo carregamento, e na esmagadora maioria dos dias ela diz
                "ativa". Enquanto ela foi pílula verde cheia, o cartão abria com
                um bloco de cor aceso dizendo que estava tudo normal, e quando a
                equipe estava inativa a mesma pílula (agora âmbar) competia, no
                mesmo volume, com o aviso logo abaixo, que é quem explica a
                consequência e diz o que fazer.
              */}
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: espaco.e4 }}>
                <Chip
                  peso="leve"
                  tom={dados.equipe.ativa ? "ok" : "alerta"}
                  texto={dados.equipe.ativa ? "Equipe ativa" : "Equipe inativa"}
                  simbolo={(cor) => (dados.equipe?.ativa
                    ? <IconeSucesso cor={cor} tamanho={icone.inline} />
                    : <IconeAlerta cor={cor} tamanho={icone.inline} />)}
                />
                <Chip
                  peso="leve"
                  tom="neutro"
                  texto={dados.equipe.especialidade ?? "Geral"}
                  simbolo={(cor) => <IconeEquipe cor={cor} tamanho={icone.inline} />}
                />
              </View>

              {!dados.equipe.ativa && (
                <Aviso tom="alerta" titulo="Esta equipe está inativa no cadastro">
                  Você continua conseguindo concluir e enviar as vistorias que já
                  baixou, mas a coordenação não consegue despachar nada novo para
                  ela. Avise a coordenação.
                </Aviso>
              )}

              <Separador />

              {/*
                A contagem virou o TÍTULO da lista que ela conta, em vez de um
                par rótulo/valor solto acima dela. Um número e a lista dele
                separados por um traço horizontal eram duas informações contando
                a mesma coisa em dois lugares.
              */}
              <Txt variante="corpoP" peso={peso.forte}>
                Integrantes ativos ({colegasAtivos.length})
              </Txt>

              {colegasAtivos.length <= 1 ? (
                <Txt variante="corpoP" discreto>
                  Você é o único integrante ativo desta equipe agora.
                </Txt>
              ) : (
                <View style={{ gap: espaco.e3 }}>
                  {colegasAtivos.map((c) => (
                    <View
                      key={c.id}
                      style={{ flexDirection: "row", alignItems: "center", gap: espaco.e3 }}
                    >
                      {/* A inicial dá ritmo vertical à lista: com dez nomes, é o
                          que deixa achar o colega sem ler tudo. */}
                      <View
                        accessibilityElementsHidden
                        importantForAccessibility="no-hide-descendants"
                        style={{
                          width: espaco.e6,
                          height: espaco.e6,
                          borderRadius: raio.pilula,
                          backgroundColor: tema.superficie2,
                          alignItems: "center",
                          justifyContent: "center",
                        }}
                      >
                        <Txt variante="corpoP" peso={peso.negrito}>{iniciaisDe(c.nome)}</Txt>
                      </View>
                      <View style={{ flex: 1 }}>
                        <Txt variante="corpo" peso={c.id === eu ? peso.negrito : peso.normal}>
                          {c.nome}{c.id === eu ? " (você)" : ""}
                        </Txt>
                      </View>
                      {/*
                        O papel do colega é RÓTULO, e rótulo repetido em toda
                        linha de uma lista deixa de ser informação e vira
                        textura: com dez integrantes eram dez pílulas iguais numa
                        coluna, cada uma com fundo próprio, competindo com o nome
                        que está ao lado e que é o que alguém veio ler aqui.
                      */}
                      <Chip
                        peso="leve"
                        tom="neutro"
                        texto={ROTULO_PAPEL[c.papel]}
                        simbolo={(cor) => <IconeEquipe cor={cor} tamanho={icone.inline} />}
                      />
                    </View>
                  ))}
                </View>
              )}
            </Cartao>
          )}
        </Grupo>
      )}

      {/*
        O SINO. Ver o cabeçalho deste arquivo para a decisão de onde ele mora.
      */}
      <Grupo titulo="O que aconteceu no município">
        <Cartao titulo="Avisos">
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: espaco.e3 }}>
            <Chip
              testID="avisos-por-ler"
              peso="leve"
              tom={avisos.naoLidos > 0 ? "alerta" : "neutro"}
              texto={avisos.naoLidos === 0
                ? "Nada por ler"
                : `${avisos.naoLidos}${avisos.naoLidosTruncado ? "+" : ""} por ler`}
              descricao={avisos.naoLidos === 0
                ? "Avisos, nenhum por ler"
                : `Avisos, ${avisos.naoLidosTruncado ? "mais de " : ""}${avisos.naoLidos} por ler`}
              simbolo={(cor) => (avisos.naoLidos > 0
                ? <IconeAlerta cor={cor} tamanho={icone.inline} />
                : <IconeSucesso cor={cor} tamanho={icone.inline} />)}
            />
          </View>

          {avisos.itens.length === 0 ? (
            <Txt variante="corpoP" discreto>
              {avisos.baixadoEm === null
                ? "Os avisos do seu município aparecem aqui depois da primeira "
                  + "atualização com sinal. Eles são o caminho que funciona quando "
                  + "a notificação não chega."
                : "Nenhum aviso novo no seu município desde a última atualização."}
            </Txt>
          ) : (
            <View style={{ gap: espaco.e3 }}>
              {avisosNaTela.map((a, posicao) => {
                const complemento = complementoDoAviso(a);
                const severidade = a.tipo === "prazo_vencido" && complemento
                  ? ROTULO_SEVERIDADE[complemento as Severidade]
                  : null;
                const frase = fraseDoAviso(a.tipo);
                return (
                  /*
                    A linha NÃO é tocável, e a ausência é decisão.

                    No painel o aviso leva à ocorrência. Aqui ele levaria a uma
                    ocorrência que o aparelho pode simplesmente não ter: a lista
                    de tarefas é despachada para a EQUIPE do agente e vem do
                    disco, e o sino fala do município inteiro. Um toque que abre
                    o nada, sem sinal, é pior que um toque que não existe.
                  */
                  <View
                    key={a.id}
                    accessible
                    accessibilityLabel={
                      `${frase}, protocolo ${a.protocolo}`
                      + (severidade ? `, severidade ${severidade.toLowerCase()}` : "")
                      + (!severidade && complemento ? `, ${complemento}` : "")
                      + (a.lido ? ", lido" : ", por ler")
                    }
                    style={{ gap: espaco.e2 }}
                  >
                    {posicao > 0 && <Separador />}
                    <View style={{ flexDirection: "row", alignItems: "center", gap: espaco.e3 }}>
                      <View
                        accessibilityElementsHidden
                        importantForAccessibility="no-hide-descendants"
                        style={{ width: icone.rotulo, alignItems: "center" }}
                      >
                        <DesenhoDoAviso
                          tipo={a.tipo}
                          cor={a.lido ? tema.textoDiscreto : tema.texto}
                        />
                      </View>
                      <View style={{ flex: 1 }}>
                        {/*
                          O PESO é quem diz "por ler", e não a cor: a régua da
                          casa proíbe comunicar estado só por cor, e um selo por
                          linha em oito linhas seria textura. Para quem ouve a
                          tela, o rótulo do invólucro diz a palavra.
                        */}
                        <Txt
                          variante="corpoP"
                          peso={a.lido ? peso.normal : peso.negrito}
                          discreto={a.lido}
                        >
                          {frase}
                        </Txt>
                      </View>
                      <Txt variante="legenda" discreto numeroDeLinhas={1}>
                        {idadeEmPalavras(new Date(a.criadoEm), agora)}
                      </Txt>
                    </View>
                    <View style={{ flexDirection: "row", alignItems: "baseline", gap: espaco.e2 }}>
                      <Txt variante="legenda" discreto mono>{a.protocolo}</Txt>
                      {(severidade !== null || complemento !== null) && (
                        <Txt variante="legenda" discreto>
                          {severidade ? `Severidade ${severidade.toLowerCase()}` : complemento}
                        </Txt>
                      )}
                    </View>
                  </View>
                );
              })}
              {avisos.itens.length > avisosNaTela.length && (
                <Txt variante="legenda" discreto>
                  Mostrando os {avisosNaTela.length} mais recentes de{" "}
                  {avisos.itens.length} guardados neste aparelho.
                </Txt>
              )}
            </View>
          )}

          {porLer.length > 0 && (
            <Botao
              titulo="Marcar como lidos"
              tipo="secundario"
              testID="marcar-avisos-lidos"
              descricao={`Marcar como lidos os ${porLer.length} avisos que estão nesta tela`}
              onPress={() => void (async () => {
                /*
                  Marca no APARELHO primeiro, e o envio é consequência.

                  Sem isso, quem lê os avisos no morro e sai da tela encontra
                  tudo por ler de novo na descida, e a próxima sincronização
                  ainda apagaria a leitura com o `lido: false` do servidor. Ver
                  `lidosPendentes` em `dados/avisos.ts`.
                */
                setAvisos(await marcarAvisosComoLidosNoAparelho(porLer));
              })()}
            />
          )}

          <Txt variante="legenda" discreto>
            {avisos.baixadoEm === null
              ? "Nunca atualizado neste aparelho."
              : `Atualizado ${idadeEmPalavras(new Date(avisos.baixadoEm), agora)}.`}
            {" "}O sino precisa de sinal: sem conexão ele mostra o que já estava
            guardado aqui.
          </Txt>
        </Cartao>
      </Grupo>

      <Grupo titulo="Este aparelho">
        {/* ESTADO. O que muda sozinho, alinhado numa coluna para se conferir de
            relance, mais a ficha técnica do binário depois do separador. */}
        <Cartao>
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
          A APARÊNCIA, e por que ela é um cartão próprio.

          Esta tela tem duas naturezas: identidade (quem assina o laudo, não
          muda, não pede nada) e estado (o que muda sozinho e se confere de
          relance). A escolha de tema não é nenhuma das duas, e encaixá-la à
          força numa delas estragaria a separação que foi cara de conseguir:

          - Em IDENTIDADE ela prometeria o que não cumpre. Identidade é da
            pessoa e viaja com ela para qualquer aparelho onde a conta abrir; o
            tema fica neste telefone. No aparelho de plantão compartilhado a
            diferença é concreta: quem escolheu claro aqui não escolheu claro no
            aparelho do colega.
          - No cartão de estado ela seria um controle no meio de uma coluna de
            valores que só se leem, e é justamente aquele alinhamento que faz
            três linhas se conferirem de relance. Um tocável de 52 pontos no meio
            dele ou parece mais um valor (e ninguém descobre que dá para tocar),
            ou desmancha o alinhamento das outras linhas.
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

          Ele fica logo abaixo do sino de propósito: um diz o que passou pelo
          canal, o outro diz se o canal funciona, e "não recebi aviso nenhum" se
          responde olhando os dois.
        */}
        <Cartao titulo="Notificação">
          <LinhaDeEstado
            rotulo="Notificação de tarefa e de prazo"
            desenho={<IconeAparelho cor={tema.textoDiscreto} tamanho={icone.rotulo} />}
          >
            {/*
              PESO LEVE, pela régua de densidade (`src/ui/regua.ts`, R1 e R2).

              Este cartão empilhava três blocos preenchidos: este chip, o aviso
              do desfecho do último pedido e o aviso de falha no registro. Pela
              régua, na disputa ganha o mais alto, e aqui é o AVISO DE FALHA: ele
              é o único dos três que diz que alguma coisa quebrou.
            */}
            <Chip texto={frases.titulo} simbolo={selo.simbolo} tom={selo.tom} peso="leve" />
          </LinhaDeEstado>
          <Txt variante="corpoP" discreto>{frases.texto}</Txt>

          {/*
            Os dois botões chamam o SISTEMA, e a tela não mudava nada ao fazer
            isso: nem enquanto a chamada estava em voo, nem depois que ela
            voltou. Um toque sem consequência visível é um toque que a pessoa
            repete.
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
            na troca de sessão, e nunca na volta do segundo plano. Hoje
            `ProvedorDePush` escuta `AppState` e relê a permissão ao voltar,
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
            semana achando que o aparelho dele está quebrado, e ela aponta para o
            sino, que é o canal que continua funcionando.
          */}
          {push.registro === "push_desligado" && (
            <Aviso tom="info">
              A prefeitura ainda não ligou o envio de aviso neste servidor. As
              tarefas continuam aparecendo quando você abre o aplicativo, e o
              que aconteceu no município continua aparecendo em Avisos, acima.
            </Aviso>
          )}
          {push.registro === "falhou" && (
            <Aviso tom="alerta">
              Não deu para registrar este aparelho para receber aviso. Entre de
              novo com sinal, e avise a coordenação se continuar assim.
            </Aviso>
          )}
        </Cartao>
      </Grupo>

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

      {/*
        A busca em voo aparece aqui, em palavras, e no RefreshControl lá em
        cima. O RefreshControl sozinho não bastaria: ele só desenha enquanto o
        dedo segura a tela, e a atualização que acontece sozinha na abertura
        não teria indicador nenhum.
      */}
      <Txt variante="legenda" discreto alinhamento="center">
        Atualizado {idadeEmPalavras(baixadoEm ? new Date(baixadoEm) : null, agora)}
        {atualizando ? " (buscando)" : ""}
      </Txt>

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
