# Pharmacy Management System — Backend API

Production-ready NestJS backend for single-owner personal pharmacy inventory management, medicine lookup, and bidirectional offline-first synchronization with MongoDB & Prisma.

---

## 🚀 Key Features

- **NestJS Architecture**: Modular, robust, and scalable TypeScript backend.
- **Prisma ORM + MongoDB**: Fast document database mapping with indexed queries and transaction safety.
- **JWT Authentication**: Secure Bearer tokens with rotating refresh tokens and bcrypt password hashing.
- **Medicine Catalog Management**: Fast partial multi-field search across medicine names, generic names, brands, manufacturers, and barcodes.
- **Stock Movements & Audit Logging**: Immutable ledger tracking for inward stock receipts and adjustments with quantity before/after deltas.
- **Expiry & Low-Stock Alerts**: Real-time shelf-life monitoring and threshold alerts.
- **Bidirectional Offline-First Sync**: Dedicated `/api/v1/sync/push` and `/api/v1/sync/pull` endpoints with server-side idempotency cache.
- **Docker Ready**: Multi-stage production `Dockerfile` and `docker-compose.yml`.
- **Render & Vercel Ready**: Preconfigured with `render.yaml` and `vercel.json`.
- **Swagger Documentation**: Interactive OpenAPI documentation at `/api/v1/docs`.

---

## 🛠 Tech Stack

- **Framework**: NestJS (Express adapter)
- **Language**: TypeScript
- **Database**: MongoDB (Atlas or local)
- **ORM**: Prisma ORM v6
- **Security**: Helmet, CORS, Throttler, Class-Validator
- **Testing**: Jest (Unit, Service, and Offline-First E2E suites)

---

## 📦 Installation & Setup

1. **Clone the repository:**
   ```bash
   git clone https://github.com/mohammad-anar/farmacy-management-backend.git
   cd farmacy-management-backend
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Configure Environment Variables:**
   Copy `.env.example` to `.env` and configure your credentials:
   ```env
   NODE_ENV=development
   PORT=5000
   DATABASE_URL="mongodb+srv://<username>:<password>@cluster.mongodb.net/pharmacy_db?retryWrites=true&w=majority"
   JWT_ACCESS_SECRET="your_access_secret_key"
   JWT_REFRESH_SECRET="your_refresh_secret_key"
   JWT_ACCESS_EXPIRES_IN=15m
   JWT_REFRESH_EXPIRES_IN=7d
   ```

4. **Generate Prisma Client:**
   ```bash
   npx prisma generate
   ```

5. **Start development server:**
   ```bash
   npm run start:dev
   ```

API runs at: `http://localhost:5000/api/v1`  
Swagger UI at: `http://localhost:5000/api/v1/docs`

---

## 🧪 Automated Testing

Run all 8 test suites (47 unit, service, integration, and offline sync tests):
```bash
npm test
```

---

## 🐳 Running with Docker

```bash
docker compose up --build -d
```

---

## 📄 License

UNLICENSED — Personal Pharmacy Management System.
