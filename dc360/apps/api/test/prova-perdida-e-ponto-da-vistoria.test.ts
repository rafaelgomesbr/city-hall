import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { carregarConfig } from "../src/config.js";
import { bancoEmMemoria, type BancoEmMemoria } from "../src/banco/memoria.js";
import { armazenamentoEmMemoria } from "../src/armazenamento/memoria.js";
import { construirServidor } from "../src/servidor.js";

/*
  O MAIOR RISCO JURÍDICO DO PRODUTO, e a coordenada que não viajava.

  ## A foto perdida

  As fotos sobem ANTES do envelope, de propósito: o laudo não pode apontar para
  arquivo que ainda não existe. A consequência era real e não hipotética: se o
  sistema operacional apagou um arquivo do cache (e cache é, por definição, o
  que ele apaga sozinho quando o armazenamento aperta), a leitura dos bytes
  falhava e o ENVELOPE INTEIRO nunca saía. Checklist, GPS, assinatura,
  observações, órgãos a acionar: uma manhã de trabalho no morro destruída
  porque o iPhone liberou espaço.

  A saída não podia ser subir calado sem a foto, e é por isso que o item ficou
  aberto tanto tempo: um laudo que parece completo e não é, é pior do que um
  laudo que não sai. Então são três coisas ao mesmo tempo, e nenhuma delas
  serve sozinha: a coleta sobe, a perda entra na trilha, e o laudo DIZ que
  houve registro capturado em campo que não pôde ser recuperado.

  ## A coordenada

  `rascunho.coordenada` é onde o agente realmente esteve, e do envelope subia
  apenas `gpsPrecisaoMetros`, ou seja, a QUALIDADE de uma medida cujo VALOR
  ficava no celular. O alfinete que o operador colou durante a ligação e o
  ponto onde o imóvel está divergem o tempo todo, e o agente era o único que
  não conseguia reportar o que só ele sabe.

  O que o servidor faz com ela é ESTREITO de propósito, e este arquivo fixa as
  duas metades: ela é gravada como dado da vistoria, e NÃO corrige a coordenada
  da ocorrência. Corrigir é outro ato, com motivo escrito e evento próprio.
*/

let app: FastifyInstance;
let mem: BancoEmMemoria;

const SENHA = "senha-de-teste-bem-longa";
let orgId = "";
let equipeAlfa = "";
let tokenCoord = "";
let tokenAgente = "";

/** O que um GPS de celular devolve de verdade: o resto binário do `Number`. */
const LAT_CRUA = -22.410382999999987;
const LNG_CRUA = -45.456789123456789;
const LAT_SEIS = -22.410383;
const LNG_SEIS = -45.456789;

async function comoUsuario(email: string): Promise<string> {
  const r = await app.inject({
    method: "POST", url: "/auth/entrar", payload: { email, senha: SENHA },
  });
  if (r.statusCode !== 200) throw new Error(`login falhou: ${r.body}`);
  return r.json().acesso as string;
}

const comCoord = () => ({ authorization: `Bearer ${tokenCoord}` });
const comAgente = () => ({ authorization: `Bearer ${tokenAgente}` });

