import { useState, useEffect, useRef, useCallback, useMemo } from "react";

// ─── CONSTANTS ────────────────────────────────────────────────────────────────
const HORAS = ["08:00","09:00","10:00","11:00","12:00","13:00","14:00",
               "15:00","16:00","17:00","18:00","19:00","20:00","21:00","22:00"];
const QUADRAS = [1,2,3,4];
const CATS_M   = ["2ª","3ª","4ª","5ª","6ª","Iniciante"];
const CATS_F   = ["3ª","4ª","5ª","6ª","Iniciante"];
const CATS_ALL = ["2ª","3ª","4ª","5ª","6ª","Iniciante"];
const NIVEL    = {"2ª":90,"3ª":75,"4ª":60,"5ª":45,"6ª":30,"Iniciante":15};
const TIMER_DEMO = 20; // segundos na demo (real = 15 min)

const CAT_COLOR = {
  "2ª":"#FF6B6B","3ª":"#FF9F43","4ª":"#FFE66D",
  "5ª":"#6BFF9E","6ª":"#6BCFFF","Iniciante":"#CF9FFF"
};

// ─── JOGADORES DEMO ───────────────────────────────────────────────────────────
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

// ─── UTILS ────────────────────────────────────────────────────────────────────
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

function scoreJogador(j, diaNome, hora) {
  let s = 0;
  if (j.dias.includes(diaNome)) s += 50;
  if (j.hrs.includes(hora))     s += 50;
  return s;
}

// Filtra candidatos pelas regras de gênero e categoria
function filtrarCandidatos(jogadores, genero, catsAlvo, diaNome, hora) {
  return jogadores.filter(j => {
    // regra de gênero
    if (genero === "M" && j.g !== "M") return false;
    if (genero === "F" && j.g !== "F") return false;
    if (genero === "Misto" && !j.aceitaMisto) return false;
    // regra de categoria (vazio = sem filtro)
    if (catsAlvo.length > 0 && !catsAlvo.includes(j.cat)) return false;
    return true;
  }).map(j => ({
    ...j,
    score: scoreJogador(j, diaNome, hora)
  })).sort((a,b) => b.score - a.score);
}

function melhorDuplas(grupo4) {
  const opts = [
    [[grupo4[0],grupo4[1]],[grupo4[2],grupo4[3]]],
    [[grupo4[0],grupo4[2]],[grupo4[1],grupo4[3]]],
  ];
  return opts.reduce((best,[d1,d2]) => {
    const diff = Math.abs(
      (NIVEL[d1[0].cat]+NIVEL[d1[1].cat])/2 -
      (NIVEL[d2[0].cat]+NIVEL[d2[1].cat])/2
    );
    const sc = Math.round(100 - diff);
    return sc > best.sc ? {sc,d1,d2} : best;
  },{sc:-1,d1:[],d2:[]});
}

function buildMsgConvite(j, slot) {
  const ds = diaSemana(slot.data);
  return `Olá, ${j.nome.split(" ")[0]}! 👋\n\nTenho uma vaga de padel para você:\n\n📅 *${ds}, ${fmtData(slot.data)}*\n🕐 *${slot.hora}*\n🏟️ *Quadra ${slot.quadra}*\n\nVocê topa? Responda *SIM* ou *NÃO* 🎾\n\n_Aguardo em até 15 minutos_ ⏳`;
}
function buildMsgFechado(d1,d2,slot,catJogo) {
  const todos = [...(d1||[]),...(d2||[])];
  const ds = diaSemana(slot.data);
  return `🎾 *JOGO CONFIRMADO!*\n\n📅 ${ds}, ${fmtData(slot.data)}  🕐 ${slot.hora}  🏟️ Quadra ${slot.quadra}${catJogo?`\n🏅 Categoria ${catJogo}`:""}\n\n*${(d1||[]).map(j=>j.nome.split(" ")[0]).join(" & ")}*\n        ×\n*${(d2||[]).map(j=>j.nome.split(" ")[0]).join(" & ")}*\n\n${todos.map(j=>`• ${j.nome} — ${j.cat} cat.`).join("\n")}\n\n✅ Confirme presença respondendo esta mensagem.\n❌ Desistência com 24h de antecedência.\n\n_Nos vemos na quadra!_ 🏟️`;
}

// ─── UI ATOMS ─────────────────────────────────────────────────────────────────
function Avatar({nome,size=36,glow,g}) {
  const gc = g==="F"?"#FF9FDB":g==="M"?"#6BCFFF":"#C8A96E";
  return (
    <div style={{
      width:size,height:size,borderRadius:"50%",flexShrink:0,
      background:"#10182e",
      border:`2px solid ${glow?gc:"#1e2d4a"}`,
      boxShadow:glow?`0 0 14px ${gc}55`:"none",
      display:"flex",alignItems:"center",justifyContent:"center",
      fontSize:size*.38,fontWeight:800,
      color:glow?gc:"#3a5070",transition:"all .3s"
    }}>{nome[0]}</div>
  );
}

function CatPill({cat,size=10}) {
  return (
    <span style={{
      background:CAT_COLOR[cat]+"22",color:CAT_COLOR[cat],
      border:`1px solid ${CAT_COLOR[cat]}55`,
      fontSize:size,fontWeight:800,padding:"2px 8px",borderRadius:99,whiteSpace:"nowrap"
    }}>{cat}</span>
  );
}

function GenBadge({g}) {
  const cfg = {M:{c:"#6BCFFF",l:"♂"},F:{c:"#FF9FDB",l:"♀"},Misto:{c:"#C8A96E",l:"⚤"}};
  const {c,l} = cfg[g]||cfg.M;
  return <span style={{color:c,fontSize:11,fontWeight:800}}>{l}</span>;
}

function ScoreDot({score}) {
  const c = score>=80?"#6BFF9E":score>=50?"#FFE66D":"#FF9F43";
  return (
    <div style={{display:"flex",alignItems:"center",gap:5}}>
      <div style={{width:6,height:6,borderRadius:"50%",background:c,flexShrink:0,
        boxShadow:`0 0 6px ${c}`}}/>
      <div style={{width:38,height:3,background:"#1a2840",borderRadius:2,overflow:"hidden"}}>
        <div style={{width:`${score}%`,height:"100%",background:c,borderRadius:2}}/>
      </div>
    </div>
  );
}

function Chip({children,active,onClick,color="#6BFF9E",disabled}) {
  return (
    <button onClick={!disabled?onClick:undefined} style={{
      background:active?`${color}18`:"transparent",
      border:`1.5px solid ${active?color:"#1e2d4a"}`,
      color:active?color:"#3a5070",
      borderRadius:99,padding:"5px 13px",fontSize:11,fontWeight:700,
      cursor:disabled?"default":"pointer",fontFamily:"inherit",
      transition:"all .18s",whiteSpace:"nowrap",
      opacity:disabled?.4:1
    }}>{children}</button>
  );
}

