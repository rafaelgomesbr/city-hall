import { z } from "zod";
import { mensagemDeUrlSemVerificacao, urlDoBancoVerifica } from "./banco/tls.js";

/**
 * Configuração vem do ambiente e é validada na partida.
 *
 * Falhar no boot quando falta segredo é deliberado: um servidor que sobe com
 * chave padrão é pior que um servidor que não sobe, porque parece funcionar.
 */
/**
 * Trata variável vazia como variável ausente, nos campos opcionais.
 *
 * `VAR=` num arquivo .env não apaga a variável: ela chega como string vazia.
 * Sem isto, seguir o `.env.example` ao pé da letra (ele manda DEIXAR VAZIO o
 * NOTIFICADOR_ARQUIVO) derruba a partida com "String must contain at least 1
 * character", que não diz a ninguém o que fazer. O defeito nunca apareceu
 * porque no compose e na PaaS a variável não existe, em vez de existir vazia.
 *
 * Só vale onde ausente e vazio querem dizer a mesma coisa. NÃO se aplica ao
 * MARCA_DAGUA, onde apagar o valor é um ato deliberado que desliga o carimbo,
 * e virar "ausente" traria o carimbo de volta em silêncio.
 */
function vazioEhAusente<T extends z.ZodTypeAny>(esquema: T) {
  return z.preprocess((v) => (v === "" ? undefined : v), esquema);
}

