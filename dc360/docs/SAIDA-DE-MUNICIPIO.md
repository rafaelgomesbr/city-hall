# Plano de saída de município

- **Versão:** 1, de 09/09/2026

Um município que não consegue sair não escolheu ficar: ficou preso. Aprisionar
cliente por dificuldade de saída é, além de indefensável, argumento de venda
contra nós na primeira pergunta difícil de um secretário. Este documento existe
para que a resposta a "e se um dia eu quiser sair?" seja um procedimento
escrito, e não uma promessa.

**A saída é direito contratual**, e está na cláusula 9 de `SUBPROCESSADORES.md`.

---

## 1. O que o município leva

Tudo que é dele, em formato aberto, sem precisar do nosso software para ler.

| O que | Formato | Por que assim |
| --- | --- | --- |
| Ocorrências, vistorias, providências, equipes, usuários, trilha de auditoria | Um `CSV` por tabela, `UTF-8`, mais o mesmo conteúdo em `JSON` | `CSV` abre no Excel da prefeitura sem ninguém instalar nada. `JSON` preserva estrutura aninhada que o `CSV` achata |
| Fotografias e assinaturas | Arquivos originais, em pastas por protocolo | Prova técnica precisa do arquivo, não de uma miniatura |
| Laudos, termos de interdição e de desinterdição, ofícios | `HTML` autossuficiente, um arquivo por documento, mais `PDF` | O `HTML` do produto já carrega o estilo dentro dele: abre em qualquer navegador, daqui a dez anos, sem servidor |
| Esquema do banco | `SQL` de criação, comentado | Quem for migrar precisa entender o que cada coluna significa |
| Dicionário de dados | `Markdown` | `status = 'em_campo'` não se explica sozinho |

**Um índice na raiz** liga protocolo a pasta, a documento e a linha do `CSV`.
Sem ele, o município recebe dez mil arquivos e nenhuma forma de achar o de
ontem.

---

## 2. Como acontece

| Passo | Quem | Prazo |
| --- | --- | --- |
| 1. Pedido formal de saída | Município | Marca o início |
| 2. Confirmação, com data da extração combinada | Fornecedor | 2 dias úteis |
| 3. Extração e conferência | Fornecedor | `[[prazo]]` dias |
| 4. Entrega, por meio combinado, com soma de verificação | Fornecedor | Junto com o passo 3 |
| 5. **Conferência pelo município**, e é ele quem diz que está completo | Município | `[[prazo]]` dias |
| 6. Eliminação das cópias, com declaração escrita | Fornecedor | Após o passo 5 |

O passo 5 não é formalidade. **Nada é apagado antes de o município confirmar que
recebeu e conferiu.** A ordem inversa já destruiu dado de gente em outros
produtos, e o erro é sempre o mesmo: apagar contra o calendário em vez de contra
a confirmação.

O sistema continua no ar durante todo o processo. Corte de acesso na data do
pedido seria punição, e uma Defesa Civil sem sistema é uma Defesa Civil às
cegas.

---

## 3. O que fica conosco, e por quanto tempo

Depois do passo 6, o fornecedor retém apenas:

- **Registro de que o município existiu e saiu**, com as datas. É o que permite
  responder a uma auditoria futura.
- **Cópias de segurança que ainda não venceram**, porque elas são íntegras e não
  se editam seletivamente. Vencem no ciclo normal, em `[[prazo do ciclo]]`, e a
  declaração de eliminação diz explicitamente qual é essa data.

Nada mais. Sem cópia "para o caso de voltar", sem base de dados agregada, sem
"anonimizado para melhorar o produto".

---

## 4. Estado da implementação

Honestamente: **o procedimento está escrito, a ferramenta não está pronta.**

| Peça | Estado |
| --- | --- |
| Exportação das tabelas em `CSV` e `JSON` | Existe exportação no painel, e ela cobre parte das tabelas. Falta cobrir todas e falta o `JSON` |
| Exportação das fotografias e assinaturas | **Não existe.** Hoje sairia por acesso direto ao armazenamento, à mão |
| Exportação dos documentos gerados | **Não existe** em lote. Um a um, pela tela |
| Índice ligando protocolo a arquivo | **Não existe** |
| Dicionário de dados | `DICIONARIO-DE-DADOS.md` |
| Declaração de eliminação | **Não existe** modelo |

Enquanto a ferramenta não existe, a saída é executável **à mão**, por quem tem
acesso ao servidor, e leva dias em vez de horas. Isso é sustentável para um
município e não é para dez.

**Enquanto este quadro tiver "não existe", a cláusula 9 do contrato depende de
trabalho manual, e isso precisa ser dito ao município em vez de escondido atrás
do procedimento bonito acima.**
