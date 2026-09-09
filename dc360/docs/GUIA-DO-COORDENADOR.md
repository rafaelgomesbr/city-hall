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
cabeçalho do órgão, o protocolo e um **código de validação** no rodapé. O código
é derivado do protocolo mais a vistoria: o mesmo laudo tem sempre o mesmo
código, e é o que permite conferir, ao receber um papel, que ele corresponde ao
registro no sistema.

**Não é assinatura digital e não pretende ser.** Documento que vai para processo
continua sendo impresso e assinado.

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

## 9. Trilha de auditoria

Quem fez o quê, quando. **Não se reescreve**, nem por você, nem por nós: o banco
não tem permissão de alteração nem de remoção nessa tabela. Correção entra como
evento novo.

É onde você olha quando alguém perguntar "quem interditou aquela casa".

---

## 10. Quando o sistema cair

**O agente em campo continua trabalhando.** A lista já está no aparelho dele e a
vistoria fica guardada até o sinal voltar. Quem para é o painel.

Registre no papel e digite depois, com a **data real do atendimento**.
Procedimento completo e contatos em `INDISPONIBILIDADE.md`.

---

## 11. Cinco coisas que você não consegue fazer, e por quê

| O que | Por quê |
| --- | --- |
| Apagar ocorrência | Sustenta ato administrativo. Encerre com motivo |
| Apagar usuário | Assina laudo e aparece na trilha. Desative |
| Editar a trilha | Ela é o que garante que ninguém edita a trilha |
| Ver ocorrência de outro município | Isolamento no banco. Não há credencial de aplicação que veja dois |
| Encerrar antes de classificar | Encerramento é decisão sobre ocorrência classificada |
