import { generateKeyPairSync } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { carregarConfig } from "../src/config.js";
import { bancoEmMemoria, type BancoEmMemoria } from "../src/banco/memoria.js";
import { armazenamentoEmMemoria } from "../src/armazenamento/memoria.js";
import { construirServidor } from "../src/servidor.js";
import { criarProvedorApns } from "../src/push/apns.js";
import { criarProvedorFcm } from "../src/push/fcm.js";
import { criarEnvio, type Alvo, type DesfechoDoEnvio, type EnvioDePush } from "../src/push/envio.js";
import { textoVisivel, type Notificacao } from "../src/push/mensagem.js";
import { travaDeProcesso, type Trava } from "../src/push/trava.js";
import { varrerAvisos } from "../src/push/varredor.js";

/*
  O AVISO DE DESPACHO NASCE NO DESPACHO, e não no relógio.

  O pedido, na letra de quem paga (15/09/2026): "o celular do usuário agente
  de campo deve obrigatoriamente ser notificado, vibrado ou sonoro, que ele
  recebeu uma nova ocorrência, com som característico".

  A outra frente entregou o SOM e a CARGA (`mensagem.ts`, `apns.ts`, `fcm.ts`)
  e descobriu que o servidor nunca produzia `tarefa_nova`: o único push que
  saía era `prazo_vencendo`, pelo varredor. `POST /ocorrencias/:id/despacho`
  gravava o despacho e o evento na trilha e não enfileirava aviso nenhum. Um
  som característico para um aviso que nunca sai é enfeite.

  O que este arquivo tranca, em três blocos:

    1. O despacho enfileira UMA linha `tarefa_nova` em `notificacoes_enviadas`
       por aparelho vivo de cada usuário ativo da equipe despachada, dentro da
       MESMA transação do despacho, no estado `pendente`. Quem não deve
       receber (usuário desativado, aparelho revogado, equipe sem aparelho)
       fica de fora sem quebrar o despacho.
    2. O redespacho não duplica para a mesma equipe (a unicidade da migração
       016 cuida) e avisa a equipe nova quando a equipe muda.
    3. O varredor envia as pendentes na mesma rodada do prazo, com a mesma
       trava e o mesmo tratamento de ficha morta, e o que sai é o som e o
       canal de despacho, com a vitrine genérica.

  NENHUM ENVIO DE VERDADE ACONTECE AQUI: os provedores são dublês que capturam
  o corpo que iria para a Apple e para o Google.
*/

let app: FastifyInstance;
let mem: BancoEmMemoria;
let orgId = "";
let orgVizinha = "";
let ocorrenciaDaVizinha = "";
let token = "";
let linhasDeLog: string[] = [];

const SENHA = "senha-de-teste-bem-longa";

type Envio = { alvo: Alvo; notificacao: Notificacao };

/** Envio falso que registra tudo que sairia, e responde o que o teste mandar. */
function envioEspiao(
  resposta: (alvo: Alvo) => DesfechoDoEnvio | Promise<DesfechoDoEnvio> =
    () => ({ desfecho: "entregue", detalhe: null }),
): { enviar: EnvioDePush; enviados: Envio[] } {
  const enviados: Envio[] = [];
  return {
    enviados,
    enviar: async (alvo, notificacao) => {
      enviados.push({ alvo, notificacao });
      return resposta(alvo);
    },
  };
}

/*
  Os dublês de APNs e FCM, os mesmos de `push-canal-e-som.test.ts`: capturam o
  corpo HTTP que iria para a Apple e para o Google, sem falar com nenhum dos
  dois. Aqui eles provam o caminho INTEIRO, do despacho ao corpo do push.
*/
function chaveEc(): string {
  const { privateKey } = generateKeyPairSync("ec", { namedCurve: "prime256v1" });
  return privateKey.export({ type: "pkcs8", format: "pem" }).toString();
}

