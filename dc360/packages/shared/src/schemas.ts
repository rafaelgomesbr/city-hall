import { z } from "zod";
import {
  CANAIS_ENTRADA,
  CHAVE_ACIONAR_ORGAO,
  CHECKLIST_OBRIGATORIO,
  CHECKLIST_VISTORIA,
  ORIGENS,
  PAPEIS,
  SEVERIDADES,
  STATUS_OCORRENCIA,
  TIPOS_COBRADE,
  TIPOS_DE_ENTRADA,
  TIPO_A_CLASSIFICAR,
} from "./dominio.js";
import { CASAS_DE_COORDENADA } from "./localizacao.js";

/**
 * Um schema, uma verdade. Estes schemas validam tanto o payload que entra na
 * API quanto o que o formulário do front envia, para as duas pontas nunca
 * divergirem sobre o que é um dado válido.
 */

export const uuidSchema = z.string().uuid();

/**
 * Protocolo no formato NNNNNN/AAAA, único por organização e ano.
 * O formato é o que o servidor público já reconhece no papel.
 */
export const protocoloSchema = z
  .string()
  .regex(/^\d{6}\/\d{4}$/, "Protocolo deve estar no formato 000123/2026");

export const coordenadaSchema = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
});

/**
 * A coordenada COMO ELA É GRAVADA: sempre em seis casas decimais.
 *
 * O teto existia em dois lugares e nenhum deles era o contrato. O painel
 * arredondava o texto colado (`apps/web/src/paginas/coordenada-colada.ts`) e o
 * esquema da correção de coordenada arredondava a si mesmo. Toda outra porta
 * gravava o que viesse, e o caminho do aparelho é justamente o que devolve os
 * quinze dígitos do `Number`: o GPS do celular entrega `-22.41038299999999`,
 * e a mesma coluna passava a guardar seis casas quando o dado veio do painel e
 * quinze quando veio do morro.
 *
 * A divergência não é estética. Seis casas são cerca de dez centímetros, mais
 * fino do que qualquer GPS de celular acerta debaixo de chuva; os nove dígitos
 * seguintes são resto binário, e imprimi-los num laudo com brasão convida quem
 * lê a confiar em dígito que nunca mediu nada. Duas telas mostrando o mesmo
 * ponto com aparências de precisão diferentes é pior ainda, porque sugere que
 * um dos dois foi medido melhor.
 *
 * Usado em TODA entrada que grava coordenada, e o banco cobra o mesmo teto por
 * CHECK (migração 030): regra que só existe no esquema da aplicação é regra que
 * a próxima rota esquece.
 */
export const coordenadaGravadaSchema = coordenadaSchema.transform((c) => ({
  lat: Number(c.lat.toFixed(CASAS_DE_COORDENADA)),
  lng: Number(c.lng.toFixed(CASAS_DE_COORDENADA)),
}));

export const usuarioSchema = z.object({
  id: uuidSchema,
  organizacaoId: uuidSchema,
  nome: z.string().min(1).max(200),
  matricula: z.string().min(1).max(40),
  email: z.string().email(),
  papel: z.enum(PAPEIS),
  equipeId: uuidSchema.nullable(),
  ativo: z.boolean(),
});

export const equipeSchema = z.object({
  id: uuidSchema,
  organizacaoId: uuidSchema,
  nome: z.string().min(1).max(120),
  especialidade: z.string().max(200).nullable(),
  ativa: z.boolean(),
});

/** Abertura: o que o operador informa quando o chamado entra. */
export const aberturaOcorrenciaSchema = z.object({
  solicitanteNome: z.string().min(1, "Informe o nome do solicitante").max(200),
  solicitanteContato: z.string().max(120).optional(),
  canalEntrada: z.enum(CANAIS_ENTRADA),
  endereco: z.string().min(1, "Informe o endereço").max(400),
  /* Com o teto de seis casas: ver `coordenadaGravadaSchema`. Esta é a porta
     por onde a coordenada nasce, e era a que não tinha teto nenhum. */
  coordenada: coordenadaGravadaSchema.optional(),
  /**
   * Como chegar, em linguagem de quem mora ali.
   *
   * Em área de risco, rua sem placa e numeração que pula são a regra, e
   * ninguém no telefone sabe dizer coordenada. O que a pessoa sabe dizer é
   * a referência, e era isso que estava se perdendo por falta de campo.
   */
  pontoReferencia: z.string().max(300).optional(),
  /*
    A abertura aceita `outro`, e a triagem não. Ver `TIPO_A_CLASSIFICAR`: quem
    atende o telefone não tem competência técnica para separar enxurrada de
    alagamento, e obrigá-lo a escolher um dos oito produz classificação falsa,
    que é pior que a lacuna porque ninguém desconfia de um campo preenchido.
  */
  tipo: z.enum(TIPOS_DE_ENTRADA),
  /**
   * O que foi relatado, quando não cabe na COBRADE.
   *
   * Obrigatório junto com `outro`, e é ele que torna a reclassificação possível:
   * sem esta linha, quem faz a triagem abre um chamado que diz "Outro" e nada
   * mais, e a decisão técnica que a triagem existe para tomar fica sem matéria
   * prima. Dez caracteres é o piso que separa uma descrição de um "x" digitado
   * para o formulário liberar.
   */
  tipoDescricao: z.string().trim().max(300).optional(),
  descricao: z.string().min(1, "Descreva o que foi relatado").max(4000),
  /** Preenchido quando o operador decide vincular a um chamado anterior. */
  vinculadaA: uuidSchema.optional(),
  /**
   * Chave de criação (V2-F02-E07): um UUID que o CLIENTE gera ao abrir o
   * formulário e reaproveita no reenvio. Repetir o pedido com a mesma chave
   * devolve o chamado já criado (mesmo `id` e `protocolo`) em vez de abrir um
   * segundo e queimar outro número do protocolo. Opcional e aditivo: quem não
   * a manda se comporta como antes. Não é segredo nem autoridade, e vale só
   * dentro do município do token.
   */
  chaveDeCriacao: uuidSchema.optional(),
}).refine(
  (v) => v.tipo !== TIPO_A_CLASSIFICAR || (v.tipoDescricao?.trim().length ?? 0) >= 10,
  {
    message: "Descreva em poucas palavras o que foi relatado, para a triagem poder classificar",
    path: ["tipoDescricao"],
  },
);
export type AberturaOcorrencia = z.infer<typeof aberturaOcorrenciaSchema>;

