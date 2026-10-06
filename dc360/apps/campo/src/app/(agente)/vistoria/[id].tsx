import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import {
  Animated, Easing, Image, ScrollView, TextInput, View,
} from "react-native";
import { router, useFocusEffect, useLocalSearchParams, useNavigation } from "expo-router";
import * as Location from "expo-location";
import * as Crypto from "expo-crypto";
import { CameraView, useCameraPermissions } from "expo-camera";
import {
  CAMPOS_PESSOAS, CHAVE_ACIONAR_ORGAO, CHECKLIST_OBRIGATORIO, CHECKLIST_VISTORIA,
  ROTULO_MOTIVO_DE_DEVOLUCAO, ROTULO_TIPO_COBRADE,
  montarMinuta, rotuloDoCampo,
  type EnvelopeSincronizacao, type MotivoDeDevolucao, type PessoasAtingidas,
} from "@dc360/shared";
import type { CampoRecusado, ColetaLocal, FotoLocal } from "@dc360/campo";
import { enderecoDaApi, type OrgaoDoCatalogo, type Pendencia } from "../../../dados/api";
import {
  comoContarAFalha, ehFimDeLinha, motivoDaFalha, type MotivoDaFalha,
} from "../../../dados/falha-de-atualizacao";
import {
  atualizarPendencias, orgaosGuardados, pendenciaGuardada,
} from "../../../dados/pendencias";
import { arquivarColeta, coletaDe, marcarColetada } from "../../../dados/coletas";
import {
  apagarFotoDoAparelho, guardarFotoNoAparelho, medirArquivoNoAparelho,
} from "../../../dados/evidencia-no-disco";
import { obterFila } from "../../../dados/fila";
import {
  buscarHistoricoDaCasa, historicoTemConteudo, type HistoricoDaCasa,
} from "../../../dados/historico-da-casa";
import {
  PRECISAO_MINIMA_M, abrirNoMapa, coordenadaEmTexto, copiarCoordenada, distanciaEmMetros,
  distanciaEmTexto, type Ponto,
} from "../../../dados/mapa";
import {
  descartarRascunho, lerRascunho, rascunhoNovo, salvarRascunho, type Rascunho,
} from "../../../dados/rascunho";
import { useSessao } from "../../../dados/sessao";
import { useSinal } from "../../../dados/conectividade";
import { Assinatura } from "../../../ui/Assinatura";
import { MinutaDoLaudo } from "../../../ui/MinutaDoLaudo";
import {
  Aviso, Botao, Cartao, Carregando, Dado, LinhaDeAcoes, Separador, Tocavel, Txt, Vazio, useTema,
} from "../../../ui/componentes";
import { useRecuoDoMenu } from "../../../ui/BarraDeAbas";
import { Campo, CampoDeTexto } from "../../../ui/Campo";
import { Chip, SeloSeveridade } from "../../../ui/Chip";
import { Dialogo } from "../../../ui/Dialogo";
import { EscolhaDeMapa, type RespostaDoMapa } from "../../../ui/EscolhaDeMapa";
import {
  IconeAlerta, IconeAssinatura, IconeChecklist, IconeEnvio, IconeFoto, IconeGps,
  IconeLocalizacao, IconeOrgao, IconePerigo, IconePrazoVencido, IconeSemSinal,
  IconeSucesso, IconeTarefas,
} from "../../../ui/icones";
import { MapaDoImovel, useMapaDoMunicipio } from "../../../ui/mapa";
import { OrgaosParaAcionar } from "../../../ui/OrgaosParaAcionar";
import {
  borda, easing, elevacao, espaco, icone, movimento, peso, raio, toque, visor } from "../../../ui/tokens";
import { useReducaoDeMovimento } from "../../../ui/useReducaoDeMovimento";
import { retornoTatil } from "../../../ui/retornoTatil";
import {
  concluirColetaEmOrdem, conferirColeta, dataDoPrazo, decidirAberturaDaVistoria,
  faltaParaConcluir, quantoFalta,
} from "@dc360/campo";

/**
 * A coleta em campo. É por esta tela que o produto existe.
 *
 * O princípio que governa cada linha aqui: **nada depende de sinal, e nada se
 * perde**. Toda alteração vai para o disco no mesmo toque que a produz, e ao
 * concluir a coleta inteira entra na fila de sincronização, que já sabe
 * esperar, repetir e não duplicar.
 *
 * O que NÃO acontece aqui, de propósito: nenhuma chamada à API. A tela nem
 * tenta. Tentar e falhar no alto do morro gastaria bateria e ensinaria o
 * agente a desconfiar de uma coleta que está perfeitamente guardada.
 */


/**
 * O que a pessoa digitou vira número, ou não vira nada.
 *
 * Campo vazio devolve `undefined`, que é NÃO CONTADO, e não zero. `Number("")`
 * é zero em JavaScript, e é assim que um laudo passa a afirmar que ninguém
 * saiu de casa porque o agente não preencheu o campo.
 *
 * Texto que não é número inteiro também vira `undefined`: melhor o servidor
 * gravar "não contado" do que gravar um número que ninguém digitou.
 */
function contagensDoRascunho(pessoas: Record<string, string>): PessoasAtingidas {
  const saida: Record<string, number> = {};
  for (const campo of CAMPOS_PESSOAS) {
    const bruto = (pessoas[campo.chave] ?? "").trim();
    if (!bruto) continue;
    const n = Number(bruto);
    if (!Number.isInteger(n) || n < 0) continue;
    saida[campo.chave] = n;
  }
  return saida as PessoasAtingidas;
}

/**
 * O CHECKLIST QUE VIAJA, e por que ele não é o checklist inteiro.
 *
 * Estava escrito `CHECKLIST_VISTORIA.map(... Boolean(rascunho.checklist[chave]))`
 * em dois lugares deste arquivo, e os dois afirmavam o mesmo fato falso: item
 * NÃO RESPONDIDO virava `false`, e `false` sai no laudo com brasão como "NÃO"
 * (ver `blocoVistoria`, em `documentos/laudo.ts`). Os dois itens opcionais do
 * catálogo são "Danos estruturais visíveis" e "Acesso ao imóvel comprometido":
 * o agente que não olhou para eles produzia um documento oficial declarando que
 * não há dano estrutural e que o acesso está livre.
 *
 * É o mesmo defeito que `contagensDoRascunho` já trata trinta linhas abaixo,
 * com a mesma frase: em branco não é zero, e não respondido não é "não". E é o
 * mesmo motivo por que esta tela usa Sim e Não explícitos em vez de um
 * interruptor: "não há risco iminente" e "ninguém olhou" decidem coisas
 * diferentes, e a tela sabia distinguir os dois enquanto o envelope não sabia.
 *
 * `in` e não `Boolean`: a chave existe quando alguém tocou em Sim ou em Não, e
 * é exatamente essa a pergunta. O que não foi respondido simplesmente não entra
 * na lista, e o `checklistSchema` do pacote compartilhado aceita isso de
 * propósito: ele exige os OBRIGATÓRIOS e recusa chave fora do catálogo, e a
 * conclusão já não libera sem os obrigatórios.
 *
 * Uma função só, usada pela minuta e pelo envelope. Eram duas cópias da mesma
 * linha, e este arquivo já pagou uma vez o preço de duas listas para o mesmo
 * fato: as três vistorias do piloto de Florianópolis chegaram sem assinatura.
 */
function checklistRespondido(
  respostas: Readonly<Record<string, boolean>>,
): Array<{ chave: string; resposta: boolean }> {
  return CHECKLIST_VISTORIA
    .filter((item) => item.chave in respostas)
    .map((item) => ({ chave: item.chave, resposta: respostas[item.chave] === true }));
}

/**
 * O lado da miniatura de fotografia, em pontos.
 *
 * Estava escrito 96 duas vezes na mesma linha. Não é token de sistema (não
 * existe escala de miniatura no produto, e inventar uma aqui seria decidir por
 * todas as telas a partir de uma), mas é uma medida com nome, num lugar só.
 * Grande o bastante para o agente reconhecer a parede que fotografou, e pequena
 * o bastante para caber três por linha no aparelho estreito.
 */
const MINIATURA = 96;

/** De onde a miniatura recém guardada cresce. Perto de 1: entrada, não salto. */
const ESCALA_DA_FOTO_ENTRANDO = 0.8;

/**
 * Até onde o emblema da conclusão cresce antes de voltar. Menor que o clímax
 * da faixa de sincronização (1,28), porque o emblema já é grande e passa do
 * alvo num cartão, não numa faixa; o que importa é passar, não quanto.
 */
const ESCALA_DO_EMBLEMA_NA_CONCLUSAO = 1.12;

/**
 * As âncoras de rolagem desta tela, e por que elas existem.
 *
 * O formulário da vistoria passa de dois mil pontos de altura no aparelho. A
 * frase "falta tirar ao menos uma fotografia" ficava no FIM dessa rolagem, e o
 * agente que a lia subia a tela procurando onde. Agora cada pendência tem um
 * caminho: um toque leva ao cartão que a resolve.
 *
 * Quatro delas são pendência de conclusão, e só existem quatro lugares onde uma
 * pendência se resolve. `checklist` recebe também a indicação de órgão, que é o
 * desdobramento de um item dele e mora dentro do mesmo cartão, colado na
 * pergunta que o abriu.
 *
 * `localizacao` é de outra natureza, e entrou com a escolha de mapa: ela não é
 * pendência de nada, é o DESTINO de "ver o mapa aqui dentro". A âncora é a
 * mesma máquina (medir o `y` do cartão e rolar até ele), e duplicá-la com outro
 * nome só porque a razão é outra produziria dois jeitos de rolar até um cartão
 * na mesma tela.
 */
type SecaoDaVistoria = "progresso" | "checklist" | "fotos" | "assinatura" | "localizacao";

/**
 * De qual pendência o texto fala, e para onde ela leva.
 *
 * A lista do que falta é `faltaParaConcluir`, no pacote compartilhado, e não
 * pode virar uma segunda lista escrita aqui: foi assim que a assinatura sumiu
 * de uma e não da outra, e três vistorias reais chegaram ao servidor sem o
 * traço de quem assinou. Então a TELA não decide o que falta, só decide para
 * onde cada falta leva.
 *
 * O casamento é por trecho estável do texto, e a fragilidade disso é conhecida:
 * se alguém reescrever a frase no pacote, o caminho some em silêncio. Por isso
 * existe o caso de teste que gera TODAS as saídas possíveis de
 * `faltaParaConcluir` e exige que cada uma encontre seção aqui. Sem ele, esta
 * tabela seria um mapeamento que dá verde para sempre.
 *
 * A ordem importa: "coletar e confirmar a assinatura de quem estava no local"
 * contém os dois trechos de assinatura, e os dois levam ao mesmo cartão.
 */
const CAMINHO_DA_FALTA: ReadonlyArray<{ trecho: string; secao: SecaoDaVistoria }> = [
  { trecho: "checklist", secao: "checklist" },
  { trecho: "órgão", secao: "checklist" },
  { trecho: "fotografia", secao: "fotos" },
  { trecho: "assinatura", secao: "assinatura" },
  { trecho: "quem estava no local", secao: "assinatura" },
];

export function secaoDaFalta(falta: string): SecaoDaVistoria | null {
  return CAMINHO_DA_FALTA.find((c) => falta.includes(c.trecho))?.secao ?? null;
}

/**
 * Para onde leva um CAMPO RECUSADO pelo esquema do servidor.
 *
 * É a segunda lista de caminhos desta tela, e não uma cópia da primeira: ali a
 * entrada é a frase de `faltaParaConcluir` ("o agente terminou?"), aqui é o
 * caminho pontuado do esquema compartilhado ("o servidor vai aceitar?"), o
 * mesmo que o 422 devolve e que `conferirColeta` produz antes de enfileirar:
 * `fotos.0.tamanhoBytes`, `assinatura.idempotencyKey`, `vistoria.assinanteNome`.
 *
 * Nulo quando não há seção para onde ir (a chave da coleta, a ocorrência): a
 * linha fica sem seta e sem toque, como a de `secaoDaFalta`.
 */
export function secaoDoCampoRecusado(campo: string): SecaoDaVistoria | null {
  const partes = campo.split(".").filter((p) => !/^\d+$/.test(p) && p !== "vistoria");
  const cabeca = partes[0] ?? "";
  if (cabeca === "fotos") return "fotos";
  if (cabeca === "assinatura" || cabeca === "assinanteNome" || cabeca === "assinaturaChave") {
    return "assinatura";
  }
  if (cabeca === "checklist" || cabeca === "orgaosParaAcionar") return "checklist";
  if (cabeca === "coordenada" || cabeca === "gpsPrecisaoMetros") return "localizacao";
  return null;
}

/**
 * O RASCUNHO GRAVADO ONTEM, no formato de hoje.
 *
 * `lerRascunho` devolve o que foi gravado, e o que foi gravado pode ser de uma
 * versão anterior do aplicativo. `JSON.parse` não reclama de formato antigo:
 * ele devolve um objeto sem a propriedade, e a tela lê `undefined` onde espera
 * um objeto. O desfecho é concreto e já aconteceu uma vez neste arquivo: a
 * contagem de pessoas entrou depois (commit "O produto passa a contar pessoas"),
 * e um rascunho começado antes dela derruba esta tela com "cannot read
 * properties of undefined" na primeira renderização. Meia hora de barranco
 * dentro de um rascunho que não abre mais, e nenhum caminho de volta.
 *
 * `rascunho.ts` já migra `orgaosParaAcionar` à mão, e essa é exatamente a
 * fragilidade: migração campo a campo cobre o campo de que alguém lembrou. Aqui
 * a regra é por MECANISMO e vale para o campo que for acrescentado amanhã: o
 * rascunho novo é a BASE (ele tem todos os campos, com os valores neutros do
 * produto) e o que estava no disco vem por cima. Nada do que o agente digitou é
 * tocado, porque chave ausente não sobrescreve nada.
 *
 * A chave de idempotência do disco é reaproveitada na base, e isso não é
 * detalhe: cunhar uma chave nova aqui seria cunhar a segunda vistoria do mesmo
 * protocolo. Só há chave nova quando não há rascunho nenhum, que é o que sempre
 * houve.
 */
export function rascunhoNoFormatoDeHoje(
  guardado: Rascunho | null,
  base: Rascunho,
): Rascunho {
  if (!guardado) return base;
  return { ...base, ...guardado };
}

/**
 * O par `{lat, lng}` do rascunho vira o `{latitude, longitude}` do mapa.
 *
 * Os dois nomes existem por razões diferentes e nenhum dos dois vai mudar: o
 * curto é o que o envelope de sincronização manda ao servidor há meses, e o
 * longo é o que o SDK de mapa entende. Uma função com nome no meio é mais
 * barata que uma migração de formato, e muito mais barata que dois campos com
 * sentidos trocados num objeto de coordenada.
 */
function comoPonto(c: { lat: number; lng: number } | null | undefined): Ponto | null {
  if (!c) return null;
  if (!Number.isFinite(c.lat) || !Number.isFinite(c.lng)) return null;
  return { latitude: c.lat, longitude: c.lng };
}

/**
 * O PINO DA COORDENAÇÃO CONTRA O GPS DO AGENTE, medido.
 *
 * O alfinete que o operador colou com o telefone no ombro e o lugar onde o
 * imóvel está divergem o tempo todo, e **o agente é a fonte mais confiável
 * disso e era o único que não conseguia reportar**: a leitura do aparelho
 * ficava guardada só no rascunho, e do envelope subia apenas a PRECISÃO de uma
 * medida cujo valor nunca viajava.
 *
 * O que esta função responde é estreito de propósito: quanto os dois pontos
 * distam, e se essa distância é dizível. Ela **não decide nada** sobre corrigir
 * a ocorrência, e a tela também não: a decisão da frente do servidor é que a
 * coordenada da vistoria é gravada como dado DA VISTORIA e não corrige a
 * coordenada da ocorrência. Corrigir exige motivo escrito e decisão de pessoa
 * (`POST /ocorrencias/:id/coordenada`), e uma correção silenciosa disparada por
 * uma revistoria seria a trilha registrando uma decisão que ninguém tomou.
 *
 * ## Por que `relevante` não é só "maior que zero"
 *
 * Dois pontos de GPS nunca coincidem. Anunciar "a 4 m do ponto informado"
 * quando o próprio aparelho declara erro de cinquenta metros é o produto
 * afirmando uma precisão que ele não tem, e é assim que se ensina o agente a
 * ignorar o aviso no dia em que a divergência for de trezentos metros e a casa
 * for outra.
 *
 * O piso é o MAIOR entre a precisão que o aparelho declarou e
 * `PRECISAO_MINIMA_M`, que é o mesmo número que o plano esquemático já usa para
 * decidir se desenha rumo. Precisão ausente (o aparelho não soube dizer) cai no
 * piso fixo, e não em zero: não saber o erro não é ter erro nenhum.
 */
export function divergenciaDeCoordenada(estado: {
  daCoordenacao: Ponto | null;
  doAgente: Ponto | null;
  precisaoMetros: number | null;
}): { metros: number; texto: string; relevante: boolean } | null {
  const { daCoordenacao, doAgente } = estado;
  if (!daCoordenacao || !doAgente) return null;

  const metros = distanciaEmMetros(daCoordenacao, doAgente);
  if (!Number.isFinite(metros)) return null;

  const piso = Math.max(
    PRECISAO_MINIMA_M,
    Number.isFinite(estado.precisaoMetros ?? NaN) ? (estado.precisaoMetros ?? 0) : 0,
  );
  return { metros, texto: distanciaEmTexto(metros), relevante: metros > piso };
}

/**
 * Um requisito de conclusão, do ponto de vista de QUEM ESTÁ PREENCHENDO.
 *
 * `faltaParaConcluir` responde "dá para concluir, e o que impede". Esta lista
 * responde outra pergunta, que ela não tem como responder: "quanto do trabalho
 * já está feito". Para isso é preciso conhecer também o que está PRONTO, e a
 * função devolve só o que falta.
 *
 * Duas listas para o mesmo fato divergem na primeira pressa, e este arquivo já
 * pagou esse preço uma vez. O que impede a repetição não é disciplina: é o caso
 * de teste que exige a EQUIVALÊNCIA das duas (nenhum requisito pendente se e
 * somente se `faltaParaConcluir` devolve lista vazia), varrendo os estados
 * intermediários. Barra cheia com botão travado é o defeito que ele guarda.
 */
type RequisitoDeConclusao = {
  chave: string;
  rotulo: string;
  secao: SecaoDaVistoria;
  feito: boolean;
};

/**
 * O título de cartão com ícone, montado aqui e não dentro de `Cartao`.
 *
 * `Cartao` recebe `titulo` como texto e mora em `src/ui`, que é faixa de outra
 * frente. Enquanto ele não aceitar um desenho, o cartão entra sem `titulo` e a
 * linha do título é desenhada aqui. O texto continua sendo o mesmo texto: o
 * ícone acompanha a palavra, nunca a substitui, porque quem usa este
 * aplicativo o abre duas vezes por semana e não decora pictograma.
 *
 * No nível do módulo, e não dentro da tela: componente declarado dentro de
 * outro é um tipo novo a cada renderização, e o React desmonta e remonta a
 * subárvore inteira a cada toque do checklist.
 */
function TituloDoCartao({ desenho, texto }: { desenho: ReactNode; texto: string }) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: espaco.e2 }}>
      {desenho}
      <Txt variante="h3">{texto}</Txt>
    </View>
  );
}

/**
 * O MAPA DESTA TELA, e por que ele é um componente em vez de um gancho aqui.
 *
 * `useMapaDoMunicipio` recebe `string | null`, e `null` para ele é uma
 * DECISÃO ("não há a quem perguntar"), não uma espera: ele responde na hora,
 * em modo esquemático, com a legenda dizendo que nenhuma coordenada sai do
 * aparelho. Ler o token do armazenamento seguro, porém, é assíncrono.
 *
 * Chamar o gancho lá em cima, com `tokenDaSessao ?? null`, produzia
 * exatamente o defeito que o painel pagou para aprender em 13/09: a primeira
 * passada, ainda sem token, fixava a autorização em vazio; quando o token
 * chegava, o gancho voltava a perguntar ao servidor, mas a decisão JÁ ERA
 * "esquemático", e ela só virava "Google" quando a resposta chegasse. Entre um
 * instante e outro a tela afirmava em voz alta "nenhuma coordenada sai deste
 * aparelho" e um segundo depois desenhava o mapa do Google.
 *
 * Isso não é piscada de interface: a legenda de modo é a promessa da seção 2.2
 * do `SUBPROCESSADORES.md` virada tela, e é por ela que o encarregado de dados
 * do município confere, olhando, se a coordenada das famílias está saindo
 * dali. Uma legenda que muda sozinha já disse uma coisa falsa.
 *
 * Num componente próprio, MONTADO só depois de o token estar lido, a primeira
 * passada do gancho já acontece com o token na mão: a decisão nasce `null`
 * (que é "ainda não sei"), e `MapaDoImovel` desenha a espera com porta de
 * saída em vez de desenhar um mapa que vai se desmentir.
 */
