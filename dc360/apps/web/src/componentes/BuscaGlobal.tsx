import {
  Fragment, useCallback, useEffect, useMemo, useRef, useState,
  type KeyboardEvent, type RefObject,
} from "react";
import { useNavigate } from "react-router-dom";
import { podeExecutar, type Papel } from "@dc360/shared";
import { buscar, type GrupoDeBusca } from "../dados/repositorio";
import { useSessaoObrigatoria } from "../estado/sessao";
import {
  ATRASO_DA_BUSCA_MS, CONSULTA_MINIMA, decidirTeclaDaBusca, ehAtalhoDeFoco, fraseDeEstado,
  rotuloDoAtalho, type SituacaoDoServidor,
} from "../busca/combobox";
import {
  buscarNaInterface, indiceDaInterface, type IconeDoIndice, type PaginaDoMenu,
} from "../busca/indice";
import { destacar, normalizar } from "../busca/pontuador";
import {
  achatar, destinoDoResultado, gruposVisiveis, type OpcaoDaLista,
} from "../busca/registros";
import { SeloSeveridade } from "./comuns";
import {
  IconeBusca, IconeDocumento, IconeEquipes, IconeEscudo, IconeLua, IconeMais,
  IconeOcorrencias, IconePredio, IconeSair, IconeSol, IconeUsuarios,
} from "./Icones";

/**
 * A caixa de comando do topo: registro e função do painel numa caixa só.
 *
 * Duas fontes, uma lista. As FUNÇÕES (páginas do menu e ações como registrar
 * ocorrência ou trocar o tema) vêm de um índice local, filtrado pelo mesmo
 * `podeExecutar` do menu, e respondem a cada tecla sem rede. Os REGISTROS
 * (ocorrência, pessoa, equipe, órgão) vêm do servidor, 200 ms depois da
 * última tecla, com a pergunta anterior cancelada: senão a resposta de
 * "ocor" chega depois da de "ocorr" e a lista mostra o resultado errado com a
 * consulta certa em cima. No modo de demonstração, "servidor" é o banco da
 * própria aba passando pelo mesmo pontuador.
 *
 * As decisões (o que cada tecla faz, a frase do `aria-live`, a ordem da
 * lista) moram em `src/busca/`, fora do React, porque são elas que este
 * componente tem obrigação de não estragar, e são provadas sem navegador. A
 * parte VISUAL mora em `CorpoDaBusca`, exportada de propósito, pela mesma
 * separação de `Sino`: a marcação ARIA de combobox e os três estados
 * desenhados são o que quebra em silêncio.
 *
 * ENTER SEM ITEM SELECIONADO MANTÉM O CAMINHO DE SEMPRE: a lista de
 * ocorrências com `?busca=`. A lista nasce sem item ativo por isso.
 */

export type PaginaComIcone = PaginaDoMenu & { icone: JSX.Element };

export type PropsCorpoDaBusca = {
  consulta: string;
  aberta: boolean;
  ativo: number | null;
  opcoes: readonly OpcaoDaLista[];
  situacao: SituacaoDoServidor;
  /** A dica escrita na caixa: "Ctrl K" ou "⌘ K". */
  atalho: string;
  iconeDe: (opcao: OpcaoDaLista) => JSX.Element;
  aoMudar: (valor: string) => void;
  aoTeclar: (evento: KeyboardEvent<HTMLInputElement>) => void;
  aoEscolher: (indice: number) => void;
  aoEnviar: () => void;
  aoFocar: () => void;
  refDaCaixa?: RefObject<HTMLInputElement>;
  refDoEnvoltorio?: RefObject<HTMLDivElement>;
};

const ID_LISTA = "busca-global-lista";
const ID_ATALHO = "busca-global-atalho";

/** As opções agrupadas na ordem em que aparecem, guardando o índice linear. */
function agrupar(opcoes: readonly OpcaoDaLista[]): Array<{ grupo: string; itens: Array<{ opcao: OpcaoDaLista; indice: number }> }> {
  const grupos: Array<{ grupo: string; itens: Array<{ opcao: OpcaoDaLista; indice: number }> }> = [];
  opcoes.forEach((opcao, indice) => {
    const ultimo = grupos[grupos.length - 1];
    if (ultimo && ultimo.grupo === opcao.grupo) ultimo.itens.push({ opcao, indice });
    else grupos.push({ grupo: opcao.grupo, itens: [{ opcao, indice }] });
  });
  return grupos;
}

