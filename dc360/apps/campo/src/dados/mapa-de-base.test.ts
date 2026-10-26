import {
  PRECISAO_MINIMA_M, buscarAutorizacaoDoMapa, chaveDoMapaDoBuild,
  decidirModoDoMapa, distanciaEmMetros, distanciaEmTexto,
  esquecerAutorizacaoDoMapa, rotaEsquematica, rumoEmGraus, rumoPorExtenso,
} from "./mapa";

/**
 * O QUE ESTES CASOS PROTEGEM, e nenhum deles é sobre desenho.
 *
 * 1. A COORDENADA SÓ SAI DO APARELHO COM AUTORIZAÇÃO DO MUNICÍPIO.
 *    `docs/SUBPROCESSADORES.md` seção 2.2 promete, por escrito, um modo em que
 *    nada é enviado ao Google. Promessa de documento jurídico sem portão no
 *    código é promessa que a próxima refatoração desfaz em silêncio, e quem
 *    descobre é o encarregado de dados do município, depois de assinado.
 *
 *    A autorização é um BOOLEANO (`mapaAutorizado`, de `GET /configuracao`),
 *    e não a chave do painel. Até 15/09/2026 a decisão comparava a chave que a
 *    API manda (`MAPS_KEY`, a do PAINEL, restrita a sites) com a do binário
 *    (`DC360_MAPS_CHAVE_IOS`, restrita a Apps iOS), e desde que as chaves são
 *    por plataforma (commit `b5afd64`) elas SEMPRE diferem: a tela mandava
 *    "avisar a coordenação para gerar o aplicativo de novo" em toda instalação
 *    certa. O aviso saiu, e o caso "a decisão não compara chave nenhuma"
 *    guarda a saída.
 *
 * 2. AUTORIZAÇÃO SEM CREDENCIAL NÃO VIRA TENTATIVA. Um binário compilado sem
 *    `DC360_MAPS_CHAVE` não tem o SDK do Google dentro, e `PROVIDER_GOOGLE`
 *    cai em silêncio no Apple Maps no iOS: a tela abre, desenha um mapa bonito
 *    com a paleta da Apple, e ninguém recebe erro nenhum. É o pior desfecho de
 *    todos, porque parece certo.
 *
 * 3. FALHA DE REDE NÃO É AUTORIZAÇÃO. O morro sem sinal é o lugar de trabalho
 *    deste aplicativo, e tratar "não consegui perguntar" como "pode mandar"
 *    faria a coordenada sair por causa de um erro de conexão.
 *
 * 4. A DISTÂNCIA E O RUMO PRECISAM ESTAR CERTOS. É o que o plano esquemático
 *    desenha, e é a única informação de localização que o agente tem quando os
 *    ladrilhos não chegam. Errado, ele manda alguém para o lado errado do morro.
 */

jest.mock("expo-constants", () => ({
  __esModule: true,
  default: { expoConfig: { extra: { apiUrl: "https://api.exemplo.test", mapaChaveDoBuild: "chave-do-binario" } } },
}));

/* Dois pontos reais de Florianópolis, a uns 1,1 km um do outro. */
const CENTRO = { latitude: -27.595378, longitude: -48.548050 };
const NORTE_DELE = { latitude: -27.585378, longitude: -48.548050 };