beforeAll(async () => {
  mem = await bancoEmMemoria({ semear: false });
  const config = carregarConfig({
    NODE_ENV: "test",
    JWT_SEGREDO: "segredo-de-teste-com-mais-de-trinta-e-dois-bytes",
    LOGIN_POR_IP: "10000",
  } as NodeJS.ProcessEnv);
  app = await construirServidor({
    banco: mem.banco, config,
    armazenamento: armazenamentoEmMemoria({ baseUrl: "http://127.0.0.1:0" }),
  });
  await app.ready();

  const { derivarSenha } = await import("../src/auth/senha.js");
  const hash = await derivarSenha(SENHA);

  const org = await mem.bruto.query<{ id: string }>(
    "INSERT INTO organizacoes (nome, municipio, uf) VALUES ('Coordenadoria','Serra Alta','MG') RETURNING id",
  );
  orgId = org.rows[0]!.id;

  const alfa = await mem.bruto.query<{ id: string }>(
    "INSERT INTO equipes (organizacao_id, nome) VALUES ($1,'Alfa') RETURNING id", [orgId],
  );
  equipeAlfa = alfa.rows[0]!.id;

  await mem.bruto.query(
    `INSERT INTO usuarios (organizacao_id, nome, matricula, email, papel, senha_hash)
     VALUES ($1,'Helena','C-1','helena@serraalta.exemplo.gov.br','coordenador',$2)`,
    [orgId, hash],
  );
  await mem.bruto.query(
    `INSERT INTO usuarios (organizacao_id, nome, matricula, email, papel, equipe_id, senha_hash)
     VALUES ($1,'Diego','A-1','diego@serraalta.exemplo.gov.br','agente_campo',$2,$3)`,
    [orgId, equipeAlfa, hash],
  );

  tokenCoord = await comoUsuario("helena@serraalta.exemplo.gov.br");
  tokenAgente = await comoUsuario("diego@serraalta.exemplo.gov.br");
}, 120_000);

afterAll(async () => {
  await app.close();
  await mem.banco.encerrar();
});

async function despachada(endereco: string, coordenada?: { lat: number; lng: number }) {
  const aberta = await app.inject({
    method: "POST", url: "/ocorrencias", headers: comCoord(),
    payload: {
      solicitanteNome: "Joana", canalEntrada: "telefone", endereco,
      tipo: "deslizamento", descricao: "Trinca nova depois da chuva.",
      ...(coordenada ? { coordenada } : {}),
    },
  });
  const id = aberta.json().id as string;
  await app.inject({
    method: "POST", url: `/ocorrencias/${id}/triagem`, headers: comCoord(),
    payload: { severidade: "alta", vulnerabilidadePresente: false },
  });
  await app.inject({
    method: "POST", url: `/ocorrencias/${id}/despacho`, headers: comCoord(),
    payload: { equipeId: equipeAlfa, prazoHoras: 24 },
  });
  return id;
}

type Extra = {
  evidenciasPerdidas?: unknown;
  coordenada?: { lat: number; lng: number };
};

function envelope(ocorrenciaId: string, chave: string, extra: Extra = {}) {
  const coletadaEm = new Date(Date.now() - 3_600_000).toISOString();
  return {
    idempotencyKey: chave,
    ocorrenciaId,
    coletadaEm,
    vistoria: {
      checklist: [
        { chave: "risco_iminente", resposta: true },
        { chave: "interdicao_indicada", resposta: false },
        { chave: "evacuacao_necessaria", resposta: false },
        { chave: "acionar_outro_orgao", resposta: false },
      ],
      fotos: [],
      gpsPrecisaoMetros: 11,
      assinanteNome: "Marilda Souza Prado",
      assinaturaChave: null,
      coletadaEm,
      observacoes: "Coleta feita sem sinal, no alto do morro.",
      ...extra,
    },
  };
}

function enviar(corpo: ReturnType<typeof envelope>) {
  return app.inject({
    method: "POST", url: "/sincronizacao/vistoria", headers: comAgente(), payload: corpo,
  });
}

async function perdasDe(vistoriaId: string) {
  const r = await mem.bruto.query<{
    idempotency_key: string; papel: string; legenda: string | null;
    capturada_em: string; latitude: number | null; longitude: number | null;
    ordem: number;
  }>(
    `SELECT idempotency_key, papel, legenda, capturada_em, latitude, longitude, ordem
       FROM vistoria_evidencias_perdidas WHERE vistoria_id = $1 ORDER BY ordem`,
    [vistoriaId],
  );
  return r.rows;
}

async function eventosDe(ocorrenciaId: string) {
  const r = await mem.bruto.query<{ tipo: string; detalhe: unknown }>(
    "SELECT tipo, detalhe FROM trilha_eventos WHERE ocorrencia_id = $1 ORDER BY registrado_em",
    [ocorrenciaId],
  );
  return r.rows;
}

