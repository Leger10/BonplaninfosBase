import React, { useState, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Loader2, Upload, X, Image as ImageIcon, AlertCircle, CheckCircle } from 'lucide-react';
import { supabase } from '@/lib/customSupabaseClient';
import { toast } from '@/components/ui/use-toast';

const ImageUpload = ({ 
  onImageUploaded, 
  existingImage,
  folder = 'event-covers',
  // Conservée pour compatibilité avec les appelants existants, mais PLUS
  // appliquée : aucune image n'est refusée pour sa taille, c'est l'image
  // envoyée qui est réduite (voir compressImage). Un `maxSizeMB={1}` hérité
  // d'un autre écran ne doit plus bloquer l'utilisateur.
  maxSizeMB = 2,
  aspectRatio = '16/9',
  className = '',
  bucket = 'media',
}) => {
  const [uploading, setUploading] = useState(false);
  const [previewUrl, setPreviewUrl] = useState(existingImage || '');
  const [compressionSaved, setCompressionSaved] = useState(0);
  const fileInputRef = useRef(null);

  // Conversion complète vers JPEG (un format universellement supporté)
  const convertToSupportedFormat = async (file) => {
    return new Promise((resolve, reject) => {
      const img = new Image();
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      
      img.onload = () => {
        // Dimensions optimisées
        const MAX_WIDTH = 800;
        const MAX_HEIGHT = 600;
        let width = img.width;
        let height = img.height;
        
        if (width > height) {
          if (width > MAX_WIDTH) {
            height = (height * MAX_WIDTH) / width;
            width = MAX_WIDTH;
          }
        } else {
          if (height > MAX_HEIGHT) {
            width = (width * MAX_HEIGHT) / height;
            height = MAX_HEIGHT;
          }
        }
        
        canvas.width = width;
        canvas.height = height;
        
        // Dessiner l'image
        ctx.drawImage(img, 0, 0, width, height);
        
        // Convertir en JPEG avec compression
        canvas.toBlob(
          (blob) => {
            const originalSize = file.size;
            const compressedSize = blob.size;
            const savedPercent = ((originalSize - compressedSize) / originalSize * 100).toFixed(0);
            setCompressionSaved(savedPercent);
            
            // Créer un fichier JPEG
            const convertedFile = new File(
              [blob], 
              file.name.replace(/\.[^/.]+$/, '.jpg'), 
              { type: 'image/jpeg' }
            );
            resolve(convertedFile);
          },
          'image/jpeg',
          0.75 // 75% qualité
        );
      };
      
      img.onerror = () => reject(new Error('Impossible de charger l\'image'));
      img.src = URL.createObjectURL(file);
    });
  };

  /**
   * Réduit une image jusqu'à ce qu'elle passe sous `targetBytes`.
   *
   * Le fichier choisi par l'utilisateur n'est PAS refusé pour cause de poids :
   * c'est l'image envoyée qui est réduite. On commence par un grand gabarit
   * (1600px, adapté à une affiche) puis on baisse la qualité JPEG, et en
   * dernier recours on réduit les dimensions. Le but est qu'une affiche de 8 Mo
   * prise en photo avec un téléphone soit acceptée telle quelle.
   */
  const compressImage = async (file, targetBytes = 900 * 1024) => {
    const dataUrl = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(new Error('Lecture du fichier impossible'));
      reader.readAsDataURL(file);
    });

    const img = await new Promise((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error('Image illisible ou format non pris en charge par le navigateur'));
      el.src = dataUrl;
    });

    // Gabarit maximal : suffisant pour une affiche nette sur mobile et desktop.
    const LONG_EDGE = 1600;
    let width = img.naturalWidth || img.width;
    let height = img.naturalHeight || img.height;
    const ratio = Math.min(1, LONG_EDGE / Math.max(width, height));
    width = Math.max(1, Math.round(width * ratio));
    height = Math.max(1, Math.round(height * ratio));

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    // Fond blanc : sans cela, la transparence d'un PNG devient du noir en JPEG.
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, width, height);
    ctx.drawImage(img, 0, 0, width, height);

    const encode = (q) =>
      new Promise((resolve) => canvas.toBlob((b) => resolve(b), 'image/jpeg', q));

    // 1) Qualité JPEG décroissante jusqu'à passer sous le seuil.
    for (const q of [0.86, 0.75, 0.65, 0.55, 0.45]) {
      const blob = await encode(q);
      if (blob && blob.size <= targetBytes) {
        return { blob, width, height };
      }
    }

    // 2) Trop lourd : on réduit les dimensions et on réessaie.
    let shrink = 0.8;
    for (let i = 0; i < 5; i++) {
      width = Math.max(320, Math.round(width * shrink));
      height = Math.max(320, Math.round(height * shrink));
      canvas.width = width;
      canvas.height = height;
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, width, height);
      ctx.drawImage(img, 0, 0, width, height);
      for (const q of [0.7, 0.55, 0.4]) {
        const blob = await encode(q);
        if (blob && blob.size <= targetBytes) {
          return { blob, width, height };
        }
      }
      shrink = 0.7;
    }

    // 3) Dernière tentative : qualité minimale au gabarit réduit.
    const blob = await encode(0.3);
    return { blob, width, height };
  };

  const handleFileSelect = async (event) => {
    const file = event.target.files[0];
    if (!file) return;

    // Vérifier que c'est une image
    if (!file.type.startsWith('image/')) {
      toast({
        title: "Format non supporté",
        description: "Veuillez sélectionner une image.",
        variant: "destructive",
      });
      return;
    }

    // Créer un aperçu immédiat
    const objectUrl = URL.createObjectURL(file);
    setPreviewUrl(objectUrl);
    
    // Upload avec réduction automatique
    await uploadFile(file);
  };

  const uploadFile = async (originalFile) => {
    setUploading(true);
    setCompressionSaved(0);
    
    try {
      let fileToUpload = originalFile;
      let conversionMessage = '';
      const originalSize = originalFile.size;

      // Réduire systématiquement : plus aucune image n'est refusée pour sa
      // taille, le fichier envoyé est allégé avant l'upload.
      try {
        const { blob, width, height } = await compressImage(originalFile);
        if (!blob) throw new Error('Compression impossible');
        fileToUpload = new File([blob], 'image.jpg', { type: 'image/jpeg' });
        const savedPercent = Math.max(
          0,
          Math.round((1 - blob.size / originalSize) * 100),
        );
        setCompressionSaved(savedPercent);
        conversionMessage = `✅ Image optimisée ${width}×${height} (${savedPercent}% de moins)`;
      } catch (conversionError) {
        console.error('Compression error:', conversionError);
        // Repli : on tente le fichier original plutôt que de bloquer.
        fileToUpload = originalFile;
        conversionMessage = '⚠️ Image envoyée au format original';
      }

      // Générer un nom de fichier unique. L'extension suit le contenu réel :
      // forcer « .jpg » sur un fichier original (cas du repli) produisait une
      // URL dont le type ne correspondait pas à l'octet stocké.
      const isJpeg = fileToUpload.type === 'image/jpeg';
      const fileExt = isJpeg
        ? 'jpg'
        : (fileToUpload.name.match(/\.([a-z0-9]+)$/i)?.[1] || 'bin').toLowerCase();
      const contentType = fileToUpload.type || 'application/octet-stream';
      const fileName = `${folder}/${Date.now()}_${Math.random().toString(36).substring(2, 9)}.${fileExt}`;

      // Upload vers Supabase Storage
      const { error: uploadError } = await supabase.storage
        .from(bucket)
        .upload(fileName, fileToUpload, {
          cacheControl: '31536000', // 1 an
          upsert: false,
          contentType,
        });

      if (uploadError) {
        throw uploadError;
      }

      // Récupérer l'URL publique
      const { data: { publicUrl } } = supabase.storage
        .from(bucket)
        .getPublicUrl(fileName);

      // Nettoyer l'URL temporaire
      if (previewUrl && previewUrl.startsWith('blob:')) {
        URL.revokeObjectURL(previewUrl);
      }

      // Mettre à jour l'aperçu
      setPreviewUrl(publicUrl);

      // Callback avec l'URL uploadée
      if (onImageUploaded) {
        onImageUploaded(publicUrl);
      }

      // Message de succès
      toast({
        title: "✅ Image téléchargée avec succès",
        description: conversionMessage || `Upload réussi (${compressionSaved}% économisés)`,
        duration: 4000,
      });

      // Supprimer l'ancienne image si elle existe
      if (existingImage && existingImage.includes('supabase.co') && existingImage !== publicUrl) {
        try {
          const oldPathMatch = existingImage.match(/\/([^\/]+\.(jpg|jpeg|png|webp))$/);
          if (oldPathMatch) {
            const oldFileName = oldPathMatch[1];
            await supabase.storage.from(bucket).remove([`${folder}/${oldFileName}`]);
            console.log('Ancienne image supprimée:', oldFileName);
          }
        } catch (deleteError) {
          console.error('Erreur suppression ancienne image:', deleteError);
        }
      }

    } catch (error) {
      console.error('Upload error:', error);
      
      // Nettoyer l'URL temporaire
      if (previewUrl && previewUrl.startsWith('blob:')) {
        URL.revokeObjectURL(previewUrl);
      }
      
      toast({
        title: "❌ Erreur de téléchargement",
        description: error.message || "Impossible de télécharger l'image. Veuillez réessayer.",
        variant: "destructive",
      });
      
      // Réinitialiser l'aperçu
      setPreviewUrl(existingImage || '');
    } finally {
      setUploading(false);
      
      // Réinitialiser l'input file
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleRemoveImage = () => {
    if (previewUrl && previewUrl.startsWith('blob:')) {
      URL.revokeObjectURL(previewUrl);
    }
    setPreviewUrl('');
    setCompressionSaved(0);
    if (onImageUploaded) {
      onImageUploaded('');
    }
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    
    const files = e.dataTransfer.files;
    if (files.length > 0) {
      const file = files[0];
      const dataTransfer = new DataTransfer();
      dataTransfer.items.add(file);
      
      if (fileInputRef.current) {
        fileInputRef.current.files = dataTransfer.files;
        handleFileSelect({ target: { files: dataTransfer.files } });
      }
    }
  };

  // Nettoyage
  useEffect(() => {
    return () => {
      if (previewUrl && previewUrl.startsWith('blob:')) {
        URL.revokeObjectURL(previewUrl);
      }
    };
  }, [previewUrl]);

  return (
    <div className={`space-y-4 ${className}`}>
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileSelect}
        accept="image/jpeg,image/jpg,image/png,image/webp,image/heic,image/heif"
        className="hidden"
        id="image-upload"
      />
      
      <div
        onDragOver={handleDragOver}
        onDrop={handleDrop}
        className={`
          border-2 border-dashed rounded-lg p-6 text-center transition-colors cursor-pointer
          ${previewUrl 
            ? 'border-primary/50 bg-background' 
            : 'border-gray-300 dark:border-gray-700 hover:border-primary hover:bg-gray-50 dark:hover:bg-gray-900/50'
          }
        `}
        onClick={() => fileInputRef.current?.click()}
      >
        {previewUrl ? (
          <div className="relative group">
            <div 
              className="relative aspect-video rounded-lg overflow-hidden bg-gray-100 dark:bg-gray-900"
              style={{ aspectRatio }}
            >
              <img
                src={previewUrl}
                alt="Preview"
                className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                loading="lazy"
                onError={(e) => {
                  console.error('Image load error');
                  e.target.onerror = null;
                  e.target.src = '/photoequipe.jpg';
                }}
              />
              
              {uploading && (
                <div className="absolute inset-0 bg-black/70 flex items-center justify-center rounded-lg">
                  <div className="text-center">
                    <Loader2 className="w-10 h-10 text-white animate-spin mx-auto mb-3" />
                    <p className="text-white text-sm font-medium">
                      Conversion et upload...
                    </p>
                    {compressionSaved > 0 && (
                      <p className="text-green-400 text-xs mt-2 font-medium">
                        ✨ {compressionSaved}% économisés
                      </p>
                    )}
                  </div>
                </div>
              )}
            </div>
            
            <div className="absolute top-3 right-3 flex gap-2">
              {!uploading && (
                <Button
                  type="button"
                  variant="destructive"
                  size="icon"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleRemoveImage();
                  }}
                  className="opacity-0 group-hover:opacity-100 transition-all bg-white/90 hover:bg-white shadow-lg"
                >
                  <X className="w-4 h-4" />
                </Button>
              )}
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-8">
            <div className="w-16 h-16 bg-gray-100 dark:bg-gray-800 rounded-full flex items-center justify-center mb-4">
              {uploading ? (
                <Loader2 className="w-8 h-8 text-gray-400 animate-spin" />
              ) : (
                <ImageIcon className="w-8 h-8 text-gray-400" />
              )}
            </div>
            
            <div className="space-y-2">
              <p className="font-medium text-gray-900 dark:text-gray-100">
                {uploading ? 'Conversion en cours...' : 'Cliquez pour télécharger une image'}
              </p>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Tous formats acceptés (PNG, WEBP, JPG, HEIC) • Taille libre
              </p>
              <p className="text-xs text-green-600 dark:text-green-400 font-medium">
                ✨ Réduction automatique de la taille, sans limite de poids
              </p>
            </div>
          </div>
        )}
      </div>
      
      <div className="bg-blue-500/10 border border-blue-500/20 rounded-lg p-3">
        <div className="flex items-start gap-2">
          <CheckCircle className="w-4 h-4 text-blue-500 mt-0.5 flex-shrink-0" />
          <div className="text-xs text-gray-300">
            <p className="font-medium mb-1">✨ Optimisations automatiques :</p>
            <ul className="list-disc list-inside space-y-0.5">
              <li>Conversion automatique en JPEG (100% compatible)</li>
              <li>Taille libre : l'image est réduite avant l'envoi</li>
              <li>Redimensionnement 1600px max, ajusté si besoin</li>
              <li>Objectif ~900 Ko par image</li>
              <li>Cache CDN 1 an</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ImageUpload;