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
| [DECLARACAO-NAS-LOJAS.md](DECLARACAO-NAS-LOJAS.md) | O que a App Store e a Play Store perguntam sobre dados, e a resposta que o código sustenta. É o que alguém copia para os dois formulários |

**Os três primeiros têm campos marcados `[[assim]]`**: razão social, CNPJ,
encarregado de dados, prazos de retenção. São decisões que não podem ser
inventadas, e enquanto houver um `[[ ]]` o documento não vai para o ar.

## Para implantar e treinar

| Documento | Para quem |
| --- | --- |
| [IMPLANTACAO.md](IMPLANTACAO.md) | Quem conduz a implantação. Traz o que precisa ser decidido ANTES de qualquer tela |
| [CARTAO-DO-AGENTE.md](CARTAO-DO-AGENTE.md) | Uma página, para imprimir e plastificar. Vai no bolso, junto com o aparelho |
| [GUIA-DO-COORDENADOR.md](GUIA-DO-COORDENADOR.md) | Quem manda no fluxo operacional |
| [SEGURANCA-DO-AGENTE.md](SEGURANCA-DO-AGENTE.md) | Quem decide se o produto atende o município. O que a declaração de saída a campo faz, **o que ela não faz**, e o procedimento que a prefeitura precisa escrever antes de ligar o recurso. **Em construção:** o servidor e a tela da coordenação estão prontos, o aplicativo do agente ainda não declara a saída |
| [PAPEIS_E_RESPONSABILIDADES.md](PAPEIS_E_RESPONSABILIDADES.md) | Quem faz o quê no sistema |

## Para operar e migrar

| Documento | Para quem |
| --- | --- |
| [COLOCAR-DE-PE.md](COLOCAR-DE-PE.md) | Subir servidor, banco, domínio e o aplicativo |
| [VERCEL-PAINEL.md](VERCEL-PAINEL.md) | Publicar o painel |
| [DICIONARIO-DE-DADOS.md](DICIONARIO-DE-DADOS.md) | O que cada tabela e cada coluna significam. Deve acompanhar a exportação de saída, mas o pacote gerado pela API ainda não o inclui: é entregue à parte |
| [RESTORE-DO-BANCO.md](RESTORE-DO-BANCO.md) | O roteiro de restore do banco, provado a frio e repetido pelo CI (a Parte 6 de `COLOCAR-DE-PE.md` é o registro histórico) |
| [LIGAR-O-EMAIL.md](LIGAR-O-EMAIL.md) | Ligar o e-mail de recuperação de senha e de ofício: conta, domínio e variáveis |
| [ARMAZENAMENTO.md](ARMAZENAMENTO.md) | O teto de armazenamento por município e a varredura de objeto órfão, com os comandos do operador |
| [POLITICA-DE-TESTE-VERMELHO.md](POLITICA-DE-TESTE-VERMELHO.md) | Quem escreve código: o que fazer com teste vermelho e teste pulado (T42) |
| [apresentacao/](apresentacao/README.md) | A apresentação de 15/09/2026 (HTML e PDF): retrato do que estava feito naquele dia, e não a fonte do estado de hoje |

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

Três regras, que já pegaram erro real neste projeto:

1. **Dependência nova que toque dado do município entra em `SUBPROCESSADORES.md`
   no mesmo commit.** Se a variável de ambiente nova aponta para um serviço de
   terceiro, aquela tabela cresce junto.
2. **Permissão nova no binário do aplicativo, ou dado novo saindo do aparelho,
   muda `DECLARACAO-NAS-LOJAS.md` no mesmo trabalho.** Aquele arquivo é copiado
   para dois formulários que a pessoa assina, e resposta desatualizada ali não é
   documento envelhecido: é declaração falsa, e a loja derruba a submissão.
3. **A seção 6 de `PRIVACIDADE.md` lista o que NÃO está pronto.** Quando algo
   dali ficar pronto, a lista encolhe no mesmo trabalho. Ela erra nas duas
   direções: prometer o que não existe é enganar, e esconder o que já existe é
   perder crédito por modéstia desatualizada.
