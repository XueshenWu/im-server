# Image Management Backend Services

![Docker](https://img.shields.io/badge/docker-compose-blue) ![Node](https://img.shields.io/badge/node-22-green) ![Drizzle](https://img.shields.io/badge/orm-drizzle-yellow) ![MinIO](https://img.shields.io/badge/storage-minio-red)

This directory hosts the server-side infrastructure for the Image Management Desktop App. It is a containerized environment handling data persistence, image storage (TIFF/PNG/JPEG), and synchronization logic.

## 🏗 Architecture

The backend runs entirely in Docker. **Nginx** acts as the reverse proxy to handle routing between the API and the Object Storage using subdomain resolution.

### Service Port Mappings

| Service      | Container Name       | Internal Port | Host Port     | Description                                     |
| :----------- | :------------------- | :------------ | :------------ | :---------------------------------------------- |
| **API**      | `image-mgmt-api`     | 3000          | **3000**      | Express.js server (Business logic, Sync). |
| **Database** | `image-mgmt-db`      | 5432          | **5430**      | PostgreSQL 16 (Managed via Drizzle ORM).        |
| **Storage**  | `image-mgmt-storage` | 9000/9001     | **9000/9001** | MinIO (self-hosted S3-compatible storage for Images).       |
| **Cache**    | `image-mgmt-redis`   | 6379          | **6370**      | Redis (Distributed lock and in-flight image upload session).                    |
| **Gateway**  | `image-mgmt-nginx`   | 80            | **9999**      | Nginx Reverse Proxy (Handles routing).          |

### Domain Resolution Strategy
We use **nip.io** to allow wildcard subdomains on a local network IP without a DNS server.
* **Base Domain:** `192.168.0.24.nip.io` (Configurable via `.env`)
* **API URL:** `http://192.168.0.24.nip.io:9999`
* **Storage URL:** `http://s3.192.168.0.24.nip.io:9999`
* **MinIO Console URL:** `http://console.192.168.0.24.nip.io:9999`

## 🛠 Tech Stack

* **Runtime:** Node.js v22 (Alpine Linux)
* **Framework:** Express.js
* **Database:** PostgreSQL + Drizzle ORM
* **Storage:** MinIO (Supports Multi-page TIFF, PNG, JPEG)
* **Infrastructure:** Docker Compose

## 🚀 Getting Started

### 1. Prerequisites
* Docker & Docker Compose
* Node.js v22 (for local development outside containers)

### 2. Environment Configuration
Copy the example environment file and configure your local IP.

```bash
cp .env.example .env
# Your local machine's LAN IP (Run `ipconfig` or `ifconfig` to find this)
BASE_DOMAIN=192.168.0.24.nip.io
PUBLIC_PORT=9999

# Database Credentials
DB_USER=postgres
DB_PASSWORD=postgres
DATABASE_URL=postgresql://postgres:postgres@postgres:5432/postgres

# MinIO Keys
MINIO_ACCESS_KEY=admin
MINIO_SECRET_KEY=password
```

### 3. Database Migrations
```bash
# Run migration from your host machine
npm run db:push

# OR run it inside the container if you don't have Node installed locally
docker exec -it image-mgmt-api npm run db:push
```


### 4. Start the Infrastructure
Run the complete stack in detached mode:
```bash
docker-compose up -d --build
```


## 📦 Storage & Webhooks
he system uses MinIO buckets to store raw images and thumbnails.

Bucket Policy: Public read access is generally required for the Electron renderer to display images via URL.

Webhooks: MinIO is configured to send event notifications to the API when a file is uploaded.

Endpoint: http://host.docker.internal:3000/webhook/minio

Trigger: PUT, POST (Uploads)


## 🐛 Troubleshooting
1. "Connection Refused" on Subdomains Ensure your BASE_DOMAIN in .env matches your actual LAN IP. If your IP changes, you must update the .env file and restart containers.

2. Nginx cannot connect to Upstreams If Nginx logs show "host not found", ensure all containers are on the default bridge network created by docker-compose.

3. Database connection fails during dev If connecting from your host machine (e.g., Drizzle Studio), use port 5430. If connecting from inside Docker (e.g., the API), use port 5432.
4. Cannot access the App/MinIO from other devices
**Cause:** Windows Defender Firewall blocks ports exposed by Docker/WSL by default.
**Solution:** You need to allow the ports through the Windows Firewall. Run this in **PowerShell as Administrator**:

## 🧪 Development Commands
```bash
# Rebuild containers after code changes
docker-compose up -d --build api

# View logs for the API service
docker-compose logs -f api

# View logs for Nginx gateway
docker-compose logs -f nginx

# Open MinIO Console
# Go to [http://console.192.168.0.24.nip.io:9999](http://console.192.168.0.24.nip.io:9999)
```
