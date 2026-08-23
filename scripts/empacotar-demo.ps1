<#
    Monta o pacote unico de distribuicao da demonstracao.

    O destinatario e um servidor publico com um notebook de prefeitura, sem
    permissao de administrador e possivelmente sem internet. O pacote precisa
    abrir com dois cliques e nada mais. Por isso o index.html fica na RAIZ do
    zip, com os vizinhos que ele referencia, e nao dentro de "mockup".

    Isto nao e etapa de compilacao do prototipo: nada aqui transforma o
    codigo. E copia e compactacao. O prototipo continua abrindo direto do
    repositorio, sem passar por este script.

    Rodar:
        powershell -ExecutionPolicy Bypass -File scripts\empacotar-demo.ps1
#>

$ErrorActionPreference = "Stop"

$raiz = Split-Path -Parent $PSScriptRoot
$nome = "DefesaCivil360-demonstracao"
$saida = Join-Path $raiz "dist"
$palco = Join-Path $saida $nome
$zip = Join-Path $saida "$nome.zip"

# Palco limpo: sobra de execucao anterior entraria no pacote sem ninguem ver.
if (Test-Path $palco) { Remove-Item $palco -Recurse -Force }
if (Test-Path $zip) { Remove-Item $zip -Force }
New-Item -ItemType Directory -Path $palco -Force | Out-Null

# O que o prototipo precisa para abrir. Nada alem disto.
# Barra normal, e nao contrabarra, nos dois lados: o Windows aceita as duas, e
# o Linux so aceita esta. O empacotador roda tanto na maquina de quem
# apresenta quanto no servidor de integracao, que e Linux.
$conteudo = @(
    @{ de = "mockup/index.html";                para = "index.html" },
    @{ de = "mockup/LEIA-ME.txt";               para = "LEIA-ME.txt" },
    @{ de = "mockup/app";                       para = "app" },
    @{ de = "mockup/design-system/tokens.css";  para = "design-system/tokens.css" },
    @{ de = "docs/APRESENTACAO.md";             para = "documentos/APRESENTACAO.md" },
    @{ de = "docs/ROTEIRO_DEMO.md";             para = "documentos/ROTEIRO_DEMO.md" },
    @{ de = "docs/ROTEIRO_VIDEO.md";            para = "documentos/ROTEIRO_VIDEO.md" }
)

foreach ($item in $conteudo) {
    $origem = Join-Path $raiz $item.de
    if (-not (Test-Path $origem)) { throw "Faltando no repositorio: $($item.de)" }

    $destino = Join-Path $palco $item.para
    $pastaDestino = Split-Path -Parent $destino
    if (-not (Test-Path $pastaDestino)) {
        New-Item -ItemType Directory -Path $pastaDestino -Force | Out-Null
    }

    if ((Get-Item $origem).PSIsContainer) {
        Copy-Item $origem $destino -Recurse -Force
    } else {
        Copy-Item $origem $destino -Force
    }
}

# O DESIGN_SYSTEM.md e o _tokens.scss ficam de fora de proposito: o primeiro e
# documentacao interna de design, o segundo e a versao para a fase real do
# produto, e nenhum dos dois e usado pelo index.html.

Compress-Archive -Path (Join-Path $palco "*") -DestinationPath $zip -Force

$tamanho = [math]::Round((Get-Item $zip).Length / 1KB, 1)
$arquivos = (Get-ChildItem $palco -Recurse -File).Count

Write-Output "Pacote gerado: $zip"
Write-Output "  $arquivos arquivos, $tamanho KB"
Write-Output ""
Write-Output "Confira antes de enviar: extraia o zip numa pasta nova e abra o"
Write-Output "index.html com dois cliques. Ele precisa abrir sem internet e sem"
Write-Output "nenhum erro no console do navegador."
