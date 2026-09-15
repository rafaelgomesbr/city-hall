import { z } from "zod";
import { mensagemDeUrlSemVerificacao, urlDoBancoVerifica } from "../../api/src/banco/tls.js";

/**
 * A configuração do console, e o que ela recusa.
 *
 * A régua é a mesma do `config.ts` da API, e a razão também: um servidor que
 * sobe com chave padrão é pior do que um que não sobe, porque parece funcionar.
 * No console isso pesa mais, porque a conta do fornecedor é a única do sistema
 * cujo comprometimento alcança mais de um município, ainda que só em métrica
 * agregada.
 *
 * TODAS AS VARIÁVEIS TÊM PREFIXO `CONSOLE_`, e isso não é organização: é a
 * decisão 1 da ADR 0008 escrita no nome. Com `JWT_SEGREDO` valendo para os
 * dois, bastaria um painel de implantação com variáveis de projeto
 * compartilhadas para os dois processos passarem a assinar com a mesma chave, e
 * a separação viraria uma convenção que ninguém consegue conferir. Com nomes
 * distintos, compartilhar segredo entre produto e console exige alguém digitar
 * o mesmo valor duas vezes, de propósito.
 *
 * Ainda assim o segredo NÃO é a separação: a separação é a plateia do token
 * (ver `tokens.ts`), e ela recusa o token do outro lado mesmo quando os dois
 * segredos são iguais.
 */

const ESQUEMA = z.object({
  NODE_ENV: z.string().default("development"),

  CONSOLE_PORT: z.coerce.number().int().positive().default(3344),

  /**
   * Em que endereço o processo atende.
   *
   * O PADRÃO CONTINUA SENDO `127.0.0.1`, e isso é deliberado: na máquina de
   * quem desenvolve, o certo é não aceitar conexão de fora. Dentro de um
   * contêiner o certo é o oposto, e quem declara isso é o ambiente
   * (`CONSOLE_HOST` em `fly.console.toml`), como a API já faz com `HOST`.
   *
   * O que este arquivo acrescenta é a RECUSA em produção, na validação lá
   * embaixo, porque o defeito que o padrão produz é mudo: dentro do contêiner,
   * `127.0.0.1` é o loopback DO CONTÊINER, então o processo sobe inteiro,
   * escreve "servidor no ar" no log, e o balanceador do provedor bate na porta
   * publicada sem ninguém atender. Não há erro em lugar nenhum: há um
   * aplicativo de pé que não responde, e o diagnóstico começa pelo lugar errado
   * (rede, certificado, porta) justamente porque o log diz que subiu.
   */
  CONSOLE_HOST: z.string().default("127.0.0.1"),

  /**
   * Trinta e dois bytes, como no produto.
   *
   * Não tem valor padrão, em ambiente nenhum, e isso é diferente da API (que
   * aceita subir sem `DATABASE_URL` no desenvolvimento). Aqui não existe modo
   * "só para experimentar": qualquer console de pé, ainda que apontado para um
   * banco descartável, é uma tela que mostra números de mais de um município, e
   * uma chave adivinhável nele é uma sessão forjada.
   */
  CONSOLE_JWT_SEGREDO: z.string().min(32, {
    message: "CONSOLE_JWT_SEGREDO precisa de pelo menos 32 caracteres. "
      + "Gere com: node -e \"console.log(require('node:crypto').randomBytes(32).toString('base64url'))\"",
  }),

  /**
   * A chave que abre o envelope do segundo fator dos operadores.
   *
   * SEPARADA da `SEGUNDO_FATOR_CHAVE` do produto, e por um motivo concreto: com
   * a mesma chave, quem tivesse acesso de escrita ao banco do produto poderia
   * cifrar um segredo de TOTP conhecido e colá-lo na configuração do console. O
   * contexto (`console:<email>`) já impediria isso, mas duas defesas custam uma
   * variável de ambiente.
   */
  CONSOLE_SEGUNDO_FATOR_CHAVE: z.string().min(1, {
    message: "CONSOLE_SEGUNDO_FATOR_CHAVE é obrigatória: sem ela não há como abrir "
      + "o segundo fator dos operadores, e sem segundo fator não se entra no console.",
  }),

  /**
   * A SEMENTE do dono, e só isso, desde a migração 038.
   *
   * Os operadores vivem em `console_operadores`. Esta variável é lida UMA vez:
   * com a tabela vazia, a partida importa a linha como dono; com a tabela
   * povoada, ela é ignorada com aviso no log. Opcional por isso: um console
   * que já tem dono no banco sobe sem ela, e é assim que ela sai da
   * configuração depois do primeiro deploy. Ver `operadores.ts`.
   *
   * Vazia conta como ausente: `CONSOLE_OPERADORES=` num arquivo de segredos é
   * a forma comum de "ainda não gerei", e não deve ser lida como JSON.
   */
  CONSOLE_OPERADORES: z.string().optional().transform((v) => (v?.trim() ? v : undefined)),

  /**
   * A conexão com o banco, com o papel de leitura do console.
   *
   * Ausente, o processo sobe um Postgres em WebAssembly efêmero para
   * desenvolvimento, e a validação abaixo recusa essa combinação em produção
   * pela mesma razão da API: um console de produção lendo um banco que morre no
   * reinício mostraria "nenhum município escreveu" para sempre, que é
   * exatamente o alarme que ele existe para dar.
   */
  CONSOLE_DATABASE_URL: z.string().optional(),

  /**
   * Onde o Postgres em WebAssembly do desenvolvimento guarda os arquivos dele.
   *
   * Só tem efeito quando `CONSOLE_DATABASE_URL` está ausente, e serve a duas
   * coisas concretas:
   *
   *   1. O console que alguém está desenvolvendo para de nascer vazio a cada
   *      reinício, e vazio aqui é a tela mais enganosa possível, porque ela é
   *      idêntica à de "todos os municípios pararam de escrever".
   *   2. Numa máquina sem Postgres instalado, o relógio da API e o console
   *      conseguem compartilhar UM banco: o relógio abre o diretório, escreve a
   *      métrica e fecha; o console abre o mesmo diretório e lê. É assim que dá
   *      para exercitar o caminho inteiro, com os dois processos separados, sem
   *      exigir infraestrutura que alguém possa "pular por enquanto".
   *
   * Não vale em produção pela mesma razão da ausência de `CONSOLE_DATABASE_URL`:
   * a validação abaixo exige a URL, e ela vence.
   */
  CONSOLE_BANCO_LOCAL: z.string().optional(),
});

