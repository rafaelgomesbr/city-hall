import { act, render, screen } from "@testing-library/react-native";

import { esquecerAutorizacaoDoMapa } from "../../dados/mapa";
import { Txt } from "../componentes";
import { useMapaDoMunicipio } from "./useMapaDoMunicipio";

/**
 * A PERGUNTA FEITA UMA VEZ, PARA AS QUATRO TELAS.
 *
 * Quatro telas vão desenhar mapa nesta versão, e a pergunta é a mesma nas
 * quatro: pode a coordenada deste imóvel sair do aparelho? Escrita quatro
 * vezes ela vira quatro respostas, uma delas esquecendo o caso do binário sem
 * chave e outra tratando falha de rede como autorização, e a promessa da
 * seção 2.2 do `SUBPROCESSADORES.md` passa a valer em três telas de quatro.
 *
 * Os dois casos que mais importam aqui são de ESPERA e de AUSÊNCIA DE SESSÃO,
 * porque os dois são fáceis de resolver errado na direção que não avisa.
 */

jest.mock("expo-constants", () => ({
  __esModule: true,
  default: { expoConfig: { extra: { apiUrl: "https://api.exemplo.test", mapaChaveDoBuild: "do-binario" } } },
}));

/**
 * Uma tela mínima que publica o que o gancho respondeu, e guarda os botões
 * dele num lugar de onde o caso consegue apertá-los.
 *
 * Guardar as funções fora do componente é o que permite exercitar
 * `desistirDeEsperar` sem montar tela de verdade. A primeira versão destes
 * casos não fazia isso, e a rodada de reversão pegou: esvaziando o corpo de
 * `desistirDeEsperar`, os quatro casos continuavam verdes. Um gancho com uma
 * porta de saída que não abre é pior que um sem porta, porque a tela mostra o
 * botão.
 */
const ultimo: { desistir?: () => void } = {};

function Sonda({ token }: { token: string | null }) {
  const { decisao, desistirDeEsperar } = useMapaDoMunicipio(token);
  ultimo.desistir = desistirDeEsperar;
  return <Txt>{decisao === null ? "esperando" : `${decisao.modo}:${decisao.motivo}`}</Txt>;
}

async function montar(token: string | null): Promise<void> {
  await act(async () => { await render(<Sonda token={token} />); });
}

beforeEach(() => { esquecerAutorizacaoDoMapa(); delete ultimo.desistir; });
afterEach(() => { esquecerAutorizacaoDoMapa(); });

describe("O gancho do mapa do município", () => {
  it("sem sessão não pergunta a ninguém, e não autoriza nada", async () => {
    /*
      Sem token não há a quem perguntar, e a resposta honesta é a mesma do
      município que não autorizou. O que ela NÃO pode ser é espera: uma tela
      presa em "esperando" para sempre é pior que qualquer um dos dois modos.
    */
    const chamada = jest.fn();
    (globalThis as { fetch: unknown }).fetch = chamada;

    await montar(null);
    expect(screen.getByText("esquematico:municipio-nao-autorizou")).toBeTruthy();
    expect(chamada).not.toHaveBeenCalled();
  });

  it("com sessão e com autorização, chega ao modo Google", async () => {
    /*
      A chave que a API manda é a do PAINEL, e é diferente da do binário de
      propósito (uma é restrita a sites, a outra a Apps iOS). O que decide o
      modo é o booleano `mapaAutorizado`, e o caso escreve as duas chaves
      diferentes para provar que a diferença não pesa em nada.
    */
    (globalThis as { fetch: unknown }).fetch = jest.fn(
      async () => ({ ok: true, json: async () => ({ mapaAutorizado: true, chaveDoMapa: "do-painel" }) }),
    );
    await montar("tok");
    expect(screen.getByText("google:autorizado")).toBeTruthy();
  });

  it("servidor que não responde vira plano esquemático, nunca autorização", async () => {
    (globalThis as { fetch: unknown }).fetch = jest.fn(async () => {
      throw new Error("Network request failed");
    });
    await montar("tok");
    expect(screen.getByText("esquematico:municipio-nao-autorizou")).toBeTruthy();
  });

  it("desistir de esperar sai da espera, e sai para o plano esquemático", async () => {
    /*
      A porta de saída da espera, que o portão de design cobrou. O servidor
      abaixo aceita a conexão e nunca responde, que é o caso ruim de verdade:
      sinal fraco não recusa a conexão, ele engole a requisição. Sem a porta, a
      tela fica na roda até o teto de oito segundos, e num morro com sinal
      oscilando isso basta para o agente concluir que o aplicativo travou.

      A saída é o plano esquemático e não um terceiro estado: quem não quis
      esperar não autorizou nada, então nenhuma coordenada sai do aparelho por
      causa de uma desistência.
    */
    /*
      Relógio falso porque o servidor mudo deixa o cancelador de oito segundos
      pendurado: com o relógio de verdade, o jest termina os casos e avisa que
      não conseguiu sair, e um pacote que não fecha sozinho é o começo de uma
      suíte que alguém mata com Ctrl-C.
    */
    jest.useFakeTimers();
    try {
      (globalThis as { fetch: unknown }).fetch = jest.fn(() => new Promise(() => {}));
      await montar("tok");
      expect(screen.getByText("esperando")).toBeTruthy();

      await act(async () => { ultimo.desistir?.(); });
      expect(screen.getByText("esquematico:municipio-nao-autorizou")).toBeTruthy();
    } finally {
      jest.useRealTimers();
    }
  });

  it("promessa recusada não deixa a tela pendurada na espera", async () => {
    /*
      `buscarAutorizacaoDoMapa` hoje não rejeita: ela devolve vazio em qualquer
      fracasso. Este caso existe para o dia em que alguém mudar aquilo, porque
      uma promessa rejeitada sem tratamento deixaria a tela no estado de espera
      para SEMPRE, que é o único desfecho que este gancho não pode ter. Ele
      falha ANTES da chamada, no próprio `fetch`, que é o caminho mais próximo
      de uma rejeição que o teste consegue produzir sem mexer no módulo de dados.
    */
    (globalThis as { fetch: unknown }).fetch = jest.fn(() => Promise.reject(new Error("caiu")));
    await montar("tok");
    expect(screen.queryByText("esperando")).toBeNull();
  });
});