export function CorpoDaBusca({
  consulta, aberta, ativo, opcoes, situacao, atalho, iconeDe,
  aoMudar, aoTeclar, aoEscolher, aoEnviar, aoFocar, refDaCaixa, refDoEnvoltorio,
}: PropsCorpoDaBusca) {
  const frase = fraseDeEstado({ consulta: consulta.trim(), total: opcoes.length, situacao });
  const nadaAchado = opcoes.length === 0 && (situacao === "ok" || situacao === "falhou");

  return (
    <div className="topo__busca busca-global" ref={refDoEnvoltorio}>
      <form
        className="busca-global__caixa"
        role="search"
        onSubmit={(evento) => { evento.preventDefault(); aoEnviar(); }}
      >
        <span className="busca-global__lupa" aria-hidden="true"><IconeBusca /></span>
        <label className="oculto-visualmente" htmlFor="busca-global">
          Buscar ocorrência, pessoa, equipe, órgão ou função do painel
        </label>
        <input
          id="busca-global"
          ref={refDaCaixa}
          type="search"
          role="combobox"
          aria-expanded={aberta}
          aria-controls={aberta ? ID_LISTA : undefined}
          aria-activedescendant={aberta && ativo !== null ? opcoes[ativo]?.id : undefined}
          aria-autocomplete="list"
          aria-describedby={ID_ATALHO}
          autoComplete="off"
          spellCheck={false}
          value={consulta}
          placeholder="Buscar registro ou função"
          onChange={(evento) => aoMudar(evento.target.value)}
          onKeyDown={aoTeclar}
          onFocus={aoFocar}
        />
        <kbd id={ID_ATALHO} className="busca-global__atalho">{atalho}</kbd>
      </form>

      {aberta && (
        <div
          id={ID_LISTA}
          className="busca-global__lista"
          role="listbox"
          aria-label="Resultados da busca"
          // Segurar o foco na caixa: sem isto, o clique numa opção dispara o
          // desfoque antes do clique, a lista fecha e o clique cai no nada.
          onMouseDown={(evento) => evento.preventDefault()}
        >
          {agrupar(opcoes).map((grupo, g) => (
            <div
              key={grupo.grupo}
              role="group"
              aria-labelledby={`busca-global-grupo-${g}`}
              className="busca-global__grupo"
            >
              <div id={`busca-global-grupo-${g}`} className="busca-global__titulo-do-grupo" role="presentation">
                {grupo.grupo}
              </div>
              {grupo.itens.map(({ opcao, indice }) => {
                const ocorrencia = opcao.origem.tipo === "registro" && opcao.origem.tipoDoRegistro === "ocorrencia"
                  ? opcao.origem.item : null;
                const selecionada = ativo === indice;
                return (
                  // acessibilidade: excecao. É o padrão de combobox da WAI-ARIA: a
                  // opção NÃO recebe foco; o teclado fica na caixa, que aponta
                  // para a opção ativa por `aria-activedescendant`, e as setas e
                  // o Enter tratados em `aoTeclar` são o caminho por teclado.
                  <div
                    key={opcao.id}
                    id={opcao.id}
                    role="option"
                    aria-selected={selecionada}
                    className={`busca-global__opcao${selecionada ? " busca-global__opcao--ativa" : ""}`}
                    onClick={() => aoEscolher(indice)}
                  >
                    <span className="busca-global__icone" aria-hidden="true">{iconeDe(opcao)}</span>
                    <span className="busca-global__texto">
                      <span className="busca-global__rotulo">
                        {ocorrencia?.protocolo && (
                          <span className="mono busca-global__protocolo">{ocorrencia.protocolo}</span>
                        )}
                        {destacar(opcao.rotulo, consulta).map((s, i) => s.marcado
                          ? <mark key={i} className="busca-global__marca">{s.texto}</mark>
                          : <Fragment key={i}>{s.texto}</Fragment>)}
                      </span>
                      {opcao.detalhe && <span className="busca-global__detalhe">{opcao.detalhe}</span>}
                    </span>
                    {ocorrencia && <SeloSeveridade severidade={ocorrencia.severidade ?? null} />}
                  </div>
                );
              })}
            </div>
          ))}

          {situacao === "buscando" && (
            <div className="busca-global__estado" role="presentation">Buscando...</div>
          )}
          {situacao === "falhou" && (
            <div className="busca-global__estado busca-global__estado--falha" role="presentation">
              Sem sinal com o servidor. Os registros não foram consultados; as funções do painel continuam aqui.
            </div>
          )}
          {nadaAchado && (
            <div className="busca-global__estado" role="presentation">
              Nada encontrado para “{consulta.trim()}”. Enter abre a lista de ocorrências filtrada por esse texto.
            </div>
          )}
        </div>
      )}

      <div className="oculto-visualmente" aria-live="polite">{frase}</div>
    </div>
  );
}

