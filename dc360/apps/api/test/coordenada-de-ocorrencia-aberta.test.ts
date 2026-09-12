import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { bancoEmMemoria, type BancoEmMemoria } from "../src/banco/memoria.js";
import { carregarConfig } from "../src/config.js";
import { construirServidor } from "../src/servidor.js";
import { armazenamentoEmMemoria } from "../src/armazenamento/memoria.js";

/**
 * O alfinete no lugar errado, e a correção que não existia.
 *
 * O PROBLEMA REAL. O operador cola a localização durante a ligação, com o
 * telefone no ombro e alguém apavorado do outro lado. Depois o agente chega no
 * local e descobre que o ponto está na quadra errada, ou o chamado foi aberto
 * sem coordenada nenhuma e o ponto certo só apareceu depois. Até aqui a
 * coordenada entrava na abertura e nunca mais mudava, e a única saída era
 * abrir OUTRO protocolo para o mesmo evento: duas ocorrências onde existe uma
 * casa, e a equipe saindo para vistoriar o endereço errado.
 *
 * O que este arquivo prende, e nenhum dos seis é enfeite:
 *
 * 1. Corrige, e o valor gravado sai com o teto de seis casas decimais.
 * 2. Quem não tem a permissão não corrige.
 * 3. Ocorrência de outro município responde 404, nunca 403.
 * 4. Ocorrência encerrada não muda de lugar.
 * 5. Coordenada fora de faixa e motivo curto são recusados pelo esquema
 *    compartilhado, no servidor, e não pelo formulário.
 * 6. A trilha recebe o ANTES, o DEPOIS e o motivo escrito por quem corrigiu.
 */

const SENHA = "defesa-civil-2026";
const EQUIPE_ALFA = "11111111-1111-4111-8111-0000000000e1";

const MOTIVO =
  "O agente conferiu no local: o ponto caía na quadra de baixo, do outro lado "
  + "do córrego. Coordenada lida do GPS na frente do imóvel.";

let mem: BancoEmMemoria;
let app: FastifyInstance;
let tokenCoordenador: string;
let tokenOperador: string;
let tokenAgente: string;
let tokenDeFora: string;

const com = (t: string) => ({ authorization: `Bearer ${t}` });

async function entrar(email: string): Promise<string> {
  const r = await app.inject({
    method: "POST", url: "/auth/entrar", payload: { email, senha: SENHA },
  });
  if (r.statusCode !== 200) throw new Error(`login falhou: ${r.body}`);
  return r.json().acesso;
}

/** Uma ocorrência aberta, com ou sem ponto, para ter o que corrigir. */
async function abrir(
  endereco: string,
  coordenada: { lat: number; lng: number } | null = { lat: -22.4187, lng: -45.4523 },
): Promise<string> {
  const r = await app.inject({
    method: "POST", url: "/ocorrencias", headers: com(tokenCoordenador),
    payload: {
      solicitanteNome: "Marilda Souza Prado", canalEntrada: "telefone",
      endereco, tipo: "deslizamento",
      descricao: "Talude atrás da casa cedeu depois da chuva da madrugada.",
      ...(coordenada ? { coordenada } : {}),
    },
  });
  if (r.statusCode !== 201) throw new Error(`abertura falhou: ${r.body}`);
  return r.json().id;
}

function corrigir(
  token: string,
  id: string,
  corpo: unknown,
) {
  return app.inject({
    method: "POST", url: `/ocorrencias/${id}/coordenada`,
    headers: com(token), payload: corpo,
  });
}

type LinhaDaTrilha = { tipo: string; detalhe: Record<string, unknown> };

async function trilhaDe(id: string, token = tokenCoordenador): Promise<LinhaDaTrilha[]> {
  const r = await app.inject({ method: "GET", url: `/ocorrencias/${id}`, headers: com(token) });
  if (r.statusCode !== 200) throw new Error(`detalhe falhou: ${r.body}`);
  return r.json().trilha;
}

