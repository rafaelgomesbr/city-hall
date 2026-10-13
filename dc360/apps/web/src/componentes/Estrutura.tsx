import { useCallback, useEffect, useRef } from "react";
import type { FocusEvent } from "react";
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
import { Sino } from "./Sino";
import { BuscaGlobal } from "./BuscaGlobal";

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
    grupo: "Operação", exige: "registrar_vistoria",
    sinonimos: ["tarefas", "minhas vistorias", "vistoria", "campo"] },
  { para: "/painel", rotulo: "Painel", icone: <IconePainel />, grupo: "Operação",
    escondeSePuder: "registrar_vistoria",
    sinonimos: ["início", "indicadores", "resumo", "fila de hoje"] },
  { para: "/ocorrencias", rotulo: "Ocorrências", icone: <IconeOcorrencias />, grupo: "Operação",
    escondeSePuder: "registrar_vistoria",
    sinonimos: ["chamado", "chamados", "protocolo", "fila", "lista de ocorrências"] },
  { para: "/mapa", rotulo: "Mapa da cidade", icone: <IconeMapa />, grupo: "Operação",
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
    escondeSePuder: "registrar_vistoria",
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

/**
 * O Tab precisa trazer o item INTEIRO para a tela.
 *
 * No celular a lateral vira barra no pé da tela e rola na horizontal (onze
 * destinos não cabem em 390px: cabem quatro ladrilhos inteiros, ver
 * `--barra-visiveis` na folha). O navegador só rola sozinho quando o item está
 * TOTALMENTE fora: parado pela metade, ele entende que já está visível e deixa
 * o rótulo cortado na borda, com o foco em cima de um texto que não dá para
 * ler. Foi medido com a barra antiga, de rótulo em uma linha: "Mapa da cidade"
 * ia de 255px a 416px numa barra de 390px, e o Tab não movia a barra um pixel.
 * O mesmo valia para "Equipes", "Usuários" e "Tema escuro". Com os ladrilhos
 * o primeiro Tab já não corta nada, mas o foco num ladrilho que está na parte
 * que rola continua precisando trazê-lo para a tela.
 *
 * `inline: "nearest"` rola o mínimo necessário na horizontal, respeitando o
 * `scroll-padding-inline` da barra; `block: "nearest"` impede que isto mexa na
 * rolagem vertical da página. Na largura de mesa a lateral não rola, e a
 * chamada não faz nada.
 */
function trazerParaATela(evento: FocusEvent<HTMLElement>): void {
  evento.currentTarget.scrollIntoView({ inline: "nearest", block: "nearest" });
}

export function Estrutura() {
  const { sessao, sair } = useSessao();
  const [tema, alternarTema] = useTema();
  const navegar = useNavigate();
  const { pathname } = useLocation();
  const barraRef = useRef<HTMLElement>(null);

  /*
    A barra do celular mostra poucos ladrilhos por vez e o resto rola. Quem
    abre "Usuários" por um link (o sino, a busca, o endereço digitado) cairia
    numa barra parada no começo, sem nenhum ladrilho marcado à vista, e a
    pessoa perderia a noção de onde está. Trazer o ladrilho da tela atual para
    dentro é o mínimo para a marca de "você está aqui" continuar visível.
    Rola a barra pelo `scrollLeft`, e NÃO por `scrollIntoView`: o Chromium
    toma o `scrollIntoView` como o ponto de partida do Tab, e o primeiro Tab da
    página passava a cair no item seguinte ao da tela atual em vez de cair em
    "Pular para o conteúdo" (o e2e do modo local pegou). Já à vista (o caso de
    "Mapa da cidade", sempre entre os primeiros), ou na largura de mesa, em que
    a lateral não rola, não faz nada.
  */
  useEffect(() => {
    const barra = barraRef.current;
    const atual = barra?.querySelector<HTMLElement>('.lateral__item[aria-current="page"]');
    if (!barra || !atual || barra.scrollWidth <= barra.clientWidth) return;
    const respiro = parseFloat(getComputedStyle(barra).paddingLeft) || 0;
    const caixaDaBarra = barra.getBoundingClientRect();
    const caixaDoItem = atual.getBoundingClientRect();
    if (caixaDoItem.left < caixaDaBarra.left + respiro) {
      barra.scrollLeft += caixaDoItem.left - caixaDaBarra.left - respiro;
    } else if (caixaDoItem.right > caixaDaBarra.right - respiro) {
      barra.scrollLeft += caixaDoItem.right - caixaDaBarra.right + respiro;
    }
  }, [pathname]);

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

  return (
    <div className="aplicacao">
      {/*
        Primeiro alvo de Tab da página. Sem ele, quem navega por teclado
        atravessa a lateral inteira, item por item, a cada troca de tela, só
        para chegar ao conteúdo. Fica invisível até receber foco.
      */}
      <a className="pular-para-conteudo" href="#conteudo">Pular para o conteúdo</a>

      <nav className="lateral" aria-label="Navegação principal" ref={barraRef}>
        <div className="lateral__marca">
          <img src="/icone.svg" alt="" width={40} height={40} />
          <span>
            <span className="lateral__nome">Defesa Civil 360</span>
            <span className="lateral__org">{sessao.municipio}, {sessao.uf}</span>
          </span>
        </div>

        {grupos.map((grupo) => (
          <div className="lateral__grupo" key={grupo}>
            <span className="lateral__rotulo">{grupo}</span>
            {visiveis.filter((i) => i.grupo === grupo).map((item) => (
              <NavLink key={item.para} to={item.para} className="lateral__item"
                       onFocus={trazerParaATela}>
                {item.icone}
                <span className="lateral__texto">{item.rotulo}</span>
              </NavLink>
            ))}
          </div>
        ))}

        <div className="lateral__rodape">
          <button type="button" className="lateral__item" onClick={alternarTema}
                  onFocus={trazerParaATela}
                  style={{ border: "none", background: "transparent", cursor: "pointer", width: "100%" }}>
            {tema === "claro" ? <IconeLua /> : <IconeSol />}
            <span className="lateral__texto">{tema === "claro" ? "Tema escuro" : "Tema claro"}</span>
          </button>
          <button type="button" className="lateral__item" onClick={encerrarESair}
                  onFocus={trazerParaATela}
                  style={{ border: "none", background: "transparent", cursor: "pointer", width: "100%" }}>
            <IconeSair />
            <span className="lateral__texto">Sair</span>
          </button>
        </div>
      </nav>

      <header className="topo">
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
          <NavLink to="/minha-conta" className="identidade identidade--acionavel">
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
