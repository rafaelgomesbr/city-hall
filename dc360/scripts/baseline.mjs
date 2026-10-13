#!/usr/bin/env node
/**
 * Repete a linha de base de 2026-09-30 e arquiva a saída, sem segredo.
 *
 * O buraco que este arquivo fecha: o baseline do Baseline Zero (REL:01,
 * seção 3.4) foi medido numa única máquina, à mão, e nada dizia como outra
 * pessoa chegaria nos mesmos números. Sem isso, "o teste está vermelho" vira
 * opinião de quem rodou por último. Aqui a ordem dos comandos, o que se espera
 * de cada um e o que fazer com a saída estão escritos em código.
 *
 * Três decisões que valem explicação:
 *
 * 1. NÃO ESCONDE VERMELHO. A linha de base de hoje é vermelha de propósito
 *    (a E03 a E25 da fase F00 consertam). Cada passo carrega o resultado
 *    esperado de 2026-09-30, vermelho inclusive. O passo "confere" quando o
 *    resultado é o esperado, e "divergente" quando é outro, para melhor ou
 *    para pior. Divergente sai com código 1 e nunca é maquiado: ou se
 *    explica na evidência, ou se conserta.
 *
 * 2. A SAÍDA É REDIGIDA ANTES DE IR PARA O DISCO. O raw de 2026-09-30 chegou a
 *    trazer um JWT de teste dentro de uma asserção. JWT, `Bearer`, `Basic`,
 *    URL com usuário e senha e a pasta pessoal do usuário viram marcadores
 *    antes de qualquer gravação, e o travessão também (a regra de conteúdo do
 *    repositório reprova o caractere em `docs/`, onde a evidência mora). A varredura automática de segredo só chega
 *    com a F01-E04; até lá este filtro e a leitura humana são a defesa.
 *
 * 3. `--so-listar` imprime os comandos sem executar nada e sem criar pasta,
 *    para quem quer conferir o roteiro antes de gastar uma hora de máquina.
 *
 * O que ele NÃO faz: não conserta nada, não mexe no CI e não sobe banco.
 *
 * Uso:
 *   node scripts/baseline.mjs                 roda tudo e arquiva
 *   node scripts/baseline.mjs --so-listar     só lista os comandos
 *   node scripts/baseline.mjs --sem-instalar  pula os dois `npm ci`
 *   node scripts/baseline.mjs --so=id,id      roda só estes passos
 *   node scripts/baseline.mjs --pular=id,id   roda tudo menos estes
 *   node scripts/baseline.mjs --saida=PASTA   pasta de saída (padrão abaixo)
 */
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const AQUI = dirname(fileURLToPath(import.meta.url));
export const RAIZ_DO_PRODUTO = resolve(AQUI, "..");
const RAIZ_DO_REPOSITORIO = resolve(RAIZ_DO_PRODUTO, "..");
export const SAIDA_PADRAO = join(
  RAIZ_DO_REPOSITORIO,
  "docs",
  "evidencias-v2",
  "G00",
  "V2-F00-E01",
  "saidas",
);

/**
 * Quantos testes a própria E01 acrescenta ao `test:scripts`
 * (`baseline.test.mjs`). O baseline de 2026-09-30 mediu 165 sem ele; o total
 * esperado é 165 mais esta constante, e quem acrescentar teste ali atualiza
 * o número aqui.
 */
export const TESTES_DA_E01_EM_SCRIPTS = 16;

/**
 * Quantos testes cada etapa SEGUINTE da fase F00 soma ao `test:scripts`, por ID.
 * O baseline de 2026-09-30 não os conhece (165 testes), e o esperado do passo
 * `test-scripts` é 165 mais a E01 mais tudo o que está aqui. Sem este registro,
 * cada etapa nova que ganha teste em `scripts/` faria o roteiro marcar
 * "divergente" por um motivo bom (teste a mais), e o sinal de "divergente"
 * perderia valor. Regra: a etapa que cria um `scripts/*.test.mjs` acrescenta uma
 * linha aqui com a contagem de `test(` do arquivo e o nome dele na tabela
 * seguinte. O `baseline.test.mjs` confere as duas tabelas contra os arquivos,
 * então número esquecido reprova.
 */
export const TESTES_DAS_ETAPAS_SEGUINTES_EM_SCRIPTS = {
  "V2-F00-E02": 17, // scripts/portao-de-skip.test.mjs
  /*
    V2-F00-E17: um caso novo em `scripts/entitlements-do-ios.test.mjs` (o
    negativo que prova que o `mode` escrito à mão reprova). O arquivo já
    existia, então ele NÃO entra na tabela de arquivos abaixo, que confere o
    arquivo inteiro contra a contagem da etapa.
  */
  "V2-F00-E17": 1,
  /*
    V2-F00-E21: 7 casos novos em `scripts/testar-campo.test.mjs` (o arquivo
    de `src/app` vira a rota do expo-router, o cache velho de `.expo/types` é
    apagado dizendo quais rotas faltam, o cache em dia fica, sem cache não se
    faz nada, rota prefixo de outra não conta, as rotas reais do disco, e a
    limpeza vem antes do typecheck). O arquivo já existia: fora da tabela de
    arquivos abaixo.
  */
  "V2-F00-E21": 7,
};

/** Arquivo de teste (em `scripts/`) que cada etapa da tabela acima acrescentou, para o conferidor. */
export const ARQUIVOS_DAS_ETAPAS_SEGUINTES_EM_SCRIPTS = {
  "V2-F00-E02": "portao-de-skip.test.mjs",
};

const SOMA_DAS_ETAPAS_SEGUINTES = Object.values(TESTES_DAS_ETAPAS_SEGUINTES_EM_SCRIPTS).reduce((a, b) => a + b, 0);

/** O que a API media em 2026-10-05 (E01), antes de qualquer conserto da fase. */
export const BASE_DO_TESTE_API = { total: 1109, falhas: 2, puladas: 18 };

