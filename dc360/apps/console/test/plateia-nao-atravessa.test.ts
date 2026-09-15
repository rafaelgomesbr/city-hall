import { randomUUID } from "node:crypto";
import { SignJWT } from "jose";
import { describe, expect, it } from "vitest";
import { emitirDesafio, emitirSessao, verificarDesafio, verificarSessao } from "../src/tokens.js";
import {
  emitirAcesso, emitirDesafio as emitirDesafioDoProduto, verificarAcesso,
  verificarDesafio as verificarDesafioDoProduto,
} from "../../api/src/auth/tokens.js";

/**
 * A prova de que o console é aplicação separada, e não o produto com outra
 * tela.
 *
 * A ADR 0008 pede, na decisão 1, "outro processo, com outro domínio, outro
 * segredo de token e outra conexão". Segredo diferente é fácil de escrever e
 * fácil de perder: basta um painel de implantação com variáveis compartilhadas
 * entre dois projetos, ou alguém copiando um `.env` para acelerar um teste, e os
 * dois lados passam a assinar com a mesma chave sem ninguém perceber.
 *
 * POR ISSO ESTE ARQUIVO USA O MESMO SEGREDO DOS DOIS LADOS, DE PROPÓSITO.
 *
 * Um teste que emitisse com chaves diferentes provaria apenas que chaves
 * diferentes são diferentes, que é verdade sobre criptografia e não sobre este
 * produto. Com a MESMA chave, o que sobra separando os dois mundos é a única
 * coisa que a separação de verdade pode depender: a plateia do token. E a
 * plateia é verificada por `jwtVerify` nos dois lados, com o valor fixado no
 * servidor, não lido do token.
 *
 * A consequência prática, e é ela que faz isto valer o arquivo: uma rota nova
 * do produto nasce recusando token de console, e uma rota nova do console nasce
 * recusando token de município, sem que nenhuma das duas precise saber que a
 * outra existe.
 */

const MESMO_SEGREDO = new TextEncoder().encode(
  "o-mesmo-segredo-nos-dois-lados-de-proposito-com-mais-de-32-bytes",
);

/**
 * O operador do console e identificado pelo ID da linha dele, e o token leva
 * junto a versao da senha (`sv`). Um uuid aqui, e nao um email: desde a
 * migracao 038 o `sub` do console tem a mesma forma do `sub` do produto, e e
 * exatamente por isso que o ultimo caso deste arquivo importa tanto: a forma
 * do conteudo ja nao separa nada, so a plateia separa.
 */
const OPERADOR = { id: randomUUID(), sv: "versao-da-senha" };

function identidadeDoProduto() {
  return {
    sub: randomUUID(),
    org: randomUUID(),
    papel: "administrador" as const,
    nome: "Rita Lopes",
    sid: randomUUID(),
  };
}

