import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { avisosDesde, marcarAvisosLidos, type CursorDeAvisos } from "../dados/repositorio";
import { useSessaoObrigatoria } from "../estado/sessao";
import { formatarDataHora } from "./comuns";
import { IconeSino } from "./Icones";
import { depoisDePintar, proximoPendente } from "./foco";
import {
  ESTADO_INICIAL, INTERVALO_MS, TETO_NA_TELA,
  complementoDoAviso, deveConsultar, fraseDoAviso, marcarLidosNoEstado,
  mesclarAvisos, proximoAtrasoMs, rotuloDoSino, seloDoSino,
  type EstadoDoSino,
} from "./sino-regras";

/**
 * O sino do painel: o que aconteceu no município enquanto você olhava outra
 * coisa.
 *
 * As decisões estão em `sino-regras.ts`, fora do React, porque são elas que
 * este componente tem obrigação de não estragar. Aqui ficam as três amarrações
 * com o navegador, e cada uma existe por um defeito conhecido:
 *
 * 1. **O laço de consulta é um `setTimeout` que se reagenda**, e não um
 *    `setInterval`. Com intervalo fixo, uma resposta que demora mais que o
 *    intervalo faz as consultas se empilharem, e a resposta atrasada de uma
 *    volta antiga chega depois da nova e empurra o cursor para trás: avisos já
 *    entregues voltariam, e a lista piscaria com conteúdo repetido. O
 *    reagendamento só acontece quando a volta anterior terminou.
 * 2. **A aba escondida não consulta.** Ver `deveConsultar`. O laço continua de
 *    pé, só não gasta requisição, e volta a perguntar no instante em que a aba
 *    reaparece, sem esperar os trinta segundos.
 * 3. **O cursor mora num `ref`, não no estado.** Ele muda a cada resposta,
 *    inclusive nas vazias, porque é o relógio do banco. No estado, ele faria o
 *    componente renderizar de novo a cada trinta segundos mesmo quando nada
 *    aconteceu, que é exatamente o que este recurso não pode fazer.
 *
 * MARCAR COMO LIDO É ATO EXPLÍCITO, e nada mais marca: nem abrir o painel, nem
 * passar o mouse, nem clicar no aviso para ir até a ocorrência. Aviso que some
 * sozinho é aviso que ninguém leu, e quem abre a ocorrência para entender o
 * caso pode precisar do lembrete de pé até resolver.
 *
 * A parte VISUAL mora em `PainelDeAvisos`, exportada de propósito. É a mesma
 * separação de `Modal`: o comportamento só existe em navegador, mas a lista
 * desenhada (o que ela diz quando está vazia, o que ela diz quando o sino
 * conta mais do que ela mostra, e o fato de o não lido ter a palavra escrita e
 * não só uma cor) é o que quebra em silêncio, e assim ela é conferida em teste
 * que roda sem navegador nenhum.
 */

export type PropsPainelDeAvisos = {
  estado: EstadoDoSino;
  /** A última consulta falhou. A lista mostrada é a de antes. */
  falhou: boolean;
  marcando: boolean;
  aoMarcar: (ids: readonly string[]) => void;
  aoFechar: () => void;
  /** Chamado quando a pessoa segue para a ocorrência, para o painel fechar. */
  aoNavegar: () => void;
};

