import { useState } from "react";
import { Link } from "react-router-dom";
import { interesseMunicipioSchema, ROTULO_FAIXA_POPULACAO } from "@dc360/shared";
import { registrarInteresse } from "../dados/repositorio";
import { Aviso, AvisoDeObrigatorios } from "../componentes/comuns";
import { Campo } from "../componentes/Campo";
import { digitosDoTelefone, mascararTelefone } from "@dc360/shared";
import { useTitulo } from "../seo/titulo";

/**
 * A porta de entrada de quem ainda não é cliente.
 *
 * É a única tela do produto que não exige login e que não pertence a município
 * nenhum. Quem chega aqui é um coordenador que ouviu falar do sistema, e a
 * pergunta que ele tem na cabeça não é "quais são as funcionalidades": é "isso
 * serve para mim, e quanto custa o meu tempo para descobrir".
 *
 * Por isso a tela responde três coisas ANTES de pedir qualquer dado, e o
 * formulário vem depois. Pedir primeiro e explicar depois é o que faz todo
 * mundo fechar a aba.
 *
 * O que ela deliberadamente NÃO faz: criar município, criar conta, dar acesso.
 * Ela grava um pedido de contato. Provisionar continua sendo ato deliberado.
 */

const CAMPOS_VAZIOS = {
  nome: "", cargo: "", email: "", telefone: "",
  municipio: "", uf: "", orgao: "",
  faixaPopulacao: "", quantosAgentes: "", mensagem: "",
};

