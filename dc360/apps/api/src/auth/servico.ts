import type { Papel } from "@dc360/shared";
import type { Config } from "../config.js";
import type { Banco } from "../banco/tipos.js";
import { conferirSenha, gastarTempoEquivalente } from "./senha.js";
import {
  emitirAcesso, gerarTokenRenovacao, hashDoToken, type Identidade,
} from "./tokens.js";
import { derivarSenha } from "./senha.js";
import { encerrarSessoes } from "./sessoes.js";
import { registrarAtoAdministrativo } from "../trilha.js";
import { mensagemDeRecuperacao, type Notificador } from "./notificador.js";

export type Credenciais = { email: string; senha: string };

export type Autenticado = {
  acesso: string;
  renovacao: string;
  expiraEm: number;
  usuario: {
    id: string;
    nome: string;
    /** Sai impressa em todo documento que esta pessoa assina. Ver migração 013. */
    matricula: string;
    papel: Papel;
    organizacaoId: string;
    organizacaoNome: string;
    municipio: string;
    uf: string;
  };
};

export class FalhaAutenticacao extends Error {
  readonly codigo: "credenciais" | "bloqueado" | "inativo" | "sessao";
  constructor(codigo: FalhaAutenticacao["codigo"], mensagem: string) {
    super(mensagem);
    this.name = "FalhaAutenticacao";
    this.codigo = codigo;
  }
}

type LinhaCredencial = {
  usuario_id: string;
  organizacao_id: string;
  nome: string;
  papel: Papel;
  senha_hash: string | null;
  ativo: boolean;
  bloqueado_ate: string | null;
  matricula: string;
  organizacao_nome: string;
  municipio: string;
  uf: string;
};

/**
 * A mesma mensagem para email desconhecido, senha errada e conta desativada.
 *
 * Distinguir seria útil para quem esqueceu a senha e igualmente útil para quem
 * está montando a lista de emails válidos da prefeitura. Como o segundo uso é
 * mais provável num sistema público exposto, a resposta é uniforme, e a
 * recuperação de senha (que ainda não existe) é o canal correto para o
 * primeiro caso.
 */
const MENSAGEM_GENERICA = "Email ou senha inválidos.";

