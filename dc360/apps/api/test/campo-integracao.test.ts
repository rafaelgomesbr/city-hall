import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  criarFilaDeSincronizacao,
  depositoSobreChaveValor,
  lojaEmMemoria,
  transporteHttp,
  type ChaveValor,
} from "@dc360/campo";
import { bancoEmMemoria, type BancoEmMemoria } from "../src/banco/memoria.js";
import { carregarConfig } from "../src/config.js";
import { construirServidor } from "../src/servidor.js";
import { armazenamentoEmMemoria } from "../src/armazenamento/memoria.js";

/**
 * A fila do aplicativo de campo contra a API de verdade.
 *
 * Os testes do pacote `@dc360/campo` usam um transporte falso, então provam a
 * lógica da fila mas não provam que ela conversa com este servidor. Os testes
 * da API usam requisições montadas à mão, então provam o servidor mas não
 * provam o cliente. O caminho que o agente percorre de verdade só é exercitado
 * quando os dois se encontram, sobre HTTP real, com Postgres embaixo.
 *
 * É aqui que a promessa central do produto é conferida ponta a ponta: a mesma
 * coleta reenviada quantas vezes for vira UM laudo.
 */

const SENHA = "defesa-civil-2026";
const AGENTE = "diego.alves@serraalta.exemplo.gov.br";

let mem: BancoEmMemoria;
let app: FastifyInstance;
let endereco: string;
let tokenAcesso: string;
let tokenCoordenador: string;

const EQUIPE_ALFA = "11111111-1111-4111-8111-0000000000e1";

/** Loja com contador, para enxergar o que a fila realmente persistiu. */
function lojaObservavel(): ChaveValor & { escritas: number } {
  const interna = lojaEmMemoria();
  const observada = {
    escritas: 0,
    ler: interna.ler,
    escrever: async (c: string, v: string) => {
      observada.escritas += 1;
      await interna.escrever(c, v);
    },
    remover: interna.remover,
    chaves: interna.chaves,
  };
  return observada;
}

function montarFila(loja: ChaveValor) {
  return criarFilaDeSincronizacao({
    deposito: depositoSobreChaveValor(loja),
    transporte: transporteHttp({
      baseUrl: endereco,
      obterToken: async () => tokenAcesso,
    }),
    dormir: async () => undefined,
  });
}

/**
 * Cada teste precisa da própria ocorrência despachada.
 *
 * Reaproveitar a mesma não funcionaria, e isso é comportamento correto do
 * produto: assim que a vistoria sobe, a ocorrência sai de "em campo" e some
 * da lista de pendências do agente. Então a preparação segue o caminho real,
 * pela API, como o coordenador faria: registrar, classificar e despachar.
 */
async function prepararOcorrenciaEmCampo(
  endereco: string,
): Promise<{ id: string; protocolo: string }> {
  const comCoordenador = { authorization: `Bearer ${tokenCoordenador}` };

  const criar = await app.inject({
    method: "POST", url: "/ocorrencias", headers: comCoordenador,
    payload: {
      solicitanteNome: "Marilda Souza Prado", canalEntrada: "telefone",
      endereco, tipo: "deslizamento",
      descricao: "Talude cedeu depois da chuva da madrugada.",
    },
  });
  if (criar.statusCode !== 201) throw new Error(`abertura falhou: ${criar.body}`);
  const { id, protocolo } = criar.json();

  const triagem = await app.inject({
    method: "POST", url: `/ocorrencias/${id}/triagem`, headers: comCoordenador,
    payload: { severidade: "alta", vulnerabilidadePresente: false },
  });
  if (triagem.statusCode !== 200) throw new Error(`triagem falhou: ${triagem.body}`);

  const despacho = await app.inject({
    method: "POST", url: `/ocorrencias/${id}/despacho`, headers: comCoordenador,
    payload: { equipeId: EQUIPE_ALFA, prazoHoras: 24 },
  });
  if (despacho.statusCode !== 200) throw new Error(`despacho falhou: ${despacho.body}`);

  return { id, protocolo };
}

