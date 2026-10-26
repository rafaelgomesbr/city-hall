import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { Config } from "../config.js";
import { comTempoLimite, type Buscar } from "../push/fcm.js";

/**
 * O CAMINHO POR RUAS, a pedido do agente, traçado pelo Google a partir daqui.
 *
 * ## Por que esta rota existe, e por que ela mora no servidor
 *
 * O reclame de quem paga, na letra: "o mapa mostra o ponto que tem uma
 * ocorrência e só isso, não mostra a rota, o tempo pra chegar, como se fosse
 * um GPS". Decidido com ele, com o custo na mesa: rota e tempo SÓ quando o
 * agente pedir, num botão ("Ver o caminho", na tela do mapa), com cache para
 * não repetir.
 *
 * O aplicativo não chama o Google diretamente, e não é escolha de arquitetura:
 * é impossibilidade. A chave que o binário carrega é restrita a Apps iOS ou a
 * Apps Android (o console do Google aceita um tipo de restrição por chave), e
 * o Google recusa essa chave numa chamada HTTP. A chave que serve para HTTP
 * (`ROUTES_KEY`) é de servidor, restrita por endereço IP, e quem a tiver gasta
 * a conta do município de qualquer lugar do mundo. Ela é segredo de verdade,
 * ao contrário da chave do mapa, e por isso NUNCA sai deste processo: vai no
 * cabeçalho do pedido ao Google e em lugar nenhum mais.
 *
 * ## O que sai daqui para o Google
 *
 * Dois pontos e um modo de viagem. A posição do agente (arredondada a três
 * casas decimais, ver `CASAS_DA_ORIGEM`), a coordenada do imóvel e `DRIVE`.
 * Nem endereço, nem protocolo, nem nome, nem identificador de ocorrência: o
 * corpo do pedido é montado campo a campo, e o teste confere que ele tem
 * exatamente três chaves. É a quarta saída de coordenada descrita em
 * `docs/SUBPROCESSADORES.md` seção 2.2, e ela só acontece no toque.
 *
 * ## O que NÃO fica aqui: nada
 *
 * A rota é RESPOSTA, não registro. Nenhuma coordenada vai para o banco, nem
 * para o log, nem para tabela de estatística. A posição do agente é dado sobre
 * um servidor público identificável, e um histórico de "de onde ele pediu
 * caminho às 14h32" seria um rastro de deslocamento que a declaração nas lojas
 * promete que não existe (`docs/DECLARACAO-NAS-LOJAS.md`, seção 2). O
 * serializador de `req` em `servidor.ts` já não registra corpo, e
 * `test/rota.test.ts` lê o log para provar que continua assim.
 *
 * A cache abaixo NÃO contradiz isso, e a diferença precisa estar escrita: ela
 * é memória do processo, morre no reinício, não é consultável por ninguém e
 * existe para o mesmo toque não custar duas vezes. É cache, não registro.
 */

/**
 * O endereço da Routes API, versão 2.
 *
 * `computeRoutes` e não a Directions API antiga (`maps/api/directions`), que o
 * Google colocou em modo de manutenção em 2025 e que o portão do mapa do
 * aplicativo já proibia. Este é o único arquivo do repositório em que o portão
 * permite citar o serviço, e ele mede isso.
 */
export const ENDERECO_DA_ROUTES_API = "https://routes.googleapis.com/directions/v2:computeRoutes";

/**
 * A máscara de campos: a lista FECHADA do que a resposta usa.
 *
 * A Routes API cobra por nível de campo ("Basic", "Advanced", "Preferred"), e
 * `*` pede tudo, no nível mais caro, para trazer instruções passo a passo,
 * avisos e trechos que o aplicativo não desenha. Três campos bastam para a
 * frase "cerca de 14 min de carro, 4,2 km" e para a linha no mapa, e são os
 * três do nível básico.
 */
export const CAMPOS_PEDIDOS_AO_GOOGLE =
  "routes.duration,routes.distanceMeters,routes.polyline.encodedPolyline";

/**
 * Quanto tempo uma resposta vale, por par de pontos.
 *
 * Rua interditada de manhã está livre à tarde, e a estimativa de tempo
 * envelhece; vinte e quatro horas é o teto. Abaixo disso, reperguntar custa
 * dinheiro para comprar uma precisão que o agente, dentro do carro, não
 * consegue usar.
 */
export const VALIDADE_DA_CACHE_MS = 24 * 60 * 60 * 1000;

/**
 * Casas decimais da ORIGEM, na chave da cache E no que vai ao Google. Três é
 * cerca de 111 metros.
 *
 * Na cache: o agente parado no carro tem o GPS oscilando dez metros a cada
 * leitura, e o aplicativo relê a posição a cada foco da tela. Sem o
 * arredondamento, cada oscilação seria um par novo e uma chamada nova, para
 * uma rota idêntica.
 *
 * No pedido ao Google: é a posição de um servidor público identificável
 * saindo do país, e cem metros de granularidade bastam para um caminho de
 * carro (o Google encaixa o início na rua mais próxima de qualquer jeito). O
 * que não é preciso não precisa sair, e é o que `docs/SUBPROCESSADORES.md`
 * seção 2.2 declara.
 *
 * O destino NÃO é arredondado: ele é a coordenada gravada do imóvel, que não
 * oscila, e arredondá-lo trocaria a casa por uma vizinha, na chave e no
 * caminho.
 */
