import { carregarConfig } from "./config.js";
import { bancoPostgres } from "./banco/postgres.js";
import { bancoEmMemoria } from "./banco/memoria.js";
import { construirServidor } from "./servidor.js";
import { notificadorDeArquivo } from "./auth/notificador.js";
import type { Banco } from "./banco/tipos.js";
import { armazenamentoS3 } from "./armazenamento/s3.js";
import { armazenamentoEmMemoria } from "./armazenamento/memoria.js";
import { geradorPlaywright } from "./documentos/pdf.js";
import { carregarMigracoes, migracoesPendentes } from "@dc360/db";
import type { Armazenamento } from "./armazenamento/tipos.js";

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
  O canal de arquivo só existe quando alguém pede, e `config.ts` derruba a
  partida se ele aparecer em produção. Serve à suíte de ponta a ponta contra a
  API, que precisa do link de redefinição e não pode mais colhê-lo do log.
*/
const notificador = config.NOTIFICADOR_ARQUIVO
  ? notificadorDeArquivo(config.NOTIFICADOR_ARQUIVO)
  : undefined;

const app = await construirServidor({
  banco, config, armazenamento, pdf,
  ...(notificador ? { notificador } : {}),
});

// Encerramento ordenado: a requisição em andamento termina, e o pool fecha.
// Sem isso, um deploy derruba transação no meio.
for (const sinal of ["SIGINT", "SIGTERM"] as const) {
  process.on(sinal, () => {
    void (async () => {
      app.log.info(`recebido ${sinal}, encerrando`);
      await app.close();
      await pdf.encerrar();
      await banco.encerrar();
      process.exit(0);
    })();
  });
}

await app.listen({ port: config.PORT, host: config.HOST });
