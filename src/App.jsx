import { useState, useEffect, useRef, useCallback, useMemo } from "react";

// Horários de 30 em 30 min — última às 21:30 (jogo termina 23:00)
const HORAS = Array.from({length:28},(_,i)=>{
  const h=Math.floor(i/2)+8, m=i%2===0?"00":"30";
  return `${String(h).padStart(2,"0")}:${m}`;
});
const QUADRAS = [1,2,3,4];
const CATS_M   = ["2ª","3ª","4ª","5ª","6ª","Iniciante"];
const CATS_F   = ["3ª","4ª","5ª","6ª","Iniciante"];
const CATS_ALL = ["2ª","3ª","4ª","5ª","6ª","Iniciante"];
const NIVEL    = {"2ª":90,"3ª":75,"4ª":60,"5ª":45,"6ª":30,"Iniciante":15};
const TIMER_DEMO = 20;

const CAT_BG  = {"2ª":"#FFE8E8","3ª":"#FFF0DC","4ª":"#FFFACC","5ª":"#DCFAEC","6ª":"#DCF0FF","Iniciante":"#F0DCFF"};
const CAT_FG  = {"2ª":"#B91C1C","3ª":"#92400E","4ª":"#78620A","5ª":"#065F46","6ª":"#1E40AF","Iniciante":"#6B21A8"};
const CAT_BOR = {"2ª":"#FCA5A5","3ª":"#FCD34D","4ª":"#FDE68A","5ª":"#6EE7B7","6ª":"#93C5FD","Iniciante":"#D8B4FE"};

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
function fmtData(iso) {
  if (!iso) return "";
  const [y,m,d] = iso.split("-");
  return `${d}/${m}/${y}`;
}
function diaSemana(iso) {
  if (!iso) return "";
  const dias = ["Dom","Seg","Ter","Qua","Qui","Sex","Sáb"];
  return dias[new Date(iso+"T12:00:00").getDay()];
}
function fmtTempo(s) {
  const m = Math.floor(s/60), sec = s%60;
  return `${String(m).padStart(2,"0")}:${String(sec).padStart(2,"0")}`;
}
function scoreJogador(j, dn, hr) {
  let s = 0;
  if (j.dias.includes(dn)) s += 50;
  if (j.hrs.includes(hr))  s += 50;
  return s;
}
function filtrarCandidatos(jogadores, genero, catsAlvo, dn, hr) {
  return jogadores.filter(j => {
    if (genero==="M" && j.g!=="M") return false;
    if (genero==="F" && j.g!=="F") return false;
    if (genero==="Misto" && !j.aceitaMisto) return false;
    if (catsAlvo.length>0 && !catsAlvo.includes(j.cat)) return false;
    return true;
  }).map(j=>({...j, score:scoreJogador(j,dn,hr)}))
    .sort((a,b)=>b.score-a.score);
}
function melhorDuplas(g4) {
  const opts = [
    [[g4[0],g4[1]],[g4[2],g4[3]]],
    [[g4[0],g4[2]],[g4[1],g4[3]]],
  ];
  return opts.reduce((best,[d1,d2])=>{
    const diff = Math.abs(
      (NIVEL[d1[0].cat]+NIVEL[d1[1].cat])/2 -
      (NIVEL[d2[0].cat]+NIVEL[d2[1].cat])/2
    );
    const sc = Math.round(100-diff);
    return sc>best.sc?{sc,d1,d2}:best;
  },{sc:-1,d1:[],d2:[]});
}

// ─── MENSAGENS ───────────────────────────────────────────────────────────────
function buildMsgConvite(j, slot, confirmados, remetente="Gabi da Profit") {
  const ds = diaSemana(slot.data);
  const nome = j.nome.split(" ")[0];

  let linhaConf = "";
  if (confirmados.length===1) {
    linhaConf = `\n*${confirmados[0].nome.split(" ")[0]}* já confirmou.`;
  } else if (confirmados.length>=2) {
    const nomes=confirmados.map(c=>c.nome.split(" ")[0]);
    const ultimo=nomes.pop();
    linhaConf = `\n*${nomes.join(", ")}* e *${ultimo}* já confirmaram.`;
  }

  return `Oi, ${nome}! ${remetente} aqui, tudo bem?! 🎾\n\nTenho um jogo para você:\n\n📅 *${ds}-feira, ${fmtData(slot.data)}*\n🕐 *${slot.hora}*\n🏟️ *${slot.quadra}*${linhaConf}\n\nVocê topa? Responda *SIM* ou *NÃO* 🎾`;
}
function buildMsgFechado(d1, d2, slot) {
  const ds = diaSemana(slot.data);
  const todos = [...(d1||[]),...(d2||[])];
  return `🎾 *JOGO CONFIRMADO!*\n\n📅 ${ds}-feira, ${fmtData(slot.data)}\n🕐 ${slot.hora}\n🏟️ ${slot.quadra}\n\n*${(d1||[]).map(j=>j.nome.split(" ")[0]).join(" & ")}*\n        ×\n*${(d2||[]).map(j=>j.nome.split(" ")[0]).join(" & ")}*\n\n${todos.map(j=>`• ${j.nome}`).join("\n")}\n\n✅ Confirme sua presença respondendo esta mensagem.\n❌ Em caso de desistência, avise com 24h de antecedência.\n\nNos vemos na quadra! 🏟️`;
}

// ─── DESIGN TOKENS ────────────────────────────────────────────────────────────
const C = {
  bg:"#F7F8FA", surface:"#FFFFFF", border:"#E2E8F0",
  text:"#1A202C", textSub:"#64748B", textMut:"#94A3B8",
  green:"#059669", greenBg:"#ECFDF5", greenBor:"#6EE7B7",
  red:"#DC2626",   redBg:"#FEF2F2",
  yellow:"#D97706",yellowBg:"#FFFBEB",
  blue:"#2563EB",  blueBg:"#EFF6FF",
};

