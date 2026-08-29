import { describe, expect, it } from "vitest";
import { AVISO_MINUTA, minutaEmTexto, montarMinuta, type DadosMinuta } from "@dc360/shared";
import { laudoDeVistoria, type DadosDocumento } from "../src/documentos/laudo.js";

/**
 * O portão que impede a minuta do aparelho de divergir do laudo oficial.
 *
 * A minuta é lida em voz alta para o morador, na porta da casa dele, e é
 * embaixo dela que ele assina dizendo que estava presente. O laudo oficial
 * sai depois, do servidor. Se os dois disserem coisas diferentes, o morador
 * assinou uma versão que ninguém mais vai ler, e a assinatura dele passa a
 * valer para um texto que ele não ouviu.
 *
 * Os dois vão divergir sozinhos, e não por má fé: alguém acrescenta um campo
 * ao laudo, o aplicativo não é tocado, e a diferença nasce em silêncio. Este
 * arquivo torna essa diferença VISÍVEL no momento em que ela é escrita.
 *
 * O portão é de EXCEÇÃO DECLARADA, e não de igualdade. Existem campos que o
 * laudo tem e a minuta não deve ter, e cada um está listado com a razão. A
 * lista é curta de propósito: acrescentar algo a ela é uma decisão sobre o
 * que o morador não vai ouvir.
 */

/**
 * Campos que o laudo oficial imprime e a minuta deliberadamente NÃO mostra.
 *
 * Nada entra aqui por conveniência de implementação. Cada linha responde à
 * pergunta "por que o morador não precisa ouvir isto na porta de casa".
 */
const FORA_DA_MINUTA = new Map<string, string>([
  [
    "Recebida pelo sistema em",
    "no momento da minuta a vistoria ainda não foi sincronizada: este campo "
    + "não existe. Imprimir um horário aqui seria inventar um.",
  ],
  [
    "Registrada no sistema em",
    "mesma razão do anterior: é a outra redação do mesmo campo, escolhida "
    + "pelo laudo conforme a vistoria tenha sido coletada offline ou não.",
  ],
  [
    "Canal de entrada",
    "se o chamado entrou por telefone ou por WhatsApp é dado de gestão. O "
    + "morador na porta de casa não tem o que conferir nisso, e a tela do "
    + "aparelho é pequena.",
  ],
  [
    "Equipe responsável",
    "quem está lendo a minuta em voz alta é a equipe. Ler o próprio nome de "
    + "volta não confere coisa nenhuma.",
  ],
]);

const ORG = {
  nome: "Coordenadoria Municipal de Proteção e Defesa Civil",
  municipio: "Itajubá",
  uf: "MG",
};

const CHECKLIST = [
  { chave: "trinca_estrutural", resposta: true },
  { chave: "risco_iminente", resposta: true },
  { chave: "necessita_interdicao", resposta: true },
];

function dadosDoLaudo(): DadosDocumento {
  return {
    organizacao: ORG,
    ocorrencia: {
      id: "00000000-0000-4000-8000-000000000001",
      protocolo: "000479/2026",
      tipo: "deslizamento",
      severidade: "critica",
      endereco: "Rua das Palmeiras, 340, Bairro Alto",
      latitude: -22.4187,
      longitude: -45.4523,
      solicitante_nome: "Marlene Prado",
      solicitante_contato: "35 99999-0000",
      canal_entrada: "telefone",
      descricao: "Barranco cedeu nos fundos e a parede da cozinha trincou.",
      vulnerabilidade_presente: true,
      vulnerabilidade_descricao: "Idosa acamada e duas crianças na residência.",
      criado_em: "2026-08-20T09:15:00.000Z",
      equipe_nome: "Equipe Alfa",
    },
    vistoria: {
      id: "00000000-0000-4000-8000-000000000002",
      checklist: CHECKLIST,
      gps_precisao_metros: 8,
      assinante_nome: "Marlene Prado",
      observacoes: "Trinca de 3 cm com progressão visível desde a chuva de ontem.",
      coletada_em: "2026-08-20T14:30:00.000Z",
      sincronizada_em: "2026-08-20T18:02:00.000Z",
      agente_nome: "Joana Ribeiro",
      agente_matricula: "DC-2291",
      desalojados: 4,
      desabrigados: 2,
      feridos: 0,
      desaparecidos: null,
      obitos: 0,
    },
    fotos: [],
    emitidoPor: "Coordenação",
    emitidoEm: new Date("2026-08-21T10:00:00.000Z"),
  };
}