/** Triagem: classificação técnica, feita por quem tem competência para isso. */
export const triagemSchema = z.object({
  severidade: z.enum(SEVERIDADES),
  /**
   * O tipo decidido por quem tem competência para decidir.
   *
   * `TIPOS_COBRADE` e não `TIPOS_DE_ENTRADA`: a triagem só pode mover o chamado
   * PARA dentro da taxonomia, nunca de volta para "outro". Permitir a volta
   * transformaria o portão do despacho numa formalidade, porque bastaria
   * reclassificar para o mesmo lugar de onde se veio.
   *
   * Opcional porque a maioria dos chamados já entra classificada, e reafirmar o
   * tipo em toda triagem seria pedir de novo o que ninguém tem motivo para mudar.
   * Quem obriga a escolha é `precisaReclassificar`, no despacho.
   */
  tipo: z.enum(TIPOS_COBRADE).optional(),
  vulnerabilidadePresente: z.boolean(),
  vulnerabilidadeDescricao: z.string().max(500).optional(),
}).refine(
  (v) => !v.vulnerabilidadePresente || !!v.vulnerabilidadeDescricao?.trim(),
  { message: "Descreva a vulnerabilidade identificada", path: ["vulnerabilidadeDescricao"] },
);
export type Triagem = z.infer<typeof triagemSchema>;

export const despachoSchema = z.object({
  equipeId: uuidSchema,
  prazoHoras: z.number().int().min(1).max(720),
  instrucoes: z.string().max(2000).optional(),
});
export type Despacho = z.infer<typeof despachoSchema>;

export const itemChecklistSchema = z.object({
  chave: z.string().min(1).max(60),
  resposta: z.boolean(),
});

export const evidenciaFotoSchema = z.object({
  /** Chave no storage, sempre prefixada por tenant/{orgId}/. */
  chave: z.string().min(1),
  capturadaEm: z.string().datetime(),
  /* O GPS do aparelho, com o teto de seis casas. Este é o caminho que trazia
     os quinze dígitos para dentro de `evidencias.latitude`. */
  coordenada: coordenadaGravadaSchema.optional(),
  legenda: z.string().max(300).optional(),
});

/**
 * O papel do arquivo dentro da coleta, e por que a perda precisa distingui-los.
 *
 * A assinatura sobe pelo mesmo caminho das fotos, com a mesma idempotência e a
 * mesma retomada, e o envelope a referencia noutro campo. Quando o arquivo que
 * some é o traço da moradora, `assinaturaChave` chega nula e o laudo imprime
 * uma LINHA DE ASSINATURA EM BRANCO, que é indistinguível de uma vistoria em
 * que ninguém assinou. Sem esta marca, a lacuna mais grave do documento seria a
 * única que ele não saberia nomear.
 */
export const PAPEIS_DE_EVIDENCIA = ["foto", "assinatura"] as const;
export type PapelDeEvidencia = (typeof PAPEIS_DE_EVIDENCIA)[number];

/**
 * Um registro que foi CAPTURADO em campo e não pôde ser recuperado do aparelho.
 *
 * ## Por que este campo existe
 *
 * As fotos sobem ANTES do envelope, de propósito: o laudo não pode apontar para
 * arquivo que não existe. A consequência, que é real e não hipotética: se o
 * sistema operacional apagou um arquivo do cache, a leitura dos bytes falha e o
 * ENVELOPE INTEIRO nunca sai. Checklist, GPS, assinatura, observações, órgãos a
 * acionar. Uma manhã de trabalho no morro destruída porque o iOS liberou
 * espaço.
 *
 * A saída não pode ser subir calado sem a foto: um laudo que parece completo e
 * não é, é pior do que um laudo que não sai. Então a coleta sobe, e a perda sobe
 * JUNTO, declarada, e vira linha no laudo e evento na trilha.
 *
 * ## A forma, campo a campo, e o que cada um prova
 *
 * - `idempotencyKey` é a chave que o aparelho cunhou para aquele arquivo na
 *   captura. Ela é o NOME do que se perdeu: sem ela, dois envios da mesma coleta
 *   contariam a mesma perda duas vezes, e nada distinguiria "perdi a foto 2" de
 *   "perdi outra foto". Não é `uuidSchema` porque a assinatura usa
 *   `<chave-da-coleta>-assinatura`, que é a forma que já está gravada em
 *   aparelho hoje: exigir uuid aqui recusaria justamente a perda da assinatura.
 * - `capturadaEm` prova que o registro EXISTIU e quando. É o que permite a quem
 *   lê o laudo daqui a um ano dizer "havia uma fotografia das 09:42 e ela não
 *   está aqui", em vez de supor que o agente não fotografou.
 * - `papel` separa fotografia de assinatura. Ver `PAPEIS_DE_EVIDENCIA`.
 * - `legenda` e `coordenada` são o metadado que SOBREVIVEU ao arquivo: eles
 *   vivem no rascunho e na fila, não no arquivo de imagem. Mandá-los é a
 *   diferença entre o laudo dizer "uma fotografia se perdeu" e dizer "a
 *   fotografia da trinca na parede dos fundos, capturada naquele ponto, se
 *   perdeu". É o que resta da prova, e jogar fora o que restou por ser pouco
 *   seria destruir a única coisa que ainda dá para conferir em campo.
 */
export const evidenciaPerdidaSchema = z.object({
  idempotencyKey: z.string().min(1).max(120),
  capturadaEm: z.string().datetime(),
  papel: z.enum(PAPEIS_DE_EVIDENCIA),
  legenda: z.string().max(300).optional(),
  coordenada: coordenadaGravadaSchema.optional(),
});
export type EvidenciaPerdida = z.infer<typeof evidenciaPerdidaSchema>;

/**
 * Vistoria concluída em campo. `coletadaEm` é a hora do aparelho no momento
 * da coleta; `sincronizadaEm` é quando o servidor recebeu. Os dois diferem
 * sempre que a coleta foi offline, e o laudo precisa mostrar ambos.
 */
/**
 * O checklist precisa ser o checklist, e isto é regra de negócio, não de tela.
 *
 * Antes, `z.array(itemChecklistSchema).min(1)` aceitava qualquer coisa: uma
 * vistoria com `[{ chave: "chave_inventada_pelo_aparelho", resposta: true }]`
 * era gravada com 201, virava a vistoria vigente, e o LAUDO OFICIAL saía com
 * essa linha na tabela e sem nenhum dos itens obrigatórios. Reproduzido pelo
 * QA contra a API de verdade.
 *
 * `CHECKLIST_OBRIGATORIO` existia no pacote compartilhado desde o começo e era
 * usado só pela tela do aplicativo, com o comentário dizendo que "obrigatorio
 * governa o aparelho". Governar o aparelho não é governar nada: o aparelho é
 * exatamente a parte que um cliente adulterado não executa. O `CLAUDE.md` diz
 * isto com todas as letras: se a validação só existe no formulário, ela não
 * existe.
 *
 * Duas regras, e a segunda importa tanto quanto a primeira:
 *
 * 1. Todo item obrigatório tem que estar respondido.
 * 2. Nenhuma chave fora do catálogo entra. Sem isto, o laudo continua sendo um
 *    lugar onde o aparelho escreve texto livre num documento com brasão.
 */
const CHAVES_CONHECIDAS = new Set<string>(CHECKLIST_VISTORIA.map((i) => i.chave));

