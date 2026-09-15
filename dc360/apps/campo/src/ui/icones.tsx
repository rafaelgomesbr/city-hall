import type { ReactElement } from "react";
import Svg, { Circle, Path } from "react-native-svg";

import { icone } from "./tokens";

/**
 * Os ícones do aplicativo, desenhados à mão.
 *
 * Sem biblioteca de ícones de propósito. O `react-native-svg` já está aqui,
 * porque a assinatura em campo depende dele, e três traçados custam menos que
 * um pacote novo com o seu ciclo de versão. Este aplicativo acabou de perder
 * uma tarde por incompatibilidade de dependência transitiva; a régua para
 * acrescentar mais uma subiu.
 *
 * Traço e não preenchimento, porque a barra distingue o item ativo pela COR do
 * traço mais o peso do rótulo. E o rótulo está sempre lá: a regra do
 * aplicativo é que nada se comunica só por cor, e ícone sozinho falha pela
 * mesma razão, com o agravante de que o agente usa isto duas vezes por semana
 * e não decora pictograma.
 *
 * ---
 *
 * O conjunto nasceu com três ícones, todos de navegação, e o resto do produto
 * ficou anos usando CARACTERE TIPOGRÁFICO no lugar de ícone: "! Vulnerabilidade
 * social", "✓ Coletada", "↑", "◉", "▢". É por isso que o aplicativo aberto no
 * aparelho pareceu "só texto". Os ícones abaixo existem para substituir esses
 * caracteres, um a um, nas telas que já os desenham hoje. Nenhum deles foi
 * desenhado por antecipação: cada um tem um lugar conhecido, anotado no próprio
 * comentário.
 *
 * AS REGRAS DO CONJUNTO, e elas têm portão em `icones.test.tsx`:
 *
 * 1. `viewBox` de 24 e `strokeWidth` de 1.8 em TODOS. Peso de traço diferente
 *    entre vizinhos é o defeito que estraga a linha inteira: o olho lê um
 *    ícone mais escuro como "mais importante", e aí a hierarquia passa a ser
 *    acidente de desenho.
 * 2. `stroke` e nunca `fill`. Um ícone cheio no meio de vinte vazados vira
 *    mancha, e o primeiro que aparecer autoriza o segundo.
 * 3. O alvo de leitura é 16, e não 24. É esse o tamanho dentro de um cartão de
 *    lista, que é onde a maioria deles vive. Por isso nenhum passa de cinco
 *    traços e nada tem vão menor que uns 3 no viewBox: abaixo disso os traços
 *    se encostam quando o aparelho reduz para 16 e o desenho vira borrão.
 * 4. O ícone é a SEGUNDA pista, ao lado da palavra, nunca o lugar dela. Quem
 *    usa este aplicativo o abre duas vezes por semana e não decora pictograma,
 *    e quem ouve a tela não vê desenho nenhum. Ícone sozinho, sem rótulo e sem
 *    `accessibilityLabel` em quem o contém, é regressão.
 */

/* `cor` vem do `tabBarIcon`, que entrega `ColorValue` e não `string`. */
export type PropsDeIcone = {
  cor: import("react-native").ColorValue;
  tamanho?: number;
};

/* Nome interno, mantido porque as três assinaturas antigas já o usavam. */
type Props = PropsDeIcone;

/** O componente de um ícone. Serve ao registro `ICONES` e ao portão. */
export type ComponenteDeIcone = (props: PropsDeIcone) => ReactElement;

/**
 * O tamanho padrão, agora vindo do token.
 *
 * Esta constante nasceu como `24` escrito à mão, com a razão declarada: a
 * frente dos tokens estava criando `icone` em `src/ui/tokens.ts` no MESMO
 * turno, e importar um token que ainda não existia quebraria as duas frentes
 * ao mesmo tempo. O comentário terminava com um convite explícito: "quando ele
 * entrar, este 24 vira token e o valor sai daqui. Quem passar por aqui depois
 * disso e encontrar o número solto, ligue."
 *
 * O token entrou no mesmo turno e o número solto ficou, porque nenhum portão
 * enxerga um `24` sem nome de propriedade ao lado. `icone.acao` é o degrau de
 * 24 pontos (o ícone do tamanho de uma ação, casado com a altura de `corpo`),
 * e é ele o padrão daqui.
 *
 * Dito na cara: nenhum teste separa o antes do depois, porque os dois valores
 * são o mesmo número. O que muda é o ponteiro, e é só ele que importa: no dia
 * em que a escala de ícone mudar, este arquivo muda junto em vez de ficar para
 * trás em silêncio.
 */
