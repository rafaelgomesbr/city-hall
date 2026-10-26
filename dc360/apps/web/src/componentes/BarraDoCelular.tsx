import type { ReactNode, RefObject } from "react";
import { NavLink } from "react-router-dom";
import { IconeLua, IconeReticencias, IconeSair, IconeSol } from "./Icones";

/**
 * Os ladrilhos da barra do pé do celular e o menu "Mais" (H08).
 *
 * Fica separado de `Estrutura.tsx` pelo mesmo motivo de `CorpoDoModal`: o
 * comportamento (foco, Esc, clique fora) só existe em navegador e mora lá, mas
 * a AMARRAÇÃO (`aria-expanded`, `aria-controls`, o texto escondido que diz que
 * a tela atual está dentro do menu, quem fica na barra e quem fica no menu) é o
 * que quebra em silêncio, e assim ela é conferida em teste que roda sem
 * navegador.
 *
 * Os ladrilhos são filhos diretos da `<nav>` (a largura de cada um é a conta de
 * quantos cabem na barra, ver `app.css`), e por isso este componente devolve um
 * fragmento, e não um envoltório.
 */

export type DestinoDaBarra = {
  para: string;
  rotulo: string;
  icone: ReactNode;
  grupo: string;
};

export type PropsBarraDoCelular = {
  /** Os destinos que ficam na barra, na ordem. */
  naBarra: readonly DestinoDaBarra[];
  /** Os que moram no menu "Mais", na ordem. */
  noMais: readonly DestinoDaBarra[];
  /** O menu está aberto. */
  aberto: boolean;
  /** `id` do menu, para o `aria-controls` do botão. */
  menuId: string;
  /** A tela de agora mora dentro do menu. */
  maisTemATela: boolean;
  tema: "claro" | "escuro";
  aoAlternarMenu: () => void;
  /** Escolheu um destino do menu (fecha o menu; quem leva o foco é a troca de tela). */
  aoEscolher: () => void;
  aoAlternarTema: () => void;
  aoSair: () => void;
  refBotao?: RefObject<HTMLButtonElement>;
  refMenu?: RefObject<HTMLDivElement>;
};

export function BarraDoCelular({
  naBarra, noMais, aberto, menuId, maisTemATela, tema,
  aoAlternarMenu, aoEscolher, aoAlternarTema, aoSair, refBotao, refMenu,
}: PropsBarraDoCelular) {
  const grupos = [...new Set(noMais.map((i) => i.grupo))];
  return (
    <>
      {naBarra.map((item) => (
        <NavLink key={item.para} to={item.para} className="lateral__item">
          {item.icone}
          <span className="lateral__texto">{item.rotulo}</span>
        </NavLink>
      ))}

      {/*
        O "Mais" tem tamanho de ladrilho e é o último da barra. Quando a tela de
        agora mora dentro dele, ele leva a mesma marca de "você está aqui" dos
        outros, e o texto escondido diz isso a quem ouve (o botão não aceita
        `aria-current`).
      */}
      <button type="button" ref={refBotao}
              className={`lateral__item lateral__item--botao lateral__mais${maisTemATela ? " lateral__mais--atual" : ""}`}
              aria-expanded={aberto} aria-controls={aberto ? menuId : undefined}
              onClick={aoAlternarMenu}>
        <IconeReticencias />
        <span className="lateral__texto">Mais</span>
        {maisTemATela && <span className="oculto-visualmente">, inclui a tela atual</span>}
      </button>

      {aberto && (
        <div className="lateral__menu" id={menuId} ref={refMenu}>
          {grupos.map((grupo) => (
            <div className="lateral__menu-grupo" role="group" aria-label={grupo} key={grupo}>
              <span className="lateral__menu-rotulo" aria-hidden="true">{grupo}</span>
              {noMais.filter((i) => i.grupo === grupo).map((item) => (
                <NavLink key={item.para} to={item.para} className="lateral__menu-item" onClick={aoEscolher}>
                  {item.icone}
                  <span>{item.rotulo}</span>
                </NavLink>
              ))}
            </div>
          ))}
          {/* "Tema" e "Sair" não cabem numa barra de ladrilhos de destino: moram aqui, no fim. */}
          <div className="lateral__menu-grupo" role="group" aria-label="Sistema">
            <span className="lateral__menu-rotulo" aria-hidden="true">Sistema</span>
            <button type="button" className="lateral__menu-item" onClick={aoAlternarTema}>
              {tema === "claro" ? <IconeLua /> : <IconeSol />}
              <span>{tema === "claro" ? "Tema escuro" : "Tema claro"}</span>
            </button>
            <button type="button" className="lateral__menu-item" onClick={aoSair}>
              <IconeSair />
              <span>Sair</span>
            </button>
          </div>
        </div>
      )}
    </>
  );
}
