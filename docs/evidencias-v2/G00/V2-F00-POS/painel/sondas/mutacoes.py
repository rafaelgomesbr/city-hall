import subprocess, sys
RAIZ = 'C:/Projetos/city-hall/.claude/worktrees/agent-a8d79f1562a162af3/dc360/apps/web'
MUT = [
    ('H05: Usuarios deixa de recusar o Esc', 'src/paginas/Usuarios.tsx', '        fecharComEscape={false}\n', ''),
    ('H05: decidirTecla fecha com Esc sempre', 'src/componentes/Modal.tsx', 'return fecharComEscape ? { acao: "fechar" } : { acao: "seguir" };', 'return { acao: "fechar" };'),
    ('H05: ouvinte do documento ignora a opcao', 'src/componentes/Modal.tsx', 'aoFecharAtual.current, fecharComEscapeAtual.current)', 'aoFecharAtual.current, true)'),
    ('H26: o aviso volta a ser desenhado com a janela aberta', 'src/componentes/Toast.tsx', '  if (esperandoJanela) return null;\n', ''),
    ('H26: o Modal nao registra a abertura', 'src/componentes/Modal.tsx', 'const liberarAvisos = registrarModalAberto();', 'const liberarAvisos = () => {};'),
    ('H08: o Mais perde aria-expanded', 'src/componentes/BarraDoCelular.tsx', 'aria-expanded={aberto} ', ''),
    ('H08: o menu perde o Tema', 'src/componentes/BarraDoCelular.tsx', '<span>{tema === "claro" ? "Tema escuro" : "Tema claro"}</span>', '<span>x</span>'),
    ('H08: um destino some da divisao', 'src/componentes/navegacao-mais.ts', 'else noMais.push(item);', 'else if (item.principal) noMais.push(item);'),
    ('H08: a barra rola de novo', 'src/estilos/app.css', '  .lateral { --barra-visiveis: 6;\n             flex-direction: row;', '  .lateral { --barra-visiveis: 6; overflow-x: auto;\n             flex-direction: row;'),
    ('H08: o Esc deixa de fechar o menu', 'src/componentes/navegacao-mais.ts', 'return tecla === "Escape" ? "fechar" : "seguir";', 'return "seguir";'),
    ('H08: o menu sem area de toque do token', 'src/estilos/app.css', '    width: 100%; min-height: var(--ds-touch); padding: 0 var(--ds-sp-3);', '    width: 100%; min-height: 30px; padding: 0 var(--ds-sp-3);'),
    ('H08: quatro principais cabem a 320', 'src/componentes/navegacao-mais.ts', '{ consulta: "(max-width: 360px)", naBarra: 2 }', '{ consulta: "(max-width: 360px)", naBarra: 4 }'),
]
sel = sys.argv[1:]
for nome, arq, a, b in MUT:
    p = f'{RAIZ}/{arq}'
    original = open(p, encoding='utf8', newline='').read()
    assert a in original, (nome, a[:50])
    open(p, 'w', encoding='utf8', newline='').write(original.replace(a, b, 1))
    try:
        r = subprocess.run('npx vitest run', cwd=RAIZ, shell=True, capture_output=True, text=True, encoding='utf8', errors='replace')
        saida = r.stdout + r.stderr
        falhas = [l for l in saida.splitlines() if 'FAIL ' in l]
        print(('MORDEU ' if r.returncode != 0 else 'PASSOU (NAO MORDEU) ') + nome + f' [{len(falhas)} falha(s)]')
    finally:
        open(p, 'w', encoding='utf8', newline='').write(original)
