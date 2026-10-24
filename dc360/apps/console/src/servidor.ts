import Fastify, { type FastifyInstance, type FastifyRequest } from "fastify";
// Antes do resto, de propósito: a guarda copia as primitivas que usa na carga do módulo.
import {
  CONTRATO_DE_ACESSO_DO_CONSOLE, GENERICO_DO_CONSOLE, instalarGuardaDeAcesso, type ModoDaGuarda,
} from "./guarda-de-codigos-de-erro.js";
import helmet from "@fastify/helmet";
import rateLimit from "@fastify/rate-limit";
import { z } from "zod";
import type { Config } from "./config.js";
import type { EscritaDoConsole, LeituraDoConsole } from "./banco.js";
import { serieDoMunicipio, situacaoDosMunicipios } from "./consultas.js";
import {
  EMAIL_EM_USO, MUNICIPIO_DUPLICADO, PEDIDO_INVALIDO, cadastrarPrefeitura,
  cadastroDePrefeituraSchema,
} from "./cadastro.js";
import {
  abrirCofre, conferirCodigo, conferirEntrada, contextoDoOperador, registroNoBanco,
  semearDonoSePreciso, type Operador, type Papel, type Registro,
} from "./operadores.js";
import {
  SEM_PODER, agendarEliminacao, cancelarEliminacao, municipioPorId, reativarMunicipio,
  recusaEscritaParaGente, suspenderMunicipio,
} from "./municipios.js";
import {
  emitirDesafio, emitirSessao, verificarDesafio, verificarSessao, versaoDaSenha,
} from "./tokens.js";
import { CSS_DO_CONSOLE, JS_DO_CONSOLE, PAGINA_DO_CONSOLE } from "./pagina.js";
import { FACES_DE_FONTE } from "./fontes.js";
import { conferirSenha, derivarSenha, gerarSenhaTemporaria } from "../../api/src/auth/senha.js";
import { gerarSegredoTotp, uriDeAtivacao } from "../../api/src/auth/totp.js";
import { versaoDoBuild } from "../../api/src/versao-do-build.js";
import { idDeRequisicaoRecebido } from "../../api/src/observabilidade/id-de-requisicao.js";
import { TextoLongoDemais, matrizQr } from "./qr.js";
import {
  CODIGO_JA_CONSUMIDO, acharCodigo, candidatosPorEmail, codigosRestantes, consumirCodigo,
  gerarLote, renovarCodigos,
} from "./recuperacao.js";

/**
 * O console do fornecedor: processo próprio, sessão própria, plateia própria.
 *
 * O QUE ELE RESPONDE, e a lista é curta de propósito (decisão 2 da ADR 0008):
 * "entraram 41 chamados, 8 estão atrasados". O que ele NUNCA responde é "o que
 * houve na ocorrência 000123". Para essa pergunta existe telefone com o
 * administrador do município, e é assim que deve ser.
 *
 * O QUE O TORNA INCAPAZ DE RESPONDER A SEGUNDA não é este arquivo: é o papel de
 * banco com que ele se conecta, que não tem concessão em tabela de negócio
 * nenhuma. Se alguém escrever aqui uma consulta a `ocorrencias`, o banco
 * responde "permissão negada", e é essa a ordem certa das defesas. Este arquivo
 * é a interface; a parede é a migração 023 e o portão é
 * `db/test/isolamento.test.ts`.
 *
 * O QUE ELE ESCREVE, e cada item é uma porta nomeada:
 *
 *   - `POST /prefeituras` executa `provisionar_municipio` (migração 036).
 *   - As quatro ações perigosas por município executam as funções
 *     `console_*_municipio` (migração 038), que recusam quem não é dono.
 *   - A área de usuários e a troca de senha escrevem em `console_operadores`,
 *     a tabela PRÓPRIA do console, sob policy. Nada disso toca tabela de
 *     negócio, e é o banco quem garante.
 *   - A recuperação de senha executa as três funções da migração 039: gerar
 *     códigos escreve hashes em `console_codigos_de_recuperacao` (a segunda
 *     tabela própria), e `POST /recuperar`, a ÚNICA rota de escrita sem
 *     sessão, consome um código e grava senha e segundo fator novos na linha
 *     de quem o apresentou. Ver `recuperacao.ts`.
 *
 * O QUE ELE NÃO TEM, e cada ausência é uma decisão:
 *
 *   - CORS. A página é servida por este mesmo processo, então não existe
 *     origem legítima diferente da própria. Sem plugin de CORS, chamada de
 *     outra origem não passa, e não há lista para alguém alargar por engano.
 *   - `DELETE` em rota nenhuma, e em tabela nenhuma. Município se suspende e
 *     se agenda para eliminação (quem apaga, sete dias depois, é o relógio da
 *     API); operador se desativa. Nada some por aqui.
 *   - Renovação de sessão. Ver `tokens.ts`: a sessão dura trinta minutos e
 *     acaba, e a troca de senha derruba as outras pela versão da senha no
 *     token, sem tabela de sessões.
 */

export type DependenciasDoConsole = {
  config: Config;
  leitura: LeituraDoConsole;
  /**
   * A escrita, separada da leitura como parâmetro e não escondida dentro dela.
   *
   * Quem monta este servidor precisa entregar as duas coisas de propósito: as
   * rotas que escrevem ficam visíveis na assinatura, em vez de aparecerem
   * como um método a mais num objeto que todo mundo já passava.
   */
  escrita: EscritaDoConsole;
  /** Injeção de relógio, para o teste conferir a janela do TOTP sem esperar. */
  agora?: () => Date;
  /**
   * Quantas tentativas de entrar o mesmo endereço faz em cinco minutos.
   *
   * Existe como parâmetro por uma razão de teste que vale a pena escrever: o
   * limite por endereço e o teto por conta são defesas DIFERENTES (um trata o
   * atacante que vem de um lugar, o outro trata a conta martelada de muitos), e
   * exercitar o segundo exige errar o código várias vezes seguidas. Com o
   * limite por endereço fixo, o teste do teto por conta esbarraria no limite por
   * endereço e passaria verde sem nunca ter chegado ao teto que ele diz medir.
   *
   * O padrão é o valor de produção, e é ele que roda quando ninguém passa nada.
   */
  limitePorEndereco?: number;
  /**
   * Quantas prefeituras o mesmo endereço cadastra por hora.
   *
   * Parâmetro pela mesma razão do limite da porta: um teste que exercite o
   * cadastro várias vezes esbarraria no teto de produção e passaria verde sem
   * ter chegado ao que ele diz medir. O padrão é o valor de produção.
   */
  limiteDeCadastro?: number;
  /**
   * Quantas ações perigosas (suspender, reativar, eliminar, cancelar, criar e
   * desativar operador, trocar senha) o mesmo endereço faz por hora. Mesma
   * razão dos dois de cima; o padrão é o de produção.
   */
  limiteDeAcoes?: number;
  /** Coletor de log, para o teste poder afirmar o que saiu. */
  destinoDeLog?: { write: (linha: string) => void };
  /**
   * O que a guarda das respostas de acesso faz com um desvio do contrato (ver
   * `guarda-de-codigos-de-erro.ts`). Sem isto: "falhar" em teste, "corrigir"
   * fora dele. Só o teste da guarda passa, para provar o modo de produção.
   */
  modoDaGuarda?: ModoDaGuarda;
};

/** Quem está agindo, depois do portão: o que toda rota fechada recebe. */
export type OperadorEmSessao = { id: string; email: string; papel: Papel };

declare module "fastify" {
  interface FastifyRequest {
    operador?: OperadorEmSessao;
  }
}

const ENTRADA = z.object({
  email: z.string().min(1).max(320),
  senha: z.string().min(1).max(1024),
});

const CODIGO = z.object({
  desafio: z.string().min(1).max(4096),
  /**
   * Seis dígitos, e SÓ eles. O código de recuperação não entra por aqui: ele
   * não abre sessão, ele redefine a senha e o segundo fator, e tem rota
   * própria (`POST /recuperar`) que nem passa pelo desafio.
   */
  codigo: z.string().min(1).max(32),
});

