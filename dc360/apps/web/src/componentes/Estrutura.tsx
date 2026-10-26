import { useCallback, useEffect, useId, useRef, useState } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { ROTULO_PAPEL, podeExecutar, type Acao } from "@dc360/shared";
import { useSessao, useTema } from "../estado/sessao";
import { encerrarSessao } from "../dados/repositorio";
import { iniciais } from "./comuns";
import {
  IconeAlerta, IconeDocumento, IconeEquipes, IconeEscudo, IconeLua, IconeMapa,
  IconeOcorrencias, IconePainel, IconePrancheta, IconePredio, IconeSair,
  IconeSol, IconeUsuarios,
} from "./Icones";
import { BarraDoCelular } from "./BarraDoCelular";
import { Sino } from "./Sino";
import { BuscaGlobal } from "./BuscaGlobal";
import { useBordasFixas, useFocoForaDasBordas } from "./usar-bordas-fixas";
import { registrarModalAberto } from "./modais-abertos";
import {
  decidirTeclaDoMenu, ehDaRota, repartirNavegacao, useQuantosNaBarra,
} from "./navegacao-mais";

/**
 * Estrutura fixa da aplicação: lateral de navegação, topo com busca e
 * identidade, área de conteúdo.
 *
 * A navegação é filtrada por papel. Um operador de plantão não vê
 * administração de usuários, e isso não é enfeite: é o mesmo princípio de
 * menor privilégio que o RLS aplica no banco, refletido na tela.
 */

type ItemNav = {
  para: string; rotulo: string; icone: JSX.Element; grupo: string;
  /**
   * Outros nomes pelos quais a busca do topo acha esta página. O rótulo já
   * conta sozinho; aqui entra o que a pessoa DIZ quando procura ("time" para
   * equipe, "chamado" para ocorrência).
   */
  sinonimos?: readonly string[];
  /** Só aparece para quem pode executar esta ação. */
  exige?: Acao;
  /** Só aparece para quem NÃO pode executar esta ação. */
  escondeSePuder?: Acao;
  /**
   * Fica na barra do pé do celular, quando couber. Os que não são principais
   * (ou não cabem) moram no menu "Mais". A ordem desta lista é a prioridade.
   */
  principal?: boolean;
};

