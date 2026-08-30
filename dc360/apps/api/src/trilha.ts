import type { Consulta } from "./banco/tipos.js";
import type { Identidade } from "./servidor.js";
import type { Origem } from "@dc360/shared";

/**
 * Registra um evento na trilha auditável.
 *
 * Autor, papel e origem vêm da identidade do token, nunca do corpo da
 * requisição: se o cliente pudesse dizer quem assinou, a trilha não provaria
 * nada. Roda na mesma transação da mudança que descreve, então ou os dois
 * acontecem ou nenhum acontece: não existe estado alterado sem rastro.
 *
 * Mora aqui, e não dentro de uma rota, porque quem escreve na trilha não é só
 * o fluxo da ocorrência. A emissão de documento oficial também escreve, e
 * enquanto esta função era privada de `rotas/ocorrencias.ts` o termo de
 * interdição saía sem deixar rastro nenhum de quem o emitiu.
 */
export async function registrarEvento(
  c: Consulta,
  quem: Identidade,
  ocorrenciaId: string,
  tipo: string,
  detalhe: unknown,
  origem: Origem = "escritorio",
): Promise<void> {
  await c.query(
    `INSERT INTO trilha_eventos
       (organizacao_id, ocorrencia_id, tipo, autor_id, autor_nome, autor_papel, origem, ocorrido_em, detalhe)
     VALUES ($1,$2,$3,$4,$5,$6,$7, now(), $8)`,
    [
      quem.organizacaoId, ocorrenciaId, tipo, quem.usuarioId,
      quem.nome, quem.papel, origem, JSON.stringify(detalhe),
    ],
  );
}

/**
 * O mesmo, para a emissão de documento oficial, que é o único evento da trilha
 * que se repete sem que nada tenha mudado.
 *
 * Um laudo pode ser aberto dez vezes no mesmo dia: por quem despachou, por
 * quem vai assinar, pela recepção que imprime. Gravar dez linhas transformaria
 * a trilha num registro de cliques, e a trilha não tem policy de DELETE: o que
 * entra ali fica. O índice único parcial da migração 009 deixa passar a
 * primeira emissão de cada par (documento, vistoria) e recusa as repetições em
 * silêncio, com `ON CONFLICT DO NOTHING`.
 *
 * O efeito colateral é a propriedade que interessa para medir o piloto: uma
 * segunda linha só aparece quando existe vistoria nova, que é exatamente a
 * definição de retrabalho documental.
 */
export async function registrarEmissao(
  c: Consulta,
  quem: Identidade,
  ocorrenciaId: string,
  documento: "laudo" | "termo_de_interdicao" | "termo_de_desinterdicao",
  vistoriaId: string,
  formato: "html" | "pdf",
): Promise<void> {
  await c.query(
    `INSERT INTO trilha_eventos
       (organizacao_id, ocorrencia_id, tipo, autor_id, autor_nome, autor_papel, origem, ocorrido_em, detalhe)
     VALUES ($1,$2,'documento_emitido',$3,$4,$5,'escritorio', now(), $6)
     ON CONFLICT DO NOTHING`,
    [
      quem.organizacaoId, ocorrenciaId, quem.usuarioId, quem.nome, quem.papel,
      JSON.stringify({ documento, vistoriaId, formato }),
    ],
  );
}

/**
 * Marca o imóvel como interditado, no ato em que o termo é emitido.
 *
 * Não existe rota para "interditar" separada da emissão do termo, e a ausência
 * é a decisão: interdição sem documento é interdição que ninguém consegue
 * provar, e um botão que interdita sem gerar papel seria o caminho mais curto
 * para exatamente isso.
 *
 * O WHERE cobre TRÊS estados, e a distinção entre eles é a correção de um
 * defeito que a auditoria achou: depois de um levantamento, o imóvel nunca
 * mais podia ser interditado, e o termo novo saía sem efeito.
 *
 *   1. Nunca interditada (`interditada_em IS NULL`): interdita.
 *   2. Interditada e AINDA não levantada: NÃO toca. Reimprimir o termo é
 *      rotina (o papel molhou, o processo pede segunda via) e a segunda
 *      impressão não pode reescrever a data: a interdição aconteceu quando
 *      aconteceu.
 *   3. Interditada e JÁ levantada (`desinterditada_em IS NOT NULL`, o risco
 *      voltou e há vistoria nova): reinterdita, com data nova, e limpa o
 *      levantamento anterior do ESTADO.
 *
 * Limpar o levantamento não apaga história: cada emissão e cada desinterdição
 * são eventos na trilha, que é append-only. O estado guarda o agora; a trilha
 * guarda o que aconteceu, inclusive a data do levantamento que saiu daqui. Sem
 * isto, o CHECK `desinterdicao_nao_antecede_interdicao` da migração 014
 * travaria a reinterdição para sempre, e a própria mensagem de erro da rota
 * ("registre uma vistoria nova e emita novo termo") apontava para um caminho
 * que não funcionava.
 */
export async function marcarInterditada(
  c: Consulta, quem: Identidade, ocorrenciaId: string,
): Promise<void> {
  await c.query(
    `UPDATE ocorrencias
        SET interditada_em = now(), interditada_por = $1,
            desinterditada_em = NULL, desinterditada_por = NULL,
            desinterdicao_motivo = NULL
      WHERE id = $2
        AND (interditada_em IS NULL OR desinterditada_em IS NOT NULL)`,
    [quem.usuarioId, ocorrenciaId],
  );
}

/** O que um ato administrativo alcança. */
export type AlvoAdministrativo = "usuario" | "equipe" | "organizacao";

/**
 * Registra um ato administrativo: quem mexeu em conta, equipe ou município.
 *
 * Existe porque `rotas/administracao.ts` tinha cinco caminhos de escrita e
 * ZERO registro. Promover uma conta, usar, rebaixar e desativar não deixava
 * rastro nenhum, e o sistema não conseguia responder "quem deu esse acesso".
 *
 * Escreve em `trilha_administrativa`, e não em `trilha_eventos`, porque
 * aquela exige `ocorrencia_id NOT NULL` e um ato administrativo não tem
 * ocorrência. Ver a migração 010.
 *
 * Roda na MESMA transação do efeito. Ou os dois acontecem, ou nenhum: não
 * existe conta promovida sem registro, nem registro de promoção que não
 * aconteceu.
 *
 * `antes` e `depois` NUNCA levam senha, hash nem token. Papel, equipe,
 * situação e nome, e nada além disso.
 */
export async function registrarAtoAdministrativo(
  c: Consulta,
  quem: Identidade,
  ato: {
    acao: string;
    alvoTipo: AlvoAdministrativo;
    alvoId: string | null;
    alvoNome: string;
    antes?: unknown;
    depois?: unknown;
  },
): Promise<void> {
  await c.query(
    `INSERT INTO trilha_administrativa
       (organizacao_id, autor_id, autor_nome, autor_papel,
        acao, alvo_tipo, alvo_id, alvo_nome, antes, depois)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
    [
      quem.organizacaoId, quem.usuarioId, quem.nome, quem.papel,
      ato.acao, ato.alvoTipo, ato.alvoId, ato.alvoNome,
      ato.antes === undefined ? null : JSON.stringify(ato.antes),
      ato.depois === undefined ? null : JSON.stringify(ato.depois),
    ],
  );
}
