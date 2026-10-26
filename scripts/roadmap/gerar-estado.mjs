#!/usr/bin/env node
/**
 * Gera `docs/roadmap-v2/ESTADO-ATUAL.md`, o resumo de uma tela de onde a V2
 * está, e confere que ele não mente.
 *
 * Por que existe (28-execucao-e-validacao.md, seções 3 e 6). A política manda
 * toda sessão começar pelo estado gerado, e não pela conversa. Para o estado
 * gerado valer alguma coisa ele precisa de duas propriedades:
 *
 * 1. DERIVA SÓ DE ARQUIVOS. STATUS.md, os arquivos de fase, `GATE.md`,
 *    `VEREDITO.md` e `RISCO-ACEITO.md`. Nunca do HEAD, da hora nem do ramo. A
 *    razão é prática: um arquivo que carrega o SHA do commit nunca bate
 *    depois que ele mesmo é commitado (o commit muda o SHA), e um arquivo que
 *    carrega a data muda todo dia. Sem isso o `--conferir` do commit de
 *    registro seria impossível. Por isso aqui não há data, hash do HEAD nem
 *    nome do ramo, e o `--conferir` pode rodar em qualquer commit.
 *
 * 2. SE MENTE, O `--conferir` FALHA. Ele regera em memória e reprova se o
 *    arquivo do disco difere, se o STATUS cita um commit que não existe, se
 *    uma etapa diz VALIDADA ou CONCLUÍDA sem `VEREDITO.md` com PASS, ou se uma
 *    etapa IMPLEMENTADA não cita o commit candidato. É o que impede o status
 *    inflado (princípio 7 da política: "relatório é visão do estado, nunca com
 *    status mais forte que o registrado").
 *
 * Limite deliberado: no máximo 60 linhas. Um estado que não cabe numa tela
 * deixa de ser lido, e quem não lê reconstrói pela conversa.
 *
 * Uso:
 *   node scripts/roadmap/gerar-estado.mjs              gera e grava o arquivo
 *   node scripts/roadmap/gerar-estado.mjs --conferir   confere sem gravar
 *   node scripts/roadmap/gerar-estado.mjs --stdout     imprime sem gravar
 *   node scripts/roadmap/gerar-estado.mjs --saida=CAMINHO
 */
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { calcularTravas } from "./contexto.mjs";
import {
  GATE_APROVADO,
  RAIZ,
  STATUS_DE_ETAPA,
  cabecalhoDaFase,
  caminhos,
  checkpointsDaEtapa,
  commitExiste as commitExisteNoGit,
  etapaDoStatus,
  fasesEmOrdem,
  gateAnterior,
  gateDaFase,
  hashesCitados,
  hashesDaObservacao,
  lerArquivo,
  lerStatus,
  localizarEtapa,
  normalizar,
  riscoAceitoVigente,
  temPendenciaHumana,
  varrerEvidencias,
} from "./roadmap.mjs";

export const MAX_LINHAS = 60;
export const COMANDO_DE_GERACAO = "node scripts/roadmap/gerar-estado.mjs";

/** Status que dizem "validei": só valem com VEREDITO.md PASS na pasta da etapa. */
export const STATUS_QUE_EXIGEM_VEREDITO = new Set([
  "VALIDADA",
  "VALIDADA COM PENDÊNCIA HUMANA",
  "CONCLUÍDA",
  "CONCLUÍDA COM RISCO ACEITO",
]);

/** A etapa que alguém ainda pode pegar para trabalhar. BLOQUEADA e CANCELADA não. */
const STATUS_ACIONAVEL = new Set(["PENDENTE", "EM ANDAMENTO", "REPROVADA"]);

/* ---------- Texto ---------- */

/** O repositório não usa travessão em texto algum (regra de conteúdo); o que vem do STATUS passa por aqui. */
function semTravessao(texto) {
  return texto.replaceAll("\u2014", ",");
}

function cortar(texto, maximo) {
  const t = semTravessao(texto).replace(/\s+/g, " ").trim();
  return t.length > maximo ? `${t.slice(0, maximo - 3).trimEnd()}...` : t;
}

/** Junta itens em linhas de no máximo `largura` caracteres, com prefixo. */
function quebrar(itens, { largura = 100, prefixo = "  " } = {}) {
  const linhas = [];
  let atual = "";
  for (const item of itens) {
    const candidato = atual === "" ? item : `${atual}, ${item}`;
    if (atual !== "" && prefixo.length + candidato.length > largura) {
      linhas.push(`${prefixo}${atual},`);
      atual = item;
    } else {
      atual = candidato;
    }
  }
  if (atual !== "") linhas.push(`${prefixo}${atual}`);
  return linhas;
}