function Btn({children,onClick,variant="primary",disabled,style={}}) {
  const v = {
    primary:{background:"#6BFF9E",color:"#000",padding:"11px 22px",fontSize:13,
      boxShadow:disabled?"none":"0 0 24px #6BFF9E44",opacity:disabled?.35:1},
    ghost:{background:"transparent",border:"1.5px solid #1e2d4a",color:"#4a6090",padding:"9px 16px",fontSize:12},
    danger:{background:"transparent",border:"1.5px solid #FF6B6B",color:"#FF6B6B",padding:"7px 14px",fontSize:12},
  };
  return (
    <button onClick={!disabled?onClick:undefined} style={{
      border:"none",cursor:disabled?"not-allowed":"pointer",fontFamily:"inherit",
      fontWeight:800,borderRadius:10,transition:"all .18s",...v[variant],...style
    }}>{children}</button>
  );
}

function TimerRing({seg,total,size=70}) {
  const r=(size-8)/2, circ=2*Math.PI*r, pct=seg/total;
  const c=pct>.5?"#6BFF9E":pct>.25?"#FFE66D":"#FF6B6B";
  return (
    <div style={{position:"relative",width:size,height:size,flexShrink:0}}>
      <svg width={size} height={size} style={{transform:"rotate(-90deg)"}}>
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="#1a2840" strokeWidth={6}/>
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={c} strokeWidth={6}
          strokeDasharray={circ} strokeDashoffset={circ*(1-pct)} strokeLinecap="round"
          style={{transition:"stroke-dashoffset 1s linear,stroke .5s"}}/>
      </svg>
      <div style={{position:"absolute",inset:0,display:"flex",flexDirection:"column",
        alignItems:"center",justifyContent:"center"}}>
        <span style={{fontSize:14,fontWeight:900,color:c,fontFamily:"'Space Mono',monospace",lineHeight:1}}>{fmtTempo(seg)}</span>
        <span style={{fontSize:8,color:"#2a4060",marginTop:1,letterSpacing:1}}>ONDA</span>
      </div>
    </div>
  );
}

function StatusPill({status}) {
  const cfg={
    pendente:  {c:"#FFE66D",bg:"#FFE66D14",i:"⏳",l:"Aguardando"},
    confirmado:{c:"#6BFF9E",bg:"#6BFF9E14",i:"✅",l:"Confirmado"},
    recusou:   {c:"#FF6B6B",bg:"#FF6B6B14",i:"❌",l:"Recusou"},
    expirado:  {c:"#555",   bg:"#55555514",i:"⌛",l:"Sem resposta"},
    aguardando:{c:"#2a4060",bg:"transparent",i:"🔜",l:"Na fila"},
  };
  const {c,bg,i,l}=cfg[status]||cfg.aguardando;
  return (
    <span style={{fontSize:10,color:c,fontWeight:800,background:bg,
      border:`1px solid ${c}33`,borderRadius:99,padding:"2px 9px",whiteSpace:"nowrap"}}>
      {i} {l}
    </span>
  );
}

// ─── MSG MODAL ────────────────────────────────────────────────────────────────
function MsgModal({titulo,texto,tel,onClose,fireToast}) {
  const [ok,setOk]=useState(false);
  function copiar(){
    navigator.clipboard.writeText(texto).then(()=>{
      setOk(true); fireToast("Copiado! Cole no WhatsApp 📋");
      setTimeout(()=>setOk(false),2000);
    });
  }
  return (
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,.88)",zIndex:200,
      display:"flex",alignItems:"center",justifyContent:"center",padding:16}}
      onClick={onClose}>
      <div style={{background:"#0c1526",border:"1.5px solid #1a2840",borderRadius:18,
        padding:26,width:"100%",maxWidth:480,maxHeight:"88vh",overflowY:"auto"}}
        onClick={e=>e.stopPropagation()}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
          <h3 style={{fontSize:15,fontWeight:800,color:"#25D366"}}>📱 {titulo}</h3>
          <button onClick={onClose} style={{background:"none",border:"none",cursor:"pointer",color:"#3a5070",fontSize:18}}>✕</button>
        </div>
        {tel&&<div style={{fontSize:11,color:"#3a5070",marginBottom:10}}>
          Para: <span style={{color:"#6BFF9E",fontWeight:700}}>{tel}</span>
        </div>}
        <div style={{background:"#060e1c",border:"1px solid #1a2840",borderRadius:12,
          padding:"14px 16px",fontSize:12,lineHeight:1.75,whiteSpace:"pre-wrap",
          color:"#a0b8d8",marginBottom:16,fontFamily:"'Space Mono',monospace",
          maxHeight:300,overflowY:"auto"}}>{texto}</div>
        <div style={{display:"flex",gap:8}}>
          <button onClick={copiar} style={{flex:1,border:ok?"1.5px solid #6BFF9E":"none",
            cursor:"pointer",fontFamily:"inherit",fontWeight:800,borderRadius:10,fontSize:13,
            padding:"11px 0",background:ok?"#071c0e":"#25D366",color:ok?"#6BFF9E":"#000",
            transition:"all .2s"}}>
            {ok?"✅ Copiado!":"📋 Copiar mensagem"}
          </button>
          <button onClick={onClose} style={{background:"transparent",border:"1.5px solid #1e2d4a",
            color:"#4a6090",borderRadius:10,padding:"11px 18px",fontFamily:"inherit",
            fontWeight:700,cursor:"pointer",fontSize:13}}>Fechar</button>
        </div>
      </div>
    </div>
  );
}