const TAMANHO_PADRAO = icone.acao;

/* A espessura é uma só, para o conjunto inteiro. Ver regra 1 no topo. */
const TRACO = 1.8;

/** Prancheta: a lista do que fazer. */
export function IconeTarefas({ cor, tamanho = TAMANHO_PADRAO }: Props) {
  return (
    <Svg width={tamanho} height={tamanho} viewBox="0 0 24 24" fill="none">
      <Path
        d="M9 3.5h6a1 1 0 0 1 1 1V6H8V4.5a1 1 0 0 1 1-1Z"
        stroke={cor} strokeWidth={TRACO} strokeLinejoin="round"
      />
      <Path
        d="M8 5H6.5A1.5 1.5 0 0 0 5 6.5v13A1.5 1.5 0 0 0 6.5 21h11a1.5 1.5 0 0 0 1.5-1.5v-13A1.5 1.5 0 0 0 17.5 5H16"
        stroke={cor} strokeWidth={TRACO} strokeLinecap="round" strokeLinejoin="round"
      />
      <Path d="M8.5 11.5h7M8.5 15.5h4" stroke={cor} strokeWidth={TRACO} strokeLinecap="round" />
    </Svg>
  );
}

/** Seta subindo para uma nuvem: o que ainda vai sair do aparelho. */
export function IconeEnvio({ cor, tamanho = TAMANHO_PADRAO }: Props) {
  return (
    <Svg width={tamanho} height={tamanho} viewBox="0 0 24 24" fill="none">
      <Path
        d="M6.5 18.5A3.5 3.5 0 0 1 6 11.6a5 5 0 0 1 9.7-1.4A3.9 3.9 0 0 1 18 18.5"
        stroke={cor} strokeWidth={TRACO} strokeLinecap="round" strokeLinejoin="round"
      />
      <Path
        d="M12 20.5v-8m0 0-2.6 2.6M12 12.5l2.6 2.6"
        stroke={cor} strokeWidth={TRACO} strokeLinecap="round" strokeLinejoin="round"
      />
    </Svg>
  );
}

/**
 * Mapa dobrado: a ABA do mapa, e ele não é o alfinete.
 *
 * A diferença importa e já está escrita em `IconeLocalizacao`, logo abaixo: o
 * alfinete aponta um LUGAR (o endereço daquela ocorrência, o botão "Abrir no
 * mapa"), e a mira de `IconeGps` CAPTURA a posição do aparelho. Nenhum dos dois
 * serve de aba, porque aba não é um lugar nem uma captura: é a superfície
 * inteira, com todas as tarefas do dia sobre ela. Um alfinete ali prometeria
 * "veja este ponto" quando o que se abre é "veja tudo".
 *
 * Três traços, dentro da régua dos cinco: o contorno dobrado e as duas
 * dobras. As dobras são o que faz o desenho ler como MAPA em 16 pontos, e não
 * como um retângulo qualquer.
 */
export function IconeMapa({ cor, tamanho = TAMANHO_PADRAO }: Props) {
  return (
    <Svg width={tamanho} height={tamanho} viewBox="0 0 24 24" fill="none">
      <Path
        d="M9 4.2 3.6 6.3a.9.9 0 0 0-.6.85v11.7a.6.6 0 0 0 .82.56L9 17.3l6 2.5 5.4-2.1a.9.9 0 0 0 .6-.85V5.15a.6.6 0 0 0-.82-.56L15 6.7Z"
        stroke={cor} strokeWidth={TRACO} strokeLinejoin="round"
      />
      <Path d="M9 4.2v13.1" stroke={cor} strokeWidth={TRACO} strokeLinecap="round" />
      <Path d="M15 6.7v13.1" stroke={cor} strokeWidth={TRACO} strokeLinecap="round" />
    </Svg>
  );
}

/** Duas pessoas: a equipe. */
export function IconeEquipe({ cor, tamanho = TAMANHO_PADRAO }: Props) {
  return (
    <Svg width={tamanho} height={tamanho} viewBox="0 0 24 24" fill="none">
      <Circle cx={9.5} cy={8} r={3.2} stroke={cor} strokeWidth={TRACO} />
      <Path
        d="M3.8 19.2a5.7 5.7 0 0 1 11.4 0"
        stroke={cor} strokeWidth={TRACO} strokeLinecap="round"
      />
      <Path
        d="M16.2 5.2a3.2 3.2 0 0 1 0 5.6M17.6 14.2a5.7 5.7 0 0 1 2.6 5"
        stroke={cor} strokeWidth={TRACO} strokeLinecap="round"
      />
    </Svg>
  );
}