function MapaDaVistoria({ token, imovel, agente, rotulo }: {
  /** Já lido: `null` significa sessão ausente, e nunca "ainda estou lendo". */
  token: string | null;
  imovel: Ponto;
  agente: Ponto | null;
  rotulo: string;
}) {
  const mapa = useMapaDoMunicipio(token);
  return <MapaDoImovel imovel={imovel} agente={agente} rotulo={rotulo} mapa={mapa} />;
}

/**
 * A data de um registro do passado, curta e em português.
 *
 * Dia e mês bastam para o que este cartão conta ("já estiveram aqui dia 3"), e
 * a hora entra porque duas visitas no mesmo dia acontecem: uma equipe sobe de
 * manhã, não acha ninguém, e outra volta à tarde. Data inválida vira texto
 * vazio em vez de "Invalid Date": o corpo vem do servidor, e um campo estranho
 * não pode escrever inglês numa tela de campo.
 */
function quando(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString("pt-BR", {
    day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit",
  });
}

/**
 * O QUE JÁ ACONTECEU NESTA CASA.
 *
 * `GET /ocorrencias/:id` e `GET /evidencias/ocorrencia/:id` existem desde
 * sempre, exigem só autenticação e o aplicativo nunca chamou nenhuma das duas.
 * Hoje o agente bate na porta sem saber que outra equipe já esteve ali, que já
 * houve uma devolução com motivo escrito, que há providência encaminhada a um
 * órgão, ou que o mesmo endereço já produziu outro protocolo.
 *
 * ## A ausência não atrapalha a coleta, e é isto que o desenho garante
 *
 * O cartão fica ACIMA do formulário porque a informação é de chegada: ela muda
 * a conversa na porta, e depois de o agente começar a preencher já não serve
 * para quase nada. E ele não bloqueia nada: quando o histórico não desce, a
 * peça inteira vira uma linha discreta dizendo isso, sem tarja vermelha e sem
 * botão de tentar de novo. Um "não deu, tente" no alto de uma tela cuja
 * promessa é "nada aqui depende de sinal" ensina o agente a esperar sinal para
 * trabalhar, que é o contrário do produto.
 *
 * Quando não há nada a contar, o cartão não existe. A tela passa de dois mil
 * pontos, e um cartão que diz "nada" ocupa o lugar mais caro dela.
 *
 * No nível do módulo, e não dentro da tela, pela mesma razão de
 * `TituloDoCartao`: componente declarado dentro de outro é um tipo novo a cada
 * renderização, e o React desmonta e remonta a subárvore inteira a cada toque
 * do checklist.
 */
function OQueJaAconteceuNestaCasa({ resultado }: {
  resultado: { estado: "chegou"; historico: HistoricoDaCasa } | { estado: "nao-chegou" };
}) {
  const tema = useTema();

  if (resultado.estado === "nao-chegou") {
    return (
      <Cartao>
        <View
          testID="historico-nao-chegou"
          style={{ flexDirection: "row", alignItems: "center", gap: espaco.e3 }}
        >
          <IconeSemSinal cor={tema.textoDiscreto} tamanho={icone.rotulo} />
          <View style={{ flex: 1 }}>
            <Txt variante="corpoP" discreto>
              Não deu para consultar o histórico deste endereço agora. Isso não
              atrapalha a coleta: siga normalmente, nada aqui depende de sinal.
            </Txt>
          </View>
        </View>
      </Cartao>
    );
  }

  const h = resultado.historico;
  if (!historicoTemConteudo(h)) return null;

  const motivo = ROTULO_MOTIVO_DE_DEVOLUCAO[h.devolucao?.motivo as MotivoDeDevolucao]
    ?? h.devolucao?.motivo;

  return (
    <Cartao>
      <TituloDoCartao
        desenho={<IconeTarefas cor={tema.textoDiscreto} tamanho={icone.acao} />}
        texto="O que já aconteceu nesta casa"
      />

      {h.vistoriaAnterior && (
        <View
          testID="vistoria-anterior"
          style={{ flexDirection: "row", gap: espaco.e3 }}
        >
          <IconeChecklist cor={tema.textoDiscreto} tamanho={icone.rotulo} />
          <View style={{ flex: 1, gap: espaco.e1 }}>
            <Txt variante="corpoP" peso={peso.forte}>
              {/*
                O NOME de quem fez é o que muda a conversa na porta: "a Defesa
                Civil já esteve aqui" é uma frase, "o Carlos esteve aqui dia 3"
                é outra. Nulo quando a conta saiu do cadastro, e aí a linha
                continua existindo sem o nome, porque o FATO da visita anterior
                é a parte que não pode sumir.
              */}
              Vistoria em {quando(h.vistoriaAnterior.coletada_em)}
              {h.vistoriaAnterior.agente_nome ? ` por ${h.vistoriaAnterior.agente_nome}` : ""}
            </Txt>
            {h.vistoriaAnterior.assinante_nome && (
              <Txt variante="legenda" discreto>
                Assinada por {h.vistoriaAnterior.assinante_nome}
              </Txt>
            )}
            {h.vistoriaAnterior.observacoes && (
              <Txt variante="corpoP" discreto>{h.vistoriaAnterior.observacoes}</Txt>
            )}
          </View>
        </View>
      )}

      {h.fotosDeAntes.length > 0 && (
        <View style={{ gap: espaco.e2 }} testID="fotos-de-antes">
          <View style={{ flexDirection: "row", alignItems: "center", gap: espaco.e3 }}>
            <IconeFoto cor={tema.textoDiscreto} tamanho={icone.rotulo} />
            <Txt variante="corpoP" peso={peso.forte}>
              {h.fotosDeAntes.length === 1
                ? "1 fotografia de antes"
                : `${h.fotosDeAntes.length} fotografias de antes`}
            </Txt>
          </View>
          {/*
            As miniaturas são a única parte deste cartão que depende de sinal
            DEPOIS de o dossiê chegar: o endereço é assinado e de vida curta, e
            os bytes vêm do armazenamento. Sem rede elas ficam vazias, e a
            contagem acima continua dizendo quantas existem, que é a informação
            que decide se vale procurar a mesma parede.
          */}
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <View style={{ flexDirection: "row", gap: espaco.e2 }}>
              {h.fotosDeAntes.map((f) => (
                <Image
                  key={f.id}
                  source={{ uri: f.url }}
                  style={{ width: MINIATURA, height: MINIATURA, borderRadius: raio.normal }}
                  /*
                    `accessible` junto com o rótulo, e sem ele o rótulo não
                    existia: `Image` nasce com `accessible` falso no React
                    Native, e o leitor de tela pula a imagem inteira. O texto
                    estava escrito e nunca foi falado para ninguém.
                  */
                  accessible
                  accessibilityLabel={
                    f.legenda
                      ? `Fotografia anterior: ${f.legenda}`
                      : `Fotografia ${f.ordem + 1} da vistoria anterior`
                  }
                />
              ))}
            </View>
          </ScrollView>
        </View>
      )}

      {h.providencias.length > 0 && (
        <View style={{ gap: espaco.e2 }} testID="providencias-anteriores">
          <View style={{ flexDirection: "row", alignItems: "center", gap: espaco.e3 }}>
            <IconeOrgao cor={tema.textoDiscreto} tamanho={icone.rotulo} />
            <Txt variante="corpoP" peso={peso.forte}>Já encaminhado a órgão</Txt>
          </View>
          {h.providencias.map((p) => (
            <Txt key={p.id} variante="corpoP" discreto>
              {p.orgao_destino}: {p.descricao}
              {p.respondida_em ? ` (respondido em ${quando(p.respondida_em)})` : " (sem resposta até agora)"}
            </Txt>
          ))}
        </View>
      )}

      {h.vinculadas.length > 0 && (
        <View style={{ gap: espaco.e2 }} testID="ocorrencias-vinculadas">
          <View style={{ flexDirection: "row", alignItems: "center", gap: espaco.e3 }}>
            <IconeLocalizacao cor={tema.textoDiscreto} tamanho={icone.rotulo} />
            <Txt variante="corpoP" peso={peso.forte}>
              Outros protocolos ligados a este endereço
            </Txt>
          </View>
          {h.vinculadas.map((v) => (
            <View key={v.id} style={{ flexDirection: "row", gap: espaco.e2, flexWrap: "wrap" }}>
              <Txt variante="corpoP" mono negrito>{v.protocolo}</Txt>
              <Txt variante="corpoP" discreto>{quando(v.criado_em)}</Txt>
            </View>
          ))}
        </View>
      )}

      {/*
        A DEVOLUÇÃO ANTERIOR, e ela é o item mais acionável do cartão.

        "Não havia ninguém no local" ou "risco para a equipe no local" mudam o
        que o agente faz nos próximos cinco minutos, e hoje ele chega sem saber
        disso. Peso leve porque é histórico e não alarme da coleta em curso, e
        porque é o único bloco com cor deste cartão.

        `observacao_removida_em` preenchido significa que o texto livre foi
        descartado pelo prazo de retenção que o município fixa, e NÃO que nunca
        existiu. Dizer "sem observação" sobre uma frase descartada de propósito
        é afirmar um fato falso numa tela que vira prova.
      */}
      {h.devolucao && (
        <Aviso
          tom="alerta"
          peso="leve"
          titulo={`Esta tarefa já voltou uma vez: ${motivo}`}
        >
          {h.devolucao.observacao
            ? h.devolucao.observacao
            : h.devolucao.observacao_removida_em
              ? "A observação escrita pela equipe foi descartada pelo prazo de guarda do município."
              : "A equipe não escreveu observação."}
          {h.devolucao.devolvida_por_nome
            ? ` Devolvida por ${h.devolucao.devolvida_por_nome}, em ${quando(h.devolucao.decidida_em)}.`
            : ` Devolvida em ${quando(h.devolucao.decidida_em)}.`}
        </Aviso>
      )}
    </Cartao>
  );
}

/**
 * A TARJA DE ERRO, e por que ela é um componente e não JSX solto no formulário.
 *
 * Ela desenhava só dentro do formulário, e havia uma tela em que uma falha
 * acontece e a tarja não existia: a de "esta ocorrência já foi coletada neste
 * aparelho". Ali o agente toca em "Fazer nova vistoria", confirma no diálogo, a
 * gravação da lápide falha no disco, `setErro` acende, e a tela desenhada não
 * lê `erro` em lugar nenhum. O toque simplesmente não faz nada, e o agente toca
 * de novo, e de novo, na porta da casa.
 *
 * No nível do módulo, e não dentro da tela, pela mesma razão de
 * `TituloDoCartao`: componente declarado dentro de outro é um tipo novo a cada
 * renderização.
 */
function TarjaDeErro({ mensagem, aoFechar }: {
  mensagem: string;
  aoFechar: () => void;
}) {
  const tema = useTema();
  return (
    <View
      testID="tarja-de-erro"
      accessibilityLiveRegion="assertive"
      style={{
        ...elevacao(tema).flutuante,
        borderWidth: 0,
        borderBottomWidth: borda.fio,
        borderBottomColor: tema.borda,
        padding: espaco.e3,
      }}
    >
      <Aviso
        tom="perigo"
        titulo="Não deu certo"
        acao={{
          titulo: "Fechar",
          onPress: aoFechar,
          descricao: "Fechar este aviso de erro",
          testID: "fechar-erro",
        }}
      >
        {mensagem}
      </Aviso>
    </View>
  );
}

export function requisitosDeConclusao(estado: {
  checklist: Readonly<Record<string, unknown>>;
  orgaosParaAcionar: ReadonlyArray<{ nome: string }>;
  quantasFotos: number;
  assinanteNome: string;
  assinaturaUri: string | null;
}): RequisitoDeConclusao[] {
  return [
    ...CHECKLIST_OBRIGATORIO.map((item) => ({
      chave: `checklist:${item.chave}`,
      rotulo: item.rotulo,
      secao: "checklist" as const,
      feito: item.chave in estado.checklist,
    })),
    /*
      O órgão só é requisito depois de o agente ter respondido "sim". Contá-lo
      sempre faria a barra nascer em "0 de 8" e nunca chegar a oito na vistoria
      em que ninguém precisa ser acionado, que é a maioria delas.
    */
    ...(estado.checklist[CHAVE_ACIONAR_ORGAO] === true
      ? [{
          chave: "orgaos",
          rotulo: "Órgão a acionar indicado",
          secao: "checklist" as const,
          feito: estado.orgaosParaAcionar.length > 0,
        }]
      : []),
    {
      chave: "fotos",
      rotulo: "Ao menos uma fotografia",
      secao: "fotos" as const,
      feito: estado.quantasFotos > 0,
    },
    {
      chave: "assinante",
      rotulo: "Nome de quem assina",
      secao: "assinatura" as const,
      feito: estado.assinanteNome.trim().length > 0,
    },
    {
      chave: "assinatura",
      rotulo: "Traço da assinatura",
      secao: "assinatura" as const,
      feito: Boolean(estado.assinaturaUri),
    },
  ];
}

/**
 * UMA MONTAGEM POR OCORRÊNCIA.
 *
 * `vistoria/[id]` é UMA rota do navegador de abas: abrir outra ocorrência
 * troca o parâmetro na MESMA montagem, e tudo o que é estado da tela (as
 * seções abertas, o erro no topo, a rolagem) atravessa de uma ocorrência
 * para a outra. Foi assim que "entro numa tela e tá no meio da página"
 * aconteceu aqui. A `key` pelo id faz o React desmontar e montar de novo:
 * estado limpo, rolagem no topo, e nenhum efeito precisa "limpar ao trocar".
 */
export default function TelaDeVistoria() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <VistoriaDaOcorrencia key={id} id={id} />;
}

