import { useEffect, useRef, useState } from "react";
import type { FormEvent, ReactNode } from "react";
import { useSearchParams } from "react-router-dom";
import { MODO, pedirRecuperacao, redefinirSenha, situacaoDaRecuperacao } from "../dados/repositorio";
import { Aviso, AvisoDeObrigatorios } from "../componentes/comuns";
import { Campo } from "../componentes/Campo";
import { useTitulo } from "../seo/titulo";
import {
  FRASES, classificarFalha, fraseDaFalhaDaRedefinicao, fraseDaFalhaDoPedido,
  validarEmailDoPedido, validarSenhaNova, type ErroDaSenhaNova,
} from "./recuperar-regras";

/**
 * Recuperação de senha, em duas telas que compartilham a mesma moldura.
 *
 * A primeira pede o email. A resposta é sempre a mesma, exista a conta ou
 * não, e a tela repete isso ao pé da letra: se ela dissesse "email não
 * encontrado", viraria um verificador de quais servidores estão cadastrados
 * na prefeitura.
 *
 * A segunda recebe o link e define a senha nova. Ela não entra no sistema
 * depois: quem redefiniu digita a senha uma vez no login, e é isso que
 * confirma que a nova senha funciona.
 *
 * Cada tela é DUAS peças: uma que decide (estado, chamadas ao servidor) e uma
 * que só desenha o que lhe mandaram (`TelaDoPedido`, `TelaDaRedefinicao`). A
 * segunda existe separada para cada estado poder ser desenhado e conferido
 * sozinho, sem servidor, e é por ela que as capturas de erro, de link vencido e
 * de recuperação desligada saem iguais ao que a pessoa vê.
 *
 * A "Voltar para a entrada" é um `<a>` comum, e não um `Link` do roteador, de
 * propósito: a página `/redefinir-senha` é servida com `Referrer-Policy:
 * no-referrer` (`vercel.json`), e uma política vale para o documento inteiro.
 * Navegar por dentro do roteador levaria essa política para o painel depois do
 * login, e o mapa do Google (cuja chave é restrita por referenciador) pararia
 * de carregar até a próxima recarga. Recarregar é barato aqui e fecha isso.
 */
function Moldura({ titulo, subtitulo, children, comVolta = true }: {
  titulo: string;
  subtitulo: string;
  children: ReactNode;
  /** Falso na confirmação da senha nova: o botão "Entrar" já é a ida à entrada, e um segundo link para o mesmo lugar só repetiria. */
  comVolta?: boolean;
}) {
  return (
    <div className="entrada">
      <div className="entrada__painel">
        <div className="entrada__marca">
          <span className="entrada__sigla" aria-hidden="true">DC</span>
          <div>
            <h1 className="entrada__titulo">{titulo}</h1>
            <p className="entrada__subtitulo">{subtitulo}</p>
          </div>
        </div>
        <section className="cartao">
          <div className="cartao__corpo">{children}</div>
        </section>
        {comVolta && (
          <p className="entrada__rodape">
            <a href="/entrar">{FRASES.voltar}</a>
          </p>
        )}
      </div>
    </div>
  );
}

/**
 * O que fazer quando o email não sai: procurar quem administra.
 *
 * Aparece nas duas telas (o pedido e o link), porque o caminho é o mesmo e a
 * pessoa chega nele por dois lados. Os passos apontam o botão "Redefinir senha"
 * da lista de Usuários, que é o caminho que de fato funciona hoje (V2-F00-E09).
 */
function SemEmail() {
  return (
    <>
      <Aviso tom="alerta">{FRASES.desligadaAviso}</Aviso>
      <p className="entrada__texto">{FRASES.desligadaIntroducao}</p>
      <ol className="passos">
        {FRASES.desligadaPassos.map((passo) => <li key={passo}>{passo}</li>)}
      </ol>
    </>
  );
}

// ---------------------------------------------------------------------------
// Pedir o link
// ---------------------------------------------------------------------------

export type FaseDoPedido = "verificando" | "desligada" | "local" | "formulario" | "enviado";

export type PropsDoPedido = {
  fase: FaseDoPedido;
  email: string;
  enviando: boolean;
  /** Erro do campo de email (vazio, formato). */
  erroDoCampo: string | null;
  /** Falha do envio que não é do campo: rede, excesso de pedidos, servidor. */
  falha: string | null;
  aoMudarEmail: (valor: string) => void;
  aoEnviar: (evento: FormEvent) => void;
  aoPedirDeNovo: () => void;
};

