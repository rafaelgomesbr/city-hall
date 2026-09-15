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
import { APNS_PRODUCAO, APNS_TESTE, criarProvedorApns } from "./push/apns.js";
import { lerSegredoDoDisco } from "./push/segredo.js";
import { criarProvedorFcm, lerContaDeServico } from "./push/fcm.js";
import { criarEnvio, type ProvedorDePush } from "./push/envio.js";
import {
  CHAVE_DA_MINIMIZACAO, CHAVE_DA_VARREDURA_DE_ORFAOS,
  travaDeProcesso, travaPostgres, type Trava,
} from "./push/trava.js";
import { agendarVarredura, type VarreduraAgendada } from "./push/varredor.js";
import { agendarMinimizacao, type MinimizacaoAgendada } from "./privacidade/minimizacao.js";
import { CHAVE_DO_RESUMO, agendarResumo, type ResumoAgendado } from "./metricas/resumo.js";
import {
  agendarVarreduraDeOrfaos, type VarreduraDeOrfaosAgendada,
} from "./armazenamento/orfaos.js";
import {
  CHAVE_DA_ELIMINACAO, agendarEliminacoes, type EliminacoesAgendadas,
} from "./eliminacao/relogio.js";

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
        // As três com `!` porque `carregarConfig` já recusou subir sem elas
        // quando `EMAIL_ATIVO=sim`. O remetente entrou nessa lista porque o
        // provedor trata `from` como obrigatório: sem ele, seria um cliente
        // montado com sucesso e cem por cento de recusa.
        url: config.NOTIFICADOR_URL!,
        chave: config.NOTIFICADOR_CHAVE!,
        remetente: config.EMAIL_REMETENTE!,
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
  const apple: ProvedorDePush = criarProvedorApns(
    {
      keyId: config.APNS_KEY_ID!,
      teamId: config.APNS_TEAM_ID!,
      bundle: config.APNS_BUNDLE!,
      chavePem: lerSegredoDoDisco(config.APNS_CHAVE!, "a chave de push da Apple"),
    },
    // Ver `APNS_AMBIENTE` em config.ts: falar com a APNs errada faz o varredor
    // revogar o aparelho de quem está em campo, sem erro em lugar nenhum.
    { urlBase: config.APNS_AMBIENTE === "teste" ? APNS_TESTE : APNS_PRODUCAO },
  );

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

/**
 * De quanto em quanto tempo cada município reescreve o próprio resumo, e de
 * quanto tempo o resumo escrito ainda vale.
 *
 * Quinze minutos entre rodadas porque metade do que a métrica carrega é
 * RETRATO DO MOMENTO, e não movimento do dia: "quantas ocorrências estão
 * abertas agora" e "quantas estão atrasadas agora" são as duas perguntas que o
 * fornecedor faz ao telefone, e um número de ontem responde a pergunta errada.
 *
 * O frescor é menor que o intervalo, e essa folga não é descuido: com os dois
 * iguais, uma rodada que dispare alguns milissegundos antes da hora encontra o
 * resumo ainda dentro do prazo, pula, e o município passa a ser atualizado a
 * cada trinta minutos em vez de quinze, sem nada dizendo por quê.
 *
 * Nenhum dos dois números tem relação com o alarme de silêncio do console, que
 * é de trinta e seis horas e vive na visão da migração 023: entre este relógio e
 * aquele alarme há folga de mais de cem rodadas, então uma tarde ruim de rede
 * não faz o console gritar.
 */
const INTERVALO_DO_RESUMO_MS = 15 * 60_000;
const FRESCOR_DO_RESUMO_MINUTOS = 10;

