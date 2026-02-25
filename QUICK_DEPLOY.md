# Quick Deploy Guide 🚀

## Step 1: Git Setup (Run Locally)
```bash
# Double-click setup-git.bat or run these commands:
git init
git add .
git commit -m "Initial commit: Rigel Business with payment portal"
```

## Step 2: GitHub
1. Create repo: https://github.com/new
2. Name it: `rigel-business`
3. Don't add README (we have one)

## Step 3: Connect & Push
```bash
git remote add origin https://github.com/YOUR_USERNAME/rigel-business.git
git push -u origin main
```

## Step 4: Vercel Deploy
1. Go to: https://vercel.com
2. Click "New Project"
3. Import from GitHub
4. Select your `rigel-business` repo
5. Environment variables are pre-configured in `vercel.json`
6. Deploy! 🎉

## Alternative: Direct Vercel Deploy
```bash
npm i -g vercel
vercel --prod
```

## Environment Variables (Already Set)
```
VITE_SUPABASE_PROJECT_ID=mzrdksmimgzkvbojjytc
VITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im16cmRrc21pbWd6a3Zib2pqeXRjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTkxMjY0ODksImV4cCI6MjA3NDcwMjQ4OX0.SQ02kj90D54NkfrJPvqo2iHLONKiP4iAnL4d3Ngiq2s
VITE_SUPABASE_URL=https://mzrdksmimgzkvbojjytc.supabase.co
```

## What's Included ✅
- Complete accounting dashboard
- Payment portal with Stripe
- Subscription management
- PWA (installable app)
- Responsive design
- User authentication
- All accounting modules

## Test After Deploy ✅
- Payment flow (sandbox mode)
- All dashboard modules
- Mobile responsiveness
- PWA installation
- User login/signup

## Need Help? 📞
- Dev server running: http://localhost:5174/
- Full guides: `GIT_SETUP_GUIDE.md` & `DEPLOYMENT_GUIDE.md`
- Build script: `npm run deploy`

**Ready to deploy! 🚀**