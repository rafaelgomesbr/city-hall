import type { EnvelopeSincronizacao } from "@dc360/shared";
import {
  FalhaPermanente,
  FalhaTemporaria,
  type Arquivos,
  type Deposito,
  type FotoLocal,
  type FotoNaFila,
  type ItemFila,
  type ResultadoDreno,
  type ResumoFila,
  type Transporte,
} from "./tipos.js";

/**
 * Codigos que significam "esta coleta perdeu o destino", e nao "esta coleta
 * esta errada".
 *
 * `ja_encerrada` vem de 409 quando a ocorrencia foi encerrada no painel
 * enquanto a coleta esperava sinal. `nao_encontrada` vem de 404. Nos dois casos
 * o agente fez o trabalho certo e nao ha o que corrigir.
 *
 * Este e o primeiro `if` sobre codigo de erro da fila inteira. Ate 09/09/2026 o
 * `codigo` chegava dentro de `FalhaPermanente` e era descartado na hora de
 * gravar, entao a fila nao tinha como distinguir um caso do outro.
 */
export const CODIGOS_SEM_DESTINO = ["ja_encerrada", "nao_encontrada"] as const;

export function coletaSemDestino(codigo: string): boolean {
  return (CODIGOS_SEM_DESTINO as readonly string[]).includes(codigo);
}


export type OpcoesFila = {
  deposito: Deposito;
  transporte: Transporte;
  /** De onde saem os bytes das fotos. So necessario se houver foto na coleta. */
  arquivos?: Arquivos;
  /** Injetáveis para o teste poder controlar o tempo em vez de esperar por ele. */
  agora?: () => Date;
  dormir?: (ms: number) => Promise<void>;
  /** Ruído no tempo de espera. Injetável para o teste ser determinístico. */
  ruido?: () => number;
  /** Depois de quantas falhas seguidas o item é bloqueado. */
  maximoTentativas?: number;
  /** Quanto tempo um item confirmado fica visível antes de sair da fila. */
  reterConfirmadoMs?: number;
};

const ESPERA_BASE_MS = 2_000;
const ESPERA_MAXIMA_MS = 5 * 60_000;

/**
 * Espera exponencial com ruído.
 *
 * Sem o exponencial, um servidor fora do ar recebe uma tentativa por segundo
 * de cada aparelho em campo, e a fila vira ataque contra a própria
 * prefeitura. Sem o ruído, todos os aparelhos que perderam sinal no mesmo
 * temporal voltam no mesmo instante e derrubam o servidor de novo justo na
 * hora em que ele está subindo.
 */
export function esperaAteProximaTentativa(tentativas: number, ruido = Math.random): number {
  const cheia = Math.min(ESPERA_BASE_MS * 2 ** Math.max(0, tentativas - 1), ESPERA_MAXIMA_MS);
  // Ruído completo (entre metade e o total) espalha melhor que uma margem
  // estreita em torno do valor cheio.
  return Math.round(cheia / 2 + ruido() * (cheia / 2));
}