export function QueroConhecer() {
  useTitulo("Quero conhecer");
  const [campos, setCampos] = useState(CAMPOS_VAZIOS);
  const [erros, setErros] = useState<Record<string, string>>({});
  const [falha, setFalha] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [pronto, setPronto] = useState<string | null>(null);

  function alterar(campo: keyof typeof CAMPOS_VAZIOS, valor: string) {
    setCampos((c) => ({ ...c, [campo]: valor }));
  }

  async function enviar(evento: React.FormEvent) {
    evento.preventDefault();
    if (enviando) return;

    const resultado = interesseMunicipioSchema.safeParse({
      nome: campos.nome,
      cargo: campos.cargo || undefined,
      email: campos.email,
      telefone: digitosDoTelefone(campos.telefone) || undefined,
      municipio: campos.municipio,
      uf: campos.uf,
      orgao: campos.orgao || undefined,
      faixaPopulacao: campos.faixaPopulacao || undefined,
      quantosAgentes: campos.quantosAgentes || undefined,
      mensagem: campos.mensagem || undefined,
      origem: "site",
    });

    if (!resultado.success) {
      const mapa: Record<string, string> = {};
      for (const issue of resultado.error.issues) {
        const campo = String(issue.path[0] ?? "geral");
        mapa[campo] ??= issue.message;
      }
      setErros(mapa);
      // Sem isto, um erro na raiz do esquema deixaria o formulário mudo: o
      // botão volta ao normal e nada aparece na tela.
      if (!mapa["nome"] && !mapa["email"] && !mapa["municipio"] && !mapa["uf"]) {
        setFalha(resultado.error.issues[0]?.message ?? "Confira os campos.");
      }
      return;
    }

    setErros({});
    setFalha(null);
    setEnviando(true);
    try {
      setPronto(await registrarInteresse(resultado.data));
    } catch (e: unknown) {
      setFalha(e instanceof Error ? e.message : String(e));
      setEnviando(false);
    }
  }

  if (pronto) {
    return (
      <div className="entrada">
        <div className="entrada__painel">
          <div className="entrada__marca">
            <span className="entrada__sigla" aria-hidden="true">DC</span>
            <div>
              <h1 className="entrada__titulo">Pedido recebido</h1>
            </div>
          </div>
          <Aviso tom="sucesso">{pronto}</Aviso>
          <p className="entrada__subtitulo">
            Se preferir adiantar, tenha à mão o número de agentes de campo e
            como vocês registram as ocorrências hoje: é sobre isso que a
            conversa começa.
          </p>
          <Link to="/entrar" className="botao botao--discreto">Voltar</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="entrada">
      <div className="entrada__painel entrada__painel--largo">
        <div className="entrada__marca">
          <span className="entrada__sigla" aria-hidden="true">DC</span>
          <div>
            <h1 className="entrada__titulo">Defesa Civil Operacional 360</h1>
            <p className="entrada__subtitulo">
              Do chamado do morador ao encerramento auditável, com vistoria de
              campo que funciona sem sinal.
            </p>
          </div>
        </div>

        {/*
          As três respostas antes do formulário. Sem elas, o formulário é um
          pedido de dado sem contrapartida.
        */}
        <ul className="lista-valor">
          <li>
            <strong>O agente trabalha sem internet.</strong> Ele baixa as
            vistorias designadas antes de sair, coleta no local mesmo sem sinal,
            e o envio acontece sozinho quando a conexão volta, sem perder nem
            duplicar registro.
          </li>
          <li>
            <strong>O laudo sai do sistema, não do Word.</strong> Com protocolo,
            fotos, coordenada, quem assinou e quando, no mesmo formato sempre.
          </li>
          <li>
            <strong>A providência tem desfecho registrado.</strong> O que foi
            encaminhado a outra secretaria fica com resposta e data, e é isso
            que responde a quem diz que a Defesa Civil só tira foto.
          </li>
        </ul>

        <p className="entrada__subtitulo">
          Preencha e alguém entra em contato. Não criamos acesso nenhum a partir
          deste formulário.
        </p>

        <form onSubmit={enviar} noValidate>
          {falha && <Aviso tom="perigo">{falha}</Aviso>}
          <AvisoDeObrigatorios />

          <div className="linha-campos">
            <Campo id="ic-municipio" rotulo="Município" erro={erros["municipio"]}>
              {(campo) => (
                <input
                  {...campo} value={campos.municipio}
                  onChange={(e) => alterar("municipio", e.target.value)}
                  autoComplete="off"
                />
              )}
            </Campo>
            <Campo id="ic-uf" rotulo="UF" largura="curto" erro={erros["uf"]}>
              {(campo) => (
                <input
                  {...campo} value={campos.uf} maxLength={2}
                  onChange={(e) => alterar("uf", e.target.value.toUpperCase())}
                  autoComplete="off"
                />
              )}
            </Campo>
          </div>

          <Campo id="ic-orgao" rotulo="Órgão" opcional>
            {(campo) => (
              <input
                {...campo} value={campos.orgao}
                onChange={(e) => alterar("orgao", e.target.value)}
                placeholder="Coordenadoria Municipal de Proteção e Defesa Civil"
                autoComplete="off"
              />
            )}
          </Campo>

          <div className="linha-campos">
            <Campo id="ic-nome" rotulo="Seu nome" erro={erros["nome"]}>
              {(campo) => (
                <input
                  {...campo} value={campos.nome}
                  onChange={(e) => alterar("nome", e.target.value)}
                  autoComplete="name"
                />
              )}
            </Campo>
            <Campo id="ic-cargo" rotulo="Seu cargo" opcional>
              {(campo) => (
                <input
                  {...campo} value={campos.cargo}
                  onChange={(e) => alterar("cargo", e.target.value)}
                  autoComplete="organization-title"
                />
              )}
            </Campo>
          </div>

          <div className="linha-campos">
            <Campo id="ic-email" rotulo="Email" erro={erros["email"]}>
              {(campo) => (
                <input
                  {...campo} type="email" value={campos.email}
                  onChange={(e) => alterar("email", e.target.value)}
                  autoComplete="email"
                />
              )}
            </Campo>
            {/* Mesma máscara da abertura de ocorrência, pela mesma razão:
                o número entra por duas portas e precisa sair igual das duas. */}
            <Campo id="ic-telefone" rotulo="Telefone" opcional>
              {(campo) => (
                <input
                  {...campo} type="tel" inputMode="tel" value={campos.telefone}
                  onChange={(e) => alterar("telefone", mascararTelefone(e.target.value))}
                  autoComplete="tel" placeholder="(48) 9 9999-0000"
                />
              )}
            </Campo>
          </div>

          <div className="linha-campos">
            <Campo id="ic-faixa" rotulo="Porte do município" opcional>
              {(campo) => (
                <select
                  {...campo} value={campos.faixaPopulacao}
                  onChange={(e) => alterar("faixaPopulacao", e.target.value)}
                >
                  <option value="">Prefiro não dizer</option>
                  {Object.entries(ROTULO_FAIXA_POPULACAO).map(([valor, rotulo]) => (
                    <option key={valor} value={valor}>{rotulo}</option>
                  ))}
                </select>
              )}
            </Campo>
            <Campo id="ic-agentes" rotulo="Agentes" opcional largura="curto">
              {(campo) => (
                <input
                  {...campo} type="number" min={0} max={999}
                  value={campos.quantosAgentes}
                  onChange={(e) => alterar("quantosAgentes", e.target.value)}
                />
              )}
            </Campo>
          </div>

          <Campo id="ic-mensagem" rotulo="Alguma coisa que a gente deva saber" opcional>
            {(campo) => (
              <textarea
                {...campo} value={campos.mensagem} rows={3}
                onChange={(e) => alterar("mensagem", e.target.value)}
                placeholder="Como vocês registram as ocorrências hoje, o que mais atrapalha, prazos que estão apertando"
              />
            )}
          </Campo>

          <button type="submit" className="botao botao--primario" disabled={enviando}>
            {enviando ? "Enviando" : "Quero conhecer"}
          </button>
        </form>

        <p className="entrada__subtitulo">
          Já usa o sistema? <Link to="/entrar">Entrar</Link>
        </p>
      </div>
    </div>
  );
}
