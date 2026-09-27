import{StrictMode,useEffect,useState}from"react";import{createRoot}from"react-dom/client";import"./styles.css";

type Health={service:string;apiVersion:string;status:string;resources:{d1:boolean;kv:boolean;r2:boolean}};

function App(){
 const install=window.location.pathname.startsWith("/install");
 const[health,setHealth]=useState<Health|null>(null);
 const[error,setError]=useState("");
 const[loading,setLoading]=useState(true);

 useEffect(()=>{fetch("/v1/health",{cache:"no-store"}).then(async r=>{if(!r.ok)throw new Error("Health check failed");const j=await r.json();setHealth(j.data)}).catch(e=>setError(e instanceof Error?e.message:"Health check failed")).finally(()=>setLoading(false))},[]);

 const ready=health?.status==="ok";
 return <div className="app">
  <header><a className="brand" href="/"><b>D</b><div><strong>DevOne</strong><span>License Server</span></div></a><span className="secure">● Cloudflare deployment</span></header>
  <main>
   <p className="eyebrow">DEVONE CMS 2.0 · PHASE 5</p>
   {install?<><h1>Install your license server.</h1><p className="lead">The deployment provisions the Cloudflare resources automatically. This page verifies that the Worker, D1, KV, and R2 bindings are ready before you begin live licensing tests.</p></>:<><h1>License infrastructure, ready to deploy.</h1><p className="lead">A standalone Cloudflare license authority for DevOne CMS 2.0. Deploy once, let Wrangler provision the backing resources, then use this installer to verify the service.</p></>}
   <div className="panel">
    <div className="panel-head"><div><span className="step">{install?"01":"00"}</span><div><h2>{install?"Deployment check":"Start installation"}</h2><p>{install?"Confirm every required Cloudflare binding is available.":"Deploy the Worker, then open the installer to continue."}</p></div></div><span className={ready?"pill ok":"pill"}>{loading?"CHECKING":ready?"READY":"CHECK FAILED"}</span></div>
    <div className="resources">
      {(["d1","kv","r2"] as const).map(key=><div className="resource" key={key}><span className={health?.resources[key]?"dot":"dot off"}/><div><b>{key==="d1"?"D1 Database":key==="kv"?"KV Namespace":"R2 Bucket"}</b><small>{health?.resources[key]?"Binding available":"Waiting for deployment"}</small></div></div>)}
    </div>
    {error&&<div className="error">{error}</div>}
    {install?<div className="actions"><button onClick={()=>location.reload()}>Run check again</button><a className="secondary" href="/">Back to overview</a></div>:<a className="primary" href="/install">Begin Installation <span>→</span></a>}
   </div>
   <div className="note"><b>Automatic provisioning</b><span>Wrangler creates missing D1, KV, and R2 resources during deployment. No resource IDs are committed to this repository.</span></div>
  </main>
  <footer>Developer One — Build. Manage. Evolve.</footer>
 </div>
}
createRoot(document.getElementById("root")!).render(<StrictMode><App/></StrictMode>);
