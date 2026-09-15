import { useCallback, useEffect, useState, type ReactNode } from "react";
import { RefreshControl, ScrollView, View } from "react-native";
import { router } from "expo-router";
import { ROTULO_SEVERIDADE, type Severidade } from "@dc360/shared";
import type { AvisoDoCampo } from "../../dados/api";
import {
  avisosGuardados, complementoDoAviso, fraseDoAviso,
  marcarAvisosComoLidosNoAparelho, sincronizarAvisos, textoDoCracha, contagemDe,
  type AvisosGuardados,
} from "../../dados/avisos";
import { idadeEmPalavras } from "../../dados/atualizacao";
import { pendenciasGuardadas } from "../../dados/pendencias";
import { useSinal } from "../../dados/conectividade";
import { useSessao } from "../../dados/sessao";
import {
  Botao, Cartao, Carregando, Dado, Tocavel, Txt, Vazio, useTema,
} from "../../ui/componentes";
import { ItemDeLista } from "../../ui/ItemDeLista";
import { useComecarDoTopo } from "../../ui/CenaDaAba";
import { atrasoEmCascata } from "../../ui/hierarquia";
import {
  IconeAlerta, IconeAssinatura, IconeInformacao, IconeOrgao, IconePrazoVencido, IconeSino,
} from "../../ui/icones";
import { elevacao, espaco, icone, peso, raio, toque } from "../../ui/tokens";

/**
 * AVISOS: o que aconteceu no município, numa tela própria.
 *
 * A lista morava dentro do Perfil, e o cabeçalho de lá defendia isso com
 * quatro razões. O dono desfez a conclusão ("o sino no topo de toda tela, à
 * direita, com crachá; tocar abre a lista de avisos") e esta tela é a lista,
 * movida para cá com o MESMO comportamento que tinha lá:
 *
 * - **abre do disco, e sincroniza na abertura**, como toda tela deste
 *   aplicativo. Sem sinal mostra o que já estava guardado, e o rodapé diz de
 *   quando é;
 * - **marcar como lido acontece no aparelho primeiro**, e o envio é
 *   consequência. Ver `lidosPendentes` em `dados/avisos.ts`;
 * - **marcar alcança só o que a tela desenhou**. O aparelho guarda até trinta,
 *   a tela desenha oito, e o botão de "ver os outros" é o que torna o corte
 *   honesto: o `POST /avisos/lidos` é por identificador e a leitura não se
 *   desfaz, então nada pode ser marcado sem ter passado pelos olhos.
 *
 * ## O que mudou de lá para cá, e por quê
 *
 * **O aviso passou a levar à vistoria, QUANDO há para onde ir.** No Perfil a
 * linha não era tocável, com esta razão escrita: o sino fala do município
 * inteiro e a lista de tarefas é da EQUIPE do agente e vem do disco, então um
 * toque abriria, na maioria das vezes, uma ocorrência que o aparelho nunca
 * baixou. A razão continua valendo, e ela é exatamente a regra: a linha só
 * vira botão quando a ocorrência do aviso está na lista de tarefas guardada
 * neste aparelho. Aí o toque abre a vistoria sem sinal, que é o único toque
 * que vale a pena existir aqui. E abrir é ler: o aviso é marcado como lido no
 * ato, senão o agente voltaria da vistoria com o sino ainda contando o que
 * ele acabou de ver.
 *
 * **Cada aviso é um cartão, e a lista entra em cascata.** Na versão do Perfil
 * os avisos eram linhas separadas por fio dentro de um cartão só, porque lá
 * eles disputavam a tela com outros sete cartões. Aqui a tela é deles, e cada
 * um vira objeto (H4: superfície inteira de `elevacao`), com o ícone do tipo
 * do fato num círculo, o protocolo em mono, e o "quando" à direita. A entrada
 * segue `atrasoEmCascata`, que é o ritmo das outras listas do produto.
 *
 * **O número grande é o de por ler.** É a única pergunta que quem abre esta
 * tela faz antes de rolar, e ela vira o protagonista do cartão de cima (H1),
 * com o botão de marcar logo abaixo.
 *
 * O sino do cabeçalho (`ui/Sino.tsx`) NÃO lê nada daqui: ele ouve o disco, e
 * esta tela grava no disco. É assim que marcar como lido aqui zera o crachá
 * de todas as telas sem que nenhuma releia nada.
 */

