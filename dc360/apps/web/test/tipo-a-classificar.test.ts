import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeAll, describe, expect, it } from "vitest";

import { MOTIVO_RECLASSIFICAR, ROTULO_TIPO_COBRADE } from "@dc360/shared";
import {
  ANCORA_DA_CLASSIFICACAO, CODIGO_A_CLASSIFICAR, SEM_CLASSIFICAR,
  descricaoDoTipoNaAbertura, despachoEsperaClassificacao, ofereceTriagem,
  opcoesDeTipoNaTriagem, recusadoPorFaltaDeClassificacao, tipoEscolhidoNaTriagem,
  tipoInicialNaTriagem,
} from "../src/paginas/ocorrencia-regras";
import { TipoDaOcorrencia } from "../src/componentes/comuns";
import * as local from "../src/dados/local";
import type { Sessao } from "../src/dados/tipos";

/**
 * O tipo "outro", da porta de entrada até o despacho.
 *
 * O QUE ESTE ARQUIVO GUARDA, e por que ele existe.
 *
 * A COBRADE é fechada e não se inventa nome dentro dela, mas o plantão recebe
 * chamado que não cabe nos oito nomes: árvore caída sobre a via, adutora
 * rompida, muro do vizinho que desabou. Obrigado a escolher, o operador escolhe
 * o menos errado, e isso não produz dado incompleto, produz dado FALSO: o
 * município manda para o sistema nacional um deslizamento que era outra coisa,
 * e ninguém desconfia de um campo preenchido. A lacuna é melhor que a mentira,
 * porque a lacuna se vê.
 *
 * O servidor, o esquema compartilhado e as três restrições da migração 019 já
 * estavam prontos e testados. Faltava a tela, e enquanto ela não existisse o
 * recurso era latente: nenhum operador conseguia escolher "Outro", nenhuma
 * triagem conseguia classificar, e a recusa do despacho chegaria como erro
 * genérico.
 *
 * As três camadas do portão, e o que cada uma pega:
 *
 * 1. as REGRAS puras, que é onde as decisões moram (o texto que só acompanha
 *    "outro", o seletor que nunca chuta, o reconhecimento da recusa);
 * 2. a LEITURA DAS TELAS, porque regra correta que nenhuma tela chama passa em
 *    todo teste de função pura e não faz nada na tela;
 * 3. o COMPORTAMENTO do modo de demonstração contra o Postgres de verdade
 *    (PGlite, com as mesmas migrações e o mesmo RLS). O portão de paridade
 *    confere superfície, nome por nome e aridade por aridade, e superfície
 *    igual com comportamento diferente é exatamente o defeito que faz a
 *    demonstração ensinar um fluxo que o produto real não tem.
 */

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), "..", "src");

function fonte(...caminho: string[]): string {
  return readFileSync(join(RAIZ, ...caminho), "utf8");
}

const NOVA = fonte("paginas", "NovaOcorrencia.tsx");
const DETALHE = fonte("paginas", "Ocorrencia.tsx");
const LISTA = fonte("paginas", "Ocorrencias.tsx");

