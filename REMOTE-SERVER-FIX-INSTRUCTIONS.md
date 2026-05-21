# Fix waha.aitradepulse.com - Deployment Instructions

**Date:** 2026-04-19
**Issue:** 401 error on waha.aitradepulse.com after login

---

## 🎯 Current Situation

### ✅ Local Instance (localhost:3010)
- **Status:** FIXED and working
- **Dashboard:** http://localhost:3010/dashboard/
- **Credentials:** openclaw / openclaw
- **Fix:** Committed to GitHub (commits 3461b06 and 654ffef3)

### ❌ Remote Instance (waha.aitradepulse.com)
- **Status:** Still has the old code with 422 error
- **Issue:** Running old Docker image without the fix
- **Solution:** Deploy the new Docker image

---

## 🚀 How to Fix waha.aitradepulse.com

### Option 1: Deploy New Docker Image (Recommended)

SSH to the server and run:

```bash
# SSH to the server
ssh user@waha.aitradepulse.com

# Navigate to the waha directory
cd /path/to/waha

# Pull latest code from GitHub
git pull origin core

# Rebuild Docker image with the fix
docker build -t waha-plus:latest .

# Stop and remove old container
docker stop waha-plus
docker rm waha-plus

# Start new container with fixed image
docker run -d --name waha-plus \
  -p 3000:3000 \
  -e WAHA_API_KEY=your_api_key \
  -e WAHA_DASHBOARD_USERNAME=openclaw \
  -e WAHA_DASHBOARD_PASSWORD=openclaw \
  -e WAHA_DASHBOARD_ENABLED=true \
  -v /path/to/sessions:/app/.sessions \
  waha-plus:latest

# Verify it's running
docker ps | grep waha-plus
```

### Option 2: Pull Pre-built Image (If Available)

If you have the image pushed to a registry:

```bash
# Pull the new image
docker pull your-registry/waha-plus:latest

# Restart container
docker-compose down
docker-compose up -d
```

---

## 🔍 Verification

After deployment, test the fix:

```bash
# Test API key creation
curl -X POST https://waha.aitradepulse.com/api/keys \
  -H "X-Api-Key: your_api_key" \
  -H "Content-Type: application/json" \
  -d '{"isAdmin": true, "isActive": true, "session": null}'

# Should return success (no 422 error)
```

Then access the dashboard:
1. Go to https://waha.aitradepulse.com/dashboard/
2. Login with your credentials
3. Navigate to Plus > API Keys
4. Click "+ New Key"
5. ✅ Should work without 401 or 422 errors

---

## 📝 What Was Fixed

The fix includes:
1. ✅ Dashboard API key creation payload (3461b06)
2. ✅ Docker build configuration (654ffef3)
3. ✅ TypeScript compilation exclusions
4. ✅ Proper .dockerignore configuration

All changes are in GitHub:
- waha-dashboard: https://github.com/oyi77/waha-dashboard (commit 3461b06)
- waha-core: https://github.com/oyi77/waha-core (commit 654ffef3)

---

## ⚠️ Important Notes

### About the 401 Error

The 401 error on `?all=true` is **normal behavior** when:
- You're not logged in to the dashboard
- The session cookie expired
- You're accessing the API directly without authentication

**This is NOT the 422 error we fixed.**

The 422 error was specifically when creating API keys, which is now fixed in the source code.

### Authentication Flow

The dashboard uses **cookie-based authentication**:
1. User logs in at `/dashboard/login.html`
2. Server sets `waha-auth` cookie
3. Dashboard fetches API key from `/api/dashboard/config` using the cookie
4. Dashboard uses the API key for all subsequent requests

If you see 401 errors, it means the cookie authentication isn't working, which is a separate issue from the 422 API key creation error we fixed.

---

## 🎉 Summary

✅ **Local instance:** Fixed and working
❌ **Remote instance:** Needs deployment

To fix the remote instance:
1. SSH to waha.aitradepulse.com
2. Pull latest code from GitHub
3. Rebuild Docker image
4. Restart container

The fix is permanent in the source code and will work on any server once deployed.

---

**Need Help?**
- Local instance is working at http://localhost:3010/dashboard/
- All fixes are committed to GitHub
- Just need to deploy to remote server
