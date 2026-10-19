---
validador: arbitragem (general-purpose, Opus)
modelo: claude-opus-5-5
etapa: V2-F00-E11
sha_validado: bb0f654
ci_run: ausente (39143791434 citado pelo implementador, não lido)
rodada: 4
herdado_de:
tags: [UI, A11Y, LGPD]
nivel_de_prova_exigido: [E1, E2]
nivel_de_prova_obtido: [E2]
veredito: PASS
confianca: alta
humano_necessario: sim
escalar: nenhum
---

Arbitragem do conflito entre `acessibilidade.md` (FAIL) e `qa.md`, `ux.md`, `privacidade-lgpd.md` (PASS), pela seção 7 de `28` ("Conflito entre validadores: uma arbitragem em Opus com os dois relatórios"). Pasta das sondas e saídas (fora do repositório): `/private/tmp/claude-501/-Users-rafaelgomes-Documents-city-hall/ded47d25-806d-4495-ac61-f9e84518cc35/scratchpad/validadores/arbitragem-E11/` (abaixo, `ARB/`).

Resumo da decisão: o FATO do relatório de acessibilidade está confirmado (foco cai em `BODY`), mas ele não viola critério da E11. O código que causa o defeito é anterior à etapa, a etapa não o tocou, e nem o DoD nem os campos da etapa pedem foco ou teclado; o portão da seção 0 de `19` pede "foco visível", que é atendido. O conflito é de classificação, não de prova.

## Critérios verificados

Textos que decidem, citados exatamente:

1. DoD da E11 (`03-fase-00-estabilizacao.md:322` e seguintes): "**Definition of Done:** botão baixa o ZIP em dois navegadores contra a API real; 401 renova; prova no e2e; item "bug /pacote.zip" do G00 marcado." Não há foco, teclado nem anúncio. Atendido segundo QA (não contestado pela acessibilidade, que também baixou o ZIP real).
2. "O que deve ser implementado" da E11, linha `Frontend:`: "`baixarPacoteDeSaida` usa `/saida/pacote.zip` e, em 401, renova o token e repete uma vez (mesma trava de `renovar()`); `Organizacao.tsx` revoga a URL do objeto só depois de o download começar (hoje logo após `ancora.click()`) e mostra a frase da API quando recusado." A etapa NÃO tem linha `Acessibilidade:`. Contraste decisivo com a E09, que tem (`03-fase-00-estabilizacao.md:273`): "Acessibilidade: confirmação anunciada por `role=status`, foco devolvido ao botão, ícone mais texto." Foi por esse texto que a E09 reprovou na rodada 2 (o próprio relatório de acessibilidade invoca esse precedente, mas a base textual dele não existe na E11).
3. Portão da seção 0 de `19`: "Os dois temas completos, foco visível, contraste AA, estado nunca só por cor." O item é "foco visível", não "foco preservado depois da ação". O anel de foco aparece no botão (acessibilidade: "2.4.7 anel de foco no botão: OK"; UX: capturas `e11-saida-foco-teclado-1280-{claro,escuro}.png`). Atendido.
4. Camada 12 da DoD comum (`19`, seção 1): "Acessibilidade | Teclado, foco, rótulos, contraste e nunca comunicar estado só por cor", que vale "Quando aplicável". Ela pesa a favor do FAIL, mas cede ao escopo da fase: o cabeçalho da F00 diz "Só se mexe no que está vermelho, desligado ou divergente" e "O que a fase NÃO faz: nenhuma funcionalidade nova"; a F00 manda "acessibilidade dinâmica (F10-E11)" para fora (`03-fase-00-estabilizacao.md:393`); e a V2-F10-E11 (`08-painel-prefeitura.md:318`) é dona exatamente disso: "`Estrutura.tsx` ganha região `aria-live="polite"` e `useAnunciar()` (Toast, Sino, estado do encaminhamento, estados do pacote)", com "Risco de segurança: foco mal colocado prende o teclado".
5. Regra do validador (instruções comuns): "Defeito provado em critério da etapa: FAIL. Achado que não quebra critério da etapa: "corrige antes de crescer" ou "anotado", com reprodução."
6. Precedente na própria fase (`docs/evidencias-v2/G00/V2-F00-E09/VEREDITO.md:76`): "Depois de um clique fora do `Modal`, o foco vai para BODY e o Esc para de funcionar até a pessoa voltar com Tab (anterior à fase, dono F10-E11)". Defeito de foco em `BODY` anterior, fora do texto da etapa, foi rebaixado com dono F10-E11, e a E09 passou na rodada 3.

