import type { FastifyInstance } from "fastify";
import { SignJWT } from "jose";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  criarFilaDeSincronizacao,
  depositoSobreChaveValor,
  lojaEmMemoria,
  transporteHttp,
  type ChaveValor,
  type ObterToken,
} from "@dc360/campo";
import { armazenamentoEmMemoria } from "../src/armazenamento/memoria.js";
import { bancoEmMemoria, type BancoEmMemoria } from "../src/banco/memoria.js";
import { carregarConfig } from "../src/config.js";
import { construirServidor } from "../src/servidor.js";

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
const HASH_DA_SEMENTE =
  "scrypt$131072$8$1$56BVGGGziTxmINg0pEIjxw$F-aIq495xKVd9OKClsyKAFxxLHj26KkyKIWFMFAnBwk";
const AGENTE = "diego.alves@serraalta.exemplo.gov.br";

let mem: BancoEmMemoria;
let app: FastifyInstance;
let endereco: string;
let tokenAcesso: string;
let tokenCoordenador: string;

const EQUIPE_ALFA = "11111111-1111-4111-8111-0000000000e1";

/**
 * Quem está com a sessão aberta no aparelho.
 *
 * A fila passou a exigir isto (`sessaoAtual` em `packages/campo/src/fila.ts`):
 * item coletado por um agente não sobe com a credencial de quem estiver logado
 * depois. Aqui é sempre o mesmo agente, porque é a sessão dele que o
 * `transporteHttp` acima carrega no token.
 */
