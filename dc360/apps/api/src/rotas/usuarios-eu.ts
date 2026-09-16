import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { Banco } from "../banco/tipos.js";
import { RegraDeNegocio, type Identidade } from "../servidor.js";
import { TIPOS_ACEITOS, type Armazenamento } from "../armazenamento/tipos.js";
import { lerUso } from "../armazenamento/uso.js";
import { registrarAtoAdministrativo } from "../trilha.js";

/**
 * QUEM SOU EU, e a foto que eu mesmo escolhi.
 *
 * O `GET /auth/eu` que já existia devolve quatro campos lidos do token e não
 * toca no banco. Esta rota é outra coisa: ela lê o cadastro, e existe porque
 * uma coisa do cadastro passou a ser escolhida pelo próprio servidor, a foto
 * de perfil. Mora em `/usuarios/eu`, e não em `/auth`, porque não é login: é o
 * que a pessoa que já está dentro vê e muda sobre si mesma.
 *
 * ## Por que estas rotas NÃO passam por `exigirPermissao`
 *
 * `CLAUDE.md` manda toda escrita passar por `exigirPermissao` antes do banco,
 * e a regra continua valendo: o que ela exige é que a permissão seja
 * conferida no servidor, e não que exista uma ação no pacote compartilhado
 * para todo ato. Trocar a PRÓPRIA foto não é ato sobre o município nem sobre
 * outra pessoa, e nenhuma das quinze ações de `permissoes.ts` o descreve;
 * emprestar uma (`gerenciar_usuarios`, digamos) deixaria o agente de campo
 * sem foto, que é exatamente quem pediu.
 *
 * O que substitui a ação aqui é a IDENTIDADE: o usuário vem do token
 * verificado, e todo UPDATE abaixo é `WHERE id = quem.usuarioId`, debaixo do
 * RLS do município. Não existe parâmetro que aponte para outra pessoa. É o
 * mesmo desenho de `POST /auth/trocar-senha` e de `POST /auth/encerrar-sessoes`,
 * que também são atos da pessoa sobre a própria conta, para qualquer papel.
 *
 * ## O ciclo de vida da foto, que é o mesmo da evidência
 *
 *   1. O aparelho pede autorização, dizendo tipo e tamanho.
 *   2. O servidor DECIDE a chave (sob `tenant/<org>/usuarios/<eu>/`) e devolve
 *      uma URL pré-assinada de vida curta.
 *   3. O aparelho envia os bytes direto para o armazenamento.
 *   4. O aparelho confirma com a chave; o servidor confere que o objeto
 *      existe, que a chave está sob o prefixo dele, grava, e só então apaga a
 *      foto anterior.
 *
 * Os bytes nunca passam por aqui (regra 1 de `armazenamento/tipos.ts`), e a
 * URL de leitura vence em minutos (regra 2). A chave crua nunca sai para a
 * tela: quem a tivesse poderia montar caminho de armazenamento à mão.
 *
 * ## O único DELETE de objeto fora do descarte de órfão, e o argumento
 *
 * `Armazenamento.apagar` diz, na declaração, que "nenhuma rota chama isto".
 * Esta rota passa a chamar, e a exceção precisa de argumento escrito, porque
 * este produto inteiro é construído contra apagar:
 *
 * - A fotografia de vistoria é PROVA MATERIAL de um ato administrativo, mostra
 *   a casa de uma família, e sai impressa num laudo que vai a processo. Por
 *   isso ela nunca se apaga por rota, e o descarte de órfão exige operador
 *   nomeado e motivo escrito.
 * - A foto de perfil não é prova de nada. É o retrato do servidor, escolhido
 *   por ele, e quem a substitui é ele mesmo. Guardar a anterior seria acumular
 *   dado pessoal sem finalidade, que é o que a minimização existe para
 *   impedir, e faria o balde do município crescer com rostos que ninguém mais
 *   quer ver ali.
 * - O rastro fica: `trilha_administrativa` guarda a chave anterior e a nova,
 *   com quem e quando, então a pergunta "que foto ele tinha em março" continua
 *   tendo resposta, mesmo sem o arquivo.
 *
 * A ordem é gravar primeiro e apagar depois, fora da transação: se o
 * apagamento falhar, o pior desfecho é um objeto a mais no balde, que a
 * varredura de órfão encontra. O oposto (apagar e depois falhar em gravar)
 * deixaria a pessoa sem foto nenhuma.
 *
 * ## A foto conta no teto do município (migração 045)
 *
 * Ela ocupa o mesmo balde das fotografias de vistoria, então entra na mesma
 * conta: `situacao_de_armazenamento` soma `usuarios.foto_bytes` junto com
 * `evidencias.tamanho_bytes`, e esta rota pergunta ao teto nos dois momentos
 * em que a rota de evidência pergunta. Na AUTORIZAÇÃO, com o tamanho que o
 * aparelho declarou, para não emitir URL de escrita num município que já
 * passou da margem. Na CONFIRMAÇÃO, com o tamanho lido do PRÓPRIO
 * armazenamento (nunca o declarado) menos o da foto que está saindo, na mesma
 * transação do UPDATE, e o gatilho `foto_dentro_do_teto` é a barreira de
 * baixo para qualquer caminho que escreva `foto_bytes` por fora daqui.
 *
 * A recusa é 507, como na evidência, e a frase é OUTRA: aqui não há fila
 * guardando coleta, e dizer "o envio vai ser tentado sozinho" seria mentira
 * para quem está olhando a tela de perfil. Uma foto recusada na confirmação é
 * apagada do balde na hora, porque ninguém mais vai apontar para ela.
 */

