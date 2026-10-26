import type { FastifyInstance } from "fastify";
import { semPrefixoDeVersao } from "../src/versao-v1.js";

/**
 * O que a API registrou de verdade, lido do servidor montado.
 *
 * Mora fora de `superficie.test.ts` desde a V2-F00-E23 porque o contrato do
 * painel (`contrato-do-painel.test.ts`) precisa da MESMA leitura da árvore e da
 * MESMA lista de isenções: duas cópias do parser divergiriam na primeira
 * atualização do Fastify, e uma delas passaria a conferir endereço nenhum.
 */

/**
 * As únicas rotas que podem responder sem token, cada uma com a razão.
 *
 * Acrescentar algo aqui é uma decisão de segurança, e é por isso que a lista
 * é de exceções e não de regras: exceção alguém revisa, regra alguém esquece.
 */
export const SEM_TOKEN = new Map<string, string>([
  ["GET /saude", "sonda do balanceador, e não devolve dado de município"],
  ["POST /auth/entrar", "é o que entrega o token"],
  [
    "POST /auth/segundo-fator",
    "é a SEGUNDA metade da entrada, e por definição acontece antes de existir "
    + "sessão. Quem chega aqui já provou a senha, e o que ele traz é o token de "
    + "desafio (plateia `dc360-desafio`, cinco minutos, propósito único), que "
    + "rota nenhuma do produto aceita como credencial: é isso que impede o "
    + "atalho de emitir o token de acesso antes do segundo fator e só esconder "
    + "a tela",
  ],
  ["POST /auth/renovar", "autentica pelo próprio token de renovação"],
  ["POST /auth/sair", "revoga pelo token de renovação, sem precisar do de acesso"],
  ["POST /auth/recuperar", "quem esqueceu a senha não tem token"],
  [
    "GET /auth/recuperacao",
    "quem esqueceu a senha não tem token, e a tela precisa saber se a recuperação "
    + "por email está ligada ANTES de pedir o email. Devolve só `{ ativa }`: um "
    + "interruptor do servidor inteiro, igual para todos, sem dado de município",
  ],
  ["POST /auth/redefinir", "autentica pelo link de uso único"],
  [
    "GET /v1/aplicativos/:aplicativo/versao-minima",
    "o aplicativo recusado por versão antiga não consegue autenticar para perguntar "
    + "o que precisa instalar (V2-F02-E06). Devolve só `{ aplicativo, versaoMinima }`, "
    + "uma configuração do servidor igual para todos, sem dado de município. Existe "
    + "só em `/v1` (`ROTAS_SO_NO_V1`)",
  ],
  ["PUT /armazenamento/objeto", "autenticado pela assinatura embutida na URL"],
  ["GET /armazenamento/objeto", "autenticado pela assinatura embutida na URL"],
  [
    "POST /publico/interesse",
    "formulário público de contato: quem preenche ainda não é cliente e não "
    + "tem token. Grava pedido e NÃO cria município nenhum; o papel de "
    + "aplicação insere e não lê (migração 011)",
  ],
  [
    "GET /publico/oficio/:token",
    "o ofício que o órgão destinatário abre: quem clica é uma pessoa do Corpo "
    + "de Bombeiros ou da Secretaria de Obras, sem conta no sistema. O que "
    + "protege não é token de sessão e sim o próprio endereço, que é um segredo "
    + "de 32 bytes que só existe dentro do email enviado, EXPIRA, ABRE UMA VEZ "
    + "SÓ e deixa registro de quem abriu (migração 017). É a única leitura sem "
    + "autenticação que devolve dado de município, e é por isso que o email não "
    + "leva o conteúdo do ofício",
  ],
]);

/**
 * A isenção é declarada UMA vez, na forma sem prefixo (`SEM_TOKEN`), e vale
 * para o mesmo caminho sob `/v1` (V2-F02-E01): tira-se o `/v1` da chave antes
 * de consultar. `GET /v1/saude` não existe, então não há isenção a herdar lá.
 * A rota que só existe em `/v1` entra com a chave escrita com o prefixo.
 */
export function ehSemToken(chave: string): boolean {
  const [metodo, caminho] = chave.split(" ");
  // A chave sem prefixo vale para os dois lados; a escrita COM `/v1` é para a rota
  // que só existe em `/v1` (`ROTAS_SO_NO_V1`), que nunca teve par sem prefixo.
  return (
    SEM_TOKEN.has(`${metodo ?? ""} ${semPrefixoDeVersao(caminho ?? "")}`) || SEM_TOKEN.has(chave)
  );
}

export type Rota = { metodo: string; caminho: string };

/**
 * Lê a árvore de rotas do próprio Fastify.
 *
 * `printRoutes` é a única forma pública de enumerar o que foi registrado, e é
 * justamente por vir do servidor montado que ela não pode ficar desatualizada.
 */
export function rotasRegistradas(instancia: FastifyInstance): Rota[] {
  const arvore = instancia.printRoutes({ commonPrefix: false });
  const rotas: Rota[] = [];

  /*
    O caminho de verdade é a CONCATENAÇÃO da árvore, e não o texto de uma
    linha.

    `printRoutes` desenha uma árvore em que cada linha traz só o próprio
    segmento. A versão anterior deste parser tomava o segmento como se fosse o
    caminho inteiro, e o resultado era pedir `GET :id` e `POST /triagem`, que
    não existem: DEZESSETE rotas do produto respondiam 404, e o portão aceitava
    404 como prova de que estavam protegidas.

    Ou seja: o portão que existe para garantir que nenhuma rota responde sem
    token estava, para a maioria delas, verificando endereço nenhum. Isso só
    apareceu quando a régua foi apertada para exigir 401.

    A profundidade sai do prefixo de desenho, contado em blocos de quatro
    caracteres, que é como o Fastify indenta.
  */
  const pilha: string[] = [];

  for (const linha of arvore.split("\n")) {
    const casou = /^([\s│├└─]*)(\S+)\s+\((.+?)\)\s*$/.exec(linha);
    if (!casou) continue;

    const profundidade = Math.floor(casou[1]!.length / 4);
    const segmento = casou[2]!;

    pilha.length = profundidade;
    pilha[profundidade] = segmento;
    const caminho = pilha.slice(0, profundidade + 1).join("");

    for (const metodo of casou[3]!.split(",").map((m) => m.trim())) {
      if (metodo === "HEAD" || metodo === "OPTIONS") continue;
      rotas.push({ metodo, caminho });
    }
  }
  return rotas;
}
