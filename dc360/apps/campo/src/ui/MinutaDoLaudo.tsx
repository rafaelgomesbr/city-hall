import { ScrollView, View } from "react-native";
import type { Minuta } from "@dc360/shared";
import { Separador, Txt, useTema } from "./componentes";
import { espaco, raio } from "./tokens";

/**
 * A minuta desenhada na tela do aparelho.
 *
 * Ela imita a forma de um documento oficial de propósito: cabeçalho com o
 * órgão, protocolo em destaque, seções tituladas, checklist em duas colunas.
 * O agente vira o telefone para o morador e a pessoa reconhece o que está
 * vendo. Uma lista de campos soltos não teria esse efeito.
 *
 * E ao mesmo tempo ela precisa gritar que NÃO é o documento. A faixa de aviso
 * fica fixa no topo, dentro do quadro, e o rodapé repete: quem fotografar a
 * tela leva a marca junto, quem rolar até o fim lê de novo. Um pedaço de laudo
 * circulando sem essa marca é o pior desfecho desta tela, pior do que ela não
 * existir.
 *
 * Zero rede, zero servidor, zero dependência nova. Tudo aqui é `View` e
 * `Text` sobre um objeto que veio de `montarMinuta`, no pacote compartilhado,
 * que é onde a regra mora.
 */

export function MinutaDoLaudo({ minuta }: { minuta: Minuta }): React.JSX.Element {
  const tema = useTema();

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: tema.fundo }}
      contentContainerStyle={{ padding: espaco.e4, gap: espaco.e4, paddingBottom: espaco.e8 }}
    >
      {/*
        A faixa de aviso, e ela vem ANTES do cabeçalho.

        Se o documento aparecesse primeiro, o olho leria "Coordenadoria
        Municipal de Proteção e Defesa Civil" e já teria decidido que aquilo é
        oficial. A marca precisa chegar antes da impressão que ela corrige.
      */}
      <View
        accessibilityRole="alert"
        style={{
          backgroundColor: tema.alertaFundo,
          borderRadius: raio.cartao,
          padding: espaco.e3,
          borderLeftWidth: 4,
          borderLeftColor: tema.alertaTexto,
        }}
      >
        <Txt variante="corpoP" negrito cor={tema.alertaTexto}>
          {minuta.aviso}
        </Txt>
      </View>

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
        <View style={{ alignItems: "center", gap: espaco.e1 }}>
          <Txt variante="legenda" discreto alinhamento="center">
            {minuta.cabecalho.orgao}
          </Txt>
          <Txt variante="legenda" discreto alinhamento="center">
            {minuta.cabecalho.municipio}, {minuta.cabecalho.uf}
          </Txt>
          <Txt variante="h3" alinhamento="center">{minuta.titulo}</Txt>
          <Txt variante="corpoP" mono negrito>{minuta.protocolo}</Txt>
        </View>

        {minuta.secoes.map((secao) => (
          <View key={secao.titulo} style={{ gap: espaco.e2 }}>
            <Separador />
            <Txt variante="legenda" discreto>{secao.titulo.toUpperCase()}</Txt>

            {secao.tipo === "campos" && secao.linhas.map((linha) => (
              <View key={linha.rotulo} style={{ gap: 2 }}>
                <Txt variante="legenda" discreto>{linha.rotulo}</Txt>
                <Txt variante="corpoP" mono={linha.mono}>{linha.valor}</Txt>
              </View>
            ))}

            {secao.tipo === "texto" && (
              <Txt variante="corpoP">{secao.corpo}</Txt>
            )}

            {secao.tipo === "checklist" && secao.itens.map((item) => (
              /*
                A resposta vem em PALAVRA, e não em cor nem em marca de seleção.

                O agente lê isto em voz alta para alguém que pode não estar
                olhando a tela, e às vezes ele mesmo está sob sol forte, onde
                verde e vermelho ficam iguais. "SIM" e "NÃO" funcionam nos dois
                casos, e é a mesma palavra que o laudo oficial imprime.
              */
              <View
                key={item.rotulo}
                style={{ flexDirection: "row", gap: espaco.e3, alignItems: "flex-start" }}
              >
                <View style={{ minWidth: 44 }}>
                  <Txt variante="corpoP" negrito>{item.resposta ? "SIM" : "NÃO"}</Txt>
                </View>
                <View style={{ flex: 1 }}>
                  <Txt variante="corpoP">{item.rotulo}</Txt>
                </View>
              </View>
            ))}
          </View>
        ))}
      </View>

      <Txt variante="legenda" discreto alinhamento="center">
        {minuta.aviso}
      </Txt>
    </ScrollView>
  );
}
