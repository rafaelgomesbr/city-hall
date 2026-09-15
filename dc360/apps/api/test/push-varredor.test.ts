import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { bancoEmMemoria, type BancoEmMemoria } from "../src/banco/memoria.js";
import { montarConfiguracaoDoPool } from "../src/banco/postgres.js";
import type { EnvioDePush, DesfechoDoEnvio, Alvo } from "../src/push/envio.js";
import { textoVisivel, type Notificacao } from "../src/push/mensagem.js";
import { travaDeProcesso, type Trava } from "../src/push/trava.js";
import { RETENCAO_MINIMA_DIAS, varrerAvisos } from "../src/push/varredor.js";

/**
 * O varredor de prazo, que é a metade do push que roda sozinha.
 *
 * As três perguntas que este arquivo responde são as três que decidem se a
 * coisa presta em produção:
 *
 *   1. Com duas máquinas no Fly, o agente recebe o aviso uma vez ou duas?
 *   2. Reiniciar o processo remanda o que já foi mandado?
 *   3. Um aparelho com problema derruba o aviso de todo mundo que vinha
 *      depois na fila?
 *
 * NENHUM ENVIO DE VERDADE ACONTECE AQUI. O envio é duplo de teste, e é assim
 * de propósito: mandar notificação real para o telefone de alguém, sem a metade
 * aplicativo pronta, seria barulho sem valor.
 */

let mem: BancoEmMemoria;
let orgA: string;
let orgB: string;
let agenteA: string;
let equipeA: string;
let ocorrenciaA: string;

type Envio = { alvo: Alvo; notificacao: Notificacao };

/** Envio falso que registra tudo que sairia, e responde o que o teste mandar. */
function envioEspiao(
  resposta: (alvo: Alvo) => DesfechoDoEnvio | Promise<DesfechoDoEnvio> =
    () => ({ desfecho: "entregue", detalhe: null }),
): { enviar: EnvioDePush; enviados: Envio[] } {
  const enviados: Envio[] = [];
  return {
    enviados,
    enviar: async (alvo, notificacao) => {
      enviados.push({ alvo, notificacao });
      return resposta(alvo);
    },
  };
}

function varrer(enviar: EnvioDePush, trava: Trava = travaDeProcesso(), janelaMinutos = 60) {
  return varrerAvisos({ banco: mem.banco, trava, enviar, janelaMinutos });
}

async function registrarAparelho(
  org: string, usuario: string, ficha: string,
): Promise<string> {
  const r = await mem.bruto.query<{ id: string }>(
    `INSERT INTO aparelhos (organizacao_id, usuario_id, plataforma, ficha)
     VALUES ($1,$2,'ios',$3) RETURNING id`,
    [org, usuario, ficha],
  );
  return r.rows[0]!.id;
}

async function notificacoes() {
  const r = await mem.bruto.query<{
    id: string; desfecho: string; detalhe: string | null; tentativas: number;
    organizacao_id: string; aparelho_id: string;
  }>("SELECT * FROM notificacoes_enviadas ORDER BY enviada_em");
  return r.rows;
}

beforeEach(async () => {
  mem = await bancoEmMemoria({ semear: false });
  const db = mem.bruto;

  const a = await db.query<{ id: string }>(
    "INSERT INTO organizacoes (nome,municipio,uf) VALUES ('DC Serra Alta','Serra Alta','MG') RETURNING id",
  );
  const b = await db.query<{ id: string }>(
    "INSERT INTO organizacoes (nome,municipio,uf) VALUES ('DC Vale Fundo','Vale Fundo','MG') RETURNING id",
  );
  orgA = a.rows[0]!.id;
  orgB = b.rows[0]!.id;

  const ea = await db.query<{ id: string }>(
    "INSERT INTO equipes (organizacao_id,nome) VALUES ($1,'Equipe Alfa') RETURNING id", [orgA],
  );
  equipeA = ea.rows[0]!.id;

  const ua = await db.query<{ id: string }>(
    `INSERT INTO usuarios (organizacao_id,nome,matricula,email,papel,equipe_id)
     VALUES ($1,'Diego Alves','SA-3','diego@serraalta.exemplo.gov.br','agente_campo',$2)
     RETURNING id`,
    [orgA, equipeA],
  );
  agenteA = ua.rows[0]!.id;

  const oa = await db.query<{ id: string }>(
    `INSERT INTO ocorrencias
       (organizacao_id,protocolo,tipo,status,severidade,endereco,solicitante_nome,
        canal_entrada,descricao,equipe_id,prazo_em)
     VALUES ($1,'000417/2026','deslizamento','em_campo','critica','Servidão Boa Esperança, 148',
             'Marilda Nogueira','telefone','Talude cedeu',$2, now() + interval '20 minutes')
     RETURNING id`,
    [orgA, equipeA],
  );
  ocorrenciaA = oa.rows[0]!.id;
});

