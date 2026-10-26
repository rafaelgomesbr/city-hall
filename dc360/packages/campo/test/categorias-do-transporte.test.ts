/**
 * Categoria do catálogo para ação da fila (V2-F02-E03). A categoria decide
 * DENTRO do status, nunca por cima dele: nenhum caso que hoje mantém o item
 * passa a bloqueá-lo, e nenhum caso que hoje bloqueia passa a pausar a fila
 * inteira ou a repetir para sempre.
 *
 * | Status | Categoria do `erro` | Ação da fila |
 * | --- | --- | --- |
 * | rede, tempo esgotado | (nenhuma) | Temporário: item pendente, adiado. |
 * | 5xx, 429 | qualquer | Temporário: item pendente, adiado. |
 * | 401 | reentrar | Pausa sem renovar; itens intactos. |
 * | 401 | outra, ou código desconhecido | Renova UMA vez e repete com o mesmo corpo; se não resolver, pausa. |
 * | 403 | `conta_desativada` (permanente) | Pausa: a conta foi recusada, não a coleta. |
 * | 403 | reentrar (`troca_de_senha_obrigatoria`) | Pausa até a pessoa definir a senha. |
 * | 403 | aguardar (`acesso_suspenso`) | Temporário. |
 * | 403 | permanente, renovar (`assinatura`) ou desconhecido | Item bloqueado com código; descarte só pela tela. |
 * | outro 4xx | qualquer (inclusive `autor_divergente` e `tarefa_no_prazo`) | Item bloqueado com código e campos, ou arquivado se a coleta ficou sem destino. |
 */
import { describe, expect, it, vi } from "vitest";
import type { EnvelopeSincronizacao } from "@dc360/shared";
import {
  FalhaDeSessao,
  FalhaPermanente,
  FalhaTemporaria,
  criarFilaDeSincronizacao,
  depositoSobreChaveValor,
  lojaEmMemoria,
  transporteHttp,
  type ObterToken,
} from "../src/index.js";

const MOMENTO = new Date("2026-10-25T14:00:00.000Z");
const AUTOR = { usuarioId: "agente-ana", nome: "Ana Ribeiro", organizacaoId: "serra-alta" };
const CHAVES = ["11111111-1111-4111-8111-111111111111", "22222222-2222-4222-8222-222222222222"];

