# V2-F03-E01: ADR 0009, pessoa global com conta e vínculo por município (proposta)

## Fatos

**Base:** `origin/v2/f03` em `ddee3fd`, ramo de trabalho `trab/f03-0a-e01-adr` (parte 0A do lote 0 de
`docs/roadmap-v2/retomada/plano-f03.md`). Só documento: nenhum código, nenhuma migração, nenhum `package.json`, e o
CLAUDE.md não foi tocado.

**Arquivos:**

- `docs/adr/0009-pessoa-global-com-conta-por-municipio.md` (novo), no formato das ADRs 0001 a 0008. Situação:
  PROPOSTA, aceite do Rafael pendente (H97) e parecer do encarregado (CP-49). Contém:
  - **Contexto** com o "antes" conferido neste SHA: `usuarios` (001) com credencial na linha (002, 046), índice global
    TOTAL `usuarios_email_global_idx` (002), `sessoes` e `segundo_fator` por município (002, 022),
    `credenciais_para_login` resolvendo o município pelo e-mail, `CONTEUDO_ACESSO` com `sub`, `org`, `papel`, `nome`,
    `sid`, `sp` e plateia única `dc360` (`auth/tokens.ts`), `exigirAutenticacao` (`servidor.ts`, por volta da linha
    574) com vigência só na escrita, e o portão com `SEM_TENANT`, `SEM_POLICY_DE_TENANT` e o teto `<= 27`.
  - **Decisões 1 a 6** = itens 1 a 6 da etapa: (1) pessoa, conta e vínculo, com a credencial passando para `pessoas`
    em três passos sem duas fontes graváveis (P-04, tabela por passo e inventário inicial das funções que tocam a
    credencial, inclusive o gatilho `recuperacoes_morrem_com_a_credencial` da 051); (2) token de um município por vez,
    escolha ao entrar, troca com sessão e token novos, plateia pela conta, a organização só do token verificado (com a
    escolha da E16 nomeada como a única entrada fora do token, que só escolhe) e 404 entre municípios; (3) `pessoas`
    como exceção nomeada com quatro travas (RLS forçada sem policy, zero grant ao `dc360_app`, só funções SECURITY
    DEFINER nominais que conferem o tenant, listas `FUNCOES_PRIVILEGIADAS` e `EXCECOES_AO_ISOLAMENTO` conferidas no
    catálogo nos dois sentidos) e o que nenhuma função pode fazer; (4) órgão como contexto, não tenant; (5)
    `usuario_orgao`; (6) administrador de município nunca define senha, e-mail nem segundo fator de pessoa com conta
    em outro município, com a transição até o CP-50 (409 `pessoa_em_varios_municipios`, premissa de H94 e H96).
  - **Premissas P-01 a P-12** classificadas: norma (P-01, P-03, P-04, P-07, P-09 e a parte de configuração da P-11)
    ou ordem de trabalho (as demais).
  - **Consequências:** o que cada etapa E02 a E21 passa a dever, a lista do que fica proibido (as condições de
    reabertura do G03), boas e ruins assumidas (credencial concentrada, dado pessoal fora do tenant, H98, login mais
    longo, uma consulta a mais por leitura, mais funções privilegiadas).
  - **Alternativas descartadas** (item 7): e-mail por município, conta sem pessoa, token multimunicípio, papel acima do
    município, órgão como tenant, manter a D-02, provedor externo.
  - **Estado e aceite:** H97, CP-49, CP-50 (H96), segunda leitura de segurança antes do aceite, notas previstas da E07
    e da E18 no lote 7B.
- `dc360/apps/api/PENDENCIAS.md`: linha nova na tabela do topo e seção nova no fim, "Uma pessoa, vários municípios: a
  ADR 0009 substitui o backlog de A-01". Nada foi apagado. A seção registra que o arquivo não tinha seção própria para
  A-01 (a limitação morava só no roadmap e no comentário da 002), descreve os três efeitos no código, diz quem fecha
  cada um (E09, E10, E15, E16, E17) e o que segue aberto fora da F03 (a pessoa trocar o próprio e-mail; redefinição
  de pessoa com vários municípios até o CP-50).
