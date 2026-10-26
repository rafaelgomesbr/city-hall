import { expect, vi } from "vitest";

/**
 * Espera o relógio andar, por CONDIÇÃO e com LIMITE, e não por tempo fixo.
 *
 * Vários testes precisam que o segundo ato (uma re-vistoria, uma segunda via,
 * um levantamento) tenha carimbo ESTRITAMENTE maior que o do primeiro, porque
 * é isso que a regra de negócio compara (`reinterditar exige vistoria posterior
 * ao levantamento`, `a segunda via não reescreve a data`). Antes, o teste
 * dormia 20 ms e torcia: suficiente com a máquina livre, e um chute com o relógio
 * do runner ou o laço de eventos atrasado (V-INS-02 do registro da E03).
 *
 * O que o teste realmente precisa é: "o instante de agora já é depois do
 * instante em que o ato anterior terminou". Esta função captura o agora e só
 * volta quando `Date.now()` passou dele. Todo ato que já terminou tem carimbo
 * menor ou igual a esse agora (o carimbo vem do mesmo processo), então o
 * próximo ato nasce estritamente depois. Passa em 1 ms com a máquina livre e
 * só reprova se o relógio NÃO andar em 2 s, que é defeito do ambiente e não
 * do produto.
 *
 * Se for dado `desde` (o carimbo ISO de um ato, lido da API), espera passar
 * dele, que é a condição exata da regra e vale mesmo se o carimbo tiver sido
 * escrito um pouco no futuro.
 */
export async function esperarORelogioAndar(desde?: string | null): Promise<void> {
  const referencia = Math.max(
    Date.now(),
    desde ? new Date(desde).getTime() : Number.NEGATIVE_INFINITY,
  );
  await vi.waitFor(
    () => expect(Date.now(), "o relógio não andou").toBeGreaterThan(referencia),
    { timeout: 2000, interval: 1 },
  );
}
