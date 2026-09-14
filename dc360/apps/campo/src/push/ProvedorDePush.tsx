import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { AppState } from "react-native";
import { router } from "expo-router";

import { registrarAparelho } from "../dados/api";
import { useSessao } from "../dados/sessao";
import { Dialogo } from "../ui/Dialogo";
import { decidirAviso, type Aviso } from "./aviso";
import { CANAIS, deveTocarSom } from "./canais";
import { ContextoDePush, type EstadoDoPush } from "./contexto";
import { jaConvidou as leuConvite, marcarConvidado } from "./convite";
import { guardarFicha } from "./ficha-do-aparelho";
import { proximoPasso, type EstadoDaPermissao } from "./permissao";
import { portaExpo } from "./PortaExpo";
import type { AvisoBruto, PortaDePush } from "./porta";
import { registrarEsteAparelho, type DesfechoDoRegistro } from "./registro";

/**
 * A ligação entre o sistema operacional, a sessão e a tela.
 *
 * Tudo o que decide alguma coisa mora fora daqui, com teste próprio: a
 * comparação de município em `aviso.ts`, a escolha de canal em `canais.ts`, o
 * momento do pedido de permissão em `permissao.ts`, a classificação da falha de
 * registro em `registro.ts`. Este arquivo é a ordem em que essas decisões
 * acontecem, e a ordem também é decisão, então ela tem teste.
 *
 * A sequência, e o porquê de cada passo estar onde está:
 *
 * 1. **Canais e apresentação, na montagem.** Os canais precisam existir antes
 *    do primeiro aviso chegar, porque o Android congela as características de
 *    um canal na criação.
 * 2. **Permissão, depois do primeiro login.** Nunca antes. Ver `permissao.ts`.
 * 3. **Ficha, depois da permissão.** Antes dela o sistema não entrega ficha
 *    nenhuma, e pedir só gastaria uma ida à rede da loja.
 * 4. **Varredura da bandeja, a cada mudança de sessão.** É o que fecha a janela
 *    do aviso que o sistema desenhou sozinho enquanto o aplicativo estava
 *    fechado.
 * 5. **Releitura da permissão na volta do segundo plano.** É o passo que
 *    faltava, e a ausência dele tinha texto próprio na tela de conta ("feche e
 *    abra este aplicativo de novo para ele perceber"). Ver o bloco 6.
 */

