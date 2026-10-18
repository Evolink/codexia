/** keke files session capabilities (web search) under this config category. */
export const TOOLS_CATEGORY = '_tools';

/**
 * Images from the browser (picker or paste) have no path the server can read,
 * so they travel as `data:` URLs, which the backend accepts next to paths.
 */
export function imagesAsDataUrls(files: Iterable<File>): Promise<string[]> {
  const images = [...files].filter((f) => f.type.startsWith('image/'));
  return Promise.all(
    images.map(
      (file) =>
        new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(String(reader.result));
          reader.onerror = () => reject(reader.error);
          reader.readAsDataURL(file);
        })
    )
  );
}
