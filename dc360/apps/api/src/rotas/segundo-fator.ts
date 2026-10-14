import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";
import type { Papel } from "@dc360/shared";
import type { Banco } from "../banco/tipos.js";
import type { Config } from "../config.js";
import type { ServicoAutenticacao } from "../auth/servico.js";
import type { ServicoSegundoFator } from "../auth/segundo-fator.js";
import { verificarDesafio } from "../auth/tokens.js";
import { NaoAutenticado, RegraDeNegocio } from "../servidor.js";
import { enderecoDoCliente } from "../rede.js";

/**
 * As rotas da verificação em duas etapas: ligar, conferir antes de ligar,
 * desligar, e perguntar como está.
 *
 * TODAS agem sobre a PRÓPRIA conta de quem chamou, e é por isso que aqui não
 * há `exigirPermissao`: não existe ação de permissão para "cuidar da própria
 * credencial", do mesmo jeito que trocar a própria senha e encerrar as
 * próprias sessões não têm. Quem a rota alcança é decidido pelo token, que já
 * diz quem é a pessoa, e não por parâmetro nenhum do pedido: mandar um
 * `usuarioId` no corpo seria criar do zero a rota que desliga o segundo fator
 * do administrador.
 */

const codigoSchema = z.object({
  /*
    Aceita o código de seis dígitos E o código de recuperação no mesmo campo.
    O teto de 64 caracteres cobre o segundo com folga; separar em dois campos
    obrigaria a pessoa a escolher, na tela, qual dos dois ela tem na mão, que é
    a pergunta mais óbvia possível e mesmo assim erra em metade das vezes.
  */
  codigo: z.string().min(1, "Informe o código").max(64),
  /** Presente só quando quem chama ainda não tem sessão. Ver `quemEsta`. */
  desafio: z.string().min(1).max(4096).optional(),
});

const desativacaoSchema = z.object({
  senhaAtual: z.string().min(1, "Informe a sua senha atual").max(200),
});

const inicioSchema = z.object({
  desafio: z.string().min(1).max(4096).optional(),
});

type Opcoes = {
  banco: Banco;
  config: Config;
  autenticacao: ServicoAutenticacao;
  segundoFator: ServicoSegundoFator;
};

type Quem = {
  usuarioId: string;
  organizacaoId: string;
  papel: Papel;
  nome: string;
  /**
   * Chegou por desafio de ativação, ou seja, ainda NÃO tem sessão: é o
   * administrador que o município obriga a ligar o segundo fator antes de
   * entrar. Só nesse caso a confirmação devolve uma sessão.
   */
  viaDesafio: boolean;
  /**
   * A impressão da credencial que o desafio carrega (V2-F00-E07, correção 3).
   * Só existe com `viaDesafio`: a sessão que nasce na confirmação confere que
   * a senha não mudou depois de o desafio sair.
   */
  credencialDoDesafio?: string;
};

