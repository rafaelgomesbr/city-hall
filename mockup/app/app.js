/* Estado, navegação, tema e comportamento do protótipo. Sem dependência externa. */
(function () {
  "use strict";

  var CHAVE_TEMA = "dc360-tema";
  var CHAVE_ESTADO_SESSAO = "dc360-estado-sessao";
  var CHAVE_LOGIN_SESSAO = "dc360-logado";
  var CHAVE_LATERAL_RECOLHIDA = "dc360-lateral-recolhida";

  var NAV_POR_PERFIL = {
    coordenador: [
      { tela: "painel", rotulo: "Painel", icone: "icone-fila", grupo: "Operação" },
      { tela: "mapa", rotulo: "Mapa", icone: "icone-mapa", grupo: "Operação" },
      { tela: "usuarios", rotulo: "Usuários e equipes", icone: "icone-usuarios", grupo: "Administração" },
      { tela: "configuracoes", rotulo: "Configurações", icone: "icone-engrenagem", grupo: "Administração" },
      { tela: "visao-futura", rotulo: "Visão futura", icone: "icone-sparkles", grupo: "Produto" }
    ],
    operador: [
      { tela: "abertura", rotulo: "Abrir ocorrência", icone: "icone-mais-circulo", grupo: "Operação" },
      { tela: "triagem", rotulo: "Triagem", icone: "icone-prancheta", grupo: "Operação" }
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
    painelBusca: "",
    painelPagina: 1,
    usuariosBusca: "",
    usuariosPagina: 1,
    ocorrenciaSelecionada: null,
    mapaFiltroTipo: "todos",
    mapaFiltroStatus: "todas",
    ocorrenciaEmTriagem: null,
    campoSubtela: "lista",
    campoAba: "tarefas",
    tarefaSelecionada: null,
    conectividade: "online",
    filaSincronizacao: [],
    tokenSincronizacao: 0,
    campoFiltroLista: null
  };

  var elementos = {};

  function clonarProfundo(valor) {
    return JSON.parse(JSON.stringify(valor));
  }

  function agoraEm(offsetHoras) {
    if (offsetHoras === null || offsetHoras === undefined) { return null; }
    return new Date(Date.now() + offsetHoras * 3600000).toISOString();
  }

  function prepararUsuarios() {
    return clonarProfundo(window.DC360_DADOS_INICIAIS.usuarios);
  }

  function prepararEquipes() {
    return clonarProfundo(window.DC360_DADOS_INICIAIS.equipes);
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
    if (elementos.barraLateral) { elementos.barraLateral.hidden = itens.length === 0; }

    var telaAtual = estado.telaAtivaPorPerfil[estado.perfil];
    var telaParaDestaqueNav = telaAtual === "detalhe" ? "painel" : telaAtual;

    var grupoAtual = null;
    var containerGrupo = null;
    itens.forEach(function (item) {
      if (item.grupo !== grupoAtual) {
        grupoAtual = item.grupo;
        containerGrupo = document.createElement("div");
        containerGrupo.className = "nav-telas__grupo";
        var titulo = document.createElement("span");
        titulo.className = "nav-telas__grupo-titulo";
        titulo.textContent = grupoAtual;
        containerGrupo.appendChild(titulo);
        elementos.navTelas.appendChild(containerGrupo);
      }
      var botao = document.createElement("button");
      botao.type = "button";
      botao.className = "nav-telas__item";
      botao.dataset.tela = item.tela;
      botao.title = item.rotulo;
      botao.innerHTML = iconeSvg(item.icone) + "<span>" + item.rotulo + "</span>";
      if (telaParaDestaqueNav === item.tela) {
        botao.setAttribute("aria-current", "page");
      }
      botao.addEventListener("click", function () {
        mostrarTela(estado.perfil, item.tela, { moverFoco: true });
      });
      containerGrupo.appendChild(botao);
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
    document.body.dataset.perfil = perfil;
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
    [elementos.botaoTema, elementos.botaoTemaLogin].forEach(function (botao) {
      if (!botao) { return; }
      botao.innerHTML = iconeSvg(icone) + '<span class="visualmente-oculto">' + rotulo + "</span>";
      botao.setAttribute("aria-pressed", tema === "escuro" ? "true" : "false");
    });

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

  /* ---------- Persistência de sessão (sessionStorage) ----------
     Sobrevive a F5 na mesma aba; fecha a aba ou "Reiniciar demonstração"
     e volta aos dados originais. Nunca trava a demo se o storage falhar
     (modo privado, restrição de file://): segue só em memória. */

  function persistirEstado() {
    try {
      window.sessionStorage.setItem(CHAVE_ESTADO_SESSAO, JSON.stringify({
        ocorrencias: estado.ocorrencias,
        usuarios: estado.usuarios,
        equipes: estado.equipes,
        filaSincronizacao: estado.filaSincronizacao,
        conectividade: estado.conectividade === "sincronizando" ? "offline" : estado.conectividade
      }));
    } catch (erro) { /* sessionStorage indisponível: segue só em memória */ }
  }

  function carregarEstadoPersistido() {
    try {
      var bruto = window.sessionStorage.getItem(CHAVE_ESTADO_SESSAO);
      if (!bruto) { return null; }
      var dados = JSON.parse(bruto);
      if (!dados || !Array.isArray(dados.ocorrencias) || !Array.isArray(dados.usuarios) || !Array.isArray(dados.equipes)) { return null; }
      dados.filaSincronizacao = Array.isArray(dados.filaSincronizacao) ? dados.filaSincronizacao : [];
      dados.conectividade = dados.conectividade === "offline" ? "offline" : "online";
      return dados;
    } catch (erro) { return null; }
  }

  function limparEstadoPersistido() {
    try { window.sessionStorage.removeItem(CHAVE_ESTADO_SESSAO); } catch (erro) { /* segue */ }
  }

  function reiniciarDemo() {
    limparEstadoPersistido();
    estado.ocorrencias = prepararOcorrencias();
    estado.usuarios = prepararUsuarios();
    estado.equipes = prepararEquipes();
    estado.painelFiltroStatus = "todas";
    estado.painelOrdenacao = "prioridade";
    estado.painelBusca = "";
    estado.painelPagina = 1;
    estado.usuariosBusca = "";
    estado.usuariosPagina = 1;
    var painelBuscaCampo = document.getElementById("painel-busca");
    if (painelBuscaCampo) { painelBuscaCampo.value = ""; }
    var usuariosBuscaCampo = document.getElementById("usuarios-busca");
    if (usuariosBuscaCampo) { usuariosBuscaCampo.value = ""; }
    estado.mapaFiltroTipo = "todos";
    estado.mapaFiltroStatus = "todas";
    estado.ocorrenciaEmTriagem = null;
    estado.ocorrenciaSelecionada = null;
    estado.campoSubtela = "lista";
    estado.campoAba = "tarefas";
    estado.tarefaSelecionada = null;
    estado.conectividade = "online";
    estado.filaSincronizacao = [];
    estado.tokenSincronizacao++;
    estado.campoFiltroLista = null;
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
    renderizarUsuarios();
    renderizarConfiguracoes();
    renderizarAbertura();
    renderizarTriagem();
    document.getElementById("campo-acao-primaria").hidden = true;
    var abaTarefas = document.getElementById("aba-campo-tarefas");
    var abaPerfil = document.getElementById("aba-campo-perfil");
    if (abaTarefas) { abaTarefas.setAttribute("aria-selected", "true"); }
    if (abaPerfil) { abaPerfil.setAttribute("aria-selected", "false"); }
    atualizarIndicadorConectividade();
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
    var equipes = estado.equipes;
    for (var i = 0; i < equipes.length; i++) {
      if (equipes[i].id === equipeId) { return equipes[i]; }
    }
    return null;
  }

  function buscarUsuario(matricula) {
    var usuarios = estado.usuarios;
    for (var i = 0; i < usuarios.length; i++) {
      if (usuarios[i].matricula === matricula) { return usuarios[i]; }
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

  /* ---------- Busca e paginação (tabelas com registros) ---------- */

  var ITENS_POR_PAGINA = 8;

  function filtrarPorBusca(lista, termoBusca, camposFn) {
    var termo = normalizarTexto(termoBusca || "");
    if (!termo) { return lista; }
    return lista.filter(function (item) {
      return camposFn(item).some(function (campo) { return normalizarTexto(String(campo || "")).indexOf(termo) !== -1; });
    });
  }

  function paginar(lista, pagina, porPagina) {
    var totalPaginas = Math.max(1, Math.ceil(lista.length / porPagina));
    var paginaAtual = Math.min(Math.max(1, pagina), totalPaginas);
    var inicio = (paginaAtual - 1) * porPagina;
    return { itens: lista.slice(inicio, inicio + porPagina), pagina: paginaAtual, totalPaginas: totalPaginas, total: lista.length };
  }

  function renderizarPaginacao(elementoId, info, aoTrocarPagina) {
    var container = document.getElementById(elementoId);
    if (!container) { return; }
    if (info.total === 0) { container.innerHTML = ""; return; }
    var inicio = (info.pagina - 1) * ITENS_POR_PAGINA + 1;
    var fim = Math.min(info.pagina * ITENS_POR_PAGINA, info.total);
    container.innerHTML =
      '<span class="paginacao__resumo">' + inicio + "–" + fim + " de " + info.total + " registro" + (info.total === 1 ? "" : "s") + "</span>" +
      '<div class="paginacao__controles">' +
      '<button type="button" class="btn-icone--pequeno paginacao__botao" data-pagina="anterior"' + (info.pagina <= 1 ? " disabled" : "") + ' title="Página anterior" aria-label="Página anterior">' + iconeSvg("icone-seta-esquerda") + "</button>" +
      '<span class="paginacao__pagina">Página ' + info.pagina + " de " + info.totalPaginas + "</span>" +
      '<button type="button" class="btn-icone--pequeno paginacao__botao paginacao__botao--proxima" data-pagina="proxima"' + (info.pagina >= info.totalPaginas ? " disabled" : "") + ' title="Próxima página" aria-label="Próxima página">' + iconeSvg("icone-seta-esquerda") + "</button>" +
      "</div>";
    Array.prototype.forEach.call(container.querySelectorAll("[data-pagina]"), function (botao) {
      botao.addEventListener("click", function () {
        aoTrocarPagina(botao.dataset.pagina === "proxima" ? 1 : -1);
      });
    });
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
      /* "Na fila" e trabalho em aberto, nao total historico: encerrada e
         rascunho saem da conta, para o numero cair quando a ocorrencia sai
         de circulacao (criterio de aceite do CP7). */
      { rotulo: "Na fila", valor: lista.filter(ocorrenciaAtiva).length, modificador: "", icone: "icone-fila" },
      { rotulo: "Em campo", valor: lista.filter(function (o) { return o.status === "em_campo"; }).length, modificador: "", icone: "icone-mapa" },
      { rotulo: "Atrasadas", valor: lista.filter(ocorrenciaAtrasada).length, modificador: "indicador--perigo", icone: "icone-relogio" },
      { rotulo: "Críticas ativas", valor: lista.filter(function (o) { return o.severidade === "critica" && ocorrenciaAtiva(o); }).length, modificador: "indicador--critico", icone: "icone-alerta" }
    ];
    var container = document.getElementById("painel-indicadores");
    container.innerHTML = indicadores.map(function (item, indice) {
      return '<div class="card indicador ' + item.modificador + '">' +
        '<span class="indicador__icone">' + iconeSvg(item.icone) + "</span>" +
        '<span class="indicador__valor" id="painel-indicador-' + indice + '">0</span>' +
        '<span class="indicador__rotulo">' + item.rotulo + "</span></div>";
    }).join("");
    indicadores.forEach(function (item, indice) {
      animarContador(document.getElementById("painel-indicador-" + indice), item.valor);
    });
    renderizarNotificacoes();
  }

  function ocorrenciasQuePrecisamAtencao() {
    var lista = estado.ocorrencias.filter(function (o) {
      return ocorrenciaAtiva(o) && (ocorrenciaAtrasada(o) || o.severidade === "critica");
    });
    return ordenarOcorrencias(lista, "prioridade");
  }

  function renderizarNotificacoes() {
    var marca = document.getElementById("notificacoes-marca");
    var painel = document.getElementById("notificacoes-painel");
    if (!marca || !painel) { return; }
    var lista = ocorrenciasQuePrecisamAtencao();

    marca.hidden = lista.length === 0;
    marca.textContent = lista.length > 9 ? "9+" : String(lista.length);

    if (lista.length === 0) {
      painel.innerHTML = '<p class="cabecalho__notificacoes-vazio">Nada precisando de atenção agora.</p>';
      return;
    }
    painel.innerHTML = '<p class="cabecalho__notificacoes-titulo">Precisam de atenção</p>' +
      lista.map(function (o) {
        var motivo = ocorrenciaAtrasada(o) ? formatarPrazoRelativo(o) : "Severidade crítica";
        return '<button type="button" class="cabecalho__notificacao" data-protocolo="' + o.protocolo + '">' +
          '<span class="cabecalho__notificacao-protocolo">' + o.protocolo + "</span>" +
          '<span class="cabecalho__notificacao-detalhe">' + o.tipo + ", " + o.endereco + "</span>" +
          '<span class="cabecalho__notificacao-detalhe">' + motivo + "</span>" +
          "</button>";
      }).join("");
  }

  function resultadosBuscaGlobal(termo) {
    var termoNorm = normalizarTexto(termo);
    if (!termoNorm) { return { ocorrencias: [], colaboradores: [] }; }
    var ocorrencias = estado.ocorrencias.filter(function (o) {
      return normalizarTexto(o.protocolo).indexOf(termoNorm) !== -1 ||
        normalizarTexto(o.tipo).indexOf(termoNorm) !== -1 ||
        normalizarTexto(o.endereco).indexOf(termoNorm) !== -1;
    }).slice(0, 5);
    var colaboradores = estado.usuarios.filter(function (u) {
      return normalizarTexto(u.nome).indexOf(termoNorm) !== -1 ||
        normalizarTexto(u.matricula).indexOf(termoNorm) !== -1;
    }).slice(0, 5);
    return { ocorrencias: ocorrencias, colaboradores: colaboradores };
  }

  function renderizarResultadosBuscaGlobal(termo) {
    var painel = document.getElementById("busca-global-resultados");
    if (!painel) { return; }
    if (!termo.trim()) { painel.hidden = true; painel.innerHTML = ""; return; }

    var resultados = resultadosBuscaGlobal(termo);
    var total = resultados.ocorrencias.length + resultados.colaboradores.length;
    if (total === 0) {
      painel.innerHTML = '<p class="cabecalho__busca-vazio">Nada encontrado para "' + termo + '".</p>';
      painel.hidden = false;
      return;
    }

    var html = "";
    if (resultados.ocorrencias.length) {
      html += '<p class="cabecalho__busca-grupo-titulo">Ocorrências</p>' +
        resultados.ocorrencias.map(function (o) {
          return '<button type="button" class="cabecalho__busca-resultado" data-tipo="ocorrencia" data-protocolo="' + o.protocolo + '">' +
            '<span class="cabecalho__busca-resultado-titulo"><span class="protocolo-mono">' + o.protocolo + "</span> · " + o.tipo + "</span>" +
            '<span class="cabecalho__busca-resultado-detalhe">' + o.endereco + "</span>" +
            "</button>";
        }).join("");
    }
    if (resultados.colaboradores.length) {
      html += '<p class="cabecalho__busca-grupo-titulo">Colaboradores</p>' +
        resultados.colaboradores.map(function (u) {
          return '<button type="button" class="cabecalho__busca-resultado" data-tipo="colaborador" data-matricula="' + u.matricula + '">' +
            '<span class="cabecalho__busca-resultado-titulo">' + u.nome + "</span>" +
            '<span class="cabecalho__busca-resultado-detalhe">' + u.cargo + " · " + u.matricula + "</span>" +
            "</button>";
        }).join("");
    }
    painel.innerHTML = html;
    painel.hidden = false;
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
        estado.painelPagina = 1;
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

  var STATUS_EXCLUIVEL_OCORRENCIA = { rascunho: true, registrada: true };

  function linhaTabelaOcorrencia(ocorrencia) {
    var equipe = buscarEquipe(ocorrencia.equipeId);
    var atrasada = ocorrenciaAtrasada(ocorrencia);
    var statusInfo = window.DC360_DADOS_INICIAIS.statusOcorrencia.filter(function (s) { return s.chave === ocorrencia.status; })[0];
    var prazoHtml = atrasada
      ? '<span class="selo selo--perigo">' + iconeSvg("icone-alerta") + formatarPrazoRelativo(ocorrencia) + "</span>"
      : '<span class="tx-body-sm">' + formatarPrazoRelativo(ocorrencia) + "</span>";
    var acaoExcluir = STATUS_EXCLUIVEL_OCORRENCIA[ocorrencia.status]
      ? '<button type="button" class="btn-icone--pequeno btn-icone--perigo" data-acao="excluir-ocorrencia" data-protocolo="' + ocorrencia.protocolo + '" title="Excluir ocorrência" aria-label="Excluir ocorrência ' + ocorrencia.protocolo + '">' + iconeSvg("icone-lixeira") + "</button>"
      : '<span class="tabela__acao-bloqueada" title="Ocorrência já em andamento: mantém trilha auditável, não pode ser excluída" aria-label="Não é possível excluir: ocorrência já em andamento, mantém trilha auditável">' + iconeSvg("icone-lixeira") + "</span>";
    return '<tr data-protocolo="' + ocorrencia.protocolo + '" tabindex="0" role="button" aria-label="Abrir ocorrência ' + ocorrencia.protocolo + '">' +
      "<td class=\"protocolo\">" + ocorrencia.protocolo + "</td>" +
      "<td>" + ocorrencia.tipo + "</td>" +
      "<td>" + (ocorrencia.severidade ? '<span class="selo selo--sev-' + ocorrencia.severidade + '">' + iconeSvg(ICONE_SEVERIDADE[ocorrencia.severidade]) + ROTULO_SEVERIDADE[ocorrencia.severidade] + "</span>" : '<span class="tx-muted tx-body-sm">Não classificada</span>') +
      (ocorrencia.vulnerabilidade ? ' <span class="selo selo--perigo">' + iconeSvg("icone-alerta") + "Vulnerável</span>" : "") + "</td>" +
      "<td>" + ocorrencia.endereco + "</td>" +
      "<td>" + (equipe ? equipe.nome : '<span class="tx-muted">Não atribuída</span>') + "</td>" +
      "<td>" + prazoHtml + "</td>" +
      "<td><span class=\"selo selo--" + SELO_STATUS[ocorrencia.status] + "\">" + iconeSvg(ICONE_STATUS[ocorrencia.status]) + statusInfo.rotulo + "</span></td>" +
      '<td class="tabela__acoes">' + acaoExcluir + "</td>" +
      "</tr>";
  }

  function renderizarTabelaPainel() {
    var lista = filtrarPorStatus(estado.ocorrencias, estado.painelFiltroStatus);
    lista = filtrarPorBusca(lista, estado.painelBusca, function (o) { return [o.protocolo, o.tipo, o.endereco]; });
    lista = ordenarOcorrencias(lista, estado.painelOrdenacao);
    var corpo = document.getElementById("painel-tabela-corpo");
    var wrap = document.getElementById("painel-tabela-wrap");
    var vazio = document.getElementById("painel-estado-vazio");

    if (lista.length === 0) {
      wrap.hidden = true;
      vazio.hidden = false;
      vazio.innerHTML = iconeSvg("icone-fila") +
        '<p class="estado-vazio__titulo">Nenhuma ocorrência encontrada</p>' +
        '<p class="estado-vazio__texto tx-body-sm">' + (estado.painelBusca ? "Tente outro termo de busca, ou " : "Escolha outro filtro acima, ou ") + 'selecione "Todas" para ver a fila completa.</p>';
      document.getElementById("painel-paginacao").innerHTML = "";
      return;
    }

    wrap.hidden = false;
    vazio.hidden = true;
    var pagina = paginar(lista, estado.painelPagina, ITENS_POR_PAGINA);
    estado.painelPagina = pagina.pagina;
    corpo.innerHTML = pagina.itens.map(linhaTabelaOcorrencia).join("");
    renderizarPaginacao("painel-paginacao", pagina, function (delta) {
      estado.painelPagina += delta;
      renderizarTabelaPainel();
    });
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
    return '<div class="pino pino--' + severidade + '" tabindex="0" role="button" ' +
      'aria-label="Abrir ocorrência ' + ocorrencia.protocolo + '" data-protocolo="' + ocorrencia.protocolo + '" ' +
      'title="' + ocorrencia.protocolo + ", " + ocorrencia.tipo + ", " + ocorrencia.endereco + '" ' +
      'style="left: ' + x + '%; top: ' + y + '%;"></div>';
  }

  /* Ocorrências perto umas das outras (mesmo endereço, ou só no mesmo quarteirão)
     têm pinos grandes o bastante para se sobreporem visualmente mesmo sem coordenada
     idêntica. Por isso o agrupamento é por proximidade (LIMIAR), não só por chave
     exata: sem isso, um pino fica embaixo do outro, impossível de ver ou clicar. */
  function posicoesMapaSemSobreposicao(lista) {
    var LIMIAR = 7;
    var grupos = lista.map(function (o) { return [o]; });
    var mudou = true;
    while (mudou) {
      mudou = false;
      for (var i = 0; i < grupos.length && !mudou; i++) {
        for (var j = i + 1; j < grupos.length && !mudou; j++) {
          var proximos = grupos[i].some(function (a) {
            return grupos[j].some(function (b) {
              return Math.hypot(a.mapaX - b.mapaX, a.mapaY - b.mapaY) < LIMIAR;
            });
          });
          if (proximos) {
            grupos[i] = grupos[i].concat(grupos[j]);
            grupos.splice(j, 1);
            mudou = true;
          }
        }
      }
    }

    var posicoes = {};
    grupos.forEach(function (grupo) {
      if (grupo.length === 1) {
        posicoes[grupo[0].protocolo] = { x: grupo[0].mapaX, y: grupo[0].mapaY };
        return;
      }
      var centroX = grupo.reduce(function (soma, o) { return soma + o.mapaX; }, 0) / grupo.length;
      var centroY = grupo.reduce(function (soma, o) { return soma + o.mapaY; }, 0) / grupo.length;
      var raio = 3.2 + grupo.length * 0.85;
      grupo.forEach(function (o, indice) {
        var angulo = (2 * Math.PI * indice) / grupo.length - Math.PI / 2;
        posicoes[o.protocolo] = {
          x: centroX + raio * Math.cos(angulo),
          y: centroY + raio * Math.sin(angulo)
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

  /* ---------- Documentos oficiais (CP6) ----------
     A folha e uma das excecoes de tema declaradas: documento e documento,
     fica claro nos dois temas. Todo dado sai da propria ocorrencia, nunca
     de valor digitado no documento, para o papel nunca divergir da origem. */

  function autoriaDosEventos(ocorrencia) {
    var porPerfil = window.DC360_DADOS_INICIAIS.usuariosPorPerfil;
    var agente = agenteDaVistoria(ocorrencia);
    return {
      registro: { nome: ocorrencia.operadorResponsavel || porPerfil.operador.nome, papel: "Operador de plantão", origem: "Escritório" },
      coordenacao: { nome: porPerfil.coordenador.nome, papel: porPerfil.coordenador.cargo, origem: "Escritório" },
      campo: { nome: agente.nome, papel: agente.cargo, origem: "Campo" }
    };
  }

  /* O agente que assina a vistoria e o membro da equipe designada; se a
     equipe nao tiver ninguem cadastrado, cai no agente padrao da demo. */
  function agenteDaVistoria(ocorrencia) {
    var padrao = window.DC360_DADOS_INICIAIS.usuariosPorPerfil["agente-campo"];
    var daEquipe = estado.usuarios.filter(function (u) {
      return u.perfil === "agente-campo" && u.equipeId === ocorrencia.equipeId;
    })[0];
    return daEquipe || padrao;
  }

  function versaoDocumento(ocorrencia) {
    var versao = 1;
    if (ocorrencia.providencia) { versao++; }
    if (ocorrencia.status === "encerrada") { versao++; }
    return "v" + versao + ".0";
  }

  /* Padrao geometrico fixo: nao codifica nada, nao resolve para lugar nenhum.
     Comunica "documento verificavel" na demo, sem fingir validacao real. */
  var PADRAO_QR = [
    1,1,1,0,1,1,1,
    1,0,1,0,1,0,1,
    1,1,1,0,1,1,1,
    0,0,0,1,0,0,0,
    1,1,0,1,0,1,1,
    1,0,1,0,1,0,1,
    1,1,1,0,1,1,0
  ];

  function htmlQrValidacao() {
    return '<div class="folha__qr" aria-hidden="true">' +
      PADRAO_QR.map(function (celula) { return '<span class="' + (celula ? "" : "vazio") + '"></span>'; }).join("") +
      "</div>";
  }

  function htmlCabecalhoFolha(titulo, ocorrencia) {
    var m = window.DC360_DADOS_INICIAIS.municipio;
    return '<div class="folha__marca-dagua" aria-hidden="true">PROTÓTIPO, DADOS FICTÍCIOS</div>' +
      '<div class="folha__cabecalho">' +
      '<svg class="folha__brasao" aria-hidden="true"><use href="#icone-brasao"></use></svg>' +
      '<div class="folha__orgao">' +
      '<span class="folha__orgao-municipio">Prefeitura Municipal de ' + m.nome + ", " + m.uf + "</span>" +
      '<span class="folha__orgao-nome">' + m.orgao + "</span>" +
      '<span class="folha__orgao-sub">Documento gerado em ambiente de demonstração</span>' +
      "</div>" +
      '<span class="folha__brasao" aria-hidden="true"></span>' +
      "</div>" +
      '<h2 class="folha__titulo">' + titulo + "</h2>" +
      '<p class="folha__protocolo-linha">Protocolo ' + ocorrencia.protocolo + " · " + versaoDocumento(ocorrencia) + "</p>";
  }

  function campoFolha(rotulo, valor, mono) {
    return '<div><span class="folha__campo-rotulo">' + rotulo + "</span>" +
      '<span class="folha__campo-valor' + (mono ? " folha__campo-valor--mono" : "") + '">' + valor + "</span></div>";
  }

  function htmlRodapeFolha(ocorrencia) {
    return '<div class="folha__rodape">' +
      '<p class="folha__rodape-texto">Documento emitido pelo sistema Defesa Civil Operacional 360, versão ' +
      versaoDocumento(ocorrencia) + ", referente ao protocolo " + ocorrencia.protocolo +
      ". Este é um protótipo de demonstração: os dados são fictícios e o documento não tem validade legal.</p>" +
      '<div class="folha__validacao">' + htmlQrValidacao() +
      '<span class="folha__validacao-rotulo">Validação</span></div>' +
      "</div>";
  }

  function renderizarDocumentoVistoria() {
    var ocorrencia = buscarOcorrencia(estado.ocorrenciaSelecionada);
    var container = document.getElementById("doc-vistoria-conteudo");
    if (!container) { return; }
    if (!ocorrencia || !ocorrencia.vistoria) {
      container.innerHTML = '<div class="estado-vazio card">' + iconeSvg("icone-alerta") +
        '<p class="estado-vazio__titulo">Vistoria ainda não concluída</p>' +
        '<p class="estado-vazio__texto tx-body-sm">O relatório só existe depois que o agente conclui a vistoria em campo.</p></div>';
      return;
    }

    var v = ocorrencia.vistoria;
    var agente = agenteDaVistoria(ocorrencia);
    var equipe = buscarEquipe(ocorrencia.equipeId);

    var checklistHtml = CHECKLIST_VISTORIA.map(function (item) {
      var marcado = v.checklist && v.checklist[item.id];
      return '<li><span class="folha__marca-item">' + (marcado ? "X" : "") + "</span>" +
        "<span>" + item.texto + (item.obrigatorio ? "" : " (item opcional)") + "</span></li>";
    }).join("");

    var totalFotos = v.totalFotos || 0;
    var fotosHtml = totalFotos === 0
      ? '<p class="folha__paragrafo">Nenhuma fotografia registrada nesta vistoria.</p>'
      : '<div class="folha__fotos">' + Array.apply(null, { length: totalFotos }).map(function (_, i) {
          return '<div class="folha__foto"><div class="folha__foto-area">' + iconeSvg("icone-camera") + "</div>" +
            '<span class="folha__foto-legenda"><strong>Foto ' + (i + 1) + "</strong><br>" +
            formatarDataHora(ocorrencia.vistoriaConcluidaEm) + "<br>" +
            ocorrencia.gps.lat.toFixed(4) + ", " + ocorrencia.gps.lng.toFixed(4) + "</span></div>";
        }).join("") + "</div>";

    container.innerHTML = '<div class="folha">' +
      htmlCabecalhoFolha("Relatório de vistoria técnica", ocorrencia) +

      '<div class="folha__secao"><p class="folha__secao-titulo">Identificação do imóvel e da ocorrência</p>' +
      '<div class="folha__grade">' +
      campoFolha("Endereço", ocorrencia.endereco) +
      campoFolha("Tipo (COBRADE)", ocorrencia.tipo) +
      campoFolha("Severidade", ROTULO_SEVERIDADE[ocorrencia.severidade] || "Não classificada") +
      campoFolha("Solicitante", ocorrencia.solicitante) +
      campoFolha("Coordenadas", ocorrencia.gps.lat.toFixed(4) + ", " + ocorrencia.gps.lng.toFixed(4), true) +
      campoFolha("Vulnerabilidade", ocorrencia.vulnerabilidade ? ocorrencia.vulnerabilidadeDescricao : "Não identificada") +
      "</div></div>" +

      '<div class="folha__secao"><p class="folha__secao-titulo">Relato registrado</p>' +
      '<p class="folha__paragrafo">' + ocorrencia.descricao + "</p></div>" +

      '<div class="folha__secao"><p class="folha__secao-titulo">Checklist de vistoria</p>' +
      '<ul class="folha__checklist">' + checklistHtml + "</ul></div>" +

      '<div class="folha__secao"><p class="folha__secao-titulo">Registro fotográfico (' + totalFotos + ")</p>" +
      fotosHtml + "</div>" +

      '<div class="folha__secao"><p class="folha__secao-titulo">Dados da coleta</p>' +
      '<div class="folha__grade">' +
      campoFolha("Equipe responsável", equipe ? equipe.nome + ", " + equipe.especialidade : "Não atribuída") +
      campoFolha("Precisão do GPS", v.gpsPrecisaoMetros ? v.gpsPrecisaoMetros + " metros" : "Não registrada") +
      campoFolha("Data e hora da vistoria", formatarDataHora(ocorrencia.vistoriaConcluidaEm, true)) +
      (v.sincronizadoEm ? campoFolha("Sincronizado em", formatarDataHora(v.sincronizadoEm, true)) : "") +
      "</div></div>" +

      '<div class="folha__assinaturas">' +
      '<div class="folha__assinatura"><div class="folha__assinatura-linha">' +
      '<span class="folha__assinatura-nome">' + agente.nome + "</span>" +
      '<span class="folha__assinatura-papel">' + agente.cargo + ", matrícula " + agente.matricula + "</span>" +
      "</div></div>" +
      '<div class="folha__assinatura"><div class="folha__assinatura-linha">' +
      '<span class="folha__assinatura-nome">' + (v.assinante || ocorrencia.solicitante) + "</span>" +
      '<span class="folha__assinatura-papel">Ciente da vistoria</span>' +
      "</div></div>" +
      "</div>" +

      htmlRodapeFolha(ocorrencia) +
      "</div>";
  }

  function renderizarDocumentoInterdicao() {
    var ocorrencia = buscarOcorrencia(estado.ocorrenciaSelecionada);
    var container = document.getElementById("doc-interdicao-conteudo");
    if (!container) { return; }
    if (!ocorrencia || !ocorrencia.vistoria) {
      container.innerHTML = '<div class="estado-vazio card">' + iconeSvg("icone-alerta") +
        '<p class="estado-vazio__titulo">Vistoria ainda não concluída</p>' +
        '<p class="estado-vazio__texto tx-body-sm">O termo de interdição só é emitido após a vistoria técnica.</p></div>';
      return;
    }

    var agente = agenteDaVistoria(ocorrencia);
    var coordenador = window.DC360_DADOS_INICIAIS.usuariosPorPerfil.coordenador;

    container.innerHTML = '<div class="folha">' +
      htmlCabecalhoFolha("Termo de interdição parcial", ocorrencia) +

      '<div class="folha__secao"><p class="folha__secao-titulo">Identificação do imóvel</p>' +
      '<div class="folha__grade">' +
      campoFolha("Endereço", ocorrencia.endereco) +
      campoFolha("Tipo (COBRADE)", ocorrencia.tipo) +
      campoFolha("Responsável pelo imóvel", ocorrencia.solicitante) +
      campoFolha("Coordenadas", ocorrencia.gps.lat.toFixed(4) + ", " + ocorrencia.gps.lng.toFixed(4), true) +
      "</div></div>" +

      '<div class="folha__secao"><p class="folha__secao-titulo">Do objeto</p>' +
      '<p class="folha__paragrafo">Fica <strong>parcialmente interditada</strong> a área do imóvel acima identificada, ' +
      "em razão do risco constatado na vistoria técnica registrada sob o protocolo " + ocorrencia.protocolo +
      ", realizada em " + formatarDataHora(ocorrencia.vistoriaConcluidaEm, true) + ".</p>" +
      '<p class="folha__paragrafo">A interdição parcial restringe o uso da área diretamente afetada e permanece vigente ' +
      "até que nova vistoria técnica ateste a cessação do risco. A liberação depende de manifestação formal deste órgão.</p></div>" +

      '<div class="folha__secao"><p class="folha__secao-titulo">Da fundamentação</p>' +
      '<p class="folha__paragrafo">O presente termo tem fundamento na Lei 12.608/2012, que institui a Política Nacional ' +
      "de Proteção e Defesa Civil, alterada pela Lei 14.750/2023, no que atribui ao município a competência para atuar " +
      "na prevenção de desastres e na proteção da população em áreas de risco.</p>" +
      '<p class="folha__paragrafo tx-muted">Documento de demonstração: a fundamentação acima é ilustrativa e não substitui ' +
      "a análise jurídica do órgão emissor no uso real.</p></div>" +

      '<div class="folha__secao"><p class="folha__secao-titulo">Da ciência</p>' +
      '<p class="folha__paragrafo">O responsável pelo imóvel declara ciência da interdição parcial e das restrições dela ' +
      "decorrentes, bem como da obrigação de não reocupar a área interditada até liberação formal.</p></div>" +

      '<div class="folha__assinaturas">' +
      '<div class="folha__assinatura"><div class="folha__assinatura-linha">' +
      '<span class="folha__assinatura-nome">' + agente.nome + "</span>" +
      '<span class="folha__assinatura-papel">' + agente.cargo + ", matrícula " + agente.matricula + "</span>" +
      "</div></div>" +
      '<div class="folha__assinatura"><div class="folha__assinatura-linha">' +
      '<span class="folha__assinatura-nome">' + coordenador.nome + "</span>" +
      '<span class="folha__assinatura-papel">' + coordenador.cargo + ", matrícula " + coordenador.matricula + "</span>" +
      "</div></div>" +
      '<div class="folha__assinatura"><div class="folha__assinatura-linha">' +
      '<span class="folha__assinatura-nome">' + (ocorrencia.vistoria.assinante || ocorrencia.solicitante) + "</span>" +
      '<span class="folha__assinatura-papel">Responsável pelo imóvel, ciente</span>' +
      "</div></div>" +
      "</div>" +

      htmlRodapeFolha(ocorrencia) +
      "</div>";
  }

  /* ---------- Detalhe da ocorrência ---------- */

  function abrirDetalhe(protocolo) {
    estado.ocorrenciaSelecionada = protocolo;
    mostrarTela("coordenador", "detalhe", { moverFoco: true });
    renderizarDetalhe();
  }

  /* A trilha auditavel precisa responder "quem fez o que, quando e de onde".
     autoria = { nome, papel, origem } com origem em "Campo" ou "Escritório". */
  function eventoLinhaTempo(iconeChave, rotulo, dataIso, corpo, autoria) {
    if (!dataIso) { return ""; }
    var linhaAutoria = autoria
      ? '<p class="linha-tempo__autoria">' +
        "<strong>" + autoria.nome + "</strong>, " + autoria.papel +
        ' <span class="selo selo--neutro">' + iconeSvg(autoria.origem === "Campo" ? "icone-celular" : "icone-prancheta") + autoria.origem + "</span></p>"
      : "";
    return '<div class="linha-tempo__evento">' +
      '<div class="linha-tempo__marco"><span class="linha-tempo__ponto"></span><span class="linha-tempo__linha"></span></div>' +
      '<div class="linha-tempo__corpo">' +
      '<p class="tx-body tx-forte">' + rotulo + "</p>" +
      '<p class="tx-body-sm tx-muted">' + formatarDataHora(dataIso, true) + "</p>" +
      linhaAutoria +
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

    var autores = autoriaDosEventos(ocorrencia);
    var linhaTempoHtml = eventoLinhaTempo("icone-fila", "Ocorrência registrada", ocorrencia.criadoEm, null, autores.registro) +
      (ocorrencia.vinculadaA ? eventoLinhaTempo("icone-relogio", "Vinculada ao chamado " + ocorrencia.vinculadaA, ocorrencia.criadoEm, null, autores.registro) : "") +
      eventoLinhaTempo("icone-mapa", "Despachada" + (equipe ? " para " + equipe.nome : ""), ocorrencia.despachadoEm, null, autores.coordenacao) +
      eventoLinhaTempo("icone-check-circulo", "Vistoria concluída", ocorrencia.vistoriaConcluidaEm,
        (ocorrencia.vistoria && ocorrencia.vistoria.sincronizadoEm)
          ? "Coletada offline às " + formatarDataHora(ocorrencia.vistoriaConcluidaEm) + ", sincronizada às " + formatarDataHora(ocorrencia.vistoria.sincronizadoEm) + "."
          : null, autores.campo) +
      (ocorrencia.providencia
        ? eventoLinhaTempo("icone-caminhao", "Providência encaminhada a " + ocorrencia.providencia.secretaria,
            ocorrencia.providencia.encaminhadaEm || ocorrencia.vistoriaConcluidaEm,
            ocorrencia.providencia.descricao, autores.coordenacao)
        : "") +
      eventoLinhaTempo("icone-check-circulo", "Ocorrência encerrada", ocorrencia.encerradaEm, ocorrencia.motivoEncerramento, autores.coordenacao);

    var podeEncerrar = estado.perfil === "coordenador" && ocorrencia.status !== "encerrada";
    var encerramentoHtml = "";
    if (podeEncerrar) {
      encerramentoHtml = '<div class="cartao-acao" id="bloco-encerramento">' +
        '<h2 class="tx-h3 mb-4">Encerrar ocorrência</h2>' +
        '<form id="form-encerramento" novalidate>' +
        campoArea("encerramento-motivo", "Motivo do encerramento") +
        '<div class="formulario__acoes"><button type="submit" class="btn btn--primario">Encerrar ocorrência</button></div>' +
        "</form></div>";
    }

    /* Documentos so existem depois da vistoria: e o que garante que o papel
       nunca mostre dado que ainda nao foi coletado em campo. */
    var temVistoria = !!ocorrencia.vistoria;
    var documentosHtml = "";
    if (estado.perfil === "coordenador" && temVistoria) {
      documentosHtml = '<div class="card">' +
        '<h2 class="tx-h3 mb-4">Documentos oficiais</h2>' +
        '<p class="tx-body-sm tx-muted mb-3">Gerados a partir dos dados desta ocorrência, na versão ' +
        versaoDocumento(ocorrencia) + ".</p>" +
        '<div class="formulario__acoes">' +
        '<button type="button" class="btn btn--secundario" data-acao="abrir-doc-vistoria">' +
        iconeSvg("icone-documento") + "Relatório de vistoria</button>" +
        '<button type="button" class="btn btn--secundario" data-acao="abrir-doc-interdicao">' +
        iconeSvg("icone-documento") + "Termo de interdição</button>" +
        "</div></div>";
    }

    var podeEncaminharProvidencia = estado.perfil === "coordenador" && temVistoria &&
      !ocorrencia.providencia && ocorrencia.status !== "encerrada";
    var providenciaHtml = "";
    if (podeEncaminharProvidencia) {
      var opcoesSecretaria = window.DC360_DADOS_INICIAIS.secretarias.map(function (sec) {
        return '<option value="' + sec + '">' + sec + "</option>";
      }).join("");
      providenciaHtml = '<div class="cartao-acao" id="bloco-providencia">' +
        '<h2 class="tx-h3 mb-4">Encaminhar providência</h2>' +
        '<form id="form-providencia" novalidate>' +
        campoSelecao("providencia-secretaria", "Secretaria responsável", opcoesSecretaria) +
        campoTexto("providencia-descricao", "O que precisa ser feito") +
        campoTexto("providencia-responsavel", "Responsável na secretaria") +
        '<div class="campo" id="campo-providencia-prazo">' +
        '<label class="campo__rotulo" for="providencia-prazo">Prazo, em horas</label>' +
        '<input class="entrada" type="number" min="1" max="720" id="providencia-prazo" value="48">' +
        '<span class="campo__erro" hidden></span>' +
        "</div>" +
        '<div class="formulario__acoes"><button type="submit" class="btn btn--primario">Encaminhar providência</button></div>' +
        "</form></div>";
    }

    var podeDespachar = estado.perfil === "coordenador" && ocorrencia.status === "triagem" && !ocorrencia.equipeId;
    var despachoHtml = "";
    if (podeDespachar) {
      var dados = window.DC360_DADOS_INICIAIS;
      var prazoSugerido = dados.prazosPadraoHoras[ocorrencia.severidade] || 24;
      var opcoesEquipe = estado.equipes.map(function (eq) {
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
      documentosHtml +
      '<div class="card">' +
      '<h2 class="tx-h3 mb-4">Linha do tempo</h2>' +
      '<div class="linha-tempo">' + linhaTempoHtml + "</div>" +
      "</div>" +
      providenciaHtml +
      encerramentoHtml;

    if (documentosHtml) {
      container.querySelector('[data-acao="abrir-doc-vistoria"]').addEventListener("click", function () {
        mostrarTela("coordenador", "documento-vistoria", { moverFoco: true });
        renderizarDocumentoVistoria();
      });
      container.querySelector('[data-acao="abrir-doc-interdicao"]').addEventListener("click", function () {
        mostrarTela("coordenador", "documento-interdicao", { moverFoco: true });
        renderizarDocumentoInterdicao();
      });
    }

    if (podeEncaminharProvidencia) {
      document.getElementById("form-providencia").addEventListener("submit", function (evento) {
        evento.preventDefault();
        var secretaria = document.getElementById("providencia-secretaria").value;
        var descricao = document.getElementById("providencia-descricao").value.trim();
        var responsavel = document.getElementById("providencia-responsavel").value.trim();
        var prazoHoras = parseFloat(document.getElementById("providencia-prazo").value);

        var valido = true;
        [
          ["providencia-secretaria", secretaria, "Escolha a secretaria."],
          ["providencia-descricao", descricao, "Descreva o que precisa ser feito."],
          ["providencia-responsavel", responsavel, "Informe o responsável na secretaria."]
        ].forEach(function (par) {
          if (!par[1]) { marcarErroCampo(par[0], par[2]); valido = false; } else { limparErroCampo(par[0]); }
        });
        if (!prazoHoras || prazoHoras <= 0) {
          marcarErroCampo("providencia-prazo", "Informe um prazo válido, em horas.");
          valido = false;
        } else { limparErroCampo("providencia-prazo"); }
        if (!valido) {
          var primeiroInvalido = document.querySelector("#form-providencia .campo--invalido .entrada, #form-providencia .campo--invalido .selecao");
          if (primeiroInvalido) { primeiroInvalido.focus(); }
          return;
        }

        ocorrencia.status = "providencia_pendente";
        ocorrencia.providencia = {
          secretaria: secretaria,
          descricao: descricao,
          responsavel: responsavel,
          encaminhadaEm: new Date().toISOString(),
          prazoEm: new Date(Date.now() + prazoHoras * 3600000).toISOString()
        };
        atualizarTudoAposMudanca();
        anunciar("Providência encaminhada a " + secretaria + ".");
      });
    }

    if (podeEncerrar) {
      document.getElementById("form-encerramento").addEventListener("submit", function (evento) {
        evento.preventDefault();
        var motivoInput = document.getElementById("encerramento-motivo");
        var motivo = motivoInput.value.trim();
        if (!motivo) {
          marcarErroCampo("encerramento-motivo", "Informe o motivo do encerramento.");
          motivoInput.focus();
          return;
        }
        limparErroCampo("encerramento-motivo");

        ocorrencia.status = "encerrada";
        ocorrencia.encerradaEm = new Date().toISOString();
        ocorrencia.motivoEncerramento = motivo;

        atualizarTudoAposMudanca();
        anunciar("Ocorrência encerrada.");
      });
    }

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
    persistirEstado();
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
    var completo = estado.usuarios.filter(function (u) { return u.matricula === perfilLogado.matricula; })[0];
    return completo ? completo.equipeId : null;
  }

  function protocoloTemConclusaoPendente(protocolo) {
    return estado.filaSincronizacao.some(function (item) { return item.protocolo === protocolo && item.tipo === "conclusao"; });
  }

  function listasEquipeAgentePorCategoria() {
    var equipeId = equipeDoAgenteAtual();
    var doTime = estado.ocorrencias.filter(function (o) { return o.equipeId === equipeId; });
    var pendentes = doTime.filter(function (o) { return o.status === "em_campo" && !protocoloTemConclusaoPendente(o.protocolo); });
    return {
      pendentes: pendentes,
      atrasadas: pendentes.filter(ocorrenciaAtrasada),
      concluidas: doTime.filter(function (o) {
        return o.status === "vistoria_concluida" || o.status === "encerrada" ||
          (o.status === "em_campo" && protocoloTemConclusaoPendente(o.protocolo));
      })
    };
  }

  function tarefasDoAgente() {
    return listasEquipeAgentePorCategoria().pendentes;
  }

  function estatisticasEquipeAgente() {
    var listas = listasEquipeAgentePorCategoria();
    return { pendentes: listas.pendentes.length, atrasadas: listas.atrasadas.length, concluidas: listas.concluidas.length };
  }

  /* ---------- Conectividade e fila de sincronização (simulador de offline) ---------- */

  function atualizarIndicadorConectividade() {
    var badge = document.getElementById("campo-indicador-conectividade");
    var texto = document.getElementById("campo-indicador-conectividade-texto");
    if (!badge || !texto) { return; }
    var ROTULO_CONECTIVIDADE = { online: "Online", offline: "Sem sinal", sincronizando: "Sincronizando" };
    badge.className = "moldura-celular__conexao moldura-celular__conexao--" + estado.conectividade;
    badge.querySelector("svg use").setAttribute("href", "#" + ICONE_CONECTIVIDADE[estado.conectividade]);
    texto.textContent = ROTULO_CONECTIVIDADE[estado.conectividade];
  }

  function definirConectividade(novoEstado) {
    estado.conectividade = novoEstado;
    atualizarIndicadorConectividade();
    persistirEstado();
    if (estado.campoSubtela !== "vistoria") { renderizarListaTarefas(); }
  }

  function campoLeituraSimples(rotulo, valor) {
    return '<div class="campo-leitura"><span class="campo-leitura__rotulo">' + rotulo + '</span><span class="campo-leitura__valor">' + valor + "</span></div>";
  }

  var ICONE_CONECTIVIDADE = { online: "icone-wifi", offline: "icone-wifi-off", sincronizando: "icone-atualizar" };
  var ROTULO_STATUS_CONEXAO = { online: "Online", offline: "Sem sinal, salvando neste aparelho", sincronizando: "Sincronizando" };

  /* A entrada dos itens e escalonada por indice: e isso que produz a
     sensacao de "fila enchendo item a item" que o design system pede,
     em vez de todos aparecerem no mesmo quadro. */
  function htmlItemFila(item, indice) {
    return '<li class="campo-conectividade__item" data-item-id="' + item.id +
      '" style="animation-delay: calc(var(--ds-dur-fast) * ' + indice + ')">' +
      '<span class="campo-conectividade__item-ponto" aria-hidden="true"></span>' +
      "<span>" + item.rotulo + "</span>" +
      '<span class="campo-conectividade__item-estado tx-muted">Pendente</span>' +
      "</li>";
  }

  function htmlListaFila() {
    var fila = estado.filaSincronizacao;
    if (fila.length === 0 || estado.conectividade === "online") { return ""; }
    return '<ul class="campo-conectividade__fila" id="campo-conectividade-fila">' +
      fila.map(htmlItemFila).join("") + "</ul>";
  }

  function textoStatusConexao() {
    var fila = estado.filaSincronizacao;
    return ROTULO_STATUS_CONEXAO[estado.conectividade] +
      (fila.length > 0 ? " · " + fila.length + (fila.length === 1 ? " item pendente" : " itens pendentes") : "");
  }

  function htmlFaixaConectividade(opcoes) {
    opcoes = opcoes || {};
    var ROTULO_BOTAO = { online: "Simular perda de sinal", offline: "Reconectar", sincronizando: "Sincronizando…" };
    var atual = estado.conectividade;
    /* Na vistoria a faixa e compacta e so de leitura: fica fixa no topo,
       mostrando o contador subir a cada acao, mas sem a lista e sem botao.
       A lista inteira e o botao de reconectar vivem na tela de tarefas,
       onde nao ha formulario embaixo para a faixa cobrir. */
    var botaoHtml = opcoes.semBotao
      ? ""
      : '<button type="button" class="btn btn--secundario btn--pequeno" id="campo-conectividade-alternar">' + ROTULO_BOTAO[atual] + "</button>";
    return '<div class="campo-conectividade campo-conectividade--' + atual +
      (opcoes.compacta ? " campo-conectividade--compacta" : "") + '" id="campo-conectividade">' +
      '<div class="campo-conectividade__linha">' +
      '<span class="campo-conectividade__status">' + iconeSvg(ICONE_CONECTIVIDADE[atual]) +
      '<span id="campo-conectividade-texto">' + textoStatusConexao() + "</span></span>" +
      botaoHtml +
      "</div>" +
      (opcoes.compacta ? "" : htmlListaFila()) +
      "</div>";
  }

  /* Redesenha so a faixa, sem re-renderizar o formulario de vistoria em
     volta (que perderia foco, rascunho de assinatura e rolagem).
     A insercao e incremental de proposito: so o item novo entra animado,
     em vez de a lista inteira repiscar a cada acao do agente. */
  function atualizarFaixaConectividadeNaTela() {
    var faixa = document.getElementById("campo-conectividade");
    if (!faixa) { return; }
    /* Preserva o modificador de variante ao trocar o de estado: reescrever
       className inteiro apagaria o --compacta e faria a lista voltar a ser
       injetada por cima do formulario de vistoria. */
    var compacta = faixa.classList.contains("campo-conectividade--compacta");
    faixa.className = "campo-conectividade campo-conectividade--" + estado.conectividade +
      (compacta ? " campo-conectividade--compacta" : "");
    var texto = document.getElementById("campo-conectividade-texto");
    if (texto) { texto.textContent = textoStatusConexao(); }

    if (faixa.classList.contains("campo-conectividade--compacta")) { return; }

    var lista = faixa.querySelector(".campo-conectividade__fila");
    if (estado.filaSincronizacao.length === 0 || estado.conectividade === "online") {
      if (lista) { lista.remove(); }
      return;
    }
    if (!lista) {
      faixa.insertAdjacentHTML("beforeend", htmlListaFila());
      return;
    }
    estado.filaSincronizacao.forEach(function (item) {
      if (lista.querySelector('[data-item-id="' + item.id + '"]')) { return; }
      /* Indice 0: o item novo entra sem atraso, ja que ele aparece
         sozinho em resposta direta a uma acao que o agente acabou de fazer. */
      lista.insertAdjacentHTML("beforeend", htmlItemFila(item, 0));
    });
  }

  function wireFaixaConectividade() {
    var botao = document.getElementById("campo-conectividade-alternar");
    if (botao) { botao.addEventListener("click", alternarSimulacaoConectividade); }
  }

  var ROTULO_CATEGORIA_CAMPO = { pendentes: "Pendentes", atrasadas: "Atrasadas", concluidas: "Concluídas" };

  function htmlEstatisticasCampo(classeExtra) {
    var stats = estatisticasEquipeAgente();
    var blocos = [
      { chave: "pendentes", valor: stats.pendentes, modificador: "" },
      { chave: "atrasadas", valor: stats.atrasadas, modificador: stats.atrasadas > 0 ? " campo-estatistica--perigo" : "" },
      { chave: "concluidas", valor: stats.concluidas, modificador: " campo-estatistica--sucesso" }
    ];
    return '<div class="campo-estatisticas' + (classeExtra ? " " + classeExtra : "") + '">' +
      blocos.map(function (b) {
        var rotulo = ROTULO_CATEGORIA_CAMPO[b.chave];
        return '<button type="button" class="campo-estatistica' + b.modificador + '" data-filtro="' + b.chave + '"' +
          ' aria-label="Ver ' + b.valor + " ocorrências " + rotulo.toLowerCase() + '">' +
          '<span class="campo-estatistica__valor">' + b.valor + "</span>" +
          '<span class="campo-estatistica__rotulo">' + rotulo + "</span></button>";
      }).join("") +
      "</div>";
  }

  function wireEstatisticasCampo(container) {
    Array.prototype.forEach.call(container.querySelectorAll("[data-filtro]"), function (botao) {
      botao.addEventListener("click", function () {
        estado.campoFiltroLista = botao.dataset.filtro;
        estado.campoSubtela = "lista-filtrada";
        renderizarListaTarefas();
      });
    });
  }

  function renderizarListaFiltradaCampo() {
    var container = document.getElementById("campo-conteudo");
    if (!container) { return; }
    document.getElementById("campo-acao-primaria").hidden = true;
    var categoria = estado.campoFiltroLista || "pendentes";
    var lista = listasEquipeAgentePorCategoria()[categoria] || [];
    var podeAbrirVistoria = categoria !== "concluidas";

    var corpo = lista.length === 0
      ? '<div class="estado-vazio">' + iconeSvg("icone-check-circulo") +
        '<p class="estado-vazio__titulo">Nada em ' + ROTULO_CATEGORIA_CAMPO[categoria].toLowerCase() + "</p>" +
        '<p class="estado-vazio__texto tx-body-lg">Não há ocorrências nesta categoria agora.</p></div>'
      : lista.map(function (o) { return htmlCartaoTarefa(o, false, podeAbrirVistoria); }).join("");

    container.innerHTML =
      '<button type="button" class="btn btn--fantasma btn--pequeno" id="campo-filtro-voltar">' + iconeSvg("icone-seta-esquerda") + "Voltar</button>" +
      '<div class="campo-cabecalho-lista">' +
      '<h2 class="tx-h3">' + ROTULO_CATEGORIA_CAMPO[categoria] + "</h2>" +
      '<span class="contador-badge">' + lista.length + "</span>" +
      "</div>" + corpo;

    document.getElementById("campo-filtro-voltar").addEventListener("click", function () {
      estado.campoSubtela = "lista";
      estado.campoFiltroLista = null;
      renderizarListaTarefas();
    });

    if (podeAbrirVistoria) {
      Array.prototype.forEach.call(container.querySelectorAll("[data-protocolo]"), function (botao) {
        botao.addEventListener("click", function () {
          estado.tarefaSelecionada = botao.dataset.protocolo;
          estado.campoSubtela = "vistoria";
          rascunhoVistoria = { checklist: {}, fotos: [], gps: null, assinaturaFeita: false };
          renderizarVistoria();
        });
      });
    }
  }

  function htmlCartaoTarefa(o, destaque, clicavel) {
    var atrasada = ocorrenciaAtrasada(o);
    var equipe = buscarEquipe(o.equipeId);
    var aguardandoSync = protocoloTemConclusaoPendente(o.protocolo);
    var tag = clicavel ? "button" : "div";
    var atributos = clicavel ? ' type="button" data-protocolo="' + o.protocolo + '"' : "";
    var seloRodape = clicavel
      ? '<span class="selo ' + (atrasada ? "selo--perigo" : "selo--info") + '">' +
        iconeSvg(atrasada ? "icone-alerta" : "icone-relogio") + formatarPrazoRelativo(o) + "</span>"
      : (aguardandoSync
        ? '<span class="selo selo--info">' + iconeSvg("icone-wifi-off") + "Aguardando sincronização</span>"
        : '<span class="selo selo--sucesso">' + iconeSvg("icone-check-circulo") + "Sincronizada</span>");
    return "<" + tag + ' class="cartao-tarefa' + (destaque ? " cartao-tarefa--destaque" : "") + (clicavel ? "" : " cartao-tarefa--estatico") + '"' + atributos + ">" +
      '<div class="cartao-tarefa__topo">' +
      '<span class="cartao-tarefa__protocolo">' + o.protocolo + "</span>" +
      (o.severidade ? '<span class="selo selo--sev-' + o.severidade + '">' + iconeSvg(ICONE_SEVERIDADE[o.severidade]) + ROTULO_SEVERIDADE[o.severidade] + "</span>" : "") +
      "</div>" +
      '<span class="cartao-tarefa__tipo">' + o.tipo + "</span>" +
      '<span class="cartao-tarefa__endereco">' + iconeSvg("icone-mapa") + o.endereco + "</span>" +
      '<div class="cartao-tarefa__rodape">' + seloRodape +
      (o.vulnerabilidade ? '<span class="selo selo--perigo">' + iconeSvg("icone-alerta") + "Vulnerável</span>" : "") +
      (equipe ? '<span class="cartao-tarefa__equipe">' + equipe.nome + "</span>" : "") +
      "</div>" +
      "</" + tag + ">";
  }

  function alternarSimulacaoConectividade() {
    if (estado.conectividade === "online") {
      definirConectividade("offline");
      anunciar("Sinal perdido. As ações continuam funcionando neste aparelho e serão sincronizadas ao reconectar.");
    } else if (estado.conectividade === "offline") {
      iniciarSincronizacao();
    } else {
      estado.tokenSincronizacao++;
      definirConectividade("offline");
      anunciar("Sinal perdido de novo durante a sincronização.");
    }
  }

  function iniciarSincronizacao() {
    if (estado.filaSincronizacao.length === 0) {
      definirConectividade("online");
      anunciar("Sinal restabelecido.");
      return;
    }
    var total = estado.filaSincronizacao.length;
    definirConectividade("sincronizando");
    estado.tokenSincronizacao++;
    anunciar("Sincronizando " + total + (total === 1 ? " item pendente." : " itens pendentes."));
    processarProximoItemFila(estado.tokenSincronizacao, total);
  }

  function processarProximoItemFila(token, total) {
    if (token !== estado.tokenSincronizacao) { return; }
    if (estado.filaSincronizacao.length === 0) {
      concluirSincronizacao(token, total);
      return;
    }
    var item = estado.filaSincronizacao[0];
    var linha = document.querySelector('[data-item-id="' + item.id + '"]');
    if (linha) {
      linha.classList.add("campo-conectividade__item--enviando");
      var estadoTexto = linha.querySelector(".campo-conectividade__item-estado");
      if (estadoTexto) { estadoTexto.textContent = "Enviando"; }
    }
    var reduzido = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    window.setTimeout(function () {
      if (token !== estado.tokenSincronizacao) { return; }
      if (item.tipo === "conclusao") {
        aplicarConclusaoVistoria(item.protocolo, item.registro, item.criadoEm, new Date().toISOString());
      }
      estado.filaSincronizacao.shift();
      persistirEstado();
      if (linha) {
        linha.classList.remove("campo-conectividade__item--enviando");
        linha.classList.add("campo-conectividade__item--enviado");
        var estadoFinal = linha.querySelector(".campo-conectividade__item-estado");
        if (estadoFinal) { estadoFinal.textContent = "Enviado"; }
      }
      processarProximoItemFila(token, total);
    }, reduzido ? 0 : tokenDuracaoMs("--ds-dur-slow") * 1.5);
  }

  function concluirSincronizacao(token, total) {
    atualizarTudoAposMudanca();
    estado.conectividade = "online";
    atualizarIndicadorConectividade();
    persistirEstado();
    anunciar(total + (total === 1 ? " item sincronizado." : " itens sincronizados.") + " Tudo em dia.");

    if (estado.campoSubtela === "vistoria") { return; }
    renderizarListaTarefas();
    var faixa = document.querySelector(".campo-conectividade");
    if (!faixa) { return; }
    faixa.classList.add("campo-conectividade--sucesso");
    var status = faixa.querySelector(".campo-conectividade__status");
    if (status) {
      status.innerHTML = iconeSvg("icone-check-circulo") + "<span>" + total +
        (total === 1 ? " item sincronizado" : " itens sincronizados") + "</span>";
    }
    window.setTimeout(function () {
      if (token !== estado.tokenSincronizacao) { return; }
      if (estado.campoSubtela !== "vistoria") { renderizarListaTarefas(); }
    }, tokenDuracaoMs("--ds-dur-slow") * 8);
  }

  var contadorItemFila = 0;

  function empilharItemFila(protocolo, tipo, rotulo, registro) {
    contadorItemFila++;
    estado.filaSincronizacao.push({
      id: "fila-" + contadorItemFila,
      protocolo: protocolo,
      tipo: tipo,
      rotulo: rotulo,
      criadoEm: new Date().toISOString(),
      registro: registro || null
    });
    persistirEstado();
    atualizarFaixaConectividadeNaTela();
  }

  function renderizarPerfilCampo() {
    var container = document.getElementById("campo-conteudo");
    if (!container) { return; }
    document.getElementById("campo-acao-primaria").hidden = true;
    var dados = window.DC360_DADOS_INICIAIS;
    var perfilLogado = dados.usuariosPorPerfil["agente-campo"];
    var usuarioCompleto = estado.usuarios.filter(function (u) { return u.matricula === perfilLogado.matricula; })[0];
    var equipe = buscarEquipe(usuarioCompleto ? usuarioCompleto.equipeId : null);
    var iniciais = perfilLogado.nome.split(" ").map(function (p) { return p[0]; }).slice(0, 2).join("");
    var colegas = equipe ? equipe.membros.filter(function (nome) { return nome !== perfilLogado.nome; }) : [];
    var estatisticasHtml = htmlEstatisticasCampo("mb-4");
    var colegasHtml = colegas.length
      ? '<div class="campo-lista-colegas">' + colegas.map(function (nome) {
          return '<span class="campo-colega"><span class="avatar avatar--pequeno">' + iniciaisDe(nome) + "</span>" + nome + "</span>";
        }).join("") + "</div>"
      : '<p class="tx-body-sm tx-muted">Nenhum colega nesta equipe ainda.</p>';

    container.innerHTML =
      htmlFaixaConectividade() +
      '<div class="linha-cabecalho-entidade mb-4">' +
      '<span class="avatar">' + iniciais + "</span>" +
      "<div><h2 class=\"tx-h3\">" + perfilLogado.nome + "</h2><p class=\"tx-body-sm tx-muted\">" + perfilLogado.cargo + "</p></div>" +
      "</div>" +
      estatisticasHtml +
      campoLeituraSimples("Matrícula", perfilLogado.matricula) +
      campoLeituraSimples("Equipe", equipe ? equipe.nome + ", " + equipe.especialidade : "Sem equipe") +
      campoLeituraSimples("E-mail", usuarioCompleto ? usuarioCompleto.email : "Não cadastrado") +
      campoLeituraSimples("Telefone", usuarioCompleto ? usuarioCompleto.telefone : "Não cadastrado") +
      '<p class="modal__secao-titulo mt-2">Colegas de equipe</p>' +
      colegasHtml +
      '<p class="tx-body-sm tx-muted mt-4">Nesta demonstração não há autenticação real. A troca de perfil no topo da tela substitui o login.</p>';
    wireFaixaConectividade();
    wireEstatisticasCampo(container);
  }

  function renderizarListaTarefas() {
    var container = document.getElementById("campo-conteudo");
    if (!container) { return; }
    if (estado.campoSubtela === "lista-filtrada") { renderizarListaFiltradaCampo(); return; }
    if (estado.campoAba === "perfil") { renderizarPerfilCampo(); return; }
    if (estado.campoSubtela === "vistoria" && estado.tarefaSelecionada) {
      renderizarVistoria();
      return;
    }
    document.getElementById("campo-acao-primaria").hidden = true;
    var tarefas = tarefasDoAgente();
    var estatisticasHtml = htmlEstatisticasCampo("");
    if (tarefas.length === 0) {
      container.innerHTML = htmlFaixaConectividade() + estatisticasHtml + '<div class="estado-vazio">' + iconeSvg("icone-check-circulo") +
        '<p class="estado-vazio__titulo">Nenhuma tarefa pendente</p>' +
        '<p class="estado-vazio__texto tx-body-lg">Quando o coordenador despachar uma ocorrência para a sua equipe, ela aparece aqui.</p>' +
        "</div>";
      wireFaixaConectividade();
      wireEstatisticasCampo(container);
      return;
    }
    container.innerHTML = htmlFaixaConectividade() + estatisticasHtml + '<div class="campo-cabecalho-lista">' +
      '<h2 class="tx-h3">Minhas tarefas</h2>' +
      '<span class="contador-badge">' + tarefas.length + (tarefas.length === 1 ? " hoje" : " hoje") + "</span>" +
      "</div>" +
      tarefas.map(function (o, indice) { return htmlCartaoTarefa(o, indice === 0, true); }).join("");
    Array.prototype.forEach.call(container.querySelectorAll("[data-protocolo]"), function (botao) {
      botao.addEventListener("click", function () {
        estado.tarefaSelecionada = botao.dataset.protocolo;
        estado.campoSubtela = "vistoria";
        rascunhoVistoria = { checklist: {}, fotos: [], gps: null, assinaturaFeita: false };
        renderizarVistoria();
      });
    });
    wireFaixaConectividade();
    wireEstatisticasCampo(container);
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
      if (!rascunhoVistoria.assinaturaFeita && estado.conectividade !== "online" && estado.tarefaSelecionada) {
        empilharItemFila(estado.tarefaSelecionada, "assinatura", "Assinatura coletada");
      }
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
      htmlFaixaConectividade({ semBotao: true, compacta: true }) +
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
        var completoAntes = checklistVistoriaCompleto();
        rascunhoVistoria.checklist[caixa.dataset.check] = caixa.checked;
        if (!completoAntes && checklistVistoriaCompleto() && estado.conectividade !== "online") {
          empilharItemFila(ocorrencia.protocolo, "checklist", "Checklist preenchido");
        }
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
      if (estado.conectividade !== "online") {
        empilharItemFila(ocorrencia.protocolo, "foto", "Foto " + rascunhoVistoria.fotos.length + " capturada");
      }
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
        if (estado.conectividade !== "online") {
          empilharItemFila(ocorrencia.protocolo, "gps", "GPS capturado (" + precisao + " m)");
        }
        atualizarBotaoConcluirVistoria();
        return;
      }
      window.setTimeout(function () { mostrarEtapa(indice + 1); }, reduzido ? 0 : tokenDuracaoMs("--ds-dur-slow") * 1.5);
    }
    mostrarEtapa(0);
  }

  function montarRegistroVistoria(nomeAssinante) {
    return {
      checklist: Object.assign({}, rascunhoVistoria.checklist),
      totalFotos: rascunhoVistoria.fotos.length,
      gpsPrecisaoMetros: rascunhoVistoria.gps ? rascunhoVistoria.gps.precisaoMetros : null,
      assinante: nomeAssinante
    };
  }

  function aplicarConclusaoVistoria(protocolo, registro, coletadoEm, sincronizadoEm) {
    var ocorrencia = buscarOcorrencia(protocolo);
    if (!ocorrencia || ocorrencia.status !== "em_campo") { return; }
    ocorrencia.status = "vistoria_concluida";
    ocorrencia.vistoriaConcluidaEm = coletadoEm;
    ocorrencia.vistoria = registro;
    if (sincronizadoEm) { ocorrencia.vistoria.sincronizadoEm = sincronizadoEm; }
  }

  function concluirVistoria(ocorrencia) {
    var nomeAssinante = document.getElementById("vistoria-nome-assinante").value.trim();
    var registro = montarRegistroVistoria(nomeAssinante);
    var protocolo = ocorrencia.protocolo;
    var offline = estado.conectividade !== "online";

    if (offline) {
      empilharItemFila(protocolo, "conclusao", "Vistoria concluída", registro);
    } else {
      aplicarConclusaoVistoria(protocolo, registro, new Date().toISOString(), null);
    }

    estado.tarefaSelecionada = null;
    estado.campoSubtela = "lista";
    atualizarTudoAposMudanca();

    document.getElementById("campo-acao-primaria").hidden = true;
    var container = document.getElementById("campo-conteudo");
    container.innerHTML = '<div class="estado-vazio">' + iconeSvg(offline ? "icone-wifi-off" : "icone-check-circulo") +
      '<p class="estado-vazio__titulo">Vistoria concluída</p>' +
      '<p class="estado-vazio__texto tx-body-lg">' + (offline
        ? "Protocolo " + protocolo + " salvo neste aparelho. Será enviado para a coordenação quando o sinal voltar."
        : "Protocolo " + protocolo + " enviado para a coordenação.") + "</p>" +
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

    var equipesHtml = estado.equipes.map(function (eq) {
      var seloStatus = eq.status === "em_campo" ? '<span class="selo selo--info">' + iconeSvg("icone-mapa") + "Em campo</span>" : '<span class="selo selo--sucesso">' + iconeSvg("icone-check-circulo") + "Disponível</span>";
      return '<div class="card card--clicavel" tabindex="0" role="button" data-acao="abrir-equipe" data-equipe-id="' + eq.id + '" aria-label="Gerenciar ' + eq.nome + '">' +
        '<div class="tela__cabecalho mb-2"><h3 class="tx-h3">' + eq.nome + "</h3>" + seloStatus + "</div>" +
        '<p class="tx-body-sm tx-muted">' + eq.especialidade + "</p>" +
        '<p class="tx-body-sm">' + (eq.membros.length ? eq.membros.join(", ") : '<span class="tx-muted">Sem integrantes</span>') + "</p>" +
        "</div>";
    }).join("");

    document.getElementById("configuracoes-conteudo").innerHTML =
      '<div class="card"><h2 class="tx-h3 mb-3">Tipos de ocorrência (COBRADE)</h2>' +
      '<div class="painel-grupo-chips">' + tiposHtml + "</div></div>" +
      '<div class="card"><h2 class="tx-h3 mb-3">Prazos padrão por severidade</h2>' +
      '<div class="grade-leitura">' + prazosHtml + "</div></div>" +
      '<div>' +
      '<div class="tela__cabecalho mb-3"><h2 class="tx-h3">Equipes cadastradas</h2>' +
      '<button type="button" class="btn btn--secundario btn--pequeno" id="botao-nova-equipe">' + iconeSvg("icone-mais-circulo") + "Nova equipe</button></div>" +
      '<div class="grade-cartoes">' + equipesHtml + "</div></div>";

    var botaoNovaEquipe = document.getElementById("botao-nova-equipe");
    if (botaoNovaEquipe) { botaoNovaEquipe.addEventListener("click", abrirModalCadastroEquipe); }
  }

  function renderizarPerfil() {
    var dados = window.DC360_DADOS_INICIAIS;
    var perfilLogado = dados.usuariosPorPerfil[estado.perfil];
    var usuarioCompleto = estado.usuarios.filter(function (u) { return u.matricula === perfilLogado.matricula; })[0];
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

  function renderizarIndicadoresUsuarios() {
    var lista = estado.usuarios;
    var indicadores = [
      { rotulo: "Colaboradores", valor: lista.length, modificador: "", icone: "icone-usuarios" },
      { rotulo: "Ativos", valor: lista.filter(function (u) { return u.status === "ativo"; }).length, modificador: "", icone: "icone-check-circulo" },
      { rotulo: "Afastados", valor: lista.filter(function (u) { return u.status !== "ativo"; }).length, modificador: "indicador--perigo", icone: "icone-relogio" },
      { rotulo: "Equipes", valor: estado.equipes.length, modificador: "", icone: "icone-caminhao" }
    ];
    var container = document.getElementById("usuarios-indicadores");
    if (!container) { return; }
    container.innerHTML = indicadores.map(function (item, indice) {
      return '<div class="card indicador ' + item.modificador + '">' +
        '<span class="indicador__icone">' + iconeSvg(item.icone) + "</span>" +
        '<span class="indicador__valor" id="usuarios-indicador-' + indice + '">0</span>' +
        '<span class="indicador__rotulo">' + item.rotulo + "</span></div>";
    }).join("");
    indicadores.forEach(function (item, indice) {
      animarContador(document.getElementById("usuarios-indicador-" + indice), item.valor);
    });
  }

  function linhaTabelaUsuario(u) {
    var equipe = buscarEquipe(u.equipeId);
    var ativo = u.status === "ativo";
    var seloStatus = ativo ? '<span class="selo selo--sucesso">' + iconeSvg("icone-check-circulo") + "Ativo</span>" : '<span class="selo selo--neutro">' + iconeSvg("icone-relogio") + "Afastado</span>";
    var celulaEquipe = equipe
      ? '<button type="button" class="tabela__link-equipe" data-acao="abrir-equipe" data-equipe-id="' + equipe.id + '">' + equipe.nome + "</button>"
      : '<span class="tx-muted">Sem equipe</span>';
    return '<tr tabindex="0" role="button" data-matricula="' + u.matricula + '" aria-label="Ver colaborador ' + u.nome + '">' +
      "<td>" + u.nome + "</td>" +
      "<td class=\"protocolo\">" + u.matricula + "</td>" +
      "<td>" + u.cargo + "</td>" +
      "<td>" + celulaEquipe + "</td>" +
      "<td>" + u.email + "</td>" +
      "<td>" + seloStatus + "</td>" +
      '<td class="tabela__acoes">' +
      '<button type="button" class="btn-icone--pequeno" data-acao="alternar-status-colaborador" data-matricula="' + u.matricula + '" title="' + (ativo ? "Afastar" : "Reativar") + '" aria-label="' + (ativo ? "Afastar" : "Reativar") + " " + u.nome + '">' + iconeSvg(ativo ? "icone-relogio" : "icone-check-circulo") + "</button>" +
      '<button type="button" class="btn-icone--pequeno btn-icone--perigo" data-acao="excluir-colaborador" data-matricula="' + u.matricula + '" title="Excluir colaborador" aria-label="Excluir ' + u.nome + '">' + iconeSvg("icone-lixeira") + "</button>" +
      "</td>" +
      "</tr>";
  }

  function renderizarUsuarios() {
    renderizarIndicadoresUsuarios();
    persistirEstado();

    var lista = filtrarPorBusca(estado.usuarios, estado.usuariosBusca, function (u) { return [u.nome, u.matricula, u.email, u.cargo]; });
    var corpo = document.getElementById("usuarios-tabela-corpo");
    var wrap = document.getElementById("usuarios-tabela-wrap");
    var vazio = document.getElementById("usuarios-estado-vazio");
    if (!corpo || !wrap || !vazio) { return; }

    if (lista.length === 0) {
      wrap.hidden = true;
      vazio.hidden = false;
      vazio.innerHTML = iconeSvg("icone-usuarios") +
        '<p class="estado-vazio__titulo">Nenhum colaborador encontrado</p>' +
        '<p class="estado-vazio__texto tx-body-sm">Tente outro termo de busca, ou cadastre um novo colaborador.</p>';
      document.getElementById("usuarios-paginacao").innerHTML = "";
      return;
    }

    wrap.hidden = false;
    vazio.hidden = true;
    var pagina = paginar(lista, estado.usuariosPagina, ITENS_POR_PAGINA);
    estado.usuariosPagina = pagina.pagina;
    corpo.innerHTML = pagina.itens.map(linhaTabelaUsuario).join("");
    renderizarPaginacao("usuarios-paginacao", pagina, function (delta) {
      estado.usuariosPagina += delta;
      renderizarUsuarios();
    });
  }

  function iniciaisDe(nome) {
    return nome.split(" ").map(function (p) { return p[0]; }).slice(0, 2).join("");
  }

  var elementoFocoAntesDoModal = null;

  function elementosFocaveisDoModal() {
    var seletor = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
    return Array.prototype.slice.call(elementos.modalDetalhe.querySelectorAll(seletor)).filter(function (el) {
      return el.offsetParent !== null;
    });
  }

  function abrirModal(titulo, corpoHtml) {
    elementoFocoAntesDoModal = document.activeElement;
    elementos.modalTitulo.textContent = titulo;
    elementos.modalCorpo.innerHTML = corpoHtml;
    elementos.modalDetalhe.hidden = false;
    elementos.modalTitulo.focus();
  }

  function fecharModal() {
    elementos.modalDetalhe.hidden = true;
    if (elementoFocoAntesDoModal && typeof elementoFocoAntesDoModal.focus === "function") {
      elementoFocoAntesDoModal.focus();
    }
    elementoFocoAntesDoModal = null;
  }

  function abrirConfirmacaoExclusao(titulo, mensagem, aoConfirmar) {
    var corpo = '<div class="aviso-linha aviso-linha--perigo">' + iconeSvg("icone-alerta") + '<p class="tx-body">' + mensagem + "</p></div>" +
      '<div class="formulario__acoes">' +
      '<button type="button" class="btn btn--secundario" data-acao="fechar-modal">Cancelar</button>' +
      '<button type="button" class="btn btn--perigo" id="botao-confirmar-exclusao">' + iconeSvg("icone-lixeira") + "Excluir</button>" +
      "</div>";
    abrirModal(titulo, corpo);
    document.getElementById("botao-confirmar-exclusao").addEventListener("click", function () {
      fecharModal();
      aoConfirmar();
    });
  }

  function confirmarExclusaoOcorrencia(protocolo) {
    var ocorrencia = estado.ocorrencias.filter(function (o) { return o.protocolo === protocolo; })[0];
    if (!ocorrencia) { return; }
    abrirConfirmacaoExclusao(
      "Excluir ocorrência",
      "Excluir a ocorrência " + protocolo + " (" + ocorrencia.tipo + ", " + ocorrencia.endereco + ")? Esta ação não pode ser desfeita nesta demonstração, a não ser reiniciando a demo.",
      function () { excluirOcorrencia(protocolo); }
    );
  }

  function excluirOcorrencia(protocolo) {
    estado.ocorrencias = estado.ocorrencias.filter(function (o) { return o.protocolo !== protocolo; });
    renderizarPainelCompleto();
    renderizarFiltrosMapa();
    renderizarMapa();
    persistirEstado();
    anunciar("Ocorrência " + protocolo + " excluída.");
  }

  function abrirModalColaborador(matricula) {
    var usuario = buscarUsuario(matricula);
    if (!usuario) { return; }
    var equipe = buscarEquipe(usuario.equipeId);
    var seloStatus = usuario.status === "ativo" ? '<span class="selo selo--sucesso">' + iconeSvg("icone-check-circulo") + "Ativo</span>" : '<span class="selo selo--neutro">' + iconeSvg("icone-relogio") + "Afastado</span>";
    var corpo = '<div class="linha-cabecalho-entidade">' +
      '<span class="avatar">' + iniciaisDe(usuario.nome) + "</span>" +
      "<div><p class=\"tx-body tx-forte\">" + usuario.cargo + "</p>" + seloStatus + "</div>" +
      "</div>" +
      '<div class="grade-leitura">' +
      '<div class="campo-leitura"><span class="campo-leitura__rotulo">Matrícula</span><span class="campo-leitura__valor">' + usuario.matricula + "</span></div>" +
      '<div class="campo-leitura"><span class="campo-leitura__rotulo">E-mail</span><span class="campo-leitura__valor">' + usuario.email + "</span></div>" +
      '<div class="campo-leitura"><span class="campo-leitura__rotulo">Telefone</span><span class="campo-leitura__valor">' + usuario.telefone + "</span></div>" +
      '<div class="campo-leitura"><span class="campo-leitura__rotulo">Equipe</span><span class="campo-leitura__valor">' +
      (equipe ? '<button type="button" class="tabela__link-equipe" data-acao="abrir-equipe" data-equipe-id="' + equipe.id + '">' + equipe.nome + "</button>" : "Sem equipe") +
      "</span></div>" +
      "</div>";
    abrirModal(usuario.nome, corpo);
  }

  function abrirModalEquipe(equipeId) {
    var equipe = buscarEquipe(equipeId);
    if (!equipe) { return; }
    var membros = estado.usuarios.filter(function (u) { return u.equipeId === equipeId; });
    var situacao = equipe.status === "em_campo" ? "Em campo" : "Disponível";
    var corpoMembros = membros.map(function (u) {
      return '<button type="button" class="modal__membro" data-acao="abrir-colaborador" data-matricula="' + u.matricula + '">' +
        '<span class="avatar avatar--pequeno">' + iniciaisDe(u.nome) + "</span>" +
        "<span><span class=\"tx-body tx-forte\">" + u.nome + "</span><br><span class=\"tx-body-sm tx-muted\">" + u.cargo + "</span></span>" +
        "</button>";
    }).join("");
    var corpo = '<div class="mb-0"><button type="button" class="btn btn--secundario btn--pequeno" id="botao-editar-equipe">' + iconeSvg("icone-prancheta") + "Editar equipe</button></div>" +
      '<div class="grade-leitura">' +
      '<div class="campo-leitura"><span class="campo-leitura__rotulo">Especialidade</span><span class="campo-leitura__valor">' + equipe.especialidade + "</span></div>" +
      '<div class="campo-leitura"><span class="campo-leitura__rotulo">Situação</span><span class="campo-leitura__valor">' + situacao + "</span></div>" +
      "</div>" +
      '<div><p class="modal__secao-titulo">Integrantes</p><div class="modal__lista-membros">' + (corpoMembros || '<p class="tx-body-sm tx-muted">Nenhum colaborador nesta equipe ainda.</p>') + "</div></div>";
    abrirModal(equipe.nome, corpo);
    document.getElementById("botao-editar-equipe").addEventListener("click", function () { abrirModalEdicaoEquipe(equipeId); });
  }

  var STATUS_EQUIPE_OPCOES = [{ valor: "disponivel", rotulo: "Disponível" }, { valor: "em_campo", rotulo: "Em campo" }];

  function opcoesStatusEquipeHtml(statusAtual) {
    return STATUS_EQUIPE_OPCOES.map(function (op) {
      return '<option value="' + op.valor + '"' + (op.valor === statusAtual ? " selected" : "") + ">" + op.rotulo + "</option>";
    }).join("");
  }

  function abrirModalCadastroEquipe() {
    var corpo = '<form id="form-cadastro-equipe" novalidate>' +
      campoTexto("equipe-nome", "Nome da equipe") +
      campoTexto("equipe-especialidade", "Especialidade") +
      '<div class="campo" id="campo-equipe-status">' +
      '<label class="campo__rotulo" for="equipe-status">Situação inicial</label>' +
      '<select class="selecao" id="equipe-status">' + opcoesStatusEquipeHtml("disponivel") + "</select>" +
      "</div>" +
      '<div class="formulario__acoes"><button type="submit" class="btn btn--primario">Criar equipe</button></div>' +
      "</form>";
    abrirModal("Nova equipe", corpo);
    document.getElementById("form-cadastro-equipe").addEventListener("submit", enviarCadastroEquipe);
  }

  function gerarIdEquipe(nome) {
    var base = normalizarTexto(nome).replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") || "equipe";
    var id = base;
    var contador = 2;
    while (buscarEquipe(id)) { id = base + "-" + contador; contador++; }
    return id;
  }

  function enviarCadastroEquipe(evento) {
    evento.preventDefault();
    var nome = document.getElementById("equipe-nome").value.trim();
    var especialidade = document.getElementById("equipe-especialidade").value.trim();
    var status = document.getElementById("equipe-status").value;

    var valido = true;
    [["equipe-nome", nome, "Informe o nome da equipe."], ["equipe-especialidade", especialidade, "Informe a especialidade."]].forEach(function (par) {
      if (!par[1]) { marcarErroCampo(par[0], par[2]); valido = false; } else { limparErroCampo(par[0]); }
    });
    if (!valido) {
      var primeiroInvalido = document.querySelector("#form-cadastro-equipe .campo--invalido .entrada");
      if (primeiroInvalido) { primeiroInvalido.focus(); }
      return;
    }

    estado.equipes.push({ id: gerarIdEquipe(nome), nome: nome, especialidade: especialidade, status: status, membros: [] });
    fecharModal();
    renderizarConfiguracoes();
    persistirEstado();
    anunciar("Equipe " + nome + " criada.");
  }

  function abrirModalEdicaoEquipe(equipeId) {
    var equipe = buscarEquipe(equipeId);
    if (!equipe) { return; }
    var corpo = '<form id="form-edicao-equipe" novalidate>' +
      campoTexto("equipe-edit-nome", "Nome da equipe") +
      campoTexto("equipe-edit-especialidade", "Especialidade") +
      '<div class="campo" id="campo-equipe-edit-status">' +
      '<label class="campo__rotulo" for="equipe-edit-status">Situação</label>' +
      '<select class="selecao" id="equipe-edit-status">' + opcoesStatusEquipeHtml(equipe.status) + "</select>" +
      "</div>" +
      '<div class="formulario__acoes">' +
      '<button type="button" class="btn btn--secundario" id="botao-cancelar-edicao-equipe">Cancelar</button>' +
      '<button type="submit" class="btn btn--primario">Salvar alterações</button>' +
      "</div>" +
      "</form>";
    abrirModal("Editar equipe", corpo);
    document.getElementById("equipe-edit-nome").value = equipe.nome;
    document.getElementById("equipe-edit-especialidade").value = equipe.especialidade;
    document.getElementById("botao-cancelar-edicao-equipe").addEventListener("click", function () { abrirModalEquipe(equipeId); });
    document.getElementById("form-edicao-equipe").addEventListener("submit", function (evento) { enviarEdicaoEquipe(evento, equipeId); });
  }

  function enviarEdicaoEquipe(evento, equipeId) {
    evento.preventDefault();
    var equipe = buscarEquipe(equipeId);
    if (!equipe) { return; }
    var nome = document.getElementById("equipe-edit-nome").value.trim();
    var especialidade = document.getElementById("equipe-edit-especialidade").value.trim();
    var status = document.getElementById("equipe-edit-status").value;

    var valido = true;
    [["equipe-edit-nome", nome, "Informe o nome da equipe."], ["equipe-edit-especialidade", especialidade, "Informe a especialidade."]].forEach(function (par) {
      if (!par[1]) { marcarErroCampo(par[0], par[2]); valido = false; } else { limparErroCampo(par[0]); }
    });
    if (!valido) { return; }

    equipe.nome = nome;
    equipe.especialidade = especialidade;
    equipe.status = status;
    fecharModal();
    renderizarConfiguracoes();
    renderizarUsuarios();
    persistirEstado();
    anunciar("Equipe " + nome + " atualizada.");
  }

  function alternarStatusColaborador(matricula) {
    var usuario = buscarUsuario(matricula);
    if (!usuario) { return; }
    usuario.status = usuario.status === "ativo" ? "afastado" : "ativo";
    renderizarUsuarios();
    anunciar(usuario.nome + " agora está " + (usuario.status === "ativo" ? "ativo" : "afastado") + ".");
  }

  function confirmarExclusaoColaborador(matricula) {
    var usuario = buscarUsuario(matricula);
    if (!usuario) { return; }
    abrirConfirmacaoExclusao(
      "Excluir colaborador",
      "Excluir " + usuario.nome + " (" + usuario.matricula + ")? Esta ação não pode ser desfeita nesta demonstração, a não ser reiniciando a demo.",
      function () { excluirColaborador(matricula); }
    );
  }

  function excluirColaborador(matricula) {
    var usuario = buscarUsuario(matricula);
    if (!usuario) { return; }
    var equipe = buscarEquipe(usuario.equipeId);
    if (equipe) {
      equipe.membros = equipe.membros.filter(function (nome) { return nome !== usuario.nome; });
    }
    estado.usuarios = estado.usuarios.filter(function (u) { return u.matricula !== matricula; });
    renderizarUsuarios();
    renderizarConfiguracoes();
    anunciar("Colaborador " + usuario.nome + " excluído.");
  }

  var CARGOS_CADASTRO = ["Coordenador de Defesa Civil", "Administrador da organização", "Operador de plantão", "Agente de campo"];

  function abrirModalCadastroUsuario() {
    var equipes = estado.equipes;
    var opcoesCargo = CARGOS_CADASTRO.map(function (c) { return '<option value="' + c + '">' + c + "</option>"; }).join("");
    var opcoesEquipe = equipes.map(function (eq) { return '<option value="' + eq.id + '">' + eq.nome + "</option>"; }).join("");
    var corpo = '<form id="form-cadastro-usuario" novalidate>' +
      campoTexto("cadastro-nome", "Nome completo") +
      campoSelecao("cadastro-cargo", "Cargo", opcoesCargo) +
      campoSelecao("cadastro-equipe", "Equipe (opcional)", opcoesEquipe) +
      campoTexto("cadastro-email", "E-mail funcional") +
      campoTexto("cadastro-telefone", "Telefone") +
      '<div class="formulario__acoes">' +
      '<button type="submit" class="btn btn--primario">Cadastrar colaborador</button>' +
      "</div>" +
      "</form>";
    abrirModal("Novo colaborador", corpo);
    document.getElementById("form-cadastro-usuario").addEventListener("submit", enviarCadastroUsuario);
  }

  function enviarCadastroUsuario(evento) {
    evento.preventDefault();
    var nome = document.getElementById("cadastro-nome").value.trim();
    var cargo = document.getElementById("cadastro-cargo").value;
    var equipeId = document.getElementById("cadastro-equipe").value || null;
    var email = document.getElementById("cadastro-email").value.trim();
    var telefone = document.getElementById("cadastro-telefone").value.trim();

    var valido = true;
    [
      ["cadastro-nome", nome, "Informe o nome completo."],
      ["cadastro-cargo", cargo, "Escolha o cargo."],
      ["cadastro-email", email, "Informe o e-mail funcional."],
      ["cadastro-telefone", telefone, "Informe o telefone."]
    ].forEach(function (par) {
      if (!par[1]) { marcarErroCampo(par[0], par[2]); valido = false; }
      else { limparErroCampo(par[0]); }
    });
    if (!valido) {
      var primeiroInvalido = document.querySelector("#form-cadastro-usuario .campo--invalido .entrada, #form-cadastro-usuario .campo--invalido .selecao");
      if (primeiroInvalido) { primeiroInvalido.focus(); }
      return;
    }

    var matricula = gerarMatriculaFuncional();
    estado.usuarios.push({
      nome: nome, matricula: matricula, cargo: cargo,
      perfil: cargo === "Agente de campo" ? "agente-campo" : (cargo === "Operador de plantão" ? "operador" : "coordenador"),
      equipeId: equipeId, status: "ativo", email: email, telefone: telefone
    });
    if (equipeId) {
      var equipe = buscarEquipe(equipeId);
      if (equipe) { equipe.membros.push(nome); }
    }
    fecharModal();
    estado.usuariosBusca = "";
    var campoBusca = document.getElementById("usuarios-busca");
    if (campoBusca) { campoBusca.value = ""; }
    estado.usuariosPagina = Math.ceil(estado.usuarios.length / ITENS_POR_PAGINA);
    renderizarUsuarios();
    renderizarConfiguracoes();
    destacarNovaLinhaUsuario(matricula);
  }

  function gerarMatriculaFuncional() {
    var maior = estado.usuarios.reduce(function (max, u) {
      var numero = parseInt(u.matricula.replace(/\D/g, ""), 10);
      return isNaN(numero) ? max : Math.max(max, numero);
    }, 0);
    return "DC-" + String(maior + 1).padStart(4, "0");
  }

  function destacarNovaLinhaUsuario(matricula) {
    var linha = document.querySelector('#usuarios-conteudo tr[data-matricula="' + matricula + '"]');
    if (linha) { linha.classList.add("linha--nova"); }
  }

  function inicializar() {
    elementos.navTelas = document.getElementById("nav-telas");
    elementos.barraLateral = document.getElementById("barra-lateral");
    elementos.seletorPerfil = document.getElementById("seletor-perfil");
    elementos.botaoTema = document.getElementById("botao-tema");
    elementos.botaoTemaLogin = document.getElementById("botao-tema-login");
    elementos.anunciador = document.getElementById("anunciador");
    elementos.marca = document.querySelector('[data-acao="ir-painel"]');

    elementos.detalheVoltar = document.getElementById("detalhe-voltar");
    elementos.painelTabelaCorpo = document.getElementById("painel-tabela-corpo");
    elementos.botaoAvatar = document.getElementById("botao-avatar");
    elementos.avatarIniciais = document.getElementById("avatar-iniciais");
    elementos.avatarRotulo = document.getElementById("avatar-rotulo");
    elementos.modalDetalhe = document.getElementById("modal-detalhe");
    elementos.modalTitulo = document.getElementById("modal-detalhe-titulo");
    elementos.modalCorpo = document.getElementById("modal-detalhe-corpo");

    var estadoSalvo = carregarEstadoPersistido();
    if (estadoSalvo) {
      estado.ocorrencias = estadoSalvo.ocorrencias;
      estado.usuarios = estadoSalvo.usuarios;
      estado.equipes = estadoSalvo.equipes;
      estado.filaSincronizacao = estadoSalvo.filaSincronizacao;
      estado.conectividade = estadoSalvo.conectividade;
    } else {
      estado.ocorrencias = prepararOcorrencias();
      estado.usuarios = prepararUsuarios();
      estado.equipes = prepararEquipes();
    }

    aplicarTema(temaInicial(), { semPersistir: true });
    trocarPerfil(estado.perfil);

    var botaoAlternarLateralInicial = document.getElementById("botao-alternar-lateral");
    try {
      if (window.localStorage.getItem(CHAVE_LATERAL_RECOLHIDA) === "1") {
        document.body.classList.add("lateral-recolhida");
        if (botaoAlternarLateralInicial) { botaoAlternarLateralInicial.setAttribute("aria-expanded", "false"); }
      }
    } catch (erro) { /* segue com a lateral aberta */ }

    var jaAutenticado = false;
    try { jaAutenticado = window.sessionStorage.getItem(CHAVE_LOGIN_SESSAO) === "1"; } catch (erro) { /* segue deslogado */ }
    if (jaAutenticado) { document.body.classList.add("autenticado"); }

    renderizarPainelCompleto();
    renderizarFiltrosMapa();
    renderizarMapa();
    renderizarConfiguracoes();
    renderizarUsuarios();
    renderizarAbertura();
    renderizarTriagem();
    atualizarIndicadorConectividade();
    renderizarListaTarefas();

    elementos.seletorPerfil.addEventListener("change", function (evento) {
      trocarPerfil(evento.target.value);
    });

    elementos.botaoTema.addEventListener("click", function () {
      aplicarTema(estado.tema === "escuro" ? "claro" : "escuro");
    });
    if (elementos.botaoTemaLogin) {
      elementos.botaoTemaLogin.addEventListener("click", function () {
        aplicarTema(estado.tema === "escuro" ? "claro" : "escuro");
      });
    }

    var botaoAlternarLateral = document.getElementById("botao-alternar-lateral");
    botaoAlternarLateral.addEventListener("click", function () {
      var recolhida = document.body.classList.toggle("lateral-recolhida");
      botaoAlternarLateral.setAttribute("aria-expanded", recolhida ? "false" : "true");
      try { window.localStorage.setItem(CHAVE_LATERAL_RECOLHIDA, recolhida ? "1" : "0"); } catch (erro) { /* segue sem persistir */ }
    });

    document.getElementById("botao-reiniciar-rapido").addEventListener("click", reiniciarDemo);
    document.getElementById("botao-sair-rapido").addEventListener("click", function () { sairDaSessao(); });

    var botaoNotificacoes = document.getElementById("botao-notificacoes");
    var painelNotificacoes = document.getElementById("notificacoes-painel");
    function fecharNotificacoes() {
      painelNotificacoes.hidden = true;
      botaoNotificacoes.setAttribute("aria-expanded", "false");
    }
    function abrirNotificacoes() {
      painelNotificacoes.hidden = false;
      botaoNotificacoes.setAttribute("aria-expanded", "true");
    }
    botaoNotificacoes.addEventListener("click", function (evento) {
      evento.stopPropagation();
      if (painelNotificacoes.hidden) { abrirNotificacoes(); } else { fecharNotificacoes(); }
    });
    painelNotificacoes.addEventListener("click", function (evento) {
      var item = evento.target.closest("[data-protocolo]");
      if (!item) { return; }
      fecharNotificacoes();
      trocarPerfil("coordenador");
      abrirDetalhe(item.dataset.protocolo);
    });
    document.addEventListener("click", function (evento) {
      if (!painelNotificacoes.hidden && !painelNotificacoes.contains(evento.target) && evento.target !== botaoNotificacoes && !botaoNotificacoes.contains(evento.target)) {
        fecharNotificacoes();
      }
    });

    var campoBuscaGlobal = document.getElementById("busca-global");
    var painelBuscaGlobal = document.getElementById("busca-global-resultados");
    function fecharBuscaGlobal() { painelBuscaGlobal.hidden = true; }
    campoBuscaGlobal.addEventListener("input", function () {
      renderizarResultadosBuscaGlobal(campoBuscaGlobal.value);
    });
    campoBuscaGlobal.addEventListener("focus", function () {
      if (campoBuscaGlobal.value.trim()) { renderizarResultadosBuscaGlobal(campoBuscaGlobal.value); }
    });
    painelBuscaGlobal.addEventListener("click", function (evento) {
      var item = evento.target.closest(".cabecalho__busca-resultado");
      if (!item) { return; }
      fecharBuscaGlobal();
      campoBuscaGlobal.value = "";
      trocarPerfil("coordenador");
      if (item.dataset.tipo === "ocorrencia") {
        abrirDetalhe(item.dataset.protocolo);
      } else {
        mostrarTela("coordenador", "usuarios", { moverFoco: false });
        abrirModalColaborador(item.dataset.matricula);
      }
    });
    document.addEventListener("click", function (evento) {
      if (!painelBuscaGlobal.hidden && !painelBuscaGlobal.contains(evento.target) && !campoBuscaGlobal.contains(evento.target)) {
        fecharBuscaGlobal();
      }
    });

    document.addEventListener("keydown", function (evento) {
      if ((evento.ctrlKey || evento.metaKey) && evento.key.toLowerCase() === "k") {
        evento.preventDefault();
        campoBuscaGlobal.focus();
        campoBuscaGlobal.select();
      }
      if (evento.key === "Escape" && !painelNotificacoes.hidden) {
        fecharNotificacoes();
        botaoNotificacoes.focus();
      }
      if (evento.key === "Escape" && !painelBuscaGlobal.hidden) {
        fecharBuscaGlobal();
        campoBuscaGlobal.blur();
      }
      if (evento.key === "Escape" && !elementos.modalDetalhe.hidden) {
        fecharModal();
      }
    });

    function atualizarRelogioCabecalho() {
      var relogio = document.getElementById("cabecalho-relogio");
      if (!relogio) { return; }
      relogio.textContent = new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
    }
    atualizarRelogioCabecalho();
    window.setInterval(atualizarRelogioCabecalho, 30000);

    elementos.modalDetalhe.addEventListener("click", function (evento) {
      if (evento.target.closest('[data-acao="fechar-modal"]')) { fecharModal(); return; }
      var botaoEquipe = evento.target.closest('[data-acao="abrir-equipe"]');
      if (botaoEquipe) { abrirModalEquipe(botaoEquipe.dataset.equipeId); return; }
      var botaoColaborador = evento.target.closest('[data-acao="abrir-colaborador"]');
      if (botaoColaborador) { abrirModalColaborador(botaoColaborador.dataset.matricula); }
    });

    elementos.modalDetalhe.addEventListener("keydown", function (evento) {
      if (evento.key !== "Tab") { return; }
      var focaveis = elementosFocaveisDoModal();
      if (focaveis.length === 0) { return; }
      var primeiro = focaveis[0];
      var ultimo = focaveis[focaveis.length - 1];
      var foraDaLista = focaveis.indexOf(document.activeElement) === -1;
      if (evento.shiftKey && (document.activeElement === primeiro || foraDaLista)) {
        evento.preventDefault();
        ultimo.focus();
      } else if (!evento.shiftKey && document.activeElement === ultimo) {
        evento.preventDefault();
        primeiro.focus();
      }
    });

    var usuariosConteudo = document.getElementById("usuarios-conteudo");
    usuariosConteudo.addEventListener("click", function (evento) {
      var botaoEquipe = evento.target.closest('[data-acao="abrir-equipe"]');
      if (botaoEquipe) { abrirModalEquipe(botaoEquipe.dataset.equipeId); return; }
      var botaoExcluir = evento.target.closest('[data-acao="excluir-colaborador"]');
      if (botaoExcluir) { confirmarExclusaoColaborador(botaoExcluir.dataset.matricula); return; }
      var botaoStatus = evento.target.closest('[data-acao="alternar-status-colaborador"]');
      if (botaoStatus) { alternarStatusColaborador(botaoStatus.dataset.matricula); return; }
      var linha = evento.target.closest("tr[data-matricula]");
      if (linha) { abrirModalColaborador(linha.dataset.matricula); }
    });
    usuariosConteudo.addEventListener("keydown", function (evento) {
      if (evento.key !== "Enter" && evento.key !== " ") { return; }
      if (evento.target.closest('[data-acao="abrir-equipe"], [data-acao="excluir-colaborador"], [data-acao="alternar-status-colaborador"]')) { return; }
      var linha = evento.target.closest("tr[data-matricula]");
      if (linha) { evento.preventDefault(); abrirModalColaborador(linha.dataset.matricula); }
    });
    var usuariosBuscaCampoInicial = document.getElementById("usuarios-busca");
    if (usuariosBuscaCampoInicial) {
      usuariosBuscaCampoInicial.addEventListener("input", function () {
        estado.usuariosBusca = usuariosBuscaCampoInicial.value;
        estado.usuariosPagina = 1;
        renderizarUsuarios();
      });
    }
    document.getElementById("botao-novo-colaborador").addEventListener("click", abrirModalCadastroUsuario);

    var configuracoesConteudo = document.getElementById("configuracoes-conteudo");
    configuracoesConteudo.addEventListener("click", function (evento) {
      var cartao = evento.target.closest('[data-acao="abrir-equipe"]');
      if (cartao) { abrirModalEquipe(cartao.dataset.equipeId); }
    });
    configuracoesConteudo.addEventListener("keydown", function (evento) {
      if (evento.key !== "Enter" && evento.key !== " ") { return; }
      var cartao = evento.target.closest('[data-acao="abrir-equipe"]');
      if (cartao) { evento.preventDefault(); abrirModalEquipe(cartao.dataset.equipeId); }
    });


    function sairDaSessao() {
      try { window.sessionStorage.removeItem(CHAVE_LOGIN_SESSAO); } catch (erro) { /* segue */ }
      document.body.classList.remove("autenticado");
      var formLogin = document.getElementById("form-login");
      if (formLogin) { formLogin.reset(); }
      var campoUsuario = document.getElementById("login-usuario");
      if (campoUsuario) { campoUsuario.focus(); }
    }

    var rodapeItemReiniciar = document.getElementById("rodape-item-reiniciar");
    if (rodapeItemReiniciar) { rodapeItemReiniciar.addEventListener("click", reiniciarDemo); }
    var rodapeItemSair = document.getElementById("rodape-item-sair");
    if (rodapeItemSair) { rodapeItemSair.addEventListener("click", sairDaSessao); }

    function entrarComoPerfil(perfilEscolhido) {
      try { window.sessionStorage.setItem(CHAVE_LOGIN_SESSAO, "1"); } catch (erro) { /* segue sem persistir */ }
      document.body.classList.add("autenticado");
      elementos.seletorPerfil.value = perfilEscolhido;
      trocarPerfil(perfilEscolhido);
      mostrarTela(perfilEscolhido, TELA_INICIAL_POR_PERFIL[perfilEscolhido], { moverFoco: true });
      anunciar("Sessão iniciada como " + perfilEscolhido + ".");
    }

    document.getElementById("form-login").addEventListener("submit", function (evento) {
      evento.preventDefault();
      var usuario = document.getElementById("login-usuario").value.trim();
      var senha = document.getElementById("login-senha").value.trim();
      var valido = true;
      if (!usuario) { marcarErroCampo("login-usuario", "Informe o usuário ou e-mail."); valido = false; } else { limparErroCampo("login-usuario"); }
      if (!senha) { marcarErroCampo("login-senha", "Informe a senha."); valido = false; } else { limparErroCampo("login-senha"); }
      if (!valido) { return; }

      var perfilRadio = document.querySelector('input[name="login-perfil"]:checked');
      entrarComoPerfil(perfilRadio ? perfilRadio.value : "coordenador");
    });

    var botaoEntradaRapida = document.getElementById("botao-entrada-rapida");
    if (botaoEntradaRapida) {
      botaoEntradaRapida.addEventListener("click", function () {
        var perfilRadio = document.querySelector('input[name="login-perfil"]:checked');
        entrarComoPerfil(perfilRadio ? perfilRadio.value : "coordenador");
      });
    }

    var botaoAlternarSenha = document.getElementById("botao-alternar-senha");
    botaoAlternarSenha.addEventListener("click", function () {
      var campoSenha = document.getElementById("login-senha");
      var mostrando = campoSenha.type === "text";
      campoSenha.type = mostrando ? "password" : "text";
      botaoAlternarSenha.setAttribute("aria-pressed", mostrando ? "false" : "true");
      botaoAlternarSenha.setAttribute("aria-label", mostrando ? "Mostrar senha" : "Ocultar senha");
      botaoAlternarSenha.innerHTML = iconeSvg(mostrando ? "icone-olho" : "icone-olho-fechado");
    });

    document.getElementById("aba-campo-tarefas").addEventListener("click", function () {
      estado.campoAba = "tarefas";
      if (estado.campoSubtela === "lista-filtrada") { estado.campoSubtela = "lista"; estado.campoFiltroLista = null; }
      this.setAttribute("aria-selected", "true");
      document.getElementById("aba-campo-perfil").setAttribute("aria-selected", "false");
      renderizarListaTarefas();
    });
    document.getElementById("aba-campo-perfil").addEventListener("click", function () {
      estado.campoAba = "perfil";
      if (estado.campoSubtela === "lista-filtrada") { estado.campoSubtela = "lista"; estado.campoFiltroLista = null; }
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

    document.querySelectorAll('[data-acao="voltar-detalhe"]').forEach(function (botao) {
      botao.addEventListener("click", function () {
        mostrarTela("coordenador", "detalhe", { moverFoco: true });
        renderizarDetalhe();
      });
    });

    document.querySelectorAll('[data-acao="imprimir-documento"]').forEach(function (botao) {
      botao.addEventListener("click", function () { window.print(); });
    });

    document.querySelectorAll('[data-acao="ir-tela"]').forEach(function (botao) {
      botao.addEventListener("click", function () {
        mostrarTela("coordenador", botao.dataset.telaDestino, { moverFoco: true });
      });
    });

    elementos.painelTabelaCorpo.addEventListener("click", function (evento) {
      var botaoExcluir = evento.target.closest('[data-acao="excluir-ocorrencia"]');
      if (botaoExcluir) { confirmarExclusaoOcorrencia(botaoExcluir.dataset.protocolo); return; }
      var linha = evento.target.closest("tr[data-protocolo]");
      if (linha) { abrirDetalhe(linha.dataset.protocolo); }
    });

    elementos.painelTabelaCorpo.addEventListener("keydown", function (evento) {
      if (evento.key !== "Enter" && evento.key !== " ") { return; }
      if (evento.target.closest('[data-acao="excluir-ocorrencia"]')) { return; }
      var linha = evento.target.closest("tr[data-protocolo]");
      if (linha) { evento.preventDefault(); abrirDetalhe(linha.dataset.protocolo); }
    });

    var painelBuscaCampoInicial = document.getElementById("painel-busca");
    if (painelBuscaCampoInicial) {
      painelBuscaCampoInicial.addEventListener("input", function () {
        estado.painelBusca = painelBuscaCampoInicial.value;
        estado.painelPagina = 1;
        renderizarTabelaPainel();
      });
    }

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

    var nivelZoomMapa = 1;
    var mapaLienzoEl = document.getElementById("mapa-lienzo");
    function aplicarZoomMapa() {
      mapaLienzoEl.style.transform = "scale(" + nivelZoomMapa + ")";
    }
    document.getElementById("mapa-zoom-mais").addEventListener("click", function () {
      nivelZoomMapa = Math.min(nivelZoomMapa + 0.25, 2);
      aplicarZoomMapa();
    });
    document.getElementById("mapa-zoom-menos").addEventListener("click", function () {
      nivelZoomMapa = Math.max(nivelZoomMapa - 0.25, 1);
      aplicarZoomMapa();
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

  /* O navegador pode restaurar a página a partir do cache de navegação
     (voltar/avançar, ou reabertura de sessão) sem reexecutar este script,
     preservando estado de validação de uma tentativa de envio anterior.
     Aqui o formulário de login sempre volta limpo nesse caso. */
  window.addEventListener("pageshow", function (evento) {
    if (!evento.persisted) { return; }
    var formLogin = document.getElementById("form-login");
    if (formLogin) { formLogin.reset(); }
    document.querySelectorAll("#form-login .campo--invalido").forEach(function (campo) {
      campo.classList.remove("campo--invalido");
    });
    document.querySelectorAll("#form-login .campo__erro").forEach(function (erro) { erro.hidden = true; });
  });
})();
