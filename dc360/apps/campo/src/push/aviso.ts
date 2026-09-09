import { SEVERIDADES, type Severidade } from "@dc360/shared";

/**
 * A TERCEIRA BARREIRA: o aviso que chegou é deste município, ou não é?
 *
 * Este arquivo é o mais importante da metade aplicativo da notificação, e o
 * motivo não é de conforto, é a regra número um do projeto.
 *
 * A ficha de push identifica um APARELHO FÍSICO, e a unicidade dela no banco é
 * por município, de propósito: unicidade global obrigaria a rota de registro a
 * responder "essa ficha já existe", e essa resposta contaria a uma prefeitura
 * que aquele telefone também trabalha para outra. O custo assumido dessa
 * escolha está escrito na migração das fichas e em `push/mensagem.ts` da API: a
 * mesma ficha pode ficar viva em dois municípios ao mesmo tempo, e um aviso
 * despachado pela prefeitura A pode alcançar um aparelho que hoje está logado
 * na prefeitura B.
 *
 * O servidor faz duas barreiras (o município do token no registro, e o
 * `organizacaoId` carimbado no dado da mensagem). A terceira é esta, e ela é a
 * única que existe no lado onde as duas sessões se encontram: só o aplicativo
 * sabe quem está logado NESTE aparelho AGORA.
 *
 * Sem ela o defeito deixa de ser barulho e vira vazamento entre municípios: a
 * tela de tarefas do agente de B abriria a ocorrência de A, e a trilha de
 * auditoria de A registraria um acesso vindo de um usuário que ela não conhece.
 *
 * Por isso o descarte é SILENCIOSO. Nada aparece, nada toca, nada conta no
 * contador do ícone. Um aviso do tipo "chegou uma notificação que não é sua"
 * já contaria a existência de trabalho na outra prefeitura, que é exatamente o
 * que a unicidade por município evita.
 *
 * ## Onde esta decisão consegue agir, e onde não consegue
 *
 * Ela vale nos três pontos em que o aplicativo tem voz:
 *
 * 1. Aviso chegando com o aplicativo aberto: ele não é apresentado.
 * 2. Toque na notificação: nenhuma tela é aberta.
 * 3. Varredura da bandeja: o que já está lá é removido quando o aplicativo abre.
 *
 * O que ela NÃO consegue impedir, e isso precisa estar escrito: um aviso que
 * chega com o aplicativo fechado é desenhado na tela bloqueada pelo SISTEMA
 * OPERACIONAL, antes de qualquer código nosso rodar. A vitrine é genérica
 * ("Nova tarefa", "Prazo vencendo", sem protocolo e sem endereço, ver
 * `push/mensagem.ts` na API), então o que vaza nesse instante é a existência de
 * um aviso, não o conteúdo dele. A varredura da bandeja fecha a janela assim
 * que o aplicativo abre.
 */

/** Os dois avisos que o servidor manda. Ver `TipoDeAviso` na API. */
export const TIPOS_DE_AVISO = ["tarefa_nova", "prazo_vencendo"] as const;
export type TipoDeAviso = (typeof TIPOS_DE_AVISO)[number];

export type Aviso = {
  tipo: TipoDeAviso;
  /** O município dono do aviso. É com este campo que a barreira se fecha. */
  organizacaoId: string;
  ocorrenciaId: string;
  /** Escolhe o canal no Android. Ver `canais.ts`. */
  severidade: Severidade | null;
  prazoEm: string | null;
};

/**
 * De onde sair o dado, em cada plataforma.
 *
 * A API monta a mensagem uma vez e as duas lojas a entregam em formatos
 * diferentes, e o `expo-notifications` acrescenta um terceiro embrulho que
 * muda conforme o caminho de entrega (aplicativo aberto, toque na notificação,
 * abertura a frio):
 *
 * - APNs: o detalhe viaja AO LADO de `aps`, na raiz do objeto.
 * - FCM: o detalhe viaja dentro de `data`.
 * - `expo-notifications`: entrega em `content.data`, e conforme a versão e a
 *   plataforma pode aninhar mais uma vez em `body`.
 *
 * A lista abaixo é tentada em ordem, e a primeira que produzir um aviso legível
 * vence. Escrever "só olho em `data`" seria escolher uma das lojas e deixar a
 * outra sem barreira nenhuma, que é o pior desfecho possível aqui: o aparelho
 * que fica sem a terceira barreira é justamente o que vaza.
 */
function candidatos(bruto: unknown): Record<string, unknown>[] {
  if (typeof bruto !== "object" || bruto === null) return [];
  const raiz = bruto as Record<string, unknown>;
  const achados = [raiz];

  for (const chave of ["data", "body"]) {
    const dentro = raiz[chave];
    if (typeof dentro === "object" && dentro !== null) {
      const nivel1 = dentro as Record<string, unknown>;
      achados.push(nivel1);
      for (const interna of ["data", "body"]) {
        const nivel2 = nivel1[interna];
        if (typeof nivel2 === "object" && nivel2 !== null) {
          achados.push(nivel2 as Record<string, unknown>);
        }
      }
    }
  }
  return achados;
}

