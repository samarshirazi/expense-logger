const { google } = require('googleapis');
const path = require('path');

let driveClient = null;

function initializeDriveClient() {
  if (driveClient) {
    return driveClient;
  }

  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI
  );

  oauth2Client.setCredentials({
    refresh_token: process.env.GOOGLE_REFRESH_TOKEN
  });

  driveClient = google.drive({ version: 'v3', auth: oauth2Client });
  return driveClient;
}

async function createReceiptFolder() {
  const drive = initializeDriveClient();

  try {
    const response = await drive.files.list({
      q: "name='Expense Receipts' and mimeType='application/vnd.google-apps.folder'",
      fields: 'files(id, name)'
    });

    if (response.data.files.length > 0) {
      return response.data.files[0].id;
    }

    const folderMetadata = {
      name: 'Expense Receipts',
      mimeType: 'application/vnd.google-apps.folder'
    };

    const folder = await drive.files.create({
      resource: folderMetadata,
      fields: 'id'
    });

    console.log('Created Expense Receipts folder:', folder.data.id);
    return folder.data.id;

  } catch (error) {
    console.error('Error creating/finding folder:', error);
    throw error;
  }
}

async function uploadToGoogleDrive(fileBuffer, originalFilename, mimeType) {
  try {
    const drive = initializeDriveClient();
    const folderId = await createReceiptFolder();

    const fileMetadata = {
      name: `${Date.now()}-${originalFilename}`,
      parents: [folderId]
    };

    // Create a readable stream from buffer
    const { Readable } = require('stream');
    const bufferStream = new Readable();
    bufferStream.push(fileBuffer);
    bufferStream.push(null);

    const media = {
      mimeType: mimeType || getMimeTypeFromFilename(originalFilename),
      body: bufferStream
    };

    const response = await drive.files.create({
      resource: fileMetadata,
      media: media,
      fields: 'id, name, webViewLink'
    });

    console.log('File uploaded to Google Drive:', response.data.id);

    await drive.permissions.create({
      fileId: response.data.id,
      resource: {
        role: 'reader',
        type: 'anyone'
      }
    });

    return response.data.id;

  } catch (error) {
    console.error('Google Drive upload error:', error);
    throw new Error(`Failed to upload to Google Drive: ${error.message}`);
  }
}

async function getFileLink(fileId) {
  try {
    const drive = initializeDriveClient();

    const response = await drive.files.get({
      fileId: fileId,
      fields: 'webViewLink, webContentLink'
    });

    return {
      viewLink: response.data.webViewLink,
      downloadLink: response.data.webContentLink
    };

  } catch (error) {
    console.error('Error getting file link:', error);
    throw error;
  }
}

function getMimeTypeFromFilename(filename) {
  const ext = path.extname(filename).toLowerCase();
  switch (ext) {
    case '.jpg':
    case '.jpeg':
      return 'image/jpeg';
    case '.png':
      return 'image/png';
    case '.pdf':
      return 'application/pdf';
    default:
      return 'application/octet-stream';
  }
}

async function deleteFromGoogleDrive(fileId) {
  try {
    if (!fileId || fileId === 'drive_upload_failed') {
      console.log('No Google Drive file to delete (no file ID or upload failed)');
      return true; // Not an error condition
    }

    const drive = initializeDriveClient();

    // First check if file exists
    try {
      await drive.files.get({ fileId: fileId });
    } catch (error) {
      if (error.code === 404) {
        console.log('Google Drive file not found (already deleted?):', fileId);
        return true; // File doesn't exist, consider it successfully deleted
      }
      throw error;
    }

    // Delete the file
    await drive.files.delete({ fileId: fileId });
    console.log('✅ File deleted from Google Drive:', fileId);
    return true;

  } catch (error) {
    console.error('❌ Google Drive deletion error:', error.message);
    throw new Error(`Failed to delete from Google Drive: ${error.message}`);
  }
}

async function testGoogleDriveConnection() {
  try {
    const drive = initializeDriveClient();
    const response = await drive.about.get({ fields: 'user' });
    console.log('Google Drive connection successful. User:', response.data.user.emailAddress);
    return true;
  } catch (error) {
    console.error('Google Drive connection failed:', error.message);
    return false;
  }
}

module.exports = {
  uploadToGoogleDrive,
  getFileLink,
  deleteFromGoogleDrive,
  testGoogleDriveConnection
};