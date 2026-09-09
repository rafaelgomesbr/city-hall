/**
 * Máscara e leitura de telefone brasileiro.
 *
 * Existe porque o campo de contato do formulário de abertura era um input de
 * texto cru, com um placeholder como única ajuda, e o esquema aceitava
 * qualquer string de até 120 caracteres. Quem atende o telefone digita do
 * jeito que a pessoa fala, e o que fica gravado varia de "48996124477" a
 * "(48) 9 9612 4477" na mesma prefeitura.
 *
 * A regra mora aqui, e não no formulário, porque o mesmo telefone entra por
 * duas portas: a abertura de ocorrência e o formulário público de interesse.
 *
 * O que NÃO fazemos de propósito: recusar número que não bate com o padrão.
 * Quem liga pedindo socorro pode ditar um ramal, um número de fora do estado
 * ou um telefone de vizinho, e uma validação rígida transformaria o campo de
 * contato numa barreira no pior momento possível. A máscara ajuda quem digita
 * o caso comum e sai da frente no caso incomum.
 */

/** Só os dígitos, que é o que vale a pena guardar e comparar. */
export function digitosDoTelefone(bruto: string): string {
  return bruto.replace(/\D/g, "");
}

/**
 * Formata enquanto a pessoa digita.
 *
 * Dez dígitos viram (NN) NNNN-NNNN, que é fixo. Onze viram (NN) N NNNN-NNNN,
 * que é celular com o nono dígito. Acima de onze, para de formatar e devolve o
 * que foi digitado: número internacional e ramal existem, e comer dígito de
 * quem está pedindo socorro é pior que uma máscara imperfeita.
 */
export function mascararTelefone(bruto: string): string {
  const d = digitosDoTelefone(bruto).slice(0, 11);
  if (d.length === 0) return "";
  if (d.length <= 2) return `(${d}`;
  const ddd = d.slice(0, 2);
  const resto = d.slice(2);
  if (resto.length <= 4) return `(${ddd}) ${resto}`;
  if (resto.length <= 8) return `(${ddd}) ${resto.slice(0, 4)}-${resto.slice(4)}`;
  return `(${ddd}) ${resto.slice(0, 1)} ${resto.slice(1, 5)}-${resto.slice(5)}`;
}

/**
 * Diz se o número parece um telefone brasileiro completo.
 *
 * Usado só para AVISAR, nunca para bloquear o envio. Dez ou onze dígitos, com
 * DDD entre 11 e 99, e celular começando por 9 quando tem onze.
 */
export function telefoneParecePlausivel(bruto: string): boolean {
  const d = digitosDoTelefone(bruto);
  if (d.length !== 10 && d.length !== 11) return false;
  const ddd = Number(d.slice(0, 2));
  if (ddd < 11 || ddd > 99) return false;
  if (d.length === 11 && d[2] !== "9") return false;
  return true;
}
