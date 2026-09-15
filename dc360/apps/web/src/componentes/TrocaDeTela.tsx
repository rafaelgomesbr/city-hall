import { useEffect, useRef } from "react";
import { useLocation } from "react-router-dom";
import { ehTelaInterna, marcarComoInterna } from "../seo/indexacao";
import { PRODUTO, tituloDaAba } from "../seo/titulo";

/**
 * O que acontece quando a tela muda, para quem não enxerga a tela.
 *
 * Numa aplicação de página única, trocar de rota não é navegação para o
 * navegador: o endereço muda, o conteúdo é substituído, e nada disso é
 * anunciado. Com NVDA, ir de "Painel" para "Ocorrências" é silêncio absoluto,
 * e o título da aba continua o mesmo desde que a página abriu.
 *
 * Duas coisas resolvem, e as duas precisam existir:
 *
 * 1. O TÍTULO. É o que o leitor de tela anuncia primeiro e o que a pessoa
 *    encontra ao alternar janelas. Um título estático numa aplicação de onze
 *    telas é o mesmo que nenhum.
 * 2. O FOCO. Sem levá-lo ao conteúdo, quem navega por teclado continua com o
 *    cursor no item de menu que acabou de clicar, e precisa percorrer a
 *    lateral inteira de novo para chegar na tela nova. O `<main>` já era
 *    `tabIndex={-1}` justamente para isto, e ninguém o focava.
 *
 * O foco NÃO se move na primeira renderização. Levar o foco quando a pessoa
 * acabou de abrir o painel é roubar o cursor de quem nem chegou a navegar.
 */

const TITULOS: Record<string, string> = {
  "/painel": "Painel",
  "/meu-trabalho": "Meu trabalho",
  "/minha-conta": "Minha conta",
  "/ocorrencias": "Ocorrências",
  "/ocorrencias/nova": "Registrar ocorrência",
  "/mapa": "Mapa da cidade",
  "/quem-esta-em-campo": "Quem está em campo",
  "/equipes": "Equipes",
  "/orgaos": "Órgãos de destino",
  "/usuarios": "Usuários",
  "/auditoria": "Auditoria",
  "/entrar": "Entrar",
  "/recuperar-senha": "Recuperar senha",
  "/redefinir-senha": "Definir nova senha",
  "/quero-conhecer": "Quero conhecer",
};

/** O nome da tela, para o título e para o anúncio. */
export function nomeDaTela(caminho: string): string {
  if (TITULOS[caminho]) return TITULOS[caminho]!;
  // Detalhe de ocorrência: `/ocorrencias/<uuid>`. O protocolo só existe
  // depois que os dados chegam, e o título precisa mudar no instante da
  // navegação; quando ele chega, a própria tela troca por `useTitulo`.
  if (/^\/ocorrencias\/[0-9a-f-]{36}$/.test(caminho)) return "Ocorrência";
  return PRODUTO;
}

export function TrocaDeTela() {
  const { pathname } = useLocation();
  const primeira = useRef(true);

  useEffect(() => {
    // Rede de segurança do título: a tela grava o seu por `useTitulo` (e
    // vence, porque o efeito dela roda depois deste), mas este garante que
    // toda rota tem nome no instante da navegação. Formato em src/seo/titulo.
    document.title = tituloDaAba(nomeDaTela(pathname));
    // Depois do login é uso interno da prefeitura: nenhum buscador guarda.
    marcarComoInterna(ehTelaInterna(pathname));

    if (primeira.current) {
      primeira.current = false;
      return;
    }

    const conteudo = document.getElementById("conteudo");
    conteudo?.focus();
    // Rolar junto: focar sem rolar deixa o leitor de tela num lugar e o olho
    // em outro, o que é pior do que não fazer nada.
    window.scrollTo({ top: 0 });
  }, [pathname]);

  return null;
}