describe("As regras do tipo a classificar", () => {
  it("a descrição só acompanha \"outro\", nos dois sentidos", () => {
    /*
      As duas restrições da migração 019 são opostas e as duas recusam o
      INSERT. Se a tela mandasse o texto junto de um tipo da COBRADE, o chamado
      morreria com SQLSTATE 23514 e o operador leria "erro inesperado" com a
      pessoa na linha.
    */
    expect(descricaoDoTipoNaAbertura("outro", "  Árvore caída sobre a via  "))
      .toBe("Árvore caída sobre a via");
    expect(descricaoDoTipoNaAbertura("vendaval", "Árvore caída sobre a via"))
      .toBeUndefined();
    // Vazio não vira string vazia: o banco recusa "outro" mudo, e a mensagem
    // que a pessoa precisa ler é a do esquema, não a do Postgres.
    expect(descricaoDoTipoNaAbertura("outro", "   ")).toBeUndefined();
  });

  it("o chamado triado ainda como \"outro\" continua tendo onde ser classificado", () => {
    /*
      A ARMADILHA que esta regra desarma. A triagem pode rodar em duas etapas
      (severidade agora, tipo quando alguém olhar a foto), e com o cartão de
      triagem aparecendo só em "registrada" um chamado que atravessou a triagem
      ainda como "outro" ficava preso: o despacho recusa, e nenhuma tela
      oferecia mais onde escolher o tipo. A única saída visível seria encerrar
      um caso que não foi atendido.
    */
    expect(ofereceTriagem("coordenador", "registrada", "outro")).toBe(true);
    expect(ofereceTriagem("coordenador", "triagem", "outro")).toBe(true);
    expect(ofereceTriagem("coordenador", "triagem", "deslizamento")).toBe(false);
    // Encerrada não reabre, e quem não classifica não recebe o cartão.
    expect(ofereceTriagem("coordenador", "encerrada", "outro")).toBe(false);
    expect(ofereceTriagem("operador", "registrada", "outro")).toBe(false);
  });

  it("em campo não recebe o cartão de triagem: a volta é pela devolução, não por aqui", () => {
    /*
      O servidor passou a recusar `em_campo -> triagem` pela rota de triagem
      (a aresta é da devolução de tarefa). O painel já não oferecia o cartão
      nesse estado; esta linha prende isso, para o cartão não voltar a aparecer
      e terminar num 409.
    */
    for (const status of ["em_campo", "vistoria_concluida", "providencia_pendente"] as const) {
      expect(ofereceTriagem("coordenador", status, "outro"), status).toBe(false);
      expect(ofereceTriagem("coordenador", status, "deslizamento"), status).toBe(false);
    }
  });

  it("o despacho é recusado antes de o formulário ser preenchido", () => {
    expect(despachoEsperaClassificacao("triagem", "outro")).toBe(true);
    expect(despachoEsperaClassificacao("triagem", "granizo")).toBe(false);
    // Depois do despacho não existe mais "outro" para barrar: a restrição do
    // banco não deixa o chamado chegar aqui.
    expect(despachoEsperaClassificacao("em_campo", "outro")).toBe(false);
  });

  it("o seletor da triagem nunca chuta um tipo", () => {
    /*
      Um seletor que abrisse marcado em "Deslizamento" faria quem tria
      confirmar sem escolher, e a classificação apressada voltaria pela porta da
      triagem, agora com o carimbo de quem tem competência técnica.
    */
    expect(tipoInicialNaTriagem("outro")).toBe(SEM_CLASSIFICAR);
    expect(tipoInicialNaTriagem("granizo")).toBe("granizo");

    const aClassificar = opcoesDeTipoNaTriagem("outro");
    expect(aClassificar[0]?.valor).toBe(SEM_CLASSIFICAR);
    expect(aClassificar[0]?.rotulo).toMatch(/ainda n[ãa]o classificar/i);
    expect(aClassificar).toHaveLength(9);

    // E a volta para "outro" não é oferecida: desclassificar transformaria o
    // portão do despacho em formalidade.
    const jaClassificada = opcoesDeTipoNaTriagem("granizo");
    expect(jaClassificada.map((o) => o.valor)).not.toContain("outro");
    expect(jaClassificada.map((o) => o.valor)).not.toContain(SEM_CLASSIFICAR);
    expect(jaClassificada).toHaveLength(8);
  });

  it("o que o seletor manda ao servidor é tipo da COBRADE ou nada", () => {
    expect(tipoEscolhidoNaTriagem("enxurrada")).toBe("enxurrada");
    // `undefined` é o jeito de dizer "não mexi no tipo". "outro" seria pedir
    // ao servidor uma reclassificação que o esquema compartilhado recusa.
    expect(tipoEscolhidoNaTriagem(SEM_CLASSIFICAR)).toBeUndefined();
    expect(tipoEscolhidoNaTriagem("outro")).toBeUndefined();
    expect(tipoEscolhidoNaTriagem("poda_de_arvore")).toBeUndefined();
  });

  it("a recusa é reconhecida nas duas formas que as duas pontas produzem", () => {
    /*
      A tela não sabe em qual modo está. A API devolve 409 com
      `erro: "tipo_a_classificar"`, que vira `ErroDaApi.codigo`; o modo de
      demonstração levanta um `Error` com a frase compartilhada. Reconhecer só
      uma delas deixaria a faixa vermelha terminar num beco justamente no modo
      em que o produto é demonstrado.
    */
    const daApi = Object.assign(new Error(MOTIVO_RECLASSIFICAR), {
      codigo: CODIGO_A_CLASSIFICAR,
    });
    expect(recusadoPorFaltaDeClassificacao(daApi)).toBe(true);
    expect(recusadoPorFaltaDeClassificacao(new Error(MOTIVO_RECLASSIFICAR))).toBe(true);

    // E nenhuma outra falha é confundida com esta: um erro de equipe inativa
    // que levasse o link para a triagem mandaria a pessoa ao lugar errado.
    const outroErro = Object.assign(new Error("Essa equipe está desativada."), {
      codigo: "equipe_inativa",
    });
    expect(recusadoPorFaltaDeClassificacao(outroErro)).toBe(false);
    expect(recusadoPorFaltaDeClassificacao(new Error("Falha ao gravar"))).toBe(false);
    expect(recusadoPorFaltaDeClassificacao("tipo_a_classificar")).toBe(false);
    expect(recusadoPorFaltaDeClassificacao(null)).toBe(false);
  });
});

