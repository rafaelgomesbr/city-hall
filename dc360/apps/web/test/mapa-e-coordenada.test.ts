import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import {
  arredondarCoordenada, candidatasDoTextoColado, lerLocalizacaoColada,
} from "../src/paginas/coordenada-colada";
import {
  RECUSA_DA_CHAVE_DO_GOOGLE, aoGoogleRecusarAChave, carregarGoogleMaps, chaveDoGoogleMaps,
  esquecerOuvintesDaRecusa, modoDoMapa, tokenDaSeveridade,
  urlDoCarregadorDoGoogleMaps,
} from "../src/paginas/mapa-de-base";
import { ModoDoMapaDito } from "../src/paginas/Mapa";

/**
 * O MAPA, O MODO SEM CHAVE, E A COORDENADA QUE DÁ PARA CORRIGIR.
 *
 * Três coisas guardadas aqui, e as três nascem do mesmo lugar: o que a tela
 * do coordenador afirma precisa ser verdade.
 *
 * 1. O MODO SEM CHAVE PRECISA EXISTIR E PRECISA SER DITO.
 *    `docs/SUBPROCESSADORES.md` seção 2.2 promete ao município, por escrito,
 *    que existe um modo que desenha as ocorrências sem contato com o Google, e
 *    que "o resto do produto não muda". Promessa em documento jurídico sem
 *    portão no código é promessa que a próxima refatoração desfaz em silêncio,
 *    e quem descobre é o encarregado de dados do município, depois de assinado.
 *
 * 2. GEOCODING E PLACES SÃO PROIBIDAS.
 *    As duas são cobradas por requisição e nenhuma resolve problema que este
 *    produto tenha: a coordenada já está gravada, veio do aparelho do agente
 *    ou do link que o solicitante mandou. Transformar endereço em ponto seria
 *    pagar para reaprender o que já se sabe, mandando o endereço junto, que é
 *    exatamente o dado que a seção 2.3 promete que não sai do Brasil.
 *
 * 3. A COORDENADA COLADA PRECISA SER LIDA COMO ELA CHEGA, E A DÚVIDA PRECISA
 *    SER DITA. O coordenador cola o que recebeu pelo WhatsApp, com a vírgula
 *    decimal do Brasil. E quando o texto admite dois pontos, escolher um
 *    seria o sistema fincando um alfinete numa rua que ninguém indicou.
 */

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), "..", "src");

function arquivosDeFonte(pasta: string): string[] {
  const achados: string[] = [];
  for (const arquivo of readdirSync(pasta)) {
    const caminho = join(pasta, arquivo);
    if (statSync(caminho).isDirectory()) achados.push(...arquivosDeFonte(caminho));
    else if (/\.(tsx|ts)$/.test(arquivo)) achados.push(caminho);
  }
  return achados;
}

function nome(caminho: string): string {
  return relative(RAIZ, caminho).split(sep).join("/");
}

/**
 * A mesma fonte, com comentário e texto de string virando espaço.
 *
 * Sem isto o portão teria o pior incentivo possível: reprovaria o comentário
 * que EXPLICA por que Places e Geocoding estão proibidas, e o jeito de deixar
 * verde seria apagar a explicação. Os textos de tela entram na mesma limpeza
 * porque a legenda de modo precisa poder dizer a palavra "Google" ao
 * coordenador sem que isso conte como chamada ao Google.
 *
 * Cada caractere apagado vira espaço, então posição e número de linha
 * continuam valendo para a fonte original.
 */
function soCodigo(fonte: string): string {
  const saida = [...fonte];
  const apagar = (de: number, ate: number): void => {
    for (let i = de; i < ate && i < saida.length; i++) {
      if (saida[i] !== "\n") saida[i] = " ";
    }
  };

  let i = 0;
  while (i < fonte.length) {
    const c = fonte[i]!;
    const proximo = fonte[i + 1];

    if (c === '"' || c === "'" || c === "`") {
      const inicio = i;
      i++;
      while (i < fonte.length && fonte[i] !== c) {
        if (fonte[i] === "\\") i++;
        i++;
      }
      i++;
      apagar(inicio + 1, i - 1);
      continue;
    }
    if (c === "/" && proximo === "/") {
      const inicio = i;
      while (i < fonte.length && fonte[i] !== "\n") i++;
      apagar(inicio, i);
      continue;
    }
    if (c === "/" && proximo === "*") {
      const inicio = i;
      i += 2;
      while (i < fonte.length && !(fonte[i] === "*" && fonte[i + 1] === "/")) i++;
      i += 2;
      apagar(inicio, i);
      continue;
    }
    i++;
  }
  return saida.join("");
}

