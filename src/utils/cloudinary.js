import fs from 'fs'; // Import the fs module
import cloudinary from 'cloudinary'; // Ensure you have cloudinary properly imported

const uploadonCloudinary = async (localFilePath) => {
  try {
    if (!localFilePath) return null;
    // Upload the file to Cloudinary
    const response = await cloudinary.uploader.upload(localFilePath, {
      resource_type: "auto",
    });
    if (!response) {
      console.log("Error uploading file to Cloudinary");
      return null;
    }

    fs.unlinkSync(localFilePath); // Delete the local file after upload
    return response;
  } catch (error) {
    fs.unlinkSync(localFilePath); // Delete the local file in case of error
    console.error("Error uploading to Cloudinary:", error);
    return null;
  }
};

export { uploadonCloudinary };
