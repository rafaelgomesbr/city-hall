import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { bancoEmMemoria, type BancoEmMemoria } from "../src/banco/memoria.js";
import { carregarConfig } from "../src/config.js";
import { construirServidor } from "../src/servidor.js";
import { armazenamentoEmMemoria } from "../src/armazenamento/memoria.js";
import { formatarDataHora, fusoDoEstado } from "../src/documentos/folha.js";

/**
 * O documento sai no fuso do MUNICÍPIO, e não no relógio do contêiner.
 *
 * O DEFEITO, medido: `formatarDataHora` chamava `toLocaleString("pt-BR")` sem
 * `timeZone`, então o horário impresso era o do processo. Não existe `TZ` em
 * lugar nenhum deste produto (nem no Dockerfile, nem no fly.toml, nem no
 * `.env.example`), e contêiner Node sem tzdata configurada roda em UTC. Uma
 * coleta das 21:30 de Brasília imprimia "21:30" na máquina de quem desenvolve e
 * "00:30 do dia seguinte" em produção. Toda coleta entre 21h e a meia-noite,
 * que é justamente a janela de temporal, saía no laudo com o DIA ERRADO.
 *
 * E o laudo declara, em texto, que "a data de referência do ato é a da vistoria
 * em campo". Um termo de interdição que erra o dia do ato é papel contestável.
 *
 * ESTE ARQUIVO RODA COM `TZ=UTC` DE PROPÓSITO. Um teste escrito no fuso de
 * Brasília passaria na máquina de quem desenvolve e falharia em produção, que é
 * exatamente o defeito. O fuso do processo é restaurado no fim para não vazar
 * para os outros arquivos.
 */

const SENHA = "defesa-civil-2026";
const EQUIPE_ALFA = "11111111-1111-4111-8111-0000000000e1";
const TZ_ORIGINAL = process.env["TZ"];

/** Duas casas, para montar a data esperada sem usar a função sob teste. */
const dois = (n: number) => String(n).padStart(2, "0");

/**
 * Um instante dentro da janela do defeito: 00:30 UTC, que são 21:30 do DIA
 * ANTERIOR em Brasília. Ancorado em ontem para nunca cair no futuro.
 */
const ontem = new Date(Date.now() - 24 * 3_600_000);
const COLETA = new Date(Date.UTC(
  ontem.getUTCFullYear(), ontem.getUTCMonth(), ontem.getUTCDate(), 0, 30, 0,
));
const EM_BRASILIA = new Date(COLETA.getTime() - 3 * 3_600_000);

const ESPERADO = `${dois(EM_BRASILIA.getUTCDate())}/${
  dois(EM_BRASILIA.getUTCMonth() + 1)}/${EM_BRASILIA.getUTCFullYear()}, 21:30`;
const ERRADO_EM_UTC = `${dois(COLETA.getUTCDate())}/${
  dois(COLETA.getUTCMonth() + 1)}/${COLETA.getUTCFullYear()}, 00:30`;

let mem: BancoEmMemoria;
let app: FastifyInstance;
let tokenAgente: string;
let tokenCoordenador: string;

const com = (t: string) => ({ authorization: `Bearer ${t}` });

async function entrar(email: string): Promise<string> {
  const r = await app.inject({
    method: "POST", url: "/auth/entrar", payload: { email, senha: SENHA },
  });
  if (r.statusCode !== 200) throw new Error(`login falhou: ${r.body}`);
  return r.json().acesso;
}

beforeAll(async () => {
  process.env["TZ"] = "UTC";

  mem = await bancoEmMemoria({ semear: true });
  const config = carregarConfig({
    NODE_ENV: "test",
    JWT_SEGREDO: "segredo-de-fuso-do-documento-com-32-bytes-ok",
    LOGIN_POR_IP: "10000",
  } as NodeJS.ProcessEnv);
  app = await construirServidor({
    banco: mem.banco, config,
    armazenamento: armazenamentoEmMemoria({ baseUrl: "http://api.local" }),
  });
  await app.ready();

  tokenAgente = await entrar("diego.alves@serraalta.exemplo.gov.br");
  tokenCoordenador = await entrar("helena.coutinho@serraalta.exemplo.gov.br");
}, 180_000);

afterAll(async () => {
  await app?.close();
  await mem?.banco.encerrar();
  if (TZ_ORIGINAL === undefined) delete process.env["TZ"];
  else process.env["TZ"] = TZ_ORIGINAL;
});