const checklistSchema = z.array(itemChecklistSchema).min(1)
  .refine(
    (itens) => CHECKLIST_OBRIGATORIO.every((o) => itens.some((i) => i.chave === o.chave)),
    {
      message:
        "A vistoria precisa responder todos os itens obrigatórios do checklist: "
        + CHECKLIST_OBRIGATORIO.map((i) => i.rotulo).join(", ") + ".",
    },
  )
  .refine(
    (itens) => itens.every((i) => CHAVES_CONHECIDAS.has(i.chave)),
    { message: "O checklist tem item que não existe no catálogo da vistoria." },
  );

/**
 * Quantas pessoas, e em que situação.
 *
 * A distinção entre DESALOJADO e DESABRIGADO é a razão de este bloco existir
 * separado de um simples "quantos afetados", e ela não é vocabulário:
 *
 *   Desalojado   saiu de casa e tem para onde ir (parente, vizinho, aluguel).
 *   Desabrigado  saiu de casa e NÃO tem. Depende de abrigo público.
 *
 * Somar os dois num campo só é o erro clássico, e custa exatamente a
 * informação que decide se alguém precisa abrir uma escola às dez da noite.
 *
 * Todos são opcionais, e nenhum tem valor padrão zero. "Não contei" e "contei
 * e deu zero" são coisas diferentes: a primeira é vistoria incompleta, a
 * segunda é casa em que ninguém precisou sair. O laudo imprime as duas de
 * formas distintas.
 */
const contagemDePessoas = z.number().int()
  .min(0, "A contagem não pode ser negativa")
  .max(100000, "Confira o número: parece dedo escorregando no teclado")
  .optional();

/**
 * O objeto de cinco contagens, sem a guarda de `Date`. Fica à parte porque a
 * vistoria espalha a `.shape` dele (mais abaixo), e a `.shape` só existe no
 * objeto, não no esquema com a guarda.
 */
const pessoasAtingidasObjeto = z.object({
  desalojados: contagemDePessoas,
  desabrigados: contagemDePessoas,
  feridos: contagemDePessoas,
  desaparecidos: contagemDePessoas,
  obitos: contagemDePessoas,
});

/**
 * Esquema de OBJETO QUE SÓ TEM CAMPOS OPCIONAIS, com a guarda contra `Date`
 * (DV-37).
 *
 * No Zod 4, um objeto `Date` é um objeto para `z.object`, e como não tem chave
 * nenhuma que importe, passa por um esquema em que tudo é opcional e sai como
 * `{}`. JSON e query string nunca produzem `Date`, então só um chamador em
 * processo o alcança; mesmo assim "uma data passou por contagem de pessoas" é o
 * tipo de erro silencioso que a validação existe para recusar. Com um campo
 * obrigatório a recusa já acontece (falta o campo); o furo é só dos esquemas
 * onde tudo é opcional. O teste `varredura-de-esquemas.test.ts` percorre todos
 * os esquemas exportados e reprova o próximo que aparecer sem a guarda.
 *
 * A guarda é um passo antes do objeto (e não um `refine` depois dele), porque
 * depois do objeto o `Date` já virou `{}` e não há mais o que conferir.
 */
function objetoSoDeOpcionais<T extends z.ZodType>(objeto: T) {
  return z
    .custom<unknown>((valor) => !(valor instanceof Date), {
      message: "Era esperado um objeto, veio uma data",
    })
    .pipe(objeto);
}

export const pessoasAtingidasSchema = objetoSoDeOpcionais(pessoasAtingidasObjeto);
export type PessoasAtingidas = z.infer<typeof pessoasAtingidasSchema>;

/** O rótulo e a explicação de cada contagem, como aparecem na tela e no laudo. */
export const CAMPOS_PESSOAS: ReadonlyArray<{
  chave: keyof PessoasAtingidas;
  rotulo: string;
  ajuda: string;
}> = [
  {
    chave: "desalojados",
    rotulo: "Desalojados",
    ajuda: "Saíram de casa e têm para onde ir: parente, vizinho, aluguel.",
  },
  {
    chave: "desabrigados",
    rotulo: "Desabrigados",
    ajuda: "Saíram de casa e dependem de abrigo público. É este número que "
      + "decide se o município precisa abrir abrigo hoje.",
  },
  { chave: "feridos", rotulo: "Feridos", ajuda: "Precisaram de atendimento de saúde." },
  { chave: "desaparecidos", rotulo: "Desaparecidos", ajuda: "Não localizados até o fim da vistoria." },
  { chave: "obitos", rotulo: "Óbitos", ajuda: "Confirmados no local." },
];

/**
 * Um órgão que a vistoria diz que precisa ser acionado.
 *
 * `orgaoId` nulo NÃO é dado faltando: é o campo livre, e ele existe por uma razão
 * que governa o produto inteiro. O catálogo de órgãos do município desce para o
 * aparelho junto com a lista de tarefas, e um aparelho novo, que nunca
 * sincronizou, tem catálogo vazio. Se o desdobramento dependesse só do catálogo,
 * um item OBRIGATÓRIO do checklist travaria a conclusão da vistoria justamente
 * sem sinal, que é a condição normal de trabalho deste aplicativo. Nenhuma
 * vistoria pode ficar impossível por falta de um cadastro.
 *
 * O nome viaja SEMPRE, inclusive quando o id existe. Parece redundante e não é:
 * o laudo é documento de processo e precisa continuar legível daqui a cinco
 * anos, depois de o órgão ter sido desativado, renomeado ou fundido com outro.
 * Guardar só o id transformaria o laudo antigo numa consulta que pode não achar
 * mais nada.
 */
export const orgaoIndicadoSchema = z.object({
  /** Do catálogo do município. Nulo quando o agente digitou o nome. */
  orgaoId: uuidSchema.nullable(),
  nome: z.string().trim().min(2, "Informe o nome do órgão").max(200),
});
export type OrgaoIndicado = z.infer<typeof orgaoIndicadoSchema>;

/**
 * A precisão da leitura de GPS, em metros: positiva, ou nula quando o aparelho
 * não informou.
 *
 * O `positive()` fica, e não vira `nonnegative()`: erro de posição zero não
 * existe em receptor nenhum, e aceitar 0 deixaria o laudo dizer "precisão de 0
 * metros", que é falso. O defeito de CMP-33 (V2-F00-E15) estava do outro lado:
 * o aplicativo arredondava 0,3 m para 0 e o servidor respondia 422. Quem
 * conserta é o aparelho, com piso de 1 metro (`precisaoDoGpsEmMetros`, no app
 * de campo), e aparelho com versão antiga que mande 0 continua recusado. A
 * frase da recusa sai em português pelo mapa global de `mensagens-do-zod.ts`
 * ("Precisa ser maior que 0"), e é a tela que escreve o rótulo do campo ao lado.
 *
 * Exportado em separado para o aplicativo provar, contra o MESMO esquema, que
 * todo número que ele grava passa.
 */
export const gpsPrecisaoMetrosSchema = z.number().positive().nullable();

