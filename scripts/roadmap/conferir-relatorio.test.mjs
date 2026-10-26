import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import { executarCli } from "./apoio-de-teste.mjs";
import { conferirRelatorio, decodificar, lerHtml, percorrer, termosFortesDemais, textoDe } from "./conferir-relatorio.mjs";

const AQUI = dirname(fileURLToPath(import.meta.url));
const PASTA = join(AQUI, "fixtures", "relatorio");
const BOM = readFileSync(join(PASTA, "bom.html"), "utf8");
const COLETA = JSON.parse(readFileSync(join(PASTA, "coleta.json"), "utf8"));

/** O travessão nunca é escrito literal neste arquivo: o próprio teste obedece a regra que testa. */
const TRAVESSAO = String.fromCharCode(0x2014);

/** Troca um trecho exato e falha alto se ele não existe: teste que não muda nada é mentira. */
function trocar(html, de, para) {
  assert.ok(html.includes(de), `o trecho "${de}" não existe na fixture`);
  return html.replace(de, para);
}

const codigos = (r) => r.problemas.map((p) => p.codigo);
const conferir = (html, dados = COLETA) => conferirRelatorio({ html, dados });
const com = (dados) => ({ ...COLETA, ...dados });

/* ---------- O relatório honesto passa ---------- */

test("o relatório honesto da fixture confere, sem nenhum problema", () => {
  const r = conferir(BOM);
  assert.deepEqual(r.problemas, []);
  assert.equal(r.resumo.tipo, "semanal");
  assert.equal(r.resumo.situacao, "ATENÇÃO");
  assert.equal(r.resumo.itensDeEtapa, 9);
});

/* ---------- Leitor de HTML ---------- */

test("leitor de HTML: atributos, entidades, comentários, script e elementos sem fechamento", () => {
  const raiz = lerHtml(
    `<!doctype html><!-- <b data-etapa="V2-F00-E01"> --><div data-secao="x" class='a b'><p>um &amp; dois &#233; &mdash;<p>três<br>quatro</div><script>var a = "<p>não é texto</p>";</script>`,
  );
  const nos = [];
  percorrer(raiz, (n) => nos.push(n));
  assert.equal(nos.some((n) => n.attrs["data-etapa"] !== undefined), false, "o conteúdo do comentário não é elemento");
  const div = nos.find((n) => n.tag === "div");
  assert.equal(div.attrs["data-secao"], "x");
  assert.equal(div.attrs.class, "a b");
  assert.equal(textoDe(div), `um & dois é ${TRAVESSAO} três quatro`);
  assert.equal(nos.filter((n) => n.tag === "p").length, 2, "o <p> sem fechamento fecha sozinho no <p> seguinte; o <p> do script é texto bruto");
  assert.equal(textoDe(raiz).includes("não é texto"), false, "script não é texto visível");
});

test("leitor de HTML: entidades numéricas e nomeadas", () => {
  assert.equal(decodificar("&lt;a&gt; &#65;&#x42; &nbsp;x &desconhecida;"), "<a> AB  x &desconhecida;");
});

/* ---------- Léxico: termo mais forte que o status ---------- */

test("léxico: cada termo forte reprova no status que não o sustenta", () => {
  const casos = [
    ["IMPLEMENTADA", "Implementado e entregue ao cliente."],
    ["IMPLEMENTADA", "A etapa está concluída."],
    ["EM ANDAMENTO", "Já está pronto."],
    ["EM VALIDAÇÃO", "Finalizada ontem."],
    ["IMPLEMENTADA", "Etapa validada."],
    ["EM ANDAMENTO", "Foi aprovada pelo time."],
    ["IMPLEMENTADA", "Está provado que funciona."],
    ["BLOQUEADA", "Já testado em produção."],
    ["VALIDADA", "Validado e entregue."],
    ["VALIDADA COM PENDÊNCIA HUMANA", "Validado e concluído."],
  ];
  for (const [status, texto] of casos) {
    assert.ok(termosFortesDemais(texto, status).length > 0, `${status}: "${texto}" deveria reprovar`);
  }
});