/**
 * O que cada etapa SEGUINTE muda na contagem do `npm run test:api`, por ID,
 * para o esperado do passo `teste-api` acompanhar o conserto em vez de
 * marcar "divergente" por um motivo bom. Cada linha diz o porquê, e o
 * `baseline.test.mjs` confere que a soma bate com o esperado do passo.
 *
 * V2-F00-E04: os 5 casos do `describe.skip` da vigência passaram a rodar
 * (puladas 18 para 13, total sem mudança por eles), 4 casos novos de borda
 * entraram no mesmo arquivo (total 1109 para 1113), e a falha de
 * `senha-provisoria.test.ts` ("sessão viva cuja senha provisória venceu")
 * passou a ficar verde sozinha, porque ela depende da vigência na escrita
 * (falhas 2 para 1; a falha que sobra é o laudo do pacote, da E12). A suíte
 * `banco-tls` continua falhando na carga do arquivo e não entra na contagem.
 *
 * V2-F00-E04, correção 1: `apps/api/test/get-com-efeito.test.ts` é novo, com
 * 10 casos (o controle de quem está vigente, as quatro sondas contra os GET
 * que escrevem, a lista explícita pelo comportamento, a varredura do fonte, a
 * varredura de escrita com conta desativada e a preservação da cadeia em
 * `/auth/encerrar-sessoes`). Total 4 para 14, sem falha nem pulo novos.
 */
