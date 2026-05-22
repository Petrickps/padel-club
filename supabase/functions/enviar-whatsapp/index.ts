import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const EVO_URL      = "https://evolution-api-production-27b9.up.railway.app";
const EVO_KEY      = "pas23EVE02@";
const EVO_INSTANCE = "profit1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const { number, text } = body;

    if (!number || !text) {
      return new Response(
        JSON.stringify({ error: "number e text são obrigatórios" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Formata número
    const num = String(number).replace(/\D/g, "");
    const numFmt = num.startsWith("55") ? num : `55${num}`;

    console.log("Enviando para:", numFmt);

    const evoRes = await fetch(`${EVO_URL}/message/sendText/${EVO_INSTANCE}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "apikey": EVO_KEY,
      },
      body: JSON.stringify({
        number: numFmt,
        text: text,
      }),
    });

    const data = await evoRes.text();
    console.log("Evolution response:", evoRes.status, data);

    return new Response(data, {
      status: evoRes.status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (err) {
    console.error("Erro:", err);
    return new Response(
      JSON.stringify({ error: String(err) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
