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
| Toda tabela do município: ocorrências, vistorias, providências, equipes, usuários, órgãos, ofícios, avisos, aparelhos, trilha de auditoria e registro de acesso | Um `CSV` por tabela, `UTF-8`, mais o mesmo conteúdo em `JSON` | `CSV` abre no Excel da prefeitura sem ninguém instalar nada. `JSON` preserva estrutura aninhada que o `CSV` achata |
| Fotografias e assinaturas | Arquivos originais, em pastas por protocolo | Prova técnica precisa do arquivo, não de uma miniatura |
| Laudos, termos de interdição e de desinterdição, ofícios | `HTML` autossuficiente, um arquivo por documento | O `HTML` do produto já carrega o estilo dentro dele: abre em qualquer navegador, daqui a dez anos, sem servidor, e imprime em `PDF` de dentro do navegador. O pacote NÃO traz `PDF` pronto: gerar milhares deles numa requisição só derrubaria o servidor, e o `PDF` seria uma segunda cópia do mesmo documento |
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

**A ferramenta existe.** `POST /saida/pacote.zip`, no painel de quem administra
o município, produz o pacote inteiro num arquivo só. Exige permissão de
administrador, registra o ato na trilha e no registro de exportações, e **não
apaga nada**: a eliminação continua sendo o passo 6, depois da conferência do
município.

| Peça | Estado |
| --- | --- |
| Exportação das tabelas em `CSV` e `JSON` | **Existe.** Uma planilha e um `JSON` por tabela, e são TODAS as tabelas do município, inclusive as que o banco ganhou depois (órgão, ofício, aviso, aparelho, registro de consulta). Um teste compara a lista com o que o banco tem, então tabela nova de migração futura obriga alguém a decidir se ela sai |
| Exportação das fotografias e assinaturas | **Existe.** Arquivos originais, em pastas por protocolo. O que o banco promete e o armazenamento não tem vai para `PENDENCIAS-DA-EXTRACAO.txt` em vez de sumir |
| Exportação dos documentos gerados | **Existe** para laudo, termo de interdição, termo de desinterdição e ofício, em `HTML` autossuficiente (estilo dentro do arquivo, imagens apontando para a pasta do próprio pacote). **Não sai em `PDF`**: o `HTML` imprime, e gerar milhares de `PDF` numa requisição só derrubaria o servidor |
| Índice ligando protocolo a arquivo | **Existe.** `INDICE.html` (abre por duplo clique, sem internet) e `INDICE.csv` na raiz, ligando protocolo, pasta, documentos e a linha correspondente de `tabelas/ocorrencias.csv` |
| Esquema do banco | **Existe.** `esquema/`, com as próprias migrações comentadas, que explicam o que cada coluna significa |
| Soma de verificação | **Existe.** `SOMAS-SHA256.txt`, um `SHA-256` por arquivo do pacote |
| Dicionário de dados | `DICIONARIO-DE-DADOS.md`, e ele **ainda não vai dentro do pacote**: é entregue à parte |
| Declaração de eliminação | **Não existe** modelo |

### O que o pacote NÃO leva, de propósito

Senha, hash de senha, token de sessão, link de redefinição e ficha de
notificação não saem. São material de credencial, e não dado do município:
entregá-los num arquivo que viaja por email ou pen drive seria entregar acesso.
O `LEIA-ME.txt` do próprio pacote diz isso a quem o recebe.

### O que continua manual

- A **declaração de eliminação** do passo 6 é redigida à mão. Sem modelo, ela
  depende de alguém lembrar o que precisa estar escrito nela.
- A **entrega** (por qual meio, para quem) continua sendo combinada caso a
  caso. O pacote traz a soma de verificação; conferi-la é ato de quem recebe.
- O **dicionário de dados** é anexado à parte.

Enquanto a declaração de eliminação não tiver modelo, o passo 6 depende de
trabalho manual, e isso precisa ser dito ao município em vez de escondido
atrás do procedimento bonito acima.
