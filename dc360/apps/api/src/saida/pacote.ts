import { createHash } from "node:crypto";
import { carregarMigracoes } from "@dc360/db";
import { montarCsv } from "@dc360/shared";
import type { Banco, Consulta } from "../banco/tipos.js";
import type { Armazenamento } from "../armazenamento/tipos.js";
import {
  laudoDeVistoria, termoDeDesinterdicao, termoDeInterdicao, type DadosDocumento,
} from "../documentos/laudo.js";
import { oficioDeEncaminhamento, type DadosDoOficio } from "../oficios/documento.js";
import { escapar } from "../documentos/folha.js";
import type { EntradaZip } from "./zip.js";

/**
 * O pacote de saída de município: tudo que é do município, em formato aberto,
 * sem precisar do nosso software para ler.
 *
 * Existe porque um município que não consegue sair não escolheu ficar: ficou
 * preso. O procedimento está em `docs/SAIDA-DE-MUNICIPIO.md`, e até aqui ele
 * era um documento bonito sobre uma ferramenta que não existia; a extração
 * saía à mão, por quem tinha acesso ao servidor, e levava dias.
 *
 * O que o pacote tem, e por quê:
 *
 * - **Toda tabela em CSV e em JSON.** O CSV abre no Excel da prefeitura sem
 *   instalar nada; o JSON preserva o que o CSV achata (o checklist da vistoria
 *   e o detalhe da trilha são objetos aninhados, e viram texto ilegível numa
 *   célula).
 * - **Fotografias e assinaturas, em pastas por protocolo.** Prova técnica
 *   precisa do arquivo, não de uma miniatura nem de um link que expira.
 * - **Documentos gerados em HTML autossuficiente.** O estilo vai dentro do
 *   arquivo, então o laudo abre em qualquer navegador daqui a dez anos, sem
 *   servidor nenhum. As imagens apontam para a pasta de evidências do próprio
 *   pacote, e não para uma URL assinada, que morreria em trinta minutos.
 * - **Um índice na raiz.** Sem ele o município recebe dez mil arquivos e
 *   nenhuma forma de achar o de ontem, e essa é a diferença entre entregar os
 *   dados e entregar uma caixa de papel.
 */

/**
 * As tabelas que saem, e a ordem em que aparecem no índice.
 *
 * Lista explícita, e não "tudo que tem organizacao_id", porque as duas
 * respostas divergem e a divergência é o ponto: existe tabela com
 * `organizacao_id` que NÃO é do município (ver `TABELAS_QUE_NAO_SAEM`). O teste
 * `saida-de-municipio.test.ts` compara esta lista mais aquela com o que o banco
 * realmente tem, então uma migração nova que crie tabela obriga alguém a
 * decidir de qual lado ela fica, em vez de a tabela sumir da saída em silêncio.
 */
export const TABELAS_DA_SAIDA = [
  "organizacoes",
  "equipes",
  "usuarios",
  "ocorrencias",
  "vistorias",
  "vistoria_orgaos_indicados",
  /*
    O que foi capturado em campo e nao pode ser recuperado do aparelho
    (migracao 030).

    Sai, e a razao e a mesma que faz a linha existir: sem ela, o pacote entrega
    um registro fotografico com tres fotos e nada dizendo que havia cinco, que e
    exatamente o documento que parece completo e nao e. O municipio que levar os
    proprios dados embora precisa levar junto a declaracao do que faltou, senao
    a lacuna vira desleixo do agente aos olhos de quem abrir o arquivo daqui a
    dez anos.
  */
  "vistoria_evidencias_perdidas",
  /*
    As tarefas que venceram e voltaram para a coordenação (migração 028).

    Sai, e não é detalhe operacional: é a única memória de que uma equipe esteve
    designada, perdeu o prazo e explicou por quê. A ocorrência devolvida volta
    para a triagem e pode ser redespachada quantas vezes for, e o registro do
    despacho anterior fica só aqui e na trilha. Um município que levasse embora
    as ocorrências sem isto perderia a resposta para "por que ninguém foi lá no
    dia da chuva", que é exatamente a pergunta que o levaria a procurar o
    arquivo.
  */
  "devolucoes_de_tarefa",
  /*
    As saídas a campo declaradas pelos agentes (migração 031).

    Sai, e por uma razão diferente da de todas as outras desta lista: ela não é
    dado de cidadão, é o registro do que a prefeitura sabia sobre a segurança
    física do PRÓPRIO SERVIDOR, e do que ela fez quando um prazo de retorno
    estourou. É a prova que um município precisa ter na mão numa reclamação
    trabalhista ou numa apuração de acidente, e ela é justamente a que ele
    perderia sem perceber, porque a pergunta só aparece depois.
  */
  "saidas_a_campo",
  "evidencias",
  "providencias",
  "orgaos",
  "oficios",
  "oficio_envios",
  "oficio_aberturas",
  "oficio_sequencias",
  "avisos",
  "avisos_lidos",
  "aparelhos",
  "notificacoes_enviadas",
  "trilha_eventos",
  "trilha_administrativa",
  // Quem abriu o dossiê de qual família, e para quê. É do município: é a
  // resposta dele quando um cidadão pergunta quem viu os dados dele, e sem
  // levar isso embora ele perde a capacidade de responder no dia seguinte à
  // saída.
  "ocorrencia_consultas",
  "exportacoes",
  "protocolo_sequencias",
  /*
    O resumo diário que o município escreve sobre si mesmo (migração 023).

    Sai, e a razão não é "porque tem `organizacao_id`". É que a minimização por
    prazo (migração 021) apaga o detalhe das ocorrências antigas, e quando ela
    apaga, esta série de contagens vira o único registro que sobra de quanto o
    município trabalhou naquele ano. Deixar ela para trás entregaria ao
    município um arquivo sem a única memória agregada da própria operação, que
    é justamente o que se leva para uma prestação de contas ou para a defesa de
    um orçamento.

    Não carrega segredo nem dado de pessoa: só contagem, mediana e marca de
    tempo, e o portão de privilégio em `db/test/isolamento.test.ts` cobra isso
    do catálogo.
  */
  "metricas_municipio",
  /*
    A lista de objetos de armazenamento que ninguém soube justificar, e o que
    foi decidido sobre cada um (migração 035).

    Sai, e a razão é a mesma que faz `vistoria_evidencias_perdidas` sair: o
    município precisa levar embora a explicação das LACUNAS, e não só o que
    sobrou. Sem esta lista, o pacote entrega um conjunto de fotografias e nada
    dizendo que houve arquivos propostos para descarte, quais, quando e por
    decisão de quem. Daqui a dez anos, a diferença entre "esta vistoria nunca
    teve foto" e "a foto foi descartada em tal data, por tal pessoa, com este
    motivo escrito" é a diferença entre desleixo e procedimento.

    Não carrega dado de pessoa: chave de objeto, tamanho, data, espécie e o
    nome de quem decidiu, que é servidor do fornecedor e não cidadão.
  */
  "objetos_orfaos",
] as const;

