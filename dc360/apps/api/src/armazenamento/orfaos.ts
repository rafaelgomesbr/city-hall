import { randomUUID } from "node:crypto";
import type { Banco } from "../banco/tipos.js";
import type { Armazenamento, ObjetoListado } from "./tipos.js";

/**
 * A varredura de objeto órfão.
 *
 * O QUE ELA EXISTE PARA RESOLVER. As fotografias são o que cresce neste
 * produto: seis fotos de 2 MB por vistoria, 2.000 atendimentos por ano, cerca
 * de 24 GB por ano por município, contra 16 MB por ano no banco. Dentro desse
 * volume existe uma fração que nenhum registro justifica: o PUT chegou ao
 * armazenamento e a confirmação nunca chegou ao servidor, porque o sinal caiu,
 * o aplicativo foi fechado, o aparelho foi trocado. Esse objeto fica lá para
 * sempre, pagando armazenamento, e é imagem do imóvel de um cidadão guardada
 * sem nenhuma finalidade. As duas coisas importam, e a segunda mais: dado
 * pessoal sem finalidade é exatamente o que a minimização por prazo (migração
 * 021) existe para impedir do outro lado da parede.
 *
 * ================================================================
 * ÓRFÃO NÃO É "OBJETO QUE NÃO ESTÁ NA TABELA".
 *
 * As fotos sobem ANTES do envelope da vistoria, de propósito, para o laudo
 * nunca apontar para arquivo que não existe. Existe portanto uma janela
 * legítima em que o objeto está no balde e o registro ainda não fechou, e ela
 * dura o tempo que o aparelho levar para achar sinal: o agente coleta no morro,
 * o aparelho guarda, e o envio sai quando a rede volta, às vezes dias depois.
 *
 * Uma varredura ingênua, rodada no sábado, apagaria a fotografia da vistoria de
 * interdição que o agente fez na sexta e ainda não conseguiu sincronizar.
 *
 * ================================================================
 * ELA NÃO APAGA NADA. Esta é a decisão mais importante do arquivo, e o
 * argumento está escrito em `docs/ARMAZENAMENTO.md`. O resumo:
 *
 *   - Apagar é irreversível, e todo modo conhecido de o critério errar (página
 *     de listagem perdida, restauração de cópia, defeito no prefixo, município
 *     que a listagem não soube atribuir) erra para o MESMO lado: declarar órfão
 *     o que está em uso.
 *   - A assimetria de custo é gritante. Guardar um órfão um mês a mais custa
 *     centavos; apagar a fotografia de uma interdição custa o ato
 *     administrativo, porque ela é a prova material dele.
 *   - Este produto inteiro é construído contra apagar prova: a trilha é
 *     append-only, ocorrência não se apaga (se encerra com motivo), usuário não
 *     some (se desativa). Uma rotina automática que destrói arquivo seria a
 *     única exceção, e ela nasceria sem ninguém olhando.
 *
 * Então a varredura escreve uma lista, e o descarte é ato deliberado de
 * operador da plataforma, com nome e motivo, sobre a lista de UMA rodada, e com
 * reconferência no instante de apagar.
 */

/**
 * A janela de graça: trinta dias.
 *
 * O CRITÉRIO, por extenso: um objeto só entra na lista quando está no
 * armazenamento há mais de trinta dias E o município dono do prefixo não tem
 * nenhuma linha viva de evidência apontando para ele.
 *
 * De onde vem o número. Ele precisa cobrir a maior distância plausível entre a
 * foto subir e o envelope chegar, e essa distância não é de minutos: o aparelho
 * pode passar dias sem sinal, o agente pode sair de férias com a coleta
 * guardada (o aplicativo promete, com razão, que ela continua lá), e uma coleta
 * bloqueada na fila espera decisão de gente. Trinta dias é mais do que qualquer
 * um desses somados, e ainda assim é um prazo, e não "nunca".
 *
 * O erro de ser generoso demais custa armazenamento por mais um mês. O erro de
 * ser curto demais custa a fotografia de uma interdição. Os dois erros não se
 * parecem, e o número é escolhido pelo segundo.
 */
export const JANELA_DE_GRACA_DIAS = 30;

/** `tenant/{organizacao}/...`, que é o formato que `chaveDeStorage` produz. */
const PREFIXO_DE_TENANT = /^tenant\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\//;

