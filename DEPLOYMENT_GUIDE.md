# Deployment Guide for Rigel Business

## Vercel Deployment Steps

Since automated deployment tools are not available in this environment, please follow these manual steps:

### Prerequisites
1. Node.js installed (v18 or higher)
2. Vercel CLI installed globally: `npm i -g vercel`
3. Vercel account (sign up at https://vercel.com)

### Step 1: Build the Project
```bash
npm run build
```

### Step 2: Deploy to Vercel
```bash
vercel
```

### Step 3: Configure Environment Variables
When prompted or in your Vercel dashboard, set these environment variables:

```
VITE_SUPABASE_PROJECT_ID=mzrdksmimgzkvbojjytc
VITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im16cmRrc21pbWd6a3Zib2pqeXRjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTkxMjY0ODksImV4cCI6MjA3NDcwMjQ4OX0.SQ02kj90D54NkfrJPvqo2iHLONKiP4iAnL4d3Ngiq2s
VITE_SUPABASE_URL=https://mzrdksmimgzkvbojjytc.supabase.co
```

### Step 4: Alternative - GitHub Integration
1. Push your code to GitHub
2. Connect your GitHub repository to Vercel
3. Vercel will automatically deploy on each push

### Features Deployed
- ✅ Complete accounting dashboard
- ✅ Payment portal with Stripe integration
- ✅ Subscription management
- ✅ PWA capabilities
- ✅ Responsive design
- ✅ Authentication system

### Post-Deployment
- Test the payment flow in sandbox mode
- Verify all routes are working
- Check that Supabase connection is established

### Troubleshooting
If build fails:
1. Check TypeScript errors: `npx tsc --noEmit`
2. Verify all dependencies are installed: `npm install`
3. Check for missing environment variables

### Current Status
- Development server: ✅ Running on http://localhost:5174/
- Build status: ⏳ Ready for deployment
- Environment: Configured for Vercel