import { useEffect, useState } from "react";
import {
  confirmarSegundoFator, iniciarSegundoFator,
  type AtivacaoSegundoFator, type SegundoFatorLigado,
} from "../dados/repositorio";
import { Aviso, Carregando } from "./comuns";
import { Campo } from "./Campo";
import { CAPACIDADE_MAXIMA, TextoLongoDemais, matrizQr } from "./qr";

/**
 * A ativação da verificação em duas etapas, inteira, em um lugar só.
 *
 * Ela aparece em DUAS telas que não se parecem: em "Minha conta", para quem
 * decidiu ligar, e na tela de entrada, para o administrador que o município
 * obriga a ligar antes de entrar. As duas precisam ser exatamente o mesmo
 * fluxo, com as mesmas palavras, porque a segunda é a primeira vez que aquela
 * pessoa vê o recurso e ela está com pressa para trabalhar.
 *
 * A ORDEM DOS PASSOS é a decisão que mais importa aqui, e ela não é estética:
 *
 *   1. mostra o código QR E o segredo em texto (metade dos computadores de
 *      recepção de Defesa Civil não tem câmera, e o telefone da pessoa não
 *      consegue ler a tela do próprio telefone);
 *   2. EXIGE um código de verdade antes de ligar. Sem este passo, relógio de
 *      telefone desregulado ou leitura de código QR que não guardou nada
 *      trancam a pessoa do lado de fora, e no caso do administrador isso é o
 *      município inteiro parado;
 *   3. só então mostra os códigos de recuperação, uma vez, dizendo que eles
 *      não voltam. Não é retórica: o servidor guarda o resumo deles, então nem
 *      ele consegue mostrá-los de novo.
 */

type Props = {
  /**
   * Presente só quando quem está ligando ainda NÃO tem sessão: o administrador
   * obrigado. Nesse caso a confirmação devolve a sessão, e é ela que entra.
   */
  desafio?: string;
  aoConcluir: (resultado: SegundoFatorLigado) => void;
  aoDesistir?: () => void;
};

export function AtivarSegundoFator({ desafio, aoConcluir, aoDesistir }: Props) {
  const [ativacao, setAtivacao] = useState<AtivacaoSegundoFator | null>(null);
  const [ligado, setLigado] = useState<SegundoFatorLigado | null>(null);
  const [codigo, setCodigo] = useState("");
  const [erroDoCampo, setErroDoCampo] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  useEffect(() => {
    /*
      A bandeira de cancelamento existe pelo mesmo motivo que um temporizador
      é limpo no desmonte: quem sai da tela antes de a resposta chegar não pode
      ter o estado escrito por baixo de uma tela que não existe mais. Aqui o
      efeito prático seria pior que um aviso do React: o segredo da ativação
      ficaria guardado no estado de um componente órfão.
    */
    let cancelado = false;
    iniciarSegundoFator(desafio)
      .then((r) => { if (!cancelado) setAtivacao(r); })
      .catch((e: unknown) => {
        if (!cancelado) setErro(e instanceof Error ? e.message : String(e));
      });
    return () => { cancelado = true; };
  }, [desafio]);

  async function confirmar(evento: React.FormEvent) {
    evento.preventDefault();
    if (!/^\d{6}$/.test(codigo.replace(/\s/g, ""))) {
      setErroDoCampo("Digite os seis dígitos que aparecem no aplicativo agora");
      return;
    }
    setErroDoCampo(null);
    setErro(null);
    setEnviando(true);
    try {
      const r = await confirmarSegundoFator(codigo.replace(/\s/g, ""), desafio);
      setLigado(r);
    } catch (e: unknown) {
      setErro(e instanceof Error ? e.message : String(e));
    } finally {
      setEnviando(false);
    }
  }

  if (erro && !ativacao) {
    return (
      <>
        <Aviso tom="perigo">{erro}</Aviso>
        {aoDesistir && (
          <button type="button" className="botao" onClick={aoDesistir}>Voltar</button>
        )}
      </>
    );
  }

  if (ligado) {
    return <CodigosDeRecuperacao resultado={ligado} aoConcluir={aoConcluir} />;
  }

  if (!ativacao) {
    return <Carregando mensagem="Preparando a verificação em duas etapas" />;
  }

  return (
    <div className="segundo-fator">
      <ol className="segundo-fator__passos">
        <li>
          Abra o seu aplicativo de autenticação (Google Authenticator, 1Password,
          Bitwarden, Authy) e mande adicionar uma conta.
        </li>
        <li>Aponte a câmera para o código abaixo, ou digite o segredo à mão.</li>
        <li>Digite aqui o código de seis dígitos que o aplicativo mostrar.</li>
      </ol>

      <div className="segundo-fator__ativacao">
        <CodigoQr uri={ativacao.uri} />

        <div className="segundo-fator__segredo">
          <p className="par__rotulo">Segredo, para digitar à mão</p>
          <p className="segundo-fator__valor mono">{emGrupos(ativacao.segredo)}</p>
          <p className="campo__dica">
            Sem câmera no computador? Digite este segredo no aplicativo. Ele
            aparece uma vez só: depois daqui, o servidor guarda só a versão
            cifrada dele.
          </p>
        </div>
      </div>

      {erro && <Aviso tom="perigo">{erro}</Aviso>}

      <form onSubmit={confirmar} noValidate>
        <Campo
          id="segundo-fator-codigo"
          rotulo="Código de seis dígitos"
          erro={erroDoCampo ?? undefined}
          dica="O número muda a cada trinta segundos. Digite o que está na tela agora."
          largura="curto"
        >
          {(campo) => (
            <input
              {...campo}
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={7}
              value={codigo}
              onChange={(e) => setCodigo(e.target.value)}
            />
          )}
        </Campo>

        <div className="segundo-fator__acoes">
          <button type="submit" className="botao botao--primario" disabled={enviando}>
            {enviando ? "Conferindo" : "Conferir e ligar"}
          </button>
          {aoDesistir && (
            <button type="button" className="botao" onClick={aoDesistir} disabled={enviando}>
              Cancelar
            </button>
          )}
        </div>
      </form>
    </div>
  );
}

