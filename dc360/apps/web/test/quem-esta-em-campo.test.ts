import { beforeAll, describe, expect, it } from "vitest";
import * as local from "../src/dados/local";
import type { Sessao } from "../src/dados/tipos";

/**
 * A tela "Quem está em campo", no MODO LOCAL.
 *
 * =====================================================================
 * POR QUE ESTE ARQUIVO EXISTE
 * =====================================================================
 *
 * O painel roda contra duas implementações da mesma porta, e o caminho que a
 * funcionalidade nova percorre sozinha é conhecido: ela entra pelo `http.ts`,
 * porque é lá que a rota existe, ninguém lembra do `local.ts`, e a
 * DEMONSTRAÇÃO passa a não ter o recurso que acabou de ser vendido.
 *
 * `paridade-dos-modos.test.ts` pega a ausência da função e a divergência de
 * aridade. O que ele NÃO pega é uma função presente, com a assinatura certa, e
 * com SQL que não roda ou que responde outra coisa. Esta tela é justamente onde
 * isso seria mais caro: uma demonstração que prometesse mais do que o produto
 * real entrega, sobre a segurança física de um servidor, é a pior forma
 * possível de errar nisto. Quem assiste decide comprar ouvindo a frase, e quem
 * trabalha descobre a diferença no morro.
 *
 * O banco aqui é o mesmo Postgres em WebAssembly da demonstração, com as mesmas
 * migrações e o mesmo papel `dc360_app` sem privilégio.
 */
describe("Quem está em campo, no modo de demonstração", () => {
  let sessaoDoCoordenador: Sessao;
  let sessaoDoAgente: Sessao;

  beforeAll(async () => {
    const contas = await local.contasDisponiveis();
    const monta = (papel: string): Sessao => {
      const c = contas.find((x) => x.papel === papel);
      if (!c) throw new Error(`a semente não tem ${papel}`);
      return {
        organizacaoId: c.organizacao_id,
        organizacaoNome: c.organizacao_nome,
        municipio: c.municipio,
        uf: c.uf,
        usuarioId: c.usuario_id,
        usuarioNome: c.usuario_nome,
        papel: c.papel,
      };
    };
    sessaoDoCoordenador = monta("coordenador");
    sessaoDoAgente = monta("agente_campo");
  }, 120_000);

  it("a consulta roda de verdade contra o banco da aba, e não só compila", async () => {
    const situacao = await local.quemEstaEmCampo(sessaoDoCoordenador);

    /*
      Lista vazia é a resposta correta aqui, e é ela que prova o que interessa:
      a migração 031 aplicou no banco local, a junção com ocorrência, usuário e
      equipe está escrita certo, e o SQL não morre no PGlite. Uma função que
      levantasse exceção passaria pela paridade de aridade sem um arranhão.
    */
    expect(Array.isArray(situacao.itens)).toBe(true);
    expect(situacao.emCampo).toBe(situacao.itens.length);
    expect(situacao.vencidas).toBe(situacao.itens.filter((i) => i.vencida).length);
  });

  it("carrega a frase que diz o que o produto NÃO faz, igual à da API", async () => {
    const situacao = await local.quemEstaEmCampo(sessaoDoCoordenador);

    /*
      O número sozinho pareceria um painel de monitoramento, e este produto não
      monitora ninguém: ele mostra o que foi declarado. A frase precisa ser a
      MESMA nos dois modos, senão a demonstração promete uma coisa e o produto
      entrega outra.
    */
    expect(situacao.limite).toContain("não detecta queda");
    expect(situacao.limite).toContain("não sabe onde a pessoa está agora");
    expect(situacao.limite).toContain("não aciona ninguém sozinho");
  });

  it("o agente de campo não alcança a lista do município", async () => {
    /*
      Menor privilégio, como no resto do sistema: o agente declara a PRÓPRIA
      saída pelo aplicativo, e a lista de quem está no morro é trabalho de quem
      fica na base. E a recusa é da camada de dados, não da tela: esconder o
      item do menu não impede nada de quem tem o console do navegador aberto.
    */
    await expect(local.quemEstaEmCampo(sessaoDoAgente)).rejects.toThrow();
  });

  it("encerrar uma saída que não existe recusa, em vez de gravar no vazio", async () => {
    await expect(local.encerrarSaidaEmCampo(sessaoDoCoordenador, {
      saidaId: "00000000-0000-4000-8000-000000000000",
      desfecho: "retorno_a_base",
    })).rejects.toThrow(/não existe/);
  });
});
