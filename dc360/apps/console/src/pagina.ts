/**
 * A interface do console: uma página, três telas, nenhum passo de build.
 *
 * ENXUTA EM ROTAS E EM DADO, generosa em acabamento, e as duas coisas não
 * brigam. O console responde três perguntas de operação (o município está
 * usando, alguém está com problema, e há quanto tempo ele não escreve), e cada
 * DADO a mais aqui é uma chance a mais de alguém querer "só mostrar o protocolo
 * junto". A ADR 0008 é explícita: se a resposta a uma pergunta do console exige
 * nome, endereço ou protocolo, a pergunta é do município e se faz no painel
 * dele. Isso limita o que a tela MOSTRA, e nunca foi licença para ela parecer
 * um formulário de 1998.
 *
 * SEM FRAMEWORK E SEM ETAPA DE BUILD, e isso é diferente do painel do município
 * (que é React com Vite). A razão é a decisão 1 da ADR 0008: quanto menos coisa
 * este processo carrega, menos superfície um vazamento dele entrega. Uma tela de
 * uma tabela e dois formulários não paga uma cadeia de dependências.
 *
 * O CSS, o JS E AS FONTES SAEM EM ROTAS PRÓPRIAS, e não dentro do HTML, porque
 * escrevê-los embutidos exigiria `'unsafe-inline'` na política de segurança de
 * conteúdo, que é justamente a diretiva que faz a política deixar de valer. A
 * mesma política é a razão de NÃO existir aqui biblioteca de ícone de CDN nem
 * folha do Google Fonts: os ícones são SVG desenhado à mão, como no aplicativo
 * de campo, e as fontes vêm de `fontes.ts`, servidas por este mesmo processo.
 *
 * IDENTIDADE IGUAL À DO PRODUTO. Os tokens `--ds-*` abaixo são os mesmos de
 * `apps/web/src/estilos/tokens.css`, copiados e não importados porque este
 * processo não tem passo de build para resolver um import. Valor de cor, sombra,
 * raio ou duração fora de um token `--ds-*` é bug aqui pela mesma régua do resto
 * do produto, e existe teste que o cobra.
 */