/*
  O RESUMO SOBE SEMPRE, pela mesma régua da minimização e por uma razão a mais.

  A migração 023 entregou a tabela de métricas, a função que a escreve, a visão
  do console e o papel de leitura do fornecedor, e ninguém chamava a função.
  Nesse estado nada está errado, está apenas desligado: a tabela fica vazia, e o
  console do fornecedor mostra uma tela impecável afirmando que nenhuma
  prefeitura usa o produto.

  Uma variável para desligar isto seria pior que no caso da minimização, porque
  o console não distingue "desligado" de "ninguém usou": a ADR 0008 assume por
  escrito que a ausência de escrita recente é ela própria um sinal na tela, e um
  sinal que também pode significar "alguém pôs `nao` numa variável" não serve
  para decidir nada.

  O custo de ligá-lo sempre é uma chamada de função por município a cada quinze
  minutos, e ela não lê tabela de negócio nenhuma fora do contexto: a lista vem
  de `municipios_a_resumir` (migração 026), que devolve só identificador, e cada
  escrita acontece dentro do `comTenant` daquele município, com o papel de
  aplicação e debaixo do RLS. É a inversão da seta que a ADR 0008 exige.

  Pool próprio e trava própria, como as outras duas rotinas, e pela mesma razão:
  em produção são duas máquinas no Fly, e escrever métrica não pode consumir a
  conexão de quem está sincronizando vistoria no meio da chuva.
*/
const bancoDoResumo = config.DATABASE_URL
  ? bancoPostgres(config.DATABASE_URL, { maximoConexoes: 2 })
  : banco;

const resumo: ResumoAgendado = agendarResumo(
  {
    banco: bancoDoResumo,
    trava: config.DATABASE_URL
      ? travaPostgres(config.DATABASE_URL, { maximoConexoes: 1 }, CHAVE_DO_RESUMO)
      : travaDeProcesso(),
    frescorMinutos: FRESCOR_DO_RESUMO_MINUTOS,
    registrar: (evento, mensagem) => app.log.info(evento, mensagem),
  },
  INTERVALO_DO_RESUMO_MS,
);

/**
 * De quanto em quanto tempo a varredura de objeto órfão roda.
 *
 * Um dia. O prazo que ela mede é de trinta dias, então rodar mais rápido não
 * antecipa nada: um objeto que completa a janela às três da manhã entra na lista
 * na rodada seguinte, e vinte e quatro horas de diferença não significam nada
 * num prazo de um mês. E cada rodada percorre o BALDE INTEIRO, o que é chamada
 * de listagem cobrada pelo provedor: rodar de hora em hora multiplicaria essa
 * conta por vinte e quatro para produzir a mesma lista.
 */
const INTERVALO_DA_VARREDURA_DE_ORFAOS_MS = 24 * 60 * 60_000;

/*
  A VARREDURA DE ÓRFÃO SOBE ATRÁS DE UMA CHAVE, e a diferença para a minimização
  merece estar escrita, porque as duas parecem a mesma coisa.

  A minimização por prazo sobe SEMPRE porque EXECUTA uma obrigação legal: uma
  chave para desligá-la seria uma chave para deixar de cumprir a retenção
  prometida sem nada registrar a decisão.

  Esta não executa nada. Ela escreve uma lista de candidatos que uma pessoa vai
  ler e decidir, e nenhum arquivo muda por causa dela. O que a chave protege é
  outra coisa: a listagem do S3 nunca falou com provedor de verdade (é conferida
  contra XML em teste, o que prova a leitura e não o diálogo), e ligá-la por
  padrão faria um caminho nunca exercitado começar a percorrer o balde inteiro
  da produção sozinho no primeiro deploy. A chave morre no dia em que a
  varredura rodar uma vez pelo comando do operador contra o provedor de verdade.

  Ela NÃO recebe a lista de municípios: os donos saem do prefixo das chaves e
  são confirmados debaixo do RLS. Assim a API continua sem nenhum privilégio
  capaz de enumerar prefeituras, que é a regra número um daqui.
*/
let varreduraDeOrfaos: VarreduraDeOrfaosAgendada | null = null;

