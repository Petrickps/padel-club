import { useState, useEffect, useRef, useCallback, useMemo } from "react";

// ─── SUPABASE ─────────────────────────────────────────────────────────────────
const SUPA_URL = "https://hyjvqjrnpobujwvsqsrn.supabase.co";
const SUPA_KEY = "sb_publishable_yevc2A-MWUy26r1xoF7kiQ_u2UZWyBJ";

// Cliente Supabase para Realtime (via CDN carregado no index.html)
function getSupabaseClient() {
  try {
    const { createClient } = (window as any).supabase;
    return createClient(SUPA_URL, SUPA_KEY);
  } catch {
    return null;
  }
}

// ─── EVOLUTION API ────────────────────────────────────────────────────────────
const EVO_URL      = "https://evolution-api-production-27b9.up.railway.app";
const EVO_KEY      = "pas23EVE02@";
const EVO_INSTANCE = "profit1";

async function enviarWhatsApp(telefone, mensagem) {
  // formata número: remove tudo que não é dígito, garante código país 55
  const num = telefone.replace(/\D/g,"");
  const numFmt = num.startsWith("55") ? num : `55${num}`;

  const res = await fetch(`${EVO_URL}/message/sendText/${EVO_INSTANCE}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "apikey": EVO_KEY,
    },
    body: JSON.stringify({
      number: numFmt,
      text: mensagem,
    }),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(err);
  }
  return res.json();
}

// Envia para vários jogadores em paralelo
async function enviarParaLista(jogadores, buildMsg) {
  const resultados = await Promise.allSettled(
    jogadores.map(j => enviarWhatsApp(j.tel, buildMsg(j)))
  );
  const erros = resultados.filter(r => r.status === "rejected").length;
  const ok    = resultados.filter(r => r.status === "fulfilled").length;
  return { ok, erros };
}

async function supaFetch(path, options={}) {
  const res = await fetch(`${SUPA_URL}/rest/v1/${path}`, {
    ...options,
    headers: {
      "apikey": SUPA_KEY,
      "Authorization": `Bearer ${SUPA_KEY}`,
      "Content-Type": "application/json",
      "Prefer": options.prefer || "return=representation",
      ...options.headers,
    },
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(err);
  }
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

// CRUD jogadores
const db = {
  async getJogadores() {
    return supaFetch("jogadores?select=*&ativo=eq.true&order=nome.asc");
  },
  async addJogador(j) {
    return supaFetch("jogadores", {
      method: "POST",
      body: JSON.stringify({
        nome: j.nome, telefone: j.tel, genero: j.g,
        categoria: j.cat, categoria2: j.cat2||null,
        dias_pref: j.dias, horas_pref: j.hrs,
        aceita_misto: j.aceitaMisto, ativo: true,
      }),
    });
  },
  async updateJogador(id, data) {
    return supaFetch(`jogadores?id=eq.${id}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    });
  },
  async deleteJogador(id) {
    return supaFetch(`jogadores?id=eq.${id}`, {
      method: "PATCH",
      body: JSON.stringify({ ativo: false }),
    });
  },
  async saveJogo(jogo) {
    // salva o jogo
    const [jogoSalvo] = await supaFetch("jogos", {
      method: "POST",
      body: JSON.stringify({
        data: jogo.slot.data, hora: jogo.slot.hora,
        quadra: jogo.slot.quadra, genero: jogo.slot.genero,
        categoria: jogo.catDefinida, status: jogo.status,
        ondas_usadas: jogo.ondaAtual,
      }),
    });
    // salva participações
    const participacoes = jogo.fila
      .filter(j => ["confirmado","recusou","expirado"].includes(j.status))
      .map(j => ({
        jogo_id: jogoSalvo.id,
        jogador_id: j.id,
        resposta: j.status,
        onda: j.ondaEnviado || 1,
        respondido_em: j.respostaEm ? new Date().toISOString() : null,
      }));
    if (participacoes.length > 0) {
      await supaFetch("participacoes", {
        method: "POST",
        body: JSON.stringify(participacoes),
      });
    }
    return jogoSalvo;
  },

  // Salva participações pendentes no banco (para webhook detectar)
  async savePendentes(jogoDbId, jogadores) {
    if (!jogadores.length) return;
    const participacoes = jogadores.map(j => ({
      jogo_id: jogoDbId,
      jogador_id: j.id,
      resposta: "pendente",
      onda: j.ondaEnviado || 1,
    }));
    return supaFetch("participacoes", {
      method: "POST",
      prefer: "return=minimal",
      body: JSON.stringify(participacoes),
    });
  },

  // Cria jogo no banco e retorna id
  async criarJogo(slot, catDefinida) {
    const [jogo] = await supaFetch("jogos", {
      method: "POST",
      body: JSON.stringify({
        data: slot.data, hora: slot.hora,
        quadra: slot.quadra, genero: slot.genero,
        categoria: catDefinida, status: "ativo",
      }),
    });
    return jogo;
  },
  async getFrequencia() {
    return supaFetch("frequencia_jogadores?select=*&order=jogos_confirmados.desc");
  },
};

// Converte jogador do Supabase para formato do app
function fromDB(j: any) {
  return {
    id: j.id, nome: j.nome, tel: j.telefone,
    g: j.genero, cat: j.categoria, cat2: j.categoria2||null,
    dias: j.dias_pref || [], hrs: j.horas_pref || [],
    aceitaMisto: j.aceita_misto || false,
  };
}


const HORAS = Array.from({length:28},(_,i)=>{
  const h=Math.floor(i/2)+8, m=i%2===0?"00":"30";
  return `${String(h).padStart(2,"0")}:${m}`;
});
const QUADRAS = ["Quadra Ademicon","Quadra Sulita","Quadra 3","Quadra Odontotop"];
const CATS_M   = ["2ª","3ª","4ª","5ª","6ª","Iniciante"];
const CATS_F   = ["3ª","4ª","5ª","6ª","Iniciante"];
const CATS_ALL = ["2ª","3ª","4ª","5ª","6ª","Iniciante"];
const NIVEL    = {"2ª":90,"3ª":75,"4ª":60,"5ª":45,"6ª":30,"Iniciante":15};
const TIMER_MAX = 20;

const CAT_BG  = {"2ª":"#FFE8E8","3ª":"#FFF0DC","4ª":"#FFFACC","5ª":"#DCFAEC","6ª":"#DCF0FF","Iniciante":"#F0DCFF"};
const CAT_FG  = {"2ª":"#B91C1C","3ª":"#92400E","4ª":"#78620A","5ª":"#065F46","6ª":"#1E40AF","Iniciante":"#6B21A8"};
const CAT_BOR = {"2ª":"#FCA5A5","3ª":"#FCD34D","4ª":"#FDE68A","5ª":"#6EE7B7","6ª":"#93C5FD","Iniciante":"#D8B4FE"};

const C = {
  bg:"#F7F8FA", surface:"#FFFFFF", border:"#E2E8F0",
  text:"#1A202C", textSub:"#64748B", textMut:"#94A3B8",
  green:"#059669", greenBg:"#ECFDF5", greenBor:"#6EE7B7",
  red:"#DC2626",   redBg:"#FEF2F2",  redBor:"#FCA5A5",
  yellow:"#D97706",yellowBg:"#FFFBEB",yellowBor:"#FCD34D",
  blue:"#2563EB",  blueBg:"#EFF6FF",
  orange:"#EA580C",orangeBg:"#FFF7ED",
};

const JOGADORES_INIT = [
  {id:1,  nome:"Carlos Silva",    g:"M", cat:"2ª", tel:"11991110001", dias:["Seg","Qua","Sex"], hrs:["08:00","09:00"],        aceitaMisto:false},
  {id:2,  nome:"Roberto Lima",    g:"M", cat:"2ª", tel:"11991110002", dias:["Seg","Qua"],        hrs:["08:00","09:00"],        aceitaMisto:true},
  {id:3,  nome:"André Costa",     g:"M", cat:"3ª", tel:"11991110003", dias:["Ter","Qui","Sáb"],  hrs:["10:00","19:00","20:00"],aceitaMisto:false},
  {id:4,  nome:"Fábio Ramos",     g:"M", cat:"3ª", tel:"11991110004", dias:["Qua","Sex"],         hrs:["08:00","19:00"],        aceitaMisto:true},
  {id:5,  nome:"Marcelo Souza",   g:"M", cat:"4ª", tel:"11991110005", dias:["Seg","Ter","Qui"],   hrs:["12:00","20:00"],        aceitaMisto:false},
  {id:6,  nome:"Paulo Mendes",    g:"M", cat:"4ª", tel:"11991110006", dias:["Sex","Sáb"],          hrs:["09:00","10:00"],        aceitaMisto:true},
  {id:7,  nome:"Lucas Ferreira",  g:"M", cat:"5ª", tel:"11991110007", dias:["Qua","Sex","Dom"],   hrs:["18:00","19:00"],        aceitaMisto:true},
  {id:8,  nome:"Diego Alves",     g:"M", cat:"5ª", tel:"11991110008", dias:["Ter","Qui"],          hrs:["20:00","21:00"],        aceitaMisto:false},
  {id:9,  nome:"Thiago Nunes",    g:"M", cat:"6ª", tel:"11991110009", dias:["Sáb","Dom"],          hrs:["09:00","10:00"],        aceitaMisto:true},
  {id:10, nome:"Bruno Pinto",     g:"M", cat:"Iniciante",tel:"11991110010",dias:["Sáb"],           hrs:["10:00"],               aceitaMisto:false},
  {id:11, nome:"Ana Paula",       g:"F", cat:"3ª", tel:"11991110011", dias:["Ter","Qui","Sáb"],  hrs:["09:00","10:00","11:00"],aceitaMisto:true},
  {id:12, nome:"Carla Matos",     g:"F", cat:"3ª", tel:"11991110012", dias:["Seg","Qua"],          hrs:["10:00","11:00"],        aceitaMisto:false},
  {id:13, nome:"Juliana Torres",  g:"F", cat:"4ª", tel:"11991110013", dias:["Ter","Sex"],          hrs:["08:00","19:00"],        aceitaMisto:true},
  {id:14, nome:"Fernanda Lima",   g:"F", cat:"4ª", tel:"11991110014", dias:["Qua","Sáb"],          hrs:["10:00","20:00"],        aceitaMisto:true},
  {id:15, nome:"Patrícia Gomes",  g:"F", cat:"5ª", tel:"11991110015", dias:["Seg","Qua","Sex"],   hrs:["19:00","20:00"],        aceitaMisto:true},
  {id:16, nome:"Sandra Rocha",    g:"F", cat:"6ª", tel:"11991110016", dias:["Sáb","Dom"],          hrs:["09:00","10:00"],        aceitaMisto:false},
];

// ─── UTILS ───────────────────────────────────────────────────────────────────
function fmtData(iso){if(!iso)return"";const[y,m,d]=iso.split("-");return`${d}/${m}/${y}`;}
function diaSemana(iso){if(!iso)return"";return["Dom","Seg","Ter","Qua","Qui","Sex","Sáb"][new Date(iso+"T12:00:00").getDay()];}
function fmtTempo(s){const m=Math.floor(s/60),sec=s%60;return`${String(m).padStart(2,"0")}:${String(sec).padStart(2,"0")}`;}
function scoreJogador(j,dn,hr){let s=0;if(j.dias.includes(dn))s+=50;if(j.hrs.includes(hr))s+=50;return s;}