/**
 * O que NÃO sai, e o motivo de cada uma. Sem o motivo escrito, a lista vira
 * uma lista de esquecimentos com cara de decisão.
 */
export const TABELAS_QUE_NAO_SAEM: Record<string, string> = {
  // Hash de token de renovação. É material de credencial viva, e entregar isso
  // num pacote que vai por email ou pen drive é entregar sessão aberta. Além
  // do mais, sessão é do sistema que o município está deixando: não há o que
  // migrar dali.
  sessoes: "material de credencial: hash de token de sessão",
  // Idem, e pior: cada linha viva é um link que redefine a senha de uma conta.
  recuperacoes_senha: "material de credencial: hash de link de redefinição",
  // Não é do município. É o formulário de contato que alguém preencheu no site
  // do fornecedor, e ele não tem contexto de tenant nenhum.
  interesse_municipio: "não pertence ao município: pedido de contato do site",
  /*
    O segredo da verificação em duas etapas, cifrado, e os resumos dos códigos
    de recuperação (migração 022).

    Não saem pela mesma razão das sessões, e por uma a mais. A razão comum: é
    material de credencial viva, e este pacote é o arquivo do produto que mais
    viaja (email, pen drive, pasta compartilhada, e depois fica guardado para
    sempre numa prefeitura). A razão a mais: o segredo só tem valor com a chave
    de cifra do servidor de origem, que o município não leva nem pode levar,
    então o que sairia seria um envelope inútil para quem recebe e perigoso
    para quem guarda.

    O que o município PRECISA levar sobre isto, ele leva: cada ativação e cada
    desligamento estão na `trilha_administrativa`, que sai inteira. A pergunta
    "esta conta tinha segunda etapa, e desde quando" continua tendo resposta do
    outro lado.
  */
  segundo_fator: "material de credencial: segredo cifrado do segundo fator",
  segundo_fator_recuperacao: "material de credencial: resumo dos códigos de recuperação",
  /*
    O livro de eliminações do fornecedor (migração 038).

    Não sai, e não por ser segredo: é o registro que a seção 3 de
    `docs/SAIDA-DE-MUNICIPIO.md` diz que FICA CONOSCO depois do passo 6 ("o
    município existiu e saiu, com as datas"). Ele não tem chave estrangeira
    para `organizacoes` de propósito, porque a organização some e o livro fica,
    e quem o lê é o console do fornecedor: o papel de aplicação que monta este
    pacote não tem SELECT nele. Colocá-lo na lista de saída produziria um
    arquivo vazio, ou um erro de permissão no meio do pacote, e os dois
    mentiriam sobre o que o município leva.

    O que o município precisa saber sobre a própria eliminação, ele lê na
    `trilha_administrativa`, que sai inteira: a suspensão, o agendamento e o
    cancelamento gravam linha lá, com quem e por quê.
  */
  eliminacoes_de_municipio:
    "livro do fornecedor: registro de que o município existiu e saiu, que fica conosco (seção 3 do plano de saída)",
};

/**
 * Colunas que nunca saem, mesmo em tabela que sai.
 *
 * Um pacote de saída é o arquivo deste produto que mais viaja: ele vai por
 * email, por pen drive, por pasta compartilhada, e fica guardado para sempre
 * numa prefeitura. Segredo que entra aqui é segredo publicado.
 */
export const COLUNAS_QUE_NUNCA_SAEM: Record<string, readonly string[]> = {
  // A senha do servidor público. Derivada com custo alto, e ainda assim: um
  // hash entregue é um hash que alguém pode atacar offline pelo tempo que
  // quiser, e servidor público reusa senha como todo mundo.
  usuarios: ["senha_hash"],
  // A ficha de push. Quem a tem escreve na tela bloqueada de um agente de
  // Defesa Civil, e uma ordem falsa de evacuação escrita ali é dano na rua.
  aparelhos: ["ficha"],
  // Hash do link de uso único do ofício.
  oficio_envios: ["token_hash"],
};

type LinhaOcorrencia = {
  id: string;
  protocolo: string;
  tipo: DadosDocumento["ocorrencia"]["tipo"];
  tipo_descricao: string | null;
  status: string;
  severidade: DadosDocumento["ocorrencia"]["severidade"];
  endereco: string;
  latitude: number | null;
  longitude: number | null;
  solicitante_nome: string;
  solicitante_contato: string | null;
  canal_entrada: string;
  descricao: string;
  vulnerabilidade_presente: boolean;
  vulnerabilidade_descricao: string | null;
  criado_em: string;
  equipe_nome: string | null;
  interditada_em: string | null;
  desinterditada_em: string | null;
  desinterdicao_motivo: string | null;
  desinterditada_por_nome: string | null;
};

type LinhaVistoria = DadosDocumento["vistoria"] & {
  ocorrencia_id: string;
  assinatura_chave: string | null;
};

type LinhaOficio = DadosDoOficio["oficio"]
  & DadosDoOficio["ocorrencia"]
  & {
    ocorrencia_id: string;
    orgao_nome: string;
    orgao_sigla: string | null;
    providencia_descricao: string;
    responsavel: string;
    prazo_em: string;
    encaminhada_em: string;
  };

type LinhaEvidencia = {
  ocorrencia_id: string;
  chave_storage: string;
  legenda: string | null;
  capturada_em: string;
  ordem: number;
};

/** A foto de perfil de um servidor, como sai do cadastro. */
type LinhaFotoDeServidor = {
  matricula: string;
  nome: string;
  foto_chave: string;
};

