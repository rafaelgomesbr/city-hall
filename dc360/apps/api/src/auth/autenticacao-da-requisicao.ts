import type { FastifyRequest } from "fastify";
import type { Papel } from "@dc360/shared";
import type { Config } from "../config.js";
import type { Banco } from "../banco/tipos.js";
import { PREFIXO_V1 } from "../versao-v1.js";
import { organizacaoDoAcessoVencido, verificarAcesso } from "./tokens.js";
import { exigirAcessoAtivo } from "./suspensao.js";
import { exigirVigencia, lerVigencia } from "./vigencia.js";
import { conferirManifesto } from "./manifesto.js";

/**
 * A autenticação de CADA requisição, tirada de `servidor.ts` na abertura da API
 * da F03 (parte 1C), para que a vigência em toda requisição (E03), o token
 * enxuto (E02) e o contexto do ator (E07) trabalhem num arquivo que não é o
 * mais disputado do repositório. Na abertura o comportamento era o mesmo de
 * antes, linha por linha; a E03 mudou uma coisa só: a vigência e a suspensão
 * passaram a ser conferidas também na LEITURA (GET e HEAD), numa consulta só.
 *
 * `servidor.ts` reexporta `Identidade`, `NaoAutenticado`, `TrocaDeSenhaObrigatoria`
 * e `ROTAS_ABERTAS_COM_SENHA_PROVISORIA`, para nenhum importador mudar de caminho.
 * `autorizar` fica em `servidor.ts`.
 */

export type Identidade = {
  usuarioId: string;
  organizacaoId: string;
  papel: Papel;
  nome: string;
  sessaoId: string;
};

declare module "fastify" {
  interface FastifyRequest {
    identidade?: Identidade;
  }
  interface FastifyInstance {
    exigirAutenticacao: (req: FastifyRequest) => Promise<Identidade>;
  }
}

/** A requisição não traz token de acesso, ou o token não vale. Vira 401. */
export class NaoAutenticado extends Error {}

/**
 * As rotas que um token de senha provisória abre. Só a troca: `/auth/sair`
 * não exige token de acesso e continua funcionando por isso. Comparado com
 * `req.routeOptions.url`, que é o PADRÃO da rota registrada, e não a URL
 * pedida: não há como forjar um caminho que case.
 */
export const ROTAS_ABERTAS_COM_SENHA_PROVISORIA: ReadonlySet<string> = new Set([
  "/auth/trocar-senha",
  `${PREFIXO_V1}/auth/trocar-senha`,
  /*
    Encerrar as próprias sessões não é ato administrativo, é a mesma família
    de "/auth/sair" (que nem passa por aqui, por não exigir token de acesso):
    retirar o próprio acesso de um aparelho perdido não pode esperar a troca
    de senha, e às vezes é justamente o que a pessoa quer fazer ANTES dela.
  */
  "/auth/encerrar-sessoes",
  `${PREFIXO_V1}/auth/encerrar-sessoes`,
]);

/** A sessão nasceu de senha provisória e só serve para trocá-la. Vira 403. */
export class TrocaDeSenhaObrigatoria extends Error {
  readonly codigo = "troca_de_senha_obrigatoria" as const;
  constructor() {
    super(
      "Você entrou com uma senha provisória. Defina a sua senha em Minha conta " +
        "antes de continuar.",
    );
    this.name = "TrocaDeSenhaObrigatoria";
  }
}

/**
 * Monta a função que extrai e verifica o token de acesso. A organização usada
 * no `SET LOCAL` sai daqui, do token assinado, e de nenhum outro lugar: nunca
 * de cabeçalho, nunca de parâmetro de rota, nunca do corpo da requisição.
 */