/**
 * Gerar códigos de recuperação: a mesma régua da troca de senha (a senha
 * atual e um código NOVO do aplicativo), porque o efeito é do mesmo tamanho.
 * Quem tem oito códigos na mão tem a conta, e quem tem a sessão aberta numa
 * mesa não deve conseguir gerá-los.
 */
const GERAR_CODIGOS = z.object({
  senha: z.string().min(1, "Informe a sua senha").max(1024),
  codigo: z.string().min(1, "Informe o código do aplicativo").max(32),
});

/**
 * A recuperação: email, um código de recuperação, a senha nova.
 *
 * O teto do código é folgado porque ele chega como a pessoa digitou (com
 * hífen, espaço, maiúscula), e `normalizarCodigoDeRecuperacao` limpa depois.
 * A senha nova tem o mesmo piso de doze da troca.
 */
const RECUPERACAO = z.object({
  email: z.string().trim().toLowerCase().min(1, "Informe o email").max(320),
  codigo: z.string().trim().min(1, "Informe um código de recuperação").max(64),
  novaSenha: z.string().min(12, "A senha nova precisa ter pelo menos 12 caracteres").max(1024),
});

const NOVO_OPERADOR = z.object({
  email: z.string().trim().toLowerCase().min(1, "Informe o email")
    .email("Informe um email válido").max(320),
});

/**
 * A troca da própria senha: senha atual, código NOVO, senha nova.
 *
 * Doze caracteres é o piso do ASVS 4.0 (seção 2.1), o mesmo que a senha
 * temporária do produto já cumpre. O teto alto existe porque o `scrypt` recebe
 * a senha inteira e ninguém precisa de um limite baixo aqui.
 */
const TROCA_DE_SENHA = z.object({
  senhaAtual: z.string().min(1, "Informe a senha atual").max(1024),
  codigo: z.string().min(1, "Informe o código do aplicativo").max(32),
  novaSenha: z.string().min(12, "A senha nova precisa ter pelo menos 12 caracteres").max(1024),
});

const MOTIVO = z.object({
  motivo: z.string().trim().min(1, "Informe o motivo").max(2000),
});

/**
 * O pedido de eliminação, NESTA ORDEM: senha atual, código novo, nome exato,
 * motivo. A ordem é a da tela e a da conferência na rota, e ela é deliberada:
 * a senha e o código provam que é a pessoa; o nome prova que ela sabe QUAL
 * prefeitura está apagando; o motivo fica para quem ler o log daqui a um ano.
 */
const ELIMINACAO = z.object({
  senha: z.string().min(1, "Informe a sua senha").max(1024),
  codigo: z.string().min(1, "Informe o código do aplicativo").max(32),
  nome: z.string().min(1, "Digite o nome exato da prefeitura").max(200),
  motivo: z.string().trim().min(1, "Informe o motivo").max(2000),
});

/**
 * A mesma resposta para email desconhecido e para senha errada.
 *
 * Sem isso a rota de entrar vira uma lista de quem trabalha no fornecedor, e
 * uma lista curta de emails de operador é o começo de qualquer tentativa
 * dirigida. O tempo também é equivalente: ver `conferirEntrada`.
 */
const RECUSA = { erro: "credenciais_invalidas", mensagem: "Email ou senha incorretos." };

/**
 * A mesma coisa para a recuperação: email inexistente, operador inativo,
 * código errado e código já usado recebem esta resposta, e o mesmo tempo
 * aproximado (ver `acharCodigo` em `recuperacao.ts`).
 */
const RECUSA_DA_RECUPERACAO = {
  erro: "recuperacao_invalida", mensagem: "Email ou código incorretos.",
};

/** Falta sessão, ou ela já não vale. Vira 401 no tratador de erro. */
class SemSessao extends Error {}

/** Há sessão, mas o ato é do dono. Vira 403 no tratador de erro. */
class SoODono extends Error {}

/** O nome que o aplicativo de autenticação mostra ao lado do código. */
const EMISSOR_DO_TOTP = "DC360 Console";