afterEach(async () => {
  await mem?.banco.encerrar();
});

describe("A varredura acha o prazo e avisa a equipe responsável", () => {
  it("avisa o aparelho do agente da equipe designada", async () => {
    await registrarAparelho(orgA, agenteA, "ficha-do-diego");
    const espiao = envioEspiao();

    const resumo = await varrer(espiao.enviar);

    expect(resumo.reivindicadas).toBe(1);
    expect(resumo.entregues).toBe(1);
    expect(espiao.enviados).toHaveLength(1);
    expect(espiao.enviados[0]!.alvo.ficha).toBe("ficha-do-diego");
    expect((await notificacoes())[0]!.desfecho).toBe("entregue");
  });

  it("o que sai na tela bloqueada é genérico, e o detalhe vai no dado", async () => {
    /*
      Esta é a mesma regra de `push-vitrine.test.ts`, conferida agora no
      caminho completo, com o dado saindo do banco de verdade. É aqui que um
      dia alguém pode achar que "endereço no título ajuda o agente", e é aqui
      que isso reprova: o texto atravessa a fronteira e fica legível na tela
      bloqueada, na mão de quem estiver por perto.
    */
    await registrarAparelho(orgA, agenteA, "ficha-do-diego");
    const espiao = envioEspiao();
    await varrer(espiao.enviar);

    const aviso = espiao.enviados[0]!.notificacao;
    const visivel = textoVisivel(aviso);
    for (const segredo of ["000417/2026", "Boa Esperança", "148", "critica", "Marilda"]) {
      expect(
        visivel.toLowerCase().includes(segredo.toLowerCase()),
        `"${segredo}" apareceu na tela bloqueada: "${visivel}"`,
      ).toBe(false);
    }

    /*
      Protocolo e endereço NÃO viajam mais, nem no dado: ele também atravessa a
      fronteira, e endereço de imóvel vistoriado pela Defesa Civil identifica
      pessoa quando cruzado com o resto. O aplicativo já tem a ocorrência no
      disco, e o identificador basta para abri-la.
    */
    expect(aviso.dados.protocolo).toBeUndefined();
    expect(aviso.dados.endereco).toBeUndefined();
    expect(aviso.dados.ocorrenciaId).toBeTruthy();
    // O município no dado é o que faz o aplicativo descartar aviso de uma
    // prefeitura em que a pessoa não trabalha mais. Ver a migração 016.
    expect(aviso.dados.organizacaoId).toBe(orgA);
  });

  it("não avisa quem saiu da equipe, nem quem foi desativado", async () => {
    /*
      Vazamento de dado operacional para quem já saiu: sem esta conferência, o
      agente realocado continuaria recebendo o trabalho da equipe antiga, com
      ocorrência e endereço no dado da notificação.
    */
    await registrarAparelho(orgA, agenteA, "ficha-do-diego");

    await mem.bruto.query("UPDATE usuarios SET equipe_id = NULL WHERE id = $1", [agenteA]);
    const semEquipe = envioEspiao();
    await varrer(semEquipe.enviar);
    expect(semEquipe.enviados).toHaveLength(0);

    await mem.bruto.query("UPDATE usuarios SET equipe_id = $2, ativo = false WHERE id = $1", [
      agenteA, equipeA,
    ]);
    const desativado = envioEspiao();
    await varrer(desativado.enviar);
    expect(desativado.enviados).toHaveLength(0);
  });

  it("não avisa aparelho revogado", async () => {
    await registrarAparelho(orgA, agenteA, "ficha-revogada");
    await mem.bruto.query(
      "UPDATE aparelhos SET revogado_em = now(), motivo_revogacao = 'saida do usuario'",
    );
    const espiao = envioEspiao();
    await varrer(espiao.enviar);
    expect(espiao.enviados).toHaveLength(0);
  });

  it("não avisa prazo que já venceu", async () => {
    /*
      Aviso de prazo serve para dar tempo de agir, e prazo vencido é assunto da
      tela do coordenador. Tem um segundo efeito, e ele é o que importa: um
      chamado velho e esquecido não volta a notificar no dia em que o expurgo
      apagar o registro antigo.
    */
    await registrarAparelho(orgA, agenteA, "ficha-do-diego");
    await mem.bruto.query(
      "UPDATE ocorrencias SET prazo_em = now() - interval '3 hours' WHERE id = $1",
      [ocorrenciaA],
    );
    const espiao = envioEspiao();
    await varrer(espiao.enviar);
    expect(espiao.enviados).toHaveLength(0);
  });

  it("não avisa prazo que ainda está longe da janela", async () => {
    await registrarAparelho(orgA, agenteA, "ficha-do-diego");
    await mem.bruto.query(
      "UPDATE ocorrencias SET prazo_em = now() + interval '2 days' WHERE id = $1",
      [ocorrenciaA],
    );
    const espiao = envioEspiao();
    await varrer(espiao.enviar);
    expect(espiao.enviados).toHaveLength(0);
  });

  it("não avisa ocorrência encerrada", async () => {
    await registrarAparelho(orgA, agenteA, "ficha-do-diego");
    await mem.bruto.query(
      `UPDATE ocorrencias
          SET status='encerrada', encerrado_em=now(), motivo_encerramento='resolvida'
        WHERE id = $1`,
      [ocorrenciaA],
    );
    const espiao = envioEspiao();
    await varrer(espiao.enviar);
    expect(espiao.enviados).toHaveLength(0);
  });

  it("o aparelho de outro município não recebe o prazo deste", async () => {
    // O isolamento vale também para o que sai sozinho do servidor, sem
    // ninguém logado do outro lado.
    const equipeB = await mem.bruto.query<{ id: string }>(
      "INSERT INTO equipes (organizacao_id,nome) VALUES ($1,'Equipe Unica') RETURNING id", [orgB],
    );
    const agenteB = await mem.bruto.query<{ id: string }>(
      `INSERT INTO usuarios (organizacao_id,nome,matricula,email,papel,equipe_id)
       VALUES ($1,'Tarcisio','VF-3','tarcisio@valefundo.exemplo.gov.br','agente_campo',$2)
       RETURNING id`,
      [orgB, equipeB.rows[0]!.id],
    );
    await registrarAparelho(orgB, agenteB.rows[0]!.id, "ficha-do-vizinho");
    await registrarAparelho(orgA, agenteA, "ficha-do-diego");

    const espiao = envioEspiao();
    await varrer(espiao.enviar);

    expect(espiao.enviados.map((e) => e.alvo.ficha)).toEqual(["ficha-do-diego"]);
  });
});

