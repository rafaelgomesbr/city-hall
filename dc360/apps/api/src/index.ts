import { carregarConfig } from "./config.js";
import { bancoPostgres } from "./banco/postgres.js";
import { bancoEmMemoria } from "./banco/memoria.js";
import { construirServidor } from "./servidor.js";
import { notificadorDeArquivo, notificadorHttp } from "./auth/notificador.js";
import type { Banco } from "./banco/tipos.js";
import { armazenamentoS3 } from "./armazenamento/s3.js";
import { armazenamentoEmMemoria } from "./armazenamento/memoria.js";
import { geradorPlaywright } from "./documentos/pdf.js";
import { carregarMigracoes, migracoesPendentes } from "@dc360/db";
import type { Armazenamento } from "./armazenamento/tipos.js";
import { criarProvedorApns } from "./push/apns.js";
import { lerSegredoDoDisco } from "./push/segredo.js";
import { criarProvedorFcm, lerContaDeServico } from "./push/fcm.js";
import { criarEnvio, type ProvedorDePush } from "./push/envio.js";
import {
  CHAVE_DA_MINIMIZACAO, travaDeProcesso, travaPostgres, type Trava,
} from "./push/trava.js";
import { agendarVarredura, type VarreduraAgendada } from "./push/varredor.js";
import { agendarMinimizacao, type MinimizacaoAgendada } from "./privacidade/minimizacao.js";

const config = carregarConfig();

let banco: Banco;
if (config.DATABASE_URL) {
  banco = bancoPostgres(config.DATABASE_URL);

  /*
    Recusa subir com esquema atrasado.

    Um processo servindo requisição contra um banco sem a coluna que o código
    espera falha de um jeito difícil de diagnosticar: erro de SQL no meio de
    uma rota, em produção, com o usuário na frente. Melhor não subir e deixar
    o deploy falhar de forma óbvia. Aplicar a migração é passo separado, de
    propósito: dois processos subindo juntos não podem migrar ao mesmo tempo.
  */
  const pendentes = await banco.semTenant(async (c) =>
    migracoesPendentes(
      { query: (sql, params) => c.query(sql, params), exec: (sql) => c.query(sql) },
      carregarMigracoes(),
    ),
  );
  if (pendentes.length > 0) {
    console.error(
      `Esquema atrasado: faltam ${pendentes.length} migração(ões) (${pendentes.join(", ")}). ` +
      "Rode `npm run migrar --workspace @dc360/db` antes de subir a API.",
    );
    process.exit(1);
  }
} else {
  // Sem DATABASE_URL, sobe um Postgres em WebAssembly no próprio processo.
  // Serve para desenvolver sem instalar nada; em produção a configuração
  // recusa essa combinação e o processo nem chega aqui.
  const memoria = await bancoEmMemoria({ semear: true });
  banco = memoria.banco;
  console.warn(
    "DATABASE_URL ausente: subindo Postgres em WebAssembly, efêmero e só para desenvolvimento.",
  );
  console.warn("Semeado com dois municípios fictícios. Senha de todas as contas: defesa-civil-2026");
}

let armazenamento: Armazenamento;
if (config.S3_ENDPOINT && config.S3_BALDE && config.S3_CHAVE_ID && config.S3_CHAVE_SECRETA) {
  armazenamento = armazenamentoS3({
    endpoint: config.S3_ENDPOINT,
    balde: config.S3_BALDE,
    regiao: config.S3_REGIAO,
    credenciais: {
      accessKeyId: config.S3_CHAVE_ID,
      secretAccessKey: config.S3_CHAVE_SECRETA,
    },
  });
} else {
  // A própria API guarda os bytes, com URL assinada e expirando. Some ao
  // reiniciar, e a configuração recusa essa combinação em produção.
  armazenamento = armazenamentoEmMemoria({ baseUrl: config.URL_PUBLICA });
  console.warn("Armazenamento de evidência em memória: as fotos somem ao reiniciar.");
}

/**
 * O gerador só abre o navegador na primeira renderização, então declará-lo
 * aqui não custa nada na partida. Se o Chromium não estiver instalado, a rota
 * responde 503 dizendo para usar a versão para impressão, em vez de derrubar
 * o servidor inteiro.
 */
