import { useEffect } from "react";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import * as SplashScreen from "expo-splash-screen";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { ProvedorDeSessao, useSessao } from "../dados/sessao";
import { ProvedorDePush } from "../push/ProvedorDePush";
import { ProvedorDeTema, useTema } from "../ui/componentes";

/**
 * A casca do aplicativo.
 *
 * A tela de abertura fica de pé até a sessão ser lida do cofre. Sem isso, o
 * agente vê por um instante a tela de entrada, e só depois o aplicativo
 * descobre que ele já estava logado: um piscar que parece defeito e que, no
 * alto do morro sem sinal, dá a impressão de que a sessão caiu.
 */

void SplashScreen.preventAutoHideAsync();

function Navegacao() {
  const { carregando } = useSessao();
  const tema = useTema();

  useEffect(() => {
    if (!carregando) void SplashScreen.hideAsync();
  }, [carregando]);

  if (carregando) return null;

  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: tema.superficie },
        headerTintColor: tema.texto,
        headerTitleStyle: { fontWeight: "700" },
        contentStyle: { backgroundColor: tema.fundo },
      }}
    >
      <Stack.Screen name="entrar" options={{ headerShown: false }} />
      <Stack.Screen name="(agente)" options={{ headerShown: false }} />
    </Stack>
  );
}

export default function Raiz() {
  return (
    <SafeAreaProvider>
      <ProvedorDeSessao>
        <ProvedorDeTema>
          {/*
            O push fica DENTRO da sessão e DENTRO do tema, e a ordem é decisão.

            Dentro da sessão porque a terceira barreira contra o aviso de outro
            município compara com o município de quem está logado, e sem a
            sessão por cima ele não teria com o que comparar. Dentro do tema
            porque o convite de permissão é uma folha desenhada por este
            aplicativo, e não a caixa do sistema: no plantão noturno ela precisa
            abrir escura como o resto da tela.
          */}
          <ProvedorDePush>
            <StatusBar style="auto" />
            <Navegacao />
          </ProvedorDePush>
        </ProvedorDeTema>
      </ProvedorDeSessao>
    </SafeAreaProvider>
  );
}
