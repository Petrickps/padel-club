const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const EVO_URL = Deno.env.get("EVO_URL") || "https://evolution-api-production-27b9.up.railway.app";
const EVO_KEY = Deno.env.get("EVO_KEY") || "";
const EVO_INSTANCE = Deno.env.get("EVO_INSTANCE") || "profit1";
const REMETENTE = Deno.env.get("REMETENTE") || "Gabi";
const ANTHROPIC_KEY = Deno.env.get("ANTHROPIC_API_KEY") || "";
const OPENAI_KEY = Deno.env.get("OPENAI_API_KEY") || "";

const JANELA_CONVITE_MS = 4 * 60 * 60 * 1000;

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

async function enviarMsg(telefone: string, mensagem: string) {
  const num = telefone.replace(/\D/g, "");
  const numFmt = num.startsWith("55") ? num : `55${num}`;
  const res = await fetch(`${EVO_URL}/message/sendText/${EVO_INSTANCE}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "apikey": EVO_KEY },
    body: JSON.stringify({ number: numFmt, text: mensagem }),
  });
  if (!res.ok) console.log("ENVIO ERRO:", await res.text());
}

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
          content: `Uma pessoa recebeu um convite para jogar padel e respondeu: "${texto}"

Analise com cuidado. Considere:
- Respostas NEGATIVAS incluem: qualquer desculpa, compromisso, indisponibilidade, "não posso", "outra vez", "próxima", "infelizmente", frases explicando por que não pode ir, qualquer forma de recusa educada, cumprimentos sem confirmação como "opa", "oi", "olá"
- Respostas POSITIVAS são claras confirmações de participação: sim, topo, bora, pode sim, claro, vou
- Em caso de dúvida, prefira NAO

Responda APENAS com SIM ou NAO, sem mais nada.`
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
    const res = await fetch(`${EVO_URL}/chat/getBase64FromMediaMessage/${EVO_INSTANCE}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "apikey": EVO_KEY },
      body: JSON.stringify({
        message: { key: { id: msgId, remoteJid: `${telefone}@s.whatsapp.net`, fromMe: false } },
        convertToMp4: false,
      }),
    });
    const data = await res.json();
    const base64 = data.base64 || data.mediaBase64 || data.media || "";
    const mimetype = data.mimetype || data.mediaType || "audio/ogg; codecs=opus";
    if (!base64) { console.log("BASE64 vazio"); return ""; }

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
    formData.append("prompt", "Resposta para convite de padel. Pode ser: sim, não, não posso, topo, infelizmente não, pode ser, bora, não vou conseguir.");

    const whisperRes = await fetch("https://api.openai.com/v1/audio/transcriptions", {
      method: "POST",
      headers: { "Authorization": `Bearer ${OPENAI_KEY}` },
      body: formData,
    });
    const whisperData = await whisperRes.json();
    console.log("WHISPER:", JSON.stringify(whisperData).slice(0, 300));
    return whisperData.text || "";
  } catch(e) {
    console.log("Audio error:", e);
    return "";
  }
}

function reconhecer(texto: string): "sim" | "nao" | "desconhecido" {
  const t = texto.toLowerCase().trim()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[!.,?]+$/, "").trim();

  // SIM — apenas palavras inequivocamente positivas
  const sim = ["sim", "s", "yes", "topo", "bora", "confirmo", "confirmado", "quero", "aceito"];

  // NAO — apenas palavras inequivocamente negativas
  const nao = ["nao", "n", "no", "nope", "negativo", "nao quero", "nao posso", "nao vou"];

  if (sim.includes(t)) return "sim";
  if (nao.includes(t)) return "nao";

  return "desconhecido";
}