export const PAGINA_DO_CONSOLE = `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<meta name="color-scheme" content="light dark">
<title>Console do fornecedor, Defesa Civil 360</title>
<link rel="stylesheet" href="/console.css">
</head>
<body>

<!--
  O conjunto de ícones, desenhado aqui dentro.

  Biblioteca de ícone de CDN não passa pela política de segurança de conteúdo
  deste processo, e não é por isso que ela ficou de fora: o aplicativo de campo
  já desenha os dele à mão pela mesma razão de peso. As regras do conjunto são
  as de lá, e elas valem para todos: viewBox de 24, traço de 1.8, traço e nunca
  preenchimento, e o ícone é SEMPRE a segunda pista, ao lado da palavra, nunca
  o lugar dela.
-->
<svg class="folha-de-icones" aria-hidden="true" focusable="false">
  <symbol id="i-escudo" viewBox="0 0 24 24">
    <path d="M12 3 4.5 6v6.2c0 4.2 3 7.4 7.5 8.8 4.5-1.4 7.5-4.6 7.5-8.8V6L12 3Z"/>
    <path d="m8.8 12.2 2.2 2.3 4.2-4.6"/>
  </symbol>
  <symbol id="i-sol" viewBox="0 0 24 24">
    <circle cx="12" cy="12" r="4"/>
    <path d="M12 2.5v2M12 19.5v2M4.2 4.2l1.4 1.4M18.4 18.4l1.4 1.4M2.5 12h2M19.5 12h2M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4"/>
  </symbol>
  <symbol id="i-lua" viewBox="0 0 24 24">
    <path d="M20 14.2A8.2 8.2 0 0 1 9.8 4a8.4 8.4 0 1 0 10.2 10.2Z"/>
  </symbol>
  <symbol id="i-arroba" viewBox="0 0 24 24">
    <circle cx="12" cy="12" r="3.4"/>
    <path d="M15.4 8.6v4.6a2.6 2.6 0 0 0 5.2 0V12a8.6 8.6 0 1 0-3.4 6.9"/>
  </symbol>
  <symbol id="i-cadeado" viewBox="0 0 24 24">
    <rect x="4.5" y="10.5" width="15" height="10" rx="2"/>
    <path d="M8 10.5V7.8a4 4 0 0 1 8 0v2.7"/>
    <path d="M12 14.4v2.4"/>
  </symbol>
  <symbol id="i-digitos" viewBox="0 0 24 24">
    <rect x="3" y="5" width="18" height="14" rx="2"/>
    <path d="M7.5 10.5v3M12 10.5v3M16.5 10.5v3"/>
  </symbol>
  <symbol id="i-seta-direita" viewBox="0 0 24 24">
    <path d="M4.5 12h14M13.5 7l5 5-5 5"/>
  </symbol>
  <symbol id="i-seta-esquerda" viewBox="0 0 24 24">
    <path d="M19.5 12h-14M10.5 7l-5 5 5 5"/>
  </symbol>
  <symbol id="i-sair" viewBox="0 0 24 24">
    <path d="M15 4.5h3.5a1.5 1.5 0 0 1 1.5 1.5v12a1.5 1.5 0 0 1-1.5 1.5H15"/>
    <path d="M11 8 15 12l-4 4M15 12H4"/>
  </symbol>
  <symbol id="i-mais" viewBox="0 0 24 24">
    <path d="M12 5.5v13M5.5 12h13"/>
  </symbol>
  <symbol id="i-alerta" viewBox="0 0 24 24">
    <path d="M12 4.2 2.9 19.4h18.2L12 4.2Z"/>
    <path d="M12 10v4M12 16.6v.6"/>
  </symbol>
  <symbol id="i-confere" viewBox="0 0 24 24">
    <circle cx="12" cy="12" r="8.5"/>
    <path d="m8.2 12.3 2.6 2.6 5-5.5"/>
  </symbol>
  <symbol id="i-silencio" viewBox="0 0 24 24">
    <path d="M7.4 17.5a3.9 3.9 0 0 1-.6-7.7 5.5 5.5 0 0 1 8.4-2.9"/>
    <path d="M17.2 10.4a4.3 4.3 0 0 1 1.2 7.1"/>
    <path d="M4.5 4.5 19.5 19.5"/>
  </symbol>
  <symbol id="i-pulso" viewBox="0 0 24 24">
    <path d="M3 12.5h3.6L9 6.5l3.4 11.5 2.3-5.5H21"/>
  </symbol>
  <symbol id="i-predio" viewBox="0 0 24 24">
    <path d="M4 20.5h16"/>
    <path d="M6 20.5V9.5l6-4 6 4v11"/>
    <path d="M10 20.5v-4.3h4v4.3"/>
    <path d="M9.5 12.2h1.2M13.3 12.2h1.2"/>
  </symbol>
  <symbol id="i-relogio" viewBox="0 0 24 24">
    <circle cx="12" cy="12" r="8.5"/>
    <path d="M12 7.4V12l3 2"/>
  </symbol>
  <symbol id="i-pasta" viewBox="0 0 24 24">
    <path d="M3.5 7.5A1.5 1.5 0 0 1 5 6h4l2 2.4h8a1.5 1.5 0 0 1 1.5 1.5v7.6A1.5 1.5 0 0 1 19 19H5a1.5 1.5 0 0 1-1.5-1.5V7.5Z"/>
  </symbol>
</svg>

<header class="barra">
  <div class="marca">
    <span class="marca-selo"><svg class="icone" aria-hidden="true"><use href="#i-escudo"/></svg></span>
    <span class="marca-texto">
      <span class="marca-produto">Defesa Civil 360</span>
      <strong class="marca-titulo">Console do fornecedor</strong>
    </span>
  </div>

  <div class="barra-acoes">
    <p class="quem" id="quem" hidden>
      <svg class="icone" aria-hidden="true"><use href="#i-escudo"/></svg>
      <span id="quem-email" class="mono"></span>
    </p>
    <button id="tema" class="botao botao-icone" type="button" aria-pressed="false">
      <svg class="icone no-claro" aria-hidden="true"><use href="#i-lua"/></svg>
      <svg class="icone no-escuro" aria-hidden="true"><use href="#i-sol"/></svg>
      <span class="oculto" id="tema-rotulo">Mudar para o modo escuro</span>
    </button>
    <button id="sair" class="botao botao-discreto" type="button" hidden>
      <svg class="icone" aria-hidden="true"><use href="#i-sair"/></svg>
      <span>Sair</span>
    </button>
  </div>
</header>

<main>

  <!-- ================= A porta ================= -->
  <section id="porta" class="tela tela-porta">
    <div class="cartao cartao-porta entra">
      <span class="fita" aria-hidden="true"></span>

      <div class="porta-cabeca">
        <span class="emblema"><svg class="icone" aria-hidden="true"><use href="#i-cadeado"/></svg></span>
        <h2 id="porta-titulo">Entrar no console</h2>
        <p class="apoio" id="porta-apoio">
          Duas etapas, e a segunda é obrigatória: o código de seis dígitos do
          aplicativo de autenticação.
        </p>
      </div>

      <form id="forma-senha" autocomplete="on" novalidate>
        <div class="campo">
          <label for="email">Email</label>
          <span class="entrada">
            <svg class="icone entrada-icone" aria-hidden="true"><use href="#i-arroba"/></svg>
            <input id="email" name="email" type="email" required autocomplete="username"
                   placeholder="voce@fornecedor.com.br" spellcheck="false">
          </span>
        </div>

        <div class="campo">
          <label for="senha">Senha</label>
          <span class="entrada">
            <svg class="icone entrada-icone" aria-hidden="true"><use href="#i-cadeado"/></svg>
            <input id="senha" name="senha" type="password" required autocomplete="current-password"
                   placeholder="Sua senha do console">
          </span>
        </div>

        <button type="submit" id="continuar" class="botao botao-forte botao-largo">
          <span class="roda" aria-hidden="true"></span>
          <span id="continuar-texto">Continuar</span>
          <svg class="icone" aria-hidden="true"><use href="#i-seta-direita"/></svg>
        </button>
      </form>

      <form id="forma-codigo" hidden autocomplete="off" novalidate>
        <p class="passo">
          <span class="passo-conta">Etapa 2 de 2</span>
          Código de <span id="codigo-de-quem" class="mono"></span>
        </p>

        <div class="campo">
          <label for="codigo">Código do aplicativo de autenticação</label>
          <span class="entrada">
            <svg class="icone entrada-icone" aria-hidden="true"><use href="#i-digitos"/></svg>
            <input id="codigo" name="codigo" inputmode="numeric" autocomplete="one-time-code"
                   maxlength="6" required placeholder="000000" class="mono entrada-codigo">
          </span>
          <p class="ajuda">Seis dígitos. Ele muda a cada trinta segundos.</p>
        </div>

        <button type="submit" id="entrar" class="botao botao-forte botao-largo">
          <span class="roda" aria-hidden="true"></span>
          <span id="entrar-texto">Entrar</span>
          <svg class="icone" aria-hidden="true"><use href="#i-seta-direita"/></svg>
        </button>

        <!--
          O caminho de volta, e ele não é enfeite.

          Quando o desafio expira (e ele expira em minutos), este formulário
          ficava na tela recusando para sempre, sem nenhum caminho de volta,
          até alguém pensar em recarregar a página. Quem está no plantão não
          pensa em recarregar a página: pensa que o console quebrou.
        -->
        <button type="button" id="voltar-para-senha" class="botao botao-texto botao-largo">
          <svg class="icone" aria-hidden="true"><use href="#i-seta-esquerda"/></svg>
          <span>Recomeçar com a senha</span>
        </button>
      </form>

      <p id="recado" class="recado" role="status" aria-live="polite" hidden>
        <svg class="icone" aria-hidden="true"><use href="#i-alerta"/></svg>
        <span id="recado-texto"></span>
      </p>

      <p class="rodape-cartao">
        Saúde de uso, em números agregados. Nenhum dado de cidadão passa por aqui.
      </p>
    </div>
  </section>

  <!-- ================= Os números ================= -->
  <section id="painel" class="tela" hidden>
    <div class="topo">
      <div>
        <h2>Municípios</h2>
        <p class="apoio" id="resumo-frase">Situação de uso por município.</p>
      </div>
      <div class="acoes">
        <button id="atualizar" type="button" class="botao botao-discreto">
          <span class="roda" aria-hidden="true"></span>
          <svg class="icone" aria-hidden="true"><use href="#i-pulso"/></svg>
          <span id="atualizar-texto">Atualizar</span>
        </button>
        <button id="abrir-cadastro" type="button" class="botao botao-forte">
          <svg class="icone" aria-hidden="true"><use href="#i-mais"/></svg>
          <span>Cadastrar prefeitura</span>
        </button>
      </div>
    </div>

    <div class="indicadores entra" id="indicadores" hidden>
      <div class="cartao indicador">
        <p class="indicador-rotulo">
          <svg class="icone" aria-hidden="true"><use href="#i-predio"/></svg>
          <span>Municípios</span>
        </p>
        <p class="indicador-numero mono" id="kpi-municipios">-</p>
        <p class="indicador-nota">Prefeituras cadastradas</p>
      </div>
      <div class="cartao indicador" id="cartao-calados">
        <p class="indicador-rotulo">
          <svg class="icone" aria-hidden="true"><use href="#i-silencio"/></svg>
          <span>Calados</span>
        </p>
        <p class="indicador-numero mono" id="kpi-calados">-</p>
        <p class="indicador-nota" id="kpi-calados-nota">Sem escrita recente</p>
      </div>
      <div class="cartao indicador">
        <p class="indicador-rotulo">
          <svg class="icone" aria-hidden="true"><use href="#i-pasta"/></svg>
          <span>Abertas</span>
        </p>
        <p class="indicador-numero mono" id="kpi-abertas">-</p>
        <p class="indicador-nota">Ocorrências em andamento</p>
      </div>
      <div class="cartao indicador">
        <p class="indicador-rotulo">
          <svg class="icone" aria-hidden="true"><use href="#i-relogio"/></svg>
          <span>Atrasadas</span>
        </p>
        <p class="indicador-numero mono" id="kpi-atrasadas">-</p>
        <p class="indicador-nota">Passaram do prazo</p>
      </div>
    </div>

    <div class="cartao cartao-tabela">
      <div class="rolagem" id="rolagem" aria-busy="false">
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

      <div id="vazio" class="vazio" hidden>
        <span class="vazio-desenho" aria-hidden="true">
          <svg class="icone" aria-hidden="true"><use href="#i-predio"/></svg>
        </span>
        <p class="vazio-titulo">Nenhum município cadastrado ainda</p>
        <p class="vazio-apoio">
          Quando a primeira prefeitura entrar, os números dela aparecem aqui
          sozinhos, no dia seguinte ao primeiro uso.
        </p>
        <button type="button" id="vazio-cadastrar" class="botao botao-forte">
          <svg class="icone" aria-hidden="true"><use href="#i-mais"/></svg>
          <span>Cadastrar a primeira prefeitura</span>
        </button>
      </div>

      <p id="recado-painel" class="recado" role="status" aria-live="polite" hidden>
        <svg class="icone" aria-hidden="true"><use href="#i-alerta"/></svg>
        <span id="recado-painel-texto"></span>
      </p>
    </div>
  </section>

  <!-- ================= A prefeitura nova ================= -->
  <section id="cadastro" class="tela" hidden>
    <div class="topo">
      <div>
        <h2>Cadastrar prefeitura</h2>
        <p class="apoio">
          Cria o município e o primeiro administrador dele. A senha inicial é
          sorteada pelo servidor e mostrada uma única vez, aqui nesta tela.
        </p>
      </div>
      <button id="voltar" type="button" class="botao botao-discreto">
        <svg class="icone" aria-hidden="true"><use href="#i-seta-esquerda"/></svg>
        <span>Voltar aos municípios</span>
      </button>
    </div>

    <!--
      O cartão É o formulário, e não um invólucro em volta dele.

      Com o cartão por fora, esconder o formulário depois de cadastrar deixava
      uma casca vazia na tela: um retângulo com borda e respiro, acima do cartão
      de sucesso, sem nada dentro. Só apareceu abrindo a página.
    -->
    <form id="forma-cadastro" class="cartao cartao-forma entra" autocomplete="off" novalidate>
        <h3 class="secao">Município</h3>
        <div class="dupla">
          <div class="campo">
            <label for="municipio">Município</label>
            <span class="entrada">
              <input id="municipio" name="municipio" required maxlength="200"
                     placeholder="Serra Alta">
            </span>
          </div>
          <div class="campo estreito">
            <label for="uf">UF</label>
            <span class="entrada">
              <input id="uf" name="uf" required maxlength="2" size="2"
                     autocapitalize="characters" spellcheck="false" placeholder="MG">
            </span>
          </div>
        </div>

        <div class="campo">
          <label for="orgao">Nome do órgão (opcional)</label>
          <span class="entrada">
            <input id="orgao" name="orgao" maxlength="300"
                   placeholder="Coordenadoria Municipal de Proteção e Defesa Civil de ...">
          </span>
          <p class="ajuda">
            Em branco, vale a forma que a Defesa Civil municipal usa em documento
            oficial. Este nome sai impresso no laudo.
          </p>
        </div>

        <h3 class="secao">Primeiro administrador</h3>
        <div class="dupla">
          <div class="campo">
            <label for="nome-admin">Nome</label>
            <span class="entrada">
              <input id="nome-admin" name="nome" required maxlength="200"
                     placeholder="Rita Nogueira">
            </span>
          </div>
          <div class="campo estreito">
            <label for="matricula">Matrícula</label>
            <span class="entrada">
              <input id="matricula" name="matricula" required maxlength="40"
                     class="mono" placeholder="12345">
            </span>
          </div>
        </div>

        <div class="campo">
          <label for="email-admin">Email</label>
          <span class="entrada">
            <svg class="icone entrada-icone" aria-hidden="true"><use href="#i-arroba"/></svg>
            <input id="email-admin" name="email" type="email" required maxlength="320"
                   spellcheck="false" placeholder="rita@serraalta.mg.gov.br">
          </span>
        </div>

        <div class="campo">
          <label for="operador">Quem está cadastrando</label>
          <span class="entrada">
            <input id="operador" name="operador" required maxlength="200"
                   placeholder="Nome de quem está cadastrando">
          </span>
          <p class="ajuda">
            Vai para a trilha do município como o nome de quem o criou, e é a única
            resposta que ele tem para "quem criou isto". Escreva o nome da pessoa.
          </p>
        </div>

        <button type="submit" id="criar" class="botao botao-forte botao-largo">
          <span class="roda" aria-hidden="true"></span>
          <span id="criar-texto">Cadastrar prefeitura</span>
          <svg class="icone" aria-hidden="true"><use href="#i-seta-direita"/></svg>
        </button>

      <p id="recado-cadastro" class="recado" role="status" aria-live="polite" hidden>
        <svg class="icone" aria-hidden="true"><use href="#i-alerta"/></svg>
        <span id="recado-cadastro-texto"></span>
      </p>
    </form>

    <div id="entregue" class="cartao cartao-forma cartao-entregue entra" hidden>
      <p class="selo-bom">
        <svg class="icone" aria-hidden="true"><use href="#i-confere"/></svg>
        <span>Prefeitura cadastrada</span>
      </p>
      <h3 id="entregue-titulo" class="entregue-municipio" tabindex="-1"></h3>
      <p class="apoio" id="entregue-municipio"></p>

      <p class="rotulo-senha" id="rotulo-senha">Senha inicial</p>
      <p class="senha mono" id="senha-inicial" aria-labelledby="rotulo-senha"></p>

      <p class="alerta">
        <svg class="icone" aria-hidden="true"><use href="#i-alerta"/></svg>
        <span>
          <strong>Atenção:</strong> esta senha não fica guardada em lugar nenhum e
          não será mostrada de novo. Entregue por canal combinado e peça a troca
          na primeira entrada.
        </span>
      </p>

      <dl class="ids">
        <dt>Identificador do município</dt>
        <dd id="id-municipio" class="mono"></dd>
        <dt>Identificador do administrador</dt>
        <dd id="id-admin" class="mono"></dd>
      </dl>

      <button type="button" id="concluir" class="botao botao-forte botao-largo">
        <span>Já anotei, concluir</span>
        <svg class="icone" aria-hidden="true"><use href="#i-seta-direita"/></svg>
      </button>
    </div>
  </section>

</main>

<footer class="rodape">
  <p>
    Processo separado do produto, com sessão própria e sem acesso a tabela de
    negócio nenhuma. A sessão dura trinta minutos e não se renova.
  </p>
</footer>

<script src="/console.js"></script>
</body>
</html>
`;