function filtrarCandidatos(jogadores,genero,catsAlvo,dn,hr){
  return jogadores.filter(j=>{
    if(genero==="M"&&j.g!=="M")return false;
    if(genero==="F"&&j.g!=="F")return false;
    if(genero==="Misto"&&!j.aceitaMisto)return false;
    if(catsAlvo.length>0){
      // aceita se cat principal OU cat2 estiver no filtro
      const temCat=catsAlvo.includes(j.cat)||(j.cat2&&catsAlvo.includes(j.cat2));
      if(!temCat) return false;
    }
    return true;
  }).map(j=>({...j,score:scoreJogador(j,dn,hr)})).sort((a,b)=>b.score-a.score);
}

function melhorDuplas(g4){
  const opts=[[[g4[0],g4[1]],[g4[2],g4[3]]],[[g4[0],g4[2]],[g4[1],g4[3]]]];
  return opts.reduce((best,[d1,d2])=>{
    const diff=Math.abs((NIVEL[d1[0].cat]+NIVEL[d1[1].cat])/2-(NIVEL[d2[0].cat]+NIVEL[d2[1].cat])/2);
    const sc=Math.round(100-diff);
    return sc>best.sc?{sc,d1,d2}:best;
  },{sc:-1,d1:[],d2:[]});
}

function buildMsgConvite(j,slot,confirmados,remetente="Gabi da Profit"){
  const ds=diaSemana(slot.data);
  const nome=j.nome.split(" ")[0];
  let linhaConf="";
  if(confirmados.length===1){
    linhaConf=`\n*${confirmados[0].nome.split(" ")[0]}* já confirmou.`;
  } else if(confirmados.length>=2){
    const nomes=confirmados.map(c=>c.nome.split(" ")[0]);
    const ultimo=nomes.pop();
    linhaConf=`\n*${nomes.join(", ")}* e *${ultimo}* já confirmaram.`;
  }
  return `Oi, ${nome}! ${remetente} aqui, tudo bem?! 🎾\n\nTenho um jogo para você:\n\n📅 *${ds}-feira, ${fmtData(slot.data)}*\n🕐 *${slot.hora}*\n🏟️ *${slot.quadra}*${linhaConf}\n\nVocê topa? Responda *SIM* ou *NÃO* 🎾`;
}

function buildMsgAgradecimento(j, remetente="Gabi da Profit"){
  const nome=j.nome.split(" ")[0];
  return `Oi, ${nome}! Tudo bem 😊\n\nObrigada pela resposta! Te aviso no próximo jogo 🎾\n\n_${remetente}_`;
}

function buildMsgFechado(d1,d2,slot){
  const ds=diaSemana(slot.data);
  const todos=[...(d1||[]),...(d2||[])];
  return `🎾 *JOGO CONFIRMADO!*\n\n📅 ${ds}-feira, ${fmtData(slot.data)}\n🕐 ${slot.hora}\n🏟️ ${slot.quadra}\n\n${todos.map(j=>`• ${j.nome}`).join("\n")}`;
}

// ─── ATOMS ───────────────────────────────────────────────────────────────────
function Avatar({nome,size=34,g,highlight}){
  const gc=g==="F"?"#BE185D":g==="M"?"#1D4ED8":"#92400E";
  const bg=g==="F"?"#FCE7F3":g==="M"?"#DBEAFE":"#FEF3C7";
  return <div style={{width:size,height:size,borderRadius:"50%",flexShrink:0,
    background:highlight?gc:bg,border:`2px solid ${highlight?gc:C.border}`,
    display:"flex",alignItems:"center",justifyContent:"center",
    fontSize:size*.38,fontWeight:700,color:highlight?"#fff":gc,transition:"all .3s"}}>{nome[0]}</div>;
}
function CatPill({cat,size=10}){
  return <span style={{background:CAT_BG[cat],color:CAT_FG[cat],border:`1px solid ${CAT_BOR[cat]}`,
    fontSize:size,fontWeight:700,padding:"2px 7px",borderRadius:99,whiteSpace:"nowrap"}}>{cat}</span>;
}
function GenBadge({g}){
  const cfg={M:{c:"#1D4ED8",l:"♂"},F:{c:"#BE185D",l:"♀"},Misto:{c:"#92400E",l:"⚤"},Todos:{c:"#374151",l:"👥"}};
  const{c,l}=cfg[g]||cfg.M;
  return <span style={{color:c,fontSize:11,fontWeight:700}}>{l}</span>;
}
function ScoreDot({score}){
  const c=score>=80?C.green:score>=50?C.yellow:C.textMut;
  return <div style={{display:"flex",alignItems:"center",gap:4}}>
    <div style={{width:5,height:5,borderRadius:"50%",background:c,flexShrink:0}}/>
    <div style={{width:28,height:3,background:C.border,borderRadius:2,overflow:"hidden"}}>
      <div style={{width:`${score}%`,height:"100%",background:c,borderRadius:2}}/>
    </div>
    <span style={{fontSize:9,color:c,fontWeight:600}}>{score===100?"dia+hora":score===50?"dia ok":"fora"}</span>
  </div>;
}
function Chip({children,active,onClick,color,disabled}){
  const col=color||C.green;
  return <button onClick={!disabled?onClick:undefined} style={{
    background:active?col+"18":"#fff",border:`1.5px solid ${active?col:C.border}`,
    color:active?col:C.textSub,borderRadius:99,padding:"5px 12px",fontSize:11,fontWeight:600,
    cursor:disabled?"default":"pointer",fontFamily:"inherit",transition:"all .15s",
    whiteSpace:"nowrap",opacity:disabled?.4:1}}>{children}</button>;
}
function Btn({children,onClick,variant="primary",disabled,style={}}){
  const v={
    primary:{background:C.green,color:"#fff",padding:"11px 20px",fontSize:13,opacity:disabled?.4:1},
    ghost:{background:"#fff",border:`1.5px solid ${C.border}`,color:C.textSub,padding:"9px 14px",fontSize:12},
    danger:{background:"#fff",border:`1.5px solid ${C.red}`,color:C.red,padding:"7px 12px",fontSize:12},
    orange:{background:C.orange,color:"#fff",padding:"9px 16px",fontSize:12,opacity:disabled?.4:1},
  };
  return <button onClick={!disabled?onClick:undefined} style={{
    border:"none",cursor:disabled?"not-allowed":"pointer",fontFamily:"inherit",
    fontWeight:700,borderRadius:10,transition:"all .18s",...v[variant],...style}}>{children}</button>;
}
function StatusPill({status}){
  const cfg={
    pendente:   {c:C.yellow,  bg:C.yellowBg, i:"⏳",l:"Aguardando"},
    confirmado: {c:C.green,   bg:C.greenBg,  i:"✅",l:"Confirmado"},
    recusou:    {c:C.red,     bg:C.redBg,    i:"❌",l:"Recusou"},
    expirado:   {c:C.textMut, bg:"#F8FAFC",  i:"⌛",l:"Sem resposta"},
    aguardando: {c:C.textMut, bg:"#F8FAFC",  i:"🔜",l:"Na fila"},
    interessado:{c:"#7C3AED", bg:"#F5F3FF",  i:"🙋",l:"Interessado"},
    excluido_cat:{c:C.textMut,bg:"#F8FAFC",  i:"🚫",l:"Cat. diferente"},
  };
  const{c,bg,i,l}=cfg[status]||cfg.aguardando;
  return <span style={{fontSize:10,color:c,fontWeight:700,background:bg,
    border:`1px solid ${c}33`,borderRadius:99,padding:"3px 8px",whiteSpace:"nowrap"}}>{i} {l}</span>;
}
function SLabel({label,color}){
  return <div style={{fontSize:10,color:color||C.textMut,fontWeight:700,
    textTransform:"uppercase",letterSpacing:.9,marginTop:10,marginBottom:5}}>{label}</div>;
}
function TimerRing({seg,total,size=54}){
  const r=(size-6)/2,circ=2*Math.PI*r,pct=Math.max(0,seg/total);
  const col=pct>.5?C.green:pct>.25?C.yellow:C.red;
  return <div style={{position:"relative",width:size,height:size,flexShrink:0}}>
    <svg width={size} height={size} style={{transform:"rotate(-90deg)"}}>
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={C.border} strokeWidth={4}/>
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={col} strokeWidth={4}
        strokeDasharray={circ} strokeDashoffset={circ*(1-pct)} strokeLinecap="round"
        style={{transition:"stroke-dashoffset 1s linear,stroke .4s"}}/>
    </svg>
    <div style={{position:"absolute",inset:0,display:"flex",flexDirection:"column",
      alignItems:"center",justifyContent:"center"}}>
      <span style={{fontSize:11,fontWeight:700,color:col,lineHeight:1}}>{fmtTempo(seg)}</span>
      <span style={{fontSize:7,color:C.textMut,marginTop:1}}>ONDA</span>
    </div>
  </div>;
}

