import { useState } from "react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { ROTULO_PAPEL, podeExecutar, type Acao } from "@dc360/shared";
import { useSessao, useTema } from "../estado/sessao";
import { encerrarSessao } from "../dados/repositorio";
import { iniciais } from "./comuns";
import {
  IconeBusca, IconeDocumento, IconeEquipes, IconeLua, IconeMapa,
  IconeOcorrencias, IconePainel, IconePrancheta, IconeSair, IconeSol, IconeUsuarios,
} from "./Icones";

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
    grupo: "Operação", exige: "registrar_vistoria" },
  { para: "/painel", rotulo: "Painel", icone: <IconePainel />, grupo: "Operação",
    escondeSePuder: "registrar_vistoria" },
  { para: "/ocorrencias", rotulo: "Ocorrências", icone: <IconeOcorrencias />, grupo: "Operação",
    escondeSePuder: "registrar_vistoria" },
  { para: "/mapa", rotulo: "Mapa da cidade", icone: <IconeMapa />, grupo: "Operação" },
  { para: "/equipes", rotulo: "Equipes", icone: <IconeEquipes />, grupo: "Administração",
    exige: "gerenciar_equipes" },
  { para: "/usuarios", rotulo: "Usuários", icone: <IconeUsuarios />, grupo: "Administração",
    exige: "gerenciar_usuarios" },
  { para: "/auditoria", rotulo: "Prestação de contas", icone: <IconeDocumento />,
    grupo: "Administração", exige: "consultar_trilha" },
];

export function Estrutura() {
  const { sessao, sair } = useSessao();
  const [tema, alternarTema] = useTema();
  const navegar = useNavigate();
  const [busca, setBusca] = useState("");

  if (!sessao) return null;
  // Capturado aqui porque `enviarBusca` é declaração içada, e o TypeScript não
  // leva o estreitamento do `if` acima para dentro dela.
  const papel = sessao.papel;

  const visiveis = NAVEGACAO.filter((i) =>
    (!i.exige || podeExecutar(sessao.papel, i.exige)) &&
    (!i.escondeSePuder || !podeExecutar(sessao.papel, i.escondeSePuder)));
  const grupos = [...new Set(visiveis.map((i) => i.grupo))];

  function enviarBusca(evento: React.FormEvent) {
    evento.preventDefault();
    const termo = busca.trim();

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
    const destino = podeExecutar(papel, "registrar_vistoria")
      ? "/meu-trabalho"
      : "/ocorrencias";
    navegar(termo ? `${destino}?busca=${encodeURIComponent(termo)}` : destino);
  }

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
          <span className="lateral__sigla" aria-hidden="true">DC</span>
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
          <button type="button" className="lateral__item"
                  onClick={() => {
                    // Revoga no servidor antes de esquecer localmente: sem
                    // isso, o token de renovação continuaria valendo por dias.
                    void encerrarSessao().finally(() => { sair(); navegar("/entrar"); });
                  }}
                  style={{ border: "none", background: "transparent", cursor: "pointer", width: "100%" }}>
            <IconeSair />
            Sair
          </button>
        </div>
      </nav>

      <header className="topo">
        <form className="topo__busca" role="search" onSubmit={enviarBusca}>
          <IconeBusca />
          <label className="oculto-visualmente" htmlFor="busca-global">
            Buscar por protocolo, endereço ou solicitante
          </label>
          <input id="busca-global" type="search" value={busca}
                 onChange={(e) => setBusca(e.target.value)}
                 placeholder="Buscar protocolo, endereço ou solicitante" />
        </form>

        <div className="topo__direita">
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
