---
description: Expose local service (localhost:3000) to the internet using Cloudflare Tunnel
---

# Expose Service to Internet (Cloudflare Tunnel)

This workflow guides you through setting up a Cloudflare Tunnel to securely expose your local HelloXiaohong instance to the internet.

## Prerequisites
- A Cloudflare account (Free).
- `cloudflared` installed on your Mac.

## Step 1: Install Cloudflare Tunnel (cloudflared)

If you haven't installed it yet, use Homebrew:

```bash
brew install cloudflared
```

## Step 2: Login to Cloudflare

Run the login command. This will open your browser to authorize your machine.

```bash
cloudflared tunnel login
```

## Step 3: Start a Quick Tunnel (Temporary)

For a quick test with a random URL:

```bash
cloudflared tunnel --url http://localhost:3000
```

Look for the output line saying `+--------------------------------------------------------------------------------------------+` and copy the `*.trycloudflare.com` URL.

## Step 4: Create a Persistent Tunnel (Recommended)

For a stable URL (e.g., `xhs.yourdomain.com`), you need to create a named tunnel.

1.  **Create Tunnel**:
    ```bash
    cloudflared tunnel create helloxiaohong
    ```
    *Copy the Tunnel ID (UUID) from the output.*

2.  **Configure DNS**:
    Maps a subdomain to your tunnel.
    ```bash
    cloudflared tunnel route dns helloxiaohong <subdomain.yourdomain.com>
    ```
    *(Example: `cloudflared tunnel route dns helloxiaohong my-xhs-app.corlin.cn`)*

3.  **Run Tunnel**:
    ```bash
    cloudflared tunnel run --url http://localhost:3000 helloxiaohong
    ```

## Step 5: Background Service (Optional)

To keep it running after you close the terminal, install it as a service:

```bash
sudo cloudflared service install <your-tunnel-token>
```
*(Get the token from Cloudflare Zero Trust Dashboard > Tunnels)*
