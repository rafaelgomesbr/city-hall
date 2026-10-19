# Guia do coordenador

- **Versão:** 1, de 09/09/2026

Para quem manda no fluxo operacional. Escrito para ser lido uma vez e consultado
depois.

---

## 1. O caminho de uma ocorrência

```
chamado entra  ->  triagem  ->  despacho  ->  vistoria em campo  ->  laudo
                                                                      |
                                              +-----------------------+
                                              |
                                    providência pendente
                                              |
                                          encerramento
```

Cada passagem fica na trilha de auditoria com autor, data e hora. **Isso protege
você**: quando o ato for questionado, meses depois, a trilha diz quem decidiu o
quê e quando.

---

## 2. O painel

Os números do alto são a leitura da situação, e cada um decide uma coisa
diferente.

| Indicador | O que decide |
| --- | --- |
| Na fila | Todas as ocorrências ainda abertas, **inclusive as que já estão em campo** (tudo que não está encerrado nem em rascunho). Fila que cresce aqui vira atraso lá na frente |
| Em campo | Quantas ocorrências estão com equipe trabalhando agora |
| **Atrasadas** | Passaram do prazo da severidade. É a fila que exige ação hoje |
| Críticas ativas | Quantas ocorrências de severidade crítica ainda estão abertas |
| Encerradas em 7 dias | O que se fechou na última semana, para ver o ritmo |
| Providências vencidas | Providência encaminhada cujo prazo de resposta já passou: falta cobrar o órgão. Clicar leva ao cartão "Providências aguardando resposta", abaixo da fila de atendimento, que lista TODAS as sem resposta (vencidas e ainda no prazo), no máximo 8, e só aparece se houver alguma |

**"Atrasada" tem definição única**, e ela vive no servidor: ocorrência não
encerrada e fora de rascunho, com prazo definido (a triagem o define), cujo prazo já passou. O contador do painel e o
filtro da lista usam a mesma expressão, de propósito. Se um dia divergirem, é
defeito, e deve ser relatado.

---

## 3. Triagem

Classificar é o ato que dá **prazo** à ocorrência. Antes da triagem não existe
prazo gravado. Quando a triagem o grava, ele é contado desde o **registro** da
ocorrência, e não desde o clique da triagem.

**Tipo:** use a nomenclatura da COBRADE. Deslizamento, inundação, alagamento,
enxurrada, vendaval, granizo, colapso de edificação, incêndio urbano. Ela não é
enfeite: é a linguagem do sistema nacional, e o que permite o dado do município
conversar com o resto.

**Severidade:** decide o prazo. Os prazos são os do sistema: baixa 72 horas, média
48, alta 24 e crítica 4 (`PRAZO_PADRAO_HORAS`, no pacote compartilhado). Hoje o
município não os altera por tela nenhuma.

**Duplicidade:** ao registrar, o sistema avisa se já existe ocorrência ativa do
mesmo tipo, aberta nas últimas 48 horas, com endereço parecido (compara o começo
do endereço, até a primeira vírgula). Duas ocorrências para o mesmo evento significam duas equipes na mesma
casa e dois laudos com números diferentes. Vincule em vez de duplicar.

---

## 4. Despacho

Escolha a equipe. A ocorrência entra na lista do aparelho dos agentes daquela
equipe na próxima vez que eles baixarem a lista.

**O despacho não mexe no prazo.** O prazo foi gravado na triagem, contado desde o registro, e continua
correndo: despachar tarde não compra tempo. (Houve um defeito que zerava o prazo
no despacho, corrigido em 09/09/2026. Se você vir prazo mudando ao despachar,
relate imediatamente.)

**Trocar a equipe** de uma ocorrência que já tem vistoria em andamento é
possível. A tarefa sai da lista do agente anterior; o aplicativo dele ainda não
mostra o motivo, então avise-o pelo meio de plantão.

---

## 5. O laudo que voltou

Leia antes de decidir. O que olhar, nesta ordem:

1. **As duas datas.** "Vistoria em campo" e "recebida pelo sistema" diferentes é
   o normal de coleta sem sinal. A data que vale para o ato é a da vistoria em
   campo.
2. **O checklist.** Risco iminente e interdição indicada são os dois que mudam
   sua decisão.
3. **As fotografias.**
4. **A contagem de pessoas.** Em branco significa **não contado**, e não zero. O
   laudo diz isso com todas as letras justamente para você não ler zero onde
   ninguém contou.