/* =====================================================================
   PRAZO E GRAVIDADE
   O que o agente lê primeiro no cartão da lista, e hoje é caractere.
   ===================================================================== */

/**
 * Medidor com ponteiro: a SEVERIDADE da ocorrência.
 *
 * Acompanha o `SeloSeveridade` (baixa, média, alta, crítica), que hoje é uma
 * pílula colorida com a palavra dentro. A cor daquela pílula já é a do painel e
 * não muda; o ícone entra como terceiro canal, porque sob sol forte âmbar e
 * vermelho viram a mesma mancha clara e o que sobra é a forma mais a palavra.
 *
 * Medidor, e não triângulo de alerta: alerta é um aviso pontual, severidade é
 * uma ESCALA com quatro degraus. Reusar o triângulo aqui faria a ocorrência de
 * severidade baixa parecer um alerta.
 */
export function IconeSeveridade({ cor, tamanho = TAMANHO_PADRAO }: Props) {
  return (
    <Svg width={tamanho} height={tamanho} viewBox="0 0 24 24" fill="none">
      <Path
        d="M2.8 20v-1.8a9.2 9.2 0 0 1 18.4 0V20Z"
        stroke={cor} strokeWidth={TRACO} strokeLinejoin="round"
      />
      <Path d="M12 18.2 17.6 12.6" stroke={cor} strokeWidth={TRACO} strokeLinecap="round" />
      <Circle cx={12} cy={18.2} r={0.9} stroke={cor} strokeWidth={TRACO} />
    </Svg>
  );
}

/**
 * Relógio: o PRAZO da tarefa.
 *
 * Fica ao lado de "Vence em 9h" na lista de tarefas e dentro da vistoria, onde
 * hoje não há marca nenhuma e o prazo é mais um fragmento cinza de 12 pontos
 * no meio de outros três.
 */
export function IconePrazo({ cor, tamanho = TAMANHO_PADRAO }: Props) {
  return (
    <Svg width={tamanho} height={tamanho} viewBox="0 0 24 24" fill="none">
      <Circle cx={12} cy={12} r={8.2} stroke={cor} strokeWidth={TRACO} />
      <Path
        d="M12 7.2V12l3.4 2.2"
        stroke={cor} strokeWidth={TRACO} strokeLinecap="round" strokeLinejoin="round"
      />
    </Svg>
  );
}

/**
 * Relógio com exclamação: o prazo VENCIDO.
 *
 * Substitui o `"! "` digitado na frente do texto do prazo, em
 * `(agente)/index.tsx` e em `vistoria/[id].tsx`. Aquele caractere é o mesmo do
 * aviso de perigo e o mesmo da vulnerabilidade social, três coisas diferentes
 * com o mesmo desenho na mesma linha.
 *
 * Por que exclamação ao lado e não uma barra cortando o relógio: neste conjunto
 * a barra diagonal significa NEGAÇÃO (ver `IconeSemSinal`), e relógio cortado
 * seria lido como "sem prazo", que é o contrário de prazo estourado. Além
 * disso, a barra passaria exatamente por cima dos ponteiros, que é o que
 * distingue este ícone de um círculo qualquer.
 */
export function IconePrazoVencido({ cor, tamanho = TAMANHO_PADRAO }: Props) {
  return (
    <Svg width={tamanho} height={tamanho} viewBox="0 0 24 24" fill="none">
      <Circle cx={10} cy={13.2} r={6.8} stroke={cor} strokeWidth={TRACO} />
      <Path
        d="M10 9.2v4l2.8 1.8"
        stroke={cor} strokeWidth={TRACO} strokeLinecap="round" strokeLinejoin="round"
      />
      <Path d="M19.4 3.8v3.6" stroke={cor} strokeWidth={TRACO} strokeLinecap="round" />
      <Circle cx={19.4} cy={10.6} r={0.9} stroke={cor} strokeWidth={TRACO} />
    </Svg>
  );
}

/**
 * Coração: VULNERABILIDADE SOCIAL presente no local.
 *
 * Substitui o `"! Vulnerabilidade social"` de `(agente)/index.tsx`, que hoje é
 * um "!" tipográfico em âmbar.
 *
 * Coração e não pessoa, por dois motivos. Pessoa colidiria com `IconeEquipe`,
 * que já são duas pessoas e significa outra coisa. E a bandeira não marca uma
 * pessoa específica: ela diz que naquele endereço há quem precise de cuidado
 * prioritário (idoso, criança, pessoa com deficiência, acamado). O nome e a
 * descrição de quem é NÃO aparecem em lista, por decisão de privacidade já
 * registrada em `docs/PRIVACIDADE.md`, então o ícone precisa dizer "cuidado
 * prioritário" sem descrever ninguém.
 */
