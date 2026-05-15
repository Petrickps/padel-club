import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANTHROPIC_KEY = Deno.env.get("ANTHROPIC_API_KEY") || "";
const OPENAI_KEY = Deno.env.get("OPENAI_API_KEY") || "";
const EVO_URL = Deno.env.get("EVO_URL") || "https://evolution-api-production-27b9.up.railway.app";
const EVO_KEY = Deno.env.get("EVO_KEY") || "";
const EVO_INSTANCE = Deno.env.get("EVO_INSTANCE") || "profit1";
const REMETENTE = Deno.env.get("REMETENTE") || "Gabi da Profit";

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

// ── RECONHECIMENTO DE TEXTO ───────────────────────────────────────────────────
function reconhecerResposta(texto: string): "sim" | "nao" | "desconhecido" {
  const t = texto.toLowerCase().trim()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, ""); // remove acentos

  const sim = ["sim", "s", "pode", "topo", "quero", "vai", "bora", "claro",
    "confirmo", "confirmado", "aceito", "aceitar", "ok", "okay", "combinado",
    "com certeza", "com prazer", "adorei", "adoro", "vou", "estou dentro",
    "positivo", "afirmativo", "yes", "yep", "yeah"];

  const nao = ["nao", "n", "nope", "negativo", "impossivel", "nada",
    "nao posso", "nao consigo", "nao da", "nao vai", "nao quero",
    "cancelar", "desistir", "ocupado", "ocupada", "compromisso",
    "viagem", "trabalho", "negao", "neg", "infelizmente", "no"];

  if (sim.some(p => t === p || t.startsWith(p + " ") || t.includes(p)))
    return "sim";
  if (nao.some(p => t === p || t.startsWith(p + " ") || t.includes(p)))
    return "nao";
  return "desconhecido";
}

// ── CLAUDE AI INTERPRETA ─────────────────────────────────────────────────────
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
          content: `Uma pessoa recebeu um convite para jogar padel e respondeu: "${texto}"\n\nEssa resposta indica que a pessoa QUER jogar (SIM) ou NÃO quer jogar (NAO)?\nResponda apenas com SIM ou NAO.`
        }]
      })
    });
    const data = await res.json();
    const resposta = data.content?.[0]?.text?.trim().toUpperCase();
    if (resposta === "SIM") return "sim";
    if (resposta === "NAO" || resposta === "NÃO") return "nao";
    return "desconhecido";
  } catch {
    return "desconhecido";
  }
}

// ── WHISPER TRANSCREVE ÁUDIO ─────────────────────────────────────────────────
async function transcreverAudio(audioUrl: string): Promise<string> {
  if (!OPENAI_KEY) return "";
  try {
    // Baixa o áudio
    const audioRes = await fetch(audioUrl);
    const audioBlob = await audioRes.blob();
    const formData = new FormData();
    formData.append("file", audioBlob, "audio.ogg");
    formData.append("model", "whisper-1");
    formData.append("language", "pt");
    const res = await fetch("https://api.openai.com/v1/audio/transcriptions", {
      method: "POST",
      headers: { "Authorization": `Bearer ${OPENAI_KEY}` },
      body: formData,
    });
    const data = await res.json();
    return data.text || "";
  } catch {
    return "";
  }
}

