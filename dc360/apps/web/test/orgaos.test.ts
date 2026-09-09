import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import {
  FORMULARIO_VAZIO, conferirMotivo, conferirOrgao,
} from "../src/paginas/orgaos-regras";
import * as repositorio from "../src/dados/repositorio";

/**
 * O CATÁLOGO DE ÓRGÃOS, E A REGRA QUE ELE NÃO PODE PERDER.
 *
 * O catálogo nasceu porque `providencias.orgao_destino` era texto livre, e
 * texto livre digitado por pessoas diferentes ao longo de um ano vira "Corpo de
 * Bombeiros", "Bombeiros", "CBMSC" e "corpo de bombeiros": quatro destinos para
 * o mesmo órgão, e a conta que sustenta a conversa de orçamento deixa de
 * fechar.
 *
 * A regra que este arquivo guarda é a outra: ÓRGÃO NÃO SE APAGA, SE ENCERRA COM
 * MOTIVO. Ele aparece em ofício já emitido e na trilha de quem encaminhou o
 * quê; apagar a linha apagaria a resposta para "para onde foi este ofício", que
 * é a pergunta que uma auditoria faz. O banco reforça (o papel de aplicação não
 * tem DELETE nessa tabela), e aqui a tela é cobrada por não oferecer o caminho.
 */

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), "..", "src");
const FONTE = readFileSync(join(RAIZ, "paginas", "Orgaos.tsx"), "utf8");

function arquivos(pasta: string, extensao: RegExp): string[] {
  const achados: string[] = [];
  for (const nome of readdirSync(pasta)) {
    const caminho = join(pasta, nome);
    if (statSync(caminho).isDirectory()) achados.push(...arquivos(caminho, extensao));
    else if (extensao.test(nome)) achados.push(caminho);
  }
  return achados;
}

function nome(caminho: string): string {
  return relative(RAIZ, caminho).split(sep).join("/");
}

describe("O que o formulário manda para o servidor", () => {
  it("campo em branco vira ausência, e não string vazia", () => {
    /*
      Este é o defeito menos visível deste formulário. A rota trata `undefined`
      como "não informado" e o banco guarda `NULL`. Mandar `""` gravaria um
      email vazio que não é nulo, e a lista fechada de domínios (o que impede o
      painel de virar encaminhador de documento oficial para endereço qualquer)
      passaria a ter uma entrada que não casa com endereço nenhum.
    */
    const conferido = conferirOrgao({
      ...FORMULARIO_VAZIO, nome: "Secretaria de Obras",
    });
    expect(conferido.ok).toBe(true);
    if (!conferido.ok) return;
    expect(conferido.dados).toEqual({ nome: "Secretaria de Obras" });
    expect("email" in conferido.dados, "email vazio virou campo enviado").toBe(false);
  });

  it("o email vai em minúsculas", () => {
    // O endereço é comparado com o domínio do catálogo, e maiúscula transforma
    // o mesmo destino em dois para uma comparação de texto.
    const conferido = conferirOrgao({
      ...FORMULARIO_VAZIO, nome: "Corpo de Bombeiros", email: "Protocolo@Bombeiros.Exemplo.gov.br",
    });
    expect(conferido.ok && conferido.dados.email).toBe("protocolo@bombeiros.exemplo.gov.br");
  });

  it("nome curto e email inválido reprovam no campo certo", () => {
    const curto = conferirOrgao({ ...FORMULARIO_VAZIO, nome: "A" });
    expect(curto.ok).toBe(false);
    if (curto.ok) return;
    expect(Object.keys(curto.erros)).toContain("nome");

    const email = conferirOrgao({ ...FORMULARIO_VAZIO, nome: "Defesa Civil", email: "sem-arroba" });
    expect(email.ok).toBe(false);
    if (email.ok) return;
    expect(Object.keys(email.erros)).toContain("email");
  });
});

describe("O motivo da desativação", () => {
  it('"erro" não explica nada e é recusado', () => {
    /*
      A régua é a mesma do levantamento de interdição, e pelo mesmo motivo:
      "erro", "teste" e "nao" são o que aparece quando o campo aceita qualquer
      coisa, e nenhum deles responde à pergunta que alguém fará daqui a um ano,
      que é para onde foi a competência deste órgão.
    */
    for (const curto of ["erro", "teste", "nao", "   "]) {
      expect(conferirMotivo(curto).ok, `"${curto}" passou`).toBe(false);
    }
  });

  it("motivo de verdade passa, e chega sem espaço sobrando", () => {
    const conferido = conferirMotivo("  Competência transferida para a Secretaria de Obras  ");
    expect(conferido.ok).toBe(true);
    if (!conferido.ok) return;
    expect(conferido.motivo.startsWith("Competência")).toBe(true);
  });
});

