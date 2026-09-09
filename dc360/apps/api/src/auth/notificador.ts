/**
 * Por onde sai um aviso para uma pessoa.
 *
 * É uma porta, e não um cliente de email direto, por duas razões práticas: o
 * provedor ainda não foi escolhido (e a escolha tem implicação de custo e de
 * residência de dado), e um teste que precisasse de servidor de email nunca
 * seria rodado.
 *
 * O que NÃO passa por aqui: senha em claro, token de sessão, dado de saúde ou
 * qualquer coisa sobre a ocorrência. Uma mensagem de recuperação leva um link
 * de uso único e nada mais, porque email trafega e repousa fora do controle
 * do município.
 */
export type Mensagem = {
  para: string;
  nome: string;
  assunto: string;
  corpo: string;
};

export type Notificador = {
  enviar(mensagem: Mensagem): Promise<void>;
};

/**
 * Implementação de desenvolvimento: escreve no log do servidor.
 *
 * Em produção a configuração exige um notificador de verdade; subir sem ele
 * faria a recuperação responder "enviamos o link" sem enviar nada, que é pior
 * do que não ter recuperação.
 */
export function notificadorDeLog(
  registrar: (mensagem: string) => void = console.log,
): Notificador {
  return {
    async enviar(m) {
      // Só o suficiente para saber que a notificação aconteceu: destinatário
      // parcialmente encoberto e assunto. NADA do corpo, porque o corpo carrega
      // o link de redefinição, que é credencial de uso único viva por meia hora,
      // capaz de assumir qualquer conta de qualquer município. Ela saía por
      // `console.log`, ou seja, por fora do `redact` do Fastify.
      const encoberto = m.para.replace(/^(.)[^@]*(@.*)$/, "$1***$2");
      registrar(`[notificacao] para=${encoberto} assunto="${m.assunto}"`);
    },
  };
}

/**
 * Implementação de teste: grava a mensagem INTEIRA num arquivo.
 *
 * Existe por um motivo específico e vale registrar, porque a alternativa
 * parecia mais simples e estava errada.
 *
 * A suíte de ponta a ponta contra a API precisa do link de redefinição para
 * conferir o fluxo de recuperação de senha. Ela colhia esse link do log do
 * servidor. No dia em que o log parou de imprimir o corpo, por segurança e com
 * razão, 49 das 103 verificações deixaram de ser alcançadas, e ninguém viu,
 * porque essa suíte nunca esteve na integração contínua.
 *
 * Voltar a imprimir no log seria trocar a cobertura pela credencial. O canal
 * separado resolve os dois: o log continua limpo e o teste continua tendo onde
 * ler.
 *
 * A trava está em `config.ts`: `NOTIFICADOR_ARQUIVO` derruba a partida em
 * produção. Um arquivo com link de redefinição de qualquer conta de qualquer
 * município é exatamente o que não pode existir num servidor de verdade.
 */
export function notificadorDeArquivo(caminho: string): Notificador {
  return {
    async enviar(m) {
      const { appendFile } = await import("node:fs/promises");
      await appendFile(
        caminho,
        `[notificacao] para=${m.para} assunto="${m.assunto}"
${m.corpo}
---
`,
        "utf8",
      );
    },
  };
}

export function mensagemDeRecuperacao(
  nome: string,
  email: string,
  link: string,
  minutos: number,
): Mensagem {
  return {
    para: email,
    nome,
    assunto: "Redefinição de senha, Defesa Civil Operacional 360",
    corpo:
      `Olá, ${nome}.\n\n` +
      `Alguém pediu a redefinição da sua senha. Se foi você, use o link abaixo. ` +
      `Ele vale por ${minutos} minutos e funciona uma vez só.\n\n` +
      `${link}\n\n` +
      `Se não foi você, ignore esta mensagem: sua senha continua a mesma e ` +
      `nenhuma sessão foi encerrada.\n`,
  };
}

/**
 * O notificador de produção enquanto não existe provedor: recusa, alto.
 *
 * Deliberadamente pior de usar que o de log, e melhor de ter. Sem provedor, a
 * alternativa honesta não é escrever o link em algum lugar: é a recuperação
 * dizer que não está disponível e mandar procurar quem administra o município,
 * que consegue redefinir a senha de qualquer jeito.
 */