export const MUDANCAS_DO_TESTE_API_POR_ETAPA = {
  "V2-F00-E04": { total: 14, falhas: -1, puladas: -5 },
  /*
    V2-F00-E05: `apps/api/test/codigos-de-erro.test.ts` e novo, com 16
    casos (os seis códigos saindo do servidor real, renovação de conta
    desativada, resistência a enumeração na entrada, isolamento e o leitor de
    fonte do catálogo). Os testes que esperavam o código `sessao` foram
    atualizados no lugar, sem mudar a contagem. Nenhuma falha nova nem pulo.
  */
  "V2-F00-E05": { total: 16, falhas: 0, puladas: 0 },
  /*
    V2-F00-E06: `apps/api/test/campo-integracao.test.ts` ganhou 5 casos (conta
    desativada entre enfileirar e drenar, sessão encerrada, token vencido que
    renova uma vez, token vencido sem renovação que pausa, e o 403
    `sem_permissao` que continua bloqueando). O caso "token vencido bloqueia o
    item" foi reescrito no lugar (agora a fila pausa), sem mudar a contagem.
  */
  "V2-F00-E06": { total: 5, falhas: 0, puladas: 0 },
  /*
    V2-F00-E07: `apps/api/test/familia-da-sessao.test.ts` e novo, com 20 casos
    (a cadeia da sessao rotacionada, o papel alterado e a senha provisoria
    vencida pelo servico). Os dois testes que esperavam `sessao_encerrada` para
    papel diferente do token foram atualizados no lugar, sem mudar a contagem.
    Nenhuma falha nova nem pulo.
  */
  "V2-F00-E07": { total: 20, falhas: 0, puladas: 0 },
  /*
    V2-F00-E08: `apps/api/test/leitura-do-agente-oficios-e-avisos.test.ts` e
    novo, com 14 casos (o agente recebe 403 em `GET /oficios` e `GET
    /oficios/:id`, o sino e a contagem dele sao os da equipe, o aviso de outra
    equipe nao se marca como lido, e a escrita dentro do GET segue idempotente).
    Nenhum teste existente mudou. Nenhuma falha nova nem pulo.
  */
  "V2-F00-E08": { total: 14, falhas: 0, puladas: 0 },
  /*
    V2-F00-E09: `apps/api/test/sessoes-da-conta.test.ts` e novo, com 27 casos
    (as duas leituras novas, `GET /auth/sessoes` e `GET /usuarios/:id/sessoes`,
    com o que elas nao podem entregar: IP, user-agent, sessao de outra pessoa ou
    de outro municipio; posto, 404 e 403 nas tres rotas; as duas recusas 422; e
    o resumo do aparelho). Nenhum teste existente mudou. Nenhuma falha nova nem
    pulo.
  */
  "V2-F00-E09": { total: 27, falhas: 0, puladas: 0 },
  /*
    V2-F00-E10: dois arquivos novos. `apps/api/test/recuperacao-sem-oraculo.test.ts`
    (15 casos: o envio sai depois da resposta, a falha do provedor nao vira 500
    so para quem tem conta, o teto de pedidos por email, municipio que nao se
    escolhe pelo pedido, o token so como hash, o link que vence, as frases com
    acento, `GET /auth/recuperacao` e o limite por endereco; 8 reprovam antes do
    conserto) e `apps/api/test/recuperacao-em-producao.test.ts` (10 casos: o
    `fly.toml` desligado e a partida de producao que recusa as combinacoes
    perigosas). `recuperacao.test.ts` e `superficie.test.ts` mudaram no lugar,
    sem mudar a contagem. Nenhuma falha nova nem pulo.
  */
  "V2-F00-E10": { total: 25, falhas: 0, puladas: 0 },
  /*
    V2-F00-E11: `apps/api/test/pacote-de-saida-contrato.test.ts` e novo, com 8
    casos (a rota existe so sob `/saida`, o pacote traz so as linhas do municipio
    do token conferidas uma a uma, coluna proibida e valor sentinela nao saem, a
    soma SHA-256 de cada arquivo confere, a coordenadora recebe 403 e o municipio
    suspenso recebe 403 `acesso_suspenso` sem deixar registro de exportacao).
    `ler-zip.ts` e apoio, nao conta. Nenhum teste existente mudou. Nenhuma falha
    nova nem pulo; os 8 passam tambem sem o conserto (a API ja estava certa: o
    defeito era do cliente, e a sonda dele esta no painel).
  */
  "V2-F00-E11": { total: 8, falhas: 0, puladas: 0 },
  /*
    V2-F00-E12: `apps/api/test/saida-de-municipio.test.ts` ganhou 6 casos no
    bloco novo do aviso de equipe (os dois laudos com o mesmo trecho quando as
    equipes divergem, equipes iguais sem aviso, agente sem equipe com a frase
    propria, as duas colunas nulas da vistoria anterior a migracao 024 sem aviso
    falso, a coleta sem despacho com a nota propria no lugar da de divergencia, e
    o isolamento do nome de equipe do outro municipio). A falha que a E04 deixou
    anotada como "o laudo do pacote, da E12" fica verde aqui (falhas 1 para 0),
    e com ela a API fecha a fase SEM nenhuma falha de teste. A suite
    `banco-tls` continua reprovando na carga do arquivo (E21) e segue fora da
    contagem; as 13 puladas sao dela.
  */
  "V2-F00-E12": { total: 6, falhas: -1, puladas: 0 },
  /*
    V2-F00-E15: `apps/api/test/precisao-do-gps-na-sincronizacao.test.ts` e novo,
    com 3 casos pela rota de verdade: o piso de 1 metro que o aparelho passou a
    mandar responde 201, a precisao nula continua aceita, e o 0 de aplicativo
    antigo continua 422 com o campo nomeado e a frase em portugues. Nenhum
    codigo da API mudou; o esquema compartilhado so ganhou o nome
    `gpsPrecisaoMetrosSchema`, com a mesma regra.
  */
  "V2-F00-E15": { total: 3, falhas: 0, puladas: 0 },
  /*
    V2-F00-E18: `apps/api/test/cors-do-envio-de-evidencia.test.ts` e novo, com 8
    casos (o preflight do PUT de envio libera `if-none-match` para a origem do
    painel, todo cabecalho que a autorizacao manda repetir passa, origem fora da
    lista fica sem `access-control-allow-origin`, `x-qualquer` nao passa, a
    escrita unica segue com 412, e a URL vencida, a assinatura trocada e a chave
    de outro municipio seguem com 403). 3 reprovam antes do conserto. Nenhum
    teste existente mudou. Nenhuma falha nova nem pulo.
  */
  "V2-F00-E18": { total: 8, falhas: 0, puladas: 0 },
  /*
    V2-F00-E21: os 13 casos de `banco-tls.test.ts` deixam de ser pulados e
    RODAM (puladas 13 para 0, total sem mudança por eles): o `beforeAll`
    caía porque o `openssl req` herdava um OPENSSL_CONF apontando para arquivo
    inexistente (instalador do driver ODBC do PostgreSQL). Entra
    `apps/api/test/openssl-do-teste.test.ts`, com 10 casos (a variável quebrada
    sai e diz por quê, a válida fica, ausente passa igual, qualquer caixa, o
    ambiente de quem chamou não muda; o `openssl` achado no PATH, ao lado do
    `git` no Windows quando o PATH não o tem (o PowerShell), e a reprovação
    com frase quando não existe; e o `openssl` de verdade com a variável
    inexistente e com uma configuração válida que ele comprovadamente lê).
    `openssl-do-teste.ts` é apoio, não conta. Com isso `npm run test:api` sai
    com código 0.
  */
  "V2-F00-E21": { total: 10, falhas: 0, puladas: -13 },
  /*
    V2-F00-E23: `apps/api/test/contrato-do-painel.test.ts` e novo, com 12 casos
    (6 contra a arvore atual: rotas lidas, cada chamada de `dados/http.ts` com
    metodo e caminho registrados, ancora de contagem, chamadas sem token so nas
    isencoes, excecoes sem entrada morta, expansao dos tipos de documento; e 6
    sinteticos: o caminho certo do pacote passa, `POST /pacote.zip` reprova,
    `GET /saida/pacote.zip` reprova, parametro faltando reprova, chamada nao
    lida fura a ancora, extrator que perde uma chamada reprova).
    `superficie-registrada.ts` e apoio (a leitura de `printRoutes` e a lista
    `SEM_TOKEN`, movidas de `superficie.test.ts` sem mudar caso nenhum), nao
    conta. Nenhuma falha nova nem pulo.
  */
  "V2-F00-E23": { total: 12, falhas: 0, puladas: 0 },
  /*
    V2-F00-E05, correcao 1: seis casos em `apps/api/test/codigos-de-erro.test.ts`
    ("Renovar depois de desativar PELO ENDPOINT real": a renovacao da conta
    desativada pelo painel responde 403 `conta_desativada`, o token ja
    rotacionado, os tres negativos e a entrada generica). O caso de
    `api.test.ts` que esperava 401 foi reescrito no lugar, sem mudar a conta.
  */
  "V2-F00-E05-correcao-1": { total: 6, falhas: 0, puladas: 0 },
};

/** Soma a base de um passo com o que cada etapa seguinte declarou mudar nele. */
function somarMudancas(base, mudancas) {
  const soma = { ...base };
  for (const m of Object.values(mudancas)) {
    for (const campo of Object.keys(m)) soma[campo] += m[campo];
  }
  return soma;
}

export function esperadoDoTesteApi() {
  return somarMudancas(BASE_DO_TESTE_API, MUDANCAS_DO_TESTE_API_POR_ETAPA);
}

/**
 * O mesmo mecanismo para `packages/shared` e para `apps/web`, que a E05 passou a
 * tocar. Base: o que a E01 mediu. Cada etapa seguinte que acrescenta teste ali
 * declara aqui quantos, e a falha pré-existente (laudo de conteúdo no shared,
 * 14 testes de tela no web) segue contada como vermelho conhecido das etapas
 * E20 e E13.
 */
