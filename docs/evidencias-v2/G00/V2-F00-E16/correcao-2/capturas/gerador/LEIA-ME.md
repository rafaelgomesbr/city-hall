# Como estas capturas foram feitas

O aplicativo Expo não renderiza no navegador e não há emulador nesta máquina, e `react-native-web` não está instalado (e não foi instalado: a regra da rodada proíbe instalar). A prova visual possível aqui é de nível **E1+**, e este arquivo diz exatamente o que ela é e o que não é.

1. Os arquivos `testes-temporarios/*.txt` são testes de jest descartáveis (copiados para `apps/campo/src/__tests__/` com a extensão `.test.tsx`, rodados e apagados da árvore). Cada um monta a tela REAL (vistoria com a câmera aberta, fila de envio, lista de tarefas com a faixa do topo) com os dublês de módulo nativo que as suítes do aplicativo já usam, espera a animação de entrada terminar (1,8 s) e grava a árvore do `react-test-renderer` com os estilos achatados.
2. `arvore-para-html.mjs` converte essa árvore em HTML e CSS (View vira flexbox, Text vira texto, os ícones SVG viram SVG) e o Playwright fotografa em 390 px de largura, no tema claro e no escuro.

## O que a captura prova

Os textos, as cores, os tamanhos e a hierarquia que os componentes REAIS produzem: a frase nova do cartão da tarefa por motivo de pausa, as frases da fila com a condição "aberto", e o botão "Voltar sem fotografar" legível sobre o visor.

## O que a captura NÃO prova (pendente para o validador com emulador, nível E2)

- O layout do aparelho: quem desenha aqui é o Chromium e não o Yoga do React Native. O espaçamento lateral do contêiner das listas (`contentContainerStyle`) e a barra de abas do roteador não entram na árvore, por isso a fila aparece sem as margens laterais que o aparelho tem.
- A fonte do aparelho, o antialiasing, o visor da câmera (aqui um bloco preto) e a foto real.
- Qualquer comportamento: a captura é estática.
