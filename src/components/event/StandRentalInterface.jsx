import React, { useState, useEffect } from "react";
import { supabase } from "@/lib/customSupabaseClient";
import { useAuth } from "@/contexts/SupabaseAuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Loader2,
  Store,
  CheckCircle,
  Layout,
  Lock,
  ArrowRight,
  Building,
  Package,
  Copy,
  Printer,
  BadgeCheck,
  Briefcase,
  Tag,
  UserCircle,
  CreditCard,
  Ticket,
  FileDown,
  Search,
  BarChart3,
  Coins,
  Grid3x3,
  ShoppingCart,
  PlusCircle,
  Trash2,
  Users,
  Bookmark,
  Eye,
  MoreVertical,
  Bed,
  Tent,
  Hotel,
  Home,
  Compass,
  User,
  Calendar,
  Trophy,
  Pencil,
  Save,
} from "lucide-react";
import ImageUpload from "@/components/ImageUpload";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "@/components/ui/use-toast";
import { useNavigate } from "react-router-dom";
import USSDPaymentModal, { openBonplaninfosRelance } from "@/components/payment/USSDPaymentModal";
import { Progress } from "@/components/ui/progress";
import { motion } from "framer-motion";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import QRCode from "qrcode";
import * as XLSX from "xlsx";
import { saveAs } from "file-saver";

// ============================================
// UTILITAIRE DE FORMATAGE DES PRIX - VERSION ULTRA ROBUSTE
// ============================================
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
    // 🔥 CORRECTION: Enlever TOUS les caractères non numériques
    // Garder seulement les chiffres, les virgules et les points
    let clean = amount.replace(/[^0-9,.]/g, '');
    // Si la chaîne est vide après nettoyage
    if (clean === '') return "0";
    // Remplacer la virgule par un point
    clean = clean.replace(',', '.');
    numAmount = parseFloat(clean);
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
  
  // 🔥 CORRECTION: Formater avec l'espace comme séparateur de milliers
  // Utiliser toLocaleString('fr-FR') qui ajoute des espaces
  return numAmount.toLocaleString('fr-FR');
};
// Types de location avec icônes uniquement
const RENTAL_TYPES = {
  STAND: {
    id: "stand",
    label: "Stand d'exposition",
    icon: Store,
    color: "blue",
    fields: ["companyName", "contactPerson", "email", "phone", "description"],
    requiredFields: ["companyName", "contactPerson", "phone"],
    description: "Espace pour exposer vos produits ou services",
    placeholder: "Nom de votre entreprise",
  },
  ACCOMMODATION: {
    id: "accommodation",
    label: "Hébergement / Case à dormir",
    icon: Bed,
    color: "green",
    fields: ["guestName", "email", "phone", "checkIn", "checkOut", "specialRequests"],
    requiredFields: ["guestName", "phone"],
    description: "Nuitée sur le site de l'événement",
    placeholder: "Votre nom complet",
  },
  CAMPING: {
    id: "camping",
    label: "Emplacement Camping",
    icon: Tent,
    color: "orange",
    fields: ["guestName", "email", "phone", "checkIn", "checkOut", "tentSize", "specialRequests"],
    requiredFields: ["guestName", "phone"],
    description: "Espace pour tente ou camping-car",
    placeholder: "Votre nom complet",
  },
  GLAMPING: {
    id: "glamping",
    label: "Glamping / Tente Luxe",
    icon: Hotel,
    color: "purple",
    fields: ["guestName", "email", "phone", "checkIn", "checkOut", "specialRequests"],
    requiredFields: ["guestName", "phone"],
    description: "Tente tout équipée avec confort premium",
    placeholder: "Votre nom complet",
  },
};

const STAND_COLORS = [
  {
    border: "border-blue-600",
    borderLight: "border-blue-500/30",
    bg: "bg-blue-950/30",
    bgSolid: "bg-blue-600",
    bgHover: "hover:bg-blue-700",
    text: "text-blue-400",
    badge: "bg-blue-900 text-blue-200",
    iconBg: "bg-blue-900/50",
    gradient: "from-blue-900/20 to-transparent",
    shadow: "hover:shadow-blue-500/10",
    progress: "[&>div]:bg-blue-500",
  },
  {
    border: "border-green-600",
    borderLight: "border-green-500/30",
    bg: "bg-green-950/30",
    bgSolid: "bg-green-600",
    bgHover: "hover:bg-green-700",
    text: "text-green-400",
    badge: "bg-green-900 text-green-200",
    iconBg: "bg-green-900/50",
    gradient: "from-green-900/20 to-transparent",
    shadow: "hover:shadow-green-500/10",
    progress: "[&>div]:bg-green-500",
  },
  {
    border: "border-purple-600",
    borderLight: "border-purple-500/30",
    bg: "bg-purple-950/30",
    bgSolid: "bg-purple-600",
    bgHover: "hover:bg-purple-700",
    text: "text-purple-400",
    badge: "bg-purple-900 text-purple-200",
    iconBg: "bg-purple-900/50",
    gradient: "from-purple-900/20 to-transparent",
    shadow: "hover:shadow-purple-500/10",
    progress: "[&>div]:bg-purple-500",
  },
  {
    border: "border-orange-600",
    borderLight: "border-orange-500/30",
    bg: "bg-orange-950/30",
    bgSolid: "bg-orange-600",
    bgHover: "hover:bg-orange-700",
    text: "text-orange-400",
    badge: "bg-orange-900 text-orange-200",
    iconBg: "bg-orange-900/50",
    gradient: "from-orange-900/20 to-transparent",
    shadow: "hover:shadow-orange-500/10",
    progress: "[&>div]:bg-orange-500",
  },
  {
    border: "border-pink-600",
    borderLight: "border-pink-500/30",
    bg: "bg-pink-950/30",
    bgSolid: "bg-pink-600",
    bgHover: "hover:bg-pink-700",
    text: "text-pink-400",
    badge: "bg-pink-900 text-pink-200",
    iconBg: "bg-pink-900/50",
    gradient: "from-pink-900/20 to-transparent",
    shadow: "hover:shadow-pink-500/10",
    progress: "[&>div]:bg-pink-500",
  },
  {
    border: "border-indigo-600",
    borderLight: "border-indigo-500/30",
    bg: "bg-indigo-950/30",
    bgSolid: "bg-indigo-600",
    bgHover: "hover:bg-indigo-700",
    text: "text-indigo-400",
    badge: "bg-indigo-900 text-indigo-200",
    iconBg: "bg-indigo-900/50",
    gradient: "from-indigo-900/20 to-transparent",
    shadow: "hover:shadow-indigo-500/10",
    progress: "[&>div]:bg-indigo-500",
  },
];

// Composant pour afficher le type de location avec icône
const RentalTypeIcon = ({ type, size = "w-16 h-16", className = "" }) => {
  const typeInfo = getRentalTypeInfo(type);
  const Icon = typeInfo.icon;
  const color = typeInfo.color;
  const label = typeInfo.label;
  
  return (
    <div className={`flex flex-col items-center justify-center gap-2 ${className}`}>
      <div className={`${size} rounded-2xl bg-${color}-900/30 border-2 border-${color}-500/50 flex items-center justify-center transition-all hover:scale-110 hover:shadow-lg hover:shadow-${color}-500/20`}>
        <Icon className={`w-8 h-8 text-${color}-400`} />
      </div>
      <span className={`text-xs font-medium text-${color}-300 text-center`}>{label}</span>
    </div>
  );
};

const StandRentalInterface = ({ event, isUnlocked, onRefresh, isClosed }) => {
  const { user } = useAuth();
  const navigate = useNavigate();

  const [standTypes, setStandTypes] = useState([]);
  const [standEventId, setStandEventId] = useState(null);
  const [myRentals, setMyRentals] = useState([]);
  const [loading, setLoading] = useState(true);
  const [cartStands, setCartStands] = useState([]);
  const [isRenting, setIsRenting] = useState(false);
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [allRentals, setAllRentals] = useState([]);
  const [filteredRentals, setFilteredRentals] = useState([]);
  const [activeTabs, setActiveTabs] = useState({});
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedType, setSelectedType] = useState("all");
  const [isExporting, setIsExporting] = useState(false);
  const [selectedRentalForDetails, setSelectedRentalForDetails] = useState(null);
  const [isDetailsDialogOpen, setIsDetailsDialogOpen] = useState(false);
  const [qrCodeUrl, setQrCodeUrl] = useState(null);
  const [selectedRentalType, setSelectedRentalType] = useState("stand");
  const [standPaymentMethod, setStandPaymentMethod] = useState("coins");
  const [showUSSDModal, setShowUSSDModal] = useState(false);
  const [ussdAmount, setUssdAmount] = useState(0);
  const [ussdStandData, setUssdStandData] = useState(null);
  const [ussdSuccess, setUssdSuccess] = useState(false);
  
  const [statistics, setStatistics] = useState({
    totalStands: 0,
    totalRentals: 0,
    totalRevenue: 0,
    totalRevenueFcfa: 0,
    totalCommission: 0,
    totalNetGain: 0,
    occupancyRate: 0,
    byType: [],
    byCompany: [],
  });

  const COIN_RATE = 10;
  const COMMISSION_RATE = 0;
  const isOrganizer = user?.id === event?.organizer_id;

  // Formulaire adapté au type de location
  const [formData, setFormData] = useState({
    // Stand
    companyName: "",
    contactPerson: "",
    email: user?.email || "",
    phone: "",
    description: "",
    // Hébergement
    guestName: "",
    checkIn: "",
    checkOut: "",
    tentSize: "",
    specialRequests: "",
  });

  // ==================== UTILITAIRES ====================
  const copyToClipboard = async (text, label) => {
    try {
      await navigator.clipboard.writeText(text);
      toast({
        title: "✅ Copié !",
        description: `${label} copié.`,
        className: "bg-green-600 text-white",
      });
    } catch {
      toast({
        title: "Erreur",
        description: "Impossible de copier.",
        variant: "destructive",
      });
    }
  };

  const generateUniqueBookingCode = async (retries = 3) => {
    const generate = () => {
      const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
      let code = "";
      for (let i = 0; i < 4; i++) {
        code += chars.charAt(Math.floor(Math.random() * chars.length));
      }
      return code;
    };

    for (let attempt = 0; attempt < retries; attempt++) {
      const code = generate();
      const { data, error } = await supabase
        .from("stand_rentals")
        .select("booking_code")
        .eq("booking_code", code)
        .maybeSingle();
      if (error || !data) return code;
    }
    return "R" + Date.now().toString(36).slice(-3).toUpperCase();
  };

  const generateQRCode = async (text) => {
    try {
      return await QRCode.toDataURL(text);
    } catch (err) {
      console.error("QR Code error:", err);
      return null;
    }
  };

  // ==================== EXPORTS ====================
