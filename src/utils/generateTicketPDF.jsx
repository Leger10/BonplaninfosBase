// utils/generateTicketPDF.jsx
import jsPDF from "jspdf";
import QRCode from "qrcode";

// Helper to load image for PDF with timeout and cache busting
const getBase64ImageFromURL = (url) => {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "Anonymous";
    
    const timeout = setTimeout(() => {
      console.warn("Image load timeout for URL:", url);
      resolve(null);
    }, 5000);
    
    img.onload = () => {
      clearTimeout(timeout);
      try {
        const canvas = document.createElement("canvas");
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0);
        const dataURL = canvas.toDataURL("image/png");
        resolve(dataURL);
      } catch (e) {
        console.error("Canvas error:", e);
        resolve(null);
      }
    };
    
    img.onerror = (error) => {
      clearTimeout(timeout);
      console.error("Image load error for URL:", url, error);
      resolve(null);
    };

    const cacheBusterUrl = url + (url.includes("?") ? "&" : "?") + "t=" + Date.now();
    img.src = cacheBusterUrl;
  });
};

// Sauvegarde universelle : ouvre le PDF dans un nouvel onglet/navigateur
const openPDFInNewTab = (doc, fileName) => {
  const safeName = fileName.replace(/\s+/g, '_').replace(/[^\w.-]/g, '');
  const blob = doc.output('blob');
  const blobUrl = URL.createObjectURL(blob);
  
  const ua = navigator.userAgent;
  const isIOS = /iPad|iPhone|iPod/.test(ua);
  const isIOS13 = /iPad/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const isIOSDevice = isIOS || isIOS13;
  const isAndroid = /android/i.test(ua);
  
  console.log(`Ouverture du PDF pour ${isIOSDevice ? 'iOS' : isAndroid ? 'Android' : 'Desktop'}`);
  
  const newWindow = window.open(blobUrl, '_blank');
  if (!newWindow) {
    window.location.href = blobUrl;
  }
  
  setTimeout(() => {
    URL.revokeObjectURL(blobUrl);
  }, 60000);
};

// Colors Map for Ticket Types
// Les valeurs RGB correspondent aux classes Tailwind du sélecteur de couleur
// (CreateTicketingEventPage) pour que le PDF ait la MÊME couleur que le billet
// affiché à l'achat.
const DB_COLOR_MAP = {
    blue: [59, 130, 246],      // bg-blue-500
    bronze: [217, 119, 6],     // bg-amber-600
    silver: [148, 163, 184],   // bg-slate-400
    gold: [234, 179, 8],       // bg-yellow-500
    purple: [147, 51, 234],    // bg-purple-600
    red: [239, 68, 68],        // bg-red-500
    green: [34, 197, 94],      // bg-green-500
    pink: [236, 72, 153],      // bg-pink-500
    cyan: [6, 182, 212],       // bg-cyan-500
    orange: [249, 115, 22],    // bg-orange-500
    indigo: [99, 102, 241],    // bg-indigo-500
    black: [15, 23, 42],       // bg-slate-900
    white: [255, 255, 255],    // bg-white
};

const DEFAULT_COLOR = [255, 140, 0];

// Une couleur claire (blanc, argent…) impose un texte foncé pour rester lisible.
const isLightColor = (rgb) => {
    const [r, g, b] = rgb || [0, 0, 0];
    return (r + g + b) / 3 > 170;
};

const getTicketColor = (type, colorKey) => {
  if (colorKey && DB_COLOR_MAP[colorKey]) {
      return DB_COLOR_MAP[colorKey];
  }
  if (!type) return DEFAULT_COLOR;
  const normalizedType = type.trim().toLowerCase();
  if (normalizedType.includes("vip")) return DB_COLOR_MAP["purple"];
  if (normalizedType.includes("or") || normalizedType.includes("gold")) return DB_COLOR_MAP["gold"];
  if (normalizedType.includes("argent") || normalizedType.includes("silver")) return DB_COLOR_MAP["silver"];
  if (normalizedType.includes("bronze")) return DB_COLOR_MAP["bronze"];
  if (normalizedType.includes("invit")) return DB_COLOR_MAP["blue"];
  return DEFAULT_COLOR;
};

