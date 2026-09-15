import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { vi } from "vitest";

/**
 * O DUBLÊ DA MIGRAÇÃO 039, e ele só existe enquanto a migração de verdade não
 * existir em `db/migrations`.
 *
 * A recuperação de senha do console foi construída em duas frentes ao mesmo
 * tempo: a migração 039 (a tabela `console_codigos_de_recuperacao` e as três
 * funções) e o console (as rotas e a tela). O contrato entre as duas está
 * fixado por nome, e é o que este arquivo declara, na letra:
 *
 *   - `console_codigos_de_recuperacao (id, operador_id, codigo_hash, criado_em,
 *     usado_em)`, com o console tendo SELECT e INSERT das PRÓPRIAS linhas e
 *     nem UPDATE nem DELETE direto;
 *   - `console_renovar_codigos(p_hashes text[]) RETURNS integer`: COM o
 *     operador no contexto; marca os não usados como usados e insere os
 *     novos; recusa menos de quatro;
 *   - `console_recuperacao_por_email(p_email text)`: SEM contexto (na
 *     recuperação não há sessão); devolve os códigos NÃO usados de um operador
 *     ativo com aquele email, e lista vazia (nunca erro) para email inexistente
 *     ou operador inativo;
 *   - `console_consumir_recuperacao(p_codigo_id uuid, p_senha_hash text,
 *     p_segundo_fator text) RETURNS void`: SEM contexto; marca o código como
 *     usado (recusa `DC365` se já estava), grava a senha e o envelope novos e
 *     zera falhas, castigo e passo do TOTP.
 *
 * O MESMO DESENHO DO DUBLÊ DA 038 NA API (`apps/api/test/duble-da-migracao-038.ts`):
 * este arquivo entra como `setupFiles` do vitest e acrescenta à lista que
 * `carregarMigracoes` devolve UMA migração a mais, SOMENTE quando nenhum
 * arquivo de `db/migrations` define `console_consumir_recuperacao`. No dia em
 * que a migração de verdade chegar, este arquivo detecta pelo texto e devolve
 * a lista original intacta, e a suíte do console passa a rodar contra a real
 * sem ninguém precisar lembrar de apagá-lo. Se a real divergir do contrato, é
 * a suíte que vai dizer onde.
 *
 * O que o dublê NÃO faz: adivinhar o que a migração de verdade acrescenta
 * além do contrato (índices, comentários, a narrativa no portão de
 * `db/test/isolamento.test.ts`). Ele entrega a forma e as recusas, nada mais.
 */

export const FUNCAO_QUE_DENUNCIA_A_039 = "console_consumir_recuperacao";