export type EspecieDeOrfao = "envio_nunca_confirmado" | "objeto_sem_linha";

export type ResumoDaVarredura = {
  /** Identifica esta rodada. É por ele que o descarte nomeia a lista. */
  varreduraId: string;
  /** Quantos objetos foram olhados. */
  objetos: number;
  /** Quantos entraram na lista de candidatos. */
  candidatos: number;
  bytesCandidatos: number;
  /** Autorizações velhas sem arquivo, que pararam de consumir o teto. */
  reservasAbandonadas: number;
  /** Os municípios em que esta rodada encontrou algum candidato. */
  municipios: string[];
  /**
   * Chaves que não dá para atribuir a município nenhum: sem prefixo de tenant,
   * ou com prefixo de organização que não existe. Elas NUNCA viram candidatas.
   */
  naoAtribuidos: string[];
  /**
   * O que impediu a rodada de ser completa. Com qualquer coisa aqui, a lista
   * tem buraco e o descarte não pode se apoiar nela.
   */
  falhas: string[];
  /** `true` quando outra máquina estava varrendo e esta desistiu da rodada. */
  travado: boolean;
};

export type ResumoDoDescarte = {
  apagados: number;
  bytesApagados: number;
  /** Candidatos que, na reconferência, voltaram a ser referidos. */
  mantidos: number;
  falhas: string[];
};

export type Trava = {
  tentar(): Promise<boolean>;
  soltar(): Promise<void>;
  encerrar(): Promise<void>;
};

export type DependenciasDaVarredura = {
  banco: Banco;
  armazenamento: Armazenamento;
  /**
   * Os municípios que esta rodada pode alcançar. OPCIONAL, e as duas formas de
   * chamar são diferentes de propósito.
   *
   * SEM a lista (é como a API chama): os municípios saem do PREFIXO das chaves
   * do próprio armazenamento, e cada um é confirmado consultando `organizacoes`
   * dentro do contexto dele, debaixo do RLS. Isso é o que permite a varredura
   * rodar sozinha sem nenhum privilégio novo: enumerar município exigiria ler
   * `organizacoes` fora de contexto, o que só uma função `SECURITY DEFINER`
   * faria, e o orçamento delas está em quinze de quinze com o portão CA-06
   * reprovando a décima sexta. Não se gasta a última numa lista.
   *
   * COM a lista (é como o comando do operador chama, que tem a credencial de
   * dono): ela é autoritativa, e cobre um caso que a outra forma não alcança,
   * o do município que não tem NENHUM objeto no balde. Ele não aparece em
   * prefixo nenhum, e é justamente ele que pode ter reservas de envio que nunca
   * viraram byte segurando o teto.
   *
   * Nos dois casos vale a mesma regra: chave cujo prefixo não nomeia município
   * conhecido não é órfã, é NÃO ATRIBUÍDA, e não entra em lista de descarte
   * nenhuma.
   */
  municipios?: string[];
  trava?: Trava;
  janelaDias?: number;
  agora?: () => Date;
  registrar?: (evento: Record<string, unknown>, mensagem: string) => void;
};

type LinhaDeEvidencia = {
  id: string;
  chave_storage: string;
  enviada_em: string | null;
  autorizada_em: string;
};

/**
 * Percorre o armazenamento e escreve a lista de candidatos.
 *
 * O desenho tem uma propriedade que vale dizer em voz alta: ela NUNCA consulta
 * o banco sem contexto de município. Toda consulta daqui acontece dentro do
 * `comTenant` de um município, debaixo do RLS, inclusive a que confirma que o
 * município existe. Não há caminho em que a linha de uma prefeitura responda
 * pelo objeto de outra, e por isso não existe função privilegiada nova: o
 * orçamento de `SECURITY DEFINER` deste produto está em quinze de quinze, e o
 * portão CA-06 reprova a décima sexta.
 */
