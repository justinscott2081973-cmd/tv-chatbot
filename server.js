// Run: ANTHROPIC_API_KEY=... ADMIN_KEY=... node server.js
const http = require('http'), fs = require('fs'), path = require('path');
try { fs.readFileSync(path.join(__dirname, '.env'), 'utf8').split('\n').forEach(l => { const m = l.match(/^\s*([A-Z_]+)\s*=\s*(.*)\s*$/); if (m && !process.env[m[1]]) process.env[m[1]] = m[2]; }); } catch {}
const GKEY = process.env.GEMINI_API_KEY, GMODEL = process.env.GEMINI_MODEL || 'gemini-2.5-flash-lite';
const KEY = process.env.ANTHROPIC_API_KEY, ADMIN = process.env.ADMIN_KEY || 'change-me';
const PORT = process.env.PORT || 3000, MODEL = process.env.MODEL || 'claude-sonnet-5-5';
const BIZ = process.env.BUSINESS_NAME || 'InternetTVSolutionsUSA';
const DATA = process.env.DATA_DIR || __dirname; try { fs.mkdirSync(DATA, { recursive: true }); } catch {}
const LOG = path.join(DATA, 'conversations.jsonl'), LEADS = path.join(DATA, 'leads.jsonl');

const SYSTEM = `You are the website assistant for ${BIZ}, an authorized DIRECTV dealer that also helps customers find home internet service.
Goals: answer questions about DIRECTV (DIRECTV via satellite and DIRECTV STREAM) and internet/TV service in a friendly, short, plain way, then get interested customers to leave their details so a sales agent can call them.
Rules:
- Never state exact prices, promotions, speeds, or channel lineups as fact; they vary by address and change often. Say an agent will confirm current offers and availability for their address.
- Never invent details. If you don't know, say an agent will confirm.
- Keep replies under 80 words. Ask one question at a time.
- After helping, ask for their name, best phone number, and ZIP code so an agent can check availability.
- Once you have name AND phone (ZIP if given), append on a new final line exactly: [LEAD]{"name":"...","phone":"...","zip":"...","interest":"..."}[/LEAD] and thank them. Do not mention this tag.`;

const PAGE = `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${BIZ} Chat</title>
<style>
:root{--bg:#f6f7f9;--card:#fff;--text:#1b1f24;--muted:#6b7280;--brand:#0b5ed7;--bot:#e9ecf1;--border:#dde1e7}
@media(prefers-color-scheme:dark){:root{--bg:#111317;--card:#1a1d23;--text:#e8eaee;--muted:#9aa1ad;--bot:#262a32;--border:#2e333c}}
html,body{height:100%;margin:0}body{background:var(--bg);color:var(--text);font:16px/1.5 system-ui,sans-serif}
#app{height:100%;max-width:720px;margin:0 auto;display:flex;flex-direction:column;background:var(--card)}
header{padding:14px 18px;border-bottom:1px solid var(--border);font-weight:600}
#log{flex:1;overflow-y:auto;padding:16px;display:flex;flex-direction:column;gap:10px}
.m{max-width:82%;padding:10px 14px;border-radius:16px;white-space:pre-wrap;word-wrap:break-word}
.u{align-self:flex-end;background:var(--brand);color:#fff;border-bottom-right-radius:4px}
.b{align-self:flex-start;background:var(--bot);border-bottom-left-radius:4px}
#bar{display:flex;gap:8px;padding:12px;border-top:1px solid var(--border)}
#in{flex:1;padding:11px 14px;border-radius:12px;border:1px solid var(--border);background:var(--bg);color:var(--text);font:inherit;outline:none}
#send{background:var(--brand);color:#fff;border:0;border-radius:12px;padding:0 20px;font:inherit;font-weight:600;cursor:pointer}
#send:disabled{opacity:.5}
</style></head><body><div id="app"><header>${BIZ}</header><div id="log"></div>
<div id="bar"><input id="in" placeholder="Ask about DIRECTV or internet plans…" autocomplete="off"><button id="send">Send</button></div></div>
<script>
const log=document.getElementById('log'),inp=document.getElementById('in'),btn=document.getElementById('send');
const sid=(crypto.randomUUID?crypto.randomUUID():String(Date.now()+Math.random()));let msgs=[],busy=false;
function add(c,t){const d=document.createElement('div');d.className='m '+c;d.textContent=t;log.appendChild(d);log.scrollTop=log.scrollHeight;return d}
add('b',"Hi! I can answer questions about DIRECTV and home internet. What are you looking for?");
async function go(){const t=inp.value.trim();if(!t||busy)return;busy=true;btn.disabled=true;inp.value='';add('u',t);msgs.push({role:'user',content:t});
const b=add('b','…');
try{const r=await fetch('/api/chat',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({sid,messages:msgs})});
const j=await r.json();if(!r.ok)throw new Error(j.error||'error');b.textContent=j.reply;msgs.push({role:'assistant',content:j.reply})}
catch(e){b.textContent='Sorry, something went wrong. Please try again.';msgs.pop()}
busy=false;btn.disabled=false;inp.focus()}
btn.onclick=go;inp.addEventListener('keydown',e=>{if(e.key==='Enter')go()});
</script></body></html>`;

