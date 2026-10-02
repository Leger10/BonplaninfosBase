// Gestion des candidats d'un concours, réutilisable à deux endroits :
// la modale « Modifier l'événement » et la carte de gestion de l'organisateur.
//
// L'écriture passe par POST /api/query. La politique serveur
// (server/queryPolicy.mjs) borne chaque ligne à un événement appartenant à
// l'appelant, ET protège `candidates.vote_count` : ce composant n'envoie donc
// jamais cette colonne. Le score d'un candidat ne change que par
// `cast_contest_votes` (le votant paie) ou `correct_candidate_votes`
// (super_admin, journalisé).
import React, { useState, useEffect, useRef, useCallback } from "react";
import { Loader2, Plus, Save, Trash2, X, Pencil, Image as ImageIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/components/ui/use-toast";
import { supabase } from "@/lib/customSupabaseClient";
import { processImage, validateImage } from "@/utils/imageConverter";
import { v4 as uuidv4 } from "uuid";

const EMPTY = { name: "", description: "", category: "" };

export default function CandidatesManager({
  eventId,
  organizerId,
  canEdit = false,
  title = "Candidats du concours",
  compact = false,
}) {
  const [candidates, setCandidates] = useState([]);
  const [loading, setLoading] = useState(false);
  const [uploadingId, setUploadingId] = useState(null);
  const [editingId, setEditingId] = useState(null); // null | 'new' | id
  const [draft, setDraft] = useState(EMPTY);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState(null);
  const alive = useRef(true);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  const load = useCallback(async () => {
    if (!eventId) return;
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("candidates")
        .select("*")
        .eq("event_id", eventId)
        .order("created_at", { ascending: true });
      if (error) throw error;
      if (alive.current) setCandidates(data || []);
    } catch (e) {
      console.warn("Erreur chargement candidats:", e);
      if (alive.current) setCandidates([]);
    } finally {
      if (alive.current) setLoading(false);
    }
  }, [eventId]);

  useEffect(() => {
    load();
  }, [load]);

  const reset = () => {
    if (alive.current) {
      setEditingId(null);
      setDraft(EMPTY);
    }
  };

  const handlePhoto = async (candidateId, file) => {
    if (!file || !organizerId) return;
    if (!file.type.startsWith("image/")) {
      toast({
        title: "Fichier invalide",
        description: "Veuillez sélectionner une image.",
        variant: "destructive",
      });
      return;
    }
    setUploadingId(candidateId);
    try {
      const validation = validateImage(file);
      if (!validation.isValid) {
        toast({
          title: "Image invalide",
          description: validation.message,
          variant: "destructive",
        });
        return;
      }
      const processed = await processImage(file, {
        maxSizeMB: 1,
        maxWidthOrHeight: 800,
        fileType: "image/jpeg",
      });
      const fileName = `${Date.now()}-${uuidv4()}.jpg`;
      const path = `voting/${organizerId}/candidates/${fileName}`;
      const { error: upErr } = await supabase.storage
        .from("media")
        .upload(path, processed, {
          cacheControl: "3600",
          upsert: true,
          contentType: "image/jpeg",
        });
      if (upErr) throw upErr;
      const {
        data: { publicUrl },
      } = supabase.storage.from("media").getPublicUrl(path);
      const { error: updErr } = await supabase
        .from("candidates")
        .update({ photo_url: publicUrl })
        .eq("id", candidateId);
      if (updErr) throw updErr;
      if (alive.current)
        setCandidates((prev) =>
          prev.map((c) => (c.id === candidateId ? { ...c, photo_url: publicUrl } : c)),
        );
      toast({ title: "Photo mise à jour", className: "bg-green-600 text-white" });
    } catch (e) {
      console.error("Erreur upload photo candidat:", e);
      toast({
        title: "Erreur",
        description: e.message || "Impossible de mettre à jour la photo.",
        variant: "destructive",
      });
    } finally {
      if (alive.current) setUploadingId(null);
    }
  };

  const pickPhoto = (candidateId) => {
    const input = document.getElementById(`cand-photo-${candidateId}`);
    if (input) input.click();
  };

  const handleSave = async () => {
    const name = draft.name.trim();
    if (!name) {
      toast({
        title: "Nom requis",
        description: "Le candidat doit avoir un nom.",
        variant: "destructive",
      });
      return;
    }
    setSaving(true);
    try {
      const body = {
        name,
        description: draft.description.trim() || null,
        category: draft.category.trim() || null,
      };
      if (editingId === "new") {
        const { data, error } = await supabase
          .from("candidates")
          .insert({
            ...body,
            event_id: eventId,
            vote_count: 0,
            created_at: new Date().toISOString(),
          })
          .select("*")
          .single();
        if (error) throw error;
        if (alive.current)
          setCandidates((prev) =>
            [...prev, data].sort(
              (a, b) => new Date(a.created_at) - new Date(b.created_at),
            ),
          );
        toast({
          title: "Candidat ajouté",
          description: `${name} participe maintenant au concours.`,
          className: "bg-green-600 text-white",
        });
      } else {
        const { error } = await supabase
          .from("candidates")
          .update(body)
          .eq("id", editingId);
        if (error) throw error;
        if (alive.current)
          setCandidates((prev) =>
            prev.map((c) => (c.id === editingId ? { ...c, ...body } : c)),
          );
        toast({
          title: "Candidat mis à jour",
          className: "bg-green-600 text-white",
        });
      }
      reset();
    } catch (e) {
      console.error("Erreur enregistrement candidat:", e);
      toast({
        title: "Erreur",
        description: e.message || "Impossible d'enregistrer le candidat.",
        variant: "destructive",
      });
    } finally {
      if (alive.current) setSaving(false);
    }
  };

  const handleDelete = async (cand) => {
    if (!cand?.id) return;
    setDeletingId(cand.id);
    try {
      const { error } = await supabase.from("candidates").delete().eq("id", cand.id);
      if (error) throw error;
      if (alive.current) {
        setCandidates((prev) => prev.filter((c) => c.id !== cand.id));
        if (editingId === cand.id) reset();
      }
      const votes = Number(cand.vote_count) || 0;
      toast({
        title: "Candidat retiré",
        description:
          votes > 0
            ? `${cand.name} a été retiré. Ses ${votes} voix ne sont plus comptées.`
            : `${cand.name} a été retiré du concours.`,
        className: "bg-green-600 text-white",
      });
    } catch (e) {
      console.error("Erreur suppression candidat:", e);
      toast({
        title: "Erreur",
        description: e.message || "Impossible de retirer le candidat.",
        variant: "destructive",
      });
    } finally {
      if (alive.current) setDeletingId(null);
    }
  };

  const rowCls =
    "flex items-center gap-3 bg-white/5 p-2 rounded-lg border border-white/10";

  return (
    <div className="flex flex-col gap-3 bg-black/20 p-3 rounded-lg border border-white/10">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="font-medium text-white">{title}</p>
          <p className="text-[10px] text-gray-400 mt-1">
            {canEdit
              ? "Ajoutez, renommez ou retirez des candidats. Les voix déjà reçues restent acquises."
              : "Candidats en lice pour ce concours."}
          </p>
        </div>
        {canEdit && (
          <Button
            size="sm"
            variant="outline"
            className="border-purple-600/50 text-purple-400 hover:bg-purple-900/30 whitespace-nowrap shrink-0"
            onClick={() => {
              setEditingId("new");
              setDraft(EMPTY);
            }}
            disabled={editingId === "new"}
          >
            <Plus className="w-3.5 h-3.5 mr-1" />
            Candidat
          </Button>
        )}
      </div>

      {editingId === "new" && (
        <div className="flex flex-col gap-2 bg-purple-950/20 p-3 rounded-lg border border-purple-800/40">
          <Input
            value={draft.name}
            onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
            placeholder="Nom du candidat"
            className="bg-gray-900 border-gray-700 text-white"
            maxLength={120}
          />
          <Input
            value={draft.category}
            onChange={(e) => setDraft((d) => ({ ...d, category: e.target.value }))}
            placeholder="Catégorie (facultatif)"
            className="bg-gray-900 border-gray-700 text-white"
            maxLength={80}
          />
          <Textarea
            value={draft.description}
            onChange={(e) => setDraft((d) => ({ ...d, description: e.target.value }))}
            placeholder="Présentation (facultatif)"
            className="bg-gray-900 border-gray-700 text-white min-h-[70px]"
            maxLength={600}
          />
          <div className="flex gap-2 justify-end">
            <Button
              size="sm"
              variant="ghost"
              className="text-gray-400"
              onClick={reset}
              disabled={saving}
            >
              <X className="w-3.5 h-3.5 mr-1" />
              Annuler
            </Button>
            <Button
              size="sm"
              className="bg-purple-600 hover:bg-purple-700"
              onClick={handleSave}
              disabled={saving || !draft.name.trim()}
            >
              {saving ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Save className="w-3.5 h-3.5" />
              )}
            </Button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center text-gray-400 py-2">
          <Loader2 className="w-5 h-5 animate-spin mr-2" />
          Chargement...
        </div>
      ) : candidates.length === 0 ? (
        <p className="text-[11px] text-gray-400">Aucun candidat pour ce concours.</p>
      ) : (
        <div
          className={
            compact
              ? "flex flex-col gap-2"
              : "flex flex-col gap-2 max-h-64 overflow-y-auto pr-1"
          }
        >
          {candidates.map((cand) => {
            const votes = Number(cand.vote_count) || 0;
            const isEditing = editingId === cand.id;
            return (
              <div key={cand.id} className={rowCls}>
                <img
                  src={cand.photo_url || "/api/placeholder/64/64"}
                  alt={cand.name}
                  className="w-12 h-12 rounded-lg object-cover shrink-0"
                  onError={(e) => {
                    e.target.onerror = null;
                    e.target.src = "/api/placeholder/64/64";
                  }}
                />
                {isEditing ? (
                  <div className="flex flex-col gap-2 flex-1 min-w-0">
                    <Input
                      value={draft.name}
                      onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
                      className="bg-gray-900 border-gray-700 text-white h-8 text-sm"
                      maxLength={120}
                    />
                    <Input
                      value={draft.category}
                      onChange={(e) => setDraft((d) => ({ ...d, category: e.target.value }))}
                      placeholder="Catégorie"
                      className="bg-gray-900 border-gray-700 text-white h-8 text-sm"
                      maxLength={80}
                    />
                  </div>
                ) : (
                  <div className="flex flex-col min-w-0 flex-1">
                    <span className="text-white text-sm font-medium truncate">
                      {cand.name}
                    </span>
                    <span className="text-[10px] text-gray-400">
                      {cand.category ? `${cand.category} · ` : ""}
                      {votes} voix
                    </span>
                  </div>
                )}

                {isEditing ? (
                  <Button
                    size="sm"
                    className="bg-purple-600 hover:bg-purple-700"
                    onClick={handleSave}
                    disabled={saving || !draft.name.trim()}
                  >
                    {saving ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Save className="w-3.5 h-3.5" />
                    )}
                  </Button>
                ) : (
                  <>
                    <input
                      id={`cand-photo-${cand.id}`}
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) handlePhoto(cand.id, file);
                        e.target.value = "";
                      }}
                    />
                    <Button
                      size="sm"
                      variant="outline"
                      className="border-purple-600/50 text-purple-400 hover:bg-purple-900/30 whitespace-nowrap"
                      onClick={() => pickPhoto(cand.id)}
                      disabled={uploadingId === cand.id}
                      title="Remplacer la photo"
                    >
                      {uploadingId === cand.id ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <ImageIcon className="w-3.5 h-3.5" />
                      )}
                    </Button>
                    {canEdit && (
                      <>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="text-purple-400 hover:bg-purple-900/30 shrink-0"
                          onClick={() => {
                            setEditingId(cand.id);
                            setDraft({
                              name: cand.name || "",
                              description: cand.description || "",
                              category: cand.category || "",
                            });
                          }}
                          title="Modifier"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="text-red-400 hover:bg-red-900/30 shrink-0"
                          onClick={() => handleDelete(cand)}
                          disabled={deletingId === cand.id}
                          title="Retirer du concours"
                        >
                          {deletingId === cand.id ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          ) : (
                            <Trash2 className="w-3.5 h-3.5" />
                          )}
                        </Button>
                      </>
                    )}
                  </>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