/** Uma linha do índice: é ela que liga protocolo a pasta, documento e CSV. */
type ItemDoIndice = {
  protocolo: string;
  pasta: string;
  tipo: string;
  status: string;
  endereco: string;
  criadoEm: string;
  linhaNoCsv: number;
  documentos: string[];
  evidencias: string[];
};

export type OpcoesDoPacote = {
  banco: Banco;
  armazenamento: Armazenamento;
  organizacaoId: string;
  /** Quem pediu a saída, para o cabeçalho do LEIA-ME e dos documentos. */
  emitidoPor: string;
  marcaDagua?: string;
  agora?: Date;
};

/**
 * Protocolo vira nome de pasta.
 *
 * `000471/2026` tem barra, e barra em nome de pasta cria dois níveis (ou
 * simplesmente não extrai, no Windows). O índice guarda os dois valores, o
 * protocolo de verdade e a pasta, justamente para que ninguém precise adivinhar
 * a conversão.
 */
export function pastaDoProtocolo(protocolo: string): string {
  return protocolo.replace(/[^a-zA-Z0-9._-]/g, "-");
}

/** O último pedaço da chave de armazenamento, que já nasce higienizado. */
function nomeDoArquivo(chave: string, alternativa: string): string {
  const bruto = chave.split("/").pop() ?? "";
  const limpo = bruto.replace(/[^a-zA-Z0-9._-]/g, "_");
  return limpo.length > 0 ? limpo : alternativa;
}

/**
 * Valor de banco virando célula de planilha.
 *
 * Data em ISO 8601, e não no formato brasileiro que o resto do produto usa nos
 * relatórios: este arquivo não é o relatório que vai à câmara, é o despejo
 * fiel que alguém vai usar para migrar os dados para outro sistema. Ali
 * `22/08/2026 01:49` sem fuso é ambíguo, e ambiguidade de fuso num carimbo de
 * vistoria muda o dia em que o ato aconteceu.
 */
function celula(valor: unknown): string {
  if (valor === null || valor === undefined) return "";
  if (valor instanceof Date) return valor.toISOString();
  if (typeof valor === "object") return JSON.stringify(valor);
  return String(valor);
}

async function colunasDe(c: Consulta, tabela: string): Promise<string[]> {
  const r = await c.query<{ column_name: string }>(
    `SELECT column_name FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = $1
      ORDER BY ordinal_position`,
    [tabela],
  );
  const proibidas = new Set(COLUNAS_QUE_NUNCA_SAEM[tabela] ?? []);
  return r.rows.map((l) => l.column_name).filter((n) => !proibidas.has(n));
}

/** Identificador citado, para o nome vindo do catálogo nunca virar SQL. */
function citar(nome: string): string {
  return `"${nome.replace(/"/g, '""')}"`;
}