const hits = new Map();
const limited = ip => { const n = Date.now(), a = (hits.get(ip) || []).filter(t => n - t < 60000); a.push(n); hits.set(ip, a); return a.length > 20; };
const append = (f, o) => fs.appendFileSync(f, JSON.stringify(o) + '\n');
const readJ = f => { try { return fs.readFileSync(f, 'utf8').trim().split('\n').filter(Boolean).map(l => JSON.parse(l)); } catch { return []; } };
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const body = req => new Promise((res, rej) => { let d = ''; req.on('data', c => { d += c; if (d.length > 50000) { rej(new Error('big')); req.destroy(); } }); req.on('end', () => res(d)); });
const send = (res, code, type, data) => { res.writeHead(code, { 'Content-Type': type }); res.end(data); };

http.createServer(async (req, res) => {
  const u = new URL(req.url, 'http://x');
  const ip = (req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').split(',')[0].trim();
  try {
    if (req.method === 'GET' && u.pathname === '/') return send(res, 200, 'text/html; charset=utf-8', PAGE);

    if (req.method === 'POST' && u.pathname === '/api/chat') {
      if (!KEY && !GKEY) return send(res, 500, 'application/json', '{"error":"Server not configured"}');
      if (limited(ip)) return send(res, 429, 'application/json', '{"error":"Too many messages, slow down"}');
      const { sid, messages } = JSON.parse(await body(req));
      const msgs = (messages || []).slice(-20).map(m => ({ role: m.role === 'assistant' ? 'assistant' : 'user', content: String(m.content).slice(0, 1000) }));
      if (!msgs.length || msgs[msgs.length - 1].role !== 'user') return send(res, 400, 'application/json', '{"error":"bad request"}');
      let reply;
      if (GKEY) {
        const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${GMODEL}:generateContent`, {
          method: 'POST', headers: { 'content-type': 'application/json', 'x-goog-api-key': GKEY },
          body: JSON.stringify({ systemInstruction: { parts: [{ text: SYSTEM }] }, generationConfig: { maxOutputTokens: 400 },
            contents: msgs.map(m => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content }] })) })
        });
        const j = await r.json();
        if (!r.ok) { console.error(JSON.stringify(j)); return send(res, 502, 'application/json', '{"error":"AI error"}'); }
        reply = (j.candidates?.[0]?.content?.parts || []).map(p => p.text || '').join('');
      } else {
        const r = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST', headers: { 'content-type': 'application/json', 'x-api-key': KEY, 'anthropic-version': '2023-06-01' },
          body: JSON.stringify({ model: MODEL, max_tokens: 400, system: SYSTEM, messages: msgs })
        });
        const j = await r.json();
        if (!r.ok) { console.error(j); return send(res, 502, 'application/json', '{"error":"AI error"}'); }
        reply = (j.content || []).filter(c => c.type === 'text').map(c => c.text).join('');
      }
      const m = reply.match(/\[LEAD\]([\s\S]*?)\[\/LEAD\]/);
      if (m) { try { append(LEADS, { t: new Date().toISOString(), sid, ip, ...JSON.parse(m[1]) }); } catch {} reply = reply.replace(m[0], '').trim(); }
      const t = new Date().toISOString();
      append(LOG, { t, sid, role: 'user', text: msgs[msgs.length - 1].content });
      append(LOG, { t, sid, role: 'bot', text: reply });
      return send(res, 200, 'application/json', JSON.stringify({ reply }));
    }

    if (req.method === 'GET' && u.pathname === '/admin') {
      if (u.searchParams.get('key') !== ADMIN) return send(res, 401, 'text/plain', 'Unauthorized');
      const leads = readJ(LEADS).reverse(), log = readJ(LOG);
      const bySid = {}; log.forEach(l => (bySid[l.sid] = bySid[l.sid] || []).push(l));
      const sessions = Object.entries(bySid).reverse();
      const html = `<!DOCTYPE html><meta charset=utf-8><meta name=viewport content="width=device-width,initial-scale=1"><title>Admin</title>
<style>body{font:15px system-ui;max-width:900px;margin:20px auto;padding:0 12px}table{border-collapse:collapse;width:100%}td,th{border:1px solid #ccc;padding:6px 8px;text-align:left}.s{border:1px solid #ccc;border-radius:8px;margin:10px 0;padding:8px 12px}.u{color:#0b5ed7}</style>
<h2>Leads (${leads.length})</h2><table><tr><th>Time</th><th>Name</th><th>Phone</th><th>ZIP</th><th>Interest</th></tr>
${leads.map(l => `<tr><td>${esc(l.t)}</td><td>${esc(l.name)}</td><td>${esc(l.phone)}</td><td>${esc(l.zip)}</td><td>${esc(l.interest)}</td></tr>`).join('')}</table>
<h2>Conversations (${sessions.length})</h2>
${sessions.map(([id, ls]) => `<div class=s><small>${esc(ls[0].t)}</small>${ls.map(l => `<div class="${l.role === 'user' ? 'u' : ''}"><b>${l.role === 'user' ? 'Customer' : 'Bot'}:</b> ${esc(l.text)}</div>`).join('')}</div>`).join('')}`;
      return send(res, 200, 'text/html; charset=utf-8', html);
    }
    send(res, 404, 'text/plain', 'Not found');
  } catch (e) { console.error(e); send(res, 500, 'application/json', '{"error":"server error"}'); }
}).listen(PORT, () => console.log('Chatbot running on port ' + PORT));
