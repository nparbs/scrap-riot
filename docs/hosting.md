# Hosting the game server

The game page is static and lives on GitHub Pages. Online play also needs this server running somewhere with a secure `wss://` address, because browsers block insecure connections from HTTPS pages.

These steps run it with Docker in a Linux VM on Proxmox. Any Linux machine with Docker works the same way.

## 1. Prepare a VM

Docker in a VM is the simplest setup, and it keeps the internet-facing service isolated from the Proxmox host.

- Use an existing Debian or Ubuntu VM, or create one. 1 vCPU and 1 GB of RAM handles several matches at once. Each match is one 60 Hz simulation, so add CPU before adding RAM.
- Avoid a VM holding anything sensitive, since this service is reachable from the internet. If your network supports it, put the VM on its own VLAN.
- Install Docker: <https://docs.docker.com/engine/install/>

```sh
git clone https://github.com/nparbs/scrap-riot.git
cd scrap-riot
cp .env.example .env
```

## 2. Give it a public address

You need a domain name for either option.

### Option A: Cloudflare Tunnel (recommended for home hosting)

The VM connects out to Cloudflare, so no router ports are opened, and players never see your home IP. It adds a small amount of latency, and Cloudflare's terms apply to the traffic.

1. Add your domain to a free Cloudflare account.
2. In the Cloudflare dashboard, open Zero Trust, then Networks, then Tunnels, and create a tunnel. Choose Docker and copy the token from the command it shows.
3. Add a public hostname such as `game.example.com`, with service type `HTTP` and URL `server:8787`.
4. In `.env`, set `TUNNEL_TOKEN` to the token.

### Option B: Caddy with port forwarding

Caddy gets and renews HTTPS certificates automatically. Latency is lower, but players can see your home IP, and you are exposing two ports.

1. Point a DNS record for `game.example.com` at your public IP. If that IP changes, use a dynamic DNS service.
2. Forward router ports 80 and 443 to the VM.
3. In `.env`, set `COMPOSE_PROFILES=caddy` and `GAME_DOMAIN=game.example.com`, set `CLIENT_IP_HEADER=x-forwarded-for`, and clear `TUNNEL_TOKEN`.

## 3. Start it

```sh
docker compose up -d --build
docker compose ps
docker compose logs -f server
```

`server` should report `healthy`. Check the public side from any machine:

```sh
curl https://game.example.com/health
```

This returns something like `{"ok":true,"rooms":0,"connections":0}`.

## 4. Point the game at it

In the GitHub repo, open Settings, then Secrets and variables, then Actions, then Variables, and add:

| Name | Value |
| --- | --- |
| `GAME_SERVER_URL` | `wss://game.example.com` |

Then re-run the "Deploy to GitHub Pages" workflow from the Actions tab. The Fight Online button appears once the variable is set.

## Updating

```sh
git pull
docker compose up -d --build
```

Restarting ends any matches in progress, and players go back to the garage. Update the server and the page together when `PROTOCOL_VERSION` changes, because mismatched clients are refused with a prompt to refresh.

## Other notes

- **Start on boot:** enable "Start at boot" on the VM in Proxmox. Docker restarts the containers.
- **Your upload speed matters:** each player receives 20 updates per second, measured at about 18.5 KB/s. A full match of six humans needs roughly 110 KB/s, or about 0.9 Mbit/s, of upload. Busy fights use more, so check `docker stats` under real load.
- **What it stores:** nothing. There is no database and no logs of player data, and matches exist only in memory. A connecting player's IP is held in memory only for the connection limit.
- **Connections from one household:** the limit is 8 per IP address.
