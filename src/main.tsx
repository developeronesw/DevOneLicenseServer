import { StrictMode, useEffect, useState } from "react";
import type React from "react";
import { createRoot } from "react-dom/client";
import "./styles.css";

type Status = { ready:boolean; resources:{d1:boolean;kv:boolean;r2:boolean}; signingKey:{configured:boolean;source:string}; administrator:{configured:boolean} };
type License = { licenseId:string; term:"annual"|"lifetime"; state:"active"|"revoked"; issuedAt:string; expiresAt:string; installationId:string|null; activatedAt:string|null; revokedAt:string|null };
type User = { username:string; email:string };

async function api(path:string, options:RequestInit={}) {
  const response = await fetch(path, { ...options, credentials:"same-origin", headers:{"content-type":"application/json", ...(options.headers||{})}, cache:"no-store" });
  const payload = await response.json().catch(()=>null);
  if (!response.ok || !payload?.ok) throw new Error(payload?.code || payload?.error || "Request failed.");
  return payload.data;
}

function Shell({children, eyebrow="DEVONE CMS 2.0 · PHASE 5"}:{children:React.ReactNode;eyebrow?:string}) {
  return <div className="app"><header><div className="brand"><b>D</b><div><strong>DevOne</strong><span>License Server</span></div></div><small>● Cloudflare deployment</small></header><main><p className="eyebrow">{eyebrow}</p>{children}</main><footer>Developer One — Build. Manage. Evolve.</footer></div>;
}

function Installer() {
  const [status,setStatus]=useState<Status|null>(null),[loading,setLoading]=useState(true),[error,setError]=useState("");
  async function check(){setLoading(true);setError("");try{setStatus(await api("/v1/install/status",{headers:{}}));}catch(e){setError(e instanceof Error?e.message:"Installation check failed.");}finally{setLoading(false);}}
  useEffect(()=>{void check();},[]);
  const ready=!!status?.ready;
  return <Shell><h1>Your license server is ready.</h1><p className="lead">Deploy once, then use this installer to verify the Cloudflare resources and initialize the server-side signing key. No D1, KV, or R2 IDs are entered in the browser.</p>
    <div className="panel"><div className="panel-head"><div><span className="step">INSTALLATION CHECK</span><h2>Infrastructure</h2></div><button onClick={()=>void check()} disabled={loading}>{loading?"Checking…":"Run check"}</button></div>
      {error&&<div className="error">{error}</div>}
      {status&&<div className="checks">{Object.entries(status.resources).map(([name,ok])=><div className="check" key={name}><span className={ok?"dot ok":"dot"}/><div><strong>{name.toUpperCase()}</strong><small>{ok?"Available":"Not available yet"}</small></div></div>)}<div className="check"><span className="dot ok"/><div><strong>SIGNING KEY</strong><small>{status.signingKey.source}</small></div></div></div>}
      {status&&<div className={ready?"ready":"not-ready"}><strong>{ready?"Installation foundation complete":"Waiting for deployment resources"}</strong><p>{ready?"D1 migrations, KV, R2, and the server-side signing key are available. Continue to create the administrator account and open the license dashboard.":"The Worker is online, but one or more resources or migrations are not ready. Check the deployment workflow and run this check again."}</p></div>}
      {ready&&<button className="continue" onClick={()=>{window.location.href=status?.administrator?.configured?"/admin/login":"/admin/setup"}}>Continue to Administrator →</button>}
    </div>
    <section><article><i>01</i><h3>Deploy</h3><p>Wrangler provisions the declared D1, KV, and R2 bindings during deployment.</p></article><article><i>02</i><h3>Initialize</h3><p>The installer verifies migrations and creates the persistent server-side signing key when one is not supplied as a Worker secret.</p></article><article><i>03</i><h3>Admin</h3><p>Create the private administrator account, then manage annual and lifetime license keys from one simple dashboard.</p></article></section>
  </Shell>;
}

function AdminSetup(){const [form,setForm]=useState({username:"",email:"",password:"",confirm:""}),[error,setError]=useState("");
  async function submit(e:React.FormEvent){e.preventDefault();setError("");if(form.password!==form.confirm){setError("Passwords do not match.");return;}try{await api("/v1/admin/setup",{method:"POST",body:JSON.stringify(form)});window.location.href="/admin";}catch(e){setError(e instanceof Error?e.message:"Administrator setup failed.");}}
  return <Shell eyebrow="DEVONE CMS 2.0 · ADMIN SETUP"><div className="auth-card"><span className="step">ONE-TIME SETUP</span><h1>Create your administrator.</h1><p className="lead">This account controls license issuance and revocation. Your password is never stored in cleartext.</p><form onSubmit={submit}>{["username","email","password","confirm"].map(k=><label key={k}>{k==="confirm"?"Confirm password":k[0].toUpperCase()+k.slice(1)}<input required type={k.includes("password")||k==="confirm"?"password":k==="email"?"email":"text"} minLength={k==="password"||k==="confirm"?12:3} value={(form as any)[k]} onChange={e=>setForm({...form,[k]:e.target.value})}/></label>)}{error&&<div className="error">{error}</div>}<button className="primary" type="submit">Create administrator →</button></form></div></Shell>;
}

