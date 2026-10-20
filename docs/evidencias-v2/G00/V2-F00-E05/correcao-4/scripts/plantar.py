import sys
p = sys.argv[1]
t = open(p).read()
a = '''  app.get("/", async (req) => {
    const quem = await app.exigirAutenticacao(req);'''
n = '''  app.get("/", async (req, resposta) => {
    const sonda = req.headers["x-sonda-c4"];
    if (sonda === "regra") throw new RegraDeNegocio("vazou_meio", "x", 403.5);
    if (sonda === "code") return resposta.code(403.5).send({ erro: "vazou_frac", mensagem: "x" });
    if (sonda === "texto") return resposta.code("403.2" as never).send({ erro: "vazou_frac_texto", mensagem: "x" });
    if (sonda === "catalogo") return resposta.code(401.9).send({ erro: "nao_autenticado", mensagem: "x" });
    const quem = await app.exigirAutenticacao(req);'''
assert a in t
open(p, "w").write(t.replace(a, n, 1))
