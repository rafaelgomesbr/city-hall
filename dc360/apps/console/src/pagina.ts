/**
 * A interface do console: uma página, cinco telas, dois diálogos, nenhum
 * passo de build.
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
 * AS DUAS AÇÕES PERIGOSAS por município (desativar o acesso, eliminar com sete
 * dias de arrependimento) e a ÁREA DE USUÁRIOS são só do dono, e a tela
 * ESCONDE os botões para o operador comum. Esconder não é controle de acesso:
 * o servidor responde 403 e o banco recusa por baixo; a tela só evita oferecer
 * o que a pessoa não pode fazer. As duas passam pelo diálogo do produto, com
 * as mesmas regras do aplicativo de campo: o botão que age REPETE o verbo com
 * o nome da prefeitura ("Agendar a eliminação de Serra Alta"), a ação
 * destrutiva tem desenho próprio e nunca só a cor, a recusa fica embaixo, e
 * Escape fecha. O resto da página fica `inert` enquanto a pergunta está
 * aberta.
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
  <symbol id="i-pessoas" viewBox="0 0 24 24">
    <circle cx="9" cy="8.5" r="3.2"/>
    <path d="M3.5 19.5v-1a5.5 5.5 0 0 1 11 0v1"/>
    <path d="M15.5 5.6a3.2 3.2 0 0 1 0 5.8M17.2 13.4a5.5 5.5 0 0 1 3.3 5.1v1"/>
  </symbol>
  <symbol id="i-chave" viewBox="0 0 24 24">
    <circle cx="8" cy="14.5" r="4"/>
    <path d="M10.8 11.7 19.5 3M16 6.5l2.5 2.5M13.5 9l2 2"/>
  </symbol>
  <symbol id="i-bloqueio" viewBox="0 0 24 24">
    <circle cx="12" cy="12" r="8.5"/>
    <path d="M6 6l12 12"/>
  </symbol>
  <symbol id="i-fechar" viewBox="0 0 24 24">
    <path d="M6 6l12 12M18 6 6 18"/>
  </symbol>
  <symbol id="i-ampulheta" viewBox="0 0 24 24">
    <path d="M6.5 3.5h11M6.5 20.5h11"/>
    <path d="M8 3.5v3.3a4 4 0 0 0 1.6 3.2L12 12l-2.4 2a4 4 0 0 0-1.6 3.2v3.3M16 3.5v3.3a4 4 0 0 1-1.6 3.2L12 12l2.4 2a4 4 0 0 1 1.6 3.2v3.3"/>
  </symbol>
</svg>

<header class="barra" id="cabecalho">
  <div class="marca">
    <span class="marca-selo"><svg class="icone" aria-hidden="true"><use href="#i-escudo"/></svg></span>
    <span class="marca-texto">
      <span class="marca-produto">Defesa Civil 360</span>
      <strong class="marca-titulo">Console do fornecedor</strong>
    </span>
  </div>

  <nav class="nav" id="nav" aria-label="Telas do console" hidden>
    <button id="ir-municipios" type="button" class="botao botao-texto" aria-current="page">
      <svg class="icone" aria-hidden="true"><use href="#i-predio"/></svg>
      <span>Municípios</span>
    </button>
    <button id="ir-usuarios" type="button" class="botao botao-texto" hidden>
      <svg class="icone" aria-hidden="true"><use href="#i-pessoas"/></svg>
      <span>Usuários</span>
    </button>
    <button id="ir-senha" type="button" class="botao botao-texto">
      <svg class="icone" aria-hidden="true"><use href="#i-chave"/></svg>
      <span>Minha senha</span>
    </button>
  </nav>

  <div class="barra-acoes">
    <p class="quem" id="quem" hidden>
      <svg class="icone" aria-hidden="true"><use href="#i-escudo"/></svg>
      <span id="quem-email" class="mono"></span>
      <span id="quem-papel" class="quem-papel"></span>
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

<main id="principal">

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

        <!--
          A saída de emergência, à vista na porta. Ela existe para o dia em que
          a senha se foi junto com o telefone: um código de recuperação (dos
          oito que a pessoa guardou) redefine a senha E o segundo fator.
        -->
        <button type="button" id="esqueci-senha" class="botao botao-texto botao-largo">
          <svg class="icone" aria-hidden="true"><use href="#i-chave"/></svg>
          <span>Esqueci a senha ou perdi o autenticador</span>
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

      <!-- ======== Esqueci a senha: um código de recuperação, sem sessão ======== -->
      <form id="forma-recuperar" hidden autocomplete="off" novalidate>
        <div class="campo">
          <label for="recuperar-email">Email</label>
          <span class="entrada">
            <svg class="icone entrada-icone" aria-hidden="true"><use href="#i-arroba"/></svg>
            <input id="recuperar-email" name="email" type="email" required autocomplete="username"
                   placeholder="voce@fornecedor.com.br" spellcheck="false">
          </span>
        </div>

        <div class="campo">
          <label for="recuperar-codigo">Um código de recuperação</label>
          <span class="entrada">
            <svg class="icone entrada-icone" aria-hidden="true"><use href="#i-chave"/></svg>
            <input id="recuperar-codigo" name="codigo" required maxlength="64" autocomplete="off"
                   spellcheck="false" autocapitalize="off" placeholder="xxxxx-xxxxx" class="mono">
          </span>
          <p class="ajuda">
            Um dos oito que você guardou. Maiúscula, espaço e hífen não importam.
            Ele vale uma vez só; os outros continuam valendo.
          </p>
        </div>

        <div class="dupla">
          <div class="campo">
            <label for="recuperar-senha">Senha nova</label>
            <span class="entrada">
              <input id="recuperar-senha" name="novaSenha" type="password" required minlength="12"
                     autocomplete="new-password">
            </span>
            <p class="ajuda">Pelo menos 12 caracteres.</p>
          </div>
          <div class="campo">
            <label for="recuperar-senha-2">Repita a senha nova</label>
            <span class="entrada">
              <input id="recuperar-senha-2" name="novaSenha2" type="password" required minlength="12"
                     autocomplete="new-password">
            </span>
          </div>
        </div>

        <!-- O botão repete o verbo, e o verbo diz as duas coisas que acontecem. -->
        <button type="submit" id="recuperar" class="botao botao-forte botao-largo">
          <span class="roda" aria-hidden="true"></span>
          <span id="recuperar-texto">Redefinir a senha e o segundo fator</span>
          <svg class="icone" aria-hidden="true"><use href="#i-chave"/></svg>
        </button>

        <button type="button" id="voltar-de-recuperar" class="botao botao-texto botao-largo">
          <svg class="icone" aria-hidden="true"><use href="#i-seta-esquerda"/></svg>
          <span>Voltar para a entrada</span>
        </button>
      </form>

      <!-- ======== Recuperado: o segredo novo, mostrado uma vez ======== -->
      <div id="recuperado" hidden>
        <p class="selo-bom">
          <svg class="icone" aria-hidden="true"><use href="#i-confere"/></svg>
          <span>Senha e segundo fator redefinidos</span>
        </p>
        <h3 id="recuperado-titulo" class="entregue-municipio" tabindex="-1">Configure o autenticador de novo</h3>
        <p class="apoio">
          O autenticador antigo não vale mais. Leia o código abaixo com o
          aplicativo, ou digite o segredo à mão, e entre com a senha nova.
        </p>

        <p class="rotulo-senha" id="rotulo-segredo-recuperado">Segredo novo do segundo fator</p>
        <p class="senha mono" id="recuperado-segredo" aria-labelledby="rotulo-segredo-recuperado"></p>

        <div class="qr-e-endereco">
          <div id="recuperado-qr" class="qr-moldura" hidden></div>
          <div class="endereco-bloco">
            <p class="rotulo-senha" id="rotulo-endereco-recuperado">Endereço para o aplicativo de autenticação</p>
            <p class="endereco mono" id="recuperado-endereco" aria-labelledby="rotulo-endereco-recuperado"></p>
          </div>
        </div>

        <p class="contagem" id="recuperado-restantes-linha">
          <svg class="icone" aria-hidden="true"><use href="#i-chave"/></svg>
          <span id="recuperado-restantes"></span>
        </p>

        <p class="alerta">
          <svg class="icone" aria-hidden="true"><use href="#i-alerta"/></svg>
          <span>
            <strong>Atenção:</strong> este segredo não fica guardado em lugar
            nenhum e não será mostrado de novo. Configure o aplicativo antes
            de sair desta tela.
          </span>
        </p>

        <button type="button" id="recuperado-entrar" class="botao botao-forte botao-largo">
          <span>Já configurei, ir para a entrada</span>
          <svg class="icone" aria-hidden="true"><use href="#i-seta-direita"/></svg>
        </button>
      </div>

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

    <!--
      A conta sem códigos de recuperação, avisada enquanto for verdade. O dono
      semeado de CONSOLE_OPERADORES nasce sem código, e sem ele perder a senha
      e o aparelho exige a credencial de dono do banco (docs/IMPLANTACAO.md,
      6.4). O número vem na resposta da entrada; some quando o lote é gerado.
    -->
    <div id="aviso-sem-codigos" class="recado recado-fixo" role="status" hidden>
      <svg class="icone" aria-hidden="true"><use href="#i-alerta"/></svg>
      <span id="aviso-sem-codigos-texto"></span>
      <button id="aviso-sem-codigos-ir" type="button" class="botao botao-texto">
        <svg class="icone" aria-hidden="true"><use href="#i-chave"/></svg>
        <span>Gerar em Minha senha</span>
      </button>
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
              <th scope="col">Acesso</th>
              <!--
                As ações vêm logo depois do estado, e não no fim: com doze
                colunas a tabela rola na horizontal, e um botão de "Cancelar
                eliminação" que só aparece rolando é um botão que ninguém
                vê a tempo.
              -->
              <th scope="col" id="th-acoes" hidden>Ações</th>
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

  <!-- ================= Usuários (só o dono) ================= -->
  <section id="usuarios" class="tela" hidden>
    <div class="topo">
      <div>
        <h2>Usuários do console</h2>
        <p class="apoio">
          Operadores abaixo do dono veem números e cadastram prefeitura. Só o
          dono desativa acesso, elimina município e mexe nesta lista. Operador
          se desativa, não se apaga.
        </p>
      </div>
      <button id="voltar-de-usuarios" type="button" class="botao botao-discreto">
        <svg class="icone" aria-hidden="true"><use href="#i-seta-esquerda"/></svg>
        <span>Voltar aos municípios</span>
      </button>
    </div>

    <div class="cartao cartao-tabela entra">
      <div class="rolagem" id="rolagem-operadores" aria-busy="false">
        <table>
          <caption class="oculto">Operadores do console</caption>
          <thead>
            <tr>
              <th scope="col">Email</th>
              <th scope="col">Papel</th>
              <th scope="col">Situação</th>
              <th scope="col">Criado em</th>
              <th scope="col">Ações</th>
            </tr>
          </thead>
          <tbody id="linhas-operadores"></tbody>
        </table>
      </div>
      <p id="recado-usuarios" class="recado" role="status" aria-live="polite" hidden>
        <svg class="icone" aria-hidden="true"><use href="#i-alerta"/></svg>
        <span id="recado-usuarios-texto"></span>
      </p>
    </div>

    <form id="forma-operador" class="cartao cartao-forma entra" autocomplete="off" novalidate>
      <h3 class="secao">Criar operador</h3>
      <div class="campo">
        <label for="email-operador">Email do operador</label>
        <span class="entrada">
          <svg class="icone entrada-icone" aria-hidden="true"><use href="#i-arroba"/></svg>
          <input id="email-operador" name="email" type="email" required maxlength="320"
                 spellcheck="false" placeholder="plantao@fornecedor.com.br">
        </span>
        <p class="ajuda">
          A senha e o segredo do segundo fator são sorteados pelo servidor e
          mostrados uma única vez, aqui nesta tela.
        </p>
      </div>
      <button type="submit" id="criar-operador" class="botao botao-forte botao-largo">
        <span class="roda" aria-hidden="true"></span>
        <span id="criar-operador-texto">Criar operador</span>
        <svg class="icone" aria-hidden="true"><use href="#i-mais"/></svg>
      </button>
      <p id="recado-operador" class="recado" role="status" aria-live="polite" hidden>
        <svg class="icone" aria-hidden="true"><use href="#i-alerta"/></svg>
        <span id="recado-operador-texto"></span>
      </p>
    </form>

    <div id="operador-entregue" class="cartao cartao-forma cartao-entregue entra" hidden>
      <p class="selo-bom">
        <svg class="icone" aria-hidden="true"><use href="#i-confere"/></svg>
        <span>Operador criado</span>
      </p>
      <h3 id="operador-titulo" class="entregue-municipio mono" tabindex="-1"></h3>

      <p class="rotulo-senha" id="rotulo-senha-operador">Senha inicial</p>
      <p class="senha mono" id="operador-senha" aria-labelledby="rotulo-senha-operador"></p>

      <p class="rotulo-senha" id="rotulo-segredo-operador">Segredo do segundo fator</p>
      <p class="senha mono" id="operador-segredo" aria-labelledby="rotulo-segredo-operador"></p>

      <div class="qr-e-endereco">
        <div id="operador-qr" class="qr-moldura" hidden></div>
        <div class="endereco-bloco">
          <p class="rotulo-senha" id="rotulo-endereco-operador">Endereço para o aplicativo de autenticação</p>
          <p class="endereco mono" id="operador-endereco" aria-labelledby="rotulo-endereco-operador"></p>
          <p class="ajuda">
            Leia o código com a câmera, ou digite o segredo à mão no aplicativo.
            Os dois caminhos dão o mesmo resultado.
          </p>
        </div>
      </div>

      <p class="rotulo-senha" id="rotulo-codigos-operador">Códigos de recuperação</p>
      <ol id="operador-codigos" class="codigos" aria-labelledby="rotulo-codigos-operador"></ol>
      <p class="ajuda">
        Oito, cada um vale uma vez. Com um deles a pessoa redefine a própria
        senha e o segundo fator sem precisar de ninguém. Ela pode gerar outros
        em "Minha senha", e gerar de novo invalida estes.
      </p>

      <p class="alerta">
        <svg class="icone" aria-hidden="true"><use href="#i-alerta"/></svg>
        <span>
          <strong>Atenção:</strong> a senha, o segredo e os códigos não ficam
          guardados em lugar nenhum e não serão mostrados de novo. Entregue por
          canal combinado, e peça a troca da senha na primeira entrada.
        </span>
      </p>

      <button type="button" id="operador-concluir" class="botao botao-forte botao-largo">
        <span>Já entreguei, concluir</span>
        <svg class="icone" aria-hidden="true"><use href="#i-seta-direita"/></svg>
      </button>
    </div>
  </section>

  <!-- ================= A minha senha ================= -->
  <section id="minha-senha" class="tela" hidden>
    <div class="topo">
      <div>
        <h2>Minha senha</h2>
        <p class="apoio">
          Trocar a senha pede a senha atual e um código NOVO do aplicativo de
          autenticação, não o da entrada, e derruba as outras sessões desta
          conta. Embaixo, os códigos de recuperação.
        </p>
      </div>
      <button id="voltar-da-senha" type="button" class="botao botao-discreto">
        <svg class="icone" aria-hidden="true"><use href="#i-seta-esquerda"/></svg>
        <span>Voltar aos municípios</span>
      </button>
    </div>

    <form id="forma-senha-nova" class="cartao cartao-forma entra" autocomplete="off" novalidate>
      <div class="campo">
        <label for="senha-atual">Senha atual</label>
        <span class="entrada">
          <svg class="icone entrada-icone" aria-hidden="true"><use href="#i-cadeado"/></svg>
          <input id="senha-atual" name="senhaAtual" type="password" required autocomplete="current-password">
        </span>
      </div>
      <div class="campo">
        <label for="codigo-troca">Código novo do aplicativo de autenticação</label>
        <span class="entrada">
          <svg class="icone entrada-icone" aria-hidden="true"><use href="#i-digitos"/></svg>
          <input id="codigo-troca" name="codigo" inputmode="numeric" autocomplete="one-time-code"
                 maxlength="6" required placeholder="000000" class="mono entrada-codigo">
        </span>
        <p class="ajuda">Um código novo: o que abriu esta sessão já foi usado e não vale de novo.</p>
      </div>
      <div class="dupla">
        <div class="campo">
          <label for="senha-nova">Senha nova</label>
          <span class="entrada">
            <input id="senha-nova" name="novaSenha" type="password" required minlength="12"
                   autocomplete="new-password">
          </span>
          <p class="ajuda">Pelo menos 12 caracteres.</p>
        </div>
        <div class="campo">
          <label for="senha-nova-2">Repita a senha nova</label>
          <span class="entrada">
            <input id="senha-nova-2" name="novaSenha2" type="password" required minlength="12"
                   autocomplete="new-password">
          </span>
        </div>
      </div>

      <button type="submit" id="trocar" class="botao botao-forte botao-largo">
        <span class="roda" aria-hidden="true"></span>
        <span id="trocar-texto">Trocar a senha</span>
        <svg class="icone" aria-hidden="true"><use href="#i-chave"/></svg>
      </button>

      <p id="senha-trocada" class="selo-bom selo-bloco" role="status" hidden>
        <svg class="icone" aria-hidden="true"><use href="#i-confere"/></svg>
        <span>Senha trocada. As outras sessões desta conta foram encerradas.</span>
      </p>
      <p id="recado-senha" class="recado" role="status" aria-live="polite" hidden>
        <svg class="icone" aria-hidden="true"><use href="#i-alerta"/></svg>
        <span id="recado-senha-texto"></span>
      </p>
    </form>

    <!-- ======== Os códigos de recuperação ======== -->
    <div id="cartao-codigos" class="cartao cartao-forma entra">
      <h3 class="secao">Códigos de recuperação</h3>
      <p class="apoio">
        Oito códigos para o dia em que a senha se for junto com o telefone: um
        deles, na porta, em "Esqueci a senha", redefine a senha e o segundo
        fator. Cada código vale uma vez. Guarde fora do computador.
      </p>
      <p class="contagem" id="codigos-restantes-linha">
        <svg class="icone" aria-hidden="true"><use href="#i-chave"/></svg>
        <span id="codigos-restantes"></span>
      </p>

      <form id="forma-codigos" autocomplete="off" novalidate>
        <div class="dupla">
          <div class="campo">
            <label for="codigos-senha">Senha atual</label>
            <span class="entrada">
              <svg class="icone entrada-icone" aria-hidden="true"><use href="#i-cadeado"/></svg>
              <input id="codigos-senha" name="senha" type="password" required autocomplete="current-password">
            </span>
          </div>
          <div class="campo">
            <label for="codigos-codigo">Código novo do aplicativo</label>
            <span class="entrada">
              <svg class="icone entrada-icone" aria-hidden="true"><use href="#i-digitos"/></svg>
              <input id="codigos-codigo" name="codigo" inputmode="numeric" autocomplete="one-time-code"
                     maxlength="6" required placeholder="000000" class="mono entrada-codigo">
            </span>
          </div>
        </div>
        <p class="ajuda">A mesma régua da troca de senha: oito códigos na mão são a conta inteira.</p>

        <button type="submit" id="gerar-codigos" class="botao botao-forte botao-largo">
          <span class="roda" aria-hidden="true"></span>
          <span id="gerar-codigos-texto">Gerar códigos de recuperação</span>
          <svg class="icone" aria-hidden="true"><use href="#i-chave"/></svg>
        </button>
        <p id="recado-codigos" class="recado" role="status" aria-live="polite" hidden>
          <svg class="icone" aria-hidden="true"><use href="#i-alerta"/></svg>
          <span id="recado-codigos-texto"></span>
        </p>
      </form>

      <div id="codigos-entregues" hidden>
        <p class="selo-bom selo-bloco">
          <svg class="icone" aria-hidden="true"><use href="#i-confere"/></svg>
          <span>Códigos gerados. Anote os oito agora.</span>
        </p>
        <ol id="lista-de-codigos" class="codigos" aria-label="Os oito códigos de recuperação"></ol>
        <p class="alerta">
          <svg class="icone" aria-hidden="true"><use href="#i-alerta"/></svg>
          <span>
            <strong>Atenção:</strong> estes códigos não ficam guardados em lugar
            nenhum e não serão mostrados de novo. Gerar de novo invalida estes.
          </span>
        </p>
        <button type="button" id="codigos-concluir" class="botao botao-forte botao-largo">
          <span>Já guardei, concluir</span>
          <svg class="icone" aria-hidden="true"><use href="#i-seta-direita"/></svg>
        </button>
      </div>
    </div>
  </section>

</main>

<!--
  O DIÁLOGO DO PRODUTO, com as regras do aplicativo de campo: o botão que age
  repete o verbo com o nome do alvo, a ação destrutiva tem desenho próprio e
  nunca só a cor, a recusa fica embaixo, Escape fecha, e o resto da página fica
  \`inert\` enquanto a pergunta está aberta. Um diálogo genérico para as
  perguntas de sim ou não (com motivo opcional), e um próprio para eliminar,
  que é um formulário de quatro campos numa ordem que importa.
-->
<div id="dialogo" class="dialogo" hidden>
  <div class="dialogo-fundo" id="dialogo-fundo"></div>
  <div id="dialogo-cartao" class="cartao dialogo-cartao" role="dialog" aria-modal="true"
       aria-labelledby="dialogo-titulo" aria-describedby="dialogo-texto" tabindex="-1">
    <h2 id="dialogo-titulo"></h2>
    <p class="apoio" id="dialogo-texto"></p>
    <form id="forma-dialogo" novalidate>
      <div class="campo" id="dialogo-campo-motivo" hidden>
        <label for="dialogo-motivo">Motivo</label>
        <span class="entrada entrada-area">
          <textarea id="dialogo-motivo" name="motivo" rows="3" maxlength="2000"></textarea>
        </span>
        <p class="ajuda">Vai para a trilha do município e para a tela de quem reativar.</p>
      </div>
      <p id="recado-dialogo" class="recado" role="status" aria-live="polite" hidden>
        <svg class="icone" aria-hidden="true"><use href="#i-alerta"/></svg>
        <span id="recado-dialogo-texto"></span>
      </p>
      <div class="dialogo-acoes">
        <!-- O rótulo é trocado ao abrir, pelo verbo com o nome do alvo. -->
        <button type="submit" id="dialogo-agir" class="botao botao-forte botao-largo">
          <span class="roda" aria-hidden="true"></span>
          <span id="dialogo-agir-texto">Confirmar</span>
        </button>
        <button type="button" id="dialogo-recusar" class="botao botao-discreto botao-largo">
          <svg class="icone" aria-hidden="true"><use href="#i-fechar"/></svg>
          <span>Voltar sem fazer nada</span>
        </button>
      </div>
    </form>
  </div>
</div>

<div id="dialogo-eliminar" class="dialogo" hidden>
  <div class="dialogo-fundo" id="eliminar-fundo"></div>
  <div id="eliminar-cartao" class="cartao dialogo-cartao" role="dialog" aria-modal="true"
       aria-labelledby="eliminar-titulo" aria-describedby="eliminar-texto" tabindex="-1">
    <span class="emblema emblema-perigo"><svg class="icone" aria-hidden="true"><use href="#i-alerta"/></svg></span>
    <h2 id="eliminar-titulo"></h2>
    <p class="apoio" id="eliminar-texto">
      O acesso é suspenso agora, e o apagamento acontece daqui a sete dias.
      Durante o prazo dá para cancelar. Depois dele, some tudo o que este
      município tem no produto, e não há como voltar.
    </p>
    <form id="forma-eliminar" autocomplete="off" novalidate>
      <div class="campo">
        <label for="eliminar-senha">Sua senha atual</label>
        <span class="entrada">
          <svg class="icone entrada-icone" aria-hidden="true"><use href="#i-cadeado"/></svg>
          <input id="eliminar-senha" name="senha" type="password" required autocomplete="current-password">
        </span>
      </div>
      <div class="campo">
        <label for="eliminar-codigo">Código novo do aplicativo de autenticação</label>
        <span class="entrada">
          <svg class="icone entrada-icone" aria-hidden="true"><use href="#i-digitos"/></svg>
          <input id="eliminar-codigo" name="codigo" inputmode="numeric" autocomplete="one-time-code"
                 maxlength="6" required placeholder="000000" class="mono entrada-codigo">
        </span>
        <p class="ajuda">Não o da entrada: um código já usado é recusado.</p>
      </div>
      <div class="campo">
        <label for="eliminar-nome">Digite o nome exato da prefeitura</label>
        <span class="entrada">
          <input id="eliminar-nome" name="nome" required maxlength="200" spellcheck="false">
        </span>
        <p class="ajuda" id="eliminar-nome-ajuda"></p>
      </div>
      <div class="campo">
        <label for="eliminar-motivo">Motivo</label>
        <span class="entrada entrada-area">
          <textarea id="eliminar-motivo" name="motivo" rows="3" maxlength="2000" required></textarea>
        </span>
      </div>
      <p id="recado-eliminar" class="recado" role="status" aria-live="polite" hidden>
        <svg class="icone" aria-hidden="true"><use href="#i-alerta"/></svg>
        <span id="recado-eliminar-texto"></span>
      </p>
      <div class="dialogo-acoes">
        <button type="submit" id="eliminar-agir" class="botao botao-perigo botao-largo">
          <span class="roda" aria-hidden="true"></span>
          <span id="eliminar-agir-texto">Agendar a eliminação</span>
        </button>
        <button type="button" id="eliminar-recusar" class="botao botao-discreto botao-largo">
          <svg class="icone" aria-hidden="true"><use href="#i-fechar"/></svg>
          <span>Voltar sem eliminar</span>
        </button>
      </div>
    </form>
  </div>
</div>

<!--
  RESTAURAR O ACESSO DO ADMINISTRADOR (migração 054, decisão H06 B). Mesma
  régua do modal de eliminar: senha atual e código novo de quem clica, e o
  motivo escrito. O email é o que a pessoa DISSE ser o dela, digitado aqui:
  não há lista de administradores, porque o console não lê \`usuarios\` e uma
  lista seria o roteiro de quem liga se passando por um deles. A senha
  temporária aparece no próprio cartão, uma vez, e Escape NÃO a fecha (só o
  botão de concluir), pelo mesmo motivo da janela de senha temporária do
  painel: fechar por acidente perde a senha e obriga a restaurar de novo.
-->
<div id="dialogo-restaurar" class="dialogo" hidden>
  <div class="dialogo-fundo" id="restaurar-fundo"></div>
  <div id="restaurar-cartao" class="cartao dialogo-cartao" role="dialog" aria-modal="true"
       aria-labelledby="restaurar-titulo" aria-describedby="restaurar-texto" tabindex="-1">
    <span class="emblema emblema-perigo"><svg class="icone" aria-hidden="true"><use href="#i-chave"/></svg></span>
    <h2 id="restaurar-titulo" tabindex="-1"></h2>
    <p class="apoio" id="restaurar-texto">
      Gera uma senha temporária para o administrador deste município e encerra
      as sessões dele. Use só depois de conferir a identidade de quem pede por
      canal verificado, como manda o procedimento do console. A senha aparece
      uma única vez.
    </p>
    <p class="apoio" id="restaurar-historico" aria-live="polite"></p>

    <div id="restaurar-entregue" hidden>
      <p class="selo-bom">
        <svg class="icone" aria-hidden="true"><use href="#i-confere"/></svg>
        <span>Acesso restaurado</span>
      </p>
      <p class="rotulo-senha" id="rotulo-senha-restaurada">Senha temporária</p>
      <p class="senha mono" id="senha-restaurada" aria-labelledby="rotulo-senha-restaurada"></p>
      <p class="alerta">
        <svg class="icone" aria-hidden="true"><use href="#i-alerta"/></svg>
        <span>
          <strong>Atenção:</strong> esta senha não fica guardada em lugar nenhum e
          não será mostrada de novo. Repasse pelo canal verificado, nunca por
          email nem por mensagem ao mesmo contato que fez o pedido.
          <span id="restaurar-validade"></span>
        </span>
      </p>
      <div class="dialogo-acoes">
        <button type="button" id="restaurar-concluir" class="botao botao-forte botao-largo">
          <span>Já repassei, concluir</span>
          <svg class="icone" aria-hidden="true"><use href="#i-seta-direita"/></svg>
        </button>
      </div>
    </div>

    <form id="forma-restaurar" autocomplete="off" novalidate>
      <div class="campo">
        <label for="restaurar-email">Email do administrador</label>
        <span class="entrada">
          <svg class="icone entrada-icone" aria-hidden="true"><use href="#i-arroba"/></svg>
          <input id="restaurar-email" name="email" type="email" required maxlength="320"
                 autocomplete="off" spellcheck="false">
        </span>
        <p class="ajuda">O email de entrada da pessoa, conferido com o cadastro do contrato.</p>
      </div>
      <div class="campo">
        <label for="restaurar-senha">Sua senha atual</label>
        <span class="entrada">
          <svg class="icone entrada-icone" aria-hidden="true"><use href="#i-cadeado"/></svg>
          <input id="restaurar-senha" name="senha" type="password" required autocomplete="current-password">
        </span>
      </div>
      <div class="campo">
        <label for="restaurar-codigo">Código novo do aplicativo de autenticação</label>
        <span class="entrada">
          <svg class="icone entrada-icone" aria-hidden="true"><use href="#i-digitos"/></svg>
          <input id="restaurar-codigo" name="codigo" inputmode="numeric" autocomplete="one-time-code"
                 maxlength="6" required placeholder="000000" class="mono entrada-codigo">
        </span>
        <p class="ajuda">Não o da entrada: um código já usado é recusado.</p>
      </div>
      <div class="campo">
        <label for="restaurar-motivo">Motivo</label>
        <span class="entrada entrada-area">
          <textarea id="restaurar-motivo" name="motivo" rows="3" maxlength="2000" required></textarea>
        </span>
        <p class="ajuda">
          Número do chamado e como a identidade foi conferida. Vai para a trilha
          do município, que lê quem do fornecedor mexeu na conta e por quê.
        </p>
      </div>
      <p id="recado-restaurar" class="recado" role="status" aria-live="polite" hidden>
        <svg class="icone" aria-hidden="true"><use href="#i-alerta"/></svg>
        <span id="recado-restaurar-texto"></span>
      </p>
      <div class="dialogo-acoes">
        <button type="submit" id="restaurar-agir" class="botao botao-perigo botao-largo">
          <span class="roda" aria-hidden="true"></span>
          <span id="restaurar-agir-texto">Restaurar o acesso</span>
        </button>
        <button type="button" id="restaurar-recusar" class="botao botao-discreto botao-largo">
          <svg class="icone" aria-hidden="true"><use href="#i-fechar"/></svg>
          <span>Voltar sem restaurar</span>
        </button>
      </div>
    </form>
  </div>
</div>

<footer class="rodape" id="rodape">
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
.quem-papel {
  padding: 0 var(--ds-sp-2);
  font-size: var(--ds-fs-caption);
  font-weight: 600;
  color: var(--ds-accent);
  text-transform: uppercase;
  letter-spacing: 0.06em;
}

/* ---------------- A navegação entre telas ---------------- */

