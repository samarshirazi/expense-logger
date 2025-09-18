# 🚀 Quick Setup Guide

Your expense receipt app is ready! Follow these steps to complete the setup:

## ✅ **Already Done:**
- ✅ Supabase project connected
- ✅ Dependencies installed
- ✅ Database connection tested

## 🎯 **Next Steps:**

### 1. **Set Up Database Table**
Go to your Supabase dashboard: https://supabase.com/dashboard/project/opyzkwddmmvbwfjydpyb

1. Click **"SQL Editor"** in the left sidebar
2. Click **"New Query"**
3. Copy and paste the entire content from `supabase-setup.sql`
4. Click **"Run"** to execute

This creates your `expenses` table with proper structure.

### 2. **Add API Keys to .env**
Edit the `.env` file and add:

```env
# OpenAI (default)
# Get from https://platform.openai.com/api-keys
OPENAI_API_KEY=sk-your-actual-openai-key

# Or use DeepSeek instead (ensure large images are optimized)
# Get from https://platform.deepseek.com/
# DEEPSEEK_API_KEY=ds-your-deepseek-key
# AI_PROVIDER=deepseek

# Need to work offline? Enable the stub provider (returns sample data)
# AI_PROVIDER=stub
# USE_STUB_AI=true

# Optional: automatically downscale/compress uploaded images (requires `npm install sharp` in /server)
# AI_IMAGE_MAX_DIMENSION=1024
# AI_IMAGE_JPEG_QUALITY=75
# AI_MAX_BASE64_LENGTH=1200000

# Get from Google Cloud Console
GOOGLE_CLIENT_ID=your-google-client-id
GOOGLE_CLIENT_SECRET=your-google-client-secret
GOOGLE_REFRESH_TOKEN=your-google-refresh-token
```

### 3. **Start the Application**
```bash
# From the root directory
npm run dev
```

This starts both:
- Backend server: http://localhost:5000
- Frontend app: http://localhost:3000

## 🧪 **Test the App:**

1. **Upload a receipt** (drag & drop an image)
2. **AI will extract** expense data automatically
3. **Image saves** to Google Drive
4. **Data stores** in Supabase database

## 📋 **Quick API Key Setup:**

### OpenAI API Key:
1. Go to https://platform.openai.com/api-keys
2. Click "Create new secret key"
3. Copy the key (starts with `sk-`)

### Google Drive API:
1. Go to https://console.cloud.google.com/
2. Create/select project
3. Enable Google Drive API
4. Create OAuth 2.0 credentials
5. Use OAuth Playground to get refresh token

## 🎉 **You're Ready!**

Once you add the API keys, your expense receipt app will be fully functional with:
- AI-powered receipt processing
- Google Drive storage
- Supabase database
- Modern React interface

Need help? Check the full README.md for detailed instructions!