export const BASE_DO_TESTE_SHARED = { total: 149, falhas: 1 };
export const MUDANCAS_DO_TESTE_SHARED_POR_ETAPA = {
  // `packages/shared/test/codigos-de-erro.test.ts`, catálogo dos códigos de acesso.
  "V2-F00-E05": { total: 10, falhas: 0 },
  // `packages/shared/test/permissoes.test.ts`: a acao `consultar_oficio` (3 casos novos).
  "V2-F00-E08": { total: 3, falhas: 0 },
  // `packages/shared/test/precisao-do-gps.test.ts`: o `positive()` de `gpsPrecisaoMetrosSchema` continua recusando 0 e negativo, em português (3 casos novos).
  "V2-F00-E15": { total: 3, falhas: 0 },
  // `packages/shared/test/regras-de-conteudo.test.ts`: 3 casos de âncora das isenções (árvore real e repositório sintético, o que reprova e o que passa). A falha pré-existente do travessão fecha: o literal de `trilha-detalhe.test.ts` virou escape e a saída bruta e a auditoria de 2026-09-30 saíram da varredura. O shared fecha sem vermelho.
  "V2-F00-E20": { total: 3, falhas: -1 },
};
export function esperadoDoTesteShared() {
  return somarMudancas(BASE_DO_TESTE_SHARED, MUDANCAS_DO_TESTE_SHARED_POR_ETAPA);
}

export const BASE_DO_TESTE_WEB = { total: 550, falhas: 14 };
export const MUDANCAS_DO_TESTE_WEB_POR_ETAPA = {
  // `apps/web/test/sessao-e-entrada.test.ts`: os três motivos de sessão morta e as três frases.
  "V2-F00-E05": { total: 7, falhas: 0 },
  // Mesmo arquivo: a renovação avisa a tela do papel novo (1 caso novo de servidor antigo) e o provedor se inscreve (1 de fonte). O caso "papel mudado" foi reescrito no lugar.
  "V2-F00-E07": { total: 2, falhas: 0 },
  // `apps/web/test/oficio-so-para-quem-consulta.test.ts`: o modo local recusa o agente e a tela nao pergunta o que o servidor recusa (4 casos novos).
  "V2-F00-E08": { total: 4, falhas: 0 },
  // `apps/web/test/sessoes-e-senha-temporaria.test.ts` (18 casos novos: frases, janela da senha, modo local, telas) e os 8 casos de `seguranca-da-conta.test.ts`, vermelhos desde 5ecdf4c, que passam sem mudar uma linha do teste (V-WEB-04 a V-WEB-11 da classificacao da E03). Sobram 6 vermelhos: E13 (5) e E21 (1).
  "V2-F00-E09": { total: 18, falhas: -8 },
  // `apps/web/test/recuperar-senha.test.ts` (37 casos: cada estado das duas telas, as regras de frase e de digitacao, o token fora da barra, o vercel.json) e `recuperar-senha-e-sessao.test.ts` (3 casos: o pedido de recuperacao nao leva token nem derruba a sessao aberta; 3 reprovam antes do conserto). Nenhuma falha nova.
  "V2-F00-E10": { total: 40, falhas: 0 },
  // `apps/web/test/pacote-de-saida.test.ts` (7 casos: o cliente chama POST /saida/pacote.zip, 401 renova uma vez e baixa, a recusa traz a frase do servidor sem derrubar a sessao, rede caida diz que o arquivo nao foi baixado, inclusive no meio do corpo). 5 reprovam com o cliente anterior (os 2 de recusa ja passavam). Nenhuma falha nova.
  "V2-F00-E11": { total: 7, falhas: 0 },
  // 5 casos novos: 1 em `acessibilidade.test.ts` (a excecao vale pelo comentario inteiro), 2 em `sessao-e-entrada.test.ts` (entrar a partir de `/` e sair sem deixar caminho de volta) e 2 em `acessibilidade.test.ts` (o Tab traz o item da barra do rodape inteiro para a tela, e o aviso passageiro nao cai em cima da barra). Zera 5 dos 6 vermelhos: 3 de Toast em `semente-e-confirmacoes.test.ts`, 1 de raio a mao em `design-system.test.ts` e 1 de `onClick` em `acessibilidade.test.ts`. Sobra 1, o de CRLF em `ocorrencia-encerramento.test.ts`, que e da E21.
  "V2-F00-E13": { total: 5, falhas: -5 },
  // `apps/web/test/duplicidade-sem-rede.test.ts` (3 casos: sem rede, a checagem de duplicidade do "Registrar" diz que o preenchido nao foi enviado, e nao que a tela nao carregou; a recusa do servidor segue como ErroDaApi; com rede devolve as candidatas). 1 reprova antes do conserto. Nenhuma falha nova.
  "V2-F00-E18": { total: 3, falhas: 0 },
  // `apps/web/test/ler-fonte.test.ts` (7 casos: a mesma fonte em CRLF e em LF lê e recorta igual, o recorte aceita o texto cru, a chave de fechamento movida tira o onEnviar do bloco, função sem chave na coluna zero e assinatura ausente reprovam alto, CR solto fica). O vermelho de CRLF de `ocorrencia-encerramento.test.ts` fecha usando o helper novo `ler-fonte.ts` (apoio, não conta). O painel fecha sem vermelho.
  "V2-F00-E21": { total: 7, falhas: -1 },
};
export function esperadoDoTesteWeb() {
  return somarMudancas(BASE_DO_TESTE_WEB, MUDANCAS_DO_TESTE_WEB_POR_ETAPA);
}

/**
 * O mesmo mecanismo para o banco (`db`, que inclui o isolamento). Base: o que a
 * E01 mediu (318 testes, 3 pulados por ambiente em `busca.test.ts`).
 *
 * V2-F00-E07: `db/test/familia-da-sessao.test.ts` e novo, com 12 casos (backfill
 * da migracao 047, `abrir_sessao` com a familia opcional, o teto de funcoes
 * SECURITY DEFINER e as permissoes). `isolamento.test.ts` nao mudou e segue verde.
 */
