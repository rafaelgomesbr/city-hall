$ cd packages/shared && npx vitest run test/permissoes-no-readme.test.ts
(cwd dc360/, código de saída 1)


 RUN  v3.2.7 /Users/[usuario]/Documents/city-hall/dc360/packages/shared

 ❯ test/permissoes-no-readme.test.ts (8 tests | 5 failed) 11ms
   × Tabela de permissões do README presa ao catálogo do pacote compartilhado > o README traz exatamente a tabela gerada de acoesDoPapel (nem falta, nem sobra ação) 4ms
     → gere a tabela de novo e cole abaixo do marcador: expected [ …(3) ] to deeply equal []
   ✓ Tabela de permissões do README presa ao catálogo do pacote compartilhado > o catálogo é coerente: todo rótulo é único e não vazio, e toda ação do catálogo é de alguém 1ms
   × Tabela de permissões do README presa ao catálogo do pacote compartilhado > o README lista, no total, todas as ações do catálogo (nenhuma some da tabela inteira) 2ms
     → levantar_interdicao: expected '| Operador de plantão | registrar oco…' to contain 'levantar a interdição de um imóvel'
   × Tabela de permissões do README presa ao catálogo do pacote compartilhado > mordida > a tabela atual passa (controle) 0ms
     → expected [ …(3) ] to deeply equal []
   × Tabela de permissões do README presa ao catálogo do pacote compartilhado > mordida > ação que FALTA no README é acusada, com o nome do papel e da ação 1ms
     → expected '# Defesa Civil Operacional 360, produ…' not to be '# Defesa Civil Operacional 360, produ…' // Object.is equality
   ✓ Tabela de permissões do README presa ao catálogo do pacote compartilhado > mordida > ação que SOBRA no README é acusada 0ms
   × Tabela de permissões do README presa ao catálogo do pacote compartilhado > mordida > papel sem linha, linha de papel inexistente e ordem trocada são acusados 1ms
     → expected 'falta a linha do papel coordenador; d…' to contain 'a ordem difere'
   ✓ Tabela de permissões do README presa ao catálogo do pacote compartilhado > mordida > README sem o marcador falha em voz alta (a tabela não pode perder a amarra) 0ms

 Test Files  1 failed (1)
      Tests  5 failed | 3 passed (8)
   Start at  02:48:59
   Duration  256ms (transform 64ms, setup 0ms, collect 84ms, tests 11ms, environment 0ms, prepare 29ms)


⎯⎯⎯⎯⎯⎯⎯ Failed Tests 5 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  test/permissoes-no-readme.test.ts > Tabela de permissões do README presa ao catálogo do pacote compartilhado > o README traz exatamente a tabela gerada de acoesDoPapel (nem falta, nem sobra ação)
AssertionError: gere a tabela de novo e cole abaixo do marcador: expected [ …(3) ] to deeply equal []

- Expected
+ Received

- []
+ [
+   "coordenador: faltam [levantar a interdição de um imóvel], nada sobra. Linha certa: | Coordenador | registrar ocorrência, classificar na triagem, despachar equipe, encaminhar providência, registrar a resposta de uma providência, encerrar ocorrência, emitir laudo ou termo de interdição, consultar os ofícios de encaminhamento, levantar a interdição de um imóvel, gerenciar equipes, gerenciar usuários, consultar a trilha de auditoria, exportar dados, acompanhar quem está em campo agora |",
+   "falta a linha do papel administrador; deveria ser: | Administrador da organização | alterar os dados do município, registrar ocorrência, classificar na triagem, despachar equipe, encaminhar providência, registrar a resposta de uma providência, encerrar ocorrência, emitir laudo ou termo de interdição, consultar os ofícios de encaminhamento, levantar a interdição de um imóvel, gerenciar equipes, gerenciar usuários, consultar a trilha de auditoria, exportar dados, acompanhar quem está em campo agora |",
+   "linha de papel que o código não tem: | Administrador | alterar os dados do município, registrar o",
+ ]

 ❯ test/permissoes-no-readme.test.ts:93:82
     91| 
     92|   it("o README traz exatamente a tabela gerada de acoesDoPapel (nem fa…
     93|     expect(diferencas(texto), "gere a tabela de novo e cole abaixo do …
       |                                                                                  ^
     94|   });
     95| 

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/5]⎯

 FAIL  test/permissoes-no-readme.test.ts > Tabela de permissões do README presa ao catálogo do pacote compartilhado > o README lista, no total, todas as ações do catálogo (nenhuma some da tabela inteira)
AssertionError: levantar_interdicao: expected '| Operador de plantão | registrar oco…' to contain 'levantar a interdição de um imóvel'

