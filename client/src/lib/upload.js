/**
 * ===========================================================================
 *  IMAGE UPLOAD
 * ===========================================================================
 *
 * The API deliberately never proxies binaries (see step 2, admin gallery
 * routes): the browser uploads straight to object storage and posts only the
 * resulting URLs. That keeps the endpoint inside serverless body limits and
 * keeps uploads fast on a phone with two bars of signal.
 *
 * The downscale step is not an optimisation, it's the difference between the
 * feature working and not working. A photo off a modern phone is 12 megapixels
 * and 4-6 MB; two of those over a shop's 4G is a minute of the barber standing
 * still. Resized to 1600px on the long edge at q0.82 it's ~250 KB and visually
 * identical in a slider.
 */

/**
 * Resize and re-encode in the browser.
 *
 * `imageOrientation: 'from-image'` matters more than it looks: phone cameras
 * record rotation in EXIF rather than rotating the pixels, and drawing to a
 * canvas discards EXIF. Without this flag every portrait shot lands sideways
 * in the gallery.
 */
export async function downscale(file, { maxEdge = 1600, quality = 0.82 } = {}) {
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });

  const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
  const width = Math.round(bitmap.width * scale);
  const height = Math.round(bitmap.height * scale);

  // OffscreenCanvas keeps the resize off the main thread where it's available,
  // so the UI doesn't hitch while a 12MP image is rescaled.
  const canvas =
    typeof OffscreenCanvas !== 'undefined'
      ? new OffscreenCanvas(width, height)
      : Object.assign(document.createElement('canvas'), { width, height });

  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close?.();

  const blob = canvas.convertToBlob
    ? await canvas.convertToBlob({ type: 'image/jpeg', quality })
    : await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality));

  return { blob, width, height };
}

/**
 * Upload one file and return its public URL.
 *
 * Swap the body of this function for S3 presigned PUTs, UploadThing or
 * anything else — the gallery uploader only cares that it gets a URL back.
 * Cloudinary's unsigned preset is the default because it needs no server
 * round-trip to start, which is one less thing to fail on a phone.
 *
 * @param {File} file
 * @param {(fraction:number) => void} [onProgress]
 */
export async function uploadImage(file, onProgress) {
  const cloud = import.meta.env.VITE_CLOUDINARY_CLOUD;
  const preset = import.meta.env.VITE_CLOUDINARY_PRESET;

  if (!cloud || !preset) {
    throw new Error('Image hosting is not configured. Set VITE_CLOUDINARY_CLOUD and VITE_CLOUDINARY_PRESET.');
  }

  const { blob } = await downscale(file);
  const form = new FormData();
  form.append('file', blob);
  form.append('upload_preset', preset);

  // XHR rather than fetch purely for upload progress — fetch still has no
  // request-side progress events, and on a slow connection a progress bar is
  // the difference between waiting and tapping the button again.
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', `https://api.cloudinary.com/v1_1/${cloud}/image/upload`);

    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress?.(e.loaded / e.total);
    };

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve(JSON.parse(xhr.responseText).secure_url);
      } else {
        reject(new Error(`Upload failed (${xhr.status})`));
      }
    };
    xhr.onerror = () => reject(new Error('Upload failed. Check the connection and try again.'));
    xhr.send(form);
  });
}