.nav { display: flex; gap: var(--ds-sp-1); flex-wrap: wrap; }
.nav .botao[aria-current="page"] {
  color: var(--ds-accent);
  background: var(--ds-surface-2);
}

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

/*
  O tipo DESTRUTIVO do produto, o mesmo desenho de \`.botao--perigo\` no painel:
  fundo de perigo, texto de perigo, borda de perigo, e no hover inverte. Nunca
  só a cor: o rótulo dele repete o verbo com o nome do alvo, e o diálogo que o
  contém tem o emblema de alerta.
*/
.botao-perigo {
  color: var(--ds-danger-fg);
  background: var(--ds-danger-bg);
  border-color: var(--ds-danger-fg);
}
.botao-perigo:hover { color: var(--ds-surface); background: var(--ds-danger-fg); }
.botao-perigo[disabled]:hover { color: var(--ds-danger-fg); background: var(--ds-danger-bg); }

.botao-largo { width: 100%; margin-top: var(--ds-sp-4); }

.botao-icone { width: var(--ds-touch); padding: 0; }

/* Os botões de linha de tabela: os mesmos 44 px de toque, lado a lado. */
.acoes-linha { display: flex; gap: var(--ds-sp-2); flex-wrap: wrap; }
.acoes-linha .botao { font-size: var(--ds-fs-caption); padding: 0 var(--ds-sp-3); }

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

