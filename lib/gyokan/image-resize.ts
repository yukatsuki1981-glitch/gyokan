function newUuid() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export async function resizeImageFile(
  file: File,
  maxDim = 800,
  quality = 0.82,
): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, maxDim / Math.max(bitmap.width, bitmap.height));
  const w = Math.round(bitmap.width * scale);
  const h = Math.round(bitmap.height * scale);
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("canvas unavailable");
  ctx.drawImage(bitmap, 0, 0, w, h);
  bitmap.close();
  return canvas.toDataURL("image/jpeg", quality);
}

export async function fileToJournalPhoto(file: File, index: number) {
  const dataUrl = await resizeImageFile(file);
  return {
    id: newUuid(),
    dataUrl,
    rotation: index % 2 === 0 ? -4 + Math.random() * 2 : 3 + Math.random() * 2,
  };
}

export { newUuid };