export function IconeVulnerabilidade({ cor, tamanho = TAMANHO_PADRAO }: Props) {
  return (
    <Svg width={tamanho} height={tamanho} viewBox="0 0 24 24" fill="none">
      <Path
        d="M12 20.6 4.4 13a4.7 4.7 0 0 1 6.6-6.7l1 .9 1-.9A4.7 4.7 0 0 1 19.6 13Z"
        stroke={cor} strokeWidth={TRACO} strokeLinejoin="round"
      />
    </Svg>
  );
}

/* =====================================================================
   AS PARTES DA VISTORIA
   Um por cartão do formulário, que hoje se distinguem só pelo título.
   ===================================================================== */

/** Câmera: o cartão "Fotografias" e o botão de tirar foto. */
export function IconeFoto({ cor, tamanho = TAMANHO_PADRAO }: Props) {
  return (
    <Svg width={tamanho} height={tamanho} viewBox="0 0 24 24" fill="none">
      <Path
        d="M4.6 8.4h2.9l1.3-2.2h6.4l1.3 2.2h2.9A1.6 1.6 0 0 1 21 10v8a1.6 1.6 0 0 1-1.6 1.6H4.6A1.6 1.6 0 0 1 3 18v-8a1.6 1.6 0 0 1 1.6-1.6Z"
        stroke={cor} strokeWidth={TRACO} strokeLinejoin="round"
      />
      <Circle cx={12} cy={13.8} r={3.4} stroke={cor} strokeWidth={TRACO} />
    </Svg>
  );
}

/**
 * Alfinete: o ENDEREÇO, e o botão "Abrir no mapa".
 *
 * É o mesmo traçado que hoje vive solto dentro de `vistoria/[id].tsx`, copiado
 * para cá sem mudar um número: quem migrar aquela tela troca a função local
 * por este ícone e não muda nada na aparência. Um desenho que mora dentro de
 * uma tela é um desenho que ninguém encontra para reusar, e foi assim que o
 * produto inteiro acabou com três ícones.
 *
 * O par dele é `IconeGps`, e a diferença é real: o alfinete aponta um LUGAR já
 * conhecido (abrir o endereço no mapa), a mira CAPTURA a posição do aparelho.
 */
export function IconeLocalizacao({ cor, tamanho = TAMANHO_PADRAO }: Props) {
  return (
    <Svg width={tamanho} height={tamanho} viewBox="0 0 24 24" fill="none">
      <Path
        d="M12 21.5s7-6.53 7-11.5a7 7 0 1 0-14 0c0 4.97 7 11.5 7 11.5Z"
        stroke={cor} strokeWidth={TRACO} strokeLinejoin="round"
      />
      <Circle cx={12} cy={10} r={2.6} stroke={cor} strokeWidth={TRACO} />
    </Svg>
  );
}

/** Mira: capturar a coordenada do aparelho, no cartão "Localização". */
export function IconeGps({ cor, tamanho = TAMANHO_PADRAO }: Props) {
  return (
    <Svg width={tamanho} height={tamanho} viewBox="0 0 24 24" fill="none">
      <Circle cx={12} cy={12} r={7.4} stroke={cor} strokeWidth={TRACO} />
      <Circle cx={12} cy={12} r={2.2} stroke={cor} strokeWidth={TRACO} />
      <Path
        d="M12 2.2v2.4M12 19.4v2.4M2.2 12h2.4M19.4 12h2.4"
        stroke={cor} strokeWidth={TRACO} strokeLinecap="round"
      />
    </Svg>
  );
}

/**
 * Traço sobre a linha: a ASSINATURA.
 *
 * O quadro de assinatura e o selo de "assinado" hoje usam um "✓" verde. O
 * visto diz "feito"; este diz O QUE foi feito, que num laudo de interdição é a
 * prova de que o morador estava no local.
 */
export function IconeAssinatura({ cor, tamanho = TAMANHO_PADRAO }: Props) {
  return (
    <Svg width={tamanho} height={tamanho} viewBox="0 0 24 24" fill="none">
      <Path
        d="M4.4 15.4c3.2 0 3.2-7.6 5.8-7.6 2.3 0 1.4 6.4 3.8 6.4 2 0 2.2-3 4-3"
        stroke={cor} strokeWidth={TRACO} strokeLinecap="round" strokeLinejoin="round"
      />
      <Path d="M3.4 19.4h17.2" stroke={cor} strokeWidth={TRACO} strokeLinecap="round" />
    </Svg>
  );
}