export async function construirConsole(
  dep: DependenciasDoConsole,
): Promise<FastifyInstance> {
  const { config, escrita, leitura } = dep;
  const agora = dep.agora ?? (() => new Date());

  const cofre = abrirCofre(config.CONSOLE_SEGUNDO_FATOR_CHAVE);
  const registro: Registro = registroNoBanco(leitura, escrita);
  const segredo = new TextEncoder().encode(config.CONSOLE_JWT_SEGREDO);

  /*
    O log fala em `info` em TODO ambiente, e isso é uma correção.

    Até aqui o nível era `info` em produção e `warn` fora dela, e o efeito era
    que a linha da partida ("console do fornecedor pronto, com N operadores")
    só existia no lugar onde ninguém a lê, e sumia justamente na máquina de quem
    está tentando descobrir por que o console não aceita a senha. Um processo que
    serve uma página e uma dúzia de rotas não tem log volumoso para economizar:
    o que ele tem é um operador olhando o terminal, tentando entender por que
    não entrou.

    O nível sai daqui uma vez e vale para os dois destinos (o terminal e o
    coletor do teste), de propósito: com dois níveis diferentes, um teste que
    afirma "esta linha sai" passaria verde sem dizer nada sobre o que sai no
    terminal de verdade.
  */
  const nivelDeLog = "info";

  const app = Fastify({
    // Mesma regra da API (V2-F01-E14): o `X-Request-Id` de entrada só vale se for
    // UUID, e o id sai em toda resposta e no corpo do 500.
    genReqId: (req) => idDeRequisicaoRecebido(req.headers["x-request-id"]) ?? crypto.randomUUID(),
    logger: {
      level: nivelDeLog,
      ...(dep.destinoDeLog ? { stream: dep.destinoDeLog } : {}),
    },
    /*
      O corpo é minúsculo em toda rota deste servidor: email, senha, seis
      dígitos, um motivo. Um teto baixo aqui evita que alguém ocupe a memória
      do processo mandando megabytes para uma rota que espera trinta bytes.
    */
    bodyLimit: 16 * 1024,
  });

  /*
    A guarda das respostas de acesso, ANTES de qualquer rota: toda resposta 401
    ou 403 sai com um código do contrato do console e o status dele, ou não sai
    (ver `guarda-de-codigos-de-erro.ts`).
  */
  instalarGuardaDeAcesso(app, {
    modo: dep.modoDaGuarda ?? (config.NODE_ENV === "test" ? "falhar" : "corrigir"),
    contrato: CONTRATO_DE_ACESSO_DO_CONSOLE,
    generico: GENERICO_DO_CONSOLE,
  });

  /*
    A SEMENTE DO DONO, antes de qualquer rota existir.

    Fica aqui e não em `index.ts` porque o teste monta o console por esta
    função, e a semente é parte do que "montar o console" significa: um
    servidor de pé sem dono no banco é um servidor em que ninguém entra. Se a
    semente falhar (hash comido pelo shell, envelope que não abre, dois
    operadores na variável), esta função lança, e quem chamou decide o que
    fazer com o processo. Em `index.ts` isso é `process.exit(1)`, que no Fly
    faz o release falhar e a versão anterior continuar atendendo.
  */
  await semearDonoSePreciso(registro, config.CONSOLE_OPERADORES, cofre, app.log);

  await app.register(helmet, {
    /*
      A página do console não executa nada de fora e não carrega nada de fora: o
      CSS e o JS saem deste mesmo processo, em rotas próprias, e é por isso que
      `script-src` e `style-src` são `'self'` e não `'unsafe-inline'`. Escrever o
      script dentro do HTML custaria abrir `unsafe-inline`, que é justamente a
      diretiva que faz a política de segurança de conteúdo deixar de valer.

      O código QR do segundo fator de um operador novo é desenhado pelo
      próprio script, em SVG, a partir de uma matriz que a rota devolve. Nada
      de serviço de imagem: o endereço `otpauth://` carrega o segredo.
    */
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'none'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'"],
        connectSrc: ["'self'"],
        imgSrc: ["'self'", "data:"],
        baseUri: ["'none'"],
        formAction: ["'none'"],
        frameAncestors: ["'none'"],
      },
    },
  });

  /*
    Limite por endereço, e ele vale nas rotas que conferem credencial e nas
    que escrevem.

    O teto por conta vive em `operadores.ts` (na linha do operador) e trata a
    conta martelada de muitos lugares; este trata o atacante que vem de um
    lugar só. São problemas diferentes, e um não cobre o outro.

    `global: false` não é economia de zelo, é correção de um defeito que a
    primeira versão tinha e que só apareceu abrindo a página de verdade: com o
    limite global, abrir o console gasta três requisições (a casca, o estilo e o
    script), entrar gasta mais duas e ler os números gasta uma. Seis por visita,
    contra um teto de vinte em cinco minutos, e o operador que recarregasse a
    tela três vezes seguidas seria barrado do próprio console no meio de um
    plantão.

    O que sobra sem limite são rotas estáticas e rotas de leitura que já exigem
    sessão. O caminho que precisa de teto é justamente o que fica de fora dele:
    cada tentativa de entrar gasta uma derivação `scrypt` de cerca de 128 MB,
    então marteladas nessa rota derrubam o processo antes de descobrirem senha
    nenhuma.

    `POST /recuperar` entra no MESMO teto da porta, e por que vinte a cada
    cinco minutos bastam ali (sem teto por conta, sem castigo) está escrito
    em `recuperacao.ts`, com a conta feita: oito códigos de dez símbolos num
    alfabeto de trinta e dois não se adivinham em vinte tentativas a cada
    cinco minutos, nem num ano delas; o que o teto protege é o processador,
    porque cada tentativa custa OITO derivações scrypt.
  */
  await app.register(rateLimit, {
    global: false,
    allowList: () => false,
  });

  const LIMITE_DA_PORTA = {
    config: {
      rateLimit: { max: dep.limitePorEndereco ?? 20, timeWindow: "5 minutes" },
    },
  };

  /**
   * O teto do cadastro de prefeitura, e ele é BAIXO de propósito.
   *
   * Esta rota exige sessão, então o limite não é a defesa principal: a defesa é
   * a senha mais o segundo fator. Ele existe para o caso em que a defesa
   * principal já falhou, e o que ele limita ali é diferente do que o teto da
   * porta limita.
   *
   * O que se perde quando alguém martela esta rota NÃO é tempo de processador.
   * É que cada chamada bem-sucedida cria um registro que não se apaga: neste
   * produto município não se exclui, se encerra com motivo, e a linha de
   * nascimento na trilha é append-only. Cinco por hora não incomoda ninguém
   * (cadastrar prefeitura é ato de algumas vezes por mês, e o operador que
   * cadastrar duas seguidas nem percebe que existe teto) e transforma uma
   * sessão roubada em cinco linhas para limpar à mão, em vez de mil.
   *
   * De quebra, cada chamada gasta uma derivação `scrypt` de cerca de 128 MB,
   * que é o mesmo motivo pelo qual a porta tem teto.
   */
  const LIMITE_DE_CADASTRO = {
    config: {
      rateLimit: { max: dep.limiteDeCadastro ?? 5, timeWindow: "1 hour" },
    },
  };

  /**
   * O teto das ações perigosas, pela mesma lógica do cadastro.
   *
   * Suspender, eliminar, criar operador, trocar senha, gerar códigos de
   * recuperação: nenhuma delas acontece dez vezes numa hora num dia normal, e
   * todas produzem efeito que alguém vai ter que desfazer à mão se uma sessão
   * de dono for roubada. Três delas (eliminar, trocar senha e gerar códigos)
   * ainda gastam derivação `scrypt` por tentativa (gerar códigos gasta nove),
   * o que faz deste teto também uma defesa do processador.
   */
  const LIMITE_DE_ACOES = {
    config: {
      rateLimit: { max: dep.limiteDeAcoes ?? 10, timeWindow: "1 hour" },
    },
  };

  /** As rotas sob `LIMITE_DE_ACOES`, para o tratador de 429 dizer a espera certa. */
  const ROTAS_DE_ACAO = /^\/(operadores|senha|codigos-de-recuperacao|municipios\/[^/]+\/(suspender|reativar|eliminar|eliminacao\/cancelar))/;

  app.addHook("onSend", async (req, resposta) => {
    resposta.header("x-request-id", req.id);
  });

  /**
   * Um tratador só, e ele nunca devolve a mensagem crua do erro.
   *
   * Mensagem de erro de banco conta o nome da tabela e a coluna que faltou, e
   * num processo que fala com o banco de todos os municípios isso é desenho de
   * planta entregue de graça. O log recebe o detalhe; quem chamou recebe que
   * falhou.
   */
  app.setErrorHandler((erro, req, resposta) => {
    if (erro instanceof SemSessao) {
      return resposta.code(401).send({ erro: "sem_sessao", mensagem: "Entre de novo." });
    }
    if (erro instanceof SoODono) {
      return resposta.code(403).send({
        erro: "so_o_dono", mensagem: "Só o dono do console faz isto.",
      });
    }
    if ((erro as { statusCode?: number }).statusCode === 429) {
      /*
        A espera que a mensagem promete é a da janela que travou, e não uma
        frase genérica. As janelas deste servidor são diferentes (cinco
        minutos na porta, uma hora no cadastro e nas ações), e mandar alguém
        esperar "alguns minutos" para voltar em uma hora produz cinco
        tentativas frustradas e um chamado.
      */
      const noCadastro = req.url.startsWith("/prefeituras");
      const naAcao = ROTAS_DE_ACAO.test(req.url);
      return resposta.code(429).send({
        erro: "muitas_tentativas",
        mensagem: noCadastro
          ? "Cadastros demais deste endereço. Espere uma hora."
          : naAcao
            ? "Ações demais deste endereço. Espere uma hora."
            : "Tentativas demais. Espere alguns minutos.",
      });
    }
    app.log.error(
      { erro: erro instanceof Error ? erro.message : String(erro), requisicao: req.id },
      "falha no console",
    );
    // O id é o código de suporte: sem ele quem opera o console não tem como
    // dizer ao fornecedor qual linha do log olhar.
    return resposta.code(500).send({ erro: "falha_interna", requisicao: req.id });
  });

  /**
   * Uma linha de log por tentativa recusada, e ela é a única resposta que quem
   * opera tem para "por que eu não entrei".
   *
   * O QUE ENTRA: o email tentado e um motivo de máquina, curto. O QUE NUNCA
   * ENTRA: senha, código de seis dígitos, desafio, token de sessão, segredo do
   * segundo fator, hash. O log deste processo é lido por mais gente do que a
   * tela, e fica guardado pelo tempo de retenção inteiro. Existe teste que o
   * cobra, e ele roda as rotas novas também.
   *
   * O MOTIVO É GENÉRICO no primeiro passo (`email_ou_senha`) pela mesma razão
   * da resposta HTTP: distinguir ali não ajuda a operar e ajuda a enumerar. Nos
   * passos seguintes ele é específico, porque aí a conta já se identificou.
   *
   * Nível `warn`: tentativa recusada é evento de segurança, e ela precisa
   * aparecer mesmo em quem suba este processo com o log apertado.
   */
  function recusar(email: string | undefined, motivo: string): void {
    app.log.warn({ email: email ?? "(nao informado)", motivo }, "entrada recusada no console");
  }

  /**
   * A mesma linha para a recuperação, com a mesma regra: o email tentado e um
   * motivo de máquina, GENÉRICO (`email_ou_codigo`) porque distinguir "não
   * existe" de "código errado" no log entregaria a lista de quem trabalha aqui
   * a quem lê o log. O código apresentado nunca entra.
   */
  function recusarRecuperacao(email: string | undefined, motivo: string): void {
    app.log.warn({ email: email ?? "(nao informado)", motivo }, "recuperacao recusada no console");
  }

  /**
   * O rastro de cada ação perigosa, em `warn`: QUEM (email e id do operador),
   * QUAL município (por id, nunca por dado de pessoa) e o carimbo de tempo que
   * o próprio registrador põe. Nunca senha, código, segredo, token nem hash.
   *
   * `warn` e não `info` de propósito: é o mesmo nível da entrada recusada.
   * Suspender ou agendar a eliminação de uma prefeitura é evento que precisa
   * aparecer em quem suba o processo com o log apertado.
   */
  function rastro(
    quem: OperadorEmSessao, acao: string, organizacaoId: string | null, extra: Record<string, unknown> = {},
  ): void {
    app.log.warn(
      { operador: quem.email, operador_id: quem.id, acao, organizacao_id: organizacaoId, ...extra },
      `acao perigosa no console: ${acao}`,
    );
  }

  /** Um identificador de rota conferido como UUID antes de chegar ao banco. */
  function uuidOuNulo(valor: string): string | null {
    const r = z.string().uuid().safeParse(valor);
    return r.success ? r.data : null;
  }

  /* ======================================================================
     A porta, em duas etapas, e a primeira NUNCA entrega sessão
     ====================================================================== */

  /**
   * Confere a senha e devolve o DESAFIO, nunca a sessão.
   *
   * Não existe ramo neste arquivo em que a senha sozinha produza um token de
   * plateia `dc360-console`, e é isso que faz a decisão 4 da ADR 0008 valer.
   * Um console que emitisse a sessão e apenas "não deixasse a tela avançar"
   * teria uma etapa a mais e nenhuma proteção a mais: quem tem o token não
   * precisa da tela para nada.
   */
  app.post("/entrar", LIMITE_DA_PORTA, async (req, resposta) => {
    const corpo = ENTRADA.safeParse(req.body);
    if (!corpo.success) {
      recusar(undefined, "pedido_malformado");
      return resposta.code(400).send(RECUSA);
    }

    const operador = await conferirEntrada(registro, corpo.data.email, corpo.data.senha);
    if (!operador) {
      recusar(corpo.data.email, "email_ou_senha");
      return resposta.code(401).send(RECUSA);
    }

    app.log.info({ operador: operador.email }, "senha conferida, aguardando o codigo");
    return resposta.send({
      desafio: await emitirDesafio(segredo, operador.id),
      // A tela precisa saber o que pedir a seguir, e a resposta é sempre a
      // mesma: o console não tem operador sem segundo fator.
      falta: "codigo",
    });
  });

  /** A segunda etapa: os seis dígitos do aplicativo de autenticação. */
  app.post("/entrar/codigo", LIMITE_DA_PORTA, async (req, resposta) => {
    const corpo = CODIGO.safeParse(req.body);
    if (!corpo.success) {
      recusar(undefined, "pedido_malformado");
      return resposta.code(400).send(RECUSA);
    }

    const desafio = await verificarDesafio(segredo, corpo.data.desafio);
    if (!desafio) {
      /*
        Sem email na linha, e não é descuido: o desafio não abriu, então não há
        operador verificado para escrever. O que o endereço do corpo da
        requisição diria é o que quem chamou quis dizer, e um log que registra
        afirmação de quem chamou como se fosse fato é pior que um log sem o campo.
      */
      recusar(undefined, "desafio_expirado_ou_invalido");
      return resposta.code(401).send({
        erro: "desafio_invalido",
        mensagem: "A tentativa de entrada expirou. Comece de novo.",
      });
    }

    const operador = await registro.buscarPorId(desafio.id);
    if (!operador || !operador.ativo) {
      // O operador foi desativado entre as duas etapas. É diagnóstico, e sem
      // esta linha ele aparece como "código incorreto" para sempre.
      recusar(operador?.email, "operador_desativado_ou_inexistente");
      return resposta.code(401).send(RECUSA);
    }

    const desfecho = await conferirCodigo(registro, operador, corpo.data.codigo, cofre, agora());
    if (desfecho === "bloqueado") {
      recusar(operador.email, "conta_de_castigo");
      return resposta.code(429).send({
        erro: "bloqueado",
        mensagem: "Códigos errados demais. Espere quinze minutos.",
      });
    }
    if (desfecho !== "ok") {
      recusar(operador.email, "codigo_incorreto_ou_ja_usado");
      return resposta.code(401).send({
        erro: "codigo_invalido",
        mensagem: "Código incorreto ou já usado.",
      });
    }

    app.log.info({ operador: operador.email, papel: operador.papel }, "operador entrou no console");
    return resposta.send({
      token: await emitirSessao(segredo, { id: operador.id, sv: versaoDaSenha(operador.senhaHash) }),
      operador: operador.email,
      papel: operador.papel,
      /*
        Quantos códigos de recuperação a conta tem, para a tela avisar na
        entrada quem não tem nenhum. Só o número: os códigos não existem mais
        em texto claro em lugar nenhum. O dono semeado de `CONSOLE_OPERADORES`
        nasce sem código, e sem ele perder a senha e o aparelho exige a
        credencial de dono do banco (docs/IMPLANTACAO.md, seção 6.4).
      */
      codigosDeRecuperacao: await codigosRestantes(leitura, operador.id),
    });
  });

  /* ======================================================================
     O portão das rotas fechadas
     ====================================================================== */

  /**
   * Toda rota fechada passa por aqui, e a lista de isenções é o próprio
   * `onRequest` das rotas abertas (entrar, código, saúde, a casca da página e
   * os arquivos dela). Isso é deliberado: o padrão é fechado, e abrir exige
   * escrever a rota sem o gancho, o que aparece na revisão.
   *
   * A CONTA É LIDA DO BANCO A CADA PEDIDO, e são três coisas conferidas na
   * linha, além da assinatura do token:
   *
   *   1. a conta existe e está ATIVA: desativar precisa valer agora, e não
   *      daqui a trinta minutos, quando o token expiraria sozinho;
   *   2. a VERSÃO DA SENHA no token bate com a da linha: trocar a senha
   *      derruba as outras sessões, sem tabela de sessões (ver `tokens.ts`);
   *   3. o PAPEL vem da linha, e nunca do token: um token não carrega poder,
   *      carrega identidade. Se o dia em que alguém rebaixar um papel chegar,
   *      ele vale no pedido seguinte.
   */
  async function exigirOperador(req: FastifyRequest): Promise<Operador> {
    const cabecalho = req.headers.authorization ?? "";
    const token = cabecalho.startsWith("Bearer ") ? cabecalho.slice(7) : "";
    const sessao = token ? await verificarSessao(segredo, token) : null;
    if (!sessao) throw new SemSessao();

    const operador = await registro.buscarPorId(sessao.id);
    if (!operador || !operador.ativo) throw new SemSessao();
    if (versaoDaSenha(operador.senhaHash) !== sessao.sv) throw new SemSessao();

    req.operador = { id: operador.id, email: operador.email, papel: operador.papel };
    return operador;
  }

  /**
   * As rotas do dono: usuários e as duas ações perigosas por município.
   *
   * 403, e não 404, de propósito. A regra "recurso de outro município responde
   * 404" é sobre não confirmar que algo existe para quem não deveria saber.
   * Aqui não há segredo a proteger: o operador já vê o município na lista, e o
   * que lhe falta é PODER, não conhecimento. Dizer "só o dono faz isto" é a
   * frase certa para a pessoa certa, que é um colega do fornecedor.
   *
   * E este gancho NÃO é a defesa: é a cortesia. A defesa é a policy da tabela
   * e o `insufficient_privilege` das funções do banco, que recusam o operador
   * mesmo quando alguém escrever uma rota sem este gancho. Existe teste que
   * chama as funções por fora da rota e mostra o banco recusando.
   */
  async function exigirDono(req: FastifyRequest): Promise<Operador> {
    const operador = await exigirOperador(req);
    if (operador.papel !== "dono") throw new SoODono();
    return operador;
  }

  function quem(req: FastifyRequest): OperadorEmSessao {
    // Só é chamado depois de `exigirOperador`, que sempre preenche.
    return req.operador!;
  }

  /* ======================================================================
     Os números
     ====================================================================== */

  app.get("/municipios", async (req) => {
    await exigirOperador(req);
    return { municipios: await situacaoDosMunicipios(leitura) };
  });

  const SERIE = z.object({
    dias: z.coerce.number().int().min(1).max(180).default(30),
  });

  app.get<{ Params: { id: string }; Querystring: { dias?: string } }>(
    "/municipios/:id/serie",
    async (req, resposta) => {
      await exigirOperador(req);

      /*
        O identificador é conferido como UUID ANTES de chegar ao banco. Não é
        proteção contra injeção (o parâmetro do driver já é), é para o console
        não gastar uma ida ao banco por causa de um endereço digitado errado, e
        para a resposta de "isso não é um município" não depender de mensagem de
        erro do Postgres.
      */
      const id = uuidOuNulo(req.params.id);
      if (!id) return resposta.code(404).send({ erro: "nao_encontrado" });

      const consulta = SERIE.safeParse(req.query);
      const dias = consulta.success ? consulta.data.dias : 30;

      return resposta.send({ serie: await serieDoMunicipio(leitura, id, dias) });
    },
  );

  /* ======================================================================
     A prefeitura nova
     ====================================================================== */

  /**
   * Cadastra a prefeitura e o primeiro administrador dela, e devolve a senha
   * inicial UMA vez.
   *
   * ATRÁS DA SESSÃO, pelo mesmo gancho de todas as outras: `exigirOperador` é a
   * primeira linha, e não há ramo que escreva antes dele. Esconder o botão na
   * tela não é controle de acesso. Operador comum PODE cadastrar (decisão
   * tomada com o dono: operadores veem números e cadastram prefeitura; só o
   * dono desativa, elimina e gerencia usuários).
   *
   * A RESPOSTA É EXATAMENTE TRÊS CAMPOS: os dois identificadores do que acabou
   * de ser criado, e a senha inicial. A SENHA INICIAL NÃO VAI PARA O LOG.
   */
  app.post("/prefeituras", LIMITE_DE_CADASTRO, async (req, resposta) => {
    const operador = await exigirOperador(req);

    const corpo = cadastroDePrefeituraSchema.safeParse(req.body);
    if (!corpo.success) {
      /*
        A mensagem do primeiro problema, e não a lista inteira: a tela do
        console tem um recado só, e despejar cinco frases nele produz um
        parágrafo que ninguém lê. O campo errado continua sendo apontado pelo
        texto da mensagem, que vem do próprio schema.
      */
      return resposta.code(400).send({
        erro: "pedido_invalido",
        mensagem: corpo.error.issues[0]?.message ?? "Confira os campos do formulário.",
      });
    }

    try {
      const criado = await cadastrarPrefeitura(escrita, corpo.data);

      app.log.info(
        {
          operador: operador.email,
          municipio: `${corpo.data.municipio}/${corpo.data.uf.toUpperCase()}`,
          organizacao_id: criado.organizacaoId,
          cadastrado_por: corpo.data.operador,
        },
        "prefeitura cadastrada pelo console",
      );

      return resposta.code(201).send(criado);
    } catch (erro) {
      const codigo = (erro as { code?: string }).code;

      /*
        AS TRÊS RECUSAS ABAIXO REPASSAM A MENSAGEM DO BANCO, e são, junto das
        `DC36x` das ações perigosas, as únicas mensagens de banco que este
        servidor deixa sair: elas não vêm do Postgres, são escritas à mão na
        migração, para serem lidas por gente.
      */
      if (codigo === MUNICIPIO_DUPLICADO) {
        return resposta.code(409).send({
          erro: "municipio_duplicado",
          mensagem: (erro as Error).message,
        });
      }

      /*
        O email de login é único no produto inteiro (migração 002), e não dentro
        do município. A mensagem diz que o email já tem conta e NÃO diz em qual
        município: quem trabalha em cada um é dado de pessoa, e a decisão 2 da
        ADR 0008 fecha essa porta.
      */
      if (codigo === EMAIL_EM_USO) {
        return resposta.code(409).send({
          erro: "email_em_uso",
          mensagem: (erro as Error).message,
        });
      }

      if (codigo === PEDIDO_INVALIDO) {
        return resposta.code(400).send({
          erro: "pedido_invalido",
          mensagem: (erro as Error).message,
        });
      }

      // Qualquer outra falha cai no tratador geral, que registra o detalhe e
      // responde que falhou. Nenhum município foi criado: a função do banco faz
      // tudo numa transação só.
      throw erro;
    }
  });

  /* ======================================================================
     As duas ações perigosas por município (só o dono)
     ====================================================================== */

  /**
   * O que as quatro rotas têm em comum, e por que está numa função só.
   *
   * A ordem é sempre a mesma: o dono (403 antes de olhar para qualquer coisa),
   * o identificador como UUID (404 sem ida ao banco), o município existe e não
   * foi eliminado (404), e só então a função do banco. Uma rota que invertesse
   * dois desses passos responderia coisa diferente para o mesmo pedido, e é
   * esse tipo de diferença que uma revisão de diff não pega.
   */
  async function municipioDoDono(
    req: FastifyRequest<{ Params: { id: string } }>,
  ): Promise<{ operador: Operador; id: string } | null> {
    const operador = await exigirDono(req);
    const id = uuidOuNulo(req.params.id);
    if (!id) return null;
    const municipio = await municipioPorId(leitura, id, operador.id);
    if (!municipio || municipio.eliminada_em) return null;
    return { operador, id };
  }

  /**
   * Traduz a recusa do banco, e só ela.
   *
   * `42501` (sem poder) vira 403: é o banco dizendo que quem chamou não é dono,
   * e essa resposta precisa existir mesmo quando o gancho da rota falhar. As
   * `DC36x` são recusas escritas à mão na migração para gente ler (motivo em
   * branco, eliminação agendada impedindo reativar, nada a cancelar), e viram
   * 409 com a frase. Qualquer outra coisa sobe para o tratador geral.
   */
  function traduzirRecusaDoBanco(erro: unknown): { status: number; corpo: unknown } | null {
    const codigo = (erro as { code?: string }).code;
    if (codigo === SEM_PODER) {
      return { status: 403, corpo: { erro: "so_o_dono", mensagem: "Só o dono do console faz isto." } };
    }
    if (recusaEscritaParaGente(codigo)) {
      return { status: 409, corpo: { erro: "acao_recusada", mensagem: (erro as Error).message } };
    }
    return null;
  }

  app.post<{ Params: { id: string } }>(
    "/municipios/:id/suspender", LIMITE_DE_ACOES, async (req, resposta) => {
      const alvo = await municipioDoDono(req);
      if (!alvo) return resposta.code(404).send({ erro: "nao_encontrado" });

      const corpo = MOTIVO.safeParse(req.body);
      if (!corpo.success) {
        return resposta.code(400).send({
          erro: "pedido_invalido", mensagem: corpo.error.issues[0]?.message ?? "Informe o motivo.",
        });
      }

      try {
        await suspenderMunicipio(escrita, alvo.operador.id, alvo.id, corpo.data.motivo);
      } catch (erro) {
        const recusa = traduzirRecusaDoBanco(erro);
        if (recusa) return resposta.code(recusa.status).send(recusa.corpo);
        throw erro;
      }
      rastro(quem(req), "suspender", alvo.id);
      return resposta.send({ municipio: await municipioPorId(leitura, alvo.id, alvo.operador.id) });
    },
  );

  app.post<{ Params: { id: string } }>(
    "/municipios/:id/reativar", LIMITE_DE_ACOES, async (req, resposta) => {
      const alvo = await municipioDoDono(req);
      if (!alvo) return resposta.code(404).send({ erro: "nao_encontrado" });

      try {
        await reativarMunicipio(escrita, alvo.operador.id, alvo.id);
      } catch (erro) {
        const recusa = traduzirRecusaDoBanco(erro);
        if (recusa) return resposta.code(recusa.status).send(recusa.corpo);
        throw erro;
      }
      rastro(quem(req), "reativar", alvo.id);
      return resposta.send({ municipio: await municipioPorId(leitura, alvo.id, alvo.operador.id) });
    },
  );

  /**
   * Agenda a eliminação, e exige, NESTA ORDEM: a senha atual, um código NOVO
   * do aplicativo, o nome exato da prefeitura, e o motivo.
   *
   * A SENHA E O CÓDIGO DE NOVO, com sessão válida na mão. A sessão prova que
   * alguém entrou há menos de meia hora; não prova que quem está na cadeira
   * agora é a mesma pessoa. Para o ato que apaga uma prefeitura inteira, a
   * pessoa se identifica de novo, na hora.
   *
   * O CÓDIGO PRECISA SER NOVO. O que abriu a sessão está queimado na linha do
   * dono (`ultimo_passo_totp`), e `conferirCodigo` recusa qualquer código de
   * passo igual ou anterior. Quem viu o código na tela do aplicativo por cima
   * do ombro na hora da entrada não elimina município com ele.
   *
   * O NOME EXATO, comparado com o cadastrado, sem perdoar caixa nem espaço: é
   * a prova de que a pessoa sabe QUAL prefeitura está apagando, e não a que
   * está na linha de cima. Vem depois da senha e do código porque uma
   * comparação de texto é barata e uma derivação de senha não é: se a pessoa
   * errou o nome, ela já pagou a senha, e ninguém elimina prefeitura errada
   * por ter acertado tudo o mais.
   *
   * A CONFERÊNCIA DO CÓDIGO CONTA COMO TENTATIVA: errar cinco vezes aqui põe
   * a conta de castigo do mesmo jeito que na porta, pela mesma linha da tabela.
   */
  app.post<{ Params: { id: string } }>(
    "/municipios/:id/eliminar", LIMITE_DE_ACOES, async (req, resposta) => {
      const alvo = await municipioDoDono(req);
      if (!alvo) return resposta.code(404).send({ erro: "nao_encontrado" });

      const corpo = ELIMINACAO.safeParse(req.body);
      if (!corpo.success) {
        return resposta.code(400).send({
          erro: "pedido_invalido",
          mensagem: corpo.error.issues[0]?.message ?? "Confira os campos.",
        });
      }

      if (!(await conferirSenha(corpo.data.senha, alvo.operador.senhaHash))) {
        rastro(quem(req), "eliminar_recusado", alvo.id, { motivo: "senha_incorreta" });
        return resposta.code(401).send({
          erro: "senha_incorreta", mensagem: "A senha não confere.",
        });
      }

      const desfecho = await conferirCodigo(registro, alvo.operador, corpo.data.codigo, cofre, agora());
      if (desfecho === "bloqueado") {
        rastro(quem(req), "eliminar_recusado", alvo.id, { motivo: "conta_de_castigo" });
        return resposta.code(429).send({
          erro: "bloqueado", mensagem: "Códigos errados demais. Espere quinze minutos.",
        });
      }
      if (desfecho !== "ok") {
        rastro(quem(req), "eliminar_recusado", alvo.id, { motivo: "codigo_incorreto_ou_ja_usado" });
        return resposta.code(401).send({
          erro: "codigo_invalido",
          mensagem: "Código incorreto ou já usado. Use um código novo, não o da entrada.",
        });
      }

      const municipio = await municipioPorId(leitura, alvo.id, alvo.operador.id);
      if (!municipio) return resposta.code(404).send({ erro: "nao_encontrado" });
      if (corpo.data.nome !== municipio.municipio) {
        rastro(quem(req), "eliminar_recusado", alvo.id, { motivo: "nome_nao_confere" });
        return resposta.code(400).send({
          erro: "nome_nao_confere",
          mensagem: "O nome digitado não é exatamente o nome da prefeitura cadastrada.",
        });
      }

      try {
        await agendarEliminacao(escrita, alvo.operador.id, alvo.id, corpo.data.motivo);
      } catch (erro) {
        const recusa = traduzirRecusaDoBanco(erro);
        if (recusa) return resposta.code(recusa.status).send(recusa.corpo);
        throw erro;
      }

      const depois = await municipioPorId(leitura, alvo.id, alvo.operador.id);
      rastro(quem(req), "agendar_eliminacao", alvo.id, {
        eliminacao_agendada_para: depois?.eliminacao_agendada_para ?? null,
      });
      return resposta.send({
        municipio: depois,
        eliminacao_agendada_para: depois?.eliminacao_agendada_para ?? null,
      });
    },
  );

  app.post<{ Params: { id: string } }>(
    "/municipios/:id/eliminacao/cancelar", LIMITE_DE_ACOES, async (req, resposta) => {
      const alvo = await municipioDoDono(req);
      if (!alvo) return resposta.code(404).send({ erro: "nao_encontrado" });

      try {
        await cancelarEliminacao(escrita, alvo.operador.id, alvo.id);
      } catch (erro) {
        const recusa = traduzirRecusaDoBanco(erro);
        if (recusa) return resposta.code(recusa.status).send(recusa.corpo);
        throw erro;
      }
      rastro(quem(req), "cancelar_eliminacao", alvo.id);
      return resposta.send({ municipio: await municipioPorId(leitura, alvo.id, alvo.operador.id) });
    },
  );

  /* ======================================================================
     A área de usuários (só o dono)
     ====================================================================== */

  app.get("/operadores", async (req) => {
    const dono = await exigirDono(req);
    return { operadores: await registro.listar(dono.id) };
  });

  /**
   * Cria um operador abaixo do dono, e mostra a credencial dele UMA vez.
   *
   * O MESMO DESENHO DA SENHA INICIAL DE PREFEITURA: senha sorteada pelo
   * servidor, no formato que se dita por telefone; o que vai para o banco é o
   * hash, e a senha em texto claro existe só na resposta desta rota. O segredo
   * do segundo fator nasce JUNTO (a ADR 0008 não admite conta de console sem
   * ele), vai para o banco cifrado no cofre com o contexto do email, e sai em
   * texto claro só aqui: como segredo para digitar à mão, como endereço
   * `otpauth://` para copiar, e como matriz de QR para a tela desenhar.
   *
   * NADA DISSO VAI PARA O LOG. O `warn` do rastro leva quem criou e o id de
   * quem nasceu, e é isso.
   */
  app.post("/operadores", LIMITE_DE_ACOES, async (req, resposta) => {
    const dono = await exigirDono(req);

    const corpo = NOVO_OPERADOR.safeParse(req.body);
    if (!corpo.success) {
      return resposta.code(400).send({
        erro: "pedido_invalido",
        mensagem: corpo.error.issues[0]?.message ?? "Informe um email válido.",
      });
    }
    const email = corpo.data.email;

    const senhaInicial = gerarSenhaTemporaria();
    const segredoTotp = gerarSegredoTotp();

    let id: string;
    try {
      id = await registro.criar(
        {
          email,
          senhaHash: await derivarSenha(senhaInicial),
          segundoFator: cofre.cifrar(segredoTotp, contextoDoOperador(email)),
        },
        dono.id,
      );
    } catch (erro) {
      const codigo = (erro as { code?: string }).code;
      // 23505 é unique_violation: o email já tem conta no console.
      if (codigo === "23505") {
        return resposta.code(409).send({
          erro: "email_em_uso",
          mensagem: `Já existe operador do console com o email ${email}.`,
        });
      }
      const recusa = traduzirRecusaDoBanco(erro);
      if (recusa) return resposta.code(recusa.status).send(recusa.corpo);
      throw erro;
    }

    rastro(quem(req), "criar_operador", null, { operador_criado: id, email_criado: email });
    app.log.info({ operador: dono.email, operador_criado: id }, "operador criado pelo console");

    /*
      OS CÓDIGOS DE RECUPERAÇÃO NASCEM COM A CONTA, e saem na mesma tela de
      "mostrado uma vez" que a senha, o segredo e o QR. O contexto da gravação
      é o operador que acabou de nascer, e não o dono: os códigos são DELE, a
      policy da tabela só aceita a própria linha, e é o mesmo gesto da porta,
      que declara o id achado pelo email antes de haver sessão.

      Vem DEPOIS de a linha existir, em transação própria: se esta parte
      falhar, o operador existe sem códigos, e gera os dele em "Minha senha".
      O contrário (códigos sem operador) não tem como acontecer, porque a
      tabela aponta para a linha.
    */
    const lote = await gerarLote();
    await renovarCodigos(escrita, id, lote.hashes);

    const endereco = uriDeAtivacao(segredoTotp, email, EMISSOR_DO_TOTP);
    return resposta.code(201).send({
      id,
      email,
      senhaInicial,
      segredo: segredoTotp,
      endereco,
      qr: desenharQr(endereco),
      codigos: lote.codigos,
    });
  });

  app.post<{ Params: { id: string } }>(
    "/operadores/:id/desativar", LIMITE_DE_ACOES, async (req, resposta) => {
      const dono = await exigirDono(req);
      const id = uuidOuNulo(req.params.id);
      if (!id) return resposta.code(404).send({ erro: "nao_encontrado" });

      /*
        Lido pelo contexto do DONO, e não pelo do alvo: o dono enxerga todas as
        linhas, e é ele quem está agindo. A recusa de desativar o dono é dita
        aqui com a frase certa, e garantida no banco pela policy e pelo gatilho
        que não deixam a linha do dono mudar de `ativo`.
      */
      const alvo = await registro.buscarPorId(id, dono.id);
      if (!alvo) return resposta.code(404).send({ erro: "nao_encontrado" });
      if (alvo.papel === "dono") {
        return resposta.code(409).send({
          erro: "dono_nao_se_desativa",
          mensagem: "O dono do console não se desativa: sem ele ninguém cria operador nem elimina município.",
        });
      }

      let mudou: boolean;
      try {
        mudou = await registro.desativar(id, dono.id);
      } catch (erro) {
        const recusa = traduzirRecusaDoBanco(erro);
        if (recusa) return resposta.code(recusa.status).send(recusa.corpo);
        throw erro;
      }
      if (!mudou) return resposta.code(404).send({ erro: "nao_encontrado" });

      rastro(quem(req), "desativar_operador", null, { operador_desativado: id });
      return resposta.send({ id, ativo: false });
    },
  );

  /* ======================================================================
     A minha senha (qualquer operador, na própria conta)
     ====================================================================== */

  /**
   * Troca a senha de quem está na sessão, exigindo a senha atual E um código
   * novo do aplicativo, e devolve uma sessão nova.
   *
   * POR QUE O CÓDIGO, com sessão válida na mão: pela mesma razão da eliminação.
   * A sessão diz que alguém entrou há menos de meia hora; a senha atual mais um
   * código novo dizem que quem está na cadeira agora é a pessoa. Sem isso, um
   * console deixado aberto numa mesa é uma conta trocada de senha por quem
   * passou por ali.
   *
   * O TOKEN NOVO na resposta é o que mantém ESTA sessão de pé: a versão da
   * senha mudou (ver `tokens.ts`), então o token antigo deixa de valer no
   * pedido seguinte, para esta aba e para qualquer outra. É assim que "trocar
   * a senha derruba as outras sessões" acontece sem tabela de sessões.
   */
  app.post("/senha", LIMITE_DE_ACOES, async (req, resposta) => {
    const operador = await exigirOperador(req);

    const corpo = TROCA_DE_SENHA.safeParse(req.body);
    if (!corpo.success) {
      return resposta.code(400).send({
        erro: "pedido_invalido",
        mensagem: corpo.error.issues[0]?.message ?? "Confira os campos.",
      });
    }
    if (corpo.data.novaSenha === corpo.data.senhaAtual) {
      return resposta.code(400).send({
        erro: "pedido_invalido", mensagem: "A senha nova precisa ser diferente da atual.",
      });
    }

    if (!(await conferirSenha(corpo.data.senhaAtual, operador.senhaHash))) {
      recusar(operador.email, "senha_atual_incorreta_na_troca");
      return resposta.code(401).send({ erro: "senha_incorreta", mensagem: "A senha atual não confere." });
    }

    const desfecho = await conferirCodigo(registro, operador, corpo.data.codigo, cofre, agora());
    if (desfecho === "bloqueado") {
      recusar(operador.email, "conta_de_castigo");
      return resposta.code(429).send({
        erro: "bloqueado", mensagem: "Códigos errados demais. Espere quinze minutos.",
      });
    }
    if (desfecho !== "ok") {
      recusar(operador.email, "codigo_incorreto_ou_ja_usado_na_troca");
      return resposta.code(401).send({
        erro: "codigo_invalido",
        mensagem: "Código incorreto ou já usado. Use um código novo, não o da entrada.",
      });
    }

    const novoHash = await derivarSenha(corpo.data.novaSenha);
    await registro.trocarSenha(operador.id, novoHash);

    app.log.info({ operador: operador.email }, "senha trocada pelo proprio operador");
    return resposta.send({
      token: await emitirSessao(segredo, { id: operador.id, sv: versaoDaSenha(novoHash) }),
    });
  });

  /* ======================================================================
     Os códigos de recuperação (qualquer operador, na própria conta)
     ====================================================================== */

  /** Quantos códigos ainda valem. A tela diz o número e nunca mostra nenhum. */
  app.get("/codigos-de-recuperacao", async (req) => {
    const operador = await exigirOperador(req);
    return { restantes: await codigosRestantes(leitura, operador.id) };
  });

  /**
   * Gera um lote novo de oito códigos, invalidando o anterior, e mostra os
   * oito UMA vez.
   *
   * A SENHA E O CÓDIGO DE NOVO, com sessão válida na mão, pela mesma razão da
   * troca de senha e da eliminação: a sessão diz que alguém entrou há menos de
   * meia hora; a senha atual mais um código novo dizem que quem está na
   * cadeira agora é a pessoa. Oito códigos de recuperação SÃO a conta, e um
   * console deixado aberto numa mesa não pode entregá-los a quem passar.
   *
   * A CONFERÊNCIA DO CÓDIGO CONTA COMO TENTATIVA: errar cinco vezes aqui põe
   * a conta de castigo do mesmo jeito que na porta, pela mesma linha.
   *
   * NADA VAI PARA O LOG além do rastro (quem, e que gerou). Os códigos
   * existem em texto claro na resposta desta rota e em mais lugar nenhum: o
   * que vai para o banco é um hash scrypt por código (`recuperacao.ts`).
   */
  app.post("/codigos-de-recuperacao", LIMITE_DE_ACOES, async (req, resposta) => {
    const operador = await exigirOperador(req);

    const corpo = GERAR_CODIGOS.safeParse(req.body);
    if (!corpo.success) {
      return resposta.code(400).send({
        erro: "pedido_invalido",
        mensagem: corpo.error.issues[0]?.message ?? "Confira os campos.",
      });
    }

    if (!(await conferirSenha(corpo.data.senha, operador.senhaHash))) {
      recusar(operador.email, "senha_incorreta_ao_gerar_codigos");
      return resposta.code(401).send({ erro: "senha_incorreta", mensagem: "A senha não confere." });
    }

    const desfecho = await conferirCodigo(registro, operador, corpo.data.codigo, cofre, agora());
    if (desfecho === "bloqueado") {
      recusar(operador.email, "conta_de_castigo");
      return resposta.code(429).send({
        erro: "bloqueado", mensagem: "Códigos errados demais. Espere quinze minutos.",
      });
    }
    if (desfecho !== "ok") {
      recusar(operador.email, "codigo_incorreto_ou_ja_usado_ao_gerar_codigos");
      return resposta.code(401).send({
        erro: "codigo_invalido",
        mensagem: "Código incorreto ou já usado. Use um código novo, não o da entrada.",
      });
    }

    const lote = await gerarLote();
    const inseridos = await renovarCodigos(escrita, operador.id, lote.hashes);

    rastro(quem(req), "gerar_codigos_de_recuperacao", null, { codigos: inseridos });
    return resposta.send({ codigos: lote.codigos, restantes: inseridos });
  });

  /* ======================================================================
     Esqueci a senha (sem sessão, por definição)
     ====================================================================== */

  /**
   * Um código de recuperação redefine a senha E o segundo fator, e devolve o
   * segredo novo UMA vez. Não devolve sessão: a pessoa entra pela porta
   * normal, com a senha nova e o autenticador novo.
   *
   * POR QUE TROCA O SEGUNDO FATOR, e não só a senha: a recuperação existe para
   * o dia em que o telefone foi perdido junto com a senha, e nesse dia o
   * autenticador antigo é inútil ou está com outra pessoa. Uma recuperação que
   * só trocasse a senha deixaria a pessoa trancada na segunda etapa com um
   * código na mão que já provou quem ela é. Quem só esqueceu a senha escaneia
   * de novo em dez segundos.
   *
   * A ORDEM, e ela é o que faz a resposta ser a mesma para todo mundo:
   *
   *   1. o corpo tem forma (400, sem gastar derivação nenhuma: senha nova
   *      curta é erro de quem digita, e dizer isso não conta nada sobre conta
   *      nenhuma);
   *   2. os códigos NÃO usados do email, pela função do banco, sem contexto,
   *      que devolve lista VAZIA para email inexistente e para operador
   *      inativo, e nunca erro;
   *   3. `acharCodigo` confere TODOS e completa até oito derivações: email
   *      que não existe custa o mesmo que uma conta com oito códigos;
   *   4. só com o código achado a senha nova é derivada e o segredo novo é
   *      sorteado e cifrado no cofre com o contexto do email, como
   *      `provisionar-operador.ts` faz;
   *   5. `console_consumir_recuperacao` marca o código como usado, grava
   *      senha e envelope, zera falhas, castigo e passo do TOTP. Se o mesmo
   *      código chegou duas vezes em corrida, o banco recusa a segunda com
   *      `DC365`, e ela vira a mesma recusa genérica.
   *
   * AS SESSÕES CAEM SOZINHAS: o token carrega a versão da senha (`sv`, ver
   * `tokens.ts`), e o hash novo muda a versão. Ninguém que tinha a sessão
   * antiga continua lendo número nenhum.
   *
   * O RASTRO VAI EM `warn`, com quem e o id: redefinir a credencial de uma
   * conta que enxerga todos os municípios é evento de segurança. Nunca o
   * código, a senha, o segredo nem o hash.
   */
  app.post("/recuperar", LIMITE_DA_PORTA, async (req, resposta) => {
    const corpo = RECUPERACAO.safeParse(req.body);
    if (!corpo.success) {
      recusarRecuperacao(undefined, "pedido_malformado");
      return resposta.code(400).send({
        erro: "pedido_invalido",
        mensagem: corpo.error.issues[0]?.message ?? "Confira os campos.",
      });
    }
    const { email, codigo, novaSenha } = corpo.data;

    const candidatos = await candidatosPorEmail(leitura, email);
    const achado = await acharCodigo(candidatos, codigo);
    if (!achado) {
      recusarRecuperacao(email, "email_ou_codigo");
      return resposta.code(401).send(RECUSA_DA_RECUPERACAO);
    }

    /*
      A linha do operador, pelo id que o código apontou e com o contexto dele:
      o email que vai para o contexto do envelope é o GRAVADO, e não o
      digitado, porque é o gravado que a porta vai usar para abrir o envelope
      depois. A função do banco já garantiu que ele existe e está ativo; se
      sumiu entre uma chamada e outra, a resposta é a genérica.
    */
    const operador = await registro.buscarPorId(achado.operador_id);
    if (!operador || !operador.ativo) {
      recusarRecuperacao(email, "email_ou_codigo");
      return resposta.code(401).send(RECUSA_DA_RECUPERACAO);
    }

    const segredoTotp = gerarSegredoTotp();
    try {
      await consumirCodigo(
        escrita,
        achado.codigo_id,
        await derivarSenha(novaSenha),
        cofre.cifrar(segredoTotp, contextoDoOperador(operador.email)),
      );
    } catch (erro) {
      if ((erro as { code?: string }).code === CODIGO_JA_CONSUMIDO) {
        recusarRecuperacao(operador.email, "codigo_ja_consumido");
        return resposta.code(401).send(RECUSA_DA_RECUPERACAO);
      }
      throw erro;
    }

    const restantes = candidatos.length - 1;
    app.log.warn(
      {
        operador: operador.email, operador_id: operador.id,
        acao: "recuperar_senha", codigos_restantes: restantes,
      },
      "senha e segundo fator redefinidos por codigo de recuperacao",
    );

    const endereco = uriDeAtivacao(segredoTotp, operador.email, EMISSOR_DO_TOTP);
    return resposta.send({
      segredo: segredoTotp,
      endereco,
      qr: desenharQr(endereco),
      restantes,
    });
  });

  /* ======================================================================
     A casca: saúde e a página
     ====================================================================== */

  /**
   * Sem autenticação, como o `/saude` da API, e pelo mesmo motivo: quem
   * pergunta é o balanceador, que não tem sessão. Ele responde apenas que o
   * processo está de pé, e nenhum número de município nenhum. `versao` e `commit`
   * são o carimbo da imagem (ver `apps/api/src/versao-do-build.ts`), os mesmos
   * campos da `/saude` da API, e não são sensíveis.
   */
  const build = versaoDoBuild();
  app.get("/saude", async () => ({ ok: true, versao: build.versao, commit: build.commit }));

  app.get("/", async (_req, resposta) =>
    resposta.type("text/html; charset=utf-8").send(PAGINA_DO_CONSOLE));

  app.get("/console.css", async (_req, resposta) =>
    resposta.type("text/css; charset=utf-8").send(CSS_DO_CONSOLE));

  app.get("/console.js", async (_req, resposta) =>
    resposta.type("text/javascript; charset=utf-8").send(JS_DO_CONSOLE));

  /*
    AS FONTES DO PRODUTO, servidas por este processo e por mais ninguém.

    O painel web pega Work Sans e Roboto Mono do Google Fonts. Aqui isso não
    passa: `style-src 'self'` bloqueia a folha de fonts.googleapis.com antes de
    ela carregar, e alargar a diretiva para um domínio de terceiro é abrir a
    política que este console tem de bom. Então os bytes viajam dentro do
    processo (ver `fontes.ts`, com procedência e licença) e saem por aqui.

    Uma rota por face, e não uma rota com parâmetro: com `/fontes/:arquivo`,
    quem escrevesse `../` no parâmetro estaria brincando com o sistema de
    arquivos do contêiner. Aqui não há sistema de arquivos envolvido, e o
    conjunto de endereços que existem é literalmente a lista que o módulo
    exporta.
  */
  for (const face of FACES_DE_FONTE) {
    app.get(face.caminho, async (_req, resposta) =>
      resposta
        .type(face.tipo)
        .header("cache-control", "public, max-age=31536000, immutable")
        .send(face.bytes));
  }

  /*
    A linha da partida, e ela sai em QUALQUER ambiente (ver `nivelDeLog`).

    Quem precisa saber quantos operadores há no banco é justamente quem acabou
    de subir o console na própria máquina e está tentando entrar. Zero
    operadores seria a explicação inteira para "a senha não funciona", e por
    isso a partida nem chega aqui com zero: `semearDonoSePreciso` recusa antes.
  */
  const quantos = await registro.quantos();
  app.log.info(
    { operadores: quantos },
    `console do fornecedor pronto, com ${quantos} operador(es) no banco`,
  );

  /*
    O DONO SEM CÓDIGOS DE RECUPERAÇÃO, avisado na partida.

    O dono semeado de `CONSOLE_OPERADORES` nasce sem código, e ninguém acima
    dele redefine a senha: no dia em que a senha se for junto com o telefone,
    a única saída é a credencial de dono do banco (docs/IMPLANTACAO.md, 6.4).
    O passo 5 do roteiro manda gerar na primeira entrada, e um roteiro é
    exatamente o tipo de coisa que se pula. Então o processo diz, em `warn`,
    a cada partida, enquanto for verdade. Sem segredo nenhum na linha: o email
    do dono já sai na linha de entrada, e o resto não existe em texto claro.
  */
  const donoAtual = await registro.dono();
  if (donoAtual && (await codigosRestantes(leitura, donoAtual.id)) === 0) {
    app.log.warn(
      { operador: donoAtual.email, papel: "dono" },
      `operador ${donoAtual.email} é dono e não tem códigos de recuperação; gere em Minha senha. `
      + "Sem eles, perder a senha e o aparelho exige a credencial de dono do banco.",
    );
  }
  return app;
}

/**
 * A matriz do QR como linhas de "0" e "1", ou nulo quando o endereço não cabe.
 *
 * Linhas de texto em vez de matriz de booleanos porque um QR de versão 9 tem
 * 53 x 53 módulos: 2.809 `true`/`false` em JSON são 14 KB, e 53 linhas de 53
 * caracteres são 3 KB. A tela desenha um `<rect>` por "1".
 *
 * Nulo quando não cabe (email comprido demais): a tela mostra o segredo em
 * texto grande e o endereço para copiar, que é o caminho que funciona sempre.
 */
function desenharQr(endereco: string): { tamanho: number; linhas: string[] } | null {
  try {
    const matriz = matrizQr(endereco);
    return {
      tamanho: matriz.tamanho,
      linhas: matriz.modulos.map((linha) => linha.map((escuro) => (escuro ? "1" : "0")).join("")),
    };
  } catch (erro) {
    if (erro instanceof TextoLongoDemais) return null;
    throw erro;
  }
}