5. **A assinatura.** Se o laudo disser "assinatura não coletada", a pessoa não
   foi cientificada por escrito, e isso pesa se houver contestação.

---

## 6. Decidir

| Decisão | Quando | O que gera |
| --- | --- | --- |
| Providência | Há o que executar: obra, remoção, acionar órgão | Ocorrência fica pendente até alguém dar baixa |
| Interdição | Risco não permite permanência. **Quem indica é a vistoria de campo** (o item "interdição indicada" do checklist): o sistema só emite o termo quando a vistoria vigente a indicou, e a coordenação não interdita por conta própria | Termo de interdição, para imprimir e assinar |
| Desinterdição | Risco cessou. O sistema exige o motivo escrito (15 caracteres ou mais; o painel tira os espaços das pontas antes de contar, então pela tela espaços não valem; a API conta o texto bruto, ver `apps/api/PENDENCIAS.md`); a vistoria nova é o que sustenta o motivo, mas não é exigência dele | Termo de levantamento, ligado ao termo anterior |
| Encerramento | Não há mais o que fazer | Exige motivo |

**Encerrar exige motivo, e não existe apagar.** Registro não se apaga porque ele
sustenta ato administrativo. Se algo entrou errado, encerre com o motivo dizendo
isso: a trilha guarda os dois fatos, o erro e a correção.

O botão de encerrar **só aparece depois da triagem** e pede confirmação em dois
toques, com o protocolo escrito no botão. Se você viu o botão numa ocorrência
recém-registrada, relate: era um defeito, corrigido em 09/09/2026.

---

## 7. Documentos

Laudo, termo de interdição e termo de desinterdição saem prontos, com o
cabeçalho do órgão, o protocolo e um **identificador da emissão** no rodapé. O
identificador nasce na primeira emissão de cada documento (por vistoria) e fica
gravado na trilha: a segunda via carrega o mesmo, porque é o mesmo ato, e uma
vistoria nova produz outro. Com o papel na mão, `GET /documentos/validar/<código>`
(com sessão no painel) responde a que emissão ele corresponde: protocolo,
documento, vistoria, instante e quem emitiu. Ele identifica a emissão; não
certifica o conteúdo, porque o documento é gerado sob demanda e uma foto
anexada depois muda o papel sem mudar a emissão.

**Não é assinatura digital e não pretende ser.** Documento que vai para processo
continua sendo impresso e assinado à caneta, em cima da linha: o agente no
laudo, a coordenação e o responsável pelo imóvel no termo de desinterdição. O
único traço colhido eletronicamente é o da pessoa presente no local, no
aparelho, durante a vistoria; só nesse bloco o documento diz "assinatura não
coletada" quando o traço não existe.

O termo de desinterdição imprime a re-vistoria que atestou a cessação do risco.
Quando o levantamento foi autorizado sem vistoria nova, o termo diz isso por
escrito e identifica a vistoria que sustentou a interdição, em vez de repetir o
checklist que mandou interditar.

Nenhum documento cita artigo de lei. Isso é deliberado: artigo errado em termo
de interdição é motivo para anular o ato.

---

## 8. Usuários e equipes

Você administra quem está abaixo de você. Administrador é o teto do município e
é o único que administra outro administrador.

**Usuário não se apaga, se desativa.** Ele assina laudo e aparece na trilha; um
usuário apagado deixaria documentos assinados por ninguém.

O sistema recusa a desativação ou o rebaixamento do **último** administrador
ativo, para o município não ficar sem ele. A conferência não é à prova de dois
administradores que se desativam no mesmo instante (`apps/api/PENDENCIAS.md`):
combine antes quem fica.

**O que a pessoa desativada vê.** A desativação vale no próximo registro que ela
tentar gravar, sem esperar o acesso vencer. No painel, ela é levada à tela de
entrada com a frase "Sua conta foi desativada. Entrar de novo não resolve:
procure a coordenação do seu município. Nada do que você já registrou se
perdeu." Quando só a sessão foi encerrada (por você, em "encerrar sessões"), a frase é
outra, "Sua sessão foi encerrada", e entrar de novo resolve. **Trocar o papel de
alguém NÃO encerra a sessão dela.** O que vale é o papel gravado, e só na
ESCRITA: no primeiro registro que ela tentar gravar depois da troca, o servidor
recusa o acesso antigo com `nao_autenticado`; o painel renova sozinho e repete, e
a renovação já traz o papel novo. No aplicativo de campo só a fila de envio faz
isso (uma vez); as outras escritas diretas do aplicativo não renovam nem repetem.
Na LEITURA nada muda até o acesso vencer (15 minutos, por padrão, que é o teto):
quem foi rebaixado continua lendo, por exemplo a trilha de auditoria, com o papel
de antes. Com o painel aberto e a aba visível, porém, o sino consulta `GET /avisos` a cada cerca de
30 segundos, e essa rota confere o papel: o painel costuma perceber a troca em
meio minuto, renova e passa a ver só o que o papel novo permite. Ela não perde nada do
que estava fazendo. Tentar entrar com a conta desativada recusa com a mesma frase de
senha errada, de propósito: a tela de entrada não revela quem tem conta.