describe("Token do console e token do produto nao atravessam", () => {
  it("o token de sessao do console nao vale em rota nenhuma do produto", async () => {
    const doConsole = await emitirSessao(MESMO_SEGREDO, OPERADOR);

    expect(
      await verificarAcesso([MESMO_SEGREDO], doConsole),
      "o produto ACEITOU um token emitido pelo console. Um vazamento do console " +
      "passaria a valer sessao dentro de um municipio, que e exatamente o que a " +
      "decisao 1 da ADR 0008 existe para impedir",
    ).toBeNull();

    expect(
      await verificarDesafioDoProduto([MESMO_SEGREDO], doConsole),
      "o token do console foi aceito como desafio de segundo fator do produto",
    ).toBeNull();
  });

  it("o token de acesso do produto nao vale em rota nenhuma do console", async () => {
    const doProduto = await emitirAcesso(MESMO_SEGREDO, identidadeDoProduto(), 15);

    expect(
      await verificarSessao(MESMO_SEGREDO, doProduto),
      "o console ACEITOU um token do produto. Um administrador de municipio " +
      "passaria a ler a metrica de todas as prefeituras com o token que ele ja tem",
    ).toBeNull();

    expect(
      await verificarDesafio(MESMO_SEGREDO, doProduto),
      "o token do produto foi aceito como desafio do console",
    ).toBeNull();
  });

  it("o desafio de um lado nao vale como desafio do outro", async () => {
    /*
      O estado intermediário do login é o pedaço mais fácil de confundir, porque
      os dois lados o chamam de desafio e os dois duram cinco minutos. Se as
      plateias coincidissem, quem tivesse a senha de um administrador de
      município poderia levar o desafio dele para a segunda etapa do console.
    */
    const doConsole = await emitirDesafio(MESMO_SEGREDO, OPERADOR.id);
    const doProduto = await emitirDesafioDoProduto(MESMO_SEGREDO, {
      ...identidadeDoProduto(), pp: "segundo_fator" as const,
    });

    expect(await verificarDesafioDoProduto([MESMO_SEGREDO], doConsole)).toBeNull();
    expect(await verificarDesafio(MESMO_SEGREDO, doProduto)).toBeNull();
  });

  it("o desafio do console nao vira sessao do console so por ser um token valido", async () => {
    /*
      A separação que sustenta o segundo fator obrigatório. O desafio atesta que
      a senha conferiu, e mais nada: se ele valesse como sessão, o segundo fator
      seria uma tela a mais e nenhuma proteção a mais, porque quem tem o token
      não precisa da tela para nada.
    */
    const desafio = await emitirDesafio(MESMO_SEGREDO, OPERADOR.id);
    expect(
      await verificarSessao(MESMO_SEGREDO, desafio),
      "o desafio do console foi aceito como sessao: a senha sozinha abriria o console",
    ).toBeNull();
  });

  it("a plateia SOZINHA decide, com o conteudo e o segredo identicos dos dois lados", async () => {
    /*
      O CASO QUE ISOLA A VARIAVEL, e ele existe porque a primeira versao deste
      arquivo nao isolava.

      Trocar a plateia do console para `dc360` e rodar os casos acima deixava
      tudo VERDE, e o motivo nao era a plateia: era o formato do conteudo. O
      token do console tem `sub` com um email, e `verificarAcesso` exige `sub`
      em uuid, entao o Zod recusava antes de a plateia importar. A separacao
      estava de pe por duas razoes, e o teste creditava a errada. No dia em que
      alguem mudasse o conteudo do token do console (para carregar um
      identificador, por exemplo), a defesa que sobrava seria a plateia, e
      ninguem teria teste sobre ela.

      Aqui o conteudo e o MESMO nos dois tokens, e o segredo tambem. A UNICA
      diferenca e a plateia, entao o resultado so pode ser atribuido a ela.
    */
    const conteudo = identidadeDoProduto();

    async function assinar(plateia: string): Promise<string> {
      return new SignJWT({
        org: conteudo.org, papel: conteudo.papel, nome: conteudo.nome, sid: conteudo.sid,
      })
        .setProtectedHeader({ alg: "HS256", typ: "JWT" })
        .setSubject(conteudo.sub)
        // O emissor tambem e o mesmo dos dois lados neste caso, para nao sobrar
        // uma segunda diferenca a que atribuir o resultado.
        .setIssuer("dc360-api")
        .setAudience(plateia)
        .setIssuedAt()
        .setExpirationTime("15m")
        .sign(MESMO_SEGREDO);
    }

    const comPlateiaDoProduto = await assinar("dc360");
    expect(
      (await verificarAcesso([MESMO_SEGREDO], comPlateiaDoProduto))?.org,
      "o produto recusou o proprio token: este caso perdeu o poder de comparar",
    ).toBe(conteudo.org);

    const comPlateiaDoConsole = await assinar("dc360-console");
    expect(
      await verificarAcesso([MESMO_SEGREDO], comPlateiaDoConsole),
      "o MESMO conteudo, com o MESMO segredo, so trocando a plateia para a do " +
      "console, continuou valendo no produto: a plateia nao esta separando nada, " +
      "e a separacao das duas aplicacoes depende de outra coisa que ninguem testa",
    ).toBeNull();
  });

  it("a ancora: com a plateia certa, os dois lados ACEITAM", async () => {
    /*
      Sem isto, quatro verificações que sempre devolvem `null` (por um erro de
      emissor, por um segredo trocado, por um `catch` largo demais) fariam este
      arquivo inteiro passar verde sem verificar nada. Este projeto já teve
      testes assim.
    */
    const sessao = await emitirSessao(MESMO_SEGREDO, OPERADOR);
    expect((await verificarSessao(MESMO_SEGREDO, sessao))?.id).toBe(OPERADOR.id);
    expect((await verificarSessao(MESMO_SEGREDO, sessao))?.sv).toBe(OPERADOR.sv);

    const identidade = identidadeDoProduto();
    const acesso = await emitirAcesso(MESMO_SEGREDO, identidade, 15);
    expect((await verificarAcesso([MESMO_SEGREDO], acesso))?.org).toBe(identidade.org);
  });
});
