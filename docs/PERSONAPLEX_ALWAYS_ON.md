# Run PersonaPlex 24/7 (Always On)

Use these steps to run PersonaPlex on a **cloud server** so it’s always on and your Railway gateway can reach it. You can do this **even if PersonaPlex failed locally** (e.g. “Failed to resolve cas-bridge.xethub.hf.co” or other network/DNS errors on your Mac). The VM has stable internet and avoids local network and machine limits.

---

## Who does what

| Label | Meaning |
|--------|--------|
| **Browser / you** | You do this in a web browser (Railway, cloud provider, etc.). Cursor cannot do it. |
| **VM – you run** | You run these commands **on the cloud VM** after you SSH in. Cursor cannot run commands on your VM. |
| **Local – Cursor can run** | You can ask Cursor to run these in your **local** terminal (your Mac). Cursor can run terminal commands only on your machine, not on the VM. |

Most of this guide is **VM – you run** or **Browser / you**. The only optional “Local – Cursor can run” bit is preparing a patch file or script on your Mac that you then copy to the VM (see “Optional: prepare patch on your Mac” in Part 2).

---

## What you need

- PersonaPlex working locally (you’ve already done this).
- Railway **gateway** and **agent** deployed and configured (see `RAILWAY_PERSONAPLEX_CLICK_BY_CLICK.md`).
- A **Linux cloud VM** that stays on 24/7 (e.g. Ubuntu 22.04 on DigitalOcean, AWS, GCP, Linode, or a small always-on machine).
- Your **Hugging Face token** (same one you use locally).
- (Optional but recommended) A **domain name** pointing to the VM, for HTTPS/WSS (e.g. `personaplex.yourdomain.com`). Without a domain you can use the VM’s public IP and a self-signed cert (gateway accepts it).

---

## Part 1: Create a cloud VM  
**Browser / you**

### For GPU (REQUIRED for production phone calls)