describe("Idempotência: reiniciar não remanda", () => {
  it("a segunda varredura não manda de novo o que já foi entregue", async () => {
    /*
      É o caso do deploy e do reinício, e é por isso que quem lembra é a tabela
      e não a memória do processo: a memória morre junto com o processo, e o
      agente acordaria duas vezes com o mesmo aviso.
    */
    await registrarAparelho(orgA, agenteA, "ficha-do-diego");

    const primeira = envioEspiao();
    await varrer(primeira.enviar);
    expect(primeira.enviados).toHaveLength(1);

    const segunda = envioEspiao();
    const resumo = await varrer(segunda.enviar);

    expect(segunda.enviados).toHaveLength(0);
    expect(resumo.reivindicadas).toBe(0);
    expect(await notificacoes()).toHaveLength(1);
  });

  it("o que falhou volta a ser tentado depois da espera, e conta a tentativa", async () => {
    await registrarAparelho(orgA, agenteA, "ficha-do-diego");

    const falhou = envioEspiao(() => ({ desfecho: "falha", detalhe: "apns 429 TooManyRequests" }));
    await varrer(falhou.enviar);
    expect((await notificacoes())[0]!.desfecho).toBe("falha");

    // Sem esperar, a mesma varredura não tenta de novo: o intervalo existe
    // para não martelar um provedor que acabou de recusar.
    const cedoDemais = envioEspiao();
    await varrer(cedoDemais.enviar);
    expect(cedoDemais.enviados).toHaveLength(0);

    // Passada a espera, ela volta.
    await mem.bruto.query(
      "UPDATE notificacoes_enviadas SET enviada_em = now() - interval '30 minutes'",
    );
    const depois = envioEspiao();
    await varrer(depois.enviar);
    expect(depois.enviados).toHaveLength(1);

    const linha = (await notificacoes())[0]!;
    expect(linha.desfecho).toBe("entregue");
    expect(linha.tentativas).toBe(2);
  });

  it("notificação presa em enviando é retomada, e não fica órfã para sempre", async () => {
    /*
      O preço de reivindicar ANTES de enviar (que é o que impede o reenvio) é a
      linha que fica presa quando o processo morre entre uma coisa e outra.
      Sem retomada, aquele agente simplesmente nunca seria avisado, e ninguém
      teria como saber.
    */
    await registrarAparelho(orgA, agenteA, "ficha-do-diego");
    await mem.bruto.query(
      `INSERT INTO notificacoes_enviadas
         (organizacao_id, aparelho_id, ocorrencia_id, tipo, desfecho, enviada_em)
       SELECT $1, a.id, $2, 'prazo_vencendo', 'enviando', now() - interval '1 hour'
         FROM aparelhos a WHERE a.organizacao_id = $1`,
      [orgA, ocorrenciaA],
    );

    const espiao = envioEspiao();
    await varrer(espiao.enviar);
    expect(espiao.enviados).toHaveLength(1);
    expect((await notificacoes())[0]!.desfecho).toBe("entregue");
  });

  it("desiste depois do teto de tentativas, em vez de martelar para sempre", async () => {
    await registrarAparelho(orgA, agenteA, "ficha-do-diego");
    await mem.bruto.query(
      `INSERT INTO notificacoes_enviadas
         (organizacao_id, aparelho_id, ocorrencia_id, tipo, desfecho, enviada_em, tentativas)
       SELECT $1, a.id, $2, 'prazo_vencendo', 'falha', now() - interval '1 hour', 5
         FROM aparelhos a WHERE a.organizacao_id = $1`,
      [orgA, ocorrenciaA],
    );

    const espiao = envioEspiao();
    await varrer(espiao.enviar);
    expect(espiao.enviados).toHaveLength(0);
  });
});

