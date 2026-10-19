import type { FastifyInstance } from "fastify";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { aplicarMigracoes, carregarMigracoes, carregarSemente } from "@dc360/db";
import { bancoEmMemoria, type BancoEmMemoria } from "../src/banco/memoria.js";
import { bancoPostgres } from "../src/banco/postgres.js";
import type { Banco, Consulta } from "../src/banco/tipos.js";
import { carregarConfig } from "../src/config.js";
import { construirServidor } from "../src/servidor.js";
import { armazenamentoEmMemoria } from "../src/armazenamento/memoria.js";
import { derivarSenha } from "../src/auth/senha.js";
import { gerarTokenRenovacao, hashDoToken } from "../src/auth/tokens.js";

/**
 * A RENOVAÇÃO NÃO SOBREVIVE A UM ENCERRAMENTO QUE CHEGA NO MEIO DELA
 * (V2-F00-E07, correção 2).
 *
 * O DEFEITO, provado pela validação de 4b96ea7 contra Postgres 18.3: `renovar`
 * revogava a sessão antiga numa transação e abria a nova em OUTRA. Se quem
 * administra encerrava as sessões entre as duas, o UPDATE dele não via sessão
 * viva nenhuma (a antiga já estava rotacionada e a nova ainda não existia),
 * respondia 200, e a renovação abria a sessão nova herdando a família que
 * acabara de ser encerrada. Quem tinha o token saía com um par que renovava
 * por catorze dias, e o token de acesso anterior à renovação voltava a
 * escrever. Sobrou sessão viva em 5 de 60 corridas.
 *
 * O CONSERTO tem duas metades, e este arquivo cobra as duas:
 *
 * 1. UMA TRANSAÇÃO. Revogar a antiga e abrir a nova são confirmadas juntas:
 *    não existe mais o instante em que a família está sem sessão viva. É o
 *    que o primeiro bloco prova, no Postgres em WebAssembly, que serializa as
 *    transações e por isso não precisa de nada além disso para passar.
 * 2. UMA TRAVA POR PESSOA. Só a transação única não basta no Postgres de
 *    verdade: em READ COMMITTED, o UPDATE de quem encerra não enxerga a linha
 *    que uma transação ainda aberta inseriu. A renovação e todo encerramento
 *    em massa (quem administra, a própria pessoa, a troca de senha, o reuso de
 *    token, a desativação, o link de recuperação, a suspensão do município
 *    pelo console) tomam a mesma trava (`travar_sessoes_do_usuario`, migração
 *    049) num comando ANTERIOR ao UPDATE, e o UPDATE seguinte enxerga a sessão
 *    nova. É o que o segundo bloco prova, com conexões reais disputando. Ele
 *    prova também que a trava não traz impasse (deadlock) entre a troca de
 *    senha pela própria pessoa e a redefinição por quem administra.
 * 3. O LOGIN NO MESMO INSTANTE DA SUSPENSÃO (migração 050, revisão da
 *    correção 2). O login não passa pela trava por pessoa (abre família
 *    nova), e lia a suspensão do município sem trava: a sessão dele podia
 *    escapar da suspensão e voltar a valer na reativação. A 050 faz o login
 *    ler a suspensão com `FOR SHARE`; o caso 9 do segundo bloco disputa as
 *    duas ordens.
 * 4. O LOGIN NO MESMO INSTANTE DE UMA MUDANÇA DE CREDENCIAL (correção 3,
 *    achados 1 e 2 da validação de 52952a1). O login lia o hash, gastava o
 *    scrypt e abria a sessão em outra transação, sem trava: a troca de senha,
 *    a redefinição ou a desativação que confirmasse nesse intervalo não via
 *    a sessão que ainda ia nascer. Agora o login abre a sessão, toma a trava
 *    da pessoa e relê a credencial na mesma transação (`emitirPar`). Os casos
 *    6 a 8 do primeiro bloco e 10 a 12 do segundo deixam a mudança confirmar
 *    no meio do login; os 14 a 16 seguram o login com a trava já tomada e
 *    exigem que a mudança pare nela. O 9 e o 13 cobram que a renovação que
 *    perde a trava para a desativação diga `conta_desativada` (403). Os 17 a
 *    19 (revisão da correção 3) seguram o login DENTRO da transação, entre
 *    abrir a sessão e tomar a trava: a mudança termina inteira, e a releitura
 *    tem de recusar o login (401).
 * 5. A ORDEM DAS TRAVAS NO LOGIN (complemento da correção 3): linha do
 *    município antes da trava da pessoa, como a suspensão pelo console. O
 *    caso 10 do primeiro bloco confere a sequência de comandos; o 20 do
 *    segundo disputa o login com a suspensão e exige que ela espere a linha
 *    do município, e não a trava, sem impasse.
 * 6. A TROCA DE SENHA DE QUEM TEM A SENHA ANTIGA, EM VOO DURANTE A REAÇÃO
 *    (correção 4, achados 1 e 2 da validação de bb0f654). A troca conferia a
 *    senha atual numa transação e gravava a nova em outra, sem conferir nada:
 *    a redefinição, o link, a desativação, a troca pela própria pessoa ou o
 *    encerramento que confirmasse no meio era desfeito pela senha do invasor.
 *    Agora a troca segura a linha da pessoa, toma a trava e relê tudo na
 *    transação que grava. Os casos 11 a 17 do primeiro bloco e 21 a 27 do
 *    segundo seguram a troca depois de ler a senha atual e deixam a reação
 *    terminar; os 28 a 31 seguram a troca já com a linha e a trava e exigem
 *    que a reação pare nelas; o 7 do segundo bloco passou a exigir que a
 *    redefinição vença. O 18 cobra que a troca com o token de antes de uma
 *    renovação preserve a própria cadeia, e o 19 a ordem dos comandos.
 * 7. O LINK DE RECUPERAÇÃO E A REDEFINIÇÃO NO MESMO INSTANTE (V2-F00-E10,
 *    correção 3, migração 051): o link pendente morre com toda mudança de
 *    senha, por gatilho que segura a linha da pessoa antes das dos links, e
 *    `consumir_recuperacao` segue a mesma ordem. O caso 32 do segundo bloco
 *    segura o link dentro da função e exige que a redefinição espere, sem
 *    impasse.
 *
 * AS DISPUTAS SEGURADAS EXIGEM QUE A DISPUTA ACONTEÇA (revisão da correção
 * 2): no segundo bloco, a renovação só é solta depois de o teste VER, em
 * `pg_locks`, a outra conexão parada esperando trava. Antes ela era solta
 * depois de um tempo fixo, e numa máquina carregada o caso podia passar verde
 * sem ter disputado nada.
 *
 * O QUE NÃO PODE MUDAR, e também é cobrado aqui: a rotação não é expulsão. O
 * token de acesso emitido antes da renovação continua escrevendo pelos seus
 * quinze minutos, inclusive DURANTE a renovação (antes, a escrita que caía na
 * janela entre as duas transações levava 401 `sessao_encerrada`).
 *
 * POR QUE O SEGUNDO BLOCO SÓ RODA COM POSTGRES: o PGlite tem uma conexão só e
 * serializa as transações, então ele não reproduz a corrida que a trava
 * resolve. O bloco pede `DC360_POSTGRES_DE_PROVA` com a URL de um servidor
 * descartável onde o teste possa criar banco (`CREATE DATABASE`): cria um
 * `prova_c2_<sorteio>`, aplica as migrações, semeia, roda e apaga no fim. Sem
 * a variável ele é pulado por ambiente (política T42, `skipIf`).
 */

const SENHA = "defesa-civil-2026";
const SENHA_NOVA = "outra-senha-bem-forte-2026";
const SENHA_DO_INVASOR = "senha-escolhida-pelo-invasor-2026";
const SENHA_DA_VITIMA = "senha-nova-da-propria-pessoa-2026";
const SENHA_DO_LINK = "senha-definida-pelo-link-do-email-2026";
const HELENA = "11111111-1111-4111-8111-0000000000d1";
const OC_ALFA_1 = "11111111-1111-4111-8111-0000000000c1";
const EMAIL_HELENA = "helena.coutinho@serraalta.exemplo.gov.br";
const EMAIL_RITA = "rita.lopes@serraalta.exemplo.gov.br";
const URL_DE_PROVA = process.env.DC360_POSTGRES_DE_PROVA ?? "";

type Par = { acesso: string; renovacao: string };
type Chamada = { sql: string; params?: readonly unknown[] };

/**
 * O GRAMPO: uma casca sobre o `Banco` que deixa o teste segurar a renovação
 * num ponto exato, sem mexer em uma linha do código de produção.
 *
 * - `antes` roda antes de cada consulta, e pode segurar ali (dentro da
 *   transação, com o que ela já travou).
 * - `depois` roda depois do COMMIT de cada transação, com o que ela executou,
 *   e pode segurar ali (fora de qualquer transação).
 */
type Grampo = {
  antes?: (chamada: Chamada) => Promise<void>;
  depois?: (chamadas: Chamada[]) => Promise<void>;
};

function grampear(banco: Banco, grampo: { atual: Grampo | null }): Banco {
  function embrulhar<T>(
    abrir: (execucao: (c: Consulta) => Promise<T>) => Promise<T>,
    execucao: (c: Consulta) => Promise<T>,
  ): Promise<T> {
    const chamadas: Chamada[] = [];
    const resultado = abrir((c) => execucao({
      query: async <R>(sql: string, params?: readonly unknown[]) => {
        chamadas.push({ sql, params });
        await grampo.atual?.antes?.({ sql, params });
        return c.query<R>(sql, params);
      },
    }));
    return resultado.then(async (r) => {
      await grampo.atual?.depois?.(chamadas);
      return r;
    });
  }
  return {
    comTenant: (org, execucao) => embrulhar((e) => banco.comTenant(org, e), execucao),
    semTenant: (execucao) => embrulhar((e) => banco.semTenant(e), execucao),
    encerrar: () => banco.encerrar(),
  };
}

/** A transação revogou um token por rotação (é a renovação). */
const rotacionou = (chamadas: Chamada[]) =>
  chamadas.some((c) => c.sql.includes("revogar_sessao(") && c.params?.[1] === "rotacionada na renovacao");

/** A consulta abre a sessão nova HERDANDO uma família (só a renovação faz isso). */
const abreHerdando = (c: Chamada) => c.sql.includes("abrir_sessao(") && c.params?.[6] != null;

