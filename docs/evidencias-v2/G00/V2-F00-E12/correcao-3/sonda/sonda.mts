import { inflateRawSync } from "node:zlib";
import { writeFileSync, mkdirSync } from "node:fs";
import { bancoEmMemoria } from "/Users/[usuario]/Documents/city-hall/dc360/apps/api/src/banco/memoria.ts";
import { carregarConfig } from "/Users/[usuario]/Documents/city-hall/dc360/apps/api/src/config.ts";
import { construirServidor } from "/Users/[usuario]/Documents/city-hall/dc360/apps/api/src/servidor.ts";
import { armazenamentoEmMemoria } from "/Users/[usuario]/Documents/city-hall/dc360/apps/api/src/armazenamento/memoria.ts";

function lerZip(bytes: Buffer): Map<string, Buffer> {
  let fim = -1;
  for (let i = bytes.length - 22; i >= 0; i -= 1) {
    if (bytes.readUInt32LE(i) === 0x06054b50) { fim = i; break; }
  }
  if (fim < 0) throw new Error("não é um ZIP: fim do diretório central não encontrado");

  let total = bytes.readUInt16LE(fim + 10);
  let inicioDoDiretorio = bytes.readUInt32LE(fim + 16);

  // ZIP64: o localizador fica nos 20 bytes imediatamente antes do fim clássico.
  if (total === 0xffff || inicioDoDiretorio === 0xffffffff) {
    const localizador = fim - 20;
    if (bytes.readUInt32LE(localizador) !== 0x07064b50) {
      throw new Error("ZIP64 anunciado e localizador ausente");
    }
    const fim64 = Number(bytes.readBigUInt64LE(localizador + 8));
    if (bytes.readUInt32LE(fim64) !== 0x06064b50) {
      throw new Error("ZIP64: fim do diretório central não encontrado");
    }
    total = Number(bytes.readBigUInt64LE(fim64 + 32));
    inicioDoDiretorio = Number(bytes.readBigUInt64LE(fim64 + 48));
  }

  const arquivos = new Map<string, Buffer>();
  let p = inicioDoDiretorio;

  for (let n = 0; n < total; n += 1) {
    if (bytes.readUInt32LE(p) !== 0x02014b50) throw new Error("entrada central inválida");
    const metodo = bytes.readUInt16LE(p + 10);
    let comprimido = bytes.readUInt32LE(p + 20);
    let original = bytes.readUInt32LE(p + 24);
    const tamanhoNome = bytes.readUInt16LE(p + 28);
    const tamanhoExtra = bytes.readUInt16LE(p + 30);
    const tamanhoComentario = bytes.readUInt16LE(p + 32);
    let deslocamento = bytes.readUInt32LE(p + 42);
    const nome = bytes.subarray(p + 46, p + 46 + tamanhoNome).toString("utf8");

    if (original === 0xffffffff || comprimido === 0xffffffff || deslocamento === 0xffffffff) {
      const extra = bytes.subarray(p + 46 + tamanhoNome, p + 46 + tamanhoNome + tamanhoExtra);
      let q = 0;
      while (q + 4 <= extra.length) {
        const id = extra.readUInt16LE(q);
        const tam = extra.readUInt16LE(q + 2);
        if (id === 0x0001) {
          let r = q + 4;
          if (original === 0xffffffff) { original = Number(extra.readBigUInt64LE(r)); r += 8; }
          if (comprimido === 0xffffffff) { comprimido = Number(extra.readBigUInt64LE(r)); r += 8; }
          if (deslocamento === 0xffffffff) { deslocamento = Number(extra.readBigUInt64LE(r)); }
          break;
        }
        q += 4 + tam;
      }
    }

    const nomeLocal = bytes.readUInt16LE(deslocamento + 26);
    const extraLocal = bytes.readUInt16LE(deslocamento + 28);
    const inicio = deslocamento + 30 + nomeLocal + extraLocal;
    const cru = bytes.subarray(inicio, inicio + comprimido);
    const conteudo = metodo === 8 ? inflateRawSync(cru) : Buffer.from(cru);
    if (conteudo.length !== original) {
      throw new Error(`tamanho divergente em ${nome}: ${conteudo.length} != ${original}`);
    }
    arquivos.set(nome, conteudo);

    p += 46 + tamanhoNome + tamanhoExtra + tamanhoComentario;
  }

  return arquivos;
}