const esquema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().min(1).max(65535).default(3333),
  HOST: z.string().default("127.0.0.1"),

  /** Ausente em desenvolvimento e em teste: aí o banco sobe em WebAssembly. */
  DATABASE_URL: vazioEhAusente(z.string().url().optional()),

  /**
   * Carimbo impresso em todo documento oficial.
   *
   * O padrão MARCA, e desmarcar exige ato deliberado: `MARCA_DAGUA=` vazio.
   * A regra já foi o contrário, ligada ao ambiente, e o contrário estava
   * errado de um jeito específico: `NODE_ENV === "production" ? undefined :
   * "DOCUMENTO DE VALIDAÇÃO"` desligava o carimbo exatamente no ambiente onde
   * o piloto roda. Ou seja, durante toda a validação com município real, o
   * laudo de teste saía indistinguível de um laudo verdadeiro, e não havia
   * variável nenhuma para corrigir isso.
   *
   * Um documento a mais com carimbo é um constrangimento. Um documento a menos
   * é uma peça anexada a processo por engano.
   */
  MARCA_DAGUA: z.string().default("DOCUMENTO DE VALIDAÇÃO"),

  /**
   * Para onde sai o link de redefinição de senha.
   *
   * Vazias, o servidor cai no notificador que só anuncia no log. Isso é
   * aceitável em desenvolvimento e inaceitável em produção, e a checagem lá
   * embaixo recusa subir sem elas: até aqui, produção escrevia o link de uso
   * único em `console.log`, por fora do `redact`, e a rota respondia
   * "enviamos o link" sem enviar nada.
   */
  NOTIFICADOR_URL: vazioEhAusente(z.string().url().optional()),
  NOTIFICADOR_CHAVE: vazioEhAusente(z.string().min(1).optional()),

  /**
   * Canal de teste: grava a mensagem inteira, com o link, neste arquivo.
   *
   * Só existe para a suíte de ponta a ponta contra a API conseguir conferir a
   * recuperação de senha sem que o link volte a sair no log do servidor. A
   * checagem lá embaixo DERRUBA A PARTIDA se isto vier preenchido em produção:
   * um arquivo com link de redefinição de qualquer conta é credencial em texto
   * puro esperando para ser lida.
   */
  NOTIFICADOR_ARQUIVO: vazioEhAusente(z.string().min(1).optional()),

  /**
   * Desliga a recuperação de senha por email, de propósito.
   *
   * Enquanto não houver provedor, isto é mais honesto que uma tela que promete
   * um email que não sai: a rota recusa e manda procurar quem administra o
   * município, que consegue redefinir a senha de qualquer jeito. Precisa ser
   * declarado, porque produção não sobe com a recuperação nem ligada sem
   * destino nem desligada sem alguém ter decidido.
   */
  RECUPERACAO_ATIVA: z.enum(["sim", "nao"]).default("sim"),

  /**
   * Liga o envio de email de verdade, e é a mesma classe de decisão do
   * `PUSH_ATIVO`: desligado por padrão, e ligar é ato deliberado.
   *
   * O buraco que ele fecha é específico. `NOTIFICADOR_URL` e
   * `NOTIFICADOR_CHAVE` existem desde a migração da recuperação de senha, a
   * partida em produção RECUSA subir sem elas com a recuperação ligada, e
   * NENHUM código jamais as leu: não havia cliente HTTP. O servidor conferia a
   * configuração de um provedor com o qual nunca falava, e a mensagem ia para
   * o `notificadorDeLog`. Por isso a recuperação está em `nao` na produção de
   * hoje: não por decisão de produto, por falta de cliente.
   *
   * Com `nao`, a rota que dependeria de email RECUSA dizendo que o recurso
   * está desligado, em vez de responder que mandou. Prometer email que não sai
   * foi um defeito real deste produto, confirmado contra a produção, e é o
   * defeito que esta variável existe para não repetir no ofício.
   */
  EMAIL_ATIVO: z.enum(["sim", "nao"]).default("nao"),

  /**
   * Remetente que o provedor deve usar, quando ele exige um.
   *
   * OBRIGATÓRIO quando `EMAIL_ATIVO=sim`, e a obrigação é do provedor: o
   * Resend documenta `from` como campo obrigatório e recusa na validação toda
   * mensagem que chegue sem ele. Era opcional aqui, e opcional queria dizer
   * "configuração completa, servidor de pé, cem por cento das mensagens
   * recusadas".
   *
   * Fica no ambiente, e não fixo no código, porque o endereço tem que ser de
   * um domínio que a prefeitura controla E que esteja verificado na conta do
   * provedor. Sem as duas coisas, a mensagem é recusada na origem ou cai em
   * spam na entrada do órgão destinatário.
   */
  EMAIL_REMETENTE: vazioEhAusente(z.string().email().optional()),

  /**
   * Por quantas horas vale o link de uso único do ofício.
   *
   * Setenta e duas horas por padrão: um ofício enviado na sexta à noite
   * precisa continuar abrindo na segunda de manhã. Menos que isso transforma
   * fim de semana em link morto, e a recepção do órgão liga pedindo reenvio.
   * O teto de trinta dias existe porque link de uso único que vive um semestre
   * é, na prática, link permanente.
   */
  OFICIO_LINK_HORAS: z.coerce.number().int().min(1).max(720).default(72),

  /**
   * Quantas vezes o mesmo ofício pode ser enviado, contando a primeira vez.
   *
   * O teto existe porque cada envio cria um link de uso único novo para o
   * mesmo dossiê. Sem teto, um botão de "reenviar" clicado em série espalha
   * dezenas de endereços vivos para o mesmo conteúdo, e basta um deles vazar.
   * Três cobre o caso real (foi para a caixa de spam, a pessoa mudou de setor)
   * sem virar torneira aberta. O banco guarda um teto absoluto de vinte, que
   * vale mesmo se esta regra sumir.
   */
  OFICIO_MAX_ENVIOS: z.coerce.number().int().min(1).max(20).default(3),

  /**
   * Chave de assinatura dos tokens de acesso, ou uma LISTA delas separada por
   * vírgula. Mínimo de 32 bytes de entropia cada. Em produção é obrigatória;
   * sem ela o processo não sobe.
   *
   * Aceitar lista existe para que trocar o segredo deixe de significar
   * derrubar o plantão inteiro. Com um segredo só, a troca invalida toda
   * sessão aberta no instante em que o processo reinicia, e num município isso
   * cai no meio de um temporal: todo agente em campo perde o token e precisa
   * digitar senha na chuva. O resultado prático era que ninguém trocava, e um
   * segredo que nunca gira é um segredo que só precisa vazar uma vez.
   *
   * A regra: **assina sempre com o PRIMEIRO, aceita qualquer um da lista na
   * verificação.** Ver `separarSegredos` abaixo para os dois procedimentos
   * opostos (rotação programada e revogação por vazamento), porque confundir
   * um com o outro é o jeito de transformar esta variável em buraco.
   */
  JWT_SEGREDO: vazioEhAusente(z.string().min(32).optional()),

  /**
   * Desliga a notificação por push, de propósito, e é a mesma classe de
   * decisão do `RECUPERACAO_ATIVA` acima.
   *
   * Enquanto a metade aplicativo não existir, ligar isto seria montar um
   * varredor que manda notificação para lugar nenhum e uma rota de registro
   * que aceita ficha de aparelho que nunca vai receber nada. Com `nao`, o
   * varredor NÃO SOBE e as rotas de aparelho recusam dizendo isso.
   *
   * Precisa ser declarado porque as duas metades sobem em turnos diferentes:
   * o dia em que o aplicativo passar a registrar aparelho é o dia em que
   * alguém troca isto para `sim`, e não um dia antes.
   */
  PUSH_ATIVO: z.enum(["sim", "nao"]).default("nao"),

  /**
   * Liga o relógio que LISTA objeto órfão no armazenamento (migração 035).
   *
   * Desligado por padrão, e a razão é estreita e tem data de validade escrita
   * abaixo: a listagem do S3 (`ListObjectsV2` em `armazenamento/s3.ts`) nunca
   * falou com provedor de verdade. Ela é conferida contra XML de resposta em
   * teste, e isso prova a leitura, não o diálogo. Ligar por padrão faria um
   * caminho nunca exercitado começar a percorrer o balde inteiro da produção
   * sozinho, todo dia, no primeiro deploy depois desta linha.
   *
   * Não é a mesma classe de decisão da minimização por prazo, que sobe SEMPRE
   * porque executa uma obrigação legal. Esta varredura não executa nada: ela
   * escreve uma lista de candidatos que uma pessoa vai ler e decidir. Ficar
   * desligada por um mês adia uma lista, e não descumpre promessa nenhuma.
   *
   * QUANDO ELA MORRE: no dia em que a varredura rodar uma vez contra o
   * provedor de verdade e a contagem de objetos bater com o painel do
   * armazenamento, esta variável some e o relógio passa a subir sempre.
   */
  VARREDURA_DE_ORFAOS_ATIVA: z.enum(["sim", "nao"]).default("nao"),

  /**
   * Quantos minutos antes de o prazo vencer o aviso sai.
   *
   * Uma hora por padrão: tempo de o agente sair de onde está e chegar. Menos
   * que isso vira aviso que chega junto com o vencimento, que não serve para
   * agir; muito mais vira aviso que a pessoa esquece antes da hora.
   */
  PUSH_JANELA_MINUTOS: z.coerce.number().int().min(5).max(1440).default(60),

  /**
   * Credenciais de envio DIRETO para a Apple e para o Google.
   *
   * O serviço de push da Expo foi recusado pelo dono do produto em 09/09/2026:
   * a instalação é nativa e não fazia sentido o servidor depender de um
   * terceiro que a instalação não usa. O ganho é concreto para o laudo de
   * proteção de dados, porque a ficha do aparelho e o texto da notificação
   * deixam de passar por mais um servidor estrangeiro.
   *
   * `APNS_CHAVE` é o CAMINHO do arquivo `.p8`, e o arquivo nunca entra no
   * repositório. O conteúdo dele é lido uma vez, na partida, e vive só na
   * memória do processo: ele assina notificação para QUALQUER aplicativo do
   * time, então quem o obtém escreve na tela bloqueada de um agente de Defesa
   * Civil, e uma ordem falsa de evacuação escrita ali é dano na rua.
   */
  APNS_KEY_ID: vazioEhAusente(z.string().min(1).optional()),
  APNS_TEAM_ID: vazioEhAusente(z.string().min(1).optional()),
  APNS_CHAVE: vazioEhAusente(z.string().min(1).optional()),
  APNS_BUNDLE: vazioEhAusente(z.string().min(1).optional()),

  /**
   * Com QUAL das duas APNs falar, e a resposta errada aqui é silenciosa.
   *
   * A Apple tem dois serviços de push que não se falam, `api.push.apple.com` e
   * `api.sandbox.push.apple.com`. Qual vale é decidido pelo `aps-environment`
   * com que o APLICATIVO foi assinado, e uma ficha emitida num ambiente é
   * recusada no outro.
   *
   * Até 13/09/2026 não havia escolha: o servidor montava o provedor sempre
   * contra produção. Um binário compilado localmente pelo Xcode, que é como o
   * piloto instala, assina com `development` e recebe ficha de SANDBOX. A
   * produção respondia `BadDeviceToken`, que está na lista de recusas que
   * significam "este aparelho não existe mais", e o varredor fazia o que deve
   * fazer com essa resposta: REVOGAVA o aparelho. O agente não recebia o
   * aviso, sumia da lista de aparelhos, reinstalava, e o ciclo repetia. Sem
   * erro em lugar nenhum, porque o servidor estava funcionando como escrito.
   *
   * O padrão é `producao` porque é onde o binário de loja fala, e porque
   * padrão errado aqui seria pior do que padrão nenhum: o piloto acabaria e o
   * produto sairia para a loja conversando com o sandbox, calado.
   *
   * Valor fora dos dois DERRUBA a partida, em vez de cair no padrão: cair no
   * padrão diante de `sandbox`, `dev` ou `produção` com acento devolveria
   * exatamente este defeito, agora com alguém convencido de ter configurado.
   */
  APNS_AMBIENTE: z.enum(["producao", "teste"]).default("producao"),

  /** Caminho do JSON da conta de serviço do Firebase. Só o Android usa. */
  FCM_CONTA_SERVICO: vazioEhAusente(z.string().min(1).optional()),

  /**
   * Liga o segundo fator (o código de seis dígitos do aplicativo de
   * autenticação), e é a mesma classe de decisão do `PUSH_ATIVO` e do
   * `EMAIL_ATIVO`: desligado por padrão, ligar é ato deliberado, e ligado sem
   * o que ele precisa DERRUBA A PARTIDA em vez de subir pela metade.
   *
   * Com `sim`, o administrador do município passa a ser OBRIGADO a ter o
   * segundo fator, e os demais papéis podem ligar se quiserem. Com `nao`, as
   * rotas de segundo fator existem e RECUSAM dizendo que o recurso está
   * desligado, em vez de sumirem: rota ausente responde 404, e o painel leria
   * isso como "versão velha do servidor" em vez de "o município ainda não
   * ligou".
   *
   * DESLIGAR DEPOIS DE LIGADO tem uma consequência que precisa estar escrita:
   * contas que já tinham o segundo fator voltam a entrar só com a senha, e o
   * login deixa de pedir o código. Isso não é um buraco de autenticação, é uma
   * decisão de quem tem o ambiente do servidor, que é a mesma pessoa que tem o
   * `JWT_SEGREDO` e, com ele, fabricaria token de administrador de qualquer
   * jeito. O que não pode acontecer é o contrário: o recurso ligado e o
   * servidor incapaz de conferir o código, que é o que a checagem lá embaixo
   * impede.
   */
  SEGUNDO_FATOR_ATIVO: z.enum(["sim", "nao"]).default("nao"),

  /**
   * A chave que cifra o segredo do segundo fator dentro do banco: 32 bytes em
   * base64. Gere com:
   *   node -e "console.log(require('node:crypto').randomBytes(32).toString('base64'))"
   *
   * Ela fica FORA do banco de propósito. É isso que faz um vazamento de banco
   * (cópia de segurança perdida, credencial de leitura exposta, disco fora de
   * uso) não devolver segundo fator utilizável: sem esta chave, o que vazou é
   * um envelope que não abre.
   *
   * TROCAR ESTA CHAVE INVALIDA TODOS OS SEGREDOS JÁ GUARDADOS, e não existe
   * lista de chaves aceitas como no `JWT_SEGREDO`. É deliberado: aquela lista
   * existe para não derrubar o plantão numa rotação, e aqui derrubar significa
   * "todo mundo refaz a ativação do aplicativo de autenticação", com os
   * códigos de recuperação servindo de saída. Uma lista de chaves aqui seria
   * uma lista de chaves que ainda abrem o segredo, que é o oposto do motivo
   * de rotacionar.
   */
  SEGUNDO_FATOR_CHAVE: vazioEhAusente(z.string().min(1).optional()),

  /**
   * Teto de tentativas do segundo fator, e por quantos minutos a conta fica
   * travada nele. SEPARADO do teto de senha, e a separação é o ponto.
   *
   * O contador de senha zera a cada acerto de senha. Se o segundo fator
   * dividisse aquele contador, cada tentativa de adivinhar os seis dígitos
   * começaria por um acerto de senha, que zeraria o contador, e o teto nunca
   * fecharia: seriam tentativas infinitas contra um espaço de um milhão.
   */
  SEGUNDO_FATOR_MAX_FALHAS: z.coerce.number().int().min(3).max(20).default(5),
  SEGUNDO_FATOR_BLOQUEIO_MINUTOS: z.coerce.number().int().min(1).max(1440).default(15),

  /**
   * De quem este processo aceita cabeçalho de endereço de origem.
   *
   * `nenhum` (o padrão) usa o salto imediato, e cabeçalho nenhum o muda.
   * `fly` autoriza a leitura de `Fly-Client-IP`, que o edge do Fly.io
   * reescreve antes de repassar.
   *
   * ISTO É UMA DECLARAÇÃO, e não uma adivinhação, porque adivinhar reabriu um
   * defeito já corrigido. `rede.ts` nasceu para fechar o `X-Forwarded-For`
   * escolhido pelo cliente e passou a ler `Fly-Client-IP` SEM amarração a
   * ambiente, a plataforma ou a lista de proxies confiáveis. Reproduzido: com
   * `LOGIN_POR_IP` no padrão, trinta POST /auth/entrar do mesmo endereço
   * davam vinte recusas; as mesmas trinta mandando `Fly-Client-IP` diferente a
   * cada uma davam ZERO. E `docs/COLOCAR-DE-PE.md` oferece Fly, Railway e
   * Render como opções equivalentes, então nada garantia que o edge do Fly
   * estivesse na frente.
   *
   * Além da força bruta, o que este valor governa é a trilha: quem exporta a
   * base de cidadãos escolhia o endereço gravado como autor do ato, e esse
   * registro é a resposta do município à autoridade nacional no dia em que um
   * dado vaza.
   *
   * O padrão é o valor SEGURO, e não o do ambiente onde hoje se implanta:
   * quem muda de PaaS esquece de mexer em variável, e o esquecimento precisa
   * cair do lado que não abre buraco.
   */
  PROXY_DE_BORDA: z.enum(["nenhum", "fly"]).default("nenhum"),

  /** Origens permitidas, separadas por vírgula. Em produção não pode ser "*". */
  ORIGENS_PERMITIDAS: z.string().default("http://localhost:5173"),

  ACESSO_MINUTOS: z.coerce.number().int().min(1).max(60).default(15),
  RENOVACAO_DIAS: z.coerce.number().int().min(1).max(90).default(14),
  MAX_FALHAS_LOGIN: z.coerce.number().int().min(3).max(20).default(5),
  BLOQUEIO_MINUTOS: z.coerce.number().int().min(1).max(1440).default(15),
  /** Tentativas de login por endereço, na janela de 5 minutos. */
  LOGIN_POR_IP: z.coerce.number().int().min(1).max(10_000).default(10),

  /**
   * Armazenamento de evidência. Ausentes em desenvolvimento: aí a própria API
   * guarda os bytes em memória, com URL assinada e expirando do mesmo jeito.
   */
  S3_ENDPOINT: vazioEhAusente(z.string().url().optional()),
  S3_BALDE: vazioEhAusente(z.string().min(1).optional()),
  S3_REGIAO: z.string().min(1).default("auto"),
  S3_CHAVE_ID: vazioEhAusente(z.string().min(1).optional()),
  S3_CHAVE_SECRETA: vazioEhAusente(z.string().min(1).optional()),
  /** Endereço público desta API, para montar a URL do armazenamento local. */
  URL_PUBLICA: z.string().url().default("http://127.0.0.1:3333"),
  /** Endereço público do painel, para montar o link de redefinição de senha. */
  URL_PAINEL: z.string().url().default("http://localhost:5173"),
  RECUPERACAO_MINUTOS: z.coerce.number().int().min(5).max(120).default(30),

  /**
   * A chave de navegador do Google Maps que o PAINEL usa para desenhar as ruas.
   *
   * Ela mora aqui, na API, e não no build do painel, e a razão é de conta a
   * pagar. O painel é UM build estático servindo TODOS os municípios: uma
   * chave assada ali seria a chave do fornecedor, cobrada no cartão dele, para
   * o uso de todas as prefeituras, e o Google Maps cobra por carregamento de
   * mapa. Na API cada implantação carrega a chave de quem paga por ela.
   *
   * ELA NÃO É SEGREDO, e tratá-la como se fosse produziria teatro. Chave de
   * navegador viaja no JavaScript da página para qualquer um que abra as
   * ferramentas do desenvolvedor: quem protege a conta não é o sigilo, é a
   * restrição por referenciador HTTP no console do Google, que recusa a chave
   * usada a partir de qualquer endereço fora da lista. Por isso a rota que a
   * serve não a esconde, não a encobre em log e não a chama de segredo. O que
   * ela faz é não servir mais do que o painel precisa.
   *
   * Vazia é uma escolha legítima e é o padrão: o painel desenha o plano
   * esquemático, com as mesmas coordenadas em escala e sem nenhum contato com
   * o Google. É o modo que `docs/SUBPROCESSADORES.md` seção 2.2 promete ao
   * município que recusar o envio, e é também o que sobra quando a prefeitura
   * está sem internet. Não existe checagem de produção exigindo esta variável,
   * de propósito: um município sem chave precisa subir.
   *
   * O nome é `MAPS_KEY` porque é assim que a variável já estava escrita no
   * ambiente da implantação. Renomear para o padrão em português quebraria a
   * implantação de pé por uma questão de estilo.
   */
  MAPS_KEY: vazioEhAusente(z.string().min(1).optional()),
});

