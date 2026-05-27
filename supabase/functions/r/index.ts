const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const EVO_URL = Deno.env.get("EVO_URL") || "https://evolution-api-production-27b9.up.railway.app";
const EVO_KEY = Deno.env.get("EVO_KEY") || "";
const EVO_INSTANCE = Deno.env.get("EVO_INSTANCE") || "profit1";
const REMETENTE = Deno.env.get("REMETENTE") || "Gabi";

async function dbGet(table: string, query: string) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${query}`, {
    headers: { "apikey": SUPABASE_KEY, "Authorization": `Bearer ${SUPABASE_KEY}` },
  });
  return res.json();
}

async function dbPatch(table: string, query: string, data: any) {
  await fetch(`${SUPABASE_URL}/rest/v1/${table}?${query}`, {
    method: "PATCH",
    headers: {
      "apikey": SUPABASE_KEY,
      "Authorization": `Bearer ${SUPABASE_KEY}`,
      "Content-Type": "application/json",
      "Prefer": "return=minimal",
    },
    body: JSON.stringify(data),
  });
}

async function enviarMsg(telefone: string, mensagem: string) {
  const num = telefone.replace(/\D/g, "");
  const numFmt = num.startsWith("55") ? num : `55${num}`;
  await fetch(`${EVO_URL}/message/sendText/${EVO_INSTANCE}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "apikey": EVO_KEY },
    body: JSON.stringify({ number: numFmt, text: mensagem }),
  });
}