describe("A tela não oferece caminho para apagar", () => {
  it("nenhuma função de exclusão de órgão sai da camada de dados", () => {
    /*
      Âncora dos dois lados: o que existe é desativar e reativar, e um nome de
      exclusão aparecendo em `repositorio` seria o primeiro passo para a tela
      ganhar o botão.
    */
    const nomes = Object.keys(repositorio);
    expect(nomes).toContain("desativarOrgao");
    expect(nomes).toContain("reativarOrgao");
    expect(
      nomes.filter((n) => /^(excluir|apagar|remover|deletar)/i.test(n) && /orgao/i.test(n)),
      "exclusão de órgão na camada de dados: o órgão aparece em ofício já "
      + "emitido e na trilha, e apagar a linha apaga a resposta para 'para "
      + "onde foi este ofício'",
    ).toEqual([]);
  });

  it("a tela de órgãos não escreve exclusão nenhuma", () => {
    const chamadas = [...FONTE.matchAll(/\b(excluir|apagar|deletar)[A-Za-z]*\s*\(/g)]
      .map((c) => c[0]);
    expect(chamadas, "a tela ganhou um caminho de exclusão").toEqual([]);
  });

  it("desativar passa por uma pergunta, e reativar não", () => {
    /*
      Só a DESATIVAÇÃO pergunta. Reativar devolve o órgão à lista de destinos e
      não tira nada de ninguém; exigir confirmação para o gesto inofensivo é o
      jeito conhecido de ensinar a clicar em "sim" sem ler, e é isso que estraga
      a pergunta que importa.
    */
    expect(FONTE).toContain("<ConfirmarAcao");
    expect([...FONTE.matchAll(/<ConfirmarAcao/g)]).toHaveLength(1);

    // A gravação mora na função que a janela chama, e não no botão da tabela.
    expect(FONTE).toContain("aoConfirmar={() => void confirmarDesativacao()}");
    expect(FONTE).toContain("await desativarOrgao(sessao, alvo.id, conferido.motivo)");
    expect(
      /onClick=\{\(\) => void reativar\(o\)\}/.test(FONTE)
      || /if \(!o\.ativo\) \{ void reativar\(o\); return; \}/.test(FONTE),
      "reativar deixou de ser um clique direto",
    ).toBe(true);
  });

  it("o botão da tabela só abre a pergunta: quem grava é a janela", () => {
    /*
      O portão de componente confere que a janela CHAMA quem grava, e isso
      continua verdade mesmo se o botão da tabela também gravar direto, com a
      janela ao lado, de enfeite. Aqui a regra é de caminho único:
      `confirmarDesativacao` é chamada em um lugar só, e esse lugar é o
      `aoConfirmar`.
    */
    const chamadas = [...FONTE.matchAll(/\bconfirmarDesativacao\(\)/g)]
      .filter((c) => !FONTE.slice(0, c.index).endsWith("async function "));
    expect(chamadas, "a desativação ganhou um segundo caminho, sem pergunta")
      .toHaveLength(1);
    const antes = FONTE.slice(Math.max(0, chamadas[0]!.index - 160), chamadas[0]!.index);
    expect(antes, "quem chama a gravação não é a janela").toContain("aoConfirmar");
  });

  it("o rótulo do botão da janela repete o nome do órgão", () => {
    // "OK" não diz o que vai acontecer, e quem está com o rádio na mão confirma
    // o que lembra de ter clicado. Ver `ConfirmarAcao`.
    expect(FONTE).toContain("rotuloDaAcao={`Desativar ${aDesativar?.nome ?? \"órgão\"}`}");
  });

  it("a lista mostra o que a desativação custa antes de perguntar", () => {
    /*
      Desativar um órgão com trinta encaminhamentos em aberto é diferente de
      desativar um que nunca foi usado, e a tela não tem como saber a diferença
      sozinha: o número vem junto da listagem, e é ele que torna a decisão
      informada.
    */
    expect(FONTE).toMatch(/aDesativar\.abertas > 0/);
    expect(FONTE).toMatch(/providencias/);
  });
});

describe("A tela está ligada ao resto do painel", () => {
  it("existe rota e título próprios", () => {
    /*
      Rota sem título deixa quem usa leitor de tela sem saber que a tela mudou.
      O portão de acessibilidade já cobre a regra geral; aqui a rota é citada
      por extenso para que o esquecimento simétrico (rota e título faltando
      juntos) também reprove.
    */
    const app = readFileSync(join(RAIZ, "App.tsx"), "utf8");
    expect(app).toContain('path="/orgaos"');
    expect(app, "a rota do catálogo ficou aberta a qualquer perfil")
      .toMatch(/<Route path="\/orgaos" element=\{<Exige acao="gerenciar_equipes">/);

    const troca = readFileSync(join(RAIZ, "componentes", "TrocaDeTela.tsx"), "utf8");
    expect(troca).toContain('"/orgaos"');
  });

  it("o menu leva até ela, e só para quem pode entrar", () => {
    const estrutura = readFileSync(join(RAIZ, "componentes", "Estrutura.tsx"), "utf8");
    const item = estrutura.slice(estrutura.indexOf('para: "/orgaos"'));
    expect(item.slice(0, 240)).toContain('exige: "gerenciar_equipes"');
  });

  it("o encaminhamento de providência deixou de ter lista de órgãos escrita na tela", () => {
    /*
      A lista de seis nomes dentro do detalhe da ocorrência era o defeito que o
      catálogo veio consertar, e ela era igual em todo município: uma prefeitura
      sem companhia de saneamento própria escolhia um destino que não existe
      ali.
    */
    const detalhe = readFileSync(join(RAIZ, "paginas", "Ocorrencia.tsx"), "utf8");
    expect(
      /const ORGAOS = \[/.test(detalhe),
      "a lista de órgãos voltou para dentro da tela",
    ).toBe(false);
    expect(detalhe).toContain("listarOrgaos(sessao)");
    expect(detalhe, "o destino escolhido não leva o identificador do catálogo")
      .toContain("orgaoId: escolhido.id");
  });

  it("nenhuma tela usa um catálogo de órgãos escrito à mão", () => {
    const suspeitos: string[] = [];
    for (const caminho of arquivos(RAIZ, /\.tsx$/)) {
      const fonte = readFileSync(caminho, "utf8");
      if (/const ORGAOS\b/.test(fonte)) suspeitos.push(nome(caminho));
    }
    expect(suspeitos, "catálogo de órgãos escrito dentro de uma tela").toEqual([]);
  });
});
