import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { vi } from "vitest";

/**
 * O COMPLEMENTO DE TESTE DA MIGRAÇÃO 038, e ele só existe enquanto a função
 * que ele declara não existir em migração nenhuma.
 *
 * A suspensão de acesso e a eliminação de município foram construídas em duas
 * frentes ao mesmo tempo: a migração (`db/migrations/038_*.sql`) e a API. O
 * contrato combinado entre as duas tem cinco colunas em `organizacoes` e duas
 * funções (`executar_eliminacoes_vencidas`, `concluir_eliminacao`), e a
 * migração de verdade entrega tudo isso: a suíte da API roda contra ela.
 *
 * O que o contrato combinado NÃO tem, e a API precisa, é UMA função de
 * leitura: `/saude` diz se há eliminação agendada e quantas, e o papel de
 * aplicação não enxerga `organizacoes` sem contexto de município. Contar exige
 * uma função privilegiada que devolva SÓ números, e ela está declarada abaixo
 * com a assinatura que `servidor.ts` espera. O relatório da frente pede à
 * migração que a forneça (com a narrativa no portão de `isolamento.test.ts`,
 * que reprova função SECURITY DEFINER nova sem caso-irmão).
 *
 * Este arquivo entra como `setupFiles` do vitest e acrescenta à lista que
 * `carregarMigracoes` devolve uma migração a mais, com a função, SOMENTE
 * quando nenhum arquivo de `db/migrations` a define. No dia em que a migração
 * de verdade a trouxer, este arquivo detecta pelo texto e devolve a lista
 * original intacta, sem que alguém precise lembrar de apagá-lo.
 *
 * ATÉ LÁ, EM PRODUÇÃO, `/saude` responde `eliminacoes: null` e avisa no log a
 * cada sonda. Isto está dito no relatório e no comentário da rota. O que este
 * arquivo NÃO faz é dublar nada que a migração de verdade já entrega: a forma,
 * a ordem de apagamento e as travas de estado são as dela.
 */

export const NOME_DA_FUNCAO_DE_CONTAGEM = "eliminacoes_pendentes";

const COMPLEMENTO = `
CREATE OR REPLACE FUNCTION ${NOME_DA_FUNCAO_DE_CONTAGEM}()
RETURNS TABLE (agendadas bigint, vencidas bigint)
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public, pg_temp
SET row_security = off
AS $$
  SELECT count(*) FILTER (WHERE eliminacao_agendada_para IS NOT NULL),
         count(*) FILTER (WHERE eliminacao_agendada_para IS NOT NULL
                            AND eliminacao_agendada_para <= now())
    FROM organizacoes;
$$;

REVOKE ALL ON FUNCTION ${NOME_DA_FUNCAO_DE_CONTAGEM}() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION ${NOME_DA_FUNCAO_DE_CONTAGEM}() TO dc360_app;
`;

export const VERSAO_DO_COMPLEMENTO = "038z_complemento_de_teste_contagem_de_eliminacoes.sql";

/** `true` quando alguma migração de verdade já define a função de contagem. */
export function funcaoDeContagemExiste(pasta: string): boolean {
  const forma = new RegExp(`FUNCTION\\s+${NOME_DA_FUNCAO_DE_CONTAGEM}\\s*\\(`, "i");
  return readdirSync(pasta)
    .filter((arquivo) => arquivo.endsWith(".sql"))
    .some((arquivo) => forma.test(readFileSync(join(pasta, arquivo), "utf8")));
}

vi.mock("@dc360/db", async (importarOriginal) => {
  const original = await importarOriginal<typeof import("@dc360/db")>();
  return {
    ...original,
    carregarMigracoes(pasta?: string) {
      const lista = original.carregarMigracoes(pasta);
      if (funcaoDeContagemExiste(pasta ?? original.pastaDeMigracoes())) return lista;
      return [...lista, { versao: VERSAO_DO_COMPLEMENTO, sql: COMPLEMENTO }];
    },
  };
});