const COMPLEMENTO = `
CREATE TABLE console_codigos_de_recuperacao (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operador_id  uuid NOT NULL REFERENCES console_operadores(id) ON DELETE RESTRICT,
  codigo_hash  text NOT NULL,
  CONSTRAINT codigo_chega_derivado CHECK (
    split_part(codigo_hash, '$', 1) = 'scrypt' AND length(codigo_hash) >= 80
  ),
  criado_em    timestamptz NOT NULL DEFAULT now(),
  usado_em     timestamptz
);

CREATE INDEX console_codigos_nao_usados_idx
  ON console_codigos_de_recuperacao (operador_id) WHERE usado_em IS NULL;

ALTER TABLE console_codigos_de_recuperacao ENABLE ROW LEVEL SECURITY;
ALTER TABLE console_codigos_de_recuperacao FORCE ROW LEVEL SECURITY;

CREATE POLICY console_codigos_leitura ON console_codigos_de_recuperacao
  FOR SELECT TO dc360_console
  USING (operador_id = console_operador_atual());

CREATE POLICY console_codigos_insercao ON console_codigos_de_recuperacao
  FOR INSERT TO dc360_console
  WITH CHECK (operador_id = console_operador_atual());

CREATE FUNCTION console_renovar_codigos(p_hashes text[])
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
SET row_security = off
AS $$
DECLARE
  v_op uuid := console_operador_atual();
  v_n  integer;
BEGIN
  IF v_op IS NULL OR NOT EXISTS (SELECT 1 FROM console_operadores WHERE id = v_op AND ativo) THEN
    RAISE EXCEPTION USING
      ERRCODE = 'insufficient_privilege',
      MESSAGE = 'Renovar codigos de recuperacao exige um operador ativo no contexto.';
  END IF;
  IF p_hashes IS NULL OR cardinality(p_hashes) < 4 THEN
    RAISE EXCEPTION USING
      ERRCODE = 'DC361',
      MESSAGE = 'Codigos de recuperacao saem em lote de pelo menos quatro.';
  END IF;

  UPDATE console_codigos_de_recuperacao
     SET usado_em = now()
   WHERE operador_id = v_op AND usado_em IS NULL;

  INSERT INTO console_codigos_de_recuperacao (operador_id, codigo_hash)
  SELECT v_op, h FROM unnest(p_hashes) AS h;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN v_n;
END;
$$;

CREATE FUNCTION console_recuperacao_por_email(p_email text)
RETURNS TABLE (operador_id uuid, codigo_id uuid, codigo_hash text)
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public, pg_temp
SET row_security = off
AS $$
  SELECT c.operador_id, c.id, c.codigo_hash
    FROM console_codigos_de_recuperacao c
    JOIN console_operadores o ON o.id = c.operador_id
   WHERE lower(o.email) = lower(trim(p_email))
     AND o.ativo
     AND c.usado_em IS NULL
   ORDER BY c.criado_em, c.id;
$$;

CREATE FUNCTION console_consumir_recuperacao(p_codigo_id uuid, p_senha_hash text, p_segundo_fator text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
SET row_security = off
AS $$
DECLARE
  v_op uuid;
BEGIN
  UPDATE console_codigos_de_recuperacao
     SET usado_em = now()
   WHERE id = p_codigo_id AND usado_em IS NULL
  RETURNING operador_id INTO v_op;
  IF v_op IS NULL THEN
    RAISE EXCEPTION USING
      ERRCODE = 'DC365',
      MESSAGE = 'Este codigo de recuperacao ja foi usado, ou nao existe.';
  END IF;

  UPDATE console_operadores
     SET senha_hash        = p_senha_hash,
         segundo_fator     = p_segundo_fator,
         falhas_login      = 0,
         bloqueado_ate     = NULL,
         ultimo_passo_totp = NULL
   WHERE id = v_op AND ativo;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING
      ERRCODE = 'DC365',
      MESSAGE = 'O operador deste codigo nao esta ativo.';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION console_renovar_codigos(text[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION console_recuperacao_por_email(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION console_consumir_recuperacao(uuid, text, text) FROM PUBLIC;

GRANT SELECT, INSERT ON console_codigos_de_recuperacao TO dc360_console;
GRANT EXECUTE ON FUNCTION console_renovar_codigos(text[]) TO dc360_console;
GRANT EXECUTE ON FUNCTION console_recuperacao_por_email(text) TO dc360_console;
GRANT EXECUTE ON FUNCTION console_consumir_recuperacao(uuid, text, text) TO dc360_console;
`;

export const VERSAO_DO_DUBLE = "039z_duble_de_teste_recuperacao_de_senha_do_console.sql";

/** `true` quando alguma migração de verdade já define a função que consome o código. */
export function migracao039Existe(pasta: string): boolean {
  const forma = new RegExp(`FUNCTION\\s+${FUNCAO_QUE_DENUNCIA_A_039}\\s*\\(`, "i");
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
      if (migracao039Existe(pasta ?? original.pastaDeMigracoes())) return lista;
      return [...lista, { versao: VERSAO_DO_DUBLE, sql: COMPLEMENTO }];
    },
  };
});
