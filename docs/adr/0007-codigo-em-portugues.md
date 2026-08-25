# ADR 0007: identificador de código em português, como exceção declarada

- **Data da decisão:** 25/08/2026
- **Situação:** aceita, em vigor
- **Contraria:** a regra 21 da constituição do time
  (`C:\Projetos\vingadores\docs\constituicao.md`), que manda documentação e
  comentário em português do Brasil e **identificador de código em inglês**.

## Contexto

Todo o código de `dc360/` nomeia em português: `ocorrencias`, `providencias`,
`trilha_eventos`, `exigirPermissao`, `organizacao_id`, `proximo_protocolo`,
`chave_storage`. Isso vale para tabela, coluna, função de banco, tipo, variável
e nome de arquivo.

Isso viola a regra 21. A regra existe por bons motivos: código em inglês é
legível por qualquer desenvolvedor, casa com o vocabulário das bibliotecas e
evita a mistura feia de `getOcorrenciaById`.

O problema é que aqui os dois lados da regra colidem:

1. **O domínio é jurídico brasileiro e não tem tradução fiel.** COBRADE,
   protocolo, interdição, laudo, providência, vistoria, situação de emergência,
   estado de calamidade pública, matrícula. Traduzir "providência" para
   `measure` ou `action` perde exatamente o que a palavra significa no processo
   administrativo, e o `CLAUDE.md` deste repositório exige terminologia correta
   do domínio, o que já é uma regra concorrente.
2. **Os documentos que o sistema gera são em português**, e o campo do banco é o
   campo do laudo. Um `laudo.motivo_encerramento` sai impresso; um
   `report.closure_reason` teria que ser traduzido de volta na hora de imprimir,
   e é aí que aparece a divergência entre o nome no banco e o nome no papel.
3. **Quem mantém é brasileiro**, e o interlocutor do produto é servidor público
   municipal, que descreve o problema com essas palavras exatas.
4. **O custo de mudar hoje é alto e o retorno é zero.** São perto de dezoito mil
   linhas de código e SQL, mais nove mil de teste, e a parte que mais dói é o
   banco: renomear coluna significa migração, e o ADR 0002 diz que histórico
   aplicado não se reescreve. Seria uma migração grande de risco puro, sem
   nenhum ganho de comportamento.

## Decisão

O código de `dc360/` continua em português, e isto fica registrado como
**exceção declarada à regra 21**, não como descuido.

Regras que continuam valendo, sem exceção:

- Palavra reservada, API de biblioteca e convenção de framework continuam como
  são: `useEffect`, `beforeAll`, `createHash`. Não se traduz o que não é nosso.
- Nada de mistura dentro do mesmo identificador: é `buscarOcorrencia`, nunca
  `getOcorrencia`.
- Sem acento e sem cedilha em identificador (`organizacao_id`, `providencias`),
  para não depender de codificação de arquivo em ferramenta nenhuma. Acento vive
  no texto, no comentário e na interface.
- Documentação, comentário e mensagem ao usuário continuam em português do
  Brasil, que é o outro lado da regra 21 e esse continua obedecido.

Escopo: vale só para `dc360/`. Um repositório novo, de outro domínio, começa em
inglês.

## Consequências

Boas:

- O nome no banco, o nome no código, o nome na tela e o nome no laudo são a
  mesma palavra. Não há camada de tradução onde erro se esconde.
- A conversa com o cliente e o nome do campo coincidem, o que encurta o
  levantamento de requisito.
- Zero risco de migração de renomeação em cima de um esquema com RLS e chaves
  estrangeiras compostas.

Ruins, e elas são o preço:

- **Um desenvolvedor que não fale português tem uma barreira a mais.** Se o
  projeto crescer para além de quem escreve português, isto vira dívida real.
- Mistura visual inevitável na fronteira com biblioteca:
  `app.get("/ocorrencias", async (requisicao, resposta) => ...)`.
- Contraria a regra do time, e regra contrariada uma vez fica mais fácil de
  contrariar de novo. Daí este registro existir: a exceção é nomeada, datada e
  limitada a um repositório.
- Qualquer ferramenta ou modelo que assuma inglês (geração de código,
  autocompletar, análise estática com heurística de nome) rende um pouco menos.

## Alternativas descartadas

| Alternativa | Por que não |
| --- | --- |
| Traduzir tudo para inglês agora | Migração de banco em esquema com RLS e chaves estrangeiras compostas, mais a reescrita dos testes, sem nenhum ganho de comportamento. Risco puro. |
| Inglês só nas camadas novas | Produz as duas convenções no mesmo repositório, que é pior que qualquer uma delas sozinha. O ponto de tradução vira o ponto de bug. |
| Inglês no código, português só no banco | O mapeamento entre `closureReason` e `motivo_encerramento` teria que ser mantido à mão em cada consulta e em cada esquema Zod. |
| Deixar sem registrar | É o que faz a discussão voltar do zero em três meses, e a próxima pessoa concluir que foi descuido. |

## Onde isto vive

- Em todo o `dc360/`. Exemplos representativos:
  `dc360/db/migrations/001_base.sql`,
  `dc360/packages/shared/src/dominio.ts`,
  `dc360/packages/shared/src/permissoes.ts`.
- Não há teste que imponha esta decisão, e é proposital: um teste que exigisse
  português em identificador brigaria com toda biblioteca importada. O que
  existe é este registro, e a revisão humana.