/** Limita uma lista de linhas e diz quantas ficaram de fora. */
function limitar(linhas, maximo) {
  if (linhas.length <= maximo) return linhas;
  return [...linhas.slice(0, maximo - 1), `  ... e mais ${linhas.length - (maximo - 1)} (ver STATUS.md)`];
}

/* ---------- Geração ---------- */

/** Fase atual: a primeira, na ordem de execução, cujo gate não está APROVADO (nem APROVADO COM RISCO ACEITO). REABERTO conta como não aprovado. */
export function faseAtual(status) {
  const ordem = fasesEmOrdem(status);
  for (const o of ordem) {
    const gate = gateDaFase(status, o.fase);
    if (!GATE_APROVADO.has(gate?.status)) return { ...o, gate: gate?.gate ?? o.gate, statusDoGate: gate?.status ?? "DESCONHECIDO" };
  }
  return null;
}

/** CPs ABERTOS ou PARCIAIS que a fase cita: os do cabeçalho dela e os que travam alguma etapa (campo Checkpoint fora do "Não", e dependências). */
function checkpointsAbertosDaFase(status, fase, raiz) {
  const citados = new Map();
  const registrar = (cp, quem) => {
    if (!citados.has(cp)) citados.set(cp, new Set());
    citados.get(cp).add(quem);
  };
  const cabecalho = cabecalhoDaFase(fase, raiz);
  for (const cp of cabecalho?.checkpointsDaFase ?? []) registrar(cp, "cabeçalho da fase");
  for (const e of status.etapas.filter((x) => x.fase === fase)) {
    const bloco = localizarEtapa(e.id, raiz);
    if (!bloco) continue;
    for (const cp of checkpointsDaEtapa(bloco).travam) registrar(cp, e.id.replace(/^V2-/, ""));
  }
  return [...citados.entries()]
    .map(([cp, quem]) => ({ cp: status.checkpoints.find((c) => c.id === cp), quem: [...quem] }))
    .filter((x) => x.cp && (x.cp.status === "ABERTO" || x.cp.status === "PARCIAL"))
    .sort((a, b) => a.cp.id.localeCompare(b.cp.id));
}

/** Primeira etapa acionável na ordem da tabela, e a primeira sem pendência humana registrada. */
export function proximasEtapas(etapasDaFase) {
  const acionaveis = etapasDaFase.filter((e) => STATUS_ACIONAVEL.has(e.status));
  const primeira = acionaveis[0] ?? null;
  const semPendencia = acionaveis.find((e) => !temPendenciaHumana(e)) ?? null;
  return { primeira, semPendencia };
}