test("léxico: o status certo sustenta o termo e a negação simples não reprova", () => {
  const liberados = [
    ["CONCLUÍDA", "Concluído e entregue."],
    ["CONCLUÍDA COM RISCO ACEITO", "Concluído com risco aceito."],
    ["VALIDADA", "Validado por agente independente."],
    ["VALIDADA COM PENDÊNCIA HUMANA", "Validado, falta ver no aparelho."],
    ["CONCLUÍDA", "Provado e testado."],
    ["IMPLEMENTADA", "Implementado, aguarda validação."],
    ["IMPLEMENTADA", "Ainda não validado."],
    ["IMPLEMENTADA", "Ainda não foi validada por ninguém."],
    ["EM ANDAMENTO", "Nada foi testado de forma independente."],
    ["EM ANDAMENTO", "Nenhuma entrega concluída."],
    ["IMPLEMENTADA", "Fica pronto para validação na segunda."],
    ["IMPLEMENTADA", "Aguarda ser validada por outro agente."],
    ["PENDENTE", "Só passa a valer depois que for aprovado."],
  ];
  for (const [status, texto] of liberados) {
    assert.deepEqual(termosFortesDemais(texto, status), [], `${status}: "${texto}" não deveria reprovar`);
  }
});

test("léxico: negação distante não protege (o negador precisa estar colado ao termo)", () => {
  assert.ok(termosFortesDemais("Não há atraso nenhum e a tela já foi entregue.", "IMPLEMENTADA").length > 0);
});

/* ---------- Mentiras, uma de cada jeito ---------- */

test("mentira: data-status diverge do registrado", () => {
  const html = trocar(BOM, `data-etapa="V2-F00-E02" data-status="VALIDADA"`, `data-etapa="V2-F00-E02" data-status="CONCLUÍDA"`);
  const r = conferir(html);
  assert.ok(codigos(r).includes("status-divergente"));
  assert.match(r.problemas.find((p) => p.codigo === "status-divergente").mensagem, /V2-F00-E02.*VALIDADA/);
});

test("mentira: item de etapa sem data-status, e etapa que não existe", () => {
  assert.ok(codigos(conferir(trocar(BOM, `data-etapa="V2-F00-E01" data-status="CONCLUÍDA"`, `data-etapa="V2-F00-E01"`))).includes("status-ausente"));
  assert.ok(codigos(conferir(trocar(BOM, `data-etapa="V2-F00-E09" data-status="PENDENTE"`, `data-etapa="V2-F00-E99" data-status="PENDENTE"`))).includes("etapa-desconhecida"));
});

test("mentira: texto do item mais forte que o status (implementada vira 'entregue')", () => {
  const html = trocar(BOM, "A tela de aparelhos foi feita e medida. Implementado, aguarda validação.", "A tela de aparelhos foi entregue.");
  const r = conferir(html);
  assert.ok(codigos(r).includes("termo-forte"));
  assert.match(r.problemas.find((p) => p.codigo === "termo-forte").mensagem, /IMPLEMENTADA.*entregue/);
});

test("mentira: em andamento 'validado', 'aprovado' e 'testado'", () => {
  for (const termo of ["validado", "aprovado", "testado", "provado", "finalizado", "pronto"]) {
    const html = trocar(BOM, "Medida por quem implementou: implementado, aguarda validação. Ainda não validado por ninguém de fora.", `Implementado, aguarda validação, e já ${termo}.`);
    assert.ok(codigos(conferir(html)).includes("termo-forte"), `"${termo}" deveria reprovar em EM ANDAMENTO`);
  }
});

test("mentira: CONCLUÍDA COM RISCO ACEITO escrito só como 'concluído'", () => {
  const html = trocar(BOM, "F00-E04: concluído com risco aceito. A rodada em Linux", "F00-E04: concluído. A rodada em Linux");
  const r = conferir(html);
  assert.ok(codigos(r).includes("risco-sem-qualificador"));
});