export const vistoriaSchema = z.object({
  checklist: checklistSchema,
  /*
    O desdobramento de "Necessário acionar outro órgão", achatado na vistoria e
    OPCIONAL, pelo mesmo motivo das contagens de pessoas logo abaixo: o envelope
    já está em uso por aparelho em campo. Um aparelho que ainda não atualizou
    simplesmente não manda a lista, e o servidor grava "não especificado".

    Exigir aqui a lista quando a resposta é "sim" pareceria mais rigoroso e seria
    destrutivo: a coleta antiga que já está guardada no morro voltaria com 422, a
    fila a marcaria como falha permanente, e não existe tela para corrigir item
    bloqueado. O agente perderia a manhã de trabalho por causa de um campo que o
    aplicativo dele nem sabia que existia. Quem exige a lista é o aparelho
    atualizado, em `faltaParaConcluir`, antes de a coleta virar envelope.

    O teto de vinte não é generosidade: é o que impede um cliente adulterado de
    escrever vinte mil linhas dentro de um documento com brasão.
  */
  orgaosParaAcionar: z.array(orgaoIndicadoSchema).max(20).optional(),
  fotos: z.array(evidenciaFotoSchema),
  /*
    O que foi capturado no local e não pôde subir. Ver `evidenciaPerdidaSchema`
    para o desenho inteiro.

    OPCIONAL, pela mesma razão de `orgaosParaAcionar` e `coletadaPor`: há
    aparelho em campo com coleta gravada antes deste campo existir, e um campo
    obrigatório transformaria essa coleta em 422 permanente, que é a forma de
    destruição que este campo existe para impedir. Ausente e vazio querem dizer
    a mesma coisa: nada se perdeu.

    O teto de vinte é o mesmo argumento de `orgaosParaAcionar`, e aqui ele pesa
    mais: cada linha desta lista vira uma frase de perda num documento com
    brasão, e um cliente adulterado poderia encher o laudo de uma família com
    vinte mil declarações de prova ausente.
  */
  evidenciasPerdidas: z.array(evidenciaPerdidaSchema).max(20).optional(),
  /*
    ONDE O AGENTE REALMENTE ESTEVE, e ela não viajava.

    O aparelho captura este ponto e guardava só para si: do envelope subia
    apenas `gpsPrecisaoMetros`, ou seja, a QUALIDADE de uma medida cujo VALOR
    ficava no celular. A coordenada ia junto de cada foto, como metadado de
    imagem, e nunca como dado da vistoria.

    Isso importa porque o alfinete que o operador colou com o telefone no ombro
    e o ponto onde o imóvel está divergem o tempo todo, e o agente é a fonte
    mais confiável dessa informação e era o único que não conseguia reportá-la.

    OPCIONAL, e nunca obrigatória: vistoria em vão de morro com o céu tapado
    fica sem leitura de GPS, e exigir o ponto faria a coleta ser recusada
    exatamente onde ela é mais difícil de refazer.

    O QUE O SERVIDOR FAZ COM ELA está decidido em `rotas/sincronizacao.ts`, e a
    decisão é estreita de propósito: ela é gravada como dado DA VISTORIA e não
    corrige a coordenada da ocorrência. Corrigir é outro ato, com motivo escrito
    e evento próprio (`correcaoDeCoordenadaSchema`).
  */
  coordenada: coordenadaGravadaSchema.optional(),
  gpsPrecisaoMetros: gpsPrecisaoMetrosSchema,
  assinanteNome: z.string().min(1, "Informe quem assinou").max(200),
  /** Traço da assinatura, como chave de storage. */
  assinaturaChave: z.string().min(1).nullable(),
  coletadaEm: z.string().datetime(),
  observacoes: z.string().max(4000).optional(),
  /*
    Achatado dentro da vistoria, e não aninhado num objeto `pessoas`.

    O envelope de sincronização já está em uso por aparelho em campo, e um
    campo novo OPCIONAL no mesmo nível é compatível com o que já existe: um
    aplicativo antigo simplesmente não manda, e o servidor grava nulo, que é
    exatamente o significado de "não contei". Aninhar exigiria o objeto
    existir, e a fila do aparelho antigo passaria a receber 422 numa coleta
    que já está guardada no morro.
  */
  ...pessoasAtingidasObjeto.shape,
}).superRefine((v, ctx) => {
  /*
    A incoerência que o servidor recusa, e só ela.

    Uma coleta que responde "não é necessário acionar outro órgão" e ainda assim
    lista três órgãos é uma contradição dentro do mesmo documento, e o laudo
    imprimiria as duas metades: o checklist dizendo que não e a seção seguinte
    nomeando quem acionar. Nenhum aplicativo publicado produz isso (a lista só é
    preenchida depois do "sim", e responder "não" limpa o que havia), então
    recusar aqui não alcança nenhuma coleta legítima que esteja guardada em
    aparelho nenhum: alcança só cliente adulterado, que é exatamente o que uma
    validação de servidor existe para alcançar.

    O caminho contrário ("sim" sem lista) NÃO é recusado, e a razão está no
    comentário de `orgaosParaAcionar`: recusar ali destruiria coleta boa de
    aparelho antigo.
  */
  const respondeuSim = v.checklist.some(
    (i) => i.chave === CHAVE_ACIONAR_ORGAO && i.resposta,
  );
  if (!respondeuSim && (v.orgaosParaAcionar?.length ?? 0) > 0) {
    ctx.addIssue({
      code: "custom",
      path: ["orgaosParaAcionar"],
      message:
        "A vistoria lista órgãos a acionar, mas o checklist respondeu que não é "
        + "necessário acionar outro órgão.",
    });
  }
});
export type Vistoria = z.infer<typeof vistoriaSchema>;

export const providenciaSchema = z.object({
  orgaoDestino: z.string().min(1, "Informe o órgão de destino").max(200),
  descricao: z.string().min(1, "Descreva a providência").max(2000),
  responsavel: z.string().min(1, "Informe o responsável").max(200),
  prazoHoras: z.number().int().min(1).max(2160),
});
export type Providencia = z.infer<typeof providenciaSchema>;

export const DESFECHOS_PROVIDENCIA = [
  "atendida",
  "atendida_parcialmente",
  "recusada",
] as const;
export type DesfechoProvidencia = (typeof DESFECHOS_PROVIDENCIA)[number];

export const ROTULO_DESFECHO: Record<DesfechoProvidencia, string> = {
  atendida: "Atendida",
  atendida_parcialmente: "Atendida parcialmente",
  recusada: "Recusada",
};

/**
 * Resposta do órgão a uma providência.
 *
 * O desfecho é uma lista fechada porque "resolvido" escrito de dez jeitos
 * diferentes não vira indicador nenhum, e é indicador do tipo "quantas
 * providências a Secretaria de Obras atendeu no semestre" que sustenta uma
 * conversa com o prefeito.
 */
