import { useEffect, useState } from "react";
import { ScrollView, View } from "react-native";
import { router } from "expo-router";
import Constants from "expo-constants";
import { ROTULO_PAPEL } from "@dc360/shared";
import { enderecoDaApi } from "../../dados/api";
import { obterFila } from "../../dados/fila";
import { useSessao } from "../../dados/sessao";
import { useSinal } from "../../dados/conectividade";
import { Aviso, Botao, Cartao, Separador, Txt } from "../../ui/componentes";
import { Dialogo } from "../../ui/Dialogo";
import { espaco } from "../../ui/tokens";

/**
 * A conta do agente, e a saída.
 *
 * A parte que importa desta tela é a recusa em sair com coleta pendente. Sair
 * apaga a sessão, e sem sessão a fila não consegue enviar: uma vistoria feita
 * no morro ficaria presa no aparelho até alguém entrar de novo, sem ninguém
 * saber que ela existe. A tela conta quantas estão esperando e pede
 * confirmação explícita.
 */
export default function Conta() {
  const { identidade, sair, obterToken } = useSessao();
  const sinal = useSinal();
  const [pendentes, setPendentes] = useState<number | null>(null);
  /*
    A pergunta é estado desta tela, e não um efeito colateral disparado no
    toque. Enquanto ela vale `true` nada aconteceu ainda: a sessão continua de
    pé e a fila continua com dono. Sair só acontece no toque do botão que
    repete o verbo, e é isso que o teste desta tela cobra.
  */
  const [perguntandoSaida, setPerguntandoSaida] = useState(false);

  useEffect(() => {
    let vivo = true;
    void (async () => {
      const fila = await obterFila(enderecoDaApi(), obterToken);
      const resumo = await fila.resumo();
      if (vivo) {
        setPendentes(resumo.pendentes + resumo.enviando + resumo.bloqueados);
      }
    })();
    return () => { vivo = false; };
  }, [obterToken]);

  const avisoDaSaida = pendentes && pendentes > 0
    ? `Você tem ${pendentes} ${pendentes === 1 ? "coleta" : "coletas"} ainda não enviadas. ` +
      "Ao sair, elas continuam guardadas no aparelho, mas só voltam a ser " +
      "enviadas quando você entrar de novo, e isso exige sinal."
    : "Você vai precisar de sinal e da sua senha para entrar de novo.";

  if (!identidade) return null;

  const versao = Constants.expoConfig?.version ?? "desconhecida";

  return (
    <ScrollView contentContainerStyle={{ padding: espaco.e4, gap: espaco.e4 }}>
      <Cartao titulo="Quem está usando este aparelho">
        <View style={{ gap: espaco.e2 }}>
          <View>
            <Txt variante="legenda" discreto>Nome</Txt>
            <Txt variante="corpo">{identidade.nome}</Txt>
          </View>
          <View>
            <Txt variante="legenda" discreto>Perfil</Txt>
            <Txt variante="corpo">{ROTULO_PAPEL[identidade.papel]}</Txt>
          </View>
          <View>
            <Txt variante="legenda" discreto>Órgão</Txt>
            <Txt variante="corpo">{identidade.organizacaoNome}</Txt>
          </View>
          <View>
            <Txt variante="legenda" discreto>Município</Txt>
            <Txt variante="corpo">{identidade.municipio}, {identidade.uf}</Txt>
          </View>
        </View>
      </Cartao>

      <Cartao titulo="Este aparelho">
        <View>
          <Txt variante="legenda" discreto>Conexão agora</Txt>
          <Txt variante="corpo">
            {sinal.temSinal
              ? `Com sinal${sinal.tipo ? `, por ${sinal.tipo}` : ""}`
              : "Sem sinal"}
          </Txt>
        </View>
        <View>
          <Txt variante="legenda" discreto>Coletas esperando envio</Txt>
          <Txt variante="corpo">
            {pendentes === null ? "conferindo" : pendentes === 0 ? "nenhuma" : String(pendentes)}
          </Txt>
        </View>
        <Separador />
        <View>
          <Txt variante="legenda" discreto>Versão do aplicativo</Txt>
          <Txt variante="corpoP" mono>{versao}</Txt>
        </View>
        <View>
          {/* Qual servidor este binário conversa. Sem isto, descobrir que o
              aparelho ficou em homologação exige abrir o código. */}
          <Txt variante="legenda" discreto>Servidor</Txt>
          <Txt variante="corpoP" mono>{enderecoDaApi()}</Txt>
        </View>
      </Cartao>

      <Cartao titulo="Trocar a senha">
        <Aviso tom="info">
          A troca de senha é feita no painel da coordenação, pelo navegador, em
          "Minha conta". Aqui no aparelho ela não é oferecida de propósito:
          trocar a senha encerra as outras sessões, e fazer isso no meio de uma
          vistoria deixaria a fila sem conseguir enviar.
        </Aviso>
      </Cartao>

      {pendentes !== null && pendentes > 0 && (
        <Aviso tom="alerta">
          Antes de sair, procure sinal e espere a fila esvaziar. Enquanto você
          estiver fora da conta, nada é enviado.
        </Aviso>
      )}

      <Botao
        titulo="Sair da conta"
        tipo="perigo"
        onPress={() => { setPerguntandoSaida(true); }}
      />

      <Dialogo
        aberto={perguntandoSaida}
        titulo="Sair da conta?"
        texto={avisoDaSaida}
        /*
          O rótulo repete o verbo. "OK" aqui responderia à pergunta do título
          sem dizer o que acontece com as coletas que estão no aparelho, e é
          exatamente essa a dúvida de quem está lendo isto no fim do plantão.
        */
        acao={{
          rotulo: "Sair da conta",
          destrutiva: true,
          aoTocar: () => void (async () => {
            await sair();
            router.replace("/entrar");
          })(),
        }}
        recusa={{ rotulo: "Continuar conectado" }}
        aoFechar={() => { setPerguntandoSaida(false); }}
      />
    </ScrollView>
  );
}
