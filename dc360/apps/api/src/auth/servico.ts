import type { Papel } from "@dc360/shared";
import type { Config } from "../config.js";
import type { Banco, Consulta } from "../banco/tipos.js";
import { conferirSenha, gastarTempoEquivalente } from "./senha.js";
import {
  DESAFIO_MINUTOS, emitirAcesso, emitirDesafio, gerarTokenRenovacao, hashDoToken,
  verificarDesafio, type Identidade, type PropositoDeDesafio,
} from "./tokens.js";
import type { ServicoSegundoFator } from "./segundo-fator.js";
import { derivarSenha } from "./senha.js";
import { encerrarSessoes } from "./sessoes.js";
import { exigirAcessoAtivo } from "./suspensao.js";
import { ContaDesativada } from "./conta-desativada.js";
import { registrarAtoAdministrativo } from "../trilha.js";
import { createHash } from "node:crypto";
import { mensagemDeRecuperacao, semOsEnderecos, type Mensagem, type Notificador } from "./notificador.js";
import { resumirAparelho } from "./aparelho.js";

export type Credenciais = { email: string; senha: string };

/** Uma sessão viva da própria conta, como a tela de "Minha conta" a mostra. */
export type SessaoDaConta = {
  entrouEm: string;
  validaAte: string;
  /** Navegador e sistema em uma frase. Nunca o user-agent completo nem o IP. */
  aparelho: string;
  /** É a sessão de onde o pedido veio. */
  atual: boolean;
};

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
  /**
   * Só volta na segunda etapa do login, e existe para uma frase que a pessoa
   * precisa ler no momento certo: "você entrou com um código de recuperação, e
   * agora restam N". Quem gasta o penúltimo papel da gaveta tem que descobrir
   * isso ali, e não no dia em que gastar o último.
   */
  codigosDeRecuperacaoRestantes?: number;
  entrouComCodigoDeRecuperacao?: boolean;
  /**
   * A sessão nasceu de uma senha provisória (migração 046): sorteada por quem
   * administra ou pelo console e ainda não trocada. O token de acesso carrega
   * a marca, e só abre `/auth/trocar-senha`. O painel lê isto e leva à troca
   * antes de qualquer tela.
   */
  trocaDeSenhaObrigatoria?: boolean;
};

/**
 * O segundo desfecho possível da rota de entrar.
 *
 * A senha conferiu e a sessão NÃO nasceu: falta a segunda etapa. O que volta é
 * um token de propósito único, com plateia própria, que rota nenhuma do
 * produto aceita como credencial. Ver `auth/tokens.ts` para por que reusar o
 * token de acesso aqui seria dar acesso antes do segundo fator.
 */
export type DesafioDeEntrada = {
  segundoFator: "codigo" | "ativacao";
  desafio: string;
  expiraEm: number;
  mensagem: string;
};

export type ResultadoDeEntrada = Autenticado | DesafioDeEntrada;