export type Config = z.infer<typeof esquema> & {
  /**
   * Os segredos de token, em ordem. O primeiro assina; todos verificam.
   *
   * Tupla não vazia, e não `Uint8Array[]`, porque o tipo é quem garante que
   * `jwtSegredos[0]` existe. Com um array comum, o dia em que uma refatoração
   * deixasse a lista vazia o servidor assinaria com `undefined`, e o
   * `TextEncoder` transformaria isso na string "undefined": um segredo público
   * de nove caracteres, aceito por qualquer instalação do produto.
   */
  jwtSegredos: readonly [Uint8Array, ...Uint8Array[]];
  origens: string[];
};

/**
 * Quantos segredos a lista aceita ao mesmo tempo.
 *
 * O teto não é burocracia: cada segredo na lista é um segredo que ainda ABRE
 * sessão. Uma lista que só cresce é uma lista onde o segredo aposentado em
 * março continua valendo em dezembro, que é exatamente o contrário do motivo
 * de rotacionar. Três cobre a rotação real (o novo, o que sai, e uma folga
 * para quem rotacionou duas vezes seguidas sem esperar) e força a limpeza.
 */
const MAXIMO_DE_SEGREDOS = 3;

/**
 * Separa e confere a lista de segredos de token.
 *
 * **Rotação programada** (o segredo está velho, ninguém sabe dele): põe o novo
 * NA FRENTE, mantém o antigo atrás, e sobe. A partir daí todo token novo sai
 * assinado com o novo segredo, e os tokens já emitidos continuam valendo até
 * expirarem sozinhos, o que leva no máximo `ACESSO_MINUTOS` (teto de 60). Uma
 * hora depois, tira o antigo da lista e sobe de novo. Ninguém é derrubado, e é
 * por isso que a rotação passa a acontecer de verdade.
 *
 * **Revogação por vazamento** (alguém tem o segredo): o segredo vazado SAI DA
 * LISTA IMEDIATAMENTE, sem período de convivência. Aqui derrubar todo mundo é
 * o comportamento certo, e não um efeito colateral a ser evitado: enquanto o
 * segredo vazado estiver na lista, quem o tem fabrica token de administrador de
 * qualquer município, com a organização que quiser dentro. Esperar uma hora
 * para "não incomodar o plantão" é dar uma hora de acesso total ao invasor. O
 * plantão entra de novo com a senha; o invasor, não.
 *
 * Os dois procedimentos usam a mesma variável e são opostos. Quem estiver
 * fazendo o segundo pensando que está fazendo o primeiro deixa o produto
 * aberto, e essa é a única forma de errar aqui que não aparece em log nenhum.
 */