describe("A hora impressa não vem do relógio do servidor", () => {
  it("com TZ=UTC, a coleta das 21:30 de Brasília continua saindo às 21:30", () => {
    expect(process.env["TZ"], "o teste precisa rodar fora do fuso de Brasília")
      .toBe("UTC");
    expect(formatarDataHora(COLETA.toISOString(), fusoDoEstado("MG"))).toBe(ESPERADO);
  });

  it("o dia impresso é o do ato, e não o do dia seguinte", () => {
    const impresso = formatarDataHora(COLETA.toISOString(), fusoDoEstado("MG"));
    expect(impresso).not.toBe(ERRADO_EM_UTC);
    expect(impresso.slice(0, 10)).not.toBe(ERRADO_EM_UTC.slice(0, 10));
  });

  it("cada município tem o seu fuso, e não o de Brasília", () => {
    /*
      Fixar `TZ` no ambiente resolveria hoje e só hoje: este produto é um banco
      só para muitos municípios, e no dia em que entrar uma prefeitura do
      Amazonas ou do Acre o documento dela sairia no horário de Brasília com a
      mesma cara de certo.
    */
    expect(fusoDoEstado("MG")).toBe("America/Sao_Paulo");
    expect(fusoDoEstado("AM")).toBe("America/Manaus");
    expect(fusoDoEstado("AC")).toBe("America/Rio_Branco");
    expect(fusoDoEstado("mt")).toBe("America/Cuiaba");

    const emManaus = formatarDataHora(COLETA.toISOString(), fusoDoEstado("AM"));
    const emSerraAlta = formatarDataHora(COLETA.toISOString(), fusoDoEstado("MG"));
    expect(emManaus).not.toBe(emSerraAlta);
    expect(emManaus.endsWith("20:30")).toBe(true);
  });

  it("UF desconhecida cai num fuso brasileiro fixo, nunca no do processo", () => {
    // Errar em horas num cadastro estragado é ruim; errar de forma diferente em
    // cada servidor é o defeito, porque nunca aparece em teste.
    expect(fusoDoEstado("ZZ")).toBe("America/Sao_Paulo");
    expect(fusoDoEstado(null)).toBe("America/Sao_Paulo");
  });
});

describe("O laudo inteiro, gerado pelo servidor em UTC", () => {
  it("imprime a data da vistoria no fuso do município", async () => {
    const criar = await app.inject({
      method: "POST", url: "/ocorrencias", headers: com(tokenCoordenador),
      payload: {
        solicitanteNome: "Marilda Souza Prado", canalEntrada: "telefone",
        endereco: "Rua do Temporal, 21", tipo: "deslizamento",
        descricao: "Talude cedeu durante a chuva da noite.",
      },
    });
    const id = criar.json().id;
    await app.inject({
      method: "POST", url: `/ocorrencias/${id}/triagem`, headers: com(tokenCoordenador),
      payload: { severidade: "critica", vulnerabilidadePresente: false },
    });
    await app.inject({
      method: "POST", url: `/ocorrencias/${id}/despacho`, headers: com(tokenCoordenador),
      payload: { equipeId: EQUIPE_ALFA, prazoHoras: 4 },
    });
    // A coleta é de ontem, e a rota recusa coleta anterior à abertura do
    // chamado: o chamado precisa ser mais velho que ela.
    await mem.bruto.query(
      "UPDATE ocorrencias SET criado_em = now() - interval '3 days' WHERE id = $1", [id],
    );

    const coletadaEm = COLETA.toISOString();
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
          fotos: [], gpsPrecisaoMetros: 6.2,
          assinanteNome: "Marilda Souza Prado", assinaturaChave: null,
          coletadaEm, observacoes: "Coleta às 21:30, sem sinal no morro.",
        },
      },
    });
    expect(s.statusCode, s.body).toBe(201);

    const laudo = await app.inject({
      method: "GET", url: `/documentos/${id}/laudo`, headers: com(tokenCoordenador),
    });
    expect(laudo.statusCode).toBe(200);
    expect(
      laudo.body.includes(ESPERADO),
      `o laudo não imprimiu ${ESPERADO}, que é a hora do ato em Serra Alta (MG)`,
    ).toBe(true);
    expect(
      laudo.body.includes(ERRADO_EM_UTC),
      "o laudo imprimiu a data do dia seguinte, no fuso do contêiner",
    ).toBe(false);
  }, 60_000);
});
