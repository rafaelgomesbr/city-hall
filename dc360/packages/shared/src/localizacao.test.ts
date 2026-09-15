import { describe, expect, it } from "vitest";
import { coordenadaEmTexto, lerLocalizacao, linkParaMapa } from "./localizacao.js";

/**
 * Os casos daqui saíram de links reais de compartilhamento, e não de
 * imaginação sobre como o Google formata endereço.
 */

function coord(texto: string) {
  const r = lerLocalizacao(texto);
  if (r.tipo !== "coordenada") throw new Error(`esperava coordenada, veio ${r.tipo}`);
  return r.coordenada;
}

describe("Os formatos que chegam de verdade", () => {
  it("lê o link de compartilhamento do Google Maps", () => {
    expect(coord("https://www.google.com/maps?q=-22.418700,-45.452300"))
      .toEqual({ lat: -22.4187, lng: -45.4523 });
  });

  it("lê o endereço da barra do navegador, com o zoom junto", () => {
    expect(coord("https://www.google.com/maps/@-22.4187,-45.4523,17z"))
      .toEqual({ lat: -22.4187, lng: -45.4523 });
  });

  it("lê o link de lugar, que traz a coordenada no formato interno", () => {
    const c = coord(
      "https://www.google.com/maps/place/Rua+X/@-22.41,-45.45,17z/data=!3m1!4b1!3d-22.4187!4d-45.4523",
    );
    /*
      Este caso prova a ORDEM dos padrões, não só que algum casou.

      O link traz `/@-22.41,-45.45` (o centro do mapa, arredondado) E
      `!3d-22.4187!4d-45.4523` (o ponto exato do lugar). O padrão `/@` vem
      antes na lista, então é ele que responde, e é o certo: o centro do mapa
      é o que o usuário está vendo. Se alguém reordenar a lista, este número
      muda e o teste conta.
    */
    expect(c).toEqual({ lat: -22.41, lng: -45.45 });
  });

  it("lê o `geo:` que o Android gera ao compartilhar localização", () => {
    expect(coord("geo:-22.4187,-45.4523")).toEqual({ lat: -22.4187, lng: -45.4523 });
  });

  it("lê a coordenada colada crua, com e sem espaço", () => {
    expect(coord("-22.4187,-45.4523")).toEqual({ lat: -22.4187, lng: -45.4523 });
    expect(coord("  -22.4187 , -45.4523  ")).toEqual({ lat: -22.4187, lng: -45.4523 });
  });

  it("lê a vírgula escapada, que é como ela chega colada de alguns aplicativos", () => {
    expect(coord("https://maps.google.com/?q=-22.4187%2C-45.4523"))
      .toEqual({ lat: -22.4187, lng: -45.4523 });
  });

  it("lê o link de rota, que carrega o destino em `destination=` ou `daddr=`", () => {
    /*
      É o que o encurtador do Google devolve quando o solicitante compartilhou
      "como chegar" em vez de o lugar. O servidor lê a URL final com ESTE mesmo
      leitor (`apps/api/src/rotas/mapa.ts`), então o formato precisa ser
      entendido aqui, e não numa cópia do lado de lá.
    */
    expect(coord("https://www.google.com/maps/dir/?api=1&destination=-22.4187,-45.4523"))
      .toEqual({ lat: -22.4187, lng: -45.4523 });
    expect(coord("https://www.google.com/maps?daddr=-22.4187,-45.4523"))
      .toEqual({ lat: -22.4187, lng: -45.4523 });
  });
});

