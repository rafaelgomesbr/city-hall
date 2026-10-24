# Changelog

Registro do que mudou em cada versão do produto real (`dc360/`). Português do Brasil,
mais recente primeiro dentro de cada linha. Como a numeração, as tags e o conferidor
funcionam está em "Versões, tags e changelog" no `README.md`.

O produto tem DUAS linhas de versão, cada uma com a sua tag:

- **plataforma**: API, painel, console do fornecedor, banco e pacotes compartilhados.
  Um número só, o de `package.json`, igual em todo workspace. Tag `vX.Y.Z`.
- **campo**: o aplicativo do agente de campo. O número é o `VERSAO` de
  `apps/campo/app.config.ts`. Tag `campo-vX.Y.Z`.

Enquanto a G28 não passa, a major é 0 (`0.y.z`): migration ou contrato incompatível
sobe o `y`, correção sobe o `z`. A 1.0.0 é decisão do Rafael, não um bump.

Cada seção abaixo tem o título `## linha X.Y.Z - AAAA-MM-DD`, e `node scripts/versao.mjs conferir`
reprova versão sem a sua seção. Este arquivo é escrito à mão: o script confere, não redige.

## Não lançado

- **Contrato de ambiente (V2-F01-E09).** A API e o console passam a exigir `AMBIENTE_DC360` (`dev`, `hml` ou
  `prod`) em produção, e em HML e PROD recusam subir quando a URL do banco não traz a identidade do ambiente, ou
  quando `URL_PAINEL` e `ORIGENS_PERMITIDAS` não ficam sob `DOMINIO_DO_AMBIENTE`. `ORIGENS_PERMITIDAS` em produção
  só aceita `https://host` exato. Contrato incompatível: os `[env]` de `fly.toml` e `fly.console.toml` ganharam as
  variáveis novas no mesmo commit, e quem faz deploy precisa conferir os segredos antes (`docs/AMBIENTES.md`). Node 22
  fixado (`.node-version`, `engines`) e Postgres 17 no `compose.yaml`.

## plataforma 0.1.0 - 2026-10-24

Primeira versão numerada. Não é um lançamento novo: é a marca de partida do que já existia
quando o versionamento começou, e por isso não lista mudança por mudança. A tag `v0.1.0` é
posta pelo dono, depois da V2-F01-E01 (proteção da `master` e do CI), no commit que tiver este
número, e nunca de forma retroativa sobre um commit antigo.

O que a versão contém, como estava descrito no `README.md` na data do corte:

- Painel do coordenador (`apps/web`) em dois modos: banco na própria aba, ou HTTP contra a API.
- API HTTP (`apps/api`) com autenticação, isolamento entre municípios pelo token, sincronização
  idempotente, evidência fotográfica e documentos oficiais.
- Banco (`db`) com migrações PostgreSQL, RLS ativada e forçada e o teste de isolamento CA-06.
- Console do fornecedor (`apps/console`), processo separado, sem leitura de dado de cidadão.
- Pacotes `@dc360/shared` (vocabulário, máquina de estados e esquemas Zod) e `@dc360/campo`
  (motor de sincronização offline).

Limites conhecidos desta versão: nenhuma implantação está ligada a ela ainda (a versão em
`/saude` e o Release do GitHub com SBOM vêm em etapas seguintes da F01), e a promoção entre
ambientes por tag ainda não existe.

## campo 0.1.0 - 2026-10-24

Primeira versão numerada do aplicativo do agente (React Native com Expo): coleta offline,
câmera, GPS, assinatura, fila de envio e a configuração das duas lojas. É a marca de partida,
como a da plataforma: não há tag `campo-v0.1.0` ainda, e o contador de build (`BUILD`) continua
sendo do EAS, independente desta versão.

Limite conhecido: não há artefato de aparelho físico arquivado no repositório (a prova de
aparelho está planejada para a V2-F14-E12).
