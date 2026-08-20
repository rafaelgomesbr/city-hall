/* Estado, navegação, tema e comportamento do protótipo. Sem dependência externa. */
(function () {
  "use strict";

  var CHAVE_TEMA = "dc360-tema";

  var NAV_POR_PERFIL = {
    coordenador: [
      { tela: "painel", rotulo: "Painel", icone: "icone-fila" },
      { tela: "mapa", rotulo: "Mapa", icone: "icone-mapa" },
      { tela: "usuarios", rotulo: "Usuários e equipes", icone: "icone-usuarios" },
      { tela: "configuracoes", rotulo: "Configurações", icone: "icone-engrenagem" },
      { tela: "visao-futura", rotulo: "Visão futura", icone: "icone-sparkles" }
    ],
    operador: [
      { tela: "abertura", rotulo: "Abrir ocorrência", icone: "icone-mais-circulo" },
      { tela: "triagem", rotulo: "Triagem", icone: "icone-prancheta" }
    ],
    "agente-campo": []
  };

  var TELA_INICIAL_POR_PERFIL = {
    coordenador: "painel",
    operador: "abertura",
    "agente-campo": "tarefas"
  };

  var RANK_SEVERIDADE = { critica: 4, alta: 3, media: 2, baixa: 1 };
  var ROTULO_SEVERIDADE = { baixa: "Baixa", media: "Média", alta: "Alta", critica: "Crítica" };
  var ICONE_SEVERIDADE = { baixa: "icone-check-circulo", media: "icone-relogio", alta: "icone-alerta", critica: "icone-alerta" };
  var ICONE_STATUS = {
    rascunho: "icone-prancheta",
    registrada: "icone-fila",
    triagem: "icone-prancheta",
    em_campo: "icone-mapa",
    vistoria_concluida: "icone-check-circulo",
    providencia_pendente: "icone-relogio",
    encerrada: "icone-check-circulo"
  };
  var SELO_STATUS = {
    rascunho: "neutro",
    registrada: "info",
    triagem: "info",
    em_campo: "info",
    vistoria_concluida: "sucesso",
    providencia_pendente: "info",
    encerrada: "neutro"
  };
  var STATUS_COM_PRAZO_ATIVO = ["registrada", "triagem", "em_campo", "providencia_pendente"];

  var estado = {
    perfil: "coordenador",
    tema: "claro",
    telaAtivaPorPerfil: {
      coordenador: "painel",
      operador: "abertura",
      "agente-campo": "tarefas"
    },
    ocorrencias: [],
    painelFiltroStatus: "todas",
    painelOrdenacao: "prioridade",
    ocorrenciaSelecionada: null,
    mapaFiltroTipo: "todos",
    mapaFiltroStatus: "todas",
    ocorrenciaEmTriagem: null,
    campoSubtela: "lista",
    campoAba: "tarefas",
    tarefaSelecionada: null
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

    var telaAtual = estado.telaAtivaPorPerfil[estado.perfil];
    var telaParaDestaqueNav = telaAtual === "detalhe" ? "painel" : telaAtual;

    itens.forEach(function (item) {
      var botao = document.createElement("button");
      botao.type = "button";
      botao.className = "nav-telas__item";
      botao.dataset.tela = item.tela;
      botao.innerHTML = iconeSvg(item.icone) + "<span>" + item.rotulo + "</span>";
      if (telaParaDestaqueNav === item.tela) {
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

    var telaParaDestaqueNav = tela === "detalhe" ? "painel" : tela;
    document.querySelectorAll(".nav-telas__item").forEach(function (botao) {
      if (botao.dataset.tela === telaParaDestaqueNav) {
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

    if (elementos.botaoAvatar) {
      elementos.botaoAvatar.hidden = perfil === "agente-campo";
      renderizarPerfil();
    }
    if (perfil === "agente-campo") {
      estado.campoSubtela = "lista";
      estado.campoAba = "tarefas";
      estado.tarefaSelecionada = null;
      var abaTarefas = document.getElementById("aba-campo-tarefas");
      var abaPerfil = document.getElementById("aba-campo-perfil");
      if (abaTarefas) { abaTarefas.setAttribute("aria-selected", "true"); }
      if (abaPerfil) { abaPerfil.setAttribute("aria-selected", "false"); }
      renderizarListaTarefas();
    }

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
    estado.painelFiltroStatus = "todas";
    estado.painelOrdenacao = "prioridade";
    estado.mapaFiltroTipo = "todos";
    estado.mapaFiltroStatus = "todas";
    estado.ocorrenciaEmTriagem = null;
    estado.ocorrenciaSelecionada = null;
    estado.campoSubtela = "lista";
    estado.campoAba = "tarefas";
    estado.tarefaSelecionada = null;
    estado.telaAtivaPorPerfil = {
      coordenador: "painel",
      operador: "abertura",
      "agente-campo": "tarefas"
    };
    rascunhoAbertura = { decisaoVinculo: null, protocoloVinculado: null };
    rascunhoVistoria = { checklist: {}, fotos: [], gps: null, assinaturaFeita: false };

    renderizarPainelCompleto();
    renderizarFiltrosMapa();
    renderizarMapa();
    renderizarAbertura();
    renderizarTriagem();
    document.getElementById("campo-acao-primaria").hidden = true;
    var abaTarefas = document.getElementById("aba-campo-tarefas");
    var abaPerfil = document.getElementById("aba-campo-perfil");
    if (abaTarefas) { abaTarefas.setAttribute("aria-selected", "true"); }
    if (abaPerfil) { abaPerfil.setAttribute("aria-selected", "false"); }
    renderizarListaTarefas();
    renderizarNav();
    mostrarTela(estado.perfil, estado.telaAtivaPorPerfil[estado.perfil], { moverFoco: false });
    anunciar("Demonstração reiniciada. Os dados voltaram ao ponto inicial.");
  }

  /* ---------- Formatação ---------- */

  function formatarDataHora(iso, comAno) {
    if (!iso) { return ""; }
    var opcoes = { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" };
    if (comAno) { opcoes.year = "numeric"; }
    return new Date(iso).toLocaleString("pt-BR", opcoes);
  }

  function formatarPrazoRelativo(ocorrencia) {
    if (ocorrencia.status === "encerrada") { return "Ocorrência encerrada"; }
    if (ocorrencia.status === "vistoria_concluida") { return "Vistoria concluída"; }
    var prazoEm = prazoEfetivoOcorrencia(ocorrencia);
    var prefixoProvidencia = ocorrencia.status === "providencia_pendente" ? "Providência: " : "";
    if (!prazoEm) { return "Sem prazo definido"; }
    var diffMs = new Date(prazoEm).getTime() - Date.now();
    var horasTotais = Math.floor(Math.abs(diffMs) / 3600000);
    var dias = Math.floor(horasTotais / 24);
    var horas = horasTotais % 24;
    var texto;
    if (dias === 0 && horas === 0) {
      texto = "menos de 1h";
    } else if (dias > 0) {
      texto = dias + (dias === 1 ? " dia e " : " dias e ") + horas + "h";
    } else {
      texto = horas + "h";
    }
    var rotuloSituacao = diffMs < 0 ? "atrasada há " : "vence em ";
    if (!prefixoProvidencia) { rotuloSituacao = rotuloSituacao.charAt(0).toUpperCase() + rotuloSituacao.slice(1); }
    return prefixoProvidencia + rotuloSituacao + texto;
  }

  function formatarHorasEmTexto(horas) {
    if (horas % 24 === 0) { return (horas / 24) + (horas === 24 ? " dia" : " dias"); }
    if (horas < 24) { return horas + "h"; }
    return Math.floor(horas / 24) + "d " + (horas % 24) + "h";
  }

  /* ---------- Regras de negócio da fila ---------- */

  function ocorrenciaAtiva(ocorrencia) { return ocorrencia.status !== "encerrada" && ocorrencia.status !== "rascunho"; }

  /* O prazo que importa para a fila muda com o status: nas fases iniciais é o prazo
     da própria ocorrência; numa providência pendente é o prazo da providência (o
     prazo de vistoria já foi cumprido); vistoria concluída e encerrada não têm
     contagem ativa, então não competem por "mais próxima do vencimento". */
  function prazoEfetivoOcorrencia(ocorrencia) {
    if (STATUS_COM_PRAZO_ATIVO.indexOf(ocorrencia.status) === -1) { return null; }
    if (ocorrencia.status === "providencia_pendente") {
      return ocorrencia.providencia ? ocorrencia.providencia.prazoEm : null;
    }
    return ocorrencia.prazoEm;
  }

  function ocorrenciaAtrasada(ocorrencia) {
    var prazo = prazoEfetivoOcorrencia(ocorrencia);
    return !!prazo && new Date(prazo).getTime() < Date.now();
  }

  function buscarOcorrencia(protocolo) {
    var lista = estado.ocorrencias;
    for (var i = 0; i < lista.length; i++) {
      if (lista[i].protocolo === protocolo) { return lista[i]; }
    }
    return null;
  }

  function buscarEquipe(equipeId) {
    if (!equipeId) { return null; }
    var equipes = window.DC360_DADOS_INICIAIS.equipes;
    for (var i = 0; i < equipes.length; i++) {
      if (equipes[i].id === equipeId) { return equipes[i]; }
    }
    return null;
  }

  function compararPrazo(a, b) {
    var prazoA = prazoEfetivoOcorrencia(a);
    var prazoB = prazoEfetivoOcorrencia(b);
    if (!prazoA && !prazoB) { return 0; }
    if (!prazoA) { return 1; }
    if (!prazoB) { return -1; }
    return new Date(prazoA) - new Date(prazoB);
  }

  function compararPrioridade(a, b) {
    var atrasoA = ocorrenciaAtrasada(a) ? 1 : 0;
    var atrasoB = ocorrenciaAtrasada(b) ? 1 : 0;
    if (atrasoA !== atrasoB) { return atrasoB - atrasoA; }
    var rankA = RANK_SEVERIDADE[a.severidade] || 0;
    var rankB = RANK_SEVERIDADE[b.severidade] || 0;
    if (rankA !== rankB) { return rankB - rankA; }
    return compararPrazo(a, b);
  }

  function ordenarOcorrencias(lista, criterio) {
    var copia = lista.slice();
    copia.sort(criterio === "prazo" ? compararPrazo : compararPrioridade);
    return copia;
  }

  function filtrarPorStatus(lista, statusChave) {
    if (statusChave === "todas") { return lista; }
    return lista.filter(function (o) { return o.status === statusChave; });
  }

  /* ---------- Indicadores (contagem animada) ---------- */

  function tokenDuracaoMs(nomeToken) {
    var valor = getComputedStyle(document.documentElement).getPropertyValue(nomeToken);
    return parseFloat(valor) || 0;
  }

  /* Aproxima --ds-ease (cubic-bezier(0.2, 0, 0, 1), início rápido e chegada suave)
     com uma curva de ease-out cúbica: avaliar o bezier exato exigiria uma biblioteca,
     e essa aproximação já produz a mesma sensação de desaceleração no fim. */
  function easeAproximado(t) { return 1 - Math.pow(1 - t, 3); }

  function animarContador(elemento, valorFinal) {
    var reduzido = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduzido || valorFinal === 0) { elemento.textContent = String(valorFinal); return; }
    var inicio = null;
    var duracaoMs = tokenDuracaoMs("--ds-dur-slow") || 300;
    function passo(agora) {
      if (inicio === null) { inicio = agora; }
      var progresso = Math.min((agora - inicio) / duracaoMs, 1);
      elemento.textContent = String(Math.round(easeAproximado(progresso) * valorFinal));
      if (progresso < 1) { window.requestAnimationFrame(passo); }
    }
    window.requestAnimationFrame(passo);
  }

  function renderizarIndicadores() {
    var lista = estado.ocorrencias;
    var indicadores = [
      { rotulo: "Total na fila", valor: lista.length, modificador: "" },
      { rotulo: "Em campo", valor: lista.filter(function (o) { return o.status === "em_campo"; }).length, modificador: "" },
      { rotulo: "Atrasadas", valor: lista.filter(ocorrenciaAtrasada).length, modificador: "indicador--perigo" },
      { rotulo: "Críticas ativas", valor: lista.filter(function (o) { return o.severidade === "critica" && ocorrenciaAtiva(o); }).length, modificador: "indicador--critico" }
    ];
    var container = document.getElementById("painel-indicadores");
    container.innerHTML = indicadores.map(function (item, indice) {
      return '<div class="card indicador ' + item.modificador + '">' +
        '<span class="indicador__valor" id="painel-indicador-' + indice + '">0</span>' +
        '<span class="indicador__rotulo">' + item.rotulo + "</span></div>";
    }).join("");
    indicadores.forEach(function (item, indice) {
      animarContador(document.getElementById("painel-indicador-" + indice), item.valor);
    });
  }

  /* ---------- Filtros e ordenação da fila ---------- */

  function renderizarFiltros() {
    var dados = window.DC360_DADOS_INICIAIS;
    var lista = estado.ocorrencias;
    var opcoes = [{ chave: "todas", rotulo: "Todas" }].concat(dados.statusOcorrencia);
    var container = document.getElementById("painel-filtros");
    container.innerHTML = opcoes.map(function (op) {
      var contagem = op.chave === "todas" ? lista.length : lista.filter(function (o) { return o.status === op.chave; }).length;
      var pressionado = estado.painelFiltroStatus === op.chave;
      return '<button type="button" class="chip" data-filtro-status="' + op.chave + '" aria-pressed="' + pressionado + '">' +
        op.rotulo + '<span class="chip__contagem">' + contagem + "</span></button>";
    }).join("");
    Array.prototype.forEach.call(container.querySelectorAll("[data-filtro-status]"), function (botao) {
      botao.addEventListener("click", function () {
        estado.painelFiltroStatus = botao.dataset.filtroStatus;
        renderizarFiltros();
        renderizarTabelaPainel();
      });
    });
  }

  function renderizarOrdenacao() {
    var opcoes = [
      { chave: "prioridade", rotulo: "Prioridade" },
      { chave: "prazo", rotulo: "Prazo mais próximo" }
    ];
    var container = document.getElementById("painel-ordenacao");
    container.innerHTML = opcoes.map(function (op) {
      var pressionado = estado.painelOrdenacao === op.chave;
      return '<button type="button" class="chip" data-ordenar="' + op.chave + '" aria-pressed="' + pressionado + '">Ordenar: ' + op.rotulo + "</button>";
    }).join("");
    Array.prototype.forEach.call(container.querySelectorAll("[data-ordenar]"), function (botao) {
      botao.addEventListener("click", function () {
        estado.painelOrdenacao = botao.dataset.ordenar;
        renderizarOrdenacao();
        renderizarTabelaPainel();
      });
    });
  }

  function linhaTabelaOcorrencia(ocorrencia) {
    var equipe = buscarEquipe(ocorrencia.equipeId);
    var atrasada = ocorrenciaAtrasada(ocorrencia);
    var statusInfo = window.DC360_DADOS_INICIAIS.statusOcorrencia.filter(function (s) { return s.chave === ocorrencia.status; })[0];
    var prazoHtml = atrasada
      ? '<span class="selo selo--perigo">' + iconeSvg("icone-alerta") + formatarPrazoRelativo(ocorrencia) + "</span>"
      : '<span class="tx-body-sm">' + formatarPrazoRelativo(ocorrencia) + "</span>";
    return '<tr data-protocolo="' + ocorrencia.protocolo + '" tabindex="0" role="button" aria-label="Abrir ocorrência ' + ocorrencia.protocolo + '">' +
      "<td>" + ocorrencia.protocolo + "</td>" +
      "<td>" + ocorrencia.tipo + "</td>" +
      "<td>" + (ocorrencia.severidade ? '<span class="selo selo--sev-' + ocorrencia.severidade + '">' + iconeSvg(ICONE_SEVERIDADE[ocorrencia.severidade]) + ROTULO_SEVERIDADE[ocorrencia.severidade] + "</span>" : '<span class="tx-muted tx-body-sm">Não classificada</span>') +
      (ocorrencia.vulnerabilidade ? ' <span class="selo selo--perigo">' + iconeSvg("icone-alerta") + "Vulnerável</span>" : "") + "</td>" +
      "<td>" + ocorrencia.endereco + "</td>" +
      "<td>" + (equipe ? equipe.nome : '<span class="tx-muted">Não atribuída</span>') + "</td>" +
      "<td>" + prazoHtml + "</td>" +
      "<td><span class=\"selo selo--" + SELO_STATUS[ocorrencia.status] + "\">" + iconeSvg(ICONE_STATUS[ocorrencia.status]) + statusInfo.rotulo + "</span></td>" +
      "</tr>";
  }

  function renderizarTabelaPainel() {
    var lista = filtrarPorStatus(estado.ocorrencias, estado.painelFiltroStatus);
    lista = ordenarOcorrencias(lista, estado.painelOrdenacao);
    var corpo = document.getElementById("painel-tabela-corpo");
    var wrap = document.getElementById("painel-tabela-wrap");
    var vazio = document.getElementById("painel-estado-vazio");

    if (lista.length === 0) {
      wrap.hidden = true;
      vazio.hidden = false;
      vazio.innerHTML = iconeSvg("icone-fila") +
        '<p class="estado-vazio__titulo">Nenhuma ocorrência com esse status</p>' +
        '<p class="estado-vazio__texto tx-body-sm">Escolha outro filtro acima, ou selecione "Todas" para ver a fila completa.</p>';
      return;
    }

    wrap.hidden = false;
    vazio.hidden = true;
    corpo.innerHTML = lista.map(linhaTabelaOcorrencia).join("");
  }

  function renderizarPainelCompleto() {
    renderizarIndicadores();
    renderizarFiltros();
    renderizarOrdenacao();
    renderizarTabelaPainel();
  }

  /* ---------- Mapa esquemático ---------- */

  function ocorrenciasFiltradasNoMapa() {
    return estado.ocorrencias.filter(function (o) {
      var passaTipo = estado.mapaFiltroTipo === "todos" || o.tipo === estado.mapaFiltroTipo;
      var passaStatus = estado.mapaFiltroStatus === "todas" || o.status === estado.mapaFiltroStatus;
      return passaTipo && passaStatus;
    });
  }

  function renderizarFiltrosMapa() {
    var dados = window.DC360_DADOS_INICIAIS;
    var lista = estado.ocorrencias;

    var opcoesTipo = [{ chave: "todos", rotulo: "Todos os tipos" }].concat(
      dados.tiposCobrade.map(function (t) { return { chave: t, rotulo: t }; })
    );
    var containerTipo = document.getElementById("mapa-filtro-tipo");
    containerTipo.innerHTML = opcoesTipo.map(function (op) {
      var contagem = op.chave === "todos" ? lista.length : lista.filter(function (o) { return o.tipo === op.chave; }).length;
      var pressionado = estado.mapaFiltroTipo === op.chave;
      return '<button type="button" class="chip" data-mapa-tipo="' + op.chave + '" aria-pressed="' + pressionado + '">' +
        op.rotulo + '<span class="chip__contagem">' + contagem + "</span></button>";
    }).join("");
    Array.prototype.forEach.call(containerTipo.querySelectorAll("[data-mapa-tipo]"), function (botao) {
      botao.addEventListener("click", function () {
        estado.mapaFiltroTipo = botao.dataset.mapaTipo;
        renderizarFiltrosMapa();
        renderizarMapa();
      });
    });

    var opcoesStatus = [{ chave: "todas", rotulo: "Todos os status" }].concat(dados.statusOcorrencia);
    var containerStatus = document.getElementById("mapa-filtro-status");
    containerStatus.innerHTML = opcoesStatus.map(function (op) {
      var contagem = op.chave === "todas" ? lista.length : lista.filter(function (o) { return o.status === op.chave; }).length;
      var pressionado = estado.mapaFiltroStatus === op.chave;
      return '<button type="button" class="chip" data-mapa-status="' + op.chave + '" aria-pressed="' + pressionado + '">' +
        op.rotulo + '<span class="chip__contagem">' + contagem + "</span></button>";
    }).join("");
    Array.prototype.forEach.call(containerStatus.querySelectorAll("[data-mapa-status]"), function (botao) {
      botao.addEventListener("click", function () {
        estado.mapaFiltroStatus = botao.dataset.mapaStatus;
        renderizarFiltrosMapa();
        renderizarMapa();
      });
    });
  }

  function pinoSvg(ocorrencia, x, y) {
    var severidade = ocorrencia.severidade || "baixa";
    var anel = severidade === "critica" ? '<circle class="mapa-pino__anel" r="2.2"></circle>' : "";
    return '<g class="mapa-pino mapa-pino--' + severidade + '" tabindex="0" role="button" ' +
      'aria-label="Abrir ocorrência ' + ocorrencia.protocolo + '" data-protocolo="' + ocorrencia.protocolo + '" ' +
      'transform="translate(' + x + " " + y + ')">' +
      anel +
      '<circle class="mapa-pino__nucleo" r="1.7"></circle>' +
      "<title>" + ocorrencia.protocolo + ", " + ocorrencia.tipo + ", " + ocorrencia.endereco + "</title>" +
      "</g>";
  }

  /* Duas ocorrências no mesmo endereço (ex.: a protagonista e um chamado antigo
     do mesmo imóvel) caem exatamente na mesma coordenada. Sem isso, um pino fica
     embaixo do outro, impossível de ver ou clicar. */
  function posicoesMapaSemSobreposicao(lista) {
    var grupos = {};
    lista.forEach(function (o) {
      var chave = o.mapaX + "," + o.mapaY;
      (grupos[chave] = grupos[chave] || []).push(o);
    });
    var posicoes = {};
    Object.keys(grupos).forEach(function (chave) {
      var grupo = grupos[chave];
      if (grupo.length === 1) {
        posicoes[grupo[0].protocolo] = { x: grupo[0].mapaX, y: grupo[0].mapaY };
        return;
      }
      var raio = 3;
      grupo.forEach(function (o, indice) {
        var angulo = (2 * Math.PI * indice) / grupo.length;
        posicoes[o.protocolo] = {
          x: o.mapaX + raio * Math.cos(angulo),
          y: o.mapaY + raio * Math.sin(angulo)
        };
      });
    });
    return posicoes;
  }

  function itemListaMapa(ocorrencia) {
    var statusInfo = window.DC360_DADOS_INICIAIS.statusOcorrencia.filter(function (s) { return s.chave === ocorrencia.status; })[0];
    return '<div class="mapa-lista__item" data-protocolo="' + ocorrencia.protocolo + '" tabindex="0" role="button" aria-label="Abrir ocorrência ' + ocorrencia.protocolo + '">' +
      '<span class="mapa-lista__protocolo">' + ocorrencia.protocolo + "</span>" +
      '<span class="mapa-lista__endereco">' + ocorrencia.tipo + ", " + ocorrencia.endereco + "</span>" +
      "<span>" + (ocorrencia.severidade ? '<span class="selo selo--sev-' + ocorrencia.severidade + '">' + iconeSvg(ICONE_SEVERIDADE[ocorrencia.severidade]) + ROTULO_SEVERIDADE[ocorrencia.severidade] + "</span> " : "") +
      (ocorrencia.vulnerabilidade ? '<span class="selo selo--perigo">' + iconeSvg("icone-alerta") + "Vulnerável</span> " : "") +
      '<span class="selo selo--' + SELO_STATUS[ocorrencia.status] + '">' + iconeSvg(ICONE_STATUS[ocorrencia.status]) + statusInfo.rotulo + "</span></span>" +
      "</div>";
  }

  function renderizarMapa() {
    var lista = ocorrenciasFiltradasNoMapa();
    var quadro = document.getElementById("mapa-quadro");
    var vazio = document.getElementById("mapa-quadro-vazio");
    var listaPanel = document.querySelector(".mapa-lista");

    if (lista.length === 0) {
      quadro.hidden = true;
      listaPanel.hidden = true;
      vazio.hidden = false;
      return;
    }

    quadro.hidden = false;
    listaPanel.hidden = false;
    vazio.hidden = true;

    var posicoes = posicoesMapaSemSobreposicao(lista);
    document.getElementById("mapa-pinos").innerHTML = lista.map(function (o) {
      var p = posicoes[o.protocolo];
      return pinoSvg(o, p.x, p.y);
    }).join("");
    document.getElementById("mapa-lista-corpo").innerHTML = lista.map(itemListaMapa).join("");
  }

  /* ---------- Detalhe da ocorrência ---------- */

  function abrirDetalhe(protocolo) {
    estado.ocorrenciaSelecionada = protocolo;
    mostrarTela("coordenador", "detalhe", { moverFoco: true });
    renderizarDetalhe();
  }

  function eventoLinhaTempo(iconeChave, rotulo, dataIso, corpo) {
    if (!dataIso) { return ""; }
    return '<div class="linha-tempo__evento">' +
      '<div class="linha-tempo__marco"><span class="linha-tempo__ponto"></span><span class="linha-tempo__linha"></span></div>' +
      '<div class="linha-tempo__corpo">' +
      '<p class="tx-body tx-forte">' + rotulo + "</p>" +
      '<p class="tx-body-sm tx-muted">' + formatarDataHora(dataIso, true) + "</p>" +
      (corpo ? '<p class="tx-body-sm">' + corpo + "</p>" : "") +
      "</div></div>";
  }

  function renderizarDetalhe() {
    var ocorrencia = buscarOcorrencia(estado.ocorrenciaSelecionada);
    var titulo = document.getElementById("titulo-detalhe");
    var subtitulo = document.getElementById("detalhe-subtitulo");
    var container = document.getElementById("detalhe-conteudo");

    if (!ocorrencia) {
      titulo.textContent = "Ocorrência não encontrada";
      subtitulo.textContent = "";
      container.innerHTML = '<div class="estado-vazio card">' + iconeSvg("icone-alerta") +
        '<p class="estado-vazio__titulo">Não foi possível abrir esta ocorrência</p>' +
        '<p class="estado-vazio__texto tx-body-sm">Volte ao painel e selecione novamente.</p></div>';
      return;
    }

    var equipe = buscarEquipe(ocorrencia.equipeId);
    var statusInfo = window.DC360_DADOS_INICIAIS.statusOcorrencia.filter(function (s) { return s.chave === ocorrencia.status; })[0];
    var atrasada = ocorrenciaAtrasada(ocorrencia);

    titulo.textContent = ocorrencia.protocolo;
    subtitulo.textContent = ocorrencia.tipo + ", " + ocorrencia.endereco;

    var selos = '<span class="selo selo--' + SELO_STATUS[ocorrencia.status] + '">' + iconeSvg(ICONE_STATUS[ocorrencia.status]) + statusInfo.rotulo + "</span>" +
      (ocorrencia.severidade ? ' <span class="selo selo--sev-' + ocorrencia.severidade + '">' + iconeSvg(ICONE_SEVERIDADE[ocorrencia.severidade]) + ROTULO_SEVERIDADE[ocorrencia.severidade] + "</span>" : "") +
      (ocorrencia.vulnerabilidade ? ' <span class="selo selo--perigo">' + iconeSvg("icone-alerta") + "Vulnerabilidade presente</span>" : "") +
      (atrasada ? ' <span class="selo selo--perigo">' + iconeSvg("icone-alerta") + formatarPrazoRelativo(ocorrencia) + "</span>" : "") +
      (ocorrencia.vinculadaA ? ' <span class="selo selo--info">' + iconeSvg("icone-relogio") + "Vinculada a " + ocorrencia.vinculadaA + "</span>" : "");

    var rotuloPrazo = ocorrencia.status === "providencia_pendente" ? "Prazo da providência" : "Prazo";
    var prazoEfetivo = prazoEfetivoOcorrencia(ocorrencia);

    var camposBase = [
      ["Solicitante", ocorrencia.solicitante],
      ["Equipe designada", equipe ? equipe.nome : "Não atribuída"],
      [rotuloPrazo, prazoEfetivo ? formatarDataHora(prazoEfetivo, true) : formatarPrazoRelativo(ocorrencia)],
      ["Vulnerabilidade", ocorrencia.vulnerabilidade ? ocorrencia.vulnerabilidadeDescricao : "Não identificada"]
    ];
    if (ocorrencia.operadorResponsavel) {
      camposBase.push(["Registrada por", ocorrencia.operadorResponsavel]);
    }
    if (ocorrencia.vistoria && ocorrencia.vistoria.assinante) {
      camposBase.push(["Vistoria assinada por", ocorrencia.vistoria.assinante]);
    }
    if (ocorrencia.providencia) {
      camposBase.push(["Providência encaminhada", ocorrencia.providencia.secretaria + ": " + ocorrencia.providencia.descricao]);
      camposBase.push(["Responsável pela providência", ocorrencia.providencia.responsavel]);
    }
    var camposHtml = camposBase.map(function (par) {
      return '<div class="campo-leitura"><span class="campo-leitura__rotulo">' + par[0] + '</span><span class="campo-leitura__valor">' + par[1] + "</span></div>";
    }).join("");

    var linhaTempoHtml = eventoLinhaTempo("icone-fila", "Ocorrência registrada", ocorrencia.criadoEm) +
      (ocorrencia.vinculadaA ? eventoLinhaTempo("icone-relogio", "Vinculada ao chamado " + ocorrencia.vinculadaA, ocorrencia.criadoEm) : "") +
      eventoLinhaTempo("icone-mapa", "Despachada" + (equipe ? " para " + equipe.nome : ""), ocorrencia.despachadoEm) +
      eventoLinhaTempo("icone-check-circulo", "Vistoria concluída", ocorrencia.vistoriaConcluidaEm) +
      eventoLinhaTempo("icone-check-circulo", "Ocorrência encerrada", ocorrencia.encerradaEm, ocorrencia.motivoEncerramento);

    var podeDespachar = estado.perfil === "coordenador" && ocorrencia.status === "triagem" && !ocorrencia.equipeId;
    var despachoHtml = "";
    if (podeDespachar) {
      var dados = window.DC360_DADOS_INICIAIS;
      var prazoSugerido = dados.prazosPadraoHoras[ocorrencia.severidade] || 24;
      var opcoesEquipe = dados.equipes.map(function (eq) {
        var situacao = eq.status === "em_campo" ? "em campo" : "disponível";
        return '<option value="' + eq.id + '">' + eq.nome + " (" + situacao + ")</option>";
      }).join("");
      despachoHtml = '<div class="cartao-acao" id="bloco-despacho">' +
        '<h2 class="tx-h3 mb-4">Despachar para equipe</h2>' +
        '<form id="form-despacho" novalidate>' +
        campoSelecao("despacho-equipe", "Equipe responsável", opcoesEquipe) +
        '<div class="campo" id="campo-despacho-prazo">' +
        '<label class="campo__rotulo" for="despacho-prazo">Prazo, em horas</label>' +
        '<input class="entrada" type="number" min="1" max="240" id="despacho-prazo" value="' + prazoSugerido + '">' +
        '<span class="campo__ajuda">Padrão para severidade ' + ROTULO_SEVERIDADE[ocorrencia.severidade] + ': ' + formatarHorasEmTexto(prazoSugerido) + '.</span>' +
        '<span class="campo__erro" hidden></span>' +
        "</div>" +
        '<div class="formulario__acoes"><button type="submit" class="btn btn--primario">Despachar para equipe</button></div>' +
        "</form></div>";
    }

    container.innerHTML =
      '<div class="card">' +
      '<div class="linha-cabecalho-entidade mb-4">' + selos + "</div>" +
      '<p class="tx-body">' + ocorrencia.descricao + "</p>" +
      "</div>" +
      despachoHtml +
      '<div class="card">' +
      '<h2 class="tx-h3 mb-4">Dados da ocorrência</h2>' +
      '<div class="grade-leitura">' + camposHtml + "</div>" +
      "</div>" +
      '<div class="card">' +
      '<h2 class="tx-h3 mb-4">Linha do tempo</h2>' +
      '<div class="linha-tempo">' + linhaTempoHtml + "</div>" +
      "</div>";

    if (podeDespachar) {
      document.getElementById("form-despacho").addEventListener("submit", function (evento) {
        evento.preventDefault();
        var equipeId = document.getElementById("despacho-equipe").value;
        var prazoInput = document.getElementById("despacho-prazo");
        var prazoHoras = parseFloat(prazoInput.value);
        if (!equipeId) {
          marcarErroCampo("despacho-equipe", "Escolha uma equipe.");
          document.getElementById("despacho-equipe").focus();
          return;
        }
        limparErroCampo("despacho-equipe");
        if (!prazoHoras || prazoHoras <= 0) {
          marcarErroCampo("despacho-prazo", "Informe um prazo válido, em horas.");
          prazoInput.focus();
          return;
        }
        limparErroCampo("despacho-prazo");

        ocorrencia.equipeId = equipeId;
        ocorrencia.status = "em_campo";
        ocorrencia.despachadoEm = new Date().toISOString();
        ocorrencia.prazoEm = new Date(Date.now() + prazoHoras * 3600000).toISOString();

        atualizarTudoAposMudanca();
        anunciar("Ocorrência " + ocorrencia.protocolo + " despachada.");
      });
    }
  }

  /* ---------- Utilitários de formulário ---------- */

  var CANAIS_ENTRADA = ["Telefone", "WhatsApp", "Presencial", "Ofício da Secretaria"];

  function campoTexto(id, rotulo) {
    return '<div class="campo" id="campo-' + id + '">' +
      '<label class="campo__rotulo" for="' + id + '">' + rotulo + "</label>" +
      '<input class="entrada" type="text" id="' + id + '">' +
      '<span class="campo__erro" hidden></span>' +
      "</div>";
  }

  function campoArea(id, rotulo) {
    return '<div class="campo" id="campo-' + id + '">' +
      '<label class="campo__rotulo" for="' + id + '">' + rotulo + "</label>" +
      '<textarea class="area-texto" id="' + id + '"></textarea>' +
      '<span class="campo__erro" hidden></span>' +
      "</div>";
  }

  function campoSelecao(id, rotulo, opcoesHtml) {
    return '<div class="campo" id="campo-' + id + '">' +
      '<label class="campo__rotulo" for="' + id + '">' + rotulo + "</label>" +
      '<select class="selecao" id="' + id + '"><option value="">Selecione</option>' + opcoesHtml + "</select>" +
      '<span class="campo__erro" hidden></span>' +
      "</div>";
  }

  function marcarErroCampo(id, mensagem) {
    var campo = document.getElementById("campo-" + id);
    if (!campo) { return; }
    campo.classList.add("campo--invalido");
    var erro = campo.querySelector(".campo__erro");
    erro.hidden = false;
    erro.innerHTML = iconeSvg("icone-alerta") + mensagem;
  }

  function limparErroCampo(id) {
    var campo = document.getElementById("campo-" + id);
    if (!campo) { return; }
    campo.classList.remove("campo--invalido");
    campo.querySelector(".campo__erro").hidden = true;
  }

  function gerarProtocolo() {
    var maiorNumero = 0;
    var anoDoMaior = new Date().getFullYear();
    estado.ocorrencias.forEach(function (o) {
      var partes = o.protocolo.split("/");
      var numero = parseInt(partes[0], 10);
      if (numero > maiorNumero) { maiorNumero = numero; anoDoMaior = partes[1]; }
    });
    return String(maiorNumero + 1).padStart(6, "0") + "/" + anoDoMaior;
  }

  function normalizarTexto(texto) {
    return texto.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
  }

  function buscarOcorrenciaPorEndereco(endereco) {
    var alvo = normalizarTexto(endereco || "");
    if (alvo.length < 4) { return null; }
    return estado.ocorrencias.filter(function (o) { return normalizarTexto(o.endereco) === alvo; })[0] || null;
  }

  function coordenadaAleatoriaMapa() {
    return { x: Math.round(10 + Math.random() * 80), y: Math.round(10 + Math.random() * 80) };
  }

  function gpsAleatorio() {
    var municipio = window.DC360_DADOS_INICIAIS.ocorrencias[0].gps;
    return {
      lat: Number((municipio.lat + (Math.random() - 0.5) * 0.04).toFixed(4)),
      lng: Number((municipio.lng + (Math.random() - 0.5) * 0.04).toFixed(4))
    };
  }

  function atualizarTudoAposMudanca() {
    renderizarPainelCompleto();
    renderizarFiltrosMapa();
    renderizarMapa();
    atualizarSeletorTriagem();
    renderizarListaTarefas();
    if (estado.ocorrenciaSelecionada) { renderizarDetalhe(); }
  }

  /* ---------- Abertura de ocorrência (perfil operador) ---------- */

  var rascunhoAbertura = { decisaoVinculo: null, protocoloVinculado: null };

  function renderizarAbertura() {
    var dados = window.DC360_DADOS_INICIAIS;
    var opcoesTipo = dados.tiposCobrade.map(function (t) { return '<option value="' + t + '">' + t + "</option>"; }).join("");
    var opcoesCanal = CANAIS_ENTRADA.map(function (c) { return '<option value="' + c + '">' + c + "</option>"; }).join("");
    var operador = dados.usuariosPorPerfil.operador;
    var coordenador = dados.usuariosPorPerfil.coordenador;

    document.getElementById("abertura-conteudo").innerHTML =
      '<div class="faixa-usuario">Atendendo como <strong>' + operador.nome + "</strong>, " + operador.cargo +
      ". Depois da triagem, quem despacha para a equipe é a coordenadora <strong>" + coordenador.nome + "</strong>.</div>" +
      '<form class="formulario card" id="form-abertura" novalidate>' +
      campoTexto("abertura-solicitante", "Nome do solicitante") +
      campoSelecao("abertura-canal", "Canal de entrada", opcoesCanal) +
      campoTexto("abertura-endereco", "Endereço completo") +
      '<div id="abertura-duplicidade"></div>' +
      campoSelecao("abertura-tipo", "Tipo de ocorrência (COBRADE)", opcoesTipo) +
      campoArea("abertura-descricao", "Descrição do que foi relatado") +
      '<div class="formulario__acoes">' +
      '<button type="submit" class="btn btn--primario">Registrar ocorrência</button>' +
      "</div></form>" +
      '<div class="card confirmacao" id="abertura-confirmacao" hidden></div>';

    document.getElementById("abertura-endereco").addEventListener("input", atualizarDuplicidadeAbertura);
    document.getElementById("form-abertura").addEventListener("submit", enviarAbertura);
  }

  function renderizarPainelDuplicidade(encontrada) {
    var painel = document.getElementById("abertura-duplicidade");
    if (!painel) { return; }
    var decisao = rascunhoAbertura.decisaoVinculo;
    painel.innerHTML = '<div class="aviso-duplicidade">' +
      '<div class="aviso-duplicidade__titulo">' + iconeSvg("icone-relogio") + "Possível duplicidade encontrada</div>" +
      '<p class="tx-body-sm">Já existe um chamado com este endereço: <strong>' + encontrada.protocolo + "</strong>, " + encontrada.tipo +
      ", registrado em " + formatarDataHora(encontrada.criadoEm, true) + '. Descrição registrada: "' + encontrada.descricao + '"</p>' +
      '<div class="aviso-duplicidade__acoes">' +
      '<button type="button" class="btn btn--secundario btn--pequeno" data-decisao="vincular" aria-pressed="' + (decisao === "vincular") + '">Vincular a este chamado</button>' +
      '<button type="button" class="btn btn--secundario btn--pequeno" data-decisao="novo" aria-pressed="' + (decisao === "novo") + '">Seguir como novo registro</button>' +
      "</div>" +
      (decisao ? '<p class="aviso-duplicidade__decisao">' + (decisao === "vincular" ? "Vai ficar vinculado a " + encontrada.protocolo + "." : "Vai seguir como registro independente.") + "</p>" : "") +
      "</div>";
    Array.prototype.forEach.call(painel.querySelectorAll("[data-decisao]"), function (botao) {
      botao.addEventListener("click", function () {
        rascunhoAbertura.decisaoVinculo = botao.dataset.decisao;
        renderizarPainelDuplicidade(encontrada);
      });
    });
  }

  function atualizarDuplicidadeAbertura() {
    var endereco = document.getElementById("abertura-endereco").value;
    var encontrada = buscarOcorrenciaPorEndereco(endereco);
    var painel = document.getElementById("abertura-duplicidade");
    if (!encontrada) {
      painel.innerHTML = "";
      rascunhoAbertura.decisaoVinculo = null;
      rascunhoAbertura.protocoloVinculado = null;
      return;
    }
    if (rascunhoAbertura.protocoloVinculado !== encontrada.protocolo) {
      rascunhoAbertura.decisaoVinculo = null;
      rascunhoAbertura.protocoloVinculado = encontrada.protocolo;
    }
    renderizarPainelDuplicidade(encontrada);
  }

  function enviarAbertura(evento) {
    evento.preventDefault();
    var solicitante = document.getElementById("abertura-solicitante").value.trim();
    var canal = document.getElementById("abertura-canal").value;
    var endereco = document.getElementById("abertura-endereco").value.trim();
    var tipo = document.getElementById("abertura-tipo").value;
    var descricao = document.getElementById("abertura-descricao").value.trim();

    var valido = true;
    [
      ["abertura-solicitante", solicitante, "Informe o nome do solicitante."],
      ["abertura-canal", canal, "Escolha o canal de entrada."],
      ["abertura-endereco", endereco, "Informe o endereço completo."],
      ["abertura-tipo", tipo, "Escolha o tipo de ocorrência."],
      ["abertura-descricao", descricao, "Descreva o que foi relatado."]
    ].forEach(function (par) {
      if (!par[1]) { marcarErroCampo(par[0], par[2]); valido = false; }
      else { limparErroCampo(par[0]); }
    });
    if (!valido) {
      var primeiroInvalido = document.querySelector("#form-abertura .campo--invalido .entrada, #form-abertura .campo--invalido .selecao, #form-abertura .campo--invalido .area-texto");
      if (primeiroInvalido) { primeiroInvalido.focus(); }
      return;
    }

    var vinculada = rascunhoAbertura.decisaoVinculo === "vincular" ? buscarOcorrenciaPorEndereco(endereco) : null;
    var posicao = vinculada ? { x: vinculada.mapaX, y: vinculada.mapaY } : coordenadaAleatoriaMapa();
    var gps = vinculada ? vinculada.gps : gpsAleatorio();

    var nova = {
      protocolo: gerarProtocolo(),
      tipo: tipo,
      endereco: endereco,
      mapaX: posicao.x, mapaY: posicao.y,
      gps: gps,
      severidade: null,
      vulnerabilidade: false,
      solicitante: solicitante,
      canal: canal,
      descricao: descricao,
      status: "registrada",
      equipeId: null,
      operadorResponsavel: window.DC360_DADOS_INICIAIS.usuariosPorPerfil.operador.nome,
      criadoEm: new Date().toISOString(),
      prazoEm: null
    };
    if (vinculada) { nova.vinculadaA = vinculada.protocolo; }
    estado.ocorrencias.push(nova);
    estado.ocorrenciaEmTriagem = nova.protocolo;

    atualizarTudoAposMudanca();
    mostrarConfirmacaoAbertura(nova);
  }

  function mostrarConfirmacaoAbertura(ocorrencia) {
    document.getElementById("form-abertura").hidden = true;
    var confirmacao = document.getElementById("abertura-confirmacao");
    confirmacao.hidden = false;
    confirmacao.innerHTML =
      '<span class="confirmacao__icone">' + iconeSvg("icone-check-circulo") + "</span>" +
      '<h2 class="tx-h3">Ocorrência ' + ocorrencia.protocolo + " registrada</h2>" +
      '<p class="tx-body-sm tx-muted">' + ocorrencia.tipo + ", " + ocorrencia.endereco + "</p>" +
      '<p class="tx-body-sm">Aguardando triagem. Depois de classificada, aparece na fila da coordenadora <strong>' +
      window.DC360_DADOS_INICIAIS.usuariosPorPerfil.coordenador.nome + "</strong> para despacho.</p>" +
      '<div class="formulario__acoes">' +
      '<button type="button" class="btn btn--primario" id="abertura-ir-triagem">Ir para a triagem</button>' +
      '<button type="button" class="btn btn--secundario" id="abertura-nova">Registrar outra ocorrência</button>' +
      "</div>";
    document.getElementById("abertura-ir-triagem").addEventListener("click", function () {
      mostrarTela("operador", "triagem", { moverFoco: true });
    });
    document.getElementById("abertura-nova").addEventListener("click", function () {
      rascunhoAbertura.decisaoVinculo = null;
      rascunhoAbertura.protocoloVinculado = null;
      renderizarAbertura();
    });
  }

  /* ---------- Triagem (perfil operador) ---------- */

  function pendentesTriagem() {
    return estado.ocorrencias.filter(function (o) { return o.status === "registrada"; });
  }

  function renderizarTriagem() {
    var dados = window.DC360_DADOS_INICIAIS;
    var opcoesSeveridade = dados.severidades.map(function (s) { return '<option value="' + s + '">' + ROTULO_SEVERIDADE[s] + "</option>"; }).join("");

    document.getElementById("triagem-conteudo").innerHTML =
      '<div class="estado-vazio card" id="triagem-vazio" hidden>' +
      iconeSvg("icone-check-circulo") +
      '<p class="estado-vazio__titulo">Nenhuma ocorrência aguardando triagem</p>' +
      '<p class="estado-vazio__texto tx-body-sm">Assim que uma nova ocorrência for registrada em "Abrir ocorrência", ela aparece aqui para classificação.</p>' +
      "</div>" +
      '<div class="card" id="triagem-area">' +
      '<div class="campo"><label class="campo__rotulo" for="triagem-selecao">Ocorrência aguardando triagem</label>' +
      '<select class="selecao" id="triagem-selecao"></select></div>' +
      '<p id="triagem-resumo" class="tx-body-sm tx-muted mb-4"></p>' +
      '<form id="form-triagem" novalidate>' +
      campoSelecao("triagem-severidade", "Gravidade", opcoesSeveridade) +
      '<div class="campo-opcao"><input type="checkbox" id="triagem-vulnerabilidade"><label for="triagem-vulnerabilidade">Há vulnerabilidade presente (idosos, crianças, mobilidade reduzida etc.)</label></div>' +
      '<div class="campo" id="campo-triagem-vulnerabilidade-descricao" hidden>' +
      '<label class="campo__rotulo" for="triagem-vulnerabilidade-descricao">Descreva a vulnerabilidade</label>' +
      '<input class="entrada" type="text" id="triagem-vulnerabilidade-descricao"></div>' +
      '<div class="formulario__acoes"><button type="submit" class="btn btn--primario">Concluir triagem</button></div>' +
      "</form></div>" +
      '<div class="card confirmacao" id="triagem-confirmacao" hidden></div>';

    document.getElementById("triagem-vulnerabilidade").addEventListener("change", function (evento) {
      document.getElementById("campo-triagem-vulnerabilidade-descricao").hidden = !evento.target.checked;
    });
    document.getElementById("triagem-selecao").addEventListener("change", atualizarResumoTriagem);
    document.getElementById("form-triagem").addEventListener("submit", enviarTriagem);

    atualizarSeletorTriagem();
  }

  function atualizarResumoTriagem() {
    var selecao = document.getElementById("triagem-selecao");
    if (!selecao) { return; }
    var ocorrencia = buscarOcorrencia(selecao.value);
    var resumo = document.getElementById("triagem-resumo");
    resumo.textContent = ocorrencia ? ocorrencia.tipo + ", " + ocorrencia.endereco + ". Solicitante: " + ocorrencia.solicitante + "." : "";
  }

  function atualizarSeletorTriagem() {
    var selecao = document.getElementById("triagem-selecao");
    if (!selecao) { return; }
    var pendentes = pendentesTriagem();
    var area = document.getElementById("triagem-area");
    var vazio = document.getElementById("triagem-vazio");

    if (pendentes.length === 0) {
      area.hidden = true;
      vazio.hidden = false;
      return;
    }
    area.hidden = false;
    vazio.hidden = true;
    document.getElementById("triagem-confirmacao").hidden = true;
    document.getElementById("form-triagem").hidden = false;

    var manterSelecionado = pendentes.some(function (o) { return o.protocolo === estado.ocorrenciaEmTriagem; })
      ? estado.ocorrenciaEmTriagem
      : pendentes[0].protocolo;

    selecao.innerHTML = pendentes.map(function (o) {
      return '<option value="' + o.protocolo + '"' + (o.protocolo === manterSelecionado ? " selected" : "") + ">" + o.protocolo + ", " + o.tipo + "</option>";
    }).join("");
    atualizarResumoTriagem();
  }

  function enviarTriagem(evento) {
    evento.preventDefault();
    var protocolo = document.getElementById("triagem-selecao").value;
    var ocorrencia = buscarOcorrencia(protocolo);
    if (!ocorrencia) { return; }
    var severidade = document.getElementById("triagem-severidade").value;
    if (!severidade) {
      marcarErroCampo("triagem-severidade", "Escolha a gravidade.");
      document.getElementById("triagem-severidade").focus();
      return;
    }
    limparErroCampo("triagem-severidade");

    var vulneravel = document.getElementById("triagem-vulnerabilidade").checked;
    ocorrencia.severidade = severidade;
    ocorrencia.vulnerabilidade = vulneravel;
    if (vulneravel) { ocorrencia.vulnerabilidadeDescricao = document.getElementById("triagem-vulnerabilidade-descricao").value.trim(); }
    ocorrencia.status = "triagem";
    estado.ocorrenciaEmTriagem = null;

    atualizarTudoAposMudanca();
    mostrarConfirmacaoTriagem(ocorrencia);
  }

  function mostrarConfirmacaoTriagem(ocorrencia) {
    document.getElementById("triagem-area").hidden = true;
    var confirmacao = document.getElementById("triagem-confirmacao");
    confirmacao.hidden = false;
    confirmacao.innerHTML =
      '<span class="confirmacao__icone">' + iconeSvg("icone-check-circulo") + "</span>" +
      '<h2 class="tx-h3">Triagem concluída para ' + ocorrencia.protocolo + "</h2>" +
      '<p class="tx-body-sm tx-muted">Gravidade ' + ROTULO_SEVERIDADE[ocorrencia.severidade] + ". Pronta para a coordenadora <strong>" +
      window.DC360_DADOS_INICIAIS.usuariosPorPerfil.coordenador.nome + "</strong> despachar uma equipe.</p>" +
      '<div class="formulario__acoes"><button type="button" class="btn btn--secundario" id="triagem-continuar">Triar outra ocorrência</button></div>';
    document.getElementById("triagem-continuar").addEventListener("click", function () {
      renderizarTriagem();
    });
  }

  /* ---------- Tarefas e vistoria (perfil agente de campo) ---------- */

  var CHECKLIST_VISTORIA = [
    { id: "area_isolada", texto: "Área isolada e sinalizada", obrigatorio: true },
    { id: "risco_imediato", texto: "Risco imediato à vida descartado ou controlado", obrigatorio: true },
    { id: "estrutura_fotografada", texto: "Estrutura ou local fotografado", obrigatorio: true },
    { id: "moradores_orientados", texto: "Moradores ou responsáveis orientados", obrigatorio: true },
    { id: "acesso_verificado", texto: "Acesso de veículos de emergência verificado", obrigatorio: false }
  ];

  var rascunhoVistoria = { checklist: {}, fotos: [], gps: null, assinaturaFeita: false };

  function equipeDoAgenteAtual() {
    var dados = window.DC360_DADOS_INICIAIS;
    var perfilLogado = dados.usuariosPorPerfil["agente-campo"];
    var completo = dados.usuarios.filter(function (u) { return u.matricula === perfilLogado.matricula; })[0];
    return completo ? completo.equipeId : null;
  }

  function tarefasDoAgente() {
    var equipeId = equipeDoAgenteAtual();
    return estado.ocorrencias.filter(function (o) { return o.equipeId === equipeId && o.status === "em_campo"; });
  }

  function campoLeituraSimples(rotulo, valor) {
    return '<div class="campo-leitura"><span class="campo-leitura__rotulo">' + rotulo + '</span><span class="campo-leitura__valor">' + valor + "</span></div>";
  }

  function renderizarPerfilCampo() {
    var container = document.getElementById("campo-conteudo");
    if (!container) { return; }
    document.getElementById("campo-acao-primaria").hidden = true;
    var dados = window.DC360_DADOS_INICIAIS;
    var perfilLogado = dados.usuariosPorPerfil["agente-campo"];
    var usuarioCompleto = dados.usuarios.filter(function (u) { return u.matricula === perfilLogado.matricula; })[0];
    var equipe = buscarEquipe(usuarioCompleto ? usuarioCompleto.equipeId : null);
    var iniciais = perfilLogado.nome.split(" ").map(function (p) { return p[0]; }).slice(0, 2).join("");
    var colegas = equipe ? equipe.membros.filter(function (nome) { return nome !== perfilLogado.nome; }) : [];

    container.innerHTML =
      '<div class="linha-cabecalho-entidade mb-4">' +
      '<span class="avatar">' + iniciais + "</span>" +
      "<div><h2 class=\"tx-h3\">" + perfilLogado.nome + "</h2><p class=\"tx-body-sm tx-muted\">" + perfilLogado.cargo + "</p></div>" +
      "</div>" +
      campoLeituraSimples("Matrícula", perfilLogado.matricula) +
      campoLeituraSimples("Equipe", equipe ? equipe.nome + ", " + equipe.especialidade : "Sem equipe") +
      campoLeituraSimples("Colegas de equipe", colegas.length ? colegas.join(", ") : "Nenhum") +
      campoLeituraSimples("E-mail", usuarioCompleto ? usuarioCompleto.email : "Não cadastrado") +
      campoLeituraSimples("Telefone", usuarioCompleto ? usuarioCompleto.telefone : "Não cadastrado") +
      '<p class="tx-body-sm tx-muted mt-2">Nesta demonstração não há autenticação real. A troca de perfil no topo da tela substitui o login.</p>';
  }

  function renderizarListaTarefas() {
    var container = document.getElementById("campo-conteudo");
    if (!container) { return; }
    if (estado.campoAba === "perfil") { renderizarPerfilCampo(); return; }
    if (estado.campoSubtela === "vistoria" && estado.tarefaSelecionada) {
      renderizarVistoria();
      return;
    }
    document.getElementById("campo-acao-primaria").hidden = true;
    var tarefas = tarefasDoAgente();
    if (tarefas.length === 0) {
      container.innerHTML = '<div class="estado-vazio">' + iconeSvg("icone-check-circulo") +
        '<p class="estado-vazio__titulo">Nenhuma tarefa pendente</p>' +
        '<p class="estado-vazio__texto tx-body-lg">Quando o coordenador despachar uma ocorrência para a sua equipe, ela aparece aqui.</p>' +
        "</div>";
      return;
    }
    container.innerHTML = '<h2 class="tx-h3">Minhas tarefas</h2>' +
      tarefas.map(function (o) {
        var atrasada = ocorrenciaAtrasada(o);
        return '<button type="button" class="cartao-tarefa" data-protocolo="' + o.protocolo + '">' +
          '<span class="cartao-tarefa__protocolo">' + o.protocolo + "</span>" +
          '<span class="cartao-tarefa__tipo">' + o.tipo + ", " + o.endereco + "</span>" +
          '<span class="selo ' + (atrasada ? "selo--perigo" : "selo--info") + '">' +
          iconeSvg(atrasada ? "icone-alerta" : "icone-relogio") + formatarPrazoRelativo(o) + "</span>" +
          "</button>";
      }).join("");
    Array.prototype.forEach.call(container.querySelectorAll("[data-protocolo]"), function (botao) {
      botao.addEventListener("click", function () {
        estado.tarefaSelecionada = botao.dataset.protocolo;
        estado.campoSubtela = "vistoria";
        rascunhoVistoria = { checklist: {}, fotos: [], gps: null, assinaturaFeita: false };
        renderizarVistoria();
      });
    });
  }

  function checklistVistoriaCompleto() {
    return CHECKLIST_VISTORIA.filter(function (item) { return item.obrigatorio; })
      .every(function (item) { return rascunhoVistoria.checklist[item.id]; });
  }

  function atualizarProgressoChecklist() {
    var progresso = document.getElementById("vistoria-checklist-progresso");
    if (!progresso) { return; }
    var obrigatorios = CHECKLIST_VISTORIA.filter(function (item) { return item.obrigatorio; });
    var feitos = obrigatorios.filter(function (item) { return rascunhoVistoria.checklist[item.id]; }).length;
    progresso.textContent = feitos + " de " + obrigatorios.length + " itens obrigatórios";
  }

  function atualizarBotaoConcluirVistoria() {
    var botao = document.getElementById("vistoria-concluir");
    if (!botao) { return; }
    var nome = document.getElementById("vistoria-nome-assinante");
    var pronto = checklistVistoriaCompleto() &&
      rascunhoVistoria.fotos.length >= 1 &&
      !!rascunhoVistoria.gps &&
      rascunhoVistoria.assinaturaFeita &&
      !!nome && nome.value.trim().length > 0;
    botao.disabled = !pronto;
  }

  function renderizarGaleriaFotos() {
    var galeria = document.getElementById("vistoria-fotos");
    if (!galeria) { return; }
    galeria.innerHTML = rascunhoVistoria.fotos.map(function (foto, indice) {
      return '<div class="foto-simulada">' + iconeSvg("icone-camera") +
        '<span class="foto-simulada__legenda">Foto ' + (indice + 1) + "</span>" +
        '<span class="foto-simulada__hora">' + formatarDataHora(foto.hora) + "</span>" +
        '<span class="foto-simulada__hora">' + foto.lat.toFixed(4) + ", " + foto.lng.toFixed(4) + "</span>" +
        "</div>";
    }).join("");
    var botaoCapturar = document.getElementById("vistoria-capturar-foto");
    if (botaoCapturar) { botaoCapturar.disabled = rascunhoVistoria.fotos.length >= 5; }
  }

  function desenharLinhaBaseAssinatura(canvas) {
    var ctx = canvas.getContext("2d");
    var corLinhaBase = getComputedStyle(document.documentElement).getPropertyValue("--ds-border").trim();
    ctx.save();
    ctx.beginPath();
    ctx.strokeStyle = corLinhaBase;
    ctx.lineWidth = 1;
    ctx.moveTo(16, canvas.height - 22);
    ctx.lineTo(canvas.width - 16, canvas.height - 22);
    ctx.stroke();
    ctx.restore();
  }

  function configurarAssinatura(canvas) {
    var ctx = canvas.getContext("2d");
    var corTexto = getComputedStyle(document.documentElement).getPropertyValue("--ds-text").trim();
    ctx.strokeStyle = corTexto;
    ctx.lineWidth = 2;
    ctx.lineCap = "round";
    desenharLinhaBaseAssinatura(canvas);
    var desenhando = false;

    function posicao(evento) {
      var rect = canvas.getBoundingClientRect();
      var ponto = evento.touches ? evento.touches[0] : evento;
      return {
        x: (ponto.clientX - rect.left) * (canvas.width / rect.width),
        y: (ponto.clientY - rect.top) * (canvas.height / rect.height)
      };
    }
    function iniciar(evento) {
      desenhando = true;
      var dica = document.getElementById("assinatura-dica");
      if (dica) { dica.hidden = true; }
      var p = posicao(evento);
      ctx.beginPath();
      ctx.moveTo(p.x, p.y);
    }
    function mover(evento) {
      if (!desenhando) { return; }
      evento.preventDefault();
      var p = posicao(evento);
      ctx.lineTo(p.x, p.y);
      ctx.stroke();
      rascunhoVistoria.assinaturaFeita = true;
      atualizarBotaoConcluirVistoria();
    }
    function parar() { desenhando = false; }

    canvas.addEventListener("mousedown", iniciar);
    canvas.addEventListener("mousemove", mover);
    window.addEventListener("mouseup", parar);
    canvas.addEventListener("touchstart", iniciar, { passive: true });
    canvas.addEventListener("touchmove", mover, { passive: false });
    canvas.addEventListener("touchend", parar);
  }

  function renderizarVistoria() {
    var ocorrencia = buscarOcorrencia(estado.tarefaSelecionada);
    var container = document.getElementById("campo-conteudo");
    var rodapeAcao = document.getElementById("campo-acao-primaria");
    if (!ocorrencia) {
      estado.campoSubtela = "lista";
      renderizarListaTarefas();
      return;
    }

    var equipe = buscarEquipe(ocorrencia.equipeId);

    container.innerHTML =
      '<button type="button" class="btn btn--fantasma btn--pequeno" id="vistoria-voltar">' + iconeSvg("icone-seta-esquerda") + "Voltar às tarefas</button>" +
      '<h2 class="tx-h3">' + ocorrencia.protocolo + "</h2>" +
      '<p class="tx-body-sm tx-muted">' + ocorrencia.tipo + ", " + ocorrencia.endereco + "</p>" +
      '<div class="grade-leitura">' +
      campoLeituraSimples("Equipe", equipe ? equipe.nome : "Não atribuída") +
      campoLeituraSimples("Prazo", formatarPrazoRelativo(ocorrencia)) +
      "</div>" +
      '<div><div class="checklist__cabecalho mb-2"><p class="tx-caption tx-muted">Checklist de vistoria</p><p class="tx-caption tx-muted" id="vistoria-checklist-progresso"></p></div>' +
      '<div class="checklist">' + CHECKLIST_VISTORIA.map(function (item) {
        return '<div class="checklist__item"><input type="checkbox" id="check-' + item.id + '" data-check="' + item.id + '">' +
          '<label for="check-' + item.id + '">' + item.texto + "</label>" +
          (item.obrigatorio ? "" : '<span class="checklist__opcional">Opcional</span>') +
          "</div>";
      }).join("") + "</div></div>" +
      '<div><p class="tx-caption tx-muted mb-2">Fotos da vistoria</p>' +
      '<div class="galeria-fotos" id="vistoria-fotos"></div>' +
      '<button type="button" class="btn btn--secundario mt-2" id="vistoria-capturar-foto">' + iconeSvg("icone-camera") + "Capturar foto</button></div>" +
      '<div><p class="tx-caption tx-muted mb-2">GPS</p>' +
      '<div class="leitura-gps" id="vistoria-gps-leitura">' + iconeSvg("icone-gps") +
      '<div><div class="leitura-gps__valor">Localização não capturada</div><div class="leitura-gps__legenda">Toque para capturar</div></div></div>' +
      '<button type="button" class="btn btn--secundario mt-2" id="vistoria-capturar-gps">' + iconeSvg("icone-gps") + "Capturar localização</button></div>" +
      '<div><p class="tx-caption tx-muted mb-2">Assinatura</p>' +
      '<div class="assinatura-quadro-wrap">' +
      '<canvas class="assinatura-quadro" id="vistoria-assinatura" width="280" height="110"></canvas>' +
      '<div class="assinatura-dica" id="assinatura-dica">' + iconeSvg("icone-assinatura") + "<span>Assine aqui com o dedo ou o mouse</span></div>" +
      "</div>" +
      '<button type="button" class="btn btn--fantasma btn--pequeno mt-2" id="vistoria-limpar-assinatura">Limpar assinatura</button>' +
      '<div class="campo mt-2"><label class="campo__rotulo" for="vistoria-nome-assinante">Nome de quem assina</label>' +
      '<input class="entrada" type="text" id="vistoria-nome-assinante" value="' + (ocorrencia.solicitante || "") + '"></div>' +
      "</div>";

    rodapeAcao.hidden = false;
    rodapeAcao.innerHTML = '<button type="button" class="btn btn--primario" id="vistoria-concluir" disabled>Concluir vistoria</button>';

    document.getElementById("vistoria-voltar").addEventListener("click", function () {
      estado.campoSubtela = "lista";
      renderizarListaTarefas();
    });

    Array.prototype.forEach.call(container.querySelectorAll("[data-check]"), function (caixa) {
      caixa.addEventListener("change", function () {
        rascunhoVistoria.checklist[caixa.dataset.check] = caixa.checked;
        atualizarProgressoChecklist();
        atualizarBotaoConcluirVistoria();
      });
    });

    document.getElementById("vistoria-capturar-foto").addEventListener("click", function () {
      if (rascunhoVistoria.fotos.length >= 5) { return; }
      rascunhoVistoria.fotos.push({
        hora: new Date().toISOString(),
        lat: ocorrencia.gps.lat + (Math.random() - 0.5) * 0.0006,
        lng: ocorrencia.gps.lng + (Math.random() - 0.5) * 0.0006
      });
      renderizarGaleriaFotos();
      atualizarBotaoConcluirVistoria();
    });

    document.getElementById("vistoria-capturar-gps").addEventListener("click", function (evento) {
      capturarGpsEmEtapas(ocorrencia, evento.currentTarget);
    });

    configurarAssinatura(document.getElementById("vistoria-assinatura"));
    document.getElementById("vistoria-limpar-assinatura").addEventListener("click", function () {
      var canvas = document.getElementById("vistoria-assinatura");
      canvas.getContext("2d").clearRect(0, 0, canvas.width, canvas.height);
      desenharLinhaBaseAssinatura(canvas);
      rascunhoVistoria.assinaturaFeita = false;
      document.getElementById("assinatura-dica").hidden = false;
      atualizarBotaoConcluirVistoria();
    });

    document.getElementById("vistoria-nome-assinante").addEventListener("input", atualizarBotaoConcluirVistoria);
    document.getElementById("vistoria-concluir").addEventListener("click", function () { concluirVistoria(ocorrencia); });

    renderizarGaleriaFotos();
    atualizarProgressoChecklist();
    atualizarBotaoConcluirVistoria();
  }

  function capturarGpsEmEtapas(ocorrencia, botao) {
    var reduzido = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    var leitura = document.getElementById("vistoria-gps-leitura");
    var etapas = [48, 19, Math.round(4 + Math.random() * 8)];
    botao.disabled = true;

    function mostrarEtapa(indice) {
      var precisao = etapas[indice];
      var estabilizado = indice === etapas.length - 1;
      leitura.innerHTML = iconeSvg("icone-gps") +
        "<div><div class=\"leitura-gps__valor\">" + (estabilizado ? "Precisão de " + precisao + " metros" : "Melhorando precisão, " + precisao + " metros") + "</div>" +
        '<div class="leitura-gps__legenda">' + ocorrencia.gps.lat.toFixed(4) + ", " + ocorrencia.gps.lng.toFixed(4) + "</div></div>";
      if (estabilizado) {
        rascunhoVistoria.gps = { precisaoMetros: precisao };
        botao.disabled = false;
        atualizarBotaoConcluirVistoria();
        return;
      }
      window.setTimeout(function () { mostrarEtapa(indice + 1); }, reduzido ? 0 : tokenDuracaoMs("--ds-dur-slow") * 1.5);
    }
    mostrarEtapa(0);
  }

  function concluirVistoria(ocorrencia) {
    var nomeAssinante = document.getElementById("vistoria-nome-assinante").value.trim();
    ocorrencia.status = "vistoria_concluida";
    ocorrencia.vistoriaConcluidaEm = new Date().toISOString();
    ocorrencia.vistoria = {
      checklist: Object.assign({}, rascunhoVistoria.checklist),
      totalFotos: rascunhoVistoria.fotos.length,
      gpsPrecisaoMetros: rascunhoVistoria.gps ? rascunhoVistoria.gps.precisaoMetros : null,
      assinante: nomeAssinante
    };
    var protocolo = ocorrencia.protocolo;
    estado.tarefaSelecionada = null;
    estado.campoSubtela = "lista";
    atualizarTudoAposMudanca();

    document.getElementById("campo-acao-primaria").hidden = true;
    var container = document.getElementById("campo-conteudo");
    container.innerHTML = '<div class="estado-vazio">' + iconeSvg("icone-check-circulo") +
      '<p class="estado-vazio__titulo">Vistoria concluída</p>' +
      '<p class="estado-vazio__texto tx-body-lg">Protocolo ' + protocolo + " enviado para a coordenação.</p>" +
      '<button type="button" class="btn btn--primario" id="vistoria-voltar-lista">Voltar às tarefas</button></div>';
    document.getElementById("vistoria-voltar-lista").addEventListener("click", renderizarListaTarefas);
  }

  /* ---------- Configurações, perfil e usuários (camada administrativa leve) ---------- */

  function renderizarConfiguracoes() {
    var dados = window.DC360_DADOS_INICIAIS;
    var tiposHtml = dados.tiposCobrade.map(function (t) {
      return '<span class="chip chip--estatico">' + t + "</span>";
    }).join("");

    var prazosHtml = dados.severidades.map(function (sev) {
      return '<div class="campo-leitura"><span class="campo-leitura__rotulo">' + ROTULO_SEVERIDADE[sev] + '</span><span class="campo-leitura__valor">' +
        formatarHorasEmTexto(dados.prazosPadraoHoras[sev]) + "</span></div>";
    }).join("");

    var equipesHtml = dados.equipes.map(function (eq) {
      var seloStatus = eq.status === "em_campo" ? '<span class="selo selo--info">' + iconeSvg("icone-mapa") + "Em campo</span>" : '<span class="selo selo--sucesso">' + iconeSvg("icone-check-circulo") + "Disponível</span>";
      return '<div class="card">' +
        '<div class="tela__cabecalho mb-2"><h3 class="tx-h3">' + eq.nome + "</h3>" + seloStatus + "</div>" +
        '<p class="tx-body-sm tx-muted">' + eq.especialidade + "</p>" +
        '<p class="tx-body-sm">' + eq.membros.join(", ") + "</p>" +
        "</div>";
    }).join("");

    document.getElementById("configuracoes-conteudo").innerHTML =
      '<div class="card"><h2 class="tx-h3 mb-3">Tipos de ocorrência (COBRADE)</h2>' +
      '<div class="painel-grupo-chips">' + tiposHtml + "</div></div>" +
      '<div class="card"><h2 class="tx-h3 mb-3">Prazos padrão por severidade</h2>' +
      '<div class="grade-leitura">' + prazosHtml + "</div></div>" +
      '<div><h2 class="tx-h3 mb-3">Equipes cadastradas</h2>' +
      '<div class="grade-cartoes">' + equipesHtml + "</div></div>";
  }

  function renderizarPerfil() {
    var dados = window.DC360_DADOS_INICIAIS;
    var perfilLogado = dados.usuariosPorPerfil[estado.perfil];
    var usuarioCompleto = dados.usuarios.filter(function (u) { return u.matricula === perfilLogado.matricula; })[0];
    var iniciais = perfilLogado.nome.split(" ").map(function (p) { return p[0]; }).slice(0, 2).join("");

    var camposHtml = [
      ["Matrícula", perfilLogado.matricula],
      ["Cargo", perfilLogado.cargo],
      ["E-mail", usuarioCompleto ? usuarioCompleto.email : "Não cadastrado"],
      ["Telefone", usuarioCompleto ? usuarioCompleto.telefone : "Não cadastrado"]
    ].map(function (par) {
      return '<div class="campo-leitura"><span class="campo-leitura__rotulo">' + par[0] + '</span><span class="campo-leitura__valor">' + par[1] + "</span></div>";
    }).join("");

    elementos.avatarIniciais.textContent = iniciais;
    elementos.avatarRotulo.textContent = "Ver perfil de " + perfilLogado.nome;

    var htmlPerfil =
      '<div class="card">' +
      '<div class="linha-cabecalho-entidade mb-4">' +
      '<span class="avatar">' + iniciais + "</span>" +
      "<div><h2 class=\"tx-h2\">" + perfilLogado.nome + "</h2><p class=\"tx-muted\">" + perfilLogado.cargo + "</p></div>" +
      "</div>" +
      '<div class="grade-leitura">' + camposHtml + "</div>" +
      "</div>" +
      '<div class="card"><p class="tx-body-sm tx-muted">Nesta demonstração não há autenticação real. A troca de perfil no topo da tela substitui o login para fins de apresentação.</p></div>';

    document.querySelectorAll(".conteudo-perfil").forEach(function (elemento) {
      elemento.innerHTML = htmlPerfil;
    });
  }

  function renderizarUsuarios() {
    var dados = window.DC360_DADOS_INICIAIS;
    var linhas = dados.usuarios.map(function (u) {
      var equipe = buscarEquipe(u.equipeId);
      var seloStatus = u.status === "ativo" ? '<span class="selo selo--sucesso">' + iconeSvg("icone-check-circulo") + "Ativo</span>" : '<span class="selo selo--neutro">' + iconeSvg("icone-relogio") + "Afastado</span>";
      return "<tr>" +
        "<td>" + u.nome + "</td>" +
        "<td>" + u.matricula + "</td>" +
        "<td>" + u.cargo + "</td>" +
        "<td>" + (equipe ? equipe.nome : '<span class="tx-muted">Sem equipe</span>') + "</td>" +
        "<td>" + u.email + "</td>" +
        "<td>" + seloStatus + "</td>" +
        "</tr>";
    }).join("");

    document.getElementById("usuarios-conteudo").innerHTML =
      '<div class="tabela-wrap"><table class="tabela"><thead><tr>' +
      "<th>Nome</th><th>Matrícula</th><th>Cargo</th><th>Equipe</th><th>E-mail</th><th>Status</th>" +
      "</tr></thead><tbody>" + linhas + "</tbody></table></div>";
  }

  function inicializar() {
    elementos.navTelas = document.getElementById("nav-telas");
    elementos.seletorPerfil = document.getElementById("seletor-perfil");
    elementos.botaoTema = document.getElementById("botao-tema");
    elementos.botaoMenuDev = document.getElementById("botao-menu-dev");
    elementos.painelMenuDev = document.getElementById("menu-dev-painel");
    elementos.itemModoMobile = document.getElementById("item-modo-mobile");
    elementos.itemReiniciarDemo = document.getElementById("item-reiniciar-demo");
    elementos.anunciador = document.getElementById("anunciador");
    elementos.marca = document.querySelector('[data-acao="ir-painel"]');

    elementos.detalheVoltar = document.getElementById("detalhe-voltar");
    elementos.painelTabelaCorpo = document.getElementById("painel-tabela-corpo");
    elementos.botaoAvatar = document.getElementById("botao-avatar");
    elementos.avatarIniciais = document.getElementById("avatar-iniciais");
    elementos.avatarRotulo = document.getElementById("avatar-rotulo");

    estado.ocorrencias = prepararOcorrencias();

    aplicarTema(temaInicial(), { semPersistir: true });
    trocarPerfil(estado.perfil);

    renderizarPainelCompleto();
    renderizarFiltrosMapa();
    renderizarMapa();
    renderizarConfiguracoes();
    renderizarUsuarios();
    renderizarAbertura();
    renderizarTriagem();
    renderizarListaTarefas();

    elementos.seletorPerfil.addEventListener("change", function (evento) {
      trocarPerfil(evento.target.value);
    });

    elementos.botaoTema.addEventListener("click", function () {
      aplicarTema(estado.tema === "escuro" ? "claro" : "escuro");
    });

    function fecharMenuDev() {
      elementos.painelMenuDev.hidden = true;
      elementos.botaoMenuDev.setAttribute("aria-expanded", "false");
    }
    function abrirMenuDev() {
      elementos.painelMenuDev.hidden = false;
      elementos.botaoMenuDev.setAttribute("aria-expanded", "true");
    }
    elementos.botaoMenuDev.addEventListener("click", function (evento) {
      evento.stopPropagation();
      if (elementos.painelMenuDev.hidden) { abrirMenuDev(); } else { fecharMenuDev(); }
    });
    document.addEventListener("click", function (evento) {
      if (!elementos.painelMenuDev.hidden && !elementos.painelMenuDev.contains(evento.target) && evento.target !== elementos.botaoMenuDev) {
        fecharMenuDev();
      }
    });
    document.addEventListener("keydown", function (evento) {
      if (evento.key === "Escape" && !elementos.painelMenuDev.hidden) {
        fecharMenuDev();
        elementos.botaoMenuDev.focus();
      }
    });

    elementos.itemModoMobile.addEventListener("click", function () {
      var ativo = document.body.classList.toggle("modo-mobile-forcado");
      elementos.itemModoMobile.setAttribute("aria-checked", ativo ? "true" : "false");
      anunciar(ativo ? "Pré-visualização em modo mobile ativada." : "Pré-visualização em modo mobile desativada.");
      fecharMenuDev();
    });

    elementos.itemReiniciarDemo.addEventListener("click", function () {
      reiniciarDemo();
      fecharMenuDev();
    });

    document.getElementById("aba-campo-tarefas").addEventListener("click", function () {
      estado.campoAba = "tarefas";
      this.setAttribute("aria-selected", "true");
      document.getElementById("aba-campo-perfil").setAttribute("aria-selected", "false");
      renderizarListaTarefas();
    });
    document.getElementById("aba-campo-perfil").addEventListener("click", function () {
      estado.campoAba = "perfil";
      this.setAttribute("aria-selected", "true");
      document.getElementById("aba-campo-tarefas").setAttribute("aria-selected", "false");
      renderizarListaTarefas();
    });

    elementos.botaoAvatar.addEventListener("click", function () {
      mostrarTela(estado.perfil, "perfil", { moverFoco: true });
    });

    elementos.marca.addEventListener("click", function (evento) {
      evento.preventDefault();
      elementos.seletorPerfil.value = "coordenador";
      trocarPerfil("coordenador");
      mostrarTela("coordenador", "painel", { moverFoco: true });
    });

    elementos.detalheVoltar.addEventListener("click", function () {
      mostrarTela("coordenador", "painel", { moverFoco: true });
    });

    elementos.painelTabelaCorpo.addEventListener("click", function (evento) {
      var linha = evento.target.closest("tr[data-protocolo]");
      if (linha) { abrirDetalhe(linha.dataset.protocolo); }
    });

    elementos.painelTabelaCorpo.addEventListener("keydown", function (evento) {
      if (evento.key !== "Enter" && evento.key !== " ") { return; }
      var linha = evento.target.closest("tr[data-protocolo]");
      if (linha) { evento.preventDefault(); abrirDetalhe(linha.dataset.protocolo); }
    });

    document.getElementById("mapa-quadro").addEventListener("click", function (evento) {
      var pino = evento.target.closest("[data-protocolo]");
      if (pino) { abrirDetalhe(pino.dataset.protocolo); }
    });
    document.getElementById("mapa-quadro").addEventListener("keydown", function (evento) {
      if (evento.key !== "Enter" && evento.key !== " ") { return; }
      var pino = evento.target.closest("[data-protocolo]");
      if (pino) { evento.preventDefault(); abrirDetalhe(pino.dataset.protocolo); }
    });

    document.getElementById("mapa-lista-corpo").addEventListener("click", function (evento) {
      var item = evento.target.closest("[data-protocolo]");
      if (item) { abrirDetalhe(item.dataset.protocolo); }
    });
    document.getElementById("mapa-lista-corpo").addEventListener("keydown", function (evento) {
      if (evento.key !== "Enter" && evento.key !== " ") { return; }
      var item = evento.target.closest("[data-protocolo]");
      if (item) { evento.preventDefault(); abrirDetalhe(item.dataset.protocolo); }
    });

    document.getElementById("mapa-limpar-filtros").addEventListener("click", function () {
      estado.mapaFiltroTipo = "todos";
      estado.mapaFiltroStatus = "todas";
      renderizarFiltrosMapa();
      renderizarMapa();
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", inicializar);
  } else {
    inicializar();
  }
})();
