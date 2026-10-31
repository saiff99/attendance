/**
 * Image Optimization Utilities for Classroom Batch Attendance
 * 
 * Automatically scales down and compresses high-resolution smartphone/camera photos
 * (12MP - 48MP) directly on the client canvas before transmission.
 * 
 * Architectural Benefits:
 * 1. Prevents Vercel 4.5MB request entity limits (HTTP 413 Payload Too Large).
 * 2. Drastically accelerates upload speeds (shrinks 10MB-15MB raw photos down to ~400KB-800KB).
 * 3. Preserves optimal facial resolution (2560px max dimension), providing ~200-300px per face,
 *    far exceeding InsightFace ArcFace's 112x112 minimum input requirement for 99.8% precision.
 */

export interface OptimizedPhotoResult {
  file: File;
  originalSize: number;
  compressedSize: number;
  width: number;
  height: number;
  wasCompressed: boolean;
}

export async function optimizeClassroomPhoto(
  file: File,
  maxDimension: number = 2560,
  quality: number = 0.88
): Promise<OptimizedPhotoResult> {
  const originalSize = file.size;

  // Fallback for non-browser / non-canvas environments or non-image files
  if (typeof window === "undefined" || !file.type.startsWith("image/")) {
    return {
      file,
      originalSize,
      compressedSize: originalSize,
      width: 0,
      height: 0,
      wasCompressed: false,
    };
  }

  return new Promise((resolve) => {
    const reader = new FileReader();

    reader.onerror = () => {
      console.warn("[ImageOptimizer] FileReader failed, falling back to original file");
      resolve({
        file,
        originalSize,
        compressedSize: originalSize,
        width: 0,
        height: 0,
        wasCompressed: false,
      });
    };

    reader.onload = () => {
      const img = new Image();

      img.onerror = () => {
        console.warn("[ImageOptimizer] Image element failed to parse, falling back to original file");
        resolve({
          file,
          originalSize,
          compressedSize: originalSize,
          width: 0,
          height: 0,
          wasCompressed: false,
        });
      };

      img.onload = () => {
        let width = img.naturalWidth || img.width;
        let height = img.naturalHeight || img.height;

        // If dimensions are missing or invalid, fallback safely
        if (!width || !height) {
          return resolve({
            file,
            originalSize,
            compressedSize: originalSize,
            width: 0,
            height: 0,
            wasCompressed: false,
          });
        }

        // Check if downscaling is required
        let needsDownscale = false;
        if (width > maxDimension || height > maxDimension) {
          needsDownscale = true;
          if (width > height) {
            height = Math.round((height * maxDimension) / width);
            width = maxDimension;
          } else {
            width = Math.round((width * maxDimension) / height);
            height = maxDimension;
          }
        }

        // If file is already small (< 500KB) and doesn't need downscaling, preserve as is
        if (!needsDownscale && originalSize < 500 * 1024) {
          return resolve({
            file,
            originalSize,
            compressedSize: originalSize,
            width,
            height,
            wasCompressed: false,
          });
        }

        try {
          const canvas = document.createElement("canvas");
          canvas.width = width;
          canvas.height = height;

          const ctx = canvas.getContext("2d");
          if (!ctx) {
            return resolve({
              file,
              originalSize,
              compressedSize: originalSize,
              width,
              height,
              wasCompressed: false,
            });
          }

          ctx.imageSmoothingEnabled = true;
          ctx.imageSmoothingQuality = "high";
          ctx.drawImage(img, 0, 0, width, height);

          canvas.toBlob(
            (blob) => {
              if (!blob) {
                return resolve({
                  file,
                  originalSize,
                  compressedSize: originalSize,
                  width,
                  height,
                  wasCompressed: false,
                });
              }

              // Create clean JPEG file with optimized name
              const fileName = file.name.replace(/\.[^/.]+$/, "") + "_optimized.jpg";
              const optimizedFile = new File([blob], fileName, {
                type: "image/jpeg",
                lastModified: Date.now(),
              });

              resolve({
                file: optimizedFile,
                originalSize,
                compressedSize: optimizedFile.size,
                width,
                height,
                wasCompressed: true,
              });
            },
            "image/jpeg",
            quality
          );
        } catch (canvasErr) {
          console.warn("[ImageOptimizer] Canvas processing failed, falling back:", canvasErr);
          resolve({
            file,
            originalSize,
            compressedSize: originalSize,
            width,
            height,
            wasCompressed: false,
          });
        }
      };

      img.src = reader.result as string;
    };

    reader.readAsDataURL(file);
  });
}

