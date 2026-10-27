// Prova de que os testes da 054 mordem: cada mutação muda a migração (cópia
// guardada e devolvida no fim), roda pessoas.test.ts e registra o resultado.
import { readFileSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

const raiz = process.argv[2];
const saida = process.argv[3];
const arquivo = `${raiz}/dc360/db/migrations/054_pessoas_e_conta_no_municipio.sql`;
const original = readFileSync(arquivo, "utf8");

const mutacoes = [
  {
    nome: "M1: o criador aceita pessoa_id informado (sem a recusa do BEFORE INSERT)",
    de: "    IF NEW.pessoa_id IS NOT NULL THEN\n      RAISE EXCEPTION USING",
    para: "    IF false THEN\n      RAISE EXCEPTION USING",
  },
  {
    nome: "M2: o adiado não confere nada (o ramo AFTER volta sem olhar a marca)",
    de: "  -- AFTER, adiado para o fim da transacao.",
    para: "  RETURN NULL;\n  -- AFTER, adiado para o fim da transacao.",
  },
  {
    nome: "M3: o adiado aceita marca de outra transacao",
    de: "     OR v_origem.transacao IS DISTINCT FROM pg_current_xact_id()\n",
    para: "",
  },
  {
    nome: "M4: SELECT em pessoas concedido ao dc360_app",
    de: "REVOKE ALL ON pessoas FROM PUBLIC;",
    para: "REVOKE ALL ON pessoas FROM PUBLIC;\nGRANT SELECT ON pessoas TO dc360_app;",
  },
  {
    nome: "M5: sem os gatilhos de imutabilidade de pessoa_id",
    de: "  WHEN (OLD.pessoa_id IS DISTINCT FROM NEW.pessoa_id)\n",
    para: "  WHEN (false)\n",
    todas: true,
  },
  {
    nome: "M6: o espelho esquece o e-mail",
    de: "     SET email = NEW.email,\n         senha_hash",
    para: "     SET senha_hash",
  },
  {
    nome: "M7: UPDATE de usuarios volta a ser de tabela (pessoa_id ao alcance do app)",
    de: "REVOKE UPDATE ON usuarios FROM dc360_app;\nGRANT UPDATE (",
    para: "GRANT UPDATE ON usuarios TO dc360_app;\nGRANT UPDATE (",
  },
  {
    nome: "M8: vigencia_da_sessao sem a exigencia do municipio do contexto",
    de: "   WHERE o.id = p_organizacao_id\n     AND o.id = app_organizacao_atual();",
    para: "   WHERE o.id = p_organizacao_id\n     AND (o.id = app_organizacao_atual() OR true);",
  },
];

const linhas = [];
try {
  for (const m of mutacoes) {
    if (!original.includes(m.de)) throw new Error(`mutacao sem alvo: ${m.nome}`);
    writeFileSync(arquivo, m.todas ? original.replaceAll(m.de, m.para) : original.replace(m.de, m.para));
    const r = spawnSync("npx", ["vitest", "run", "test/pessoas.test.ts"], {
      cwd: `${raiz}/dc360/db`, encoding: "utf8", shell: true,
    });
    const texto = (r.stdout + r.stderr).replace(/\x1b\[[0-9;]*m/g, "");
    const total = texto.split("\n").find((l) => /^\s+Tests\s/.test(l)) ?? "(sem linha de total)";
    const falhas = texto.split("\n").filter((l) => /^ FAIL /.test(l)).map((l) => `    ${l.trim()}`);
    linhas.push(`${m.nome}\n  codigo de saida ${r.status}; ${total.trim()}\n${falhas.join("\n")}\n`);
  }
} finally {
  writeFileSync(arquivo, original);
}
writeFileSync(saida, linhas.join("\n"));
console.log(linhas.join("\n"));
