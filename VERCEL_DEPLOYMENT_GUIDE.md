# Vercel Deployment Instructions

## Step 1: Install Vercel CLI (if not already installed)
```bash
npm i -g vercel
```

## Step 2: Login to Vercel
```bash
vercel login
```

## Step 3: Deploy to Vercel
From your project root directory, run:
```bash
vercel
```

## Step 4: Configure Environment Variables
During deployment, you'll need to set these environment variables:
- `VITE_SUPABASE_URL`: Your Supabase project URL
- `VITE_SUPABASE_ANON_KEY`: Your Supabase anon key

Or you can set them in Vercel dashboard after deployment:
1. Go to your Vercel dashboard
2. Select your project
3. Go to Settings > Environment Variables
4. Add the variables above

## Step 5: Alternative - Deploy via Git
1. Push your code to GitHub
2. Go to https://vercel.com
3. Click "New Project"
4. Import your GitHub repository
5. Configure environment variables
6. Deploy

## Important Notes:
- Make sure your Supabase project is properly configured
- The vercel.json file is already set up for SPA routing
- Build command: `npm run build`
- Output directory: `dist`

## Environment Variables Required:
```
VITE_SUPABASE_URL=your_supabase_project_url
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
```