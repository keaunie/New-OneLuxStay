import fs from "node:fs/promises";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

const sanitizeText = (value, max = 180) => String(value || "").trim().slice(0, max);

const toDataUrlBytes = (dataUrl) => {
  if (!dataUrl || typeof dataUrl !== "string") return null;
  const match = dataUrl.match(/^data:(.+);base64,(.+)$/);
  if (!match) return null;
  return { mime: match[1], bytes: Buffer.from(match[2], "base64") };
};

const scaleToFit = (width, height, maxWidth, maxHeight) => {
  if (!width || !height) return { width: maxWidth, height: maxHeight };
  const ratio = Math.min(maxWidth / width, maxHeight / height);
  return {
    width: Math.max(1, Math.round(width * ratio)),
    height: Math.max(1, Math.round(height * ratio)),
  };
};

const formatDateTime12h = (value) => {
  if (!value) return "-";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleString("en-US", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });
};

const normalizeProofImage = (value) => {
  if (!value) return { name: "", mime: "", dataUrl: "" };
  if (typeof value === "string") {
    return {
      name: "",
      mime: "",
      dataUrl: value.startsWith("data:image/") ? value.slice(0, 3_000_000) : "",
    };
  }
  const dataUrl = typeof value.dataUrl === "string" ? value.dataUrl : "";
  return {
    name: sanitizeText(value.name || value.fileName || ""),
    mime: sanitizeText(value.mime || value.type || "", 80),
    dataUrl: dataUrl.startsWith("data:image/") ? dataUrl.slice(0, 3_000_000) : "",
  };
};

const getVerificationEntries = (verification = {}) => [
  { label: "ID front", ...normalizeProofImage(verification?.idFront) },
  { label: "ID back", ...normalizeProofImage(verification?.idBack) },
  { label: "Selfie with ID", ...normalizeProofImage(verification?.idSelfie) },
  { label: "Card photo", ...normalizeProofImage(verification?.cardPhoto) },
  { label: "Selfie with card", ...normalizeProofImage(verification?.cardHolderSelfie) },
];

