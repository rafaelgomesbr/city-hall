/**
 * O contrato de ambiente (DEV, HML e PROD), em funções puras.
 *
 * Este arquivo existe porque a API e o console precisam da MESMA régua para o
 * que é "este ambiente", e duas cópias dela envelhecem em ritmos diferentes.
 * O console já importa `banco/tls.js` da API pelo mesmo motivo. Nada aqui lê
 * `process.env`: quem chama passa o valor, e por isso tudo é testável sem
 * subir processo.
 *
 * ## O problema que ele resolve
 *
 * Até a V2-F01-E09 a única coisa que distinguia um ambiente de outro era
 * `NODE_ENV`, e o piloto roda como `production`. Um HML também rodaria como
 * `production`, e nada impediria que a `DATABASE_URL` de PROD fosse colada nele:
 * o app de homologação subiria, a validação passaria (a URL é válida, tem
 * `verify-full`, a porta é 5432) e a equipe passaria a "testar" em cima da base
 * dos municípios. O defeito não aparece em log nenhum, porque do ponto de vista
 * do processo está tudo certo.
 *
 * ## As três declarações, todas NÃO secretas
 *
 *   - `AMBIENTE_DC360` (`dev`, `hml`, `prod`): em que ambiente este processo
 *     acha que está. Obrigatória em produção.
 *   - `IDENTIDADE_DO_BANCO`: uma palavra que o usuário ou o host da URL do
 *     banco precisa conter (no Supabase, a referência do projeto). Uma URL de
 *     outro banco não a contém, e a partida recusa.
 *   - `DOMINIO_DO_AMBIENTE`: o domínio sob o qual ficam o painel e as origens
 *     CORS deste ambiente.
 *
 * As três ficam no `[env]` do `fly.toml`, e não nos segredos, de propósito: o
 * que importa é que elas sejam DIFERENTES entre os apps, e o conferidor
 * (`scripts/conferir-ambiente.mjs`) consegue provar isso lendo o repositório.
 * Valor secreto só dá para conferir no Fly.
 *
 * ## O que isto NÃO é
 *
 * Não é controle de acesso e não é isolamento entre municípios: a organização
 * nunca vem de configuração, vem do token verificado. Isto só impede que o
 * ambiente errado SUBA.
 */

export type AmbienteDc360 = "dev" | "hml" | "prod";

export const AMBIENTES: readonly AmbienteDc360[] = ["dev", "hml", "prod"];

/**
 * Domínios que o provedor reparte entre milhares de clientes.
 *
 * Declarar um destes como `DOMINIO_DO_AMBIENTE` faria a trava aceitar o painel
 * de QUALQUER projeto do provedor, inclusive o de PROD: o sufixo existe para
 * separar um ambiente do outro, e um sufixo que é de todo mundo não separa
 * ninguém. O domínio de um ambiente é o nome inteiro do projeto, por exemplo
 * `meu-painel.vercel.app`, e não `vercel.app`.
 */
export const DOMINIOS_COMPARTILHADOS: readonly string[] = [
  "vercel.app",
  "fly.dev",
  "supabase.co",
  "supabase.com",
  "netlify.app",
  "github.io",
  "herokuapp.com",
  "onrender.com",
  "railway.app",
  "pages.dev",
  "workers.dev",
  "web.app",
  "firebaseapp.com",
  "com.br",
  "gov.br",
  "org.br",
  "net.br",
];

/**
 * Lê `AMBIENTE_DC360` e confere se ele combina com `NODE_ENV`.
 *
 * Fora de produção, ausente vale `dev`. Em produção é obrigatória: um processo
 * que não sabe em que ambiente está é exatamente o que a trava de ambiente
 * cruzado não consegue proteger. E as combinações incoerentes recusam:
 *
 *   - `dev` com `NODE_ENV=production`: produção de verdade rodando com a
 *     declaração "isto é a minha máquina", que desligaria todas as travas.
 *   - `prod` sem `NODE_ENV=production`: o ambiente que mais importa rodando
 *     sem as recusas de produção.
 *
 * `hml` sem `NODE_ENV=production` é aceito: serve para ensaiar a configuração
 * de homologação na máquina de quem desenvolve.
 */
export function resolverAmbiente(
  bruto: string | undefined,
  nodeEnv: string,
  nome = "AMBIENTE_DC360",
): AmbienteDc360 {
  const emProducao = nodeEnv === "production";
  const texto = bruto?.trim();

  if (!texto) {
    if (emProducao) {
      throw new Error(
        `${nome} é obrigatória com NODE_ENV=production e não veio. Defina hml ou prod ` +
          "(está no [env] do fly.toml do app). Sem ela o processo não sabe em que " +
          "ambiente está, e as travas contra configuração cruzada, como um HML " +
          "apontado para o banco de PROD, não têm como valer.",
      );
    }
    return "dev";
  }

  if (!(AMBIENTES as readonly string[]).includes(texto)) {
    throw new Error(
      `${nome}=${texto} não é um ambiente conhecido. Os valores aceitos são ` +
        `${AMBIENTES.join(", ")}, em minúsculas e sem acento.`,
    );
  }
  const ambiente = texto as AmbienteDc360;

  if (emProducao && ambiente === "dev") {
    throw new Error(
      `${nome}=dev não combina com NODE_ENV=production. Um processo de produção ` +
        "que se declara máquina de desenvolvimento desligaria as travas de ambiente. " +
        "Use hml ou prod.",
    );
  }
  if (!emProducao && ambiente === "prod") {
    throw new Error(
      `${nome}=prod exige NODE_ENV=production. O ambiente de produção não pode ` +
        "rodar sem as recusas de produção.",
    );
  }
  return ambiente;
}

