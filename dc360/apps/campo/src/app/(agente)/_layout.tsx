import { useEffect, useRef, useState } from "react";
import { Pressable, View } from "react-native";
import { Redirect, Stack, router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { FilaDeSincronizacao, ResumoFila } from "@dc360/campo";
import { iniciarSincronizacaoContinua, obterFila } from "../../dados/fila";
import { useSinal } from "../../dados/conectividade";
import { useSessao } from "../../dados/sessao";
import { enderecoDaApi } from "../../dados/api";
import { Txt, useTema } from "../../ui/componentes";
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

      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: tema.superficie },
          headerTintColor: tema.texto,
          headerTitleStyle: { fontWeight: "700" },
          contentStyle: { backgroundColor: tema.fundo },
        }}
      >
        <Stack.Screen name="index" options={{ title: "Minhas tarefas" }} />
        <Stack.Screen name="fila" options={{ title: "Fila de envio" }} />
        <Stack.Screen name="conta" options={{ title: "Minha conta" }} />
        <Stack.Screen name="vistoria/[id]" options={{ title: "Vistoria" }} />
      </Stack>
    </View>
  );
}
