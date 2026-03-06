# Get PersonaPlex on Your Phone Call — Step-by-Step

Here's exactly what you can do today and what's still missing.

**Who does what:** **Browser / you** = Railway, Hugging Face. **Local terminal – you run** = Mac terminal; you can ask Cursor to run these for you.

---

## Part 1: Turn on PersonaPlex in your agent (click-by-click)  
**Browser / you**

This makes your **agent** use PersonaPlex when a gateway is available. If no gateway is set up, calls keep using the current (OpenAI) agent.

### 1. Open Railway

1. Go to **https://railway.app** and log in.
2. Open the **project** that runs your AI pizza agent (Uncle Sal's, Tazza, etc.).

### 2. Open Variables

1. Click the **service** (the card that runs your Node.js app).
2. Click **Variables** (or **Settings** → **Variables**).

### 3. Add / edit these two variables

1. Click **+ New Variable** (or **Add Variable**).
2. Add or edit:

   - **Name:** `CONVERSATION_ENGINE`  
     **Value:** `personaplex`

   - **Name:** `PERSONAPLEX_GATEWAY_URL`  
     **Value:** your gateway URL, e.g. `https://your-personaplex-gateway.railway.app`  
     (If you don't have a gateway yet, use a placeholder like `https://placeholder.invalid` — the agent will try it, fail, and fall back to the current agent so calls still work.)

3. Save (e.g. **Add** or **Update**). Railway will redeploy.

### 4. Redeploy (if it didn't auto-redeploy)

1. In the same project, open the **Deployments** tab.
2. If the latest deployment isn't "Active", trigger a redeploy (e.g. **Redeploy** on the latest deployment).

After this, when a **real** PersonaPlex gateway is running at `PERSONAPLEX_GATEWAY_URL`, the agent will use it. Until then, calls keep using the current agent.

---

## Part 2: Gateway and phone call

Your agent is **configured** to use PersonaPlex when you set the right variables. The **gateway** is in this repo:

- **PersonaPlex (NVIDIA)** is a **browser Web UI** app: you run a server and use it in a browser. It does **not** have a built-in Twilio/phone API.
- Our **agent** calls a **gateway** (`services/personaplex-gateway`): it sends "start session" to `PERSONAPLEX_GATEWAY_URL` and streams call audio to the gateway over a WebSocket.
- The **gateway** (deploy it to Railway as a separate service) does:
  1. Accept "start session" from the agent.
  2. Receive **audio** from the agent (from the call).
  3. If **PERSONAPLEX_WEBSOCKET_URL** is set, forward that audio to PersonaPlex and send PersonaPlex's audio back to the agent → phone.
  4. If not set, the call may be silent until you run PersonaPlex and set that variable.

To get PersonaPlex **on the phone call**: deploy the gateway (see **`docs/RAILWAY_PERSONAPLEX_CLICK_BY_CLICK.md`**), set your agent's **PERSONAPLEX_GATEWAY_URL**, then run PersonaPlex (Part 3) and set the gateway's **PERSONAPLEX_WEBSOCKET_URL**.

---

## Part 3: Run PersonaPlex yourself (for Web UI or a future gateway)  
**Browser / you** (license, token) + **Local terminal – you run** (or **Cursor can run** if you ask)

You can run PersonaPlex and use it in the **browser** (or later plug it into a gateway). Once localhost works, you can copy the same setup to a Linux VM for 24/7 (see **`docs/PERSONAPLEX_ALWAYS_ON.md`**).

---

### Get localhost working first (Mac checklist)

Do these in order so PersonaPlex runs on your Mac and the Web UI loads at **https://localhost:8998**. After that works, use **`docs/PERSONAPLEX_ALWAYS_ON.md`** to run the same thing on Linux for always-on.

1. **Fix network so Hugging Face is reachable**  
   If you previously saw "Failed to resolve cas-bridge.xethub.hf.co":
   - Try a **different network** (e.g. phone hotspot or another Wi‑Fi).
   - **Turn off VPN** if you use one.
   - Optionally set **DNS** to 8.8.8.8 or 1.1.1.1 (System Settings → Network → Wi‑Fi → Details → DNS).
   - In Terminal, check: `ping -c 2 huggingface.co` — you should see replies.

2. **Hugging Face (browser)**  
   - Accept the model: **https://huggingface.co/nvidia/personaplex-7b-v1** → Agree / Accept.  
   - Create a **Classic** Read token: **https://huggingface.co/settings/tokens** → New token → Classic, Read → Generate. Copy the token.

3. **Run PersonaPlex on your Mac (terminal)**  
   In Terminal (or ask Cursor to run this for you):

   ```bash
   cd ~/personaplex && source venv/bin/activate && export HF_TOKEN='YOUR_TOKEN' && SSL_DIR=$(mktemp -d) && python -m moshi.server --ssl "$SSL_DIR" --device cpu --cpu-offload
   ```

   Replace `YOUR_TOKEN` with your Hugging Face token. Wait until you see something like **"Access the Web UI at https://localhost:8998"** (first run can take 20–45 min; later runs ~5–15 min).

4. **Confirm in the browser**  
   Open **http://localhost:8998** in your browser (use **localhost**, not the IP like `172.17.32.235`). You should see the PersonaPlex Web UI. **"Not secure"** is normal for local HTTP—click **Advanced** → **Proceed to localhost** if the browser warns. If that loads, **localhost is working**.

5. **Next: Linux for always-on**  
   Once the Web UI works on your Mac, follow **`docs/PERSONAPLEX_ALWAYS_ON.md`** to run the same stack on an Ubuntu VM (clone, patch, venv, systemd, expose, set **PERSONAPLEX_WEBSOCKET_URL** on Railway).

---

### 3.1 Accept the model license

1. Go to **https://huggingface.co/nvidia/personaplex-7b-v1**.
2. Log in or sign up.
3. Open the **"Terms and conditions"** (or **"Agree and access repository"**) and **Accept** the license.

### 3.2 Get a HuggingFace token

1. Go to **https://huggingface.co/settings/tokens**.
2. Click **New token**.
3. Name it (e.g. `personaplex`), choose **Read** access, then **Generate**.
4. **Copy** the token and keep it somewhere safe (you'll paste it in a terminal).

### 3.3 Machine requirements (click-by-click)

**Check your OS**

1. On **macOS:** Click the Apple menu (top-left) → **About This Mac**. You should see "macOS" and a version number. PersonaPlex supports macOS.
2. On **Linux:** Open a terminal and run: `uname -a`. If you see "Linux", you're good. Ubuntu/Debian are recommended.

**Check your GPU (optional but recommended)**

1. **macOS:** Apple menu → **About This Mac** → **System Report** (or **More Info**) → **Graphics/Displays**. Note your GPU. PersonaPlex can run with **CPU offload** on Mac (slower; see 3.6).
2. **Linux with NVIDIA GPU:** In a terminal run: `nvidia-smi`. If you see driver and GPU info, you have an NVIDIA GPU. Note the VRAM (e.g. 8GB, 16GB). PersonaPlex often wants 16GB+ for best performance; less VRAM → use `--cpu-offload` in 3.6.
3. **No NVIDIA GPU or low VRAM:** You can still run PersonaPlex with **CPU offload**: install `accelerate` and use `--cpu-offload` when starting the server (step 3.6). It will be slower but works.

**What you need before 3.4**

- A machine running **Linux** (e.g. Ubuntu) or **macOS**.
- **Python 3.10 or newer** (check with `python3 --version` in a terminal).
- **pip** (usually comes with Python; check with `pip3 --version`).
- **Git** (check with `git --version`).

### 3.4 Install dependencies (click-by-click)

**On Ubuntu/Debian (Linux)**

1. Open a terminal (e.g. Ctrl+Alt+T or Applications → Terminal).
2. Run (one line at a time; enter your password if asked):
   ```bash
   sudo apt update
   ```
   Wait for it to finish.
3. Run:
   ```bash
   sudo apt install -y libopus-dev
   ```
   Wait until you see "Done" or back to the prompt.
4. (Optional) Check Python: run `python3 --version`. You should see 3.10 or higher. If not, install with: `sudo apt install -y python3 python3-pip python3-venv`.

**On macOS**

1. Open **Terminal** (Applications → Utilities → Terminal, or Spotlight: type "Terminal" and press Enter).
2. Install Opus (if you use Homebrew). If you don't have Homebrew, go to https://brew.sh and follow "Install Homebrew", then return here.
3. In Terminal, run:
   ```bash
   brew install opus
   ```
   Wait for it to finish.
4. (Optional) Check Python: run `python3 --version`. You should see 3.10 or higher. If not, run `brew install python@3.11` (or newer).

### 3.5 Clone and install PersonaPlex (click-by-click)

1. **Open a terminal** (same as 3.4).
2. Go to your home folder and clone the repo. Run each line and press Enter:
   ```bash
   cd ~
   git clone https://github.com/NVIDIA/personaplex.git
   cd personaplex
   ```
   You should end up in a folder named `personaplex` with files like `moshi`, `README.md`, etc.
3. **Create a virtual environment.** Run:
   ```bash
   python3 -m venv venv
   ```
   Then activate it:
   - **Linux/macOS:** `source venv/bin/activate`
   Your prompt should now start with `(venv)`.
4. **Install the PersonaPlex package.** Run:
   ```bash
   pip install moshi/.
   ```
   Wait until it finishes (can take a few minutes). If you see "Successfully installed …", you're good.
5. **Set your HuggingFace token.** Replace `YOUR_HF_TOKEN` with the token you copied in 3.2, then run:
   ```bash
   export HF_TOKEN=YOUR_HF_TOKEN
   ```
   Example: if your token is `hf_abc123xyz`, run: `export HF_TOKEN=hf_abc123xyz`
6. Keep this terminal open; you'll use it in 3.6.

### 3.6 Run the server (click-by-click)

1. **Use the same terminal** where you ran 3.5 (with `(venv)` active and `HF_TOKEN` set).
2. **If you have a good NVIDIA GPU (e.g. 16GB+ VRAM):** Run:
   ```bash
   SSL_DIR=$(mktemp -d)
   python -m moshi.server --ssl "$SSL_DIR"
   ```
3. **If you don't have an NVIDIA GPU (e.g. Mac), or you get out-of-memory errors:** First install accelerate, then run with **device CPU** and CPU offload:
   ```bash
   pip install accelerate
   SSL_DIR=$(mktemp -d)
   python -m moshi.server --ssl "$SSL_DIR" --device cpu --cpu-offload
   ```
   **On Mac (Apple Silicon):** If you see `AssertionError: Torch not compiled with CUDA enabled`, the PersonaPlex clone was patched so CUDA is optional (see `moshi/moshi/utils/compile.py`). Use `--device cpu --cpu-offload` as above.
4. Wait for the server to start. Look for a line like: **"Access the Web UI at https://localhost:8998"** (or an IP address if you're on a remote machine). Note that URL.
5. If you see errors about "CUDA" or "out of memory", stop the server (Ctrl+C), then run again with `--device cpu --cpu-offload` as in step 3.
6. Leave this terminal open; closing it will stop PersonaPlex.

### 3.7 Use PersonaPlex in the browser (click-by-click)

1. **Open a web browser** (Chrome, Firefox, Safari, etc.).
2. **Go to the URL** from 3.6 (e.g. **https://localhost:8998**). Type it in the address bar and press Enter.
3. **Accept the certificate warning** (e.g. "Your connection is not private" or "Advanced" → "Proceed to localhost"). This is normal for a self-signed certificate.
4. **Use the Web UI:** You should see the PersonaPlex interface. Allow microphone access if asked. Choose a persona/voice and talk to PersonaPlex in the browser.
5. This gets PersonaPlex **running and working in the browser**. To use it on your **phone** call, you still need to expose its WebSocket (e.g. with ngrok) and set **PERSONAPLEX_WEBSOCKET_URL** on your gateway (see `docs/RAILWAY_PERSONAPLEX_CLICK_BY_CLICK.md` and "Connecting PersonaPlex" at the end).

---

## Summary

| Step | What you do | Result |
|------|-------------|--------|
| **Part 1** | Set `CONVERSATION_ENGINE=personaplex` and `PERSONAPLEX_GATEWAY_URL=...` on your **agent** in Railway | Agent uses the gateway for calls; if gateway is missing, calls use the current agent. |
| **Part 2** | Deploy the gateway (`services/personaplex-gateway`) to Railway and set agent vars (see `docs/RAILWAY_PERSONAPLEX_CLICK_BY_CLICK.md`) | Gateway is running; agent streams call audio to it. |
| **Part 3** | Run PersonaPlex (3.1–3.7), then set **PERSONAPLEX_WEBSOCKET_URL** on the gateway | You can use PersonaPlex in the browser; with WebSocket exposed and gateway var set, you hear PersonaPlex on the phone call. |

**Short answer:**  
Do **Part 1** and **Part 2** (Railway agent + gateway) so the call uses the gateway. Do **Part 3** (3.1–3.7) click-by-click to run PersonaPlex and use it in the browser. To hear PersonaPlex **on the phone**, expose its WebSocket (e.g. ngrok) and set **PERSONAPLEX_WEBSOCKET_URL** on the gateway.

---

## Troubleshooting

### "Failed to resolve cas-bridge.xethub.hf.co" / ConnectionError to Hugging Face

This is a **network or DNS issue**, not a "computer too slow" or "not enough RAM" problem. Your Mac couldn't reach Hugging Face's servers (e.g. `cas-bridge.xethub.hf.co`) to fetch model data.

**What to do:**

1. **Retry on a different network**  
   Try again on another Wi‑Fi, or tether to your phone. Sometimes home or office DNS/firewalls block or fail to resolve that host.

2. **Check VPN and DNS**  
   If you use a VPN, turn it off and retry. You can also try switching DNS (e.g. System Settings → Network → Wi‑Fi → Details → DNS and add `8.8.8.8` or `1.1.1.1`), then run PersonaPlex again.

3. **Use http:// not https:// when the server falls back to HTTP**  
   If the server log says "falling back to HTTP" or "Access the Web UI directly at http://...", open **http://localhost:8998** in your browser (not https). The WebSocket will then use `ws://` and Connect will work.

4. **PersonaPlex sits on "Connecting..." and never goes to "Connected"**
   - **Use http://localhost:8998 (not the IP, not https)**  
     In the address bar type **http://localhost:8998** and press Enter. Do not use the numeric IP (e.g. `172.17.32.235:8998`) or https. The server runs without SSL, so the WebSocket must use `ws://`. **"Not secure"** is normal for local HTTP—use **Advanced** → **Proceed to localhost** if the browser warns.
   - **Hard refresh**  
     After switching to http://, do a hard refresh (Cmd+Shift+R on Mac) so the page doesn't use a cached mix of http/https.
   - **Wait 30–60 seconds**  
     The first time you click Connect, the server loads the voice prompt on CPU and can take 30–60 seconds. If it's still "Connecting..." after that, check the server terminal for errors and the browser console (F12 → Console) for WebSocket errors.
   - **Handshake fix**  
     The client shows "Connected" only after the server sends a handshake byte. The server was updated to send the handshake **immediately** after the WebSocket connects (instead of after a long "system prompts" step on CPU), so the UI should switch to "Connected" within a second or two. Restart the PersonaPlex server if you applied this fix so it picks up the change.
   - **Connected but no response / Audio played stays 0**  
     After Connect, the server still runs a "system prompts" step on CPU (can take 1–2 minutes). Your mic audio is now buffered while that runs. Once it finishes, the server starts processing and you should hear a response and see "Audio played" increase. If you talked before that, your audio was buffered and will be processed. Restart the server after applying the recv_loop-buffer fix so it takes effect.  
     **If handshake works and mic bars move but you still get no reply:** The server's main loop was asserting the wrong token shape (`dep_q + 1` instead of `dep_q`) and using the wrong slice for decode. The fix is in **both** `personaplex/moshi/moshi/server.py` (repo) and **personaplex/venv/lib/python3.11/site-packages/moshi/server.py`** (installed copy — this is what `python -m moshi.server` actually runs). Apply the same fix to the venv copy if you only edited the repo. **Restart the PersonaPlex server** (Ctrl+C, then start it again) so it loads the updated code; then Connect and talk again.
   - **"Concurrent call to receive() is not allowed" in server log**  
     This happened because both recv_loop and is_alive() were calling ws.receive(). The server was updated so is_alive() only checks the close flag and ws.closed (no receive). Restart the PersonaPlex server so it picks up the fix; then Connect and talk again.
   - **Console full of "WebSocket is already in CLOSING or CLOSED state" / "closing socket due to inactivity" / agent won't talk back**  
     The default client (served from Hugging Face) closes the socket after 10 seconds of no *received* messages. The server can take 1–2 minutes for system prompts on CPU, so the client was closing the connection before the server could respond. A fix is in the **PersonaPlex client** in your clone (`personaplex/client`): longer inactivity timeout (2.5 min), send only when socket is OPEN, and sending counts as activity. To use the fixed client, do this **click by click**:
     1. **Stop the PersonaPlex server** (Ctrl+C in the terminal where it's running).
     2. **Build the client:** In a terminal, run:
        ```bash
        cd ~/personaplex/client && npm install && npm run build
        ```
        (Run `npm install` first so TypeScript and other dependencies are installed; then the build will find `tsc`.) Wait until it finishes (no errors).
     3. **Start the server using your built client** (from the same or another terminal):
        ```bash
        cd ~/personaplex && source venv/bin/activate && export HF_TOKEN='YOUR_TOKEN' && python -m moshi.server --static client/dist --device cpu --cpu-offload
        ```
        Replace `YOUR_TOKEN` with your Hugging Face token. If you normally use `--ssl` or other flags, add them too. The important part is **`--static client/dist`** so the server serves your patched client instead of the default one.
     4. Wait until the server logs **"serving static content from ..."** and **"Access the Web UI directly at http://..."**.
     5. **Hard refresh the browser:** Open **http://localhost:8998** (not https), then press **Cmd+Shift+R** (Mac) or **Ctrl+Shift+R** (Windows/Linux).
     6. Click **Connect**, wait 1–2 minutes for the first response (system prompts run on CPU). The console should stay clean and the agent should eventually talk back.

5. **"RuntimeError: Attempting to deserialize object on a CUDA device" when you click Connect**  
   The voice prompt `.pt` files were saved on a GPU. On a Mac (CPU-only), the code must load them with `map_location=torch.device('cpu')`. This is patched in your PersonaPlex clone and venv (`moshi/models/lm.py`). Restart the PersonaPlex server and try Connect again.

6. **Run PersonaPlex on a cloud VM instead**  
   If your local network keeps failing, run PersonaPlex on a **cloud server** (Ubuntu VM). The VM has stable outbound access to Hugging Face and stays on 24/7. Follow **`docs/PERSONAPLEX_ALWAYS_ON.md`** from Part 1 (create VM) through Part 5 (point Railway at it). You don't need PersonaPlex working locally first; the always-on doc is the workaround when local fails or you want it always on.

7. **PersonaPlex is extremely laggy and slow on CPU (MacBook Air)**  
   **The Reality:** PersonaPlex is designed for **GPU inference**. Running on CPU (especially a MacBook Air) will have **2-3+ second latency** and miss a lot of audio. This is **not a bug**—it's the fundamental limitation of running a large AI model on CPU.
   
   **What you're seeing:**
   - ✅ System prompts complete successfully
   - ✅ Model processes tokens and generates audio
   - ❌ **2-3+ second latency** (should be <200ms for natural conversation)
   - ❌ **3+ minutes of missed audio** (client can't keep up with slow CPU generation)
   - ❌ Only brief responses like "Hey," before timing out
   
   **CPU Optimizations Applied:**
   - The server now automatically sets PyTorch threading to use all CPU cores
   - This helps a bit, but **CPU will still be 10-50x slower than GPU**
   
   **Solutions:**
   
   **Option A: Use GPU for Production (REQUIRED for phone calls)**  
   PersonaPlex **must run on GPU** for real-time phone conversations. Options:
   - **Railway GPU** (if available): Deploy PersonaPlex as a Railway service with GPU
   - **AWS EC2 GPU instance** (g4dn.xlarge or similar): ~$0.50-1.00/hour
   - **Google Cloud GPU** (T4 GPU): ~$0.35-0.50/hour
   - **Runway ML / Replicate**: GPU inference APIs (pay per use)
   - **Follow `docs/PERSONAPLEX_ALWAYS_ON.md`**: Deploy PersonaPlex on a GPU VM, expose via ngrok, point Railway gateway at it
   
   **Option B: Use CPU Only for Testing/Development**  
   - CPU is fine for **testing the integration** (does it connect? does audio flow?)
   - CPU is **NOT suitable for real phone calls** (customers will hang up due to lag)
   - For local testing, expect 2-3 second delays and accept that responses will be brief
   
   **Option C: Use OpenAI Realtime API Instead**  
   - Your current agent already uses OpenAI Realtime API (fast, low latency)
   - PersonaPlex adds "persona" and natural turn-taking, but requires GPU
   - If GPU isn't available, stick with OpenAI Realtime for production calls
   
   **Bottom Line:**  
   - ✅ **Local CPU testing:** Works for verifying the integration works
   - ❌ **Production phone calls:** Requires GPU (2-3 second latency is unacceptable)
   - 🎯 **Next step:** Deploy PersonaPlex on a GPU instance (Railway GPU, AWS, GCP, or VM) for production use
