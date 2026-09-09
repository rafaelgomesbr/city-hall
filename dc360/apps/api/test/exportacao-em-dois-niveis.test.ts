import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { bancoEmMemoria, type BancoEmMemoria } from "../src/banco/memoria.js";
import { carregarConfig } from "../src/config.js";
import { construirServidor } from "../src/servidor.js";
import { armazenamentoEmMemoria } from "../src/armazenamento/memoria.js";

/**
 * A exportação em dois níveis.
 *
 * O DEFEITO QUE ISTO CORRIGE: existia um botão só, e ele produzia um arquivo
 * com nome, contato e marca de vulnerabilidade de todas as famílias
 * atendidas. Quem só queria responder à câmara quantos chamados houve por
 * bairro levava, no mesmo arquivo, a lista de quem ligou para a Defesa Civil.
 * Esse arquivo sai do sistema e passa a viver num pen drive, num anexo de
 * email e numa pasta compartilhada, e nada consegue trazê-lo de volta.
 *
 * O nível completo continua existindo porque ele é necessário de verdade
 * (migração de sistema, atendimento a pedido do titular, requisição
 * judicial). O que muda é que ele deixou de ser o caminho de menor esforço:
 * exige posto de administrador, justificativa escrita e um recorte que caiba
 * no teto, e o que sai fica registrado em dois lugares.
 */

const SENHA = "defesa-civil-2026";
const ORG_SERRA_ALTA = "11111111-1111-4111-8111-000000000001";
const JUSTIFICATIVA = "Atendimento a pedido de acesso do titular, processo 2026/114.";

let mem: BancoEmMemoria;
let app: FastifyInstance;
let tokenCoordenador: string;
let tokenAdministrador: string;
let tokenOperador: string;

async function entrar(email: string): Promise<string> {
  const r = await app.inject({
    method: "POST", url: "/auth/entrar", payload: { email, senha: SENHA },
  });
  if (r.statusCode !== 200) throw new Error(`login falhou: ${r.body}`);
  return r.json().acesso;
}

const com = (t: string) => ({ authorization: `Bearer ${t}` });

const completo = (justificativa = JUSTIFICATIVA) =>
  `/relatorios/ocorrencias.csv?nivel=completo&justificativa=${encodeURIComponent(justificativa)}`;

async function ultimaExportacao() {
  const r = await mem.bruto.query<{
    nivel: string; justificativa: string | null; total_registros: number;
    usuario_nome: string;
  }>("SELECT * FROM exportacoes ORDER BY criada_em DESC, ctid DESC LIMIT 1");
  return r.rows[0];
}

beforeAll(async () => {
  mem = await bancoEmMemoria({ semear: true });
  const config = carregarConfig({
    NODE_ENV: "test",
    JWT_SEGREDO: "segredo-da-exportacao-em-dois-niveis-32-bytes",
    LOGIN_POR_IP: "10000",
  } as NodeJS.ProcessEnv);
  app = await construirServidor({
    banco: mem.banco, config,
    armazenamento: armazenamentoEmMemoria({ baseUrl: "http://api.local" }),
  });
  await app.ready();

  tokenCoordenador = await entrar("helena.coutinho@serraalta.exemplo.gov.br");
  tokenAdministrador = await entrar("rita.lopes@serraalta.exemplo.gov.br");
  tokenOperador = await entrar("jonas.ferreira@serraalta.exemplo.gov.br");
}, 180_000);

afterAll(async () => {
  await app?.close();
  await mem?.banco.encerrar();
});

describe("O padrão é o nível que não leva pessoa", () => {
  it("sem parâmetro nenhum, o CSV sai sem nome, contato, vulnerabilidade e relato", async () => {
    const r = await app.inject({
      method: "GET", url: "/relatorios/ocorrencias.csv", headers: com(tokenCoordenador),
    });
    expect(r.statusCode).toBe(200);

    const cabecalho = r.body.replace("﻿", "").split("\r\n")[0]!;
    expect(cabecalho).not.toContain("Solicitante");
    expect(cabecalho).not.toContain("Relato");
    expect(cabecalho).not.toContain("Vulnerabilidade (descrição)");

    // Os dados da semente, conferidos no corpo e não só no cabeçalho: coluna
    // ausente com o valor vazando por outra célula seria o mesmo defeito.
    expect(r.body).not.toContain("Marilda");
    expect(r.body).not.toContain("99871-4402");
    expect(r.body).not.toContain("Idosa acamada");
  }, 60_000);

  it("o básico continua respondendo a prestação de contas inteira", async () => {
    const r = await app.inject({
      method: "GET", url: "/relatorios/ocorrencias.csv", headers: com(tokenCoordenador),
    });
    const cabecalho = r.body.replace("﻿", "").split("\r\n")[0]!;

    for (const coluna of [
      "Protocolo", "Tipo (COBRADE)", "Situação", "Severidade", "Endereço",
      "Registrada em", "Encerrada em", "Horas até a vistoria",
      "Providências sem resposta", "Vulnerabilidade social",
    ]) {
      expect(cabecalho, `falta a coluna ${coluna}`).toContain(coluna);
    }
    // A MARCA de vulnerabilidade fica (ela justifica a prioridade e não revela
    // condição de ninguém); a DESCRIÇÃO é que sai.
    expect(r.body).toContain("Rua das Acácias");
  }, 60_000);

  it("um nível inventado na barra de endereço não vira completo", async () => {
    const r = await app.inject({
      method: "GET", url: "/relatorios/ocorrencias.csv?nivel=tudo",
      headers: com(tokenAdministrador),
    });
    expect(r.statusCode).toBe(422);
  }, 60_000);

  it("registra o nível básico no registro de exportações", async () => {
    await app.inject({
      method: "GET", url: "/relatorios/ocorrencias.csv", headers: com(tokenCoordenador),
    });
    const registro = await ultimaExportacao();
    expect(registro?.nivel).toBe("basico");
    expect(registro?.justificativa).toBeNull();
  }, 60_000);
});