/**
 * Linhas com visto: o CHECKLIST técnico.
 *
 * Duas linhas e não quatro: em 16 pontos, quatro fileiras de visto viram uma
 * mancha. E prancheta não serve, porque `IconeTarefas` já é a prancheta e
 * significa a aba inteira.
 */
export function IconeChecklist({ cor, tamanho = TAMANHO_PADRAO }: Props) {
  return (
    <Svg width={tamanho} height={tamanho} viewBox="0 0 24 24" fill="none">
      <Path
        d="m3.4 7.4 1.7 1.7 3.4-3.6m-5.1 11.5 1.7 1.7 3.4-3.6"
        stroke={cor} strokeWidth={TRACO} strokeLinecap="round" strokeLinejoin="round"
      />
      <Path
        d="M12.4 7.2h8.2M12.4 16.4h8.2"
        stroke={cor} strokeWidth={TRACO} strokeLinecap="round"
      />
    </Svg>
  );
}

/**
 * Prédio com colunas: o ÓRGÃO a acionar.
 *
 * Serve a "Quais órgãos precisam ser acionados" na vistoria e ao órgão citado
 * no laudo. Prédio institucional, porque é disso que se trata: obras, saúde,
 * assistência social, corpo de bombeiros.
 */
export function IconeOrgao({ cor, tamanho = TAMANHO_PADRAO }: Props) {
  return (
    <Svg width={tamanho} height={tamanho} viewBox="0 0 24 24" fill="none">
      <Path
        d="M3.6 10.2 12 5.2l8.4 5"
        stroke={cor} strokeWidth={TRACO} strokeLinecap="round" strokeLinejoin="round"
      />
      <Path d="M7 11v8.2M12 11v8.2M17 11v8.2" stroke={cor} strokeWidth={TRACO} />
      <Path d="M3.6 19.4h16.8" stroke={cor} strokeWidth={TRACO} strokeLinecap="round" />
    </Svg>
  );
}

/* =====================================================================
   A FILA DE ENVIO, ESTADO POR ESTADO
   Cada `simbolo` de `descreverEstado` tem aqui o seu par desenhado.
   ===================================================================== */

/**
 * Seta voltando: a DEVOLUÇÃO da tarefa para a coordenação.
 *
 * A fila hoje distingue devolução de coleta só pela palavra, e as duas
 * compartilham os mesmos estados ("Aguardando", "Enviando", "Confirmada"), com
 * os mesmos símbolos. O agente que olha a fila de longe não vê a diferença
 * entre o trabalho que ele fez e o trabalho que ele recusou fazer.
 */
export function IconeDevolucao({ cor, tamanho = TAMANHO_PADRAO }: Props) {
  return (
    <Svg width={tamanho} height={tamanho} viewBox="0 0 24 24" fill="none">
      <Path
        d="M4.8 9.8h9.6a4.6 4.6 0 0 1 0 9.2H8.6"
        stroke={cor} strokeWidth={TRACO} strokeLinecap="round" strokeLinejoin="round"
      />
      <Path
        d="m8.4 6-3.6 3.8 3.6 3.8"
        stroke={cor} strokeWidth={TRACO} strokeLinecap="round" strokeLinejoin="round"
      />
    </Svg>
  );
}

/**
 * Ampulheta: AGUARDANDO.
 *
 * Substitui o `"…"` da fila. Três pontos é o que uma tela mostra quando ela
 * própria está pensando; aqui o aparelho não está pensando nada, está esperando
 * sinal que pode demorar horas. A ampulheta diz espera, e não processamento.
 *
 * Relógio não serve: relógio neste conjunto é PRAZO, que é do município, e
 * confundir os dois faria o agente achar que a fila tem hora para chegar.
 */
export function IconeAguardando({ cor, tamanho = TAMANHO_PADRAO }: Props) {
  return (
    <Svg width={tamanho} height={tamanho} viewBox="0 0 24 24" fill="none">
      <Path
        d="M7.6 3.8 12 12l-4.4 8.2M16.4 3.8 12 12l4.4 8.2"
        stroke={cor} strokeWidth={TRACO} strokeLinecap="round" strokeLinejoin="round"
      />
      <Path d="M6.4 3.8h11.2M6.4 20.2h11.2" stroke={cor} strokeWidth={TRACO} strokeLinecap="round" />
    </Svg>
  );
}

