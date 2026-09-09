import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import {
  ActivityIndicator, Pressable, StyleSheet, Text, View, useColorScheme,
  type StyleProp, type ViewStyle,
} from "react-native";
import { ROTULO_SEVERIDADE, type Severidade } from "@dc360/shared";
import { espaco, fonte, linha, raio, temaClaro, temaEscuro, toque, type Tema } from "./tokens";
import { useReducaoDeMovimento } from "./useReducaoDeMovimento";

/**
 * As peças de interface do aplicativo de campo.
 *
 * Duas regras governam tudo aqui, e as duas vêm da rua e não do design:
 *
 * 1. **Nada comunica estado só por cor.** Ícone ou palavra sempre acompanham.
 *    Vale para daltonismo, e vale também para tela com sol batendo em cima,
 *    que é a situação normal de quem trabalha em campo.
 * 2. **Alvo grande.** Nada clicável abaixo de 52 pontos. Ver a razão em
 *    `tokens.ts`.
 */

const ContextoTema = createContext<Tema>(temaEscuro);

export function ProvedorDeTema({ children }: { children: ReactNode }) {
  /*
    O tema segue o aparelho, sem alternador próprio.

    No painel existe alternador porque a pessoa passa o dia na mesma tela. No
    celular, o agente já escolheu no sistema, e oferecer uma segunda chave
    dentro do aplicativo só cria a chance de ficarem diferentes.
  */
  const esquema = useColorScheme();
  return (
    <ContextoTema.Provider value={esquema === "light" ? temaClaro : temaEscuro}>
      {children}
    </ContextoTema.Provider>
  );
}

export function useTema(): Tema {
  return useContext(ContextoTema);
}

/* ========================================================================
   Texto
   ======================================================================== */

type PropsTexto = {
  children: ReactNode;
  variante?: "display" | "h1" | "h2" | "h3" | "corpo" | "corpoP" | "legenda";
  discreto?: boolean;
  cor?: string;
  negrito?: boolean;
  mono?: boolean;
  alinhamento?: "left" | "center" | "right";
  numeroDeLinhas?: number;
};

export function Txt({
  children, variante = "corpo", discreto, cor, negrito, mono, alinhamento, numeroDeLinhas,
}: PropsTexto) {
  const tema = useTema();
  const tamanho = {
    display: fonte.display, h1: fonte.h1, h2: fonte.h2, h3: fonte.h3,
    corpo: fonte.corpo, corpoP: fonte.corpoP, legenda: fonte.legenda,
  }[variante];
  const altura = {
    display: linha.display, h1: linha.h1, h2: linha.h2, h3: linha.h3,
    corpo: linha.corpo, corpoP: linha.corpoP, legenda: linha.legenda,
  }[variante];
  const peso = negrito || variante.startsWith("h") || variante === "display" ? "700" : "400";

  return (
    <Text
      numberOfLines={numeroDeLinhas}
      style={{
        fontSize: tamanho,
        lineHeight: altura,
        fontWeight: peso,
        color: cor ?? (discreto ? tema.textoDiscreto : tema.texto),
        textAlign: alinhamento,
        // Protocolo e matrícula em monoespaçada, como no painel: número que se
        // dita por rádio precisa de dígito inconfundível.
        fontFamily: mono ? (process.env["EXPO_OS"] === "ios" ? "Menlo" : "monospace") : undefined,
      }}
    >
      {children}
    </Text>
  );
}

/* ========================================================================
   Botão
   ======================================================================== */

type PropsBotao = {
  titulo: string;
  onPress: () => void;
  tipo?: "primario" | "secundario" | "discreto" | "perigo";
  desabilitado?: boolean;
  carregando?: boolean;
  /** Descrição para leitor de tela, quando o título não bastar. */
  descricao?: string;
  estilo?: StyleProp<ViewStyle>;
  /*
    Só para teste alcançar o botão pelo papel que ele exerce, e não pelo texto.

    Rótulo é conteúdo, e conteúdo muda: um teste que procura o botão por
    "Descartar esta coleta" reprova quando alguém reescreve a frase, e o defeito
    que ele guardava passa a ser reescrito junto com a frase sem ninguém notar.
  */
  testID?: string;
};

