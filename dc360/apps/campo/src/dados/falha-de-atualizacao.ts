import { SemSinal } from "./api";

/**
 * Por que a atualização não aconteceu, na única divisão que muda o que o
 * agente FAZ a seguir.
 *
 * Este arquivo existe por causa de um relato de uso real, em 14/09/2026: uma
 * ocorrência foi despachada às 21h46 no painel e nunca apareceu no aparelho, e
 * a única coisa que o aplicativo dizia era "Não deu para atualizar agora". A
 * causa não era rede: a sessão daquele aparelho tinha sido revogada pelo
 * servidor nove horas antes, e desde então TODA chamada respondia 401. O
 * aplicativo tratava isso como sinal ruim, que é o defeito: sinal ruim passa
 * sozinho, sessão encerrada não passa nunca, e as duas frases mandavam o
 * agente fazer a mesma coisa (esperar).
 *
 * São cinco desfechos porque são cinco atos diferentes:
 *
 * | Motivo | O que o agente faz |
 * | --- | --- |
 * | `sem-sinal` | espera o sinal voltar, e continua trabalhando no que baixou |
 * | `sessao-encerrada` | entra de novo, e ATÉ LÁ nada novo desce |
 * | `conta-desativada` | NADA que ele faça resolve: quem resolve é a coordenação |
 * | `acesso-suspenso` | NADA que ele faça resolve: quem resolve é quem administra o contrato |
 * | `outro` | tenta de novo daqui a pouco |
 *
 * O `conta-desativada` entrou com a V2-F00-E06. O 403 `conta_desativada` caía em
 * `outro` ("tenta de novo daqui a pouco"), e tentar de novo contra uma conta
 * desativada não resolve nunca. É lido pelo CÓDIGO, não pelo status, pelo mesmo
 * motivo da suspensão: o 403 também serve a `sem_permissao`, que é outra coisa.
 *
 * O quarto entrou com a suspensão de acesso pelo fornecedor (migração 038 e
 * `auth/suspensao.ts` na API). Ele existe separado do segundo porque a frase
 * do segundo manda entrar de novo, e entrar de novo num município suspenso dá
 * 403 para sempre: o botão mandaria o agente fazer a única coisa que não
 * resolve, e ainda apagaria do aparelho a identidade que carimba a coleta. A
 * API responde `acesso_suspenso` inclusive ao token VENCIDO que este
 * aplicativo continua apresentando depois que a renovação falha, e é isso
 * que permite classificar aqui em vez de adivinhar.
 *
 * Mora fora das telas porque as duas telas que vão à rede (a lista de hoje e o
 * perfil) precisam da mesma classificação, e porque o Rafa viu a mesma frase
 * errada nas duas.
 */

export type MotivoDaFalha =
  | "sem-sinal"
  | "sessao-encerrada"
  | "conta-desativada"
  | "acesso-suspenso"
  | "outro";

/**
 * Se o motivo é o fim da linha para o que a tela faz (nada novo desce até a
 * pessoa agir), o que pede o tom de perigo. Os outros passam sozinhos ou com
 * o tempo. Fica aqui para as telas não repetirem a lista a cada aviso.
 */
export function ehFimDeLinha(motivo: MotivoDaFalha): boolean {
  return motivo === "sessao-encerrada" || motivo === "conta-desativada";
}

/**
 * O status HTTP que veio dentro do erro, quando veio algum.
 *
 * Lê por FORMA, e não por `instanceof ErroDaApi`, e isso é deliberado. A
 * identidade de uma classe não atravessa bem fronteira de módulo: as suítes de
 * tela dublam `dados/api` inteiro, e um `instanceof` contra uma classe ausente
 * do dublê nem responde falso, ele estoura ("right-hand side is not
 * callable"). O que identifica uma resposta do servidor é ela carregar um
 * status numérico, e é isso que está perguntado aqui. É a mesma escolha que
 * `apps/api/src/servidor.ts` já faz para reconhecer erro de esquema vindo de
 * outra cópia do zod.
 */
function statusDaResposta(erro: unknown): number | null {
  if (typeof erro !== "object" || erro === null) return null;
  const status = (erro as { status?: unknown }).status;
  return typeof status === "number" ? status : null;
}

/** O código de erro que veio no corpo da resposta, pela mesma forma. */
function codigoDaResposta(erro: unknown): string | null {
  if (typeof erro !== "object" || erro === null) return null;
  const codigo = (erro as { codigo?: unknown }).codigo;
  return typeof codigo === "string" ? codigo : null;
}

export function motivoDaFalha(erro: unknown): MotivoDaFalha {
  /*
    A suspensão é lida pelo CÓDIGO, e não pelo status, de propósito: a API
    responde 403 nas rotas comuns e 503 nas rotas da fila (para a fila esperar
    em vez de bloquear a coleta). O código é o mesmo nos dois, e é ele que diz
    o que houve. Vem antes do 401 porque um 401 nunca carrega este código, e
    antes do `SemSinal` pela mesma razão do 401: a requisição chegou.
  */
  if (statusDaResposta(erro) !== null && codigoDaResposta(erro) === "acesso_suspenso") {
    return "acesso-suspenso";
  }
  /*
    A conta desativada é lida pelo código, antes do 401 e do `outro`: o status
    é 403, e 403 sozinho também é `sem_permissao` (perfil sem direito a esta
    ação), que não tem nada a ver com a conta.
  */
  if (statusDaResposta(erro) !== null && codigoDaResposta(erro) === "conta_desativada") {
    return "conta-desativada";
  }
  /*
    O 401 vem na frente do `SemSinal` de propósito: um erro que carrega status
    é resposta do servidor, ou seja, a requisição CHEGOU. Não há sinal a
    esperar.
  */
  if (statusDaResposta(erro) === 401) return "sessao-encerrada";
  if (erro instanceof SemSinal) return "sem-sinal";
  return "outro";
}