if (config.VARREDURA_DE_ORFAOS_ATIVA === "sim") {
  const bancoDaVarreduraDeOrfaos = config.DATABASE_URL
    ? bancoPostgres(config.DATABASE_URL, { maximoConexoes: 2 })
    : banco;

  varreduraDeOrfaos = agendarVarreduraDeOrfaos(
    {
      banco: bancoDaVarreduraDeOrfaos,
      armazenamento,
      trava: config.DATABASE_URL
        ? travaPostgres(config.DATABASE_URL, { maximoConexoes: 1 }, CHAVE_DA_VARREDURA_DE_ORFAOS)
        : travaDeProcesso(),
      registrar: (evento, mensagem) => app.log.info(evento, mensagem),
    },
    INTERVALO_DA_VARREDURA_DE_ORFAOS_MS,
  );

  app.log.info(
    { intervaloHoras: 24 },
    "varredura de objeto orfao ligada (so relata, nao apaga)",
  );
}

/**
 * De quanto em quanto tempo o relógio de eliminação roda.
 *
 * Quinze minutos. O prazo que ele executa é de SETE DIAS, então a precisão
 * de minutos não muda nada para quem se arrependeu: o prazo de arrependimento
 * é o que está escrito no banco, e não o tique do relógio. O que quinze
 * minutos compram é a distância entre "venceu" e "aconteceu" ser curta o
 * bastante para o console do fornecedor não mostrar uma eliminação vencida
 * parada por uma hora, que é o que faria alguém achar que o relógio quebrou.
 * O custo de cada rodada sem trabalho é uma chamada de função que devolve
 * zero linhas.
 */
const INTERVALO_DA_ELIMINACAO_MS = 15 * 60_000;

/*
  A ELIMINAÇÃO SOBE SEMPRE, e não atrás de uma variável de ambiente.

  É a mesma régua da minimização e do resumo, e o argumento inteiro está em
  `eliminacao/relogio.ts`: este relógio é o ÚNICO caminho de execução de uma
  decisão do fornecedor já tomada no console, com segundo fator e sete dias
  de espera escritos no banco. Uma chave desligada em produção deixaria
  eliminações vencerem sem acontecer, em silêncio, e a saída seria alguém
  rodar `DELETE` à mão com a credencial de dono, que é o padrão que a ADR
  0008 nomeia como o problema.

  O que impede o relógio de fazer algo errado não é uma chave, é o estado do
  banco: sem `eliminacao_agendada_para` vencida, a rodada não faz nada. E a
  purga do armazenamento só conclui quando está COMPLETA; qualquer falha
  deixa a organização de pé para a próxima rodada e grita no log.

  Sem `DATABASE_URL` o banco é o Postgres em WebAssembly do desenvolvimento,
  e o armazenamento é o de memória: o relógio roda igual, contra dois
  municípios fictícios que ninguém agendou para eliminar.

  Pool próprio e trava própria, como as outras rotinas: em produção são duas
  máquinas no Fly, e sem a trava as duas purgam o mesmo prefixo ao mesmo
  tempo. E a purga não pode consumir a conexão de quem está sincronizando
  vistoria no meio da chuva.
*/
const bancoDaEliminacao = config.DATABASE_URL
  ? bancoPostgres(config.DATABASE_URL, { maximoConexoes: 2 })
  : banco;

const eliminacoes: EliminacoesAgendadas = agendarEliminacoes(
  {
    banco: bancoDaEliminacao,
    armazenamento,
    trava: config.DATABASE_URL
      ? travaPostgres(config.DATABASE_URL, { maximoConexoes: 1 }, CHAVE_DA_ELIMINACAO)
      : travaDeProcesso(),
    // `warn`, e não `info`: toda linha deste relógio é sobre destruição de
    // dado, e nenhuma delas é rotina.
    registrar: (evento, mensagem) => app.log.warn(evento, mensagem),
  },
  INTERVALO_DA_ELIMINACAO_MS,
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
      await resumo.parar();
      await varreduraDeOrfaos?.parar();
      await eliminacoes.parar();
      await pdf.encerrar();
      await banco.encerrar();
      process.exit(0);
    })();
  });
}

await app.listen({ port: config.PORT, host: config.HOST });
