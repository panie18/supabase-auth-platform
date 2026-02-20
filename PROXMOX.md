# Proxmox VE – VM-Konfiguration für Supabase Auth Platform

Diese Anleitung erklärt, wie du auf Proxmox die optimale VM für die Plattform erstellst.

---

## VM-Sizing Empfehlungen

### Minimal (Entwicklung / Testing)
> Für lokale Tests, bis ~50 Benutzer, kein Produktivbetrieb

| Ressource | Wert |
|-----------|------|
| **CPU** | 2 vCPUs (1 Core reicht zur Not) |
| **RAM** | 2 GB |
| **Disk** | 20 GB (thin-provisioned) |
| **Netzwerk** | VirtIO, 1 Gbit |
| **OS** | Ubuntu 22.04 LTS (minimal) |

**Warum:** GoTrue + PostgreSQL + Node.js + Next.js brauchen im Idle ~600–900 MB RAM.

---

### Empfohlen (Produktion, bis ~500 Benutzer)
> Stabiler Betrieb, SSL, Cloudflare Tunnel, Monitoring

| Ressource | Wert |
|-----------|------|
| **CPU** | **4 vCPUs** (2 Cores mit je 2 Threads) |
| **RAM** | **4 GB** |
| **Disk** | **40 GB** (SSD/NVMe Datastore empfohlen) |
| **Netzwerk** | VirtIO, 1 Gbit |
| **OS** | Ubuntu 22.04 LTS |
| **Balloon Memory** | Ja, min. 2 GB / max. 4 GB |

**Aufschlüsselung:**
- PostgreSQL: ~300–500 MB RAM
- GoTrue: ~100–200 MB RAM
- Backend (Node.js): ~150–300 MB RAM
- Frontend (Next.js): ~200–400 MB RAM
- Nginx: ~30–50 MB RAM
- Watchtower: ~30 MB RAM
- OS + Buffer: ~500 MB RAM
- **Gesamt Idle: ~1,3–2 GB | Under load: ~2,5–3 GB**

---

### Large (Produktion, 500–5000 Benutzer)
> Viele parallele Auth-Requests, große Benutzerdatenbank

| Ressource | Wert |
|-----------|------|
| **CPU** | **8 vCPUs** |
| **RAM** | **8 GB** |
| **Disk** | **80 GB** (NVMe, separates PostgreSQL-Volume empfohlen) |
| **Netzwerk** | VirtIO, 10 Gbit |
| **OS** | Ubuntu 22.04 LTS |

---

## Proxmox VM erstellen – Schritt für Schritt

### 1. VM in Proxmox anlegen

```
Proxmox Web UI → Datacenter → [Dein Node] → Create VM
```

**Allgemein:**
- Name: `supabase-auth`
- VM ID: z.B. `200`

**OS:**
- ISO: Ubuntu 22.04 LTS Server (`ubuntu-22.04.x-live-server-amd64.iso`)
- Typ: Linux, Kernel: 5.x - 2.6

**System:**
- BIOS: **SeaBIOS** (oder OVMF/UEFI)
- Machine: **q35**
- SCSI Controller: **VirtIO SCSI single**
- Qemu Agent: **Aktiviert** ✓

**Disks:**
- Bus: **VirtIO Block** oder **SCSI** (VirtIO)
- Storage: Deinen SSD/NVMe Datastore wählen
- Size: **40 GB** (für Empfohlen)
- Cache: **Write back** (schneller, bei Proxmox mit UPS sicher)
- **Discard aktivieren** (für SSD TRIM)
- **IO Thread aktivieren** ✓

**CPU:**
- Sockets: 1
- Cores: **4** (für Empfohlen)
- Typ: **host** (beste Performance, nutzt alle CPU-Features)

```
# Warum "host"?
# Mit Type=host hat die VM Zugriff auf alle CPU-Extensions (AES-NI, AVX etc.)
# Das beschleunigt TLS/Crypto-Operationen (JWT signing, bcrypt) erheblich!
```

**RAM:**
- Memory: **4096 MB**
- Ballooning aktivieren: Min **2048 MB**, Max **4096 MB**

**Netzwerk:**
- Bridge: `vmbr0` (oder dein externes Bridge)
- Model: **VirtIO (paravirtualized)**
- Firewall: nach Wunsch

---

### 2. Ubuntu installieren

Beim Ubuntu-Setup:
- Minimale Installation wählen (kein Desktop!)
- OpenSSH Server installieren: **Ja**
- Optional: LVM oder ZFS für Disk (ZFS empfohlen für Snapshots)

---

### 3. Nach der Ubuntu-Installation

