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

/**
 * Variável que aponta o executável do Chromium do sistema.
 *
 * O nome é o mesmo que o Dockerfile já definia, e é preciso dizer por quê: o
 * Playwright NÃO lê esta variável. Conferido no `playwright-core` 1.62.1, as
 * únicas variáveis que ele lê sobre onde achar navegador são
 * `PLAYWRIGHT_BROWSERS_PATH` e os endereços de download. Ou seja, a imagem
 * instalava o Chromium do Debian, apontava esta variável para ele, e o
 * Playwright ia procurar mesmo assim o navegador que ele baixa sozinho, que
 * `PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1` tinha acabado de impedir de existir.
 * Quem lê a variável somos nós, aqui.
 */
const VARIAVEL_DO_NAVEGADOR = "PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH";

export type OpcoesPlaywright = {
  /**
   * Quanto tempo esperar a página ficar pronta. As imagens da evidência vêm
   * por URL assinada, então a renderização depende de rede.
   */
  tempoLimiteMs?: number;
  /**
   * Executável do navegador. Ausente, vale a variável de ambiente e, na falta
   * dela, o navegador que o próprio Playwright baixou.
   */
  caminhoDoNavegador?: string;
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
      // O caminho é resolvido AGORA, e não na construção do gerador, porque
      // esta função também roda depois de uma falha: quem consertou a máquina
      // (instalou o navegador, corrigiu a variável) precisa ver o efeito sem
      // reiniciar o servidor.
      const executavel = opcoes.caminhoDoNavegador ?? process.env[VARIAVEL_DO_NAVEGADOR];
      navegador = await chromium.launch({
        args: ["--no-sandbox"],
        ...(executavel ? { executablePath: executavel } : {}),
      });
      return navegador;
    })();
    try {
      return await abrindo;
    } finally {
      /*
        Limpar a promessa TAMBÉM quando ela falha.

        Antes, `abrindo = null` só acontecia no caminho feliz, dentro da
        própria promessa. Uma abertura que falhasse (navegador ausente, imagem
        sem as bibliotecas do Chromium) deixava a promessa REJEITADA guardada
        aqui para sempre, e toda tentativa seguinte recebia aquela mesma
        rejeição antiga. O sintoma era cruel: instalar o navegador não
        adiantava nada, e o PDF só voltava depois de reiniciar o processo.
      */
      abrindo = null;
    }
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
