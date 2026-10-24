import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * O modo de demonstração aplica TODAS as migrações.
 *
 * Este arquivo existe por um defeito que sobreviveu a sete migrações
 * seguidas. `apps/web/src/dados/banco.ts` importava duas migrações, e o
 * comentário ao lado afirmava "as mesmas migrações que rodam no servidor, na
 * mesma ordem". Eram duas de nove.
 *
 * O estrago não era teórico e não era sutil: `responderProvidencia` escreve
 * em `desfecho` e `respondida_por`, colunas que nascem na migração 006.
 * Responder uma providência no modo de demonstração falhava com "coluna não
 * existe", e o modo de demonstração é o que vai à reunião com a prefeitura.
 * Nenhuma das verificações de navegador do modo local exercita providência,
 * então nada reprovava.
 *
 * O conserto foi trocar a lista por descoberta (`import.meta.glob`). Este
 * portão existe para a lista não voltar: ele reprova se alguém importar uma
 * migração por nome, e reprova se o padrão do glob deixar de casar com todas.
 */

const AQUI = dirname(fileURLToPath(import.meta.url));
const BANCO = join(AQUI, "..", "src", "dados", "banco.ts");
const MIGRACOES = join(AQUI, "..", "..", "..", "db", "migrations");

function fonte(): string {
  return readFileSync(BANCO, "utf8");
}

function arquivosDeMigracao(): string[] {
  return readdirSync(MIGRACOES).filter((n) => n.endsWith(".sql")).sort();
}

describe("O banco do modo de demonstração", () => {
  it("existem migrações para conferir", () => {
    // Âncora. Sem ela, um caminho errado faria o portão passar vazio, que é
    // exatamente como o defeito original sobreviveu.
    expect(arquivosDeMigracao().length).toBeGreaterThanOrEqual(9);
    expect(arquivosDeMigracao()[0]).toBe("001_base.sql");
  });

  it("descobre as migrações em vez de listá-las", () => {
    const padrao = /import\.meta\.glob\(\s*"[^"]*db\/migrations\/\*\.sql"/;
    expect(
      padrao.test(fonte()),
      "o modo de demonstração voltou a listar migrações à mão. Uma lista "
      + "esquece a próxima migração, e foi assim que ele ficou sete atrasado, "
      + "com um comentário afirmando que estava em dia.",
    ).toBe(true);
  });

  it("nenhuma migração é importada por nome", () => {
    const achados = [...fonte().matchAll(/import\s+\w+\s+from\s+"[^"]*db\/migrations\/([^"]+)"/g)]
      .map((m) => m[1]!);
    expect(
      achados,
      "migração importada por nome. Se ela precisa de tratamento especial, o "
      + "tratamento vai dentro do laço, não fora dele.",
    ).toEqual([]);
  });

  it("o padrão do glob casa com todos os arquivos de migração", () => {
    // O glob é resolvido pelo Vite em tempo de build, então aqui a
    // conferência é do PADRÃO contra o disco: qualquer arquivo `.sql` na
    // pasta precisa casar. Um nome fora do padrão (por exemplo `.psql`)
    // passaria despercebido pelo Vite e sumiria do modo de demonstração.
    // A subpasta `desfazer/` (V2-F01-E18, a volta de cada migração) fica de
    // fora de propósito: o padrão `*.sql` não desce em pastas, e a volta não
    // deve entrar no banco do modo de demonstração.
    const foraDoPadrao = readdirSync(MIGRACOES, { withFileTypes: true })
      .filter((e) => !e.isDirectory() && !e.name.endsWith(".sql"))
      .map((e) => e.name);
    expect(
      foraDoPadrao,
      "arquivo na pasta de migrações que o glob do modo de demonstração não "
      + "enxerga. Ou renomeie para .sql, ou tire da pasta.",
    ).toEqual([]);
  });

  it("a falha de uma migração é relatada com o nome do arquivo", () => {
    // Aplicar em silêncio produziria um banco pela metade e uma tela que
    // quebra três cliques depois, longe da causa.
    expect(fonte()).toMatch(/A migração \$\{caminho/);
  });

  it("o banco persistido é aposentado quando o esquema muda", () => {
    /*
      O modo de demonstração decide se migra perguntando se `ocorrencias`
      existe. Um navegador com o banco antigo responde "existe" e pula as
      migrações novas para sempre: a correção nunca chegaria em quem já usou.
      A versão no nome do banco é o que aposenta o anterior.
    */
    expect(fonte()).toMatch(/CHAVE_PERSISTENCIA = "idb:\/\/dc360-v\d+"/);
    expect(fonte()).toMatch(/MARCA_SEMENTE = "dc360:semeado:v\d+"/);
  });
});
