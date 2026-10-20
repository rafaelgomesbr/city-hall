/**
 * A "geração" da credencial deste aparelho: sobe cada vez que a pessoa ENTRA
 * de novo (V2-F00-E06, correção 3).
 *
 * A fila de envio guarda a pausa por sessão (`sessao_encerrada`,
 * `conta_desativada`, `troca_de_senha_obrigatoria`) como uma observação sobre a
 * credencial que levou o 401 ou o 403. A pessoa só tem um ato que muda essa
 * credencial: entrar de novo, depois de a coordenação reativar a conta, de ela
 * definir a senha no painel, ou só porque a sessão caiu. A fila compara a
 * geração do pedido com a de agora, e a pausa velha cai sozinha, sem esperar
 * um envio dar certo (que, com a rede ruim de quem acabou de entrar, pode
 * demorar). Ver `OpcoesFila.geracaoDaSessao` em `packages/campo`.
 *
 * Mora fora do React e fora de `sessao.tsx` porque a fila, que vive fora das
 * telas, precisa lê-la sem importar o provedor. Vive na memória: reabrir o
 * aplicativo também zera a pausa da fila, que é igualmente só de memória.
 *
 * Renovar o token em silêncio NÃO sobe a geração: não é a pessoa agindo, e a
 * pausa por sessão encerrada nasce justamente de a renovação ter sido recusada.
 */

let geracao = 0;

export function geracaoDaSessao(): number {
  return geracao;
}

/** Chamada pelo login bem-sucedido, depois de guardar a credencial nova. */
export function novaGeracaoDaSessao(): void {
  geracao += 1;
}