/* ============================================================
   1. Geocoding e Places, proibidas
   ============================================================ */

/**
 * O que reprova, e por quê.
 *
 * A lista é de IDENTIFICADOR, não de palavra solta: é assim que a API do
 * Google se chama de dentro do código. Um nome novo do Google que não esteja
 * aqui passa, e é por isso que existe também a regra de superfície declarada
 * (`ApiDoGoogleMaps` em `mapa-de-base.ts`): quem precisar de algo fora dela
 * tem que escrever no arquivo antes de usar, e a revisão vê.
 */
const COBRADAS_E_DESNECESSARIAS: Array<{ nome: string; padrao: RegExp; porque: string }> = [
  {
    nome: "Geocoding",
    padrao: /\bGeocoder\b|\bgeocode\b|maps\/api\/geocode/i,
    porque: "cobrada por requisição, e o produto já tem a coordenada gravada",
  },
  {
    nome: "Places",
    padrao: /\bPlacesService\b|\bAutocompleteService\b|\bSearchBox\b|maps\/api\/place/i,
    porque: "cobrada por requisição, e manda o endereço da família para fora do país",
  },
  {
    nome: "biblioteca extra no carregador",
    padrao: /libraries\s*[=:]/i,
    porque: "é por `libraries=` que `places` entra, e uma vez carregada ela cobra",
  },
];

describe("Nem Geocoding, nem Places, nem biblioteca que as traga", () => {
  it("a varredura enxerga os arquivos de verdade", () => {
    // Sem esta âncora, um caminho errado faria a varredura passar vazia e o
    // portão viraria decoração.
    const arquivos = arquivosDeFonte(RAIZ);
    expect(arquivos.length).toBeGreaterThan(15);
    expect(arquivos.map(nome)).toContain("paginas/mapa-de-base.ts");
    expect(arquivos.map(nome)).toContain("paginas/MapaDoGoogle.tsx");
  });

  it("nenhum arquivo do painel chama as duas APIs cobradas", () => {
    const achados: string[] = [];
    for (const caminho of arquivosDeFonte(RAIZ)) {
      const linhas = soCodigo(readFileSync(caminho, "utf8")).split("\n");
      linhas.forEach((linha, i) => {
        for (const regra of COBRADAS_E_DESNECESSARIAS) {
          if (regra.padrao.test(linha)) {
            achados.push(`${nome(caminho)}:${i + 1} [${regra.nome}] porque: ${regra.porque}`);
          }
        }
      });
    }
    expect(
      achados,
      achados.length === 0 ? "" :
        "o painel passou a chamar API do Google que é cobrada por requisição e "
        + "que ele não precisa. A coordenada já está no banco:\n" + achados.join("\n"),
    ).toEqual([]);
  });

  it("a URL do carregador não pede biblioteca nenhuma", () => {
    const url = new URL(urlDoCarregadorDoGoogleMaps("chave-de-teste"));
    expect(url.origin + url.pathname).toBe("https://maps.googleapis.com/maps/api/js");
    expect(
      url.searchParams.get("libraries"),
      "voltou o `libraries=` no carregador: é por ele que Places entra",
    ).toBeNull();
    expect(url.searchParams.get("key")).toBe("chave-de-teste");
    // O idioma é fixado, senão a mesma tela sai em dois idiomas na mesma sala.
    expect(url.searchParams.get("language")).toBe("pt-BR");
  });

  it("as próprias regras pegam o que deveriam pegar", () => {
    // Prova de que as expressões funcionam, sem depender de o código estar
    // errado para descobrir isso.
    const casos = [
      "const g = new google.maps.Geocoder();",
      "g.geocode({ address: endereco }, pronto);",
      "new google.maps.places.PlacesService(mapa);",
      'script.src = url + "&libraries=places";',
      "fetch(`https://maps.googleapis.com/maps/api/place/details/json`)",
    ];
    for (const caso of casos) {
      expect(
        COBRADAS_E_DESNECESSARIAS.some((r) => r.padrao.test(caso)),
        `nenhuma regra pega: ${caso}`,
      ).toBe(true);
    }
  });

  it("a limpeza apaga comentário e texto, e mais nada", () => {
    const fonte = [
      '// não usamos Geocoder aqui',
      'const aviso = "nada de PlacesService";',
      'const real = new Geocoder();',
    ].join("\n");
    const limpo = soCodigo(fonte);
    expect(limpo.split("\n")[0]).not.toContain("Geocoder");
    expect(limpo.split("\n")[1]).not.toContain("PlacesService");
    expect(limpo.split("\n")[2], "apagou código de verdade").toContain("new Geocoder()");
    expect(limpo.split("\n").length, "a contagem de linhas mudou").toBe(3);
  });
});

