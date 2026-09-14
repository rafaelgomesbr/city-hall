import { describe, expect, it } from "vitest";
import type { EnvelopeSincronizacao } from "@dc360/shared";
import {
  CODIGO_ARQUIVO_SUMIU,
  FalhaPermanente,
  FalhaTemporaria,
  criarFilaDeSincronizacao,
  depositoSobreChaveValor,
  evidenciasPerdidasDoItem,
  lojaEmMemoria,
  type Arquivos,
  type AutorDaColeta,
  type FotoLocal,
  type Transporte,
} from "../src/index.js";

/**
 * O ARQUIVO QUE O SISTEMA OPERACIONAL APAGOU, e a saída que não existia.
 *
 * As fotos sobem ANTES do envelope, de propósito: o laudo não pode apontar para
 * arquivo que ainda não existe. A consequência era que um arquivo apagado do
 * cache (e cache é, por definição, o que o sistema apaga sozinho quando o
 * armazenamento aperta) fazia a leitura dos bytes falhar e o ENVELOPE INTEIRO
 * nunca sair: checklist, GPS, assinatura, observações, órgãos a acionar. Uma
 * manhã de trabalho no morro destruída porque o iPhone liberou espaço.
 *
 * O que estes casos fixam é a decisão de produto, e ela tem duas metades:
 *
 * 1. **A coleta pode subir sem o arquivo perdido.** Com a perda declarada no
 *    envelope, que vira linha no laudo e evento na trilha.
 * 2. **Quem decide é o agente, nunca o aplicativo.** A perda vira uma frase num
 *    documento com brasão e um registro append-only. Um aparelho que desistisse
 *    sozinho depois de N tentativas produziria essa declaração sem ninguém ter
 *    escolhido, e N tentativas nem seria critério: arquivo apagado não volta, a
 *    falha já é permanente na primeira leitura.
 */

const MOMENTO = new Date("2026-09-14T14:00:00.000Z");
const CHAVE_A = "11111111-1111-4111-8111-111111111111";

const AGENTE: AutorDaColeta = {
  usuarioId: "u-ana", nome: "Ana Ribeiro", organizacaoId: "org-serra-alta",
};

function envelope(chave = CHAVE_A): EnvelopeSincronizacao {
  return {
    idempotencyKey: chave,
    ocorrenciaId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    coletadaEm: MOMENTO.toISOString(),
    vistoria: {
      checklist: [
        { chave: "risco_iminente", resposta: true },
        { chave: "evacuacao_necessaria", resposta: false },
        { chave: "interdicao_indicada", resposta: false },
        { chave: "acionar_outro_orgao", resposta: false },
      ],
      fotos: [],
      gpsPrecisaoMetros: 6,
      assinanteNome: "Marilda Souza Prado",
      assinaturaChave: null,
      coletadaEm: MOMENTO.toISOString(),
    },
  };
}

function foto(nome: string, uri: string, ordem: number): FotoLocal {
  return {
    idempotencyKey: nome,
    uriLocal: uri,
    nomeArquivo: `${nome}.jpg`,
    tipoConteudo: "image/jpeg",
    tamanhoBytes: 1024,
    capturadaEm: MOMENTO.toISOString(),
    legenda: `Legenda de ${nome}`,
    coordenada: { lat: -22.410383, lng: -45.456789 },
    ordem,
  };
}

/** Sistema de arquivos falso: só existe o que estiver nesta lista. */
function arquivosCom(existentes: string[]): Arquivos {
  return {
    async ler(uri: string) {
      if (!existentes.includes(uri)) {
        throw new FalhaPermanente(
          "Um arquivo desta vistoria não está mais neste aparelho.",
          CODIGO_ARQUIVO_SUMIU,
        );
      }
      return new Uint8Array([1, 2, 3]);
    },
  };
}