/**
 * O teto por foto de perfil: dois megabytes.
 *
 * Menor que o de evidência (quinze) de propósito: o aparelho redimensiona a
 * 512 pontos antes de enviar, e uma foto assim pesa dezenas de kilobytes. O
 * teto existe para o balde do município não virar disco pessoal, e dois
 * megabytes deixam folga para um aparelho que não conseguiu redimensionar.
 */
export const TAMANHO_MAXIMO_DA_FOTO_DE_PERFIL = 2 * 1024 * 1024;

/**
 * A frase da recusa por teto, para a foto de perfil.
 *
 * Diz que a foto NÃO foi guardada e que a foto anterior continua: é o que a
 * pessoa precisa saber na tela de perfil. Quem age é a coordenação, junto à
 * plataforma, e a frase manda para lá em vez de mandar tentar de novo.
 */
export function frasePorTetoEstouradoNaFoto(): string {
  return (
    "O armazenamento deste município passou do limite contratado, e a foto de "
    + "perfil não foi guardada. A sua foto anterior continua como estava. Avise "
    + "a coordenação, que precisa falar com a plataforma para ampliar o limite."
  );
}

const pedidoSchema = z.object({
  tipoConteudo: z.enum(TIPOS_ACEITOS),
  tamanhoBytes: z.number().int().positive().max(TAMANHO_MAXIMO_DA_FOTO_DE_PERFIL),
});

const confirmacaoSchema = z.object({
  chave: z.string().min(1).max(500),
});

/** O prefixo que toda chave de foto DESTA pessoa precisa ter. */
export function prefixoDaFoto(quem: Pick<Identidade, "organizacaoId" | "usuarioId">): string {
  return `tenant/${quem.organizacaoId}/usuarios/${quem.usuarioId}/`;
}