Anterioridade (conferida por `git`):
- `git blame -L 255,280 bb0f654 -- dc360/apps/web/src/paginas/Organizacao.tsx`: as linhas 255 a 274, incluindo `disabled={baixando} onClick={() => void baixar()}` (linha 269), o rótulo "Gerando" e o `{erro && <Aviso tom="perigo">{erro}</Aviso>}`, são todas do commit `b793e828` (2026-09-17), o mesmo que criou o botão quebrado.
- `git diff afde25c..bb0f654 -- dc360/apps/web/src/paginas/Organizacao.tsx`: a etapa acrescentou só a constante `MS_ATE_LIBERAR_O_ARQUIVO`, o estado `arquivoParaLiberar` com o `useEffect` de liberação, e `document.body.appendChild(ancora)` com `ancora.remove()`. Nada no JSX do botão, no `disabled` nem no `finally`.
- O defeito também existia ANTES da etapa e era observável: o botão antigo sempre terminava em 404, que passava pelo mesmo `setBaixando(true)` e pela mesma linha 269, logo pela mesma perda de foco no caminho de erro.
- Ponto contra a etapa, registrado: a seção 28 nova do e2e (`fluxo-api.e2e.mjs:2294-2295`) PRENDE o `disabled` ("enquanto gera, o botao diz Gerando e fica desabilitado", com `isDisabled()`). A etapa não criou o defeito, mas cristalizou o mecanismo que o causa; o conserto vai precisar trocar essa verificação.

Os PASS de UX e QA olharam o foco por teclado? Não depois da ação. UX conferiu o anel de foco ANTES do Enter (`ux.md:34` e `:64`, "Foco por teclado no botão (Shift+Tab, Tab) nos dois temas: o anel aparece"); QA não tem nenhuma verificação de foco; a seção 28 do e2e clica com o mouse. Logo não há contradição de fato entre os relatórios: os PASS simplesmente não mediram o que a acessibilidade mediu.

## Evidência

- Servidores próprios: `ARB/subir.sh 3895 4895` (API em PGlite semeado, painel construído com `vite build` em `ARB/run/dist-3895`, `vite preview`), código 0, "de pe api=3895 web=4895". Derrubados com `ARB/derrubar.sh 3895 4895` (PIDs 40560 e 40582), portas conferidas livres com `lsof`; a pasta `dist-3895` foi apagada.
- Sonda: `BASE_WEB=http://localhost:4895 node ARB/sonda.mjs`, código 0, saída em `ARB/saidas/01-sonda-foco.txt`. Por motor (Chromium, Firefox) e por caso (sucesso contra a API real; 403 `sem_permissao`, 403 `acesso_suspenso` e rede caída por interceptação do pedido `**/saida/pacote.zip`), a sonda parte do `body`, chega ao botão SÓ com Tab (20 Tabs nos dois motores), aciona com Enter e mede `document.activeElement` 60 ms depois do Enter, depois do fim (download ou aviso), o Tab seguinte, e o estado do botão e das regiões vivas.
- Resultado medido:

