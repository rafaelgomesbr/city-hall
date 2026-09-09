-- =====================================================================
-- 022: segundo fator para quem administra o municipio.
--
-- O PORQUE, em uma frase: o administrador e o teto do municipio (ADR 0006),
-- ele cria conta, redefine senha de terceiro e altera os dados do orgao, e ate
-- aqui a conta dele era protegida por senha e mais nada. Conta de
-- administrador comprometida e municipio inteiro comprometido, e nao existe
-- papel acima dele para desfazer o estrago: quem esta acima e quem tem a
-- DATABASE_URL, que e uma pessoa com acesso ao servidor, nao uma conta.
--
-- O `docs/PRIVACIDADE.md` listava isto, por escrito, como "previsto, nao
-- implantado". Documento que promete o que o sistema nao faz e o defeito que
-- este projeto vem eliminando arquivo por arquivo, e este e o ultimo item
-- daquela lista que dependia de codigo.
--
-- =====================================================================
-- POR QUE TOTP E NAO SMS.
--
-- SMS e interceptavel por troca de chip (o golpe nao precisa nem tocar no
-- telefone da vitima: ele acontece no balcao da operadora), custa por mensagem
-- e depende da rede da operadora justamente no dia em que ela esta
-- congestionada, que e o dia do temporal, que e o dia em que a coordenadoria
-- MAIS precisa entrar no sistema. O codigo de seis digitos do aplicativo de
-- autenticacao e calculado no proprio aparelho, offline, e continua valendo
-- com a torre de celular fora do ar.
--
-- =====================================================================
-- O QUE FICA GUARDADO AQUI, E COMO.
--
-- O segredo do TOTP e uma credencial simetrica: quem o tem gera os codigos.
-- Guarda-lo em texto seria transformar um vazamento de banco em vazamento de
-- segundo fator, ou seja, o segundo fator deixaria de valer exatamente no
-- cenario que ele existe para cobrir. Por isso ele entra CIFRADO, com chave
-- que vive so na variavel de ambiente do processo (`SEGUNDO_FATOR_CHAVE`), e o
-- banco RECUSA qualquer coisa que nao tenha a forma do envelope cifrado (ver
-- o CHECK `segredo_vem_cifrado` abaixo). Uma linha de codigo que gravasse o
-- segredo cru aqui reprova no banco, e nao meses depois numa auditoria.
--
-- O codigo de recuperacao entra como RESUMO CRIPTOGRAFICO, pelo mesmo motivo
-- pelo qual o token de sessao entra (migracao 002): ele e sorteado com 80 bits
-- de entropia, entao nao existe ataque de dicionario contra ele, e o que o
-- banco guarda nao serve para entrar.
-- =====================================================================