type Props = {
  papel: Papel;
  /** As páginas que o menu mostra para este papel, com o ícone de cada uma. */
  paginas: readonly PaginaComIcone[];
  tema: "claro" | "escuro";
  aoTrocarTema: () => void;
  aoSair: () => void;
};

type EstadoDoServidor = { situacao: SituacaoDoServidor; grupos: GrupoDeBusca[] };

export function BuscaGlobal({ papel, paginas, tema, aoTrocarTema, aoSair }: Props) {
  const sessao = useSessaoObrigatoria();
  const navegar = useNavigate();
  const [consulta, setConsulta] = useState("");
  const [aberta, setAberta] = useState(false);
  const [ativo, setAtivo] = useState<number | null>(null);
  const [servidor, setServidor] = useState<EstadoDoServidor>({ situacao: "ocioso", grupos: [] });
  const [atalho] = useState(() =>
    rotuloDoAtalho(typeof navigator === "undefined" ? "" : navigator.platform ?? ""));
  const caixa = useRef<HTMLInputElement>(null);
  const envoltorio = useRef<HTMLDivElement>(null);

  const valida = normalizar(consulta).length >= CONSULTA_MINIMA;

  const indice = useMemo(() => indiceDaInterface(papel, paginas, { tema }), [papel, paginas, tema]);
  const locais = useMemo(() => (valida ? buscarNaInterface(consulta, indice) : []), [consulta, indice, valida]);
  const grupos = useMemo(() => gruposVisiveis(papel, servidor.grupos), [papel, servidor.grupos]);
  const opcoes = useMemo(() => achatar(locais, grupos), [locais, grupos]);
  const ativoValido = ativo !== null && ativo < opcoes.length ? ativo : null;

  /*
    O servidor, 200 ms depois da última tecla, com a pergunta anterior
    cancelada. O `AbortController` vai até o `fetch`: cancelar aqui sem
    mandar o sinal só ignoraria a resposta, e a requisição continuaria
    gastando o teto por pessoa da rota.
  */
  useEffect(() => {
    if (!valida) {
      setServidor({ situacao: "ocioso", grupos: [] });
      return;
    }
    const controlador = new AbortController();
    setServidor((anterior) => ({ situacao: "buscando", grupos: anterior.grupos }));
    const relogio = setTimeout(async () => {
      try {
        const resposta = await buscar(sessao, consulta, controlador.signal);
        if (controlador.signal.aborted) return;
        setServidor({ situacao: "ok", grupos: resposta.grupos });
      } catch {
        if (controlador.signal.aborted) return;
        setServidor((anterior) => ({ situacao: "falhou", grupos: anterior.grupos }));
      }
    }, ATRASO_DA_BUSCA_MS);
    return () => {
      clearTimeout(relogio);
      controlador.abort();
    };
  }, [consulta, valida, sessao]);

  // Ctrl+K / Cmd+K de qualquer lugar da página leva o foco à caixa.
  useEffect(() => {
    function aoTeclarNoDocumento(evento: globalThis.KeyboardEvent): void {
      if (!ehAtalhoDeFoco({ tecla: evento.key, ctrl: evento.ctrlKey, meta: evento.metaKey, alt: evento.altKey })) return;
      evento.preventDefault();
      caixa.current?.focus();
      caixa.current?.select();
    }
    document.addEventListener("keydown", aoTeclarNoDocumento);
    return () => document.removeEventListener("keydown", aoTeclarNoDocumento);
  }, []);

  /*
    Clique fora fecha. Isto é um menu suspenso, não uma janela: a página de
    trás continua válida e o Tab pode sair daqui de propósito (ver `Sino`).
  */
  useEffect(() => {
    if (!aberta) return;
    function aoApontar(evento: MouseEvent): void {
      const alvo = evento.target;
      if (!(alvo instanceof Node)) return;
      if (envoltorio.current?.contains(alvo)) return;
      setAberta(false);
    }
    document.addEventListener("mousedown", aoApontar);
    return () => document.removeEventListener("mousedown", aoApontar);
  }, [aberta]);

  // A opção ativa acompanha a rolagem da lista, senão a seta anda no escuro.
  useEffect(() => {
    if (!aberta || ativoValido === null) return;
    const id = opcoes[ativoValido]?.id;
    if (id) document.getElementById(id)?.scrollIntoView({ block: "nearest" });
  }, [aberta, ativoValido, opcoes]);

  const fechar = useCallback(() => {
    setAberta(false);
    setAtivo(null);
  }, []);

  function mudar(valor: string): void {
    setConsulta(valor);
    setAtivo(null);
    setAberta(normalizar(valor).length >= CONSULTA_MINIMA);
  }

  function enviar(): void {
    const termo = consulta.trim();
    fechar();
    /*
      A busca leva cada papel para o lugar dele.

      O menu esconde "Ocorrências" de quem registra vistoria, de propósito: o
      agente de campo trabalha sobre o que foi despachado para a equipe dele, e
      não sobre a fila do município inteiro. Mas a caixa de busca aparece em
      toda tela, para todo mundo, e mandava todos para `/ocorrencias`.

      O resultado era uma contradição de produto: o controle mais visível da
      interface alcançava a tela que o menu decidiu esconder. E o beco vinha
      logo depois, porque abrir uma ocorrência de outra equipe renderiza a
      página inteira sem uma única ação disponível, sem dizer por quê.

      Não era vazamento: o município vem do token e o RLS continua de pé. Era
      pior de outro jeito, porque não parecia erro nenhum.
    */
    const destino = podeExecutar(papel, "registrar_vistoria") ? "/meu-trabalho" : "/ocorrencias";
    navegar(termo ? `${destino}?busca=${encodeURIComponent(termo)}` : destino);
  }

  function escolher(indice: number): void {
    const opcao = opcoes[indice];
    if (!opcao) return;
    fechar();
    setConsulta("");
    if (opcao.origem.tipo === "registro") {
      navegar(destinoDoResultado(opcao.origem.tipoDoRegistro, opcao.origem.item.id));
      return;
    }
    const destino = opcao.origem.item.destino;
    if (destino.tipo === "rota") navegar(destino.para);
    else if (destino.acao === "trocar_tema") aoTrocarTema();
    else aoSair();
  }

  function teclar(evento: KeyboardEvent<HTMLInputElement>): void {
    const decisao = decidirTeclaDaBusca({
      tecla: evento.key, aberta, ativo: ativoValido, total: opcoes.length, temTexto: consulta.length > 0,
    });
    switch (decisao.acao) {
      case "seguir":
        return;
      case "abrir":
        evento.preventDefault();
        if (valida) setAberta(true);
        return;
      case "mover":
        evento.preventDefault();
        setAtivo(decisao.ativo);
        return;
      case "fechar":
        // O Tab segue para o próximo controle; só a lista fecha.
        if (evento.key !== "Tab") evento.preventDefault();
        fechar();
        return;
      case "limpar":
        evento.preventDefault();
        setConsulta("");
        return;
      case "escolher":
        evento.preventDefault();
        escolher(decisao.indice);
        return;
      case "enviar":
        // O `onSubmit` do formulário faz o mesmo; tratar aqui evita o duplo.
        evento.preventDefault();
        enviar();
        return;
    }
  }

  const iconeDe = useCallback((opcao: OpcaoDaLista): JSX.Element => {
    if (opcao.origem.tipo === "registro") return ICONE_DO_REGISTRO[opcao.origem.tipoDoRegistro];
    const item = opcao.origem.item;
    const destino = item.destino;
    if (destino.tipo === "rota") {
      const pagina = paginas.find((p) => p.para === destino.para && p.rotulo === item.rotulo);
      if (pagina) return pagina.icone;
    }
    if (destino.tipo === "acao" && destino.acao === "trocar_tema") {
      return tema === "claro" ? <IconeLua /> : <IconeSol />;
    }
    return ICONE_DA_ACAO[item.icone ?? "mais"];
  }, [paginas, tema]);

  return (
    <CorpoDaBusca
      consulta={consulta}
      aberta={aberta && valida}
      ativo={ativoValido}
      opcoes={opcoes}
      situacao={servidor.situacao}
      atalho={atalho}
      iconeDe={iconeDe}
      aoMudar={mudar}
      aoTeclar={teclar}
      aoEscolher={escolher}
      aoEnviar={enviar}
      aoFocar={() => { if (valida) setAberta(true); }}
      refDaCaixa={caixa}
      refDoEnvoltorio={envoltorio}
    />
  );
}

const ICONE_DO_REGISTRO: Record<"ocorrencia" | "usuario" | "equipe" | "orgao", JSX.Element> = {
  ocorrencia: <IconeOcorrencias />,
  usuario: <IconeUsuarios />,
  equipe: <IconeEquipes />,
  orgao: <IconePredio />,
};

const ICONE_DA_ACAO: Record<IconeDoIndice, JSX.Element> = {
  mais: <IconeMais />,
  usuarios: <IconeUsuarios />,
  equipes: <IconeEquipes />,
  predio: <IconePredio />,
  documento: <IconeDocumento />,
  lua: <IconeLua />,
  sol: <IconeSol />,
  sair: <IconeSair />,
  escudo: <IconeEscudo />,
};
