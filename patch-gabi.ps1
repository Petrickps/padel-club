$file = "src\App.jsx"
$content = Get-Content $file -Raw -Encoding UTF8
$content = $content -replace '"Gabi da Profit"', '"Gabi"'
$content | Set-Content $file -Encoding UTF8
Write-Host "PATCH GABI OK"
