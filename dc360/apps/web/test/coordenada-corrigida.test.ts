import { describe, expect, it } from "vitest";
import {
  CASAS_DE_COORDENADA, PAPEIS, STATUS_OCORRENCIA, type StatusOcorrencia,
} from "@dc360/shared";
import { CASAS_DE_COORDENADA as CASAS_NO_PAINEL } from "../src/paginas/coordenada-colada";
import {
  avisoDaCorrecao, podeCorrigirCoordenada, proximoPassoDaCorrecao,
} from "../src/paginas/coordenada-corrigida";

/**
 * A correção do alfinete, do lado da tela.
 *
 * O ponto cai no lugar errado o tempo todo (endereço ditado ao telefone,
 * geocodificação que erra a quadra, coordenada digitada torto) e até aqui não
 * havia como corrigir: a coordenada entrava na abertura e nunca mais mudava. A
 * equipe saía para vistoriar o endereço errado, e a única saída do coordenador
 * era abrir OUTRO protocolo para o mesmo evento.
 *
 * As recusas de verdade são do servidor. O que este arquivo prende é o que a
 * tela decide: para quem ela oferece a correção, o que ela não deixa nem sair
 * daqui, e que ela usa o MESMO leitor de coordenada da abertura em vez de um
 * segundo leitor que envelheceria em separado.
 */

const MOTIVO =
  "O agente conferiu no local: o ponto caía na quadra de baixo, do outro lado "
  + "do córrego.";

describe("Para quem o painel oferece a correção", () => {
  it("oferece a quem registra ocorrência, e não ao agente de campo", () => {
    /*
      A permissão é `abrir_ocorrencia`, a mesma competência que informa a
      localização quando o chamado entra: quem registra com o telefone no ombro
      é quem erra o ponto, e negar a correção a ele faria o caminho fácil voltar
      a ser abrir protocolo novo. O agente fica de fora porque o canal dele para
      dizer onde a casa fica é a vistoria, com o GPS do aparelho.
    */
    expect(podeCorrigirCoordenada("operador", "registrada")).toBe(true);
    expect(podeCorrigirCoordenada("coordenador", "em_campo")).toBe(true);
    expect(podeCorrigirCoordenada("administrador", "triagem")).toBe(true);
    expect(podeCorrigirCoordenada("agente_campo", "em_campo")).toBe(false);
  });

  it("não oferece em ocorrência encerrada, para papel nenhum", () => {
    /*
      Encerrada é peça de processo: o laudo já saiu com a coordenada impressa.
      O portão de verdade é do servidor; este aqui evita desenhar um formulário
      que só serve para levar um 409 no fim.
    */
    for (const papel of PAPEIS) {
      expect(podeCorrigirCoordenada(papel, "encerrada"), papel).toBe(false);
    }
  });

  it("oferece em todo estado do qual ainda se sai, inclusive depois da vistoria", () => {
    /*
      A decisão sobre vistoria concluída, exercitada em vez de comentada:
      corrigir continua valendo depois que a equipe voltou do campo. Recusar ali
      devolveria o coordenador ao protocolo duplicado justamente no caso mais
      grave, que é o do imóvel interditado no endereço errado.
    */
    const abertos = STATUS_OCORRENCIA.filter((s) => s !== "encerrada");
    for (const status of abertos as StatusOcorrencia[]) {
      expect(podeCorrigirCoordenada("coordenador", status), status).toBe(true);
    }
    expect(abertos).toContain("vistoria_concluida");
  });
});