export async function varrerOrfaos(
  dep: DependenciasDaVarredura,
): Promise<ResumoDaVarredura> {
  const agora = dep.agora ?? (() => new Date());
  const registrar = dep.registrar ?? (() => {});
  const janelaMs = (dep.janelaDias ?? JANELA_DE_GRACA_DIAS) * 86_400_000;
  const limite = new Date(agora().getTime() - janelaMs);

  const resumo: ResumoDaVarredura = {
    varreduraId: randomUUID(),
    objetos: 0,
    candidatos: 0,
    bytesCandidatos: 0,
    reservasAbandonadas: 0,
    municipios: [],
    naoAtribuidos: [],
    falhas: [],
    travado: false,
  };

  if (dep.trava && !(await dep.trava.tentar())) {
    resumo.travado = true;
    return resumo;
  }

  try {
    /*
      Os objetos são agrupados por município ANTES de qualquer consulta.

      Consultar objeto a objeto seria uma transação por fotografia, e um balde
      de três anos tem dezenas de milhares delas. Agrupando, cada município é
      uma consulta só, com a lista de chaves inteira.

      O PREÇO, dito em voz alta: a rodada segura na memória a chave e o tamanho
      de tudo que existe no balde. São cerca de 150 bytes por objeto, então um
      balde com trezentos mil objetos (dez municípios, três anos) custa algumas
      dezenas de megabytes por rodada. Isso cabe, e não cabe para sempre: o dia
      em que não couber, o que muda é conferir e soltar página a página, ao
      preço de a soltura de reserva precisar de outra passada. Não vale
      complicar antes da hora, e vale estar escrito.
    */
    const conhecidos = dep.municipios ? new Set(dep.municipios) : null;
    const porMunicipio = new Map<string, ObjetoListado[]>(
      (dep.municipios ?? []).map((id) => [id, [] as ObjetoListado[]]),
    );
    let continuacao: string | undefined;

    do {
      /*
        O BALDE INTEIRO, e não só o prefixo `tenant/`.

        A pergunta não é "as chaves que seguem a convenção estão certas", é "o
        que existe neste balde". Objeto fora da convenção não vira candidato,
        vira linha de NÃO ATRIBUÍDO no relatório, e essa linha é o único jeito
        de alguém descobrir que existe no armazenamento do produto coisa que o
        produto não sabe explicar. Listar só `tenant/` faria essas chaves não
        existirem para ninguém.
      */
      const pagina = await dep.armazenamento.listar("", continuacao);
      if (pagina.falha) {
        /*
          PARA AQUI, e não continua com o que deu para ler.

          Uma lista montada sobre uma listagem parcial não tem buraco visível:
          ela tem a forma de uma lista completa em que alguns objetos
          simplesmente não aparecem. Como o que se faz com ela depois é APAGAR,
          o buraco errado não é o que sobra, é o que falta ser comparado.
        */
        resumo.falhas.push(pagina.falha);
        break;
      }

      for (const objeto of pagina.objetos) {
        resumo.objetos += 1;
        const municipio = PREFIXO_DE_TENANT.exec(objeto.chave)?.[1];
        /*
          Sem prefixo de tenant, ou com prefixo que nomeia município fora da
          lista: NÃO ATRIBUÍDO, e nunca candidato.

          Só dá para dizer que um objeto é órfão comparando com as linhas do
          município dono dele. Sem saber quem é o dono, declarar órfão seria
          afirmar o que ninguém verificou, e o desfecho dessa afirmação é apagar
          prova.
        */
        if (!municipio || (conhecidos && !conhecidos.has(municipio))) {
          resumo.naoAtribuidos.push(objeto.chave);
          continue;
        }
        const lista = porMunicipio.get(municipio);
        if (lista) lista.push(objeto);
        else porMunicipio.set(municipio, [objeto]);
      }

      continuacao = pagina.continuacao ?? undefined;
    } while (continuacao);

    for (const [municipio, objetos] of porMunicipio) {
      try {
        await conferirMunicipio(dep, resumo, municipio, objetos, limite, agora());
      } catch (erro) {
        /*
          Município que falhou não contamina os outros, e também não some do
          relatório. Sem a linha de falha, a saída diria "nenhum órfão neste
          município", que é uma afirmação que ninguém verificou.
        */
        resumo.falhas.push(
          `${municipio}: ${erro instanceof Error ? erro.message : String(erro)}`,
        );
      }
    }

    registrar(
      {
        varreduraId: resumo.varreduraId,
        objetos: resumo.objetos,
        candidatos: resumo.candidatos,
        bytesCandidatos: resumo.bytesCandidatos,
        reservasAbandonadas: resumo.reservasAbandonadas,
        naoAtribuidos: resumo.naoAtribuidos.length,
        falhas: resumo.falhas.length,
      },
      "varredura de objeto orfao concluida",
    );
  } finally {
    // `finally` pela mesma razão da minimização: uma exceção com a trava presa
    // faria toda rodada seguinte desistir, e a varredura pararia de rodar sem
    // nada no log dizendo por quê.
    await dep.trava?.soltar();
  }

  return resumo;
}