function montar(opcoes: {
  arquivos: Arquivos;
  aoEnviar?: (e: EnvelopeSincronizacao) => void;
  /** Devolve `true` para a rede cair no envio dos bytes daquela foto. */
  redeCaiAoSubirBytes?: () => boolean;
}) {
  const loja = lojaEmMemoria();
  const enviados: EnvelopeSincronizacao[] = [];
  let n = 0;
  const transporte: Transporte = {
    enviar: async (e) => {
      enviados.push(e);
      opcoes.aoEnviar?.(e);
      return { vistoriaId: "v1", duplicada: false };
    },
    devolver: async () => { throw new Error("devolver não esperado"); },
    autorizarFoto: async () => {
      n += 1;
      return {
        evidenciaId: `ev-${n}`, chave: `tenant/org/foto-${n}.jpg`,
        url: "http://127.0.0.1/upload", cabecalhos: {}, jaEnviada: false,
      };
    },
    enviarBytes: async () => {
      if (opcoes.redeCaiAoSubirBytes?.()) throw new FalhaTemporaria("Sem conexão.");
    },
    confirmarFoto: async () => undefined,
  };
  /* Relógio controlado: a espera entre tentativas é de minutos, e esperar de
     verdade tornaria o teste lento e instável. */
  let instante = MOMENTO.getTime();
  const fila = criarFilaDeSincronizacao({
    deposito: depositoSobreChaveValor(loja),
    transporte,
    sessaoAtual: () => AGENTE,
    agora: () => new Date(instante),
    dormir: async () => undefined,
    ruido: () => 0.5,
    arquivos: opcoes.arquivos,
  });
  return { fila, enviados, avancar: (ms: number) => { instante += ms; } };
}