export async function* montarPacoteDeSaida(
  opcoes: OpcoesDoPacote,
): AsyncGenerator<EntradaZip> {
  const { banco, armazenamento, organizacaoId, emitidoPor } = opcoes;
  const agora = opcoes.agora ?? new Date();
  /** O banco referia, e o armazenamento RESPONDEU que não tem. */
  const pendencias: string[] = [];
  /*
    O banco referia, e ninguém conseguiu dizer se existe.

    LISTA SEPARADA, e essa separação é o defeito inteiro. As duas caíam na
    mesma lista e saíam impressas sob "estes arquivos NÃO foram encontrados no
    armazenamento", que é uma AFIRMAÇÃO sobre o mundo. Um pico de limite de
    taxa (429), um 503 do provedor ou uma conexão cortada faziam o pacote
    declarar inexistente uma fotografia que existe, com soma de verificação ao
    lado dando aparência de conferência feita. E o passo 6 do procedimento (a
    eliminação das nossas cópias) acontece DEPOIS da conferência do município,
    sem volta: o produto destruiria prova no dia em que está provando que não
    aprisiona ninguém.
  */
  const naoLidos: string[] = [];

  /**
   * Uma leitura de armazenamento que nunca vira "não existe" por engano.
   *
   * O `try` aqui é a última rede: uma implementação de `Armazenamento` que
   * lance em vez de devolver `falha` não pode derrubar a extração inteira, e
   * também não pode virar `ausente`. Antes desta correção o ponto de chamada
   * fazia `.catch(() => null)`, e esse `null` era indistinguível do 404.
   */
  async function ler(a: Armazenamento, chave: string) {
    try {
      return await a.baixar(chave);
    } catch (erro) {
      return {
        situacao: "falha" as const,
        motivo: erro instanceof Error ? erro.message : String(erro),
        tentativas: 1,
      };
    }
  }

  /** Manda a falta para a lista certa, e escreve a verdade sobre o que houve. */
  function registrarFalta(
    resultado: { situacao: "ausente" } | { situacao: "falha"; motivo: string; tentativas: number },
    oQue: string,
    protocolo: string,
    chave: string,
  ): void {
    if (resultado.situacao === "ausente") {
      pendencias.push(`${oQue} ausente no armazenamento: protocolo ${protocolo}, chave ${chave}`);
      return;
    }
    naoLidos.push(
      `${oQue} NÃO LIDA: protocolo ${protocolo}, chave ${chave}. `
      + `O armazenamento não respondeu depois de ${resultado.tentativas} tentativa(s): `
      + `${resultado.motivo}. Isto NÃO quer dizer que o arquivo não exista.`,
    );
  }
  const somas: Array<{ caminho: string; sha256: string }> = [];

  /** Toda entrada passa por aqui, para a soma de verificação sair de graça. */
  function entrada(e: EntradaZip): EntradaZip {
    somas.push({
      caminho: e.caminho,
      sha256: createHash("sha256").update(e.conteudo).digest("hex"),
    });
    return { modificadoEm: agora, ...e };
  }

  const texto = (s: string) => new TextEncoder().encode(s);

  /*
    TODA a leitura de banco acontece numa transação só, e ela fecha ANTES de o
    primeiro byte de fotografia ser buscado.

    O motivo é o isolamento, e ele é concreto: a conexão que carrega o
    `SET LOCAL` do município não pode ficar retida enquanto o servidor baixa
    dez mil imagens de um armazenamento remoto. Em desenvolvimento o banco tem
    uma conexão só, então isso travaria o produto inteiro pela duração da
    extração; em produção seria uma conexão do pool presa por horas.
  */
  const dados = await banco.comTenant(organizacaoId, async (c) => {
    const tabelas: Array<{ nome: string; colunas: string[]; linhas: Record<string, unknown>[] }> = [];

    for (const tabela of TABELAS_DA_SAIDA) {
      const colunas = await colunasDe(c, tabela);
      if (colunas.length === 0) continue;
      /*
        `ocorrencias` sai ordenada por protocolo porque é dela que o índice tira
        o número da linha. As outras saem por identificador, que é estável entre
        duas extrações: sem ordem explícita o Postgres devolve o que der, e duas
        extrações do mesmo município produziriam arquivos diferentes, o que
        atrapalha justamente a conferência do passo 5 do procedimento.
      */
      const ordem = tabela === "ocorrencias"
        ? "protocolo"
        : colunas.includes("id") ? "id" : "1, 2";
      const r = await c.query<Record<string, unknown>>(
        `SELECT ${colunas.map(citar).join(", ")} FROM ${citar(tabela)} ORDER BY ${ordem}`,
      );
      tabelas.push({ nome: tabela, colunas, linhas: r.rows });
    }

    const organizacao = await c.query<{ nome: string; municipio: string; uf: string }>(
      "SELECT nome, municipio, uf FROM organizacoes WHERE id = $1",
      [organizacaoId],
    );

    const ocorrencias = await c.query<LinhaOcorrencia>(
      `SELECT o.id, o.protocolo, o.tipo, o.tipo_descricao, o.status, o.severidade,
              o.endereco, o.latitude, o.longitude, o.solicitante_nome,
              o.solicitante_contato, o.canal_entrada, o.descricao,
              o.vulnerabilidade_presente, o.vulnerabilidade_descricao,
              o.criado_em, e.nome AS equipe_nome,
              o.interditada_em, o.desinterditada_em, o.desinterdicao_motivo,
              u.nome AS desinterditada_por_nome
         FROM ocorrencias o
         LEFT JOIN equipes e ON e.id = o.equipe_id
         LEFT JOIN usuarios u ON u.id = o.desinterditada_por
        ORDER BY o.protocolo`,
    );

    /*
      Uma vistoria por ocorrência, a VIGENTE, escolhida pela mesma regra da
      rota de documentos: a última que o SERVIDOR recebeu, e não a que se diz
      ter acontecido por último. `coletada_em` é o relógio de um celular e pode
      vir adiantado; `sincronizada_em` é `now()` do banco. Divergir dessa regra
      aqui faria o laudo do pacote contradizer o laudo que a prefeitura já tem
      impresso e anexado a processo.
    */
    const vistorias = await c.query<LinhaVistoria>(
      `SELECT DISTINCT ON (v.ocorrencia_id)
              v.id, v.ocorrencia_id, v.checklist, v.gps_precisao_metros,
              v.assinante_nome, v.observacoes, v.coletada_em, v.sincronizada_em,
              v.assinatura_chave, v.desalojados, v.desabrigados, v.feridos,
              v.desaparecidos, v.obitos,
              u.nome AS agente_nome, u.matricula AS agente_matricula,
              EXISTS (
                SELECT 1 FROM trilha_eventos t
                 WHERE t.ocorrencia_id = v.ocorrencia_id
                   AND t.tipo = 'vistoria_sem_despacho'
                   AND t.detalhe ->> 'vistoriaId' = v.id::text
              ) AS sem_despacho
         FROM vistorias v LEFT JOIN usuarios u ON u.id = v.agente_id
        ORDER BY v.ocorrencia_id, v.sincronizada_em DESC, v.coletada_em DESC`,
    );
    /*
      `sem_despacho` é a mesma marca, lida do mesmo lugar que a rota de
      documentos lê (o evento da trilha apontando para esta vistoria, e não a
      coluna nula, que é o normal de toda vistoria anterior à migração 024).
      O laudo do pacote precisa dizer o que o laudo emitido diz: uma coleta que
      chegou sem despacho não pode virar um papel limpo só porque saiu na
      exportação.
    */

    const indicados = await c.query<{ vistoria_id: string; nome: string; sigla: string | null }>(
      `SELECT i.vistoria_id, i.nome, g.sigla
         FROM vistoria_orgaos_indicados i
         LEFT JOIN orgaos g ON g.id = i.orgao_id
        ORDER BY i.vistoria_id, i.ordem, i.criado_em, i.id`,
    );

    /*
      Os ofícios, com tudo que o documento imprime.

      Ligados à providência, e não à ocorrência: um protocolo pode ter
      encaminhado ao Corpo de Bombeiros e à companhia de energia, e cada
      encaminhamento tem número próprio. Juntar os dois num documento só faria
      o município levar embora um papel que nunca existiu.
    */
    const oficios = await c.query<LinhaOficio>(
      `SELECT f.id, f.numero, f.observacoes, f.emitido_em, f.emitido_por_nome,
              f.ocorrencia_id, g.nome AS orgao_nome, g.sigla AS orgao_sigla,
              o.protocolo, o.tipo, o.endereco, o.ponto_referencia, o.descricao,
              o.solicitante_nome, o.severidade, o.vulnerabilidade_presente,
              o.vulnerabilidade_descricao, o.interditada_em,
              p.descricao AS providencia_descricao, p.responsavel,
              p.prazo_em, p.encaminhada_em
         FROM oficios f
         JOIN orgaos g ON g.id = f.orgao_id
         JOIN ocorrencias o ON o.id = f.ocorrencia_id
         JOIN providencias p ON p.id = f.providencia_id
        ORDER BY f.numero`,
    );

    const evidencias = await c.query<LinhaEvidencia>(
      `SELECT ocorrencia_id, chave_storage, legenda, capturada_em, ordem
         FROM evidencias
        WHERE enviada_em IS NOT NULL
        ORDER BY ocorrencia_id, ordem, capturada_em`,
    );

    /*
      A foto de perfil de cada servidor (migração 040). É dado pessoal do
      SERVIDOR, escolhido por ele, e pertence ao município que o cadastrou:
      `docs/PRIVACIDADE.md` (seção 2.2) promete que ela sai com a conta e entra
      no pacote de saída, e esta consulta é a segunda metade da promessa. Sai
      por matrícula, e não por nome, porque matrícula é o identificador
      funcional que o município usa e nome se repete.
    */
    const fotosDeServidor = await c.query<LinhaFotoDeServidor>(
      `SELECT matricula, nome, foto_chave
         FROM usuarios
        WHERE foto_chave IS NOT NULL
        ORDER BY matricula`,
    );

    return {
      tabelas,
      organizacao: organizacao.rows[0] ?? { nome: "", municipio: "", uf: "" },
      ocorrencias: ocorrencias.rows,
      vistorias: vistorias.rows,
      indicados: indicados.rows,
      oficios: oficios.rows,
      evidencias: evidencias.rows,
      fotosDeServidor: fotosDeServidor.rows,
    };
  });

  const municipio = `${dados.organizacao.municipio}/${dados.organizacao.uf}`;

  yield entrada({
    caminho: "LEIA-ME.txt",
    conteudo: texto(leiaMe({
      municipio,
      organizacao: dados.organizacao.nome,
      emitidoPor,
      agora,
      totalOcorrencias: dados.ocorrencias.length,
    })),
  });

  /*
    O esquema do banco, em SQL comentado.

    São as próprias migrações, e não um `pg_dump`: elas carregam o comentário
    que explica POR QUE cada coluna existe e por que cada restrição está lá.
    Quem for migrar para outro sistema precisa disso mais do que do DDL cru,
    que diz o que a coluna é e nada sobre o que ela significa.

    Falha de leitura não derruba a extração: vira pendência escrita. O pacote
    sem o esquema continua sendo os dados do município; o pacote que não sai
    não é nada.
  */
  try {
    for (const migracao of carregarMigracoes()) {
      yield entrada({
        caminho: `esquema/${migracao.versao}`,
        conteudo: texto(migracao.sql),
      });
    }
  } catch (erro) {
    pendencias.push(
      `Esquema do banco não pôde ser lido nesta instalação: ${(erro as Error).message}. `
      + "O conteúdo está em db/migrations no repositório do produto.",
    );
  }

  for (const t of dados.tabelas) {
    yield entrada({
      caminho: `tabelas/${t.nome}.csv`,
      conteudo: texto(montarCsv(
        t.colunas,
        t.linhas.map((linha) => t.colunas.map((coluna) => celula(linha[coluna]))),
      )),
    });
    yield entrada({
      caminho: `tabelas/${t.nome}.json`,
      conteudo: texto(`${JSON.stringify(t.linhas, null, 2)}\n`),
    });
  }

  // Índice montado enquanto os arquivos são emitidos, e não prometido antes:
  // assim ele lista o que REALMENTE entrou no pacote, inclusive quando uma
  // fotografia falta no armazenamento.
  const indice: ItemDoIndice[] = [];
  const porOcorrencia = new Map<string, ItemDoIndice>();

  dados.ocorrencias.forEach((o, posicao) => {
    const item: ItemDoIndice = {
      protocolo: o.protocolo,
      pasta: pastaDoProtocolo(o.protocolo),
      tipo: o.tipo,
      status: o.status,
      endereco: o.endereco,
      criadoEm: celula(o.criado_em),
      // Linha 1 é o cabeçalho, então a primeira ocorrência está na linha 2.
      linhaNoCsv: posicao + 2,
      documentos: [],
      evidencias: [],
    };
    indice.push(item);
    porOcorrencia.set(o.id, item);
  });

  const vistoriaPorOcorrencia = new Map(dados.vistorias.map((v) => [v.ocorrencia_id, v]));
  const indicadosPorVistoria = new Map<string, Array<{ nome: string; sigla: string | null }>>();
  for (const i of dados.indicados) {
    const lista = indicadosPorVistoria.get(i.vistoria_id) ?? [];
    lista.push({ nome: i.nome, sigla: i.sigla });
    indicadosPorVistoria.set(i.vistoria_id, lista);
  }

  const evidenciasPorOcorrencia = new Map<string, LinhaEvidencia[]>();
  for (const e of dados.evidencias) {
    const lista = evidenciasPorOcorrencia.get(e.ocorrencia_id) ?? [];
    lista.push(e);
    evidenciasPorOcorrencia.set(e.ocorrencia_id, lista);
  }

  for (const ocorrencia of dados.ocorrencias) {
    const item = porOcorrencia.get(ocorrencia.id)!;
    const vistoria = vistoriaPorOcorrencia.get(ocorrencia.id);
    if (!vistoria) continue;

    const fotos = (evidenciasPorOcorrencia.get(ocorrencia.id) ?? []).map((e, i) => ({
      // Caminho RELATIVO, saindo de `documentos/<pasta>/`. É o que faz o laudo
      // continuar mostrando as fotos depois de o pacote ser extraído numa
      // pasta qualquer, sem servidor e sem internet.
      url: `../../evidencias/${item.pasta}/${nomeDoArquivo(e.chave_storage, `foto-${i + 1}.jpg`)}`,
      legenda: e.legenda,
      capturadaEm: e.capturada_em,
    }));

    const assinaturaUrl = vistoria.assinatura_chave
      ? `../../evidencias/${item.pasta}/${nomeDoArquivo(vistoria.assinatura_chave, "assinatura.png")}`
      : null;

    const base: DadosDocumento = {
      organizacao: dados.organizacao,
      ocorrencia: { ...ocorrencia, id: ocorrencia.id },
      vistoria: {
        ...vistoria,
        assinaturaUrl,
        orgaosIndicados: indicadosPorVistoria.get(vistoria.id) ?? [],
      },
      fotos,
      emitidoPor,
      emitidoEm: agora,
      ...(opcoes.marcaDagua ? { marcaDagua: opcoes.marcaDagua } : {}),
    };

    yield entrada({
      caminho: `documentos/${item.pasta}/laudo-de-vistoria.html`,
      conteudo: texto(laudoDeVistoria(base)),
    });
    item.documentos.push(`documentos/${item.pasta}/laudo-de-vistoria.html`);

    /*
      O termo sai quando o imóvel FOI interditado, e não quando a vistoria
      indicou interdição.

      A diferença tem consequência: a rota de emissão recusa emitir termo sobre
      vistoria que não indicou, e é ela que interdita. Aqui o pacote está
      reproduzindo o que ACONTECEU, e o que aconteceu está em `interditada_em`.
      Gerar pelo indicativo produziria, no pacote de saída, termo de interdição
      de imóvel que nunca foi interditado.
    */
    if (ocorrencia.interditada_em) {
      yield entrada({
        caminho: `documentos/${item.pasta}/termo-de-interdicao.html`,
        conteudo: texto(termoDeInterdicao(base)),
      });
      item.documentos.push(`documentos/${item.pasta}/termo-de-interdicao.html`);
    }

    if (ocorrencia.desinterditada_em && ocorrencia.interditada_em) {
      yield entrada({
        caminho: `documentos/${item.pasta}/termo-de-desinterdicao.html`,
        conteudo: texto(termoDeDesinterdicao({
          ...base,
          desinterdicao: {
            em: ocorrencia.desinterditada_em,
            motivo: ocorrencia.desinterdicao_motivo ?? "",
            porNome: ocorrencia.desinterditada_por_nome ?? "Coordenação",
            interditadaEm: ocorrencia.interditada_em,
            /*
              A vistoria do pacote é a vigente. Ela é a re-vistoria que
              motivou o levantamento quando foi recebida DEPOIS da interdição;
              senão, o levantamento foi sem vistoria nova e o termo diz isso
              em vez de imprimir o checklist que interditou.
            */
            comNovaVistoria:
              new Date(vistoria.sincronizada_em).getTime()
                > new Date(ocorrencia.interditada_em).getTime(),
          },
        })),
      });
      item.documentos.push(`documentos/${item.pasta}/termo-de-desinterdicao.html`);
    }
  }

  /*
    Os ofícios saem em laço próprio, e não dentro do laço de laudo.

    A razão é que ofício NÃO depende de vistoria: a coordenação encaminha à
    companhia de energia antes de qualquer agente chegar ao local. Gerar dentro
    do outro laço deixaria de fora justamente o ofício das ocorrências que
    ainda não foram vistoriadas, que são as mais urgentes.
  */
  for (const oficio of dados.oficios) {
    const item = porOcorrencia.get(oficio.ocorrencia_id);
    if (!item) continue;
    const arquivo = `documentos/${item.pasta}/oficio-${pastaDoProtocolo(oficio.numero)}.html`;
    yield entrada({
      caminho: arquivo,
      conteudo: texto(oficioDeEncaminhamento({
        organizacao: dados.organizacao,
        orgao: { nome: oficio.orgao_nome, sigla: oficio.orgao_sigla },
        oficio: {
          id: oficio.id,
          numero: oficio.numero,
          observacoes: oficio.observacoes,
          emitido_em: oficio.emitido_em,
          emitido_por_nome: oficio.emitido_por_nome,
        },
        ocorrencia: {
          protocolo: oficio.protocolo,
          tipo: oficio.tipo,
          endereco: oficio.endereco,
          ponto_referencia: oficio.ponto_referencia,
          descricao: oficio.descricao,
          solicitante_nome: oficio.solicitante_nome,
          severidade: oficio.severidade,
          vulnerabilidade_presente: oficio.vulnerabilidade_presente,
          vulnerabilidade_descricao: oficio.vulnerabilidade_descricao,
          interditada_em: oficio.interditada_em,
        },
        providencia: {
          descricao: oficio.providencia_descricao,
          responsavel: oficio.responsavel,
          prazo_em: oficio.prazo_em,
          encaminhada_em: oficio.encaminhada_em,
        },
        ...(opcoes.marcaDagua ? { marcaDagua: opcoes.marcaDagua } : {}),
      })),
    });
    item.documentos.push(arquivo);
  }

  /*
    As fotografias, uma a uma, com o banco já liberado.

    Falta de arquivo NÃO derruba a extração: ela entra em
    `PENDENCIAS-DA-EXTRACAO.txt`. O município precisa saber exatamente o que
    não veio, porque é ele quem confere no passo 5 do procedimento e é a
    confirmação dele que autoriza apagar o nosso lado. Abortar tudo por causa
    de um objeto ausente deixaria o município sem pacote nenhum.
  */
  for (const ocorrencia of dados.ocorrencias) {
    const item = porOcorrencia.get(ocorrencia.id)!;
    const lista = evidenciasPorOcorrencia.get(ocorrencia.id) ?? [];

    for (let i = 0; i < lista.length; i += 1) {
      const e = lista[i]!;
      const nome = nomeDoArquivo(e.chave_storage, `foto-${i + 1}.jpg`);
      const objeto = await ler(armazenamento, e.chave_storage);
      if (objeto.situacao !== "encontrado") {
        registrarFalta(objeto, "Fotografia", ocorrencia.protocolo, e.chave_storage);
        continue;
      }
      yield entrada({
        caminho: `evidencias/${item.pasta}/${nome}`,
        conteudo: objeto.corpo,
        // Já é JPEG ou PNG: o deflate só gastaria processador para crescer.
        comprimir: false,
      });
      item.evidencias.push(`evidencias/${item.pasta}/${nome}`);
    }

    const vistoria = vistoriaPorOcorrencia.get(ocorrencia.id);
    if (vistoria?.assinatura_chave) {
      const nome = nomeDoArquivo(vistoria.assinatura_chave, "assinatura.png");
      const objeto = await ler(armazenamento, vistoria.assinatura_chave);
      if (objeto.situacao === "encontrado") {
        yield entrada({
          caminho: `evidencias/${item.pasta}/${nome}`,
          conteudo: objeto.corpo,
          comprimir: false,
        });
        item.evidencias.push(`evidencias/${item.pasta}/${nome}`);
      } else {
        registrarFalta(objeto, "Assinatura", ocorrencia.protocolo, vistoria.assinatura_chave);
      }
    }
  }

  /*
    As fotos de perfil dos servidores, uma por pessoa, na pasta `usuarios/`.

    Separadas de `evidencias/` de propósito: não são prova de ocorrência
    nenhuma, e misturá-las com fotografia de vistoria faria o retrato de um
    servidor parecer registro de um imóvel. Falta de arquivo entra em
    `PENDENCIAS-DA-EXTRACAO.txt` como qualquer outra, com a matrícula no lugar
    do protocolo, porque é a matrícula que identifica de quem era a foto.
  */
  for (const servidor of dados.fotosDeServidor) {
    const nome = nomeDoArquivo(servidor.foto_chave, "foto.jpg");
    const objeto = await ler(armazenamento, servidor.foto_chave);
    if (objeto.situacao !== "encontrado") {
      registrarFalta(objeto, "Foto de perfil do servidor", `matrícula ${servidor.matricula}`, servidor.foto_chave);
      continue;
    }
    yield entrada({
      caminho: `usuarios/${pastaDoProtocolo(servidor.matricula)}/${nome}`,
      conteudo: objeto.corpo,
      comprimir: false,
    });
  }

  yield entrada({
    caminho: "INDICE.csv",
    conteudo: texto(montarCsv(
      [
        "Protocolo", "Pasta", "Tipo", "Situação", "Endereço", "Registrada em",
        "Linha em tabelas/ocorrencias.csv", "Documentos", "Arquivos de evidência",
      ],
      indice.map((i) => [
        i.protocolo, i.pasta, i.tipo, i.status, i.endereco, i.criadoEm,
        i.linhaNoCsv, i.documentos.join(" | "), i.evidencias.join(" | "),
      ]),
    )),
  });

  yield entrada({
    caminho: "INDICE.html",
    conteudo: texto(indiceEmHtml(indice, {
      municipio, agora, pendencias: pendencias.length, naoLidos: naoLidos.length,
    })),
  });

  /*
    O relatório separa NÃO EXISTE de NÃO CONSEGUI LER, e essa separação é o
    ponto do arquivo inteiro.

    Antes, as duas saíam sob a mesma frase, que é uma AFIRMAÇÃO sobre o mundo:
    "o banco referia estes arquivos e eles NÃO foram encontrados no
    armazenamento". Um pico de limite de taxa do provedor bastava para o pacote
    declarar inexistente uma fotografia que existe. E o passo 6 do procedimento
    (a eliminação das nossas cópias) vem DEPOIS da conferência do município: o
    erro só apareceria quando não houvesse mais como voltar.

    A segunda lista, quando existe, diz explicitamente para NÃO seguir para o
    passo 6, porque essa é a única instrução que impede a perda.
  */
  yield entrada({
    caminho: "PENDENCIAS-DA-EXTRACAO.txt",
    conteudo: texto(relatorioDePendencias(pendencias, naoLidos)),
  });

  /*
    A soma de verificação é o último arquivo, e ela não cobre a si mesma pelo
    motivo óbvio. Ela existe porque o pacote é entregue por meio combinado (pen
    drive, pasta compartilhada, transferência), e nenhum desses meios avisa
    quando corrompe um arquivo no caminho.
  */
  yield {
    caminho: "SOMAS-SHA256.txt",
    modificadoEm: agora,
    conteudo: texto(
      somas.map((s) => `${s.sha256}  ${s.caminho}`).join("\n") + "\n",
    ),
  };
}

