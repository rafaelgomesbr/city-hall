import type { Papel } from "@dc360/shared";
import type { Config } from "../config.js";
import type { Banco, Consulta } from "../banco/tipos.js";
import { abrirCofre, type Cofre } from "./cofre.js";
import { conferirSenha } from "./senha.js";
import {
  CODIGOS_DE_RECUPERACAO, base32Decodificar, conferirTotp, gerarCodigoDeRecuperacao,
  gerarSegredoTotp, resumoDoCodigo, uriDeAtivacao,
} from "./totp.js";
import { registrarAtoAdministrativo } from "../trilha.js";
import { RegraDeNegocio } from "../servidor.js";

/**
 * O segundo fator: quem liga, quem é obrigado, e o que acontece no login.
 *
 * O PORQUE está na ADR 0006: o administrador é o teto do município. Ele cria
 * conta, redefine senha de terceiro e altera os dados do órgão, e não existe
 * papel acima dele para desfazer o estrago. Até aqui essa conta era protegida
 * por senha e mais nada, e uma senha de servidor público reaproveitada de
 * outro sistema é o caminho mais curto para um município inteiro.
 *
 * O QUE ELE NÃO É: uma tela a mais. Se o produto emitisse o token de acesso e
 * apenas "não deixasse a tela avançar", quem tivesse a senha abriria o console
 * do navegador e chamaria a API direto, com o segundo fator ainda pendente.
 * Por isso o estado intermediário viaja num token de propósito único, com
 * plateia própria, que rota nenhuma do produto aceita. Ver `auth/tokens.ts`.
 */

export type SituacaoSegundoFator = {
  /** Ligado e confirmado: o login pede o código. */
  ativo: boolean;
  /** Ativação começada e não confirmada. A pessoa viu o código QR e parou aí. */
  pendente: boolean;
  /** O município exige o segundo fator para este papel. */
  exigido: boolean;
  /** Quantos códigos de recuperação ainda valem. */
  codigosRestantes: number;
  /** Se o recurso está ligado no servidor. Desligado, tudo acima é falso. */
  disponivel: boolean;
};

/** O que o login precisa decidir depois de a senha conferir. */
export type ExigenciaNoLogin = "nenhuma" | "codigo" | "ativacao";

type LinhaSegundoFator = {
  segredo_cifrado: string | null;
  confirmado_em: string | null;
  desativado_em: string | null;
  ultimo_passo: string | null;
  falhas: number;
  bloqueado_ate: string | null;
};

/** Quem praticou o ato. Menos que a `Identidade` porque ativação não tem sessão. */
type Autor = {
  usuarioId: string;
  organizacaoId: string;
  papel: Papel;
  nome: string;
};

export type Conferencia =
  | { ok: true; viaCodigoDeRecuperacao: boolean; codigosRestantes: number }
  | { ok: false; motivo: "bloqueado" | "codigo" | "sem_segundo_fator" };

/**
 * A recusa de quando o recurso está desligado no servidor.
 *
 * É uma FUNÇÃO e não uma subclasse de `RegraDeNegocio` de propósito: este
 * módulo e `servidor.ts` se importam em círculo, e uma classe que estende
 * outra é avaliada na CARGA do módulo, quando a classe de cima ainda pode não
 * existir. O produto inteiro subiria ou não conforme a ordem em que o Node
 * resolvesse os arquivos, que é a categoria de defeito que só aparece depois
 * de mexer em outra coisa.
 *
 * 503, e não 404: o recurso existe e está indisponível por decisão de quem
 * implantou, como já faz a recuperação de senha desligada.
 */
function desligado(): RegraDeNegocio {
  return new RegraDeNegocio(
    "segundo_fator_desligado",
    "A verificação em duas etapas está desligada neste servidor. "
    + "Procure quem cuida da instalação do sistema.",
    503,
  );
}

