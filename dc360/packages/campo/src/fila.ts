import type { EnvelopeSincronizacao } from "@dc360/shared";
import {
  FalhaPermanente,
  FalhaTemporaria,
  type Arquivos,
  type AutorDaColeta,
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
 * enquanto a coleta esperava sinal. O agente fez o trabalho certo, nao ha o que
 * corrigir, e a tela pode dizer com todas as letras o que aconteceu.
 *
 * `nao_encontrada` SAIU desta lista em 09/09/2026, e a saida e o conserto de um
 * defeito de prova. O 404 nao diz por que a ocorrencia sumiu, e a API responde
 * 404 (nunca 403) tambem para recurso de outro municipio, justamente para nao
 * confirmar que ele existe. Arquivar nesse codigo fazia o aplicativo AFIRMAR um
 * motivo que ele nao tinha: o cartao mostrava "Arquivada" com a frase "a
 * ocorrencia foi encerrada no painel", o cracha zerava, a faixa dizia "Tudo
 * sincronizado", e o laudo nunca chegava a lugar nenhum. Um 404 e o unico
 * desfecho aqui que ninguem no aparelho sabe explicar, entao ele vira
 * `bloqueado`: alguem precisa olhar.
 *
 * Este e o primeiro `if` sobre codigo de erro da fila inteira. Ate 09/09/2026 o
 * `codigo` chegava dentro de `FalhaPermanente` e era descartado na hora de
 * gravar, entao a fila nao tinha como distinguir um caso do outro.
 */
export const CODIGOS_SEM_DESTINO = ["ja_encerrada"] as const;

export function coletaSemDestino(codigo: string): boolean {
  return (CODIGOS_SEM_DESTINO as readonly string[]).includes(codigo);
}

/** De quem e a coleta, olhando da sessao que esta aberta agora. */
export type Autoria = "propria" | "de_outro" | "sem_autor";

/**
 * A comparacao entre o autor da coleta e a sessao aberta, escrita UMA vez.
 *
 * Fica exportada porque a tela precisa exatamente da mesma resposta que o dreno
 * usa para decidir o que enviar. Duas listas para o mesmo fato divergem na
 * primeira pressa, e a divergencia aqui seria a tela oferecendo "vai sair assim
 * que houver sinal" para um item que o dreno nunca vai tocar.
 */
export function autoriaDaColeta(
  item: Pick<ItemFila, "autor">,
  sessao: AutorDaColeta | null,
): Autoria {
  if (!item.autor) return "sem_autor";
  if (!sessao) return "de_outro";
  return item.autor.usuarioId === sessao.usuarioId
    && item.autor.organizacaoId === sessao.organizacaoId
    ? "propria"
    : "de_outro";
}


export type OpcoesFila = {
  deposito: Deposito;
  transporte: Transporte;
  /**
   * Quem esta logado AGORA. Obrigatorio, e um getter, nao um valor.
   *
   * Obrigatorio porque a alternativa (um padrao silencioso que deixa passar
   * tudo) e o defeito: quem esquecesse de passar teria uma fila que sobe coleta
   * de qualquer um com a credencial de qualquer um, e nada na tela indicaria
   * isso. Quem constroi a fila precisa responder de quem ela e.
   *
   * Getter, e nao valor, porque a fila do aplicativo e memoizada: ela e criada
   * uma vez e vive o dia inteiro, atravessando logout e login. Um valor
   * congelado no momento da criacao faria a fila continuar acreditando, depois
   * da troca de turno, que quem esta no aparelho e o agente da manha.
   *
   * Devolve `null` quando nao ha sessao. Nesse caso nada sobe, que e o certo:
   * sem token o transporte falharia de todo jeito.
   */
  sessaoAtual: () => AutorDaColeta | null;
  /** De onde saem os bytes das fotos. So necessario se houver foto na coleta. */
  arquivos?: Arquivos;
  /** Injetáveis para o teste poder controlar o tempo em vez de esperar por ele. */
  agora?: () => Date;
  dormir?: (ms: number) => Promise<void>;
  /** Ruído no tempo de espera. Injetável para o teste ser determinístico. */
  ruido?: () => number;
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
    sessaoAtual,
    arquivos,
    agora = () => new Date(),
    dormir = (ms: number) => new Promise<void>((r) => setTimeout(r, ms)),
    ruido = Math.random,
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
    const todos = await deposito.listar();
    /*
      Coleta de outro autor sai de TODOS os contadores de estado e vai para o
      seu proprio.

      Ela continua na fila, continua visivel e continua contando no cracha do
      menu (a tela soma os dois numeros), mas nao pode entrar em "pendentes":
      pendente e a promessa de que sai sozinha quando houver sinal, e essa
      coleta nao sai enquanto o autor dela nao entrar neste aparelho.
    */
    const itens = todos.filter((i) => autoriaDaColeta(i, sessaoAtual()) === "propria");
    return {
      pendentes: itens.filter((i) => i.estado === "pendente").length,
      enviando: itens.filter((i) => i.estado === "enviando").length,
      confirmados: itens.filter((i) => i.estado === "confirmado").length,
      bloqueados: itens.filter((i) => i.estado === "bloqueado").length,
      deOutroAutor: todos.length - itens.length,
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
      /*
        O autor e carimbado AQUI, no momento da coleta, e nunca mais muda.

        Carimbar no envio seria carimbar quem estava logado na hora do envio,
        que pode ser o agente do turno seguinte, e e exatamente o que a minuta
        lida em voz alta no local desmente.
      */
      autor: sessaoAtual(),
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
    const sessao = sessaoAtual();
    return itens
      /*
        O PORTAO DE AUTORIA, e ele vem antes de tudo.

        O envelope nao carrega autor: o servidor tira o `agente_id` de quem
        apresentou o token. Entao a unica coisa que impede a coleta do agente da
        manha de subir assinada pelo agente da noite, num aparelho de plantao
        compartilhado, e esta linha. Sem ela o laudo e a trilha (que e
        append-only) atribuem a vistoria a um servidor que nunca esteve no
        local, e ninguem no aparelho fica sabendo.

        O item nao e apagado nem bloqueado: ele espera o autor. O logout promete
        que a coleta continua guardada, e essa promessa continua valendo.
      */
      .filter((i) => autoriaDaColeta(i, sessao) === "propria")
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

    /*
      A MARCA E O SINALIZADOR SAO SINCRONOS, e precisam continuar sendo.

      A primeira versao desta correcao pos um `await` antes de `drenando = true`
      e abriu uma janela: dois drenos passavam pelo portao acima antes de
      qualquer um marcar, e o mesmo item saia duas vezes. O teste "dois drenos
      ao mesmo tempo nao enviam o mesmo item duas vezes" pegou na hora, e e por
      isso que ele existe. Nenhum `await` entra entre o `if (drenando)` e a
      linha abaixo.
    */
    marcaAtual += 1;
    const minhaMarca = marcaAtual;
    drenando = true;

    /*
      Nada pronto? Ninguem e avisado de nada.

      Antes daqui, `avisar()` vinha antes de olhar se havia o que enviar. Com o
      laco de fundo chamando `drenar()` a cada 15 segundos mesmo com a fila
      vazia, isso produzia, para sempre: verde "Tudo sincronizado", cinza
      "Enviando, 0 na fila", verde de novo, a cada 15 segundos. Foi o relatado
      como "a faixa verde fica piscando, isso e chato demais".

      `limparConfirmados` continua rodando porque ela pode remover item, e isso
      muda o resumo de verdade. So avisa se removeu algo.
    */
    try {
      const removeu = await limparConfirmados();
      if (prontos(await deposito.listar(), agora()).length === 0) {
        if (minhaMarca === marcaAtual) drenando = false;
        if (removeu) await avisar();
        return {
          fotosEnviadas: 0, enviados: 0, duplicados: 0, adiados: 0, bloqueados: 0,
          interrompido: false,
        };
      }
    } catch (erro) {
      if (minhaMarca === marcaAtual) drenando = false;
      throw erro;
    }

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

    /*
      NAO EXISTE TETO DE TENTATIVAS PARA FALHA TEMPORARIA, e a ausencia e
      deliberada.

      Existia um: oito falhas seguidas e o item virava `bloqueado` com codigo
      `tentativas_esgotadas`. As esperas sao 1-2s, 2-4s, 4-8s, 8-16s, 16-32s,
      32-64s, 64-128s, mais o piso de 15s por volta do laco de fundo: cerca de
      CINCO MINUTOS. Cinco minutos de sinal ruim nao e caso raro, e a condicao
      normal de trabalho deste aplicativo: Wi-Fi de prefeitura de pe mas sem
      rota, ou borda de cobertura em que o Android devolve `isInternetReachable`
      indefinido, que `conectividade.ts` trata de proposito como "tem sinal".

      O resultado do teto era o inverso da verdade: o cartao ficava vermelho com
      "repetir o envio nao resolve sozinho", ao lado de um botao "Descartar", em
      cima de uma coleta que subiria sozinha na proxima janela de sinal. O
      produto convidava a pessoa a apagar uma vistoria boa.

      Insistir para sempre nao e desperdicio porque a espera tem teto
      (`ESPERA_MAXIMA_MS`, cinco minutos): o custo maximo e uma tentativa a cada
      cinco minutos, que e menos do que a tela de bloqueio do aparelho gasta. E
      o item continua contado e visivel o tempo todo, com o numero de tentativas
      na tela, entao ninguem precisa adivinhar que ele existe.

      `bloqueado` continua existindo, e continua querendo dizer uma coisa so:
      o servidor recusou por um motivo que repetir nao resolve.
    */
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
  /** Devolve se removeu algo: quem chama decide se vale avisar a tela. */
  async function limparConfirmados(): Promise<boolean> {
    const limite = agora().getTime() - reterConfirmadoMs;
    let removeu = false;
    for (const item of await deposito.listar()) {
      if (item.estado === "confirmado" && item.confirmadoEm) {
        if (new Date(item.confirmadoEm).getTime() <= limite) {
          await deposito.remover(item.id);
          removeu = true;
        }
      }
    }
    return removeu;
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
   * Assume a autoria de uma coleta que nao tem autor registrado.
   *
   * Existe por causa da atualizacao do aplicativo: o aparelho que ja tinha
   * coleta na fila quando esta versao chegou guarda itens sem autor, e nao ha
   * como descobrir de quem sao. Deixar essas coletas subirem com quem estiver
   * logado seria o defeito de novo; deixa-las presas para sempre seria perder
   * uma vistoria feita no morro.
   *
   * Entao a autoria vira um ATO DA PESSOA, com o dedo, numa tela que diz o
   * protocolo e a data da coleta. E o unico caminho honesto: alguem afirma
   * "esta vistoria e minha" e passa a responder por ela no laudo.
   *
   * Item que JA tem autor nunca e reassumido, em nenhuma circunstancia. Deixar
   * um agente reescrever o autor de uma coleta de outro seria o mesmo dado
   * falso que o carimbo evita, so que com um toque no lugar de um descuido.
   */
  async function assumir(id: string): Promise<void> {
    const sessao = sessaoAtual();
    if (!sessao) return;
    const item = (await deposito.listar()).find((i) => i.id === id);
    if (!item || item.autor) return;
    await deposito.salvar({
      ...item,
      autor: sessao,
      // Volta para a fila junto: o item pode ter parado em `bloqueado` por
      // falta de sessao antes de este campo existir.
      estado: item.estado === "arquivado" ? item.estado : "pendente",
      liberadoEm: agora().toISOString(),
    });
    await avisar();
  }

  /**
   * Descarta um item bloqueado. Exige confirmação de quem chama, porque
   * descartar coleta de campo é perder trabalho já feito no morro.
   */
  async function descartar(id: string): Promise<void> {
    const item = (await deposito.listar()).find((i) => i.id === id);
    if (!item) return;
    /*
      Coleta de outro autor tambem pode ser descartada, em QUALQUER estado, e
      esta e a saida do caso "o agente da manha nunca mais entra neste
      aparelho".

      Sem ela, aquela coleta ficaria no cracha para sempre, e um cracha que
      nunca zera e um cracha que a pessoa aprende a ignorar, inclusive quando
      ele passa a indicar algo de verdade. Quem chama pergunta com o nome de
      quem coletou dentro da pergunta: descartar trabalho de outra pessoa nao
      pode acontecer por um toque distraido.
    */
    const deOutro = autoriaDaColeta(item, sessaoAtual()) !== "propria";
    // Arquivado tambem pode ser descartado: e o caminho do agente que confere
    // que a ocorrencia foi mesmo encerrada e nao quer mais aquilo na tela.
    const parado = item.estado === "bloqueado" || item.estado === "arquivado";
    if (!deOutro && !parado) return;
    await deposito.remover(id);
    await avisar();
  }

  async function itens(): Promise<ItemFila[]> {
    return (await deposito.listar()).sort((a, b) => a.criadoEm.localeCompare(b.criadoEm));
  }

  /** Espera até o próximo item ficar liberado. Para o laço de fundo do app. */
  async function aguardarProximaJanela(): Promise<void> {
    const lista = await deposito.listar();
    const sessao = sessaoAtual();
    // Item de outro autor nao entra na conta: ele nao vai ser tentado, e o
    // `liberadoEm` dele no passado faria este laco voltar a rodar na hora, em
    // giro apertado, contra uma coleta que o dreno nem toca.
    const pendentes = lista.filter(
      (i) => i.estado === "pendente" && autoriaDaColeta(i, sessao) === "propria",
    );
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
    assumir,
    descartar,
    itens,
    resumo,
    assinar,
    aguardarProximaJanela,
  };
}

export type FilaDeSincronizacao = ReturnType<typeof criarFilaDeSincronizacao>;