async function coordenadaGravada(
  id: string,
): Promise<{ latitude: number | null; longitude: number | null }> {
  const r = await app.inject({
    method: "GET", url: `/ocorrencias/${id}`, headers: com(tokenCoordenador),
  });
  const o = r.json().ocorrencia;
  return { latitude: o.latitude, longitude: o.longitude };
}

/** Leva a ocorrência até o encerramento, que é o estado do qual não se sai. */
async function encerrar(id: string): Promise<void> {
  await app.inject({
    method: "POST", url: `/ocorrencias/${id}/triagem`, headers: com(tokenCoordenador),
    payload: {
      severidade: "alta", vulnerabilidadePresente: false,
      vulnerabilidadeDescricao: null,
    },
  });
  const r = await app.inject({
    method: "POST", url: `/ocorrencias/${id}/encerramento`, headers: com(tokenCoordenador),
    payload: { motivo: "Chamado improcedente, sem risco constatado." },
  });
  if (r.statusCode !== 200) throw new Error(`encerramento falhou: ${r.body}`);
}

/** Uma ocorrência com vistoria concluída e termo de interdição emitido. */
async function comVistoriaEDocumento(endereco: string): Promise<string> {
  const id = await abrir(endereco);
  await app.inject({
    method: "POST", url: `/ocorrencias/${id}/triagem`, headers: com(tokenCoordenador),
    payload: {
      severidade: "critica", vulnerabilidadePresente: true,
      vulnerabilidadeDescricao: "Idosa acamada na residência.",
    },
  });
  await app.inject({
    method: "POST", url: `/ocorrencias/${id}/despacho`, headers: com(tokenCoordenador),
    payload: { equipeId: EQUIPE_ALFA, prazoHoras: 4 },
  });

  const coletadaEm = new Date(Date.now() - 5_000).toISOString();
  const s = await app.inject({
    method: "POST", url: "/sincronizacao/vistoria", headers: com(tokenAgente),
    payload: {
      idempotencyKey: crypto.randomUUID(),
      ocorrenciaId: id,
      coletadaEm,
      vistoria: {
        checklist: [
          { chave: "risco_iminente", resposta: true },
          { chave: "evacuacao_necessaria", resposta: true },
          { chave: "interdicao_indicada", resposta: true },
          { chave: "acionar_outro_orgao", resposta: false },
        ],
        fotos: [],
        gpsPrecisaoMetros: 6.2,
        assinanteNome: "Marilda Souza Prado",
        assinaturaChave: null,
        coletadaEm,
        observacoes: "Vistoria realizada com a moradora presente.",
      },
    },
  });
  if (s.statusCode !== 201) throw new Error(`sincronizacao falhou: ${s.body}`);

  const termo = await app.inject({
    method: "GET", url: `/documentos/${id}/termo-de-interdicao`,
    headers: com(tokenCoordenador),
  });
  if (termo.statusCode !== 200) throw new Error(`termo falhou: ${termo.body}`);
  return id;
}

beforeAll(async () => {
  mem = await bancoEmMemoria({ semear: true });
  const config = carregarConfig({
    NODE_ENV: "test",
    JWT_SEGREDO: "segredo-da-correcao-de-coordenada-com-mais-de-32-bytes",
    LOGIN_POR_IP: "10000",
  } as NodeJS.ProcessEnv);
  app = await construirServidor({
    banco: mem.banco, config,
    armazenamento: armazenamentoEmMemoria({ baseUrl: "http://api.local" }),
  });
  await app.ready();

  tokenCoordenador = await entrar("helena.coutinho@serraalta.exemplo.gov.br");
  tokenOperador = await entrar("jonas.ferreira@serraalta.exemplo.gov.br");
  tokenAgente = await entrar("diego.alves@serraalta.exemplo.gov.br");
  tokenDeFora = await entrar("aurelio.machado@valefundo.exemplo.gov.br");
}, 180_000);

