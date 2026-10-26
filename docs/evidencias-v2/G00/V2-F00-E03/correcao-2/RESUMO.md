# V2-F00-E03, correção 2: as cinco perguntas respondidas pelo Rafael

## Fatos

- **Decisões do Rafael em 2026-10-13** (D3 do roteiro de aprovação, uma pergunta por vez):
  - Q1: a regra de BZ-N:N.3 vale (código com decisão datada vence o teste antigo, teste de defeito confirmado vence o código).
  - Q2: os 14 defeitos do campo (V-CAM-07 a V-CAM-20) são reais.
  - Q3: as 13 reescritas de teste ficam como foram feitas, com o registro de `docs/DECISOES-DE-TESTE-DA-FASE-00.md`.
  - Q4: a troca de espera fixa por espera com condição e limite vale; os outros 10 pontos parecidos entram numa etapa futura.
  - Q5: o aviso de ferramenta da raiz (3 pacotes do `vitest`) fica como aviso aceito, com dono e prazo; o Expo já tinha sido atualizado (D1, E19 correção 2).
- **O que mudou no código por causa da Q5:** `dc360/scripts/auditar-excecoes.mjs` ganhou `ACEITAS_EM_DESENVOLVIMENTO` (`vitest`, `@vitest/mocker`, `tinypool`, dono Rafael, prazo 2027-01-05, mesma validação de motivo, dono e prazo das exceções do aplicativo) e `dc360/scripts/auditar.mjs` passou a nomear os avisos de desenvolvimento: os da lista aparecem como "aceita (desenvolvimento)", e o que não estiver nela continua só avisando, mas diz o nome e que falta dono e prazo. `npm run auditar` segue com código 0. Três casos novos em `scripts/auditar.test.mjs` (de 20 para 23).
- **Registro (`classificacao-dos-vermelhos.md`):** V-DEP-2b, V-DEP-4 e V-ROT-01 fechadas em 2026-10-13. Abertos 6 (V-DEP-3, tolerado pelo CP-03, e V-INS-02 a V-INS-06, instabilidades que não reproduziram em 5 rodadas completas); fechados 65 de 71; nenhuma pergunta pendente.
- **O que segue sem satisfazer à letra:** o item do G00 pede "zero itens abertos". Há 6 linhas abertas, todas com dono, issue e prazo. A decisão sobre isso é do gatekeeper e do Rafael.

## Justificativa

As cinco perguntas eram a parte humana do item "todos os vermelhos classificados e fechados". Com as respostas, o registro deixa de depender de premissa. A Q5 pedia dono e prazo para o aviso do `vitest`: em vez de só registrar no papel, a lista entrou no portão, que valida motivo, dono e prazo e reprova quando vencer.