export type Config = z.infer<typeof ESQUEMA>;

/**
 * Os endereços que só a própria máquina alcança.
 *
 * Lista de NOMES, e não expressão regular sobre a faixa `127.0.0.0/8`, porque o
 * que se quer recusar aqui é o que uma pessoa realmente digita ou deixa como
 * padrão. Um endereço de loopback exótico (`127.0.0.2`) não é o defeito que
 * este portão existe para pegar, e tentar cobri-lo faria a regra recusar
 * também endereços legítimos no dia em que alguém colocar o console atrás de
 * um proxy na mesma máquina.
 *
 * `::` e `0.0.0.0` NÃO entram: os dois atendem em todas as interfaces, que é
 * exatamente o que se pede em contêiner.
 */
const ENDERECOS_DE_LOOPBACK: ReadonlySet<string> = new Set([
  "127.0.0.1",
  "localhost",
  "::1",
  "[::1]",
]);

export function carregarConfig(ambiente: NodeJS.ProcessEnv = process.env): Config {
  const resultado = ESQUEMA.safeParse(ambiente);
  if (!resultado.success) {
    const problemas = resultado.error.issues
      .map((p) => `${p.path.join(".")}: ${p.message}`)
      .join("\n  ");
    throw new Error(`Configuração do console inválida:\n  ${problemas}`);
  }

  const config = resultado.data;
  const producao = config.NODE_ENV === "production";

  if (producao && !config.CONSOLE_DATABASE_URL) {
    throw new Error(
      "Em produção o console exige CONSOLE_DATABASE_URL. Sem ela ele subiria "
      + "contra um Postgres em WebAssembly efêmero, sem métrica nenhuma dentro, e "
      + "mostraria todos os municípios como calados: o alarme que ele existe para "
      + "dar, disparado por ele mesmo.",
    );
  }

  /*
    A verificação do certificado do banco, conferida AQUI além de em
    `montarConfiguracaoDoPool`.

    É a mesma duplicação deliberada que a API faz com `DATABASE_URL`, e a razão
    está escrita em `api/src/banco/tls.js`: a partida precisa recusar antes de
    qualquer conexão nascer, e a montagem do pool precisa recusar porque nem
    toda conexão passa por este arquivo. A diferença aqui é só a mensagem, que
    nomeia `CONSOLE_DATABASE_URL`: um operador que lesse "DATABASE_URL" iria
    procurar o defeito no segredo da API, que está certo.
  */
  if (producao && config.CONSOLE_DATABASE_URL
      && !urlDoBancoVerifica(config.CONSOLE_DATABASE_URL)) {
    throw new Error(
      mensagemDeUrlSemVerificacao("CONSOLE_DATABASE_URL", config.CONSOLE_DATABASE_URL),
    );
  }

  /*
    O endereço de escuta vem POR ÚLTIMO entre as recusas de produção, e a ordem
    é deliberada: um console apontado para o banco errado é um problema pior que
    um console que atende no endereço errado, e quem implanta deve ler primeiro
    a mensagem do problema pior. As duas derrubam a partida do mesmo jeito.
  */
  if (producao && ENDERECOS_DE_LOOPBACK.has(config.CONSOLE_HOST.trim().toLowerCase())) {
    throw new Error(
      `Em produção o console recusa CONSOLE_HOST=${config.CONSOLE_HOST}. Dentro de um `
      + "contêiner o loopback é o do próprio contêiner, então o processo subiria "
      + "inteiro, diria no log que está no ar, e o balanceador bateria na porta "
      + "publicada sem ninguém atender: um aplicativo de pé que não responde, e "
      + "nenhuma linha de erro apontando para a causa. Use CONSOLE_HOST=0.0.0.0, "
      + "que é o que `fly.console.toml` declara.",
    );
  }

  return config;
}
