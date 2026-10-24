import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  fontesDe, palavraSemAcento, varrerFonte, varrerPasta, type Achado,
} from "./varredura-de-acentos.js";

/**
 * AS FRASES QUE A PESSOA LÊ SAEM COM ACENTO (V2-F00-E09, correção 4, defeito 1
 * da arbitragem da rodada 5).
 *
 * "A senha atual nao confere." saía da API sem acento, em três pontos
 * (`auth/servico.ts`, duas vezes, e `auth/segundo-fator.ts`), e o painel a
 * mostrava como estava, em Minha conta e na tela "Defina a sua senha" que vem
 * depois da senha temporária. A etapa tinha acentuado "as mensagens de
 * `/auth/trocar-senha` que aparecem no painel" e deixou esta: a conferência foi
 * feita por quem se lembrou de olhar, e não por um teste.
 *
 * Este arquivo é o teste. Ele lê o código pela árvore sintática e confere o que
 * a pessoa lê, nos quatro lugares onde frase de tela nasce neste repositório: a
 * API (a mensagem de erro que o servidor devolve), o painel, o pacote
 * compartilhado (catálogo e esquemas) e o motor do aplicativo de campo. Como a
 * varredura funciona, e por que comentário e linha de log ficam de fora, está no
 * cabeçalho de `varredura-de-acentos.ts`.
 *
 * Duas provas, e uma não substitui a outra: a varredura MORDE (uma fonte
 * sintética com o erro de verdade reprova), e a árvore real passa limpa.
 */

const AQUI = dirname(fileURLToPath(import.meta.url));
const RAIZ = join(AQUI, "..", "..", "..");

/**
 * O que a varredura acha e NÃO é frase de tela, com o motivo. Lista curta e
 * explícita de propósito: exceção nova pede uma linha aqui, à vista de quem
 * revisa, e não uma palavra a mais no dicionário.
 */
const EXCECOES: ReadonlyArray<{ arquivo: string; texto: string; motivo: string }> = [
  {
    arquivo: "apps/api/src/rotas/aparelhos.ts",
    texto: "Ambiente precisa ser producao ou teste",
    motivo: "a frase cita o valor aceito do enum, que se escreve `producao` e `teste`, "
      + "sem acento (AMBIENTES_APNS); acentuar o valor na frase mandaria a pessoa enviar um valor que a API recusa",
  },
  {
    arquivo: "apps/api/src/push/envio.ts",
    texto: "nao esta configurado neste servidor",
    motivo: "detalhe do registro de envio, lido por quem opera o servidor; "
      + "dc360/docs/IMPLANTACAO.md cita a frase exata na tabela de sintomas",
  },
];

const ESCOPOS: ReadonlyArray<{ pasta: string; modo: "mensagens" | "tudo"; minimoDeArquivos: number }> = [
  { pasta: "apps/api/src", modo: "mensagens", minimoDeArquivos: 60 },
  { pasta: "apps/console/src", modo: "mensagens", minimoDeArquivos: 5 },
  { pasta: "apps/web/src", modo: "tudo", minimoDeArquivos: 60 },
  { pasta: "packages/shared/src", modo: "tudo", minimoDeArquivos: 10 },
  { pasta: "packages/campo/src", modo: "tudo", minimoDeArquivos: 8 },
  { pasta: "apps/campo/src", modo: "tudo", minimoDeArquivos: 20 },
];

const relativo = (a: Achado) => ({ ...a, arquivo: a.arquivo.slice(RAIZ.length + 1).split("\\").join("/") });