async function conferirMunicipio(
  dep: DependenciasDaVarredura,
  resumo: ResumoDaVarredura,
  municipio: string,
  objetos: ObjetoListado[],
  limite: Date,
  instante: Date,
): Promise<void> {
  await dep.banco.comTenant(municipio, async (c) => {
    /*
      O MUNICÍPIO EXISTE MESMO?

      Debaixo do RLS, `organizacoes` só devolve a linha quando o contexto é dela
      própria, então esta consulta responde "sim" sem enxergar nada além. Quando
      quem chamou trouxe a lista, isto é uma segunda barreira barata; quando não
      trouxe (o prefixo veio da chave), isto é a única. Prefixo que nomeia
      organização inexistente devolve nada, e todos os objetos dele viram NÃO
      ATRIBUÍDOS: declarar órfão um objeto cujo dono ninguém identificou seria
      afirmar o que ninguém verificou, e o desfecho dessa afirmação é apagar
      prova.
    */
    const existe = await c.query<{ id: string }>("SELECT id FROM organizacoes LIMIT 1");
    if (!existe.rows[0]) {
      for (const objeto of objetos) resumo.naoAtribuidos.push(objeto.chave);
      return;
    }

    const chaves = objetos.map((o) => o.chave);
    const linhas = await c.query<LinhaDeEvidencia>(
      `SELECT id, chave_storage, enviada_em, autorizada_em
         FROM evidencias
        WHERE abandonada_em IS NULL AND chave_storage = ANY($1::text[])`,
      [chaves],
    );
    const porChave = new Map(linhas.rows.map((l) => [l.chave_storage, l]));

    for (const objeto of objetos) {
      const linha = porChave.get(objeto.chave);

      // Prova entregue: aparece no laudo, e não se discute.
      if (linha?.enviada_em) continue;

      /*
        A IDADE É A DO MAIS NOVO DOS DOIS RELÓGIOS, e isso é deliberado.

        Um objeto pode ser velho e a autorização dele recente (o aparelho
        retomou um envio antigo), e a autorização pode ser velha e o objeto
        recente. Tomar o mais novo dos dois faz a janela de graça errar sempre
        para o lado de esperar mais, que é o lado que não destrói vistoria.
      */
      const idades = [
        objeto.modificadoEm ? Date.parse(objeto.modificadoEm) : null,
        linha ? Date.parse(linha.autorizada_em) : null,
      ].filter((n): n is number => n !== null && Number.isFinite(n));

      // Sem nenhuma data conhecida, não dá para dizer que o prazo passou.
      if (idades.length === 0) continue;
      if (Math.max(...idades) > limite.getTime()) continue;

      const especie: EspecieDeOrfao = linha ? "envio_nunca_confirmado" : "objeto_sem_linha";

      await c.query(
        `INSERT INTO objetos_orfaos
           (organizacao_id, varredura_id, chave, tamanho_bytes, modificado_em,
            especie, evidencia_id, visto_em)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
         ON CONFLICT (organizacao_id, varredura_id, chave) DO NOTHING`,
        [
          municipio, resumo.varreduraId, objeto.chave, objeto.tamanhoBytes,
          objeto.modificadoEm, especie, linha?.id ?? null, instante,
        ],
      );

      resumo.candidatos += 1;
      resumo.bytesCandidatos += objeto.tamanhoBytes;
      if (!resumo.municipios.includes(municipio)) resumo.municipios.push(municipio);
    }

    /*
      A OUTRA METADE: a reserva que nunca virou byte.

      Linha de autorização velha, sem objeto no armazenamento. Ela não ocupa o
      balde, ocupa o TETO: `tamanho_bytes` foi declarado na autorização e conta
      desde então. Sem isto, um município que perdeu cem envios por sinal ruim
      ficaria devendo cem fotografias que não existem em lugar nenhum.

      Marcar não é apagar. A linha fica, com a data e o motivo, e a autorização
      ressuscita se o mesmo envio for retomado com a mesma chave de
      idempotência, que é o que a rota de autorização faz.

      A condição é conservadora de propósito: só alcança linha SEM confirmação e
      mais velha que a janela, e só quando esta rodada conseguiu listar o balde
      inteiro (sem isso, uma listagem parcial faria toda foto não listada
      parecer inexistente).
    */
    if (resumo.falhas.length > 0) return;

    const abandonadas = await c.query<{ id: string }>(
      `UPDATE evidencias
          SET abandonada_em = $1, abandono_motivo = $2
        WHERE enviada_em IS NULL
          AND abandonada_em IS NULL
          AND autorizada_em <= $3
          AND NOT (chave_storage = ANY($4::text[]))
      RETURNING id`,
      [
        instante,
        `Autorizacao sem arquivo por mais de ${dep.janelaDias ?? JANELA_DE_GRACA_DIAS} dias.`,
        limite,
        chaves,
      ],
    );
    resumo.reservasAbandonadas += abandonadas.rows.length;
  });
}