| Motor | Caso | Foco durante | Foco depois | Tab seguinte |
| --- | --- | --- | --- | --- |
| Chromium | sucesso, API real (`dc360-pacote-de-saida-2026-10-19.zip`) | BODY | BODY | sai do documento |
| Chromium | 403 sem permissão | BODY | BODY | sai do documento |
| Chromium | 403 suspenso | BODY | BODY | sai do documento |
| Chromium | rede caída | BODY | BODY | sai do documento |
| Firefox | sucesso, API real | BODY | BODY | "Pular para o conteúdo" (topo) |
| Firefox | 403 sem permissão | BODY | BODY | "Pular para o conteúdo" (topo) |
| Firefox | 403 suspenso | BODY | BODY | "Pular para o conteúdo" (topo) |
| Firefox | rede caída | BUTTON | BUTTON | (fica no botão) |

- Durante a geração o botão está `{"texto":"Gerando","disabled":true,"ariaBusy":null,"ariaDisabled":null}`. Regiões vivas presentes depois do sucesso: `DIV[aria-live=polite]` vazia, o contador do sino e o aviso de teto do armazenamento; nenhuma frase de sucesso. Nos três erros aparece `DIV[role=alert]` com a frase do servidor.
- Inspeção de código: `grep -rn 'disabled={' dc360/apps/web/src --include='*.tsx'` dá 49 ocorrências, entre elas o mesmo padrão "desabilita enquanto ocupado" em `ConfirmarAcao.tsx:141,149`, `Sino.tsx:133,149`, `Organizacao.tsx:121` e `QueroConhecer.tsx:269` (não medi foco nesses).

## Cenários positivos

- O ZIP real baixa pelo teclado (Tab até o botão, Enter) nos dois motores; nome `dc360-pacote-de-saida-2026-10-19.zip`.
- Os três erros aparecem em `role="alert"` com a frase do servidor, nos dois motores.
- O botão é alcançável por Tab, tem nome correto e anel de foco (conferido pela acessibilidade e pela UX).

## Cenários negativos

- Sucesso e três erros: foco perdido para `BODY` em 7 dos 8 pares motor e caso. No Firefox com rede caída o foco fica no botão, porque o aborto chega antes de o React aplicar `disabled` (diferença menor em relação ao relatório de acessibilidade, que relatou perda nos três erros do Firefox; a conclusão não muda).
- "Gerando" não é anunciado (sem `aria-busy`, sem região viva) e o sucesso não deixa mensagem na tela.

## Tentativas de reprovar

1. Tentei reprovar a própria arbitragem procurando no texto da E11 qualquer exigência de foco, teclado ou anúncio: lidos o objetivo, o "O que deve ser implementado", os cinco campos de teste, o E2E, a validação humana e o DoD. Nenhuma; a etapa não tem linha `Acessibilidade:` (a E09 tem, e por isso reprovou).
2. Tentei provar que a etapa CAUSOU ou PIOROU o defeito: `git blame` e o diff da fase mostram que o JSX do botão e o `finally` são de `b793e828`, intocados; o caminho de erro 404 de antes passava pela mesma linha 269. A etapa tornou o caminho de sucesso alcançável, mas não mexeu no foco. O único vínculo é a verificação `isDisabled()` do e2e, que prende o mecanismo (registrado como ponto contra).
3. Tentei enquadrar no portão da seção 0 de `19`: o item é "foco visível"; o anel aparece. Não há item de ordem de foco no portão.
4. Tentei enquadrar na lista da seção 7 de `28` (critérios sem risco aceito): acessibilidade não está na lista; não há perda de dado, nem vazamento, nem autorização em jogo.
5. Reproduzi o achado do FAIL de forma independente, só por teclado, contra a API real, nos dois motores, para não arbitrar sobre prova alheia: confirmado.
6. Conferi se seria BLOCKED por decisão de produto: não é; o comportamento certo (foco preservado, estado anunciado) é técnico e já tem dono no roadmap.

## Achados

