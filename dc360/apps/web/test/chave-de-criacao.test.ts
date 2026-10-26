import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { aberturaOcorrenciaSchema } from "@dc360/shared";
import { novaChaveDeCriacao } from "../src/paginas/ocorrencia-regras";

/**
 * A chave de criação do chamado no formulário (V2-F02-E07).
 *
 * O formulário gera um UUID quando ABRE e o reaproveita em todo reenvio: o
 * segundo clique, a nova tentativa depois de erro de rede, a confirmação depois
 * da lista de duplicidades. A API devolve o chamado que já nasceu em vez de
 * abrir outro e queimar mais um número do protocolo.
 *
 * Duas camadas, como nos outros portões da tela: a função pura que gera a
 * chave (inclusive sem `crypto.randomUUID`, que não existe em http fora de
 * localhost), e a leitura da tela, porque regra certa que a tela não chama
 * passa em todo teste de função pura e não faz nada na vida real.
 */

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const RAIZ = join(dirname(fileURLToPath(import.meta.url)), "..", "src");
const NOVA = readFileSync(join(RAIZ, "paginas", "NovaOcorrencia.tsx"), "utf8");

describe("novaChaveDeCriacao", () => {
  it("devolve um uuid v4 que o esquema da abertura aceita", () => {
    const chave = novaChaveDeCriacao();
    expect(chave).toMatch(UUID_V4);
    const corpo = {
      solicitanteNome: "Marilda",
      canalEntrada: "telefone",
      endereco: "Rua do Temporal, 21",
      tipo: "deslizamento",
      descricao: "Talude cedeu.",
      chaveDeCriacao: chave,
    };
    expect(aberturaOcorrenciaSchema.safeParse(corpo).success).toBe(true);
  });

  it("cada chamada é uma chave nova", () => {
    const chaves = new Set(Array.from({ length: 50 }, () => novaChaveDeCriacao()));
    expect(chaves.size).toBe(50);
  });

  it("sem crypto.randomUUID (http fora de localhost) monta o v4 com getRandomValues", () => {
    const motor = {
      getRandomValues: <T extends ArrayBufferView | null>(a: T): T => {
        const bytes = a as unknown as Uint8Array;
        bytes.forEach((_, i) => {
          bytes[i] = (i * 37 + 11) & 0xff;
        });
        return a;
      },
    };
    const chave = novaChaveDeCriacao(motor as Pick<Crypto, "getRandomValues">);
    expect(chave).toMatch(UUID_V4);
    expect(chave).toBe(novaChaveDeCriacao(motor as Pick<Crypto, "getRandomValues">));
  });

  it("sem nenhum gerador, falha com uma frase em português em vez de gerar chave fraca", () => {
    expect(() => novaChaveDeCriacao(null)).toThrow(/gerador de números aleatórios/);
  });
});

describe("a tela NovaOcorrencia", () => {
  it("gera a chave UMA vez, na abertura do formulário (useState com inicializador)", () => {
    expect(NOVA).toMatch(/const \[chaveDeCriacao\] = useState\(\(\) => novaChaveDeCriacao\(\)\);/);
    // Nenhuma outra geração: reenviar não pode trocar a chave.
    expect(NOVA.match(/novaChaveDeCriacao\(/g)).toHaveLength(1);
    expect(NOVA).not.toMatch(/randomUUID/);
  });

  it("manda a mesma chave no corpo de TODO envio (montar() é o único lugar que monta o corpo)", () => {
    expect(NOVA).toMatch(/descricao: descricao\.trim\(\),\s*chaveDeCriacao,\s*\};/);
    expect(NOVA.match(/aberturaOcorrenciaSchema\.safeParse\(montar\(\)\)/g)).toHaveLength(2);
  });
});