function dadosDaMinuta(): DadosMinuta {
  const d = dadosDoLaudo();
  return {
    organizacao: ORG,
    ocorrencia: {
      protocolo: d.ocorrencia.protocolo,
      tipo: d.ocorrencia.tipo,
      severidade: d.ocorrencia.severidade,
      endereco: d.ocorrencia.endereco,
      pontoReferencia: null,
      latitude: d.ocorrencia.latitude,
      longitude: d.ocorrencia.longitude,
      solicitanteNome: d.ocorrencia.solicitante_nome,
      criadoEm: d.ocorrencia.criado_em,
      descricao: d.ocorrencia.descricao,
      vulnerabilidadePresente: d.ocorrencia.vulnerabilidade_presente,
      vulnerabilidadeDescricao: d.ocorrencia.vulnerabilidade_descricao,
    },
    vistoria: {
      checklist: CHECKLIST,
      observacoes: d.vistoria.observacoes,
      assinanteNome: d.vistoria.assinante_nome,
      gpsPrecisaoMetros: d.vistoria.gps_precisao_metros,
      coletadaEm: d.vistoria.coletada_em,
      agenteNome: d.vistoria.agente_nome!,
      agenteMatricula: d.vistoria.agente_matricula!,
      pessoas: {
        desalojados: 4,
        desabrigados: 2,
        feridos: 0,
        // Não contado no laudo é `null`; na minuta, que vem do Zod, é
        // `undefined`. Os dois significam a mesma coisa e os dois documentos
        // precisam imprimir "não informado", nunca zero.
        desaparecidos: undefined,
        obitos: 0,
      },
    },
    quantasFotos: 0,
  };
}

/** Os rótulos que o laudo oficial imprime, lidos do HTML gerado. */
function rotulosDoLaudo(html: string): string[] {
  const encontrados: string[] = [];
  const padrao = /<div class="rotulo">([^<]+)<\/div>/g;
  let m: RegExpExecArray | null;
  while ((m = padrao.exec(html)) !== null) encontrados.push(m[1]!.trim());
  return encontrados;
}

/** Os rótulos que a minuta mostra, com os títulos de seção junto. */
function rotulosDaMinuta(): string[] {
  const m = montarMinuta(dadosDaMinuta());
  const saida: string[] = [];
  for (const s of m.secoes) {
    saida.push(s.titulo);
    if (s.tipo === "campos") for (const l of s.linhas) saida.push(l.rotulo);
  }
  return saida;
}

