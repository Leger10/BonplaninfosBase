import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import { motion } from "framer-motion";
import { toast } from "@/components/ui/use-toast";
import { useAuth } from "@/contexts/SupabaseAuthContext";
import { useData } from "@/contexts/DataContext";
import { supabase } from "@/lib/customSupabaseClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import {
  Loader2,
  ArrowLeft,
  Globe,
  MapPin,
  Image as ImageIcon,
  Lock,
} from "lucide-react";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { v4 as uuidv4 } from "uuid";
import { Checkbox } from "@/components/ui/checkbox";

// Helper function to convert images to JPG
const convertImageToJpg = (file) => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement("canvas");
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext("2d");

        // Fill white background for transparent images (PNG/WebP)
        ctx.fillStyle = "#FFFFFF";
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        ctx.drawImage(img, 0, 0);

        canvas.toBlob(
          (blob) => {
            if (!blob) {
              reject(new Error("Conversion failed"));
              return;
            }
            // Force .jpg extension
            const newName = file.name.replace(/\.[^/.]+$/, "") + ".jpg";
            const newFile = new File([blob], newName, {
              type: "image/jpeg",
              lastModified: Date.now(),
            });
            resolve(newFile);
          },
          "image/jpeg",
          0.85,
        ); // 0.85 quality
      };
      img.onerror = () => reject(new Error("Failed to load image"));
      img.src = event.target.result;
    };
    reader.onerror = () => reject(new Error("Failed to read file"));
    reader.readAsDataURL(file);
  });
};