function separarSegredos(bruto: string): [string, ...string[]] {
  const lista = bruto.split(",").map((s) => s.trim()).filter(Boolean);

  const primeiro = lista[0];
  if (!primeiro) {
    throw new Error(
      "JWT_SEGREDO está preenchida mas não tem nenhum segredo: ela é um "
      + "segredo, ou uma lista separada por vírgula, e o primeiro da lista é o "
      + "que assina.",
    );
  }

  const curtos = lista.filter((s) => s.length < 32).length;
  if (curtos > 0) {
    throw new Error(
      `JWT_SEGREDO tem ${curtos} segredo(s) com menos de 32 caracteres. `
      + "O tamanho vale para CADA item da lista, e não para a linha inteira: um "
      + "item curto continua sendo aceito na verificação, então ele é o elo que "
      + "o ataque escolhe.",
    );
  }

  // Repetido não é erro inofensivo: ele faz a lista PARECER rotacionada
  // ("olha, tem dois") enquanto na prática o segredo é um só, e a troca que
  // alguém acha que fez não aconteceu.
  if (new Set(lista).size !== lista.length) {
    throw new Error(
      "JWT_SEGREDO tem segredo repetido. Uma lista com o mesmo valor duas "
      + "vezes não é uma rotação: é um segredo só, com aparência de dois.",
    );
  }

  if (lista.length > MAXIMO_DE_SEGREDOS) {
    throw new Error(
      `JWT_SEGREDO tem ${lista.length} segredos e o teto é ${MAXIMO_DE_SEGREDOS}. `
      + "Cada item da lista ainda abre sessão: lista que só cresce é segredo "
      + "aposentado que nunca foi aposentado. Termine a rotação anterior antes "
      + "de começar outra.",
    );
  }

  return [primeiro, ...lista.slice(1)];
}