// ─── CANDIDATO ROW ────────────────────────────────────────────────────────────
function CandRow({j,onSim,onNao,onMsg,slot,delay=0}) {
  return (
    <div style={{display:"flex",alignItems:"center",gap:10,padding:"11px 14px",
      borderRadius:12,background:"#0c1526",
      border:`1.5px solid ${onSim?"#FFE66D33":"#1a2840"}`,
      animation:`fadeIn .3s ease ${delay}ms both`,transition:"border .2s"}}>
      <Avatar nome={j.nome} size={34}
        glow={j.status==="confirmado"||j.status==="pendente"}
        g={j.g}/>
      <div style={{flex:1,minWidth:0}}>
        <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:3}}>
          <span style={{fontWeight:700,fontSize:13}}>{j.nome}</span>
          <GenBadge g={j.g}/>
          {j.aceitaMisto&&j.g!=="Misto"&&<span style={{fontSize:9,color:"#C8A96E",fontWeight:700}}>⚤misto</span>}
        </div>
        <div style={{display:"flex",gap:6,alignItems:"center",flexWrap:"wrap"}}>
          <CatPill cat={j.cat}/>
          <ScoreDot score={j.score||0}/>
          {j.ondaEnviado&&<span style={{fontSize:9,color:"#2a4060",fontWeight:700}}>Onda {j.ondaEnviado}</span>}
        </div>
      </div>
      <StatusPill status={j.status}/>
      <div style={{display:"flex",gap:5,flexShrink:0}}>
        <button onClick={()=>onMsg({titulo:`Convite — ${j.nome.split(" ")[0]}`,texto:buildMsgConvite(j,slot),tel:j.tel})}
          style={{background:"none",border:"1px solid #1a2840",borderRadius:8,
            padding:"5px 9px",cursor:"pointer",fontSize:12,color:"#3a5070",
            fontFamily:"inherit",fontWeight:700,transition:"all .15s"}}
          onMouseEnter={e=>e.currentTarget.style.borderColor="#6BFF9E"}
          onMouseLeave={e=>e.currentTarget.style.borderColor="#1a2840"}>📋</button>
        {onSim&&<>
          <button onClick={onSim} style={{background:"#6BFF9E18",border:"1px solid #6BFF9E44",
            borderRadius:8,padding:"5px 12px",cursor:"pointer",fontSize:11,
            color:"#6BFF9E",fontFamily:"inherit",fontWeight:800}}>SIM</button>
          <button onClick={onNao} style={{background:"#FF6B6B18",border:"1px solid #FF6B6B44",
            borderRadius:8,padding:"5px 12px",cursor:"pointer",fontSize:11,
            color:"#FF6B6B",fontFamily:"inherit",fontWeight:800}}>NÃO</button>
        </>}
      </div>
    </div>
  );
}

function SLabel({label,color="#2a4060"}) {
  return <div style={{fontSize:9,color,fontWeight:800,letterSpacing:1.2,
    textTransform:"uppercase",marginTop:8,marginBottom:4,paddingLeft:2}}>{label}</div>;
}

