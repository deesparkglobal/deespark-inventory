/* eslint-disable */
import { useState, useMemo, useEffect } from "react";
import { initializeApp } from "firebase/app";
import { getFirestore, doc, setDoc, onSnapshot } from "firebase/firestore";

/* ══════════════════════════════════════════════════════════
   STOCKPULSE NG — Full Inventory Management System
   Roles: Admin (full access) | Staff (assigned agents only)
   Features: Products, Agents (multi per state), Staff mgmt,
             Daily entry with approval, Wed alerts, Weekly report
══════════════════════════════════════════════════════════ */

const NIGERIAN_STATES = [
  "Abia","Adamawa","Akwa Ibom","Anambra","Bauchi","Bayelsa","Benue","Borno",
  "Cross River","Delta","Ebonyi","Edo","Ekiti","Enugu","FCT Abuja","Gombe",
  "Imo","Jigawa","Kaduna","Kano","Katsina","Kebbi","Kogi","Kwara","Lagos",
  "Nasarawa","Niger","Ogun","Ondo","Osun","Oyo","Plateau","Rivers","Sokoto",
  "Taraba","Yobe","Zamfara"
];

const DAYS = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
const today = new Date();
const todayDay = DAYS[today.getDay()];
const todayStr = today.toLocaleDateString("en-NG",{day:"numeric",month:"short",year:"numeric"});
const todayISO = today.toISOString().slice(0,10);

const uid = () => Math.random().toString(36).slice(2,9);
const deliveryRate = a => a.totalOrdersAssigned > 0
  ? Math.round((a.totalOrdersDelivered / a.totalOrdersAssigned)*100) : 0;
const totalStock = a => a.products.reduce((s,p)=>s+p.currentStock,0);
const rc = r => r>=80?"#10b981":r>=60?"#f59e0b":"#ef4444";
const rb = r => r>=80?"#10b98120":r>=60?"#f59e0b20":"#ef444420";
const rl = r => r>=80?"Excellent":r>=60?"Average":"Poor";
const suggestQty = (agent, products) => {
  const rate = deliveryRate(agent);
  const mult = rate>=80?1.3:rate>=60?1.0:0.6;
  return products.map(p=>{
    const ap = agent.products.find(x=>x.id===p.id);
    return {...p, suggested: Math.max(10, Math.round((ap?.totalDelivered||20)*mult))};
  });
};

/* ── SEED ADMIN ── */
/* ── Firebase Config ── */
const firebaseConfig = {
  apiKey: "AIzaSyB46xvdqJkHK6Q4KFRd7GeYb8OmuRht_68",
  authDomain: "deespark-inventory.firebaseapp.com",
  projectId: "deespark-inventory",
  storageBucket: "deespark-inventory.firebasestorage.app",
  messagingSenderId: "1036840754019",
  appId: "1:1036840754019:web:639eb47cec021d47809156"
};
const firebaseApp = initializeApp(firebaseConfig);
const db = getFirestore(firebaseApp);

const INIT_STATE = {
  products: [],
  agents: [],
  staff: [{ id:"admin", username:"admin", password:"admin123", role:"admin", name:"Administrator", assignedAgents:[] }],
  pendingEntries: [],
};

const DB_DOC = "appdata/main";

