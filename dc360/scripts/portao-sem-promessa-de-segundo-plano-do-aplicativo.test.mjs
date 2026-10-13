/**
 * Nenhuma promessa de segundo plano na interface do aplicativo de campo
 * (V2-F00-E16, correção 1).
 *
 * O fato: a fila só drena enquanto o aplicativo está ABERTO. O laço
 * (`iniciarSincronizacaoContinua`) vive no layout das abas, e o aplicativo não
 * tem `expo-task-manager`, nem modo de fundo declarado. Sincronização em
 * segundo plano é a F14-E06 e só existe se o CP-24 aprovar.
 *
 * O defeito: a E16 consertou a frase da vistoria guardada ("mesmo com o
 * aplicativo fechado") e blindou SÓ essa tela com um `queryByText`. A fila,
 * duas telas depois, continuava dizendo "o envio acontece sozinho, em segundo
 * plano", e a arbitragem da validação reprovou a etapa por isso. O agente que
 * lê isso fecha o aplicativo sem sinal e acredita que a vistoria subiu.
 *
 * Este portão varre a fonte de TODO o aplicativo (menos comentários, que
 * explicam o defeito e precisam poder citá-lo, e menos os testes, que
 * precisam escrever a frase proibida para provar que ela sumiu). O que ele
 * reprova, em texto que o agente lê:
 *
 * 1. "segundo plano", "em background", "nos bastidores";
 * 2. "aplicativo fechado" e variações ("mesmo fechado", "fechou o app");
 * 3. um verbo de envio seguido de "sozinho/sozinha" ("sai sozinho", "sobe
 *    sozinha"), que diz que a coisa acontece sem o aplicativo precisar estar
 *    em uso. A frase verdadeira diz a condição: "quando o aplicativo estiver
 *    aberto e houver sinal";
 * 4. "assim que houver sinal", que condiciona o envio só ao sinal.
 *
 * Limite, dito na cara: ele lê TEXTO escrito, não o que o React Native
 * desenha. Frase montada em tempo de execução a partir de valor de fora do
 * arquivo passa por ele (é o mesmo limite dos outros portões do aplicativo).
 * `app.config.ts` fica fora da varredura: ali "nunca em segundo plano" é a
 * promessa VERDADEIRA de que a localização não roda em segundo plano.
 *
 * A prova de que o portão morde está no próprio arquivo (ver o último teste):
 * as frases que a arbitragem achou são reprovadas.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { arquivosDeFonte, nomeCurto, semComentarios } from "./fonte-do-aplicativo.mjs";

const PROMESSAS = [
  { nome: "segundo plano", regra: /segundo plano|em background|nos bastidores|plano de fundo/i },
  {
    nome: "aplicativo fechado",
    regra: /(aplicativo|app) fechado|mesmo fechado|fechou o (aplicativo|app)/i,
  },
  {
    nome: "envio sozinho",
    regra: /\b(sai|saem|sobe|sobem|envia|enviam|acontece|chega|chegam)\b[^.\n]{0,25}\bsozinh[oa]s?\b/i,
  },
  { nome: "só o sinal como condição", regra: /assim que houver (sinal|rede|conexão)/i },
];

/**
 * O texto de tela, sem comentário, com as frases partidas em várias linhas
 * emendadas: `"vai sair assim que " + "houver sinal"` é UMA frase para o
 * agente, e uma varredura linha a linha não a enxerga. Cada caractere guarda
 * a linha de onde veio, para a mensagem apontar o lugar certo.
 */
function textoEmendado(fonte) {
  const limpo = semComentarios(fonte);
  const caracteres = [];
  const linhas = [];
  let linha = 1;
  let i = 0;
  while (i < limpo.length) {
    const emenda = /^["'`]\s*\+\s*["'`]/.exec(limpo.slice(i, i + 200));
    if (emenda) {
      linha += emenda[0].split("\n").length - 1;
      i += emenda[0].length;
      continue;
    }
    const c = limpo[i];
    if (/\s/.test(c)) {
      if (c === "\n") linha += 1;
      if (caracteres[caracteres.length - 1] !== " ") { caracteres.push(" "); linhas.push(linha); }
    } else {
      caracteres.push(c);
      linhas.push(linha);
    }
    i += 1;
  }
  return { texto: caracteres.join(""), linhas };
}

/** Cada trecho de texto (sem comentário) que casa com alguma regra. */
export function promessasEm(fonte) {
  const { texto, linhas } = textoEmendado(fonte);
  const achados = [];
  for (const { nome, regra } of PROMESSAS) {
    for (const m of texto.matchAll(new RegExp(regra.source, "gi"))) {
      achados.push({
        linha: linhas[m.index] ?? 0,
        nome,
        texto: texto.slice(Math.max(0, m.index - 30), m.index + m[0].length + 20).trim(),
      });
    }
  }
  return achados.sort((a, b) => a.linha - b.linha);
}

test("nenhum texto do aplicativo promete segundo plano nem envio com o aplicativo fechado", () => {
  const problemas = [];
  const arquivos = arquivosDeFonte();
  assert.ok(arquivos.length > 50, "a varredura precisa achar o aplicativo inteiro");
  for (const arquivo of arquivos) {
    for (const a of promessasEm(readFileSync(arquivo, "utf8"))) {
      problemas.push(`${nomeCurto(arquivo)}:${a.linha} [${a.nome}] ${a.texto}`);
    }
  }
  assert.deepEqual(
    problemas,
    [],
    "A fila só envia com o aplicativo aberto. Diga a condição: "
      + "'quando o aplicativo estiver aberto e houver sinal'.\n" + problemas.join("\n"),
  );
});

test("o portão morde: as frases que a arbitragem achou na fila são reprovadas", () => {
  const vazio = `descricao={"e o envio do que vier depois acontece sozinho, em segundo plano."}`;
  const legenda = `<Txt>O envio acontece sozinho, em segundo plano. Este botão é para quando</Txt>`;
  assert.ok(promessasEm(vazio).some((a) => a.nome === "segundo plano"));
  assert.ok(promessasEm(legenda).some((a) => a.nome === "envio sozinho"));
  assert.ok(promessasEm(`"sobe mesmo com o aplicativo fechado"`).some((a) => a.nome === "aplicativo fechado"));
  assert.ok(promessasEm(`"A coleta sai sozinha assim que houver sinal."`).length >= 2);
});

test("o portão não pune quem explica: comentário pode citar a frase proibida", () => {
  const fonte = [
    "/* Ela prometia 'em segundo plano', e isso era falso. */",
    "// o envio acontece sozinho, em segundo plano (antes)",
    `const frase = "Ela sobe com o aplicativo aberto";`,
  ].join("\n");
  assert.deepEqual(promessasEm(fonte), []);
});

test("as frases verdadeiras passam", () => {
  const ok = [
    "sobe quando o aplicativo estiver aberto e houver rede",
    "Com o aplicativo aberto e com sinal, o envio acontece sem você tocar em nada.",
    "Ainda não saiu do aparelho. Vai sair quando o aplicativo estiver aberto e houver sinal.",
  ];
  for (const frase of ok) assert.deepEqual(promessasEm(`"${frase}"`), [], frase);
});