No aplicativo de campo, o que o agente já coletou continua guardado no aparelho
e nada é apagado pelo servidor. Quando a conta é desativada (ou as sessões são
encerradas) com coleta ainda na fila, o aplicativo **para o envio e guarda tudo**:
a faixa do topo e a tela de envio mostram "Conta desativada" com a frase
"Suas coletas continuam guardadas neste aparelho, procure a coordenação do seu
município", a coleta aparece como "Guardada", e **não há botão "Descartar"**.
Quando só as sessões foram encerradas, a frase é "Entre de novo" e o botão leva à
entrada, sem apagar nada. Para a coleta subir depois de uma desativação, reative
a conta e peça ao agente para entrar de novo: a mesma coleta sobe, uma vez só.

**Esqueci a senha.** Com a recuperação por e-mail desligada, que é como o piloto
roda, quem esqueceu a senha pede a quem administra. Em **Usuários**, na linha da
pessoa, clique em **Redefinir senha** e confirme: a janela repete o nome para
você conferir que é a linha certa. O sistema mostra uma senha temporária **uma
única vez**: anote, ou dite por telefone, antes de clicar em **Já anotei a
senha**. Se fechar sem anotar, redefina de novo. A senha antiga deixa de valer
na hora, as sessões abertas da pessoa caem, e a temporária vale por 72 horas.
Na primeira entrada, antes de qualquer tela, a pessoa escolhe a senha dela. Você
não vê o botão na sua própria linha (a sua senha se troca em **Minha conta**) nem
na linha de quem tem posto acima do seu; o coordenador também não o vê na linha de
outro coordenador. Só o administrador administra outro administrador.

Quem esqueceu a senha e abre **Esqueceu a senha?** na tela de entrada vê, com a
recuperação por e-mail desligada, a mesma instrução em quatro passos: procurar quem
administra, pedir a redefinição, receber a senha temporária e escolher uma nova na
primeira entrada. Quando o e-mail for ligado (decisão do CP-19), a mesma tela passa a
pedir o e-mail da conta e mandar um link que vale uma vez só e por pouco tempo; a
resposta é sempre a mesma, exista a conta ou não, e depois de cinco pedidos por hora
para o mesmo e-mail os seguintes não enviam nada. Se a pessoa disser que o link
"não vale mais", ele venceu, já foi usado, foi trocado por um pedido mais novo, ou a senha da
conta mudou ou a conta foi desativada depois do pedido (toda mudança de senha e
toda desativação gastam os links pendentes): ela pede outro, ou você redefine a senha pelo botão acima.

**Perdi o celular.** Em **Usuários**, clique em **Encerrar sessões** na linha da
pessoa. A confirmação diz quantas sessões ela tem abertas. A senha não muda: a
pessoa só precisa entrar de novo. Quem está em campo fica sem sincronizar até
entrar outra vez. Se for você quem perdeu o aparelho, abra **Minha conta**: a
lista **Minhas sessões** mostra cada navegador e aparelho aberto (o aparelho em
uma frase, quando entrou e até quando vale, com a marca **Esta sessão**), e o
botão **Encerrar minhas outras sessões** derruba todas as outras sem tirar você
daquela onde está. Trocar a senha também encerra as outras sessões.

No modo de demonstração (painel sem servidor) esses botões não existem: a
entrada é por escolha de perfil, não há senha nem sessão, e a tela explica isso
no lugar dos botões.

---

## 9. Quem está em campo, e o agente que não deu notícia

> **Estado atual: a tela existe, mas fica vazia.** O servidor e a tela "Quem
> está em campo" estão prontos. O aplicativo do agente **ainda não declara a
> saída, não prorroga e não confirma o retorno**: essa parte está planejada no
> roteiro de desenvolvimento (etapa V2-F14-E01), sem data marcada. Até lá
> nenhuma saída chega ao painel, a tela fica vazia e **o sino não vai avisar de
> prazo estourado nenhum**. Tela vazia, hoje, não quer dizer que ninguém está no
> morro. Acompanhe as saídas pelo procedimento que o município já usa (rádio,
> telefone), e não conte com este recurso até ele estar no aplicativo.