/**
 * O texto de `PENDENCIAS-DA-EXTRACAO.txt`.
 *
 * Fora do gerador, e exportada, para o teste conseguir cobrar a redação sem
 * montar um pacote inteiro. A redação É a correção aqui: o defeito não estava
 * em perder arquivo, estava em AFIRMAR que ele não existe.
 */
export function relatorioDePendencias(
  ausentes: readonly string[],
  naoLidos: readonly string[],
): string {
  if (ausentes.length === 0 && naoLidos.length === 0) {
    return "Nenhuma pendência: todo arquivo referido pelo banco foi incluído no pacote.\n";
  }

  const partes: string[] = [];

  if (naoLidos.length > 0) {
    partes.push(
      "ATENÇÃO: A EXTRAÇÃO NÃO ESTÁ COMPLETA.\n\n"
      + `Estes ${naoLidos.length} arquivo(s) o banco refere, e o armazenamento NÃO\n`
      + "RESPONDEU sobre eles. Não é o mesmo que dizer que não existem: pode ter\n"
      + "sido limite de taxa do provedor, indisponibilidade momentânea ou falha de\n"
      + "rede, e nesse caso os arquivos existem e simplesmente não vieram nesta\n"
      + "extração.\n\n"
      + "NÃO SIGA para o passo 6 do procedimento (eliminação das nossas cópias)\n"
      + "com esta lista preenchida: depois dele não há como voltar. Peça a\n"
      + "repetição da extração, e compare o pacote novo com este.\n\n"
      + naoLidos.map((p) => `- ${p}`).join("\n") + "\n",
    );
  }

  if (ausentes.length > 0) {
    partes.push(
      "O banco referia estes arquivos e o armazenamento respondeu que NÃO OS\n"
      + "TEM. Isto precisa ser resolvido antes de o município declarar a\n"
      + "conferência do passo 5 concluída.\n\n"
      + ausentes.map((p) => `- ${p}`).join("\n") + "\n",
    );
  }

  return partes.join("\n");
}