/** O ícone de cada tipo de aviso, pelo que o fato é. */
function DesenhoDoAviso({ tipo, cor }: { tipo: string; cor: string }) {
  const tamanho = icone.rotulo;
  if (tipo === "prazo_vencido") return <IconePrazoVencido cor={cor} tamanho={tamanho} />;
  if (tipo === "vistoria_recebida") return <IconeAssinatura cor={cor} tamanho={tamanho} />;
  if (tipo === "providencia_respondida") return <IconeOrgao cor={cor} tamanho={tamanho} />;
  if (tipo === "retorno_nao_confirmado") return <IconeAlerta cor={cor} tamanho={tamanho} />;
  /* Tipo que este aplicativo ainda não aprendeu continua com desenho, e não com
     um buraco: ver `fraseDoAviso`. Impreciso ainda é legível. */
  return <IconeInformacao cor={cor} tamanho={tamanho} />;
}

/**
 * Quantos avisos a tela lista de uma vez. O resto continua guardado, e alcançável.
 *
 * O corte é de ROLAGEM, e nunca de existência: enquanto ele foi só um corte, o
 * aparelho guardava trinta avisos, a tela desenhava oito, e "Marcar como lidos"
 * marcava os TRINTA. Os vinte e dois que ninguém viu sumiam do sino, aqui e no
 * servidor, e não voltam em pergunta nenhuma. O botão abaixo da lista é o que
 * devolve os cortados ao alcance do dedo, e é ele que torna o corte honesto.
 */
const AVISOS_NA_TELA = 8;

/**
 * As palavras de um aviso, resolvidas uma vez para o desenho e para a fala.
 *
 * A severidade crua do banco vira rótulo aqui, e só aqui: `ROTULO_SEVERIDADE`
 * é do pacote compartilhado, e `dados/avisos.ts` devolve o detalhe como veio.
 */
function palavrasDoAviso(a: AvisoDoCampo): { frase: string; detalhe: string | null } {
  const complemento = complementoDoAviso(a);
  const severidade = a.tipo === "prazo_vencido" && complemento
    ? ROTULO_SEVERIDADE[complemento as Severidade]
    : null;
  return {
    frase: fraseDoAviso(a.tipo),
    detalhe: severidade ? `Severidade ${severidade.toLowerCase()}` : complemento,
  };
}

/**
 * Um aviso desenhado: o ícone do fato, a frase, o protocolo e o quando.
 *
 * Separado da decisão de ser tocável ou não, que fica em quem chama: o desenho
 * é o mesmo nos dois casos, e a diferença entre eles é só a moldura (botão ou
 * texto) e a última linha, que só existe quando há para onde ir.
 */
