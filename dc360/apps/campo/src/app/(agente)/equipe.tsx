import { useCallback, useEffect, useState } from "react";
import { RefreshControl, ScrollView, View } from "react-native";
import { router } from "expo-router";
import { ROTULO_PAPEL, ROTULO_TIPO_COBRADE } from "@dc360/shared";
import { SemSinal, type MeuTrabalho } from "../../dados/api";
import { atualizarMeuTrabalho, meuTrabalhoGuardado } from "../../dados/pendencias";
import { useSessao } from "../../dados/sessao";
import { useSinal } from "../../dados/conectividade";
import {
  Aviso, Botao, Cartao, Carregando, Separador, Txt, Vazio, useTema,
} from "../../ui/componentes";
import { Chip } from "../../ui/Chip";
import {
  IconeAlerta, IconeEquipe, IconeSemSinal, IconeSucesso,
} from "../../ui/icones";
import { espaco, icone, peso, raio } from "../../ui/tokens";
import { idadeEmPalavras } from "../../dados/atualizacao";

/**
 * A equipe do agente, e o que ele já entregou.
 *
 * O Rafael pediu esta tela com estas palavras: "senti falta do app mostrar a
 * equipe que eu faço parte". A rota que responde isso existia na API desde que
 * o painel do coordenador ganhou a tela "Meu trabalho", e o aplicativo nunca a
 * chamou.
 *
 * O que ela responde, e por que cada parte importa para quem está na rua:
 *
 * - De que equipe eu faço parte. Sem isso, um agente sem equipe vê uma lista
 *   de tarefas vazia e conclui que o sistema não funciona, quando na verdade a
 *   coordenação não tem para onde despachar.
 * - Quem são os colegas. É a resposta para "quem mais está de plantão hoje".
 * - O que eu já concluí. É o oposto da lista de tarefas, e é o que dá ao
 *   agente a sensação de que o trabalho dele ficou registrado em algum lugar,
 *   que é exatamente o medo que este produto existe para resolver.
 *
 * Abre do DISCO, sempre, pela mesma razão de todas as outras: no alto do morro
 * não existe rede, e uma tela que só existe na base é uma tela inútil.
 *
 * ---
 *
 * **O que a frente F7 arrumou: a tela dizia as coisas certas em cinza.**
 *
 * Ela era, literalmente, texto empilhado. Cinco `Txt` por vistoria concluída,
 * então cinco itens produziam vinte e cinco linhas de pesos quase iguais; dois
 * `Txt` por colega, sem inicial e sem papel destacado; e três blocos
 * rótulo/valor no cartão da equipe em que "Integrantes ativos: 3" tinha
 * exatamente o desenho de "Especialidade: Geral".
 *
 * O pior caso era o que mais importa: **"Coletada sem sinal e enviada depois"**
 * é a prova de que o offline funciona, dita para a pessoa que mais precisa
 * acreditar nele, e ela era a QUINTA linha cinza de um bloco de cinco linhas
 * cinzas. Agora é etiqueta com ícone e cor de sucesso.
 *
 * O que NÃO mudou, porque já estava certo: esta é a única tela do aplicativo
 * que passa `aoDesistir` ao `Carregando`, e por isso a única em que a saída aos
 * seis segundos funciona de fato; e a regra de um indicador por fato, com o
 * botão dizendo só que apertar de novo não adianta.
 */

