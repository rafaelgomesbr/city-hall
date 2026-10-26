"""Mutacoes da migracao 054 e da rota: cada uma tira UMA conferencia e roda os testes.

Uso: python mutacoes.py <raiz dc360> <arquivo de saida>
Restaura o arquivo original ao fim de cada mutacao, inclusive em erro.
"""
import pathlib
import re
import subprocess
import sys

raiz = pathlib.Path(sys.argv[1])
saida = pathlib.Path(sys.argv[2])
migracao = raiz / "db" / "migrations" / "054_o_fornecedor_restaura_o_acesso_do_administrador.sql"
servidor = raiz / "apps" / "console" / "src" / "servidor.ts"

MUTACOES_DO_BANCO = [
    ("M01 sem a conferencia do dono do console",
     "IF NOT console_operador_e_dono() THEN", "IF false THEN"),
    ("M02 sem o municipio na busca da conta (e no UPDATE)",
     "WHERE u.organizacao_id = p_org AND lower(u.email) = v_email", "WHERE lower(u.email) = v_email"),
    ("M03 sem a conferencia do papel administrador",
     "IF v_papel <> 'administrador' THEN", "IF false THEN"),
    ("M04 sem a conferencia de conta ativa",
     "IF NOT v_ativo THEN", "IF false THEN"),
    ("M05 sem a conferencia do motivo na funcao",
     "IF length(v_motivo) < 10 THEN", "IF false THEN"),
    ("M06 sem encerrar as sessoes",
     "WHERE s.usuario_id = v_id AND s.organizacao_id = p_org AND s.revogada_em IS NULL;",
     "WHERE s.usuario_id = v_id AND s.organizacao_id = p_org AND false;"),
    ("M07 validade diferente da do painel (720 h)",
     "senha_provisoria_ate = now() + interval '72 hours'", "senha_provisoria_ate = now() + interval '720 hours'"),
    ("M08 sem a recusa de municipio suspenso",
     "IF v_suspenso IS NOT NULL THEN", "IF false THEN"),
    ("M09 sem o teto de 3 em 24 h",
     "IF v_recentes >= 3 THEN", "IF false THEN"),
    ("M10 o hash vai para a trilha",
     "'origem', 'console_do_fornecedor'));", "'origem', 'console_do_fornecedor', 'hash', p_senha_hash));"),
    ("M11 a funcao fica executavel por PUBLIC",
     "REVOKE ALL ON FUNCTION console_restaurar_acesso_do_administrador(uuid, text, text, text) FROM PUBLIC;",
     "GRANT EXECUTE ON FUNCTION console_restaurar_acesso_do_administrador(uuid, text, text, text) TO PUBLIC;"),
    ("M12 o registro do console fica legivel por qualquer operador",
     "USING (console_operador_e_dono());", "USING (true);"),
    ("M13 sem a recusa de senha em texto claro",
     "IF p_senha_hash IS NULL\n     OR split_part(p_senha_hash, '$', 1) <> 'scrypt'\n     OR length(p_senha_hash) < 80 THEN",
     "IF false THEN"),
]

MUTACOES_DA_ROTA = [
    ("R01 a rota nao confere o codigo novo do aplicativo",
     'if (desfecho !== "ok") {\n        rastro(quem(req), "restaurar_acesso_recusado"',
     'if (false) {\n        rastro(quem(req), "restaurar_acesso_recusado"'),
    ("R02 a rota nao confere a senha de quem clica",
     'if (!(await conferirSenha(corpo.data.senha, alvo.operador.senhaHash))) {\n        rastro(quem(req), "restaurar_acesso_recusado"',
     'if (false) {\n        rastro(quem(req), "restaurar_acesso_recusado"'),
    ("R03 a senha temporaria vai para o log",
     'sessoes_encerradas: restaurado.sessoesEncerradas,\n        senha_provisoria_ate',
     'sessoes_encerradas: restaurado.sessoesEncerradas, senha: restaurado.senhaTemporaria,\n        senha_provisoria_ate'),
]


def rodar(pasta: pathlib.Path, arquivo: str) -> str:
    r = subprocess.run(
        f"npx vitest run {arquivo}", cwd=pasta, shell=True, capture_output=True, text=True,
        encoding="utf-8", errors="replace",
    )
    texto = re.sub(r"\x1b\[[0-9;]*m", "", r.stdout + r.stderr)
    linhas = [l.strip() for l in texto.splitlines() if re.search(r"(Tests\s+\d|×|FAIL .*>)", l)]
    return f"codigo de saida {r.returncode}\n" + "\n".join(linhas[:12])


def aplicar(alvo: pathlib.Path, nome: str, de: str, para: str, pasta: pathlib.Path, teste: str, out):
    original = alvo.read_bytes()
    texto = original.decode("utf-8")
    if texto.count(de) != 1:
        out.write(f"## {nome}\nNAO APLICADA: trecho achado {texto.count(de)} vezes\n\n")
        return
    try:
        alvo.write_bytes(texto.replace(de, para).encode("utf-8"))
        resultado = rodar(pasta, teste)
    finally:
        alvo.write_bytes(original)
    out.write(f"## {nome}\n{resultado}\n\n")
    out.flush()


with saida.open("w", encoding="utf-8") as out:
    out.write("# Mutacoes: cada linha tira UMA conferencia; o esperado e a suite VERMELHA\n\n")
    out.write("## Linha de base, sem mutacao\n" + rodar(raiz / "db", "test/restauracao-de-acesso.test.ts") + "\n\n")
    for nome, de, para in MUTACOES_DO_BANCO:
        aplicar(migracao, nome, de, para, raiz / "db", "test/restauracao-de-acesso.test.ts", out)
    out.write("## Linha de base da rota, sem mutacao\n" + rodar(raiz / "apps" / "console", "test/restaurar-acesso.test.ts") + "\n\n")
    for nome, de, para in MUTACOES_DA_ROTA:
        aplicar(servidor, nome, de, para, raiz / "apps" / "console", "test/restaurar-acesso.test.ts", out)
print("ok")
