// utils/awsUtils.js
import AWS from "aws-sdk";

// Configure AWS
AWS.config.update({
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  region: process.env.AWS_REGION,
});

const s3 = new AWS.S3();

// Upload single file to S3
export const uploadOnS3 = async (fileBuffer, fileName, folderPath = "uploads") => {
  try {
    const params = {
      Bucket: process.env.AWS_S3_BUCKET_NAME,
      Key: `${folderPath}/${Date.now()}_${fileName}`,
      Body: fileBuffer,
      ContentType: file.mimetype,
      ACL: "public-read", // Make file publicly accessible
    };

    const uploadResult = await s3.upload(params).promise();
    return uploadResult;
  } catch (error) {
    console.error("Error uploading to S3:", error);
    throw new Error("File upload failed");
  }
};

// Upload multiple files to S3
export const uploadMultipleOnS3 = async (files, folderPath = "uploads") => {
  try {
    const uploadPromises = files.map(file => {
      return uploadOnS3(file.buffer, file.originalname, folderPath);
    });

    const results = await Promise.all(uploadPromises);
    return results.map(result => result.Location);
  } catch (error) {
    console.error("Error uploading multiple files to S3:", error);
    throw new Error("Multiple file upload failed");
  }
};

// Delete file from S3
export const deleteFromS3 = async (fileKey) => {
  try {
    const params = {
      Bucket: process.env.AWS_S3_BUCKET_NAME,
      Key: fileKey,
    };

    await s3.deleteObject(params).promise();
    return true;
  } catch (error) {
    console.error("Error deleting from S3:", error);
    throw new Error("File deletion failed");
  }
};

// Delete multiple files from S3
export const deleteMultipleFromS3 = async (fileKeys) => {
  try {
    const deletePromises = fileKeys.map(key => {
      return deleteFromS3(key);
    });

    await Promise.all(deletePromises);
    return true;
  } catch (error) {
    console.error("Error deleting multiple files from S3:", error);
    throw new Error("Multiple file deletion failed");
  }
};

// Generate presigned URL for file access
export const generatePresignedUrl = async (fileKey, expiresIn = 3600) => {
  try {
    const params = {
      Bucket: process.env.AWS_S3_BUCKET_NAME,
      Key: fileKey,
      Expires: expiresIn,
    };

    const url = await s3.getSignedUrlPromise("getObject", params);
    return url;
  } catch (error) {
    console.error("Error generating presigned URL:", error);
    throw new Error("Presigned URL generation failed");
  }
};