/**
 * A folha de estilo, com a identidade do produto e os dois temas completos.
 *
 * OS TOKENS SÃO OS DO PRODUTO, copiados de `apps/web/src/estilos/tokens.css`.
 * Copiados e não importados porque este processo não tem passo de build que
 * resolva import de CSS, e um `@import` de rede é exatamente o que a política
 * de segurança de conteúdo deste console bloqueia. O que vale é a régua: valor
 * de cor, sombra, raio ou duração escrito à mão dentro de um componente é bug,
 * e existe teste que o cobra lendo esta string.
 *
 * O SINAL DE SILÊNCIO NUNCA É SÓ COR: a coluna traz a palavra ("calado" ou "em
 * dia") e o ícone junto do fundo colorido. Um console cujo alarme fosse uma
 * célula vermelha seria invisível para quem não distingue vermelho de verde, e
 * este é o alarme que a ADR 0008 pediu para existir. A mesma regra vale para o
 * aviso da senha inicial e para as mensagens de erro.
 *
 * MOVIMENTO COM PROPÓSITO, e nada que engasgue: transição de estado é curta
 * (resposta a toque), e a entrada de tela é mais longa, com a duração saindo de
 * `calc()` sobre um token, como a decisão de 2026-08-20 autoriza. Tudo respeita
 * `prefers-reduced-motion`.
 */
