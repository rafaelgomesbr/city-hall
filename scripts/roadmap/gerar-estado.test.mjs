import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import { FIXTURE, RAIZ_REAL, converterParaCrlf, copiarFixture, escrever, executarCli, trocarNoArquivo } from "./apoio-de-teste.mjs";
import { MAX_LINHAS, conferir, faseAtual, gerarEstado, proximasEtapas } from "./gerar-estado.mjs";
import { lerStatusDoRepositorio } from "./roadmap.mjs";

const STATUS = "docs/roadmap-v2/STATUS.md";
const todosExistem = () => true;
const nenhumExiste = () => false;

/** Grava o estado gerado num arquivo temporário e devolve o caminho, para o `conferir` comparar. */
function gravarEstado(raiz, pasta) {
  const caminho = join(pasta, "ESTADO-ATUAL.md");
  writeFileSync(caminho, gerarEstado(raiz));
  return caminho;
}

const codigos = (problemas) => problemas.map((p) => p.codigo);

/** Aprova o G00 na cópia da fixture (com GATE.md, como a política exige). */
function aprovarG00(raiz) {
  trocarNoArquivo(raiz, STATUS, "| G00 BASE DE BRINQUEDO | 3 | 0 | NÃO INICIADO |", "| G00 BASE DE BRINQUEDO | 3 | 3 | APROVADO |");
  escrever(raiz, "docs/evidencias-v2/G00/GATE.md", "# GATE G00\n- Aprovado por Rafael.\n");
}

/* ---------- Conteúdo, na fixture ---------- */

