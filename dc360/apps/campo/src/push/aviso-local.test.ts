import {
  VitrineIndiscreta, montarAvisoLocalDeTarefaNova, textoVisivel,
} from "./aviso-local";
import { CANAL_DESPACHO, SOM_DE_DESPACHO, VIBRACAO_DE_DESPACHO } from "./canais";

/**
 * O aviso LOCAL de tarefa nova: o que o aplicativo mostra quando a atualização
 * periódica traz uma ocorrência que não estava na lista.
 *
 * Ele é desenhado pelo sistema do mesmo jeito que o aviso que veio pela Apple
 * ou pelo Google, na mesma tela bloqueada, à vista de quem estiver por perto.
 * Por isso a mesma regra do servidor (`apps/api/src/push/mensagem.ts`) vale
 * aqui, com a mesma trava: a vitrine é constante e o detalhe vai no dado. O
 * pedido foi explícito: "o teste que reprova protocolo/endereço no texto vale
 * para o aviso local também".
 */

const DETALHE = {
  organizacaoId: "11111111-1111-4111-8111-000000000001",
  ocorrenciaId: "33333333-3333-4333-8333-000000000009",
  severidade: "critica" as const,
};

/*
  Dados que o aviso local NEM RECEBE, e que mesmo assim são procurados no
  texto: se um dia alguém passar a pendência inteira para cá "porque é mais
  fácil", é este caso que reprova.
*/
const PROTOCOLO = "000417/2026";
const ENDERECO = "Servidão Boa Esperança, 148";
const NOME_DO_SOLICITANTE = "Marilda Nogueira de Sá";

describe("a vitrine do aviso local é genérica", () => {
  it("nem protocolo, nem endereço, nem nome, nem severidade, nem identificador no texto visível", () => {
    const aviso = montarAvisoLocalDeTarefaNova(DETALHE);
    const visivel = textoVisivel(aviso).toLowerCase();

    const proibidos: Array<[string, string]> = [
      ["protocolo", PROTOCOLO],
      ["endereço inteiro", ENDERECO],
      ["logradouro", "Boa Esperança"],
      ["número do imóvel", "148"],
      ["severidade", "critica"],
      ["nome de pessoa", NOME_DO_SOLICITANTE],
      ["sobrenome", "Nogueira"],
      ["identificador da ocorrência", DETALHE.ocorrenciaId],
      ["identificador do município", DETALHE.organizacaoId],
    ];
    // A lista do que vazou, e não um booleano: quem corrige quer saber o quê.
    const vazados = proibidos
      .filter(([, valor]) => visivel.includes(valor.toLowerCase()))
      .map(([oQueE]) => `${oQueE} apareceu na tela bloqueada: "${textoVisivel(aviso)}"`);
    expect(vazados).toEqual([]);
  });

  it("severidade nenhuma cabe no texto visível, nem por coincidência de palavra", () => {
    // "falta" contém "alta". Se um dia alguém escrever "faltam 30 minutos" na
    // vitrine, é aqui que isso é pego.
    for (const severidade of ["baixa", "media", "alta", "critica"] as const) {
      const aviso = montarAvisoLocalDeTarefaNova({ ...DETALHE, severidade });
      expect(textoVisivel(aviso).toLowerCase()).not.toContain(severidade);
    }
  });

  /*
    As MESMAS palavras que o servidor usa (`VITRINE.tarefa_nova` em
    `apps/api/src/push/mensagem.ts`). O agente não tem como saber se o aviso
    veio pelo push ou pela atualização da lista, e não deveria precisar: dois
    textos diferentes para o mesmo fato pareceriam dois avisos diferentes.
  */
  it("diz o mesmo que o aviso do servidor diz", () => {
    const aviso = montarAvisoLocalDeTarefaNova(DETALHE);
    expect(aviso.titulo).toBe("Nova tarefa");
    expect(aviso.corpo).toBe("A sua equipe recebeu uma tarefa. Abra o aplicativo para ver.");
  });
});

describe("o dado do aviso local", () => {
  /*
    O mesmo formato do push. É o que faz o toque no aviso local passar por
    `decidirAviso` e abrir a vistoria certa, e o que faz o tratador de
    primeiro plano reconhecê-lo como tarefa nova deste município.
  */
  it("leva tipo, município, ocorrência e severidade, e nada além disso", () => {
    const aviso = montarAvisoLocalDeTarefaNova(DETALHE);
    expect(aviso.dados).toEqual({
      tipo: "tarefa_nova",
      organizacaoId: DETALHE.organizacaoId,
      ocorrenciaId: DETALHE.ocorrenciaId,
      severidade: "critica",
    });
  });

  it("omite a severidade quando a ocorrência não tem", () => {
    const aviso = montarAvisoLocalDeTarefaNova({ ...DETALHE, severidade: null });
    expect(Object.keys(aviso.dados).sort()).toEqual(["ocorrenciaId", "organizacaoId", "tipo"]);
  });
});

describe("o som, o canal e a vibração", () => {
  it("são os do canal de despacho, e não os do prazo", () => {
    const aviso = montarAvisoLocalDeTarefaNova({ ...DETALHE, severidade: "baixa" });
    expect(aviso.som).toBe(SOM_DE_DESPACHO);
    expect(aviso.canal).toBe(CANAL_DESPACHO);
    expect(aviso.vibracao).toEqual(VIBRACAO_DE_DESPACHO);
  });
});

describe("a trava", () => {
  /*
    Prova de que a trava funciona, e não é enfeite. Hoje ela não pode disparar
    porque a vitrine é constante; ela existe para o dia em que alguém achar que
    o protocolo na tela bloqueada é mais útil. Aqui o detalhe é forjado para
    colidir com a vitrine de propósito.
  */
  it("dispara se alguém enfiar o detalhe na vitrine", () => {
    expect(() => montarAvisoLocalDeTarefaNova({ ...DETALHE, ocorrenciaId: "Nova tarefa" }))
      .toThrow(VitrineIndiscreta);
  });
});
