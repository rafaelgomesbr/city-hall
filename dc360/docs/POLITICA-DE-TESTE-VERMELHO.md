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
produto, não de quem está com o teste vermelho na frente. A regra que separa
"o teste é a especificação" de "o código é a verdade" está na próxima seção.

## Quando o teste e o código discordam

Escrita na etapa V2-F00-E03 (2026-10-05) como PREMISSA, porque Rafael ainda não
decidiu BZ-N:N.3 (STATUS, seção 9). Vale até ele dizer outra coisa. O que
motivou a regra: no commit 5ecdf4c, testes escritos antes do conserto se
misturaram com testes que descreviam defeito real, e a saída "reescrever o
teste para ficar verde" escondeu o segundo grupo no primeiro.

A pergunta é sempre a mesma: o que o teste descreve é uma decisão superada ou é
um defeito que o código tem? Cada resposta pede uma prova diferente, e sem a
prova o teste não se reescreve.

**R1. O código vale e o teste é reescrito, com registro.** Só quando as duas
coisas existem:

1. uma decisão datada no código (comentário com a data, ou commit), POSTERIOR ao
   último commit do teste; e
2. um teste irmão que passa e afirma a decisão.

O exemplo que fixa a regra: `apps/campo/src/app/(agente)/index.tsx:1222` diz que,
desde 15/09/2026, o botão da faixa de sessão encerrada é "Entrar de novo" e não
chama `sair()`, porque `sair()` apaga a vistoria começada. O teste irmão
`a-sessao-vencida-nao-apaga-a-vistoria.test.tsx` passa e afirma isso; os dois
testes antigos que mandam "Sair da conta" são de 14 e 15/09, anteriores à
decisão. Eles se reescrevem, e a reescrita entra em
`docs/DECISOES-DE-TESTE-DA-FASE-00.md` com a decisão, a data, os commits e o
teste irmão. O teste novo continua afirmando a intenção (a pessoa não perde a
vistoria) e não pode afirmar menos que o antigo.

**R2. O teste vale e o código é consertado.** Quando o teste descreve como
defeito algo que a leitura do código confirma, com arquivo e linha. Exemplos:
`vistoria/[id].tsx:1447` arredonda a precisão do GPS para zero e o esquema recusa
zero; `perfil.tsx:449-453` lê a fila uma vez só, e o diálogo de saída não conta
as vistorias começadas que a saída apaga. Nada se reescreve e nada se registra
aqui: o conserto é a própria prova, e o teste vermelho vira o teste que o
guarda.

**R3. Ambiente ou portabilidade.** Quando a regra do teste vale mas ele depende
da máquina (fim de linha, variável de ambiente, `npm` sem `shell` no Windows,
caminho POSIX escrito à mão, cache local ignorado pelo git). O que muda é como
o teste fala com a máquina, e nunca o que ele afirma. Se o teste mudar, o
registro é o mesmo da R1. A causa tem de estar provada: a variável está definida,
o experimento sem ela passa, o arquivo de cache tem a data de antes das rotas.

**R4. Número em documento.** Quando o conferidor está certo e o texto
envelheceu (`conferir:numeros`), o texto se corrige com o número real. O
conferidor não se afrouxa.

**R5. Dependência.** Vulnerabilidade ou deriva de versão não é teste: segue a
política de audit (CP-03) e a regra do projeto, em que vulnerabilidade conhecida
em execução é bug e não pendência.

**R6. Teste instável.** Passa e falha sem o código mudar. Não se repete até
passar e não se pula. Registra-se como instável, com a causa provável e a etapa
que o trata, e o conserto troca a espera de tempo fixo por uma espera com
condição e limite. A causa dita "carga da máquina" é hipótese até alguém medir.
O instável fica no registro vivo (`docs/evidencias-v2/G00/V2-F00-E03/classificacao-dos-vermelhos.md`,
seção 8) como uma linha com dono, issue e prazo, como qualquer skip: sem os três
ele conta como item aberto sem dono, e o item do G00 "registro da E03 com zero
itens abertos" não fecha.

**Sem prova de R1 nem de R2.** O teste não se reescreve e o código não se mexe
no escuro: trata-se como defeito até Rafael dizer o contrário (é a opção
conservadora), e só se pula com a marca descrita adiante.

### O que o registro de uma reescrita precisa ter

Em `docs/DECISOES-DE-TESTE-DA-FASE-00.md`, por teste ou grupo: o teste, o que ele
afirmava, a decisão que o tornou velho e onde ela está escrita, o que passa a
afirmar, a evidência datada (data e commit do código, data e commit do teste,
teste irmão e a saída que o mostra passando) e a etapa e a data. Uma linha de
classificação que diga "teste velho" ou "mock velho" sem citar a evidência datada
reprova a conferência da E03.

### Quem tem a última palavra

Rafael. Na classificação de cada vermelho (`docs/evidencias-v2/G00/V2-F00-E03/`)
a classe vem com a regra aplicada e com a prova, para ele poder discordar de uma
linha sem refazer a tabela.

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

**Prazo máximo: 5 dias corridos** a contar de hoje, com um dia de folga porque o
relógio do portão é UTC e a marca é escrita no horário de Brasília. DECIDIDO por
Rafael em 2026-10-13 (D2 do roteiro de aprovação da F00); o dono padrão continua
sendo `rafael`. Para mudar, altere `PRAZO_MAXIMO_EM_DIAS` em `scripts/portao-de-skip.mjs`.

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