describe("O que a tela deixa sair, e o que ela segura", () => {
  it("lê o que a pessoa tem na mão, pelo mesmo leitor da abertura", () => {
    /*
      Vírgula decimal e grau/minuto/segundo são o que chega pelo WhatsApp num
      município brasileiro, e o leitor da abertura já os entende. Reusá-lo é o
      que impede a mesma colagem de ser aceita numa tela e recusada na outra.
    */
    const comVirgula = proximoPassoDaCorrecao("-27,5762 -48,5389", MOTIVO, null);
    expect(comVirgula.tipo).toBe("gravar");
    if (comVirgula.tipo === "gravar") {
      expect(comVirgula.correcao.coordenada).toEqual({ lat: -27.5762, lng: -48.5389 });
    }

    const emGraus = proximoPassoDaCorrecao(`27°34'34.3"S 48°32'20.0"O`, MOTIVO, null);
    expect(emGraus.tipo).toBe("gravar");

    const doGoogle = proximoPassoDaCorrecao(
      "https://www.google.com/maps/@-22.4187,-45.4523,17z", MOTIVO, null,
    );
    expect(doGoogle.tipo).toBe("gravar");
  });

  it("aplica o teto de seis casas antes de mandar", () => {
    const d = proximoPassoDaCorrecao("-22.418712345678901, -45.452312345678901", MOTIVO, null);
    expect(d.tipo).toBe("gravar");
    if (d.tipo === "gravar") {
      expect(d.correcao.coordenada).toEqual({ lat: -22.418712, lng: -45.452312 });
    }
  });

  it("recusa o ponto igual ao que já está gravado", () => {
    /*
      O servidor aceitaria: seria uma correção válida de um lugar para o mesmo
      lugar. E deixaria, numa trilha que não tem policy de DELETE, um evento
      dizendo que o ponto foi corrigido sem que nada tenha mudado. Evento inútil
      em trilha append-only é para sempre.
    */
    const d = proximoPassoDaCorrecao(
      "-22.418700, -45.452300", MOTIVO, { lat: -22.4187, lng: -45.4523 },
    );
    expect(d.tipo).toBe("erro");
    if (d.tipo === "erro") expect(d.mensagem).toContain("já está gravado");
  });

  it("recusa motivo curto, com a mesma regra que o servidor aplica", () => {
    const d = proximoPassoDaCorrecao("-22.42, -45.45", "erro", null);
    expect(d.tipo).toBe("erro");
  });

  it("recusa o que não virou ponto, e cada recusa termina no que fazer", () => {
    const vazio = proximoPassoDaCorrecao("", MOTIVO, null);
    expect(vazio.tipo).toBe("erro");

    const encurtado = proximoPassoDaCorrecao("https://maps.app.goo.gl/abc123", MOTIVO, null);
    expect(encurtado.tipo).toBe("erro");
    if (encurtado.tipo === "erro") {
      // O painel não abre link nenhum, e diz isso em vez de falhar calado.
      expect(encurtado.mensagem).toContain("encurtado");
    }

    const texto = proximoPassoDaCorrecao("perto da padaria", MOTIVO, null);
    expect(texto.tipo).toBe("erro");
  });
});

describe("O teto de casas é um número só", () => {
  it("o painel e a gravação usam as mesmas seis casas", () => {
    /*
      O teto nasceu no painel, aplicado ao ler o texto colado, e passou a valer
      também na gravação, no esquema compartilhado. Dois números iguais em
      arquivos diferentes divergem no dia em que alguém mexe num só, e o efeito
      seria a mesma coluna guardando duas precisões conforme a porta de entrada.
      Este caso é o que impede a divergência de passar calada.
    */
    expect(CASAS_NO_PAINEL).toBe(CASAS_DE_COORDENADA);
    expect(CASAS_DE_COORDENADA).toBe(6);
  });
});

describe("O aviso depois de corrigir", () => {
  it("diz de onde para onde o alfinete andou", () => {
    const frase = avisoDaCorrecao({
      anterior: { lat: -22.4187, lng: -45.4523 },
      nova: { lat: -22.419812, lng: -45.451044 },
      documentoJaEmitido: false,
    });
    expect(frase).toContain("-22.418700, -45.452300");
    expect(frase).toContain("-22.419812, -45.451044");
  });

  it("separa 'não tinha ponto' de 'o ponto estava errado'", () => {
    const frase = avisoDaCorrecao({
      anterior: null,
      nova: { lat: -22.4301, lng: -45.4402 },
      documentoJaEmitido: false,
    });
    expect(frase).toContain("sem ponto no mapa");
  });

  it("avisa quando um documento oficial já tinha saído com o ponto anterior", () => {
    /*
      O laudo é gerado sob demanda e nunca guardado: a reimpressão sai com o
      ponto novo, diferente do papel que já está dentro do processo. Quem
      corrigiu precisa saber disso enquanto ainda pode avisar quem juntou o
      documento.
    */
    const frase = avisoDaCorrecao({
      anterior: { lat: -22.4187, lng: -45.4523 },
      nova: { lat: -22.4233, lng: -45.4544 },
      documentoJaEmitido: true,
    });
    expect(frase).toContain("documento oficial");
    expect(frase).toContain("trilha");
  });
});