export const respostaProvidenciaSchema = z.object({
  desfecho: z.enum(DESFECHOS_PROVIDENCIA),
  resposta: z.string().min(1, "Descreva o que o órgão respondeu").max(2000),
  respondidaPor: z.string().min(1, "Informe quem respondeu").max(200),
});
export type RespostaProvidencia = z.infer<typeof respostaProvidenciaSchema>;

export const encerramentoSchema = z.object({
  motivo: z.string().min(1, "O motivo do encerramento é obrigatório").max(2000),
});
export type Encerramento = z.infer<typeof encerramentoSchema>;

/**
 * Levantar a interdição de um imóvel.
 *
 * O motivo é obrigatório e sai impresso no termo de desinterdição. Ele não é
 * burocracia: é o que responde, anos depois, por que uma família foi
 * autorizada a voltar para uma casa que o município tinha declarado insegura.
 * "Contenção executada e vistoriada" e "o morador insistiu" são respostas
 * muito diferentes, e a segunda precisa ficar escrita se for a verdadeira.
 *
 * O mínimo é maior que o de encerramento de propósito. Encerrar admite
 * "improcedente"; liberar imóvel interditado não admite uma palavra só.
 */
export const desinterdicaoSchema = z.object({
  motivo: z.string()
    .min(15, "Descreva o que mudou no imóvel para justificar o levantamento")
    .max(2000),
});
export type Desinterdicao = z.infer<typeof desinterdicaoSchema>;

/**
 * Corrigir a coordenada de uma ocorrência que ainda está aberta.
 *
 * O ALFINETE CAI NO LUGAR ERRADO O TEMPO TODO, e até aqui não havia como
 * corrigir. O operador cola a localização com o telefone no ombro, o endereço
 * é ditado por alguém apavorado, a geocodificação erra a quadra, ou a
 * ocorrência nasce sem coordenada nenhuma e o ponto certo só aparece depois.
 * Sem esta correção, a única saída era abrir OUTRO protocolo para o mesmo
 * evento, e aí o município passa a ter duas ocorrências onde existe uma casa.
 *
 * Duas regras moram aqui, e não no formulário, porque regra que só existe na
 * tela não existe:
 *
 * 1. **A faixa.** Latitude fora de [-90, 90] e longitude fora de [-180, 180]
 *    não são pontos: são erro de digitação, e o banco aceitaria os dois em
 *    silêncio, porque `double precision` não sabe o que é um meridiano.
 * 2. **O TETO DE SEIS CASAS**, aplicado na entrada e não na saída. O painel já
 *    arredondava o que lia do campo colado, mas essa era a única porta com
 *    teto: quinze casas entravam por qualquer outra e a mesma coluna passava a
 *    guardar duas precisões diferentes para o mesmo tipo de dado.
 *
 * O MOTIVO é obrigatório, e o mínimo é o mesmo do levantamento de interdição,
 * pela mesma razão: ele é a resposta, meses depois, à pergunta "por que o
 * laudo impresso diz um ponto e o sistema diz outro?". "erro" não responde
 * nada; "o agente conferiu no local, era a quadra de baixo" responde.
 */
export const coordenadaCorrigidaSchema = coordenadaGravadaSchema;

export const correcaoDeCoordenadaSchema = z.object({
  coordenada: coordenadaCorrigidaSchema,
  motivo: z.string()
    .trim()
    .min(15, "Escreva de onde veio o ponto certo, para quem ler daqui a um ano")
    .max(2000),
});
export type CorrecaoDeCoordenada = z.infer<typeof correcaoDeCoordenadaSchema>;

export const ocorrenciaSchema = z.object({
  id: uuidSchema,
  organizacaoId: uuidSchema,
  protocolo: protocoloSchema,
  /*
    `TIPOS_DE_ENTRADA` e não `TIPOS_COBRADE`, e a diferença é o defeito que
    esta linha carregava.

    Este esquema descreve uma ocorrência COMO ELA ESTÁ NO BANCO, e a abertura
    aceita "outro" desde que existe `TIPO_A_CLASSIFICAR`. Enquanto aqui só
    coubessem os oito da COBRADE, o tipo declarado dizia que "outro" nunca
    chega, e qualquer código que confiasse nele estaria confiando numa promessa
    que a rota de abertura não faz. O portão do despacho impede "outro" de
    seguir adiante; ele não impede que exista.
  */
  tipo: z.enum(TIPOS_DE_ENTRADA),
  /** Preenchido enquanto o tipo for "outro", e só enquanto for. */
  tipoDescricao: z.string().nullable(),
  status: z.enum(STATUS_OCORRENCIA),
  severidade: z.enum(SEVERIDADES).nullable(),
  vulnerabilidadePresente: z.boolean(),
  vulnerabilidadeDescricao: z.string().nullable(),
  endereco: z.string(),
  coordenada: coordenadaSchema.nullable(),
  solicitanteNome: z.string(),
  descricao: z.string(),
  equipeId: uuidSchema.nullable(),
  prazoEm: z.string().datetime().nullable(),
  criadoEm: z.string().datetime(),
  encerradoEm: z.string().datetime().nullable(),
  motivoEncerramento: z.string().nullable(),
});
export type Ocorrencia = z.infer<typeof ocorrenciaSchema>;

/**
 * Evento da trilha auditável. Responde "quem fez o quê, quando e de onde".
 * Nunca é editado nem apagado: correção entra como evento novo.
 */
export const eventoTrilhaSchema = z.object({
  id: uuidSchema,
  organizacaoId: uuidSchema,
  ocorrenciaId: uuidSchema,
  tipo: z.string().min(1).max(60),
  autorId: uuidSchema.nullable(),
  autorNome: z.string(),
  autorPapel: z.enum(PAPEIS),
  origem: z.enum(ORIGENS),
  ocorridoEm: z.string().datetime(),
  registradoEm: z.string().datetime(),
  detalhe: z.record(z.string(), z.unknown()).nullable(),
});
export type EventoTrilha = z.infer<typeof eventoTrilhaSchema>;

/**
 * Envelope de sincronização vindo do app de campo.
 *
 * `idempotencyKey` é gerada no aparelho e é o que impede duplicação quando o
 * agente reenvia a mesma coleta depois de uma falha de rede: o servidor
 * reconhece a chave e devolve o resultado anterior em vez de aplicar de novo.
 */
