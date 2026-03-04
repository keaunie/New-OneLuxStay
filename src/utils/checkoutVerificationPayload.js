const fileToDataUrl = (file) =>
  new Promise((resolve, reject) => {
    if (!file) {
      resolve("");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => resolve(typeof reader.result === "string" ? reader.result : "");
    reader.onerror = () => reject(new Error("Unable to read file"));
    reader.readAsDataURL(file);
  });

const downscaleImageDataUrl = (dataUrl, maxDimension = 1280, quality = 0.78) =>
  new Promise((resolve) => {
    const image = new Image();
    image.onload = () => {
      const width = image.naturalWidth || image.width;
      const height = image.naturalHeight || image.height;
      if (!width || !height) {
        resolve(dataUrl);
        return;
      }

      const longestSide = Math.max(width, height);
      const scale = longestSide > maxDimension ? maxDimension / longestSide : 1;
      const nextWidth = Math.max(1, Math.round(width * scale));
      const nextHeight = Math.max(1, Math.round(height * scale));

      const canvas = document.createElement("canvas");
      canvas.width = nextWidth;
      canvas.height = nextHeight;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        resolve(dataUrl);
        return;
      }
      ctx.drawImage(image, 0, 0, nextWidth, nextHeight);
      try {
        resolve(canvas.toDataURL("image/jpeg", quality));
      } catch {
        resolve(dataUrl);
      }
    };
    image.onerror = () => resolve(dataUrl);
    image.src = dataUrl;
  });

const serializeProofImage = async (file, { maxDimension = 1280 } = {}) => {
  if (!file) return { name: "", mime: "", dataUrl: "" };
  const name = file.name || "";
  const mime = file.type || "";
  if (!mime.startsWith("image/")) {
    return { name, mime, dataUrl: "" };
  }

  try {
    const rawDataUrl = await fileToDataUrl(file);
    if (!rawDataUrl) return { name, mime, dataUrl: "" };
    const optimizedDataUrl = await downscaleImageDataUrl(rawDataUrl, maxDimension);
    return { name, mime, dataUrl: optimizedDataUrl || rawDataUrl };
  } catch {
    return { name, mime, dataUrl: "" };
  }
};

export const buildCheckoutVerificationPayload = async ({
  identityDocs,
  cardPhoto,
  cardHolderSelfie,
}) => {
  const [idFront, idBack, idSelfie, card, cardSelfie] = await Promise.all([
    serializeProofImage(identityDocs?.idFront, { maxDimension: 1400 }),
    serializeProofImage(identityDocs?.idBack, { maxDimension: 1400 }),
    serializeProofImage(identityDocs?.idSelfie, { maxDimension: 1280 }),
    serializeProofImage(cardPhoto, { maxDimension: 1280 }),
    serializeProofImage(cardHolderSelfie, { maxDimension: 1280 }),
  ]);

  return {
    idFront,
    idBack,
    idSelfie,
    cardPhoto: card,
    cardHolderSelfie: cardSelfie,
  };
};