export function Botao({
  titulo, onPress, tipo = "primario", desabilitado, carregando, descricao, estilo, testID,
}: PropsBotao) {
  const tema = useTema();
  const inativo = desabilitado || carregando;

  const cores = {
    primario: { fundo: tema.destaque, texto: tema.sobreDestaque, borda: "transparent" },
    secundario: { fundo: "transparent", texto: tema.texto, borda: tema.borda },
    discreto: { fundo: "transparent", texto: tema.destaque, borda: "transparent" },
    perigo: { fundo: tema.perigoFundo, texto: tema.perigoTexto, borda: "transparent" },
  }[tipo];

  return (
    <Pressable
      onPress={onPress}
      disabled={inativo}
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={descricao ?? titulo}
      accessibilityState={{ disabled: Boolean(inativo), busy: Boolean(carregando) }}
      style={({ pressed }) => [
        {
          minHeight: toque,
          paddingHorizontal: espaco.e4,
          borderRadius: raio.normal,
          backgroundColor: cores.fundo,
          borderWidth: tipo === "secundario" ? 1 : 0,
          borderColor: cores.borda,
          alignItems: "center",
          justifyContent: "center",
          flexDirection: "row",
          gap: espaco.e2,
          opacity: inativo ? 0.5 : pressed ? 0.85 : 1,
        },
        estilo,
      ]}
    >
      {/*
        A roda dentro do botão só existe quando o botão é o ÚNICO lugar que
        conta aquele fato. Tela que já tem texto ou `RefreshControl` contando a
        mesma busca não deve passar `carregando`: três desenhos para um fato só
        foi defeito relatado, e o `testID` existe para o teste poder cobrar isso.
      */}
      {carregando && <ActivityIndicator testID="botao-ocupado" color={cores.texto} />}
      <Text style={{ color: cores.texto, fontSize: fonte.corpo, fontWeight: "700" }}>
        {titulo}
      </Text>
    </Pressable>
  );
}

/* ========================================================================
   Superfícies
   ======================================================================== */

export function Cartao({ titulo, children }: { titulo?: string; children: ReactNode }) {
  const tema = useTema();
  return (
    <View
      style={{
        backgroundColor: tema.superficie,
        borderRadius: raio.cartao,
        borderWidth: 1,
        borderColor: tema.borda,
        padding: espaco.e4,
        gap: espaco.e3,
      }}
    >
      {titulo && <Txt variante="h3">{titulo}</Txt>}
      {children}
    </View>
  );
}

export function Aviso({ tom, children }: {
  tom: "info" | "sucesso" | "alerta" | "perigo";
  children: ReactNode;
}) {
  const tema = useTema();
  const cores = {
    info: { fundo: tema.superficie2, texto: tema.texto, sinal: "i" },
    sucesso: { fundo: tema.okFundo, texto: tema.okTexto, sinal: "✓" },
    alerta: { fundo: tema.alertaFundo, texto: tema.alertaTexto, sinal: "!" },
    perigo: { fundo: tema.perigoFundo, texto: tema.perigoTexto, sinal: "!" },
  }[tom];

  return (
    <View
      accessibilityRole={tom === "perigo" ? "alert" : "text"}
      style={{
        backgroundColor: cores.fundo,
        borderRadius: raio.normal,
        padding: espaco.e3,
        flexDirection: "row",
        gap: espaco.e3,
        alignItems: "flex-start",
      }}
    >
      {/* O sinal é o "nunca só por cor": sem ele, alerta e perigo seriam a
          mesma caixa para quem não distingue as duas cores. */}
      <Text style={{ color: cores.texto, fontWeight: "800", fontSize: fonte.corpo, lineHeight: linha.corpo }}>
        {cores.sinal}
      </Text>
      <View style={{ flex: 1 }}>
        <Text style={{ color: cores.texto, fontSize: fonte.corpoP, lineHeight: linha.corpoP }}>
          {children}
        </Text>
      </View>
    </View>
  );
}