// ─── MSG MODAL ────────────────────────────────────────────────────────────────
function MsgModal({titulo,texto,tel,onClose,fireToast}){
  const[ok,setOk]=useState(false);
  function copiar(){navigator.clipboard.writeText(texto).then(()=>{setOk(true);fireToast("Copiado! 📋");setTimeout(()=>setOk(false),2000);});}
  return <div onClick={onClose} style={{position:"fixed",inset:0,background:"rgba(0,0,0,.4)",
    zIndex:300,display:"flex",alignItems:"center",justifyContent:"center",padding:16}}>
    <div onClick={e=>e.stopPropagation()} style={{background:"#fff",borderRadius:16,padding:22,
      width:"100%",maxWidth:480,maxHeight:"90vh",overflowY:"auto",boxShadow:"0 20px 60px rgba(0,0,0,.15)"}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
        <h3 style={{fontSize:15,fontWeight:700,color:"#25D366"}}>📱 {titulo}</h3>
        <button onClick={onClose} style={{background:"none",border:"none",cursor:"pointer",color:C.textMut,fontSize:20}}>✕</button>
      </div>
      {tel&&<div style={{fontSize:11,color:C.textSub,marginBottom:10}}>Para: <strong style={{color:C.text}}>{tel}</strong></div>}
      <div style={{background:C.bg,border:`1px solid ${C.border}`,borderRadius:10,padding:"12px 14px",
        fontSize:12,lineHeight:1.75,whiteSpace:"pre-wrap",color:C.text,marginBottom:14,
        fontFamily:"monospace",maxHeight:260,overflowY:"auto"}}>{texto}</div>
      <div style={{display:"flex",gap:8}}>
        <button onClick={copiar} style={{flex:1,border:ok?`1.5px solid ${C.green}`:"none",cursor:"pointer",
          fontFamily:"inherit",fontWeight:700,borderRadius:10,fontSize:13,padding:"11px 0",
          background:ok?"#fff":"#25D366",color:ok?C.green:"#fff",transition:"all .2s"}}>
          {ok?"✅ Copiado!":"📋 Copiar mensagem"}
        </button>
        <Btn variant="ghost" onClick={onClose}>Fechar</Btn>
      </div>
    </div>
  </div>;
}

// ─── ALERTA OPERADOR ─────────────────────────────────────────────────────────
function AlertaOperador({alerta,onClose,onNovoSlot}){
  const{jogador,slot}=alerta;
  return <div onClick={onClose} style={{position:"fixed",inset:0,background:"rgba(0,0,0,.45)",
    zIndex:300,display:"flex",alignItems:"center",justifyContent:"center",padding:16}}>
    <div onClick={e=>e.stopPropagation()} style={{background:"#fff",borderRadius:16,padding:24,
      width:"100%",maxWidth:440,boxShadow:"0 20px 60px rgba(0,0,0,.18)"}}>
      <div style={{fontSize:28,textAlign:"center",marginBottom:12}}>⚠️</div>
      <h3 style={{fontSize:16,fontWeight:700,color:C.text,textAlign:"center",marginBottom:8}}>Jogo já fechado!</h3>
      <div style={{background:C.yellowBg,border:`1px solid ${C.yellowBor}`,borderRadius:10,
        padding:"12px 14px",marginBottom:16,fontSize:13,color:C.text,lineHeight:1.6}}>
        <strong>{jogador.nome}</strong> respondeu <strong>SIM</strong> mas o jogo já estava fechado.<br/><br/>
        📅 {diaSemana(slot.data)}, {fmtData(slot.data)} · {slot.hora} · {slot.quadra}<br/><br/>
        Há outro horário ou quadra disponível para este jogador?
      </div>
      <div style={{display:"flex",gap:8}}>
        <button onClick={onNovoSlot} style={{flex:1,background:C.green,color:"#fff",border:"none",
          borderRadius:10,padding:"11px 0",fontSize:13,fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>
          ✅ Criar novo jogo
        </button>
        <button onClick={onClose} style={{background:"#fff",border:`1.5px solid ${C.border}`,color:C.textSub,
          borderRadius:10,padding:"11px 16px",fontSize:13,fontWeight:600,cursor:"pointer",fontFamily:"inherit"}}>
          Não
        </button>
      </div>
    </div>
  </div>;
}

// ─── CAND ROW ─────────────────────────────────────────────────────────────────
function CandRow({j,onSim,onNao,onMsg,slot,confirmados=[],remetente=""}){
  return <div style={{display:"flex",alignItems:"center",gap:8,padding:"9px 12px",
    borderRadius:10,background:"#fff",border:`1.5px solid ${onSim?C.yellowBg:C.border}`,
    marginBottom:5,flexWrap:"wrap",transition:"border .2s"}}>
    <Avatar nome={j.nome} size={30} g={j.g} highlight={j.status==="confirmado"}/>
    <div style={{flex:1,minWidth:90}}>
      <div style={{display:"flex",alignItems:"center",gap:5,marginBottom:2,flexWrap:"wrap"}}>
        <span style={{fontWeight:600,fontSize:12,color:C.text}}>{j.nome}</span>
        <GenBadge g={j.g}/>
      </div>
      <div style={{display:"flex",gap:4,alignItems:"center",flexWrap:"wrap"}}>
        <CatPill cat={j.cat}/>
        <ScoreDot score={j.score||0}/>
        {j.ondaEnviado&&<span style={{fontSize:9,color:C.textMut,fontWeight:600}}>Onda {j.ondaEnviado}</span>}
      </div>
    </div>
    <StatusPill status={j.status}/>
    <div style={{display:"flex",gap:4,flexShrink:0}}>
      <button onClick={()=>onMsg({titulo:`Convite — ${j.nome.split(" ")[0]}`,
        texto:buildMsgConvite(j,slot,confirmados,remetente),tel:j.tel})}
        style={{background:"#fff",border:`1px solid ${C.border}`,borderRadius:7,
          padding:"4px 8px",cursor:"pointer",fontSize:12,color:C.textSub,fontFamily:"inherit",fontWeight:600}}>📋</button>
      {onSim&&<>
        <button onClick={onSim} style={{background:C.greenBg,border:`1px solid ${C.greenBor}`,
          borderRadius:7,padding:"4px 10px",cursor:"pointer",fontSize:11,color:C.green,fontFamily:"inherit",fontWeight:700}}>SIM</button>
        <button onClick={onNao} style={{background:C.redBg,border:`1px solid ${C.redBor}`,
          borderRadius:7,padding:"4px 10px",cursor:"pointer",fontSize:11,color:C.red,fontFamily:"inherit",fontWeight:700}}>NÃO</button>
      </>}
    </div>
  </div>;
}

// ─── JOGO CARD (resumo no dashboard) ─────────────────────────────────────────
function JogoCard({jogo,isAtivo,onClick,onFechar}){
  const conf=jogo.fila.filter(j=>j.status==="confirmado").length;
  const pend=jogo.fila.filter(j=>j.status==="pendente").length;
  const fechado=jogo.status==="fechado";
  const semCandidatos=jogo.status==="sem_candidatos";

  const borderColor=fechado?C.green:semCandidatos?C.red:isAtivo?"#2563EB":C.border;
  const statusColor=fechado?C.green:semCandidatos?C.red:pend>0?C.yellow:C.textMut;
  const statusLabel=fechado?"✅ Fechado":semCandidatos?"⚠️ Sem candidatos":pend>0?`⏳ ${pend} aguardando`:"⏸ Pausado";

  return <div onClick={onClick} style={{background:"#fff",border:`2px solid ${borderColor}`,
    borderRadius:14,padding:"14px 16px",cursor:"pointer",transition:"all .2s",
    boxShadow:isAtivo?"0 4px 20px rgba(37,99,235,.12)":"none",
    background:isAtivo?"#F0F7FF":"#fff"}}>
    <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:8,marginBottom:10}}>
      <div style={{flex:1,minWidth:0}}>
        <div style={{fontWeight:700,fontSize:13,color:C.text,marginBottom:3}}>
          {jogo.slot.hora} · {jogo.slot.quadra}
        </div>
        <div style={{fontSize:11,color:C.textSub}}>
          {diaSemana(jogo.slot.data)}, {fmtData(jogo.slot.data)}
          {jogo.catDefinida&&<span style={{marginLeft:6,fontWeight:600,color:CAT_FG[jogo.catDefinida]}}>{jogo.catDefinida}</span>}
        </div>
      </div>
      <div style={{display:"flex",alignItems:"center",gap:6}}>
        {!fechado&&!semCandidatos&&<TimerRing seg={jogo.timer} total={TIMER_MAX} size={46}/>}
        <button onClick={e=>{e.stopPropagation();onFechar();}} style={{background:"none",border:"none",
          cursor:"pointer",color:C.textMut,fontSize:16,padding:"2px 4px",lineHeight:1}}>✕</button>
      </div>
    </div>

    {/* barra confirmados */}
    <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:8}}>
      <div style={{flex:1,height:6,background:C.bg,borderRadius:3,overflow:"hidden"}}>
        <div style={{width:`${conf*25}%`,height:"100%",background:C.green,borderRadius:3,transition:"width .4s"}}/>
      </div>
      <span style={{fontSize:12,fontWeight:700,color:conf===4?C.green:C.text,flexShrink:0}}>{conf}/4</span>
    </div>

    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
      <span style={{fontSize:11,color:statusColor,fontWeight:600}}>{statusLabel}</span>
      <span style={{fontSize:11,color:isAtivo?C.blue:C.textMut,fontWeight:600}}>
        {isAtivo?"▼ aberto":"▶ ver"}
      </span>
    </div>
  </div>;
}