describe("Quem decide se a coordenada vai para o Google", () => {
  it("município que não autorizou é o plano esquemático, e isso é escolha", () => {
    const decisao = decidirModoDoMapa({ mapaAutorizado: false, doBuild: "chave-do-binario" });
    expect(decisao.modo).toBe("esquematico");
    expect(decisao.motivo).toBe("municipio-nao-autorizou");
  });

  it("qualquer coisa que não seja `true` não é autorização", () => {
    /*
      A resposta do servidor é lida de JSON, e JSON traz o que quiser: `"sim"`,
      `1`, `null`. Só o booleano verdadeiro autoriza, porque é o único valor que
      a API escreve de propósito; todo o resto é resposta que não foi pensada
      para esta pergunta, e o lado seguro é não mandar coordenada.
    */
    expect(decidirModoDoMapa({ mapaAutorizado: "sim" as never, doBuild: "c" }).modo).toBe("esquematico");
    expect(decidirModoDoMapa({ mapaAutorizado: 1 as never, doBuild: "c" }).modo).toBe("esquematico");
    expect(decidirModoDoMapa({ mapaAutorizado: undefined as never, doBuild: "c" }).modo).toBe("esquematico");
    expect(decidirModoDoMapa({ mapaAutorizado: null as never, doBuild: "c" }).modo).toBe("esquematico");
  });

  it("município autorizou e o binário não tem o SDK: NÃO tenta o Google", () => {
    /*
      O caso que mais importa deste arquivo. Tentar aqui produziria, no iOS,
      um mapa da Apple desenhado no lugar do nosso, sem erro nenhum, com o
      estilo gerado dos tokens jogado fora. Ninguém descobre um defeito que
      parece certo.
    */
    const decisao = decidirModoDoMapa({ mapaAutorizado: true, doBuild: "" });
    expect(decisao.modo).toBe("esquematico");
    expect(decisao.motivo).toBe("binario-sem-chave");
    expect(decidirModoDoMapa({ mapaAutorizado: true, doBuild: "   " }).motivo).toBe("binario-sem-chave");
  });

  it("com autorização e com credencial, o mapa do Google pode existir", () => {
    const decisao = decidirModoDoMapa({ mapaAutorizado: true, doBuild: "chave-ios" });
    expect(decisao.modo).toBe("google");
    expect(decisao.motivo).toBe("autorizado");
  });

  it("a decisão NÃO compara chave nenhuma, e não existe mais aviso de chave divergente", () => {
    /*
      O aviso que saiu daqui dizia: "a chave de mapa configurada pelo município
      é diferente da que está nesta versão do aplicativo (...) avise a
      coordenação para gerar o aplicativo de novo". Ele nasceu quando a API e o
      binário carregavam a MESMA chave, e comparar as duas descobria quem
      rotacionou `MAPS_KEY` e esqueceu de recompilar.

      Desde o commit `b5afd64` isso deixou de ser verdade por construção: o
      console do Google aceita UM tipo de restrição por chave, então a do
      painel é restrita a sites e a do aplicativo a Apps iOS ou Android. As
      chaves SEMPRE diferem, e o aviso passou a aparecer em toda instalação
      certa, mandando a coordenação refazer um aplicativo que estava certo. Um
      aviso que dispara sempre é um aviso que ninguém lê, e o dia em que ele
      dissesse a verdade ninguém saberia.

      Por isso a decisão recebe a AUTORIZAÇÃO e a CREDENCIAL, e nunca a chave
      do painel: não há mais o que comparar.
    */
    const decisao = decidirModoDoMapa({ mapaAutorizado: true, doBuild: "chave-ios" });
    expect(decisao).not.toHaveProperty("chaveDivergente");
    expect(Object.keys(decisao).sort()).toEqual(["modo", "motivo"]);
  });

  it("o Google que não desenhou ganha de tudo, e derruba para o esquemático", () => {
    const decisao = decidirModoDoMapa({
      mapaAutorizado: true, doBuild: "chave-ios", googleRecusou: true,
    });
    expect(decisao.modo).toBe("esquematico");
    expect(decisao.motivo).toBe("google-recusou");
  });

  it("a chave do binário é lida de `extra`, que é o único lugar onde ela existe", () => {
    expect(chaveDoMapaDoBuild()).toBe("chave-do-binario");
  });
});

