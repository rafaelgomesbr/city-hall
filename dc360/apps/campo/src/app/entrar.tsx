import { useState } from "react";
import {
  KeyboardAvoidingView, Platform, Pressable, ScrollView, View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Redirect } from "expo-router";
import { ErroDaApi, SemSinal, enderecoDaApi } from "../dados/api";
import { useSessao } from "../dados/sessao";
import { Aviso, Botao, Txt, useTema } from "../ui/componentes";
import { CampoDeTexto } from "../ui/Campo";
import { IconeInformacao } from "../ui/icones";
import { borda, espaco, icone, peso, raio, toque } from "../ui/tokens";

/**
 * Identificação do agente.
 *
 * Esta é a única tela do aplicativo que EXIGE sinal, e ela diz isso. Entrar
 * pela primeira vez precisa acontecer na base, antes de sair, e não no alto do
 * morro: sem sessão não há o que baixar nem para onde enviar.
 *
 * Depois de entrar uma vez, a sessão fica no cofre do aparelho e o aplicativo
 * abre direto nas tarefas, mesmo sem sinal nenhum.
 *
 * ---
 *
 * O que mudou na frente F7, e os três defeitos eram de RETORNO: a tela fazia as
 * coisas certas e não contava nenhuma delas ao dedo que a tocou.
 *
 * 1. **Os campos não tinham foco desenhado.** A borda em repouso e a borda com
 *    o cursor dentro eram a mesma borda, e o estilo estava copiado verbatim
 *    daqui para a tela de vistoria. As duas coisas morrem juntas com a
 *    primitiva `CampoDeTexto`, que desenha o foco por espessura E por anel, e
 *    não só por cor.
 * 2. **O "Ver/Ocultar" senha não respondia ao toque.** Era um `Pressable` com
 *    uma palavra dentro e um estilo constante: sem `pressed`, sem borda que
 *    muda, sem fundo que muda. Num teclado de celular, com o dedo molhado, não
 *    saber se o toque pegou faz a pessoa tocar de novo, e tocar de novo aqui
 *    esconde a senha que ela acabou de mandar aparecer.
 * 3. **Entrar direito não dizia nada.** O botão voltava de "Entrando" para
 *    "Entrar" no instante do sucesso, porque o `finally` zerava o estado nos
 *    dois desfechos. Enquanto a navegação não acontece, a tela mostra um botão
 *    habilitado dizendo "Entrar" para alguém que ACABOU de entrar, e o segundo
 *    toque manda uma segunda autenticação. Agora o sucesso é um estado
 *    próprio, e dele não se volta.
 *
 * A transição de tela em si é de outra frente (a que cuida dos `_layout`), e
 * continua sendo a padrão do roteador.
 */

/** O que está acontecendo com esta tela agora. */
type Passo =
  /** Esperando o agente preencher. */
  | "parado"
  /** Falando com o servidor. */
  | "entrando"
  /** Deu certo, e a navegação para as tarefas já está a caminho. */
  | "conectado";