const CAPTURA_UM = "2026-09-14T12:42:00.000Z";
const CAPTURA_DOIS = "2026-09-14T12:47:00.000Z";

describe("a vistoria sobe mesmo com a foto que o aparelho perdeu", () => {
  it("aceita o envelope, grava a vistoria e grava a perda", async () => {
    /*
      O caso inteiro numa asserção: a coleta ENTRA. Antes disto, o agente não
      chegava nem aqui, porque o envelope nunca era montado no aparelho.
    */
    const oc = await despachada("Rua das Acácias, 100");
    const r = await enviar(envelope(oc, "11111111-1111-4111-8111-111111111111", {
      evidenciasPerdidas: [
        {
          idempotencyKey: "foto-a",
          capturadaEm: CAPTURA_UM,
          papel: "foto",
          legenda: "Trinca na parede dos fundos",
          coordenada: { lat: LAT_CRUA, lng: LNG_CRUA },
        },
        { idempotencyKey: "assinatura-a", capturadaEm: CAPTURA_DOIS, papel: "assinatura" },
      ],
    }));

    expect(r.statusCode, `corpo: ${r.body}`).toBe(201);
    const vistoriaId = r.json().vistoriaId as string;

    const perdas = await perdasDe(vistoriaId);
    expect(perdas).toHaveLength(2);
    expect(perdas[0]!.idempotency_key).toBe("foto-a");
    expect(perdas[0]!.papel).toBe("foto");
    expect(perdas[0]!.legenda).toBe("Trinca na parede dos fundos");
    expect(perdas[1]!.papel).toBe("assinatura");

    /*
      O metadado que SOBREVIVEU ao arquivo. Legenda e coordenada vivem no
      rascunho e na fila, não dentro da imagem: jogá-los fora por serem pouco
      seria destruir a única coisa que ainda dá para conferir em campo.

      E a coordenada da foto perdida também respeita o teto de seis casas, pela
      mesma razão de todas as outras.
    */
    expect(perdas[0]!.latitude).toBe(LAT_SEIS);
    expect(perdas[0]!.longitude).toBe(LNG_SEIS);
  });

  it("a perda entra na trilha, com tipo próprio e cada registro nomeado", async () => {
    /*
      Tipo PRÓPRIO, e não um campo dentro do evento de vistoria: a pergunta que
      ele responde é uma lista ("quais vistorias deste município entraram com
      prova faltando", "isto está acontecendo em qual aparelho"), e lista não
      sai de dentro de JSON sem alguém escrever consulta que ninguém revisa.
    */
    const oc = await despachada("Rua das Acácias, 101");
    const r = await enviar(envelope(oc, "22222222-2222-4222-8222-222222222222", {
      evidenciasPerdidas: [
        { idempotencyKey: "foto-b", capturadaEm: CAPTURA_UM, papel: "foto" },
      ],
    }));
    expect(r.statusCode, `corpo: ${r.body}`).toBe(201);

    const eventos = await eventosDe(oc);
    const perda = eventos.find((e) => e.tipo === "vistoria_com_evidencia_perdida");
    expect(perda, `eventos: ${eventos.map((e) => e.tipo).join(", ")}`).toBeTruthy();

    const detalhe = perda!.detalhe as {
      quantidade: number;
      itens: Array<{ idempotencyKey: string; papel: string; capturadaEm: string }>;
    };
    expect(detalhe.quantidade).toBe(1);
    /*
      A hora da captura na trilha não é enfeite: é ela que amarra a declaração
      impressa no laudo a esta linha. "Uma fotografia se perdeu" não permite
      conferir nada daqui a um ano.
    */
    expect(detalhe.itens[0]!.capturadaEm).toBe(CAPTURA_UM);
    expect(detalhe.itens[0]!.idempotencyKey).toBe("foto-b");

    // O evento da vistoria continua existindo, e é outro: a coleta entrou.
    expect(eventos.some((e) => e.tipo === "vistoria")).toBe(true);
  });

  it("o laudo DIZ que houve registro capturado que não pôde ser recuperado", async () => {
    /*
      A peça sem a qual as outras duas não deveriam existir. Um laudo com três
      fotografias, sem nada dizendo que havia cinco, é um documento que PARECE
      completo e não é, e isso é pior do que não entregar documento nenhum,
      porque quem decide sobre a casa de uma família decide achando que viu tudo.
    */
    const oc = await despachada("Rua das Acácias, 102");
    const r = await enviar(envelope(oc, "33333333-3333-4333-8333-333333333333", {
      evidenciasPerdidas: [
        {
          idempotencyKey: "foto-c", capturadaEm: CAPTURA_UM, papel: "foto",
          legenda: "Talude acima da laje",
        },
        { idempotencyKey: "assinatura-c", capturadaEm: CAPTURA_DOIS, papel: "assinatura" },
      ],
    }));
    expect(r.statusCode, `corpo: ${r.body}`).toBe(201);

    const laudo = await app.inject({
      method: "GET", url: `/documentos/${oc}/laudo`, headers: comCoord(),
    });
    expect(laudo.statusCode, `corpo: ${laudo.body}`).toBe(200);
    const html = laudo.body;

    expect(html).toContain("não puderam ser recuperados");
    expect(html).toContain("capturados durante esta vistoria");
    // A legenda é o que resta da prova, e ela sai no papel.
    expect(html).toContain("Talude acima da laje");

    /*
      A ASSINATURA PERDIDA É DITA COM TODAS AS LETRAS. Sem isso a linha de
      assinatura sai em branco no fim da folha e fica indistinguível de uma
      vistoria em que ninguém assinou, que é a lacuna mais grave que este
      documento pode ter.
    */
    expect(html).toContain("Assinatura de quem estava no local");
    expect(html).toContain("sem o traço");

    /*
      E a frase que passou a ser FALSA some. "Nenhuma fotografia foi anexada"
      afirma que não houve registro fotográfico; aqui houve, e ele se perdeu.
      Essa frase seria a única linha falsa do documento, e estaria exatamente no
      lugar onde quem lê procura a prova.
    */
    expect(html).not.toContain("Nenhuma fotografia foi anexada");

    /*
      E A LINHA DE ASSINATURA PARA DE AFIRMAR O CONTRÁRIO.

      Este bloco tinha a metade certa e faltava a que o leitor olha. O parágrafo
      da perda dizia "a linha de assinatura sai sem o traço por essa razão, e não
      por ausência de quem assinou", e ao pé da mesma folha, EM CIMA DO NOME DA
      MORADORA, o documento imprimia "Assinatura não coletada".

      A frase não é um espaço em branco ambíguo: ela AFIRMA um fato, e o fato é
      falso. A moradora assinou no dedo, com a minuta lida em voz alta, e o
      arquivo se perdeu depois. No termo de interdição o rótulo daquela mesma
      caixa é "Responsável pelo imóvel, ciente": o papel que tira uma família de
      casa passaria a declarar, por escrito e com brasão, que ninguém deu ciência
      da interdição. Isso não é lacuna, é motivo para anular o ato, e o
      contraditório dentro do mesmo documento faz o resto do dossiê perder valor
      junto.
    */
    const caixaDaMoradora = html
      .slice(html.lastIndexOf('class="assinaturas"'))
      .split('<div class="assinatura">')
      .find((bloco) => bloco.includes("Marilda Souza Prado"));

    expect(caixaDaMoradora, "o bloco de assinatura da moradora sumiu do documento")
      .toBeDefined();
    expect(
      caixaDaMoradora,
      "o documento afirma 'Assinatura não coletada' sobre uma assinatura que foi "
      + "coletada e se perdeu, e contradiz o próprio bloco de perdas",
    ).not.toContain("Assinatura não coletada");
    expect(caixaDaMoradora).toContain("não recuperada");
  });

  it("envelope SEM perda continua igual: sem linha no laudo, sem evento, sem linha no banco", async () => {
    /*
      A metade que ninguém escreve e que é a que mais quebra. Um bloco novo no
      laudo que aparece em toda vistoria transformaria um documento normal num
      papel que declara ausência de prova sem que nada tenha faltado.
    */
    const oc = await despachada("Rua das Acácias, 103");
    const r = await enviar(envelope(oc, "44444444-4444-4444-8444-444444444444"));
    expect(r.statusCode, `corpo: ${r.body}`).toBe(201);

    expect(await perdasDe(r.json().vistoriaId as string)).toHaveLength(0);
    const eventos = await eventosDe(oc);
    expect(eventos.some((e) => e.tipo === "vistoria_com_evidencia_perdida")).toBe(false);

    const laudo = await app.inject({
      method: "GET", url: `/documentos/${oc}/laudo`, headers: comCoord(),
    });
    expect(laudo.statusCode).toBe(200);
    expect(laudo.body).not.toContain("não puderam ser recuperados");
    // E a frase de sempre continua onde estava, porque aqui ela é verdadeira.
    expect(laudo.body).toContain("Nenhuma fotografia foi anexada");
  });

  it("reenvio da mesma coleta não declara a mesma perda duas vezes", async () => {
    /*
      O reenvio é rotina: o aparelho desiste por tempo esgotado e repete. Sem a
      unicidade, o laudo declararia a mesma fotografia perdida duas vezes e a
      contagem de prova ausente do município contaria em dobro.
    */
    const oc = await despachada("Rua das Acácias, 104");
    const corpo = envelope(oc, "55555555-5555-4555-8555-555555555555", {
      evidenciasPerdidas: [
        { idempotencyKey: "foto-d", capturadaEm: CAPTURA_UM, papel: "foto" },
      ],
    });
    const primeira = await enviar(corpo);
    expect(primeira.statusCode).toBe(201);
    const segunda = await enviar(corpo);
    expect(segunda.statusCode).toBe(200);
    expect(segunda.json().duplicada).toBe(true);

    expect(await perdasDe(primeira.json().vistoriaId as string)).toHaveLength(1);
  });
});