/*
  A pílula com ícone desta tela era uma CÓPIA do `Chip`, chamada `Etiqueta`, e
  ela saiu daqui.

  Ela nasceu com uma razão real e escrita: o `Chip` só aceitava `simbolo:
  string`, ou seja, caractere tipográfico, e estas três etiquetas precisam de
  DESENHO ("coletada sem sinal" é o momento que a frente de iconografia
  desenhou o `IconeSemSinal` para servir). O comentário dela terminava assim:
  "ensinar o `Chip` a aceitar um nó é o conserto de verdade, e está anotado como
  pendência".

  O `Chip` aprendeu a aceitar um nó no MESMO turno, por outra frente, e ninguém
  voltou aqui. A cópia sobreviveu com o comentário afirmando o contrário do que
  o código já fazia, e com o texto em `peso.forte` enquanto a peça oficial usa
  `peso.negrito`: duas pílulas idênticas em telas vizinhas, com pesos
  diferentes, que é exatamente como uma cópia começa a divergir.

  O que a cópia tinha de melhor foi para o `Chip` e não se perdeu: o símbolo
  pode ser uma FUNÇÃO da cor, então quem passa um ícone não precisa saber com
  que cor pintá-lo.
*/

/**
 * A inicial do colega, para a lista ter ritmo vertical em vez de ser parágrafo.
 *
 * Não é enfeite: com dez nomes empilhados, a inicial é o que permite achar o
 * colega procurado sem ler a lista inteira. Duas letras quando há sobrenome,
 * porque uma equipe com dois "Carlos" viraria dois "C" idênticos.
 */
/* Sem `export`: tudo dentro de `src/app` é rota do Expo, e um arquivo de rota
   exporta a tela, não utilitário. Quem prova a inicial é a tela renderizada. */
function iniciaisDe(nome: string): string {
  const partes = nome.trim().split(/\s+/).filter(Boolean);
  const primeira = partes[0] ?? "";
  /* Nome vazio existe: o cadastro do município é de quem cadastrou, não nosso.
     Um círculo em branco pareceria defeito; a interrogação diz o que houve. */
  if (!primeira) return "?";
  const ultima = partes.length > 1 ? (partes[partes.length - 1] ?? "") : "";
  return ((primeira[0] ?? "") + (ultima[0] ?? "")).toUpperCase();
}

