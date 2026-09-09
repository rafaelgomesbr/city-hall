import { ScrollView, View } from "react-native";
import type { Minuta } from "@dc360/shared";
import { Txt } from "./componentes";
import { espaco, papel, raio } from "./tokens";

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
 * **Esta tela não segue o tema do aplicativo**, e é a única junto com o quadro
 * de assinatura. Ela usava `tema.fundo` e `tema.superficie`, e no tema escuro
 * virava um cartão escuro com texto claro: o morador olhava e não via
 * documento nenhum, que é exatamente o efeito para o qual ela existe. Papel não
 * tem modo escuro. As cores vêm de `papel`, em `tokens.ts`, e são as mesmas do
 * papel de verdade em `apps/api/src/documentos/folha.ts`.
 *
 * Pelo mesmo motivo o separador é desenhado aqui e não vem de `Separador`, do
 * arquivo de componentes: aquele usa `tema.borda` e voltaria a escurecer junto
 * com a interface.
 *
 * Zero rede, zero servidor, zero dependência nova. Tudo aqui é `View` e
 * `Text` sobre um objeto que veio de `montarMinuta`, no pacote compartilhado,
 * que é onde a regra mora.
 */

function Regua() {
  return <View style={{ height: 1, backgroundColor: papel.linha }} />;
}

export function MinutaDoLaudo({ minuta }: { minuta: Minuta }): React.JSX.Element {
  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: papel.mesa }}
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
          backgroundColor: papel.avisoFundo,
          borderRadius: raio.cartao,
          padding: espaco.e3,
          borderLeftWidth: 4,
          borderLeftColor: papel.avisoTinta,
        }}
      >
        <Txt variante="corpoP" negrito cor={papel.avisoTinta}>
          {minuta.aviso}
        </Txt>
      </View>

      <View
        testID="folha-da-minuta"
        style={{
          backgroundColor: papel.fundo,
          borderRadius: raio.cartao,
          borderWidth: 1,
          borderColor: papel.linha,
          padding: espaco.e4,
          gap: espaco.e3,
        }}
      >
        <View style={{ alignItems: "center", gap: espaco.e1 }}>
          <Txt variante="legenda" cor={papel.tintaDiscreta} alinhamento="center">
            {minuta.cabecalho.orgao}
          </Txt>
          <Txt variante="legenda" cor={papel.tintaDiscreta} alinhamento="center">
            {minuta.cabecalho.municipio}, {minuta.cabecalho.uf}
          </Txt>
          <Txt variante="h3" cor={papel.tinta} alinhamento="center">{minuta.titulo}</Txt>
          <Txt variante="corpoP" mono negrito cor={papel.tinta}>{minuta.protocolo}</Txt>
        </View>

        {minuta.secoes.map((secao) => (
          <View key={secao.titulo} style={{ gap: espaco.e2 }}>
            <Regua />
            <Txt variante="legenda" cor={papel.tintaDiscreta}>{secao.titulo.toUpperCase()}</Txt>

            {secao.tipo === "campos" && secao.linhas.map((linha) => (
              <View key={linha.rotulo} style={{ gap: 2 }}>
                <Txt variante="legenda" cor={papel.tintaDiscreta}>{linha.rotulo}</Txt>
                <Txt variante="corpoP" mono={linha.mono} cor={papel.tinta}>{linha.valor}</Txt>
              </View>
            ))}

            {secao.tipo === "texto" && (
              <Txt variante="corpoP" cor={papel.tinta}>{secao.corpo}</Txt>
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
                  <Txt variante="corpoP" negrito cor={papel.tinta}>
                    {item.resposta ? "SIM" : "NÃO"}
                  </Txt>
                </View>
                <View style={{ flex: 1 }}>
                  <Txt variante="corpoP" cor={papel.tinta}>{item.rotulo}</Txt>
                </View>
              </View>
            ))}
          </View>
        ))}
      </View>

      <Txt variante="legenda" cor={papel.tintaDiscreta} alinhamento="center">
        {minuta.aviso}
      </Txt>
    </ScrollView>
  );
}
