#!/usr/bin/env python3
"""Orçamento de uso do plano (Max 5x) por janela de 5 h e por semana.

Lê os transcritos de ~/.claude/projects (sessões e subagentes), soma o custo
equivalente em US$ pelas tabelas de preço da API (só como peso relativo entre
modelos) e compara com os tetos calibrados nos avisos reais de limite:
  janela de 5 h: avisos entre 136 e 197 (mínimo observado 136) -> teto 115
  semana (reinicia sábado 10:00, America/Sao_Paulo): aviso a 1821 -> teto 1700
Uso: python3 -I orcamento.py [--janela 115] [--semana 1700] [--json]
"""
import json, os, glob, sys, time, datetime as dt
from collections import defaultdict
args = sys.argv[1:]
def arg(n, p):
    return float(args[args.index(n) + 1]) if n in args else p
TETO_J, TETO_S = arg('--janela', 600), arg('--semana', 8000)
PRECO = {'opus': (5, 25), 'sonnet': (3, 15), 'haiku': (1, 5), 'fable': (15, 75)}
SP = dt.timezone(dt.timedelta(hours=-3))
agora = dt.datetime.now(dt.timezone.utc)
# início da semana: último sábado 10:00 em São Paulo
l = agora.astimezone(SP)
ini_sem = (l - dt.timedelta(days=(l.weekday() - 5) % 7)).replace(hour=10, minute=0, second=0, microsecond=0)
if ini_sem > l: ini_sem -= dt.timedelta(days=7)
corte = time.time() - 9 * 86400
msgs = {}
for f in glob.glob(os.path.expanduser('~/.claude/projects') + '/**/*.jsonl', recursive=True):
    if os.path.getmtime(f) < corte: continue
    for linha in open(f, errors='ignore'):
        if '"usage"' not in linha: continue
        try: d = json.loads(linha)
        except Exception: continue
        m = d.get('message') or {}
        u, mid, mod = m.get('usage'), m.get('id'), (m.get('model') or '').lower()
        if d.get('type') != 'assistant' or not u or not mid: continue
        p = next((v for k, v in PRECO.items() if k in mod), None)
        if not p: continue
        i, o = p
        c = (u.get('input_tokens', 0) * i + u.get('cache_creation_input_tokens', 0) * i * 1.25
             + u.get('cache_read_input_tokens', 0) * i * 0.1 + u.get('output_tokens', 0) * o) / 1e6
        t = dt.datetime.fromisoformat(d['timestamp'].replace('Z', '+00:00'))
        msgs[(mid, d.get('requestId'))] = (t, mod, c)
ev = sorted(msgs.values())
# janela corrente: blocos de 5 h que começam na primeira mensagem depois do fim do bloco anterior
ini = None
for t, _, _ in ev:
    if ini is None or t >= ini + dt.timedelta(hours=5): ini = t
if ini is None or agora >= ini + dt.timedelta(hours=5): ini = agora
gasto_j = defaultdict(float); gasto_s = 0.0
for t, mod, c in ev:
    if t >= ini: gasto_j[mod] += c
    if t >= ini_sem: gasto_s += c
gj = sum(gasto_j.values())
fim = ini + dt.timedelta(hours=5)
prox_sem = ini_sem + dt.timedelta(days=7)
janelas_rest = max(1.0, (prox_sem - agora).total_seconds() / (5 * 3600) * 0.6)  # ~60% do tempo com trabalho
teto_ritmo = (TETO_S - gasto_s) / janelas_rest + gj
teto_agora = max(0.0, min(TETO_J, teto_ritmo))
r = {
    'janela_inicio': ini.astimezone(SP).strftime('%d/%m %H:%M'), 'janela_fim': fim.astimezone(SP).strftime('%d/%m %H:%M'),
    'janela_gasto': round(gj, 1), 'janela_teto': round(teto_agora, 1), 'janela_restante': round(max(0, teto_agora - gj), 1),
    'semana_inicio': ini_sem.strftime('%d/%m %H:%M'), 'semana_gasto': round(gasto_s, 1), 'semana_teto': TETO_S,
    'semana_restante': round(TETO_S - gasto_s, 1), 'por_modelo_na_janela': {k: round(v, 1) for k, v in gasto_j.items()},
}
if '--json' in args: print(json.dumps(r, ensure_ascii=False)); sys.exit()
print(f"Janela {r['janela_inicio']} a {r['janela_fim']}: gasto {r['janela_gasto']} de {r['janela_teto']} (resta {r['janela_restante']})")
print(f"Semana desde {r['semana_inicio']}: gasto {r['semana_gasto']} de {TETO_S} (resta {r['semana_restante']})")
print('Por modelo na janela:', r['por_modelo_na_janela'])