test("mentira: item de etapa na seção errada", () => {
  const concluidaEmImplementado = trocar(
    BOM,
    `<tr data-etapa="V2-F00-E05" data-status="IMPLEMENTADA"><td>F00-E05</td><td>A tela de aparelhos foi feita e medida. Implementado, aguarda validação.</td></tr>`,
    `<tr data-etapa="V2-F00-E01" data-status="CONCLUÍDA"><td>F00-E01</td><td>Concluído.</td></tr>`,
  );
  assert.ok(codigos(conferir(concluidaEmImplementado)).includes("secao-errada"));

  const validadaEmConcluido = trocar(
    BOM,
    `<tr data-etapa="V2-F00-E01" data-status="CONCLUÍDA"><td>F00-E01</td><td>Concluído, com a evidência arquivada.</td></tr>`,
    `<tr data-etapa="V2-F00-E02" data-status="VALIDADA"><td>F00-E02</td><td>Validado.</td></tr>`,
  );
  assert.ok(codigos(conferir(validadaEmConcluido)).includes("secao-errada"));

  const comRiscoEmConcluido = trocar(
    BOM,
    `<tr data-etapa="V2-F00-E01" data-status="CONCLUÍDA"><td>F00-E01</td><td>Concluído, com a evidência arquivada.</td></tr>`,
    `<tr data-etapa="V2-F00-E04" data-status="CONCLUÍDA COM RISCO ACEITO"><td>F00-E04</td><td>Concluído com risco aceito.</td></tr>`,
  );
  assert.ok(codigos(conferir(comRiscoEmConcluido)).includes("secao-errada"), "concluída com risco aceito só mora na seção de risco aceito");

  const implementadaEmValidado = trocar(
    BOM,
    `<tr data-etapa="V2-F00-E02" data-status="VALIDADA"><td>F00-E02</td><td>Validado por agente independente sobre um commit fixo.</td></tr>`,
    `<tr data-etapa="V2-F00-E05" data-status="IMPLEMENTADA"><td>F00-E05</td><td>Implementado, aguarda validação.</td></tr>`,
  );
  assert.ok(codigos(conferir(implementadaEmValidado)).includes("secao-errada"));
});

test("mentira: etapa implementada sem dizer que aguarda validação", () => {
  const html = trocar(BOM, "A tela de aparelhos foi feita e medida. Implementado, aguarda validação.", "A tela de aparelhos foi feita e medida.");
  assert.ok(codigos(conferir(html)).includes("rotulo-ausente"));
});

test("mentira: bloqueada, reprovada e validada com pendência sem o rótulo do status", () => {
  assert.ok(codigos(conferir(trocar(BOM, "F00-E07 está bloqueado pela decisão", "F00-E07 depende da decisão"))).includes("rotulo-ausente"));
  assert.ok(codigos(conferir(trocar(BOM, "F00-E08 está em correção depois de uma reprovação.", "F00-E08 segue."))).includes("rotulo-ausente"));
  assert.ok(codigos(conferir(trocar(BOM, "Validado, falta Rafael ver a tela no aparelho.", "Validado."))).includes("rotulo-ausente"));
});

test("mentira: há risco aceito e o relatório não tem a seção", () => {
  const sem = BOM.replace(/<section data-secao="risco-aceito">[\s\S]*?<\/section>\n\n/, "");
  assert.ok(!sem.includes('data-secao="risco-aceito"'));
  assert.ok(codigos(conferir(sem)).includes("risco-aceito-ausente"));
  // Seção presente mas vazia também não vale.
  const vazia = BOM.replace(/(<section data-secao="risco-aceito">)[\s\S]*?(<\/section>)/, "$1<h2>Risco</h2>$2");
  assert.ok(codigos(conferir(vazia)).includes("risco-aceito-ausente"));
});