/*
  Sonda da correção 3 da V2-F00-E12: a API real (Fastify) sobre PGlite, falando
  HTTP de verdade na porta abaixo, gera o laudo e o termo de interdição pela
  rota e pelo pacote, para cada estado da assinatura e das perdas, e grava os
  HTML para o diff. O leitor de ZIP acima é o da sonda da especificação
  (rodada 3), copiado.
*/
const OUT = process.argv[2]!;
mkdirSync(OUT, { recursive: true });
const PORTA = Number(process.env.PORTA ?? 55651);
const BASE = `http://127.0.0.1:${PORTA}`;
const SENHA = "defesa-civil-2026";
const SA = "11111111-1111-4111-8111-000000000001";
const VF = "22222222-2222-4222-8222-000000000002";
const C3 = "11111111-1111-4111-8111-0000000000c3";
const F1 = "11111111-1111-4111-8111-0000000000f1";
const ALFA = "11111111-1111-4111-8111-0000000000e1";
const BRAVO = "11111111-1111-4111-8111-0000000000e2";
const CH_FOTO = `tenant/${SA}/ocorrencias/${C3}/talude-fundos.jpg`;
const CH_ASS = `tenant/${SA}/ocorrencias/${C3}/assinatura-f1.png`;
const CH_AVULSA = `tenant/${SA}/ocorrencias/${C3}/avulsa-do-joao.jpg`;

const log: string[] = [];
const p = (s: string) => { log.push(s); console.log(s); };

const mem = await bancoEmMemoria({ semear: true });
const arm = armazenamentoEmMemoria({ baseUrl: BASE });
arm.guardar(CH_FOTO, Buffer.from("foto"), "image/jpeg");
arm.guardar(CH_ASS, Buffer.from("traco"), "image/png");
arm.guardar(CH_AVULSA, Buffer.from("avulsa"), "image/jpeg");
await mem.bruto.exec(`
  INSERT INTO evidencias (organizacao_id, ocorrencia_id, vistoria_id, chave_storage, legenda, capturada_em, ordem, tipo_conteudo, tamanho_bytes, enviada_em)
  VALUES ('${SA}', '${C3}', '${F1}', '${CH_FOTO}', 'Talude nos fundos', now() - interval '25 hours', 0, 'image/jpeg', 4, now() - interval '22 hours'),
         ('${SA}', '${C3}', NULL, '${CH_AVULSA}', 'Avulsa do Joao', now() - interval '3 hours', 9, 'image/jpeg', 6, now() - interval '2 hours');
  UPDATE vistorias SET assinatura_chave = '${CH_ASS}', equipe_designada_id = '${ALFA}', equipe_do_agente_id = '${BRAVO}',
         latitude = -22.9, longitude = -43.2 WHERE id = '${F1}';
`);

const config = carregarConfig({ NODE_ENV: "test", JWT_SEGREDO: "segredo-da-sonda-da-correcao-3-com-32+", LOGIN_POR_IP: "10000" } as NodeJS.ProcessEnv);
const app = await construirServidor({ banco: mem.banco, config, armazenamento: arm });
await app.listen({ port: PORTA, host: "127.0.0.1" });
p(`API ouvindo em ${BASE} (PGlite)`);

async function entrar(email: string) {
  const r = await fetch(`${BASE}/auth/entrar`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email, senha: SENHA }) });
  if (r.status !== 200) throw new Error(`login ${email}: ${r.status} ${await r.text()}`);
  return (await r.json()).acesso as string;
}
const adm = await entrar("rita.lopes@serraalta.exemplo.gov.br");
const coord = await entrar("helena.coutinho@serraalta.exemplo.gov.br");

async function rota(doc: string) {
  const r = await fetch(`${BASE}/documentos/${C3}/${doc}`, { headers: { authorization: `Bearer ${coord}` } });
  const t = await r.text();
  if (r.status !== 200) throw new Error(`rota ${doc}: ${r.status} ${t}`);
  return t;
}
async function pacote(token = adm) {
  const r = await fetch(`${BASE}/saida/pacote.zip`, { method: "POST", headers: { authorization: `Bearer ${token}` } });
  if (r.status !== 200) throw new Error(`pacote: ${r.status} ${await r.text()}`);
  return lerZip(Buffer.from(await r.arrayBuffer()));
}
const LAUDO = "documentos/000473-2026/laudo-de-vistoria.html";
const TERMO = "documentos/000473-2026/termo-de-interdicao.html";
function bloco(html: string, papel: string) {
  const i = html.indexOf(`<div class="papel">${papel}</div>`);
  if (i < 0) return "(sem bloco)";
  return html.slice(html.lastIndexOf('<div class="assinatura">', i), i).replace(/\s+/g, " ").trim();
}
/** O endereço da imagem difere por desenho (URL assinada na rota, caminho relativo no pacote). */
const semEndereco = (s: string) => s.replace(/src="[^"]*"/g, 'src="(endereço)"');
function perdidos(html: string) {
  const i = html.indexOf("<h2>Registros capturados que não puderam ser recuperados</h2>");
  if (i < 0) return "(sem seção)";
  return html.slice(i, html.indexOf("</ul>", i) + 5).replace(/\s+/g, " ").trim();
}
function salvar(nome: string, s: string) { writeFileSync(`${OUT}/${nome}`, s); }

