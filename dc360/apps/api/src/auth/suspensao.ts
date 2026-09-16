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
 * O token de acesso vive quinze minutos e é conferido só por assinatura; o de
 * renovação vive dias e é conferido no banco. Conferir a suspensão em toda
 * requisição custaria uma transação a mais em cada uma, inclusive nas leituras
 * de uma noite de chuva, que são a maior parte do tráfego. A decisão é esta:
 *
 *   - ENTRAR e RENOVAR conferem sempre. É ali que nasce credencial nova, e
 *     credencial nova sob contrato suspenso não pode nascer. Renovar confere
 *     mesmo que o console já tenha revogado as sessões: a API não depende de
 *     outro processo ter feito a parte dele.
 *   - ESCRITA com token vivo confere sempre (qualquer método que não seja
 *     GET ou HEAD). Escrever cria registro (protocolo, laudo, evento de
 *     trilha) sob um contrato que o fornecedor suspendeu, e o custo é uma
 *     consulta por escrita, que é a parte pequena do tráfego. Desde
 *     15/09/2026 essa MESMA consulta confere também a vigência de quem
 *     escreve (conta ativa, papel do token, sessão de pé, senha provisória
 *     no prazo): ver `auth/vigencia.ts`.
 *   - LEITURA com token vivo NÃO confere. O token expira em quinze minutos, e
 *     essa é a janela que o produto aceita, para LEITURA, quando um usuário é
 *     desativado ou expulso pelo administrador: a sessão cai, a escrita para
 *     no pedido seguinte, e o token vivo termina o prazo lendo. Suspensão
 *     contratual não é incidente de segurança, e quinze minutos de leitura
 *     não produzem registro nenhum. O que se compra é nenhuma ida ao banco a
 *     mais em nenhuma leitura.
 *   - TOKEN VENCIDO mas AUTÊNTICO confere. Este é o caso do aplicativo de
 *     campo: depois que a renovação falha, o aparelho segue apresentando o
 *     token vencido, e sem esta conferência ele receberia 401 para sempre, que
 *     a tela lê como "sua sessão terminou, entre de novo". Entrar de novo dá
 *     403 para sempre. Respondendo 403 já aqui, a tela diz a frase certa e não
 *     oferece o botão que não resolve. Custa uma consulta só quando a resposta
 *     seria 401 de qualquer forma, e a organização sai de um token que ESTE
 *     servidor assinou, nunca de um token forjado.
 *
 * ====================================================================
 * A FILA DO APARELHO RECEBE 503, E NÃO 403.
 *
 * `packages/campo/src/transporte.ts` classifica 5xx e 429 como temporário e
 * 4xx como permanente, e permanente vira item `bloqueado`, sem tela para
 * desbloquear e com "Descartar" embaixo. A coleta que está no aparelho foi
 * feita no morro, e a suspensão é reversível: ela precisa ESPERAR, e subir
 * sozinha quando o acesso voltar. A fila espera para sempre com teto de cinco
 * minutos entre tentativas, que é o custo certo. Por isso as rotas que a fila
 * chama (marcadas com `filaDoCampo` na configuração da rota) recusam com 503,
 * que é o mesmo código que o produto já usa para "existe e está indisponível
 * por decisão de quem implantou" (`recuperacao_desligada`).
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