describe("A trava impede duas máquinas de varrerem o mesmo prazo", () => {
  it("sem a trava, a varredura não manda nada e diz que estava travada", async () => {
    /*
      Em produção a API roda em mais de uma máquina, e as duas sobem o mesmo
      varredor. Sem trava, as duas encontram a mesma ocorrência no mesmo minuto
      e o agente recebe tudo em duplicata, no meio da noite, na rua.
      Notificação duplicada é o caminho mais curto para o agente desligar a
      notificação do aplicativo, e aí o produto perde o único canal que alcança
      quem está em campo.
    */
    await registrarAparelho(orgA, agenteA, "ficha-do-diego");
    const ocupada: Trava = {
      tentar: async () => false,
      soltar: async () => {},
      encerrar: async () => {},
    };

    const espiao = envioEspiao();
    const resumo = await varrer(espiao.enviar, ocupada);

    expect(resumo.travado).toBe(true);
    expect(espiao.enviados).toHaveLength(0);
    expect(await notificacoes()).toHaveLength(0);
  });

  it("a trava é solta mesmo quando a varredura estoura", async () => {
    // Uma exceção com a trava presa faria a máquina seguinte desistir de todas
    // as rodadas seguintes, e o produto pararia de avisar sem ninguém perceber.
    const trava = travaDeProcesso();
    const bancoQuebrado = {
      comTenant: mem.banco.comTenant,
      semTenant: async () => { throw new Error("banco fora do ar"); },
      encerrar: mem.banco.encerrar,
    };

    await expect(
      varrerAvisos({
        banco: bancoQuebrado as never,
        trava,
        enviar: envioEspiao().enviar,
        janelaMinutos: 60,
      }),
    ).rejects.toThrow("banco fora do ar");

    expect(await trava.tentar(), "a trava ficou presa depois do erro").toBe(true);
  });

  it("a trava de aviso do Postgres é chamável pelo papel de aplicação", async () => {
    /*
      LIMITAÇÃO CONHECIDA, escrita para não parecer mais do que é: o banco em
      WebAssembly tem uma conexão só, então aqui NÃO dá para provar que duas
      máquinas se excluem. O que dá para provar, e é o que este caso faz, é que
      o SQL existe, que o número da trava cabe num bigint e que o papel sem
      privilégio da aplicação consegue chamá-lo. A exclusão de verdade depende
      de duas conexões e foi conferida à mão contra Postgres de verdade.
    */
    const travou = await mem.banco.semTenant(async (c) => {
      const r = await c.query<{ travou: boolean }>(
        "SELECT pg_try_advisory_lock($1::bigint) AS travou",
        ["5410360016"],
      );
      return r.rows[0]!.travou;
    });
    expect(travou).toBe(true);

    await mem.banco.semTenant((c) =>
      c.query("SELECT pg_advisory_unlock($1::bigint)", ["5410360016"]),
    );
  });
});

