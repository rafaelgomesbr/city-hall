import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { beforeAll, describe, expect, it } from "vitest";
import { SemPermissao } from "@dc360/shared";
import * as local from "../src/dados/local";
import type { Sessao } from "../src/dados/tipos";

/**
 * V2-F00-E08: ofício é leitura de quem tem `consultar_oficio`, e o agente de
 * campo não tem.
 *
 * Dois pontos, e cada um já seria defeito sozinho:
 *
 * 1. O MODO LOCAL espelha o servidor. A API responde 403 ao agente, e a
 *    demonstração que lhe entregasse a lista mostraria o que o produto real
 *    recusa.
 * 2. A TELA não pergunta o que o servidor recusa. O dossiê da ocorrência junta
 *    onze leituras num `Promise.all`; uma delas devolvendo 403 derrubaria a
 *    página inteira do agente, que abre as ocorrências da equipe dele. Quem não
 *    tem a ação nem chama, e o cartão de ofícios nem é desenhado.
 */

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), "..", "src");
const DETALHE = readFileSync(join(RAIZ, "paginas", "Ocorrencia.tsx"), "utf8");

describe("Ofício no modo de demonstração segue a mesma regra da API", () => {
  let sessoes: Record<string, Sessao>;

  beforeAll(async () => {
    const contas = await local.contasDisponiveis();
    const monta = (papel: string): Sessao => {
      const c = contas.find((x) => x.papel === papel);
      if (!c) throw new Error(`a semente não tem ${papel}`);
      return {
        organizacaoId: c.organizacao_id,
        organizacaoNome: c.organizacao_nome,
        municipio: c.municipio,
        uf: c.uf,
        usuarioId: c.usuario_id,
        usuarioNome: c.usuario_nome,
        papel: c.papel,
      };
    };
    sessoes = {
      agente: monta("agente_campo"),
      operador: monta("operador"),
      coordenador: monta("coordenador"),
    };
  }, 120_000);

  it("o agente de campo é recusado na lista e na ficha, com a recusa que diz o que ele não pode", async () => {
    await expect(local.listarOficios(sessoes["agente"]!, "qualquer-id")).rejects.toBeInstanceOf(SemPermissao);
    await expect(local.detalharOficio(sessoes["agente"]!, "qualquer-id")).rejects.toBeInstanceOf(SemPermissao);
    await expect(local.listarOficios(sessoes["agente"]!, "qualquer-id"))
      .rejects.toThrow(/consultar os ofícios de encaminhamento/);
  });

  it("operador e coordenador listam sem a recusa", async () => {
    const id = "11111111-1111-4111-8111-0000000000c4";
    for (const quem of ["operador", "coordenador"]) {
      const lista = await local.listarOficios(sessoes[quem]!, id);
      expect(Array.isArray(lista), quem).toBe(true);
    }
  });
});

describe("A tela do dossiê não pergunta o que o servidor recusa", () => {
  it("só chama listarOficios quando o papel tem consultar_oficio", () => {
    expect(DETALHE).toMatch(/podeExecutar\(sessao\.papel, "consultar_oficio"\)/);
    // A chamada vem atrás da condição, e a alternativa é uma lista vazia.
    expect(DETALHE).toMatch(/podeConsultarOficio \? listarOficios\(sessao, id\) : Promise\.resolve<LinhaOficio\[\]>\(\[\]\)/);
    // Nenhuma outra chamada solta de listarOficios na tela.
    const chamadas = DETALHE.match(/listarOficios\(/g) ?? [];
    expect(chamadas.length).toBe(1);
  });

  it("o cartão de ofícios só é desenhado para quem consulta", () => {
    expect(DETALHE).toMatch(/providencias\.length > 0 && podeConsultarOficio && \(\s*<CartaoOficios/);
  });
});
