import { describe, expect, it } from "vitest";
import {
  VitrineIndiscreta, montarAviso, textoVisivel, type DetalheDoAviso,
} from "../src/push/mensagem.js";
import { criarEnvio, semAFicha } from "../src/push/envio.js";

/*
  O QUE ESTE ARQUIVO IMPEDE, e não é questão de estilo de texto.

  A notificação sai deste servidor, atravessa a fronteira, passa por servidor
  da Apple ou do Google e chega ao aparelho. No caminho ela é legível para o
  intermediário, e no destino ela fica ESCRITA NA TELA BLOQUEADA, à vista de
  quem estiver por perto: o parente na sala, o vizinho na fila, a pessoa cujo
  imóvel está prestes a ser interditado.

  Uma notificação que diz "Interdição em Servidão Boa Esperança, 148" entrega o
  endereço de uma família em situação de risco a todo mundo que olhar o
  telefone de longe. A decisão está em `docs/SUBPROCESSADORES.md`, seção 2.1:
  a vitrine é genérica, o detalhe vai no dado da mensagem.

  Os dados de teste abaixo são fictícios, como manda a casa, mas escolhidos
  para serem inconfundíveis dentro de um texto: se qualquer um deles aparecer
  na vitrine, o teste reprova apontando qual.
*/

const DETALHE: DetalheDoAviso = {
  organizacaoId: "11111111-1111-4111-8111-000000000001",
  ocorrenciaId: "33333333-3333-4333-8333-000000000009",
  protocolo: "000417/2026",
  endereco: "Servidão Boa Esperança, 148",
  severidade: "critica",
  prazoEm: "2026-09-09T17:30:00.000Z",
};

/** O nome do solicitante nunca chega perto do aviso, nem na vitrine nem no dado. */
const NOME_DO_SOLICITANTE = "Marilda Nogueira de Sá";

describe("A vitrine da notificação é genérica", () => {
  for (const tipo of ["tarefa_nova", "prazo_vencendo"] as const) {
    it(`${tipo}: nem protocolo, nem endereço, nem nome, nem severidade no texto visível`, () => {
      const aviso = montarAviso(tipo, DETALHE);
      const visivel = textoVisivel(aviso).toLowerCase();

      const proibidos: Array<[string, string]> = [
        ["protocolo", DETALHE.protocolo],
        ["endereço inteiro", DETALHE.endereco],
        ["logradouro", "Boa Esperança"],
        ["número do imóvel", "148"],
        ["severidade", "critica"],
        ["nome de pessoa", NOME_DO_SOLICITANTE],
        ["sobrenome", "Nogueira"],
        ["identificador da ocorrência", DETALHE.ocorrenciaId],
      ];

      for (const [oQueE, valor] of proibidos) {
        expect(
          visivel.includes(valor.toLowerCase()),
          `${oQueE} apareceu na tela bloqueada: "${textoVisivel(aviso)}". ` +
          "Esse texto passa por servidor fora do país e fica legível para quem " +
          "estiver perto do telefone.",
        ).toBe(false);
      }
    });
  }

  it("mesmo assim o aviso diz o que fazer, senão ele não serve para nada", () => {
    const aviso = montarAviso("prazo_vencendo", DETALHE);
    expect(aviso.titulo.length).toBeGreaterThan(0);
    expect(aviso.corpo).toMatch(/aplicativo/i);
  });

  it("o dado leva o que abre a tarefa, e nada além disso", () => {
    /*
      A metade oposta do mesmo requisito: esconder TUDO faria o agente abrir o
      aplicativo e procurar qual das tarefas era a do aviso. O que ele precisa é
      o identificador, e ele já tem a ocorrência no disco.

      Protocolo e endereço saíram, e a razão é que o DADO da mensagem também
      atravessa a fronteira, junto com a vitrine. Endereço de imóvel vistoriado
      pela Defesa Civil identifica pessoa quando cruzado com o resto, e
      `docs/SUBPROCESSADORES.md` seção 2.3 limita o que sai do país ao mínimo.
      A severidade fica porque ela escolhe o canal do Android antes de o
      aplicativo abrir, e é uma palavra de quatro valores possíveis.
    */
    const aviso = montarAviso("prazo_vencendo", DETALHE);
    expect(aviso.dados.ocorrenciaId).toBe(DETALHE.ocorrenciaId);
    expect(aviso.dados.severidade).toBe("critica");
    expect(Object.keys(aviso.dados).sort()).toEqual(
      ["ocorrenciaId", "organizacaoId", "prazoEm", "severidade", "tipo"],
    );
  });

  it("o dado carrega o município, que é o que faz o aplicativo descartar aviso alheio", () => {
    /*
      A migração 016 aceita, de propósito, que a mesma ficha fique viva em dois
      municípios: o contrário vazaria existência entre prefeituras pela
      mensagem de erro de unicidade. O custo dessa escolha é um aparelho que
      pode receber aviso de uma prefeitura em que a pessoa não trabalha mais, e
      este campo é a barreira que transforma esse custo em nada.
    */
    const aviso = montarAviso("prazo_vencendo", DETALHE);
    expect(aviso.dados.organizacaoId).toBe(DETALHE.organizacaoId);
  });

  it("severidade nenhuma cabe no texto visível, nem por coincidência de palavra", () => {
    // "falta" contém "alta". Se um dia alguém escrever "faltam 30 minutos" na
    // vitrine, é aqui que isso é pego, e não em produção.
    for (const severidade of ["baixa", "media", "alta", "critica"]) {
      const aviso = montarAviso("prazo_vencendo", { ...DETALHE, severidade });
      expect(textoVisivel(aviso).toLowerCase()).not.toContain(severidade);
    }
  });

  it("a trava dispara se alguém enfiar o detalhe na vitrine", () => {
    /*
      Prova de que a trava de tempo de execução funciona, e não é enfeite.
      Hoje ela não pode disparar porque a vitrine é constante; ela existe para
      o dia em que alguém achar que o protocolo na tela bloqueada é mais útil.
      Aqui o detalhe é forjado para colidir com a vitrine de propósito.
    */
    expect(() =>
      montarAviso("prazo_vencendo", { ...DETALHE, severidade: "Prazo vencendo" }),
    ).toThrow(VitrineIndiscreta);
  });
});