// ─── CASCATA PANEL ────────────────────────────────────────────────────────────
function CascataPanel({jogo,onResponder,onMsg,remetente,onAtualizar}){
  const conf=jogo.fila.filter(j=>j.status==="confirmado");
  const pend=jogo.fila.filter(j=>j.status==="pendente");
  const recus=jogo.fila.filter(j=>j.status==="recusou"||j.status==="expirado");
  const fila=jogo.fila.filter(j=>j.status==="aguardando");
  const excl=jogo.fila.filter(j=>j.status==="excluido_cat");
  const inter=jogo.fila.filter(j=>j.status==="interessado");
  const fechado=jogo.status==="fechado";

  return <div style={{marginTop:12}}>
    {/* onda info */}
    {!fechado&&<div style={{background:C.greenBg,border:`1px solid ${C.greenBor}`,
      borderRadius:10,padding:"10px 14px",marginBottom:12,
      display:"flex",alignItems:"center",gap:10,flexWrap:"wrap"}}>
      <div style={{flex:1}}>
        <div style={{fontWeight:700,fontSize:13,color:C.text}}>Onda {jogo.ondaAtual} em andamento</div>
        <div style={{fontSize:11,color:C.textSub}}>{pend.length} aguardando · {conf.length}/4 confirmados · {fila.length} na fila</div>
      </div>
      <button onClick={onAtualizar} style={{background:"#fff",border:`1px solid ${C.greenBor}`,
        borderRadius:8,padding:"6px 12px",cursor:"pointer",fontSize:11,
        color:C.green,fontFamily:"inherit",fontWeight:700}}>
        🔄 Atualizar
      </button>
      <div style={{fontSize:22,fontWeight:700,color:C.green}}>{conf.length}<span style={{color:C.textMut,fontSize:16}}>/4</span></div>
    </div>}

    {/* confirmados destaque */}
    {conf.length>0&&!fechado&&<div style={{background:"#fff",border:`1px solid ${C.border}`,
      borderRadius:10,padding:"10px 12px",marginBottom:10}}>
      <div style={{fontSize:10,color:C.textMut,fontWeight:700,textTransform:"uppercase",letterSpacing:.9,marginBottom:6}}>Confirmados</div>
      <div style={{display:"flex",gap:5,flexWrap:"wrap"}}>
        {conf.map(j=><span key={j.id} style={{display:"inline-flex",alignItems:"center",gap:4,
          background:C.greenBg,color:C.green,borderRadius:99,padding:"3px 10px",
          fontSize:12,fontWeight:600,border:`1px solid ${C.greenBor}`}}>✅ {j.nome.split(" ")[0]}</span>)}
      </div>
    </div>}

    {/* duplas (fechado) */}
    {fechado&&jogo.dupla1&&<div style={{background:"#fff",border:`1.5px solid ${C.greenBor}`,
      borderRadius:12,padding:14,marginBottom:12}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
        <div style={{fontSize:10,color:C.green,fontWeight:700,textTransform:"uppercase",letterSpacing:.9}}>
          Duplas · Equilíbrio {jogo.scoreEquilibrio}pts
        </div>
        <span style={{fontSize:10,background:C.yellowBg,color:C.yellow,border:`1px solid ${C.yellowBor}`,
          borderRadius:99,padding:"2px 8px",fontWeight:600}}>Uso interno</span>
      </div>
      <div style={{display:"grid",gridTemplateColumns:"1fr auto 1fr",gap:8,alignItems:"center",marginBottom:12}}>
        {[jogo.dupla1,jogo.dupla2].map((dupla,di)=><div key={di} style={{background:C.bg,borderRadius:8,padding:"9px 12px"}}>
          <div style={{fontSize:9,color:C.green,fontWeight:700,textTransform:"uppercase",letterSpacing:.9,marginBottom:6}}>Dupla {di+1}</div>
          {dupla.map(j=><div key={j.id} style={{display:"flex",alignItems:"center",gap:6,marginBottom:5}}>
            <Avatar nome={j.nome} size={24} g={j.g} highlight/>
            <div><div style={{fontSize:11,fontWeight:600,color:C.text}}>{j.nome}</div>
              <div style={{display:"flex",gap:3}}><CatPill cat={j.cat} size={9}/><GenBadge g={j.g}/></div>
            </div>
          </div>)}
        </div>)}
        <div style={{fontWeight:700,fontSize:15,color:C.textMut,textAlign:"center"}}>VS</div>
      </div>
      <Btn variant="ghost" style={{width:"100%",color:"#25D366",borderColor:"#25D366"}}
        onClick={()=>onMsg({titulo:"Jogo Fechado — Enviar para todos",
          texto:buildMsgFechado(jogo.dupla1,jogo.dupla2,jogo.slot)})}>
        📋 Copiar mensagem de confirmação
      </Btn>
    </div>}

    {/* listas */}
    {conf.length>0&&<SLabel label={`✅ Confirmados (${conf.length}/4)`} color={C.green}/>}
    {conf.map(j=><CandRow key={j.id} j={j} onMsg={onMsg} slot={jogo.slot} confirmados={conf} remetente={remetente}/>)}
    {pend.length>0&&<SLabel label={`⏳ Aguardando — Onda ${jogo.ondaAtual}`} color={C.yellow}/>}
    {pend.map(j=><CandRow key={j.id} j={j} onMsg={onMsg} slot={jogo.slot} confirmados={conf} remetente={remetente}
      onSim={()=>onResponder(jogo.id,j.id,"sim")}
      onNao={()=>{
        onResponder(jogo.id,j.id,"nao");
        setTimeout(()=>onMsg({
          titulo:`Agradecimento — ${j.nome.split(" ")[0]}`,
          texto:buildMsgAgradecimento(j,remetente),
          tel:j.tel
        }),200);
      }}/>)}
    {recus.length>0&&<SLabel label={`❌ Recusaram / Sem resposta (${recus.length})`} color={C.textMut}/>}
    {recus.map(j=><CandRow key={j.id} j={j} onMsg={onMsg} slot={jogo.slot} confirmados={conf} remetente={remetente}/>)}
    {fila.length>0&&<SLabel label={`🔜 Na fila (${fila.length})`} color={C.textMut}/>}
    {fila.map(j=><CandRow key={j.id} j={j} onMsg={onMsg} slot={jogo.slot} confirmados={conf} remetente={remetente}/>)}
    {excl.length>0&&<><SLabel label="🚫 Excluídos — categoria diferente" color={C.textMut}/>
      {excl.map(j=><CandRow key={j.id} j={j} onMsg={onMsg} slot={jogo.slot} confirmados={conf} remetente={remetente}/>)}</>}
    {inter.length>0&&<><SLabel label="🙋 Interessados após fechamento" color="#7C3AED"/>
      {inter.map(j=><CandRow key={j.id} j={j} onMsg={onMsg} slot={jogo.slot} confirmados={conf} remetente={remetente}/>)}</>}
  </div>;
}

// ─── FORM NOVO JOGO ───────────────────────────────────────────────────────────
function FormNovoJogo({jogadores,remetente,onDispararCascata,onCancelar}){
  const [slot,setSlot]=useState({data:"",hora:"",quadra:"",genero:"Todos",catsAlvo:[]});
  const [preConf,setPreConf]=useState([]);
  const today=new Date().toISOString().split("T")[0];
  const diaNome=diaSemana(slot.data);
  const candidatos=useMemo(()=>slot.data&&slot.hora
    ?filtrarCandidatos(jogadores,slot.genero,slot.catsAlvo,diaNome,slot.hora):[]
    ,[jogadores,slot.genero,slot.catsAlvo,diaNome,slot.data,slot.hora]);
  const vagasAbertas=4-preConf.length;
  const candSemPreConf=candidatos.filter(j=>!preConf.includes(j.id));
  const slotOk=slot.data&&slot.hora&&slot.quadra&&candidatos.length>0&&
    (preConf.length===4||candSemPreConf.length>=Math.max(1,vagasAbertas));
  const inp={background:"#fff",border:`1.5px solid ${C.border}`,borderRadius:9,
    padding:"8px 12px",color:C.text,fontFamily:"inherit",fontSize:13,
    width:"100%",outline:"none",boxSizing:"border-box",minWidth:0,maxWidth:"100%"};

  function toggleCat(c){setSlot(s=>({...s,catsAlvo:s.catsAlvo.includes(c)?s.catsAlvo.filter(x=>x!==c):[...s.catsAlvo,c]}));}

  function disparar(){
    const idsPreConf=new Set(preConf);
    const jaConf=candidatos.filter(j=>idsPreConf.has(j.id))
      .map(j=>({...j,status:"confirmado",ondaEnviado:null,respostaEm:"Pré-confirmado"}));
    const fila=candidatos.filter(j=>!idsPreConf.has(j.id))
      .map((j,i)=>({...j,ordem:i,status:i<8?"pendente":"aguardando",ondaEnviado:i<8?1:null,respostaEm:null}));
    onDispararCascata({slot,jaConf,fila,preConf});
  }

  return <div style={{background:"#fff",border:`1.5px solid ${C.blue}`,borderRadius:16,
    padding:18,marginBottom:16,boxShadow:"0 4px 20px rgba(37,99,235,.08)"}}>
    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
      <h3 style={{fontSize:15,fontWeight:700,color:C.text}}>➕ Novo Jogo</h3>
      {onCancelar&&<button onClick={onCancelar} style={{background:"none",border:"none",cursor:"pointer",color:C.textMut,fontSize:18}}>✕</button>}
    </div>

    {/* slot */}
    <div style={{display:"flex",flexDirection:"column",gap:8,marginBottom:8}}>
      <div>
        <div style={{fontSize:10,color:C.textSub,fontWeight:700,textTransform:"uppercase",letterSpacing:.8,marginBottom:4}}>Data</div>
        <input
          type="date"
          min={today}
          style={{...inp, display:"block", width:"100%", maxWidth:"100%", minWidth:0,
            WebkitAppearance:"none", appearance:"none"}}
          value={slot.data}
          onChange={e=>setSlot(s=>({...s,data:e.target.value}))}
        />
        {slot.data&&<div style={{fontSize:10,color:C.green,marginTop:3,fontWeight:600}}>{diaSemana(slot.data)}-feira</div>}
      </div>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
        <div>
          <div style={{fontSize:10,color:C.textSub,fontWeight:700,textTransform:"uppercase",letterSpacing:.8,marginBottom:4}}>Horário</div>
          <select style={inp} value={slot.hora} onChange={e=>setSlot(s=>({...s,hora:e.target.value}))}>
            <option value="">Selecione...</option>
            {HORAS.map(h=><option key={h}>{h}</option>)}
          </select>
        </div>
        <div>
          <div style={{fontSize:10,color:C.textSub,fontWeight:700,textTransform:"uppercase",letterSpacing:.8,marginBottom:4}}>Quadra</div>
          <select style={inp} value={slot.quadra} onChange={e=>setSlot(s=>({...s,quadra:e.target.value}))}>
            <option value="">Selecione...</option>
            {QUADRAS.map(q=><option key={q} value={q}>{q}</option>)}
          </select>
        </div>
      </div>
    </div>

    {/* genero */}
    <div style={{display:"flex",gap:6,flexWrap:"wrap",marginBottom:10,alignItems:"center"}}>
      <span style={{fontSize:10,color:C.textMut,fontWeight:700,textTransform:"uppercase",letterSpacing:.8}}>Gênero:</span>
      {[{v:"Todos",l:"👥 Todos",c:"#374151"},{v:"M",l:"♂ Masc.",c:"#1D4ED8"},{v:"F",l:"♀ Fem.",c:"#BE185D"},{v:"Misto",l:"⚤ Misto",c:"#92400E"}].map(({v,l,c})=>(
        <button key={v} onClick={()=>setSlot(s=>({...s,genero:v,catsAlvo:[]}))} style={{
          background:slot.genero===v?c+"18":"#fff",border:`1.5px solid ${slot.genero===v?c:C.border}`,
          color:slot.genero===v?c:C.textSub,borderRadius:99,padding:"4px 12px",cursor:"pointer",
          fontFamily:"inherit",fontWeight:600,fontSize:11,transition:"all .15s"}}>{l}</button>
      ))}
    </div>

    {/* categorias */}
    <div style={{marginBottom:10}}>
      <div style={{fontSize:10,color:C.textSub,fontWeight:700,textTransform:"uppercase",letterSpacing:.8,marginBottom:6}}>
        Categoria(s) alvo
        <span style={{color:C.textMut,fontWeight:400,textTransform:"none",letterSpacing:0,marginLeft:6}}>
          — {slot.catsAlvo.length===0?"definida pelo 1º que aceitar":`${slot.catsAlvo.length} selecionada(s)`}
        </span>
      </div>
      <div style={{display:"flex",gap:5,flexWrap:"wrap"}}>
        {(slot.genero==="F"?CATS_F:CATS_ALL).map(c=>(
          <button key={c} onClick={()=>toggleCat(c)} style={{
            background:slot.catsAlvo.includes(c)?CAT_BG[c]:"#fff",
            border:`1.5px solid ${slot.catsAlvo.includes(c)?CAT_BOR[c]:C.border}`,
            color:slot.catsAlvo.includes(c)?CAT_FG[c]:C.textSub,
            borderRadius:99,padding:"4px 12px",cursor:"pointer",fontFamily:"inherit",
            fontWeight:700,fontSize:11,transition:"all .15s"}}>
            {slot.catsAlvo.includes(c)?"✓ ":""}{c}
          </button>
        ))}
        {slot.catsAlvo.length>0&&<button onClick={()=>setSlot(s=>({...s,catsAlvo:[]}))} style={{
          background:"#fff",border:`1.5px solid ${C.redBor}`,color:C.red,
          borderRadius:99,padding:"4px 12px",cursor:"pointer",fontFamily:"inherit",fontWeight:600,fontSize:11}}>✕</button>}
      </div>
    </div>

    {/* ranking + pré-confirmar */}
    {candidatos.length>0&&<div style={{marginBottom:12}}>
      <div style={{fontSize:10,color:C.textMut,fontWeight:700,textTransform:"uppercase",letterSpacing:.8,marginBottom:8}}>
        Ranking — {candidatos.length} candidato(s)
        {preConf.length>0&&<span style={{color:C.green,marginLeft:8}}>· {preConf.length} pré-confirmado(s)</span>}
      </div>
      <div style={{display:"flex",flexDirection:"column",gap:4,maxHeight:280,overflowY:"auto"}}>
        {candidatos.slice(0,16).map((j,i)=>{
          const isPre=preConf.includes(j.id);
          return <div key={j.id} style={{display:"flex",alignItems:"center",gap:8,
            padding:"7px 10px",borderRadius:9,background:"#fff",
            border:`1.5px solid ${isPre?C.greenBor:C.border}`}}>
            <div style={{fontSize:10,color:C.textMut,fontWeight:700,width:16,textAlign:"right",flexShrink:0}}>#{i+1}</div>
            <Avatar nome={j.nome} size={28} g={j.g} highlight={isPre}/>
            <div style={{flex:1,minWidth:0}}>
              <div style={{fontSize:12,fontWeight:600,color:C.text}}>{j.nome}</div>
              <div style={{display:"flex",gap:4,alignItems:"center"}}><CatPill cat={j.cat} size={9}/><ScoreDot score={j.score}/></div>
            </div>
            <button onClick={()=>setPreConf(p=>p.includes(j.id)?p.filter(x=>x!==j.id):p.length<3?[...p,j.id]:p)}
              style={{fontSize:10,fontWeight:700,borderRadius:99,padding:"3px 9px",
                cursor:(!isPre&&preConf.length>=3)?"not-allowed":"pointer",
                border:`1.5px solid ${isPre?C.green:C.border}`,
                background:isPre?C.greenBg:"#fff",color:isPre?C.green:C.textSub,
                fontFamily:"inherit",whiteSpace:"nowrap",transition:"all .15s"}}>
              {isPre?"✅ Conf.":"+ Pré-conf."}
            </button>
          </div>;
        })}
      </div>
    </div>}

    {/* resumo pré-confirmados */}
    {preConf.length>0&&<div style={{background:C.greenBg,border:`1px solid ${C.greenBor}`,
      borderRadius:10,padding:"10px 12px",marginBottom:12}}>
      <div style={{fontSize:11,color:C.green,fontWeight:700,marginBottom:6}}>
        ✅ {preConf.length} já confirmado(s) · faltam {vagasAbertas} vaga(s)
      </div>
      <div style={{display:"flex",gap:5,flexWrap:"wrap"}}>
        {candidatos.filter(j=>preConf.includes(j.id)).map(j=>(
          <span key={j.id} style={{display:"inline-flex",alignItems:"center",gap:4,
            background:"#fff",color:C.green,borderRadius:99,padding:"3px 10px",
            fontSize:11,fontWeight:600,border:`1px solid ${C.greenBor}`}}>
            {j.nome.split(" ")[0]}
            <button onClick={()=>setPreConf(p=>p.filter(x=>x!==j.id))} style={{background:"none",
              border:"none",cursor:"pointer",color:C.textMut,fontSize:13,lineHeight:1,padding:0}}>×</button>
          </span>
        ))}
      </div>
    </div>}

    <button onClick={disparar} disabled={!slotOk} style={{width:"100%",padding:12,fontSize:14,
      fontWeight:700,borderRadius:10,border:"none",cursor:slotOk?"pointer":"not-allowed",
      fontFamily:"inherit",background:slotOk?C.green:"#E2E8F0",color:slotOk?"#fff":C.textMut,transition:"all .2s"}}>
      {preConf.length>0?`⚡ Buscar ${vagasAbertas} jogador(es)` :"⚡ Disparar Cascata"}
    </button>
    {!slotOk&&<p style={{fontSize:11,color:C.textMut,textAlign:"center",marginTop:6}}>
      {!slot.data||!slot.hora||!slot.quadra?"Preencha data, horário e quadra":"Candidatos insuficientes"}
    </p>}
  </div>;
}

// ─── JOGADORES VIEW ───────────────────────────────────────────────────────────
function JogadoresView({jogadores,setJogadores,fireToast}){
  const [gf,setGf]=useState("M");
  const [showForm,setShowForm]=useState(false);
  const DIAS=["Seg","Ter","Qua","Qui","Sex","Sáb","Dom"];
  const F0={nome:"",g:"M",cats:["4ª"],tel:"",dias:[],hrs:[],aceitaMisto:false};
  const [form,setForm]=useState(F0);
  const inp={background:"#fff",border:`1.5px solid ${C.border}`,borderRadius:9,
    padding:"9px 12px",color:C.text,fontFamily:"inherit",fontSize:13,width:"100%",outline:"none"};
  function toggleArr(f,v){setForm(x=>({...x,[f]:x[f].includes(v)?x[f].filter(i=>i!==v):[...x[f],v]}));}
  function toggleCat(c){
    setForm(f=>{
      if(f.cats.includes(c)) return {...f,cats:f.cats.filter(x=>x!==c)};
      if(f.cats.length>=2) return f; // máximo 2
      return {...f,cats:[...f.cats,c]};
    });
  }
  function salvar(){
    if(!form.nome.trim()||!form.tel.trim()){fireToast("Preencha nome e telefone",false);return;}
    if(form.cats.length===0){fireToast("Selecione ao menos uma categoria",false);return;}
    const novoLocal={...form,id:`temp-${Date.now()}`,cat:form.cats[0]};
    db.addJogador({...form,cat:form.cats[0],cat2:form.cats[1]||null})
      .then(data=>{
        const salvo=fromDB(data[0]);
        setJogadores(p=>[...p,salvo]);
        fireToast(`${form.nome} cadastrado! ✅`);
      })
      .catch(()=>{
        setJogadores(p=>[...p,novoLocal]);
        fireToast(`${form.nome} cadastrado localmente ✅`);
      });
    setShowForm(false);setForm(F0);
  }
  const [editando,setEditando]=useState(null); // jogador sendo editado

  function abrirEdicao(j){
    setForm({
      nome:j.nome, g:j.g, cats:[j.cat,...(j.cat2?[j.cat2]:[])],
      tel:j.tel, dias:j.dias, hrs:j.hrs, aceitaMisto:j.aceitaMisto
    });
    setEditando(j.id);
    setShowForm(true);
  }

  function salvarEdicao(){
    if(!form.nome.trim()||!form.tel.trim()){fireToast("Preencha nome e telefone",false);return;}
    if(form.cats.length===0){fireToast("Selecione ao menos uma categoria",false);return;}
    const atualizado={...form,cat:form.cats[0],cat2:form.cats[1]||null,id:editando};
    db.updateJogador(editando,{
      nome:form.nome, telefone:form.tel, genero:form.g,
      categoria:form.cats[0], categoria2:form.cats[1]||null,
      dias_pref:form.dias, horas_pref:form.hrs, aceita_misto:form.aceitaMisto
    }).then(()=>{
      setJogadores(p=>p.map(j=>j.id===editando?atualizado:j));
      fireToast(`${form.nome} atualizado! ✅`);
    }).catch(()=>{
      setJogadores(p=>p.map(j=>j.id===editando?atualizado:j));
      fireToast(`${form.nome} atualizado localmente ✅`);
    });
    setShowForm(false);setEditando(null);setForm(F0);
  }

  function excluirJogador(j){
    if(!window.confirm(`Excluir ${j.nome}?`)) return;
    db.deleteJogador(j.id)
      .then(()=>{ setJogadores(p=>p.filter(x=>x.id!==j.id)); fireToast(`${j.nome} removido`); })
      .catch(()=>{ setJogadores(p=>p.filter(x=>x.id!==j.id)); fireToast(`${j.nome} removido`); });
  }

  return <div>
    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
      <div>
        <h2 style={{fontSize:20,fontWeight:700,color:C.text}}>Jogadores</h2>
        <p style={{fontSize:12,color:C.textSub}}>{jogadores.length} cadastrado(s)</p>
      </div>
      <Btn onClick={()=>{setEditando(null);setForm(F0);setShowForm(true);}}>+ Novo</Btn>
    </div>
    <div style={{display:"flex",gap:8,marginBottom:14,flexWrap:"wrap"}}>
      {["M","F"].map(g=><Chip key={g} active={gf===g} onClick={()=>setGf(g)} color={C.blue}>
        {g==="M"?"♂ Masculino":"♀ Feminino"} ({jogadores.filter(j=>j.g===g).length})
      </Chip>)}
    </div>
    <div style={{display:"flex",flexDirection:"column",gap:6}}>
      {jogadores.filter(j=>j.g===gf).map(j=><div key={j.id} style={{display:"flex",alignItems:"center",
        gap:10,padding:"10px 12px",borderRadius:10,background:"#fff",border:`1px solid ${C.border}`,flexWrap:"wrap"}}>
        <Avatar nome={j.nome} size={32} g={j.g}/>
        <div style={{flex:1,minWidth:80}}>
          <div style={{display:"flex",gap:5,alignItems:"center",marginBottom:3,flexWrap:"wrap"}}>
            <span style={{fontWeight:600,fontSize:13,color:C.text}}>{j.nome}</span>
            {j.aceitaMisto&&<span style={{fontSize:9,color:"#92400E",fontWeight:600,background:"#FEF3C7",
              border:"1px solid #FCD34D",borderRadius:99,padding:"1px 6px"}}>⚤ misto</span>}
          </div>
          <div style={{display:"flex",gap:4,flexWrap:"wrap"}}>
            <CatPill cat={j.cat}/>
            {j.cat2&&<CatPill cat={j.cat2}/>}
            {j.dias.map(d=><span key={d} style={{fontSize:9,background:C.bg,border:`1px solid ${C.border}`,
              borderRadius:99,padding:"2px 6px",color:C.textSub}}>{d}</span>)}
          </div>
        </div>
        <div style={{fontSize:11,color:C.textSub,textAlign:"right",marginRight:4}}>
          <div>{j.tel}</div><div style={{marginTop:2,color:C.textMut}}>Nível {NIVEL[j.cat]}</div>
        </div>
        <div style={{display:"flex",gap:5,flexShrink:0}}>
          <button onClick={()=>abrirEdicao(j)} style={{background:C.blueBg,border:`1px solid #93C5FD`,
            borderRadius:8,padding:"5px 10px",cursor:"pointer",fontSize:11,
            color:C.blue,fontFamily:"inherit",fontWeight:600}}>✏️ Editar</button>
          <button onClick={()=>excluirJogador(j)} style={{background:C.redBg,border:`1px solid ${C.redBor}`,
            borderRadius:8,padding:"5px 10px",cursor:"pointer",fontSize:11,
            color:C.red,fontFamily:"inherit",fontWeight:600}}>🗑️</button>
        </div>
      </div>)}
    </div>
    {showForm&&<div onClick={()=>setShowForm(false)} style={{position:"fixed",inset:0,
      background:"rgba(0,0,0,.35)",zIndex:200,display:"flex",alignItems:"center",
      justifyContent:"center",padding:16}}>
      <div onClick={e=>e.stopPropagation()} style={{background:"#fff",borderRadius:16,padding:22,
        width:"100%",maxWidth:480,maxHeight:"90vh",overflowY:"auto",boxShadow:"0 20px 60px rgba(0,0,0,.15)"}}>
        <h3 style={{fontSize:16,fontWeight:700,color:C.text,marginBottom:16}}>{editando?"Editar Jogador":"Novo Jogador"}</h3>
        <div style={{display:"flex",flexDirection:"column",gap:12}}>
          <div><div style={{fontSize:10,color:C.textSub,fontWeight:700,textTransform:"uppercase",letterSpacing:.9,marginBottom:5}}>Nome</div>
            <input style={inp} value={form.nome} onChange={e=>setForm(f=>({...f,nome:e.target.value}))} placeholder="Nome completo"/></div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
            <div><div style={{fontSize:10,color:C.textSub,fontWeight:700,textTransform:"uppercase",letterSpacing:.9,marginBottom:5}}>Gênero</div>
              <select style={inp} value={form.g} onChange={e=>setForm(f=>({...f,g:e.target.value,cats:["4ª"]}))}>
                <option value="M">Masculino</option><option value="F">Feminino</option></select></div>
            <div>
              <div style={{fontSize:10,color:C.textSub,fontWeight:700,textTransform:"uppercase",letterSpacing:.9,marginBottom:5}}>
                Categoria(s) <span style={{color:C.textMut,fontWeight:400,textTransform:"none",letterSpacing:0}}>— máx. 2</span>
              </div>
              <div style={{display:"flex",gap:5,flexWrap:"wrap"}}>
                {(form.g==="M"?CATS_M:CATS_F).map(c=>(
                  <button key={c} onClick={()=>toggleCat(c)} style={{
                    background:form.cats.includes(c)?CAT_BG[c]:"#fff",
                    border:`1.5px solid ${form.cats.includes(c)?CAT_BOR[c]:C.border}`,
                    color:form.cats.includes(c)?CAT_FG[c]:C.textSub,
                    borderRadius:99,padding:"4px 10px",cursor:(!form.cats.includes(c)&&form.cats.length>=2)?"not-allowed":"pointer",
                    fontFamily:"inherit",fontWeight:700,fontSize:11,transition:"all .15s",
                    opacity:(!form.cats.includes(c)&&form.cats.length>=2)?.4:1
                  }}>{form.cats.includes(c)?"✓ ":""}{c}</button>
                ))}
              </div>
            </div>
          </div>
          <div><div style={{fontSize:10,color:C.textSub,fontWeight:700,textTransform:"uppercase",letterSpacing:.9,marginBottom:5}}>Telefone</div>
            <input style={inp} value={form.tel} onChange={e=>setForm(f=>({...f,tel:e.target.value}))} placeholder="11999990000"/></div>
          <div><div style={{fontSize:10,color:C.textSub,fontWeight:700,textTransform:"uppercase",letterSpacing:.9,marginBottom:7}}>Dias preferidos</div>
            <div style={{display:"flex",gap:5,flexWrap:"wrap"}}>{DIAS.map(d=><Chip key={d} active={form.dias.includes(d)} onClick={()=>toggleArr("dias",d)} color={C.green}>{d}</Chip>)}</div></div>
          <div><div style={{fontSize:10,color:C.textSub,fontWeight:700,textTransform:"uppercase",letterSpacing:.9,marginBottom:7}}>Horários preferidos</div>
            <div style={{display:"flex",gap:5,flexWrap:"wrap"}}>{HORAS.map(h=><Chip key={h} active={form.hrs.includes(h)} onClick={()=>toggleArr("hrs",h)} color={C.green}>{h}</Chip>)}</div></div>
          <label style={{display:"flex",alignItems:"center",gap:10,cursor:"pointer",padding:"10px 12px",
            borderRadius:10,border:`1.5px solid ${form.aceitaMisto?C.yellowBor:C.border}`,
            background:form.aceitaMisto?C.yellowBg:"#fff",transition:"all .2s"}}>
            <input type="checkbox" checked={form.aceitaMisto} onChange={e=>setForm(f=>({...f,aceitaMisto:e.target.checked}))}
              style={{accentColor:C.yellow,width:16,height:16}}/>
            <div><div style={{fontSize:13,fontWeight:600,color:form.aceitaMisto?C.yellow:C.textSub}}>⚤ Aceita jogos mistos</div>
              <div style={{fontSize:11,color:C.textMut}}>Será convidado para partidas mistas</div></div>
          </label>
          <div style={{display:"flex",gap:8}}>
            <Btn onClick={editando?salvarEdicao:salvar} style={{flex:1}}>
              {editando?"Salvar alterações":"Salvar"}
            </Btn>
            <Btn variant="ghost" onClick={()=>{setShowForm(false);setEditando(null);setForm(F0);}}>Cancelar</Btn>
          </div>
        </div>
      </div>
    </div>}
  </div>;
}

// ─── FREQUÊNCIA VIEW ──────────────────────────────────────────────────────────
function FrequenciaView({fireToast}){
  const [dados,setDados]=useState([]);
  const [loading,setLoading]=useState(true);

  useEffect(()=>{
    db.getFrequencia()
      .then(d=>{ setDados(d||[]); setLoading(false); })
      .catch(()=>{ fireToast("Erro ao carregar frequência",false); setLoading(false); });
  },[]);

  return <div style={{animation:"fadeIn .3s ease"}}>
    <div style={{marginBottom:18}}>
      <h2 style={{fontSize:20,fontWeight:700,color:C.text}}>Frequência de Jogadores</h2>
      <p style={{fontSize:12,color:C.textSub}}>Histórico de participação registrado no banco de dados</p>
    </div>
    {loading?<div style={{textAlign:"center",padding:"40px 0",color:C.textMut}}>
      <div style={{fontSize:30,marginBottom:10}}>⏳</div>
      <div>Carregando...</div>
    </div>:dados.length===0?<div style={{textAlign:"center",padding:"50px 0",color:C.textMut}}>
      <div style={{fontSize:40,marginBottom:12}}>📊</div>
      <div style={{fontWeight:700,fontSize:16,color:C.text,marginBottom:6}}>Nenhum dado ainda</div>
      <div style={{fontSize:13}}>Os dados aparecem após fechar o primeiro jogo</div>
    </div>:<div style={{display:"flex",flexDirection:"column",gap:8}}>
      {dados.map((j,i)=>(
        <div key={j.id} style={{background:"#fff",border:`1px solid ${C.border}`,
          borderRadius:12,padding:"12px 16px",display:"flex",alignItems:"center",gap:12,flexWrap:"wrap"}}>
          <div style={{fontWeight:700,fontSize:13,color:C.textMut,width:24,textAlign:"right",flexShrink:0}}>#{i+1}</div>
          <div style={{flex:1,minWidth:100}}>
            <div style={{fontWeight:700,fontSize:14,color:C.text,marginBottom:4}}>{j.nome}</div>
            <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
              <CatPill cat={j.categoria}/>
              <GenBadge g={j.genero}/>
            </div>
          </div>
          <div style={{display:"flex",gap:16,flexWrap:"wrap"}}>
            <div style={{textAlign:"center"}}>
              <div style={{fontSize:20,fontWeight:700,color:C.green}}>{j.jogos_confirmados||0}</div>
              <div style={{fontSize:10,color:C.textMut}}>Confirmados</div>
            </div>
            <div style={{textAlign:"center"}}>
              <div style={{fontSize:20,fontWeight:700,color:C.red}}>{j.jogos_recusados||0}</div>
              <div style={{fontSize:10,color:C.textMut}}>Recusados</div>
            </div>
            <div style={{textAlign:"center"}}>
              <div style={{fontSize:20,fontWeight:700,color:C.text}}>{j.total_convites||0}</div>
              <div style={{fontSize:10,color:C.textMut}}>Convites</div>
            </div>
            <div style={{textAlign:"center"}}>
              <div style={{fontSize:13,fontWeight:700,color:C.textSub}}>{j.ultimo_jogo?new Date(j.ultimo_jogo).toLocaleDateString("pt-BR"):"—"}</div>
              <div style={{fontSize:10,color:C.textMut}}>Último jogo</div>
            </div>
          </div>
        </div>
      ))}
    </div>}
  </div>;
}

// ─── MAIN APP ─────────────────────────────────────────────────────────────────
export default function App(){
  const [tela,setTela]=useState("jogos"); // jogos | historico | jogadores
  const [jogadores,setJogadores]=useState([]);
  const [loadingJogadores,setLoadingJogadores]=useState(true);
  const [jogosAtivos,setJogosAtivos]=useState([]); // lista de jogos simultâneos
  const [jogoAbertoId,setJogoAbertoId]=useState(null); // id do card expandido
  const [mostrarForm,setMostrarForm]=useState(false);
  const [historico,setHistorico]=useState([]);
  const [msgModal,setMsgModal]=useState(null);
  const [alertaOp,setAlertaOp]=useState(null);
  const [toast,setToast]=useState(null);
  const [remetente,setRemetente]=useState("Gabi da Profit");
  const timersRef=useRef({}); // {jogoId: intervalId}

  const fireToast=(msg,ok=true)=>{setToast({msg,ok});setTimeout(()=>setToast(null),2800);};

  // Polling — verifica atualizações no banco a cada 5s enquanto há jogos ativos
  useEffect(()=>{
    const interval = setInterval(async ()=>{
      const jogosEmAndamento = jogosAtivos.filter(j=>j.status==="ativo");
      if(!jogosEmAndamento.length) return;

      for(const jg of jogosEmAndamento){
        try{
          // Busca jogos no banco pelo slot (data+hora+quadra)
          const jogosDb = await supaFetch(
            `jogos?select=id&data=eq.${jg.slot.data}&hora=eq.${jg.slot.hora}&quadra=eq.${encodeURIComponent(jg.slot.quadra)}&order=created_at.desc&limit=1`
          );
          if(!Array.isArray(jogosDb)||!jogosDb.length) continue;
          const jogoDbId = jogosDb[0].id;

          // Busca participações desse jogo
          const parts = await supaFetch(
            `participacoes?select=jogador_id,resposta&jogo_id=eq.${jogoDbId}`
          );
          if(!Array.isArray(parts)) continue;

          setJogosAtivos(prev=>prev.map(j=>{
            if(j.id!==jg.id) return j;
            let novaFila=[...j.fila];
            let mudou=false;

            parts.forEach(p=>{
              novaFila=novaFila.map(f=>{
                if(f.id!==p.jogador_id) return f;
                if(f.status===p.resposta||p.resposta==="pendente") return f;
                mudou=true;
                if(p.resposta==="confirmado") setTimeout(()=>fireToast(`✅ ${f.nome.split(" ")[0]} confirmou!`),0);
                if(p.resposta==="recusou") setTimeout(()=>fireToast(`❌ ${f.nome.split(" ")[0]} recusou`),0);
                return{...f,status:p.resposta,respostaEm:"via WhatsApp"};
              });
            });

            if(!mudou) return j;
            const conf=novaFila.filter(x=>x.status==="confirmado");
            if(conf.length===4&&j.status==="ativo"){
              const{sc,d1,d2}=melhorDuplas(conf);
              setTimeout(()=>fireToast(`🎾 Jogo ${j.slot.hora} · ${j.slot.quadra} fechado!`),0);
              return{...j,fila:novaFila,status:"fechado",dupla1:d1,dupla2:d2,scoreEquilibrio:sc};
            }
            return{...j,fila:novaFila,dbId:jogoDbId};
          }));
        }catch(e){
          console.log("polling error:", e);
        }
      }
    },5000);
    return()=>clearInterval(interval);
  },[jogosAtivos]);


  // Carrega jogadores do Supabase
  useEffect(()=>{
    setLoadingJogadores(true);
    db.getJogadores()
      .then(data=>{ setJogadores(data.map(fromDB)); setLoadingJogadores(false); })
      .catch(()=>{ fireToast("Erro ao carregar jogadores",false); setLoadingJogadores(false); });
  },[]);

  // ── TIMER INDEPENDENTE POR JOGO ──────────────────────────────────────────
  useEffect(()=>{
    // inicia timer para cada jogo ativo que ainda não tem
    jogosAtivos.forEach(j=>{
      if(j.status==="ativo"&&!timersRef.current[j.id]){
        timersRef.current[j.id]=setInterval(()=>{
          setJogosAtivos(prev=>prev.map(jg=>{
            if(jg.id!==j.id||jg.status!=="ativo") return jg;
            if(jg.timer-1<=0) return processarFimOnda(jg);
            return{...jg,timer:jg.timer-1};
          }));
        },1000);
      }
      // limpa timer de jogos não mais ativos
      if(j.status!=="ativo"&&timersRef.current[j.id]){
        clearInterval(timersRef.current[j.id]);
        delete timersRef.current[j.id];
      }
    });
    // limpa timers de jogos removidos
    Object.keys(timersRef.current).forEach(id=>{
      if(!jogosAtivos.find(j=>j.id===Number(id))){
        clearInterval(timersRef.current[id]);
        delete timersRef.current[id];
      }
    });
  },[jogosAtivos]);

  // ── LÓGICA CASCATA ────────────────────────────────────────────────────────
  function processarFimOnda(prev){
    const novaFila=prev.fila.map(j=>j.status==="pendente"?{...j,status:"expirado"}:j);
    const conf=novaFila.filter(j=>j.status==="confirmado");
    if(conf.length===4) return fecharJogoObj({...prev,fila:novaFila});
    const aguard=novaFila.filter(j=>j.status==="aguardando");
    if(!aguard.length) return{...prev,fila:novaFila,status:"sem_candidatos"};
    const prox=prev.ondaAtual+1;
    const n=Math.min(8,(4-conf.length)*2,aguard.length);
    const paraConvidar=aguard.slice(0,n);
    const filaAtualizada=novaFila.map(j=>
      paraConvidar.find(p=>p.id===j.id)?{...j,status:"pendente",ondaEnviado:prox}:j
    );
    // Envia convites automaticamente para nova onda
    setTimeout(()=>{
      enviarParaLista(paraConvidar, j=>buildMsgConvite(j,prev.slot,conf,remetente))
        .then(({ok,erros})=>{
          if(erros>0) fireToast(`⚡ Onda ${prox}: ${ok} enviado(s), ${erros} erro(s)`);
          else fireToast(`⚡ Onda ${prox}: ${ok} convite(s) enviado(s)!`);
        }).catch(()=>{});
    },500);
    return{...prev,fila:filaAtualizada,ondaAtual:prox,timer:TIMER_MAX};
  }

  function fecharJogoObj(prev){
    clearInterval(timersRef.current[prev.id]);
    delete timersRef.current[prev.id];
    const conf=prev.fila.filter(j=>j.status==="confirmado");
    const{sc,d1,d2}=melhorDuplas(conf);
    return{...prev,status:"fechado",dupla1:d1,dupla2:d2,scoreEquilibrio:sc,
      catDefinida:prev.catDefinida||conf[0]?.cat||null};
  }

  function responder(jogoId,playerId,resp){
    setJogosAtivos(prev=>prev.map(jg=>{
      if(jg.id!==jogoId) return jg;

      // Jogo já fechado
      if(jg.status==="fechado"&&resp==="sim"){
        const j=jg.fila.find(x=>x.id===playerId);
        if(j){
          setTimeout(()=>setAlertaOp({jogador:j,slot:jg.slot}),50);
          return{...jg,fila:jg.fila.map(x=>x.id===playerId?{...x,status:"interessado"}:x)};
        }
        return jg;
      }
      if(jg.status!=="ativo") return jg;

      let novaFila=jg.fila.map(j=>
        j.id===playerId?{...j,status:resp==="sim"?"confirmado":"recusou",
          respostaEm:new Date().toLocaleTimeString("pt-BR")}:j
      );
      const conf=novaFila.filter(j=>j.status==="confirmado");
      const pend=novaFila.filter(j=>j.status==="pendente");
      let catDef=jg.catDefinida;
      let generoDef=jg.generoDef||null;

      if(resp==="sim"&&conf.length===1){
        if(!catDef){
          catDef=conf[0].cat;
          novaFila=novaFila.map(j=>{
            if(j.status==="confirmado") return j;
            if(j.cat!==catDef&&(j.status==="pendente"||j.status==="aguardando"))
              return{...j,status:"excluido_cat"};
            return j;
          });
        }
        if(!generoDef&&jg.slot.genero==="Todos"){
          generoDef=conf[0].g;
          novaFila=novaFila.map(j=>{
            if(j.status==="confirmado") return j;
            if(j.g!==generoDef&&!j.aceitaMisto&&(j.status==="pendente"||j.status==="aguardando"))
              return{...j,status:"excluido_cat"};
            return j;
          });
        }
      }

      if(conf.length===4){
        clearInterval(timersRef.current[jogoId]);
        delete timersRef.current[jogoId];
        const{sc,d1,d2}=melhorDuplas(conf);
        const fechado={...jg,fila:novaFila,status:"fechado",dupla1:d1,dupla2:d2,
          scoreEquilibrio:sc,catDefinida:catDef,generoDef};
        setTimeout(()=>{
          setHistorico(h=>[fechado,...h]);
          db.saveJogo(fechado).catch(()=>{});
          fireToast(`🎾 Jogo ${jg.slot.hora} · ${jg.slot.quadra} fechado!`);
          // Envia mensagem de jogo fechado para todos os confirmados
          const msgFechado=buildMsgFechado(d1,d2,jg.slot);
          conf.forEach(j=>enviarWhatsApp(j.tel,msgFechado).catch(()=>{}));
        },300);
        return fechado;
      }
      if(resp==="nao"&&pend.length===0){
        // Envia agradecimento automaticamente
        const jogRecusou=novaFila.find(j=>j.id===playerId);
        if(jogRecusou) enviarWhatsApp(jogRecusou.tel,buildMsgAgradecimento(jogRecusou,remetente)).catch(()=>{});
        return processarFimOnda({...jg,fila:novaFila,catDefinida:catDef,generoDef});
      }
      // Se recusou mas ainda tem pendentes, só envia agradecimento
      if(resp==="nao"){
        const jogRecusou=novaFila.find(j=>j.id===playerId);
        if(jogRecusou) enviarWhatsApp(jogRecusou.tel,buildMsgAgradecimento(jogRecusou,remetente)).catch(()=>{});
      }
      return{...jg,fila:novaFila,catDefinida:catDef,generoDef};
    }));
  }

  async function atualizarJogo(jogoId) {
    const jg = jogosAtivos.find(j=>j.id===jogoId);
    if (!jg) return;
    try {
      const jogosDb = await supaFetch(
        `jogos?select=id&data=eq.${jg.slot.data}&hora=eq.${jg.slot.hora}&quadra=eq.${encodeURIComponent(jg.slot.quadra)}&order=created_at.desc&limit=1`
      );
      if (!Array.isArray(jogosDb)||!jogosDb.length) { fireToast("Jogo não encontrado no banco",false); return; }
      const jogoDbId = jogosDb[0].id;

      const parts = await supaFetch(`participacoes?select=jogador_id,resposta&jogo_id=eq.${jogoDbId}`);
      if (!Array.isArray(parts)) return;

      setJogosAtivos(prev=>prev.map(j=>{
        if (j.id!==jogoId) return j;
        let novaFila=[...j.fila];
        let mudou=false;
        parts.forEach(p=>{
          novaFila=novaFila.map(f=>{
            if (f.id!==p.jogador_id) return f;
            if (f.status===p.resposta||p.resposta==="pendente") return f;
            mudou=true;
            return{...f,status:p.resposta,respostaEm:"via WhatsApp"};
          });
        });
        if (!mudou) { fireToast("Nenhuma atualização"); return j; }
        const conf=novaFila.filter(x=>x.status==="confirmado");
        fireToast(`✅ Atualizado! ${conf.length}/4 confirmados`);
        if (conf.length===4&&j.status==="ativo") {
          const{sc,d1,d2}=melhorDuplas(conf);
          return{...j,fila:novaFila,status:"fechado",dupla1:d1,dupla2:d2,scoreEquilibrio:sc,dbId:jogoDbId};
        }
        return{...j,fila:novaFila,dbId:jogoDbId};
      }));
    } catch(e) {
      fireToast("Erro ao atualizar",false);
    }
  }
    const id=Date.now();
    const todasEntradas=[...jaConf,...fila];
    const novoJogo={
      id,slot,
      fila:todasEntradas,
      ondaAtual:1,
      catDefinida:slot.catsAlvo.length===1?slot.catsAlvo[0]:null,
      generoDef:null,
      timer:TIMER_MAX,
      status:"ativo",
      criadoEm:new Date().toLocaleTimeString("pt-BR"),
      dbId:null, // será preenchido após salvar no banco
    };
    setJogosAtivos(prev=>[novoJogo,...prev]);
    setJogoAbertoId(id);
    setMostrarForm(false);

    const pendentes=fila.filter(j=>j.ondaEnviado===1);

    // Cria jogo no banco e salva pendentes
    db.criarJogo(slot, slot.catsAlvo.length===1?slot.catsAlvo[0]:null)
      .then(jogoDb=>{
        // Atualiza o jogo com dbId
        setJogosAtivos(prev=>prev.map(j=>j.id===id?{...j,dbId:jogoDb.id}:j));
        // Salva participações pendentes
        if(pendentes.length>0){
          db.savePendentes(jogoDb.id, pendentes).catch(()=>{});
        }
      }).catch(()=>{});

    // Envia convites automaticamente
    if(pendentes.length>0){
      enviarParaLista(pendentes, j=>buildMsgConvite(j,slot,jaConf,remetente))
        .then(({ok,erros})=>{
          if(erros>0) fireToast(`⚡ Onda 1: ${ok} enviado(s), ${erros} erro(s)`);
          else fireToast(`⚡ Onda 1: ${ok} convite(s) enviado(s)!`);
        })
        .catch(()=>fireToast("Erro ao enviar convites",false));
    } else {
      fireToast(`⚡ Cascata disparada!`);
    }
  }

  function removerJogo(id){
    clearInterval(timersRef.current[id]);
    delete timersRef.current[id];
    setJogosAtivos(prev=>{
      const jg=prev.find(j=>j.id===id);
      if(jg&&jg.status==="fechado") setHistorico(h=>[jg,...h]);
      return prev.filter(j=>j.id!==id);
    });
    if(jogoAbertoId===id) setJogoAbertoId(null);
  }

  const jogosVisiveis=jogosAtivos; // todos
  const ativos=jogosAtivos.filter(j=>j.status==="ativo").length;
  const fechados=jogosAtivos.filter(j=>j.status==="fechado").length;

  return <div style={{minHeight:"100vh",background:C.bg,color:C.text,
    fontFamily:"system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif"}}>
    <style>{`
      *{box-sizing:border-box;margin:0;padding:0}
      ::-webkit-scrollbar{width:4px}::-webkit-scrollbar-thumb{background:#CBD5E1;border-radius:2px}
      input[type=date]{display:block;width:100%;max-width:100%;min-width:0;-webkit-appearance:none;appearance:none;box-sizing:border-box;}
      input[type=date]::-webkit-calendar-picker-indicator{opacity:.5;flex-shrink:0}
      @keyframes fadeIn{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:translateY(0)}}
      @media(max-width:540px){.g3{grid-template-columns:1fr 1fr !important}.g2{grid-template-columns:1fr !important}.nav-txt{display:none}}
      select option{background:#fff;color:#1A202C}
    `}</style>

    {/* NAV */}
    <div style={{background:"#fff",borderBottom:`1px solid ${C.border}`,padding:"0 16px",
      position:"sticky",top:0,zIndex:100,boxShadow:"0 1px 4px rgba(0,0,0,.06)"}}>
      <div style={{maxWidth:900,margin:"0 auto",display:"flex",alignItems:"center",
        justifyContent:"space-between",height:52}}>
        <div style={{display:"flex",alignItems:"center",gap:8}}>
          <img src="/logo.png" alt="Profit1" style={{height:34,width:"auto",objectFit:"contain"}}/>
          <div style={{fontSize:9,color:C.textMut,letterSpacing:1.5,textTransform:"uppercase",
            borderLeft:`1px solid ${C.border}`,paddingLeft:8}}>Convites</div>
        </div>
        <nav style={{display:"flex",gap:2}}>
          {[
            {id:"jogos",    icon:"🎾", txt:`Jogos${jogosAtivos.length?` (${jogosAtivos.length})`:""}`},
            {id:"historico",icon:"📋", txt:`Histórico${historico.length?` (${historico.length})`:""}`},
            {id:"frequencia",icon:"📊", txt:"Frequência"},
            {id:"jogadores",icon:"👥", txt:"Jogadores"},
          ].map(n=>{
            const active=tela===n.id;
            return <button key={n.id} onClick={()=>setTela(n.id)} style={{
              background:active?C.greenBg:"transparent",border:"none",cursor:"pointer",
              fontFamily:"inherit",fontSize:12,fontWeight:600,color:active?C.green:C.textSub,
              padding:"6px 10px",borderRadius:8,transition:"all .15s",whiteSpace:"nowrap"}}>
              {n.icon} <span className="nav-txt">{n.txt}</span>
            </button>;
          })}
        </nav>
      </div>
    </div>

    <div style={{maxWidth:900,margin:"0 auto",padding:"18px 16px"}}>

      {/* ══ JOGOS ══ */}
      {tela==="jogos"&&<div style={{animation:"fadeIn .3s ease"}}>

        {/* header */}
        <div style={{marginBottom:16}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",
            gap:10,marginBottom:10,flexWrap:"wrap"}}>
            <div>
              <h1 style={{fontSize:20,fontWeight:700,color:C.text,marginBottom:2}}>Jogos Ativos</h1>
              <div style={{fontSize:12,color:C.textSub,display:"flex",gap:12,flexWrap:"wrap"}}>
                {ativos>0&&<span style={{color:C.yellow,fontWeight:600}}>⏳ {ativos} em andamento</span>}
                {fechados>0&&<span style={{color:C.green,fontWeight:600}}>✅ {fechados} fechado(s)</span>}
                {jogosAtivos.length===0&&<span>Nenhum jogo ativo</span>}
              </div>
            </div>
            <button onClick={()=>{setMostrarForm(f=>!f);}} style={{
              background:C.green,color:"#fff",border:"none",borderRadius:10,
              padding:"10px 18px",fontSize:13,fontWeight:700,cursor:"pointer",
              fontFamily:"inherit",whiteSpace:"nowrap",flexShrink:0}}>
              ＋ Novo Jogo
            </button>
          </div>
          {/* campo remetente — linha separada */}
          <div style={{display:"flex",alignItems:"center",gap:8,
            background:"#fff",border:`1px solid ${C.border}`,borderRadius:10,
            padding:"8px 14px"}}>
            <span style={{fontSize:11,color:C.textMut,fontWeight:600,whiteSpace:"nowrap"}}>Enviado por:</span>
            <input value={remetente} onChange={e=>setRemetente(e.target.value)}
              style={{background:"transparent",border:"none",fontSize:13,color:C.text,
                fontFamily:"inherit",outline:"none",flex:1,minWidth:0}}
              placeholder="Seu nome"/>
          </div>
        </div>

        {/* form novo jogo */}
        {mostrarForm&&<FormNovoJogo
          jogadores={jogadores}
          remetente={remetente}
          onDispararCascata={dispararCascata}
          onCancelar={()=>setMostrarForm(false)}/>}

        {/* cards resumo */}
        {jogosVisiveis.length===0&&!mostrarForm&&<div style={{textAlign:"center",padding:"50px 0",color:C.textMut}}>
          <div style={{fontSize:40,marginBottom:12}}>🎾</div>
          <div style={{fontWeight:700,fontSize:16,color:C.text,marginBottom:6}}>Nenhum jogo em andamento</div>
          <div style={{fontSize:13,marginBottom:16}}>Clique em "Novo Jogo" para começar</div>
        </div>}

        {/* grid de cards */}
        {jogosVisiveis.length>0&&<div style={{display:"grid",
          gridTemplateColumns:"repeat(auto-fill,minmax(260px,1fr))",gap:10,marginBottom:16}}>
          {jogosVisiveis.map(j=><JogoCard key={j.id} jogo={j}
            isAtivo={jogoAbertoId===j.id}
            onClick={()=>setJogoAbertoId(prev=>prev===j.id?null:j.id)}
            onFechar={()=>removerJogo(j.id)}/>)}
        </div>}

        {/* painel expandido do jogo selecionado */}
        {jogoAbertoId&&(()=>{
          const jg=jogosAtivos.find(j=>j.id===jogoAbertoId);
          if(!jg) return null;
          return <div style={{background:"#fff",border:`1.5px solid ${C.blue}`,borderRadius:16,
            padding:18,animation:"fadeIn .25s ease"}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:4}}>
              <h2 style={{fontSize:16,fontWeight:700,color:C.text}}>
                {jg.slot.hora} · {jg.slot.quadra}
                <span style={{fontSize:12,color:C.textSub,fontWeight:400,marginLeft:8}}>
                  {diaSemana(jg.slot.data)}, {fmtData(jg.slot.data)}
                </span>
              </h2>
              <div style={{display:"flex",gap:8,alignItems:"center"}}>
                {jg.status==="ativo"&&<TimerRing seg={jg.timer} total={TIMER_MAX}/>}
                {jg.status==="fechado"&&<span style={{fontSize:12,color:C.green,fontWeight:700,
                  background:C.greenBg,border:`1px solid ${C.greenBor}`,borderRadius:99,padding:"4px 12px"}}>
                  ✅ Fechado
                </span>}
                <button onClick={()=>setJogoAbertoId(null)} style={{background:"none",border:"none",
                  cursor:"pointer",color:C.textMut,fontSize:18,padding:"2px 4px"}}>✕</button>
              </div>
            </div>
            <CascataPanel jogo={jg} onResponder={responder} onMsg={setMsgModal} remetente={remetente} onAtualizar={()=>atualizarJogo(jg.id)}/>
          </div>;
        })()}
      </div>}

      {/* ══ HISTÓRICO ══ */}
      {tela==="historico"&&<div style={{animation:"fadeIn .3s ease"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
          <div>
            <h2 style={{fontSize:20,fontWeight:700,color:C.text}}>Histórico</h2>
            <p style={{fontSize:12,color:C.textSub}}>{historico.length} jogo(s) registrado(s)</p>
          </div>
          <Btn variant="ghost" onClick={()=>setTela("jogos")}>← Voltar</Btn>
        </div>
        {historico.length===0?<div style={{textAlign:"center",padding:"60px 0",color:C.textMut}}>
          <div style={{fontSize:40,marginBottom:12}}>📋</div>
          <div style={{fontWeight:700,fontSize:16,color:C.text}}>Nenhum jogo registrado</div>
        </div>:historico.map((h,i)=><div key={i} style={{background:"#fff",border:`1px solid ${C.border}`,
          borderRadius:14,padding:14,marginBottom:10,borderLeft:`3px solid ${C.green}`}}>
          <div style={{display:"flex",gap:5,marginBottom:10,flexWrap:"wrap"}}>
            {[`📅 ${diaSemana(h.slot.data)}, ${fmtData(h.slot.data)}`,`🕐 ${h.slot.hora}`,`🏟️ ${h.slot.quadra}`].map((t,j)=>(
              <span key={j} style={{fontSize:11,background:C.bg,border:`1px solid ${C.border}`,
                borderRadius:99,padding:"3px 9px",color:C.textSub}}>{t}</span>
            ))}
            {h.catDefinida&&<span style={{fontSize:11,color:CAT_FG[h.catDefinida],fontWeight:700,
              background:CAT_BG[h.catDefinida],border:`1px solid ${CAT_BOR[h.catDefinida]}`,
              borderRadius:99,padding:"3px 9px"}}>🏅 {h.catDefinida}</span>}
            <span style={{fontSize:11,color:C.green,fontWeight:700,background:C.greenBg,
              border:`1px solid ${C.greenBor}`,borderRadius:99,padding:"3px 9px"}}>⚡ {h.scoreEquilibrio}pts</span>
          </div>
          <div style={{display:"grid",gridTemplateColumns:"1fr auto 1fr",gap:8,alignItems:"center",marginBottom:10}}>
            <div style={{background:C.bg,borderRadius:8,padding:"8px 10px"}}>
              {(h.dupla1||[]).map(j=><div key={j.id} style={{fontSize:13,fontWeight:600,color:C.text,marginBottom:3}}>{j.nome}</div>)}
            </div>
            <div style={{fontWeight:700,fontSize:15,color:C.textMut,textAlign:"center",padding:"0 4px"}}>VS</div>
            <div style={{background:C.bg,borderRadius:8,padding:"8px 10px"}}>
              {(h.dupla2||[]).map(j=><div key={j.id} style={{fontSize:13,fontWeight:600,color:C.text,marginBottom:3}}>{j.nome}</div>)}
            </div>
          </div>
          <Btn variant="ghost" style={{fontSize:11,padding:"5px 12px"}}
            onClick={()=>setMsgModal({titulo:"Reenviar confirmação",
              texto:buildMsgFechado(h.dupla1,h.dupla2,h.slot)})}>
            📱 Reenviar mensagem
          </Btn>
        </div>)}
      </div>}

      {/* ══ FREQUÊNCIA ══ */}
      {tela==="frequencia"&&<FrequenciaView fireToast={fireToast}/>}

      {/* ══ JOGADORES ══ */}
      {tela==="jogadores"&&(loadingJogadores
        ?<div style={{textAlign:"center",padding:"50px 0",color:C.textMut}}>
          <div style={{fontSize:30,marginBottom:10}}>⏳</div>
          <div>Carregando jogadores...</div>
        </div>
        :<JogadoresView jogadores={jogadores} setJogadores={setJogadores} fireToast={fireToast}/>
      )}
    </div>

    {msgModal&&<MsgModal {...msgModal} onClose={()=>setMsgModal(null)} fireToast={fireToast}/>}
    {alertaOp&&<AlertaOperador alerta={alertaOp} onClose={()=>setAlertaOp(null)}
      onNovoSlot={()=>{setAlertaOp(null);setMostrarForm(true);setTela("jogos");}}/>}
    {toast&&<div style={{position:"fixed",bottom:20,left:"50%",transform:"translateX(-50%)",
      background:toast.ok?"#fff":C.redBg,border:`1.5px solid ${toast.ok?C.greenBor:C.redBor}`,
      borderRadius:10,padding:"10px 20px",fontSize:13,fontWeight:700,
      color:toast.ok?C.green:C.red,zIndex:999,whiteSpace:"nowrap",
      boxShadow:"0 4px 20px rgba(0,0,0,.1)",animation:"fadeIn .25s ease"}}>{toast.msg}</div>}
  </div>;
}