```bash
# System updaten
sudo apt update && sudo apt upgrade -y

# QEMU Guest Agent installieren (für Proxmox-Integration)
sudo apt install -y qemu-guest-agent
sudo systemctl enable --now qemu-guest-agent

# Nützliche Tools
sudo apt install -y curl wget git htop iotop ncdu net-tools

# Docker installieren
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker $USER
newgrp docker

# Projekt klonen und installieren
git clone https://github.com/panie18/supabase-auth-platform
cd supabase-auth-platform
sudo bash install.sh
```

---

### 4. Proxmox-spezifische Optimierungen

#### Snapshots vor dem Installer
```
# In Proxmox: VM → Snapshots → Take Snapshot
# Name: "before-install"
# So kannst du jederzeit zurückrollen
```

#### Backup einrichten (Proxmox Backup Server / vzdump)
```bash
# In Proxmox UI: Datacenter → Backup → Add
# Schedule: täglich oder wöchentlich
# Mode: Snapshot (kein Downtime)
# Compression: zstd (schnell + gut)
```

#### CPU-Pinning (optional, für maximale Performance)
```bash
# Im Proxmox-Host (nicht in der VM):
# Verhindert CPU-Migration-Overhead

# Beispiel: VM 200 auf Core 4-7 pinnen
qm set 200 --cpuunits 1024
# In /etc/pve/qemu-server/200.conf:
# cpu: host,flags=+aes
```

#### Disk I/O Optimierung
```bash
# In der VM: I/O-Scheduler für SSDs
echo 'none' > /sys/block/vda/queue/scheduler
# Persistent machen:
echo 'ACTION=="add|change", KERNEL=="vda", ATTR{queue/scheduler}="none"' \
  > /etc/udev/rules.d/60-scheduler.rules
```

---

### 5. Netzwerk-Konfiguration

#### Option A: Öffentliche IP (direkt)
```
Proxmox vmbr0 → VM bekommt öffentliche IP
DNS A-Records → VM-IP
```

#### Option B: NAT hinter Proxmox-Host (Port-Forwarding)
```bash
# Auf dem Proxmox-Host (iptables):
iptables -t nat -A PREROUTING -p tcp --dport 80 -j DNAT --to-destination VM_IP:80
iptables -t nat -A PREROUTING -p tcp --dport 443 -j DNAT --to-destination VM_IP:443
iptables -A FORWARD -d VM_IP -j ACCEPT

# Persistent machen:
apt install -y iptables-persistent
netfilter-persistent save
```

#### Option C: Cloudflare Tunnel (kein Port-Forwarding nötig!)
```
VM muss keine öffentliche IP haben!
Cloudflare Tunnel stellt die Verbindung ausgehend her.
→ Im Dashboard: Tunnel → Token eingeben → cloudflared Container startet
```

---

### 6. Firewall in der VM (UFW)

```bash
# Installer setzt UFW automatisch – hier manuell:
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow 22/tcp    # SSH
sudo ufw allow 80/tcp    # HTTP (für Certbot)
sudo ufw allow 443/tcp   # HTTPS
# Wenn Cloudflare Tunnel: Port 80/443 NICHT nötig!
sudo ufw --force enable
sudo ufw status verbose
```

---

### 7. Resource-Monitoring in Proxmox

```bash
# In der VM: htop für Echtzeit-Monitoring
htop

# Docker Stats
docker stats --no-stream

# Disk-Nutzung
ncdu /

# Logs aller Container
docker compose logs -f --tail=50
```

---

## Proxmox Hardware-Empfehlungen für den Host

Falls du Proxmox noch aufsetzt:

| Komponente | Empfehlung |
|------------|------------|
| **CPU** | AMD Ryzen / Intel Core mit VT-x (für KVM) |
| **RAM** | Min. 16 GB (für mehrere VMs) |
| **OS-Disk** | 120 GB SSD (Proxmox + Backups) |
| **VM-Disk** | 500 GB+ NVMe für VM-Volumes |
| **Netzwerk** | 1 Gbit (2.5 Gbit für mehrere VMs) |

---

## Kostenübersicht (Cloud-Alternative)

Wenn du keinen eigenen Server hast – günstige VPS-Alternativen:

| Anbieter | Specs (empfohlen) | Preis/Monat |
|----------|-------------------|-------------|
| **Hetzner Cloud** | CX21: 2 vCPU, 4 GB, 40 GB SSD | ~5,77 € |
| **Netcup** | RS 2000 G10: 4 vCPU, 8 GB | ~6,99 € |
| **Contabo** | Cloud S: 4 vCPU, 8 GB | ~5,99 € |
| **DigitalOcean** | 2 vCPU, 4 GB | ~24 $ |

> **Empfehlung:** Hetzner CX21 oder CX31 – bestes Preis-Leistungs-Verhältnis in Europa, DSGVO-konform.