function htmlPage(titulo: string, mensagem: string, cor: string, emoji: string) {
  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>${titulo}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      background: #F7F8FA;
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 20px;
    }
    .card {
      background: white;
      border-radius: 20px;
      padding: 40px 32px;
      max-width: 380px;
      width: 100%;
      text-align: center;
      box-shadow: 0 10px 40px rgba(0,0,0,0.1);
    }
    .emoji { font-size: 64px; margin-bottom: 20px; }
    h1 { font-size: 22px; color: #1A202C; margin-bottom: 12px; font-weight: 700; }
    p { font-size: 15px; color: #64748B; line-height: 1.6; }
    .badge {
      display: inline-block;
      background: ${cor}18;
      color: ${cor};
      border: 1.5px solid ${cor}44;
      border-radius: 99px;
      padding: 6px 18px;
      font-size: 13px;
      font-weight: 700;
      margin-top: 20px;
    }
    .logo {
      margin-top: 32px;
      font-size: 12px;
      color: #94A3B8;
    }
  </style>
</head>
<body>
  <div class="card">
    <div class="emoji">${emoji}</div>
    <h1>${titulo}</h1>
    <p>${mensagem}</p>
    <div class="badge">Profit1 Padel 🎾</div>
    <div class="logo">Você pode fechar esta página</div>
  </div>
</body>
</html>`;
}

Deno.serve(async (req) => {
  const url = new URL(req.url);
  const participacaoId = url.searchParams.get("p");
  const resposta = url.searchParams.get("r");

  // Valida parâmetros
  if (!participacaoId || !["sim", "nao"].includes(resposta || "")) {
    return new Response(
      htmlPage("Link inválido", "Este link não é válido ou já expirou.", "#DC2626", "❌"),
      { status: 400, headers: { "Content-Type": "text/html; charset=utf-8" } }
    );
  }

  // Busca participação
  const participacoes = await dbGet("participacoes",
    `select=id,resposta,jogador_id,jogo_id,jogadores(nome,telefone),jogos(id,data,hora,quadra,status)&id=eq.${participacaoId}`
  );

  if (!Array.isArray(participacoes) || !participacoes.length) {
    return new Response(
      htmlPage("Link inválido", "Este link não é válido ou já expirou.", "#DC2626", "❌"),
      { status: 404, headers: { "Content-Type": "text/html; charset=utf-8" } }
    );
  }

  const participacao = participacoes[0];
  const jogador = participacao.jogadores;
  const jogo = participacao.jogos;
  const nome = jogador.nome.split(" ")[0];

  // Já respondeu?
  if (participacao.resposta !== "pendente") {
    const jaRespondeu = participacao.resposta === "confirmado" || participacao.resposta === "sim";
    return new Response(
      htmlPage(
        "Resposta já registrada",
        `Olá, ${nome}! Sua resposta já foi registrada anteriormente.`,
        "#D97706", "⚠️"
      ),
      { status: 200, headers: { "Content-Type": "text/html; charset=utf-8" } }
    );
  }

  // Jogo já fechado?
  if (jogo.status === "fechado" && resposta === "sim") {
    await dbPatch("participacoes", `id=eq.${participacaoId}`, { resposta: "expirado" });
    return new Response(
      htmlPage(
        "Jogo já fechado",
        `Obrigado, ${nome}! Infelizmente este jogo já foi fechado com outros jogadores. Te avisamos do próximo! 🎾`,
        "#D97706", "⏰"
      ),
      { status: 200, headers: { "Content-Type": "text/html; charset=utf-8" } }
    );
  }

  // Registra resposta
  await dbPatch("participacoes", `id=eq.${participacaoId}`, {
    resposta: resposta === "sim" ? "confirmado" : "recusou",
    respondido_em: new Date().toISOString(),
  });

  // Resposta NÃO — agradece e retorna
  if (resposta === "nao") {
    await enviarMsg(jogador.telefone,
      `Oi, ${nome}! Tudo bem 😊\n\nObrigado pela resposta! Te aviso do próximo jogo 🎾\n\n_${REMETENTE}_`
    );
    return new Response(
      htmlPage(
        "Tudo bem!",
        `Obrigado, ${nome}! Avisaremos você no próximo jogo. 🎾`,
        "#059669", "😊"
      ),
      { status: 200, headers: { "Content-Type": "text/html; charset=utf-8" } }
    );
  }

  // Resposta SIM — confirma e verifica se fecha o jogo
  await enviarMsg(jogador.telefone,
    `Perfeito, ${nome}! 🎾\n\nAssim que o jogo fechar, eu envio a confirmação com todos os detalhes!\n\n_${REMETENTE}_`
  );

  // Verifica quantos confirmados tem agora
  const confirmados = await dbGet("participacoes",
    `select=id,jogadores(nome,telefone)&jogo_id=eq.${jogo.id}&resposta=eq.confirmado`
  );

  const jogoAtual = await dbGet("jogos", `select=status&id=eq.${jogo.id}`);
  const jogoStatus = Array.isArray(jogoAtual) ? jogoAtual[0]?.status : "ativo";

  // Fecha com exatamente 4
  if (Array.isArray(confirmados) && confirmados.length === 4 && jogoStatus !== "fechado") {
    await dbPatch("jogos", `id=eq.${jogo.id}`, { status: "fechado" });

    const dataFmt = jogo.data ? jogo.data.split("-").reverse().join("/") : "";
    const msg = `🎾 *JOGO CONFIRMADO!*\n\n📅 ${dataFmt}\n🕐 ${jogo.hora}\n🏟️ ${jogo.quadra}\n\n${confirmados.slice(0, 4).map((p: any) => `• ${p.jogadores.nome}`).join("\n")}`;

    const enviados = new Set<string>();
    for (const c of confirmados.slice(0, 4)) {
      const tel = c.jogadores.telefone;
      if (!enviados.has(tel)) {
        await enviarMsg(tel, msg);
        enviados.add(tel);
      }
    }

    await dbPatch("participacoes",
      `jogo_id=eq.${jogo.id}&resposta=eq.pendente`,
      { resposta: "expirado" }
    );
  }

  return new Response(
    htmlPage(
      "Confirmado! 🎾",
      `Ótimo, ${nome}! Sua participação foi confirmada. Assim que o jogo fechar, você receberá os detalhes pelo WhatsApp.`,
      "#059669", "✅"
    ),
    { status: 200, headers: { "Content-Type": "text/html; charset=utf-8" } }
  );
});
