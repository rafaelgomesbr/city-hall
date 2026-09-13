import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { beforeAll, describe, expect, it } from "vitest";
import {
  MOTIVOS_DE_DEVOLUCAO, ROTULO_MOTIVO_DE_DEVOLUCAO, rotuloEventoTrilha,
} from "@dc360/shared";
import {
  ANCORA_DA_COORDENADA, ANCORA_DO_DESPACHO, TIPO_EVENTO_DEVOLUCAO,
  avisoDoPainel, devolucaoEmAberto, lerDevolucao, marcaDaLista,
  porOcorrencia, proximoPasso, rotuloDoMotivo,
  type DevolucaoDaOcorrencia, type EventoDaTrilha,
} from "../src/devolucao";
import * as local from "../src/dados/local";
import type { DevolucaoPendente, Sessao } from "../src/dados/tipos";

/**
 * A devolução de tarefa vista pelo PAINEL.
 *
 * O agente devolve uma tarefa vencida pelo aplicativo; do lado da coordenação
 * sobra uma ocorrência de volta em `triagem`, sem equipe, com o prazo já
 * vencido e um evento na trilha. O defeito que estes casos atacam é o silêncio
 * dessa chegada: sem eles, a ocorrência devolvida vira mais uma linha "Em
 * triagem" no meio das que nunca saíram do prédio, e o único registro do que
 * aconteceu fica no fim de uma linha do tempo que ninguém rola.
 *
 * Os casos de fonte (os que leem os arquivos de tela) existem porque a regra
 * pura pode estar certa e a tela não chamar ninguém: foi exatamente assim que
 * o vínculo de duplicidade e as providências sem resposta ficaram gravados e
 * invisíveis neste produto.
 */

const AQUI = dirname(fileURLToPath(import.meta.url));
const SRC = join(AQUI, "..", "src");

function fonte(...caminho: string[]): string {
  return readFileSync(join(SRC, ...caminho), "utf8");
}

const QUANDO = "2026-09-13T10:00:00.000Z";

function evento(parcial: Partial<EventoDaTrilha>): EventoDaTrilha {
  return {
    tipo: TIPO_EVENTO_DEVOLUCAO,
    ocorrido_em: QUANDO,
    ...parcial,
  };
}

/** A devolução como o dossiê (`GET /ocorrencias/:id`) a entrega. */
function doDossie(parcial: Partial<DevolucaoDaOcorrencia> = {}): DevolucaoDaOcorrencia {
  return {
    decidida_em: QUANDO,
    motivo: "endereco_nao_localizado",
    observacao: null,
    observacao_removida_em: null,
    prazo_em: null,
    devolvida_por_nome: "Diego Nakamura Alves",
    ...parcial,
  };
}

function pendente(parcial: Partial<DevolucaoPendente> = {}): DevolucaoPendente {
  return {
    id: "1", protocolo: "000472/2026", endereco: "Avenida Beira Rio, 1180",
    status: "triagem", severidade: "alta", prazo_em: QUANDO,
    devolvida_em: QUANDO, devolvida_por_nome: "Diego Nakamura Alves",
    motivo: "endereco_nao_localizado", tem_observacao: false,
    ...parcial,
  };
}