/*
  Os códigos que a autenticação lança. `sessao_encerrada` e `nao_autenticado`
  são do catálogo de `@dc360/shared` (`codigos-de-erro.ts`): o primeiro era
  `sessao` até a V2-F00-E05, nome que não dizia o que o cliente faz. `credenciais`, `bloqueado` e
  `senha_provisoria_vencida` são da ENTRADA e ficam fora do catálogo de acesso.
  Conta desativada NÃO passa por aqui: é `ContaDesativada` (403), porque 401
  manda entrar de novo e entrar de novo não resolve.
*/
export class FalhaAutenticacao extends Error {
  readonly codigo:
    | "credenciais" | "bloqueado" | "sessao_encerrada"
    /*
      O papel gravado no banco não é o do token (V2-F00-E07). Mesmo código que a
      verificação do token emite: o cliente renova e repete, e a renovação já
      devolve o token com o papel novo.
    */
    | "nao_autenticado"
    /*
      A senha provisória venceu sem ser trocada. Só sai para quem apresentou a
      senha provisória CERTA (a errada recebe a recusa genérica), então não
      conta nada a quem não a tinha, e diz o que resolve: pedir outra.
    */
    | "senha_provisoria_vencida";
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
  /** Migração 046. NULL para senha escolhida pela própria pessoa. */
  senha_provisoria_ate: string | null;
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

/**
 * O contador de falhas dos emails que NÃO EXISTEM, em memória, com teto.
 *
 * O DEFEITO QUE ISTO FECHA: cinco senhas erradas num email cadastrado
 * respondiam 429 `bloqueado`; cinco num email inexistente respondiam 401,
 * cinco vezes. A diferença era um oráculo de quais emails existem, que a
 * resposta genérica acima se dava ao trabalho de esconder.
 *
 * A resposta passou a ser 401 `credenciais` nos dois casos, sempre, e o
 * bloqueio da conta cadastrada continua valendo em silêncio (a senha certa
 * é recusada durante o bloqueio). Este contador existe para o lado
 * inexistente ter o MESMO comportamento interno: conta falhas, "bloqueia"
 * pelo mesmo prazo, e o tempo gasto é o de uma verificação real. Em memória
 * (uma linha por email não existe no banco, e criá-la seria gravar o email
 * que alguém digitou), com teto de entradas para uma varredura de lista não
 * virar consumo de memória sem fim: passado o teto, a entrada mais antiga
 * sai. Por processo, e por isso é higiene e não a defesa: a defesa contra
 * força bruta é o limite por endereço da rota (`LOGIN_POR_IP`).
 */
const TETO_DE_EMAILS_INEXISTENTES = 10_000;
const falhasDeEmailInexistente = new Map<string, { falhas: number; bloqueadoAte: number }>();

function registrarFalhaDeEmailInexistente(email: string, maxFalhas: number, bloqueioMinutos: number): void {
  const chave = email.trim().toLowerCase();
  const agora = Date.now();
  const atual = falhasDeEmailInexistente.get(chave) ?? { falhas: 0, bloqueadoAte: 0 };
  if (atual.bloqueadoAte > agora) return;
  const falhas = atual.falhas + 1;
  falhasDeEmailInexistente.delete(chave);
  falhasDeEmailInexistente.set(chave, {
    falhas: falhas >= maxFalhas ? 0 : falhas,
    bloqueadoAte: falhas >= maxFalhas ? agora + bloqueioMinutos * 60_000 : 0,
  });
  if (falhasDeEmailInexistente.size > TETO_DE_EMAILS_INEXISTENTES) {
    const maisAntigo = falhasDeEmailInexistente.keys().next().value;
    if (maisAntigo !== undefined) falhasDeEmailInexistente.delete(maisAntigo);
  }
}

/**
 * A janela do teto de pedidos de recuperação por email: uma hora.
 *
 * Mais curta e o teto não protege a caixa de entrada de ninguém (cinco
 * mensagens a cada cinco minutos ainda são sessenta por hora); mais longa e
 * quem pediu o link de verdade e perdeu a mensagem fica esperando o dia
 * inteiro. Uma hora é o tempo que o suporte leva para responder, e a pessoa
 * sempre tem a saída de quem administra (E09) enquanto espera.
 */
const JANELA_DO_TETO_DE_EMAIL_MS = 60 * 60_000;

/** Quantos emails o contador guarda; passado disto sai o mais antigo. */
const TETO_DE_EMAILS_CONTADOS = 10_000;

/** Quanto do erro do provedor vai para o log do servidor. */
const TETO_DO_ERRO_NO_LOG = 300;

export function servicoDeAutenticacao(
  banco: Banco,
  config: Config,
  notificador: Notificador,
  segundoFator: ServicoSegundoFator,
) {
  /*
    O contador de pedidos de recuperação por email, em memória e por processo.

    Guarda o HASH do email e não o email: o endereço de uma pessoa não tem por
    que morar num mapa em memória que um dump de processo entregaria. Conta
    email que existe e email que não existe do mesmo jeito, ANTES de consultar
    o banco: se só contasse quem tem conta, o dia em que o teto estourasse
    seria o dia em que a resposta (o envio que não acontece) contaria quais
    emails existem.

    Por processo, e por isso é um freio e não a defesa inteira: a defesa que
    vale para o endereço de quem chama é `LOGIN_POR_IP` na rota. O que este
    contador acrescenta é o que o limite por endereço não alcança, que é cem
    endereços diferentes martelando o MESMO email até encher a caixa de
    entrada de uma pessoa. Com mais de uma máquina o teto vira "por máquina";
    a conta final continua pequena e a alternativa (uma tabela só para isto)
    custaria uma migração por um ganho que o piloto não pede.
  */
  const pedidosPorEmail = new Map<string, number[]>();

  /** Registra o pedido e diz se ele ainda cabe no teto da última hora. */
  function cabeNoTetoDoEmail(email: string): boolean {
    const chave = createHash("sha256").update(email.trim().toLowerCase()).digest("base64url");
    const agora = Date.now();
    const recentes = (pedidosPorEmail.get(chave) ?? [])
      .filter((instante) => agora - instante < JANELA_DO_TETO_DE_EMAIL_MS);
    const cabe = recentes.length < config.RECUPERACAO_POR_EMAIL_HORA;
    // Pedido recusado pelo teto NÃO entra na lista: senão quem insiste
    // empurraria o fim da janela para sempre, e a vítima nunca mais recuperaria.
    if (cabe) recentes.push(agora);
    // Apaga e reinsere para a ordem do mapa ser a do último uso.
    pedidosPorEmail.delete(chave);
    pedidosPorEmail.set(chave, recentes);
    if (pedidosPorEmail.size > TETO_DE_EMAILS_CONTADOS) {
      const maisAntigo = pedidosPorEmail.keys().next().value;
      if (maisAntigo !== undefined) pedidosPorEmail.delete(maisAntigo);
    }
    return cabe;
  }

  /*
    Os envios que saíram do pedido e ainda não terminaram.

    O envio NÃO é aguardado dentro do pedido (ver `pedirRecuperacao`), então
    alguém precisa saber que ele existe: o encerramento do servidor espera por
    esta lista, para a mensagem que já foi aceita não morrer junto com o
    processo no meio da viagem até o provedor.
  */
  const enviosEmVoo = new Set<Promise<void>>();

  function enviarSemEsperar(
    mensagem: Mensagem,
    aoFalhar: ((motivo: string) => void) | undefined,
  ): void {
    const envio = (async () => {
      try {
        await notificador.enviar(mensagem);
      } catch (erro) {
        const bruto = erro instanceof Error ? erro.message : String(erro);
        try {
          // O erro do provedor costuma ecoar o pedido inteiro, e o pedido
          // carrega o link de uso único e o email de quem pediu.
          aoFalhar?.(semOsEnderecos(bruto, mensagem.corpo, mensagem.para).slice(0, TETO_DO_ERRO_NO_LOG));
        } catch {
          // Quem registra a falha não pode derrubar o processo por falhar também.
        }
      }
    })();
    enviosEmVoo.add(envio);
    void envio.finally(() => { enviosEmVoo.delete(envio); });
  }

  async function esperarEnvios(): Promise<void> {
    await Promise.allSettled([...enviosEmVoo]);
  }

  async function entrar(
    credenciais: Credenciais,
    contexto: { userAgent?: string; ip?: string },
  ): Promise<ResultadoDeEntrada> {
    const linha = await banco.semTenant(async (c) => {
      const r = await c.query<LinhaCredencial>(
        "SELECT * FROM credenciais_para_login($1)",
        [credenciais.email],
      );
      return r.rows[0] ?? null;
    });

    if (!linha) {
      // Gasta o mesmo tempo de uma verificação real: sem isso, a resposta
      // rápida denuncia que o email não existe. E conta a falha como se a
      // conta existisse, pela razão escrita em `registrarFalhaDeEmailInexistente`.
      registrarFalhaDeEmailInexistente(
        credenciais.email, config.MAX_FALHAS_LOGIN, config.BLOQUEIO_MINUTOS,
      );
      await gastarTempoEquivalente();
      throw new FalhaAutenticacao("credenciais", MENSAGEM_GENERICA);
    }

    if (linha.bloqueado_ate && new Date(linha.bloqueado_ate) > new Date()) {
      /*
        BLOQUEADA EM SILÊNCIO: a mesma resposta, e o mesmo tempo, de senha
        errada. Dizer "bloqueada" (429) só para conta que existe era o oráculo
        de quais emails estão cadastrados. O bloqueio continua valendo: a senha
        certa é recusada até o prazo passar, e a tentativa durante o bloqueio
        não o estende.
      */
      await gastarTempoEquivalente();
      throw new FalhaAutenticacao("credenciais", MENSAGEM_GENERICA);
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

    /*
      A suspensão do município é conferida DEPOIS da senha e ANTES de registrar
      o acerto, e as duas posições são deliberadas.

      Depois da senha: a resposta 403 revela que o município está em discussão
      contratual, e ela só pode sair para quem provou quem é. Antes deste ponto
      a recusa é a genérica, igual para email inexistente e senha errada.

      Antes de registrar o acerto: `registrar_tentativa_login(true)` zera o
      contador e carimba `ultimo_acesso`, e a pessoa NÃO entrou. Um município
      suspenso com `ultimo_acesso` de hoje apareceria no console do fornecedor
      como município em uso. Ver `auth/suspensao.ts` para o desenho inteiro.
    */
    await exigirAcessoAtivo(banco, linha.organizacao_id);

    /*
      A SENHA PROVISÓRIA VENCIDA não entra (migração 046). Depois da senha
      conferir, porque só quem tem a senha certa pode saber que ela venceu;
      antes de registrar o acerto, porque a pessoa NÃO entrou.
    */
    if (senhaProvisoriaVencida(linha)) {
      throw new FalhaAutenticacao(
        "senha_provisoria_vencida",
        "A senha provisória venceu sem ser trocada. Peça uma nova a quem administra "
        + "o município.",
      );
    }

    await banco.semTenant((c) =>
      c.query("SELECT registrar_tentativa_login($1, true, $2, $3::interval)", [
        linha.usuario_id,
        config.MAX_FALHAS_LOGIN,
        `${config.BLOQUEIO_MINUTOS} minutes`,
      ]),
    );

    /*
      A senha conferiu. Aqui a rota passa a ter DOIS desfechos.

      O contador de senha já foi zerado acima, e isso é correto: a senha estava
      certa. Quem cuida da força bruta contra os seis dígitos é o contador
      próprio do segundo fator, que só zera quando o CÓDIGO acerta. Fossem o
      mesmo contador, cada tentativa de adivinhar o código começaria por um
      acerto de senha e o teto nunca fecharia.
    */
    const exigencia = await segundoFator.exigenciaNoLogin(
      linha.organizacao_id, linha.usuario_id, linha.papel,
    );
    if (exigencia !== "nenhuma") {
      return desafiar(linha, exigencia);
    }

    return emitirPar(linha, contexto);
  }

  /**
   * Monta o desafio, que é tudo que a pessoa leva daqui até provar a segunda
   * etapa.
   *
   * O conteúdo é o mínimo para a segunda chamada saber de quem se trata, e
   * nada mais: nem matrícula, nem município, nem email. Ele não abre sessão,
   * não carrega `sid` e é recusado por toda rota autenticada, porque a plateia
   * é outra.
   */
  async function desafiar(
    linha: LinhaCredencial,
    exigencia: "codigo" | "ativacao",
  ): Promise<DesafioDeEntrada> {
    const proposito: PropositoDeDesafio =
      exigencia === "codigo" ? "segundo_fator" : "ativacao_do_segundo_fator";

    const desafio = await emitirDesafio(config.jwtSegredos[0], {
      sub: linha.usuario_id,
      org: linha.organizacao_id,
      papel: linha.papel,
      nome: linha.nome,
      pp: proposito,
    });

    return {
      segundoFator: exigencia,
      desafio,
      expiraEm: DESAFIO_MINUTOS * 60,
      mensagem: exigencia === "codigo"
        ? "Digite o código de seis dígitos do seu aplicativo de autenticação."
        : "Esta conta administra o município e precisa da verificação em duas "
          + "etapas para entrar. Ligue agora: leva um minuto e você recebe os "
          + "códigos de recuperação no fim.",
    };
  }

  /**
   * A segunda etapa do login: o código, ou um código de recuperação.
   *
   * Quem chega aqui já provou a senha (é o que o desafio atesta) e agora prova
   * a posse do aparelho. A sessão nasce SÓ neste ponto, e é por isso que uma
   * senha vazada, sozinha, não vale mais nada nas contas com o recurso ligado.
   *
   * A recusa é sempre a mesma frase, sem dizer se o código estava errado ou se
   * a conta ficou travada por tentativa demais... com uma exceção deliberada:
   * o bloqueio É dito, porque quem está travado precisa saber que esperar
   * resolve, senão ele fica tentando (e reiniciando o relógio do bloqueio) ou
   * liga para o suporte no meio de um temporal.
   */
  async function conferirSegundoFator(
    desafio: string,
    codigo: string,
    contexto: { userAgent?: string; ip?: string },
  ): Promise<Autenticado> {
    const conteudo = await verificarDesafio(config.jwtSegredos, desafio);
    if (!conteudo || conteudo.pp !== "segundo_fator") {
      throw new FalhaAutenticacao(
        "sessao_encerrada",
        "Esta tentativa de entrada expirou. Informe email e senha de novo.",
      );
    }

    const resultado = await segundoFator.conferirNoLogin(
      conteudo.org, conteudo.sub, codigo,
    );

    if (!resultado.ok) {
      if (resultado.motivo === "bloqueado") {
        throw new FalhaAutenticacao(
          "bloqueado",
          "Códigos errados demais. A verificação em duas etapas desta conta ficou "
          + "bloqueada por alguns minutos. Se você perdeu o telefone, use um código "
          + "de recuperação.",
        );
      }
      throw new FalhaAutenticacao(
        "credenciais",
        "Código inválido. Confira o número que está aparecendo agora no aplicativo, "
        + "ou use um código de recuperação.",
      );
    }

    const linha = await lerCredencialPorId(conteudo.org, conteudo.sub);
    if (!linha || !linha.ativo) {
      throw new FalhaAutenticacao("credenciais", MENSAGEM_GENERICA);
    }
    // O desafio foi emitido há no máximo cinco minutos, e a suspensão pode
    // ter entrado nesse intervalo. A sessão nasce aqui, então a pergunta se
    // faz aqui também.
    await exigirAcessoAtivo(banco, conteudo.org);

    return {
      ...(await emitirPar(linha, contexto)),
      codigosDeRecuperacaoRestantes: resultado.codigosRestantes,
      entrouComCodigoDeRecuperacao: resultado.viaCodigoDeRecuperacao,
    };
  }

  /**
   * A sessão que nasce quando alguém acabou de LIGAR o segundo fator porque
   * era obrigado a ligar para entrar.
   *
   * Quem chega aqui provou a senha (o desafio atesta) e acabou de provar a
   * posse do aparelho (a confirmação da ativação exige um código válido).
   * Mandar essa pessoa digitar a senha de novo seria atrito sem ganho: as duas
   * etapas já aconteceram, na ordem certa, nos últimos cinco minutos.
   *
   * Quem chama é a rota de confirmação, e só quando o pedido veio por um
   * desafio de ativação. Com token de acesso normal a pessoa já está dentro, e
   * aí nenhuma sessão nova é emitida.
   */
  async function sessaoAposAtivacao(
    organizacaoId: string,
    usuarioId: string,
    contexto: { userAgent?: string; ip?: string },
  ): Promise<Autenticado> {
    const linha = await lerCredencialPorId(organizacaoId, usuarioId);
    if (!linha || !linha.ativo) {
      throw new FalhaAutenticacao("credenciais", MENSAGEM_GENERICA);
    }
    await exigirAcessoAtivo(banco, organizacaoId);
    return emitirPar(linha, contexto);
  }

  /**
   * Relê a conta para emitir a sessão, agora COM contexto de município.
   *
   * Não usa `credenciais_para_login` de propósito, e a diferença é de
   * privilégio: aquela função é `SECURITY DEFINER`, existe para o momento em
   * que ainda não se sabe de qual município é quem está entrando, e busca por
   * email no sistema inteiro. Aqui o município já é conhecido (veio dentro do
   * desafio assinado), então a leitura passa pelo caminho comum, sob RLS, sem
   * abrir mais uma porta na parede do isolamento.
   */
  async function lerCredencialPorId(
    organizacaoId: string, usuarioId: string,
  ): Promise<LinhaCredencial | null> {
    return banco.comTenant(organizacaoId, async (c) => {
      const r = await c.query<LinhaCredencial>(
        `SELECT u.id AS usuario_id, u.organizacao_id, u.nome, u.papel,
                NULL::text AS senha_hash, u.ativo, u.bloqueado_ate,
                u.senha_provisoria_ate, u.matricula,
                o.nome AS organizacao_nome, o.municipio, o.uf
           FROM usuarios u
           JOIN organizacoes o ON o.id = u.organizacao_id
          WHERE u.id = $1`,
        [usuarioId],
      );
      return r.rows[0] ?? null;
    });
  }

  /**
   * Abre a sessão no banco, na transação de quem chama. `familiaId` só a
   * renovação informa: a sessão nova entra na cadeia da que acabou de ser
   * rotacionada. Sem ele é um login, e o banco abre uma família nova
   * (migração 047).
   */
  async function abrirSessao(
    c: Consulta,
    linha: LinhaCredencial,
    contexto: { userAgent?: string; ip?: string },
    renovacao: string,
    familiaId: string | null,
  ): Promise<string> {
    const r = await c.query<{ abrir_sessao: string }>(
      "SELECT abrir_sessao($1,$2,$3,$4::interval,$5,$6,$7) AS abrir_sessao",
      [
        linha.organizacao_id,
        linha.usuario_id,
        hashDoToken(renovacao),
        `${config.RENOVACAO_DIAS} days`,
        contexto.userAgent ?? null,
        contexto.ip ?? null,
        familiaId,
      ],
    );
    return r.rows[0]!.abrir_sessao;
  }

  /** Login: abre a sessão (família nova) e emite o par de tokens. */
  async function emitirPar(
    linha: LinhaCredencial,
    contexto: { userAgent?: string; ip?: string },
  ): Promise<Autenticado> {
    const renovacao = gerarTokenRenovacao();
    const sessaoId = await banco.semTenant((c) => abrirSessao(c, linha, contexto, renovacao, null));
    return montarPar(linha, sessaoId, renovacao);
  }

  /** O par de tokens de uma sessão já aberta. */
  async function montarPar(
    linha: LinhaCredencial,
    sessaoId: string,
    renovacao: string,
  ): Promise<Autenticado> {
    // Vencida não chega aqui: `entrar` e `renovar` recusam antes. O que sobra
    // é "provisória e no prazo", que vira a marca no token.
    const provisoria = linha.senha_provisoria_ate !== null;

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
        ...(provisoria ? { sp: true as const } : {}),
      },
      config.ACESSO_MINUTOS,
    );

    return {
      acesso,
      renovacao,
      expiraEm: config.ACESSO_MINUTOS * 60,
      ...(provisoria ? { trocaDeSenhaObrigatoria: true } : {}),
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
        senha_provisoria_ate: string | null;
        matricula: string;
        organizacao_nome: string; municipio: string; uf: string;
      }>("SELECT * FROM sessao_por_token($1)", [hash]);
      return r.rows[0] ?? null;
    });

    if (!sessao) {
      // `sessao_por_token` não devolve sessão revogada, e desativar a conta
      // pelo painel REVOGA as sessões dela. Sem esta pergunta, a pessoa
      // desativada que volta depois do token de acesso vencer caía aqui e lia
      // "sessão encerrada" (V2-F00-E05, correção 1).
      if (await tratarTokenRecusado(hash) === "conta_desativada") throw new ContaDesativada();
      throw new FalhaAutenticacao("sessao_encerrada", "Sessão expirada. Entre novamente.");
    }

    if (!sessao.ativo) {
      await banco.semTenant((c) =>
        c.query("SELECT revogar_sessoes_do_usuario($1, $2)", [
          sessao.usuario_id, "usuario desativado",
        ]),
      );
      // 403 e não 401: quem apresenta uma renovação válida pode saber que a
      // conta foi desativada (o cliente para de insistir e avisa), e entrar de
      // novo não resolve. A entrada continua com a recusa genérica.
      throw new ContaDesativada();
    }

    /*
      Município suspenso não renova, mesmo com a sessão de pé no banco.

      O console revoga as sessões ao suspender, e o caminho comum nem chega
      aqui: `sessao_por_token` já devolveu nada. Esta linha existe para o caso
      em que a revogação não aconteceu (falhou, ou a suspensão entrou por outro
      caminho): a sessão de renovação vive dias, e sem isto ela reemitiria
      tokens de acesso por todo o prazo dela. O token usado NÃO é rotacionado
      antes da recusa: rotacionar e recusar deixaria a pessoa sem token
      nenhum, e a fila do aparelho precisa continuar apresentando o que tem
      para receber a resposta certa (ver `auth/suspensao.ts`).
    */
    await exigirAcessoAtivo(banco, sessao.organizacao_id);

    // A senha provisória venceu no meio da sessão: não renova (migração 046).
    if (senhaProvisoriaVencida(sessao)) {
      throw new FalhaAutenticacao("sessao_encerrada", "Sessão expirada. Entre novamente.");
    }

    const linha: LinhaCredencial = {
      usuario_id: sessao.usuario_id,
      organizacao_id: sessao.organizacao_id,
      nome: sessao.nome,
      matricula: sessao.matricula,
      papel: sessao.papel,
      senha_hash: null,
      ativo: true,
      bloqueado_ate: null,
      senha_provisoria_ate: sessao.senha_provisoria_ate,
      organizacao_nome: sessao.organizacao_nome,
      municipio: sessao.municipio,
      uf: sessao.uf,
    };
    const renovacao = gerarTokenRenovacao();

    /*
      A ROTAÇÃO É UMA TRANSAÇÃO SÓ, E SOB A TRAVA DA PESSOA (V2-F00-E07,
      correção 2). Até aqui revogar a antiga e abrir a nova eram duas
      transações, e entre elas a família ficava sem sessão viva: quem
      administra encerrava as sessões nesse instante, não achava nada da
      cadeia para encerrar (respondia 200), e a renovação abria a sessão nova
      herdando a família encerrada. A validação de 4b96ea7 viu sobrar sessão
      viva em 5 de 60 corridas.

      Uma transação só não basta: em READ COMMITTED o UPDATE de quem encerra
      não enxerga a linha que esta transação inseriu e ainda não confirmou.
      Por isso a trava (`travar_sessoes_do_usuario`, migração 049) vem
      primeiro e só sai no COMMIT, com a sessão nova já aberta, e todo
      encerramento em massa toma a mesma trava num comando anterior ao UPDATE
      (`auth/sessoes.ts` e as funções da 049). Quem chega depois espera e
      encerra também a sessão nova; quem chegou antes faz o `revogar_sessao`
      abaixo devolver zero, e a renovação desiste sem emitir par.

      De brinde, a escrita com o token de acesso anterior à renovação deixa de
      cair num instante sem sessão viva na família (a "janela na renovação"
      que `apps/api/PENDENCIAS.md` registrava): quem lê vê a antiga de pé ou a
      nova de pé, nunca nenhuma.
    */
    const sessaoNova = await banco.comTenant(sessao.organizacao_id, async (c) => {
      await c.query("SELECT travar_sessoes_do_usuario($1)", [sessao.usuario_id]);

      /*
        H1: DOIS PEDIDOS COM O MESMO TOKEN, ao mesmo tempo. Os dois leram a
        sessão de pé acima; só um consegue revogá-la. `revogar_sessao` devolve
        quantas linhas mudou, e ZERO significa que outro pedido acabou de
        rotacionar este token (ou que um encerramento chegou antes). O perdedor
        ABORTA aqui, sem emitir par nenhum: emitir seria entregar duas sessões
        vivas para um token só, e a segunda para quem chegou depois, que é
        exatamente o cenário do token roubado.
      */
      const revogada = await c.query<{ revogar_sessao: number }>(
        "SELECT revogar_sessao($1, $2) AS revogar_sessao", [hash, "rotacionada na renovacao"],
      );
      if (Number(revogada.rows[0]?.revogar_sessao ?? 0) === 0) return null;

      /*
        A FAMÍLIA da sessão rotacionada, lida sob tenant (`sessoes` está sob
        RLS, e `sessao_por_token` não a devolve: a função da 046 não mudou). A
        sessão nova entra na mesma cadeia, e é isso que permite à vigência
        saber que o token de acesso emitido na antiga ainda pertence a uma
        cadeia viva (migração 047).
      */
      const familia = await c.query<{ familia_id: string }>(
        "SELECT familia_id FROM sessoes WHERE id = $1", [sessao.sessao_id],
      );
      return abrirSessao(c, linha, contexto, renovacao, familia.rows[0]?.familia_id ?? null);
    }).catch((erro: unknown) => {
      // A segunda barreira (migração 049): `abrir_sessao` recusa herdar família
      // encerrada. Com a trava não acontece; se acontecer, é sessão encerrada,
      // e a transação inteira voltou atrás.
      if ((erro as { code?: unknown }).code === "DC369") return null;
      throw erro;
    });
    if (sessaoNova === null) {
      throw new FalhaAutenticacao("sessao_encerrada", "Sessão expirada. Entre novamente.");
    }

    return montarPar(linha, sessaoNova, renovacao);
  }

  /** Migração 046: provisória e já no passado. */
  function senhaProvisoriaVencida(linha: { senha_provisoria_ate: string | null }): boolean {
    return linha.senha_provisoria_ate !== null && new Date(linha.senha_provisoria_ate) < new Date();
  }

  /**
   * O que fazer com um token de renovação que `sessao_por_token` não aceitou
   * (revogado, vencido ou desconhecido). Uma pergunta ao banco, duas decisões.
   *
   * 1. CONTA DESATIVADA (V2-F00-E05, correção 1). Se o servidor RECONHECE o
   *    token (a sessão existe, mesmo revogada) e a conta do dono está
   *    desativada AGORA, quem o apresenta recebe `conta_desativada`: ele já
   *    tem uma credencial que o servidor emitiu para esta conta, e entrar de
   *    novo não resolve. O estado vem de `dono_do_token` (migração 048), e
   *    não do motivo da revogação: conta desativada e depois reativada tem
   *    sessões revogadas por `usuario desativado` e está ativa, e dizer
   *    "desativada" a ela mandaria a pessoa parar sem motivo.
   *
   *    NÃO abre oráculo para quem não tem credencial: token DESCONHECIDO não
   *    devolve linha e sai como `sessao_encerrada`, igual ao de conta ativa
   *    cuja sessão foi encerrada. `/auth/entrar` e `/auth/recuperar` não
   *    mudam. A desativação continua revogando tudo (idempotente).
   *
   * 2. REÚSO. Um token que já foi ROTACIONADO continua existindo no banco,
   *    revogado com o motivo `rotacionada na renovacao`. Se ele reaparecer, é
   *    reúso (o legítimo e o atacante passaram a alternar), e aí a família
   *    inteira cai.
   *
   *    SÓ ESSE CASO. Até 15/09/2026 `dono_do_token` devolvia o dono "mesmo que
   *    revogada ou expirada", e esta função derrubava tudo por um token que só
   *    VENCEU (o aparelho que ficou quinze dias sem sinal) ou que a própria
   *    pessoa encerrou em "Minha conta" e um aparelho antigo reapresentou. O
   *    painel da coordenação caía por um token que ninguém roubou. A migração
   *    046 faz a função devolver o motivo e o vencimento, e o que não é
   *    rotação responde 401 e nada mais.
   */
  async function tratarTokenRecusado(hash: string): Promise<"conta_desativada" | "sessao_encerrada"> {
    // `sessoes` está sob RLS e não é legível sem contexto de tenant, que é
    // exatamente o que ainda não temos aqui. A pergunta passa pela função
    // nomeada da migração 002 (redefinida na 046 e na 048).
    const dono = await banco.semTenant(async (c) => {
      const r = await c.query<{
        usuario_id: string; revogada_em: string | null;
        motivo_revogacao: string | null; expira_em: string;
        // Ausente num banco que ainda não aplicou a 048: só `false` conta.
        usuario_ativo?: boolean;
      }>("SELECT * FROM dono_do_token($1)", [hash]);
      return r.rows[0] ?? null;
    }).catch(() => null);

    if (dono && dono.usuario_ativo === false) {
      await banco.semTenant((c) =>
        c.query("SELECT revogar_sessoes_do_usuario($1, $2)", [
          dono.usuario_id, "usuario desativado",
        ]),
      );
      return "conta_desativada";
    }

    if (dono && dono.revogada_em !== null && dono.motivo_revogacao === "rotacionada na renovacao") {
      await banco.semTenant((c) =>
        c.query("SELECT revogar_sessoes_do_usuario($1, $2)", [
          dono.usuario_id, "reuso de token de renovacao",
        ]),
      );
    }
    return "sessao_encerrada";
  }

  /**
   * Pede a redefinicao de senha.
   *
   * Responde sempre igual, exista a conta ou nao. Dizer "esse email nao esta
   * cadastrado" ajudaria quem esqueceu a senha e ajudaria igualmente quem esta
   * montando a lista de emails da prefeitura. Como o segundo uso e mais
   * provavel num sistema publico exposto, a resposta e uniforme.
   *
   * "Uniforme" vale para o corpo, para o status E para o tempo. O envio ao
   * provedor leva centenas de milissegundos e so acontece para quem tem conta:
   * aguardado dentro do pedido, o relogio entregava o que o corpo escondia.
   * Por isso o envio sai DEPOIS da resposta (`enviarSemEsperar`), e a falha do
   * provedor vai para o log sem o link, em vez de virar 500 so para quem tem
   * conta. O custo e honesto: se o provedor recusar, quem pediu nao e avisado
   * na tela (e nao deve ser: a tela nao sabe se a conta existe). A pessoa pede
   * de novo, ou procura quem administra.
   */
  async function pedirRecuperacao(
    email: string,
    contexto: { ip?: string; aoFalharEnvio?: (motivo: string) => void },
  ): Promise<void> {
    if (!cabeNoTetoDoEmail(email)) return;
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
    enviarSemEsperar(
      mensagemDeRecuperacao(alvo.nome, alvo.email, link, config.RECUPERACAO_MINUTOS),
      // Quem não diz para onde vai a falha NÃO a perde em silêncio: sem este
      // padrão, um chamador esquecido deixaria o provedor falhar sem rastro.
      contexto.aoFalharEnvio
        ?? ((motivo) => console.error(`[recuperacao] falha ao enviar o link: ${motivo}`)),
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
        "sessao_encerrada",
        "Este link de redefinição não vale mais. Peça um novo.",
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
    identidade: Identidade,
    senhaAtual: string,
    senhaNova: string,
  ): Promise<{ acesso: string; expiraEm: number }> {
    const atual = await banco.comTenant(identidade.organizacaoId, async (c) => {
      const r = await c.query<{ senha_hash: string | null; senha_provisoria_ate: string | null }>(
        "SELECT senha_hash, senha_provisoria_ate FROM usuarios WHERE id = $1",
        [identidade.usuarioId],
      );
      return r.rows[0] ?? null;
    });

    /*
      A senha provisória que VENCEU não se troca (V2-F00-E07). A rota já
      recusa a escrita de quem tem prazo vencido (`auth/vigencia.ts`), mas esta
      regra não pode depender de a rota ter conferido: o prazo é lido de novo
      aqui, na mesma leitura da senha atual, e a recusa é a mesma de entrar
      com ela e de renová-la. Sem esta linha a regra moraria só na rota, e o
      serviço trocaria por uma senha definitiva a provisória que passou do
      prazo para qualquer outro chamador (e para a rota, se alguém um dia
      tirasse `/auth/trocar-senha` da conferência de vigência). Dizer "expirou,
      entre novamente" a quem já sabia a senha provisória não revela nada.
    */
    if (atual && senhaProvisoriaVencida(atual)) {
      throw new FalhaAutenticacao("sessao_encerrada", "Sessão expirada. Entre novamente.");
    }

    if (!(await conferirSenha(senhaAtual, atual?.senha_hash ?? null))) {
      throw new FalhaAutenticacao("credenciais", "A senha atual nao confere.");
    }

    const hash = await derivarSenha(senhaNova);
    /*
      `trocar_senha` grava o hash e derruba as outras sessões. A senha deixa
      de ser provisória no MESMO UPDATE, por gatilho do banco (migração 046):
      a regra "senha escolhida pela pessoa não é provisória" mora lá, e vale
      para este caminho e para o link de recuperação.
    */
    await banco.semTenant((c) =>
      c.query("SELECT trocar_senha($1,$2,$3)", [
        identidade.usuarioId, hash, identidade.sessaoId,
      ]),
    );

    /*
      UM TOKEN DE ACESSO NOVO PARA A MESMA SESSÃO, e sempre, não só quando a
      senha era provisória. A sessão de onde a pessoa trocou é preservada;
      o token que ela tem na mão foi emitido antes da troca e, se a senha era
      provisória, carrega a marca que tranca todo o resto. Sem isto, quem
      acabou de definir a própria senha continuaria trancado por até quinze
      minutos. Sempre, porque devolver o token só às vezes obrigaria o
      painel a tratar dois formatos de resposta.
    */
    const acesso = await emitirAcesso(
      config.jwtSegredos[0],
      {
        sub: identidade.usuarioId,
        org: identidade.organizacaoId,
        papel: identidade.papel,
        nome: identidade.nome,
        sid: identidade.sessaoId,
      },
      config.ACESSO_MINUTOS,
    );
    return { acesso, expiraEm: config.ACESSO_MINUTOS * 60 };
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
   * A PRESERVACAO VALE DE VERDADE desde a migracao 046: se um dos aparelhos
   * derrubados tentar renovar sozinho com o token que acabou de cair,
   * `tratarTokenRecusado` le o MOTIVO da revogacao ("encerradas pelo
   * proprio usuario"), ve que nao e rotacao, e responde 401 sem derrubar mais
   * nada. Antes disso `dono_do_token` (migracao 002) devolvia so o dono, e a
   * duvida entre "foi o proprio usuario" e "e um token roubado" caia para o
   * lado de derrubar tudo, inclusive esta sessao.
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

  /**
   * As sessões VIVAS da própria conta, para a pessoa reconhecer o que está
   * aberto e decidir se derruba.
   *
   * O QUE SAI E O QUE NÃO SAI: quando entrou, até quando vale, o aparelho em
   * uma frase e a marca de qual é esta. IP e user-agent completo ficam no
   * banco para investigação e não saem (IDN-29 do REL:06): a tela precisa que
   * a pessoa reconheça o aparelho, não que ela leia a máquina.
   *
   * UMA LINHA POR FAMÍLIA, e não por linha da tabela. A renovação rotaciona: a
   * sessão antiga fica revogada e a nova vive, então só a viva aparece, e o
   * "entrou em" é o da PRIMEIRA sessão da família (o login), porque a data da
   * linha viva é a da última renovação e diria "entrou há três minutos" a quem
   * está logado há uma semana.
   *
   * A MARCA "ESTA" É POR FAMÍLIA. O token de acesso carrega o id da sessão em
   * que nasceu; se essa sessão já foi rotacionada, ela está revogada e sumiu da
   * lista, mas a família dela é a mesma da que está viva. Comparar por família
   * mantém a marca na linha certa também nesse intervalo.
   */
  async function listarMinhasSessoes(identidade: Identidade): Promise<SessaoDaConta[]> {
    return banco.comTenant(identidade.organizacaoId, async (c) => {
      const r = await c.query<{
        entrou_em: string; expira_em: string; user_agent: string | null; atual: boolean;
      }>(
        `SELECT s.expira_em, s.user_agent,
                (SELECT min(f.criada_em) FROM sessoes f WHERE f.familia_id = s.familia_id) AS entrou_em,
                coalesce(s.familia_id = (SELECT a.familia_id FROM sessoes a WHERE a.id = $2), false) AS atual
           FROM sessoes s
          WHERE s.usuario_id = $1
            AND s.revogada_em IS NULL
            AND s.expira_em > now()
          ORDER BY atual DESC, entrou_em DESC`,
        [identidade.usuarioId, identidade.sessaoId],
      );
      return r.rows.map((l) => ({
        entrouEm: l.entrou_em,
        validaAte: l.expira_em,
        aparelho: resumirAparelho(l.user_agent),
        atual: l.atual,
      }));
    });
  }

  return {
    entrar, conferirSegundoFator, sessaoAposAtivacao, renovar, sair,
    pedirRecuperacao, redefinirSenha, trocarSenha, encerrarMinhasSessoes,
    listarMinhasSessoes, esperarEnvios,
  };
}

export type ServicoAutenticacao = ReturnType<typeof servicoDeAutenticacao>;
export type { Identidade };