describe("A ficha do aparelho não vaza pelo relato de erro", () => {
  const FICHA = "aabbccdd11223344556677889900ffee";

  it("o caminho da APNs, que carrega a ficha na URL, sai limpo", () => {
    // A mensagem de erro de rede do Node repete a URL inteira, e na APNs a URL
    // é `/3/device/<ficha>`. Sem a limpeza, a ficha de push de cada agente iria
    // parar na coluna que o suporte abre e no log do servidor.
    const bruto = `connect ECONNREFUSED api.push.apple.com /3/device/${FICHA}`;
    expect(semAFicha(bruto, FICHA)).not.toContain(FICHA);
    expect(semAFicha(bruto, FICHA)).toContain("[ficha]");
  });

  it("provedor que explode vira desfecho, e não exceção, e sem a ficha no detalhe", async () => {
    /*
      Falha de envio não pode derrubar o varredor no meio da lista, deixando
      sem aviso todo mundo que vinha depois na fila.
    */
    const enviar = criarEnvio({
      apple: {
        async enviar() {
          throw new Error(`socket hang up ao falar com /3/device/${FICHA}`);
        },
      },
    });

    const resultado = await enviar(
      { ficha: FICHA, plataforma: "ios" },
      montarAviso("prazo_vencendo", DETALHE),
    );

    expect(resultado.desfecho).toBe("falha");
    expect(resultado.detalhe).not.toContain(FICHA);
  });

  it("plataforma sem provedor configurado falha explicando, e não derruba nada", async () => {
    const enviar = criarEnvio({ apple: { async enviar() { return { desfecho: "entregue", detalhe: null }; } } });
    const resultado = await enviar(
      { ficha: FICHA, plataforma: "android" },
      montarAviso("tarefa_nova", DETALHE),
    );
    expect(resultado.desfecho).toBe("falha");
    expect(resultado.detalhe).toMatch(/android/);
  });
});
