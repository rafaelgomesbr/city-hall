import type { Papel } from "@dc360/shared";
import type { Config } from "../config.js";
import type { Banco } from "../banco/tipos.js";
import { conferirSenha, gastarTempoEquivalente } from "./senha.js";
import {
  emitirAcesso, gerarTokenRenovacao, hashDoToken, type Identidade,
} from "./tokens.js";
import { derivarSenha } from "./senha.js";
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
      config.jwtSegredo,
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

  async function sair(tokenRenovacao: string): Promise<void> {
    await banco.semTenant((c) =>
      c.query("SELECT revogar_sessao($1, $2)", [hashDoToken(tokenRenovacao), "saida do usuario"]),
    );
  }

  return { entrar, renovar, sair, pedirRecuperacao, redefinirSenha, trocarSenha };
}

export type ServicoAutenticacao = ReturnType<typeof servicoDeAutenticacao>;
export type { Identidade };
