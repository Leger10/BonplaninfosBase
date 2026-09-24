import React, { useState, useEffect, useCallback, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  ArrowLeft,
  Calendar,
  MapPin,
  Phone,
  Trash2,
  Loader2,
  Share2,
  ChevronDown,
  ChevronUp,
  BarChart,
  AlertTriangle,
  Scan,
  TrendingUp,
  PieChart,
  Heart,
  MessageCircle,
  Bookmark,
  Eye,
  Lock,
  Clock,
  Settings,
  PlayCircle,
  Ban,
  CheckCircle2,
  CalendarDays,
  CalendarRange,
  Wallet,
  Tag,
  Trophy,
  User,
  Calendar as CalendarIcon,
  Edit,
  Image as ImageIcon,
  Save,
  X,
  Store,
  Coins,
  Plus,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { useData } from "@/contexts/DataContext";
import { useAuth } from "@/contexts/SupabaseAuthContext";
import { toast } from "@/components/ui/use-toast";
import { supabase } from "@/lib/customSupabaseClient";
import { dbService } from "@/services/dbService";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import MultilingualSeoHead from "@/components/MultilingualSeoHead";
import SocialInteractions from "@/components/social/SocialInteractions";
import RaffleInterface from "@/components/event/RaffleInterface";
import StandRentalInterface from "@/components/event/StandRentalInterface";
import TicketingInterface from "@/components/event/TicketingInterface";
import VotingInterface from "@/components/event/VotingInterface";
import EventCountdown from "@/components/EventCountdown";
import BookmarkButton from "@/components/common/BookmarkButton";
import { extractStoragePath, fetchWithRetry } from "@/lib/utils";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import CommunityVerification from "@/components/event/CommunityVerification";
import TicketScannerDialog from "@/components/event/TicketScannerDialog";
import { PromoCodeGenerator } from "../components/influencer/PromoCodeGenerator.jsx";
import { v4 as uuidv4 } from "uuid";
import { processImage, validateImage } from "@/utils/imageConverter";

// ============================================================
// MODAL D'ÉDITION COMPLET DE L'ÉVÉNEMENT
// ============================================================
const EditEventModal = ({ isOpen, onClose, event, onEventUpdated }) => {
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [categories, setCategories] = useState([]);

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
  const [uploadingImage, setUploadingImage] = useState(false);

  // Charger les catégories
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

  // Remplir le formulaire avec les données de l'événement
  useEffect(() => {
    if (event && isOpen) {
      setTitle(event.title || "");
      setDescription(event.description || "");
      setCoverImage(event.cover_image || null);
      setEventDate(event.event_start_at || "");
      setEndDate(event.event_end_at || "");
      setCity(event.city || "");
      setCountry(event.country || "");
      setAddress(event.address || "");
      setCategoryId(event.category_id || "");
    }
  }, [event, isOpen]);

  const handleImageUpload = async (file) => {
    if (!file || !event) return;
    
    setUploadingImage(true);
    try {
      const fileExt = file.name.split('.').pop();
      const fileName = `${event.id}-${Date.now()}.${fileExt}`;
      const filePath = `event-covers/${fileName}`;
      
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('event-images')
        .upload(filePath, file);
      
      if (uploadError) throw uploadError;
      
      const { data: urlData } = supabase.storage
        .from('event-images')
        .getPublicUrl(filePath);
      
      const imageUrl = urlData.publicUrl;
      setCoverImage(imageUrl);
      
      toast({
        title: "✅ Image uploadée",
        description: "L'image a été téléchargée avec succès.",
        className: "bg-green-600 text-white",
      });
      
    } catch (error) {
      console.error("❌ Erreur upload:", error);
      toast({
        title: "❌ Erreur",
        description: "Impossible de télécharger l'image.",
        variant: "destructive",
      });
    } finally {
      setUploadingImage(false);
    }
  };

  const handleSubmit = async () => {
    if (!user || !event) return;

    // Validation
    if (!title || title.trim() === "") {
      toast({ title: "❌ Erreur", description: "Veuillez saisir un titre.", variant: "destructive" });
      return;
    }

    if (!eventDate) {
      toast({ title: "❌ Erreur", description: "Veuillez sélectionner une date de début.", variant: "destructive" });
      return;
    }

    if (!city || city.trim() === "") {
      toast({ title: "❌ Erreur", description: "Veuillez saisir une ville.", variant: "destructive" });
      return;
    }

    if (!country || country.trim() === "") {
      toast({ title: "❌ Erreur", description: "Veuillez saisir un pays.", variant: "destructive" });
      return;
    }

    setLoading(true);
    try {
      const updateData = {
        title: title.trim(),
        description: description.trim() || null,
        event_start_at: eventDate,
        event_end_at: endDate || null,
        city: city.trim(),
        country: country.trim(),
        address: address.trim() || null,
        category_id: categoryId || null,
        cover_image: coverImage || null,
        updated_at: new Date().toISOString(),
      };

      const { error: updateError } = await supabase
        .from("events")
        .update(updateData)
        .eq("id", event.id);

      if (updateError) throw updateError;

      toast({
        title: "✅ Événement mis à jour !",
        description: "Les modifications ont été enregistrées avec succès.",
        className: "bg-green-600 text-white",
      });

      if (onEventUpdated) onEventUpdated(updateData);
      onClose();

    } catch (error) {
      console.error("❌ Erreur mise à jour:", error);
      toast({
        title: "❌ Erreur",
        description: error.message || "Impossible de mettre à jour l'événement.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="bg-gray-900 border-gray-800 text-white sm:max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-white flex items-center gap-2 text-2xl">
            <Edit className="w-6 h-6 text-yellow-400" />
            ✏️ Modifier l'événement
          </DialogTitle>
          <DialogDescription className="text-gray-400">
            Modifiez les informations de votre événement.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Image de couverture */}
          <div className="space-y-2">
            <Label className="text-gray-200 flex items-center gap-2">
              <ImageIcon className="w-4 h-4 text-primary-400" />
              Image de couverture
            </Label>
            <div className="flex flex-col sm:flex-row gap-4 items-start">
              {coverImage && (
                <div className="relative w-full sm:w-48 h-32 rounded-lg overflow-hidden border border-gray-700">
                  <img 
                    src={coverImage} 
                    alt="Cover" 
                    className="w-full h-full object-cover"
                  />
                  <Button
                    variant="ghost"
                    size="icon"
                    className="absolute top-1 right-1 h-6 w-6 bg-black/60 hover:bg-red-600/80 text-white rounded-full"
                    onClick={() => setCoverImage(null)}
                  >
                    <X className="w-3 h-3" />
                  </Button>
                </div>
              )}
              <div className="flex-1">
                <Input
                  type="file"
                  accept="image/*"
                  onChange={(e) => {
                    const file = e.target.files[0];
                    if (file) handleImageUpload(file);
                  }}
                  className="bg-gray-800 border-gray-700 text-white file:bg-primary-600 file:text-white file:border-0 file:px-4 file:py-2 file:rounded-md hover:file:bg-primary-700"
                  disabled={uploadingImage}
                />
                {uploadingImage && (
                  <div className="flex items-center gap-2 mt-2 text-blue-400">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span className="text-sm">Upload en cours...</span>
                  </div>
                )}
                <p className="text-xs text-gray-500 mt-1">
                  PNG, JPG, WEBP • Max 5MB
                </p>
              </div>
            </div>
          </div>

          {/* Titre et Catégorie */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label className="text-gray-200">Titre *</Label>
              <Input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="bg-gray-800 border-gray-700 text-white"
                placeholder="Titre de l'événement"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-gray-200">Catégorie</Label>
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

          {/* Description */}
          <div className="space-y-2">
            <Label className="text-gray-200">Description</Label>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="bg-gray-800 border-gray-700 text-white min-h-[100px]"
              placeholder="Décrivez votre événement..."
            />
          </div>

          {/* Dates */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label className="text-gray-200">Date de début *</Label>
              <Input
                type="datetime-local"
                value={eventDate}
                onChange={(e) => setEventDate(e.target.value)}
                className="bg-gray-800 border-gray-700 text-white"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-gray-200">Date de fin</Label>
              <Input
                type="datetime-local"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="bg-gray-800 border-gray-700 text-white"
              />
            </div>
          </div>

          {/* Lieu */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label className="text-gray-200">Pays *</Label>
              <Input
                value={country}
                onChange={(e) => setCountry(e.target.value)}
                className="bg-gray-800 border-gray-700 text-white"
                placeholder="Sénégal"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-gray-200">Ville *</Label>
              <Input
                value={city}
                onChange={(e) => setCity(e.target.value)}
                className="bg-gray-800 border-gray-700 text-white"
                placeholder="Dakar"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-gray-200">Adresse</Label>
              <Input
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                className="bg-gray-800 border-gray-700 text-white"
                placeholder="Adresse complète..."
              />
            </div>
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-3 pt-4 border-t border-gray-800">
            <Button
              variant="outline"
              onClick={onClose}
              className="border-gray-700 text-gray-300 hover:text-white hover:bg-gray-800"
            >
              Annuler
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={loading}
              className="bg-yellow-600 hover:bg-yellow-700 text-white"
            >
              {loading ? (
                <Loader2 className="w-4 h-4 animate-spin mr-2" />
              ) : (
                <Save className="w-4 h-4 mr-2" />
              )}
              {loading ? "Enregistrement..." : "💾 Enregistrer"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

// ============================================================
// DIALOG POUR CHANGER L'IMAGE UNIQUEMENT
// ============================================================
// ============================================================
// DIALOG POUR CHANGER L'IMAGE - AVEC BUCKET 'media'
// ============================================================
const ChangeCoverImageDialog = ({ isOpen, onClose, event, onImageUpdated }) => {
  const [selectedFile, setSelectedFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [dragActive, setDragActive] = useState(false);

  const handleFileSelect = (file) => {
    if (file) {
      setSelectedFile(file);
      const reader = new FileReader();
      reader.onloadend = () => {
        setPreview(reader.result);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setDragActive(false);
    const file = e.dataTransfer.files[0];
    if (file && file.type.startsWith('image/')) {
      handleFileSelect(file);
    }
  };

  const handleUpload = async () => {
    if (!selectedFile || !event) return;
    
    setUploading(true);
    try {
      // 🔥 Utiliser le bucket 'media' qui existe
      const BUCKET_NAME = 'media';
      
      const fileExt = selectedFile.name.split('.').pop();
      const fileName = `event-${event.id}-${Date.now()}.${fileExt}`;
      const filePath = `event-covers/${fileName}`;
      
      console.log(`📤 Upload vers le bucket "${BUCKET_NAME}"...`);
      
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from(BUCKET_NAME)
        .upload(filePath, selectedFile, {
          cacheControl: '3600',
          upsert: true,
          contentType: selectedFile.type,
        });
      
      if (uploadError) {
        console.error("❌ Erreur upload:", uploadError);
        throw uploadError;
      }
      
      console.log("✅ Upload réussi:", uploadData);
      
      // Récupérer l'URL publique
      const { data: urlData } = supabase.storage
        .from(BUCKET_NAME)
        .getPublicUrl(filePath);
      
      const imageUrl = urlData.publicUrl;
      console.log("📸 URL publique:", imageUrl);
      
      // Mettre à jour l'événement
      const { error: updateError } = await supabase
        .from('events')
        .update({ 
          cover_image: imageUrl,
          updated_at: new Date().toISOString()
        })
        .eq('id', event.id);
      
      if (updateError) throw updateError;
      
      toast({
        title: "✅ Image mise à jour !",
        description: "L'image de couverture a été changée avec succès.",
        className: "bg-green-600 text-white",
      });
      
      if (onImageUpdated) onImageUpdated(imageUrl);
      onClose();
      
    } catch (error) {
      console.error("❌ Erreur détaillée:", error);
      toast({
        title: "❌ Erreur",
        description: error.message || "Impossible de changer l'image.",
        variant: "destructive",
      });
    } finally {
      setUploading(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="bg-gray-900 border-gray-800 text-white sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-white flex items-center gap-2">
            <ImageIcon className="w-5 h-5 text-primary-400" />
            Changer l'image de couverture
          </DialogTitle>
          <DialogDescription className="text-gray-400">
            Sélectionnez une nouvelle image pour votre événement.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div
            className={`relative border-2 border-dashed rounded-lg p-8 text-center transition-all ${
              dragActive 
                ? 'border-primary-500 bg-primary-900/20' 
                : preview 
                  ? 'border-green-500 bg-green-900/10' 
                  : 'border-gray-700 hover:border-gray-500'
            }`}
            onDragOver={(e) => { e.preventDefault(); setDragActive(true); }}
            onDragLeave={() => setDragActive(false)}
            onDrop={handleDrop}
          >
            {preview ? (
              <div className="space-y-4">
                <img 
                  src={preview} 
                  alt="Aperçu" 
                  className="max-h-48 mx-auto rounded-lg object-contain"
                />
                <p className="text-sm text-green-400">
                  ✅ Image sélectionnée : {selectedFile?.name}
                </p>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => { setSelectedFile(null); setPreview(null); }}
                  className="text-red-400 hover:text-red-300"
                >
                  <Trash2 className="w-4 h-4 mr-1" /> Supprimer
                </Button>
              </div>
            ) : (
              <div>
                <ImageIcon className="w-12 h-12 text-gray-600 mx-auto mb-3" />
                <p className="text-gray-400">
                  Glissez-déposez une image ici ou cliquez pour sélectionner
                </p>
                <p className="text-xs text-gray-500 mt-2">
                  PNG, JPG, WEBP • Max 5MB
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-4"
                  onClick={() => document.getElementById('file-input').click()}
                >
                  Choisir un fichier
                </Button>
                <input
                  id="file-input"
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files[0];
                    if (file) handleFileSelect(file);
                  }}
                />
              </div>
            )}
          </div>

          {event?.cover_image && !preview && (
            <div className="bg-gray-800/50 p-3 rounded-lg">
              <p className="text-sm text-gray-400 mb-2">Image actuelle :</p>
              <img 
                src={event.cover_image} 
                alt="Image actuelle" 
                className="max-h-32 mx-auto rounded-lg object-contain"
              />
            </div>
          )}

          <div className="flex justify-end gap-3 pt-4 border-t border-gray-800">
            <Button
              variant="outline"
              onClick={onClose}
              className="border-gray-700 text-gray-300"
            >
              Annuler
            </Button>
            <Button
              onClick={handleUpload}
              disabled={!selectedFile || uploading}
              className="bg-primary-600 hover:bg-primary-700 text-white"
            >
              {uploading ? (
                <Loader2 className="w-4 h-4 animate-spin mr-2" />
              ) : (
                <Save className="w-4 h-4 mr-2" />
              )}
              {uploading ? "Upload..." : "Changer l'image"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

// ============================================================
// STATISTIQUES
// ============================================================

    // ============================================================
// STATISTIQUES DE VÉRIFICATION - CORRIGÉES (AVEC PAGINATION)
// ============================================================
const VerificationStatsDialog = ({ isOpen, onClose, eventId, organizerId }) => {
  const { t } = useTranslation("security");
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;
    return () => { isMountedRef.current = false; };
  }, []);

  useEffect(() => {
    if (isOpen && eventId && organizerId) {
      const fetchStats = async () => {
        if (!isMountedRef.current) return;
        setLoading(true);
        setError(null);
        try {
          const eventIdStr = String(eventId);
          
          // ============================================================
          // 🔥 RÉCUPÉRER TOUS LES TICKETS AVEC PAGINATION
          // ============================================================
          
          console.log('🔍 Récupération de TOUS les tickets pour l\'événement:', eventIdStr);
          
          let allTicketsData = [];
          let page = 0;
          const pageSize = 1000;
          let hasMore = true;
          
          while (hasMore) {
            const from = page * pageSize;
            const to = from + pageSize - 1;
            
            console.log(`📄 Chargement page ${page + 1} (${from} à ${to})...`);
            
            const { data, error } = await supabase
              .from('tickets')
              .select('id, user_id, purchase_price_pi, payment_method, status, ticket_date, is_multi_day, entry_count, ticket_type_id')
              .eq('event_id', eventIdStr)
              .range(from, to);
            
            if (error) {
              console.error('❌ Erreur chargement tickets:', error);
              throw error;
            }
            
            if (data && data.length > 0) {
              allTicketsData = allTicketsData.concat(data);
              page++;
              hasMore = data.length === pageSize;
            } else {
              hasMore = false;
            }
          }
          
          console.log(`📊 Total tickets récupérés: ${allTicketsData?.length || 0}`);
          
          // ============================================================
          // 🔥 RÉCUPÉRER LES TYPES DE BILLETS
          // ============================================================
          
          const { data: ticketTypes, error: ticketTypesError } = await supabase
            .from('ticket_types')
            .select('id, name, quantity_available')
            .eq('event_id', eventIdStr);
          
          if (ticketTypesError) {
            console.error('❌ Erreur récupération ticket_types:', ticketTypesError);
            throw ticketTypesError;
          }
          
          console.log(`📋 ${ticketTypes?.length || 0} types de billets chargés`);
          
          // Créer un map pour accéder facilement aux types
          const typeMap = {};
          ticketTypes?.forEach(tt => {
            typeMap[tt.id] = tt;
          });
          
          // ============================================================
          // 🔥 ANALYSE PAR JOUR
          // ============================================================
          
          const extractDateFromName = (name) => {
            if (!name) return null;
            const dateMatch = name.match(/(\d{4}-\d{2}-\d{2})/);
            return dateMatch ? dateMatch[1] : null;
          };
          
          // Créer un map des dates par ticket_type_id
          const dateByTypeId = {};
          ticketTypes?.forEach(tt => {
            const date = extractDateFromName(tt.name);
            if (date) {
              dateByTypeId[tt.id] = date;
              console.log(`✅ ${tt.name} → ${date}`);
            }
          });
          
          // ============================================================
          // 🔥 RÉPARTITION PAR JOUR - TOUS LES TICKETS
          // ============================================================
          
          const ticketsByDate = {};
          const ticketsByDateStatus = {};
          
          allTicketsData?.forEach(t => {
            // Essayer d'obtenir la date depuis ticket_date ou depuis le type
            let dateKey = t.ticket_date;
            
            if (!dateKey) {
              const typeInfo = typeMap[t.ticket_type_id];
              if (typeInfo) {
                dateKey = extractDateFromName(typeInfo.name);
              }
            }
            
            if (dateKey) {
              try {
                const formattedDate = new Date(dateKey).toLocaleDateString('fr-FR', {
                  weekday: 'long',
                  day: 'numeric',
                  month: 'long'
                });
                
                // Comptage total par jour
                if (!ticketsByDate[formattedDate]) {
                  ticketsByDate[formattedDate] = 0;
                }
                ticketsByDate[formattedDate]++;
                
                // Comptage par statut par jour
                if (!ticketsByDateStatus[formattedDate]) {
                  ticketsByDateStatus[formattedDate] = { 
                    total: 0, 
                    active: 0, 
                    used: 0, 
                    exited: 0,
                    sold: 0,
                    available: 0
                  };
                }
                ticketsByDateStatus[formattedDate].total++;
                
                if (t.status === 'active') {
                  ticketsByDateStatus[formattedDate].active++;
                  if (t.user_id === null || t.user_id === '') {
                    ticketsByDateStatus[formattedDate].available++;
                  } else {
                    ticketsByDateStatus[formattedDate].sold++;
                  }
                } else if (t.status === 'used' || t.status === 'exited') {
                  ticketsByDateStatus[formattedDate].used++;
                  ticketsByDateStatus[formattedDate].sold++;
                }
              } catch (e) {
                console.warn(`⚠️ Erreur formatage date: ${dateKey}`, e);
              }
            }
          });
          
          console.log('📊 Répartition par jour:', ticketsByDate);
          console.log('📊 Détails par jour:', ticketsByDateStatus);
          
          // ============================================================
          // 🔥 STATISTIQUES GLOBALES
          // ============================================================
          
          const totalTicketsCreated = allTicketsData?.length || 0;
          
          // Tickets avec user_id (vendus)
          const ticketsWithUser = allTicketsData?.filter(t => t.user_id !== null && t.user_id !== '') || [];
          const totalSold = ticketsWithUser.length;
          
          // Tickets sans user_id (non vendus)
          const ticketsWithoutUser = allTicketsData?.filter(t => t.user_id === null || t.user_id === '') || [];
          const ticketsNotSold = ticketsWithoutUser.length;
          
          // Tickets disponibles
          const availableTickets = ticketsWithoutUser.filter(t => t.status === 'active').length;
          
          // Tickets MoneyFusion
          const moneyTickets = ticketsWithUser.filter(t => t.payment_method === 'moneyfusion_ticket').length;
          
          // Tickets Coins
          const coinsTickets = ticketsWithUser.filter(t => t.payment_method === 'coins').length;
          
          // Tickets entrés
          const currentlyInside = ticketsWithUser.filter(t => t.status === 'used').length;
          
          // Tickets sortis
          const exitedTickets = ticketsWithUser.filter(t => t.status === 'exited').length;
          
          // Tickets validés
          const verifiedTickets = currentlyInside + exitedTickets;
          
          // Tickets actifs
          const activeTickets = ticketsWithUser.filter(t => t.status === 'active').length;
          
          // Tickets sans compte
          const guestTickets = ticketsWithUser.filter(t => t.user_id && t.user_id.toString().startsWith('guest_')).length;
          
          // MoneyFusion sans compte
          const moneyGuestTickets = ticketsWithUser.filter(t => 
            t.payment_method === 'moneyfusion_ticket' && 
            t.user_id && t.user_id.toString().startsWith('guest_')
          ).length;
          
          const moneyAccountTickets = moneyTickets - moneyGuestTickets;
          
          // Total des entrées
          const totalEntries = ticketsWithUser.filter(t => t.entry_count > 0).length;
          
          // Moyenne des entrées
          const totalEntryCounts = ticketsWithUser.reduce((sum, t) => sum + (t.entry_count || 0), 0);
          const avgEntriesPerTicket = verifiedTickets > 0 ? (totalEntryCounts / verifiedTickets) : 0;
          
          // Multi-jours
          const multiDayTickets = ticketsWithUser.filter(t => t.is_multi_day === true).length;
          
          // Journaliers
          const dailyTickets = ticketsWithUser.filter(t => t.is_multi_day === false && t.ticket_date !== null).length;
          
          // Sans date
          const ticketsWithoutDate = ticketsWithUser.filter(t => t.is_multi_day === false && t.ticket_date === null).length;
          
          // ============================================================
          // 🔥 CALCUL FINAL
          // ============================================================
          
          const verificationRate = totalSold > 0 ? (verifiedTickets / totalSold) * 100 : 0;
          
          // Formater les données par jour pour l'affichage
          const ticketsByDateDisplay = {};
          Object.entries(ticketsByDateStatus).forEach(([date, data]) => {
            ticketsByDateDisplay[date] = {
              total: data.total || 0,
              active: data.active || 0,
              used: data.used || 0,
              exited: data.exited || 0,
              sold: data.sold || 0,
              available: data.available || 0
            };
          });
          
          console.log('📊 RÉSULTAT FINAL:');
          console.log(`  - Total créés: ${totalTicketsCreated}`);
          console.log(`  - Total VENDUS: ${totalSold}`);
          console.log(`  - Non vendus: ${ticketsNotSold}`);
          console.log(`  - Disponibles: ${availableTickets}`);
          console.log(`  - En attente: ${activeTickets}`);
          console.log(`  - Validés: ${verifiedTickets}`);
          console.log(`  - Taux présence: ${verificationRate}%`);
          console.log(`  - Répartition par jour:`, ticketsByDate);
          
          if (isMountedRef.current) {
            setStats({
              total_tickets_created: totalTicketsCreated,
              total_sold: totalSold,
              tickets_not_sold: ticketsNotSold,
              available_tickets: availableTickets,
              coins_tickets: coinsTickets,
              money_tickets: moneyTickets,
              money_guest_tickets: moneyGuestTickets,
              money_account_tickets: moneyAccountTickets,
              currently_inside: currentlyInside,
              exited_tickets: exitedTickets,
              verified_tickets: verifiedTickets,
              active_tickets: activeTickets,
              guest_tickets: guestTickets,
              total_entries: totalEntries,
              avg_entries_per_ticket: Math.round(avgEntriesPerTicket * 100) / 100,
              verification_rate: Math.round(verificationRate * 100) / 100,
              multi_day_tickets: multiDayTickets,
              daily_tickets: dailyTickets,
              tickets_without_date: ticketsWithoutDate,
              tickets_by_date: ticketsByDateDisplay,
              tickets_by_date_total: ticketsByDate
            });
          }
          
        } catch (err) {
          console.error("❌ Erreur stats:", err);
          if (isMountedRef.current) {
            setError(err.message);
          }
        } finally {
          if (isMountedRef.current) {
            setLoading(false);
          }
        }
      };

      fetchStats();
      const interval = setInterval(fetchStats, 30000);
      return () => clearInterval(interval);
    }
  }, [isOpen, eventId, organizerId]);

  const daysWithTickets = Object.keys(stats?.tickets_by_date || {}).length;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md bg-black border-gray-800 text-white max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-white">
            <BarChart className="w-5 h-5 text-blue-400" /> Statistiques de vérification
          </DialogTitle>
          <DialogDescription className="text-gray-400">
            État des entrées en temps réel
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex justify-center p-8">
            <Loader2 className="animate-spin text-blue-400" />
          </div>
        ) : error ? (
          <div className="text-center p-8">
            <AlertTriangle className="w-12 h-12 text-red-400 mx-auto mb-3" />
            <p className="text-red-400 text-sm">{error}</p>
          </div>
        ) : stats ? (
          <div className="space-y-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-gray-900 p-4 rounded-lg text-center border border-gray-800">
                <p className="text-xs text-gray-400 uppercase font-bold">Billets vendus</p>
                <p className="text-2xl font-bold text-white">{stats.total_sold}</p>
                <div className="flex justify-center gap-2 mt-1 text-[10px] flex-wrap">
                  {stats.coins_tickets > 0 && (
                    <span className="text-green-400">🪙 {stats.coins_tickets}</span>
                  )}
                  {stats.money_tickets > 0 && (
                    <span className="text-blue-400">💳 {stats.money_tickets}</span>
                  )}
                </div>
                {stats.multi_day_tickets > 0 && (
                  <div className="text-[8px] text-purple-400 mt-1">
                    📅 {stats.multi_day_tickets} multi-jours
                  </div>
                )}
                {stats.daily_tickets > 0 && (
                  <div className="text-[8px] text-blue-400">
                    📅 {stats.daily_tickets} journaliers
                  </div>
                )}
                {stats.total_tickets_created > stats.total_sold && (
                  <div className="text-[8px] text-gray-500 mt-1">
                    ({stats.total_tickets_created} billets créés au total)
                  </div>
                )}
                {stats.tickets_not_sold > 0 && (
                  <div className="text-[8px] text-orange-400 mt-0.5">
                    ⚠️ {stats.tickets_not_sold} non vendus
                  </div>
                )}
                {stats.available_tickets > 0 && (
                  <div className="text-[8px] text-green-400 mt-0.5">
                    ✅ {stats.available_tickets} disponibles
                  </div>
                )}
              </div>
              <div className="bg-blue-900/20 p-4 rounded-lg text-center border border-blue-800/50">
                <p className="text-xs text-blue-400 uppercase font-bold">Validés / Entrés</p>
                <p className="text-2xl font-bold text-blue-400">{stats.verified_tickets}</p>
                <div className="text-[10px] text-gray-400 mt-1">
                  {stats.total_entries > 0 && (
                    <span>{stats.total_entries} entrées totales</span>
                  )}
                </div>
                {stats.exited_tickets > 0 && (
                  <p className="text-[10px] text-blue-300 mt-1">🚪 {stats.exited_tickets} sortis</p>
                )}
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-gray-300">Taux de présence</span>
                <span className="font-bold text-white">{stats.verification_rate}%</span>
              </div>
              <div className="h-2 bg-gray-800 rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-blue-500 to-purple-500 transition-all duration-500"
                  style={{ width: `${stats.verification_rate}%` }}
                ></div>
              </div>
              <p className="text-[10px] text-gray-500 text-center">
                {stats.verified_tickets} entrés / {stats.total_sold} vendus
              </p>
            </div>

            {stats.money_tickets > 0 && (
              <div className="bg-blue-900/20 p-3 rounded-lg border border-blue-800/30">
                <div className="flex items-center gap-2">
                  <Wallet className="w-4 h-4 text-blue-400" />
                  <span className="text-sm font-medium text-blue-400">💳 Tickets MoneyFusion</span>
                  <Badge className="ml-auto bg-blue-600 text-white text-[10px]">
                    {stats.money_tickets}
                  </Badge>
                </div>
                <div className="mt-1 text-[10px] text-gray-400 flex gap-3">
                  <span>Avec compte: {stats.money_account_tickets}</span>
                  <span>Sans compte: {stats.money_guest_tickets}</span>
                </div>
              </div>
            )}

            <div className="bg-orange-900/20 p-3 rounded-lg border border-orange-800/30">
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-orange-400" />
                <span className="text-sm font-medium text-orange-400">En attente d'entrée</span>
                <Badge className="ml-auto bg-orange-600 text-white text-[10px]">
                  {stats.active_tickets}
                </Badge>
              </div>
              {stats.total_sold > 0 && (
                <div className="text-[8px] text-gray-500 mt-1">
                  {Math.round((stats.active_tickets / stats.total_sold) * 100)}% des vendus
                </div>
              )}
            </div>

            {stats.guest_tickets > 0 && (
              <div className="bg-yellow-900/20 p-3 rounded-lg border border-yellow-800/30">
                <div className="flex items-center gap-2">
                  <User className="w-4 h-4 text-yellow-400" />
                  <span className="text-sm font-medium text-yellow-400">Sans compte</span>
                  <Badge className="ml-auto bg-yellow-600 text-white text-[10px]">
                    {stats.guest_tickets}
                  </Badge>
                </div>
              </div>
            )}

            {daysWithTickets > 0 && (
              <div className="bg-green-900/20 p-3 rounded-lg border border-green-800/30">
                <div className="flex items-center gap-2 mb-2">
                  <CalendarIcon className="w-4 h-4 text-green-400" />
                  <span className="text-sm font-medium text-green-400">Répartition par jour</span>
                  <Badge className="ml-auto bg-green-600 text-white text-[10px]">
                    {daysWithTickets} jours
                  </Badge>
                </div>
                <div className="space-y-1 max-h-32 overflow-y-auto">
                  {Object.entries(stats.tickets_by_date || {}).map(([date, data]) => {
                    const total = data.total || 0;
                    const sold = data.sold || 0;
                    const available = data.available || 0;
                    const used = (data.used || 0) + (data.exited || 0);
                    const rate = total > 0 ? Math.round((used / total) * 100) : 0;
                    
                    return (
                      <div key={date} className="flex flex-col gap-0.5">
                        <div className="flex justify-between items-center text-[10px]">
                          <span className="text-gray-300 truncate">{date}</span>
                          <div className="flex items-center gap-2">
                            <span className="text-gray-400">{total} tickets</span>
                            <span className={`font-medium ${rate >= 80 ? 'text-green-400' : rate >= 50 ? 'text-yellow-400' : 'text-red-400'}`}>
                              {rate}%
                            </span>
                          </div>
                        </div>
                        <div className="w-full h-1.5 bg-gray-800 rounded-full overflow-hidden">
                          <div 
                            className={`h-full rounded-full transition-all ${rate >= 80 ? 'bg-green-500' : rate >= 50 ? 'bg-yellow-500' : 'bg-red-500'}`}
                            style={{ width: `${rate}%` }}
                          />
                        </div>
                        <div className="flex justify-between text-[8px] text-gray-500">
                          <span className="text-green-400">✅ Disponibles: {available}</span>
                          <span className="text-blue-400">💰 Vendus: {sold}</span>
                          <span className="text-gray-500">📊 Total: {total}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        ) : (
          <p className="text-center text-gray-500">Aucune donnée disponible</p>
        )}
      </DialogContent>
    </Dialog>
  );
};

// ============================================================
// BOUTONS D'ACTION STYLE TIKTOK
// ============================================================
const TikTokActionButtons = ({ event, onRefresh, user, isOwner, canManage, onEditClick }) => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [likes, setLikes] = useState(event?.likes_count || 0);
  const [comments, setComments] = useState(event?.comments_count || 0);
  const [isLiked, setIsLiked] = useState(false);
  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;
    return () => { isMountedRef.current = false; };
  }, []);

  useEffect(() => {
    if (event) {
      setLikes(event.likes_count || 0);
      setComments(event.comments_count || 0);
    }
  }, [event]);

  const handleLike = async () => {
    if (!user) {
      toast({
        title: t("eventDetail.toast.loginRequired"),
        description: t("eventDetail.toast.loginRequiredDesc"),
        variant: "destructive",
      });
      return;
    }
    try {
      const newLikedState = !isLiked;
      const likeChange = newLikedState ? 1 : -1;
      if (isMountedRef.current) {
        setLikes((prev) => prev + likeChange);
        setIsLiked(newLikedState);
      }

      await supabase.rpc("toggle_event_like", {
        p_event_id: event.id,
        p_user_id: user.id,
      });

      if (onRefresh) onRefresh();
    } catch (error) {
      console.error("Error toggling like:", error);
      if (isMountedRef.current) {
        setLikes((prev) => prev - (isLiked ? 1 : -1));
        setIsLiked(!isLiked);
      }
    }
  };

  const handleShare = async () => {
    if (!event) return;
    const shareData = {
      title: event.title,
      text: event.description
        ? event.description.substring(0, 100) + "..."
        : `Découvrez ${event.title}`,
      url: window.location.href,
    };
    try {
      if (navigator.share) {
        await navigator.share(shareData);
      } else {
        await navigator.clipboard.writeText(window.location.href);
        toast({
          title: t("common.copyLink"),
          description: t("eventDetail.toast.copySuccess"),
        });
      }
    } catch (err) {
      console.log("Error sharing:", err);
    }
  };

  return (
    <div className="absolute right-4 bottom-4 flex flex-col items-center gap-4 z-30">
      <div className="flex flex-col items-center gap-1">
        <div className="w-10 h-10 rounded-full bg-black/60 backdrop-blur-sm flex items-center justify-center border border-white/20">
          <Eye className="w-4 h-4 text-white" />
        </div>
        <span className="text-white font-bold text-xs drop-shadow-md">
          {event?.views_count || 0}
        </span>
      </div>
      <div className="flex flex-col items-center gap-1">
        <div className="w-10 h-10 flex items-center justify-center">
          <BookmarkButton
            eventId={event?.id}
            variant="ghost"
            className="w-10 h-10 rounded-full bg-black/60 backdrop-blur-sm hover:bg-black/80 border border-white/20 hover:border-white/40 text-white p-0"
          />
        </div>
        <span className="text-white font-bold text-xs drop-shadow-md">
          {t("eventDetail.favorites")}
        </span>
      </div>
      <div className="flex flex-col items-center gap-1">
        <Button
          onClick={() =>
            document
              .getElementById("comments-section")
              ?.scrollIntoView({ behavior: "smooth" })
          }
          variant="ghost"
          size="icon"
          className="w-10 h-10 rounded-full bg-black/60 backdrop-blur-sm hover:bg-black/80 border border-white/20 hover:border-white/40"
        >
          <MessageCircle className="w-5 h-5 text-white" />
        </Button>
        <span className="text-white font-bold text-xs drop-shadow-md">
          {comments}
        </span>
      </div>
      <div className="flex flex-col items-center gap-1">
        <Button
          onClick={handleShare}
          variant="ghost"
          size="icon"
          className="w-10 h-10 rounded-full bg-black/60 backdrop-blur-sm hover:bg-black/80 border border-white/20 hover:border-white/40"
        >
          <Share2 className="w-5 h-5 text-white" />
        </Button>
        <span className="text-white font-bold text-xs drop-shadow-md">
          {t("common.share")}
        </span>
      </div>
      {(isOwner || canManage) && (
        <div className="flex flex-col items-center gap-1">
          <Button
            onClick={onEditClick}
            variant="ghost"
            size="icon"
            className="w-10 h-10 rounded-full bg-yellow-600/40 backdrop-blur-sm hover:bg-yellow-600/60 border border-yellow-500/50 hover:border-yellow-400"
          >
            <Edit className="w-5 h-5 text-yellow-300" />
          </Button>
          <span className="text-yellow-400 font-bold text-xs drop-shadow-md">
            Modifier
          </span>
        </div>
      )}
    </div>
  );
};

// ============================================================
// DESCRIPTION EXTENSIBLE
// ============================================================
const ExpandableDescription = ({ description }) => {
  const { t } = useTranslation();
  const [isExpanded, setIsExpanded] = useState(false);
  const maxLength = 300;

  if (!description) return null;

  const shouldTruncate = description.length > maxLength;
  const content = isExpanded ? description : description.slice(0, maxLength);

  return (
    <div className="prose prose-invert max-w-none">
      <p className="whitespace-pre-line leading-relaxed text-gray-300">
        {content}
        {!isExpanded && shouldTruncate && "..."}
      </p>
      {shouldTruncate && (
        <Button
          variant="ghost"
          onClick={() => setIsExpanded(!isExpanded)}
          className="mt-2 p-0 h-auto font-semibold text-blue-400 hover:text-blue-300 hover:bg-transparent flex items-center"
        >
          {isExpanded ? (
            <>
              {t("eventDetail.seeLess")} <ChevronUp className="ml-1 w-4 h-4" />
            </>
          ) : (
            <>
              {t("eventDetail.seeMore")}{" "}
              <ChevronDown className="ml-1 w-4 h-4" />
            </>
          )}
        </Button>
      )}
    </div>
  );
};

// ============================================================
// AFFICHAGE DES DATES
// ============================================================
const DateDisplay = ({ event }) => {
  const { t } = useTranslation();
  const formatDate = (dateString) => {
    if (!dateString) return t("eventDetail.dateNotSpecified");
    const date = new Date(dateString);
    return date.toLocaleDateString("fr-FR", {
      weekday: "long",
      day: "numeric",
      month: "long",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  if (!event.event_start_at) return null;

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2 text-gray-300">
        <CalendarDays className="w-4 h-4 text-[#C9A227]" />
        <span className="font-medium">{formatDate(event.event_start_at)}</span>
      </div>
      {event.event_end_at && (
        <div className="flex items-center gap-2 text-gray-400 text-sm ml-6">
          <CalendarRange className="w-3 h-3 text-[#C9A227]" />
          <span>
            {t("eventDetail.until")} {formatDate(event.event_end_at)}
          </span>
        </div>
      )}
    </div>
  );
};

// ============================================================
// COMPOSANT PRINCIPAL EventDetailPage
// ============================================================
const EventDetailPage = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { userProfile, forceRefreshUserProfile } = useData();
  const { user } = useAuth();
  const { t } = useTranslation(["translation", "security"]);

  const [event, setEvent] = useState(null);
  const [eventData, setEventData] = useState(null);
  const [ticketTypes, setTicketTypes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [togglingSales, setTogglingSales] = useState(false);
  const [showStatsModal, setShowStatsModal] = useState(false);
  const [showScannerModal, setShowScannerModal] = useState(false);
  const [showChangeImageDialog, setShowChangeImageDialog] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [standStats, setStandStats] = useState({
    total_rented: 0,
    gross_revenue: 0,
    organizer_net: 0,
    platform_fee: 0,
    loading: false,
  });

  const [promoConfig, setPromoConfig] = useState(null);
  const [promoConfigLoading, setPromoConfigLoading] = useState(false);
  const [phoneVoteLimit, setPhoneVoteLimit] = useState(0);
  const [savingPhoneVoteLimit, setSavingPhoneVoteLimit] = useState(false);
  const [candidates, setCandidates] = useState([]);
  const [candidatesLoading, setCandidatesLoading] = useState(false);
  const [uploadingCandidateId, setUploadingCandidateId] = useState(null);

  const userId = user?.id;
  const isMountedRef = useRef(true);
  const fetchInProgressRef = useRef(false);
  const refreshTimeoutRef = useRef(null);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      if (refreshTimeoutRef.current) {
        clearTimeout(refreshTimeoutRef.current);
      }
    };
  }, []);

  const fetchPromoConfig = useCallback(async () => {
    if (!event?.id) return;
    setPromoConfigLoading(true);
    try {
      const { data, error } = await supabase
        .from("event_promo_config")
        .select("*")
        .eq("event_id", event.id)
        .maybeSingle();

      if (error) {
        console.error("Error fetching promo config:", error);
        if (isMountedRef.current) {
          setPromoConfig({ enabled: false });
        }
      } else {
        if (isMountedRef.current) {
          setPromoConfig(data || { enabled: false });
        }
      }
    } catch (error) {
      console.error("Error fetching promo config:", error);
      if (isMountedRef.current) {
        setPromoConfig({ enabled: false });
      }
    } finally {
      if (isMountedRef.current) {
        setPromoConfigLoading(false);
      }
    }
  }, [event?.id]);

  const fetchEventData = useCallback(async () => {
    if (!id || fetchInProgressRef.current) return;

    fetchInProgressRef.current = true;
    if (isMountedRef.current) {
      setLoading(true);
    }

    console.log("Fetching event data for ID:", id);
    try {
      let fetchedEvent = null;

      try {
        const rows = await dbService.getEventById(id);
        fetchedEvent = rows.length > 0 ? rows[0] : null;
      } catch (dbErr) {
        console.warn("dbService indisponible, fallback Supabase :", dbErr.message);
      }

      if (!fetchedEvent) {
        const { data: fbEvent, error: eventError } = await fetchWithRetry(
          () =>
            supabase
              .from("events")
              .select(
                "*, organizer:organizer_id(full_name), category:category_id(name, slug)",
              )
              .eq("id", id)
              .maybeSingle(),
        );

        if (eventError) throw eventError;
        fetchedEvent = fbEvent;
      }

      if (!fetchedEvent) {
        console.error("Event not found");
        if (isMountedRef.current) {
          setEvent(null);
        }
        return;
      }

      if (isMountedRef.current) {
        setEvent(fetchedEvent);
      }

      let specificEventData = null;
      if (fetchedEvent.event_type === "raffle") {
        const { data } = await supabase
          .from("raffle_events")
          .select("*")
          .eq("event_id", id)
          .maybeSingle();
        specificEventData = data;
      } else if (fetchedEvent.event_type === "stand_rental") {
        const { data } = await supabase
          .from("stand_events")
          .select("*")
          .eq("event_id", id)
          .maybeSingle();
        specificEventData = data;
      } else if (fetchedEvent.event_type === "ticketing") {
        const { data: ticketingDetails } = await supabase
          .from("ticketing_events")
          .select("*")
          .eq("event_id", id)
          .maybeSingle();
        specificEventData = ticketingDetails;
        
        const { data: types } = await supabase
          .from("ticket_types")
          .select("*")
          .eq("event_id", id);
        
        if (isMountedRef.current) {
          setTicketTypes(types || []);
          console.log(`📋 ${types?.length || 0} types de billets chargés`);
        }
      }
      if (isMountedRef.current) {
        setEventData(specificEventData);
      }
    } catch (error) {
      console.error("Error fetching event:", error);
      if (isMountedRef.current) {
        toast({
          title: t("common.error"),
          description: t("eventDetail.toast.loadError"),
          variant: "destructive",
        });
        setEvent(null);
      }
    } finally {
      if (isMountedRef.current) {
        setLoading(false);
      }
      fetchInProgressRef.current = false;
    }
  }, [id, t]);

  const handleDataRefresh = useCallback(() => {
    if (refreshTimeoutRef.current) {
      clearTimeout(refreshTimeoutRef.current);
    }

    refreshTimeoutRef.current = setTimeout(() => {
      console.log('🔄 Refresh exécuté');
      fetchEventData();
      if (forceRefreshUserProfile) forceRefreshUserProfile();
      refreshTimeoutRef.current = null;
    }, 100);
  }, [fetchEventData, forceRefreshUserProfile]);

  useEffect(() => {
    fetchEventData();
  }, [fetchEventData]);

  useEffect(() => {
    if (event) {
      fetchPromoConfig();
    }
  }, [event, fetchPromoConfig]);

  useEffect(() => {
    if (!id || !event || !event.id) return;

    let trackTimeout = null;

    const trackView = async () => {
      try {
        const { data, error } = await supabase.rpc("track_event_view", {
          p_event_id: id,
          p_user_id: userId || null,
        });
        if (error) {
          console.error("Error tracking view:", error);
          return;
        }
        if (data && data.new_views_count !== undefined && isMountedRef.current) {
          setEvent((prev) =>
            prev ? { ...prev, views_count: data.new_views_count } : prev,
          );
        }
      } catch (error) {
        console.error("Exception while tracking view:", error);
      }
    };

    trackTimeout = setTimeout(trackView, 1000);
    return () => {
      if (trackTimeout) {
        clearTimeout(trackTimeout);
      }
    };
  }, [id, event, userId]);

  const isOwner = user && event?.organizer_id === user.id;
  const isInfluencer = user && event?.organizer_id !== user.id;
  const canManageEvent =
    isOwner ||
    (userProfile &&
      ["super_admin", "admin", "secretary"].includes(userProfile.user_type));

  useEffect(() => {
    if (canManageEvent && event?.event_type === "stand_rental") {
      const fetchStandStats = async () => {
        if (!isMountedRef.current) return;
        setStandStats((prev) => ({ ...prev, loading: true }));
        try {
          const { count } = await supabase
            .from("stand_rentals")
            .select("*", { count: "exact", head: true })
            .in(
              "stand_event_id",
              (
                await supabase
                  .from("stand_events")
                  .select("id")
                  .eq("event_id", event.id)
              ).data.map((e) => e.id),
            )
            .eq("status", "confirmed");

          const { data: earnings } = await supabase
            .from("organizer_earnings")
            .select("earnings_coins, platform_commission, amount_pi")
            .eq("event_id", event.id)
            .eq("transaction_type", "stand_rental");

          const gross =
            earnings?.reduce((acc, curr) => acc + (curr.amount_pi || 0), 0) ||
            0;
          const net =
            earnings?.reduce(
              (acc, curr) => acc + (curr.earnings_coins || 0),
              0,
            ) || 0;
          const fee =
            earnings?.reduce(
              (acc, curr) => acc + (curr.platform_commission || 0),
              0,
            ) || 0;

          if (isMountedRef.current) {
            setStandStats({
              total_rented: count || 0,
              gross_revenue: gross,
              organizer_net: net,
              platform_fee: fee,
              loading: false,
            });
          }
        } catch (err) {
          console.error("Failed to fetch stand stats", err);
          if (isMountedRef.current) {
            setStandStats((prev) => ({ ...prev, loading: false }));
          }
        }
      };
      fetchStandStats();
    }
  }, [canManageEvent, event]);

  // 📵 Chargement du réglage "limite de voix par téléphone" (organisateur)
  useEffect(() => {
    if (!canManageEvent || event?.event_type !== "voting" || !event?.id) return;
    let mounted = true;
    const loadVoteLimit = async () => {
      try {
        const { data, error } = await supabase
          .from("event_settings")
          .select("max_votes_per_phone, max_votes_per_user")
          .eq("event_id", event.id)
          .maybeSingle();
        if (error) {
          console.warn("Lecture voix par personne indisponible:", error.message);
          return;
        }
        if (mounted) {
          setPhoneVoteLimit(Number(data?.max_votes_per_phone) || Number(data?.max_votes_per_user) || 0);
        }
      } catch (e) {
        console.warn("Erreur lecture max_votes_per_phone:", e);
      }
    };
    loadVoteLimit();
    return () => {
      mounted = false;
    };
  }, [canManageEvent, event?.event_type, event?.id]);

  const handleSavePhoneVoteLimit = async () => {
    if (!event?.id) return;
    setSavingPhoneVoteLimit(true);
    try {
      const value = Math.max(0, parseInt(phoneVoteLimit, 10) || 0);
      const { data: existing } = await supabase
        .from("event_settings")
        .select("id")
        .eq("event_id", event.id)
        .maybeSingle();
      let error;
      if (existing) {
        ({ error } = await supabase
          .from("event_settings")
          .update({ max_votes_per_phone: value, max_votes_per_user: value })
          .eq("event_id", event.id));
      } else {
        ({ error } = await supabase
          .from("event_settings")
          .insert({
            event_id: event.id,
            voting_enabled: true,
            voting_type: Number(event.price_pi) === 0 ? "free" : "paid",
            max_votes_per_phone: value,
            max_votes_per_user: value,
          }));
      }
      if (error) throw error;
      setPhoneVoteLimit(value);
      toast({
        title: "✅ Limite enregistrée",
        description:
          value === 0
            ? `Votes illimités par téléphone et par appareil pour ce concours.`
            : `Chaque personne (téléphone ET appareil) pourra voter au maximum ${value} voix dans ce concours.`,
        className:
          "bg-gradient-to-r from-emerald-600 to-green-600 text-white",
      });
    } catch (e) {
      console.error("Erreur sauvegarde max_votes_per_phone:", e);
      toast({
        title: "❌ Erreur",
        description:
          e.message ||
          "Impossible d'enregistrer la limite. La migration SQL doit être exécutée.",
        variant: "destructive",
      });
    } finally {
      setSavingPhoneVoteLimit(false);
    }
  };

  // 💥 Chargement des candidats (pour la gestion des photos, visible aux
  // organisateurs + admin/super_admin/secretary)
  useEffect(() => {
    if (!canManageEvent || event?.event_type !== "voting" || !event?.id) return;
    let mounted = true;
    const loadCandidates = async () => {
      setCandidatesLoading(true);
      try {
        const { data, error } = await supabase
          .from("candidates")
          .select("*")
          .eq("event_id", event.id)
          .order("created_at", { ascending: true });
        if (error) throw error;
        if (mounted) setCandidates(data || []);
      } catch (e) {
        console.warn("Erreur chargement candidats:", e);
        if (mounted) setCandidates([]);
      } finally {
        if (mounted) setCandidatesLoading(false);
      }
    };
    loadCandidates();
    return () => {
      mounted = false;
    };
  }, [canManageEvent, event?.event_type, event?.id]);

  const handleFileSelectForCandidate = (candidateId) => {
    const input = document.getElementById(
      `candidate-photo-input-${candidateId}`,
    );
    if (input) input.click();
  };

  const handleCandidateFileChange = async (candidateId, file) => {
    if (!file || !event?.id) return;
    if (!file.type.startsWith("image/")) {
      toast({
        title: "❌ Fichier invalide",
        description: "Veuillez sélectionner une image.",
        variant: "destructive",
      });
      return;
    }
    setUploadingCandidateId(candidateId);
    try {
      const validation = validateImage(file);
      if (!validation.isValid) {
        toast({
          title: "❌ Image invalide",
          description: validation.message,
          variant: "destructive",
        });
        return;
      }
      const processedFile = await processImage(file, {
        maxSizeMB: 1,
        maxWidthOrHeight: 800,
        fileType: "image/jpeg",
      });
      const fileExt = "jpg";
      const fileName = `${Date.now()}-${uuidv4()}.${fileExt}`;
      const filePath = `voting/${event.organizer_id}/candidates/${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from("media")
        .upload(filePath, processedFile, {
          cacheControl: "3600",
          upsert: true,
          contentType: "image/jpeg",
        });
      if (uploadError) throw uploadError;

      const {
        data: { publicUrl },
      } = supabase.storage.from("media").getPublicUrl(filePath);

      const { error: updateError } = await supabase
        .from("candidates")
        .update({ photo_url: publicUrl, updated_at: new Date().toISOString() })
        .eq("id", candidateId);
      if (updateError) throw updateError;

      if (isMountedRef.current) {
        setCandidates((prev) =>
          prev.map((c) =>
            c.id === candidateId ? { ...c, photo_url: publicUrl } : c,
          ),
        );
      }
      toast({
        title: "✅ Photo mise à jour",
        description: "La photo du candidat a été remplacée avec succès.",
        className: "bg-green-600 text-white",
      });
    } catch (e) {
      console.error("Erreur upload photo candidat:", e);
      toast({
        title: "❌ Erreur",
        description: e.message || "Impossible de mettre à jour la photo.",
        variant: "destructive",
      });
    } finally {
      if (isMountedRef.current) setUploadingCandidateId(null);
    }
  };

  const handleDeleteEvent = async () => {
    if (!event) return;
    setIsDeleting(true);
    try {
      console.log("Tentative de suppression de l'événement:", event.id);

      if (event.cover_image) {
        const storageInfo = extractStoragePath(event.cover_image);
        if (storageInfo) {
          await supabase.storage
            .from(storageInfo.bucket)
            .remove([storageInfo.path])
            .catch((err) => console.warn("Erreur suppression image:", err));
        }
      }

      const { data, error } = await supabase.rpc("delete_event_completely", {
        p_event_id: event.id,
      });

      if (error) {
        console.error("RPC Error:", error);
        throw new Error(error.message);
      }

      console.log("Résultat de la suppression:", data);

      toast({
        title: "✅ Événement supprimé",
        description: data?.message || "L'événement a été supprimé avec succès",
        className: "bg-green-600 text-white",
      });

      navigate("/events", {
        state: {
          refresh: true,
          timestamp: Date.now(),
        },
      });
    } catch (error) {
      console.error("Delete error détaillé:", error);
      toast({
        title: "❌ Erreur",
        description: error.message || "Impossible de supprimer l'événement",
        variant: "destructive",
      });
    } finally {
      setIsDeleting(false);
      setDeleteDialogOpen(false);
    }
  };

  const handleToggleSales = async () => {
    if (!canManageEvent) return;
    setTogglingSales(true);
    const newStatus = !event.is_sales_closed;
    try {
      setEvent((prev) => ({ ...prev, is_sales_closed: newStatus }));
      const { error } = await supabase
        .from("events")
        .update({ is_sales_closed: newStatus })
        .eq("id", event.id);
      if (error) {
        setEvent((prev) => ({ ...prev, is_sales_closed: !newStatus }));
        throw error;
      }
      toast({
        title: newStatus
          ? t("eventDetail.toast.salesClosed")
          : t("eventDetail.toast.salesReopened"),
        description: newStatus
          ? t("eventDetail.toast.salesClosedDesc")
          : t("eventDetail.toast.salesReopenedDesc"),
        className: newStatus
          ? "bg-amber-600 text-white"
          : "bg-green-600 text-white",
      });
    } catch (err) {
      console.error("Error toggling sales", err);
      toast({
        title: t("common.error"),
        description: t("eventDetail.toast.salesToggleError"),
        variant: "destructive",
      });
    } finally {
      setTogglingSales(false);
    }
  };

  // Fonctions pour mettre à jour l'événement après modification
  const handleImageUpdated = (newImageUrl) => {
    setEvent(prev => ({ ...prev, cover_image: newImageUrl }));
  };

  const handleEventUpdated = (updatedData) => {
    setEvent(prev => ({ ...prev, ...updatedData }));
    // Rafraîchir les données
    fetchEventData();
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <Loader2 className="w-12 h-12 animate-spin text-blue-400" />
        <span className="sr-only">{t("eventDetail.loading")}</span>
      </div>
    );
  }
  if (!event) {
    return (
      <div className="min-h-screen bg-black text-center p-8">
        <h1 className="text-2xl text-red-400">{t("eventDetail.notFound")}</h1>
      </div>
    );
  }

  const optimizedImageUrl =
    event.cover_image ||
    "https://images.unsplash.com/photo-1509930854872-0f61005b282e";
  const canDelete = canManageEvent;

  const now = new Date();
  const eventStartDate = new Date(event.event_start_at);
  const eventEndDate = event.event_end_at ? new Date(event.event_end_at) : null;
  const closingDate =
    eventEndDate ||
    (() => {
      const c = new Date(eventStartDate);
      c.setHours(23, 59, 59, 999);
      return c;
    })();
  const isEventFinished = now > closingDate;
  const isEventStarted = now >= eventStartDate;
  const isEventOngoing = isEventStarted && !isEventFinished;
  const isPresale = now < eventStartDate && !isEventFinished;
  const isSalesClosed = isEventFinished || event.is_sales_closed === true;

  return (
    <div className="min-h-screen bg-black">
      <MultilingualSeoHead
        pageData={{
          title: event.title,
          description: event.description,
          ogImage: optimizedImageUrl,
          event: {
            ...event,
            ticket_types: ticketTypes,
          },
        }}
      />

      <style>{`
        @keyframes slide {
          0% { transform: translateX(0); }
          100% { transform: translateX(-50%); }
        }
        .sliding-image-container {
          animation: slide 30s linear infinite;
          width: 200%;
          height: 100%;
          display: flex;
          position: absolute;
          top: 0;
          left: 0;
          background-color: #111;
          align-items: center;
        }
        .sliding-image-container img {
          width: 50%;
          height: 100%;
          object-fit: cover;
        }
      `}</style>

      <main className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
          <Button
            variant="ghost"
            onClick={() => navigate(-1)}
            className="text-gray-300 hover:text-white hover:bg-gray-900"
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            {t("common.back")}
          </Button>
          <div className="flex gap-2">
            {canDelete && (
              <Button
                variant="destructive"
                size="sm"
                onClick={() => setDeleteDialogOpen(true)}
                className="bg-gradient-to-r from-red-600 to-rose-600 hover:from-red-700 hover:to-rose-700 border-0"
              >
                <Trash2 className="w-4 h-4 mr-2" />
                {t("common.delete")}
              </Button>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2 space-y-6">
            {/* IMAGE DE COUVERTURE */}
            <div className="relative rounded-xl overflow-hidden shadow-2xl bg-black">
              <div className="w-full h-[350px] sm:h-[400px] md:h-[500px] lg:h-[550px] xl:h-[600px] relative overflow-hidden">
                <div
                  className="absolute inset-0 h-full animate-slow-pan"
                  style={{
                    backgroundImage: `url(${optimizedImageUrl})`,
                    backgroundSize: 'auto 100%',
                    backgroundPosition: 'left center',
                    backgroundRepeat: 'no-repeat',
                    width: 'auto',
                    minWidth: '100%',
                    maxWidth: '200%'
                  }}
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/50 via-black/20 to-transparent pointer-events-none" />
              </div>
              <div className="absolute top-4 left-4 z-20">
                <Badge className="bg-black/60 backdrop-blur-sm text-white border-white/20 text-sm px-3 py-1.5">
                  {event.category?.name || event.event_type}
                </Badge>
              </div>
              <TikTokActionButtons
                event={event}
                onRefresh={handleDataRefresh}
                user={user}
                isOwner={isOwner}
                canManage={canManageEvent}
                onEditClick={() => setShowEditModal(true)}
              />
            </div>

            {/* NOM DE L'ÉVÉNEMENT */}
            <div className="px-1">
              <h1 className="text-2xl sm:text-3xl md:text-4xl lg:text-5xl font-black text-white leading-tight">
                {event.title}
              </h1>
              <div className="flex flex-wrap items-center gap-4 mt-2 text-gray-400 text-sm">
                <span className="flex items-center gap-1">
                  <Calendar className="w-4 h-4" />
                  {new Date(event.event_start_at).toLocaleDateString("fr-FR", {
                    day: "numeric",
                    month: "short",
                    year: "numeric",
                  })}
                </span>
                <span className="flex items-center gap-1">
                  <MapPin className="w-4 h-4" />
                  {event.city}, {event.country}
                </span>
              </div>
            </div>

            {event.event_start_at && (
              <div className="flex justify-center w-full py-2">
                <EventCountdown
                  eventDate={event.event_start_at}
                  eventEndDate={event.event_end_at}
                  showMotivation={true}
                  size="large"
                  className="w-full justify-center"
                />
              </div>
            )}

            <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
              <Card className="bg-gray-900/50 backdrop-blur-sm border-gray-800 shadow-xl">
                <CardContent className="p-6 md:p-8">
                  <div className="flex flex-wrap gap-4 mb-6 pb-6 border-b border-gray-800">
                    <div className="flex items-center gap-3 p-3 rounded-lg bg-black/40 border border-gray-800 shadow-sm flex-1 min-w-[200px]">
                      <div className="p-2 rounded-full bg-blue-900/30 text-blue-400">
                        <Calendar className="w-5 h-5" />
                      </div>
                      <div>
                        <p className="text-xs text-gray-400 font-medium">
                          {t("eventDetail.date")}
                        </p>
                        <DateDisplay event={event} />
                      </div>
                    </div>
                    <div className="flex items-center gap-3 p-3 rounded-lg bg-black/40 border border-gray-800 shadow-sm flex-1 min-w-[200px]">
                      <div className="p-2 rounded-full bg-blue-900/30 text-blue-400">
                        <MapPin className="w-5 h-5" />
                      </div>
                      <div>
                        <p className="text-xs text-gray-400 font-medium">
                          {t("eventDetail.location")}
                        </p>
                        <p className="font-semibold text-sm text-white">
                          {event.city}, {event.country}
                        </p>
                        {event.address && (
                          <p className="text-xs text-gray-400 mt-1">
                            {event.address}
                          </p>
                        )}
                      </div>
                    </div>
                  </div>

                  <h3 className="font-bold text-xl mb-3 text-white">
                    {t("eventDetail.about")}
                  </h3>
                  <ExpandableDescription description={event.description} />
                </CardContent>
              </Card>

              {isEventFinished && (
                <Alert className="bg-amber-950/50 border-amber-800/50 text-amber-300">
                  <Clock className="h-4 w-4" />
                  <AlertTitle className="text-amber-200">
                    {t("eventDetail.eventFinished")}
                  </AlertTitle>
                  <AlertDescription className="text-amber-400">
                    {t("eventDetail.eventFinishedDescription", {
                      date: new Date(
                        eventEndDate || eventStartDate,
                      ).toLocaleDateString("fr-FR"),
                    })}
                  </AlertDescription>
                </Alert>
              )}

              {!isEventFinished && event.is_sales_closed && (
                <Alert className="bg-red-950/50 border-red-800/50 text-red-300">
                  <Lock className="h-4 w-4" />
                  <AlertTitle className="text-red-200">
                    {t("eventDetail.salesClosed")}
                  </AlertTitle>
                  <AlertDescription className="text-red-400">
                    {t("eventDetail.salesClosedDescription")}
                  </AlertDescription>
                </Alert>
              )}

              {isPresale && !event.is_sales_closed && (
                <Alert className="bg-green-950/50 border-green-800/50 text-green-300">
                  <Calendar className="h-4 w-4" />
                  <AlertTitle className="text-green-200">
                    {t("eventDetail.presaleActive")}
                  </AlertTitle>
                  <AlertDescription className="text-green-400">
                    {t("eventDetail.presaleDescription", {
                      date: new Date(eventStartDate).toLocaleDateString("fr-FR"),
                    })}
                  </AlertDescription>
                </Alert>
              )}

              {isEventOngoing && !event.is_sales_closed && (
                <Alert className="bg-blue-950/50 border-blue-800/50 text-blue-300">
                  <PlayCircle className="h-4 w-4" />
                  <AlertTitle className="text-blue-200">
                    {t("eventDetail.eventOngoing")}
                  </AlertTitle>
                  <AlertDescription className="text-blue-400">
                    {t("eventDetail.eventOngoingDescription")}
                  </AlertDescription>
                </Alert>
              )}

              <CommunityVerification
                eventId={event.id}
                eventDate={event.event_start_at}
              />

              {event.event_type === "voting" && (
                <>
                  {isEventFinished && (
                    <Card className="bg-gradient-to-r from-amber-950/30 to-orange-950/30 border-amber-800/50 p-6 text-center mb-4">
                      <Trophy className="w-12 h-12 text-yellow-500 mx-auto mb-3" />
                      <h3 className="text-xl font-bold text-white mb-2">
                        🎉 Concours terminé ! 🎉
                      </h3>
                      <p className="text-gray-300">
                        Ce vote est maintenant clos. Vous pouvez consulter
                        ci-dessous le classement final et les résultats
                        détaillés.
                      </p>
                      <p className="text-amber-400 text-sm mt-2">
                        Merci à tous les participants pour votre engagement !
                      </p>
                    </Card>
                  )}

                  <VotingInterface
                    key={`voting-${event.id}-${isEventFinished}`}
                    event={event}
                    isUnlocked={true}
                    onRefresh={handleDataRefresh}
                    isClosed={isEventFinished || isSalesClosed}
                  />
                </>
              )}

              {event.event_type === "raffle" && (
                <RaffleInterface
                  raffleData={eventData}
                  eventId={event.id}
                  event={event}
                  isUnlocked={true}
                  onPurchaseSuccess={handleDataRefresh}
                  isClosed={isSalesClosed}
                />
              )}
              {event.event_type === "stand_rental" && (
                <StandRentalInterface
                  event={event}
                  isUnlocked={true}
                  onRefresh={handleDataRefresh}
                  isClosed={isSalesClosed}
                />
              )}
              {event.event_type === "ticketing" && (
                <div id="tickets-section" className="scroll-mt-20">
                  <TicketingInterface
                    event={event}
                    ticketingData={eventData}
                    ticketTypes={ticketTypes}
                    isUnlocked={true}
                    onRefresh={handleDataRefresh}
                    isClosed={isSalesClosed}
                  />
                </div>
              )}

              {promoConfig?.enabled && isInfluencer && !isEventFinished && (
                <div className="mt-8">
                  <PromoCodeGenerator
                    eventId={event.id}
                    eventTitle={event.title}
                    onCodeGenerated={(code) => {
                      console.log("Code genere:", code);
                      toast({
                        title: "Code genere !",
                        description: `Votre code ${code} est pret a etre partage`,
                        className: "bg-green-600 text-white",
                      });
                    }}
                  />
                </div>
              )}

              <div id="comments-section" className="scroll-mt-20">
                <Card className="bg-gray-900/50 border-gray-800">
                  <CardContent className="p-6">
                    <h2 className="text-2xl font-bold mb-4 text-white">
                      {t("eventDetail.comments")}
                    </h2>
                    <SocialInteractions
                      event={event}
                      isUnlocked={true}
                      variant="horizontal"
                    />
                  </CardContent>
                </Card>
              </div>
            </div>
          </div>

          {/* Sidebar droite */}
          <div className="space-y-6">
            {canManageEvent && (
              <Card className="bg-gray-900/80 backdrop-blur-sm border-blue-800/50 shadow-xl overflow-hidden">
                <div className="bg-gradient-to-r from-blue-900/30 to-purple-900/30 p-3 border-b border-blue-800/30">
                  <h3 className="font-bold text-blue-300 flex items-center gap-2">
                    <Settings className="w-4 h-4" />{" "}
                    {t("eventDetail.admin.title")}
                  </h3>
                </div>
                <CardContent className="p-4 space-y-3">
                  <div className="flex flex-col gap-3 bg-black/20 p-3 rounded-lg border border-white/10">
                    <div className="space-y-2">
                      <div className="flex justify-between items-center">
                        <p className="font-medium text-white">
                          {t("eventDetail.admin.eventStatus")}
                        </p>
                        {isEventFinished ? (
                          <Badge
                            variant="destructive"
                            className="bg-amber-600 text-white"
                          >
                            {t("eventDetail.admin.status.finished")}
                          </Badge>
                        ) : isEventOngoing ? (
                          <Badge
                            variant="default"
                            className="bg-green-600 text-white"
                          >
                            {t("eventDetail.admin.status.ongoing")}
                          </Badge>
                        ) : (
                          <Badge
                            variant="secondary"
                            className="bg-blue-600 text-white"
                          >
                            {t("eventDetail.admin.status.upcoming")}
                          </Badge>
                        )}
                      </div>
                      <div className="flex justify-between items-center">
                        <p className="font-medium text-white">
                          {t("eventDetail.admin.salesStatus")}
                        </p>
                        {isSalesClosed ? (
                          <Badge
                            variant="destructive"
                            className="bg-red-600 text-white"
                          >
                            {t("eventDetail.admin.sales.closed")}
                          </Badge>
                        ) : isPresale ? (
                          <Badge
                            variant="secondary"
                            className="bg-yellow-600 text-white"
                          >
                            {t("eventDetail.admin.sales.presale")}
                          </Badge>
                        ) : (
                          <Badge
                            variant="default"
                            className="bg-green-600 text-white"
                          >
                            {t("eventDetail.admin.sales.open")}
                          </Badge>
                        )}
                      </div>
                    </div>

                    {!isEventFinished && (
                      <Button
                        size="sm"
                        onClick={handleToggleSales}
                        disabled={togglingSales}
                        className={`w-full font-bold ${
                          event.is_sales_closed
                            ? "bg-green-600 hover:bg-green-700 text-white"
                            : "bg-red-600 hover:bg-red-700 text-white"
                        }`}
                      >
                        {togglingSales ? (
                          <Loader2 className="w-4 h-4 animate-spin mr-2" />
                        ) : event.is_sales_closed ? (
                          <>
                            <CheckCircle2 className="w-4 h-4 mr-2" />
                            {t("eventDetail.admin.reopenSales")}
                          </>
                        ) : (
                          <>
                            <Ban className="w-4 h-4 mr-2" />
                            {t("eventDetail.admin.closeSales")}
                          </>
                        )}
                      </Button>
                    )}

                    <p className="text-[10px] text-gray-400 text-center italic">
                      {isEventFinished
                        ? t("eventDetail.admin.salesClosedPermanent")
                        : event.is_sales_closed
                          ? t("eventDetail.admin.salesClosedManual")
                          : isPresale
                            ? t("eventDetail.admin.salesPresale")
                            : t("eventDetail.admin.salesNormal")}
                    </p>
                  </div>

                  {event.event_type === "ticketing" && (
                    <>
                      <Button
                        onClick={() => setShowScannerModal(true)}
                        className="w-full font-bold bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white border-0 shadow-lg"
                        size="lg"
                      >
                        <Scan className="w-5 h-5 mr-2" />{" "}
                        {t("eventDetail.admin.scanTickets")}
                      </Button>
                      <Button
                        onClick={() => setShowStatsModal(true)}
                        variant="outline"
                        className="w-full border-blue-800/50 text-blue-400 hover:bg-blue-900/30 hover:text-blue-300"
                      >
                        <BarChart className="w-4 h-4 mr-2" />{" "}
                        {t("eventDetail.admin.entryStats")}
                      </Button>
                    </>
                  )}

                  {/* 🔥 BOUTON CHANGER L'IMAGE UNIQUEMENT */}
                  <Button
                    onClick={() => setShowChangeImageDialog(true)}
                    variant="outline"
                    className="w-full border-purple-600/50 text-purple-400 hover:bg-purple-900/30 hover:border-purple-500"
                  >
                    <ImageIcon className="w-4 h-4 mr-2" />
                    🖼️ Changer l'image
                  </Button>

                  {/* 🔥 BOUTON MODIFIER COMPLET - OUVRE LE MODAL */}
                  <Button
                    onClick={() => setShowEditModal(true)}
                    className="w-full bg-yellow-600 hover:bg-yellow-700 text-white font-bold"
                  >
                    <Edit className="w-4 h-4 mr-2" />
                    ✏️ Modifier l'événement
                  </Button>

                  {event.event_type === "voting" && (
                    <div className="flex flex-col gap-3 bg-black/20 p-3 rounded-lg border border-white/10">
                      <div>
                        <p className="font-medium text-white">
                          📵 Limite de voix par personne
                        </p>
                        <p className="text-[10px] text-gray-400 mt-1">
                          Nombre maximum de voix qu&apos;une même personne peut
                          voter pour ce concours — par numéro de téléphone ET
                          par appareil (0 = illimité).
                        </p>
                      </div>
                      <div className="flex gap-2">
                        <Input
                          type="number"
                          min="0"
                          value={phoneVoteLimit}
                          onChange={(e) => setPhoneVoteLimit(e.target.value)}
                          className="bg-gray-900 border-gray-700 text-white"
                          placeholder="Ex : 50"
                        />
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={handleSavePhoneVoteLimit}
                          disabled={savingPhoneVoteLimit}
                          className="border-emerald-600/50 text-emerald-400 hover:bg-emerald-900/30 whitespace-nowrap"
                        >
                          {savingPhoneVoteLimit ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            <Save className="w-4 h-4" />
                          )}
                          Enregistrer
                        </Button>
                      </div>
                    </div>
                  )}

                  {event.event_type === "voting" && (
                    <div className="flex flex-col gap-3 bg-black/20 p-3 rounded-lg border border-white/10">
                      <div>
                        <p className="font-medium text-white">
                          📸 Photos des candidats
                        </p>
                        <p className="text-[10px] text-gray-400 mt-1">
                          Remplacez la photo d&apos;un candidat du concours.
                          L&apos;image est automatiquement compressée.
                        </p>
                      </div>
                      {candidatesLoading ? (
                        <div className="flex items-center justify-center text-gray-400 py-2">
                          <Loader2 className="w-5 h-5 animate-spin mr-2" />
                          Chargement...
                        </div>
                      ) : candidates.length === 0 ? (
                        <p className="text-[11px] text-gray-400">
                          Aucun candidat pour ce concours.
                        </p>
                      ) : (
                        <div className="flex flex-col gap-2 max-h-64 overflow-y-auto pr-1">
                          {candidates.map((cand) => (
                            <div
                              key={cand.id}
                              className="flex items-center gap-3 bg-white/5 p-2 rounded-lg border border-white/10"
                            >
                              <img
                                src={
                                  cand.photo_url ||
                                  "/api/placeholder/64/64"
                                }
                                alt={cand.name}
                                className="w-12 h-12 rounded-lg object-cover shrink-0"
                                onError={(e) => {
                                  e.target.onerror = null;
                                  e.target.src = "/api/placeholder/64/64";
                                }}
                              />
                              <div className="flex flex-col min-w-0 flex-1">
                                <span className="text-white text-sm font-medium truncate">
                                  {cand.name}
                                </span>
                                {cand.category && (
                                  <span className="text-[10px] text-gray-400">
                                    {cand.category}
                                  </span>
                                )}
                              </div>
                              <input
                                id={`candidate-photo-input-${cand.id}`}
                                type="file"
                                accept="image/*"
                                className="hidden"
                                disabled={uploadingCandidateId === cand.id}
                                onChange={(e) => {
                                  const file = e.target.files?.[0];
                                  if (file) {
                                    handleCandidateFileChange(cand.id, file);
                                  }
                                  e.target.value = "";
                                }}
                              />
                              <Button
                                size="sm"
                                variant="outline"
                                className="border-purple-600/50 text-purple-400 hover:bg-purple-900/30 whitespace-nowrap"
                                onClick={() =>
                                  handleFileSelectForCandidate(cand.id)
                                }
                                disabled={uploadingCandidateId === cand.id}
                              >
                                {uploadingCandidateId === cand.id ? (
                                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                ) : (
                                  <ImageIcon className="w-3.5 h-3.5" />
                                )}
                                {uploadingCandidateId === cand.id
                                  ? "Upload..."
                                  : "Photo"}
                              </Button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}

            {canManageEvent && promoConfig?.enabled && (
              <Card className="bg-gray-900/80 backdrop-blur-sm border-green-800/50 shadow-xl overflow-hidden">
                <div className="bg-gradient-to-r from-green-900/30 to-emerald-900/30 p-3 border-b border-green-800/30">
                  <h3 className="font-bold text-green-300 flex items-center gap-2">
                    <Tag className="w-4 h-4" /> Codes de réduction
                  </h3>
                </div>
                <CardContent className="p-4">
                  <div className="space-y-2">
                    <div className="flex justify-between items-center">
                      <span className="text-gray-400">Statut</span>
                      <Badge className="bg-green-600 text-white">Actif</Badge>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-gray-400">Réduction</span>
                      <span className="text-white font-medium">
                        {promoConfig.discount_type === "fixed"
                          ? `${promoConfig.discount_value.toLocaleString()} FCFA`
                          : `${promoConfig.discount_value}%`}
                      </span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-gray-400">
                        Commission influenceur
                      </span>
                      <span className="text-white font-medium">
                        {promoConfig.commission_rate}%
                      </span>
                    </div>
                    {promoConfig.usage_limit && (
                      <div className="flex justify-between items-center">
                        <span className="text-gray-400">
                          Limite d'utilisation
                        </span>
                        <span className="text-white font-medium">
                          {promoConfig.usage_limit} utilisations/code
                        </span>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            )}

            {canManageEvent && event.event_type === "stand_rental" && (
              <Card className="bg-gray-900/80 backdrop-blur-sm border-blue-800/50 shadow-xl overflow-hidden animate-in fade-in">
                <div className="bg-gradient-to-r from-blue-900/30 to-cyan-900/30 p-3 border-b border-blue-800/30">
                  <h3 className="font-bold text-blue-300 flex items-center gap-2">
                    <TrendingUp className="w-4 h-4" />{" "}
                    {t("eventDetail.standDashboard.title")}
                  </h3>
                </div>
                <CardContent className="p-4 space-y-4">
                  {standStats.loading ? (
                    <div className="flex justify-center py-4">
                      <Loader2 className="animate-spin text-blue-400" />
                    </div>
                  ) : (
                    <>
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-gray-400">
                          {t("eventDetail.standDashboard.rented")}
                        </span>
                        <Badge
                          variant="outline"
                          className="bg-blue-900/30 text-blue-300 border-blue-700/50 text-lg px-3"
                        >
                          {standStats.total_rented}
                        </Badge>
                      </div>
                      <div className="space-y-2 pt-2 border-t border-gray-800">
                        <div className="flex justify-between items-center text-sm">
                          <span className="text-gray-300">
                            {t("eventDetail.standDashboard.grossRevenue")}
                          </span>
                          <span className="font-medium text-white">
                            {standStats.gross_revenue} pièces
                          </span>
                        </div>
                        <div className="flex justify-between items-center text-sm">
                          <span className="text-red-400 flex items-center gap-1">
                            <PieChart className="w-3 h-3" />{" "}
                            {t("eventDetail.standDashboard.fees")}
                          </span>
                          <span className="text-red-400">
                            -{standStats.platform_fee} pièces
                          </span>
                        </div>
                      </div>
                    </>
                  )}
                </CardContent>
              </Card>
            )}

            {event.organizer && (
              <Card className="bg-gray-900/50 border-gray-800">
                <CardContent className="p-6">
                  <h3 className="font-bold text-lg mb-2 text-white">
                    {t("eventDetail.organizer")}
                  </h3>
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-gradient-to-r from-blue-600 to-purple-600 flex items-center justify-center text-white font-bold">
                      {event.organizer.full_name.charAt(0)}
                    </div>
                    <div>
                      <p className="font-medium text-white">
                        {event.organizer.full_name}
                      </p>
                      {event.contact_phone && (
                        <p className="text-xs text-gray-400 flex items-center gap-1">
                          <Phone className="w-3 h-3" /> {event.contact_phone}
                        </p>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      </main>

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent className="bg-black border-gray-800 text-white">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-red-400">
              {t("eventDetail.deleteDialog.title")}
            </AlertDialogTitle>
            <AlertDialogDescription className="text-gray-400">
              {t("eventDetail.deleteDialog.description")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="bg-gray-900 text-gray-300 border-gray-700 hover:bg-gray-800">
              {t("common.cancel")}
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteEvent}
              className="bg-gradient-to-r from-red-600 to-rose-600 hover:from-red-700 hover:to-rose-700 border-0"
              disabled={isDeleting}
            >
              {isDeleting ? (
                <Loader2 className="w-4 h-4 animate-spin mr-2" />
              ) : (
                <Trash2 className="w-4 h-4 mr-2" />
              )}
              {t("common.delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* MODAL D'ÉDITION COMPLET */}
      <EditEventModal
        isOpen={showEditModal}
        onClose={() => setShowEditModal(false)}
        event={event}
        onEventUpdated={handleEventUpdated}
      />

      <ChangeCoverImageDialog
        isOpen={showChangeImageDialog}
        onClose={() => setShowChangeImageDialog(false)}
        event={event}
        onImageUpdated={handleImageUpdated}
      />

      <VerificationStatsDialog
        isOpen={showStatsModal}
        onClose={() => setShowStatsModal(false)}
        eventId={event?.id}
        organizerId={user?.id}
      />

      <TicketScannerDialog
        isOpen={showScannerModal}
        onClose={() => setShowScannerModal(false)}
        eventId={event?.id}
      />
    </div>
  );
};

export default EventDetailPage;