function envelope(chave = CHAVES[0]!): EnvelopeSincronizacao {
  return {
    idempotencyKey: chave,
    ocorrenciaId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
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

function resposta(status: number, corpo: unknown = {}): Response {
  return { ok: status >= 200 && status < 300, status, json: async () => corpo } as Response;
}

function montar(
  respostas: Response[],
  tokenRenovado = "token-novo",
  baseUrl = "https://api.exemplo/v1/",
) {
  const buscar = vi.fn(async (_url: string, _opcoes?: RequestInit) => {
    const proxima = respostas.shift();
    if (!proxima) throw new Error("Pedido além do previsto no teste.");
    return proxima;
  });
  const obterToken = vi.fn<ObterToken>(async (pedido) =>
    pedido?.renovarJa ? tokenRenovado : "token-atual",
  );
  const transporte = transporteHttp({ baseUrl, obterToken, buscar: buscar as typeof fetch });
  const deposito = depositoSobreChaveValor(lojaEmMemoria());
  const remover = vi.spyOn(deposito, "remover");
  let instante = MOMENTO.getTime();
  const fila = criarFilaDeSincronizacao({
    deposito,
    transporte,
    sessaoAtual: () => AUTOR,
    agora: () => new Date(instante),
    ruido: () => 0.5,
  });
  return {
    transporte,
    fila,
    deposito,
    remover,
    buscar,
    obterToken,
    avancar: () => {
      instante += 600_000;
    },
  };
}

async function guardarDuas(fila: ReturnType<typeof criarFilaDeSincronizacao>) {
  for (const chave of CHAVES) {
    await fila.enfileirar(envelope(chave), { protocolo: "000001/2026", fotos: [] });
  }
}

describe("base fornecida pelo aplicativo", () => {
  it("usa a base com /v1 e remove a barra final sem duplicar o prefixo", async () => {
    const { transporte, buscar } = montar([resposta(201, { vistoriaId: "v" })]);
    await transporte.enviar(envelope());
    expect(buscar.mock.calls[0]?.[0]).toBe("https://api.exemplo/v1/sincronizacao/vistoria");
  });

  it("preserva o contrato baseUrl sem acrescentar /v1 ao chamador legado", async () => {
    const { transporte, buscar } = montar([resposta(200)], "token-novo", "https://api.exemplo/");
    await transporte.confirmarFoto("evidencia");
    expect(buscar.mock.calls[0]?.[0]).toBe("https://api.exemplo/evidencias/confirmar-envio");
  });

  it("envia os bytes à URL assinada exata, sem /v1 nem token da API", async () => {
    const { transporte, buscar } = montar([resposta(200)]);
    const url = "https://api.exemplo/armazenamento/objeto?assinatura=teste";
    await transporte.enviarBytes(url, { "content-type": "image/jpeg" }, new Uint8Array([1]));
    expect(buscar.mock.calls[0]?.[0]).toBe(url);
    expect(buscar.mock.calls[0]?.[1]?.headers).toEqual({ "content-type": "image/jpeg" });
  });

  it("403 do armazenamento continua temporário para a próxima tentativa pedir outra URL", async () => {
    const { transporte, obterToken } = montar([resposta(403)]);
    await expect(
      transporte.enviarBytes(
        "https://arquivos.exemplo/foto?assinatura=teste",
        {},
        new Uint8Array([1]),
      ),
    ).rejects.toBeInstanceOf(FalhaTemporaria);
    expect(obterToken).not.toHaveBeenCalled();
  });
});

describe("categoria do catálogo dentro do status", () => {
  it("403 de categoria renovar não gasta a renovação do token e recusa o dado como antes", async () => {
    const { transporte, buscar, obterToken } = montar([resposta(403, { erro: "assinatura" })]);
    const falha = await transporte.enviar(envelope()).catch((e: unknown) => e);
    expect(falha).toBeInstanceOf(FalhaPermanente);
    expect(falha).toMatchObject({ codigo: "assinatura" });
    expect(obterToken.mock.calls).toEqual([[]]);
    expect(buscar).toHaveBeenCalledTimes(1);
  });

  it("409 autor_divergente (reentrar) bloqueia só o item, sem pausar a fila nem renovar", async () => {
    const { fila, obterToken, remover } = montar([
      resposta(409, { erro: "autor_divergente", mensagem: "Coleta de outro agente." }),
      resposta(201, { vistoriaId: "v2" }),
    ]);
    await guardarDuas(fila);
    const resultado = await fila.drenar();
    expect(resultado).toMatchObject({ bloqueados: 1, enviados: 1 });
    expect(resultado.paradaPor).toBeUndefined();
    const itens = await fila.itens();
    expect(itens[0]).toMatchObject({
      estado: "bloqueado",
      envelope: envelope(CHAVES[0]),
      ultimaFalha: { codigo: "autor_divergente" },
    });
    expect(itens[1]).toMatchObject({ estado: "confirmado", envelope: envelope(CHAVES[1]) });
    expect(obterToken.mock.calls.some(([pedido]) => pedido?.renovarJa)).toBe(false);
    expect(remover).not.toHaveBeenCalled();
  });

  it("401 com código de dado renova uma vez e pausa, sem bloquear nem apagar a coleta", async () => {
    const campos = [{ campo: "vistoria.observacoes", mensagem: "Confira o relato." }];
    const { fila, obterToken, remover, buscar } = montar([
      resposta(401, { erro: "dados_invalidos", mensagem: "Confira os dados.", campos }),
      resposta(401, { erro: "dados_invalidos", mensagem: "Confira os dados.", campos }),
    ]);
    await fila.enfileirar(envelope(), { protocolo: "000001/2026", fotos: [] });
    const antes = await fila.itens();
    expect(await fila.drenar()).toMatchObject({ paradaPor: "sessao_encerrada", bloqueados: 0 });
    expect(await fila.itens()).toEqual(antes);
    expect(obterToken.mock.calls).toEqual([[], [{ renovarJa: true }]]);
    expect(buscar).toHaveBeenCalledTimes(2);
    expect(remover).not.toHaveBeenCalled();
  });

  it("409 tarefa_no_prazo (aguardar) bloqueia o item como antes, sem repetir sozinho", async () => {
    const { fila, remover, obterToken } = montar([resposta(409, { erro: "tarefa_no_prazo" })]);
    await fila.enfileirar(envelope(), { protocolo: "000001/2026", fotos: [] });
    expect(await fila.drenar()).toMatchObject({ bloqueados: 1, adiados: 0 });
    expect(await fila.itens()).toMatchObject([
      {
        estado: "bloqueado",
        envelope: envelope(),
        ultimaFalha: { codigo: "tarefa_no_prazo" },
      },
    ]);
    expect(obterToken.mock.calls.some(([pedido]) => pedido?.renovarJa)).toBe(false);
    expect(remover).not.toHaveBeenCalled();
  });

  it("401 com código de esperar renova uma vez e pausa, como todo 401 que não é reentrar", async () => {
    const { transporte, obterToken } = montar([
      resposta(401, { erro: "erro_interno" }),
      resposta(401, { erro: "erro_interno" }),
    ]);
    await expect(transporte.enviar(envelope())).rejects.toBeInstanceOf(FalhaDeSessao);
    expect(obterToken.mock.calls).toEqual([[], [{ renovarJa: true }]]);
  });

  it("401 reentrar (sessao_encerrada) pausa sem gastar a renovação e mantém os dois itens", async () => {
    const { fila, obterToken, remover, buscar } = montar([
      resposta(401, { erro: "sessao_encerrada" }),
    ]);
    await guardarDuas(fila);
    const antes = await fila.itens();
    expect(await fila.drenar()).toMatchObject({ paradaPor: "sessao_encerrada" });
    expect(await fila.itens()).toEqual(antes);
    expect(obterToken.mock.calls).toEqual([[]]);
    expect(buscar).toHaveBeenCalledTimes(1);
    expect(remover).not.toHaveBeenCalled();
  });

  it("401 credenciais, também reentrar, pausa sem gastar a renovação rotativa", async () => {
    const { transporte, obterToken, buscar } = montar([resposta(401, { erro: "credenciais" })]);
    await expect(transporte.enviar(envelope())).rejects.toMatchObject({
      motivo: "sessao_encerrada",
    });
    expect(obterToken.mock.calls).toEqual([[]]);
    expect(buscar).toHaveBeenCalledTimes(1);
  });

  it("5xx com código de outra categoria continua temporário e mantém o item pendente", async () => {
    const { fila, remover } = montar([resposta(503, { erro: "sem_permissao" })]);
    await guardarDuas(fila);
    expect(await fila.drenar()).toMatchObject({ adiados: 1, bloqueados: 0 });
    expect(await fila.itens()).toMatchObject([{ estado: "pendente" }, { estado: "pendente" }]);
    expect(remover).not.toHaveBeenCalled();
  });

  it("403 troca_de_senha_obrigatoria (reentrar) pausa e 403 acesso_suspenso (aguardar) adia", async () => {
    const troca = montar([resposta(403, { erro: "troca_de_senha_obrigatoria" })]);
    await expect(troca.transporte.enviar(envelope())).rejects.toMatchObject({
      motivo: "troca_de_senha_obrigatoria",
    });
    const suspenso = montar([resposta(403, { erro: "acesso_suspenso" })]);
    await expect(suspenso.transporte.enviar(envelope())).rejects.toBeInstanceOf(FalhaTemporaria);
  });

  it("permanente mantém o bloqueio sem apagar o item automaticamente", async () => {
    const { fila, remover } = montar([resposta(403, { erro: "sem_permissao" })]);
    await fila.enfileirar(envelope(), { protocolo: "000001/2026", fotos: [] });
    expect(await fila.drenar()).toMatchObject({ bloqueados: 1 });
    expect(await fila.itens()).toMatchObject([{ estado: "bloqueado", envelope: envelope() }]);
    expect(remover).not.toHaveBeenCalled();
  });

  it("permanente sem destino mantém o arquivamento existente com a coleta guardada", async () => {
    const { fila, remover } = montar([resposta(409, { erro: "ja_encerrada" })]);
    await fila.enfileirar(envelope(), { protocolo: "000001/2026", fotos: [] });
    await fila.drenar();
    expect(await fila.itens()).toMatchObject([{ estado: "arquivado", envelope: envelope() }]);
    expect(remover).not.toHaveBeenCalled();
  });

  it("renovar em 401 repete o mesmo pedido, com o mesmo corpo e a mesma chave, uma vez", async () => {
    const { transporte, buscar, obterToken } = montar([
      resposta(401, { erro: "nao_autenticado" }),
      resposta(201, { vistoriaId: "v" }),
    ]);
    await expect(transporte.enviar(envelope())).resolves.toMatchObject({ vistoriaId: "v" });
    expect(obterToken.mock.calls).toEqual([[], [{ renovarJa: true }]]);
    expect(buscar).toHaveBeenCalledTimes(2);
    expect(buscar.mock.calls[0]?.[1]?.body).toBe(buscar.mock.calls[1]?.[1]?.body);
    expect(buscar.mock.calls[1]?.[1]?.headers).toMatchObject({
      authorization: "Bearer token-novo",
    });
  });

  it("renovar sem token novo pausa sem bloquear ou perder nenhum item", async () => {
    const { fila, remover } = montar([resposta(401, { erro: "nao_autenticado" })], "token-atual");
    await guardarDuas(fila);
    const antes = await fila.itens();
    expect(await fila.drenar()).toMatchObject({ paradaPor: "sessao_encerrada" });
    expect(await fila.itens()).toEqual(antes);
    expect(remover).not.toHaveBeenCalled();
  });

  it("renovar recusado outra vez pausa sem laço e mantém todos os itens", async () => {
    const { fila, remover, buscar } = montar([
      resposta(401, { erro: "nao_autenticado" }),
      resposta(401, { erro: "nao_autenticado" }),
    ]);
    await guardarDuas(fila);
    const antes = await fila.itens();
    expect(await fila.drenar()).toMatchObject({ paradaPor: "sessao_encerrada" });
    expect(await fila.itens()).toEqual(antes);
    expect(buscar).toHaveBeenCalledTimes(2);
    expect(remover).not.toHaveBeenCalled();
  });

  it("servidor indisponível depois de renovar adia sem transformar a recusa em descarte", async () => {
    const { fila, remover } = montar([
      resposta(401, { erro: "nao_autenticado" }),
      resposta(503, { erro: "erro_interno" }),
    ]);
    await guardarDuas(fila);
    expect(await fila.drenar()).toMatchObject({ adiados: 1, bloqueados: 0 });
    expect(await fila.itens()).toMatchObject([{ estado: "pendente" }, { estado: "pendente" }]);
    expect(remover).not.toHaveBeenCalled();
  });

  it("401 sem corpo mantém a renovação única e a pausa sem perda do comportamento anterior", async () => {
    const semCorpo = {
      ok: false,
      status: 401,
      json: async () => {
        throw new Error("Corpo vazio.");
      },
    } as unknown as Response;
    const { fila, remover, buscar } = montar([semCorpo, semCorpo]);
    await guardarDuas(fila);
    const antes = await fila.itens();
    expect(await fila.drenar()).toMatchObject({ paradaPor: "sessao_encerrada" });
    expect(await fila.itens()).toEqual(antes);
    expect(buscar).toHaveBeenCalledTimes(2);
    expect(remover).not.toHaveBeenCalled();
  });

  it("código desconhecido usa o padrão do status sem bloquear indisponibilidade", async () => {
    const { transporte } = montar([resposta(503, { erro: "codigo_futuro" })]);
    await expect(transporte.confirmarFoto("evidencia")).rejects.toBeInstanceOf(FalhaTemporaria);
    const permanente = montar([resposta(404, { erro: "codigo_futuro" })]);
    await expect(permanente.transporte.confirmarFoto("evidencia")).rejects.toBeInstanceOf(
      FalhaPermanente,
    );
  });

  it("conta desativada continua pausando em vez de recusar a coleta", async () => {
    const { transporte } = montar([resposta(403, { erro: "conta_desativada" })]);
    await expect(transporte.confirmarFoto("evidencia")).rejects.toBeInstanceOf(FalhaDeSessao);
  });

  it("a categoria que o servidor mande no corpo não governa a fila", async () => {
    const { transporte, obterToken } = montar([
      resposta(409, { erro: "ja_encerrada", categoria: "aguardar" }),
    ]);
    await expect(transporte.enviar(envelope())).rejects.toBeInstanceOf(FalhaPermanente);
    expect(obterToken.mock.calls).toEqual([[]]);
  });
});