describe("A devolução que a coordenação precisa enxergar", () => {
  it("a faixa lê o dossiê, e não o detalhe do evento da trilha", () => {
    /*
      O DEFEITO QUE ESTE CASO GUARDA.

      A faixa era remontada inteira a partir do `detalhe` do evento, e o
      servidor deixou de gravar ali a observação de propósito: `trilha_eventos`
      não tem policy de UPDATE nem de DELETE, e o texto que o agente escreve na
      rua ("a moradora pediu para voltar às 18h", "casa com idosa acamada")
      ficaria permanente, fora do alcance do prazo de retenção que o município
      fixa como controlador. Quem carrega o texto é o dossiê, que é a rota que
      registra quem consultou.

      Aqui as duas fontes DISCORDAM de propósito: o evento diz um motivo, o
      dossiê diz outro. Se algum campo voltar a sair do `detalhe`, este caso
      aponta qual.
    */
    const trilha = [
      evento({ tipo: "registro", ocorrido_em: "2026-09-13T06:00:00.000Z" }),
      evento({ tipo: "despacho", ocorrido_em: "2026-09-13T07:00:00.000Z" }),
      evento({ ocorrido_em: QUANDO }),
    ];
    const aberta = devolucaoEmAberto(
      doDossie({
        motivo: "morador_ausente",
        observacao: "Portão fechado, ninguém atendeu em duas tentativas.",
        prazo_em: "2026-09-13T09:00:00.000Z",
      }),
      trilha,
    );

    expect(aberta).toEqual({
      quem: "Diego Nakamura Alves",
      quando: QUANDO,
      motivo: "morador_ausente",
      prazoPerdidoEm: "2026-09-13T09:00:00.000Z",
      observacao: {
        estado: "escrita",
        texto: "Portão fechado, ninguém atendeu em duas tentativas.",
      },
    });
  });

  it("distingue observação que não houve de observação descartada no prazo", () => {
    /*
      As duas chegam com `observacao` nula, e as duas frases são diferentes.
      Dizer "sem observação" sobre um texto que existiu, foi lido por quem
      decidiu e foi descartado pela minimização por prazo (migração 029) é
      afirmar fato falso numa tela que acaba anexada a processo administrativo.
      A coluna `observacao_removida_em` existe exatamente para essa diferença.
    */
    expect(devolucaoEmAberto(doDossie(), [])?.observacao)
      .toEqual({ estado: "ausente" });

    expect(
      devolucaoEmAberto(doDossie({ observacao_removida_em: "2026-09-20T03:00:00.000Z" }), [])
        ?.observacao,
    ).toEqual({ estado: "descartada", em: "2026-09-20T03:00:00.000Z" });
  });

  it("o descarte vence o texto, se os dois vierem", () => {
    /*
      Só aconteceria por defeito na minimização, e o desempate é deliberado:
      imprimir a frase seria o painel desfazendo na tela um descarte que o
      município determinou. Errar para o lado de não mostrar não vaza nada.
    */
    const aberta = devolucaoEmAberto(
      doDossie({
        observacao: "Casa com idosa acamada no andar de cima.",
        observacao_removida_em: "2026-09-20T03:00:00.000Z",
      }),
      [],
    );
    expect(aberta?.observacao.estado).toBe("descartada");
    expect(JSON.stringify(aberta)).not.toContain("acamada");
  });

  it("cala quando a coordenação já despachou de novo", () => {
    /*
      O aviso existe para pedir decisão. Depois de tomada, ele vira história, e
      história mora na linha do tempo. Aviso que não sai de cena depois de
      resolvido ensina o coordenador a ignorar avisos, e o próximo que ele
      ignorar será o de vulnerabilidade social.
    */
    const trilha = [
      evento({ ocorrido_em: "2026-09-13T10:00:00.000Z" }),
      evento({ tipo: "despacho", ocorrido_em: "2026-09-13T11:00:00.000Z" }),
    ];
    expect(devolucaoEmAberto(doDossie({ decidida_em: "2026-09-13T10:00:00.000Z" }), trilha))
      .toBeNull();
  });

  it("o despacho ANTERIOR não cala a faixa", () => {
    // O de antes é o que mandou a equipe que voltou de mãos vazias. Se ele
    // calasse o aviso, toda devolução nasceria invisível: não existe tarefa a
    // devolver sem despacho antes.
    const trilha = [evento({ tipo: "despacho", ocorrido_em: "2026-09-13T07:00:00.000Z" })];
    expect(devolucaoEmAberto(doDossie(), trilha)).not.toBeNull();
  });

  it("ocorrência sem devolução nenhuma não inventa uma", () => {
    expect(devolucaoEmAberto(null, [evento({ tipo: "vistoria" })])).toBeNull();
  });

  it("a trilha diz QUE houve observação, e nunca qual foi", () => {
    /*
      O evento carrega `temObservacao`, um booleano, e é só isso que a linha do
      tempo tem para oferecer. Este caso também põe `observacao` no detalhe, que
      é o que um evento antigo pode ter: nem assim o texto sai por aqui, porque
      a tela que o mostra é a do dossiê, que registra a consulta.
    */
    expect(lerDevolucao({
      motivo: "acesso_impedido", temObservacao: true, prazoEm: QUANDO,
      observacao: "Cão solto no terreno, moradora pediu para voltar às 18h.",
      motivoRotulo: "Não consegui acesso ao imóvel", statusAnterior: "em_campo",
      devolucaoId: "11111111-1111-4111-8111-0000000000b2",
    })).toEqual({ motivo: "acesso_impedido", temObservacao: true, prazoPerdidoEm: QUANDO });

    expect(lerDevolucao({ motivo: "morador_ausente" })?.temObservacao).toBe(false);
    expect(lerDevolucao({ temObservacao: true })).toBeNull();
    expect(lerDevolucao(null)).toBeNull();
  });
});

