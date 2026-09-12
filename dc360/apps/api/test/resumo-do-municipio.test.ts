import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { bancoEmMemoria, type BancoEmMemoria } from "../src/banco/memoria.js";
import { travaDeProcesso, type Trava } from "../src/push/trava.js";
import { resumirMunicipios } from "../src/metricas/resumo.js";
import type { Banco, Consulta } from "../src/banco/tipos.js";

/**
 * O relógio que escreve a métrica, e a razão de ele existir.
 *
 * A migração 023 entregou a tabela de métricas, a função que a escreve, a
 * visão que o console lê e o papel de leitura do fornecedor. Faltou uma coisa
 * só, e ela é a única que faz o resto valer alguma coisa: **ninguém chamava a
 * função**. A tabela ficava vazia para sempre, a visão respondia
 * `sem_escrita_recente` para todo município, e o console mostraria uma tela
 * impecável afirmando que nenhuma prefeitura usa o produto.
 *
 * Esse defeito não quebra teste nenhum, porque nada está errado: está apenas
 * desligado. É a mesma família de `NOTIFICADOR_URL` validada na partida e
 * nunca lida por linha nenhuma do servidor, que fez a recuperação de senha
 * responder "enviamos o link" enquanto escrevia a credencial no log. Por isso
 * o último caso deste arquivo confere que a partida da API LIGA o relógio.
 *
 * A DIREÇÃO DO DADO é o que os dois primeiros casos guardam. A ADR 0008 não
 * manda o console consultar os municípios: manda cada município escrever o
 * próprio resumo, na própria transação, com o papel de aplicação de sempre e
 * debaixo do RLS de sempre. Um relógio que resolvesse isso com uma consulta
 * privilegiada que soma tudo de uma vez seria a credencial proibida com outro
 * nome, e o teste dela ficaria verde e falso.
 */

const AQUI = dirname(fileURLToPath(import.meta.url));

let mem: BancoEmMemoria;
let trava: Trava;

beforeEach(async () => {
  mem = await bancoEmMemoria({ semear: true });
  trava = travaDeProcesso();
});

afterEach(async () => {
  await mem.banco.encerrar();
});

async function organizacoes(): Promise<Array<{ id: string; municipio: string }>> {
  const r = await mem.bruto.query<{ id: string; municipio: string }>(
    "SELECT id, municipio FROM organizacoes ORDER BY municipio",
  );
  return r.rows;
}