export function Selo({ texto, fundo, cor }: { texto: string; fundo: string; cor: string }) {
  return (
    <View style={{
      backgroundColor: fundo,
      borderRadius: raio.pilula,
      paddingHorizontal: espaco.e3,
      paddingVertical: espaco.e1,
      alignSelf: "flex-start",
    }}>
      <Text style={{ color: cor, fontSize: fonte.legenda, fontWeight: "700" }}>{texto}</Text>
    </View>
  );
}

export function SeloSeveridade({ severidade }: { severidade: Severidade | null }) {
  const tema = useTema();
  if (!severidade) {
    return <Selo texto="Sem classificação" fundo={tema.superficie2} cor={tema.textoDiscreto} />;
  }
  const cores = {
    baixa: { fundo: tema.sevBaixaFundo, cor: tema.sevBaixaTexto },
    media: { fundo: tema.sevMediaFundo, cor: tema.sevMediaTexto },
    alta: { fundo: tema.sevAltaFundo, cor: tema.sevAltaTexto },
    critica: { fundo: tema.sevCriticaFundo, cor: tema.sevCriticaTexto },
  }[severidade];
  // O texto acompanha sempre: a cor sozinha não diz nada sob sol forte.
  return <Selo texto={ROTULO_SEVERIDADE[severidade]} fundo={cores.fundo} cor={cores.cor} />;
}

export function Vazio({ titulo, descricao }: { titulo: string; descricao?: string }) {
  return (
    <View style={{ padding: espaco.e6, gap: espaco.e2, alignItems: "center" }}>
      <Txt variante="h3" alinhamento="center">{titulo}</Txt>
      {descricao && <Txt variante="corpoP" discreto alinhamento="center">{descricao}</Txt>}
    </View>
  );
}

/**
 * Depois de quanto tempo a espera deixa de ser normal e precisa se explicar.
 *
 * Seis segundos, e não dez ou trinta: é o tempo em que alguém em pé, na rua,
 * ainda aceita olhar para uma tela parada sem concluir que o aplicativo travou.
 */
export const DEMORA_MS = 6_000;

/**
 * A espera, com hora marcada para deixar de ser silenciosa.
 *
 * O defeito que este componente passou a evitar veio do campo com estas
 * palavras: "fica um spinner roxo estático pendurado no topo da tela para
 * sempre". A causa não era o desenho girar ou não; era a espera não ter fim
 * declarado. Primeira abertura da tela, sem cópia gravada no aparelho, com
 * sinal fraco: a busca ficava pendurada no tempo limite da rede e a tela
 * ficava exatamente assim, sem segunda linha e sem porta de saída. O que o
 * agente faz nessa situação é matar o aplicativo, e matar o aplicativo no meio
 * do plantão é o único jeito de perder coleta neste produto.
 *
 * Por isso três coisas, e cada uma corrige uma parte do relato:
 *
 * 1. **Aos seis segundos a espera admite que está demorando.** Sem essa linha,
 *    o agente não tem como distinguir "está vindo" de "travou".
 * 2. **Junto com a linha vem uma saída.** Espera sem saída é o que faz alguém
 *    fechar o aplicativo à força. Aqui a saída é sempre visível a partir dos
 *    seis segundos, mesmo quando a tela que chamou não passou nada para fazer.
 * 3. **O temporizador é limpo no desmonte.** Sem isso, sair da aba antes dos
 *    seis segundos deixa um `setTimeout` vivo escrevendo estado em componente
 *    desmontado. É ruído que não quebra nada visível e, exatamente por isso,
 *    esconde defeito de verdade no meio dos avisos.
 *
 * O papel de acessibilidade é `progressbar` com rótulo em português: para quem
 * usa leitor de tela, a roda girando não existe, e sem rótulo a tela inteira é
 * silêncio.
 */