describe("O arquivo que sumiu do aparelho", () => {
  it("uma rodada descobre TODAS as ausências, e não uma por vez", async () => {
    /*
      Parar na primeira ausência faria a tela dizer "uma foto sumiu", o agente
      consentir, a rodada seguinte descobrir a segunda, e assim por diante: ele
      responderia a mesma pergunta uma vez por arquivo perdido, no barranco, sem
      saber quantas faltam. Percorrendo tudo, uma pergunta resolve o caso.
    */
    const { fila } = montar({ arquivos: arquivosCom(["file:///ok.jpg"]) });
    await fila.enfileirar(envelope(), {
      protocolo: "000471/2026",
      fotos: [
        foto("foto-1", "file:///sumiu-1.jpg", 0),
        foto("foto-2", "file:///ok.jpg", 1),
        foto("foto-3", "file:///sumiu-2.jpg", 2),
      ],
    });

    await fila.drenar();

    const item = (await fila.itens())[0]!;
    expect(item.estado).toBe("bloqueado");
    expect(item.ultimaFalha?.codigo).toBe(CODIGO_ARQUIVO_SUMIU);
    expect(evidenciasPerdidasDoItem(item)).toHaveLength(2);
    // A que existia subiu nesta mesma rodada: o progresso não se perde.
    expect(item.fotos.find((f) => f.idempotencyKey === "foto-2")!.enviada).toBe(true);
  });

  it("a frase que o agente lê termina numa AÇÃO, e diz quantos faltam", async () => {
    /*
      Antes desta mudança não havia saída nenhuma e a orientação possível era
      avisar a coordenação. Saída que existe no motor e não existe na tela é
      saída que não existe.
    */
    const { fila } = montar({ arquivos: arquivosCom([]) });
    await fila.enfileirar(envelope(), {
      protocolo: "000471/2026",
      fotos: [foto("foto-1", "file:///sumiu-1.jpg", 0), foto("foto-2", "file:///sumiu-2.jpg", 1)],
    });
    await fila.drenar();

    const item = (await fila.itens())[0]!;
    expect(item.ultimaFalha?.mensagem).toContain("2 registros");
    expect(item.ultimaFalha?.mensagem).toContain("enviar a vistoria sem eles");
  });

  it("sem o consentimento, a coleta NÃO sobe: o dreno tenta de novo e bloqueia", async () => {
    /*
      O aplicativo não decide. Se ele decidisse, o laudo passaria a declarar
      prova ausente sem ninguém ter escolhido, e a trilha (que é append-only)
      guardaria uma decisão de sistema onde quem lê espera a de uma pessoa.
    */
    const { fila, enviados } = montar({ arquivos: arquivosCom([]) });
    await fila.enfileirar(envelope(), {
      protocolo: "000471/2026", fotos: [foto("foto-1", "file:///sumiu.jpg", 0)],
    });

    await fila.drenar();
    await fila.reenviar(CHAVE_A);
    await fila.drenar();

    expect(enviados, "nenhum envelope pode sair sem o agente decidir").toHaveLength(0);
    expect((await fila.itens())[0]!.estado).toBe("bloqueado");
  });

  it("com o consentimento, sobe com a perda DECLARADA e sem a foto que faltou", async () => {
    const { fila, enviados } = montar({ arquivos: arquivosCom(["file:///ok.jpg"]) });
    await fila.enfileirar(envelope(), {
      protocolo: "000471/2026",
      fotos: [foto("foto-1", "file:///sumiu.jpg", 0), foto("foto-2", "file:///ok.jpg", 1)],
    });
    await fila.drenar();

    const decisao = await fila.abrirMaoDasEvidenciasPerdidas(CHAVE_A);
    expect(decisao).toEqual({ liberado: true, perdidas: 1 });

    await fila.drenar();

    expect(enviados).toHaveLength(1);
    const v = enviados[0]!.vistoria;
    // A foto que existe entra no registro fotográfico; a que sumiu, nunca.
    expect(v.fotos).toHaveLength(1);
    expect(v.evidenciasPerdidas).toHaveLength(1);
    const perda = v.evidenciasPerdidas![0]!;
    expect(perda.idempotencyKey).toBe("foto-1");
    expect(perda.papel).toBe("foto");
    expect(perda.capturadaEm).toBe(MOMENTO.toISOString());
    /*
      O metadado SOBREVIVEU ao arquivo: legenda e coordenada vivem aqui na fila,
      não dentro da imagem. É a diferença entre o laudo dizer "uma fotografia se
      perdeu" e dizer qual, de onde e de que hora.
    */
    expect(perda.legenda).toBe("Legenda de foto-1");
    expect(perda.coordenada).toEqual({ lat: -22.410383, lng: -45.456789 });
    expect((await fila.itens())[0]!.estado).toBe("confirmado");
  });

  it("a ASSINATURA perdida sobe com o papel dela, e não como mais uma foto", async () => {
    /*
      Quando o arquivo que some é o traço da moradora, `assinaturaChave` fica
      nula e o laudo imprime uma LINHA DE ASSINATURA EM BRANCO, indistinguível
      de uma vistoria em que ninguém assinou. É a lacuna mais grave que o
      documento pode ter, e sem o papel ela seria a única que ele não saberia
      nomear.
    */
    const { fila, enviados } = montar({ arquivos: arquivosCom(["file:///ok.jpg"]) });
    await fila.enfileirar(envelope(), {
      protocolo: "000471/2026",
      fotos: [foto("foto-1", "file:///ok.jpg", 0)],
      assinatura: foto("assinatura-1", "file:///sumiu.png", 1),
    });
    await fila.drenar();
    await fila.abrirMaoDasEvidenciasPerdidas(CHAVE_A);
    await fila.drenar();

    const v = enviados[0]!.vistoria;
    expect(v.assinaturaChave).toBeNull();
    expect(v.evidenciasPerdidas).toHaveLength(1);
    expect(v.evidenciasPerdidas![0]!.papel).toBe("assinatura");
    // E ela nunca entra no registro fotográfico como "Foto 2".
    expect(v.fotos).toHaveLength(1);
  });

  it("coleta sem perda nenhuma continua exatamente igual, sem o campo novo", async () => {
    /*
      Mandar `[]` sempre faria toda coleta carregar a afirmação de que houve
      conferência de perda, inclusive as que nunca perderam nada. O campo é
      opcional no contrato justamente para o aparelho antigo não mandar nada.
    */
    const { fila, enviados } = montar({ arquivos: arquivosCom(["file:///ok.jpg"]) });
    await fila.enfileirar(envelope(), {
      protocolo: "000471/2026", fotos: [foto("foto-1", "file:///ok.jpg", 0)],
    });
    await fila.drenar();

    expect(enviados).toHaveLength(1);
    expect(enviados[0]!.vistoria).not.toHaveProperty("evidenciasPerdidas");
  });
});