export async function rotasUsuariosEu(
  app: FastifyInstance,
  { banco, armazenamento }: { banco: Banco; armazenamento: Armazenamento },
): Promise<void> {
  async function lerFotoChave(quem: Identidade): Promise<string | null> {
    return banco.comTenant(quem.organizacaoId, async (c) => {
      const r = await c.query<{ foto_chave: string | null }>(
        "SELECT foto_chave FROM usuarios WHERE id = $1",
        [quem.usuarioId],
      );
      return r.rows[0]?.foto_chave ?? null;
    });
  }

  app.get("/", async (req) => {
    const quem = await app.exigirAutenticacao(req);
    const linha = await banco.comTenant(quem.organizacaoId, async (c) => {
      const r = await c.query<{
        nome: string; matricula: string; email: string; papel: string;
        equipe_id: string | null; foto_chave: string | null;
      }>(
        "SELECT nome, matricula, email, papel, equipe_id, foto_chave FROM usuarios WHERE id = $1",
        [quem.usuarioId],
      );
      return r.rows[0] ?? null;
    });
    if (!linha) throw new RegraDeNegocio("nao_encontrado", "Conta não encontrada.", 404);

    return {
      id: quem.usuarioId,
      nome: linha.nome,
      matricula: linha.matricula,
      email: linha.email,
      papel: linha.papel,
      equipeId: linha.equipe_id,
      fotoUrl: linha.foto_chave ? await armazenamento.urlParaLer(linha.foto_chave) : null,
    };
  });

  app.post("/foto/autorizar-envio", async (req, resposta) => {
    const quem = await app.exigirAutenticacao(req);
    const dados = pedidoSchema.parse(req.body);

    /*
      O TETO, antes de emitir qualquer URL de escrita. A conta soma o tamanho
      declarado ao que o município já ocupa (evidências vivas mais fotos de
      perfil vivas), debaixo do RLS do próprio município. `recusado` é só
      além da margem: acima do teto contratado a foto ainda passa, pela mesma
      régua da evidência.
    */
    const uso = await banco.comTenant(quem.organizacaoId, (c) => lerUso(c, dados.tamanhoBytes));
    if (uso.situacao === "recusado") {
      throw new RegraDeNegocio("teto_de_armazenamento", frasePorTetoEstouradoNaFoto(), 507);
    }

    /*
      A chave nasce AQUI, com sufixo único por envio. Sufixo, e não um nome
      fixo como `foto.jpg`: com nome fixo a troca sobrescreveria o objeto no
      lugar, e a URL assinada da foto anterior, ainda viva por alguns minutos
      na tela de um colega, passaria a servir bytes novos sob a mesma
      assinatura. Chave nova por foto é o que torna "trocar" um ato e não uma
      mutação silenciosa.
    */
    const extensao = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/heic": "heic" }[dados.tipoConteudo];
    const unico = `${Date.now().toString(36)}-${crypto.randomUUID().slice(0, 8)}`;
    const chave = `${prefixoDaFoto(quem)}foto-${unico}.${extensao}`;

    const envio = await armazenamento.urlParaEnviar({
      chave, tipoConteudo: dados.tipoConteudo, tamanhoBytes: dados.tamanhoBytes,
    });
    return resposta.code(201).send({
      chave, url: envio.url, cabecalhos: envio.cabecalhos, expiraEm: envio.expiraEm,
    });
  });

  app.put("/foto", async (req) => {
    const quem = await app.exigirAutenticacao(req);
    const { chave } = confirmacaoSchema.parse(req.body);

    /*
      O prefixo é conferido ANTES de perguntar ao armazenamento, e o 422 sai
      sem dizer se o objeto existe: confirmar existência de chave alheia seria
      um oráculo sobre o balde do vizinho. O banco confere de novo por CHECK
      (migração 040), para a regra valer para qualquer escrita futura.
    */
    if (!chave.startsWith(prefixoDaFoto(quem)) || chave.includes("..")) {
      throw new RegraDeNegocio(
        "chave_fora_do_lugar",
        "Essa chave não é de uma foto sua. Peça uma autorização de envio nova.",
        422,
      );
    }

    const objeto = await armazenamento.descrever(chave);
    if (!objeto.existe) {
      throw new RegraDeNegocio(
        "arquivo_ausente",
        "A foto não chegou ao armazenamento. Tente enviar de novo.",
        409,
      );
    }
    if (objeto.tamanhoBytes !== null && objeto.tamanhoBytes > TAMANHO_MAXIMO_DA_FOTO_DE_PERFIL) {
      throw new RegraDeNegocio(
        "arquivo_grande_demais",
        "A foto enviada passa do tamanho aceito para foto de perfil.",
        409,
      );
    }

    /*
      O tamanho que conta é o que o ARMAZENAMENTO diz, nunca o que o aparelho
      declarou na autorização. Sem ele (provedor que não informa), a foto
      conta zero, e isso está escrito na coluna (migração 045).
    */
    const bytes = objeto.tamanhoBytes;

    const anterior = await banco.comTenant(quem.organizacaoId, async (c) => {
      const antes = await c.query<{ foto_chave: string | null; foto_bytes: string | null }>(
        "SELECT foto_chave, foto_bytes::text AS foto_bytes FROM usuarios WHERE id = $1",
        [quem.usuarioId],
      );
      const chaveAnterior = antes.rows[0]?.foto_chave ?? null;
      const bytesAnteriores = Number(antes.rows[0]?.foto_bytes ?? 0);
      if (chaveAnterior === chave) return { chaveAnterior: null, recusada: false };

      /*
        O TETO, na MESMA transação do UPDATE, com o que entra menos o que sai:
        a foto anterior vai ser apagada do balde logo abaixo. Uma URL
        autorizada antes de o balde encher não pode virar porta na confirmação,
        e o gatilho `foto_dentro_do_teto` cobra a mesma conta por baixo.
      */
      const uso = await lerUso(c, Math.max((bytes ?? 0) - bytesAnteriores, 0));
      if (uso.situacao === "recusado") return { chaveAnterior: null, recusada: true };

      await c.query(
        "UPDATE usuarios SET foto_chave = $2, foto_bytes = $3 WHERE id = $1",
        [quem.usuarioId, chave, bytes],
      );
      await registrarAtoAdministrativo(c, quem, {
        acao: "foto_trocada",
        alvoTipo: "usuario",
        alvoId: quem.usuarioId,
        alvoNome: quem.nome,
        antes: { fotoChave: chaveAnterior },
        depois: { fotoChave: chave },
      });
      return { chaveAnterior, recusada: false };
    });

    if (anterior.recusada) {
      /*
        A foto recusada sai do balde AGORA: nenhuma linha aponta para ela, e
        deixá-la seria um objeto órfão nascido de propósito. Falha no
        apagamento não muda a resposta: a varredura de órfão a encontra.
      */
      await armazenamento.apagar(chave);
      throw new RegraDeNegocio("teto_de_armazenamento", frasePorTetoEstouradoNaFoto(), 507);
    }

    /*
      Apaga a anterior DEPOIS de gravar, fora da transação. Falha aqui não
      derruba a troca: o objeto que sobra é exatamente o que a varredura de
      órfão existe para encontrar, e a trilha já registrou qual era.
    */
    if (anterior.chaveAnterior) await armazenamento.apagar(anterior.chaveAnterior);

    return { fotoUrl: await armazenamento.urlParaLer(chave) };
  });

  app.delete("/foto", async (req, resposta) => {
    const quem = await app.exigirAutenticacao(req);
    const anterior = await lerFotoChave(quem);

    if (anterior) {
      await banco.comTenant(quem.organizacaoId, async (c) => {
        await c.query(
          "UPDATE usuarios SET foto_chave = NULL, foto_bytes = NULL WHERE id = $1",
          [quem.usuarioId],
        );
        await registrarAtoAdministrativo(c, quem, {
          acao: "foto_removida",
          alvoTipo: "usuario",
          alvoId: quem.usuarioId,
          alvoNome: quem.nome,
          antes: { fotoChave: anterior },
          depois: { fotoChave: null },
        });
      });
      await armazenamento.apagar(anterior);
    }

    // 204 mesmo sem foto: remover o que não há é o resultado pedido, não um erro.
    return resposta.code(204).send();
  });
}
