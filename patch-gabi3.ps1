$file = "src\App.jsx"
$content = Get-Content $file -Raw -Encoding UTF8

# Corrige valor padrão nas funções buildMsg
$content = $content -replace 'remetente="Gabi da Profit"', 'remetente="Gabi"'

$content | Set-Content $file -Encoding UTF8

# Verifica resultado
$check = Get-Content $file -Raw
if ($check -match 'Gabi da Profit') {
    Write-Host "AINDA TEM Gabi da Profit no arquivo!"
} else {
    Write-Host "OK - Gabi da Profit removido com sucesso!"
}
