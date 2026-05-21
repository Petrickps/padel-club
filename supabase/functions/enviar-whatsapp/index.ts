// supabase/functions/enviar-whatsapp/index.ts
// Proxy para Evolution API — resolve problema de CORS no browser

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
  // Responde preflight CORS
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { number, text } = await req.json();

    if (!number || !text) {
      return new Response(
        JSON.stringify({ error: "number e text são obrigatórios" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Formata número: remove não-dígitos, garante código país 55
    const num = number.replace(/\D/g, "");
    const numFmt = num.startsWith("55") ? num : `55${num}`;

    const res = await fetch(`${EVO_URL}/message/sendText/${EVO_INSTANCE}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "apikey": EVO_KEY,
      },
      body: JSON.stringify({
        number: numFmt,
        text,
      }),
    });

    const data = await res.text();

    if (!res.ok) {
      console.error("Evolution API error:", res.status, data);
      return new Response(
        JSON.stringify({ error: data }),
        { status: res.status, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(data, {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (err) {
    console.error("Erro interno:", err);
    return new Response(
      JSON.stringify({ error: String(err) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
