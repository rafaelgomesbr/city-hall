import { useState } from "react";
import {
  KeyboardAvoidingView, Platform, Pressable, ScrollView, TextInput, View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Redirect } from "expo-router";
import { ErroDaApi, SemSinal, enderecoDaApi } from "../dados/api";
import { useSessao } from "../dados/sessao";
import { Aviso, Botao, Txt, useTema } from "../ui/componentes";
import { espaco, fonte, raio, toque } from "../ui/tokens";

/**
 * Identificação do agente.
 *
 * Esta é a única tela do aplicativo que EXIGE sinal, e ela diz isso. Entrar
 * pela primeira vez precisa acontecer na base, antes de sair, e não no alto do
 * morro: sem sessão não há o que baixar nem para onde enviar.
 *
 * Depois de entrar uma vez, a sessão fica no cofre do aparelho e o aplicativo
 * abre direto nas tarefas, mesmo sem sinal nenhum.
 */
export default function Entrar() {
  const { identidade, entrar } = useSessao();
  const tema = useTema();
  const margens = useSafeAreaInsets();

  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [entrando, setEntrando] = useState(false);
  const [senhaVisivel, setSenhaVisivel] = useState(false);

  if (identidade) return <Redirect href="/(agente)" />;

  async function enviar() {
    if (!email.trim() || !senha) {
      setErro("Informe o email funcional e a senha.");
      return;
    }
    setErro(null);
    setEntrando(true);
    try {
      await entrar(email, senha);
    } catch (e: unknown) {
      /*
        Três mensagens diferentes, porque as três pedem ação diferente: sem
        sinal, procure sinal; senha errada, tente de novo; qualquer outra,
        avise a coordenação. Um "erro ao entrar" genérico deixaria o agente
        tentando a mesma coisa dez vezes.
      */
      if (e instanceof SemSinal) {
        setErro(
          "Sem sinal para entrar. A primeira entrada precisa de conexão, então " +
          "faça isso ainda na base, antes de sair.",
        );
      } else if (e instanceof ErroDaApi) {
        setErro(e.mensagemAmigavel());
      } else {
        setErro(e instanceof Error ? e.message : String(e));
      }
    } finally {
      setEntrando(false);
    }
  }

  const campo = {
    minHeight: toque,
    borderWidth: 1,
    borderColor: tema.borda,
    borderRadius: raio.normal,
    backgroundColor: tema.superficie,
    color: tema.texto,
    paddingHorizontal: espaco.e3,
    fontSize: fonte.corpo,
  } as const;

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

        {erro && <Aviso tom="perigo">{erro}</Aviso>}

        <View style={{ gap: espaco.e3 }}>
          <View style={{ gap: espaco.e1 }}>
            <Txt variante="corpoP" negrito>Email funcional</Txt>
            <TextInput
              value={email}
              onChangeText={setEmail}
              style={campo}
              placeholder="nome.sobrenome@municipio.gov.br"
              placeholderTextColor={tema.textoDiscreto}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="email-address"
              textContentType="username"
              accessibilityLabel="Email funcional"
              editable={!entrando}
            />
          </View>

          <View style={{ gap: espaco.e1 }}>
            <Txt variante="corpoP" negrito>Senha</Txt>
            <View style={{ flexDirection: "row", gap: espaco.e2, alignItems: "center" }}>
              <TextInput
                value={senha}
                onChangeText={setSenha}
                style={[campo, { flex: 1 }]}
                secureTextEntry={!senhaVisivel}
                autoCapitalize="none"
                autoCorrect={false}
                textContentType="password"
                accessibilityLabel="Senha"
                editable={!entrando}
                onSubmitEditing={() => void enviar()}
              />
              {/*
                Ver a senha importa mais aqui do que num computador: teclado de
                celular, dedo molhado, senha longa ditada por telefone.
              */}
              <Pressable
                onPress={() => setSenhaVisivel((v) => !v)}
                accessibilityRole="button"
                accessibilityLabel={senhaVisivel ? "Esconder a senha" : "Mostrar a senha"}
                style={{
                  minWidth: toque, minHeight: toque,
                  alignItems: "center", justifyContent: "center",
                  borderRadius: raio.normal, borderWidth: 1, borderColor: tema.borda,
                }}
              >
                <Txt variante="corpoP" negrito>{senhaVisivel ? "Ocultar" : "Ver"}</Txt>
              </Pressable>
            </View>
          </View>
        </View>

        <Botao
          titulo={entrando ? "Entrando" : "Entrar"}
          onPress={() => void enviar()}
          carregando={entrando}
        />

        <Aviso tom="info">
          Entre ainda na base, com sinal. Depois disso o aplicativo abre direto,
          e a vistoria funciona sem conexão nenhuma.
        </Aviso>

        {/* Qual servidor este binário está usando. Sem isto, descobrir que o
            aparelho ficou apontando para homologação exige abrir o código. */}
        <Txt variante="legenda" discreto alinhamento="center">
          {enderecoDaApi() || "endereço da API não configurado"}
        </Txt>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