export function gerarEstado(raiz = RAIZ) {
  const status = lerStatus(lerArquivo(caminhos(raiz).status));
  const evidencias = varrerEvidencias(raiz);
  const ordem = fasesEmOrdem(status);
  const atual = faseAtual(status);
  const L = [];

  L.push("# ESTADO ATUAL DA V2");
  L.push("");
  L.push(`> GERADO por \`${COMANDO_DE_GERACAO}\`. NÃO edite à mão: a próxima geração apaga a edição.`);
  L.push(`> Conferir: \`${COMANDO_DE_GERACAO} --conferir\` (falha se este arquivo difere do repositório).`);
  L.push("> Fontes: STATUS.md, arquivos de fase, GATE.md, VEREDITO.md e RISCO-ACEITO.md. Não usa HEAD, hora nem ramo.");
  L.push("> Se algo divergir da conversa ou de uma nota, vale o repositório (28, seção 3).");
  L.push("");

  if (!atual) {
    L.push("## Fase atual");
    L.push("- Todas as fases têm o gate aprovado. Não há fase atual.");
  } else {
    const gate = gateDaFase(status, atual.fase);
    const posicao = `${atual.ordem} de ${ordem.length}`;
    const aprovados = ordem.filter((o) => GATE_APROVADO.has(gateDaFase(status, o.fase)?.status));
    const ultimoAprovado = aprovados.length > 0 ? aprovados[aprovados.length - 1] : null;
    const anterior = gateAnterior(status, atual.fase);
    const gateMd = evidencias.gates.get(atual.gate)?.gateMd;

    L.push("## Fase atual");
    L.push(`- ${atual.fase} ${cortar(atual.nome, 70)} (ordem ${posicao}), gate ${atual.gate} ${cortar(gate?.nomeDoGate ?? "", 50)}: ${atual.statusDoGate}`);
    L.push(`- Último gate aprovado: ${ultimoAprovado ? `${ultimoAprovado.gate} (${ultimoAprovado.fase})` : "nenhum"}`);
    L.push(`- Gate anterior na ordem: ${anterior ? `${anterior.gate} ${anterior.status}` : "nenhum (primeira fase)"}`);
    L.push(`- GATE.md do ${atual.gate} em docs/evidencias-v2/${atual.gate}/: ${gateMd ? "presente" : "ausente"}`);
    L.push("");

    const etapas = status.etapas.filter((e) => e.fase === atual.fase);
    const contagem = new Map();
    for (const e of etapas) contagem.set(e.status, (contagem.get(e.status) ?? 0) + 1);
    const ordemDeStatus = [...STATUS_DE_ETAPA, ...[...contagem.keys()].filter((s) => !STATUS_DE_ETAPA.includes(s))];
    const resumo = ordemDeStatus.filter((s) => contagem.has(s)).map((s) => `${s} ${contagem.get(s)}`);
    const { primeira, semPendencia } = proximasEtapas(etapas);

    L.push(`## Etapas da ${atual.fase} (${etapas.length})`);
    L.push(`- ${resumo.join(", ")}`);
    const descrever = (e) => {
      const bloco = localizarEtapa(e.id, raiz);
      const { travas } = bloco
        ? calcularTravas({ status, etapaDoStatus: e, bloco, gateAnteriorDaFase: anterior, gateDaFaseAtual: gate })
        : { travas: [] };
      const sufixo = travas.length > 0 ? ` | trava: ${travas.map((t) => cortar(t.descricao, 60)).join("; ")}` : "";
      return `${e.id} (${e.status}) ${cortar(e.titulo, 60)}${sufixo}`;
    };
    L.push(`- Próxima etapa acionável na ordem da tabela: ${primeira ? descrever(primeira) : "nenhuma"}`);
    if (semPendencia && semPendencia !== primeira) {
      L.push(`- Primeira sem pendência humana registrada: ${descrever(semPendencia)}`);
    }
    L.push("");

    const proxima = ordem[ordem.findIndex((o) => o.fase === atual.fase) + 1] ?? null;
    L.push("## Checkpoints ABERTOS ou PARCIAIS citados (fase atual e próxima)");
    const linhasDeCp = [];
    for (const o of [atual, proxima].filter(Boolean)) {
      for (const { cp, quem } of checkpointsAbertosDaFase(status, o.fase, raiz)) {
        linhasDeCp.push(`- ${cp.id} ${cp.status}: ${cortar(cp.assunto, 55)} (${o.fase}: ${cortar(quem.slice(0, 3).join(", "), 30)}${quem.length > 3 ? ", ..." : ""})`);
      }
    }
    L.push(...(linhasDeCp.length > 0 ? limitar(linhasDeCp, 8) : ["- nenhum"]));
    L.push("");
  }

  const comPendencia = status.etapas.filter(temPendenciaHumana);
  L.push(`## Etapas com pendência humana (${comPendencia.length})`);
  if (comPendencia.length === 0) L.push("- nenhuma");
  else {
    L.push("- Observação com \"falta\" em etapa EM ANDAMENTO ou IMPLEMENTADA, ou status VALIDADA COM PENDÊNCIA HUMANA:");
    L.push(...limitar(quebrar(comPendencia.map((e) => e.id.replace(/^V2-/, ""))), 4));
  }
  L.push("");

  const riscos = [...evidencias.etapas.entries()].filter(([, v]) => riscoAceitoVigente(v.riscoAceito));
  L.push(`## Riscos aceitos vigentes (${riscos.length})`);
  if (riscos.length === 0) L.push("- nenhum RISCO-ACEITO.md em docs/evidencias-v2/");
  else {
    const linhas = riscos.map(([id, v]) => `- ${id}: ${cortar(v.riscoAceito.criterio || "critério não lido", 60)}; validade: ${cortar(v.riscoAceito.validade || "não lida", 30)}`);
    L.push(...limitar(linhas, 5));
    L.push("- A validade não é calculada aqui (depende da data, que este arquivo não usa): confira nos arquivos.");
  }
  L.push("");

  const reabertos = status.gates.filter((g) => g.status === "REABERTO");
  L.push(`## Gates REABERTOS (${reabertos.length})`);
  if (reabertos.length === 0) L.push("- nenhum");
  for (const g of limitar(reabertos.map((g) => g), 4)) {
    if (typeof g === "string") {
      L.push(g);
      continue;
    }
    const motivo = (evidencias.gates.get(g.gate)?.gateMd ?? "").split("\n").filter((l) => /REABERTO/.test(l)).pop();
    L.push(`- ${g.gate} (${g.fase}): ${motivo ? cortar(motivo.replace(/^[-*\s]+/, ""), 90) : "motivo no GATE.md (não encontrado)"}`);
  }
  L.push("");

  L.push("## Não iniciar");
  if (!atual) L.push("- nenhuma fase pendente");
  else {
    const depois = ordem.filter((o) => o.ordem > atual.ordem).map((o) => o.fase);
    L.push(`- Fases depois da ${atual.fase} na ordem de execução (${depois.length}), enquanto o gate ${atual.gate} não estiver APROVADO:`);
    L.push(...limitar(quebrar(depois, { largura: 100 }), 3));
  }

  const texto = `${L.join("\n")}\n`;
  const total = texto.split("\n").length - 1;
  if (total > MAX_LINHAS) {
    throw new Error(`O estado gerado tem ${total} linhas, acima do limite de ${MAX_LINHAS}. Corrija os cortes de gerar-estado.mjs.`);
  }
  return texto;
}