export function criarAutenticacaoDaRequisicao(
  banco: Banco,
  config: Config,
): (req: FastifyRequest) => Promise<Identidade> {
  return async (req: FastifyRequest): Promise<Identidade> => {
    const cabecalho = req.headers.authorization;
    if (!cabecalho?.startsWith("Bearer ")) {
      throw new NaoAutenticado("Informe o token de acesso.");
    }
    const token = cabecalho.slice(7);
    /*
      Com o município suspenso, a fila do aparelho recebe 503 e todo o resto
      recebe 403. A marca vem da configuração da rota, e não de uma lista de
      caminhos aqui: ver `ROTA_DA_FILA_DO_CAMPO` e `auth/suspensao.ts`.
    */
    const statusDaSuspensao = req.routeOptions.config.filaDoCampo ? 503 : 403;

    const conteudo = await verificarAcesso(config.jwtSegredos, token);
    if (!conteudo) {
      /*
        Token vencido de município suspenso responde 403, e não 401.

        `organizacaoDoAcessoVencido` só devolve organização de token que ESTE
        servidor assinou, com emissor e plateia certos, e que apenas venceu.
        É a única informação que se extrai de um token vencido, e ela serve
        para uma pergunta só. Sem isto o aparelho de campo de uma prefeitura
        suspensa leria 401 para sempre como "entre de novo". O custo é uma
        consulta só quando a resposta seria 401 de qualquer forma.
      */
      const organizacaoVencida = await organizacaoDoAcessoVencido(config.jwtSegredos, token);
      if (organizacaoVencida) {
        await exigirAcessoAtivo(banco, organizacaoVencida, statusDaSuspensao);
      }
      throw new NaoAutenticado("Token inválido ou expirado.");
    }

    /*
      TODA requisição autenticada confere, numa ida só ao banco, a suspensão do
      município E a vigência de quem pede: conta ativa, papel igual ao do
      token, sessão não encerrada, senha provisória dentro do prazo. GET e HEAD
      incluídos, com o marcador `comEfeito` da rota ou sem ele (V2-F03-E03,
      ADR 0009 decisão 2, dívida DV-35). O argumento da suspensão está em
      `auth/suspensao.ts`; o da vigência, em `auth/vigencia.ts`.

      UMA consulta por requisição, na conexão e no contexto RLS da própria
      organização do token, e SEM cache entre requisições, sem lista de
      revogação e sem chave que a desligue: quem pede um dado de município sob
      um token vivo, sendo conta desativada, sessão encerrada ou município
      suspenso, é recusado no pedido seguinte ao ato, e não quinze minutos
      depois. Rota nova nasce conferida, porque a conferência não depende de a
      rota declarar nada. O varredor `test/vigencia-em-toda-requisicao.test.ts`
      percorre todas as rotas autenticadas do servidor montado.

      Esta conferência esteve ligada só na escrita (V2-F00-E04, 2026-10-06) e
      antes disso desligada desde 17/09/2026 (o commit b4439ac tirou o import e
      as duas chamadas, e o teste ficou em skip). A leitura confiava no token por
      até `ACESSO_MINUTOS` e devolvia dossiê de família (nome, contato,
      vulnerabilidade) a conta já desativada.
    */
    const vigencia = await lerVigencia(banco, conteudo);
    exigirVigencia(vigencia, conteudo, statusDaSuspensao);
    // O banco manda: uma marca no token que o banco já não confirma não
    // tranca ninguém, e um prazo que o banco tem e o token não também vale.
    const senhaProvisoria = vigencia.senhaProvisoriaAte !== null;

    /*
      SENHA PROVISÓRIA (migração 046): enquanto a senha for a sorteada por
      quem administra ou pelo console, a sessão só serve para trocá-la. Toda
      outra rota responde 403 `troca_de_senha_obrigatoria`, e o painel leva à
      troca. Sair não passa por aqui (não exige token de acesso). Em toda
      requisição vale o prazo do banco, e não a marca `sp` do token.
    */
    if (senhaProvisoria && !ROTAS_ABERTAS_COM_SENHA_PROVISORIA.has(req.routeOptions.url ?? "")) {
      throw new TrocaDeSenhaObrigatoria();
    }

    const identidade: Identidade = {
      usuarioId: conteudo.sub,
      organizacaoId: conteudo.org,
      papel: conteudo.papel,
      nome: conteudo.nome,
      sessaoId: conteudo.sid,
    };
    /*
      O manifesto de rota (ação, ator, plateia e escopo, V2-F03-E12) confere
      TODA requisição autenticada, depois de tudo que já recusa e antes de a
      identidade chegar à rota. Hoje não confere nada: a abertura (1C) só põe o
      ponto de extensão no lugar, e provar que ele é chamado é um teste.
    */
    await conferirManifesto(req, identidade);
    req.identidade = identidade;
    return identidade;
  };
}
