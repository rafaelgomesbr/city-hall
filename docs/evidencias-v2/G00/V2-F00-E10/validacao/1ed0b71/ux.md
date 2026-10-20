---
validador: ux
modelo: claude-opus-5-5
etapa: V2-F00-E10
sha_validado: 1ed0b71
ci_run: ausente
rodada: 6
herdado_de:
tags: [UI, A11Y, AUTH, API, LGPD, INFRA]
nivel_de_prova_exigido: [E2, E3a]
nivel_de_prova_obtido: [E2, E3a]
veredito: PASS
confianca: alta
humano_necessario: sim
escalar: nenhum
---
## Critérios verificados

Montagem: API do SHA na porta 3791 (PGlite semeado, recuperação ligada, `NOTIFICADOR_ARQUIVO` no scratchpad) e painel construído do SHA na 4791. Chromium e Firefox do Playwright. Cada tamanho usa uma conta nova criada pela administradora, para o teto de 5 pedidos por email não esconder o link. Capturas em `capturas/` desta pasta (prefixo `ux-E10-`); saídas em `SCRATCH/validadores/ux/saidas/`.

| Critério da etapa (estados da tela) | Resultado | Prova |
| --- | --- | --- |
| Pedido com resposta neutra | OK: "Se existir conta com esse email, enviamos um link de redefinição. Confira sua caixa de entrada.", foco na confirmação (Chromium e Firefox) | `ux-E10-pedido-enviado-{1280,768,390,320}-{claro,escuro}.png`, `saidas/e10.txt`, `saidas/e10-firefox.txt` |
| Email vazio e torto | OK: "Informe o seu email funcional." e "Informe um email completo, como nome@orgao.gov.br.", foco no campo | `ux-E10-pedido-erro-vazio-*`, `ux-E10-pedido-erro-formato-*` |
| Token sai da barra de endereço | OK nos 9 percursos (`token some da barra: true`) | `saidas/e10.txt` |
| Senha curta e senhas diferentes, cada erro no campo certo | OK: "A senha precisa de pelo menos 12 caracteres." (foco em `#nova-senha`) e "As duas senhas precisam ser iguais." (foco em `#repetir-senha`) | `ux-E10-definir-erro-curta-*`, `ux-E10-definir-erro-diferentes-*` |
| Sucesso | OK: "Senha redefinida. Entre com a nova senha." com o foco nela e "Entrar com a nova senha" como única ação | `ux-E10-definir-sucesso-*` |
| Link já usado, frase que manda pedir outro | OK: "Este link de redefinição não vale mais. ... Peça um novo link." com o botão "Pedir um novo link" | `ux-E10-definir-link-ja-usado-*` |
| Endereço sem link | OK | `ux-E10-definir-sem-link-*` |
| Recuperação desligada aponta quem administra e o botão da E09 | OK: quatro passos, o segundo cita "Redefinir senha" da lista de Usuários | `ux-E10-pedido-desligada-{1280,320}-{claro,escuro}.png` |
| Limite (429) e sem rede | OK no texto: "Muitos pedidos em pouco tempo. Aguarde alguns minutos e tente de novo." e "Sem conexão com o servidor. ... Verifique o sinal e tente de novo." | `ux-E10-pedido-erro-excesso-*`, `ux-E10-pedido-erro-rede-*` |
| Alvo de toque do "Esqueceu a senha?" | OK: 137x44 px | `saidas/e10.txt` |

Portão visual, item a item (114 capturas):

| Item | Resultado |
| --- | --- |
| Alinhamento | OK: moldura e cartão no mesmo eixo em todas as telas |
| Espaçamento | OK: respiro igual entre aviso, texto, passos e botão |
| Nada fora do lugar | OK medido em todas as telas: sem rolagem horizontal, nada fora da janela, nada cortado, nenhuma palavra quebrada no meio (`saidas/e10.txt`); email de 95 caracteres no campo rola dentro do campo (`ux-E10-pedido-email-longo-320-claro.png`) |
| Hierarquia | OK: o subtítulo muda com o estado ("Este link não vale mais", "Sua senha foi alterada") |
| Texto | OK: português correto, sem travessão, rótulo que diz o que digitar, erro que diz o que fazer, sem supor gênero |
| Responsivo | OK a 1280, 768, 390 e 320 px |
| Temas, foco visível, estado não só por cor | OK: anel de foco visível na confirmação (`ux-E10-definir-sucesso-1280-escuro.png`); avisos com ícone e texto |
| Estados vazio e de erro | Desenhados com a mesma qualidade do normal |

Heurísticas: visibilidade do estado (cada falha tem frase própria), prevenção de enumeração sem perder clareza (frase neutra que diz onde olhar), recuperação do erro (cada beco tem a ação: pedir novo link, voltar para a entrada).

## Evidência

- `node SCRATCH/validadores/ux/e10.mjs` (Chromium, código 0), saída `saidas/e10.txt` e `saidas/e10-run.txt`, 100 capturas.
- `MOTOR=firefox node SCRATCH/validadores/ux/e10.mjs` (código 0), saída `saidas/e10-firefox.txt`, 14 capturas com sufixo `-firefox`; zero erro de página.
- Os 401 no console do Chromium são os do link usado de propósito; os 429 e a queda de rede vêm de interceptação (declarado).

## Cenários positivos

1. Pedido, link real do notificador de arquivo, senha nova, sucesso com foco na confirmação, em quatro tamanhos e dois temas.
2. Firefox: o mesmo percurso a 390 px, com o foco certo no pedido enviado, nos erros de campo e no sucesso.

## Cenários negativos

1. O mesmo link duas vezes: segunda recusada com a frase de pedir outro.
2. Sem link, recuperação desligada, 429, sem rede.

## Tentativas de reprovar

- Largura mínima de 320 px e tema escuro em todos os estados.
- Email de 95 caracteres no campo do pedido a 320 px.
- Firefox, por causa do achado de foco da E09: os focos desta tela (levados por efeito) seguram no Firefox; só os estados abaixo caem em BODY, nos dois motores.
- Procurei redirecionamento automático depois do sucesso (defeito da correção 2): a tela fica e oferece uma ação só.

## Achados

1. **corrige antes de crescer.** O foco vai para BODY depois de "link que não vale mais" (Chromium e Firefox), e no pedido depois do 429 e da queda de rede (Chromium; no Firefox a queda de rede fica no botão). Os avisos são `role="alert"`, então são anunciados; o caso do link está registrado em `apps/web/PENDENCIAS.md` (F10-E11); 429 e rede não estão.

## Não verificado

- O cabeçalho `Referrer-Policy` e o `X-Robots-Tag` na Vercel (o `vite preview` não aplica o `vercel.json`).
- Link vencido por relógio (a tela mostra a mesma frase do link usado, pelo código).
- Zoom de 200 por cento nestas telas; WebKit; leitor de tela.

## Risco residual

Baixo para a experiência: todos os estados pedidos estão desenhados e escritos com clareza; o resíduo é o foco em três estados de erro de rede ou de link, que são anunciados.

## Motivo do humano

Portão visual com Rafael obrigatório (tela pública) e validação humana da etapa: fazer o fluxo com o notificador de arquivo, ler as frases e conferir que a produção segue desligada. Capturas: `ux-E10-pedido-enviado-390-claro.png`, `ux-E10-definir-link-ja-usado-390-claro.png`, `ux-E10-pedido-desligada-320-escuro.png`, `ux-E10-definir-sucesso-1280-escuro.png`.
