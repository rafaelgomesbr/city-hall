import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import {
  estadoDoEnvio, providenciasSemOficio, rotuloDoEnvio,
} from "../src/paginas/oficio-regras";
import { rotuloVago } from "../src/componentes/ConfirmarAcao";
import type { LinhaOficio, LinhaProvidencia } from "../src/dados/tipos";

/**
 * O OFÍCIO, E A PERGUNTA QUE ELE PRECISA RESPONDER SEM AMBIGUIDADE.
 *
 * A providência diz, dentro do sistema, que alguém foi cobrado. O ofício é o
 * documento que existe fora daqui, com número da sequência do município. A tela
 * junta as três perguntas que ninguém tinha onde responder: qual é o número,
 * saiu, e alguém abriu.
 *
 * O ERRO CARO DESTE CARTÃO seria dissolver "entregue ao provedor de email" em
 * "o órgão recebeu". São coisas diferentes: a primeira quer dizer que um
 * servidor de email aceitou a mensagem, e a segunda só é verdade quando o link
 * de uso único foi aberto. Confundir as duas faz o coordenador parar de cobrar
 * o órgão por causa de um selo verde.
 */

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), "..", "src");
const DETALHE = readFileSync(join(RAIZ, "paginas", "Ocorrencia.tsx"), "utf8");

function oficio(sobrescreve: Partial<LinhaOficio> = {}): LinhaOficio {
  return {
    id: "of-1",
    numero: "000007/2026",
    emitido_em: "2026-09-08T10:00:00.000Z",
    emitido_por_nome: "Ana (coordenador)",
    providencia_id: "p-1",
    orgao_nome: "Corpo de Bombeiros Militar",
    orgao_sigla: "CBM",
    envios: 0,
    ultimo_envio: null,
    aberto_em: null,
    ...sobrescreve,
  };
}

function providencia(id: string): LinhaProvidencia {
  return {
    id,
    orgao_destino: "Corpo de Bombeiros Militar",
    descricao: "Avaliação estrutural do imóvel",
    responsavel: "Sargento de plantão",
    prazo_em: "2026-09-11T10:00:00.000Z",
    encaminhada_em: "2026-09-08T10:00:00.000Z",
    respondida_em: null,
    resposta: null,
    desfecho: null,
    respondida_por: null,
  };
}

describe("O estado do envio por email", () => {
  it("recém emitido não é falha, e diz que ninguém foi avisado", () => {
    const estado = estadoDoEnvio(oficio());
    expect(estado.tom).toBe("neutro");
    expect(estado.rotulo).toMatch(/n[ãa]o enviado/i);
    expect(estado.explicacao).toMatch(/imprimir|impresso|recebeu nada/i);
  });

  it("tentativa que o provedor recusou grita, em vez de sumir", () => {
    /*
      Este é o estado que precisa aparecer. A tentativa ficou registrada, e
      ninguém do outro lado sabe que existe um ofício esperando. Silêncio aqui
      vira "mandamos, não chegou" numa reunião seis semanas depois.
    */
    const estado = estadoDoEnvio(oficio({ envios: 2, ultimo_envio: null }));
    expect(estado.tom).toBe("perigo");
    expect(estado.rotulo).toMatch(/nenhuma tentativa/i);
    expect(estado.explicacao).toContain("2");
  });

  it("enviado NÃO é lido, e a tela diz isso com todas as letras", () => {
    /*
      "Enviado" quer dizer que o servidor de email aceitou a mensagem, e mais
      nada. A única evidência de que alguém do órgão chegou ao documento é a
      abertura do link de uso único.
    */
    const enviado = estadoDoEnvio(oficio({
      envios: 1, ultimo_envio: "2026-09-08T11:00:00.000Z",
    }));
    expect(enviado.tom).toBe("info");
    expect(enviado.tom, "enviado pintado de sucesso faz parar de cobrar").not.toBe("sucesso");
    expect(enviado.explicacao).toMatch(/n[ãa]o quer dizer que alguém leu|ainda n[ãa]o foi aberto/i);

    const aberto = estadoDoEnvio(oficio({
      envios: 1,
      ultimo_envio: "2026-09-08T11:00:00.000Z",
      aberto_em: "2026-09-08T14:00:00.000Z",
    }));
    expect(aberto.tom).toBe("sucesso");
    expect(aberto.rotulo).toMatch(/aberto/i);
  });

  it("todo estado carrega texto, e não só tom", () => {
    // Regra da casa: nunca comunicar estado só por cor.
    for (const caso of [
      oficio(),
      oficio({ envios: 1 }),
      oficio({ envios: 1, ultimo_envio: "2026-09-08T11:00:00.000Z" }),
      oficio({ envios: 1, ultimo_envio: "2026-09-08T11:00:00.000Z", aberto_em: "2026-09-08T12:00:00.000Z" }),
    ]) {
      const estado = estadoDoEnvio(caso);
      expect(estado.rotulo.trim().length).toBeGreaterThan(0);
      expect(estado.explicacao.trim().length).toBeGreaterThan(0);
    }
  });
});