describe("A autorização perguntada ao servidor do município", () => {
  beforeEach(() => { esquecerAutorizacaoDoMapa(); });
  afterEach(() => { esquecerAutorizacaoDoMapa(); jest.restoreAllMocks(); });

  function responder(corpo: unknown, ok = true): jest.Mock {
    const falso = jest.fn(async () => ({ ok, json: async () => corpo }));
    (globalThis as { fetch: unknown }).fetch = falso;
    return falso;
  }

  it("pergunta a `/configuracao` com o token, e devolve a AUTORIZAÇÃO, não a chave", async () => {
    /*
      A chave falsa NÃO começa com `AIza`, e isso não é preciosismo: é o portão
      `scripts/portao-do-mapa-do-aplicativo.test.mjs` mordendo este arquivo. Ele
      reprova qualquer coisa com o prefixo de chave do Google em qualquer fonte
      do aplicativo, teste incluído, porque uma chave de verdade escrita num
      teste é uma chave de verdade no repositório do mesmo jeito.

      E a chave que vem junto é IGNORADA de propósito: ela é a do painel,
      restrita a sites, e não serve para nada dentro do aplicativo. O que o
      aplicativo lê é o booleano.
    */
    const chamada = responder({ mapaAutorizado: true, chaveDoMapa: "chave-do-painel" });
    await expect(buscarAutorizacaoDoMapa("tok")).resolves.toBe(true);
    expect(chamada).toHaveBeenCalledWith(
      "https://api.exemplo.test/v1/configuracao",
      expect.objectContaining({
        headers: expect.objectContaining({ authorization: "Bearer tok" }),
      }),
    );
  });

  it("`mapaAutorizado: false` é não, mesmo que venha uma chave junto", async () => {
    responder({ mapaAutorizado: false, chaveDoMapa: "chave-do-painel" });
    await expect(buscarAutorizacaoDoMapa("tok")).resolves.toBe(false);
  });

  it("servidor mais velho, sem o booleano: a chave não vazia do painel ainda vale como sim", async () => {
    /*
      A API e o aplicativo não são atualizados no mesmo instante. Um aplicativo
      novo falando com uma API que ainda responde só `chaveDoMapa` decidiria
      "não autorizado" e derrubaria o mapa de todo município no dia da
      atualização do aplicativo, sem nada na tela explicando. A leitura antiga
      (chave não vazia quer dizer que o município ligou o mapa) continua sendo
      verdade naquela API, então ela vale enquanto o booleano não vier.
    */
    responder({ chaveDoMapa: "chave-do-painel" });
    await expect(buscarAutorizacaoDoMapa("tok")).resolves.toBe(true);
    esquecerAutorizacaoDoMapa();
    responder({ chaveDoMapa: "   " });
    await expect(buscarAutorizacaoDoMapa("tok")).resolves.toBe(false);
  });

  it("pergunta UMA vez por sessão, mesmo com quatro telas pedindo", async () => {
    /*
      A lista de tarefas remonta a cada foco, a cada sinal que volta e a cada
      60 s. Sem a memória, cada remontagem faria uma requisição pelo 3G do
      morro para reler UM campo que não muda durante o dia, gastando bateria e
      a mesma janela de sinal de que a sincronização precisa.
    */
    const chamada = responder({ mapaAutorizado: true, chaveDoMapa: "uma-chave" });
    const quatro = await Promise.all([
      buscarAutorizacaoDoMapa("tok"), buscarAutorizacaoDoMapa("tok"),
      buscarAutorizacaoDoMapa("tok"), buscarAutorizacaoDoMapa("tok"),
    ]);
    expect(quatro).toEqual([true, true, true, true]);
    expect(chamada).toHaveBeenCalledTimes(1);
  });

  it("sem sinal devolve não, e NÃO guarda o fracasso", async () => {
    /*
      Guardar o fracasso faria o aplicativo nunca mais perguntar enquanto
      estivesse aberto: o agente que subiu o morro sem sinal de manhã
      continuaria no plano esquemático à tarde, de volta ao escritório, com
      sinal cheio. É o mesmo cuidado que o `onerror` do painel toma.
    */
    const caiu = jest.fn(async () => { throw new Error("Network request failed"); });
    (globalThis as { fetch: unknown }).fetch = caiu;
    await expect(buscarAutorizacaoDoMapa("tok")).resolves.toBe(false);

    const voltou = responder({ mapaAutorizado: true, chaveDoMapa: "agora-vai" });
    await expect(buscarAutorizacaoDoMapa("tok")).resolves.toBe(true);
    expect(voltou).toHaveBeenCalledTimes(1);
  });

  it("servidor que responde erro não vira autorização", async () => {
    responder({ erro: "nao_autorizado" }, false);
    await expect(buscarAutorizacaoDoMapa("tok")).resolves.toBe(false);
  });

  it("campo ausente na resposta não vira autorização", async () => {
    responder({});
    await expect(buscarAutorizacaoDoMapa("tok")).resolves.toBe(false);
  });
});

