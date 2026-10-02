import React, { useState, useEffect, useCallback, memo } from "react";
import { useNavigate } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import { supabase } from "@/lib/customSupabaseClient";
import { useAuth } from "@/contexts/SupabaseAuthContext";
import { toast } from "@/components/ui/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
  CardFooter,
} from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import {
  Loader2,
  Store,
  Plus,
  Trash,
  Coins,
  Calendar,
  MapPin,
  CheckCircle2,
  ArrowRight,
  ArrowLeft,
  Image as ImageIcon,
  FileText,
  Bed,
  Tent,
  Hotel,
  Home,
  Compass,
} from "lucide-react";
import { v4 as uuidv4 } from "uuid";
import ImageUpload from "@/components/ImageUpload";
import OrganizerContractModal from "@/components/organizer/OrganizerContractModal";

// Types de location
const RENTAL_TYPES = [
  { 
    id: "stand", 
    label: "Stand d'exposition", 
    icon: Store, 
    color: "blue",
    description: "Espace pour exposer vos produits ou services"
  },
  { 
    id: "accommodation", 
    label: "Hébergement / Case", 
    icon: Bed, 
    color: "green",
    description: "Nuitée sur le site de l'événement"
  },
  { 
    id: "camping", 
    label: "Emplacement Camping", 
    icon: Tent, 
    color: "orange",
    description: "Espace pour tente ou camping-car"
  },
  { 
    id: "glamping", 
    label: "Glamping / Tente Luxe", 
    icon: Hotel, 
    color: "purple",
    description: "Tente tout équipée avec confort premium"
  },
];

// Couleurs pour les stands
const STAND_COLORS = [
  {
    border: "border-l-blue-400",
    bg: "bg-blue-900/20",
    text: "text-blue-300",
    badge: "bg-blue-800 text-blue-100",
  },
  {
    border: "border-l-green-400",
    bg: "bg-green-900/20",
    text: "text-green-300",
    badge: "bg-green-800 text-green-100",
  },
  {
    border: "border-l-purple-400",
    bg: "bg-purple-900/20",
    text: "text-purple-300",
    badge: "bg-purple-800 text-purple-100",
  },
  {
    border: "border-l-orange-400",
    bg: "bg-orange-900/20",
    text: "text-orange-300",
    badge: "bg-orange-800 text-orange-100",
  },
  {
    border: "border-l-pink-400",
    bg: "bg-pink-900/20",
    text: "text-pink-300",
    badge: "bg-pink-800 text-pink-100",
  },
  {
    border: "border-l-indigo-400",
    bg: "bg-indigo-900/20",
    text: "text-indigo-300",
    badge: "bg-indigo-800 text-indigo-100",
  },
  {
    border: "border-l-teal-400",
    bg: "bg-teal-900/20",
    text: "text-teal-300",
    badge: "bg-teal-800 text-teal-100",
  },
  {
    border: "border-l-amber-400",
    bg: "bg-amber-900/20",
    text: "text-amber-300",
    badge: "bg-amber-800 text-amber-100",
  },
  {
    border: "border-l-rose-400",
    bg: "bg-rose-900/20",
    text: "text-rose-300",
    badge: "bg-rose-800 text-rose-100",
  },
  {
    border: "border-l-cyan-400",
    bg: "bg-cyan-900/20",
    text: "text-cyan-300",
    badge: "bg-cyan-800 text-cyan-100",
  },
];

const convertToCoins = (amount, currency) => {
  let rate = 10;
  if (currency === "XOF" || currency === "XAF") rate = 10;
  else if (currency === "EUR") rate = 655 / 10;
  else if (currency === "USD") rate = 600 / 10;
  const safeAmount = parseFloat(amount) || 0;
  return Math.ceil(safeAmount / rate);
};

const formatCurrency = (amount, currency) => {
  const safeAmount = parseFloat(amount) || 0;
  return new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: currency === "XOF" ? "XOF" : currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(safeAmount);
};