/**
 * Cadeado: a ação BLOQUEADA, e o porquê ao lado.
 *
 * O lugar certo dele é o botão que não pode ser tocado: "Devolver para a
 * coordenação" quando existe coleta guardada (devolver jogaria fora o
 * trabalho), e os botões desabilitados da fila. Hoje esses botões ou somem, ou
 * ficam apagados sem dizer nada, e o motivo está num comentário do código.
 *
 * Cadeado NÃO serve para o estado "bloqueado" do motor de fila: lá o rótulo é
 * "Precisa de atenção" e o desenho certo é `IconePerigo`, porque o servidor
 * recusou e alguém precisa agir. Cadeado ali prometeria uma chave que não
 * existe.
 */
export function IconeBloqueado({ cor, tamanho = TAMANHO_PADRAO }: Props) {
  return (
    <Svg width={tamanho} height={tamanho} viewBox="0 0 24 24" fill="none">
      <Path
        d="M6.2 10.6h11.6a1.6 1.6 0 0 1 1.6 1.6v6.6a1.6 1.6 0 0 1-1.6 1.6H6.2a1.6 1.6 0 0 1-1.6-1.6v-6.6a1.6 1.6 0 0 1 1.6-1.6Z"
        stroke={cor} strokeWidth={TRACO} strokeLinejoin="round"
      />
      <Path
        d="M8.4 10.6V8a3.6 3.6 0 0 1 7.2 0v2.6"
        stroke={cor} strokeWidth={TRACO} strokeLinecap="round" strokeLinejoin="round"
      />
    </Svg>
  );
}

/**
 * Caixa de arquivo: a coleta ARQUIVADA.
 *
 * Substitui o `"✕"` da fila, que é o mesmo caractere do botão de fechar de
 * qualquer aplicativo e por isso lia como "descartado" ou "deu errado".
 * Arquivada é o oposto: a ocorrência foi encerrada no painel enquanto a coleta
 * esperava sinal, o agente não errou nada, e o trabalho fica guardado como
 * registro do que foi feito. Caixa de arquivo diz exatamente isso.
 */
export function IconeArquivado({ cor, tamanho = TAMANHO_PADRAO }: Props) {
  return (
    <Svg width={tamanho} height={tamanho} viewBox="0 0 24 24" fill="none">
      <Path
        d="M3.6 5.4h16.8a1.2 1.2 0 0 1 1.2 1.2v2a1.2 1.2 0 0 1-1.2 1.2H3.6a1.2 1.2 0 0 1-1.2-1.2v-2a1.2 1.2 0 0 1 1.2-1.2Z"
        stroke={cor} strokeWidth={TRACO} strokeLinejoin="round"
      />
      <Path
        d="M4.4 9.8v8.8a1.8 1.8 0 0 0 1.8 1.8h11.6a1.8 1.8 0 0 0 1.8-1.8V9.8"
        stroke={cor} strokeWidth={TRACO} strokeLinecap="round" strokeLinejoin="round"
      />
      <Path d="M9.8 13.6h4.4" stroke={cor} strokeWidth={TRACO} strokeLinecap="round" />
    </Svg>
  );
}

/* =====================================================================
   SINAL E APARELHO
   ===================================================================== */

/** Ondas: HÁ SINAL. Acompanha sempre a palavra, na conta e na faixa. */
export function IconeSinal({ cor, tamanho = TAMANHO_PADRAO }: Props) {
  return (
    <Svg width={tamanho} height={tamanho} viewBox="0 0 24 24" fill="none">
      <Path
        d="M5.2 11.4a9.7 9.7 0 0 1 13.6 0"
        stroke={cor} strokeWidth={TRACO} strokeLinecap="round"
      />
      <Path
        d="M8.4 14.8a5.1 5.1 0 0 1 7.2 0"
        stroke={cor} strokeWidth={TRACO} strokeLinecap="round"
      />
      <Circle cx={12} cy={18.2} r={0.9} stroke={cor} strokeWidth={TRACO} />
    </Svg>
  );
}

/**
 * As mesmas ondas, cortadas: SEM SINAL.
 *
 * A barra diagonal é a convenção de negação deste conjunto, e ela existe aqui
 * e em nenhum outro lugar. O par tem que ser a MESMA figura com o corte, e não
 * duas figuras diferentes: é a repetição que faz o corte significar "não".
 */
