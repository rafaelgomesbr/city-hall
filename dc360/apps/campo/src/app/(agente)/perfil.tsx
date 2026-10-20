import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { ActivityIndicator, RefreshControl, ScrollView, View } from "react-native";
import { router } from "expo-router";
import Constants from "expo-constants";
import { ROTULO_PAPEL, ROTULO_TIPO_COBRADE } from "@dc360/shared";
import {
  SemSinal, enderecoDaApi, normalizarMeuTrabalho, type Colega, type MeuTrabalho,
} from "../../dados/api";
import {
  comoContarAFalha, ehFimDeLinha, motivoDaFalha, type MotivoDaFalha,
} from "../../dados/falha-de-atualizacao";
import {
  atualizarMeuTrabalho, meuTrabalhoGuardado, pendenciasGuardadas,
} from "../../dados/pendencias";
import { listarColetas } from "../../dados/coletas";
import { coletadasNoAparelho } from "../../dados/ordem-do-dia";
import { useResumoDaFila } from "../../dados/resumo-da-fila";
import { listarRascunhos } from "../../dados/rascunho";
import { avisoDaSaida, contarRascunhos, type RascunhosNaSaida } from "../../dados/aviso-da-saida";
import { useSessao } from "../../dados/sessao";
import { useSinal } from "../../dados/conectividade";
import { usePush } from "../../push/contexto";
import { frasesDoEstado, ofereceAjustes } from "../../push/permissao";
import type { PreferenciaDeTema } from "../../dados/preferencia-de-tema";
import {
  baixarFotoDoAgente, enviarFoto, escolherFoto, fotoLocalDoAgente, removerFotoDoAgente,
  type OrigemDaFoto,
} from "../../dados/foto-do-agente";
import { MARCOS, conquistas, type Marco } from "../../dados/conquistas";
import {
  JANELA_DA_SEMANA_MS, JANELA_DO_MES_MS, concluidasNaJanela, concluidasPorDia,
  concluidasPorMes, tempoEmPalavras, tempoMedioAteAVistoria,
} from "../../dados/numeros-do-agente";
import {
  Aviso, Botao, Cartao, Carregando, Dado, Separador, Tocavel, Txt, Vazio,
  useEstadoDoTema, useTema,
} from "../../ui/componentes";
import { useRecuoDoMenu } from "../../ui/BarraDeAbas";
import { useComecarDoTopo } from "../../ui/CenaDaAba";
import { Avatar, TAMANHO_DO_AVATAR } from "../../ui/Avatar";
import { GraficoDeBarras } from "../../ui/Grafico";
import { ItemDeLista } from "../../ui/ItemDeLista";
import { atrasoEmCascata } from "../../ui/hierarquia";
import { Chip, type TomDoChip } from "../../ui/Chip";
import { Dialogo } from "../../ui/Dialogo";
import {
  IconeAlerta, IconeAparelho, IconeAssinatura, IconeEnvio, IconeEquipe, IconeFoto, IconeGps,
  IconeInformacao, IconeLocalizacao, IconeSemSinal, IconeSinal, IconeSucesso,
} from "../../ui/icones";
import { borda, espaco, icone, peso, raio, toque } from "../../ui/tokens";
import { idadeEmPalavras } from "../../dados/atualizacao";

/**
 * PERFIL: quem eu sou aqui, o que eu já fiz, com quem, e como está o meu aparelho.
 *
 * ## O pedido, na letra de quem paga
 *
 * "A tela de perfil totalmente morta, um app totalmente sem vida, não dá
 * vontade de mexer. Tá muito só texto, não tem animações, infos, gráficos."
 *
 * E o que ele escolheu ver: a foto no topo com o nome e o cargo, com opção de
 * adicionar ou trocar; números do agente com gráfico; equipe com cara de
 * equipe; conquistas e histórico; ajustes bonitos.
 *
 * ## O que a versão anterior tinha certo, e continua aqui
 *
 * - **Identidade não se desenha como estado.** O nome e o papel continuam sem
 *   rótulo; o que muda sozinho continua em linha com ícone, rótulo à esquerda
 *   e valor à direita.
 * - **O `aoDesistir` no `Carregando`**, dentro do cartão do trabalho e não na
 *   tela inteira: trocar o tema ou sair da conta nunca dependeu de rede.
 * - **Um indicador por fato.** A busca em voo é contada pelo texto do rodapé
 *   e pelo puxar da tela, e em mais lugar nenhum.
 * - **O total de concluídas é o do servidor**, nunca o tamanho da lista
 *   cortada, e o rodapé diz quando cortou.
 * - **A prova de que o offline funciona** continua em cartão próprio, com
 *   elevação de destaque, porque continua sendo a única coisa desta tela que o
 *   agente não sabia antes de abrir.
 *
 * ## O que mudou, e de onde vem cada número
 *
 * - **A foto.** `dados/foto-do-agente.ts` cuida de escolher (câmera ou
 *   galeria, sem pedir a biblioteca inteira), recortar, reduzir a 512 e enviar
 *   pelo mesmo ciclo da evidência. A cópia fica no disco e sai no logout. Sem
 *   sinal a troca é recusada com frase, e a razão está naquele módulo.
 * - **Os números** saem do que já desce em `GET /campo/meu-trabalho`: as
 *   concluídas (cinquenta mais recentes, com a data do despacho lida da
 *   trilha), o total de verdade, e `devolvidasNoMes`, que o servidor conta
 *   porque o aparelho só guarda a devolução enquanto ela espera envio. As
 *   pendências de hoje vêm do disco, como na aba Tarefas. As contas estão em
 *   `dados/numeros-do-agente.ts`, e cada uma diz quando é um piso.
 * - **As conquistas** são leitura do total, sem tabela nova
 *   (`dados/conquistas.ts`).
 * - **A equipe** ganhou avatar, quem está em campo agora (a saída a campo
 *   declarada com sinal, reduzida a um booleano por colega) e o coordenador
 *   em destaque.
 * - **O sino SAIU daqui.** Ele ganhou tela própria (`avisos.tsx`) e ícone na
 *   barra (`ui/Sino.tsx`); o que fica é o atalho "Ver avisos".
 *
 * ## Uma peça, um protagonista
 *
 * Cinco números grandes num cartão só seriam cinco protagonistas, ou seja,
 * nenhum (H1 da régua de hierarquia). Por isso cada número mora no próprio
 * cartão, numa grade de dois por linha, e o gráfico mora no dele. O portão de
 * design conta isso na árvore, e não no texto solto.
 */