function contaDeTeste() {
  const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  return {
    project_id: "dc360-exemplo",
    client_email: "push@dc360-exemplo.iam.gserviceaccount.com",
    private_key: privateKey.export({ type: "pkcs8", format: "pem" }).toString(),
    token_uri: "https://oauth2.exemplo/token",
  };
}

function capturarApns() {
  const enviados: string[] = [];
  const provedor = criarProvedorApns(
    { keyId: "K", teamId: "T", bundle: "com.exemplo.app", chavePem: chaveEc() },
    {
      transporte: async (pedido) => { enviados.push(pedido.corpo); return { status: 200, corpo: "" }; },
    },
  );
  return { provedor, enviados };
}

function capturarFcm() {
  const conta = contaDeTeste();
  const enviados: string[] = [];
  const provedor = criarProvedorFcm(conta, {
    buscar: async (url, o) => {
      if (url === conta.token_uri) {
        return {
          status: 200,
          text: async () => JSON.stringify({ access_token: "acesso-de-teste", expires_in: 3600 }),
        };
      }
      enviados.push(o.body);
      return { status: 200, text: async () => "{}" };
    },
  });
  return { provedor, enviados };
}

function varrer(enviar: EnvioDePush, trava: Trava = travaDeProcesso()) {
  return varrerAvisos({ banco: mem.banco, trava, enviar, janelaMinutos: 60 });
}

const cabecalho = () => ({ authorization: `Bearer ${token}` });

let contador = 0;

async function abrirETriar(severidade: "critica" | "alta" | "media" | "baixa" = "media"): Promise<string> {
  contador += 1;
  const aberta = await app.inject({
    method: "POST", url: "/ocorrencias", headers: cabecalho(),
    payload: {
      solicitanteNome: "Marilda Nogueira", canalEntrada: "telefone",
      endereco: `Servidão Boa Esperança, ${100 + contador}`, tipo: "deslizamento",
      descricao: "Talude cedeu atrás da casa depois da chuva.",
    },
  });
  expect(aberta.statusCode).toBe(201);
  const id = aberta.json().id as string;
  const triagem = await app.inject({
    method: "POST", url: `/ocorrencias/${id}/triagem`, headers: cabecalho(),
    payload: { severidade, vulnerabilidadePresente: false },
  });
  expect(triagem.statusCode).toBe(200);
  return id;
}

async function criarEquipe(): Promise<string> {
  contador += 1;
  const r = await app.inject({
    method: "POST", url: "/equipes", headers: cabecalho(),
    payload: { nome: `Equipe ${contador}` },
  });
  expect(r.statusCode).toBe(201);
  return r.json().id as string;
}

async function criarAgente(equipeId: string, opcoes: { ativo?: boolean } = {}): Promise<string> {
  contador += 1;
  const r = await mem.bruto.query<{ id: string }>(
    `INSERT INTO usuarios (organizacao_id, nome, matricula, email, papel, equipe_id, ativo)
     VALUES ($1, $2, $3, $4, 'agente_campo', $5, $6) RETURNING id`,
    [orgId, `Agente ${contador}`, `SA-${contador}`,
     `agente${contador}@serraalta.exemplo.gov.br`, equipeId, opcoes.ativo ?? true],
  );
  return r.rows[0]!.id;
}

