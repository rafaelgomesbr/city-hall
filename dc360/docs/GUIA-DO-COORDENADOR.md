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
| Aguardando triagem | Quantas ainda não foram classificadas. Fila que cresce aqui vira atraso lá na frente |
| Em campo | Quantas equipes estão trabalhando agora |
| **Atrasadas** | Passaram do prazo da severidade. É a fila que exige ação hoje |
| Providência pendente | Vistoria feita, decisão tomada, e falta alguém executar |

**"Atrasada" tem definição única**, e ela vive no servidor: ocorrência não
encerrada, com prazo definido, cujo prazo já passou. O contador do painel e o
filtro da lista usam a mesma expressão, de propósito. Se um dia divergirem, é
defeito, e deve ser relatado.

---

## 3. Triagem

Classificar é o ato que dá **prazo** à ocorrência. Antes da triagem não existe
relógio.

**Tipo:** use a nomenclatura da COBRADE. Deslizamento, inundação, alagamento,
enxurrada, vendaval, granizo, colapso de edificação, incêndio urbano. Ela não é
enfeite: é a linguagem do sistema nacional, e o que permite o dado do município
conversar com o resto.

**Severidade:** decide o prazo. Os prazos por severidade são configurados pelo
município na implantação.

**Duplicidade:** ao registrar, o sistema avisa se já existe ocorrência no mesmo
endereço. Duas ocorrências para o mesmo evento significam duas equipes na mesma
casa e dois laudos com números diferentes. Vincule em vez de duplicar.

---

## 4. Despacho

Escolha a equipe. A ocorrência entra na lista do aparelho dos agentes daquela
equipe na próxima vez que eles baixarem a lista.

**O despacho não mexe no prazo.** O relógio começou na triagem e continua
correndo: despachar tarde não compra tempo. (Houve um defeito que zerava o prazo
no despacho, corrigido em 09/09/2026. Se você vir prazo mudando ao despachar,
relate imediatamente.)

**Trocar a equipe** de uma ocorrência que já tem vistoria em andamento é
possível, e o agente anterior é avisado do motivo pelo aplicativo.

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
| Interdição | Risco não permite permanência | Termo de interdição, para imprimir e assinar |
| Desinterdição | Risco cessou, com nova vistoria | Termo de levantamento, ligado ao termo anterior |
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

O município **nunca fica sem administrador ativo**: o sistema recusa a
desativação ou o rebaixamento do último.

---

## 9. Quem está em campo, e o agente que não deu notícia

O agente declara, **antes de subir e com sinal**, para onde vai, em quanto tempo
pretende voltar e se vai **sozinho**. Quando volta, confirma. Se demorar mais que
o previsto, prorroga.

Se a confirmação não chegar até o prazo, a saída aparece como **prazo estourado**
na tela "Quem está em campo", e o sino toca.

**Leia isto antes de contar com o recurso:**

| O que ele faz | O que ele NÃO faz |
| --- | --- |
| Registra para onde a pessoa disse que ia e quando deveria voltar | Não sabe onde ela está agora |
| Mostra o prazo estourado na tela e no sino | Não é botão de pânico, e não detecta queda |
| Registra o que você fez a respeito, na trilha | **Não aciona ninguém sozinho**: não liga para bombeiro, não manda mensagem, não acorda ninguém |
| Ordena a lista com quem foi sozinho na frente | Não avisa quem não estiver com o painel aberto |

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
nome e a hora. "Acionei apoio" exige dizer o que foi acionado: é a linha que uma
apuração vai procurar. "O agente confirmou o retorno" não está na sua lista, de
propósito: quem diz "voltei" é quem voltou.

---

## 10. Trilha de auditoria

Quem fez o quê, quando. **Não se reescreve**, nem por você, nem por nós: o banco
não tem permissão de alteração nem de remoção nessa tabela. Correção entra como
evento novo.

É onde você olha quando alguém perguntar "quem interditou aquela casa".

---

## 11. Quando o sistema cair

**O agente em campo continua trabalhando.** A lista já está no aparelho dele e a
vistoria fica guardada até o sinal voltar. Quem para é o painel.

Registre no papel e digite depois, com a **data real do atendimento**.
Procedimento completo e contatos em `INDISPONIBILIDADE.md`.

---

## 12. Cinco coisas que você não consegue fazer, e por quê

| O que | Por quê |
| --- | --- |
| Apagar ocorrência | Sustenta ato administrativo. Encerre com motivo |
| Apagar usuário | Assina laudo e aparece na trilha. Desative |
| Editar a trilha | Ela é o que garante que ninguém edita a trilha |
| Ver ocorrência de outro município | Isolamento no banco. Não há credencial de aplicação que veja dois |
| Encerrar antes de classificar | Encerramento é decisão sobre ocorrência classificada |
