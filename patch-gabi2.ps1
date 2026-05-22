$file = "src\App.jsx"
$content = Get-Content $file -Raw -Encoding UTF8

# Substitui todas as ocorrências de Gabi da Profit por Gabi
$content = $content -replace 'Gabi da Profit', 'Gabi'

# Também substitui versão com encoding quebrado que pode estar no arquivo
$content = $content -replace 'Gabi da Profit', 'Gabi'

$content | Set-Content $file -Encoding UTF8
Write-Host "FEITO: $(($content | Select-String 'Gabi').Count) ocorrencias de Gabi no arquivo"