export const CSS_DO_CONSOLE = `
/*
  As fontes do produto, servidas por este mesmo processo (ver src/fontes.ts).
  \`font-display: swap\` de propósito: o console abre imediatamente com a pilha
  do sistema e troca quando a fonte chega, em vez de piscar em branco.
*/
@font-face {
  font-family: "Work Sans";
  font-style: normal;
  font-weight: 400;
  font-display: swap;
  src: url("/fontes/work-sans-400.ttf") format("truetype");
}
@font-face {
  font-family: "Work Sans";
  font-style: normal;
  font-weight: 600;
  font-display: swap;
  src: url("/fontes/work-sans-600.ttf") format("truetype");
}
@font-face {
  font-family: "Roboto Mono";
  font-style: normal;
  font-weight: 400;
  font-display: swap;
  src: url("/fontes/roboto-mono-400.ttf") format("truetype");
}

/* ============ INICIO DOS TOKENS ============
   Espelho de apps/web/src/estilos/tokens.css. Abaixo do marcador de FIM,
   nenhum componente escreve cor, sombra, raio ou duração à mão. */
:root {
  /* Primitivas: violeta (marca, decisão de 2026-08-20).
     violeta-700 (#5B21B6) sobre branco: 8.98:1 (tema claro).
     violeta-400 (#A78BFA) sobre ink-950: 6.75:1 (tema escuro). */
  --ds-violet-300: #C4B5FD;
  --ds-violet-400: #A78BFA;
  --ds-violet-500: #7C3AED;
  --ds-violet-600: #6D28D9;
  --ds-violet-700: #5B21B6;
  --ds-violet-800: #4C1D95;

  /* Primitivas: neutros */
  --ds-ink-950: #101519;
  --ds-ink-900: #14191D;
  --ds-ink-850: #171E24;
  --ds-ink-800: #1E262D;
  --ds-ink-700: #2A343C;
  --ds-ink-500: #5A6B76;
  --ds-ink-400: #9BAAB5;
  --ds-ink-200: #DDE3E7;
  --ds-ink-100: #E9EDF1;
  --ds-ink-50:  #F5F7F8;
  --ds-white:   #FFFFFF;
  --ds-ice:     #ECF1F4;

  /* Semânticos: TEMA CLARO (padrão) */
  --ds-bg:            var(--ds-ink-50);
  --ds-surface:       var(--ds-white);
  --ds-surface-2:     var(--ds-ink-100);
  --ds-border:        var(--ds-ink-200);
  /* Borda de CONTROLE, separada da decorativa: a WCAG 1.4.11 exige 3:1 para o
     que identifica um componente de interação, e a borda de cartão não serve. */
  --ds-border-controle: var(--ds-ink-500);
  --ds-text:          var(--ds-ink-900);
  --ds-text-muted:    var(--ds-ink-500);
  --ds-accent:        var(--ds-violet-700);
  --ds-accent-hover:  var(--ds-violet-800);
  --ds-accent-graphic: var(--ds-violet-600);
  --ds-on-accent:     var(--ds-white);

  /* Status (texto / fundo) */
  --ds-info-fg:    #1864AB;  --ds-info-bg:    #E7F5FF;
  --ds-success-fg: #14702F;  --ds-success-bg: #E6F6EA;
  --ds-danger-fg:  #C92A2A;  --ds-danger-bg:  #FDEBEB;

  /* Sombras / elevação */
  --ds-shadow-1: 0 1px 2px rgba(16, 21, 25, 0.06), 0 1px 3px rgba(16, 21, 25, 0.10);
  --ds-shadow-2: 0 4px 12px rgba(16, 21, 25, 0.10);
  --ds-shadow-3: 0 12px 28px rgba(16, 21, 25, 0.16);
  --ds-focus-ring: 0 0 0 2px var(--ds-bg), 0 0 0 4px var(--ds-violet-600);

  /* Gradiente de marca: entre --ds-accent e --ds-accent-hover, então herda o
     contraste já verificado desses dois tokens em cada tema. */
  --ds-accent-gradient: linear-gradient(135deg, var(--ds-accent), var(--ds-accent-hover));
  --ds-accent-glow: 0 8px 20px color-mix(in srgb, var(--ds-violet-500) 35%, transparent);

  /* Tipografia */
  --ds-font: "Work Sans", -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
  --ds-font-mono: "Roboto Mono", ui-monospace, "SFMono-Regular", Consolas, monospace;
  --ds-fs-display: 44px; --ds-lh-display: 48px;
  --ds-fs-h1: 32px;      --ds-lh-h1: 38px;
  --ds-fs-h2: 24px;      --ds-lh-h2: 30px;
  --ds-fs-h3: 20px;      --ds-lh-h3: 26px;
  --ds-fs-body-lg: 18px; --ds-lh-body-lg: 26px;
  --ds-fs-body: 16px;    --ds-lh-body: 24px;
  --ds-fs-body-sm: 14px; --ds-lh-body-sm: 20px;
  --ds-fs-caption: 12px; --ds-lh-caption: 16px;

  /* Espaçamento, raio, toque */
  --ds-sp-1: 4px;  --ds-sp-2: 8px;  --ds-sp-3: 12px; --ds-sp-4: 16px;
  --ds-sp-5: 24px; --ds-sp-6: 32px; --ds-sp-7: 48px; --ds-sp-8: 64px;
  --ds-radius: 8px; --ds-radius-card: 12px; --ds-radius-pill: 999px;
  --ds-touch: 44px;

  /* Movimento */
  --ds-dur-fast: 150ms; --ds-dur-base: 200ms; --ds-dur-slow: 300ms;
  --ds-ease: cubic-bezier(0.2, 0, 0, 1);
  --ds-ease-in: cubic-bezier(0, 0, 0.2, 1);

  color-scheme: light;
}

/*
  O tema escuro em DOIS lugares, e não é redundância.

  \`[data-theme="dark"]\` é a escolha explícita do botão. A consulta de mídia é o
  que o sistema operacional já diz, e ela vale só enquanto ninguém escolheu o
  claro à mão: sem o \`:not([data-theme="light"])\`, quem trabalha num notebook
  em modo escuro não conseguiria ficar no tema claro.
*/
[data-theme="dark"] {
  --ds-bg:            var(--ds-ink-950);
  --ds-surface:       var(--ds-ink-850);
  --ds-surface-2:     var(--ds-ink-800);
  --ds-border:        var(--ds-ink-700);
  --ds-border-controle: var(--ds-ink-400);
  --ds-text:          var(--ds-ice);
  --ds-text-muted:    var(--ds-ink-400);
  --ds-accent:        var(--ds-violet-400);
  --ds-accent-hover:  var(--ds-violet-300);
  --ds-accent-graphic: var(--ds-violet-500);
  --ds-on-accent:     var(--ds-ink-950);

  --ds-info-fg:    #74C0FC;  --ds-info-bg:    rgba(116, 192, 252, 0.12);
  --ds-success-fg: #69DB7C;  --ds-success-bg: rgba(105, 219, 124, 0.12);
  --ds-danger-fg:  #FF8787;  --ds-danger-bg:  rgba(255, 135, 135, 0.12);

  --ds-shadow-1: 0 1px 2px rgba(0, 0, 0, 0.45);
  --ds-shadow-2: 0 4px 12px rgba(0, 0, 0, 0.50);
  --ds-shadow-3: 0 12px 28px rgba(0, 0, 0, 0.60);
  --ds-focus-ring: 0 0 0 2px var(--ds-bg), 0 0 0 4px var(--ds-violet-400);

  color-scheme: dark;
}

@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) {
    --ds-bg:            var(--ds-ink-950);
    --ds-surface:       var(--ds-ink-850);
    --ds-surface-2:     var(--ds-ink-800);
    --ds-border:        var(--ds-ink-700);
    --ds-border-controle: var(--ds-ink-400);
    --ds-text:          var(--ds-ice);
    --ds-text-muted:    var(--ds-ink-400);
    --ds-accent:        var(--ds-violet-400);
    --ds-accent-hover:  var(--ds-violet-300);
    --ds-accent-graphic: var(--ds-violet-500);
    --ds-on-accent:     var(--ds-ink-950);

    --ds-info-fg:    #74C0FC;  --ds-info-bg:    rgba(116, 192, 252, 0.12);
    --ds-success-fg: #69DB7C;  --ds-success-bg: rgba(105, 219, 124, 0.12);
    --ds-danger-fg:  #FF8787;  --ds-danger-bg:  rgba(255, 135, 135, 0.12);

    --ds-shadow-1: 0 1px 2px rgba(0, 0, 0, 0.45);
    --ds-shadow-2: 0 4px 12px rgba(0, 0, 0, 0.50);
    --ds-shadow-3: 0 12px 28px rgba(0, 0, 0, 0.60);
    --ds-focus-ring: 0 0 0 2px var(--ds-bg), 0 0 0 4px var(--ds-violet-400);

    color-scheme: dark;
  }
}

/*
  Movimento reduzido, e este bloco faz parte do CONTRATO de movimento, e não de
  um componente. Ele mora aqui em cima junto dos tokens por isso: é o único
  lugar da folha onde uma duração é escrita à mão, de propósito.

  A exceção da roda de carregamento é deliberada. Animação decorativa para de
  vez quando o sistema pede movimento reduzido, mas a roda não é decoração: ela
  é a única prova de que a espera de alguns segundos da derivação scrypt não
  travou. Um disco parado durante cinco segundos parece um botão quebrado, que é
  exatamente o defeito que ela existe para corrigir. Ela continua girando,
  devagar.
*/
@media (prefers-reduced-motion: reduce) {
  :root { --ds-dur-fast: 0ms; --ds-dur-base: 0ms; --ds-dur-slow: 0ms; }
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
  }
  .roda {
    animation-duration: 1.2s !important;
    animation-iteration-count: infinite !important;
  }
}
/* ============ FIM DOS TOKENS ============ */

*, *::before, *::after { box-sizing: border-box; }

/*
  ESCONDER COM \`hidden\` PRECISA VENCER, e esta regra existe por um defeito que
  só apareceu abrindo a página num navegador de verdade.

  O atributo \`hidden\` vira \`display: none\` por uma regra do próprio
  navegador, e a especificidade dessa regra é a mais baixa que existe. Qualquer
  \`display\` escrito num componente ganha dela: \`.botao { display: inline-flex }\`
  fazia o botão "Sair" aparecer na tela de LOGIN, e \`.recado { display: flex }\`
  desenhava uma caixa de erro vazia, com ícone de alerta e tudo, antes de alguém
  ter tentado entrar. O script fazia tudo certo: ele marcava \`hidden\`, e a
  folha de estilo desmarcava.

  \`!important\` aqui é o uso legítimo dele: é o navegador que precisa ganhar do
  componente, e não o contrário.
*/
[hidden] { display: none !important; }

body {
  margin: 0;
  min-height: 100vh;
  background: var(--ds-bg);
  color: var(--ds-text);
  font-family: var(--ds-font);
  font-size: var(--ds-fs-body);
  line-height: var(--ds-lh-body);
  -webkit-font-smoothing: antialiased;
  transition: background var(--ds-dur-base) var(--ds-ease),
              color var(--ds-dur-base) var(--ds-ease);
}

.folha-de-icones { display: none; }

.mono { font-family: var(--ds-font-mono); font-variant-numeric: tabular-nums; }

.oculto {
  position: absolute; width: 1px; height: 1px;
  overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap;
}

.icone {
  width: 20px; height: 20px;
  flex: 0 0 auto;
  fill: none;
  stroke: currentColor;
  stroke-width: 1.8;
  stroke-linecap: round;
  stroke-linejoin: round;
}

/* ---------------- A barra do topo ---------------- */

.barra {
  position: sticky;
  top: 0;
  z-index: 10;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--ds-sp-4);
  flex-wrap: wrap;
  padding: var(--ds-sp-3) var(--ds-sp-5);
  background: var(--ds-surface);
  border-bottom: 1px solid var(--ds-border);
  box-shadow: var(--ds-shadow-1);
}

.marca { display: flex; align-items: center; gap: var(--ds-sp-3); }

/*
  O selo da marca é o único lugar da tela com gradiente e brilho, e as duas
  pontas dele são tokens (a decisão de 2026-08-20 permite exatamente isso, e
  proíbe gradiente no fundo da tela inteira).
*/
.marca-selo {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 38px; height: 38px;
  border-radius: var(--ds-radius);
  background: var(--ds-accent-gradient);
  color: var(--ds-on-accent);
  box-shadow: var(--ds-accent-glow);
}

.marca-texto { display: flex; flex-direction: column; line-height: var(--ds-lh-caption); }
.marca-produto {
  font-size: var(--ds-fs-caption);
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--ds-text-muted);
}
.marca-titulo { font-size: var(--ds-fs-body); font-weight: 600; }

.barra-acoes { display: flex; align-items: center; gap: var(--ds-sp-2); }

.quem {
  display: inline-flex;
  align-items: center;
  gap: var(--ds-sp-2);
  margin: 0;
  padding: var(--ds-sp-1) var(--ds-sp-3);
  font-size: var(--ds-fs-body-sm);
  color: var(--ds-text-muted);
  background: var(--ds-surface-2);
  border-radius: var(--ds-radius-pill);
}
.quem .icone { width: 16px; height: 16px; color: var(--ds-accent); }

/* ---------------- Botões ---------------- */

.botao {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: var(--ds-sp-2);
  min-height: var(--ds-touch);
  padding: 0 var(--ds-sp-4);
  font-family: inherit;
  font-size: var(--ds-fs-body-sm);
  font-weight: 600;
  color: var(--ds-text);
  background: var(--ds-surface);
  border: 1px solid var(--ds-border-controle);
  border-radius: var(--ds-radius);
  cursor: pointer;
  transition: background var(--ds-dur-fast) var(--ds-ease),
              border-color var(--ds-dur-fast) var(--ds-ease),
              color var(--ds-dur-fast) var(--ds-ease),
              box-shadow var(--ds-dur-fast) var(--ds-ease),
              transform var(--ds-dur-fast) var(--ds-ease);
}
.botao:hover { background: var(--ds-surface-2); }
.botao:active { transform: translateY(1px); }

.botao-forte {
  color: var(--ds-on-accent);
  background: var(--ds-accent);
  border-color: var(--ds-accent);
  box-shadow: var(--ds-shadow-1);
}
.botao-forte:hover {
  background: var(--ds-accent-hover);
  border-color: var(--ds-accent-hover);
  box-shadow: var(--ds-shadow-2);
}

.botao-discreto { background: transparent; }
.botao-discreto:hover { background: var(--ds-surface-2); }

.botao-texto {
  color: var(--ds-text-muted);
  background: transparent;
  border-color: transparent;
}
.botao-texto:hover { color: var(--ds-text); background: var(--ds-surface-2); }

.botao-largo { width: 100%; margin-top: var(--ds-sp-4); }

.botao-icone { width: var(--ds-touch); padding: 0; }

/*
  Botão desabilitado precisa PARECER desabilitado e continuar legível: a
  opacidade sozinha derruba o contraste do rótulo abaixo do mínimo, então o
  cursor e a ausência de hover fazem o resto do trabalho.
*/
.botao[disabled] {
  cursor: progress;
  opacity: 0.72;
  transform: none;
  box-shadow: none;
}
/* O hover não responde enquanto o botão está travado, e cada variante volta
   para o fundo DELA: uma regra genérica com o fundo de destaque aqui pintaria
   de violeta um botão neutro e deixaria o rótulo escuro em cima. */
.botao[disabled]:hover { background: var(--ds-surface); }
.botao-forte[disabled]:hover { background: var(--ds-accent); }
.botao-discreto[disabled]:hover, .botao-texto[disabled]:hover { background: transparent; }

:focus-visible { outline: none; box-shadow: var(--ds-focus-ring); border-radius: var(--ds-radius); }

/* O ícone do tema: um por tema, e o outro sai do fluxo. */
.no-escuro { display: none; }
[data-theme="dark"] .no-claro { display: none; }
[data-theme="dark"] .no-escuro { display: inline; }
@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) .no-claro { display: none; }
  :root:not([data-theme="light"]) .no-escuro { display: inline; }
}

/* ---------------- A roda de carregamento ---------------- */

/*
  A prova de que o clique chegou.

  A conferência de senha deste console gasta uma derivação scrypt de cerca de
  128 MB: rápida no notebook de quem desenvolve, de outra ordem numa máquina
  pequena de servidor. É exatamente aí que a tela sem sinal de espera vira
  "cliquei e não aconteceu nada", e o operador clica de novo.
*/
.roda {
  display: none;
  width: 16px; height: 16px;
  border: 2px solid currentColor;
  border-top-color: transparent;
  border-radius: var(--ds-radius-pill);
  animation: girar calc(var(--ds-dur-slow) * 2.5) linear infinite;
}
.botao[aria-busy="true"] .roda { display: inline-block; }
.botao[aria-busy="true"] .icone { display: none; }

@keyframes girar { to { transform: rotate(360deg); } }

/* ---------------- Telas e cartões ---------------- */

main { padding: var(--ds-sp-5); }

.tela { max-width: 1240px; margin: 0 auto; }
.tela-porta {
  display: flex;
  align-items: flex-start;
  justify-content: center;
  padding-top: var(--ds-sp-7);
}

/*
  Entrada de tela, mais longa que uma resposta a toque e com a duração saindo
  de calc() sobre um token, como a decisão de 2026-08-20 autoriza.
*/
.entra { animation: subir calc(var(--ds-dur-slow) * 1.5) var(--ds-ease) both; }
@keyframes subir {
  from { opacity: 0; transform: translateY(var(--ds-sp-3)); }
  to { opacity: 1; transform: none; }
}

.cartao {
  position: relative;
  background: var(--ds-surface);
  border: 1px solid var(--ds-border);
  border-radius: var(--ds-radius-card);
  box-shadow: var(--ds-shadow-1);
}

.cartao-porta {
  width: 100%;
  max-width: 440px;
  padding: var(--ds-sp-6);
  overflow: hidden;
  box-shadow: var(--ds-shadow-3);
}

/* A fita de marca no topo do cartão da porta. Decoração, e só. */
.fita {
  position: absolute;
  inset: 0 0 auto 0;
  height: 4px;
  background: var(--ds-accent-gradient);
}

.porta-cabeca { margin-bottom: var(--ds-sp-5); }

.emblema {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 48px; height: 48px;
  margin-bottom: var(--ds-sp-4);
  border-radius: var(--ds-radius);
  color: var(--ds-accent);
  background: var(--ds-surface-2);
}
.emblema .icone { width: 24px; height: 24px; }

h2 {
  margin: 0;
  font-size: var(--ds-fs-h3);
  line-height: var(--ds-lh-h3);
  font-weight: 600;
  letter-spacing: -0.01em;
}

.apoio {
  margin: var(--ds-sp-2) 0 0;
  font-size: var(--ds-fs-body-sm);
  line-height: var(--ds-lh-body-sm);
  color: var(--ds-text-muted);
}

.rodape-cartao {
  margin: var(--ds-sp-5) 0 0;
  padding-top: var(--ds-sp-4);
  border-top: 1px solid var(--ds-border);
  font-size: var(--ds-fs-caption);
  line-height: var(--ds-lh-caption);
  color: var(--ds-text-muted);
}

.rodape {
  max-width: 1240px;
  margin: 0 auto;
  padding: var(--ds-sp-5) var(--ds-sp-5) var(--ds-sp-7);
  font-size: var(--ds-fs-caption);
  line-height: var(--ds-lh-caption);
  color: var(--ds-text-muted);
}
.rodape p { margin: 0; }

/* ---------------- Campos ---------------- */

.campo { margin-top: var(--ds-sp-4); }

label {
  display: block;
  margin-bottom: var(--ds-sp-2);
  font-size: var(--ds-fs-body-sm);
  font-weight: 600;
}

.entrada {
  display: flex;
  align-items: center;
  gap: var(--ds-sp-2);
  padding: 0 var(--ds-sp-3);
  background: var(--ds-bg);
  border: 1px solid var(--ds-border-controle);
  border-radius: var(--ds-radius);
  transition: border-color var(--ds-dur-fast) var(--ds-ease),
              box-shadow var(--ds-dur-fast) var(--ds-ease),
              background var(--ds-dur-fast) var(--ds-ease);
}
.entrada:hover { background: var(--ds-surface-2); }
.entrada:focus-within {
  border-color: var(--ds-accent);
  box-shadow: var(--ds-focus-ring);
  background: var(--ds-surface);
}
.entrada-icone { color: var(--ds-text-muted); }
.entrada:focus-within .entrada-icone { color: var(--ds-accent); }

input {
  flex: 1 1 auto;
  width: 100%;
  min-height: var(--ds-touch);
  padding: 0;
  font-family: inherit;
  font-size: var(--ds-fs-body);
  color: var(--ds-text);
  background: transparent;
  border: 0;
}
input:focus-visible { outline: none; box-shadow: none; }
input::placeholder { color: var(--ds-text-muted); opacity: 0.8; }

#uf { text-transform: uppercase; }

.entrada-codigo {
  font-size: var(--ds-fs-h3);
  letter-spacing: 0.35em;
}

.ajuda {
  margin: var(--ds-sp-2) 0 0;
  font-size: var(--ds-fs-caption);
  line-height: var(--ds-lh-caption);
  color: var(--ds-text-muted);
}

.passo {
  display: flex;
  align-items: center;
  gap: var(--ds-sp-2);
  flex-wrap: wrap;
  margin: 0;
  font-size: var(--ds-fs-body-sm);
  color: var(--ds-text-muted);
}
.passo-conta {
  padding: var(--ds-sp-1) var(--ds-sp-2);
  font-size: var(--ds-fs-caption);
  font-weight: 600;
  color: var(--ds-accent);
  background: var(--ds-surface-2);
  border-radius: var(--ds-radius-pill);
}

.dupla { display: flex; gap: var(--ds-sp-3); flex-wrap: wrap; }
.dupla > .campo { flex: 1 1 220px; }
.dupla > .estreito { flex: 0 1 140px; }

.secao {
  margin: var(--ds-sp-5) 0 0;
  padding-top: var(--ds-sp-4);
  border-top: 1px solid var(--ds-border);
  font-size: var(--ds-fs-body-sm);
  font-weight: 600;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--ds-text-muted);
}
form > .secao:first-child { margin-top: 0; padding-top: 0; border-top: 0; }

/* ---------------- Recados ---------------- */

/*
  Erro NUNCA é só cor: o recado tem ícone de alerta, fundo próprio e a frase
  inteira. Quem não distingue vermelho continua vendo que aquele parágrafo
  apareceu e que ele é diferente dos outros.
*/
.recado {
  display: flex;
  align-items: flex-start;
  gap: var(--ds-sp-2);
  margin: var(--ds-sp-4) 0 0;
  padding: var(--ds-sp-3);
  font-size: var(--ds-fs-body-sm);
  line-height: var(--ds-lh-body-sm);
  color: var(--ds-danger-fg);
  background: var(--ds-danger-bg);
  border-radius: var(--ds-radius);
  animation: subir var(--ds-dur-base) var(--ds-ease) both;
}
.recado .icone { width: 18px; height: 18px; margin-top: 1px; }

/* ---------------- O painel ---------------- */

.topo {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: var(--ds-sp-4);
  flex-wrap: wrap;
  margin-bottom: var(--ds-sp-5);
}
.topo .apoio { max-width: 60ch; }
.acoes { display: flex; gap: var(--ds-sp-2); flex-wrap: wrap; }

.indicadores {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(190px, 1fr));
  gap: var(--ds-sp-3);
  margin-bottom: var(--ds-sp-4);
}

/*
  Cartão de destaque com elevação 2, fora de dropdown e de modal. A decisão de
  2026-08-20 autoriza exatamente isto para indicador de painel, desde que seja
  deliberado e consistente entre telas, e é: os quatro sobem juntos.
*/
.indicador {
  padding: var(--ds-sp-4);
  box-shadow: var(--ds-shadow-2);
  transition: transform var(--ds-dur-base) var(--ds-ease),
              box-shadow var(--ds-dur-base) var(--ds-ease);
}
.indicador:hover { transform: translateY(-2px); box-shadow: var(--ds-shadow-3); }

.indicador-rotulo {
  display: flex;
  align-items: center;
  gap: var(--ds-sp-2);
  margin: 0;
  font-size: var(--ds-fs-caption);
  font-weight: 600;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--ds-text-muted);
}
.indicador-rotulo .icone { width: 16px; height: 16px; }

.indicador-numero {
  margin: var(--ds-sp-2) 0 0;
  font-size: var(--ds-fs-display);
  line-height: var(--ds-lh-display);
  font-weight: 400;
  letter-spacing: -0.02em;
}
.indicador-nota {
  margin: var(--ds-sp-1) 0 0;
  font-size: var(--ds-fs-caption);
  line-height: var(--ds-lh-caption);
  color: var(--ds-text-muted);
}

/* O cartão de calados vira alarme quando há alguém calado, e a palavra na nota
   muda junto: a cor sozinha nunca conta a história. */
.indicador.acesa { border-color: var(--ds-danger-fg); }
.indicador.acesa .indicador-rotulo, .indicador.acesa .indicador-numero {
  color: var(--ds-danger-fg);
}

.cartao-tabela { overflow: hidden; }
.rolagem { overflow-x: auto; }

/*
  \`width: max-content\` com \`min-width: 100%\`, e nao \`width: 100%\`: sao dez
  colunas, e com largura travada em 100% o navegador aperta as colunas ate o
  cabecalho cortar no meio da palavra antes de comecar a rolar. Assim cada
  coluna fica do tamanho que precisa, a tabela ocupa o cartao inteiro quando
  cabe, e a rolagem horizontal faz o resto.
*/
table {
  min-width: 100%;
  width: max-content;
  border-collapse: collapse;
  font-size: var(--ds-fs-body-sm);
  font-variant-numeric: tabular-nums;
}
th, td {
  padding: var(--ds-sp-3) var(--ds-sp-4);
  text-align: left;
  white-space: nowrap;
  border-bottom: 1px solid var(--ds-border);
}
th.n, td.n { text-align: right; }
thead th {
  position: sticky;
  top: 0;
  font-size: var(--ds-fs-caption);
  font-weight: 600;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--ds-text-muted);
  background: var(--ds-surface-2);
}
tbody th { font-weight: 600; }
tbody tr { transition: background var(--ds-dur-fast) var(--ds-ease); }
tbody tr:hover { background: var(--ds-surface-2); }
tbody tr:last-child th, tbody tr:last-child td { border-bottom: 0; }
td.n { font-family: var(--ds-font-mono); }

.marca-sinal {
  display: inline-flex;
  align-items: center;
  gap: var(--ds-sp-1);
  padding: var(--ds-sp-1) var(--ds-sp-3);
  font-size: var(--ds-fs-caption);
  font-weight: 600;
  border-radius: var(--ds-radius-pill);
}
.marca-sinal .icone { width: 14px; height: 14px; }
.marca-sinal.calado { color: var(--ds-danger-fg); background: var(--ds-danger-bg); }
.marca-sinal.em-dia { color: var(--ds-success-fg); background: var(--ds-success-bg); }

/* ---------------- Carregamento da tabela ---------------- */

/*
  O esqueleto: quatro linhas cinzentas piscando enquanto os números não
  chegaram. Sem ele, a tabela fica vazia por um tempo que parece erro, e o
  estado vazio de verdade ("nenhum município cadastrado") ficaria
  indistinguível de "ainda estou buscando".
*/
.esqueleto {
  display: block;
  height: var(--ds-sp-4);
  border-radius: var(--ds-radius-pill);
  background: linear-gradient(90deg,
    var(--ds-surface-2), var(--ds-border), var(--ds-surface-2));
  background-size: 200% 100%;
  animation: brilhar calc(var(--ds-dur-slow) * 4) var(--ds-ease) infinite;
}
.esqueleto-curto { width: 40%; }
.esqueleto-medio { width: 65%; }
.esqueleto-longo { width: 90%; }
td.n .esqueleto { margin-left: auto; }

@keyframes brilhar {
  from { background-position: 200% 0; }
  to { background-position: -200% 0; }
}

/* ---------------- Estado vazio ---------------- */

.vazio {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  padding: var(--ds-sp-7) var(--ds-sp-5);
}
.vazio-desenho {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 64px; height: 64px;
  margin-bottom: var(--ds-sp-4);
  color: var(--ds-accent);
  background: var(--ds-surface-2);
  border: 1px solid var(--ds-border);
  border-radius: var(--ds-radius-card);
}
.vazio-desenho .icone { width: 32px; height: 32px; }
.vazio-titulo { margin: 0; font-size: var(--ds-fs-body-lg); font-weight: 600; }
.vazio-apoio {
  max-width: 44ch;
  margin: var(--ds-sp-2) 0 var(--ds-sp-4);
  font-size: var(--ds-fs-body-sm);
  line-height: var(--ds-lh-body-sm);
  color: var(--ds-text-muted);
}
.vazio .botao { width: auto; }

#recado-painel { margin: var(--ds-sp-4); }

/* ---------------- A prefeitura nova ---------------- */

.cartao-forma { max-width: 720px; padding: var(--ds-sp-6); }

.selo-bom {
  display: inline-flex;
  align-items: center;
  gap: var(--ds-sp-2);
  margin: 0 0 var(--ds-sp-3);
  padding: var(--ds-sp-1) var(--ds-sp-3);
  font-size: var(--ds-fs-caption);
  font-weight: 600;
  color: var(--ds-success-fg);
  background: var(--ds-success-bg);
  border-radius: var(--ds-radius-pill);
}
.selo-bom .icone { width: 16px; height: 16px; }

.entregue-municipio {
  margin: 0;
  font-size: var(--ds-fs-h3);
  line-height: var(--ds-lh-h3);
  font-weight: 600;
}
.entregue-municipio:focus-visible { box-shadow: var(--ds-focus-ring); }

.cartao-entregue { box-shadow: var(--ds-shadow-2); }

.rotulo-senha {
  margin: var(--ds-sp-5) 0 var(--ds-sp-2);
  font-size: var(--ds-fs-body-sm);
  font-weight: 600;
}

/*
  A senha inicial: o único texto grande desta tela, de propósito.

  Ela vai ser DITADA por telefone ou copiada num papel, e o console é aberto num
  notebook de escritório que pode estar longe dos olhos de quem lê. Fonte
  monoespaçada porque "l", "1" e "I" precisam se distinguir, e o alfabeto do
  sorteio já evita os piores pares. \`user-select: all\` faz um clique só
  selecionar a senha inteira, sem botão de copiar: ela não passa pela área de
  transferência por nossa iniciativa, e não passa por armazenamento nenhum do
  navegador.
*/
.senha {
  margin: 0 0 var(--ds-sp-4);
  padding: var(--ds-sp-4);
  font-size: var(--ds-fs-h2);
  line-height: var(--ds-lh-h2);
  letter-spacing: 0.04em;
  word-break: break-all;
  background: var(--ds-bg);
  border: 1px dashed var(--ds-border-controle);
  border-radius: var(--ds-radius);
  user-select: all;
}

/*
  O aviso de "mostrada uma vez" NUNCA é só cor: ele tem ícone, a palavra
  "Atenção" em negrito e barra de um lado, então quem não distingue a cor do
  texto continua vendo que aquele parágrafo é diferente dos outros.
*/
.alerta {
  display: flex;
  align-items: flex-start;
  gap: var(--ds-sp-2);
  margin: 0;
  padding: var(--ds-sp-3);
  font-size: var(--ds-fs-body-sm);
  line-height: var(--ds-lh-body-sm);
  color: var(--ds-danger-fg);
  background: var(--ds-danger-bg);
  border-left: 4px solid currentColor;
  border-radius: 0 var(--ds-radius) var(--ds-radius) 0;
}
.alerta .icone { width: 18px; height: 18px; margin-top: 1px; }

.ids {
  margin: var(--ds-sp-5) 0 0;
  font-size: var(--ds-fs-caption);
  line-height: var(--ds-lh-caption);
  color: var(--ds-text-muted);
}
.ids dt { margin-top: var(--ds-sp-2); font-weight: 600; }
.ids dd { margin: var(--ds-sp-1) 0 0; word-break: break-all; color: var(--ds-text); }

/* ---------------- Telas estreitas ---------------- */

@media (max-width: 640px) {
  main { padding: var(--ds-sp-4); }
  .barra { padding: var(--ds-sp-3) var(--ds-sp-4); }
  .cartao-porta, .cartao-forma { padding: var(--ds-sp-4); }
  .tela-porta { padding-top: var(--ds-sp-4); }
  .indicador-numero { font-size: var(--ds-fs-h1); line-height: var(--ds-lh-h1); }
  .quem { display: none; }
}
`;

