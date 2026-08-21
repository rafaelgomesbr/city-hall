import { useState } from "react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { ROTULO_PAPEL, podeExecutar, type Acao } from "@dc360/shared";
import { useSessao, useTema } from "../estado/sessao";
import { iniciais } from "./comuns";
import {
  IconeBusca, IconeEquipes, IconeLua, IconeMapa, IconeOcorrencias,
  IconePainel, IconeSair, IconeSol, IconeUsuarios,
} from "./Icones";

/**
 * Estrutura fixa da aplicação: lateral de navegação, topo com busca e
 * identidade, área de conteúdo.
 *
 * A navegação é filtrada por papel. Um operador de plantão não vê
 * administração de usuários, e isso não é enfeite: é o mesmo princípio de
 * menor privilégio que o RLS aplica no banco, refletido na tela.
 */

type ItemNav = { para: string; rotulo: string; icone: JSX.Element; grupo: string; exige?: Acao };

const NAVEGACAO: ItemNav[] = [
  { para: "/painel", rotulo: "Painel", icone: <IconePainel />, grupo: "Operação" },
  { para: "/ocorrencias", rotulo: "Ocorrências", icone: <IconeOcorrencias />, grupo: "Operação" },
  { para: "/mapa", rotulo: "Mapa da cidade", icone: <IconeMapa />, grupo: "Operação" },
  { para: "/equipes", rotulo: "Equipes", icone: <IconeEquipes />, grupo: "Administração",
    exige: "gerenciar_equipes" },
  { para: "/usuarios", rotulo: "Usuários", icone: <IconeUsuarios />, grupo: "Administração",
    exige: "gerenciar_usuarios" },
];

export function Estrutura() {
  const { sessao, sair } = useSessao();
  const [tema, alternarTema] = useTema();
  const navegar = useNavigate();
  const [busca, setBusca] = useState("");

  if (!sessao) return null;

  const visiveis = NAVEGACAO.filter((i) => !i.exige || podeExecutar(sessao.papel, i.exige));
  const grupos = [...new Set(visiveis.map((i) => i.grupo))];

  function enviarBusca(evento: React.FormEvent) {
    evento.preventDefault();
    const termo = busca.trim();
    navegar(termo ? `/ocorrencias?busca=${encodeURIComponent(termo)}` : "/ocorrencias");
  }

  return (
    <div className="aplicacao">
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
          <button type="button" className="lateral__item" onClick={() => { sair(); navegar("/entrar"); }}
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
          <div className="identidade">
            <span className="identidade__avatar" aria-hidden="true">{iniciais(sessao.usuarioNome)}</span>
            <span>
              <span className="identidade__nome">{sessao.usuarioNome}</span>
              <br />
              <span className="identidade__papel">{ROTULO_PAPEL[sessao.papel]}</span>
            </span>
          </div>
        </div>
      </header>

      <main className="conteudo">
        <Outlet />
      </main>
    </div>
  );
}
