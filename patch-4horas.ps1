$file = "src\App.jsx"
$content = Get-Content $file -Raw -Encoding UTF8

# 1. Atualiza filtrarCandidatos para excluir jogadores com convite nas últimas 4 horas
$old = 'function filtrarCandidatos(jogadores,genero,catsAlvo,dn,hr,metricas={}){
  const hoje=new Date().toISOString().split("T")[0];
  return jogadores.filter(j=>{'
$new = 'function filtrarCandidatos(jogadores,genero,catsAlvo,dn,hr,metricas={}){
  const hoje=new Date().toISOString().split("T")[0];
  const agora=Date.now();
  const JANELA_4H=4*60*60*1000;
  return jogadores.filter(j=>{'

$content = $content.Replace($old, $new)

# 2. Adiciona verificação de 4 horas logo após o filtro de indisponível
$old2 = '    // Exclui indisponíveis
    if(j.indisponivelAte&&j.indisponivelAte>=hoje) return false;'
$new2 = '    // Exclui indisponíveis
    if(j.indisponivelAte&&j.indisponivelAte>=hoje) return false;
    // Exclui quem recebeu convite nas últimas 4 horas
    if(j.ultimoConviteEm&&(agora-new Date(j.ultimoConviteEm).getTime())<JANELA_4H) return false;'

$content = $content.Replace($old2, $new2)

# 3. Atualiza fromDB para incluir ultimoConviteEm
$old3 = '    aceitaMisto: j.aceita_misto || false,
    indisponivelAte: j.indisponivel_ate || null,
  };
}'
$new3 = '    aceitaMisto: j.aceita_misto || false,
    indisponivelAte: j.indisponivel_ate || null,
    ultimoConviteEm: j.ultimo_convite_em || null,
  };
}'

$content = $content.Replace($old3, $new3)

$content | Set-Content $file -Encoding UTF8
Write-Host "PATCH 4H APLICADO OK"