export function TelaDoPedido(p: PropsDoPedido) {
  /*
    O FOCO ACOMPANHA A TROCA DE TELA (WCAG 2.4.3 e 4.1.3).

    Enviar o pedido faz o formulário (e o botão que tinha o foco) sumir, e o
    foco caía em `BODY`. Agora ele vai para a confirmação. UM mecanismo só: o
    foco. A confirmação (`Aviso` com `foco`) não é região viva, porque uma
    região inserida já com o texto pode nem ser anunciada, e com o foco em cima
    seria lida duas vezes. Ao "Pedir de novo" o botão também some, e o foco
    volta para o campo de email.
  */
  const confirmacao = useRef<HTMLDivElement>(null);
  const faseAnterior = useRef(p.fase);
  useEffect(() => {
    if (p.fase === "enviado") confirmacao.current?.focus();
    else if (faseAnterior.current === "enviado") document.getElementById("recuperar-email")?.focus();
    faseAnterior.current = p.fase;
  }, [p.fase]);

  const subtitulo = p.fase === "desligada" ? FRASES.desligadaSubtitulo : FRASES.pedidoSubtitulo;
  return (
    <Moldura titulo={FRASES.pedidoTitulo} subtitulo={subtitulo}>
      {p.fase === "verificando" && (
        <div className="entrada__verificando" role="status" aria-live="polite">
          <div className="girador" aria-hidden="true" />
          <p>{FRASES.pedidoVerificando}</p>
        </div>
      )}

      {p.fase === "desligada" && <SemEmail />}

      {p.fase === "enviado" && (
        <>
          <Aviso tom="sucesso" foco={confirmacao}>{FRASES.pedidoEnviado}</Aviso>
          <p className="entrada__texto entrada__texto--apoio">{FRASES.pedidoEnviadoApoio}</p>
          <button type="button" className="botao botao--secundario"
                  style={{ width: "100%" }} onClick={p.aoPedirDeNovo}>
            {FRASES.pedidoDeNovo}
          </button>
        </>
      )}

      {(p.fase === "formulario" || p.fase === "local") && (
        <form onSubmit={p.aoEnviar} noValidate aria-busy={p.enviando}>
          {p.fase === "local" && <Aviso tom="alerta">{FRASES.pedidoLocal}</Aviso>}
          <Campo id="recuperar-email" rotulo={FRASES.pedidoRotulo} erro={p.erroDoCampo}
                 dica={FRASES.pedidoDica}>
            {(campo) => (
              <input {...campo} type="email" value={p.email} autoComplete="email"
                     inputMode="email" autoCapitalize="none" spellCheck={false}
                     onChange={(e) => p.aoMudarEmail(e.target.value)} />
            )}
          </Campo>
          {p.falha && <Aviso tom="perigo">{p.falha}</Aviso>}
          <button type="submit" className="botao botao--primario"
                  style={{ width: "100%" }} disabled={p.enviando || p.fase === "local"}>
            {p.enviando ? FRASES.pedidoBotaoEnviando : FRASES.pedidoBotao}
          </button>
        </form>
      )}
    </Moldura>
  );
}

export function RecuperarSenha() {
  useTitulo("Recuperar senha");
  const [fase, setFase] = useState<FaseDoPedido>(MODO === "local" ? "local" : "verificando");
  const [email, setEmail] = useState("");
  const [erroDoCampo, setErroDoCampo] = useState<string | null>(null);
  const [falha, setFalha] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  /*
    Pergunta ao servidor se a recuperação está ligada ANTES de mostrar o
    formulário. Falha da pergunta NÃO vira "desligada": a tela cai no
    formulário e o próprio pedido conta a verdade (503 `recuperacao_desligada`),
    porque uma leitura que falhou por sinal fraco não pode fechar a porta de
    quem só quer pedir o link.
  */
  useEffect(() => {
    if (MODO === "local") return;
    let cancelado = false;
    situacaoDaRecuperacao()
      .then((r) => { if (!cancelado) setFase(r.ativa ? "formulario" : "desligada"); })
      .catch(() => { if (!cancelado) setFase("formulario"); });
    return () => { cancelado = true; };
  }, []);

  async function enviar(evento: FormEvent) {
    evento.preventDefault();
    setFalha(null);
    const erro = validarEmailDoPedido(email);
    setErroDoCampo(erro);
    if (erro) {
      document.getElementById("recuperar-email")?.focus();
      return;
    }
    setEnviando(true);
    try {
      await pedirRecuperacao(email.trim());
      // A frase é a da tela, e não a do servidor: ver `recuperar-regras.ts`.
      setFase("enviado");
    } catch (e: unknown) {
      if (classificarFalha(e) === "desligada") setFase("desligada");
      else setFalha(fraseDaFalhaDoPedido(e));
    } finally {
      setEnviando(false);
    }
  }

  return (
    <TelaDoPedido
      fase={fase} email={email} enviando={enviando}
      erroDoCampo={erroDoCampo} falha={falha}
      aoMudarEmail={(v) => { setEmail(v); setErroDoCampo(null); }}
      aoEnviar={enviar}
      aoPedirDeNovo={() => { setFase("formulario"); setFalha(null); }}
    />
  );
}

