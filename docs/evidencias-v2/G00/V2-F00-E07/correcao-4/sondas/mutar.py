# Aplica UMA mutação em apps/api/src/auth/servico.ts (a partir da cópia do conserto),
# roda o arquivo da corrida em Postgres real e restaura o arquivo. Uso: SP=... W=... python3 -I mutar.py <id> <saida>
import subprocess, sys, shutil, os
SP = os.environ["SP"]  # o scratchpad da sessão (onde está a cópia do conserto)
W = os.environ["W"]  # o dc360 do worktree da correção
ALVO = W + "/apps/api/src/auth/servico.ts"
NOVO = SP + "/e07c4/servico.novo.ts"
MUT = {
  "M1": ("sem a comparação do hash conferido",
         "if (agora.senha_hash !== hashConferido) {", "if (false && agora.senha_hash !== hashConferido) {"),
  "M2": ("sem a exigência de sessão viva na cadeia (preserva o sid do token)",
         "if (!agora || !viva.rows[0] || senhaProvisoriaVencida(agora)) {",
         "if (!agora || senhaProvisoriaVencida(agora)) {"),
  "M3": ("sem a recusa da conta desativada",
         "if (agora && !agora.ativo) throw new ContaDesativada();", ""),
  "M4": ("sem o prazo da provisória relido sob a trava",
         "if (!agora || !viva.rows[0] || senhaProvisoriaVencida(agora)) {",
         "if (!agora || !viva.rows[0]) {"),
  "M5": ("sem o FOR NO KEY UPDATE da linha da pessoa",
         "FROM usuarios WHERE id = $1 FOR NO KEY UPDATE\",", "FROM usuarios WHERE id = $1\","),
  "M6": ("a trava da pessoa ANTES da linha de usuarios",
         "      const linha = await c.query<{",
         "      await c.query(\"SELECT travar_sessoes_do_usuario($1)\", [identidade.usuarioId]);\n      const linha = await c.query<{"),
  "M7": ("preserva o sid do token, e não a sessão viva da cadeia",
         "await c.query(\"SELECT trocar_senha($1,$2,$3)\", [identidade.usuarioId, hash, viva.rows[0].id]);",
         "await c.query(\"SELECT trocar_senha($1,$2,$3)\", [identidade.usuarioId, hash, identidade.sessaoId]);"),
}
mid, saida = sys.argv[1], sys.argv[2]
nome, de, para = MUT[mid]
fonte = open(NOVO, encoding="utf-8").read()
assert fonte.count(de) >= 1, de
mutado = fonte.replace(de, para, 1)
if mid == "M2":
    mutado = mutado.replace("[identidade.usuarioId, hash, viva.rows[0].id]", "[identidade.usuarioId, hash, viva.rows[0]?.id ?? identidade.sessaoId]", 1)
    mutado = mutado.replace("return { id: viva.rows[0].id, papel: agora.papel };", "return { id: viva.rows[0]?.id ?? identidade.sessaoId, papel: agora.papel };", 1)
open(ALVO, "w", encoding="utf-8").write(mutado)
try:
    diff = subprocess.run(["git", "diff", "--", "apps/api/src/auth/servico.ts"], cwd=W, capture_output=True, text=True).stdout
    env = dict(os.environ, DC360_POSTGRES_DE_PROVA="postgres://postgres@127.0.0.1:55851/postgres")
    r = subprocess.run(["npx", "vitest", "run", "--root", "apps/api", "test/renovacao-contra-encerramento.test.ts"],
                       cwd=W, env=env, capture_output=True, text=True)
    with open(saida, "w", encoding="utf-8") as f:
        f.write(f"mutação {mid}: {nome}\n\n--- diff aplicado sobre o conserto ---\n")
        # o diff é contra o HEAD (0290af5); mostra só a troca da mutação
        f.write(f"- {de}\n+ {para}\n\n--- saída do vitest ---\n")
        f.write(r.stdout + r.stderr)
        f.write(f"\ncodigo de saida: {r.returncode}\n")
finally:
    shutil.copyfile(NOVO, ALVO)
    st = subprocess.run(["cmp", NOVO, ALVO]).returncode
    print(mid, "restaurado" if st == 0 else "NAO RESTAURADO")
