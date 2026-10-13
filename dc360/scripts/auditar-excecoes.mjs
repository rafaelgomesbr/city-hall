/**
 * A lista nomeada de exceções do aplicativo de campo (CP-03) e a regra que a
 * valida. Fica fora de `auditar.mjs` porque aquele arquivo roda o portão assim
 * que é importado, e o teste precisa chamar a validação sozinha, com datas e
 * listas sintéticas.
 */

/**
 * Advisories do aplicativo de campo que hoje NÃO dá para fechar, com o motivo.
 *
 * Nenhuma delas vem de dependência escolhida por este projeto: chegam por
 * dentro do Expo, e `npm audit fix --force` quebraria a compilação nativa.
 * A lista tem nome e razão de propósito, para envelhecer em público.
 *
 * `js-yaml` (por `@expo/xcpretty`) esteve aqui até 15/09/2026 com a razão
 * "sai quando o Expo atualizar", e a razão era falsa: o `npm audit` já dizia
 * `fixAvailable: true`, e um `npm audit fix` a fechou. É o caso que fez este
 * portão passar a reprovar aceita com correção disponível (ver abaixo).
 */
/*
  Cada exceção tem `motivo`, `dono` e `ate` (AAAA-MM-DD). Vencido o prazo, o
  portão reprova até alguém reavaliar. `comCorrecao: true` só vale para o caso em
  que o `npm audit` diz `fixAvailable: true` mas a correção é inaplicável (ver
  CP-03, decidido por Rafael em 2026-10-07): o `npm audit fix` em apps/campo
  reembaralha a árvore inteira do Expo e mistura pacotes do SDK 57 e do 58.
*/
const DONO = "Rafael";
const PRAZO = "2027-01-05";
const FERRAMENTA_DO_EXPO = "Chega por dentro do pacote `expo` (ferramenta de "
  + "build e de desenvolvimento, que roda na máquina de quem compila) e NÃO entra "
  + "no pacote JavaScript que vai para o telefone do agente. ";
const SEM_FIX_SEGURO = "O `npm audit fix` em apps/campo não é aplicável: "
  + "reembaralha a árvore do Expo e mistura pacotes do SDK 57 e 58. A saída é "
  + "subir o SDK do Expo por inteiro, o que exige novo binário nativo. ";

export const ACEITAS_NO_APLICATIVO = {
  "decode-uri-component": {
    motivo: "Chega por expo-router > query-string, e esta vai "
      + "junto com o aplicativo. O ataque é negação de serviço por percentual mal "
      + "formado numa URL, e a única URL que o aplicativo analisa é o próprio link "
      + "profundo dele. Sem correção acima sem trocar o expo-router.",
    dono: DONO, ate: PRAZO,
  },
  "brace-expansion": {
    motivo: FERRAMENTA_DO_EXPO + "Negação de serviço por padrão `{a},b}` em glob, "
      + "e o aplicativo não expande glob em execução. " + SEM_FIX_SEGURO,
    dono: DONO, ate: PRAZO, comCorrecao: true,
  },
  braces: {
    motivo: FERRAMENTA_DO_EXPO + "Negação de serviço por padrão aninhado em glob "
      + "(micromatch), só no bundler. " + SEM_FIX_SEGURO,
    dono: DONO, ate: PRAZO,
  },
  "node-forge": {
    motivo: FERRAMENTA_DO_EXPO + "Vem de @expo/code-signing-certificates, usado "
      + "para assinar atualização do EAS na máquina de build, não no telefone. "
      + SEM_FIX_SEGURO,
    dono: DONO, ate: PRAZO,
  },
  "shell-quote": {
    motivo: FERRAMENTA_DO_EXPO + "Vem de react-devtools-core, só no modo de "
      + "desenvolvimento. Injeção de comando exige que o desenvolvedor passe "
      + "entrada hostil ao `quote()` local. " + SEM_FIX_SEGURO,
    dono: DONO, ate: PRAZO, comCorrecao: true,
  },
  "sprintf-js": {
    motivo: FERRAMENTA_DO_EXPO + "Vem de argparse > js-yaml, usado só para ler "
      + "configuração local de ferramenta. " + SEM_FIX_SEGURO,
    dono: DONO, ate: PRAZO,
  },
};

/**
 * A política do CP-03 diz que exceção é NOMEADA, com dono e prazo. Esta função é
 * o que faz a lista cumprir isso, em vez de a regra viver só num comentário.
 *
 * Devolve uma frase por defeito (vazio = lista válida), olhando TODAS as
 * entradas e não só as que aparecem no relatório de hoje: exceção malformada que
 * ainda não foi usada é o defeito que explode no dia em que o pacote aparecer.
 *
 * O prazo exige AAAA-MM-DD que exista no calendário. Sem isso `undefined < hoje`
 * e `"amanhã" < hoje` são falsos, e a exceção ficaria eterna sem ninguém ver.
 * Vale até o fim do dia escrito: vence quando `ate < hoje`.
 *
 * @param {Record<string, {motivo?: unknown, dono?: unknown, ate?: unknown}>} aceitas
 * @param {string} hoje AAAA-MM-DD
 * @returns {string[]}
 */
export function problemasDasExcecoes(aceitas, hoje) {
  const problemas = [];
  const preenchido = (v) => typeof v === "string" && v.trim() !== "";
  for (const [nome, e] of Object.entries(aceitas)) {
    if (!preenchido(e?.motivo)) problemas.push(`${nome}: exceção sem motivo escrito`);
    if (!preenchido(e?.dono)) problemas.push(`${nome}: exceção sem dono`);
    if (e?.ate === undefined || e?.ate === null || e?.ate === "") {
      problemas.push(`${nome}: exceção sem prazo (\`ate\`, AAAA-MM-DD)`);
    } else if (!dataValida(e.ate)) {
      problemas.push(`${nome}: prazo inválido ${JSON.stringify(e.ate)} (esperado AAAA-MM-DD, uma data que exista)`);
    } else if (e.ate < hoje) {
      problemas.push(`${nome}: a exceção venceu em ${e.ate}`);
    }
  }
  return problemas;
}

function dataValida(texto) {
  if (typeof texto !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(texto)) return false;
  const d = new Date(`${texto}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === texto;
}
