/**
 * A interface do console: uma página, dois estados, nenhum passo de build.
 *
 * MÍNIMA E SÓBRIA por decisão, e não por falta de tempo. O console responde
 * três perguntas de operação (o município está usando, alguém está com
 * problema, e há quanto tempo ele não escreve), e cada elemento a mais aqui é
 * uma chance a mais de alguém querer "só mostrar o protocolo junto". A ADR 0008
 * é explícita: se a resposta a uma pergunta do console exige nome, endereço ou
 * protocolo, a pergunta é do município e se faz no painel dele.
 *
 * SEM FRAMEWORK E SEM ETAPA DE BUILD, e isso é diferente do painel do município
 * (que é React com Vite). A razão é a decisão 1 da ADR 0008: quanto menos coisa
 * este processo carrega, menos superfície um vazamento dele entrega. Uma tela de
 * uma tabela e um formulário de duas etapas não paga uma cadeia de dependências.
 *
 * O CSS e o JS saem em ROTAS PRÓPRIAS, e não dentro do HTML, porque escrevê-los
 * embutidos exigiria `'unsafe-inline'` na política de segurança de conteúdo, que
 * é justamente a diretiva que faz a política deixar de valer.
 */

export const PAGINA_DO_CONSOLE = `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>Console do fornecedor</title>
<link rel="stylesheet" href="/console.css">
</head>
<body>
<header>
  <h1>Console do fornecedor</h1>
  <p class="aviso">Saúde de uso, em números agregados. Nenhum dado de cidadão passa por aqui.</p>
</header>

<main>
  <section id="porta">
    <h2>Entrar</h2>
    <form id="forma-senha" autocomplete="on">
      <label for="email">Email</label>
      <input id="email" name="email" type="email" required autocomplete="username">
      <label for="senha">Senha</label>
      <input id="senha" name="senha" type="password" required autocomplete="current-password">
      <button type="submit">Continuar</button>
    </form>

    <form id="forma-codigo" hidden autocomplete="off">
      <p class="passo">Segunda etapa, obrigatória.</p>
      <label for="codigo">Código do aplicativo de autenticação</label>
      <input id="codigo" name="codigo" inputmode="numeric" autocomplete="one-time-code"
             maxlength="6" required>
      <button type="submit">Entrar</button>
    </form>

    <p id="recado" role="status" aria-live="polite"></p>
  </section>

  <section id="painel" hidden>
    <div class="topo">
      <h2>Municípios</h2>
      <button id="sair" type="button">Sair</button>
    </div>
    <div class="rolagem">
      <table>
        <caption class="oculto">Situação de uso por município</caption>
        <thead>
          <tr>
            <th scope="col">Município</th>
            <th scope="col">Sinal</th>
            <th scope="col" class="n">Entraram</th>
            <th scope="col" class="n">Encerradas</th>
            <th scope="col" class="n">Vistorias</th>
            <th scope="col" class="n">Abertas</th>
            <th scope="col" class="n">Atrasadas</th>
            <th scope="col" class="n">Servidores</th>
            <th scope="col" class="n">Aparelhos sumidos</th>
            <th scope="col" class="n">Mediana até vistoria</th>
          </tr>
        </thead>
        <tbody id="linhas"></tbody>
      </table>
    </div>
    <p id="vazio" hidden>Nenhum município cadastrado ainda.</p>
  </section>
</main>

<script src="/console.js"></script>
</body>
</html>
`;

/**
 * Modo claro e modo escuro, os dois completos, como o resto do produto exige.
 *
 * O sinal de silêncio NUNCA é só cor: a coluna traz a palavra ("calado" ou "em
 * dia") junto do marcador. Um console cujo alarme fosse uma célula vermelha
 * seria invisível para quem não distingue vermelho de verde, e este é o alarme
 * que a ADR 0008 pediu para existir.
 */