describe("Falha de envio não derruba o resto", () => {
  it("um aparelho com problema não impede o aviso dos outros", async () => {
    /*
      O caso é o da noite de temporal: cinquenta avisos na fila, o terceiro
      esbarra num aparelho estranho, e sem o tratamento por notificação os
      quarenta e sete seguintes não sairiam.
    */
    await registrarAparelho(orgA, agenteA, "ficha-que-explode");
    const outro = await mem.bruto.query<{ id: string }>(
      `INSERT INTO usuarios (organizacao_id,nome,matricula,email,papel,equipe_id)
       VALUES ($1,'Marta Nunes','SA-9','marta@serraalta.exemplo.gov.br','agente_campo',$2)
       RETURNING id`,
      [orgA, equipeA],
    );
    await registrarAparelho(orgA, outro.rows[0]!.id, "ficha-boa");

    const enviados: string[] = [];
    const resumo = await varrer(async (alvo) => {
      enviados.push(alvo.ficha);
      if (alvo.ficha === "ficha-que-explode") throw new Error("socket hang up");
      return { desfecho: "entregue", detalhe: null };
    });

    expect(enviados).toHaveLength(2);
    expect(resumo.entregues).toBe(1);
    expect(resumo.falhas).toBe(1);
  });

  it("ficha recusada pelo provedor revoga o aparelho, e ele para de ser tentado", async () => {
    /*
      Reinstalar o aplicativo troca a ficha, e a antiga morre. Sem esta
      revogação, cada aparelho aposentado vira uma tentativa por varredura para
      sempre, e a lista de destinos só cresce.
    */
    await registrarAparelho(orgA, agenteA, "ficha-morta");

    const resumo = await varrer(async () => ({
      desfecho: "ficha_invalida", detalhe: "apns 410 Unregistered",
    }));
    expect(resumo.aparelhosRevogados).toBe(1);

    const aparelho = await mem.bruto.query<{ revogado_em: string | null; motivo_revogacao: string }>(
      "SELECT revogado_em, motivo_revogacao FROM aparelhos WHERE ficha = 'ficha-morta'",
    );
    expect(aparelho.rows[0]!.revogado_em).not.toBeNull();
    expect(aparelho.rows[0]!.motivo_revogacao).toMatch(/provedor/);

    // E não volta a ser tentado, nem depois da espera.
    await mem.bruto.query(
      "UPDATE notificacoes_enviadas SET enviada_em = now() - interval '1 hour'",
    );
    const depois = envioEspiao();
    await varrer(depois.enviar);
    expect(depois.enviados).toHaveLength(0);
  });

  it("o detalhe guardado não carrega a ficha do aparelho", async () => {
    // Esta coluna é a que o suporte abre para responder "você recebeu às
    // 14h32". Quem tem a ficha escreve na tela bloqueada do agente.
    await registrarAparelho(orgA, agenteA, "ficha-secreta-do-agente");
    await varrer(async (alvo) => {
      throw new Error(`falhou em /3/device/${alvo.ficha}`);
    });

    const linha = (await notificacoes())[0]!;
    expect(linha.desfecho).toBe("enviando");
    expect(JSON.stringify(linha)).not.toContain("ficha-secreta-do-agente");
  });
});

