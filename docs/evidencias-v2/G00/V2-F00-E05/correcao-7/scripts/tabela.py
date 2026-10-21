import re, sys
SC = sys.argv[1]
def ler(arq):
    r = {}
    atual = None
    for l in open(arq, encoding="utf-8"):
        if atual is not None:
            v, modo = atual
            atual = None
            if l.strip() == "":
                r[v]["sem-resposta"] = True
            elif v.startswith("flush-403") and l.strip().startswith("[HTTP/1.1 200"):
                r[v]["200-sem-corpo"] = True
        m = re.match(r"^(api|console) modo=(falhar|corrigir) (\S+): (ESCAPOU|nao-escapou) (DESSINCRONIZOU|sincronizado)", l)
        if m:
            r.setdefault(m.group(3), {})[m.group(2)] = (m.group(4) == "ESCAPOU", m.group(5) == "DESSINCRONIZOU")
            atual = (m.group(3), m.group(2))
        m = re.match(r"^  \[processo da variante (\S+): exit=(\d+)\]", l)
        if m and m.group(2) != "0":
            r.setdefault(m.group(1), {})["queda"] = True
    return r
def cel(d):
    if d is None: return "não rodou"
    partes = []
    if d.get("queda"): partes.append("PROCESSO CAIU")
    modos = [v for k, v in d.items() if k in ("falhar", "corrigir")]
    if any(v[0] for v in modos): partes.append("ESCAPOU")
    if any(v[1] for v in modos): partes.append("DESSINCRONIZOU")
    if d.get("sem-resposta"): partes.append("sem resposta")
    if d.get("200-sem-corpo"): partes.append("200 sem corpo")
    return " + ".join(partes) if partes else "ok"
ordem = [re.sub(r'"', '', x) for x in re.findall(r'"([a-z0-9-]+)"', open(f"{SC}/comum.ts").read().split("export const VARIANTES = [")[1].split("];")[0])]
for app in ["api", "console"]:
    a = ler(f"{SC}/fd17ff4-{app}.txt"); b = ler(f"{SC}/antes-{app}.txt"); c = ler(f"{SC}/depois-{app}.txt")
    print(f"\n{app}: variante | guarda de fd17ff4 (= 24da65e) | guarda de d00a549 (HEAD, correção 6) | depois (correção 7)")
    for v in ordem:
        print(f"| `{v}` | {cel(a.get(v))} | {cel(b.get(v))} | {cel(c.get(v))} |")