export function criarFilaDeSincronizacao(opcoes: OpcoesFila) {
  const {
    deposito,
    transporte,
    arquivos,
    agora = () => new Date(),
    dormir = (ms: number) => new Promise<void>((r) => setTimeout(r, ms)),
    ruido = Math.random,
    maximoTentativas = 8,
    reterConfirmadoMs = 30_000,
  } = opcoes;

  let drenando = false;
  /**
   * Cada dreno recebe uma marca. Cancelar troca a marca, e o dreno em
   * andamento percebe a troca e para no próximo passo.
   *
   * Isto é o que impede o defeito clássico: o agente perde o sinal, o dreno
   * antigo continua rodando em segundo plano, o sinal volta, um dreno novo
   * começa, e os dois enviam o mesmo item. A chave de idempotência salvaria o
   * servidor, mas a fila local ficaria contando errado.
   */
  let marcaAtual = 0;

  const ouvintes = new Set<(r: ResumoFila) => void>();

  async function avisar(): Promise<void> {
    if (ouvintes.size === 0) return;
    const r = await resumo();
    for (const ouvinte of ouvintes) ouvinte(r);
  }

  function assinar(ouvinte: (r: ResumoFila) => void): () => void {
    ouvintes.add(ouvinte);
    void avisar();
    return () => ouvintes.delete(ouvinte);
  }

  async function resumo(): Promise<ResumoFila> {
    const itens = await deposito.listar();
    return {
      pendentes: itens.filter((i) => i.estado === "pendente").length,
      enviando: itens.filter((i) => i.estado === "enviando").length,
      confirmados: itens.filter((i) => i.estado === "confirmado").length,
      bloqueados: itens.filter((i) => i.estado === "bloqueado").length,
      /*
        Arquivado conta separado, e NAO entra em `bloqueados`, de proposito.

        `bloqueados` alimenta o cracha do menu e a frase "precisa de atencao".
        Coleta cuja ocorrencia foi encerrada nao precisa de atencao de ninguem:
        somar ela ali produzia um numero permanente que o agente nao tinha como
        zerar, e um cracha que nunca zera e um cracha que a pessoa aprende a
        ignorar, inclusive quando ele passa a indicar algo de verdade.
      */
      arquivados: itens.filter((i) => i.estado === "arquivado").length,
      sincronizando: drenando,
    };
  }

  /**
   * Coloca uma coleta na fila.
   *
   * Enfileirar a mesma chave duas vezes não cria dois itens. Acontece de
   * verdade: o agente toca em "concluir" e a tela demora a responder porque o
   * aparelho está velho, e ele toca de novo.
   */
  async function enfileirar(
    envelope: EnvelopeSincronizacao,
    dados: {
      protocolo: string;
      fotos?: FotoLocal[];
      /**
       * O traço que a pessoa fez com o dedo, se houver.
       *
       * Sobe junto com as fotos e pelo mesmo caminho, porque idempotência,
       * retomada e URL assinada já estão resolvidas ali e uma segunda
       * implementação seria a que ninguém testa. O que muda é só onde o
       * envelope guarda a chave depois.
       */
      assinatura?: FotoLocal;
    },
  ): Promise<ItemFila> {
    const existente = (await deposito.listar()).find((i) => i.id === envelope.idempotencyKey);
    if (existente) return existente;

    const instante = agora().toISOString();
    const item: ItemFila = {
      id: envelope.idempotencyKey,
      ocorrenciaId: envelope.ocorrenciaId,
      protocolo: dados.protocolo,
      envelope,
      estado: "pendente",
      tentativas: 0,
      criadoEm: instante,
      liberadoEm: instante,
      ultimaFalha: null,
      confirmadoEm: null,
      fotos: [
        ...(dados.fotos ?? []).map((f): FotoNaFila => ({
          ...f, papel: "foto", chave: null, evidenciaId: null, enviada: false,
        })),
        ...(dados.assinatura
          ? [{
              ...dados.assinatura,
              papel: "assinatura" as const,
              chave: null, evidenciaId: null, enviada: false,
            }]
          : []),
      ],
    };
    await deposito.salvar(item);
    await avisar();
    return item;
  }

  /** Ordem de coleta, sempre: a primeira vistoria feita é a primeira a subir. */
  function prontos(itens: ItemFila[], instante: Date): ItemFila[] {
    return itens
      .filter((i) => (i.estado === "pendente" || i.estado === "enviando"))
      .filter((i) => new Date(i.liberadoEm) <= instante)
      .sort((a, b) => a.criadoEm.localeCompare(b.criadoEm));
  }

  /**
   * Envia o que estiver pronto, um por vez.
   *
   * Um por vez, e não em paralelo, de propósito: a ordem de coleta é a ordem
   * do laudo, e conexão de borda de cidade não melhora com paralelismo, só
   * multiplica o tempo esgotado.
   */
  async function drenar(): Promise<ResultadoDreno> {
    if (drenando) {
      return {
        fotosEnviadas: 0, enviados: 0, duplicados: 0, adiados: 0, bloqueados: 0,
        interrompido: true,
      };
    }

    marcaAtual += 1;
    const minhaMarca = marcaAtual;
    drenando = true;
    await avisar();

    const resultado: ResultadoDreno = {
      fotosEnviadas: 0, enviados: 0, duplicados: 0, adiados: 0, bloqueados: 0,
      interrompido: false,
    };

    try {
      const fila = prontos(await deposito.listar(), agora());

      for (const item of fila) {
        if (minhaMarca !== marcaAtual) {
          resultado.interrompido = true;
          break;
        }

        /**
         * Um item em "enviando" quando o dreno começa significa que o
         * aplicativo morreu no meio de um envio anterior, e não há como saber
         * se o servidor recebeu. Reenviar é seguro exatamente porque a chave
         * de idempotência é a mesma: se chegou, o servidor devolve o recibo
         * antigo em vez de gravar de novo.
         */
        await deposito.salvar({
          ...item,
          estado: "enviando",
          tentativas: item.tentativas + 1,
        });
        await avisar();

        try {
          /**
           * As fotos sobem ANTES do envelope, e nunca depois.
           *
           * O envelope referencia as fotos pela chave que o servidor devolveu
           * na autorizacao. Mandar o envelope primeiro criaria um laudo
           * apontando para arquivo que ainda nao existe, e se o envio das
           * fotos falhasse depois disso o laudo ficaria permanentemente
           * incompleto, sem nada na fila indicando o que faltou.
           */
          const comFotos = await subirFotos(item);
          resultado.fotosEnviadas += comFotos.enviadasAgora;

          const recibo = await transporte.enviar(comFotos.envelope);

          if (minhaMarca !== marcaAtual) {
            // O dreno foi cancelado enquanto esta resposta voltava. O envio
            // deu certo, então o resultado precisa ser gravado do mesmo jeito:
            // descartar aqui faria a próxima rodada reenviar sem necessidade.
            resultado.interrompido = true;
          }

          const aposFotos = (await deposito.listar()).find((i) => i.id === item.id) ?? item;
          await deposito.salvar({
            ...aposFotos,
            estado: "confirmado",
            tentativas: item.tentativas + 1,
            ultimaFalha: null,
            confirmadoEm: agora().toISOString(),
          });
          if (recibo.duplicada) resultado.duplicados += 1;
          else resultado.enviados += 1;
          await avisar();

          if (resultado.interrompido) break;
        } catch (erro) {
          const desfecho = await tratarFalha(item, erro);
          if (desfecho === "bloqueado") resultado.bloqueados += 1;
          else resultado.adiados += 1;
          await avisar();

          if (desfecho === "adiado" && erro instanceof FalhaTemporaria) {
            // Rede caída não melhora no item seguinte. Parar aqui evita
            // gastar bateria tentando a fila inteira contra um servidor que
            // não responde, e preserva a ordem de coleta.
            resultado.interrompido = true;
            break;
          }
        }
      }

      await limparConfirmados();
      return resultado;
    } finally {
      if (minhaMarca === marcaAtual) drenando = false;
      await avisar();
    }
  }

  /**
   * Sobe as fotos que ainda faltam e devolve o envelope pronto.
   *
   * O progresso e gravado foto a foto: se a rede cair na terceira de cinco, a
   * proxima tentativa retoma da terceira em vez de reenviar tudo. Em conexao
   * de borda de cidade, reenviar quatro megabytes ja enviados e a diferenca
   * entre sincronizar e nao sincronizar.
   */
  async function subirFotos(
    item: ItemFila,
  ): Promise<{ envelope: EnvelopeSincronizacao; enviadasAgora: number }> {
    if (item.fotos.length === 0) {
      return { envelope: item.envelope, enviadasAgora: 0 };
    }
    if (!arquivos) {
      throw new FalhaPermanente(
        "A coleta tem foto, mas a fila foi criada sem acesso aos arquivos do aparelho.",
        "sem_acesso_a_arquivos",
      );
    }

    let enviadasAgora = 0;
    const atualizadas = [...item.fotos];

    for (let i = 0; i < atualizadas.length; i++) {
      const foto = atualizadas[i]!;
      if (foto.enviada && foto.chave) continue;

      const autorizacao = await transporte.autorizarFoto({
        ocorrenciaId: item.ocorrenciaId,
        foto,
      });

      // `jaEnviada` cobre o caso de o aparelho ter enviado os bytes e perdido
      // a resposta: reenviar seria gastar rede a toa.
      if (!autorizacao.jaEnviada) {
        const corpo = await arquivos.ler(foto.uriLocal);
        await transporte.enviarBytes(autorizacao.url, autorizacao.cabecalhos, corpo);
        await transporte.confirmarFoto(autorizacao.evidenciaId);
        enviadasAgora += 1;
      }

      atualizadas[i] = {
        ...foto,
        chave: autorizacao.chave,
        evidenciaId: autorizacao.evidenciaId,
        enviada: true,
      };
      // Grava a cada foto: e o que torna a retomada possivel.
      await deposito.salvar({ ...item, fotos: atualizadas, estado: "enviando" });
    }

    /*
      O envelope é remontado a partir do que o servidor devolveu, e não do que
      o aparelho achava. A assinatura sai da lista de fotos e vai para o campo
      dela: no laudo, uma é o registro fotográfico e a outra é o traço acima
      da linha de assinatura.
    */
    const assinatura = atualizadas.find((f) => f.papel === "assinatura");
    const envelope: EnvelopeSincronizacao = {
      ...item.envelope,
      vistoria: {
        ...item.envelope.vistoria,
        assinaturaChave: assinatura?.chave ?? item.envelope.vistoria.assinaturaChave,
        fotos: atualizadas
          .filter((f) => f.papel !== "assinatura")
          .map((f) => ({
            chave: f.chave!,
            capturadaEm: f.capturadaEm,
            ...(f.legenda ? { legenda: f.legenda } : {}),
            ...(f.coordenada ? { coordenada: f.coordenada } : {}),
          })),
      },
    };

    return { envelope, enviadasAgora };
  }

  /** Guarda a falha inteira, e nao so a frase: o codigo e os campos importam. */
  function registrarFalha(erro: unknown, permanente: boolean) {
    const permanenteConhecida = erro instanceof FalhaPermanente;
    return {
      codigo: permanenteConhecida ? erro.codigo : "falha_de_rede",
      mensagem: erro instanceof Error ? erro.message : String(erro),
      campos: permanenteConhecida ? erro.campos : [],
      permanente,
      em: agora().toISOString(),
    };
  }

  async function tratarFalha(
    item: ItemFila,
    erro: unknown,
  ): Promise<"adiado" | "bloqueado" | "arquivado"> {
    const tentativas = item.tentativas + 1;
    // Rele do deposito para nao descartar as fotos que subiram nesta rodada.
    const atual = (await deposito.listar()).find((i) => i.id === item.id) ?? item;
    const comProgresso = { ...item, fotos: atual.fotos };

    if (erro instanceof FalhaPermanente) {
      /*
        Coleta sem destino nao e a mesma coisa que coleta recusada.

        Quando a ocorrencia foi encerrada no painel enquanto a coleta esperava
        sinal, repetir nunca vai funcionar e o agente nao errou nada. Antes isso
        virava `bloqueado`, o cracha do menu passava a gritar um numero que
        ninguem conseguia zerar, e o unico caminho de saida era o agente apagar
        o proprio trabalho.

        Arquivado sai do dreno e sai da contagem de atencao, e a coleta continua
        guardada: ela e prova de um ato que aconteceu, e a ocorrencia pode ter
        sido encerrada por engano.
      */
      const semDestino = coletaSemDestino(erro.codigo);
      await deposito.salvar({
        ...comProgresso,
        estado: semDestino ? "arquivado" : "bloqueado",
        tentativas,
        ultimaFalha: registrarFalha(erro, true),
      });
      return semDestino ? "arquivado" : "bloqueado";
    }

    if (tentativas >= maximoTentativas) {
      await deposito.salvar({
        ...comProgresso,
        estado: "bloqueado",
        tentativas,
        ultimaFalha: {
          codigo: "tentativas_esgotadas",
          mensagem:
            `Não foi possível enviar depois de ${tentativas} tentativas. `
            + `Último erro: ${erro instanceof Error ? erro.message : String(erro)}`,
          campos: [],
          permanente: true,
          em: agora().toISOString(),
        },
      });
      return "bloqueado";
    }

    const espera = esperaAteProximaTentativa(tentativas, ruido);
    await deposito.salvar({
      ...comProgresso,
      estado: "pendente",
      tentativas,
      liberadoEm: new Date(agora().getTime() + espera).toISOString(),
      ultimaFalha: registrarFalha(erro, false),
    });
    return "adiado";
  }

  /** Confirmado some depois de um tempo: a lista é do que falta, não do que já foi. */
  async function limparConfirmados(): Promise<void> {
    const limite = agora().getTime() - reterConfirmadoMs;
    for (const item of await deposito.listar()) {
      if (item.estado === "confirmado" && item.confirmadoEm) {
        if (new Date(item.confirmadoEm).getTime() <= limite) {
          await deposito.remover(item.id);
        }
      }
    }
  }

  /**
   * Interrompe o dreno em andamento. Chamado quando o aparelho perde o sinal
   * ou quando o aplicativo vai para segundo plano.
   */
  function cancelar(): void {
    marcaAtual += 1;
    drenando = false;
  }

  /**
   * Devolve um item bloqueado para a fila, por decisão da pessoa. Serve para
   * o caso "o servidor estava fora e agora voltou", que o aparelho não tem
   * como adivinhar.
   */
  async function reenviar(id: string): Promise<void> {
    const item = (await deposito.listar()).find((i) => i.id === id);
    // Arquivado entra junto: se a coordenacao reabrir a ocorrencia, o agente
    // precisa conseguir mandar a coleta que ficou parada. Sem isto, o botao
    // some exatamente nos itens que o estado novo criou.
    if (!item || (item.estado !== "bloqueado" && item.estado !== "arquivado")) return;
    await deposito.salvar({
      ...item,
      estado: "pendente",
      tentativas: 0,
      liberadoEm: agora().toISOString(),
      ultimaFalha: null,
    });
    await avisar();
  }

  /**
   * Descarta um item bloqueado. Exige confirmação de quem chama, porque
   * descartar coleta de campo é perder trabalho já feito no morro.
   */
  async function descartar(id: string): Promise<void> {
    const item = (await deposito.listar()).find((i) => i.id === id);
    // Arquivado tambem pode ser descartado: e o caminho do agente que confere
    // que a ocorrencia foi mesmo encerrada e nao quer mais aquilo na tela.
    if (!item || (item.estado !== "bloqueado" && item.estado !== "arquivado")) return;
    await deposito.remover(id);
    await avisar();
  }

  async function itens(): Promise<ItemFila[]> {
    return (await deposito.listar()).sort((a, b) => a.criadoEm.localeCompare(b.criadoEm));
  }

  /** Espera até o próximo item ficar liberado. Para o laço de fundo do app. */
  async function aguardarProximaJanela(): Promise<void> {
    const lista = await deposito.listar();
    const pendentes = lista.filter((i) => i.estado === "pendente");
    if (pendentes.length === 0) return;
    const proximo = Math.min(...pendentes.map((i) => new Date(i.liberadoEm).getTime()));
    const espera = proximo - agora().getTime();
    if (espera > 0) await dormir(espera);
  }

  return {
    enfileirar,
    drenar,
    cancelar,
    reenviar,
    descartar,
    itens,
    resumo,
    assinar,
    aguardarProximaJanela,
  };
}

export type FilaDeSincronizacao = ReturnType<typeof criarFilaDeSincronizacao>;
