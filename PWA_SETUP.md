# PWA Setup Instructions for Rigel Business

## Overview
Rigel Business now includes full Progressive Web App (PWA) support with offline functionality, home screen installation, and background sync.

## Features Added

### ✅ Web App Manifest
- App name, description, and theme colors
- Multiple icon sizes for different devices
- Standalone display mode for app-like experience
- Shortcuts for quick access to common features

### ✅ Service Worker
- Offline caching of static assets
- Background sync for offline transactions
- Fallback offline page when network is unavailable
- Automatic updates when new versions are available

### ✅ Install Prompt
- Automatic prompt after 3 seconds on supported devices
- Manual install button available in the UI
- Customizable installation experience

### ✅ HTTPS Ready
- Configured for secure deployment
- Service worker registration with proper security

## Icon Generation

To complete the PWA setup, you need to generate icons from the SVG template:

1. Open `/public/icons/icon.svg` in a browser or image editor
2. Export/save as PNG at these sizes:
   - 72x72, 96x96, 128x128, 144x144, 152x152, 192x192, 384x384, 512x512
3. Save them as `icon-{size}x{size}.png` in `/public/icons/`
4. Also create `transaction.png` and `reports.png` for shortcuts (192x192)

## Testing PWA

### Local Development
```bash
npm run dev
```

### Production Build
```bash
npm run build
npm run preview
```

### PWA Testing Checklist
- [ ] App loads offline
- [ ] Install prompt appears on mobile
- [ ] App can be installed to home screen
- [ ] Standalone mode works (no browser UI)
- [ ] Theme color matches app design
- [ ] Shortcuts work correctly

## Deployment Notes

### Vercel Deployment
The app is configured for Vercel deployment. The PWA will work automatically when deployed.

### HTTPS Requirement
PWAs require HTTPS in production. Vercel provides SSL certificates automatically.

### Service Worker Updates
The service worker will automatically update when:
- New version is deployed
- User refreshes the app
- Background sync triggers

## Browser Compatibility

### Supported Browsers
- Chrome/Edge (Desktop & Mobile)
- Firefox (Desktop & Mobile)
- Safari (iOS 11.3+)
- Samsung Internet
- Opera

### Install Requirements
- HTTPS connection (or localhost for development)
- User interaction for install prompt
- Valid manifest.json
- Active service worker

## Troubleshooting

### Install Prompt Not Showing
1. Check if app is served over HTTPS
2. Verify manifest.json is accessible
3. Ensure service worker is registered
4. Check browser console for errors

### Offline Not Working
1. Verify service worker is registered
2. Check cache storage in browser dev tools
3. Ensure offline.html exists
4. Test in incognito mode

### Icons Not Displaying
1. Verify all icon files exist in `/public/icons/`
2. Check file permissions
3. Test different icon sizes
4. Clear browser cache

## Customization

### Theme Colors
Edit the theme colors in:
- `/public/manifest.json`
- `vite.config.ts` (PWA plugin config)
- `/index.html` (meta tags)

### Install Prompt Timing
Modify the delay in `/src/components/PWA/InstallPrompt.tsx`:
```typescript
const timer = setTimeout(() => {
  setShowPrompt(true);
}, 3000); // Change 3000 to desired milliseconds
```

### Offline Message
Customize the offline page in `/public/offline.html`

## API Integration

The PWA includes background sync for offline functionality:
- Offline transactions are queued
- Sync occurs when connection is restored
- Automatic retry on sync failures

## Performance

### Bundle Size
Consider code splitting for large chunks if needed. Current build shows some large chunks that could be optimized.

### Caching Strategy
- Static assets: Cache first
- API calls: Network first with fallback
- Images: Cache first with expiration

## Security

### Content Security Policy
Consider adding CSP headers for production deployment.

### HTTPS Enforcement
Ensure all external resources use HTTPS to prevent mixed content issues.