/* ============================================================
   2. O modo sem chave
   ============================================================ */

describe("O modo sem chave existe, funciona e é dito na tela", () => {
  it("chave vazia é o modo esquemático, e é assim que o produto está hoje", () => {
    expect(modoDoMapa("")).toBe("esquematico");
    expect(modoDoMapa("   ")).toBe("esquematico");
    expect(chaveDoGoogleMaps("", ""), "espaço em branco não é chave").toBe("");
    expect(chaveDoGoogleMaps(undefined, undefined)).toBe("");
    expect(modoDoMapa(chaveDoGoogleMaps("  AIza-de-mentira  ", ""))).toBe("google");
  });

  it("a chave vem da API, e a variável de build é só a reserva", () => {
    /*
      O DEFEITO QUE ISTO FECHA é de conta a pagar, e não de código quebrado.

      `mapa-de-base.ts` lia a chave de `import.meta.env`, que é tempo de
      BUILD, e o painel é UM build estático servindo TODOS os municípios: a
      chave assada ali seria a chave do FORNECEDOR, cobrada no cartão dele,
      pagando o carregamento de mapa de todas as prefeituras, porque o Google
      cobra por carregamento. Não havia nem onde uma prefeitura pôr a dela, e
      o resultado prático foi a variável ficar vazia na Vercel: o modo com
      chave nunca rodou contra o Google.

      Agora a chave vem de `GET /configuracao` da API daquele município, em
      tempo de execução. A variável de build continua aceita como RESERVA, e
      só para o desenvolvimento e a demonstração não quebrarem, onde não há
      API a quem perguntar.
    */
    expect(
      chaveDoGoogleMaps("", "chave-do-build"),
      "a variável de build deixou de servir de reserva: `npm run dev` e o modo "
      + "de demonstração, que não têm API a quem perguntar, ficaram sem mapa",
    ).toBe("chave-do-build");

    expect(
      chaveDoGoogleMaps("chave-da-api", "chave-do-build"),
      "a variável de BUILD ganhou da chave servida pela API. Isso é o defeito "
      + "de volta: o build é um só para todos os municípios, então o valor "
      + "dali é a chave do fornecedor pagando o mapa de todas as prefeituras",
    ).toBe("chave-da-api");

    // Espaço em branco dos dois lados não é chave de ninguém.
    expect(chaveDoGoogleMaps("   ", "  ")).toBe("");
    expect(chaveDoGoogleMaps("   ", " chave-do-build ")).toBe("chave-do-build");
  });

  it("a tela do mapa pega a chave da API, e não de `import.meta.env`", () => {
    const mapa = readFileSync(join(RAIZ, "paginas", "Mapa.tsx"), "utf8");
    expect(
      mapa,
      "a tela do mapa voltou a ler a variável de build direto. Ela é tempo de "
      + "build, e o painel é um build só para todos os municípios",
    ).not.toContain("import.meta.env");
    expect(
      mapa,
      "a tela precisa pedir a configuração do ambiente à camada de dados: é "
      + "de lá que vem a chave da implantação que paga o mapa",
    ).toContain("useConfiguracaoDoPainel");
    expect(
      mapa,
      "a chave precisa sair da resposta da API, e não de outro lugar",
    ).toContain("chaveDoGoogleMaps(configuracao?.chaveDoMapa)");
  });

  it("o build implantado não carrega chave nenhuma, e isso é o portão", () => {
    /*
      `vercel.json` é o build do painel que vai para todos os municípios. Uma
      chave preenchida ali é, por construção, a chave do FORNECEDOR pagando o
      carregamento de mapa de todas as prefeituras, e ela ainda ganharia de
      nada, porque a reserva só entra quando a API responde vazio. Este portão
      existe para que o atalho ("põe a chave aqui que resolve") não passe sem
      alguém ver.
    */
    const bruto = readFileSync(join(RAIZ, "..", "..", "..", "vercel.json"), "utf8");
    const vercel = JSON.parse(bruto) as { build?: { env?: Record<string, string> } };
    expect(
      vercel.build?.env?.["VITE_GOOGLE_MAPS_CHAVE"],
      "alguém preencheu a chave do mapa no build da Vercel. O painel é um "
      + "build só servindo todos os municípios: a chave dali é a do fornecedor, "
      + "cobrada no cartão dele, pagando o mapa de todas as prefeituras. A "
      + "chave de cada município vai em MAPS_KEY no servidor daquele município",
    ).toBe("");
  });

  it("a recusa da chave pelo Google é tratada, e diz onde se conserta", () => {
    /*
      A falha mais provável na estreia do modo com chave, e a que mais tempo
      faz perder, porque tudo parece certo: a chave existe, o script responde
      200, a API do Google existe e o mapa é construído. A recusa só aparece na
      primeira renderização, pelo console e por `gm_authFailure`. Sem tratar,
      o coordenador fica com a caixa cinza do Google e um aviso em inglês sobre
      chave de desenvolvedor, e nada no produto sabe que aconteceu.
    */
    expect(RECUSA_DA_CHAVE_DO_GOOGLE).toMatch(/referenciador/i);
    expect(RECUSA_DA_CHAVE_DO_GOOGLE).toMatch(/console do Google/i);
    expect(
      RECUSA_DA_CHAVE_DO_GOOGLE,
      "a mensagem precisa dizer que a tela não some: ela volta ao plano "
      + "esquemático com as mesmas ocorrências",
    ).toMatch(/esquem/i);

    const avisados: string[] = [];
    const cancelar = aoGoogleRecusarAChave((motivo) => avisados.push(motivo));

    const janela = globalThis as unknown as { gm_authFailure?: () => void };
    expect(
      typeof janela.gm_authFailure,
      "o gancho global não foi instalado: é o único jeito de o Google avisar "
      + "que recusou a chave, porque o carregamento em si dá certo",
    ).toBe("function");
    janela.gm_authFailure!();
    expect(avisados).toEqual([RECUSA_DA_CHAVE_DO_GOOGLE]);

    cancelar();
    janela.gm_authFailure!();
    expect(avisados, "o ouvinte continuou recebendo depois de cancelado").toHaveLength(1);
    esquecerOuvintesDaRecusa();
  });

  it("a tela do Google devolve a recusa para quem desenha", () => {
    const google = readFileSync(join(RAIZ, "paginas", "MapaDoGoogle.tsx"), "utf8");
    expect(
      google,
      "sem a inscrição, a recusa chega depois do `catch` do carregamento e "
      + "ninguém no produto fica sabendo",
    ).toContain("aoGoogleRecusarAChave");
    const mapa = readFileSync(join(RAIZ, "paginas", "Mapa.tsx"), "utf8");
    expect(
      mapa,
      "a falha do Google precisa derrubar a tela para o plano esquemático, e "
      + "não para o vazio",
    ).toContain("aoFalhar={setFalhaDoGoogle}");
  });

  it("sem chave, nada é pedido ao Google, nem por engano", async () => {
    /*
      O portão que sustenta a promessa da seção 2.2. Se `carregarGoogleMaps`
      um dia tentar carregar o script mesmo sem chave, isto explode antes,
      porque no ambiente de teste não existe `document`: a recusa precisa
      acontecer ANTES de qualquer toque no navegador.
    */
    await expect(carregarGoogleMaps("")).rejects.toThrow(/esquem/i);
    expect(() => urlDoCarregadorDoGoogleMaps("")).toThrow(/coordenada/i);
  });

  it("a tela diz em qual dos dois modos está, com símbolo e com palavra", () => {
    const semChave = renderToStaticMarkup(
      createElement(ModoDoMapaDito, { modo: "esquematico" }),
    );
    expect(
      semChave,
      "o modo sem chave voltou a ser calado: um mapa sem ruas e sem legenda "
      + "é lido como produto quebrado, e produto quebrado é desligado",
    ).toContain("sem chave do Google");
    expect(semChave).toContain("nenhuma coordenada de ocorrência sai deste navegador");
    expect(semChave, "a razão precisa levar a quem decide").toContain("SUBPROCESSADORES");

    const comChave = renderToStaticMarkup(createElement(ModoDoMapaDito, { modo: "google" }));
    expect(
      comChave,
      "com chave, a tela precisa dizer que a coordenada sai daqui: é o que o "
      + "município assinou saber",
    ).toContain("enviada ao Google");
    expect(comChave, "e que cada carregamento é cobrado").toContain("cobrado");

    expect(semChave, "os dois modos estão dizendo a mesma coisa").not.toBe(comChave);
  });

  it("a cor da severidade é a mesma nos dois modos, vinda de um token só", () => {
    /*
      O marcador do Google é desenhado fora do CSS e precisa da cor resolvida;
      o plano esquemático escreve `var(--ds-...)`. Duas listas divergiriam na
      primeira mudança de paleta, e crítica sairia vermelha num município e
      cinza no vizinho.
    */
    for (const severidade of ["critica", "alta", "media", "baixa", null]) {
      expect(tokenDaSeveridade(severidade)).toMatch(/^--ds-/);
    }
    expect(tokenDaSeveridade("critica")).not.toBe(tokenDaSeveridade("baixa"));

    const mapa = readFileSync(join(RAIZ, "paginas", "Mapa.tsx"), "utf8");
    const google = readFileSync(join(RAIZ, "paginas", "MapaDoGoogle.tsx"), "utf8");
    expect(mapa).toContain("tokenDaSeveridade(");
    expect(google).toContain("tokenDaSeveridade(");
  });

  it("o teto de desenho continua dito, nos dois modos", () => {
    // O teto calado já foi defeito real deste produto: o mapa mostrava cem de
    // duzentas e nada na tela dizia que faltava metade da cidade.
    const mapa = readFileSync(join(RAIZ, "paginas", "Mapa.tsx"), "utf8");
    expect(mapa).toMatch(/faltamDesenhar > 0 &&/);
    expect(mapa).toMatch(/semCoordenada > 0 &&/);
    expect(mapa).toMatch(/Desenhando \{desenhados\.length\} de \{total\}/);
    expect(
      mapa,
      "a legenda de modo precisa ficar fora do `if` do modo, senão ela some "
      + "justamente no modo que precisa se explicar",
    ).toContain("<ModoDoMapaDito modo={modo} />");
  });
});