export default function Equipe() {
  const tema = useTema();
  const sinal = useSinal();
  const { identidade, obterToken } = useSessao();

  const [dados, setDados] = useState<MeuTrabalho | null>(null);
  const [baixadoEm, setBaixadoEm] = useState<string | null>(null);
  const [atualizando, setAtualizando] = useState(false);
  /*
    O agente cansou de esperar e pediu para sair da tela de espera.

    Não cancela a busca, de propósito: a resposta pode chegar meio segundo
    depois, e jogar fora uma resposta que já está a caminho gastaria o dado do
    agente duas vezes pelo mesmo dado. O que isto muda é só quem manda na tela,
    que volta a ser ele.
  */
  const [desistiuDeEsperar, setDesistiuDeEsperar] = useState(false);
  const [avisoDeRede, setAvisoDeRede] = useState<string | null>(null);
  const [agora, setAgora] = useState(() => new Date());

  useEffect(() => {
    const t = setInterval(() => setAgora(new Date()), 30_000);
    return () => { clearInterval(t); };
  }, []);

  const lerDoDisco = useCallback(async () => {
    const guardado = await meuTrabalhoGuardado();
    if (guardado) {
      setDados(guardado.dados);
      setBaixadoEm(guardado.baixadoEm);
    }
    return guardado;
  }, []);

  const buscarNaRede = useCallback(async () => {
    setAtualizando(true);
    setDesistiuDeEsperar(false);
    setAvisoDeRede(null);
    try {
      const token = await obterToken();
      if (!token) return;
      setDados(await atualizarMeuTrabalho(token));
      setBaixadoEm(new Date().toISOString());
    } catch (erro: unknown) {
      setAvisoDeRede(
        erro instanceof SemSinal
          ? "Sem sinal para atualizar. Mostrando o que já estava no aparelho."
          : "Não deu para atualizar agora. Mostrando o que já estava no aparelho.",
      );
    } finally {
      setAtualizando(false);
    }
  }, [obterToken]);

  useEffect(() => {
    void (async () => {
      const guardado = await lerDoDisco();
      // Sem cópia local, buscar é a única saída. Com cópia, buscar é conforto,
      // e conforto não justifica gastar o dado do agente sem sinal.
      if (!guardado || sinal.temSinal) await buscarNaRede();
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!dados) {
    if (atualizando && !desistiuDeEsperar) {
      return (
        <Carregando
          mensagem="Abrindo a sua equipe"
          aoDesistir={() => setDesistiuDeEsperar(true)}
        />
      );
    }
    return (
      <ScrollView contentContainerStyle={{ padding: espaco.e4, gap: espaco.e4 }}>
        <Vazio
          icone={<IconeEquipe cor={tema.textoDiscreto} tamanho={icone.vazio} />}
          titulo="A sua equipe ainda não foi baixada"
          descricao={
            "Isto precisa de sinal uma vez só. Faça na base, antes de sair, e "
            + "depois a equipe aparece aqui mesmo sem conexão."
          }
        />
        {/*
          Um indicador por fato, e o fato aqui é um só: existe uma busca em voo.
          Quem conta isso é o texto. O botão não repete a mesma notícia com uma
          roda girando dentro dele: ele só fica desabilitado, que é a outra
          coisa, e a única que o botão tem para dizer.
        */}
        <Botao
          titulo="Baixar minha equipe"
          onPress={() => void buscarNaRede()}
          desabilitado={!sinal.temSinal || atualizando}
        />
        {atualizando && (
          <Txt variante="corpoP" discreto alinhamento="center">
            Buscando a sua equipe. Você pode continuar usando as outras abas.
          </Txt>
        )}
        {!sinal.temSinal && (
          <Aviso tom="alerta">Sem sinal agora. Tente de novo quando a conexão voltar.</Aviso>
        )}
      </ScrollView>
    );
  }

  const eu = identidade?.usuarioId;
  const colegasAtivos = dados.colegas.filter((c) => c.ativo);

  return (
    <ScrollView
      testID="tela-da-equipe"
      contentContainerStyle={{ padding: espaco.e4, gap: espaco.e4 }}
      refreshControl={
        <RefreshControl
          refreshing={atualizando}
          onRefresh={() => void buscarNaRede()}
          tintColor={tema.destaque}
        />
      }
    >
      {avisoDeRede && <Aviso tom="alerta">{avisoDeRede}</Aviso>}

      {dados.equipe === null ? (
        /*
          "Você não está em uma equipe" era um cartão com título e dois
          parágrafos, e NENHUMA ação. O agente lia, concordava, e continuava
          diante de uma tela que não oferece nada para fazer.

          A ação que existe de verdade é esta: quem acabou de ser incluído numa
          equipe pelo painel precisa BAIXAR de novo, porque esta tela abre do
          disco. Sem o botão, o caminho era fechar e reabrir o aplicativo.
        */
        <Vazio
          icone={<IconeEquipe cor={tema.textoDiscreto} tamanho={icone.vazio} />}
          titulo="Você ainda não está em uma equipe"
          descricao={
            "Sem equipe, a coordenação não tem para onde despachar, e é por isso "
            + "que a sua lista de tarefas está vazia. Peça à coordenação do seu "
            + "município para incluir você em uma equipe, no painel, em Equipes."
          }
          acao={{
            titulo: "Procurar a minha equipe de novo",
            descricao: "Buscar no servidor se você já foi incluído em uma equipe",
            testID: "procurar-equipe",
            onPress: () => void buscarNaRede(),
          }}
        />
      ) : (
        // O nome já costuma trazer a palavra "Equipe" (o cadastro do município
        // chama de "Equipe Alfa"), e prefixar produzia "Equipe Equipe Alfa".
        <Cartao titulo={dados.equipe.nome}>
          {/*
            Situação e especialidade viram etiqueta lado a lado. Como par
            rótulo/valor, "Ativa" tinha o mesmo peso de "Geral", e a situação da
            equipe é a única das duas que muda o que o agente pode esperar do
            dia.
          */}
          {/*
            AS DUAS ETIQUETAS DESCEM PARA PESO LEVE, e a razão é a R1 da régua.

            A situação da equipe é uma etiqueta PERMANENTE: ela está na tela em
            todo carregamento, e na esmagadora maioria dos dias ela diz "ativa".
            Enquanto ela foi pílula verde cheia, o cartão abria com um bloco de
            cor aceso dizendo que estava tudo normal, e quando a equipe estava
            inativa a mesma pílula (agora âmbar) competia, no mesmo volume, com
            o aviso logo abaixo, que é quem explica a consequência e diz o que
            fazer. Dois blocos preenchidos para um fato só, e o mais informativo
            dos dois era o segundo.

            Em peso leve as duas continuam com ícone e palavra, que é o segundo
            canal inteiro, e o único fundo cheio do cartão fica com quem merece:
            o aviso da equipe inativa, quando ele existe.
          */}
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: espaco.e4 }}>
            <Chip
              peso="leve"
              tom={dados.equipe.ativa ? "ok" : "alerta"}
              texto={dados.equipe.ativa ? "Equipe ativa" : "Equipe inativa"}
              simbolo={(cor) => (dados.equipe?.ativa
                ? <IconeSucesso cor={cor} tamanho={icone.inline} />
                : <IconeAlerta cor={cor} tamanho={icone.inline} />)}
            />
            <Chip
              peso="leve"
              tom="neutro"
              texto={dados.equipe.especialidade ?? "Geral"}
              simbolo={(cor) => <IconeEquipe cor={cor} tamanho={icone.inline} />}
            />
          </View>

          {!dados.equipe.ativa && (
            <Aviso tom="alerta" titulo="Esta equipe está inativa no cadastro">
              Você continua conseguindo concluir e enviar as vistorias que já
              baixou, mas a coordenação não consegue despachar nada novo para
              ela. Avise a coordenação.
            </Aviso>
          )}

          <Separador />

          {/*
            A contagem virou o TÍTULO da lista que ela conta, em vez de um par
            rótulo/valor solto acima dela. Um número e a lista dele separados
            por um traço horizontal eram duas informações contando a mesma coisa
            em dois lugares.
          */}
          <Txt variante="corpoP" peso={peso.forte}>
            Integrantes ativos ({colegasAtivos.length})
          </Txt>

          {colegasAtivos.length <= 1 ? (
            <Txt variante="corpoP" discreto>
              Você é o único integrante ativo desta equipe agora.
            </Txt>
          ) : (
            <View style={{ gap: espaco.e3 }}>
              {colegasAtivos.map((c) => (
                <View
                  key={c.id}
                  style={{ flexDirection: "row", alignItems: "center", gap: espaco.e3 }}
                >
                  {/* A inicial dá ritmo vertical à lista: com dez nomes, é o
                      que deixa achar o colega sem ler tudo. */}
                  <View
                    accessibilityElementsHidden
                    importantForAccessibility="no-hide-descendants"
                    style={{
                      width: espaco.e6,
                      height: espaco.e6,
                      borderRadius: raio.pilula,
                      backgroundColor: tema.superficie2,
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <Txt variante="corpoP" peso={peso.negrito}>{iniciaisDe(c.nome)}</Txt>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Txt variante="corpo" peso={c.id === eu ? peso.negrito : peso.normal}>
                      {c.nome}{c.id === eu ? " (você)" : ""}
                    </Txt>
                  </View>
                  {/*
                    O papel do colega é RÓTULO, e rótulo repetido em toda linha
                    de uma lista deixa de ser informação e vira textura: com dez
                    integrantes eram dez pílulas iguais numa coluna, cada uma
                    com fundo próprio, competindo com o nome que está ao lado e
                    que é o que alguém veio ler aqui. Em peso leve o papel
                    continua inteiro, com ícone e palavra, e a lista volta a ter
                    uma coisa só por linha.
                  */}
                  <Chip
                    peso="leve"
                    tom="neutro"
                    texto={ROTULO_PAPEL[c.papel]}
                    simbolo={(cor) => <IconeEquipe cor={cor} tamanho={icone.inline} />}
                  />
                </View>
              ))}
            </View>
          )}
        </Cartao>
      )}

      <Cartao titulo={`Vistorias que eu concluí (${dados.concluidas.length})`}>
        {dados.concluidas.length === 0 ? (
          <Txt variante="corpoP" discreto>
            Você ainda não concluiu nenhuma vistoria. Assim que a primeira for
            enviada e a coordenação receber, ela aparece aqui com a data.
          </Txt>
        ) : (
          <View style={{ gap: espaco.e3 }}>
            {dados.concluidas.slice(0, 10).map((v, posicao) => {
              /*
                Coletada e sincronizada em momentos diferentes significa que a
                vistoria foi feita sem sinal. Dizer isso na tela é o que
                transforma o offline de promessa em prova, para a pessoa que
                mais precisa acreditar nele.
              */
              const semSinal =
                new Date(v.sincronizada_em).getTime()
                - new Date(v.coletada_em).getTime() > 60_000;
              return (
                <View key={v.id} style={{ gap: espaco.e2 }}>
                  {/* O fio entre itens existe porque cinco blocos colados de
                      três linhas cada viram um parágrafo só de longe. */}
                  {posicao > 0 && <Separador />}
                  <View style={{ flexDirection: "row", alignItems: "baseline", gap: espaco.e2 }}>
                    <View style={{ flex: 1 }}>
                      <Txt variante="corpoP" mono peso={peso.negrito}>{v.protocolo}</Txt>
                    </View>
                    <Txt variante="legenda" discreto numeroDeLinhas={1}>
                      {new Date(v.coletada_em).toLocaleString("pt-BR")}
                    </Txt>
                  </View>
                  <Txt variante="corpo">{ROTULO_TIPO_COBRADE[v.tipo] ?? v.tipo}</Txt>
                  <Txt variante="legenda" discreto>{v.endereco}</Txt>
                  {/*
                    Esta era a pílula mais repetida do aplicativo: até dez
                    delas, verdes e cheias, uma por vistoria concluída, numa
                    lista em que o fato NORMAL é justamente ter sido coletada
                    sem sinal. A R3 da régua tira o fundo de todo tom `ok`
                    dentro do próprio componente, então esta linha não precisa
                    pedir nada: a marca continua com ícone e palavra, e a lista
                    deixa de acender inteira para contar uma coisa que é boa.
                  */}
                  {semSinal && (
                    <Chip
                      tom="ok"
                      texto="Coletada sem sinal, enviada depois"
                      simbolo={(cor) => <IconeSemSinal cor={cor} tamanho={icone.inline} />}
                    />
                  )}
                </View>
              );
            })}
            {dados.concluidas.length > 10 && (
              <Txt variante="legenda" discreto>Mostrando as 10 mais recentes.</Txt>
            )}
          </View>
        )}
      </Cartao>

      {/*
        A conta saiu da barra inferior: três abas, e nenhuma delas é "eu". Ela
        continua a um toque de distância, aqui, que é onde alguém procura por
        ela depois de olhar quem está na equipe.
      */}
      <Botao
        titulo="Minha conta e sair"
        tipo="secundario"
        onPress={() => router.push("/conta")}
      />

      {/*
        A busca em voo aparece aqui, em palavras, e no RefreshControl lá em
        cima. O RefreshControl sozinho não bastaria: ele só desenha enquanto o
        dedo segura a tela, e a atualização que acontece sozinha na abertura
        não teria indicador nenhum.
      */}
      <Txt variante="legenda" discreto alinhamento="center">
        Atualizada {idadeEmPalavras(baixadoEm ? new Date(baixadoEm) : null, agora)}
        {atualizando ? " (buscando)" : ""}
      </Txt>
    </ScrollView>
  );
}
