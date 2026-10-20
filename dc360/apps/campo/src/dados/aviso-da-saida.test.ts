/**
 * O texto de "Sair da conta?", conferido por inteiro (V2-F00-E15, CMP-52).
 *
 * A tela que desenha isto está provada em
 * `ui/dialogo-na-conta-com-vistoria-comecada.test.tsx`. Aqui ficam as
 * combinações que a tela não precisa desenhar uma a uma: singular e plural,
 * foto e assinatura, rascunho e fila juntos, e o disco que não respondeu.
 */

import { avisoDaSaida, contarRascunhos, SAIDA_SEM_NADA_A_PERDER } from "./aviso-da-saida";
import { frasesDaPausa } from "./pausa-da-fila";

const SEM_ANEXO = { fotos: [], assinaturaUri: null };
const COM_FOTO = { fotos: [{}], assinaturaUri: null } as never;
const COM_ASSINATURA = { fotos: [], assinaturaUri: "file:///documentos/assinatura-1.png" };

describe("o que a saída apaga, contado dos rascunhos", () => {
  it("conta as vistorias e se há foto ou assinatura em alguma delas", () => {
    expect(contarRascunhos([])).toEqual({ vistorias: 0, comFotos: false, comAssinatura: false });
    expect(contarRascunhos([SEM_ANEXO, COM_FOTO, COM_ASSINATURA]))
      .toEqual({ vistorias: 3, comFotos: true, comAssinatura: true });
  });

  it("uma vistoria sem anexo: singular, e sem prometer foto nem assinatura", () => {
    const texto = avisoDaSaida(0, contarRascunhos([SEM_ANEXO]));
    expect(texto).toMatch(/^Você tem 1 vistoria começada neste aparelho, que ainda não foi concluída\./);
    expect(texto).toMatch(/Sair apaga essa vistoria/);
    expect(texto).not.toMatch(/foto|assinatura/);
  });

  it("duas vistorias com foto e assinatura: plural, e diz que as duas coisas vão junto", () => {
    const texto = avisoDaSaida(0, contarRascunhos([COM_FOTO, COM_ASSINATURA]));
    expect(texto).toMatch(/^Você tem 2 vistorias começadas neste aparelho, com fotos e assinatura, que ainda não foram concluídas\./);
    expect(texto).toMatch(/Sair apaga essas vistorias e tudo o que já foi preenchido nelas, inclusive as fotos e a assinatura, sem volta\./);
    expect(texto).toMatch(/conclua antes de sair/);
  });

  it("só com assinatura, a frase não fala em foto", () => {
    const texto = avisoDaSaida(0, contarRascunhos([COM_ASSINATURA]));
    expect(texto).toMatch(/com assinatura/);
    expect(texto).toMatch(/inclusive a assinatura/);
    expect(texto).not.toMatch(/foto/);
  });

  it("disco que não respondeu: avisa do mesmo jeito, e não promete que não há nada", () => {
    const texto = avisoDaSaida(0, null);
    expect(texto).toMatch(/Não deu para conferir se há vistoria começada/);
    expect(texto).toMatch(/Sair apaga toda vistoria que ainda não foi concluída/);
    expect(texto).not.toBe(SAIDA_SEM_NADA_A_PERDER);
  });
});

describe("o que a saída guarda: a fila", () => {
  it("uma coleta: singular, concordando em tudo", () => {
    const texto = avisoDaSaida(1, contarRascunhos([]));
    expect(texto).toMatch(/^Você tem 1 coleta ainda não enviada\. Ao sair, ela continua guardada/);
    expect(texto).toMatch(/Ela volta a subir/);
    expect(texto).not.toMatch(/apaga/);
  });

  it("três coletas: plural, e a promessa de que ficam no aparelho", () => {
    const texto = avisoDaSaida(3, contarRascunhos([]));
    expect(texto).toMatch(/^Você tem 3 coletas ainda não enviadas\. Ao sair, elas continuam guardadas no aparelho/);
    expect(texto).not.toMatch(/apaga/);
  });

  it("rascunho e fila juntos: o que se apaga vem primeiro, o que fica vem depois", () => {
    const texto = avisoDaSaida(2, contarRascunhos([COM_FOTO]));
    const apaga = texto.indexOf("Sair apaga");
    const guarda = texto.indexOf("continuam guardadas");
    expect(apaga).toBeGreaterThanOrEqual(0);
    expect(guarda).toBeGreaterThan(apaga);
  });
});

