#!/usr/bin/env node
/**
 * MIGRAR A PRODUÇÃO, para quem nunca fez isso.
 *
 * Existe porque o caminho manual tem três armadilhas que não avisam, e as três
 * já morderam neste repositório:
 *
 * 1. **A credencial errada.** A `DATABASE_URL` do `.env` da API é do papel de
 *    APLICAÇÃO, que não pode criar tabela, de propósito. Migrar com ela dá
 *    "permission denied for schema public", que manda procurar no lugar errado.
 * 2. **A senha na URL.** Senha gerada pelo provedor pode ter `@`, `/` ou `#`,
 *    e qualquer um dos três parte a URL ao meio. O erro que sai fala de host
 *    inexistente, não de senha.
 * 3. **A senha no histórico.** Colada na linha de comando, ela fica em
 *    `~/.zsh_history`, em texto puro, para sempre.
 *
 * A senha vem de `producao.mjs` (variável de ambiente do ambiente, chaveiro do
 * sistema ou pergunta sem eco) e nunca passa pela tela nem pela linha de
 * comando. Este roteiro lê, monta a URL com a senha codificada, e chama o
 * migrador de sempre.
 *
 * ## Por ambiente (V2-F01-E15)
 *
 * `--ambiente hml|prod` é obrigatório, e o roteiro MOSTRA o banco (a URL sem a
 * senha) antes de agir. Funciona em Windows, Linux e macOS. A cópia que o
 * portão exige é a do MESMO ambiente: cópia de HML não libera PROD.
 *
 * ## O padrão é CONFERIR
 *
 * Sem argumento, ele só pergunta o que falta. Aplicar exige `--aplicar`
 * escrito à mão, porque migração é irreversível e o comando que aplica não
 * pode ser o que sai por engano de uma seta para cima.
 *
 * ## E aplicar exige CÓPIA RECENTE (15/09/2026)
 *
 * `--aplicar` recusa sem uma cópia feita por `scripts/copiar-producao.mjs`
 * nos últimos trinta minutos. O único restore testado deste projeto é o de
 * 09/09/2026, sobre uma cópia tirada à mão naquele dia; entre uma migração e
 * outra ninguém tirava cópia, e migração irreversível sem cópia é aposta. A
 * saída de escape é `--sem-copia`, escrito à mão, e ela fica registrada na
 * conclusão que este roteiro imprime: quem pulou, pulou por decisão, e a
 * decisão aparece no terminal e no que for colado no relatório.
 *
 * O que a cópia NÃO garante: que a migração seja reversível. O que ela
 * garante é o ponto de volta. Migração só entra em produção se for aditiva ou
 * compatível com a versão da API que está no ar (`docs/IMPLANTACAO.md`).
 */
import { spawnSync } from "node:child_process";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

import {
  comandoDoNpm, lerAmbiente, linhasDoAlvo, montarUrl, obterSenha, perfilDoAmbiente, sairComMensagem,
} from "./producao.mjs";
import { JANELA_DA_COPIA_MS, copiaRecente, pastaDeCopias } from "./copiar-producao.mjs";

export { COFRE, CONTA, HOST, PORTA, PROJETO, montarUrl } from "./producao.mjs";

/**
 * O que fazer com a cópia antes de aplicar. Função pura, para o teste medir
 * as três saídas sem chaveiro, sem banco e sem `~/dc360-copias` de verdade.
 *
 *   - `conferir`: não é `--aplicar`, então cópia não entra na conversa;
 *   - `com_copia`: há cópia dentro da janela, e ela é nomeada;
 *   - `pulada`: `--sem-copia` escrito à mão, registrado na conclusão;
 *   - `recusado`: `--aplicar` sem cópia recente e sem `--sem-copia`.
 *
 * `ambiente` escolhe a pasta de cópias: só vale a cópia do ambiente que vai
 * ser migrado (`pasta` existe para o teste apontar para uma pasta temporária).
 */
export function decidirSobreACopia({
  argv,
  ambiente,
  pasta,
  agora = new Date(),
  janelaMs = JANELA_DA_COPIA_MS,
  procurar = copiaRecente,
}) {
  if (!argv.includes("--aplicar")) return { situacao: "conferir" };
  const pastaDaCopia = pasta ?? pastaDeCopias(ambiente);
  const copia = procurar({ pasta: pastaDaCopia, agora, janelaMs });
  if (copia) return { situacao: "com_copia", copia };
  if (argv.includes("--sem-copia")) return { situacao: "pulada" };
  return { situacao: "recusado", pasta: pastaDaCopia, janelaMinutos: Math.round(janelaMs / 60_000) };
}

