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
import { espaco } from "../../ui/tokens";
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
 */
export default function Equipe() {
  const tema = useTema();
  const sinal = useSinal();
  const { identidade, obterToken } = useSessao();

  const [dados, setDados] = useState<MeuTrabalho | null>(null);
  const [baixadoEm, setBaixadoEm] = useState<string | null>(null);
  const [atualizando, setAtualizando] = useState(false);
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
    if (atualizando) return <Carregando mensagem="Abrindo a sua equipe" />;
    return (
      <ScrollView contentContainerStyle={{ padding: espaco.e4, gap: espaco.e4 }}>
        <Vazio
          titulo="A sua equipe ainda não foi baixada"
          descricao={
            "Isto precisa de sinal uma vez só. Faça na base, antes de sair, e "
            + "depois a equipe aparece aqui mesmo sem conexão."
          }
        />
        <Botao
          titulo="Baixar minha equipe"
          onPress={() => void buscarNaRede()}
          carregando={atualizando}
          desabilitado={!sinal.temSinal}
        />
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
        <Cartao titulo="Você ainda não está em uma equipe">
          <Txt variante="corpo">
            Sem equipe, a coordenação não tem para onde despachar, e é por isso
            que a sua lista de tarefas está vazia.
          </Txt>
          <Txt variante="corpoP" discreto>
            Peça à coordenação do seu município para incluir você em uma equipe.
            Isso é feito no painel, em Equipes.
          </Txt>
        </Cartao>
      ) : (
        <Cartao titulo={`Equipe ${dados.equipe.nome}`}>
          <View style={{ gap: espaco.e2 }}>
            <View>
              <Txt variante="legenda" discreto>Especialidade</Txt>
              <Txt variante="corpo">{dados.equipe.especialidade ?? "Geral"}</Txt>
            </View>
            <View>
              <Txt variante="legenda" discreto>Situação</Txt>
              <Txt variante="corpo">{dados.equipe.ativa ? "Ativa" : "Inativa"}</Txt>
            </View>
            <View>
              <Txt variante="legenda" discreto>Integrantes ativos</Txt>
              <Txt variante="corpo">{colegasAtivos.length}</Txt>
            </View>
          </View>

          {!dados.equipe.ativa && (
            <Aviso tom="alerta">
              Esta equipe está inativa no cadastro. Você continua conseguindo
              concluir e enviar as vistorias que já baixou, mas a coordenação
              não consegue despachar nada novo para ela. Avise a coordenação.
            </Aviso>
          )}

          <Separador />

          {colegasAtivos.length <= 1 ? (
            <Txt variante="corpoP" discreto>
              Você é o único integrante ativo desta equipe agora.
            </Txt>
          ) : (
            <View style={{ gap: espaco.e2 }}>
              {colegasAtivos.map((c) => (
                <View key={c.id}>
                  <Txt variante="corpo">
                    {c.nome}{c.id === eu ? " (você)" : ""}
                  </Txt>
                  <Txt variante="legenda" discreto>{ROTULO_PAPEL[c.papel]}</Txt>
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
            {dados.concluidas.slice(0, 10).map((v) => {
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
                <View key={v.id}>
                  <Txt variante="corpoP" mono negrito>{v.protocolo}</Txt>
                  <Txt variante="corpo">{ROTULO_TIPO_COBRADE[v.tipo] ?? v.tipo}</Txt>
                  <Txt variante="legenda" discreto>{v.endereco}</Txt>
                  <Txt variante="legenda" discreto>
                    Coletada em {new Date(v.coletada_em).toLocaleString("pt-BR")}
                  </Txt>
                  {semSinal && (
                    <Txt variante="legenda" discreto>
                      Coletada sem sinal e enviada depois
                    </Txt>
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

      <Txt variante="legenda" discreto alinhamento="center">
        Atualizada {idadeEmPalavras(baixadoEm ? new Date(baixadoEm) : null, agora)}
      </Txt>
    </ScrollView>
  );
}
