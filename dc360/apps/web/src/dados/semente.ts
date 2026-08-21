import type { PGlite } from "@electric-sql/pglite";
import { PRAZO_PADRAO_HORAS, type Severidade, type TipoCobrade } from "@dc360/shared";

/**
 * Semeia dois municípios de propósito.
 *
 * Um município só esconderia o problema mais caro deste produto: dado de uma
 * prefeitura aparecer na tela de outra. Com dois, a troca de organização na
 * interface é uma demonstração de isolamento, não uma configuração.
 *
 * Todos os dados são fictícios. Nomes, endereços e coordenadas são de
 * exemplo, nunca de pessoas reais.
 */

const HORA = 3_600_000;

function horasAtras(h: number): Date {
  return new Date(Date.now() - h * HORA);
}

type SementeOcorrencia = {
  protocolo: string;
  tipo: TipoCobrade;
  status: string;
  severidade: Severidade | null;
  endereco: string;
  lat: number;
  lng: number;
  solicitante: string;
  contato: string;
  canal: string;
  descricao: string;
  abertaHaHoras: number;
  equipe?: string;
  vulneravel?: string;
  encerramento?: string;
};

const SERRA_ALTA: SementeOcorrencia[] = [
  {
    protocolo: "000471/2026", tipo: "deslizamento", status: "em_campo", severidade: "critica",
    endereco: "Rua das Acácias, 245, Morro do Cruzeiro", lat: -22.4187, lng: -45.4523,
    solicitante: "Marilda Souza Prado", contato: "(35) 99871-4402", canal: "telefone",
    descricao: "Talude atrás de duas casas cedeu depois da chuva da madrugada. Moradores relatam trinca nova na parede dos fundos e barulho de estalo.",
    abertaHaHoras: 3, equipe: "Equipe Alfa",
    vulneravel: "Idosa acamada e criança de 4 anos em uma das residências.",
  },
  {
    protocolo: "000472/2026", tipo: "alagamento", status: "triagem", severidade: "alta",
    endereco: "Avenida Beira Rio, 1180, Centro", lat: -22.4231, lng: -45.4491,
    solicitante: "Jonas Ferreira Lima", contato: "(35) 99612-8830", canal: "whatsapp",
    descricao: "Bueiro entupido, água entrando em três estabelecimentos comerciais. Nível cerca de 30 cm na calçada.",
    abertaHaHoras: 6,
  },
  {
    protocolo: "000473/2026", tipo: "colapso_edificacao", status: "vistoria_concluida", severidade: "alta",
    endereco: "Travessa São Benedito, 57, Vila Operária", lat: -22.4302, lng: -45.4610,
    solicitante: "Cleuza Ramos de Andrade", contato: "(35) 98844-2019", canal: "presencial",
    descricao: "Muro de arrimo de três metros com barriga aparente, encostado na área de serviço do vizinho.",
    abertaHaHoras: 28, equipe: "Equipe Bravo",
  },
  {
    protocolo: "000474/2026", tipo: "vendaval", status: "providencia_pendente", severidade: "media",
    endereco: "Rua Doutor Peixoto, 909, Jardim Bela Vista", lat: -22.4155, lng: -45.4402,
    solicitante: "Adenilson Barbosa", contato: "(35) 99205-7714", canal: "telefone",
    descricao: "Telhado de galpão desabou parcialmente sobre a via. Fiação de baixa tensão comprometida.",
    abertaHaHoras: 52, equipe: "Equipe Alfa",
  },
  {
    protocolo: "000475/2026", tipo: "enxurrada", status: "registrada", severidade: null,
    endereco: "Estrada do Retiro, km 4, zona rural", lat: -22.4498, lng: -45.4728,
    solicitante: "Sebastiana Alves Nogueira", contato: "(35) 99133-6621", canal: "telefone",
    descricao: "Ponte de madeira levada pela correnteza. Quatro famílias sem acesso pela via principal.",
    abertaHaHoras: 1,
  },
  {
    protocolo: "000476/2026", tipo: "incendio_urbano", status: "encerrada", severidade: "media",
    endereco: "Rua Coronel Amaral, 320, Centro", lat: -22.4210, lng: -45.4470,
    solicitante: "Regina Coeli Martins", contato: "(35) 99400-1122", canal: "telefone",
    descricao: "Princípio de incêndio em depósito de materiais recicláveis, já controlado pelo Corpo de Bombeiros.",
    abertaHaHoras: 96,
    encerramento: "Vistoria constatou estrutura íntegra e sem risco remanescente. Corpo de Bombeiros já havia extinguido o foco. Orientação de armazenamento entregue ao proprietário.",
  },
  {
    protocolo: "000477/2026", tipo: "granizo", status: "encerrada", severidade: "baixa",
    endereco: "Rua das Palmeiras, 88, Jardim Bela Vista", lat: -22.4142, lng: -45.4438,
    solicitante: "Elias Monteiro da Cruz", contato: "(35) 98700-5540", canal: "whatsapp",
    descricao: "Telhas quebradas em residência unifamiliar após chuva de granizo.",
    abertaHaHoras: 140,
    encerramento: "Dano restrito a cobertura, sem risco estrutural. Família encaminhada à Assistência Social para auxílio de material.",
  },
  {
    protocolo: "000478/2026", tipo: "inundacao", status: "em_campo", severidade: "alta",
    endereco: "Rua Ribeirão Fundo, 402, Bairro Nossa Senhora", lat: -22.4266, lng: -45.4555,
    solicitante: "Wanderley Pinto de Sá", contato: "(35) 99988-3301", canal: "telefone",
    descricao: "Córrego transbordou e atingiu o quintal de cinco residências. Moradores retirando móveis.",
    abertaHaHoras: 9, equipe: "Equipe Bravo",
    vulneravel: "Duas famílias com crianças pequenas, sem parentes na cidade para acolhimento.",
  },
];