**Google Cloud (what you're looking at):**

1. **In Google Cloud Console** (where you are now):
   - Click **"Create Instance"** (or **"VM instances"** → **"Create Instance"**)
   - **Name:** `personaplex-gpu` (or any name)
   - **Region:** Choose a region that has GPUs (e.g. `us-central1`, `us-east1`, `europe-west4`)
   - **Machine type:** Click **"Customize"** → Select:
     - **Series:** N1 or N2
     - **Machine type:** `n1-standard-4` or `n2-standard-4` (4 vCPU, 16 GB RAM minimum)
   - **GPU:** Click **"Add GPU"**:
     - **GPU type:** **NVIDIA T4** (cheapest, ~$0.35-0.50/hour) or **NVIDIA L4** (newer, similar price)
     - **Number of GPUs:** 1
     - **GPU availability:** On-demand (or Spot for 60-90% discount, but may be interrupted)
   - **Boot disk:** 
     - **OS:** **Ubuntu 22.04 LTS**
     - **Size:** 50 GB minimum (100 GB recommended)
   - **Firewall:** Check **"Allow HTTP traffic"** and **"Allow HTTPS traffic"**
   - **Advanced options** → **Networking** → **Network tags:** Add `personaplex` (optional, for firewall rules)
   - Click **"Create"**

2. **After creation:**
   - Note the **External IP** (e.g. `34.123.45.67`)
   - Click **"SSH"** button next to the instance to open a browser SSH session
   - Or use: `gcloud compute ssh personaplex-gpu --zone=YOUR_ZONE` (if you have gcloud CLI)

**AWS EC2 (alternative):**

1. **EC2 Console** → **Launch Instance**:
   - **AMI:** Ubuntu Server 22.04 LTS
   - **Instance type:** `g4dn.xlarge` (1x NVIDIA T4 GPU, 4 vCPU, 16 GB RAM) - ~$0.50-0.75/hour
   - **Key pair:** Create/download a key pair for SSH
   - **Security group:** Allow SSH (22) and custom TCP (8998)
   - **Launch**

**Important:** GPU instances cost **$0.35-1.00/hour** (~$250-730/month if running 24/7). Consider:
- **Spot instances** (60-90% discount, but can be interrupted)
- **Stop the instance** when not in use (you only pay for storage)
- **Committed use discounts** (1-3 year commitments for 30-50% savings)

### For CPU-only (testing/development only)

**Note:** CPU is **NOT suitable for production phone calls** (2-3 second latency). Only use CPU for testing the integration.

1. **Pick a provider** (examples):
   - **DigitalOcean**: Droplet, Ubuntu 22.04, at least **4 GB RAM** (8 GB better for PersonaPlex 7B on CPU).
   - **AWS**: EC2, Ubuntu 22.04, similar size (e.g. t3.medium or larger for CPU-only).
   - **Google Cloud**: Ubuntu 22.04, 4 GB+ RAM (regular VM, no GPU).

2. **Create the VM**:
   - OS: **Ubuntu 22.04 LTS**.
   - Allow **SSH** (port 22) from your IP or everywhere for setup.
   - Note the **public IP** and how to **SSH** in (e.g. `ssh root@YOUR_VM_IP` or `ssh ubuntu@YOUR_VM_IP`).

3. **SSH into the VM** and continue below on the server.

---

## Part 2: Install PersonaPlex on the VM  
**VM – you run** (SSH into the VM and run each block there.)

### Optional: prepare patch on your Mac (Local – Cursor can run)

You can ask Cursor to create the `compile.py` patch file in your project so you don’t have to edit by hand on the VM. For example: *“Create a patch file for PersonaPlex compile.py so CUDA is optional, and tell me how to copy it to the VM and apply it.”* You can run **`bash scripts/personaplex-compile-patch.sh`** (or ask Cursor to run it). That creates **`personaplex-compile-patched.py`** in your project; then copy it to the VM and replace `~/personaplex/moshi/moshi/utils/compile.py` (e.g. `scp personaplex-compile-patched.py user@VM_IP:/tmp/compile.py` then `ssh user@VM_IP 'cp /tmp/compile.py ~/personaplex/moshi/moshi/utils/compile.py'`). Or edit `compile.py` on the VM with `nano` as in 2.2 below.

### 2.1 System dependencies

```bash
sudo apt update
sudo apt install -y libopus-dev python3.11 python3.11-venv python3-pip git
```

### 2.2 Clone and patch PersonaPlex

```bash
cd ~
git clone https://github.com/NVIDIA/personaplex.git
cd personaplex
```

**Make CUDA optional** (so it runs on CPU-only VMs). Edit `moshi/moshi/utils/compile.py`:

```bash
nano moshi/moshi/utils/compile.py
```

Find the line:

```python
from torch import cuda
```

Replace it with:

```python
try:
    from torch import cuda
except (AssertionError, AttributeError):
    cuda = None  # e.g. PyTorch not compiled with CUDA (macOS / CPU-only Linux)
```

Then find:

```python
def _is_cuda_graph_enabled() -> bool:
    if _disable_cuda_graph:
```

Change to:

```python
def _is_cuda_graph_enabled() -> bool:
    if cuda is None or _disable_cuda_graph:
```

Save and exit (Ctrl+O, Enter, Ctrl+X).

### 2.3 Install NVIDIA GPU drivers (GPU instances only)

**Skip this if using CPU-only.**

On Google Cloud GPU instances, drivers are usually pre-installed. Verify:

```bash
nvidia-smi
```

If you see GPU info (e.g. "NVIDIA T4"), drivers are installed. If not, install:

```bash
# For Ubuntu 22.04 on Google Cloud
sudo apt update
sudo apt install -y nvidia-driver-535 nvidia-cuda-toolkit
sudo reboot
# After reboot, SSH back in and verify: nvidia-smi
```

### 2.4 Python venv and install

```bash
cd ~/personaplex
python3.11 -m venv venv
source venv/bin/activate
pip install --upgrade pip
pip install moshi/.
pip install accelerate  # Only needed for CPU offload; GPU doesn't need it
```

### 2.5 Set your Hugging Face token

```bash
export HF_TOKEN='your_huggingface_token_here'
```

(Use the same token you use locally. You’ll also put this in the systemd service below.)

---

## Part 3: Expose PersonaPlex (HTTPS/WSS)  
**VM – you run** (Option A) or **VM – you run** + **Browser / you** (domain/DNS for Option B)

The Railway gateway needs a **wss://** URL. Two options:

### Option A: Use the VM’s public IP (quick)

1. **Open port 8998** on the VM (firewall / security group) — **Browser / you** (cloud provider console):
   - AWS: Security group → Inbound → TCP 8998 from 0.0.0.0/0 (or restrict to Railway IPs if you know them).
   - DigitalOcean: Networking → Firewall → Inbound TCP 8998.

2. **Start PersonaPlex with SSL** (so the server speaks WSS):

   **For GPU:**
   ```bash
   cd ~/personaplex
   source venv/bin/activate
   export HF_TOKEN='your_token'
   SSL_DIR=$(mktemp -d)
   python -m moshi.server --ssl "$SSL_DIR" --device cuda --port 8998
   ```
   
   **For CPU-only (testing only):**
   ```bash
   cd ~/personaplex
   source venv/bin/activate
   export HF_TOKEN='your_token'
   SSL_DIR=$(mktemp -d)
   python -m moshi.server --ssl "$SSL_DIR" --device cpu --cpu-offload --port 8998
   ```

   The server generates a self-signed cert in `$SSL_DIR`. Your gateway uses `rejectUnauthorized: false`, so it can connect to `wss://YOUR_VM_IP:8998/api/chat`.

3. **WebSocket URL** for Railway:
   - `wss://YOUR_VM_PUBLIC_IP:8998/api/chat`
   - Replace `YOUR_VM_PUBLIC_IP` with the VM’s actual public IP.

### Option B: Use a domain and HTTPS (recommended for production)

1. **Point a domain** to your VM’s public IP — **Browser / you** (your DNS provider). (e.g. `personaplex.yourdomain.com` → A record to that IP).

2. **Install nginx and Certbot**:

   ```bash
   sudo apt install -y nginx certbot python3-certbot-nginx
   ```

3. **Get a certificate** (replace with your domain):

   ```bash
   sudo certbot --nginx -d personaplex.yourdomain.com
   ```

4. **Proxy to PersonaPlex** (PersonaPlex will listen on localhost only):

   ```bash
   sudo nano /etc/nginx/sites-available/personaplex
   ```

   Paste (replace `personaplex.yourdomain.com`):

   ```nginx
   server {
       listen 443 ssl;
       server_name personaplex.yourdomain.com;
       ssl_certificate     /etc/letsencrypt/live/personaplex.yourdomain.com/fullchain.pem;
       ssl_certificate_key /etc/letsencrypt/live/personaplex.yourdomain.com/privkey.pem;

       location / {
           proxy_pass https://127.0.0.1:8998;
           proxy_http_version 1.1;
           proxy_set_header Upgrade $http_upgrade;
           proxy_set_header Connection "upgrade";
           proxy_set_header Host $host;
           proxy_set_header X-Real-IP $remote_addr;
       }
   }
   ```

   Enable and reload:

   ```bash
   sudo ln -s /etc/nginx/sites-available/personaplex /etc/nginx/sites-enabled/
   sudo nginx -t && sudo systemctl reload nginx
   ```

5. **Run PersonaPlex on localhost** (no SSL flags; nginx handles SSL):

   **For GPU:**
   ```bash
   cd ~/personaplex
   source venv/bin/activate
   export HF_TOKEN='your_token'
   python -m moshi.server --device cuda --port 8998 --host 127.0.0.1
   ```
   
   **For CPU-only (testing only):**
   ```bash
   cd ~/personaplex
   source venv/bin/activate
   export HF_TOKEN='your_token'
   python -m moshi.server --device cpu --cpu-offload --port 8998 --host 127.0.0.1
   ```

   WebSocket URL for Railway: **`wss://personaplex.yourdomain.com/api/chat`**

---

## Part 4: Keep PersonaPlex running 24/7 (systemd)  
**VM – you run**

So PersonaPlex restarts on reboot and on crash.

### 4.1 Create a systemd service

```bash
sudo nano /etc/systemd/system/personaplex.service
```

Paste (replace `YOUR_HF_TOKEN` with your real token; use Option A or B path as needed):

**If using Option A (direct IP:8998 with SSL):**

**For GPU:**
```ini
[Unit]
Description=PersonaPlex server
After=network.target

[Service]
Type=simple
User=root
WorkingDirectory=/root/personaplex
Environment="HF_TOKEN=YOUR_HF_TOKEN"
Environment="PATH=/root/personaplex/venv/bin:/usr/local/bin:/usr/bin:/bin"
ExecStart=/root/personaplex/venv/bin/python -m moshi.server --ssl /var/lib/personaplex-ssl --device cuda --port 8998
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
```

**For CPU-only (testing only):**
```ini
[Unit]
Description=PersonaPlex server
After=network.target

[Service]
Type=simple
User=root
WorkingDirectory=/root/personaplex
Environment="HF_TOKEN=YOUR_HF_TOKEN"
Environment="PATH=/root/personaplex/venv/bin:/usr/local/bin:/usr/bin:/bin"
ExecStart=/root/personaplex/venv/bin/python -m moshi.server --ssl /var/lib/personaplex-ssl --device cpu --cpu-offload --port 8998
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
```

Create the SSL dir for Option A:

```bash
sudo mkdir -p /var/lib/personaplex-ssl
```

**If using Option B (nginx proxy, no SSL on PersonaPlex):**

**For GPU:**
```ini
[Unit]
Description=PersonaPlex server
After=network.target

[Service]
Type=simple
User=root
WorkingDirectory=/root/personaplex
Environment="HF_TOKEN=YOUR_HF_TOKEN"
Environment="PATH=/root/personaplex/venv/bin:/usr/local/bin:/usr/bin:/bin"
ExecStart=/root/personaplex/venv/bin/python -m moshi.server --device cuda --port 8998 --host 127.0.0.1
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
```

**For CPU-only (testing only):**
```ini
[Unit]
Description=PersonaPlex server
After=network.target

[Service]
Type=simple
User=root
WorkingDirectory=/root/personaplex
Environment="HF_TOKEN=YOUR_HF_TOKEN"
Environment="PATH=/root/personaplex/venv/bin:/usr/local/bin:/usr/bin:/bin"
ExecStart=/root/personaplex/venv/bin/python -m moshi.server --device cpu --cpu-offload --port 8998 --host 127.0.0.1
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
```

Adjust `User=` and paths if you’re not root (e.g. `User=ubuntu` and `/home/ubuntu/personaplex`).

### 4.2 Enable and start

```bash
sudo systemctl daemon-reload
sudo systemctl enable personaplex
sudo systemctl start personaplex
sudo systemctl status personaplex
```

Check logs:

```bash
sudo journalctl -u personaplex -f
```

Wait until you see the server ready (e.g. “Access the Web UI at …” or listening on 8998). Then continue.

---

## Part 5: Point Railway at PersonaPlex  
**Browser / you**

1. In **Railway**, open the **gateway** service (not the agent).
2. Go to **Variables**.
3. Set **PERSONAPLEX_WEBSOCKET_URL** to your always-on URL:
   - **Option A:** `wss://YOUR_VM_PUBLIC_IP:8998/api/chat`
   - **Option B:** `wss://personaplex.yourdomain.com/api/chat`
4. Save. Railway will redeploy the gateway.

---

## Part 6: Test  
**Browser / you** + **you (phone call)**

1. **From your browser:** Open the PersonaPlex UI (Option A: `https://YOUR_VM_IP:8998`, Option B: `https://personaplex.yourdomain.com`). Accept any certificate warning. Confirm the UI loads.
2. **Call your Twilio number.** The agent uses the gateway; the gateway uses your cloud PersonaPlex. You should hear PersonaPlex on the call.

---

## Summary

| Step | What you did |
|------|------------------|
| 1 | Created an Ubuntu VM with **GPU** (T4 or L4) for production, or CPU-only for testing. Opened port 22 (SSH) and 8998 (or 443 if using nginx). |
| 2 | Installed deps, cloned PersonaPlex, patched `compile.py` for CPU (if CPU-only), installed GPU drivers (if GPU), created venv, installed moshi + accelerate (CPU only). |
| 3 | Exposed PersonaPlex: either direct `wss://IP:8998` (Option A) or domain + nginx + certbot (Option B). |
| 4 | Installed a systemd service so PersonaPlex runs 24/7 and restarts on reboot/crash. |
| 5 | Set **PERSONAPLEX_WEBSOCKET_URL** on the Railway gateway to your `wss://.../api/chat` URL. |

**Important:** GPU instances cost **$0.35-1.00/hour** (~$250-730/month). Consider stopping the instance when not in use, using Spot instances (60-90% discount), or committed use discounts for savings.

After this, PersonaPlex is always on on the VM; you don’t need your Mac or ngrok running for calls to use it.
