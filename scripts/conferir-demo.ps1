<#
    Confere a demonstracao inteira, do jeito que ela vai ser usada.

    Ordem:
      1. Monta o pacote de distribuicao.
      2. Extrai o zip numa pasta nova, como o destinatario faz.
      3. Confere o pacote extraido: abre por file://, sem rede.
      4. Executa o roteiro de dez minutos nos tres motores de navegador.

    Rodar:
        powershell -ExecutionPolicy Bypass -File scripts\conferir-demo.ps1

    Um unico "TUDO CERTO" no fim significa que o zip que esta em dist\ e o que
    pode ser enviado. Qualquer outra coisa e motivo para nao enviar.
#>

$ErrorActionPreference = "Stop"

$raiz = Split-Path -Parent $PSScriptRoot
$zip = Join-Path $raiz "dist\DefesaCivil360-demonstracao.zip"
$extraido = Join-Path $env:TEMP "dc360-conferir-demo"

Write-Output "== 1. Montando o pacote =="
& powershell -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot "empacotar-demo.ps1")
if ($LASTEXITCODE -ne 0) { throw "o empacotamento falhou" }

Write-Output ""
Write-Output "== 2. Extraindo numa pasta nova =="
if (Test-Path $extraido) { Remove-Item $extraido -Recurse -Force }
Expand-Archive -Path $zip -DestinationPath $extraido
Write-Output "Extraido em: $extraido"

Write-Output ""
Write-Output "== 3. Conferindo o pacote extraido =="
Push-Location $raiz
try {
    & node "scripts\conferir-pacote.mjs" $extraido
    if ($LASTEXITCODE -ne 0) { throw "o pacote extraido reprovou" }

    # Os tres motores: Chromium cobre Chrome e Edge, Firefox e o Gecko, e o
    # WebKit e o motor do Safari. O criterio de aceite do CP9 pede que o
    # layout e o simulador de offline funcionem igual fora do Chromium.
    foreach ($motor in @("chromium", "firefox", "webkit")) {
        Write-Output ""
        Write-Output "== 4. Roteiro de dez minutos no $motor =="
        & node "scripts\conferir-roteiro.mjs" $extraido $motor
        if ($LASTEXITCODE -ne 0) { throw "o roteiro reprovou no $motor" }
    }
} finally {
    Pop-Location
}

Write-Output ""
Write-Output "============================================================"
Write-Output "TUDO CERTO. O pacote em dist\ pode ser enviado."
Write-Output "  $zip"