export const envelopeSincronizacaoSchema = z.object({
  idempotencyKey: uuidSchema,
  ocorrenciaId: uuidSchema,
  coletadaEm: z.string().datetime(),
  /**
   * Quem coletou, dito pelo aparelho e CONFERIDO pelo servidor contra o dono
   * do token verificado.
   *
   * O defeito que este campo fecha é do aparelho de plantão compartilhado
   * entre turnos. A agente da manhã coleta no morro sem sinal, lê a minuta em
   * voz alta COM O NOME DELA e a moradora assina no dedo. Ela sai da conta, e o
   * aplicativo promete (com razão) que as coletas continuam guardadas no
   * aparelho. Às 19:00 o agente da noite entra, a fila drena, e como o envelope
   * não dizia autor nenhum o servidor tirava o `agente_id` de quem apresentou o
   * token: o laudo e a trilha passavam a atribuir a vistoria a um servidor que
   * nunca esteve no local, contra a minuta lida em voz alta. A trilha é
   * append-only, então o autor errado nunca é corrigido, só comentado.
   *
   * O aplicativo já se recusa a enviar coleta que não é de quem está logado
   * (`packages/campo/src/fila.ts`), e isso é portão de cliente: binário
   * adulterado ou defeito futuro naquele filtro produz o mesmo laudo falso.
   * Quem decide é o servidor, em `rotas/sincronizacao.ts`.
   *
   * OPCIONAL, e a escolha é o assunto principal deste comentário. Existem
   * aparelhos com coleta gravada por versão anterior a este campo, guardada com
   * `autor: null` (o próprio `deposito.ts` normaliza assim), e não existe tela
   * para corrigir item que o servidor bloqueou. Nascendo obrigatório, essas
   * coletas passariam a receber 422 do Zod PARA SEMPRE, e uma vistoria de morro
   * seria destruída por uma mudança de esquema. Então: ausente entra como
   * entrava (o autor vira o dono do token, como antes); presente e divergente é
   * recusado.
   *
   * QUANDO ELE PODE VIRAR OBRIGATÓRIO: quando não restar aparelho em campo com
   * coleta anterior a esta versão. O sinal de que isso aconteceu é o mesmo do
   * verbo `assumir` (ver `apps/campo/PENDENCIAS.md`, item 5): no dia em que o
   * cartão "Sem autor registrado" puder ser removido do aplicativo, este campo
   * pode virar obrigatório, e o caminho de compatibilidade abaixo sai junto.
   * Não antes, e nunca por conta de um turno que só olhou o esquema.
   */
  coletadaPor: uuidSchema.optional(),
  vistoria: vistoriaSchema,
});
export type EnvelopeSincronizacao = z.infer<typeof envelopeSincronizacaoSchema>;

/**
 * Por que o agente devolveu a tarefa sem vistoriar.
 *
 * Lista fechada com escape, e as duas metades têm razão de ser. Fechada porque
 * quem digita está na rua, muitas vezes de capa de chuva, e uma tela que exige
 * redação produz "n/a" e "nao deu". Com escape porque a realidade não cabe em
 * cinco linhas, e a coordenação precisa entender o caso para decidir o que
 * fazer com ele.
 *
 * Cada motivo leva a uma ação DIFERENTE da coordenação, e é por isso que eles
 * não podem virar um campo de texto só: endereço não localizado pede correção
 * de coordenada (que agora existe), morador ausente pede reagendamento, e
 * risco de acesso pede apoio de outro órgão.
 */
export const MOTIVOS_DE_DEVOLUCAO = [
  "endereco_nao_localizado",
  "morador_ausente",
  "acesso_impedido",
  "risco_para_a_equipe",
  "fora_da_area_da_equipe",
  "outro",
] as const;
export type MotivoDeDevolucao = (typeof MOTIVOS_DE_DEVOLUCAO)[number];

export const ROTULO_MOTIVO_DE_DEVOLUCAO: Record<MotivoDeDevolucao, string> = {
  endereco_nao_localizado: "Não localizei o endereço",
  morador_ausente: "Não havia ninguém no local",
  acesso_impedido: "Não consegui acesso ao imóvel",
  risco_para_a_equipe: "Risco para a equipe no local",
  fora_da_area_da_equipe: "Não é área desta equipe",
  outro: "Outro motivo",
};

/**
 * Devolver para a coordenação uma tarefa VENCIDA que não foi vistoriada.
 *
 * ## O que este ato é, e o que ele não é
 *
 * Ele tira a tarefa da lista do agente e devolve a ocorrência para a
 * coordenação, com nome, hora e motivo na trilha. **Não encerra a ocorrência e
 * não apaga nada**: a casa continua precisando de vistoria, e quem decide o que
 * fazer com ela volta a ser quem despacha.
 *
 * O verbo na tela é "devolver" e não "descartar", e a diferença importa. A
 * palavra que o agente lê tem que descrever o que acontece: "descartar" faria
 * ele acreditar que a ocorrência some, e ele usaria o botão pensando estar
 * limpando lixo, quando está pedindo que outra pessoa assuma. Do lado da
 * coordenação o efeito é o mesmo que o Rafa pediu, e do lado de quem aperta é a
 * verdade.
 *
 * ## Por que só depois de vencida, e por que o relógio é o do servidor
 *
 * Sem a trava do prazo, um dia ruim vira uma lista limpa: o agente devolve tudo
 * às oito da manhã e a coordenação descobre ao meio-dia. Vencida é o ponto em
 * que o produto já falhou e a informação de que ninguém foi lá vale mais do que
 * a tarefa continuar parada.
 *
 * **O critério é o relógio do SERVIDOR.** Relógio de aparelho é ajustável, erra
 * sozinho e atravessa fuso, e este produto já decidiu isso uma vez (ver a nota
 * do T2 sobre aceitar coleta tardia). O aparelho manda o instante em que o dedo
 * tocou, para a trilha, e o servidor confere `prazo_em` contra o relógio dele.
 */
export const devolucaoDeTarefaSchema = z.object({
  /** Gerada no aparelho, pelo mesmo motivo do envelope de vistoria. */
  idempotencyKey: uuidSchema,
  ocorrenciaId: uuidSchema,
  /** Quando o dedo tocou, no aparelho. Vai para a trilha, e NÃO decide nada. */
  decididaEm: z.string().datetime(),
  /**
   * Quem devolveu, conferido pelo servidor contra o dono do token, pelo mesmo
   * motivo de `coletadaPor`: portão de cliente não é controle de acesso.
   *
   * Obrigatório aqui, e opcional lá, porque este campo nasce hoje: não existe
   * aparelho em campo com devolução gravada sem autor, então não há coleta
   * antiga para destruir com um 422 permanente.
   */
  devolvidaPor: uuidSchema,
  motivo: z.enum(MOTIVOS_DE_DEVOLUCAO),
  /**
   * Obrigatório quando o motivo é "outro", porque "outro" sozinho não responde
   * nada para quem vai decidir o que fazer com a ocorrência. Nos demais casos é
   * opcional: o motivo já diz o essencial, e exigir redação de quem está na
   * chuva produz "n/a".
   */
  observacao: z.string().trim().max(500).optional(),
}).refine(
  (d) => d.motivo !== "outro" || (d.observacao ?? "").length >= 10,
  { message: "Com o motivo 'outro', escreva o que aconteceu", path: ["observacao"] },
);
export type DevolucaoDeTarefa = z.infer<typeof devolucaoDeTarefaSchema>;

/* ==========================================================================
   Saída a campo: quem subiu o morro, e quem não desceu
   ========================================================================== */