-- ---------------------------------------------------------------------
-- segundo_fator: uma linha por pessoa que ligou (ou esta ligando) o recurso.
--
-- Sem coluna `id`, como `avisos_lidos` (migracao 018): a identidade da linha E
-- o par (municipio, pessoa). Uma chave sintetica aqui so criaria a
-- possibilidade de duas linhas dizendo coisas diferentes sobre a mesma conta,
-- e "qual das duas vale" nao e pergunta que se queira fazer na hora do login.
-- ---------------------------------------------------------------------
CREATE TABLE segundo_fator (
  organizacao_id  uuid NOT NULL REFERENCES organizacoes(id) ON DELETE RESTRICT,
  usuario_id      uuid NOT NULL,

  /*
    O segredo do TOTP, CIFRADO, no envelope descrito em
    `apps/api/src/auth/cofre.ts`: 'v1.<vetor>.<selo>.<texto cifrado>'.

    Nulo em um caso so, e ele e o desligamento: desativar o segundo fator APAGA
    o segredo, em vez de deixar a linha marcada como inativa com a credencial
    dentro. Guardar segredo de uma protecao desligada seria acumular
    credencial sem finalidade, e a reativacao acidental de uma linha antiga
    devolveria acesso a um aparelho que a pessoa pode nem ter mais.
  */
  segredo_cifrado text,

  criado_em       timestamptz NOT NULL DEFAULT now(),

  /*
    Quando a pessoa PROVOU que o aplicativo dela gera o codigo certo.

    Nulo enquanto a ativacao esta pela metade, e essa metade precisa existir:
    ligar o segundo fator sem conferir um codigo antes tranca a pessoa do lado
    de fora quando o relogio do aparelho esta errado ou quando ela leu o codigo
    QR com um aplicativo que nao guardou nada. Enquanto for nulo, o login NAO
    exige o segundo fator: a linha e um rascunho.
  */
  confirmado_em   timestamptz,
  desativado_em   timestamptz,

  /*
    O ultimo passo de tempo ja aceito, e ele e o que impede o codigo de valer
    duas vezes.

    O TOTP e uma funcao do relogio: o mesmo numero de seis digitos vale pela
    janela inteira. Sem esta coluna, quem enxergou a tela por cima do ombro (ou
    leu o codigo num print mandado no grupo do plantao) entra com o MESMO
    numero enquanto a janela nao virar. Com ela, o passo usado fica queimado, e
    o proximo login exige um numero que ainda nao existia.
  */
  ultimo_passo    bigint,

  /*
    Teto de tentativas SEPARADO do teto de senha, e a separacao e o ponto.

    O contador de senha (`usuarios.falhas_login`, migracao 002) zera a cada
    acerto de senha. Se o segundo fator dividisse aquele contador, cada
    tentativa de adivinhar os seis digitos comecaria por um acerto de senha,
    que zeraria o contador, e o teto nunca fecharia: seriam tentativas
    infinitas contra um espaco de um milhao. Este contador so zera quando o
    CODIGO acerta.
  */
  falhas          integer NOT NULL DEFAULT 0 CHECK (falhas >= 0),
  bloqueado_ate   timestamptz,

  PRIMARY KEY (organizacao_id, usuario_id),

  -- Chave estrangeira COMPOSTA, como a migracao 008 estabeleceu: chave simples
  -- alcanca linha de outro municipio, e o RLS nao protege disso.
  CONSTRAINT segundo_fator_usuario_do_mesmo_municipio
    FOREIGN KEY (organizacao_id, usuario_id)
    REFERENCES usuarios (organizacao_id, id) ON DELETE RESTRICT,

  /*
    Ou existe segredo e o recurso esta de pe (confirmado ou em rascunho), ou o
    recurso esta desligado e nao ha segredo nenhum. Nao existe terceiro estado.

    Sem este CHECK, um desligamento que esquecesse de limpar o segredo deixaria
    a credencial viva no banco com a protecao desligada, que e o pior dos dois
    mundos: o risco de guardar, sem o beneficio de exigir.
  */
  CONSTRAINT segredo_coerente_com_a_situacao CHECK (
    (desativado_em IS NULL     AND segredo_cifrado IS NOT NULL)
    OR
    (desativado_em IS NOT NULL AND segredo_cifrado IS NULL)
  ),

  /*
    O SEGREDO SO ENTRA CIFRADO, e quem cobra isso e o banco.

    O envelope comeca por 'v1.' e o segredo cru do TOTP e base32 (letras
    maiusculas e digitos de 2 a 7), entao gravar o segredo em texto reprova
    aqui, na hora, com o nome desta restricao na mensagem. A alternativa era
    confiar em revisao de codigo para sempre, e a linha que grava segredo cru
    e exatamente a que ninguem le duas vezes: ela funciona.
  */
  CONSTRAINT segredo_vem_cifrado CHECK (
    segredo_cifrado IS NULL OR segredo_cifrado LIKE 'v1.%'
  )
);

ALTER TABLE segundo_fator ENABLE ROW LEVEL SECURITY;
ALTER TABLE segundo_fator FORCE ROW LEVEL SECURITY;

CREATE POLICY segundo_fator_isolamento ON segundo_fator
  USING (organizacao_id = app_organizacao_atual())
  WITH CHECK (organizacao_id = app_organizacao_atual());

/*
  NAO EXISTE POLICY DE DELETE, e a ausencia e a decisao.

  Desligar o segundo fator e ato de seguranca de uma conta que assina laudo, e
  a pergunta "desde quando esta conta parou de exigir o segundo fator, e quem
  desligou" precisa ter resposta. Com DELETE, a resposta some junto com a
  linha. Sem ele, o desligamento e um UPDATE que apaga o segredo e carimba a
  data, e o ato tambem fica na trilha administrativa, que nao se reescreve.
*/