/** Um agrupamento de cartões, com o nome do grupo acima deles. */
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
 * "3 esperando" se comparam sem o olho procurar onde cada um começa.
 */
function LinhaDeEstado({ desenho, rotulo, children }: {
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
        /* O ícone é a segunda pista ao lado da palavra, nunca o lugar dela. */
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
 * O cabeçalho de um bloco de ajustes: um ícone numa caixa, o título e uma
 * frase de apoio. É o que separa "ajustes bonitos" de uma lista de texto: o
 * olho acha "Aparência" pelo desenho antes de ler a palavra, e a caixa dá ao
 * bloco um começo que a lista não tinha.
 */
function CabecalhoDeAjuste({ desenho, titulo, apoio }: {
  desenho: (cor: string) => ReactNode;
  titulo: string;
  apoio: string;
}) {
  const tema = useTema();
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: espaco.e3 }}>
      <View
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        style={{
          width: TAMANHO_DO_AVATAR.medio,
          height: TAMANHO_DO_AVATAR.medio,
          borderRadius: raio.normal,
          backgroundColor: tema.superficie2,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {desenho(tema.destaque)}
      </View>
      <View style={{ flex: 1, gap: espaco.e1 }}>
        <Txt nivel="titulo">{titulo}</Txt>
        <Txt variante="corpoP" discreto>{apoio}</Txt>
      </View>
    </View>
  );
}

/**
 * Uma das três opções de tema.
 *
 * É `radio` e não `checkbox`: as três são exclusivas. Quem escolheu aparece por
 * TRÊS canais que não são cor: o sinal de conferido à esquerda, o rótulo em
 * negrito, e a cor do contorno. Sob sol na tela, o sinal é o que sobra.
 */
function OpcaoDeTema({ valor, rotulo, detalhe, escolhida, aoEscolher }: {
  valor: PreferenciaDeTema;
  rotulo: string;
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
        /* A espessura é a MESMA nas três, e só a cor dela muda: engrossar a
           escolhida empurraria as de baixo, e a lista andaria sob o dedo. */
        borderWidth: borda.fio,
        borderColor: escolhida ? tema.destaque : tema.borda,
        backgroundColor: escolhida ? tema.superficie2 : "transparent",
      }}
    >
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
 * Um selo de conquista: o número do marco num círculo, e a palavra embaixo.
 *
 * Conquistado é círculo cheio de destaque com o sinal de conferido; por vir é
 * círculo vazio com o número em discreto. As duas coisas (cheio e sinal) são o
 * "nunca só cor" aplicado a um selo: sem a cor, o ✓ separa os dois.
 */
function Selo({ marco, conquistado }: { marco: Marco; conquistado: boolean }) {
  const tema = useTema();
  return (
    <View
      accessible
      accessibilityLabel={
        `Selo ${marco.titulo}, ${marco.total} ${marco.total === 1 ? "vistoria" : "vistorias"}, `
        + (conquistado ? "conquistado" : "ainda por vir")
      }
      style={{ alignItems: "center", gap: espaco.e1, flex: 1 }}
    >
      <View
        style={{
          width: TAMANHO_DO_AVATAR.medio,
          height: TAMANHO_DO_AVATAR.medio,
          borderRadius: raio.pilula,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: conquistado ? tema.destaque : "transparent",
          borderWidth: borda.enfase,
          borderColor: conquistado ? tema.destaque : tema.borda,
        }}
      >
        <Txt
          variante="corpo"
          mono
          peso={peso.negrito}
          cor={conquistado ? tema.sobreDestaque : tema.textoDiscreto}
        >
          {String(marco.total)}
        </Txt>
      </View>
      <View style={{ flexDirection: "row", alignItems: "center", gap: espaco.e1 }}>
        {conquistado && <IconeSucesso cor={tema.destaque} tamanho={icone.inline} />}
        <Txt variante="legenda" discreto={!conquistado} numeroDeLinhas={1}>{marco.titulo}</Txt>
      </View>
    </View>
  );
}

/** O ícone de cada origem de foto, para os botões do seletor. */
const ORIGENS: Array<{ origem: OrigemDaFoto; titulo: string; descricao: string }> = [
  { origem: "camera", titulo: "Tirar foto agora", descricao: "Abrir a câmera da frente para tirar a foto de perfil" },
  { origem: "galeria", titulo: "Escolher da galeria", descricao: "Abrir o seletor de fotos do aparelho para escolher a foto de perfil" },
];

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

/**
 * A ordem dos colegas: coordenação primeiro, depois quem está em campo, depois
 * o resto por nome. É "coordenador em destaque" escrito como ordem, e não só
 * como cor: numa equipe de dez, quem manda está no topo da lista.
 */
function ordenarColegas(colegas: readonly Colega[]): Colega[] {
  const posto = (c: Colega) => (c.papel === "coordenador" || c.papel === "administrador" ? 0 : 1);
  return [...colegas].sort((a, b) =>
    posto(a) - posto(b)
    || Number(b.emCampo) - Number(a.emCampo)
    || a.nome.localeCompare(b.nome));
}

/** Quantas vistorias concluídas a tela lista. O total de verdade vem do servidor. */
const CONCLUIDAS_NA_TELA = 10;

export default function Perfil() {
  const tema = useTema();
  // A pílula do menu paira sobre a cena; a tela reserva o vão no fim da rolagem.
  const recuoDoMenu = useRecuoDoMenu();
  // Toda aba começa do topo a cada foco (ver `ui/CenaDaAba.tsx`).
  const rolagem = useComecarDoTopo<ScrollView>();
  const sinal = useSinal();
  const push = usePush();
  const escolhaDeTema = useEstadoDoTema();
  const { identidade, sair, obterToken, lerIdentidade } = useSessao();

  const [dados, setDados] = useState<MeuTrabalho | null>(null);
  const [baixadoEm, setBaixadoEm] = useState<string | null>(null);
  const [atualizando, setAtualizando] = useState(false);
  const [desistiuDeEsperar, setDesistiuDeEsperar] = useState(false);
  const [falhaDeRede, setFalhaDeRede] = useState<MotivoDaFalha | null>(null);
  const [agora, setAgora] = useState(() => new Date());

  /*
    A fila ASSINADA, e não lida uma vez na montagem: a aba fica montada o dia
    inteiro, e o chip, o aviso de esperar e o diálogo de saída envelheciam,
    discordando do crachá do menu, que já assinava pelo mesmo gancho. A conta
    é a de antes (o que espera envio mais o que o servidor recusou), porque é
    isso que só sobe com esta conta.
  */
  const resumoDaFila = useResumoDaFila();
  const pendentes = resumoDaFila === null
    ? null
    : resumoDaFila.pendentes + resumoDaFila.enviando + resumoDaFila.bloqueados;
  /** O que a saída apagaria, conferido no toque em "Sair da conta". */
  const [rascunhosNaSaida, setRascunhosNaSaida] = useState<RascunhosNaSaida>(null);
  /** Quantas tarefas o aparelho tem para hoje e ainda não vistoriou. Nulo: não deu para ler. */
  const [pendentesHoje, setPendentesHoje] = useState<number | null>(null);
  const [perguntandoSaida, setPerguntandoSaida] = useState(false);
  const [porQueASenha, setPorQueASenha] = useState(false);
  const [acaoDeAviso, setAcaoDeAviso] = useState<null | "permissao" | "ajustes">(null);
  const [pediuPermissaoAgora, setPediuPermissaoAgora] = useState(false);
  const [abriuOsAjustes, setAbriuOsAjustes] = useState(false);

  /* A foto: a cópia local, lida do disco na montagem e trocada pelo envio. */
  const [fotoUri, setFotoUri] = useState<string | null>(null);
  const [email, setEmail] = useState<string | null>(null);
  const [escolhendoFoto, setEscolhendoFoto] = useState(false);
  const [enviandoFoto, setEnviandoFoto] = useState(false);
  const [perguntandoRemocao, setPerguntandoRemocao] = useState(false);
  const [desfechoDaFoto, setDesfechoDaFoto] = useState<
    null | { tom: "sucesso" | "perigo" | "alerta"; titulo: string; texto: string }
  >(null);

  useEffect(() => {
    const t = setInterval(() => setAgora(new Date()), 30_000);
    return () => { clearInterval(t); };
  }, []);

  const usuarioId = identidade?.usuarioId ?? null;
  useEffect(() => {
    if (!usuarioId) { setFotoUri(null); return; }
    setFotoUri(fotoLocalDoAgente(usuarioId));
  }, [usuarioId]);

  const lerDoDisco = useCallback(async () => {
    const guardado = await meuTrabalhoGuardado();
    if (guardado) {
      /* Normaliza o que veio do disco: pode ter sido gravado por uma versão
         anterior, sem os campos novos. */
      setDados(normalizarMeuTrabalho(guardado.dados));
      setBaixadoEm(guardado.baixadoEm);
    }
    return guardado;
  }, []);

  /*
    As pendências de hoje, do DISCO, como na aba Tarefas: a lista guardada
    menos o que este aparelho já vistoriou. Falha aqui vira "não sei", e o
    cartão do número simplesmente não aparece: um zero inventado seria pior.
  */
  const lerPendenciasDeHoje = useCallback(async () => {
    try {
      const [tarefas, coletas] = await Promise.all([pendenciasGuardadas(), listarColetas()]);
      const jaColetadas = coletadasNoAparelho(coletas);
      setPendentesHoje(tarefas.filter((t) => !jaColetadas.has(t.id)).length);
    } catch {
      setPendentesHoje(null);
    }
  }, []);

  const buscarNaRede = useCallback(async () => {
    setAtualizando(true);
    setDesistiuDeEsperar(false);
    setFalhaDeRede(null);
    try {
      const token = await obterToken();
      if (!token) return;

      /*
        Duas buscas, um toque, dois fracassos separados: o trabalho é o que
        importa, e a foto é conforto. Uma falha na foto não pode apagar o
        registro do trabalho da tela, e um servidor sem a rota da foto não
        pode deixar o agente sem a equipe.
      */
      try {
        setDados(await atualizarMeuTrabalho(token));
        setBaixadoEm(new Date().toISOString());
      } catch (erro: unknown) {
        setFalhaDeRede(motivoDaFalha(erro));
      }

      const eu = lerIdentidade?.() ?? identidade;
      if (eu) {
        try {
          const r = await baixarFotoDoAgente(token, eu.usuarioId);
          setFotoUri(r.fotoLocal);
          setEmail(r.email);
        } catch {
          /* A cópia local, se houver, continua na tela. */
        }
      }
    } catch (erro: unknown) {
      setFalhaDeRede(motivoDaFalha(erro));
    } finally {
      setAtualizando(false);
    }
  }, [obterToken, lerIdentidade, identidade]);

  useEffect(() => {
    void (async () => {
      /* O disco primeiro, SEMPRE: é o que faz esta aba abrir no alto do morro. */
      const guardado = await lerDoDisco();
      void lerPendenciasDeHoje();
      // Sem cópia local, buscar é a única saída. Com cópia, buscar é conforto,
      // e conforto não justifica gastar o dado do agente sem sinal.
      if (!guardado || sinal.temSinal) await buscarNaRede();
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /*
    A pergunta de saída conta o que está no disco NO INSTANTE do toque, e não
    o que estava na montagem: a aba fica montada o dia inteiro, e a vistoria
    começada depois do café também vai embora ao sair. Se o disco não
    responder, a frase avisa do mesmo jeito (ver `avisoDaSaida`), porque dizer
    "não há nada" sem ter conferido é a promessa que apagava vistoria.
  */
  const perguntarSaida = useCallback(async () => {
    try {
      setRascunhosNaSaida(contarRascunhos(await listarRascunhos()));
    } catch {
      setRascunhosNaSaida(null);
    }
    setPerguntandoSaida(true);
  }, []);

  /* Trocar a foto: escolher, reduzir, enviar. Tudo em português, e tudo termina
     numa frase que diz o que aconteceu. */
  const trocarFoto = useCallback(async (origem: OrigemDaFoto) => {
    if (!identidade) return;
    setDesfechoDaFoto(null);
    try {
      const escolha = await escolherFoto(origem);
      if (escolha.situacao === "cancelada") return;
      if (escolha.situacao === "sem_permissao") {
        setDesfechoDaFoto({
          tom: "alerta",
          titulo: "A câmera não foi liberada",
          texto: "Libere a câmera nos ajustes do aparelho, ou escolha uma foto da galeria.",
        });
        return;
      }
      setEnviandoFoto(true);
      const token = await obterToken();
      if (!token) throw new SemSinal();
      const enviada = await enviarFoto(token, escolha.foto, identidade.usuarioId);
      setFotoUri(enviada.uriLocal);
      setEscolhendoFoto(false);
      setDesfechoDaFoto({
        tom: "sucesso",
        titulo: "Foto atualizada",
        texto: "A sua equipe e a coordenação passam a ver esta foto ao lado do seu nome.",
      });
    } catch (erro: unknown) {
      setDesfechoDaFoto({
        tom: "perigo",
        titulo: "A foto não foi trocada",
        texto: erro instanceof Error && erro.message
          ? erro.message
          : "Não deu para enviar a foto. Tente de novo com sinal.",
      });
    } finally {
      setEnviandoFoto(false);
    }
  }, [identidade, obterToken]);

  const removerFoto = useCallback(async () => {
    if (!identidade) return;
    setPerguntandoRemocao(false);
    setDesfechoDaFoto(null);
    setEnviandoFoto(true);
    try {
      const token = await obterToken();
      if (!token) throw new SemSinal();
      await removerFotoDoAgente(token, identidade.usuarioId);
      setFotoUri(null);
      setEscolhendoFoto(false);
      setDesfechoDaFoto({
        tom: "sucesso",
        titulo: "Foto removida",
        texto: "O seu nome volta a aparecer com as iniciais.",
      });
    } catch (erro: unknown) {
      setDesfechoDaFoto({
        tom: "perigo",
        titulo: "A foto não foi removida",
        texto: erro instanceof Error && erro.message ? erro.message : "Tente de novo com sinal.",
      });
    } finally {
      setEnviandoFoto(false);
    }
  }, [identidade, obterToken]);

  const fraseDaFalha = falhaDeRede
    ? comoContarAFalha(falhaDeRede, "Mostrando o que já estava no aparelho.")
    : null;

  /* O que a saída apaga e o que ela guarda, dito antes do toque que confirma. */
  const textoDaSaida = avisoDaSaida(pendentes, rascunhosNaSaida, resumoDaFila?.pausadaPor ?? null);

  /* As contas dos números, memoizadas: mudam com os dados e com o relógio. */
  const concluidas = dados?.concluidas ?? [];
  const numeros = useMemo(() => {
    if (!dados) return null;
    const teto = dados.tetoDeConcluidas;
    const media = tempoMedioAteAVistoria(dados.concluidas);
    return {
      semana: concluidasNaJanela(dados.concluidas, JANELA_DA_SEMANA_MS, agora, teto),
      mes: concluidasNaJanela(dados.concluidas, JANELA_DO_MES_MS, agora, teto),
      porDia: concluidasPorDia(dados.concluidas, agora),
      porMes: concluidasPorMes(dados.concluidas, agora),
      tempoMedio: media === null ? null : tempoEmPalavras(media),
    };
  }, [dados, agora]);
  const selos = useMemo(() => conquistas(dados?.totalConcluidas ?? 0), [dados]);

  if (!identidade) {
    return (
      <ScrollView contentContainerStyle={{ padding: espaco.e4, gap: espaco.e4, paddingBottom: recuoDoMenu }}>
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
  const colegasAtivos = ordenarColegas(dados?.colegas.filter((c) => c.ativo) ?? []);
  const emCampoAgora = colegasAtivos.filter((c) => c.emCampo).length;
  const naTela = concluidas.slice(0, CONCLUIDAS_NA_TELA);
  const semSinalNaLista = concluidas.filter(foiColetadaSemSinal).length;

  const selo: { tom: TomDoChip; simbolo: string } = {
    concedida: { tom: "ok" as const, simbolo: "✓" },
    negada: { tom: "alerta" as const, simbolo: "!" },
    nao_perguntada: { tom: "neutro" as const, simbolo: "?" },
    indisponivel: { tom: "neutro" as const, simbolo: "×" },
  }[push.permissao];

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

  /*
    A CASCATA: cada bloco da tela entra um pouco depois do anterior, na ordem
    de leitura. O contador anda a cada bloco desenhado, e o teto de
    `atrasoEmCascata` impede o fim da tela de virar espera.
  */
  let posicao = 0;
  const bloco = (filho: ReactNode) => (
    <ItemDeLista entrando atraso={atrasoEmCascata(posicao++)}>{filho}</ItemDeLista>
  );

  return (
    <ScrollView
      ref={rolagem}
      testID="tela-do-perfil"
      contentContainerStyle={{ padding: espaco.e4, gap: espaco.e5, paddingBottom: recuoDoMenu }}
      refreshControl={
        <RefreshControl
          refreshing={atualizando}
          onRefresh={() => void buscarNaRede()}
          tintColor={tema.destaque}
        />
      }
    >
      {falhaDeRede && fraseDaFalha && (
        <Aviso
          tom={ehFimDeLinha(falhaDeRede) ? "perigo" : "alerta"}
          peso="leve"
          titulo={fraseDaFalha.resumo}
          acao={{
            titulo: "Dispensar",
            descricao: "Dispensar o aviso de atualização",
            onPress: () => { setFalhaDeRede(null); },
          }}
        >
          {fraseDaFalha.detalhe}
        </Aviso>
      )}

      <Grupo titulo="Eu">
        {/*
          O CABEÇALHO: a foto, o nome, o cargo, a equipe. A foto é tocável
          (com alvo de 96, muito acima dos 52) e o botão discreto abaixo diz
          a mesma coisa em palavras, para quem não adivinha que um círculo
          responde ao dedo.
        */}
        {bloco(
          <Cartao nivel="flutuante">
            <View style={{ flexDirection: "row", alignItems: "center", gap: espaco.e4 }}>
              <Tocavel
                onPress={() => { setEscolhendoFoto((v) => !v); setDesfechoDaFoto(null); }}
                accessibilityRole="button"
                accessibilityLabel={fotoUri
                  ? `Foto de perfil de ${identidade.nome}. Trocar a foto`
                  : `${identidade.nome}, sem foto de perfil. Adicionar foto`}
                accessibilityState={{ disabled: enviandoFoto }}
                desabilitado={enviandoFoto}
                testID="trocar-foto"
                estilo={{ minHeight: toque, minWidth: toque, justifyContent: "center" }}
              >
                <Avatar nome={identidade.nome} fotoUri={fotoUri} tamanho="grande" testID="avatar-do-agente" />
              </Tocavel>
              <View style={{ flex: 1, gap: espaco.e1 }}>
                <Txt variante="h2">{identidade.nome}</Txt>
                <Txt variante="corpoP" peso={peso.forte}>{ROTULO_PAPEL[identidade.papel]}</Txt>
                {dados?.equipe && (
                  <Txt variante="corpoP" discreto>{dados.equipe.nome}</Txt>
                )}
                <Txt variante="corpoP" discreto>
                  {identidade.organizacaoNome}, {identidade.municipio}/{identidade.uf}
                </Txt>
                <Txt variante="legenda" discreto mono>Matrícula {identidade.matricula}</Txt>
              </View>
            </View>

            <Botao
              titulo={fotoUri ? "Trocar a foto" : "Adicionar foto"}
              tipo="discreto"
              testID="abrir-escolha-de-foto"
              descricao={fotoUri ? "Trocar a foto de perfil" : "Adicionar uma foto de perfil"}
              desabilitado={enviandoFoto}
              estilo={{ alignSelf: "flex-start", paddingHorizontal: 0 }}
              onPress={() => { setEscolhendoFoto((v) => !v); setDesfechoDaFoto(null); }}
            />

            {escolhendoFoto && (
              <View style={{ gap: espaco.e2 }}>
                {!sinal.temSinal ? (
                  /*
                    SEM SINAL, RECUSA COM FRASE, e não fila. A decisão inteira
                    está em `dados/foto-do-agente.ts`: a fila é para trabalho
                    do morro, e retrato se troca na base.
                  */
                  <Aviso tom="info" titulo="Trocar a foto precisa de sinal">
                    A foto sobe na hora para a sua equipe ver, e não entra na fila
                    de envio: ela não é trabalho de campo. Faça isto na base, com
                    conexão.
                  </Aviso>
                ) : (
                  <>
                    {ORIGENS.map((o) => (
                      <Botao
                        key={o.origem}
                        titulo={enviandoFoto ? "Enviando a foto" : o.titulo}
                        tipo="realce"
                        testID={`foto-${o.origem}`}
                        descricao={o.descricao}
                        icone={(cor) => <IconeFoto cor={cor} tamanho={icone.acao} />}
                        carregando={enviandoFoto}
                        desabilitado={enviandoFoto}
                        onPress={() => void trocarFoto(o.origem)}
                      />
                    ))}
                    {fotoUri && (
                      <Botao
                        titulo="Remover a foto"
                        tipo="perigo"
                        testID="remover-foto"
                        descricao="Remover a foto de perfil e voltar às iniciais"
                        desabilitado={enviandoFoto}
                        onPress={() => { setPerguntandoRemocao(true); }}
                      />
                    )}
                    <Txt variante="legenda" discreto>
                      A foto é sua, opcional, e só a sua equipe e a coordenação
                      veem. Ela sai recortada e reduzida antes de subir.
                    </Txt>
                  </>
                )}
                <Botao
                  titulo="Cancelar"
                  tipo="secundario"
                  descricao="Fechar a escolha de foto sem mudar nada"
                  desabilitado={enviandoFoto}
                  onPress={() => { setEscolhendoFoto(false); }}
                />
              </View>
            )}

            {desfechoDaFoto && (
              <Aviso
                tom={desfechoDaFoto.tom}
                peso="leve"
                titulo={desfechoDaFoto.titulo}
                acao={{
                  titulo: "Dispensar",
                  descricao: "Dispensar o aviso sobre a foto",
                  onPress: () => { setDesfechoDaFoto(null); },
                }}
              >
                {desfechoDaFoto.texto}
              </Aviso>
            )}
          </Cartao>,
        )}

        {/* O TRABALHO CONCLUÍDO, com o número que o servidor manda. */}
        {bloco(
          <Cartao>
            {dados === null ? (
              atualizando && !desistiuDeEsperar ? (
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
          </Cartao>,
        )}

        {/* A PROVA DE QUE O OFFLINE FUNCIONA: só quando existe. */}
        {semSinalNaLista > 0 && bloco(
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
            <Txt variante="legenda" discreto>
              Entre as {concluidas.length} mais recentes que este aparelho baixou.
            </Txt>
          </Cartao>,
        )}
      </Grupo>

      {dados && numeros && (
        <Grupo titulo="Os meus números">
          {/*
            UMA PEÇA, UM PROTAGONISTA: cada número no próprio cartão, dois por
            linha. O "+" diz que o número é um piso, porque a lista que o
            aparelho baixou é cortada em cinquenta.
          */}
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: espaco.e3 }}>
            {[
              {
                chave: "semana",
                valor: `${numeros.semana.total}${numeros.semana.piso ? "+" : ""}`,
                rotulo: "concluídas em 7 dias",
              },
              {
                chave: "mes",
                valor: `${numeros.mes.total}${numeros.mes.piso ? "+" : ""}`,
                rotulo: "concluídas em 30 dias",
              },
              ...(pendentesHoje === null ? [] : [{
                chave: "pendentes",
                valor: String(pendentesHoje),
                rotulo: pendentesHoje === 1 ? "pendente hoje" : "pendentes hoje",
              }]),
              {
                chave: "devolvidas",
                valor: String(dados.devolvidasNoMes),
                rotulo: dados.devolvidasNoMes === 1 ? "devolvida em 30 dias" : "devolvidas em 30 dias",
              },
              ...(numeros.tempoMedio === null ? [] : [{
                chave: "tempo",
                valor: numeros.tempoMedio.valor,
                rotulo: `${numeros.tempoMedio.unidade} do despacho à vistoria`,
              }]),
            ].map((n) => (
              <View key={n.chave} style={{ flexGrow: 1, flexBasis: "40%" }}>
                {bloco(
                  <Cartao>
                    <Dado testID={`numero-${n.chave}`} valor={n.valor} rotulo={n.rotulo} />
                  </Cartao>,
                )}
              </View>
            ))}
          </View>
          {(numeros.semana.piso || numeros.mes.piso) && (
            <Txt variante="legenda" discreto>
              O "+" quer dizer pelo menos: a conta é feita sobre as {dados.tetoDeConcluidas} mais
              recentes que este aparelho tem, e pode haver mais no período.
            </Txt>
          )}

          {bloco(
            <Cartao titulo="Últimos 7 dias">
              <GraficoDeBarras titulo="Últimos 7 dias" barras={numeros.porDia} testID="grafico-da-semana" />
              <Txt variante="legenda" discreto>
                Vistorias concluídas por dia, pela data da coleta.
              </Txt>
            </Cartao>,
          )}
        </Grupo>
      )}

      {dados && numeros && (
        <Grupo titulo="Conquistas">
          {bloco(
            <Cartao titulo="Selos">
              <View style={{ flexDirection: "row", gap: espaco.e1 }}>
                {MARCOS.map((m) => (
                  <Selo key={m.total} marco={m} conquistado={selos.conquistadas.includes(m)} />
                ))}
              </View>
              {selos.proxima ? (
                <View style={{ gap: espaco.e2 }}>
                  <View testID="proximo-selo">
                    <Txt variante="corpoP" peso={peso.forte}>
                      {selos.proxima.faltam === 1
                        ? `Falta 1 para o selo ${selos.proxima.marco.titulo}`
                        : `Faltam ${selos.proxima.faltam} para o selo ${selos.proxima.marco.titulo}`}
                    </Txt>
                  </View>
                  {/*
                    A barra de progresso: trilho na superfície, preenchimento
                    de destaque. Para quem ouve, é um `progressbar` com valor.
                  */}
                  <View
                    accessibilityRole="progressbar"
                    accessibilityLabel={`Progresso para o selo ${selos.proxima.marco.titulo}`}
                    accessibilityValue={{
                      min: 0, max: 100, now: Math.round(selos.proxima.progresso * 100),
                    }}
                    style={{
                      height: espaco.e2,
                      borderRadius: raio.pilula,
                      backgroundColor: tema.superficie2,
                      overflow: "hidden",
                    }}
                  >
                    <View
                      testID="progresso-do-selo"
                      style={{
                        width: `${Math.round(selos.proxima.progresso * 100)}%`,
                        height: espaco.e2,
                        borderRadius: raio.pilula,
                        backgroundColor: tema.destaque,
                      }}
                    />
                  </View>
                </View>
              ) : (
                <Txt variante="corpoP" peso={peso.forte}>
                  Você alcançou todos os selos. Quinhentas vistorias assinadas.
                </Txt>
              )}
              <Txt variante="legenda" discreto>
                Os selos contam as vistorias que você concluiu, desde a primeira.
                Só você os vê.
              </Txt>
            </Cartao>,
          )}

          {bloco(
            <Cartao titulo="Últimos 6 meses">
              <GraficoDeBarras titulo="Últimos 6 meses" barras={numeros.porMes} testID="grafico-dos-meses" />
              <Txt variante="legenda" discreto>
                {dados.totalConcluidas > dados.tetoDeConcluidas
                  ? `Contadas entre as ${dados.tetoDeConcluidas} mais recentes que este aparelho baixou.`
                  : "Vistorias concluídas por mês, pela data da coleta."}
              </Txt>
            </Cartao>,
          )}
        </Grupo>
      )}

      {concluidas.length > 0 && (
        <Grupo titulo="As mais recentes">
          {bloco(
            <Cartao>
              <View style={{ gap: espaco.e3 }}>
                {naTela.map((v, i) => (
                  <View key={v.id} style={{ gap: espaco.e2 }}>
                    {i > 0 && <Separador />}
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
              {dados && dados.totalConcluidas > naTela.length && (
                <Txt variante="legenda" discreto>
                  Mostrando as {naTela.length} mais recentes de {dados.totalConcluidas}.
                  {dados.totalConcluidas > dados.tetoDeConcluidas
                    ? ` Este aparelho baixou as ${dados.tetoDeConcluidas} últimas;`
                      + " as anteriores estão no painel da coordenação."
                    : ""}
                </Txt>
              )}
            </Cartao>,
          )}
        </Grupo>
      )}

      {dados && (
        <Grupo titulo="A minha equipe">
          {dados.equipe === null ? bloco(
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
            />,
          ) : bloco(
            <Cartao titulo={dados.equipe.nome}>
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

              <View style={{ flexDirection: "row", alignItems: "baseline", gap: espaco.e2 }}>
                <View style={{ flex: 1 }}>
                  <Txt variante="corpoP" peso={peso.forte}>
                    Integrantes ativos ({colegasAtivos.length})
                  </Txt>
                </View>
                {/*
                  QUEM ESTÁ EM CAMPO AGORA, pela saída a campo declarada com
                  sinal. É o que a coordenação vê, reduzido ao que a equipe
                  precisa: quantos, e quem. Na cópia do disco é "quando este
                  aparelho baixou", e o rodapé da tela diz quando foi.
                */}
                <View testID="em-campo-agora">
                  <Txt variante="legenda" discreto>
                    {emCampoAgora === 0
                      ? "Ninguém em campo agora"
                      : emCampoAgora === 1 ? "1 em campo agora" : `${emCampoAgora} em campo agora`}
                  </Txt>
                </View>
              </View>

              {colegasAtivos.length <= 1 ? (
                <Txt variante="corpoP" discreto>
                  Você é o único integrante ativo desta equipe agora.
                </Txt>
              ) : (
                <View style={{ gap: espaco.e3 }}>
                  {colegasAtivos.map((c) => {
                    const coordena = c.papel === "coordenador" || c.papel === "administrador";
                    return (
                      <View
                        key={c.id}
                        testID={`colega-${c.id}`}
                        style={{ flexDirection: "row", alignItems: "center", gap: espaco.e3 }}
                      >
                        {/*
                          O coordenador em destaque: avatar maior e nome em
                          negrito, e primeiro na lista. Quem está em campo leva
                          o selo, com ícone e palavra, em peso leve: é estado
                          de agora, não alarme.
                        */}
                        <Avatar
                          nome={c.nome}
                          fotoUri={c.fotoUrl}
                          tamanho={coordena ? "medio" : "pequeno"}
                          testID={`avatar-${c.id}`}
                        />
                        <View style={{ flex: 1, gap: espaco.e1 }}>
                          <Txt
                            variante="corpo"
                            peso={c.id === eu || coordena ? peso.negrito : peso.normal}
                          >
                            {c.nome}{c.id === eu ? " (você)" : ""}
                          </Txt>
                          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: espaco.e2 }}>
                            <Chip
                              peso="leve"
                              tom="neutro"
                              texto={ROTULO_PAPEL[c.papel]}
                              simbolo={(cor) => <IconeEquipe cor={cor} tamanho={icone.inline} />}
                            />
                            {c.emCampo && (
                              <Chip
                                peso="leve"
                                tom="ok"
                                texto="Em campo"
                                descricao={`${c.nome} está em campo agora`}
                                simbolo={(cor) => <IconeLocalizacao cor={cor} tamanho={icone.inline} />}
                              />
                            )}
                          </View>
                        </View>
                      </View>
                    );
                  })}
                </View>
              )}
            </Cartao>,
          )}
        </Grupo>
      )}

      <Grupo titulo="O que aconteceu no município">
        {/*
          O SINO MORA EM TELA PRÓPRIA AGORA (`avisos.tsx`, com o ícone na
          barra). O que fica aqui é o caminho até ela, para quem procura os
          avisos no perfil, que foi onde eles moraram até hoje.
        */}
        {bloco(
          <Cartao>
            <Botao
              titulo="Ver avisos"
              tipo="secundario"
              testID="ver-avisos"
              descricao="Abrir a lista de avisos do município"
              icone={(cor) => <IconeInformacao cor={cor} tamanho={icone.acao} />}
              onPress={() => { router.push("/(agente)/avisos"); }}
            />
            <Txt variante="legenda" discreto>
              Vistoria recebida, prazo vencido, órgão que respondeu. É o canal
              que funciona quando a notificação não chega.
            </Txt>
          </Cartao>,
        )}
      </Grupo>

      <Grupo titulo="Ajustes">
        {bloco(
          <Cartao>
            <CabecalhoDeAjuste
              desenho={(cor) => <IconeSinal cor={cor} tamanho={icone.acao} />}
              titulo="Este aparelho"
              apoio="O que muda sozinho, para conferir de relance."
            />
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
            <LinhaDeEstado rotulo="Servidor">
              <Txt variante="corpoP" mono>{enderecoDaApi()}</Txt>
            </LinhaDeEstado>
          </Cartao>,
        )}

        {bloco(
          <Cartao>
            <CabecalhoDeAjuste
              desenho={(cor) => <IconeAparelho cor={cor} tamanho={icone.acao} />}
              titulo="Aparência"
              apoio="A tela clara se lê melhor com sol, e a escura cansa menos no plantão da noite."
            />
            <View
              accessibilityRole="radiogroup"
              accessibilityLabel="Tema da tela"
              style={{ gap: espaco.e2 }}
            >
              <OpcaoDeTema
                valor="sistema"
                rotulo="Acompanhar o sistema"
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
          </Cartao>,
        )}

        {bloco(
          <Cartao>
            <CabecalhoDeAjuste
              desenho={(cor) => <IconeAlerta cor={cor} tamanho={icone.acao} />}
              titulo="Notificação"
              apoio="O aviso de tarefa nova e de prazo vencendo, na tela bloqueada."
            />
            <LinhaDeEstado
              rotulo="Notificação de tarefa e de prazo"
              desenho={<IconeAparelho cor={tema.textoDiscreto} tamanho={icone.rotulo} />}
            >
              <Chip texto={frases.titulo} simbolo={selo.simbolo} tom={selo.tom} peso="leve" />
            </LinhaDeEstado>
            <Txt variante="corpoP" discreto>{frases.texto}</Txt>

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

            {desfechoDoPedido && (
              <Aviso tom={desfechoDoPedido.tom} peso="leve" titulo={desfechoDoPedido.titulo}>
                {desfechoDoPedido.texto}
              </Aviso>
            )}

            {abriuOsAjustes && (
              <Aviso tom="info" titulo="Os ajustes foram abertos">
                Se você ligou a notificação por lá, é só voltar para cá: o estado
                acima se atualiza sozinho.
              </Aviso>
            )}

            {push.registro === "push_desligado" && (
              <Aviso tom="info">
                A prefeitura ainda não ligou o envio de aviso neste servidor. As
                tarefas continuam aparecendo quando você abre o aplicativo, e o
                que aconteceu no município continua aparecendo em Avisos.
              </Aviso>
            )}
            {push.registro === "falhou" && (
              <Aviso tom="alerta">
                Não deu para registrar este aparelho para receber aviso. Entre de
                novo com sinal, e avise a coordenação se continuar assim.
              </Aviso>
            )}
          </Cartao>,
        )}

        {bloco(
          <Cartao>
            <CabecalhoDeAjuste
              desenho={(cor) => <IconeAssinatura cor={cor} tamanho={icone.acao} />}
              titulo="Conta"
              apoio="Quem assina o laudo, e como entrar de novo."
            />
            {email && (
              <LinhaDeEstado rotulo="Email">
                <Txt variante="corpoP" peso={peso.forte} numeroDeLinhas={1}>{email}</Txt>
              </LinhaDeEstado>
            )}
            <LinhaDeEstado rotulo="Matrícula">
              <Txt variante="corpoP" mono peso={peso.forte}>{identidade.matricula}</Txt>
            </LinhaDeEstado>
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

            <Separador />

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
              onPress={() => { void perguntarSaida(); }}
            />
          </Cartao>,
        )}
      </Grupo>

      <Txt variante="legenda" discreto alinhamento="center">
        Atualizado {idadeEmPalavras(baixadoEm ? new Date(baixadoEm) : null, agora)}
        {atualizando ? " (buscando)" : ""}
      </Txt>

      <Dialogo
        aberto={perguntandoSaida}
        titulo="Sair da conta?"
        texto={textoDaSaida}
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

      <Dialogo
        aberto={perguntandoRemocao}
        titulo="Remover a foto de perfil?"
        texto="A foto sai do servidor e deste aparelho, e o seu nome volta a aparecer com as iniciais. Você pode adicionar outra quando quiser."
        testID="dialogo-remover-foto"
        acao={{
          rotulo: "Remover a foto",
          destrutiva: true,
          aoTocar: () => void removerFoto(),
        }}
        recusa={{ rotulo: "Manter a foto" }}
        aoFechar={() => { setPerguntandoRemocao(false); }}
      />
    </ScrollView>
  );
}