describe("O motivo decide a ação da coordenação", () => {
  it("todo motivo do contrato tem um próximo passo escrito", () => {
    for (const motivo of MOTIVOS_DE_DEVOLUCAO) {
      const passo = proximoPasso(motivo);
      expect(passo.texto.length, `motivo sem próximo passo: ${motivo}`).toBeGreaterThan(10);
      expect(passo.destino.length).toBeGreaterThan(1);
    }
  });

  it("os três motivos que pedem ações diferentes levam a lugares diferentes", () => {
    /*
      É a razão de `MOTIVOS_DE_DEVOLUCAO` ser lista fechada em vez de campo de
      texto: endereço não localizado pede correção de coordenada, morador
      ausente pede reagendamento, e risco para a equipe pede apoio de outro
      órgão. Se os três caíssem no mesmo lugar, a lista fechada não estaria
      pagando o que custa ao agente que digita na chuva.
    */
    const destinos = [
      proximoPasso("endereco_nao_localizado").destino,
      proximoPasso("morador_ausente").destino,
      proximoPasso("risco_para_a_equipe").destino,
    ];
    expect(new Set(destinos).size).toBe(3);
  });

  it("endereço não localizado leva à correção da coordenada", () => {
    expect(proximoPasso("endereco_nao_localizado").destino).toBe(`#${ANCORA_DA_COORDENADA}`);
  });

  it("morador ausente e acesso impedido levam ao despacho", () => {
    expect(proximoPasso("morador_ausente").destino).toBe(`#${ANCORA_DO_DESPACHO}`);
    expect(proximoPasso("acesso_impedido").destino).toBe(`#${ANCORA_DO_DESPACHO}`);
  });

  it("risco para a equipe leva aos contatos dos órgãos", () => {
    // E não à providência: ela só é oferecida depois da vistoria, e mandar o
    // coordenador para um cartão que não está na tela é um beco sem saída.
    expect(proximoPasso("risco_para_a_equipe").destino).toBe("/orgaos");
  });

  it("motivo que esta versão não conhece continua tendo saída", () => {
    const passo = proximoPasso("motivo_que_ainda_nao_existe");
    expect(passo.destino).toBe(`#${ANCORA_DO_DESPACHO}`);
  });
});

