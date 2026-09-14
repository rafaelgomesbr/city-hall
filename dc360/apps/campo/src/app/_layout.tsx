import { useEffect } from "react";
import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { ProvedorDeSessao, useSessao } from "../dados/sessao";
import { ProvedorDePush } from "../push/ProvedorDePush";
import { BarraDeStatus } from "../ui/BarraDeStatus";
import { ProvedorDeTema, useEstadoDoTema, useTema } from "../ui/componentes";
import { ProvedorDeFontes, useFontes } from "../ui/fontes";
import { familiaDoTexto } from "../ui/tipografia";
import { useReducaoDeMovimento } from "../ui/useReducaoDeMovimento";
import { movimento, peso } from "../ui/tokens";

/**
 * A casca do aplicativo.
 *
 * A tela de abertura fica de pé até DUAS coisas ficarem prontas, e as duas
 * pelo mesmo motivo: não mostrar um estado que vai mudar sozinho um instante
 * depois.
 *
 * 1. **A sessão, lida do cofre.** Sem isso, o agente vê por um instante a tela
 *    de entrada, e só depois o aplicativo descobre que ele já estava logado: um
 *    piscar que parece defeito e que, no alto do morro sem sinal, dá a
 *    impressão de que a sessão caiu.
 * 2. **A tipografia do produto.** Sem isso, a primeira tela sai na fonte do
 *    sistema e é RETIPOGRAFADA quando os arquivos chegam. Todo texto muda de
 *    largura de uma vez, a tela reflui, e quem estava lendo perde a linha.
 * 3. **O tema escolhido, lido do aparelho.** É o mesmo caso, na cor: sem
 *    esperar, quem escolheu o tema claro abre o aplicativo no escuro (que é o
 *    padrão do provedor enquanto a leitura não voltou) e vê a tela inteira
 *    trocar de cor sozinha um instante depois. Trocar de cor sozinho é o que
 *    todo aplicativo faz quando está com defeito.
 *
 * A diferença entre elas está no fracasso, e ela é a razão de `fontes.tsx`
 * existir: sessão que não lê é problema de sessão, fonte que não carrega é
 * questão de estética. O aplicativo abre sem a fonte, com a reserva do
 * sistema, e NUNCA fica preso na abertura por causa dela. O tema tem a mesma
 * garantia por outro caminho: `lerPreferenciaDeTema` não estoura e sempre
 * responde, nem que seja o padrão, então esperar por ele não é esperar por
 * disco que pode não vir.
 */

void SplashScreen.preventAutoHideAsync();

function Navegacao() {
  const { carregando } = useSessao();
  const fontes = useFontes();
  const tema = useTema();
  const escolhaDeTema = useEstadoDoTema();
  const reduzirMovimento = useReducaoDeMovimento();
  const pronto = !carregando && fontes.liberado && escolhaDeTema.carregada;

  useEffect(() => {
    if (pronto) void SplashScreen.hideAsync();
  }, [pronto]);

  if (!pronto) return null;

  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: tema.superficie },
        headerTintColor: tema.texto,
        // O título do cabeçalho é texto do produto como qualquer outro, e sem
        // esta linha ele ficaria sendo a única superfície do aplicativo ainda
        // desenhada na fonte do sistema.
        headerTitleStyle: {
          fontFamily: familiaDoTexto({ peso: peso.negrito, fontesProntas: fontes.prontas }),
          ...(fontes.prontas ? {} : { fontWeight: peso.negrito }),
        },
        contentStyle: { backgroundColor: tema.fundo },
        /*
          A TRAVESSIA ENTRE ENTRAR E O APLICATIVO, que não existia.

          Esta pilha tem duas telas e uma passagem só: a entrada do agente, e a
          saída da conta no fim do plantão. Ela não é navegação lateral, é
          troca de mundo, e por isso é `fade` e não deslizamento: deslizar
          sugere que a tela de entrar continua ali do lado, a um gesto de
          voltar, e ela não continua. Cruzar a opacidade diz o que de fato
          acontece, que é um estado substituindo o outro.

          A duração é declarada porque o padrão do iOS para `fade` é 500 ms, e
          meio segundo entre tocar "Entrar" e ver a lista de tarefas é tempo
          suficiente para o agente achar que o toque não pegou. `mudancaDeEstado`
          (e não `respostaAoToque`) porque aqui a tela não está respondendo ao
          dedo: ela está mudando depois de o servidor responder, e esse momento
          merece ser percebido.

          Redução de movimento desliga a travessia inteira. Quem liga essa
          chave no sistema quase sempre liga porque animação dá enjoo, e a troca
          de mundo é justamente a animação que ocupa a tela toda.
        */
        animation: reduzirMovimento ? "none" : "fade",
        animationDuration: movimento.mudancaDeEstado,
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
          {/*
            As fontes ficam DENTRO do tema porque `Txt` lê os dois no mesmo
            render, e FORA do push porque o convite de permissão é uma folha
            desenhada com o texto deste aplicativo: ele precisa da família do
            produto tanto quanto qualquer outra tela.
          */}
          <ProvedorDeFontes>
            <ProvedorDePush>
              {/*
                A barra do sistema segue o TEMA, e não mais o sistema. Ela fica
                aqui dentro porque precisa do provedor de tema por cima; a
                razão inteira está em `ui/BarraDeStatus.tsx`.
              */}
              <BarraDeStatus />
              <Navegacao />
            </ProvedorDePush>
          </ProvedorDeFontes>
        </ProvedorDeTema>
      </ProvedorDeSessao>
    </SafeAreaProvider>
  );
}