afterAll(async () => {
  await app?.close();
  await mem?.banco.encerrar();
});

describe("Corrigir a coordenada de uma ocorrência aberta", () => {
  it("move o alfinete e devolve o ponto anterior junto", async () => {
    const id = await abrir("Rua das Acácias, 120");

    const r = await corrigir(tokenCoordenador, id, {
      coordenada: { lat: -22.419812, lng: -45.451044 },
      motivo: MOTIVO,
    });

    expect(r.statusCode, r.body).toBe(200);
    expect(r.json().coordenada).toEqual({ lat: -22.419812, lng: -45.451044 });
    // O anterior volta na resposta porque a tela precisa poder dizer o que
    // mudou, e não só que mudou.
    expect(r.json().anterior).toEqual({ lat: -22.4187, lng: -45.4523 });
    expect(await coordenadaGravada(id)).toEqual({
      latitude: -22.419812, longitude: -45.451044,
    });
  });

  it("o operador de plantão corrige: é ele quem digitou errado no telefone", async () => {
    /*
      A permissão é `abrir_ocorrencia`, e essa escolha tem consequência: quem
      registra o chamado é quem erra o ponto, e negar a correção a ele faria a
      correção depender de achar a coordenação no meio de um temporal. O
      caminho fácil voltaria a ser abrir outro protocolo.
    */
    const id = await abrir("Travessa do Cedro, 44");
    const r = await corrigir(tokenOperador, id, {
      coordenada: { lat: -22.42, lng: -45.45 },
      motivo: MOTIVO,
    });
    expect(r.statusCode, r.body).toBe(200);
  });

  it("grava com seis casas decimais o que chega com quinze", async () => {
    /*
      Quinze casas não são precisão, são o resto binário do `Number`. O painel
      já aplicava o teto ao ler o texto colado, mas essa era a única porta com
      teto: por qualquer outra, a mesma coluna passava a guardar duas
      precisões diferentes para o mesmo tipo de dado, e as telas mostravam
      números com aparência de exatidão diferente para o mesmo ponto.
    */
    const id = await abrir("Rua do Mirante, 88");
    const r = await corrigir(tokenCoordenador, id, {
      coordenada: { lat: -22.418712345678901, lng: -45.452312345678901 },
      motivo: MOTIVO,
    });

    expect(r.statusCode, r.body).toBe(200);
    expect(await coordenadaGravada(id)).toEqual({
      latitude: -22.418712, longitude: -45.452312,
    });
  });

  it("a ocorrência que nasceu sem ponto passa a ter um, e o anterior é nulo", async () => {
    /*
      "Não tinha coordenada e passou a ter" é um fato diferente de "o ponto
      estava na quadra de baixo". A trilha precisa separar os dois, senão a
      correção de um chamado sem ponto pareceria a correção de um ponto errado.
    */
    const id = await abrir("Estrada do Retiro, km 4", null);
    const r = await corrigir(tokenCoordenador, id, {
      coordenada: { lat: -22.4301, lng: -45.4402 },
      motivo: MOTIVO,
    });

    expect(r.statusCode, r.body).toBe(200);
    expect(r.json().anterior).toBeNull();

    const evento = (await trilhaDe(id)).find((e) => e.tipo === "correcao_de_coordenada");
    expect(evento!.detalhe["anterior"]).toBeNull();
  });
});