/**
 * ## O que esta parte do vocabulário promete, e o que ela recusa prometer
 *
 * `MOTIVOS_DE_DEVOLUCAO` já tem `risco_para_a_equipe`, ou seja: este produto
 * reconhece por escrito, desde a migração 028, que o agente entra em lugar que
 * oferece risco à integridade física dele. E não havia nada para o caso de ele
 * ter entrado.
 *
 * O que existe aqui é a versão mínima que é HONESTA, e a honestidade é o
 * requisito, não um enfeite: um botão de apoio que aciona alguém que não
 * existe é pior do que botão nenhum, porque cria expectativa de socorro. Este
 * produto não tem central de monitoramento 24 horas, não tem contrato com
 * serviço de emergência, não detecta queda e não faz aparelho sem sinal falar.
 *
 * Então ele promete só isto: o agente declara, ANTES de subir e COM SINAL,
 * para onde vai e em quanto tempo pretende voltar; o relógio que conta é o do
 * servidor; se o retorno não for confirmado no prazo, o fato aparece na tela
 * de quem coordena e no sino; e o que a coordenação fez a respeito entra na
 * trilha.
 *
 * O que ele NÃO promete está escrito por extenso em `db/migrations/031` e em
 * `docs/GUIA-DO-COORDENADOR.md`, e a frase que resume: **"prazo estourado" não
 * quer dizer "em perigo", quer dizer que ninguém teve notícia dele desde o
 * prazo.**
 *
 * ## A assimetria que decide o desenho
 *
 * O aparelho sem sinal não consegue pedir socorro, e nenhum software muda
 * isso. Por isso a parte que funciona de verdade é a que acontece ANTES, na
 * base, com sinal. A declaração não entra na fila de sincronização: declaração
 * guardada no aparelho é declaração que ninguém recebeu, e ela daria ao agente
 * a sensação de estar coberto exatamente quando ele não está.
 */

/**
 * Quanto tempo uma saída pode durar, em minutos.
 *
 * O piso existe porque abaixo de quinze minutos o aviso chegaria antes de ele
 * terminar de estacionar, e alarme falso repetido é o único jeito conhecido de
 * matar este recurso de vez: a coordenação aprende a ignorar a tela.
 *
 * O teto é um turno de trabalho. Número maior que isso é dedo escorregando na
 * tela, não jornada, e uma saída de dois dias em aberto não informa nada a
 * ninguém.
 *
 * Os mesmos dois números estão no CHECK da migração 031, e é o banco que manda:
 * aqui eles existem para a tela recusar antes de ir ao servidor.
 */
export const DURACAO_MINIMA_DE_SAIDA_MINUTOS = 15;
export const DURACAO_MAXIMA_DE_SAIDA_MINUTOS = 480;

const duracaoDeSaidaSchema = z.coerce.number()
  .int("Informe os minutos em número inteiro")
  .min(DURACAO_MINIMA_DE_SAIDA_MINUTOS, "O mínimo é quinze minutos")
  .max(DURACAO_MAXIMA_DE_SAIDA_MINUTOS, "O máximo é oito horas, que é um turno");

/**
 * Declarar que está indo a campo.
 *
 * `retornoPrevistoEm` NÃO está aqui, e a ausência é a decisão: quem calcula o
 * prazo é o servidor, somando a duração ao relógio DELE. Relógio de aparelho é
 * ajustável, erra sozinho e atravessa fuso, e este produto já decidiu isso três
 * vezes (coleta tardia, devolução vencida, prazo de atendimento). Aqui o custo
 * de errar é de outra ordem: um relógio adiantado em duas horas faria o alerta
 * de um agente que não desceu sair duas horas depois do que deveria.
 */
export const saidaACampoSchema = z.object({
  /**
   * Gerada no aparelho, pelo mesmo motivo do envelope de vistoria: o pedido
   * vai, o servidor grava, a resposta se perde no sinal ruim da base, e o
   * aparelho repete. Sem a chave, o agente ficaria com duas saídas abertas e a
   * coordenação com duas linhas para a mesma ida.
   */
  idempotencyKey: uuidSchema,
  ocorrenciaId: uuidSchema,
  /**
   * Quem saiu, conferido pelo servidor contra o dono do token, pelo mesmo
   * motivo de `devolvidaPor`: o aparelho de plantão é compartilhado entre
   * turnos e portão de cliente não é controle de acesso. Aqui o erro é pior que
   * um laudo com autor trocado: a coordenação procuraria a pessoa errada.
   *
   * Obrigatório desde o primeiro dia, como na devolução: este campo nasce hoje
   * e não existe aparelho em campo com saída gravada sem autor.
   */
  agenteId: uuidSchema,
  duracaoMinutos: duracaoDeSaidaSchema,
  /**
   * Trabalhar sozinho é a categoria inteira de risco de que isto trata, e é o
   * que muda a leitura de quem coordena: uma saída vencida de quem foi
   * acompanhado é um aborrecimento, e uma de quem foi sozinho é a situação que
   * justifica largar o que se está fazendo.
   *
   * Sem valor padrão de propósito. Um padrão `false` faria o produto afirmar,
   * em nome do agente, que ele estava acompanhado, que é a resposta que dá
   * menos trabalho a todo mundo e a que ninguém deveria dar por ele.
   */
  sozinho: z.boolean(),
  /** Quando o dedo tocou, no aparelho. Vai para a trilha, e NÃO decide nada. */
  declaradaEm: z.string().datetime(),
});
export type SaidaACampo = z.infer<typeof saidaACampoSchema>;

/**
 * Empurrar o prazo de uma saída que já está aberta.
 *
 * Isto precisa existir, senão todo serviço que demora mais que o previsto vira
 * alarme falso. E precisa ser um ato explícito e contado, senão prorrogar vira
 * o jeito silencioso de manter uma saída aberta para sempre.
 */
export const prorrogacaoDeSaidaSchema = z.object({
  idempotencyKey: uuidSchema,
  saidaId: uuidSchema,
  /**
   * Quantos minutos A MAIS, contados a partir de AGORA no servidor (`now()`); o prazo
   * novo nunca fica abaixo do corrente (`GREATEST`, ver `rotas/saida-a-campo.ts`).
   */
  minutosAdicionais: duracaoDeSaidaSchema,
  pedidaEm: z.string().datetime(),
});
export type ProrrogacaoDeSaida = z.infer<typeof prorrogacaoDeSaidaSchema>;

/** Confirmar o retorno. Exige sinal, pela mesma razão que declarar exige. */
export const retornoDeCampoSchema = z.object({
  idempotencyKey: uuidSchema,
  saidaId: uuidSchema,
  confirmadoEm: z.string().datetime(),
});
export type RetornoDeCampo = z.infer<typeof retornoDeCampoSchema>;

/**
 * Como uma saída termina.
 *
 * Lista fechada porque cada desfecho descreve um ATO diferente, de uma pessoa
 * diferente, e porque a pergunta que alguém vai fazer depois de um acidente é
 * "o que a coordenação fez", que não sai de campo de texto.
 *
 * `retorno_confirmado` é o único que o agente escreve, e ele não aparece na
 * lista da coordenação: ver `DESFECHOS_DA_COORDENACAO`.
 */