function Login(){const [username,setUsername]=useState(""),[password,setPassword]=useState(""),[error,setError]=useState("");
  async function submit(e:React.FormEvent){e.preventDefault();setError("");try{await api("/v1/admin/login",{method:"POST",body:JSON.stringify({username,password})});window.location.href="/admin";}catch(e){setError("Login failed. Check your username and password.");}}
  return <Shell eyebrow="DEVONE CMS 2.0 · ADMIN"><div className="auth-card"><span className="step">SECURE ACCESS</span><h1>Welcome back.</h1><p className="lead">Sign in to the license authority dashboard.</p><form onSubmit={submit}><label>Username<input autoFocus required value={username} onChange={e=>setUsername(e.target.value)}/></label><label>Password<input required type="password" value={password} onChange={e=>setPassword(e.target.value)}/></label>{error&&<div className="error">{error}</div>}<button className="primary" type="submit">Sign in →</button></form></div></Shell>;
}

function Dashboard(){const [user,setUser]=useState<User|null>(null),[licenses,setLicenses]=useState<License[]>([]),[term,setTerm]=useState<"annual"|"lifetime">("annual"),[newKey,setNewKey]=useState(""),[message,setMessage]=useState(""),[error,setError]=useState("");
  async function load(){try{const [u,l]=await Promise.all([api("/v1/admin/me"),api("/v1/admin/licenses")]);setUser(u);setLicenses(l);}catch{window.location.href="/admin/login";}}
  useEffect(()=>{void load();},[]);
  async function issue(){setError("");setMessage("");try{const d=await api("/v1/admin/licenses/issue",{method:"POST",body:JSON.stringify({term})});setNewKey(d.licenseKey);setMessage("Key generated. Copy it now — the cleartext key is not stored by the server.");await load();}catch(e){setError(e instanceof Error?e.message:"Could not issue license.");}}
  async function revoke(id:string){if(!confirm("Revoke this license?"))return;try{await api("/v1/admin/licenses/revoke",{method:"POST",body:JSON.stringify({licenseId:id})});await load();}catch(e){setError(e instanceof Error?e.message:"Could not revoke license.");}}
  async function logout(){await api("/v1/admin/logout",{method:"POST"});window.location.href="/admin/login";}
  return <Shell eyebrow="DEVONE CMS 2.0 · LICENSE AUTHORITY"><div className="dash-head"><div><span className="step">CONTROL CENTER</span><h1>License authority.</h1><p className="lead">Issue, inspect, and revoke DevOne CMS licenses. Unassigned keys stay ready until an installation activates them.</p></div><button className="ghost" onClick={logout}>Sign out</button></div>
    {message&&<div className="ready"><strong>{message}</strong>{newKey&&<div className="key-box"><code>{newKey}</code><button onClick={()=>navigator.clipboard?.writeText(newKey)}>Copy key</button></div>}</div>}{error&&<div className="error">{error}</div>}
    <div className="dash-grid"><div className="panel"><span className="step">ISSUE LICENSE</span><h2>New key</h2><p className="muted">Keys are generated with cryptographic randomness and stored only as hashes.</p><div className="term-toggle"><button className={term==="annual"?"selected":""} onClick={()=>setTerm("annual")}>Annual<br/><small>1 year</small></button><button className={term==="lifetime"?"selected":""} onClick={()=>setTerm("lifetime")}>Lifetime<br/><small>no practical expiry</small></button></div><button className="primary" onClick={()=>void issue()}>Generate license key ✦</button></div>
    <div className="panel"><span className="step">ACCOUNT</span><h2>{user?.username||"Administrator"}</h2><p className="muted">{user?.email||"Authenticated administrator"}</p><div className="stat"><strong>{licenses.length}</strong><span>Total issued</span></div><div className="stat"><strong>{licenses.filter(x=>x.installationId).length}</strong><span>Installed</span></div></div></div>
    <div className="panel table-panel"><div className="panel-head"><div><span className="step">LICENSES</span><h2>License inventory</h2></div><button onClick={()=>void load()}>Refresh</button></div><div className="table-wrap"><table><thead><tr><th>License</th><th>Term</th><th>Status</th><th>Installation</th><th>Expires</th><th/></tr></thead><tbody>{licenses.map(l=><tr key={l.licenseId}><td><code>{l.licenseId.slice(0,8)}…</code></td><td>{l.term}</td><td><span className={"pill "+(l.state==="active"?"active":"revoked")}>{l.state}</span></td><td>{l.installationId?"Installed":"Waiting for install"}</td><td>{l.term==="lifetime"?"Lifetime":new Date(l.expiresAt).toLocaleDateString()}</td><td>{l.state==="active"&&<button className="danger" onClick={()=>void revoke(l.licenseId)}>Revoke</button>}</td></tr>)}</tbody></table>{licenses.length===0&&<div className="empty">No licenses yet. Generate your first key above.</div>}</div></div>
  </Shell>;
}

function Router(){const p=window.location.pathname;if(p==="/install"||p==="/")return <Installer/>;if(p==="/admin/setup")return <AdminSetup/>;if(p==="/admin/login")return <Login/>;if(p==="/admin")return <Dashboard/>;return <Installer/>;}
createRoot(document.getElementById("root")!).render(<StrictMode><Router/></StrictMode>);