/**
 * O comportamento da tela.
 *
 * O TOKEN DA SESSÃO fica numa variável do módulo, e NÃO em `localStorage`. A
 * diferença é que fechar a aba encerra a sessão, e um console esquecido aberto
 * numa recepção não continua entrando sozinho amanhã. Como a sessão dura trinta
 * minutos e não se renova, guardar o token entre visitas não compraria quase
 * nada e custaria isso. O ÚNICO valor que este script guarda no navegador é o
 * nome do tema ("claro" ou "escuro"), que não é segredo de ninguém.
 *
 * A SENHA INICIAL da prefeitura recém-cadastrada NÃO entra em variável de
 * módulo, não entra em armazenamento do navegador e não passa pela área de
 * transferência por nossa iniciativa: ela vai direto para o `textContent` do
 * elemento que a mostra, e some dali quando o operador conclui ou sai. Guardá-la
 * em variável faria com que ela sobrevivesse à tela que a exibiu, e a promessa
 * desta tela é que ela aparece uma vez.
 *
 * TODO TEXTO VINDO DO SERVIDOR entra por `textContent`, nunca por `innerHTML`:
 * o nome do município é escrito por quem provisiona, e um console que
 * interpretasse HTML vindo do banco seria injeção de script na única tela que
 * enxerga mais de um município.
 *
 * TODA CHAMADA DE REDE PASSA POR `pedir`, e ela tem `try`/`catch`. Sem isso,
 * clicar em "Continuar" com o servidor reiniciando produzia uma promessa
 * rejeitada no console do navegador e efeito visível NENHUM na tela: o operador
 * clicava, nada acontecia, e não havia o que ele pudesse fazer a respeito.
 */