export function carregarConfig(ambiente: NodeJS.ProcessEnv = process.env): Config {
  const analisado = esquema.safeParse(ambiente);
  if (!analisado.success) {
    const problemas = analisado.error.issues
      .map((i) => `${i.path.join(".")}: ${i.message}`)
      .join("; ");
    throw new Error(`Configuração inválida: ${problemas}`);
  }
  const c = analisado.data;

  /*
    Push ligado exige credencial de verdade, e a checagem vale em TODO
    ambiente, não só em produção.

    A razão é a mesma que derrubou a recuperação de senha ligada sem destino: o
    servidor sobe, o aplicativo registra o aparelho, o varredor roda, e nada
    chega a lugar nenhum. Ninguém percebe pelo lado de cá, porque a única
    evidência de sucesso é uma notificação aparecendo num telefone que está no
    bolso de outra pessoa.

    Fora de produção a checagem serve a outra coisa: quem ligar o push na
    própria máquina para experimentar descobre na hora que falta credencial,
    em vez de descobrir depois de meia hora achando que o varredor está mudo
    por outro motivo.

    O Google fica de fora da exigência de propósito: a instalação de hoje é o
    aplicativo do iPhone, e exigir a conta de serviço do Firebase impediria o
    piloto de subir por causa de uma plataforma que ainda não existe. O que
    fecha esse buraco é a rota de registro, que recusa aparelho Android
    enquanto `FCM_CONTA_SERVICO` estiver ausente, em vez de aceitar a ficha e
    guardar um aparelho que nunca receberia nada.
  */
  if (c.PUSH_ATIVO === "sim") {
    const faltando = (
      [
        ["APNS_KEY_ID", c.APNS_KEY_ID],
        ["APNS_TEAM_ID", c.APNS_TEAM_ID],
        ["APNS_CHAVE", c.APNS_CHAVE],
        ["APNS_BUNDLE", c.APNS_BUNDLE],
      ] as const
    ).filter(([, valor]) => !valor).map(([nome]) => nome);

    if (faltando.length > 0) {
      throw new Error(
        `A notificação por push está ligada e não tem como assinar o envio: falta ${faltando.join(", ")}. ` +
        "Preencha, ou desligue com PUSH_ATIVO=nao. Sem isso o servidor sobe, o " +
        "aplicativo registra o aparelho, o varredor roda e nenhuma notificação " +
        "chega, e o único lugar onde isso apareceria é o telefone que está no " +
        "bolso de outra pessoa.",
      );
    }
  }

  /*
    Email ligado exige destino de verdade, e a checagem vale em TODO ambiente,
    pelo mesmo motivo do `PUSH_ATIVO` acima.

    Quem liga o envio na própria máquina para experimentar descobre na hora que
    falta o endereço do provedor, em vez de descobrir depois de meia hora
    achando que o ofício não chegou por outro motivo.
  */
  if (
    c.EMAIL_ATIVO === "sim"
    && (!c.NOTIFICADOR_URL || !c.NOTIFICADOR_CHAVE || !c.EMAIL_REMETENTE)
  ) {
    /*
      `EMAIL_REMETENTE` entrou nesta exigência quando o cliente passou a falar
      o contrato de verdade do provedor, e a mudança não é de gosto.

      O remetente era opcional aqui porque "provedor nenhum é igual". O provedor
      escolhido (Resend) trata `from` como campo OBRIGATÓRIO, e recusa na
      validação toda mensagem que chegue sem ele. Opcional, então, queria dizer
      exatamente isto: uma configuração que parece completa, um servidor que
      sobe sem reclamar, e cem por cento das mensagens recusadas, descobertas
      uma a uma por quem estava esperando o email.
    */
    throw new Error(
      "O envio de email está ligado e não tem para onde mandar: defina "
      + "NOTIFICADOR_URL, NOTIFICADOR_CHAVE e EMAIL_REMETENTE, ou desligue com "
      + "EMAIL_ATIVO=nao. Sem isso o servidor sobe, a rota responde que enviou, "
      + "e nenhuma mensagem sai deste processo. O passo a passo de como ligar "
      + "está em docs/LIGAR-O-EMAIL.md.",
    );
  }

  /*
    Segundo fator ligado exige a chave que cifra o segredo, e a checagem vale
    em TODO ambiente, pelo mesmo motivo do `PUSH_ATIVO` acima.

    Sem a chave o servidor subiria, a tela de ativação apareceria, e a primeira
    pessoa a tentar ligar o segundo fator levaria um erro interno no meio da
    ativação, com metade do estado gravado. Pior: se um dia alguém "resolvesse"
    isso guardando o segredo em texto, o produto passaria a ter no banco a
    credencial que o segundo fator existe para proteger. O CHECK
    `segredo_vem_cifrado` (migração 022) recusa esse atalho no banco, e esta
    checagem o recusa antes, na partida, que é onde dá para consertar sem
    ninguém perceber.
  */
  if (c.SEGUNDO_FATOR_ATIVO === "sim" && !c.SEGUNDO_FATOR_CHAVE) {
    throw new Error(
      "O segundo fator está ligado e não tem chave para cifrar o segredo: "
      + "defina SEGUNDO_FATOR_CHAVE (32 bytes em base64), ou desligue com "
      + "SEGUNDO_FATOR_ATIVO=nao. Sem ela o servidor sobe, a tela de ativação "
      + "aparece, e a ativação quebra no meio.",
    );
  }

  if (c.NODE_ENV === "production") {
    if (!c.DATABASE_URL) throw new Error("DATABASE_URL é obrigatória em produção");
    /*
      E ter a URL não basta: ela precisa PEDIR verificação do certificado.

      Esta checagem existe porque o buraco já tinha sido fechado uma vez, em
      09/09/2026, e voltou pela omissão de uma palavra numa variável de
      ambiente. `montarConfiguracaoDoPool` só monta a âncora de confiança
      quando a URL traz `sslmode` verificado; sem ele, devolvia a string crua e
      o processo subia calado. Como `verify-full` não estava escrito em nenhum
      lugar que o operador lê, provisionar o segundo município colando a URL
      que o painel do provedor oferece bastava para a base de TODOS os
      municípios voltar a trafegar cifrada e não autenticada.

      É a mesma classe de decisão do PUSH_ATIVO, do EMAIL_ATIVO e do
      SEGUNDO_FATOR_ATIVO logo acima: em produção o processo NÃO SOBE quando
      falta o que importa, porque servidor que sobe pela metade parece que
      funcionou.
    */
    if (!urlDoBancoVerifica(c.DATABASE_URL)) {
      throw new Error(mensagemDeUrlSemVerificacao("DATABASE_URL", c.DATABASE_URL));
    }
    if (!c.JWT_SEGREDO) throw new Error("JWT_SEGREDO é obrigatória em produção");
    if (c.NOTIFICADOR_ARQUIVO) {
      throw new Error(
        "NOTIFICADOR_ARQUIVO é canal de teste e não pode existir em produção: "
        + "ele grava o link de redefinição de senha em texto puro, e esse link "
        + "assume qualquer conta de qualquer município enquanto estiver vivo.",
      );
    }
    /*
      Recuperação de senha ligada exige destino de verdade.

      Sem esta checagem, produção caía no `notificadorDeLog` e a recuperação
      respondia 202 "enviamos um link" sem enviar nada, enquanto escrevia a
      credencial de uso único no log do servidor. Duas falhas na mesma linha:
      uma promessa falsa ao usuário e um segredo vivo em texto puro.

      Desligar é decisão legítima e explícita: `RECUPERACAO_ATIVA=nao`, e a
      tela passa a mandar procurar quem administra o município.
    */
    if (c.RECUPERACAO_ATIVA === "sim" && (!c.NOTIFICADOR_URL || !c.NOTIFICADOR_CHAVE)) {
      throw new Error(
        "A recuperação de senha está ligada e não tem por onde sair. Defina "
        + "NOTIFICADOR_URL e NOTIFICADOR_CHAVE, ou desligue com "
        + "RECUPERACAO_ATIVA=nao. Sem isso o link de redefinição iria para o "
        + "log do servidor, em texto puro, e nenhum email seria enviado.",
      );
    }
    /*
      E ter as variáveis preenchidas não basta: alguém precisa FALAR com o
      provedor.

      Este é o buraco que ficou aberto por semanas. A checagem acima existia,
      passava, e mesmo assim nenhum email saía, porque o servidor não tinha
      cliente HTTP nenhum: `NOTIFICADOR_URL` era conferida e nunca usada, e a
      mensagem caía no `notificadorDeLog`, que escreve o link de uso único em
      texto puro por fora do `redact`. Duas falhas na mesma linha, e a
      configuração parecia correta nas duas.

      Com `EMAIL_ATIVO=sim` o cliente de verdade é montado na partida (ver
      `index.ts`). Sem ele, a recuperação em produção precisa estar desligada,
      e aí a tela manda procurar quem administra o município, que é o único
      caminho que de fato funciona nesse estado.
    */
    if (c.RECUPERACAO_ATIVA === "sim" && c.EMAIL_ATIVO !== "sim") {
      throw new Error(
        "A recuperação de senha está ligada com EMAIL_ATIVO=nao: as variáveis "
        + "do provedor estão preenchidas, mas nada neste processo fala com ele, "
        + "então o link de redefinição iria para o log do servidor em vez da "
        + "caixa de entrada de quem pediu. Ligue com EMAIL_ATIVO=sim, ou "
        + "desligue a recuperação com RECUPERACAO_ATIVA=nao.",
      );
    }
    if (c.ORIGENS_PERMITIDAS.includes("*")) {
      throw new Error("ORIGENS_PERMITIDAS não pode conter curinga em produção");
    }
    // Guardar evidência na memória do processo em produção significaria perder
    // toda foto de vistoria no primeiro reinício.
    if (!c.S3_ENDPOINT || !c.S3_BALDE || !c.S3_CHAVE_ID || !c.S3_CHAVE_SECRETA) {
      throw new Error(
        "Armazenamento de evidência é obrigatório em produção: " +
        "defina S3_ENDPOINT, S3_BALDE, S3_CHAVE_ID e S3_CHAVE_SECRETA",
      );
    }

    /*
      Endereço apontando para localhost em produção é a pior categoria de
      defeito de configuração: silenciosa. O servidor sobe, responde, e só o
      destinatário descobre, sozinho, que o link não abre.

      URL_PAINEL vira o link de redefinição de senha que chega por email.
      URL_PUBLICA vira o endereço de onde o aparelho busca a foto de vistoria.
      Nenhum dos dois tem valor padrão que faça sentido fora da máquina de
      quem desenvolve, então em produção os dois são obrigatórios e explícitos.
    */
    for (const [nome, valor] of [
      ["URL_PAINEL", c.URL_PAINEL],
      ["URL_PUBLICA", c.URL_PUBLICA],
      ["ORIGENS_PERMITIDAS", c.ORIGENS_PERMITIDAS],
    ] as const) {
      if (/localhost|127\.0\.0\.1|0\.0\.0\.0/.test(valor)) {
        throw new Error(
          `${nome} aponta para a máquina local em produção (${valor}). ` +
          "Defina o endereço real: um link para localhost chega quebrado a " +
          "quem recebe, e ninguém percebe pelo lado de cá.",
        );
      }
    }

    // HTTPS não é preferência: token de sessão e foto de vistoria viajam aí.
    for (const [nome, valor] of [
      ["URL_PAINEL", c.URL_PAINEL],
      ["URL_PUBLICA", c.URL_PUBLICA],
    ] as const) {
      if (!valor.startsWith("https://")) {
        throw new Error(`${nome} precisa ser https em produção (${valor})`);
      }
    }
  }

  // Fora de produção, um segredo efêmero por processo: reiniciar invalida os
  // tokens, que é o comportamento correto para um ambiente descartável.
  const segredos = c.JWT_SEGREDO
    ? separarSegredos(c.JWT_SEGREDO)
    : ([crypto.randomUUID() + crypto.randomUUID()] as [string, ...string[]]);

  const codificador = new TextEncoder();
  const [assina, ...aceitos] = segredos.map((s) => codificador.encode(s));

  return {
    ...c,
    jwtSegredos: [assina!, ...aceitos],
    origens: c.ORIGENS_PERMITIDAS.split(",").map((o) => o.trim()).filter(Boolean),
  };
}
