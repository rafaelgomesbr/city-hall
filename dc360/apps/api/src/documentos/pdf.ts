import type { Browser } from "playwright";

/**
 * Geração de PDF a partir do HTML do documento.
 *
 * O template é um só: o mesmo arquivo que abre no navegador é o que vira PDF.
 * Manter dois geradores produziria dois documentos com o mesmo número de
 * protocolo e diferenças que ninguém percebe até alguém comparar o papel com
 * a tela numa audiência.
 *
 * É uma porta porque o motor de renderização é decisão de infraestrutura, não
 * de domínio, e porque um teste que precisasse baixar um navegador a cada
 * execução seria desligado na primeira vez que atrasasse a suíte.
 */
export type GeradorDePdf = {
  gerar(html: string): Promise<Uint8Array>;
  encerrar(): Promise<void>;
};

export type OpcoesPlaywright = {
  /**
   * Quanto tempo esperar a página ficar pronta. As imagens da evidência vêm
   * por URL assinada, então a renderização depende de rede.
   */
  tempoLimiteMs?: number;
};

/**
 * Renderiza com Chromium sem interface.
 *
 * O navegador é aberto UMA vez e reaproveitado. Abrir um por documento custa
 * cerca de um segundo cada e derruba o servidor no dia em que alguém exporta
 * a fila inteira.
 */
export function geradorPlaywright(opcoes: OpcoesPlaywright = {}): GeradorDePdf {
  const { tempoLimiteMs = 30_000 } = opcoes;
  let navegador: Browser | null = null;
  let abrindo: Promise<Browser> | null = null;

  async function obter(): Promise<Browser> {
    if (navegador?.isConnected()) return navegador;
    if (abrindo) return abrindo;
    abrindo = (async () => {
      const { chromium } = await import("playwright");
      navegador = await chromium.launch({ args: ["--no-sandbox"] });
      abrindo = null;
      return navegador;
    })();
    return abrindo;
  }

  return {
    async gerar(html: string): Promise<Uint8Array> {
      const contexto = await (await obter()).newContext();
      const pagina = await contexto.newPage();
      try {
        await pagina.setContent(html, {
          // `networkidle` porque as fotos precisam ter chegado: um laudo com
          // quadrado cinza no lugar da evidência é pior que nenhum laudo.
          waitUntil: "networkidle",
          timeout: tempoLimiteMs,
        });
        return await pagina.pdf({
          format: "A4",
          printBackground: true,
          margin: { top: "10mm", bottom: "10mm", left: "10mm", right: "10mm" },
        });
      } finally {
        await contexto.close();
      }
    },

    async encerrar(): Promise<void> {
      await navegador?.close();
      navegador = null;
    },
  };
}