describe("O relogio que escreve a metrica do municipio", () => {
  it("escreve o resumo de cada municipio, e a tabela deixa de estar vazia", async () => {
    const antes = await mem.bruto.query<{ n: string }>(
      "SELECT count(*)::text AS n FROM metricas_municipio",
    );
    expect(
      antes.rows[0]!.n,
      "a tabela precisa comecar vazia, senao este caso nao prova que o relogio escreveu",
    ).toBe("0");

    const resumo = await resumirMunicipios({ banco: mem.banco, trava, frescorMinutos: 60 });

    expect(resumo.travado).toBe(false);
    expect(resumo.falhas).toBe(0);
    expect(
      resumo.municipios,
      "o relogio nao escreveu o resumo dos dois municipios semeados",
    ).toBe((await organizacoes()).length);

    const depois = await mem.bruto.query<{ organizacao_id: string }>(
      "SELECT organizacao_id FROM metricas_municipio WHERE dia = current_date",
    );
    expect(
      depois.rows.map((l) => l.organizacao_id).sort(),
      "faltou linha de metrica para algum municipio, e no console ele apareceria " +
      "como calado, que e indistinguivel de 'ninguem usou hoje'",
    ).toEqual((await organizacoes()).map((o) => o.id).sort());
  });

  it("cada numero e o do proprio municipio, e nao a soma de todos", async () => {
    /*
      O caso que a inversão da seta existe para garantir, visto do lado da
      aplicação. `resumir_municipio()` é SECURITY INVOKER e roda dentro do
      `comTenant` de cada município: as contagens enxergam apenas as linhas
      daquele município. Um relógio que somasse tudo numa consulta
      privilegiada produziria o mesmo número para os dois, e é exatamente esse
      o desenho que a ADR 0008 recusa.
    */
    await resumirMunicipios({ banco: mem.banco, trava, frescorMinutos: 60 });

    const linhas = await mem.bruto.query<{ municipio: string; abertas: number }>(
      `SELECT o.municipio, m.ocorrencias_abertas AS abertas
         FROM metricas_municipio m
         JOIN organizacoes o ON o.id = m.organizacao_id
        WHERE m.dia = current_date
        ORDER BY o.municipio`,
    );

    for (const linha of linhas.rows) {
      const real = await mem.bruto.query<{ n: string }>(
        `SELECT count(*)::text AS n FROM ocorrencias o
           JOIN organizacoes g ON g.id = o.organizacao_id
          WHERE g.municipio = $1 AND o.status <> 'encerrada'`,
        [linha.municipio],
      );
      expect(
        String(linha.abertas),
        `o resumo de ${linha.municipio} nao bate com o que ${linha.municipio} enxerga: ` +
        "o relogio contou fora do contexto do municipio",
      ).toBe(real.rows[0]!.n);
    }

    const distintos = new Set(linhas.rows.map((l) => l.abertas));
    const totalGeral = await mem.bruto.query<{ n: string }>(
      "SELECT count(*)::text AS n FROM ocorrencias WHERE status <> 'encerrada'",
    );
    for (const valor of distintos) {
      expect(
        String(valor),
        "o numero escrito e o total de TODOS os municipios: o relogio esta contando " +
        "por fora do RLS, que e a credencial que a ADR 0008 proibe",
      ).not.toBe(totalGeral.rows[0]!.n);
    }
  });

  it("municipio que falha nao impede o resumo dos outros", async () => {
    /*
      Uma noite ruim num município (conexão derrubada, transação abortada por
      outro motivo) não pode apagar o console inteiro. O que se perde é a linha
      daquele município, e ela aparece como `sem_escrita_recente`, que é
      justamente o sinal que a visão da 023 existe para dar.
    */
    const todas = await organizacoes();
    const condenado = todas[0]!.id;

    const bancoQueFalhaEmUm: Banco = {
      comTenant: (organizacaoId, execucao) => {
        if (organizacaoId === condenado) {
          return Promise.reject(new Error("conexao derrubada no meio da escrita"));
        }
        return mem.banco.comTenant(organizacaoId, execucao);
      },
      semTenant: (execucao: (c: Consulta) => Promise<unknown>) => mem.banco.semTenant(execucao),
      encerrar: () => Promise.resolve(),
    } as Banco;

    const resumo = await resumirMunicipios({
      banco: bancoQueFalhaEmUm, trava, frescorMinutos: 60,
    });

    expect(resumo.falhas, "a falha de um municipio nao foi contada").toBe(1);
    expect(
      resumo.municipios,
      "a falha de um municipio levou junto o resumo dos outros",
    ).toBe(todas.length - 1);

    const escritas = await mem.bruto.query<{ organizacao_id: string }>(
      "SELECT organizacao_id FROM metricas_municipio WHERE dia = current_date",
    );
    expect(escritas.rows.map((l) => l.organizacao_id)).not.toContain(condenado);
    expect(escritas.rows.length).toBe(todas.length - 1);
  });

  it("nao escreve duas vezes na mesma rodada de outra maquina", async () => {
    // Em produção são duas máquinas no Fly e as duas sobem este relógio. Quem
    // não pega a trava desiste da rodada, em vez de reescrever os mesmos
    // números por cima.
    await trava.tentar();
    const resumo = await resumirMunicipios({ banco: mem.banco, trava, frescorMinutos: 60 });
    expect(resumo.travado).toBe(true);
    expect(resumo.municipios).toBe(0);

    const nada = await mem.bruto.query<{ n: string }>(
      "SELECT count(*)::text AS n FROM metricas_municipio",
    );
    expect(nada.rows[0]!.n).toBe("0");
  });

  it("a segunda rodada dentro do frescor nao reescreve nada", async () => {
    /*
      Sem isto, o relógio de uma hora reescreveria toda a tabela a cada rodada
      mesmo quando nada mudou, e `atualizado_em` deixaria de significar "este
      número é desta hora" para significar "o relógio está vivo". São coisas
      diferentes, e o console decide alarme com a primeira.
    */
    await resumirMunicipios({ banco: mem.banco, trava, frescorMinutos: 60 });
    const segunda = await resumirMunicipios({ banco: mem.banco, trava, frescorMinutos: 60 });
    expect(
      segunda.municipios,
      "o relogio reescreveu o resumo de quem ja tinha resumo fresco",
    ).toBe(0);
  });

  it("a partida da API liga o relogio, e nao apenas o declara", async () => {
    /*
      O CASO QUE ESTE ARQUIVO INTEIRO EXISTE PARA TER.

      Todo o resto pode estar perfeito e o produto continuar entregando um
      console vazio, porque a única coisa que faltava na migração 023 era uma
      chamada. Código que ninguém chama não quebra teste: ele passa despercebido
      até alguém abrir a tela e ver silêncio, e silêncio aqui é indistinguível
      de "nenhum município usa o produto".
    */
    const partida = readFileSync(join(AQUI, "..", "src", "index.ts"), "utf8");
    expect(
      partida,
      "a partida da API nao importa o relogio do resumo: a tabela de metricas " +
      "ficaria vazia e o console mostraria silencio",
    ).toContain("agendarResumo");
    expect(
      /agendarResumo\s*\(/.test(partida),
      "a partida importa `agendarResumo` e nunca o CHAMA, que e exatamente o " +
      "defeito que a migracao 023 deixou em aberto",
    ).toBe(true);
  });
});