describe("O portão do consentimento: só sai o que realmente acabou", () => {
  it("recusa quando a coleta está bloqueada por OUTRO motivo", async () => {
    /*
      Sem este portão, o mesmo botão serviria para jogar fora uma foto que está
      inteira no aparelho e só não subiu porque o servidor recusou a coleta por
      outra razão. A prova de uma interdição sairia do processo por um toque num
      dia ruim.
    */
    const { fila } = montar({ arquivos: arquivosCom(["file:///ok.jpg"]) });
    const loja = fila;
    await loja.enfileirar(envelope(), {
      protocolo: "000471/2026", fotos: [foto("foto-1", "file:///ok.jpg", 0)],
    });

    // O servidor recusa o envelope, e não há arquivo nenhum faltando.
    const bloqueada = montarComEnvioRecusado();
    await bloqueada.fila.enfileirar(envelope(), {
      protocolo: "000471/2026", fotos: [foto("foto-1", "file:///ok.jpg", 0)],
    });
    await bloqueada.fila.drenar();
    expect((await bloqueada.fila.itens())[0]!.estado).toBe("bloqueado");

    expect(await bloqueada.fila.abrirMaoDasEvidenciasPerdidas(CHAVE_A))
      .toEqual({ liberado: false, perdidas: 0 });
    expect((await bloqueada.fila.itens())[0]!.estado).toBe("bloqueado");
  });

  it("recusa quando o item nem está bloqueado, e quando não existe", async () => {
    const { fila } = montar({ arquivos: arquivosCom(["file:///ok.jpg"]) });
    await fila.enfileirar(envelope(), {
      protocolo: "000471/2026", fotos: [foto("foto-1", "file:///ok.jpg", 0)],
    });

    expect(await fila.abrirMaoDasEvidenciasPerdidas(CHAVE_A))
      .toEqual({ liberado: false, perdidas: 0 });
    expect(await fila.abrirMaoDasEvidenciasPerdidas("nao-existe"))
      .toEqual({ liberado: false, perdidas: 0 });
  });

  it("a REDE tem precedência: ninguém é perguntado enquanto o problema for sinal", async () => {
    /*
      O CASO QUE NÃO SABE FALHAR, se ninguém o escrever.

      Falha de rede melhora sozinha; arquivo apagado não volta. Se o dreno
      parasse na primeira ausência e bloqueasse ali, o agente seria perguntado
      "deseja subir sem uma fotografia?" num momento em que o problema era
      apenas o sinal, e ele abriria mão de uma prova que estava inteira no
      aparelho, esperando só a próxima janela de conexão.

      Por isso a falha temporária interrompe o envio ANTES de a perda virar
      pergunta, e o item fica `pendente` (continua tentando sozinho) em vez de
      `bloqueado`. A pergunta só acontece quando ela é a única coisa que falta.
    */
    const existentes = ["file:///talvez.jpg"];
    let redeCai = true;
    const { fila, enviados, avancar } = montar({
      arquivos: arquivosCom(existentes),
      redeCaiAoSubirBytes: () => redeCai,
    });
    await fila.enfileirar(envelope(), {
      protocolo: "000471/2026",
      fotos: [
        foto("foto-1", "file:///sumiu.jpg", 0),
        foto("foto-2", "file:///talvez.jpg", 1),
      ],
    });

    await fila.drenar();
    const naPrimeira = (await fila.itens())[0]!;
    expect(naPrimeira.estado, "sinal ruim não bloqueia coleta").toBe("pendente");
    // A ausência já foi descoberta e gravada, mas ela ainda não é a pergunta.
    expect(evidenciasPerdidasDoItem(naPrimeira)).toHaveLength(1);
    expect(await fila.abrirMaoDasEvidenciasPerdidas(CHAVE_A))
      .toEqual({ liberado: false, perdidas: 0 });

    /*
      A segunda janela de sinal chega depois de o sistema operacional ter
      limpado também a segunda foto. Agora as duas ausências são o que resta, e
      a pergunta acontece uma vez só, com o número final.
    */
    redeCai = false;
    existentes.length = 0;
    avancar(10 * 60_000);
    await fila.drenar();

    const bloqueada = (await fila.itens())[0]!;
    expect(bloqueada.estado).toBe("bloqueado");
    expect(evidenciasPerdidasDoItem(bloqueada)).toHaveLength(2);
    expect(await fila.abrirMaoDasEvidenciasPerdidas(CHAVE_A))
      .toEqual({ liberado: true, perdidas: 2 });

    avancar(10 * 60_000);
    await fila.drenar();
    expect(enviados).toHaveLength(1);
    expect(enviados[0]!.vistoria.fotos).toHaveLength(0);
    expect(enviados[0]!.vistoria.evidenciasPerdidas).toHaveLength(2);
  });
});