describe("As telas oferecem o caminho", () => {
  it("a abertura varre a lista larga, e não só a taxonomia", () => {
    /*
      Enquanto o seletor varria `TIPOS_COBRADE`, "Outro" existia na API, no
      esquema e no banco, e não existia em lugar nenhum que um operador
      alcançasse.
    */
    expect(NOVA).toContain("TIPOS_DE_ENTRADA.map(");
    expect(
      NOVA.includes("TIPOS_COBRADE.map("),
      "a tela de abertura voltou a varrer só os oito da COBRADE: o operador "
      + "perde a saída e volta a escolher o menos errado",
    ).toBe(false);
  });

  it("a descrição da abertura só aparece com \"Outro\", e é obrigatória", () => {
    expect(NOVA).toContain('id="nova-tipo-descricao"');
    /*
      Campo sempre visível e sempre opcional seria a lixeira de anotação
      paralela que a migração 019 proíbe do lado do banco: lugar livre dentro
      de um registro estruturado, que ninguém lê e que ninguém sabe que existe.
    */
    const bloco = NOVA.slice(
      NOVA.indexOf("{precisaReclassificar(tipo) && ("),
      NOVA.indexOf('id="nova-solicitante"'),
    );
    expect(bloco, "o campo de descrição saiu de dentro da condição de \"Outro\"")
      .toContain('id="nova-tipo-descricao"');
    const abertura = bloco.slice(bloco.indexOf("<Campo"), bloco.indexOf(">", bloco.indexOf("dica=")));
    expect(abertura, "a descrição virou opcional: o banco recusa \"outro\" mudo")
      .not.toMatch(/\sopcional[\s/>]/);
    // O erro do esquema compartilhado chega ao campo certo, e não só à faixa.
    expect(bloco).toContain('erros["tipoDescricao"]');
  });

  it("a triagem tem seletor de tipo e mostra o que o solicitante contou", () => {
    /*
      Sem ver o relato, quem tria classifica no escuro, e o relato desaparece
      da coluna no instante da reclassificação (tipo da COBRADE não guarda
      descrição). Esta é a última tela em que os dois aparecem juntos.
    */
    expect(DETALHE).toContain("opcoesDeTipoNaTriagem(tipoAtual)");
    expect(DETALHE).toContain("tipoEscolhidoNaTriagem(tipo)");
    expect(DETALHE, "a triagem não mostra o relato que motivou o \"Outro\"")
      .toContain("{tipoDescricao ?? ");
    // E o detalhe imprime a coluna, para quem só está lendo o chamado.
    expect(DETALHE).toContain("{o.tipo_descricao ?? ");
  });

  it("a triagem não rebaixa em silêncio o que já foi decidido", () => {
    /*
      A triagem pode rodar duas vezes. Um formulário que abrisse sempre em
      "média, sem vulnerabilidade" apagaria a severidade alta e a vulnerabilidade
      social de um caso já triado, no clique de quem só queria escolher o tipo.
    */
    expect(DETALHE).toContain("useState<Severidade>(severidadeAtual ?? \"media\")");
    expect(DETALHE).toContain("useState(vulnerabilidadeAtual)");
    expect(DETALHE).toContain("useState(vulnerabilidadeDescricaoAtual ?? \"\")");
  });

  it("o despacho recusado termina numa ação, e não num beco", () => {
    expect(DETALHE).toContain("despachoEsperaClassificacao(o.status, o.tipo)");
    expect(DETALHE, "a tela não diz a frase que o servidor diria")
      .toContain("MOTIVO_RECLASSIFICAR");
    expect(DETALHE).toContain("recusadoPorFaltaDeClassificacao(e)");
    /*
      O link leva ao seletor, e o seletor carrega a mesma âncora: as duas
      pontas vêm da mesma constante, então não há como o link apontar para um
      identificador que alguém renomeou.
    */
    expect(DETALHE).toContain("href={`#${ANCORA_DA_CLASSIFICACAO}`}");
    expect(DETALHE).toContain(`id="${ANCORA_DA_CLASSIFICACAO}"`);
  });

  it("a lista e o detalhe não fazem \"Outro\" parecer classificado", () => {
    for (const [arquivo, texto] of [["Ocorrencias.tsx", LISTA], ["Ocorrencia.tsx", DETALHE]] as const) {
      expect(texto, `${arquivo} imprime o tipo sem dizer que ele está pendente`)
        .toContain("<TipoDaOcorrencia tipo=");
    }
  });

  it("a marca de pendência é palavra, e não só cor", () => {
    /*
      A regra da casa: nada se comunica só por cor. O selo pinta, e a palavra
      diz. Sem a palavra, quem lê em tela de sol, quem não distingue as cores e
      quem usa leitor de tela veria uma linha igual às outras.
    */
    const pendente = renderToStaticMarkup(h(TipoDaOcorrencia, { tipo: "outro" }));
    expect(pendente).toContain(ROTULO_TIPO_COBRADE.outro);
    expect(ROTULO_TIPO_COBRADE.outro).toMatch(/classificar/i);
    expect(pendente, "o selo não distingue a linha que espera decisão").toContain("selo");

    // E o tipo já classificado continua texto puro: selo em tudo não marca nada.
    const classificada = renderToStaticMarkup(h(TipoDaOcorrencia, { tipo: "granizo" }));
    expect(classificada).toBe(ROTULO_TIPO_COBRADE.granizo);
  });
});