/*
  O agente de campo é o caso que obrigou a segunda regra.

  Ele não pode triar, despachar, encaminhar nem encerrar, então o painel do
  coordenador e a tabela do município inteiro não têm uma ação sequer para ele.
  Antes ele via as duas telas mesmo assim, e não via nenhuma das suas. Agora o
  menu dele começa em "Meu trabalho" e as telas de coordenação saem de vista,
  pelo mesmo princípio de menor privilégio que o resto do sistema segue.
*/
const NAVEGACAO: ItemNav[] = [
  { para: "/meu-trabalho", rotulo: "Meu trabalho", icone: <IconePrancheta />,
    grupo: "Operação", exige: "registrar_vistoria", principal: true,
    sinonimos: ["tarefas", "minhas vistorias", "vistoria", "campo"] },
  { para: "/painel", rotulo: "Painel", icone: <IconePainel />, grupo: "Operação",
    escondeSePuder: "registrar_vistoria", principal: true,
    sinonimos: ["início", "indicadores", "resumo", "fila de hoje"] },
  { para: "/ocorrencias", rotulo: "Ocorrências", icone: <IconeOcorrencias />, grupo: "Operação",
    escondeSePuder: "registrar_vistoria", principal: true,
    sinonimos: ["chamado", "chamados", "protocolo", "fila", "lista de ocorrências"] },
  { para: "/mapa", rotulo: "Mapa da cidade", icone: <IconeMapa />, grupo: "Operação",
    principal: true,
    sinonimos: ["mapa", "pinos", "localização", "geografia"] },
  /*
    Fica em Operação e não em Administração, e fica ACIMA das telas de cadastro
    de propósito: é a única tela do produto cujo assunto é a integridade física
    de uma pessoa, e enterrá-la no fim de um menu de dez itens seria decidir, no
    desenho, que ninguém vai abri-la.

    Escondida de quem registra vistoria pelo mesmo princípio das outras: o
    agente declara a própria saída pelo aplicativo, e a lista de quem está no
    morro é trabalho de quem fica na base.
  */
  { para: "/quem-esta-em-campo", rotulo: "Quem está em campo", icone: <IconeAlerta />,
    grupo: "Operação", exige: "acompanhar_saida_a_campo",
    escondeSePuder: "registrar_vistoria", principal: true,
    sinonimos: ["saída a campo", "agentes em campo", "prazo de retorno", "quem saiu"] },
  { para: "/equipes", rotulo: "Equipes", icone: <IconeEquipes />, grupo: "Administração",
    exige: "gerenciar_equipes", sinonimos: ["time", "times", "equipe de campo"] },
  /*
    O catálogo de órgãos fica atrás de `gerenciar_equipes`, e não de
    `gerenciar_organizacao`, pela mesma razão que a rota do servidor: ele é
    cadastro estrutural da operação, como a lista de equipes, e quem monta a
    operação é a coordenação. Exigir administrador deixaria o coordenador
    travado no meio de um encaminhamento urgente, esperando alguém aparecer
    para cadastrar "Corpo de Bombeiros".
  */
  { para: "/orgaos", rotulo: "Órgãos de destino", icone: <IconePredio />,
    grupo: "Administração", exige: "gerenciar_equipes",
    sinonimos: ["órgão", "órgãos", "destino", "secretaria", "bombeiros", "providência"] },
  { para: "/usuarios", rotulo: "Usuários", icone: <IconeUsuarios />, grupo: "Administração",
    exige: "gerenciar_usuarios",
    sinonimos: ["conta", "contas", "pessoa", "pessoas", "cadastro de pessoas"] },
  { para: "/auditoria", rotulo: "Prestação de contas", icone: <IconeDocumento />,
    grupo: "Administração", exige: "consultar_trilha",
    sinonimos: ["auditoria", "trilha", "relatório", "histórico", "exportar", "csv"] },
  /*
    A única tela atrás de `gerenciar_organizacao`, a permissão que só o
    administrador tem. Coordenador não vê este item, do mesmo jeito que não vê
    conta de outro coordenador: é o teto do município, não a operação dele.
  */
  { para: "/organizacao", rotulo: "Organização", icone: <IconeEscudo />,
    grupo: "Administração", exige: "gerenciar_organizacao",
    sinonimos: ["retenção", "lgpd", "saída de município", "extração", "dados pessoais"] },
];