const generateQRCodeDataURL = async (data, size = 300) => {
  try {
    const qrData = data.code || data.ticketCode || data.ticket_code_short || data.qr_code || "XXXXXX";
    return await QRCode.toDataURL(qrData, {
      width: size,
      margin: 1,
      color: {
        dark: "#000000FF",
        light: "#FFFFFFFF",
      },
      errorCorrectionLevel: "H",
    });
  } catch (error) {
    console.error("QR Code generation error:", error);
    return null;
  }
};

const safeText = (text) => {
  if (text === null || text === undefined) return "";
  let str = String(text);
  return str.replace(/[^\x00-\x7F\u00C0-\u00FF\u0152\u0153\u20AC]/g, ""); 
};

const formatDate = (dateString) => {
  if (!dateString) return "Date non définie";
  try {
    const date = new Date(dateString);
    const options = {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    };
    if (isNaN(date.getTime())) {
      return dateString;
    }
    return date.toLocaleDateString("fr-FR", options);
  } catch (e) {
    console.error("Date formatting error:", e);
    return dateString;
  }
};

const formatPurchaseDate = (dateString) => {
  if (!dateString) return "";
  try {
    const date = new Date(dateString);
    if (isNaN(date.getTime())) {
      return "";
    }
    return date.toLocaleString("fr-FR", {
      day: "numeric",
      month: "long",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch (e) {
    console.error("Purchase date formatting error:", e);
    return "";
  }
};

// ✅ Fonction ULTRA ROBUSTE pour formater le prix
const formatPrice = (amount) => {
  // Si amount est undefined, null
  if (amount === undefined || amount === null) return "0";
  
  let numAmount;
  
  // Si c'est déjà un nombre
  if (typeof amount === 'number' && !isNaN(amount)) {
    numAmount = amount;
  } 
  // Si c'est une chaîne
  else if (typeof amount === 'string') {
    // 🔥 CORRECTION: Enlever les slashs, espaces et autres caractères
    // Garder seulement les chiffres, virgules et points
    const clean = amount.replace(/[^0-9,.]/g, '');
    // Remplacer la virgule par un point
    const normalized = clean.replace(',', '.');
    numAmount = parseFloat(normalized);
  } 
  // Autre cas
  else {
    try {
      numAmount = Number(amount);
    } catch {
      numAmount = 0;
    }
  }
  
  // Vérifier si c'est un nombre valide
  if (isNaN(numAmount) || numAmount <= 0) return "0";
  
  // Formater sans séparateur de milliers : la police standard PDF (helvetica)
  // ne contient pas l'espace fine insécable (U+202F) insérée par
  // toLocaleString('fr-FR'), qui s'affiche alors comme un glyphe anormal
  // (ex : "1 /000 FCFA" au lieu de "1000 FCFA").
  return String(Number(numAmount));
};

export const generateTicketPDF = async (event, tickets, user, { returnBlob = false } = {}) => {
  try {
    if (!event || !tickets || tickets.length === 0) {
      throw new Error("Données manquantes pour générer le PDF");
    }

    const validTickets = tickets.filter(t => {
      const hasValidId = t.ticket_number || t.ticket_code_short || t.ticket_code || t.qr_code;
      console.log("Ticket validation:", { ticket: t, hasValidId });
      return hasValidId;
    });
    
    if (validTickets.length === 0) {
      console.error("Tickets invalides reçus:", tickets);
      throw new Error("Aucun ticket valide à générer");
    }

    console.log(`${validTickets.length} ticket(s) valide(s) trouvé(s)`);

    const doc = new jsPDF({
      orientation: "portrait",
      unit: "mm",
      format: "a6",
      compress: true,
    });

    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const margin = 5;
    const contentWidth = pageWidth - margin * 2;
    const bottomMargin = 15;

    const logoUrl = "/pwa-192x192.png";
    let logoImg = null;

    // PRÉPARER LES DONNÉES POUR CHAQUE TICKET
    const ticketsData = tickets.map((ticket, index) => {
      // 🔥 Nettoyer le prix avant tout
      let rawPriceFcfa = ticket.price_fcfa || ticket.purchase_amount_fcfa || 0;
      let rawPricePi = ticket.price || ticket.purchase_amount_pi || ticket.purchase_price_pi || 0;
      
      // 🔥 CORRECTION: Nettoyer la chaîne des slashs et espaces
      if (typeof rawPriceFcfa === 'string') {
        // Enlever tout ce qui n'est pas un chiffre, virgule ou point
        rawPriceFcfa = rawPriceFcfa.replace(/[^0-9,.]/g, '').replace(',', '.');
      }
      
      const pricePi = Number(rawPricePi) || 0;
      const priceFcfa = parseFloat(rawPriceFcfa) || (pricePi * 10) || 0;
      
      console.log(`💰 Ticket ${index + 1}: rawPriceFcfa=${ticket.price_fcfa}, priceFcfa=${priceFcfa}`);
      
      const ticketNum = ticket.ticket_number || 
                        ticket.ticket_code || 
                        ticket.qr_code ||
                        `TKT${Date.now()}${index}`;
      
      const ticketCode = ticket.ticket_code_short || 
                         ticket.ticket_code || 
                         ticket.qr_code ||
                         (ticketNum ? String(ticketNum).slice(-6).toUpperCase() : "XXXXXX");
      
      const holderName = safeText(
        ticket.attendee_name || 
        ticket.holderName || 
        ticket.attendeeName ||
        user?.full_name || 
        user?.email?.split("@")[0] || 
        "Invité"
      );
      
      const eventTitle = safeText(
        ticket.event_title || 
        ticket.events?.title || 
        event?.title || 
        "Événement BonPlanInfos"
      );
      
      const eventDate = formatDate(
        ticket.event_end_at || 
        ticket.events?.event_end_at || 
        event?.event_end_at || 
        ticket.event_start_at || 
        ticket.events?.event_start_at || 
        event?.event_start_at
      );
      
      const location = safeText(
        ticket.full_address || 
        ticket.location || 
        ticket.events?.full_address || 
        ticket.events?.address || 
        ticket.events?.location || 
        ticket.events?.city ||
        event?.full_address ||
        event?.address ||
        event?.location || 
        event?.city || 
        "Lieu à confirmer"
      );
      
      const ticketType = safeText(
        ticket.type_name || 
        ticket.ticket_types?.name || 
        "Standard"
      );
      
      const purchaseDateDisplay = formatPurchaseDate(
        ticket.purchase_date || 
        ticket.purchased_at || 
        ticket.purchasedAt
      );
      
      const ticketColor = getTicketColor(
        ticketType, 
        ticket.color || ticket.ticket_types?.color
      );

      return {
        pricePi,
        priceFcfa,
        ticketNum: String(ticketNum),
        ticketCode: String(ticketCode),
        holderName,
        eventTitle,
        eventDate,
        location,
        ticketType,
        purchaseDateDisplay,
        ticketColor,
      };
    });

    for (let i = 0; i < ticketsData.length; i++) {
      if (i > 0) doc.addPage();
      
      const {
        pricePi,
        priceFcfa,
        ticketNum,
        ticketCode,
        holderName,
        eventTitle,
        eventDate,
        location,
        ticketType,
        purchaseDateDisplay,
        ticketColor,
      } = ticketsData[i];

      let cursorY = 0;

      // Texte foncé sur fond clair (blanc/argent) pour rester lisible.
      const darkOnColor = isLightColor(ticketColor) ? [15, 23, 42] : ticketColor;

      // --- 1. EN-TÊTE ---
      doc.setFillColor(...ticketColor);
      doc.rect(0, 0, pageWidth, 18, "F");
      
      try {
        logoImg = await getBase64ImageFromURL(logoUrl);
      } catch (err) {
        // Ignorer
      }

      if (logoImg) {
        try {
          doc.addImage(logoImg, "PNG", margin, 2, 14, 14);
        } catch (error) {
          // Ignorer
        }
      }

      doc.setTextColor(...(isLightColor(ticketColor) ? [15, 23, 42] : [255, 255, 255]));
      doc.setFontSize(7);
      doc.setFont("helvetica", "normal");
      doc.text("BILLET OFFICIEL", pageWidth - margin, 11, { align: "right" });

      cursorY = 24;

      // --- 2. PRIX --- ✅ FORMATAGE ULTRA ROBUSTE
      doc.setFontSize(12);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(...darkOnColor);
      
      // ✅ Utilisation de formatPrice pour un affichage propre
      const formattedPrice = formatPrice(priceFcfa);
      const priceText = `Valeur : ${formattedPrice} FCFA`;
      doc.text(priceText, pageWidth / 2, cursorY, { align: "center" });
      cursorY += 8;

      // --- 3. TITRE DE L'ÉVÉNEMENT ---
      doc.setTextColor(0, 0, 0);
      doc.setFontSize(12);
      doc.setFont("helvetica", "bold");
      const titleLines = doc.splitTextToSize(eventTitle, contentWidth);
      const titleHeight = Math.min(titleLines.length * 5, 15);
      doc.text(titleLines, pageWidth / 2, cursorY, { align: "center" });
      cursorY += titleHeight + 3;

      // --- 4. LIEU + DATE ---
      doc.setFontSize(8);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(60, 60, 60);

      // Lieu
      doc.setFont("helvetica", "bold");
      doc.text("LIEU :", margin, cursorY);
      doc.setFont("helvetica", "normal");
      const locationLines = doc.splitTextToSize(location, contentWidth - 15);
      const locationHeight = Math.min(locationLines.length * 4, 12);
      doc.text(locationLines, margin + 14, cursorY);
      cursorY += locationHeight + 4;

      // Date
      if (eventDate && eventDate !== "Date non définie") {
        doc.setFont("helvetica", "bold");
        const labelText = "DATE FIN : ";
        doc.text(labelText, margin, cursorY);
        doc.setFont("helvetica", "normal");
        const dateLines = doc.splitTextToSize(eventDate, contentWidth - 15);
        // Calcul du x pour que la valeur commence après le label
        const labelWidth = doc.getStringUnitWidth(labelText) * 8 / doc.internal.scaleFactor;
        const valueX = margin + labelWidth + 0.5;
        doc.text(dateLines, valueX, cursorY);
        cursorY += dateLines.length * 2 + 3;
      }

      // --- 5. BADGE TYPE DE BILLET AVEC NOM DU TITULAIRE ---
      doc.setDrawColor(...ticketColor);
      doc.setLineWidth(0.5);
      doc.setFillColor(250, 250, 250);
      doc.roundedRect(margin, cursorY, contentWidth, 12, 2, 2, "FD");

      doc.setFontSize(10);
      doc.setTextColor(...darkOnColor);
      doc.setFont("helvetica", "bold");
      
      const maxTypeWidth = contentWidth - 20;
      let displayType = ticketType.toUpperCase();
      if (doc.getStringUnitWidth(displayType) * 10 / doc.internal.scaleFactor > maxTypeWidth) {
        displayType = doc.splitTextToSize(displayType, maxTypeWidth)[0];
      }
      doc.text(displayType, margin + 4, cursorY + 8);

      doc.setTextColor(0, 0, 0);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(9);
      
      const maxNameWidth = contentWidth - 50;
      let displayName = holderName;
      if (doc.getStringUnitWidth(displayName) * 9 / doc.internal.scaleFactor > maxNameWidth) {
        displayName = doc.splitTextToSize(displayName, maxNameWidth)[0];
      }
      doc.text(displayName, pageWidth - margin - 4, cursorY + 8, { align: "right" });

      cursorY += 14;

      // --- 6. QR CODE ---
      const qrSize = 42;
      const qrX = (pageWidth - qrSize) / 2;

      doc.setDrawColor(...ticketColor);
      doc.setLineWidth(1);
      const cornerLen = 5;
      
      doc.line(qrX - 2, cursorY - 2, qrX - 2 + cornerLen, cursorY - 2);
      doc.line(qrX - 2, cursorY - 2, qrX - 2, cursorY - 2 + cornerLen);
      doc.line(qrX + qrSize + 2, cursorY - 2, qrX + qrSize + 2 - cornerLen, cursorY - 2);
      doc.line(qrX + qrSize + 2, cursorY - 2, qrX + qrSize + 2, cursorY - 2 + cornerLen);
      doc.line(qrX - 2, cursorY + qrSize + 2, qrX - 2 + cornerLen, cursorY + qrSize + 2);
      doc.line(qrX - 2, cursorY + qrSize + 2, qrX - 2, cursorY + qrSize + 2 - cornerLen);
      doc.line(qrX + qrSize + 2, cursorY + qrSize + 2, qrX + qrSize + 2 - cornerLen, cursorY + qrSize + 2);
      doc.line(qrX + qrSize + 2, cursorY + qrSize + 2, qrX + qrSize + 2, cursorY + qrSize + 2 - cornerLen);

      const qrCodeImg = await generateQRCodeDataURL({ 
        code: ticketCode, 
        ticketCode: ticketCode,
        qr_code: ticketCode 
      }, 500);
      
      if (qrCodeImg) {
        try {
          doc.addImage(qrCodeImg, "PNG", qrX, cursorY, qrSize, qrSize);
        } catch (error) {
          console.error("Error adding QR code to PDF:", error);
          doc.setFillColor(240, 240, 240);
          doc.rect(qrX, cursorY, qrSize, qrSize, "F");
          doc.setTextColor(150, 150, 150);
          doc.setFontSize(8);
          doc.text("QR Code", qrX + qrSize/2, cursorY + qrSize/2, { align: "center" });
        }
      }

      cursorY += qrSize + 6;

      // --- 7. CODE DU BILLET ---
      doc.setFont("courier", "bold");
      doc.setFontSize(12);
      doc.setTextColor(0, 0, 0);
      doc.text(ticketCode.split("").join(" "), pageWidth / 2, cursorY, { align: "center" });
      cursorY += 6;
      
      // --- 8. DATE D'ACHAT ---
      if (purchaseDateDisplay) {
        doc.setFont("helvetica", "italic");
        doc.setFontSize(6);
        doc.setTextColor(120, 120, 120);
        doc.text(`Acheté le ${purchaseDateDisplay}`, pageWidth / 2, cursorY, { align: "center" });
        cursorY += 4;
      }

      // --- 9. LIEN DU SITE ---
      doc.setFont("helvetica", "bold");
      doc.setFontSize(8);
      doc.setTextColor(...darkOnColor);
      doc.text("www.bonplaninfos.net", pageWidth / 2, cursorY, { align: "center" });
      cursorY += 5;

      // --- 10. FOOTER ---
      const footerY = pageHeight - bottomMargin;
      doc.setFontSize(5);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(150, 150, 150);
      doc.text("Valable une seule fois • scannez à l'entrée et à la sortie", pageWidth / 2, footerY, { align: "center" });
    }

    const cleanTitle = (event?.title || tickets[0]?.event_title || "billet")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/(^_+|_+$)/g, "")
      .substring(0, 30);
    
    const fileName = `Billet_${cleanTitle}_${Date.now()}.pdf`;

    if (returnBlob) {
      return { doc, fileName, blob: doc.output('blob') };
    }

    openPDFInNewTab(doc, fileName);
    
    return true;
  } catch (error) {
    console.error("Error generating PDF:", error);
    if (window.toast) {
      window.toast({
        title: "❌ Erreur",
        description: error.message || "Impossible de générer le billet",
        variant: "destructive",
      });
    }
    return false;
  }
};

export default generateTicketPDF;