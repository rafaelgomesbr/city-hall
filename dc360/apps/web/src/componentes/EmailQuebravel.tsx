import { Fragment } from "react";

/**
 * Onde um email pode quebrar de linha: depois do "@" e depois de cada ponto, e
 * em nenhum outro lugar.
 *
 * O defeito (V2-F00-E09, correção 4, defeito 3 da arbitragem da rodada 5): a
 * linha do email na coluna "Pessoa" de Usuários usava `overflow-wrap: anywhere`,
 * que deixa o navegador cortar onde a coluna acabar, e a coluna acabava no meio
 * de "serraalta.ex / emplo.gov.br" e de "exemplo.gov.b / r". Email cortado no
 * meio da palavra é ilegível e, pior, parece outro endereço. Quebrar depois do
 * "@" e dos pontos mantém cada pedaço inteiro e deixa a linha seguinte
 * reconhecível (menos o último ponto: o fim, "gov.br", anda junto).
 *
 * A função é pura e separada do componente para poder ser provada sem navegador:
 * os pedaços, juntos, têm de dar o email de volta, sem perder nem acrescentar
 * caractere (o `<wbr>` não é caractere, e por isso copiar o email da tela
 * continua dando o endereço certo).
 */
export function pedacosDoEmail(email: string): string[] {
  const pedacos = email.match(/[^@.]+[@.]?|[@.]/g) ?? [email];
  /*
    O último ponto NÃO é lugar de quebra: "gov." numa linha e "br" sozinho na
    seguinte (visto a 1440 px) deixa a sílaba final órfã e o endereço
    ilegível. O fim ("gov.br", "com.br") anda junto.
  */
  const ultimo = pedacos.length - 1;
  if (ultimo >= 1 && pedacos[ultimo - 1]!.endsWith(".")) {
    return [...pedacos.slice(0, ultimo - 1), pedacos[ultimo - 1]! + pedacos[ultimo]!];
  }
  return pedacos;
}

export function EmailQuebravel({ email }: { email: string }) {
  return (
    <>
      {pedacosDoEmail(email).map((pedaco, i) => (
        <Fragment key={i}>{i > 0 && <wbr />}{pedaco}</Fragment>
      ))}
    </>
  );
}