export function Estrutura() {
  const { sessao, sair } = useSessao();
  const [tema, alternarTema] = useTema();
  const navegar = useNavigate();
  const { pathname } = useLocation();
  const barraRef = useRef<HTMLElement>(null);
  const topoRef = useRef<HTMLElement>(null);
  // O topo e a barra do pé são fixos: a rolagem da página deixa folga para os dois (ver o hook).
  useBordasFixas(topoRef, barraRef, Boolean(sessao));
  useFocoForaDasBordas(Boolean(sessao));

  /*
    O menu "Mais" da barra do celular (H08, decisão do Rafael em 2026-10-26).

    Até 900 px a barra do pé mostra só os destinos principais que cabem
    inteiros, e o resto vai para um menu que abre acima dela. É um botão de
    exibir e esconder (`aria-expanded`), e não um `role="menu"`: o conteúdo são
    links comuns, e `role="menu"` prometeria ao leitor de tela setas e teclas
    de letra que um menu de navegação não tem. O comportamento que importa:

    - ao abrir, o foco vai ao primeiro item (quem abre por teclado não precisa
      adivinhar que o menu está logo depois do botão);
    - Esc fecha, de onde estiver o foco, e devolve o foco ao botão "Mais";
    - clicar ou tocar fora, ou o foco sair da barra (Tab para fora), fecha sem
      puxar o foco de volta: a pessoa já foi para outro lugar;
    - escolher um destino fecha, e quem leva o foco ao conteúdo da tela nova é
      `TrocaDeTela`;
    - o aviso passageiro espera enquanto o menu está aberto (o mesmo contador
      das janelas modais): o menu é a decisão da pessoa, o aviso é só confirmação.
  */
  const naBarra = useQuantosNaBarra();
  const [maisAberto, setMaisAberto] = useState(false);
  const menuAberto = maisAberto && naBarra > 0;
  const botaoMaisRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const menuId = useId();
  // Só o Esc devolve o foco ao botão; clicar fora ou sair da barra não.
  const fecharMais = useCallback((devolverFoco: boolean) => {
    setMaisAberto(false);
    if (devolverFoco) botaoMaisRef.current?.focus();
  }, []);

  // Trocou de tela (inclusive por link de fora da barra, pelo sino ou pela busca): o menu fecha.
  useEffect(() => { setMaisAberto(false); }, [pathname]);
  // Passou para a tela de mesa (girar o aparelho, redimensionar): o menu some, e na volta começa fechado.
  useEffect(() => { if (naBarra === 0) setMaisAberto(false); }, [naBarra]);

  useEffect(() => {
    if (!menuAberto) return;
    const liberarAvisos = registrarModalAberto();
    menuRef.current?.querySelector<HTMLElement>("a, button")?.focus();
    const aoTeclar = (evento: KeyboardEvent) => {
      if (decidirTeclaDoMenu(evento.key) !== "fechar") return;
      evento.preventDefault();
      fecharMais(true);
    };
    const aoMexerFora = (evento: Event) => {
      if (evento.target instanceof Node && !barraRef.current?.contains(evento.target)) fecharMais(false);
    };
    document.addEventListener("keydown", aoTeclar);
    document.addEventListener("pointerdown", aoMexerFora);
    document.addEventListener("focusin", aoMexerFora);
    return () => {
      document.removeEventListener("keydown", aoTeclar);
      document.removeEventListener("pointerdown", aoMexerFora);
      document.removeEventListener("focusin", aoMexerFora);
      liberarAvisos();
    };
  }, [menuAberto, fecharMais]);

  // Revoga no servidor antes de esquecer localmente: sem isso, o token de
  // renovação continuaria valendo por dias. É o mesmo caminho para o botão da
  // lateral e para a ação "Sair" da busca do topo.
  //
  // `replace` para a tela abandonada não ficar no histórico: depois de sair, o
  // botão Voltar do navegador levava de volta a ela, que então redirecionava
  // para a entrada de novo. Quem decide o destino depois de entrar é
  // `destinoDepoisDeEntrar`, e sair de propósito não deixa caminho de volta
  // (ver `saidaVoluntaria` em `estado/sessao.tsx` e `Protegida` em `App.tsx`).
  const encerrarESair = useCallback(() => {
    void encerrarSessao().finally(() => { sair(); navegar("/entrar", { replace: true }); });
  }, [sair, navegar]);

  if (!sessao) return null;

  const visiveis = NAVEGACAO.filter((i) =>
    (!i.exige || podeExecutar(sessao.papel, i.exige)) &&
    (!i.escondeSePuder || !podeExecutar(sessao.papel, i.escondeSePuder)));
  const grupos = [...new Set(visiveis.map((i) => i.grupo))];
  // No celular (naBarra > 0) a barra leva só os principais, e o resto vai para o menu "Mais".
  const divisao = repartirNavegacao(visiveis, naBarra);
  const maisTemATela = divisao.noMais.some((i) => ehDaRota(pathname, i.para));

  return (
    <div className="aplicacao">
      {/*
        Primeiro alvo de Tab da página. Sem ele, quem navega por teclado
        atravessa a lateral inteira, item por item, a cada troca de tela, só
        para chegar ao conteúdo. Fica invisível até receber foco.
      */}
      <a className="pular-para-conteudo" href="#conteudo">Pular para o conteúdo</a>

      <nav className={`lateral${menuAberto ? " lateral--com-menu" : ""}`}
           aria-label="Navegação principal" ref={barraRef}>
        <div className="lateral__marca">
          <img src="/icone.svg" alt="" width={40} height={40} />
          <span>
            <span className="lateral__nome">Defesa Civil 360</span>
            <span className="lateral__org">{sessao.municipio}, {sessao.uf}</span>
          </span>
        </div>

        {naBarra === 0 ? (
          <>
            {grupos.map((grupo) => (
              <div className="lateral__grupo" key={grupo}>
                <span className="lateral__rotulo">{grupo}</span>
                {visiveis.filter((i) => i.grupo === grupo).map((item) => (
                  <NavLink key={item.para} to={item.para} className="lateral__item">
                    {item.icone}
                    <span className="lateral__texto">{item.rotulo}</span>
                  </NavLink>
                ))}
              </div>
            ))}

            <div className="lateral__rodape">
              <button type="button" className="lateral__item lateral__item--botao" onClick={alternarTema}>
                {tema === "claro" ? <IconeLua /> : <IconeSol />}
                <span className="lateral__texto">{tema === "claro" ? "Tema escuro" : "Tema claro"}</span>
              </button>
              <button type="button" className="lateral__item lateral__item--botao" onClick={encerrarESair}>
                <IconeSair />
                <span className="lateral__texto">Sair</span>
              </button>
            </div>
          </>
        ) : (
          <BarraDoCelular
            naBarra={divisao.naBarra} noMais={divisao.noMais}
            aberto={menuAberto} menuId={menuId} maisTemATela={maisTemATela} tema={tema}
            aoAlternarMenu={() => setMaisAberto((aberto) => !aberto)}
            aoEscolher={() => fecharMais(false)}
            aoAlternarTema={alternarTema} aoSair={encerrarESair}
            refBotao={botaoMaisRef} refMenu={menuRef}
          />
        )}
      </nav>

      <header className="topo" ref={topoRef}>
        {/*
          A MARCA NO TOPO. Em tela estreita a lateral vai para o rodapé e a
          marca dela some (`.lateral__marca { display: none }`), e o painel
          ficava sem cara nenhuma. É o mesmo `/icone.svg` do ícone do site e
          da prévia de link: uma marca só, desenhada uma vez, em `public/`.
          Leva ao início, com o nome dito para quem ouve a tela.
        */}
        <NavLink to="/painel" className="topo__marca">
          <img src="/icone.svg" alt="" width={40} height={40} />
          <span className="oculto-visualmente">Início, Defesa Civil 360</span>
        </NavLink>

        {/*
          A caixa de comando: registro e função do painel numa caixa só. As
          páginas que ela indexa são EXATAMENTE as que o menu acima mostra
          (`visiveis`), e as ações passam pelo mesmo `podeExecutar`. O Enter
          sem item escolhido continua levando à lista com `?busca=`; a razão
          de produto está no próprio componente.
        */}
        <BuscaGlobal
          papel={sessao.papel}
          paginas={visiveis}
          tema={tema}
          aoTrocarTema={alternarTema}
          aoSair={encerrarESair}
        />

        <div className="topo__direita">
          {/*
            O sino fica ao lado da identidade, e não dentro do menu lateral,
            porque ele precisa estar visível em toda tela: o coordenador olha
            para cá sem sair do que está fazendo.
          */}
          <Sino />
          {/*
            A identidade era só um rótulo. Agora é o caminho para a própria
            conta, que é onde se troca a senha: quem recebe uma senha inicial
            ditada por telefone procura a troca aqui, e não num menu escondido.
          */}
          {/*
            Até 600 px o nome e o papel saem da tela e fica só o avatar, que é
            `aria-hidden`: o link ficava sem nome nenhum para quem ouve a tela
            (axe `link-name`, achado 3 da acessibilidade na rodada 7 da
            V2-F00-E09). O nome dito começa pelo texto que se vê na largura de
            mesa (o nome e o papel) e termina no destino.
          */}
          <NavLink to="/minha-conta" className="identidade identidade--acionavel"
                   aria-label={`${sessao.usuarioNome}, ${ROTULO_PAPEL[sessao.papel]}, Minha conta`}>
            <span className="identidade__avatar" aria-hidden="true">{iniciais(sessao.usuarioNome)}</span>
            <span>
              <span className="identidade__nome">{sessao.usuarioNome}</span>
              <br />
              <span className="identidade__papel">{ROTULO_PAPEL[sessao.papel]}</span>
            </span>
          </NavLink>
        </div>
      </header>

      <main className="conteudo" id="conteudo" tabIndex={-1}>
        <Outlet />
      </main>
    </div>
  );
}