export function servicoDeSegundoFator(banco: Banco, config: Config) {
  const ligado = config.SEGUNDO_FATOR_ATIVO === "sim";

  /*
    O cofre é montado UMA vez, na partida, e não a cada uso.

    Assim uma chave malformada derruba o processo na subida, junto das outras
    checagens de configuração, em vez de esperar a primeira pessoa a tentar
    ligar o segundo fator para falhar no meio da ativação.
  */
  const cofre: Cofre | null = ligado && config.SEGUNDO_FATOR_CHAVE
    ? abrirCofre(config.SEGUNDO_FATOR_CHAVE)
    : null;

  function exigirLigado(): Cofre {
    if (!cofre) throw desligado();
    return cofre;
  }

  /**
   * O administrador é obrigado; os demais papéis escolhem.
   *
   * A regra é do papel e não da pessoa de propósito: promover alguém a
   * administrador passa a exigir dela o segundo fator no login seguinte, sem
   * que ninguém precise lembrar de ligar nada.
   */
  function exigidoPara(papel: Papel): boolean {
    return ligado && papel === "administrador";
  }

  /**
   * O envelope cifrado é amarrado ao município E à pessoa.
   *
   * Sem isso, quem conseguisse ESCREVER no banco copiaria o próprio envelope
   * para a linha do administrador e passaria a gerar os códigos dele com o
   * próprio aplicativo, sem nunca decifrar nada. Ver `auth/cofre.ts`.
   */
  function contexto(organizacaoId: string, usuarioId: string): string {
    return `segundo-fator:${organizacaoId}:${usuarioId}`;
  }

  async function lerLinha(c: Consulta, usuarioId: string): Promise<LinhaSegundoFator | null> {
    const r = await c.query<LinhaSegundoFator>(
      `SELECT segredo_cifrado, confirmado_em, desativado_em, ultimo_passo,
              falhas, bloqueado_ate
         FROM segundo_fator
        WHERE usuario_id = $1`,
      [usuarioId],
    );
    return r.rows[0] ?? null;
  }

  function estaAtiva(linha: LinhaSegundoFator | null): boolean {
    return Boolean(linha && linha.confirmado_em && !linha.desativado_em);
  }

  async function contarCodigos(c: Consulta, usuarioId: string): Promise<number> {
    const r = await c.query<{ n: string }>(
      `SELECT count(*)::text AS n
         FROM segundo_fator_recuperacao
        WHERE usuario_id = $1 AND usado_em IS NULL AND invalidado_em IS NULL`,
      [usuarioId],
    );
    return Number(r.rows[0]?.n ?? 0);
  }

  async function situacao(quem: Autor): Promise<SituacaoSegundoFator> {
    if (!ligado) {
      return {
        ativo: false, pendente: false, codigosRestantes: 0,
        exigido: false, disponivel: false,
      };
    }
    return banco.comTenant(quem.organizacaoId, async (c) => {
      const linha = await lerLinha(c, quem.usuarioId);
      return {
        ativo: estaAtiva(linha),
        pendente: Boolean(linha && !linha.confirmado_em && !linha.desativado_em),
        exigido: exigidoPara(quem.papel),
        codigosRestantes: linha ? await contarCodigos(c, quem.usuarioId) : 0,
        disponivel: true,
      };
    });
  }

  /**
   * O que o login precisa fazer depois de a senha conferir.
   *
   * Três desfechos, e o terceiro é o que dá dente à exigência: administrador
   * sem segundo fator, num município que o exige, NÃO recebe sessão. Ele
   * recebe um desafio que abre a ativação e nada mais. A alternativa comum
   * (deixar entrar e mostrar um aviso) é exigência de mentira: quem ignora o
   * aviso continua trabalhando com senha e nada mais, para sempre.
   */
  async function exigenciaNoLogin(
    organizacaoId: string, usuarioId: string, papel: Papel,
  ): Promise<ExigenciaNoLogin> {
    if (!ligado) return "nenhuma";

    const linha = await banco.comTenant(organizacaoId, (c) => lerLinha(c, usuarioId));
    if (estaAtiva(linha)) return "codigo";
    return exigidoPara(papel) ? "ativacao" : "nenhuma";
  }

  /* ======================================================================
     Ativação
     ====================================================================== */

  /**
   * Sorteia o segredo e guarda como RASCUNHO, sem exigir nada ainda.
   *
   * O rascunho é a metade que impede a pessoa de se trancar do lado de fora:
   * enquanto ela não confirmar um código, o login não muda de comportamento.
   * Ligar direto, sem conferência, transformaria relógio de telefone atrasado
   * ou leitura de código QR mal feita numa conta inacessível, e no caso do
   * administrador isso é o município inteiro parado.
   */
  async function iniciarAtivacao(
    quem: Autor, email: string, municipio: string,
  ): Promise<{ segredo: string; uri: string }> {
    const cofreAberto = exigirLigado();
    const segredo = gerarSegredoTotp();
    const envelope = cofreAberto.cifrar(segredo, contexto(quem.organizacaoId, quem.usuarioId));

    const gravado = await banco.comTenant(quem.organizacaoId, async (c) => {
      /*
        O `WHERE` do `DO UPDATE` é a regra "não troque o segredo de um segundo
        fator ativo" morando no BANCO, e não numa condicional da rota.

        Sem ele, quem tivesse a sessão aberta de outra pessoa (aparelho
        desbloqueado na mesa) trocaria o segredo por um seu e passaria a ser o
        segundo fator dela, sem nunca provar posse do aparelho atual e sem
        precisar da senha. Com ele, o caminho obrigatório é desativar (que pede
        a senha) e ativar de novo.
      */
      const r = await c.query<{ usuario_id: string }>(
        `INSERT INTO segundo_fator (organizacao_id, usuario_id, segredo_cifrado)
         VALUES ($1,$2,$3)
         ON CONFLICT (organizacao_id, usuario_id) DO UPDATE
            SET segredo_cifrado = EXCLUDED.segredo_cifrado,
                criado_em = now(), confirmado_em = NULL, desativado_em = NULL,
                ultimo_passo = NULL, falhas = 0, bloqueado_ate = NULL
          WHERE segundo_fator.confirmado_em IS NULL
             OR segundo_fator.desativado_em IS NOT NULL
         RETURNING usuario_id`,
        [quem.organizacaoId, quem.usuarioId, envelope],
      );
      return r.rows.length > 0;
    });

    if (!gravado) {
      throw new RegraDeNegocio(
        "segundo_fator_ja_ativo",
        "A verificação em duas etapas já está ligada nesta conta. Para trocar de "
        + "aparelho, desligue primeiro (o sistema vai pedir a sua senha) e ligue de novo.",
      );
    }

    return {
      segredo,
      uri: uriDeAtivacao(segredo, email, `DC360 ${municipio}`),
    };
  }

  /**
   * Confere um código gerado pelo aplicativo e SÓ ENTÃO liga o recurso.
   *
   * Devolve os códigos de recuperação, que aparecem uma única vez: o banco
   * guarda o resumo, então nem o servidor consegue mostrá-los de novo. Isso é
   * dito na tela, e é verdade verificável, não frase de efeito.
   */
  async function confirmarAtivacao(
    quem: Autor, codigo: string, agora = new Date(),
    /**
     * Roda primeiro, na MESMA transação que liga o recurso, e recusa lançando
     * erro (a transação volta atrás inteira). A rota a usa na ativação pelo
     * desafio, para conferir sob a trava da pessoa que a senha ainda é a que
     * o desafio atesta (complemento da correção 3 da E07).
     */
    exigirAntes?: (c: Consulta) => Promise<void>,
  ): Promise<{ codigos: string[] }> {
    const cofreAberto = exigirLigado();

    return banco.comTenant(quem.organizacaoId, async (c) => {
      await exigirAntes?.(c);
      const linha = await lerLinha(c, quem.usuarioId);
      if (!linha || linha.desativado_em || !linha.segredo_cifrado) {
        throw new RegraDeNegocio(
          "ativacao_nao_iniciada",
          "Não há ativação em andamento. Comece de novo, lendo o código QR.",
        );
      }
      if (linha.confirmado_em) {
        throw new RegraDeNegocio(
          "segundo_fator_ja_ativo",
          "A verificação em duas etapas já está ligada nesta conta.",
        );
      }

      const segredo = decifrarSegredo(cofreAberto, linha, quem);
      const conferido = conferirTotp(
        segredo, codigo, agora, linha.ultimo_passo === null ? null : Number(linha.ultimo_passo),
      );
      if (!conferido) {
        throw new RegraDeNegocio(
          "codigo_invalido",
          "Esse código não confere. Confira se o relógio do telefone está no "
          + "horário automático e digite o código que está aparecendo agora.",
          422,
        );
      }

      await c.query(
        `UPDATE segundo_fator
            SET confirmado_em = now(), ultimo_passo = $2, falhas = 0, bloqueado_ate = NULL
          WHERE usuario_id = $1`,
        [quem.usuarioId, conferido.passo],
      );

      const codigos = await renovarCodigos(c, quem);

      await registrarAtoAdministrativo(c, quem, {
        acao: "segundo_fator_ativado",
        alvoTipo: "usuario",
        alvoId: quem.usuarioId,
        alvoNome: quem.nome,
        // NUNCA o segredo, nem parte dele. Só o que aconteceu e quantas saídas
        // de emergência a pessoa passou a ter.
        depois: { codigosDeRecuperacao: codigos.length },
      });

      return { codigos };
    });
  }

  /**
   * Desligar EXIGE A SENHA ATUAL, e a exigência não é simetria burocrática com
   * a troca de senha: é o único obstáculo que sobra.
   *
   * O cenário é o painel aberto na recepção enquanto a pessoa foi ao banheiro.
   * Sem a senha, quem passa desliga o segundo fator em dois cliques, e a conta
   * volta a ser protegida só por uma senha que aquele alguém já vai poder
   * trocar depois com calma.
   */
  async function desativar(quem: Autor, senhaAtual: string): Promise<void> {
    exigirLigado();

    await banco.comTenant(quem.organizacaoId, async (c) => {
      const atual = await c.query<{ senha_hash: string | null }>(
        "SELECT senha_hash FROM usuarios WHERE id = $1",
        [quem.usuarioId],
      );
      if (!(await conferirSenha(senhaAtual, atual.rows[0]?.senha_hash ?? null))) {
        throw new RegraDeNegocio("senha_nao_confere", "A senha atual não confere. Confira e digite de novo.", 422);
      }

      const linha = await lerLinha(c, quem.usuarioId);
      if (!estaAtiva(linha)) {
        throw new RegraDeNegocio(
          "segundo_fator_nao_esta_ativo",
          "A verificação em duas etapas não está ligada nesta conta.",
        );
      }

      /*
        Apaga o segredo em vez de marcar a linha como inativa com ele dentro.
        Guardar credencial de uma proteção desligada é o risco de guardar sem o
        benefício de exigir, e o CHECK `segredo_coerente_com_a_situacao`
        (migração 022) recusa o contrário no banco.
      */
      await c.query(
        `UPDATE segundo_fator
            SET desativado_em = now(), segredo_cifrado = NULL,
                ultimo_passo = NULL, falhas = 0, bloqueado_ate = NULL
          WHERE usuario_id = $1`,
        [quem.usuarioId],
      );
      await invalidarCodigos(c, quem.usuarioId);

      await registrarAtoAdministrativo(c, quem, {
        acao: "segundo_fator_desativado",
        alvoTipo: "usuario",
        alvoId: quem.usuarioId,
        alvoNome: quem.nome,
        antes: { segundoFator: "ativo" },
        depois: { segundoFator: "desligado" },
      });
    });
  }

  /* ======================================================================
     A conferência no login
     ====================================================================== */

  /**
   * Confere o código de seis dígitos OU um código de recuperação.
   *
   * Os dois entram pelo mesmo campo de propósito: quem perdeu o telefone está
   * com pressa, e uma segunda tela escondida atrás de um link "usar código de
   * recuperação" é a tela que ninguém acha no momento em que precisa.
   *
   * A ORDEM importa. O código do aplicativo é tentado primeiro porque é o caso
   * comum; o de recuperação só é consultado quando o primeiro não confere, e a
   * consulta dele é um UPDATE condicional que marca o uso na MESMA operação
   * (ver `gastarCodigoDeRecuperacao`): separar "confere" de "marca como usado"
   * abriria a janela em que o mesmo papel serve duas vezes, que é exatamente o
   * que dois logins simultâneos com o mesmo código produziriam.
   */
  async function conferirNoLogin(
    organizacaoId: string,
    usuarioId: string,
    codigo: string,
    agora = new Date(),
  ): Promise<Conferencia> {
    const cofreAberto = exigirLigado();

    return banco.comTenant(organizacaoId, async (c) => {
      const linha = await lerLinha(c, usuarioId);
      if (!estaAtiva(linha)) return { ok: false, motivo: "sem_segundo_fator" };

      if (linha!.bloqueado_ate && new Date(linha!.bloqueado_ate) > agora) {
        return { ok: false, motivo: "bloqueado" };
      }

      const segredo = decifrarSegredo(cofreAberto, linha!, { organizacaoId, usuarioId });
      const porAplicativo = conferirTotp(
        segredo, codigo, agora,
        linha!.ultimo_passo === null ? null : Number(linha!.ultimo_passo),
      );

      if (porAplicativo) {
        await c.query(
          `UPDATE segundo_fator
              SET ultimo_passo = $2, falhas = 0, bloqueado_ate = NULL
            WHERE usuario_id = $1`,
          [usuarioId, porAplicativo.passo],
        );
        return {
          ok: true,
          viaCodigoDeRecuperacao: false,
          codigosRestantes: await contarCodigos(c, usuarioId),
        };
      }

      if (await gastarCodigoDeRecuperacao(c, usuarioId, codigo)) {
        await c.query(
          "UPDATE segundo_fator SET falhas = 0, bloqueado_ate = NULL WHERE usuario_id = $1",
          [usuarioId],
        );
        return {
          ok: true,
          viaCodigoDeRecuperacao: true,
          codigosRestantes: await contarCodigos(c, usuarioId),
        };
      }

      await c.query(
        `UPDATE segundo_fator
            SET falhas = falhas + 1,
                bloqueado_ate = CASE
                  WHEN falhas + 1 >= $2 THEN now() + $3::interval
                  ELSE bloqueado_ate
                END
          WHERE usuario_id = $1`,
        [
          usuarioId,
          config.SEGUNDO_FATOR_MAX_FALHAS,
          `${config.SEGUNDO_FATOR_BLOQUEIO_MINUTOS} minutes`,
        ],
      );
      return { ok: false, motivo: "codigo" };
    });
  }

  /* ======================================================================
     Peças internas
     ====================================================================== */

  function decifrarSegredo(
    cofreAberto: Cofre,
    linha: LinhaSegundoFator,
    quem: { organizacaoId: string; usuarioId: string },
  ): Buffer {
    const aberto = linha.segredo_cifrado
      ? cofreAberto.decifrar(linha.segredo_cifrado, contexto(quem.organizacaoId, quem.usuarioId))
      : null;
    const bytes = aberto ? base32Decodificar(aberto) : null;
    if (!bytes) {
      /*
        O envelope não abriu. O caso legítimo é a chave ter sido trocada; o
        ilegítimo é alguém ter escrito no banco um envelope de outra linha.

        Os dois viram o mesmo erro, e ele é 503 e não 401 de propósito: a
        pessoa digitou o código certo, quem está com defeito é a instalação. A
        mensagem manda usar o código de recuperação, que é o caminho que
        funciona nos dois casos.
      */
      throw new RegraDeNegocio(
        "segundo_fator_ilegivel",
        "O servidor não conseguiu ler o segredo da verificação em duas etapas "
        + "desta conta. Entre com um código de recuperação e ligue a verificação "
        + "de novo, e avise quem cuida da instalação do sistema.",
        503,
      );
    }
    return bytes;
  }

  async function gastarCodigoDeRecuperacao(
    c: Consulta, usuarioId: string, codigo: string,
  ): Promise<boolean> {
    const r = await c.query<{ codigo_hash: string }>(
      `UPDATE segundo_fator_recuperacao
          SET usado_em = now()
        WHERE usuario_id = $1 AND codigo_hash = $2
          AND usado_em IS NULL AND invalidado_em IS NULL
        RETURNING codigo_hash`,
      [usuarioId, resumoDoCodigo(codigo)],
    );
    return r.rows.length > 0;
  }

  async function invalidarCodigos(c: Consulta, usuarioId: string): Promise<void> {
    await c.query(
      `UPDATE segundo_fator_recuperacao
          SET invalidado_em = now()
        WHERE usuario_id = $1 AND usado_em IS NULL AND invalidado_em IS NULL`,
      [usuarioId],
    );
  }

  async function renovarCodigos(c: Consulta, quem: Autor): Promise<string[]> {
    await invalidarCodigos(c, quem.usuarioId);

    const codigos = Array.from({ length: CODIGOS_DE_RECUPERACAO }, gerarCodigoDeRecuperacao);
    for (const codigo of codigos) {
      await c.query(
        `INSERT INTO segundo_fator_recuperacao (organizacao_id, usuario_id, codigo_hash)
         VALUES ($1,$2,$3)`,
        [quem.organizacaoId, quem.usuarioId, resumoDoCodigo(codigo)],
      );
    }
    return codigos;
  }

  return {
    ligado,
    exigidoPara,
    situacao,
    exigenciaNoLogin,
    iniciarAtivacao,
    confirmarAtivacao,
    desativar,
    conferirNoLogin,
  };
}

export type ServicoSegundoFator = ReturnType<typeof servicoDeSegundoFator>;
