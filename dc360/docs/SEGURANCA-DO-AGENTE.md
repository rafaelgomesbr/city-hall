# Segurança do agente que trabalha sozinho

- **Versão:** 1, de 14/09/2026
- **Para quem:** quem coordena a Defesa Civil do município, e quem decide se
  este produto é adequado ao que a prefeitura precisa.

Leia isto antes de ligar o recurso. Ele trata da integridade física de um
servidor público, e ligá-lo sem ter combinado o que está escrito aqui é pior do
que não ligar.

---

## 1. O que este recurso é

O agente, **ainda na base e com sinal**, declara no aplicativo:

- para qual protocolo ele está indo;
- em quanto tempo pretende voltar;
- se vai **sozinho** ou acompanhado.

O sistema marca o prazo de retorno pelo **relógio do servidor**, e nunca pelo
relógio do telefone. Quando o agente volta, ele confirma. Se precisar de mais
tempo, ele prorroga.

Se a confirmação não chegar até o prazo, a saída aparece como **prazo estourado**
na tela "Quem está em campo" e toca o sino de avisos da coordenação.

Quem coordena encerra a saída dizendo o que houve, e isso fica na trilha de
auditoria com nome e hora.

---

## 2. O que este recurso NÃO é

Esta seção é a mais importante do documento. Ela não é letra miúda.

**Não é botão de pânico.** Não existe SOS, não existe alarme, não existe chamada
de socorro. O aparelho não tem para onde gritar.

**Não detecta queda, nem imobilidade, nem ausência de movimento.** Existem
produtos no mercado que fazem isso, com sensor e com central de monitoramento
própria. Este não é um deles, e não pretende ser.

**Não aciona ninguém sozinho.** O sistema não liga para bombeiro, não manda
mensagem, não escala automaticamente para um segundo contato e não acorda
ninguém. Quem escala é gente.

**Não sabe onde a pessoa está agora.** O que fica guardado é para onde ela
**disse** que ia, antes de sair. Seguir o servidor pelo GPS o turno inteiro é
vigilância de trabalhador, e essa é uma decisão do município e não do
fornecedor: o produto não faz isso.

**"Prazo estourado" não quer dizer "em perigo".** Quer dizer exatamente uma
coisa: ninguém teve notícia dele desde o prazo que ele mesmo declarou. Pode ser
um talude cedendo e pode ser bateria acabada, e o sistema não sabe qual dos dois
é. A tela usa essa palavra de propósito, e nunca a outra.

**Se ninguém estiver com o painel aberto, ninguém é avisado.** O aviso nasce
quando alguém daquele município consulta o sino. A tela que ninguém abriu não
avisa coisa nenhuma.

---

## 3. A assimetria que explica tudo

**O aparelho sem sinal não consegue pedir socorro.** Nenhum software muda isso.

É por isso que a parte que funciona de verdade é a que acontece **antes**, na
base, com sinal: dizer para onde vai e quando volta. É uma informação simples, e
ela é a diferença entre "sumiu alguém e não sabemos por onde começar" e "ele
disse que ia para a Rua das Acácias, 340, sozinho, e que voltaria às 11h".

Duas consequências práticas:

1. **Declarar a saída exige sinal.** Ela não entra na fila de sincronização do
   aplicativo. Uma declaração guardada no telefone é uma declaração que ninguém
   recebeu, e ela daria ao agente a sensação de estar coberto exatamente quando
   ele não está.
2. **Confirmar o retorno exige sinal.** Isso parece defeito e é a definição:
   **você voltou quando o sistema soube que você voltou.** O agente que continua
   sem sinal continua aparecendo como alguém de quem ninguém teve notícia,
   porque é exatamente isso que está acontecendo.

---

## 4. O que o município precisa decidir, e o produto não decide por ele

Nada aqui é configuração de sistema. É procedimento escrito da prefeitura, e sem
ele o recurso vira um alerta que ninguém atende.

**Quem olha a tela, e quando.** Quem está na sala às três da manhã de uma noite
de temporal? A permissão de acompanhar saídas foi dada também ao operador de
plantão justamente por isso, mas o produto não sabe quem está de plantão hoje.

