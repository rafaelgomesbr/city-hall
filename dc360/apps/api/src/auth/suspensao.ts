import type { Banco } from "../banco/tipos.js";

/**
 * O acesso suspenso pelo fornecedor, e o que a API faz com ele.
 *
 * O console do fornecedor pode suspender o acesso de uma prefeitura, e a
 * suspensão é REVERSÍVEL: é o estado de "contrato em discussão", não o de
 * município que saiu. O console escreve `organizacoes.acesso_suspenso_em` e
 * revoga as sessões daquela organização (migração 038). Ele não fala com a
 * API, e não precisa: a API lê o estado do banco, que é a única fonte, e faz
 * a suspensão valer no painel e no aparelho.
 *
 * ====================================================================
 * A RESPOSTA É 403 `acesso_suspenso`, E NUNCA 401.
 *
 * 401 quer dizer "credencial errada". Aqui a credencial está CERTA: a pessoa
 * digitou a senha certa, o token é autêntico. O que falta é o contrato. Quem
 * recebe 401 troca a senha, liga para o suporte, tenta de novo, e nada disso
 * resolve. A mensagem manda procurar quem administra o contrato, que é o único
 * ato que resolve, e a resposta só sai para quem já provou quem é: senha
 * errada em município suspenso recebe a recusa genérica de sempre, senão a
 * rota de entrar vira oráculo de quais prefeituras estão em discussão.
 *
 * ====================================================================
 * SESSÃO VIVA: ONDE A SUSPENSÃO É CONFERIDA, E ONDE NÃO É.
 *
 * O token de acesso vive quinze minutos (`ACESSO_MINUTOS`, 15 por padrão). A
 * versão original desta decisão conferia a suspensão só onde nasce credencial
 * nova e na escrita, e deixava a LEITURA com token vivo confiar na assinatura
 * até ele vencer, porque conferir em toda requisição custaria uma transação a
 * mais em cada leitura de uma noite de chuva. Desde a V2-F03-E03 a decisão é a
 * oposta: TODA requisição autenticada confere (ver "LEITURA", abaixo), porque o
 * que a leitura devolve é dado de município sob um contrato que o fornecedor
 * suspendeu. Onde cada conferência acontece:
 *
 *   - ENTRAR e RENOVAR conferem sempre. É ali que nasce credencial nova, e
 *     credencial nova sob contrato suspenso não pode nascer. Renovar confere
 *     mesmo com a sessão ainda de pé no banco, e responde 403
 *     `acesso_suspenso`: o console revoga as sessões ao suspender, mas a API
 *     não depende de outro processo ter feito a parte dele. Quando o console
 *     já revogou, a sessão é uma sessão encerrada como outra qualquer, e a
 *     renovação responde 401 `sessao_encerrada`; o 403 aparece no pedido
 *     seguinte (entrar, ou o token de acesso vencido, abaixo).
 *   - ESCRITA com token vivo confere sempre. Escrita é todo método que não
 *     seja GET nem HEAD E também o GET (com o HEAD dele) da rota marcada com
 *     `ROTA_GET_COM_EFEITO` (`servidor.ts`): o laudo, o termo de
 *     interdição, o termo de desinterdição e os PDFs, o CSV de ocorrências e
 *     o sino `GET /avisos`, que materializa avisos e expurga os velhos.
 *     Todos esses respondem 403 `acesso_suspenso` com o município suspenso,
 *     como um POST de qualquer rota fora da fila do campo. As rotas que a
 *     fila do aparelho chama (marcadas com `filaDoCampo`, todas POST)
 *     recusam a mesma escrita com 503, e não 403: ver "A FILA DO APARELHO
 *     RECEBE 503", abaixo. Escrever cria registro (protocolo, laudo, evento de
 *     trilha) sob um contrato que o fornecedor suspendeu, e o custo é uma
 *     consulta por escrita, que é a parte pequena do tráfego. Essa MESMA
 *     consulta confere também a vigência de quem escreve (conta ativa,
 *     papel do token, sessão de pé, senha provisória no prazo): ver
 *     `auth/vigencia.ts`. Ela nasceu em 15/09/2026, ficou DESLIGADA de
 *     17/09/2026 até a V2-F00-E04 (2026-10-06), e as rotas GET marcadas
 *     entraram na correção 1 da E04 (2026-10-13).
 *   - LEITURA com token vivo CONFERE, GET e HEAD (V2-F03-E03). Era a única
 *     exceção desta lista (antes, a janela de quinze minutos que o produto
 *     aceitava para leitura quando um usuário era desativado ou expulso), e
 *     deixou de ser: o município suspenso responde 403 `acesso_suspenso` de
 *     imediato também na leitura, no pedido seguinte à suspensão. O custo é uma
 *     consulta por requisição, a MESMA que já conferia a vigência
 *     (`auth/vigencia.ts` lê a organização e a conta numa ida só), sem cache e
 *     sem lista de revogação. A marca `ROTA_GET_COM_EFEITO` não decide mais se a
 *     rota confere; só lista os GET que gravam (`test/get-com-efeito.test.ts`).
 *     A política final da suspensão (o que o fornecedor pode fazer, por quanto
 *     tempo e com que aviso) é da F20-E04 (CP-29), e esta conferência só faz a
 *     API obedecer ao estado que o banco tem.
 *   - TOKEN VENCIDO mas AUTÊNTICO confere. Este é o caso do aplicativo de
 *     campo: depois que a renovação falha, o aparelho segue apresentando o
 *     token vencido, e sem esta conferência ele receberia 401 para sempre, que
 *     a tela lê como "sua sessão terminou, entre de novo". Entrar de novo dá
 *     403 para sempre. Respondendo já aqui, a tela diz a frase certa e não
 *     oferece o botão que não resolve. A resposta é 403 `acesso_suspenso`,
 *     e 503 nas rotas marcadas com `filaDoCampo` (o mesmo status da escrita
 *     com token vivo nelas, pela razão da seção abaixo). Custa uma consulta
 *     só quando a resposta seria 401 de qualquer forma, e a organização sai
 *     de um token que ESTE servidor assinou, nunca de um token forjado.
 *
 * ====================================================================
 * A FILA DO APARELHO RECEBE 503, E NÃO 403.
 *
 * `packages/campo/src/transporte.ts` classifica 5xx e 429 como temporário, e
 * o 4xx que não é de sessão, de conta nem de contrato como permanente, e
 * permanente vira item `bloqueado` ("alguém precisa olhar", na legenda dos
 * estados de `packages/campo/src/fila.ts`). A coleta que está
 * no aparelho foi feita no morro, e a suspensão é reversível: ela precisa
 * ESPERAR, e subir sozinha quando o acesso voltar. A fila espera com teto de
 * cinco minutos entre tentativas (`ESPERA_MAXIMA_MS`), que é o custo certo.
 * Por isso as rotas que a fila chama (marcadas com `filaDoCampo` na
 * configuração da rota) recusam com 503, que o cliente trata como temporário
 * só pelo status, e que é o mesmo código que o produto já usa para "existe e
 * está indisponível por decisão de quem implantou" (`recuperacao_desligada`).
 * Desde a V2-F00-E06 o cliente também lê o 403 `acesso_suspenso` pelo código
 * do catálogo e o trata como temporário; esse ramo é a defesa em
 * profundidade do cliente, e o 503 continua sendo a resposta destas rotas.
 *
 * O que NÃO se faz: aceitar a coleta e gravá-la sob o contrato suspenso. O
 * aparelho é o lugar certo para ela esperar, porque é o único que a fila sabe
 * reapresentar com a mesma chave de idempotência.
 */