function leiaMe(d: {
  municipio: string;
  organizacao: string;
  emitidoPor: string;
  agora: Date;
  totalOcorrencias: number;
}): string {
  return [
    "PACOTE DE SAÍDA DE MUNICÍPIO",
    "Defesa Civil Operacional 360",
    "",
    `Município: ${d.municipio}`,
    `Órgão: ${d.organizacao}`,
    `Extraído em: ${d.agora.toISOString()}`,
    `Extraído por: ${d.emitidoPor}`,
    `Ocorrências no pacote: ${d.totalOcorrencias}`,
    "",
    "COMECE PELO INDICE.html",
    "Abra o arquivo INDICE.html num navegador qualquer. Ele lista todo",
    "protocolo, com link para a pasta de fotografias, para os documentos",
    "gerados e com o número da linha correspondente em",
    "tabelas/ocorrencias.csv.",
    "",
    "O QUE TEM AQUI",
    "  esquema/      o SQL de criação do banco, comentado. Explica o que cada",
    "                coluna significa e por que cada restrição existe, que é o",
    "                que falta num despejo cru de esquema.",
    "  tabelas/      uma planilha CSV e um arquivo JSON por tabela do banco.",
    "                O CSV abre no Excel. O JSON preserva o que o CSV achata",
    "                (o checklist da vistoria e o detalhe da trilha são",
    "                estruturas aninhadas).",
    "  documentos/   laudos e termos em HTML, um arquivo por documento, com o",
    "                estilo dentro do próprio arquivo. Abrem sem internet e",
    "                sem servidor, e as imagens apontam para a pasta",
    "                evidencias/ deste mesmo pacote.",
    "  evidencias/   as fotografias e as assinaturas originais, em pastas por",
    "                protocolo.",
    "  usuarios/     a foto de perfil de cada servidor que escolheu ter uma,",
    "                em pasta por matrícula. É dado pessoal do servidor, e",
    "                não prova de ocorrência: por isso fica fora de evidencias/.",
    "  SOMAS-SHA256.txt  a soma de verificação de cada arquivo, para conferir",
    "                que o pacote chegou íntegro.",
    "  PENDENCIAS-DA-EXTRACAO.txt  o que o banco referia e não veio: separado\n"
    + "                              entre o que o armazenamento disse não ter e o\n"
    + "                              que ele não respondeu (leia antes de aceitar)",
    "                no armazenamento. Confira este arquivo antes de aceitar",
    "                a entrega.",
    "",
    "DATAS",
    "Toda data e hora nos arquivos CSV e JSON está em ISO 8601, com fuso",
    "explícito. Isso é deliberado: o formato brasileiro sem fuso é ambíguo, e",
    "ambiguidade de fuso num carimbo de vistoria muda o dia em que o ato",
    "aconteceu.",
    "",
    "O QUE NÃO ESTÁ AQUI, E POR QUÊ",
    "Senhas, hashes de senha, tokens de sessão, links de redefinição e fichas",
    "de notificação não saem. São material de credencial: entregar isso num",
    "pacote que viaja por email ou pen drive seria entregar acesso, não dados.",
    "Nada disso é dado do município: são segredos do sistema que ele está",
    "deixando.",
    "",
    "NADA FOI APAGADO",
    "A extração não apaga nada do nosso lado. A eliminação só acontece depois",
    "de o município declarar por escrito que recebeu e conferiu este pacote, e",
    "vem acompanhada de declaração de eliminação. A ordem inversa (apagar",
    "contra o calendário em vez de contra a confirmação) já destruiu dado de",
    "gente em outros produtos.",
    "",
  ].join("\n");
}