**O que fazer quando o prazo estoura.** Escreva a sequência, com nome e telefone
em cada degrau: quem liga primeiro, quantas vezes tenta, quanto tempo espera
entre as tentativas, quem é chamado se não atender, e em que ponto alguém vai
fisicamente ao endereço que o agente declarou.

**Quem tem autoridade para acionar socorro externo**, e por qual telefone.

**Quando um agente pode ir sozinho, e quando não pode.** Esta é a decisão que
protege mais que qualquer software. A saída declarada diz se ele foi sozinho; o
produto não impede que ele vá.

---

## 5. Como isto aparece nas telas

### No aplicativo do agente

Antes de subir, um passo a mais: para onde, por quanto tempo, sozinho ou não. Ao
voltar, um toque para confirmar. Se o serviço demorar, um toque para prorrogar.

A tela diz, com todas as letras, que a coordenação vê a saída e vê o prazo, e
que **ninguém é acionado automaticamente**.

### No painel, em "Quem está em campo"

Uma linha por saída aberta. **Prazo estourado primeiro**, e dentro dessas, quem
foi **sozinho** na frente: uma saída vencida de quem foi acompanhado é um
aborrecimento, e uma de quem foi sozinho é a que faz largar o que se está
fazendo.

Cada linha traz o agente, se foi sozinho, o protocolo, o endereço, a hora da
saída, o prazo, quantas vezes foi prorrogado, e há quanto tempo está sem
confirmação. Nada disso é comunicado só por cor: está escrito.

O botão de encerrar pede **o que houve**, de uma lista curta:

| Desfecho | Quando usar |
| --- | --- |
| Falei com a pessoa, está bem | Contato por rádio, telefone ou outra equipe |
| Voltou à base e não confirmou no aplicativo | Acontece: bateria, telefone no bolso, fim de turno |
| Acionei apoio | **Exige dizer o que foi acionado, e a que horas** |
| A saída foi declarada por engano | Erro de digitação, tarefa trocada |

**"O agente confirmou o retorno" não está nessa lista**, e a ausência é a regra:
quem diz "voltei" é quem voltou. Se a coordenação pudesse marcar isso, o registro
passaria a afirmar que o agente confirmou quando na verdade outra pessoa decidiu
por ele, e essa é exatamente a linha que alguém vai ler depois de um acidente.

### No sino

"Agente não confirmou o retorno de campo", com "foi sozinho" ou "foi
acompanhado" junto. Nome de agente não passa pelo sino: ele está na tela para
onde o aviso leva.

---

## 6. O que fica registrado, e por quanto tempo

Quatro atos entram na trilha de auditoria da ocorrência: a saída declarada, cada
prorrogação, o retorno confirmado, e o encerramento pela coordenação. Com autor,
hora do aparelho e hora do servidor.

A trilha **não se reescreve**, nem pela prefeitura nem por nós. Correção entra
como registro novo.

**O texto que a coordenação escreve ao encerrar não é apagado pela minimização
por prazo**, ao contrário do nome de quem liga para a central. A razão é que o
assunto dele é o ato da prefeitura sobre a segurança do próprio servidor, e essa
é a prova de que houve reação (ou de que não houve). Por isso a tela pede, no
próprio rótulo, que ali se escreva **o que foi feito**, e nunca dados do morador.

---

## 7. Se o município precisa de mais do que isto

Existe uma categoria inteira de produtos dedicada a proteção de trabalhador
isolado, com sensor de queda, botão de pânico com áudio ao vivo, central de
monitoramento humana 24 horas e escalonamento contratado até a chegada de
socorro. Alguns operam com equipamento próprio e comunicação por satélite, para
funcionar onde não há cobertura de celular.

Se o risco do seu município exige isso, **este produto não substitui aquilo**, e
dizer o contrário seria irresponsável. O que ele faz é a parte que cabe num
sistema de gestão de ocorrências: registrar, antes da saída, para onde a pessoa
foi e quando ela deveria ter voltado, e pôr o atraso na frente de quem coordena.