describe("O que o campo recusa, e como", () => {
  it("campo vazio é vazio, e não erro", () => {
    expect(lerLocalizacao("").tipo).toBe("vazio");
    expect(lerLocalizacao("   ").tipo).toBe("vazio");
  });

  it("link encurtado é dito como encurtado, e não como não reconhecido", () => {
    /*
      A diferença importa para quem está atendendo: "não reconheci" manda a
      pessoa conferir o que ela colou, e o que ela colou está certo. O que
      falta é o link não carregar a coordenada dentro dele.
    */
    expect(lerLocalizacao("https://maps.app.goo.gl/abc123XYZ").tipo).toBe("encurtado");
    expect(lerLocalizacao("veja aqui https://goo.gl/maps/xyz").tipo).toBe("encurtado");
  });

  it("texto qualquer não vira coordenada", () => {
    expect(lerLocalizacao("Rua das Flores, 100").tipo).toBe("nao_reconhecido");
    expect(lerLocalizacao("perto da padaria").tipo).toBe("nao_reconhecido");
    /*
      Número inteiro sem casa decimal não é coordenada de mapa.

      "22, 45" é muito mais provavelmente "casa 22, lote 45" do que um ponto
      no meio da Bahia, e um grau inteiro tem cerca de 110 km: aceitar isso
      colocaria a família a uma cidade de distância do pino.

      Este caso precisa ficar DENTRO da faixa válida de coordenada para
      provar alguma coisa. "100, 200" não provava: era recusado por 100 estar
      fora dos 90 graus de latitude, então a exigência de casa decimal
      continuava sem teste e uma mutação nela passava despercebida.
    */
    expect(lerLocalizacao("22, 45").tipo).toBe("nao_reconhecido");
    expect(lerLocalizacao("100, 200").tipo).toBe("nao_reconhecido");
  });

  it("latitude e longitude trocadas são detectadas, com a sugestão certa", () => {
    const r = lerLocalizacao("-45.4523,-22.4187");
    if (r.tipo !== "invertida") throw new Error(`esperava invertida, veio ${r.tipo}`);
    expect(r.coordenada).toEqual({ lat: -45.4523, lng: -22.4187 });
    expect(r.sugestao).toEqual({ lat: -22.4187, lng: -45.4523 });
  });

  it("coordenada legítima fora do Brasil é aceita, e não corrigida", () => {
    // Lisboa. Trocar não a traz para o Brasil, então não há o que sugerir, e
    // recusar seria o software achando que sabe mais que a pessoa.
    expect(coord("38.7223,-9.1393")).toEqual({ lat: 38.7223, lng: -9.1393 });
  });

  it("número fora da faixa de coordenada não passa", () => {
    expect(lerLocalizacao("-91.5,-45.4523").tipo).toBe("nao_reconhecido");
    expect(lerLocalizacao("-22.4187,-181.2").tipo).toBe("nao_reconhecido");
  });
});

describe("Nada aqui fala com a rede", () => {
  it("o link do mapa é montado, nunca buscado", () => {
    expect(linkParaMapa({ lat: -22.4187, lng: -45.4523 }))
      .toBe("https://www.google.com/maps?q=-22.4187,-45.4523");
  });

  it("o módulo não contém chamada de rede nenhuma", async () => {
    /*
      Portão, e não observação.

      A tentação de "resolver o encurtado no servidor" vai aparecer, e ela
      significa o servidor da prefeitura contando ao Google onde mora uma
      família em situação de risco. Este caso reprova a primeira linha que
      tentar isso, em vez de deixar a decisão para uma revisão de código que
      pode não acontecer.
    */
    const { readFile } = await import("node:fs/promises");
    const fonte = await readFile(new URL("./localizacao.ts", import.meta.url), "utf8");
    for (const proibido of ["fetch(", "XMLHttpRequest", "axios", "http.get", "navigator."]) {
      expect(fonte, `${proibido} não pode aparecer aqui`).not.toContain(proibido);
    }
  });
});

describe("Como a coordenada aparece na tela", () => {
  it("sempre com seis casas, para não dançar de largura a cada tecla", () => {
    expect(coordenadaEmTexto({ lat: -22.4187, lng: -45.4523 })).toBe("-22.418700, -45.452300");
    expect(coordenadaEmTexto({ lat: -22.418712345, lng: -45.452387654 }))
      .toBe("-22.418712, -45.452388");
  });
});