const pdf = geradorPlaywright();

/*
  Por onde a mensagem sai, em ordem de precedência.

  1. O canal de ARQUIVO, quando alguém pede. `config.ts` derruba a partida se
     ele aparecer em produção. Serve à suíte de ponta a ponta contra a API, que
     precisa do link de redefinição e não pode mais colhê-lo do log.
  2. O cliente HTTP de verdade, com `EMAIL_ATIVO=sim`. Esta é a peça que
     faltava: até 09/09/2026, `NOTIFICADOR_URL` e `NOTIFICADOR_CHAVE` eram
     validadas na partida e nunca lidas por linha nenhuma do servidor, então
     toda mensagem caía no notificador de log, e a recuperação de senha
     respondia "enviamos o link" enquanto escrevia a credencial de uso único no
     log. É por causa disso que a produção roda com `RECUPERACAO_ATIVA=nao`.
  3. Nada disso: o padrão do servidor, que é o notificador de log. Só existe
     fora de produção, porque `config.ts` recusa subir com recuperação ligada
     sem `EMAIL_ATIVO=sim`, e o envio de ofício recusa por conta própria.
*/
const notificador = config.NOTIFICADOR_ARQUIVO
  ? notificadorDeArquivo(config.NOTIFICADOR_ARQUIVO)
  : config.EMAIL_ATIVO === "sim"
    ? notificadorHttp({
        url: config.NOTIFICADOR_URL!,
        chave: config.NOTIFICADOR_CHAVE!,
        ...(config.EMAIL_REMETENTE ? { remetente: config.EMAIL_REMETENTE } : {}),
      })
    : undefined;

const app = await construirServidor({
  banco, config, armazenamento, pdf,
  ...(notificador ? { notificador } : {}),
});

/**
 * De quanto em quanto tempo a varredura de prazo roda.
 *
 * Cinco minutos, e o número é o resultado de uma conta: a janela de aviso é de
 * uma hora por padrão, então cinco minutos dão doze oportunidades de pegar cada
 * prazo antes de ele vencer. Menos que isso seria ida ao banco a troco de nada
 * na maior parte do dia; muito mais faria o aviso chegar perto demais do
 * vencimento nos casos em que o prazo entra na janela logo depois de uma
 * varredura.
 */
const INTERVALO_DA_VARREDURA_MS = 5 * 60_000;


/*
  A varredura de prazo só existe com o push ligado.

  Com `PUSH_ATIVO=nao`, que é o padrão enquanto a metade aplicativo não existir,
  o relógio nem é criado: um varredor rodando contra um banco sem aparelho
  nenhum é ida ao banco a cada cinco minutos para não fazer nada, e é ruído no
  log que ensina a equipe a ignorar log.
*/
let varredura: VarreduraAgendada | null = null;

if (config.PUSH_ATIVO === "sim") {
  const apple: ProvedorDePush = criarProvedorApns({
    keyId: config.APNS_KEY_ID!,
    teamId: config.APNS_TEAM_ID!,
    bundle: config.APNS_BUNDLE!,
    chavePem: lerSegredoDoDisco(config.APNS_CHAVE!, "a chave de push da Apple"),
  });

  const google = config.FCM_CONTA_SERVICO
    ? criarProvedorFcm(
        lerContaDeServico(
          lerSegredoDoDisco(config.FCM_CONTA_SERVICO, "a conta de serviço do Firebase"),
          /*
            O segundo argumento entra em MENSAGEM DE ERRO, então ele nunca pode
            ser o valor cru: quando a variável carrega o conteúdo da conta de
            serviço (que é como ela chega em produção), o valor cru é a chave
            privada do Firebase, e um JSON malformado despejaria essa chave no
            log do servidor. Erro de configuração viraria vazamento, que é
            exatamente o que `lerSegredoDoDisco` existe para impedir.
          */
          config.FCM_CONTA_SERVICO.trim().startsWith("{")
            ? "a variável FCM_CONTA_SERVICO (conteúdo)"
            : config.FCM_CONTA_SERVICO,
        ),
      )
    : undefined;

  /*
    POOL PRÓPRIO, pequeno, e trava em conexão exclusiva.

    A varredura não pode consumir as conexões das requisições: numa noite de
    chuva, a operação que não pode esperar é o agente em campo sincronizando a
    vistoria, e não o aviso de prazo. Duas conexões bastam, porque a varredura
    faz uma consulta e depois uma atualização por notificação.

    Sem `DATABASE_URL` o banco é o Postgres em WebAssembly do desenvolvimento,
    que tem uma conexão só e um processo só: ali a trava do banco não teria o
    que separar, e a trava de processo diz a verdade sobre o que faz.
  */
  const bancoDaVarredura = config.DATABASE_URL
    ? bancoPostgres(config.DATABASE_URL, { maximoConexoes: 2 })
    : banco;
  const trava: Trava = config.DATABASE_URL
    ? travaPostgres(config.DATABASE_URL)
    : travaDeProcesso();

  varredura = agendarVarredura(
    {
      banco: bancoDaVarredura,
      trava,
      enviar: criarEnvio({ apple, ...(google ? { google } : {}) }),
      janelaMinutos: config.PUSH_JANELA_MINUTOS,
      registrar: (evento, mensagem) => app.log.warn(evento, mensagem),
    },
    INTERVALO_DA_VARREDURA_MS,
  );

  app.log.info(
    { janelaMinutos: config.PUSH_JANELA_MINUTOS, android: Boolean(google) },
    "varredura de prazo ligada",
  );
}

