import type { LeituraDoConsole } from "./banco.js";

/**
 * O que o console exige do banco para poder subir, e por que a conferência não
 * é a mesma da API.
 *
 * A API confere a VERSÃO: ela lê `schema_migracoes`, compara com a pasta de
 * migrações e recusa subir se faltar alguma. O console não pode fazer isso, e a
 * razão é a decisão 3 da ADR 0008 funcionando: `GRANT SELECT ON
 * schema_migracoes` existe só para `dc360_app`, e dar o mesmo ao console
 * REPROVA `db/test/isolamento.test.ts`. A varredura de lá pergunta ao catálogo
 * quais relações o console enxerga e cobra de cada coluna delas um tipo que não
 * identifica pessoa nem imóvel; `schema_migracoes` tem `versao` e `impressao`
 * em `text`, então ela entraria na varredura e o portão CA-06 fecharia. Ou
 * seja: para o console ler a régua da API, alguém teria que afrouxar a regra
 * que o console existe para respeitar.
 *
 * Então a pergunta muda de "qual é a versão" para "o que eu uso está aqui", e a
 * resposta vem do `pg_catalog`, que não exige concessão nenhuma.
 *
 * A LISTA ABAIXO É O CONTRATO INTEIRO do console com o banco: as duas consultas
 * de `consultas.ts` e a única escrita de `cadastro.ts`, nada mais. Ela é curta
 * porque a superfície é curta, e mantê-la colada ao que o código realmente lê é
 * o que faz este portão valer alguma coisa: uma consulta nova sem a linha
 * correspondente aqui passa a subir sem conferência, e isso aparece na revisão.
 *
 * O QUE ISTO PEGA que a conferência de versão não pegaria: um banco cujo
 * `schema_migracoes` diz 037 e onde alguém derrubou a função à mão, e um banco
 * onde as migrações rodaram mas o `GRANT` ao console não. Os dois já
 * aconteceram em produtos assim, e os dois dão o mesmo sintoma que a ADR 0008
 * descreve: tela impecável, e 500 genérico quando alguém aperta "Cadastrar".
 *
 * O QUE ISTO NÃO PEGA, dito em voz alta: mudança de TIPO de coluna, mudança de
 * corpo de função, e migração posterior que não toque em nada desta lista. O
 * console não é o portão do esquema do produto, e não deve ser: quem confere o
 * esquema inteiro é a partida da API, que tem privilégio para isso.
 */

/** Relação que o console lê, com as colunas que ele nomeia nas consultas. */
const RELACOES: ReadonlyMap<string, readonly string[]> = new Map([
  /*
    Só as quatro colunas que `situacaoDosMunicipios` junta. O cadastro de
    organizações tem muito mais, e cobrá-las aqui faria este portão reprovar
    por causa de uma migração que o console nem sente.
  */
  ["organizacoes", ["id", "nome", "municipio", "uf"]],

  ["metricas_municipio", [
    "organizacao_id", "dia",
    "ocorrencias_registradas", "ocorrencias_encerradas",
    "vistorias_recebidas", "oficios_emitidos",
    "ocorrencias_abertas", "ocorrencias_atrasadas",
    "minutos_ate_vistoria_mediana",
  ]],

  /*
    A visão é a peça que faz o município calado aparecer como linha em vez de
    sumir (ver o comentário em `consultas.ts`), então `sem_escrita_recente` e
    `horas_desde_a_escrita` entram na lista: sem elas o console voltaria a não
    distinguir "ninguém usou" de "a métrica parou de ser escrita", que é a
    consequência ruim que a ADR 0008 assume por escrito e resolve aqui.
  */
  ["console_situacao_dos_municipios", [
    "organizacao_id", "dia",
    "ocorrencias_registradas", "ocorrencias_encerradas",
    "vistorias_recebidas", "oficios_emitidos",
    "ocorrencias_abertas", "ocorrencias_atrasadas",
    "usuarios_ativos", "aparelhos_ativos", "aparelhos_sem_aparecer",
    "minutos_ate_vistoria_mediana",
    "atualizado_em", "sem_escrita_recente", "horas_desde_a_escrita",
  ]],
]);

/**
 * A única função que o console executa, com a assinatura por extenso.
 *
 * COM OS TIPOS, e não só o nome: `to_regprocedure` resolve a sobrecarga, então
 * uma segunda `provisionar_municipio` com outra lista de parâmetros não
 * satisfaz esta linha. É a mesma exigência que a migração 036 escreve no
 * `GRANT`, e é o que a emenda de 14/09/2026 da ADR 0008 chama de exceção
 * NOMEADA: a porta de escrita do console é uma, e ela tem nome e forma.
 */
const FUNCOES: readonly string[] = [
  "provisionar_municipio(text,text,text,text,text,text,text,text)",
];

type LinhaDeObjeto = {
  nome: string;
  especie: string;
  existe: boolean;
  pode: boolean;
};

/**
 * Pergunta ao catálogo, com o papel do console já assumido.
 *
 * `has_table_privilege` e `has_function_privilege` na forma de dois argumentos
 * respondem sobre `current_user`, e `current_user` aqui é `dc360_console`,
 * porque `ler` abre toda transação com `SET LOCAL ROLE` (ver `banco.ts`). Então
 * o que este SQL devolve não é "o objeto existe no banco", é "o objeto existe E
 * este processo alcança", que são perguntas diferentes e a segunda é a que
 * importa.
 *
 * `coalesce(..., false)` porque as duas funções são estritas: com o objeto
 * ausente, `to_regclass` devolve nulo, elas devolvem nulo, e nulo lido como
 * "pode" seria o portão aprovando o que ele existe para reprovar.
 */