export type DependenciasDoDescarte = {
  banco: Banco;
  armazenamento: Armazenamento;
  /** A rodada cuja lista foi conferida. Só ela é alcançada. */
  varreduraId: string;
  /**
   * Os municípios que o operador nomeou, pela mesma razão da varredura. Um
   * descarte alcança exatamente quem está aqui: engano de digitação não se
   * espalha pelo produto inteiro.
   */
  municipios: string[];
  /** Quem autorizou, por nome. Não é conta de sistema. */
  operador: string;
  /** Por que, em uma frase. Vai para a linha e não se altera. */
  motivo: string;
  registrar?: (evento: Record<string, unknown>, mensagem: string) => void;
};

/**
 * O descarte, que é ato de gente.
 *
 * Nenhuma rota chama isto, e nenhum relógio chama isto. Ele existe atrás de um
 * comando da linha de comando do operador da plataforma, e exige a lista de uma
 * rodada, um nome e um motivo.
 *
 * A RECONFERÊNCIA NO INSTANTE DE APAGAR é a peça que faz o desenho funcionar.
 * Entre varrer e decidir passam dias ou semanas: alguém lê o relatório, fala
 * com o município, e só então autoriza. Nesse intervalo a coleta que estava
 * presa num aparelho pode ter drenado, e o objeto que constava como órfão
 * passou a ser a prova de um ato. Apagar pela lista antiga destruiria
 * exatamente a fotografia que acabou de ser usada, e por isso cada chave é
 * conferida de novo contra o banco antes do DELETE.
 */