// ---------------------------------------------------------------------------
// Definir a senha nova
// ---------------------------------------------------------------------------

export type FaseDaRedefinicao = "sem-link" | "link-invalido" | "desligada" | "formulario" | "pronto";

export type PropsDaRedefinicao = {
  fase: FaseDaRedefinicao;
  senha: string;
  repetida: string;
  salvando: boolean;
  erroDeSenha: ErroDaSenhaNova | null;
  falha: string | null;
  aoMudarSenha: (valor: string) => void;
  aoMudarRepetida: (valor: string) => void;
  aoEnviar: (evento: FormEvent) => void;
};

export function TelaDaRedefinicao(p: PropsDaRedefinicao) {
  /*
    O FOCO VAI PARA A CONFIRMAÇÃO DEPOIS DE REDEFINIR (WCAG 2.4.3 e 4.1.3).

    "Definir nova senha" faz o formulário sumir e o foco caía em `BODY`; a
    confirmação, além disso, entrava no DOM já com o texto, e região viva
    inserida assim pode não ser anunciada (quem lê devagar ou usa leitor de tela
    perdia a mensagem, o mesmo motivo da retirada do relógio). Escolha: UM
    mecanismo, o FOCO. O foco no `Aviso` faz o leitor ler a frase inteira, vale
    para teclado e para toque, e não depende de a região já existir antes do
    texto. Por isso o aviso com `foco` não é `role="status"`: os dois juntos
    seriam lidos duas vezes. Os hooks ficam antes dos retornos antecipados.
  */
  const confirmacao = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (p.fase === "pronto") confirmacao.current?.focus();
  }, [p.fase]);

  if (p.fase === "sem-link") {
    return (
      <Moldura titulo={FRASES.pedidoTitulo} subtitulo={FRASES.semLinkSubtitulo}>
        <Aviso tom="perigo">{FRASES.semLink}</Aviso>
        <a className="botao botao--primario entrada__acao" href="/recuperar-senha">
          {FRASES.pedirNovoLink}
        </a>
      </Moldura>
    );
  }

  if (p.fase === "link-invalido") {
    return (
      <Moldura titulo={FRASES.pedidoTitulo} subtitulo={FRASES.linkInvalidoSubtitulo}>
        <Aviso tom="perigo">{FRASES.linkInvalido}</Aviso>
        <a className="botao botao--primario entrada__acao" href="/recuperar-senha">
          {FRASES.pedirNovoLink}
        </a>
      </Moldura>
    );
  }

  if (p.fase === "desligada") {
    return (
      <Moldura titulo={FRASES.pedidoTitulo} subtitulo={FRASES.desligadaSubtitulo}>
        <SemEmail />
      </Moldura>
    );
  }

  return (
    <Moldura
      titulo={FRASES.novaTitulo}
      subtitulo={p.fase === "pronto" ? FRASES.novaProntaSubtitulo : FRASES.novaSubtitulo}
      comVolta={p.fase !== "pronto"}
    >
      {p.fase === "pronto" ? (
        <>
          {/* Uma ação (o botão) e um texto (o aviso): o rodapé "Voltar" e a frase de apoio repetiam os dois. */}
          <Aviso tom="sucesso" foco={confirmacao}>{FRASES.novaPronta}</Aviso>
          <a className="botao botao--primario entrada__acao" href="/entrar">
            {FRASES.novaProntaBotao}
          </a>
        </>
      ) : (
        <form onSubmit={p.aoEnviar} noValidate aria-busy={p.salvando}>
          <AvisoDeObrigatorios />
          {/*
            Cada erro vai para o campo que o causou (o tamanho para a senha
            nova, a divergência para a repetição), e a falha que não é de campo
            (rede, excesso de tentativas) fica num aviso acima do botão. Repetir
            o mesmo texto embaixo dos dois campos faria o leitor de tela anunciar
            duas vezes o mesmo problema, e quem enxerga leria dois erros onde
            existe um.
          */}
          <Campo
            id="nova-senha"
            rotulo={FRASES.novaRotulo}
            erro={p.erroDeSenha?.campo === "nova" ? p.erroDeSenha.texto : null}
            dica={FRASES.novaDica}
          >
            {(campo) => (
              <input {...campo} type="password" value={p.senha} autoComplete="new-password"
                     onChange={(e) => p.aoMudarSenha(e.target.value)} />
            )}
          </Campo>
          <Campo
            id="repetir-senha"
            rotulo={FRASES.repetirRotulo}
            erro={p.erroDeSenha?.campo === "repetida" ? p.erroDeSenha.texto : null}
          >
            {(campo) => (
              <input {...campo} type="password" value={p.repetida} autoComplete="new-password"
                     onChange={(e) => p.aoMudarRepetida(e.target.value)} />
            )}
          </Campo>
          {p.falha && <Aviso tom="perigo">{p.falha}</Aviso>}
          <button type="submit" className="botao botao--primario"
                  style={{ width: "100%" }} disabled={p.salvando}>
            {p.salvando ? FRASES.novaBotaoSalvando : FRASES.novaBotao}
          </button>
        </form>
      )}
    </Moldura>
  );
}