function esperar(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function sinal() {
  let disparar!: () => void;
  const disparado = new Promise<void>((r) => { disparar = r; });
  return { disparado, disparar };
}

/** O cenário montado, igual para os dois bancos: muda só de onde vêm as conexões. */
type Cenario = {
  app: FastifyInstance;
  grampo: { atual: Grampo | null };
  bruto: (sql: string, params?: unknown[]) => Promise<{ rows: Record<string, unknown>[] }>;
  tokenRita: string;
};

function auxiliares(cenario: () => Cenario) {
  const com = (t: string) => ({ authorization: `Bearer ${t}` });

  async function entrar(email = EMAIL_HELENA, senha = SENHA): Promise<Par> {
    const r = await cenario().app.inject({ method: "POST", url: "/auth/entrar", payload: { email, senha } });
    if (r.statusCode !== 200) throw new Error(`login falhou: ${r.body}`);
    return { acesso: r.json().acesso, renovacao: r.json().renovacao };
  }

  function pedirRenovacao(renovacao: string) {
    return cenario().app.inject({ method: "POST", url: "/auth/renovar", payload: { renovacao } });
  }

  function escrever(token: string) {
    return cenario().app.inject({
      method: "POST", url: `/ocorrencias/${OC_ALFA_1}/coordenada`, headers: com(token),
      payload: { coordenada: { lat: -22.41, lng: -45.45 }, motivo: "Ponto conferido no local pela equipe." },
    });
  }

  /**
   * Sessões de pé na CADEIA de quem renovou (a família do login `h`). Conta
   * a cadeia, e não a pessoa, porque dois dos encerramentos preservam de
   * propósito a sessão de quem clicou (encerrar as outras e trocar a senha).
   */
  async function sessoesVivasDaCadeia(h: Par): Promise<number> {
    const r = await cenario().bruto(
      `SELECT count(*)::int AS n FROM sessoes
        WHERE revogada_em IS NULL
          AND familia_id = (SELECT familia_id FROM sessoes WHERE token_hash = $1)`,
      [hashDoToken(h.renovacao)],
    );
    return Number(r.rows[0]!.n);
  }

  async function restaurarHelena(): Promise<void> {
    await cenario().bruto(
      "UPDATE usuarios SET ativo = true, senha_provisoria_ate = NULL, senha_hash = $2, falhas_login = 0, bloqueado_ate = NULL WHERE id = $1",
      [HELENA, await derivarSenha(SENHA)],
    );
  }

  /**
   * Os quatro encerramentos em massa que a renovação disputa. `preparar` roda
   * antes da disputa (e devolve o que o encerramento precisa); `disparar` é o
   * pedido concorrente; `esperado` é o status dele.
   */
  type Encerramento = {
    nome: string;
    preparar: (h: Par) => Promise<{ disparar: () => ReturnType<FastifyInstance["inject"]>; renovar: string }>;
    esperado: number;
    depois?: () => Promise<void>;
  };

  const encerramentos: Encerramento[] = [
    {
      nome: "quem administra encerra as sessões da pessoa",
      preparar: async (h) => ({
        renovar: h.renovacao,
        disparar: () => cenario().app.inject({
          method: "POST", url: `/usuarios/${HELENA}/encerrar-sessoes`, headers: com(cenario().tokenRita),
        }),
      }),
      esperado: 200,
    },
    {
      nome: "a própria pessoa encerra as outras sessões, de outro aparelho",
      preparar: async (h) => {
        const painel = await entrar();
        return {
          renovar: h.renovacao,
          disparar: () => cenario().app.inject({
            method: "POST", url: "/auth/encerrar-sessoes", headers: com(painel.acesso),
          }),
        };
      },
      esperado: 200,
    },
    {
      nome: "a pessoa troca a senha em outro aparelho",
      preparar: async (h) => {
        const quemTroca = await entrar();
        return {
          renovar: h.renovacao,
          disparar: () => cenario().app.inject({
            method: "POST", url: "/auth/trocar-senha", headers: com(quemTroca.acesso),
            payload: { senhaAtual: SENHA, senha: SENHA_NOVA },
          }),
        };
      },
      esperado: 200,
      depois: restaurarHelena,
    },
    {
      nome: "um token de renovação já gasto reaparece (reuso)",
      preparar: async (h) => {
        // A cadeia já rotacionou uma vez: `h.renovacao` é o token gasto.
        const legitimo = await pedirRenovacao(h.renovacao);
        if (legitimo.statusCode !== 200) throw new Error(`renovação de preparo falhou: ${legitimo.body}`);
        return {
          renovar: legitimo.json().renovacao,
          disparar: () => pedirRenovacao(h.renovacao),
        };
      },
      esperado: 401,
    },
  ];

  /**
   * O que tem de valer depois da disputa, qualquer que tenha sido a ordem: o
   * encerramento respondeu o que promete, nenhuma sessão da pessoa ficou de
   * pé, o par que a renovação eventualmente entregou não renova nem escreve,
   * e o token de acesso de antes da renovação também não escreve.
   */
  async function exigirCadeiaMorta(
    encerramento: { statusCode: number; body: string },
    esperado: number,
    renovacao: { statusCode: number; json: () => { acesso: string; renovacao: string } },
    h: Par,
  ): Promise<void> {
    expect(encerramento.statusCode, encerramento.body).toBe(esperado);
    expect(await sessoesVivasDaCadeia(h), "sobrou sessão viva numa cadeia encerrada").toBe(0);
    if (renovacao.statusCode === 200) {
      const par = renovacao.json();
      const outra = await pedirRenovacao(par.renovacao);
      expect(outra.statusCode, "o par entregue no meio do encerramento ainda renova").toBe(401);
      const escrita = await escrever(par.acesso);
      expect(escrita.statusCode, "o token entregue no meio do encerramento ainda escreve").toBe(401);
    }
    const antiga = await escrever(h.acesso);
    expect(antiga.statusCode, "o token de antes da renovação voltou a escrever").toBe(401);
  }

  /**
   * Sessões de pé da Helena FORA das famílias preservadas. É a conta do login
   * disputado (correção 3): a troca de senha pela própria pessoa preserva de
   * propósito a cadeia de onde ela trocou, e todo o resto tem de estar morto.
   */
  async function vivasDaHelenaFora(preservadas: string[]): Promise<number> {
    const r = await cenario().bruto(
      `SELECT count(*)::int AS n FROM sessoes
        WHERE usuario_id = $1 AND revogada_em IS NULL
          AND NOT (familia_id = ANY($2::uuid[]))`,
      [HELENA, preservadas],
    );
    return Number(r.rows[0]!.n);
  }

  async function familiaDe(p: Par): Promise<string> {
    const r = await cenario().bruto(
      "SELECT familia_id FROM sessoes WHERE token_hash = $1", [hashDoToken(p.renovacao)],
    );
    return String(r.rows[0]!.familia_id);
  }

  /** Começa a disputa sem sessão viva da Helena sobrando de caso anterior. */
  async function limparSessoesDaHelena(): Promise<void> {
    await cenario().bruto(
      "UPDATE sessoes SET revogada_em = now(), motivo_revogacao = 'limpeza do teste' WHERE usuario_id = $1 AND revogada_em IS NULL",
      [HELENA],
    );
  }

  /**
   * As três mudanças de credencial que o login com a senha ANTIGA disputa
   * (V2-F00-E07, correção 3, achado 1 da validação de 52952a1). Todas
   * atualizam `usuarios` e só depois tomam a trava da pessoa e encerram as
   * sessões; a sessão que o login abrir tem de cair junto ou nem nascer.
   */
  type MudancaDeCredencial = {
    nome: string;
    /** Devolve o pedido concorrente e as famílias que ele preserva de propósito. */
    preparar: () => Promise<{ disparar: () => ReturnType<FastifyInstance["inject"]>; preservadas: string[] }>;
  };

  const mudancasDeCredencial: MudancaDeCredencial[] = [
    {
      nome: "a própria pessoa troca a senha em outro aparelho",
      preparar: async () => {
        const quemTroca = await entrar();
        return {
          preservadas: [await familiaDe(quemTroca)],
          disparar: () => cenario().app.inject({
            method: "POST", url: "/auth/trocar-senha", headers: com(quemTroca.acesso),
            payload: { senhaAtual: SENHA, senha: SENHA_NOVA },
          }),
        };
      },
    },
    {
      nome: "quem administra redefine a senha da pessoa",
      preparar: async () => ({
        preservadas: [],
        disparar: () => cenario().app.inject({
          method: "POST", url: `/usuarios/${HELENA}/redefinir-senha`, headers: com(cenario().tokenRita),
        }),
      }),
    },
    {
      nome: "quem administra desativa a conta",
      preparar: async () => ({
        preservadas: [],
        disparar: () => cenario().app.inject({
          method: "PATCH", url: `/usuarios/${HELENA}/situacao`, headers: com(cenario().tokenRita),
          payload: { ativo: false },
        }),
      }),
    },
  ];

  /** O login da Helena com a senha de antes, pela rota de verdade. */
  function entrarComASenhaAntiga() {
    return cenario().app.inject({
      method: "POST", url: "/auth/entrar", payload: { email: EMAIL_HELENA, senha: SENHA },
    });
  }

  /**
   * O que tem de valer depois de um login disputado com uma mudança de
   * credencial: a mudança respondeu 200, nenhuma sessão da Helena ficou de pé
   * fora da cadeia preservada e, se o login devolveu um par, ele não renova.
   */
  async function exigirLoginSemSobra(
    mudanca: { statusCode: number; body: string },
    login: { statusCode: number; body: string; json: () => { renovacao?: string } },
    preservadas: string[],
  ): Promise<void> {
    expect(mudanca.statusCode, mudanca.body).toBe(200);
    expect(await vivasDaHelenaFora(preservadas), `sobrou sessão viva do login disputado (login: ${login.statusCode})`).toBe(0);
    if (login.statusCode === 200) {
      const depois = await pedirRenovacao(login.json().renovacao!);
      expect([401, 403], `o par do login disputado ainda renova: ${depois.body}`).toContain(depois.statusCode);
    } else {
      expect(login.statusCode, login.body).toBe(401);
    }
  }

  /** Login da Helena com uma senha qualquer, pela rota de verdade, sem exigir 200. */
  function tentarEntrar(senha: string) {
    return cenario().app.inject({
      method: "POST", url: "/auth/entrar", payload: { email: EMAIL_HELENA, senha },
    });
  }

  /** A troca de senha de quem tem a senha ANTIGA e uma sessão (o invasor). */
  function trocarComoInvasor(invasor: Par) {
    return cenario().app.inject({
      method: "POST", url: "/auth/trocar-senha", headers: com(invasor.acesso),
      payload: { senhaAtual: SENHA, senha: SENHA_DO_INVASOR },
    });
  }

  /** A troca de senha com o token de `quem`, da senha antiga para `senha`. */
  function trocarComo(quem: Par, senha: string) {
    return cenario().app.inject({
      method: "POST", url: "/auth/trocar-senha", headers: com(quem.acesso),
      payload: { senhaAtual: SENHA, senha },
    });
  }

  type Resposta = Awaited<ReturnType<FastifyInstance["inject"]>>;

  /**
   * As reações de quem desconfia de vazamento, que a troca de senha do
   * invasor disputa (correção 4, achado 1 da validação de bb0f654). `senha`
   * diz qual senha tem de valer no fim, se a reação vencer; `recusa` é o que a
   * troca do invasor tem de receber quando confirma DEPOIS da reação.
   */
  type ReacaoAoInvasor = {
    nome: string;
    preparar: () => Promise<{ disparar: () => ReturnType<FastifyInstance["inject"]> }>;
    senha: (reacao: Resposta) => string | null;
    recusa: { status: number; erro: string };
    /** A reação muda a senha (a do invasor não pode valer depois dela, em nenhuma ordem). */
    mudaASenha: boolean;
  };

  const reacoesAoInvasor: ReacaoAoInvasor[] = [
    {
      nome: "quem administra redefine a senha da pessoa",
      preparar: async () => ({
        disparar: () => cenario().app.inject({
          method: "POST", url: `/usuarios/${HELENA}/redefinir-senha`, headers: com(cenario().tokenRita),
        }),
      }),
      senha: (r) => String(r.json().senhaTemporaria),
      recusa: { status: 401, erro: "sessao_encerrada" },
      mudaASenha: true,
    },
    {
      nome: "a pessoa redefine a senha pelo link do email",
      preparar: async () => {
        const token = gerarTokenRenovacao();
        await cenario().bruto(
          `INSERT INTO recuperacoes_senha (organizacao_id, usuario_id, token_hash, expira_em)
           SELECT organizacao_id, id, $2, now() + interval '30 minutes' FROM usuarios WHERE id = $1`,
          [HELENA, hashDoToken(token)],
        );
        return {
          disparar: () => cenario().app.inject({
            method: "POST", url: "/auth/redefinir", payload: { token, senha: SENHA_DO_LINK },
          }),
        };
      },
      senha: () => SENHA_DO_LINK,
      recusa: { status: 401, erro: "sessao_encerrada" },
      mudaASenha: true,
    },
    {
      nome: "quem administra desativa a conta",
      preparar: async () => ({
        disparar: () => cenario().app.inject({
          method: "PATCH", url: `/usuarios/${HELENA}/situacao`, headers: com(cenario().tokenRita),
          payload: { ativo: false },
        }),
      }),
      senha: () => null,
      recusa: { status: 403, erro: "conta_desativada" },
      mudaASenha: false,
    },
    {
      nome: "a própria pessoa troca a senha em outro aparelho",
      preparar: async () => {
        const vitima = await entrar();
        return {
          disparar: () => cenario().app.inject({
            method: "POST", url: "/auth/trocar-senha", headers: com(vitima.acesso),
            payload: { senhaAtual: SENHA, senha: SENHA_DA_VITIMA },
          }),
        };
      },
      senha: () => SENHA_DA_VITIMA,
      recusa: { status: 401, erro: "sessao_encerrada" },
      mudaASenha: true,
    },
    {
      nome: "quem administra encerra as sessões da pessoa",
      preparar: async () => ({
        disparar: () => cenario().app.inject({
          method: "POST", url: `/usuarios/${HELENA}/encerrar-sessoes`, headers: com(cenario().tokenRita),
        }),
      }),
      senha: () => SENHA,
      recusa: { status: 401, erro: "sessao_encerrada" },
      mudaASenha: false,
    },
  ];

  /** Sessões de pé na família do par `p` (a cadeia do invasor). */
  async function vivasNaFamilia(familia: string): Promise<number> {
    const r = await cenario().bruto(
      "SELECT count(*)::int AS n FROM sessoes WHERE familia_id = $1 AND revogada_em IS NULL", [familia],
    );
    return Number(r.rows[0]!.n);
  }

  /**
   * O que tem de valer quando a reação confirmou ANTES da gravação do
   * invasor: a reação respondeu 200; a troca do invasor foi recusada com o
   * código do caso; a cadeia dele não tem sessão de pé; a senha dele não
   * entra; a senha da reação entra (a temporária da redefinição continua
   * provisória); e, desativada a conta, reativá-la não devolve a senha dele.
   */
  async function exigirQueAReacaoVenceu(
    reacao: ReacaoAoInvasor, rr: Resposta, troca: Resposta, familiaDoInvasor: string,
  ): Promise<void> {
    expect(rr.statusCode, `reação (${reacao.nome}): ${rr.body}`).toBe(200);
    expect(troca.statusCode, `a troca do invasor, que confirmou depois da reação: ${troca.body}`).toBe(reacao.recusa.status);
    expect(troca.json().erro, troca.body).toBe(reacao.recusa.erro);
    expect(await vivasNaFamilia(familiaDoInvasor), "a cadeia do invasor ficou com sessão de pé").toBe(0);
    if (reacao.recusa.erro === "conta_desativada") {
      await cenario().bruto("UPDATE usuarios SET ativo = true WHERE id = $1", [HELENA]);
    }
    const doInvasor = await tentarEntrar(SENHA_DO_INVASOR);
    expect(doInvasor.statusCode, `a senha do invasor entra depois da reação: ${doInvasor.body}`).toBe(401);
    const senhaDaReacao = reacao.senha(rr) ?? SENHA;
    const daReacao = await tentarEntrar(senhaDaReacao);
    expect(daReacao.statusCode, `a senha que a reação deixou não entra: ${daReacao.body}`).toBe(200);
    if (reacao.nome.startsWith("quem administra redefine")) {
      expect(daReacao.json().trocaDeSenhaObrigatoria, "a temporária deixou de ser provisória").toBe(true);
    }
  }

  return {
    entrar, pedirRenovacao, escrever, sessoesVivasDaCadeia, restaurarHelena, encerramentos, exigirCadeiaMorta,
    mudancasDeCredencial, entrarComASenhaAntiga, exigirLoginSemSobra, limparSessoesDaHelena,
    tentarEntrar, trocarComoInvasor, trocarComo, reacoesAoInvasor, vivasNaFamilia, exigirQueAReacaoVenceu, familiaDe,
    bruto: (sql: string, params?: unknown[]) => cenario().bruto(sql, params),
  };
}

/** A transação que registrou o ACERTO da senha no login (é a última antes da sessão). */
const registrouAcerto = (chamadas: Chamada[]) =>
  chamadas.some((c) => c.sql.includes("registrar_tentativa_login($1, true"));

/** A releitura da credencial sob a trava, dentro da transação que abre a sessão do login. */
const releCredencial = (c: Chamada) => /SELECT senha_hash, ativo\s+FROM usuarios/.test(c.sql);

/** A primeira transação da renovação: a leitura da sessão pelo token, antes da trava. */
const leuSessaoPorToken = (chamadas: Chamada[]) =>
  chamadas.some((c) => c.sql.includes("sessao_por_token("));

/**
 * Os casos da correção 3 que valem igual nos dois bancos, porque seguram o
 * pedido FORA de qualquer transação (no `depois`, já confirmado): o PGlite,
 * que tem uma conexão só, não trava, e o Postgres de verdade disputa igual.
 */
function casosDaCorrecao3(a: ReturnType<typeof auxiliares>, grampo: { atual: Grampo | null }, primeiro: number) {
  /*
    O LOGIN COM A SENHA ANTIGA NO MESMO INSTANTE DE UMA MUDANÇA DE CREDENCIAL
    (achado 1 da validação de 52952a1). O login lê o hash, gasta o scrypt
    (centenas de milissegundos) e só então abre a sessão. Se a troca, a
    redefinição ou a desativação confirma nesse intervalo, o UPDATE de
    `sessoes` dela não vê a sessão que ainda não existe, e até a correção 3 o
    login a abria depois, viva. A disputa segura o login logo depois de ele
    registrar o acerto da senha (fora de transação), deixa a mudança terminar
    inteira, e só então o solta: a sessão do login tem de não nascer.
  */
  for (const [i, mudanca] of a.mudancasDeCredencial.entries()) {
    it(`${primeiro + i}. o login com a senha antiga confere a senha enquanto ${mudanca.nome}: a sessão do login não sobrevive`, async () => {
      await a.limparSessoesDaHelena();
      const disputa = await mudanca.preparar();
      const janela = sinal();
      const solta = sinal();
      let segurou = false;
      grampo.atual = {
        depois: async (chamadas) => {
          if (segurou || !registrouAcerto(chamadas)) return;
          segurou = true;
          janela.disparar();
          await solta.disparado;
        },
      };
      const pendentes: Promise<unknown>[] = [];
      try {
        const login = a.entrarComASenhaAntiga();
        pendentes.push(login);
        const primeiro = await Promise.race([
          janela.disparado.then(() => "segurou" as const),
          login.then(() => "terminou" as const),
        ]);
        expect(primeiro, "a disputa não aconteceu: o login terminou sem registrar o acerto da senha").toBe("segurou");
        const m = await disputa.disparar();
        solta.disparar();
        grampo.atual = null;
        await a.exigirLoginSemSobra(m, await login, disputa.preservadas);
      } finally {
        solta.disparar();
        grampo.atual = null;
        await Promise.allSettled(pendentes);
        await a.restaurarHelena();
      }
    }, 120_000);
  }

  /*
    A RENOVAÇÃO QUE PERDE PARA A DESATIVAÇÃO diz que a conta foi desativada
    (achado 2 da validação de 52952a1). A renovação lê a sessão pelo token
    (conta ativa), e a desativação confirma antes de ela tomar a trava: o
    `revogar_sessao` da renovação devolve zero. Até a correção 3 a resposta era
    401 `sessao_encerrada`, e o painel mandava a pessoa entrar de novo para ler
    a recusa genérica, que é o desfecho que a correção 1 da E05 consertou.
  */
  it(`${primeiro + a.mudancasDeCredencial.length}. a renovação perde a trava para a desativação: 403 conta_desativada, e não 401`, async () => {
    await a.limparSessoesDaHelena();
    const h = await a.entrar();
    const janela = sinal();
    const solta = sinal();
    let segurou = false;
    grampo.atual = {
      depois: async (chamadas) => {
        if (segurou || !leuSessaoPorToken(chamadas)) return;
        segurou = true;
        janela.disparar();
        await solta.disparado;
      },
    };
    const pendentes: Promise<unknown>[] = [];
    try {
      const renovacao = a.pedirRenovacao(h.renovacao);
      pendentes.push(renovacao);
      await janela.disparado;
      const desativacao = await a.mudancasDeCredencial[2]!.preparar().then((d) => d.disparar());
      expect(desativacao.statusCode, desativacao.body).toBe(200);
      solta.disparar();
      grampo.atual = null;
      const r = await renovacao;
      expect(r.statusCode, r.body).toBe(403);
      expect(r.json().erro).toBe("conta_desativada");
    } finally {
      solta.disparar();
      grampo.atual = null;
      await Promise.allSettled(pendentes);
      await a.restaurarHelena();
    }
  }, 120_000);
}

/** A transação em que a troca de senha leu a senha atual (antes dos dois scrypt). */
const leuASenhaAtualDaTroca = (chamadas: Chamada[]) =>
  chamadas.some((c) => /SELECT senha_hash, senha_provisoria_ate\s+FROM usuarios/.test(c.sql));

/**
 * Os casos da correção 4 que valem igual nos dois bancos, porque seguram a
 * troca do invasor FORA de qualquer transação: logo depois de ela ler a senha
 * atual e antes dos dois scrypt (conferir a atual e derivar a nova).
 */
function casosDaCorrecao4(a: ReturnType<typeof auxiliares>, grampo: { atual: Grampo | null }, primeiro: number) {
  /*
    A TROCA DE SENHA DO INVASOR EM VOO DURANTE A REAÇÃO (achado 1 da validação
    de bb0f654). O invasor tem a senha antiga e uma sessão, e manda trocar a
    senha por uma dele. A troca lê a senha atual e é SEGURADA ali; a reação
    (redefinição por quem administra, link do email, desativação, troca pela
    própria pessoa em outro aparelho, encerrar as sessões) termina inteira;
    solta, a troca tem de ser recusada, e a senha que vale no fim é a da
    reação. Até a correção 4 a troca respondia 200 e gravava a senha do
    invasor por cima da reação.
  */
  for (const [i, reacao] of a.reacoesAoInvasor.entries()) {
    it(`${primeiro + i}. a troca de senha do invasor conferiu a senha antiga quando ${reacao.nome}: a troca é recusada e a reação vale`, async () => {
      await a.limparSessoesDaHelena();
      const invasor = await a.entrar();
      const familia = await a.familiaDe(invasor);
      const disputa = await reacao.preparar();
      const janela = sinal();
      const solta = sinal();
      let segurou = false;
      grampo.atual = {
        depois: async (chamadas) => {
          if (segurou || !leuASenhaAtualDaTroca(chamadas)) return;
          segurou = true;
          janela.disparar();
          await solta.disparado;
        },
      };
      const pendentes: Promise<unknown>[] = [];
      try {
        const troca = a.trocarComoInvasor(invasor);
        pendentes.push(troca);
        const quem = await Promise.race([
          janela.disparado.then(() => "segurou" as const),
          troca.then(() => "terminou" as const),
        ]);
        expect(quem, "a disputa não aconteceu: a troca terminou sem ler a senha atual").toBe("segurou");
        const rr = await disputa.disparar();
        solta.disparar();
        const rt = await troca;
        grampo.atual = null;
        await a.exigirQueAReacaoVenceu(reacao, rr, rt, familia);
      } finally {
        solta.disparar();
        grampo.atual = null;
        await Promise.allSettled(pendentes);
        await a.restaurarHelena();
      }
    }, 120_000);
  }

  /*
    A MESMA SESSÃO TROCA A SENHA DUAS VEZES AO MESMO TEMPO (o token de acesso
    copiado por quem invadiu, ou a mesma pessoa em duas abas). A troca da
    pessoa preserva a própria cadeia, que é também a do invasor: a sessão
    continua de pé, e o que muda é o hash. Solta, a troca do invasor tem de
    ver que a senha atual não é mais a que o scrypt conferiu e responder a
    mesma recusa da senha atual errada (401 `credenciais`).
  */
  it(`${primeiro + a.reacoesAoInvasor.length}. a troca do invasor conferiu a senha antiga quando a pessoa troca a senha com o mesmo token: 401 credenciais e a senha da pessoa vale`, async () => {
    await a.limparSessoesDaHelena();
    const invasor = await a.entrar();
    const janela = sinal();
    const solta = sinal();
    let segurou = false;
    grampo.atual = {
      depois: async (chamadas) => {
        if (segurou || !leuASenhaAtualDaTroca(chamadas)) return;
        segurou = true;
        janela.disparar();
        await solta.disparado;
      },
    };
    const pendentes: Promise<unknown>[] = [];
    try {
      const troca = a.trocarComoInvasor(invasor);
      pendentes.push(troca);
      const quem = await Promise.race([
        janela.disparado.then(() => "segurou" as const),
        troca.then(() => "terminou" as const),
      ]);
      expect(quem, "a disputa não aconteceu: a troca terminou sem ler a senha atual").toBe("segurou");
      // `segurou` já é verdadeiro: a troca da pessoa passa sem ser segurada.
      const daPessoa = await a.trocarComo(invasor, SENHA_DA_VITIMA);
      expect(daPessoa.statusCode, daPessoa.body).toBe(200);
      solta.disparar();
      const rt = await troca;
      grampo.atual = null;
      expect(rt.statusCode, `a troca do invasor, que confirmou depois: ${rt.body}`).toBe(401);
      expect(rt.json().erro, rt.body).toBe("credenciais");
      expect((await a.tentarEntrar(SENHA_DO_INVASOR)).statusCode, "a senha do invasor entra").toBe(401);
      expect((await a.tentarEntrar(SENHA_DA_VITIMA)).statusCode, "a senha da pessoa não entra").toBe(200);
    } finally {
      solta.disparar();
      grampo.atual = null;
      await Promise.allSettled(pendentes);
      await a.restaurarHelena();
    }
  }, 120_000);

  /*
    A SENHA PROVISÓRIA QUE VENCE NO MEIO DA TROCA. A troca lê a provisória no
    prazo, é segurada, e o prazo passa (o teste o move para trás, que é o
    efeito do relógio). Solta, ela tem de responder 401 `sessao_encerrada` sem
    gravar nada, a mesma recusa de quem chega com o prazo já vencido.
  */
  it(`${primeiro + a.reacoesAoInvasor.length + 1}. a senha provisória vence entre a conferência e a gravação da troca: 401 e o hash fica`, async () => {
    await a.limparSessoesDaHelena();
    // A provisória no prazo, e uma sessão aberta com ela (o token traz a marca).
    await a.bruto("UPDATE usuarios SET senha_provisoria_ate = now() + interval '1 hour' WHERE id = $1", [HELENA]);
    const comProvisoria = await a.entrar();
    const familia = await a.familiaDe(comProvisoria);
    const hashAntes = String((await a.bruto("SELECT senha_hash FROM usuarios WHERE id = $1", [HELENA])).rows[0]!.senha_hash);
    const janela = sinal();
    const solta = sinal();
    let segurou = false;
    grampo.atual = {
      depois: async (chamadas) => {
        if (segurou || !leuASenhaAtualDaTroca(chamadas)) return;
        segurou = true;
        janela.disparar();
        await solta.disparado;
      },
    };
    const pendentes: Promise<unknown>[] = [];
    try {
      const troca = a.trocarComoInvasor(comProvisoria);
      pendentes.push(troca);
      const quem = await Promise.race([
        janela.disparado.then(() => "segurou" as const),
        troca.then(() => "terminou" as const),
      ]);
      expect(quem, "a disputa não aconteceu: a troca terminou sem ler a senha atual").toBe("segurou");
      await a.bruto("UPDATE usuarios SET senha_provisoria_ate = now() - interval '1 minute' WHERE id = $1", [HELENA]);
      solta.disparar();
      const rt = await troca;
      grampo.atual = null;
      expect(rt.statusCode, `a troca com a provisória vencida no meio: ${rt.body}`).toBe(401);
      expect(rt.json().erro, rt.body).toBe("sessao_encerrada");
      const depois = await a.bruto("SELECT senha_hash, senha_provisoria_ate FROM usuarios WHERE id = $1", [HELENA]);
      expect(String(depois.rows[0]!.senha_hash), "a troca gravou o hash com a provisória vencida").toBe(hashAntes);
      expect(depois.rows[0]!.senha_provisoria_ate, "a troca tirou a marca de provisória").not.toBeNull();
      expect(await a.vivasNaFamilia(familia), "a troca recusada encerrou a própria cadeia").toBe(1);
    } finally {
      solta.disparar();
      grampo.atual = null;
      await Promise.allSettled(pendentes);
      await a.restaurarHelena();
    }
  }, 120_000);
}

function configDeTeste() {
  return carregarConfig({
    NODE_ENV: "test",
    JWT_SEGREDO: "segredo-da-renovacao-contra-encerramento-32b!",
    LOGIN_POR_IP: "10000",
  } as NodeJS.ProcessEnv);
}

// ---------------------------------------------------------------------------
// 1. Postgres em WebAssembly: a transação única.
// ---------------------------------------------------------------------------

describe("Renovação e encerramento no mesmo instante: a renovação é UMA transação", () => {
  let mem: BancoEmMemoria;
  let cen: Cenario;
  const grampo: { atual: Grampo | null } = { atual: null };
  const a = auxiliares(() => cen);

  beforeAll(async () => {
    mem = await bancoEmMemoria({ semear: true });
    const app = await construirServidor({
      banco: grampear(mem.banco, grampo), config: configDeTeste(),
      armazenamento: armazenamentoEmMemoria({ baseUrl: "http://api.local" }),
    });
    await app.ready();
    cen = {
      app, grampo, tokenRita: "",
      bruto: async (sql, params) => {
        const r = await mem.bruto.query<Record<string, unknown>>(sql, params);
        return { rows: r.rows };
      },
    };
    cen.tokenRita = (await a.entrar(EMAIL_RITA)).acesso;
  }, 180_000);

  afterAll(async () => {
    await cen?.app.close();
    await mem?.banco.encerrar();
  });

  /*
    A DISPUTA, em ordem fixa: a renovação confirma a transação em que
    rotacionou e é SEGURADA logo depois do COMMIT; o encerramento roda inteiro
    nesse instante; só então a renovação segue. Com revogar e abrir em
    transações separadas, esse instante é exatamente o buraco (a família sem
    sessão viva) e o encerramento não acha o que encerrar. Com a transação
    única, quando a renovação confirma a sessão nova já existe, e o
    encerramento a derruba.
  */
  for (const [i, enc] of a.encerramentos.entries()) {
    it(`${i + 1}. ${enc.nome}: nenhuma sessão da cadeia sobrevive`, async () => {
      const h = await a.entrar();
      const disputa = await enc.preparar(h);
      const janela = sinal();
      const solta = sinal();
      grampo.atual = {
        depois: async (chamadas) => {
          if (!rotacionou(chamadas)) return;
          janela.disparar();
          await solta.disparado;
        },
      };
      try {
        const renovacao = a.pedirRenovacao(disputa.renovar);
        await janela.disparado;
        const encerramento = await disputa.disparar();
        solta.disparar();
        grampo.atual = null;
        await a.exigirCadeiaMorta(encerramento, enc.esperado, await renovacao, h);
      } finally {
        solta.disparar();
        grampo.atual = null;
        await enc.depois?.();
      }
    }, 120_000);
  }

  it("5. a rotação não é expulsão: o token de antes da renovação escreve logo depois de ela confirmar", async () => {
    const h = await a.entrar();
    const janela = sinal();
    const solta = sinal();
    grampo.atual = {
      depois: async (chamadas) => {
        if (!rotacionou(chamadas)) return;
        janela.disparar();
        await solta.disparado;
      },
    };
    try {
      const renovacao = a.pedirRenovacao(h.renovacao);
      await janela.disparado;
      // Antes: a antiga já revogada, a nova ainda não aberta, e a escrita
      // legítima levava 401 `sessao_encerrada` (a "janela na renovação").
      const escrita = await a.escrever(h.acesso);
      solta.disparar();
      grampo.atual = null;
      expect(escrita.statusCode, escrita.body).toBe(200);
      const r = await renovacao;
      expect(r.statusCode, r.body).toBe(200);
      expect((await a.escrever(r.json().acesso)).statusCode).toBe(200);
    } finally {
      solta.disparar();
      grampo.atual = null;
    }
  });

  casosDaCorrecao3(a, grampo, 6);

  /*
    A ORDEM DOS COMANDOS DO LOGIN (complemento da correção 3). Nenhum outro
    caso deste bloco reprova se `emitirPar` tomar a trava da pessoa ANTES de
    `abrir_sessao`, e essa inversão fecha ciclo com a suspensão pelo console
    (ver o caso 20 do segundo bloco, que mede o impasse em Postgres real). O
    PGlite não trava nada, então aqui a guarda é a sequência: na transação do
    login, `abrir_sessao` (que lê a linha do município com FOR SHARE, 050), depois
    a trava, depois a releitura da credencial.
  */
  it("10. o login abre a sessão antes de tomar a trava da pessoa, e relê a credencial depois dela", async () => {
    await a.limparSessoesDaHelena();
    const sequencia: string[] = [];
    grampo.atual = {
      antes: async (chamada) => {
        if (chamada.sql.includes("abrir_sessao(") && chamada.params?.[6] == null) sequencia.push("abrir_sessao");
        else if (chamada.sql.includes("travar_sessoes_do_usuario(")) sequencia.push("trava");
        else if (releCredencial(chamada)) sequencia.push("releitura");
      },
    };
    try {
      const login = await a.entrarComASenhaAntiga();
      expect(login.statusCode, login.body).toBe(200);
      expect(sequencia, "a ordem do login é linha do município, trava e releitura; a trava antes da linha fecha ciclo com a suspensão")
        .toEqual(["abrir_sessao", "trava", "releitura"]);
    } finally {
      grampo.atual = null;
    }
  });

  // 11 a 17: os casos da correção 4 que valem nos dois bancos.
  casosDaCorrecao4(a, grampo, 11);

  /*
    A TROCA DE SENHA COM O TOKEN DE ANTES DA RENOVAÇÃO preserva a própria
    cadeia (correção 4, achado 2 da validação de bb0f654). O `sid` desse token
    é a sessão já rotacionada; até a correção 4 `trocar_senha` preservava só
    essa linha, encerrava a viva da mesma cadeia e respondia "as outras
    sessões foram encerradas" a quem acabava de ser expulso.
  */
  it("18. trocar a senha com o token de antes da renovação: a própria cadeia continua de pé", async () => {
    await a.limparSessoesDaHelena();
    const h = await a.entrar();
    const r = await a.pedirRenovacao(h.renovacao);
    expect(r.statusCode, r.body).toBe(200);
    const novo = r.json() as Par;
    try {
      const troca = await cen.app.inject({
        method: "POST", url: "/auth/trocar-senha", headers: { authorization: `Bearer ${h.acesso}` },
        payload: { senhaAtual: SENHA, senha: SENHA_NOVA },
      });
      expect(troca.statusCode, troca.body).toBe(200);
      expect((await a.escrever(troca.json().acesso)).statusCode, "o token que a troca devolveu não escreve").toBe(200);
      expect((await a.escrever(novo.acesso)).statusCode, "o token da renovação não escreve depois da troca").toBe(200);
      const outra = await a.pedirRenovacao(novo.renovacao);
      expect(outra.statusCode, `a própria cadeia não renova depois da troca: ${outra.body}`).toBe(200);
    } finally {
      await a.restaurarHelena();
    }
  });

  /*
    A ORDEM DOS COMANDOS DA TROCA (correção 4). O PGlite não trava nada, então
    a guarda aqui é a sequência na transação que grava: a linha da pessoa em
    `usuarios` (FOR NO KEY UPDATE), depois a trava da pessoa, depois
    `trocar_senha`. A trava antes da linha fecha ciclo com a redefinição por
    quem administra (linha, depois trava): o caso 7 do segundo bloco mede.
  */
  it("19. a troca segura a linha da pessoa antes de tomar a trava, e grava depois dela", async () => {
    await a.limparSessoesDaHelena();
    const h = await a.entrar();
    const sequencia: string[] = [];
    grampo.atual = {
      antes: async (chamada) => {
        if (/FROM usuarios WHERE id = \$1 FOR NO KEY UPDATE/.test(chamada.sql)) sequencia.push("linha");
        else if (chamada.sql.includes("travar_sessoes_do_usuario(")) sequencia.push("trava");
        else if (chamada.sql.includes("trocar_senha(")) sequencia.push("grava");
      },
    };
    try {
      const troca = await cen.app.inject({
        method: "POST", url: "/auth/trocar-senha", headers: { authorization: `Bearer ${h.acesso}` },
        payload: { senhaAtual: SENHA, senha: SENHA_NOVA },
      });
      expect(troca.statusCode, troca.body).toBe(200);
      expect(sequencia, "a ordem da troca é linha da pessoa, trava e gravação; a trava antes da linha fecha ciclo com a redefinição")
        .toEqual(["linha", "trava", "grava"]);
    } finally {
      grampo.atual = null;
      await a.restaurarHelena();
    }
  });
});

// ---------------------------------------------------------------------------
// 2. Postgres de verdade: a trava comum.
// ---------------------------------------------------------------------------

describe.skipIf(!URL_DE_PROVA)("Renovação e encerramento em Postgres real: a trava comum por pessoa", () => {
  let cen: Cenario;
  let banco: Banco;
  let cliente: pg.Client;
  let nomeDoBanco = "";
  const grampo: { atual: Grampo | null } = { atual: null };
  const a = auxiliares(() => cen);

  function urlDoBanco(nome: string): string {
    const u = new URL(URL_DE_PROVA);
    u.pathname = `/${nome}`;
    return u.toString();
  }

  beforeAll(async () => {
    nomeDoBanco = `prova_c2_${Math.random().toString(36).slice(2, 10)}`;
    const admin = new pg.Client({ connectionString: URL_DE_PROVA });
    await admin.connect();
    await admin.query(`CREATE DATABASE ${nomeDoBanco}`);
    await admin.end();

    cliente = new pg.Client({ connectionString: urlDoBanco(nomeDoBanco) });
    await cliente.connect();
    await aplicarMigracoes(
      {
        query: async <T>(sql: string, params?: readonly unknown[]) => {
          const r = await cliente.query(sql, params ? [...params] : undefined);
          return { rows: r.rows as T[] };
        },
        exec: (sql: string) => cliente.query(sql),
      },
      carregarMigracoes(),
    );
    await cliente.query(carregarSemente());

    banco = bancoPostgres(urlDoBanco(nomeDoBanco), { maximoConexoes: 8 });
    const app = await construirServidor({
      banco: grampear(banco, grampo), config: configDeTeste(),
      armazenamento: armazenamentoEmMemoria({ baseUrl: "http://api.local" }),
    });
    await app.ready();
    cen = {
      app, grampo, tokenRita: "",
      bruto: async (sql, params) => {
        const r = await cliente.query(sql, params);
        return { rows: r.rows };
      },
    };
    cen.tokenRita = (await a.entrar(EMAIL_RITA)).acesso;
  }, 180_000);

  afterAll(async () => {
    await cen?.app.close();
    await banco?.encerrar();
    await cliente?.end();
    if (nomeDoBanco) {
      const admin = new pg.Client({ connectionString: URL_DE_PROVA });
      await admin.connect();
      await admin.query(`DROP DATABASE IF EXISTS ${nomeDoBanco} WITH (FORCE)`);
      await admin.end();
    }
  });

  /** Quantas conexões DESTE banco estão paradas esperando trava agora. */
  async function esperandoTrava(tipo: "advisory" | null): Promise<number> {
    const r = await cen.bruto(
      `SELECT count(*)::int AS n FROM pg_locks l JOIN pg_stat_activity a ON a.pid = l.pid
        WHERE NOT l.granted AND a.datname = current_database()
          AND ($1::text IS NULL OR l.locktype = $1::text)`,
      [tipo],
    );
    return Number(r.rows[0]!.n);
  }

  /**
   * O que aconteceu primeiro com o pedido disputado: ele ficou PARADO numa
   * trava (alguma conexão deste banco com `granted = false` em `pg_locks`) ou
   * TERMINOU sem esperar ninguém. "nenhum" depois do prazo.
   *
   * É o que faz uma disputa segurada provar alguma coisa. Até a revisão da
   * correção 2 a renovação era solta 300 ms depois de o encerramento ENVIAR o
   * comando (ou 10 s depois, calada, se ele nem chegasse); numa máquina
   * carregada o encerramento podia chegar à trava depois de a renovação já
   * ter confirmado, e o caso passava verde sem ter disputado nada.
   */
  async function travouOuTerminou(
    pedido: Promise<unknown>, tipo: "advisory" | null, prazoMs = 15_000,
  ): Promise<"travou" | "terminou" | "nenhum"> {
    let terminou = false;
    void pedido.then(() => { terminou = true; }, () => { terminou = true; });
    const ate = Date.now() + prazoMs;
    while (Date.now() < ate) {
      if (await esperandoTrava(tipo) > 0) return "travou";
      if (terminou) return "terminou";
      await esperar(20);
    }
    return "nenhum";
  }

  /** Reprova se o pedido disputado não ficou parado na trava. */
  async function exigirQueTravou(quem: string, pedido: Promise<unknown>, tipo: "advisory" | null): Promise<void> {
    const desfecho = await travouOuTerminou(pedido, tipo);
    expect(desfecho, `a disputa não aconteceu: ${quem} não ficou esperando trava enquanto o outro lado estava segurado`)
      .toBe("travou");
  }

  /*
    A DISPUTA, segurando a renovação DENTRO da transação, entre revogar a
    antiga e abrir a nova (com tudo o que ela já travou). O encerramento é
    disparado nesse instante, e a renovação só é solta quando o teste VÊ o
    encerramento parado na trava consultiva da pessoa (`pg_locks`). Sem a
    trava ele terminaria sem ver a sessão que ainda vai nascer, e o caso
    reprova por isso; com ela, ele espera a renovação confirmar e a encerra.
  */
  for (const [i, enc] of a.encerramentos.entries()) {
    it(`${i + 1}. ${enc.nome}: nenhuma sessão da cadeia sobrevive`, async () => {
      const h = await a.entrar();
      const disputa = await enc.preparar(h);
      const janela = sinal();
      const solta = sinal();
      let segurando = false;
      grampo.atual = {
        antes: async (chamada) => {
          if (!abreHerdando(chamada) || segurando) return;
          segurando = true;
          janela.disparar();
          await solta.disparado;
        },
      };
      const pendentes: Promise<unknown>[] = [];
      try {
        const renovacao = a.pedirRenovacao(disputa.renovar);
        pendentes.push(renovacao);
        await janela.disparado;
        const encerramento = disputa.disparar();
        pendentes.push(encerramento);
        await exigirQueTravou(`o encerramento (${enc.nome})`, encerramento, "advisory");
        solta.disparar();
        const [e, r] = await Promise.all([encerramento, renovacao]);
        grampo.atual = null;
        await a.exigirCadeiaMorta(e, enc.esperado, r, h);
      } finally {
        solta.disparar();
        grampo.atual = null;
        await Promise.allSettled(pendentes);
        await enc.depois?.();
      }
    }, 120_000);
  }

  it("5. a rotação não é expulsão: no meio da renovação, o token de antes dela escreve", async () => {
    const h = await a.entrar();
    const janela = sinal();
    const solta = sinal();
    let segurando = false;
    grampo.atual = {
      antes: async (chamada) => {
        if (!abreHerdando(chamada) || segurando) return;
        segurando = true;
        janela.disparar();
        await solta.disparado;
      },
    };
    try {
      const renovacao = a.pedirRenovacao(h.renovacao);
      await janela.disparado;
      const escrita = await a.escrever(h.acesso);
      solta.disparar();
      expect(escrita.statusCode, escrita.body).toBe(200);
      const r = await renovacao;
      expect(r.statusCode, r.body).toBe(200);
      expect((await a.escrever(r.json().acesso)).statusCode).toBe(200);
    } finally {
      solta.disparar();
      grampo.atual = null;
    }
  });

  /*
    Sem grampo nenhum: a disputa do validador (renovar e encerrar ao mesmo
    tempo, com atraso sorteado de 0 a 3,5 ms), repetida 60 vezes. Em 4b96ea7
    sobrou sessão viva em 5 de 60.
  */
  it("6. sessenta disputas sem grampo, com atraso sorteado: zero sessão viva em todas", async () => {
    const sobreviventes: number[] = [];
    for (let rodada = 0; rodada < 60; rodada += 1) {
      const h = await a.entrar();
      const atraso = Math.random() * 3.5;
      const [, enc] = await Promise.all([
        a.pedirRenovacao(h.renovacao),
        esperar(atraso).then(() => cen.app.inject({
          method: "POST", url: `/usuarios/${HELENA}/encerrar-sessoes`,
          headers: { authorization: `Bearer ${cen.tokenRita}` },
        })),
      ]);
      expect(enc.statusCode, enc.body).toBe(200);
      if (await a.sessoesVivasDaCadeia(h) > 0) {
        sobreviventes.push(rodada);
        // Limpa para a rodada seguinte medir só ela.
        await cen.bruto(
          "UPDATE sessoes SET revogada_em = now(), motivo_revogacao = 'limpeza do teste' WHERE usuario_id = $1 AND revogada_em IS NULL",
          [HELENA],
        );
      }
    }
    expect(sobreviventes, `rodadas com sessão viva depois do encerrar: ${sobreviventes.join(", ")}`).toEqual([]);
  }, 300_000);

  /*
    A TRAVA NÃO PODE TRAZER IMPASSE (deadlock). Quem administra redefine a
    senha da pessoa: atualiza `usuarios` e só depois encerra as sessões (toma
    a trava). Se `trocar_senha` tomasse a trava ANTES de atualizar `usuarios`,
    as duas transações se esperariam em ordem inversa e o Postgres mataria uma
    delas (40P01, um 500 para quem clicou). A ordem que vale em todo caminho é
    a linha de `usuarios` primeiro e a trava depois. A disputa segura a
    redefinição entre o UPDATE de `usuarios` e a trava, dispara a troca de
    senha pela própria pessoa, e só solta quando o teste VÊ a troca parada
    esperando a linha de `usuarios` que a redefinição segura (`pg_locks`).
    Desde a revisão da correção 2 o caso exige que a disputa aconteça: sem a
    trava da 049 não há onde segurar a redefinição, e ele reprova. Desde a
    correção 4 a troca para no FOR NO KEY UPDATE da linha (antes de tomar a
    trava), relê tudo depois que a redefinição confirma e é recusada (401): a
    temporária é a senha que vale. Com a trava ANTES da linha na troca, este
    caso termina em impasse (40P01).
  */
  it("7. redefinir a senha pela administração e trocar a própria senha ao mesmo tempo: sem impasse, e a redefinição vale", async () => {
    const quemTroca = await a.entrar();
    const janela = sinal();
    const solta = sinal();
    let segurando = false;
    let viuUpdate = false;
    grampo.atual = {
      antes: async (chamada) => {
        if (/UPDATE usuarios\s+SET senha_hash/.test(chamada.sql)) viuUpdate = true;
        if (!viuUpdate || segurando || !chamada.sql.includes("travar_sessoes_do_usuario(")) return;
        segurando = true;
        janela.disparar();
        await solta.disparado;
      },
    };
    const pendentes: Promise<unknown>[] = [];
    try {
      const redefinicao = cen.app.inject({
        method: "POST", url: `/usuarios/${HELENA}/redefinir-senha`,
        headers: { authorization: `Bearer ${cen.tokenRita}` },
      });
      pendentes.push(redefinicao);
      const primeiro = await Promise.race([
        janela.disparado.then(() => "segurou" as const),
        redefinicao.then(() => "terminou" as const),
      ]);
      expect(primeiro, "a disputa não aconteceu: a redefinição terminou sem passar pela trava da pessoa").toBe("segurou");
      const troca = cen.app.inject({
        method: "POST", url: "/auth/trocar-senha", headers: { authorization: `Bearer ${quemTroca.acesso}` },
        payload: { senhaAtual: SENHA, senha: SENHA_NOVA },
      });
      pendentes.push(troca);
      // A troca passa pela vigência com a sessão de pé e para na linha de
      // `usuarios` que a redefinição segura (trava de transação, não consultiva).
      await exigirQueTravou("a troca de senha pela própria pessoa", troca, null);
      solta.disparar();
      const [r1, r2] = await Promise.all([redefinicao, troca]);
      grampo.atual = null;
      expect(r1.statusCode, `redefinição: ${r1.body}`).toBe(200);
      // A troca conferiu a senha de antes da redefinição; quando ela grava, a
      // redefinição já confirmou e encerrou a sessão de quem trocou. Até a
      // correção 4 ela respondia 200 e a senha dela apagava a temporária.
      expect(r2.statusCode, `troca de senha: ${r2.body}`).toBe(401);
      expect(r2.json().erro, r2.body).toBe("sessao_encerrada");
      expect(await a.sessoesVivasDaCadeia(quemTroca), "a sessão de quem trocou sobreviveu à redefinição").toBe(0);
      const temporaria = await a.tentarEntrar(String(r1.json().senhaTemporaria));
      expect(temporaria.statusCode, `a temporária da redefinição não entra: ${temporaria.body}`).toBe(200);
      expect((await a.tentarEntrar(SENHA_NOVA)).statusCode, "a senha da troca apagou a redefinição").toBe(401);
    } finally {
      solta.disparar();
      grampo.atual = null;
      await Promise.allSettled(pendentes);
      await a.restaurarHelena();
    }
  }, 120_000);

  /** O dono do console (há um só), cadastrado na primeira vez que um caso pede. */
  async function donoDoConsole(): Promise<string> {
    const dono = await cen.bruto(
      `INSERT INTO console_operadores (email, senha_hash, segundo_fator, papel)
       VALUES ('dono.da.prova@fornecedor.exemplo', 'scrypt$' || repeat('a', 90), 'v1.prova', 'dono')
       ON CONFLICT DO NOTHING RETURNING id`,
    );
    return String(dono.rows[0]?.id
      ?? (await cen.bruto("SELECT id FROM console_operadores WHERE papel = 'dono'")).rows[0]!.id);
  }

  async function municipioDaHelena(): Promise<string> {
    return String((await cen.bruto("SELECT organizacao_id FROM usuarios WHERE id = $1", [HELENA])).rows[0]!.organizacao_id);
  }

  /*
    A SUSPENSÃO DO MUNICÍPIO PELO CONSOLE também é encerramento em massa
    (`console_suspender_municipio`, migração 038): revoga toda sessão do
    município. Sem a trava, ela tem o mesmo buraco que o "encerrar sessões":
    o UPDATE dela esbarra na sessão antiga que a renovação está rotacionando,
    espera, e quando a renovação confirma ele pula a antiga (já revogada) e não
    enxerga a nova. A nova sobrevive à suspensão, e no dia da reativação
    renova como se nada tivesse acontecido. Este caso e o 9 ficam no fim do
    bloco porque a suspensão derruba também a sessão da administradora (o
    `finally` entra de novo com ela).
  */
  it("8. o console suspende o município no meio da renovação: depois da reativação, nada da cadeia renova", async () => {
    const h = await a.entrar();
    const operador = await donoDoConsole();
    const org = await municipioDaHelena();
    const janela = sinal();
    const solta = sinal();
    let segurando = false;
    grampo.atual = {
      antes: async (chamada) => {
        if (!abreHerdando(chamada) || segurando) return;
        segurando = true;
        janela.disparar();
        await solta.disparado;
      },
    };
    const consoleDb = new pg.Client({ connectionString: urlDoBanco(nomeDoBanco) });
    await consoleDb.connect();
    try {
      const renovacao = a.pedirRenovacao(h.renovacao);
      await janela.disparado;
      const suspensao = (async () => {
        await consoleDb.query("BEGIN");
        await consoleDb.query("SELECT set_config('app.console_operador', $1, true)", [operador]);
        await consoleDb.query("SELECT console_suspender_municipio($1, 'prova da corrida com a renovacao')", [org]);
        await consoleDb.query("COMMIT");
      })();
      // A suspensão chega ao banco e fica presa na trava da pessoa que está
      // renovando. Sem a trava ela esbarraria na sessão antiga (trava de
      // linha, não consultiva) e o caso reprova aqui.
      await exigirQueTravou("a suspensão pelo console", suspensao, "advisory");
      solta.disparar();
      const r = await renovacao;
      await suspensao;
      grampo.atual = null;
      expect(await a.sessoesVivasDaCadeia(h), "sobrou sessão viva depois da suspensão").toBe(0);

      await cen.bruto(
        "UPDATE organizacoes SET acesso_suspenso_em = NULL, suspensao_motivo = NULL WHERE id = $1", [org],
      );
      if (r.statusCode === 200) {
        const depois = await a.pedirRenovacao(r.json().renovacao);
        expect(depois.statusCode, "o par entregue no meio da suspensão renova depois da reativação").toBe(401);
      }
    } finally {
      solta.disparar();
      grampo.atual = null;
      await consoleDb.end();
      await cen.bruto(
        "UPDATE organizacoes SET acesso_suspenso_em = NULL, suspensao_motivo = NULL WHERE id = $1", [org],
      );
      cen.tokenRita = (await a.entrar(EMAIL_RITA)).acesso;
    }
  }, 120_000);

  /*
    O LOGIN NO MESMO INSTANTE DA SUSPENSÃO (migração 050). O login abre
    família nova e não passa pela trava por pessoa; até a 050 `abrir_sessao`
    lia a suspensão do município com um SELECT comum, que não espera ninguém
    (a chave estrangeira de `sessoes` só pede FOR KEY SHARE na linha do
    município, e isso não conflita com o UPDATE da suspensão). Nas duas ordens
    a sessão do login escapava da suspensão e, depois da reativação, renovava.

    A disputa é feita direto no banco, em duas conexões, porque o instante que
    importa é DENTRO da transação do login (entre abrir a sessão e confirmar),
    e o login da API é uma transação de uma consulta só. A conexão do login
    faz o que `emitirPar` (`auth/servico.ts`) faz: `abrir_sessao` sem família,
    com o hash de um token de renovação de verdade, que no fim o teste tenta
    renovar pela API.

    O caso exige que a disputa aconteça: com a 050, quem chega segundo fica
    parado na linha do município (e o teste VÊ isso em `pg_locks`); sem ela,
    ninguém espera ninguém, a sessão sobrevive e o caso reprova pela renovação.
  */
  it("9. o login e a suspensão pelo console no mesmo instante, nas duas ordens: depois da reativação, a sessão do login não renova", async () => {
    const operador = await donoDoConsole();
    const org = await municipioDaHelena();
    const login = new pg.Client({ connectionString: urlDoBanco(nomeDoBanco) });
    const consoleDb = new pg.Client({ connectionString: urlDoBanco(nomeDoBanco) });
    await login.connect();
    await consoleDb.connect();
    const abrir = (token: string) => login.query(
      "SELECT abrir_sessao($1,$2,$3, interval '14 days', NULL, NULL, NULL) AS id", [org, HELENA, hashDoToken(token)],
    );
    const suspender = () => consoleDb.query(
      "SELECT console_suspender_municipio($1, 'prova do login no mesmo instante')", [org],
    );
    const reativar = () => cen.bruto(
      "UPDATE organizacoes SET acesso_suspenso_em = NULL, suspensao_motivo = NULL WHERE id = $1", [org],
    );
    try {
      for (const ordem of ["o login abre primeiro", "a suspensão chega primeiro"] as const) {
        const token = gerarTokenRenovacao();
        await consoleDb.query("BEGIN");
        await consoleDb.query("SELECT set_config('app.console_operador', $1, true)", [operador]);
        await login.query("BEGIN");
        let desfecho: Awaited<ReturnType<typeof travouOuTerminou>>;
        if (ordem === "o login abre primeiro") {
          await abrir(token);
          // A suspensão tem de parar na linha do município que o login travou.
          const suspensao = suspender();
          desfecho = await travouOuTerminou(suspensao, null);
          await login.query("COMMIT");
          await suspensao;
          await consoleDb.query("COMMIT");
        } else {
          await suspender();
          // O login tem de parar na linha do município que a suspensão travou,
          // e, quando ela confirma, ler a suspensão e recusar (DC367).
          const tentativa = abrir(token).then(() => "abriu", (e: { code?: string }) => e.code ?? "erro");
          desfecho = await travouOuTerminou(tentativa, null);
          await consoleDb.query("COMMIT");
          const resultado = await tentativa;
          await login.query(resultado === "abriu" ? "COMMIT" : "ROLLBACK");
          if (resultado !== "abriu") expect(resultado, `${ordem}: a recusa do login`).toBe("DC367");
        }

        await reativar();
        const depois = await a.pedirRenovacao(token);
        expect(depois.statusCode, `${ordem}: a sessão aberta no instante da suspensão renovou depois da reativação`)
          .toBe(401);
        expect(desfecho, `${ordem}: a disputa não aconteceu (ninguém ficou esperando a linha do município)`)
          .toBe("travou");
      }
    } finally {
      await login.query("ROLLBACK").catch(() => undefined);
      await consoleDb.query("ROLLBACK").catch(() => undefined);
      await login.end();
      await consoleDb.end();
      await reativar();
      cen.tokenRita = (await a.entrar(EMAIL_RITA)).acesso;
    }
  }, 120_000);

  // 10 a 13: os casos da correção 3 que valem nos dois bancos.
  casosDaCorrecao3(a, grampo, 10);

  /*
    A OUTRA ORDEM DO LOGIN DISPUTADO (correção 3): o login já abriu a sessão e
    segura a trava da pessoa, e a mudança de credencial chega nesse instante.
    O login é segurado DENTRO da transação, entre tomar a trava e reler a
    credencial; a mudança atualiza `usuarios` e para na trava (o teste VÊ isso
    em `pg_locks`). Solto, o login relê a credencial de antes (a mudança não
    confirmou), confirma a sessão e solta a trava; o UPDATE de `sessoes` da
    mudança, que vem depois da trava, enxerga a sessão e a encerra. Sem a
    trava no login não há onde segurá-lo, e o caso reprova por isso.
  */
  for (const [i, mudanca] of a.mudancasDeCredencial.entries()) {
    it(`${14 + i}. o login já abriu a sessão sob a trava quando ${mudanca.nome}: a mudança espera e encerra a sessão do login`, async () => {
      await a.limparSessoesDaHelena();
      const disputa = await mudanca.preparar();
      const janela = sinal();
      const solta = sinal();
      let segurou = false;
      grampo.atual = {
        antes: async (chamada) => {
          if (segurou || !releCredencial(chamada)) return;
          segurou = true;
          janela.disparar();
          await solta.disparado;
        },
      };
      const pendentes: Promise<unknown>[] = [];
      try {
        const login = a.entrarComASenhaAntiga();
        pendentes.push(login);
        const primeiro = await Promise.race([
          janela.disparado.then(() => "segurou" as const),
          login.then(() => "terminou" as const),
        ]);
        expect(primeiro, "a disputa não aconteceu: o login não releu a credencial sob a trava da pessoa").toBe("segurou");
        const m = disputa.disparar();
        pendentes.push(m);
        await exigirQueTravou(`a mudança de credencial (${mudanca.nome})`, m, "advisory");
        solta.disparar();
        const [rm, rl] = await Promise.all([m, login]);
        grampo.atual = null;
        expect(rl.statusCode, `o login segurado antes da mudança: ${rl.body}`).toBe(200);
        await a.exigirLoginSemSobra(rm, rl, disputa.preservadas);
      } finally {
        solta.disparar();
        grampo.atual = null;
        await Promise.allSettled(pendentes);
        await a.restaurarHelena();
      }
    }, 120_000);
  }

  /*
    A JANELA DO MEIO DO LOGIN DISPUTADO (revisão da correção 3): o login já
    abriu a sessão, ainda sem confirmar e ANTES de tomar a trava da pessoa, e
    a mudança de credencial chega nesse instante. O login é segurado DENTRO da
    transação, no comando da trava; a mudança não encontra trava tomada nem
    linha de `usuarios` segura (o login só lê), e termina inteira, sem
    enxergar a sessão que ainda não confirmou. Solto, o login toma a trava, e
    a releitura que vem depois dela vê a credencial nova (ou a conta
    desativada): a transação volta atrás, a resposta é 401 e não sobra sessão.
    Sem a releitura depois da trava, a sessão do login sobreviveria à mudança.
  */
  for (const [i, mudanca] of a.mudancasDeCredencial.entries()) {
    it(`${17 + i}. o login abriu a sessão e ainda não tomou a trava quando ${mudanca.nome}: a mudança termina e o login é recusado`, async () => {
      await a.limparSessoesDaHelena();
      const disputa = await mudanca.preparar();
      const janela = sinal();
      const solta = sinal();
      let abriu = false;
      let segurou = false;
      grampo.atual = {
        antes: async (chamada) => {
          if (segurou) return;
          if (chamada.sql.includes("abrir_sessao(") && chamada.params?.[6] == null) {
            abriu = true;
            return;
          }
          if (!abriu || !chamada.sql.includes("travar_sessoes_do_usuario(")) return;
          segurou = true;
          janela.disparar();
          await solta.disparado;
        },
      };
      const pendentes: Promise<unknown>[] = [];
      try {
        const login = a.entrarComASenhaAntiga();
        pendentes.push(login);
        const primeiro = await Promise.race([
          janela.disparado.then(() => "segurou" as const),
          login.then(() => "terminou" as const),
        ]);
        expect(primeiro, "a disputa não aconteceu: o login não abriu a sessão antes de tomar a trava da pessoa").toBe("segurou");
        // A mudança termina inteira com a sessão do login aberta e não confirmada.
        const m = await disputa.disparar();
        expect(m.statusCode, m.body).toBe(200);
        solta.disparar();
        const rl = await login;
        grampo.atual = null;
        expect(rl.statusCode, `o login deveria ser recusado pela releitura depois da trava: ${rl.body}`).toBe(401);
        await a.exigirLoginSemSobra(m, rl, disputa.preservadas);
      } finally {
        solta.disparar();
        grampo.atual = null;
        await Promise.allSettled(pendentes);
        await a.restaurarHelena();
      }
    }, 120_000);
  }

  /*
    A ORDEM DAS TRAVAS NO LOGIN, contra a suspensão pelo console (complemento
    da correção 3). `emitirPar` lê a linha do município (o FOR SHARE de
    `abrir_sessao`, 050) ANTES de tomar a trava da pessoa, a mesma ordem de
    `console_suspender_municipio`, que atualiza a linha do município e só
    depois toma a trava de cada pessoa com sessão de pé (049). Invertida, os
    outros casos continuam verdes, e o login e a suspensão no mesmo instante
    fecham ciclo: o login segura a trava e pede a linha, a suspensão segura a
    linha e pede a trava, e o Postgres mata uma das duas com 40P01.

    O caso segura o login no comando SEGUINTE ao da trava (qualquer que seja),
    com a Helena já tendo uma sessão de pé (sem ela a suspensão nem pede a
    trava dela), dispara a suspensão e exige duas coisas: que ela pare na
    linha do município, e não na trava consultiva (o teste VÊ em `pg_locks`),
    e que, solto o login, os dois terminem sem impasse, com a sessão do login
    encerrada pela suspensão. Fica no fim do bloco porque a suspensão derruba
    também a sessão da administradora (o `finally` entra de novo com ela).
  */
  it("20. o login já tomou a trava quando o console suspende o município: a suspensão espera a linha do município, sem impasse", async () => {
    await a.limparSessoesDaHelena();
    await a.entrar();
    const operador = await donoDoConsole();
    const org = await municipioDaHelena();
    const janela = sinal();
    const solta = sinal();
    let travou = false;
    let segurou = false;
    grampo.atual = {
      antes: async (chamada) => {
        if (segurou) return;
        if (chamada.sql.includes("travar_sessoes_do_usuario(")) {
          travou = true;
          return;
        }
        if (!travou) return;
        segurou = true;
        janela.disparar();
        await solta.disparado;
      },
    };
    const consoleDb = new pg.Client({ connectionString: urlDoBanco(nomeDoBanco) });
    await consoleDb.connect();
    // Rede de segurança: nenhum desfecho deixa o caso parado para sempre.
    await consoleDb.query("SET statement_timeout = '20s'");
    const pendentes: Promise<unknown>[] = [];
    try {
      const login = a.entrarComASenhaAntiga();
      pendentes.push(login);
      const primeiro = await Promise.race([
        janela.disparado.then(() => "segurou" as const),
        login.then(() => "terminou" as const),
      ]);
      expect(primeiro, "a disputa não aconteceu: o login não tomou a trava da pessoa").toBe("segurou");
      const suspensao = (async () => {
        await consoleDb.query("BEGIN");
        await consoleDb.query("SELECT set_config('app.console_operador', $1, true)", [operador]);
        await consoleDb.query("SELECT console_suspender_municipio($1, 'prova da ordem das travas do login')", [org]);
        await consoleDb.query("COMMIT");
        return "confirmou";
      })().catch(async (e: { code?: string }) => {
        await consoleDb.query("ROLLBACK").catch(() => undefined);
        return e.code ?? "erro";
      });
      pendentes.push(suspensao);
      await exigirQueTravou("a suspensão pelo console", suspensao, null);
      const naTravaDaPessoa = await esperandoTrava("advisory");
      solta.disparar();
      const [rs, rl] = await Promise.all([suspensao, login]);
      grampo.atual = null;
      expect(naTravaDaPessoa, "a suspensão parou na trava da pessoa, e não na linha do município: o login tomou a trava antes de ler o município")
        .toBe(0);
      expect(rs, "a suspensão pelo console (40P01 é impasse)").toBe("confirmou");
      expect(rl.statusCode, `o login segurado com a trava: ${rl.body}`).toBe(200);
      const vivas = await cen.bruto(
        "SELECT count(*)::int AS n FROM sessoes WHERE usuario_id = $1 AND revogada_em IS NULL", [HELENA],
      );
      expect(Number(vivas.rows[0]!.n), "sobrou sessão viva da Helena depois da suspensão").toBe(0);
    } finally {
      solta.disparar();
      grampo.atual = null;
      await Promise.allSettled(pendentes);
      await consoleDb.end();
      await cen.bruto(
        "UPDATE organizacoes SET acesso_suspenso_em = NULL, suspensao_motivo = NULL WHERE id = $1", [org],
      );
      cen.tokenRita = (await a.entrar(EMAIL_RITA)).acesso;
    }
  }, 120_000);

  // 21 a 27: os casos da correção 4 que valem nos dois bancos.
  casosDaCorrecao4(a, grampo, 21);

  /*
    A OUTRA ORDEM DA TROCA DISPUTADA (correção 4): a troca do invasor já
    segura a linha da pessoa e a trava, e a reação chega nesse instante. A
    troca é segurada DENTRO da transação, logo antes de `trocar_senha`; a
    reação tem de PARAR (o teste VÊ em `pg_locks`) na linha de `usuarios` que
    a troca segura. Solta, a troca confirma (200) e a reação passa por cima
    dela: a ordem serial "troca, depois reação". Sem a linha segura pela troca
    a reação não espera ninguém, termina antes, e o caso reprova por isso.
    Na troca pela própria pessoa em outro aparelho, quem chega segundo é a
    vítima, e ela é recusada às claras (401), em vez de ver 200 e perder. No
    link do email também, desde a migração 051 (correção 3 da E10): a troca
    que confirmou primeiro mata o link pendente, e ele responde 401.
  */
  for (const [i, reacao] of a.reacoesAoInvasor.filter((r) => r.nome !== "quem administra encerra as sessões da pessoa").entries()) {
    it(`${28 + i}. a troca do invasor já segura a linha e a trava quando ${reacao.nome}: a reação espera e vem depois`, async () => {
      await a.limparSessoesDaHelena();
      const invasor = await a.entrar();
      const familia = await a.familiaDe(invasor);
      const disputa = await reacao.preparar();
      const janela = sinal();
      const solta = sinal();
      let segurou = false;
      grampo.atual = {
        antes: async (chamada) => {
          if (segurou || !chamada.sql.includes("trocar_senha(")) return;
          segurou = true;
          janela.disparar();
          await solta.disparado;
        },
      };
      const pendentes: Promise<unknown>[] = [];
      try {
        const troca = a.trocarComoInvasor(invasor);
        pendentes.push(troca);
        const quem = await Promise.race([
          janela.disparado.then(() => "segurou" as const),
          troca.then(() => "terminou" as const),
        ]);
        expect(quem, "a disputa não aconteceu: a troca terminou sem chegar à gravação").toBe("segurou");
        const reagiu = disputa.disparar();
        pendentes.push(reagiu);
        await exigirQueTravou(`a reação (${reacao.nome})`, reagiu, null);
        solta.disparar();
        const [rt, rr] = await Promise.all([troca, reagiu]);
        grampo.atual = null;
        expect(rt.statusCode, `a troca do invasor, que confirmou primeiro: ${rt.body}`).toBe(200);
        if (reacao.nome === "a própria pessoa troca a senha em outro aparelho"
          || reacao.nome === "a pessoa redefine a senha pelo link do email") {
          // A vítima chegou segundo: a sessão dela caiu com a troca do
          // invasor, ou o link pendente morreu com ela (migração 051, correção
          // 3 da E10). A recusa é às claras, e a senha dela não passa a valer.
          expect(rr.statusCode, `a reação da vítima, que chegou depois: ${rr.body}`).toBe(401);
          expect(rr.json().erro, rr.body).toBe("sessao_encerrada");
          expect((await a.tentarEntrar(reacao.senha(rr) ?? "")).statusCode, "a senha da vítima, recusada, entrou").toBe(401);
          return;
        }
        expect(rr.statusCode, `reação (${reacao.nome}): ${rr.body}`).toBe(200);
        expect(await a.vivasNaFamilia(familia), "a cadeia do invasor ficou com sessão de pé depois da reação").toBe(0);
        if (reacao.mudaASenha) {
          expect((await a.tentarEntrar(SENHA_DO_INVASOR)).statusCode, "a senha do invasor entra depois da reação").toBe(401);
          const daReacao = await a.tentarEntrar(reacao.senha(rr)!);
          expect(daReacao.statusCode, `a senha da reação não entra: ${daReacao.body}`).toBe(200);
        } else {
          const ativo = await a.bruto("SELECT ativo FROM usuarios WHERE id = $1", [HELENA]);
          expect(ativo.rows[0]!.ativo, "a conta continuou ativa depois da desativação").toBe(false);
        }
      } finally {
        solta.disparar();
        grampo.atual = null;
        await Promise.allSettled(pendentes);
        await a.restaurarHelena();
      }
    }, 120_000);
  }

  /*
    O LINK DE RECUPERAÇÃO E A REDEFINIÇÃO POR QUEM ADMINISTRA NO MESMO
    INSTANTE (V2-F00-E10, correção 3, migração 051). Desde a 051 toda mudança
    de senha marca os links pendentes da pessoa por gatilho, depois de
    atualizar a linha dela em `usuarios`: a ordem é linha da pessoa, linhas
    dos links. `consumir_recuperacao` passou a seguir a mesma ordem. Na ordem
    antiga (linha do link, depois a da pessoa), o link segurando a própria
    linha e a redefinição segurando a da pessoa se esperariam em ordem
    inversa, e o Postgres mataria uma das duas (40P01, um 500).

    O caso segura o link DENTRO de `consumir_recuperacao`, no UPDATE que o
    marca como usado, por um gatilho de prova instalado só neste banco (ele
    espera uma trava consultiva que o teste segura; só no primeiro nível, para
    não segurar o gatilho da 051). Com a ordem certa, nesse ponto o link já
    segura a linha da pessoa; a redefinição tem de parar nela (trava de linha,
    não consultiva, o teste VÊ em `pg_locks`). Solto, o link confirma e a
    redefinição vem depois: a temporária vale e a senha do link não.
  */
  it("32. o link do email e a redefinição por quem administra no mesmo instante: sem impasse, e a redefinição vem depois", async () => {
    const CHAVE = 51_051;
    await a.limparSessoesDaHelena();
    await cen.bruto(`
      CREATE OR REPLACE FUNCTION prova_segurar_o_link() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN
        IF pg_trigger_depth() = 1 THEN
          PERFORM pg_advisory_lock(${CHAVE});
          PERFORM pg_advisory_unlock(${CHAVE});
        END IF;
        RETURN NEW;
      END;
      $$`);
    await cen.bruto("DROP TRIGGER IF EXISTS prova_segurar_o_link ON recuperacoes_senha");
    await cen.bruto("CREATE TRIGGER prova_segurar_o_link BEFORE UPDATE ON recuperacoes_senha FOR EACH ROW EXECUTE FUNCTION prova_segurar_o_link()");
    const token = gerarTokenRenovacao();
    await cen.bruto(
      `INSERT INTO recuperacoes_senha (organizacao_id, usuario_id, token_hash, expira_em)
       SELECT organizacao_id, id, $2, now() + interval '30 minutes' FROM usuarios WHERE id = $1`,
      [HELENA, hashDoToken(token)],
    );
    const naoConsultivas = async () => Number((await cen.bruto(
      `SELECT count(*)::int AS n FROM pg_locks l JOIN pg_stat_activity s ON s.pid = l.pid
        WHERE NOT l.granted AND s.datname = current_database() AND l.locktype <> 'advisory'`,
    )).rows[0]!.n);
    await cen.bruto("SELECT pg_advisory_lock($1)", [CHAVE]);
    let soltou = false;
    const soltar = async () => {
      if (soltou) return;
      soltou = true;
      await cen.bruto("SELECT pg_advisory_unlock($1)", [CHAVE]);
    };
    const pendentes: Promise<unknown>[] = [];
    try {
      const link = cen.app.inject({ method: "POST", url: "/auth/redefinir", payload: { token, senha: SENHA_DO_LINK } });
      pendentes.push(link);
      // O link chega ao UPDATE que o marca e para na trava consultiva do teste.
      expect(await travouOuTerminou(link, "advisory"), "a disputa não aconteceu: o link não chegou ao ponto segurado").toBe("travou");
      const redefinicao = cen.app.inject({
        method: "POST", url: `/usuarios/${HELENA}/redefinir-senha`, headers: { authorization: `Bearer ${cen.tokenRita}` },
      });
      pendentes.push(redefinicao);
      let parou = false;
      const ate = Date.now() + 15_000;
      while (Date.now() < ate && !parou) {
        parou = await naoConsultivas() > 0;
        if (!parou) await esperar(20);
      }
      expect(parou, "a disputa não aconteceu: a redefinição não parou numa trava de linha enquanto o link estava segurado").toBe(true);
      await soltar();
      const [rl, rr] = await Promise.all([link, redefinicao]);
      expect(rl.statusCode, `o link: ${rl.body}`).toBe(200);
      expect(rr.statusCode, `a redefinição (40P01 é impasse): ${rr.body}`).toBe(200);
      const temporaria = await a.tentarEntrar(String(rr.json().senhaTemporaria));
      expect(temporaria.statusCode, `a temporária, que veio depois, não entra: ${temporaria.body}`).toBe(200);
      expect((await a.tentarEntrar(SENHA_DO_LINK)).statusCode, "a senha do link passou por cima da redefinição").toBe(401);
    } finally {
      await soltar();
      await Promise.allSettled(pendentes);
      await cen.bruto("DROP TRIGGER IF EXISTS prova_segurar_o_link ON recuperacoes_senha");
      await cen.bruto("DROP FUNCTION IF EXISTS prova_segurar_o_link()");
      await a.restaurarHelena();
    }
  }, 120_000);
});