/**
 * O que a tela escreve, em duas alturas.
 *
 * `resumo` cabe numa linha (é o que a faixa da lista de hoje mostra) e
 * `detalhe` é o texto inteiro, que o agente abre quando quiser.
 *
 * `oQueSobrouNaTela` é a única parte que muda de tela para tela: na lista é a
 * lista baixada, no perfil é o que já estava no aparelho. Falhar em atualizar
 * NÃO é falhar em mostrar, e a frase precisa dizer isso onde quer que apareça.
 */
export function comoContarAFalha(
  motivo: MotivoDaFalha,
  oQueSobrouNaTela: string,
): { resumo: string; detalhe: string } {
  if (motivo === "sessao-encerrada") {
    return {
      /*
        Curto porque a faixa mostra UMA linha e corta o resto. No aparelho, a
        versão anterior saía como "Sua sessão terminou neste aparel…", e o que
        fazer ficava escondido atrás do toque no `ⓘ`. Em três palavras a frase
        inteira cabe, e o botão ao lado dela diz o resto.
      */
      resumo: "Sua sessão terminou",
      /*
        A frase NÃO diz "entre de novo" e para por aí. Sair da conta é o ato
        que o agente mais teme no fim do plantão (é o que ele acha que apaga a
        vistoria que ele fez no morro), então a promessa de que nada se perde
        vem junto, no mesmo parágrafo. Ela é verdade e está provada, e por DOIS
        caminhos: a fila fica fora de `apagarDadosLocais` de propósito e cada
        item dela carimba o autor; e o botão "Entrar de novo" chama
        `encerrarSessaoVencida`, que não apaga nada, então a vistoria COMEÇADA
        (rascunho, fotos, assinatura) também fica. A frase NÃO manda a pessoa a
        "Sair da conta": esse é o verbo do fim do turno, e ele apaga a vistoria
        começada. Era o que a versão anterior mandava fazer.
      */
      detalhe:
        "O servidor não reconhece mais a sua entrada neste aparelho, então nenhuma "
        + "tarefa nova desce até você entrar outra vez. Toque em \"Entrar de novo\" "
        + "e entre com o seu email e a sua senha. Nada é apagado: a vistoria começada, "
        + "as fotos e o que você já coletou continuam neste aparelho e voltam para "
        + "você assim que entrar com a sua conta.",
    };
  }
  if (motivo === "conta-desativada") {
    return {
      resumo: "Conta desativada",
      /*
        Três coisas, nesta ordem: o fato, o que NÃO resolve (entrar de novo e
        sair da conta, que apagaria a identidade que carimba a coleta), e a
        promessa com o próximo passo. A promessa é verdade pelo mesmo desenho da
        sessão encerrada, e por um a mais: desde a V2-F00-E06 a fila trata o 403
        `conta_desativada` como pausa, e não como recusa da coleta, então o item
        espera em vez de virar bloqueado com "Descartar" embaixo.
      */
      detalhe:
        "Sua conta foi desativada e nada novo desce para este aparelho. Entrar de "
        + "novo não resolve: suas coletas continuam guardadas neste aparelho, "
        + "procure a coordenação do seu município.",
    };
  }
  if (motivo === "acesso-suspenso") {
    return {
      resumo: "Acesso suspenso pelo fornecedor",
      /*
        Três coisas, nesta ordem: quem fez (não foi a coordenação nem o
        agente), quem resolve (o contrato, não a senha), e a promessa de que a
        coleta continua guardada. A promessa é verdade pelos mesmos motivos da
        sessão encerrada, e por um a mais: a API responde à fila com um código
        que ela trata como temporário, então o item espera em vez de virar
        bloqueado com "Descartar" embaixo. NÃO diz "entre de novo": entrar de
        novo dá a mesma recusa, e sair da conta antes disso apagaria a
        identidade que carimba a coleta.
      */
      detalhe:
        "O fornecedor do sistema suspendeu o acesso da sua prefeitura, e por isso "
        + "nada novo desce para este aparelho. Sair da conta ou tentar entrar outra "
        + "vez não resolve: quem resolve é quem administra o contrato na prefeitura. "
        + "O que você já coletou continua guardado no aparelho e sobe sozinho se o "
        + "acesso voltar.",
    };
  }
  if (motivo === "sem-sinal") {
    return {
      resumo: "Sem sinal para atualizar",
      detalhe: `Sem sinal para atualizar. ${oQueSobrouNaTela}`,
    };
  }
  return {
    resumo: "Não deu para atualizar agora",
    detalhe: `Não deu para atualizar agora. ${oQueSobrouNaTela}`,
  };
}
