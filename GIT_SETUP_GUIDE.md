# Git Setup and Deployment Guide

## Prerequisites
Ensure Git is installed on your system:
- Download from: https://git-scm.com/downloads
- Or use package manager: `choco install git` (Windows) or `brew install git` (Mac)

## Step 1: Initialize Git Repository

Run these commands in your project directory:

```bash
# Initialize Git repository
git init

# Add all files
git add .

# Create initial commit
git commit -m "Initial commit: Rigel Business accounting system with payment portal"
```

## Step 2: Create GitHub Repository

1. Go to https://github.com/new
2. Create a new repository (e.g., "rigel-business")
3. Don't initialize with README (we already have files)

## Step 3: Connect Local to GitHub

```bash
# Add remote origin (replace YOUR_USERNAME and YOUR_REPO)
git remote add origin https://github.com/YOUR_USERNAME/rigel-business.git

# Push to GitHub
git push -u origin main
```

If you get an error about "main" vs "master":
```bash
git branch -M main
git push -u origin main
```

## Step 4: Verify Repository

```bash
# Check remote connection
git remote -v

# Check status
git status
```

## Step 5: Deploy to Vercel from GitHub

1. Go to https://vercel.com
2. Click "New Project"
3. Import from GitHub
4. Select your "rigel-business" repository
5. Configure environment variables (see below)
6. Deploy

## Environment Variables for Vercel

Add these to your Vercel project settings:

```
VITE_SUPABASE_PROJECT_ID=mzrdksmimgzkvbojjytc
VITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im16cmRrc21pbWd6a3Zib2pqeXRjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTkxMjY0ODksImV4cCI6MjA3NDcwMjQ4OX0.SQ02kj90D54NkfrJPvqo2iHLONKiP4iAnL4d3Ngiq2s
VITE_SUPABASE_URL=https://mzrdksmimgzkvbojjytc.supabase.co
```

## Alternative: Deploy from CLI

If you prefer deploying directly without GitHub:

```bash
# Install Vercel CLI
npm i -g vercel

# Deploy
vercel --prod
```

## Project Structure Overview

```
rigel-business/
├── src/                    # Source code
│   ├── components/         # React components
│   ├── pages/             # Page components
│   ├── context/           # React context
│   ├── integrations/      # API integrations
│   └── lib/               # Utilities
├── public/                # Static assets
├── vercel.json            # Vercel configuration
├── package.json           # Dependencies
└── tsconfig.json          # TypeScript config
```

## Features Included

- ✅ Complete accounting dashboard
- ✅ Payment portal with Stripe integration
- ✅ Subscription management
- ✅ PWA capabilities
- ✅ Responsive design
- ✅ Authentication with Supabase
- ✅ All major accounting modules

## Post-Deployment Checklist

- [ ] Test payment flow in sandbox mode
- [ ] Verify all dashboard modules work
- [ ] Check PWA installation
- [ ] Test responsive design
- [ ] Verify Supabase connection
- [ ] Test user authentication

## Troubleshooting

### Git Issues
- Ensure Git is installed and in PATH
- Check GitHub credentials are configured
- Verify internet connection

### Build Issues
- Run `npm install` to ensure dependencies
- Check `npm run build` works locally
- Verify environment variables are set

### Deployment Issues
- Check Vercel logs for specific errors
- Verify environment variables in Vercel dashboard
- Ensure all files are committed and pushed

## Support

If you encounter issues:
1. Check the development server: http://localhost:5174/
2. Review the deployment guide: DEPLOYMENT_GUIDE.md
3. Verify all environment variables are correct