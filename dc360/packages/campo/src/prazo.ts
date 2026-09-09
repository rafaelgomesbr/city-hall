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

  const restante = new Date(prazoEm).getTime() - agora;

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
