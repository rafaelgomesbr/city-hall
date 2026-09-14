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
  it("município sem chave configurada é o plano esquemático, e isso é escolha", () => {
    const decisao = decidirModoDoMapa({ daApi: "", doBuild: "chave-do-binario" });
    expect(decisao.modo).toBe("esquematico");
    expect(decisao.motivo).toBe("municipio-nao-autorizou");
  });

  it("espaço em branco não é autorização", () => {
    expect(decidirModoDoMapa({ daApi: "   ", doBuild: "c" }).modo).toBe("esquematico");
    expect(decidirModoDoMapa({ daApi: undefined, doBuild: "c" }).modo).toBe("esquematico");
    expect(decidirModoDoMapa({ daApi: null, doBuild: "c" }).modo).toBe("esquematico");
  });

  it("município autorizou e o binário não tem o SDK: NÃO tenta o Google", () => {
    /*
      O caso que mais importa deste arquivo. Tentar aqui produziria, no iOS,
      um mapa da Apple desenhado no lugar do nosso, sem erro nenhum, com o
      estilo gerado dos tokens jogado fora. Ninguém descobre um defeito que
      parece certo.
    */
    const decisao = decidirModoDoMapa({ daApi: "chave-do-municipio", doBuild: "" });
    expect(decisao.modo).toBe("esquematico");
    expect(decisao.motivo).toBe("binario-sem-chave");
  });

  it("com autorização e com credencial, o mapa do Google pode existir", () => {
    const decisao = decidirModoDoMapa({ daApi: "a-mesma", doBuild: "a-mesma" });
    expect(decisao.modo).toBe("google");
    expect(decisao.motivo).toBe("autorizado");
    expect(decisao.chaveDivergente).toBe(false);
  });

  it("chave do município diferente da do binário: desenha, e DIZ", () => {
    /*
      Quem o SDK nativo usa é sempre a que está dentro do binário, então o mapa
      continua funcionando e a conta continua caindo na chave antiga. Sem este
      aviso ninguém descobre nunca: não há nada quebrado para investigar.
    */
    const decisao = decidirModoDoMapa({ daApi: "a-nova", doBuild: "a-velha" });
    expect(decisao.modo).toBe("google");
    expect(decisao.chaveDivergente).toBe(true);
  });

  it("o Google que não desenhou ganha de tudo, e derruba para o esquemático", () => {
    const decisao = decidirModoDoMapa({
      daApi: "a-mesma", doBuild: "a-mesma", googleRecusou: true,
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

  it("pergunta a `/configuracao` com o token, e devolve a chave", async () => {
    /*
      A chave falsa NÃO começa com `AIza`, e isso não é preciosismo: é o portão
      `scripts/portao-do-mapa-do-aplicativo.test.mjs` mordendo este arquivo. Ele
      reprova qualquer coisa com o prefixo de chave do Google em qualquer fonte
      do aplicativo, teste incluído, porque uma chave de verdade escrita num
      teste é uma chave de verdade no repositório do mesmo jeito. A primeira
      versão desta linha usava "AIza-de-mentira" e reprovou, que é o portão
      fazendo exatamente o que foi escrito para fazer.
    */
    const chamada = responder({ chaveDoMapa: "  chave-de-mentira  " });
    await expect(buscarAutorizacaoDoMapa("tok")).resolves.toBe("chave-de-mentira");
    expect(chamada).toHaveBeenCalledWith(
      "https://api.exemplo.test/configuracao",
      expect.objectContaining({
        headers: expect.objectContaining({ authorization: "Bearer tok" }),
      }),
    );
  });

  it("pergunta UMA vez por sessão, mesmo com quatro telas pedindo", async () => {
    /*
      A lista de tarefas remonta a cada foco, a cada sinal que volta e a cada
      60 s. Sem a memória, cada remontagem faria uma requisição pelo 3G do
      morro para reler UM campo que não muda durante o dia, gastando bateria e
      a mesma janela de sinal de que a sincronização precisa.
    */
    const chamada = responder({ chaveDoMapa: "uma-chave" });
    const quatro = await Promise.all([
      buscarAutorizacaoDoMapa("tok"), buscarAutorizacaoDoMapa("tok"),
      buscarAutorizacaoDoMapa("tok"), buscarAutorizacaoDoMapa("tok"),
    ]);
    expect(quatro).toEqual(["uma-chave", "uma-chave", "uma-chave", "uma-chave"]);
    expect(chamada).toHaveBeenCalledTimes(1);
  });

  it("sem sinal devolve vazio, e NÃO guarda o fracasso", async () => {
    /*
      Guardar o fracasso faria o aplicativo nunca mais perguntar enquanto
      estivesse aberto: o agente que subiu o morro sem sinal de manhã
      continuaria no plano esquemático à tarde, de volta ao escritório, com
      sinal cheio. É o mesmo cuidado que o `onerror` do painel toma.
    */
    const caiu = jest.fn(async () => { throw new Error("Network request failed"); });
    (globalThis as { fetch: unknown }).fetch = caiu;
    await expect(buscarAutorizacaoDoMapa("tok")).resolves.toBe("");

    const voltou = responder({ chaveDoMapa: "agora-vai" });
    await expect(buscarAutorizacaoDoMapa("tok")).resolves.toBe("agora-vai");
    expect(voltou).toHaveBeenCalledTimes(1);
  });

  it("servidor que responde erro não vira autorização", async () => {
    responder({ erro: "nao_autorizado" }, false);
    await expect(buscarAutorizacaoDoMapa("tok")).resolves.toBe("");
  });

  it("campo ausente na resposta não vira autorização", async () => {
    responder({});
    await expect(buscarAutorizacaoDoMapa("tok")).resolves.toBe("");
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