/* ============================================================
   3. A coordenada colada
   ============================================================ */

/** O que o leitor devolveu, em texto, para o caso reprovar dizendo o ponto. */
function comoTexto(texto: string): string {
  const lida = lerLocalizacaoColada(texto);
  if (lida.tipo === "coordenada") return `${lida.coordenada.lat}, ${lida.coordenada.lng}`;
  if (lida.tipo === "invertida") return `invertida ${lida.sugestao.lat}, ${lida.sugestao.lng}`;
  if (lida.tipo === "ambigua") {
    return `ambigua ${lida.leituras.map((c) => `${c.lat}/${c.lng}`).join(" ou ")}`;
  }
  return lida.tipo;
}

describe("A coordenada colada, do jeito que ela chega pelo WhatsApp", () => {
  it("vírgula decimal separada por espaço, que é o padrão brasileiro", () => {
    expect(
      comoTexto("-27,5762 -48,5389"),
      "o operador colou a coordenada no formato do país dele e o produto "
      + "respondeu que não reconheceu",
    ).toBe("-27.5762, -48.5389");
  });

  it("vírgula decimal E vírgula separando o par, as três vírgulas juntas", () => {
    /*
      A armadilha. "-27,5762, -48,5389" tem três vírgulas e nenhuma delas se
      identifica. A regra está escrita por extenso em `candidatasDecimais`: a
      leitura vale se sobrar exatamente um número de cada lado, e um número
      aceita no máximo um separador decimal, sem sinal na parte fracionária.
      As outras duas quebras deixam três números de um lado e morrem sozinhas.
    */
    expect(comoTexto("-27,5762, -48,5389")).toBe("-27.5762, -48.5389");
    expect(comoTexto("-27,5762,-48,5389")).toBe("-27.5762, -48.5389");
    expect(comoTexto("-27,5762; -48,5389")).toBe("-27.5762, -48.5389");
  });

  it("ponto decimal continua funcionando, com e sem espaço", () => {
    expect(comoTexto("-27.5762, -48.5389")).toBe("-27.5762, -48.5389");
    expect(comoTexto("-27.5762 -48.5389")).toBe("-27.5762, -48.5389");
  });

  it("quando o texto admite dois pontos, o painel recusa em vez de escolher", () => {
    /*
      "27,5,48" é ao mesmo tempo (27; 5,48) e (27,5; 48), as duas com o mesmo
      direito. Escolher uma seria fincar o alfinete numa rua que ninguém
      indicou, com a autoridade de quem leu do sistema, e a equipe sairia para
      o endereço errado confiando na tela.
    */
    expect(comoTexto("27,5,48")).toBe("ambigua 27/5.48 ou 27.5/48");
    const lida = lerLocalizacaoColada("27,5,48");
    expect(lida.tipo).toBe("ambigua");
    if (lida.tipo === "ambigua") expect(lida.leituras.length).toBe(2);
  });

  it("com sinal de menos a dúvida não existe, e é o caso brasileiro", () => {
    // Coordenada de município brasileiro tem os dois números negativos, e o
    // sinal já desempata: a recusa acima é a exceção, não a rotina.
    expect(comoTexto("-27,5,-48,5")).toBe("-27.5, -48.5");
  });

  it("grau, minuto e segundo, que é o que o GPS de mão imprime", () => {
    expect(comoTexto(`27°34'34.3"S 48°32'20.0"W`)).toBe("-27.576194, -48.538889");
    expect(comoTexto(`27°34'34.3"S, 48°32'20.0"O`)).toBe("-27.576194, -48.538889");
  });

  it("a letra manda sobre a ordem e sobre o sinal", () => {
    // Longitude escrita primeiro, que alguns formatos do Google Earth fazem.
    expect(comoTexto(`48°32'20.0"W 27°34'34.3"S`)).toBe("-27.576194, -48.538889");
    // Sul escrito duas vezes (sinal e letra) continua sendo sul, não norte.
    expect(comoTexto(`-27°34'34.3"S -48°32'20.0"W`)).toBe("-27.576194, -48.538889");
  });

  it("grau decimal com o símbolo colado", () => {
    expect(comoTexto("-27.5762° -48.5389°")).toBe("-27.5762, -48.5389");
    expect(comoTexto("-27,5762° -48,5389°")).toBe("-27.5762, -48.5389");
  });

  it("link do Google Maps continua funcionando, sem nada ter sido refeito", () => {
    expect(comoTexto("https://www.google.com/maps/@-27.5762,-48.5389,17z"))
      .toBe("-27.5762, -48.5389");
    expect(comoTexto("https://maps.google.com/?q=-27.5762,-48.5389"))
      .toBe("-27.5762, -48.5389");
    expect(comoTexto("geo:-27.5762,-48.5389")).toBe("-27.5762, -48.5389");
  });

  it("link encurtado continua sendo dito, e não vira falha silenciosa", () => {
    /*
      Resolver o encurtado no painel exporia o navegador do coordenador; na
      API, faria dela uma ferramenta de requisição forjada do lado servidor.
      Enquanto essa rota não existe, o certo é a tela dizer, e não errar calada.
    */
    expect(comoTexto("https://maps.app.goo.gl/aBcDeFgHiJk")).toBe("encurtado");
  });

  it("latitude e longitude trocadas continuam sendo apanhadas", () => {
    expect(comoTexto("-48,5389 -27,5762")).toBe("invertida -27.5762, -48.5389");
  });

  it("texto que não é coordenada não vira coordenada", () => {
    expect(comoTexto("Rua das Flores, 300"), "número de casa virou longitude")
      .toBe("nao_reconhecido");
    expect(comoTexto("perto do posto de saude")).toBe("nao_reconhecido");
    expect(comoTexto("-27,5762"), "um número só não é um par").toBe("nao_reconhecido");
    expect(comoTexto("15, 300"), "longitude de 300 graus não existe").toBe("nao_reconhecido");
    expect(comoTexto("")).toBe("vazio");
  });

  it("as candidatas são enumeradas, e não adivinhadas", () => {
    // Olha o degrau de baixo direto: sem isto, um erro na quebra do texto
    // ficaria escondido atrás do julgamento do leitor compartilhado.
    expect(candidatasDoTextoColado("-27,5762, -48,5389"))
      .toEqual([{ lat: -27.5762, lng: -48.5389 }]);
    expect(candidatasDoTextoColado("27,5,48"))
      .toEqual([{ lat: 27, lng: 5.48 }, { lat: 27.5, lng: 48 }]);
    expect(candidatasDoTextoColado("Rua 15, 300")).toEqual([]);
  });
});