describe("a coordenada da vistoria viaja, e o servidor faz uma coisa só com ela", () => {
  it("chega ao banco arredondada em seis casas, e sai no laudo", async () => {
    /*
      O teto morava no painel e no esquema da correção de coordenada, e mais
      lugar nenhum: o caminho do celular é justamente o que devolve os quinze
      dígitos do `Number`. A mesma coluna guardava seis casas quando o dado
      vinha do painel e quinze quando vinha do morro, e as duas telas mostravam
      aparências de precisão diferentes para o mesmo tipo de dado.
    */
    const oc = await despachada("Rua das Acácias, 105");
    const r = await enviar(envelope(oc, "66666666-6666-4666-8666-666666666666", {
      coordenada: { lat: LAT_CRUA, lng: LNG_CRUA },
    }));
    expect(r.statusCode, `corpo: ${r.body}`).toBe(201);

    const v = await mem.bruto.query<{ latitude: number; longitude: number }>(
      "SELECT latitude, longitude FROM vistorias WHERE id = $1",
      [r.json().vistoriaId as string],
    );
    expect(v.rows[0]!.latitude).toBe(LAT_SEIS);
    expect(v.rows[0]!.longitude).toBe(LNG_SEIS);

    const laudo = await app.inject({
      method: "GET", url: `/documentos/${oc}/laudo`, headers: comCoord(),
    });
    expect(laudo.statusCode).toBe(200);
    expect(laudo.body).toContain("Coordenada capturada no local");
    expect(laudo.body).toContain("-22.410383, -45.456789");
  });

  it("NÃO corrige a coordenada da ocorrência, e não inventa evento de correção", async () => {
    /*
      A DECISÃO DE PRODUTO DESTA FRENTE, fixada aqui para não ser desfeita por
      dedução num turno apressado.

      Gravar onde o agente esteve é um fato daquela ida. Mudar o ponto da
      ocorrência é outro ato, e o produto já o tem (`POST
      /ocorrencias/:id/coordenada`), com três exigências que uma sincronização
      não consegue cumprir:

      1. MOTIVO ESCRITO, mínimo de quinze caracteres, que existe para responder
         meses depois "por que o laudo impresso diz um ponto e o sistema diz
         outro". O envelope não tem essa frase, e o servidor inventar uma seria
         gravar na trilha append-only uma justificativa que ninguém escreveu.
      2. UMA DECISÃO DE PESSOA. Este ponto é onde o APARELHO estava, que pode
         ser o portão, a calçada ou a laje do vizinho, com quarenta metros de
         erro debaixo de chuva.
      3. NÃO SER SILENCIOSA NA REVISTORIA: a segunda ida sobrescreveria a
         primeira, e a ocorrência passaria a apontar para a medida mais recente
         em vez da melhor.

      O que o produto ganha assim mesmo: a informação finalmente chega, sai
      impressa no laudo ao lado da precisão, e a coordenação decide com os dois
      pontos na tela.
    */
    const doOperador = { lat: -22.5, lng: -45.5 };
    const oc = await despachada("Rua das Acácias, 106", doOperador);
    const r = await enviar(envelope(oc, "77777777-7777-4777-8777-777777777777", {
      coordenada: { lat: LAT_CRUA, lng: LNG_CRUA },
    }));
    expect(r.statusCode, `corpo: ${r.body}`).toBe(201);

    /*
      A âncora, e sem ela este caso NÃO SABE FALHAR: "a ocorrência não mudou" é
      verdade também num mundo em que a coordenada da vistoria nunca viajou.
      Então ele primeiro prova que o ponto CHEGOU, e só depois que ele ficou onde
      devia ficar.
    */
    const v = await mem.bruto.query<{ latitude: number; longitude: number }>(
      "SELECT latitude, longitude FROM vistorias WHERE id = $1",
      [r.json().vistoriaId as string],
    );
    expect(v.rows[0]!.latitude).toBe(LAT_SEIS);

    const o = await mem.bruto.query<{ latitude: number; longitude: number }>(
      "SELECT latitude, longitude FROM ocorrencias WHERE id = $1", [oc],
    );
    expect(o.rows[0]!.latitude).toBe(doOperador.lat);
    expect(o.rows[0]!.longitude).toBe(doOperador.lng);

    const eventos = await eventosDe(oc);
    expect(eventos.some((e) => e.tipo === "correcao_de_coordenada")).toBe(false);
  });

  it("a coordenada da ABERTURA também passa a ser gravada em seis casas", async () => {
    /*
      A outra porta do mesmo teto. Enquanto ele existia só no painel, bastava
      qualquer outro cliente chamar a rota de abertura para os quinze dígitos
      entrarem por baixo.
    */
    const oc = await despachada("Rua das Acácias, 107", { lat: LAT_CRUA, lng: LNG_CRUA });
    const o = await mem.bruto.query<{ latitude: number; longitude: number }>(
      "SELECT latitude, longitude FROM ocorrencias WHERE id = $1", [oc],
    );
    expect(o.rows[0]!.latitude).toBe(LAT_SEIS);
    expect(o.rows[0]!.longitude).toBe(LNG_SEIS);
  });

  it("vistoria sem coordenada continua entrando, e o laudo diz que não foi registrada", async () => {
    /*
      Nunca obrigatória: vistoria em vão de morro com o céu tapado fica sem
      leitura de GPS, e exigir o ponto faria a coleta ser recusada exatamente
      onde ela é mais difícil de refazer.
    */
    const oc = await despachada("Rua das Acácias, 108");
    const r = await enviar(envelope(oc, "88888888-8888-4888-8888-888888888888"));
    expect(r.statusCode, `corpo: ${r.body}`).toBe(201);

    const v = await mem.bruto.query<{ latitude: number | null }>(
      "SELECT latitude FROM vistorias WHERE id = $1", [r.json().vistoriaId as string],
    );
    expect(v.rows[0]!.latitude).toBeNull();

    const laudo = await app.inject({
      method: "GET", url: `/documentos/${oc}/laudo`, headers: comCoord(),
    });
    expect(laudo.body).toContain("Coordenada capturada no local");
    expect(laudo.body).toContain("não registrada");
  });
});
