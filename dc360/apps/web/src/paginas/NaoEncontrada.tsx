import { Link } from "react-router-dom";
import { Vazio } from "../componentes/comuns";
import { IconeVoltar } from "../componentes/Icones";
import { useTitulo } from "../seo/titulo";

/**
 * A página que não existe, dita com todas as letras.
 *
 * O ACHADO (revisão de 15/09/2026): `/nao-existe` redirecionava em silêncio
 * para o painel, e `/ocorrencias/abc` mostrava "invalid input syntax for
 * type uuid", em inglês, vindo do banco. Os dois são o mesmo defeito: um
 * endereço errado (link antigo numa mensagem, dedo na barra de endereço)
 * chegava sem explicação. Redirecionar calado faz a pessoa achar que o link
 * abriu a coisa certa; a frase do banco faz a pessoa achar que o sistema
 * quebrou.
 *
 * A tela diz o que aconteceu e oferece um caminho de volta. Ela é a mesma
 * para a rota desconhecida e para o identificador inválido; quem chama diz
 * para onde voltar.
 */
export function NaoEncontrada({
  titulo = "Esta página não existe",
  explicacao = "O endereço pode ter sido digitado errado, ou o link que você recebeu já não vale.",
  voltarPara = "/painel",
  rotuloDoVoltar = "Voltar ao painel",
}: {
  titulo?: string;
  explicacao?: string;
  voltarPara?: string;
  rotuloDoVoltar?: string;
}) {
  useTitulo(titulo);
  return (
    <section className="cartao">
      <Vazio titulo={titulo}>
        <p className="texto-apoio">{explicacao}</p>
        <Link to={voltarPara} className="botao botao--secundario">
          <IconeVoltar /> {rotuloDoVoltar}
        </Link>
      </Vazio>
    </section>
  );
}

/**
 * O identificador de ocorrência que a rota aceita: um UUID. Qualquer outra
 * coisa nem chega ao banco, porque a resposta do banco para isso é uma frase
 * em inglês sobre sintaxe, e não "não existe".
 */
export function ehIdentificadorValido(id: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
}