test("sem risco registrado e sem etapa com risco aceito, a seção de risco pode faltar", () => {
  const dados = com({ riscosAceitos: [], statusPorEtapa: { ...COLETA.statusPorEtapa, "V2-F00-E04": "VALIDADA" } });
  let html = BOM.replace(/<section data-secao="risco-aceito">[\s\S]*?<\/section>\n\n/, "");
  html = trocar(html, `<tr data-etapa="V2-F00-E02" data-status="VALIDADA">`, `<tr data-etapa="V2-F00-E04" data-status="VALIDADA"><td>F00-E04</td><td>Validado.</td></tr>\n    <tr data-etapa="V2-F00-E02" data-status="VALIDADA">`);
  assert.deepEqual(conferir(html, dados).problemas, []);
});

test("mentira: omite a regressão, a reprovação e o bloqueio novo do período", () => {
  const semE07 = BOM.replace(/\s*<li data-etapa="V2-F00-E07"[^>]*>[\s\S]*?<\/li>/, "");
  assert.ok(!semE07.includes("V2-F00-E07"));
  const r07 = conferir(semE07);
  assert.ok(r07.problemas.some((p) => p.codigo === "omissao" && /V2-F00-E07/.test(p.mensagem) && /regressão/.test(p.mensagem)));

  const semE08 = BOM.replace(/\s*<li data-etapa="V2-F00-E08"[^>]*>[\s\S]*?<\/li>/, "");
  assert.ok(conferir(semE08).problemas.some((p) => p.codigo === "omissao" && /V2-F00-E08/.test(p.mensagem) && /reprovação/.test(p.mensagem)));

  const dados = com({
    statusPorEtapa: { ...COLETA.statusPorEtapa, "V2-F00-E10": "BLOQUEADA" },
    mudancas: { ...COLETA.mudancas, etapas: [...COLETA.mudancas.etapas, { id: "V2-F00-E10", fase: "F00", titulo: "x", antes: "EM ANDAMENTO", depois: "BLOQUEADA", tipo: "bloqueada", observacao: "" }] },
  });
  assert.ok(conferir(BOM, dados).problemas.some((p) => p.codigo === "omissao" && /bloqueio novo/.test(p.mensagem)), "BLOCKED novo omitido");
});

test("mentira: gate reaberto omitido, e gate reaberto citado confere", () => {
  const dados = com({ gatesReabertos: [{ gate: "G01", fase: "F01", motivo: "regressão: V2-F01-E01" }] });
  assert.ok(conferir(BOM, dados).problemas.some((p) => p.codigo === "omissao" && /G01/.test(p.mensagem) && /REABERTO/.test(p.mensagem)));
  const citado = trocar(BOM, `<tr data-gate="G00" data-status="EM ANDAMENTO">`, `<tr data-gate="G01" data-status="NÃO INICIADO"><td>F01</td><td>G01</td><td>reaberto</td></tr>\n    <tr data-gate="G00" data-status="EM ANDAMENTO">`);
  assert.equal(conferir(citado, dados).problemas.some((p) => p.codigo === "omissao"), false);
  // A mudança de gate do período para REABERTO conta como reabertura mesmo que o estado já seja outro.
  const dadosDoPeriodo = com({ mudancas: { ...COLETA.mudancas, gates: [{ gate: "G02", fase: "F02", antes: "APROVADO", depois: "REABERTO", reaberto: true, motivo: "" }] } });
  assert.ok(conferir(BOM, dadosDoPeriodo).problemas.some((p) => p.codigo === "omissao" && /G02/.test(p.mensagem)));
});

test("mentira: gate com status diferente do registrado", () => {
  const html = trocar(BOM, `<tr data-gate="G00" data-status="EM ANDAMENTO">`, `<tr data-gate="G00" data-status="APROVADO">`);
  assert.ok(codigos(conferir(html)).includes("status-divergente"));
});

