import { useCallback } from "react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
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

export function Estrutura() {
  const { sessao, sair } = useSessao();
  const [tema, alternarTema] = useTema();
  const navegar = useNavigate();

  // Revoga no servidor antes de esquecer localmente: sem isso, o token de
  // renovação continuaria valendo por dias. É o mesmo caminho para o botão da
  // lateral e para a ação "Sair" da busca do topo.
  const encerrarESair = useCallback(() => {
    void encerrarSessao().finally(() => { sair(); navegar("/entrar"); });
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

      <nav className="lateral" aria-label="Navegação principal">
        <div className="lateral__marca">
          <img src="/icone.svg" alt="" width={40} height={40} style={{ borderRadius: "8px" }} />
          <span>
            <span className="lateral__nome">Defesa Civil 360</span>
            <span className="lateral__org">{sessao.municipio}, {sessao.uf}</span>
          </span>
        </div>

        {grupos.map((grupo) => (
          <div className="lateral__grupo" key={grupo}>
            <span className="lateral__rotulo">{grupo}</span>
            {visiveis.filter((i) => i.grupo === grupo).map((item) => (
              <NavLink key={item.para} to={item.para} className="lateral__item">
                {item.icone}
                {item.rotulo}
              </NavLink>
            ))}
          </div>
        ))}

        <div className="lateral__rodape">
          <button type="button" className="lateral__item" onClick={alternarTema}
                  style={{ border: "none", background: "transparent", cursor: "pointer", width: "100%" }}>
            {tema === "claro" ? <IconeLua /> : <IconeSol />}
            {tema === "claro" ? "Tema escuro" : "Tema claro"}
          </button>
          <button type="button" className="lateral__item" onClick={encerrarESair}
                  style={{ border: "none", background: "transparent", cursor: "pointer", width: "100%" }}>
            <IconeSair />
            Sair
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