describe("Distância e rumo, que é o que o plano esquemático sabe dizer", () => {
  it("mede a distância pela esfera, e não por Pitágoras sobre graus", () => {
    /*
      A conta ingênua trata um grau de latitude e um de longitude como se
      medissem o mesmo. Na latitude de Florianópolis o grau de longitude é
      cerca de 11% mais curto, e é esse o erro que este caso trava: onze por
      cento de uma quadra é a casa errada.
    */
    const leste = { latitude: CENTRO.latitude, longitude: CENTRO.longitude + 0.01 };
    const norte = { latitude: CENTRO.latitude + 0.01, longitude: CENTRO.longitude };

    const paraLeste = distanciaEmMetros(CENTRO, leste);
    const paraNorte = distanciaEmMetros(CENTRO, norte);

    /* Um grau de latitude é ~111,2 km em qualquer lugar. */
    expect(paraNorte).toBeGreaterThan(1100);
    expect(paraNorte).toBeLessThan(1120);
    /* O mesmo décimo de grau em longitude, aqui, mede menos. */
    expect(paraLeste).toBeLessThan(paraNorte * 0.93);
  });

  it("distância de um ponto para ele mesmo é zero, e não NaN", () => {
    // A fórmula tem uma raiz e um arco seno: sem o teto de 1, o lixo de ponto
    // flutuante produz `asin(1.0000000000000002)`, que é NaN.
    expect(distanciaEmMetros(CENTRO, { ...CENTRO })).toBe(0);
  });

  it("o rumo aponta para os quatro lados certos", () => {
    const norte = { latitude: CENTRO.latitude + 0.01, longitude: CENTRO.longitude };
    const sul = { latitude: CENTRO.latitude - 0.01, longitude: CENTRO.longitude };
    const leste = { latitude: CENTRO.latitude, longitude: CENTRO.longitude + 0.01 };
    const oeste = { latitude: CENTRO.latitude, longitude: CENTRO.longitude - 0.01 };

    expect(rumoEmGraus(CENTRO, norte)).toBeCloseTo(0, 1);
    expect(rumoEmGraus(CENTRO, leste)).toBeCloseTo(90, 1);
    expect(rumoEmGraus(CENTRO, sul)).toBeCloseTo(180, 1);
    expect(rumoEmGraus(CENTRO, oeste)).toBeCloseTo(270, 1);
  });

  it("350 graus é norte, e não noroeste", () => {
    /*
      A fatia de cada rumo é CENTRADA nele, e não iniciada nele. Sem isso,
      qualquer rumo um pouco à esquerda do norte sairia como noroeste, e a
      seta na tela discordaria da palavra embaixo dela.
    */
    expect(rumoPorExtenso(350).nome).toBe("norte");
    expect(rumoPorExtenso(10).nome).toBe("norte");
    expect(rumoPorExtenso(0).nome).toBe("norte");
    expect(rumoPorExtenso(45).nome).toBe("nordeste");
    expect(rumoPorExtenso(225).nome).toBe("sudoeste");
  });

  it("rumo negativo ou acima de 360 continua caindo na rosa dos ventos", () => {
    expect(rumoPorExtenso(-90).nome).toBe("oeste");
    expect(rumoPorExtenso(450).nome).toBe("leste");
  });

  it("a distância em texto usa a vírgula do Brasil e não dá falsa precisão", () => {
    expect(distanciaEmTexto(5)).toBe("menos de 20 m");
    expect(distanciaEmTexto(PRECISAO_MINIMA_M)).toBe("20 m");
    expect(distanciaEmTexto(320.4)).toBe("320 m");
    expect(distanciaEmTexto(1423)).toBe("1,4 km");
    expect(distanciaEmTexto(Number.NaN)).toBe("distância desconhecida");
  });

  it("sem GPS a rota é nula, e a tela diz que está procurando", () => {
    expect(rotaEsquematica(null, CENTRO)).toBeNull();
  });

  it("coordenada quebrada não vira rota, para nada apontar para lugar nenhum", () => {
    expect(rotaEsquematica({ latitude: Number.NaN, longitude: 0 }, CENTRO)).toBeNull();
  });

  it("dentro da margem de erro do GPS, não inventa direção", () => {
    /*
      O GPS de celular erra uns cinco metros em céu aberto e bem mais entre
      prédios. Uma seta apontando para um ponto a três metros manda o agente
      andar para algum lado quando a casa pode estar atrás dele.
    */
    const quaseNoMesmoLugar = { latitude: CENTRO.latitude + 0.00005, longitude: CENTRO.longitude };
    const rota = rotaEsquematica(quaseNoMesmoLugar, CENTRO);
    expect(rota?.rumo).toBeNull();
    expect(rota?.frase).toContain("Você está no ponto informado");
  });

  it("com distância de verdade, a frase diz quanto e para que lado", () => {
    const rota = rotaEsquematica(CENTRO, NORTE_DELE);
    expect(rota?.rumo?.nome).toBe("norte");
    expect(rota?.distancia).toBe("1,1 km");
    expect(rota?.frase).toBe("O imóvel fica a 1,1 km a norte de onde você está.");
  });
});