export const DESFECHOS_DE_SAIDA = [
  "retorno_confirmado",
  "contato_estabelecido",
  "retorno_a_base",
  "apoio_acionado",
  "registro_indevido",
] as const;
export type DesfechoDeSaida = (typeof DESFECHOS_DE_SAIDA)[number];

export const ROTULO_DESFECHO_DE_SAIDA: Record<DesfechoDeSaida, string> = {
  retorno_confirmado: "O agente confirmou o retorno",
  contato_estabelecido: "Falei com a pessoa, está bem",
  retorno_a_base: "Voltou à base e não confirmou no aplicativo",
  apoio_acionado: "Acionei apoio",
  registro_indevido: "A saída foi declarada por engano",
};

/**
 * Os desfechos que a COORDENAÇÃO pode escolher.
 *
 * `retorno_confirmado` fica de fora, e a ausência é a regra: quem diz "voltei"
 * é quem voltou. Se a coordenação pudesse marcar isso, a linha passaria a
 * afirmar que o agente confirmou o retorno quando na verdade foi outra pessoa
 * que decidiu por ele, e essa é exatamente a linha que alguém vai ler depois de
 * um acidente. Quando a coordenação sabe que ele voltou, o desfecho honesto é
 * `retorno_a_base` ou `contato_estabelecido`, que dizem quem soube e como.
 */
export const DESFECHOS_DA_COORDENACAO = DESFECHOS_DE_SAIDA
  .filter((d): d is Exclude<DesfechoDeSaida, "retorno_confirmado"> =>
    d !== "retorno_confirmado");

export const encerramentoDeSaidaSchema = z.object({
  saidaId: uuidSchema,
  desfecho: z.enum(
    DESFECHOS_DA_COORDENACAO as unknown as [DesfechoDeSaida, ...DesfechoDeSaida[]],
  ),
  /**
   * O que foi feito, e NUNCA dado do morador.
   *
   * O teto é curto de propósito, e a razão está por extenso na migração 031:
   * o sujeito desta frase é agente público no exercício da função, e é isso que
   * mantém esta coluna fora do alcance da minimização por prazo. Se ela virar
   * o lugar onde se conta a história da família, aquela decisão deixa de valer.
   */
  observacao: z.string().trim().max(300).optional(),
}).refine(
  (e) => e.desfecho !== "apoio_acionado" || (e.observacao ?? "").length >= 3,
  {
    /*
      "Acionei apoio" sem dizer qual apoio é a frase que não ajuda ninguém seis
      meses depois, e é justamente a linha que uma apuração vai procurar. O
      banco também recusa, por CHECK: aqui a recusa existe para a tela apontar
      o campo certo em vez de devolver erro de restrição.
    */
    message: "Diga o que foi acionado (quem, e a que horas)",
    path: ["observacao"],
  },
);
export type EncerramentoDeSaida = z.infer<typeof encerramentoDeSaidaSchema>;

/* ==========================================================================
   Cadastro de usuário e de equipe
   ========================================================================== */

/**
 * Senha segundo o ASVS 4.0 (2.1.1 a 2.1.9): mínimo de doze caracteres, teto
 * alto o bastante para não atrapalhar gerenciador de senha, e nenhuma
 * exigência de composição, que só produz "Senha@123".
 */
export const senhaSchema = z.string()
  .min(12, "A senha precisa de pelo menos 12 caracteres")
  .max(200, "Senha longa demais");

/**
 * O cadastro de usuário mora aqui, e não dentro da rota, porque a mesma regra
 * precisa valer nos dois lados.
 *
 * Antes existiam duas versões: a da API, completa, e uma reimplementação mais
 * fraca no formulário, que não conferia formato de email nem tamanho máximo. O
 * resultado era o usuário descobrir no servidor um erro que a tela poderia ter
 * apontado no campo certo. Uma regra, um lugar.
 */
export const cadastroUsuarioSchema = z.object({
  nome: z.string().trim().min(1, "Informe o nome").max(200, "Nome longo demais"),
  matricula: z.string().trim().min(1, "Informe a matrícula").max(40, "Matrícula longa demais"),
  email: z.string().trim().toLowerCase()
    .min(1, "Informe o email")
    .email("Informe um email válido")
    .max(320, "Email longo demais"),
  papel: z.enum(PAPEIS),
  equipeId: uuidSchema.nullish(),
  senha: senhaSchema,
});
export type CadastroUsuario = z.infer<typeof cadastroUsuarioSchema>;

/**
 * Edição de usuário já cadastrado. Sem senha: trocar senha é outro ato, com
 * outras consequências (derruba sessões), e misturar os dois num formulário só
 * faz alguém trocar senha sem querer.
 */
export const edicaoUsuarioSchema = cadastroUsuarioSchema.omit({ senha: true });
export type EdicaoUsuario = z.infer<typeof edicaoUsuarioSchema>;

export const cadastroEquipeSchema = z.object({
  nome: z.string().trim().min(1, "Informe o nome da equipe").max(120, "Nome longo demais"),
  especialidade: z.string().trim().max(200, "Especialidade longa demais").nullish(),
  ativa: z.boolean().default(true),
});
export type CadastroEquipe = z.infer<typeof cadastroEquipeSchema>;

/**
 * O formulário público de interesse.
 *
 * Pede o mínimo, e o mínimo é decisão e não preguiça: quem preenche isto ainda
 * não é cliente, e cada campo a mais é dado pessoal guardado antes de existir
 * contrato, base legal ou prazo de retenção acordado.
 *
 * Nada de CPF, nada de dado de cidadão, nada de anexo.
 */
export const interesseMunicipioSchema = z.object({
  nome: z.string().trim().min(2, "Informe o seu nome").max(200),
  cargo: z.string().trim().max(200).optional(),
  email: z.string().trim().email("Informe um email válido").max(200),
  telefone: z.string().trim().max(40).optional(),

  municipio: z.string().trim().min(2, "Informe o município").max(200),
  uf: z.string().trim().length(2, "UF com duas letras").regex(/^[A-Za-z]{2}$/, "UF inválida"),
  orgao: z.string().trim().max(200).optional(),

  faixaPopulacao: z.enum([
    "ate_50_mil", "de_50_a_200_mil", "acima_de_200_mil", "nao_sei",
  ]).optional(),
  quantosAgentes: z.coerce.number().int().min(0).max(999).optional(),

  mensagem: z.string().trim().max(2000).optional(),

  /** De onde veio o pedido, para saber o que funciona. Preenchido pela tela. */
  origem: z.string().trim().max(100).optional(),
});
export type InteresseMunicipio = z.infer<typeof interesseMunicipioSchema>;

export const ROTULO_FAIXA_POPULACAO: Record<string, string> = {
  ate_50_mil: "até 50 mil habitantes",
  de_50_a_200_mil: "de 50 a 200 mil habitantes",
  acima_de_200_mil: "acima de 200 mil habitantes",
  nao_sei: "não sei dizer",
};