describe("Retenção e conexão", () => {
  it("aviso mais velho que a retenção é expurgado na própria varredura", async () => {
    /*
      A tabela cresce por multiplicação: trinta agentes e dez ocorrências com
      prazo por dia são trezentas linhas por dia, todo dia. Sem prazo de
      descarte, em um ano ela é a maior tabela do banco e não serve a ninguém,
      e guardar quem foi avisado sobre qual ocorrência sem finalidade declarada
      é exatamente o que a política de privacidade promete não fazer.
    */
    await registrarAparelho(orgA, agenteA, "ficha-do-diego");
    await varrer(envioEspiao().enviar);
    expect(await notificacoes()).toHaveLength(1);

    await mem.bruto.query(
      "UPDATE notificacoes_enviadas SET enviada_em = now() - interval '120 days'",
    );
    await varrerAvisos({
      banco: mem.banco,
      trava: travaDeProcesso(),
      enviar: envioEspiao().enviar,
      janelaMinutos: 60,
      retencaoDias: 90,
    });

    // A linha velha saiu. A que sobrou é a reivindicada de novo, porque a
    // ocorrência continua com prazo na janela.
    const restantes = await notificacoes();
    expect(restantes).toHaveLength(1);
    expect(restantes[0]!.tentativas).toBe(1);
  });

  it("a varredura pede pool próprio e pequeno, separado do das requisições", () => {
    /*
      Conferência do que a partida monta (ver `index.ts`): a varredura recebe
      um pool de duas conexões, e não o das requisições. Numa noite de chuva, a
      operação que não pode esperar é o agente sincronizando a vistoria, e não
      o aviso de prazo. O que este caso tranca é o número; que a partida use um
      banco separado está no código de `index.ts`, e é conferido por leitura.
    */
    const configuracao = montarConfiguracaoDoPool(
      "postgres://usuario:senha@exemplo:5432/dc360",
      { maximoConexoes: 2 },
    );
    expect(configuracao.max).toBe(2);
  });
});

describe("o piso da retenção, que existe porque a policy do banco tem um", () => {
  /*
    A migração 037 dá a `notificacoes_enviadas` uma policy de DELETE com a
    idade escrita dentro dela. Isso fecha um silêncio (expurgo que não apaga
    nada porque não há policy) e abre a porta para outro: retenção configurada
    ABAIXO do piso da policy faz o `DELETE` deixar de enxergar as linhas mais
    novas que o piso. Ele não estoura. Volta dizendo zero.

    O resultado seria dado pessoal guardado além do prazo, com um documento de
    privacidade afirmando que ele foi removido, e nada em log dizendo o
    contrário. Por isso a recusa é explícita e acontece ANTES de a varredura
    tocar no banco.
  */
  it("recusa retenção menor que o piso, em vez de apagar menos em silêncio", async () => {
    await expect(
      varrerAvisos({
        banco: mem.banco, trava: travaDeProcesso(), enviar: envioEspiao().enviar,
        janelaMinutos: 60, retencaoDias: RETENCAO_MINIMA_DIAS - 1,
      }),
    ).rejects.toThrow(/piso/);
  });

  it("a recusa nomeia a migração, para quem lê saber onde se conserta", async () => {
    await expect(
      varrerAvisos({
        banco: mem.banco, trava: travaDeProcesso(), enviar: envioEspiao().enviar,
        janelaMinutos: 60, retencaoDias: 7,
      }),
    ).rejects.toThrow(/037/);
  });

  /* O piso é piso, e não faixa: exatamente o valor dele passa. */
  it("exatamente o piso é aceito", async () => {
    const r = await varrerAvisos({
      banco: mem.banco, trava: travaDeProcesso(), enviar: envioEspiao().enviar,
      janelaMinutos: 60, retencaoDias: RETENCAO_MINIMA_DIAS,
    });
    expect(r).toBeTruthy();
  });
});
