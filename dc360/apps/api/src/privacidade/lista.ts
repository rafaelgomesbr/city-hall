/**
 * O que a LISTAGEM de ocorrências não entrega, e só o dossiê entrega.
 *
 * `privacidade/consulta.ts` explica o critério: registra-se a leitura que
 * CONCENTRA dado de pessoa numa ocorrência identificada (o dossiê e os
 * documentos), e não a listagem. Isso só é honesto se a listagem NÃO entregar
 * o que faz o dossiê ser dossiê. Até 15/09/2026 ela entregava (`SELECT o.*`),
 * e o comentário daquele arquivo chamava isso de "resíduo": dava para ler
 * nome, contato, relato e descrição de vulnerabilidade de todo o município,
 * página a página, sem deixar uma linha em `ocorrencia_consultas`.
 *
 * As três colunas abaixo saem da lista para TODO papel. A tabela do painel não
 * as desenha (ver `apps/web/src/paginas/Ocorrencias.tsx`); quem precisa delas
 * abre a ocorrência, e aquela rota registra a consulta.
 *
 * `busca` sai junto por outra razão: é a chave normalizada do índice de
 * trigramas (migração 041), coisa interna do banco, e não tem o que fazer numa
 * resposta de API.
 *
 * O QUE CONTINUA NA LISTA, de propósito: `solicitante_nome`. A lista precisa
 * dizer de quem é o chamado para a coordenação reconhecer a família que ligou
 * de novo, e o nome sozinho, sem contato nem relato, é o mesmo que já sai na
 * busca por protocolo. `vulnerabilidade_presente` (o booleano) também fica: é
 * o que ordena a prioridade, e não descreve condição de saúde de ninguém.
 *
 * A projeção é feita AQUI, em código, e não numa lista de colunas no SQL, por
 * uma razão prática: a tabela ganha coluna com frequência (várias frentes ao
 * mesmo tempo), e uma lista explícita no `SELECT` faria a coluna nova sumir
 * da tela em silêncio. Retirar as três nomeadas deixa o resto passar.
 */
export const COLUNAS_SO_DO_DOSSIE = [
  "solicitante_contato",
  "descricao",
  "vulnerabilidade_descricao",
  "busca",
] as const;

export function semOQueSoODossieEntrega<T extends Record<string, unknown>>(
  linha: T,
): Omit<T, (typeof COLUNAS_SO_DO_DOSSIE)[number]> {
  const copia: Record<string, unknown> = { ...linha };
  for (const coluna of COLUNAS_SO_DO_DOSSIE) delete copia[coluna];
  return copia as Omit<T, (typeof COLUNAS_SO_DO_DOSSIE)[number]>;
}