function CorpoDoAviso({ aviso, quando, abre }: {
  aviso: AvisoDoCampo;
  quando: string;
  /** Há vistoria para abrir neste aparelho. */
  abre: boolean;
}) {
  const tema = useTema();
  const { frase, detalhe } = palavrasDoAviso(aviso);
  return (
    <View style={{ flexDirection: "row", gap: espaco.e3 }}>
      <View
        /* O ícone é decoração de uma linha que já diz o fato em palavras: para
           quem ouve a tela, o rótulo do invólucro carrega tudo. */
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        style={{
          width: icone.rotulo + espaco.e4,
          height: icone.rotulo + espaco.e4,
          borderRadius: raio.pilula,
          backgroundColor: tema.superficie2,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <DesenhoDoAviso tipo={aviso.tipo} cor={aviso.lido ? tema.textoDiscreto : tema.destaque} />
      </View>
      <View style={{ flex: 1, gap: espaco.e1 }}>
        <View style={{ flexDirection: "row", alignItems: "flex-start", gap: espaco.e2 }}>
          {/*
            O PESO é quem diz "por ler", e não a cor: a régua da casa proíbe
            comunicar estado só por cor, e um selo por linha em oito linhas
            seria textura. Para quem ouve a tela, o rótulo do invólucro diz a
            palavra.
          */}
          <View style={{ flex: 1 }}>
            <Txt
              variante="corpoP"
              peso={aviso.lido ? peso.normal : peso.negrito}
              discreto={aviso.lido}
            >
              {frase}
            </Txt>
          </View>
          <Txt variante="legenda" discreto numeroDeLinhas={1}>{quando}</Txt>
        </View>
        <View style={{ flexDirection: "row", alignItems: "baseline", gap: espaco.e2 }}>
          <Txt variante="legenda" discreto mono>{aviso.protocolo}</Txt>
          {detalhe !== null && <Txt variante="legenda" discreto>{detalhe}</Txt>}
        </View>
        {abre && (
          /* A palavra, e não uma seta: quem abre este aplicativo duas vezes por
             semana não decora pictograma, e a cor de destaque sozinha não diz
             "isto se toca". */
          <Txt nivel="interacao" cor={tema.destaque}>Abrir a vistoria</Txt>
        )}
      </View>
    </View>
  );
}

/** A moldura do aviso: o cartão como objeto, pela H4. */
function CartaoDoAviso({ children, testID }: { children: ReactNode; testID: string }) {
  const tema = useTema();
  return (
    <View
      testID={testID}
      style={{
        ...elevacao(tema).cartao,
        borderRadius: raio.cartao,
        padding: espaco.e4,
      }}
    >
      {children}
    </View>
  );
}

export default function Avisos() {
  const tema = useTema();
  const sinal = useSinal();
  const { obterToken } = useSessao();
  // Toda tela começa do topo a cada foco (ver `ui/CenaDaAba.tsx`).
  const rolagem = useComecarDoTopo<ScrollView>();

  /** Nulo até o disco responder: é o que separa "vazio" de "ainda não olhei". */
  const [avisos, setAvisos] = useState<AvisosGuardados | null>(null);
  /** As ocorrências que a lista de tarefas deste aparelho tem no disco. */
  const [tarefasNoAparelho, setTarefasNoAparelho] = useState<Set<string>>(() => new Set());
  const [atualizando, setAtualizando] = useState(false);
  const [desistiu, setDesistiu] = useState(false);
  const [agora, setAgora] = useState(() => new Date());
  /*
    A lista abriu inteira.

    Sem isto os avisos além do oitavo eram inalcançáveis: a lista sempre mostra
    os mais NOVOS, então um aviso que caiu abaixo do corte nunca mais subiria
    sozinho. Um aviso por ler que não tem como ser lido é o mesmo item preso
    para sempre que a fila de envio existe para não ter.
  */
  const [verTodos, setVerTodos] = useState(false);

  useEffect(() => {
    const t = setInterval(() => setAgora(new Date()), 30_000);
    return () => { clearInterval(t); };
  }, []);

  const sincronizar = useCallback(async () => {
    setAtualizando(true);
    try {
      const token = await obterToken();
      if (!token) return;
      setAvisos(await sincronizarAvisos(token));
    } catch {
      /* O que já estava guardado continua na tela, com a data da última vez.
         O rodapé é quem diz quando foi. O sino é o recurso menos crítico do
         produto, e uma falha nele não pode virar tela de erro. */
    } finally {
      setAtualizando(false);
    }
  }, [obterToken]);

  useEffect(() => {
    let vivo = true;
    void (async () => {
      /* O disco primeiro, SEMPRE: é o que faz esta tela abrir no alto do morro
         em vez de existir só na base. */
      const [guardado, tarefas] = await Promise.all([
        avisosGuardados(),
        /*
          A lista de tarefas é CONVENIÊNCIA aqui (decide quais avisos viram
          botão), e não condição: um disco que recusa a leitura dela não pode
          deixar a tela de avisos presa na espera. Sem a lista, nenhum aviso
          leva a lugar nenhum, que é o comportamento que a tela já tinha.
        */
        pendenciasGuardadas().catch(() => []),
      ]);
      if (!vivo) return;
      setAvisos(guardado);
      setTarefasNoAparelho(new Set(tarefas.map((t) => t.id)));
      /*
        Sem cópia local, buscar é a única saída. Com cópia, buscar é conforto,
        e conforto não justifica gastar o dado do agente sem sinal. É a mesma
        regra do Perfil, de onde esta lista veio.
      */
      if (guardado.baixadoEm === null || sinal.temSinal) await sincronizar();
    })();
    return () => { vivo = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /*
    A espera, com saída. A leitura do disco dura dezenas de milissegundos num
    aparelho saudável; quando demora, é porque quebrou, e aí o que resolve é a
    porta, não o desenho. A saída é a mesma da vistoria: voltar por onde veio.
  */
  if (avisos === null) {
    if (desistiu) return null;
    return (
      <Carregando
        mensagem="Abrindo os avisos"
        rotuloDaSaida="Voltar"
        aoDesistir={() => {
          setDesistiu(true);
          if (router.canGoBack()) router.back();
          else router.replace("/(agente)");
        }}
      />
    );
  }

  const naTela = verTodos ? avisos.itens : avisos.itens.slice(0, AVISOS_NA_TELA);
  /*
    O QUE O BOTÃO MARCA É O QUE ESTÁ DESENHADO, e nunca o que está guardado.
    Ver `AVISOS_NA_TELA`: leitura não se desfaz, e o que ninguém viu não pode
    sumir do sino.
  */
  const porLer = naTela.filter((a) => !a.lido).map((a) => a.id);
  const cortados = avisos.itens.length - naTela.length;
  const contagem = contagemDe(avisos);
  const rodape = avisos.baixadoEm === null
    ? "Nunca atualizado neste aparelho."
    : `Atualizado ${idadeEmPalavras(new Date(avisos.baixadoEm), agora)}.`;

  return (
    <ScrollView
      ref={rolagem}
      contentContainerStyle={{ padding: espaco.e4, gap: espaco.e4 }}
      refreshControl={
        <RefreshControl
          refreshing={atualizando}
          onRefresh={() => void sincronizar()}
          tintColor={tema.destaque}
        />
      }
    >
      {/*
        O NÚMERO GRANDE é o de por ler: a única pergunta que quem abre esta tela
        faz antes de rolar. Um protagonista por peça (H1), e o botão que zera o
        número fica ao lado dele, porque é a ação que responde à pergunta.
      */}
      <Cartao>
        <Dado
          testID="avisos-por-ler"
          valor={textoDoCracha(contagem) ?? "0"}
          rotulo="por ler"
        />
        {porLer.length > 0 && (
          <Botao
            titulo="Marcar como lidos"
            tipo="secundario"
            testID="marcar-avisos-lidos"
            descricao={porLer.length === 1
              ? "Marcar como lido o aviso que está nesta tela"
              : `Marcar como lidos os ${porLer.length} avisos que estão nesta tela`}
            onPress={() => void (async () => {
              /*
                Marca no APARELHO primeiro, e o envio é consequência. Sem isso,
                quem lê os avisos no morro e sai da tela encontra tudo por ler
                de novo na descida. Ver `lidosPendentes` em `dados/avisos.ts`.
              */
              setAvisos(await marcarAvisosComoLidosNoAparelho(porLer));
            })()}
          />
        )}
        <Txt variante="legenda" discreto>
          {rodape}{atualizando ? " Buscando novidades." : ""}
          {" "}O sino precisa de sinal: sem conexão ele mostra o que já estava
          guardado aqui.
        </Txt>
      </Cartao>

      {avisos.itens.length === 0 ? (
        <Vazio
          icone={<IconeSino cor={tema.destaque} tamanho={icone.vazio} />}
          titulo={avisos.baixadoEm === null
            ? "Ainda sem avisos neste aparelho"
            : "Nenhum aviso no seu município"}
          descricao={avisos.baixadoEm === null
            ? "Os avisos do seu município aparecem aqui depois da primeira "
              + "atualização com sinal. Eles são o caminho que funciona quando "
              + "a notificação não chega."
              + (sinal.temSinal ? "" : " Agora não há sinal.")
            : "Nada novo desde a última atualização."}
          acao={sinal.temSinal
            ? {
              titulo: "Atualizar agora",
              descricao: "Perguntar ao servidor se há avisos novos",
              testID: "atualizar-avisos",
              onPress: () => void sincronizar(),
            }
            : undefined}
        />
      ) : (
        <View style={{ gap: espaco.e3 }}>
          {naTela.map((a, posicao) => {
            const { frase, detalhe } = palavrasDoAviso(a);
            const quando = idadeEmPalavras(new Date(a.criadoEm), agora);
            const estado = a.lido ? "lido" : "por ler";
            const abre = tarefasNoAparelho.has(a.ocorrenciaId);
            return (
              <ItemDeLista key={a.id} entrando atraso={atrasoEmCascata(posicao)}>
                <CartaoDoAviso testID={`aviso-${a.id}`}>
                  {abre ? (
                    <Tocavel
                      accessibilityRole="button"
                      /* O botão diz o que faz, e depois o fato: quem ouve a
                         tela decide pelo destino, e o destino vem primeiro. */
                      accessibilityLabel={
                        `Abrir a vistoria do protocolo ${a.protocolo}. ${frase}`
                        + (detalhe ? `, ${detalhe.toLowerCase()}` : "")
                        + `, ${estado}`
                      }
                      onPress={() => void (async () => {
                        /* Abrir é ler. Grava antes de navegar: se o sistema
                           matar o aplicativo na troca de tela, a leitura fica. */
                        setAvisos(await marcarAvisosComoLidosNoAparelho([a.id]));
                        router.push({ pathname: "/(agente)/vistoria/[id]", params: { id: a.ocorrenciaId } });
                      })()}
                      estilo={{ minHeight: toque }}
                    >
                      <CorpoDoAviso aviso={a} quando={quando} abre />
                    </Tocavel>
                  ) : (
                    /*
                      NÃO é tocável, e a ausência é decisão: a ocorrência deste
                      aviso não está na lista de tarefas do aparelho, e um toque
                      que abre o nada, sem sinal, é pior que um toque que não
                      existe. Ver o cabeçalho.
                    */
                    <View
                      accessible
                      accessibilityLabel={
                        `${frase}, protocolo ${a.protocolo}`
                        + (detalhe ? `, ${detalhe.toLowerCase()}` : "")
                        + `, ${estado}`
                      }
                    >
                      <CorpoDoAviso aviso={a} quando={quando} abre={false} />
                    </View>
                  )}
                </CartaoDoAviso>
              </ItemDeLista>
            );
          })}

          {cortados > 0 && (
            <>
              <Txt variante="legenda" discreto alinhamento="center">
                Mostrando os {naTela.length} mais recentes de{" "}
                {avisos.itens.length} guardados neste aparelho.
              </Txt>
              <Botao
                titulo={cortados === 1
                  ? "Ver o outro aviso guardado"
                  : `Ver os outros ${cortados} avisos guardados`}
                tipo="secundario"
                testID="ver-todos-os-avisos"
                descricao={cortados === 1
                  ? "Mostrar o aviso que ficou fora da lista"
                  : `Mostrar os ${cortados} avisos que ficaram fora da lista`}
                onPress={() => { setVerTodos(true); }}
              />
            </>
          )}
        </View>
      )}
    </ScrollView>
  );
}
