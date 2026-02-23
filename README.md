# Solana Paper Trading Platform

A full-stack paper trading application for Solana SPL tokens. Practice trading with simulated USDC using real market data from SolanaTracker API. No on-chain transactions — wallet is identity only.

## Features

- **Wallet Authentication** — Connect Phantom or Solflare wallet
- **Token Search** — Search by symbol, name, or mint contract address
- **Live Charts** — Candlestick charts powered by TradingView lightweight-charts
- **Paper Trading** — Simulated market buy/sell with realistic slippage and fees
- **Portfolio Dashboard** — Track total value, P&L, ROI, positions, and trade history
- **Order Book Simulation** — Synthetic bids/asks around the mid price
- **Real-time Updates** — WebSocket price ticks and portfolio notifications
- **Background Price Polling** — BullMQ worker polls SolanaTracker API

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Next.js 14 (App Router), TypeScript, Tailwind CSS, React Query, lightweight-charts, @solana/wallet-adapter |
| Backend | Fastify, TypeScript, Prisma ORM, PostgreSQL, Redis, BullMQ |
| Testing | Jest, Supertest, Playwright |
| DevOps | Docker, docker-compose, GitHub Actions CI, Makefile |

## Project Structure

```
├── backend/
│   ├── prisma/              # Schema, migrations, seed
│   ├── src/
│   │   ├── adapters/        # Market data adapter (SolanaTracker)
│   │   ├── cli/             # Admin CLI (import-tokens)
│   │   ├── lib/             # Prisma client, Redis
│   │   ├── routes/          # Auth, trade, portfolio, market
│   │   ├── schemas/         # Zod validation
│   │   ├── services/        # Trade execution, portfolio, order book, auth
│   │   ├── worker/          # BullMQ price poller
│   │   ├── ws/              # WebSocket handler
│   │   ├── config.ts
│   │   └── server.ts
│   ├── Dockerfile
│   ├── package.json
│   └── tsconfig.json
├── frontend/
│   ├── e2e/                 # Playwright E2E tests
│   ├── public/
│   ├── src/
│   │   ├── app/             # Next.js App Router pages
│   │   │   ├── page.tsx              # Landing page
│   │   │   ├── portfolio/page.tsx    # Portfolio dashboard
│   │   │   └── token/[mint]/page.tsx # Token trading page
│   │   ├── components/      # Navbar, SearchBar, Chart, OrderPanel, OrderBook
│   │   ├── context/         # AuthContext, Providers (wallet, query, auth)
│   │   └── lib/             # API client, WebSocket client, formatters
│   ├── Dockerfile
│   ├── package.json
│   └── playwright.config.ts
├── .env.example
├── .github/workflows/ci.yml
├── docker-compose.yml
├── Makefile
├── openapi.yaml
├── postman_collection.json
└── README.md
```

## Quick Start

### Prerequisites

- Node.js 20+
- Docker & Docker Compose
- A SolanaTracker API key ([get one here](https://docs.solanatracker.io))

### 1. Clone and configure

```bash
cp .env.example .env
# Edit .env and add your SOLANA_TRACKER_API_KEY
```

### 2. Start with Docker (recommended)

```bash
make dev
```

This starts PostgreSQL, Redis, backend (port 4000), and frontend (port 3000). Migrations and seed data run automatically.

### 3. Manual setup (development)

```bash
# Terminal 1 — Start Postgres & Redis
docker-compose up postgres redis -d

# Terminal 2 — Backend
cd backend
npm install
npx prisma migrate deploy
npx prisma db seed
npm run dev

# Terminal 3 — Frontend
cd frontend
npm install
npm run dev
```

### 4. Open the app

Navigate to [http://localhost:3000](http://localhost:3000)

## API Documentation

- **OpenAPI spec**: `openapi.yaml`
- **Postman collection**: `postman_collection.json`
- **Health check**: `GET /api/health`

### Key Endpoints

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/api/auth/connect` | No | Connect wallet, get JWT |
| GET | `/api/market/search?query=` | No | Search tokens |
| GET | `/api/market/tokens/:mint` | No | Token info |
| GET | `/api/market/tokens/:mint/chart?range=` | No | OHLCV data |
| GET | `/api/market/tokens/:mint/orderbook` | No | Simulated order book |
| GET | `/api/market/top` | No | Top 5 tokens |
| POST | `/api/trades` | JWT | Execute paper trade |
| GET | `/api/portfolio` | JWT | Portfolio summary |
| GET | `/api/portfolio/trades` | JWT | Trade history |

## Admin CLI

Import tokens from CSV:

```bash
cd backend
npx tsx src/cli/import-tokens.ts path/to/tokens.csv
```

CSV format:
```csv
mint,symbol,name,decimals
So11111111111111111111111111111111111111112,SOL,Wrapped SOL,9
```

## Testing

```bash
# Backend unit tests
cd backend && npm test

# Frontend E2E tests
cd frontend && npx playwright test

# All tests
make test
```

## Makefile Commands

| Command | Description |
|---------|-------------|
| `make dev` | Start all services with Docker |
| `make test` | Run all tests |
| `make build` | Build backend and frontend |
| `make seed` | Run database seed |
| `make migrate` | Run Prisma migrations |
| `make lint` | Lint all code |
| `make clean` | Stop containers, remove volumes |
| `make install` | Install all dependencies |

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `DATABASE_URL` | PostgreSQL connection string | — |
| `REDIS_URL` | Redis connection string | `redis://localhost:6379` |
| `JWT_SECRET` | JWT signing secret | — |
| `SOLANA_TRACKER_API_KEY` | SolanaTracker API key | — |
| `DEFAULT_PAPER_BALANCE` | Starting paper USDC balance | `10000` |
| `SLIPPAGE_MIN` | Min random slippage | `0.0005` |
| `SLIPPAGE_MAX` | Max random slippage | `0.003` |
| `TRADE_FEE` | Fee percentage | `0.001` |

## Trade Execution Flow

1. Fetch latest price from Redis cache
2. Apply random slippage (0.05%–0.3%)
3. Apply configurable fee (default 0.1%)
4. Compute quantity
5. Update balances in a DB transaction
6. Insert Trade record
7. Publish Redis event
8. Broadcast via WebSocket

No blockchain transactions are executed.

## Deployment

### Frontend (Vercel)

```bash
cd frontend
npx vercel
```

Set environment variables in the Vercel dashboard.

### Backend (Docker)

```bash
docker build -t paper-trading-backend ./backend
docker run -p 4000:4000 --env-file .env paper-trading-backend
```

## License

MIT