export function PainelDeAvisos({
  estado, falhou, marcando, aoMarcar, aoFechar, aoNavegar,
}: PropsPainelDeAvisos) {
  const naoLidosNaLista = estado.itens.filter((a) => !a.lido);
  /*
    O sino conta o município inteiro, e a lista mostra um recorte. Calar essa
    diferença faria a pessoa marcar tudo o que está na tela, ver o selo
    continuar aceso e concluir que o sino está quebrado.
  */
  const contaMaisQueMostra = estado.listaCortada
    || estado.naoLidos > naoLidosNaLista.length;

  return (
    <div className="sino__painel" id="sino-painel">
      <div className="sino__cabecalho">
        <h2 className="sino__titulo">Avisos</h2>
        {/* `id` porque é o reserva do foco depois de marcar como lido, ver `marcar`. */}
        <button type="button" className="botao botao--discreto" id="sino-fechar" onClick={aoFechar}>
          Fechar
        </button>
      </div>

      {falhou && (
        <p className="sino__nota">
          Não foi possível falar com o servidor na última tentativa. A lista abaixo
          é a de antes, e o painel continua tentando.
        </p>
      )}

      {estado.itens.length === 0 ? (
        <p className="sino__nota">
          Nada novo por aqui. Vistoria recebida do campo, prazo de atendimento
          vencido e resposta de órgão aparecem nesta lista.
        </p>
      ) : (
        <>
          <ul className="sino__lista">
            {estado.itens.map((aviso) => {
              const complemento = complementoDoAviso(aviso);
              return (
                <li
                  key={aviso.id}
                  className={`sino__item${aviso.lido ? "" : " sino__item--novo"}`}
                >
                  <Link
                    className="sino__link"
                    to={`/ocorrencias/${aviso.ocorrenciaId}`}
                    onClick={aoNavegar}
                  >
                    <span className="sino__frase">{fraseDoAviso(aviso.tipo)}</span>
                    <span className="mono sino__protocolo">{aviso.protocolo}</span>
                    {complemento && <span className="sino__complemento">{complemento}</span>}
                    {/*
                      A hora é absoluta, e não "há 4 minutos". Tempo relativo
                      precisa de um relógio que redesenhe a lista sozinho, e o
                      redesenho periódico é justamente o defeito que este
                      recurso não pode ter.
                    */}
                    <span className="sino__instante">{formatarDataHora(aviso.criadoEm)}</span>
                  </Link>
                  {/*
                    Estado nunca só por cor: o não lido tem a palavra escrita no
                    botão que o resolve, e o lido diz "Lido". A faixa colorida na
                    lateral é reforço, não é a informação.
                  */}
                  {aviso.lido ? (
                    <span className="sino__estado">Lido</span>
                  ) : (
                    <button
                      type="button"
                      className="botao botao--discreto"
                      data-aviso-id={aviso.id}
                      disabled={marcando}
                      onClick={() => aoMarcar([aviso.id])}
                    >
                      Marcar como lido
                    </button>
                  )}
                </li>
              );
            })}
          </ul>

          <div className="sino__rodape">
            {naoLidosNaLista.length > 0 && (
              <button
                type="button"
                className="botao botao--secundario"
                disabled={marcando}
                onClick={() => aoMarcar(naoLidosNaLista.map((a) => a.id))}
              >
                {marcando
                  ? "Marcando"
                  : `Marcar como lidos os ${naoLidosNaLista.length} desta lista`}
              </button>
            )}
            {contaMaisQueMostra && (
              <p className="sino__nota">
                A lista guarda os {TETO_NA_TELA} avisos mais recentes. O sino conta{" "}
                {estado.naoLidosTruncado ? "mais de " : ""}{estado.naoLidos} por ler
                no município, incluindo os que não cabem aqui.
              </p>
            )}
          </div>
        </>
      )}
    </div>
  );
}