/** Confere que a ocorrência preparada realmente chega ao agente pelo app. */
async function pendenciasDoAgente(): Promise<Array<{ id: string; protocolo: string }>> {
  const r = await app.inject({
    method: "GET", url: "/sincronizacao/pendencias",
    headers: { authorization: `Bearer ${tokenAcesso}` },
  });
  return r.json().itens;
}

function envelopeDe(ocorrenciaId: string, chave: string) {
  const coletadaEm = new Date(Date.now() - 3_600_000).toISOString();
  return {
    idempotencyKey: chave,
    ocorrenciaId,
    coletadaEm,
    vistoria: {
      checklist: [
        { chave: "risco_iminente", resposta: true },
        { chave: "interdicao_indicada", resposta: true },
      ],
      fotos: [
        { chave: "foto-1.jpg", capturadaEm: coletadaEm, legenda: "Trinca na parede dos fundos" },
      ],
      gpsPrecisaoMetros: 7.4,
      assinanteNome: "Marilda Souza Prado",
      assinaturaChave: "assinatura.png",
      coletadaEm,
      observacoes: "Coleta feita sem sinal, no alto do morro.",
    },
  };
}

beforeAll(async () => {
  mem = await bancoEmMemoria({ semear: true });
  const config = carregarConfig({
    NODE_ENV: "test",
    JWT_SEGREDO: "segredo-de-integracao-com-mais-de-trinta-e-dois",
    LOGIN_POR_IP: "10000",
  } as NodeJS.ProcessEnv);

  app = await construirServidor({
    banco: mem.banco, config,
    armazenamento: armazenamentoEmMemoria({ baseUrl: "http://127.0.0.1:0" }),
  });
  // Servidor de verdade numa porta efêmera: o transporte usa `fetch`, então
  // requisição injetada não serviria.
  await app.listen({ port: 0, host: "127.0.0.1" });
  const info = app.server.address();
  if (!info || typeof info === "string") throw new Error("nao foi possivel obter a porta");
  endereco = `http://127.0.0.1:${info.port}`;

  const entrada = await app.inject({
    method: "POST", url: "/auth/entrar", payload: { email: AGENTE, senha: SENHA },
  });
  if (entrada.statusCode !== 200) throw new Error(`login do agente falhou: ${entrada.body}`);
  tokenAcesso = entrada.json().acesso;

  const coordenador = await app.inject({
    method: "POST", url: "/auth/entrar",
    payload: { email: "helena.coutinho@serraalta.exemplo.gov.br", senha: SENHA },
  });
  if (coordenador.statusCode !== 200) throw new Error(`login do coordenador falhou: ${coordenador.body}`);
  tokenCoordenador = coordenador.json().acesso;
}, 180_000);

afterAll(async () => {
  await app?.close();
  await mem?.banco.encerrar();
});