/* ---------- Conferência ---------- */

/**
 * Regera em memória e acusa tudo que o estado ou o STATUS afirmam sem prova.
 * Cada problema é `{ codigo, mensagem }`; a lista vazia é o OK.
 *
 * `commitExiste` e `arquivoEstado` existem para os testes: a fixture não é um
 * repositório git, e o teste do repositório real compara com um arquivo
 * temporário em vez de com o que está commitado.
 */
export function conferir({ raiz = RAIZ, arquivoEstado = caminhos(raiz).estado, commitExiste = (h) => commitExisteNoGit(h, raiz) } = {}) {
  const problemas = [];
  const textoDoStatus = lerArquivo(caminhos(raiz).status);
  const status = lerStatus(textoDoStatus);
  const evidencias = varrerEvidencias(raiz);

  // (a) O arquivo do disco é o que o gerador produz agora?
  let esperado = "";
  try {
    esperado = gerarEstado(raiz);
  } catch (erro) {
    problemas.push({ codigo: "geracao", mensagem: `não consegui gerar o estado: ${erro.message}` });
  }
  if (!existsSync(arquivoEstado)) {
    problemas.push({ codigo: "difere", mensagem: `${arquivoEstado} não existe. Gere com: ${COMANDO_DE_GERACAO}` });
  } else if (esperado !== "" && normalizar(lerArquivo(arquivoEstado)) !== esperado) {
    problemas.push({ codigo: "difere", mensagem: `ESTADO-ATUAL.md difere do que o STATUS e as evidências produzem hoje. Regere com: ${COMANDO_DE_GERACAO}` });
  }

  // (b) Todo hash entre crases no STATUS existe como commit?
  const vistos = new Set();
  for (const { hash, linha } of hashesCitados(textoDoStatus)) {
    if (vistos.has(hash)) continue;
    vistos.add(hash);
    if (!commitExiste(hash)) {
      problemas.push({ codigo: "hash-inexistente", mensagem: `STATUS.md:${linha} cita o commit \`${hash}\`, que não existe no histórico do git` });
    }
  }

  const gateDaEtapa = (e) => gateDaFase(status, e.fase)?.gate ?? `G${e.fase.slice(1)}`;
  for (const e of status.etapas) {
    if (e.statusDesconhecido) {
      problemas.push({ codigo: "status-desconhecido", mensagem: `${e.id} tem status que a política não define: "${e.status}"` });
    }

    // (c) Status que diz "validei" sem VEREDITO.md com PASS.
    if (STATUS_QUE_EXIGEM_VEREDITO.has(e.status)) {
      const v = evidencias.etapas.get(e.id)?.veredito;
      if (!v) {
        problemas.push({ codigo: "sem-veredito", mensagem: `${e.id} está ${e.status}, mas não existe docs/evidencias-v2/${gateDaEtapa(e)}/${e.id}/VEREDITO.md` });
      } else if (v.veredito !== "PASS") {
        problemas.push({ codigo: "veredito-sem-pass", mensagem: `${e.id} está ${e.status}, mas o VEREDITO.md diz ${v.veredito ?? "nada legível"} e não PASS` });
      }
    }

    // ACEITA precisa do VEREDITO.md com a aceitação na rodada mais recente (H84, 28, seção 6).
    if (e.status === "ACEITA" && evidencias.etapas.get(e.id)?.veredito?.veredito !== "ACEITA") {
      problemas.push({ codigo: "sem-aceite", mensagem: `${e.id} está ACEITA, mas o VEREDITO.md em docs/evidencias-v2/${gateDaEtapa(e)}/${e.id}/ não registra ACEITA na rodada mais recente` });
    }

    // CONCLUÍDA COM RISCO ACEITO precisa do RISCO-ACEITO.md (28, seção 6).
    if (e.status === "CONCLUÍDA COM RISCO ACEITO" && !evidencias.etapas.get(e.id)?.riscoAceito) {
      problemas.push({ codigo: "sem-risco-aceito", mensagem: `${e.id} está CONCLUÍDA COM RISCO ACEITO, mas não existe RISCO-ACEITO.md na pasta dela` });
    }

    // (d) IMPLEMENTADA sem um SHA existente na observação.
    if (e.status === "IMPLEMENTADA") {
      const citados = hashesDaObservacao(e.observacao);
      if (!citados.some((h) => commitExiste(h))) {
        problemas.push({
          codigo: "implementada-sem-sha",
          mensagem: citados.length === 0
            ? `${e.id} está IMPLEMENTADA, mas a observação não cita o SHA do commit candidato`
            : `${e.id} está IMPLEMENTADA, mas nenhum SHA citado na observação (${citados.join(", ")}) existe no histórico`,
        });
      }
    }
  }

  // Gate APROVADO sem GATE.md: a aprovação é sempre de Rafael e fica escrita lá (28, seção 15).
  for (const g of status.gates) {
    if (g.statusDesconhecido) problemas.push({ codigo: "status-desconhecido", mensagem: `${g.gate} tem status que a política não define: "${g.status}"` });
    if (GATE_APROVADO.has(g.status) && !evidencias.gates.get(g.gate)?.gateMd) {
      problemas.push({ codigo: "gate-sem-gate-md", mensagem: `${g.gate} está ${g.status}, mas não existe docs/evidencias-v2/${g.gate}/GATE.md` });
    }
  }
  for (const c of status.checkpoints) {
    if (!["ABERTO", "PARCIAL", "DECIDIDO", "ADIADO"].includes(c.status)) {
      problemas.push({ codigo: "status-desconhecido", mensagem: `${c.id} tem status que a política não define: "${c.status}"` });
    }
  }

  return problemas;
}

