# V2-F00-E14: vermelhos do app de campo por texto velho e dublê velho

Data: 2026-10-07. Executada sem commit. Nenhum arquivo de produto foi alterado:
só três arquivos de teste de `dc360/apps/campo` (`saidas/08-arquivos-do-campo-alterados.txt`).

## O que foi feito

Os 6 testes que a E03 classificou como velhos (classe B, V-CAM-01 a V-CAM-06)
foram reescritos para a decisão de 15/09/2026 (commit 5ecdf4c), que é o código:

| Id | Arquivo e caso | Antes | Depois |
| --- | --- | --- | --- |
| V-CAM-01 | `src/__tests__/a-sessao-que-terminou-nao-e-falta-de-sinal.test.tsx`, "o ⓘ ensina o caminho de volta, e promete a fila de pé" | exigia `Sair da conta` e `continua guardado no aparelho` | exige `Toque em "Entrar de novo"` e `Nada é apagado`; NEGATIVO: nenhum `Sair da conta` no diálogo `explicacao` |
| V-CAM-02 | `src/__tests__/perfil-a-sessao-que-terminou-e-o-aviso-que-fecha.test.tsx`, "e ensina o caminho de volta, sem prometer o que não vale" | exigia `toque em "Sair da conta" e entre de novo` | mesmas duas exigências; NEGATIVO: nenhuma instrução `toque em "Sair da conta"` (o botão legítimo com esse rótulo continua na tela) |
| V-CAM-03 a 06 | `src/push/logout-cala-o-aparelho.test.tsx`, os 4 casos do logout | dublê de `../dados/banco-local` só com `apagarDadosLocais`: `TypeError: acolherNoAparelho is not a function` | dublê com `acolherNoAparelho` (devolve `{ apagou: false }`) e `marcarDonoDosDadosLocais`; nenhuma linha de asserção mudou |

Caso novo (1): "o dublê do banco local acompanha tudo o que sessao.tsx importa
dele", no mesmo arquivo do logout. Lê a fonte de `dados/sessao.tsx`, extrai os
nomes importados de `./banco-local` e reprova listando o que faltar no dublê;
reprova também se o import não for encontrado. O `fs` vem por
`jest.requireActual` tipado à mão, porque o `tsconfig` do app não carrega os
tipos do Node (a primeira versão com `import "node:fs"` acrescentava 5 erros ao
typecheck do app e foi corrigida antes desta medição).

Documentação: `docs/DECISOES-DE-TESTE-DA-FASE-00.md`, seção "campo: sessão
encerrada e logout", com o "Depois" real, as sondas e a leitura de
`banco-local.ts:215-285` e `index.tsx:1222`. O teste irmão citado é o certo
(`a-sessao-vencida-nao-apaga-a-vistoria.test.tsx`, divergência D-2 da E03).

## Resultados medidos

- Os três arquivos, antes: 17 testes, 6 falhas (`saidas/01-...`).
- Os três arquivos mais os irmãos (`a-sessao-vencida-nao-apaga-a-vistoria`,
  `logout-nao-apaga-prova`, `falha-de-atualizacao`), depois: 6 suítes, 40 de 40
  verdes (`saidas/02-...`).
- Sonda 1, dublê sem `acolherNoAparelho`: os 5 casos do arquivo reprovam e o de
  deriva diz `["acolherNoAparelho"]` (`saidas/03-...`). Arquivo restaurado,
  SHA-256 conferido.
- Sonda 2, frase antiga posta por um instante em `falha-de-atualizacao.ts`: os
  2 casos de frase reprovam (`saidas/04-...`). Arquivo de produto restaurado,
  SHA-256 conferido.
- jest inteiro do app (`baseline-depois/03-teste-campo-app.txt`): 1837 testes,
  14 falhas, 124 suítes (era 1836 com 20). Confere com o esperado novo do
  `baseline.mjs` (`V2-F00-E14: { total: 1, falhas: -6 }`).
- `npm run test --workspace @dc360/campo` (motor offline): 9 arquivos, 187
  testes, 0 falhas, confere.
- `npm run test:campo`: sai 2 no typecheck pelos 2 erros pré-existentes do cache
  `.expo` (`perfil.tsx:1212`, `Sino.tsx:154`, E21), confere com o esperado; o
  jest e a contagem desse comando não chegam a rodar, por isso o jest inteiro
  foi medido direto (item acima). `saidas/05-typecheck-campo.txt`: só esses 2.
- `npm run test --workspace @dc360/shared`: 1 falha, a do travessão (E20), com
  só as linhas pré-existentes; confere. Numa primeira rodada houve uma segunda
  falha, o tempo limite de 5 s de `dominio.test.ts` sob carga, instabilidade já
  registrada na E10; na rodada seguinte não se repetiu.
- `node --test scripts/baseline.test.mjs`: 16 de 16.
- `npm run conferir:numeros`: 17 afirmações que não batem, todas números velhos
  de etapas anteriores (E17). Nenhum documento cita 1836, então o caso novo não
  cria afirmação nova errada (`saidas/06-...`).

## Quantos eram de cada família e o que sobrou

Eram 20 vermelhos no jest do app: 6 de texto velho e dublê velho (esta etapa:
2 de texto, 4 de dublê) e 14 defeitos reais. Sobram os 14, nominalmente:

- E15 (7): `ui/dialogo-na-conta-com-vistoria-comecada.test.tsx`, "diz quantas
  vistorias começadas serão apagadas, e que as fotos vão junto"; "uma só, sem
  foto: singular, e sem prometer foto que não existe"; "o botão de confirmar é
  o de perigo, porque o ato apaga"; "sem vistoria começada e sem fila, a
  pergunta não fala em apagar"; "quando a fila esvazia, o chip e o aviso de
  esperar somem sem trocar de aba"; "o diálogo de saída conta a fila de AGORA,
  e não a da montagem"; e `vistoria-o-teclado-a-camera-e-o-que-ela-promete.test.tsx`,
  "abaixo de meio metro vira 1, e não zero".
- E16 (7), todos em `vistoria-o-teclado-a-camera-e-o-que-ela-promete.test.tsx`:
  "não promete envio com o aplicativo fechado, porque isso não existe"; "o
  primeiro toque fora do campo AGE, em vez de só fechar o teclado"; "a rolagem
  sabe a altura do teclado, para o campo digitado não ficar embaixo dele";
  "reserva a área segura de baixo, onde o menu escondido não está mais para
  reservar"; "de câmera: a tarja traz 'Abrir os ajustes do aparelho', e o botão
  abre os ajustes"; "de localização: a mesma tarja, o mesmo botão"; "a tarja
  diz a frase certa, com o que fazer, e não a genérica".

## Limitações e pendências

- O app (Expo) não renderiza neste ambiente: a prova de interface é o texto
  que a tela desenha no teste de componente. Não há captura do app.
- Validação humana pendente: Rafael lê as frases finais da sessão encerrada
  (no aparelho, quando houver, F14-E12).
- A decisão BZ-N:N.3 (código ou teste vale quando discordam) continua PREMISSA
  da E03; esta etapa a aplicou com as duas provas que a regra exige (decisão
  datada no código e teste irmão verde).
- O roadmap escreve `not.toMatch`; o equivalente na biblioteca de tela é
  `queryByText(...)` nulo, que varre todos os textos desenhados.