export function Carregando({ mensagem, aoDesistir, rotuloDaSaida = "Parar de esperar" }: {
  mensagem?: string;
  /**
   * O que a tela que chamou faz quando o agente desiste de esperar. Opcional:
   * sem isso a espera some do mesmo jeito, só sem ninguém mais ser avisado.
   */
  aoDesistir?: () => void;
  rotuloDaSaida?: string;
}) {
  const tema = useTema();
  const reduzirMovimento = useReducaoDeMovimento();
  const [demorou, setDemorou] = useState(false);
  const [desistiu, setDesistiu] = useState(false);

  useEffect(() => {
    const relogio = setTimeout(() => setDemorou(true), DEMORA_MS);
    return () => { clearTimeout(relogio); };
  }, []);

  if (desistiu) {
    return (
      <View
        accessibilityRole="text"
        accessibilityLiveRegion="polite"
        style={{ padding: espaco.e6, gap: espaco.e2, alignItems: "center" }}
      >
        <Txt variante="corpoP" alinhamento="center">Você parou a espera.</Txt>
        <Txt variante="legenda" discreto alinhamento="center">
          O que já estava guardado no aparelho continua lá. Tente de novo quando
          o sinal melhorar.
        </Txt>
      </View>
    );
  }

  const base = mensagem ?? "Carregando";

  return (
    <View
      testID="espera"
      accessibilityRole="progressbar"
      // O leitor de tela anuncia o rótulo, e é ele que precisa mudar quando a
      // espera passa dos seis segundos: quem não vê a segunda linha teria, sem
      // isto, a mesma tela silenciosa de antes.
      accessibilityLabel={demorou ? `${base}. Está demorando mais que o normal.` : base}
      accessibilityState={{ busy: true }}
      accessibilityLiveRegion="polite"
      style={{ padding: espaco.e6, gap: espaco.e3, alignItems: "center" }}
    >
      {reduzirMovimento ? (
        // Com redução de movimento ligada, a roda girando é justamente o que a
        // pessoa pediu para não ver. A barra parada ocupa o mesmo lugar, e quem
        // diz o que está acontecendo é o texto abaixo, não o desenho.
        <View
          testID="espera-sem-movimento"
          style={{
            width: espaco.e7, height: espaco.e2,
            borderRadius: raio.pilula, backgroundColor: tema.destaque,
          }}
        />
      ) : (
        <ActivityIndicator testID="espera-girando" size="large" color={tema.destaque} />
      )}

      {mensagem && <Txt variante="corpoP" discreto alinhamento="center">{mensagem}</Txt>}

      {demorou && (
        <View style={{ gap: espaco.e3, alignItems: "center" }}>
          <Txt variante="corpoP" alinhamento="center">Está demorando mais que o normal.</Txt>
          <Txt variante="legenda" discreto alinhamento="center">
            Pode ser o sinal daqui. Você não precisa ficar esperando: o que já
            está no aparelho continua guardado.
          </Txt>
          <Botao
            titulo={rotuloDaSaida}
            tipo="secundario"
            onPress={() => { setDesistiu(true); aoDesistir?.(); }}
          />
        </View>
      )}
    </View>
  );
}

export function Separador() {
  const tema = useTema();
  return <View style={{ height: 1, backgroundColor: tema.borda }} />;
}

export const estilos = StyleSheet.create({
  tela: { flex: 1 },
  conteudo: { padding: espaco.e4, gap: espaco.e4 },
  linha: { flexDirection: "row", alignItems: "center", gap: espaco.e3 },
});
