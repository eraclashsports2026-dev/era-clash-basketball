# EraClash Basketball

Build your ultimate 5-on-5 all-time NBA squad, clash across eras, and let AI simulate the outcome.

This is a Vite + React app with a secure serverless backend (Vercel) that keeps your Anthropic API key hidden.

---

## How it works

- **Frontend** (`src/App.jsx`) — the game UI. Sends the two teams + series type to the backend.
- **Backend** (`api/simulate.js`) — a Vercel serverless function. Holds your API key server-side, builds the analyst prompt, calls Claude, and returns the result. Users can only run basketball simulations; they can never see your key or send arbitrary prompts through it.

---

## Deploy (web UI — no terminal needed)

### Step 1 — Put the code on GitHub
1. Go to https://github.com and sign in (create a free account if needed).
2. Click the **+** (top right) → **New repository**.
3. Name it `eraclash-basketball`, leave it **Public** or **Private** (either works), do NOT add a README (we have one). Click **Create repository**.
4. On the new repo page, click **uploading an existing file**.
5. Drag the entire contents of this folder (the `src` folder, `api` folder, `public` folder, `package.json`, `vite.config.js`, `index.html`, `.gitignore`, `vercel.json`, `README.md`) into the upload area.
   - **Important:** drag the folders themselves so the structure is preserved.
6. Click **Commit changes**.

### Step 2 — Deploy on Vercel
1. Go to https://vercel.com and **Sign up with GitHub**.
2. Click **Add New… → Project**.
3. Find `eraclash-basketball` in your repo list and click **Import**.
4. Vercel auto-detects Vite. Leave all build settings as-is.
5. **Before deploying**, expand **Environment Variables** and add:
   - **Name:** `ANTHROPIC_API_KEY`
   - **Value:** your `sk-ant-...` key
   - Click **Add**.
6. Click **Deploy**. Wait ~1 minute. You'll get a live URL like `eraclash-basketball.vercel.app`.

### Step 3 — Connect your domain
1. In your Vercel project → **Settings → Domains**.
2. Add `eraclashbasketball.com` (and `www.eraclashbasketball.com`).
3. Vercel shows you DNS records to add.
4. In **GoDaddy** → your domain → **DNS**, add the records exactly as Vercel specifies (usually an `A` record and a `CNAME`).
5. DNS can take a few minutes to a few hours to propagate. Vercel auto-issues an SSL certificate.

Done — you're live.

---

## Updating the site later
Any change pushed to the GitHub repo auto-deploys to Vercel. To edit via web UI: open the file on GitHub → click the pencil icon → edit → commit. Vercel rebuilds automatically.

## Cost
Each simulation costs roughly $0.003–0.005 in Anthropic API usage. Your spending limit is set in the Anthropic Console.

## Local development (optional, requires Node.js)
```
npm install
npm run dev
```
For local API testing, use the Vercel CLI (`vercel dev`) with a `.env` file containing `ANTHROPIC_API_KEY=sk-ant-...`. Never commit `.env`.