async function registrarAparelho(
  usuarioId: string, ficha: string, plataforma: "ios" | "android" = "ios",
  opcoes: { revogado?: boolean } = {},
): Promise<string> {
  const r = await mem.bruto.query<{ id: string }>(
    `INSERT INTO aparelhos (organizacao_id, usuario_id, plataforma, ficha, revogado_em, motivo_revogacao)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
    [orgId, usuarioId, plataforma, ficha,
     opcoes.revogado ? new Date() : null, opcoes.revogado ? "saida do usuario" : null],
  );
  return r.rows[0]!.id;
}

async function despachar(ocorrenciaId: string, equipeId: string) {
  return app.inject({
    method: "POST", url: `/ocorrencias/${ocorrenciaId}/despacho`, headers: cabecalho(),
    payload: { equipeId, prazoHoras: 6 },
  });
}

type Aviso = {
  id: string; aparelho_id: string; tipo: string; desfecho: string;
  detalhe: string | null; tentativas: number; organizacao_id: string;
};

async function avisosDe(ocorrenciaId: string, tipo = "tarefa_nova"): Promise<Aviso[]> {
  const r = await mem.bruto.query<Aviso>(
    `SELECT id, aparelho_id, tipo, desfecho, detalhe, tentativas, organizacao_id
       FROM notificacoes_enviadas
      WHERE ocorrencia_id = $1 AND tipo = $2
      ORDER BY enviada_em, id`,
    [ocorrenciaId, tipo],
  );
  return r.rows;
}

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
    destinoDeLog: { write: (linha: string) => { linhasDeLog.push(linha); } },
  });
  await app.ready();

  const { derivarSenha } = await import("../src/auth/senha.js");
  const hash = await derivarSenha(SENHA);
  const org = await mem.bruto.query<{ id: string }>(
    "INSERT INTO organizacoes (nome, municipio, uf) VALUES ('DC Serra Alta','Serra Alta','MG') RETURNING id",
  );
  orgId = org.rows[0]!.id;
  await mem.bruto.query(
    `INSERT INTO usuarios (organizacao_id, nome, matricula, email, papel, senha_hash)
     VALUES ($1,'Helena','C-1','helena@serraalta.exemplo.gov.br','coordenador',$2)`,
    [orgId, hash],
  );
  await mem.bruto.query(
    "INSERT INTO protocolo_sequencias (organizacao_id, ano, ultimo) VALUES ($1,$2,1)",
    [orgId, new Date().getFullYear()],
  );

  // O município vizinho, com uma ocorrência que Serra Alta não pode alcançar.
  const vizinha = await mem.bruto.query<{ id: string }>(
    "INSERT INTO organizacoes (nome, municipio, uf) VALUES ('DC Vale Fundo','Vale Fundo','MG') RETURNING id",
  );
  orgVizinha = vizinha.rows[0]!.id;
  const oc = await mem.bruto.query<{ id: string }>(
    `INSERT INTO ocorrencias
       (organizacao_id, protocolo, tipo, status, severidade, endereco, solicitante_nome,
        canal_entrada, descricao, prazo_em)
     VALUES ($1,'000001/2026','inundacao','triagem','alta','Avenida Central, 900','Tarcísio',
             'telefone','Água entrando pela área de serviço.', now() + interval '20 hours')
     RETURNING id`,
    [orgVizinha],
  );
  ocorrenciaDaVizinha = oc.rows[0]!.id;

  const r = await app.inject({
    method: "POST", url: "/auth/entrar",
    payload: { email: "helena@serraalta.exemplo.gov.br", senha: SENHA },
  });
  token = r.json().acesso;
}, 180_000);

beforeEach(() => {
  linhasDeLog = [];
});

afterAll(async () => {
  await app.close();
  await mem.banco.encerrar();
});

describe("O despacho enfileira o aviso de tarefa nova, na mesma transação", () => {
  it("uma linha pendente por aparelho vivo de cada usuário ativo da equipe", async () => {
    const equipe = await criarEquipe();
    const diego = await criarAgente(equipe);
    const marta = await criarAgente(equipe);
    // Diego tem dois aparelhos (o da prefeitura e o próprio): recebe nos dois.
    const doDiegoIos = await registrarAparelho(diego, "ficha-diego-ios", "ios");
    const doDiegoAndroid = await registrarAparelho(diego, "ficha-diego-android", "android");
    const daMarta = await registrarAparelho(marta, "ficha-marta", "android");
    const ocorrencia = await abrirETriar("baixa");

    const r = await despachar(ocorrencia, equipe);
    expect(r.statusCode).toBe(200);

    const avisos = await avisosDe(ocorrencia);
    expect(avisos.map((a) => a.aparelho_id).sort())
      .toEqual([doDiegoIos, doDiegoAndroid, daMarta].sort());
    for (const aviso of avisos) {
      expect(aviso.tipo).toBe("tarefa_nova");
      /*
        `pendente`, e não `enviando`: `enviando` é o estado REIVINDICADO por um
        processo que está falando com a Apple ou com o Google agora, e o
        varredor só o retoma depois da espera (dez minutos). O despacho não
        reivindica nada: ele deixa o aviso na fila para a rodada seguinte, que
        vem em até cinco minutos, e a rodada é quem reivindica.
      */
      expect(aviso.desfecho).toBe("pendente");
      expect(aviso.tentativas).toBe(0);
      expect(aviso.organizacao_id).toBe(orgId);
    }
  });

  it("usuário desativado e aparelho revogado ficam de fora", async () => {
    const equipe = await criarEquipe();
    const ativo = await criarAgente(equipe);
    const desativado = await criarAgente(equipe, { ativo: false });
    const vivo = await registrarAparelho(ativo, "ficha-viva");
    await registrarAparelho(ativo, "ficha-revogada", "ios", { revogado: true });
    await registrarAparelho(desativado, "ficha-de-quem-saiu");
    const ocorrencia = await abrirETriar();

    expect((await despachar(ocorrencia, equipe)).statusCode).toBe(200);

    expect((await avisosDe(ocorrencia)).map((a) => a.aparelho_id)).toEqual([vivo]);
  });

  it("equipe sem aparelho: o despacho dá 200, não enfileira nada, e o log diz zero", async () => {
    const equipe = await criarEquipe();
    await criarAgente(equipe);
    const ocorrencia = await abrirETriar();

    expect((await despachar(ocorrencia, equipe)).statusCode).toBe(200);

    expect(await avisosDe(ocorrencia)).toHaveLength(0);
    // O despacho em si continua registrado: o aviso é consequência, não condição.
    const trilha = await mem.bruto.query<{ n: string }>(
      "SELECT count(*)::text AS n FROM trilha_eventos WHERE ocorrencia_id = $1 AND tipo = 'despacho'",
      [ocorrencia],
    );
    expect(trilha.rows[0]!.n).toBe("1");

    const linha = linhasDeLog.find((l) => l.includes("tarefa nova"));
    expect(linha, "o despacho não registrou quantos aparelhos alcançou").toBeDefined();
    expect(JSON.parse(linha!).aparelhos).toBe(0);
  });

  it("o log diz quantos aparelhos foram alcançados, sem ficha nem nome", async () => {
    const equipe = await criarEquipe();
    const agente = await criarAgente(equipe);
    await registrarAparelho(agente, "ficha-secreta-do-agente");
    await registrarAparelho(agente, "outra-ficha-secreta", "android");
    const ocorrencia = await abrirETriar();

    await despachar(ocorrencia, equipe);

    const linha = linhasDeLog.find((l) => l.includes("tarefa nova"));
    expect(linha).toBeDefined();
    expect(JSON.parse(linha!).aparelhos).toBe(2);
    expect(linha).not.toContain("ficha-secreta");
    expect(linha).not.toContain("Agente ");
  });

  it("redespacho para a mesma equipe não duplica o aviso", async () => {
    const equipe = await criarEquipe();
    const agente = await criarAgente(equipe);
    const aparelho = await registrarAparelho(agente, "ficha-do-redespacho");
    const ocorrencia = await abrirETriar();

    expect((await despachar(ocorrencia, equipe)).statusCode).toBe(200);
    expect((await despachar(ocorrencia, equipe)).statusCode).toBe(200);

    const avisos = await avisosDe(ocorrencia);
    expect(avisos).toHaveLength(1);
    expect(avisos[0]!.aparelho_id).toBe(aparelho);
  });

  it("redespacho para outra equipe avisa a equipe nova, e não repete para a antiga", async () => {
    const alfa = await criarEquipe();
    const bravo = await criarEquipe();
    const doAlfa = await registrarAparelho(await criarAgente(alfa), "ficha-alfa");
    const doBravo = await registrarAparelho(await criarAgente(bravo), "ficha-bravo");
    const ocorrencia = await abrirETriar();

    await despachar(ocorrencia, alfa);
    expect((await avisosDe(ocorrencia)).map((a) => a.aparelho_id)).toEqual([doAlfa]);

    expect((await despachar(ocorrencia, bravo)).statusCode).toBe(200);
    expect((await avisosDe(ocorrencia)).map((a) => a.aparelho_id).sort())
      .toEqual([doAlfa, doBravo].sort());
  });

  it("ocorrência de outro município: 404, e nenhum aviso em lugar nenhum", async () => {
    const equipe = await criarEquipe();
    await registrarAparelho(await criarAgente(equipe), "ficha-que-nao-deve-ouvir");

    const r = await despachar(ocorrenciaDaVizinha, equipe);
    expect(r.statusCode).toBe(404);

    expect(await avisosDe(ocorrenciaDaVizinha)).toHaveLength(0);
  });
});

describe("O varredor envia as pendentes na mesma rodada, sob a mesma trava", () => {
  // O bloco de cima deixa pendentes na fila de propósito (ele prova que elas
  // entram). Uma rodada descartável esvazia a fila antes de cada caso daqui,
  // para as contagens serem só do que o caso despachou.
  beforeEach(async () => {
    await varrer(envioEspiao().enviar);
  });

  it("envia a tarefa nova com o dado certo e marca entregue", async () => {
    const equipe = await criarEquipe();
    await registrarAparelho(await criarAgente(equipe), "ficha-que-recebe");
    const ocorrencia = await abrirETriar("alta");
    await despachar(ocorrencia, equipe);

    const espiao = envioEspiao();
    const resumo = await varrer(espiao.enviar);

    expect(resumo.reivindicadas).toBe(1);
    expect(resumo.entregues).toBe(1);
    expect(espiao.enviados).toHaveLength(1);
    const { alvo, notificacao } = espiao.enviados[0]!;
    expect(alvo.ficha).toBe("ficha-que-recebe");
    expect(notificacao.dados.tipo).toBe("tarefa_nova");
    expect(notificacao.dados.ocorrenciaId).toBe(ocorrencia);
    // O município no dado é a terceira barreira: o aplicativo descarta o
    // aviso de uma prefeitura em que a pessoa não trabalha. Ver a migração 016.
    expect(notificacao.dados.organizacaoId).toBe(orgId);
    expect(notificacao.dados.severidade).toBe("alta");

    const [aviso] = await avisosDe(ocorrencia);
    expect(aviso!.desfecho).toBe("entregue");
    expect(aviso!.tentativas).toBe(1);
  });

  it("a segunda rodada não manda de novo", async () => {
    const equipe = await criarEquipe();
    await registrarAparelho(await criarAgente(equipe), "ficha-uma-vez-so");
    const ocorrencia = await abrirETriar();
    await despachar(ocorrencia, equipe);

    await varrer(envioEspiao().enviar);
    const segunda = envioEspiao();
    const resumo = await varrer(segunda.enviar);

    expect(segunda.enviados).toHaveLength(0);
    expect(resumo.reivindicadas).toBe(0);
  });

  it("iOS recebe despacho.wav sensível ao tempo; Android recebe o canal de despacho", async () => {
    const equipe = await criarEquipe();
    const agente = await criarAgente(equipe);
    await registrarAparelho(agente, "ficha-ios-de-verdade", "ios");
    await registrarAparelho(agente, "ficha-android-de-verdade", "android");
    // Severidade BAIXA de propósito: o despacho toca em toda severidade.
    const ocorrencia = await abrirETriar("baixa");
    await despachar(ocorrencia, equipe);

    const apple = capturarApns();
    const google = capturarFcm();
    const resumo = await varrer(criarEnvio({ apple: apple.provedor, google: google.provedor }));
    expect(resumo.entregues).toBe(2);

    expect(apple.enviados).toHaveLength(1);
    const aps = JSON.parse(apple.enviados[0]!).aps;
    expect(aps.sound).toBe("despacho.wav");
    expect(aps["interruption-level"]).toBe("time-sensitive");

    expect(google.enviados).toHaveLength(1);
    const mensagem = JSON.parse(google.enviados[0]!).message;
    expect(mensagem.data.channelId).toBe("dc360.despacho.v1");
    expect(mensagem.android.notification.channel_id).toBe("dc360.despacho.v1");
    expect(mensagem.android.notification.sound).toBe("despacho");
    expect(mensagem.android.priority).toBe("high");
  });

  it("a vitrine continua genérica: protocolo, endereço e severidade não ficam legíveis na tela bloqueada", async () => {
    const equipe = await criarEquipe();
    await registrarAparelho(await criarAgente(equipe), "ficha-da-vitrine");
    const ocorrencia = await abrirETriar("critica");
    await despachar(ocorrencia, equipe);
    const dados = await mem.bruto.query<{ protocolo: string; endereco: string }>(
      "SELECT protocolo, endereco FROM ocorrencias WHERE id = $1", [ocorrencia],
    );
    const { protocolo, endereco } = dados.rows[0]!;

    const espiao = envioEspiao();
    await varrer(espiao.enviar);

    const aviso = espiao.enviados[0]!.notificacao;
    const visivel = textoVisivel(aviso).toLowerCase();
    for (const segredo of [protocolo, endereco, "critica", "Marilda", orgId, ocorrencia]) {
      expect(
        visivel.includes(segredo.toLowerCase()),
        `"${segredo}" apareceu na tela bloqueada: "${visivel}"`,
      ).toBe(false);
    }
    // Nem no dado: ele também atravessa a fronteira (SUBPROCESSADORES 2.3).
    expect(aviso.dados.protocolo).toBeUndefined();
    expect(aviso.dados.endereco).toBeUndefined();
  });

  it("ficha morta revoga o aparelho, como no prazo, e ele não é tentado de novo", async () => {
    const equipe = await criarEquipe();
    const agente = await criarAgente(equipe);
    await registrarAparelho(agente, "ficha-morta-no-despacho");
    const ocorrencia = await abrirETriar();
    await despachar(ocorrencia, equipe);

    const resumo = await varrer(async () => ({
      desfecho: "ficha_invalida", detalhe: "apns 410 Unregistered",
    }));
    expect(resumo.aparelhosRevogados).toBe(1);

    const aparelho = await mem.bruto.query<{ revogado_em: string | null; motivo_revogacao: string }>(
      "SELECT revogado_em, motivo_revogacao FROM aparelhos WHERE ficha = 'ficha-morta-no-despacho'",
    );
    expect(aparelho.rows[0]!.revogado_em).not.toBeNull();
    expect(aparelho.rows[0]!.motivo_revogacao).toMatch(/provedor/);
    expect((await avisosDe(ocorrencia))[0]!.desfecho).toBe("ficha_invalida");

    await mem.bruto.query(
      "UPDATE notificacoes_enviadas SET enviada_em = now() - interval '1 hour' WHERE ocorrencia_id = $1",
      [ocorrencia],
    );
    const depois = envioEspiao();
    await varrer(depois.enviar);
    expect(depois.enviados).toHaveLength(0);
  });

  it("o que falhou volta depois da espera, e conta a tentativa", async () => {
    const equipe = await criarEquipe();
    await registrarAparelho(await criarAgente(equipe), "ficha-que-falha-uma-vez");
    const ocorrencia = await abrirETriar();
    await despachar(ocorrencia, equipe);

    await varrer(async () => ({ desfecho: "falha", detalhe: "apns 429 TooManyRequests" }));
    expect((await avisosDe(ocorrencia))[0]!.desfecho).toBe("falha");

    // Sem esperar, não martela o provedor que acabou de recusar.
    const cedoDemais = envioEspiao();
    await varrer(cedoDemais.enviar);
    expect(cedoDemais.enviados).toHaveLength(0);

    await mem.bruto.query(
      "UPDATE notificacoes_enviadas SET enviada_em = now() - interval '30 minutes' WHERE ocorrencia_id = $1",
      [ocorrencia],
    );
    const depois = envioEspiao();
    await varrer(depois.enviar);
    expect(depois.enviados).toHaveLength(1);
    const [aviso] = await avisosDe(ocorrencia);
    expect(aviso!.desfecho).toBe("entregue");
    expect(aviso!.tentativas).toBe(2);
  });

  it("aparelho revogado entre o despacho e a rodada não recebe", async () => {
    /*
      O agente saiu do aplicativo (ou o aparelho trocou de mão) nos minutos
      entre o despacho e a rodada. A ficha continua na tabela, mas o aparelho
      está revogado: mandar para ele seria escrever na tela bloqueada de quem
      já não está no plantão.
    */
    const equipe = await criarEquipe();
    await registrarAparelho(await criarAgente(equipe), "ficha-que-saiu-a-tempo");
    const ocorrencia = await abrirETriar();
    await despachar(ocorrencia, equipe);
    await mem.bruto.query(
      "UPDATE aparelhos SET revogado_em = now(), motivo_revogacao = 'saida do usuario' WHERE ficha = 'ficha-que-saiu-a-tempo'",
    );

    const espiao = envioEspiao();
    await varrer(espiao.enviar);
    expect(espiao.enviados).toHaveLength(0);
  });

  it("redespachada para outra equipe antes da rodada, só a equipe nova recebe", async () => {
    /*
      A equipe responsável é conferida na rodada, e não só no despacho: é a
      mesma regra do prazo (migração 016). Sem isso, a equipe antiga receberia
      "a sua equipe recebeu uma tarefa" sobre uma tarefa que já não é dela.
    */
    const alfa = await criarEquipe();
    const bravo = await criarEquipe();
    await registrarAparelho(await criarAgente(alfa), "ficha-alfa-que-perdeu");
    await registrarAparelho(await criarAgente(bravo), "ficha-bravo-que-ganhou");
    const ocorrencia = await abrirETriar();
    await despachar(ocorrencia, alfa);
    await despachar(ocorrencia, bravo);

    const espiao = envioEspiao();
    await varrer(espiao.enviar);
    expect(espiao.enviados.map((e) => e.alvo.ficha)).toEqual(["ficha-bravo-que-ganhou"]);
  });

  it("tarefa nova e prazo saem na mesma rodada, e a trava segura os dois", async () => {
    const equipe = await criarEquipe();
    await registrarAparelho(await criarAgente(equipe), "ficha-dos-dois-avisos");
    const ocorrencia = await abrirETriar("critica");
    await despachar(ocorrencia, equipe);
    // O prazo entra na janela de uma hora.
    await mem.bruto.query(
      "UPDATE ocorrencias SET prazo_em = now() + interval '20 minutes' WHERE id = $1",
      [ocorrencia],
    );

    const ocupada: Trava = {
      tentar: async () => false, soltar: async () => {}, encerrar: async () => {},
    };
    const travado = envioEspiao();
    const resumoTravado = await varrer(travado.enviar, ocupada);
    expect(resumoTravado.travado).toBe(true);
    expect(travado.enviados).toHaveLength(0);
    expect((await avisosDe(ocorrencia))[0]!.desfecho).toBe("pendente");

    const espiao = envioEspiao();
    const resumo = await varrer(espiao.enviar);
    expect(resumo.reivindicadas).toBe(2);
    expect(resumo.entregues).toBe(2);
    expect(espiao.enviados.map((e) => e.notificacao.dados.tipo).sort())
      .toEqual(["prazo_vencendo", "tarefa_nova"]);
    expect((await avisosDe(ocorrencia))[0]!.desfecho).toBe("entregue");
    expect((await avisosDe(ocorrencia, "prazo_vencendo"))[0]!.desfecho).toBe("entregue");
  });
});
