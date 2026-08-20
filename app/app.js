/* Estado, navegação, tema e comportamento do protótipo. Sem dependência externa. */
(function () {
  "use strict";

  var CHAVE_TEMA = "dc360-tema";

  var NAV_POR_PERFIL = {
    coordenador: [
      { tela: "painel", rotulo: "Painel", icone: "icone-fila" },
      { tela: "mapa", rotulo: "Mapa", icone: "icone-mapa" },
      { tela: "visao-futura", rotulo: "Visão futura", icone: "icone-sparkles" }
    ],
    operador: [
      { tela: "abertura", rotulo: "Abrir ocorrência", icone: "icone-mais-circulo" },
      { tela: "triagem", rotulo: "Triagem e despacho", icone: "icone-prancheta" }
    ],
    "agente-campo": []
  };

  var TELA_INICIAL_POR_PERFIL = {
    coordenador: "painel",
    operador: "abertura",
    "agente-campo": "tarefas"
  };

  var estado = {
    perfil: "coordenador",
    tema: "claro",
    telaAtivaPorPerfil: {
      coordenador: "painel",
      operador: "abertura",
      "agente-campo": "tarefas"
    },
    ocorrencias: []
  };

  var elementos = {};

  function clonarProfundo(valor) {
    return JSON.parse(JSON.stringify(valor));
  }

  function agoraEm(offsetHoras) {
    if (offsetHoras === null || offsetHoras === undefined) { return null; }
    return new Date(Date.now() + offsetHoras * 3600000).toISOString();
  }

  function prepararOcorrencias() {
    var base = clonarProfundo(window.DC360_DADOS_INICIAIS.ocorrencias);
    return base.map(function (ocorrencia) {
      ocorrencia.criadoEm = agoraEm(ocorrencia.criadoOffsetHoras);
      ocorrencia.despachadoEm = agoraEm(ocorrencia.despachadoOffsetHoras);
      ocorrencia.prazoEm = agoraEm(ocorrencia.prazoOffsetHoras);
      ocorrencia.encerradaEm = agoraEm(ocorrencia.encerradaOffsetHoras);
      ocorrencia.vistoriaConcluidaEm = agoraEm(ocorrencia.vistoriaConcluidaOffsetHoras);
      if (ocorrencia.providencia && ocorrencia.providencia.prazoOffsetHoras !== undefined) {
        ocorrencia.providencia.prazoEm = agoraEm(ocorrencia.providencia.prazoOffsetHoras);
      }
      return ocorrencia;
    });
  }

  function anunciar(mensagem) {
    if (elementos.anunciador) { elementos.anunciador.textContent = mensagem; }
  }

  function iconeSvg(id) {
    return '<svg aria-hidden="true"><use href="#' + id + '"></use></svg>';
  }

  function renderizarNav() {
    var itens = NAV_POR_PERFIL[estado.perfil] || [];
    elementos.navTelas.innerHTML = "";
    elementos.navTelas.hidden = itens.length === 0;

    itens.forEach(function (item) {
      var botao = document.createElement("button");
      botao.type = "button";
      botao.className = "nav-telas__item";
      botao.dataset.tela = item.tela;
      botao.innerHTML = iconeSvg(item.icone) + "<span>" + item.rotulo + "</span>";
      if (estado.telaAtivaPorPerfil[estado.perfil] === item.tela) {
        botao.setAttribute("aria-current", "page");
      }
      botao.addEventListener("click", function () {
        mostrarTela(estado.perfil, item.tela, { moverFoco: true });
      });
      elementos.navTelas.appendChild(botao);
    });
  }

  function mostrarTela(perfil, tela, opcoes) {
    opcoes = opcoes || {};
    estado.telaAtivaPorPerfil[perfil] = tela;

    document.querySelectorAll(".tela").forEach(function (secao) {
      var ativa = secao.dataset.perfil === perfil && secao.dataset.tela === tela;
      if (ativa) {
        secao.setAttribute("data-tela-ativa", "true");
      } else {
        secao.removeAttribute("data-tela-ativa");
      }
    });

    document.querySelectorAll(".nav-telas__item").forEach(function (botao) {
      if (botao.dataset.tela === tela) {
        botao.setAttribute("aria-current", "page");
      } else {
        botao.removeAttribute("aria-current");
      }
    });

    if (opcoes.moverFoco) {
      var secaoAtiva = document.querySelector('.tela[data-perfil="' + perfil + '"][data-tela="' + tela + '"]');
      var titulo = secaoAtiva && secaoAtiva.querySelector("h1");
      if (titulo) { titulo.focus(); }
    }
  }

  function trocarPerfil(perfil) {
    estado.perfil = perfil;
    elementos.seletorPerfil.value = perfil;
    document.body.classList.toggle("modo-campo", perfil === "agente-campo");
    renderizarNav();
    mostrarTela(perfil, estado.telaAtivaPorPerfil[perfil] || TELA_INICIAL_POR_PERFIL[perfil], { moverFoco: false });

    var nomePerfil = { coordenador: "coordenador", operador: "operador", "agente-campo": "agente de campo" }[perfil];
    anunciar("Perfil alterado para " + nomePerfil + ".");
  }

  function aplicarTema(tema, opcoes) {
    opcoes = opcoes || {};
    estado.tema = tema;
    document.documentElement.setAttribute("data-theme", tema === "escuro" ? "dark" : "light");

    var icone = tema === "escuro" ? "icone-sol" : "icone-lua";
    var rotulo = tema === "escuro" ? "Alternar para modo claro" : "Alternar para modo escuro";
    elementos.botaoTema.innerHTML = iconeSvg(icone) + '<span class="visualmente-oculto">' + rotulo + "</span>";
    elementos.botaoTema.setAttribute("aria-pressed", tema === "escuro" ? "true" : "false");

    if (!opcoes.semPersistir) {
      try { window.localStorage.setItem(CHAVE_TEMA, tema); } catch (erro) { /* localStorage indisponível: segue sem persistir */ }
    }
  }

  function temaInicial() {
    try {
      var salvo = window.localStorage.getItem(CHAVE_TEMA);
      if (salvo === "claro" || salvo === "escuro") { return salvo; }
    } catch (erro) { /* localStorage indisponível: cai no padrão do sistema */ }
    var prefereEscuro = window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches;
    return prefereEscuro ? "escuro" : "claro";
  }

  function reiniciarDemo() {
    estado.ocorrencias = prepararOcorrencias();
    anunciar("Demonstração reiniciada. Os dados voltaram ao ponto inicial.");
  }

  function inicializar() {
    elementos.navTelas = document.getElementById("nav-telas");
    elementos.seletorPerfil = document.getElementById("seletor-perfil");
    elementos.botaoTema = document.getElementById("botao-tema");
    elementos.botaoReiniciar = document.getElementById("botao-reiniciar");
    elementos.anunciador = document.getElementById("anunciador");
    elementos.marca = document.querySelector('[data-acao="ir-painel"]');

    estado.ocorrencias = prepararOcorrencias();

    aplicarTema(temaInicial(), { semPersistir: true });
    trocarPerfil(estado.perfil);

    elementos.seletorPerfil.addEventListener("change", function (evento) {
      trocarPerfil(evento.target.value);
    });

    elementos.botaoTema.addEventListener("click", function () {
      aplicarTema(estado.tema === "escuro" ? "claro" : "escuro");
    });

    elementos.botaoReiniciar.addEventListener("click", reiniciarDemo);

    elementos.marca.addEventListener("click", function (evento) {
      evento.preventDefault();
      elementos.seletorPerfil.value = "coordenador";
      trocarPerfil("coordenador");
      mostrarTela("coordenador", "painel", { moverFoco: true });
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", inicializar);
  } else {
    inicializar();
  }
})();