// ── ENVIAR MENSAGEM ───────────────────────────────────────────────────────────
async function enviarMsg(telefone: string, mensagem: string) {
  const num = telefone.replace(/\D/g, "");
  const numFmt = num.startsWith("55") ? num : `55${num}`;
  await fetch(`${EVO_URL}/message/sendText/${EVO_INSTANCE}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "apikey": EVO_KEY },
    body: JSON.stringify({ number: numFmt, text: mensagem }),
  });
}

// ── HANDLER PRINCIPAL ─────────────────────────────────────────────────────────
Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return new Response("OK", { status: 200 });
  }

  try {
    const body = await req.json();

    // Extrai dados do webhook da Evolution API
    const data = body.data || body;
    const msg = data.message || data.messages?.[0];
    if (!msg) return new Response("no message", { status: 200 });

    // Ignora mensagens enviadas pelo próprio bot
    if (data.key?.fromMe || msg.key?.fromMe) return new Response("own message", { status: 200 });

    // Número do remetente
    const remoteJid = data.key?.remoteJid || msg.key?.remoteJid || "";
    const telefone = remoteJid.replace("@s.whatsapp.net", "").replace("@c.us", "");
    if (!telefone) return new Response("no phone", { status: 200 });

    // Extrai texto ou áudio
    let textoOriginal = "";
    let ehAudio = false;
    let audioUrl = "";

    if (msg.message?.conversation) {
      textoOriginal = msg.message.conversation;
    } else if (msg.message?.extendedTextMessage?.text) {
      textoOriginal = msg.message.extendedTextMessage.text;
    } else if (msg.message?.audioMessage || msg.message?.pttMessage) {
      ehAudio = true;
      // URL do áudio via Evolution API
      const msgId = msg.key?.id || "";
      audioUrl = `${EVO_URL}/chat/getBase64FromMediaMessage/${EVO_INSTANCE}`;
    }

    if (!textoOriginal && !ehAudio) return new Response("no text", { status: 200 });

    // Transcreve áudio se necessário
    if (ehAudio && audioUrl) {
      const transcricao = await transcreverAudio(audioUrl);
      if (transcricao) textoOriginal = transcricao;
      else return new Response("audio not transcribed", { status: 200 });
    }

    // Busca jogador pelo telefone
    const telLimpo = telefone.replace(/\D/g, "");
    const { data: jogadores } = await supabase
      .from("jogadores")
      .select("*")
      .or(`telefone.eq.${telLimpo},telefone.eq.+55${telLimpo},telefone.eq.55${telLimpo}`);

    if (!jogadores?.length) return new Response("jogador not found", { status: 200 });
    const jogador = jogadores[0];

    // Busca participação pendente mais recente
    const { data: participacoes } = await supabase
      .from("participacoes")
      .select("*, jogos(*)")
      .eq("jogador_id", jogador.id)
      .eq("resposta", "pendente")
      .order("created_at", { ascending: false })
      .limit(1);

    if (!participacoes?.length) return new Response("no pending game", { status: 200 });
    const participacao = participacoes[0];
    const jogo = participacao.jogos;

    // Reconhece a resposta
    let resultado = reconhecerResposta(textoOriginal);

    // Se não reconheceu, tenta com Claude
    if (resultado === "desconhecido") {
      resultado = await interpretarComClaude(textoOriginal);
    }

    if (resultado === "desconhecido") {
      // Pede para confirmar
      await enviarMsg(telefone,
        `Oi ${jogador.nome.split(" ")[0]}! Não entendi sua resposta 😅\n\nVocê quer jogar?\n\nResponda *SIM* ou *NÃO* 🎾`
      );
      return new Response("unclear", { status: 200 });
    }

    // Atualiza participação
    await supabase
      .from("participacoes")
      .update({
        resposta: resultado === "sim" ? "confirmado" : "recusou",
        respondido_em: new Date().toISOString(),
      })
      .eq("id", participacao.id);

    // Se recusou — envia agradecimento
    if (resultado === "nao") {
      await enviarMsg(telefone,
        `Oi, ${jogador.nome.split(" ")[0]}! Tudo bem 😊\n\nObrigada pela resposta! Te aviso no próximo jogo 🎾\n\n_${REMETENTE}_`
      );
    }

    // Verifica se o jogo fechou (4 confirmados)
    const { data: confirmados } = await supabase
      .from("participacoes")
      .select("*, jogadores(*)")
      .eq("jogo_id", jogo.id)
      .eq("resposta", "confirmado");

    if (confirmados?.length === 4) {
      // Atualiza status do jogo
      await supabase.from("jogos").update({ status: "fechado" }).eq("id", jogo.id);

      // Envia mensagem de jogo fechado para todos
      const msgFechado = `🎾 *JOGO CONFIRMADO!*\n\n📅 ${jogo.data}\n🕐 ${jogo.hora}\n🏟️ ${jogo.quadra}\n\n${confirmados.map((p: any) => `• ${p.jogadores.nome}`).join("\n")}`;
      for (const c of confirmados) {
        await enviarMsg(c.jogadores.telefone, msgFechado);
      }
    }

    return new Response(JSON.stringify({ status: "ok", resultado }), {
      headers: { "Content-Type": "application/json" },
    });

  } catch (err) {
    console.error(err);
    return new Response("error", { status: 500 });
  }
});
