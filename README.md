# Setup (5 minutes)
1. Get an API key at console.anthropic.com.
2. Copy `.env.example` to `.env` and fill in ANTHROPIC_API_KEY and ADMIN_KEY.
3. Needs Node 18+. Run: `npm start`
4. Customers chat at: http://YOUR-SERVER/
5. You view leads + every conversation at: http://YOUR-SERVER/admin?key=YOUR_ADMIN_KEY
6. Put it on your site with: <iframe src="https://YOUR-SERVER/" style="width:100%;height:600px;border:0"></iframe>
Deploy on any Node host (Render, Railway, Fly.io, a VPS). Data saves to leads.jsonl and conversations.jsonl.
