/**
 * Nenhuma promessa de segundo plano na interface do aplicativo de campo
 * (V2-F00-E16, correção 1; regra por classe na correção 2).
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
 * precisam escrever a frase proibida para provar que ela sumiu). O que o
 * CÓDIGO reprova, em texto que o agente lê, nesta ordem:
 *
 * 1. a LISTA de expressões conhecidas (`PROMESSAS`): "segundo plano",
 *    "background", "nos bastidores", "aplicativo fechado" e variações,
 *    "aparelho bloqueado/guardado", "sem abrir o aplicativo", "sai sozinho",
 *    "assim que houver sinal". É a rede mais fina, e é a que a primeira versão
 *    do portão tinha inteira;
 * 2. a regra por CLASSE, que é a que importa e que não depende de a expressão
 *    ter aparecido antes. Ela olha cada frase e cada trecho de texto da tela:
 *
 *    - AFASTAMENTO: qualquer forma de o agente deixar o aplicativo ou o
 *      aparelho de lado (fechar, minimizar, bloquear, desligar, guardar o
 *      aparelho ou o aplicativo, sair do aplicativo, trocar de aplicativo,
 *      "no bolso", "ir embora"), reconhecida pelo RADICAL do verbo, e não por
 *      lista de flexões ("feche", "fechar", "fechando", "fechou" são a mesma
 *      coisa). Afastamento negado ou precavido ("não feche", "antes de
 *      fechar", "sem fechar") não conta: é o aviso verdadeiro;
 *    - PROMESSA: qualquer verbo de envio, sincronização, chegada, término ou
 *      continuidade, também por radical (enviar, subir, sair, chegar, terminar,
 *      continuar, seguir, rodar, tentar...);
 *    - AUTONOMIA: "sozinho", "automaticamente", "em instantes", "em breve",
 *      "a qualquer momento", "não precisa fazer nada", "quando houver sinal"...;
 *    - CONDIÇÃO: "aberto/aberta" sem negação ("sem o aplicativo aberto" NÃO é
 *      condição, é a promessa que se quer impedir).
 *
 *    Reprova a FRASE que junta PROMESSA com AFASTAMENTO ou com AUTONOMIA e não
 *    traz a CONDIÇÃO. Reprova também o TRECHO de texto (o conjunto das frases
 *    de um mesmo texto da tela) que junta PROMESSA com AFASTAMENTO, para pegar
 *    "Pode fechar o aplicativo. O envio termina." em duas frases. E reprova o
 *    CONVITE a sair ("Pode fechar o aplicativo", "Basta bloquear a tela") sem
 *    a condição, mesmo que a promessa venha em outra frase, ou nem venha.
 *
 * O que o código NÃO reprova, dito aqui para o documento não prometer mais do
 * que o código faz: "tela bloqueada" sozinha (é onde a notificação aparece, e
 * não há promessa de envio nela); afastamento sem nenhuma promessa na frase ou
 * no trecho e sem convite ("Ele fica legível na tela bloqueada"); uma promessa
 * de envio sem afastamento e sem autonomia ("A vistoria será enviada"); e
 * texto montado em tempo de execução a partir de valor de fora do arquivo.
 *
 * Limite, dito na cara: ele lê TEXTO escrito, não o que o React Native
 * desenha, e reconhece palavras do português por radical, não por sentido.
 * Quem escrever a promessa com uma palavra que nenhum radical alcança passa
 * por ele; a defesa é a lista de casos que precisam reprovar, abaixo, que cresce
 * a cada promessa nova que alguém plantar. `app.config.ts` fica fora da
 * varredura: ali "nunca em segundo plano" é a promessa VERDADEIRA de que a
 * localização não roda em segundo plano.
 *
 * A prova de que o portão morde está no próprio arquivo (ver os últimos
 * testes): as frases que a arbitragem achou e as que o revisor plantou são
 * reprovadas, as frases verdadeiras passam, e a fila real reprova quando se
 * planta cada uma delas.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { arquivosDeFonte, nomeCurto, semComentarios } from "./fonte-do-aplicativo.mjs";

const PROMESSAS = [
  {
    nome: "segundo plano",
    regra: /segundo[ -]plano|\bbackground\b|nos bastidores|plano de fundo|\bde fundo\b/i,
  },
  {
    nome: "aplicativo fechado",
    regra: /(aplicativo|app) fechado|mesmo fechado|(mesmo )?sem (precisar )?abrir (o|este|esse) (aplicativo|app)|\bmesmo sem abrir\b|(aparelho|celular) (bloqueado|guardado|no bolso)/i,
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

/*
  A regra por CLASSE (correção 2). Quatro conjuntos, reconhecidos por RADICAL do
  verbo e não por lista de palavras inteiras:

  - PROMESSA: a frase fala da coisa subir, chegar, terminar ou continuar
    (enviar, subir, sair, sincronizar, chegar, terminar, continuar, seguir,
    rodar, tentar, receber...).
  - AUTONOMIA: a frase diz que isso acontece sem o agente fazer nada, ou diz
    QUANDO acontece de um jeito que dispensa o aplicativo em uso (sozinho,
    automático, em instantes, a qualquer momento, não precisa fazer nada,
    quando houver sinal...).
  - AFASTAMENTO: a frase fala de o agente deixar o aplicativo ou o aparelho de
    lado (fechar, minimizar, bloquear, desligar, guardar, sair do aplicativo,
    trocar de aplicativo, no bolso, ir embora). Se vem negado ou precavido
    ("não feche", "antes de fechar", "sem fechar"), é o aviso verdadeiro e não
    conta.
  - CONDIÇÃO: "aberto/aberta" sem negação. É a condição verdadeira: a fila só
    drena com o aplicativo aberto. "Sem o aplicativo aberto" NÃO é condição.

  Reprova: PROMESSA com AUTONOMIA, ou PROMESSA com AFASTAMENTO, sem CONDIÇÃO,
  na mesma frase; PROMESSA com AFASTAMENTO no mesmo trecho de texto da tela
  (duas frases seguidas); e o CONVITE a sair ("pode fechar o aplicativo")
  sem CONDIÇÃO, mesmo sem promessa por perto.
*/
const P = "(?<![\\p{L}])";
const F = "(?![\\p{L}])";
const palavra = (...radicais) => new RegExp(`${P}(?:${radicais.join("|")})${F}`, "iu");