const SQL_DOS_OBJETOS = `
  SELECT nome,
         'relação' AS especie,
         to_regclass(nome) IS NOT NULL AS existe,
         coalesce(has_table_privilege(to_regclass(nome), 'SELECT'), false) AS pode
    FROM unnest($1::text[]) AS nome
  UNION ALL
  SELECT nome,
         'função' AS especie,
         to_regprocedure(nome) IS NOT NULL AS existe,
         coalesce(has_function_privilege(to_regprocedure(nome), 'EXECUTE'), false) AS pode
    FROM unnest($2::text[]) AS nome
`;

/**
 * As colunas que existem, entre as relações do contrato.
 *
 * Sai de `pg_attribute` e não de `information_schema.columns` por uma diferença
 * que importa: a visão do `information_schema` já é filtrada por privilégio,
 * então uma coluna que o console não alcança apareceria como coluna INEXISTENTE,
 * e a mensagem mandaria migrar um banco que está migrado. Aqui a ausência de
 * privilégio é reprovada pela consulta de cima, com a mensagem certa, e esta
 * responde só sobre forma.
 */
const SQL_DAS_COLUNAS = `
  SELECT c.relname AS relacao, a.attname AS coluna
    FROM pg_attribute a
    JOIN pg_class c ON c.oid = a.attrelid
   WHERE c.relnamespace = 'public'::regnamespace
     AND a.attnum > 0
     AND NOT a.attisdropped
     AND c.relname = ANY($1::text[])
`;

/**
 * O que falta para este console poder subir. Lista vazia significa pronto.
 *
 * Devolve LISTA e não lança, para a partida poder relatar tudo de uma vez. Um
 * portão que morre no primeiro problema faz quem implanta descobrir os defeitos
 * um por deploy, e cada deploy custa alguns minutos numa noite em que alguém
 * está esperando a tela subir.
 */
export async function faltaNoEsquema(leitura: LeituraDoConsole): Promise<string[]> {
  const faltas: string[] = [];

  const objetos = await leitura.ler<LinhaDeObjeto>(SQL_DOS_OBJETOS, [
    [...RELACOES.keys()],
    [...FUNCOES],
  ]);

  const presentes = new Set<string>();
  for (const objeto of objetos) {
    if (!objeto.existe) {
      faltas.push(`a ${objeto.especie} \`${objeto.nome}\` não existe neste banco`);
      continue;
    }
    if (!objeto.pode) {
      /*
        Existe e não alcança: é `GRANT` faltando, não migração faltando. A
        distinção está na mensagem porque as correções são opostas, e rodar a
        errada em produção custa a janela inteira.
      */
      faltas.push(
        `a ${objeto.especie} \`${objeto.nome}\` existe, mas o papel do console não tem `
        + `${objeto.especie === "função" ? "EXECUTE" : "SELECT"} nela`,
      );
      continue;
    }
    presentes.add(objeto.nome);
  }

  const comColunasAConferir = [...RELACOES.keys()].filter((r) => presentes.has(r));
  if (comColunasAConferir.length > 0) {
    const colunas = await leitura.ler<{ relacao: string; coluna: string }>(
      SQL_DAS_COLUNAS,
      [comColunasAConferir],
    );

    const porRelacao = new Map<string, Set<string>>();
    for (const linha of colunas) {
      const conjunto = porRelacao.get(linha.relacao) ?? new Set<string>();
      conjunto.add(linha.coluna);
      porRelacao.set(linha.relacao, conjunto);
    }

    for (const relacao of comColunasAConferir) {
      const tem = porRelacao.get(relacao) ?? new Set<string>();
      const ausentes = (RELACOES.get(relacao) ?? []).filter((c) => !tem.has(c));
      if (ausentes.length > 0) {
        faltas.push(
          `a relação \`${relacao}\` existe, mas sem as colunas ${ausentes.join(", ")}`,
        );
      }
    }
  }

  return faltas;
}

/**
 * A mensagem que quem implanta lê quando o portão fecha.
 *
 * Fica separada da conferência para poder ser cobrada em teste sem banco
 * nenhum, e porque ela é metade do valor deste portão: um processo que morre
 * dizendo "erro ao consultar o banco" empurra o diagnóstico para a rede e para
 * o certificado, que é onde o defeito não está.
 */
export function mensagemDeEsquemaAtrasado(faltas: readonly string[]): string {
  return (
    "O console não sobe porque o banco não tem o que ele usa:\n"
    + faltas.map((f) => `  - ${f}`).join("\n")
    + "\n\nAplique as migrações com `npm run migrar --workspace @dc360/db`, usando o "
    + "papel DONO das tabelas, e só então implante o console. Migrar é passo "
    + "separado do deploy de propósito: duas máquinas subindo juntas migrariam em "
    + "paralelo, e a segunda falharia no meio.\n"
    + "Se as migrações já estiverem aplicadas e a falta acima falar de SELECT ou de "
    + "EXECUTE, o que falta não é migração: é o papel de login da "
    + "CONSOLE_DATABASE_URL não ser membro de `dc360_console`. Ver docs/IMPLANTACAO.md."
  );
}
