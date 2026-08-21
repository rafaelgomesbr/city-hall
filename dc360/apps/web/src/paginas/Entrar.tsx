import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ROTULO_PAPEL } from "@dc360/shared";
import { contasDisponiveis, type ContaDisponivel } from "../dados/repositorio";
import { useSessao } from "../estado/sessao";
import { Aviso, Carregando, iniciais } from "../componentes/comuns";

/**
 * Entrada da aplicação.
 *
 * Nesta fase não há senha: a lista de contas serve para escolher com qual
 * papel e de qual município se está operando. Isso é deliberado e temporário.
 * O que importa é que a escolha aqui é a ÚNICA origem da organização usada no
 * SET LOCAL do RLS, exatamente como um token verificado será depois.
 *
 * Dois municípios aparecem na lista porque o isolamento entre eles é a coisa
 * mais importante a demonstrar: entrar como Vale Fundo e não achar nenhum
 * protocolo de Serra Alta é a prova, não a promessa.
 */
export function Entrar() {
  const [contas, setContas] = useState<ContaDisponivel[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const { entrar } = useSessao();
  const navegar = useNavigate();

  useEffect(() => {
    contasDisponiveis()
      .then(setContas)
      .catch((e: unknown) => setErro(e instanceof Error ? e.message : String(e)));
  }, []);

  function escolher(c: ContaDisponivel) {
    entrar({
      organizacaoId: c.organizacao_id,
      organizacaoNome: c.organizacao_nome,
      municipio: c.municipio,
      uf: c.uf,
      usuarioId: c.usuario_id,
      usuarioNome: c.usuario_nome,
      papel: c.papel,
    });
    navegar("/painel");
  }

  if (erro) {
    return (
      <div className="entrada">
        <div className="entrada__painel">
          <Aviso tom="perigo">
            Não foi possível preparar o banco local: {erro}
          </Aviso>
        </div>
      </div>
    );
  }

  if (!contas) {
    return <Carregando mensagem="Preparando o banco de dados local (Postgres em WebAssembly)" />;
  }

  const municipios = [...new Set(contas.map((c) => `${c.municipio}, ${c.uf}`))];

  return (
    <div className="entrada">
      <div className="entrada__painel">
        <div className="entrada__marca">
          <span className="entrada__sigla" aria-hidden="true">DC</span>
          <div>
            <h1 className="entrada__titulo">Defesa Civil Operacional 360</h1>
            <p className="entrada__subtitulo">Escolha o município e o perfil para entrar</p>
          </div>
        </div>

        <section className="cartao">
          <div className="cartao__corpo">
            {municipios.map((m) => (
              <div key={m}>
                <p className="lista-contas__grupo">{m}</p>
                <div className="lista-contas">
                  {contas
                    .filter((c) => `${c.municipio}, ${c.uf}` === m)
                    .map((c) => (
                      <button key={c.usuario_id} type="button" className="conta" onClick={() => escolher(c)}>
                        <span className="conta__avatar" aria-hidden="true">{iniciais(c.usuario_nome)}</span>
                        <span>
                          <span className="conta__nome">{c.usuario_nome}</span>
                          <br />
                          <span className="conta__meta">{ROTULO_PAPEL[c.papel]}</span>
                        </span>
                      </button>
                    ))}
                </div>
              </div>
            ))}
          </div>
        </section>

        <p style={{
          marginTop: "var(--ds-sp-4)", textAlign: "center",
          fontSize: "var(--ds-fs-caption)", lineHeight: "var(--ds-lh-caption)",
          color: "var(--ds-text-muted)",
        }}>
          Ambiente de validação. Dados fictícios, nenhum dado real de pessoa.
          O isolamento entre municípios é imposto pelo banco (Row Level Security forçada),
          não pela interface.
        </p>
      </div>
    </div>
  );
}