test("fixture: fase atual, contagem, próximas etapas e checkpoints", () => {
  const t = gerarEstado(FIXTURE);
  assert.match(t, /^# ESTADO ATUAL DA V2/);
  assert.match(t, /GERADO por `node scripts\/roadmap\/gerar-estado\.mjs`/);
  assert.match(t, /NÃO edite à mão/);
  assert.match(t, /- F00 Estabilizacao de brinquedo \(ordem 1 de 3\), gate G00 BASE DE BRINQUEDO: NÃO INICIADO/);
  assert.match(t, /Último gate aprovado: nenhum/);
  assert.match(t, /Gate anterior na ordem: nenhum \(primeira fase\)/);
  assert.match(t, /GATE\.md do G00 em docs\/evidencias-v2\/G00\/: ausente/);
  assert.match(t, /## Etapas da F00 \(3\)\n- PENDENTE 2, EM ANDAMENTO 1/);
  // E01 é a primeira acionável na ordem da tabela; E02 é a primeira sem pendência humana.
  assert.match(t, /Próxima etapa acionável na ordem da tabela: V2-F00-E01 \(EM ANDAMENTO\)/);
  assert.match(t, /Primeira sem pendência humana registrada: V2-F00-E02 \(PENDENTE\)/);
  // CP-03 (aberto) e CP-19 (parcial, só pelo cabeçalho) entram; CP-01 está decidido e não entra.
  assert.match(t, /- CP-03 ABERTO: Politica de audit \(F00: cabeçalho da fase, F00-E03\)/);
  assert.match(t, /- CP-19 PARCIAL/);
  assert.ok(!/- CP-01 /.test(t));
  assert.match(t, /## Etapas com pendência humana \(1\)[\s\S]*F00-E01/);
  assert.match(t, /Riscos aceitos vigentes \(0\)/);
  assert.match(t, /Gates REABERTOS \(0\)\n- nenhum/);
  // A ordem de execução vale mais que o número: F02 vem antes de F01.
  assert.match(t, /F02, F01/);
});

test("a etapa BLOQUEADA ou CANCELADA nunca é a próxima acionável", () => {
  const status = lerStatusDoRepositorio(FIXTURE);
  const etapas = status.etapas.filter((e) => e.fase === "F00").map((e) => ({ ...e }));
  etapas[0].status = "BLOQUEADA";
  etapas[1].status = "CANCELADA";
  assert.equal(proximasEtapas(etapas).primeira.id, "V2-F00-E03");
  etapas[2].status = "CONCLUÍDA";
  assert.equal(proximasEtapas(etapas).primeira, null);
});

test("não depende de HEAD, de hora, de data nem de ramo", () => {
  const t = gerarEstado(FIXTURE);
  assert.ok(!/\b\d{4}-\d{2}-\d{2}\b/.test(t), "data no estado gerado");
  assert.ok(!t.includes("abc1234"), "hash no estado gerado");
  assert.ok(!/v2\/f00|master/.test(t), "nome de ramo no estado gerado");
  assert.ok(!t.includes("\u2014"), "travessão");
  // Duas gerações seguidas são idênticas.
  assert.equal(gerarEstado(FIXTURE), t);
});

test("a saída é igual com CRLF nos arquivos de origem", () => {
  const copia = copiarFixture();
  try {
    const original = gerarEstado(copia.raiz);
    converterParaCrlf(copia.raiz);
    assert.equal(gerarEstado(copia.raiz), original);
  } finally {
    copia.limpar();
  }
});

test("gate APROVADO avança a fase pela ORDEM de execução: depois da F00 vem a F02, e não a F01", () => {
  const copia = copiarFixture();
  try {
    aprovarG00(copia.raiz);
    const status = lerStatusDoRepositorio(copia.raiz);
    assert.equal(faseAtual(status).fase, "F02");
    const t = gerarEstado(copia.raiz);
    assert.match(t, /- F02 .*\(ordem 2 de 3\), gate G02 SEGUNDO GATE: NÃO INICIADO/);
    assert.match(t, /Último gate aprovado: G00 \(F00\)/);
    assert.match(t, /Gate anterior na ordem: G00 APROVADO/);
    assert.match(t, /Fases depois da F02 na ordem de execução \(1\)[\s\S]*F01/);
    // O gate aprovado não aparece mais como CP aberto da fase atual: o CP-03 sai porque a F02 não o cita.
    assert.ok(!/- CP-03 ABERTO: Politica de audit \(F02/.test(t));
  } finally {
    copia.limpar();
  }
});

test("APROVADO COM RISCO ACEITO também libera; REABERTO não", () => {
  const copia = copiarFixture();
  try {
    trocarNoArquivo(copia.raiz, STATUS, "| G00 BASE DE BRINQUEDO | 3 | 0 | NÃO INICIADO |", "| G00 BASE DE BRINQUEDO | 3 | 3 | APROVADO COM RISCO ACEITO |");
    assert.equal(faseAtual(lerStatusDoRepositorio(copia.raiz)).fase, "F02");
    trocarNoArquivo(copia.raiz, STATUS, "| G00 BASE DE BRINQUEDO | 3 | 3 | APROVADO COM RISCO ACEITO |", "| G00 BASE DE BRINQUEDO | 3 | 3 | REABERTO |");
    assert.equal(faseAtual(lerStatusDoRepositorio(copia.raiz)).fase, "F00", "gate reaberto volta a ser a fase atual");
  } finally {
    copia.limpar();
  }
});

test("gate REABERTO aparece com o motivo escrito no GATE.md", () => {
  const copia = copiarFixture();
  try {
    aprovarG00(copia.raiz);
    trocarNoArquivo(copia.raiz, STATUS, "| G02 SEGUNDO GATE | 1 | 0 | NÃO INICIADO |", "| G02 SEGUNDO GATE | 1 | 1 | REABERTO |");
    escrever(copia.raiz, "docs/evidencias-v2/G02/GATE.md", "# GATE G02\n- APROVADO em um dia por Rafael.\n- REABERTO: condição expirada do risco da etapa X.\n");
    const t = gerarEstado(copia.raiz);
    assert.match(t, /Gates REABERTOS \(1\)\n- G02 \(F02\): REABERTO: condição expirada do risco da etapa X\./);
    // E o gate reaberto é a fase atual.
    assert.match(t, /- F02 .*gate G02 SEGUNDO GATE: REABERTO/);
  } finally {
    copia.limpar();
  }
});

test("riscos aceitos vigentes saem de RISCO-ACEITO.md, e o encerrado fica de fora", () => {
  const copia = copiarFixture();
  try {
    escrever(copia.raiz, "docs/evidencias-v2/G00/V2-F00-E01/RISCO-ACEITO.md", "- **Critério:** parecer de acessibilidade externa\n- **Validade:** G23\n- **Quem aceitou:** Rafael\n");
    escrever(copia.raiz, "docs/evidencias-v2/G00/V2-F00-E02/RISCO-ACEITO.md", "- **Critério:** velho\n- Status: EXPIRADO\n");
    const t = gerarEstado(copia.raiz);
    assert.match(t, /Riscos aceitos vigentes \(1\)\n- V2-F00-E01: parecer de acessibilidade externa; validade: G23/);
    assert.ok(!t.includes("velho"));
  } finally {
    copia.limpar();
  }
});

test("rascunho de risco aceito (Quem aceitou vazio, sem Status) não é listado como vigente", () => {
  const copia = copiarFixture();
  try {
    // Formato real do rascunho do gatekeeper (E21): encerrado só em texto livre, sem linha "Status:".
    escrever(copia.raiz, "docs/evidencias-v2/G00/V2-F00-E01/RISCO-ACEITO.md", "# RISCO ACEITO em V2-F00-E01\n\nRASCUNHO do gatekeeper. NÃO ACEITO.\n\n- Critério: três casos em Windows\n- Validade: até o GATE G00\n- Quem aceitou: (vazio) em (vazio)\n\n## Encerramento na rodada 8, SEM ACEITE\n");
    escrever(copia.raiz, "docs/evidencias-v2/G00/V2-F00-E02/RISCO-ACEITO.md", "# RISCO ACEITO em V2-F00-E02 (RASCUNHO, NÃO aceito)\n\n- Critério: outro\n- Validade: até a rodada 4\n- Quem aceitou: (vazio; só Rafael pode aceitar critério técnico)\n");
    let t = gerarEstado(copia.raiz);
    assert.match(t, /Riscos aceitos vigentes \(0\)/);
    assert.ok(!t.includes("três casos em Windows"));
    // Assinado de verdade volta a valer.
    escrever(copia.raiz, "docs/evidencias-v2/G00/V2-F00-E01/RISCO-ACEITO.md", "- Critério: três casos em Windows\n- Validade: até o GATE G00\n- Quem aceitou: Rafael em 2026-10-25\n");
    t = gerarEstado(copia.raiz);
    assert.match(t, /Riscos aceitos vigentes \(1\)\n- V2-F00-E01: três casos em Windows/);
  } finally {
    copia.limpar();
  }
});

test("o estado respeita o limite de 60 linhas mesmo com muita coisa", () => {
  const copia = copiarFixture();
  try {
    // 40 etapas com pendência e 20 CPs abertos na mesma fase.
    const linhas = [];
    for (let n = 10; n < 50; n++) linhas.push(`| V2-F00-E${n} | Etapa ${n} | S | P1 | EM ANDAMENTO | falta validação humana |`);
    trocarNoArquivo(copia.raiz, STATUS, "| V2-F00-E03 | Audit conforme politica | M | P0 | PENDENTE |", `${linhas.join("\n")}\n| V2-F00-E03 | Audit conforme politica | M | P0 | PENDENTE |`);
    const t = gerarEstado(copia.raiz);
    assert.ok(t.split("\n").length - 1 <= MAX_LINHAS, `${t.split("\n").length - 1} linhas`);
    assert.match(t, /Etapas com pendência humana \(41\)/);
  } finally {
    copia.limpar();
  }
});

/* ---------- --conferir, na fixture ---------- */

test("conferir: estado fresco e commit existente, sem problema", () => {
  const copia = copiarFixture();
  try {
    const arquivoEstado = gravarEstado(copia.raiz, copia.pasta);
    assert.deepEqual(conferir({ raiz: copia.raiz, arquivoEstado, commitExiste: todosExistem }), []);
  } finally {
    copia.limpar();
  }
});

test("conferir (a): arquivo ausente ou diferente do que o repositório produz", () => {
  const copia = copiarFixture();
  try {
    const ausente = join(copia.pasta, "nao-existe.md");
    assert.deepEqual(codigos(conferir({ raiz: copia.raiz, arquivoEstado: ausente, commitExiste: todosExistem })), ["difere"]);

    const arquivoEstado = gravarEstado(copia.raiz, copia.pasta);
    writeFileSync(arquivoEstado, readFileSync(arquivoEstado, "utf8").replace("EM ANDAMENTO 1", "EM ANDAMENTO 9"));
    const problemas = conferir({ raiz: copia.raiz, arquivoEstado, commitExiste: todosExistem });
    assert.deepEqual(codigos(problemas), ["difere"]);
    assert.match(problemas[0].mensagem, /Regere com/);

    // O STATUS muda e o arquivo velho deixa de bater: é assim que o estado velho é pego.
    const fresco = gravarEstado(copia.raiz, copia.pasta);
    trocarNoArquivo(copia.raiz, STATUS, "| V2-F00-E02 | Tela de aparelhos no painel | M | P1 | PENDENTE |", "| V2-F00-E02 | Tela de aparelhos no painel | M | P1 | EM ANDAMENTO |");
    assert.deepEqual(codigos(conferir({ raiz: copia.raiz, arquivoEstado: fresco, commitExiste: todosExistem })), ["difere"]);
  } finally {
    copia.limpar();
  }
});

test("conferir (a): CRLF no arquivo gerado não é diferença", () => {
  const copia = copiarFixture();
  try {
    const arquivoEstado = gravarEstado(copia.raiz, copia.pasta);
    writeFileSync(arquivoEstado, readFileSync(arquivoEstado, "utf8").replace(/\n/g, "\r\n"));
    assert.deepEqual(conferir({ raiz: copia.raiz, arquivoEstado, commitExiste: todosExistem }), []);
  } finally {
    copia.limpar();
  }
});

test("conferir (b): hash entre crases que não é commit", () => {
  const copia = copiarFixture();
  try {
    const arquivoEstado = gravarEstado(copia.raiz, copia.pasta);
    const problemas = conferir({ raiz: copia.raiz, arquivoEstado, commitExiste: nenhumExiste });
    assert.deepEqual(codigos(problemas), ["hash-inexistente"]);
    assert.match(problemas[0].mensagem, /abc1234/);
    assert.match(problemas[0].mensagem, /STATUS\.md:\d+/);
    // Só o hash inexistente reprova: com `abc1234` existindo, passa.
    assert.deepEqual(conferir({ raiz: copia.raiz, arquivoEstado, commitExiste: (h) => h === "abc1234" }), []);
  } finally {
    copia.limpar();
  }
});

test("conferir (c): etapa VALIDADA, VALIDADA COM PENDÊNCIA HUMANA ou CONCLUÍDA exige VEREDITO.md com PASS", () => {
  for (const status of ["VALIDADA", "VALIDADA COM PENDÊNCIA HUMANA", "CONCLUÍDA"]) {
    const copia = copiarFixture();
    try {
      trocarNoArquivo(copia.raiz, STATUS, "| V2-F00-E01 | Religar a vigencia na escrita | S | P0 | EM ANDAMENTO |", `| V2-F00-E01 | Religar a vigencia na escrita | S | P0 | ${status} |`);
      const arquivoEstado = gravarEstado(copia.raiz, copia.pasta);
      const opcoes = { raiz: copia.raiz, arquivoEstado, commitExiste: todosExistem };

      let problemas = conferir(opcoes);
      assert.deepEqual(codigos(problemas), ["sem-veredito"], status);
      assert.match(problemas[0].mensagem, /docs\/evidencias-v2\/G00\/V2-F00-E01\/VEREDITO\.md/);

      escrever(copia.raiz, "docs/evidencias-v2/G00/V2-F00-E01/VEREDITO.md", "# Veredito\nveredito: FAIL\n");
      problemas = conferir(opcoes);
      assert.deepEqual(codigos(problemas), ["veredito-sem-pass"], status);

      escrever(copia.raiz, "docs/evidencias-v2/G00/V2-F00-E01/VEREDITO.md", "# Veredito\nÉ um texto sem veredito legível.\n");
      assert.deepEqual(codigos(conferir(opcoes)), ["veredito-sem-pass"], "ilegível não é PASS");

      escrever(copia.raiz, "docs/evidencias-v2/G00/V2-F00-E01/VEREDITO.md", "# Veredito\nveredito: PASS\n");
      assert.deepEqual(conferir(opcoes), [], status);
    } finally {
      copia.limpar();
    }
  }
});

test("conferir: CONCLUÍDA COM RISCO ACEITO exige RISCO-ACEITO.md além do PASS", () => {
  const copia = copiarFixture();
  try {
    trocarNoArquivo(copia.raiz, STATUS, "| V2-F00-E01 | Religar a vigencia na escrita | S | P0 | EM ANDAMENTO |", "| V2-F00-E01 | Religar a vigencia na escrita | S | P0 | CONCLUÍDA COM RISCO ACEITO |");
    escrever(copia.raiz, "docs/evidencias-v2/G00/V2-F00-E01/VEREDITO.md", "veredito: PASS\n");
    const arquivoEstado = gravarEstado(copia.raiz, copia.pasta);
    const opcoes = { raiz: copia.raiz, arquivoEstado, commitExiste: todosExistem };
    assert.deepEqual(codigos(conferir(opcoes)), ["sem-risco-aceito"]);
    escrever(copia.raiz, "docs/evidencias-v2/G00/V2-F00-E01/RISCO-ACEITO.md", "- Critério: x\n");
    const arquivoNovo = gravarEstado(copia.raiz, copia.pasta);
    assert.deepEqual(conferir({ ...opcoes, arquivoEstado: arquivoNovo }), []);
  } finally {
    copia.limpar();
  }
});

test("conferir: ACEITA (H84) exige VEREDITO.md que registre ACEITA, e ACEITA não vale como PASS", () => {
  const copia = copiarFixture();
  const vereditoDa = "docs/evidencias-v2/G00/V2-F00-E01/VEREDITO.md";
  try {
    trocarNoArquivo(copia.raiz, STATUS, "| V2-F00-E01 | Religar a vigencia na escrita | S | P0 | EM ANDAMENTO |", "| V2-F00-E01 | Religar a vigencia na escrita | S | P0 | ACEITA |");
    const opcoes = () => ({ raiz: copia.raiz, arquivoEstado: gravarEstado(copia.raiz, copia.pasta), commitExiste: todosExistem });

    assert.deepEqual(codigos(conferir(opcoes())), ["sem-aceite"], "sem VEREDITO.md");
    escrever(copia.raiz, vereditoDa, "# Veredito\nveredito: PASS\n");
    assert.deepEqual(codigos(conferir(opcoes())), ["sem-aceite"], "PASS pede VALIDADA, não ACEITA");
    escrever(copia.raiz, vereditoDa, "# Veredito\nveredito: ACEITA\n");
    assert.deepEqual(conferir(opcoes()), []);

    trocarNoArquivo(copia.raiz, STATUS, "| S | P0 | ACEITA |", "| S | P0 | VALIDADA |");
    assert.deepEqual(codigos(conferir(opcoes())), ["veredito-sem-pass"], "ACEITA não aprova uma VALIDADA");
  } finally {
    copia.limpar();
  }
});

test("conferir (d): IMPLEMENTADA exige SHA existente citado na observação", () => {
  const copia = copiarFixture();
  try {
    const linhaOriginal = "| V2-F00-E02 | Tela de aparelhos no painel | M | P1 | PENDENTE |  |";
    const implementada = (obs) => `| V2-F00-E02 | Tela de aparelhos no painel | M | P1 | IMPLEMENTADA | ${obs} |`;

    trocarNoArquivo(copia.raiz, STATUS, linhaOriginal, implementada("Candidato pronto, sem hash."));
    let arquivoEstado = gravarEstado(copia.raiz, copia.pasta);
    let problemas = conferir({ raiz: copia.raiz, arquivoEstado, commitExiste: todosExistem });
    assert.deepEqual(codigos(problemas), ["implementada-sem-sha"]);
    assert.match(problemas[0].mensagem, /não cita o SHA/);

    trocarNoArquivo(copia.raiz, STATUS, implementada("Candidato pronto, sem hash."), implementada("Candidato `1a2b3c4` no ramo."));
    arquivoEstado = gravarEstado(copia.raiz, copia.pasta);
    problemas = conferir({ raiz: copia.raiz, arquivoEstado, commitExiste: (h) => h === "abc1234" });
    assert.ok(codigos(problemas).includes("implementada-sem-sha"));
    assert.ok(codigos(problemas).includes("hash-inexistente"), "o hash entre crases inexistente também reprova pelo item (b)");
    assert.match(problemas.find((p) => p.codigo === "implementada-sem-sha").mensagem, /1a2b3c4/);

    // SHA citado sem crases também vale, desde que exista.
    trocarNoArquivo(copia.raiz, STATUS, implementada("Candidato `1a2b3c4` no ramo."), implementada("Candidato 99390e0 no ramo."));
    arquivoEstado = gravarEstado(copia.raiz, copia.pasta);
    assert.deepEqual(conferir({ raiz: copia.raiz, arquivoEstado, commitExiste: todosExistem }), []);
  } finally {
    copia.limpar();
  }
});

test("conferir: status fora da política e gate APROVADO sem GATE.md", () => {
  const copia = copiarFixture();
  try {
    trocarNoArquivo(copia.raiz, STATUS, "| V2-F00-E02 | Tela de aparelhos no painel | M | P1 | PENDENTE |", "| V2-F00-E02 | Tela de aparelhos no painel | M | P1 | QUASE PRONTA |");
    trocarNoArquivo(copia.raiz, STATUS, "| G00 BASE DE BRINQUEDO | 3 | 0 | NÃO INICIADO |", "| G00 BASE DE BRINQUEDO | 3 | 3 | APROVADO |");
    const arquivoEstado = gravarEstado(copia.raiz, copia.pasta);
    const cods = codigos(conferir({ raiz: copia.raiz, arquivoEstado, commitExiste: todosExistem }));
    assert.deepEqual(cods.sort(), ["gate-sem-gate-md", "status-desconhecido"]);
  } finally {
    copia.limpar();
  }
});

/* ---------- Repositório real ---------- */

test("repositório real: gera estado curto, determinístico e sem travessão", () => {
  const t = gerarEstado(RAIZ_REAL);
  assert.ok(t.split("\n").length - 1 <= MAX_LINHAS, `${t.split("\n").length - 1} linhas`);
  assert.equal(gerarEstado(RAIZ_REAL), t);
  assert.ok(!t.includes("\u2014"));
  assert.match(t, /^# ESTADO ATUAL DA V2/);
  assert.match(t, /\n## Fase atual\n- F\d\d /);
  assert.match(t, /## Não iniciar/);
});

test("repositório real: o estado gerado passa no conferir logo em seguida, com os commits do git de verdade", () => {
  const pasta = mkdtempSync(join(tmpdir(), "roadmap-estado-"));
  try {
    const arquivoEstado = gravarEstado(RAIZ_REAL, pasta);
    const problemas = conferir({ raiz: RAIZ_REAL, arquivoEstado });
    // Os problemas de conteúdo do STATUS (etapa validada sem veredito etc.) seriam defeito do repositório e aparecem aqui com a mensagem.
    assert.deepEqual(problemas, []);
  } finally {
    rmSync(pasta, { recursive: true, force: true });
  }
});

test("repositório real: hoje a F00 é a fase atual e as contagens de status somam as 25 etapas", () => {
  const status = lerStatusDoRepositorio(RAIZ_REAL);
  const atual = faseAtual(status);
  // Só vale enquanto o G00 não for aprovado; quando for, este teste é o primeiro a avisar que o estado andou.
  assert.equal(atual.fase, "F00");
  const t = gerarEstado(RAIZ_REAL);
  assert.match(t, /Etapas da F00 \(25\)/);
  // O status de cada etapa muda a cada rodada de validação e de correção, de propósito (2026-10-13:
  // cravar "EM ANDAMENTO 25" quebrou o CI do registro da rodada 1). O que não pode mudar é a soma.
  const contagens = /## Etapas da F00 \(25\)\r?\n- (.+)/.exec(t);
  assert.ok(contagens, "linha de contagens por status ausente");
  const soma = [...contagens[1].matchAll(/(\d+)(?:,|$)/g)].reduce((s, m) => s + Number(m[1]), 0);
  assert.equal(soma, 25, `contagens por status não somam 25: ${contagens[1]}`);
  assert.match(t, /Próxima etapa acionável na ordem da tabela: (nenhuma|V2-F00-E\d\d \([A-ZÀ-Ú ]+\))/);
  assert.doesNotMatch(t, /CP-03 ABERTO/); // decidido por Rafael em 2026-10-07
});

test("CLI: --saida grava, --conferir --saida confere, e o arquivo editado à mão é pego", () => {
  const pasta = mkdtempSync(join(tmpdir(), "roadmap-cli-"));
  const arquivo = join(pasta, "ESTADO.md");
  try {
    const gerar = executarCli("gerar-estado.mjs", [`--saida=${arquivo}`]);
    assert.equal(gerar.codigo, 0, gerar.erro);
    assert.ok(existsSync(arquivo));
    assert.match(readFileSync(arquivo, "utf8"), /^# ESTADO ATUAL DA V2/);

    const ok = executarCli("gerar-estado.mjs", ["--conferir", `--saida=${arquivo}`]);
    assert.equal(ok.codigo, 0, ok.erro);
    assert.match(ok.saida, /confere/);

    writeFileSync(arquivo, readFileSync(arquivo, "utf8").replace("# ESTADO ATUAL DA V2", "# ESTADO ATUAL DA V2 (editado)"));
    const ruim = executarCli("gerar-estado.mjs", ["--conferir", `--saida=${arquivo}`]);
    assert.equal(ruim.codigo, 1);
    assert.match(ruim.erro, /NÃO confere/);
    assert.match(ruim.erro, /\[difere\]/);
  } finally {
    rmSync(pasta, { recursive: true, force: true });
  }
});

test("CLI: --stdout imprime sem gravar e argumento desconhecido sai com 2", () => {
  const r = executarCli("gerar-estado.mjs", ["--stdout"]);
  assert.equal(r.codigo, 0, r.erro);
  assert.match(r.saida, /^# ESTADO ATUAL DA V2/);
  assert.equal(executarCli("gerar-estado.mjs", ["--qualquer"]).codigo, 2);
});