describe("sem nada a perder", () => {
  it("sem rascunho e sem fila, volta à frase curta, que não fala em apagar", () => {
    expect(avisoDaSaida(0, contarRascunhos([]))).toBe(SAIDA_SEM_NADA_A_PERDER);
    expect(SAIDA_SEM_NADA_A_PERDER).not.toMatch(/apaga|começada/);
  });

  it("fila ainda não lida conta como zero, mas nunca esconde rascunho", () => {
    expect(avisoDaSaida(null, contarRascunhos([]))).toBe(SAIDA_SEM_NADA_A_PERDER);
    expect(avisoDaSaida(null, contarRascunhos([SEM_ANEXO]))).toMatch(/1 vistoria começada/);
  });
});

/*
  Com a fila pausada pela sessão a pergunta não promete "entrar de novo, com
  sinal" (V2-F00-E06, correção 3): sinal não destrava nenhum dos três casos. A
  parte do laudo continua (ninguém mais envia por este aparelho), e o resto é a
  frase da pausa, a mesma da faixa do topo.
*/
describe("com a fila pausada pela sessão", () => {
  const MOTIVOS = ["sessao_encerrada", "conta_desativada", "troca_de_senha_obrigatoria"] as const;

  it.each(MOTIVOS)("%s: uma coleta, a frase da pausa no lugar da promessa de sinal", (motivo) => {
    const texto = avisoDaSaida(1, contarRascunhos([]), motivo);
    expect(texto).toContain(frasesDaPausa(motivo).detalhe);
    expect(texto).toMatch(/^Você tem 1 coleta ainda não enviada, e ninguém mais consegue enviá-la/);
    expect(texto).toMatch(/o laudo sai com o nome de quem fez a vistoria, que é você/);
    expect(texto).not.toMatch(/com sinal|Ela volta a subir/);
  });

  it.each(MOTIVOS)("%s: três coletas, no plural", (motivo) => {
    const texto = avisoDaSaida(3, contarRascunhos([]), motivo);
    expect(texto).toContain(frasesDaPausa(motivo).detalhe);
    expect(texto).toMatch(/^Você tem 3 coletas ainda não enviadas, e ninguém mais consegue enviá-las/);
    expect(texto).not.toMatch(/com sinal|Elas voltam a subir/);
  });

  it("o que se apaga continua vindo primeiro, antes da frase da pausa", () => {
    const texto = avisoDaSaida(2, contarRascunhos([COM_FOTO]), "sessao_encerrada");
    expect(texto.indexOf("Sair apaga")).toBeGreaterThanOrEqual(0);
    expect(texto.indexOf(frasesDaPausa("sessao_encerrada").detalhe)).toBeGreaterThan(texto.indexOf("Sair apaga"));
  });

  it("sem fila, a pausa não muda nada: a frase curta de sempre", () => {
    expect(avisoDaSaida(0, contarRascunhos([]), "conta_desativada")).toBe(SAIDA_SEM_NADA_A_PERDER);
  });

  it("sem pausa, o texto é exatamente o de antes", () => {
    expect(avisoDaSaida(3, contarRascunhos([]), null)).toBe(avisoDaSaida(3, contarRascunhos([])));
    expect(avisoDaSaida(3, contarRascunhos([]), null)).toMatch(/voltam a subir quando você entrar de novo, com sinal/);
  });
});
