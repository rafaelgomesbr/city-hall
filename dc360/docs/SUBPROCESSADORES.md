# Subprocessadores e cláusula de operador

- **Versão:** 1, de 09/09/2026
- **Companheiro de:** `PRIVACIDADE.md`

Um contrato de operador que diz "podemos usar subcontratados" sem nomear
ninguém é uma cláusula vazia: o município não tem como avaliar risco que ele não
consegue enxergar. Este documento nomeia cada empresa que toca dado do
município, o que ela toca, e onde.

> Os campos `[[assim]]` dependem de decisão do Rafa e não podem ser inventados.

---

## 1. Lista nominal

Estado em 09/09/2026, com o produto no piloto de Florianópolis.

| Empresa | O que faz | Que dado alcança | Onde ficam os servidores |
| --- | --- | --- | --- |
| **Supabase** | Banco de dados PostgreSQL | **Todos** os dados do sistema | São Paulo, Brasil (`sa-east-1`) |
| **Supabase Storage** | Armazenamento das fotografias e assinaturas | Fotografia de imóvel, traço de assinatura | São Paulo, Brasil |
| **Fly.io** | Servidor da API | Todos, em trânsito e em memória durante o processamento | São Paulo, Brasil (`gru`) |
| **Vercel** | Entrega do painel do coordenador | **Nenhum.** Serve arquivo estático; o dado vai do navegador direto à API | Rede de distribuição global |
| **Apple (APNs)** | Notificação no iPhone | Identificador do aparelho e o texto da notificação | Estados Unidos |
| **Google (Firebase Cloud Messaging)** | Notificação no Android | Identificador do aparelho e o texto da notificação | Estados Unidos |
| **Google (Maps)** | Mapa no painel | Coordenada das ocorrências desenhadas, enviada ao carregar o mapa | Estados Unidos |

### Ainda não contratados, e que entram nesta lista quando entrarem

| Empresa | Para quê | Quando |
| --- | --- | --- |
| `[[provedor de email]]` | Recuperação de senha e ofício com endereço de uso único | Turno T9 |

---

## 2. As três que exigem conversa com o município antes de ligar

### 2.1 Notificação: Apple e Google

O conteúdo da notificação **sai do país** e passa por servidor de terceiro. Por
isso a mensagem que aparece na tela bloqueada é **genérica**: ela diz que há
tarefa nova ou prazo vencendo, e não diz endereço, nome, protocolo nem
severidade. O detalhe viaja no corpo cifrado da mensagem e só é lido pelo
aplicativo depois que o agente destrava o aparelho.

Isso não é preciosismo. Uma notificação que diz "Interdição em Servidão Boa
Esperança, 148" fica legível na tela bloqueada, na mão de quem estiver por
perto, e passa por um servidor estrangeiro no caminho.

### 2.2 Mapa: Google

Ao desenhar o mapa, a coordenada das ocorrências ativas é enviada ao Google.
Coordenada de imóvel vistoriado por Defesa Civil é dado sobre pessoa
identificável quando cruzada com o resto.

Duas consequências assumidas:

1. O município precisa ser informado disso **antes** de o mapa ser ligado, e a
   informação está aqui para que ele possa decidir.
2. Existe **modo sem chave**, que desenha as ocorrências sobre um plano
   esquemático, sem contato com o Google. Município que não aceitar o envio da
   coordenada trabalha nesse modo, e o resto do produto não muda.

### 2.3 Transferência internacional

Apple, Google e Vercel operam fora do Brasil. A LGPD admite transferência
internacional, e as três hipóteses que se aplicam aqui são: execução de contrato
do qual o titular é parte por meio do município, cumprimento de obrigação legal
do município, e o consentimento não é a base usada.

O dado que efetivamente atravessa a fronteira está limitado, por decisão de
projeto, ao mínimo listado na tabela da seção 1: identificador de aparelho, texto
genérico de notificação e coordenada de mapa. **Nome, contato, relato,
fotografia, assinatura e descrição de vulnerabilidade não saem do Brasil.**

---

## 3. Cláusula de operador, para o contrato

> Texto para o instrumento contratual. Revisão jurídica pendente:
> `[[revisão por advogado]]`.

**1. Objeto e limite.** O OPERADOR trata dados pessoais exclusivamente para
prestar o serviço contratado, seguindo instrução documentada do CONTROLANTE.
Não usa os dados para finalidade própria, não os comercializa, não os cede, não
os cruza com dados de outro contratante e não os utiliza para desenvolver ou
treinar produto, modelo estatístico ou sistema de inteligência artificial.

**2. Confidencialidade.** O OPERADOR mantém sigilo, impõe a mesma obrigação a
quem tenha acesso, e o dever subsiste ao fim do contrato.

**3. Segurança.** O OPERADOR adota as medidas técnicas e administrativas
descritas na seção 6 da política de privacidade vigente, e comunica o
CONTROLANTE de alteração que reduza o nível de proteção.

**4. Subprocessadores.** O OPERADOR pode contratar subprocessadores, e mantém
lista nominal atualizada e pública, com o que cada um processa e onde.
Subprocessador novo é comunicado ao CONTROLANTE com **30 dias** de antecedência,
prazo no qual ele pode se opor motivadamente. Havendo oposição não sanada, o
CONTROLANTE pode rescindir sem multa.

**5. Isolamento.** O OPERADOR garante que nenhuma credencial de aplicação
alcança dado de mais de um município, e que essa garantia é verificada por teste
automatizado que bloqueia a entrega quando falha.

**6. Incidente.** O OPERADOR comunica o CONTROLANTE em até **24 horas** da
detecção de incidente de segurança com risco relevante, informando o que se sabe
até ali, e presta apoio na comunicação à autoridade nacional e aos titulares.

**7. Direitos do titular.** O OPERADOR apoia o CONTROLANTE no atendimento a
pedido de titular, dentro dos prazos legais, e não responde diretamente ao
titular salvo instrução do CONTROLANTE.

**8. Auditoria.** O CONTROLANTE pode auditar o cumprimento desta cláusula,
mediante aviso prévio de `[[prazo]]` dias, diretamente ou por terceiro sob
sigilo.

**9. Término e devolução.** Encerrado o contrato, o OPERADOR entrega ao
CONTROLANTE, em formato aberto e legível por máquina, a íntegra dos dados do
município, incluindo fotografias e documentos gerados, e elimina as cópias em
até `[[prazo]]` dias, salvo retenção exigida por lei, que é informada por
escrito. O procedimento está descrito em `SAIDA-DE-MUNICIPIO.md`.

**10. Responsabilidade.** O OPERADOR responde pelo dano causado por
descumprimento desta cláusula ou por inobservância de instrução lícita do
CONTROLANTE.

---

## 4. Manutenção deste documento

Este arquivo **desatualizado é pior que inexistente**: ele é o que o município
usa para avaliar risco, e uma lista que omite um subprocessador vira declaração
falsa.

Regra: **nenhuma dependência que toque dado do município entra em produção sem
uma linha aqui, no mesmo commit.** Se a variável de ambiente nova aponta para um
serviço de terceiro, esta tabela cresce junto.