/**
 * Texto que veio da rede vira string aparada, ou nada.
 *
 * O FCM entrega todo o `data` como string, o APNs entrega o que foi escrito no
 * JSON. Número e booleano nunca deveriam chegar aqui, e se chegarem viram nada
 * em vez de virarem `"undefined"` por interpolação.
 */
function texto(valor: unknown): string | null {
  if (typeof valor !== "string") return null;
  const limpo = valor.trim();
  return limpo === "" ? null : limpo;
}

/**
 * Lê o aviso, ou devolve nulo.
 *
 * Exigente de propósito nos três campos que decidem alguma coisa: sem `tipo`
 * conhecido, sem `organizacaoId` e sem `ocorrenciaId` não existe aviso que este
 * aplicativo saiba tratar. Aceitar um aviso sem `organizacaoId` seria aceitar
 * um aviso que a barreira não consegue examinar, e é assim que uma barreira
 * vira decoração.
 *
 * `severidade` e `prazoEm` são opcionais porque a API os omite quando a
 * ocorrência não os tem, e a ausência deles não impede nada: severidade
 * desconhecida cai no canal comum, que é o silencioso.
 */
export function lerAviso(bruto: unknown): Aviso | null {
  for (const fonte of candidatos(bruto)) {
    const tipo = texto(fonte["tipo"]);
    const organizacaoId = texto(fonte["organizacaoId"]);
    const ocorrenciaId = texto(fonte["ocorrenciaId"]);
    if (!tipo || !organizacaoId || !ocorrenciaId) continue;
    if (!(TIPOS_DE_AVISO as readonly string[]).includes(tipo)) continue;

    const severidadeBruta = texto(fonte["severidade"]);
    const severidade =
      severidadeBruta && (SEVERIDADES as readonly string[]).includes(severidadeBruta)
        ? (severidadeBruta as Severidade)
        : null;

    return {
      tipo: tipo as TipoDeAviso,
      organizacaoId,
      ocorrenciaId,
      severidade,
      prazoEm: texto(fonte["prazoEm"]),
    };
  }
  return null;
}

export type MotivoDoDescarte = "ilegivel" | "sem_sessao" | "outro_municipio";

export type Veredito =
  | { entregar: true; aviso: Aviso }
  | { entregar: false; motivo: MotivoDoDescarte };

/**
 * Compara duas identidades de município.
 *
 * Apara e ignora caixa. Os dois lados são o mesmo UUID emitido pelo Postgres,
 * e caixa diferente entre eles seria diferença de formatação, nunca de
 * identidade: dobrar a caixa NÃO pode fazer dois UUIDs distintos virarem o
 * mesmo, porque hexadecimal só tem um par de formas por dígito.
 *
 * A alternativa (comparar byte a byte) parece mais segura e é pior: no dia em
 * que um dos lados mudasse a formatação, o aplicativo pararia de mostrar
 * notificação nenhuma e ninguém saberia por quê, porque descartar é silencioso.
 */
function mesmoMunicipio(a: string, b: string): boolean {
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

/**
 * A barreira.
 *
 * `organizacaoDaSessao` é o município de quem está logado NESTE aparelho, tal
 * como veio da resposta de `/auth/entrar`, que por sua vez veio do token
 * verificado no servidor. Nunca de parâmetro, nunca do próprio aviso.
 *
 * **Sem sessão, descarta.** Não é caso de borda, é o fechamento de uma brecha
 * real: quando o agente sai da conta sem sinal, o `/auth/sair` não alcança o
 * servidor e a ficha continua registrada lá. O aparelho segue recebendo tarefa
 * da equipe de quem já saiu, e num telefone de plantão que passa de turno em
 * turno isso é vazamento de dado operacional. Enquanto não há sessão, nada é
 * apresentado.
 *
 * **Sessão sem município conhecido também descarta**, e essa também é
 * deliberada. Acontece com quem já estava logado quando o aplicativo foi
 * atualizado: a identidade guardada no cofre é de uma versão que não gravava
 * `organizacaoId`. Entregar "porque provavelmente é do mesmo município" seria
 * trocar a regra número um por uma suposição. O agente volta a receber aviso
 * na próxima vez que entrar, e o preço disso é um plantão sem notificação,
 * contra o preço de mostrar ocorrência da prefeitura vizinha.
 */
export function decidirAviso(
  bruto: unknown,
  organizacaoDaSessao: string | null | undefined,
): Veredito {
  const aviso = lerAviso(bruto);
  if (!aviso) return { entregar: false, motivo: "ilegivel" };

  const daSessao = texto(organizacaoDaSessao);
  if (!daSessao) return { entregar: false, motivo: "sem_sessao" };

  if (!mesmoMunicipio(aviso.organizacaoId, daSessao)) {
    return { entregar: false, motivo: "outro_municipio" };
  }

  return { entregar: true, aviso };
}