export const CSS_DO_CONSOLE = `
:root {
  color-scheme: light dark;
  --fundo: #f6f6f7;
  --superficie: #ffffff;
  --borda: #d8d8dc;
  --texto: #17171b;
  --fraco: #5c5c66;
  --alarme: #8a1f11;
  --alarme-fundo: #fbeae7;
  --calmo: #14532d;
  --calmo-fundo: #e8f3ec;
}
@media (prefers-color-scheme: dark) {
  :root {
    --fundo: #0f0f12;
    --superficie: #17171b;
    --borda: #2c2c33;
    --texto: #ececf0;
    --fraco: #9d9da8;
    --alarme: #ffb4a6;
    --alarme-fundo: #3a1611;
    --calmo: #a7d7b8;
    --calmo-fundo: #12291c;
  }
}
* { box-sizing: border-box; }
body {
  margin: 0;
  background: var(--fundo);
  color: var(--texto);
  font: 15px/1.5 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
}
header { padding: 24px 24px 8px; }
h1 { font-size: 20px; margin: 0 0 4px; letter-spacing: -0.01em; }
h2 { font-size: 16px; margin: 0 0 12px; }
.aviso { margin: 0; color: var(--fraco); font-size: 13px; }
main { padding: 16px 24px 48px; }
section {
  background: var(--superficie);
  border: 1px solid var(--borda);
  border-radius: 10px;
  padding: 20px;
  max-width: 1100px;
}
#porta { max-width: 380px; }
label { display: block; font-size: 13px; color: var(--fraco); margin: 12px 0 4px; }
input {
  width: 100%;
  padding: 10px 12px;
  font: inherit;
  color: var(--texto);
  background: var(--fundo);
  border: 1px solid var(--borda);
  border-radius: 6px;
}
button {
  margin-top: 16px;
  min-height: 44px;
  padding: 0 18px;
  font: inherit;
  font-weight: 600;
  color: var(--superficie);
  background: var(--texto);
  border: 1px solid var(--texto);
  border-radius: 6px;
  cursor: pointer;
}
#sair { margin: 0; background: transparent; color: var(--texto); border-color: var(--borda); }
:focus-visible { outline: 2px solid currentColor; outline-offset: 2px; }
.passo { margin: 0; font-size: 13px; color: var(--fraco); }
#recado { min-height: 20px; margin: 12px 0 0; font-size: 13px; color: var(--alarme); }
.topo { display: flex; align-items: center; justify-content: space-between; gap: 16px; }
.rolagem { overflow-x: auto; }
table { width: 100%; border-collapse: collapse; font-variant-numeric: tabular-nums; }
th, td { padding: 10px 12px; text-align: left; border-bottom: 1px solid var(--borda); }
th.n, td.n { text-align: right; }
thead th { font-size: 12px; color: var(--fraco); font-weight: 600; }
.marca { display: inline-block; padding: 2px 8px; border-radius: 999px; font-size: 12px; }
.marca.calado { color: var(--alarme); background: var(--alarme-fundo); }
.marca.em-dia { color: var(--calmo); background: var(--calmo-fundo); }
.oculto {
  position: absolute; width: 1px; height: 1px;
  overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap;
}
`;

/**
 * O pouco de comportamento que a tela precisa.
 *
 * O token da sessão fica numa variável do módulo, e NÃO em `localStorage`. A
 * diferença é que fechar a aba encerra a sessão, e um console esquecido aberto
 * numa recepção não continua entrando sozinho amanhã. Como a sessão dura trinta
 * minutos e não se renova, guardar o token entre visitas não compraria quase
 * nada e custaria isso.
 *
 * Todo texto vindo do servidor entra por `textContent`, nunca por `innerHTML`:
 * o nome do município é escrito por quem provisiona, e um console que
 * interpretasse HTML vindo do banco seria injeção de script na única tela que
 * enxerga mais de um município.
 */