const buildConsentPdf = async ({ reservationId, metadata, consent }) => {
  const pdfDoc = await PDFDocument.create();
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const pageWidth = 612;
  const pageHeight = 792;
  const marginX = 42;
  const contentWidth = pageWidth - marginX * 2;
  const bottomLimit = 56;
  const palette = {
    paper: rgb(0.973, 0.957, 0.929),
    panel: rgb(0.993, 0.987, 0.973),
    panelAlt: rgb(0.959, 0.933, 0.878),
    ink: rgb(0.108, 0.102, 0.11),
    text: rgb(0.204, 0.165, 0.133),
    muted: rgb(0.435, 0.369, 0.302),
    gold: rgb(0.757, 0.624, 0.369),
    border: rgb(0.835, 0.761, 0.639),
  };
  let page;
  let y = 0;

  const fitText = (value, textFont, size, maxWidth) => {
    const raw = String(value || "-").trim() || "-";
    if (textFont.widthOfTextAtSize(raw, size) <= maxWidth) return raw;
    let trimmed = raw;
    while (trimmed.length > 1) {
      const next = `${trimmed}...`;
      if (textFont.widthOfTextAtSize(next, size) <= maxWidth) return next;
      trimmed = trimmed.slice(0, -1);
    }
    return "...";
  };

  const wrapText = (value, textFont, size, maxWidth) => {
    const words = String(value || "-").trim().split(/\s+/);
    const lines = [];
    let line = "";
    for (const word of words) {
      const next = line ? `${line} ${word}` : word;
      if (textFont.widthOfTextAtSize(next, size) <= maxWidth || !line) {
        line = next;
      } else {
        lines.push(line);
        line = word;
      }
    }
    if (line) lines.push(line);
    return lines.length ? lines : ["-"];
  };

  const addPage = (subtitle = "CONSENT PROOF DOSSIER") => {
    page = pdfDoc.addPage([pageWidth, pageHeight]);
    page.drawRectangle({ x: 0, y: 0, width: pageWidth, height: pageHeight, color: palette.paper });
    page.drawRectangle({ x: 0, y: pageHeight - 64, width: pageWidth, height: 64, color: palette.ink });
    page.drawRectangle({ x: 0, y: pageHeight - 68, width: pageWidth, height: 4, color: palette.gold });
    page.drawText("ONE LUX STAY", {
      x: marginX,
      y: pageHeight - 32,
      size: 16,
      font: fontBold,
      color: palette.panel,
    });
    page.drawText(subtitle, {
      x: marginX,
      y: pageHeight - 50,
      size: 9,
      font,
      color: palette.gold,
    });
    y = pageHeight - 92;
  };

  const ensureSpace = (requiredHeight) => {
    if (y - requiredHeight < bottomLimit) addPage("CONSENT PROOF DOSSIER (CONTINUED)");
  };

  const drawSection = (title) => {
    ensureSpace(28);
    page.drawText(String(title || "").toUpperCase(), {
      x: marginX,
      y,
      size: 10,
      font: fontBold,
      color: palette.muted,
    });
    page.drawLine({
      start: { x: marginX, y: y - 4 },
      end: { x: marginX + contentWidth, y: y - 4 },
      thickness: 1,
      color: palette.gold,
    });
    y -= 22;
  };

  const drawDetailGrid = (items = []) => {
    const rows = [];
    for (let i = 0; i < items.length; i += 2) {
      rows.push([items[i], items[i + 1] || null]);
    }
    const rowHeight = 40;
    const cardHeight = 18 + rows.length * rowHeight + 8;
    ensureSpace(cardHeight + 8);

    const cardTop = y;
    const cardBottom = y - cardHeight;
    const midX = marginX + contentWidth / 2;
    const leftX = marginX + 14;
    const rightX = midX + 14;
    const valueWidth = contentWidth / 2 - 28;

    page.drawRectangle({
      x: marginX,
      y: cardBottom,
      width: contentWidth,
      height: cardHeight,
      color: palette.panel,
      borderColor: palette.border,
      borderWidth: 1,
    });
    page.drawLine({
      start: { x: midX, y: cardBottom + 8 },
      end: { x: midX, y: cardTop - 8 },
      thickness: 1,
      color: palette.border,
    });

    rows.forEach((row, index) => {
      const rowTop = cardTop - 14 - index * rowHeight;
      if (index > 0) {
        page.drawLine({
          start: { x: marginX + 10, y: rowTop + 8 },
          end: { x: marginX + contentWidth - 10, y: rowTop + 8 },
          thickness: 1,
          color: palette.border,
        });
      }
      const [left, right] = row;
      if (left) {
        page.drawText((left.label || "").toUpperCase(), {
          x: leftX,
          y: rowTop,
          size: 7,
          font: fontBold,
          color: palette.gold,
        });
        page.drawText(fitText(left.value, font, 11, valueWidth), {
          x: leftX,
          y: rowTop - 14,
          size: 11,
          font,
          color: palette.text,
        });
      }
      if (right) {
        page.drawText((right.label || "").toUpperCase(), {
          x: rightX,
          y: rowTop,
          size: 7,
          font: fontBold,
          color: palette.gold,
        });
        page.drawText(fitText(right.value, font, 11, valueWidth), {
          x: rightX,
          y: rowTop - 14,
          size: 11,
          font,
          color: palette.text,
        });
      }
    });

    y = cardBottom - 12;
  };

  const drawConsentText = (text) => {
    const lines = wrapText(text, font, 10.5, contentWidth - 34);
    const lineHeight = 14;
    const cardHeight = 26 + lines.length * lineHeight + 12;
    ensureSpace(cardHeight + 8);
    const cardTop = y;
    const cardBottom = y - cardHeight;

    page.drawRectangle({
      x: marginX,
      y: cardBottom,
      width: contentWidth,
      height: cardHeight,
      color: palette.panelAlt,
      borderColor: palette.border,
      borderWidth: 1,
    });
    page.drawRectangle({
      x: marginX + 10,
      y: cardBottom + 10,
      width: 3,
      height: cardHeight - 20,
      color: palette.gold,
    });

    let textY = cardTop - 20;
    for (const line of lines) {
      page.drawText(line, { x: marginX + 20, y: textY, size: 10.5, font, color: palette.text });
      textY -= lineHeight;
    }
    y = cardBottom - 14;
  };

  const drawSignature = async () => {
    ensureSpace(178);
    const cardTop = y;
    const cardHeight = 166;
    const cardBottom = y - cardHeight;
    const signatureLabelY = cardTop - 22;
    const signatureBoxX = marginX + 16;
    const signatureBoxY = cardBottom + 22;
    const signatureBoxWidth = 256;
    const signatureBoxHeight = 92;

    page.drawRectangle({
      x: marginX,
      y: cardBottom,
      width: contentWidth,
      height: cardHeight,
      color: palette.panel,
      borderColor: palette.border,
      borderWidth: 1,
    });
    page.drawText("SIGNATURE RECORD", {
      x: marginX + 16,
      y: signatureLabelY,
      size: 9,
      font: fontBold,
      color: palette.gold,
    });
    page.drawRectangle({
      x: signatureBoxX,
      y: signatureBoxY,
      width: signatureBoxWidth,
      height: signatureBoxHeight,
      borderColor: palette.border,
      borderWidth: 1,
      color: palette.panelAlt,
    });

    const sig = toDataUrlBytes(consent?.consentSignatureDataUrl);
    if (sig) {
      try {
        const embedded = sig.mime.includes("png")
          ? await pdfDoc.embedPng(sig.bytes)
          : await pdfDoc.embedJpg(sig.bytes);
        const fitted = scaleToFit(embedded.width, embedded.height, signatureBoxWidth - 16, signatureBoxHeight - 16);
        page.drawImage(embedded, {
          x: signatureBoxX + 8 + Math.max(0, (signatureBoxWidth - 16 - fitted.width) / 2),
          y: signatureBoxY + 8 + Math.max(0, (signatureBoxHeight - 16 - fitted.height) / 2),
          width: fitted.width,
          height: fitted.height,
        });
      } catch {
        page.drawText("Signature image unavailable", {
          x: signatureBoxX + 12,
          y: signatureBoxY + signatureBoxHeight / 2 - 4,
          size: 10,
          font,
          color: palette.muted,
        });
      }
    } else {
      page.drawText("No signature image captured", {
        x: signatureBoxX + 12,
        y: signatureBoxY + signatureBoxHeight / 2 - 4,
        size: 10,
        font,
        color: palette.muted,
      });
    }

    const infoX = signatureBoxX + signatureBoxWidth + 18;
    const infoWidth = contentWidth - (infoX - marginX) - 16;
    const signer = consent?.consentSignerName || metadata?.consent_signer_name || "-";
    const acceptedAt = formatDateTime12h(metadata?.consent_at || consent?.consentAcceptedAt);
    page.drawText("SIGNED BY", { x: infoX, y: signatureLabelY - 8, size: 8, font: fontBold, color: palette.gold });
    page.drawText(fitText(signer, font, 11, infoWidth), {
      x: infoX,
      y: signatureLabelY - 24,
      size: 11,
      font,
      color: palette.text,
    });
    page.drawText("CONSENT ACCEPTED", { x: infoX, y: signatureLabelY - 52, size: 8, font: fontBold, color: palette.gold });
    page.drawText(fitText(acceptedAt, font, 11, infoWidth), {
      x: infoX,
      y: signatureLabelY - 68,
      size: 11,
      font,
      color: palette.text,
    });

    y = cardBottom - 14;
  };

  const drawVerification = async (entry) => {
    const cardHeight = 196;
    ensureSpace(cardHeight + 8);
    const cardTop = y;
    const cardBottom = y - cardHeight;
    const boxX = marginX + 14;
    const boxWidth = contentWidth - 28;
    const previewX = boxX;
    const previewWidth = boxWidth;
    const previewHeight = 136;
    const previewY = cardBottom + 18;

    page.drawRectangle({
      x: marginX,
      y: cardBottom,
      width: contentWidth,
      height: cardHeight,
      color: palette.panel,
      borderColor: palette.border,
      borderWidth: 1,
    });

    const heading = entry?.name
      ? `${entry.label}: ${sanitizeText(entry.name, 96)}`
      : `${entry.label}:`;
    page.drawText(fitText(heading, fontBold, 10, boxWidth), {
      x: boxX,
      y: cardTop - 22,
      size: 10,
      font: fontBold,
      color: palette.text,
    });

    page.drawRectangle({
      x: previewX,
      y: previewY,
      width: previewWidth,
      height: previewHeight,
      color: palette.panelAlt,
      borderColor: palette.border,
      borderWidth: 1,
    });

    const imageData = toDataUrlBytes(entry?.dataUrl);
    if (imageData) {
      try {
        const embeddedImage = imageData.mime.includes("png")
          ? await pdfDoc.embedPng(imageData.bytes)
          : await pdfDoc.embedJpg(imageData.bytes);
        const fitted = scaleToFit(embeddedImage.width, embeddedImage.height, previewWidth - 16, previewHeight - 16);
        page.drawImage(embeddedImage, {
          x: previewX + 8 + Math.max(0, (previewWidth - 16 - fitted.width) / 2),
          y: previewY + 8 + Math.max(0, (previewHeight - 16 - fitted.height) / 2),
          width: fitted.width,
          height: fitted.height,
        });
      } catch {
        page.drawText("Preview unavailable for this uploaded file.", {
          x: previewX + 12,
          y: previewY + previewHeight / 2 - 4,
          size: 10,
          font,
          color: palette.muted,
        });
      }
    } else {
      page.drawText("No preview image captured.", {
        x: previewX + 12,
        y: previewY + previewHeight / 2 - 4,
        size: 10,
        font,
        color: palette.muted,
      });
    }

    y = cardBottom - 12;
  };

  addPage();

  const guestName =
    [metadata?.guestFirstName, metadata?.guestLastName].filter(Boolean).join(" ") ||
    metadata?.guestName ||
    "-";
  const detailItems = [
    { label: "Generated at", value: formatDateTime12h(new Date()) },
    { label: "Reservation ID", value: reservationId || "-" },
    { label: "Guest", value: guestName },
    { label: "Guest email", value: metadata?.guestEmail || "-" },
    { label: "Check-in", value: metadata?.checkIn || "-" },
    { label: "Check-out", value: metadata?.checkOut || "-" },
    {
      label: "Consent accepted",
      value: formatDateTime12h(metadata?.consent_at || consent?.consentAcceptedAt),
    },
    { label: "Signed by", value: consent?.consentSignerName || metadata?.consent_signer_name || "-" },
    { label: "Stripe session", value: consent?.sessionId || "-" },
    { label: "Payment intent", value: consent?.paymentIntentId || "-" },
    { label: "Receipt URL", value: consent?.receiptUrl || "-" },
  ];
  drawSection("Reservation and Payment Details");
  drawDetailGrid(detailItems);

  drawSection("Consent Statement");
  const DEFAULT_CONSENT_STATEMENT =
    "I authorize OneLuxStay to process this reservation and acknowledge the rental terms and policies associated with this stay.";
  const consentStatement =
    [metadata?.consent_text, consent?.consentText]
      .map((value) => (typeof value === "string" ? value.trim() : ""))
      .find(Boolean) || DEFAULT_CONSENT_STATEMENT;
  drawConsentText(consentStatement);

  drawSection("Guest Authorization");
  await drawSignature();

  const verificationEntries = getVerificationEntries(consent?.verification).filter(
    (item) => item?.dataUrl || item?.name,
  );
  if (verificationEntries.length) {
    drawSection("Verification Uploads");
    for (const entry of verificationEntries) {
      await drawVerification(entry);
    }
  }

  const pages = pdfDoc.getPages();
  pages.forEach((pdfPage, index) => {
    pdfPage.drawLine({
      start: { x: marginX, y: 38 },
      end: { x: pageWidth - marginX, y: 38 },
      thickness: 1,
      color: palette.border,
    });
    pdfPage.drawText("OneLuxStay Confidential Consent Record", {
      x: marginX,
      y: 24,
      size: 8,
      font,
      color: palette.muted,
    });
    const pageText = `Page ${index + 1} of ${pages.length}`;
    const pageTextWidth = font.widthOfTextAtSize(pageText, 8);
    pdfPage.drawText(pageText, {
      x: pageWidth - marginX - pageTextWidth,
      y: 24,
      size: 8,
      font,
      color: palette.muted,
    });
  });

  return pdfDoc.save();
};

