import pg from "pg";
import { montarConfiguracaoDoPool, type OpcoesDoBanco } from "../banco/postgres.js";

/**
 * A trava que impede duas máquinas de varrerem o mesmo prazo.
 *
 * O DEFEITO QUE ELA EVITA é concreto e barulhento: em produção a API roda em
 * mais de uma máquina no Fly, e as duas sobem o mesmo varredor. Sem trava, as
 * duas encontram a mesma ocorrência com prazo vencendo no mesmo minuto e o
 * agente recebe tudo em duplicata, no meio da noite, na rua. Notificação
 * duplicada é o caminho mais curto para o agente desligar a notificação do
 * aplicativo, e aí o produto perde o único canal que alcança quem está em
 * campo.
 *
 * A trava é de POSSE, e não de espera: quem não pega, desiste desta rodada e
 * volta na próxima. Enfileirar seria pior, porque a segunda máquina ia varrer
 * logo depois da primeira, com a mesma janela, e o trabalho já estaria feito.
 *
 * A segunda barreira, por baixo desta, é a tabela `notificacoes_enviadas`: a
 * trava protege o caso comum, e a unicidade no banco protege o caso em que a
 * trava não existe (processo que morreu segurando, rede partida entre as
 * máquinas). Trava de processo cai junto com o processo; linha em tabela não.
 */
export type Trava = {
  /** `false` significa "outra máquina está varrendo agora". Não espera. */
  tentar(): Promise<boolean>;
  soltar(): Promise<void>;
  encerrar(): Promise<void>;
};

/**
 * O número da trava no banco.
 *
 * Escolhido à mão, sem relação com dado nenhum. O que importa é ser estável
 * entre deploys (senão duas versões da API varrem juntas durante a troca) e
 * distante o bastante de números redondos para não colidir com trava de outra
 * coisa no mesmo banco: o provedor gerenciado também usa travas de aviso.
 */
export const CHAVE_DA_VARREDURA_DE_PRAZO = 5410360016;

/**
 * A trava da varredura de minimização por prazo (migração 021).
 *
 * Número PRÓPRIO, e não o mesmo da varredura de prazo, porque as duas rodam em
 * relógios diferentes e não competem pelo mesmo trabalho. Compartilhar a chave
 * faria a minimização deixar de rodar toda vez que a varredura de push
 * estivesse no ar naquele instante, e o efeito seria dado pessoal sobrevivendo
 * ao prazo sem que nada no log dissesse por quê.
 */
export const CHAVE_DA_MINIMIZACAO = 5410360021;

/**
 * Trava de verdade, sobre `pg_try_advisory_lock`.
 *
 * CONEXÃO PRÓPRIA, e isso não é detalhe de implementação: a trava de aviso do
 * Postgres é de SESSÃO, então ela vive enquanto a conexão que a pegou viver.
 * Numa conexão de pool, a mesma conexão volta para o pool e serve outra
 * requisição ainda segurando a trava, e a trava passa a ser solta em outro
 * momento, por outro caminho, ou nunca.
 *
 * A conexão exclusiva resolve os dois lados: a trava dura exatamente a
 * varredura, e a varredura não consome uma conexão que o agente em campo
 * precisa para sincronizar a vistoria dele.
 *
 * `chave` é parâmetro porque existe mais de uma rotina que roda sozinha em
 * duas máquinas do Fly. Cada uma traz a sua; o padrão continua sendo a
 * varredura de prazo, que é quem já chamava isto.
 */
export function travaPostgres(
  url: string,
  opcoes: OpcoesDoBanco = {},
  chave: number = CHAVE_DA_VARREDURA_DE_PRAZO,
): Trava {
  const configuracao = montarConfiguracaoDoPool(url, opcoes);
  let cliente: pg.Client | null = null;

  async function conectado(): Promise<pg.Client> {
    if (cliente) return cliente;
    const novo = new pg.Client(configuracao);
    /*
      Sem este ouvinte, uma queda de conexão com o banco vira exceção não
      tratada e derruba a API inteira por causa do varredor, que é a parte
      menos importante do processo.
    */
    novo.on("error", () => { cliente = null; });
    await novo.connect();
    cliente = novo;
    return novo;
  }

  return {
    async tentar() {
      const c = await conectado();
      const r = await c.query<{ travou: boolean }>(
        "SELECT pg_try_advisory_lock($1::bigint) AS travou",
        [String(chave)],
      );
      return r.rows[0]?.travou === true;
    },
    async soltar() {
      if (!cliente) return;
      await cliente.query("SELECT pg_advisory_unlock($1::bigint)", [
        String(chave),
      ]).catch(() => undefined);
    },
    async encerrar() {
      const atual = cliente;
      cliente = null;
      await atual?.end().catch(() => undefined);
    },
  };
}

/**
 * Trava de um processo só, para o banco em WebAssembly do desenvolvimento.
 *
 * Ali existe uma conexão só e um processo só, então a trava de aviso do
 * Postgres não teria o que separar. Isto é honesto sobre o que faz: guarda
 * contra duas varreduras se sobreporem dentro do MESMO processo, que é o caso
 * real quando uma varredura demora mais que o intervalo do relógio, e não
 * guarda contra nada além disso.
 */
export function travaDeProcesso(): Trava {
  let tomada = false;
  return {
    async tentar() {
      if (tomada) return false;
      tomada = true;
      return true;
    },
    async soltar() { tomada = false; },
    async encerrar() { tomada = false; },
  };
}