/** Gera os quatro documentos do caso, grava e compara os blocos que importam. */
async function caso(nome: string) {
  const rl = await rota("laudo");
  const rt = await rota("termo-de-interdicao");
  const z = await pacote();
  const pl = z.get(LAUDO)!.toString("utf8");
  const pt = z.get(TERMO)!.toString("utf8");
  salvar(`${nome}-rota-laudo.html`, rl); salvar(`${nome}-pacote-laudo.html`, pl);
  salvar(`${nome}-rota-termo.html`, rt); salvar(`${nome}-pacote-termo.html`, pt);
  const [a, b, c, d] = [bloco(rl, "Presente no local"), bloco(pl, "Presente no local"),
    bloco(rt, "Responsável pelo imóvel, ciente"), bloco(pt, "Responsável pelo imóvel, ciente")];
  p(`${nome} laudo rota  : ${a}`);
  p(`${nome} laudo pacote: ${b}`);
  p(`${nome} laudo assinatura igual (fora o endereço da imagem): ${semEndereco(a) === semEndereco(b)}`);
  p(`${nome} termo rota  : ${c}`);
  p(`${nome} termo pacote: ${d}`);
  p(`${nome} termo assinatura igual (fora o endereço da imagem): ${semEndereco(c) === semEndereco(d)}`);
  p(`${nome} seção dos perdidos, laudo rota  : ${perdidos(rl)}`);
  p(`${nome} seção dos perdidos, laudo pacote: ${perdidos(pl)}`);
  p(`${nome} seção dos perdidos igual (laudo, termo): ${perdidos(rl) === perdidos(pl)}, ${perdidos(rt) === perdidos(pt)}`);
  return z;
}

// 1. PRESENTE: assinatura com arquivo no armazenamento, sem perda.
await caso("1-presente");

// 2. AUSENTE: vistoria sem assinatura, e nada registrado como perdido.
await mem.bruto.exec(`UPDATE vistorias SET assinatura_chave = NULL WHERE id = '${F1}'`);
await caso("2-ausente");

// 3. DECLARADA E SEM ARQUIVO no armazenamento.
await mem.bruto.exec(`UPDATE vistorias SET assinatura_chave = 'tenant/${SA}/ocorrencias/${C3}/assinatura-fantasma.png' WHERE id = '${F1}'`);
{
  const z = await caso("3-declarada-sem-arquivo");
  p("3 pendência escrita: " + /Assinatura ausente no armazenamento/.test(z.get("PENDENCIAS-DA-EXTRACAO.txt")!.toString("utf8")));
}

// 4. PERDIDA no aparelho: chave nula e a linha da perda com papel assinatura, mais uma foto perdida.
await mem.bruto.exec(`
  UPDATE vistorias SET assinatura_chave = NULL WHERE id = '${F1}';
  INSERT INTO vistoria_evidencias_perdidas (organizacao_id, vistoria_id, idempotency_key, papel, capturada_em, legenda, ordem)
  VALUES ('${SA}', '${F1}', 'coleta-f1-foto', 'foto', now() - interval '26 hours', 'Muro de arrimo que sumiu', 0),
         ('${SA}', '${F1}', 'coleta-f1-assinatura', 'assinatura', now() - interval '26 hours', NULL, 1);
`);
{
  const z = await caso("4-perdida");
  const csv = z.get("tabelas/vistoria_evidencias_perdidas.csv")!.toString("utf8");
  const [cab, ...linhas] = csv.trim().split(/\r?\n/);
  const campos = (l: string) => l.replace(/^\uFEFF/, "").split(/[;,]/).map((c) => c.replace(/^"|"$/g, ""));
  const col = campos(cab!).indexOf("papel");
  p("4 CSV do próprio pacote, linhas com papel assinatura: " + linhas.filter((l) => campos(l)[col] === "assinatura").length);
}