export async function rotasSegundoFator(app: FastifyInstance, opcoes: Opcoes): Promise<void> {
  const { banco, config, autenticacao, segundoFator } = opcoes;

  /**
   * Quem está chamando: pelo token de acesso, ou pelo desafio de ativação.
   *
   * Os dois caminhos existem porque a ativação acontece em dois momentos bem
   * diferentes da vida da pessoa. O comum é de dentro do sistema, com sessão
   * aberta, na tela "Minha conta". O outro é o administrador que o município
   * passou a obrigar: ele digitou a senha certa e NÃO recebeu sessão nenhuma,
   * porque dar sessão antes seria a exigência de mentira. O desafio de
   * ativação abre exatamente estas rotas e mais nada, porque a plateia dele é
   * outra (ver `auth/tokens.ts`).
   *
   * A ORDEM importa: o token de acesso é conferido primeiro. Assim, uma tela
   * que mandasse os dois por engano nunca rebaixaria uma sessão legítima a
   * desafio.
   */
  async function quemEsta(req: FastifyRequest, desafio?: string): Promise<Quem> {
    if (req.headers.authorization) {
      const identidade = await app.exigirAutenticacao(req);
      return { ...identidade, viaDesafio: false };
    }

    if (desafio) {
      const conteudo = await verificarDesafio(config.jwtSegredos, desafio);
      /*
        A senha não pode ter mudado depois de o desafio sair (V2-F00-E07,
        correção 3). Sem esta pergunta, quem tinha a senha antiga de um
        administrador obrigado ligava o segundo fator com o aparelho DELE nos
        cinco minutos do desafio, e o administrador de verdade, já com a senha
        nova, passava a ser pedido de um código que não tem. A sessão da
        confirmação confere de novo, sob a trava (`emitirPar`).
      */
      if (
        conteudo && conteudo.pp === "ativacao_do_segundo_fator"
        && await autenticacao.credencialDoDesafioVale(conteudo.org, conteudo.sub, conteudo.cr)
      ) {
        return {
          usuarioId: conteudo.sub,
          organizacaoId: conteudo.org,
          papel: conteudo.papel,
          nome: conteudo.nome,
          viaDesafio: true,
          credencialDoDesafio: conteudo.cr,
        };
      }
      throw new NaoAutenticado(
        "Esta tentativa de entrada expirou. Informe email e senha de novo.",
      );
    }

    throw new NaoAutenticado("Informe o token de acesso.");
  }

  /**
   * O desafio, lido do corpo antes de qualquer validação de esquema.
   *
   * Existe porque a autenticação precisa acontecer ANTES da validação (ver a
   * rota de confirmar), e neste ponto o corpo ainda é o que chegou. Só o campo
   * que decide a autenticação é lido aqui, e ele é conferido por assinatura
   * logo em seguida: um valor torto vira 401, nunca chega perto do banco.
   */
  function desafioDoCorpo(req: FastifyRequest): string | undefined {
    const corpo = req.body as { desafio?: unknown } | undefined;
    return typeof corpo?.desafio === "string" ? corpo.desafio : undefined;
  }

  /** Email e município saem do banco: é o que vai no código QR, e a pessoa não os informa. */
  async function fichaDaConta(
    organizacaoId: string, usuarioId: string,
  ): Promise<{ email: string; municipio: string }> {
    return banco.comTenant(organizacaoId, async (c) => {
      const r = await c.query<{ email: string; municipio: string }>(
        `SELECT u.email, o.municipio
           FROM usuarios u JOIN organizacoes o ON o.id = u.organizacao_id
          WHERE u.id = $1`,
        [usuarioId],
      );
      const linha = r.rows[0];
      if (!linha) throw new RegraDeNegocio("conta_nao_encontrada", "Conta não encontrada.", 404);
      return linha;
    });
  }

  app.get("/", async (req) => {
    const identidade = await app.exigirAutenticacao(req);
    return segundoFator.situacao(identidade);
  });

  /**
   * Começa a ativação: sorteia o segredo e devolve o que a pessoa precisa para
   * cadastrar no aplicativo.
   *
   * DEVOLVE O SEGREDO EM TEXTO, uma vez, e isso é deliberado: sem ele, quem
   * está num computador sem câmera (a recepção da Defesa Civil, invariavelmente)
   * não tem como cadastrar nada. Ele sai daqui e não volta: a partir de agora o
   * banco só tem a versão cifrada, e nenhuma rota lê o segredo de volta.
   *
   * Nada é exigido ainda. O login só muda de comportamento depois da
   * confirmação, e essa metade é o que impede a pessoa de se trancar do lado de
   * fora com o relógio do telefone errado.
   */
  app.post("/iniciar", async (req, resposta) => {
    const quem = await quemEsta(req, desafioDoCorpo(req));
    inicioSchema.parse(req.body ?? {});
    const ficha = await fichaDaConta(quem.organizacaoId, quem.usuarioId);
    const { segredo, uri } = await segundoFator.iniciarAtivacao(
      quem, ficha.email, ficha.municipio,
    );
    return resposta.code(200).send({
      segredo,
      uri,
      mensagem:
        "Leia o código QR no seu aplicativo de autenticação, ou digite o segredo "
        + "à mão. Depois confirme com o código de seis digitos: a verificação só "
        + "passa a valer quando você provar que ele funciona.",
    });
  });

  /**
   * Confirma a ativação com um código de verdade, e SÓ ENTÃO liga.
   *
   * Devolve os códigos de recuperação uma única vez. O banco guarda só o
   * resumo, então nem o servidor consegue mostrá-los de novo, e a tela diz
   * isso.
   */
  app.post("/confirmar", async (req, resposta) => {
    /*
      AUTENTICA ANTES DE VALIDAR, e a ordem não é estética.

      Com a validação primeiro, um pedido sem credencial nenhuma respondia 422
      contando quais campos a rota espera, em vez de 401. É pouco, mas é
      informação de graça para quem está mapeando a API, e o portão
      `test/superficie.test.ts` reprova exatamente isso: ele pergunta a cada
      rota o que ela responde sem token, e "422" não é resposta de rota
      protegida.
    */
    const quem = await quemEsta(req, desafioDoCorpo(req));
    const dados = codigoSchema.parse(req.body);

    const { codigos } = await segundoFator.confirmarAtivacao(quem, dados.codigo);

    /*
      A sessão nasce aqui SÓ para quem chegou pelo desafio de ativação, que é
      quem ainda não tem nenhuma. As duas etapas acabaram de acontecer, na
      ordem certa, nos últimos cinco minutos: mandar digitar a senha de novo
      seria atrito sem ganho de segurança. Mas a senha pode ter mudado nesses
      cinco minutos, e então a sessão não nasce (a impressão da credencial do
      desafio, V2-F00-E07, correção 3).
    */
    const sessao = quem.viaDesafio
      ? await autenticacao.sessaoAposAtivacao(quem.organizacaoId, quem.usuarioId, {
        userAgent: req.headers["user-agent"],
        ip: enderecoDoCliente(req),
      }, quem.credencialDoDesafio ?? "")
      : undefined;

    return resposta.code(200).send({
      codigosDeRecuperacao: codigos,
      ...(sessao ? { sessao } : {}),
      mensagem:
        "Verificação em duas etapas ligada. Guarde os códigos de recuperação em "
        + "lugar seguro: eles não voltam a aparecer, e são a sua única entrada se "
        + "você perder o telefone.",
    });
  });

  /**
   * Desliga, exigindo a senha atual.
   *
   * A senha não é simetria burocrática com a troca de senha: é o único
   * obstáculo que sobra. O cenário é o painel aberto na recepção enquanto a
   * pessoa foi ao banheiro, e sem a senha quem passa desliga a proteção da
   * conta do administrador em dois cliques.
   *
   * Não aceita desafio: quem está desligando já está dentro, por definição.
   */
  app.post("/desativar", async (req, resposta) => {
    const identidade = await app.exigirAutenticacao(req);
    const dados = desativacaoSchema.parse(req.body);
    await segundoFator.desativar(identidade, dados.senhaAtual);
    return resposta.code(200).send({
      mensagem:
        "Verificação em duas etapas desligada. Os códigos de recuperação antigos "
        + "não valem mais.",
    });
  });
}