textarea {
  flex: 1 1 auto;
  width: 100%;
  min-height: calc(var(--ds-touch) * 2);
  padding: var(--ds-sp-3) 0;
  font-family: inherit;
  font-size: var(--ds-fs-body);
  line-height: var(--ds-lh-body);
  color: var(--ds-text);
  background: transparent;
  border: 0;
  resize: vertical;
}
textarea:focus-visible { outline: none; box-shadow: none; }
.entrada-area { align-items: stretch; }

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
/* O aviso que fica: alinhado com o botão de ação na mesma linha, quebrando
   quando a tela é estreita. O botão herda a cor do recado, para não parecer
   um botão de outra tela colado ali. */
.recado-fixo { align-items: center; flex-wrap: wrap; }
.recado-fixo > span { flex: 1 1 24ch; }
.recado-fixo .botao { color: inherit; }

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
/* Na tela de usuários a tabela tem um cartão embaixo (o formulário, ou a
   credencial recém-criada), e os dois não podem encostar. */
#usuarios .cartao-tabela { margin-bottom: var(--ds-sp-4); }

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

/*
  O estado de ACESSO do município, e cada um tem ícone, palavra e cor, nesta
  ordem de importância. "Ativo" é discreto; "suspenso" leva o cadeado e a
  frase com a data e o motivo; "eliminação" leva a ampulheta e o prazo por
  extenso, porque é a linha que alguém pode precisar cancelar a tempo.
*/
.marca-sinal.ativo { color: var(--ds-text-muted); background: var(--ds-surface-2); }
.marca-sinal.suspenso { color: var(--ds-info-fg); background: var(--ds-info-bg); }
.marca-sinal.eliminacao { color: var(--ds-danger-fg); background: var(--ds-danger-bg); }
.marca-sinal.desativado { color: var(--ds-text-muted); background: var(--ds-surface-2); }
td.estado { white-space: normal; max-width: 34ch; }

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

/* ---------------- O diálogo ---------------- */

