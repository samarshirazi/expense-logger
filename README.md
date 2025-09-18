# 🧾 Expense Receipt Logger

An AI-powered expense receipt processing application that automatically extracts expense data from receipt images and stores them in Google Drive.

## Features

- 📸 **Image Upload**: Drag & drop receipt images (JPEG, PNG, PDF)
- 🤖 **AI Processing**: Automatic expense data extraction using OpenAI GPT-4 Vision
- 📊 **Smart Detection**: Extracts merchant, date, amount, items, tax, tip, and payment method
- ☁️ **Google Drive Storage**: Automatically saves receipt images to Google Drive
- 💾 **Expense Logging**: Stores processed expenses in Supabase (PostgreSQL) database
- 📱 **Responsive UI**: Clean, modern interface for easy expense management

## Tech Stack

### Backend
- Node.js + Express
- OpenAI GPT-4 Vision API
- Google Drive API
- Supabase (PostgreSQL) database
- Multer for file uploads

### Frontend
- React 18
- React Dropzone
- Axios for API calls
- Modern CSS with responsive design

## Setup Instructions

### 1. Prerequisites

- Node.js (v16 or higher)
- OpenAI API key
- Google Cloud Console project with Drive API enabled
- Supabase account and project

### 2. Google Drive API Setup

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select existing one
3. Enable the Google Drive API
4. Create credentials (OAuth 2.0 Client ID)
5. Add authorized redirect URI: `http://localhost:5000/auth/google/callback`
6. Download the credentials JSON file

### 3. Supabase Setup

1. Go to [Supabase](https://supabase.com/) and create a new project
2. Wait for the project to be ready
3. Go to Project Settings → API
4. Copy your Project URL and anon public key
5. Go to SQL Editor in your Supabase dashboard
6. Run the SQL script from `supabase-setup.sql` to create the expenses table

### 4. Get Google Refresh Token

You'll need to get a refresh token for server-to-server authentication:

1. Use the Google OAuth 2.0 Playground: https://developers.google.com/oauthplayground/
2. In settings, use your own OAuth credentials
3. Authorize the Google Drive API v3 scope: `https://www.googleapis.com/auth/drive.file`
4. Exchange authorization code for tokens
5. Copy the refresh token

### 5. Installation

```bash
# Clone the repository
git clone <repository-url>
cd expense-logger

# Install root dependencies
npm install

# Install all dependencies (server + client)
npm run install-all
```

### 6. Environment Configuration

Create a `.env` file in the root directory:

```env
# AI Provider Configuration (choose one)
# OpenAI
OPENAI_API_KEY=your_openai_api_key_here
# Optional: override default OpenAI model
# OPENAI_VISION_MODEL=gpt-4o

# DeepSeek (optional alternative provider)
# DEEPSEEK_API_KEY=your_deepseek_api_key_here
# Optional: specify a DeepSeek model
# DEEPSEEK_MODEL=deepseek-chat
# For large images, install sharp (in /server) and tune optimization settings below

# Offline testing stub (no external API call)
# AI_PROVIDER=stub
# USE_STUB_AI=true

# Optional image optimization (requires sharp)
# AI_IMAGE_MAX_DIMENSION=1024
# AI_IMAGE_JPEG_QUALITY=75
# AI_MAX_BASE64_LENGTH=1200000

# Force provider (auto-detects if left unset)
# AI_PROVIDER=deepseek

# Google Drive API Configuration
GOOGLE_CLIENT_ID=your_google_client_id
GOOGLE_CLIENT_SECRET=your_google_client_secret
GOOGLE_REDIRECT_URI=http://localhost:5000/auth/google/callback
GOOGLE_REFRESH_TOKEN=your_refresh_token

# Supabase Configuration
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your_supabase_anon_key

# Server Configuration
PORT=5000
NODE_ENV=development
```

### 7. Running the Application

```bash
# Development mode (runs both server and client)
npm run dev

# Or run separately:
# Server only
npm run server

# Client only
npm run client
```

The application will be available at:
- Frontend: http://localhost:3000
- Backend API: http://localhost:5000

## API Endpoints

### POST `/api/upload-receipt`
Uploads and processes a receipt image.

**Request**: Multipart form data with `receipt` file
**Response**:
```json
{
  "success": true,
  "expenseId": "uuid",
  "expenseData": {
    "merchantName": "Store Name",
    "date": "2024-01-15",
    "totalAmount": 25.99,
    "currency": "USD",
    "category": "Food",
    "items": [...],
    "paymentMethod": "Credit Card"
  },
  "driveFileId": "google_drive_file_id"
}
```

### GET `/api/expenses`
Retrieves all expenses.

**Query Parameters**:
- `limit` (optional): Number of expenses to return (default: 50)
- `offset` (optional): Number of expenses to skip (default: 0)

## Usage

1. **Upload Receipt**: Drag and drop a receipt image or click to select a file
2. **AI Processing**: The system will automatically:
   - Extract text and data from the receipt using GPT-4 Vision
   - Parse merchant name, date, amount, items, and other details
   - Upload the receipt image to Google Drive
   - Save the expense data to the database
3. **View Results**: Review the extracted expense data and access the Google Drive link
4. **Expense History**: Browse all previously processed expenses

## File Structure

```
expense-logger/
├── package.json              # Root package.json
├── .env.example              # Environment variables template
├── README.md                 # This file
├── server/                   # Backend application
│   ├── package.json          # Server dependencies
│   ├── index.js              # Express server setup
│   ├── database/             # SQLite database files
│   ├── uploads/              # Temporary file uploads
│   └── services/             # Backend services
│       ├── aiService.js      # OpenAI integration
│       ├── googleDriveService.js  # Google Drive API
│       └── databaseService.js     # SQLite operations
└── client/                   # React frontend
    ├── package.json          # Client dependencies
    ├── public/               # Static files
    └── src/                  # React components
        ├── components/       # UI components
        ├── services/         # API services
        └── App.js            # Main application
```

## Troubleshooting

### Common Issues

1. **Google Drive API errors**: Ensure your credentials are correct and the Drive API is enabled
2. **OpenAI API errors**: Check your API key and ensure you have sufficient credits
3. **File upload errors**: Verify file size is under 10MB and format is supported
4. **Database errors**: Check write permissions in the server directory

### Error Messages

- `Missing required field`: The AI couldn't extract essential data from the receipt
- `Failed to upload to Google Drive`: Check Google API credentials
- `AI processing failed`: Verify OpenAI API key and image quality

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

## License

MIT License - see LICENSE file for details
