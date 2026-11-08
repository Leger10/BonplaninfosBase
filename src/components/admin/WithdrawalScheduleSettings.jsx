import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Calendar, Trash2, Save, Loader2 } from 'lucide-react';
import { toast } from '@/components/ui/use-toast';
import { supabase } from '@/lib/customSupabaseClient';

const WithdrawalScheduleSettings = () => {
  const [dates, setDates] = useState([5]);
  const [configRow, setConfigRow] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchConfig();
  }, []);

  const fetchConfig = async () => {
    try {
      const { data, error } = await supabase
        .from('admin_withdrawal_config')
        .select('*')
        .limit(1)
        .maybeSingle();

      if (error) throw error;
      if (data) {
        setConfigRow(data);
        if (Array.isArray(data.withdrawal_dates) && data.withdrawal_dates.length) {
          setDates([...data.withdrawal_dates].map(Number).filter(Boolean).sort((a, b) => a - b));
        }
      }
    } catch (error) {
      console.error("Error fetching withdrawal schedule:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleAddDate = (day) => {
    if (!dates.includes(day)) {
      setDates(prev => [...prev, day].sort((a, b) => a - b));
    }
  };

  const handleRemoveDate = (day) => {
    if (dates.length <= 1) {
        toast({ title: "Attention", description: "Il doit y avoir au moins une date de retrait.", variant: "warning" });
        return;
    }
    setDates(prev => prev.filter(d => d !== day));
  };

  const handleSave = async () => {
    if (!dates.length) {
      toast({ title: "Attention", description: "Sélectionnez au moins un jour de retrait.", variant: "warning" });
      return;
    }
    setSaving(true);
    try {
      const existing = configRow?.id
        ? configRow
        : (await supabase.from('admin_withdrawal_config').select('*').limit(1).maybeSingle()).data;

      const sorted = [...dates].map(Number).filter((n) => n >= 1 && n <= 31).sort((a, b) => a - b);
      const payload = {
        withdrawal_dates: sorted,
        withdrawal_available_date: Number(existing?.withdrawal_available_date ?? sorted[0] ?? 5),
        min_withdrawal_amount: Number(existing?.min_withdrawal_amount ?? 1000),
        max_withdrawal_amount: Number(existing?.max_withdrawal_amount ?? 500000),
        min_withdrawal_pi: Number(existing?.min_withdrawal_pi ?? 50),
        withdrawal_methods: existing?.withdrawal_methods ?? ['Orange Money', 'Bank Transfer'],
      };

      let error;
      if (existing?.id) {
        ({ error } = await supabase.from('admin_withdrawal_config').update(payload).eq('id', existing.id));
      } else {
        ({ error } = await supabase.from('admin_withdrawal_config').insert([payload]));
      }

      if (error) throw error;
      toast({ title: "Succès", description: "Calendrier des retraits mis à jour.", variant: "success" });
      fetchConfig();
    } catch (error) {
      console.error("Error saving schedule:", error);
      toast({ title: "Erreur", description: error?.message || "Impossible de sauvegarder le calendrier.", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="p-4 flex justify-center"><Loader2 className="animate-spin" /></div>;

  return (
    <Card className="border-indigo-100 shadow-md">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-indigo-900">
          <Calendar className="w-5 h-5" /> Calendrier des Retraits (Créateurs & Admins)
        </CardTitle>
        <CardDescription>
          Définissez les jours du mois où les demandes de retrait sont autorisées (ex: 5, 15, 25).
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-6">
          <div className="flex flex-wrap gap-2 mb-4">
            {dates.map(day => (
              <Badge key={day} variant="secondary" className="px-3 py-1 text-lg flex items-center gap-2 bg-indigo-50 text-indigo-700 border-indigo-200">
                Le {day} du mois
                <button onClick={() => handleRemoveDate(day)} className="hover:text-red-500 transition-colors">
                  <Trash2 className="w-4 h-4" />
                </button>
              </Badge>
            ))}
          </div>

          <div className="grid grid-cols-7 gap-2 max-w-md">
            {Array.from({ length: 31 }, (_, i) => i + 1).map(day => (
              <Button
                key={day}
                variant={dates.includes(day) ? "default" : "outline"}
                size="sm"
                onClick={() => dates.includes(day) ? handleRemoveDate(day) : handleAddDate(day)}
                className={`h-8 w-8 p-0 ${dates.includes(day) ? 'bg-indigo-600' : 'text-gray-500'}`}
              >
                {day}
              </Button>
            ))}
          </div>

          <div className="flex justify-end pt-4 border-t">
            <Button onClick={handleSave} disabled={saving} className="bg-indigo-600 hover:bg-indigo-700">
              {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
              Sauvegarder le Calendrier
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

export default WithdrawalScheduleSettings;