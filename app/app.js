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
      { tela: "perfil", rotulo: "Meu perfil", icone: "icone-usuario" },
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
    ocorrenciaSelecionada: null
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
    renderizarPainelCompleto();
    if (estado.ocorrenciaSelecionada) { renderizarDetalhe(); }
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
      "<td>" + (ocorrencia.severidade ? '<span class="selo selo--sev-' + ocorrencia.severidade + '">' + iconeSvg(ICONE_SEVERIDADE[ocorrencia.severidade]) + ROTULO_SEVERIDADE[ocorrencia.severidade] + "</span>" : '<span class="tx-muted tx-body-sm">Não classificada</span>') + "</td>" +
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
      (atrasada ? ' <span class="selo selo--perigo">' + iconeSvg("icone-alerta") + formatarPrazoRelativo(ocorrencia) + "</span>" : "");

    var rotuloPrazo = ocorrencia.status === "providencia_pendente" ? "Prazo da providência" : "Prazo";
    var prazoEfetivo = prazoEfetivoOcorrencia(ocorrencia);

    var camposBase = [
      ["Solicitante", ocorrencia.solicitante],
      ["Equipe designada", equipe ? equipe.nome : "Não atribuída"],
      [rotuloPrazo, prazoEfetivo ? formatarDataHora(prazoEfetivo, true) : formatarPrazoRelativo(ocorrencia)],
      ["Vulnerabilidade", ocorrencia.vulnerabilidade ? ocorrencia.vulnerabilidadeDescricao : "Não identificada"]
    ];
    if (ocorrencia.providencia) {
      camposBase.push(["Providência encaminhada", ocorrencia.providencia.secretaria + ": " + ocorrencia.providencia.descricao]);
      camposBase.push(["Responsável pela providência", ocorrencia.providencia.responsavel]);
    }
    var camposHtml = camposBase.map(function (par) {
      return '<div class="campo-leitura"><span class="campo-leitura__rotulo">' + par[0] + '</span><span class="campo-leitura__valor">' + par[1] + "</span></div>";
    }).join("");

    var linhaTempoHtml = eventoLinhaTempo("icone-fila", "Ocorrência registrada", ocorrencia.criadoEm) +
      eventoLinhaTempo("icone-mapa", "Despachada" + (equipe ? " para " + equipe.nome : ""), ocorrencia.despachadoEm) +
      eventoLinhaTempo("icone-check-circulo", "Vistoria concluída", ocorrencia.vistoriaConcluidaEm) +
      eventoLinhaTempo("icone-check-circulo", "Ocorrência encerrada", ocorrencia.encerradaEm, ocorrencia.motivoEncerramento);

    container.innerHTML =
      '<div class="card">' +
      '<div class="linha-cabecalho-entidade mb-4">' + selos + "</div>" +
      '<p class="tx-body">' + ocorrencia.descricao + "</p>" +
      "</div>" +
      '<div class="card">' +
      '<h2 class="tx-h3 mb-4">Dados da ocorrência</h2>' +
      '<div class="grade-leitura">' + camposHtml + "</div>" +
      "</div>" +
      '<div class="card">' +
      '<h2 class="tx-h3 mb-4">Linha do tempo</h2>' +
      '<div class="linha-tempo">' + linhaTempoHtml + "</div>" +
      "</div>";
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

    document.getElementById("perfil-conteudo").innerHTML =
      '<div class="card">' +
      '<div class="linha-cabecalho-entidade mb-4">' +
      '<span class="avatar">' + iniciais + "</span>" +
      "<div><h2 class=\"tx-h2\">" + perfilLogado.nome + "</h2><p class=\"tx-muted\">" + perfilLogado.cargo + "</p></div>" +
      "</div>" +
      '<div class="grade-leitura">' + camposHtml + "</div>" +
      "</div>" +
      '<div class="card"><p class="tx-body-sm tx-muted">Nesta demonstração não há autenticação real. A troca de perfil no topo da tela substitui o login para fins de apresentação.</p></div>';
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
    elementos.botaoReiniciar = document.getElementById("botao-reiniciar");
    elementos.anunciador = document.getElementById("anunciador");
    elementos.marca = document.querySelector('[data-acao="ir-painel"]');

    elementos.detalheVoltar = document.getElementById("detalhe-voltar");
    elementos.painelTabelaCorpo = document.getElementById("painel-tabela-corpo");

    estado.ocorrencias = prepararOcorrencias();

    aplicarTema(temaInicial(), { semPersistir: true });
    trocarPerfil(estado.perfil);

    renderizarPainelCompleto();
    renderizarConfiguracoes();
    renderizarPerfil();
    renderizarUsuarios();

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
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", inicializar);
  } else {
    inicializar();
  }
})();