const metadata = {
  guestFirstName: "Alex",
  guestLastName: "Rivera",
  guestEmail: "alex.rivera@example.com",
  checkIn: "2026-04-18",
  checkOut: "2026-04-22",
  consent_at: "2026-03-05T18:15:42.000Z",
  consent_signer_name: "Alex Rivera",
  consent_text:
    "By signing and continuing to payment, you authorize OneLuxStay to charge the total amount shown for your reservation. A receipt and consent proof PDF will be emailed to you.",
};

const consent = {
  consentAcceptedAt: "2026-03-05T18:15:42.000Z",
  consentSignerName: "Alex Rivera",
  sessionId: "cs_test_lux_20260305_001",
  paymentIntentId: "pi_lux_20260305_001",
  receiptUrl: "https://pay.stripe.com/receipts/lux-001",
  verification: {
    idFront: { name: "passport-front.jpg" },
    idBack: { name: "passport-back.jpg" },
    idSelfie: { name: "guest-selfie.jpg" },
  },
};

const pdfBytes = await buildConsentPdf({
  reservationId: "RES-LUX-20260305-001",
  metadata,
  consent,
});

const outputPath = "consent-proof-preview-luxury.pdf";
await fs.writeFile(outputPath, pdfBytes);
console.log(`Generated ${outputPath}`);