describe("A varredura de acentos morde", () => {
  it("acha o erro de verdade: a frase da senha atual, sem acento, num erro de negócio", () => {
    const fonte = `
      throw new FalhaAutenticacao("credenciais", "A senha atual nao confere.");
    `;
    const achados = varrerFonte("exemplo.ts", fonte, "mensagens");
    expect(achados).toHaveLength(1);
    expect(achados[0]).toMatchObject({ palavra: "nao", linha: 2 });
  });

  it("acha na propriedade `mensagem` da resposta e no texto que o Zod devolve", () => {
    const fonte = `
      resposta.code(422).send({ erro: "x", mensagem: "Informe a descricao da ocorrencia" });
      const esquema = z.string().min(1, "Informe o endereco");
      const tipo = z.enum(["a", "b"], { error: "Informe o orgao" });
    `;
    const achados = varrerFonte("exemplo.ts", fonte, "mensagens");
    expect(achados.map((a) => a.palavra).sort()).toEqual(["descricao", "endereco", "orgao"]);
  });

  it("não acha o que a pessoa não lê: comentário, log, erro de desenvolvedor, código e SQL", () => {
    const fonte = `
      // A senha atual nao confere. (comentário)
      /* sessao nao encontrada */
      log.warn("sessao nao encontrada");
      throw new Error("Elemento #root nao encontrado");
      throw new RegraDeNegocio("autodesativacao", "Você não pode desativar a própria conta.", 422);
      const sql = "SELECT id FROM sessoes WHERE usuario_id = $1 AND descricao IS NULL";
    `;
    expect(varrerFonte("exemplo.ts", fonte, "mensagens")).toEqual([]);
  });

  it("no modo `tudo`, acha o texto da tela em JSX e em cadeia, e deixa passar classe, email de exemplo e variável", () => {
    const fonte = `
      export const A = () => <p>Nao foi possivel carregar</p>;
      const B = "A sessao expirou";
      const classes = "botao botao--primario tabela__secundario--frase";
      const exemplo = "Informe um email completo, como nome@orgao.gov.br.";
      const dica = "Sem PUSH_ATIVO=nao o servidor sobe";
    `;
    const achados = varrerFonte("exemplo.tsx", fonte, "tudo");
    expect(achados.map((a) => a.palavra).sort()).toEqual(["Nao", "sessao"]);
  });

  it("a palavra com acento e as que também se escrevem sem acento passam", () => {
    for (const ok of [
      "A senha atual não confere. Confira e digite de novo.",
      "Sessão expirada. Entre novamente.",
      "Fala com a secretaria do município, na primeira página.",
      "Ofício de secretaria",
    ]) expect(palavraSemAcento(ok), ok).toBeNull();
    for (const ruim of [
      "A senha atual nao confere.", "Sem conexao com o servidor.", "A autorizacao de envio venceu.",
      "Servidor indisponivel", "Voce nao pode", "A sessao terminou",
    ]) expect(palavraSemAcento(ruim), ruim).not.toBeNull();
  });
});

describe("Nenhuma frase de tela sai sem acento", () => {
  for (const { pasta, modo, minimoDeArquivos } of ESCOPOS) {
    it(`${pasta} (${modo})`, () => {
      const caminho = join(RAIZ, pasta);
      // Varredura que não alcança nada passa em silêncio: confere que ela leu a pasta toda.
      expect(fontesDe(caminho).length, `${pasta}: a varredura não encontrou os arquivos`).toBeGreaterThanOrEqual(minimoDeArquivos);

      const achados = varrerPasta(caminho, modo).map(relativo).filter(
        (a) => !EXCECOES.some((e) => e.arquivo === a.arquivo && a.texto.includes(e.texto)),
      );
      expect(
        achados.map((a) => `${a.arquivo}:${a.linha} [${a.palavra}] ${a.texto}`),
        "frase sem acento onde o português pede: acentue, ou, se NÃO é frase de tela, registre em EXCECOES com o motivo",
      ).toEqual([]);
    });
  }

  it("cada exceção ainda existe (lista velha esconde regressão)", () => {
    for (const e of EXCECOES) {
      const pasta = ESCOPOS.find((s) => e.arquivo.startsWith(s.pasta))!;
      const achados = varrerPasta(join(RAIZ, pasta.pasta), pasta.modo).map(relativo);
      expect(
        achados.some((a) => a.arquivo === e.arquivo && a.texto.includes(e.texto)),
        `a exceção "${e.texto}" (${e.arquivo}) não aparece mais: tire-a da lista`,
      ).toBe(true);
    }
  });
});