Quando a parte do aplicativo existir, o agente vai declarar, **antes de subir e
com sinal**, para onde vai, em quanto tempo pretende voltar e se vai
**sozinho**. Quando voltar, confirma. Se demorar mais que o previsto, prorroga.

Se a confirmação não chegar até o prazo, a saída aparece como **prazo estourado**
na tela "Quem está em campo", e o sino toca.

**Leia isto antes de contar com o recurso:**

| O que ele faz | O que ele NÃO faz |
| --- | --- |
| Registra para onde a pessoa disse que ia e quando deveria voltar | Não sabe onde ela está agora |
| Mostra o prazo estourado na tela e no sino | Não é botão de pânico, e não detecta queda |
| Registra o que você fez a respeito, na trilha | **Não aciona ninguém sozinho**: não liga para bombeiro, não manda mensagem, não acorda ninguém |
| Ordena as saídas vencidas com quem foi sozinho na frente (as que ainda estão no prazo ficam por prazo) | Não avisa quem não estiver com o painel aberto |

**"Prazo estourado" não quer dizer "em perigo".** Quer dizer que ninguém teve
notícia dele desde o prazo que ele mesmo declarou. Pode ser um talude cedendo e
pode ser bateria acabada, e o sistema não sabe qual dos dois é.

**O aparelho sem sinal não consegue pedir socorro**, e nenhum software muda isso.
O que funciona de verdade é a parte que acontece antes, na base: saber para onde
ele foi e quando deveria ter voltado.

**Duas coisas dependem do município, e o produto não decide por ele:** quem fica
de olho na tela, e o que fazer quando um prazo estoura. Escreva a sequência com
nome e telefone em cada degrau, e em que ponto alguém vai ao endereço declarado.
O procedimento completo e o que perguntar antes de ligar o recurso estão em
`SEGURANCA-DO-AGENTE.md`.

**Encerrar a saída é ato registrado.** Você escolhe o que houve (falei com a
pessoa, voltou à base, acionei apoio, foi engano) e isso entra na trilha com seu
nome e a hora. "Acionei apoio" exige uma observação (3 a 300 caracteres) dizendo o que foi
acionado: é a linha que uma apuração vai procurar. "O agente confirmou o retorno" não está na sua lista, de
propósito: quem diz "voltei" é quem voltou.

---

## 10. Trilha de auditoria

Quem fez o quê, quando. **Não se reescreve**, nem por você, nem por nós: o banco
não tem política de alteração nem de remoção para a aplicação nessa tabela.
Correção entra como evento novo. Há duas exceções, ambas funções do banco: quando
o prazo da privacidade vence, o nome de quem assinou a vistoria, dentro do evento
"vistoria", vira "removido por prazo" (e isso fica registrado); e a eliminação do
município, que o fornecedor só agenda com sete dias de arrependimento, apaga tudo
do município, trilha inclusa.

É onde você olha quando alguém perguntar "quem interditou aquela casa".

---

## 11. Quando o sistema cair

**O agente em campo continua trabalhando.** A lista já está no aparelho dele e a
vistoria fica guardada até o sinal voltar. Quem para é o painel.

Registre no papel e digite depois. **O sistema não tem campo para a data real do
atendimento**: a ocorrência nasce com a data e a hora da digitação, e o prazo da
severidade conta daí. Escreva a data e a hora reais do atendimento no relato
(campo de descrição), para a trilha não afirmar que o chamado chegou na hora em
que o sinal voltou.
Procedimento completo e contatos em `INDISPONIBILIDADE.md`.

---

## 12. O que você não consegue fazer, e por quê

| O que | Por quê |
| --- | --- |
| Apagar ocorrência | Sustenta ato administrativo. Encerre com motivo |
| Apagar usuário | Assina laudo e aparece na trilha. Desative |
| Editar a trilha | Ela é o que garante que ninguém edita a trilha |
| Ver ocorrência de outro município | Isolamento no banco. Não há credencial de aplicação que veja dois |
| Encerrar antes da triagem, **pela tela** | O painel só oferece o botão a partir da triagem. Isso é regra de tela, não do servidor: a API aceita encerrar ocorrência em rascunho ou registrada (a máquina de estados permite, para o chamado improcedente). Não conte com a tela como trava |