const exportToExcel = () => {
  if (!filteredRentals.length) return;
  const data = filteredRentals.map((r) => {
    // 🔥 Nettoyer le montant avant de le formater
    let amountPi = r.rental_amount_pi;
    if (typeof amountPi === 'string') {
      amountPi = parseFloat(amountPi.replace(/[^0-9,.]/g, '').replace(',', '.'));
    }
    const amount = (parseFloat(amountPi) || 0) * COIN_RATE;
    
    return {
      "N° Stand": r.stand_number,
      "Nom/Locataire": r.company_name || r.guest_name || "",
      "Type": r.rental_type || "stand",
      "Contact": r.contact_person || r.guest_name || "",
      "Email": r.contact_email || "",
      "Téléphone": r.contact_phone || "",
      "Code Réservation": r.booking_code || "",
      "Type Stand": r.stand_types?.name || "",
      "Montant (π)": parseFloat(amountPi) || 0,
      "Montant (F CFA)": formatPrice(amount),
    };
  });
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Réservations");
    const excelBuffer = XLSX.write(wb, { bookType: "xlsx", type: "array" });
    saveAs(
      new Blob([excelBuffer], { type: "application/octet-stream" }),
      "reservations_stands.xlsx"
    );
  };

  const exportToPDF = () => {
    setIsExporting(true);
    try {
      const doc = new jsPDF('landscape', 'mm', 'a4');
      const pageWidth = doc.internal.pageSize.getWidth();
      const pageHeight = doc.internal.pageSize.getHeight();
      
      // En-tête
      doc.setFontSize(18);
      doc.setTextColor(41, 128, 185);
      doc.text(`Réservations - ${event?.title || "Événement"}`, 14, 20);
      
      doc.setFontSize(10);
      doc.setTextColor(100);
      doc.text(`Généré le ${new Date().toLocaleDateString("fr-FR")} à ${new Date().toLocaleTimeString("fr-FR")}`, 14, 28);
      
      // Résumé avec format correct
      doc.setFontSize(12);
      doc.setTextColor(0);
      const totalRevenue = filteredRentals.reduce((s, r) => s + (r.rental_amount_pi || 0), 0);
      doc.text(`Total réservations: ${filteredRentals.length}`, 14, 40);
      doc.text(`Revenu total: ${formatPrice(totalRevenue)} π (${formatPrice(totalRevenue * COIN_RATE)} FCFA)`, 14, 48);
      
      const tableColumn = [
        "N° Stand",
        "Nom/Locataire",
        "Type",
        "Contact",
        "Email",
        "Téléphone",
        "Code Réservation",
        "Type Stand",
        "Arrivée",
        "Départ",
        "Montant (π)",
        "Montant (F CFA)"
      ];
      
      const tableRows = filteredRentals.map((r) => {
        const rentalType = r.rental_type || "stand";
        const rentalTypeInfo = RENTAL_TYPES[rentalType.toUpperCase()] || RENTAL_TYPES.STAND;
        
        const locataire = r.company_name || r.guest_name || "N/A";
        const contact = r.contact_person || r.guest_name || "N/A";
        const email = r.contact_email || "N/A";
        const phone = r.contact_phone || "N/A";
        const bookingCode = r.booking_code || "N/A";
        
        let standType = r.stand_types?.name || "N/A";
        if (r.stand_types?.size) {
          standType += ` (${r.stand_types.size})`;
        }
        
        const checkIn = r.check_in_date ? new Date(r.check_in_date).toLocaleDateString("fr-FR") : "N/A";
        const checkOut = r.check_out_date ? new Date(r.check_out_date).toLocaleDateString("fr-FR") : "N/A";
        
        const amountPi = r.rental_amount_pi || 0;
        const amountFcfa = formatPrice(amountPi * COIN_RATE);
        
        return [
          r.stand_number || "N/A",
          locataire,
          rentalTypeInfo.label || rentalType,
          contact,
          email,
          phone,
          bookingCode,
          standType,
          checkIn,
          checkOut,
          formatPrice(amountPi),
          amountFcfa
        ];
      });
      
      autoTable(doc, {
        head: [tableColumn],
        body: tableRows,
        startY: 55,
        theme: "striped",
        headStyles: { 
          fillColor: [41, 128, 185],
          textColor: [255, 255, 255],
          fontSize: 7,
          cellPadding: 2,
          halign: 'center',
        },
        styles: { 
          fontSize: 6,
          cellPadding: 1.5,
          overflow: 'linebreak',
          halign: 'center',
        },
        columnStyles: {
          0: { cellWidth: 15 },
          1: { cellWidth: 25 },
          2: { cellWidth: 22 },
          3: { cellWidth: 22 },
          4: { cellWidth: 28 },
          5: { cellWidth: 18 },
          6: { cellWidth: 18 },
          7: { cellWidth: 25 },
          8: { cellWidth: 18 },
          9: { cellWidth: 18 },
          10: { cellWidth: 18 },
          11: { cellWidth: 22 },
        },
        alternateRowStyles: {
          fillColor: [240, 240, 240],
        },
        didDrawPage: function(data) {
          doc.setFontSize(7);
          doc.setTextColor(150);
          const pageCount = doc.internal.getNumberOfPages();
          const currentPage = doc.internal.getCurrentPageInfo().pageNumber;
          doc.text(
            `Page ${currentPage}/${pageCount} - ${event?.title || "Réservations"}`,
            pageWidth - 45,
            pageHeight - 10
          );
        }
      });
      
      const finalY = doc.lastAutoTable.finalY + 10;
      doc.setFontSize(10);
      doc.setTextColor(0);
      doc.text(`Résumé: ${filteredRentals.length} réservation(s)`, 14, finalY);
      doc.text(`Total: ${formatPrice(totalRevenue)} π (${formatPrice(totalRevenue * COIN_RATE)} FCFA)`, 14, finalY + 8);
      
      const byType = {};
      filteredRentals.forEach(r => {
        const type = r.rental_type || "stand";
        byType[type] = (byType[type] || 0) + 1;
      });
      
      let typeSummary = "Répartition: ";
      Object.entries(byType).forEach(([type, count], index) => {
        const typeInfo = RENTAL_TYPES[type.toUpperCase()] || RENTAL_TYPES.STAND;
        typeSummary += `${typeInfo.label}: ${count}`;
        if (index < Object.entries(byType).length - 1) typeSummary += ", ";
      });
      
      doc.text(typeSummary, 14, finalY + 16);
      
      doc.setFontSize(8);
      doc.setTextColor(150);
      doc.text(
        `Généré automatiquement le ${new Date().toLocaleString("fr-FR")}`,
        14,
        pageHeight - 10
      );
      
      doc.save(`reservations-${event?.title?.replace(/\s+/g, "-").toLowerCase() || "evenement"}.pdf`);
      
      toast({
        title: "✅ Export réussi",
        description: `PDF téléchargé avec ${filteredRentals.length} réservation(s).`,
        className: "bg-green-600 text-white",
      });
      
    } catch (error) {
      console.error("❌ Erreur export PDF:", error);
      toast({
        title: "Erreur",
        description: "Export PDF impossible.",
        variant: "destructive",
      });
    } finally {
      setIsExporting(false);
    }
  };

 const exportCompanyListExcel = () => {
  if (!statistics.byCompany.length) return;
  const data = statistics.byCompany.map((c) => {
    // 🔥 Nettoyer le montant avant de le formater
    let totalAmount = c.totalAmount;
    if (typeof totalAmount === 'string') {
      totalAmount = parseFloat(totalAmount.replace(/[^0-9,.]/g, '').replace(',', '.'));
    }
    const amount = (parseFloat(totalAmount) || 0) * COIN_RATE;
    
    return {
      "Nom": c.companyName || c.guestName,
      "Contact": c.contactPerson || c.guestName,
      "Email": c.contactEmail,
      "Téléphone": c.contactPhone,
      "Type": c.rentalType || "stand",
      "Nombre": c.rentals.length,
      "Montant total (π)": formatPrice(parseFloat(totalAmount) || 0),
      "Montant total (F CFA)": formatPrice(amount)
    };
  });
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Participants");
    const excelBuffer = XLSX.write(wb, { bookType: "xlsx", type: "array" });
    saveAs(
      new Blob([excelBuffer], { type: "application/octet-stream" }),
      "liste_participants_stands.xlsx"
    );
  };

  // ==================== DONNÉES & STATISTIQUES ====================
  const fetchStandData = async () => {
    setLoading(true);
    try {
      const { data: standEvent, error: standEventError } = await supabase
        .from("stand_events")
        .select("id")
        .eq("event_id", event.id)
        .maybeSingle();
      if (standEventError) throw standEventError;
      if (!standEvent) {
        setStandTypes([]);
        setStandEventId(null);
        setLoading(false);
        return;
      }
      setStandEventId(standEvent.id);

      const { data: types, error: typesError } = await supabase
        .from("stand_types")
        .select("*")
        .eq("stand_event_id", standEvent.id)
        .eq("is_active", true)
        .order("calculated_price_pi", { ascending: true });
      if (typesError) throw typesError;
      setStandTypes(types || []);

      if (user) {
        const { data: rentals, error: rentalError } = await supabase
          .from("stand_rentals")
          .select(
            "*, stand_types(name, size, amenities, base_price, base_currency, calculated_price_pi, description, rental_type), profiles(full_name, phone)",
          )
          .eq("user_id", user.id)
          .eq("stand_event_id", standEvent.id)
          .order("created_at", { ascending: false });
        if (!rentalError) setMyRentals(rentals || []);

        if (isOrganizer) {
          const { data: allRentalsData, error: allRentalsError } =
            await supabase
              .from("stand_rentals")
              .select(
                "*, stand_types(name, size, base_price, base_currency, calculated_price_pi, description, rental_type), profiles(full_name, phone)",
              )
              .eq("stand_event_id", standEvent.id)
              .order("created_at", { ascending: false });
          if (!allRentalsError) {
            setAllRentals(allRentalsData || []);
            setFilteredRentals(allRentalsData || []);
          }
        }
      }
    } catch (error) {
      console.error(error);
      toast({
        title: "Erreur",
        description: "Impossible de charger les stands.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const calculateStatistics = () => {
    const totalStands = standTypes.reduce(
      (sum, t) => sum + (t.quantity_available || 0),
      0,
    );
    const totalRentals = allRentals.length;
    const totalRevenue = allRentals.reduce(
      (sum, r) => sum + (r.rental_amount_pi || 0),
      0,
    );
    const totalRevenueFcfa = totalRevenue * COIN_RATE;
    const totalCommission = 0;
    const totalNetGain = totalRevenueFcfa;
    const occupancyRate =
      totalStands > 0 ? (totalRentals / totalStands) * 100 : 0;

    const byType = standTypes.map((type) => {
      const typeRentals = allRentals.filter((r) => r.stand_type_id === type.id);
      const rented = typeRentals.length;
      const available = type.quantity_available || 0;
      const revenue = typeRentals.reduce(
        (s, r) => s + (r.rental_amount_pi || 0),
        0,
      );
      const revenueFcfa = revenue * COIN_RATE;
      const commission = 0;
      const netGain = revenueFcfa;
      const rate = available > 0 ? (rented / available) * 100 : 0;
      return {
        ...type,
        rented,
        available,
        revenue,
        revenueFcfa,
        commission,
        netGain,
        rate,
        remaining: available - rented,
      };
    });

    const companyMap = new Map();
    allRentals.forEach((rental) => {
      const name = rental.company_name || rental.guest_name || "Anonyme";
      if (!companyMap.has(name)) {
        companyMap.set(name, {
          companyName: rental.company_name || "",
          guestName: rental.guest_name || "",
          contactPerson: rental.contact_person || rental.guest_name || "",
          contactEmail: rental.contact_email || "",
          contactPhone: rental.contact_phone || "",
          rentalType: rental.rental_type || "stand",
          rentals: [],
          totalAmount: 0,
          bookingCodes: new Set(),
        });
      }
      const company = companyMap.get(name);
      company.rentals.push(rental);
      company.totalAmount += rental.rental_amount_pi;
      if (rental.booking_code) company.bookingCodes.add(rental.booking_code);
    });
    const byCompany = Array.from(companyMap.values()).map((c) => ({
      ...c,
      bookingCodes: Array.from(c.bookingCodes),
    }));

    setStatistics({
      totalStands,
      totalRentals,
      totalRevenue,
      totalRevenueFcfa,
      totalCommission,
      totalNetGain,
      occupancyRate,
      byType,
      byCompany,
    });
  };

  useEffect(() => {
    if (event?.id) fetchStandData();
  }, [event?.id, user?.id]);

  useEffect(() => {
    if (standTypes.length > 0 || allRentals.length >= 0) calculateStatistics();
  }, [standTypes, allRentals]);

  useEffect(() => {
    let filtered = [...allRentals];
    if (searchTerm) {
      const lower = searchTerm.toLowerCase();
      filtered = filtered.filter((r) =>
        [
          r.company_name,
          r.guest_name,
          r.contact_person,
          r.contact_email,
          r.stand_number,
          r.booking_code,
        ].some((f) => f?.toLowerCase().includes(lower)),
      );
    }
    if (selectedType !== "all")
      filtered = filtered.filter((r) => r.stand_type_id === selectedType);
    setFilteredRentals(filtered);
  }, [allRentals, searchTerm, selectedType]);

  // ==================== PANIER ====================
  const handleAddToCart = (type) => {
    if (isClosed) return;
    const available = type.quantity_available - (type.quantity_rented || 0);
    const inCart = cartStands.filter((t) => t.id === type.id).length;
    if (available - inCart <= 0) {
      toast({
        title: "Stock épuisé",
        description: "Plus de stands disponibles.",
        variant: "destructive",
      });
      return;
    }
    setCartStands([...cartStands, type]);
    if (type.rental_type) {
      setSelectedRentalType(type.rental_type);
    }
    toast({
      title: "✅ Ajouté",
      description: `1x ${type.name} ajouté.`,
      className: "bg-green-600 text-white",
    });
  };

  const updateQuantity = (typeId, newQuantity) => {
    const type = cartStands.find((t) => t.id === typeId);
    if (!type) return;
    const currentCount = cartStands.filter((t) => t.id === typeId).length;
    const available = type.quantity_available - (type.quantity_rented || 0);
    if (newQuantity > currentCount) {
      const toAdd = newQuantity - currentCount;
      if (currentCount + toAdd > available) {
        toast({
          title: "Stock insuffisant",
          description: `Seulement ${available} disponible(s).`,
          variant: "destructive",
        });
        return;
      }
      for (let i = 0; i < toAdd; i++) setCartStands((prev) => [...prev, type]);
    } else if (newQuantity < currentCount) {
      let toRemove = currentCount - newQuantity;
      setCartStands((prev) =>
        prev.filter((item) => !(item.id === typeId && toRemove-- > 0)),
      );
    }
  };

  const getCartTotal = () =>
    cartStands.reduce((sum, item) => sum + item.calculated_price_pi, 0);
  const getCartCountByType = (typeId) =>
    cartStands.filter((t) => t.id === typeId).length;
  const clearCart = () => setCartStands([]);

  const getRentalTypeInfo = (type) => {
    const rentalType = type?.toUpperCase() || "STAND";
    return RENTAL_TYPES[rentalType] || RENTAL_TYPES.STAND;
  };

  const handleRentMultipleStands = async () => {
    if (isClosed || !user) {
      if (!user) {
        toast({ 
          title: "Connexion requise", 
          description: "Veuillez vous connecter pour réserver.", 
          variant: "destructive" 
        });
        return;
      }
      return;
    }
    
    if (cartStands.length === 0) {
      toast({ 
        title: "Panier vide", 
        description: "Ajoutez des stands à votre panier.", 
        variant: "destructive" 
      });
      return;
    }

    setIsRenting(true);
    const successList = [];
    const failureList = [];
    const generatedBookingCodes = [];

    try {
      const totalPi = getCartTotal();
      
      const { data: profile, error: profileError } = await supabase
        .from("profiles")
        .select("coin_balance")
        .eq("id", user.id)
        .single();
        
      if (profileError) throw profileError;
      
      if (profile.coin_balance < totalPi) {
        toast({
          title: "Solde insuffisant",
          description: (
            <div className="space-y-2">
              <p>Total: {totalPi} π - Votre solde: {profile.coin_balance} π</p>
              <Button onClick={() => navigate("/packs")} className="w-full">
                Acheter des pièces
              </Button>
            </div>
          ),
          variant: "destructive",
        });
        setIsRenting(false);
        return;
      }

      const rentalType = cartStands[0]?.rental_type || "stand";
      const isAccommodation = rentalType !== "stand";

      if (rentalType === "stand" && !formData.companyName) {
        toast({ 
          title: "Champ requis", 
          description: "Veuillez saisir le nom de votre entreprise.", 
          variant: "destructive" 
        });
        setIsRenting(false);
        return;
      }
      
      if (isAccommodation && !formData.guestName) {
        toast({ 
          title: "Champ requis", 
          description: "Veuillez saisir votre nom complet.", 
          variant: "destructive" 
        });
        setIsRenting(false);
        return;
      }

      if (!formData.phone) {
        toast({ 
          title: "Champ requis", 
          description: "Veuillez saisir votre numéro de téléphone.", 
          variant: "destructive" 
        });
        setIsRenting(false);
        return;
      }

      for (const stand of cartStands) {
        const bookingCode = await generateUniqueBookingCode();
        
        const rentalData = {
          p_event_id: event.id,
          p_user_id: user.id,
          p_stand_type_id: stand.id,
          p_booking_code: bookingCode,
          p_rental_type: rentalType,
          p_contact_email: formData.email || user?.email || '',
          p_contact_phone: formData.phone || '',
          p_company_name: rentalType === "stand" ? formData.companyName : null,
          p_contact_person: rentalType === "stand" ? formData.contactPerson : formData.guestName,
          p_business_description: rentalType === "stand" ? formData.description : null,
          p_guest_name: isAccommodation ? formData.guestName : null,
          p_check_in_date: isAccommodation ? formData.checkIn || null : null,
          p_check_out_date: isAccommodation ? formData.checkOut || null : null,
          p_tent_size: rentalType === "camping" ? formData.tentSize || null : null,
          p_special_requests: isAccommodation ? formData.specialRequests || null : null,
        };

        console.log("📤 Appel de rent_stand avec:", JSON.stringify(rentalData, null, 2));

        const { data, error } = await supabase.rpc("rent_stand", rentalData);

        if (error) {
          console.error("❌ Erreur rent_stand:", error);
          failureList.push({ 
            name: stand.name, 
            error: error.message || "Erreur inconnue" 
          });
        } else if (!data?.success) {
          console.error("❌ Échec réservation:", data?.message);
          failureList.push({ 
            name: stand.name, 
            error: data?.message || "Erreur inconnue" 
          });
        } else {
          console.log("✅ Réservation réussie:", data);
          successList.push(stand);
          generatedBookingCodes.push(data.booking_code || bookingCode);
        }
      }

      if (failureList.length > 0) {
        const errorSummary = failureList.map((f) => `${f.name} : ${f.error}`).join("\n");
        toast({
          title: successList.length === 0 ? "❌ Réservations échouées" : "⚠️ Réservations partiellement réussies",
          description: (
            <div className="text-sm max-h-[300px] overflow-y-auto">
              {successList.length > 0 && (
                <p className="font-semibold text-green-400">
                  ✅ Réussies : {successList.map((s) => s.name).join(", ")}
                </p>
              )}
              <p className="font-semibold text-red-400 mt-2">❌ Échecs :</p>
              <pre className="text-xs bg-black/30 p-2 rounded whitespace-pre-wrap max-h-[150px] overflow-y-auto">
                {errorSummary}
              </pre>
            </div>
          ),
          variant: "destructive",
          duration: 8000,
        });

        const failedStandNames = failureList.map((f) => f.name);
        const remainingStands = cartStands.filter((s) => 
          failedStandNames.includes(s.name)
        );
        setCartStands(remainingStands);
        await fetchStandData();
        if (onRefresh) onRefresh();
        setIsRenting(false);
        return;
      }

      const baseUrl = window.location.origin;
      const orderId = Date.now().toString(36).toUpperCase();
      const qrCodes = generatedBookingCodes.join(",");
      
      toast({
        title: "✅ Réservations confirmées !",
        description: (
          <div className="space-y-2">
            <p className="font-bold">{cartStands.length} réservation(s) confirmée(s).</p>
            <p className="text-xs text-gray-300">
              Codes: {generatedBookingCodes.join(", ")}
            </p>
            <div className="mt-2 p-2 bg-black/30 rounded-lg">
              <p className="text-xs text-gray-400">
                📱 QR Code disponible dans vos réservations
              </p>
            </div>
          </div>
        ),
        className: "bg-green-600 text-white",
        duration: 5000,
      });

      setCartStands([]);
      setIsCartOpen(false);
      setFormData({ 
        companyName: "", 
        contactPerson: "", 
        email: user?.email || "", 
        phone: "", 
        description: "",
        guestName: "",
        checkIn: "",
        checkOut: "",
        tentSize: "",
        specialRequests: "",
      });
      
      await fetchStandData();
      if (onRefresh) onRefresh();
      
    } catch (error) {
      console.error("❌ Erreur système:", error);
      toast({ 
        title: "Erreur système", 
        description: error.message || "Impossible de traiter la demande.", 
        variant: "destructive" 
      });
    } finally {
      setIsRenting(false);
    }
  };

  const viewRentalDetails = async (rental) => {
    setSelectedRentalForDetails(rental);
    const baseUrl = window.location.origin;
    const qrUrl = `${baseUrl}/stand-booking?code=${rental.booking_code}`;
    const qr = await generateQRCode(qrUrl);
    setQrCodeUrl(qr);
    setIsDetailsDialogOpen(true);
  };

  const handleBuyCoins = () => navigate("/packs");

  const getStandCartPayload = () => {
    const counts = {};
    cartStands.forEach((s) => {
      counts[s.id] = (counts[s.id] || 0) + 1;
    });
    return Object.entries(counts).map(([standTypeId, qty]) => ({
      standTypeId,
      quantity: qty,
    }));
  };

  const openStandUSSD = () => {
    if (isClosed || !user) {
      if (!user) {
        toast({
          title: "Connexion requise",
          description: "Veuillez vous connecter pour réserver.",
          variant: "destructive",
        });
      }
      return;
    }
    if (cartStands.length === 0) {
      toast({ title: "Panier vide", description: "Ajoutez des stands à votre panier.", variant: "destructive" });
      return;
    }
    const rentalType = cartStands[0]?.rental_type || "stand";
    if (rentalType === "stand" && !formData.companyName) {
      toast({ title: "Champ requis", description: "Veuillez saisir le nom de votre entreprise.", variant: "destructive" });
      return;
    }
    setUssdSuccess(false);
    setUssdStandData({
      txnId: `ussd_stand_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
      rentalType,
    });
    setUssdAmount(getCartTotal() * COIN_RATE);
    setIsCartOpen(false);
    setShowUSSDModal(true);
  };

  const confirmStandUSSD = async (proofDataUrl, phoneInput) => {
    const data = ussdStandData;
    if (!data) throw new Error("Données de paiement manquantes.");
    try {
      const response = await fetch("/.netlify/functions/ussd-payment", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({
          action: "submit",
          type: "stand_rental",
          transactionId: data.txnId,
          userId: user?.id,
          eventId: event?.id,
          standCart: getStandCartPayload(),
          amountFcfa: getCartTotal() * COIN_RATE,
          phone: phoneInput || formData.phone || "",
          proofDataUrl: proofDataUrl || null,
          companyName: formData.companyName,
          contactPerson: formData.contactPerson,
          contactEmail: formData.email,
          businessDescription: formData.description,
          rentalType: data.rentalType,
          guestName: formData.guestName,
          checkIn: formData.checkIn,
          checkOut: formData.checkOut,
          tentSize: formData.tentSize,
          specialRequests: formData.specialRequests,
        }),
      });
      const text = await response.text();
      let result;
      try { result = JSON.parse(text); } catch { throw new Error("La réponse du serveur n'est pas un JSON valide"); }
      if (!response.ok || !result.success) throw new Error(result.message || `Erreur HTTP ${response.status}`);
      toast({
        title: "🎉 Paiement enregistré !",
        description: result.message || "Votre réservation sera confirmée après validation du dépôt.",
      });
      clearCart();
      setUssdSuccess(true);
      await fetchStandData();
      if (onRefresh) onRefresh();
      return true;
    } catch (error) {
      toast({ title: "Erreur de paiement", description: error.message || "Impossible d'enregistrer le paiement.", variant: "destructive" });
      throw error;
    }
  };

  const handleStandCheckout = () => {
    if (standPaymentMethod === "ussd") { openStandUSSD(); return; }
    handleRentMultipleStands();
  };

  // ==================== RENDU DU FORMULAIRE ADAPTÉ ====================
  const renderFormFields = () => {
    const rentalType = cartStands[0]?.rental_type || "stand";
    const typeInfo = getRentalTypeInfo(rentalType);
    const Icon = typeInfo.icon;
    const color = typeInfo.color;
    
    if (rentalType === "stand") {
      return (
        <div className="space-y-4">
          <div className="bg-blue-500/10 p-3 rounded-lg border border-blue-500/20 flex items-center gap-3">
            <Store className="w-5 h-5 text-blue-400" />
            <div>
              <p className="text-sm font-medium text-white">Stand d'exposition</p>
              <p className="text-xs text-gray-400">Remplissez les informations de votre entreprise</p>
            </div>
          </div>
          
          <div>
            <Label className="text-gray-300 flex items-center gap-2">
              <Building className="w-4 h-4 text-blue-400" />
              Entreprise / Marque <span className="text-red-400">*</span>
            </Label>
            <Input
              value={formData.companyName}
              onChange={(e) =>
                setFormData({ ...formData, companyName: e.target.value })
              }
              placeholder="Nom de votre entreprise"
              className="bg-gray-800 border-gray-700 text-white mt-1"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-gray-300 flex items-center gap-2">
                <UserCircle className="w-4 h-4 text-blue-400" />
                Personne à contacter <span className="text-red-400">*</span>
              </Label>
              <Input
                value={formData.contactPerson}
                onChange={(e) =>
                  setFormData({ ...formData, contactPerson: e.target.value })
                }
                placeholder="Nom complet"
                className="bg-gray-800 border-gray-700 text-white mt-1"
              />
            </div>
            <div>
              <Label className="text-gray-300 flex items-center gap-2">
                <PhoneSvg className="w-4 h-4 text-green-400" />
                Téléphone <span className="text-red-400">*</span>
              </Label>
              <Input
                value={formData.phone}
                onChange={(e) =>
                  setFormData({ ...formData, phone: e.target.value })
                }
                placeholder="+225 XX XX XX XX"
                className="bg-gray-800 border-gray-700 text-white mt-1"
              />
            </div>
          </div>
          <div>
            <Label className="text-gray-300 flex items-center gap-2">
              <MailSvg className="w-4 h-4 text-blue-400" />
              Email de confirmation
            </Label>
            <Input
              type="email"
              value={formData.email}
              onChange={(e) =>
                setFormData({ ...formData, email: e.target.value })
              }
              placeholder="contact@entreprise.com"
              className="bg-gray-800 border-gray-700 text-white mt-1"
            />
          </div>
          <div>
            <Label className="text-gray-300 flex items-center gap-2">
              <Briefcase className="w-4 h-4 text-blue-400" />
              Description activité
            </Label>
            <Textarea
              value={formData.description}
              onChange={(e) =>
                setFormData({ ...formData, description: e.target.value })
              }
              rows={2}
              placeholder="Décrivez votre activité ou ce que vous allez exposer"
              className="bg-gray-800 border-gray-700 text-white mt-1"
            />
          </div>
        </div>
      );
    }
    
    const isCamping = rentalType === "camping";
    const typeLabel = typeInfo.label;
    const typeColor = color;
    
    return (
      <div className="space-y-4">
        <div className={`bg-${typeColor}-500/10 p-3 rounded-lg border border-${typeColor}-500/20 flex items-center gap-3`}>
          <Icon className={`w-5 h-5 text-${typeColor}-400`} />
          <div>
            <p className="text-sm font-medium text-white">{typeLabel}</p>
            <p className="text-xs text-gray-400">Remplissez vos informations personnelles</p>
          </div>
        </div>
        
        <div>
          <Label className="text-gray-300 flex items-center gap-2">
            <User className="w-4 h-4 text-green-400" />
            Nom complet <span className="text-red-400">*</span>
          </Label>
          <Input
            value={formData.guestName}
            onChange={(e) =>
              setFormData({ ...formData, guestName: e.target.value })
            }
            placeholder="Votre nom complet"
            className="bg-gray-800 border-gray-700 text-white mt-1"
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label className="text-gray-300 flex items-center gap-2">
              <PhoneSvg className="w-4 h-4 text-green-400" />
              Téléphone <span className="text-red-400">*</span>
            </Label>
            <Input
              value={formData.phone}
              onChange={(e) =>
                setFormData({ ...formData, phone: e.target.value })
              }
              placeholder="+225 XX XX XX XX"
              className="bg-gray-800 border-gray-700 text-white mt-1"
            />
          </div>
          <div>
            <Label className="text-gray-300 flex items-center gap-2">
              <MailSvg className="w-4 h-4 text-blue-400" />
              Email
            </Label>
            <Input
              type="email"
              value={formData.email}
              onChange={(e) =>
                setFormData({ ...formData, email: e.target.value })
              }
              placeholder="votre@email.com"
              className="bg-gray-800 border-gray-700 text-white mt-1"
            />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label className="text-gray-300 flex items-center gap-2">
              <Calendar className="w-4 h-4 text-blue-400" />
              Date d'arrivée
            </Label>
            <Input
              type="date"
              value={formData.checkIn}
              onChange={(e) =>
                setFormData({ ...formData, checkIn: e.target.value })
              }
              className="bg-gray-800 border-gray-700 text-white mt-1"
            />
          </div>
          <div>
            <Label className="text-gray-300 flex items-center gap-2">
              <Calendar className="w-4 h-4 text-blue-400" />
              Date de départ
            </Label>
            <Input
              type="date"
              value={formData.checkOut}
              onChange={(e) =>
                setFormData({ ...formData, checkOut: e.target.value })
              }
              className="bg-gray-800 border-gray-700 text-white mt-1"
            />
          </div>
        </div>
        {isCamping && (
          <div>
            <Label className="text-gray-300 flex items-center gap-2">
              <Layout className="w-4 h-4 text-orange-400" />
              Taille de la tente / équipement
            </Label>
            <Input
              value={formData.tentSize}
              onChange={(e) =>
                setFormData({ ...formData, tentSize: e.target.value })
              }
              placeholder="Ex: 2 personnes, 3x3m, etc."
              className="bg-gray-800 border-gray-700 text-white mt-1"
            />
          </div>
        )}
        <div>
          <Label className="text-gray-300 flex items-center gap-2">
            <Briefcase className="w-4 h-4 text-purple-400" />
            Demandes spéciales
          </Label>
          <Textarea
            value={formData.specialRequests}
            onChange={(e) =>
              setFormData({ ...formData, specialRequests: e.target.value })
            }
            rows={2}
            placeholder="Préférences, allergies, besoins particuliers..."
            className="bg-gray-800 border-gray-700 text-white mt-1"
          />
        </div>
      </div>
    );
  };

  if (loading)
    return (
      <div className="py-16 flex justify-center">
        <Loader2 className="w-12 h-12 animate-spin text-primary" />
      </div>
    );

  return (
    <div className="space-y-8 pb-10">
      <div>
        <h2 className="text-2xl font-bold text-white flex items-center gap-2">
          <Store className="w-6 h-6 text-primary" />
          {isOrganizer ? "Tableau de bord des Locations" : "Réserver un espace"}
        </h2>
        <p className="text-gray-400 mt-1">
          {isOrganizer
            ? "Gérez les locations et suivez vos revenus."
            : "Choisissez un emplacement pour votre activité ou hébergement."}
        </p>
      </div>

      {/* Types de location disponibles - BANNIÈRE ICÔNES */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 p-4 bg-gray-800/30 rounded-xl border border-gray-700">
        {Object.values(RENTAL_TYPES).map((type) => {
          const Icon = type.icon;
          const color = type.color;
          const hasType = standTypes.some(st => st.rental_type === type.id);
          return (
            <div
              key={type.id}
              className={`flex flex-col items-center justify-center p-4 rounded-xl border-2 transition-all ${
                hasType 
                  ? `border-${color}-500 bg-${color}-900/20 shadow-lg shadow-${color}-500/10` 
                  : 'border-gray-700 bg-gray-800/30 opacity-50'
              }`}
            >
              <div className={`w-14 h-14 rounded-2xl bg-${color}-900/30 border-2 border-${color}-500/50 flex items-center justify-center mb-2`}>
                <Icon className={`w-7 h-7 text-${color}-400`} />
              </div>
              <span className={`text-xs font-bold text-${color}-300 text-center`}>{type.label}</span>
              {hasType && (
                <Badge className="mt-1 text-[8px] bg-green-900 text-green-300">Disponible</Badge>
              )}
            </div>
          );
        })}
      </div>

      {/* PANIER */}
      {!isOrganizer && cartStands.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="sticky top-20 z-40 mb-8"
        >
          <Card className="bg-gray-900 border border-primary/50 shadow-2xl backdrop-blur-xl bg-opacity-90">
            <CardHeader className="py-4 border-b border-gray-800 bg-primary/10">
              <CardTitle className="text-white flex justify-between items-center text-lg">
                <div className="flex items-center gap-2">
                  <ShoppingCart className="w-5 h-5 text-primary" />
                  Votre Panier{" "}
                  <Badge className="bg-primary ml-2">{cartStands.length}</Badge>
                </div>
                <div className="text-right">
                  <span className="text-2xl font-bold text-primary">
                    {getCartTotal()} π
                  </span>
                  <p className="text-xs text-gray-400">
                    ≈ {(getCartTotal() * COIN_RATE).toLocaleString()} FCFA
                  </p>
                </div>
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-4 max-h-[40vh] overflow-y-auto space-y-3">
              {Array.from(new Set(cartStands.map((s) => s.id))).map(
                (typeId) => {
                  const type = cartStands.find((s) => s.id === typeId);
                  const count = cartStands.filter(
                    (s) => s.id === typeId,
                  ).length;
                  const rentalType = type?.rental_type || "stand";
                  const rentalTypeInfo = RENTAL_TYPES[rentalType.toUpperCase()] || RENTAL_TYPES.STAND;
                  const Icon = rentalTypeInfo.icon;
                  const color = rentalTypeInfo.color;
                  
                  return (
                    <div
                      key={typeId}
                      className="flex justify-between items-center bg-gray-800/40 p-3 rounded-lg border border-gray-700/50"
                    >
                      <div className="flex items-center gap-3">
                        <div className={`w-10 h-10 rounded-xl bg-${color}-900/30 border border-${color}-500/50 flex items-center justify-center flex-shrink-0`}>
                          <Icon className={`w-5 h-5 text-${color}-400`} />
                        </div>
                        <div>
                          <p className="text-white font-medium">{type.name}</p>
                          <p className="text-xs text-gray-400">
                            {type.calculated_price_pi} π / unité
                          </p>
                          <Badge className={`bg-${color}-900/50 text-${color}-300 text-[8px]`}>
                            {rentalTypeInfo.label}
                          </Badge>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="flex items-center border border-gray-700 rounded">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => updateQuantity(typeId, count - 1)}
                            className="h-8 px-2"
                          >
                            -
                          </Button>
                          <span className="w-8 text-center text-white">
                            {count}
                          </span>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => updateQuantity(typeId, count + 1)}
                            className="h-8 px-2"
                          >
                            +
                          </Button>
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() =>
                            setCartStands((prev) =>
                              prev.filter((s) => s.id !== typeId),
                            )
                          }
                          className="text-red-400"
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                  );
                },
              )}
            </CardContent>
            <CardFooter className="bg-gray-900/50 border-t border-gray-800 pt-4">
              <Sheet open={isCartOpen} onOpenChange={setIsCartOpen}>
                <SheetTrigger asChild>
                  <Button className="w-full text-base font-bold h-12">
                    Passer à la caisse <ArrowRight className="w-5 h-5 ml-2" />
                  </Button>
                </SheetTrigger>
                <SheetContent className="bg-gray-900 border-gray-800 text-white w-full sm:max-w-md overflow-y-auto">
                  <SheetHeader>
                    <SheetTitle className="text-white flex items-center gap-2 text-xl">
                      Finaliser votre commande
                    </SheetTitle>
                    <SheetDescription className="text-gray-400">
                      {cartStands.length} réservation(s) dans le panier
                    </SheetDescription>
                  </SheetHeader>
                  <div className="mt-6 space-y-6">
                    <div className="p-4 bg-gray-800/50 rounded-xl">
                      <h4 className="font-medium text-white mb-3">
                        Récapitulatif
                      </h4>
                      {Array.from(new Set(cartStands.map((s) => s.id))).map(
                        (typeId) => {
                          const type = cartStands.find((s) => s.id === typeId);
                          const count = cartStands.filter(
                            (s) => s.id === typeId,
                          ).length;
                          const rentalType = type?.rental_type || "stand";
                          const rentalTypeInfo = RENTAL_TYPES[rentalType.toUpperCase()] || RENTAL_TYPES.STAND;
                          const Icon = rentalTypeInfo.icon;
                          const color = rentalTypeInfo.color;
                          
                          return (
                            <div
                              key={typeId}
                              className="flex justify-between items-center text-sm p-2 hover:bg-gray-700/20 rounded-lg transition-colors"
                            >
                              <div className="flex items-center gap-2">
                                <Icon className={`w-4 h-4 text-${color}-400`} />
                                <span className="text-gray-300">{type.name}</span>
                                <Badge className={`bg-${color}-900/50 text-${color}-300 text-[8px]`}>
                                  {rentalTypeInfo.label}
                                </Badge>
                              </div>
                              <span className="text-white">
                                x{count} = {type.calculated_price_pi * count} π
                              </span>
                            </div>
                          );
                        },
                      )}
                      <div className="border-t border-gray-700 pt-2 mt-2">
                        <div className="flex justify-between font-bold">
                          <span>Total</span>
                          <span className="text-primary">
                            {getCartTotal()} π
                          </span>
                        </div>
                        <div className="text-xs text-gray-400 text-right">
                          ≈ {(getCartTotal() * COIN_RATE).toLocaleString()} FCFA
                        </div>
                      </div>
                    </div>
                    
                    {renderFormFields()}
                    
                    <div className="flex gap-2">
                      <Button
                        variant={standPaymentMethod === "coins" ? "default" : "outline"}
                        onClick={() => setStandPaymentMethod("coins")}
                        className="flex-1"
                        size="sm"
                      >
                        <Coins className="w-4 h-4 mr-1" /> Pièces
                      </Button>
                      <Button
                        variant={standPaymentMethod === "ussd" ? "default" : "outline"}
                        onClick={() => setStandPaymentMethod("ussd")}
                        className="flex-1"
                        size="sm"
                      >
                        <Trophy className="w-4 h-4 mr-1" /> Mobile Money
                      </Button>
                    </div>
                    {standPaymentMethod === "ussd" && (
                      <p className="text-xs text-gray-400 text-center">
                        {(getCartTotal() * COIN_RATE).toLocaleString()} FCFA à payer par mobile money. Votre réservation sera confirmée après validation du dépôt.
                      </p>
                    )}

                    <Button
                      onClick={handleStandCheckout}
                      disabled={
                        isRenting ||
                        cartStands.length === 0 ||
                        (cartStands[0]?.rental_type === "stand" 
                          ? !formData.companyName || !formData.contactPerson || !formData.phone
                          : !formData.guestName || !formData.phone)
                      }
                      className="w-full bg-primary h-12"
                    >
                      {isRenting ? (
                        <Loader2 className="animate-spin" />
                      ) : standPaymentMethod === "ussd" ? (
                        `Payer ${(getCartTotal() * COIN_RATE).toLocaleString()} FCFA`
                      ) : (
                        `Payer ${getCartTotal()} π et confirmer`
                      )}
                    </Button>
                    <Button
                      variant="ghost"
                      className="w-full text-gray-400"
                      onClick={() => setIsCartOpen(false)}
                    >
                      Annuler
                    </Button>
                    <p className="text-center text-sm text-gray-400">
                      Pas assez de pièces ?{" "}
                      <Button
                        variant="link"
                        className="text-primary p-0 h-auto"
                        onClick={handleBuyCoins}
                      >
                        Acheter des pièces
                      </Button>
                    </p>
                  </div>
                </SheetContent>
              </Sheet>
            </CardFooter>
          </Card>
        </motion.div>
      )}

      {/* TABLEAU DE BORD ORGANISATEUR */}
      {isOrganizer && standTypes.length > 0 && (
        <Card className="bg-gray-900 border-gray-800 shadow-xl rounded-xl overflow-hidden">
          <CardHeader className="border-b border-gray-800 bg-gray-800/30 py-5">
            <CardTitle className="text-white text-lg font-semibold flex items-center gap-2">
              <BarChart3 className="w-5 h-5 text-primary" /> Aperçu Global
            </CardTitle>
          </CardHeader>
          <CardContent className="p-6">
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-6">
              <div className="bg-gray-800/40 p-6 rounded-xl">
                <p className="text-sm text-gray-400 flex items-center gap-2 mb-3">
                  <Package className="w-4 h-4" /> Réservations
                </p>
                <p className="text-3xl font-bold text-white">
                  {statistics.totalRentals}
                </p>
                <p className="text-xs text-gray-500">
                  sur {statistics.totalStands} disponibles
                </p>
              </div>
              <div className="bg-gray-800/40 p-6 rounded-xl">
                <p className="text-sm text-gray-400 flex items-center gap-2 mb-3">
                  <Coins className="w-4 h-4 text-blue-400" /> Revenus bruts
                </p>
                <p className="text-3xl font-bold text-white">
                  {statistics.totalRevenueFcfa.toLocaleString()}{" "}
                  <span className="text-xl text-blue-400">F CFA</span>
                </p>
                <p className="text-xs text-gray-500">
                  ≈ {statistics.totalRevenue} π
                </p>
              </div>
              <div className="bg-gray-800/40 p-6 rounded-xl">
                <p className="text-sm text-gray-400 flex items-center gap-2 mb-3">
                  <Coins className="w-4 h-4 text-green-400" /> Revenu net (100%)
                </p>
                <p className="text-3xl font-bold text-green-400">
                  {statistics.totalNetGain.toLocaleString()}{" "}
                  <span className="text-xl text-green-300">F CFA</span>
                </p>
              </div>
              <div className="bg-gray-800/40 p-6 rounded-xl">
                <p className="text-sm text-gray-400 flex items-center gap-2 mb-3">
                  <Grid3x3 className="w-4 h-4 text-purple-400" /> Occupation
                </p>
                <p className="text-3xl font-bold text-white mb-3">
                  {statistics.occupancyRate.toFixed(1)}%
                </p>
                <Progress
                  value={statistics.occupancyRate}
                  className="h-2 bg-gray-700 [&>div]:bg-purple-500"
                />
              </div>
            </div>

            {/* GESTION DES OFFRES — ajout / modification / suppression.
                Indispensable pour les événements créés avant le correctif
                d'insertion en lot : seules leurs offres avaient été
                enregistrées. */}
            <StandTypesEditor
              event={event}
              standEventId={standEventId}
              initialTypes={standTypes}
              onSaved={fetchStandData}
            />

            <div className="mt-10">
              <h4 className="text-white font-semibold mb-4 flex items-center gap-2">
                Détail par type
              </h4>
              <div className="overflow-x-auto rounded-xl border border-gray-800">
                <Table>
                  <TableHeader className="bg-gray-800/80">
                    <TableRow>
                      <TableHead>Type</TableHead>
                      <TableHead className="text-center">Dimensions</TableHead>
                      <TableHead className="text-center">Prix unitaire</TableHead>
                      <TableHead className="text-center">Disponibles</TableHead>
                      <TableHead className="text-center">Réservés</TableHead>
                      <TableHead className="text-center w-40">Occupation</TableHead>
                      <TableHead className="text-right">Revenus bruts</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {statistics.byType.map((type, idx) => {
                      const rentalType = type.rental_type || "stand";
                      const rentalTypeInfo = RENTAL_TYPES[rentalType.toUpperCase()] || RENTAL_TYPES.STAND;
                      const Icon = rentalTypeInfo.icon;
                      const color = rentalTypeInfo.color;
                      const colors = STAND_COLORS[idx % STAND_COLORS.length];
                      
                      return (
                        <TableRow
                          key={type.id}
                          className="border-gray-800 hover:bg-gray-800/40"
                        >
                          <TableCell className="py-4">
                            <div className="flex items-center gap-3">
                              <div className={`w-10 h-10 rounded-xl bg-${color}-900/30 border border-${color}-500/50 flex items-center justify-center flex-shrink-0`}>
                                <Icon className={`w-5 h-5 text-${color}-400`} />
                              </div>
                              <div>
                                <div className="flex items-center gap-2">
                                  <span className={`font-semibold text-${color}-400`}>
                                    {type.name}
                                  </span>
                                  <Badge className={`bg-${color}-900/50 text-${color}-300 text-xs border-${color}-800`}>
                                    {rentalTypeInfo.label}
                                  </Badge>
                                </div>
                                <p className="text-xs text-gray-400">{type.size || "N/A"}</p>
                              </div>
                            </div>
                          </TableCell>
                          <TableCell className="text-center text-gray-300">
                            {type.size || "N/A"}
                          </TableCell>
                          <TableCell className="text-center text-white">
                            {type.calculated_price_pi} π
                          </TableCell>
                          <TableCell className="text-center text-gray-400">
                            {type.quantity_available}
                          </TableCell>
                          <TableCell className="text-center">
                            <Badge
                              variant="outline"
                              className={`border ${colors.borderLight} ${colors.bg} ${colors.text}`}
                            >
                              {type.rented}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-center">
                            <div className="flex items-center justify-center gap-3">
                              <span className="text-gray-300 text-xs">
                                {type.rate.toFixed(0)}%
                              </span>
                              <Progress
                                value={type.rate}
                                className={`w-16 h-1.5 bg-gray-800 ${colors.progress}`}
                              />
                            </div>
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="text-white font-medium">
                              {type.revenueFcfa.toLocaleString()} F CFA
                            </div>
                            <div className="text-gray-500 text-xs">
                              {type.revenue} π
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            </div>

            {statistics.byCompany.length > 0 && (
              <div className="mt-10">
                <h4 className="text-white font-semibold mb-4 flex items-center gap-2">
                  Participants
                </h4>
                <div className="overflow-x-auto rounded-xl border border-gray-800">
                  <Table>
                    <TableHeader className="bg-gray-800/80">
                      <TableRow>
                        <TableHead>Nom / Entreprise</TableHead>
                        <TableHead>Contact</TableHead>
                        <TableHead>Email</TableHead>
                        <TableHead>Téléphone</TableHead>
                        <TableHead className="text-center">Type</TableHead>
                        <TableHead className="text-center">Réservations</TableHead>
                        <TableHead className="text-right">Total</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {statistics.byCompany.slice(0, 5).map((company, idx) => {
                        const colors = STAND_COLORS[idx % STAND_COLORS.length];
                        const rentalTypeInfo = RENTAL_TYPES[company.rentalType?.toUpperCase()] || RENTAL_TYPES.STAND;
                        const Icon = rentalTypeInfo.icon;
                        const color = rentalTypeInfo.color;
                        
                        return (
                          <TableRow
                            key={company.companyName || company.guestName}
                            className="border-gray-800 hover:bg-gray-800/40"
                          >
                            <TableCell className="py-4">
                              <div className="flex items-center gap-2">
                                <Icon className={`w-4 h-4 text-${color}-400`} />
                                <span className="text-white">
                                  {company.companyName || company.guestName || "Anonyme"}
                                </span>
                              </div>
                            </TableCell>
                            <TableCell className="text-gray-300">
                              {company.contactPerson}
                            </TableCell>
                            <TableCell className="text-gray-300">
                              {company.contactEmail}
                            </TableCell>
                            <TableCell className="text-gray-300">
                              {company.contactPhone}
                            </TableCell>
                            <TableCell className="text-center">
                              <Badge className={`bg-${color}-900/50 text-${color}-300`}>
                                {rentalTypeInfo.label}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-center">
                              <Badge className="bg-green-900 text-green-200">
                                {company.rentals.length}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-right">
                              <div className="text-white font-medium">
                                {(company.totalAmount * COIN_RATE).toLocaleString()} F CFA
                              </div>
                              <div className="text-gray-500 text-xs">
                                {company.totalAmount} π
                              </div>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
                {statistics.byCompany.length > 5 && (
                  <div className="p-3 text-center border-t border-gray-800">
                    <Button
                      variant="link"
                      className="text-primary"
                      onClick={exportCompanyListExcel}
                    >
                      Voir tous les participants ({statistics.byCompany.length})
                    </Button>
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* MES RÉSERVATIONS */}
      {!isOrganizer && myRentals.length > 0 && (
        <div>
          <h3 className="text-2xl font-bold text-white border-b border-gray-800 pb-4 mb-6 flex items-center gap-2">
            <Bookmark className="w-6 h-6 text-primary" /> Mes Réservations (
            {myRentals.length})
          </h3>
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
            {myRentals.map((rental, idx) => {
              const typeIndex = standTypes.findIndex(
                (t) => t.id === rental.stand_type_id,
              );
              const rentalType = rental.rental_type || "stand";
              const rentalTypeInfo = RENTAL_TYPES[rentalType.toUpperCase()] || RENTAL_TYPES.STAND;
              const Icon = rentalTypeInfo.icon;
              const color = rentalTypeInfo.color;
              const colors = STAND_COLORS[
                typeIndex >= 0 ? typeIndex % STAND_COLORS.length : 0
              ];
              const activeTab = activeTabs[rental.id] || "details";
              
              return (
                <motion.div
                  key={rental.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: idx * 0.1 }}
                  className="h-full"
                >
                  <Card
                    className={`bg-gray-900 border-l-4 border-${color}-600 border-gray-800 h-full`}
                  >
                    <CardHeader className="pb-2">
                      <div className="flex justify-between items-start">
                        <div>
                          <CardTitle className="text-white flex items-center gap-2">
                            {rental.stand_number || "Réservation"}{" "}
                            <Badge className={`bg-${color}-900 text-${color}-200`}>
                              {rental.stand_types?.name}
                            </Badge>
                            <Badge className={`bg-${color}-900/50 text-${color}-300 text-xs`}>
                              <Icon className="w-3 h-3 mr-1 inline" />
                              {rentalTypeInfo.label}
                            </Badge>
                          </CardTitle>
                          <CardDescription className="flex items-center gap-2 mt-1">
                            <Tag className="w-3 h-3" /> Code:{" "}
                            {rental.booking_code || "N/A"}
                          </CardDescription>
                        </div>
                        <BadgeCheck className={`w-6 h-6 text-${color}-400`} />
                      </div>
                    </CardHeader>
                    <CardContent>
                      <div className="flex gap-1.5 mb-4 border-b border-gray-800 pb-2">
                        <button
                          onClick={() =>
                            setActiveTabs((prev) => ({
                              ...prev,
                              [rental.id]: "details",
                            }))
                          }
                          className={`px-3 py-1.5 text-xs rounded-md ${activeTab === "details" ? `bg-gray-800 text-${color}-400` : "text-gray-400 hover:text-white"}`}
                        >
                          Détails
                        </button>
                        <button
                          onClick={() =>
                            setActiveTabs((prev) => ({
                              ...prev,
                              [rental.id]: "contact",
                            }))
                          }
                          className={`px-3 py-1.5 text-xs rounded-md ${activeTab === "contact" ? `bg-gray-800 text-${color}-400` : "text-gray-400 hover:text-white"}`}
                        >
                          Contact
                        </button>
                      </div>
                      {activeTab === "details" && (
                        <div className="space-y-3">
                          <div className="grid grid-cols-2 gap-3">
                            <div className="bg-black/30 rounded-lg p-3">
                              <p className="text-[10px] text-gray-500">Type</p>
                              <p className="text-sm font-medium text-white">
                                {rental.stand_types?.name}
                              </p>
                              <p className="text-[11px] text-gray-400">
                                {rental.stand_types?.size}
                              </p>
                            </div>
                            <div className="bg-black/30 rounded-lg p-3">
                              <p className="text-[10px] text-gray-500">Payé</p>
                              <p className="text-sm font-bold text-white">
                                {rental.rental_amount_pi} π
                              </p>
                              <p className="text-[11px] text-gray-400">
                                {(
                                  rental.rental_amount_pi * COIN_RATE
                                ).toLocaleString()}{" "}
                                F
                              </p>
                            </div>
                          </div>
                          <div className="bg-black/30 rounded-lg p-3">
                            <p className="text-[10px] text-gray-500">Date</p>
                            <p className="text-xs text-white">
                              {new Date(rental.created_at).toLocaleDateString(
                                "fr-FR",
                              )}
                            </p>
                          </div>
                          {rental.check_in_date && (
                            <div className="grid grid-cols-2 gap-2 bg-black/30 rounded-lg p-3">
                              <div>
                                <p className="text-[10px] text-gray-500">Arrivée</p>
                                <p className="text-xs text-white">
                                  {new Date(rental.check_in_date).toLocaleDateString("fr-FR")}
                                </p>
                              </div>
                              <div>
                                <p className="text-[10px] text-gray-500">Départ</p>
                                <p className="text-xs text-white">
                                  {rental.check_out_date ? new Date(rental.check_out_date).toLocaleDateString("fr-FR") : "N/A"}
                                </p>
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                      {activeTab === "contact" && (
                        <div className="space-y-2">
                          <div className="bg-black/30 rounded-lg p-3 flex justify-between">
                            <div>
                              <p className="text-[10px] text-gray-500">Nom</p>
                              <p className="text-sm text-white">
                                {rental.company_name || rental.guest_name || "N/A"}
                              </p>
                            </div>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() =>
                                copyToClipboard(
                                  rental.company_name || rental.guest_name || "",
                                  "Nom",
                                )
                              }
                            >
                              <Copy className="w-3 h-3" />
                            </Button>
                          </div>
                          <div className="grid grid-cols-2 gap-2">
                            <div className="bg-black/30 rounded-lg p-3">
                              <p className="text-[10px] text-gray-500">Contact</p>
                              <p className="text-xs text-white">
                                {rental.contact_person || rental.guest_name || "N/A"}
                              </p>
                            </div>
                            <div className="bg-black/30 rounded-lg p-3">
                              <p className="text-[10px] text-gray-500">Téléphone</p>
                              <p className="text-xs text-white">
                                {rental.contact_phone || "N/A"}
                              </p>
                            </div>
                          </div>
                          {rental.special_requests && (
                            <div className="bg-black/30 rounded-lg p-3">
                              <p className="text-[10px] text-gray-500">Demandes spéciales</p>
                              <p className="text-xs text-white">{rental.special_requests}</p>
                            </div>
                          )}
                        </div>
                      )}
                    </CardContent>
                    <CardFooter className="border-t border-gray-800 pt-4">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => viewRentalDetails(rental)}
                        className="w-full border-gray-700 text-gray-300"
                      >
                        <Eye className="w-4 h-4 mr-2" /> Détails
                      </Button>
                    </CardFooter>
                  </Card>
                </motion.div>
              );
            })}
          </div>
        </div>
      )}

      {/* STANDS DISPONIBLES */}
      {!isOrganizer && (
        <>
          {!isUnlocked ? (
            <Card className="bg-gray-900 border-gray-800">
              <CardContent className="p-10 text-center">
                <Lock className="w-12 h-12 text-gray-500 mx-auto mb-4" />
                <h3 className="text-xl font-bold text-white">
                  Contenu Verrouillé
                </h3>
                <p className="text-gray-400">
                  Débloquez l'accès pour réserver.
                </p>
              </CardContent>
            </Card>
          ) : standTypes.length === 0 ? (
            <Card className="bg-gray-900 border-gray-800">
              <CardContent className="p-10 text-center">
                <Store className="w-12 h-12 text-gray-500 mx-auto mb-4" />
                <h3 className="text-xl font-bold text-white">
                  Aucune offre disponible
                </h3>
                <p className="text-gray-400">
                  L'organisateur n'a pas encore configuré d'offres.
                </p>
              </CardContent>
            </Card>
          ) : (
            <div>
              <h3 className="text-xl font-bold text-white mb-6">
                Offres disponibles
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                {standTypes.map((type, idx) => {
                  const available =
                    type.quantity_available - (type.quantity_rented || 0);
                  const isSoldOut = available <= 0;
                  const rentalType = type.rental_type || "stand";
                  const rentalTypeInfo = RENTAL_TYPES[rentalType.toUpperCase()] || RENTAL_TYPES.STAND;
                  const Icon = rentalTypeInfo.icon;
                  const color = rentalTypeInfo.color;
                  const colors = STAND_COLORS[idx % STAND_COLORS.length];
                  const inCartCount = getCartCountByType(type.id);
                  
                  return (
                    <motion.div
                      key={type.id}
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: idx * 0.1 }}
                      className="h-full"
                    >
                      <Card
                        className={`bg-gray-900 border-t-4 border-${color}-600 border-x-gray-800 border-b-gray-800 h-full hover:shadow-xl transition-all overflow-hidden`}
                      >
                        <div className="relative h-40 bg-gradient-to-br from-gray-800 to-gray-900 flex items-center justify-center border-b border-gray-800 overflow-hidden">
                          {/* Affiche du type de stand. `object-contain` pour
                              que l'affiche reste lisible en entier (les
                              affiches de stands sont souvent portrait) ; on
                              garde l'icône en repli quand aucune image
                              n'a été fournie à la création. */}
                          {type.cover_image ? (
                            <img
                              src={type.cover_image}
                              alt={type.name}
                              className="w-full h-full object-contain bg-gray-950"
                              loading="lazy"
                              onError={(e) => {
                                e.target.style.display = "none";
                              }}
                            />
                          ) : (
                            <div className="flex flex-col items-center gap-1">
                              <div className={`w-16 h-16 rounded-2xl bg-${color}-900/30 border-2 border-${color}-500/50 flex items-center justify-center`}>
                                <Icon className={`w-8 h-8 text-${color}-400`} />
                              </div>
                              <Badge className={`bg-${color}-900/80 text-${color}-200 text-[10px]`}>
                                {rentalTypeInfo.label}
                              </Badge>
                            </div>
                          )}
                          {type.cover_image && (
                            <Badge
                              className={`absolute bottom-2 left-2 bg-${color}-900/90 text-${color}-100 text-[10px]`}
                            >
                              {rentalTypeInfo.label}
                            </Badge>
                          )}
                          <Badge
                            variant={
                              isClosed
                                ? "outline"
                                : isSoldOut
                                  ? "destructive"
                                  : "secondary"
                            }
                            className={`absolute top-2 right-2 ${
                              isClosed
                                ? "border-gray-600 text-gray-400 bg-black/50"
                                : isSoldOut
                                  ? "bg-red-900/80 text-red-300"
                                  : `bg-${color}-900/80 text-${color}-200`
                            }`}
                          >
                            {isClosed
                              ? "Terminé"
                              : isSoldOut
                                ? "Complet"
                                : `${available - inCartCount} dispo.`}
                          </Badge>
                        </div>
                        <CardContent className="flex-1 pt-4">
                          <h4 className="text-white font-bold text-lg">{type.name}</h4>
                          <p className="text-sm text-gray-300 line-clamp-2 mt-1">
                            {type.description || rentalTypeInfo.description}
                          </p>
                          <div className="mt-3 flex items-center gap-2 text-xs text-gray-400">
                            <Layout className="w-3 h-3" />
                            {type.size || "Non spécifié"}
                          </div>
                        </CardContent>
                        <CardFooter className="border-t border-gray-800/50 pt-4 bg-gray-900/50">
                          <div className="flex justify-between w-full">
                            <div>
                              <p className="text-xs text-gray-500">Tarif</p>
                              <div className="flex items-baseline gap-1.5">
                                <span className="text-2xl font-bold text-white">
                                  {type.calculated_price_pi}
                                </span>
                                <span
                                  className={`text-sm font-medium text-${color}-400`}
                                >
                                  π
                                </span>
                              </div>
                              <p className="text-xs text-gray-500">
                                ≈{" "}
                                {(
                                  type.calculated_price_pi * COIN_RATE
                                ).toLocaleString()}{" "}
                                FCFA
                              </p>
                            </div>
                            {isClosed ? (
                              <Button disabled>Terminé</Button>
                            ) : isSoldOut ? (
                              <Button disabled>Complet</Button>
                            ) : (
                              <Button
                                onClick={() => handleAddToCart(type)}
                                variant={
                                  inCartCount > 0 ? "outline" : "default"
                                }
                                className={
                                  inCartCount > 0
                                    ? `border-${color}-500 text-${color}-400`
                                    : `bg-${color}-600 hover:bg-${color}-700 text-white`
                                }
                              >
                                {inCartCount > 0
                                  ? `${inCartCount} au panier`
                                  : "Ajouter"}
                              </Button>
                            )}
                          </div>
                        </CardFooter>
                      </Card>
                    </motion.div>
                  );
                })}
              </div>
            </div>
          )}
        </>
      )}

      {/* TOUTES LES RÉSERVATIONS (organisateur) */}
      {isOrganizer && allRentals.length > 0 && (
        <Card className="bg-gray-900 border-gray-800 shadow-xl rounded-xl mt-12 overflow-hidden">
          <CardHeader className="border-b border-gray-800 bg-gray-800/20 py-5">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
              <div>
                <CardTitle className="text-white text-xl font-bold flex items-center gap-2">
                  <Users className="w-5 h-5 text-primary" /> Toutes les
                  Réservations
                </CardTitle>
                <CardDescription className="text-gray-400">
                  {allRentals.length} réservation(s) ·{" "}
                  {statistics.byCompany.length} participant(s)
                </CardDescription>
              </div>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={exportCompanyListExcel}
                >
                  <FileDown className="w-4 h-4 mr-2" /> Excel Participants
                </Button>
                <Button variant="outline" size="sm" onClick={exportToExcel}>
                  <FileDown className="w-4 h-4 mr-2" /> Excel
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={exportToPDF}
                  disabled={isExporting}
                >
                  {isExporting ? (
                    <Loader2 className="animate-spin" />
                  ) : (
                    <Printer className="w-4 h-4 mr-2" />
                  )}{" "}
                  PDF
                </Button>
              </div>
            </div>
            <div className="mt-6 flex flex-col sm:flex-row gap-3">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-500" />
                <Input
                  placeholder="Rechercher..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-9 bg-gray-950 border-gray-700 text-white"
                />
              </div>
              <select
                value={selectedType}
                onChange={(e) => setSelectedType(e.target.value)}
                className="px-4 py-2 bg-gray-950 border border-gray-700 rounded-md text-white sm:w-64"
              >
                <option value="all">Tous les types</option>
                {standTypes.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            {filteredRentals.length === 0 ? (
              <div className="text-center py-12">
                Aucune réservation trouvée.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader className="bg-gray-800/30">
                    <TableRow>
                      <TableHead>N°</TableHead>
                      <TableHead>Nom / Entreprise</TableHead>
                      <TableHead>Contact</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Code</TableHead>
                      <TableHead className="text-right">Prix</TableHead>
                      <TableHead className="text-center">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredRentals.map((rental) => {
                      const rentalType = rental.rental_type || "stand";
                      const rentalTypeInfo = RENTAL_TYPES[rentalType.toUpperCase()] || RENTAL_TYPES.STAND;
                      const color = rentalTypeInfo.color;
                      
                      return (
                        <TableRow
                          key={rental.id}
                          className="border-gray-800 hover:bg-gray-800/40"
                        >
                          <TableCell className={`font-bold text-${color}-400`}>
                            {rental.stand_number || "N/A"}
                          </TableCell>
                          <TableCell>
                            <div className="text-white">
                              {rental.company_name || rental.guest_name || "N/A"}
                            </div>
                            {rental.business_description && (
                              <div className="text-xs text-gray-500 truncate max-w-[200px]">
                                {rental.business_description}
                              </div>
                            )}
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <UserCircle className="w-4 h-4 text-gray-500" />
                              {rental.contact_person || rental.guest_name || "N/A"}
                            </div>
                          </TableCell>
                          <TableCell>
                            <Badge className={`bg-${color}-900 text-${color}-200`}>
                              <rentalTypeInfo.icon className="w-3 h-3 mr-1 inline" />
                              {rentalTypeInfo.label}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <code className="text-xs bg-gray-800 px-2 py-1 rounded">
                              {rental.booking_code || "N/A"}
                            </code>
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="text-white">
                              {rental.rental_amount_pi} π
                            </div>
                            <div className="text-gray-500 text-xs">
                              {(
                                rental.rental_amount_pi * COIN_RATE
                              ).toLocaleString()}{" "}
                              F
                            </div>
                          </TableCell>
                          <TableCell className="text-center">
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="sm">
                                  <MoreVertical className="w-4 h-4" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent className="bg-gray-800 border-gray-700">
                                <DropdownMenuItem
                                  onClick={() => viewRentalDetails(rental)}
                                >
                                  <Eye className="w-4 h-4 mr-2" /> Détails
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                  onClick={() =>
                                    copyToClipboard(
                                      `Réservation: ${rental.stand_number || "N/A"}\nCode: ${rental.booking_code}\nNom: ${rental.company_name || rental.guest_name}\nContact: ${rental.contact_person || rental.guest_name}\nTél: ${rental.contact_phone}`,
                                      "Infos",
                                    )
                                  }
                                >
                                  <Copy className="w-4 h-4 mr-2" /> Copier
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* DIALOG DÉTAILS RÉSERVATION */}
      <Dialog open={isDetailsDialogOpen} onOpenChange={setIsDetailsDialogOpen}>
        <DialogContent className="bg-gray-900 border-gray-800 text-white sm:max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold">
              Détails complets
            </DialogTitle>
          </DialogHeader>
          {selectedRentalForDetails && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-gray-800/50 p-4 rounded-lg">
                  <p className="text-xs text-gray-400">N°</p>
                  <p className="text-xl font-bold">
                    {selectedRentalForDetails.stand_number || "N/A"}
                  </p>
                </div>
                <div className="bg-gray-800/50 p-4 rounded-lg">
                  <p className="text-xs text-gray-400">Code</p>
                  <p className="text-sm font-mono break-all">
                    {selectedRentalForDetails.booking_code || "N/A"}
                  </p>
                </div>
              </div>
              <div className="bg-gray-800/50 p-4 rounded-lg">
                <h4 className="font-medium mb-3 flex items-center gap-2">
                  <Building className="w-4 h-4 text-primary" /> Participant
                </h4>
                <div className="space-y-2">
                  <div className="flex justify-between">
                    <span className="text-gray-400">Nom:</span>
                    <span className="text-white">
                      {selectedRentalForDetails.company_name || 
                       selectedRentalForDetails.guest_name || "N/A"}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-400">Contact:</span>
                    <span className="text-white">
                      {selectedRentalForDetails.contact_person || 
                       selectedRentalForDetails.guest_name || "N/A"}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-400">Email:</span>
                    <span className="text-white">
                      {selectedRentalForDetails.contact_email || "N/A"}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-400">Téléphone:</span>
                    <span className="text-white">
                      {selectedRentalForDetails.contact_phone || "N/A"}
                    </span>
                  </div>
                </div>
              </div>
              <div className="bg-gray-800/50 p-4 rounded-lg">
                <h4 className="font-medium mb-3 flex items-center gap-2">
                  <Ticket className="w-4 h-4 text-primary" /> Réservation
                </h4>
                <div className="space-y-2">
                  <div className="flex justify-between">
                    <span className="text-gray-400">Type:</span>
                    <span className="text-white">
                      {selectedRentalForDetails.stand_types?.name || "N/A"}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-400">Catégorie:</span>
                    <span className="text-white">
                      {selectedRentalForDetails.rental_type || "stand"}
                    </span>
                  </div>
                  {selectedRentalForDetails.check_in_date && (
                    <>
                      <div className="flex justify-between">
                        <span className="text-gray-400">Arrivée:</span>
                        <span className="text-white">
                          {new Date(selectedRentalForDetails.check_in_date).toLocaleDateString("fr-FR")}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-400">Départ:</span>
                        <span className="text-white">
                          {selectedRentalForDetails.check_out_date ? 
                            new Date(selectedRentalForDetails.check_out_date).toLocaleDateString("fr-FR") : 
                            "N/A"}
                        </span>
                      </div>
                    </>
                  )}
                  <div className="flex justify-between border-t border-gray-700 pt-2 mt-2">
                    <span className="font-bold">Prix total:</span>
                    <span className="font-bold text-lg">
                      {selectedRentalForDetails.rental_amount_pi} π{" "}
                      <span className="text-sm text-gray-400">
                        (
                        {(
                          selectedRentalForDetails.rental_amount_pi * COIN_RATE
                        ).toLocaleString()}{" "}
                        FCFA)
                      </span>
                    </span>
                  </div>
                </div>
              </div>
              {selectedRentalForDetails.special_requests && (
                <div className="bg-gray-800/50 p-4 rounded-lg">
                  <h4 className="font-medium mb-2 flex items-center gap-2">
                    <Briefcase className="w-4 h-4 text-primary" /> Demandes spéciales
                  </h4>
                  <p className="text-gray-300">
                    {selectedRentalForDetails.special_requests}
                  </p>
                </div>
              )}
            </div>
          )}
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() =>
                copyToClipboard(
                  `Réservation: ${selectedRentalForDetails?.stand_number || "N/A"}\nCode: ${selectedRentalForDetails?.booking_code}\nNom: ${selectedRentalForDetails?.company_name || selectedRentalForDetails?.guest_name}`,
                  "Infos",
                )
              }
            >
              Copier
            </Button>
            <Button onClick={() => setIsDetailsDialogOpen(false)}>
              Fermer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <USSDPaymentModal
        open={showUSSDModal}
        onClose={() => {
          setShowUSSDModal(false);
          if (ussdSuccess) setUssdSuccess(false);
          else openBonplaninfosRelance(ussdAmount);
        }}
        amountFcfa={ussdAmount}
        title="Paiement Mobile Money — Réservation"
        subtitle="Payez par USSD puis confirmez avec la capture d'écran du dépôt. Votre réservation sera confirmée après validation."
        submitLabel="J'ai payé ma réservation"
        requirePhone={true}
        initialPhone={formData.phone}
        onConfirm={confirmStandUSSD}
      />
    </div>
  );
};

// Composant Mail pour les icônes
const MailSvg = (props) => (
  <svg {...props} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/>
    <polyline points="22,6 12,13 2,6"/>
  </svg>
);

const PhoneSvg = (props) => (
  <svg {...props} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/>
  </svg>
);

/**
 * Gestion des offres de stand par l'organisateur.
 *
 * Permet d'ajouter, modifier et supprimer des types de stands (nom, type,
 * dimensions, quantité, prix, affiche de couverture) après la création de
 * l'événement. Indispensable pour les événements dont les offres avaient été
 * tronquées à la création (seule la première était enregistrée).
 */
const StandTypesEditor = ({ event, standEventId, initialTypes, onSaved }) => {
  const [editingId, setEditingId] = useState(null);
  const [drafts, setDrafts] = useState({});
  const [savingId, setSavingId] = useState(null);
  const [adding, setAdding] = useState(false);
  const [newDraft, setNewDraft] = useState(null);

  // `quantity_rented` vient de la lecture agrégée (statistics), pas de la
  // colonne : on ne le propose pas en édition pour ne jamais l'écraser.
  const rentedOf = (type) => Number(type.quantity_rented) || 0;

  const startEdit = (type) => {
    setEditingId(type.id);
    setDrafts((d) => ({
      ...d,
      [type.id]: {
        name: type.name || "",
        rental_type: type.rental_type || "stand",
        size: type.size || "",
        description: type.description || "",
        base_price: String(type.base_price ?? 0),
        capacity: String(type.capacity ?? 2),
        quantity_available: String(type.quantity_available ?? 0),
        cover_image: type.cover_image || "",
      },
    }));
  };

  const saveEdit = async (type) => {
    const d = drafts[type.id];
    if (!d) return;
    if (!d.name.trim()) {
      toast({
        title: "Nom requis",
        description: "Le nom de l'offre ne peut pas être vide.",
        variant: "destructive",
      });
      return;
    }
    const quantity = Math.max(0, parseInt(d.quantity_available, 10) || 0);
    // On ne descend pas sous ce qui est déjà loué.
    const rented = rentedOf(type);
    if (quantity < rented) {
      toast({
        title: "Quantité incohérente",
        description: `${rented} stand(s) sont déjà loués : la quantité ne peut pas être inférieure.`,
        variant: "destructive",
      });
      return;
    }

    setSavingId(type.id);
    const { error } = await supabase
      .from("stand_types")
      .update({
        name: d.name.trim(),
        rental_type: d.rental_type,
        size: d.size.trim(),
        description: d.description.trim(),
        base_price: parseFloat(d.base_price) || 0,
        capacity: parseInt(d.capacity, 10) || 2,
        quantity_available: quantity,
        cover_image: d.cover_image || null,
      })
      .eq("id", type.id);
    setSavingId(null);

    if (error) {
      toast({
        title: "Enregistrement impossible",
        description: error.message,
        variant: "destructive",
      });
      return;
    }
    setEditingId(null);
    toast({ title: "Offre mise à jour", description: d.name });
    onSaved?.();
  };

  const removeType = async (type) => {
    const rented = rentedOf(type);
    if (rented > 0) {
      toast({
        title: "Suppression impossible",
        description: `${rented} stand(s) de cette offre sont déjà loués. Désactivez-la au lieu de la supprimer.`,
        variant: "destructive",
      });
      return;
    }
    const confirmed = window.confirm(
      `Supprimer définitivement l'offre « ${type.name} » ?\nCette action est définitive.`,
    );
    if (!confirmed) return;

    const { error } = await supabase.from("stand_types").delete().eq("id", type.id);
    if (error) {
      toast({
        title: "Suppression impossible",
        description: error.message,
        variant: "destructive",
      });
      return;
    }
    toast({ title: "Offre supprimée", description: type.name });
    onSaved?.();
  };

  const addType = async () => {
    if (!newDraft) return;
    if (!newDraft.name.trim()) {
      toast({
        title: "Nom requis",
        description: "Donnez un nom à la nouvelle offre.",
        variant: "destructive",
      });
      return;
    }
    setAdding(true);
    const { error } = await supabase.from("stand_types").insert({
      stand_event_id: standEventId,
      event_id: event.id,
      name: newDraft.name.trim(),
      rental_type: newDraft.rental_type || "stand",
      size: newDraft.size.trim(),
      description: newDraft.description.trim(),
      base_price: parseFloat(newDraft.base_price) || 0,
      base_currency: "XOF",
      calculated_price_pi: 0,
      capacity: parseInt(newDraft.capacity, 10) || 2,
      quantity_available: Math.max(1, parseInt(newDraft.quantity_available, 10) || 1),
      quantity_rented: 0,
      is_active: true,
      cover_image: newDraft.cover_image || null,
    });
    setAdding(false);

    if (error) {
      toast({
        title: "Création impossible",
        description: error.message,
        variant: "destructive",
      });
      return;
    }
    setNewDraft(null);
    toast({ title: "Offre ajoutée" });
    onSaved?.();
  };

  if (!standEventId) return null;

  const rentalOptions = Object.values(RENTAL_TYPES);

  const fieldLabel = { className: "text-xs text-gray-400 mb-1 block" };

  return (
    <div className="mt-10 rounded-xl border border-gray-800 bg-gray-900/40 p-5">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div>
          <h4 className="text-white font-semibold">Gérer les offres de stand</h4>
          <p className="text-xs text-gray-400 mt-1">
            Ajoutez les types manquants, ajustez les prix et les affiches.
          </p>
        </div>
        <Button
          size="sm"
          onClick={() =>
            setNewDraft({
              name: "",
              rental_type: "stand",
              size: "",
              description: "",
              base_price: "0",
              capacity: "2",
              quantity_available: "1",
              cover_image: "",
            })
          }
          disabled={Boolean(newDraft)}
          className="bg-gradient-to-r from-blue-600 to-cyan-600"
        >
          <PlusCircle className="w-4 h-4 mr-2" />
          Ajouter une offre
        </Button>
      </div>

      {/* Nouvelle offre */}
      {newDraft && (
        <div className="border border-blue-800 bg-blue-950/20 rounded-lg p-4 mb-4 space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <Label className={fieldLabel.className}>Nom *</Label>
              <Input
                value={newDraft.name}
                onChange={(e) =>
                  setNewDraft({ ...newDraft, name: e.target.value })
                }
                placeholder="Ex: Case à dormir Premium"
                className="bg-gray-800 border-gray-700 text-white"
              />
            </div>
            <div>
              <Label className={fieldLabel.className}>Type</Label>
              <Select
                value={newDraft.rental_type}
                onValueChange={(v) => setNewDraft({ ...newDraft, rental_type: v })}
              >
                <SelectTrigger className="bg-gray-800 border-gray-700 text-white">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-gray-900 border-gray-700 text-white">
                  {rentalOptions.map((r) => (
                    <SelectItem key={r.id} value={r.id}>
                      {r.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div>
              <Label className={fieldLabel.className}>Prix (F CFA)</Label>
              <Input
                type="number"
                min="0"
                value={newDraft.base_price}
                onChange={(e) => setNewDraft({ ...newDraft, base_price: e.target.value })}
                className="bg-gray-800 border-gray-700 text-white"
              />
            </div>
            <div>
              <Label className={fieldLabel.className}>Quantité</Label>
              <Input
                type="number"
                min="1"
                value={newDraft.quantity_available}
                onChange={(e) =>
                  setNewDraft({ ...newDraft, quantity_available: e.target.value })
                }
                className="bg-gray-800 border-gray-700 text-white"
              />
            </div>
            <div>
              <Label className={fieldLabel.className}>Dimensions</Label>
              <Input
                value={newDraft.size}
                onChange={(e) => setNewDraft({ ...newDraft, size: e.target.value })}
                placeholder="Ex: 3x3m"
                className="bg-gray-800 border-gray-700 text-white"
              />
            </div>
            <div>
              <Label className={fieldLabel.className}>Capacité</Label>
              <Input
                type="number"
                min="1"
                value={newDraft.capacity}
                onChange={(e) => setNewDraft({ ...newDraft, capacity: e.target.value })}
                className="bg-gray-800 border-gray-700 text-white"
              />
            </div>
          </div>
          <div>
            <Label className={fieldLabel.className}>Affiche de couverture</Label>
            <ImageUpload
              onImageUploaded={(url) => setNewDraft((d) => ({ ...d, cover_image: url }))}
              existingImage={newDraft.cover_image}
              folder="stand-covers"
              aspectRatio="4/3"
            />
          </div>
          <div className="flex gap-2 justify-end">
            <Button variant="ghost" onClick={() => setNewDraft(null)}>
              Annuler
            </Button>
            <Button onClick={addType} disabled={adding} className="bg-blue-600">
              {adding ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
              Créer l'offre
            </Button>
          </div>
        </div>
      )}

      <div className="space-y-3">
        {initialTypes.map((type) => {
          const info = RENTAL_TYPES[(type.rental_type || "stand").toUpperCase()] || RENTAL_TYPES.STAND;
          const Icon = info.icon;
          const isEditing = editingId === type.id;
          const d = drafts[type.id] || {};

          return (
            <div
              key={type.id}
              className="border border-gray-800 rounded-lg bg-gray-900/60 p-3"
            >
              {!isEditing ? (
                <div className="flex items-center gap-3">
                  {type.cover_image ? (
                    <img
                      src={type.cover_image}
                      alt={type.name}
                      className="w-14 h-14 rounded-lg object-cover border border-gray-700 flex-shrink-0"
                    />
                  ) : (
                    <div className="w-14 h-14 rounded-lg bg-gray-800 flex items-center justify-center flex-shrink-0">
                      <Icon className="w-6 h-6 text-gray-500" />
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-white font-semibold truncate">{type.name}</span>
                      <Badge className="bg-gray-800 text-gray-300 text-xs">{info.label}</Badge>
                    </div>
                    <p className="text-xs text-gray-400 mt-0.5">
                      {Number(type.base_price || 0).toLocaleString()} F CFA •{" "}
                      {type.quantity_available} dispo • {type.size || "N/A"}
                    </p>
                  </div>
                  <div className="flex gap-1">
                    <Button size="icon" variant="ghost" onClick={() => startEdit(type)} title="Modifier">
                      <Pencil className="w-4 h-4" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => removeType(type)}
                      title="Supprimer"
                      className="text-gray-400 hover:text-red-400"
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div>
                      <Label className={fieldLabel.className}>Nom *</Label>
                      <Input
                        value={d.name || ""}
                        onChange={(e) =>
                          setDrafts({ ...drafts, [type.id]: { ...d, name: e.target.value } })
                        }
                        className="bg-gray-800 border-gray-700 text-white"
                      />
                    </div>
                    <div>
                      <Label className={fieldLabel.className}>Type</Label>
                      <Select
                        value={d.rental_type || "stand"}
                        onValueChange={(v) =>
                          setDrafts({ ...drafts, [type.id]: { ...d, rental_type: v } })
                        }
                      >
                        <SelectTrigger className="bg-gray-800 border-gray-700 text-white">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent className="bg-gray-900 border-gray-700 text-white">
                          {rentalOptions.map((r) => (
                            <SelectItem key={r.id} value={r.id}>
                              {r.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    <div>
                      <Label className={fieldLabel.className}>Prix (F CFA)</Label>
                      <Input
                        type="number"
                        min="0"
                        value={d.base_price || "0"}
                        onChange={(e) =>
                          setDrafts({ ...drafts, [type.id]: { ...d, base_price: e.target.value } })
                        }
                        className="bg-gray-800 border-gray-700 text-white"
                      />
                    </div>
                    <div>
                      <Label className={fieldLabel.className}>
                        Quantité{rentedOf(type) > 0 ? ` (${rentedOf(type)} loués)` : ""}
                      </Label>
                      <Input
                        type="number"
                        min={rentedOf(type)}
                        value={d.quantity_available || "0"}
                        onChange={(e) =>
                          setDrafts({
                            ...drafts,
                            [type.id]: { ...d, quantity_available: e.target.value },
                          })
                        }
                        className="bg-gray-800 border-gray-700 text-white"
                      />
                    </div>
                    <div>
                      <Label className={fieldLabel.className}>Dimensions</Label>
                      <Input
                        value={d.size || ""}
                        onChange={(e) =>
                          setDrafts({ ...drafts, [type.id]: { ...d, size: e.target.value } })
                        }
                        className="bg-gray-800 border-gray-700 text-white"
                      />
                    </div>
                    <div>
                      <Label className={fieldLabel.className}>Capacité</Label>
                      <Input
                        type="number"
                        min="1"
                        value={d.capacity || "2"}
                        onChange={(e) =>
                          setDrafts({ ...drafts, [type.id]: { ...d, capacity: e.target.value } })
                        }
                        className="bg-gray-800 border-gray-700 text-white"
                      />
                    </div>
                  </div>
                  <div>
                    <Label className={fieldLabel.className}>Affiche de couverture</Label>
                    <ImageUpload
                      onImageUploaded={(url) =>
                        setDrafts({ ...drafts, [type.id]: { ...d, cover_image: url } })
                      }
                      existingImage={d.cover_image || ""}
                      folder="stand-covers"
                      aspectRatio="4/3"
                    />
                  </div>
                  <div className="flex gap-2 justify-end">
                    <Button variant="ghost" onClick={() => setEditingId(null)}>
                      Annuler
                    </Button>
                    <Button
                      onClick={() => saveEdit(type)}
                      disabled={savingId === type.id}
                      className="bg-blue-600"
                    >
                      {savingId === type.id ? (
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      ) : (
                        <Save className="w-4 h-4 mr-2" />
                      )}
                      Enregistrer
                    </Button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default StandRentalInterface;