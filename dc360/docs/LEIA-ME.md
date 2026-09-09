# Documentos do produto

Índice do que existe em `docs/`, para quem chega e para quem vai vender.
O `README.md` na raiz continua sendo o documento técnico principal.

---

## Para o município, antes de assinar

| Documento | Responde a pergunta |
| --- | --- |
| [PRIVACIDADE.md](PRIVACIDADE.md) | Que dados vocês tratam, por quanto tempo ficam, e o que o cidadão pode pedir |
| [SUBPROCESSADORES.md](SUBPROCESSADORES.md) | Quem mais toca no nosso dado, e onde ficam os servidores. Traz a cláusula de operador para o contrato |
| [SAIDA-DE-MUNICIPIO.md](SAIDA-DE-MUNICIPIO.md) | E se um dia eu quiser sair? |
| [INDISPONIBILIDADE.md](INDISPONIBILIDADE.md) | E se cair no dia do temporal? |

**Os três primeiros têm campos marcados `[[assim]]`**: razão social, CNPJ,
encarregado de dados, prazos de retenção. São decisões que não podem ser
inventadas, e enquanto houver um `[[ ]]` o documento não vai para o ar.

## Para implantar e treinar

| Documento | Para quem |
| --- | --- |
| [IMPLANTACAO.md](IMPLANTACAO.md) | Quem conduz a implantação. Traz o que precisa ser decidido ANTES de qualquer tela |
| [CARTAO-DO-AGENTE.md](CARTAO-DO-AGENTE.md) | Uma página, para imprimir e plastificar. Vai no bolso, junto com o aparelho |
| [GUIA-DO-COORDENADOR.md](GUIA-DO-COORDENADOR.md) | Quem manda no fluxo operacional |
| [PAPEIS_E_RESPONSABILIDADES.md](PAPEIS_E_RESPONSABILIDADES.md) | Quem faz o quê no sistema |

## Para operar e migrar

| Documento | Para quem |
| --- | --- |
| [COLOCAR-DE-PE.md](COLOCAR-DE-PE.md) | Subir servidor, banco, domínio e o aplicativo |
| [VERCEL-PAINEL.md](VERCEL-PAINEL.md) | Publicar o painel |
| [DICIONARIO-DE-DADOS.md](DICIONARIO-DE-DADOS.md) | O que cada tabela e cada coluna significam. Vai junto com a exportação de saída |

## As decisões que governam o produto

As decisões de arquitetura ficam em `../../docs/adr/`, fora de `dc360/`, porque
algumas são anteriores a ele. As que mais mordem o dia a dia:

| ADR | O que decide |
| --- | --- |
| 0001 | Isolamento entre municípios no banco. É a regra número um, e todas as outras se dobram a ela |
| 0002 | A trilha é append-only por ausência de policy, e não por disciplina de código |
| 0003 | O painel roda em dois modos: banco na própria aba, ou HTTP contra a API |
| 0006 | Ninguém acima do administrador do município, e o sistema de postos |
| 0008 | Console do fornecedor sem credencial que enxergue dois municípios. Suplanta um ponto da 0006 |

---

## Como manter isto honesto

Estes documentos são a metade da venda, e um documento desatualizado vale menos
que nenhum: ele transforma o produto em promessa quebrada na primeira
conferência.

Duas regras, que já pegaram erro real neste projeto:

1. **Dependência nova que toque dado do município entra em `SUBPROCESSADORES.md`
   no mesmo commit.** Se a variável de ambiente nova aponta para um serviço de
   terceiro, aquela tabela cresce junto.
2. **A seção 6 de `PRIVACIDADE.md` lista o que NÃO está pronto.** Quando algo
   dali ficar pronto, a lista encolhe no mesmo trabalho. Ela erra nas duas
   direções: prometer o que não existe é enganar, e esconder o que já existe é
   perder crédito por modéstia desatualizada.