const PROMESSA = palavra(
  "envi[\\p{L}]*", "sincroniz[\\p{L}]*", "transmit[\\p{L}]*", "transmiss[\\p{L}]*",
  "drena[\\p{L}]*", "entreg[\\p{L}]*", "subm[\\p{L}]*",
  "sobe", "sobem", "sub(?:ir|irá|irão|iu|indo|ida)",
  "sai", "saem", "sair", "sairá", "sairão", "saiu", "saindo",
  "cheg[\\p{L}]*", "termin[\\p{L}]*", "conclu(?:i|em|ir|irá|irão|ído|ida)",
  "segu(?:e|em|ir|irá|irão|iu|indo)", "prossegu[\\p{L}]*", "continu(?:a|am|ar|ará|arão|ou|ando)(?!\\s+(?:guardad|valendo|salv))",
  "rod(?:a|am|ar|ará|arão)", "funcion(?:a|am|ar|ará|arão)", "acontec[\\p{L}]*", "ocorr(?:e|em|er|erá|erão)",
  "tent(?:a|am|ar|ará|arão|ando|ou)", "receb(?:e|em|er|erá|erão|ida|ido|idas|idos)",
  "mand(?:a|am|ar|ada|ado|adas|ados|ará|arão)",
);

const AUTONOMIA = new RegExp([
  /* "Não resolve sozinho" nega a autonomia: é o aviso verdadeiro. */
  `${P}(?<!não [\\p{L}]+ )sozinh[oa]s?${F}`,
  `${P}automátic[oa]s?${F}`,
  `${P}automaticamente${F}`,
  `${P}em instantes${F}`,
  `${P}em breve${F}`,
  `${P}daqui a pouco${F}`,
  `${P}logo mais${F}`,
  `${P}a qualquer (?:momento|hora)${F}`,
  `${P}quando (?:houver|tiver|voltar) (?:o |a )?(?:sinal|rede|conexão|internet)${F}`,
  `${P}quando (?:o|a) (?:sinal|rede|conexão|internet) (?:voltar|houver|estiver)${F}`,
  `${P}não precisa(?:m)? (?:fazer|abrir|ficar|mexer|tocar|esperar)${F}`,
  `${P}sem (?:você |a gente )?(?:precisar|tocar|abrir|mexer|fazer|ligar|olhar|usar)${F}`,
  `${P}mesmo sem (?:você |a gente )?(?:abrir|tocar|mexer|usar|olhar|o app|o aplicativo)${F}`,
  `${P}continu(?:a|am|ar|ará|arão) (?:tentando|enviando|subindo|sincronizando|a tentar|a enviar|a subir)${F}`,
].join("|"), "iu");

