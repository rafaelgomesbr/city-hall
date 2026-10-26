# Plano de saída de município

- **Versão:** 2, de 15/09/2026 (a versão 1 é de 09/09/2026; o que mudou foi o capítulo 5, a eliminação)

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

O sistema continua no ar do passo 1 ao passo 5. Corte de acesso na data do
pedido seria punição, e uma Defesa Civil sem sistema é uma Defesa Civil às
cegas: por isso a extração (passo 3) acontece com o acesso normal, e o
município baixa o pacote pelo próprio painel enquanto continua trabalhando.

O corte acontece em dois momentos, e só neles (capítulo 5): quando o
fornecedor **suspende** o acesso (contrato em discussão), e quando ele
**agenda a eliminação** do passo 6, que suspende na hora. Com o acesso
suspenso, ninguém do município entra, e o próprio pacote de saída deixa de
sair pelo painel: a rota é uma escrita, toda escrita confere a suspensão, e a
resposta é 403 `acesso_suspenso` (ver "O que o painel diz quando o pacote não
sai", no capítulo 4). Por isso a ordem importa: **o pacote se baixa e se
confere ANTES de a eliminação ser agendada**. Se o contrato precisar que o
município suspenso ainda consiga sair, é decisão a tomar e registrar (hoje é
premissa na seção 9 do STATUS do roadmap, perto do CP-29).

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
| O laudo do pacote diz o mesmo que o laudo emitido | **Só em parte. O aviso de equipe divergente, a coordenada da vistoria, a assinatura declarada cujo arquivo falta no armazenamento, a assinatura coletada e perdida no aparelho e a seção dos registros que não puderam ser recuperados saem iguais (provado), no laudo e no termo de interdição; três diferenças continuam até a V2-F09-E02, e uma quarta é deliberada: com o armazenamento sem resposta na hora de conferir a assinatura, o documento da rota imprime "Assinatura não coletada" e o do pacote imprime "Não foi possível conferir a assinatura no armazenamento ao montar este pacote".** No pacote, a seção de fotografias mistura as fotos de todas as vistorias do protocolo (inclusive a foto avulsa, que o laudo da rota separa), falta a seção "Fotografias anexadas ao protocolo" que o laudo da rota imprime, e o termo de interdição de um protocolo que recebeu re-vistoria depois da interdição sai da vistoria vigente (a re-vistoria), enquanto a segunda via da rota sai da vistoria que sustentou o ato. Quem usar os documentos do pacote como substitutos dos emitidos, sem conferir, pode ler um laudo com foto atribuída à vistoria errada, ou um termo de interdição com os dados de uma vistoria que não foi a do ato. O aviso de equipe passou a ser provado em 2026-10-06: até então a consulta de vistorias do montador do pacote juntava só `usuarios`, nunca as duas equipes da vistoria: o laudo que ia DENTRO do pacote saía sem o aviso de equipe divergente, enquanto o laudo que a rota `GET /documentos/:id/laudo` emitia, para a mesma vistoria, saía com ele. O município que levasse o pacote embora levaria o papel limpo, e é esse o papel que fica no processo depois de o contrato acabar. Agora as duas junções existem nos dois montadores, e o teste compara os dois documentos entre si: a seção 29 de `apps/web/test/fluxo-api.e2e.mjs` monta a divergência pela API de verdade (a coordenação despacha para a Equipe Bravo, o agente da Equipe Alfa envia a coleta), baixa o pacote pelo botão do painel e confere que o trecho do aviso é idêntico nos dois. Em 2026-10-13 a coordenada passou a sair igual também (duas colunas que a consulta do pacote não lia), e em 2026-10-14 a assinatura que falta no armazenamento (o pacote imprimia uma imagem quebrada em cima do nome de quem estava no local, onde o da rota imprime "Assinatura não coletada"; agora os dois conferem o arquivo antes de imprimir). Na mesma data ficou decidido o caso do armazenamento que não responde à conferência: a rota trata a falta de resposta como ausência, e o pacote, que é o registro que fica com o município depois que as nossas cópias são eliminadas, não afirma ausência que ninguém viu e também não imprime a imagem, que sairia quebrada se a cópia do arquivo falhasse junto (a falta de leitura vai para `PENDENCIAS-DA-EXTRACAO.txt` como arquivo NÃO LIDO). Em 2026-10-15 o pacote passou a ler os registros perdidos da vistoria vigente: quando a assinatura foi coletada e se perdeu no aparelho, o laudo e o termo de interdição do pacote imprimiam "Assinatura não coletada", o contrário do que o próprio pacote exporta em `tabelas/vistoria_evidencias_perdidas.csv`, enquanto os da rota imprimem "Assinatura coletada em campo e não recuperada do aparelho"; agora os dois imprimem a mesma frase e a mesma seção dos registros perdidos. Desde então o pacote imprime "Assinatura não coletada" em três casos, e só neles: o banco não registra assinatura nem a perda dela; o armazenamento respondeu que o arquivo da assinatura declarada não existe; ou a chave gravada não começa pelo prefixo do município (`tenant/<município>/`), caso em que `conferirAssinatura` (`apps/api/src/saida/pacote.ts`) responde "ausente" sem perguntar ao armazenamento, como `enderecoDaAssinatura` faz na rota. O terceiro não acontece pela API: a sincronização remonta a chave a partir do município do token e aproveita do aparelho só o nome do arquivo (`apps/api/src/rotas/sincronizacao.ts`), e o banco recusa chave fora do prefixo (restrição `assinatura_com_prefixo_do_tenant`, migração 009); a conferência no pacote é a camada seguinte, para um registro gravado por fora da aplicação. O bloco "campo por campo" de `apps/api/test/saida-de-municipio.test.ts` prende as três diferenças que restam, a deliberada e as consertadas: ele reprova se alguma das três for consertada, se a deliberada mudar, ou se uma das consertadas voltar, para este texto ser atualizado junto. Ele não compara os documentos inteiros (olha os títulos das seções, a coordenada, a posição da foto avulsa, a seção dos registros perdidos e o bloco da assinatura de quem estava no local, no laudo e, nos casos da assinatura perdida e da re-vistoria, no termo de interdição), então uma diferença nova noutro campo passa por ele sem reprovar |
| Índice ligando protocolo a arquivo | **Existe.** `INDICE.html` (abre por duplo clique, sem internet) e `INDICE.csv` na raiz, ligando protocolo, pasta, documentos e a linha correspondente de `tabelas/ocorrencias.csv` |
| Esquema do banco | **Existe.** `esquema/`, com as próprias migrações comentadas, que explicam o que cada coluna significa |
| Soma de verificação | **Existe.** `SOMAS-SHA256.txt`, um `SHA-256` por arquivo do pacote (menos ele mesmo) |
| Botão no painel | **Existe e está provado de ponta a ponta.** Em Organização (só para quem administra), "Baixar pacote de saída" chama `POST /saida/pacote.zip`, renova o token se ele venceu e entrega `dc360-pacote-de-saida-AAAA-MM-DD.zip`. Até 2026-10-06 o botão chamava `/pacote.zip` (sem o prefixo) e todo clique dava 404: ninguém via, porque o teste da API chamava a rota certa direto. A prova que faltava é a seção 28 de `apps/web/test/fluxo-api.e2e.mjs`, que clica no botão, recebe o arquivo pelo navegador, abre o ZIP e confere o que há dentro (índice, tabelas, laudo, soma SHA-256 de cada arquivo, só linhas do município de quem pediu, nenhuma coluna que nunca sai) |
| Dicionário de dados | `DICIONARIO-DE-DADOS.md`, e ele **ainda não vai dentro do pacote**: é entregue à parte |
| Declaração de eliminação | **Não existe** modelo |

### O que o pacote NÃO leva, de propósito

Senha, hash de senha, token de sessão, link de redefinição, ficha de
notificação e o segredo da verificação em duas etapas não saem. São material de
credencial, e não dado do município: entregá-los num arquivo que viaja por
email ou pen drive seria entregar acesso. No caso da verificação em duas etapas
há uma razão a mais: o segredo dela só tem valor com a chave de cifra do
servidor de origem, que o município não leva nem pode levar, então o que sairia
seria um envelope inútil para quem recebe e perigoso para quem guarda. O que
importa sobre ela vai junto de qualquer forma, na trilha administrativa: quando
cada conta ligou e quando desligou.
O `LEIA-ME.txt` do próprio pacote diz isso a quem o recebe.

### O que o painel diz quando o pacote não sai

A tela mostra a frase que o servidor mandou, e não a inventa: quem não administra
recebe "Seu perfil não tem permissão para alterar os dados do município."; município
com o acesso suspenso recebe a frase de contrato (procurar quem administra o contrato
na prefeitura); sem rede, "Sem conexão com o servidor. O arquivo não foi baixado."
Atenção ao que isso significa para a saída: a suspensão do acesso vale também para
este botão (a rota é uma escrita, e toda escrita confere a suspensão), então município
suspenso não baixa o pacote pelo painel até o acesso voltar. Se o contrato quiser que
o município suspenso ainda possa sair, é decisão a registrar (hoje é premissa, na seção
9 do STATUS do roadmap).

### O que continua manual

- A **declaração de eliminação** do passo 6 é redigida à mão. Sem modelo, ela
  depende de alguém lembrar o que precisa estar escrito nela.
- A **entrega** (por qual meio, para quem) continua sendo combinada caso a
  caso. O pacote traz a soma de verificação; conferi-la é ato de quem recebe.
- O **dicionário de dados** é anexado à parte.

Enquanto a declaração de eliminação não tiver modelo, o passo 6 depende de
trabalho manual, e isso precisa ser dito ao município em vez de escondido
atrás do procedimento bonito acima.

### O risco que continua aberto: dois montadores de documento

Os dados que o laudo imprime são montados em DOIS lugares, com duas consultas
diferentes: `apps/api/src/rotas/documentos.ts` (o laudo que o navegador abre) e
`apps/api/src/saida/pacote.ts` (o laudo que vai dentro do ZIP). As duas
consultas precisam ler os mesmos campos, e foi a divergência entre elas que
produziu o defeito do aviso de equipe. Um conserto numa delas continua podendo
não chegar à outra. A unificação está planejada para a V2-F09-E02; até ela
existir, campo novo que o laudo imprima tem de entrar nas duas consultas, e o
teste que compara os dois documentos entre si (seção 29 do e2e, mais os casos de
`apps/api/test/saida-de-municipio.test.ts`) é o que avisa, nos campos que ele compara, quando isso é
esquecido. A pendência está registrada em `apps/api/PENDENCIAS.md`.

As diferenças que existem HOJE entre os documentos da rota e os do pacote (laudo e
termo de interdição), para a mesma vistoria (medidas em 2026-10-13; a da assinatura
declarada achada pela validação de 4b96ea7 e consertada em 2026-10-14, a do
armazenamento sem resposta decidida no mesmo dia; a da assinatura perdida achada pela
validação de 52952a1 e consertada em 2026-10-15 junto com a seção dos registros
perdidos, e a do termo de interdição depois de re-vistoria achada na varredura dessa
correção; todas geradas pela API rodando e travadas no bloco "campo por campo" do
teste):

| Diferença | Laudo da rota | Laudo do pacote | Estado |
| --- | --- | --- | --- |
| Aviso de equipe divergente | imprime | imprime, igual | **Igual** (E12) |
| Coordenada da vistoria | imprime | imprime, igual | **Igual** (consertada na correção 1 da E12) |
| Fotos do registro fotográfico | só as da vistoria vigente | as de TODAS as vistorias e a avulsa, numeradas como da vistoria | **Diferente** até a F09-E02 |
| Seção "Fotografias anexadas ao protocolo" (fotos avulsas, com quem anexou) | imprime | não existe | **Diferente** até a F09-E02 |
| Seção "Registros capturados que não puderam ser recuperados" | imprime, só as perdas da vistoria vigente | imprime, igual, no laudo e no termo de interdição (não existia até 2026-10-15) | **Igual** (consertada na correção 3 da E12) |
| Termo de interdição de protocolo que recebeu re-vistoria depois da interdição | a segunda via sai da vistoria que sustentou o ato (a gravada na emissão do termo) | sai da vistoria vigente, a re-vistoria | **Diferente** até a F09-E02 |
| Assinatura presente no armazenamento | imagem | imagem, e o arquivo vai no pacote | **Igual** |
| Vistoria sem assinatura e sem perda registrada | "Assinatura não coletada" | "Assinatura não coletada" | **Igual** |
| Assinatura coletada em campo e perdida no aparelho (`vistoria_evidencias_perdidas` com papel `assinatura`) | "Assinatura coletada em campo e não recuperada do aparelho", no laudo e no termo de interdição | a mesma frase (imprimia "Assinatura não coletada" até 2026-10-15, contra o próprio `tabelas/vistoria_evidencias_perdidas.csv` do pacote) | **Igual** (consertada na correção 3 da E12) |
| Assinatura declarada e ausente no armazenamento | "Assinatura não coletada" | "Assinatura não coletada" (imprimia imagem quebrada até 2026-10-14), e a falta fica registrada em `PENDENCIAS-DA-EXTRACAO.txt` | **Igual** (consertada na correção 2 da E12) |
| Assinatura declarada e o armazenamento SEM RESPOSTA na conferência | "Assinatura não coletada" | "Não foi possível conferir a assinatura no armazenamento ao montar este pacote", sem imagem; o arquivo vai no pacote se a cópia funcionar, e senão fica em `PENDENCIAS-DA-EXTRACAO.txt` como NÃO LIDO | **Diferente, de propósito** (correção 2 da E12): o pacote não afirma ausência que ninguém conferiu |
| Endereço das imagens, identificador da emissão e quem consta como emitente | endereço assinado, identificador próprio, quem emitiu o laudo | caminho relativo dentro do pacote, quem baixou o pacote | Esperado, não é defeito |

---

## 5. A eliminação: o último capítulo da saída

O passo 6 deixou de ser `DELETE` à mão com a credencial de dono. Ele é um ato
do console do fornecedor, com prazo de arrependimento, executado por um relógio
da API e guardado pelo estado do banco. Este capítulo diz o que acontece, em que
ordem, e o que ainda não acontece.

### O que o fornecedor pode fazer, e o que cada ato significa

| Ato | Quem | O que muda | Reversível |
| --- | --- | --- | --- |
| **Suspender o acesso** | Dono do console, com segundo fator | Ninguém do município entra; as sessões abertas caem; o aparelho de campo passa a ler "acesso suspenso pelo fornecedor" | Sim, pelo mesmo console |
| **Agendar a eliminação** | Dono do console, com segundo fator e motivo escrito | Suspende na hora e marca a data: **sete dias** depois do pedido, no mínimo. O prazo é regra do banco, não da tela | Sim, durante os sete dias (cancelar não reativa o acesso: são dois atos) |
| **Executar** | O relógio da API, sozinho | Ver abaixo | **Não** |

Suspender é o estado de "contrato em discussão". Eliminar é o passo 6 deste
plano, e só faz sentido depois do passo 5: **o município conferiu o pacote e
disse que está completo**. O console não sabe se o passo 5 aconteceu; quem sabe
é quem agenda, e o motivo escrito no livro é onde isso fica dito.

### O que a suspensão faz no dia a dia

- **Entrar** responde "o acesso deste município foi suspenso pelo fornecedor,
  procure quem administra o contrato". Nunca "senha errada": a senha está certa.
  E a frase só sai para quem provou a senha, senão a tela de entrada viraria
  lista de quais prefeituras estão em discussão.
- **Quem já estava dentro**: escrita (registrar ocorrência, despachar,
  sincronizar vistoria) é recusada na hora. Leitura com token vivo dura até o
  token vencer, quinze minutos, que é a mesma janela que o produto já aceita
  quando um usuário é desativado. Suspensão contratual não é incidente de
  segurança, e quinze minutos de leitura não praticam ato nem mudam dado do
  município. Mas abrir o dossiê de uma ocorrência (e a busca) grava uma linha
  em `ocorrencia_consultas` (o registro de quem leu dado de cidadão, sem o
  dado), e essa linha entra mesmo sob suspensão: dizer que a leitura "não
  cria registro nenhum" seria falso. E é o comportamento decidido: em
  26/10/2026 o Rafael escolheu manter o registro da leitura sob suspensão
  (H43), porque saber quem leu dado de cidadão vale também, e principalmente,
  durante uma disputa de contrato. A vigência da leitura com token vivo
  continua sendo da F03-E03.
- **O aparelho de campo** recebe uma recusa própria, inclusive com o token
  vencido, e a tela diz a frase certa sem oferecer "entrar de novo". **A coleta
  que estava no aparelho não se perde**: a API responde à fila de sincronização
  com um código que ela trata como temporário, então a vistoria feita no morro
  espera no aparelho, com uma tentativa a cada cinco minutos no máximo, e sobe
  sozinha se o acesso for reativado. O que não acontece é a coleta ser gravada
  sob contrato suspenso.

### O que o relógio faz, em três fases

O console **só escreve a intenção**. Ele não tem credencial do armazenamento de
fotografias (ADR 0008) e não tem como apagar nada. Quem executa é um relógio na
API, a cada quinze minutos e na partida, com trava entre as duas máquinas de
produção para as duas não purgarem o mesmo prefixo ao mesmo tempo.

1. **O banco.** Uma função privilegiada apaga todas as linhas do município, na
   ordem das chaves estrangeiras, confere que restou zero em cada tabela (um
   apagamento pela metade e calado é o pior desfecho possível, e a função
   estoura nomeando a tabela em vez de devolver sucesso), grava no livro
   quantas linhas saíram de cada tabela, e marca a organização como eliminada.
   A linha da organização **fica**, de propósito: é ela que diz "ainda há
   fotografias por apagar".
2. **O armazenamento.** A API percorre tudo o que existe sob o prefixo do
   município, página a página, e apaga objeto a objeto, contando. O prefixo é
   conferido antes da primeira listagem: só `tenant/<id do próprio
   município>/` é aceito, para um defeito na função nunca virar purga do balde
   inteiro.
3. **A conclusão.** Só com a purga **completa**, a API manda o banco marcar a
   purga, apagar a linha da organização e fechar o livro. Se uma página da
   listagem falhou, ou um objeto não pôde ser apagado, a conclusão **não
   acontece**: fica para a próxima rodada, e o log diz qual município, quantos
   objetos saíram e o que falhou. Uma organização apagada do banco com
   fotografias sobrando no armazenamento é dado pessoal sem dono, que é
   exatamente o que a varredura de órfãos existe para achar, e o relógio não
   pode ser quem produz isso.

Não há chave de ambiente para desligar o relógio, e isso é decisão: ele é o
único caminho de execução de uma decisão já tomada, com segundo fator e sete
dias de espera. Uma chave desligada deixaria eliminações vencerem sem acontecer,
em silêncio, e a saída seria o `DELETE` à mão que este capítulo existe para
aposentar. O que protege contra o relógio agir errado é o estado do banco: sem
eliminação vencida, cada rodada é uma chamada de função que devolve nada.

### O que fica depois

O que a seção 3 já dizia, agora com nome: o **livro de eliminações**
(`eliminacoes_de_municipio`). Uma linha por pedido, com o identificador, o nome
e a UF do município copiados (a organização some e o livro fica, sem chave
estrangeira), quem pediu, o motivo, quando cada fase aconteceu, e quantas
linhas saíram de cada tabela. É a resposta a uma auditoria futura, e é o que o
console mostra depois. O livro **não sai no pacote de saída**: ele é registro do
fornecedor, não dado do município.

### Como conferir, de fora, que está acontecendo

`GET /saude` da API responde, além da última migração, `eliminacoes:
{ agendadas, vencidas }`, só números, sem nome. `vencidas` é o que já passou do
prazo e ainda não concluiu. Uma rodada do relógio zera esse número; se ele não
zera de uma rodada para a outra, há purga travada, e o log do relógio diz por
quê.

### O que ainda não está feito

- ~~**A retomada de uma purga interrompida depende da memória do processo.**~~
  Resolvido (conferido em 2026-10-07, V2-F00-E22): `executar_eliminacoes_vencidas()`
  devolve, em toda rodada, também quem já teve as linhas apagadas e ainda não
  teve o armazenamento purgado, até `concluir_eliminacao` marcar a purga, então
  reinício e troca de máquina não perdem mais a purga pela metade (ver o
  comentário de `apps/api/src/eliminacao/relogio.ts`). A memória do processo
  continua só como atalho dentro de uma mesma vida do processo.
- ~~**A contagem de `/saude` depende de uma função de banco que a migração 038
  ainda não traz.**~~ Resolvido (conferido em 2026-10-07): a migração 038 cria
  `eliminacoes_pendentes()`, e `/saude` a consulta. O `eliminacoes: null` só
  aparece se a função faltar no banco (migração atrasada), com aviso no log.
- **A declaração de eliminação** do passo 6 continua sem modelo. O livro tem
  tudo o que ela precisa dizer (datas, contagens, quem pediu); falta o texto.
- **O prazo de sete dias corre a partir do pedido no console**, não da
  confirmação do município no passo 5. Quem agenda precisa ter a confirmação em
  mãos antes de apertar, e o motivo escrito no livro é onde isso fica
  registrado.