export type EstadoDoAcesso = "ativo" | "suspenso" | "inexistente";

/**
 * Responde, para UMA organização, se ela pode usar o sistema agora.
 *
 * Roda dentro do `comTenant` da própria organização, debaixo do RLS, com o
 * papel de aplicação. `organizacoes` só devolve a linha do contexto, então
 * esta consulta não enxerga nenhuma outra prefeitura, e não precisou de função
 * privilegiada nova: o orçamento de `SECURITY DEFINER` deste produto é curto
 * de propósito.
 *
 * `inexistente` cobre a organização que a eliminação já apagou por inteiro:
 * um token dela ainda pode estar vivo em algum aparelho, e a resposta certa é
 * a mesma da suspensão, porque o ato que resolve é o mesmo (procurar o
 * contrato). `eliminada_em` preenchido, com a linha ainda de pé à espera da
 * purga do armazenamento, também conta como suspenso: as linhas de negócio já
 * se foram, e o município não pode escrever em cima de nada.
 */
export async function estadoDoAcesso(banco: Banco, organizacaoId: string): Promise<EstadoDoAcesso> {
  return banco.comTenant(organizacaoId, async (c) => {
    const r = await c.query<{ suspenso: boolean }>(
      `SELECT (acesso_suspenso_em IS NOT NULL OR eliminada_em IS NOT NULL) AS suspenso
         FROM organizacoes
        WHERE id = $1`,
      [organizacaoId],
    );
    const linha = r.rows[0];
    if (!linha) return "inexistente";
    return linha.suspenso ? "suspenso" : "ativo";
  });
}

export const MENSAGEM_DE_ACESSO_SUSPENSO =
  "O acesso deste município ao sistema foi suspenso pelo fornecedor. "
  + "Procure quem administra o contrato na sua prefeitura.";

/**
 * O erro que vira a resposta `acesso_suspenso`.
 *
 * `status` é 403 por padrão e 503 para a fila do aparelho, pela razão escrita
 * no topo do arquivo. O código e a mensagem são os mesmos nos dois: quem lê o
 * corpo sabe o que houve, e quem lê só o status sabe se pode esperar.
 */
export class AcessoSuspenso extends Error {
  readonly codigo = "acesso_suspenso" as const;
  readonly status: 403 | 503;
  constructor(status: 403 | 503 = 403) {
    super(MENSAGEM_DE_ACESSO_SUSPENSO);
    // Só 403 ou 503, e não o que o tipo deixa passar por conversão (`403.5 as 403`): V2-F00-E05, correção 4.
    if (status !== 403 && status !== 503) throw new TypeError(`AcessoSuspenso com status ${String(status)}: só 403 ou 503`);
    this.name = "AcessoSuspenso";
    this.status = status;
  }
}

/** Lança `AcessoSuspenso` quando a organização não pode usar o sistema agora. */
export async function exigirAcessoAtivo(
  banco: Banco,
  organizacaoId: string,
  status: 403 | 503 = 403,
): Promise<void> {
  if ((await estadoDoAcesso(banco, organizacaoId)) !== "ativo") {
    throw new AcessoSuspenso(status);
  }
}