export const BASE_DO_TESTE_DB = { total: 318, falhas: 0, puladas: 3 };
export const MUDANCAS_DO_TESTE_DB_POR_ETAPA = {
  "V2-F00-E07": { total: 12, falhas: 0, puladas: 0 },
};
export function esperadoDoTesteDb() {
  return somarMudancas(BASE_DO_TESTE_DB, MUDANCAS_DO_TESTE_DB_POR_ETAPA);
}

/**
 * O mesmo mecanismo para o motor offline (`packages/campo`, vitest) e para o
 * aplicativo de campo (`apps/campo`, jest), que a V2-F00-E06 passou a tocar.
 * Base: o que a E01 mediu. O app mantém as 20 falhas pré-existentes (E14 a
 * E16), que continuam contadas como vermelho conhecido dessas etapas.
 *
 * V2-F00-E06 no pacote: `test/pausa-de-sessao.test.ts` é novo (28 casos: os três
 * códigos no transporte, a fila que para e guarda, a autoria, a renovação). Os
 * dois testes de `fila.test.ts` que afirmavam "401 é permanente" foram
 * reescritos no lugar, sem mudar a contagem.
 *
 * V2-F00-E06 no app: 35 casos novos (renovação forçada do token 5, classificação
 * da conta desativada 6, frases da pausa 6, frase da API 3, faixa de sincronização 6, tela da
 * fila pausada 9). Nenhuma falha nova.
 *
 * V2-F00-E14 no app: os 6 vermelhos de texto velho e de dublê velho ficam
 * verdes (2 de frase da sessão encerrada, 4 do logout com o dublê do banco
 * local completo) e entra 1 caso novo, o de deriva do dublê em
 * `push/logout-cala-o-aparelho.test.tsx`. Sobram 14 vermelhos, todos defeitos
 * reais: 7 da E15 e 7 da E16.
 *
 * V2-F00-E15 no app: os 7 defeitos reais dela ficam verdes (6 do diálogo de
 * saída com vistoria começada e a fila assinada, 1 da precisão de GPS) e
 * entram 20 casos novos: `dados/aviso-da-saida.test.ts` (10, o texto do
 * diálogo em todas as combinações), `dados/precisao-do-gps.test.ts` (5, o piso
 * de 1 metro contra o esquema do servidor) e
 * `dados/sair-e-entrar-nao-perde-a-coleta.test.ts` (5, a mesma pessoa
 * reencontra a vistoria, outra pessoa recebe o aparelho limpo, a fila fica
 * intacta e pendente). Sobram 7 vermelhos, todos da E16.
 *
 * V2-F00-E16 no app: os 7 defeitos reais dela ficam verdes (frase do envio, 2
 * do teclado, área segura da câmera, 2 do botão dos ajustes, foto vazia) e
 * entram 4 casos novos: 3 em
 * `__tests__/vistoria-o-teclado-a-camera-e-o-que-ela-promete.test.tsx` (o
 * botão dos ajustes não sobrevive à falha seguinte que não é de permissão, o
 * botão tem nome e 44 de altura, a câmera que não disparou continua com a
 * frase genérica) e 1 em `dados/evidencia-no-disco.test.ts` (a cópia recusada
 * sai em português). O jest do app fecha sem vermelho.
 */
export const BASE_DO_TESTE_CAMPO_PACOTE = { total: 159, falhas: 0 };
export const MUDANCAS_DO_TESTE_CAMPO_PACOTE_POR_ETAPA = {
  "V2-F00-E06": { total: 28, falhas: 0 },
  // V2-F00-E05, correcao 1: o obtentor lanca a falha de sessao da conta desativada.
  "V2-F00-E05-correcao-1": { total: 1, falhas: 0 },
};
export function esperadoDoTesteCampoPacote() {
  return somarMudancas(BASE_DO_TESTE_CAMPO_PACOTE, MUDANCAS_DO_TESTE_CAMPO_PACOTE_POR_ETAPA);
}

export const BASE_DO_TESTE_CAMPO_APP = { total: 1801, falhas: 20 };
export const MUDANCAS_DO_TESTE_CAMPO_APP_POR_ETAPA = {
  "V2-F00-E06": { total: 35, falhas: 0 },
  "V2-F00-E14": { total: 1, falhas: -6 },
  "V2-F00-E15": { total: 20, falhas: -7 },
  "V2-F00-E16": { total: 4, falhas: -7 },
  // V2-F00-E05, correcao 1: seis casos em `token.test.ts` (renovacao recusada por conta desativada).
  "V2-F00-E05-correcao-1": { total: 6, falhas: 0 },
};
export function esperadoDoTesteCampoApp() {
  return somarMudancas(BASE_DO_TESTE_CAMPO_APP, MUDANCAS_DO_TESTE_CAMPO_APP_POR_ETAPA);
}

/**
 * Os passos, na ordem em que se roda. `esperado` é o resultado de 2026-09-30
 * (REL:01, 3.4):
 *   - `codigo`: 0 (passa) ou "falha" (qualquer saída diferente de zero);
 *   - `total`, `falhas`, `puladas`: contagens, quando a ferramenta as imprime;
 *   - `contem`: trecho que a saída tem de trazer.
 * Passo sem `esperado` só registra.
 */