/**
 * Os códigos de recuperação, mostrados uma vez.
 *
 * O botão de continuar diz o que está sendo afirmado ("já guardei"), e não um
 * "OK" qualquer: é a única confirmação da tela inteira que a pessoa não tem
 * como desfazer depois, porque o servidor guarda só o resumo de cada código.
 */
function CodigosDeRecuperacao(
  { resultado, aoConcluir }: { resultado: SegundoFatorLigado; aoConcluir: (r: SegundoFatorLigado) => void },
) {
  const [copiado, setCopiado] = useState(false);

  async function copiar() {
    try {
      await navigator.clipboard.writeText(resultado.codigosDeRecuperacao.join("\n"));
      setCopiado(true);
    } catch {
      /*
        Copiar pode ser recusado pelo navegador (permissão, página sem contexto
        seguro), e isso NÃO pode virar erro na tela: os códigos estão escritos
        aí do lado, legíveis, e a pessoa copia com o olho e a caneta, que é o
        destino recomendado deles de qualquer forma.
      */
      setCopiado(false);
    }
  }

  return (
    <div className="segundo-fator">
      <Aviso tom="sucesso">{resultado.mensagem}</Aviso>

      <p>
        Estes são os seus <strong>códigos de recuperação</strong>. Cada um vale
        UMA vez, e eles são a sua única entrada se você perder o telefone.
        Guarde num lugar seguro, fora do computador: impresso na gaveta da
        coordenação serve, e é o que a maioria dos municípios faz.
      </p>

      <Aviso tom="alerta">
        Esta é a única vez que eles aparecem. O servidor guarda só um resumo de
        cada um, então nem ele consegue mostrá-los de novo. Se você perder os
        códigos, desligue e ligue a verificação outra vez para receber outros.
      </Aviso>

      <ul className="segundo-fator__codigos">
        {resultado.codigosDeRecuperacao.map((c) => (
          <li key={c} className="mono">{c}</li>
        ))}
      </ul>

      <div className="segundo-fator__acoes">
        <button type="button" className="botao botao--primario"
                onClick={() => aoConcluir(resultado)}>
          Já guardei os códigos, continuar
        </button>
        <button type="button" className="botao" onClick={copiar}>
          {copiado ? "Copiado" : "Copiar códigos"}
        </button>
      </div>
    </div>
  );
}

/**
 * O desenho do código QR, em SVG, feito aqui mesmo.
 *
 * `shape-rendering="crispEdges"` não é enfeite: sem ele o navegador suaviza a
 * borda de cada quadradinho, e um leitor mais teimoso (câmera de celular
 * antigo, à noite, na luz do plantão) passa a errar a leitura de um desenho
 * que na tela parece perfeito.
 *
 * As cores vêm dos tokens do tema, e o desenho é desenhado ESCURO SOBRE CLARO
 * mesmo no tema escuro: leitor de código QR espera esse contraste, e invertê-lo
 * quebra parte dos aplicativos. Por isso o fundo branco fica no próprio SVG, e
 * é a única superfície do painel que não acompanha o tema, de propósito.
 */
export function CodigoQr({ uri }: { uri: string }) {
  let matriz;
  try {
    matriz = matrizQr(uri);
  } catch (erro) {
    /*
      Endereço grande demais para o desenho. Acontece com email longo de
      servidor público (nome.sobrenome.sobrenome@defesacivil.municipio.uf.gov.br
      passa dos cem caracteres), e a saída é dizer isso e mandar digitar o
      segredo, que sempre funciona. Desenhar um código que nenhum leitor abre
      seria pior: a pessoa tentaria três vezes antes de desconfiar.
    */
    if (erro instanceof TextoLongoDemais) {
      return (
        <Aviso tom="info">
          O endereço desta conta é longo demais para caber num código QR desta
          tela (o limite é {CAPACIDADE_MAXIMA} caracteres). Cadastre o segredo à
          mão no aplicativo: funciona igual.
        </Aviso>
      );
    }
    throw erro;
  }

  const borda = 4;
  const lado = matriz.tamanho + borda * 2;

  return (
    <svg
      className="qr"
      viewBox={`0 0 ${lado} ${lado}`}
      shapeRendering="crispEdges"
      role="img"
      aria-label="Código QR com o endereço de ativação da verificação em duas etapas. O mesmo endereço está escrito ao lado, como segredo para digitar à mão."
    >
      <rect x="0" y="0" width={lado} height={lado} className="qr__fundo" />
      {matriz.modulos.map((linha, i) =>
        linha.map((escuro, j) => (escuro ? (
          <rect key={`${i}-${j}`} x={j + borda} y={i + borda} width="1" height="1"
                className="qr__modulo" />
        ) : null)),
      )}
    </svg>
  );
}

/** Em grupos de quatro, que é como se lê e se digita uma sequência longa. */
function emGrupos(segredo: string): string {
  return segredo.replace(/(.{4})/g, "$1 ").trim();
}