export function servicoDeAutenticacao(
  banco: Banco,
  config: Config,
  notificador: Notificador,
) {
  async function entrar(
    credenciais: Credenciais,
    contexto: { userAgent?: string; ip?: string },
  ): Promise<Autenticado> {
    const linha = await banco.semTenant(async (c) => {
      const r = await c.query<LinhaCredencial>(
        "SELECT * FROM credenciais_para_login($1)",
        [credenciais.email],
      );
      return r.rows[0] ?? null;
    });

    if (!linha) {
      // Gasta o mesmo tempo de uma verificação real: sem isso, a resposta
      // rápida denuncia que o email não existe.
      await gastarTempoEquivalente();
      throw new FalhaAutenticacao("credenciais", MENSAGEM_GENERICA);
    }

    if (linha.bloqueado_ate && new Date(linha.bloqueado_ate) > new Date()) {
      throw new FalhaAutenticacao(
        "bloqueado",
        "Conta temporariamente bloqueada por tentativas seguidas. Tente novamente em alguns minutos.",
      );
    }

    const senhaConfere = await conferirSenha(credenciais.senha, linha.senha_hash);

    if (!senhaConfere || !linha.ativo) {
      await banco.semTenant((c) =>
        c.query("SELECT registrar_tentativa_login($1, false, $2, $3::interval)", [
          linha.usuario_id,
          config.MAX_FALHAS_LOGIN,
          `${config.BLOQUEIO_MINUTOS} minutes`,
        ]),
      );
      throw new FalhaAutenticacao("credenciais", MENSAGEM_GENERICA);
    }

    await banco.semTenant((c) =>
      c.query("SELECT registrar_tentativa_login($1, true, $2, $3::interval)", [
        linha.usuario_id,
        config.MAX_FALHAS_LOGIN,
        `${config.BLOQUEIO_MINUTOS} minutes`,
      ]),
    );

    return emitirPar(linha, contexto);
  }

  async function emitirPar(
    linha: LinhaCredencial,
    contexto: { userAgent?: string; ip?: string },
  ): Promise<Autenticado> {
    const renovacao = gerarTokenRenovacao();

    const sessaoId = await banco.semTenant(async (c) => {
      const r = await c.query<{ abrir_sessao: string }>(
        "SELECT abrir_sessao($1,$2,$3,$4::interval,$5,$6) AS abrir_sessao",
        [
          linha.organizacao_id,
          linha.usuario_id,
          hashDoToken(renovacao),
          `${config.RENOVACAO_DIAS} days`,
          contexto.userAgent ?? null,
          contexto.ip ?? null,
        ],
      );
      return r.rows[0]!.abrir_sessao;
    });

    const acesso = await emitirAcesso(
      // O PRIMEIRO da lista assina. Os demais existem só para verificar, e
      // assinar com um deles ressuscitaria o segredo que está saindo.
      config.jwtSegredos[0],
      {
        sub: linha.usuario_id,
        org: linha.organizacao_id,
        papel: linha.papel,
        nome: linha.nome,
        sid: sessaoId,
      },
      config.ACESSO_MINUTOS,
    );

    return {
      acesso,
      renovacao,
      expiraEm: config.ACESSO_MINUTOS * 60,
      usuario: {
        id: linha.usuario_id,
        nome: linha.nome,
        matricula: linha.matricula,
        papel: linha.papel,
        organizacaoId: linha.organizacao_id,
        organizacaoNome: linha.organizacao_nome,
        municipio: linha.municipio,
        uf: linha.uf,
      },
    };
  }

  /**
   * Renovação com rotação: o token usado é revogado e um novo é emitido.
   *
   * Se chegar um token de renovação que não está mais válido, há duas
   * explicações: expirou naturalmente, ou alguém está reusando um token já
   * gasto. O segundo caso é o sintoma clássico de token roubado, porque o
   * legítimo e o atacante passam a alternar. Como não dá para distinguir, o
   * tratamento é o mais seguro dos dois: derrubar todas as sessões daquele
   * usuário e obrigar a entrar de novo.
   */
  async function renovar(
    tokenRenovacao: string,
    contexto: { userAgent?: string; ip?: string },
  ): Promise<Autenticado> {
    const hash = hashDoToken(tokenRenovacao);

    const sessao = await banco.semTenant(async (c) => {
      const r = await c.query<{
        sessao_id: string; organizacao_id: string; usuario_id: string;
        nome: string; papel: Papel; ativo: boolean;
        matricula: string;
        organizacao_nome: string; municipio: string; uf: string;
      }>("SELECT * FROM sessao_por_token($1)", [hash]);
      return r.rows[0] ?? null;
    });

    if (!sessao) {
      await derrubarSePossivelReuso(hash);
      throw new FalhaAutenticacao("sessao", "Sessão expirada. Entre novamente.");
    }

    if (!sessao.ativo) {
      await banco.semTenant((c) =>
        c.query("SELECT revogar_sessoes_do_usuario($1, $2)", [
          sessao.usuario_id, "usuario desativado",
        ]),
      );
      throw new FalhaAutenticacao("inativo", "Sessão expirada. Entre novamente.");
    }

    await banco.semTenant((c) =>
      c.query("SELECT revogar_sessao($1, $2)", [hash, "rotacionada na renovacao"]),
    );

    return emitirPar(
      {
        usuario_id: sessao.usuario_id,
        organizacao_id: sessao.organizacao_id,
        nome: sessao.nome,
        matricula: sessao.matricula,
        papel: sessao.papel,
        senha_hash: null,
        ativo: true,
        bloqueado_ate: null,
        organizacao_nome: sessao.organizacao_nome,
        municipio: sessao.municipio,
        uf: sessao.uf,
      },
      contexto,
    );
  }

  /**
   * Um token de renovação que já foi rotacionado continua existindo no banco,
   * revogado. Se ele reaparecer, é reúso, e aí a família inteira cai.
   */
  async function derrubarSePossivelReuso(hash: string): Promise<void> {
    // `sessoes` está sob RLS e não é legível sem contexto de tenant, que é
    // exatamente o que ainda não temos aqui. A pergunta passa pela função
    // nomeada da migração 002.
    const dono = await banco.semTenant(async (c) => {
      const r = await c.query<{ dono_do_token: string | null }>(
        "SELECT dono_do_token($1) AS dono_do_token",
        [hash],
      );
      return r.rows[0]?.dono_do_token ?? null;
    }).catch(() => null);

    if (dono) {
      await banco.semTenant((c) =>
        c.query("SELECT revogar_sessoes_do_usuario($1, $2)", [
          dono, "reuso de token de renovacao",
        ]),
      );
    }
  }

  /**
   * Pede a redefinicao de senha.
   *
   * Responde sempre igual, exista a conta ou nao. Dizer "esse email nao esta
   * cadastrado" ajudaria quem esqueceu a senha e ajudaria igualmente quem esta
   * montando a lista de emails da prefeitura. Como o segundo uso e mais
   * provavel num sistema publico exposto, a resposta e uniforme.
   */
  async function pedirRecuperacao(
    email: string,
    contexto: { ip?: string },
  ): Promise<void> {
    const token = gerarTokenRenovacao();

    const alvo = await banco.semTenant(async (c) => {
      const r = await c.query<{ usuario_id: string; nome: string; email: string }>(
        "SELECT * FROM abrir_recuperacao($1,$2,$3::interval,$4)",
        [email, hashDoToken(token), `${config.RECUPERACAO_MINUTOS} minutes`, contexto.ip ?? null],
      );
      return r.rows[0] ?? null;
    });

    if (!alvo) return;

    const link = `${config.URL_PAINEL.replace(/\/$/, "")}/redefinir-senha?token=${encodeURIComponent(token)}`;
    await notificador.enviar(
      mensagemDeRecuperacao(alvo.nome, alvo.email, link, config.RECUPERACAO_MINUTOS),
    );
  }

  /**
   * Redefine a senha com o link recebido.
   *
   * O banco valida e grava numa operacao so: separar em "confere o token" e
   * depois "grava a senha" abriria uma janela em que o mesmo link serve duas
   * vezes, que e exatamente o que um atacante com o link procura.
   */
  async function redefinirSenha(token: string, senhaNova: string): Promise<void> {
    const hash = await derivarSenha(senhaNova);

    const trocada = await banco.semTenant(async (c) => {
      const r = await c.query<{ usuario_id: string }>(
        "SELECT * FROM consumir_recuperacao($1,$2)",
        [hashDoToken(token), hash],
      );
      return r.rows[0] ?? null;
    });

    if (!trocada) {
      throw new FalhaAutenticacao(
        "sessao",
        "Este link de redefinicao nao vale mais. Peca um novo.",
      );
    }
  }

  /**
   * Troca de senha por quem ja esta dentro.
   *
   * Exige a senha atual: sem isso, um aparelho deixado desbloqueado na mesa
   * vira uma conta sequestrada em dois cliques.
   */
  async function trocarSenha(
    identidade: { usuarioId: string; sessaoId: string; organizacaoId: string },
    senhaAtual: string,
    senhaNova: string,
  ): Promise<void> {
    const atual = await banco.comTenant(identidade.organizacaoId, async (c) => {
      const r = await c.query<{ senha_hash: string | null }>(
        "SELECT senha_hash FROM usuarios WHERE id = $1",
        [identidade.usuarioId],
      );
      return r.rows[0]?.senha_hash ?? null;
    });

    if (!(await conferirSenha(senhaAtual, atual))) {
      throw new FalhaAutenticacao("credenciais", "A senha atual nao confere.");
    }

    const hash = await derivarSenha(senhaNova);
    await banco.semTenant((c) =>
      c.query("SELECT trocar_senha($1,$2,$3)", [
        identidade.usuarioId, hash, identidade.sessaoId,
      ]),
    );
  }

  /**
   * Sair encerra a sessao E CALA O APARELHO.
   *
   * A metade que faltava era a segunda, e a falta dela e vazamento de dado
   * operacional, nao inconveniencia: o telefone de quem saiu continuava
   * recebendo "prazo vencendo" das ocorrencias da equipe, com o municipio, a
   * ocorrencia e o endereco no dado da notificacao. Quem devolveu o telefone
   * da prefeitura, ou quem foi realocado, seguia sendo avisado do trabalho de
   * um grupo do qual nao faz mais parte.
   *
   * A FICHA VEM DO APLICATIVO, e precisa vir: o servidor nao tem como saber
   * qual dos aparelhos daquela pessoa esta saindo. Quem tem dois (o telefone
   * da prefeitura e o proprio) sai de um e continua recebendo no outro, que e
   * o comportamento correto.
   *
   * A ORDEM IMPORTA. A sessao e consultada ANTES de ser revogada, porque
   * `sessao_por_token` (migracao 002) so devolve sessao viva, de proposito, e
   * e dela que sai o municipio necessario para alcancar a tabela de aparelhos
   * sob RLS. Invertida a ordem, a revogacao do aparelho nunca aconteceria.
   *
   * LIMITACAO CONHECIDA, escrita para nao virar surpresa: sair com um token de
   * renovacao ja expirado ou ja revogado nao revoga o aparelho, porque nesse
   * caso nao ha como descobrir de qual municipio ele e. Sobram as duas outras
   * barreiras: o varredor so avisa quem continua ativo E na equipe
   * responsavel, e a ficha recusada pelo provedor revoga o aparelho sozinha.
   */
  async function sair(tokenRenovacao: string, ficha?: string): Promise<void> {
    const hash = hashDoToken(tokenRenovacao);

    if (ficha) {
      const sessao = await banco.semTenant(async (c) => {
        const r = await c.query<{ organizacao_id: string; usuario_id: string }>(
          "SELECT organizacao_id, usuario_id FROM sessao_por_token($1)",
          [hash],
        );
        return r.rows[0] ?? null;
      });

      if (sessao) {
        try {
          await banco.comTenant(sessao.organizacao_id, (c) =>
            c.query(
              `UPDATE aparelhos
                  SET revogado_em = now(),
                      motivo_revogacao = 'saida do usuario'
                WHERE ficha = $1 AND usuario_id = $2 AND revogado_em IS NULL`,
              [ficha, sessao.usuario_id],
            ),
          );
        } catch {
          /*
            Falhar aqui NAO pode impedir a saida.

            Sair e a operacao que a pessoa aperta quando perdeu o controle do
            aparelho, e ela precisa funcionar mesmo com o banco de mau humor. A
            sessao logo abaixo e a parte que de fato retira o acesso; o aparelho
            que continuar recebendo aviso e um dano menor, e coberto pelas duas
            barreiras descritas acima.
          */
        }
      }
    }

    await banco.semTenant((c) =>
      c.query("SELECT revogar_sessao($1, $2)", [hash, "saida do usuario"]),
    );
  }

  /**
   * "Encerrar todas as minhas sessoes", para qualquer papel.
   *
   * Isto ja existia como efeito colateral da troca de senha, e so dela. Quem
   * esqueceu o painel aberto no computador da recepcao, ou perdeu o celular,
   * precisava inventar uma senha nova para conseguir expulsar a si mesmo dos
   * outros aparelhos. Trocar a senha vira ritual sem sentido quando a senha
   * nao e o problema, e ritual sem sentido e o que faz as pessoas pararem de
   * seguir o procedimento.
   *
   * A SESSAO DE ONDE A PESSOA CLICOU SOBREVIVE. E uma decisao, e a razao e
   * simples: um botao que desloga quem o aperta e um botao que ninguem aperta,
   * e o objetivo aqui e que ele seja usado no minuto em que o celular sumiu, e
   * nao depois. Quem quer sair tambem daqui tem o "Sair" ao lado, que revoga
   * esta. O caso de terceiro, em `rotas/administracao.ts`, decide o contrario
   * pelo motivo oposto: la o objetivo declarado e expulsar outra pessoa.
   *
   * Fica na trilha administrativa, mesmo sendo ato de alguem sobre a propria
   * conta: "fui deslogado de tudo e nao sei por que" e pergunta de incidente, e
   * a trilha e o unico lugar que responde se foi a propria pessoa, quem
   * administra, ou uma sessao roubada apertando o botao.
   *
   * ATE ONDE A PRESERVACAO VAI, e isto e limitacao conhecida, nao promessa: se
   * um dos aparelhos derrubados tentar renovar sozinho com o token que acabou
   * de cair, `derrubarSePossivelReuso` acima le isso como reuso de token
   * roubado e derruba a familia inteira, inclusive esta sessao. Nao da para
   * distinguir os dois casos hoje porque `dono_do_token` (migracao 002)
   * devolve o dono e nao o motivo da revogacao. O lado seguro da troca e o
   * atual: na duvida entre "foi o proprio usuario" e "e um token roubado", cai
   * tudo. Ver a pendencia registrada no teste.
   */
  async function encerrarMinhasSessoes(identidade: Identidade): Promise<number> {
    return banco.comTenant(identidade.organizacaoId, async (c) => {
      const encerradas = await encerrarSessoes(c, {
        usuarioId: identidade.usuarioId,
        motivo: "encerradas pelo proprio usuario",
        preservarSessaoId: identidade.sessaoId,
      });
      await registrarAtoAdministrativo(c, identidade, {
        acao: "sessoes_encerradas",
        alvoTipo: "usuario",
        alvoId: identidade.usuarioId,
        alvoNome: identidade.nome,
        depois: { sessoesEncerradas: encerradas, sessaoAtualPreservada: true },
      });
      return encerradas;
    });
  }

  return {
    entrar, renovar, sair, pedirRecuperacao, redefinirSenha, trocarSenha,
    encerrarMinhasSessoes,
  };
}

export type ServicoAutenticacao = ReturnType<typeof servicoDeAutenticacao>;
export type { Identidade };
