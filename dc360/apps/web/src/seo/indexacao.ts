/**
 * O que um buscador pode guardar deste painel.
 *
 * A raiz e a tela de entrar são públicas: é por elas que uma prefeitura acha o
 * sistema, e a imagem e a descrição do `index.html` existem para isso. Tudo
 * depois do login é uso interno de Defesa Civil: fila de ocorrências, nomes de
 * solicitantes, endereços. Nada disso deve aparecer num resultado de busca,
 * nem como título de página.
 *
 * O `index.html` é um só para todas as rotas (é uma aplicação de página
 * única), então a marca de "não indexar" não pode ficar escrita nele: ela é
 * colocada e tirada por código, na troca de rota, no mesmo lugar em que o
 * título é trocado (`TrocaDeTela`).
 *
 * Isto complementa, e não substitui, a barreira de verdade: quem não está
 * autenticado é mandado para `/entrar` antes de qualquer dado, e o servidor
 * não responde nada sem token. A marca existe para o robô que chegar a uma
 * dessas URLs não guardar nem o título dela.
 */

/**
 * Rotas que podem ser indexadas. Todas as outras são internas.
 *
 * `/redefinir-senha` fica aqui porque o portão de `seo.test.ts` define "pública"
 * como "fora de <Protegida>". A página que carrega o link de uso único não é
 * indexada por outro caminho: `vercel.json` a serve com `X-Robots-Tag: noindex`
 * (V2-F00-E10), e a tela apaga o token da barra de endereço ao lê-lo.
 */
export const ROTAS_PUBLICAS: ReadonlySet<string> = new Set([
  "/",
  "/entrar",
  "/recuperar-senha",
  "/redefinir-senha",
  "/quero-conhecer",
]);

export function ehTelaInterna(caminho: string): boolean {
  return !ROTAS_PUBLICAS.has(caminho);
}

const NOME = "robots";

/**
 * Coloca (ou tira) `<meta name="robots" content="noindex">` no `<head>`.
 * Idempotente: chamar duas vezes com o mesmo valor não duplica a tag.
 */
export function marcarComoInterna(interna: boolean): void {
  const existente = document.head.querySelector<HTMLMetaElement>(`meta[name="${NOME}"]`);
  if (!interna) {
    existente?.remove();
    return;
  }
  if (existente) {
    existente.content = "noindex";
    return;
  }
  const meta = document.createElement("meta");
  meta.name = NOME;
  meta.content = "noindex";
  document.head.append(meta);
}