describe("O nível completo exige permissão própria", () => {
  it("coordenador exporta, e não exporta dado pessoal", async () => {
    /*
      `exportar_dados` é a permissão da prestação de contas, e ela dá o nível
      básico. Se o completo herdasse dela, todo relatório de rotina carregaria
      a base de nomes junto, e "não pode ser o padrão" seria só um texto de
      tela.
    */
    const basico = await app.inject({
      method: "GET", url: "/relatorios/ocorrencias.csv", headers: com(tokenCoordenador),
    });
    expect(basico.statusCode).toBe(200);

    const r = await app.inject({
      method: "GET", url: completo(), headers: com(tokenCoordenador),
    });
    expect(r.statusCode).toBe(403);
    expect(r.json().erro).toBe("posto_insuficiente_para_dado_pessoal");
  }, 60_000);

  it("operador não chega a lugar nenhum, nos dois níveis", async () => {
    for (const url of ["/relatorios/ocorrencias.csv", completo()]) {
      const r = await app.inject({ method: "GET", url, headers: com(tokenOperador) });
      expect(r.statusCode).toBe(403);
    }
  }, 60_000);

  it("a tentativa recusada não vira registro de exportação", async () => {
    const antes = await mem.bruto.query<{ total: string }>(
      "SELECT count(*)::text AS total FROM exportacoes",
    );
    await app.inject({ method: "GET", url: completo(), headers: com(tokenCoordenador) });
    const depois = await mem.bruto.query<{ total: string }>(
      "SELECT count(*)::text AS total FROM exportacoes",
    );
    expect(depois.rows[0]!.total).toBe(antes.rows[0]!.total);
  }, 60_000);
});

