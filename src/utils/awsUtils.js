// utils/s3Utils.js - Updated for AWS SDK v3
import { S3Client, PutObjectCommand, DeleteObjectCommand, HeadObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { v4 as uuidv4 } from 'uuid';
import path from 'path';

// Configure AWS S3 Client
const s3Client = new S3Client({
  region:'ap-south-1',
  credentials: {
    accessKeyId: 'AKIAUUASISUL6JRSMANZ',
    secretAccessKey: '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',
  },
});

// Get the bucket name from environment variable
const BUCKET_NAME = 'shreejeeprojectbucket';
console.log("S3 Utils - BUCKET_NAME constant:", BUCKET_NAME); // Debug log

/**
 * Upload file to S3
 * @param {Buffer} fileBuffer - File buffer
 * @param {string} fileName - Original file name
 * @param {string} mimeType - File mime type
 * @param {string} folder - Folder in S3 bucket (optional)
 * @returns {Promise<Object>} - Upload result with URL and key
 */
export const uploadToS3 = async (fileBuffer, fileName, mimeType, folder = 'uploads') => {
  try {
    // Check if BUCKET_NAME is available
    if (!BUCKET_NAME) {
      console.error('S3 Upload Error: BUCKET_NAME is not defined in environment variables.');
      throw new Error('Configuration Error: AWS_S3_BUCKET_NAME is missing. Cannot upload file.');
    }

    // Additional validation for inputs
    if (!fileBuffer || !Buffer.isBuffer(fileBuffer) || fileBuffer.length === 0) {
      throw new Error('File buffer is required and must be a non-empty Buffer');
    }

    if (!fileName || typeof fileName !== 'string') {
      throw new Error('File name is required and must be a string');
    }

    if (!mimeType || typeof mimeType !== 'string') {
      throw new Error('Mime type is required and must be a string');
    }

    // Generate unique filename
    const fileExtension = path.extname(fileName);
    const uniqueFileName = `${uuidv4()}${fileExtension}`;
    const key = folder ? `${folder}/${uniqueFileName}` : uniqueFileName;

    console.log(`Attempting to upload to S3: Bucket="${BUCKET_NAME}", Key="${key}"`); // Debug log

    const command = new PutObjectCommand({
      Bucket: BUCKET_NAME, // Use the BUCKET_NAME constant here
      Key: key,
      Body: fileBuffer,
      ContentType: mimeType,
    });

    const result = await s3Client.send(command);
    
    // Construct the URL manually since v3 doesn't return Location
    const url = `https://${BUCKET_NAME}.s3.${process.env.AWS_REGION}.amazonaws.com/${key}`;
    
    console.log(`Successfully uploaded to S3: ${url}`); // Debug log
    return {
      success: true,
      url: url,
      key: key,
      bucket: BUCKET_NAME,
      etag: result.ETag
    };
  } catch (error) {
    console.error('S3 Upload Error (Inner Catch):', error);
    // Ensure error message is always a string
    const errorMessage = error.message || 'Unknown error occurred during S3 upload';
    throw new Error(`Failed to upload file to S3: ${errorMessage}`);
  }
};

// ... (rest of the functions remain the same) ...

/**
 * Delete file from S3
 * @param {string} key - S3 object key
 * @returns {Promise<Object>} - Delete result
 */
export const deleteFromS3 = async (key) => {
  try {
    if (!BUCKET_NAME) {
      throw new Error('Configuration Error: AWS_S3_BUCKET_NAME is missing. Cannot delete file.');
    }
    const command = new DeleteObjectCommand({
      Bucket: BUCKET_NAME,
      Key: key
    });

    await s3Client.send(command);
    
    return {
      success: true,
      message: 'File deleted successfully'
    };
  } catch (error) {
    console.error('S3 Delete Error:', error);
    throw new Error(`Failed to delete file from S3: ${error.message}`);
  }
};

/**
 * Get signed URL for private file access
 * @param {string} key - S3 object key
 * @param {number} expiresIn - URL expiration in seconds (default: 1 hour)
 * @returns {Promise<string>} - Signed URL
 */
export const getSignedUrlForS3 = async (key, expiresIn = 3600) => {
  try {
    if (!BUCKET_NAME) {
      throw new Error('Configuration Error: AWS_S3_BUCKET_NAME is missing. Cannot generate signed URL.');
    }
    const command = new GetObjectCommand({
      Bucket: BUCKET_NAME,
      Key: key,
    });

    const signedUrl = await getSignedUrl(s3Client, command, { expiresIn });
    return signedUrl;
  } catch (error) {
    console.error('S3 Signed URL Error:', error);
    throw new Error(`Failed to generate signed URL: ${error.message}`);
  }
};

/**
 * Check if file exists in S3
 * @param {string} key - S3 object key
 * @returns {Promise<boolean>} - File exists
 */
export const fileExists = async (key) => {
  try {
    if (!BUCKET_NAME) {
      throw new Error('Configuration Error: AWS_S3_BUCKET_NAME is missing. Cannot check file existence.');
    }
    const command = new HeadObjectCommand({
      Bucket: BUCKET_NAME,
      Key: key
    });

    await s3Client.send(command);
    return true;
  } catch (error) {
    if (error.name === 'NotFound' || error.$metadata?.httpStatusCode === 404) {
      return false;
    }
    throw error;
  }
};

/**
 * Upload multiple files to S3
 * @param {Array} files - Array of file objects {buffer, fileName, mimeType}
 * @param {string} folder - Folder in S3 bucket
 * @returns {Promise<Array>} - Array of upload results
 */
export const uploadMultipleToS3 = async (files, folder = 'uploads') => {
  try {
    const uploadPromises = files.map(file => 
      uploadToS3(file.buffer, file.fileName, file.mimeType, folder)
    );
    
    const results = await Promise.all(uploadPromises);
    return results;
  } catch (error) {
    console.error('S3 Multiple Upload Error:', error);
    throw new Error(`Failed to upload multiple files: ${error.message}`);
  }
};

/**
 * Extract S3 key from URL
 * @param {string} url - S3 URL
 * @returns {string} - S3 key
 */
export const extractKeyFromUrl = (url) => {
  try {
    const urlObj = new URL(url);
    // Remove leading slash
    return urlObj.pathname.substring(1);
  } catch (error) {
    console.error('URL parsing error:', error);
    return null;
  }
};

/**
 * Upload hotel photos with validation
 * @param {Array} files - Array of file objects from multer
 * @returns {Promise<Array>} - Array of photo URLs
 */
export const uploadHotelPhotos = async (files) => {
  if (!files || files.length === 0) {
    return [];
  }

  // Validate file types and sizes
  const validFiles = files.filter(file => {
    const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
    return allowedTypes.includes(file.mimetype) && 
           file.buffer && 
           Buffer.isBuffer(file.buffer) && 
           file.buffer.length > 0;
  });

  if (validFiles.length !== files.length) {
    throw new Error('Some files are not valid image types or have empty content');
  }

  const fileData = validFiles.map(file => ({
    buffer: file.buffer,
    fileName: file.originalname,
    mimeType: file.mimetype
  }));

  const uploadResults = await uploadMultipleToS3(fileData, 'hotels');
  return uploadResults.map(result => result.url);
};

/**
 * Upload activity photos with validation
 * @param {Array} files - Array of file objects from multer
 * @returns {Promise<Array>} - Array of photo URLs
 */
export const uploadActivityPhotos = async (files) => {
  if (!files || files.length === 0) {
    return [];
  }

  // Validate file types and sizes
  const validFiles = files.filter(file => {
    const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
    return allowedTypes.includes(file.mimetype) && 
           file.buffer && 
           Buffer.isBuffer(file.buffer) && 
           file.buffer.length > 0;
  });

  if (validFiles.length !== files.length) {
    throw new Error('Some files are not valid image types or have empty content');
  }

  const fileData = validFiles.map(file => ({
    buffer: file.buffer,
    fileName: file.originalname,
    mimeType: file.mimetype
  }));

  const uploadResults = await uploadMultipleToS3(fileData, 'activities');
  return uploadResults.map(result => result.url);
};