const OBJETO = "(?:aplicativo|app|programa|aparelho|celular|telefone|smartphone|dispositivo)";
const OBJETO_OU_TELA = "(?:aplicativo|app|programa|aparelho|celular|telefone|smartphone|dispositivo|tela)";
const ARTIGO = "(?:(?:o|a|os|as|este|esta|esse|essa|seu|sua|do|da|no|na|neste|nesta|desse|dessa|um|uma)\\s+){0,2}";

const AFASTAMENTO = new RegExp([
  `${P}fech[\\p{L}]*\\s+${ARTIGO}${OBJETO}${F}`,
  `${P}minimiz[\\p{L}]*${F}`,
  `${P}(?:bloque[\\p{L}]*|trav(?:e|ar|ando))\\s+${ARTIGO}(?:${OBJETO_OU_TELA})${F}`,
  `${P}deslig[\\p{L}]*\\s+${ARTIGO}(?:${OBJETO_OU_TELA})${F}`,
  `${P}guard(?!ad)[\\p{L}]*\\s+${ARTIGO}${OBJETO}${F}`,
  `${P}(?:larg|abandon|deix)[\\p{L}]*\\s+${ARTIGO}${OBJETO}${F}`,
  `${P}sai(?:a|r|u|ndo)?\\s+(?:d[oa]s?|n[oa]s?)\\s+(?:aplicativo|app|programa)${F}`,
  `${P}troc[\\p{L}]*\\s+de\\s+(?:aplicativo|app|programa)${F}`,
  `${P}(?:abr|us)[\\p{L}]*\\s+outro\\s+(?:aplicativo|app|programa)${F}`,
  `${P}${OBJETO}\\s+(?:[\\p{L}]+\\s+){0,2}(?:fechad[oa]|bloquead[oa]|minimizad[oa]|desligad[oa]|travad[oa]|guardad[oa])${F}`,
  `${P}no bolso${F}`,
  `${P}(?:ir|voltar|vá|vão|vai)\\s+(?:embora|para casa|pra casa)${F}`,
].join("|"), "iu");