export async function descartarOrfaos(
  dep: DependenciasDoDescarte,
): Promise<ResumoDoDescarte> {
  const registrar = dep.registrar ?? (() => {});
  const resultado: ResumoDoDescarte = {
    apagados: 0, bytesApagados: 0, mantidos: 0, falhas: [],
  };

  if (!dep.operador.trim()) throw new Error("O descarte exige o nome de quem autoriza.");
  if (!dep.motivo.trim()) throw new Error("O descarte exige um motivo escrito.");

  for (const municipio of dep.municipios) {
    await dep.banco.comTenant(municipio, async (c) => {
      const candidatos = await c.query<{ id: string; chave: string; tamanho_bytes: string }>(
        `SELECT id, chave, tamanho_bytes FROM objetos_orfaos
          WHERE varredura_id = $1 AND decidido_em IS NULL`,
        [dep.varreduraId],
      );

      for (const candidato of candidatos.rows) {
        const viva = await c.query<{ id: string }>(
          `SELECT id FROM evidencias
            WHERE chave_storage = $1 AND abandonada_em IS NULL AND enviada_em IS NOT NULL`,
          [candidato.chave],
        );

        if (viva.rows[0]) {
          await c.query(
            `UPDATE objetos_orfaos
                SET decidido_em = now(), decidido_por = $2, decisao = 'mantido',
                    decisao_motivo = $3
              WHERE id = $1`,
            [
              candidato.id, dep.operador,
              "Reconferencia antes do descarte: o objeto voltou a ser referido "
              + "por uma evidencia confirmada.",
            ],
          );
          resultado.mantidos += 1;
          continue;
        }

        const apagado = await dep.armazenamento.apagar(candidato.chave);
        if (apagado.situacao === "falha") {
          resultado.falhas.push(`${candidato.chave}: ${apagado.motivo}`);
          continue;
        }

        /*
          A linha é carimbada DEPOIS de o armazenamento responder.

          Ao contrário: um erro entre marcar e apagar deixaria o registro
          dizendo que a foto foi descartada enquanto ela continua no balde, e a
          contabilidade do teto passaria a mentir para o lado que ninguém
          confere.
        */
        await c.query(
          `UPDATE objetos_orfaos
              SET decidido_em = now(), decidido_por = $2, decisao = 'descartado',
                  decisao_motivo = $3
            WHERE id = $1`,
          [candidato.id, dep.operador, dep.motivo],
        );

        /*
          A LINHA DA AUTORIZAÇÃO TAMBÉM PRECISA SER ENCERRADA.

          Quando o candidato é `envio_nunca_confirmado`, existe uma linha de
          evidência apontando para a chave que acabou de ser apagada. Deixá-la
          viva produziria duas mentiras ao mesmo tempo: ela continuaria
          consumindo o teto por bytes que não existem mais, e continuaria sendo
          uma reserva capaz de ser retomada para um objeto apagado.

          Encerrada com motivo, e não apagada, pela regra do produto: registro
          não se apaga. O motivo nomeia quem decidiu, porque essa linha é a
          única memória, do lado do banco, de que um arquivo foi descartado.
        */
        await c.query(
          `UPDATE evidencias
              SET abandonada_em = now(),
                  abandono_motivo = $2
            WHERE chave_storage = $1 AND enviada_em IS NULL AND abandonada_em IS NULL`,
          [
            candidato.chave,
            `Objeto descartado como orfao por ${dep.operador}.`.slice(0, 300),
          ],
        );

        resultado.apagados += 1;
        resultado.bytesApagados += Number(candidato.tamanho_bytes);
      }
    });
  }

  registrar(
    {
      varreduraId: dep.varreduraId,
      apagados: resultado.apagados,
      bytesApagados: resultado.bytesApagados,
      mantidos: resultado.mantidos,
      falhas: resultado.falhas.length,
    },
    "descarte de objeto orfao executado",
  );

  return resultado;
}

export type VarreduraDeOrfaosAgendada = { parar(): Promise<void> };

/**
 * Põe a varredura num relógio.
 *
 * ELA SÓ RELATA, e é por isso que estar num relógio é seguro: o que o relógio
 * produz é uma lista atualizada, e nunca um arquivo a menos. Se ninguém ler a
 * lista, nada acontece, que é exatamente o desfecho certo para uma rotina que
 * propõe destruir prova.
 *
 * O contrário também vale, e é a razão de ela não ficar só no comando de linha:
 * lista que só existe quando alguém lembra de rodar um comando é lista que não
 * existe, e o objeto órfão continuaria pagando armazenamento e guardando imagem
 * de imóvel de cidadão sem finalidade, que é o problema todo.
 *
 * As mesmas duas defesas das outras rotinas, pelas mesmas razões: `unref()` para
 * o temporizador não segurar o processo em pé durante um deploy, e trava de
 * sobreposição no próprio processo para uma rodada demorada não ganhar outra por
 * cima. Uma rodada aqui pode demorar de verdade: ela percorre o balde inteiro.
 */
export function agendarVarreduraDeOrfaos(
  dep: DependenciasDaVarredura,
  intervaloMs: number,
): VarreduraDeOrfaosAgendada {
  let emAndamento = false;
  const registrar = dep.registrar ?? (() => {});

  const relogio = setInterval(() => {
    if (emAndamento) return;
    emAndamento = true;
    void varrerOrfaos(dep)
      .catch((erro: unknown) => {
        registrar(
          { erro: erro instanceof Error ? erro.message : String(erro) },
          "varredura de objeto orfao falhou inteira",
        );
      })
      .finally(() => { emAndamento = false; });
  }, intervaloMs);

  relogio.unref();

  return {
    async parar() {
      clearInterval(relogio);
      await dep.trava?.encerrar();
    },
  };
}
