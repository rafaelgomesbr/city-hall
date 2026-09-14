import type { DevolucaoDeTarefa, EnvelopeSincronizacao } from "@dc360/shared";
import {
  FalhaPermanente,
  FalhaTemporaria,
  type Arquivos,
  type AutorDaColeta,
  type Deposito,
  type DevolucaoSemAutor,
  type FotoLocal,
  type FotoNaFila,
  type ItemDeVistoria,
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

/**
 * O codigo que a porta `Arquivos` usa quando conferiu que o arquivo nao esta
 * mais no aparelho, e que a fila trata como perda de prova.
 *
 * Mora aqui, exportado, porque ele e o contrato entre TRES lugares: a porta que
 * le os bytes (`apps/campo/src/dados/evidencia-no-disco.ts`), o dreno que marca
 * a foto como perdida, e a tela que oferece ao agente subir sem ela. Escrito a
 * mao em tres arquivos, ele divergiria na primeira renomeacao e o unico sintoma
 * seria a saida sumir da tela, deixando a coleta presa de novo.
 */
export const CODIGO_ARQUIVO_SUMIU = "arquivo_sumiu";

/**
 * Quantos arquivos desta coleta o aparelho ja sabe que nao existem mais.
 *
 * Exportada para a tela usar exatamente a mesma conta do dreno. Duas contas
 * para o mesmo fato divergem na primeira pressa, e a divergencia aqui seria a
 * tela perguntando "deseja subir sem 2 fotografias?" para um item que vai subir
 * sem tres.
 */
export function evidenciasPerdidasDoItem(
  item: Pick<ItemFila, "fotos">,
): FotoNaFila[] {
  return item.fotos.filter((f) => f.perdida && !f.enviada);
}

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


/**
 * O envelope como ele sai do aparelho: com o autor da coleta dentro.
 *
 * O carimbo do autor no item da fila resolvia metade do problema (o aparelho
 * deixou de enviar coleta de outra pessoa), e a outra metade só o servidor
 * resolve: enquanto o envelope não dissesse quem coletou, o `agente_id` da
 * vistoria continuaria saindo de quem apresentou o token, e um binário
 * adulterado produziria de novo o laudo assinado por quem não estava lá.
 *
 * Montado NA HORA DO ENVIO a partir de `item.autor`, e não gravado dentro do
 * envelope no `enfileirar`, por três motivos que apontam para o mesmo lugar:
 * um fato tem uma fonte só (dois campos para o mesmo autor divergem na
 * primeira pressa); `assumir` carimba o autor depois, e o envelope guardado
 * ficaria para trás; e coleta gravada por versão anterior continua sem autor,
 * sem precisar de reescrita de disco.
 *
 * Autor ausente sai SEM o campo, de propósito: é a coleta de versão anterior, e
 * o servidor a aceita como aceitava antes. Mandar o dono da sessão aqui seria
 * escrever exatamente a mentira que o campo existe para impedir.
 */
function envelopeComAutoria(
  envelope: EnvelopeSincronizacao,
  autor: AutorDaColeta | null,
): EnvelopeSincronizacao {
  if (!autor) return envelope;
  return { ...envelope, coletadaPor: autor.usuarioId };
}

/**
 * A devolução como ela SAI do aparelho: com quem devolveu dentro.
 *
 * Mesmo desenho de `envelopeComAutoria`, e o mesmo motivo: o autor vive no
 * item da fila, é carimbado na hora do toque e vai para o contrato só no
 * momento do envio. A diferença é que aqui o campo é OBRIGATÓRIO e não tem
 * caminho de compatibilidade, porque ele nasce hoje: não existe aparelho em
 * campo com devolução gravada sem autor.
 *
 * Devolução sem autor por isso não sai, e lança em vez de mandar o dono da
 * sessão: mandar seria assinar, com o nome de quem está no aparelho agora, uma
 * decisão que outra pessoa tomou no morro. Na prática o dreno nunca chega aqui
 * (o portão de autoria em `prontos` já não entrega item sem autor), e este
 * lance existe para o dia em que aquele filtro for mexido.
 */
function devolucaoComAutoria(
  devolucao: DevolucaoSemAutor,
  autor: AutorDaColeta | null,
): DevolucaoDeTarefa {
  if (!autor) {
    throw new FalhaPermanente(
      "Esta devolução não tem autor registrado neste aparelho e não pode ser enviada.",
      "devolucao_sem_autor",
    );
  }
  return { ...devolucao, devolvidaPor: autor.usuarioId };
}

/**
 * O que aconteceu com o pedido de devolução, dito para a tela.
 *
 * Resultado, e não exceção, porque as duas recusas são respostas previstas e a
 * tela precisa dizer uma frase diferente para cada uma. Exceção aqui viraria um
 * `catch` genérico e uma frase só, e a frase só seria a errada em um dos casos:
 * "não deu para devolver" sobre uma coleta esperando envio esconderia
 * justamente o que o agente precisa saber, que é que o trabalho dele está ali.
 *
 * `jaExistia` distingue o toque repetido do primeiro toque. Sem ele a tela não
 * consegue diferenciar "devolvi agora" de "isto já estava devolvido", e as duas
 * frases são diferentes para quem está com o dedo na tela.
 */
export type ResultadoDoEnfileiramento =
  | { enfileirada: true; item: ItemFila; jaExistia: boolean }
  | { enfileirada: false; motivo: "sem_sessao" | "coleta_na_fila" };

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
      tipo: "vistoria",
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

  /**
   * Coloca na fila a devolução de uma tarefa vencida.
   *
   * Ela entra pela MESMA fila da vistoria porque nasce na mesma situação: o
   * agente decide no morro, sem sinal, e o envio acontece quando a rede volta.
   * O que ela não pode é sair antes de a coordenação saber: até o servidor
   * confirmar, este item é a única memória, no aparelho, de que a tarefa foi
   * devolvida.
   *
   * DUAS RECUSAS, e as duas são de dado e não de tela:
   *
   * 1. **Sem sessão aberta, não enfileira.** `devolvidaPor` é obrigatório no
   *    contrato e é conferido pelo servidor contra o dono do token. Um item sem
   *    autor ficaria parado para sempre, e a tarefa teria sumido da lista do
   *    agente em troca de nada.
   * 2. **Com coleta desta ocorrência na fila, não enfileira.** O agente
   *    vistoriou e o envio ainda não saiu; devolver jogaria fora o trabalho
   *    dele, em silêncio, e a coordenação receberia "não deu para vistoriar"
   *    sobre uma vistoria que existe guardada a dois toques dali. Vale para
   *    coleta em QUALQUER estado: bloqueada é trabalho a recuperar, confirmada
   *    já chegou ao servidor, e nos dois casos a devolução é falsa.
   *
   * Enfileirar a mesma devolução duas vezes não cria dois itens, pela mesma
   * razão da coleta: o aparelho velho demora a responder e o dedo toca de novo.
   * Uma segunda devolução da MESMA ocorrência, com chave nova, também não: o
   * que ela pediria já está pedido, e dois itens produziriam dois eventos de
   * devolução para uma tarefa só.
   */
  async function enfileirarDevolucao(
    devolucao: DevolucaoSemAutor,
    dados: { protocolo: string },
  ): Promise<ResultadoDoEnfileiramento> {
    const autor = sessaoAtual();
    if (!autor) return { enfileirada: false, motivo: "sem_sessao" };

    const naFila = await deposito.listar();

    const jaPedida = naFila.find(
      (i) => i.tipo === "devolucao" && i.ocorrenciaId === devolucao.ocorrenciaId,
    );
    if (jaPedida) return { enfileirada: true, item: jaPedida, jaExistia: true };

    const temColeta = naFila.some(
      (i) => i.tipo === "vistoria" && i.ocorrenciaId === devolucao.ocorrenciaId,
    );
    if (temColeta) return { enfileirada: false, motivo: "coleta_na_fila" };

    const instante = agora().toISOString();
    const item: ItemFila = {
      tipo: "devolucao",
      id: devolucao.idempotencyKey,
      /* Carimbado agora, como na coleta, e nunca mais reescrito: quem devolveu
         responde pelo ato na trilha, que é append-only. */
      autor,
      ocorrenciaId: devolucao.ocorrenciaId,
      protocolo: dados.protocolo,
      devolucao,
      estado: "pendente",
      tentativas: 0,
      criadoEm: instante,
      liberadoEm: instante,
      ultimaFalha: null,
      confirmadoEm: null,
      fotos: [],
    };
    await deposito.salvar(item);
    await avisar();
    return { enfileirada: true, item, jaExistia: false };
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
          /*
            O DESPACHO POR TIPO, e ele é a única bifurcação do dreno.

            Tudo o que vem antes e depois (o portão de autoria, a marca de
            cancelamento, a espera entre tentativas, o tratamento da falha) vale
            igual para os dois, porque é a mesma rua e a mesma conexão indo e
            vindo. O que muda é só o que sai pelo fio.
          */
          let duplicada: boolean;
          if (item.tipo === "devolucao") {
            /*
              Devolução não tem foto e não pode ganhar uma: ela é a declaração
              de que a vistoria NÃO aconteceu. Por isso vai direto, sem o passo
              de arquivos.
            */
            const recibo = await transporte.devolver(
              devolucaoComAutoria(item.devolucao, item.autor),
            );
            duplicada = recibo.duplicada;
          } else {
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

            const recibo = await transporte.enviar(
              envelopeComAutoria(comFotos.envelope, item.autor),
            );
            duplicada = recibo.duplicada;
          }

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
          if (duplicada) resultado.duplicados += 1;
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
    item: ItemDeVistoria,
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
    /*
      O DRENO NAO PARA NA PRIMEIRA FOTO QUE FALTA, e essa e a diferenca entre
      uma pergunta e uma sequencia de perguntas no barranco.

      Parar na primeira ausencia faria a tela dizer "uma foto sumiu", o agente
      consentir, a rodada seguinte descobrir a segunda, e assim por diante. Ele
      responderia a mesma pergunta uma vez por arquivo perdido, sem saber quantas
      faltam. Percorrendo tudo, uma rodada descobre todas as ausencias de uma vez
      e uma pergunta so resolve o caso inteiro.

      As fotos que EXISTEM sobem nesta mesma rodada, e o progresso fica gravado:
      quando o agente consentir, o que falta e so montar o envelope.
    */
    let faltando = 0;

    for (let i = 0; i < atualizadas.length; i++) {
      const foto = atualizadas[i]!;
      if (foto.enviada && foto.chave) continue;

      /*
        Arquivo ja sabidamente ausente, com o consentimento dado: nao se tenta
        ler de novo (nao volta), nao se pede autorizacao ao servidor (nao ha
        bytes para mandar), e ele segue para `evidenciasPerdidas` no envelope.

        Sem o consentimento, o caminho normal abaixo tenta ler, falha de novo e
        mantem o item bloqueado, que e exatamente onde ele deve ficar ate alguem
        decidir.
      */
      if (foto.perdida && item.abriuMaoDasPerdidas) continue;

      const autorizacao = await transporte.autorizarFoto({
        ocorrenciaId: item.ocorrenciaId,
        foto,
      });

      // `jaEnviada` cobre o caso de o aparelho ter enviado os bytes e perdido
      // a resposta: reenviar seria gastar rede a toa.
      if (!autorizacao.jaEnviada) {
        let corpo: Uint8Array;
        try {
          corpo = await arquivos.ler(foto.uriLocal);
        } catch (erro) {
          /*
            SO `arquivo_sumiu` vira marca de perda, e nunca qualquer falha de
            leitura.

            Um erro de permissao, um disco cheio ou um defeito da porta sao
            situacoes que podem melhorar, e tratar qualquer uma delas como
            "o arquivo acabou" ofereceria ao agente jogar fora uma prova que
            ainda existe no aparelho. A porta `Arquivos` so usa este codigo
            quando conferiu que o arquivo nao esta la.
          */
          if (!(erro instanceof FalhaPermanente) || erro.codigo !== CODIGO_ARQUIVO_SUMIU) {
            throw erro;
          }
          atualizadas[i] = { ...foto, perdida: true };
          faltando += 1;
          // Grava a marca na hora: e ela que a tela le para dizer QUANTOS e
          // QUAIS arquivos sumiram, sem tentar ler os bytes de todos de novo.
          await deposito.salvar({ ...item, fotos: atualizadas, estado: "enviando" });
          continue;
        }
        await transporte.enviarBytes(autorizacao.url, autorizacao.cabecalhos, corpo);
        await transporte.confirmarFoto(autorizacao.evidenciaId);
        enviadasAgora += 1;
      }

      atualizadas[i] = {
        ...foto,
        chave: autorizacao.chave,
        evidenciaId: autorizacao.evidenciaId,
        enviada: true,
        perdida: false,
      };
      // Grava a cada foto: e o que torna a retomada possivel.
      await deposito.salvar({ ...item, fotos: atualizadas, estado: "enviando" });
    }

    /*
      Alguma ausencia NOVA: o item volta a bloquear, mesmo que ja houvesse
      consentimento para as anteriores. Consentimento dado sobre duas fotos nao
      e consentimento sobre a terceira, e a tela precisa perguntar de novo com o
      numero certo.
    */
    if (faltando > 0) {
      throw new FalhaPermanente(
        /*
          A frase termina numa ACAO, e agora ela existe.

          Antes desta mudanca nao havia saida nenhuma: a coleta ficava bloqueada
          para sempre e a orientacao possivel era avisar a coordenacao. Hoje o
          agente pode enviar a vistoria sem o arquivo, e a frase precisa dizer
          isso, senao a saida existe no motor e nao existe para quem esta na rua.
        */
        (faltando === 1
          ? "Um registro desta vistoria não está mais neste aparelho, então ela não "
            + "pode ser enviada inteira. "
          : `${faltando} registros desta vistoria não estão mais neste aparelho, então ela `
            + "não pode ser enviada inteira. ")
        + "Você pode enviar a vistoria sem eles: o laudo vai declarar que houve "
        + "registro capturado em campo que não pôde ser recuperado.",
        CODIGO_ARQUIVO_SUMIU,
      );
    }

    /*
      O envelope é remontado a partir do que o servidor devolveu, e não do que
      o aparelho achava. A assinatura sai da lista de fotos e vai para o campo
      dela: no laudo, uma é o registro fotográfico e a outra é o traço acima
      da linha de assinatura.
    */
    const assinatura = atualizadas.find((f) => f.papel === "assinatura");
    /*
      O QUE FOI CAPTURADO E NAO SOBE, declarado no envelope.

      Esta lista e a razao de a coleta poder subir sem o arquivo. Sem ela o
      servidor gravaria uma vistoria com tres fotos sem nada dizendo que havia
      cinco, e o laudo sairia parecendo completo: pior do que nao sair.

      A assinatura entra aqui com o papel dela, e nao como "mais uma foto". Se o
      arquivo perdido for o traco da moradora, `assinaturaChave` fica nula e o
      laudo imprime uma linha de assinatura em branco, indistinguivel de uma
      vistoria em que ninguem assinou: e a lacuna mais grave que o documento
      pode ter, e a unica que ele nao saberia nomear sem esta marca.

      O metadado viaja junto porque ele SOBREVIVEU ao arquivo: legenda e
      coordenada vivem aqui na fila, nao dentro da imagem. E o que resta da
      prova, e e a diferenca entre o laudo dizer "uma fotografia se perdeu" e
      dizer qual fotografia, de onde e de que hora.
    */
    const perdidas = atualizadas
      .filter((f) => f.perdida && !f.enviada)
      .map((f) => ({
        idempotencyKey: f.idempotencyKey,
        capturadaEm: f.capturadaEm,
        papel: f.papel,
        ...(f.legenda ? { legenda: f.legenda } : {}),
        ...(f.coordenada ? { coordenada: f.coordenada } : {}),
      }));

    const envelope: EnvelopeSincronizacao = {
      ...item.envelope,
      vistoria: {
        ...item.envelope.vistoria,
        assinaturaChave: assinatura?.chave ?? item.envelope.vistoria.assinaturaChave,
        fotos: atualizadas
          .filter((f) => f.papel !== "assinatura" && !f.perdida)
          .map((f) => ({
            chave: f.chave!,
            capturadaEm: f.capturadaEm,
            ...(f.legenda ? { legenda: f.legenda } : {}),
            ...(f.coordenada ? { coordenada: f.coordenada } : {}),
          })),
        /*
          Ausente quando nada se perdeu, e nao uma lista vazia. O campo e
          opcional no contrato justamente para o aparelho antigo nao mandar
          nada; mandar `[]` sempre faria toda coleta carregar a afirmacao de que
          houve conferencia de perda, inclusive as que nunca perderam nada.
        */
        ...(perdidas.length > 0 ? { evidenciasPerdidas: perdidas } : {}),
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
   * O agente decide subir a coleta SEM os arquivos que se perderam.
   *
   * ## Quem decide, e por que não é o aplicativo
   *
   * Este verbo existe porque a alternativa automática está errada. O dreno
   * poderia desistir do arquivo depois de N tentativas, e isso seria uma
   * decisão de máquina sobre o conteúdo de um documento com brasão: o laudo
   * passa a declarar que houve registro fotográfico que não pôde ser
   * recuperado, e a trilha guarda essa declaração para sempre, porque ela é
   * append-only. Quem responde pela vistoria é quem esteve no local.
   *
   * E N tentativas não seria critério nem tecnicamente: arquivo apagado não
   * volta, a falha já é permanente na primeira leitura, e o número só daria
   * cara de automático a uma escolha que continua sendo escolha.
   *
   * O que o aplicativo faz sozinho é o que ele pode provar: descobrir QUAIS
   * arquivos sumiram, marcá-los no disco, e parar de repetir para sempre uma
   * leitura que nunca vai dar certo. A pergunta fica para a pessoa.
   *
   * ## O portão: só sai o que realmente acabou
   *
   * Só libera item de vistoria, bloqueado, com o código `arquivo_sumiu` na
   * última falha e com ao menos um arquivo marcado. A restrição não é
   * burocracia: sem ela, o mesmo botão serviria para jogar fora uma foto que
   * está inteira no aparelho e só não subiu porque o sinal caiu, e a prova de
   * uma interdição sairia do processo por causa de um toque num dia ruim.
   *
   * Devolve quantas perdas o agente assumiu, para a tela poder confirmar o
   * número que ela mostrou antes de perguntar.
   */
  async function abrirMaoDasEvidenciasPerdidas(
    id: string,
  ): Promise<{ liberado: boolean; perdidas: number }> {
    const item = (await deposito.listar()).find((i) => i.id === id);
    if (!item || item.tipo !== "vistoria") return { liberado: false, perdidas: 0 };
    if (item.estado !== "bloqueado") return { liberado: false, perdidas: 0 };
    if (item.ultimaFalha?.codigo !== CODIGO_ARQUIVO_SUMIU) {
      return { liberado: false, perdidas: 0 };
    }

    const perdidas = item.fotos.filter((f) => f.perdida && !f.enviada).length;
    if (perdidas === 0) return { liberado: false, perdidas: 0 };

    await deposito.salvar({
      ...item,
      abriuMaoDasPerdidas: true,
      estado: "pendente",
      tentativas: 0,
      liberadoEm: agora().toISOString(),
      ultimaFalha: null,
    });
    await avisar();
    return { liberado: true, perdidas };
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
    enfileirarDevolucao,
    drenar,
    cancelar,
    reenviar,
    assumir,
    abrirMaoDasEvidenciasPerdidas,
    descartar,
    itens,
    resumo,
    assinar,
    aguardarProximaJanela,
  };
}

export type FilaDeSincronizacao = ReturnType<typeof criarFilaDeSincronizacao>;