describe("A minuta do aparelho não diverge do laudo oficial", () => {
  it("lê rótulos do laudo de verdade, e não de um HTML vazio", () => {
    // Âncora: se o formato da folha mudar e a leitura devolver nada, todos os
    // outros casos passariam vazios. Foi assim que dois testes desta suíte
    // passaram sem verificar coisa nenhuma nesta mesma semana.
    const rotulos = rotulosDoLaudo(laudoDeVistoria(dadosDoLaudo()));
    expect(rotulos.length).toBeGreaterThan(10);
    expect(rotulos).toContain("Protocolo");
  });

  it("nenhum comentário de código vaza para dentro do documento", () => {
    /*
      O laudo inteiro é montado com template literal, e sintaxe de comentário
      dentro de um template literal NÃO é comentário: é texto, e sai impresso
      no documento oficial.

      Isto não é hipótese. Ao renomear um campo aqui em cima eu escrevi a
      explicação em forma de comentário dentro do template, e ela teria saído
      no papel timbrado, entre o protocolo e o endereço, num documento que vai
      para processo. O caso que confere os rótulos passou verde, porque ele só
      olha os rótulos.

      A conferência ignora o `<style>`: ali `/*` é comentário de CSS, legítimo
      e desejado. O que não pode existir é no CORPO, que é o que sai no papel.
    */
    const html = laudoDeVistoria(dadosDoLaudo());
    const semEstilo = html.replace(/<style[\s\S]*?<\/style>/g, "");

    const barraAsterisco = String.fromCharCode(47, 42);
    const asteriscoBarra = String.fromCharCode(42, 47);
    for (const marca of [barraAsterisco, asteriscoBarra]) {
      expect(semEstilo, `sintaxe de comentário no corpo do documento: ${marca}`)
        .not.toContain(marca);
    }
  });

  it("todo campo do laudo está na minuta, ou está declarado como fora dela", () => {
    const naMinuta = new Set(rotulosDaMinuta());
    const semExplicacao: string[] = [];

    for (const rotulo of rotulosDoLaudo(laudoDeVistoria(dadosDoLaudo()))) {
      if (naMinuta.has(rotulo)) continue;
      if (FORA_DA_MINUTA.has(rotulo)) continue;

      /*
        Alguns rótulos diferem só na redação entre os dois, e isso é aceito:
        "Tipo (COBRADE)" no papel timbrado e "Tipo" na tela de seis polegadas
        dizem a mesma coisa a públicos diferentes. O que o portão não aceita é
        o CONTEÚDO sumir.
      */
      const equivalente = [...naMinuta].some(
        (n) => rotulo.startsWith(n) || n.startsWith(rotulo)
          || (rotulo.includes("em campo") && n.includes("em campo")),
      );
      if (!equivalente) semExplicacao.push(rotulo);
    }

    expect(
      semExplicacao,
      "o laudo oficial imprime campo que a minuta não mostra. Ou acrescente à "
      + "minuta, ou declare em FORA_DA_MINUTA por que o morador não precisa ouvir",
    ).toEqual([]);
  });

  it("a lista de exceções não tem entrada morta", () => {
    // Exceção que sobra depois de o campo sair do laudo vira permissão
    // pendurada esperando alguém recriar o campo com o mesmo nome.
    const noLaudo = new Set(rotulosDoLaudo(laudoDeVistoria(dadosDoLaudo())));

    /*
      "Recebida pelo sistema em" e "Registrada no sistema em" são as duas
      redações do MESMO campo, e o laudo escolhe uma conforme a vistoria tenha
      sido coletada offline ou não: só uma delas aparece em cada renderização.
      As duas ficam declaradas, e o portão exige que ao menos uma esteja viva.
      Sem esta ressalva, este caso reprovaria sempre.
    */
    const parOffline = ["Recebida pelo sistema em", "Registrada no sistema em"];
    expect(parOffline.some((r) => noLaudo.has(r)), "o par offline sumiu do laudo").toBe(true);

    for (const rotulo of FORA_DA_MINUTA.keys()) {
      if (parOffline.includes(rotulo)) continue;
      expect(noLaudo.has(rotulo), `exceção para campo inexistente: ${rotulo}`).toBe(true);
    }
  });

  it("toda exceção tem razão escrita", () => {
    for (const [rotulo, razao] of FORA_DA_MINUTA) {
      expect(razao.length, `exceção sem razão: ${rotulo}`).toBeGreaterThan(30);
    }
  });

  it("o mesmo checklist produz os mesmos rótulos nos dois", () => {
    const html = laudoDeVistoria(dadosDoLaudo());
    const minuta = montarMinuta(dadosDaMinuta());
    const checklist = minuta.secoes.find((s) => s.tipo === "checklist");
    if (checklist?.tipo !== "checklist") throw new Error("minuta sem checklist");

    for (const item of checklist.itens) {
      // O agente lê "risco iminente" em voz alta; o documento precisa imprimir
      // essas mesmas palavras, senão a conferência não confere nada.
      expect(html, `rótulo ausente no laudo: ${item.rotulo}`).toContain(item.rotulo);
    }
    expect(checklist.itens.length).toBe(CHECKLIST.length);
  });
});

describe("A minuta se declara sem valor de documento", () => {
  it("o aviso aparece, e não existe código de validação", () => {
    const m = montarMinuta(dadosDaMinuta());
    expect(m.aviso).toMatch(/SEM VALOR DE DOCUMENTO/);

    /*
      O laudo oficial imprime "Código de validação". A minuta não pode: ela
      não está registrada em lugar nenhum, então um código ali seria promessa
      de conferência que não existe. É o mesmo defeito que o laudo oficial tem
      hoje (B8 do levantamento), e ele não vai ser copiado para cá enquanto
      não houver rota que valide.
    */
    expect(JSON.stringify(m)).not.toMatch(/[Cc]ódigo de valida/);
  });

  it("o texto para copiar carrega o aviso no começo E no fim", () => {
    // Texto colado em conversa chega cortado. Um trecho sem a marca de minuta
    // circulando como se fosse laudo é o pior desfecho possível desta tela.
    const texto = minutaEmTexto(montarMinuta(dadosDaMinuta()));
    expect(texto.startsWith(`*** ${AVISO_MINUTA} ***`)).toBe(true);
    expect(texto.trimEnd().endsWith(`*** ${AVISO_MINUTA} ***`)).toBe(true);
  });
});
