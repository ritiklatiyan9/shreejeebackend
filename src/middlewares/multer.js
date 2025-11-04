// middlewares/multer.js
import multer from 'multer';

// Use memory storage to get the file buffer directly
const storage = multer.memoryStorage();

// Optional: File filter to allow only images (adjust as needed)
const fileFilter = (req, file, cb) => {
  // Example: Allow only images
  const allowedTypes = /jpeg|jpg|png|webp/;
  const extname = allowedTypes.test(file.originalname.toLowerCase());
  const mimetype = allowedTypes.test(file.mimetype);

  if (mimetype && extname) {
    return cb(null, true);
  } else {
    return cb(new Error('Only image files (jpeg, jpg, png, webp) are allowed!'), false);
  }
};

// Multer configuration
export const upload = multer({
  storage: storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // Limit file size to 5MB
  fileFilter: fileFilter,
});