/**
 * De quanto em quanto tempo a minimização por prazo roda.
 *
 * Uma hora. O prazo que ela executa é medido em DIAS, então rodar mais rápido
 * não adianta nada: uma ocorrência que vence à meia-noite é minimizada até a
 * uma da manhã, e ninguém consegue perceber a diferença. Rodar mais devagar
 * (uma vez por dia, por exemplo) concentraria toda a limpeza num instante só e
 * faria o teto por rodada levar dias para pôr um histórico grande em dia.
 */
const INTERVALO_DA_MINIMIZACAO_MS = 60 * 60_000;

/*
  A MINIMIZAÇÃO SOBE SEMPRE, e não atrás de uma variável de ambiente.

  Ela é a execução de uma obrigação legal que o município assume no contrato, e
  não um recurso opcional como o push. Uma chave para desligá-la seria uma
  chave para deixar de cumprir a retenção prometida em
  `docs/PRIVACIDADE.md` sem que nada no sistema registrasse a decisão.

  Ela não faz nada em município que não configurou prazo, que é o estado de
  todos eles no dia em que isto entra: a função do banco pula quem tem prazo
  nulo. O custo de ligá-la sempre é uma consulta por hora.

  A trava e o pool seguem o mesmo desenho da varredura de prazo, e pela mesma
  razão: em produção são duas máquinas no Fly, e a limpeza não pode consumir as
  conexões de quem está sincronizando vistoria no meio da chuva.
*/
const bancoDaMinimizacao = config.DATABASE_URL
  ? bancoPostgres(config.DATABASE_URL, { maximoConexoes: 2 })
  : banco;

const minimizacao: MinimizacaoAgendada = agendarMinimizacao(
  {
    banco: bancoDaMinimizacao,
    trava: config.DATABASE_URL
      ? travaPostgres(config.DATABASE_URL, { maximoConexoes: 1 }, CHAVE_DA_MINIMIZACAO)
      : travaDeProcesso(),
    registrar: (evento, mensagem) => app.log.info(evento, mensagem),
  },
  INTERVALO_DA_MINIMIZACAO_MS,
);

// Encerramento ordenado: a requisição em andamento termina, e o pool fecha.
// Sem isso, um deploy derruba transação no meio.
for (const sinal of ["SIGINT", "SIGTERM"] as const) {
  process.on(sinal, () => {
    void (async () => {
      app.log.info(`recebido ${sinal}, encerrando`);
      await app.close();
      // A varredura para antes do banco: senão o relógio dispara uma consulta
      // contra um pool já fechado, e o deploy termina com um erro que não é
      // erro nenhum.
      await varredura?.parar();
      await minimizacao.parar();
      await pdf.encerrar();
      await banco.encerrar();
      process.exit(0);
    })();
  });
}

await app.listen({ port: config.PORT, host: config.HOST });