function VistoriaDaOcorrencia({ id }: { id: string }) {
  const navegacao = useNavigation();
  /*
    O MENU FLUTUANTE E ESTA TELA. A pílula paira sobre a cena e não empurra
    nada, então cada uma das cinco telas daqui reserva o vão no fim da
    rolagem, e as barras FIXAS de botões (a minuta, a "vistoria guardada")
    sobem acima da pílula em vez de ficarem embaixo dela. Foi o que o dono
    viu: "Concluir vistoria" e "Ver na fila de envio" escondidos atrás do
    vidro. A única tela que ESCONDE o menu é a câmera, porque é tela cheia
    de verdade (ver `barraEscondida` em `ui/BarraDeAbas.tsx`).
  */
  const recuoDoMenu = useRecuoDoMenu();
  const tema = useTema();
  const { obterToken, identidade, lerIdentidade, sair } = useSessao();

  const [ocorrencia, setOcorrencia] = useState<Pendencia | null>(null);
  const [rascunho, setRascunho] = useState<Rascunho | null>(null);
  /**
   * A lapide da coleta que este aparelho ja fez desta ocorrencia.
   *
   * Enquanto ela existe e nao esta arquivada, esta tela NAO abre formulario
   * nenhum: mostra o aviso e as duas saidas. Ver `decidirAberturaDaVistoria`.
   */
  const [jaColetada, setJaColetada] = useState<ColetaLocal | null>(null);
  /**
   * O catálogo de órgãos do município, lido do DISCO ao abrir a tela.
   *
   * Estado, e não leitura na hora de desenhar: a tela é redesenhada a cada toque
   * do checklist, e uma consulta ao SQLite por renderização disputaria o banco
   * com a gravação do rascunho, que é a escrita que não pode falhar aqui.
   *
   * Começa vazio e assim permanece no aparelho que nunca sincronizou. Isso é
   * previsto: o campo livre da seleção conclui a vistoria sozinho.
   */
  const [catalogoDeOrgaos, setCatalogoDeOrgaos] = useState<OrgaoDoCatalogo[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  /**
   * A tarefa existe no servidor e ainda não chegou a este aparelho.
   *
   * Estado próprio, e não uma frase dentro de `erro`, porque as duas coisas
   * pedem telas diferentes: erro mostra tarja vermelha e não oferece saída,
   * enquanto isto aqui é ordem de chegada e tem conserto de um toque.
   */
  const [faltaBaixar, setFaltaBaixar] = useState(false);
  const [baixando, setBaixando] = useState(false);
  /*
    POR QUE a baixa não aconteceu, na divisão que muda o que o agente faz, e
    não uma frase. Era `erro` com "Tente de novo em alguns minutos" para tudo
    que não fosse `SemSinal`, e o 401 de sessão revogada caía nisso: tentar de
    novo dá 401 de novo, para sempre. A lista de tarefas já classifica com
    `motivoDaFalha` e oferece "Sair e entrar de novo"; esta tela usa a mesma
    régua, porque é o mesmo agente lendo as duas.
  */
  const [falhaAoBaixar, setFalhaAoBaixar] = useState<MotivoDaFalha | null>(null);
  const [concluindo, setConcluindo] = useState(false);

  const [permissaoCamera, pedirCamera] = useCameraPermissions();
  const [cameraAberta, setCameraAberta] = useState(false);
  /*
    A câmera é tela cheia: o menu some enquanto ela está aberta, e volta ao
    fechar. É a opção padrão do navegador, lida pela nossa barra.
  */
  useEffect(() => {
    navegacao.setOptions({ tabBarStyle: cameraAberta ? { display: "none" } : undefined });
  }, [navegacao, cameraAberta]);
  const [fotografando, setFotografando] = useState(false);
  const [capturandoGps, setCapturandoGps] = useState(false);
  const [minutaAberta, setMinutaAberta] = useState(false);
  /*
    A ESCOLHA DE COMO CHEGAR, e por que ela é estado desta tela.

    "Abrir no mapa" tinha uma resposta só, e ela levava o agente para fora do
    aplicativo no meio de uma coleta de quarenta minutos, sem perguntar. A folha
    oferece as três (o mapa do aparelho, o mapa aqui dentro, a coordenada
    copiada), e quem AGE é esta tela: duas das três respostas mexem em coisas
    que só existem aqui (a tarja de erro e a rolagem até o cartão de
    localização), e uma folha que soubesse disso seria uma folha que só serve
    para uma tela.
  */
  const [escolhendoMapa, setEscolhendoMapa] = useState(false);
  /*
    A confirmação de que a coordenada foi copiada, com hora.

    Copiar não muda nada na tela, e sem um retorno o agente toca de novo, e de
    novo, sem saber se pegou. É o mesmo desenho que a fotografia recém guardada
    já usa neste arquivo, pela mesma razão: quem está com o aparelho na mão
    precisa saber que o toque valeu. O valor é o instante, e não `true`, para
    duas cópias seguidas acenderem o retorno duas vezes em vez de uma só.
  */
  const [coordenadaCopiadaEm, setCoordenadaCopiadaEm] = useState<number | null>(null);
  /*
    As duas perguntas desta tela são ESTADO, e não efeito colateral do toque.

    Enquanto elas valem `false`, nada aconteceu: a tela não voltou para a lista
    e a lápide da coleta anterior continua de pé. É o que os testes desta tela
    cobram, e é a diferença entre "o agente foi perguntado" e "o aplicativo já
    fez", que era invisível enquanto isto era `Alert.alert`.
  */
  const [avisandoQueGuardou, setAvisandoQueGuardou] = useState(false);
  /*
    O que o servidor, ou a conferência de antes de enfileirar, recusou na
    última tentativa de concluir. Vem do rascunho ao abrir (a coleta que voltou
    da fila para correção chega com a lista do 422) e é substituído a cada
    tentativa. Vazio quando não há nada a corrigir.
  */
  const [camposRecusados, setCamposRecusados] = useState<ReadonlyArray<CampoRecusado>>([]);
  const [perguntandoNovaVistoria, setPerguntandoNovaVistoria] = useState(false);
  /*
    Trocar a resposta para "não" APAGA os órgãos que o agente já indicou, e por
    isso passa por pergunta. Não é zelo: a lista precisa mesmo sair (uma coleta
    que diz "não é necessário acionar ninguém" e lista três órgãos é uma
    contradição que o servidor recusa), e apagar em silêncio um nome digitado à
    mão é perder trabalho por causa de um toque errado numa tela pequena.
  */
  const [perguntandoDescartarOrgaos, setPerguntandoDescartarOrgaos] = useState(false);
  /*
    Apagar fotografia passa a PERGUNTAR, e a comparação que decidiu isto está
    dentro do próprio aplicativo: descartar um item da fila de envio, que é
    menos grave (a coleta ainda pode ser refeita do rascunho), já perguntava.
    Aqui o toque errado apaga a prova de uma interdição, que não se refaz sem
    subir o morro de novo com o morador esperando.
  */
  const [fotoParaApagar, setFotoParaApagar] = useState<FotoLocal | null>(null);
  /*
    A última fotografia guardada, para ela ter ENTRADA na tela.

    Antes daqui a câmera fechava e a miniatura simplesmente estava lá, sem
    flash, sem som e sem movimento: o agente não sabia se o obturador tinha
    pegado, e a reação natural é tirar a mesma foto de novo. Guardar a chave (e
    não um booleano) faz a animação valer para a foto CERTA quando duas são
    tiradas em seguida.
  */
  const [fotoRecemGuardada, setFotoRecemGuardada] = useState<string | null>(null);
  /** Enquanto true, o ScrollView desta tela nao rola: o dedo esta assinando. */
  const [desenhando, setDesenhando] = useState(false);
  const cameraRef = useRef<CameraView>(null);

  /*
    O TOKEN DA SESSÃO, e por que ele tem TRÊS estados e não dois.

    Ele serve às duas ligações com a rede que existem nesta tela e que não
    servem à coleta: a autorização do mapa e o histórico da casa. Nenhuma das
    duas é lida por `obterToken()` na hora do uso, porque as duas acontecem
    dentro de renderização e `obterToken` é assíncrono.

    `undefined` é "ainda lendo", `null` é "não há sessão" e a string é a
    sessão. A diferença entre os dois primeiros não é preciosismo: `null` é uma
    resposta, e as duas peças que dependem deste token tratam resposta e espera
    de formas opostas. Ver o cabeçalho de `MapaDaVistoria`, logo acima, para o
    que a confusão dos dois custava na legenda de modo do mapa.
  */
  const [tokenDaSessao, setTokenDaSessao] = useState<string | null | undefined>(undefined);
  useEffect(() => {
    let vivo = true;
    void (async () => {
      try {
        const t = await obterToken();
        if (vivo) setTokenDaSessao(t ?? null);
      } catch {
        // Sessão ilegível é sessão ausente para efeito de mapa: não autoriza.
        if (vivo) setTokenDaSessao(null);
      }
    })();
    return () => { vivo = false; };
  }, [obterToken]);

  /*
    O QUE JÁ ACONTECEU NESTA CASA: enriquecimento oportunista, e a palavra
    oportunista é o contrato inteiro.

    Esta tela abre do DISCO e não depende de sinal, e isso não muda aqui. O
    histórico chega se chegar; a ausência dele não atrasa a abertura, não
    bloqueia campo nenhum, não vai para a tarja vermelha da coleta e não impede
    concluir. `buscarHistoricoDaCasa` não estoura em nenhum caminho, de
    propósito, e o motivo está escrito no cabeçalho daquele arquivo.

    `undefined` é "ainda não perguntei ou ainda não voltou", e por isso o cartão
    simplesmente não existe até haver resposta: uma linha "consultando..." no
    alto de um formulário que já está pronto para ser preenchido é ruído numa
    tela em que o agente tem alguém esperando na porta.
  */
  const [historico, setHistorico] = useState<
    { estado: "chegou"; historico: HistoricoDaCasa } | { estado: "nao-chegou" } | undefined
  >(undefined);

  const reduzirMovimento = useReducaoDeMovimento();

  /*
    A rolagem e as âncoras: como um toque em "falta a fotografia" leva ao
    cartão das fotografias.

    As alturas ficam numa `ref` e não em estado. Elas são escritas pelo
    `onLayout` de cada cartão, que dispara a cada medição; em estado, cada
    medição provocaria uma renderização nova, e a renderização nova mediria de
    novo. Nada aqui é lido durante o desenho: só no instante do toque.
  */
  const rolagem = useRef<ScrollView>(null);
  const alturaDaSecao = useRef<Partial<Record<SecaoDaVistoria, number>>>({});
  /*
    Onde o agente ACABOU DE CHEGAR.

    Rolar sozinho até um cartão, num formulário com sete deles, deixa quem está
    olhando sem saber se a tela obedeceu ou se ela se mexeu por conta própria (é
    a mesma reclamação que a lista de tarefas recebeu: "dá uma rolada sozinha").
    O destino acende um contorno por alguns segundos, e o contorno é espessura
    MAIS cor, nunca só cor.
  */
  const [secaoEmDestaque, setSecaoEmDestaque] = useState<SecaoDaVistoria | null>(null);

  /*
    O CLÍMAX da conclusão, e a guarda que impede a comemoração de acontecer à
    toa.

    O vocabulário é o da `FaixaDeSincronizacao`, que já acertou isto uma vez:
    `movimento.climax` partido em 40% de ida e 60% de volta, `easing.climax`
    só na ida (a curva que passa do alvo é o que separa "o estado mudou" de
    "conseguimos", e por isso ela não é emprestada para mais nada nesta tela;
    a volta é `easing.entrada`, que chega no lugar em vez de bater), e
    `useNativeDriver` porque escala é propriedade que a
    camada nativa anima sozinha. Sem isso cada quadro atravessa a ponte, e num
    aparelho fraco de prefeitura a comemoração sai travada, que é pior do que
    não ter comemoração nenhuma.

    **Por que a guarda existe, se o efeito já depende de `avisandoQueGuardou`.**
    O arranjo de dependências sozinho NÃO garante "uma vez", e vale dizer com
    precisão por quê: o efeito depende também de `reduzirMovimento`, que é lido
    de um evento do SISTEMA e muda no meio do plantão (quem liga essa chave
    quase sempre liga porque começou a passar mal, e este aplicativo fica aberto
    o dia inteiro). Ligar e desligar a chave com a tela de conclusão aberta faria
    o efeito rodar de novo, e o emblema pularia sozinho sem nada ter sido
    concluído.

    A `ref` torna "comemora uma vez por conclusão" verdade por CONSTRUÇÃO, e não
    por acidente de quais valores estão no arranjo hoje: a dependência que
    alguém acrescentar amanhã não traz a comemoração de volta junto. Ela volta a
    `false` quando o estado volta, que é o que permite uma segunda vistoria
    comemorar de novo.

    O valor de repouso é 1, e não 0: se por qualquer motivo o efeito não rodar,
    o emblema aparece no tamanho certo em vez de sumir da tela.
  */
  const emblemaDaConclusao = useRef(new Animated.Value(1)).current;
  const jaComemorou = useRef(false);

  useEffect(() => {
    if (!avisandoQueGuardou) {
      jaComemorou.current = false;
      return;
    }
    if (jaComemorou.current) return;
    jaComemorou.current = true;

    if (reduzirMovimento) {
      // Quem pediu menos movimento continua vendo o emblema, o título e o
      // resumo. O que some é a interpolação, nunca o fato.
      emblemaDaConclusao.setValue(1);
      return;
    }

    emblemaDaConclusao.setValue(0.6);
    Animated.sequence([
      Animated.timing(emblemaDaConclusao, {
        toValue: ESCALA_DO_EMBLEMA_NA_CONCLUSAO,
        duration: movimento.climax * 0.4,
        easing: Easing.bezier(...easing.climax),
        useNativeDriver: true,
      }),
      Animated.timing(emblemaDaConclusao, {
        toValue: 1,
        duration: movimento.climax * 0.6,
        easing: Easing.bezier(...easing.entrada),
        useNativeDriver: true,
      }),
    ]).start();
  }, [avisandoQueGuardou, reduzirMovimento, emblemaDaConclusao]);

  /*
    A entrada da miniatura recém guardada.

    Um valor só para todas as fotos, porque só UMA é a nova a cada instante:
    um valor por foto seria uma animação por miniatura viva na tela o plantão
    inteiro, sem ninguém olhando para elas.
  */
  const entradaDaFoto = useRef(new Animated.Value(1)).current;
  const escalaDaFotoNova = entradaDaFoto.interpolate({
    inputRange: [0, 1],
    outputRange: [ESCALA_DA_FOTO_ENTRANDO, 1],
  });

  useEffect(() => {
    if (!fotoRecemGuardada) return;
    if (reduzirMovimento) {
      entradaDaFoto.setValue(1);
      return;
    }
    entradaDaFoto.setValue(0);
    Animated.timing(entradaDaFoto, {
      toValue: 1,
      duration: movimento.mudancaDeEstado,
      easing: Easing.bezier(...easing.entrada),
      // Opacidade e escala: a camada nativa desenha as duas sozinha, e o
      // JavaScript deste aplicativo pode estar ocupado drenando a fila.
      useNativeDriver: true,
    }).start();
  }, [fotoRecemGuardada, reduzirMovimento, entradaDaFoto]);

  /*
    A confirmação da fotografia guardada some sozinha.

    Ela é retorno de um ato que acabou de acontecer, não um estado da vistoria:
    deixada na tela, vira mais uma linha permanente num formulário que já é
    longo, e o agente para de enxergá-la justamente na foto seguinte, que é
    quando ela precisa ser vista.
  */
  useEffect(() => {
    if (!fotoRecemGuardada) return;
    const relogio = setTimeout(() => { setFotoRecemGuardada(null); }, movimento.climax * 8);
    return () => { clearTimeout(relogio); };
  }, [fotoRecemGuardada]);

  useEffect(() => {
    if (!secaoEmDestaque) return;
    const relogio = setTimeout(() => { setSecaoEmDestaque(null); }, movimento.climax * 6);
    return () => { clearTimeout(relogio); };
  }, [secaoEmDestaque]);

  /*
    A confirmação de "copiado" some sozinha, pela mesma razão da fotografia
    logo acima: ela é retorno de um ato que acabou de acontecer, e não estado da
    vistoria. Deixada na tela, vira mais uma linha permanente num formulário que
    já passa de dois mil pontos.
  */
  useEffect(() => {
    if (coordenadaCopiadaEm === null) return;
    const relogio = setTimeout(() => { setCoordenadaCopiadaEm(null); }, movimento.climax * 8);
    return () => { clearTimeout(relogio); };
  }, [coordenadaCopiadaEm]);

  const irPara = useCallback((secao: SecaoDaVistoria) => {
    setSecaoEmDestaque(secao === "progresso" ? null : secao);
    const y = alturaDaSecao.current[secao];
    if (y == null) return;
    /*
      Sobe um respiro acima do cartão para o título dele aparecer inteiro. Sem
      isso o destino fica colado no topo da tela e parece meia seção.
    */
    rolagem.current?.scrollTo({
      y: Math.max(0, y - espaco.e4),
      animated: !reduzirMovimento,
    });
  }, [reduzirMovimento]);

  /*
    O relógio do prazo, dentro da vistoria.

    Sem ele, a conta seria feita uma vez, quando a tela abriu, e ficaria
    congelada ali. Uma vistoria de morro dura quarenta minutos: o selo diria
    "vence em 1h" durante a coleta inteira e continuaria dizendo isso depois de
    o prazo já ter passado. Trinta segundos é bem mais curto que a menor faixa
    que o texto distingue (minutos), então nunca dá para ver a frase errada.
  */
  const [agora, setAgora] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setAgora(Date.now()), 30_000);
    return () => { clearInterval(t); };
  }, []);

  const carregarDoDisco = useCallback(async () => {
    /*
      A leitura do disco passa a ter caminho de falha, e antes não tinha.

      Se o banco local não abrisse (armazenamento cheio, arquivo corrompido,
      migração do SQLite no meio), a promessa era rejeitada e ninguém pegava:
      `setCarregando(false)` nunca rodava e a tela ficava com a roda girando
      PARA SEMPRE, sem uma palavra. O agente em pé no barranco não tem como
      distinguir isso de sinal ruim, e o que ele faz é matar o aplicativo, que
      é o único jeito de perder coleta neste produto.

      Agora a falha vira a tela desenhada de erro, com nome e com saída.
    */
    setErro(null);
    try {
      const alvo = await pendenciaGuardada(id);
      if (!alvo) {
        /*
          Não é erro, é ORDEM DE CHEGADA, e a diferença muda o que a tela diz.

          Este caminho ficou muito mais comum depois que tocar na notificação
          passou a abrir a tarefa: o aviso de push chega no segundo em que a
          coordenação despacha, e a lista de tarefas deste aparelho só é
          reescrita na próxima atualização. Entre um instante e outro a
          ocorrência existe no servidor e não existe no disco, e isso é o
          sistema funcionando, não falhando.

          A tela anterior dizia "Esta ocorrência não está guardada neste
          aparelho", em tarja vermelha, o que soa a defeito e não sugere ação
          nenhuma. Agora ela nomeia a causa e oferece o botão que resolve.
        */
        setFaltaBaixar(true);
        setCarregando(false);
        return;
      }
      setFaltaBaixar(false);
      setOcorrencia(alvo);
      navegacao.setOptions({ title: alvo.protocolo });

      /*
        A pergunta que faltava, e a ausencia dela produzia dois laudos para o
        mesmo protocolo: alem de "existe rascunho?", esta tela precisa saber
        "esta ocorrencia ja foi coletada neste aparelho?".

        Sem a lapide, o caminho era este: o agente conclui a vistoria, ela entra
        na fila, o rascunho e apagado, e a lista de tarefas continua a mesma por
        horas porque nao ha sinal. Um toque na tarefa caia aqui, `lerRascunho`
        devolvia nulo, e a linha abaixo cunhava chave de idempotencia NOVA. Duas
        chaves diferentes sao, para o servidor, duas coletas legitimas.

        A decisao mora em `@dc360/campo` e tem teste sem Expo. Aqui a tela so
        obedece: quando a resposta e `ja_coletada`, nenhum rascunho e criado,
        porque criar rascunho e exatamente o que produz a segunda vistoria.
      */
      /*
        O catálogo desce do DISCO junto com a tarefa, e nunca da rede: esta tela
        não faz chamada nenhuma, porque tentar e falhar no alto do morro gasta
        bateria e ensina o agente a desconfiar de uma coleta que está guardada.
      */
      const [guardado, lapide, orgaos] = await Promise.all([
        lerRascunho(id), coletaDe(id), orgaosGuardados(),
      ]);
      setCatalogoDeOrgaos(orgaos);
      const decisao = decidirAberturaDaVistoria({ rascunho: guardado, coleta: lapide });
      /*
        Os DOIS estados sao escritos nos dois ramos, e nao so o que o ramo
        acende. Esta leitura roda a cada FOCO da tela (ver o efeito logo
        abaixo), e a tela pode chegar aqui com o rascunho da conclusao
        anterior ainda em memoria: se o disco agora diz "ja coletada", o
        rascunho em memoria precisa sair, senao um toque no formulario o
        gravaria de volta por cima da lapide. O inverso vale igual: a coleta
        que voltou da fila para correcao tem rascunho e nao tem mais lapide.
      */
      if (decisao === "ja_coletada") {
        setJaColetada(lapide);
        setRascunho(null);
        setCarregando(false);
        return;
      }
      setJaColetada(null);
      setRascunho(rascunhoNoFormatoDeHoje(
        guardado,
        rascunhoNovo(
          id, alvo.protocolo, guardado?.idempotencyKey ?? Crypto.randomUUID(),
        ),
      ));
      /*
        A coleta que voltou da fila para correção chega com a lista do que o
        servidor recusou (`rascunhoDaColeta`). Ela é a primeira coisa que o
        agente precisa ver: sem ela, a tela abre com tudo preenchido e sem
        dizer por que a coleta voltou.
      */
      setCamposRecusados(guardado?.camposRecusados ?? []);
      setCarregando(false);
    } catch {
      setErro(
        "Não foi possível ler esta vistoria no aparelho. O que já estava "
        + "guardado continua guardado: nada foi apagado.",
      );
      setCarregando(false);
    }
  }, [id, navegacao]);

  /*
    A LEITURA DO DISCO ACONTECE A CADA FOCO, e nao so na montagem.

    `vistoria/[id]` e UMA rota do navegador de abas, e o navegador NAO desmonta
    a tela quando o agente sai dela: `navigate(A) → lista → navigate(A)` e uma
    montagem so. A `key` pelo id, la em cima, cobre a TROCA de ocorrencia; ela
    nao cobre a volta a mesma. Com a leitura presa a `useEffect` de montagem,
    a tela reaparecia como tinha ficado, e "como tinha ficado" era a minuta
    com "Concluir vistoria" liberado em cima de uma coleta que ja estava na
    fila (a lapide estava no disco e ninguem a lia). O caminho da fila para
    correcao era pior: "Corrigir a vistoria" grava o rascunho corrigido e faz
    `router.push` para ca; a minuta velha reenfileirava a coleta IGUAL, a
    conclusao apagava o rascunho corrigido, e o 422 voltava. Laco sem saida.

    `useFocusEffect`, e nao `key` com um contador por foco: remontar a tela
    inteira a cada foco perderia a rolagem e reanimaria tudo o que entra, e o
    que precisa voltar a valer e o DISCO, nao o componente. A leitura ja e
    idempotente (ela grava os dois estados nos dois ramos, ver acima), entao
    chama-la de novo e seguro por construcao.

    As sobreposicoes fecham ANTES da leitura, de proposito: a minuta, a camera
    e a tela de "vistoria guardada" sao estado de UMA visita, e o que esta
    embaixo delas e o que o disco disser. `carregando` volta a `true` para nao
    haver um quadro em que o formulario anterior, interativo, fique na tela
    entre o foco e a resposta do disco: um toque nessa janela gravaria o
    rascunho da conclusao anterior por cima da lapide.

    Na montagem ele roda uma vez, como o efeito de montagem rodava: a tela so
    monta quando ganha foco.
  */
  useFocusEffect(useCallback(() => {
    setMinutaAberta(false);
    setCameraAberta(false);
    setAvisandoQueGuardou(false);
    setCamposRecusados([]);
    setErro(null);
    setCarregando(true);
    void carregarDoDisco();
  }, [carregarDoDisco]));

  /*
    A ida à rede que o histórico pede, e as três guardas dela.

    1. **Só depois de a ocorrência existir.** Antes disso a tela pode estar na
       de "ainda não baixada" ou na de erro, e consultar o dossiê de um
       identificador que este aparelho não conhece é gastar sinal para
       responder a ninguém.
    2. **Só depois de o token ter sido lido.** `undefined` é "ainda lendo", e
       perguntar sem token devolveria "não chegou" na hora, deixando o cartão
       de aviso na tela para sempre por causa de uma corrida com o
       armazenamento seguro.
    3. **`vivo`**, porque o agente sai desta tela o tempo todo (e ela vive
       quarenta minutos). Sem a guarda, o retorno de uma consulta lenta cairia
       num componente desmontado.
    4. **Só quando este cartão vai existir.** A ocorrência que este aparelho já
       coletou não desenha formulário nem histórico: ela mostra a lápide e as
       duas saídas. Perguntar ali gasta a janela de sinal da rua por um dossiê
       que ninguém vai ver e, pior, `GET /ocorrencias/:id` GRAVA registro de
       consulta no banco: cada toque acidental numa lista velha escrevia, na
       trilha de acesso a dado de cidadão, que este agente leu o dossiê desta
       família. Leitura que não aconteceu não vira linha de registro de acesso.

    5. **Só com sinal.** Sem sinal a consulta não é feita e NADA é desenhado.
       Ela perguntava sem olhar o sinal, e no morro, onde não há sinal, toda
       vistoria abria com "Não deu para consultar o histórico deste endereço
       agora" no alto do formulário, dita como falha, numa tela cuja promessa
       é "nada aqui depende de sinal". Falta de sinal é o estado normal de
       trabalho, não uma consulta que falhou; a linha existe para a consulta
       que FOI feita e não voltou (servidor fora do ar, tempo esgotado), que é
       a única situação em que "não deu" é informação. Se o sinal chegar com a
       tela aberta, a consulta acontece aí, uma vez.

    Roda UMA vez por ocorrência, e não a cada foco: o que ela traz é o passado,
    e o passado não muda enquanto o agente está na porta. Uma releitura a cada
    volta do segundo plano gastaria a mesma janela de sinal de que a
    sincronização precisa, pela rede da rua, para reler o que já está na tela.
    A `ref` é o que torna isso verdade por construção: o sinal piscando e a
    releitura do disco a cada foco (que troca o objeto `ocorrencia`) não
    perguntam de novo.
  */
  const sinal = useSinal();
  const historicoJaPedido = useRef(false);
  /*
    A guarda de "ainda montada" é da TELA, e não desta rodada do efeito. Como
    a consulta acontece uma vez só, cancelá-la quando o arranjo de
    dependências muda (o sinal pisca no meio dos sete segundos de espera)
    jogaria fora a única resposta que vai chegar, e o cartão nunca apareceria.
    O que precisa ser evitado é só escrever estado numa tela que já saiu.
  */
  const telaMontada = useRef(true);
  useEffect(() => {
    telaMontada.current = true;
    return () => { telaMontada.current = false; };
  }, []);
  useEffect(() => {
    if (!ocorrencia || jaColetada || tokenDaSessao === undefined) return;
    if (historicoJaPedido.current || !sinal.temSinal) return;
    historicoJaPedido.current = true;
    void (async () => {
      const resultado = await buscarHistoricoDaCasa(tokenDaSessao, ocorrencia.id);
      if (telaMontada.current) setHistorico(resultado);
    })();
  }, [ocorrencia, jaColetada, tokenDaSessao, sinal.temSinal]);

  /**
   * Busca a lista de tarefas e tenta abrir de novo.
   *
   * É a única ida à rede desta tela, e ela só existe neste estado: a tela de
   * coleta continua sem tocar na rede, porque tentar e falhar no alto do morro
   * gasta bateria e ensina o agente a desconfiar de uma coleta que está
   * perfeitamente guardada. Aqui a rede é o ponto: sem ela não há o que abrir.
   */
  const baixarEAbrir = useCallback(async () => {
    setBaixando(true);
    setFalhaAoBaixar(null);
    try {
      const token = await obterToken();
      if (!token) {
        /* Sem ficha nenhuma no aparelho é sessão encerrada: o ato que resolve
           é o mesmo do 401, entrar de novo. */
        setFalhaAoBaixar("sessao-encerrada");
        return;
      }
      await atualizarPendencias(token);
      await carregarDoDisco();
    } catch (e: unknown) {
      setFalhaAoBaixar(motivoDaFalha(e));
    } finally {
      setBaixando(false);
    }
  }, [obterToken, carregarDoDisco]);

  /**
   * Sair da conta e voltar à entrada: o único ato que resolve a sessão
   * encerrada. É o mesmo par de linhas da lista de tarefas, e a promessa de
   * que a fila sobrevive ao logout está escrita em `comoContarAFalha`.
   */
  async function sairEEntrarDeNovo(): Promise<void> {
    await sair();
    router.replace("/entrar");
  }

  /**
   * Toda mudança passa por aqui, e toda mudança grava.
   *
   * Uma função só, e não um `useEffect` que salva quando o estado muda: com o
   * efeito, o React pode agrupar atualizações e o processo pode morrer entre a
   * mudança na tela e a gravação. Assim, o disco vai junto com a tela.
   */
  const alterar = useCallback(async (mudanca: Partial<Rascunho>) => {
    setRascunho((atual) => {
      if (!atual) return atual;
      const novo = { ...atual, ...mudanca };
      /*
        A GRAVAÇÃO PASSA A TER CAMINHO DE FALHA, e antes não tinha.

        Era `void salvarRascunho(novo)`, sem `catch`: a tela mostrava a
        resposta, a fotografia, o nome de quem assina, e o disco podia ter
        recusado tudo (armazenamento cheio, base ocupada pela fila, migração no
        meio) sem que uma palavra aparecesse. É a forma mais cara de perda de
        trabalho deste produto, porque ela é INVISÍVEL: o agente desce o morro
        certo de que está guardado, o Android mata o aplicativo para liberar
        memória, e a vistoria volta ao estado da última gravação que deu certo.

        A promessa desta tela é "nada se perde", e ela é cumprida por esta
        linha. Se o disco recusou, o agente precisa saber ENQUANTO ainda está
        no local, que é o único instante em que refazer custa um toque.

        Vai para a mesma tarja das outras falhas, que fica presa no alto da
        tela e fora da rolagem: num formulário de dois mil pontos, um aviso
        desenhado no meio é um aviso que ninguém lê.
      */
      void salvarRascunho(novo).catch(() => {
        setErro(
          "O aparelho não conseguiu guardar o que você acabou de preencher. "
          + "Toque de novo neste campo. O que já estava guardado continua "
          + "guardado: nada foi apagado.",
        );
      });
      return novo;
    });
  }, []);

  /**
   * A saida deliberada da tela de "ja coletada".
   *
   * Arquiva a lapide em vez de apaga-la: apagar perderia o unico registro local
   * de que houve uma coleta antes, e e ele que explica, na fila de envio, por
   * que existem duas coletas do mesmo protocolo esperando para subir.
   *
   * Rele o rascunho do disco antes de criar um novo, e isso nao e zelo vazio.
   * Existe um caso real em que os dois convivem: a conclusao morreu entre
   * gravar a lapide e apagar o rascunho. Ali, criar rascunho novo por cima
   * jogaria fora o que o agente digitou no morro. Arquivar devolve o rascunho
   * preso em vez de destrui-lo.
   */
  async function refazerVistoria(): Promise<void> {
    if (!ocorrencia) return;
    try {
      await arquivarColeta(id);
      const guardado = await lerRascunho(id);
      setRascunho(rascunhoNoFormatoDeHoje(
        guardado,
        rascunhoNovo(
          id, ocorrencia.protocolo, guardado?.idempotencyKey ?? Crypto.randomUUID(),
        ),
      ));
      setJaColetada(null);
    } catch {
      setErro(
        "Não foi possível liberar uma nova vistoria neste aparelho. Tente de novo.",
      );
    }
  }

  async function capturarGps(): Promise<void> {
    setCapturandoGps(true);
    setErro(null);
    try {
      const permissao = await Location.requestForegroundPermissionsAsync();
      if (!permissao.granted) {
        setErro(
          "Sem permissão de localização. O laudo pode ser concluído sem a " +
          "coordenada, mas ela é o que prova onde a vistoria foi feita.",
        );
        return;
      }
      const posicao = await Location.getCurrentPositionAsync({
        // Alta precisão custa bateria e tempo, e é o que um laudo técnico
        // exige: coordenada de cem metros não identifica qual casa do morro.
        accuracy: Location.Accuracy.High,
      });
      await alterar({
        coordenada: {
          lat: Number(posicao.coords.latitude.toFixed(6)),
          lng: Number(posicao.coords.longitude.toFixed(6)),
        },
        gpsPrecisaoMetros: posicao.coords.accuracy
          ? Math.round(posicao.coords.accuracy)
          : null,
      });
    } catch {
      setErro("O aparelho não conseguiu obter a localização. Tente de novo a céu aberto.");
    } finally {
      setCapturandoGps(false);
    }
  }

  async function fotografar(): Promise<void> {
    if (!cameraRef.current || fotografando) return;
    setFotografando(true);
    try {
      /*
        Qualidade 0,6 e sem base64. A foto precisa mostrar a trinca, não render
        pôster: cada megabyte a mais é um megabyte que sobe pela rede da rua,
        no plano de dados da prefeitura, e que ocupa espaço no aparelho até
        sincronizar. `base64: true` dobraria o uso de memória sem serventia,
        porque o envio lê os bytes do arquivo.
      */
      const foto = await cameraRef.current.takePictureAsync({
        quality: 0.6,
        skipProcessing: false,
      });
      if (foto?.uri) {
        await guardarFoto(foto.uri);
        /*
          O visor é preto e a câmera fecha: sem flash, sem som e sem toque, o
          agente não sabe se a foto pegou, e a resposta natural é fotografar de
          novo a mesma parede. A miniatura entrando já dá o retorno para quem
          está olhando; isto é para quem está olhando o barranco.
        */
        retornoTatil("confirmado");
      }
    } catch {
      setErro("O aparelho não conseguiu tirar a foto. Tente de novo.");
      setCameraAberta(false);
    } finally {
      setFotografando(false);
    }
  }

  async function guardarFoto(uri: string): Promise<void> {
    if (!rascunho) return;
    /*
      A foto sai do cache do sistema ANTES de entrar no rascunho.

      A câmera devolve um caminho de cache, e cache é o que o sistema apaga
      sozinho quando o armazenamento aperta. Guardar esse caminho aqui faria a
      coleta apontar, por horas, para um arquivo que pode sumir sem aviso, e o
      envio inteiro morreria nele. O porquê está inteiro em
      `dados/evidencia-no-disco.ts`.
    */
    const guardada = guardarFotoNoAparelho(uri, rascunho.fotos.length);
    const foto: FotoLocal = {
      // A chave nasce aqui, com a foto, e não no envio: é ela que impede o
      // servidor de aceitar a mesma imagem duas vezes se o envio for repetido.
      idempotencyKey: Crypto.randomUUID(),
      uriLocal: guardada.uriLocal,
      nomeArquivo: `vistoria-${rascunho.protocolo.replace("/", "-")}-${rascunho.fotos.length + 1}.jpg`,
      tipoConteudo: "image/jpeg",
      tamanhoBytes: guardada.tamanhoBytes,
      capturadaEm: new Date().toISOString(),
      ordem: rascunho.fotos.length,
      ...(rascunho.coordenada ? { coordenada: rascunho.coordenada } : {}),
    };
    await alterar({ fotos: [...rascunho.fotos, foto] });
    /*
      O RETORNO do obturador, e ele é a correção de um defeito relatado com o
      aparelho na mão: a câmera fechava e a miniatura aparecia, sem flash, sem
      som e sem movimento nenhum. Quem está de luva, na chuva, com o morador
      esperando, não confere miniatura de 96 pontos: tira a foto de novo.

      Duas coisas, e as duas de propósito. A chave alimenta a ENTRADA da
      miniatura (escala e opacidade, que a camada nativa anima sozinha), e a
      linha de confirmação, com região viva, diz em PALAVRA o que aconteceu,
      porque movimento não chega a quem usa leitor de tela nem a quem desligou
      a animação no sistema.
    */
    setFotoRecemGuardada(foto.idempotencyKey);
    setCameraAberta(false);
  }

  /**
   * A saída nomeada, e ela não apaga nada.
   *
   * A barra de abas some dentro desta tela de propósito: um caminho de fuga
   * permanente embaixo do polegar, ao lado de um rolamento longo, é como se
   * produz vistoria pela metade. Só que esconder a barra respondia à pergunta
   * "como eu saio daqui?" com uma justificativa em vez de uma saída, e o dono
   * do aparelho reclamou disso com razão.
   *
   * Então a saída existe, tem nome e diz o que faz. Sair daqui nunca foi
   * perder trabalho: `alterar()` grava no disco a cada toque, e o rascunho
   * continua na lista de tarefas com a marca de vistoria começada. Por isso
   * também não há confirmação: pedir "tem certeza?" para uma ação que não
   * destrói nada ensina o agente a responder "sim" sem ler, e no dia em que a
   * pergunta for séria ele responde igual.
   *
   * `descartarRascunho` NÃO é chamado aqui, e não é esquecimento: quem apaga o
   * rascunho é a conclusão, depois de a fila aceitar a coleta.
   */
  function salvarESair(): void {
    /*
      Sem histórico não adianta voltar.

      A vistoria também é aberta direto, sem passar pela lista, quando o agente
      chega nela por um link. Nesse caso `back()` não tem para onde ir e o
      botão não faria absolutamente nada, que é o pior comportamento possível
      para o botão que existe justamente para provar que dá para sair.
    */
    if (router.canGoBack()) router.back();
    else router.replace("/(agente)");
  }

  /**
   * Entrega a coordenada da ocorrência ao aplicativo de mapas do aparelho.
   *
   * A coordenada usada é a da OCORRÊNCIA, e não a do rascunho. A do rascunho é
   * onde o agente está de pé; a da ocorrência é onde ele precisa chegar. Levar
   * alguém até onde ele já está não é uma rota.
   */
  async function abrirRota(): Promise<void> {
    if (ocorrencia?.latitude == null || ocorrencia.longitude == null) return;
    setErro(null);
    const abriu = await abrirNoMapa(
      ocorrencia.latitude, ocorrencia.longitude, ocorrencia.endereco,
    );
    if (!abriu) {
      /*
        A coordenada vai no texto do aviso, e isso é o que salva a ida.

        Se nenhum aplicativo de mapas atendeu, dizer "não deu" deixaria o
        agente sem nada. Com os números na tela ele copia para onde quiser, ou
        lê por rádio para a base.

        O texto sai de `coordenadaEmTexto`, que é o MESMO formato que a folha
        oferece para copiar. Enquanto era um `toFixed` escrito aqui, existiam
        dois lugares no produto montando a mesma frase, e o dia em que um dos
        dois mudasse de formato seria o dia em que o agente ditaria por rádio um
        número diferente do que colou.
      */
      setErro(
        "Nenhum aplicativo de mapas atendeu neste aparelho. A coordenada da " +
        `ocorrência é ${coordenadaEmTexto(ocorrencia.latitude, ocorrencia.longitude)}.`,
      );
    }
  }

  /**
   * O que cada uma das três respostas da folha de mapa faz.
   *
   * Quem escolhe é `EscolhaDeMapa`; quem AGE é esta tela, porque duas das três
   * mexem em coisas que só existem aqui: a tarja de erro e a rolagem até o
   * cartão de localização.
   *
   * "Ver aqui dentro" não decide modo de mapa nenhum, e isso é deliberado. Ele
   * rola até o cartão, e o cartão é quem monta `MapaDaVistoria`, que decide
   * entre o mapa do Google e o plano esquemático conforme a autorização do
   * município e desenha a legenda de modo. Sem chave, o agente vê o plano
   * esquemático, com a legenda dizendo que nenhuma coordenada saiu daqui: é a
   * seção 2.2 do `docs/SUBPROCESSADORES.md` virada tela, e ela continua tendo
   * um dono só.
   */
  async function responderEscolhaDeMapa(resposta: RespostaDoMapa): Promise<void> {
    if (resposta === "aqui-dentro") { irPara("localizacao"); return; }
    if (resposta === "aplicativo") { await abrirRota(); return; }

    if (ocorrencia?.latitude == null || ocorrencia.longitude == null) return;
    setErro(null);
    const copiou = await copiarCoordenada(ocorrencia.latitude, ocorrencia.longitude);
    if (copiou) {
      retornoTatil("confirmado");
      setCoordenadaCopiadaEm(Date.now());
      return;
    }
    /*
      Recusa da área de transferência acontece em telefone gerenciado por
      política da prefeitura. Dizer só "não deu" deixaria o agente sem nada, e
      por isso a coordenada vai no texto do aviso, igual ao caminho do mapa que
      ninguém atendeu: ele continua conseguindo ditar por rádio.
    */
    setErro(
      "Este aparelho não deixou copiar. A coordenada da ocorrência é "
      + `${coordenadaEmTexto(ocorrencia.latitude, ocorrencia.longitude)}.`,
    );
  }

  async function concluir(): Promise<void> {
    if (!rascunho || !ocorrencia) return;
    setConcluindo(true);
    setErro(null);
    try {
      const envelope: EnvelopeSincronizacao = {
        idempotencyKey: rascunho.idempotencyKey,
        ocorrenciaId: rascunho.ocorrenciaId,
        coletadaEm: rascunho.coletadaEm,
        vistoria: {
          checklist: checklistRespondido(rascunho.checklist),
          /*
            Vazio aqui de propósito. O envelope referencia as fotos pela chave
            que o SERVIDOR devolve na autorização, e essa chave só existe
            depois do envio. A fila remonta esta lista quando sobe os arquivos;
            preencher agora seria inventar chave que não existe.
          */
          fotos: [],
          /*
            A lista só viaja quando a resposta foi SIM.

            Mandar uma lista com o item respondido "não" é contradição dentro do
            mesmo documento, e o servidor recusa (ver `vistoriaSchema`). O
            caminho normal já limpa a lista ao trocar a resposta; isto é o
            segundo fecho, para que um rascunho gravado num estado intermediário
            de uma versão anterior não vire coleta bloqueada na fila.
          */
          ...(rascunho.checklist[CHAVE_ACIONAR_ORGAO] === true
              && rascunho.orgaosParaAcionar.length > 0
            ? { orgaosParaAcionar: rascunho.orgaosParaAcionar }
            : {}),
          /*
            A COORDENADA DA VISTORIA, e ela não viajava.

            Daqui subia só `gpsPrecisaoMetros`, logo abaixo: a QUALIDADE de uma
            medida cujo VALOR ficava no aparelho. O ponto ia junto de cada
            FOTOGRAFIA, como metadado de imagem, e nunca como dado da vistoria,
            então uma vistoria sem foto subia sem coordenada nenhuma e o laudo
            imprimia o alfinete que o operador colou pelo telefone.

            Opcional, e nunca obrigatória: vistoria em vão de morro com o céu
            tapado fica sem leitura, e exigir o ponto faria a coleta ser
            recusada exatamente onde ela é mais difícil de refazer. O esquema
            compartilhado corta em seis casas (`coordenadaGravadaSchema`), que
            é o mesmo teto que o banco cobra.

            O que o servidor faz com ela é estreito e a tela obedece: é dado DA
            VISTORIA, e não corrige a coordenada da ocorrência. Ver
            `divergenciaDeCoordenada`, no alto deste arquivo.
          */
          ...(rascunho.coordenada ? { coordenada: rascunho.coordenada } : {}),
          gpsPrecisaoMetros: rascunho.gpsPrecisaoMetros,
          assinanteNome: rascunho.assinanteNome.trim(),
          // A chave do traço é resolvida pela fila, junto com as fotos: aqui
          // ainda existe só o caminho local.
          assinaturaChave: null,
          coletadaEm: rascunho.coletadaEm,
          ...(rascunho.observacoes.trim() ? { observacoes: rascunho.observacoes.trim() } : {}),
          ...contagensDoRascunho(rascunho.pessoas),
        },
      };

      /*
        OS ARQUIVOS SAO MEDIDOS AGORA, pelos bytes, e nao pelo numero gravado
        na captura.

        A vistoria 000009/2026 (15/09/2026) entrou na fila com a fotografia em
        `tamanhoBytes: 0`: o `size` do aparelho veio zerado na hora da copia e
        o zero foi adiante. Medir de novo aqui, no toque de concluir, e o que
        garante que o numero conferido abaixo e o mesmo que o dreno vai ler.
        Zero continua sendo o sinal de "o arquivo nao esta aqui", e e a
        conferencia quem o recusa, com frase propria e caminho ate a secao.
      */
      const fotos: FotoLocal[] = rascunho.fotos.map((f) => ({
        ...f, tamanhoBytes: medirArquivoNoAparelho(f.uriLocal),
      }));

      /*
        A CHAVE DA ASSINATURA E UUID, cunhada uma vez e guardada no rascunho.

        Era `${chave}-assinatura`, que nao e UUID, e o servidor recusa chave
        fora de UUID por contrato (`pedidoDeEvidenciaSchema`). Guardada, ela
        sobrevive a concluir, corrigir e concluir de novo, e o servidor
        reconhece o mesmo arquivo em vez de criar outra linha. O rascunho e
        gravado ANTES de enfileirar: se a fila recusar, a chave ja esta no
        disco para a proxima tentativa ser a mesma.
      */
      const chaveDaAssinatura = rascunho.assinaturaIdempotencyKey ?? Crypto.randomUUID();
      if (rascunho.assinaturaUri && chaveDaAssinatura !== rascunho.assinaturaIdempotencyKey) {
        await alterar({ assinaturaIdempotencyKey: chaveDaAssinatura });
      }

      /*
        A assinatura vai por fora da lista de fotos. Ela sobe pelo mesmo
        caminho, com a mesma idempotência e a mesma retomada, mas o envelope a
        guarda noutro campo: no laudo, uma é o registro fotográfico e a outra é
        o traço acima da linha de assinatura.
      */
      const assinatura: FotoLocal | undefined = rascunho.assinaturaUri
        ? {
            idempotencyKey: chaveDaAssinatura,
            uriLocal: rascunho.assinaturaUri,
            nomeArquivo: `assinatura-${rascunho.protocolo.replace("/", "-")}.png`,
            tipoConteudo: "image/png",
            tamanhoBytes: medirArquivoNoAparelho(rascunho.assinaturaUri),
            capturadaEm: new Date().toISOString(),
            legenda: "Assinatura de quem estava no local",
            ordem: rascunho.fotos.length,
          }
        : undefined;

      /*
        A CONFERENCIA COM O ESQUEMA DO SERVIDOR, antes de enfileirar.

        "Ver o que falta" responde se o agente terminou de preencher. Isto
        responde se o servidor vai aceitar, e pergunta ao MESMO esquema que a
        rota usa. Se reprovar, a vistoria NAO conclui: a lista dos campos vai
        para o cartao de progresso, com caminho ate a secao, e fica gravada no
        rascunho para sobreviver ao Android matar o aplicativo. Nada sai do
        aparelho para ser recusado na fila, onde a unica saida era descartar.
      */
      const conferencia = conferirColeta({ envelope, fotos, ...(assinatura ? { assinatura } : {}) });
      if (!conferencia.aprovada) {
        setCamposRecusados(conferencia.campos);
        await alterar({ camposRecusados: conferencia.campos });
        setMinutaAberta(false);
        irPara("progresso");
        return;
      }

      const fila = await obterFila(enderecoDaApi(), obterToken, lerIdentidade);

      /*
        A ORDEM DOS TRES PASSOS E OBRIGATORIA: enfileirar, gravar a lapide,
        apagar o rascunho. Cada inversao perde alguma coisa que ninguem
        recupera em campo.

        Apagar o rascunho antes de enfileirar apagaria a vistoria inteira se a
        fila recusasse, que e o pior desfecho possivel desta tela.

        Apagar o rascunho antes de gravar a lapide e o erro mais discreto e o
        mais caro: uma falha ao gravar a lapide deixaria a coleta na fila, o
        rascunho apagado e a tarefa parecendo intocada na lista. O toque
        seguinte abriria a segunda vistoria, que e o defeito que a lapide
        existe para impedir.

        Na ordem certa toda falha para num ponto seguro. Se a lapide falhar, o
        rascunho continua no disco; se o descarte falhar, a lapide ja barra a
        abertura. Ela esta em `concluirColetaEmOrdem`, e nao solta em tres
        linhas aqui, porque ordem sem teste e ordem que a proxima edicao
        inverte sem ninguem perceber.
      */
      await concluirColetaEmOrdem({
        enfileirar: () => fila.enfileirar(envelope, {
          protocolo: rascunho.protocolo,
          fotos,
          ...(assinatura ? { assinatura } : {}),
        }),
        registrarColeta: () => marcarColetada({
          ocorrenciaId: rascunho.ocorrenciaId,
          idempotencyKey: rascunho.idempotencyKey,
          protocolo: rascunho.protocolo,
          coletadaEm: rascunho.coletadaEm,
        }),
        descartarRascunho: () => descartarRascunho(rascunho.ocorrenciaId),
      });

      /*
        Quarenta minutos de morro terminam aqui, e o aparelho pode estar no
        bolso enquanto o agente fala com o morador. Este é o `concluido`, com a
        forma de dois toques do sistema, e não o mesmo toque curto da foto:
        "terminou" e "pegou" são fatos de tamanhos diferentes.
      */
      retornoTatil("concluido");
      setCamposRecusados([]);
      setAvisandoQueGuardou(true);
    } catch (e: unknown) {
      setErro(
        e instanceof Error
          ? `Não foi possível guardar a vistoria: ${e.message}`
          : "Não foi possível guardar a vistoria.",
      );
    } finally {
      setConcluindo(false);
    }
  }

  /*
    A espera com saída, que é metade do componente e não estava ligada.

    `Carregando` sabe declarar a demora aos seis segundos e oferecer uma porta;
    sem `aoDesistir`, a porta fecha a espera e deixa o agente numa tela que só
    diz "você parou de esperar", sem levar a lugar nenhum. Aqui a saída é a
    mesma de "Salvar e sair": volta para a lista, e nada do que estava no disco
    é tocado. O rótulo diz para onde leva, e não "parar de esperar", porque
    quem está em pé no morro quer saber o que fazer agora.
  */
  if (carregando) {
    return (
      <Carregando
        mensagem="Abrindo a vistoria"
        aoDesistir={salvarESair}
        rotuloDaSaida="Voltar para as tarefas"
      />
    );
  }

  /*
    A tarefa ainda não desceu para este aparelho.

    Tela inteira, e não uma tarja: o agente chegou aqui tocando numa
    notificação, então ele TEM sinal neste instante, e a coisa mais provável de
    ele querer é justamente baixar. A frase nomeia a causa (a lista é mais
    velha que o despacho) porque "não está guardada neste aparelho" sugere
    defeito, e defeito é o que faz o agente ligar para a coordenação em vez de
    tocar no botão que resolve.

    Vem ANTES da checagem de erro para que uma falha de rede na tentativa
    anterior não substitua esta tela pela tarja vermelha: o aviso da falha entra
    aqui dentro, ao lado do botão de tentar de novo.
  */
  if (faltaBaixar) {
    return (
      <ScrollView contentContainerStyle={{ padding: espaco.e4, gap: espaco.e4, paddingBottom: recuoDoMenu }}>
        <Vazio
          titulo="Esta tarefa ainda não está neste aparelho"
          descricao={
            "Ela foi despachada depois da última vez que você baixou a lista. "
            + "Com sinal, baixe agora e ela abre em seguida."
          }
        />
        {falhaAoBaixar && (() => {
          const frase = comoContarAFalha(
            falhaAoBaixar,
            falhaAoBaixar === "sem-sinal"
              ? "Procure sinal e tente de novo."
              : "Tente de novo em alguns minutos.",
          );
          return (
            <Aviso
              /* Sessão encerrada é fim de linha, e não alerta: nada desce até
                 o agente agir. Os outros três passam sozinhos ou com o tempo. */
              tom={ehFimDeLinha(falhaAoBaixar) ? "perigo" : "alerta"}
              /* O título só quando ele diz algo que o corpo não começa dizendo:
                 "Sem sinal para atualizar" em cima de "Sem sinal para
                 atualizar. Procure sinal..." é a mesma frase duas vezes. */
              {...(frase.detalhe.startsWith(frase.resumo) ? {} : { titulo: frase.resumo })}
              /* Só a sessão encerrada traz ato, porque só ela tem um ato que
                 resolve. O acesso suspenso NÃO manda entrar de novo: entrar de
                 novo dá a mesma recusa, e sair apagaria a identidade que
                 carimba a coleta. */
              {...(falhaAoBaixar === "sessao-encerrada"
                ? {
                  acao: {
                    titulo: "Sair e entrar de novo",
                    onPress: () => void sairEEntrarDeNovo(),
                    descricao: "Sair da conta e entrar de novo com o seu email e a sua senha",
                    testID: "sair-e-entrar-de-novo",
                  },
                }
                : {})}
            >
              {frase.detalhe}
            </Aviso>
          );
        })()}
        <LinhaDeAcoes
          testID="acoes-de-baixar"
          acoes={[
            {
              titulo: "Baixar tarefas agora",
              onPress: () => void baixarEAbrir(),
              carregando: baixando,
              testID: "baixar-para-abrir",
            },
            {
              titulo: "Voltar para as tarefas",
              tipo: "secundario",
              /*
                `salvarESair`, e não `router.back()` cru: quem chega aqui pela
                notificação chega sem pilha atrás, e `back()` sem histórico
                não faz nada, no botão que existe para provar que dá para sair.
              */
              onPress: salvarESair,
              testID: "voltar-das-tarefas",
            },
          ]}
        />
      </ScrollView>
    );
  }

  /*
    A vistoria não abriu, e esta é a tela disso.

    Antes era uma tarja vermelha órfã dentro de um `View` com recuo: sem
    título, sem ícone, sem nenhuma indicação do que fazer e sem saída. Era a
    tela menos acabada do aplicativo, e ela aparece justamente no pior momento,
    que é o agente tocando na tarefa com alguém esperando na porta.

    O desenho é o mesmo do estado de "ainda não baixada", logo acima, e isso é
    deliberado: as duas são a mesma pergunta ("por que isto não abriu?") com
    respostas diferentes, e responder as duas com formatos diferentes ensina o
    agente a não reconhecer nenhuma das duas.

    As duas saídas, nesta ordem: tentar de novo (quase sempre resolve, porque a
    falha típica é o banco local ocupado por uma gravação da fila) e voltar,
    que é o que salva quem está preso aqui.
  */
  /*
    A condição é "não há formulário para desenhar", e não "não há ocorrência".

    Escrita como `erro && !ocorrencia`, ela deixava um buraco de tela BRANCA, e
    ele é fácil de alcançar: `carregarDoDisco` grava a ocorrência ANTES de ler o
    rascunho, a lápide e o catálogo, e essas três leituras vão juntas num
    `Promise.all`. Se o SQLite estiver ocupado (a fila grava na mesma base, em
    aparelho de entrada), o `catch` acende o erro com a ocorrência já no estado
    e o rascunho ainda nulo. Daí em diante: não é carregando, não é
    `faltaBaixar`, não é `erro && !ocorrencia`, não é lápide, e o último guarda
    devolve `null`. Tela branca, sem uma palavra e sem saída, no toque em que o
    agente chega na porta.

    `!rascunho && !jaColetada` é o mesmo teste dito pelo lado certo: só desenha
    a tela de falha quando não há formulário nem lápide para mostrar. As seis
    falhas que acontecem DENTRO da coleta (GPS, câmera, mapa, conclusão) têm
    rascunho de pé e continuam indo para a tarja, que é onde elas devem ir.
  */
  if (erro && !rascunho && !jaColetada) {
    return (
      <ScrollView contentContainerStyle={{ padding: espaco.e4, gap: espaco.e4, paddingBottom: recuoDoMenu }}>
        <Vazio
          titulo="Não deu para abrir esta vistoria"
          descricao={erro}
          icone={<IconePerigo cor={tema.perigoTexto} tamanho={icone.vazio} />}
        />
        <LinhaDeAcoes
          testID="acoes-de-falha-ao-abrir"
          acoes={[
            {
              titulo: "Tentar de novo",
              onPress: () => { setCarregando(true); void carregarDoDisco(); },
              testID: "tentar-abrir-de-novo",
            },
            {
              titulo: "Voltar para as tarefas",
              tipo: "secundario",
              onPress: salvarESair,
              testID: "voltar-da-falha",
            },
          ]}
        />
      </ScrollView>
    );
  }

  /*
    A ocorrencia ja foi coletada neste aparelho, e por isso esta tela nao e o
    formulario.

    Nao ha formulario nenhum montado por baixo: a decisao de abertura impediu a
    criacao do rascunho la em cima. Isso importa, porque um formulario montado
    "so para mostrar" seria um formulario que grava no disco no primeiro toque,
    e ai a coleta nova ja teria comecado antes de qualquer confirmacao.

    Revistoriar continua sendo possivel, e de proposito: a mesma ocorrencia pode
    precisar de segunda vistoria depois de uma chuva nova, e a migracao 009 do
    banco trata disso. O que nao pode e a segunda vistoria acontecer por
    acidente de um toque numa lista velha. Por isso a saida existe, fica em
    segundo lugar, e passa por confirmacao.
  */
  if (ocorrencia && jaColetada) {
    return (
      <ScrollView contentContainerStyle={{ padding: espaco.e4, gap: espaco.e4, paddingBottom: recuoDoMenu }}>
        {/*
          A falha de "fazer nova vistoria" acontece AQUI, e até agora não tinha
          onde aparecer: `refazerVistoria` acendia `erro` e esta tela não lia
          `erro` em lugar nenhum. Ver o cabeçalho de `TarjaDeErro`.
        */}
        {erro && <TarjaDeErro mensagem={erro} aoFechar={() => { setErro(null); }} />}
        <Cartao>
          <View style={{ flexDirection: "row", alignItems: "center", gap: espaco.e2 }}>
            <Txt variante="corpoP" mono negrito>{ocorrencia.protocolo}</Txt>
            <View style={{ flex: 1 }} />
            <SeloSeveridade severidade={ocorrencia.severidade} />
          </View>
          <Txt variante="h3">{ROTULO_TIPO_COBRADE[ocorrencia.tipo]}</Txt>
          <Txt variante="corpoP">{ocorrencia.endereco}</Txt>
        </Cartao>

        {/*
          O estado da coleta anterior num selo, e não só na frase.

          A frase abaixo diz a mesma coisa, e ela continua ali para quem lê. O
          selo existe para quem NÃO lê: o agente que abriu esta tela por engano,
          de relance, no meio da rua, precisa distinguir "já subiu" de "ainda
          está no aparelho" antes de decidir se vale a pena refazer.
        */}
        {/*
          O símbolo é DESENHO e não caractere. Eram "✓" e "↑" tipográficos,
          que herdam o peso e a altura da fonte em vez do traço do conjunto, e
          que no aparelho ficavam com dois pesos diferentes lado a lado. O
          `Chip` passou a aceitar um nó, então o selo usa os mesmos ícones do
          resto do produto. A palavra continua ali: o desenho é a segunda
          pista, nunca a única.

          A COR do desenho vem do chip, e não daqui. Enquanto vinha daqui
          (`cor={tema.okTexto}` escrito ao lado de `tom="ok"`), esta linha era
          uma segunda cópia do mapa de cores do `Chip`, e o dia em que o tom
          "ok" mudasse deixaria este ícone com a cor antiga, sem nada acusar.
        */}
        <Chip
          texto={jaColetada.situacao === "enviada" ? "Enviada" : "Na fila de envio"}
          simbolo={(cor) => (jaColetada.situacao === "enviada"
            ? <IconeSucesso cor={cor} tamanho={icone.inline} />
            : <IconeEnvio cor={cor} tamanho={icone.inline} />)}
          tom={jaColetada.situacao === "enviada" ? "ok" : "neutro"}
          descricao={
            jaColetada.situacao === "enviada"
              ? "A vistoria já foi enviada ao servidor"
              : "A vistoria está na fila de envio deste aparelho"
          }
        />

        <Aviso tom="info">
          Esta ocorrência já foi coletada neste aparelho.
          {jaColetada.situacao === "enviada"
            ? " A vistoria já foi enviada ao servidor."
            : " A vistoria está na fila de envio e sobe assim que houver sinal."}
        </Aviso>

        <Txt variante="corpoP" discreto>
          A tarefa continua aparecendo na sua lista porque ela só sai de lá
          quando o aparelho conseguir falar com o servidor. Isso pode demorar
          horas sem sinal, e não significa que a vistoria se perdeu.
        </Txt>

        <Botao
          titulo="Ver na fila de envio"
          onPress={() => router.push("/(agente)/fila")}
        />

        {/*
          A saida deliberada. Segundo lugar, tipo secundario e confirmacao, os
          tres pela mesma razao: ela e legitima e e rara, e o custo de errar
          para o lado dela e um segundo laudo do mesmo protocolo, que o
          coordenador so descobre quando ja assinou um dos dois.
        */}
        <Botao
          titulo="Fazer nova vistoria desta ocorrência"
          tipo="secundario"
          onPress={() => { setPerguntandoNovaVistoria(true); }}
        />

        <Dialogo
          aberto={perguntandoNovaVistoria}
          titulo="Fazer nova vistoria?"
          texto={
            "A vistoria que você já fez continua guardada e vai ser enviada do " +
            "mesmo jeito. Esta será uma SEGUNDA vistoria da mesma ocorrência, e " +
            "as duas vão aparecer no protocolo."
          }
          /*
            "Cancelar" some, e no lugar dele entra o que a recusa realmente faz.
            Num diálogo lido com pressa, "Cancelar" é ambíguo do jeito mais caro
            possível: cancelar a nova vistoria, ou cancelar a que já foi feita?
          */
          acao={{
            rotulo: "Fazer nova vistoria",
            destrutiva: true,
            aoTocar: () => void refazerVistoria(),
          }}
          recusa={{ rotulo: "Manter só a vistoria que já fiz" }}
          aoFechar={() => { setPerguntandoNovaVistoria(false); }}
        />
      </ScrollView>
    );
  }

  if (!ocorrencia || !rascunho) return null;

  /*
    A CONCLUSÃO, e por que ela é uma tela e não mais um diálogo.

    Ela era o mesmo `Dialogo` de "Sair da conta?": duas frases cinzas e um
    botão, com o desenho de uma pergunta de rotina. Quarenta minutos de
    trabalho no morro, uma casa interditada, a assinatura de quem mora nela, e
    o aplicativo respondia com a caixa de confirmação mais barata que ele tem.

    Três coisas mudam, e nenhuma é enfeite:

    1. **É tela inteira, e vem antes de qualquer outro `return`.** A conclusão
       acontece com a MINUTA aberta, e o diálogo montado só no formulário
       deixava a coleta entrar na fila sem nada aparecer, com o agente olhando
       a minuta e tocando em "Concluir vistoria" de novo. Sendo o primeiro
       `return`, ela cobre os dois caminhos por construção, e não por lembrança.
    2. **Ela RESUME o que foi guardado.** A dúvida de quem desce o morro não é
       "deu certo?", é "foi tudo?". Fotografias, assinatura e checklist ditos em
       número respondem isso sem abrir a fila.
    3. **Ela tem o clímax**, com a guarda de origem escrita lá em cima.

    As duas saídas continuam nomeando o destino em vez de dizer "Entendi": quem
    acaba de descer o morro quer saber o que fazer agora.
  */
  if (avisandoQueGuardou) {
    const quantasFotos = rascunho.fotos.length;
    const respondidos = CHECKLIST_VISTORIA.filter((i) => i.chave in rascunho.checklist).length;

    return (
      <ScrollView
        testID="vistoria-guardada"
        contentContainerStyle={{
          flexGrow: 1,
          padding: espaco.e5,
          paddingBottom: recuoDoMenu,
          gap: espaco.e4,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: tema.fundo,
        }}
      >
        {/*
          O emblema é DECORAÇÃO do título que vem logo abaixo: anunciá-lo de
          novo faria o leitor de tela dizer "concluído" duas vezes seguidas.
        */}
        <Animated.View
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          testID="emblema-da-conclusao"
          style={{
            width: espaco.e8 + espaco.e5,
            height: espaco.e8 + espaco.e5,
            borderRadius: raio.pilula,
            backgroundColor: tema.okFundo,
            alignItems: "center",
            justifyContent: "center",
            transform: [{ scale: emblemaDaConclusao }],
          }}
        >
          <IconeSucesso cor={tema.okTexto} tamanho={icone.vazio} />
        </Animated.View>

        <Txt variante="h1" alinhamento="center">Vistoria guardada</Txt>
        <Txt variante="corpoP" mono negrito>{ocorrencia.protocolo}</Txt>

        {/*
          O resumo em três linhas com ícone, e não um parágrafo. Cada linha
          responde uma pergunta que o agente faria à fila de envio se não
          estivesse escrita aqui.
        */}
        {/*
          O RESUMO PASSA A SER UM OBJETO, e não um retângulo com fundo.

          Ele era um `View` com `elevacao(tema).cartao` copiado à mão, ou seja,
          a superfície de um cartão comum no momento mais alto do produto. A
          emenda de 2026-08-20 do `CLAUDE.md` autoriza elevação com mais
          liberdade exatamente aqui ("momentos de confirmação"), e `Cartao`
          passou a expor isso como nível em vez de deixar cada tela escrever a
          própria sombra. Quarenta minutos de morro terminam nesta peça: ela é
          a única que flutua nesta tela, e é a única que deve.
        */}
        <View style={{ alignSelf: "stretch" }}>
        <Cartao nivel="flutuante">
          <View style={{ flexDirection: "row", alignItems: "center", gap: espaco.e3 }}>
            <IconeChecklist cor={tema.textoDiscreto} tamanho={icone.rotulo} />
            <Txt variante="corpoP">
              {respondidos} de {CHECKLIST_VISTORIA.length} itens do checklist respondidos
            </Txt>
          </View>
          <View style={{ flexDirection: "row", alignItems: "center", gap: espaco.e3 }}>
            <IconeFoto cor={tema.textoDiscreto} tamanho={icone.rotulo} />
            <Txt variante="corpoP">
              {quantasFotos === 1 ? "1 fotografia guardada" : `${quantasFotos} fotografias guardadas`}
            </Txt>
          </View>
          <View style={{ flexDirection: "row", alignItems: "center", gap: espaco.e3 }}>
            <IconeAssinatura cor={tema.textoDiscreto} tamanho={icone.rotulo} />
            <View style={{ flex: 1 }}>
              <Txt variante="corpoP">
                Assinada por {rascunho.assinanteNome.trim()}
              </Txt>
            </View>
          </View>
        </Cartao>
        </View>

        {/*
          O invólucro que estica, e ele não é enfeite.

          Esta tela centraliza tudo (`alignItems: "center"`), e nesse arranjo
          quem não estica fica com a largura do próprio texto. O cartão do
          resumo e a linha de ações já pediam `alignSelf: "stretch"`; este aviso
          não pedia, e por isso era o único bloco da tela com outra largura,
          entre dois que iam de borda a borda.
        */}
        <View style={{ alignSelf: "stretch" }}>
          <Aviso tom="info" titulo="Ela sobe sozinha">
            Nada depende de sinal agora. A coleta está na fila de envio deste
            aparelho e sobe assim que houver rede, mesmo com o aplicativo fechado.
          </Aviso>
        </View>

        <View style={{ alignSelf: "stretch" }}>
          <LinhaDeAcoes
            testID="acoes-depois-de-guardar"
            acoes={[
              {
                titulo: "Voltar para a lista de tarefas",
                testID: "voltar-depois-de-guardar",
                onPress: () => { setAvisandoQueGuardou(false); salvarESair(); },
              },
              {
                titulo: "Ver na fila de envio",
                tipo: "secundario",
                testID: "ver-na-fila-depois-de-guardar",
                onPress: () => { setAvisandoQueGuardou(false); router.push("/(agente)/fila"); },
              },
            ]}
          />
        </View>
      </ScrollView>
    );
  }

  /*
    Uma lista so, calculada fora da tela.

    Antes eram duas: a condicao do botao (`obrigatoriosFeitos && temFoto &&
    temAssinante`) e a frase do aviso, escrita a mao trezentas linhas abaixo com
    os mesmos tres itens. As duas esqueceram a assinatura, e `temAssinante`
    olhava o campo de TEXTO com o nome, nunca o traco.

    Consequencia medida em producao em 09/09/2026: as tres vistorias reais do
    piloto de Florianopolis chegaram ao servidor com `assinatura_chave` nula. O
    agente desenhou e o botao ja estava liberado.
  */
  const faltas = faltaParaConcluir(
    {
      checklist: rascunho.checklist,
      orgaosParaAcionar: rascunho.orgaosParaAcionar,
      quantasFotos: rascunho.fotos.length,
      assinanteNome: rascunho.assinanteNome,
      assinaturaUri: rascunho.assinaturaUri ?? null,
    },
    CHECKLIST_OBRIGATORIO,
  );
  const podeConcluir = faltas.length === 0;

  /*
    O mesmo estado visto pelo outro lado: o que já está FEITO.

    `faltaParaConcluir` não tem como responder isso, porque ela devolve só o
    que falta, e o agente precisa saber quanto do trabalho já entrou. As duas
    listas ficam amarradas por um caso de teste, e não por disciplina: nenhum
    requisito pendente se e somente se `faltas` está vazia. Barra cheia com
    botão travado é o defeito exato que ele guarda.
  */
  const requisitos = requisitosDeConclusao({
    checklist: rascunho.checklist,
    orgaosParaAcionar: rascunho.orgaosParaAcionar,
    quantasFotos: rascunho.fotos.length,
    assinanteNome: rascunho.assinanteNome,
    assinaturaUri: rascunho.assinaturaUri ?? null,
  });
  const feitos = requisitos.filter((r) => r.feito).length;

  if (minutaAberta) {
    /*
      A minuta é uma SOBREPOSIÇÃO, e não uma rota.

      A câmera nesta mesma tela já faz assim, e a razão é a mesma: `concluir()`
      precisa estar em escopo. Levar a minuta para outra rota significaria ou
      duplicar a conclusão, ou devolver um sinal pela navegação para que esta
      tela conclua depois, e as duas saídas colocam a gravação da vistoria a
      depender de estado de navegação. Numa tela em que perder o rascunho
      custa outra subida ao morro, isso não se faz por elegância de rotas.

      A minuta é montada AQUI, na hora, do rascunho que está no disco. Nenhuma
      chamada, nenhum dado que não esteja no aparelho.
    */
    const minuta = montarMinuta({
      organizacao: {
        nome: identidade?.organizacaoNome ?? "Defesa Civil municipal",
        municipio: identidade?.municipio ?? "",
        uf: identidade?.uf ?? "",
      },
      ocorrencia: {
        protocolo: ocorrencia.protocolo,
        tipo: ocorrencia.tipo,
        severidade: ocorrencia.severidade,
        endereco: ocorrencia.endereco,
        pontoReferencia: ocorrencia.ponto_referencia,
        // A coordenada da MINUTA é a que o agente capturou no local, e não a
        // que veio da abertura: é ela que vai para o laudo.
        latitude: rascunho.coordenada?.lat ?? ocorrencia.latitude,
        longitude: rascunho.coordenada?.lng ?? ocorrencia.longitude,
        solicitanteNome: ocorrencia.solicitante_nome,
        criadoEm: ocorrencia.criado_em,
        descricao: ocorrencia.descricao,
        vulnerabilidadePresente: ocorrencia.vulnerabilidade_presente,
        vulnerabilidadeDescricao: ocorrencia.vulnerabilidade_descricao,
      },
      vistoria: {
        checklist: checklistRespondido(rascunho.checklist),
        observacoes: rascunho.observacoes,
        assinanteNome: rascunho.assinanteNome.trim(),
        gpsPrecisaoMetros: rascunho.gpsPrecisaoMetros,
        coletadaEm: rascunho.coletadaEm,
        agenteNome: identidade?.nome ?? "não identificado",
        agenteMatricula: identidade?.matricula ?? "não informada",
        pessoas: contagensDoRascunho(rascunho.pessoas),
        /*
          Os órgãos entram na minuta que o agente lê em voz alta na porta da
          casa, e não só no envelope. É ali que quem está presente ouve "vamos
          acionar a concessionária de energia" e corrige se estiver errado, que é
          a única chance de corrigir antes de o laudo virar documento.
        */
        orgaosParaAcionar: rascunho.orgaosParaAcionar,
      },
      quantasFotos: rascunho.fotos.length,
    });

    return (
      <View style={{ flex: 1, backgroundColor: tema.fundo }}>
        <MinutaDoLaudo minuta={minuta} />
        {/*
          As duas ações ficam FORA da rolagem, presas no rodapé.

          A minuta é longa e o agente lê com alguém esperando na porta. Se o
          botão de concluir estivesse no fim do texto, ele rolaria o documento
          inteiro de novo só para achá-lo, e quem está lendo em voz alta perde
          a linha. Voltar vem primeiro porque é a ação reversível.
        */}
        <View
          testID="barra-da-minuta"
          style={{
            padding: espaco.e4,
            /* Acima da pílula: o vão medido do menu, e não a área segura. */
            paddingBottom: recuoDoMenu,
            borderTopWidth: borda.fio, borderTopColor: tema.borda,
            backgroundColor: tema.superficie,
          }}
        >
          <LinhaDeAcoes
            testID="acoes-da-minuta"
            acoes={[
              {
                titulo: "Corrigir",
                tipo: "secundario",
                onPress: () => setMinutaAberta(false),
                descricao: "Corrigir a vistoria, voltando ao formulário",
                testID: "corrigir-a-minuta",
              },
              {
                titulo: "Concluir vistoria",
                onPress: () => void concluir(),
                carregando: concluindo,
                testID: "concluir-vistoria",
              },
            ]}
          />
        </View>
      </View>
    );
  }

  if (cameraAberta) {
    return (
      <View style={{ flex: 1, backgroundColor: visor.fundo }}>
        <CameraView ref={cameraRef} style={{ flex: 1 }} facing="back" />
        <View style={{
          padding: espaco.e5, gap: espaco.e3,
          backgroundColor: visor.fundo, alignItems: "center",
        }}>
          {/*
            Disparador redondo e grande, no lugar onde o polegar já está. Um
            botão de tamanho normal aqui seria errado a cada duas fotos, e cada
            erro é uma foto perdida com o morador esperando.
          */}
          <Tocavel
            accessibilityRole="button"
            onPress={() => void fotografar()}
            desabilitado={fotografando}
            accessibilityLabel="Tirar a fotografia"
            /*
              As duas opacidades daqui eram números soltos, 0,5 e 0,8, escritos
              à mão no único lugar do aplicativo onde o dedo dispara algo
              irreversível. Agora saem de `opacidade`, pelo `Tocavel`: o
              desabilitado é `inativo` e o toque é `aoToque`, os mesmos do botão
              que fica logo abaixo, na mesma tela.
            */
            estilo={{
              width: 84, height: 84, borderRadius: raio.pilula,
              backgroundColor: visor.obturador,
              /*
                O anel do obturador não é contorno de superfície. Ele tem a
                espessura que uma câmera de telefone desenha, junto com os 84
                pontos de diâmetro logo acima, e não a de um cartão:
                `borda.marca` (4) é a faixa que classifica um cartão, e usá-la
                aqui amarraria o desenho do obturador à régua de contorno do
                produto, que muda por outra razão. Mesma família de exceção que
                `visor`, na linha de cima: o que está desenhado aqui é uma
                câmera, e não uma superfície deste aplicativo.
              */
              /* design-system: excecao */
              borderWidth: 5, borderColor: tema.destaque,
            }}
          >
            <View />
          </Tocavel>
          {/*
            "Cancelar" saiu, e o rótulo passa a dizer o que acontece.

            É a mesma regra que o `Dialogo` deste produto já escreve e que esta
            mesma tela já aplicou duas vezes ("Manter só a vistoria que já fiz",
            "Manter a fotografia"): quem lê em pé, na chuva, lê o botão e não o
            título, e "Cancelar" aqui é ambíguo do jeito caro (cancelar a foto,
            ou cancelar a vistoria?).
          */}
          <Botao
            titulo="Voltar sem fotografar"
            tipo="secundario"
            onPress={() => setCameraAberta(false)}
            testID="fechar-a-camera"
            estilo={{ alignSelf: "stretch" }}
          />
        </View>
      </View>
    );
  }

  /*
    O prazo, dentro do formulário.

    Ele existia só na lista de tarefas. Uma vez dentro da vistoria, o agente
    perdia de vista exatamente a informação que decide se ele para para
    fotografar mais uma parede ou se desce para a próxima ocorrência.

    A conta é a mesma da lista, e vem do pacote compartilhado de propósito:
    duas contagens regressivas escritas separadamente divergem, e o dia em que
    divergirem a lista vai dizer uma coisa e a tela aberta outra.

    O selo diz a PALAVRA junto com a cor. Âmbar e vermelho são
    indistinguíveis sob sol forte na tela do aparelho, e para quem não separa
    as duas cores eles nunca foram distinguíveis.
  */
  const prazo = quantoFalta(ocorrencia.prazo_em, agora);
  /*
    A DATA entra junto com o relativo, e não no lugar dele.

    "Vence em 9h" responde "tenho tempo?"; "10/09, 12:30" responde "cai dentro
    do meu turno?". As duas perguntas são feitas no mesmo instante por quem está
    decidindo se para para fotografar mais uma parede, e o agente é justamente
    quem está mais longe de um calendário.
  */
  /*
    O "! " que abria o rótulo era um caractere tipográfico fazendo trabalho de
    ícone, e ele era o mesmo "!" que o aviso de alerta usa: dois sinais iguais
    para duas coisas diferentes na mesma tela. Agora o prazo estourado leva o
    desenho do relógio vencido, que tem forma própria, e a PALAVRA "vencido"
    continua no texto, porque o ícone é a segunda pista e nunca a única.
  */
  const rotuloDoPrazo = ocorrencia.prazo_em
    ? "Prazo "
      + prazo.texto.charAt(0).toLowerCase() + prazo.texto.slice(1)
      + ` (${dataDoPrazo(ocorrencia.prazo_em)})`
    : prazo.texto;
  /*
    Só a COR do texto, e não mais um par de fundo e cor.

    O fundo saiu junto com a pílula (ver a R1 da régua, aplicada no cabeçalho
    logo abaixo). Deixar o par montado com uma das metades sem uso seria deixar
    escrito, no código, que o fundo ainda é uma decisão viva: a próxima pessoa
    que precisasse destacar o prazo acharia `coresDoPrazo.fundo` pronto e
    devolveria a pílula sem saber que ela tinha sido tirada de propósito.
  */
  const corDoPrazo = prazo.vencido
    ? tema.perigoTexto
    : prazo.atrasado
      ? tema.alertaTexto
      : tema.textoDiscreto;

  const temCoordenada = ocorrencia.latitude != null && ocorrencia.longitude != null;

  /*
    OS DOIS PONTOS DESTA VISTORIA, e eles são dois de verdade.

    `pontoDoImovel` é onde a coordenação disse que o imóvel está: quase sempre
    um alfinete colado por quem estava ao telefone, com o relato de outra
    pessoa no ouvido. `pontoDoAgente` é o que o aparelho mediu com o agente em
    pé no local.

    A tela mostra os dois e não escolhe entre eles, porque escolher aqui seria
    decidir, dentro de um formulário, um ato que exige motivo escrito e pessoa
    responsável. Ver `divergenciaDeCoordenada`.
  */
  const pontoDoImovel = temCoordenada
    ? comoPonto({ lat: ocorrencia.latitude!, lng: ocorrencia.longitude! })
    : null;
  const pontoDoAgente = comoPonto(rascunho.coordenada);
  /*
    O que o mapa centra. O ponto da coordenação quando ele existe; na ausência
    dele, o do agente, que aí é o único ponto que alguém no mundo conhece.
    Sem nenhum dos dois não há mapa: um mapa vazio não é menos mapa, é uma
    afirmação falsa sobre onde a casa fica.
  */
  const centroDoMapa = pontoDoImovel ?? pontoDoAgente;
  const divergencia = divergenciaDeCoordenada({
    daCoordenacao: pontoDoImovel,
    doAgente: pontoDoAgente,
    precisaoMetros: rascunho.gpsPrecisaoMetros,
  });


  return (
    <View style={{ flex: 1, backgroundColor: tema.fundo }}>
      {/*
        A TARJA DE ERRO SAI DE DENTRO DA ROLAGEM.

        Ela é o destino de seis falhas diferentes (permissão de localização,
        GPS, câmera, aplicativo de mapas, nova vistoria e conclusão) e morava
        no topo do conteúdo rolável. O formulário passa de dois mil pontos: um
        erro de GPS disparado no cartão da localização era desenhado onde
        ninguém estava olhando, e para o agente o toque simplesmente não fazia
        nada. Ele tocava de novo, e de novo.

        Fora da rolagem, ela fica presa no alto da TELA, e por isso aparece
        onde quer que o dedo esteja. Em fluxo e não sobreposta, de propósito: o
        conteúdo desce em vez de ser coberto, e nenhum campo some atrás dela.

        Com botão de fechar, porque tarja que não sai é tarja que o agente
        aprende a ignorar, e a próxima que importar ele também ignora.
      */}
      {erro && <TarjaDeErro mensagem={erro} aoFechar={() => { setErro(null); }} />}

    <ScrollView
      ref={rolagem}
      testID="formulario-da-vistoria"
      /*
        Desligado enquanto o dedo desenha a assinatura. Os callbacks de
        captura do PanResponder ja ganham a disputa pelo gesto; isto remove a
        disputa. So vira duas vezes por traco, no inicio e no fim.
      */
      scrollEnabled={!desenhando}
      contentContainerStyle={{ padding: espaco.e4, gap: espaco.e4, paddingBottom: recuoDoMenu + espaco.e4 }}
    >
      <Cartao>
        <View style={{ flexDirection: "row", alignItems: "center", gap: espaco.e2 }}>
          <Txt variante="corpoP" mono negrito>{ocorrencia.protocolo}</Txt>
          <View style={{ flex: 1 }} />
          <SeloSeveridade severidade={ocorrencia.severidade} />
        </View>
        <Txt variante="h3">{ROTULO_TIPO_COBRADE[ocorrencia.tipo]}</Txt>
        <Txt variante="corpoP">{ocorrencia.endereco}</Txt>
        {/*
          A referência vem logo abaixo do endereço, e não no fim do cartão.

          É com ela que o agente acha a casa quando a rua não tem placa, e ele
          lê isso dentro do carro, no morro, muitas vezes sem sinal. Enterrá-la
          depois do relato seria escondê-la exatamente de quem precisa dela.
        */}
        {ocorrencia.ponto_referencia && (
          <Txt variante="corpoP" discreto>
            Referência: {ocorrencia.ponto_referencia}
          </Txt>
        )}

        <View style={{ flexDirection: "row", alignItems: "center", gap: espaco.e2 }}>
          {/*
            O PRAZO PERDEU O FUNDO CHEIO, e passou a ser ícone mais palavra.

            Ele era uma pílula vermelha (ou âmbar) a duas linhas de distância da
            pílula de severidade, que também é vermelha ou âmbar, dentro do
            mesmo cartão, e com um terceiro bloco âmbar de vulnerabilidade logo
            abaixo. Três blocos de cor para três fatos diferentes, todos no
            mesmo volume: é a R1 da régua sendo furada três vezes no cabeçalho
            da tela mais longa do produto.

            Quem fica com o único fundo cheio do cartão é a SEVERIDADE, pela R2:
            ela é a gravidade do fato, é a mesma marca em todas as telas do
            produto e é a única das três cujo par de cores é medido, um a um, no
            portão de contraste. O prazo continua inteiro, com o relógio vencido
            e a palavra "vencido" no texto, na cor do tom, que é exatamente como
            a lista de tarefas já desenha o prazo dela. Duas telas que falam do
            mesmo prazo passam a falar do mesmo jeito.
          */}
          {prazo.atrasado && (
            <IconePrazoVencido cor={corDoPrazo} tamanho={icone.rotulo} />
          )}
          {/*
            O TEXTO DO PRAZO GANHOU ONDE QUEBRAR, e antes não tinha.

            Ele morava numa linha interna sem `flex`, dentro de outra linha com
            `flexWrap` que embrulhava um filho só, ou seja, o `flexWrap` não
            tinha o que embrulhar e o texto não tinha o que ceder. O rótulo
            inteiro ("Prazo vence em 1h30 (10/09, 12:30)") com o relógio vencido
            ao lado passa da largura do cartão em aparelho estreito, e o que
            acontecia era o texto transbordar para fora do cartão em vez de
            quebrar dentro dele.
          */}
          <View style={{ flex: 1 }}>
            <Txt variante="corpoP" peso={peso.negrito} cor={corDoPrazo}>
              {rotuloDoPrazo}
            </Txt>
          </View>
        </View>

        {/*
          As duas ações da cabeça da tela: chegar lá, e sair daqui.

          Ficam no alto, e não no fim do rolamento. "Abrir no mapa" é lido
          dentro do carro, antes de a vistoria começar, e procurá-lo depois de
          rolar o formulário inteiro seria escondê-lo de quem só precisa dele
          antes de sair. "Salvar e sair" fica junto pelo motivo oposto: no alto
          ele exige um gesto deliberado, enquanto uma barra fixa embaixo do
          polegar é a escotilha de fuga que produz vistoria pela metade.
        */}
        {/*
          "ABRIR NO MAPA" DEIXOU DE SER UM BOTÃO DESENHADO À MÃO.

          Era um `Tocavel` com `flex`, `minHeight`, recuo, raio e contorno
          escritos aqui, ou seja, um botão secundário copiado linha a linha ao
          lado de um `Botao tipo="secundario"` de verdade. Os dois pareciam
          iguais por coincidência, e divergiam no recuo (`espaco.e3` contra
          `espaco.e4`) e em toda decisão futura que o `Botao` tomasse sozinho.
          Agora ele é um `Botao` com `icone`, e o par inteiro é uma
          `LinhaDeAcoes`, que decide se eles cabem lado a lado em vez de este
          arquivo apostar que sim.

          E o toque deixou de sair do aplicativo direto: ele abre a folha com as
          três respostas. Ver `EscolhaDeMapa`.
        */}
        {temCoordenada ? (
          <LinhaDeAcoes
            testID="acoes-do-cabecalho"
            acoes={[
              {
                titulo: "Abrir no mapa",
                /*
                  Realce: chegar lá é o primeiro ato da vistoria, e o par do
                  cabeçalho passa a dizer, pela forma, qual dos dois faz o
                  trabalho andar e qual faz o agente sair.
                */
                tipo: "realce",
                onPress: () => { setEscolhendoMapa(true); },
                descricao: `Abrir no mapa: escolher como chegar até ${ocorrencia.endereco}`,
                testID: "abrir-no-mapa",
                /*
                  O alfinete era desenhado à mão neste arquivo, com o mesmo
                  traçado que `ui/icones.tsx` já tinha. Dois desenhos iguais em
                  dois lugares é como o produto inteiro acabou com três ícones:
                  quem precisa de um não acha o que existe e desenha o seu.
                */
                icone: (cor) => <IconeLocalizacao cor={cor} tamanho={icone.rotulo} />,
              },
              {
                titulo: "Salvar e sair",
                tipo: "secundario",
                onPress: salvarESair,
                descricao: "Salvar e sair, voltando para a lista de tarefas sem perder o que já foi preenchido",
                testID: "salvar-e-sair",
              },
            ]}
          />
        ) : (
          <Botao
            titulo="Salvar e sair"
            tipo="secundario"
            onPress={salvarESair}
            descricao="Salvar e sair, voltando para a lista de tarefas sem perder o que já foi preenchido"
            testID="salvar-e-sair"
          />
        )}

        {/*
          O RETORNO DE "COPIADO", em palavra e não só na vibração.

          Copiar não muda nada na tela, e sem isto o agente toca de novo, e de
          novo, sem saber se pegou. Região viva porque ela aparece sem ninguém
          ter mudado de tela, e o mesmo desenho da fotografia recém guardada
          mais abaixo: duas confirmações do mesmo tipo, na mesma tela, precisam
          ser lidas como a mesma coisa.
        */}
        {coordenadaCopiadaEm !== null && (
          <View
            accessibilityLiveRegion="polite"
            testID="coordenada-copiada"
            style={{ flexDirection: "row", alignItems: "center", gap: espaco.e2 }}
          >
            <IconeSucesso cor={tema.okTexto} tamanho={icone.rotulo} />
            <View style={{ flex: 1 }}>
              <Txt variante="corpoP" peso={peso.forte} cor={tema.okTexto}>
                Coordenada copiada
              </Txt>
            </View>
          </View>
        )}

        {!temCoordenada && (
          <Txt variante="legenda" discreto>
            Esta ocorrência chegou sem coordenada. Use o endereço e a
            referência para chegar.
          </Txt>
        )}
        <Separador />
        <Txt variante="legenda" discreto>Relato recebido</Txt>
        <Txt variante="corpoP">{ocorrencia.descricao}</Txt>
        {/*
          A vulnerabilidade desce para peso leve, e não some.

          Ela é o TERCEIRO bloco de cor deste cartão, e o único dos três que
          está falando do lugar e não da ocorrência. A R2 da régua manda o fundo
          cheio para a gravidade do fato (a pílula de severidade, no topo do
          cartão); aqui ficam o sinal, o título em âmbar e o filete lateral, que
          é o que dá começo à peça sem acender a área inteira.

          Ela ganhou TÍTULO na troca, e isso não é compensação: em peso forte a
          tarja tinha a cor para chamar atenção e o texto podia ser corrido; em
          peso leve quem chama é a primeira linha, e ela precisa dizer o fato
          antes da descrição, que pode ser longa e vem do cadastro.
        */}
        {ocorrencia.vulnerabilidade_presente && (
          <Aviso tom="alerta" peso="leve" titulo="Vulnerabilidade social registrada">
            {/* Texto vazio é tão ausente quanto nulo, e o cadastro produz os
                dois: `??` sozinho deixaria um aviso com título e corpo em
                branco. */}
            {ocorrencia.vulnerabilidade_descricao
              ? ocorrencia.vulnerabilidade_descricao
              : "O relato não detalha quem precisa de cuidado prioritário neste endereço."}
          </Aviso>
        )}
      </Cartao>

      {/*
        A FOLHA DAS TRÊS RESPOSTAS, montada fora do cartão de propósito.

        Ela é modal e cobre a tela: aninhada dentro do cartão do cabeçalho, ela
        continuaria funcionando (o `Modal` do React Native monta na raiz de
        qualquer jeito) e ficaria escondida no meio de um cartão de conteúdo,
        que é onde ninguém procura por uma sobreposição. Fica junto dos outros
        `Dialogo` desta tela, pelo mesmo motivo que eles ficam soltos no fluxo.

        Ela só existe quando existe coordenada. Uma folha que oferecesse "copiar
        a coordenada" numa ocorrência que chegou sem coordenada estaria
        oferecendo copiar o nada.
      */}
      {temCoordenada && (
        <EscolhaDeMapa
          aberto={escolhendoMapa}
          endereco={ocorrencia.endereco}
          coordenada={coordenadaEmTexto(ocorrencia.latitude!, ocorrencia.longitude!)}
          aoEscolher={(resposta) => { void responderEscolhaDeMapa(resposta); }}
          aoFechar={() => { setEscolhendoMapa(false); }}
        />
      )}

      {/*
        O histórico entra AQUI, entre o cabeçalho e o progresso, e não no fim.

        Ele é informação de chegada: muda a conversa na porta e a ordem do que
        o agente pergunta. Depois de o formulário começar a ser preenchido, ele
        já não serve para quase nada, e no fim da rolagem ninguém o leria.

        `undefined` é "ainda não voltou", e nesse instante não há peça nenhuma:
        o formulário não espera pela rede em momento nenhum.
      */}
      {historico && <OQueJaAconteceuNestaCasa resultado={historico} />}

      {/*
        O PROGRESSO, que era um indicador só e cobria menos da metade do que a
        conclusão exige.

        A tela inteira tinha UM contador, em legenda cinza de 12 pontos, dizendo
        quantos itens obrigatórios do checklist estavam respondidos. Fotografia,
        órgão, nome de quem assina e traço da assinatura não tinham contador
        nenhum: o agente só descobria que faltavam quando chegava ao fim da
        rolagem e o botão estava travado.

        E a lista do que falta mora AQUI, no alto, e não lá embaixo. Ela era uma
        frase corrida de até cinco cláusulas separadas por vírgula, no fim de um
        formulário de dois mil pontos: o agente lia "falta responder 2 itens
        obrigatórios do checklist, tirar ao menos uma fotografia, coletar e
        confirmar a assinatura" e subia a tela procurando onde. Agora cada
        pendência é uma linha com caminho: um toque leva ao cartão que a
        resolve.
      */}
      <View
        onLayout={(e) => { alturaDaSecao.current.progresso = e.nativeEvent.layout.y; }}
        testID="ancora-progresso"
      >
        <Cartao>
          {/*
            O PROTAGONISTA DESTA PEÇA VIRA O NÚMERO, e antes ele não existia.

            A contagem saía em `corpoP` mono ao lado do título, do mesmo
            tamanho do título e do mesmo tamanho de tudo o mais no cartão. A
            H3 da régua de hierarquia é exatamente sobre isto: onde nada é
            maior que nada, o olho não tem por onde começar, e a tela vira uma
            parede de texto. A pergunta que este cartão responde é "quanto do
            trabalho já entrou", e a resposta passa a ter o tamanho da
            pergunta.

            `Dado` e não dois `Txt` montados aqui: ele já traz o degrau de
            número, o rótulo discreto colado nele e, para quem ouve a tela, o
            par lido como UMA frase ("5 de 7, requisitos concluídos") em vez de
            um número solto seguido de uma palavra sem sujeito.
          */}
          <Txt variante="h3">Progresso da vistoria</Txt>
          {/*
            Empilhado, e não o número espremido na ponta direita do título: em
            linha, "5 de 7" no degrau de número e "Progresso da vistoria" no de
            título disputam a mesma largura de aparelho, e o que cede é sempre
            o título, que quebra em duas linhas para o número caber.
          */}
          <Dado
            valor={`${feitos} de ${requisitos.length}`}
            rotulo="requisitos concluídos"
            testID="contagem-de-requisitos"
          />

          {/*
            A barra é a SEGUNDA pista, nunca a única: a contagem em número
            tabular está ao lado e o rótulo de acessibilidade diz a mesma coisa
            em palavra, porque desenho de barra não chega a quem ouve a tela.
          */}
          <View
            accessibilityRole="progressbar"
            accessibilityLabel={`${feitos} de ${requisitos.length} requisitos concluídos`}
            accessibilityValue={{ min: 0, max: requisitos.length, now: feitos }}
            testID="barra-de-progresso"
            style={{
              height: espaco.e2,
              borderRadius: raio.pilula,
              backgroundColor: tema.superficie2,
              overflow: "hidden",
            }}
          >
            <View
              style={{
                width: `${Math.round((feitos / requisitos.length) * 100)}%`,
                height: espaco.e2,
                borderRadius: raio.pilula,
                backgroundColor: podeConcluir ? tema.okTexto : tema.destaque,
              }}
            />
          </View>

          {podeConcluir ? (
            /*
              Este aviso deixou de pintar fundo, e não por pedido desta tela: a
              R3 da régua (`ui/regua.ts`) tira o fundo de todo tom `sucesso`
              dentro do próprio componente. Faz sentido aqui mais do que em
              qualquer outro lugar: o que precisa saltar neste cartão é o BOTÃO
              que leva à minuta, e um retângulo verde de quarenta palavras atrás
              dele competia com ele em vez de conduzir até ele.
            */
            <Aviso
              tom="sucesso"
              titulo="Tudo pronto"
              /*
                O rótulo é DIFERENTE do botão que está no fim da rolagem, e de
                propósito. Os dois levam ao mesmo lugar, mas dois textos iguais
                na mesma tela obrigam quem lê (e quem ouve) a descobrir se são
                a mesma coisa, e foi assim que esta tela já colou a mesma frase
                em dois lugares e pareceu repetição ao dono do aparelho.
              */
              acao={{
                titulo: "Revisar o laudo agora",
                /*
                  Realce, pedido daqui e não decidido pelo `Aviso`: é o ato
                  que leva à minuta, e este aviso é de sucesso, que nunca
                  pinta fundo (R3), então o preenchido não disputa com nada.
                */
                tipo: "realce",
                onPress: () => { setMinutaAberta(true); },
                testID: "concluir-pelo-progresso",
              }}
            >
              Nada mais é exigido para concluir. O próximo passo é a minuta do
              laudo, para ler com quem está no local.
            </Aviso>
          ) : (
            <View style={{ gap: espaco.e2 }} testID="lista-do-que-falta">
              <Txt variante="corpoP" peso={peso.forte}>
                {faltas.length === 1 ? "Falta 1 item:" : `Faltam ${faltas.length} itens:`}
              </Txt>
              {faltas.map((falta) => {
                const secao = secaoDaFalta(falta);
                return (
                  <Tocavel
                    accessibilityRole="button"
                    key={falta}
                    onPress={() => { if (secao) irPara(secao); }}
                    /*
                      A linha SEM caminho não responde ao dedo, e é assim que
                      ela diz que não leva a lugar nenhum. `Tocavel` já trata
                      desabilitado como imóvel: a seta some e o toque também.
                    */
                    desabilitado={!secao}
                    accessibilityLabel={`Falta ${falta}. Toque para ir até onde isso se resolve.`}
                    testID={`falta-${secao ?? "sem-caminho"}`}
                    estilo={{
                      minHeight: toque,
                      paddingHorizontal: espaco.e3,
                      borderRadius: raio.normal,
                      borderWidth: borda.fio,
                      borderColor: tema.borda,
                      backgroundColor: tema.superficie2,
                      flexDirection: "row",
                      alignItems: "center",
                      gap: espaco.e3,
                    }}
                  >
                    <IconeAlerta cor={tema.alertaTexto} tamanho={icone.rotulo} />
                    <View style={{ flex: 1 }}>
                      <Txt variante="corpoP">{falta}</Txt>
                    </View>
                    {/*
                      A seta diz que a linha LEVA a algum lugar, e some quando
                      não leva: uma linha que parece tocável e não é ensina o
                      agente a desconfiar das que são.
                    */}
                    {secao && <Txt variante="corpoP" peso={peso.negrito} discreto>›</Txt>}
                  </Tocavel>
                );
              })}
            </View>
          )}

          {camposRecusados.length > 0 && (
            /*
              O QUE PRECISA SER CORRIGIDO, e não só o que falta.

              A lista de cima responde "o agente terminou de preencher?". Esta
              responde "o servidor vai aceitar?", e vem de duas fontes com a
              mesma forma: a conferência com o esquema do servidor feita no
              toque de concluir, e o 422 que trouxe a coleta de volta da fila
              para correção. Antes de 15/09/2026 nenhuma das duas chegava a esta
              tela: a vistoria 000009/2026 concluiu "com tudo pronto" e parou na
              fila, onde a única saída era descartar.

              A mesma peça da lista de cima, de propósito: rótulo do campo (o
              mesmo do painel, pelo pacote compartilhado), a frase do servidor,
              e a seta quando há seção para onde ir.
            */
            <View
              style={{ gap: espaco.e2 }}
              testID="lista-do-que-corrigir"
              accessibilityLiveRegion="polite"
            >
              <Txt variante="corpoP" peso={peso.forte} cor={tema.perigoTexto}>
                {camposRecusados.length === 1
                  ? "Corrija 1 item antes de concluir:"
                  : `Corrija ${camposRecusados.length} itens antes de concluir:`}
              </Txt>
              {camposRecusados.map((campo) => {
                const secao = secaoDoCampoRecusado(campo.campo);
                const rotulo = rotuloDoCampo(campo.campo);
                return (
                  <Tocavel
                    accessibilityRole="button"
                    key={campo.campo}
                    onPress={() => { if (secao) irPara(secao); }}
                    desabilitado={!secao}
                    accessibilityLabel={
                      `${rotulo}: ${campo.mensagem}`
                      + (secao ? " Toque para ir até onde isso se resolve." : "")
                    }
                    testID={`corrigir-${secao ?? "sem-caminho"}`}
                    estilo={{
                      minHeight: toque,
                      paddingHorizontal: espaco.e3,
                      paddingVertical: espaco.e2,
                      borderRadius: raio.normal,
                      borderWidth: borda.fio,
                      borderColor: tema.borda,
                      backgroundColor: tema.superficie2,
                      flexDirection: "row",
                      alignItems: "center",
                      gap: espaco.e3,
                    }}
                  >
                    <IconeAlerta cor={tema.perigoTexto} tamanho={icone.rotulo} />
                    <View style={{ flex: 1, gap: espaco.e1 }}>
                      <Txt variante="corpoP" peso={peso.forte}>{rotulo}</Txt>
                      <Txt variante="corpoP" discreto>{campo.mensagem}</Txt>
                    </View>
                    {secao && <Txt variante="corpoP" peso={peso.negrito} discreto>›</Txt>}
                  </Tocavel>
                );
              })}
            </View>
          )}
        </Cartao>
      </View>

      <View
        onLayout={(e) => { alturaDaSecao.current.checklist = e.nativeEvent.layout.y; }}
        testID="ancora-checklist"
        style={{
          borderRadius: raio.cartao,
          borderWidth: borda.enfase,
          borderColor: secaoEmDestaque === "checklist" ? tema.anelDeFoco : "transparent",
        }}
      >
      <Cartao>
        <TituloDoCartao
          desenho={<IconeChecklist cor={tema.textoDiscreto} tamanho={icone.acao} />}
          texto="Checklist técnico"
        />
        <Txt variante="legenda" discreto>
          {CHECKLIST_OBRIGATORIO.filter((i) => i.chave in rascunho.checklist).length}
          {" de "}{CHECKLIST_OBRIGATORIO.length} itens obrigatórios respondidos
        </Txt>
        {CHECKLIST_VISTORIA.map((item, posicao) => {
          const resposta = rascunho.checklist[item.chave];
          /*
            O traço separa DOIS itens, então o último não leva nenhum.

            Ele era desenhado no fim de cada item, o último inclusive, e o
            resultado era um fio solto flutuando sobre o recuo inferior do
            cartão, sem nada embaixo para separar. É pouco, e é o tipo de pouco
            que faz uma tela parecer inacabada sem ninguém saber dizer por quê.
          */
          const ultimo = posicao === CHECKLIST_VISTORIA.length - 1;
          return (
            <View key={item.chave} style={{ gap: espaco.e2 }}>
              <Txt variante="corpoP">
                {item.rotulo}
                {!item.obrigatorio && <Txt variante="legenda" discreto>  opcional</Txt>}
              </Txt>
              {/*
                Sim e não explícitos, e não um interruptor. Interruptor
                desligado é indistinguível de pergunta não respondida, e a
                diferença entre "não há risco iminente" e "ninguém olhou" é o
                que decide se alguém dorme na casa hoje.
              */}
              <View style={{ flexDirection: "row", gap: espaco.e2 }}>
                {[
                  { valor: true, rotulo: "Sim" },
                  { valor: false, rotulo: "Não" },
                ].map((opcao) => {
                  const marcada = resposta === opcao.valor;
                  return (
                    <Tocavel
                      key={opcao.rotulo}
                      onPress={() => {
                        /*
                          Responder "não" depois de ter indicado órgãos apaga a
                          indicação, e apagar em silêncio o nome que alguém
                          digitou à mão é perder trabalho por um toque errado
                          numa tela pequena. A lista precisa mesmo sair: coleta
                          que diz "não é necessário acionar ninguém" e lista três
                          órgãos é contradição que o servidor recusa.
                        */
                        if (
                          item.chave === CHAVE_ACIONAR_ORGAO
                          && opcao.valor === false
                          && rascunho.orgaosParaAcionar.length > 0
                        ) {
                          setPerguntandoDescartarOrgaos(true);
                          return;
                        }
                        void alterar({
                          checklist: { ...rascunho.checklist, [item.chave]: opcao.valor },
                        });
                      }}
                      accessibilityRole="radio"
                      accessibilityState={{ checked: marcada }}
                      accessibilityLabel={`${item.rotulo}: ${opcao.rotulo}`}
                      /*
                        Aqui o retorno do dedo não é enfeite: a gravação da
                        resposta passa pelo rascunho em disco, então entre o
                        toque e o fundo mudar de cor existe uma ida ao SQLite.
                        Sem nada acontecendo no meio, o agente de luva toca de
                        novo, e o segundo toque cai no "Não" que ele não quis.
                      */
                      estilo={{
                        flex: 1,
                        minHeight: toque,
                        flexDirection: "row",
                        gap: espaco.e2,
                        alignItems: "center",
                        justifyContent: "center",
                        borderRadius: raio.normal,
                        borderWidth: marcada ? 0 : borda.fio,
                        borderColor: tema.borda,
                        backgroundColor: marcada ? tema.destaque : "transparent",
                      }}
                    >
                      {/*
                        O visto era o caractere "✓" colado na frente do rótulo,
                        dentro da mesma string. Caractere tipográfico fazendo
                        trabalho de ícone é o que fez o aplicativo inteiro
                        parecer "só texto", e ele herda o peso e a altura da
                        fonte em vez do traço do conjunto.
                      */}
                      {marcada && (
                        <IconeSucesso cor={tema.sobreDestaque} tamanho={icone.inline} />
                      )}
                      <Txt
                        variante="corpo"
                        negrito={marcada}
                        cor={marcada ? tema.sobreDestaque : tema.texto}
                      >
                        {opcao.rotulo}
                      </Txt>
                    </Tocavel>
                  );
                })}
              </View>

              {/*
                O desdobramento nasce COLADO no item que o produziu, e não numa
                seção separada do formulário.

                Longe dali, ele seria mais um cartão no meio de um rolamento
                longo, e o agente que respondeu "sim" desceria a tela sem ver a
                pergunta que a resposta dele abriu. A conclusão travaria depois,
                lá embaixo, dizendo que falta uma coisa que está trezentos pixels
                acima.
              */}
              {item.chave === CHAVE_ACIONAR_ORGAO && resposta === true && (
                <>
                <View style={{ flexDirection: "row", alignItems: "center", gap: espaco.e2 }}>
                  <IconeOrgao cor={tema.textoDiscreto} tamanho={icone.rotulo} />
                  <Txt variante="corpoP" peso={peso.forte}>Órgãos a acionar</Txt>
                </View>
                <OrgaosParaAcionar
                  catalogo={catalogoDeOrgaos}
                  escolhidos={rascunho.orgaosParaAcionar}
                  aoMudar={(lista) => void alterar({ orgaosParaAcionar: lista })}
                />
                </>
              )}
              {!ultimo && <Separador />}
            </View>
          );
        })}
      </Cartao>
      </View>

      <Dialogo
        aberto={perguntandoDescartarOrgaos}
        titulo="Apagar os órgãos indicados?"
        texto={
          `Você indicou ${rascunho.orgaosParaAcionar.length === 1
            ? "um órgão"
            : `${rascunho.orgaosParaAcionar.length} órgãos`} para acionar. `
          + "Responder que não é necessário acionar outro órgão apaga essa lista."
        }
        acao={{
          rotulo: "Responder não e apagar a lista",
          destrutiva: true,
          aoTocar: () => void alterar({
            checklist: { ...rascunho.checklist, [CHAVE_ACIONAR_ORGAO]: false },
            orgaosParaAcionar: [],
          }),
        }}
        recusa={{ rotulo: "Manter os órgãos que indiquei" }}
        aoFechar={() => { setPerguntandoDescartarOrgaos(false); }}
      />

      <View
        onLayout={(e) => { alturaDaSecao.current.fotos = e.nativeEvent.layout.y; }}
        testID="ancora-fotos"
        style={{
          borderRadius: raio.cartao,
          borderWidth: borda.enfase,
          borderColor: secaoEmDestaque === "fotos" ? tema.anelDeFoco : "transparent",
        }}
      >
      <Cartao>
        <TituloDoCartao
          desenho={<IconeFoto cor={tema.textoDiscreto} tamanho={icone.acao} />}
          texto={`Fotografias (${rascunho.fotos.length})`}
        />

        {/*
          O RETORNO DO OBTURADOR, em palavra.

          A animação da miniatura abaixo é para quem olha; esta linha é para
          quem ouve a tela, para quem desligou movimento no sistema e para quem
          está com o aparelho longe do rosto. Região viva, porque ela aparece
          sem ninguém ter mudado de tela.
        */}
        {fotoRecemGuardada && (
          <View
            accessibilityLiveRegion="polite"
            testID="foto-guardada"
            style={{ flexDirection: "row", alignItems: "center", gap: espaco.e2 }}
          >
            <IconeSucesso cor={tema.okTexto} tamanho={icone.rotulo} />
            <Txt variante="corpoP" peso={peso.forte} cor={tema.okTexto}>
              Fotografia {rascunho.fotos.length} guardada neste aparelho
            </Txt>
          </View>
        )}

        {rascunho.fotos.length === 0 ? (
          <Txt variante="corpoP" discreto>
            Pelo menos uma fotografia é obrigatória. É ela que o coordenador
            olha antes de decidir o despacho.
          </Txt>
        ) : (
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: espaco.e2 }}>
            {rascunho.fotos.map((f) => {
              const recemGuardada = f.idempotencyKey === fotoRecemGuardada;
              const jaEnviada = rascunho.fotosJaEnviadas?.includes(f.idempotencyKey) ?? false;
              return (
              <View key={f.idempotencyKey} style={{ gap: espaco.e1 }}>
                {/*
                  A miniatura da foto recém guardada ENTRA na tela em vez de
                  simplesmente estar lá. É o único sinal visual de que o
                  obturador pegou, e ele acontece depois de a câmera fechar,
                  que é onde o olho do agente está.
                */}
                <Animated.View
                  style={{
                    opacity: recemGuardada ? entradaDaFoto : 1,
                    transform: [{ scale: recemGuardada ? escalaDaFotoNova : 1 }],
                  }}
                >
                  <Image
                    source={{ uri: f.uriLocal }}
                    style={{
                      width: MINIATURA, height: MINIATURA, borderRadius: raio.normal,
                    }}
                    /* Ver a miniatura do histórico: sem `accessible`, `Image`
                       não é focável e o rótulo nunca é falado. */
                    accessible
                    accessibilityLabel={`Fotografia ${f.ordem + 1} da vistoria`}
                  />
                </Animated.View>
                {jaEnviada ? (
                  /*
                    A FOTOGRAFIA QUE O SERVIDOR JÁ CONFIRMOU NÃO SE APAGA DAQUI.

                    Achado do revisor de integridade da prova, na coleta que
                    volta da fila para correção: a foto subiu e foi confirmada
                    numa tentativa anterior (o evento `evidencia_anexada` já
                    está na trilha), e o envelope falhou depois. Apagá-la aqui
                    tiraria a referência da vistoria corrigida, e o laudo
                    passaria a imprimi-la como "anexada fora do fluxo de
                    vistoria, sem agente responsável", que é falso. A rota de
                    sincronização não tem como receber uma lista de removidas,
                    então a correção não deixa remover: mostra que já subiu.

                    O selo `ok` não pinta fundo (R3 da régua), e a miniatura
                    continua sendo a única coisa desta coluna com peso.
                  */
                  <View
                    accessible
                    accessibilityLabel={`Fotografia ${f.ordem + 1} já enviada à coordenação. `
                      + "Ela não pode ser apagada daqui."}
                    testID={`foto-ja-enviada-${f.ordem + 1}`}
                    style={{
                      minHeight: toque,
                      minWidth: MINIATURA,
                      paddingHorizontal: espaco.e2,
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <Chip texto="Já enviada" simbolo="✓" tom="ok" />
                  </View>
                ) : (
                <Tocavel
                  accessibilityRole="button"
                  /*
                    Apagar passa a PERGUNTAR. Era imediato e irreversível,
                    enquanto descartar item da fila de envio, que é menos grave,
                    já perguntava: o mesmo aplicativo tratava a prova de uma
                    interdição com menos cuidado do que um item que pode ser
                    reenviado.
                  */
                  onPress={() => { setFotoParaApagar(f); }}
                  accessibilityLabel={`Apagar a fotografia ${f.ordem + 1}`}
                  testID={`apagar-foto-${f.ordem + 1}`}
                  /*
                    `toque`, e não 32. Estava escrito 32 à mão, vinte pontos
                    abaixo da régua que o próprio `tokens.ts` declara, e nada
                    reclamava porque o aplicativo não tinha portão nenhum. O
                    alvo pequeno aqui é o pior lugar possível: errar este botão
                    apaga uma fotografia de vistoria, que é prova de uma
                    interdição e não se refaz sem subir o morro de novo.
                  */
                  /*
                    `minWidth` além do `minHeight`, e ele vale a largura da
                    MINIATURA de propósito.

                    O alvo tinha 52 pontos de altura e a largura da palavra
                    "Apagar", que dá uns 50: o portão de acessibilidade mede
                    altura e passava, e o dedo com luva errava na horizontal, no
                    único botão desta tela que apaga prova de uma interdição.
                    Casando com a miniatura, o alvo fica com a largura do que
                    ele apaga, e a coluna de fotografias para de ter um texto
                    mais estreito que a imagem logo acima dele.
                  */
                  estilo={{
                    minHeight: toque,
                    minWidth: MINIATURA,
                    paddingHorizontal: espaco.e2,
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <Txt variante="corpoP" cor={tema.perigoTexto}>Apagar</Txt>
                </Tocavel>
                )}
              </View>
              );
            })}
          </View>
        )}
        {/*
          REALCE, e não secundário: tirar a foto é um dos dois atos centrais
          desta tela, e saía com um fio de 1,30:1 sobre o cartão, que é o "só
          preto ou branco" do relato de quem paga. O desenho da câmera vai ao
          lado da palavra, e nunca no lugar dela: quem abre este aplicativo
          duas vezes por semana não decora pictograma.
        */}
        <Botao
          titulo="Tirar foto"
          tipo="realce"
          icone={(cor) => <IconeFoto cor={cor} tamanho={icone.rotulo} />}
          onPress={() => void (async () => {
            if (!permissaoCamera?.granted) {
              const resultado = await pedirCamera();
              if (!resultado.granted) {
                setErro(
                  "Sem permissão de câmera. Libere nas configurações do aparelho " +
                  "para poder fotografar a vistoria.",
                );
                return;
              }
            }
            setCameraAberta(true);
          })()}
        />
      </Cartao>
      </View>

      {/*
        A pergunta antes de apagar. `Dialogo` e não `Alert.alert`: o alerta
        nativo ignora o tema, ignora a régua de tipografia do produto e usa a
        área de toque do sistema, e não os 52 pontos que este aplicativo exige.

        O texto nomeia QUAL fotografia, porque "apagar esta foto?" num cartão
        com cinco miniaturas não responde a única pergunta que importa.
      */}
      <Dialogo
        aberto={fotoParaApagar !== null}
        titulo="Apagar esta fotografia?"
        texto={
          `A fotografia ${(fotoParaApagar?.ordem ?? 0) + 1} sai da vistoria e o `
          + "arquivo é descartado deste aparelho. Refazer significa voltar ao "
          + "local: não há como recuperar depois."
        }
        acao={{
          rotulo: "Apagar a fotografia",
          destrutiva: true,
          aoTocar: () => {
            const alvo = fotoParaApagar;
            if (!alvo) return;
            void alterar({
              fotos: rascunho.fotos
                .filter((o) => o.idempotencyKey !== alvo.idempotencyKey)
                .map((o, i) => ({ ...o, ordem: i })),
            });
            /*
              E o ARQUIVO também, que é o que o texto acima promete.

              Sair da lista do rascunho não tirava o JPEG do aparelho: ele
              ficava em `Paths.document` até alguém sair da conta, e o agente de
              campo não sai da conta. Ver `apagarFotoDoAparelho`, que não
              estoura em caminho nenhum: a foto sai da vistoria mesmo que a
              limpeza não consiga.

              Depois de `alterar`, e não antes: se a gravação do rascunho
              falhar, a foto continua na coleta, e uma coleta que aponta para um
              arquivo apagado é pior do que um arquivo a mais no disco.
            */
            apagarFotoDoAparelho(alvo.uriLocal);
          },
        }}
        recusa={{ rotulo: "Manter a fotografia" }}
        aoFechar={() => { setFotoParaApagar(null); }}
        testID="dialogo-apagar-foto"
      />

      {/*
        A LOCALIZAÇÃO DEIXA DE SER TEXTO PURO.

        Este cartão era uma coordenada com seis casas e uma frase de precisão
        em metros. Quinze dígitos e a palavra "metros" não respondem a pergunta
        que o agente faz aqui, que é espacial: o ponto que a coordenação passou
        é ESTA casa? A resposta é um desenho, e o desenho é o mapa.

        `MapaDoImovel` decide sozinho entre o mapa do Google e o plano
        esquemático, desenha a legenda de modo e trata o Google que não
        responde. Esta tela não sabe qual dos dois está no ar, e não deve: foi
        assim que a mesma regra acabou escrita em quatro lugares no painel.

        **Sem sinal ele não fica em branco.** Os ladrilhos do Google têm cache
        oportunista, e o trecho de morro que o agente nunca abriu com sinal não
        está nele; nesse caso, e no do município que não autorizou o mapa, o
        plano esquemático desenha os dois pontos, a distância e o rumo, sem
        nenhum contato com a rede. O que muda é o desenho, nunca a existência
        da informação.
      */}
      {/*
        O cartão de localização ganhou ÂNCORA, e ela é o destino de "ver o mapa
        aqui dentro" da folha de escolha. Mesmo invólucro dos outros três
        (medir o `y`, acender o contorno por alguns segundos), porque rolar
        sozinho até um cartão sem dizer que rolou é a reclamação que a lista de
        tarefas já recebeu.
      */}
      <View
        onLayout={(e) => { alturaDaSecao.current.localizacao = e.nativeEvent.layout.y; }}
        testID="ancora-localizacao"
        style={{
          borderRadius: raio.cartao,
          borderWidth: borda.enfase,
          borderColor: secaoEmDestaque === "localizacao" ? tema.anelDeFoco : "transparent",
        }}
      >
      <Cartao>
        <TituloDoCartao
          desenho={<IconeGps cor={tema.textoDiscreto} tamanho={icone.acao} />}
          texto="Localização"
        />

        {/*
          O mapa só é MONTADO depois de o token estar lido, e o porquê está
          inteiro no cabeçalho de `MapaDaVistoria`: montado antes, ele decide
          "esquemático" sem ter perguntado a ninguém e troca para o Google um
          instante depois, tendo dito uma coisa falsa no meio.
        */}
        {centroDoMapa && tokenDaSessao !== undefined && (
          <MapaDaVistoria
            token={tokenDaSessao}
            imovel={centroDoMapa}
            agente={pontoDoImovel ? pontoDoAgente : null}
            rotulo={pontoDoImovel
              ? ocorrencia.endereco
              : `${ocorrencia.endereco}, no ponto que você capturou`}
          />
        )}

        {/*
          OS DOIS PONTOS, UM SOB O OUTRO, e é isto que o agente não tinha.

          Empilhados e não lado a lado: uma coordenada com seis casas ocupa
          quase metade da largura do aparelho, e duas na mesma linha ou
          quebram no meio do número ou obrigam a encolher a fonte de um texto
          que é ditado por rádio.

          O rótulo em caixa alta discreta e o número em fonte tabular embaixo:
          a hierarquia é de escala e espaço, e não de cor, porque cor neste
          produto já carrega severidade, estado de envio e gravidade de aviso.
          Fonte tabular porque estes números são lidos por rádio, e em tipo
          proporcional o zero se parece com a letra.
        */}
        <View style={{ gap: espaco.e3 }}>
          <View style={{ gap: espaco.e1 }}>
            <Txt nivel="rotulo">Ponto informado</Txt>
            {pontoDoImovel ? (
              <Txt variante="corpoP" mono>
                {pontoDoImovel.latitude.toFixed(6)}, {pontoDoImovel.longitude.toFixed(6)}
              </Txt>
            ) : (
              <Txt variante="corpoP" discreto>Não veio na abertura</Txt>
            )}
          </View>

          <View style={{ gap: espaco.e1 }}>
            <Txt nivel="rotulo">Leitura do aparelho</Txt>
            {pontoDoAgente ? (
              <>
                <Txt variante="corpoP" mono>
                  {pontoDoAgente.latitude.toFixed(6)}, {pontoDoAgente.longitude.toFixed(6)}
                </Txt>
                <Txt variante="legenda" discreto>
                  {rascunho.gpsPrecisaoMetros
                    ? `Precisão de ${rascunho.gpsPrecisaoMetros} metros`
                    : "Precisão não informada pelo aparelho"}
                </Txt>
              </>
            ) : (
              <Txt variante="corpoP" discreto>Ainda não capturada</Txt>
            )}
          </View>
        </View>

        {!pontoDoAgente && (
          <Txt variante="corpoP" discreto>
            A leitura do aparelho é o que prova, no laudo, onde a vistoria
            aconteceu. Ela sobe junto com a coleta.
          </Txt>
        )}

        {/*
          A DIVERGÊNCIA, dita sem prometer o que esta tela não pode cumprir.

          O agente é a fonte mais confiável de onde o imóvel fica, e era o
          único que não conseguia reportar isso. Agora a leitura dele viaja no
          envelope, e o laudo passa a ter os dois pontos.

          O que a tela NÃO faz, e diz que não faz: corrigir a coordenada da
          ocorrência. Corrigir é outro ato, com motivo escrito e decisão de
          pessoa, e uma correção silenciosa disparada por uma revistoria seria
          a trilha registrando uma decisão que ninguém tomou. O texto nomeia
          quem decide, porque um aviso que aponta um problema e não diz de quem
          é a vez ensina o agente a ignorar avisos.
        */}
        {divergencia?.relevante && (
          <Aviso
            tom="alerta"
            peso="leve"
            titulo={`O ponto informado está a ${divergencia.texto} de você`}
          >
            A sua leitura vai junto com esta vistoria e aparece no laudo. Ela
            não corrige a coordenada da ocorrência: quem decide isso é a
            coordenação, com motivo escrito.
          </Aviso>
        )}

        {/* Realce pela mesma razão de "Tirar foto": é o ato que faz a vistoria andar. */}
        <Botao
          titulo={pontoDoAgente ? "Capturar de novo" : "Capturar localização"}
          tipo="realce"
          icone={(cor) => <IconeGps cor={cor} tamanho={icone.rotulo} />}
          onPress={() => void capturarGps()}
          carregando={capturandoGps}
          testID="capturar-localizacao"
        />
      </Cartao>
      </View>

      <View
        onLayout={(e) => { alturaDaSecao.current.assinatura = e.nativeEvent.layout.y; }}
        testID="ancora-assinatura"
        style={{
          borderRadius: raio.cartao,
          borderWidth: borda.enfase,
          borderColor: secaoEmDestaque === "assinatura" ? tema.anelDeFoco : "transparent",
        }}
      >
      <Cartao>
        <TituloDoCartao
          desenho={<IconeAssinatura cor={tema.textoDiscreto} tamanho={icone.acao} />}
          texto="Quem estava no local"
        />
        {/*
          O estilo deste campo estava copiado verbatim aqui e em `entrar.tsx`,
          oito propriedades iguais em dois arquivos, e a borda em repouso era a
          MESMA borda do campo em foco: num formulário de nove campos rolado
          dois mil pontos, o agente não tinha como saber onde o teclado ia
          escrever. `Campo` resolve os dois de uma vez.
        */}
        <CampoDeTexto
          rotulo="Nome de quem acompanhou e assina"
          ajuda="É este nome que sai acima da linha de assinatura no laudo."
          valor={rascunho.assinanteNome}
          aoMudar={(t) => void alterar({ assinanteNome: t })}
          placeholder="Nome completo"
          capitalizacao="words"
          testID="nome-de-quem-assina"
        />

        <Assinatura
          jaAssinada={Boolean(rascunho.assinaturaUri)}
          aoConfirmar={(uri) => {
            /*
              O morador acabou de tirar o dedo da tela e o traço foi aceito.
              Quem está olhando para o aparelho é ELE; quem precisa saber que
              deu certo é o agente, que está segurando o aparelho e olhando
              para a pessoa.
            */
            retornoTatil("confirmado");
            void alterar({ assinaturaUri: uri });
          }}
          aoLimpar={() => void alterar({ assinaturaUri: null })}
          aoComecarDesenho={() => setDesenhando(true)}
          aoTerminarDesenho={() => setDesenhando(false)}
        />
      </Cartao>
      </View>

      {/*
        A contagem de pessoas, e ela vem ANTES das observações.

        Não é ordem de formulário, é ordem de conversa. O agente está na porta
        com alguém, e é essa pessoa que sabe quantos dormiram fora ontem. As
        observações ele escreve depois, sozinho, no carro.

        Cada campo pode ficar vazio, e vazio significa NÃO CONTADO. O laudo
        imprime "não informado", nunca zero: dizer "0 desabrigados" quando
        ninguém contou é uma afirmação falsa num documento que vai para
        processo.

        A ajuda fica embaixo de cada campo em vez de num cabeçalho geral,
        porque a diferença entre desalojado e desabrigado é exatamente o que
        alguém que nunca trabalhou em Defesa Civil não sabe, e ela precisa
        estar visível no instante em que o dedo vai digitar.
      */}
      <Cartao titulo="Pessoas atingidas">
        <Txt variante="legenda" discreto>
          Deixe em branco o que você não contou. Em branco não é zero.
        </Txt>
        {CAMPOS_PESSOAS.map((c) => (
          /*
            Aqui é `Campo` com o controle por função, e não `CampoDeTexto`,
            porque este campo precisa de `maxLength`, que a peça curta não
            aceita de fora de propósito: aceitar tudo seria reabrir a porta da
            cópia de estilo que ela existe para fechar.
          */
          <Campo
            key={c.chave}
            rotulo={c.rotulo}
            ajuda={c.ajuda}
            opcional
            testID={`pessoas-${c.chave}`}
          >
            {(ligacoes) => (
              <TextInput
                {...ligacoes}
                value={rascunho.pessoas[c.chave] ?? ""}
                onChangeText={(t) => void alterar({
                  // Só dígito entra. Teclado numérico de Android ainda oferece
                  // vírgula, ponto e sinal, e "2,5 feridos" não existe.
                  pessoas: { ...rascunho.pessoas, [c.chave]: t.replace(/[^0-9]/g, "") },
                })}
                keyboardType="number-pad"
                placeholder="não contado"
                maxLength={5}
              />
            )}
          </Campo>
        ))}
      </Cartao>

      <Cartao titulo="Observações do agente">
        <CampoDeTexto
          rotulo="Observações do agente"
          opcional
          ajuda="O que o checklist não cobre e o laudo precisa registrar."
          multilinhas
          valor={rascunho.observacoes}
          aoMudar={(t) => void alterar({ observacoes: t })}
          placeholder="O que o checklist não cobre e o laudo precisa registrar"
          testID="observacoes-do-agente"
        />
      </Cartao>

      {/*
        A tarja do fim da rolagem deixa de LISTAR e passa a APONTAR.

        Ela era a frase corrida de até cinco cláusulas coladas com vírgula, e
        morava justamente no pior lugar para uma lista: o fim de um formulário
        de dois mil pontos. A lista inteira, com o caminho de cada item, está no
        cartão de progresso, no alto. Aqui fica só o FATO (o botão está travado,
        e por quantos itens) mais um toque que leva até ela.

        O texto não repete a lista, e isso é deliberado: a mesma frase em dois
        lugares da mesma tela foi exatamente o que o dono do aparelho leu como
        repetição, na lista de tarefas.
      */}
      {!podeConcluir && (
        <Aviso
          tom="alerta"
          titulo={faltas.length === 1
            ? "Falta 1 item para concluir"
            : `Faltam ${faltas.length} itens para concluir`}
          acao={{
            titulo: "Ver o que falta",
            onPress: () => { irPara("progresso"); },
            descricao: "Ir para a lista do que falta, no alto desta tela",
            testID: "ver-o-que-falta",
          }}
        >
          A lista, com o caminho para cada item, está no alto desta tela.
        </Aviso>
      )}

      {/*
        A conclusão passa pela minuta, e isso não é uma tela a mais por gosto.

        Antes, "Concluir vistoria" gravava direto: o agente descia o morro sem
        nunca ter visto o que ficou escrito, e quem assinou dizendo que estava
        presente também não. Um item marcado errado só aparecia no dia
        seguinte, quando voltar lá custa outra viagem.

        Agora o último toque abre o texto do laudo, montado no próprio
        aparelho, para ser lido em voz alta na porta. Concluir de verdade é o
        botão que fica lá dentro.
      */}
      <Botao
        titulo="Revisar e concluir"
        onPress={() => setMinutaAberta(true)}
        desabilitado={!podeConcluir}
      />

      <Txt variante="legenda" discreto alinhamento="center">
        Tudo o que você preencheu já está guardado neste aparelho. O próximo
        passo mostra a minuta do laudo para você conferir com quem está no
        local, antes de a vistoria entrar na fila de envio.
      </Txt>

    </ScrollView>
    </View>
  );
}