const CASAS_DA_ORIGEM = 3;

/** A origem como ela sai daqui: arredondada. Exportada para o teste conferir. */
export function origemArredondada(origem: Ponto): Ponto {
  return {
    latitude: Number(origem.latitude.toFixed(CASAS_DA_ORIGEM)),
    longitude: Number(origem.longitude.toFixed(CASAS_DA_ORIGEM)),
  };
}

/**
 * Quantos pares a cache guarda antes de esquecer o mais velho.
 *
 * A cache é memória do processo, e memória sem teto é um vazamento com nome
 * bonito. Dois mil pares é mais do que um município pede num dia (cada agente
 * pede um punhado por turno), e cabe em menos de um megabyte.
 */
const TETO_DA_CACHE = 2000;

/** Teto por chamada ao Google, o mesmo dos dez segundos do push. */
const TEMPO_LIMITE_MS = 10_000;

const pontoSchema = z.object({
  latitude: z.number().finite().min(-90).max(90),
  longitude: z.number().finite().min(-180).max(180),
}).refine(
  /*
    A ilha nula. É o que o GPS devolve antes de fixar, e o aplicativo já a
    recusa (`pontoQueSeMede`). Recusar aqui também é o que impede um cliente
    antigo, ou um erro de cliente, de comprar uma rota de seis mil quilômetros
    a partir do golfo da Guiné.
  */
  (p) => !(p.latitude === 0 && p.longitude === 0),
  { message: "A coordenada 0,0 não é um lugar." },
);

export const pedidoSchema = z.object({
  origem: pontoSchema,
  destino: pontoSchema,
});

export type Ponto = z.infer<typeof pontoSchema>;

/** O que o aplicativo recebe. */
export type CaminhoTracado = {
  duracaoSegundos: number;
  distanciaMetros: number;
  /** Codificada no formato de polilinha do Google; o aplicativo decodifica. */
  polilinha: string;
};

const RESPOSTA_DESLIGADA = {
  erro: "caminho_desligado",
  mensagem:
    "O seu município não ligou o caminho por ruas neste servidor. A distância e o "
    + "rumo em linha reta continuam valendo.",
} as const;

const RESPOSTA_INDISPONIVEL = {
  erro: "caminho_indisponivel",
  mensagem:
    "Não deu para traçar o caminho agora. A distância e o rumo em linha reta "
    + "continuam valendo.",
} as const;

/**
 * Lê a resposta do Google e tira dela só o que o aplicativo usa.
 *
 * `duration` vem como texto terminado em `s` ("846s"), e é assim mesmo na
 * documentação. Qualquer coisa fora da forma esperada é `null`, e `null` vira
 * 502: uma resposta que não tem rota não é uma rota vazia, é o Google não
 * conseguindo traçar (ponto no mar, chave sem a API habilitada, região sem
 * cobertura), e o aplicativo precisa dizer isso em vez de desenhar nada.
 */
export function lerRespostaDoGoogle(corpo: unknown): CaminhoTracado | null {
  if (!corpo || typeof corpo !== "object") return null;
  const rotas = (corpo as { routes?: unknown }).routes;
  if (!Array.isArray(rotas) || rotas.length === 0) return null;
  const rota = rotas[0] as {
    duration?: unknown; distanceMeters?: unknown; polyline?: { encodedPolyline?: unknown };
  };
  const duracao = typeof rota.duration === "string" ? /^(\d+)s$/.exec(rota.duration) : null;
  const polilinha = rota.polyline?.encodedPolyline;
  if (!duracao || typeof rota.distanceMeters !== "number" || typeof polilinha !== "string") {
    return null;
  }
  if (polilinha.length === 0) return null;
  return {
    duracaoSegundos: Number(duracao[1]),
    distanciaMetros: rota.distanceMeters,
    polilinha,
  };
}

/**
 * A chave da cache: origem arredondada, destino inteiro.
 *
 * `toFixed` e não `Math.round` sobre o número: o texto é a chave, e dois
 * números que arredondam para o mesmo valor precisam produzir o mesmo texto,
 * sem lixo de ponto flutuante no fim.
 */
export function chaveDaCache(origem: Ponto, destino: Ponto): string {
  const o = `${origem.latitude.toFixed(CASAS_DA_ORIGEM)},${origem.longitude.toFixed(CASAS_DA_ORIGEM)}`;
  const d = `${destino.latitude},${destino.longitude}`;
  return `${o}|${d}`;
}