// ─── ATOMS ───────────────────────────────────────────────────────────────────
function Avatar({nome, size=36, g, highlight}) {
  const gc = g==="F"?"#BE185D":g==="M"?"#1D4ED8":"#92400E";
  const bg = g==="F"?"#FCE7F3":g==="M"?"#DBEAFE":"#FEF3C7";
  return (
    <div style={{width:size,height:size,borderRadius:"50%",flexShrink:0,
      background:highlight?gc:bg, border:`2px solid ${highlight?gc:C.border}`,
      display:"flex",alignItems:"center",justifyContent:"center",
      fontSize:size*.38,fontWeight:700,color:highlight?"#fff":gc,transition:"all .3s"}}>
      {nome[0]}
    </div>
  );
}
function CatPill({cat, size=10}) {
  return (
    <span style={{background:CAT_BG[cat],color:CAT_FG[cat],border:`1px solid ${CAT_BOR[cat]}`,
      fontSize:size,fontWeight:700,padding:"2px 7px",borderRadius:99,whiteSpace:"nowrap"}}>
      {cat}
    </span>
  );
}
function GenBadge({g}) {
  const cfg={M:{c:"#1D4ED8",l:"♂"},F:{c:"#BE185D",l:"♀"},Misto:{c:"#92400E",l:"⚤"}};
  const {c,l}=cfg[g]||cfg.M;
  return <span style={{color:c,fontSize:11,fontWeight:700}}>{l}</span>;
}
function ScoreDot({score}) {
  const c=score>=80?C.green:score>=50?C.yellow:C.textMut;
  return (
    <div style={{display:"flex",alignItems:"center",gap:4}}>
      <div style={{width:5,height:5,borderRadius:"50%",background:c,flexShrink:0}}/>
      <div style={{width:30,height:3,background:C.border,borderRadius:2,overflow:"hidden"}}>
        <div style={{width:`${score}%`,height:"100%",background:c,borderRadius:2}}/>
      </div>
      <span style={{fontSize:9,color:c,fontWeight:600}}>
        {score===100?"dia+hora":score===50?"dia ok":"fora"}
      </span>
    </div>
  );
}
function Chip({children,active,onClick,color,disabled}) {
  const col=color||C.green;
  return (
    <button onClick={!disabled?onClick:undefined} style={{
      background:active?col+"18":"#fff",border:`1.5px solid ${active?col:C.border}`,
      color:active?col:C.textSub,borderRadius:99,padding:"5px 12px",fontSize:11,fontWeight:600,
      cursor:disabled?"default":"pointer",fontFamily:"inherit",transition:"all .15s",
      whiteSpace:"nowrap",opacity:disabled?.4:1
    }}>{children}</button>
  );
}
function Btn({children,onClick,variant="primary",disabled,style={}}) {
  const v={
    primary:{background:C.green,color:"#fff",padding:"11px 22px",fontSize:13,opacity:disabled?.4:1},
    ghost:{background:"#fff",border:`1.5px solid ${C.border}`,color:C.textSub,padding:"9px 16px",fontSize:12},
    danger:{background:"#fff",border:`1.5px solid ${C.red}`,color:C.red,padding:"7px 14px",fontSize:12},
  };
  return (
    <button onClick={!disabled?onClick:undefined} style={{
      border:"none",cursor:disabled?"not-allowed":"pointer",fontFamily:"inherit",
      fontWeight:700,borderRadius:10,transition:"all .18s",...v[variant],...style
    }}>{children}</button>
  );
}
function TimerRing({seg,total,size=60}) {
  const r=(size-8)/2,circ=2*Math.PI*r,pct=seg/total;
  const c=pct>.5?C.green:pct>.25?C.yellow:C.red;
  return (
    <div style={{position:"relative",width:size,height:size,flexShrink:0}}>
      <svg width={size} height={size} style={{transform:"rotate(-90deg)"}}>
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={C.border} strokeWidth={5}/>
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={c} strokeWidth={5}
          strokeDasharray={circ} strokeDashoffset={circ*(1-pct)} strokeLinecap="round"
          style={{transition:"stroke-dashoffset 1s linear,stroke .5s"}}/>
      </svg>
      <div style={{position:"absolute",inset:0,display:"flex",flexDirection:"column",
        alignItems:"center",justifyContent:"center"}}>
        <span style={{fontSize:12,fontWeight:700,color:c,lineHeight:1}}>{fmtTempo(seg)}</span>
        <span style={{fontSize:8,color:C.textMut,marginTop:1,letterSpacing:1}}>ONDA</span>
      </div>
    </div>
  );
}
function StatusPill({status}) {
  const cfg={
    pendente:  {c:C.yellow,bg:C.yellowBg,i:"⏳",l:"Aguardando"},
    confirmado:{c:C.green, bg:C.greenBg, i:"✅",l:"Confirmado"},
    recusou:   {c:C.red,   bg:C.redBg,   i:"❌",l:"Recusou"},
    expirado:   {c:C.textMut,bg:"#F8FAFC",i:"⌛",l:"Sem resposta"},
    aguardando: {c:C.textMut,bg:"#F8FAFC",i:"🔜",l:"Na fila"},
    interessado:{c:"#7C3AED",bg:"#F5F3FF",i:"🙋",l:"Interessado"},
    excluido_cat:{c:C.textMut,bg:"#F8FAFC",i:"🚫",l:"Cat. diferente"},
  };
  const{c,bg,i,l}=cfg[status]||cfg.aguardando;
  return (
    <span style={{fontSize:10,color:c,fontWeight:700,background:bg,
      border:`1px solid ${c}33`,borderRadius:99,padding:"3px 8px",whiteSpace:"nowrap"}}>
      {i} {l}
    </span>
  );
}
function SLabel({label,color}) {
  return <div style={{fontSize:10,color:color||C.textMut,fontWeight:700,
    textTransform:"uppercase",letterSpacing:.9,marginTop:10,marginBottom:5}}>{label}</div>;
}

