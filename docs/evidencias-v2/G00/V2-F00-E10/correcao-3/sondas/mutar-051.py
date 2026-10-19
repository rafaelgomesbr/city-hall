# Aplica UMA mutação na migração 051 (a partir da cópia do conserto), roda os dois arquivos
# de teste da correção (PGlite e Postgres real) e restaura a migração.
# Uso: SP=... W=... PG=postgres://... python3 -I mutar-051.py <id> <saida>
import subprocess, sys, shutil, os
SP, W, PG = os.environ["SP"], os.environ["W"], os.environ["PG"]
ALVO = W + "/db/migrations/051_link_de_recuperacao_morre_com_a_credencial.sql"
NOVO = SP + "/e10c3/051.sql"
GATILHO = """CREATE TRIGGER recuperacoes_morrem_com_a_credencial
  AFTER UPDATE OF senha_hash, ativo ON usuarios
  FOR EACH ROW
  WHEN (OLD.senha_hash IS DISTINCT FROM NEW.senha_hash OR (OLD.ativo AND NOT NEW.ativo))
  EXECUTE FUNCTION invalidar_recuperacoes_pendentes();"""
ORDEM_NOVA = """  SELECT u.ativo INTO v_ativo FROM usuarios u WHERE u.id = v_usuario FOR NO KEY UPDATE;

  -- O link de novo, agora travado: a mudanca que confirmou enquanto
  -- esperavamos ja o marcou pelo gatilho, e ele nao serve mais.
  SELECT * INTO v_rec FROM recuperacoes_senha r
   WHERE r.token_hash = p_token_hash
     AND r.usada_em IS NULL
     AND r.expira_em > now()
   FOR UPDATE;"""
ORDEM_VELHA = """  SELECT * INTO v_rec FROM recuperacoes_senha r
   WHERE r.token_hash = p_token_hash
     AND r.usada_em IS NULL
     AND r.expira_em > now()
   FOR UPDATE;
  IF NOT FOUND THEN
    RETURN;
  END IF;
  SELECT u.ativo INTO v_ativo FROM usuarios u WHERE u.id = v_rec.usuario_id;"""
MUT = {
  "M1": ("sem o gatilho (consumir_recuperacao continua nova)", GATILHO, "-- gatilho removido pela mutação"),
  "M2": ("consumir_recuperacao sem conferir a conta ativa",
         "  IF NOT coalesce(v_ativo, false) THEN\n    RETURN;\n  END IF;\n", ""),
  "M3": ("consumir_recuperacao na ordem velha: a linha do link antes da linha da pessoa", ORDEM_NOVA, ORDEM_VELHA),
  "M4": ("o gatilho sem a condição: qualquer UPDATE de senha_hash ou ativo, inclusive a reativação",
         "  WHEN (OLD.senha_hash IS DISTINCT FROM NEW.senha_hash OR (OLD.ativo AND NOT NEW.ativo))\n", ""),
}
mid, saida = sys.argv[1], sys.argv[2]
nome, de, para = MUT[mid]
fonte = open(NOVO, encoding="utf-8").read()
assert fonte.count(de) == 1, mid
open(ALVO, "w", encoding="utf-8").write(fonte.replace(de, para, 1))
try:
    env = dict(os.environ, DC360_POSTGRES_DE_PROVA=PG)
    r = subprocess.run(["npx", "vitest", "run", "--root", "apps/api",
                        "test/recuperacao-morre-com-a-credencial.test.ts", "test/renovacao-contra-encerramento.test.ts"],
                       cwd=W, env=env, capture_output=True, text=True)
    with open(saida, "w", encoding="utf-8") as f:
        f.write(f"mutação {mid} na migração 051: {nome}\n\n--- trecho trocado ---\n- {de}\n+ {para}\n\n--- saída do vitest ---\n")
        f.write(r.stdout + r.stderr)
        f.write(f"\ncodigo de saida: {r.returncode}\n")
finally:
    shutil.copyfile(NOVO, ALVO)
    print(mid, "restaurado" if subprocess.run(["cmp", NOVO, ALVO]).returncode == 0 else "NAO RESTAURADO")