const SESSAO_DO_DIEGO = {
  usuarioId: "11111111-1111-4111-8111-0000000000d3",
  nome: "Diego Nakamura Alves",
  organizacaoId: "11111111-1111-4111-8111-000000000001",
};

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
    sessaoAtual: () => SESSAO_DO_DIEGO,
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
  /*
    O chamado nasce com um dia de idade. A coleta desta suíte é datada de
    antes do envio, para o laudo ter as duas marcas de tempo, e a rota recusa
    coleta anterior à abertura do chamado (`data_implausivel`): a vistoria não
    pode ter acontecido antes de o chamado existir.
  */
  await mem.bruto.query(
    "UPDATE ocorrencias SET criado_em = now() - interval '1 day' WHERE id = $1", [id],
  );

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
        { chave: "evacuacao_necessaria", resposta: false },
        { chave: "acionar_outro_orgao", resposta: false },
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

  /**
   * O armazenamento local monta a URL a partir do endereço público, que só é
   * conhecido depois do `listen`. Como o teste usa `fetch` de verdade, uma URL
   * com porta errada faria o envio bater em outro processo.
   */
  const enderecoTardio = { valor: "" };
  const armazenamento = armazenamentoEmMemoria({ baseUrl: () => enderecoTardio.valor });

  app = await construirServidor({ banco: mem.banco, config, armazenamento });
  // Servidor de verdade numa porta efêmera: o transporte usa `fetch`, então
  // requisição injetada não serviria.
  await app.listen({ port: 0, host: "127.0.0.1" });
  const info = app.server.address();
  if (!info || typeof info === "string") throw new Error("nao foi possivel obter a porta");
  endereco = `http://127.0.0.1:${info.port}`;
  enderecoTardio.valor = endereco;

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

    // Pela chave de idempotência, que é o que o evento carrega desde que o
    // nome do assinante saiu do detalhe (nome de pessoa não entra em registro
    // append-only).
    const eventos = await mem.bruto.query<{ n: string }>(
      `SELECT count(*)::text AS n FROM trilha_eventos
        WHERE ocorrencia_id = $1 AND tipo = 'vistoria'
          AND detalhe->>'idempotencyKey' = $2`,
      [alvo.id, chave],
    );
    // A trilha também não pode ganhar dez eventos de vistoria.
    expect(Number(eventos.rows[0]!.n)).toBe(1);
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
      sessaoAtual: () => SESSAO_DO_DIEGO,
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
      sessaoAtual: () => SESSAO_DO_DIEGO,
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

  it("token recusado e sem renovação possível pausa a fila: o item NÃO é bloqueado nem descartado", async () => {
    /*
      Reescrito na V2-F00-E06 (decisão superada). O teste antigo afirmava que o
      token vencido BLOQUEAVA o item, para não martelar o login do agente. O
      motivo continua valendo e agora é cumprido sem perder a coleta: uma
      renovação por pedido, e a fila pausa. Os cenários de sessão encerrada e
      conta desativada contra a API real estão no bloco "Fila de campo quando a
      SESSÃO ou a CONTA cai", mais abaixo.
    */
    const alvo = await prepararOcorrenciaEmCampo("Rua Doutor Peixoto, 909, Jardim Bela Vista");
    const chave = "aaaaaaaa-0000-4000-8000-000000000004";

    const fila = criarFilaDeSincronizacao({
      deposito: depositoSobreChaveValor(lojaEmMemoria()),
      transporte: transporteHttp({
        baseUrl: endereco,
        obterToken: async () => "token.completamente.invalido",
      }),
      sessaoAtual: () => SESSAO_DO_DIEGO,
      dormir: async () => undefined,
    });

    await fila.enfileirar(envelopeDe(alvo.id, chave), { protocolo: alvo.protocolo });
    const r = await fila.drenar();

    expect(r.bloqueados).toBe(0);
    expect(r.paradaPor).toBe("sessao_encerrada");
    const [item] = await fila.itens();
    expect(item!.estado).toBe("pendente");
    expect(item!.tentativas).toBe(0);
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
      sessaoAtual: () => SESSAO_DO_DIEGO,
      dormir: async () => undefined,
    });

    await fila.enfileirar(envelopeDe(alvo.id, chave), { protocolo: alvo.protocolo });
    const r = await fila.drenar();

    expect(r.bloqueados).toBe(1);
    /*
      Lê `ultimaFalha.mensagem` e não mais `ultimoErro`: o motor de campo passou
      a guardar a falha inteira (código, mensagem e campos recusados) no lugar de
      uma string solta. A leitura aqui ficou para trás porque este arquivo vive
      em outro pacote, e o `tsc` da API não olha a pasta `test`, então nada
      acusou a troca até a suíte rodar.

      O código entra junto de propósito. Só a mensagem não distingue "o papel não
      pode" de qualquer outra recusa permanente, e é justamente essa separação
      que decide se o item fica bloqueado esperando alguém, ou se é arquivado.
    */
    const parado = (await fila.itens())[0]!;
    expect(parado.estado).toBe("bloqueado");
    expect(parado.ultimaFalha!.codigo).toBe("sem_permissao");
    expect(parado.ultimaFalha!.mensagem).toContain("permissão");
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