export const PASSOS = [
  { id: "instalar", titulo: "npm ci (dc360)", cmd: "npm ci", cwd: ".", instalacao: true, esperado: { codigo: 0 } },
  { id: "instalar-campo", titulo: "npm ci (apps/campo)", cmd: "npm ci", cwd: "apps/campo", instalacao: true, esperado: { codigo: 0 } },
  { id: "typecheck", titulo: "npm run typecheck", cmd: "npm run typecheck", cwd: ".", esperado: { codigo: 0 } },
  { id: "teste-shared", titulo: "vitest em packages/shared", cmd: "npm run test --workspace @dc360/shared", cwd: ".", ferramenta: "vitest", esperado: { codigo: 0, ...esperadoDoTesteShared() } }, // verde desde a V2-F00-E20
  { id: "teste-db", titulo: "vitest em db (inclui o isolamento)", cmd: "npm run test:isolamento", cwd: ".", ferramenta: "vitest", esperado: { codigo: 0, ...esperadoDoTesteDb() } },
  { id: "teste-campo-pacote", titulo: "vitest em packages/campo", cmd: "npm run test --workspace @dc360/campo", cwd: ".", ferramenta: "vitest", esperado: { codigo: 0, ...esperadoDoTesteCampoPacote() } },
  { id: "teste-api", titulo: "vitest em apps/api", cmd: "npm run test:api", cwd: ".", ferramenta: "vitest", esperado: { codigo: 0, ...esperadoDoTesteApi() } }, // verde desde a V2-F00-E21 (banco-tls roda)
  { id: "teste-console", titulo: "vitest em apps/console", cmd: "npm run test:console", cwd: ".", ferramenta: "vitest", esperado: { codigo: 0, total: 259, falhas: 0 } },
  { id: "teste-web", titulo: "vitest em apps/web", cmd: "npm run test --workspace @dc360/web", cwd: ".", ferramenta: "vitest", esperado: { codigo: 0, ...esperadoDoTesteWeb() } }, // verde desde a V2-F00-E21 (CRLF)
  { id: "teste-campo-app", titulo: "jest em apps/campo (direto)", cmd: "npx jest --silent", cwd: "apps/campo", ferramenta: "jest", esperado: { codigo: 0, ...esperadoDoTesteCampoApp() } }, // verde desde a V2-F00-E16
  { id: "test-campo", titulo: "npm run test:campo", cmd: "npm run test:campo", cwd: ".", esperado: { codigo: 0 } }, // verde desde a V2-F00-E21 (cache .expo/types velho apagado antes do typecheck)
  { id: "test-scripts", titulo: "npm run test:scripts", cmd: "npm run test:scripts", cwd: ".", ferramenta: "node-test", esperado: { codigo: 0, total: 165 + TESTES_DA_E01_EM_SCRIPTS + SOMA_DAS_ETAPAS_SEGUINTES, falhas: 0, puladas: 4 } }, // verde desde a V2-F00-E17; os 4 pulados são por ambiente (sem pasta ios/)
  /*
    Verde desde a V2-F00-E17. Este é o passo que MAIS volta a divergir: toda
    etapa que acrescenta teste muda uma contagem que o README afirma, e a
    etapa só fecha com o texto corrigido. Divergir aqui depois de uma etapa
    nova quer dizer "faltou corrigir o número", e não regressão de produto.
  */
  { id: "conferir-numeros", titulo: "npm run conferir:numeros", cmd: "npm run conferir:numeros", cwd: ".", esperado: { codigo: 0, contem: "Todos os números da documentação batem com a realidade." } },
  { id: "auditar", titulo: "npm run auditar", cmd: "npm run auditar", cwd: ".", esperado: { codigo: "falha" } },
  { id: "audit-raiz", titulo: "npm audit (dc360)", cmd: "npm audit", cwd: ".", esperado: { codigo: "falha" } },
  { id: "audit-campo", titulo: "npm audit (apps/campo)", cmd: "npm audit", cwd: "apps/campo", esperado: { codigo: "falha" } },
  { id: "expo-doctor", titulo: "npx expo-doctor", cmd: "npx expo-doctor", cwd: "apps/campo", esperado: { codigo: "falha", contem: "20/21 checks passed" } },
  {
    id: "e2e",
    titulo: "npm run test:e2e (painel local, com o painel servido)",
    cmd: "npm run test:e2e",
    cwd: ".",
    // O E2E do modo local navega em `http://localhost:4173`. Sem o painel de pé a
    // falha é só "conexão recusada", que não é o vermelho que a linha de base mede.
    // O CI faz o mesmo: constrói o painel e sobe o `vite preview` antes do teste.
    servidor: {
      preparar: "npm run build --workspace @dc360/web",
      cmd: "npx vite preview --port 4173 --strictPort",
      cwd: "apps/web",
      url: "http://localhost:4173",
    },
    /*
      A V2-F00-E13 consertou o defeito que derrubava este passo: o painel nao
      tinha rota para a raiz, entao quem entrava partindo de `/` (que e o que o
      proprio E2E faz na secao 1) voltava para `/` depois do login e caia em
      "Esta pagina nao existe". O teste morria na secao 2, esperando
      `.indicador`. Agora ele fecha verde, em Chromium e em Firefox, com 70
      verificacoes (as 68 de antes mais as 2 que a E13 acrescentou na secao 2).
    */
    esperado: { codigo: 0, contem: "Passou: 70   Falhou: 0" },
  },
  /*
    Verde desde a V2-F00-E18. Morria na secao 13 (o CORS nao liberava
    `if-none-match` no preflight do PUT de evidencia). Com o arquivo inteiro
    rodando apareceram mais tres: a secao 15 contava as tres tabelas da tela
    como se fossem a trilha (teste), a secao 19 dizia "nao foi possivel carregar
    esta tela" ao registrar sem sinal (produto), e `e2e-api.mjs` nao terminava
    quando tudo passava (roteiro). 271 verificacoes executadas: o `conferir`
    conta as 251 chamadas de `ok(` no inicio de linha, e as demais ficam dentro
    de laco ou de funcao, e so aparecem na execucao.
  */
  { id: "e2e-api", titulo: "npm run test:e2e:api", cmd: "npm run test:e2e:api", cwd: ".", esperado: { codigo: 0, contem: "Passou: 271   Falhou: 0" } },
];

