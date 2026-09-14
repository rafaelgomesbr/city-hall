import { useEffect, useRef, useState } from "react";
import { Animated, Easing, Pressable, TextInput, View } from "react-native";
import type { OrgaoIndicado } from "@dc360/shared";

import type { OrgaoDoCatalogo } from "../dados/api";
import { Aviso, Botao, Separador, Txt, useTema } from "./componentes";
import { Chip } from "./Chip";
import { borda, espaco, fonte, raio, movimento, toque } from "./tokens";
import { useReducaoDeMovimento } from "./useReducaoDeMovimento";

/**
 * Quais órgãos precisam ser acionados, respondido no local.
 *
 * O DEFEITO QUE ISTO ACABA. "Necessário acionar outro órgão" era sim ou não, e
 * o agente não dizia quem. O laudo chegava à coordenação afirmando que alguém
 * precisa ser acionado e calando o nome, então a primeira providência do
 * coordenador virava um telefonema para o agente, horas depois, com ele já em
 * outra ocorrência ou fora do turno, para perguntar uma coisa que estava clara
 * no barranco no minuto da vistoria. A informação existia; faltava lugar para
 * escrever.
 *
 * O CAMPO LIVRE NÃO É CONVENIÊNCIA, É A REGRA. O catálogo do município desce
 * para o aparelho junto com a lista de tarefas e é lido do disco, nunca da rede.
 * Um aparelho novo, que nunca sincronizou, tem catálogo vazio, e se a seleção
 * dependesse só dele um item OBRIGATÓRIO do checklist travaria a vistoria
 * justamente sem sinal, que é a condição normal de trabalho deste aplicativo.
 * Por isso "Outro órgão" existe SEMPRE, e sozinho basta para concluir: nenhuma
 * vistoria pode ficar impossível por falta de um cadastro.
 *
 * O NOME DIGITADO QUE JÁ ESTÁ NO CATÁLOGO VIRA A ESCOLHA DO CATÁLOGO. Sem isso,
 * "Corpo de Bombeiros" apareceria duas vezes no mesmo laudo, uma com id e outra
 * sem, e a conta de "quantas vezes acionamos os bombeiros" (que é a conta que
 * sustenta conversa de orçamento) contaria duas.
 *
 * O que é escolhido aparece em três canais e nunca só na cor: o resumo em chip
 * com símbolo, o preenchimento da linha e a palavra dentro dela.
 */

/** Duas letras é o piso: menos que isso não é nome de órgão, é toque acidental. */
const MINIMO_DO_NOME = 2;

function mesmaCoisa(a: string, b: string): boolean {
  return a.trim().toLocaleLowerCase("pt-BR") === b.trim().toLocaleLowerCase("pt-BR");
}