export function ProvedorDePush({
  porta = portaExpo,
  children,
}: {
  /** Injetável para o teste. Em produção é sempre a porta do `expo-notifications`. */
  porta?: PortaDePush;
  children: ReactNode;
}) {
  const { identidade, carregando, obterToken } = useSessao();
  const organizacao = identidade?.organizacaoId ?? null;

  const [permissao, setPermissao] = useState<EstadoDaPermissao>("nao_perguntada");
  const [registro, setRegistro] = useState<DesfechoDoRegistro | null>(null);
  const [convite, setConvite] = useState(false);

  /*
    O município da sessão numa `ref`, e essa escolha não é estilo.

    `definirApresentacao` instala UM manipulador global no módulo nativo, que
    sobrevive a renderização e continua sendo o mesmo objeto pelo resto da vida
    do processo. Se ele fechasse sobre o valor de `organizacao`, ficaria preso
    no município da PRIMEIRA renderização: no aparelho de plantão em que o
    agente da manhã sai e o da tarde entra, o manipulador continuaria comparando
    com o município de quem já foi embora. Num aparelho que serve duas
    prefeituras, isso seria a terceira barreira comparando com o município
    errado, que é o mesmo que não ter barreira.
  */
  const organizacaoRef = useRef<string | null>(organizacao);
  organizacaoRef.current = organizacao;

  /*
    Os toques já tratados. `avisoQueAbriuOAplicativo` devolve a ÚLTIMA resposta
    de sempre, e não a que ainda não foi vista: sem esta memória, cada volta do
    aplicativo à tela de tarefas reabriria a mesma vistoria, e o agente que
    estivesse no meio de outra coleta seria arrancado dela.
  */
  const tratados = useRef(new Set<string>());

  /* ------------------------------------------------------------------
     1. Canais e apresentação
     ------------------------------------------------------------------ */
  useEffect(() => {
    void porta.prepararCanais(CANAIS);

    porta.definirApresentacao((bruto) => {
      const veredito = decidirAviso(bruto, organizacaoRef.current);
      /*
        Descarte silencioso: nada aparece, nada toca, nada soma no contador do
        ícone. Ver `aviso.ts` para por que anunciar o descarte seria pior do que
        descartar.
      */
      if (!veredito.entregar) return { mostrar: false, som: false };
      return { mostrar: true, som: deveTocarSom(veredito.aviso.severidade) };
    });
  }, [porta]);

  /* ------------------------------------------------------------------
     2. O que fazer com um aviso tocado
     ------------------------------------------------------------------ */
  const abrirAviso = useCallback(
    async (recebido: AvisoBruto): Promise<Aviso | null> => {
      const veredito = decidirAviso(recebido.bruto, organizacaoRef.current);
      if (!veredito.entregar) {
        /*
          Tocar num aviso de outro município não abre nada, e o aviso sai da
          bandeja. Nenhuma mensagem de erro: dizer "este aviso não é seu"
          contaria à pessoa de B que existe trabalho em A, que é exatamente o
          que a barreira existe para não contar.
        */
        await porta.removerDaBandeja(recebido.identificador);
        return null;
      }

      await porta.removerDaBandeja(recebido.identificador);
      router.push({
        pathname: "/(agente)/vistoria/[id]",
        params: { id: veredito.aviso.ocorrenciaId },
      });
      return veredito.aviso;
    },
    [porta],
  );

  useEffect(() => {
    return porta.aoTocar((recebido) => {
      if (tratados.current.has(recebido.identificador)) return;
      tratados.current.add(recebido.identificador);
      void abrirAviso(recebido);
    });
  }, [porta, abrirAviso]);

  /* ------------------------------------------------------------------
     3. O aviso que abriu o aplicativo do zero
     ------------------------------------------------------------------ */
  useEffect(() => {
    /*
      Espera a sessão ser lida do cofre. Perguntar antes disso encontraria
      `organizacaoRef.current` nula, e o aviso legítimo seria descartado como
      "sem sessão" no caminho mais comum de todos: o telefone no bolso, o aviso
      chegando, o agente tocando nele.
    */
    if (carregando) return;
    void (async () => {
      const recebido = await porta.avisoQueAbriuOAplicativo();
      if (!recebido) return;
      if (tratados.current.has(recebido.identificador)) return;
      tratados.current.add(recebido.identificador);
      await abrirAviso(recebido);
    })();
  }, [porta, carregando, organizacao, abrirAviso]);

  /* ------------------------------------------------------------------
     4. Varredura da bandeja
     ------------------------------------------------------------------ */
  useEffect(() => {
    if (carregando) return;
    void (async () => {
      for (const presente of await porta.listarNaBandeja()) {
        const veredito = decidirAviso(presente.bruto, organizacaoRef.current);
        if (!veredito.entregar) await porta.removerDaBandeja(presente.identificador);
      }
    })();
  }, [porta, carregando, organizacao]);

  /* ------------------------------------------------------------------
     5. Permissão e registro da ficha, depois do login
     ------------------------------------------------------------------ */
  /*
    O município para o qual a ficha já foi registrada.

    Sem esta memória o registro repete a cada renderização deste provedor, e
    "cada renderização" não é raro: ele embrulha o aplicativo inteiro. Cada
    repetição custa uma pergunta ao servidor da loja (para pegar a ficha) e uma
    requisição à API, com o aparelho na rua, na rede móvel do agente. O servidor
    aceita a repetição sem duplicar linha (a rota tem `ON CONFLICT`), então o
    defeito é silencioso do pior jeito: nada quebra, só o consumo de dados e de
    bateria sobe sem que ninguém relacione a causa.

    Guardado como `ref` e não como estado porque isto não se desenha, e virar
    estado provocaria mais uma renderização a cada registro, que é justamente o
    laço que se quer evitar.
  */
  const registradoPara = useRef<string | null>(null);

  const registrarFicha = useCallback(async () => {
    const desfecho = await registrarEsteAparelho({
      porta,
      registrar: async (plataforma, ficha) => {
        const token = await obterToken();
        // Sem token não há registro possível, e insistir sem ele produziria um
        // 401 que a classificação leria como falha de verdade.
        if (!token) throw new Error("sem token para registrar o aparelho");
        await registrarAparelho(token, plataforma, ficha);
      },
      guardarFicha,
    });
    setRegistro(desfecho);
  }, [porta, obterToken]);

  /*
    A função de registrar mora numa `ref` para não entrar nas dependências do
    efeito abaixo.

    Ela depende de `obterToken`, e o provedor de sessão pode devolver uma função
    nova a cada renderização. Como dependência, isso faria o efeito inteiro
    (consultar permissão, decidir o convite, registrar) rodar de novo a cada
    quadro. Foi exatamente o que o teste do registro pegou: duas linhas
    idênticas chegando ao servidor por uma montagem só.
  */
  const registrarFichaRef = useRef(registrarFicha);
  registrarFichaRef.current = registrarFicha;

  useEffect(() => {
    if (carregando) return;
    let vivo = true;

    void (async () => {
      const estado = await porta.consultarPermissao();
      if (!vivo) return;
      setPermissao(estado);

      const passo = proximoPasso({
        estado,
        temSessao: Boolean(organizacao),
        jaConvidou: await leuConvite(),
      });
      if (!vivo) return;

      if (passo === "convidar") { setConvite(true); return; }

      // Só registra quem já pode receber. Pedir ficha sem permissão devolve
      // nada, e gastaria uma ida à rede da loja a cada abertura.
      if (estado !== "concedida" || !organizacao) return;
      if (registradoPara.current === organizacao) return;
      registradoPara.current = organizacao;
      await registrarFichaRef.current();
    })();

    return () => { vivo = false; };
  }, [porta, carregando, organizacao]);

  /* ------------------------------------------------------------------
     6. A volta do segundo plano
     ------------------------------------------------------------------ */
  /**
   * Relê a permissão e registra a ficha, se agora der.
   *
   * Está separado do efeito 5 de propósito: aquele decide o CONVITE, que é
   * assunto de primeira abertura e não pode voltar a aparecer porque o agente
   * trocou de aplicativo. Aqui só se relê o que o sistema diz e se registra o
   * que ficou por registrar.
   */
  const conferirPermissao = useCallback(async () => {
    const estado = await porta.consultarPermissao();
    setPermissao(estado);

    const municipio = organizacaoRef.current;
    if (estado !== "concedida" || !municipio) return;
    if (registradoPara.current === municipio) return;
    registradoPara.current = municipio;
    await registrarFichaRef.current();
  }, [porta]);

  useEffect(() => {
    if (carregando) return;

    /*
      O ÚNICO jeito de o aplicativo perceber que a permissão mudou por fora.

      No iOS a caixa do sistema aparece uma vez por instalação: quem respondeu
      "não" só volta atrás pelos ajustes do aparelho. A tela de "Minha conta"
      oferece esse caminho, e até aqui ela precisava terminar com "feche e abra
      este aplicativo de novo para ele perceber", porque a permissão só era lida
      na montagem e na troca de sessão, que são as duas ocasiões em que ela não
      muda por fora.

      O custo de não escutar não era a frase, era a FICHA. O registro só
      acontece depois da permissão concedida, então o aparelho de quem ligou a
      notificação nos ajustes continuava sem ficha nenhuma no servidor, estado
      indistinguível de "nunca instalou". O agente fazia tudo certo, a tela
      dizia que estava desligado, e o aviso de prazo não saía para ele.

      Só a VOLTA (`active`) dispara. A ida para o segundo plano é justamente o
      momento em que a permissão com certeza não mudou, e consultar ali gastaria
      uma chamada ao sistema a cada troca de aplicativo, que num plantão são
      dezenas.
    */
    const inscricao = AppState.addEventListener("change", (estado) => {
      if (estado !== "active") return;
      void conferirPermissao();
    });
    return () => { inscricao.remove(); };
  }, [carregando, conferirPermissao]);

  /** O convite foi aceito: pergunta o sistema e, se ele disser sim, registra. */
  const aceitarConvite = useCallback(async () => {
    /*
      A marca é gravada ANTES da caixa do sistema, e não depois.

      Se fosse depois, um aplicativo morto pelo sistema enquanto a caixa está
      aberta (acontece, com o aparelho de pouca memória que a prefeitura compra)
      deixaria a marca por gravar, e o convite voltaria na próxima abertura para
      alguém que já tinha respondido. No iOS a segunda vez não abre caixa
      nenhuma, então a pessoa tocaria em "Ligar os avisos" e não veria nada
      acontecer.
    */
    await marcarConvidado();
    const estado = await porta.pedirPermissao();
    setPermissao(estado);
    const municipio = organizacaoRef.current;
    if (estado !== "concedida" || !municipio) return;
    if (registradoPara.current === municipio) return;
    registradoPara.current = municipio;
    await registrarFicha();
  }, [porta, registrarFicha]);

  const recusarConvite = useCallback(() => {
    setConvite(false);
    void marcarConvidado();
  }, []);

  const valor: EstadoDoPush = {
    permissao,
    registro,
    pedirPermissao: async () => { await aceitarConvite(); },
    abrirAjustes: () => porta.abrirAjustes(),
  };

  return (
    <ContextoDePush.Provider value={valor}>
      {children}
      {/*
        O convite é uma tela NOSSA, e vem antes da caixa do sistema.

        A caixa do sistema é uma pergunta sem contexto e com uma resposta
        irreversível. Esta folha diz, em uma frase, para que serve o aviso, e
        pode ser recusada sem gastar a única pergunta que o iOS concede. Quem
        toca em "Agora não" continua podendo ligar por "Minha conta"; quem toca
        na caixa do sistema, não.

        Não é destrutiva: recusar não perde nada, e por isso o botão de ação não
        vem em vermelho. A recusa existe mesmo assim, porque um diálogo modal
        esconde o fundo de quem usa leitor de tela, e sem ela a pergunta teria
        uma resposta só.
      */}
      <Dialogo
        aberto={convite}
        testID="convite-de-aviso"
        titulo="Quer ser avisado de tarefa nova?"
        texto={
          "O aplicativo pode avisar quando a coordenação despachar uma vistoria "
          + "para a sua equipe e quando um prazo estiver perto de vencer. O aviso "
          + "na tela bloqueada não mostra endereço nem protocolo: esses só "
          + "aparecem depois que você destrava o aparelho."
        }
        acao={{
          rotulo: "Ligar os avisos",
          aoTocar: () => void aceitarConvite(),
        }}
        recusa={{ rotulo: "Agora não" }}
        aoFechar={recusarConvite}
      />
    </ContextoDePush.Provider>
  );
}
