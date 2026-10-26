import { describe, expect, it, vi } from "vitest";
import type { EnvelopeSincronizacao } from "@dc360/shared";
import {
  FalhaDeSessao,
  FalhaTemporaria,
  criarFilaDeSincronizacao,
  depositoSobreChaveValor,
  lojaEmMemoria,
  type AutorDaColeta,
  type Transporte,
} from "../src/index.js";

/**
 * A pausa da fila cai quando a pessoa ENTRA DE NOVO (V2-F00-E06, correção 3).
 *
 * O defeito, achado pela revisão independente: o motor só limpava a pausa
 * quando um envio dava certo ou a fila esvaziava. A pessoa entrava de novo (o
 * que a coordenação reativou, o que a senha definida no painel, o que a sessão
 * nova resolvem), o primeiro envio falhava por rede ruim, e `pausadaPor`
 * continuava `sessao_encerrada`: a faixa, a fila, "Enviar agora" e a vistoria
 * mandavam entrar de novo quem tinha acabado de entrar.
 *
 * A fila ganhou a "geração da credencial" (`geracaoDaSessao`), um número que o
 * aplicativo sobe a cada login. Aqui ela é um contador do teste.
 */

const MOMENTO = new Date("2026-10-06T14:00:00.000Z");
const OCORRENCIA = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const CHAVE_A = "11111111-1111-4111-8111-111111111111";

const AGENTE_A: AutorDaColeta = {
  usuarioId: "u-ana", nome: "Ana Ribeiro", organizacaoId: "org-serra-alta",
};

function envelope(chave: string, ocorrencia = OCORRENCIA): EnvelopeSincronizacao {
  return {
    idempotencyKey: chave,
    ocorrenciaId: ocorrencia,
    coletadaEm: MOMENTO.toISOString(),
    vistoria: {
      checklist: [
        { chave: "risco_iminente", resposta: true },
        { chave: "evacuacao_necessaria", resposta: false },
        { chave: "interdicao_indicada", resposta: false },
        { chave: "acionar_outro_orgao", resposta: false },
      ],
      fotos: [],
      gpsPrecisaoMetros: 6,
      assinanteNome: "Moradora",
      assinaturaChave: "assinatura.png",
      coletadaEm: MOMENTO.toISOString(),
    },
  };
}

function transporteFalso(parcial: Partial<Transporte>): Transporte {
  return {
    enviar: async () => ({ vistoriaId: "v", duplicada: false }),
    devolver: async () => { throw new Error("devolver nao esperado neste teste"); },
    autorizarFoto: async () => { throw new Error("autorizarFoto nao esperado neste teste"); },
    enviarBytes: async () => { throw new Error("enviarBytes nao esperado neste teste"); },
    confirmarFoto: async () => { throw new Error("confirmarFoto nao esperado neste teste"); },
    ...parcial,
  };
}

function montarComGeracao(transporte: Partial<Transporte>) {
  const loja = lojaEmMemoria();
  const estado = { geracao: 0, sessao: AGENTE_A as AutorDaColeta | null };
  let agora = MOMENTO.getTime();
  const fila = criarFilaDeSincronizacao({
    deposito: depositoSobreChaveValor(loja),
    transporte: transporteFalso(transporte),
    sessaoAtual: () => estado.sessao,
    geracaoDaSessao: () => estado.geracao,
    agora: () => new Date(agora),
    dormir: async () => undefined,
    ruido: () => 0.5,
  });
  return { fila, estado, avancar: (ms: number) => { agora += ms; } };
}

const MOTIVOS = ["sessao_encerrada", "conta_desativada", "troca_de_senha_obrigatoria"] as const;

describe("a pausa velha cai quando a credencial muda", () => {
  it.each(MOTIVOS)("%s: entrar de novo derruba a pausa, mesmo sem nenhum dreno e sem sinal", async (motivo) => {
    const enviar = vi.fn(async () => { throw new FalhaDeSessao("A sessão não vale.", motivo); });
    const { fila, estado } = montarComGeracao({ enviar });
    await fila.enfileirar(envelope(CHAVE_A), { protocolo: "000471/2026" });
    await fila.drenar();
    expect((await fila.resumo()).pausadaPor).toBe(motivo);

    estado.geracao += 1; // a pessoa entrou de novo

    expect((await fila.resumo()).pausadaPor).toBeNull();
    // A coleta continua guardada e pendente: só a marca caiu.
    expect((await fila.itens()).map((i) => i.estado)).toEqual(["pendente"]);
  });

  it("depois de entrar de novo, a falha de rede NÃO traz a pausa de volta", async () => {
    let falha: Error = new FalhaDeSessao("A sessão não vale.", "sessao_encerrada");
    const { fila, estado, avancar } = montarComGeracao({ enviar: async () => { throw falha; } });
    await fila.enfileirar(envelope(CHAVE_A), { protocolo: "000471/2026" });
    await fila.drenar();
    estado.geracao += 1;
    falha = new FalhaTemporaria("Sem conexão.");
    avancar(60_000);

    const r = await fila.drenar();

    expect(r.paradaPor).toBeUndefined();
    expect((await fila.resumo()).pausadaPor).toBeNull();
  });

  it("a recusa que volta de um pedido feito com a credencial VELHA não pausa a credencial nova", async () => {
    const estadoDoPedido: { geracao: () => void } = { geracao: () => undefined };
    const { fila, estado } = montarComGeracao({
      enviar: async () => {
        estadoDoPedido.geracao();
        throw new FalhaDeSessao("A sessão não vale.", "sessao_encerrada");
      },
    });
    estadoDoPedido.geracao = () => { estado.geracao += 1; }; // entrou de novo com o pedido no ar
    await fila.enfileirar(envelope(CHAVE_A), { protocolo: "000471/2026" });

    await fila.drenar();

    expect((await fila.resumo()).pausadaPor).toBeNull();
    expect((await fila.itens()).map((i) => i.estado)).toEqual(["pendente"]);
  });

  it("controle: sem login novo a pausa continua, e a nova recusa da credencial nova pausa de novo", async () => {
    const enviar = vi.fn(async () => { throw new FalhaDeSessao("A conta foi desativada.", "conta_desativada"); });
    const { fila, estado, avancar } = montarComGeracao({ enviar });
    await fila.enfileirar(envelope(CHAVE_A), { protocolo: "000471/2026" });
    await fila.drenar();
    expect((await fila.resumo()).pausadaPor).toBe("conta_desativada");
    expect((await fila.resumo()).pausadaPor).toBe("conta_desativada");

    estado.geracao += 1;
    avancar(60_000);
    await fila.drenar(); // a credencial nova também é recusada: a pausa é dela agora

    expect((await fila.resumo()).pausadaPor).toBe("conta_desativada");
  });

  it("sem `geracaoDaSessao`, a pausa se comporta como antes", async () => {
    const enviar = vi.fn(async () => { throw new FalhaDeSessao("A sessão não vale.", "sessao_encerrada"); });
    const fila = criarFilaDeSincronizacao({
      deposito: depositoSobreChaveValor(lojaEmMemoria()),
      transporte: transporteFalso({ enviar }),
      sessaoAtual: () => AGENTE_A,
      agora: () => MOMENTO,
      dormir: async () => undefined,
      ruido: () => 0.5,
    });
    await fila.enfileirar(envelope(CHAVE_A), { protocolo: "000471/2026" });
    await fila.drenar();

    expect((await fila.resumo()).pausadaPor).toBe("sessao_encerrada");
  });
});