describe("Fila de campo quando a SESSÃO ou a CONTA cai (V2-F00-E06)", () => {
  /*
    O que se prova aqui é o que o roteiro de ponta a ponta do aparelho faria:
    o agente coleta no morro, a coordenação desativa a conta (ou a sessão cai)
    ANTES de o sinal voltar, e o dreno recebe 401 ou 403 do servidor de
    verdade. A vistoria nunca pode virar "recusada": ela fica no aparelho, e
    sobe com a mesma chave quando a pessoa volta.

    As respostas vêm da API real (catálogo de `@dc360/shared`), e não de um
    dublê: se a API mudar o código ou o status, estes casos reprovam.
  */
  const SEGREDO = "segredo-de-integracao-com-mais-de-trinta-e-dois";

  function filaCom(loja: ChaveValor, obterToken: ObterToken) {
    return criarFilaDeSincronizacao({
      deposito: depositoSobreChaveValor(loja),
      transporte: transporteHttp({ baseUrl: endereco, obterToken }),
      sessaoAtual: () => SESSAO_DO_DIEGO,
      dormir: async () => undefined,
    });
  }

  async function entrarComoAgente(): Promise<string> {
    const r = await app.inject({
      method: "POST", url: "/auth/entrar", payload: { email: AGENTE, senha: SENHA },
    });
    if (r.statusCode !== 200) throw new Error(`login do agente falhou: ${r.body}`);
    return r.json().acesso as string;
  }

  async function vistoriasComAChave(chave: string): Promise<number> {
    const r = await mem.bruto.query<{ n: string }>(
      "SELECT count(*)::text AS n FROM vistorias WHERE idempotency_key = $1", [chave],
    );
    return Number(r.rows[0]!.n);
  }

  it("conta desativada entre enfileirar e drenar: 403, o item fica no aparelho, e sobe depois da reativação", async () => {
    const alvo = await prepararOcorrenciaEmCampo("Rua das Hortênsias, 31, Alto da Serra");
    const chave = "bbbbbbbb-0000-4000-8000-000000000001";
    const loja = lojaEmMemoria();
    const token = await entrarComoAgente();
    const fila = filaCom(loja, async () => token);

    await fila.enfileirar(envelopeDe(alvo.id, chave), { protocolo: alvo.protocolo });

    // A coordenação desativa o agente, sem encerrar a sessão (o estado que a vigência pega sozinha).
    await mem.bruto.query("UPDATE usuarios SET ativo = false WHERE id = $1", [SESSAO_DO_DIEGO.usuarioId]);
    try {
      const r = await fila.drenar();

      expect(r.paradaPor).toBe("conta_desativada");
      expect(r.bloqueados).toBe(0);
      const [item] = await fila.itens();
      expect(item!.estado).toBe("pendente");
      expect(item!.tentativas).toBe(0);
      expect((await fila.resumo()).pausadaPor).toBe("conta_desativada");
      expect(await vistoriasComAChave(chave), "nada pode ter chegado ao banco").toBe(0);

      // A coordenação reativa; a pessoa entra de novo. A MESMA coleta sobe, uma vez só.
      await mem.bruto.query("UPDATE usuarios SET ativo = true WHERE id = $1", [SESSAO_DO_DIEGO.usuarioId]);
      const novaEntrada = await entrarComoAgente();
      const filaDepois = filaCom(loja, async () => novaEntrada);
      const subiu = await filaDepois.drenar();

      expect(subiu.enviados).toBe(1);
      expect(subiu.paradaPor).toBeUndefined();
      expect(await vistoriasComAChave(chave)).toBe(1);
    } finally {
      await mem.bruto.query("UPDATE usuarios SET ativo = true WHERE id = $1", [SESSAO_DO_DIEGO.usuarioId]);
    }
  }, 120_000);

  it("sessão encerrada por quem administra: 401 sessao_encerrada, item pendente, e sobe depois da nova entrada", async () => {
    const alvo = await prepararOcorrenciaEmCampo("Rua do Mirante, 77, Alto da Serra");
    const chave = "bbbbbbbb-0000-4000-8000-000000000002";
    const loja = lojaEmMemoria();
    const token = await entrarComoAgente();
    const sid = JSON.parse(Buffer.from(token.split(".")[1]!, "base64url").toString("utf8")).sid as string;
    const fila = filaCom(loja, async () => token);

    await fila.enfileirar(envelopeDe(alvo.id, chave), { protocolo: alvo.protocolo });
    // Só ESTA sessão cai: o token compartilhado dos outros testes segue vivo.
    await mem.bruto.query(
      "UPDATE sessoes SET revogada_em = now(), motivo_revogacao = 'encerrada por quem administra' WHERE id = $1",
      [sid],
    );

    const r = await fila.drenar();

    expect(r.paradaPor).toBe("sessao_encerrada");
    expect(r.bloqueados).toBe(0);
    const [item] = await fila.itens();
    expect(item!.estado).toBe("pendente");
    expect(item!.tentativas).toBe(0);
    expect(await vistoriasComAChave(chave)).toBe(0);

    const novaEntrada = await entrarComoAgente();
    const subiu = await filaCom(loja, async () => novaEntrada).drenar();
    expect(subiu.enviados).toBe(1);
    expect(await vistoriasComAChave(chave)).toBe(1);
  }, 120_000);

  it("senha redefinida por quem administra: a sessão velha pausa, a senha provisória pausa por outro motivo, e depois da troca a coleta sobe UMA vez", async () => {
    /*
      O roteiro ordinário de recuperação de conta, e o que a rodada 1 da
      validação provou que perdia dado: a coordenação redefine a senha (as
      sessões do agente caem), o agente entra com a senha provisória e o app
      dispara o dreno. Antes da correção, o 403 `troca_de_senha_obrigatoria`
      virava `FalhaPermanente`, o item ficava `bloqueado` e o cartão oferecia
      "Descartar" sobre uma coleta que o servidor nunca recebeu.
    */
    const alvo = await prepararOcorrenciaEmCampo("Rua das Bromélias, 52, Alto da Serra");
    const chave = "bbbbbbbb-0000-4000-8000-000000000007";
    const loja = lojaEmMemoria();
    let tokenAtual = await entrarComoAgente();
    const fila = filaCom(loja, async () => tokenAtual);
    await fila.enfileirar(envelopeDe(alvo.id, chave), { protocolo: alvo.protocolo });

    try {
      const redefinicao = await app.inject({
        method: "POST", url: `/usuarios/${SESSAO_DO_DIEGO.usuarioId}/redefinir-senha`,
        headers: { authorization: `Bearer ${tokenCoordenador}` },
      });
      expect(redefinicao.statusCode, redefinicao.body).toBe(200);
      const provisoria = redefinicao.json().senhaTemporaria as string;

      // (a) A sessão que o aparelho tinha caiu: pausa por sessão encerrada.
      const velha = await fila.drenar();
      expect(velha.paradaPor).toBe("sessao_encerrada");
      expect((await fila.itens())[0]!.estado).toBe("pendente");

      // (b) O agente entra com a senha provisória. O dreno recebe o 403 do servidor de verdade.
      const entrada = await app.inject({
        method: "POST", url: "/auth/entrar", payload: { email: AGENTE, senha: provisoria },
      });
      expect(entrada.statusCode, entrada.body).toBe(200);
      expect(entrada.json().trocaDeSenhaObrigatoria).toBe(true);
      tokenAtual = entrada.json().acesso as string;

      const comProvisoria = await fila.drenar();

      expect(comProvisoria.paradaPor).toBe("troca_de_senha_obrigatoria");
      expect(comProvisoria.bloqueados).toBe(0);
      const [guardado] = await fila.itens();
      expect(guardado!.estado).toBe("pendente");
      expect(guardado!.tentativas).toBe(0);
      expect(guardado!.ultimaFalha).toBeNull();
      const resumo = await fila.resumo();
      expect(resumo.bloqueados).toBe(0);
      expect(resumo.pausadaPor, "a pausa velha ficou por cima da nova").toBe("troca_de_senha_obrigatoria");
      expect(await vistoriasComAChave(chave), "nada pode ter chegado ao banco").toBe(0);

      // (c) A senha é trocada (no painel). A MESMA coleta sobe, uma vez só.
      const troca = await app.inject({
        method: "POST", url: "/auth/trocar-senha", headers: { authorization: `Bearer ${tokenAtual}` },
        payload: { senhaAtual: provisoria, senha: SENHA },
      });
      expect(troca.statusCode, troca.body).toBe(200);
      tokenAtual = troca.json().acesso as string;

      const subiu = await fila.drenar();

      expect(subiu.enviados).toBe(1);
      expect(subiu.paradaPor).toBeUndefined();
      expect((await fila.resumo()).pausadaPor).toBeNull();
      expect(await vistoriasComAChave(chave)).toBe(1);
    } finally {
      // A redefinição derrubou a sessão compartilhada dos outros testes. Mesmo que
      // uma asserção acima tenha falhado no meio, a senha volta à da semente.
      await mem.bruto.query(
        "UPDATE usuarios SET senha_hash = $1, senha_provisoria_ate = NULL WHERE id = $2",
        [HASH_DA_SEMENTE, SESSAO_DO_DIEGO.usuarioId],
      );
      tokenAcesso = await entrarComoAgente();
    }
  }, 120_000);

  it("token vencido (401 nao_autenticado): renova UMA vez e a coleta sobe, sem pausar", async () => {
    const alvo = await prepararOcorrenciaEmCampo("Rua das Orquídeas, 15, Alto da Serra");
    const chave = "bbbbbbbb-0000-4000-8000-000000000003";
    const agora = Math.floor(Date.now() / 1000);
    const vencido = await new SignJWT({
      org: SESSAO_DO_DIEGO.organizacaoId, papel: "agente_campo", nome: SESSAO_DO_DIEGO.nome,
      sid: "00000000-0000-4000-8000-000000000000",
    })
      .setProtectedHeader({ alg: "HS256", typ: "JWT" })
      .setSubject(SESSAO_DO_DIEGO.usuarioId)
      .setIssuer("dc360-api")
      .setAudience("dc360")
      .setIssuedAt(agora - 1200)
      .setExpirationTime(agora - 300)
      .sign(new TextEncoder().encode(SEGREDO));
    const vivo = await entrarComoAgente();
    let renovacoes = 0;
    const fila = filaCom(lojaEmMemoria(), async (pedido) => {
      if (pedido?.renovarJa) { renovacoes += 1; return vivo; }
      return vencido;
    });

    await fila.enfileirar(envelopeDe(alvo.id, chave), { protocolo: alvo.protocolo });
    const r = await fila.drenar();

    expect(r.enviados).toBe(1);
    expect(r.paradaPor).toBeUndefined();
    expect(renovacoes).toBe(1);
    expect(await vistoriasComAChave(chave)).toBe(1);
  }, 120_000);

  it("token vencido e a renovação não muda nada: a fila PAUSA, sem laço contra o servidor", async () => {
    const alvo = await prepararOcorrenciaEmCampo("Rua das Begônias, 9, Alto da Serra");
    const chave = "bbbbbbbb-0000-4000-8000-000000000004";
    let pedidosDeRenovacao = 0;
    const fila = filaCom(lojaEmMemoria(), async (pedido) => {
      if (pedido?.renovarJa) pedidosDeRenovacao += 1;
      return "token.completamente.invalido";
    });

    await fila.enfileirar(envelopeDe(alvo.id, chave), { protocolo: alvo.protocolo });
    const r = await fila.drenar();

    expect(r.paradaPor).toBe("sessao_encerrada");
    expect(pedidosDeRenovacao, "uma renovação por pedido, nunca em laço").toBe(1);
    expect((await fila.itens())[0]!.estado).toBe("pendente");
    expect(await vistoriasComAChave(chave)).toBe(0);
  }, 60_000);

  it("papel sem permissão (403 sem_permissao) continua BLOQUEANDO: só a sessão é poupada", async () => {
    const alvo = await prepararOcorrenciaEmCampo("Rua das Camélias, 4, Alto da Serra");
    const fila = filaCom(lojaEmMemoria(), async () => tokenCoordenador);

    await fila.enfileirar(envelopeDe(alvo.id, "bbbbbbbb-0000-4000-8000-000000000005"), {
      protocolo: alvo.protocolo,
    });
    const r = await fila.drenar();

    expect(r.bloqueados).toBe(1);
    expect(r.paradaPor).toBeUndefined();
    expect((await fila.itens())[0]!.estado).toBe("bloqueado");
  }, 60_000);
});

