# Railway Deployment Guide

Deploy the Solana Paper Trading app to Railway with PostgreSQL and Redis.

## Prerequisites
- Railway account (free tier works)
- GitHub repository with this code
- SolanaTracker API key (already in .env.example)

## Step 1: Prepare Repository
1. Push your code to GitHub
2. Ensure `.env.example` is in the repo (but not `.env`)

## Step 2: Deploy Backend

1. **Create Backend Service**
   - Go to Railway Dashboard → New Project
   - Connect your GitHub repository
   - Select the `backend` folder as root directory
   - Railway will detect Node.js and use `package.json`

2. **Configure Environment Variables**
   ```
   DATABASE_URL=auto-set-by-railway
   REDIS_URL=auto-set-by-railway
   SOLANA_TRACKER_API_KEY=23d194ff-5e9a-44ad-8f62-412bb645b577
   SOLANA_TRACKER_BASE_URL=https://data.solanatracker.io
   JWT_SECRET=generate_a_secure_random_string_here
   JWT_EXPIRES_IN=7d
   BACKEND_HOST=0.0.0.0
   DEFAULT_PAPER_BALANCE=10000
   SLIPPAGE_MIN=0.0005
   SLIPPAGE_MAX=0.003
   TRADE_FEE=0.001
   RATE_LIMIT_MAX=100
   RATE_LIMIT_WINDOW_MS=60000
   ```

3. **Add Database & Redis**
   - Click "Add New" → PostgreSQL
   - Click "Add New" → Redis
   - Railway will automatically set `DATABASE_URL` and `REDIS_URL`

4. **Run Database Migration**
   - Go to Deployments tab
   - Click "New Deployment"
   - After build, open the console and run:
   ```bash
   npx prisma migrate deploy
   npx prisma db seed
   ```

5. **Get Backend URL**
   - Go to Settings → Domains
   - Copy the URL (e.g., `https://your-app.railway.app`)

## Step 3: Deploy Frontend

1. **Create Frontend Service**
   - New Project → Connect same repo
   - Select `frontend` folder as root directory
   - Railway will detect Next.js

2. **Configure Environment Variables**
   ```
   NEXT_PUBLIC_BACKEND_URL=https://your-backend-url.railway.app
   NEXT_PUBLIC_WS_URL=wss://your-backend-url.railway.app
   ```

3. **Deploy**
   - Railway will build and deploy automatically
   - Get the frontend URL from Settings → Domains

## Step 4: Verify Deployment

1. **Check Backend Health**
   ```bash
   curl https://your-backend.railway.app/api/health
   ```

2. **Test Frontend**
   - Open your frontend URL
   - Connect wallet and try trading

## Troubleshooting

**Build Fails:**
- Check Railway logs for errors
- Ensure all environment variables are set
- Verify `prisma generate` runs (included in postinstall)

**Database Issues:**
- Run `npx prisma migrate deploy` in Railway console
- Check DATABASE_URL format

**Redis Issues:**
- Ensure Redis addon is added
- Verify REDIS_URL is set

**Frontend Can't Reach Backend:**
- Check NEXT_PUBLIC_BACKEND_URL is correct
- Verify backend is running and healthy
- Check CORS settings (should allow all origins)

## Cost Estimate

- Railway: Free tier (500 hours/month)
- PostgreSQL: Free tier
- Redis: Free tier
- Total: **$0/month** (within free limits)

## Production Tips

1. **Security**
   - Use a strong JWT_SECRET
   - Enable Railway's built-in SSL
   - Monitor logs for unusual activity

2. **Performance**
   - Enable Railway's auto-scaling if needed
   - Monitor Redis memory usage
   - Consider upgrading Redis for high traffic

3. **Monitoring**
   - Check Railway metrics dashboard
   - Set up alerts for errors
   - Monitor SolanaTracker API usage
