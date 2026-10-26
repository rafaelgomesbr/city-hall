// Compara a regra da rodada anterior (por frase, com lista de radicais de
// palavras inteiras) com a regra por classe, sobre as promessas plantadas.
// A regra anterior está copiada aqui como estava antes desta rodada.
import { promessasEm, LARGAR_E_PROMETER } from "../../../../../../dc360/scripts/portao-sem-promessa-de-segundo-plano-do-aplicativo.test.mjs";

const ENVIO = /(?<![\p{L}])(sai|saem|sair|sobe|sobem|subir|envia|enviam|enviar|enviada|enviado|enviadas|enviados|envio|envios|sincroniza[\p{L}]*|sincronização|chega|chegam|chegar|segue|seguem|roda|rodam|transmit[\p{L}]+|drena[\p{L}]*)(?![\p{L}])/iu;
const AUTONOMIA = /(?<![\p{L}])(?<!não [\p{L}]+ )sozinh[oa]s?(?![\p{L}])|(?<![\p{L}])automátic[oa]s?(?![\p{L}])|(?<![\p{L}])automaticamente(?![\p{L}])|(?<![\p{L}])continu(a|am|ar|ará|arão) (tentando|enviando|subindo|sincronizando|a tentar|a enviar|a subir)(?![\p{L}])|(?<![\p{L}])segue(?![\p{L}])|(?<![\p{L}])seguem(?![\p{L}])|(?<![\p{L}])roda(?![\p{L}])|(?<![\p{L}])rodam(?![\p{L}])|(?<![\p{L}])quando (houver|tiver|voltar) (o )?(sinal|rede|conexão|internet)(?![\p{L}])|(?<![\p{L}])quando (o|a) (sinal|rede|conexão|internet) (voltar|houver|estiver)(?![\p{L}])|(?<![\p{L}])sem (você |a gente )?(tocar|abrir|precisar|mexer|ligar)(?![\p{L}])|(?<![\p{L}])fechar(?![\p{L}])|(?<![\p{L}])fechad[oa]s?(?![\p{L}])|(?<![\p{L}])fechou(?![\p{L}])|(?<![\p{L}])a qualquer (momento|hora)(?![\p{L}])/iu;
const CONDICAO = /\babert[oa]s?\b/i;
const LISTA = /segundo[ -]plano|\bbackground\b|nos bastidores|plano de fundo|\bde fundo\b|(aplicativo|app) fechado|mesmo fechado|fechou o (aplicativo|app)|fechar (o|este|esse) (aplicativo|app)|(mesmo )?sem (precisar )?abrir (o|este|esse) (aplicativo|app)|\bmesmo sem abrir\b|(aparelho|celular) (bloqueado|guardado|no bolso)|assim que houver (sinal|rede|conexão)/i;
const antiga = (f) => LISTA.test(f) || (ENVIO.test(f) && AUTONOMIA.test(f) && !CONDICAO.test(f));

const EXTRAS = [
  "Já tentou 3x. Vai tentar de novo em instantes.",
  "Pode fechar o aplicativo. O envio termina.",
];
let passouAntes = 0, passouAgora = 0;
for (const f of [...LARGAR_E_PROMETER, ...EXTRAS]) {
  const a = !antiga(f), n = promessasEm(`"${f}"`).length === 0;
  passouAntes += a; passouAgora += n;
  console.log(`${a ? "PASSOU " : "reprova"} | ${n ? "PASSOU " : "reprova"} | ${f}`);
}
console.log(`\nregra anterior deixou passar ${passouAntes} de ${LARGAR_E_PROMETER.length + EXTRAS.length}; regra por classe deixou passar ${passouAgora}.`);
