import { useEffect, useRef, useState } from "react";
import { Pressable, View, type ColorValue } from "react-native";
import { Redirect, Tabs, router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { FilaDeSincronizacao, ResumoFila } from "@dc360/campo";
import { iniciarSincronizacaoContinua, obterFila } from "../../dados/fila";
import { useSinal } from "../../dados/conectividade";
import { useSessao } from "../../dados/sessao";
import { enderecoDaApi } from "../../dados/api";
import { Txt, useTema } from "../../ui/componentes";
import { IconeEnvio, IconeEquipe, IconeTarefas } from "../../ui/icones";
import { espaco, raio, toque } from "../../ui/tokens";

/**
 * A área autenticada, e a faixa de conectividade que fica no topo dela.
 *
 * A faixa é o elemento mais importante do aplicativo inteiro. Ela responde,
 * sem o agente precisar perguntar, as duas coisas que ele quer saber o tempo
 * todo: tem sinal, e o que eu fiz já foi enviado. Quando as duas respostas
 * estão à vista, ninguém precisa confiar; quando faltam, todo mundo desconfia
 * do sistema justamente na hora em que ele está funcionando.
 */

/**
 * Altura da pílula do menu.
 *
 * `toque` é o alvo mínimo do design system (52, e não 44: ver o comentário no
 * arquivo de tokens). A folga extra acomoda a pílula do item ativo sem
 * espremer o rótulo, que continua sendo obrigatório.
 */
const ALTURA_MENU = toque + espaco.e2;

/**
 * O ícone dentro da pílula arredondada.
 *
 * A pílula só aparece no item ativo, preenchida com a cor de destaque suave.
 * Ela não é enfeite: é a SEGUNDA pista de qual aba está aberta, ao lado da
 * cor do traço, para quem não distingue violeta de cinza e para quem está sob
 * sol forte. A regra do aplicativo é que nada se comunica só por cor, e ela
 * vale para o menu igual.
 */
function IconeEmPilula({
  Icone, cor, ativo, fundoAtivo,
}: {
  /* `ColorValue` e não `string`: é o que o `tabBarIcon` entrega, e é o mesmo
     tipo que os ícones já aceitam. */
  Icone: (p: { cor: ColorValue; tamanho?: number }) => React.JSX.Element;
  cor: ColorValue;
  ativo: boolean;
  fundoAtivo: string;
}) {
  return (
    <View
      style={{
        width: 44,
        height: 26,
        borderRadius: raio.pilula,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: ativo ? fundoAtivo : "transparent",
      }}
    >
      <Icone cor={cor} tamanho={22} />
    </View>
  );
}

export default function LayoutDoAgente() {
  const { identidade, obterToken } = useSessao();
  const tema = useTema();
  const margens = useSafeAreaInsets();
  const sinal = useSinal();

  const [resumo, setResumo] = useState<ResumoFila | null>(null);
  const filaRef = useRef<FilaDeSincronizacao | null>(null);
  const sinalRef = useRef(sinal.temSinal);
  sinalRef.current = sinal.temSinal;

  useEffect(() => {
    if (!identidade) return;
    let vivo = true;
    let parar: (() => void) | undefined;
    let desassinar: (() => void) | undefined;

    void (async () => {
      const fila = await obterFila(enderecoDaApi(), obterToken);
      if (!vivo) return;
      filaRef.current = fila;
      desassinar = fila.assinar((r) => { if (vivo) setResumo(r); });
      /*
        O laço lê o sinal por referência, e não por valor capturado. Sem isso
        ele nasceria acreditando no estado do primeiro quadro e continuaria
        acreditando nisso pelo resto do dia, tentando enviar sem sinal ou
        parado com sinal.
      */
      parar = iniciarSincronizacaoContinua(fila, () => sinalRef.current);
    })();

    return () => {
      vivo = false;
      desassinar?.();
      parar?.();
    };
  }, [identidade, obterToken]);

  // Sinal voltou: tenta agora, sem esperar a próxima janela do laço. É o
  // momento em que o agente está olhando para a tela esperando ver acontecer.
  useEffect(() => {
    if (sinal.temSinal) void filaRef.current?.drenar().catch(() => undefined);
  }, [sinal.temSinal]);

  if (!identidade) return <Redirect href="/entrar" />;

  const pendentes = (resumo?.pendentes ?? 0) + (resumo?.enviando ?? 0);
  const bloqueados = resumo?.bloqueados ?? 0;
  // O que a aba de envio mostra no número: tudo que ainda não chegou lá.
  const naFila = pendentes + bloqueados;
  const recuo = margens;

  const faixa = !sinal.temSinal
    ? { fundo: tema.alertaFundo, cor: tema.alertaTexto, sinalTexto: "!",
        titulo: "Sem sinal", detalhe: "Salvando neste aparelho" }
    : resumo?.sincronizando
      ? { fundo: tema.superficie2, cor: tema.texto, sinalTexto: "↑",
          titulo: "Enviando", detalhe: `${pendentes} na fila` }
      : pendentes > 0
        ? { fundo: tema.superficie2, cor: tema.texto, sinalTexto: "↑",
            titulo: "Com sinal", detalhe: `${pendentes} esperando envio` }
        : { fundo: tema.okFundo, cor: tema.okTexto, sinalTexto: "✓",
            titulo: "Tudo sincronizado", detalhe: "Nada pendente no aparelho" };

  return (
    <View style={{ flex: 1, backgroundColor: tema.fundo, paddingTop: margens.top }}>
      {/*
        A faixa inteira é tocável e leva à fila. Quem lê "3 esperando envio"
        quer ver quais são, e obrigar a procurar isso num menu é o caminho
        para o agente concluir que o aplicativo comeu a vistoria dele.
      */}
      <Pressable
        onPress={() => router.push("/(agente)/fila")}
        accessibilityRole="button"
        accessibilityLabel={`${faixa.titulo}. ${faixa.detalhe}. Toque para ver a fila de envio.`}
        style={{
          backgroundColor: faixa.fundo,
          minHeight: toque,
          paddingHorizontal: espaco.e4,
          paddingVertical: espaco.e2,
          flexDirection: "row",
          alignItems: "center",
          gap: espaco.e3,
        }}
      >
        {/* Símbolo além da cor: sol na tela apaga a diferença entre âmbar e
            verde, e daltonismo apaga de vez. */}
        <View style={{
          width: 28, height: 28, borderRadius: raio.pilula,
          backgroundColor: faixa.cor,
          alignItems: "center", justifyContent: "center",
        }}>
          <Txt variante="corpoP" negrito cor={faixa.fundo}>{faixa.sinalTexto}</Txt>
        </View>
        <View style={{ flex: 1 }}>
          <Txt variante="corpoP" negrito cor={faixa.cor}>{faixa.titulo}</Txt>
          <Txt variante="legenda" cor={faixa.cor}>
            {faixa.detalhe}
            {bloqueados > 0 && `, ${bloqueados} com problema`}
          </Txt>
        </View>
        <Txt variante="legenda" cor={faixa.cor}>ver fila</Txt>
      </Pressable>

      {/*
        Barra FLUTUANTE, e não encostada na borda.

        O motivo primeiro é alcance, não estética. Antes de existir barra
        nenhuma, o único caminho para a fila era tocar a faixa lá em cima, e
        "Minha conta" ficava no FIM do rolamento das tarefas. Num aparelho de
        6,7 polegadas segurado com uma mão, no alto de um barranco, o topo da
        tela é o ponto mais distante do polegar que existe.

        Ela flutua porque encostada na borda ela disputa espaço com a barra de
        gestos do Android, e porque uma pílula solta sobre o conteúdo diz
        sozinha que é um menu, sem precisar de linha divisória. O conteúdo
        rola por baixo dela, e por isso `sceneStyle` reserva o espaço no fim
        do rolamento: sem esse recuo, o último item de toda lista nasceria
        escondido atrás do menu, que é o defeito clássico de barra flutuante.

        Três abas, e não cinco. O Instagram tem cinco destinos de peso igual;
        este aplicativo tem um destino (Tarefas) e uma tarefa (Vistoria). Duas
        abas a mais seriam duas invenções.

        Ícone COM palavra, sempre, e aqui o produto se afasta do Instagram de
        propósito. Lá o ícone sozinho funciona porque a pessoa abre o
        aplicativo várias vezes por dia e decorou os pictogramas. O agente
        abre este duas vezes por semana, com sol na tela e luva no dedo. A
        regra da casa é que nada se comunica só por cor; ícone sozinho falha
        pela mesma razão.

        O item ativo ganha uma pílula preenchida atrás do ícone. É a parte
        "arredondada e bonita" do pedido, e ela também é funcional: soma uma
        segunda pista à cor, para quem não distingue violeta de cinza.

        E a barra SOME dentro da vistoria. Aquela tela é uma tarefa com fim
        irreversível, tem o formulário mais longo do produto, e uma escotilha
        de fuga permanente embaixo do polegar, ao lado de um rolamento longo, é
        como se produz vistoria pela metade.
      */}
      <Tabs
        screenOptions={{
          headerStyle: { backgroundColor: tema.superficie },
          headerTintColor: tema.texto,
          headerTitleStyle: { fontWeight: "700" },
          // O recuo reserva, no fim de toda rolagem, a altura da barra mais a
          // folga em que ela flutua. Sem ele o último item de cada lista
          // nasce atrás do menu.
          sceneStyle: {
            backgroundColor: tema.fundo,
            paddingBottom: ALTURA_MENU + recuo.bottom + espaco.e3,
          },
          tabBarActiveTintColor: tema.destaque,
          tabBarInactiveTintColor: tema.textoDiscreto,
          tabBarStyle: {
            position: "absolute",
            left: espaco.e4,
            right: espaco.e4,
            bottom: recuo.bottom + espaco.e3,
            height: ALTURA_MENU,
            paddingTop: espaco.e2,
            paddingBottom: espaco.e2,
            backgroundColor: tema.superficie,
            borderRadius: raio.pilula,
            // A borda superior padrão desenharia uma linha reta atravessando
            // a pílula. Aqui o contorno é o anel inteiro.
            borderTopWidth: 0,
            borderWidth: 1,
            borderColor: tema.borda,
            /*
              Sombra nas duas plataformas, porque cada uma lê uma propriedade
              e ignora a outra em silêncio. Sem `elevation` a barra flutuante
              fica sem sombra no Android, que é o aparelho de campo.
            */
            elevation: 8,
            shadowColor: "#000000",
            shadowOpacity: 0.18,
            shadowRadius: 12,
            shadowOffset: { width: 0, height: 4 },
          },
          tabBarItemStyle: { paddingTop: 0 },
          tabBarLabelStyle: { fontSize: 12, fontWeight: "600" },
        }}
      >
        <Tabs.Screen
          name="index"
          options={{
            title: "Minhas tarefas",
            tabBarLabel: "Tarefas",
            tabBarIcon: ({ color, focused }) => (
              <IconeEmPilula Icone={IconeTarefas} cor={color} ativo={focused}
                             fundoAtivo={tema.superficie2} />
            ),
          }}
        />
        <Tabs.Screen
          name="fila"
          options={{
            title: "Fila de envio",
            tabBarLabel: "Envio",
            tabBarIcon: ({ color, focused }) => (
              <IconeEmPilula Icone={IconeEnvio} cor={color} ativo={focused}
                             fundoAtivo={tema.superficie2} />
            ),
            // Número, e não pontinho colorido: o agente precisa saber QUANTAS
            // coletas estão esperando, não só que existe alguma.
            tabBarBadge: naFila > 0 ? naFila : undefined,
            tabBarBadgeStyle: {
              backgroundColor: bloqueados > 0 ? tema.perigoTexto : tema.destaque,
              color: "#FFFFFF",
              fontSize: 11,
            },
            tabBarAccessibilityLabel: naFila === 0
              ? "Envio, nada esperando"
              : `Envio, ${naFila} ${naFila === 1 ? "coleta" : "coletas"} esperando`
                + (bloqueados > 0 ? `, ${bloqueados} com problema` : ""),
          }}
        />
        <Tabs.Screen
          name="equipe"
          options={{
            title: "Minha equipe",
            tabBarLabel: "Equipe",
            tabBarIcon: ({ color, focused }) => (
              <IconeEmPilula Icone={IconeEquipe} cor={color} ativo={focused}
                             fundoAtivo={tema.superficie2} />
            ),
          }}
        />
        {/* Fora da barra: alcançada pela tela de equipe. */}
        <Tabs.Screen name="conta" options={{ title: "Minha conta", href: null }} />
        {/* Fora da barra, e sem barra: ver o comentário acima. */}
        <Tabs.Screen
          name="vistoria/[id]"
          options={{ title: "Vistoria", href: null, tabBarStyle: { display: "none" } }}
        />
      </Tabs>
    </View>
  );
}
