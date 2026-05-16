const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const EVO_URL = Deno.env.get("EVO_URL") || "https://evolution-api-production-27b9.up.railway.app";
const EVO_KEY = Deno.env.get("EVO_KEY") || "";
const EVO_INSTANCE = Deno.env.get("EVO_INSTANCE") || "profit1";
const REMETENTE = Deno.env.get("REMETENTE") || "Gabi da Profit";

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
      "apikey": SUPABASE_KEY, "Authorization": `Bearer ${SUPABASE_KEY}`,
      "Content-Type": "application/json", "Prefer": "return=minimal",
    },
    body: JSON.stringify(data),
  });
}

const OPENAI_KEY = Deno.env.get("OPENAI_API_KEY") || "";

const ANTHROPIC_KEY = Deno.env.get("ANTHROPIC_API_KEY") || "";

async function interpretarComClaude(texto: string): Promise<"sim" | "nao" | "desconhecido"> {
  if (!ANTHROPIC_KEY) return "desconhecido";
  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": ANTHROPIC_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 10,
        messages: [{
          role: "user",
          content: `Uma pessoa recebeu um convite para jogar padel e respondeu: "${texto}"\nEssa resposta indica SIM (quer jogar) ou NAO (não quer jogar)? Responda apenas SIM ou NAO.`
        }]
      })
    });
    const data = await res.json();
    const r = data.content?.[0]?.text?.trim().toUpperCase();
    console.log("CLAUDE:", r);
    if (r === "SIM") return "sim";
    if (r === "NAO" || r === "NÃO") return "nao";
    return "desconhecido";
  } catch(e) {
    console.log("Claude error:", e);
    return "desconhecido";
  }
}

