$file = "src\App.jsx"
$content = Get-Content $file -Raw -Encoding UTF8

# 1. Remove categoria2 do addJogador
$content = $content -replace 'categoria: j\.cat, categoria2: j\.cat2\|\|null,', 'categoria: j.cat,'

# 2. Remove cat2 do fromDB
$content = $content -replace "g: j\.genero, cat: j\.categoria, cat2: j\.categoria2\|\|null,", 'g: j.genero, cat: j.categoria,'

# 3. Remove cat2 do filtrarCandidatos
$content = $content -replace '\|\|\(j\.cat2&&catsAlvo\.includes\(j\.cat2\)\)', ''

# 4. Remove campo cat2 do estado inicial do formulário (se existir)
$content = $content -replace ',\s*cat2:\s*"[^"]*"', ''
$content = $content -replace ',\s*cat2:\s*null', ''
$content = $content -replace ',\s*cat2:\s*j\.cat2', ''

$content | Set-Content $file -Encoding UTF8
Write-Host "PATCH APLICADO OK"