/** O que, imediatamente antes do afastamento, o transforma em aviso verdadeiro. */
const NEGADO = /(?:^|[\s,;:(])(?:não|nunca|jamais|nem|evite|evitar|antes de|sem|espere|aguarde)\s+(?:[\p{L}]+\s+){0,2}$/iu;
/** O que, logo depois do afastamento, o adia para depois do envio: também é o aviso verdadeiro. */
const ADIADO = /^[\s,]*(?:(?:só|somente|apenas)\s+(?:depois|quando|após|se)|depois que|após|até)(?![\p{L}])/iu;
/** O que, imediatamente antes do afastamento, o transforma em convite. */
const CONVITE = /(?:^|[\s,;:(])(?:pode|podem|poderá|poderão|basta|é só|já pode|pode até)\s+(?:[\p{L}]+\s+){0,3}$/iu;

/** Só "aberto" que não vem negado: "sem o aplicativo aberto" não é condição. */
function temCondicao(texto) {
  const semNegadas = texto.replace(
    /(?<![\p{L}])(?:sem|nem|não|nao)\s+(?:[\p{L}]+\s+){0,3}abert[oa]s?(?![\p{L}])/giu,
    " ",
  );
  return /(?<![\p{L}])abert[oa]s?(?![\p{L}])/iu.test(semNegadas);
}

/**
 * Lê um texto e separa o que a regra precisa: os afastamentos que valem (sem os
 * negados, como "não feche", e sem os adiados, como "feche só depois que o envio
 * terminar"), cada um dito como convite ou não, e se há PROMESSA no que sobra
 * depois de tirar os próprios afastamentos (senão "sair do aplicativo" seria,
 * sozinho, o verbo de envio "sair").
 *
 * "Aberto" NÃO redime o afastamento: "com o aplicativo aberto, pode bloquear a
 * tela" continua falso, porque o aplicativo de campo não envia com a tela
 * bloqueada nem com ele fora da frente.
 */
function lerTexto(texto) {
  const afastamentos = [];
  for (const m of texto.matchAll(new RegExp(AFASTAMENTO.source, "giu"))) {
    const antes = texto.slice(Math.max(0, m.index - 40), m.index);
    const depois = texto.slice(m.index + m[0].length, m.index + m[0].length + 30);
    if (NEGADO.test(antes) || ADIADO.test(depois)) continue;
    afastamentos.push({ trecho: m[0], convite: CONVITE.test(antes) });
  }
  const semAfastamento = texto.replace(new RegExp(AFASTAMENTO.source, "giu"), " ");
  return { afastamentos, promessa: PROMESSA.test(semAfastamento), semAfastamento };
}

/**
 * Os textos que o agente lê: cada texto literal entre aspas (com os pedaços
 * emendados por `+` juntados em um só) e cada texto solto dentro do JSX.
 *
 * As aspas são pareadas LINHA A LINHA, e isso é deliberado: uma aspa simples
 * perdida em texto de JSX ("d'água") pareada pelo arquivo inteiro desencaixava
 * todos os textos dali até o fim do arquivo, e o portão deixava de enxergá-los
 * sem avisar (medido na fila real: o texto de "ainda não saiu do aparelho" ficava
 * fora de qualquer par). Texto entre aspas simples ou duplas não atravessa
 * linha na linguagem; só o de crase atravessa. Uma aspa sem par na linha é
 * ignorada, e o estrago fica naquela linha.
 */
function textosDaTela(fonte) {
  const limpo = semComentarios(fonte);
  const literais = [];
  let i = 0;
  while (i < limpo.length) {
    const c = limpo[i];
    if (c === '"' || c === "'" || c === "`") {
      let j = i + 1;
      let fechou = false;
      while (j < limpo.length) {
        const d = limpo[j];
        if (d === "\\") { j += 2; continue; }
        if (d === c) { fechou = true; break; }
        if (d === "\n" && c !== "`") break;
        j += 1;
      }
      if (fechou) {
        literais.push({ conteudo: limpo.slice(i + 1, j), ini: i, fim: j + 1 });
        i = j + 1;
        continue;
      }
    }
    i += 1;
  }
  /* Pedaços emendados por `+` viram um texto só: é uma frase para quem lê. */
  const juntos = [];
  for (const l of literais) {
    const ultimo = juntos[juntos.length - 1];
    if (ultimo && /^\s*\+\s*$/.test(limpo.slice(ultimo.fim, l.ini))) {
      ultimo.conteudo += l.conteudo;
      ultimo.fim = l.fim;
    } else {
      juntos.push({ ...l });
    }
  }
  const textos = juntos.map((l) => ({ conteudo: l.conteudo, ini: l.ini }));
  for (const m of limpo.matchAll(/>([^<>{}]{4,400}?)</g)) {
    textos.push({ conteudo: m[1] ?? "", ini: m.index });
  }
  return textos
    .map((t) => ({
      conteudo: t.conteudo.replace(/\\(["'`])/g, "$1").replace(/\s+/g, " ").trim(),
      indice: t.ini,
      linha: limpo.slice(0, t.ini).split("\n").length,
    }))
    .filter((t) => t.conteudo.length >= 4);
}

/** Cada texto quebrado em frases, com a linha de onde veio. */
function frasesVisiveis(fonte) {
  const frases = [];
  for (const { conteudo, indice, linha } of textosDaTela(fonte)) {
    for (const frase of conteudo.split(/(?<=[.!?])\s+/)) {
      if (frase.trim()) frases.push({ frase: frase.trim(), linha, indice });
    }
  }
  return frases;
}

/** Cada trecho de texto (sem comentário) que casa com alguma regra. */
export function promessasEm(fonte) {
  const { texto, linhas } = textoEmendado(fonte);
  const achados = [];
  const frases = frasesVisiveis(fonte);
  for (const { frase, linha } of frases) {
    const { afastamentos, promessa } = lerTexto(frase);
    if (afastamentos.length > 0 && (promessa || afastamentos.some((a) => a.convite))) {
      achados.push({
        linha,
        nome: promessa
          ? "envio junto de largar o aplicativo"
          : "convite a largar o aplicativo",
        texto: frase.slice(0, 120),
      });
    } else if (promessa && AUTONOMIA.test(frase) && !temCondicao(frase)) {
      achados.push({
        linha,
        nome: "envio com autonomia, sem a condição do aplicativo aberto",
        texto: frase.slice(0, 120),
      });
    }
  }
  /*
    O trecho inteiro (as frases do mesmo texto da tela): pega a promessa dita
    em duas frases, "Pode fechar o aplicativo. O envio termina.". Só o par
    PROMESSA com AFASTAMENTO sobe de nível aqui; AUTONOMIA fica na frase, porque
    em trecho longo ela casa com assuntos vizinhos e reprovaria quem não errou.
  */
  const trechos = new Map();
  for (const { frase, linha, indice } of frases) {
    const antes = trechos.get(indice) ?? { linha, lista: [] };
    antes.lista.push(frase);
    trechos.set(indice, antes);
  }
  for (const { linha, lista } of trechos.values()) {
    if (lista.length < 2) continue;
    const todo = lista.join(" ");
    const { afastamentos, promessa } = lerTexto(todo);
    if (afastamentos.length === 0 || !promessa) continue;
    achados.push({
      linha,
      nome: "envio junto de largar o aplicativo, em frases seguidas",
      texto: todo.slice(0, 120),
    });
  }
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

/*
  Correção 2 (V2-F00-E16). As quatro frases que a validação da rodada 2 plantou
  na fila zerada de `fila.tsx`. A rodada achou que o portão reprovava só a
  primeira (o controle) e deixava passar as outras três.
*/
const PLANTADAS_PELA_VALIDACAO = [
  "Vai sair assim que houver sinal.",
  "Mesmo sem abrir o app, a coleta sobe.",
  "O envio roda no background.",
  "O envio segue mesmo se você fechar o aplicativo.",
];

test("o portão morde: as quatro frases plantadas pela validação da rodada 2 são reprovadas", () => {
  for (const frase of PLANTADAS_PELA_VALIDACAO) {
    assert.ok(promessasEm(`descricao={"${frase}"}`).length >= 1, `deixou passar: ${frase}`);
    assert.ok(promessasEm(`<Txt>${frase}</Txt>`).length >= 1, `deixou passar no JSX: ${frase}`);
  }
});

test("o portão morde frases que ninguém listou, porque a regra é por classe e não por lista", () => {
  /*
    Nenhuma destas está na lista de expressões: o que as pega é falarem de
    envio e de autonomia ou de momento sem a condição "aberto". Quem escrever a
    próxima variação cai na mesma regra, e a saída é dizer a condição.
  */
  const novas = [
    "A coleta vai sair quando o sinal voltar.",
    "Quando houver rede a vistoria sobe.",
    "O envio continua tentando, não precisa fazer nada.",
    "Sua coleta é enviada automaticamente.",
    "Pode fechar o aplicativo que a coleta segue para a coordenação.",
    "A vistoria sobe sem você abrir nada.",
    "Seguimos enviando em segundo-plano.",
    "A sincronização acontece a qualquer momento.",
  ];
  for (const frase of novas) {
    assert.ok(promessasEm(`"${frase}"`).length >= 1, `deixou passar: ${frase}`);
  }
});

/*
  As promessas que o revisor plantou na correção 2 e que a primeira versão da
  regra por frase deixou passar (10 de 11), mais variações do mesmo tipo. Todas
  juntam um jeito de largar o aplicativo ou o aparelho (fechar, sair, minimizar,
  bloquear, guardar, desligar, trocar de aplicativo, ir embora) com uma promessa
  de envio ou de continuidade, e nenhuma está em lista de expressões.
*/
export const LARGAR_E_PROMETER = [
  "Feche o aplicativo: o envio termina.",
  "Pode sair do aplicativo: a coleta será enviada.",
  "Pode minimizar o aplicativo, a coleta segue",
  "Pode bloquear a tela, a coleta continua subindo.",
  "Guarde o celular no bolso: a vistoria sobe.",
  "Pode desligar o aparelho que o envio termina depois.",
  "Você pode trocar de aplicativo, o envio continua.",
  "Se fechar o aplicativo, a coleta chega à coordenação.",
  "Feche o app e a vistoria é enviada.",
  "Fechando o aplicativo, a sincronização se completa.",
  "Bloqueie a tela do celular: a coleta será entregue à coordenação.",
  "Pode ir embora, a coleta sobe.",
  "Pode abrir outro aplicativo, a coleta continua enviando.",
  "Depois de fechar o aplicativo, o envio é concluído.",
  "Pode deixar o celular de lado: o envio segue.",
  "Deixe o app quieto, a coleta termina de subir.",
  "Pode usar outro aplicativo que a coleta segue.",
  "Bloqueando o aparelho, a coleta continua.",
  "Minimizou o app? A coleta chega do mesmo jeito.",
  "Mesmo com o aplicativo aberto, pode bloquear a tela: o envio continua.",
];

test("o portão morde: largar o aplicativo junto de uma promessa de envio, em qualquer flexão", () => {
  for (const frase of LARGAR_E_PROMETER) {
    assert.ok(promessasEm(`"${frase}"`).length >= 1, `deixou passar: ${frase}`);
    assert.ok(promessasEm(`<Txt>${frase}</Txt>`).length >= 1, `deixou passar no JSX: ${frase}`);
    assert.ok(promessasEm(`descricao={"${frase}"}`).length >= 1, `deixou passar no atributo: ${frase}`);
  }
});

test("o portão morde a promessa dita em duas frases seguidas e o convite a sair", () => {
  const duasFrases = [
    "Pode fechar o aplicativo. O envio termina.",
    "Bloqueie a tela. A coleta continua sendo enviada.",
    "Guarde o celular. A vistoria chega sozinha.",
  ];
  for (const texto of duasFrases) {
    assert.ok(promessasEm(`"${texto}"`).length >= 1, `deixou passar: ${texto}`);
  }
  /* O convite, sem nenhuma promessa por perto, também reprova. */
  for (const convite of ["Pode fechar o aplicativo.", "Basta bloquear a tela.", "Você já pode sair do aplicativo."]) {
    assert.ok(promessasEm(`"${convite}"`).length >= 1, `deixou passar: ${convite}`);
  }
});

test("a promessa de retomada sem a condição também reprova (a forma antiga da fila)", () => {
  /* "Vai tentar de novo em instantes" prometia nova tentativa sem dizer que o aplicativo precisa estar aberto. */
  for (const frase of [
    "Já tentou 3x. Vai tentar de novo em instantes.",
    "Já tentou 3x. Vai tentar de novo em breve.",
    "O aplicativo tenta de novo daqui a pouco.",
  ]) {
    assert.ok(promessasEm(`"${frase}"`).length >= 1, `deixou passar: ${frase}`);
  }
});

test("a mesma frase com a condição 'aberto' passa", () => {
  const verdadeiras = [
    "A coleta vai sair quando o aplicativo estiver aberto e o sinal voltar.",
    "Já tentou 8x e vai continuar tentando enquanto o aplicativo estiver aberto.",
    "O envio foi pedido de novo. Se houver sinal, ela sai agora; se não, ela volta para a espera e continua tentando enquanto o aplicativo estiver aberto.",
    "Com o aplicativo aberto e com sinal, a vistoria sobe quando houver rede.",
    "Já tentou 3x. Vai tentar de novo em instantes, enquanto o aplicativo estiver aberto.",
  ];
  for (const frase of verdadeiras) assert.deepEqual(promessasEm(`"${frase}"`), [], frase);
});

test("'aberto' negado não é condição: 'sem o aplicativo aberto' é a promessa que se quer impedir", () => {
  for (const frase of [
    "A coleta sobe sozinha, mesmo sem o aplicativo aberto.",
    "O envio acontece automaticamente, sem o app aberto.",
  ]) {
    assert.ok(promessasEm(`"${frase}"`).length >= 1, `deixou passar: ${frase}`);
  }
});

test("os avisos verdadeiros sobre largar o aplicativo passam", () => {
  /* Negado, precavido ou adiado: é a instrução honesta, e o portão não pode puni-la. */
  const verdadeiras = [
    "Não feche o aplicativo enquanto a coleta estiver sendo enviada.",
    "Antes de fechar o aplicativo, confira se a coleta foi enviada.",
    "Sem fechar o aplicativo, espere o envio terminar.",
    "Feche o aplicativo só depois que o envio terminar.",
    "Não bloqueie a tela até a coleta ser enviada.",
    "Evite guardar o celular antes de o envio terminar.",
    "Para sair do aplicativo, toque em Perfil.",
  ];
  for (const frase of verdadeiras) assert.deepEqual(promessasEm(`"${frase}"`), [], frase);
});

test("frases do aplicativo de hoje que falam de continuar, de sair e de 'sozinho' sem prometer envio passam", () => {
  /* Falsos positivos medidos ao apertar a regra: continuam passando. */
  const inofensivas = [
    "A vistoria que você já fez continua guardada e vai ser enviada do mesmo jeito.",
    "Repetir o envio não resolve sozinho: cada cartão abaixo diz o que aconteceu e o que fazer.",
    "Faça na base, antes de sair, e depois a sua equipe aparece aqui mesmo sem conexão.",
    "A escolha vale só neste aparelho e continua valendo depois de sair da conta.",
    "Sair agora não apaga nada: quando você voltar, ela continua de onde parou.",
    "Ele fica legível na tela bloqueada, na mão de quem está passando.",
    "Guardada neste aparelho. Sobe depois que você entrar de novo.",
    "Você pode fechar esta tela e continuar de onde parou.",
    "Ainda não saiu do aparelho. Vai sair quando o aplicativo estiver aberto e houver sinal.",
  ];
  for (const frase of inofensivas) assert.deepEqual(promessasEm(`"${frase}"`), [], frase);
});

test("a fila REAL reprova quando se planta cada frase (em memória, o arquivo não é tocado)", () => {
  const fonte = readFileSync(new URL("../apps/campo/src/app/(agente)/fila.tsx", import.meta.url), "utf8");
  assert.deepEqual(promessasEm(fonte), [], "a fila de hoje precisa estar limpa para o plantio valer");
  const ponto = "Ainda não saiu do aparelho. Vai sair quando o aplicativo estiver aberto e houver sinal.";
  assert.ok(fonte.includes(ponto), "o ponto de plantio sumiu da fila; escolha outro texto");
  for (const frase of [...PLANTADAS_PELA_VALIDACAO, ...LARGAR_E_PROMETER]) {
    const plantada = fonte.replace(ponto, `${ponto} ${frase}`);
    assert.notEqual(plantada, fonte);
    assert.ok(promessasEm(plantada).length >= 1, `a fila com a frase plantada passou: ${frase}`);
  }
});

test("a fila REAL reprova a forma antiga de 'vai tentar de novo em instantes', sem a condição", () => {
  const fonte = readFileSync(new URL("../apps/campo/src/app/(agente)/fila.tsx", import.meta.url), "utf8");
  const atual = "`Já tentou ${item.tentativas}x. Vai tentar de novo em instantes, enquanto `\n"
    + "              + \"o aplicativo estiver aberto.\"";
  assert.ok(fonte.includes(atual), "a frase de tentativas mudou na fila; atualize o ponto de plantio");
  const antiga = fonte.replace(atual, "`Já tentou ${item.tentativas}x. Vai tentar de novo em instantes.`");
  assert.notEqual(antiga, fonte);
  const achados = promessasEm(antiga);
  assert.ok(achados.length >= 1, "a forma antiga passou pelo portão");
  assert.ok(achados.some((a) => /instantes/.test(a.texto)), "o portão apontou outra frase, e não a antiga");
});