Expected: "levantar a interdição de um imóvel"
Received: "| Operador de plantão | registrar ocorrência, registrar a resposta de uma providência, consultar os ofícios de encaminhamento, acompanhar quem está em campo agora | | Agente de campo | registrar vistoria | | Coordenador | registrar ocorrência, classificar na triagem, despachar equipe, encaminhar providência, registrar a resposta de uma providência, encerrar ocorrência, emitir laudo ou termo de interdição, consultar os ofícios de encaminhamento, gerenciar equipes, gerenciar usuários, consultar a trilha de auditoria, exportar dados, acompanhar quem está em campo agora | | Administrador | alterar os dados do município, registrar ocorrência, classificar na triagem, despachar equipe, encaminhar providência, registrar a resposta de uma providência, encerrar ocorrência, emitir laudo ou termo de interdição, consultar os ofícios de encaminhamento, gerenciar equipes, gerenciar usuários, consultar a trilha de auditoria, exportar dados, acompanhar quem está em campo agora |"

 ❯ test/permissoes-no-readme.test.ts:111:47
    109|   it("o README lista, no total, todas as ações do catálogo (nenhuma so…
    110|     const celulas = tabelaDoReadme(texto).slice(2).join(" ");
    111|     for (const a of ACOES) expect(celulas, a).toContain(ROTULO_ACAO[a]…
       |                                               ^
    112|   });
    113| 

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[2/5]⎯

 FAIL  test/permissoes-no-readme.test.ts > Tabela de permissões do README presa ao catálogo do pacote compartilhado > mordida > a tabela atual passa (controle)
AssertionError: expected [ …(3) ] to deeply equal []

- Expected
+ Received

- []
+ [
+   "coordenador: faltam [levantar a interdição de um imóvel], nada sobra. Linha certa: | Coordenador | registrar ocorrência, classificar na triagem, despachar equipe, encaminhar providência, registrar a resposta de uma providência, encerrar ocorrência, emitir laudo ou termo de interdição, consultar os ofícios de encaminhamento, levantar a interdição de um imóvel, gerenciar equipes, gerenciar usuários, consultar a trilha de auditoria, exportar dados, acompanhar quem está em campo agora |",
+   "falta a linha do papel administrador; deveria ser: | Administrador da organização | alterar os dados do município, registrar ocorrência, classificar na triagem, despachar equipe, encaminhar providência, registrar a resposta de uma providência, encerrar ocorrência, emitir laudo ou termo de interdição, consultar os ofícios de encaminhamento, levantar a interdição de um imóvel, gerenciar equipes, gerenciar usuários, consultar a trilha de auditoria, exportar dados, acompanhar quem está em campo agora |",
+   "linha de papel que o código não tem: | Administrador | alterar os dados do município, registrar o",
+ ]

 ❯ igual test/permissoes-no-readme.test.ts:121:56
    119|   */
    120|   describe("mordida", () => {
    121|     const igual = (t: string) => expect(diferencas(t)).toEqual([]);
       |                                                        ^
    122| 
    123|     it("a tabela atual passa (controle)", () => igual(texto));
 ❯ test/permissoes-no-readme.test.ts:123:49

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[3/5]⎯

 FAIL  test/permissoes-no-readme.test.ts > Tabela de permissões do README presa ao catálogo do pacote compartilhado > mordida > ação que FALTA no README é acusada, com o nome do papel e da ação
AssertionError: expected '# Defesa Civil Operacional 360, produ…' not to be '# Defesa Civil Operacional 360, produ…' // Object.is equality
 ❯ test/permissoes-no-readme.test.ts:128:26
    126|       const rotulo = ROTULO_ACAO.levantar_interdicao;
    127|       const mutado = texto.replace(`${rotulo}, `, "");
    128|       expect(mutado).not.toBe(texto);
       |                          ^
    129|       const d = diferencas(mutado);
    130|       expect(d.length).toBeGreaterThan(0);

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[4/5]⎯

 FAIL  test/permissoes-no-readme.test.ts > Tabela de permissões do README presa ao catálogo do pacote compartilhado > mordida > papel sem linha, linha de papel inexistente e ordem trocada são acusados
AssertionError: expected 'falta a linha do papel coordenador; d…' to contain 'a ordem difere'

- Expected
+ Received

- a ordem difere
+ falta a linha do papel coordenador; deveria ser: | Coordenador | registrar ocorrência, classificar na triagem, despachar equipe, encaminhar providência, registrar a resposta de uma providência, encerrar ocorrência, emitir laudo ou termo de interdição, consultar os ofícios de encaminhamento, levantar a interdição de um imóvel, gerenciar equipes, gerenciar usuários, consultar a trilha de auditoria, exportar dados, acompanhar quem está em campo agora |
+ falta a linha do papel operador; deveria ser: | Operador de plantão | registrar ocorrência, registrar a resposta de uma providência, consultar os ofícios de encaminhamento, acompanhar quem está em campo agora |
+ falta a linha do papel agente_campo; deveria ser: | Agente de campo | registrar vistoria |
+ falta a linha do papel administrador; deveria ser: | Administrador da organização | alterar os dados do município, registrar ocorrência, classificar na triagem, despachar equipe, encaminhar providência, registrar a resposta de uma providência, encerrar ocorrência, emitir laudo ou termo de interdição, consultar os ofícios de encaminhamento, levantar a interdição de um imóvel, gerenciar equipes, gerenciar usuários, consultar a trilha de auditoria, exportar dados, acompanhar quem está em campo agora |

 ❯ test/permissoes-no-readme.test.ts:150:46
    148|       const trocada = texto.replace(op, op.replace(`${a}, ${b}`, `${b}…
    149|       expect(trocada).not.toBe(texto);
    150|       expect(diferencas(trocada).join("\n")).toContain("a ordem difere…
       |                                              ^
    151|     });
    152| 

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[5/5]⎯

