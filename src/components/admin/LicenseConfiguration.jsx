import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '@/lib/customSupabaseClient';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from '@/components/ui/use-toast';
import { Loader2, Edit2, Check, X, ShieldCheck, RefreshCw, Save } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

const LicenseConfiguration = ({ onUpdate }) => {
  const [licenses, setLicenses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState(null);
  const [editForm, setEditForm] = useState({});
  const [isSaving, setIsSaving] = useState(false);
  const subscriptionRef = useRef(null);

  // Configuration de référence pour la validation
  const licenseConfig = {
    starter: { min: 10000000, max: 2000000, duration: 2, rate: 20 },
    business: { min: 30000000, max: 5000000, duration: 3, rate: 30 },
    premium: { min: 50000000, max: 10000000, duration: 5, rate: 40 }
  };

  useEffect(() => {
    fetchLicenses();

    // 5) Add real-time Supabase subscription
    const channel = supabase
      .channel('admin-license-changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'partner_license_packs' },
        (payload) => {
          console.log('🔄 Changement détecté en temps réel:', payload);
          // 7) Clear cache/refetch immediately
          fetchLicenses();
          if (onUpdate) onUpdate();
        }
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          console.log('✅ Abonné aux changements de licences');
        }
      });

    subscriptionRef.current = channel;

    return () => {
      if (subscriptionRef.current) {
        supabase.removeChannel(subscriptionRef.current);
      }
    };
  }, []);

  const fetchLicenses = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('partner_license_packs')
        .select('*')
        .order('display_order', { ascending: true });

      if (error) throw error;

      if (!data || data.length === 0) {
        await createDefaultLicenses();
      } else {
        setLicenses(data);
      }
    } catch (error) {
      console.error("Error fetching licenses:", error);
      toast({ title: "Erreur", description: "Impossible de charger les licences.", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const createDefaultLicenses = async () => {
    try {
      const defaults = [
        {
          name: 'STARTER',
          slug: 'starter-license',
          coverage_type: 'ville',
          fcfa_price: 1000000,
          revenue_share_percent: 2, // 2% des 10%
          duration_days: 365,
          duration_years: 1,
          duration_months: 12,
          is_active: true,
          description: 'Concession Ville - 1 an',
          level: 'starter',
          display_order: 1,
          benefits: JSON.stringify(["Droit d'implanter un local / siège social dans la localité de l'administrateur", "Exclusivité Ville", "2% sur la commission plateforme (10%)", "Durée 1 an", "Support standard"])
        },
        {
          name: 'BUSINESS',
          slug: 'business-license',
          coverage_type: 'region',
          fcfa_price: 3000000,
          revenue_share_percent: 3, // 3% des 10%
          duration_days: 2 * 365,
          duration_years: 2,
          duration_months: 24,
          is_active: true,
          description: 'Concession Régionale - 2 ans',
          level: 'business',
          display_order: 2,
          benefits: JSON.stringify(["Droit d'implanter un local / siège social dans la localité de l'administrateur", "Exclusivité Région", "3% sur la commission plateforme (10%)", "Durée 2 ans", "Support prioritaire"])
        },
        {
          name: 'PREMIUM',
          slug: 'premium-license',
          coverage_type: 'pays',
          fcfa_price: 5000000,
          revenue_share_percent: 4, // 4% des 10%
          duration_days: 3 * 365,
          duration_years: 3,
          duration_months: 36,
          is_active: true,
          description: 'Concession Nationale - 3 ans',
          level: 'premium',
          display_order: 3,
          benefits: JSON.stringify(["Droit d'implanter un local / siège social dans la localité de l'administrateur", "Exclusivité Pays", "4% sur la commission plateforme (10%)", "Durée 3 ans", "Support VIP"])
        }
      ];

      const { error } = await supabase.from('partner_license_packs').insert(defaults);
      if (error) throw error;
      fetchLicenses();
      toast({ title: "Initialisation", description: "Licences par défaut créées.", variant: "success" });
    } catch (e) {
      console.error(e);
    }
  };

  const handleEdit = (license) => {
    console.log("📝 Édition de la licence:", license.name);
    setEditingId(license.id);
    // 9) Capture current values accurately
    const durationYears = Number(license.duration_years) || Math.round(Number(license.duration_days || 0) / 365);
    setEditForm({ 
      ...license,
      duration_years: durationYears,
      duration_months: durationYears * 12
    });
  };

  const handleCancel = () => {
    setEditingId(null);
    setEditForm({});
  };

  const handleSave = async () => {
    // 1) Ensure data actually updates
    setIsSaving(true);
    
    // Parse values to ensure correct types
    const price = parseInt(editForm.fcfa_price, 10);
    const revenueShare = parseFloat(editForm.revenue_share_percent);
    const durationYears = Math.max(1, parseInt(editForm.duration_years, 10) || 1);
    const durationDays = durationYears * 365;

    // 2) Payload logging for debugging. On met à jour les trois colonnes de
    // durée : la page publique lit duration_years/duration_months quand ils
    // existent, et duration_days reste la source utilisée par les expirations.
    const payload = {
      name: editForm.name,
      coverage_type: editForm.coverage_type,
      fcfa_price: price,
      revenue_share_percent: revenueShare,
      duration_days: durationDays,
      duration_years: durationYears,
      duration_months: durationYears * 12,
      is_active: editForm.is_active,
      description: editForm.description
    };

    console.log("💾 Sauvegarde en cours avec payload:", payload);

    try {
      // 3) Verify UPDATE query
      const { data, error } = await supabase
        .from('partner_license_packs')
        .update(payload)
        .eq('id', editingId)
        .select(); // Select to confirm update

      if (error) throw error;

      if (!data || data.length === 0) {
        throw new Error("La mise à jour a réussi mais aucune donnée n'a été retournée. Vérifiez l'ID.");
      }

      console.log("✅ Mise à jour réussie:", data[0]);

      toast({ 
        title: "Succès", 
        description: `Licence ${data[0].name} mise à jour avec succès.`, 
        variant: "success" 
      });
      
      setEditingId(null);
      
      // 4) Force refresh via fetch (Realtime will also trigger, but this is immediate safety)
      await fetchLicenses();
      
      // 6) Trigger parent callback
      if (onUpdate) onUpdate(); 

    } catch (error) {
      // 2) Proper error handling
      console.error("❌ Erreur de sauvegarde:", error);
      toast({ 
        title: "Erreur Critique", 
        description: "Échec de la sauvegarde: " + (error.message || error.details), 
        variant: "destructive" 
      });
    } finally {
      setIsSaving(false);
    }
  };

  const formatPrice = (p) => new Intl.NumberFormat('fr-FR').format(p) + ' FCFA';

  const formatDurationLabel = (license) => {
    const years = Number(license?.duration_years) || Math.round(Number(license?.duration_days || 0) / 365);
    return `${years} an${years > 1 ? 's' : ''}`;
  };

  // 8) Visual feedback helper
  const isChanged = (field) => {
    if (!editingId) return false;
    const original = licenses.find(l => l.id === editingId);
    if (!original) return false;
    // Loose comparison for strings vs numbers
    return original[field] != editForm[field]; 
  };

  // Special check for duration derived field
  const isDurationChanged = () => {
    if (!editingId) return false;
    const original = licenses.find(l => l.id === editingId);
    if (!original) return false;
    return Math.round(original.duration_days / 365) != editForm.duration_years;
  };

  if (loading && licenses.length === 0) return <div className="p-8 flex justify-center"><Loader2 className="animate-spin text-indigo-600" /></div>;

  return (
    <Card className="mt-6 border-indigo-100 shadow-md">
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <div className="space-y-1">
          <CardTitle className="flex items-center gap-2 text-indigo-900">
            <ShieldCheck className="w-5 h-5" /> Configuration des Licences (Offres)
          </CardTitle>
          <CardDescription>
            Modifiez les paramètres des packs de licences. Ces modifications sont <span className="font-bold text-indigo-600">immédiates</span> pour les nouveaux achats.
          </CardDescription>
        </div>
        <Button variant="outline" size="sm" onClick={fetchLicenses} title="Forcer le rafraîchissement">
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
        </Button>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nom (Niveau)</TableHead>
              <TableHead>Territoire</TableHead>
              <TableHead>Prix (FCFA)</TableHead>
              <TableHead>Commission (% des 10%)</TableHead>
              <TableHead>Durée (Ans)</TableHead>
              <TableHead>Statut</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {licenses.map((license) => {
              const isEditing = editingId === license.id;
              return (
                <TableRow key={license.id} className={isEditing ? "bg-indigo-50/50" : ""}>
                  {/* Name */}
                  <TableCell className="font-bold">
                    {license.name}
                  </TableCell>

                  {/* Territory */}
                  <TableCell>
                    {isEditing ? (
                      <Select 
                        value={editForm.coverage_type} 
                        onValueChange={v => setEditForm({...editForm, coverage_type: v})}
                      >
                        <SelectTrigger className={`h-8 w-[140px] ${isChanged('coverage_type') ? 'border-orange-400 bg-orange-50' : ''}`}>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="ville">Ville</SelectItem>
                          <SelectItem value="region">Région</SelectItem>
                          <SelectItem value="pays">Pays</SelectItem>
                        </SelectContent>
                      </Select>
                    ) : (
                      <Badge variant="outline" className="capitalize">{license.coverage_type}</Badge>
                    )}
                  </TableCell>

                  {/* Price */}
                  <TableCell>
                    {isEditing ? (
                      <Input 
                        type="number" 
                        value={editForm.fcfa_price} 
                        onChange={e => setEditForm({...editForm, fcfa_price: e.target.value})}
                        className={`h-8 w-32 font-mono ${isChanged('fcfa_price') ? 'border-orange-400 bg-orange-50' : ''}`}
                      />
                    ) : (
                      <span className="font-mono text-indigo-700 font-bold">{formatPrice(license.fcfa_price)}</span>
                    )}
                  </TableCell>

                  {/* Commission */}
                  <TableCell>
                    {isEditing ? (
                      <div className="flex items-center gap-1">
                        <Input 
                          type="number" 
                          step="0.1"
                          value={editForm.revenue_share_percent} 
                          onChange={e => setEditForm({...editForm, revenue_share_percent: e.target.value})}
                          className={`h-8 w-20 text-center ${isChanged('revenue_share_percent') ? 'border-orange-400 bg-orange-50' : ''}`}
                        />
                        <span className="text-xs text-muted-foreground whitespace-nowrap">% des 10%</span>
                      </div>
                    ) : (
                      <Badge variant="secondary" className="bg-green-100 text-green-800 border-green-200">
                        {license.revenue_share_percent}%
                      </Badge>
                    )}
                  </TableCell>

                  {/* Duration */}
                  <TableCell>
                    {isEditing ? (
                      <div className="flex items-center gap-1">
                        <Input 
                          type="number" 
                          value={editForm.duration_years} 
                          onChange={e => setEditForm({...editForm, duration_years: e.target.value})}
                          className={`h-8 w-16 text-center ${isDurationChanged() ? 'border-orange-400 bg-orange-50' : ''}`}
                        />
                        <span className="text-xs">ans</span>
                      </div>
                    ) : (
                      <span>{formatDurationLabel(license)}</span>
                    )}
                  </TableCell>

                  {/* Active */}
                  <TableCell>
                    {isEditing ? (
                      <div className="flex items-center gap-2">
                        <input 
                          type="checkbox" 
                          checked={editForm.is_active} 
                          onChange={e => setEditForm({...editForm, is_active: e.target.checked})}
                          className={`h-4 w-4 ${isChanged('is_active') ? 'ring-2 ring-orange-400 rounded-sm' : ''}`}
                        />
                        <span className="text-xs">{editForm.is_active ? 'Actif' : 'Inactif'}</span>
                      </div>
                    ) : (
                      <Badge variant={license.is_active ? "success" : "secondary"}>
                        {license.is_active ? "Actif" : "Inactif"}
                      </Badge>
                    )}
                  </TableCell>

                  {/* Actions */}
                  <TableCell className="text-right">
                    {isEditing ? (
                      <div className="flex justify-end gap-2">
                        <Button 
                          size="sm" 
                          variant="ghost" 
                          className="h-8 w-8 p-0 text-red-500 hover:bg-red-50" 
                          onClick={handleCancel}
                          disabled={isSaving}
                        >
                          <X className="w-4 h-4" />
                        </Button>
                        <Button 
                          size="sm" 
                          variant="ghost" 
                          className="h-8 w-8 p-0 text-green-600 hover:bg-green-50" 
                          onClick={handleSave}
                          disabled={isSaving}
                        >
                          {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                        </Button>
                      </div>
                    ) : (
                      <Button size="sm" variant="ghost" onClick={() => handleEdit(license)}>
                        <Edit2 className="w-4 h-4 text-gray-500" />
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
};

export default LicenseConfiguration;