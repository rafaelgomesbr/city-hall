# Política de teste vermelho e de teste pulado (T42)

Esta política vale para todo o código de `dc360/`. Ela existe por um fato: a
vigência de conta, papel e sessão ficou desligada na escrita, e o teste que a
provava estava num `describe.skip` sem dono, sem prazo e sem referência. Nada
avisou. Teste pulado em silêncio é vermelho escondido.

## A regra da casa

Nenhum vermelho conhecido sobrevive na base. Todo teste que não passa tem uma
destas três saídas, e só estas:

1. **Consertar o defeito.** O teste descreve o comportamento certo e o código
   está errado. O código muda, o teste fica como está. É a saída padrão.
2. **Reescrever o teste, com registro.** O teste descreve um comportamento que
   foi decidido de outro jeito (decisão datada) e ficou velho. O teste muda, e a
   mudança entra em `docs/DECISOES-DE-TESTE-DA-FASE-00.md` com a decisão, a data
   e a evidência. Reescrever sem registro é o padrão que escondeu defeito real
   antes, então não vale.
3. **Pular, com dono, prazo e referência.** Só quando o conserto não cabe agora.
   O skip carrega uma marca (abaixo) e vence: passado o prazo, o portão reprova
   e alguém precisa decidir de novo, em vez de o skip virar permanente.

Quando houver dúvida entre a saída 1 e a 2, a decisão é de quem manda no
produto, não de quem está com o teste vermelho na frente. A regra de decisão
entre "o teste é a especificação" e "o código é a verdade" será escrita aqui na
etapa V2-F00-E03, depois que Rafael decidir com a tabela dos vermelhos na mão.

## Pular por ambiente e pular de forma incondicional

São duas coisas diferentes e o portão trata cada uma a seu modo.

**Por ambiente.** O teste roda onde a condição vale e é pulado onde ela não vale:
sem a pasta `ios/` gerada, sem a extensão de trigramas no Postgres. É permitido e
não pede marca, mas é CONTADO por arquivo, para ninguém descobrir meses depois
que uma máquina de CI pula parte da suíte. As formas aceitas:

- `it.runIf(condição)(...)` e `it.skipIf(condição)(...)` do Vitest;
- a opção `skip` do `node:test` com condição E motivo escrito, na mesma linha do
  `test(`: `{ skip: !existsSync(ARQUIVO) && "sem o arquivo" }`.

A condição precisa ser verdadeira por causa do ambiente, nunca por causa de um
defeito. Se o teste pula porque "ainda não funciona", ele é incondicional.

**Incondicional.** Pula em qualquer máquina, sempre: `it.skip`, `test.skip`,
`describe.skip`, `xit`, `xdescribe`, `xtest`, `it.todo`, `t.skip()`, a opção
`skip: true` e a opção `skip` sem condição e motivo textual. Exige a marca.

## A marca

Na linha imediatamente acima do skip (sem linha em branco no meio):

```ts
// T42 dono=<nome> issue=<referência> ate=AAAA-MM-DD
```

- `dono`: quem responde por tirar o skip. Padrão: `rafael`.
- `issue`: o item do GitHub ou o ID da etapa deste roadmap que fecha o assunto
  (por exemplo `V2-F00-E04`). Não existe sistema de issues próprio.
- `ate`: o último dia em que o skip é tolerado, em data ISO.

O portão reprova: skip incondicional sem marca; marca sem `dono`, `issue` ou
`ate`; `ate` que não é data real; `ate` vencido (hoje é o último dia válido);
`ate` com prazo acima do máximo.

**Prazo máximo: 30 dias corridos** a contar de hoje, com um dia de folga porque o
relógio do portão é UTC e a marca é escrita no horário de Brasília. É PREMISSA
assumida na V2-F00-E02, à espera da escolha de Rafael (registrada no STATUS,
seção 9). Para mudar, altere `PRAZO_MAXIMO_EM_DIAS` em `scripts/portao-de-skip.mjs`.

## `.only` nunca passa

`it.only`, `test.only`, `describe.only`, `fit` e `fdescribe` reprovam sempre, com
ou sem marca. Eles fazem o resto da suíte sumir e o resultado continuar verde,
que é o pior tipo de teste pulado.

## Quem decide o prazo

Rafael. O dono padrão é `rafael`. Quem escrever um skip propõe o prazo na marca;
o prazo só vale se couber no máximo acima, e prorrogar é escrever uma marca nova
com novo `ate`, em commit próprio, que a revisão enxerga. Não existe prorrogação
automática.

## O portão

`scripts/portao-de-skip.test.mjs` (a leitura mora em `scripts/portao-de-skip.mjs`)
roda dentro de `npm run test:scripts`. Varre `apps/*/test`, `apps/*/src`,
`packages/*/test`, `packages/*/src`, `db/test` e `scripts`, e imprime na saída a
contagem de skips por ambiente e a lista dos incondicionais marcados.

Limites ditos em voz alta: é uma leitura por linha, não um analisador de sintaxe.
Enxerga a chamada que começa a linha e a opção `skip:` na própria linha do
`test(`. Uma opção `skip` em linha separada, ou uma chamada escondida atrás de um
apelido, passa. Quem encontrar um jeito de pular que o portão não vê corrige o
portão, com um teste novo, e não usa o buraco.

O portão roda hoje só na máquina de quem rodar `npm run test:scripts`. A ligação
ao CI é a etapa V2-F01-E03; até lá o CI não o enxerga.