export const JS_DO_CONSOLE = `
"use strict";

var token = null;
var desafio = null;

var porta = document.getElementById("porta");
var painel = document.getElementById("painel");
var cadastro = document.getElementById("cadastro");

var formaSenha = document.getElementById("forma-senha");
var formaCodigo = document.getElementById("forma-codigo");
var formaCadastro = document.getElementById("forma-cadastro");
var entregue = document.getElementById("entregue");

var linhas = document.getElementById("linhas");
var vazio = document.getElementById("vazio");
var rolagem = document.getElementById("rolagem");
var indicadores = document.getElementById("indicadores");

var botaoContinuar = document.getElementById("continuar");
var botaoEntrar = document.getElementById("entrar");
var botaoCriar = document.getElementById("criar");
var botaoAtualizar = document.getElementById("atualizar");
var botaoSair = document.getElementById("sair");
var botaoTema = document.getElementById("tema");
var quem = document.getElementById("quem");

/* ======================================================================
   Tema
   ====================================================================== */

/**
 * Claro e escuro, os dois completos, com alternância visível no topo.
 *
 * O nome do tema é a ÚNICA coisa que este console guarda no navegador. Ele não
 * é segredo, e sem ele o operador que prefere o escuro voltaria ao claro a cada
 * recarga, que num plantão noturno é o tipo de detalhe que faz uma ferramenta
 * parecer descuidada. O acesso vai dentro de \`try\`, porque navegador com
 * armazenamento bloqueado lança em vez de devolver nulo, e uma exceção aqui
 * deixaria a página inteira sem comportamento.
 */
var CHAVE_DO_TEMA = "dc360-console-tema";

function lerTemaGuardado() {
  try {
    return window.localStorage.getItem(CHAVE_DO_TEMA);
  } catch (e) {
    return null;
  }
}

function guardarTema(nome) {
  try {
    window.localStorage.setItem(CHAVE_DO_TEMA, nome);
  } catch (e) {
    /* Sem armazenamento, o tema vale só para esta visita. Nada mais. */
  }
}

function temaDoSistema() {
  try {
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "escuro" : "claro";
  } catch (e) {
    return "claro";
  }
}

function aplicarTema(nome) {
  document.documentElement.setAttribute("data-theme", nome === "escuro" ? "dark" : "light");
  botaoTema.setAttribute("aria-pressed", nome === "escuro" ? "true" : "false");
  /* O rótulo diz o que o botão FAZ, e não em que tema a tela está. */
  document.getElementById("tema-rotulo").textContent =
    nome === "escuro" ? "Mudar para o modo claro" : "Mudar para o modo escuro";
}

var tema = lerTemaGuardado() === "escuro" || lerTemaGuardado() === "claro"
  ? lerTemaGuardado()
  : temaDoSistema();
aplicarTema(tema);

botaoTema.addEventListener("click", function () {
  tema = tema === "escuro" ? "claro" : "escuro";
  aplicarTema(tema);
  guardarTema(tema);
});

/* ======================================================================
   Recados e espera
   ====================================================================== */

function dizerEm(idRecado, idTexto, texto) {
  var caixa = document.getElementById(idRecado);
  document.getElementById(idTexto).textContent = texto || "";
  caixa.hidden = !texto;
}

function dizer(texto) { dizerEm("recado", "recado-texto", texto); }
function dizerNoPainel(texto) { dizerEm("recado-painel", "recado-painel-texto", texto); }
function dizerNoCadastro(texto) { dizerEm("recado-cadastro", "recado-cadastro-texto", texto); }

/**
 * Trava o botão, troca o rótulo e liga a roda enquanto a chamada não volta.
 *
 * As três coisas juntas, e não uma delas: a roda é a prova de que alguma coisa
 * está acontecendo, o rótulo diz O QUE está acontecendo, e \`disabled\` impede
 * que o operador mande o mesmo pedido duas vezes porque o primeiro demorou. O
 * \`aria-busy\` é o mesmo recado para quem ouve a tela em vez de olhar.
 */
function esperar(botao, idTexto, textoOcupado) {
  var alvo = document.getElementById(idTexto);
  var antes = alvo.textContent;
  botao.disabled = true;
  botao.setAttribute("aria-busy", "true");
  alvo.textContent = textoOcupado;
  return function devolver() {
    botao.disabled = false;
    botao.setAttribute("aria-busy", "false");
    alvo.textContent = antes;
  };
}

/**
 * Uma chamada ao servidor, e ela nunca explode na cara de quem chamou.
 *
 * O desfecho \`rede\` é o caso que faltava: servidor reiniciando, rede caída,
 * máquina em suspensão. O \`fetch\` REJEITA nesses casos, e sem este
 * \`try\`/\`catch\` a promessa morria sozinha, o botão ficava travado para
 * sempre e a tela não dizia nada.
 */
async function pedir(caminho, opcoes) {
  var resposta;
  try {
    resposta = await fetch(caminho, opcoes);
  } catch (e) {
    return { ok: false, rede: true, corpo: null };
  }
  var corpo = null;
  try { corpo = await resposta.json(); } catch (e) { corpo = null; }
  return { ok: resposta.ok, rede: false, corpo: corpo };
}

var FORA_DO_AR =
  "Não consegui falar com o servidor do console. Ele pode estar reiniciando. "
  + "Espere alguns segundos e tente de novo.";

/* ======================================================================
   A porta, em duas etapas
   ====================================================================== */

/**
 * Volta para o formulário de senha, e é ele que resolve o beco sem saída.
 *
 * O desafio da primeira etapa expira em minutos. Quem digitou o código depois
 * disso ficava preso no formulário do código, recebendo "a tentativa de entrada
 * expirou" para sempre, sem nenhum caminho de volta a não ser recarregar a
 * página. Quem está no plantão não recarrega a página: ele conclui que o
 * console quebrou e liga para alguém.
 */
function voltarParaSenha(texto) {
  desafio = null;
  formaCodigo.hidden = true;
  formaSenha.hidden = false;
  document.getElementById("codigo").value = "";
  document.getElementById("porta-titulo").textContent = "Entrar no console";
  dizer(texto || "");
  document.getElementById("senha").focus();
}

document.getElementById("voltar-para-senha").addEventListener("click", function () {
  voltarParaSenha("");
});

formaSenha.addEventListener("submit", async function (evento) {
  evento.preventDefault();
  dizer("");

  var email = document.getElementById("email").value;
  var devolver = esperar(botaoContinuar, "continuar-texto", "Conferindo a senha...");
  var r;
  try {
    r = await pedir("/entrar", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: email, senha: document.getElementById("senha").value })
    });
  } finally {
    devolver();
  }

  if (r.rede) { dizer(FORA_DO_AR); return; }
  if (!r.ok || !r.corpo || !r.corpo.desafio) {
    dizer((r.corpo && r.corpo.mensagem) || "Não foi possível entrar.");
    return;
  }

  desafio = r.corpo.desafio;
  document.getElementById("codigo-de-quem").textContent = email;
  document.getElementById("porta-titulo").textContent = "Código de verificação";
  formaSenha.hidden = true;
  formaCodigo.hidden = false;
  document.getElementById("codigo").focus();
});

formaCodigo.addEventListener("submit", async function (evento) {
  evento.preventDefault();
  dizer("");

  var devolver = esperar(botaoEntrar, "entrar-texto", "Conferindo o código...");
  var r;
  try {
    r = await pedir("/entrar/codigo", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        desafio: desafio,
        codigo: document.getElementById("codigo").value
      })
    });
  } finally {
    devolver();
  }

  if (r.rede) { dizer(FORA_DO_AR); return; }

  if (!r.ok || !r.corpo || !r.corpo.token) {
    var erro = r.corpo && r.corpo.erro;
    var mensagem = (r.corpo && r.corpo.mensagem) || "Código incorreto.";
    /*
      Desafio expirado ou inválido devolve a tela para a senha SOZINHA, em vez
      de deixar o operador batendo num formulário que já não tem como dar certo.
    */
    if (erro === "desafio_invalido") { voltarParaSenha(mensagem); return; }
    dizer(mensagem);
    return;
  }

  token = r.corpo.token;
  document.getElementById("quem-email").textContent = r.corpo.operador || "";
  quem.hidden = !r.corpo.operador;
  botaoSair.hidden = false;
  porta.hidden = true;
  painel.hidden = false;
  document.getElementById("senha").value = "";
  document.getElementById("codigo").value = "";
  await carregar();
});

botaoSair.addEventListener("click", function () {
  token = null;
  desafio = null;
  linhas.textContent = "";
  indicadores.hidden = true;
  painel.hidden = true;
  cadastro.hidden = true;
  esquecerSenha();
  porta.hidden = false;
  quem.hidden = true;
  botaoSair.hidden = true;
  document.getElementById("quem-email").textContent = "";
  voltarParaSenha("");
  document.getElementById("email").focus();
});

/* ======================================================================
   Cadastrar prefeitura
   ====================================================================== */

/**
 * A senha inicial vive na tela e em mais lugar nenhum.
 *
 * Ela não vai para variável de módulo, não vai para \`localStorage\` e não vai
 * para o histórico do navegador: entra por \`textContent\` no elemento que a
 * mostra, e sai de lá quando o operador conclui ou sai do console. O servidor
 * também não a guarda (ver cadastro.ts), então depois disto ela existe só na
 * cabeça e no papel de quem cadastrou, que é o desenho.
 */
function esquecerSenha() {
  document.getElementById("senha-inicial").textContent = "";
  document.getElementById("id-municipio").textContent = "";
  document.getElementById("id-admin").textContent = "";
  document.getElementById("entregue-municipio").textContent = "";
  document.getElementById("entregue-titulo").textContent = "";
  entregue.hidden = true;
  formaCadastro.hidden = false;
}

function abrirCadastro() {
  painel.hidden = true;
  cadastro.hidden = false;
  dizerNoCadastro("");
  esquecerSenha();
  document.getElementById("municipio").focus();
}

document.getElementById("abrir-cadastro").addEventListener("click", abrirCadastro);
document.getElementById("vazio-cadastrar").addEventListener("click", abrirCadastro);

function voltarAosMunicipios() {
  // Esquece a senha ANTES de trocar de tela: sair da tela sem limpar deixaria
  // a senha no documento, pronta para reaparecer com um "voltar".
  esquecerSenha();
  formaCadastro.reset();
  dizerNoCadastro("");
  cadastro.hidden = true;
  painel.hidden = false;
  carregar();
}

document.getElementById("voltar").addEventListener("click", voltarAosMunicipios);
document.getElementById("concluir").addEventListener("click", voltarAosMunicipios);

formaCadastro.addEventListener("submit", async function (evento) {
  evento.preventDefault();
  dizerNoCadastro("");

  // Trava o botão durante a chamada: um duplo clique aqui tentaria criar a
  // mesma prefeitura duas vezes, e a segunda voltaria como "já existe", com o
  // operador sem saber qual das duas respostas é a dele. O cadastro também
  // gasta uma derivação scrypt, então a espera é de segundos, não de instantes.
  var devolver = esperar(botaoCriar, "criar-texto", "Cadastrando...");
  var r;
  try {
    r = await pedir("/prefeituras", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: "Bearer " + token
      },
      body: JSON.stringify({
        municipio: document.getElementById("municipio").value,
        uf: document.getElementById("uf").value,
        orgao: document.getElementById("orgao").value,
        nome: document.getElementById("nome-admin").value,
        matricula: document.getElementById("matricula").value,
        email: document.getElementById("email-admin").value,
        operador: document.getElementById("operador").value
      })
    });
  } finally {
    devolver();
  }

  if (r.rede) { dizerNoCadastro(FORA_DO_AR); return; }

  if (!r.ok || !r.corpo || !r.corpo.senhaInicial) {
    dizerNoCadastro(
      (r.corpo && r.corpo.mensagem) || "Não foi possível cadastrar a prefeitura."
    );
    return;
  }

  document.getElementById("entregue-titulo").textContent =
    document.getElementById("municipio").value + " ("
    + document.getElementById("uf").value.toUpperCase() + ")";
  document.getElementById("entregue-municipio").textContent =
    "Administrador: " + document.getElementById("nome-admin").value + ".";
  document.getElementById("senha-inicial").textContent = r.corpo.senhaInicial;
  document.getElementById("id-municipio").textContent = r.corpo.organizacaoId;
  document.getElementById("id-admin").textContent = r.corpo.usuarioId;

  formaCadastro.hidden = true;
  entregue.hidden = false;
  document.getElementById("entregue-titulo").focus();
});

/* ======================================================================
   Os números
   ====================================================================== */

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

function somar(lista, campo) {
  var total = 0;
  var achou = false;
  lista.forEach(function (m) {
    if (m[campo] === null || m[campo] === undefined) return;
    achou = true;
    total += Number(m[campo]);
  });
  return achou ? String(total) : "-";
}

/** Um ícone do conjunto da página, para usar dentro de célula montada aqui. */
function icone(nome) {
  var svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("class", "icone");
  svg.setAttribute("aria-hidden", "true");
  var uso = document.createElementNS("http://www.w3.org/2000/svg", "use");
  uso.setAttribute("href", "#" + nome);
  svg.appendChild(uso);
  return svg;
}

/**
 * O esqueleto da tabela, enquanto os números não chegaram.
 *
 * Sem ele, a tabela fica vazia por um tempo que parece erro, e o estado vazio
 * de verdade ("nenhum município cadastrado") fica indistinguível de "ainda
 * estou buscando". São coisas diferentes e precisam parecer diferentes.
 */
function mostrarEsqueleto() {
  linhas.textContent = "";
  vazio.hidden = true;
  rolagem.setAttribute("aria-busy", "true");

  var larguras = ["esqueleto-longo", "esqueleto-medio", "esqueleto-curto", "esqueleto-medio"];
  for (var i = 0; i < 4; i++) {
    var tr = document.createElement("tr");
    for (var c = 0; c < 10; c++) {
      var td = document.createElement("td");
      if (c > 1) td.className = "n";
      var barra = document.createElement("span");
      barra.className = "esqueleto " + (c === 0 ? larguras[i] : "esqueleto-curto");
      td.appendChild(barra);
      tr.appendChild(td);
    }
    linhas.appendChild(tr);
  }
}

function resumir(lista) {
  var calados = 0;
  lista.forEach(function (m) { if (m.sem_escrita_recente) calados += 1; });

  document.getElementById("kpi-municipios").textContent = String(lista.length);
  document.getElementById("kpi-calados").textContent = String(calados);
  document.getElementById("kpi-abertas").textContent = somar(lista, "ocorrencias_abertas");
  document.getElementById("kpi-atrasadas").textContent = somar(lista, "ocorrencias_atrasadas");

  // O cartão acende, E a nota muda de texto: cor sozinha não conta a história.
  var cartao = document.getElementById("cartao-calados");
  if (calados > 0) cartao.classList.add("acesa");
  else cartao.classList.remove("acesa");
  document.getElementById("kpi-calados-nota").textContent = calados > 0
    ? "Precisam de uma ligação"
    : "Todos escreveram recentemente";

  document.getElementById("resumo-frase").textContent = lista.length === 0
    ? "Situação de uso por município."
    : "Situação de uso por município, " + lista.length + " no total.";

  indicadores.hidden = false;
}

async function carregar() {
  dizerNoPainel("");
  mostrarEsqueleto();
  var devolver = esperar(botaoAtualizar, "atualizar-texto", "Atualizando...");

  var r;
  try {
    r = await pedir("/municipios", { headers: { authorization: "Bearer " + token } });
  } finally {
    devolver();
    rolagem.setAttribute("aria-busy", "false");
  }

  if (r.rede) {
    linhas.textContent = "";
    dizerNoPainel(FORA_DO_AR);
    return;
  }

  if (!r.ok) {
    linhas.textContent = "";
    indicadores.hidden = true;
    painel.hidden = true;
    cadastro.hidden = true;
    porta.hidden = false;
    quem.hidden = true;
    botaoSair.hidden = true;
    token = null;
    voltarParaSenha("A sessão terminou. Entre de novo.");
    return;
  }

  var lista = (r.corpo && r.corpo.municipios) || [];
  linhas.textContent = "";
  vazio.hidden = lista.length > 0;
  resumir(lista);

  lista.forEach(function (m) {
    var tr = document.createElement("tr");

    var nome = document.createElement("th");
    nome.setAttribute("scope", "row");
    nome.textContent = m.municipio + " (" + m.uf + ")";
    tr.appendChild(nome);

    var sinal = document.createElement("td");
    var marca = document.createElement("span");
    marca.className = "marca-sinal " + (m.sem_escrita_recente ? "calado" : "em-dia");
    marca.appendChild(icone(m.sem_escrita_recente ? "i-silencio" : "i-pulso"));
    var horas = m.horas_desde_a_escrita;
    var palavra = document.createElement("span");
    palavra.textContent = m.sem_escrita_recente
      ? (horas === null || horas === undefined
          ? "calado, nunca escreveu"
          : "calado ha " + Math.round(horas) + " h")
      : "em dia";
    marca.appendChild(palavra);
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

botaoAtualizar.addEventListener("click", function () { carregar(); });
`;