describe("O nível completo exige justificativa escrita", () => {
  it("sem justificativa, recusa e diz o que falta", async () => {
    const r = await app.inject({
      method: "GET", url: "/relatorios/ocorrencias.csv?nivel=completo",
      headers: com(tokenAdministrador),
    });
    expect(r.statusCode).toBe(422);
    expect(JSON.stringify(r.json())).toMatch(/justificativa/i);
  }, 60_000);

  it("justificativa de duas letras não passa: o campo viraria 'ok'", async () => {
    const r = await app.inject({
      method: "GET", url: completo("ok"), headers: com(tokenAdministrador),
    });
    expect(r.statusCode).toBe(422);
  }, 60_000);

  it("com justificativa, o arquivo sai com os dados pessoais", async () => {
    const r = await app.inject({
      method: "GET", url: completo(), headers: com(tokenAdministrador),
    });
    expect(r.statusCode).toBe(200);

    const cabecalho = r.body.replace("﻿", "").split("\r\n")[0]!;
    expect(cabecalho).toContain("Solicitante");
    expect(cabecalho).toContain("Contato do solicitante");
    expect(cabecalho).toContain("Vulnerabilidade (descrição)");
    expect(cabecalho).toContain("Relato");

    expect(r.body).toContain("Marilda");
    expect(r.body).toContain("Idosa acamada");
  }, 60_000);

  it("o nome do arquivo avisa o que ele carrega", async () => {
    /*
      Os dois níveis produzem planilhas parecidas e caem na mesma pasta de
      downloads. Dois arquivos com o mesmo nome é o caminho mais curto para
      alguém anexar o errado num email que sai da prefeitura.
    */
    const r = await app.inject({
      method: "GET", url: completo(), headers: com(tokenAdministrador),
    });
    expect(String(r.headers["content-disposition"])).toContain("com-dados-pessoais");
  }, 60_000);

  it("a justificativa fica no registro de exportações, junto do nível", async () => {
    await app.inject({ method: "GET", url: completo(), headers: com(tokenAdministrador) });
    const registro = await ultimaExportacao();
    expect(registro?.nivel).toBe("completo");
    expect(registro?.justificativa).toBe(JUSTIFICATIVA);
  }, 60_000);

  it("o banco recusa nível completo sem justificativa, por qualquer caminho", async () => {
    /*
      A regra não vive só na rota. Rota nova alguém escreve, e uma rota nova
      que exportasse dado pessoal sem justificativa seria exatamente o buraco
      pelo qual esta regra escaparia.
    */
    await expect(
      mem.bruto.query(
        `INSERT INTO exportacoes
           (organizacao_id, usuario_nome, tipo, total_registros, nivel)
         VALUES ($1, 'Alguem', 'ocorrencias_csv', 10, 'completo')`,
        [ORG_SERRA_ALTA],
      ),
    ).rejects.toThrow(/exportacao_completa_exige_justificativa|check/i);
  }, 60_000);

  it("o ato entra na trilha administrativa, com a justificativa junto", async () => {
    /*
      Não é redundância com o registro de exportações. Aquela lista é
      especializada e alguém abre quando já está investigando; a trilha
      administrativa é onde a chefia olha para saber o que de excepcional
      aconteceu no mês, ao lado de "promoveram uma conta". Tirar a base de
      nomes de cidadãos do sistema pertence a essa lista, e exportar o resumo
      do trimestre não pertence.
    */
    await app.inject({ method: "GET", url: completo(), headers: com(tokenAdministrador) });

    const r = await mem.bruto.query<{
      acao: string; alvo_tipo: string; autor_nome: string; depois: { justificativa: string };
    }>(
      `SELECT * FROM trilha_administrativa
        WHERE acao = 'exportacao_com_dado_pessoal'
        ORDER BY registrado_em DESC LIMIT 1`,
    );
    const ato = r.rows[0];
    expect(ato, "exportacao de dado pessoal sem ato na trilha administrativa").toBeTruthy();
    expect(ato!.alvo_tipo).toBe("organizacao");
    expect(ato!.autor_nome).toMatch(/Rita/i);
    expect(ato!.depois.justificativa).toBe(JUSTIFICATIVA);
  }, 60_000);

  it("o nível básico NÃO entra na trilha administrativa", async () => {
    const antes = await mem.bruto.query<{ total: string }>(
      `SELECT count(*)::text AS total FROM trilha_administrativa
        WHERE acao = 'exportacao_com_dado_pessoal'`,
    );
    await app.inject({
      method: "GET", url: "/relatorios/ocorrencias.csv", headers: com(tokenCoordenador),
    });
    const depois = await mem.bruto.query<{ total: string }>(
      `SELECT count(*)::text AS total FROM trilha_administrativa
        WHERE acao = 'exportacao_com_dado_pessoal'`,
    );
    // Pôr as duas ali faria a mais grave desaparecer no meio da rotina.
    expect(depois.rows[0]!.total).toBe(antes.rows[0]!.total);
  }, 60_000);
});

/*
  O teto fica por último no arquivo de propósito: ele precisa de milhares de
  ocorrências no banco, e elas atrapalhariam os casos acima, que conferem o
  conteúdo do arquivo linha a linha.
*/
describe("O teto de linhas do nível completo", () => {
  beforeAll(async () => {
    await mem.bruto.query(
      `INSERT INTO ocorrencias
         (organizacao_id, protocolo, tipo, status, endereco,
          solicitante_nome, canal_entrada, descricao)
       SELECT $1, 'T' || lpad(g::text, 6, '0') || '/2026', 'deslizamento',
              'registrada', 'Rua de Exemplo, ' || g,
              'Solicitante ' || g, 'telefone', 'Relato de exemplo.'
         FROM generate_series(1, 5100) g`,
      [ORG_SERRA_ALTA],
    );
  }, 180_000);

  it("recorte grande demais RECUSA, em vez de cortar em silêncio", async () => {
    /*
      Um arquivo truncado em silêncio é pior que uma recusa: ele parece
      completo, alguém o anexa a um processo, e as ocorrências que ficaram de
      fora somem sem nenhum sinal.
    */
    const r = await app.inject({
      method: "GET", url: completo(), headers: com(tokenAdministrador),
    });
    expect(r.statusCode).toBe(409);
    expect(r.json().erro).toBe("recorte_grande_demais");
  }, 120_000);

  it("o mesmo volume passa no nível básico, que não leva pessoa", async () => {
    /*
      O teto não protege o servidor: protege a pessoa. Sem dado pessoal no
      arquivo, "a base inteira" é exatamente o que a prestação de contas pede.
    */
    const r = await app.inject({
      method: "GET", url: "/relatorios/ocorrencias.csv", headers: com(tokenCoordenador),
    });
    expect(r.statusCode).toBe(200);
    expect(r.body.split("\r\n").length).toBeGreaterThan(5000);
  }, 120_000);

  it("recortado, o nível completo volta a sair", async () => {
    const r = await app.inject({
      method: "GET", url: `${completo()}&status=encerrada`,
      headers: com(tokenAdministrador),
    });
    expect(r.statusCode).toBe(200);
  }, 120_000);
});
