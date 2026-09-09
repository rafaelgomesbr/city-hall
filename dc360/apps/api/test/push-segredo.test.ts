import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { lerSegredoDoDisco } from "../src/push/segredo.js";

/*
  A chave de push da Apple nao entra na imagem, e nao pode entrar.

  `apps/campo/segredos/` e ignorado pelo git E pelo Docker, de proposito: o
  `.p8` assina notificacao para QUALQUER aplicativo do time, e quem o obtem
  escreve na tela bloqueada de um agente de Defesa Civil. Uma ordem falsa de
  evacuacao escrita ali tira gente de casa de madrugada.

  A consequencia disso, descoberta ao revisar o turno: com a leitura aceitando
  SO caminho de arquivo, ligar PUSH_ATIVO=sim em producao derrubaria a partida
  com ENOENT, e o unico contorno seria embarcar a chave na imagem, que e
  exatamente o que nao pode acontecer. Por isso a variavel tambem aceita o
  CONTEUDO, que e como ela chega pelo `fly secrets set`.

  O teste que mais importa aqui e o ultimo: mensagem de erro que carrega o
  segredo transforma erro de configuracao em vazamento, e agora que o valor
  pode SER o segredo, isso deixou de ser hipotetico.
*/

const PEM = "-----BEGIN PRIVATE KEY-----\nMIGHAgEA\n-----END PRIVATE KEY-----\n";
const CONTA = '{"project_id":"dc","client_email":"a@b.c","private_key":"-----BEGIN PRIVATE KEY-----\\nx\\n-----END PRIVATE KEY-----\\n"}';

describe("de onde vem a credencial de push", () => {
  it("caminho de arquivo continua funcionando, que e o modo de quem desenvolve", () => {
    const pasta = mkdtempSync(join(tmpdir(), "dc360-segredo-"));
    const arquivo = join(pasta, "AuthKey_TESTE.p8");
    writeFileSync(arquivo, PEM);
    expect(lerSegredoDoDisco(arquivo, "a chave de teste")).toBe(PEM);
  });

  it("conteudo PEM na propria variavel e aceito, que e o modo de producao", () => {
    // `fly secrets set APNS_CHAVE="$(cat AuthKey_XXXX.p8)"`: o segredo vive na
    // area de segredos do provedor e nunca toca imagem, repositorio nem disco.
    expect(lerSegredoDoDisco(PEM, "a chave de teste")).toBe(PEM.trim());
  });

  it("conta de servico em JSON na propria variavel tambem e aceita", () => {
    expect(lerSegredoDoDisco(CONTA, "a conta de teste")).toBe(CONTA);
  });

  it("espaco em volta nao faz o conteudo virar caminho", () => {
    // `fly secrets set` com `$(cat ...)` costuma trazer quebra de linha no fim.
    expect(lerSegredoDoDisco("\n  " + PEM + "  \n", "a chave de teste")).toBe(PEM.trim());
  });

  it("caminho inexistente falha dizendo o caminho e o codigo do sistema", () => {
    expect(() => lerSegredoDoDisco("/nao/existe/AuthKey.p8", "a chave de teste"))
      .toThrow(/\/nao\/existe\/AuthKey\.p8.*ENOENT/s);
  });

  it("a mensagem de erro NUNCA carrega o segredo", () => {
    /*
      Agora que o valor pode SER a chave privada, um erro que ecoe o valor
      despejaria a chave no log do servidor. Um `.p8` que por acidente nao
      comece com o cabecalho de PEM cai no caminho de arquivo, e ai o valor
      inteiro iria para a mensagem.
    */
    // Sem quebra de linha e com mais de 200 caracteres: cai no caminho de
    // arquivo, falha, e antes da correcao ia inteira para a mensagem.
    const quaseChave = "MIGHAgEAMBMGByqGSM49AgEGCCqGSM49AwEHBG0wawIBAQQg".repeat(6);
    try {
      lerSegredoDoDisco(quaseChave, "a chave de teste");
      throw new Error("deveria ter falhado");
    } catch (erro) {
      expect(String((erro as Error).message)).not.toContain(quaseChave);
    }
  });
});