export function DefinirNovaSenha() {
  useTitulo("Definir nova senha");
  const [params] = useSearchParams();
  /*
    O token é LIDO UMA VEZ e guardado no estado; em seguida sai da barra de
    endereço. Ele é credencial de uso único viva por minutos: na barra de
    endereço ele vai para o histórico do navegador, para a captura de tela que
    a pessoa manda ao suporte e, sem política de referenciador, para qualquer
    endereço de fora a que a página chegasse a apontar. Lido para o estado, a
    tela continua funcionando e a URL fica limpa.
  */
  const [token] = useState(() => params.get("token") ?? "");
  const [fase, setFase] = useState<FaseDaRedefinicao>(token ? "formulario" : "sem-link");
  const [senha, setSenha] = useState("");
  const [repetida, setRepetida] = useState("");
  const [erroDeSenha, setErroDeSenha] = useState<ErroDaSenhaNova | null>(null);
  const [falha, setFalha] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    if (!window.location.search) return;
    // `history.state` volta igual: é onde o roteador guarda a posição dele.
    window.history.replaceState(window.history.state, "", window.location.pathname);
  }, []);

  /*
    SEM REDIRECIONAMENTO POR TEMPO (WCAG 2.2.1, Tempo ajustável).

    Antes, depois de redefinir a senha a tela levava sozinha para a entrada em
    cerca de 2,5 segundos. Quem lê devagar, quem usa leitor de tela (o anúncio
    de "Senha redefinida" leva mais que isso) e quem tem dificuldade de leitura
    perdia a única confirmação, e a entrada que carregava não a repetia
    (validação da V2-F00-E10, rodada 2). Agora a confirmação fica até a pessoa
    decidir: o botão "Entrar com a nova senha" é um link de navegação COMPLETA
    (`href`, e não o roteador), pela razão escrita na `Moldura`: a política de
    referenciador desta página não pode seguir a pessoa para dentro do painel.

    Não existe mais relógio nesta tela, e o teste reprova se alguém o trouxer
    de volta (`recuperar-senha.test.ts` e o fluxo ponta a ponta).
  */

  async function enviar(evento: FormEvent) {
    evento.preventDefault();
    setFalha(null);

    // As conferências de digitação acontecem aqui, e não no servidor: é erro de
    // digitação, não regra de negócio, e a ida ao servidor só atrasaria a
    // correção. O servidor confere de novo (a regra mora nele).
    const erro = validarSenhaNova(senha, repetida);
    setErroDeSenha(erro);
    if (erro) {
      document.getElementById(erro.campo === "nova" ? "nova-senha" : "repetir-senha")?.focus();
      return;
    }

    setSalvando(true);
    try {
      await redefinirSenha(token, senha);
      setFase("pronto");
    } catch (e: unknown) {
      const tipo = classificarFalha(e);
      if (tipo === "link-invalido") setFase("link-invalido");
      else if (tipo === "desligada") setFase("desligada");
      else setFalha(fraseDaFalhaDaRedefinicao(e));
    } finally {
      setSalvando(false);
    }
  }

  return (
    <TelaDaRedefinicao
      fase={fase} senha={senha} repetida={repetida} salvando={salvando}
      erroDeSenha={erroDeSenha} falha={falha}
      aoMudarSenha={(v) => { setSenha(v); setErroDeSenha(null); }}
      aoMudarRepetida={(v) => { setRepetida(v); setErroDeSenha(null); }}
      aoEnviar={enviar}
    />
  );
}