export function notificadorIndisponivel(): Notificador {
  return {
    async enviar() {
      throw new Error(
        "Não há provedor de notificação configurado: nenhuma mensagem foi "
        + "enviada. Defina NOTIFICADOR_URL e NOTIFICADOR_CHAVE.",
      );
    },
  };
}

/**
 * Tira de um texto qualquer endereço que apareça no corpo da mensagem.
 *
 * O corpo carrega o link de uso único, e link de uso único é credencial. Um
 * provedor transacional costuma ecoar o pedido inteiro dentro do corpo do erro
 * ("campo `text` inválido: ..."), e esse corpo de erro vai para o log do
 * servidor e para a coluna `detalhe` da tentativa de envio, que é lida pelo
 * suporte. Sem esta limpeza, um erro de configuração do provedor grava o link
 * do dossiê de uma família em dois lugares que ninguém trata como segredo.
 *
 * Recorta por endereço inteiro, e não pelo token: assim vale para o link de
 * redefinição de senha e para o do ofício sem precisar saber qual dos dois é.
 */
export function semOsEnderecos(texto: string, corpo: string): string {
  let limpo = texto;
  for (const endereco of corpo.match(/https?:\/\/\S+/g) ?? []) {
    limpo = limpo.split(endereco).join("[endereco removido]");
  }
  return limpo;
}

const TETO_DO_ERRO = 300;

/**
 * O cliente de verdade: um POST para a API HTTP de um provedor transacional.
 *
 * É a peça que faltava, e a falta era silenciosa da pior maneira.
 * `NOTIFICADOR_URL` e `NOTIFICADOR_CHAVE` existiam na configuração, a partida
 * em produção recusava subir com a recuperação de senha ligada sem elas, e
 * NENHUMA linha do servidor jamais as leu. O produto conferia o endereço de um
 * provedor com o qual nunca falou, e toda mensagem caía no notificador de log.
 *
 * Sem dependência nova de propósito: a API de um provedor transacional é um
 * POST com JSON, e `fetch` é do Node desde a versão 18. Um SDK aqui traria
 * uma árvore de dependências inteira para dentro do `npm audit` de um produto
 * que precisa fechar em zero, em troca de nada.
 *
 * Três decisões que valem estar escritas:
 *
 * 1. **Tempo limite explícito.** Sem ele, um provedor que aceita a conexão e
 *    não responde pendura a requisição do coordenador até o limite do
 *    servidor. Dez segundos é mais do que qualquer API transacional leva.
 * 2. **Erro sobe como exceção.** Quem chama decide o que fazer: a recuperação
 *    de senha responde ao usuário, e o ofício grava a tentativa como falha.
 *    Engolir aqui produziria o defeito que este arquivo inteiro existe para
 *    fechar, que é responder "enviamos" sem ter enviado.
 * 3. **O corpo da resposta do provedor passa pela limpeza acima** antes de
 *    virar mensagem de erro.
 */
export function notificadorHttp(opcoes: {
  url: string;
  chave: string;
  /** Remetente, quando o provedor exige. Vai no corpo, e o provedor valida. */
  remetente?: string;
  /** Injeção para o teste: sem isto não haveria como exercitar o cliente. */
  buscar?: typeof fetch;
  tempoLimiteMs?: number;
}): Notificador {
  const buscar = opcoes.buscar ?? fetch;
  const tempoLimiteMs = opcoes.tempoLimiteMs ?? 10_000;

  return {
    async enviar(m) {
      let resposta: Response;
      try {
        resposta = await buscar(opcoes.url, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            authorization: `Bearer ${opcoes.chave}`,
          },
          body: JSON.stringify({
            ...(opcoes.remetente ? { de: opcoes.remetente } : {}),
            para: m.para,
            nome: m.nome,
            assunto: m.assunto,
            texto: m.corpo,
          }),
          signal: AbortSignal.timeout(tempoLimiteMs),
        });
      } catch (erro) {
        const bruto = erro instanceof Error ? erro.message : String(erro);
        throw new Error(
          `O provedor de email nao respondeu: ${semOsEnderecos(bruto, m.corpo).slice(0, TETO_DO_ERRO)}`,
        );
      }

      if (!resposta.ok) {
        const corpo = await resposta.text().catch(() => "");
        throw new Error(
          `O provedor de email recusou o envio (HTTP ${resposta.status}): `
          + semOsEnderecos(corpo, m.corpo).slice(0, TETO_DO_ERRO),
        );
      }
    },
  };
}