test("mentira: 'fase concluída' e 'gate aprovado' sem gate APROVADO", () => {
  for (const frase of ["A F00 está concluída.", "A fase F00 foi concluída com sucesso.", "Fase concluída: a atual terminou."]) {
    const r = conferir(trocar(BOM, "O gate G00 ainda não foi aprovado.", frase));
    assert.ok(codigos(r).includes("fase-concluida-sem-gate"), `"${frase}" deveria reprovar`);
  }
  assert.ok(codigos(conferir(trocar(BOM, "O gate G00 ainda não foi aprovado.", "O G00 está aprovado."))).includes("gate-aprovado-sem-aprovacao"));
  assert.ok(codigos(conferir(trocar(BOM, "O gate G00 ainda não foi aprovado.", "O G00 foi aprovado."))).includes("gate-aprovado-sem-aprovacao"));
});

test("fase concluída com gate APROVADO confere; negação e título de seção não reprovam", () => {
  const dados = com({ gates: [{ fase: "F00", gate: "G00", status: "APROVADO" }, ...COLETA.gates.slice(1)] });
  const html = trocar(BOM, `<tr data-gate="G00" data-status="EM ANDAMENTO">`, `<tr data-gate="G00" data-status="APROVADO">`);
  const r = conferir(trocar(html, "O gate G00 ainda não foi aprovado.", "A fase F00 está concluída e o G00 foi aprovado."), dados);
  assert.equal(codigos(r).includes("fase-concluida-sem-gate"), false);
  assert.equal(codigos(r).includes("gate-aprovado-sem-aprovacao"), false);
  // Negação simples e o plural "fases concluídas" não são afirmação.
  const neutro = trocar(BOM, "O gate G00 ainda não foi aprovado.", "A fase F00 ainda não está concluída. Fases concluídas: nenhuma. O G00 não foi aprovado.");
  assert.equal(codigos(conferir(neutro)).some((c) => c.startsWith("fase-concluida") || c.startsWith("gate-aprovado")), false);
});

test("mentira: afirmação solta de validação ou entrega quando nenhuma etapa tem esse status", () => {
  const dados = com({ statusPorEtapa: Object.fromEntries(Object.keys(COLETA.statusPorEtapa).map((id) => [id, "EM ANDAMENTO"])) });
  const html = trocar(BOM, "O gate G00 ainda não foi aprovado.", "As etapas foram validadas e entregues.");
  const r = conferir(html, dados);
  assert.ok(r.problemas.filter((p) => p.codigo === "afirmacao-sem-base").length >= 2);
  // Com etapa validada e concluída no STATUS, a mesma frase deixa de ser acusada pela regra solta.
  assert.equal(codigos(conferir(html)).includes("afirmacao-sem-base"), false);
});

test("mentira: travessão literal e como entidade", () => {
  const literal = trocar(BOM, "Nada neste período.", `Nada neste período ${TRAVESSAO} nada mesmo.`);
  const r = conferir(literal);
  assert.ok(codigos(r).includes("travessao"));
  assert.ok(r.problemas.find((p) => p.codigo === "travessao").linha > 0, "diz a linha");
  assert.ok(codigos(conferir(trocar(BOM, "Nada neste período.", "Nada &mdash; nada."))).includes("travessao"));
  assert.ok(codigos(conferir(trocar(BOM, "Nada neste período.", "Nada &#8212; nada."))).includes("travessao"));
  // O travessão escondido num atributo ou comentário também reprova: o arquivo inteiro é varrido.
  assert.ok(codigos(conferir(trocar(BOM, "<title>", `<!-- ${TRAVESSAO} --><title>`))).includes("travessao"));
});

