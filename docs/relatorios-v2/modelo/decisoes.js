/* Respostas da página /progresso/decisoes: marcar, salvar no navegador e gerar o relatório em texto.
   Sem servidor: as respostas ficam em localStorage deste navegador (se ele bloquear, a página continua
   funcionando, só não lembra). O relatório é para copiar e colar no chat. */
(function () {
  var CHAVE = "dc360-decisoes-v1";

  function doisDigitos(n) {
    return (n < 10 ? "0" : "") + n;
  }

  function dataHora(d) {
    return doisDigitos(d.getDate()) + "/" + doisDigitos(d.getMonth() + 1) + "/" + d.getFullYear() + " " + doisDigitos(d.getHours()) + ":" + doisDigitos(d.getMinutes());
  }

  /* itens: [{ codigo, curto, tipo: "decisao" | "conferencia", opcoes: [{ valor, rotulo }] }]
     estado: { H44: { v: ["A"], nota: "..." } } */
  function gerarTexto(itens, estado, agora, posicao) {
    var respondidos = { decisao: [], conferencia: [] };
    var soNota = [];
    var semResposta = [];
    var totais = { decisao: 0, conferencia: 0 };
    itens.forEach(function (item) {
      totais[item.tipo] += 1;
      var e = estado[item.codigo] || {};
      var valores = e.v || [];
      var nota = (e.nota || "").replace(/\s+$/g, "").replace(/^\s+/g, "");
      if (valores.length === 0 && !nota) {
        semResposta.push(item.codigo + " (" + item.curto + ")");
        return;
      }
      if (valores.length === 0) {
        soNota.push("- " + item.codigo + " · " + item.curto + ": nenhuma opção marcada." + "\n  Observação: " + nota);
        return;
      }
      var temOutra = item.tipo === "decisao" && valores.indexOf("outra") !== -1;
      var recuar = function (texto) { return texto.split("\n").join("\n  "); };
      var rotulos = valores.map(function (v) {
        if (v === "outra") return "Outra decisão" + (nota ? ": " + recuar(nota) : " (sem texto)");
        var op = item.opcoes.filter(function (o) { return o.valor === v; })[0];
        return op ? (item.tipo === "decisao" ? v + ". " + op.rotulo : op.rotulo.toUpperCase()) : v;
      });
      var linha = "- " + item.codigo + " · " + item.curto + ": " + rotulos.join(" + ");
      if (nota && !temOutra) linha += "\n  " + (item.tipo === "conferencia" ? "Motivo ou observação: " : "Observação: ") + recuar(nota);
      respondidos[item.tipo].push(linha);
    });
    var partes = [
      "RELATÓRIO DE DECISÕES E CONFERÊNCIAS, Defesa Civil 360",
      "Gerado em " + dataHora(agora) + ", a partir da página na posição de " + posicao + ".",
      "",
      "DECISÕES TOMADAS (" + respondidos.decisao.length + " de " + totais.decisao + ")",
      respondidos.decisao.length ? respondidos.decisao.join("\n") : "- nenhuma",
      "",
      "CONFERÊNCIAS (" + respondidos.conferencia.length + " de " + totais.conferencia + ")",
      respondidos.conferencia.length ? respondidos.conferencia.join("\n") : "- nenhuma",
    ];
    if (soNota.length) partes.push("", "SÓ COM OBSERVAÇÃO (" + soNota.length + ")", soNota.join("\n"));
    partes.push("", "SEM RESPOSTA (" + semResposta.length + ")", semResposta.length ? semResposta.join("; ") : "nenhuma");
    return partes.join("\n");
  }

  if (typeof module !== "undefined" && module.exports) {
    module.exports = { gerarTexto: gerarTexto };
    return;
  }

  /* ---------- navegador ---------- */

  function lerEstado() {
    try {
      return JSON.parse(localStorage.getItem(CHAVE) || "{}") || {};
    } catch (e) {
      return {};
    }
  }

  function gravarEstado(estado) {
    try {
      localStorage.setItem(CHAVE, JSON.stringify(estado));
    } catch (e) {
      /* navegador sem armazenamento: segue sem lembrar */
    }
  }

  function iniciar() {
    var cartoes = Array.prototype.slice.call(document.querySelectorAll("[data-resp]"));
    var estado = lerEstado();
    var saida = document.getElementById("relatorio-saida");
    var aviso = document.getElementById("relatorio-aviso");
    var marcador = document.querySelector("[data-posicao]");
    var posicao = marcador ? marcador.getAttribute("data-posicao") : "";

    function itensDaPagina() {
      return cartoes.map(function (c) {
        var entradas = Array.prototype.slice.call(c.querySelectorAll("input[data-valor]"));
        return {
          codigo: c.getAttribute("data-resp"),
          curto: c.getAttribute("data-curto"),
          tipo: c.getAttribute("data-tipo"),
          opcoes: entradas.map(function (i) { return { valor: i.value, rotulo: i.getAttribute("data-rotulo") }; }),
        };
      });
    }

    function dizer(texto) {
      if (aviso) aviso.textContent = texto;
    }

    function marcarChip(codigo, respondido) {
      var chip = document.querySelector('a.chip[href="#' + codigo + '"]');
      if (chip) chip.classList.toggle("ok", respondido);
    }

    function atualizarContador() {
      var feitos = cartoes.filter(function (c) {
        var e = estado[c.getAttribute("data-resp")] || {};
        return (e.v && e.v.length) || e.nota;
      }).length;
      var alvo = document.querySelectorAll("[data-contador]");
      Array.prototype.forEach.call(alvo, function (el) {
        el.textContent = feitos + " de " + cartoes.length;
      });
    }

    function pintarCartao(c) {
      var codigo = c.getAttribute("data-resp");
      var e = estado[codigo] || {};
      Array.prototype.forEach.call(c.querySelectorAll("input[data-valor]"), function (i) {
        i.checked = (e.v || []).indexOf(i.value) !== -1;
      });
      var nota = c.querySelector("textarea");
      if (nota && nota.value !== (e.nota || "")) nota.value = e.nota || "";
      c.classList.toggle("respondido", Boolean((e.v && e.v.length) || e.nota));
      marcarChip(codigo, Boolean((e.v && e.v.length) || e.nota));
    }

    function lerCartao(c) {
      var v = [];
      Array.prototype.forEach.call(c.querySelectorAll("input[data-valor]"), function (i) {
        if (i.checked) v.push(i.value);
      });
      var nota = c.querySelector("textarea");
      return { v: v, nota: nota ? nota.value : "" };
    }

    cartoes.forEach(function (c) {
      var codigo = c.getAttribute("data-resp");
      pintarCartao(c);
      c.addEventListener("change", function () {
        estado[codigo] = lerCartao(c);
        gravarEstado(estado);
        pintarCartao(c);
        atualizarContador();
      });
      c.addEventListener("input", function (ev) {
        if (ev.target && ev.target.tagName === "TEXTAREA") {
          var outra = c.querySelector('input[data-valor][value="outra"]');
          if (outra) outra.checked = ev.target.value.trim() !== "";
          estado[codigo] = lerCartao(c);
          gravarEstado(estado);
          c.classList.toggle("respondido", Boolean((estado[codigo].v && estado[codigo].v.length) || estado[codigo].nota));
          marcarChip(codigo, Boolean((estado[codigo].v && estado[codigo].v.length) || estado[codigo].nota));
          atualizarContador();
        }
      });
      var limpar = c.querySelector("[data-limpar]");
      if (limpar) {
        limpar.addEventListener("click", function () {
          delete estado[codigo];
          gravarEstado(estado);
          pintarCartao(c);
          atualizarContador();
        });
      }
    });
    atualizarContador();

    var botaoGerar = document.getElementById("btn-gerar");
    if (botaoGerar) {
      botaoGerar.addEventListener("click", function () {
        saida.value = gerarTexto(itensDaPagina(), estado, new Date(), posicao);
        saida.hidden = false;
        saida.rows = Math.min(30, saida.value.split("\n").length + 1);
        saida.focus();
        saida.select();
        dizer("Relatório gerado. Use o botão Copiar e cole no chat.");
      });
    }

    var botaoCopiar = document.getElementById("btn-copiar");
    if (botaoCopiar) {
      botaoCopiar.addEventListener("click", function () {
        if (saida.hidden || !saida.value) botaoGerar.click();
        var texto = saida.value;
        function aoCopiar() {
          dizer("Copiado. Cole no chat.");
        }
        function reserva() {
          saida.focus();
          saida.select();
          try {
            if (document.execCommand("copy")) aoCopiar();
            else dizer("Não consegui copiar sozinho: o texto está selecionado, use Ctrl+C.");
          } catch (e) {
            dizer("Não consegui copiar sozinho: o texto está selecionado, use Ctrl+C.");
          }
        }
        if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(texto).then(aoCopiar, reserva);
        else reserva();
      });
    }

    var botaoApagar = document.getElementById("btn-apagar");
    if (botaoApagar) {
      var armado = null;
      botaoApagar.addEventListener("click", function () {
        if (!armado) {
          botaoApagar.textContent = "Clique de novo para apagar todas as respostas";
          armado = setTimeout(function () {
            armado = null;
            botaoApagar.textContent = "Apagar todas as respostas";
          }, 4000);
          return;
        }
        clearTimeout(armado);
        armado = null;
        botaoApagar.textContent = "Apagar todas as respostas";
        estado = {};
        gravarEstado(estado);
        cartoes.forEach(pintarCartao);
        atualizarContador();
        saida.hidden = true;
        saida.value = "";
        dizer("Respostas apagadas deste navegador.");
      });
    }
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", iniciar);
  else iniciar();
})();