const CreateSimpleEventPage = () => {
  const [formData, setFormData] = useState({
    title: "",
    description: "",
    category_id: null,
    event_start_at: "",
    location: "",
    city: "",
    country: "",
    is_public_to_all: true,
    cover_image_file: null,
  });
  const [loading, setLoading] = useState(false);
  const [isProcessingImage, setIsProcessingImage] = useState(false);
  const [categories, setCategories] = useState([]);
  const [imagePreview, setImagePreview] = useState("");
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [isProtected, setIsProtected] = useState(false);
  const [protectedPriceCoins, setProtectedPriceCoins] = useState("");
  const navigate = useNavigate();
  const { user } = useAuth();
  const { userProfile, adminConfig } = useData();

  useEffect(() => {
    if (userProfile) {
      setFormData((prev) => ({
        ...prev,
        country: userProfile.country || "",
        city: userProfile.city || "",
      }));
    }
    const fetchCategories = async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from("event_categories")
        .select("id, name")
        .eq("is_active", true)
        .order("name");
      if (error) {
        toast({
          title: "Erreur",
          description: "Impossible de charger les catégories.",
          variant: "destructive",
        });
      } else {
        setCategories(data);
      }
      setLoading(false);
    };
    fetchCategories();
  }, [userProfile]);

  const handleInputChange = (field, value) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const handleFileChange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      toast({
        title: "Format invalide",
        description: "Veuillez sélectionner une image (JPG, PNG, WebP).",
        variant: "destructive",
      });
      e.target.value = null;
      return;
    }

    if (file.size > 2 * 1024 * 1024) {
      toast({
        title: "Fichier trop volumineux",
        description: "L'image ne doit pas dépasser 2MB.",
        variant: "destructive",
      });
      e.target.value = null;
      return;
    }

    setIsProcessingImage(true);
    try {
      const jpgFile = await convertImageToJpg(file);
      handleInputChange("cover_image_file", jpgFile);
      setImagePreview(URL.createObjectURL(jpgFile));
      toast({
        title: "Image prête",
        description: "Image optimisée et convertie en JPG.",
        className: "bg-green-50 text-green-900 border-green-200",
      });
    } catch (error) {
      console.error("Image conversion error:", error);
      toast({
        title: "Erreur",
        description:
          "Impossible de traiter l'image. Veuillez essayer un autre fichier.",
        variant: "destructive",
      });
      e.target.value = null;
    } finally {
      setIsProcessingImage(false);
    }
  };

  const coinRate = Number(adminConfig?.coin_to_fcfa_rate) || 10;
  const protectedPrice = Math.floor(Number(protectedPriceCoins)) || 0;
  const isProtectedEvent = isProtected && protectedPrice >= 1;

  const canSubmit =
    formData.title &&
    formData.event_start_at &&
    formData.location &&
    formData.city &&
    formData.country &&
    formData.category_id &&
    (!isProtected || protectedPrice >= 1) &&
    !isProcessingImage;

  // Actual submission after contract acceptance
  const performSubmission = async (e) => {
    e.preventDefault();

    if (!canSubmit) {
      toast({
        title: "Champs requis",
        description: "Veuillez remplir tous les champs obligatoires.",
        variant: "destructive",
      });
      return;
    }

    if (!termsAccepted) {
      toast({
        title: "Conditions requises",
        description: "Veuillez accepter le contrat Organisateur.",
        variant: "destructive",
      });
      return;
    }

    setLoading(true);

    try {
      let cover_image_url = null;
      if (formData.cover_image_file) {
        const cleanFileName = formData.cover_image_file.name.replace(
          /[^a-zA-Z0-9-_\.]/g,
          "_",
        );
        const finalFileName = cleanFileName.endsWith(".jpg")
          ? cleanFileName
          : `${cleanFileName}.jpg`;
        const filePath = `events/${user.id}/${uuidv4()}-${finalFileName}`;

        const { data: uploadData, error: uploadError } = await supabase.storage
          .from("media")
          .upload(filePath, formData.cover_image_file, {
            contentType: "image/jpeg",
            upsert: false,
          });

        if (uploadError) throw uploadError;

        const { data: urlData } = supabase.storage
          .from("media")
          .getPublicUrl(uploadData.path);
        cover_image_url = urlData.publicUrl;
      }

      const eventPayload = {
        title: formData.title,
        description: formData.description,
        category_id: formData.category_id,
        event_type: isProtectedEvent ? "protected" : "standard",
        event_start_at: formData.event_start_at || null,
        location: formData.location,
        address: formData.location,
        city: formData.city,
        country: formData.country,
        price_fcfa: isProtectedEvent ? protectedPrice * coinRate : 0,
        price_pi: isProtectedEvent ? protectedPrice : 0,
        organizer_id: user.id,
        status: "active",
        is_active: true,
        is_public: true,
        cover_image: cover_image_url,
        tags: formData.is_public_to_all ? ["global"] : ["zone_only"],

        // Contract metadata
        contract_accepted_at: new Date().toISOString(),
        contract_version: "v1.0",
      };

      const { data, error } = await supabase
        .from("events")
        .insert(eventPayload)
        .select()
        .single();
      if (error) throw error;

      toast({
        title: "Événement publié !",
        description: isProtectedEvent
          ? "Votre événement protégé est en ligne. Les visiteurs devront payer en pièces ou par Mobile Money pour y accéder."
          : formData.is_public_to_all
            ? "Votre événement est maintenant visible par toute la communauté."
            : "Votre événement est visible dans votre zone.",
      });
      navigate(`/event/${data.id}`);
    } catch (error) {
      console.error(error);
      toast({
        title: "Erreur",
        description: error.message || "Une erreur est survenue.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <Helmet>
        <title>Créer un Événement</title>
      </Helmet>
      <main className="container mx-auto max-w-3xl px-4 py-8">
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <Button variant="ghost" onClick={() => navigate(-1)} className="mb-4">
            <ArrowLeft className="w-4 h-4 mr-2" /> Retour
          </Button>
          <Card className="border-none shadow-lg">
            <CardHeader className="bg-primary/5 rounded-t-xl pb-8">
              <CardTitle className="text-2xl text-primary">
                Publier une annonce ou un événement
              </CardTitle>
              <CardDescription className="text-base text-foreground/80">
                Créez un événement d'information ou un événement exclusif et
                nous le montrons à tous les utilisateurs.
              </CardDescription>
            </CardHeader>
            <CardContent className="pt-8">
              <form onSubmit={performSubmission} className="space-y-8">
                {/* Image Upload Section */}
                <div className="space-y-4">
                  <Label className="text-lg font-semibold">
                    Image de couverture
                  </Label>
                  <div className="flex flex-col items-center justify-center border-2 border-dashed border-muted-foreground/25 rounded-xl p-6 hover:bg-muted/20 transition-colors bg-muted/5 relative">
                    {isProcessingImage && (
                      <div className="absolute inset-0 bg-background/80 backdrop-blur-sm z-10 flex flex-col items-center justify-center rounded-xl">
                        <Loader2 className="w-10 h-10 text-primary animate-spin mb-2" />
                        <span className="text-sm font-medium text-primary">
                          Traitement et conversion en cours...
                        </span>
                      </div>
                    )}

                    {imagePreview ? (
                      <div className="relative w-full">
                        <img
                          src={imagePreview}
                          alt="Aperçu"
                          className="w-full h-64 object-cover rounded-lg shadow-md"
                        />
                        <Button
                          type="button"
                          variant="secondary"
                          size="sm"
                          className="absolute top-2 right-2 bg-background/80 backdrop-blur-sm"
                          onClick={() => {
                            setImagePreview("");
                            handleInputChange("cover_image_file", null);
                          }}
                          disabled={isProcessingImage}
                        >
                          Changer
                        </Button>
                      </div>
                    ) : (
                      <label
                        className={`cursor-pointer flex flex-col items-center w-full h-full ${isProcessingImage ? "opacity-50 pointer-events-none" : ""}`}
                      >
                        <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mb-4">
                          <ImageIcon className="w-8 h-8 text-primary" />
                        </div>
                        <span className="text-sm font-medium text-foreground">
                          Cliquez pour ajouter une image
                        </span>
                        <span className="text-xs text-muted-foreground mt-1">
                          PNG, JPG, WEBP jusqu'à 2MB (Sera converti en JPG)
                        </span>
                        <Input
                          type="file"
                          accept="image/*"
                          className="hidden"
                          onChange={handleFileChange}
                          disabled={isProcessingImage}
                        />
                      </label>
                    )}
                  </div>
                </div>

                <div className="grid gap-6">
                  {/* Basic Info */}
                  <div className="space-y-2">
                    <Label htmlFor="title" className="text-base">
                      Titre de l'événement *
                    </Label>
                    <Input
                      id="title"
                      value={formData.title || ""} // Assurez-vous d'avoir une valeur par défaut
                      onChange={(e) =>
                        handleInputChange("title", e.target.value)
                      }
                      required
                      className="h-12 text-lg"
                      placeholder="Ex: Soirée Networking, Vente Privée..."
                    />
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-2">
                      <Label htmlFor="category">Catégorie *</Label>
                      <Select
                        value={formData.category_id || ""}
                        onValueChange={(value) =>
                          handleInputChange("category_id", value)
                        }
                      >
                        <SelectTrigger className="h-12">
                          <SelectValue placeholder="Sélectionner..." />
                        </SelectTrigger>
                        <SelectContent>
                          {categories.map((cat) => (
                            <SelectItem key={cat.id} value={cat.id}>
                              {cat.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="event_start_at">Date et Heure *</Label>
                      <Input
                        id="event_start_at"
                        type="datetime-local"
                        value={formData.event_start_at}
                        onChange={(e) =>
                          handleInputChange("event_start_at", e.target.value)
                        }
                        required
                        className="h-12"
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="description" className="text-base">
                      Description
                    </Label>
                    <Textarea
                      id="description"
                      value={formData.description}
                      onChange={(e) =>
                        handleInputChange("description", e.target.value)
                      }
                      className="min-h-[120px] resize-y"
                      placeholder="Dites-nous en plus sur votre événement..."
                    />
                  </div>

                  {/* Location Info */}
                  <div className="bg-muted/10 p-6 rounded-xl space-y-4 border border-border/50">
                    <h3 className="font-semibold flex items-center gap-2">
                      <MapPin className="w-4 h-4" /> Localisation
                    </h3>
                    <div className="space-y-4">
                      <div className="space-y-2">
                        <Label htmlFor="location">Adresse précise *</Label>
                        <Input
                          id="location"
                          value={formData.location}
                          onChange={(e) =>
                            handleInputChange("location", e.target.value)
                          }
                          required
                          placeholder="Ex: Hôtel Président, Salle A"
                        />
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label htmlFor="city">Ville *</Label>
                          <Input
                            id="city"
                            value={formData.city}
                            onChange={(e) =>
                              handleInputChange("city", e.target.value)
                            }
                            required
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="country">Pays *</Label>
                          <Input
                            id="country"
                            value={formData.country}
                            onChange={(e) =>
                              handleInputChange("country", e.target.value)
                            }
                            disabled
                            className="bg-muted"
                          />
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Visibility Toggle */}
                  <div className="p-6 border-2 border-primary/10 bg-primary/5 rounded-xl space-y-4">
                    <div className="flex items-center justify-between">
                      <div className="space-y-1">
                        <Label
                          htmlFor="visibility-toggle"
                          className="text-base font-semibold flex items-center gap-2"
                        >
                          <Globe className="w-4 h-4 text-primary" />
                          Portée de la publication
                        </Label>
                        <p className="text-sm text-muted-foreground">
                          {formData.is_public_to_all
                            ? "Votre événement sera visible par tous les utilisateurs de la plateforme."
                            : "Votre événement sera visible uniquement par les utilisateurs de votre ville."}
                        </p>
                      </div>
                      <Switch
                        id="visibility-toggle"
                        checked={formData.is_public_to_all}
                        onCheckedChange={(checked) =>
                          handleInputChange("is_public_to_all", checked)
                        }
                      />
                    </div>
                    <div className="flex justify-end">
                      <span
                        className={`text-xs font-bold px-3 py-1 rounded-full ${formData.is_public_to_all ? "bg-green-100 text-green-700" : "bg-blue-100 text-blue-700"}`}
                      >
                        {formData.is_public_to_all
                          ? "Public : Tous les utilisateurs"
                          : "Public : Ville uniquement"}
                      </span>
                    </div>
                  </div>

                  {/* Protection payante */}
                  <div className="p-6 border-2 border-amber-500/20 bg-amber-500/5 rounded-xl space-y-4">
                    <div className="flex items-center justify-between">
                      <div className="space-y-1">
                        <Label
                          htmlFor="protected-toggle"
                          className="text-base font-semibold flex items-center gap-2"
                        >
                          <Lock className="w-4 h-4 text-amber-600" />
                          Événement protégé (accès payant)
                        </Label>
                        <p className="text-sm text-muted-foreground">
                          {isProtected
                            ? "L'accès à cet événement nécessitera un paiement en pièces ou par Mobile Money."
                            : "Activez pour rendre l'accès à cet événement payant."}
                        </p>
                      </div>
                      <Switch
                        id="protected-toggle"
                        checked={isProtected}
                        onCheckedChange={setIsProtected}
                      />
                    </div>
                    {isProtected && (
                      <div className="space-y-2">
                        <Label htmlFor="protected-price">
                          Prix d'accès (en pièces) *
                        </Label>
                        <Input
                          id="protected-price"
                          type="number"
                          min="1"
                          step="1"
                          value={protectedPriceCoins}
                          onChange={(e) =>
                            setProtectedPriceCoins(e.target.value)
                          }
                          className="h-12"
                          placeholder="Ex: 5"
                        />
                        <p className="text-xs text-muted-foreground">
                          {protectedPrice >= 1
                            ? `≈ ${(protectedPrice * coinRate).toLocaleString("fr-FR")} FCFA par accès (1 pièce = ${coinRate} FCFA).`
                            : "Indiquez un nombre entier de pièces (minimum 1)."}
                        </p>
                      </div>
                    )}
                  </div>
                </div>

                {/* Checkbox de confirmation */}
                <div className="bg-muted/30 border border-border p-4 rounded-lg mt-4">
                  <div className="flex items-center space-x-3">
                    <Checkbox
                      id="terms"
                      checked={termsAccepted}
                      onCheckedChange={setTermsAccepted}
                      className="border-primary/50 data-[state=checked]:bg-primary"
                    />
                    <div className="grid gap-1.5 leading-none">
                      <label
                        htmlFor="terms"
                        className="text-sm font-medium leading-none text-foreground peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                      >
                        J'ai lu et j'accepte le contrat Organisateur
                      </label>
                      <p className="text-xs text-muted-foreground">
                        Je confirme l'exactitude des informations et j'accepte
                        les conditions de publication.
                      </p>
                    </div>
                  </div>
                </div>

                <div className="pt-4">
                  <Button
                    type="submit"
                    disabled={
                      loading ||
                      !canSubmit ||
                      isProcessingImage ||
                      !termsAccepted
                    }
                    className="w-full h-12 text-lg font-semibold shadow-lg hover:shadow-xl transition-all"
                  >
                    {loading ? (
                      <Loader2 className="animate-spin mr-2" />
                    ) : (
                      "Publier l'événement"
                    )}
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        </motion.div>
      </main>
    </div>
  );
};

export default CreateSimpleEventPage;