export function IconeSemSinal({ cor, tamanho = TAMANHO_PADRAO }: Props) {
  return (
    <Svg width={tamanho} height={tamanho} viewBox="0 0 24 24" fill="none">
      <Path
        d="M5.2 11.4a9.7 9.7 0 0 1 13.6 0"
        stroke={cor} strokeWidth={TRACO} strokeLinecap="round"
      />
      <Path
        d="M8.4 14.8a5.1 5.1 0 0 1 7.2 0"
        stroke={cor} strokeWidth={TRACO} strokeLinecap="round"
      />
      <Circle cx={12} cy={18.2} r={0.9} stroke={cor} strokeWidth={TRACO} />
      <Path d="M4.4 19.6 19.6 4.4" stroke={cor} strokeWidth={TRACO} strokeLinecap="round" />
    </Svg>
  );
}

/** Telefone: ESTE APARELHO. O cartão da conta e os avisos do aparelho. */
export function IconeAparelho({ cor, tamanho = TAMANHO_PADRAO }: Props) {
  return (
    <Svg width={tamanho} height={tamanho} viewBox="0 0 24 24" fill="none">
      <Path
        d="M6.6 4.6A1.8 1.8 0 0 1 8.4 2.8h7.2a1.8 1.8 0 0 1 1.8 1.8v14.8a1.8 1.8 0 0 1-1.8 1.8H8.4a1.8 1.8 0 0 1-1.8-1.8Z"
        stroke={cor} strokeWidth={TRACO} strokeLinejoin="round"
      />
      <Path d="M10.4 18.2h3.2" stroke={cor} strokeWidth={TRACO} strokeLinecap="round" />
    </Svg>
  );
}

/* =====================================================================
   OS QUATRO TONS DO AVISO
   Hoje "i", "✓", "!" e "!", com alerta e perigo usando o MESMO caractere e
   se distinguindo só pela cor de fundo, o que contradiz a regra da casa
   escrita seis linhas acima deles em `componentes.tsx`.
   ===================================================================== */

/**
 * Triângulo com exclamação: ALERTA.
 *
 * Forma diferente de `IconePerigo`, e não só cor diferente: é a forma que
 * separa os dois para quem lê sob sol, em preto e branco, ou sem distinguir
 * âmbar de vermelho.
 */
export function IconeAlerta({ cor, tamanho = TAMANHO_PADRAO }: Props) {
  return (
    <Svg width={tamanho} height={tamanho} viewBox="0 0 24 24" fill="none">
      <Path
        d="M10.3 4.9 2.7 18.1a2 2 0 0 0 1.7 3h15.2a2 2 0 0 0 1.7-3L13.7 4.9a2 2 0 0 0-3.4 0Z"
        stroke={cor} strokeWidth={TRACO} strokeLinejoin="round"
      />
      <Path d="M12 9.6v3.6" stroke={cor} strokeWidth={TRACO} strokeLinecap="round" />
      <Circle cx={12} cy={17.4} r={0.9} stroke={cor} strokeWidth={TRACO} />
    </Svg>
  );
}

/** Octógono com exclamação: PERIGO. A placa de pare, e a mesma do trânsito. */
export function IconePerigo({ cor, tamanho = TAMANHO_PADRAO }: Props) {
  return (
    <Svg width={tamanho} height={tamanho} viewBox="0 0 24 24" fill="none">
      <Path
        d="M8.8 4.4h6.4l4.4 4.4v6.4l-4.4 4.4H8.8l-4.4-4.4V8.8Z"
        stroke={cor} strokeWidth={TRACO} strokeLinejoin="round"
      />
      <Path d="M12 8.6v3.6" stroke={cor} strokeWidth={TRACO} strokeLinecap="round" />
      <Circle cx={12} cy={15.8} r={0.9} stroke={cor} strokeWidth={TRACO} />
    </Svg>
  );
}

/** Círculo com visto: SUCESSO. Substitui o "✓" em nove lugares. */
export function IconeSucesso({ cor, tamanho = TAMANHO_PADRAO }: Props) {
  return (
    <Svg width={tamanho} height={tamanho} viewBox="0 0 24 24" fill="none">
      <Circle cx={12} cy={12} r={8.2} stroke={cor} strokeWidth={TRACO} />
      <Path
        d="m8 12.2 2.8 2.8 5.2-5.6"
        stroke={cor} strokeWidth={TRACO} strokeLinecap="round" strokeLinejoin="round"
      />
    </Svg>
  );
}

/**
 * Círculo com "i": INFORMAÇÃO.
 *
 * É também o `ⓘ` que o Rafa pediu: o parágrafo de 41 palavras da lista de
 * tarefas sai do fluxo e vira um toque neste ícone. Por isso ele precisa
 * aguentar ser um ALVO de toque de 52 pontos com o desenho em 24, e não só uma
 * decoração de 16 ao lado de um texto.
 */
