import type { ReactNode } from "react";
import { ErroCampo } from "./comuns";

/**
 * Rótulo, controle, erro e texto de apoio, amarrados uma vez só.
 *
 * O painel repetia esta amarração à mão: 53 `htmlFor` espalhados por onze
 * arquivos, cada um com quatro atributos que precisam concordar entre si
 * (`htmlFor`/`id`, `aria-describedby`, `aria-invalid`, `required`). Nenhum
 * deles quebra a tela quando falta, e é isso que os torna perigosos:
 *
 * - sem `aria-describedby` apontando para o erro, quem navega por teclado
 *   chega no campo, ouve só o rótulo, corrige no escuro e descobre o motivo
 *   ao enviar de novo. O erro está na tela, vermelho, dois centímetros
 *   abaixo, e não existe para quem não enxerga;
 * - sem `aria-invalid`, o leitor de tela não diz que o campo está inválido:
 *   a borda vermelha é a única pista, e ela é cor sozinha, que é a coisa que
 *   este produto se proibiu de fazer;
 * - sem `required`, "obrigatório" existe só na convenção do rótulo.
 *
 * Por isso o conteúdo vem como FUNÇÃO e não como filho solto: assim o
 * controle não tem como ser escrito sem receber a amarração. Esquecer de
 * espalhar `{...campo}` no `<input>` é visível na hora, ao contrário de
 * esquecer um atributo no meio de doze.
 *
 *     <Campo id="motivo" rotulo="Motivo do encerramento" erro={erro}
 *            dica="O banco recusa encerramento sem motivo.">
 *       {(campo) => <textarea {...campo} value={motivo} onChange={...} />}
 *     </Campo>
 */

/** O que o controle recebe pronto. Espalhe tudo, sem escolher. */
export type LigacoesDoCampo = {
  id: string;
  required?: boolean;
  "aria-invalid"?: true;
  "aria-describedby"?: string;
};

/** Os `id` derivados do campo, um por texto que pode descrevê-lo. */
export function idsDoCampo(id: string): { dica: string; erro: string } {
  return { dica: `${id}-dica`, erro: `${id}-erro` };
}

/**
 * A amarração, calculada num lugar só.
 *
 * O ERRO vem antes da dica em `aria-describedby` de propósito: a ordem da
 * lista é a ordem em que o leitor de tela fala, e quem está corrigindo um
 * campo precisa ouvir primeiro o que está errado, não o texto de apoio que já
 * ouviu quando preencheu.
 *
 * `aria-invalid` só aparece quando há erro. Escrever `aria-invalid="false"` no
 * campo em repouso não é errado, mas polui o anúncio de todo formulário do
 * painel com uma informação que ninguém pediu.
 */
export function ligacoesDoCampo({ id, opcional = false, erro = null, temDica = false }: {
  id: string;
  opcional?: boolean;
  erro?: ReactNode;
  temDica?: boolean;
}): LigacoesDoCampo {
  const ids = idsDoCampo(id);
  const descrevem = [erro ? ids.erro : null, temDica ? ids.dica : null].filter(Boolean);
  return {
    id,
    ...(opcional ? {} : { required: true }),
    ...(erro ? { "aria-invalid": true as const } : {}),
    ...(descrevem.length > 0 ? { "aria-describedby": descrevem.join(" ") } : {}),
  };
}

export type PropsCampo = {
  id: string;
  rotulo: ReactNode;
  /**
   * Opcional marca a EXCEÇÃO, que é a convenção deste painel: o rótulo ganha
   * "(opcional)" e o controle perde o `required`. As duas coisas de uma vez,
   * porque separadas elas divergem.
   */
  opcional?: boolean;
  /** A mensagem do esquema compartilhado, ou do 422 do servidor. */
  erro?: ReactNode;
  /** O que a pessoa precisa saber ANTES de digitar. */
  dica?: ReactNode;
  /** Largura da caixa: as classes de `app.css` (`campo--curto` e as outras). */
  largura?: "curto" | "medio" | "longo";
  children: (ligacoes: LigacoesDoCampo) => ReactNode;
};

export function Campo({ id, rotulo, opcional = false, erro, dica, largura, children }: PropsCampo) {
  const ids = idsDoCampo(id);
  const ligacoes = ligacoesDoCampo({ id, opcional, erro, temDica: Boolean(dica) });

  return (
    <div className={`campo${largura ? ` campo--${largura}` : ""}`}>
      <label htmlFor={id}>
        {rotulo}
        {opcional && " (opcional)"}
      </label>
      {children(ligacoes)}
      {/*
        O erro fica colado no controle, e a dica embaixo dele. Quem enxerga lê
        de cima para baixo e encontra primeiro o que impede o envio; quem
        escuta recebe a mesma ordem pelo `aria-describedby`. Dica e erro em
        ordens diferentes nos dois canais é o começo de uma tela que "está
        certa" para quem a escreveu e confusa para quem a usa.
      */}
      {erro && <ErroCampo id={ids.erro}>{erro}</ErroCampo>}
      {dica && <span className="campo__dica" id={ids.dica}>{dica}</span>}
    </div>
  );
}