test("mentira: algo com cara de segredo", () => {
  const jwt = ["eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9", "eyJzdWIiOiIxMjM0NTY3ODkwIn0", "dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U"].join(".");
  const casos = {
    "token JWT": `O acesso usou ${jwt} na rodada.`,
    "endereço com usuário e senha": "A conexão foi postgres://operador:s3nh4Longa@servidor.interno:5432/banco.",
    "chave privada": "-----BEGIN PRIVATE KEY----- colada por engano.",
    "atribuição": "A senha: Abc123xyz789QWE ficou no texto.",
    "cabeçalho": "Authorization: Bearer abcdef0123456789abcdef.",
    "chave AWS": `A chave ${"AKIA"}ABCDEFGHIJKLMNOP vazou.`,
    "token GitHub": `O token ${"ghp_"}${"a1B2c3D4e5F6g7H8i9J0k1L2m3N4o5P6q7R8"} vazou.`,
  };
  for (const [nome, frase] of Object.entries(casos)) {
    const r = conferir(trocar(BOM, "Nada neste período.", frase));
    assert.ok(codigos(r).includes("segredo"), `${nome} deveria reprovar`);
  }
  // Uma frase sobre senha, sem valor, é texto comum.
  assert.equal(codigos(conferir(trocar(BOM, "Nada neste período.", "A senha provisória vence em 24 horas."))).includes("segredo"), false);
});

test("mentira: detalhe técnico que não é nível executivo, e nomes da semente de teste", () => {
  for (const frase of ["A rota POST /auth/entrar aceitava qualquer conta.", "O defeito estava em servidor.ts.", "Rodamos a migração 041.sql.", "O teste usou a prefeitura de Serra Alta.", "O papel dc360_app foi checado."]) {
    assert.ok(codigos(conferir(trocar(BOM, "Nada neste período.", frase))).includes("detalhe-tecnico"), `"${frase}" deveria reprovar`);
  }
  assert.equal(codigos(conferir(trocar(BOM, "Nada neste período.", "Usa Node.js 22."))).includes("detalhe-tecnico"), false, "Node.js é plataforma, não arquivo");
});

test("mentira: situação NO RUMO com bloqueio, regressão ou gate reaberto", () => {
  const html = trocar(BOM, `data-situacao="ATENÇÃO">ATENÇÃO`, `data-situacao="NO RUMO">NO RUMO`);
  const r = conferir(html);
  assert.ok(codigos(r).includes("situacao-inflada"));
  const limpa = com({
    mudancas: { etapas: [], gates: [], checkpoints: [], obrigatorias: [] },
    bloqueios: { checkpointsAbertos: [], etapasBloqueadas: [], porQuem: {} },
  });
  assert.equal(codigos(conferir(html, limpa)).includes("situacao-inflada"), false, "sem bloqueio, NO RUMO é permitido");
  assert.ok(codigos(conferir(html, { ...limpa, gatesReabertos: [{ gate: "G01", fase: "F01", motivo: "" }] })).includes("situacao-inflada"));
  assert.ok(codigos(conferir(trocar(BOM, `data-situacao="ATENÇÃO">ATENÇÃO`, `data-situacao="OTIMO">OTIMO`))).includes("estrutura"));
});

test("mentira: sha, período e fase que não são os da coleta", () => {
  assert.ok(codigos(conferir(trocar(BOM, `data-sha="abcdef1234567890abcdef1234567890abcdef12"`, `data-sha="9999999"`))).includes("sha-divergente"));
  assert.equal(codigos(conferir(trocar(BOM, `data-sha="abcdef1234567890abcdef1234567890abcdef12"`, `data-sha="abcdef1"`))).includes("sha-divergente"), false, "o SHA curto é prefixo do da coleta");
  assert.ok(codigos(conferir(trocar(BOM, `data-ate="2026-10-11"`, `data-ate="2026-10-18"`))).includes("periodo-divergente"));
  assert.ok(codigos(conferir(trocar(BOM, `data-fase-atual="F00"`, `data-fase-atual="F05"`))).includes("fase-divergente"));
});

