import type { FastifyInstance } from "fastify";
import type { Config } from "../config.js";

/**
 * O que o painel precisa saber do AMBIENTE em que ele está rodando.
 *
 * O painel é um build estático só, servindo todos os municípios. Tudo o que
 * ele souber em tempo de build, ele sabe igual para todo mundo, e isso está
 * certo para a cor do botão e errado para a chave de mapa que alguém paga. A
 * chave assada no build seria a chave do FORNECEDOR, cobrada no cartão dele,
 * para o uso de todas as prefeituras, porque o Google Maps cobra por
 * carregamento de mapa. Por aqui ela vem de quem serve aquele painel, em
 * tempo de execução, e cada implantação responde com a sua.
 *
 * ESTA ROTA NÃO LÊ O BANCO. Ela não abre transação, não faz `SET LOCAL` e não
 * consulta tabela nenhuma: responde exatamente o mesmo para Serra Alta e para
 * Vale Fundo, porque o que ela devolve é configuração da implantação e não
 * dado de município. É por isso que ela não precisa de contexto de tenant, e é
 * por isso que ela não pode crescer para devolver qualquer coisa que dependa
 * de quem perguntou: no dia em que devolver, precisa passar pelo mesmo
 * caminho de isolamento do resto do produto, e não por este atalho.
 *
 * ELA EXIGE TOKEN, e a razão não é proteger a chave. Chave de navegador do
 * Google é pública por construção: ela viaja no JavaScript da página para
 * qualquer um que abra as ferramentas do desenvolvedor, e quem protege a conta
 * é a restrição por referenciador HTTP no console do Google, não o sigilo.
 * Chamar de segredo o que não é seria teatro, e teatro de segurança faz alguém
 * confiar numa proteção que não existe.
 *
 * O token está aqui por dois motivos honestos:
 *
 * 1. É a REGRA da superfície desta API, não uma exceção. `test/superficie.test.ts`
 *    lê a árvore de rotas do servidor montado e exige token de todas, com uma
 *    lista curta de isenções, cada uma com a razão escrita. Acrescentar um
 *    nome àquela lista é uma decisão de segurança que alguém precisa revisar, e
 *    nenhuma tela que desenha mapa é alcançável sem sessão (a página do mapa
 *    passa por `useSessaoObrigatoria`). Não há exceção a pedir: pedir uma
 *    gastaria revisão de gente para comprar nada.
 *
 * 2. Não servir mais do que o necessário continua valendo mesmo para o que não
 *    é segredo. Sem token, esta rota seria um jeito de qualquer varredura da
 *    internet colher a chave da implantação sem nem visitar o painel. A
 *    restrição por referenciador já recusaria o uso dela em outro endereço,
 *    então o prejuízo seria pequeno; pequeno não é zero, e o custo de evitá-lo
 *    aqui é uma linha.
 *
 * O que ela devolve é UM campo. A configuração da API inteira tem segredo de
 * JWT, credencial de armazenamento, chave do segundo fator e ficha de push:
 * despejar o objeto de configuração aqui, ou qualquer recorte "prático" dele,
 * é como esta rota vira vazamento. Por isso a resposta é montada campo a
 * campo, à mão, e existe teste conferindo que ela tem exatamente as chaves
 * declaradas e nenhuma a mais.
 */
export type ConfiguracaoDoPainel = {
  /**
   * Vazia é resposta legítima, e é o padrão.
   *
   * Sem chave o painel desenha o plano esquemático, com as mesmas coordenadas
   * em escala e sem nenhum contato com o Google. É o que
   * `docs/SUBPROCESSADORES.md` seção 2.2 promete ao município que recusar o
   * envio, e é também o que sobra quando a prefeitura está sem internet. Por
   * isso o campo é string vazia e não `null`: quem consome não precisa de dois
   * jeitos de dizer "não tem".
   */
  chaveDoMapa: string;
};

export async function rotasConfiguracao(
  app: FastifyInstance,
  { config }: { config: Config },
): Promise<void> {
  app.get("/", async (req) => {
    /*
      NÃO passa por `exigirPermissao`, e a ausência é deliberada.

      A tabela de permissões responde "quem classifica na triagem, quem
      despacha equipe, quem encerra ocorrência". Nenhuma dessas perguntas é
      esta: o agente de campo, o operador de plantão, o coordenador e o
      administrador desenham o mesmo mapa, e escolher uma permissão de negócio
      arbitrária aqui deixaria algum papel legítimo com a tela quebrada sem
      nenhum ganho de isolamento.
    */
    await app.exigirAutenticacao(req);

    const resposta: ConfiguracaoDoPainel = {
      chaveDoMapa: config.MAPS_KEY ?? "",
    };
    return resposta;
  });
}