describe("O que a rota recusa", () => {
  it("o agente de campo não corrige, e a recusa é 403", async () => {
    /*
      Ele não tem `abrir_ocorrencia`. O canal dele para dizer onde a casa fica
      é a vistoria, com o GPS do aparelho, e não a edição do registro do
      escritório. Aqui o 403 é o certo: a ocorrência é do município dele, e
      esconder isso não protegeria nada.
    */
    const id = await abrir("Rua da Pedreira, 7");
    const r = await corrigir(tokenAgente, id, {
      coordenada: { lat: -22.42, lng: -45.45 },
      motivo: MOTIVO,
    });

    expect(r.statusCode, r.body).toBe(403);
    expect(r.json().erro).toBe("sem_permissao");
    // E nada foi gravado: a permissão é conferida antes de tocar no banco.
    expect(await coordenadaGravada(id)).toEqual({
      latitude: -22.4187, longitude: -45.4523,
    });
  });

  it("ocorrência de outro município responde 404, nunca 403", async () => {
    /*
      Um 403 confirmaria que aquele identificador existe em alguma prefeitura,
      e confirmar existência já é vazamento. A leitura roda sob RLS, então
      daqui a linha simplesmente não existe.
    */
    const id = await abrir("Alameda dos Ipês, 300");
    const r = await corrigir(tokenDeFora, id, {
      coordenada: { lat: -22.42, lng: -45.45 },
      motivo: MOTIVO,
    });

    expect(r.statusCode, r.body).toBe(404);
    expect(r.json().erro).toBe("nao_encontrada");
    expect(r.body).not.toContain("permiss");
    // O ponto do município vizinho continua onde estava.
    expect(await coordenadaGravada(id)).toEqual({
      latitude: -22.4187, longitude: -45.4523,
    });
  });

  it("ocorrência encerrada não muda de lugar", async () => {
    /*
      Encerrada é peça de processo: o laudo já saiu com a coordenada impressa,
      e mexer no ponto depois faria o documento assinado divergir do banco sem
      que nada na tela avisasse. Encerrada se corrige por evento novo.
    */
    const id = await abrir("Rua Santo Antônio, 15");
    await encerrar(id);

    const r = await corrigir(tokenCoordenador, id, {
      coordenada: { lat: -22.42, lng: -45.45 },
      motivo: MOTIVO,
    });

    expect(r.statusCode, r.body).toBe(409);
    expect(r.json().erro).toBe("ocorrencia_encerrada");
    expect(await coordenadaGravada(id)).toEqual({
      latitude: -22.4187, longitude: -45.4523,
    });
  });

  it("coordenada fora de faixa é recusada pelo esquema compartilhado", async () => {
    const id = await abrir("Rua Bela Vista, 9");

    const latitude = await corrigir(tokenCoordenador, id, {
      coordenada: { lat: -91.2, lng: -45.45 },
      motivo: MOTIVO,
    });
    expect(latitude.statusCode, latitude.body).toBe(422);
    expect(latitude.json().campos.map((c: { campo: string }) => c.campo))
      .toContain("coordenada.lat");

    const longitude = await corrigir(tokenCoordenador, id, {
      coordenada: { lat: -22.42, lng: 181 },
      motivo: MOTIVO,
    });
    expect(longitude.statusCode, longitude.body).toBe(422);

    expect(await coordenadaGravada(id)).toEqual({
      latitude: -22.4187, longitude: -45.4523,
    });
  });

  it("motivo curto é recusado: a trilha não aceita 'erro' como explicação", async () => {
    const id = await abrir("Rua do Comércio, 501");
    const r = await corrigir(tokenCoordenador, id, {
      coordenada: { lat: -22.42, lng: -45.45 },
      motivo: "erro",
    });

    expect(r.statusCode, r.body).toBe(422);
    expect(r.json().campos.map((c: { campo: string }) => c.campo)).toContain("motivo");
  });
});