/** Uma fila cujo servidor recusa o envelope, com arquivo nenhum faltando. */
function montarComEnvioRecusado() {
  const loja = lojaEmMemoria();
  const transporte: Transporte = {
    enviar: async () => {
      throw new FalhaPermanente("Dados recusados pelo servidor.", "dados_invalidos");
    },
    devolver: async () => { throw new Error("devolver não esperado"); },
    autorizarFoto: async () => ({
      evidenciaId: "ev-1", chave: "tenant/org/foto-1.jpg",
      url: "http://127.0.0.1/upload", cabecalhos: {}, jaEnviada: false,
    }),
    enviarBytes: async () => undefined,
    confirmarFoto: async () => undefined,
  };
  const fila = criarFilaDeSincronizacao({
    deposito: depositoSobreChaveValor(loja),
    transporte,
    sessaoAtual: () => AGENTE,
    agora: () => MOMENTO,
    dormir: async () => undefined,
    ruido: () => 0.5,
    arquivos: arquivosCom(["file:///ok.jpg"]),
  });
  return { fila };
}

describe("A leitura que falha por outro motivo não vira perda de prova", () => {
  it("falha temporária de leitura NÃO marca a foto como perdida", async () => {
    /*
      Um erro de permissão, um disco cheio ou um defeito da porta são situações
      que podem melhorar, e tratar qualquer uma como "o arquivo acabou"
      ofereceria ao agente jogar fora uma prova que ainda existe no aparelho.
    */
    const arquivos: Arquivos = {
      async ler() { throw new FalhaTemporaria("Falha ao abrir o arquivo."); },
    };
    const { fila } = montar({ arquivos });
    await fila.enfileirar(envelope(), {
      protocolo: "000471/2026", fotos: [foto("foto-1", "file:///qualquer.jpg", 0)],
    });
    await fila.drenar();

    const item = (await fila.itens())[0]!;
    expect(evidenciasPerdidasDoItem(item)).toHaveLength(0);
    // E ela continua tentando, que é o certo para falha que pode melhorar.
    expect(item.estado).toBe("pendente");
    expect(await fila.abrirMaoDasEvidenciasPerdidas(CHAVE_A))
      .toEqual({ liberado: false, perdidas: 0 });
  });
});
