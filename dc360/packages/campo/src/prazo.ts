/**
 * Quanto falta para o prazo, em linguagem de quem está no barranco.
 *
 * Saiu da tela de tarefas e veio para cá por dois motivos. O primeiro é que a
 * mesma frase precisa aparecer também DENTRO da vistoria: uma vez que o agente
 * entra no formulário, ele perde de vista o prazo, e é justamente ali que ele
 * decide se para para fotografar mais uma parede. O segundo é que a regra
 * ganha teste sem precisar do Expo.
 */

export type Prazo = { texto: string; atrasado: boolean; vencido: boolean };

const HORA = 3_600_000;
const MINUTO = 60_000;

/**
 * Arredonda SEMPRE para baixo, e essa é a correção.
 *
 * Antes usava `Math.round`, e isso fazia 22 horas e 31 minutos aparecerem como
 * "Vence em 23h": o aplicativo dava ao agente meia hora que ele não tinha.
 * Contagem regressiva arredonda para baixo, senão ela mente a favor de quem
 * está atrasado.
 *
 * Abaixo de quatro horas passa a mostrar minutos. É a faixa em que a decisão
 * do agente muda de verdade, e "Vence em 3h" não separa 3h00 de 3h59.
 */
export function quantoFalta(prazoEm: string | null, agora: number): Prazo {
  if (!prazoEm) return { texto: "Sem prazo definido", atrasado: false, vencido: false };

  const limite = new Date(prazoEm).getTime();
  /*
    Prazo que ninguém consegue ler é o mesmo que prazo que ninguém informou.

    Sem isto o texto saía "Vence em NaNh", que é pior do que não saber, porque
    parece um prazo. `dataDoPrazo`, logo abaixo, já tratava o mesmo caso, e a
    contagem ficou de fora: a linha do cartão dizia NaN enquanto a data ao lado
    dela dizia nada.
  */
  if (!Number.isFinite(limite)) {
    return { texto: "Sem prazo definido", atrasado: false, vencido: false };
  }

  const restante = limite - agora;

  if (restante < 0) {
    const atraso = -restante;
    const horas = Math.floor(atraso / HORA);
    if (horas < 1) {
      const minutos = Math.max(1, Math.floor(atraso / MINUTO));
      return { texto: `Vencido há ${minutos}min`, atrasado: true, vencido: true };
    }
    return { texto: `Vencido há ${horas}h`, atrasado: true, vencido: true };
  }

  const horas = Math.floor(restante / HORA);
  if (horas < 4) {
    const minutos = Math.floor((restante % HORA) / MINUTO);
    const texto = horas === 0 ? `Vence em ${minutos}min` : `Vence em ${horas}h${String(minutos).padStart(2, "0")}`;
    return { texto, atrasado: true, vencido: false };
  }
  return { texto: `Vence em ${horas}h`, atrasado: false, vencido: false };
}

/**
 * A DATA do prazo, ao lado de quanto falta.
 *
 * O relativo sozinho não basta, e a razão é operacional: "Vence em 9h" não diz
 * ao agente se o prazo cai dentro do turno dele ou já na madrugada, e é essa
 * distinção que decide se ele sobe hoje ou passa a tarefa. O painel ganhou as
 * duas colunas no mesmo turno em que este item entrou; o aplicativo mostrava só
 * o relativo, e o agente é justamente quem está longe de um calendário.
 *
 * Formato curto de propósito: dia, mês e hora, sem ano e sem segundos. Cabe na
 * linha de uma tarefa num aparelho segurado com uma mão, e o ano de um prazo de
 * Defesa Civil nunca é a informação em disputa.
 *
 * Devolve string vazia sem prazo, e não "sem data": quem chama já mostra
 * "Sem prazo definido" pelo `quantoFalta`, e repetir a mesma ausência duas
 * vezes na mesma linha é ruído.
 */
export function dataDoPrazo(prazoEm: string | null): string {
  if (!prazoEm) return "";
  const quando = new Date(prazoEm);
  if (Number.isNaN(quando.getTime())) return "";
  return quando.toLocaleString("pt-BR", {
    day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit",
  });
}