// ─── ALERTA OPERADOR ──────────────────────────────────────────────────────────
function AlertaOperador({alerta,onClose,onNovoSlot}) {
  const {jogador,motivo,slot} = alerta;
  const isFechado = motivo==="jogo_fechado";
  return (
    <div onClick={onClose} style={{position:"fixed",inset:0,background:"rgba(0,0,0,.45)",
      zIndex:300,display:"flex",alignItems:"center",justifyContent:"center",padding:16}}>
      <div onClick={e=>e.stopPropagation()} style={{background:"#fff",borderRadius:16,
        padding:24,width:"100%",maxWidth:440,boxShadow:"0 20px 60px rgba(0,0,0,.18)"}}>
        <div style={{fontSize:28,textAlign:"center",marginBottom:12}}>
          {isFechado?"⚠️":"🔔"}
        </div>
        <h3 style={{fontSize:16,fontWeight:700,color:C.text,textAlign:"center",marginBottom:8}}>
          {isFechado?"Jogo já fechado!":"Interesse após fechamento"}
        </h3>
        <div style={{background:C.yellowBg,border:`1px solid #FCD34D`,borderRadius:10,
          padding:"12px 14px",marginBottom:16,fontSize:13,color:C.text,lineHeight:1.6}}>
          {isFechado
            ? <><strong>{jogador.nome}</strong> respondeu <strong>SIM</strong> ao convite, mas o jogo já estava fechado com 4 confirmados.<br/><br/>
                📅 {diaSemana(slot.data)}, {fmtData(slot.data)} · {slot.hora} · {slot.quadra}<br/><br/>
                Há outro horário ou quadra disponível para este jogador?
              </>
            : <><strong>{jogador.nome}</strong> demonstrou interesse mas o jogo já fechou.</>
          }
        </div>
        <div style={{display:"flex",gap:8}}>
          <button onClick={onNovoSlot} style={{flex:1,background:C.green,color:"#fff",
            border:"none",borderRadius:10,padding:"11px 0",fontSize:13,fontWeight:700,
            cursor:"pointer",fontFamily:"inherit"}}>
            ✅ Sim, montar novo slot
          </button>
          <button onClick={onClose} style={{background:"#fff",border:`1.5px solid ${C.border}`,
            color:C.textSub,borderRadius:10,padding:"11px 16px",fontSize:13,fontWeight:600,
            cursor:"pointer",fontFamily:"inherit"}}>
            Não
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── MSG MODAL ────────────────────────────────────────────────────────────────
function MsgModal({titulo,texto,tel,onClose,fireToast}) {
  const [ok,setOk]=useState(false);
  function copiar(){
    navigator.clipboard.writeText(texto).then(()=>{
      setOk(true);fireToast("Copiado! Cole no WhatsApp 📋");
      setTimeout(()=>setOk(false),2000);
    });
  }
  return (
    <div onClick={onClose} style={{position:"fixed",inset:0,background:"rgba(0,0,0,.4)",
      zIndex:200,display:"flex",alignItems:"center",justifyContent:"center",padding:16}}>
      <div onClick={e=>e.stopPropagation()} style={{background:"#fff",borderRadius:16,
        padding:22,width:"100%",maxWidth:480,maxHeight:"90vh",overflowY:"auto",
        boxShadow:"0 20px 60px rgba(0,0,0,.15)"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
          <h3 style={{fontSize:15,fontWeight:700,color:"#25D366"}}>📱 {titulo}</h3>
          <button onClick={onClose} style={{background:"none",border:"none",cursor:"pointer",
            color:C.textMut,fontSize:20,lineHeight:1}}>✕</button>
        </div>
        {tel&&<div style={{fontSize:11,color:C.textSub,marginBottom:10}}>
          Para: <strong style={{color:C.text}}>{tel}</strong>
        </div>}
        <div style={{background:C.bg,border:`1px solid ${C.border}`,borderRadius:10,
          padding:"12px 14px",fontSize:12,lineHeight:1.75,whiteSpace:"pre-wrap",
          color:C.text,marginBottom:14,fontFamily:"monospace",maxHeight:260,overflowY:"auto"}}>
          {texto}
        </div>
        <div style={{display:"flex",gap:8}}>
          <button onClick={copiar} style={{flex:1,border:ok?`1.5px solid ${C.green}`:"none",
            cursor:"pointer",fontFamily:"inherit",fontWeight:700,borderRadius:10,fontSize:13,
            padding:"11px 0",background:ok?"#fff":"#25D366",color:ok?C.green:"#fff",transition:"all .2s"}}>
            {ok?"✅ Copiado!":"📋 Copiar mensagem"}
          </button>
          <Btn variant="ghost" onClick={onClose}>Fechar</Btn>
        </div>
      </div>
    </div>
  );
}

// ─── CAND ROW ─────────────────────────────────────────────────────────────────
function CandRow({j,onSim,onNao,onMsg,slot,confirmados=[],remetente=""}) {
  return (
    <div style={{display:"flex",alignItems:"center",gap:8,padding:"10px 12px",
      borderRadius:10,background:"#fff",
      border:`1.5px solid ${onSim?C.yellowBg:C.border}`,
      marginBottom:6,flexWrap:"wrap",transition:"border .2s"}}>
      <Avatar nome={j.nome} size={32} g={j.g} highlight={j.status==="confirmado"}/>
      <div style={{flex:1,minWidth:100}}>
        <div style={{display:"flex",alignItems:"center",gap:5,marginBottom:3,flexWrap:"wrap"}}>
          <span style={{fontWeight:600,fontSize:13,color:C.text}}>{j.nome}</span>
          <GenBadge g={j.g}/>
        </div>
        <div style={{display:"flex",gap:5,alignItems:"center",flexWrap:"wrap"}}>
          <CatPill cat={j.cat}/>
          <ScoreDot score={j.score||0}/>
          {j.ondaEnviado&&<span style={{fontSize:9,color:C.textMut,fontWeight:600}}>Onda {j.ondaEnviado}</span>}
        </div>
      </div>
      <StatusPill status={j.status}/>
      <div style={{display:"flex",gap:5,flexShrink:0}}>
        <button onClick={()=>onMsg({
          titulo:`Convite — ${j.nome.split(" ")[0]}`,
          texto:buildMsgConvite(j,slot,confirmados,remetente),
          tel:j.tel
        })} style={{background:"#fff",border:`1px solid ${C.border}`,borderRadius:8,
          padding:"5px 9px",cursor:"pointer",fontSize:12,color:C.textSub,fontFamily:"inherit",fontWeight:600}}>📋</button>
        {onSim&&<>
          <button onClick={onSim} style={{background:C.greenBg,border:`1px solid ${C.greenBor}`,
            borderRadius:8,padding:"5px 11px",cursor:"pointer",fontSize:11,
            color:C.green,fontFamily:"inherit",fontWeight:700}}>SIM</button>
          <button onClick={onNao} style={{background:C.redBg,border:`1px solid #FCA5A5`,
            borderRadius:8,padding:"5px 11px",cursor:"pointer",fontSize:11,
            color:C.red,fontFamily:"inherit",fontWeight:700}}>NÃO</button>
        </>}
      </div>
    </div>
  );
}

// ─── CASCATA VIEW ─────────────────────────────────────────────────────────────
function CascataView({jogo,onResponder,onNovoJogo,onCancelar,onMsg,remetente=""}) {
  const conf  = jogo.fila.filter(j=>j.status==="confirmado");
  const pend  = jogo.fila.filter(j=>j.status==="pendente");
  const recus = jogo.fila.filter(j=>j.status==="recusou"||j.status==="expirado");
  const fila  = jogo.fila.filter(j=>j.status==="aguardando");
  const fechado = jogo.status==="fechado";

  return (
    <div>
      <div style={{display:"flex",alignItems:"flex-start",justifyContent:"space-between",
        marginBottom:14,gap:10,flexWrap:"wrap"}}>
        <div>
          <h2 style={{fontSize:20,fontWeight:700,color:C.text,marginBottom:6}}>
            {fechado?"🎾 Jogo Fechado!":"📡 Cascata Ativa"}
          </h2>
          <div style={{display:"flex",gap:5,flexWrap:"wrap"}}>
            {[`📅 ${diaSemana(jogo.slot.data)}, ${fmtData(jogo.slot.data)}`,
              `🕐 ${jogo.slot.hora}`,`🏟️ ${jogo.slot.quadra}`,
              jogo.slot.genero==="Misto"?"⚤ Misto":jogo.slot.genero==="F"?"♀ Feminino":"♂ Masculino",
            ].map((t,i)=>(
              <span key={i} style={{fontSize:11,background:C.bg,border:`1px solid ${C.border}`,
                borderRadius:99,padding:"3px 9px",color:C.textSub,fontWeight:500}}>{t}</span>
            ))}
            {jogo.catDefinida&&<span style={{fontSize:11,color:CAT_FG[jogo.catDefinida],fontWeight:700,
              background:CAT_BG[jogo.catDefinida],border:`1px solid ${CAT_BOR[jogo.catDefinida]}`,
              borderRadius:99,padding:"3px 9px"}}>🏅 {jogo.catDefinida} (interno)</span>}
          </div>
        </div>
        <div style={{display:"flex",gap:8,alignItems:"center"}}>
          {!fechado&&<TimerRing seg={jogo.timer} total={TIMER_DEMO}/>}
          {!fechado&&<Btn variant="danger" onClick={onCancelar} style={{fontSize:11}}>Cancelar</Btn>}
          {fechado&&<Btn onClick={onNovoJogo}>+ Novo Jogo</Btn>}
        </div>
      </div>

      {!fechado&&(
        <div style={{background:C.greenBg,border:`1px solid ${C.greenBor}`,
          borderRadius:12,padding:"12px 14px",marginBottom:12,
          display:"flex",alignItems:"center",gap:10,flexWrap:"wrap"}}>
          <div style={{flex:1}}>
            <div style={{fontWeight:700,fontSize:14,color:C.text,marginBottom:2}}>
              Onda {jogo.ondaAtual} em andamento
            </div>
            <div style={{fontSize:12,color:C.textSub}}>
              {pend.length} aguardando · {conf.length}/4 confirmados · {fila.length} na fila
            </div>
          </div>
          <div style={{textAlign:"right",flexShrink:0}}>
            <div style={{fontSize:24,fontWeight:700,color:C.green,lineHeight:1}}>
              {conf.length}<span style={{color:C.textMut}}>/4</span>
            </div>
          </div>
        </div>
      )}

      {conf.length>0&&!fechado&&(
        <div style={{background:"#fff",border:`1px solid ${C.border}`,borderRadius:10,
          padding:"10px 14px",marginBottom:10}}>
          <div style={{fontSize:10,color:C.textMut,fontWeight:700,textTransform:"uppercase",
            letterSpacing:.9,marginBottom:7}}>Confirmados</div>
          <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
            {conf.map(j=>(
              <span key={j.id} style={{display:"inline-flex",alignItems:"center",gap:5,
                background:C.greenBg,color:C.green,borderRadius:99,
                padding:"4px 11px",fontSize:12,fontWeight:600,border:`1px solid ${C.greenBor}`}}>
                ✅ {j.nome.split(" ")[0]}
              </span>
            ))}
          </div>
        </div>
      )}

      {fechado&&jogo.dupla1&&(
        <div style={{background:"#fff",border:`1.5px solid ${C.greenBor}`,borderRadius:14,
          padding:16,marginBottom:14}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
            <div style={{fontSize:10,color:C.green,fontWeight:700,textTransform:"uppercase",letterSpacing:.9}}>
              Duplas · Equilíbrio {jogo.scoreEquilibrio}pts
            </div>
            <span style={{fontSize:10,background:C.yellowBg,color:C.yellow,
              border:`1px solid #FCD34D`,borderRadius:99,padding:"2px 8px",fontWeight:600}}>Uso interno</span>
          </div>
          <div style={{display:"grid",gridTemplateColumns:"1fr auto 1fr",gap:8,alignItems:"center",marginBottom:12}}>
            {[jogo.dupla1,jogo.dupla2].map((dupla,di)=>(
              <div key={di} style={{background:C.bg,borderRadius:10,padding:"10px 12px"}}>
                <div style={{fontSize:9,color:C.green,fontWeight:700,letterSpacing:.9,
                  textTransform:"uppercase",marginBottom:7}}>Dupla {di+1}</div>
                {dupla.map(j=>(
                  <div key={j.id} style={{display:"flex",alignItems:"center",gap:6,marginBottom:6}}>
                    <Avatar nome={j.nome} size={26} g={j.g} highlight/>
                    <div>
                      <div style={{fontSize:12,fontWeight:600,color:C.text}}>{j.nome}</div>
                      <div style={{display:"flex",gap:4}}><CatPill cat={j.cat} size={9}/><GenBadge g={j.g}/></div>
                    </div>
                  </div>
                ))}
              </div>
            ))}
            <div style={{fontWeight:700,fontSize:16,color:C.textMut,textAlign:"center"}}>VS</div>
          </div>
          <Btn variant="ghost" style={{width:"100%",color:"#25D366",borderColor:"#25D366"}}
            onClick={()=>onMsg({titulo:"Jogo Fechado — Enviar para todos",
              texto:buildMsgFechado(jogo.dupla1,jogo.dupla2,jogo.slot)})}>
            📋 Copiar mensagem de confirmação
          </Btn>
        </div>
      )}

      {/* aviso categoria mista */}
      {fechado&&jogo.temCatMista&&(
        <div style={{background:C.yellowBg,border:`1px solid #FCD34D`,borderRadius:10,
          padding:"12px 14px",marginBottom:12,fontSize:13,color:C.text}}>
          ⚠️ <strong>Atenção:</strong> Este jogo fechou com jogadores de categorias diferentes
          pois nenhuma categoria foi pré-selecionada. Verifique se o equilíbrio está adequado
          antes de enviar a confirmação.
        </div>
      )}

      {conf.length>0 &&<SLabel label={`✅ Confirmados (${conf.length}/4)`} color={C.green}/>}
      {conf.map(j=><CandRow key={j.id} j={j} onMsg={onMsg} slot={jogo.slot} confirmados={conf} remetente={remetente}/>)}
      {pend.length>0 &&<SLabel label={`⏳ Aguardando — Onda ${jogo.ondaAtual}`} color={C.yellow}/>}
      {pend.map(j=><CandRow key={j.id} j={j} onMsg={onMsg} slot={jogo.slot} confirmados={conf} remetente={remetente}
        onSim={!fechado?()=>onResponder(j.id,"sim"):()=>onResponder(j.id,"sim")}
        onNao={!fechado?()=>onResponder(j.id,"nao"):null}/>)}
      {recus.length>0&&<SLabel label={`❌ Recusaram / Sem resposta (${recus.length})`} color={C.textMut}/>}
      {recus.map(j=><CandRow key={j.id} j={j} onMsg={onMsg} slot={jogo.slot} confirmados={conf} remetente={remetente}/>)}
      {fila.length>0 &&<SLabel label={`🔜 Na fila (${fila.length})`} color={C.textMut}/>}
      {fila.map(j=><CandRow key={j.id} j={j} onMsg={onMsg} slot={jogo.slot} confirmados={conf} remetente={remetente}/>)}
      {jogo.fila.filter(j=>j.status==="excluido_cat").length>0&&(
        <>
          <SLabel label="🚫 Excluídos — categoria diferente da definida" color={C.textMut}/>
          {jogo.fila.filter(j=>j.status==="excluido_cat").map(j=>(
            <CandRow key={j.id} j={j} onMsg={onMsg} slot={jogo.slot} confirmados={conf} remetente={remetente}/>
          ))}
        </>
      )}
      {jogo.fila.filter(j=>j.status==="interessado").length>0&&(
        <>
          <SLabel label="🙋 Interessados após fechamento" color="#7C3AED"/>
          {jogo.fila.filter(j=>j.status==="interessado").map(j=>(
            <CandRow key={j.id} j={j} onMsg={onMsg} slot={jogo.slot} confirmados={conf} remetente={remetente}/>
          ))}
        </>
      )}
    </div>
  );
}

// ─── JOGADORES ────────────────────────────────────────────────────────────────
function JogadoresView({jogadores,setJogadores,fireToast}) {
  const [gf,setGf]=useState("M");
  const [showForm,setShowForm]=useState(false);
  const DIAS=["Seg","Ter","Qua","Qui","Sex","Sáb","Dom"];
  const F0={nome:"",g:"M",cat:"4ª",tel:"",dias:[],hrs:[],aceitaMisto:false};
  const [form,setForm]=useState(F0);
  const inp={background:"#fff",border:`1.5px solid ${C.border}`,borderRadius:9,
    padding:"9px 12px",color:C.text,fontFamily:"inherit",fontSize:13,width:"100%",outline:"none"};

  function toggleArr(f,v){setForm(x=>({...x,[f]:x[f].includes(v)?x[f].filter(i=>i!==v):[...x[f],v]}));}
  function salvar(){
    if(!form.nome.trim()||!form.tel.trim()){fireToast("Preencha nome e telefone",false);return;}
    setJogadores(p=>[...p,{...form,id:Date.now()}]);
    setShowForm(false);setForm(F0);fireToast(`${form.nome} cadastrado! ✅`);
  }

  return (
    <div>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
        <div>
          <h2 style={{fontSize:20,fontWeight:700,color:C.text}}>Jogadores</h2>
          <p style={{fontSize:12,color:C.textSub}}>{jogadores.length} cadastrado(s)</p>
        </div>
        <Btn onClick={()=>setShowForm(true)}>+ Novo</Btn>
      </div>
      <div style={{display:"flex",gap:8,marginBottom:14,flexWrap:"wrap"}}>
        {["M","F"].map(g=>(
          <Chip key={g} active={gf===g} onClick={()=>setGf(g)} color={C.blue}>
            {g==="M"?"♂ Masculino":"♀ Feminino"} ({jogadores.filter(j=>j.g===g).length})
          </Chip>
        ))}
      </div>
      <div style={{display:"flex",flexDirection:"column",gap:6}}>
        {jogadores.filter(j=>j.g===gf).map(j=>(
          <div key={j.id} style={{display:"flex",alignItems:"center",gap:10,padding:"10px 12px",
            borderRadius:10,background:"#fff",border:`1px solid ${C.border}`,flexWrap:"wrap"}}>
            <Avatar nome={j.nome} size={32} g={j.g}/>
            <div style={{flex:1,minWidth:80}}>
              <div style={{display:"flex",gap:5,alignItems:"center",marginBottom:3,flexWrap:"wrap"}}>
                <span style={{fontWeight:600,fontSize:13,color:C.text}}>{j.nome}</span>
                {j.aceitaMisto&&<span style={{fontSize:9,color:"#92400E",fontWeight:600,
                  background:"#FEF3C7",border:"1px solid #FCD34D",borderRadius:99,padding:"1px 6px"}}>⚤ misto</span>}
              </div>
              <div style={{display:"flex",gap:4,flexWrap:"wrap"}}>
                <CatPill cat={j.cat}/>
                {j.dias.map(d=><span key={d} style={{fontSize:9,background:C.bg,
                  border:`1px solid ${C.border}`,borderRadius:99,padding:"2px 6px",color:C.textSub}}>{d}</span>)}
              </div>
            </div>
            <div style={{fontSize:11,color:C.textSub,textAlign:"right"}}>
              <div>{j.tel}</div>
              <div style={{marginTop:2,color:C.textMut}}>Nível {NIVEL[j.cat]}</div>
            </div>
          </div>
        ))}
      </div>

      {showForm&&(
        <div onClick={()=>setShowForm(false)} style={{position:"fixed",inset:0,
          background:"rgba(0,0,0,.35)",zIndex:200,display:"flex",alignItems:"center",
          justifyContent:"center",padding:16}}>
          <div onClick={e=>e.stopPropagation()} style={{background:"#fff",borderRadius:16,
            padding:22,width:"100%",maxWidth:480,maxHeight:"90vh",overflowY:"auto",
            boxShadow:"0 20px 60px rgba(0,0,0,.15)"}}>
            <h3 style={{fontSize:16,fontWeight:700,color:C.text,marginBottom:16}}>Novo Jogador</h3>
            <div style={{display:"flex",flexDirection:"column",gap:12}}>
              <div>
                <div style={{fontSize:10,color:C.textSub,fontWeight:700,textTransform:"uppercase",letterSpacing:.9,marginBottom:5}}>Nome completo</div>
                <input style={inp} value={form.nome} onChange={e=>setForm(f=>({...f,nome:e.target.value}))} placeholder="Ex: João Silva"/>
              </div>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
                <div>
                  <div style={{fontSize:10,color:C.textSub,fontWeight:700,textTransform:"uppercase",letterSpacing:.9,marginBottom:5}}>Gênero</div>
                  <select style={inp} value={form.g} onChange={e=>setForm(f=>({...f,g:e.target.value,cat:"4ª"}))}>
                    <option value="M">Masculino</option>
                    <option value="F">Feminino</option>
                  </select>
                </div>
                <div>
                  <div style={{fontSize:10,color:C.textSub,fontWeight:700,textTransform:"uppercase",letterSpacing:.9,marginBottom:5}}>Categoria</div>
                  <select style={inp} value={form.cat} onChange={e=>setForm(f=>({...f,cat:e.target.value}))}>
                    {(form.g==="M"?CATS_M:CATS_F).map(c=><option key={c}>{c}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <div style={{fontSize:10,color:C.textSub,fontWeight:700,textTransform:"uppercase",letterSpacing:.9,marginBottom:5}}>Telefone WhatsApp</div>
                <input style={inp} value={form.tel} onChange={e=>setForm(f=>({...f,tel:e.target.value}))} placeholder="11999990000"/>
              </div>
              <div>
                <div style={{fontSize:10,color:C.textSub,fontWeight:700,textTransform:"uppercase",letterSpacing:.9,marginBottom:7}}>Dias preferidos</div>
                <div style={{display:"flex",gap:5,flexWrap:"wrap"}}>
                  {DIAS.map(d=><Chip key={d} active={form.dias.includes(d)} onClick={()=>toggleArr("dias",d)} color={C.green}>{d}</Chip>)}
                </div>
              </div>
              <div>
                <div style={{fontSize:10,color:C.textSub,fontWeight:700,textTransform:"uppercase",letterSpacing:.9,marginBottom:7}}>Horários preferidos</div>
                <div style={{display:"flex",gap:5,flexWrap:"wrap"}}>
                  {HORAS.map(h=><Chip key={h} active={form.hrs.includes(h)} onClick={()=>toggleArr("hrs",h)} color={C.green}>{h}</Chip>)}
                </div>
              </div>
              <label style={{display:"flex",alignItems:"center",gap:10,cursor:"pointer",
                padding:"10px 12px",borderRadius:10,
                border:`1.5px solid ${form.aceitaMisto?"#FCD34D":C.border}`,
                background:form.aceitaMisto?"#FFFBEB":"#fff",transition:"all .2s"}}>
                <input type="checkbox" checked={form.aceitaMisto}
                  onChange={e=>setForm(f=>({...f,aceitaMisto:e.target.checked}))}
                  style={{accentColor:C.yellow,width:16,height:16}}/>
                <div>
                  <div style={{fontSize:13,fontWeight:600,color:form.aceitaMisto?C.yellow:C.textSub}}>⚤ Aceita jogos mistos</div>
                  <div style={{fontSize:11,color:C.textMut}}>Será convidado para partidas mistas</div>
                </div>
              </label>
              <div style={{display:"flex",gap:8,marginTop:4}}>
                <Btn onClick={salvar} style={{flex:1}}>Salvar</Btn>
                <Btn variant="ghost" onClick={()=>setShowForm(false)}>Cancelar</Btn>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── MAIN ─────────────────────────────────────────────────────────────────────
export default function App() {
  const [tela,setTela]=useState("config");
  const [jogadores,setJogadores]=useState(JOGADORES_INIT);
  const [slot,setSlot]=useState({data:"",hora:"",quadra:"",genero:"M",catsAlvo:[]});
  const [preConfirmados,setPreConfirmados]=useState([]); // ids dos já confirmados antes de disparar
  const [jogo,setJogo]=useState(null);
  const [historico,setHistorico]=useState([]);
  const [msgModal,setMsgModal]=useState(null);
  const [toast,setToast]=useState(null);
  const [alertaOperador,setAlertaOperador]=useState(null);
  const [remetente,setRemetente]=useState("Gabi da Profit");
  const timerRef=useRef(null);
  const fireToast=(msg,ok=true)=>{setToast({msg,ok});setTimeout(()=>setToast(null),2800);};
  const diaNome=diaSemana(slot.data);

  const candidatos=useMemo(()=>
    slot.data&&slot.hora
      ?filtrarCandidatos(jogadores,slot.genero,slot.catsAlvo,diaNome,slot.hora)
      :[],
    [jogadores,slot.genero,slot.catsAlvo,diaNome,slot.data,slot.hora]
  );

  const iniciarCascata=useCallback(()=>{
    // Pré-confirmados: já estão no jogo, não recebem convite, não entram na fila
    const idsPreConf=new Set(preConfirmados);
    const jaConf=candidatos.filter(j=>idsPreConf.has(j.id))
      .map(j=>({...j,status:"confirmado",ondaEnviado:null,respostaEm:"Pré-confirmado"}));
    const fila=candidatos
      .filter(j=>!idsPreConf.has(j.id))
      .map((j,i)=>({...j,ordem:i,status:i<8?"pendente":"aguardando",ondaEnviado:i<8?1:null,respostaEm:null}));
    const todasEntradas=[...jaConf,...fila];
    const vagasRestantes=4-jaConf.length;
    // Se já tem 4, fecha direto
    if(vagasRestantes<=0){
      const{sc,d1,d2}=melhorDuplas(jaConf.slice(0,4));
      const fechado={slot:{...slot},fila:jaConf,ondaAtual:0,
        catDefinida:slot.catsAlvo.length===1?slot.catsAlvo[0]:jaConf[0]?.cat||null,
        timer:0,status:"fechado",criadoEm:new Date().toLocaleTimeString("pt-BR"),
        dupla1:d1,dupla2:d2,scoreEquilibrio:sc};
      setJogo(fechado);setHistorico(h=>[fechado,...h]);setTela("fechado");
      fireToast("🎾 Jogo fechado com pré-confirmados!");
      return;
    }
    setJogo({slot:{...slot},fila:todasEntradas,ondaAtual:1,
      catDefinida:slot.catsAlvo.length===1?slot.catsAlvo[0]:null,
      timer:TIMER_DEMO,status:"ativo",criadoEm:new Date().toLocaleTimeString("pt-BR")});
    setTela("cascata");
    fireToast(`Onda 1 disparada! ${Math.min(8,fila.length)} convites ⚡`);
  },[candidatos,slot,preConfirmados]);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(()=>{
    if(tela!=="cascata"||!jogo||jogo.status!=="ativo") return;
    timerRef.current=setInterval(()=>{
      setJogo(prev=>{
        if(!prev||prev.status!=="ativo") return prev;
        if(prev.timer-1<=0) return processarFimOnda(prev);
        return {...prev,timer:prev.timer-1};
      });
    },1000);
    return ()=>clearInterval(timerRef.current);
  },[tela,jogo?.ondaAtual,jogo?.status]);

  function processarFimOnda(prev){
    const novaFila=prev.fila.map(j=>j.status==="pendente"?{...j,status:"expirado"}:j);
    const conf=novaFila.filter(j=>j.status==="confirmado");
    if(conf.length===4) return fecharJogo({...prev,fila:novaFila});
    const aguard=novaFila.filter(j=>j.status==="aguardando");
    if(!aguard.length){fireToast("Sem mais candidatos 😔",false);return{...prev,fila:novaFila,status:"sem_candidatos"};}
    const prox=prev.ondaAtual+1;
    const n=Math.min(8,(4-conf.length)*2,aguard.length);
    const filaAtualizada=novaFila.map(j=>
      aguard.slice(0,n).find(p=>p.id===j.id)?{...j,status:"pendente",ondaEnviado:prox}:j
    );
    fireToast(`Onda ${prox} disparada! ${n} convites ⚡`);
    return{...prev,fila:filaAtualizada,ondaAtual:prox,timer:TIMER_DEMO};
  }

  function fecharJogo(prev){
    clearInterval(timerRef.current);
    const conf=prev.fila.filter(j=>j.status==="confirmado");
    const{sc,d1,d2}=melhorDuplas(conf);
    return{...prev,status:"fechado",dupla1:d1,dupla2:d2,scoreEquilibrio:sc,
      catDefinida:prev.catDefinida||conf[0]?.cat||null};
  }

  function responder(id,resp){
    setJogo(prev=>{
      if(!prev) return prev;

      // Jogo já fechado — jogador ainda respondeu SIM
      if(prev.status==="fechado"&&resp==="sim"){
        const j=prev.fila.find(x=>x.id===id);
        if(j){
          // marca como "interessado após fechamento"
          const novaFila=prev.fila.map(x=>x.id===id?{...x,status:"interessado"}:x);
          setTimeout(()=>setAlertaOperador({
            jogador:j,
            motivo:"jogo_fechado",
            slot:prev.slot,
          }),50);
          return{...prev,fila:novaFila};
        }
        return prev;
      }

      if(prev.status!=="ativo") return prev;

      let novaFila=prev.fila.map(j=>
        j.id===id?{...j,status:resp==="sim"?"confirmado":"recusou",
          respostaEm:new Date().toLocaleTimeString("pt-BR")}:j
      );
      const conf=novaFila.filter(j=>j.status==="confirmado");
      const pend=novaFila.filter(j=>j.status==="pendente");
      let catDef=prev.catDefinida;

      // Primeiro a aceitar sem categoria definida — define a categoria
      // e remove da fila todos que não batem com essa categoria
      if(resp==="sim"&&!catDef&&conf.length===1){
        catDef=conf[0].cat;
        // Cancela convites pendentes de categoria diferente e remove da fila
        novaFila=novaFila.map(j=>{
          if(j.status==="pendente"&&j.cat!==catDef)
            return{...j,status:"excluido_cat"};
          if(j.status==="aguardando"&&j.cat!==catDef)
            return{...j,status:"excluido_cat"};
          return j;
        });
      }

      if(conf.length===4){
        clearInterval(timerRef.current);
        const{sc,d1,d2}=melhorDuplas(conf);
        // Verifica se há categorias mistas entre os confirmados (sem filtro prévio)
        const cats=[...new Set(conf.map(j=>j.cat))];
        const temCatMista=!prev.catDefinida&&cats.length>1;
        const fechado={...prev,fila:novaFila,status:"fechado",dupla1:d1,dupla2:d2,
          scoreEquilibrio:sc,catDefinida:catDef,temCatMista};
        setTimeout(()=>{
          setHistorico(h=>[fechado,...h]);
          setTela("fechado");
          fireToast("🎾 Jogo fechado!");
        },400);
        return fechado;
      }
      if(resp==="nao"&&pend.length===0) return processarFimOnda({...prev,fila:novaFila,catDefinida:catDef});
      return{...prev,fila:novaFila,catDefinida:catDef};
    });
  }

  function cancelarJogo(){clearInterval(timerRef.current);setJogo(null);setTela("config");fireToast("Jogo cancelado",false);}
  function novoJogo(){
    clearInterval(timerRef.current);
    if(jogo&&jogo.status==="fechado") setHistorico(h=>[jogo,...h]);
    setJogo(null);setSlot({data:"",hora:"",quadra:"",genero:"M",catsAlvo:[]});setPreConfirmados([]);setTela("config");
  }
  function toggleCat(c){setSlot(s=>({...s,catsAlvo:s.catsAlvo.includes(c)?s.catsAlvo.filter(x=>x!==c):[...s.catsAlvo,c]}));}

  const vagasAbertas=4-preConfirmados.length;
  const candidatosSemPreConf=candidatos.filter(j=>!preConfirmados.includes(j.id));
  const slotOk=slot.data&&slot.hora&&slot.quadra&&(preConfirmados.length===4||(candidatosSemPreConf.length>=(vagasAbertas>0?vagasAbertas:0)&&candidatosSemPreConf.length>0||preConfirmados.length>=4))
    &&candidatos.length>0;
  const today=new Date().toISOString().split("T")[0];
  const inp={background:"#fff",border:`1.5px solid ${C.border}`,borderRadius:9,
    padding:"9px 12px",color:C.text,fontFamily:"inherit",fontSize:13,width:"100%",outline:"none"};

  return (
    <div style={{minHeight:"100vh",background:C.bg,color:C.text,
      fontFamily:"system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif"}}>
      <style>{`
        *{box-sizing:border-box;margin:0;padding:0}
        ::-webkit-scrollbar{width:4px}
        ::-webkit-scrollbar-thumb{background:#CBD5E1;border-radius:2px}
        input[type=date]::-webkit-calendar-picker-indicator{opacity:.5}
        @keyframes fadeIn{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:translateY(0)}}
        @media(max-width:540px){
          .g3{grid-template-columns:1fr 1fr !important}
          .nav-txt{display:none}
        }
      `}</style>

      {/* NAV */}
      <div style={{background:"#fff",borderBottom:`1px solid ${C.border}`,
        padding:"0 16px",position:"sticky",top:0,zIndex:100,
        boxShadow:"0 1px 4px rgba(0,0,0,.06)"}}>
        <div style={{maxWidth:860,margin:"0 auto",display:"flex",alignItems:"center",
          justifyContent:"space-between",height:52}}>
          <div style={{display:"flex",alignItems:"center",gap:8}}>
            <img src="/logo.png" alt="Profit1" style={{height:36,width:"auto",objectFit:"contain"}}/>
            <div style={{fontSize:9,color:C.textMut,letterSpacing:1.5,textTransform:"uppercase",
              borderLeft:`1px solid ${C.border}`,paddingLeft:8}}>Convites</div>
          </div>
          <nav style={{display:"flex",gap:1}}>
            {[
              {id:"config",  icon:"⚡", txt:"Novo Jogo"},
              {id:"cascata", icon:"📡", txt:"Cascata", hide:!jogo},
              {id:"historico",icon:"📋",txt:`Histórico${historico.length?` (${historico.length})`:""}`},
              {id:"jogadores",icon:"👥",txt:"Jogadores"},
            ].filter(n=>!n.hide).map(n=>{
              const active=tela===n.id||(tela==="fechado"&&n.id==="cascata");
              return (
                <button key={n.id} onClick={()=>setTela(n.id)} style={{
                  background:active?C.greenBg:"transparent",
                  border:"none",cursor:"pointer",fontFamily:"inherit",fontSize:12,fontWeight:600,
                  color:active?C.green:C.textSub,padding:"6px 10px",borderRadius:8,
                  transition:"all .15s",whiteSpace:"nowrap"
                }}>
                  {n.icon} <span className="nav-txt">{n.txt}</span>
                </button>
              );
            })}
          </nav>
        </div>
      </div>

      <div style={{maxWidth:860,margin:"0 auto",padding:"18px 16px"}}>

        {/* CONFIG */}
        {tela==="config"&&(
          <div style={{animation:"fadeIn .3s ease"}}>
            <div style={{marginBottom:20}}>
              <h1 style={{fontSize:21,fontWeight:700,color:C.text,marginBottom:4}}>Montar Cascata de Convites</h1>
              <p style={{fontSize:13,color:C.textSub}}>Defina o slot · escolha categorias · o sistema envia em ondas até fechar 4 vagas</p>
            </div>

            {/* slot */}
            <div style={{background:"#fff",border:`1px solid ${C.border}`,borderRadius:14,padding:16,marginBottom:12}}>
              <div style={{fontSize:10,color:C.textMut,fontWeight:700,letterSpacing:1.2,textTransform:"uppercase",marginBottom:12}}>① Slot disponível</div>
              <div className="g3" style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:10,marginBottom:12}}>
                <div>
                  <div style={{fontSize:10,color:C.textSub,fontWeight:700,textTransform:"uppercase",letterSpacing:.9,marginBottom:5}}>Data</div>
                  <input type="date" min={today} style={inp} value={slot.data}
                    onChange={e=>setSlot(s=>({...s,data:e.target.value}))}/>
                  {slot.data&&<div style={{fontSize:10,color:C.green,marginTop:4,fontWeight:600}}>{diaSemana(slot.data)}-feira</div>}
                </div>
                <div>
                  <div style={{fontSize:10,color:C.textSub,fontWeight:700,textTransform:"uppercase",letterSpacing:.9,marginBottom:5}}>Horário</div>
                  <select style={inp} value={slot.hora} onChange={e=>setSlot(s=>({...s,hora:e.target.value}))}>
                    <option value="">Selecione...</option>
                    {HORAS.map(h=><option key={h}>{h}</option>)}
                  </select>
                </div>
                <div>
                  <div style={{fontSize:10,color:C.textSub,fontWeight:700,textTransform:"uppercase",letterSpacing:.9,marginBottom:5}}>Quadra</div>
                  <select style={inp} value={slot.quadra} onChange={e=>setSlot(s=>({...s,quadra:e.target.value}))}>
                    <option value="">Selecione...</option>
                    {QUADRAS.map(q=><option key={q} value={`Quadra ${q}`}>Quadra {q}</option>)}
                  </select>
                </div>
              </div>
              <div style={{display:"flex",gap:7,flexWrap:"wrap",alignItems:"center"}}>
                <span style={{fontSize:10,color:C.textMut,fontWeight:700,textTransform:"uppercase",letterSpacing:.9}}>Gênero:</span>
                {[{v:"M",l:"♂ Masculino",c:"#1D4ED8"},{v:"F",l:"♀ Feminino",c:"#BE185D"},{v:"Misto",l:"⚤ Misto",c:"#92400E"}].map(({v,l,c})=>(
                  <button key={v} onClick={()=>setSlot(s=>({...s,genero:v,catsAlvo:[]}))} style={{
                    background:slot.genero===v?c+"18":"#fff",border:`1.5px solid ${slot.genero===v?c:C.border}`,
                    color:slot.genero===v?c:C.textSub,borderRadius:99,padding:"5px 13px",
                    cursor:"pointer",fontFamily:"inherit",fontWeight:600,fontSize:12,transition:"all .15s"
                  }}>{l}</button>
                ))}
              </div>
              <div style={{marginTop:12,paddingTop:12,borderTop:`1px solid ${C.border}`}}>
                <div style={{fontSize:10,color:C.textSub,fontWeight:700,textTransform:"uppercase",letterSpacing:.9,marginBottom:5}}>
                  Seu nome na mensagem
                </div>
                <input style={{...inp,width:"100%"}} value={remetente}
                  onChange={e=>setRemetente(e.target.value)}
                  placeholder="Ex: Gabi da Profit"/>
                <div style={{fontSize:10,color:C.textMut,marginTop:4}}>
                  Aparece como: <em>"Oi, João! <strong>{remetente||"..."}</strong> aqui, tudo bem?!"</em>
                </div>
              </div>
            </div>

            {/* categorias */}
            <div style={{background:"#fff",border:`1px solid ${C.border}`,borderRadius:14,padding:16,marginBottom:12}}>
              <div style={{fontSize:10,color:C.textMut,fontWeight:700,letterSpacing:1.2,textTransform:"uppercase",marginBottom:6}}>② Categoria(s) alvo</div>
              <div style={{fontSize:12,color:C.textSub,marginBottom:10}}>
                {slot.catsAlvo.length===0?"⚡ Nenhuma — definida pelo 1º que aceitar":`${slot.catsAlvo.length} selecionada(s)`}
              </div>
              <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
                {(slot.genero==="F"?CATS_F:CATS_ALL).map(c=>(
                  <button key={c} onClick={()=>toggleCat(c)} style={{
                    background:slot.catsAlvo.includes(c)?CAT_BG[c]:"#fff",
                    border:`1.5px solid ${slot.catsAlvo.includes(c)?CAT_BOR[c]:C.border}`,
                    color:slot.catsAlvo.includes(c)?CAT_FG[c]:C.textSub,
                    borderRadius:99,padding:"5px 13px",cursor:"pointer",fontFamily:"inherit",
                    fontWeight:700,fontSize:12,transition:"all .15s"
                  }}>{slot.catsAlvo.includes(c)?"✓ ":""}{c}</button>
                ))}
                {slot.catsAlvo.length>0&&(
                  <button onClick={()=>setSlot(s=>({...s,catsAlvo:[]}))} style={{
                    background:"#fff",border:`1.5px solid #FCA5A5`,color:C.red,
                    borderRadius:99,padding:"5px 13px",cursor:"pointer",fontFamily:"inherit",fontWeight:600,fontSize:11
                  }}>✕ Limpar</button>
                )}
              </div>
            </div>

            {/* ranking */}
            {candidatos.length>0&&(
              <div style={{marginBottom:14}}>
                <div style={{fontSize:10,color:C.textMut,fontWeight:700,letterSpacing:1.2,
                  textTransform:"uppercase",marginBottom:10}}>
                  ③ Ranking — {candidatos.length} candidato(s)
                  <span style={{color:candidatosSemPreConf.length>=vagasAbertas?C.green:C.red,marginLeft:8}}>
                    {candidatosSemPreConf.length>=vagasAbertas?"✓ ok":`⚠ faltam ${vagasAbertas-candidatosSemPreConf.length}`}
                  </span>
                </div>
                <div style={{display:"flex",flexDirection:"column",gap:5}}>
                  {candidatos.slice(0,12).map((j,i)=>{
                    const isPreConf=preConfirmados.includes(j.id);
                    return (
                      <div key={j.id} style={{display:"flex",alignItems:"center",gap:8,
                        padding:"8px 12px",borderRadius:10,background:"#fff",
                        border:`1.5px solid ${isPreConf?C.greenBor:i<8&&!isPreConf?"#E2E8F0":C.border}`,
                        opacity:isPreConf?1:preConfirmados.length>=4?.4:1}}>
                        <div style={{fontSize:10,color:C.textMut,fontWeight:700,width:18,textAlign:"right",flexShrink:0}}>#{i+1}</div>
                        <Avatar nome={j.nome} size={30} g={j.g} highlight={isPreConf}/>
                        <div style={{flex:1,minWidth:0}}>
                          <div style={{display:"flex",gap:5,alignItems:"center",marginBottom:3,flexWrap:"wrap"}}>
                            <span style={{fontWeight:600,fontSize:13,color:C.text}}>{j.nome}</span>
                            <GenBadge g={j.g}/>
                          </div>
                          <div style={{display:"flex",gap:5,alignItems:"center",flexWrap:"wrap"}}>
                            <CatPill cat={j.cat}/><ScoreDot score={j.score}/>
                          </div>
                        </div>
                        <button onClick={()=>setPreConfirmados(prev=>
                          prev.includes(j.id)?prev.filter(x=>x!==j.id):prev.length<3?[...prev,j.id]:prev
                        )} style={{
                          fontSize:10,fontWeight:700,borderRadius:99,padding:"4px 10px",
                          cursor:(!preConfirmados.includes(j.id)&&preConfirmados.length>=3)?"not-allowed":"pointer",
                          border:`1.5px solid ${isPreConf?C.green:C.border}`,
                          background:isPreConf?C.greenBg:"#fff",
                          color:isPreConf?C.green:C.textSub,
                          fontFamily:"inherit",whiteSpace:"nowrap",transition:"all .15s"
                        }}>
                          {isPreConf?"✅ Confirmado":"+ Pré-confirmar"}
                        </button>
                      </div>
                    );
                  })}
                  {candidatos.length>12&&<div style={{fontSize:11,color:C.textMut,textAlign:"center",padding:"5px 0"}}>
                    +{candidatos.length-12} mais na fila...
                  </div>}
                </div>
              </div>
            )}

            {/* pré-confirmados resumo */}
            {preConfirmados.length>0&&(
              <div style={{background:C.greenBg,border:`1px solid ${C.greenBor}`,borderRadius:12,
                padding:"12px 14px",marginBottom:14}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
                  <div style={{fontSize:10,color:C.green,fontWeight:700,textTransform:"uppercase",letterSpacing:.9}}>
                    ✅ Já confirmados ({preConfirmados.length}/4) — faltam {vagasAbertas} vaga(s)
                  </div>
                  <button onClick={()=>setPreConfirmados([])} style={{fontSize:11,color:C.red,
                    background:"#fff",border:`1px solid #FCA5A5`,borderRadius:99,
                    padding:"2px 10px",cursor:"pointer",fontFamily:"inherit",fontWeight:600}}>
                    Limpar
                  </button>
                </div>
                <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
                  {candidatos.filter(j=>preConfirmados.includes(j.id)).map(j=>(
                    <span key={j.id} style={{display:"inline-flex",alignItems:"center",gap:5,
                      background:"#fff",color:C.green,borderRadius:99,
                      padding:"5px 12px",fontSize:12,fontWeight:600,border:`1px solid ${C.greenBor}`}}>
                      <Avatar nome={j.nome} size={20} g={j.g} highlight/>
                      {j.nome.split(" ")[0]}
                      <button onClick={()=>setPreConfirmados(p=>p.filter(x=>x!==j.id))}
                        style={{background:"none",border:"none",cursor:"pointer",
                          color:C.textMut,fontSize:14,lineHeight:1,padding:0,marginLeft:2}}>×</button>
                    </span>
                  ))}
                </div>
                {vagasAbertas>0&&<div style={{fontSize:11,color:C.textSub,marginTop:8}}>
                  A cascata vai buscar <strong>{vagasAbertas}</strong> jogador(es) para completar o jogo.
                  Os convites mostrarão quem já está confirmado.
                </div>}
              </div>
            )}

            {slot.data&&slot.hora&&candidatosSemPreConf.length<vagasAbertas&&vagasAbertas>0&&(
              <div style={{background:C.redBg,border:`1px solid #FCA5A5`,borderRadius:10,
                padding:"10px 14px",marginBottom:12,fontSize:12,color:C.red}}>
                ⚠️ Apenas {candidatosSemPreConf.length} candidato(s) disponível(is) para as {vagasAbertas} vaga(s). Ajuste as categorias ou o gênero.
              </div>
            )}

            <button onClick={iniciarCascata} disabled={!slotOk} style={{
              width:"100%",padding:14,fontSize:15,fontWeight:700,borderRadius:12,
              border:"none",cursor:slotOk?"pointer":"not-allowed",fontFamily:"inherit",
              background:slotOk?C.green:"#E2E8F0",color:slotOk?"#fff":C.textMut,transition:"all .2s"
            }}>
              {preConfirmados.length>0
                ?`⚡ Buscar ${vagasAbertas} jogador(es) para completar o jogo`
                :"⚡ Disparar Cascata de Convites"}
            </button>
            {!slotOk&&<p style={{fontSize:11,color:C.textMut,textAlign:"center",marginTop:8}}>
              {!slot.data||!slot.hora||!slot.quadra?"Preencha data, horário e quadra":"Candidatos insuficientes para as vagas em aberto"}
            </p>}
          </div>
        )}

        {/* CASCATA */}
        {(tela==="cascata"||tela==="fechado")&&jogo&&(
          <CascataView jogo={jogo} onResponder={responder}
            onNovoJogo={novoJogo} onCancelar={cancelarJogo}
            onMsg={setMsgModal} fireToast={fireToast} remetente={remetente}/>
        )}

        {/* HISTÓRICO */}
        {tela==="historico"&&(
          <div style={{animation:"fadeIn .3s ease"}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
              <div>
                <h2 style={{fontSize:20,fontWeight:700,color:C.text}}>Histórico</h2>
                <p style={{fontSize:12,color:C.textSub}}>{historico.length} jogo(s)</p>
              </div>
              <Btn variant="ghost" onClick={()=>setTela("config")}>+ Novo Jogo</Btn>
            </div>
            {historico.length===0?(
              <div style={{textAlign:"center",padding:"60px 0",color:C.textMut}}>
                <div style={{fontSize:40,marginBottom:12}}>📋</div>
                <div style={{fontWeight:700,fontSize:16,color:C.text}}>Nenhum jogo registrado</div>
              </div>
            ):historico.map((h,i)=>(
              <div key={i} style={{background:"#fff",border:`1px solid ${C.border}`,borderRadius:14,
                padding:14,marginBottom:10,borderLeft:`3px solid ${C.green}`}}>
                <div style={{display:"flex",gap:5,marginBottom:10,flexWrap:"wrap"}}>
                  {[`📅 ${diaSemana(h.slot.data)}, ${fmtData(h.slot.data)}`,`🕐 ${h.slot.hora}`,`🏟️ ${h.slot.quadra}`].map((t,j)=>(
                    <span key={j} style={{fontSize:11,background:C.bg,border:`1px solid ${C.border}`,
                      borderRadius:99,padding:"3px 9px",color:C.textSub}}>{t}</span>
                  ))}
                  {h.catDefinida&&<span style={{fontSize:11,color:CAT_FG[h.catDefinida],fontWeight:700,
                    background:CAT_BG[h.catDefinida],border:`1px solid ${CAT_BOR[h.catDefinida]}`,
                    borderRadius:99,padding:"3px 9px"}}>🏅 {h.catDefinida}</span>}
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
              </div>
            ))}
          </div>
        )}

        {/* JOGADORES */}
        {tela==="jogadores"&&(
          <JogadoresView jogadores={jogadores} setJogadores={setJogadores} fireToast={fireToast}/>
        )}
      </div>

      {msgModal&&<MsgModal {...msgModal} onClose={()=>setMsgModal(null)} fireToast={fireToast}/>}

      {/* ALERTA AO OPERADOR */}
      {alertaOperador&&(
        <AlertaOperador
          alerta={alertaOperador}
          onClose={()=>setAlertaOperador(null)}
          onNovoSlot={()=>{setAlertaOperador(null);setTela("config");}}
        />
      )}

      {toast&&(
        <div style={{position:"fixed",bottom:20,left:"50%",transform:"translateX(-50%)",
          background:toast.ok?"#fff":C.redBg,
          border:`1.5px solid ${toast.ok?C.greenBor:"#FCA5A5"}`,
          borderRadius:10,padding:"10px 20px",fontSize:13,fontWeight:700,
          color:toast.ok?C.green:C.red,zIndex:999,whiteSpace:"nowrap",
          boxShadow:"0 4px 20px rgba(0,0,0,.1)",animation:"fadeIn .25s ease"}}>
          {toast.msg}
        </div>
      )}
    </div>
  );
}