COMMENT ON TABLE segundo_fator IS
  'Segundo fator (TOTP) por pessoa. O segredo entra cifrado com chave de '
  'ambiente: banco vazado nao devolve segundo fator utilizavel.';

COMMENT ON COLUMN segundo_fator.ultimo_passo IS
  'Ultimo passo de tempo aceito. Impede que o mesmo codigo de seis digitos '
  'valha duas vezes dentro da mesma janela.';

-- ---------------------------------------------------------------------
-- segundo_fator_recuperacao: a saida de quem perdeu o telefone.
--
-- Sem estes codigos, o administrador que troca de aparelho perde o municipio,
-- e a unica saida seria SQL na producao com a credencial de dono, que ignora o
-- isolamento. Ou seja: a falta do plano B transformaria um telefone quebrado
-- num acesso irrestrito ao banco de todos os municipios, feito as pressas, por
-- alguem sob pressao. E a mesma classe de defeito que a ADR 0006 evitou ao
-- recusar o super-administrador.
--
-- Sao sorteados uma vez, mostrados uma vez, e cada um vale UMA vez.
-- ---------------------------------------------------------------------
CREATE TABLE segundo_fator_recuperacao (
  organizacao_id  uuid NOT NULL REFERENCES organizacoes(id) ON DELETE RESTRICT,
  usuario_id      uuid NOT NULL,

  /*
    SHA-256 do codigo normalizado, em base64url, sempre 43 caracteres.

    O formato e cobrado pelo CHECK abaixo pela mesma razao do envelope cifrado
    da tabela de cima: o codigo em texto tem hifens e dezenove caracteres, e
    reprovaria aqui. Sem sal e sem alongamento de propriedade: o codigo e
    sorteado com 80 bits, nao e escolhido por gente, entao nao ha dicionario a
    correr contra ele, e derivacao cara aqui custaria oito verificacoes de 128
    MB a cada tentativa de entrada.
  */
  codigo_hash     text NOT NULL,

  criado_em       timestamptz NOT NULL DEFAULT now(),
  /** Gasto pela pessoa, entrando. */
  usado_em        timestamptz,
  /** Derrubado em bloco, porque o segundo fator foi desligado ou refeito. */
  invalidado_em   timestamptz,

  PRIMARY KEY (organizacao_id, usuario_id, codigo_hash),

  CONSTRAINT recuperacao_do_mesmo_municipio
    FOREIGN KEY (organizacao_id, usuario_id)
    REFERENCES segundo_fator (organizacao_id, usuario_id) ON DELETE RESTRICT,

  CONSTRAINT codigo_guardado_como_resumo CHECK (
    codigo_hash ~ '^[A-Za-z0-9_-]{43}$'
  )
);

-- A pergunta e sempre "quais codigos desta pessoa ainda valem".
CREATE INDEX segundo_fator_recuperacao_vivos_idx
  ON segundo_fator_recuperacao (organizacao_id, usuario_id)
  WHERE usado_em IS NULL AND invalidado_em IS NULL;

ALTER TABLE segundo_fator_recuperacao ENABLE ROW LEVEL SECURITY;
ALTER TABLE segundo_fator_recuperacao FORCE ROW LEVEL SECURITY;

CREATE POLICY segundo_fator_recuperacao_isolamento ON segundo_fator_recuperacao
  USING (organizacao_id = app_organizacao_atual())
  WITH CHECK (organizacao_id = app_organizacao_atual());

/*
  Tambem sem policy de DELETE, e aqui a razao e de contagem, nao de historia: a
  tela promete "voce ainda tem N codigos". Se o gasto sumisse, a unica coisa
  que sobraria seria o numero de codigos vivos, e ninguem conseguiria
  distinguir "usei tres" de "alguem usou tres por mim". Codigo gasto fica,
  marcado como gasto.
*/

COMMENT ON TABLE segundo_fator_recuperacao IS
  'Codigos de recuperacao do segundo fator, guardados como resumo. Cada um '
  'vale uma vez; desligar o segundo fator invalida todos em bloco.';

GRANT SELECT, INSERT, UPDATE ON segundo_fator TO dc360_app;
GRANT SELECT, INSERT, UPDATE ON segundo_fator_recuperacao TO dc360_app;
