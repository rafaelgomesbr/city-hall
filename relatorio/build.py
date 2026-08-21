#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
RONALDINHO — montador de dossiê.

Uso:
    python build.py                  # monta e renderiza o PDF
    python build.py --check          # + gera PNGs de conferência
    python build.py --nome "Meu-Dossie"

Junta os fragmentos NN-*.html em ordem numérica, fecha o documento e
renderiza em PDF com Chrome/Edge headless.

O fragmento 01-* precisa conter <head>, a capa e <main> aberto
(é o template.html preenchido). Os demais são fragmentos puros.
"""
import io, os, re, sys, glob, subprocess

BASE = os.path.dirname(os.path.abspath(__file__))
ARGS = sys.argv[1:]

def arg(flag, default=None):
    if flag in ARGS:
        i = ARGS.index(flag)
        if i + 1 < len(ARGS):
            return ARGS[i + 1]
    return default

NOME = arg("--nome", "Dossie")
CHECK = "--check" in ARGS

FOOTER = """
<div class="footer-note">
<strong>Nota de método.</strong> Levantamento sobre fontes públicas primárias nas datas indicadas ao longo do documento.
Preços de terceiros mudam sem aviso e devem ser reconfirmados antes de qualquer contratação.
Itens marcados como &ldquo;a confirmar&rdquo; não puderam ser validados em fonte oficial e estão listados como tarefa da primeira fase.
</div>
</main>
</body>
</html>
"""


def find_browser():
    candidatos = [
        r"C:\Program Files\Google\Chrome\Application\chrome.exe",
        r"C:\Program Files (x86)\Google\Chrome\Application\chrome.exe",
        r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe",
        r"C:\Program Files\Microsoft\Edge\Application\msedge.exe",
        "/usr/bin/google-chrome", "/usr/bin/chromium",
        "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    ]
    for c in candidatos:
        if os.path.exists(c):
            return c
    return None


def main():
    partes = sorted(glob.glob(os.path.join(BASE, "[0-9][0-9]-*.html")))
    if not partes:
        print("ERRO: nenhum fragmento NN-*.html encontrado em", BASE)
        return 1

    # o primeiro precisa ser o cabeçalho
    primeiro = os.path.basename(partes[0])
    if not primeiro.startswith("01-"):
        print("AVISO: o primeiro fragmento é", primeiro, "- esperado 01-* com <head> e a capa")

    conteudo = []
    print("Fragmentos:")
    for p in partes:
        with io.open(p, encoding="utf-8") as f:
            txt = f.read()
        print("  %-34s %6d chars" % (os.path.basename(p), len(txt)))
        conteudo.append(txt)

    html = "\n".join(conteudo) + FOOTER

    # --- validações que evitam PDF quebrado ---
    placeholders = sorted(set(re.findall(r"\{\{[A-Z0-9_]+\}\}", html)))
    if placeholders:
        print("\nAVISO: placeholders não preenchidos ->", ", ".join(placeholders))

    if "<main>" not in html:
        print("AVISO: <main> não encontrado — o fragmento 01 deve abri-lo")
    for tag in ("</body>", "</html>"):
        if html.count(tag) > 1:
            print("AVISO: %s aparece mais de uma vez — remova dos fragmentos" % tag)

    out_html = os.path.join(BASE, "dossie.html")
    with io.open(out_html, "w", encoding="utf-8") as f:
        f.write(html)
    print("\nHTML: %s (%d chars)" % (out_html, len(html)))

    browser = find_browser()
    if not browser:
        print("ERRO: Chrome/Edge não encontrado. Abra o HTML e imprima em PDF manualmente.")
        return 1

    out_pdf = os.path.join(BASE, "%s.pdf" % NOME)
    cmd = [browser, "--headless=new", "--disable-gpu", "--no-sandbox",
           "--no-pdf-header-footer", "--run-all-compositor-stages-before-draw",
           "--virtual-time-budget=15000",
           "--print-to-pdf=" + out_pdf,
           "file:///" + out_html.replace("\\", "/")]
    r = subprocess.run(cmd, capture_output=True, text=True, timeout=300)
    if not os.path.exists(out_pdf):
        print("ERRO ao renderizar. stderr:\n", (r.stderr or "")[-2000:])
        return 1

    print("PDF:  %s (%.1f KB)" % (out_pdf, os.path.getsize(out_pdf) / 1024.0))

    # --- conferência visual ---
    try:
        import pymupdf
    except ImportError:
        try:
            import fitz as pymupdf
        except ImportError:
            pymupdf = None

    if pymupdf is None:
        print("\nDica: pip install pymupdf  -> habilita contagem de páginas e PNGs de conferência")
        return 0

    d = pymupdf.open(out_pdf)
    txt = "".join(p.get_text() for p in d)
    print("Páginas: %d | Palavras: %d" % (d.page_count, len(txt.split())))

    for ruim in ("TODO", "TBD", "Lorem ipsum", "{{"):
        if ruim in txt:
            print("AVISO: '%s' aparece no PDF final" % ruim)

    subs = re.findall(r"\n(\d{1,2}\.\d{1,2})\s+[A-ZÀ-Ú]", txt)
    if subs:
        print("Subseções:", " ".join(subs))

    if CHECK:
        alvos = sorted({0, 1, d.page_count // 4, d.page_count // 2,
                        (3 * d.page_count) // 4, d.page_count - 1})
        for i in alvos:
            d[i].get_pixmap(dpi=95).save(os.path.join(BASE, "check-p%02d.png" % (i + 1)))
        print("PNGs de conferência gerados: check-p*.png")
        print(">>> LEIA essas imagens. Procure: página com metade em branco,")
        print(">>> texto estourando célula, tabela cortada, numeração pulando.")
        print(">>> Depois de corrigir, apague os check-p*.png.")

    return 0


if __name__ == "__main__":
    sys.exit(main())
