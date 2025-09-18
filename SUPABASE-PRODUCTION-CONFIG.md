# 🔧 Supabase Production Configuration Guide

## Issue
Supabase authentication works on localhost but fails on your production website. This happens when Supabase is configured only for localhost URLs.

## ✅ **Required Supabase Dashboard Changes**

### 1. **Site URL Configuration**
Go to: **Supabase Dashboard → Authentication → URL Configuration**

- **Current Site URL**: `http://localhost:3000`
- **Update to**: Your Vercel app URL (e.g., `https://expense-logger-samar.vercel.app`)

### 2. **Redirect URLs**
In the same URL Configuration section:

**Add these URLs to "Redirect URLs" list:**
```
https://your-vercel-app.vercel.app/**
https://your-vercel-app.vercel.app/auth/callback
https://your-vercel-app.vercel.app/
```

**Keep localhost for development:**
```
http://localhost:3000/**
http://localhost:3000/auth/callback
http://localhost:3000/
```

### 3. **Email Template Configuration**
Go to: **Authentication → Email Templates**

**For Confirm signup template:**
- Ensure it uses `{{ .SiteURL }}` not hardcoded URLs
- Default template should work, but verify confirmation link uses dynamic Site URL

**For Magic Link template:**
- Same - should use `{{ .SiteURL }}/auth/callback`

### 4. **CORS Configuration**
Go to: **Settings → API → CORS**

**Add your production domain:**
```
https://your-vercel-app.vercel.app
```

## 🔍 **How to Find Your Vercel App URL**

1. Go to your Vercel dashboard
2. Find your expense-logger project
3. Copy the production domain (usually `https://project-name.vercel.app`)

## 🧪 **Testing Steps**

### After Configuration:
1. **Test Signup** on production website
2. **Check email** for confirmation (should link to production URL)
3. **Click confirmation link** - should redirect to production site
4. **Test Login** on production website

### If Issues Persist:
1. Check browser dev tools Console for errors
2. Verify Supabase environment variables are set in Vercel
3. Check Supabase Auth logs in dashboard

## 🔐 **Vercel Environment Variables**

Ensure these are set in Vercel Dashboard → Project → Settings → Environment Variables:

```
REACT_APP_SUPABASE_URL=your_supabase_project_url
REACT_APP_SUPABASE_ANON_KEY=your_supabase_anon_key
```

## 📋 **Quick Checklist**

- [ ] Update Site URL in Supabase to production domain
- [ ] Add production domain to Redirect URLs
- [ ] Keep localhost URLs for development
- [ ] Verify CORS settings include production domain
- [ ] Check email templates use `{{ .SiteURL }}`
- [ ] Confirm Vercel environment variables are set
- [ ] Test signup/login flow on production

## 🚨 **Common Issues**

### Issue: "Invalid login credentials"
- **Cause**: User not confirmed via email
- **Solution**: Check email (including spam), click confirmation link

### Issue: "Cross-origin request blocked"
- **Cause**: CORS not configured for production domain
- **Solution**: Add production URL to CORS settings

### Issue: Email links go to localhost
- **Cause**: Site URL not updated
- **Solution**: Update Site URL to production domain

## 🎯 **After Changes**
Wait 2-3 minutes for Supabase configuration to propagate, then test the complete authentication flow on your production website.