describe("Um ofício por providência", () => {
  it("a providência que já tem ofício sai da lista de emissão", () => {
    /*
      Quem cobra a regra é o banco. A tela esconde o botão do que já tem, e isso
      não é controle de acesso nenhum: é para o coordenador não descobrir a
      regra por uma mensagem de erro depois de clicar, com o órgão na linha.
    */
    const sobra = providenciasSemOficio(
      [providencia("p-1"), providencia("p-2")],
      [oficio({ providencia_id: "p-1" })],
    );
    expect(sobra.map((p) => p.id)).toEqual(["p-2"]);
  });

  it("sem ofício nenhum, todas podem ser emitidas", () => {
    expect(providenciasSemOficio([providencia("p-1")], [])).toHaveLength(1);
  });
});

describe("A pergunta antes de enviar", () => {
  it("o botão repete o número e o órgão, e não diz apenas OK", () => {
    /*
      O envio é o ato que sai do prédio: coloca um endereço de uso único para o
      dossiê de uma família dentro da caixa de entrada de outro órgão. O rótulo
      é a última chance de perceber que a janela aberta não é a do ofício que se
      estava lendo.
    */
    const rotulo = rotuloDoEnvio({ numero: "000007/2026", orgao_nome: "Corpo de Bombeiros" });
    expect(rotulo).toContain("000007/2026");
    expect(rotulo).toContain("Corpo de Bombeiros");
    expect(rotuloVago(rotulo), "o rótulo não diz o que vai acontecer").toBe(false);
  });

  it("sem ofício escolhido o rótulo continua sendo uma frase, não vazio", () => {
    // A janela renderiza um quadro antes de fechar, e rótulo vazio ali seria um
    // botão sem nome para o leitor de tela.
    expect(rotuloDoEnvio(null).trim().length).toBeGreaterThan(0);
  });
});

describe("O cartão na tela da ocorrência", () => {
  it("emitir e enviar são dois atos, e só o envio pergunta", () => {
    /*
      Emitir produz um papel dentro do município; enviar coloca um link vivo
      para o dossiê de uma família na caixa de entrada de outro órgão. Pedir
      confirmação para os dois ensinaria a clicar em "sim" sem ler, e a pergunta
      que importa é a do envio.
    */
    const cartao = DETALHE.slice(DETALHE.indexOf("function CartaoOficios"));
    expect(cartao).toContain("<ConfirmarAcao");
    expect(cartao.slice(0, cartao.indexOf("<ConfirmarAcao"))).toContain("await emitirOficio(");
    expect(cartao).toContain("aoConfirmar={() => { if (aEnviar) void enviar(aEnviar); }}");
    expect(cartao).toContain("await enviarOficio(sessao, oficio.id)");
  });

  it("o botão da linha só abre a pergunta: quem envia é a janela", () => {
    /*
      O portão de componente confere que a janela CHAMA quem grava, e essa
      conferência tem um buraco que este caso fecha: ela continua passando se o
      botão de fora também gravar direto, com a janela ao lado, de enfeite.
      Descobri o buraco tentando desfazer a correção de propósito e vendo a
      suíte inteira passar.

      Por isso a regra aqui é de caminho único: `enviar` é chamado em um lugar
      só, e esse lugar é o `aoConfirmar`.
    */
    const cartao = DETALHE.slice(DETALHE.indexOf("function CartaoOficios"));
    const chamadas = [...cartao.matchAll(/\bvoid enviar\(/g)];
    expect(chamadas, "o envio ganhou um segundo caminho, sem pergunta").toHaveLength(1);

    const antes = cartao.slice(Math.max(0, chamadas[0]!.index - 160), chamadas[0]!.index);
    expect(antes, "quem chama `enviar` não é a janela").toContain("aoConfirmar");
    expect(cartao, "o botão da linha grava em vez de perguntar")
      .toContain("onClick={() => setAEnviar(f)}");
  });

  it("o número emitido chega à tela, e não só ao aviso", () => {
    /*
      Mesma regra do protocolo recém gerado: se o número existisse só na frase
      de sucesso, quem desviou o olho por três segundos perderia o número do
      documento que acabou de nascer, com o órgão ainda na linha.
    */
    const cartao = DETALHE.slice(DETALHE.indexOf("function CartaoOficios"));
    expect(cartao).toContain('<div className="oficio__numero mono">{f.numero}</div>');
    expect(cartao, "o cartão não recarrega depois de emitir, então a lista não "
      + "mostraria o número novo").toContain("await aoMudar()");
  });

  it("o estado do envio aparece por texto, vindo da regra", () => {
    const cartao = DETALHE.slice(DETALHE.indexOf("function CartaoOficios"));
    expect(cartao).toContain("estadoDoEnvio(f)");
    expect(cartao).toContain("{envio.rotulo}");
    expect(cartao).toContain("{envio.explicacao}");
  });

  it("o modo local não finge que mandou email", () => {
    /*
      Prometer email que não sai foi um defeito real deste produto, confirmado
      contra a produção. O modo de demonstração não tem provedor de email, e a
      saída honesta é não oferecer o botão e dizer por quê, em vez de mostrar
      uma confirmação de envio que não aconteceu.
    */
    const cartao = DETALHE.slice(DETALHE.indexOf("function CartaoOficios"));
    expect(cartao).toContain('MODO === "api"');
    expect(cartao).toContain('MODO === "local"');

    const local = readFileSync(join(RAIZ, "dados", "local.ts"), "utf8");
    const envio = local.slice(local.indexOf("export async function enviarOficio"));
    expect(envio.slice(0, 600)).toContain("throw new Error");
  });
});