// Memoized Stand Type Row
const StandTypeItem = memo(({ st, index, onChange, onRemove, canRemove }) => {
  const colors = STAND_COLORS[index % STAND_COLORS.length];
  const rentalTypeInfo = RENTAL_TYPES.find(t => t.id === st.rental_type) || RENTAL_TYPES[0];
  const Icon = rentalTypeInfo.icon;
  const color = rentalTypeInfo.color;

  return (
    <Card
      className={`relative ${colors.border} ${colors.bg} hover:shadow-lg transition-all group mb-4 border-gray-700`}
    >
      <CardContent className="p-6">
        <div className="absolute top-4 right-4 flex items-center gap-2">
          <Badge className={`${colors.badge} font-medium border-0`}>
            #{index + 1}
          </Badge>
          {canRemove && (
            <Button
              variant="ghost"
              size="icon"
              onClick={() => onRemove(st.id)}
              className="h-8 w-8 text-gray-400 hover:text-red-400 hover:bg-red-900/30"
            >
              <Trash className="w-4 h-4" />
            </Button>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-4">
          <div className="space-y-2">
            <Label className={`font-bold text-base ${colors.text}`}>
              Nom 🏷️ *
            </Label>
            <Input
              value={st.name}
              onChange={(e) => onChange(st.id, "name", e.target.value)}
              placeholder="Ex: Stand Premium 🌟"
              className="font-semibold h-11 bg-gray-800 border-gray-700 text-white"
            />
          </div>
          <div className="space-y-2">
            <Label className={`font-bold text-base ${colors.text}`}>
              Type de location 🏕️ *
            </Label>
            <Select
              value={st.rental_type || "stand"}
              onValueChange={(val) => onChange(st.id, "rental_type", val)}
            >
              <SelectTrigger className="h-11 bg-gray-800 border-gray-700 text-white">
                <SelectValue placeholder="Choisir..." />
              </SelectTrigger>
              <SelectContent className="bg-gray-900 border-gray-700 text-white">
                {RENTAL_TYPES.map((type) => (
                  <SelectItem key={type.id} value={type.id}>
                    <div className="flex items-center gap-2">
                      <type.icon className={`w-4 h-4 text-${type.color}-400`} />
                      <span>{type.label}</span>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Affiche de couverture propre à ce type de stand */}
        <div className="space-y-2 mb-4">
          <Label className={`font-bold text-base ${colors.text}`}>
            Affiche de ce type de stand 🖼️
          </Label>
          <p className="text-xs text-gray-400">
            Image présentée aux visiteurs pour ce type d'offre. Formats libres,
            la taille est réduite automatiquement.
          </p>
          <ImageUpload
            onImageUploaded={(url) => onChange(st.id, "cover_image", url)}
            existingImage={st.cover_image || ""}
            folder="stand-covers"
            aspectRatio="4/3"
            bucket="media"
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-4">
          <div className="space-y-2">
            <Label className={`font-bold text-base ${colors.text}`}>
              Dimensions 📐
            </Label>
            <Input
              value={st.size}
              onChange={(e) => onChange(st.id, "size", e.target.value)}
              placeholder="Ex: 9m²"
              className="h-11 bg-gray-800 border-gray-700 text-white"
            />
          </div>
          <div className="space-y-2">
            <Label className={`font-bold text-base ${colors.text}`}>
              Quantité 🔢 *
            </Label>
            <Input
              type="number"
              min="1"
              value={st.quantity_available}
              onChange={(e) =>
                onChange(st.id, "quantity_available", e.target.value)
              }
              className="h-11 bg-gray-800 border-gray-700 text-white"
            />
          </div>
          <div className="space-y-2">
            <Label className={`font-bold text-base ${colors.text}`}>
              Capacité 👥
            </Label>
            <Input
              type="number"
              min="1"
              value={st.capacity || ""}
              onChange={(e) => onChange(st.id, "capacity", e.target.value)}
              placeholder="Ex: 2"
              className="h-11 bg-gray-800 border-gray-700 text-white"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-4">
          <div className="space-y-2">
            <Label className={`font-bold text-base ${colors.text}`}>
              Prix 💰 *
            </Label>
            <Input
              type="number"
              min="0"
              value={st.base_price}
              onChange={(e) => onChange(st.id, "base_price", e.target.value)}
              className="h-11 bg-gray-800 border-gray-700 text-white"
            />
          </div>
          <div className="space-y-2">
            <Label className={`font-bold text-base ${colors.text}`}>
              Devise 💱
            </Label>
            <Select
              value={st.base_currency}
              onValueChange={(val) => onChange(st.id, "base_currency", val)}
            >
              <SelectTrigger className="h-11 bg-gray-800 border-gray-700 text-white">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-gray-900 border-gray-700 text-white">
                <SelectItem value="XOF">FCFA (XOF)</SelectItem>
                <SelectItem value="USD">Dollar (USD)</SelectItem>
                <SelectItem value="EUR">Euro (EUR)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label className="font-bold text-base text-primary-300">
              Prix en Pièces 🪙
            </Label>
            <div className="h-11 flex items-center px-3 rounded-md bg-primary-900/30 text-primary-300 font-bold border border-primary-800">
              <Coins className="w-4 h-4 mr-2" />
              <span className="text-lg">
                {convertToCoins(st.base_price, st.base_currency)} π
              </span>
            </div>
          </div>
        </div>

        <div className="space-y-2">
          <Label className={`font-bold text-base ${colors.text}`}>
            Description 📝
          </Label>
          <Textarea
            value={st.description}
            onChange={(e) => onChange(st.id, "description", e.target.value)}
            placeholder="Détails..."
            rows={2}
            className="bg-gray-800 border-gray-700 text-white"
          />
        </div>

        <div className="mt-3 flex items-center gap-2">
          <Icon className={`w-4 h-4 text-${color}-400`} />
          <span className={`text-xs text-${color}-300`}>
            {rentalTypeInfo.label} - {rentalTypeInfo.description}
          </span>
        </div>
      </CardContent>
    </Card>
  );
});

// Step Components
const Step1Details = ({
  title,
  setTitle,
  description,
  setDescription,
  eventDate,
  setEventDate,
  endDate,
  setEndDate,
  city,
  setCity,
  country,
  setCountry,
  address,
  setAddress,
  categoryId,
  setCategoryId,
  categories,
  coverImage,
  setCoverImage,
}) => (
  <div className="space-y-8 animate-in fade-in slide-in-from-right-4 duration-300">
    <div className="space-y-4">
      <Label className="text-lg font-bold flex items-center gap-2 text-gray-200">
        <ImageIcon className="w-5 h-5 text-primary-400" /> Image de couverture 🖼️
      </Label>
      <div className="bg-gray-800/50 p-6 rounded-xl border-2 border-dashed border-gray-700">
        <ImageUpload
          onImageUploaded={setCoverImage}
          existingImage={coverImage}
          className="w-full"
        />
      </div>
    </div>
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
      <div className="space-y-2">
        <Label className="text-gray-200">Titre 📌 *</Label>
        <Input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="bg-gray-800 border-gray-700 text-white"
          placeholder="Mon événement incroyable 🎉"
        />
      </div>
      <div className="space-y-2">
        <Label className="text-gray-200">Catégorie 📂 *</Label>
        <Select onValueChange={setCategoryId} value={categoryId}>
          <SelectTrigger className="bg-gray-800 border-gray-700 text-white">
            <SelectValue placeholder="Choisir une catégorie..." />
          </SelectTrigger>
          <SelectContent className="bg-gray-900 border-gray-700 text-white">
            {categories.map((cat) => (
              <SelectItem key={cat.id} value={cat.id}>
                {cat.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
    <div className="space-y-2">
      <Label className="text-gray-200">Description 📖</Label>
      <Textarea
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        className="bg-gray-800 border-gray-700 text-white"
        placeholder="Décrivez votre événement en détail... ✨"
        rows={4}
      />
    </div>
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
      <div className="space-y-2">
        <Label className="text-gray-200">Début 📅 *</Label>
        <Input
          type="datetime-local"
          value={eventDate}
          onChange={(e) => setEventDate(e.target.value)}
          className="bg-gray-800 border-gray-700 text-white"
        />
      </div>
      <div className="space-y-2">
        <Label className="text-gray-200">Fin 📅</Label>
        <Input
          type="datetime-local"
          value={endDate}
          onChange={(e) => setEndDate(e.target.value)}
          className="bg-gray-800 border-gray-700 text-white"
        />
      </div>
    </div>
    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
      <div className="space-y-2">
        <Label className="text-gray-200">Pays 🌍 *</Label>
        <Input
          value={country}
          onChange={(e) => setCountry(e.target.value)}
          className="bg-gray-800 border-gray-700 text-white"
          placeholder="Sénégal 🇸🇳"
        />
      </div>
      <div className="space-y-2">
        <Label className="text-gray-200">Ville 🏙️ *</Label>
        <Input
          value={city}
          onChange={(e) => setCity(e.target.value)}
          className="bg-gray-800 border-gray-700 text-white"
          placeholder="Dakar"
        />
      </div>
      <div className="space-y-2">
        <Label className="text-gray-200">Adresse 📍</Label>
        <Input
          value={address}
          onChange={(e) => setAddress(e.target.value)}
          className="bg-gray-800 border-gray-700 text-white"
          placeholder="Adresse complète..."
        />
      </div>
    </div>
  </div>
);

const Step2Stands = ({
  standTypes,
  handleStandTypeChange,
  removeStandType,
  addStandType,
}) => (
  <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
    <div className="bg-blue-900/30 p-4 rounded-xl border border-blue-800 mb-6 flex gap-3">
      <Store className="w-6 h-6 text-blue-400 mt-1 shrink-0" />
      <div>
        <h4 className="font-bold text-blue-300">Configurez vos offres 🏪</h4>
        <p className="text-sm text-blue-200">
          Choisissez le type de location et définissez vos tarifs.
        </p>
      </div>
    </div>

    {/* Types de location disponibles */}
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
      {RENTAL_TYPES.map((type) => {
        const Icon = type.icon;
        const hasType = standTypes.some(st => st.rental_type === type.id);
        return (
          <div
            key={type.id}
            className={`p-3 rounded-lg border text-center transition-all ${
              hasType 
                ? `border-${type.color}-500 bg-${type.color}-900/20 text-${type.color}-300` 
                : 'border-gray-700 bg-gray-800/30 text-gray-500'
            }`}
          >
            <Icon className={`w-5 h-5 mx-auto mb-1 ${hasType ? `text-${type.color}-400` : 'text-gray-600'}`} />
            <p className="text-xs font-medium">{type.label}</p>
            {hasType && <Badge className="mt-1 text-[8px] bg-green-900 text-green-300">✅ Activé</Badge>}
          </div>
        );
      })}
    </div>

    <div className="space-y-4">
      {standTypes.map((st, index) => (
        <StandTypeItem
          key={st.id}
          st={st}
          index={index}
          onChange={handleStandTypeChange}
          onRemove={removeStandType}
          canRemove={standTypes.length > 1}
        />
      ))}
    </div>
    <Button
      onClick={addStandType}
      variant="outline"
      className="w-full py-8 border-dashed border-gray-700 text-gray-300 hover:text-white hover:border-gray-600"
    >
      <Plus className="w-5 h-5 mr-2" /> Ajouter une offre ➕
    </Button>
  </div>
);

const Step3Confirmation = ({
  coverImage,
  title,
  description,
  eventDate,
  city,
  country,
  standTypes,
  termsAccepted,
  setShowContractModal,
}) => {
  const totalPotentialRevenuePi = standTypes.reduce(
    (acc, st) =>
      acc +
      convertToCoins(st.base_price, st.base_currency) *
        (parseInt(st.quantity_available) || 0),
    0,
  );

  // Regrouper les types pour l'affichage
  const typesSummary = standTypes.reduce((acc, st) => {
    const type = RENTAL_TYPES.find(t => t.id === st.rental_type) || RENTAL_TYPES[0];
    if (!acc[type.id]) {
      acc[type.id] = { ...type, count: 0, items: [] };
    }
    acc[type.id].count += parseInt(st.quantity_available) || 0;
    acc[type.id].items.push(st);
    return acc;
  }, {});

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-right-4 duration-300">
      <div className="bg-gray-800 p-6 rounded-xl border border-gray-700 flex flex-col md:flex-row gap-6">
        {coverImage && (
          <div className="w-full md:w-1/3 aspect-video rounded-lg overflow-hidden">
            <img
              src={coverImage}
              alt="Cover"
              className="w-full h-full object-cover"
            />
          </div>
        )}
        <div className="flex-1 space-y-4">
          <div>
            <h3 className="text-2xl font-bold text-white">{title || "Sans titre"}</h3>
            <p className="text-gray-300 flex items-center gap-2 mt-1">
              <MapPin className="w-4 h-4" /> {city || "Ville"}, {country || "Pays"}
            </p>
            <p className="text-gray-300 flex items-center gap-2">
              <Calendar className="w-4 h-4" />{" "}
              {eventDate ? new Date(eventDate).toLocaleDateString() : "Date non définie"}
            </p>
          </div>
          <div className="p-4 bg-gray-900 rounded-lg text-sm text-gray-300">
            {description || "Aucune description 📝"}
          </div>
        </div>
      </div>

      {/* Résumé des types */}
      <div className="bg-gray-800/50 p-4 rounded-xl border border-gray-700">
        <h4 className="font-bold text-white mb-3">Offres proposées 🏷️</h4>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {Object.values(typesSummary).map((type) => {
            const Icon = type.icon;
            return (
              <div key={type.id} className={`bg-${type.color}-900/20 border border-${type.color}-800 rounded-lg p-3`}>
                <div className="flex items-center gap-2">
                  <Icon className={`w-4 h-4 text-${type.color}-400`} />
                  <span className={`font-medium text-${type.color}-300`}>{type.label}</span>
                  <Badge className={`ml-auto bg-${type.color}-900 text-${type.color}-200`}>
                    {type.count} places
                  </Badge>
                </div>
                <div className="mt-2 text-xs text-gray-400">
                  {type.items.map((item, i) => (
                    <span key={i} className="mr-2">
                      {item.name} ({item.quantity_available} x {convertToCoins(item.base_price, item.base_currency)}π)
                      {i < type.items.length - 1 && " • "}
                    </span>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="mt-6 p-6 bg-gradient-to-r from-green-900/30 to-emerald-900/30 border border-green-800 rounded-xl flex justify-between items-center">
        <div>
          <p className="font-bold text-green-300 text-lg">
            Revenu Potentiel Max 💰
          </p>
          <p className="text-sm text-green-200">
            Si toutes les places sont réservées
          </p>
        </div>
        <p className="text-3xl font-extrabold text-green-300">
          {totalPotentialRevenuePi} π 🪙
        </p>
      </div>

      {/* Contract Section */}
      <Card
        className={
          termsAccepted
            ? "border-green-500/50 bg-green-500/5"
            : "border-amber-500/50 bg-amber-500/5"
        }
      >
        <CardContent className="p-6">
          <h3 className="font-bold text-lg mb-2 flex items-center gap-2 text-white">
            <FileText className="w-5 h-5" /> Contrat Organisateur 📄
          </h3>

          {termsAccepted ? (
            <div className="space-y-4">
              <div className="flex items-center gap-2 text-green-400 font-medium p-3 bg-green-900/30 rounded-lg border border-green-800">
                <CheckCircle2 className="w-5 h-5" />
                ✅ Contrat lu et approuvé
              </div>
              <Button
                variant="outline"
                onClick={() => setShowContractModal(true)}
                className="w-full text-xs border-gray-700 text-gray-400 hover:text-white"
              >
                Relire le contrat 📖
              </Button>
            </div>
          ) : (
            <div className="space-y-4">
              <p className="text-sm text-gray-400">
                ⚠️ Pour publier cet événement, vous devez lire intégralement et
                signer le contrat organisateur.
              </p>
              <Button
                onClick={() => setShowContractModal(true)}
                className="w-full bg-blue-600 hover:bg-blue-700 text-white shadow-lg shadow-blue-900/20"
              >
                📋 Lire et Signer le Contrat
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

const CreateStandEventPage = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [categories, setCategories] = useState([]);
  const [step, setStep] = useState(1);

  // Modal State
  const [showContractModal, setShowContractModal] = useState(false);
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [contractAcceptanceId, setContractAcceptanceId] = useState(null);

  // Form State
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [coverImage, setCoverImage] = useState(null);
  const [eventDate, setEventDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [city, setCity] = useState("");
  const [country, setCountry] = useState("");
  const [address, setAddress] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [standTypes, setStandTypes] = useState([
    {
      id: uuidv4(),
      name: "Stand Standard 🌟",
      rental_type: "stand",
      base_price: 50000,
      base_currency: "XOF",
      quantity_available: 10,
      capacity: 2,
      description: "Espace 3x3m pour exposer vos produits 🏪",
      size: "3x3m",
    },
  ]);

  useEffect(() => {
    const fetchCategories = async () => {
      const { data } = await supabase
        .from("event_categories")
        .select("*")
        .eq("is_active", true);
      setCategories(data || []);
    };
    fetchCategories();
  }, []);

  const handleStandTypeChange = (id, field, value) =>
    setStandTypes((prev) =>
      prev.map((st) => (st.id === id ? { ...st, [field]: value } : st)),
    );
  const addStandType = () => {
    // Déterminer le type le moins utilisé
    const typeCount = {};
    standTypes.forEach(st => {
      typeCount[st.rental_type || "stand"] = (typeCount[st.rental_type || "stand"] || 0) + 1;
    });
    let defaultType = "stand";
    let minCount = Infinity;
    RENTAL_TYPES.forEach(t => {
      if ((typeCount[t.id] || 0) < minCount) {
        minCount = typeCount[t.id] || 0;
        defaultType = t.id;
      }
    });
    
    setStandTypes((prev) => [
      ...prev,
      {
        id: uuidv4(),
        name: `Offre ${prev.length + 1} 🆕`,
        rental_type: defaultType,
        base_price: 0,
        base_currency: "XOF",
        quantity_available: 5,
        capacity: 2,
        description: "",
        size: "3x3m",
      },
    ]);
  };
  const removeStandType = (id) =>
    setStandTypes((prev) =>
      prev.length > 1 ? prev.filter((st) => st.id !== id) : prev,
    );

  // ============================================================
  // GESTION DU CONTRAT
  // ============================================================
  const handleContractAccept = async () => {
    if (!user) {
      toast({
        title: "Erreur ❌",
        description: "Vous devez être connecté.",
        variant: "destructive",
      });
      return;
    }

    try {
      // Enregistrer l'acceptation du contrat
      const { data, error } = await supabase
        .from("user_contract_acceptances")
        .insert({
          user_id: user.id,
          event_id: null,
          contract_type: "organizer",
          accepted_at: new Date().toISOString(),
          contract_version: "v2.0",
        })
        .select()
        .single();

      if (error) {
        console.warn("⚠️ Table user_contract_acceptances non trouvée:", error);
        setTermsAccepted(true);
        setShowContractModal(false);
        toast({
          title: "✅ Contrat accepté",
          description: "Vous pouvez maintenant publier votre événement.",
          className: "bg-green-600 text-white",
        });
        return;
      }

      if (data) {
        setContractAcceptanceId(data.id);
      }

      setTermsAccepted(true);
      setShowContractModal(false);
      
      toast({
        title: "✅ Contrat accepté",
        description: "Votre acceptation a été enregistrée.",
        className: "bg-green-600 text-white",
      });

    } catch (err) {
      console.error("❌ Erreur lors de l'acceptation du contrat:", err);
      setTermsAccepted(true);
      setShowContractModal(false);
      toast({
        title: "✅ Contrat accepté",
        description: "Vous pouvez maintenant publier votre événement.",
        className: "bg-green-600 text-white",
      });
    }
  };

  const performSubmission = async () => {
    if (!user) return navigate("/auth");

    if (!termsAccepted) {
      toast({
        title: "⚠️ Contrat requis",
        description: "Veuillez lire et signer le contrat.",
        variant: "destructive",
      });
      setShowContractModal(true);
      return;
    }

    // ============================================================
    // VALIDATION - FIX: Vérifier que categoryId n'est pas vide
    // ============================================================
    if (!categoryId || categoryId === "") {
      toast({
        title: "❌ Erreur de validation",
        description: "Veuillez sélectionner une catégorie valide.",
        variant: "destructive",
      });
      setStep(1);
      return;
    }

    if (!title || title.trim() === "") {
      toast({
        title: "❌ Erreur de validation",
        description: "Veuillez saisir un titre.",
        variant: "destructive",
      });
      setStep(1);
      return;
    }

    if (!eventDate) {
      toast({
        title: "❌ Erreur de validation",
        description: "Veuillez sélectionner une date de début.",
        variant: "destructive",
      });
      setStep(1);
      return;
    }

    if (!city || city.trim() === "") {
      toast({
        title: "❌ Erreur de validation",
        description: "Veuillez saisir une ville.",
        variant: "destructive",
      });
      setStep(1);
      return;
    }

    if (!country || country.trim() === "") {
      toast({
        title: "❌ Erreur de validation",
        description: "Veuillez saisir un pays.",
        variant: "destructive",
      });
      setStep(1);
      return;
    }

    // Vérifier qu'il y a au moins un stand type valide.
    // Une offre à prix 0 (offerte / inclus dans le billet) est légitime :
    // l'ancien `base_price > 0` la supprimait en silence, sans message.
    const validStandTypes = standTypes.filter(st =>
      st.name && st.name.trim() !== "" &&
      parseFloat(st.base_price) >= 0 && !Number.isNaN(parseFloat(st.base_price)) &&
      parseInt(st.quantity_available, 10) > 0
    );

    // Signaler explicitement les offres écartées plutôt que de les perdre.
    const droppedTypes = standTypes.filter(st => !validStandTypes.includes(st));
    if (droppedTypes.length > 0) {
      toast({
        title: "Offres non enregistrées",
        description: droppedTypes
          .map((st) => `« ${st.name || "sans nom"} »`)
          .join(", ") + " : nom ou quantité manquant.",
        variant: "destructive",
      });
    }

    if (validStandTypes.length === 0) {
      toast({
        title: "❌ Erreur de validation",
        description: "Veuillez configurer au moins une offre valide avec un prix et une quantité.",
        variant: "destructive",
      });
      setStep(2);
      return;
    }

    setLoading(true);
    try {
      // 1. Créer l'événement
      const eventDataToInsert = {
        title: title.trim(),
        description: description.trim() || null,
        event_start_at: eventDate,
        event_end_at: endDate || null,
        city: city.trim(),
        country: country.trim(),
        address: address.trim() || null,
        organizer_id: user.id,
        event_type: "stand_rental",
        category_id: categoryId, // Maintenant garanti non-vide
        status: "active",
        cover_image: coverImage || null,
        created_at: new Date().toISOString(),
        contract_accepted_at: new Date().toISOString(),
        contract_version: "v2.0",
      };

      console.log("📝 Données de l'événement:", eventDataToInsert);

      const { data: eventData, error: eventError } = await supabase
        .from("events")
        .insert(eventDataToInsert)
        .select()
        .single();

      if (eventError) {
        console.error("❌ Erreur création événement:", eventError);
        throw eventError;
      }

      const newEventId = eventData.id;
      console.log("✅ Événement créé:", newEventId);

      // 2. Mettre à jour l'acceptation du contrat
      if (contractAcceptanceId) {
        try {
          await supabase
            .from("user_contract_acceptances")
            .update({ event_id: newEventId })
            .eq("id", contractAcceptanceId);
        } catch (err) {
          console.warn("⚠️ Erreur mise à jour contrat:", err);
        }
      } else {
        try {
          await supabase.from("user_contract_acceptances").insert({
            user_id: user.id,
            event_id: newEventId,
            contract_type: "organizer",
            accepted_at: new Date().toISOString(),
            contract_version: "v2.0",
          });
        } catch (err) {
          console.warn("⚠️ Erreur insertion contrat:", err);
        }
      }

      // 3. Créer stand_events
      console.log("🔍 Création de stand_events pour event_id:", newEventId);

      const { data: standEventData, error: standEventError } = await supabase
        .from("stand_events")
        .insert({
          event_id: newEventId,
          base_currency: standTypes[0]?.base_currency || "XOF",
        })
        .select()
        .single();

      if (standEventError) {
        console.error("❌ Erreur stand_events:", standEventError);
        throw standEventError;
      }

      if (!standEventData || !standEventData.id) {
        throw new Error("standEventData créé sans ID");
      }
      console.log("✅ standEventData créé:", standEventData.id);

      // 4. Créer les stand_types
      console.log("🔍 Création des stand_types...");

      const standTypesToInsert = validStandTypes.map((st) => ({
        stand_event_id: standEventData.id,
        event_id: newEventId,
        name: st.name.trim(),
        description: st.description?.trim() || "",
        size: st.size?.trim() || "Standard",
        rental_type: st.rental_type || "stand",
        capacity: parseInt(st.capacity) || 2,
        base_price: parseFloat(st.base_price) || 0,
        base_currency: st.base_currency || "XOF",
        calculated_price_pi: convertToCoins(st.base_price, st.base_currency) || 0,
        quantity_available: parseInt(st.quantity_available) || 0,
        quantity_rented: 0,
        is_active: true,
        cover_image: st.cover_image || null,
      }));

      console.log(
        `📋 ${standTypesToInsert.length} stand_types à insérer (types: ${[
          ...new Set(standTypesToInsert.map((s) => s.rental_type)),
        ].join(", ")})`,
      );

      // Insert en LOT : toutes les offres doivent être persistées.
      // Le client renvoie désormais le tableau intact jusqu'au moteur
      // (server/queryPolicy.mjs conservait auparavant body[0] seul, ce qui
      // ne créait que la première offre et affichait « Stand Standard »).
      const { error: typesError } = await supabase
        .from("stand_types")
        .insert(standTypesToInsert);

      if (typesError) {
        console.error("❌ Erreur stand_types:", typesError);
        throw typesError;
      }
      console.log("✅ stand_types insérés");

      // 5. Créer event_settings
      console.log("🔍 Création des event_settings...");

      const { error: settingsError } = await supabase
        .from("event_settings")
        .insert({
          event_id: newEventId,
          stands_enabled: true,
          // `+` est prioritaire sur `||` : l'ancien
          // `(acc + parseInt(x)) || 0` remettait le total à 0 à chaque tour
          // dès qu'un `quantity_available` était vide (NaN), donc
          // `total_stands` ne comptait que la dernière offre lue.
          total_stands: validStandTypes.reduce(
            (acc, st) => acc + (parseInt(st.quantity_available, 10) || 0),
            0,
          ),
          created_at: new Date().toISOString(),
        });

      if (settingsError) {
        console.warn("⚠️ Erreur event_settings:", settingsError);
      } else {
        console.log("✅ event_settings créés");
      }

      toast({
        title: "🎉 Succès !",
        description: `✅ Espace ${standTypes.length > 1 ? 'stands et hébergements' : 'stands'} publié !`,
        className: "bg-green-700 text-white",
      });
      navigate(`/event/${newEventId}`);
    } catch (error) {
      console.error("❌ Erreur:", error);
      toast({
        title: "❌ Erreur",
        description: error.message || "Une erreur est survenue lors de la publication.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-900 text-gray-100 pb-20">
      <Helmet>
        <title>🚀 Créer Espace Stands</title>
      </Helmet>

      <OrganizerContractModal
        open={showContractModal}
        onOpenChange={setShowContractModal}
        onAccept={handleContractAccept}
        eventTitle={title || "votre événement"}
        eventId="new-event"
      />

      <main className="container mx-auto max-w-4xl px-4 py-8">
        <Card className="bg-gray-800 border-gray-700 shadow-xl">
          <CardHeader className="bg-gray-900/50 border-b border-gray-700 text-center">
            <CardTitle className="text-3xl text-white">
              🏪 Créer un Espace Stands
            </CardTitle>
            <CardDescription className="text-gray-400">
              💼 Louez vos stands et hébergements
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-8 px-6">
            <div className="flex justify-center gap-4 mb-8">
              {[1, 2, 3].map((i) => (
                <div
                  key={i}
                  className={`w-10 h-10 rounded-full flex items-center justify-center font-bold border-2 transition-all ${
                    step >= i ? "bg-primary-600 border-primary-600 text-white" : "bg-gray-800 border-gray-600 text-gray-500"
                  }`}
                >
                  {step >= i ? "✅" : i}
                </div>
              ))}
            </div>

            {step === 1 && (
              <Step1Details
                {...{
                  title,
                  setTitle,
                  description,
                  setDescription,
                  eventDate,
                  setEventDate,
                  endDate,
                  setEndDate,
                  city,
                  setCity,
                  country,
                  setCountry,
                  address,
                  setAddress,
                  categoryId,
                  setCategoryId,
                  categories,
                  coverImage,
                  setCoverImage,
                }}
              />
            )}
            {step === 2 && (
              <Step2Stands
                {...{
                  standTypes,
                  handleStandTypeChange,
                  removeStandType,
                  addStandType,
                }}
              />
            )}
            {step === 3 && (
              <Step3Confirmation
                {...{
                  coverImage,
                  title,
                  description,
                  eventDate,
                  city,
                  country,
                  standTypes,
                  termsAccepted,
                  setShowContractModal,
                }}
              />
            )}
          </CardContent>
          <CardFooter className="flex justify-between border-t border-gray-700 p-6 bg-gray-900/30">
            {step > 1 && (
              <Button
                onClick={() => setStep((s) => s - 1)}
                variant="outline"
                className="border-gray-600 text-gray-300 hover:text-white hover:bg-gray-800"
              >
                <ArrowLeft className="w-4 h-4 mr-2" /> Retour ⬅️
              </Button>
            )}
            {step < 3 ? (
              <Button
                onClick={() => setStep((s) => s + 1)}
                className="bg-primary-600 hover:bg-primary-700 text-white ml-auto"
              >
                Suivant ➡️ <ArrowRight className="w-4 h-4 ml-2" />
              </Button>
            ) : (
              <Button
                onClick={performSubmission}
                disabled={loading || !termsAccepted}
                className="bg-green-600 hover:bg-green-700 text-white ml-auto"
              >
                {loading ? (
                  <Loader2 className="animate-spin w-5 h-5" />
                ) : (
                  <CheckCircle2 className="w-5 h-5 mr-2" />
                )}{" "}
                🚀 Publier
              </Button>
            )}
          </CardFooter>
        </Card>
      </main>
    </div>
  );
};

export default CreateStandEventPage;