- `dc360/docs/PAPEIS_E_RESPONSABILIDADES.md`: seção nova curta "Pessoa, conta e vínculo (proposta da ADR 0009, ainda
  não no código)", depois de "Três regras que valem para todos": pessoa, conta, município ativo, papel por município,
  `usuario_orgao` e vínculo. A tabela presa ao código não mudou.
- Nesta pasta: `proposta-de-redacao-do-claude-md.md` (duas trocas e dois acréscimos para a lista "Regras que valem lá"
  da seção "O produto real", com o texto de hoje copiado do CLAUDE.md deste SHA), as saídas dos portões e o
  `INDEX.md`.

**Portões (saídas nesta pasta):**

- `regras-de-conteudo.txt`: `npx vitest run` de `regras-de-conteudo.test.ts`, `permissoes-no-readme.test.ts` e
  `ressalva-saida-a-campo.test.ts`. 57 de 58 verdes; o único reprovado é o caso de ambiente Windows conhecido (EPERM ao
  criar symlink, DV-46). "Nenhum travessão" e "nenhuma norma citada fora da lista autorizada" verdes com os arquivos
  novos.
- `npm-test-shared.txt`: `npm test --workspace @dc360/shared` (regressão obrigatória da etapa), 416 de 417, o mesmo
  único caso EPERM.
- `gerar-estado.txt`: `node scripts/roadmap/gerar-estado.mjs --conferir`, saída 0.
- `node dc360/scripts/conferir-indices-de-evidencia.mjs` da raiz: verde com este índice (rodado depois de gravar o
  `INDEX.md`; não arquivado aqui porque a saída depende do próprio índice).
- `conferir:numeros` não foi rodado: nenhum número do README mudou.

## Justificativa

A etapa pede a decisão escrita antes do código. A ADR fixa como norma o que o plano da F03 trata como premissa e que
não pode variar entre partes paralelas: a passagem da credencial sem duas fontes (P-04), a lista nominal antes de
qualquer função nova (P-03), a leitura no banco antes do token enxuto (P-01), o login do `usuario_orgao` fechado
(P-09). O ponto mais delicado da regra do CLAUDE.md ("a organização vem só do token") é a escolha do município no
login, que recebe `organizacaoId` no corpo; a ADR e a proposta de redação a nomeiam como a única entrada fora do
token, com o limite (só escolhe entre as contas da própria pessoa e não vira contexto antes do token assinado), em vez
de deixá-la implícita. Nenhuma norma ou lei foi citada por número; a LGPD aparece só pelo nome.

## Para o orquestrador

- **Linha do STATUS sugerida:** `V2-F03-E01 | IMPLEMENTADA | candidato em trab/f03-0a-e01-adr | ADR 0009 (proposta):
  pessoa global, conta e vínculo por município, token de um município, exceção nomeada de pessoas; PENDENCIAS e PAPEIS
  atualizados; proposta de redação do CLAUDE.md na evidência`.
- **Pendências humanas (já numeradas, não alterei o arquivo):** H97 (aceite da ADR e da redação do CLAUDE.md), H96
  (CP-49 e CP-50 decididos ou adiados), H94 (redefinição por administrador, transição da decisão 6), H98 (destino da
  linha de `pessoas` na eliminação).
- **Definição de pronto da etapa:** "ADR aceita" depende do H97; até lá a etapa fica IMPLEMENTADA com a ADR em
  PROPOSTA. O G03 exige o aceite e o hash arquivados aqui.
- **Revisão pedida pelo plano:** segunda leitura de segurança por outra família de modelo (Codex) antes do aceite.
- **Para as partes seguintes:** a 0B usa os nomes `FUNCOES_PRIVILEGIADAS` e `EXCECOES_AO_ISOLAMENTO` citados aqui; a
  1B (E15) deve partir do inventário da decisão 1 e incluir o gatilho da 051; a 7B acrescenta as notas da E07 e da
  E18 no fim da ADR, sem reescrever o texto.
- **Não toquei:** STATUS, ESTADO-ATUAL, `dividas.md`, `pendencias-humanas.md`, CLAUDE.md, código.