describe("Os textos vêm do contrato compartilhado", () => {
  it("o rótulo do motivo é o mesmo que o agente leu no aparelho", () => {
    for (const motivo of MOTIVOS_DE_DEVOLUCAO) {
      expect(rotuloDoMotivo(motivo)).toBe(ROTULO_MOTIVO_DE_DEVOLUCAO[motivo]);
    }
  });

  it("nenhum rótulo de motivo é reescrito no painel", () => {
    /*
      Duas cópias do mesmo texto divergem, e aqui a divergência tem custo de
      telefone: o agente lê uma frase no aparelho e a coordenação lê outra na
      tela, sobre o mesmo caso.
    */
    const arquivos = [
      fonte("devolucao.ts"),
      fonte("paginas", "Ocorrencia.tsx"),
      fonte("paginas", "Painel.tsx"),
      fonte("paginas", "Ocorrencias.tsx"),
    ].join("\n");
    for (const rotulo of Object.values(ROTULO_MOTIVO_DE_DEVOLUCAO)) {
      expect(arquivos, `rótulo copiado para dentro do painel: ${rotulo}`)
        .not.toContain(rotulo);
    }
  });

  it("motivo desconhecido não vira chave crua na tela", () => {
    const dito = rotuloDoMotivo("motivo_que_ainda_nao_existe");
    expect(dito).toContain("não reconhecido");
    expect(dito).toContain("motivo_que_ainda_nao_existe");
  });

  it("o evento da trilha tem rótulo no domínio compartilhado", () => {
    /*
      `ROTULO_EVENTO_TRILHA`, em `packages/shared/src/dominio.ts`, é a fonte
      única desses textos, e a linha do tempo cai na chave crua do banco quando
      ela não conhece um tipo. Este caso é o acordo entre as duas frentes
      escrito como teste: se o rótulo sumir de lá, o coordenador passa a ler
      "devolucao_de_tarefa" na tela em que ele precisa entender o que houve.
    */
    const rotulo = rotuloEventoTrilha(TIPO_EVENTO_DEVOLUCAO);
    expect(
      rotulo,
      "o evento de devolução perdeu o rótulo em `dominio.ts`, e a linha do "
      + "tempo voltou a imprimir a chave do banco.",
    ).not.toBe(TIPO_EVENTO_DEVOLUCAO);
    expect(rotulo.toLowerCase()).toContain("devolvida");
  });

  it("a marca da lista diz o motivo, e a contagem do painel diz o número", () => {
    const marca = marcaDaLista(pendente());
    expect(marca.toLowerCase()).toContain("devolvida do campo");
    expect(marca.toLowerCase()).toContain("endereço");

    expect(avisoDoPainel(1)).toContain("1 ocorrência");
    expect(avisoDoPainel(3)).toContain("3 ocorrências");
  });

  it("a marca avisa que há observação a ler, sem ter o texto para mostrar", () => {
    /*
      A lista não recebe o texto, e não é para receber: ela responde pelo
      município inteiro a cada carregamento de tela, sem registro de consulta, e
      o que o agente escreve na rua nomeia morador e descreve condição de saúde.
      O booleano é o que permite a linha dizer que há o que ler e onde, que é a
      diferença entre "o motivo é este" e "o motivo é este, e o agente explicou".
    */
    const marca = marcaDaLista(pendente({ tem_observacao: true }));
    expect(marca.toLowerCase()).toContain("observação");
    expect(marca.toLowerCase()).toContain("ocorrência");
    expect(marcaDaLista(pendente({ tem_observacao: false })).toLowerCase())
      .not.toContain("observação");
  });

  it("a busca por ocorrência aguenta a lista que não veio", () => {
    // `null` é "não sei", e não "nenhuma": ver o tratamento no painel, onde a
    // consulta pode falhar sem derrubar a fila.
    expect(porOcorrencia(null).size).toBe(0);
  });
});