test("mentira: sobrou marcador do modelo, falta seção e falta bloco de bloqueio", () => {
  assert.ok(codigos(conferir(trocar(BOM, "Nada neste período.", "{{texto do período}}"))).includes("modelo-nao-preenchido"));
  assert.ok(codigos(conferir(BOM.replace(/<section data-secao="proximo-passo">[\s\S]*?<\/section>/, ""))).includes("estrutura"));
  assert.ok(codigos(conferir(BOM.replace(/<div data-bloqueio="externo">[\s\S]*?<\/div>/, ""))).includes("estrutura"));
  assert.ok(codigos(conferir(trocar(BOM, `data-relatorio="semanal"`, `data-relatorio="outro"`))).includes("estrutura"));
});

test("relatório de fase só confere com o gate APROVADO", () => {
  const fase = `<!doctype html><html data-relatorio="fase" data-fase-atual="F00"><body>
    ${["objetivo", "por-que", "situacao-antes", "feito", "antes-depois", "provas", "gate", "riscos-residuais", "decisoes-tomadas", "adiados", "libera", "proxima-fase"]
      .map((s) => `<section data-secao="${s}"><h2>${s}</h2><p>Texto.</p></section>`)
      .join("\n")}
    <footer data-sha="abcdef1"></footer></body></html>`;
  assert.ok(codigos(conferir(fase)).includes("fase-sem-gate-aprovado"));
  const aprovado = com({
    fase: { ...COLETA.fase, statusDoGate: "APROVADO" },
    riscosAceitos: [],
    mudancas: { etapas: [], gates: [], checkpoints: [], obrigatorias: [] },
  });
  assert.deepEqual(codigos(conferir(fase, aprovado)), []);
});

test("o modelo semanal e o modelo de fase, ainda com {{...}}, não passam na conferência", () => {
  for (const modelo of ["semanal.html", "fase.html"]) {
    const html = readFileSync(join(AQUI, "..", "..", "docs", "relatorios-v2", "modelo", modelo), "utf8");
    assert.ok(codigos(conferir(html)).includes("modelo-nao-preenchido"), `${modelo} cru deveria reprovar`);
    assert.equal(html.includes(TRAVESSAO), false, `${modelo} tem travessão`);
  }
});

/* ---------- CLI ---------- */

test("CLI: sai com 0 no relatório honesto, 1 no que mente e 2 sem argumentos", () => {
  const pasta = mkdtempSync(join(tmpdir(), "relatorio-cli-"));
  try {
    const bom = join(pasta, "bom.html");
    const mentira = join(pasta, "mentira.html");
    const dados = join(pasta, "coleta.json");
    writeFileSync(bom, BOM);
    writeFileSync(mentira, trocar(BOM, "Concluído, com a evidência arquivada.", "Concluído. A F00 está concluída."));
    writeFileSync(dados, JSON.stringify(COLETA));

    const ok = executarCli("conferir-relatorio.mjs", [bom, "--dados", dados]);
    assert.equal(ok.codigo, 0, ok.erro);
    assert.match(ok.saida, /Relatório confere/);

    const ruim = executarCli("conferir-relatorio.mjs", [mentira, "--dados", dados]);
    assert.equal(ruim.codigo, 1);
    assert.match(ruim.erro, /NÃO confere/);
    assert.match(ruim.erro, /\[fase-concluida-sem-gate\]/);

    const json = executarCli("conferir-relatorio.mjs", [mentira, "--dados", dados, "--json"]);
    assert.equal(json.codigo, 1);
    assert.ok(JSON.parse(json.saida).problemas.length > 0);

    assert.equal(executarCli("conferir-relatorio.mjs", []).codigo, 2);
    assert.equal(executarCli("conferir-relatorio.mjs", [bom]).codigo, 2);
    assert.equal(executarCli("conferir-relatorio.mjs", [bom, "--dados", join(pasta, "nao-existe.json")]).codigo, 2);
    assert.equal(executarCli("conferir-relatorio.mjs", [bom, "--dados", dados, "--invento"]).codigo, 2);
  } finally {
    rmSync(pasta, { recursive: true, force: true });
  }
});