/* ══ ROOT ══════════════════════════════════════════════════ */
export default function App() {
  const [state, setState]   = useState(INIT_STATE);
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);

  // Restore session from localStorage on startup
  useEffect(()=>{
    try {
      const saved = localStorage.getItem("sp_session");
      if(saved){
        const parsed = JSON.parse(saved);
        // Check if session is less than 24 hours old
        const age = Date.now() - (parsed.savedAt || 0);
        if(age < 24 * 60 * 60 * 1000){
          setSession(parsed.session);
        } else {
          localStorage.removeItem("sp_session");
        }
      }
    } catch(e){ localStorage.removeItem("sp_session"); }
  }, []);

  // Load data from Firestore on startup
  useEffect(()=>{
    const ref = doc(db, "appdata", "main");
    const unsub = onSnapshot(ref, (snap)=>{
      if(snap.exists()){
        const data = snap.data();
        setState(prev => ({
          ...INIT_STATE,
          ...data,
          // Always keep at least the default admin
          staff: data.staff && data.staff.length > 0 ? data.staff : INIT_STATE.staff,
        }));
      }
      setLoading(false);
    }, (err)=>{
      console.error("Firestore error:", err);
      setLoading(false);
    });
    return () => unsub();
  }, []);

  // Save to Firestore whenever state changes
  const update = fn => {
    setState(prev => {
      const next = fn(prev);
      // Save to Firestore (async, non-blocking)
      const ref = doc(db, "appdata", "main");
      setDoc(ref, next).catch(e => console.error("Save error:", e));
      return next;
    });
  };

  if(loading) return (
    <div style={{minHeight:"100vh",background:"#07090f",display:"flex",alignItems:"center",justifyContent:"center",fontFamily:"'Outfit',sans-serif"}}>
      <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@700;900&display=swap" rel="stylesheet"/>
      <div style={{textAlign:"center"}}>
        <div style={{width:54,height:54,borderRadius:14,background:"linear-gradient(135deg,#6366f1,#8b5cf6)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:26,margin:"0 auto 20px"}}>⬡</div>
        <div style={{fontSize:18,fontWeight:900,color:"#f1f5f9",marginBottom:8}}>StockPulse NG</div>
        <div style={{fontSize:13,color:"#475569",marginBottom:20}}>Loading your data...</div>
        <div style={{width:40,height:40,border:"3px solid #1a2238",borderTop:"3px solid #6366f1",borderRadius:"50%",animation:"spin 0.8s linear infinite",margin:"0 auto"}}/>
        <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
      </div>
    </div>
  );

  const handleLogin = (s, remember=true) => {
    setSession(s);
    if(remember){
      try {
        localStorage.setItem("sp_session", JSON.stringify({ session: s, savedAt: Date.now() }));
      } catch(e){}
    }
  };

  const handleLogout = () => {
    setSession(null);
    try { localStorage.removeItem("sp_session"); } catch(e){}
  };

  if (!session) return <Login staff={state.staff} onLogin={handleLogin}/>;

  const props = { state, update, session, setSession: handleLogout };
  return session.role==="admin" ? <AdminApp {...props}/> : <StaffApp {...props}/>;
}

/* ══ LOGIN ══════════════════════════════════════════════════ */
function Login({ staff, onLogin }) {
  const [user,   setUser]   = useState("");
  const [pwd,    setPwd]    = useState("");
  const [err,    setErr]    = useState("");
  const [remember, setRemember] = useState(true);

  const login = () => {
    const found = staff.find(s=>s.username===user.trim()&&s.password===pwd);
    if (!found) { setErr("Invalid username or password."); return; }
    onLogin(found, remember);
  };

  return (
    <div style={{minHeight:"100vh",background:"#07090f",display:"flex",alignItems:"center",justifyContent:"center",fontFamily:"'Outfit',sans-serif",padding:"16px"}}>
      <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700;800;900&family=JetBrains+Mono:wght@400;600&display=swap" rel="stylesheet"/>
      <style>{`*{box-sizing:border-box;margin:0;padding:0} input:focus{outline:none;border-color:#6366f1!important}`}</style>
      <div style={{width:"100%",maxWidth:400,background:"#0d1120",borderRadius:20,border:"1px solid #151c2e",padding:32}}>
        <div style={{textAlign:"center",marginBottom:36}}>
          <div style={{width:54,height:54,borderRadius:14,background:"linear-gradient(135deg,#6366f1,#8b5cf6)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:26,margin:"0 auto 16px"}}>⬡</div>
          <div style={{fontSize:22,fontWeight:900,color:"#f1f5f9",letterSpacing:"-.5px"}}>StockPulse NG</div>
          <div style={{fontSize:13,color:"#475569",marginTop:4}}>Sign in to your account</div>
        </div>
        {err && <div style={{background:"#ef444415",border:"1px solid #ef444430",borderRadius:8,padding:"10px 14px",color:"#ef4444",fontSize:13,marginBottom:16}}>{err}</div>}
        <div style={{display:"flex",flexDirection:"column",gap:14,marginBottom:22}}>
          <div>
            <label style={{fontSize:12,color:"#64748b",fontWeight:600,display:"block",marginBottom:5}}>Username</label>
            <input value={user} onChange={e=>setUser(e.target.value)} placeholder="Enter username"
              style={{width:"100%",background:"#07090f",border:"1px solid #1a2238",borderRadius:8,color:"#f1f5f9",padding:"11px 14px",fontSize:14,transition:"border-color .15s"}}
              onKeyDown={e=>e.key==="Enter"&&login()}/>
          </div>
          <div>
            <label style={{fontSize:12,color:"#64748b",fontWeight:600,display:"block",marginBottom:5}}>Password</label>
            <input type="password" value={pwd} onChange={e=>setPwd(e.target.value)} placeholder="Enter password"
              style={{width:"100%",background:"#07090f",border:"1px solid #1a2238",borderRadius:8,color:"#f1f5f9",padding:"11px 14px",fontSize:14,transition:"border-color .15s"}}
              onKeyDown={e=>e.key==="Enter"&&login()}/>
          </div>
        </div>
        <label style={{display:"flex",alignItems:"center",gap:10,cursor:"pointer",marginBottom:16}}>
          <input type="checkbox" checked={remember} onChange={e=>setRemember(e.target.checked)}
            style={{width:16,height:16,accentColor:"#6366f1",cursor:"pointer"}}/>
          <span style={{fontSize:13,color:"#64748b"}}>Keep me logged in for 24 hours</span>
        </label>
        <button onClick={login} style={{width:"100%",padding:"12px",borderRadius:9,border:"none",cursor:"pointer",fontSize:14,fontWeight:800,background:"linear-gradient(135deg,#6366f1,#8b5cf6)",color:"#fff"}}>
          Sign In →
        </button>
        <div style={{marginTop:20,background:"#6366f110",borderRadius:8,padding:"10px 14px",fontSize:12,color:"#64748b"}}>
          <b style={{color:"#818cf8"}}>Default admin:</b> username <code style={{color:"#f1f5f9",fontFamily:"'JetBrains Mono',monospace"}}>admin</code> / password <code style={{color:"#f1f5f9",fontFamily:"'JetBrains Mono',monospace"}}>admin123</code>
        </div>
      </div>
    </div>
  );
}

/* ══ SHARED UI ══════════════════════════════════════════════ */
const PageHeader = ({title,sub,right}) => (
  <div className="page-header" style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:24,gap:12,flexWrap:"wrap"}}>
    <div style={{minWidth:0}}>
      <h1 className="page-title" style={{fontSize:22,fontWeight:900,color:"#f1f5f9",letterSpacing:"-.5px"}}>{title}</h1>
      {sub&&<p style={{fontSize:12,color:"#475569",marginTop:3}}>{sub}</p>}
    </div>
    {right&&<div style={{flexShrink:0}}>{right}</div>}
  </div>
);
const Card = ({children,style={}}) => (
  <div className="sp-card" style={{background:"#0d1120",borderRadius:14,border:"1px solid #151c2e",padding:20,...style}}>{children}</div>
);
const StatCard = ({label,value,accent,icon}) => (
  <div style={{background:"#0d1120",borderRadius:12,border:`1px solid ${accent}25`,padding:16,position:"relative",overflow:"hidden"}}>
    <div style={{position:"absolute",top:-12,right:-12,width:80,height:80,borderRadius:"50%",background:`radial-gradient(circle,${accent}28,transparent 70%)`}}/>
    <div style={{fontSize:22,marginBottom:8}}>{icon}</div>
    <div style={{fontSize:24,fontWeight:900,color:"#f1f5f9",letterSpacing:"-.5px"}}>{value}</div>
    <div style={{fontSize:11,color:"#475569",marginTop:4,fontWeight:600,textTransform:"uppercase",letterSpacing:1}}>{label}</div>
  </div>
);
const Badge = ({rate}) => (
  <span style={{display:"inline-block",padding:"3px 10px",borderRadius:20,fontSize:11,fontWeight:700,background:rb(rate),color:rc(rate),border:`1px solid ${rc(rate)}35`}}>{rl(rate)}</span>
);
const RateBar = ({rate,width=80}) => (
  <div style={{display:"flex",alignItems:"center",gap:8}}>
    <div style={{width,height:6,background:"#1a2238",borderRadius:3,overflow:"hidden"}}>
      <div style={{width:`${Math.min(rate,100)}%`,height:"100%",background:rc(rate),borderRadius:3}}/>
    </div>
    <span style={{fontSize:13,fontWeight:800,color:rc(rate),minWidth:36}}>{rate}%</span>
  </div>
);
const TH = ({children}) => <th style={{textAlign:"left",fontSize:11,color:"#334155",fontWeight:700,letterSpacing:1.5,textTransform:"uppercase",padding:"10px 14px",borderBottom:"1px solid #151c2e",whiteSpace:"nowrap"}}>{children}</th>;
const TD = ({children,style={}}) => <td style={{padding:"11px 14px",fontSize:13,borderBottom:"1px solid #0a0c14",verticalAlign:"middle",...style}}>{children}</td>;
const Inp = ({label,...props}) => (
  <div>
    {label&&<label style={{fontSize:12,color:"#64748b",fontWeight:600,marginBottom:5,display:"block"}}>{label}</label>}
    <input style={{width:"100%",background:"#07090f",border:"1px solid #1a2238",borderRadius:8,color:"#f1f5f9",padding:"11px 12px",fontSize:14,transition:"border-color .15s",outline:"none",WebkitAppearance:"none"}} {...props}/>
  </div>
);
const Sel = ({label,children,...props}) => (
  <div>
    {label&&<label style={{fontSize:12,color:"#64748b",fontWeight:600,marginBottom:5,display:"block"}}>{label}</label>}
    <select style={{width:"100%",background:"#07090f",border:"1px solid #1a2238",borderRadius:8,color:"#f1f5f9",padding:"11px 12px",fontSize:14,outline:"none",WebkitAppearance:"none",appearance:"none"}} {...props}>{children}</select>
  </div>
);
const Btn = ({children,onClick,variant="primary",small,style={}}) => (
  <button onClick={onClick} style={{
    padding:small?"7px 14px":"11px 22px",borderRadius:8,border:"none",cursor:"pointer",
    fontSize:small?12:13,fontWeight:700,transition:"all .15s",WebkitTapHighlightColor:"transparent",
    background:variant==="primary"?"linear-gradient(135deg,#6366f1,#8b5cf6)":variant==="danger"?"#ef444418":variant==="success"?"#10b98118":variant==="warn"?"#f59e0b18":"#151c2e",
    color:variant==="primary"?"#fff":variant==="danger"?"#ef4444":variant==="success"?"#10b981":variant==="warn"?"#f59e0b":"#94a3b8",
    border:variant!=="primary"?`1px solid ${variant==="danger"?"#ef444330":variant==="success"?"#10b98130":variant==="warn"?"#f59e0b30":"#1a2238"}`:"none",
    ...style,
  }}>{children}</button>
);
const InfoBox = ({type="info",children}) => {
  const m={info:["#6366f1","#6366f112","#6366f125"],warn:["#f59e0b","#f59e0b12","#f59e0b25"],good:["#10b981","#10b98112","#10b98125"],danger:["#ef4444","#ef444412","#ef444425"]};
  const [c,bg,bd]=m[type];
  return <div style={{background:bg,border:`1px solid ${bd}`,borderRadius:10,padding:"12px 14px",marginBottom:12,color:c,fontSize:13,lineHeight:1.5}}>{children}</div>;
};
const EmptyState = ({icon,title,sub,action}) => (
  <div style={{textAlign:"center",padding:"60px 20px",color:"#334155"}}>
    <div style={{fontSize:46,marginBottom:14}}>{icon}</div>
    <div style={{fontSize:16,fontWeight:700,color:"#475569",marginBottom:6}}>{title}</div>
    <div style={{fontSize:13,marginBottom:20,color:"#334155"}}>{sub}</div>
    {action}
  </div>
);

/* ══ SHELL (sidebar + main) ════════════════════════════════ */
function Shell({ session, setSession, nav, activeTab, setTab, children }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);

  // Close sidebar overlay when tab changes on mobile
  const handleTab = (key) => { setTab(key); setSidebarOpen(false); };

  return (
    <div style={{display:"flex",fontFamily:"'Outfit',sans-serif",background:"#07090f",minHeight:"100vh",color:"#e2e8f0",position:"relative"}}>
      <style>{`
        *{box-sizing:border-box;margin:0;padding:0}
        ::-webkit-scrollbar{width:4px}
        ::-webkit-scrollbar-track{background:#0b0e18}
        ::-webkit-scrollbar-thumb{background:#1a2238;border-radius:2px}
        .nhov:hover{background:#111827!important;color:#e2e8f0!important}
        .rhov:hover{background:#0d1120!important}
        input:focus,select:focus{border-color:#6366f1!important;outline:none}
        input::placeholder{color:#334155}
        textarea:focus{border-color:#6366f1!important;outline:none}
        .sidebar-overlay{display:none}
        button{cursor:pointer}
        .stat-grid-4{display:grid;grid-template-columns:repeat(4,1fr)}
        .stat-grid-3{display:grid;grid-template-columns:repeat(3,1fr)}
        .grid-2col{display:grid;grid-template-columns:1fr 1fr}
        .form-2col{display:grid;grid-template-columns:1fr 1fr}
        .setup-grid{display:grid;grid-template-columns:360px 1fr}
        .grid-3col{display:grid;grid-template-columns:repeat(auto-fill,minmax(160px,1fr))}
        @media(max-width:900px){
          .setup-grid{grid-template-columns:1fr!important}
        }
        @media(max-width:768px){
          .desktop-sidebar{display:none!important}
          .sidebar-overlay{display:block;position:fixed;inset:0;background:#000000aa;z-index:200}
          .mobile-sidebar{display:flex!important}
          .main-content{padding:14px 12px 88px!important}
          .bottom-nav{display:flex!important}
          .mobile-topbar{display:flex!important}
          .stat-grid-4{grid-template-columns:repeat(2,1fr)!important;gap:10px!important}
          .stat-grid-3{grid-template-columns:repeat(2,1fr)!important;gap:10px!important}
          .grid-2col{grid-template-columns:1fr!important}
          .form-2col{grid-template-columns:1fr!important}
          .grid-3col{grid-template-columns:repeat(2,1fr)!important}
          .setup-grid{grid-template-columns:1fr!important}
          .hide-mobile{display:none!important}
          .page-header{flex-direction:column!important;margin-bottom:16px!important}
          .page-title{font-size:19px!important}
          .approval-grid{grid-template-columns:1fr 1fr!important}
          .sp-card{padding:14px!important;border-radius:10px!important}
        }
        @media(min-width:769px){
          .mobile-sidebar{display:none!important}
          .bottom-nav{display:none!important}
          .mobile-topbar{display:none!important}
        }
      `}</style>

      {/* ── DESKTOP SIDEBAR ── */}
      <aside className="desktop-sidebar" style={{width:collapsed?64:220,transition:"width .22s ease",background:"#0b0e18",borderRight:"1px solid #151c2e",display:"flex",flexDirection:"column",position:"sticky",top:0,height:"100vh",flexShrink:0,zIndex:100}}>
        <div style={{padding:"18px 14px 14px",borderBottom:"1px solid #151c2e",display:"flex",alignItems:"center",gap:10}}>
          <div style={{width:32,height:32,borderRadius:8,background:"linear-gradient(135deg,#6366f1,#8b5cf6)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:16,flexShrink:0}}>⬡</div>
          {!collapsed&&<div style={{flex:1,minWidth:0}}>
            <div style={{fontSize:13,fontWeight:900,color:"#f1f5f9",letterSpacing:"-.3px"}}>StockPulse</div>
            <div style={{fontSize:9,color:"#334155",letterSpacing:2,textTransform:"uppercase"}}>Nigeria</div>
          </div>}
          <div style={{cursor:"pointer",color:"#475569",fontSize:15,flexShrink:0}} onClick={()=>setCollapsed(v=>!v)}>{collapsed?"›":"‹"}</div>
        </div>
        <nav style={{flex:1,padding:"8px 0",overflowY:"auto"}}>
          {nav.map(n=>(
            <div key={n.key} className="nhov" onClick={()=>handleTab(n.key)} style={{display:"flex",alignItems:"center",gap:10,padding:"11px 14px",cursor:"pointer",fontSize:13,fontWeight:activeTab===n.key?700:500,color:activeTab===n.key?"#f1f5f9":n.highlight?"#f59e0b":"#64748b",background:activeTab===n.key?"#151c2e":"transparent",borderLeft:`3px solid ${activeTab===n.key?"#6366f1":n.highlight?"#f59e0b30":"transparent"}`,transition:"all .15s"}}>
              <span style={{fontSize:14,flexShrink:0}}>{n.icon}</span>
              {!collapsed&&<span style={{whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{n.label}</span>}
              {!collapsed&&n.badge>0&&<span style={{marginLeft:"auto",background:n.badgeColor||"#ef4444",color:"#fff",borderRadius:20,fontSize:10,fontWeight:800,padding:"1px 6px"}}>{n.badge}</span>}
              {!collapsed&&n.highlight&&!n.badge&&<span style={{marginLeft:"auto",fontSize:9,color:"#f59e0b",fontWeight:800,letterSpacing:1}}>SETUP</span>}
            </div>
          ))}
        </nav>
        {!collapsed&&(
          <div style={{padding:"12px 14px",borderTop:"1px solid #151c2e"}}>
            <div style={{fontSize:9,color:"#1e2d40",fontWeight:700,letterSpacing:2,textTransform:"uppercase"}}>Signed in</div>
            <div style={{fontSize:12,fontWeight:700,color:"#f1f5f9",marginTop:3,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{session.name}</div>
            <div style={{fontSize:11,color:"#6366f1",marginTop:1,textTransform:"capitalize"}}>{session.role}</div>
            <div style={{fontSize:10,color:"#334155",marginTop:4}}>{todayDay} · {todayStr}</div>
            <button onClick={()=>setSession(null)} style={{marginTop:8,fontSize:11,color:"#ef4444",background:"#ef444412",border:"1px solid #ef444425",borderRadius:6,padding:"4px 10px",cursor:"pointer",fontWeight:600,width:"100%"}}>Sign Out</button>
          </div>
        )}
      </aside>

      {/* ── MOBILE OVERLAY ── */}
      {sidebarOpen&&<div className="sidebar-overlay" onClick={()=>setSidebarOpen(false)}/>}

      {/* ── MOBILE SLIDE-IN SIDEBAR ── */}
      <aside className="mobile-sidebar" style={{display:"none",position:"fixed",top:0,left:sidebarOpen?0:-260,width:260,height:"100vh",background:"#0b0e18",borderRight:"1px solid #151c2e",flexDirection:"column",zIndex:300,transition:"left .25s ease",boxShadow:sidebarOpen?"4px 0 24px #000a":"none"}}>
        <div style={{padding:"18px 16px 14px",borderBottom:"1px solid #151c2e",display:"flex",alignItems:"center",justifyContent:"space-between"}}>
          <div style={{display:"flex",alignItems:"center",gap:10}}>
            <div style={{width:32,height:32,borderRadius:8,background:"linear-gradient(135deg,#6366f1,#8b5cf6)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:16}}>⬡</div>
            <div>
              <div style={{fontSize:13,fontWeight:900,color:"#f1f5f9"}}>StockPulse</div>
              <div style={{fontSize:9,color:"#334155",letterSpacing:2,textTransform:"uppercase"}}>Nigeria</div>
            </div>
          </div>
          <div onClick={()=>setSidebarOpen(false)} style={{color:"#475569",fontSize:20,cursor:"pointer",padding:"4px 8px"}}>✕</div>
        </div>
        <nav style={{flex:1,padding:"8px 0",overflowY:"auto"}}>
          {nav.map(n=>(
            <div key={n.key} className="nhov" onClick={()=>handleTab(n.key)} style={{display:"flex",alignItems:"center",gap:12,padding:"13px 16px",cursor:"pointer",fontSize:14,fontWeight:activeTab===n.key?700:500,color:activeTab===n.key?"#f1f5f9":n.highlight?"#f59e0b":"#64748b",background:activeTab===n.key?"#151c2e":"transparent",borderLeft:`3px solid ${activeTab===n.key?"#6366f1":n.highlight?"#f59e0b30":"transparent"}`}}>
              <span style={{fontSize:17,flexShrink:0}}>{n.icon}</span>
              <span>{n.label}</span>
              {n.badge>0&&<span style={{marginLeft:"auto",background:n.badgeColor||"#ef4444",color:"#fff",borderRadius:20,fontSize:11,fontWeight:800,padding:"2px 8px"}}>{n.badge}</span>}
              {n.highlight&&!n.badge&&<span style={{marginLeft:"auto",fontSize:10,color:"#f59e0b",fontWeight:800}}>SETUP</span>}
            </div>
          ))}
        </nav>
        <div style={{padding:"14px 16px",borderTop:"1px solid #151c2e"}}>
          <div style={{fontSize:12,fontWeight:700,color:"#f1f5f9",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{session.name}</div>
          <div style={{fontSize:11,color:"#6366f1",marginTop:1,textTransform:"capitalize"}}>{session.role} · {todayDay}</div>
          <button onClick={()=>{setSession(null);setSidebarOpen(false);}} style={{marginTop:10,fontSize:12,color:"#ef4444",background:"#ef444412",border:"1px solid #ef444425",borderRadius:7,padding:"8px 14px",cursor:"pointer",fontWeight:600,width:"100%"}}>Sign Out</button>
        </div>
      </aside>

      {/* ── MAIN ── */}
      <div style={{flex:1,display:"flex",flexDirection:"column",minWidth:0}}>
        {/* Mobile top bar */}
        <div className="mobile-topbar" style={{display:"none",alignItems:"center",justifyContent:"space-between",padding:"12px 16px",background:"#0b0e18",borderBottom:"1px solid #151c2e",position:"sticky",top:0,zIndex:150}}>
          <div style={{display:"flex",alignItems:"center",gap:10}}>
            <div onClick={()=>setSidebarOpen(true)} style={{width:36,height:36,borderRadius:8,background:"#151c2e",display:"flex",alignItems:"center",justifyContent:"center",cursor:"pointer",fontSize:18,color:"#818cf8"}}>☰</div>
            <div style={{fontSize:14,fontWeight:900,color:"#f1f5f9"}}>StockPulse NG</div>
          </div>
          <div style={{fontSize:11,color:"#475569",fontWeight:600}}>{todayDay} · {session.name.split(" ")[0]}</div>
        </div>

        <main className="main-content" style={{flex:1,padding:"24px 28px",overflowY:"auto",maxHeight:"100vh"}}>
          {children}
        </main>
      </div>

      {/* ── MOBILE BOTTOM NAV ── */}
      <nav className="bottom-nav" style={{display:"none",position:"fixed",bottom:0,left:0,right:0,background:"#0b0e18",borderTop:"1px solid #151c2e",zIndex:200,justifyContent:"space-around",padding:"6px 0 8px"}}>
        {nav.slice(0,5).map(n=>(
          <div key={n.key} onClick={()=>handleTab(n.key)} style={{display:"flex",flexDirection:"column",alignItems:"center",gap:2,padding:"4px 8px",cursor:"pointer",minWidth:48,position:"relative"}}>
            <div style={{fontSize:20,lineHeight:1,color:activeTab===n.key?"#818cf8":"#475569",transition:"color .15s"}}>{n.icon}</div>
            <div style={{fontSize:9,fontWeight:activeTab===n.key?700:500,color:activeTab===n.key?"#818cf8":"#475569",whiteSpace:"nowrap"}}>{n.label.split(" ")[0]}</div>
            {n.badge>0&&<div style={{position:"absolute",top:0,right:4,background:n.badgeColor||"#ef4444",color:"#fff",borderRadius:20,fontSize:9,fontWeight:800,padding:"1px 5px",minWidth:16,textAlign:"center"}}>{n.badge}</div>}
          </div>
        ))}
        <div onClick={()=>setSidebarOpen(true)} style={{display:"flex",flexDirection:"column",alignItems:"center",gap:2,padding:"4px 8px",cursor:"pointer",minWidth:48}}>
          <div style={{fontSize:20,lineHeight:1,color:"#475569"}}>⋯</div>
          <div style={{fontSize:9,fontWeight:500,color:"#475569"}}>More</div>
        </div>
      </nav>
    </div>
  );
}


/* ══ ADMIN APP ══════════════════════════════════════════════ */
function AdminApp({ state, update, session, setSession }) {
  const [tab, setTab] = useState("dashboard");

  const { products, agents, staff, pendingEntries } = state;
  const pendingCount = pendingEntries.filter(e=>e.status==="pending").length;

  const totals = useMemo(()=>{
    const assigned  = agents.reduce((s,a)=>s+a.totalOrdersAssigned,0);
    const delivered = agents.reduce((s,a)=>s+a.totalOrdersDelivered,0);
    const stock     = agents.reduce((s,a)=>s+totalStock(a),0);
    const rate      = assigned>0?Math.round((delivered/assigned)*100):0;
    const critical  = agents.filter(a=>totalStock(a)<20&&a.products.length>0);
    const low       = agents.filter(a=>totalStock(a)>=20&&totalStock(a)<50&&a.products.length>0);
    return {assigned,delivered,stock,rate,critical,low};
  },[agents]);

  const addProduct    = p  => update(s=>({...s,products:[...s.products,p]}));
  const updateProduct = (id,fn) => update(s=>({...s,products:s.products.map(p=>p.id===id?fn(p):p)}));
  const deleteProduct = id => update(s=>({...s,products:s.products.filter(p=>p.id!==id),agents:s.agents.map(a=>({...a,products:a.products.filter(p=>p.id!==id)}))}));
  const addAgent      = a  => update(s=>({...s,agents:[...s.agents,a]}));
  const updateAgent   = (id,fn) => update(s=>({...s,agents:s.agents.map(a=>a.id===id?fn(a):a)}));
  const deleteAgent   = id => update(s=>({...s,agents:s.agents.filter(a=>a.id!==id),staff:s.staff.map(st=>({...st,assignedAgents:st.assignedAgents.filter(x=>x!==id)}))}));
  const addStaff      = st => update(s=>({...s,staff:[...s.staff,st]}));
  const updateStaff   = (id,fn) => update(s=>({...s,staff:s.staff.map(st=>st.id===id?fn(st):st)}));
  const deleteStaff   = id => update(s=>({...s,staff:s.staff.filter(st=>st.id!==id)}));
  const approveEntry  = id => update(s=>{
    const entry = s.pendingEntries.find(e=>e.id===id);
    if(!entry) return s;
    const newAgents = s.agents.map(a=>{
      if(a.id!==entry.agentId) return a;
      return {
        ...a,
        totalOrdersAssigned: a.totalOrdersAssigned+(entry.oA||0),
        totalOrdersDelivered: a.totalOrdersDelivered+(entry.oD||0),
        products: a.products.map(p=>{
          const q=(entry.pQ||{})[p.id]?parseInt(entry.pQ[p.id])||0:0;
          return {...p,currentStock:Math.max(0,p.currentStock-q),totalDelivered:p.totalDelivered+q};
        }),
        dailyLogs:[...(a.dailyLogs||[]),{date:entry.date,day:entry.day,oA:entry.oA,oD:entry.oD,pQ:entry.pQ}],
      };
    });
    return {...s,agents:newAgents,pendingEntries:s.pendingEntries.map(e=>e.id===id?{...e,status:"approved"}:e)};
  });
  const rejectEntry = id => update(s=>({...s,pendingEntries:s.pendingEntries.map(e=>e.id===id?{...e,status:"rejected"}:e)}));

  const NAV = [
    {key:"dashboard", label:"Dashboard",      icon:"⬡"},
    {key:"setup",     label:"Setup",          icon:"⚙", highlight:agents.length===0||products.length===0},
    {key:"products",  label:"Products",       icon:"📦"},
    {key:"agents",    label:"All Agents",     icon:"◉"},
    {key:"staff",     label:"Staff",          icon:"👤"},
    {key:"passwords", label:"Passwords",      icon:"🔑"},
    {key:"approvals", label:"Approvals",      icon:"✓", badge:pendingCount, badgeColor:"#f59e0b"},
    {key:"stock",     label:"Stock Manager",  icon:"▦"},
    {key:"wednesday", label:"Wed Alert",      icon:"⚑", badge:totals.critical.length},
    {key:"weekly",    label:"Weekly Report",  icon:"▤"},
  ];

  const sharedProps = {state,products,agents,staff,totals,addProduct,updateProduct,deleteProduct,addAgent,updateAgent,deleteAgent,addStaff,updateStaff,deleteStaff,approveEntry,rejectEntry,pendingEntries,update};

  return (
    <Shell session={session} setSession={setSession} nav={NAV} activeTab={tab} setTab={setTab} pendingCount={pendingCount}>
      {tab==="dashboard" && <AdminDashboard {...sharedProps} setTab={setTab}/>}
      {tab==="setup"     && <Setup {...sharedProps}/>}
      {tab==="products"   && <ProductsOverview agents={agents} products={products}/>}
      {tab==="agents"    && <AgentsView agents={agents} products={products}/>}
      {tab==="staff"     && <StaffManager {...sharedProps}/>}
      {tab==="passwords"  && <PasswordManager staff={staff} session={session} updateStaff={updateStaff}/>}
      {tab==="approvals" && <Approvals {...sharedProps}/>}
      {tab==="stock"     && <StockManager {...sharedProps}/>}
      {tab==="wednesday" && <WednesdayAlert agents={agents} products={products} totals={totals}/>}
      {tab==="weekly"    && <WeeklyReport agents={agents} products={products} totals={totals}/>}
    </Shell>
  );
}

/* ══ STAFF APP ══════════════════════════════════════════════ */
function StaffApp({ state, update, session, setSession }) {
  const [tab, setTab] = useState("entry");

  const myAgents = state.agents.filter(a=>session.assignedAgents.includes(a.id));
  const myPending = state.pendingEntries.filter(e=>e.staffId===session.id&&e.status==="pending").length;

  const submitEntry = entry => update(s=>({...s,pendingEntries:[...s.pendingEntries,{...entry,id:uid(),staffId:session.id,staffName:session.name,status:"pending",submittedAt:new Date().toISOString()}]}));

  const NAV = [
    {key:"entry",      label:"Log Delivery",   icon:"✎"},
    {key:"mystatus",   label:"My Submissions",  icon:"◎", badge:myPending, badgeColor:"#f59e0b"},
    {key:"mystock",    label:"My Stock View",   icon:"▦"},
    {key:"changepass", label:"Change Password", icon:"🔑"},
  ];

  return (
    <Shell session={session} setSession={setSession} nav={NAV} activeTab={tab} setTab={setTab}>
      {tab==="entry"    && <StaffEntry myAgents={myAgents} products={state.products} submitEntry={submitEntry}/>}
      {tab==="mystatus" && <MySubmissions pendingEntries={state.pendingEntries.filter(e=>e.staffId===session.id)} agents={state.agents}/>}
      {tab==="mystock"    && <MyStockView myAgents={myAgents} products={state.products}/>}
      {tab==="changepass" && <ChangePassword session={session} updateStaff={updateStaff} state={state}/>}
    </Shell>
  );
}

/* ══ ADMIN DASHBOARD ════════════════════════════════════════ */
function AdminDashboard({agents,products,totals,pendingEntries,setTab}) {
  const ranked = [...agents].sort((a,b)=>deliveryRate(b)-deliveryRate(a));
  const pending = pendingEntries.filter(e=>e.status==="pending");

  if(agents.length===0||products.length===0) return (
    <div>
      <PageHeader title="Dashboard" sub="Operations overview"/>
      <EmptyState icon="⚙️" title="App not set up yet" sub="Start by adding your products and delivery agents."
        action={<Btn onClick={()=>setTab("setup")}>Go to Setup →</Btn>}/>
    </div>
  );

  return (
    <div>
      <PageHeader title="Dashboard" sub={`${agents.length} agents · ${products.length} products`}
        right={<div style={{background:"#6366f118",border:"1px solid #6366f130",color:"#818cf8",padding:"6px 14px",borderRadius:20,fontSize:12,fontWeight:700}}>TODAY: {todayDay}</div>}
      />
      <div className="stat-grid-4" style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:12,marginBottom:18}}>
        <StatCard label="Orders Assigned"  value={totals.assigned.toLocaleString()}  accent="#6366f1" icon="📋"/>
        <StatCard label="Orders Delivered" value={totals.delivered.toLocaleString()} accent="#10b981" icon="✅"/>
        <StatCard label="Delivery Rate"    value={`${totals.rate}%`}                 accent={rc(totals.rate)} icon="📈"/>
        <StatCard label="Stock Remaining"  value={totals.stock.toLocaleString()}      accent="#f59e0b" icon="📦"/>
      </div>
      {pending.length>0&&<InfoBox type="warn">⏳ <b>{pending.length} staff submission{pending.length>1?"s":""} awaiting your approval.</b> <span style={{cursor:"pointer",textDecoration:"underline"}} onClick={()=>setTab("approvals")}>Review now →</span></InfoBox>}
      {totals.critical.length>0&&<InfoBox type="danger">🚨 <b>{totals.critical.length} agent{totals.critical.length>1?"s":""} critically low on stock.</b> <span style={{cursor:"pointer",textDecoration:"underline"}} onClick={()=>setTab("wednesday")}>View Wednesday Alert →</span></InfoBox>}

      <div className="grid-2col" style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:18,marginBottom:18}}>
        <Card>
          <div style={{fontSize:15,fontWeight:800,color:"#f1f5f9",marginBottom:16}}>🏆 Top Performers</div>
          {ranked.slice(0,5).map((a,i)=>{const r=deliveryRate(a);return(
            <div key={a.id} style={{display:"flex",alignItems:"center",gap:12,padding:"9px 0",borderBottom:i<4?"1px solid #0d1120":"none"}}>
              <div style={{width:26,height:26,borderRadius:"50%",background:"#6366f118",display:"flex",alignItems:"center",justifyContent:"center",fontSize:12,fontWeight:900,color:"#818cf8",flexShrink:0}}>{i===0?"🥇":i===1?"🥈":i===2?"🥉":i+1}</div>
              <div style={{flex:1,minWidth:0}}>
                <div style={{fontSize:13,fontWeight:700,color:"#f1f5f9",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{a.agentName}</div>
                <div style={{fontSize:11,color:"#475569"}}>{a.state}</div>
              </div>
              <RateBar rate={r} width={55}/>
            </div>
          );})}
          {ranked.length===0&&<div style={{color:"#334155",fontSize:13,textAlign:"center",padding:"20px 0"}}>No data yet</div>}
        </Card>
        <Card>
          <div style={{fontSize:15,fontWeight:800,color:"#f1f5f9",marginBottom:16}}>⚠️ Needs Attention</div>
          {ranked.slice(-5).reverse().map((a,i)=>{const r=deliveryRate(a);return(
            <div key={a.id} style={{display:"flex",alignItems:"center",gap:12,padding:"9px 0",borderBottom:i<4?"1px solid #0d1120":"none"}}>
              <div style={{width:26,height:26,borderRadius:"50%",background:"#ef444415",display:"flex",alignItems:"center",justifyContent:"center",fontSize:12,fontWeight:900,color:"#ef4444",flexShrink:0}}>{i+1}</div>
              <div style={{flex:1,minWidth:0}}>
                <div style={{fontSize:13,fontWeight:700,color:"#f1f5f9",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{a.agentName}</div>
                <div style={{fontSize:11,color:"#475569"}}>{a.state}</div>
              </div>
              <RateBar rate={r} width={55}/>
            </div>
          );})}
          {ranked.length===0&&<div style={{color:"#334155",fontSize:13,textAlign:"center",padding:"20px 0"}}>No data yet</div>}
        </Card>
      </div>

      <Card>
        <div style={{fontSize:15,fontWeight:800,color:"#f1f5f9",marginBottom:16}}>📦 Product Stock Summary</div>
        <div style={{overflowX:"auto"}}>
          <table style={{width:"100%",borderCollapse:"collapse"}}>
            <thead><tr style={{background:"#07090f"}}>{["Product","SKU","Initial","Delivered","Remaining","Health"].map(h=><TH key={h}>{h}</TH>)}</tr></thead>
            <tbody>
              {products.map(p=>{
                const init=agents.reduce((s,a)=>{const ap=a.products.find(x=>x.id===p.id);return s+(ap?.initialStock||0);},0);
                const del =agents.reduce((s,a)=>{const ap=a.products.find(x=>x.id===p.id);return s+(ap?.totalDelivered||0);},0);
                const rem =agents.reduce((s,a)=>{const ap=a.products.find(x=>x.id===p.id);return s+(ap?.currentStock||0);},0);
                const pct =init>0?Math.round((rem/init)*100):0;
                return(
                  <tr key={p.id} className="rhov">
                    <TD><b style={{color:"#f1f5f9"}}>{p.name}</b></TD>
                    <TD><span style={{fontFamily:"'JetBrains Mono',monospace",fontSize:12,color:"#6366f1",background:"#6366f112",padding:"2px 7px",borderRadius:5}}>{p.sku}</span></TD>
                    <TD>{init.toLocaleString()}</TD>
                    <TD style={{color:"#10b981",fontWeight:700}}>{del.toLocaleString()}</TD>
                    <TD style={{fontWeight:700}}>{rem.toLocaleString()}</TD>
                    <TD>
                      <div style={{display:"flex",alignItems:"center",gap:8}}>
                        <div style={{width:80,height:6,background:"#1a2238",borderRadius:3,overflow:"hidden"}}>
                          <div style={{width:`${pct}%`,height:"100%",background:rc(pct),borderRadius:3}}/>
                        </div>
                        <span style={{fontSize:12,fontWeight:700,color:rc(pct)}}>{pct}%</span>
                      </div>
                    </TD>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

/* ══ SETUP ══════════════════════════════════════════════════ */
function Setup({products,agents,addProduct,updateProduct,deleteProduct,addAgent,updateAgent,deleteAgent}) {
  const [activeTab,setActiveTab] = useState("products");
  const [pName,setPName]=useState(""); const [pSku,setPSku]=useState("");
  const [pEdit,setPEdit]=useState(null); const [pEN,setPEN]=useState(""); const [pES,setPES]=useState("");
  const [aName,setAName]=useState(""); const [aState,setAState]=useState(""); const [aPhone,setAPhone]=useState("");
  const [aEdit,setAEdit]=useState(null); const [aEN,setAEN]=useState(""); const [aES,setAES]=useState(""); const [aEP,setAEP]=useState("");
  const [msg,setMsg]=useState(null);
  const flash=(text,type="good")=>{setMsg({text,type});setTimeout(()=>setMsg(null),3500);};

  const saveProduct=()=>{
    if(!pName.trim()||!pSku.trim()) return flash("Enter product name and SKU","warn");
    if(products.find(p=>p.sku.toLowerCase()===pSku.toLowerCase())) return flash("SKU already exists","warn");
    addProduct({id:uid(),name:pName.trim(),sku:pSku.trim().toUpperCase()});
    setPName("");setPSku(""); flash(`"${pName.trim()}" added!`);
  };
  const saveProductEdit=id=>{
    if(!pEN.trim()||!pES.trim()) return;
    updateProduct(id,p=>({...p,name:pEN.trim(),sku:pES.trim().toUpperCase()}));
    setPEdit(null); flash("Product updated!");
  };
  const [aProducts, setAProducts] = useState([]);
  const toggleAgentProduct = (pid) => setAProducts(prev => prev.includes(pid) ? prev.filter(x=>x!==pid) : [...prev,pid]);

  const saveAgent=()=>{
    if(!aName.trim()||!aState) return flash("Enter agent name and select state","warn");
    if(aProducts.length===0) return flash("Select at least one product for this agent","warn");
    const assignedProds = products.filter(p=>aProducts.includes(p.id)).map(p=>({...p,initialStock:0,currentStock:0,totalDelivered:0}));
    addAgent({id:uid(),agentName:aName.trim(),state:aState,phone:aPhone.trim(),
      products:assignedProds,
      totalOrdersAssigned:0,totalOrdersDelivered:0,dailyLogs:[],stockHistory:[]});
    setAName("");setAState("");setAPhone("");setAProducts([]); flash(`${aName.trim()} added for ${aState}!`);
  };
  const saveAgentEdit=id=>{
    if(!aEN.trim()||!aES) return;
    updateAgent(id,a=>({...a,agentName:aEN.trim(),state:aES,phone:aEP.trim()}));
    setAEdit(null); flash("Agent updated!");
  };

  return (
    <div>
      <PageHeader title="Setup" sub="Manage products and delivery agents"/>
      {msg&&<InfoBox type={msg.type}>{msg.text}</InfoBox>}
      <div style={{display:"flex",gap:8,marginBottom:24}}>
        {[["products",`📦 Products (${products.length})`],["agents",`👤 Agents (${agents.length})`]].map(([k,l])=>(
          <Btn key={k} variant={activeTab===k?"primary":"ghost"} onClick={()=>setActiveTab(k)}>{l}</Btn>
        ))}
      </div>

      {/* PRODUCTS */}
      {activeTab==="products"&&(
        <div className="setup-grid" style={{display:"grid",gridTemplateColumns:"340px 1fr",gap:20,alignItems:"start"}}>
          <Card>
            <div style={{fontSize:15,fontWeight:800,color:"#f1f5f9",marginBottom:18}}>➕ Add Product</div>
            <div style={{display:"flex",flexDirection:"column",gap:12,marginBottom:16}}>
              <Inp label="Product Name" value={pName} onChange={e=>setPName(e.target.value)} placeholder="e.g. Body Cream 250ml"/>
              <Inp label="SKU Code"     value={pSku}  onChange={e=>setPSku(e.target.value)}  placeholder="e.g. BC250"/>
            </div>
            <Btn onClick={saveProduct} style={{width:"100%"}}>Add Product</Btn>
            <div style={{fontSize:12,color:"#334155",marginTop:12,lineHeight:1.7}}>💡 Add all product types before setting up agents.</div>
          </Card>
          <Card style={{padding:0,overflow:"hidden"}}>
            {products.length===0?<EmptyState icon="📦" title="No products yet" sub="Add your first product"/>:(
              <table style={{width:"100%",borderCollapse:"collapse"}}>
                <thead><tr style={{background:"#07090f"}}><TH>#</TH><TH>Name</TH><TH>SKU</TH><TH>Actions</TH></tr></thead>
                <tbody>
                  {products.map((p,i)=>pEdit===p.id?(
                    <tr key={p.id} style={{background:"#0d1528"}}>
                      <TD style={{color:"#334155",fontFamily:"'JetBrains Mono',monospace",fontSize:11}}>{String(i+1).padStart(2,"0")}</TD>
                      <TD><input value={pEN} onChange={e=>setPEN(e.target.value)} style={{background:"#07090f",border:"1px solid #6366f1",borderRadius:6,color:"#f1f5f9",padding:"6px 10px",fontSize:13,width:"100%",outline:"none"}}/></TD>
                      <TD><input value={pES} onChange={e=>setPES(e.target.value)} style={{background:"#07090f",border:"1px solid #6366f1",borderRadius:6,color:"#f1f5f9",padding:"6px 10px",fontSize:13,width:100,fontFamily:"'JetBrains Mono',monospace",outline:"none"}}/></TD>
                      <TD><div style={{display:"flex",gap:6}}><Btn small variant="success" onClick={()=>saveProductEdit(p.id)}>Save</Btn><Btn small variant="ghost" onClick={()=>setPEdit(null)}>Cancel</Btn></div></TD>
                    </tr>
                  ):(
                    <tr key={p.id} className="rhov">
                      <TD style={{color:"#334155",fontFamily:"'JetBrains Mono',monospace",fontSize:11}}>{String(i+1).padStart(2,"0")}</TD>
                      <TD><b style={{color:"#f1f5f9"}}>{p.name}</b></TD>
                      <TD><span style={{fontFamily:"'JetBrains Mono',monospace",fontSize:12,color:"#6366f1",background:"#6366f112",padding:"3px 8px",borderRadius:5}}>{p.sku}</span></TD>
                      <TD><div style={{display:"flex",gap:6}}><Btn small variant="ghost" onClick={()=>{setPEdit(p.id);setPEN(p.name);setPES(p.sku);}}>Edit</Btn><Btn small variant="danger" onClick={()=>deleteProduct(p.id)}>Delete</Btn></div></TD>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Card>
        </div>
      )}

      {/* AGENTS — multiple per state */}
      {activeTab==="agents"&&(
        <div className="setup-grid" style={{display:"grid",gridTemplateColumns:"340px 1fr",gap:20,alignItems:"start"}}>
          <Card>
            <div style={{fontSize:15,fontWeight:800,color:"#f1f5f9",marginBottom:18}}>➕ Add Delivery Agent</div>
            {products.length===0&&<InfoBox type="warn">⚠️ Add products first.</InfoBox>}
            <div style={{display:"flex",flexDirection:"column",gap:12,marginBottom:16}}>
              <Inp label="Agent Full Name" value={aName} onChange={e=>setAName(e.target.value)} placeholder="e.g. Emeka Obi"/>
              <Sel label="State / Location" value={aState} onChange={e=>setAState(e.target.value)}>
                <option value="">— Select state —</option>
                {NIGERIAN_STATES.map(s=><option key={s} value={s}>{s}</option>)}
              </Sel>
              <Inp label="Phone (optional)" value={aPhone} onChange={e=>setAPhone(e.target.value)} placeholder="e.g. 08012345678"/>
            </div>
            <div style={{marginBottom:16}}>
              <label style={{fontSize:12,color:"#64748b",fontWeight:600,marginBottom:8,display:"block"}}>Assign Products to this Agent</label>
              {products.length===0
                ? <div style={{fontSize:12,color:"#334155"}}>No products yet — add products first.</div>
                : <div style={{display:"flex",flexDirection:"column",gap:6,maxHeight:180,overflowY:"auto"}}>
                    {products.map(p=>(
                      <label key={p.id} style={{display:"flex",alignItems:"center",gap:10,padding:"8px 10px",background:"#07090f",borderRadius:7,border:`1px solid ${aProducts.includes(p.id)?"#6366f1":"#1a2238"}`,cursor:"pointer",transition:"border-color .15s"}}>
                        <input type="checkbox" checked={aProducts.includes(p.id)} onChange={()=>toggleAgentProduct(p.id)} style={{accentColor:"#6366f1",width:14,height:14}}/>
                        <div>
                          <div style={{fontSize:13,fontWeight:600,color:"#f1f5f9"}}>{p.name}</div>
                          <div style={{fontSize:11,color:"#475569",fontFamily:"'JetBrains Mono',monospace"}}>{p.sku}</div>
                        </div>
                        {aProducts.includes(p.id) && <span style={{marginLeft:"auto",fontSize:11,color:"#6366f1",fontWeight:700}}>✓ Selected</span>}
                      </label>
                    ))}
                  </div>
              }
            </div>
            <Btn onClick={saveAgent} style={{width:"100%"}} variant={products.length===0?"ghost":"primary"}>Add Agent</Btn>
            <div style={{fontSize:12,color:"#334155",marginTop:12,lineHeight:1.7}}>💡 You can assign specific products to each agent. Set their stock in <b style={{color:"#f59e0b"}}>Stock Manager</b> after adding.</div>
          </Card>
          <Card style={{padding:0,overflow:"hidden"}}>
            {agents.length===0?<EmptyState icon="👤" title="No agents yet" sub="Add your first agent"/>:(
              <table style={{width:"100%",borderCollapse:"collapse"}}>
                <thead><tr style={{background:"#07090f"}}><TH>#</TH><TH>Agent Name</TH><TH>State</TH><TH>Phone</TH><TH>Stock</TH><TH>Actions</TH></tr></thead>
                <tbody>
                  {agents.map((a,i)=>aEdit===a.id?(
                    <tr key={a.id} style={{background:"#0d1528"}}>
                      <TD style={{color:"#334155",fontFamily:"'JetBrains Mono',monospace",fontSize:11}}>{String(i+1).padStart(2,"0")}</TD>
                      <TD><input value={aEN} onChange={e=>setAEN(e.target.value)} style={{background:"#07090f",border:"1px solid #6366f1",borderRadius:6,color:"#f1f5f9",padding:"6px 10px",fontSize:13,width:"100%",outline:"none"}}/></TD>
                      <TD>
                        <select value={aES} onChange={e=>setAES(e.target.value)} style={{background:"#07090f",border:"1px solid #6366f1",borderRadius:6,color:"#f1f5f9",padding:"6px 10px",fontSize:13,outline:"none"}}>
                          {NIGERIAN_STATES.map(s=><option key={s} value={s}>{s}</option>)}
                        </select>
                      </TD>
                      <TD><input value={aEP} onChange={e=>setAEP(e.target.value)} style={{background:"#07090f",border:"1px solid #6366f1",borderRadius:6,color:"#f1f5f9",padding:"6px 10px",fontSize:13,width:130,outline:"none"}}/></TD>
                      <TD style={{color:"#475569"}}>{totalStock(a)}</TD>
                      <TD><div style={{display:"flex",gap:6}}><Btn small variant="success" onClick={()=>saveAgentEdit(a.id)}>Save</Btn><Btn small variant="ghost" onClick={()=>setAEdit(null)}>Cancel</Btn></div></TD>
                    </tr>
                  ):(
                    <tr key={a.id} className="rhov">
                      <TD style={{color:"#334155",fontFamily:"'JetBrains Mono',monospace",fontSize:11}}>{String(i+1).padStart(2,"0")}</TD>
                      <TD><b style={{color:"#f1f5f9"}}>{a.agentName}</b></TD>
                      <TD>{a.state}</TD>
                      <TD style={{color:"#475569",fontSize:12,fontFamily:"'JetBrains Mono',monospace"}}>{a.phone||"—"}</TD>
                      <TD style={{color:totalStock(a)<20?"#ef4444":totalStock(a)<50?"#f59e0b":"#64748b",fontWeight:600}}>{totalStock(a)}</TD>
                      <TD><div style={{display:"flex",gap:6}}><Btn small variant="ghost" onClick={()=>{setAEdit(a.id);setAEN(a.agentName);setAES(a.state);setAEP(a.phone||"");}}>Edit</Btn><Btn small variant="danger" onClick={()=>deleteAgent(a.id)}>Delete</Btn></div></TD>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Card>
        </div>
      )}
    </div>
  );
}

/* ══ STAFF MANAGER ══════════════════════════════════════════ */
function StaffManager({staff,agents,addStaff,updateStaff,deleteStaff}) {
  const [sName,setSName]=useState(""); const [sUser,setSUser]=useState("");
  const [sPass,setSPass]=useState(""); const [sAgents,setSAgents]=useState([]);
  const [edit,setEdit]=useState(null);
  const [eN,setEN]=useState(""); const [eU,setEU]=useState(""); const [eP,setEP]=useState(""); const [eA,setEA]=useState([]);
  const [msg,setMsg]=useState(null);
  const flash=(text,type="good")=>{setMsg({text,type});setTimeout(()=>setMsg(null),3500);};

  const toggleAgent=(id,list,setList)=>{
    setList(prev=>prev.includes(id)?prev.filter(x=>x!==id):[...prev,id]);
  };

  const save=()=>{
    if(!sName.trim()||!sUser.trim()||!sPass.trim()) return flash("Fill in name, username, and password","warn");
    if(staff.find(s=>s.username===sUser.trim())) return flash("Username already taken","warn");
    addStaff({id:uid(),name:sName.trim(),username:sUser.trim(),password:sPass.trim(),role:"staff",assignedAgents:sAgents});
    setSName("");setSUser("");setSPass("");setSAgents([]);
    flash("Staff member created!");
  };
  const saveEdit=id=>{
    if(!eN.trim()||!eU.trim()) return;
    updateStaff(id,s=>({...s,name:eN.trim(),username:eU.trim(),...(eP?{password:eP.trim()}:{}),assignedAgents:eA}));
    setEdit(null); flash("Staff updated!");
  };

  const nonAdminStaff = staff.filter(s=>s.role!=="admin");

  return (
    <div>
      <PageHeader title="Staff Management" sub="Register staff and assign them to delivery agents"/>
      {msg&&<InfoBox type={msg.type}>{msg.text}</InfoBox>}

      <div className="setup-grid" style={{display:"grid",gridTemplateColumns:"360px 1fr",gap:20,alignItems:"start"}}>
        {/* ADD FORM */}
        <Card>
          <div style={{fontSize:15,fontWeight:800,color:"#f1f5f9",marginBottom:18}}>➕ Register New Staff</div>
          <div style={{display:"flex",flexDirection:"column",gap:12,marginBottom:16}}>
            <Inp label="Full Name"  value={sName} onChange={e=>setSName(e.target.value)} placeholder="e.g. Amaka Okafor"/>
            <Inp label="Username"   value={sUser} onChange={e=>setSUser(e.target.value)} placeholder="e.g. amaka.okafor"/>
            <Inp label="Password" type="password" value={sPass} onChange={e=>setSPass(e.target.value)} placeholder="Create a password"/>
          </div>
          <div style={{marginBottom:16}}>
            <label style={{fontSize:12,color:"#64748b",fontWeight:600,marginBottom:8,display:"block"}}>Assign Agents (select one or more)</label>
            {agents.length===0&&<div style={{fontSize:12,color:"#334155"}}>No agents added yet. Add agents in Setup first.</div>}
            <div style={{display:"flex",flexDirection:"column",gap:6,maxHeight:200,overflowY:"auto"}}>
              {agents.map(a=>(
                <label key={a.id} style={{display:"flex",alignItems:"center",gap:10,padding:"8px 10px",background:"#07090f",borderRadius:7,border:`1px solid ${sAgents.includes(a.id)?"#6366f1":"#1a2238"}`,cursor:"pointer",transition:"border-color .15s"}}>
                  <input type="checkbox" checked={sAgents.includes(a.id)} onChange={()=>toggleAgent(a.id,sAgents,setSAgents)} style={{accentColor:"#6366f1",width:14,height:14}}/>
                  <div>
                    <div style={{fontSize:13,fontWeight:600,color:"#f1f5f9"}}>{a.agentName}</div>
                    <div style={{fontSize:11,color:"#475569"}}>{a.state}</div>
                  </div>
                </label>
              ))}
            </div>
          </div>
          <Btn onClick={save} style={{width:"100%"}}>Create Staff Account</Btn>
          <div style={{fontSize:12,color:"#334155",marginTop:12,lineHeight:1.7}}>💡 Staff will log in with their username and password and can only see and update their assigned agents.</div>
        </Card>

        {/* STAFF LIST */}
        <Card style={{padding:0,overflow:"hidden"}}>
          {nonAdminStaff.length===0?<EmptyState icon="👤" title="No staff registered yet" sub="Add your first staff member on the left"/>:(
            <table style={{width:"100%",borderCollapse:"collapse"}}>
              <thead><tr style={{background:"#07090f"}}><TH>#</TH><TH>Name</TH><TH>Username</TH><TH>Assigned Agents</TH><TH>Actions</TH></tr></thead>
              <tbody>
                {nonAdminStaff.map((s,i)=>edit===s.id?(
                  <tr key={s.id} style={{background:"#0d1528"}}>
                    <TD style={{color:"#334155",fontFamily:"'JetBrains Mono',monospace",fontSize:11}}>{String(i+1).padStart(2,"0")}</TD>
                    <TD><input value={eN} onChange={e=>setEN(e.target.value)} style={{background:"#07090f",border:"1px solid #6366f1",borderRadius:6,color:"#f1f5f9",padding:"6px 10px",fontSize:13,width:"100%",outline:"none"}}/></TD>
                    <TD><input value={eU} onChange={e=>setEU(e.target.value)} style={{background:"#07090f",border:"1px solid #6366f1",borderRadius:6,color:"#f1f5f9",padding:"6px 10px",fontSize:13,width:"100%",outline:"none"}}/></TD>
                    <TD>
                      <div style={{display:"flex",flexDirection:"column",gap:4,maxHeight:120,overflowY:"auto"}}>
                        {agents.map(a=>(
                          <label key={a.id} style={{display:"flex",alignItems:"center",gap:8,cursor:"pointer",fontSize:12}}>
                            <input type="checkbox" checked={eA.includes(a.id)} onChange={()=>toggleAgent(a.id,eA,setEA)} style={{accentColor:"#6366f1"}}/>
                            <span style={{color:"#f1f5f9"}}>{a.agentName} <span style={{color:"#475569"}}>({a.state})</span></span>
                          </label>
                        ))}
                      </div>
                    </TD>
                    <TD><div style={{display:"flex",gap:6}}><Btn small variant="success" onClick={()=>saveEdit(s.id)}>Save</Btn><Btn small variant="ghost" onClick={()=>setEdit(null)}>Cancel</Btn></div></TD>
                  </tr>
                ):(
                  <tr key={s.id} className="rhov">
                    <TD style={{color:"#334155",fontFamily:"'JetBrains Mono',monospace",fontSize:11}}>{String(i+1).padStart(2,"0")}</TD>
                    <TD><b style={{color:"#f1f5f9"}}>{s.name}</b></TD>
                    <TD><span style={{fontFamily:"'JetBrains Mono',monospace",fontSize:12,color:"#6366f1"}}>{s.username}</span></TD>
                    <TD>
                      <div style={{display:"flex",flexWrap:"wrap",gap:4}}>
                        {s.assignedAgents.length===0?<span style={{color:"#334155",fontSize:12}}>None assigned</span>:s.assignedAgents.map(id=>{
                          const ag=agents.find(a=>a.id===id);
                          return ag?<span key={id} style={{fontSize:11,background:"#6366f118",color:"#818cf8",padding:"2px 8px",borderRadius:20,border:"1px solid #6366f130"}}>{ag.agentName} · {ag.state}</span>:null;
                        })}
                      </div>
                    </TD>
                    <TD>
                      <div style={{display:"flex",gap:6}}>
                        <Btn small variant="ghost" onClick={()=>{setEdit(s.id);setEN(s.name);setEU(s.username);setEP("");setEA(s.assignedAgents||[]);}}>Edit</Btn>
                        <Btn small variant="danger" onClick={()=>deleteStaff(s.id)}>Delete</Btn>
                      </div>
                    </TD>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>
      </div>
    </div>
  );
}

/* ══ APPROVALS ══════════════════════════════════════════════ */
function Approvals({pendingEntries,agents,approveEntry,rejectEntry}) {
  const [filter,setFilter]=useState("pending");
  const list = pendingEntries.filter(e=>filter==="all"||e.status===filter).sort((a,b)=>new Date(b.submittedAt)-new Date(a.submittedAt));

  return (
    <div>
      <PageHeader title="Staff Submissions" sub="Review and approve daily entries submitted by staff"/>
      <div style={{display:"flex",gap:8,marginBottom:20}}>
        {[["pending","⏳ Pending"],["approved","✅ Approved"],["rejected","❌ Rejected"],["all","All"]].map(([v,l])=>(
          <Btn key={v} small variant={filter===v?"primary":"ghost"} onClick={()=>setFilter(v)}>{l}</Btn>
        ))}
      </div>
      {list.length===0&&<EmptyState icon="✓" title="No submissions" sub={`No ${filter==="all"?"":filter} submissions yet.`}/>}
      <div style={{display:"flex",flexDirection:"column",gap:12}}>
        {list.map(e=>{
          const ag=agents.find(a=>a.id===e.agentId);
          const rate=e.oA>0?Math.round((e.oD/e.oA)*100):0;
          return(
            <Card key={e.id} style={{border:`1px solid ${e.status==="pending"?"#f59e0b30":e.status==="approved"?"#10b98130":"#ef444430"}`}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:14}}>
                <div>
                  <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:4}}>
                    <span style={{fontSize:15,fontWeight:800,color:"#f1f5f9"}}>{ag?.agentName||"Unknown Agent"}</span>
                    <span style={{fontSize:12,color:"#475569"}}>·</span>
                    <span style={{fontSize:13,color:"#64748b"}}>{ag?.state}</span>
                    <Badge rate={rate}/>
                  </div>
                  <div style={{fontSize:12,color:"#475569"}}>
                    Submitted by <b style={{color:"#818cf8"}}>{e.staffName}</b> · {new Date(e.submittedAt).toLocaleString("en-NG")}
                  </div>
                </div>
                <div style={{display:"flex",alignItems:"center",gap:8}}>
                  <span style={{fontSize:12,fontWeight:700,padding:"4px 12px",borderRadius:20,
                    background:e.status==="pending"?"#f59e0b18":e.status==="approved"?"#10b98118":"#ef444418",
                    color:e.status==="pending"?"#f59e0b":e.status==="approved"?"#10b981":"#ef4444",
                    border:`1px solid ${e.status==="pending"?"#f59e0b30":e.status==="approved"?"#10b98130":"#ef444430"}`}}>
                    {e.status==="pending"?"⏳ Pending":e.status==="approved"?"✅ Approved":"❌ Rejected"}
                  </span>
                </div>
              </div>
              <div className="approval-grid" style={{display:"grid",gridTemplateColumns:"repeat(3,auto) 1fr",gap:20,marginBottom:e.status==="pending"?14:0,alignItems:"start"}}>
                <div style={{background:"#07090f",borderRadius:8,padding:"10px 16px",textAlign:"center",border:"1px solid #151c2e"}}>
                  <div style={{fontSize:22,fontWeight:900,color:"#f1f5f9"}}>{e.oA}</div>
                  <div style={{fontSize:11,color:"#475569"}}>Assigned</div>
                </div>
                <div style={{background:"#07090f",borderRadius:8,padding:"10px 16px",textAlign:"center",border:"1px solid #151c2e"}}>
                  <div style={{fontSize:22,fontWeight:900,color:"#10b981"}}>{e.oD}</div>
                  <div style={{fontSize:11,color:"#475569"}}>Delivered</div>
                </div>
                <div style={{background:"#07090f",borderRadius:8,padding:"10px 16px",textAlign:"center",border:"1px solid #151c2e"}}>
                  <div style={{fontSize:22,fontWeight:900,color:rc(rate)}}>{rate}%</div>
                  <div style={{fontSize:11,color:"#475569"}}>Rate</div>
                </div>
                <div style={{background:"#07090f",borderRadius:8,padding:"10px 14px",border:"1px solid #151c2e"}}>
                  <div style={{fontSize:11,color:"#475569",marginBottom:8,fontWeight:600,textTransform:"uppercase",letterSpacing:.5}}>Products Delivered</div>
                  <div style={{display:"flex",flexWrap:"wrap",gap:6}}>
                    {Object.entries(e.pQ||{}).filter(([,v])=>parseInt(v)>0).map(([pid,qty])=>{
                      const p=ag?.products.find(x=>x.id===pid);
                      return p?<span key={pid} style={{fontSize:12,background:"#6366f112",color:"#818cf8",padding:"3px 10px",borderRadius:20,border:"1px solid #6366f125"}}>{p.name}: <b>{qty}</b></span>:null;
                    })}
                    {Object.values(e.pQ||{}).every(v=>!parseInt(v))&&<span style={{fontSize:12,color:"#334155"}}>No product breakdown</span>}
                  </div>
                </div>
              </div>
              {e.status==="pending"&&(
                <div style={{display:"flex",gap:10,paddingTop:14,borderTop:"1px solid #0d1120"}}>
                  <Btn variant="success" onClick={()=>approveEntry(e.id)} style={{flex:1}}>✅ Approve & Apply to Stock</Btn>
                  <Btn variant="danger"  onClick={()=>rejectEntry(e.id)}  style={{flex:1}}>❌ Reject Entry</Btn>
                </div>
              )}
            </Card>
          );
        })}
      </div>
    </div>
  );
}

/* ══ AGENTS VIEW ════════════════════════════════════════════ */
function AgentsView({agents,products}) {
  const [search,setSearch]=useState("");
  const [filter,setFilter]=useState("all");
  const [expanded,setExpanded]=useState(null);
  const list=useMemo(()=>agents.filter(a=>{
    const q=search.toLowerCase();
    const ok=!q||a.state.toLowerCase().includes(q)||a.agentName.toLowerCase().includes(q);
    const r=deliveryRate(a);
    const rf=filter==="all"||(filter==="good"&&r>=80)||(filter==="avg"&&r>=60&&r<80)||(filter==="poor"&&r<60);
    return ok&&rf;
  }),[agents,search,filter]);

  if(agents.length===0) return <div><PageHeader title="All Agents" sub=""/><EmptyState icon="👤" title="No agents yet" sub="Add agents in Setup."/></div>;

  return (
    <div>
      <PageHeader title="All Agents" sub={`${list.length} of ${agents.length} agents`}/>
      <div style={{display:"flex",gap:10,marginBottom:18,flexWrap:"wrap"}}>
        <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search name or state…"
          style={{background:"#0d1120",border:"1px solid #1a2238",borderRadius:8,color:"#f1f5f9",padding:"9px 14px",fontSize:13,width:250,outline:"none"}}/>
        {[["all","All"],["good","≥80%"],["avg","60–79%"],["poor","<60%"]].map(([v,l])=>(
          <Btn key={v} small variant={filter===v?"primary":"ghost"} onClick={()=>setFilter(v)}>{l}</Btn>
        ))}
      </div>
      <Card style={{padding:0,overflow:"hidden"}}>
        <div style={{overflowX:"auto"}}>
          <table style={{width:"100%",borderCollapse:"collapse"}}>
            <thead><tr style={{background:"#07090f"}}>{["#","State","Agent","Orders Sent","Delivered","Rate","Stock","Status",""].map(h=><TH key={h}>{h}</TH>)}</tr></thead>
            <tbody>
              {list.map((a,i)=>{
                const r=deliveryRate(a); const stk=totalStock(a); const isExp=expanded===a.id;
                return [
                  <tr key={a.id} className="rhov" style={{cursor:"pointer",background:isExp?"#0d1528":"transparent"}} onClick={()=>setExpanded(isExp?null:a.id)}>
                    <TD><span style={{fontFamily:"'JetBrains Mono',monospace",color:"#1e2d40",fontSize:11}}>{String(i+1).padStart(2,"0")}</span></TD>
                    <TD><b style={{color:"#f1f5f9"}}>{a.state}</b></TD>
                    <TD>{a.agentName}</TD>
                    <TD>{a.totalOrdersAssigned}</TD>
                    <TD style={{color:"#10b981",fontWeight:700}}>{a.totalOrdersDelivered}</TD>
                    <TD><RateBar rate={r} width={55}/></TD>
                    <TD style={{fontWeight:700,color:stk<20?"#ef4444":stk<50?"#f59e0b":"#64748b"}}>{stk}{stk<20?" 🚨":stk<50?" ⚠️":""}</TD>
                    <TD><Badge rate={r}/></TD>
                    <TD style={{color:"#6366f1",fontWeight:700}}>{isExp?"▲":"▼"}</TD>
                  </tr>,
                  isExp&&(
                    <tr key={`${a.id}-exp`}>
                      <td colSpan={9} style={{background:"#0a0d18",padding:"16px 18px",borderBottom:"2px solid #6366f125"}}>
                        <div style={{fontSize:12,color:"#475569",marginBottom:10}}>📞 {a.phone||"No phone"} · {a.agentName}, {a.state}</div>
                        <div className="grid-3col" style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(140px,1fr))",gap:8}}>
                          {a.products.map(p=>(
                            <div key={p.id} style={{background:"#07090f",borderRadius:8,padding:12,border:"1px solid #151c2e"}}>
                              <div style={{fontSize:10,fontFamily:"'JetBrains Mono',monospace",color:"#6366f1"}}>{p.sku}</div>
                              <div style={{fontSize:12,fontWeight:700,color:"#f1f5f9",margin:"4px 0 6px"}}>{p.name}</div>
                              <div style={{display:"flex",justifyContent:"space-between",fontSize:11,color:"#475569"}}>
                                <span>Del:<b style={{color:"#10b981"}}> {p.totalDelivered}</b></span>
                                <span>Left:<b style={{color:p.currentStock<5?"#ef4444":"#f59e0b"}}> {p.currentStock}</b></span>
                              </div>
                            </div>
                          ))}
                        </div>
                      </td>
                    </tr>
                  )
                ];
              })}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

/* ══ STOCK MANAGER ══════════════════════════════════════════ */
function StockManager({agents,products,updateAgent}) {
  const [mode,setMode]=useState("init");
  const [agentId,setAgentId]=useState("");
  const [qtys,setQtys]=useState({});
  const [saved,setSaved]=useState(false);
  const agent=agents.find(a=>a.id===agentId);

  const save=()=>{
    if(!agent)return;
    updateAgent(agentId,a=>({
      ...a,
      products:a.products.map(p=>{
        const q=parseInt(qtys[p.id])||0;
        return mode==="init"?{...p,initialStock:q,currentStock:q,totalDelivered:0}:{...p,initialStock:p.initialStock+q,currentStock:p.currentStock+q};
      }),
      stockHistory:[...a.stockHistory,{date:todayISO,type:mode}],
    }));
    setSaved(true);setQtys({});setTimeout(()=>setSaved(false),3000);
  };

  if(agents.length===0||products.length===0) return <div><PageHeader title="Stock Manager" sub=""/><EmptyState icon="▦" title="Setup required" sub="Add products and agents in Setup first."/></div>;

  return (
    <div>
      <PageHeader title="Stock Manager" sub="Set initial stock or send new stock (Thursdays)"
        right={<div style={{background:todayDay==="Thu"?"#10b98118":"#151c2e",border:"1px solid #10b98130",color:todayDay==="Thu"?"#10b981":"#334155",padding:"6px 14px",borderRadius:20,fontSize:12,fontWeight:700}}>{todayDay==="Thu"?"🚚 DISPATCH DAY":"Next Dispatch: Thursday"}</div>}
      />
      {saved&&<InfoBox type="good">✅ Stock updated!</InfoBox>}
      <div className="grid-2col" style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:20}}>
        <Card>
          <div style={{display:"flex",gap:8,marginBottom:18}}>
            {[["init","🆕 Initial Stock"],["restock","🚚 New Stock"]].map(([m,l])=>(
              <Btn key={m} variant={mode===m?"primary":"ghost"} onClick={()=>setMode(m)} style={{flex:1}}>{l}</Btn>
            ))}
          </div>
          <div style={{marginBottom:14}}>
            <Sel label="Select Agent" value={agentId} onChange={e=>setAgentId(e.target.value)}>
              <option value="">— Choose agent —</option>
              {agents.map(a=><option key={a.id} value={a.id}>{a.state} — {a.agentName}</option>)}
            </Sel>
          </div>
          {agent&&<>
            {mode==="restock"&&<InfoBox type="info">💡 Suggested based on {deliveryRate(agent)}% delivery rate.</InfoBox>}
            {agent.products.map(p=>{
              const sug=suggestQty(agent,products).find(x=>x.id===p.id);
              return(
                <div key={p.id} style={{display:"flex",alignItems:"center",gap:14,padding:"11px 0",borderBottom:"1px solid #0a0c14"}}>
                  <div style={{flex:1}}>
                    <div style={{fontSize:13,fontWeight:700,color:"#f1f5f9"}}>{p.name}</div>
                    <div style={{fontSize:11,color:"#334155",fontFamily:"'JetBrains Mono',monospace",marginTop:2}}>{p.sku}{mode==="restock"?` · now:${p.currentStock} · suggest:${sug?.suggested}`:""}</div>
                  </div>
                  <input type="number" min="0" value={qtys[p.id]||""} onChange={e=>setQtys(v=>({...v,[p.id]:e.target.value}))}
                    placeholder={mode==="restock"?String(sug?.suggested):"0"}
                    style={{width:72,background:"#07090f",border:"1px solid #1a2238",borderRadius:8,color:"#f1f5f9",padding:"10px 0",fontSize:14,fontWeight:700,textAlign:"center",outline:"none",WebkitAppearance:"none"}}/>
                </div>
              );
            })}
            <Btn onClick={save} style={{width:"100%",marginTop:18}}>{mode==="init"?"Save Initial Stock →":"Confirm Dispatch →"}</Btn>
          </>}
        </Card>
        <Card>
          <div style={{fontSize:15,fontWeight:800,color:"#f1f5f9",marginBottom:16}}>📜 Recent Dispatches</div>
          {agents.filter(a=>a.stockHistory.length>0).length===0?<div style={{textAlign:"center",padding:"30px 0",color:"#1e2d40",fontSize:13}}>No dispatches yet.</div>
            :agents.filter(a=>a.stockHistory.length>0).slice(0,12).map(a=>{
              const last=a.stockHistory[a.stockHistory.length-1];
              return(
                <div key={a.id} style={{background:"#07090f",borderRadius:10,padding:14,marginBottom:10,border:"1px solid #151c2e",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                  <div>
                    <div style={{fontWeight:700,color:"#f1f5f9",fontSize:13}}>{a.state} — {a.agentName}</div>
                    <div style={{fontSize:11,color:"#475569",marginTop:2}}>{last.date} · {last.type==="init"?"Initial":"Restock"}</div>
                  </div>
                  <div style={{fontFamily:"'JetBrains Mono',monospace",color:"#6366f1",fontWeight:700}}>{totalStock(a)} units</div>
                </div>
              );
            })
          }
        </Card>
      </div>
    </div>
  );
}

/* ══ WEDNESDAY ALERT ════════════════════════════════════════ */
function WednesdayAlert({agents,products,totals}) {
  const critical=[...agents].filter(a=>totalStock(a)<20&&a.products.length>0).sort((a,b)=>totalStock(a)-totalStock(b));
  const low=[...agents].filter(a=>totalStock(a)>=20&&totalStock(a)<50&&a.products.length>0).sort((a,b)=>totalStock(a)-totalStock(b));
  const healthy=agents.filter(a=>totalStock(a)>=50);
  const [pdfLoading, setPdfLoading] = useState(false);
  const [pdfReady, setPdfReady]     = useState(false);

  // Load jsPDF + AutoTable from CDN once
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useState(()=>{
    if(window.jspdf) return;
    const s1 = document.createElement("script");
    s1.src = "https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js";
    s1.onload = () => {
      const s2 = document.createElement("script");
      s2.src = "https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.8.2/jspdf.plugin.autotable.min.js";
      s2.onload = () => setPdfReady(true);
      document.head.appendChild(s2);
    };
    document.head.appendChild(s1);
  });

  const generatePDF = () => {
    if(!window.jspdf) return alert("PDF library still loading, please try again in a moment.");
    setPdfLoading(true);
    try {
      const { jsPDF } = window.jspdf;
      const doc = new jsPDF({ orientation:"portrait", unit:"mm", format:"a4" });
      const pageW = doc.internal.pageSize.getWidth();
      const dateStr = new Date().toLocaleDateString("en-NG",{weekday:"long",day:"numeric",month:"long",year:"numeric"});
      const margin = 14;

      // ── COVER HEADER ──
      doc.setFillColor(15,17,32);
      doc.rect(0,0,pageW,38,"F");
      doc.setTextColor(99,102,241);
      doc.setFontSize(22);
      doc.setFont("helvetica","bold");
      doc.text("StockPulse NG", margin, 16);
      doc.setTextColor(200,200,210);
      doc.setFontSize(11);
      doc.setFont("helvetica","normal");
      doc.text("Thursday Stock Breakdown Report", margin, 24);
      doc.setTextColor(100,116,139);
      doc.setFontSize(9);
      doc.text("Generated: " + dateStr, margin, 31);
      doc.setTextColor(99,102,241);
      doc.text("DISPATCH DAY", pageW - margin, 31, {align:"right"});

      let y = 46;

      // ── SUMMARY BOXES ──
      const boxes = [
        {label:"Total Agents",  val:String(agents.length),         color:[99,102,241]},
        {label:"Critical (<20)",val:String(critical.length),       color:[239,68,68]},
        {label:"Low Stock",     val:String(low.length),            color:[245,158,11]},
        {label:"Healthy (50+)", val:String(healthy.length),        color:[16,185,129]},
      ];
      const bw = (pageW - margin*2 - 9) / 4;
      boxes.forEach((b,i)=>{
        const bx = margin + i*(bw+3);
        doc.setFillColor(20,24,40);
        doc.roundedRect(bx, y, bw, 18, 2, 2, "F");
        doc.setTextColor(...b.color);
        doc.setFontSize(16);
        doc.setFont("helvetica","bold");
        doc.text(b.val, bx+bw/2, y+10, {align:"center"});
        doc.setTextColor(100,116,139);
        doc.setFontSize(7);
        doc.setFont("helvetica","normal");
        doc.text(b.label, bx+bw/2, y+16, {align:"center"});
      });
      y += 26;

      // ── SECTION: FULL STOCK BREAKDOWN BY AGENT & PRODUCT ──
      doc.setFontSize(12);
      doc.setFont("helvetica","bold");
      doc.setTextColor(241,245,249);
      doc.setFillColor(15,17,32);
      doc.rect(0, y-4, pageW, 12, "F");
      doc.text("Complete Stock Breakdown — All Agents by State", margin, y+4);
      y += 14;

      // Build table: State | Agent | ...product cols... | Total | Rate | Alert
      const prodCols = products.map(p=>({header:p.name.length>14?p.sku:p.name, dataKey:p.id}));
      const head = [
        ["#","State","Agent Name",...products.map(p=>p.name.length>12?p.sku:p.name),"Total Stock","Rate","Status"]
      ];
      const rows = agents.map((a,i)=>{
        const r = deliveryRate(a);
        const stk = totalStock(a);
        const status = stk<20?"CRITICAL":stk<50?"LOW":"OK";
        return [
          String(i+1).padStart(2,"0"),
          a.state,
          a.agentName,
          ...products.map(p=>{
            const ap=a.products.find(x=>x.id===p.id);
            return ap?String(ap.currentStock):"0";
          }),
          String(stk),
          r+"%",
          status,
        ];
      });

      // Sort: critical first, then low, then healthy
      rows.sort((ra,rb)=>{
        const order={CRITICAL:0,LOW:1,OK:2};
        return order[ra[ra.length-1]] - order[rb[rb.length-1]];
      });

      doc.autoTable({
        head,
        body: rows,
        startY: y,
        margin: {left:margin, right:margin},
        styles:{
          fontSize:8,
          cellPadding:3,
          textColor:[200,205,215],
          fillColor:[13,17,32],
          lineColor:[21,28,46],
          lineWidth:0.3,
          font:"helvetica",
        },
        headStyles:{
          fillColor:[20,28,60],
          textColor:[148,163,184],
          fontStyle:"bold",
          fontSize:7.5,
          halign:"center",
        },
        columnStyles:{
          0:{halign:"center",cellWidth:8,textColor:[70,80,110]},
          1:{halign:"left",cellWidth:22,fontStyle:"bold",textColor:[241,245,249]},
          2:{halign:"left",cellWidth:28},
          [head[0].length-3]:{halign:"center",fontStyle:"bold",textColor:[241,245,249]},
          [head[0].length-2]:{halign:"center"},
          [head[0].length-1]:{halign:"center",fontStyle:"bold"},
        },
        alternateRowStyles:{fillColor:[10,12,20]},
        didParseCell(data){
          if(data.section==="body"){
            const lastCol = data.row.raw.length-1;
            if(data.column.index===lastCol){
              const v=data.cell.raw;
              if(v==="CRITICAL"){data.cell.styles.textColor=[239,68,68];data.cell.styles.fillColor=[60,10,10];}
              else if(v==="LOW"){data.cell.styles.textColor=[245,158,11];data.cell.styles.fillColor=[50,35,5];}
              else{data.cell.styles.textColor=[16,185,129];}
            }
            // Highlight low stock product cells
            if(data.column.index>=3 && data.column.index<lastCol-1){
              const v=parseInt(data.cell.raw);
              if(!isNaN(v)){
                if(v<5) data.cell.styles.textColor=[239,68,68];
                else if(v<15) data.cell.styles.textColor=[245,158,11];
                else data.cell.styles.textColor=[16,185,129];
              }
            }
          }
        },
      });

      y = doc.lastAutoTable.finalY + 14;

      // ── NEW PAGE: PER-PRODUCT BREAKDOWN ──
      doc.addPage();
      y = 20;
      doc.setFillColor(15,17,32);
      doc.rect(0,0,pageW,14,"F");
      doc.setTextColor(99,102,241);
      doc.setFontSize(13);
      doc.setFont("helvetica","bold");
      doc.text("Per-Product Stock Summary", margin, 10);

      y = 22;
      products.forEach((p,pi)=>{
        // Product header band
        doc.setFillColor(20,28,60);
        doc.rect(margin-2, y-3, pageW-margin*2+4, 10, "F");
        doc.setTextColor(148,163,184);
        doc.setFontSize(8);
        doc.setFont("helvetica","bold");
        doc.text("SKU: "+p.sku, margin, y+3);
        doc.setTextColor(241,245,249);
        doc.setFontSize(10);
        doc.text(p.name, margin+22, y+3);

        // Totals for this product
        const totalInit = agents.reduce((s,a)=>{const ap=a.products.find(x=>x.id===p.id);return s+(ap?.initialStock||0);},0);
        const totalDel  = agents.reduce((s,a)=>{const ap=a.products.find(x=>x.id===p.id);return s+(ap?.totalDelivered||0);},0);
        const totalLeft = agents.reduce((s,a)=>{const ap=a.products.find(x=>x.id===p.id);return s+(ap?.currentStock||0);},0);
        const pct = totalInit>0?Math.round((totalLeft/totalInit)*100):0;
        doc.setTextColor(100,116,139);
        doc.setFontSize(8);
        doc.text(`Initial: ${totalInit}  Delivered: ${totalDel}  Remaining: ${totalLeft}  (${pct}%)`, pageW-margin, y+3, {align:"right"});
        y += 12;

        // Agent rows for this product
        const agRows = agents
          .map(a=>{
            const ap=a.products.find(x=>x.id===p.id);
            const left=ap?.currentStock||0;
            const del=ap?.totalDelivered||0;
            const init=ap?.initialStock||0;
            const pctA=init>0?Math.round((left/init)*100):0;
            const status=left<5?"CRITICAL":left<15?"LOW":"OK";
            return [a.state, a.agentName, String(init), String(del), String(left), pctA+"%", status];
          })
          .sort((ra,rb)=>{
            const o={CRITICAL:0,LOW:1,OK:2};
            return o[ra[6]]-o[rb[6]];
          });

        doc.autoTable({
          head:[["State","Agent","Initial","Delivered","Remaining","%","Status"]],
          body: agRows,
          startY: y,
          margin:{left:margin,right:margin},
          styles:{fontSize:7.5,cellPadding:2.5,textColor:[180,185,200],fillColor:[10,12,20],lineColor:[21,28,46],lineWidth:0.2},
          headStyles:{fillColor:[15,20,40],textColor:[100,116,139],fontStyle:"bold",fontSize:7,halign:"center"},
          columnStyles:{
            0:{halign:"left",fontStyle:"bold",textColor:[241,245,249],cellWidth:24},
            1:{halign:"left",cellWidth:30},
            2:{halign:"center",cellWidth:16},
            3:{halign:"center",cellWidth:20,textColor:[16,185,129]},
            4:{halign:"center",cellWidth:20,fontStyle:"bold",textColor:[241,245,249]},
            5:{halign:"center",cellWidth:12},
            6:{halign:"center",cellWidth:18,fontStyle:"bold"},
          },
          alternateRowStyles:{fillColor:[13,17,32]},
          didParseCell(data){
            if(data.section==="body"){
              if(data.column.index===6){
                const v=data.cell.raw;
                if(v==="CRITICAL"){data.cell.styles.textColor=[239,68,68];data.cell.styles.fillColor=[50,10,10];}
                else if(v==="LOW"){data.cell.styles.textColor=[245,158,11];data.cell.styles.fillColor=[45,30,5];}
                else{data.cell.styles.textColor=[16,185,129];}
              }
              if(data.column.index===4){
                const v=parseInt(data.cell.raw);
                if(!isNaN(v)){
                  if(v<5)data.cell.styles.textColor=[239,68,68];
                  else if(v<15)data.cell.styles.textColor=[245,158,11];
                  else data.cell.styles.textColor=[16,185,129];
                }
              }
            }
          },
        });

        y = doc.lastAutoTable.finalY + 10;
        // Add new page if not last product and running low on space
        if(pi < products.length-1 && y > 230){
          doc.addPage();
          y = 20;
        }
      });

      // ── FOOTER on each page ──
      const pageCount = doc.internal.getNumberOfPages();
      for(let i=1;i<=pageCount;i++){
        doc.setPage(i);
        doc.setFontSize(7);
        doc.setTextColor(40,50,70);
        doc.setDrawColor(21,28,46);
        doc.line(margin, 287, pageW-margin, 287);
        doc.text("StockPulse NG — Confidential Stock Report — "+dateStr, margin, 291);
        doc.text("Page "+i+" of "+pageCount, pageW-margin, 291, {align:"right"});
      }

      // ── SAVE ──
      const filename = "StockPulse_Thursday_"+new Date().toISOString().slice(0,10)+".pdf";
      doc.save(filename);
    } catch(e){
      console.error(e);
      alert("Error generating PDF: "+e.message);
    }
    setPdfLoading(false);
  };

  if(agents.length===0) return <div><PageHeader title="Wednesday Alert" sub=""/><EmptyState icon="⚑" title="No agents set up" sub="Add agents first."/></div>;

  const AgTable=({list,title,col})=>(
    <div className="sp-card" style={{background:"#0d1120",borderRadius:14,border:"1px solid #151c2e",padding:20,marginBottom:16}}>
      <div style={{fontSize:15,fontWeight:800,color:col,marginBottom:14}}>{title}</div>
      <div style={{overflowX:"auto"}}>
        <table style={{width:"100%",borderCollapse:"collapse"}}>
          <thead><tr style={{background:"#07090f"}}>{["Agent","State","Rate","Stock Left","Suggest Thursday"].map(h=><TH key={h}>{h}</TH>)}</tr></thead>
          <tbody>
            {list.map(a=>{
              const r=deliveryRate(a);
              const sug=suggestQty(a,products).reduce((s,p)=>s+p.suggested,0);
              return(
                <tr key={a.id} className="rhov">
                  <TD><b style={{color:"#f1f5f9"}}>{a.agentName}</b></TD>
                  <TD>{a.state}</TD>
                  <TD><Badge rate={r}/></TD>
                  <TD style={{fontWeight:800,color:col}}>{totalStock(a)}</TD>
                  <TD style={{color:"#818cf8",fontWeight:700,fontFamily:"'JetBrains Mono',monospace"}}>{sug} units</TD>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );

  return (
    <div>
      <PageHeader title="Wednesday Stock Alert" sub="Prepare for Thursday dispatch"
        right={<div style={{background:"#f59e0b12",border:"1px solid #f59e0b30",color:"#f59e0b",padding:"6px 14px",borderRadius:20,fontSize:12,fontWeight:700}}>🚚 DISPATCH TOMORROW</div>}
      />

      {/* PDF DOWNLOAD CARD */}
      <div className="sp-card" style={{background:"linear-gradient(135deg,#0d1528,#111a35)",borderRadius:14,border:"1px solid #6366f130",padding:20,marginBottom:20}}>
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",flexWrap:"wrap",gap:12}}>
          <div>
            <div style={{fontSize:15,fontWeight:800,color:"#f1f5f9",marginBottom:4}}>📄 Thursday Stock Breakdown PDF</div>
            <div style={{fontSize:12,color:"#64748b",lineHeight:1.6}}>
              Full stock report — every agent, every product, remaining units, delivery rate and restock suggestion.<br/>
              <span style={{color:"#818cf8"}}>Download this every Thursday before dispatching stock.</span>
            </div>
          </div>
          <button
            onClick={generatePDF}
            disabled={pdfLoading || agents.length===0 || products.length===0}
            style={{
              padding:"12px 24px",borderRadius:10,border:"none",cursor:"pointer",
              fontSize:14,fontWeight:800,
              background:pdfLoading?"#1a2238":"linear-gradient(135deg,#6366f1,#8b5cf6)",
              color:pdfLoading?"#475569":"#fff",
              display:"flex",alignItems:"center",gap:8,
              flexShrink:0, whiteSpace:"nowrap",
              opacity: agents.length===0||products.length===0 ? 0.5 : 1,
            }}
          >
            {pdfLoading ? "⏳ Generating…" : "⬇ Download PDF Report"}
          </button>
        </div>

        {(agents.length===0||products.length===0) && (
          <div style={{marginTop:12,fontSize:12,color:"#ef4444"}}>⚠️ Add agents and products first before generating the PDF.</div>
        )}

        {/* Quick preview stats */}
        <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(120px,1fr))",gap:10,marginTop:16,paddingTop:14,borderTop:"1px solid #1a2238"}}>
          {[
            {label:"Total Agents",  val:agents.length,          color:"#818cf8"},
            {label:"Critical",      val:critical.length,         color:"#ef4444"},
            {label:"Low Stock",     val:low.length,              color:"#f59e0b"},
            {label:"Healthy",       val:healthy.length,          color:"#10b981"},
            {label:"Products",      val:products.length,         color:"#6366f1"},
            {label:"Total Stock",   val:agents.reduce((s,a)=>s+totalStock(a),0), color:"#94a3b8"},
          ].map(s=>(
            <div key={s.label} style={{textAlign:"center"}}>
              <div style={{fontSize:20,fontWeight:900,color:s.color}}>{s.val}</div>
              <div style={{fontSize:10,color:"#475569",marginTop:2}}>{s.label}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="stat-grid-4" style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:14,marginBottom:22}}>
        <StatCard label="Critical (<20)"  value={critical.length} accent="#ef4444" icon="🚨"/>
        <StatCard label="Low (20–49)"     value={low.length}      accent="#f59e0b" icon="⚠️"/>
        <StatCard label="Healthy (50+)"   value={healthy.length}  accent="#10b981" icon="✅"/>
      </div>

      {critical.length>0&&<AgTable list={critical} title="🚨 Critical — Must Send Thursday" col="#ef4444"/>}
      {low.length>0&&<AgTable list={low} title="⚠️ Low — Recommended to Send Thursday" col="#f59e0b"/>}
      {critical.length===0&&low.length===0&&(
        <div style={{background:"#10b98112",border:"1px solid #10b98130",borderRadius:10,padding:"14px 16px",marginBottom:12,color:"#10b981",fontSize:13}}>
          ✅ All agents have healthy stock levels. No urgent dispatch needed.
        </div>
      )}

      {(critical.length>0||low.length>0)&&(
        <div className="sp-card" style={{background:"#0d1120",borderRadius:14,border:"1px solid #151c2e",padding:20}}>
          <div style={{fontSize:15,fontWeight:800,color:"#f1f5f9",marginBottom:4}}>📦 Thursday Product Totals to Prepare</div>
          <div style={{fontSize:12,color:"#475569",marginBottom:16}}>Combined quantities for all critical + low stock agents</div>
          <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(150px,1fr))",gap:12}}>
            {products.map(p=>{
              const total=[...critical,...low].reduce((s,a)=>{const sug=suggestQty(a,products).find(x=>x.id===p.id);return s+(sug?.suggested||0);},0);
              return(
                <div key={p.id} style={{background:"#07090f",borderRadius:12,padding:16,border:"1px solid #151c2e"}}>
                  <div style={{fontFamily:"'JetBrains Mono',monospace",fontSize:10,color:"#6366f1",marginBottom:3}}>{p.sku}</div>
                  <div style={{fontSize:13,fontWeight:700,color:"#f1f5f9",marginBottom:10}}>{p.name}</div>
                  <div style={{fontSize:26,fontWeight:900,color:"#f59e0b"}}>{total}</div>
                  <div style={{fontSize:11,color:"#475569"}}>units to dispatch</div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}


function WeeklyReport({agents,products,totals}) {
  const ranked=[...agents].sort((a,b)=>deliveryRate(b)-deliveryRate(a));
  const totalStockDel=agents.reduce((s,a)=>s+a.products.reduce((ps,p)=>ps+p.totalDelivered,0),0);

  if(agents.length===0) return <div><PageHeader title="Weekly Report" sub=""/><EmptyState icon="▤" title="No data yet" sub="Log daily entries to populate the report."/></div>;

  return (
    <div>
      <PageHeader title="Weekly Report" sub="Full performance — generated every Sunday"
        right={<div style={{background:todayDay==="Sun"?"#6366f125":"#151c2e",border:"1px solid #6366f130",color:todayDay==="Sun"?"#818cf8":"#334155",padding:"6px 14px",borderRadius:20,fontSize:12,fontWeight:700}}>{todayDay==="Sun"?"📊 REPORT DAY":"Due: Sunday"}</div>}
      />
      <div className="stat-grid-4" style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:12,marginBottom:18}}>
        <StatCard label="Orders Assigned"  value={totals.assigned.toLocaleString()}  accent="#6366f1" icon="📋"/>
        <StatCard label="Orders Delivered" value={totals.delivered.toLocaleString()} accent="#10b981" icon="✅"/>
        <StatCard label="Overall Rate"     value={`${totals.rate}%`}                 accent={rc(totals.rate)} icon="📈"/>
        <StatCard label="Stock Delivered"  value={totalStockDel.toLocaleString()}    accent="#f59e0b" icon="📦"/>
      </div>
      {ranked.length>0&&(
        <div className="grid-2col" style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:14,marginBottom:22}}>
          <InfoBox type="good">🏆 <b>Best:</b> {ranked[0].agentName} ({ranked[0].state}) — {deliveryRate(ranked[0])}% · Increase Thursday allocation.</InfoBox>
          <InfoBox type="danger">⚠️ <b>Lowest:</b> {ranked[ranked.length-1].agentName} ({ranked[ranked.length-1].state}) — {deliveryRate(ranked[ranked.length-1])}% · Reduce allocation.</InfoBox>
          <InfoBox type={totals.rate>=80?"good":totals.rate>=60?"warn":"danger"}>📊 <b>Overall:</b> {totals.rate}% — {totals.rate>=80?"Strong week.":totals.rate>=60?"Moderate — review underperformers.":"Below target — urgent review needed."}</InfoBox>
          <InfoBox type={totals.critical.length===0?"good":"warn"}>📦 <b>Stock:</b> {totals.critical.length===0?"All agents well stocked.":totals.critical.length + " agents critically low — dispatch Thursday."}</InfoBox>
        </div>
      )}
      <Card style={{marginBottom:20}}>
        <div style={{fontSize:15,fontWeight:800,color:"#f1f5f9",marginBottom:16}}>🏆 Full Agent Ranking</div>
        <div style={{overflowX:"auto"}}>
          <table style={{width:"100%",borderCollapse:"collapse"}}>
            <thead><tr style={{background:"#07090f"}}>{["Rank","State","Agent","Assigned","Delivered","Rate","Stock Del.","Stock Left","Next Week Qty","Status"].map(h=><TH key={h}>{h}</TH>)}</tr></thead>
            <tbody>
              {ranked.map((a,i)=>{
                const r=deliveryRate(a);
                const sDel=a.products.reduce((s,p)=>s+p.totalDelivered,0);
                const sLeft=totalStock(a);
                const sug=suggestQty(a,products).reduce((s,p)=>s+p.suggested,0);
                return(
                  <tr key={a.id} className="rhov" style={{background:i<3?"#6366f108":"transparent"}}>
                    <TD><span style={{fontFamily:"'JetBrains Mono',monospace",color:"#6366f1",fontWeight:800}}>{i===0?"🥇":i===1?"🥈":i===2?"🥉":`#${i+1}`}</span></TD>
                    <TD><b style={{color:"#f1f5f9"}}>{a.state}</b></TD>
                    <TD>{a.agentName}</TD>
                    <TD>{a.totalOrdersAssigned}</TD>
                    <TD style={{color:"#10b981",fontWeight:700}}>{a.totalOrdersDelivered}</TD>
                    <TD><RateBar rate={r} width={50}/></TD>
                    <TD style={{color:"#f59e0b",fontWeight:600}}>{sDel}</TD>
                    <TD style={{color:sLeft<20?"#ef4444":sLeft<50?"#f59e0b":"#64748b",fontWeight:600}}>{sLeft}</TD>
                    <TD style={{color:"#818cf8",fontWeight:700,fontFamily:"'JetBrains Mono',monospace"}}>{sug}</TD>
                    <TD><Badge rate={r}/></TD>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>
      <Card>
        <div style={{fontSize:15,fontWeight:800,color:"#f1f5f9",marginBottom:16}}>📦 Stock Delivered — By Product</div>
        <div className="grid-3col" style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(150px,1fr))",gap:10}}>
          {products.map(p=>{
            const del=agents.reduce((s,a)=>{const ap=a.products.find(x=>x.id===p.id);return s+(ap?.totalDelivered||0);},0);
            const left=agents.reduce((s,a)=>{const ap=a.products.find(x=>x.id===p.id);return s+(ap?.currentStock||0);},0);
            return(
              <div key={p.id} style={{background:"#07090f",borderRadius:12,padding:16,border:"1px solid #151c2e"}}>
                <div style={{fontFamily:"'JetBrains Mono',monospace",fontSize:10,color:"#6366f1",marginBottom:3}}>{p.sku}</div>
                <div style={{fontSize:13,fontWeight:700,color:"#f1f5f9",marginBottom:12}}>{p.name}</div>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-end"}}>
                  <div><div style={{fontSize:24,fontWeight:900,color:"#10b981"}}>{del}</div><div style={{fontSize:11,color:"#475569"}}>Delivered</div></div>
                  <div style={{textAlign:"right"}}><div style={{fontSize:24,fontWeight:900,color:"#f59e0b"}}>{left}</div><div style={{fontSize:11,color:"#475569"}}>Remaining</div></div>
                </div>
              </div>
            );
          })}
        </div>
      </Card>
    </div>
  );
}

/* ══ STAFF: ENTRY ═══════════════════════════════════════════ */
function StaffEntry({myAgents,products,submitEntry}) {
  const [agentId,setAgentId]=useState("");
  const [oA,setOA]=useState(""); const [oD,setOD]=useState("");
  const [pQ,setPQ]=useState({});
  const [done,setDone]=useState(false);
  const agent=myAgents.find(a=>a.id===agentId);
  const rate=oA&&oD?Math.round((parseInt(oD)||0)/Math.max(parseInt(oA)||1,1)*100):null;

  const submit=()=>{
    if(!agent||!oA||!oD) return;
    submitEntry({agentId:agent.id,agentName:agent.agentName,state:agent.state,oA:parseInt(oA)||0,oD:parseInt(oD)||0,pQ,date:todayISO,day:todayDay});
    setDone(true);setAgentId("");setOA("");setOD("");setPQ({});
    setTimeout(()=>setDone(false),4000);
  };

  if(myAgents.length===0) return <div><PageHeader title="Log Delivery" sub=""/><EmptyState icon="✎" title="No agents assigned" sub="Contact your admin to get agents assigned to your account."/></div>;

  return (
    <div>
      <PageHeader title="Log Delivery" sub="Enter yesterday's delivery activity — submitted to admin for approval"/>
      {done&&<InfoBox type="good">✅ Submitted! Awaiting admin approval.</InfoBox>}
      <div className="grid-2col" style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:20}}>
        <Card>
          <div style={{fontSize:15,fontWeight:800,color:"#f1f5f9",marginBottom:18}}>📝 Yesterday's Activity</div>
          <div style={{marginBottom:14}}>
            <Sel label="Select Agent" value={agentId} onChange={e=>setAgentId(e.target.value)}>
              <option value="">— Choose your agent —</option>
              {myAgents.map(a=><option key={a.id} value={a.id}>{a.agentName} · {a.state}</option>)}
            </Sel>
          </div>
          {agent&&<>
            <div style={{background:"#6366f110",border:"1px solid #6366f120",borderRadius:8,padding:"8px 12px",marginBottom:14,fontSize:12,color:"#818cf8"}}>
              📍 {agent.state} · Current stock: <b>{totalStock(agent)} units</b>
            </div>
            <div className="form-2col" style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,marginBottom:14}}>
              <Inp label="Orders Assigned Yesterday" type="number" min="0" value={oA} onChange={e=>setOA(e.target.value)} placeholder="e.g. 45"/>
              <Inp label="Orders Delivered Yesterday" type="number" min="0" value={oD} onChange={e=>setOD(e.target.value)} placeholder="e.g. 38"/>
            </div>
            {rate!==null&&(
              <div style={{background:"#07090f",border:"1px solid #1a2238",borderRadius:8,padding:"10px 14px",marginBottom:14,display:"flex",alignItems:"center",gap:12}}>
                <span style={{fontSize:12,color:"#64748b"}}>This entry rate:</span>
                <span style={{fontSize:22,fontWeight:900,color:rc(rate)}}>{rate}%</span>
                <Badge rate={rate}/>
              </div>
            )}
            <div style={{marginBottom:18}}>
              <div style={{fontSize:12,color:"#64748b",fontWeight:700,marginBottom:10,textTransform:"uppercase",letterSpacing:.5}}>Units Delivered Per Product</div>
              <div className="grid-2col" style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
                {agent.products.map(p=>(
                  <div key={p.id} style={{background:"#07090f",border:"1px solid #1a2238",borderRadius:8,padding:12}}>
                    <div style={{fontSize:13,fontWeight:700,color:"#f1f5f9",marginBottom:2}}>{p.name}</div>
                    <div style={{fontSize:11,color:"#334155",fontFamily:"'JetBrains Mono',monospace",marginBottom:7}}>{p.sku} · left: <b style={{color:"#f59e0b"}}>{p.currentStock}</b></div>
                    <input type="number" min="0" value={pQ[p.id]||""} onChange={e=>setPQ(v=>({...v,[p.id]:e.target.value}))}
                      style={{width:"100%",background:"#0a0c14",border:"1px solid #1a2238",borderRadius:6,color:"#f1f5f9",padding:"10px 10px",fontSize:14,outline:"none"}} placeholder="0"/>
                  </div>
                ))}
              </div>
            </div>
            <Btn onClick={submit} style={{width:"100%"}}>Submit for Approval →</Btn>
            <div style={{fontSize:12,color:"#334155",marginTop:10,textAlign:"center"}}>Your entry will be reviewed by admin before updating stock.</div>
          </>}
          {!agent&&<div style={{textAlign:"center",padding:"30px 0",color:"#1e2d40",fontSize:13}}>Select an agent above to begin</div>}
        </Card>
        <Card>
          <div style={{fontSize:15,fontWeight:800,color:"#f1f5f9",marginBottom:16}}>📦 Your Agents' Stock</div>
          {myAgents.map(a=>(
            <div key={a.id} style={{background:"#07090f",borderRadius:10,padding:14,marginBottom:10,border:"1px solid #151c2e"}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
                <div>
                  <div style={{fontWeight:700,fontSize:14,color:"#f1f5f9"}}>{a.agentName}</div>
                  <div style={{fontSize:12,color:"#475569"}}>{a.state}</div>
                </div>
                <div style={{textAlign:"right"}}>
                  <div style={{fontSize:18,fontWeight:900,color:totalStock(a)<20?"#ef4444":totalStock(a)<50?"#f59e0b":"#10b981"}}>{totalStock(a)}</div>
                  <div style={{fontSize:11,color:"#475569"}}>units left</div>
                </div>
              </div>
              <RateBar rate={deliveryRate(a)} width={120}/>
            </div>
          ))}
        </Card>
      </div>
    </div>
  );
}

/* ══ STAFF: MY SUBMISSIONS ══════════════════════════════════ */
function MySubmissions({pendingEntries,agents}) {
  const sorted=[...pendingEntries].sort((a,b)=>new Date(b.submittedAt)-new Date(a.submittedAt));
  return (
    <div>
      <PageHeader title="My Submissions" sub="Track the status of your daily entries"/>
      {sorted.length===0&&<EmptyState icon="◎" title="No submissions yet" sub="Submit your first daily entry."/>}
      <div style={{display:"flex",flexDirection:"column",gap:10}}>
        {sorted.map(e=>{
          const ag=agents.find(a=>a.id===e.agentId);
          const rate=e.oA>0?Math.round((e.oD/e.oA)*100):0;
          return(
            <Card key={e.id} style={{border:`1px solid ${e.status==="pending"?"#f59e0b25":e.status==="approved"?"#10b98125":"#ef444425"}`}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                <div>
                  <div style={{fontSize:14,fontWeight:800,color:"#f1f5f9"}}>{ag?.agentName} · {ag?.state}</div>
                  <div style={{fontSize:12,color:"#475569",marginTop:2}}>{new Date(e.submittedAt).toLocaleString("en-NG")}</div>
                  <div style={{fontSize:12,color:"#64748b",marginTop:4}}>Assigned: <b style={{color:"#f1f5f9"}}>{e.oA}</b> · Delivered: <b style={{color:"#10b981"}}>{e.oD}</b> · Rate: <b style={{color:rc(rate)}}>{rate}%</b></div>
                </div>
                <span style={{fontSize:12,fontWeight:700,padding:"4px 12px",borderRadius:20,
                  background:e.status==="pending"?"#f59e0b18":e.status==="approved"?"#10b98118":"#ef444418",
                  color:e.status==="pending"?"#f59e0b":e.status==="approved"?"#10b981":"#ef4444",
                  border:`1px solid ${e.status==="pending"?"#f59e0b30":e.status==="approved"?"#10b98130":"#ef444430"}`}}>
                  {e.status==="pending"?"⏳ Pending":e.status==="approved"?"✅ Approved":"❌ Rejected"}
                </span>
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

/* ══ STAFF: MY STOCK VIEW ═══════════════════════════════════ */
function MyStockView({myAgents,products}) {
  if(myAgents.length===0) return <div><PageHeader title="My Stock View" sub=""/><EmptyState icon="▦" title="No agents assigned" sub="Contact your admin."/></div>;
  return (
    <div>
      <PageHeader title="My Stock View" sub="Current stock for your assigned agents"/>
      {myAgents.map(a=>(
        <Card key={a.id} style={{marginBottom:16}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
            <div>
              <div style={{fontSize:16,fontWeight:800,color:"#f1f5f9"}}>{a.agentName}</div>
              <div style={{fontSize:13,color:"#475569"}}>{a.state}{a.phone?` · ${a.phone}`:""}</div>
            </div>
            <div style={{textAlign:"right"}}>
              <div style={{fontSize:22,fontWeight:900,color:totalStock(a)<20?"#ef4444":totalStock(a)<50?"#f59e0b":"#10b981"}}>{totalStock(a)} units</div>
              <RateBar rate={deliveryRate(a)} width={100}/>
            </div>
          </div>
          <div className="grid-3col" style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(140px,1fr))",gap:8}}>
            {a.products.map(p=>(
              <div key={p.id} style={{background:"#07090f",borderRadius:9,padding:12,border:"1px solid #151c2e"}}>
                <div style={{fontSize:10,fontFamily:"'JetBrains Mono',monospace",color:"#6366f1"}}>{p.sku}</div>
                <div style={{fontSize:12,fontWeight:700,color:"#f1f5f9",margin:"4px 0 8px"}}>{p.name}</div>
                <div style={{display:"flex",justifyContent:"space-between",fontSize:12}}>
                  <span style={{color:"#475569"}}>Del: <b style={{color:"#10b981"}}>{p.totalDelivered}</b></span>
                  <span style={{color:"#475569"}}>Left: <b style={{color:p.currentStock<5?"#ef4444":p.currentStock<15?"#f59e0b":"#f1f5f9"}}>{p.currentStock}</b></span>
                </div>
              </div>
            ))}
          </div>
        </Card>
      ))}
    </div>
  );
}

/* ══ ADMIN: PASSWORD MANAGER ═══════════════════════════════ */
function PasswordManager({staff, session, updateStaff}) {
  const [selectedId, setSelectedId] = useState("");
  const [newPass,    setNewPass]    = useState("");
  const [confirm,    setConfirm]    = useState("");
  const [msg,        setMsg]        = useState(null);
  const flash = (text,type="good") => { setMsg({text,type}); setTimeout(()=>setMsg(null),3500); };

  // Admin change own password
  const [adminOld,  setAdminOld]  = useState("");
  const [adminNew,  setAdminNew]  = useState("");
  const [adminConf, setAdminConf] = useState("");

  const changeStaffPass = () => {
    if(!selectedId)          return flash("Select a staff member","warn");
    if(!newPass.trim())      return flash("Enter a new password","warn");
    if(newPass.length < 6)   return flash("Password must be at least 6 characters","warn");
    if(newPass !== confirm)  return flash("Passwords do not match","warn");
    updateStaff(selectedId, s => ({...s, password: newPass.trim()}));
    setSelectedId(""); setNewPass(""); setConfirm("");
    flash("Password updated successfully!");
  };

  const changeAdminPass = () => {
    const adminStaff = staff.find(s => s.id === session.id);
    if(!adminStaff) return;
    if(adminOld !== adminStaff.password) return flash("Current password is incorrect","warn");
    if(!adminNew.trim())                 return flash("Enter a new password","warn");
    if(adminNew.length < 6)             return flash("Password must be at least 6 characters","warn");
    if(adminNew !== adminConf)          return flash("New passwords do not match","warn");
    updateStaff(session.id, s => ({...s, password: adminNew.trim()}));
    setAdminOld(""); setAdminNew(""); setAdminConf("");
    flash("Your admin password has been updated!");
  };

  const nonAdminStaff = staff.filter(s => s.role !== "admin");

  return (
    <div>
      <PageHeader title="Password Management" sub="Reset staff passwords or update your own admin password"/>
      {msg && <InfoBox type={msg.type}>{msg.text}</InfoBox>}

      <div className="grid-2col" style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:20,alignItems:"start"}}>

        {/* RESET STAFF PASSWORD */}
        <Card>
          <div style={{fontSize:15,fontWeight:800,color:"#f1f5f9",marginBottom:6}}>🔑 Reset a Staff Password</div>
          <div style={{fontSize:12,color:"#64748b",marginBottom:18}}>Use this when a staff member forgets their password.</div>

          {nonAdminStaff.length === 0
            ? <div style={{textAlign:"center",padding:"30px 0",color:"#334155",fontSize:13}}>No staff registered yet.<br/>Add staff in the Staff tab first.</div>
            : <>
              <div style={{display:"flex",flexDirection:"column",gap:12,marginBottom:20}}>
                <Sel label="Select Staff Member" value={selectedId} onChange={e=>setSelectedId(e.target.value)}>
                  <option value="">— Choose staff member —</option>
                  {nonAdminStaff.map(s=>(
                    <option key={s.id} value={s.id}>{s.name} (@{s.username})</option>
                  ))}
                </Sel>
                <Inp label="New Password" type="password" value={newPass} onChange={e=>setNewPass(e.target.value)} placeholder="Enter new password (min 6 characters)"/>
                <Inp label="Confirm New Password" type="password" value={confirm} onChange={e=>setConfirm(e.target.value)} placeholder="Re-enter new password"/>
              </div>

              {/* Password strength indicator */}
              {newPass.length > 0 && (
                <div style={{marginBottom:16}}>
                  <div style={{fontSize:11,color:"#64748b",marginBottom:6}}>Password strength:</div>
                  <div style={{height:6,background:"#1a2238",borderRadius:3,overflow:"hidden"}}>
                    <div style={{
                      height:"100%",borderRadius:3,transition:"width .3s",
                      width: newPass.length<6?"20%":newPass.length<8?"50%":newPass.length<12?"75%":"100%",
                      background: newPass.length<6?"#ef4444":newPass.length<8?"#f59e0b":newPass.length<12?"#6366f1":"#10b981",
                    }}/>
                  </div>
                  <div style={{fontSize:11,color:newPass.length<6?"#ef4444":newPass.length<8?"#f59e0b":newPass.length<12?"#818cf8":"#10b981",marginTop:4}}>
                    {newPass.length<6?"Too short":newPass.length<8?"Weak":newPass.length<12?"Good":"Strong"}
                  </div>
                </div>
              )}

              {newPass && confirm && newPass !== confirm && (
                <div style={{fontSize:12,color:"#ef4444",marginBottom:12}}>⚠️ Passwords do not match</div>
              )}
              {newPass && confirm && newPass === confirm && (
                <div style={{fontSize:12,color:"#10b981",marginBottom:12}}>✅ Passwords match</div>
              )}

              <Btn onClick={changeStaffPass} style={{width:"100%"}}>Reset Password →</Btn>
            </>
          }
        </Card>

        {/* CHANGE ADMIN OWN PASSWORD */}
        <Card>
          <div style={{fontSize:15,fontWeight:800,color:"#f1f5f9",marginBottom:6}}>🛡️ Change Your Admin Password</div>
          <div style={{fontSize:12,color:"#64748b",marginBottom:18}}>Update your own login password. You will need to use the new password on your next login.</div>

          <div style={{display:"flex",flexDirection:"column",gap:12,marginBottom:20}}>
            <Inp label="Current Password" type="password" value={adminOld} onChange={e=>setAdminOld(e.target.value)} placeholder="Enter your current password"/>
            <Inp label="New Password" type="password" value={adminNew} onChange={e=>setAdminNew(e.target.value)} placeholder="Enter new password (min 6 characters)"/>
            <Inp label="Confirm New Password" type="password" value={adminConf} onChange={e=>setAdminConf(e.target.value)} placeholder="Re-enter new password"/>
          </div>

          {adminNew.length > 0 && (
            <div style={{marginBottom:16}}>
              <div style={{fontSize:11,color:"#64748b",marginBottom:6}}>Password strength:</div>
              <div style={{height:6,background:"#1a2238",borderRadius:3,overflow:"hidden"}}>
                <div style={{
                  height:"100%",borderRadius:3,transition:"width .3s",
                  width: adminNew.length<6?"20%":adminNew.length<8?"50%":adminNew.length<12?"75%":"100%",
                  background: adminNew.length<6?"#ef4444":adminNew.length<8?"#f59e0b":adminNew.length<12?"#6366f1":"#10b981",
                }}/>
              </div>
            </div>
          )}

          {adminNew && adminConf && adminNew !== adminConf && (
            <div style={{fontSize:12,color:"#ef4444",marginBottom:12}}>⚠️ Passwords do not match</div>
          )}
          {adminNew && adminConf && adminNew === adminConf && (
            <div style={{fontSize:12,color:"#10b981",marginBottom:12}}>✅ Passwords match</div>
          )}

          <Btn onClick={changeAdminPass} style={{width:"100%"}}>Update My Password →</Btn>

          <div style={{marginTop:14,background:"#f59e0b10",border:"1px solid #f59e0b25",borderRadius:8,padding:"10px 12px",fontSize:12,color:"#f59e0b"}}>
            ⚠️ Make sure to remember your new password. There is no password recovery option.
          </div>
        </Card>
      </div>

      {/* STAFF PASSWORD TABLE */}
      {nonAdminStaff.length > 0 && (
        <Card style={{marginTop:20}}>
          <div style={{fontSize:15,fontWeight:800,color:"#f1f5f9",marginBottom:16}}>👥 All Staff Accounts</div>
          <div style={{overflowX:"auto"}}>
            <table style={{width:"100%",borderCollapse:"collapse"}}>
              <thead>
                <tr style={{background:"#07090f"}}>
                  <TH>#</TH><TH>Name</TH><TH>Username</TH><TH>Role</TH><TH>Assigned Agents</TH><TH>Action</TH>
                </tr>
              </thead>
              <tbody>
                {nonAdminStaff.map((s,i)=>(
                  <tr key={s.id} className="rhov">
                    <TD><span style={{fontFamily:"'JetBrains Mono',monospace",color:"#334155",fontSize:11}}>{String(i+1).padStart(2,"0")}</span></TD>
                    <TD><b style={{color:"#f1f5f9"}}>{s.name}</b></TD>
                    <TD><span style={{fontFamily:"'JetBrains Mono',monospace",fontSize:12,color:"#6366f1"}}>@{s.username}</span></TD>
                    <TD><span style={{fontSize:11,background:"#6366f115",color:"#818cf8",padding:"2px 8px",borderRadius:20,border:"1px solid #6366f125",textTransform:"capitalize"}}>{s.role}</span></TD>
                    <TD><span style={{fontSize:12,color:"#64748b"}}>{s.assignedAgents?.length||0} agent{s.assignedAgents?.length!==1?"s":""}</span></TD>
                    <TD>
                      <Btn small variant="ghost" onClick={()=>{ setSelectedId(s.id); setNewPass(""); setConfirm(""); window.scrollTo({top:0,behavior:"smooth"}); }}>
                        Reset Password
                      </Btn>
                    </TD>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}

/* ══ STAFF: CHANGE OWN PASSWORD ═════════════════════════════ */
function ChangePassword({session, updateStaff, state}) {
  const [oldPass,  setOldPass]  = useState("");
  const [newPass,  setNewPass]  = useState("");
  const [confirm,  setConfirm]  = useState("");
  const [msg,      setMsg]      = useState(null);
  const flash = (text,type="good") => { setMsg({text,type}); setTimeout(()=>setMsg(null),3500); };

  const save = () => {
    const me = state.staff.find(s => s.id === session.id);
    if(!me)                         return flash("Session error. Please log out and back in.","warn");
    if(oldPass !== me.password)     return flash("Current password is incorrect","warn");
    if(!newPass.trim())             return flash("Enter a new password","warn");
    if(newPass.length < 6)         return flash("Password must be at least 6 characters","warn");
    if(newPass !== confirm)        return flash("New passwords do not match","warn");
    updateStaff(session.id, s => ({...s, password: newPass.trim()}));
    setOldPass(""); setNewPass(""); setConfirm("");
    flash("Your password has been changed successfully! Use the new password next time you log in.");
  };

  return (
    <div>
      <PageHeader title="Change Password" sub="Update your login password"/>
      {msg && <InfoBox type={msg.type}>{msg.text}</InfoBox>}

      <div style={{maxWidth:420}}>
        <Card>
          <div style={{fontSize:15,fontWeight:800,color:"#f1f5f9",marginBottom:6}}>🔑 Change Your Password</div>
          <div style={{fontSize:12,color:"#64748b",marginBottom:20}}>
            Logged in as <b style={{color:"#818cf8"}}>@{session.username}</b>
          </div>

          <div style={{display:"flex",flexDirection:"column",gap:14,marginBottom:20}}>
            <Inp label="Current Password" type="password" value={oldPass} onChange={e=>setOldPass(e.target.value)} placeholder="Enter your current password"/>
            <Inp label="New Password" type="password" value={newPass} onChange={e=>setNewPass(e.target.value)} placeholder="At least 6 characters"/>
            <Inp label="Confirm New Password" type="password" value={confirm} onChange={e=>setConfirm(e.target.value)} placeholder="Re-enter new password"/>
          </div>

          {/* Strength bar */}
          {newPass.length > 0 && (
            <div style={{marginBottom:14}}>
              <div style={{fontSize:11,color:"#64748b",marginBottom:5}}>Password strength:</div>
              <div style={{height:6,background:"#1a2238",borderRadius:3,overflow:"hidden"}}>
                <div style={{
                  height:"100%",borderRadius:3,transition:"width .3s",
                  width:newPass.length<6?"20%":newPass.length<8?"50%":newPass.length<12?"75%":"100%",
                  background:newPass.length<6?"#ef4444":newPass.length<8?"#f59e0b":newPass.length<12?"#6366f1":"#10b981",
                }}/>
              </div>
              <div style={{fontSize:11,marginTop:3,color:newPass.length<6?"#ef4444":newPass.length<8?"#f59e0b":"#10b981"}}>
                {newPass.length<6?"Too short — add more characters":newPass.length<8?"Weak":newPass.length<12?"Good":"Strong"}
              </div>
            </div>
          )}

          {newPass && confirm && (
            <div style={{fontSize:12,marginBottom:14,color:newPass===confirm?"#10b981":"#ef4444"}}>
              {newPass===confirm?"✅ Passwords match":"⚠️ Passwords do not match"}
            </div>
          )}

          <Btn onClick={save} style={{width:"100%"}}>Save New Password →</Btn>

          <div style={{marginTop:14,background:"#6366f110",border:"1px solid #6366f125",borderRadius:8,padding:"10px 12px",fontSize:12,color:"#818cf8"}}>
            💡 After changing your password, use the new one the next time you sign in.
          </div>
        </Card>
      </div>
    </div>
  );
}

/* ══ PRODUCTS OVERVIEW ══════════════════════════════════════ */
function ProductsOverview({ agents, products }) {
  const [selected, setSelected] = useState(null);

  if(products.length === 0) return (
    <div>
      <PageHeader title="Products Overview" sub="Real-time stock summary across all agents"/>
      <EmptyState icon="📦" title="No products yet" sub="Add products in Setup first."/>
    </div>
  );

  // Compute totals per product across all agents
  const productStats = products.map(p => {
    const agentsWithProduct = agents.filter(a => a.products.some(x => x.id === p.id));
    const totalInitial   = agentsWithProduct.reduce((s,a) => { const ap=a.products.find(x=>x.id===p.id); return s+(ap?.initialStock||0); }, 0);
    const totalDelivered = agentsWithProduct.reduce((s,a) => { const ap=a.products.find(x=>x.id===p.id); return s+(ap?.totalDelivered||0); }, 0);
    const totalRemaining = agentsWithProduct.reduce((s,a) => { const ap=a.products.find(x=>x.id===p.id); return s+(ap?.currentStock||0); }, 0);
    const pct = totalInitial > 0 ? Math.round((totalRemaining/totalInitial)*100) : 0;
    const agentBreakdown = agentsWithProduct.map(a => {
      const ap = a.products.find(x => x.id===p.id);
      return {
        agentId: a.id, agentName: a.agentName, state: a.state,
        initial: ap?.initialStock||0, delivered: ap?.totalDelivered||0,
        remaining: ap?.currentStock||0,
        rate: deliveryRate(a),
      };
    }).sort((a,b) => b.remaining - a.remaining);
    return { ...p, totalInitial, totalDelivered, totalRemaining, pct, agentBreakdown, agentsCount: agentsWithProduct.length };
  });

  return (
    <div>
      <PageHeader title="Products Overview"
        sub={`${products.length} products · real-time stock across all agents`}
        right={<div style={{background:"#10b98118",border:"1px solid #10b98130",color:"#10b981",padding:"6px 14px",borderRadius:20,fontSize:12,fontWeight:700}}>🔴 LIVE</div>}
      />

      {/* PRODUCT CARDS GRID */}
      <div className="stat-grid-4" style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:14,marginBottom:24}}>
        {productStats.map(p => (
          <div key={p.id}
            onClick={()=>setSelected(selected===p.id?null:p.id)}
            style={{background:"#0d1120",borderRadius:14,border:`2px solid ${selected===p.id?"#6366f1":"#151c2e"}`,padding:18,cursor:"pointer",transition:"border-color .2s,box-shadow .2s",boxShadow:selected===p.id?"0 0 0 3px #6366f120":"none"}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:10}}>
              <div>
                <div style={{fontSize:10,fontFamily:"'JetBrains Mono',monospace",color:"#6366f1",marginBottom:3}}>{p.sku}</div>
                <div style={{fontSize:13,fontWeight:800,color:"#f1f5f9",lineHeight:1.3}}>{p.name}</div>
              </div>
              <div style={{fontSize:11,color:"#475569",background:"#151c2e",padding:"2px 8px",borderRadius:20,whiteSpace:"nowrap"}}>{p.agentsCount} agents</div>
            </div>

            {/* Stock bar */}
            <div style={{height:6,background:"#1a2238",borderRadius:3,overflow:"hidden",marginBottom:8}}>
              <div style={{width:`${p.pct}%`,height:"100%",background:rc(p.pct),borderRadius:3,transition:"width .5s"}}/>
            </div>

            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:6,textAlign:"center"}}>
              <div>
                <div style={{fontSize:16,fontWeight:900,color:"#f1f5f9"}}>{p.totalInitial.toLocaleString()}</div>
                <div style={{fontSize:9,color:"#475569",textTransform:"uppercase",letterSpacing:.5}}>Initial</div>
              </div>
              <div>
                <div style={{fontSize:16,fontWeight:900,color:"#10b981"}}>{p.totalDelivered.toLocaleString()}</div>
                <div style={{fontSize:9,color:"#475569",textTransform:"uppercase",letterSpacing:.5}}>Delivered</div>
              </div>
              <div>
                <div style={{fontSize:16,fontWeight:900,color:rc(p.pct)}}>{p.totalRemaining.toLocaleString()}</div>
                <div style={{fontSize:9,color:"#475569",textTransform:"uppercase",letterSpacing:.5}}>Left</div>
              </div>
            </div>

            <div style={{marginTop:10,fontSize:11,fontWeight:700,color:rc(p.pct),textAlign:"center"}}>
              {p.pct}% remaining {selected===p.id?"▲":"▼"}
            </div>
          </div>
        ))}
      </div>

      {/* EXPANDED AGENT BREAKDOWN */}
      {selected && (() => {
        const p = productStats.find(x=>x.id===selected);
        if(!p) return null;
        return (
          <Card style={{border:"1px solid #6366f130"}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:20,flexWrap:"wrap",gap:12}}>
              <div>
                <div style={{fontSize:16,fontWeight:800,color:"#f1f5f9"}}>{p.name} — Agent Breakdown</div>
                <div style={{fontSize:12,color:"#64748b",marginTop:3}}>Stock status per agent · sorted by units remaining</div>
              </div>
              <div style={{display:"flex",gap:20}}>
                <div style={{textAlign:"center"}}>
                  <div style={{fontSize:20,fontWeight:900,color:"#f1f5f9"}}>{p.totalInitial.toLocaleString()}</div>
                  <div style={{fontSize:10,color:"#475569"}}>Total Initial</div>
                </div>
                <div style={{textAlign:"center"}}>
                  <div style={{fontSize:20,fontWeight:900,color:"#10b981"}}>{p.totalDelivered.toLocaleString()}</div>
                  <div style={{fontSize:10,color:"#475569"}}>Total Delivered</div>
                </div>
                <div style={{textAlign:"center"}}>
                  <div style={{fontSize:20,fontWeight:900,color:rc(p.pct)}}>{p.totalRemaining.toLocaleString()}</div>
                  <div style={{fontSize:10,color:"#475569"}}>Total Remaining</div>
                </div>
              </div>
            </div>

            <div style={{overflowX:"auto"}}>
              <table style={{width:"100%",borderCollapse:"collapse"}}>
                <thead>
                  <tr style={{background:"#07090f"}}>
                    <TH>#</TH><TH>Agent</TH><TH>State</TH><TH>Initial Stock</TH><TH>Delivered</TH><TH>Remaining</TH><TH>Used %</TH><TH>Delivery Rate</TH><TH>Status</TH>
                  </tr>
                </thead>
                <tbody>
                  {p.agentBreakdown.map((a,i) => {
                    const usedPct = a.initial > 0 ? Math.round(((a.initial-a.remaining)/a.initial)*100) : 0;
                    const status = a.remaining < 5 ? "Critical" : a.remaining < 15 ? "Low" : "OK";
                    const statusColor = a.remaining < 5 ? "#ef4444" : a.remaining < 15 ? "#f59e0b" : "#10b981";
                    return (
                      <tr key={a.agentId} className="rhov">
                        <TD><span style={{fontFamily:"'JetBrains Mono',monospace",color:"#334155",fontSize:11}}>{String(i+1).padStart(2,"0")}</span></TD>
                        <TD><b style={{color:"#f1f5f9"}}>{a.agentName}</b></TD>
                        <TD style={{color:"#64748b"}}>{a.state}</TD>
                        <TD style={{color:"#94a3b8"}}>{a.initial.toLocaleString()}</TD>
                        <TD style={{color:"#10b981",fontWeight:700}}>{a.delivered.toLocaleString()}</TD>
                        <TD style={{fontWeight:800,color:statusColor,fontSize:15}}>{a.remaining.toLocaleString()}</TD>
                        <TD>
                          <div style={{display:"flex",alignItems:"center",gap:8}}>
                            <div style={{width:60,height:6,background:"#1a2238",borderRadius:3,overflow:"hidden"}}>
                              <div style={{width:`${usedPct}%`,height:"100%",background:"#6366f1",borderRadius:3}}/>
                            </div>
                            <span style={{fontSize:12,color:"#818cf8",fontWeight:600}}>{usedPct}%</span>
                          </div>
                        </TD>
                        <TD><RateBar rate={a.rate} width={50}/></TD>
                        <TD>
                          <span style={{fontSize:11,fontWeight:700,padding:"3px 10px",borderRadius:20,
                            background:`${statusColor}18`,color:statusColor,border:`1px solid ${statusColor}30`}}>
                            {status}
                          </span>
                        </TD>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {p.agentBreakdown.length === 0 && (
              <div style={{textAlign:"center",padding:"30px",color:"#334155",fontSize:13}}>
                No agents have been assigned this product yet.
              </div>
            )}
          </Card>
        );
      })()}

      {/* FULL SUMMARY TABLE */}
      <Card style={{marginTop:20}}>
        <div style={{fontSize:15,fontWeight:800,color:"#f1f5f9",marginBottom:16}}>📊 Full Stock Summary — All Products</div>
        <div style={{overflowX:"auto"}}>
          <table style={{width:"100%",borderCollapse:"collapse"}}>
            <thead>
              <tr style={{background:"#07090f"}}>
                <TH>Product</TH><TH>SKU</TH><TH>Agents</TH><TH>Initial Stock</TH><TH>Total Delivered</TH><TH>Remaining</TH><TH>Stock Health</TH>
              </tr>
            </thead>
            <tbody>
              {productStats.map(p => (
                <tr key={p.id} className="rhov" style={{cursor:"pointer",background:selected===p.id?"#0d1528":"transparent"}} onClick={()=>setSelected(selected===p.id?null:p.id)}>
                  <TD><b style={{color:"#f1f5f9"}}>{p.name}</b></TD>
                  <TD><span style={{fontFamily:"'JetBrains Mono',monospace",fontSize:12,color:"#6366f1",background:"#6366f112",padding:"2px 8px",borderRadius:5}}>{p.sku}</span></TD>
                  <TD style={{color:"#64748b"}}>{p.agentsCount} agents</TD>
                  <TD>{p.totalInitial.toLocaleString()}</TD>
                  <TD style={{color:"#10b981",fontWeight:700}}>{p.totalDelivered.toLocaleString()}</TD>
                  <TD style={{fontWeight:800,color:rc(p.pct)}}>{p.totalRemaining.toLocaleString()}</TD>
                  <TD>
                    <div style={{display:"flex",alignItems:"center",gap:8}}>
                      <div style={{width:100,height:6,background:"#1a2238",borderRadius:3,overflow:"hidden"}}>
                        <div style={{width:`${p.pct}%`,height:"100%",background:rc(p.pct),borderRadius:3}}/>
                      </div>
                      <span style={{fontSize:12,fontWeight:700,color:rc(p.pct)}}>{p.pct}%</span>
                    </div>
                  </TD>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