export function OrgaosParaAcionar({
  catalogo,
  escolhidos,
  aoMudar,
}: {
  /** O que desceu com a lista de tarefas. Pode estar vazio, e isso é previsto. */
  catalogo: readonly OrgaoDoCatalogo[];
  escolhidos: readonly OrgaoIndicado[];
  aoMudar: (lista: OrgaoIndicado[]) => void;
}) {
  const tema = useTema();
  const reduzir = useReducaoDeMovimento();
  const [digitado, setDigitado] = useState("");

  /*
    A seção entra com o mesmo movimento das trocas de estado da faixa de
    sincronização: opacidade e um deslocamento curto, na camada nativa.

    Ela aparece embaixo do dedo que acabou de tocar em "Sim", e um bloco que
    surge instantaneamente no meio de um formulário longo empurra o resto da
    tela sem explicar de onde veio. O movimento é o que liga o toque ao que
    apareceu. Quem pediu redução de movimento recebe a seção inteira de uma vez,
    porque a informação está no texto e nunca no movimento.
  */
  const entrada = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (reduzir) {
      entrada.setValue(1);
      return;
    }
    entrada.setValue(0);
    Animated.timing(entrada, {
      toValue: 1,
      duration: movimento.mudancaDeEstado,
      easing: Easing.out(Easing.quad),
      useNativeDriver: true,
    }).start();
  }, [entrada, reduzir]);

  function jaEscolhido(nome: string): boolean {
    return escolhidos.some((e) => mesmaCoisa(e.nome, nome));
  }

  function alternarDoCatalogo(orgao: OrgaoDoCatalogo): void {
    const marcado = escolhidos.some((e) => e.orgaoId === orgao.id);
    aoMudar(
      marcado
        ? escolhidos.filter((e) => e.orgaoId !== orgao.id)
        : [...escolhidos, { orgaoId: orgao.id, nome: orgao.nome }],
    );
  }

  function adicionarDigitado(): void {
    const nome = digitado.trim();
    if (nome.length < MINIMO_DO_NOME) return;

    /*
      O nome digitado que já existe no catálogo entra COMO o do catálogo. O
      agente que não achou a linha na lista (ela estava rolada para fora, ou ele
      digitou antes de procurar) não pode acabar produzindo um segundo "Corpo de
      Bombeiros" sem id dentro do mesmo laudo.
    */
    const doCatalogo = catalogo.find((o) => mesmaCoisa(o.nome, nome));
    if (doCatalogo) {
      if (!escolhidos.some((e) => e.orgaoId === doCatalogo.id)) {
        aoMudar([...escolhidos, { orgaoId: doCatalogo.id, nome: doCatalogo.nome }]);
      }
      setDigitado("");
      return;
    }

    if (!jaEscolhido(nome)) aoMudar([...escolhidos, { orgaoId: null, nome }]);
    setDigitado("");
  }

  function remover(indice: number): void {
    aoMudar(escolhidos.filter((_, i) => i !== indice));
  }

  const digitados = escolhidos
    .map((e, i) => ({ ...e, i }))
    .filter((e) => e.orgaoId === null);

  return (
    <Animated.View
      testID="orgaos-para-acionar"
      style={{
        gap: espaco.e3,
        opacity: entrada,
        transform: [{
          translateY: entrada.interpolate({ inputRange: [0, 1], outputRange: [espaco.e3, 0] }),
        }],
      }}
    >
      <Txt variante="corpoP" negrito>Quais órgãos precisam ser acionados?</Txt>

      {/*
        O resumo em chip, com símbolo além da cor. Ele responde de relance à
        pergunta que decide se o botão de concluir vai liberar, e quem lê isto
        está em pé, com o aparelho a meio metro do rosto, sob sol forte.
      */}
      <Chip
        testID="orgaos-resumo"
        texto={
          escolhidos.length === 0
            ? "Nenhum órgão indicado"
            : `${escolhidos.length} ${escolhidos.length === 1 ? "órgão indicado" : "órgãos indicados"}`
        }
        simbolo={escolhidos.length === 0 ? "!" : "✓"}
        tom={escolhidos.length === 0 ? "alerta" : "ok"}
        descricao={
          escolhidos.length === 0
            ? "Nenhum órgão indicado ainda. A vistoria não pode ser concluída assim."
            : `Órgãos indicados: ${escolhidos.map((e) => e.nome).join(", ")}`
        }
      />

      {catalogo.length === 0 && (
        /*
          O aparelho que nunca sincronizou. A frase diz as duas coisas que
          importam: por que a lista está vazia, e que isso NÃO impede concluir.
          Sem a segunda metade, o agente conclui que precisa de sinal e desce o
          morro no meio da vistoria.
        */
        <Aviso tom="info">
          A lista de órgãos do seu município ainda não foi baixada para este
          aparelho. Escreva o nome do órgão abaixo: isso basta para concluir a
          vistoria, e a coordenação recebe o nome do mesmo jeito.
        </Aviso>
      )}

      {catalogo.map((orgao) => {
        const marcado = escolhidos.some((e) => e.orgaoId === orgao.id);
        const rotulo = orgao.sigla ? `${orgao.nome} (${orgao.sigla})` : orgao.nome;
        return (
          <Pressable
            key={orgao.id}
            testID={`orgao-${orgao.id}`}
            onPress={() => alternarDoCatalogo(orgao)}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: marcado }}
            accessibilityLabel={rotulo}
            style={{
              minHeight: toque,
              paddingHorizontal: espaco.e3,
              flexDirection: "row",
              alignItems: "center",
              gap: espaco.e3,
              borderRadius: raio.normal,
              borderWidth: marcado ? 0 : borda.fio,
              borderColor: tema.borda,
              backgroundColor: marcado ? tema.destaque : "transparent",
            }}
          >
            {/*
              O símbolo é o segundo canal, e o quadrado vazio é o primeiro
              estado: sem ele, "não marcado" seria só a ausência de cor, e
              ausência de cor não se lê sob sol nem para quem não separa as duas.
            */}
            <Txt variante="corpo" negrito cor={marcado ? tema.sobreDestaque : tema.texto}>
              {marcado ? "✓" : "▢"}
            </Txt>
            <Txt
              variante="corpo"
              negrito={marcado}
              cor={marcado ? tema.sobreDestaque : tema.texto}
            >
              {rotulo}
            </Txt>
          </Pressable>
        );
      })}

      {/*
        Os digitados aparecem em linha própria, com a saída ao lado.

        Eles não têm como ser "desmarcados" na lista de cima, porque não estão
        lá. Sem esta lista, um nome com erro de digitação ficaria preso no
        rascunho até o laudo, e o agente não teria como tirá-lo.
      */}
      {digitados.map((e) => (
        <View
          key={`${e.nome}-${e.i}`}
          style={{ flexDirection: "row", alignItems: "center", gap: espaco.e2 }}
        >
          <View style={{ flex: 1 }}>
            <Txt variante="corpo">✓ {e.nome}</Txt>
            <Txt variante="legenda" discreto>Escrito por você, fora da lista do município</Txt>
          </View>
          <Pressable
            testID={`orgao-remover-${e.i}`}
            onPress={() => remover(e.i)}
            accessibilityRole="button"
            accessibilityLabel={`Remover ${e.nome} da lista de órgãos a acionar`}
            style={{
              minHeight: toque,
              paddingHorizontal: espaco.e3,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Txt variante="corpoP" negrito cor={tema.perigoTexto}>Remover</Txt>
          </Pressable>
        </View>
      ))}

      <Separador />

      <Txt variante="corpoP" negrito>Outro órgão, fora da lista</Txt>
      <TextInput
        testID="orgao-outro-nome"
        value={digitado}
        onChangeText={setDigitado}
        placeholder="Nome do órgão"
        placeholderTextColor={tema.textoDiscreto}
        accessibilityLabel="Nome de outro órgão, fora da lista do município"
        style={{
          minHeight: toque,
          borderWidth: borda.fio,
          borderColor: tema.borda,
          borderRadius: raio.normal,
          backgroundColor: tema.superficie,
          color: tema.texto,
          paddingHorizontal: espaco.e3,
          paddingVertical: espaco.e2,
          fontSize: fonte.corpo,
        }}
      />
      <Botao
        testID="orgao-outro-adicionar"
        titulo="Adicionar este órgão"
        tipo="secundario"
        desabilitado={digitado.trim().length < MINIMO_DO_NOME}
        onPress={adicionarDigitado}
      />
    </Animated.View>
  );
}
