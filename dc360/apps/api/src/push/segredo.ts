/**
 * O carregamento das credenciais de push, isolado do arranque.
 *
 * Mora em modulo proprio, e nao no `index.ts`, por uma razao pratica: o
 * `index.ts` SOBE O SERVIDOR ao ser importado, entao nada que viva la pode ser
 * exercitado por teste. Uma funcao que decide como uma chave privada e lida
 * precisa de teste, e precisa em especial do teste que prova que ela NAO
 * despeja o segredo em mensagem de erro.
 */
import { readFileSync } from "node:fs";

/**
 * Lê um segredo do disco, na partida, e nunca depois.
 *
 * A chave `.p8` da APNs assina notificação para QUALQUER aplicativo do time:
 * quem a obtém escreve na tela bloqueada de um agente de Defesa Civil, e uma
 * ordem falsa de evacuação escrita ali tira gente de casa de madrugada.
 *
 * Duas decisões neste punhado de linhas:
 *
 *   1. Ler UMA VEZ, aqui, e passar adiante como texto. Assim existe um único
 *      ponto do código que toca o disco atrás de segredo, e os módulos de
 *      envio não têm como espalhar leitura de arquivo.
 *   2. A mensagem de erro nomeia o CAMINHO e o código do sistema de arquivos,
 *      nunca o conteúdo. Um erro que despeja a chave no log do servidor
 *      transforma um problema de configuração num vazamento.
 */
export function lerSegredoDoDisco(caminho: string, oQueE: string): string {
  /*
    CAMINHO OU CONTEÚDO, e o segundo é o que funciona no Fly.

    O caminho de arquivo é o modo natural em máquina de desenvolvimento, e foi
    como isto nasceu. Só que a imagem que sobe para produção NÃO CARREGA a
    chave: `apps/campo/segredos/` é ignorado pelo git e pelo Docker, de
    propósito, porque o `.p8` assina notificação para qualquer aplicativo do
    time e não pode viajar dentro de uma imagem que qualquer um com acesso ao
    registro consegue baixar.

    A consequência, se isto não existisse: `PUSH_ATIVO=sim` derrubaria a partida
    em produção com ENOENT, e o único jeito de contornar seria justamente
    embarcar a chave na imagem, que é o que não pode acontecer.

    Então o valor também pode ser o CONTEÚDO da chave, e é assim que ele chega
    em produção: `fly secrets set APNS_CHAVE="$(cat AuthKey_XXXX.p8)"`. O
    segredo vive na área de segredos do provedor e é injetado como variável de
    ambiente, sem tocar em imagem, em repositório nem em disco.

    A distinção é feita pelo próprio conteúdo, e não por uma variável a mais:
    quem começa com o cabeçalho de PEM ou abre chave em JSON é conteúdo; o resto
    é caminho. Uma variável de modo seria mais uma coisa para configurar errado
    às três da manhã.
  */
  const valor = caminho.trim();
  if (valor.startsWith("-----BEGIN") || valor.startsWith("{")) return valor;

  try {
    return readFileSync(valor, "utf8");
  } catch (erro) {
    const codigo = (erro as { code?: string }).code ?? "desconhecido";
    throw new Error(
      `Não foi possível ler ${oQueE} em ${descreverSemVazar(valor)} (${codigo}). ` +
      "Confira o caminho e a permissão do arquivo, ou passe o CONTEÚDO da chave " +
      "na própria variável (é assim em produção: fly secrets set), " +
      "ou desligue com PUSH_ATIVO=nao.",
    );
  }
}

/**
 * O valor, como ele pode aparecer numa mensagem de erro.
 *
 * Existe porque a mesma variável agora pode carregar um caminho OU uma chave
 * privada, e a mensagem de erro não tem como saber qual das duas recebeu. Um
 * `.p8` colado sem o cabeçalho de PEM, ou uma conta de serviço colada sem as
 * chaves, cai no caminho de arquivo e falha: se a mensagem ecoasse o valor,
 * a chave privada iria inteira para o log do servidor, e um erro de
 * configuração viraria vazamento. Esta função foi escrita depois de o teste
 * `a mensagem de erro NUNCA carrega o segredo` reprovar exatamente assim.
 *
 * O critério é conservador de propósito: só é ecoado o que PARECE caminho de
 * verdade. Caminho tem uma linha, é curto, e não tem espaço em branco no meio.
 * Qualquer outra coisa vira descrição, e quem lê o erro ainda sabe o que fazer,
 * porque a frase seguinte já diz as três saídas.
 */
function descreverSemVazar(valor: string): string {
  const pareceCaminho = valor.length <= 200 && !/\s/.test(valor);
  return pareceCaminho ? valor : `(conteúdo de ${valor.length} caracteres, não é caminho)`;
}