/**
 * A URL do banco contém a identidade esperada, no usuário ou no host?
 *
 * Compara por SEGMENTO separado por ponto, e não por trecho de texto: o
 * Supabase põe a referência do projeto como segundo segmento do usuário
 * (`dc360_api.<ref>`) e como segundo do host direto (`db.<ref>.supabase.co`).
 * Por trecho, a identidade `abc` aceitaria o projeto `xabcx`.
 *
 * Nunca devolve nem registra a URL: a senha mora nela.
 */
export function identidadeConstaNaUrlDoBanco(url: string, identidade: string): boolean {
  let analisada: URL;
  try {
    analisada = new URL(url);
  } catch {
    return false;
  }
  let usuario = analisada.username;
  try {
    usuario = decodeURIComponent(usuario);
  } catch {
    // Percent-encoding quebrado: o usuário cru ainda serve para a comparação.
  }
  const alvo = identidade.toLowerCase();
  const segmentos = [
    ...usuario.toLowerCase().split("."),
    ...analisada.hostname.toLowerCase().split("."),
  ];
  return segmentos.includes(alvo);
}

/** O `host` é o próprio `dominio` ou fica embaixo dele? Sem curinga, sem trecho solto. */
export function hostNoDominio(host: string, dominio: string): boolean {
  const h = host.toLowerCase();
  const d = dominio.toLowerCase();
  return h === d || h.endsWith(`.${d}`);
}

/**
 * Confere o formato de `DOMINIO_DO_AMBIENTE`. Devolve o problema, ou `null`.
 *
 * Só nome de domínio: sem esquema, sem porta, sem caminho, sem curinga, e com
 * ao menos dois rótulos. E não pode ser um dos domínios que o provedor reparte
 * com outros clientes (ver `DOMINIOS_COMPARTILHADOS`).
 */
export function problemaNoDominio(dominio: string): string | null {
  if (!/^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/.test(dominio)) {
    return (
      "precisa ser só o nome do domínio, em minúsculas, como " +
      "`painel-hml.vercel.app`: sem https://, sem porta, sem barra, sem curinga"
    );
  }
  if (DOMINIOS_COMPARTILHADOS.includes(dominio)) {
    return (
      `${dominio} é um domínio que o provedor reparte com outros clientes: ` +
      "uma trava que aceita o domínio de todo mundo não separa nenhum ambiente. " +
      "Use o nome inteiro do projeto, por exemplo `meu-painel.vercel.app`"
    );
  }
  return null;
}

/**
 * Confere UMA origem de `ORIGENS_PERMITIDAS` para produção. Devolve o problema,
 * ou `null`.
 *
 * O `@fastify/cors` compara o texto do cabeçalho `Origin` com a lista, letra por
 * letra. O navegador manda `https://host`, em minúsculas, sem barra final e
 * sem caminho. Uma entrada com barra final, com caminho ou em `http://` NUNCA
 * casa, e o sintoma é um painel que não consegue falar com a API sem nenhum
 * erro no servidor: só um erro de CORS no console do navegador.
 */
export function problemaNaOrigem(origem: string): string | null {
  if (origem.includes("*")) {
    return "ORIGENS_PERMITIDAS não pode conter curinga em produção";
  }
  let analisada: URL;
  try {
    analisada = new URL(origem);
  } catch {
    return `ORIGENS_PERMITIDAS tem uma entrada que não é uma URL (${origem})`;
  }
  if (analisada.protocol !== "https:") {
    return `ORIGENS_PERMITIDAS só aceita https em produção (${origem})`;
  }
  if (analisada.origin !== origem) {
    return (
      "ORIGENS_PERMITIDAS precisa listar só esquema e host, em minúsculas, " +
      "como `https://painel.exemplo.com.br`: sem barra final, sem caminho, sem " +
      `consulta e sem usuário (${origem}). O navegador manda a origem sem nada ` +
      "disso, a API compara o texto inteiro, e uma entrada diferente nunca casa"
    );
  }
  return null;
}

/** Quebra a lista `a.com, b.com` em domínios minúsculos e não vazios. */
export function listaDeDominios(bruto: string | undefined): string[] {
  return (bruto ?? "")
    .split(",")
    .map((d) => d.trim().toLowerCase())
    .filter(Boolean);
}