export function IconeInformacao({ cor, tamanho = TAMANHO_PADRAO }: Props) {
  return (
    <Svg width={tamanho} height={tamanho} viewBox="0 0 24 24" fill="none">
      <Circle cx={12} cy={12} r={8.2} stroke={cor} strokeWidth={TRACO} />
      <Circle cx={12} cy={8} r={0.9} stroke={cor} strokeWidth={TRACO} />
      <Path d="M12 11.4v5" stroke={cor} strokeWidth={TRACO} strokeLinecap="round" />
    </Svg>
  );
}

/* =====================================================================
   O SINO
   ===================================================================== */

/**
 * Sino: os AVISOS do município, no canto direito do cabeçalho de toda tela.
 *
 * Nasceu junto com `ui/Sino.tsx`, que é o único lugar que o desenha hoje: até
 * então o sino do agente não tinha desenho nenhum, porque morava escondido
 * dentro do Perfil e o número aparecia só como crachá na aba. Quando o dono
 * pediu "o sininho de notificações", a pergunta primeira foi qual sino, e a
 * resposta é a convencional: campânula com o badalo embaixo. É o pictograma
 * que todo aplicativo do telefone do agente já usa para a mesma coisa, e este
 * conjunto se afasta de convenção só quando ela mente (ver `IconeAguardando`).
 *
 * Três traços, dentro da régua dos cinco: a campânula, o badalo e o pino de
 * cima. O badalo é um arco SEPARADO do corpo, com vão de 3 no `viewBox`, e o
 * vão não é enfeite: é ele que faz o desenho ler como sino em 16 pontos, em
 * vez de como um copo virado. O pino de cima é o ponto de onde o sino balança
 * quando chega aviso novo, e `ui/Sino.tsx` gira o desenho em torno dele.
 */
export function IconeSino({ cor, tamanho = TAMANHO_PADRAO }: Props) {
  return (
    <Svg width={tamanho} height={tamanho} viewBox="0 0 24 24" fill="none">
      <Path
        d="M5.6 17.2 6.8 15.4V11a5.2 5.2 0 0 1 10.4 0v4.4l1.2 1.8Z"
        stroke={cor} strokeWidth={TRACO} strokeLinejoin="round"
      />
      <Path d="M12 3.6v2.2" stroke={cor} strokeWidth={TRACO} strokeLinecap="round" />
      <Path
        d="M10 20.2a2 2 0 0 0 4 0"
        stroke={cor} strokeWidth={TRACO} strokeLinecap="round"
      />
    </Svg>
  );
}

/**
 * O registro de tudo que existe, e ele não é decoração de arquivo.
 *
 * Ele serve a duas coisas. A primeira é o portão: `icones.test.tsx` percorre
 * este objeto e cobra de cada desenho o traço, o `viewBox`, o tamanho, a cor e
 * a ausência de preenchimento. Um ícone novo que não entre aqui escaparia dos
 * portões, então o portão também cobra que todo `Icone*` exportado esteja
 * neste registro.
 *
 * A segunda é a Onda 2: quem for migrar uma tela lê esta lista e sabe o que já
 * existe, em vez de desenhar o vigésimo quinto à mão dentro da própria tela,
 * que foi como o alfinete do mapa nasceu.
 */
export const ICONES = {
  tarefas: IconeTarefas,
  mapa: IconeMapa,
  envio: IconeEnvio,
  equipe: IconeEquipe,
  severidade: IconeSeveridade,
  prazo: IconePrazo,
  prazoVencido: IconePrazoVencido,
  vulnerabilidade: IconeVulnerabilidade,
  foto: IconeFoto,
  localizacao: IconeLocalizacao,
  gps: IconeGps,
  assinatura: IconeAssinatura,
  checklist: IconeChecklist,
  orgao: IconeOrgao,
  devolucao: IconeDevolucao,
  aguardando: IconeAguardando,
  bloqueado: IconeBloqueado,
  arquivado: IconeArquivado,
  sinal: IconeSinal,
  semSinal: IconeSemSinal,
  aparelho: IconeAparelho,
  alerta: IconeAlerta,
  perigo: IconePerigo,
  sucesso: IconeSucesso,
  informacao: IconeInformacao,
  sino: IconeSino,
} as const satisfies Record<string, ComponenteDeIcone>;

/** O nome de um ícone do conjunto, para quem guarda a escolha em dado. */
export type NomeDeIcone = keyof typeof ICONES;
