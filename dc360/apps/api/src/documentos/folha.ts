/**
 * A folha: o esqueleto visual de todo documento oficial do sistema.
 *
 * O servidor público julga o software pelo documento que ele produz. Um laudo
 * que sai torto, sem protocolo visível ou sem identificação de quem assinou,
 * derruba a confiança em tudo que veio antes, por melhor que seja o sistema.
 *
 * Por isso o documento é gerado no SERVIDOR, e não montado na tela: o laudo
 * precisa sair igual no navegador do coordenador, na impressora da recepção e
 * no PDF que vai anexado ao processo. Gerar em três lugares seria produzir
 * três documentos diferentes com o mesmo número de protocolo.
 *
 * O CSS é embutido de propósito. O arquivo precisa ser autossuficiente: ele
 * será impresso, salvo em disco e anexado a processo administrativo, e uma
 * folha oficial que depende de folha de estilo externa vira papel em branco no
 * dia em que o caminho mudar.
 */

export function escapar(texto: unknown): string {
  return String(texto ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function formatarDataHora(iso: string | null): string {
  if (!iso) return "não informado";
  return new Date(iso).toLocaleString("pt-BR", {
    day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

const ESTILO = `
  :root {
    --tinta: #14191D;
    --tinta-fraca: #4A5763;
    --linha: #C9D2D8;
    --marca: #5B21B6;
    --papel: #FFFFFF;
  }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; background: #E9EDF1; }
  body {
    font-family: "Work Sans", -apple-system, "Segoe UI", Roboto, Arial, sans-serif;
    color: var(--tinta);
    font-size: 12pt;
    line-height: 1.45;
  }
  .folha {
    background: var(--papel);
    width: 210mm;
    min-height: 297mm;
    margin: 16px auto;
    padding: 18mm 18mm 22mm;
    position: relative;
    box-shadow: 0 4px 12px rgba(16,21,25,0.12);
  }
  .cabecalho {
    display: flex; gap: 14px; align-items: center;
    border-bottom: 2px solid var(--marca);
    padding-bottom: 10px; margin-bottom: 14px;
  }
  .brasao {
    width: 54px; height: 54px; flex: 0 0 54px;
    border: 2px solid var(--marca); border-radius: 50%;
    display: grid; place-items: center;
    color: var(--marca); font-weight: 700; font-size: 15pt;
  }
  .orgao { font-weight: 700; font-size: 12pt; line-height: 1.25; }
  .municipio { color: var(--tinta-fraca); font-size: 10pt; }
  .titulo {
    text-align: center; font-size: 15pt; font-weight: 700;
    letter-spacing: 0.02em; margin: 16px 0 4px; text-transform: uppercase;
  }
  .protocolo {
    text-align: center; font-family: "Roboto Mono", ui-monospace, Consolas, monospace;
    font-size: 12pt; color: var(--tinta-fraca); margin-bottom: 18px;
  }
  h2 {
    font-size: 10pt; text-transform: uppercase; letter-spacing: 0.08em;
    color: var(--tinta-fraca); border-bottom: 1px solid var(--linha);
    padding-bottom: 4px; margin: 18px 0 8px;
  }
  .campos { display: grid; grid-template-columns: 1fr 1fr; gap: 6px 18px; }
  .campo { break-inside: avoid; }
  .rotulo {
    font-size: 8.5pt; text-transform: uppercase; letter-spacing: 0.06em;
    color: var(--tinta-fraca); font-weight: 600;
  }
  .valor { font-size: 11pt; }
  .valor.mono { font-family: "Roboto Mono", ui-monospace, Consolas, monospace; }
  .largo { grid-column: 1 / -1; }
  .relato {
    border-left: 3px solid var(--linha); padding-left: 10px;
    font-size: 11pt; white-space: pre-wrap;
  }
  table.checklist { width: 100%; border-collapse: collapse; font-size: 11pt; }
  table.checklist td { padding: 5px 0; border-bottom: 1px solid var(--linha); }
  table.checklist td.resposta { text-align: right; font-weight: 700; white-space: nowrap; }
  .fotos { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
  .foto { break-inside: avoid; }
  .foto img {
    width: 100%; height: 62mm; object-fit: cover;
    border: 1px solid var(--linha);
  }
  .foto .legenda { font-size: 9pt; color: var(--tinta-fraca); margin-top: 4px; }
  .assinaturas { display: grid; grid-template-columns: 1fr 1fr; gap: 28px; margin-top: 26px; }
  .assinatura { text-align: center; break-inside: avoid; }
  /* Altura fixa para o bloco não pular quando um lado tem traço e o outro não. */
  .assinatura .traco { display: block; height: 46px; margin: 0 auto -2px; max-width: 100%; }
  .assinatura .linha { border-top: 1px solid var(--tinta); margin-bottom: 5px; }
  .assinatura .nome { font-size: 11pt; font-weight: 600; }
  .assinatura .papel { font-size: 9pt; color: var(--tinta-fraca); }
  .rodape {
    margin-top: 22px; padding-top: 8px; border-top: 1px solid var(--linha);
    display: flex; justify-content: space-between; align-items: flex-end;
    font-size: 8.5pt; color: var(--tinta-fraca);
  }
  .validacao { display: flex; gap: 10px; align-items: center; }
  .selo-validacao {
    width: 56px; height: 56px; flex: 0 0 56px;
    border: 1px solid var(--linha); display: grid; place-items: center;
    font-family: "Roboto Mono", ui-monospace, Consolas, monospace;
    font-size: 6pt; text-align: center; line-height: 1.15; padding: 3px;
    word-break: break-all;
  }
  .aviso-prototipo {
    margin: 0 auto 0; max-width: 210mm; padding: 10px 18mm;
    background: #FEF3C7; color: #92400E; font-size: 10pt;
  }
  .marca-dagua {
    position: absolute; inset: 0; display: grid; place-items: center;
    pointer-events: none; opacity: 0.07;
    font-size: 48pt; font-weight: 800; transform: rotate(-28deg);
    color: var(--marca); letter-spacing: 0.1em;
  }
  .barra { max-width: 210mm; margin: 16px auto 0; padding: 0 18mm; }
  .barra button {
    font: inherit; font-size: 11pt; padding: 9px 18px; cursor: pointer;
    background: var(--marca); color: #fff; border: none; border-radius: 6px;
  }
  @media print {
    html, body { background: #fff; }
    .barra, .aviso-prototipo { display: none; }
    .folha { margin: 0; box-shadow: none; width: auto; min-height: auto; padding: 12mm; }
    /* A marca d'água acompanha o papel: um documento impresso sem ela
       passaria por definitivo. */
    .marca-dagua { opacity: 0.10; }
    @page { size: A4; margin: 10mm; }
  }
`;

export type Cabecalho = {
  orgao: string;
  municipio: string;
  uf: string;
};

export type OpcoesFolha = {
  titulo: string;
  protocolo: string;
  cabecalho: Cabecalho;
  corpo: string;
  /** Código curto que identifica a versão emitida deste documento. */
  validacao: string;
  emitidoEm: Date;
  emitidoPor: string;
  /** Texto da marca d'água. Vazio remove a marca. */
  marcaDagua?: string;
};

export function montarFolha(o: OpcoesFolha): string {
  const marca = o.marcaDagua ?? "";
  return `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapar(o.titulo)} ${escapar(o.protocolo)}</title>
<style>${ESTILO}</style>
</head>
<body>
${marca ? `<p class="aviso-prototipo">${escapar(marca)}</p>` : ""}
<div class="barra"><button type="button" onclick="window.print()">Imprimir</button></div>
<article class="folha">
  ${marca ? `<div class="marca-dagua" aria-hidden="true">${escapar(marca)}</div>` : ""}
  <header class="cabecalho">
    <div class="brasao" aria-hidden="true">DC</div>
    <div>
      <div class="orgao">${escapar(o.cabecalho.orgao)}</div>
      <div class="municipio">${escapar(o.cabecalho.municipio)}, ${escapar(o.cabecalho.uf)}</div>
    </div>
  </header>

  <h1 class="titulo">${escapar(o.titulo)}</h1>
  <p class="protocolo">Protocolo ${escapar(o.protocolo)}</p>

  ${o.corpo}

  <footer class="rodape">
    <div>
      Emitido em ${escapar(formatarDataHora(o.emitidoEm.toISOString()))}<br>
      por ${escapar(o.emitidoPor)}
    </div>
    <div class="validacao">
      <div class="selo-validacao" aria-hidden="true">${escapar(o.validacao)}</div>
      <div>Código de validação<br><strong>${escapar(o.validacao)}</strong></div>
    </div>
  </footer>
</article>
</body>
</html>`;
}

export function campo(rotulo: string, valor: unknown, opcoes: { largo?: boolean; mono?: boolean } = {}): string {
  return `<div class="campo${opcoes.largo ? " largo" : ""}">
    <div class="rotulo">${escapar(rotulo)}</div>
    <div class="valor${opcoes.mono ? " mono" : ""}">${escapar(valor)}</div>
  </div>`;
}

/**
 * Bloco de assinatura da folha.
 *
 * `tracoUrl` é o traço coletado no aparelho, quando existe. Ele fica ACIMA da
 * linha, no lugar onde a pessoa assinaria no papel, e a linha continua ali:
 * assinatura eletrônica avançada não é o que este documento entrega hoje, e
 * quem imprimir para colher assinatura de próprio punho precisa da linha.
 *
 * Sem traço, o bloco é exatamente o que sempre foi. Um documento não pode
 * ficar diferente por causa de um dado que o aparelho não mandou.
 */
export function assinatura(nome: string, papel: string, tracoUrl?: string | null): string {
  const traco = tracoUrl
    ? `<img class="traco" src="${escapar(tracoUrl)}" alt="Assinatura de ${escapar(nome)}">`
    : "";
  return `<div class="assinatura">
    ${traco}
    <div class="linha"></div>
    <div class="nome">${escapar(nome)}</div>
    <div class="papel">${escapar(papel)}</div>
  </div>`;
}