describe("Foto de campo do aparelho ao banco", () => {
  const PIXEL = new Uint8Array(
    Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
      "base64",
    ),
  );

  /** Sistema de arquivos do aparelho, com uma foto dentro. */
  const arquivos = {
    async ler(uri: string): Promise<Uint8Array> {
      if (uri !== "file:///dcim/IMG_0042.png") throw new Error(`arquivo inexistente: ${uri}`);
      return PIXEL;
    },
  };

  function filaComFotos(loja = lojaEmMemoria()) {
    return criarFilaDeSincronizacao({
      deposito: depositoSobreChaveValor(loja),
      transporte: transporteHttp({
        baseUrl: endereco,
        obterToken: async () => tokenAcesso,
      }),
      sessaoAtual: () => SESSAO_DO_DIEGO,
      arquivos,
      dormir: async () => undefined,
    });
  }

  function fotoDe(chaveIdem: string) {
    return {
      idempotencyKey: chaveIdem,
      uriLocal: "file:///dcim/IMG_0042.png",
      nomeArquivo: "IMG_0042.png",
      tipoConteudo: "image/png",
      tamanhoBytes: PIXEL.byteLength,
      capturadaEm: new Date(Date.now() - 3_600_000).toISOString(),
      legenda: "Trinca na parede dos fundos",
      ordem: 0,
    };
  }

  it("a foto sobe, é confirmada e fica amarrada à vistoria", async () => {
    const alvo = await prepararOcorrenciaEmCampo("Rua da Foto, 100");
    const chaveColeta = "aaaaaaaa-0000-4000-8000-00000000000a";
    const chaveFoto = "bbbbbbbb-0000-4000-8000-00000000000a";

    const fila = filaComFotos();
    await fila.enfileirar(
      { ...envelopeDe(alvo.id, chaveColeta), vistoria: { ...envelopeDe(alvo.id, chaveColeta).vistoria, fotos: [] } },
      { protocolo: alvo.protocolo, fotos: [fotoDe(chaveFoto)] },
    );

    const r = await fila.drenar();
    expect(r.fotosEnviadas).toBe(1);
    expect(r.enviados).toBe(1);

    const evidencia = await mem.bruto.query<{
      chave_storage: string; enviada_em: string | null; vistoria_id: string | null;
      tamanho_bytes: string; tipo_conteudo: string;
    }>(
      `SELECT chave_storage, enviada_em, vistoria_id, tamanho_bytes, tipo_conteudo
         FROM evidencias WHERE ocorrencia_id = $1`,
      [alvo.id],
    );

    expect(evidencia.rows).toHaveLength(1);
    const linha = evidencia.rows[0]!;
    // Confirmada de verdade: o servidor perguntou ao armazenamento.
    expect(linha.enviada_em).not.toBeNull();
    // Amarrada à vistoria pela sincronização, sem virar linha duplicada.
    expect(linha.vistoria_id).not.toBeNull();
    expect(Number(linha.tamanho_bytes)).toBe(PIXEL.byteLength);
    expect(linha.tipo_conteudo).toBe("image/png");
    // A chave é a do servidor, com o prefixo do município.
    expect(linha.chave_storage).toMatch(/^tenant\/[0-9a-f-]{36}\/ocorrencias\//);
  }, 120_000);

  it("o coordenador consegue ver a foto que o agente enviou", async () => {
    const listagem = await app.inject({
      method: "GET", url: "/evidencias/ocorrencia/" + (await ultimaOcorrenciaComFoto()),
      headers: { authorization: `Bearer ${tokenCoordenador}` },
    });

    expect(listagem.statusCode).toBe(200);
    const itens = listagem.json().itens as Array<{ url: string; legenda: string }>;
    expect(itens).toHaveLength(1);
    expect(itens[0]!.legenda).toBe("Trinca na parede dos fundos");

    // A URL é assinada e serve o conteúdo que subiu.
    const alvo = new URL(itens[0]!.url);
    const bytes = await app.inject({ method: "GET", url: alvo.pathname + alvo.search });
    expect(bytes.statusCode).toBe(200);
    expect(Buffer.from(PIXEL).equals(bytes.rawPayload)).toBe(true);
  }, 60_000);

  it("a conta troca com a foto em voo: o servidor recusa o autor errado e a trilha não ganha uma foto que ninguém fez", async () => {
    /*
      A corrida que a rodada 1 da validação provou: o item é do Diego, a fila
      ainda o tem como autor, mas o token que sai pelo fio já é de outra pessoa
      (a troca de conta aconteceu entre o portão de autoria e o pedido). O
      servidor é o último portão: a declaração do autor da coleta confere com o
      token, e a foto não chega a existir.
    */
    const ANA = "11111111-1111-4111-8111-0000000000d9";
    await mem.bruto.query(
      `INSERT INTO usuarios (id, organizacao_id, nome, matricula, email, papel, equipe_id, senha_hash)
       SELECT $1, organizacao_id, 'Ana Ribeiro Gouveia', 'SA-3392',
              'ana.gouveia@serraalta.exemplo.gov.br', 'agente_campo', equipe_id, senha_hash
         FROM usuarios WHERE id = $2
       ON CONFLICT (id) DO NOTHING`,
      [ANA, SESSAO_DO_DIEGO.usuarioId],
    );
    const entradaDaAna = await app.inject({
      method: "POST", url: "/auth/entrar",
      payload: { email: "ana.gouveia@serraalta.exemplo.gov.br", senha: SENHA },
    });
    expect(entradaDaAna.statusCode, entradaDaAna.body).toBe(200);
    const tokenDaAna = entradaDaAna.json().acesso as string;

    const alvo = await prepararOcorrenciaEmCampo("Rua da Troca de Turno, 300");
    const fila = criarFilaDeSincronizacao({
      deposito: depositoSobreChaveValor(lojaEmMemoria()),
      transporte: transporteHttp({ baseUrl: endereco, obterToken: async () => tokenDaAna }),
      sessaoAtual: () => SESSAO_DO_DIEGO,
      arquivos,
      dormir: async () => undefined,
    });
    const base = envelopeDe(alvo.id, "aaaaaaaa-0000-4000-8000-00000000000c");
    await fila.enfileirar(
      { ...base, vistoria: { ...base.vistoria, fotos: [] } },
      { protocolo: alvo.protocolo, fotos: [fotoDe("bbbbbbbb-0000-4000-8000-00000000000c")] },
    );

    const r = await fila.drenar();

    expect(r.enviados).toBe(0);
    const [item] = await fila.itens();
    expect(item!.estado).toBe("bloqueado");
    expect(item!.ultimaFalha!.codigo).toBe("autor_divergente");
    const evidencias = await mem.bruto.query<{ n: string }>(
      "SELECT count(*)::text AS n FROM evidencias WHERE ocorrencia_id = $1", [alvo.id],
    );
    expect(evidencias.rows[0]!.n, "a foto foi reservada em nome de outra pessoa").toBe("0");
    const anexos = await mem.bruto.query<{ n: string }>(
      "SELECT count(*)::text AS n FROM trilha_eventos WHERE ocorrencia_id = $1 AND tipo = 'evidencia_anexada'",
      [alvo.id],
    );
    expect(anexos.rows[0]!.n).toBe("0");
  }, 120_000);

  it("reenviar a coleta inteira não duplica a foto", async () => {
    const alvo = await prepararOcorrenciaEmCampo("Rua do Reenvio, 200");
    const chaveColeta = "aaaaaaaa-0000-4000-8000-00000000000b";
    const chaveFoto = "bbbbbbbb-0000-4000-8000-00000000000b";

    const base = envelopeDe(alvo.id, chaveColeta);
    const semFotos = { ...base, vistoria: { ...base.vistoria, fotos: [] } };

    // Três aparelhos, ou o mesmo reaberto três vezes, com as mesmas chaves.
    for (let i = 0; i < 3; i++) {
      const fila = filaComFotos();
      await fila.enfileirar(semFotos, { protocolo: alvo.protocolo, fotos: [fotoDe(chaveFoto)] });
      await fila.drenar();
    }

    const evidencias = await mem.bruto.query<{ n: string }>(
      "SELECT count(*)::text AS n FROM evidencias WHERE ocorrencia_id = $1", [alvo.id],
    );
    const vistorias = await mem.bruto.query<{ n: string }>(
      "SELECT count(*)::text AS n FROM vistorias WHERE ocorrencia_id = $1", [alvo.id],
    );

    // Uma foto, um laudo. A chave de idempotência da captura protege a
    // evidência; a da coleta protege a vistoria.
    expect(evidencias.rows[0]!.n).toBe("1");
    expect(vistorias.rows[0]!.n).toBe("1");
  }, 180_000);
});

async function ultimaOcorrenciaComFoto(): Promise<string> {
  const r = await mem.bruto.query<{ ocorrencia_id: string }>(
    "SELECT ocorrencia_id FROM evidencias WHERE enviada_em IS NOT NULL ORDER BY capturada_em DESC LIMIT 1",
  );
  return r.rows[0]!.ocorrencia_id;
}