// 5. ARMAZENAMENTO SEM RESPOSTA na conferência (a assinatura de volta, a perda removida).
await mem.bruto.exec(`
  DELETE FROM vistoria_evidencias_perdidas WHERE idempotency_key = 'coleta-f1-assinatura';
  UPDATE vistorias SET assinatura_chave = '${CH_ASS}' WHERE id = '${F1}';
`);
{
  const d = arm.descrever; arm.descrever = async () => { throw new Error("fora do ar"); };
  const z = await caso("5-sem-resposta");
  p("5 pacote leva o arquivo: " + z.has("evidencias/000473-2026/assinatura-f1.png"));
  arm.descrever = d;
}

// 6. RE-VISTORIA: a perda da assinatura fica na ida anterior (F1); a vigente (F8) foi assinada.
await mem.bruto.exec(`
  UPDATE vistorias SET assinatura_chave = NULL WHERE id = '${F1}';
  INSERT INTO vistoria_evidencias_perdidas (organizacao_id, vistoria_id, idempotency_key, papel, capturada_em, legenda, ordem)
  VALUES ('${SA}', '${F1}', 'coleta-f1-assinatura', 'assinatura', now() - interval '26 hours', NULL, 1);
`);
{
  const F8 = "11111111-1111-4111-8111-0000000000f8";
  const CH_F8 = `tenant/${SA}/ocorrencias/${C3}/assinatura-f8.png`;
  arm.guardar(CH_F8, Buffer.from("traco-f8"), "image/png");
  const f1 = await mem.bruto.query<{ checklist: unknown }>(`SELECT checklist FROM vistorias WHERE id = '${F1}'`);
  await mem.bruto.query(
    `INSERT INTO vistorias (id, organizacao_id, ocorrencia_id, agente_id, checklist, gps_precisao_metros, assinante_nome, observacoes, coletada_em, sincronizada_em, idempotency_key, assinatura_chave)
     VALUES ('${F8}', '${SA}', '${C3}', '11111111-1111-4111-8111-0000000000d3', $1::jsonb, 4, 'Cleuza Ramos de Andrade', 'Re-vistoria', now() - interval '1 hour', now(), '11111111-1111-4111-8111-00000000ff02', '${CH_F8}')`,
    [JSON.stringify(f1.rows[0]!.checklist)],
  );
  await caso("6-revistoria");
}

// 7. ISOLAMENTO com controle positivo: uma perda em Vale Fundo aparece no pacote de Vale Fundo e não no de Serra Alta.
{
  const VFC = "22222222-2222-4222-8222-0000000000c1";
  const VFV = "22222222-2222-4222-8222-0000000000f9";
  await mem.bruto.exec(`
    UPDATE usuarios SET papel = 'administrador' WHERE id = '22222222-2222-4222-8222-0000000000d1';
    INSERT INTO vistorias (id, organizacao_id, ocorrencia_id, agente_id, checklist, gps_precisao_metros, assinante_nome, observacoes, coletada_em, sincronizada_em, idempotency_key)
    VALUES ('${VFV}', '${VF}', '${VFC}', '22222222-2222-4222-8222-0000000000d3', '[]'::jsonb, 5, 'Fulano', 'obs', now() - interval '2 hours', now() - interval '1 hour', '22222222-2222-4222-8222-00000000ff99');
    INSERT INTO vistoria_evidencias_perdidas (organizacao_id, vistoria_id, idempotency_key, papel, capturada_em, legenda, ordem)
    VALUES ('${VF}', '${VFV}', 'perda-de-vale-fundo', 'foto', now() - interval '2 hours', 'Perda exclusiva de Vale Fundo', 0);
  `);
  const vfAdm = await entrar("aurelio.machado@valefundo.exemplo.gov.br");
  const cita = (z: Map<string, Buffer>) => [...z.entries()]
    .filter(([c]) => !c.startsWith("esquema/"))
    .filter(([, b]) => b.toString("utf8").includes("Perda exclusiva de Vale Fundo")).map(([c]) => c);
  p("7 controle positivo, pacote de Vale Fundo cita a perda em: " + JSON.stringify(cita(await pacote(vfAdm))));
  p("7 pacote de Serra Alta cita a perda de Vale Fundo em: " + JSON.stringify(cita(await pacote())));
}

salvar("sonda-log.txt", log.join("\n") + "\n");
await app.close();
await mem.banco.encerrar();
p("API encerrada");