/** Marcadores no lugar de segredo (e do travessão). Cada regra roda antes de qualquer gravação. */
const REGRAS_DE_REDACAO = [
  [/eyJ[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]*/g, "[JWT REDIGIDO]"],
  [/(\bBearer\s+)[A-Za-z0-9._~+/=-]{8,}/gi, "$1[REDIGIDO]"],
  [/(\bBasic\s+)[A-Za-z0-9+/=]{8,}/g, "$1[REDIGIDO]"],
  [/([a-z][a-z0-9+.-]*:\/\/)[^/\s:@]+:[^/\s@]+@/gi, "$1[REDIGIDO]@"],
  [/([A-Za-z]:[\\/]+Users[\\/]+)[^\\/\s]+/g, "$1[usuario]"],
  [/(\/(?:Users|home)\/)[^/\s]+/g, "$1[usuario]"],
  // O teste de conteúdo do repositório varre `docs/` inteiro e reprova qualquer
  // travessão. A saída bruta dos testes traz o caractere dentro das mensagens de
  // falha, e arquivá-la sem trocar faria a própria evidência reprovar o portão.
  [/\u2014/g, "[travessao]"],
];

export function redigir(texto) {
  let saida = texto;
  for (const [regra, troca] of REGRAS_DE_REDACAO) saida = saida.replace(regra, troca);
  return saida;
}