async function transcreverAudio(msgId: string, telefone: string): Promise<string> {
  if (!OPENAI_KEY) return "";
  try {
    // Tenta buscar mídia via Evolution API
    const res = await fetch(`${EVO_URL}/chat/getBase64FromMediaMessage/${EVO_INSTANCE}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "apikey": EVO_KEY },
      body: JSON.stringify({
        message: { key: { id: msgId, remoteJid: `${telefone}@s.whatsapp.net`, fromMe: false } },
        convertToMp4: false,
      }),
    });
    const data = await res.json();
    console.log("MEDIA RESPONSE keys:", Object.keys(data||{}).join(","));

    const base64 = data.base64 || data.mediaBase64 || data.media || "";
    const mimetype = data.mimetype || data.mediaType || "audio/ogg; codecs=opus";
    console.log("BASE64 length:", base64.length, "MIMETYPE:", mimetype);
    if (!base64) return "";

    const clean = base64.replace(/^data:[^;]+;base64,/, "");
    const binary = atob(clean);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    const ext = mimetype.includes("mp4") ? "mp4" : mimetype.includes("webm") ? "webm" : "ogg";
    const blob = new Blob([bytes], { type: mimetype });

    const formData = new FormData();
    formData.append("file", blob, `audio.${ext}`);
    formData.append("model", "whisper-1");
    formData.append("language", "pt");

    const whisperRes = await fetch("https://api.openai.com/v1/audio/transcriptions", {
      method: "POST",
      headers: { "Authorization": `Bearer ${OPENAI_KEY}` },
      body: formData,
    });
    const whisperData = await whisperRes.json();
    console.log("WHISPER FULL:", JSON.stringify(whisperData).slice(0,300));
    return whisperData.text || "";
  } catch(e) {
    console.log("Audio error:", e);
    return "";
  }
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

function reconhecer(texto: string): "sim" | "nao" | "desconhecido" {
  const t = texto.toLowerCase().trim()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  const sim = ["sim","s","pode","topo","quero","vai","bora","claro","confirmo","ok","okay","vou","yes","positivo"];
  const nao = ["nao","n","negativo","impossivel","cancelar","ocupado","ocupada","infelizmente","no","nope"];
  if (sim.some(p => t === p || t.startsWith(p + " "))) return "sim";
  if (nao.some(p => t === p || t.startsWith(p + " "))) return "nao";
  return "desconhecido";
}

// Gera todas as variações possíveis de um telefone brasileiro
function variacoesTel(tel: string): string[] {
  const limpo = tel.replace(/\D/g,"");
  const vars = new Set<string>();
  vars.add(limpo);
  // sem 55
  const sem55 = limpo.startsWith("55") ? limpo.slice(2) : limpo;
  vars.add(sem55);
  vars.add(`55${sem55}`);
  // com 9 extra (celular)
  if (sem55.length === 10) {
    const com9 = sem55.slice(0,2) + "9" + sem55.slice(2);
    vars.add(com9);
    vars.add(`55${com9}`);
  }
  // sem 9 extra
  if (sem55.length === 11 && sem55[2] === "9") {
    const sem9 = sem55.slice(0,2) + sem55.slice(3);
    vars.add(sem9);
    vars.add(`55${sem9}`);
  }
  return Array.from(vars);
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("OK", { status: 200 });

  let body: any;
  try { body = await req.json(); }
  catch { return new Response("bad json", { status: 200 }); }

  const event = body.event || "";
  const eventosValidos = ["messages.upsert","messages.update","message.received","messages.set"];
  if (!eventosValidos.some(e => event === e || event.includes("message"))) {
    console.log("Evento ignorado:", event);
    return new Response("ignored", { status: 200 });
  }

  const data = body.data || {};
  const key = data.key || {};
  if (key.fromMe) return new Response("own", { status: 200 });

  const remoteJid = key.remoteJid || "";
  if (!remoteJid || remoteJid.includes("@g.us")) return new Response("group", { status: 200 });

  const telefone = remoteJid.replace("@s.whatsapp.net","").replace("@c.us","");
  const message = data.message || {};
  let texto = message.conversation || message.extendedTextMessage?.text || "";
  let ehAudio = false;
  const msgId = key.id || "";

  if (!texto && (message.audioMessage || message.pttMessage)) {
    ehAudio = true;
    console.log("AUDIO detectado, msgId:", msgId);
  }

  console.log("TEL:", telefone, "TEXTO:", texto, "EH AUDIO:", ehAudio);

  // Transcreve áudio se necessário
  let textoFinal = texto;
  if (ehAudio && msgId) {
    textoFinal = await transcreverAudio(msgId, telefone);
    console.log("TRANSCRICAO:", textoFinal);
  }

  if (!textoFinal) return new Response("no text", { status: 200 });

  // Busca jogador com todas as variações de telefone
  const vars = variacoesTel(telefone);
  console.log("VARS:", vars.join(","));
  const orQuery = vars.map(v => `telefone.eq.${v}`).join(",");

  const jogadores = await dbGet("jogadores", `select=id,nome,telefone&or=(${orQuery})&ativo=eq.true`);
  console.log("JOGADORES:", Array.isArray(jogadores) ? jogadores.length : "erro", jogadores?.[0]?.nome);

  if (!Array.isArray(jogadores) || !jogadores.length) return new Response("not found", { status: 200 });
  const jogador = jogadores[0];

  // Busca participação pendente
  const participacoes = await dbGet("participacoes",
    `select=id,jogo_id,jogos(id,data,hora,quadra)&jogador_id=eq.${jogador.id}&resposta=eq.pendente&order=created_at.desc&limit=1`
  );
  console.log("PENDENTES:", Array.isArray(participacoes) ? participacoes.length : "erro");

  if (!Array.isArray(participacoes) || !participacoes.length) return new Response("no pending", { status: 200 });

  const participacao = participacoes[0];
  const jogo = participacao.jogos;

  let resultado = reconhecer(textoFinal);
  console.log("RESULTADO:", resultado, "para:", textoFinal);

  if (resultado === "desconhecido") {
    resultado = await interpretarComClaude(textoFinal);
    console.log("RESULTADO POS CLAUDE:", resultado);
  }

  if (resultado === "desconhecido") {
    await enviarMsg(telefone, `Oi ${jogador.nome.split(" ")[0]}! Não entendi 😅\n\nResponda *SIM* ou *NÃO* 🎾`);
    return new Response("unclear", { status: 200 });
  }

  await dbPatch("participacoes", `id=eq.${participacao.id}`, {
    resposta: resultado === "sim" ? "confirmado" : "recusou",
    respondido_em: new Date().toISOString(),
  });

  console.log("ATUALIZADO:", resultado);

  if (resultado === "nao") {
    await enviarMsg(telefone,
      `Oi, ${jogador.nome.split(" ")[0]}! Tudo bem 😊\n\nObrigado pela resposta! Te aviso do próximo jogo 🎾\n\n_${REMETENTE}_`
    );
  }

  // Verifica se fechou
  const confirmados = await dbGet("participacoes",
    `select=id,jogadores(nome,telefone)&jogo_id=eq.${jogo.id}&resposta=eq.confirmado`
  );
  console.log("CONFIRMADOS:", Array.isArray(confirmados) ? confirmados.length : 0);

  if (Array.isArray(confirmados) && confirmados.length >= 4) {
    await dbPatch("jogos", `id=eq.${jogo.id}`, { status: "fechado" });
    const dataFmt = jogo.data ? jogo.data.split("-").reverse().join("/") : "";
    const msg = `🎾 *JOGO CONFIRMADO!*\n\n📅 ${dataFmt}\n🕐 ${jogo.hora}\n🏟️ ${jogo.quadra}\n\n${confirmados.map((p: any) => `• ${p.jogadores.nome}`).join("\n")}`;
    for (const c of confirmados) await enviarMsg(c.jogadores.telefone, msg);
    console.log("JOGO FECHADO!");
  }

  return new Response(JSON.stringify({ ok: true, resultado }), {
    headers: { "Content-Type": "application/json" },
  });
});