/*
  Fundo escurecido de borda a borda, cartão centrado com a elevação 3 (a mesma
  do cartão da porta, e a decisão de 2026-08-20 autoriza a elevação alta em
  momento de confirmação). O cartão entra com a mesma animação das telas.
*/
.dialogo {
  position: fixed;
  inset: 0;
  z-index: 20;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: var(--ds-sp-4);
}
.dialogo-fundo {
  position: absolute;
  inset: 0;
  background: color-mix(in srgb, var(--ds-ink-950) 55%, transparent);
}
.dialogo-cartao {
  position: relative;
  width: 100%;
  max-width: 520px;
  max-height: calc(100vh - var(--ds-sp-6));
  overflow-y: auto;
  padding: var(--ds-sp-6);
  box-shadow: var(--ds-shadow-3);
  animation: subir calc(var(--ds-dur-slow) * 1.5) var(--ds-ease) both;
}
.dialogo-cartao:focus-visible { box-shadow: var(--ds-shadow-3), var(--ds-focus-ring); }
.dialogo-acoes { display: flex; flex-direction: column; gap: var(--ds-sp-2); margin-top: var(--ds-sp-4); }
.dialogo-acoes .botao-largo { margin-top: 0; }
/* O selo de "acesso restaurado" respira do título, como o de prefeitura cadastrada. */
#restaurar-entregue .selo-bom { margin-top: var(--ds-sp-3); }

.emblema-perigo { color: var(--ds-danger-fg); background: var(--ds-danger-bg); }

/* ---------------- O operador criado: QR e endereço ---------------- */

.qr-e-endereco {
  display: flex;
  gap: var(--ds-sp-5);
  align-items: flex-start;
  flex-wrap: wrap;
  margin-bottom: var(--ds-sp-4);
}
.qr-moldura {
  flex: 0 0 auto;
  width: 200px;
  padding: var(--ds-sp-2);
  background: var(--ds-white);
  border: 1px solid var(--ds-border);
  border-radius: var(--ds-radius);
}
.qr { display: block; width: 100%; height: auto; }
.qr__fundo { fill: var(--ds-white); }
.qr__modulo { fill: var(--ds-ink-950); }
.endereco-bloco { flex: 1 1 260px; min-width: 0; }
.endereco-bloco .rotulo-senha { margin-top: 0; }
.endereco {
  margin: 0;
  padding: var(--ds-sp-3);
  font-size: var(--ds-fs-caption);
  line-height: var(--ds-lh-caption);
  word-break: break-all;
  background: var(--ds-bg);
  border: 1px dashed var(--ds-border-controle);
  border-radius: var(--ds-radius);
  user-select: all;
}

.selo-bloco { display: flex; margin: var(--ds-sp-4) 0 0; padding: var(--ds-sp-3); }

/* ---------------- Os códigos de recuperação ---------------- */

/*
  Oito códigos numa grade, cada um no mesmo desenho da senha inicial (fonte
  monoespaçada, borda tracejada, um clique seleciona o código inteiro), porque
  eles vão para o mesmo lugar: um papel. A lista é numerada para quem anota
  conferir que anotou os oito.
*/
.codigos {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(170px, 1fr));
  gap: var(--ds-sp-2);
  margin: 0 0 var(--ds-sp-4);
  padding: 0;
  list-style: none;
  counter-reset: codigo;
}
.codigo {
  position: relative;
  padding: var(--ds-sp-3) var(--ds-sp-3) var(--ds-sp-3) var(--ds-sp-6);
  font-family: var(--ds-font-mono);
  font-size: var(--ds-fs-body-lg);
  line-height: var(--ds-lh-body-lg);
  letter-spacing: 0.06em;
  background: var(--ds-bg);
  border: 1px dashed var(--ds-border-controle);
  border-radius: var(--ds-radius);
  user-select: all;
}
.codigo::before {
  counter-increment: codigo;
  content: counter(codigo);
  position: absolute;
  left: var(--ds-sp-2);
  top: var(--ds-sp-3);
  font-family: var(--ds-font);
  font-size: var(--ds-fs-caption);
  line-height: var(--ds-lh-body-lg);
  color: var(--ds-text-muted);
  user-select: none;
}

/* A contagem "N códigos restantes": ícone mais a frase, nunca só número. */
.contagem {
  display: flex;
  align-items: center;
  gap: var(--ds-sp-2);
  margin: var(--ds-sp-4) 0 0;
  padding: var(--ds-sp-2) var(--ds-sp-3);
  font-size: var(--ds-fs-body-sm);
  line-height: var(--ds-lh-body-sm);
  font-weight: 600;
  color: var(--ds-text);
  background: var(--ds-surface-2);
  border-radius: var(--ds-radius);
}
.contagem .icone { width: 16px; height: 16px; color: var(--ds-accent); }
#recuperado-restantes-linha { margin-bottom: var(--ds-sp-4); }
/* O segundo cartão de "Minha senha" não encosta no primeiro. */
#cartao-codigos { margin-top: var(--ds-sp-4); }
#cartao-codigos .secao { margin-top: 0; padding-top: 0; border-top: 0; }
#recuperado .qr-e-endereco { margin-top: var(--ds-sp-2); }

/* ---------------- Telas estreitas ---------------- */