export default function Entrar() {
  const { identidade, entrar } = useSessao();
  const tema = useTema();
  const margens = useSafeAreaInsets();

  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  /*
    O erro tem título e texto separados desde a F7.

    Antes era uma frase só dentro de um `Aviso tom="perigo"`, com exatamente o
    mesmo tamanho, forma e peso do aviso fixo de informação que mora embaixo do
    botão. Duas gravidades opostas desenhadas igual: quem olha de relance não
    sabe qual das duas caixas é a que impede de entrar.
  */
  const [erro, setErro] = useState<{ titulo: string; texto: string } | null>(null);
  const [passo, setPasso] = useState<Passo>("parado");
  const [senhaVisivel, setSenhaVisivel] = useState(false);
  /* O dedo está em cima do "Ver/Ocultar" agora. Ver o item 2 do cabeçalho. */
  const [olhoSobODedo, setOlhoSobODedo] = useState(false);

  const ocupado = passo !== "parado";

  if (identidade) return <Redirect href="/(agente)" />;

  async function enviar() {
    if (ocupado) return;
    if (!email.trim() || !senha) {
      setErro({
        titulo: "Faltam os dois campos",
        texto: "Informe o email funcional e a senha.",
      });
      return;
    }
    setErro(null);
    setPasso("entrando");
    try {
      await entrar(email, senha);
      /*
        Sucesso NÃO devolve a tela ao estado inicial, e é aqui que mora a
        correção: o `finally` antigo rodava nos dois desfechos, então o botão
        piscava de volta para "Entrar" enquanto a sessão já existia e o
        roteador ainda não tinha trocado a tela.
      */
      setPasso("conectado");
    } catch (e: unknown) {
      /*
        Três mensagens diferentes, porque as três pedem ação diferente: sem
        sinal, procure sinal; senha errada, tente de novo; qualquer outra,
        avise a coordenação. Um "erro ao entrar" genérico deixaria o agente
        tentando a mesma coisa dez vezes.
      */
      if (e instanceof SemSinal) {
        setErro({
          titulo: "Sem sinal para entrar",
          texto:
            "A primeira entrada precisa de conexão, então faça isso ainda na "
            + "base, antes de sair.",
        });
      } else if (e instanceof ErroDaApi) {
        setErro({ titulo: "Não deu para entrar", texto: e.mensagemAmigavel() });
      } else {
        setErro({
          titulo: "Não deu para entrar",
          texto: e instanceof Error ? e.message : String(e),
        });
      }
      setPasso("parado");
    }
  }

  const tituloDoBotao = {
    parado: "Entrar",
    entrando: "Entrando",
    conectado: "Abrindo as suas tarefas",
  }[passo];

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: tema.fundo }}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView
        contentContainerStyle={{
          padding: espaco.e5,
          paddingTop: margens.top + espaco.e7,
          paddingBottom: margens.bottom + espaco.e5,
          gap: espaco.e5,
        }}
        keyboardShouldPersistTaps="handled"
      >
        <View style={{ gap: espaco.e2, alignItems: "center" }}>
          <View style={{
            width: 72, height: 72, borderRadius: raio.cartao,
            backgroundColor: tema.destaque,
            alignItems: "center", justifyContent: "center",
          }}>
            <Txt variante="h1" cor={tema.sobreDestaque}>DC</Txt>
          </View>
          <Txt variante="h2" alinhamento="center">Defesa Civil 360</Txt>
          <Txt variante="corpoP" discreto alinhamento="center">
            Aplicativo do agente de campo
          </Txt>
        </View>

        {erro && <Aviso tom="perigo" titulo={erro.titulo}>{erro.texto}</Aviso>}

        <View style={{ gap: espaco.e3 }}>
          {/*
            Os dois campos saem da primitiva, e não de um objeto de estilo
            declarado nesta tela. O objeto antigo era uma das duas cópias
            verbatim que `Campo` existe para matar (a outra está na vistoria).

            Uma perda declarada na migração: `autoCorrect={false}`, que a
            primitiva não expõe hoje. Quem segura o caso no iOS é o
            `autoComplete="email"`, que já desliga a correção do teclado; no
            Android o teclado de email também não corrige. Alargar a primitiva é
            faixa de quem cuida de `src/ui`.
          */}
          <CampoDeTexto
            rotulo="Email funcional"
            testID="campo-email"
            valor={email}
            aoMudar={setEmail}
            placeholder="nome.sobrenome@municipio.gov.br"
            capitalizacao="none"
            teclado="email-address"
            autoCompletar="email"
            desabilitado={ocupado}
          />

          <CampoDeTexto
            rotulo="Senha"
            testID="campo-senha"
            valor={senha}
            aoMudar={setSenha}
            segredo={!senhaVisivel}
            capitalizacao="none"
            autoCompletar="current-password"
            desabilitado={ocupado}
            aoEnviar={() => void enviar()}
            acessorio={
              /*
                Ver a senha importa mais aqui do que num computador: teclado de
                celular, dedo molhado, senha longa ditada por telefone.

                O retorno do toque muda DUAS coisas, e não uma: o fundo e a
                espessura da borda. Só a cor seria a regra da casa furada no
                único lugar da tela em que o agente precisa ter certeza do que
                tocou, porque o efeito do toque (a senha aparecendo) some junto
                com o dedo se ele errar o alvo.
              */
              <Pressable
                testID="alternar-senha"
                onPress={() => setSenhaVisivel((v) => !v)}
                onPressIn={() => setOlhoSobODedo(true)}
                onPressOut={() => setOlhoSobODedo(false)}
                disabled={ocupado}
                accessibilityRole="button"
                accessibilityLabel={senhaVisivel ? "Esconder a senha" : "Mostrar a senha"}
                accessibilityState={{ selected: senhaVisivel, disabled: ocupado }}
                style={{
                  minWidth: toque, minHeight: toque,
                  alignItems: "center", justifyContent: "center",
                  paddingHorizontal: espaco.e3,
                  borderRadius: raio.normal,
                  borderWidth: olhoSobODedo ? borda.enfase : borda.fio,
                  borderColor: olhoSobODedo ? tema.destaque : tema.borda,
                  backgroundColor: olhoSobODedo ? tema.superficie2 : "transparent",
                }}
              >
                <Txt variante="corpoP" peso={peso.negrito}>
                  {senhaVisivel ? "Ocultar" : "Ver"}
                </Txt>
              </Pressable>
            }
          />
        </View>

        <Botao
          titulo={tituloDoBotao}
          onPress={() => void enviar()}
          carregando={ocupado}
        />

        {/*
          A instrução permanente deixou de ser uma caixa.

          Ela é verdadeira e útil na PRIMEIRA vez, e ninguém a relê na segunda:
          desenhada como `Aviso`, ela tinha o mesmo peso da tarja que diz por
          que a entrada falhou, e competia com ela todos os dias. Como linha
          discreta com o ícone de informação ao lado, ela continua legível e
          para de disputar atenção com o erro.
        */}
        <View style={{ flexDirection: "row", gap: espaco.e2, alignItems: "flex-start" }}>
          <View
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
            style={{ paddingTop: espaco.e1 }}
          >
            <IconeInformacao cor={tema.textoDiscreto} tamanho={icone.inline} />
          </View>
          <View style={{ flex: 1 }}>
            <Txt variante="legenda" discreto>
              Entre ainda na base, com sinal. Depois disso o aplicativo abre
              direto, e a vistoria funciona sem conexão nenhuma.
            </Txt>
          </View>
        </View>

        {/* Qual servidor este binário está usando. Sem isto, descobrir que o
            aparelho ficou apontando para homologação exige abrir o código. */}
        <Txt variante="legenda" discreto alinhamento="center" mono>
          {enderecoDaApi() || "endereço da API não configurado"}
        </Txt>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