const SEM_COR = /\u001b\[[0-9;]*[A-Za-z]/g;

/**
 * Lê as contagens que a ferramenta imprime. Devolve `{}` quando não acha nada:
 * quem compara trata a ausência como divergência, nunca como zero.
 */
export function extrairContagem(texto, ferramenta) {
  const limpo = texto.replace(SEM_COR, "");
  if (ferramenta === "vitest") {
    const m = /^\s*Tests\s+(.+?)\s+\((\d+)\)\s*$/m.exec(limpo);
    if (!m) return {};
    const parte = (nome) => Number((new RegExp(`(\\d+)\\s+${nome}`).exec(m[1]) ?? [0, 0])[1]);
    return { total: Number(m[2]), falhas: parte("failed"), puladas: parte("skipped") };
  }
  if (ferramenta === "node-test") {
    const num = (nome) => {
      const m = new RegExp(`^# ${nome} (\\d+)\\s*$`, "m").exec(limpo);
      return m ? Number(m[1]) : undefined;
    };
    const total = num("tests");
    return total === undefined ? {} : { total, falhas: num("fail") ?? 0, puladas: num("skipped") ?? 0 };
  }
  if (ferramenta === "jest") {
    const m = /^Tests:\s+(.+?),\s*(\d+)\s+total\s*$/m.exec(limpo);
    if (!m) return {};
    const parte = (nome) => Number((new RegExp(`(\\d+)\\s+${nome}`).exec(m[1]) ?? [0, 0])[1]);
    return { total: Number(m[2]), falhas: parte("failed"), puladas: parte("skipped") };
  }
  return {};
}

/** Compara o resultado de um passo com o esperado. Nunca "arredonda". */
export function avaliar(passo, saida, codigo) {
  const esperado = passo.esperado;
  if (!esperado) return { status: "sem-esperado", detalhes: [] };
  const detalhes = [];
  if (esperado.codigo === 0 && codigo !== 0) detalhes.push(`código de saída ${codigo}, esperado 0`);
  if (esperado.codigo === "falha" && codigo === 0) detalhes.push("código de saída 0, esperado falha (ficou verde)");
  const contagem = passo.ferramenta ? extrairContagem(saida, passo.ferramenta) : {};
  for (const campo of ["total", "falhas", "puladas"]) {
    if (esperado[campo] === undefined) continue;
    if (contagem[campo] === undefined) detalhes.push(`${campo}: a saída não traz a contagem`);
    else if (contagem[campo] !== esperado[campo]) detalhes.push(`${campo}: obtido ${contagem[campo]}, esperado ${esperado[campo]}`);
  }
  if (esperado.contem && !saida.replace(SEM_COR, "").includes(esperado.contem)) {
    detalhes.push(`a saída não contém "${esperado.contem}"`);
  }
  return { status: detalhes.length ? "divergente" : "confere", detalhes };
}

export function listarComandos(passos = PASSOS) {
  return passos.map((p, i) => `${String(i + 1).padStart(2, "0")} ${p.id.padEnd(18)} (${p.cwd})  ${p.cmd}`);
}

export function lerOpcoes(argv) {
  const opcoes = { soListar: false, semInstalar: false, so: null, pular: [], saida: SAIDA_PADRAO };
  for (const a of argv) {
    if (a === "--so-listar") opcoes.soListar = true;
    else if (a === "--sem-instalar") opcoes.semInstalar = true;
    else if (a.startsWith("--so=")) opcoes.so = a.slice(5).split(",").filter(Boolean);
    else if (a.startsWith("--pular=")) opcoes.pular = a.slice(8).split(",").filter(Boolean);
    else if (a.startsWith("--saida=")) opcoes.saida = resolve(a.slice(8));
    else throw new Error(`opção desconhecida: ${a}`);
  }
  return opcoes;
}

export function escolherPassos(opcoes, passos = PASSOS) {
  const conhecidos = new Set(passos.map((p) => p.id));
  for (const id of [...(opcoes.so ?? []), ...opcoes.pular]) {
    if (!conhecidos.has(id)) throw new Error(`passo desconhecido: ${id}`);
  }
  return passos.filter((p) => {
    if (opcoes.semInstalar && p.instalacao) return false;
    if (opcoes.so && !opcoes.so.includes(p.id)) return false;
    return !opcoes.pular.includes(p.id);
  });
}

const LIMITE_POR_PASSO_MS = 25 * 60 * 1000;
const ESPERA_DO_SERVIDOR_MS = 60 * 1000;

function rodar(cmd, cwd, extra = {}) {
  return spawn(cmd, { cwd: join(RAIZ_DO_PRODUTO, cwd), shell: true, env: { ...process.env, NO_COLOR: "1", FORCE_COLOR: "0" }, ...extra });
}

function encerrarArvore(filho) {
  if (!filho.pid) return;
  if (process.platform === "win32") spawn("taskkill", ["/PID", String(filho.pid), "/T", "/F"], { stdio: "ignore" });
  else {
    try {
      process.kill(-filho.pid);
    } catch {
      filho.kill();
    }
  }
}

/** Espera de verdade o endereço responder, em vez de dormir um número inventado de segundos. */
async function aguardarResposta(url, limiteMs) {
  const fim = Date.now() + limiteMs;
  while (Date.now() < fim) {
    try {
      await fetch(url);
      return true;
    } catch {
      await new Promise((r) => setTimeout(r, 500));
    }
  }
  return false;
}

function executar(passo) {
  return new Promise((resolver) => {
    const inicio = Date.now();
    let saida = "";
    let servidor = null;
    const acrescentar = (b) => (saida += b);
    const terminar = (codigo) => {
      if (servidor) encerrarArvore(servidor);
      resolver({ saida, codigo: codigo ?? 1, duracaoMs: Date.now() - inicio });
    };
    const rodarComando = () => {
      const filho = rodar(passo.cmd, passo.cwd);
      const prazo = setTimeout(() => {
        saida += `
[baseline] passo interrompido após ${LIMITE_POR_PASSO_MS / 60000} minutos
`;
        filho.kill();
      }, LIMITE_POR_PASSO_MS);
      filho.stdout.on("data", acrescentar);
      filho.stderr.on("data", acrescentar);
      filho.on("error", (e) => {
        saida += `
[baseline] não consegui iniciar: ${e.message}
`;
      });
      filho.on("close", (codigo) => {
        clearTimeout(prazo);
        terminar(codigo);
      });
    };
    if (!passo.servidor) return rodarComando();
    const { preparar, cmd, cwd, url } = passo.servidor;
    const prep = rodar(preparar, passo.cwd);
    prep.stdout.on("data", acrescentar);
    prep.stderr.on("data", acrescentar);
    prep.on("close", async (codigoPrep) => {
      saida += `
[baseline] preparo (${preparar}) saiu com ${codigoPrep}
`;
      servidor = rodar(cmd, cwd, { detached: process.platform !== "win32" });
      servidor.stdout.on("data", () => {});
      servidor.stderr.on("data", () => {});
      if (await aguardarResposta(url, ESPERA_DO_SERVIDOR_MS)) {
        saida += `[baseline] ${url} respondeu; rodando o teste

`;
        rodarComando();
      } else {
        saida += `[baseline] ${url} não respondeu em ${ESPERA_DO_SERVIDOR_MS / 1000} s
`;
        terminar(1);
      }
    });
  });
}

const sha256 = (conteudo) => createHash("sha256").update(conteudo).digest("hex");

export function montarResumo(resultados, quando) {
  const linhas = [
    "# Resumo da linha de base",
    "",
    `Gerado em ${quando}. Resultado esperado: o de 2026-09-30 (REL:01, seção 3.4), vermelhos inclusive.`,
    "",
    "| Passo | Comando | Saída | Duração | Situação | Detalhe |",
    "| --- | --- | --- | --- | --- | --- |",
  ];
  for (const r of resultados) {
    const s = Math.round(r.duracaoMs / 1000);
    linhas.push(`| ${r.id} | \`${r.cmd}\` (${r.cwd}) | ${r.codigo} | ${s} s | ${r.status} | ${r.detalhes.join("; ") || "-"} |`);
  }
  const diverge = resultados.filter((r) => r.status === "divergente").length;
  linhas.push("", `Divergentes: ${diverge} de ${resultados.length}.`, "");
  return linhas.join("\n");
}

export async function montarIndice(pasta) {
  const nomes = (await readdir(pasta, { recursive: true, withFileTypes: true }))
    .filter((e) => e.isFile() && e.name !== "INDEX.md")
    .map((e) => relative(pasta, join(e.parentPath ?? e.path, e.name)).replaceAll("\\", "/"))
    .sort();
  const linhas = ["# INDEX", "", "| Arquivo | SHA-256 |", "| --- | --- |"];
  for (const nome of nomes) linhas.push(`| ${nome} | ${sha256(await readFile(join(pasta, nome)))} |`);
  return linhas.join("\n") + "\n";
}

async function principal() {
  const opcoes = lerOpcoes(process.argv.slice(2));
  const passos = escolherPassos(opcoes);
  if (opcoes.soListar) {
    console.log(listarComandos(passos).join("\n"));
    return 0;
  }
  const pasta = opcoes.saida;
  await mkdir(pasta, { recursive: true });
  const resultados = [];
  for (const [i, passo] of passos.entries()) {
    console.log(`[${i + 1}/${passos.length}] ${passo.id}: ${passo.cmd} (${passo.cwd})`);
    const { saida, codigo, duracaoMs } = await executar(passo);
    const avaliacao = avaliar(passo, saida, codigo);
    const cabecalho = `$ ${passo.cmd}   (em ${passo.cwd})\ncodigo=${codigo} duracao=${Math.round(duracaoMs / 1000)}s situacao=${avaliacao.status}\n\n`;
    const arquivo = `${String(i + 1).padStart(2, "0")}-${passo.id}.txt`;
    await writeFile(join(pasta, arquivo), redigir(cabecalho + saida));
    console.log(`    codigo ${codigo}, ${avaliacao.status}${avaliacao.detalhes.length ? `: ${avaliacao.detalhes.join("; ")}` : ""}`);
    resultados.push({ id: passo.id, cmd: passo.cmd, cwd: passo.cwd, codigo, duracaoMs, ...avaliacao, arquivo });
  }
  const quando = new Date().toISOString();
  await writeFile(join(pasta, "resultados.json"), JSON.stringify(resultados, null, 2) + "\n");
  await writeFile(join(pasta, "RESUMO.md"), montarResumo(resultados, quando));
  await writeFile(join(pasta, "INDEX.md"), await montarIndice(pasta));
  return resultados.some((r) => r.status === "divergente") ? 1 : 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  principal().then(
    (codigo) => process.exit(codigo),
    (erro) => {
      console.error(erro.message);
      process.exit(2);
    },
  );
}