@media (max-width: 640px) {
  main { padding: var(--ds-sp-4); }
  .barra { padding: var(--ds-sp-3) var(--ds-sp-4); }
  .cartao-porta, .cartao-forma { padding: var(--ds-sp-4); }
  .tela-porta { padding-top: var(--ds-sp-4); }
  .indicador-numero { font-size: var(--ds-fs-h1); line-height: var(--ds-lh-h1); }
  .quem { display: none; }
  .dialogo-cartao { padding: var(--ds-sp-4); }
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
 * A SENHA INICIAL da prefeitura recém-cadastrada, a SENHA, o SEGREDO e os
 * CÓDIGOS DE RECUPERAÇÃO do operador recém-criado, os códigos gerados em
 * "Minha senha" e o SEGREDO NOVO que a recuperação devolve NÃO entram em
 * variável de módulo, não entram em armazenamento do navegador e não passam
 * pela área de transferência por nossa iniciativa: vão direto para o
 * `textContent` do elemento que os mostra, e somem dali quando o operador
 * conclui ou sai. Guardá-los em variável faria com que sobrevivessem à tela
 * que os exibiu, e a promessa dessa tela é que aparecem uma vez. A senha e o
 * código digitados no modal de eliminar, na troca de senha e na geração de
 * códigos são apagados dos campos assim que o pedido volta.
 *
 * TODO TEXTO VINDO DO SERVIDOR entra por `textContent`, nunca por `innerHTML`:
 * o nome do município é escrito por quem provisiona, e um console que
 * interpretasse HTML vindo do banco seria injeção de script na única tela que
 * enxerga mais de um município. O QR é desenhado elemento a elemento, com
 * `createElementNS`, a partir de uma matriz de "0" e "1".
 *
 * TODA CHAMADA DE REDE PASSA POR `pedir`, e ela tem `try`/`catch`. Sem isso,
 * clicar em "Continuar" com o servidor reiniciando produzia uma promessa
 * rejeitada no console do navegador e efeito visível NENHUM na tela: o operador
 * clicava, nada acontecia, e não havia o que ele pudesse fazer a respeito.
 *
 * O PAPEL vem da resposta da entrada e decide o que a tela OFERECE, e só isso.
 * Esconder o botão não é controle de acesso: o servidor responde 403 e o banco
 * recusa por baixo. A tela esconde para não oferecer o que a pessoa não pode
 * fazer, e trata o 403 mesmo assim, porque o papel pode mudar embaixo dela.
 */
export const JS_DO_CONSOLE = `
"use strict";

var token = null;
var desafio = null;
var papel = null;
var SVG = "http://www.w3.org/2000/svg";

var porta = document.getElementById("porta");
var painel = document.getElementById("painel");
var cadastro = document.getElementById("cadastro");
var usuarios = document.getElementById("usuarios");
var minhaSenha = document.getElementById("minha-senha");

var formaSenha = document.getElementById("forma-senha");
var formaCodigo = document.getElementById("forma-codigo");
var formaCadastro = document.getElementById("forma-cadastro");
var formaOperador = document.getElementById("forma-operador");
var formaSenhaNova = document.getElementById("forma-senha-nova");
var formaRecuperar = document.getElementById("forma-recuperar");
var formaCodigos = document.getElementById("forma-codigos");
var entregue = document.getElementById("entregue");
var operadorEntregue = document.getElementById("operador-entregue");
var recuperado = document.getElementById("recuperado");
var codigosEntregues = document.getElementById("codigos-entregues");

var linhas = document.getElementById("linhas");
var linhasOperadores = document.getElementById("linhas-operadores");
var vazio = document.getElementById("vazio");
var rolagem = document.getElementById("rolagem");
var indicadores = document.getElementById("indicadores");

var botaoContinuar = document.getElementById("continuar");
var botaoEntrar = document.getElementById("entrar");
var botaoCriar = document.getElementById("criar");
var botaoCriarOperador = document.getElementById("criar-operador");
var botaoTrocar = document.getElementById("trocar");
var botaoRecuperar = document.getElementById("recuperar");
var botaoGerarCodigos = document.getElementById("gerar-codigos");
var botaoAtualizar = document.getElementById("atualizar");
var botaoSair = document.getElementById("sair");
var botaoTema = document.getElementById("tema");
var quem = document.getElementById("quem");
var nav = document.getElementById("nav");
var irMunicipios = document.getElementById("ir-municipios");
var irUsuarios = document.getElementById("ir-usuarios");
var irSenha = document.getElementById("ir-senha");
var avisoSemCodigos = document.getElementById("aviso-sem-codigos");
var thAcoes = document.getElementById("th-acoes");

/* O texto de apoio da porta, para voltar depois de "Esqueci a senha". */
var APOIO_DA_PORTA = document.getElementById("porta-apoio").textContent;

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
function dizerNosUsuarios(texto) { dizerEm("recado-usuarios", "recado-usuarios-texto", texto); }
function dizerNoOperador(texto) { dizerEm("recado-operador", "recado-operador-texto", texto); }
function dizerNaSenha(texto) { dizerEm("recado-senha", "recado-senha-texto", texto); }
function dizerNoDialogo(texto) { dizerEm("recado-dialogo", "recado-dialogo-texto", texto); }
function dizerNoEliminar(texto) { dizerEm("recado-eliminar", "recado-eliminar-texto", texto); }
function dizerNoRestaurar(texto) { dizerEm("recado-restaurar", "recado-restaurar-texto", texto); }
function dizerNosCodigos(texto) { dizerEm("recado-codigos", "recado-codigos-texto", texto); }

/**
 * Trava o botão, troca o rótulo e liga a roda enquanto a chamada não volta.
 *
 * As três coisas juntas, e não uma delas: a roda é a prova de que alguma coisa
 * está acontecendo, o rótulo diz O QUE está acontecendo, e \`disabled\` impede
 * que o operador mande o mesmo pedido duas vezes porque o primeiro demorou. O
 * \`aria-busy\` é o mesmo recado para quem ouve a tela em vez de olhar.
 *
 * O rótulo pode vir por identificador (botões fixos do HTML) ou como elemento
 * (botões montados aqui, nas linhas da tabela).
 */
function esperar(botao, rotulo, textoOcupado) {
  var alvo = typeof rotulo === "string" ? document.getElementById(rotulo) : rotulo;
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

/** Um pedido com a sessão, em JSON. */
function pedirComSessao(caminho, metodo, corpo) {
  var opcoes = {
    method: metodo,
    headers: { authorization: "Bearer " + token }
  };
  if (corpo !== undefined) {
    opcoes.headers["content-type"] = "application/json";
    opcoes.body = JSON.stringify(corpo);
  }
  return pedir(caminho, opcoes);
}

var FORA_DO_AR =
  "Não consegui falar com o servidor do console. Ele pode estar reiniciando. "
  + "Espere alguns segundos e tente de novo.";

/** A frase certa para uma resposta recusada, com o 403 dito na letra. */
function mensagemDe(r, padrao) {
  if (r.rede) return FORA_DO_AR;
  if (r.corpo && r.corpo.erro === "so_o_dono") return "Só o dono do console faz isto.";
  return (r.corpo && r.corpo.mensagem) || padrao;
}

/* ======================================================================
   Telas
   ====================================================================== */

/**
 * Uma tela por vez, e a navegação diz em qual.
 *
 * Trocar de tela é a única coisa que este bloco faz, e é por ele que todo
 * botão de "voltar" e todo atalho da barra passam: assim não existe um caminho
 * que deixe duas telas visíveis ao mesmo tempo.
 */
function mostrar(tela) {
  painel.hidden = tela !== "painel";
  cadastro.hidden = tela !== "cadastro";
  usuarios.hidden = tela !== "usuarios";
  minhaSenha.hidden = tela !== "senha";
  porta.hidden = tela !== "porta";
  irMunicipios.setAttribute("aria-current", tela === "painel" || tela === "cadastro" ? "page" : "false");
  irUsuarios.setAttribute("aria-current", tela === "usuarios" ? "page" : "false");
  irSenha.setAttribute("aria-current", tela === "senha" ? "page" : "false");
}

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
  esquecerRecuperacao();
  formaCodigo.hidden = true;
  formaSenha.hidden = false;
  document.getElementById("codigo").value = "";
  document.getElementById("porta-titulo").textContent = "Entrar no console";
  document.getElementById("porta-apoio").textContent = APOIO_DA_PORTA;
  dizer(texto || "");
  document.getElementById("senha").focus();
}

document.getElementById("voltar-para-senha").addEventListener("click", function () {
  voltarParaSenha("");
});

/* ======================================================================
   Esqueci a senha: um código de recuperação, sem sessão
   ====================================================================== */

/**
 * O segredo novo que a recuperação devolve vive na tela e em mais lugar
 * nenhum, pela mesma regra da senha inicial: some quando a pessoa vai para a
 * entrada, ou quando qualquer caminho volta para o formulário da senha.
 */
function esquecerRecuperacao() {
  document.getElementById("recuperado-segredo").textContent = "";
  document.getElementById("recuperado-endereco").textContent = "";
  document.getElementById("recuperado-restantes").textContent = "";
  var qr = document.getElementById("recuperado-qr");
  qr.textContent = "";
  qr.hidden = true;
  recuperado.hidden = true;
  formaRecuperar.reset();
  document.getElementById("recuperar-codigo").value = "";
  document.getElementById("recuperar-senha").value = "";
  document.getElementById("recuperar-senha-2").value = "";
  formaRecuperar.hidden = true;
}

/** "N códigos de recuperação restantes", com a palavra, nunca só o número. */
function fraseDeRestantes(n) {
  n = Number(n) || 0;
  if (n === 0) return "Nenhum código de recuperação restante.";
  if (n === 1) return "1 código de recuperação restante.";
  return n + " códigos de recuperação restantes.";
}

function abrirRecuperacao() {
  dizer("");
  desafio = null;
  formaSenha.hidden = true;
  formaCodigo.hidden = true;
  recuperado.hidden = true;
  formaRecuperar.hidden = false;
  var email = document.getElementById("email").value;
  document.getElementById("recuperar-email").value = email;
  document.getElementById("porta-titulo").textContent = "Recuperar o acesso";
  document.getElementById("porta-apoio").textContent =
    "Um código de recuperação redefine a senha e troca o segundo fator: o "
    + "autenticador antigo deixa de valer, e o QR novo aparece aqui. Os outros "
    + "códigos continuam valendo.";
  document.getElementById(email ? "recuperar-codigo" : "recuperar-email").focus();
}

document.getElementById("esqueci-senha").addEventListener("click", abrirRecuperacao);
document.getElementById("voltar-de-recuperar").addEventListener("click", function () {
  voltarParaSenha("");
});

formaRecuperar.addEventListener("submit", async function (evento) {
  evento.preventDefault();
  dizer("");

  var email = document.getElementById("recuperar-email").value;
  var codigo = document.getElementById("recuperar-codigo").value.trim();
  var nova = document.getElementById("recuperar-senha").value;
  var nova2 = document.getElementById("recuperar-senha-2").value;

  if (!email.trim()) { dizer("Informe o email."); document.getElementById("recuperar-email").focus(); return; }
  if (!codigo) { dizer("Informe um código de recuperação."); document.getElementById("recuperar-codigo").focus(); return; }
  if (nova.length < 12) { dizer("A senha nova precisa ter pelo menos 12 caracteres."); return; }
  if (nova !== nova2) {
    dizer("As duas senhas novas não são iguais.");
    document.getElementById("recuperar-senha-2").focus();
    return;
  }

  /* Sem token: não há sessão, e é por isso que esta chamada não passa por
     pedirComSessao. A credencial é o código. */
  var devolver = esperar(botaoRecuperar, "recuperar-texto", "Redefinindo...");
  var r;
  try {
    r = await pedir("/recuperar", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: email, codigo: codigo, novaSenha: nova })
    });
  } finally {
    devolver();
  }

  if (r.rede) { dizer(FORA_DO_AR); return; }
  if (!r.ok || !r.corpo || !r.corpo.segredo) {
    dizer((r.corpo && r.corpo.mensagem) || "Não foi possível recuperar o acesso.");
    return;
  }

  document.getElementById("recuperado-segredo").textContent = emGrupos(r.corpo.segredo);
  document.getElementById("recuperado-endereco").textContent = r.corpo.endereco || "";
  desenharQr(document.getElementById("recuperado-qr"), r.corpo.qr);
  document.getElementById("recuperado-restantes").textContent =
    fraseDeRestantes(r.corpo.restantes) + " Só o código usado foi queimado.";

  /* O código e a senha nova saem dos campos: o código já não vale, e a senha
     não fica num campo de uma tela que pode ficar aberta. O email fica, para
     a entrada seguinte. */
  document.getElementById("recuperar-codigo").value = "";
  document.getElementById("recuperar-senha").value = "";
  document.getElementById("recuperar-senha-2").value = "";
  formaRecuperar.hidden = true;
  recuperado.hidden = false;
  document.getElementById("porta-titulo").textContent = "Acesso recuperado";
  document.getElementById("recuperado-titulo").focus();
});

document.getElementById("recuperado-entrar").addEventListener("click", function () {
  var email = document.getElementById("recuperar-email").value.trim();
  voltarParaSenha("");
  document.getElementById("email").value = email;
  document.getElementById("senha").focus();
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
  papel = r.corpo.papel === "dono" ? "dono" : "operador";
  document.getElementById("quem-email").textContent = r.corpo.operador || "";
  document.getElementById("quem-papel").textContent = papel === "dono" ? "dono" : "operador";
  mostrarAvisoDeCodigos(r.corpo.codigosDeRecuperacao);
  quem.hidden = !r.corpo.operador;
  botaoSair.hidden = false;
  nav.hidden = false;
  /* O que a tela OFERECE depende do papel. O que ela PERMITE, o servidor decide. */
  irUsuarios.hidden = papel !== "dono";
  thAcoes.hidden = papel !== "dono";
  mostrar("painel");
  document.getElementById("senha").value = "";
  document.getElementById("codigo").value = "";
  await carregar();
});

/**
 * Sair: esquece tudo o que só existe enquanto a sessão existe.
 *
 * Inclusive o que está DENTRO das telas que a pessoa não está vendo: a senha
 * inicial de uma prefeitura cadastrada e não concluída, a credencial de um
 * operador criado e não concluído, a tabela de operadores. Sair precisa deixar
 * o documento como ele estava antes de entrar.
 */
function sair(recado) {
  token = null;
  desafio = null;
  papel = null;
  avisoSemCodigos.hidden = true;
  linhas.textContent = "";
  linhasOperadores.textContent = "";
  indicadores.hidden = true;
  esquecerSenha();
  esquecerOperador();
  esquecerCodigos();
  document.getElementById("codigos-restantes").textContent = "";
  fecharDialogo();
  fecharEliminar();
  fecharRestaurar();
  formaSenhaNova.reset();
  document.getElementById("senha-trocada").hidden = true;
  mostrar("porta");
  quem.hidden = true;
  nav.hidden = true;
  irUsuarios.hidden = true;
  thAcoes.hidden = true;
  botaoSair.hidden = true;
  document.getElementById("quem-email").textContent = "";
  document.getElementById("quem-papel").textContent = "";
  voltarParaSenha(recado || "");
  document.getElementById("email").focus();
}

botaoSair.addEventListener("click", function () { sair(""); });

/** Sessão terminada no servidor: volta para a porta com o recado. */
function sessaoTerminou() {
  sair("A sessão terminou. Entre de novo.");
}

/* ======================================================================
   Navegação
   ====================================================================== */

irMunicipios.addEventListener("click", function () { voltarAosMunicipios(); });
irUsuarios.addEventListener("click", function () { abrirUsuarios(); });
irSenha.addEventListener("click", function () { abrirMinhaSenha(); });

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
  mostrar("cadastro");
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
  esquecerOperador();
  formaCadastro.reset();
  dizerNoCadastro("");
  mostrar("painel");
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
    r = await pedirComSessao("/prefeituras", "POST", {
      municipio: document.getElementById("municipio").value,
      uf: document.getElementById("uf").value,
      orgao: document.getElementById("orgao").value,
      nome: document.getElementById("nome-admin").value,
      matricula: document.getElementById("matricula").value,
      email: document.getElementById("email-admin").value,
      operador: document.getElementById("operador").value
    });
  } finally {
    devolver();
  }

  if (r.rede) { dizerNoCadastro(FORA_DO_AR); return; }

  if (!r.ok || !r.corpo || !r.corpo.senhaInicial) {
    dizerNoCadastro(mensagemDe(r, "Não foi possível cadastrar a prefeitura."));
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
   O diálogo do produto
   ====================================================================== */

var dialogo = document.getElementById("dialogo");
var dialogoCartao = document.getElementById("dialogo-cartao");
var dialogoAgir = document.getElementById("dialogo-agir");
var dialogoMotivo = document.getElementById("dialogo-motivo");
var dialogoCampoMotivo = document.getElementById("dialogo-campo-motivo");
var perguntaAberta = null;

/**
 * O resto da página fica \`inert\` enquanto uma pergunta está aberta.
 *
 * \`inert\` tira do alcance do ponteiro, do Tab e do leitor de tela, que é o
 * que uma janela modal promete. Sem isto, o Tab sai do diálogo pela borda e
 * continua percorrendo a página atrás, e quem navega por teclado passa a
 * operar controles que não vê, achando que ainda está dentro da confirmação.
 */
function inerteAtras(sim) {
  var partes = ["cabecalho", "principal", "rodape"];
  for (var i = 0; i < partes.length; i++) {
    var no = document.getElementById(partes[i]);
    if (sim) no.setAttribute("inert", ""); else no.removeAttribute("inert");
  }
}

/**
 * Abre a pergunta genérica: título, texto, o rótulo do botão que age (que
 * REPETE o verbo com o nome do alvo), se é destrutiva, se pede motivo, e a
 * função que age. O foco entra no diálogo e volta para quem abriu ao fechar.
 */
function abrirDialogo(pergunta) {
  perguntaAberta = pergunta;
  document.getElementById("dialogo-titulo").textContent = pergunta.titulo;
  document.getElementById("dialogo-texto").textContent = pergunta.texto;
  document.getElementById("dialogo-agir-texto").textContent = pergunta.rotulo;
  dialogoCampoMotivo.hidden = !pergunta.pedeMotivo;
  dialogoMotivo.value = "";
  dizerNoDialogo("");
  if (pergunta.destrutiva) {
    dialogoAgir.classList.add("botao-perigo");
    dialogoAgir.classList.remove("botao-forte");
  } else {
    dialogoAgir.classList.remove("botao-perigo");
    dialogoAgir.classList.add("botao-forte");
  }
  dialogo.hidden = false;
  inerteAtras(true);
  if (pergunta.pedeMotivo) dialogoMotivo.focus();
  dialogoCartao.focus();
}

function fecharDialogo() {
  if (dialogo.hidden) return;
  dialogo.hidden = true;
  inerteAtras(false);
  dialogoMotivo.value = "";
  dizerNoDialogo("");
  var pergunta = perguntaAberta;
  perguntaAberta = null;
  if (pergunta && pergunta.quemAbriu) pergunta.quemAbriu.focus();
}

document.getElementById("dialogo-recusar").addEventListener("click", function () { fecharDialogo(); });
document.getElementById("dialogo-fundo").addEventListener("click", function () {
  /* Clique fora fecha SÓ quando a pergunta não é destrutiva: clique fora é
     gesto acidental, e fechar por acidente a pergunta de suspender no meio da
     leitura da consequência não é barato. */
  if (perguntaAberta && !perguntaAberta.destrutiva) fecharDialogo();
});
dialogoCartao.addEventListener("keydown", function (evento) {
  if (evento.key === "Escape") fecharDialogo();
});

document.getElementById("forma-dialogo").addEventListener("submit", async function (evento) {
  evento.preventDefault();
  if (!perguntaAberta) return;
  dizerNoDialogo("");

  var motivo = dialogoMotivo.value.trim();
  if (perguntaAberta.pedeMotivo && !motivo) {
    dizerNoDialogo("Informe o motivo. Ele vai para a trilha do município.");
    dialogoMotivo.focus();
    return;
  }

  var devolver = esperar(dialogoAgir, "dialogo-agir-texto", perguntaAberta.ocupado);
  var r;
  try {
    r = await perguntaAberta.agir(motivo);
  } finally {
    devolver();
  }

  if (!r.ok) {
    if (r.corpo && r.corpo.erro === "sem_sessao") { sessaoTerminou(); return; }
    dizerNoDialogo(mensagemDe(r, "Não foi possível fazer isto agora."));
    return;
  }
  var depois = perguntaAberta.depois;
  fecharDialogo();
  await depois();
});

/* ======================================================================
   As duas ações perigosas por município
   ====================================================================== */

function nomeDe(m) { return m.municipio + " (" + m.uf + ")"; }

function suspender(m, quemAbriu) {
  abrirDialogo({
    titulo: "Desativar o acesso de " + nomeDe(m),
    texto: "Ninguém desta prefeitura consegue entrar enquanto o acesso estiver "
      + "desativado, e as sessões abertas caem agora. Os dados ficam. Dá para "
      + "reativar quando quiser.",
    rotulo: "Desativar o acesso de " + m.municipio,
    ocupado: "Desativando...",
    destrutiva: true,
    pedeMotivo: true,
    quemAbriu: quemAbriu,
    agir: function (motivo) {
      return pedirComSessao("/municipios/" + m.organizacao_id + "/suspender", "POST", { motivo: motivo });
    },
    depois: carregar
  });
}

function reativar(m, quemAbriu) {
  abrirDialogo({
    titulo: "Reativar o acesso de " + nomeDe(m),
    texto: "A prefeitura volta a entrar no produto imediatamente. Motivo da "
      + "suspensão: " + (m.suspensao_motivo || "(não informado)") + ".",
    rotulo: "Reativar o acesso de " + m.municipio,
    ocupado: "Reativando...",
    destrutiva: false,
    pedeMotivo: false,
    quemAbriu: quemAbriu,
    agir: function () {
      return pedirComSessao("/municipios/" + m.organizacao_id + "/reativar", "POST");
    },
    depois: carregar
  });
}

function cancelarEliminacao(m, quemAbriu) {
  abrirDialogo({
    titulo: "Cancelar a eliminação de " + nomeDe(m),
    texto: "O apagamento agendado deixa de acontecer. O acesso CONTINUA "
      + "desativado: reativar é um ato separado, com o botão próprio.",
    rotulo: "Cancelar a eliminação de " + m.municipio,
    ocupado: "Cancelando...",
    destrutiva: false,
    pedeMotivo: false,
    quemAbriu: quemAbriu,
    agir: function () {
      return pedirComSessao("/municipios/" + m.organizacao_id + "/eliminacao/cancelar", "POST");
    },
    depois: carregar
  });
}

/* ---------- O modal de eliminar, com os quatro campos em ordem ---------- */

var dialogoEliminar = document.getElementById("dialogo-eliminar");
var eliminarCartao = document.getElementById("eliminar-cartao");
var eliminarAgir = document.getElementById("eliminar-agir");
var alvoDaEliminacao = null;
var quemAbriuEliminar = null;

function limparEliminar() {
  document.getElementById("eliminar-senha").value = "";
  document.getElementById("eliminar-codigo").value = "";
  document.getElementById("eliminar-nome").value = "";
  document.getElementById("eliminar-motivo").value = "";
  dizerNoEliminar("");
}

function abrirEliminar(m, quemAbriu) {
  alvoDaEliminacao = m;
  quemAbriuEliminar = quemAbriu;
  limparEliminar();
  document.getElementById("eliminar-titulo").textContent = "Eliminar " + nomeDe(m);
  document.getElementById("eliminar-agir-texto").textContent =
    "Agendar a eliminação de " + m.municipio;
  document.getElementById("eliminar-nome-ajuda").textContent =
    "Exatamente como está cadastrado, com maiúsculas e acentos: " + m.municipio;
  dialogoEliminar.hidden = false;
  inerteAtras(true);
  document.getElementById("eliminar-senha").focus();
  eliminarCartao.focus();
}

function fecharEliminar() {
  if (dialogoEliminar.hidden) return;
  dialogoEliminar.hidden = true;
  inerteAtras(false);
  limparEliminar();
  alvoDaEliminacao = null;
  var abriu = quemAbriuEliminar;
  quemAbriuEliminar = null;
  if (abriu) abriu.focus();
}

document.getElementById("eliminar-recusar").addEventListener("click", function () { fecharEliminar(); });
eliminarCartao.addEventListener("keydown", function (evento) {
  if (evento.key === "Escape") fecharEliminar();
});
/* Sem "clique fora fecha" aqui: a decisão é destrutiva, e fechar por acidente
   no meio da leitura da consequência não é barato. */

document.getElementById("forma-eliminar").addEventListener("submit", async function (evento) {
  evento.preventDefault();
  if (!alvoDaEliminacao) return;
  dizerNoEliminar("");

  var senha = document.getElementById("eliminar-senha").value;
  var codigo = document.getElementById("eliminar-codigo").value;
  var nome = document.getElementById("eliminar-nome").value;
  var motivo = document.getElementById("eliminar-motivo").value.trim();

  /* A ordem da conferência é a ordem dos campos, e a mesma do servidor. */
  if (!senha) { dizerNoEliminar("Informe a sua senha atual."); return; }
  if (!codigo) { dizerNoEliminar("Informe um código novo do aplicativo de autenticação."); return; }
  if (nome !== alvoDaEliminacao.municipio) {
    dizerNoEliminar("Digite o nome exato da prefeitura, como está cadastrado: "
      + alvoDaEliminacao.municipio + ".");
    document.getElementById("eliminar-nome").focus();
    return;
  }
  if (!motivo) { dizerNoEliminar("Informe o motivo. Ele fica no livro de eliminações."); return; }

  var devolver = esperar(eliminarAgir, "eliminar-agir-texto", "Agendando a eliminação...");
  var r;
  try {
    r = await pedirComSessao("/municipios/" + alvoDaEliminacao.organizacao_id + "/eliminar", "POST", {
      senha: senha, codigo: codigo, nome: nome, motivo: motivo
    });
  } finally {
    devolver();
    /* A senha e o código saem dos campos assim que o pedido volta, tenha dado
       certo ou não: um código recusado não serve de novo, e a senha não fica
       num campo de uma janela que pode ficar aberta. */
    document.getElementById("eliminar-senha").value = "";
    document.getElementById("eliminar-codigo").value = "";
  }

  if (!r.ok) {
    if (r.corpo && r.corpo.erro === "sem_sessao") { sessaoTerminou(); return; }
    dizerNoEliminar(mensagemDe(r, "Não foi possível agendar a eliminação."));
    return;
  }
  fecharEliminar();
  await carregar();
});

/* ---------- O modal de restaurar o acesso do administrador (054) ---------- */

var dialogoRestaurar = document.getElementById("dialogo-restaurar");
var restaurarCartao = document.getElementById("restaurar-cartao");
var restaurarAgir = document.getElementById("restaurar-agir");
var formaRestaurar = document.getElementById("forma-restaurar");
var restaurarEntregue = document.getElementById("restaurar-entregue");
var alvoDaRestauracao = null;
var quemAbriuRestaurar = null;

/**
 * Esquece tudo que o modal guardou: os campos, o recado, o histórico e, acima
 * de tudo, a senha temporária mostrada. Ela entra por \`textContent\` e sai
 * daqui, sem passar por variável de módulo nem armazenamento do navegador,
 * como a senha inicial do cadastro.
 */
function limparRestaurar() {
  document.getElementById("restaurar-email").value = "";
  document.getElementById("restaurar-senha").value = "";
  document.getElementById("restaurar-codigo").value = "";
  document.getElementById("restaurar-motivo").value = "";
  document.getElementById("senha-restaurada").textContent = "";
  document.getElementById("restaurar-validade").textContent = "";
  document.getElementById("restaurar-historico").textContent = "";
  restaurarEntregue.hidden = true;
  formaRestaurar.hidden = false;
  document.getElementById("restaurar-texto").hidden = false;
  document.getElementById("restaurar-historico").hidden = false;
  dizerNoRestaurar("");
}

/** "Nenhuma restauração anterior", ou a última, com quem fez e por quê. */
async function carregarHistoricoDeRestauracao(m) {
  var historico = document.getElementById("restaurar-historico");
  historico.textContent = "Consultando restaurações anteriores...";
  var r = await pedirComSessao("/municipios/" + m.organizacao_id + "/restauracoes", "GET");
  if (alvoDaRestauracao !== m) return;
  if (!r.ok || !r.corpo || !r.corpo.restauracoes) {
    historico.textContent = "Não foi possível consultar as restaurações anteriores.";
    return;
  }
  var lista = r.corpo.restauracoes;
  if (lista.length === 0) {
    historico.textContent = "Nenhuma restauração anterior neste município.";
    return;
  }
  var ultima = lista[0];
  historico.textContent = (lista.length === 1 ? "1 restauração anterior" : lista.length + " restaurações anteriores")
    + ". A última em " + diaEHora(ultima.registrado_em) + ", por " + ultima.operador_email
    + ": " + ultima.motivo;
}

function abrirRestaurar(m, quemAbriu) {
  alvoDaRestauracao = m;
  quemAbriuRestaurar = quemAbriu;
  limparRestaurar();
  document.getElementById("restaurar-titulo").textContent = "Restaurar o acesso do administrador de " + nomeDe(m);
  document.getElementById("restaurar-agir-texto").textContent =
    "Restaurar o acesso do administrador de " + m.municipio;
  dialogoRestaurar.hidden = false;
  inerteAtras(true);
  restaurarCartao.focus();
  carregarHistoricoDeRestauracao(m);
}

function fecharRestaurar() {
  if (dialogoRestaurar.hidden) return;
  dialogoRestaurar.hidden = true;
  inerteAtras(false);
  limparRestaurar();
  alvoDaRestauracao = null;
  var abriu = quemAbriuRestaurar;
  quemAbriuRestaurar = null;
  if (abriu) abriu.focus();
}

document.getElementById("restaurar-recusar").addEventListener("click", function () { fecharRestaurar(); });
document.getElementById("restaurar-concluir").addEventListener("click", function () { fecharRestaurar(); });
restaurarCartao.addEventListener("keydown", function (evento) {
  /* Com a senha à vista, Escape não fecha: só o botão de concluir. */
  if (evento.key === "Escape" && restaurarEntregue.hidden) fecharRestaurar();
});
/* Sem "clique fora fecha", como no de eliminar. */

formaRestaurar.addEventListener("submit", async function (evento) {
  evento.preventDefault();
  if (!alvoDaRestauracao) return;
  dizerNoRestaurar("");

  var email = document.getElementById("restaurar-email").value.trim();
  var senha = document.getElementById("restaurar-senha").value;
  var codigo = document.getElementById("restaurar-codigo").value;
  var motivo = document.getElementById("restaurar-motivo").value.trim();

  /* A ordem da conferência é a ordem dos campos; o servidor e o banco conferem de novo. */
  if (!email) { dizerNoRestaurar("Informe o email do administrador."); document.getElementById("restaurar-email").focus(); return; }
  if (!senha) { dizerNoRestaurar("Informe a sua senha atual."); return; }
  if (!codigo) { dizerNoRestaurar("Informe um código novo do aplicativo de autenticação."); return; }
  if (motivo.length < 10) {
    dizerNoRestaurar("Escreva o motivo, com pelo menos 10 caracteres: o chamado e como a identidade foi conferida.");
    document.getElementById("restaurar-motivo").focus();
    return;
  }

  var devolver = esperar(restaurarAgir, "restaurar-agir-texto", "Restaurando o acesso...");
  var r;
  try {
    r = await pedirComSessao("/municipios/" + alvoDaRestauracao.organizacao_id + "/restaurar-acesso", "POST", {
      email: email, senha: senha, codigo: codigo, motivo: motivo
    });
  } finally {
    devolver();
    /* Senha e código saem dos campos assim que o pedido volta, deu certo ou não. */
    document.getElementById("restaurar-senha").value = "";
    document.getElementById("restaurar-codigo").value = "";
  }

  if (!r.ok || !r.corpo || !r.corpo.senhaTemporaria) {
    if (r.corpo && r.corpo.erro === "sem_sessao") { sessaoTerminou(); return; }
    dizerNoRestaurar(mensagemDe(r, "Não foi possível restaurar o acesso."));
    return;
  }

  document.getElementById("senha-restaurada").textContent = r.corpo.senhaTemporaria;
  document.getElementById("restaurar-validade").textContent =
    "Vale até " + diaEHora(r.corpo.senhaProvisoriaAte) + " e exige senha nova na primeira entrada. "
    + (r.corpo.sessoesEncerradas === 1 ? "1 sessão encerrada." : r.corpo.sessoesEncerradas + " sessões encerradas.")
    + " O segundo fator, se estiver ativo, continua valendo.";
  /* Com a senha à vista, o cartão fala só dela: a explicação e o histórico saem. */
  formaRestaurar.hidden = true;
  document.getElementById("restaurar-texto").hidden = true;
  document.getElementById("restaurar-historico").hidden = true;
  restaurarEntregue.hidden = false;
  document.getElementById("restaurar-titulo").focus();
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
  var svg = document.createElementNS(SVG, "svg");
  svg.setAttribute("class", "icone");
  svg.setAttribute("aria-hidden", "true");
  var uso = document.createElementNS(SVG, "use");
  uso.setAttribute("href", "#" + nome);
  svg.appendChild(uso);
  return svg;
}

/** Um selo com ícone e palavra, para sinal e para estado. */
function selo(classe, nomeDoIcone, texto) {
  var marca = document.createElement("span");
  marca.className = "marca-sinal " + classe;
  marca.appendChild(icone(nomeDoIcone));
  var palavra = document.createElement("span");
  palavra.textContent = texto;
  marca.appendChild(palavra);
  return marca;
}

/** Um botão de linha, com roda, para as ações do dono. */
function botaoDeLinha(texto, classe, aoClicar) {
  var b = document.createElement("button");
  b.setAttribute("type", "button");
  b.className = "botao " + classe;
  var roda = document.createElement("span");
  roda.className = "roda";
  roda.setAttribute("aria-hidden", "true");
  b.appendChild(roda);
  var rotulo = document.createElement("span");
  rotulo.textContent = texto;
  b.appendChild(rotulo);
  b.addEventListener("click", function () { aoClicar(b); });
  return b;
}

function doisDigitos(n) { return (n < 10 ? "0" : "") + n; }

/** "22/09 às 14:03", no relógio de quem olha. */
function diaEHora(iso) {
  var d = new Date(iso);
  return doisDigitos(d.getDate()) + "/" + doisDigitos(d.getMonth() + 1)
    + " às " + doisDigitos(d.getHours()) + ":" + doisDigitos(d.getMinutes());
}

/**
 * O estado de acesso, com ícone e palavra, e as ações que fazem sentido nele.
 *
 * Três estados, e cada um oferece só o que cabe: com eliminação agendada, o
 * único botão é CANCELAR, à vista durante o prazo inteiro (reativar seria
 * recusado pelo servidor, e eliminar de novo não existe); suspenso, reativar
 * ou eliminar; ativo, desativar o acesso ou eliminar.
 */
function estadoDe(m) {
  if (m.eliminacao_agendada_para) {
    var quando = new Date(m.eliminacao_agendada_para);
    var dias = Math.max(0, Math.ceil((quando.getTime() - Date.now()) / 86400000));
    return selo("eliminacao", "i-ampulheta",
      "eliminação em " + dias + (dias === 1 ? " dia" : " dias") + ", dia " + diaEHora(m.eliminacao_agendada_para));
  }
  if (m.acesso_suspenso_em) {
    return selo("suspenso", "i-bloqueio",
      "suspenso desde " + diaEHora(m.acesso_suspenso_em)
      + (m.suspensao_motivo ? ": " + m.suspensao_motivo : ""));
  }
  return selo("ativo", "i-confere", "ativo");
}

function acoesDe(m) {
  var grupo = document.createElement("div");
  grupo.className = "acoes-linha";
  if (m.eliminacao_agendada_para) {
    grupo.appendChild(botaoDeLinha("Cancelar eliminação", "botao-forte", function (b) { cancelarEliminacao(m, b); }));
    return grupo;
  }
  if (m.acesso_suspenso_em) {
    grupo.appendChild(botaoDeLinha("Reativar", "botao-discreto", function (b) { reativar(m, b); }));
  } else {
    grupo.appendChild(botaoDeLinha("Desativar acesso", "botao-discreto", function (b) { suspender(m, b); }));
    /* Só com o acesso ativo: suspenso, ninguém entra, e o banco recusa. */
    grupo.appendChild(botaoDeLinha("Restaurar acesso", "botao-discreto", function (b) { abrirRestaurar(m, b); }));
  }
  grupo.appendChild(botaoDeLinha("Eliminar", "botao-perigo", function (b) { abrirEliminar(m, b); }));
  return grupo;
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

  var colunas = papel === "dono" ? 12 : 11;
  var textuais = papel === "dono" ? 4 : 3;
  var larguras = ["esqueleto-longo", "esqueleto-medio", "esqueleto-curto", "esqueleto-medio"];
  for (var i = 0; i < 4; i++) {
    var tr = document.createElement("tr");
    for (var c = 0; c < colunas; c++) {
      var td = document.createElement("td");
      if (c >= textuais) td.className = "n";
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
    r = await pedirComSessao("/municipios", "GET");
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
    sessaoTerminou();
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
    var horas = m.horas_desde_a_escrita;
    sinal.appendChild(selo(
      m.sem_escrita_recente ? "calado" : "em-dia",
      m.sem_escrita_recente ? "i-silencio" : "i-pulso",
      m.sem_escrita_recente
        ? (horas === null || horas === undefined
            ? "calado, nunca escreveu"
            : "calado ha " + Math.round(horas) + " h")
        : "em dia"
    ));
    tr.appendChild(sinal);

    var estado = document.createElement("td");
    estado.className = "estado";
    estado.appendChild(estadoDe(m));
    tr.appendChild(estado);

    /* A coluna de ações existe só para o dono, e vem logo depois do estado
       (ver o comentário no cabeçalho da tabela). Esconder não é controle de
       acesso: é não oferecer o que o servidor recusaria. */
    if (papel === "dono") {
      var acoes = document.createElement("td");
      acoes.appendChild(acoesDe(m));
      tr.appendChild(acoes);
    }

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

/* ======================================================================
   Usuários (só o dono)
   ====================================================================== */

/**
 * A credencial do operador criado vive na tela e em mais lugar nenhum, pela
 * mesma regra da senha inicial da prefeitura.
 */
function esquecerOperador() {
  document.getElementById("operador-titulo").textContent = "";
  document.getElementById("operador-senha").textContent = "";
  document.getElementById("operador-segredo").textContent = "";
  document.getElementById("operador-endereco").textContent = "";
  document.getElementById("operador-codigos").textContent = "";
  var qr = document.getElementById("operador-qr");
  qr.textContent = "";
  qr.hidden = true;
  operadorEntregue.hidden = true;
  formaOperador.hidden = false;
}

function abrirUsuarios() {
  esquecerSenha();
  esquecerOperador();
  dizerNoOperador("");
  mostrar("usuarios");
  carregarOperadores();
}

document.getElementById("voltar-de-usuarios").addEventListener("click", voltarAosMunicipios);
document.getElementById("operador-concluir").addEventListener("click", function () {
  esquecerOperador();
  document.getElementById("email-operador").focus();
});

/** Em grupos de quatro, que é como se lê e se digita uma sequência longa. */
function emGrupos(segredo) {
  return segredo.replace(/(.{4})/g, "$1 ").trim();
}

/**
 * Os códigos de recuperação, um item por código, por \`textContent\`. A lista
 * é numerada pela folha, para quem anota conferir que anotou os oito.
 */
function listarCodigos(alvo, codigos) {
  alvo.textContent = "";
  (codigos || []).forEach(function (codigo) {
    var item = document.createElement("li");
    item.className = "codigo";
    item.textContent = codigo;
    alvo.appendChild(item);
  });
}

/**
 * O QR desenhado quadradinho a quadradinho, em SVG, a partir da matriz que a
 * rota devolveu. Nada de imagem de fora, nada de \`innerHTML\`: um \`<rect>\`
 * por módulo escuro, com classe, e a folha pinta.
 */
function desenharQr(alvo, qr) {
  alvo.textContent = "";
  if (!qr || !qr.linhas) { alvo.hidden = true; return; }
  var borda = 4;
  var lado = qr.tamanho + borda * 2;
  var svg = document.createElementNS(SVG, "svg");
  svg.setAttribute("class", "qr");
  svg.setAttribute("viewBox", "0 0 " + lado + " " + lado);
  svg.setAttribute("shape-rendering", "crispEdges");
  svg.setAttribute("role", "img");
  svg.setAttribute("aria-label", "Código QR com o endereço de ativação do segundo fator. O mesmo endereço está escrito ao lado, e o segredo acima, para digitar à mão.");
  var fundo = document.createElementNS(SVG, "rect");
  fundo.setAttribute("x", "0"); fundo.setAttribute("y", "0");
  fundo.setAttribute("width", String(lado)); fundo.setAttribute("height", String(lado));
  fundo.setAttribute("class", "qr__fundo");
  svg.appendChild(fundo);
  for (var i = 0; i < qr.linhas.length; i++) {
    var linha = qr.linhas[i];
    for (var j = 0; j < linha.length; j++) {
      if (linha.charAt(j) !== "1") continue;
      var m = document.createElementNS(SVG, "rect");
      m.setAttribute("x", String(j + borda)); m.setAttribute("y", String(i + borda));
      m.setAttribute("width", "1"); m.setAttribute("height", "1");
      m.setAttribute("class", "qr__modulo");
      svg.appendChild(m);
    }
  }
  alvo.appendChild(svg);
  alvo.hidden = false;
}

function desativarOperador(o, quemAbriu) {
  abrirDialogo({
    titulo: "Desativar " + o.email,
    texto: "A conta deixa de entrar no console agora, e a sessão dela cai. Ela "
      + "não é apagada: continua na lista, como desativada, porque assina o que "
      + "fez.",
    rotulo: "Desativar " + o.email,
    ocupado: "Desativando...",
    destrutiva: true,
    pedeMotivo: false,
    quemAbriu: quemAbriu,
    agir: function () {
      return pedirComSessao("/operadores/" + o.id + "/desativar", "POST");
    },
    depois: carregarOperadores
  });
}

async function carregarOperadores() {
  dizerNosUsuarios("");
  linhasOperadores.textContent = "";
  document.getElementById("rolagem-operadores").setAttribute("aria-busy", "true");
  var r;
  try {
    r = await pedirComSessao("/operadores", "GET");
  } finally {
    document.getElementById("rolagem-operadores").setAttribute("aria-busy", "false");
  }
  if (r.rede) { dizerNosUsuarios(FORA_DO_AR); return; }
  if (!r.ok) {
    if (r.corpo && r.corpo.erro === "sem_sessao") { sessaoTerminou(); return; }
    dizerNosUsuarios(mensagemDe(r, "Não foi possível listar os operadores."));
    return;
  }

  var lista = (r.corpo && r.corpo.operadores) || [];
  lista.forEach(function (o) {
    var tr = document.createElement("tr");
    var email = document.createElement("th");
    email.setAttribute("scope", "row");
    email.className = "mono";
    email.textContent = o.email;
    tr.appendChild(email);

    tr.appendChild(celula(o.papel === "dono" ? "dono" : "operador", false));

    var situacao = document.createElement("td");
    situacao.appendChild(o.ativo
      ? selo("em-dia", "i-confere", "ativo")
      : selo("desativado", "i-bloqueio", "desativado"));
    tr.appendChild(situacao);

    tr.appendChild(celula(o.criado_em ? diaEHora(o.criado_em) : "-", false));

    var acoes = document.createElement("td");
    /* O dono não tem botão: não se desativa, por ninguém, nem por ele mesmo. */
    if (o.papel !== "dono" && o.ativo) {
      var grupo = document.createElement("div");
      grupo.className = "acoes-linha";
      grupo.appendChild(botaoDeLinha("Desativar", "botao-discreto", function (b) { desativarOperador(o, b); }));
      acoes.appendChild(grupo);
    } else {
      acoes.textContent = o.papel === "dono" ? "não se desativa" : "";
    }
    tr.appendChild(acoes);
    linhasOperadores.appendChild(tr);
  });
}

formaOperador.addEventListener("submit", async function (evento) {
  evento.preventDefault();
  dizerNoOperador("");

  var devolver = esperar(botaoCriarOperador, "criar-operador-texto", "Criando...");
  var r;
  try {
    r = await pedirComSessao("/operadores", "POST", {
      email: document.getElementById("email-operador").value
    });
  } finally {
    devolver();
  }

  if (r.rede) { dizerNoOperador(FORA_DO_AR); return; }
  if (!r.ok || !r.corpo || !r.corpo.senhaInicial) {
    if (r.corpo && r.corpo.erro === "sem_sessao") { sessaoTerminou(); return; }
    dizerNoOperador(mensagemDe(r, "Não foi possível criar o operador."));
    return;
  }

  document.getElementById("operador-titulo").textContent = r.corpo.email || "";
  document.getElementById("operador-senha").textContent = r.corpo.senhaInicial;
  document.getElementById("operador-segredo").textContent = emGrupos(r.corpo.segredo || "");
  document.getElementById("operador-endereco").textContent = r.corpo.endereco || "";
  desenharQr(document.getElementById("operador-qr"), r.corpo.qr);
  listarCodigos(document.getElementById("operador-codigos"), r.corpo.codigos);

  formaOperador.reset();
  formaOperador.hidden = true;
  operadorEntregue.hidden = false;
  document.getElementById("operador-titulo").focus();
  await carregarOperadores();
});

/* ======================================================================
   A minha senha
   ====================================================================== */

/**
 * A conta sem código de recuperação é avisada na entrada, e o aviso fica até
 * o lote ser gerado. Só quando o servidor disse ZERO: sem o número (servidor
 * antigo) a tela não afirma nada.
 */
function mostrarAvisoDeCodigos(quantos) {
  var semCodigos = quantos === 0;
  avisoSemCodigos.hidden = !semCodigos;
  if (!semCodigos) return;
  document.getElementById("aviso-sem-codigos-texto").textContent = papel === "dono"
    ? "Você é o dono deste console e não tem códigos de recuperação. Ninguém acima de "
      + "você redefine a sua senha: sem os códigos, perder a senha e o aparelho exige "
      + "a credencial de dono do banco."
    : "Esta conta não tem códigos de recuperação. Sem eles, perder a senha e o "
      + "aparelho exige que o dono desative a conta e crie outra.";
}

document.getElementById("aviso-sem-codigos-ir").addEventListener("click", function () {
  abrirMinhaSenha();
});

function abrirMinhaSenha() {
  esquecerSenha();
  esquecerOperador();
  esquecerCodigos();
  dizerNaSenha("");
  document.getElementById("senha-trocada").hidden = true;
  formaSenhaNova.reset();
  mostrar("senha");
  document.getElementById("senha-atual").focus();
  carregarCodigosRestantes();
}

/* ======================================================================
   Os códigos de recuperação
   ====================================================================== */

/**
 * Os oito códigos vivem na tela e em mais lugar nenhum, pela mesma regra da
 * senha inicial. A senha e o código digitados para gerá-los saem dos campos
 * assim que o pedido volta.
 */
function esquecerCodigos() {
  document.getElementById("lista-de-codigos").textContent = "";
  codigosEntregues.hidden = true;
  formaCodigos.hidden = false;
  document.getElementById("codigos-senha").value = "";
  document.getElementById("codigos-codigo").value = "";
  dizerNosCodigos("");
}

function mostrarRestantes(n) {
  var frase = fraseDeRestantes(n);
  document.getElementById("codigos-restantes").textContent = Number(n) > 0
    ? frase
    : frase + " Gere os seus abaixo: sem eles, perder a senha e o aparelho exige a credencial do banco.";
}

/**
 * Pergunta ao servidor quantos códigos ainda valem. Só o número: os códigos
 * em si não existem mais em texto claro em lugar nenhum.
 */
async function carregarCodigosRestantes() {
  document.getElementById("codigos-restantes").textContent = "Contando os códigos...";
  var r = await pedirComSessao("/codigos-de-recuperacao", "GET");
  if (r.rede) { document.getElementById("codigos-restantes").textContent = FORA_DO_AR; return; }
  if (!r.ok) {
    if (r.corpo && r.corpo.erro === "sem_sessao") { sessaoTerminou(); return; }
    document.getElementById("codigos-restantes").textContent =
      mensagemDe(r, "Não foi possível contar os códigos de recuperação.");
    return;
  }
  mostrarRestantes(r.corpo && r.corpo.restantes);
}

document.getElementById("codigos-concluir").addEventListener("click", function () {
  esquecerCodigos();
  document.getElementById("codigos-senha").focus();
});

formaCodigos.addEventListener("submit", async function (evento) {
  evento.preventDefault();
  dizerNosCodigos("");

  var senha = document.getElementById("codigos-senha").value;
  var codigo = document.getElementById("codigos-codigo").value;
  if (!senha) { dizerNosCodigos("Informe a senha atual."); return; }
  if (!codigo) { dizerNosCodigos("Informe um código novo do aplicativo de autenticação."); return; }

  var devolver = esperar(botaoGerarCodigos, "gerar-codigos-texto", "Gerando os códigos...");
  var r;
  try {
    r = await pedirComSessao("/codigos-de-recuperacao", "POST", { senha: senha, codigo: codigo });
  } finally {
    devolver();
    /* A senha e o código saem dos campos assim que o pedido volta, tenha
       dado certo ou não: um código recusado não serve de novo, e a senha não
       fica num campo de uma tela que pode ficar aberta. */
    document.getElementById("codigos-senha").value = "";
    document.getElementById("codigos-codigo").value = "";
  }

  if (r.rede) { dizerNosCodigos(FORA_DO_AR); return; }
  if (!r.ok || !r.corpo || !r.corpo.codigos) {
    if (r.corpo && r.corpo.erro === "sem_sessao") { sessaoTerminou(); return; }
    dizerNosCodigos(mensagemDe(r, "Não foi possível gerar os códigos."));
    return;
  }

  listarCodigos(document.getElementById("lista-de-codigos"), r.corpo.codigos);
  mostrarRestantes(r.corpo.restantes);
  mostrarAvisoDeCodigos(r.corpo.restantes);
  formaCodigos.hidden = true;
  codigosEntregues.hidden = false;
});

document.getElementById("voltar-da-senha").addEventListener("click", voltarAosMunicipios);

formaSenhaNova.addEventListener("submit", async function (evento) {
  evento.preventDefault();
  dizerNaSenha("");
  document.getElementById("senha-trocada").hidden = true;

  var atual = document.getElementById("senha-atual").value;
  var codigo = document.getElementById("codigo-troca").value;
  var nova = document.getElementById("senha-nova").value;
  var nova2 = document.getElementById("senha-nova-2").value;

  if (!atual) { dizerNaSenha("Informe a senha atual."); return; }
  if (!codigo) { dizerNaSenha("Informe um código novo do aplicativo de autenticação."); return; }
  if (nova.length < 12) { dizerNaSenha("A senha nova precisa ter pelo menos 12 caracteres."); return; }
  if (nova !== nova2) {
    dizerNaSenha("As duas senhas novas não são iguais.");
    document.getElementById("senha-nova-2").focus();
    return;
  }

  var devolver = esperar(botaoTrocar, "trocar-texto", "Trocando a senha...");
  var r;
  try {
    r = await pedirComSessao("/senha", "POST", { senhaAtual: atual, codigo: codigo, novaSenha: nova });
  } finally {
    devolver();
    /* O código sai do campo assim que o pedido volta: recusado ou usado, ele
       não serve de novo. */
    document.getElementById("codigo-troca").value = "";
  }

  if (r.rede) { dizerNaSenha(FORA_DO_AR); return; }
  if (!r.ok || !r.corpo || !r.corpo.token) {
    if (r.corpo && r.corpo.erro === "sem_sessao") { sessaoTerminou(); return; }
    dizerNaSenha(mensagemDe(r, "Não foi possível trocar a senha."));
    return;
  }

  /* A sessão continua nesta aba com o token NOVO: o antigo já não vale, aqui
     nem em nenhuma outra aba. */
  token = r.corpo.token;
  formaSenhaNova.reset();
  document.getElementById("senha-atual").value = "";
  document.getElementById("senha-nova").value = "";
  document.getElementById("senha-nova-2").value = "";
  document.getElementById("senha-trocada").hidden = false;
});
`;