function variacoesTel(tel: string): string[] {
  const limpo = tel.replace(/\D/g, "");
  const vars = new Set<string>();
  vars.add(limpo);
  const sem55 = limpo.startsWith("55") ? limpo.slice(2) : limpo;
  vars.add(sem55);
  vars.add(`55${sem55}`);
  if (sem55.length === 10) {
    const com9 = sem55.slice(0, 2) + "9" + sem55.slice(2);
    vars.add(com9);
    vars.add(`55${com9}`);
  }
  if (sem55.length === 11 && sem55[2] === "9") {
    const sem9 = sem55.slice(0, 2) + sem55.slice(3);
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
  if (!event.includes("message")) {
    console.log("Evento ignorado:", event);
    return new Response("ignored", { status: 200 });
  }

  const data = body.data || {};
  const key = data.key || {};
  if (key.fromMe) return new Response("own", { status: 200 });

  const remoteJid = key.remoteJid || "";
  if (!remoteJid || remoteJid.includes("@g.us")) return new Response("group", { status: 200 });

  const telefone = remoteJid.replace("@s.whatsapp.net", "").replace("@c.us", "");
  const message = data.message || {};
  let texto = message.conversation || message.extendedTextMessage?.text || "";
  let ehAudio = false;
  const msgId = key.id || "";

  if (!texto && (message.audioMessage || message.pttMessage)) {
    ehAudio = true;
    console.log("AUDIO detectado, msgId:", msgId);
  }

  console.log("TEL:", telefone, "TEXTO:", texto, "AUDIO:", ehAudio);

  let textoFinal = texto;
  if (ehAudio && msgId) {
    textoFinal = await transcreverAudio(msgId, telefone);
    console.log("TRANSCRICAO:", textoFinal);
  }

  if (!textoFinal) return new Response("no text", { status: 200 });

  const vars = variacoesTel(telefone);
  const orQuery = vars.map(v => `telefone.eq.${v}`).join(",");
  const jogadores = await dbGet("jogadores", `select=id,nome,telefone,ultimo_convite_em&or=(${orQuery})&ativo=eq.true`);
  if (!Array.isArray(jogadores) || !jogadores.length) {
    console.log("Jogador nao encontrado:", telefone);
    return new Response("not found", { status: 200 });
  }
  const jogador = jogadores[0];
  console.log("JOGADOR:", jogador.nome);

  const participacoes = await dbGet("participacoes",
    `select=id,jogo_id,created_at,jogos(id,data,hora,quadra,status)&jogador_id=eq.${jogador.id}&resposta=eq.pendente&order=created_at.desc&limit=1`
  );
  if (!Array.isArray(participacoes) || !participacoes.length) {
    console.log("Nenhuma participacao pendente para:", jogador.nome);
    return new Response("no pending", { status: 200 });
  }

  const participacao = participacoes[0];
  const jogo = participacao.jogos;

  // CONDICIONANTE 1: jogo fechado com 4 jogadores
  if (jogo.status === "fechado") {
    console.log("Jogo fechado, expirando:", jogador.nome);
    await dbPatch("participacoes", `id=eq.${participacao.id}`, { resposta: "expirado" });
    return new Response("game closed", { status: 200 });
  }

  // CONDICIONANTE 2: jogo cancelado
  if (jogo.status === "cancelado") {
    console.log("Jogo cancelado, expirando:", jogador.nome);
    await dbPatch("participacoes", `id=eq.${participacao.id}`, { resposta: "expirado" });
    return new Response("game cancelled", { status: 200 });
  }

  // CONDICIONANTE 3: horario do jogo ja passou
  if (jogo.data && jogo.hora) {
    const agora = new Date();
    const jogoDateTime = new Date(`${jogo.data}T${jogo.hora}:00`);
    if (agora >= jogoDateTime) {
      console.log("Horario passou, expirando:", jogador.nome);
      await dbPatch("participacoes", `id=eq.${participacao.id}`, { resposta: "expirado" });
      if (jogo.status === "ativo") {
        await dbPatch("jogos", `id=eq.${jogo.id}`, { status: "expirado" });
      }
      return new Response("game expired", { status: 200 });
    }
  }

  let resultado = reconhecer(textoFinal);
  console.log("RESULTADO LOCAL:", resultado, "para:", textoFinal);


  // Se nao entendeu, pede resposta clara — sem usar Claude
  if (resultado === "desconhecido") {
    console.log("NAO ENTENDIDO:", textoFinal, "jogador:", jogador.nome);
    await enviarMsg(jogador.telefone,
      `Desculpe, não entendi sua resposta 😊\n\nPoderia responder *SIM* ou *NÃO*?`
    );
    return new Response("unclear - asked for clarification", { status: 200 });
  }

  await dbPatch("participacoes", `id=eq.${participacao.id}`, {
    resposta: resultado === "sim" ? "confirmado" : "recusou",
    respondido_em: new Date().toISOString(),
  });
  console.log("PARTICIPACAO ATUALIZADA:", resultado);

  // FIX: Agradecimento ao NAO sempre
  if (resultado === "nao") {
    await enviarMsg(telefone,
      `Oi, ${jogador.nome.split(" ")[0]}! Tudo bem 😊\n\nObrigado pela resposta! Te aviso do próximo jogo 🎾\n\n_${REMETENTE}_`
    );
    return new Response(JSON.stringify({ ok: true, resultado }), {
      headers: { "Content-Type": "application/json" },
    });
  }

  if (resultado === "sim") {
    await enviarMsg(telefone,
      `Perfeito, ${jogador.nome.split(" ")[0]}! 🎾\n\nAssim que o jogo fechar, eu envio a confirmação com todos os detalhes!\n\n_${REMETENTE}_`
    );
  }

  // FIX: Verifica confirmados com protecao contra duplicata
  const confirmados = await dbGet("participacoes",
    `select=id,jogadores(nome,telefone)&jogo_id=eq.${jogo.id}&resposta=eq.confirmado`
  );
  const jogoAtual = await dbGet("jogos", `select=status&id=eq.${jogo.id}`);
  const jogoStatus = Array.isArray(jogoAtual) ? jogoAtual[0]?.status : "ativo";

  console.log("CONFIRMADOS:", Array.isArray(confirmados) ? confirmados.length : 0, "STATUS:", jogoStatus);

  // FIX: Fecha apenas com EXATAMENTE 4 e apenas se ainda nao fechado
  if (Array.isArray(confirmados) && confirmados.length === 4 && jogoStatus !== "fechado") {
    // Fecha ANTES de enviar para evitar duplicatas
    await dbPatch("jogos", `id=eq.${jogo.id}`, { status: "fechado" });
    console.log("JOGO FECHADO!");

    const dataFmt = jogo.data ? jogo.data.split("-").reverse().join("/") : "";
    const msg = `🎾 *JOGO CONFIRMADO!*\n\n📅 ${dataFmt}\n🕐 ${jogo.hora}\n🏟️ ${jogo.quadra}\n\n${confirmados.slice(0, 4).map((p: any) => `• ${p.jogadores.nome}`).join("\n")}`;

    // Envia sem duplicatas
    const enviados = new Set<string>();
    for (const c of confirmados.slice(0, 4)) {
      const tel = c.jogadores.telefone;
      if (!enviados.has(tel)) {
        await enviarMsg(tel, msg);
        enviados.add(tel);
      }
    }

    // Expira pendentes restantes
    await dbPatch("participacoes",
      `jogo_id=eq.${jogo.id}&resposta=eq.pendente`,
      { resposta: "expirado" }
    );
  }

  return new Response(JSON.stringify({ ok: true, resultado }), {
    headers: { "Content-Type": "application/json" },
  });
});
