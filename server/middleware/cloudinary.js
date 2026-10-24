const cloudinary = require('cloudinary').v2;
const fs = require('fs');

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// Helper function to handle local file upload to Cloudinary
const uploadToCloudinary = async (filePath, folderName = 'avatars') => {
  try {
    const result = await cloudinary.uploader.upload(filePath, {
      folder: folderName,
      resource_type: 'auto', // Ensures images go to /image/upload/ and PDFs/docs handle correctly
    });
    
    // Clean up local temp file after successful upload
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }

    return result;
  } catch (error) {
    // Clean up local temp file on error too
    if (fs && fs.existsSync && filePath && fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
    throw error;
  }
};

module.exports = { cloudinary, uploadToCloudinary };