# 🚀 Vercel Deployment Guide

## Quick Deploy to Vercel

### 1. **Deploy from GitHub**
1. Go to [Vercel Dashboard](https://vercel.com/dashboard)
2. Click **"New Project"**
3. Import from GitHub: `samarshirazi/expense-logger`
4. Configure project settings:
   - **Framework Preset**: Other
   - **Root Directory**: ./
   - **Build Command**: `npm run vercel-build`
   - **Output Directory**: `client/build`

### 2. **Environment Variables**
In Vercel dashboard, add these environment variables:

```env
OPENAI_API_KEY=your_openai_api_key_from_local_env

GOOGLE_CLIENT_ID=your_google_client_id_from_local_env

GOOGLE_CLIENT_SECRET=your_google_client_secret_from_local_env

GOOGLE_REDIRECT_URI=https://your-app-name.vercel.app/auth/google/callback

GOOGLE_REFRESH_TOKEN=your_google_refresh_token_from_local_env

SUPABASE_URL=https://opyzkwddmmvbwfjydpyb.supabase.co

SUPABASE_ANON_KEY=your_supabase_anon_key_from_local_env

NODE_ENV=production
```

**Note**: Copy the actual values from your local `.env` file to Vercel dashboard.

### 3. **Update Google OAuth Settings**
Once deployed, update your Google Cloud Console OAuth settings:

**Authorized JavaScript Origins:**
```
https://your-app-name.vercel.app
```

**Authorized Redirect URIs:**
```
https://your-app-name.vercel.app/auth/google/callback
```

### 4. **Deploy**
Click **"Deploy"** in Vercel dashboard.

## 🎯 **Expected Result**

Your expense receipt app will be live at:
- **URL**: `https://your-app-name.vercel.app`
- **API**: `https://your-app-name.vercel.app/api`

## ✅ **Features Available**
- ✅ AI-powered receipt processing
- ✅ Google Drive storage
- ✅ Supabase database
- ✅ Responsive web interface
- ✅ Real-time expense tracking

## 🔧 **Troubleshooting**

### Common Issues:
1. **Build Fails**: Check build logs in Vercel dashboard
2. **API Errors**: Verify environment variables are set correctly
3. **Google Auth Fails**: Update redirect URIs with actual Vercel URL
4. **Database Issues**: Verify Supabase connection and table setup

### Debug Steps:
1. Check Vercel function logs
2. Test API endpoints: `/api/health`
3. Verify environment variables in Vercel settings
4. Check browser console for frontend errors

## 🌟 **Post-Deployment**

After successful deployment:
1. **Test Receipt Upload**: Try uploading a receipt image
2. **Verify AI Processing**: Check expense data extraction
3. **Check Google Drive**: Confirm receipt storage
4. **Test Database**: Verify expenses are saved to Supabase

Your AI-powered expense receipt logger is now live and ready for your clients! 🎉