/**
 * O modo de demonstração, exercitado contra o banco de verdade.
 *
 * Isto NÃO é leitura de fonte: sobe o Postgres em WebAssembly com todas as
 * migrações e o mesmo papel `dc360_app` sem privilégio, e roda o fluxo inteiro
 * pelas mesmas funções que a tela chama. É a única forma de provar que a
 * demonstração recusa o despacho pela regra, e não por acidente de restrição do
 * banco vazando texto de Postgres na frente da prefeitura.
 */
describe("O modo de demonstração se comporta como o servidor", () => {
  let sessao: Sessao;
  let equipeId: string;

  beforeAll(async () => {
    const contas = await local.contasDisponiveis();
    const conta = contas.find((c) => c.papel === "coordenador");
    if (!conta) throw new Error("a semente não tem coordenador");
    sessao = {
      organizacaoId: conta.organizacao_id,
      organizacaoNome: conta.organizacao_nome,
      municipio: conta.municipio,
      uf: conta.uf,
      usuarioId: conta.usuario_id,
      usuarioNome: conta.usuario_nome,
      papel: conta.papel,
    };
    const equipes = await local.listarEquipes(sessao);
    const ativa = equipes.find((e) => e.ativa);
    if (!ativa) throw new Error("a semente não tem equipe ativa");
    equipeId = ativa.id;
  }, 120_000);

  const RELATO = "Árvore de grande porte caída sobre a via, bloqueando a pista";

  async function abrirComoOutro(): Promise<string> {
    return local.abrirOcorrencia(sessao, {
      solicitanteNome: "Moradora da Rua das Palmeiras",
      canalEntrada: "telefone",
      endereco: "Rua das Palmeiras, 120, Centro",
      tipo: "outro",
      tipoDescricao: RELATO,
      descricao: "Ligação relatando que a árvore caiu durante a chuva desta madrugada.",
    });
  }

  it("a abertura grava o relato, e a leitura o devolve", async () => {
    const id = await abrirComoOutro();
    const o = await local.buscarOcorrencia(sessao, id);
    expect(o?.tipo).toBe("outro");
    expect(
      o?.tipo_descricao,
      "o texto que o operador digitou foi descartado em silêncio, e a triagem "
      + "fica sem a matéria prima da decisão que ela existe para tomar",
    ).toBe(RELATO);
  });

  it("tipo da COBRADE não carrega descrição, mesmo se a receber", async () => {
    /*
      A restrição `tipo_da_cobrade_nao_guarda_descricao` recusaria o INSERT. A
      camada de dados descarta o texto antes, porque nesse caso ele não é
      informação do chamado: é anotação paralela sem lugar.
    */
    const id = await local.abrirOcorrencia(sessao, {
      solicitanteNome: "Seu Antônio",
      canalEntrada: "telefone",
      endereco: "Rua do Mirante, 45, Alto da Serra",
      tipo: "vendaval",
      tipoDescricao: "texto que não deveria sobreviver",
      descricao: "Telhado da varanda arrancado pelo vento.",
    });
    const o = await local.buscarOcorrencia(sessao, id);
    expect(o?.tipo_descricao).toBeNull();
  });

  it("o despacho recusa o chamado ainda não classificado, com a frase certa", async () => {
    const id = await abrirComoOutro();
    // Triagem sem escolher o tipo: legítima, e é ela que cria o estado em que
    // o chamado atravessou a triagem e continua "outro".
    await local.classificarNaTriagem(sessao, id, {
      severidade: "alta",
      vulnerabilidadePresente: false,
    });
    expect((await local.buscarOcorrencia(sessao, id))?.tipo).toBe("outro");

    const recusa = await local
      .despacharEquipe(sessao, id, { equipeId, prazoHoras: 24 })
      .then(() => null, (e: unknown) => e);

    expect(recusa, "o modo de demonstração despachou um chamado que o servidor recusa")
      .toBeInstanceOf(Error);
    expect((recusa as Error).message).toBe(MOTIVO_RECLASSIFICAR);
    expect(
      recusadoPorFaltaDeClassificacao(recusa),
      "a tela não reconheceria esta recusa, e mostraria erro genérico sem "
      + "caminho de saída",
    ).toBe(true);

    // E nada foi gravado: o chamado continua onde estava.
    expect((await local.buscarOcorrencia(sessao, id))?.status).toBe("triagem");
  });

  it("a triagem classifica, limpa a descrição e deixa o relato na trilha", async () => {
    const id = await abrirComoOutro();
    await local.classificarNaTriagem(sessao, id, {
      severidade: "media",
      tipo: "vendaval",
      vulnerabilidadePresente: false,
    });

    const o = await local.buscarOcorrencia(sessao, id);
    expect(o?.tipo, "a escolha da triagem foi coletada e jogada fora").toBe("vendaval");
    expect(
      o?.tipo_descricao,
      "a descrição sobreviveu à reclassificação, e a restrição do banco recusaria",
    ).toBeNull();

    /*
      O texto não se perde: a trilha é append-only, e é lá que quem auditar lê
      a decisão técnica ao lado do relato que a motivou. Sem esta cópia, o que
      a pessoa contou ao telefone desapareceria no instante da classificação.
    */
    const trilha = await local.trilhaDaOcorrencia(sessao, id);
    const triagem = trilha.find((e) => e.tipo === "triagem");
    expect(triagem?.detalhe?.["tipoAnterior"]).toBe("outro");
    expect(triagem?.detalhe?.["tipoDescricaoAnterior"]).toBe(RELATO);
    const registro = trilha.find((e) => e.tipo === "registro");
    expect(registro?.detalhe?.["tipoDescricao"]).toBe(RELATO);
  });

  it("classificado, o mesmo chamado passa no despacho", async () => {
    /*
      A outra metade da prova: sem ela, um portão que recusasse SEMPRE passaria
      em todos os testes acima e travaria o produto inteiro.
    */
    const id = await abrirComoOutro();
    await local.classificarNaTriagem(sessao, id, {
      severidade: "alta",
      tipo: "colapso_edificacao",
      vulnerabilidadePresente: false,
    });
    await local.despacharEquipe(sessao, id, { equipeId, prazoHoras: 12 });
    expect((await local.buscarOcorrencia(sessao, id))?.status).toBe("em_campo");
  });
});