/* ---------- CLI ---------- */

function principal(argv) {
  const args = argv.slice(2);
  const desconhecido = args.find((a) => !["--conferir", "--stdout"].includes(a) && !a.startsWith("--saida="));
  if (desconhecido) {
    console.error(`Argumento não reconhecido: ${desconhecido}\nUso: ${COMANDO_DE_GERACAO} [--conferir | --stdout | --saida=CAMINHO]`);
    return 2;
  }
  const saida = args.find((a) => a.startsWith("--saida="))?.slice("--saida=".length);
  const destino = saida ? resolve(saida) : caminhos(RAIZ).estado;

  if (args.includes("--conferir")) {
    const problemas = conferir({ arquivoEstado: destino });
    if (problemas.length === 0) {
      console.log("ESTADO-ATUAL.md confere: o arquivo bate com o repositório, os commits citados existem e nenhuma etapa afirma mais do que a evidência prova.");
      return 0;
    }
    console.error(`ESTADO-ATUAL.md NÃO confere (${problemas.length} problema(s)):`);
    for (const p of problemas) console.error(`  [${p.codigo}] ${p.mensagem}`);
    return 1;
  }

  const texto = gerarEstado(RAIZ);
  if (args.includes("--stdout")) {
    process.stdout.write(texto);
    return 0;
  }
  mkdirSync(dirname(destino), { recursive: true });
  writeFileSync(destino, texto, "utf8");
  console.log(`Estado gravado em ${destino} (${texto.split("\n").length - 1} linhas).`);
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = principal(process.argv);
}