describe("Fila de campo contra a API", () => {
  it("uma coleta offline sobe e vira laudo com as duas marcas de tempo", async () => {
    const alvo = await prepararOcorrenciaEmCampo("Rua das Acácias, 245, Morro do Cruzeiro");

    // A ocorrência despachada aparece de verdade na lista que o app baixa.
    const pendencias = await pendenciasDoAgente();
    expect(pendencias.map((p) => p.id)).toContain(alvo.id);

    const chave = "aaaaaaaa-0000-4000-8000-000000000001";
    const fila = montarFila(lojaEmMemoria());

    await fila.enfileirar(envelopeDe(alvo.id, chave), { protocolo: alvo.protocolo });
    const r = await fila.drenar();

    expect(r.enviados).toBe(1);
    expect(r.interrompido).toBe(false);

    const vistoria = await mem.bruto.query<{
      coletada_em: string; sincronizada_em: string; assinante_nome: string;
    }>("SELECT coletada_em, sincronizada_em, assinante_nome FROM vistorias WHERE idempotency_key = $1", [chave]);

    expect(vistoria.rows).toHaveLength(1);
    expect(vistoria.rows[0]!.assinante_nome).toBe("Marilda Souza Prado");
    // Coleta e sincronização em instantes diferentes: é o que distingue uma
    // vistoria feita offline de uma digitada no escritório, e é o que o laudo
    // precisa mostrar para não parecer que foi feita quando o sinal voltou.
    expect(new Date(vistoria.rows[0]!.coletada_em).getTime())
      .toBeLessThan(new Date(vistoria.rows[0]!.sincronizada_em).getTime());
  }, 60_000);

  it("a mesma coleta enviada dez vezes vira um laudo só", async () => {
    const alvo = await prepararOcorrenciaEmCampo("Avenida Beira Rio, 1180, Centro");
    const chave = "aaaaaaaa-0000-4000-8000-000000000002";
    const envelope = envelopeDe(alvo.id, chave);

    // Dez filas independentes, como se o aplicativo tivesse sido reaberto dez
    // vezes com a coleta ainda pendente. A chave é a mesma nas dez.
    for (let i = 0; i < 10; i++) {
      const fila = montarFila(lojaEmMemoria());
      await fila.enfileirar(envelope, { protocolo: alvo.protocolo });
      await fila.drenar();
    }

    const laudos = await mem.bruto.query<{ n: string }>(
      "SELECT count(*)::text AS n FROM vistorias WHERE idempotency_key = $1", [chave],
    );
    expect(laudos.rows[0]!.n).toBe("1");

    const eventos = await mem.bruto.query<{ n: string }>(
      `SELECT count(*)::text AS n FROM trilha_eventos
        WHERE ocorrencia_id = $1 AND tipo = 'vistoria'
          AND detalhe->>'assinante' = 'Marilda Souza Prado'`,
      [alvo.id],
    );
    // A trilha também não pode ganhar dez eventos de vistoria.
    expect(Number(eventos.rows[0]!.n)).toBeLessThanOrEqual(2);
  }, 120_000);

  it("as fotos entram com a chave de storage prefixada pelo município", async () => {
    const chave = "aaaaaaaa-0000-4000-8000-000000000001";
    const evidencias = await mem.bruto.query<{ chave_storage: string }>(
      `SELECT e.chave_storage FROM evidencias e
         JOIN vistorias v ON v.id = e.vistoria_id
        WHERE v.idempotency_key = $1`,
      [chave],
    );
    expect(evidencias.rows).toHaveLength(1);
    // O aparelho mandou "foto-1.jpg" e o servidor remontou a chave a partir da
    // organização do token: o cliente não escolhe onde o arquivo vai parar.
    expect(evidencias.rows[0]!.chave_storage).toMatch(/^tenant\/[0-9a-f-]{36}\/ocorrencias\//);
    expect(evidencias.rows[0]!.chave_storage).toContain("foto-1.jpg");
  });

  it("servidor fora do ar mantém a coleta na fila, e ela sobe quando ele volta", async () => {
    const alvo = await prepararOcorrenciaEmCampo("Travessa São Benedito, 57, Vila Operária");
    const chave = "aaaaaaaa-0000-4000-8000-000000000003";
    const loja = lojaEmMemoria();

    // Endereço que não responde: é o que o aparelho vê quando o servidor caiu.
    const filaSemServidor = criarFilaDeSincronizacao({
      deposito: depositoSobreChaveValor(loja),
      transporte: transporteHttp({
        baseUrl: "http://127.0.0.1:1",
        obterToken: async () => tokenAcesso,
        tempoLimiteMs: 2_000,
      }),
      dormir: async () => undefined,
    });

    await filaSemServidor.enfileirar(envelopeDe(alvo.id, chave), { protocolo: alvo.protocolo });
    const semServidor = await filaSemServidor.drenar();
    expect(semServidor.enviados).toBe(0);
    expect(semServidor.adiados).toBe(1);

    const nada = await mem.bruto.query<{ n: string }>(
      "SELECT count(*)::text AS n FROM vistorias WHERE idempotency_key = $1", [chave],
    );
    expect(nada.rows[0]!.n, "nada pode ter chegado ao banco").toBe("0");

    // O servidor volta. A coleta continua guardada, com a mesma chave.
    const filaComServidor = criarFilaDeSincronizacao({
      deposito: depositoSobreChaveValor(loja),
      transporte: transporteHttp({ baseUrl: endereco, obterToken: async () => tokenAcesso }),
      dormir: async () => undefined,
      // O item ficou com janela de espera: no aparelho isso é minutos, aqui
      // adiantamos o relógio em vez de esperar.
      agora: () => new Date(Date.now() + 10 * 60_000),
    });
    const comServidor = await filaComServidor.drenar();
    expect(comServidor.enviados).toBe(1);

    const gravada = await mem.bruto.query<{ n: string }>(
      "SELECT count(*)::text AS n FROM vistorias WHERE idempotency_key = $1", [chave],
    );
    expect(gravada.rows[0]!.n).toBe("1");
  }, 120_000);

  it("token vencido bloqueia o item em vez de martelar o login do agente", async () => {
    const alvo = await prepararOcorrenciaEmCampo("Rua Doutor Peixoto, 909, Jardim Bela Vista");
    const chave = "aaaaaaaa-0000-4000-8000-000000000004";

    const fila = criarFilaDeSincronizacao({
      deposito: depositoSobreChaveValor(lojaEmMemoria()),
      transporte: transporteHttp({
        baseUrl: endereco,
        obterToken: async () => "token.completamente.invalido",
      }),
      dormir: async () => undefined,
    });

    await fila.enfileirar(envelopeDe(alvo.id, chave), { protocolo: alvo.protocolo });
    const r = await fila.drenar();

    // Insistir com token morto estouraria o limite de tentativas e bloquearia
    // a conta de quem está trabalhando em campo.
    expect(r.bloqueados).toBe(1);
    expect((await fila.itens())[0]!.tentativas).toBe(1);
  }, 60_000);

  it("papel sem permissão bloqueia sem gastar bateria repetindo", async () => {
    const alvo = await prepararOcorrenciaEmCampo("Rua Ribeirão Fundo, 402, Bairro Nossa Senhora");
    const chave = "aaaaaaaa-0000-4000-8000-000000000005";

    const fila = criarFilaDeSincronizacao({
      deposito: depositoSobreChaveValor(lojaEmMemoria()),
      transporte: transporteHttp({
        baseUrl: endereco,
        obterToken: async () => tokenCoordenador,
      }),
      dormir: async () => undefined,
    });

    await fila.enfileirar(envelopeDe(alvo.id, chave), { protocolo: alvo.protocolo });
    const r = await fila.drenar();

    expect(r.bloqueados).toBe(1);
    expect((await fila.itens())[0]!.ultimoErro).toContain("permissão");
  }, 60_000);

  it("cada envio grava uma vez só no armazenamento local", async () => {
    const alvo = await prepararOcorrenciaEmCampo("Rua das Palmeiras, 88, Jardim Bela Vista");
    const loja = lojaObservavel();
    const fila = montarFila(loja);

    await fila.enfileirar(envelopeDe(alvo.id, "aaaaaaaa-0000-4000-8000-000000000006"), {
      protocolo: alvo.protocolo,
    });
    const antes = loja.escritas;
    await fila.drenar();

    // Enfileirar, marcar como enviando e confirmar: três escritas. Se este
    // número disparar, a fila está gravando em laço, e em aparelho de campo
    // isso é bateria e desgaste de memória flash.
    expect(loja.escritas - antes).toBeLessThanOrEqual(3);
  }, 60_000);
});