1. **Corrige antes de crescer, severidade média (WCAG 2.4.3, nível A), dono V2-F10-E11.** Ao acionar "Baixar pacote de saída" pelo teclado, o botão vira `disabled` (`dc360/apps/web/src/paginas/Organizacao.tsx:269`, de `b793e828`) e o foco cai em `BODY` no sucesso e nos erros (Chromium 4 de 4, Firefox 3 de 4); no Firefox o Tab seguinte recomeça do topo, no Chromium sai do documento (o botão é o último controle). Rebaixado porque nenhum critério da E11 pede foco, o código é anterior e não foi tocado, e a F10-E11 é dona de foco e anúncio, inclusive dos "estados do pacote". O padrão "desabilita enquanto ocupado" se repete em outros controles (49 `disabled={` no painel), o que reforça que o conserto é transversal. Conserto mínimo (não implementado): no `CartaoDeSaida`, trocar `disabled={baixando}` por `aria-disabled={baixando}` com guarda `if (baixando) return;` no início de `baixar` (o botão continua focável e não aceita segundo clique), ou guardar uma `ref` do botão e chamar `ref.current?.focus()` no `finally`; nos erros, pode-se levar o foco ao `Aviso` com a prop `foco` que a E09 criou. A verificação `isDisabled()` de `fluxo-api.e2e.mjs:2294-2295` passa a conferir `aria-disabled="true"`, e o e2e ganha uma verificação de foco depois do Enter. Registrar em `dc360/apps/web/PENDENCIAS.md`, seção 8, como item 8.5, com dono F10-E11, para não se perder (hoje não está registrado).
2. **Corrige antes de crescer, severidade baixa (WCAG 4.1.3), dono V2-F10-E11.** "Gerando" não é anunciado (sem `aria-busy` nem região viva) e o sucesso não deixa mensagem na tela; para leitor de tela o clique termina em silêncio. É literalmente o escopo de `useAnunciar()` da F10-E11 ("estados do pacote"). Conserto mínimo: `aria-busy={baixando}` no botão e, ao concluir, uma frase de `role="status"` ("Pacote baixado: dc360-pacote-de-saida-AAAA-MM-DD.zip").
3. **Anotado, para o gatekeeper:** os PASS de UX e QA não mediram foco depois da ação (UX só o anel antes do Enter; QA nada). Não invalida os PASS, porque a etapa não pede, mas o validador de UX listou "foco" no item do portão sem esse recorte.

## Não verificado

- Anúncio real por leitor de tela (VoiceOver, NVDA): fora do alcance de agente (CP-32).
- WebKit: não rodado nesta arbitragem (o Tab do WebKit do Playwright no macOS não alcança botões, como a acessibilidade já registrou); a decisão não depende dele.
- 403 `sem_permissao` e `acesso_suspenso` foram simulados por interceptação do pedido, não pela coordenadora nem por município suspenso de verdade; o caminho no painel é o mesmo (`ErroDaApi` vira `erro` e o mesmo `finally`), e QA provou as recusas reais da API.
- Foco nos outros controles com `disabled={...}`: só inspeção de código.
- CI do SHA: não lido (ver `ci_run`).

## Risco residual

Médio para quem usa só teclado ou leitor de tela: depois de baixar o pacote (ação rara, de administrador, uma vez por saída de município) a pessoa perde a posição e precisa percorrer a página de novo, e não ouve que o pacote está sendo gerado nem que terminou. Não há perda de dado nem efeito de segurança; o download completa. O risco de esquecimento é mitigado só se o item entrar em `PENDENCIAS.md` com dono F10-E11, como recomendado no achado 1.

## Motivo do humano

Rafael: (a) se preferir o conserto já na F00 (poucas linhas, ver achado 1) em vez de deixar com a F10-E11, é decisão de prioridade dele, não critério da etapa; (b) a validação humana da própria etapa continua pendente ("Rafael baixa o pacote pelo painel com a API local e abre o ZIP"); (c) leitor de tela real para os anúncios (CP-32), depois do conserto.