describe("As telas de fato mostram a devolução", () => {
  const ocorrencia = () => fonte("paginas", "Ocorrencia.tsx");

  it("a tela da ocorrência avisa no alto, e não só na linha do tempo", () => {
    const texto = ocorrencia();
    expect(
      texto,
      "a faixa voltou a ser remontada da trilha. O evento não carrega a "
      + "observação (a trilha é permanente, e o texto precisa poder ser "
      + "descartado no prazo), então a faixa passaria a afirmar para sempre que "
      + "nenhuma devolução teve observação.",
    ).toContain("devolucaoEmAberto(devolucao, trilha)");
    expect(
      texto,
      "a tela não pede a devolução ao dossiê, que é a única fonte com o texto "
      + "livre e a única rota que registra quem consultou.",
    ).toContain("devolucaoDaOcorrencia(sessao, id)");
    expect(
      texto,
      "a ocorrência devolvida precisa de uma faixa no alto da tela. Sem ela, o "
      + "fato mais novo fica no fim de uma lista que ninguém rola.",
    ).toContain("Devolvida do campo sem vistoria.");
  });

  it("o aviso termina numa ação, e a ação leva a um cartão que existe", () => {
    const texto = ocorrencia();
    expect(texto).toContain("<PassoDaDevolucao");
    // As duas âncoras são os envólucros dos cartões de destino. Sem elas o
    // link do aviso rolaria para lugar nenhum.
    expect(texto).toContain("id={ANCORA_DA_COORDENADA}");
    expect(texto).toContain("id={ANCORA_DO_DESPACHO}");
  });

  it("a linha do tempo lê o evento novo em português", () => {
    const texto = ocorrencia();
    /*
      `descreverDetalhe` imprime a chave crua do banco (`motivo:
      risco_para_a_equipe`), e este é justamente o evento que alguém vai reler
      meses depois para entender por que a casa ficou sem vistoria. Por isso ele
      tem leitura própria, com o motivo por extenso, a observação e o prazo que
      se perdeu.
    */
    expect(texto).toContain("DetalheDaDevolucao");
    expect(texto).toContain(`e.tipo === TIPO_EVENTO_DEVOLUCAO`);
    expect(texto).toContain("rotuloDoMotivo(lida.motivo)");
    expect(texto).toContain("Prazo perdido");
  });

  it("a linha do tempo diz que houve observação, sem inventar o texto", () => {
    /*
      O evento não tem o texto e nunca vai ter. Calar sobre ele faria quem
      reler daqui a um ano concluir que o agente não escreveu nada, e imprimir
      qualquer coisa no lugar seria pior. A linha diz que houve e diz onde o
      texto vive, sem prometer que ele ainda está lá: o prazo de retenção do
      município pode tê-lo descartado.
    */
    const texto = ocorrencia();
    expect(texto).toContain("lida.temObservacao");
    expect(
      texto,
      "a linha do tempo voltou a tentar imprimir o texto da observação, que o "
      + "evento não carrega: ela imprimiria vazio para sempre.",
    ).not.toContain("lida.observacao");
    expect(texto).toContain("Com observação do agente");
  });

  it("a faixa separa observação que não houve de observação descartada", () => {
    /*
      Os dois casos chegam com o texto nulo, e um deles não é silêncio: a
      minimização por prazo (migração 029) descarta a frase e marca a data. Dizer
      "sem observação" ali seria afirmar fato falso numa tela que vira prova, e
      contradiria a linha do tempo logo abaixo, que continua dizendo que houve.
    */
    const texto = ocorrencia();
    expect(texto).toContain(`faixaDaDevolucao.observacao.estado === "escrita"`);
    expect(texto).toContain(`faixaDaDevolucao.observacao.estado === "descartada"`);
    expect(texto).toContain("foi descartada");
    expect(texto).toContain("prazo de");
  });

  it("a fila do painel e a lista marcam a linha com ícone e texto", () => {
    for (const tela of ["Painel.tsx", "Ocorrencias.tsx"]) {
      const texto = fonte("paginas", tela);
      expect(texto, `${tela} não busca as devolvidas`).toContain("devolucoesPendentes");
      expect(texto, `${tela} não marca a linha`).toContain("marcaDaLista");
      expect(
        texto,
        `${tela} marca a devolução sem ícone. Estado nunca se comunica só por `
        + "cor neste produto, e texto sozinho na coluna de situação some.",
      ).toContain("IconeVoltar");
    }
  });

  it("a falha da consulta das devolvidas é dita, e não engolida em silêncio", () => {
    /*
      O `catch` continua: a marca é acessória, e derrubar a fila inteira por um
      rótulo embaixo de um selo trocaria a tela que o coordenador abre de manhã
      por uma faixa vermelha. O que não pode continuar é o silêncio. Linha sem
      marca por falha se lê exatamente como "nada voltou do campo", e as duas
      situações pedem decisões opostas: uma não tem devolvida nenhuma, a outra
      tem e a tela não sabe quais.
    */
    for (const tela of ["Painel.tsx", "Ocorrencias.tsx"]) {
      const texto = fonte("paginas", tela);
      expect(
        texto,
        `${tela} engole a falha da consulta das devolvidas sem dizer nada a `
        + "quem lê a tabela.",
      ).toContain("não respondeu agora");
      expect(
        texto,
        `${tela} deixou de explicar por que o \`catch\` existe. Engolir falha `
        + "numa marca acessória pode estar certo, mas precisa estar escrito que "
        + "é decisão, senão fica parecendo resto de andaime.",
      ).toContain("acessória");
    }
  });

  it("o painel não ganhou um sétimo indicador", () => {
    /*
      O teto de indicadores não é estética: um sétimo cartão empurra a fila de
      atendimento para baixo da dobra, e a fila é o motivo de o coordenador
      abrir o painel. A devolução aparece como aviso e como marca na linha.
    */
    const cartoes = fonte("paginas", "Painel.tsx").match(/\{\s*rotulo:\s*"/g) ?? [];
    expect(cartoes.length).toBeLessThanOrEqual(6);
  });
});

describe("Os dois modos do painel", () => {
  it("o modo de demonstração responde a partir da tabela da migração 028", () => {
    const local = fonte("dados", "local.ts");
    expect(local).toContain("export async function devolucoesPendentes");
    expect(
      local,
      "a lista de devolvidas voltou a garimpar o JSON da trilha. A migração "
      + "028 criou a tabela justamente porque lista não sai de texto dentro de "
      + "`jsonb`.",
    ).toContain("FROM devolucoes_de_tarefa");
    /*
      A marcação precisa sair de cena quando a coordenação despacha de novo, e
      quem garante isso é a condição de estado: despachar devolve a ocorrência
      para `em_campo` com equipe.
    */
    expect(local).toMatch(/o\.status = 'triagem' AND o\.equipe_id IS NULL/);
  });

  it("nenhum dos dois modos entrega o texto da observação na LISTA", () => {
    /*
      A lista responde pelo município inteiro a cada carregamento de tela e não
      registra consulta. O texto livre do agente nomeia morador e descreve
      condição de saúde: sai daqui o booleano, e quem precisa ler abre a
      ocorrência. Se os dois modos divergirem nisso, a demonstração ensina uma
      tela que o produto real não tem, que é o defeito de sempre.
    */
    const local = fonte("dados", "local.ts");
    expect(
      local,
      "a lista de devolvidas do modo de demonstração voltou a selecionar o "
      + "texto da observação.",
    ).toContain("(d.observacao IS NOT NULL) AS tem_observacao");
    /*
      A consulta da LISTA, e só ela: o dossiê, logo abaixo no mesmo arquivo,
      seleciona a observação de propósito, porque é ele quem a mostra.
    */
    const consultaDaLista = local
      .slice(local.indexOf("export async function devolucoesPendentes"))
      .split("export async function")[1] ?? "";
    expect(
      consultaDaLista.replace("(d.observacao IS NOT NULL)", ""),
      "a lista de devolvidas do modo de demonstração voltou a selecionar o "
      + "texto livre do agente.",
    ).not.toContain("d.observacao");
  });

  it("o modo com servidor pede a mesma coisa por HTTP", () => {
    const http = fonte("dados", "http.ts");
    expect(http).toContain("export async function devolucoesPendentes");
    expect(http).toContain("/ocorrencias/devolvidas");
  });

  it("os dois modos buscam a devolução da ocorrência, com o texto e a marca de descarte", () => {
    /*
      É a única leitura do produto que entrega a observação, e ela é de uma
      ocorrência por vez, na rota que registra quem consultou. Os dois modos
      precisam prometer a mesma forma, `observacao_removida_em` inclusive: sem
      essa coluna a tela não consegue separar "não houve" de "o município
      descartou no prazo".
    */
    const http = fonte("dados", "http.ts");
    expect(http).toContain("export async function devolucaoDaOcorrencia");
    expect(
      http,
      "a devolução passou a vir de uma rota própria. O dossiê já registra a "
      + "consulta, e uma rota nova de leitura de dado pessoal precisaria "
      + "inventar esse registro de novo.",
    ).toContain("(await detalhe(id)).devolucao");

    const local = fonte("dados", "local.ts");
    expect(local).toContain("export async function devolucaoDaOcorrencia");
    expect(local).toContain("d.observacao_removida_em");
    expect(local).toContain("FROM devolucoes_de_tarefa d");
  });

  it("a demonstração semeia um caso de devolução", () => {
    /*
      A demonstração é peça de venda, e uma ocorrência devolvida com motivo é
      o tipo de caso que faz um coordenador reconhecer o produto como real.
      Semear é o que garante que ele esteja lá no notebook da reunião, e semear
      pelos DOIS caminhos (a tabela e a trilha) é o que faz a demonstração se
      parecer com o que a rota de devolução grava de verdade.
    */
    const semente = fonte("dados", "semente-da-demonstracao.sql");
    expect(
      semente,
      "a semente não escreve na tabela que a lista de devolvidas consulta, "
      + "então o caso semeado não apareceria na fila nem na lista.",
    ).toContain("INSERT INTO devolucoes_de_tarefa");
    expect(
      semente,
      "a semente não escreve o evento da trilha, então a tela da ocorrência "
      + "abriria sem o aviso, que é onde a decisão é pedida.",
    ).toContain(`'${TIPO_EVENTO_DEVOLUCAO}'`);
    /*
      O evento semeado tem que ser o que a rota grava, e a rota NÃO grava a
      observação na trilha: ela é append-only, e o texto ficaria permanente,
      fora do alcance do prazo de retenção do município. Semente com o texto
      dentro do evento daria uma demonstração que ensina o contrário da regra
      que o produto cumpre.
    */
    expect(semente).toContain("'temObservacao', true");
    expect(
      semente,
      "a semente grava a observação dentro do evento da trilha, que é "
      + "exatamente o que a rota deixou de fazer.",
    ).not.toContain("'observacao',");
    // O prazo é semeado vencido: devolver só é possível depois de vencer, e a
    // devolução não reabre prazo nenhum.
    expect(semente).toMatch(/prazo_em = now\(\) - interval/);

    const motivo = /'motivo',\s*'([a-z_]+)'/.exec(semente)?.[1];
    expect(
      MOTIVOS_DE_DEVOLUCAO as readonly string[],
      "a semente usa um motivo que não está no contrato compartilhado.",
    ).toContain(motivo);

    expect(fonte("dados", "banco.ts")).toContain("sementeDaDemonstracao");
  });
});

/**
 * O modo de demonstração, contra o Postgres de verdade.
 *
 * Os casos de fonte acima provam que as telas chamam as coisas certas; estes
 * provam que as coisas certas devolvem o que prometem. A demonstração roda as
 * mesmas migrações, o mesmo RLS e a mesma semente, num PGlite na própria aba, e
 * é ela que vai à reunião com a prefeitura: superfície igual com comportamento
 * diferente é o defeito que faz a demonstração ensinar um fluxo que o produto
 * real não tem.
 *
 * O que estes casos guardam é a REPARTIÇÃO do texto livre entre as três fontes.
 * Ela é invisível em teste de função pura, porque ali os dados são escritos à
 * mão do jeito que se espera que venham.
 */
describe("A devolução na demonstração, contra o banco", () => {
  /** A ocorrência que a semente da demonstração devolve do campo. */
  const DEVOLVIDA = "11111111-1111-4111-8111-0000000000c2";
  let sessao: Sessao;

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
  }, 120_000);

  it("a lista avisa que há observação e não carrega o texto", async () => {
    const itens = await local.devolucoesPendentes(sessao);
    const devolvida = itens.find((i) => i.id === DEVOLVIDA);
    expect(devolvida, "a semente da demonstração perdeu o caso de devolução")
      .toBeDefined();
    expect(devolvida!.tem_observacao).toBe(true);
    expect(
      Object.keys(devolvida!),
      "a lista de devolvidas voltou a trazer o texto livre do agente. Ela "
      + "responde pelo município inteiro a cada carregamento de tela e não "
      + "registra consulta.",
    ).not.toContain("observacao");
    expect(JSON.stringify(itens)).not.toContain("Numeração da avenida");
  });

  it("o dossiê é quem entrega o texto, com a marca de descarte junto", async () => {
    const devolucao = await local.devolucaoDaOcorrencia(sessao, DEVOLVIDA);
    expect(devolucao, "a demonstração não devolve a devolução da ocorrência")
      .not.toBeNull();
    expect(devolucao!.motivo).toBe("endereco_nao_localizado");
    expect(devolucao!.observacao).toContain("1180");
    // Nula, e não ausente: a semente não descarta nada, e é a coluna que
    // permite a tela dizer "descartada" em vez de "não houve".
    expect(devolucao!.observacao_removida_em).toBeNull();
    expect(devolucao!.devolvida_por_nome).toBeTruthy();
  });

  it("o evento da trilha diz que houve, e não diz o quê", async () => {
    const trilha = await local.trilhaDaOcorrencia(sessao, DEVOLVIDA);
    const eventos = trilha.filter((e) => e.tipo === TIPO_EVENTO_DEVOLUCAO);
    expect(eventos.length).toBeGreaterThan(0);
    const detalhe = eventos[eventos.length - 1]!.detalhe;
    expect(detalhe).not.toHaveProperty("observacao");
    expect(lerDevolucao(detalhe)?.temObservacao).toBe(true);
  });

  it("a faixa da demonstração sai completa, com texto, autor e prazo perdido", async () => {
    /*
      O caso que amarra tudo: as duas fontes juntas, do jeito que a tela as usa.
      Ele também é o que pega a diferença de forma entre os modos, porque o
      driver do Postgres devolve `Date` onde o JSON da API devolve texto, e uma
      leitura que só aceitasse texto apagaria o prazo perdido na demonstração.
    */
    const [devolucao, trilha] = await Promise.all([
      local.devolucaoDaOcorrencia(sessao, DEVOLVIDA),
      local.trilhaDaOcorrencia(sessao, DEVOLVIDA),
    ]);
    const faixa = devolucaoEmAberto(devolucao, trilha);
    expect(faixa, "a faixa da ocorrência devolvida sumiu da demonstração").not.toBeNull();
    expect(faixa!.motivo).toBe("endereco_nao_localizado");
    expect(faixa!.quem).toBeTruthy();
    expect(faixa!.observacao.estado).toBe("escrita");
    expect(faixa!.prazoPerdidoEm, "o prazo perdido sumiu da faixa").toBeTruthy();
    expect(Number.isNaN(new Date(faixa!.quando).getTime())).toBe(false);
  });
});