const VALE_FUNDO: SementeOcorrencia[] = [
  {
    protocolo: "000112/2026", tipo: "deslizamento", status: "triagem", severidade: "alta",
    endereco: "Rua Nova Esperança, 15, Alto do Pinheiro", lat: -21.9880, lng: -45.2140,
    solicitante: "Teresinha Gomes Batista", contato: "(35) 99771-2288", canal: "telefone",
    descricao: "Escorregamento de solo no fundo do lote, cerca de dois metros de altura.",
    abertaHaHoras: 5,
  },
  {
    protocolo: "000113/2026", tipo: "alagamento", status: "registrada", severidade: null,
    endereco: "Praça Matriz, 2, Centro", lat: -21.9912, lng: -45.2098,
    solicitante: "Osvaldo Camargo Neto", contato: "(35) 99555-6612", canal: "presencial",
    descricao: "Acúmulo de água em frente ao posto de saúde após chuva forte.",
    abertaHaHoras: 2,
  },
];

async function inserirMunicipio(
  db: PGlite,
  nome: string,
  municipio: string,
  uf: string,
  equipes: Array<{ nome: string; especialidade: string }>,
  usuarios: Array<{ nome: string; matricula: string; email: string; papel: string; equipe?: string }>,
  ocorrencias: SementeOcorrencia[],
): Promise<void> {
  const org = await db.query<{ id: string }>(
    "INSERT INTO organizacoes (nome, municipio, uf) VALUES ($1,$2,$3) RETURNING id",
    [nome, municipio, uf],
  );
  const orgId = org.rows[0]!.id;

  const idEquipe = new Map<string, string>();
  for (const e of equipes) {
    const r = await db.query<{ id: string }>(
      "INSERT INTO equipes (organizacao_id, nome, especialidade) VALUES ($1,$2,$3) RETURNING id",
      [orgId, e.nome, e.especialidade],
    );
    idEquipe.set(e.nome, r.rows[0]!.id);
  }

  const idUsuario = new Map<string, string>();
  for (const u of usuarios) {
    const r = await db.query<{ id: string }>(
      `INSERT INTO usuarios (organizacao_id, nome, matricula, email, papel, equipe_id)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`,
      [orgId, u.nome, u.matricula, u.email, u.papel, u.equipe ? idEquipe.get(u.equipe) : null],
    );
    idUsuario.set(u.papel, r.rows[0]!.id);
  }

  const operador = usuarios.find((u) => u.papel === "operador")!;
  const coordenador = usuarios.find((u) => u.papel === "coordenador")!;
  const agente = usuarios.find((u) => u.papel === "agente_campo")!;

  let maiorSequencial = 0;

  for (const o of ocorrencias) {
    maiorSequencial = Math.max(maiorSequencial, Number(o.protocolo.slice(0, 6)));
    const aberta = horasAtras(o.abertaHaHoras);
    const prazo = o.severidade
      ? new Date(aberta.getTime() + PRAZO_PADRAO_HORAS[o.severidade] * HORA)
      : null;
    const encerradaEm = o.status === "encerrada" ? horasAtras(Math.max(0, o.abertaHaHoras - 20)) : null;

    const r = await db.query<{ id: string }>(
      `INSERT INTO ocorrencias
         (organizacao_id, protocolo, tipo, status, severidade, vulnerabilidade_presente,
          vulnerabilidade_descricao, endereco, latitude, longitude, solicitante_nome,
          solicitante_contato, canal_entrada, descricao, equipe_id, prazo_em, criado_em,
          encerrado_em, motivo_encerramento)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)
       RETURNING id`,
      [
        orgId, o.protocolo, o.tipo, o.status, o.severidade, !!o.vulneravel,
        o.vulneravel ?? null, o.endereco, o.lat, o.lng, o.solicitante,
        o.contato, o.canal, o.descricao, o.equipe ? idEquipe.get(o.equipe) : null,
        prazo, aberta, encerradaEm, o.encerramento ?? null,
      ],
    );
    const ocId = r.rows[0]!.id;

    const eventos: Array<[string, string, string, string, Date, unknown]> = [
      ["registro", operador.nome, "operador", "escritorio", aberta, { canal: o.canal }],
    ];
    if (o.severidade) {
      eventos.push([
        "triagem", coordenador.nome, "coordenador", "escritorio",
        new Date(aberta.getTime() + 0.4 * HORA), { severidade: o.severidade },
      ]);
    }
    if (o.equipe) {
      eventos.push([
        "despacho", coordenador.nome, "coordenador", "escritorio",
        new Date(aberta.getTime() + 0.8 * HORA), { equipe: o.equipe },
      ]);
    }
    if (o.status === "vistoria_concluida" || o.status === "providencia_pendente") {
      eventos.push([
        "vistoria", agente.nome, "agente_campo", "campo",
        new Date(aberta.getTime() + 3 * HORA), { origem: "coleta em campo" },
      ]);
    }
    if (encerradaEm) {
      eventos.push([
        "encerramento", coordenador.nome, "coordenador", "escritorio", encerradaEm,
        { motivo: o.encerramento },
      ]);
    }

    for (const [tipo, autorNome, papel, origem, quando, detalhe] of eventos) {
      await db.query(
        `INSERT INTO trilha_eventos
           (organizacao_id, ocorrencia_id, tipo, autor_id, autor_nome, autor_papel, origem, ocorrido_em, detalhe)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
        [orgId, ocId, tipo, idUsuario.get(papel) ?? null, autorNome, papel, origem, quando, JSON.stringify(detalhe)],
      );
    }

    if (o.status === "vistoria_concluida" || o.status === "providencia_pendente") {
      await db.query(
        `INSERT INTO vistorias
           (organizacao_id, ocorrencia_id, agente_id, checklist, gps_precisao_metros,
            assinante_nome, observacoes, coletada_em, idempotency_key)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8, gen_random_uuid())`,
        [
          orgId, ocId, idUsuario.get("agente_campo") ?? null,
          JSON.stringify([
            { chave: "risco_iminente", resposta: true },
            { chave: "evacuacao_necessaria", resposta: o.severidade === "critica" },
            { chave: "interdicao_indicada", resposta: true },
            { chave: "acionar_outro_orgao", resposta: true },
          ]),
          6.2, o.solicitante,
          "Vistoria realizada com o morador presente. Registro fotográfico anexado.",
          new Date(aberta.getTime() + 3 * HORA),
        ],
      );
    }
  }

  // A sequência de protocolo precisa continuar de onde a semente parou, senão
  // o primeiro registro novo colide com um número que já existe.
  await db.query(
    `INSERT INTO protocolo_sequencias (organizacao_id, ano, ultimo) VALUES ($1,$2,$3)
     ON CONFLICT (organizacao_id, ano) DO UPDATE SET ultimo = EXCLUDED.ultimo`,
    [orgId, new Date().getFullYear(), maiorSequencial],
  );
}

export async function semear(db: PGlite): Promise<void> {
  await inserirMunicipio(
    db,
    "Coordenadoria Municipal de Proteção e Defesa Civil de Serra Alta",
    "Serra Alta", "MG",
    [
      { nome: "Equipe Alfa", especialidade: "Vistoria geotécnica" },
      { nome: "Equipe Bravo", especialidade: "Alagamento e drenagem" },
      { nome: "Equipe Charlie", especialidade: "Plantão noturno" },
    ],
    [
      { nome: "Helena Vasques Coutinho", matricula: "SA-1042", email: "helena.coutinho@serraalta.exemplo.gov.br", papel: "coordenador" },
      { nome: "Jonas Ferreira", matricula: "SA-2211", email: "jonas.ferreira@serraalta.exemplo.gov.br", papel: "operador" },
      { nome: "Diego Nakamura Alves", matricula: "SA-3390", email: "diego.alves@serraalta.exemplo.gov.br", papel: "agente_campo", equipe: "Equipe Alfa" },
      { nome: "Rita Sampaio Lopes", matricula: "SA-3391", email: "rita.lopes@serraalta.exemplo.gov.br", papel: "administrador" },
    ],
    SERRA_ALTA,
  );

  await inserirMunicipio(
    db,
    "Coordenadoria Municipal de Proteção e Defesa Civil de Vale Fundo",
    "Vale Fundo", "MG",
    [{ nome: "Equipe Única", especialidade: "Atendimento geral" }],
    [
      { nome: "Aurélio Prates Machado", matricula: "VF-0101", email: "aurelio.machado@valefundo.exemplo.gov.br", papel: "coordenador" },
      { nome: "Simone Vieira da Paz", matricula: "VF-0102", email: "simone.paz@valefundo.exemplo.gov.br", papel: "operador" },
      { nome: "Tarcísio Bueno Ramos", matricula: "VF-0103", email: "tarcisio.ramos@valefundo.exemplo.gov.br", papel: "agente_campo", equipe: "Equipe Única" },
    ],
    VALE_FUNDO,
  );
}
