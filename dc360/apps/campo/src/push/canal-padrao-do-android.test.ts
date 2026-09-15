import { CANAL_COMUM, CANAL_URGENCIA, SOM_DE_DESPACHO } from "./canais";

/**
 * O canal padrão declarado para as lojas precisa ser um canal que existe.
 *
 * `app.config.ts` é lido pelo Expo antes de qualquer TypeScript nosso rodar,
 * então ele não pode importar `CANAL_COMUM`: o identificador está escrito lá
 * como texto solto. Texto solto copiado de uma constante é a forma clássica de
 * as duas divergirem em três meses, e a divergência aqui falha do jeito mais
 * silencioso possível: o Android roteia o aviso para um canal que o aplicativo
 * nunca criou, o sistema inventa um canal genérico, e as duas linhas que a
 * pessoa vê nos ajustes deixam de controlar o que ela recebe.
 *
 * Este arquivo é o portão que impede isso, e é o único lugar do repositório em
 * que as duas pontas se encontram.
 */

/**
 * Carregado por `jest.requireActual`, e não por `import`, de propósito.
 *
 * `app.config.ts` fica fora do `include` do `tsconfig.json`: quem o lê é o
 * Expo, com o próprio carregador, e não o nosso `tsc`. Um `import` normal o
 * arrastaria para dentro do typecheck do aplicativo, onde ele reprova por causa
 * de chaves legadas que o Expo ainda aceita e o tipo atual já não declara, e o
 * portão passaria a reprovar por um motivo que não tem nada a ver com a
 * notificação. `requireActual` recebe um texto, então o TypeScript não segue o
 * caminho, e o que este arquivo confere continua sendo exatamente o mesmo valor
 * que vai para a loja.
 */
function opcoesDoPluginDeNotificacao(): Record<string, unknown> {
  const config = jest.requireActual<{ default: { plugins?: unknown[] } }>(
    "../../app.config",
  ).default;
  const entrada = (config.plugins ?? []).find(
    (p) => Array.isArray(p) && p[0] === "expo-notifications",
  );
  if (!Array.isArray(entrada)) throw new Error("o plugin expo-notifications não está declarado");
  return (entrada[1] ?? {}) as Record<string, unknown>;
}

it("declara o canal padrão do Android com o mesmo identificador do código", () => {
  expect(opcoesDoPluginDeNotificacao()["defaultChannel"]).toBe(CANAL_COMUM);
});

/*
  O padrão é o SILENCIOSO, e a escolha é deliberada.

  Enquanto o servidor não mandar `channelId` no dado da mensagem, tudo cai neste
  canal. Das duas maneiras de errar, esta é a barata: um aviso que espera o
  agente abrir o aplicativo custa atraso, e um aviso de severidade baixa tocando
  às três da manhã custa o aplicativo inteiro silenciado nos ajustes, para
  sempre, inclusive o de severidade crítica.
*/
it("escolhe o canal silencioso como padrão, e não o que acorda", () => {
  expect(opcoesDoPluginDeNotificacao()["defaultChannel"]).not.toBe(CANAL_URGENCIA);
});

/*
  Um binário de loja assinado com `aps-environment: development` é aceito pela
  App Store, instala, registra a ficha e simplesmente nunca recebe notificação
  nenhuma: a ficha é de um ambiente e o servidor fala com o outro. Ninguém
  descobre pelo aplicativo, e o agente conclui que o produto não avisa. Por isso
  quem decide é o perfil do build, e não a memória de quem publica.
*/
it("deixa o ambiente do iOS ser decidido pelo perfil do build", () => {
  expect(opcoesDoPluginDeNotificacao()["mode"]).toBe(
    process.env["EAS_BUILD_PROFILE"] === "producao" ? "production" : "development",
  );
});

/* ========================================================================
   O som de despacho, declarado às duas lojas
   ======================================================================== */

/**
 * O `ios.entitlements` resolvido, pela mesma leitura de `app.config.ts`.
 *
 * Só o que está escrito no arquivo: o plugin do `expo-notifications` acrescenta
 * `aps-environment` depois, no `prebuild`, e isso é conferido por
 * `scripts/entitlements-do-ios.test.mjs` no projeto gerado.
 */
function entitlementsDoIos(): Record<string, unknown> {
  const config = jest.requireActual<{ default: { ios?: { entitlements?: Record<string, unknown> } } }>(
    "../../app.config",
  ).default;
  return config.ios?.entitlements ?? {};
}

/*
  Sem esta linha o `prebuild` não copia o arquivo para o projeto nativo, e o
  som que o servidor pede (`aps.sound = "despacho.wav"`) e o que o canal do
  Android declara caem no som padrão do sistema. Ninguém vê erro: o aviso
  chega, com o toque de sempre, e o pedido de "som característico" morre
  calado. O nome bate com `SOM_DE_DESPACHO` em `canais.ts` porque o Android
  resolve o recurso pelo nome do arquivo e o iOS pelo nome no bundle.
*/
it("declara o som de despacho ao plugin, com o mesmo nome que os canais usam", () => {
  const sons = opcoesDoPluginDeNotificacao()["sounds"];
  expect(Array.isArray(sons)).toBe(true);
  expect(sons).toContain(`./assets/sons/${SOM_DE_DESPACHO}`);
});

/*
  `interruption-level: time-sensitive` só vale com este direito no binário.
  Sem ele o iOS rebaixa a notificação para `active` em silêncio: o servidor
  manda, a Apple entrega, e o Foco do agente no plantão noturno engole o
  despacho. A Apple documenta o direito como
  `com.apple.developer.usernotifications.time-sensitive`, e ele entra no
  entitlements ao lado do `aps-environment`, que o plugin escreve.

  O direito fica atrás de `DC360_TIME_SENSITIVE=sim`, e o porquê está em
  `app.config.ts`: ele só compila depois que a capacidade é ligada no App ID,
  na conta da Apple do dono, e o padrão desligado é o que mantém o binário
  compilando enquanto isso. O que se prova aqui é a chave nas duas posições.
*/
describe("o direito de notificação sensível ao tempo", () => {
  const CHAVE = "com.apple.developer.usernotifications.time-sensitive";
  const anterior = process.env["DC360_TIME_SENSITIVE"];
  afterEach(() => {
    if (anterior === undefined) delete process.env["DC360_TIME_SENSITIVE"];
    else process.env["DC360_TIME_SENSITIVE"] = anterior;
    jest.resetModules();
  });

  it("com DC360_TIME_SENSITIVE=sim, o app.config.ts pede o direito", () => {
    process.env["DC360_TIME_SENSITIVE"] = "sim";
    jest.resetModules();
    expect(entitlementsDoIos()[CHAVE]).toBe(true);
  });

  it("sem a variável, o direito fica de fora, e a compilação não depende do perfil ter a capacidade", () => {
    delete process.env["DC360_TIME_SENSITIVE"];
    jest.resetModules();
    expect(entitlementsDoIos()[CHAVE]).toBeUndefined();
  });
});
