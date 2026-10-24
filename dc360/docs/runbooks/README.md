# Runbooks do DC360

- **Versão:** 1, de 2026-10-24 (V2-F01-E16, rascunho).
- **Estado:** RASCUNHO. Escritos a partir do que o repositório faz hoje, por quem
  conhece o sistema. Nenhum foi executado por uma segunda pessoa, e o
  ambiente de homologação (HML) ainda não existe. A versão completa só vale
  depois do ensaio em `ensaio-da-segunda-pessoa.md` e do CP-07.

Um runbook é um texto que deixa **quem não escreveu o sistema** fazer uma
operação sem adivinhar. Por isso cada um traz, sempre nesta ordem: quem executa,
pré-condições, passos com o comando, verificação, como voltar atrás e o que
ainda depende de outra etapa.

## Os runbooks

| Arquivo | Para que serve | Estado |
| --- | --- | --- |
| `deploy.md` | Implantar API, console, painel e aplicativo | Rascunho. Hoje é à mão, da máquina do dono |
| `rollback.md` | Voltar uma implantação | Escrito pela V2-F01-E08, não por esta etapa. Aqui só se aponta para ele |
| `migracao.md` | Migrar o banco de produção sem perder dado | Rascunho. Hoje só roda no macOS |
| `rotacao-de-segredo.md` | Girar `JWT_SEGREDO` e saber o que NÃO se gira | Rascunho |
| `acesso-e-segredos.md` | Contas, nomes de segredo (nunca o valor) e quem revoga | Rascunho. O acesso proposto depende do CP-07 |
| `ensaio-da-segunda-pessoa.md` | Roteiro e ficha para a segunda pessoa executar e registrar onde o texto falhou | Rascunho. Depende do CP-07 e do HML |

## Convenções

- **"depende de V2-F01-Enn"** marca o ponto em que o processo ainda não existe
  porque a etapa Enn não foi feita. O texto diz o que se faz HOJE e o que muda
  quando a etapa chegar. Nenhum comando de etapa futura aparece como se
  existisse.
- **Todo comando citado existe.** `scripts/runbooks.test.mjs` confere que cada
  `node scripts/...` aponta para um arquivo real (e, no `versao.mjs`, para um
  subcomando real), que cada `npm run` é um script do `package.json`, que cada
  subcomando do `fly` e do `eas` está na lista deste repositório e que nenhum
  runbook traz valor de segredo. Comando inventado reprova.
- **Nunca o valor de um segredo.** Aqui só aparecem NOMES. O valor mora no cofre
  (decisão do CP-07) e nunca em arquivo versionado, em histórico de terminal,
  em captura de tela ou em mensagem.
- **Tudo a partir de `dc360/`**, salvo quando o passo diz outra pasta.
- Registro não se apaga: o que o ensaio encontrar de errado no texto vira
  correção do texto, e a ficha do ensaio fica arquivada.

## Quem executa

Hoje há uma pessoa só com acesso a tudo (o dono, Rafael). Isso é o risco que a
V2-F01-E16 e o CP-07 existem para tratar (fator de ônibus 1). Enquanto o CP-07
não for decidido, "quem executa" nos runbooks é **o dono**, e a coluna da
segunda pessoa é proposta, não fato.
