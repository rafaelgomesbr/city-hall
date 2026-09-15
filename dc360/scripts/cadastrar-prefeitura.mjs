#!/usr/bin/env node
/**
 * CADASTRAR UMA PREFEITURA, para quem nunca mexeu em banco.
 *
 * Irmão de `migrar-producao.mjs`, e existe pela mesma razão: a senha do banco
 * fica no chaveiro do macOS, a URL é montada com a senha codificada, e o papel
 * usado é o de setup e não o da aplicação. Sem isso, cadastrar prefeitura
 * exigiria montar uma string de conexão à mão, que é onde moram as três
 * armadilhas descritas naquele arquivo.
 *
 * ## Existe uma tela, e este comando continua existindo
 *
 * Desde 14/09/2026 o console do fornecedor cadastra prefeitura por tela (a
 * emenda daquela data na ADR 0008, e a migração 036). Quem tem conta de
 * operador no console, com segundo fator, deveria usar a tela: ela não carrega
 * a credencial de dono do banco, e o ato inteiro acontece dentro de uma função
 * do banco que devolve só os dois identificadores.
 *
 * Este comando continua aqui por dois motivos concretos. Primeiro, ele é o
 * caminho que funciona quando o console ainda não está de pé, que é justamente
 * o dia em que a primeira prefeitura é cadastrada. Segundo, ele é o caminho de
 * emergência quando a função do banco recusa gravar a linha de nascimento na
 * trilha: ele assume `dc360_app` para gravá-la, e a função não pode (o Postgres
 * proíbe `SET ROLE` dentro de `SECURITY DEFINER`).
 *
 * O que NÃO mudou: provisionar continua sendo ato de operador da plataforma, e
 * por este caminho ele é feito com a credencial de dono do banco, a mesma que
 * aplica migração.
 */
import { spawnSync } from "node:child_process";
import { execFileSync } from "node:child_process";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

import { COFRE, CONTA, montarUrl } from "./migrar-producao.mjs";

/**
 * O que o comando exige, com o nome que a pessoa lê na tela.
 *
 * `orgao` fica de fora de propósito: quando não vem, o provisionador monta
 * "Coordenadoria Municipal de Proteção e Defesa Civil de <município>", que é o
 * nome real na maioria absoluta dos municípios brasileiros.
 */
export const OBRIGATORIOS = {
  municipio: 'nome da cidade, por extenso, ex.: --municipio "Serra Alta"',
  uf: "sigla do estado, duas letras, ex.: --uf MG",
  nome: 'nome de quem vai ser o primeiro administrador, ex.: --nome "Rita Lopes"',
  matricula: "matrícula funcional dessa pessoa, ex.: --matricula SA-1",
  email: "email dela, ex.: --email rita@serraalta.mg.gov.br",
  operador: 'SEU nome, de quem está cadastrando, ex.: --operador "Rafael Gomes"',
};

/**
 * O que falta na linha de comando.
 *
 * Função pura e exportada porque é a parte que dá para provar sem banco, e
 * porque a mensagem que ela alimenta é a única coisa que separa "o comando
 * explicou" de "o comando deu erro de banco no meio do cadastro".
 */
export function oQueFalta(argv) {
  return Object.keys(OBRIGATORIOS).filter((chave) => {
    const i = argv.indexOf(`--${chave}`);
    return i < 0 || !argv[i + 1] || argv[i + 1].startsWith("--");
  });
}

const chamadoDiretamente = process.argv[1]?.endsWith("cadastrar-prefeitura.mjs") ?? false;

if (chamadoDiretamente) {
  const argv = process.argv.slice(2);
  const faltando = oQueFalta(argv);

  if (faltando.length > 0) {
    console.error("\nFalta informação para cadastrar a prefeitura:\n");
    for (const chave of faltando) console.error(`  --${chave}\n      ${OBRIGATORIOS[chave]}`);
    console.error(
      "\nExemplo completo:\n\n"
      + "  node scripts/cadastrar-prefeitura.mjs \\\n"
      + '    --municipio "Serra Alta" --uf MG \\\n'
      + '    --nome "Rita Lopes" --matricula SA-1 \\\n'
      + "    --email rita@serraalta.mg.gov.br \\\n"
      + '    --operador "Rafael Gomes"\n\n'
      + "O órgão sai como Coordenadoria Municipal de Proteção e Defesa Civil de\n"
      + '<município>, e dá para trocar com --orgao "outro nome".\n\n'
      + "--operador é o SEU nome, e é obrigatório porque o município nasce com\n"
      + "uma linha na trilha dele dizendo quem o criou. É a única resposta que\n"
      + 'ele tem para "quem criou isto".\n',
    );
    process.exit(1);
  }

  let senha;
  try {
    senha = execFileSync(
      "security", ["find-generic-password", "-a", CONTA, "-s", COFRE, "-w"],
      { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
    ).replace(/\n$/, "");
  } catch {
    console.error(
      `\nNão achei a senha do banco no chaveiro do Mac. Guarde com:\n\n`
      + `  security add-generic-password -a ${CONTA} -s ${COFRE} -w\n`,
    );
    process.exit(1);
  }

  const raiz = dirname(dirname(fileURLToPath(import.meta.url)));
  const r = spawnSync(
    "npm",
    ["run", "--silent", "provisionar", "--", ...argv],
    { cwd: raiz, stdio: "inherit", env: { ...process.env, DATABASE_URL: montarUrl(senha) } },
  );

  if ((r.status ?? 1) !== 0) {
    console.error(
      "\nO cadastro não foi feito. Nada pela metade: o município e o primeiro\n"
      + "administrador nascem na mesma transação.",
    );
  }
  process.exit(r.status ?? 1);
}