describe("A trilha guarda o antes, o depois e o porquê", () => {
  it("o evento carrega os dois pontos e o motivo de quem corrigiu", async () => {
    /*
      Gravar só o valor novo apagaria exatamente a informação que a pergunta de
      auditoria pede: por que o laudo impresso aponta para um ponto e o sistema
      aponta para outro. A trilha é append-only (sem policy de UPDATE nem de
      DELETE), então o que não entrar aqui não entra nunca mais.
    */
    const id = await abrir("Rua das Palmeiras, 62");
    await corrigir(tokenCoordenador, id, {
      coordenada: { lat: -22.421, lng: -45.4501 },
      motivo: MOTIVO,
    });

    const eventos = (await trilhaDe(id)).filter((e) => e.tipo === "correcao_de_coordenada");
    expect(eventos, "a correção não entrou na trilha").toHaveLength(1);

    const detalhe = eventos[0]!.detalhe;
    expect(detalhe["anterior"]).toEqual({ lat: -22.4187, lng: -45.4523 });
    expect(detalhe["nova"]).toEqual({ lat: -22.421, lng: -45.4501 });
    expect(detalhe["motivo"]).toBe(MOTIVO);
    expect(detalhe["statusNaCorrecao"]).toBe("registrada");
  });

  it("duas correções seguidas deixam dois eventos encadeados", async () => {
    /*
      O `anterior` da segunda é o `nova` da primeira. Sem isso, a trilha teria
      dois eventos que ninguém consegue pôr em ordem, e o caminho do alfinete
      ficaria com um buraco no meio.
    */
    const id = await abrir("Rua do Rosário, 210");
    await corrigir(tokenCoordenador, id, {
      coordenada: { lat: -22.4211, lng: -45.4502 }, motivo: MOTIVO,
    });
    await corrigir(tokenCoordenador, id, {
      coordenada: { lat: -22.4222, lng: -45.4533 }, motivo: MOTIVO,
    });

    const eventos = (await trilhaDe(id)).filter((e) => e.tipo === "correcao_de_coordenada");
    expect(eventos).toHaveLength(2);
    expect(eventos[1]!.detalhe["anterior"]).toEqual({ lat: -22.4211, lng: -45.4502 });
  });

  it("a correção depois do documento emitido fica marcada como tal", async () => {
    /*
      A DECISÃO SOBRE VISTORIA CONCLUÍDA, exercitada aqui em vez de ficar num
      comentário: a correção continua valendo depois da vistoria e depois de o
      termo ter saído. Recusar ali devolveria o coordenador ao protocolo
      duplicado justamente no caso mais grave, que é o do imóvel interditado no
      endereço errado.

      O que a rota faz em vez de recusar é deixar a divergência visível: o
      laudo é gerado sob demanda e não fica guardado, então a reimpressão sai
      com o ponto novo, diferente do papel que já está dentro do processo. Quem
      comparar os dois encontra a explicação na trilha.
    */
    const id = await comVistoriaEDocumento("Rua do Horto, 31");

    const r = await corrigir(tokenCoordenador, id, {
      coordenada: { lat: -22.4233, lng: -45.4544 },
      motivo: MOTIVO,
    });

    expect(r.statusCode, r.body).toBe(200);
    expect(r.json().documentoJaEmitido).toBe(true);

    const evento = (await trilhaDe(id)).find((e) => e.tipo === "correcao_de_coordenada");
    expect(evento!.detalhe["documentoJaEmitido"]).toBe(true);
    expect(evento!.detalhe["statusNaCorrecao"]).toBe("vistoria_concluida");
  });

  it("o autor do evento é quem apresentou o token, e não quem o corpo disser", async () => {
    const id = await abrir("Rua Nova Esperança, 77");
    await corrigir(tokenOperador, id, {
      coordenada: { lat: -22.4244, lng: -45.4555 },
      motivo: MOTIVO,
      // Ignorado: a identidade vem do token verificado, e mais de lugar nenhum.
      autorNome: "Quem Não É",
    });

    const linha = (await trilhaDe(id))
      .find((e) => e.tipo === "correcao_de_coordenada") as unknown as
      { autor_nome: string; autor_papel: string } | undefined;
    expect(linha, "a correção não entrou na trilha").toBeDefined();
    expect(linha!.autor_nome).toBe("Jonas Ferreira");
    expect(linha!.autor_papel).toBe("operador");
  });
});