export const JS_DO_CONSOLE = `
"use strict";
var token = null;
var desafio = null;

var porta = document.getElementById("porta");
var painel = document.getElementById("painel");
var formaSenha = document.getElementById("forma-senha");
var formaCodigo = document.getElementById("forma-codigo");
var recado = document.getElementById("recado");
var linhas = document.getElementById("linhas");
var vazio = document.getElementById("vazio");

function dizer(texto) { recado.textContent = texto || ""; }

async function pedir(caminho, opcoes) {
  var resposta = await fetch(caminho, opcoes);
  var corpo = null;
  try { corpo = await resposta.json(); } catch (e) { corpo = null; }
  return { ok: resposta.ok, corpo: corpo };
}

formaSenha.addEventListener("submit", async function (evento) {
  evento.preventDefault();
  dizer("");
  var r = await pedir("/entrar", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      email: document.getElementById("email").value,
      senha: document.getElementById("senha").value
    })
  });
  if (!r.ok || !r.corpo || !r.corpo.desafio) {
    dizer((r.corpo && r.corpo.mensagem) || "Não foi possível entrar.");
    return;
  }
  desafio = r.corpo.desafio;
  formaSenha.hidden = true;
  formaCodigo.hidden = false;
  document.getElementById("codigo").focus();
});

formaCodigo.addEventListener("submit", async function (evento) {
  evento.preventDefault();
  dizer("");
  var r = await pedir("/entrar/codigo", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      desafio: desafio,
      codigo: document.getElementById("codigo").value
    })
  });
  if (!r.ok || !r.corpo || !r.corpo.token) {
    dizer((r.corpo && r.corpo.mensagem) || "Código incorreto.");
    return;
  }
  token = r.corpo.token;
  porta.hidden = true;
  painel.hidden = false;
  await carregar();
});

document.getElementById("sair").addEventListener("click", function () {
  token = null;
  desafio = null;
  linhas.textContent = "";
  painel.hidden = true;
  porta.hidden = false;
  formaCodigo.hidden = true;
  formaSenha.hidden = false;
  document.getElementById("senha").value = "";
  document.getElementById("codigo").value = "";
});

function celula(texto, numerica) {
  var td = document.createElement("td");
  if (numerica) td.className = "n";
  td.textContent = texto;
  return td;
}

function numero(valor) {
  // Traço curto e não travessão, e "sem dado" em vez de zero: zero afirmaria
  // que nada aconteceu, e nulo aqui significa que não há o que medir.
  return valor === null || valor === undefined ? "-" : String(valor);
}

async function carregar() {
  var r = await pedir("/municipios", { headers: { authorization: "Bearer " + token } });
  if (!r.ok) {
    porta.hidden = false;
    painel.hidden = true;
    dizer("A sessão terminou. Entre de novo.");
    return;
  }
  var lista = (r.corpo && r.corpo.municipios) || [];
  linhas.textContent = "";
  vazio.hidden = lista.length > 0;

  lista.forEach(function (m) {
    var tr = document.createElement("tr");

    var nome = document.createElement("th");
    nome.setAttribute("scope", "row");
    nome.textContent = m.municipio + " (" + m.uf + ")";
    tr.appendChild(nome);

    var sinal = document.createElement("td");
    var marca = document.createElement("span");
    marca.className = "marca " + (m.sem_escrita_recente ? "calado" : "em-dia");
    var horas = m.horas_desde_a_escrita;
    marca.textContent = m.sem_escrita_recente
      ? (horas === null || horas === undefined
          ? "calado, nunca escreveu"
          : "calado ha " + Math.round(horas) + " h")
      : "em dia";
    sinal.appendChild(marca);
    tr.appendChild(sinal);

    tr.appendChild(celula(numero(m.ocorrencias_registradas), true));
    tr.appendChild(celula(numero(m.ocorrencias_encerradas), true));
    tr.appendChild(celula(numero(m.vistorias_recebidas), true));
    tr.appendChild(celula(numero(m.ocorrencias_abertas), true));
    tr.appendChild(celula(numero(m.ocorrencias_atrasadas), true));
    tr.appendChild(celula(numero(m.usuarios_ativos), true));
    tr.appendChild(celula(numero(m.aparelhos_sem_aparecer), true));
    tr.appendChild(celula(
      m.minutos_ate_vistoria_mediana === null || m.minutos_ate_vistoria_mediana === undefined
        ? "-"
        : m.minutos_ate_vistoria_mediana + " min",
      true
    ));

    linhas.appendChild(tr);
  });
}
`;