function indiceEmHtml(
  itens: ItemDoIndice[],
  contexto: { municipio: string; agora: Date; pendencias: number; naoLidos: number },
): string {
  const linhas = itens.map((i) => `
    <tr>
      <td class="mono">${escapar(i.protocolo)}</td>
      <td>${escapar(i.tipo)}</td>
      <td>${escapar(i.status)}</td>
      <td>${escapar(i.endereco)}</td>
      <td class="mono">${i.linhaNoCsv}</td>
      <td>${
        i.documentos.length === 0
          ? '<span class="vazio">sem documento</span>'
          : i.documentos.map((d) => `<a href="${escapar(d)}">${escapar(d.split("/").pop() ?? d)}</a>`).join("<br>")
      }</td>
      <td>${
        i.evidencias.length === 0
          ? '<span class="vazio">sem arquivo</span>'
          : `<a href="evidencias/${escapar(i.pasta)}/">${i.evidencias.length} arquivo(s)</a>`
      }</td>
    </tr>`).join("");

  /*
    Dois avisos, e não um, pela mesma razão que as listas são duas: "não existe"
    e "não consegui ler" pedem ações opostas de quem confere. O primeiro é uma
    pendência a resolver; o segundo é uma ordem de NÃO seguir para o passo que
    apaga as nossas cópias.
  */
  const aviso = [
    contexto.naoLidos > 0
      ? `<p class="alerta">Atenção: a extração NÃO está completa. O armazenamento não
         respondeu sobre ${contexto.naoLidos} arquivo(s), e isso não quer dizer que eles
         não existam. NÃO siga para o passo 6 do procedimento (eliminação das cópias)
         antes de repetir a extração. Veja PENDENCIAS-DA-EXTRACAO.txt.</p>`
      : "",
    contexto.pendencias > 0
      ? `<p class="alerta">Atenção: ${contexto.pendencias} arquivo(s) referido(s) pelo banco não
         foram encontrados no armazenamento. Veja PENDENCIAS-DA-EXTRACAO.txt antes de
         aceitar a entrega.</p>`
      : "",
  ].join("");

  /*
    Estilo dentro do arquivo, sem fonte de rede e sem script.

    Este índice é aberto por duplo clique numa máquina de prefeitura que pode
    não ter internet, daqui a dez anos. Qualquer recurso externo aqui viraria
    uma página quebrada exatamente no momento em que ela é a única forma de
    achar um documento.
  */
  return `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<title>Índice do pacote de saída, ${escapar(contexto.municipio)}</title>
<style>
  body { font-family: -apple-system, "Segoe UI", Roboto, Arial, sans-serif;
         margin: 2rem; color: #1a1a1a; background: #fff; line-height: 1.5; }
  h1 { font-size: 1.4rem; margin-bottom: .25rem; }
  p.sub { color: #555; margin-top: 0; }
  table { border-collapse: collapse; width: 100%; font-size: .85rem; }
  th, td { border: 1px solid #d4d4d4; padding: .45rem .6rem; text-align: left;
           vertical-align: top; }
  th { background: #f2f2f2; }
  .mono { font-family: "SFMono-Regular", Consolas, monospace; white-space: nowrap; }
  .vazio { color: #767676; }
  .alerta { border: 2px solid #8a1c1c; color: #8a1c1c; padding: .75rem; }
  a { color: #1a3fa0; }
</style>
</head>
<body>
<h1>Índice do pacote de saída</h1>
<p class="sub">${escapar(contexto.municipio)}, extraído em ${escapar(contexto.agora.toISOString())}.
Um protocolo por linha, ligando pasta, documento e linha do CSV.</p>
${aviso}
<table>
  <thead>
    <tr>
      <th>Protocolo</th><th>Tipo</th><th>Situação</th><th>Endereço</th>
      <th>Linha em tabelas/ocorrencias.csv</th><th>Documentos</th><th>Evidências</th>
    </tr>
  </thead>
  <tbody>${linhas}
  </tbody>
</table>
</body>
</html>
`;
}