export type OpcoesDaRota = {
  config: Config;
  /** Só o teste passa: um dublê no lugar do `fetch`. */
  buscar?: Buscar;
  /** Só o teste passa: o relógio da cache. */
  agora?: () => number;
};

export async function rotasRota(
  app: FastifyInstance,
  { config, buscar: buscarInjetado, agora = () => Date.now() }: OpcoesDaRota,
): Promise<void> {
  const chave = config.ROUTES_KEY;
  const buscar = comTempoLimite(buscarInjetado ?? ((url, o) => fetch(url, o)), TEMPO_LIMITE_MS);

  /*
    A CACHE, em memória do processo. Ver o cabeçalho: é cache, não registro.

    `Map` preserva a ordem de inserção, então o primeiro da lista é sempre o
    mais velho, e o teto se aplica tirando dele. Não há varredura periódica:
    par vencido é descartado na leitura, e o teto cuida do resto.
  */
  const cache = new Map<string, { resposta: CaminhoTracado; venceEm: number }>();

  const lembrar = (id: string, resposta: CaminhoTracado): void => {
    cache.set(id, { resposta, venceEm: agora() + VALIDADE_DA_CACHE_MS });
    while (cache.size > TETO_DA_CACHE) {
      const maisVelho = cache.keys().next().value;
      if (maisVelho === undefined) break;
      cache.delete(maisVelho);
    }
  };

  const lembrado = (id: string): CaminhoTracado | null => {
    const guardado = cache.get(id);
    if (!guardado) return null;
    if (guardado.venceEm <= agora()) {
      cache.delete(id);
      return null;
    }
    return guardado.resposta;
  };

  /**
   * Limite próprio, mais apertado que o global, porque cada chamada que passa
   * da cache custa dinheiro ao município. Trinta por minuto por pessoa é muito
   * mais do que um agente consegue tocar num botão, e é pouco o bastante para
   * um cliente com defeito não virar uma fatura. A chave do balde é a mesma do
   * limitador global (usuário do token verificado), então um agente com o
   * dedo preso não atrapalha o colega.
   */
  const limite = { config: { rateLimit: { max: 30, timeWindow: "1 minute" } } };

  app.post("/", limite, async (req, resposta) => {
    /*
      A autenticação vem ANTES da checagem de desligado, pela mesma razão das
      rotas de aparelho: responder 503 a quem não tem token transformaria a
      rota num jeito de descobrir, de fora, qual município ligou o caminho.
    */
    await app.exigirAutenticacao(req);
    if (!chave) return resposta.code(503).send(RESPOSTA_DESLIGADA);

    const { origem: origemLida, destino } = pedidoSchema.parse(req.body);
    const origem = origemArredondada(origemLida);
    const id = chaveDaCache(origem, destino);

    const guardada = lembrado(id);
    if (guardada) return guardada;

    let corpo: string;
    let status: number;
    try {
      const r = await buscar(ENDERECO_DA_ROUTES_API, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Goog-Api-Key": chave,
          "X-Goog-FieldMask": CAMPOS_PEDIDOS_AO_GOOGLE,
        },
        /*
          Campo a campo, e nada além dos três. É o que o teste confere e é o
          que `docs/SUBPROCESSADORES.md` declara: dois pontos e um modo de
          viagem saem daqui, e mais nada.
        */
        body: JSON.stringify({
          origin: { location: { latLng: { latitude: origem.latitude, longitude: origem.longitude } } },
          destination: { location: { latLng: { latitude: destino.latitude, longitude: destino.longitude } } },
          travelMode: "DRIVE",
        }),
      });
      status = r.status;
      corpo = await r.text();
    } catch {
      /*
        Tempo esgotado ou rede recusada. A exceção NÃO vai para o log com o
        pedido junto: o `err` do Fastify registraria a mensagem, e a mensagem
        do `fetch` pode carregar a URL com o corpo. O que se registra é só o
        fato, sem coordenada.
      */
      req.log.warn("a Routes API do Google nao respondeu ao pedido de caminho");
      return resposta.code(502).send(RESPOSTA_INDISPONIVEL);
    }

    if (status !== 200) {
      /*
        A mensagem do Google fica AQUI, no log, e só o status: ela pode citar
        a chave ("API key not valid") e o corpo do pedido. O aplicativo recebe
        uma frase nossa, e a frase diz o que o agente pode fazer.
      */
      req.log.warn({ status }, "a Routes API do Google recusou o pedido de caminho");
      return resposta.code(502).send(RESPOSTA_INDISPONIVEL);
    }

    let lido: CaminhoTracado | null = null;
    try {
      lido = lerRespostaDoGoogle(JSON.parse(corpo));
    } catch {
      lido = null;
    }
    if (!lido) {
      req.log.warn("a Routes API do Google respondeu sem rota");
      return resposta.code(502).send(RESPOSTA_INDISPONIVEL);
    }

    lembrar(id, lido);
    return lido;
  });
}