/* ============================================================
   4. O teto de seis casas
   ============================================================ */

describe("Seis casas decimais, na tela e no documento", () => {
  it("o que entra com quinze casas é gravado com seis", () => {
    /*
      Quinze casas não são precisão, são o resto binário do `Number` impresso
      na tela. O dado veio de um telefone debaixo de chuva: a sexta casa já é
      cerca de dez centímetros, e a décima quinta convida o coordenador a
      confiar num dígito que nunca mediu nada.
    */
    const lida = lerLocalizacaoColada("-27.576212345678901, -48.538912345678901");
    expect(lida.tipo).toBe("coordenada");
    if (lida.tipo === "coordenada") {
      expect(lida.coordenada).toEqual({ lat: -27.576212, lng: -48.538912 });
    }
    expect(arredondarCoordenada({ lat: -27.5762123456789, lng: -48.5389123456789 }))
      .toEqual({ lat: -27.576212, lng: -48.538912 });
  });

  it("nenhuma tela imprime coordenada com casas próprias", () => {
    /*
      O laudo e a minuta imprimem seis (`laudo.ts`, `minuta.ts`). O painel
      imprimia quatro, em duas telas: onze metros de diferença entre o que o
      coordenador lê e o que o documento assinado diz, para o mesmo ponto. É
      assim que nasce a discussão sobre qual dos dois está certo, dentro de um
      processo.
    */
    /*
      Um arquivo isento, que é onde o teto MORA. Isentar o lugar que aplica a
      regra é diferente de isentar quem a burla: se a regra vazar de lá, ela
      passa a existir em dois lugares, e o segundo é o que envelhece.
    */
    const ONDE_O_TETO_MORA = "paginas/coordenada-colada.ts";

    const achados: string[] = [];
    for (const caminho of arquivosDeFonte(RAIZ)) {
      if (nome(caminho) === ONDE_O_TETO_MORA) continue;
      const linhas = soCodigo(readFileSync(caminho, "utf8")).split("\n");
      linhas.forEach((linha, i) => {
        if (/\b(?:latitude|longitude|lat|lng)\s*\.\s*toFixed\s*\(/.test(linha)) {
          achados.push(`${nome(caminho)}:${i + 1}`);
        }
      });
    }
    expect(
      achados,
      "coordenada formatada à mão numa tela. Use `coordenadaEmTexto` do pacote "
      + "compartilhado, que é o mesmo que o laudo usa:\n" + achados.join("\n"),
    ).toEqual([]);

    for (const tela of ["Mapa.tsx", "Ocorrencia.tsx"]) {
      expect(
        readFileSync(join(RAIZ, "paginas", tela), "utf8"),
        `${tela} deixou de imprimir a coordenada pelo formatador comum`,
      ).toContain("coordenadaEmTexto(");
    }

    // E a isenção continua sendo verdade: o arquivo que a recebe é o que
    // aplica o teto. Uma isenção que deixa de ter razão vira permissão.
    expect(
      readFileSync(join(RAIZ, "paginas", "coordenada-colada.ts"), "utf8"),
    ).toContain("CASAS_DE_COORDENADA = 6");
  });

  it("a regra pega o que deveria pegar", () => {
    const regra = /\b(?:latitude|longitude|lat|lng)\s*\.\s*toFixed\s*\(/;
    expect(regra.test("o.latitude.toFixed(4)")).toBe(true);
    expect(regra.test("`${c.lat.toFixed(6)}`")).toBe(true);
    expect(regra.test("coordenadaEmTexto({ lat: o.latitude, lng: o.longitude })")).toBe(false);
    expect(regra.test("valor.toFixed(2)")).toBe(false);
  });
});