// ─── CASCATA VIEW ─────────────────────────────────────────────────────────────
function CascataView({jogo,onResponder,onNovoJogo,onCancelar,onMsg,fireToast}) {
  const conf  = jogo.fila.filter(j=>j.status==="confirmado");
  const pend  = jogo.fila.filter(j=>j.status==="pendente");
  const recus = jogo.fila.filter(j=>j.status==="recusou"||j.status==="expirado");
  const fila  = jogo.fila.filter(j=>j.status==="aguardando");
  const fechado = jogo.status==="fechado";
  const catJogo = jogo.catDefinida||"";

  return (
    <div style={{animation:"fadeIn .35s ease"}}>
      {/* header */}
      <div style={{display:"flex",alignItems:"flex-start",justifyContent:"space-between",
        marginBottom:20,gap:12,flexWrap:"wrap"}}>
        <div>
          <h2 style={{fontSize:22,fontWeight:800,marginBottom:6}}>
            {fechado?"🎾 Jogo Fechado!":"📡 Cascata Ativa"}
          </h2>
          <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
            {[
              `📅 ${diaSemana(jogo.slot.data)}, ${fmtData(jogo.slot.data)}`,
              `🕐 ${jogo.slot.hora}`,
              `🏟️ Quadra ${jogo.slot.quadra}`,
              jogo.slot.genero==="Misto"?"⚤ Misto":jogo.slot.genero==="F"?"♀ Feminino":"♂ Masculino",
            ].map((t,i)=>(
              <span key={i} style={{fontSize:11,background:"#111e35",
                border:"1px solid #1a2840",borderRadius:99,padding:"3px 10px",color:"#5a7090"}}>{t}</span>
            ))}
            {catJogo&&<span style={{fontSize:11,color:CAT_COLOR[catJogo],fontWeight:700,
              background:CAT_COLOR[catJogo]+"18",border:`1px solid ${CAT_COLOR[catJogo]}44`,
              borderRadius:99,padding:"3px 10px"}}>🏅 {catJogo}</span>}
          </div>
        </div>
        <div style={{display:"flex",gap:8,alignItems:"center"}}>
          {!fechado&&<TimerRing seg={jogo.timer} total={TIMER_DEMO}/>}
          {!fechado&&<Btn variant="danger" onClick={onCancelar} style={{fontSize:11}}>Cancelar</Btn>}
          {fechado&&<Btn onClick={onNovoJogo}>+ Novo Jogo</Btn>}
        </div>
      </div>

      {/* barra progresso */}
      {!fechado&&(
        <div style={{background:"#6BFF9E0a",border:"1px solid #6BFF9E22",
          borderRadius:12,padding:"12px 16px",marginBottom:16,
          display:"flex",alignItems:"center",gap:12}}>
          <div style={{fontSize:24}}>⚡</div>
          <div style={{flex:1}}>
            <div style={{fontWeight:800,fontSize:14,marginBottom:2}}>
              Onda {jogo.ondaAtual} — {pend.length} convite(s) pendente(s)
            </div>
            <div style={{fontSize:12,color:"#3a5575"}}>
              {conf.length}/4 confirmados · {fila.length} na fila · {recus.length} recusa(s)/expirado(s)
            </div>
          </div>
          <div style={{textAlign:"right",flexShrink:0}}>
            <div style={{fontFamily:"'Space Mono',monospace",fontSize:26,fontWeight:700,
              color:"#6BFF9E",lineHeight:1}}>{conf.length}<span style={{color:"#1a3050"}}>/4</span></div>
            <div style={{fontSize:10,color:"#2a4060"}}>vagas</div>
          </div>
        </div>
      )}

      {/* duplas (fechado) */}
      {fechado&&jogo.dupla1&&(
        <div style={{background:"#0c1526",border:"1.5px solid #6BFF9E55",borderRadius:14,
          padding:20,marginBottom:16,boxShadow:"0 0 30px #6BFF9E12"}}>
          <div style={{fontSize:9,color:"#6BFF9E",fontWeight:800,letterSpacing:1.2,
            textTransform:"uppercase",marginBottom:12}}>
            Duplas formadas · Equilíbrio {jogo.scoreEquilibrio}pts
          </div>
          <div style={{display:"grid",gridTemplateColumns:"1fr auto 1fr",gap:10,alignItems:"center",marginBottom:14}}>
            {[jogo.dupla1,jogo.dupla2].map((dupla,di)=>(
              <div key={di} style={{background:"#060e1c",borderRadius:10,padding:"12px 14px"}}>
                <div style={{fontSize:9,color:"#6BFF9E",fontWeight:800,letterSpacing:1,
                  textTransform:"uppercase",marginBottom:8}}>Dupla {di+1}</div>
                {dupla.map(j=>(
                  <div key={j.id} style={{display:"flex",alignItems:"center",gap:7,marginBottom:7}}>
                    <Avatar nome={j.nome} size={28} glow g={j.g}/>
                    <div>
                      <div style={{fontSize:12,fontWeight:700}}>{j.nome}</div>
                      <div style={{display:"flex",gap:4,alignItems:"center"}}>
                        <CatPill cat={j.cat} size={9}/>
                        <GenBadge g={j.g}/>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ))}
            <div style={{fontFamily:"'Space Mono',monospace",fontSize:20,fontWeight:700,
              color:"#6BFF9E",textAlign:"center"}}>VS</div>
          </div>
          <Btn variant="ghost" style={{width:"100%",borderColor:"#25D36644",color:"#25D366",
            background:"#25D36612",fontSize:12}}
            onClick={()=>onMsg({titulo:"Jogo Fechado — Enviar para todos",
              texto:buildMsgFechado(jogo.dupla1,jogo.dupla2,jogo.slot,catJogo)})}>
            📋 Copiar mensagem de jogo fechado
          </Btn>
        </div>
      )}

      {/* listas */}
      <div style={{display:"flex",flexDirection:"column",gap:7}}>
        {conf.length>0&&<SLabel label={`✅ Confirmados (${conf.length}/4)`} color="#6BFF9E"/>}
        {conf.map((j,i)=><CandRow key={j.id} j={j} onMsg={onMsg} slot={jogo.slot} delay={i*30}/>)}

        {pend.length>0&&<SLabel label={`⏳ Aguardando resposta — Onda ${jogo.ondaAtual}`} color="#FFE66D"/>}
        {pend.map((j,i)=><CandRow key={j.id} j={j} onMsg={onMsg} slot={jogo.slot} delay={i*30}
          onSim={!fechado?()=>onResponder(j.id,"sim"):null}
          onNao={!fechado?()=>onResponder(j.id,"nao"):null}/>)}

        {recus.length>0&&<SLabel label={`❌ Recusaram / Sem resposta (${recus.length})`} color="#555"/>}
        {recus.map((j,i)=><CandRow key={j.id} j={j} onMsg={onMsg} slot={jogo.slot} delay={i*20}/>)}

        {fila.length>0&&<SLabel label={`🔜 Na fila (${fila.length})`} color="#2a4060"/>}
        {fila.map((j,i)=><CandRow key={j.id} j={j} onMsg={onMsg} slot={jogo.slot} delay={i*15}/>)}
      </div>
    </div>
  );
}

// ─── JOGADORES VIEW ───────────────────────────────────────────────────────────
function JogadoresView({jogadores,setJogadores,fireToast}) {
  const [gf,setGf]=useState("M");
  const [showForm,setShowForm]=useState(false);
  const FORM0={nome:"",g:"M",cat:"4ª",tel:"",dias:[],hrs:[],aceitaMisto:false};
  const [form,setForm]=useState(FORM0);
  const DIAS=["Seg","Ter","Qua","Qui","Sex","Sáb","Dom"];

  function toggleArr(field,val){setForm(f=>({...f,[field]:f[field].includes(val)?f[field].filter(x=>x!==val):[...f[field],val]}))}
  function salvar(){
    if(!form.nome.trim()||!form.tel.trim()){fireToast("Preencha nome e telefone",false);return;}
    setJogadores(p=>[...p,{...form,id:Date.now()}]);
    setShowForm(false);setForm(FORM0);
    fireToast(`${form.nome} cadastrado! ✅`);
  }

  const list=jogadores.filter(j=>j.g===gf);

  return (
    <div style={{animation:"fadeIn .4s ease"}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:20}}>
        <div>
          <h2 style={{fontSize:22,fontWeight:800}}>Jogadores</h2>
          <p style={{fontSize:12,color:"#3a5070"}}>{jogadores.length} cadastrado(s)</p>
        </div>
        <Btn onClick={()=>setShowForm(true)}>+ Novo</Btn>
      </div>
      <div style={{display:"flex",gap:8,marginBottom:18}}>
        {["M","F"].map(g=>(
          <Chip key={g} active={gf===g} onClick={()=>setGf(g)}>
            {g==="M"?"♂ Masculino":"♀ Feminino"} ({jogadores.filter(j=>j.g===g).length})
          </Chip>
        ))}
      </div>
      <div style={{display:"flex",flexDirection:"column",gap:7}}>
        {list.map(j=>(
          <div key={j.id} style={{display:"flex",alignItems:"center",gap:10,padding:"11px 14px",
            borderRadius:12,background:"#0c1526",border:"1px solid #1a2840"}}>
            <Avatar nome={j.nome} size={34} g={j.g}/>
            <div style={{flex:1}}>
              <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:3}}>
                <span style={{fontWeight:700,fontSize:13}}>{j.nome}</span>
                {j.aceitaMisto&&<span style={{fontSize:9,color:"#C8A96E",fontWeight:700,
                  background:"#C8A96E18",border:"1px solid #C8A96E44",borderRadius:99,padding:"1px 6px"}}>⚤ aceita misto</span>}
              </div>
              <div style={{display:"flex",gap:5,flexWrap:"wrap"}}>
                <CatPill cat={j.cat}/>
                {j.dias.map(d=><span key={d} style={{fontSize:9,background:"#111e35",
                  border:"1px solid #1a2840",borderRadius:99,padding:"2px 7px",color:"#4a6080"}}>{d}</span>)}
              </div>
            </div>
            <div style={{fontSize:11,color:"#2a4060",textAlign:"right"}}>
              <div>{j.tel}</div>
              <div style={{marginTop:3,color:"#3a5070"}}>Nível {NIVEL[j.cat]}</div>
            </div>
          </div>
        ))}
      </div>

      {showForm&&(
        <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,.88)",zIndex:200,
          display:"flex",alignItems:"center",justifyContent:"center",padding:16}}
          onClick={()=>setShowForm(false)}>
          <div style={{background:"#0c1526",border:"1.5px solid #1a2840",borderRadius:18,
            padding:26,width:"100%",maxWidth:480,maxHeight:"88vh",overflowY:"auto"}}
            onClick={e=>e.stopPropagation()}>
            <h3 style={{fontSize:16,fontWeight:800,marginBottom:18}}>Novo Jogador</h3>
            <div style={{display:"flex",flexDirection:"column",gap:13}}>
              {[{l:"Nome completo",f:"nome",ph:"Ex: João Silva",type:"text"},
                {l:"Telefone WhatsApp",f:"tel",ph:"11999990000",type:"text"}].map(({l,f,ph,type})=>(
                <div key={f}>
                  <div style={{fontSize:10,color:"#3a5070",fontWeight:800,textTransform:"uppercase",
                    letterSpacing:1,marginBottom:5}}>{l}</div>
                  <input type={type} style={{background:"#060e1c",border:"1.5px solid #1a2840",
                    borderRadius:9,padding:"9px 13px",color:"#c8d8f0",fontFamily:"inherit",
                    fontSize:13,width:"100%",outline:"none"}}
                    value={form[f]} onChange={e=>setForm(x=>({...x,[f]:e.target.value}))} placeholder={ph}/>
                </div>
              ))}
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
                <div>
                  <div style={{fontSize:10,color:"#3a5070",fontWeight:800,textTransform:"uppercase",letterSpacing:1,marginBottom:5}}>Gênero</div>
                  <select style={{background:"#060e1c",border:"1.5px solid #1a2840",borderRadius:9,
                    padding:"9px 13px",color:"#c8d8f0",fontFamily:"inherit",fontSize:13,width:"100%",outline:"none"}}
                    value={form.g} onChange={e=>setForm(f=>({...f,g:e.target.value,cat:"4ª"}))}>
                    <option value="M">Masculino</option>
                    <option value="F">Feminino</option>
                  </select>
                </div>
                <div>
                  <div style={{fontSize:10,color:"#3a5070",fontWeight:800,textTransform:"uppercase",letterSpacing:1,marginBottom:5}}>Categoria</div>
                  <select style={{background:"#060e1c",border:"1.5px solid #1a2840",borderRadius:9,
                    padding:"9px 13px",color:"#c8d8f0",fontFamily:"inherit",fontSize:13,width:"100%",outline:"none"}}
                    value={form.cat} onChange={e=>setForm(f=>({...f,cat:e.target.value}))}>
                    {(form.g==="M"?CATS_M:CATS_F).map(c=><option key={c}>{c}</option>)}
                  </select>
                </div>
              </div>
              {[{l:"Dias preferidos",f:"dias",opts:DIAS},
                {l:"Horários preferidos",f:"hrs",opts:HORAS}].map(({l,f,opts})=>(
                <div key={f}>
                  <div style={{fontSize:10,color:"#3a5070",fontWeight:800,textTransform:"uppercase",letterSpacing:1,marginBottom:7}}>{l}</div>
                  <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
                    {opts.map(o=><Chip key={o} active={form[f].includes(o)} onClick={()=>toggleArr(f,o)}>{o}</Chip>)}
                  </div>
                </div>
              ))}
              <label style={{display:"flex",alignItems:"center",gap:10,cursor:"pointer",
                padding:"10px 14px",borderRadius:10,border:"1.5px solid #1a2840",
                background:form.aceitaMisto?"#C8A96E14":"transparent",
                borderColor:form.aceitaMisto?"#C8A96E44":"#1a2840",transition:"all .2s"}}>
                <input type="checkbox" checked={form.aceitaMisto}
                  onChange={e=>setForm(f=>({...f,aceitaMisto:e.target.checked}))}
                  style={{accentColor:"#C8A96E",width:16,height:16}}/>
                <div>
                  <div style={{fontSize:13,fontWeight:700,color:form.aceitaMisto?"#C8A96E":"#7a8aa0"}}>⚤ Aceita jogos mistos</div>
                  <div style={{fontSize:11,color:"#3a5070"}}>Será convidado para partidas masculino/feminino</div>
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

// ─── MAIN APP ─────────────────────────────────────────────────────────────────
export default function App() {
  const [tela,setTela]=useState("config");
  const [jogadores,setJogadores]=useState(JOGADORES_INIT);
  const [slot,setSlot]=useState({data:"",hora:"",quadra:"",genero:"M",catsAlvo:[]});
  const [jogo,setJogo]=useState(null);
  const [historico,setHistorico]=useState([]);
  const [msgModal,setMsgModal]=useState(null);
  const [toast,setToast]=useState(null);
  const timerRef=useRef(null);

  const fireToast=(msg,ok=true)=>{setToast({msg,ok});setTimeout(()=>setToast(null),2800)};

  const diaNome = diaSemana(slot.data);

  const candidatos = useMemo(() =>
    slot.data && slot.hora
      ? filtrarCandidatos(jogadores, slot.genero, slot.catsAlvo, diaNome, slot.hora)
      : [],
    [jogadores, slot.genero, slot.catsAlvo, diaNome, slot.data, slot.hora]
  );

  // ── INICIAR CASCATA ─────────────────────────────────────────────────────────
  const iniciarCascata = useCallback(()=>{
    const fila = candidatos.map((j,i)=>({
      ...j, ordem:i, status:"aguardando", ondaEnviado:null, respostaEm:null
    }));
    // primeira onda: até 8
    const novoJogo = {
      slot:{...slot},
      fila: fila.map((j,i)=>i<8?{...j,status:"pendente",ondaEnviado:1}:j),
      ondaAtual:1,
      catDefinida: slot.catsAlvo.length===1 ? slot.catsAlvo[0] : null, // se categoria única, já definida
      timer:TIMER_DEMO,
      status:"ativo",
      criadoEm:new Date().toLocaleTimeString("pt-BR"),
    };
    setJogo(novoJogo);
    setTela("cascata");
    fireToast(`Onda 1 disparada! ${Math.min(8,fila.length)} convites enviados ⚡`);
  },[candidatos,slot]);

  // ── TIMER ───────────────────────────────────────────────────────────────────
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
    const vagas=4-conf.length;
    if(vagas===0) return fecharJogo({...prev,fila:novaFila});
    const aguard=novaFila.filter(j=>j.status==="aguardando");
    if(!aguard.length){
      fireToast("Sem mais candidatos disponíveis 😔",false);
      return {...prev,fila:novaFila,status:"sem_candidatos"};
    }
    const prox=prev.ondaAtual+1;
    const paraConvidar=aguard.slice(0,Math.min(8,vagas*2)); // até 8 por onda
    const filaAtualizada=novaFila.map(j=>
      paraConvidar.find(p=>p.id===j.id)?{...j,status:"pendente",ondaEnviado:prox}:j
    );
    fireToast(`Onda ${prox} disparada! ${paraConvidar.length} novos convites ⚡`);
    return {...prev,fila:filaAtualizada,ondaAtual:prox,timer:TIMER_DEMO};
  }

  function fecharJogo(prev){
    clearInterval(timerRef.current);
    const conf=prev.fila.filter(j=>j.status==="confirmado");
    const {sc,d1,d2}=melhorDuplas(conf);
    // categoria definida pelo primeiro confirmado se não havia alvo
    const catDef=prev.catDefinida||conf[0]?.cat||null;
    return {...prev,status:"fechado",dupla1:d1,dupla2:d2,scoreEquilibrio:sc,catDefinida:catDef};
  }

  // ── RESPONDER ───────────────────────────────────────────────────────────────
  function responder(id,resp){
    setJogo(prev=>{
      if(!prev||prev.status!=="ativo") return prev;
      let novaFila=prev.fila.map(j=>
        j.id===id?{...j,status:resp==="sim"?"confirmado":"recusou",
          respostaEm:new Date().toLocaleTimeString("pt-BR")}:j
      );
      const conf=novaFila.filter(j=>j.status==="confirmado");
      const pend=novaFila.filter(j=>j.status==="pendente");

      // definir categoria se ainda não definida e primeiro aceitou
      let catDef=prev.catDefinida;
      if(resp==="sim"&&!catDef&&conf.length===1){
        catDef=conf[0].cat;
      }

      if(conf.length===4){
        clearInterval(timerRef.current);
        const {sc,d1,d2}=melhorDuplas(conf);
        const fechado={...prev,fila:novaFila,status:"fechado",
          dupla1:d1,dupla2:d2,scoreEquilibrio:sc,catDefinida:catDef};
        setTimeout(()=>{
          setHistorico(h=>[fechado,...h]);
          setTela("fechado");
          fireToast("🎾 Jogo fechado! 4 confirmados!");
        },400);
        return fechado;
      }
      if(resp==="nao"&&pend.length===0){
        return processarFimOnda({...prev,fila:novaFila,catDefinida:catDef});
      }
      return {...prev,fila:novaFila,catDefinida:catDef};
    });
  }

  function cancelarJogo(){clearInterval(timerRef.current);setJogo(null);setTela("config");fireToast("Jogo cancelado",false);}
  function novoJogo(){
    clearInterval(timerRef.current);
    if(jogo&&jogo.status==="fechado") setHistorico(h=>[jogo,...h]);
    setJogo(null);setSlot({data:"",hora:"",quadra:"",genero:"M",catsAlvo:[]});setTela("config");
  }

  function toggleCat(c){
    setSlot(s=>({...s,catsAlvo:s.catsAlvo.includes(c)?s.catsAlvo.filter(x=>x!==c):[...s.catsAlvo,c]}));
  }

  const slotOk=slot.data&&slot.hora&&slot.quadra&&candidatos.length>=4;

  const today=new Date().toISOString().split("T")[0];

  // ── RENDER ──────────────────────────────────────────────────────────────────
  return (
    <div style={{minHeight:"100vh",background:"#070d1a",color:"#c0d0e8",fontFamily:"'Syne',sans-serif"}}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Syne:wght@400;600;700;800&family=Space+Mono:wght@400;700&display=swap');
        *{box-sizing:border-box;margin:0;padding:0}
        ::-webkit-scrollbar{width:3px}::-webkit-scrollbar-thumb{background:#1a2840}
        select option{background:#0c1526}
        @keyframes fadeIn{from{opacity:0;transform:translateY(7px)}to{opacity:1;transform:translateY(0)}}
        @keyframes glow{0%,100%{box-shadow:0 0 16px #6BFF9E44}50%{box-shadow:0 0 32px #6BFF9E88}}
        @keyframes pulse{0%,100%{opacity:1}50%{opacity:.6}}
        input[type=date]::-webkit-calendar-picker-indicator{filter:invert(.4)}
      `}</style>

      {/* NAV */}
      <div style={{background:"#060c18",borderBottom:"1px solid #101e35",padding:"0 20px"}}>
        <div style={{maxWidth:880,margin:"0 auto",display:"flex",alignItems:"center",
          justifyContent:"space-between",height:56}}>
          <div style={{display:"flex",alignItems:"center",gap:10}}>
            <div style={{width:32,height:32,background:"#6BFF9E14",border:"2px solid #6BFF9E44",
              borderRadius:9,display:"flex",alignItems:"center",justifyContent:"center",fontSize:17}}>🎾</div>
            <div>
              <div style={{fontWeight:800,fontSize:15,lineHeight:1.1,letterSpacing:.3}}>Padel Club</div>
              <div style={{fontSize:9,color:"#1e3050",letterSpacing:2,textTransform:"uppercase"}}>Sistema de Convites</div>
            </div>
          </div>
          <nav style={{display:"flex",gap:2}}>
            {[
              {id:"config",l:"⚡ Novo Jogo"},
              {id:"cascata",l:"📡 Cascata",hide:!jogo},
              {id:"historico",l:`📋 Histórico${historico.length?` (${historico.length})`:""}`},
              {id:"jogadores",l:"👥 Jogadores"},
            ].filter(n=>!n.hide).map(n=>(
              <button key={n.id} onClick={()=>setTela(n.id)} style={{
                background:tela===n.id||(tela==="fechado"&&n.id==="cascata")?"#6BFF9E14":"none",
                border:"none",cursor:"pointer",fontFamily:"inherit",fontSize:11,fontWeight:800,
                color:tela===n.id||(tela==="fechado"&&n.id==="cascata")?"#6BFF9E":"#2a4060",
                padding:"6px 13px",borderRadius:8,transition:"all .18s",
                textTransform:"uppercase",letterSpacing:.5
              }}>{n.l}</button>
            ))}
          </nav>
        </div>
      </div>

      <div style={{maxWidth:880,margin:"0 auto",padding:"26px 20px"}}>

        {/* ══ CONFIG ══════════════════════════════════════════════════════════ */}
        {tela==="config"&&(
          <div style={{animation:"fadeIn .4s ease"}}>
            <div style={{marginBottom:26}}>
              <h1 style={{fontSize:26,fontWeight:800,marginBottom:4}}>Montar Cascata de Convites</h1>
              <p style={{fontSize:13,color:"#2a4060"}}>
                Defina o slot · escolha categorias · o sistema envia em ondas de até 8 pessoas até fechar 4 vagas
              </p>
            </div>

            {/* BLOCO 1: slot */}
            <div style={{background:"#0c1526",border:"1px solid #1a2840",borderRadius:14,
              padding:20,marginBottom:16}}>
              <div style={{fontSize:9,color:"#2a4060",fontWeight:800,letterSpacing:1.5,
                textTransform:"uppercase",marginBottom:14}}>① Data, horário e quadra</div>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:12}}>
                {/* DATA */}
                <div>
                  <div style={{fontSize:10,color:"#2a4060",fontWeight:800,textTransform:"uppercase",
                    letterSpacing:1,marginBottom:5}}>Data</div>
                  <input type="date" min={today}
                    style={{background:"#060e1c",border:"1.5px solid #1a2840",borderRadius:9,
                      padding:"9px 13px",color:"#c0d0e8",fontFamily:"inherit",fontSize:13,
                      width:"100%",outline:"none",transition:"border .2s"}}
                    value={slot.data} onChange={e=>setSlot(s=>({...s,data:e.target.value}))}
                    onFocus={e=>e.target.style.borderColor="#6BFF9E"}
                    onBlur={e=>e.target.style.borderColor="#1a2840"}/>
                  {slot.data&&<div style={{fontSize:10,color:"#6BFF9E",marginTop:4,fontWeight:700}}>
                    {diaSemana(slot.data)}-feira
                  </div>}
                </div>
                {/* HORÁRIO */}
                <div>
                  <div style={{fontSize:10,color:"#2a4060",fontWeight:800,textTransform:"uppercase",
                    letterSpacing:1,marginBottom:5}}>Horário</div>
                  <select style={{background:"#060e1c",border:"1.5px solid #1a2840",borderRadius:9,
                    padding:"9px 13px",color:"#c0d0e8",fontFamily:"inherit",fontSize:13,
                    width:"100%",outline:"none"}}
                    value={slot.hora} onChange={e=>setSlot(s=>({...s,hora:e.target.value}))}>
                    <option value="">Selecione...</option>
                    {HORAS.map(h=><option key={h}>{h}</option>)}
                  </select>
                </div>
                {/* QUADRA */}
                <div>
                  <div style={{fontSize:10,color:"#2a4060",fontWeight:800,textTransform:"uppercase",
                    letterSpacing:1,marginBottom:5}}>Quadra</div>
                  <select style={{background:"#060e1c",border:"1.5px solid #1a2840",borderRadius:9,
                    padding:"9px 13px",color:"#c0d0e8",fontFamily:"inherit",fontSize:13,
                    width:"100%",outline:"none"}}
                    value={slot.quadra} onChange={e=>setSlot(s=>({...s,quadra:e.target.value}))}>
                    <option value="">Selecione...</option>
                    {QUADRAS.map(q=><option key={q} value={q}>Quadra {q}</option>)}
                  </select>
                </div>
              </div>
            </div>

            {/* BLOCO 2: gênero */}
            <div style={{background:"#0c1526",border:"1px solid #1a2840",borderRadius:14,
              padding:20,marginBottom:16}}>
              <div style={{fontSize:9,color:"#2a4060",fontWeight:800,letterSpacing:1.5,
                textTransform:"uppercase",marginBottom:14}}>② Gênero do jogo</div>
              <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
                {[
                  {v:"M",l:"♂ Masculino",c:"#6BCFFF"},
                  {v:"F",l:"♀ Feminino",c:"#FF9FDB"},
                  {v:"Misto",l:"⚤ Misto",c:"#C8A96E",desc:"Convida quem aceita misto"},
                ].map(({v,l,c,desc})=>(
                  <button key={v} onClick={()=>setSlot(s=>({...s,genero:v,catsAlvo:[]}))} style={{
                    background:slot.genero===v?`${c}18`:"transparent",
                    border:`1.5px solid ${slot.genero===v?c:"#1e2d4a"}`,
                    color:slot.genero===v?c:"#3a5070",
                    borderRadius:10,padding:"9px 16px",cursor:"pointer",
                    fontFamily:"inherit",fontWeight:700,fontSize:12,transition:"all .18s",
                    textAlign:"left"
                  }}>
                    <div>{l}</div>
                    {desc&&<div style={{fontSize:10,opacity:.7,marginTop:2}}>{desc}</div>}
                  </button>
                ))}
              </div>
            </div>

            {/* BLOCO 3: categorias */}
            <div style={{background:"#0c1526",border:"1px solid #1a2840",borderRadius:14,
              padding:20,marginBottom:16}}>
              <div style={{fontSize:9,color:"#2a4060",fontWeight:800,letterSpacing:1.5,
                textTransform:"uppercase",marginBottom:6}}>③ Categoria(s) alvo</div>
              <div style={{fontSize:11,color:"#2a4570",marginBottom:12}}>
                {slot.catsAlvo.length===0
                  ? "⚡ Nenhuma selecionada — categoria será definida pelo 1º jogador que aceitar"
                  : `${slot.catsAlvo.length} categoria(s) selecionada(s) — múltiplas categorias são permitidas`}
              </div>
              <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
                {(slot.genero==="F"?CATS_F:CATS_ALL).map(c=>(
                  <button key={c} onClick={()=>toggleCat(c)} style={{
                    background:slot.catsAlvo.includes(c)?CAT_COLOR[c]+"22":"transparent",
                    border:`1.5px solid ${slot.catsAlvo.includes(c)?CAT_COLOR[c]:"#1e2d4a"}`,
                    color:slot.catsAlvo.includes(c)?CAT_COLOR[c]:"#3a5070",
                    borderRadius:99,padding:"5px 14px",cursor:"pointer",fontFamily:"inherit",
                    fontWeight:800,fontSize:12,transition:"all .18s",display:"flex",alignItems:"center",gap:5
                  }}>
                    {slot.catsAlvo.includes(c)&&<span style={{fontSize:10}}>✓</span>}
                    {c}
                  </button>
                ))}
                {slot.catsAlvo.length>0&&(
                  <button onClick={()=>setSlot(s=>({...s,catsAlvo:[]}))} style={{
                    background:"transparent",border:"1.5px solid #FF6B6B33",
                    color:"#FF6B6B",borderRadius:99,padding:"5px 14px",cursor:"pointer",
                    fontFamily:"inherit",fontWeight:700,fontSize:11,transition:"all .18s"
                  }}>✕ Limpar</button>
                )}
              </div>
            </div>

            {/* BLOCO 4: preview candidatos */}
            {candidatos.length>0&&(
              <div style={{marginBottom:20,animation:"fadeIn .4s ease"}}>
                <div style={{fontSize:9,color:"#2a4060",fontWeight:800,letterSpacing:1.5,
                  textTransform:"uppercase",marginBottom:12}}>
                  ④ Ranking — {candidatos.length} candidato(s)
                  <span style={{color:candidatos.length>=4?"#6BFF9E":"#FF6B6B",marginLeft:8}}>
                    {candidatos.length>=4?"✓ mínimo atingido":`⚠ precisa de ${4-candidatos.length} mais`}
                  </span>
                </div>
                <div style={{display:"flex",flexDirection:"column",gap:7}}>
                  {candidatos.slice(0,12).map((j,i)=>(
                    <div key={j.id} style={{display:"flex",alignItems:"center",gap:10,
                      padding:"10px 14px",borderRadius:12,background:"#0c1526",
                      border:`1.5px solid ${i<8?"#6BFF9E22":"#1a2840"}`,
                      animation:`fadeIn .3s ease ${i*35}ms both`}}>
                      <div style={{fontFamily:"'Space Mono',monospace",fontSize:10,color:"#1e3050",
                        fontWeight:700,width:22,textAlign:"right",flexShrink:0}}>#{i+1}</div>
                      <Avatar nome={j.nome} size={32} glow={i<8} g={j.g}/>
                      <div style={{flex:1,minWidth:0}}>
                        <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:3}}>
                          <span style={{fontWeight:700,fontSize:13}}>{j.nome}</span>
                          <GenBadge g={j.g}/>
                        </div>
                        <div style={{display:"flex",gap:6,alignItems:"center"}}>
                          <CatPill cat={j.cat}/>
                          <ScoreDot score={j.score}/>
                        </div>
                      </div>
                      <span style={{fontSize:10,fontWeight:800,borderRadius:99,padding:"2px 10px",whiteSpace:"nowrap",
                        color:i<8?"#6BFF9E":"#2a4060",
                        background:i<8?"#6BFF9E14":"transparent",
                        border:i<8?"1px solid #6BFF9E33":"none"}}>
                        {i<8?`Onda 1`:"Fila"}
                      </span>
                    </div>
                  ))}
                  {candidatos.length>12&&<div style={{fontSize:11,color:"#2a4060",textAlign:"center",padding:"6px 0"}}>
                    +{candidatos.length-12} mais na fila...
                  </div>}
                </div>
              </div>
            )}

            {slot.data&&slot.hora&&candidatos.length<4&&(
              <div style={{background:"#FF6B6B12",border:"1px solid #FF6B6B33",borderRadius:10,
                padding:"12px 16px",marginBottom:16,fontSize:12,color:"#FF6B6B"}}>
                ⚠️ Apenas {candidatos.length} candidato(s) encontrado(s). Ajuste as categorias ou o gênero.
              </div>
            )}

            <button onClick={iniciarCascata} disabled={!slotOk} style={{
              width:"100%",padding:15,fontSize:15,fontWeight:800,borderRadius:12,
              border:"none",cursor:slotOk?"pointer":"not-allowed",fontFamily:"inherit",
              background:slotOk?"#6BFF9E":"#0c1526",color:slotOk?"#000":"#1a3050",
              transition:"all .3s",animation:slotOk?"glow 2s ease infinite":"none",
              boxShadow:slotOk?"0 0 28px #6BFF9E44":"none"
            }}>
              ⚡ Disparar Cascata de Convites
            </button>
            {!slotOk&&<p style={{fontSize:11,color:"#2a4060",textAlign:"center",marginTop:8}}>
              {!slot.data||!slot.hora||!slot.quadra
                ? "Preencha data, horário e quadra para continuar"
                : "Mínimo de 4 candidatos necessário"}
            </p>}
          </div>
        )}

        {/* ══ CASCATA ═════════════════════════════════════════════════════════ */}
        {(tela==="cascata"||tela==="fechado")&&jogo&&(
          <CascataView jogo={jogo} onResponder={responder}
            onNovoJogo={novoJogo} onCancelar={cancelarJogo}
            onMsg={setMsgModal} fireToast={fireToast}/>
        )}

        {/* ══ HISTÓRICO ═══════════════════════════════════════════════════════ */}
        {tela==="historico"&&(
          <div style={{animation:"fadeIn .4s ease"}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:22}}>
              <div>
                <h2 style={{fontSize:22,fontWeight:800}}>Histórico</h2>
                <p style={{fontSize:12,color:"#2a4060"}}>{historico.length} jogo(s) registrado(s)</p>
              </div>
              <Btn variant="ghost" onClick={()=>setTela("config")}>+ Novo Jogo</Btn>
            </div>
            {historico.length===0?(
              <div style={{textAlign:"center",padding:"60px 0",color:"#1e3050"}}>
                <div style={{fontSize:40,marginBottom:12}}>📋</div>
                <div style={{fontWeight:800,fontSize:16}}>Nenhum jogo registrado ainda</div>
              </div>
            ):historico.map((h,i)=>(
              <div key={i} style={{background:"#0c1526",border:"1.5px solid #1a2840",borderRadius:14,
                padding:18,marginBottom:12,borderLeft:"3px solid #6BFF9E"}}>
                <div style={{display:"flex",gap:8,marginBottom:12,flexWrap:"wrap"}}>
                  {[`📅 ${diaSemana(h.slot.data)}, ${fmtData(h.slot.data)}`,
                    `🕐 ${h.slot.hora}`,`🏟️ Quadra ${h.slot.quadra}`].map((t,j)=>(
                    <span key={j} style={{fontSize:11,background:"#111e35",border:"1px solid #1a2840",
                      borderRadius:99,padding:"3px 10px",color:"#4a6080"}}>{t}</span>
                  ))}
                  {h.catDefinida&&<span style={{fontSize:11,color:CAT_COLOR[h.catDefinida],fontWeight:700,
                    background:CAT_COLOR[h.catDefinida]+"18",border:`1px solid ${CAT_COLOR[h.catDefinida]}44`,
                    borderRadius:99,padding:"3px 10px"}}>🏅 {h.catDefinida}</span>}
                  <span style={{fontSize:11,color:"#6BFF9E",fontWeight:700,background:"#6BFF9E14",
                    border:"1px solid #6BFF9E33",borderRadius:99,padding:"3px 10px"}}>
                    ⚡ {h.scoreEquilibrio}pts
                  </span>
                </div>
                <div style={{display:"grid",gridTemplateColumns:"1fr auto 1fr",gap:10,alignItems:"center",marginBottom:12}}>
                  <div style={{background:"#060e1c",borderRadius:10,padding:"10px 12px"}}>
                    {(h.dupla1||[]).map(j=><div key={j.id} style={{fontSize:13,fontWeight:700,marginBottom:3}}>{j.nome}</div>)}
                  </div>
                  <div style={{fontFamily:"'Space Mono',monospace",fontSize:18,color:"#6BFF9E",
                    textAlign:"center",fontWeight:700}}>VS</div>
                  <div style={{background:"#060e1c",borderRadius:10,padding:"10px 12px"}}>
                    {(h.dupla2||[]).map(j=><div key={j.id} style={{fontSize:13,fontWeight:700,marginBottom:3}}>{j.nome}</div>)}
                  </div>
                </div>
                <Btn variant="ghost" style={{fontSize:11,padding:"5px 12px"}}
                  onClick={()=>setMsgModal({titulo:"Reenviar confirmação",
                    texto:buildMsgFechado(h.dupla1,h.dupla2,h.slot,h.catDefinida)})}>
                  📱 Reenviar mensagem
                </Btn>
              </div>
            ))}
          </div>
        )}

        {/* ══ JOGADORES ═══════════════════════════════════════════════════════ */}
        {tela==="jogadores"&&(
          <JogadoresView jogadores={jogadores} setJogadores={setJogadores} fireToast={fireToast}/>
        )}
      </div>

      {msgModal&&<MsgModal {...msgModal} onClose={()=>setMsgModal(null)} fireToast={fireToast}/>}
      {toast&&<div style={{position:"fixed",bottom:20,left:"50%",transform:"translateX(-50%)",
        background:"#0c1526",border:`1.5px solid ${toast.ok?"#6BFF9E":"#FF6B6B"}`,
        borderRadius:10,padding:"10px 22px",fontSize:13,fontWeight:700,
        color:toast.ok?"#6BFF9E":"#FF6B6B",zIndex:999,whiteSpace:"nowrap",
        animation:"fadeIn .25s ease"}}>{toast.msg}</div>}
    </div>
  );
}
