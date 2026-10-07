# V2-F00-E16: defeitos reais do campo, parte 2 (CMP-35, CMP-89)

Data: 2026-10-07. Situação: EM ANDAMENTO (implementação e prova por teste
prontas; falta a validação no aparelho, que o ambiente não faz).

## O que foi feito

Tudo na tela de vistoria, `dc360/apps/campo/src/app/(agente)/vistoria/[id].tsx`,
mais uma frase em `dc360/apps/campo/src/dados/evidencia-no-disco.ts`:

1. **Frase do envio.** A vistoria guardada dizia que a coleta subia "mesmo com o
   aplicativo fechado", e não há sincronização em segundo plano. Título novo "Ela
   sobe com o aplicativo aberto"; texto diz que sobe quando o aplicativo estiver
   aberto e houver rede, e que a fila de envio mostra o andamento.
2. **Teclado.** `keyboardShouldPersistTaps="handled"` e
   `automaticallyAdjustKeyboardInsets` no `ScrollView` do formulário.
3. **Área segura da câmera.** `useSafeAreaInsets`: a barra do obturador e de
   "Voltar sem fotografar" soma a área segura de baixo ao recuo.
4. **Ajustes.** Câmera e localização negadas: a tarja traz "Abrir os ajustes do
   aparelho" (`Linking.openSettings`) e "Fechar". A frase e o "abre os ajustes"
   moram no mesmo estado: a falha seguinte que não é de permissão nasce sem o
   botão.
5. **Foto vazia.** `fotografar` mostra a frase de `guardarFotoNoAparelho` ("Tire
   a foto de novo"), marcada por `FotoNaoGuardada`; a câmera que não dispara
   continua com a frase genérica. A cópia recusada pelo sistema passou a sair em
   português.

Documentação: `dc360/apps/campo/LEIA-ME.md` (passo 9 do aparelho) e
`dc360/apps/campo/PENDENCIAS.md` (item 16). Esperados no `dc360/scripts/baseline.mjs`
(app +4 testes, -7 falhas; passo `teste-campo-app` espera código 0).

## Resultados reais

- Jest do app ANTES: 1857 testes, 7 falhas (as 7 da etapa, nomes em `saidas/01`).
- Jest do app DEPOIS: 1861 testes, 0 falhas, 127 suítes.
- Arquivos da etapa: 30 de 30 (`saidas/02`), com 4 casos novos: o botão não
  sobrevive à falha seguinte; o botão tem nome e 44 de altura e a tarja é região
  viva; a câmera que não disparou mantém a frase genérica; a cópia recusada sai em
  português.
- Typecheck do app: a MESMA lista de 2 erros do cache `.expo` (E21) antes e
  depois, conferida por diff (`saidas/03`).
- Portões do app (acessibilidade, densidade, design): 33 de 33 (`saidas/04`).
- Motor offline: 9 arquivos, 187 de 187 (`saidas/05`).
- `baseline.mjs --so=teste-campo-pacote,teste-campo-app,test-campo`: os três
  conferem (`saidas/baseline-depois`); `test:campo` sai com 2 por causa do
  typecheck (E21), como esperado.
- `node --test scripts/*.test.mjs`: 198 testes, 3 falhas, as da E17.
- Regras de conteúdo: só as linhas de travessão pré-existentes (`saidas/08`).

## Limitações

O app Expo não renderiza neste ambiente: não há captura de tela. A prova de
interface é por teste de componente e pelo texto que a tela desenha
(`saidas/06`). O teclado e a área segura são provados pelas propriedades do
`ScrollView` e pelo recuo calculado, não pelo comportamento num aparelho.

## O que falta (validação humana, F14-E12)

No iPhone (e em Android real quando houver): negar a câmera e tocar em "Abrir os
ajustes do aparelho" (abre os Ajustes); digitar o nome com o teclado aberto e
tocar em "Tirar foto" no primeiro toque; ver o obturador acima da barra do
sistema; foto do aparelho para esta pasta.