/** A linha da conclusão que diz o que foi feito com a cópia. */
export function fraseDaCopia(decisao) {
  switch (decisao.situacao) {
    case "com_copia":
      return `Cópia usada como ponto de volta: ${decisao.copia.caminho} `
        + `(${Math.round(decisao.copia.idadeMs / 60_000)} min antes de aplicar).`;
    case "pulada":
      return "CÓPIA PULADA por --sem-copia: esta migração foi aplicada sem ponto de volta, por decisão de quem rodou.";
    default:
      return "";
  }
}

export function mensagemDeRecusaSemCopia(decisao, ambiente = "prod") {
  return (
    `Nenhuma cópia do banco de ${ambiente.toUpperCase()} nos últimos ${decisao.janelaMinutos} minutos em ${decisao.pasta}.\n\n`
    + "Migração é irreversível, e o único restore testado é sobre cópia tirada antes.\n"
    + "Tire a cópia e aplique em seguida:\n\n"
    + `  node scripts/copiar-producao.mjs --ambiente ${ambiente}\n`
    + `  node scripts/migrar-producao.mjs --ambiente ${ambiente} --aplicar\n\n`
    + "Para aplicar SEM cópia, escreva --sem-copia junto de --aplicar. Isso fica\n"
    + "registrado na conclusão, e é decisão sua."
  );
}

/*
  Só executa quando é CHAMADO, e não quando é importado.

  O teste importa este arquivo para provar `montarUrl` e a decisão sobre a
  cópia, que são as partes que erram em silêncio. Sem esta guarda, importar
  dispararia a leitura do chaveiro e o teste morreria pedindo uma senha de
  produção para medir uma função pura.
*/
const chamadoDiretamente = process.argv[1]?.endsWith("migrar-producao.mjs") ?? false;

async function principal(argv) {
  const { ambiente } = lerAmbiente(argv);
  const perfil = perfilDoAmbiente(ambiente);
  const aplicar = argv.includes("--aplicar");

  /* O banco, sem a senha, antes de qualquer coisa: é a última chance de ver que o ambiente é o errado. */
  console.log(`${linhasDoAlvo(perfil)}\n`);

  /*
    A cópia é decidida ANTES de ler a senha e antes de qualquer conexão:
    quem vai ser recusado não precisa nem da senha.
  */
  const decisao = decidirSobreACopia({ argv, ambiente });
  if (decisao.situacao === "recusado") {
    console.error(mensagemDeRecusaSemCopia(decisao, ambiente));
    process.exit(2);
  }

  const url = montarUrl(await obterSenha({ perfil }), perfil);
  const raiz = dirname(dirname(fileURLToPath(import.meta.url)));

  console.log(
    aplicar
      ? `APLICANDO as migrações que faltam no banco de ${ambiente.toUpperCase()}.\n${fraseDaCopia(decisao)}\n`
      : "Só conferindo: nada vai ser escrito. Para aplicar, repita com --aplicar.\n",
  );

  /*
    `--silent` porque o npm, quando o comando de dentro sai com código
    diferente de zero, despeja oito linhas de "npm error" com caminho de
    workspace e nome de pacote. Aqui isso é ruído puro: faltar migração é
    resposta esperada do modo de conferência, não falha, e quem está migrando
    pela primeira vez lê "npm error" e acha que quebrou.
  */
  const npm = comandoDoNpm();
  const r = spawnSync(
    npm.comando,
    [...npm.prefixo, "run", "--silent", "migrar", "--", ...(aplicar ? [] : ["--conferir"])],
    { cwd: raiz, stdio: "inherit", shell: npm.shell, env: { ...process.env, DATABASE_URL: url } },
  );

  /*
    A conclusão em uma frase, porque a saída do migrador é uma lista longa de
    nomes de arquivo e a pergunta de quem rodou é outra: "e agora?".

    O código de saída é preservado: 1 quando falta migração é o que faz o
    contêiner recusar subir com esquema atrasado, e não é deste roteiro o
    direito de apagar esse sinal.
  */
  const faltou = (r.status ?? 1) !== 0;
  console.log(
    aplicar
      ? (faltou
        ? "\nNão deu. Nada pela metade: cada migração roda dentro da própria transação."
        : "\nPronto. Agora reimplante a API antes de empurrar para o GitHub: a Vercel "
          + "publica o painel sozinho a cada push.")
      : (faltou
        ? "\nIsso é o esperado quando falta migração, e não é erro. Para aplicar,\n"
          + "tire a cópia e aplique em seguida:\n"
          + `  node scripts/copiar-producao.mjs --ambiente ${ambiente}\n`
          + `  node scripts/migrar-producao.mjs --ambiente ${ambiente} --aplicar`
        : "\nO banco já está em dia. Nada a fazer."),
  );
  /* A cópia, repetida no fim: é a linha que vai para o relatório de quem migrou. */
  if (aplicar) console.log(fraseDaCopia(decisao));
  process.exit(r.status ?? 1);
}

if (chamadoDiretamente) {
  try {
    await principal(process.argv.slice(2));
  } catch (erro) {
    sairComMensagem(erro);
  }
}