export function Sino() {
  const sessao = useSessaoObrigatoria();
  const [estado, setEstado] = useState<EstadoDoSino>(ESTADO_INICIAL);
  const [aberto, setAberto] = useState(false);
  const [falhou, setFalhou] = useState(false);
  const [marcando, setMarcando] = useState(false);

  /*
    O cursor vem do servidor e volta para ele sem alteração nenhuma. O painel
    NÃO monta este valor com o relógio da máquina: o relógio da coordenadoria
    não é o do servidor, e um marco adiantado faz a janela seguinte começar no
    futuro. Tudo que acontecesse nesse intervalo cairia fora e não voltaria em
    pergunta nenhuma, sem erro e sem nada na tela dizendo que faltou aviso.
  */
  const cursor = useRef<CursorDeAvisos | null>(null);
  const emVoo = useRef(false);
  const falhasSeguidas = useRef(0);
  const envoltorio = useRef<HTMLDivElement>(null);
  const botao = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    /*
      Trocar de sessão é trocar de pessoa, e as duas coisas guardadas aqui são
      dela: o cursor é o ponto até onde ELA perguntou, e a marca de leitura de
      cada aviso é por usuário. Carregar isso de uma sessão para a outra faria
      quem acabou de entrar ver como lido o que o colega leu, e perder o começo
      da própria janela. Zerar custa uma primeira carga, que é barata.
    */
    cursor.current = null;
    falhasSeguidas.current = 0;
    setEstado(ESTADO_INICIAL);

    let vivo = true;
    let relogio: ReturnType<typeof setTimeout> | undefined;

    function agendar(atraso: number): void {
      if (!vivo) return;
      clearTimeout(relogio);
      relogio = setTimeout(() => { void rodada(); }, atraso);
    }

    async function rodada(): Promise<void> {
      if (!deveConsultar({ escondida: document.hidden, emVoo: emVoo.current })) {
        /*
          Aba escondida: o laço fica de pé sem gastar requisição, e o que
          acumular chega de uma vez quando ela voltar, porque o cursor não se
          perde. Reagendar em vez de parar é o que faz o sino sobreviver a um
          `visibilitychange` que o navegador não entregue.
        */
        agendar(INTERVALO_MS);
        return;
      }

      emVoo.current = true;
      try {
        const resposta = await avisosDesde(sessao, cursor.current);
        if (!vivo) return;
        cursor.current = { desde: resposta.ate, desdeId: resposta.ateId };
        falhasSeguidas.current = 0;
        setFalhou(false);
        // A identidade do estado é preservada quando nada mudou, e é isso que
        // faz o React desistir da renderização. Ver `mesclarAvisos`.
        setEstado((anterior) => mesclarAvisos(anterior, resposta));
        agendar(proximoAtrasoMs({ truncada: resposta.truncada, falhasSeguidas: 0 }));
      } catch {
        if (!vivo) return;
        falhasSeguidas.current += 1;
        setFalhou(true);
        agendar(proximoAtrasoMs({
          truncada: false,
          falhasSeguidas: falhasSeguidas.current,
        }));
      } finally {
        emVoo.current = false;
      }
    }

    function aoTrocarDeVisibilidade(): void {
      // Voltar para a aba e esperar meio minuto para o sino se atualizar é o
      // mesmo que ele estar errado: a pessoa voltou justamente para olhar.
      if (!document.hidden) void rodada();
    }

    void rodada();
    document.addEventListener("visibilitychange", aoTrocarDeVisibilidade);

    return () => {
      vivo = false;
      clearTimeout(relogio);
      document.removeEventListener("visibilitychange", aoTrocarDeVisibilidade);
    };
  }, [sessao]);

  /*
    Fechar por Escape e por clique fora, sem `role="dialog"`.

    Isto é um menu suspenso, não uma janela: a página de trás continua válida e
    o Tab pode sair daqui de propósito. Prometer diálogo (que é começo, meio e
    fim, com o foco preso dentro) sem prender o foco seria mentir para o leitor
    de tela, e é o que o portão de componente proíbe. Quem precisa de janela usa
    `Modal`.
  */
  const fechar = useCallback(() => {
    setAberto(false);
    botao.current?.focus();
  }, []);

  useEffect(() => {
    if (!aberto) return;

    function aoApontar(evento: MouseEvent): void {
      const alvo = evento.target;
      if (!(alvo instanceof Node)) return;
      if (envoltorio.current?.contains(alvo)) return;
      setAberto(false);
    }

    document.addEventListener("mousedown", aoApontar);
    return () => document.removeEventListener("mousedown", aoApontar);
  }, [aberto]);

  async function marcar(ids: readonly string[]): Promise<void> {
    if (ids.length === 0 || marcando) return;
    setMarcando(true);
    /*
      Para onde o foco vai DEPOIS: o botão que tinha o foco vira a palavra
      "Lido" e some. Sem isto o foco caía no `<body>`, e como o Escape é ouvido
      no envoltório do sino, com o foco fora dele o Escape deixava de fechar o
      painel. O próximo por ler continua a leitura de cima para baixo; sem
      próximo, o Fechar, que está dentro do envoltório.
    */
    const proximo = proximoPendente(
      estado.itens.map((a) => ({ id: a.id, pendente: !a.lido })),
      ids,
    );
    try {
      await marcarAvisosLidos(sessao, ids);
      setEstado((anterior) => marcarLidosNoEstado(anterior, ids));
      depoisDePintar(() => {
        const alvo = proximo
          ? envoltorio.current?.querySelector<HTMLElement>(`[data-aviso-id="${proximo}"]`)
          : null;
        (alvo ?? document.getElementById("sino-fechar"))?.focus();
      });
    } catch {
      /*
        O selo continua contando, e a consulta seguinte traz o que o servidor
        de fato gravou. Piscar um erro no canto por causa de uma marca de
        leitura seria alarme sobre o recurso menos crítico do painel.
      */
      setFalhou(true);
    } finally {
      setMarcando(false);
    }
  }

  const selo = seloDoSino(estado.naoLidos, estado.naoLidosTruncado);
  const rotulo = rotuloDoSino(estado.naoLidos, estado.naoLidosTruncado);

  return (
    <div
      className="sino"
      ref={envoltorio}
      onKeyDown={(evento) => { if (evento.key === "Escape") fechar(); }}
    >
      <button
        type="button"
        className="sino__botao"
        ref={botao}
        aria-expanded={aberto}
        aria-controls="sino-painel"
        aria-label={rotulo}
        onClick={() => setAberto((a) => !a)}
      >
        <IconeSino />
        {selo && <span className="sino__selo" aria-hidden="true">{selo}</span>}
      </button>

      {/*
        A contagem também sai por texto, para quem usa leitor de tela e não
        volta ao botão. `aria-live="polite"` porque `assertive` cortaria a frase
        no meio de quem está lendo um endereço, e nenhum aviso do sino vale essa
        interrupção.
      */}
      <span className="oculto-visualmente" role="status" aria-live="polite">{rotulo}</span>

      {aberto && (
        <PainelDeAvisos
          estado={estado}
          falhou={falhou}
          marcando={marcando}
          aoMarcar={(ids) => void marcar(ids)}
          aoFechar={fechar}
          aoNavegar={() => setAberto(false)}
        />
      )}
    </div>
  );
}
