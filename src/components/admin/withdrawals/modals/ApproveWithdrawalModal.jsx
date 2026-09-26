import React, { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, CheckCircle, AlertTriangle } from "lucide-react";
import { supabase } from "@/lib/customSupabaseClient";
import { toast } from '@/components/ui/use-toast';

const ApproveWithdrawalModal = ({ isOpen, onClose, event, metrics, adminId, onConfirm }) => {
  const [loading, setLoading] = useState(false);
  const [notes, setNotes] = useState("");
  const [realTimeTotal, setRealTimeTotal] = useState(0);
  const [calculating, setCalculating] = useState(false);

  useEffect(() => {
    if (isOpen && event?.id) {
      calculateRealTimeTotal();
    }
  }, [isOpen, event?.id]);

  const calculateRealTimeTotal = async () => {
    setCalculating(true);
    try {
      // CORRECTION: Utilisation de total_amount_pi
      const { data, error } = await supabase
        .from('tickets')
        .select('total_amount_pi') 
        .eq('event_id', event.id)
        .neq('status', 'refunded');

      if (error) throw error;

      // Aggregation using total_amount_pi
      const total = (data || []).reduce((sum, t) => sum + (t.total_amount_pi || 0), 0);
      setRealTimeTotal(total);
    } catch (err) {
      console.error("Error fetching ticket totals:", err);
    } finally {
      setCalculating(false);
    }
  };

  const handleApprove = async () => {
    setLoading(true);
    try {
      // 1. Log validation
      const { error: logError } = await supabase
        .from('event_validation_status')
        .insert({
          event_id: event.id,
          event_type: 'withdrawal',
          validation_step: 'withdrawal',
          status: 'VALIDE',
          admin_notes: notes,
          validated_by: adminId,
          validated_at: new Date()
        });

      if (logError) throw logError;

      // 2. Update Pending Withdrawal if exists (Optional, depending on flow)
      // Usually approval moves it to 'APPROVED' or processes payment via other means
      
      toast({
        title: "Retrait approuvé",
        description: "Le statut a été mis à jour avec succès.",
        className: "bg-green-600 text-white"
      });
      
      onConfirm();
      onClose();
    } catch (err) {
      console.error("Error approving:", err);
      toast({
        title: "Erreur",
        description: "Impossible d'approuver le retrait: " + err.message,
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const fees = Math.ceil(realTimeTotal * 0.05);
  const netAmount = realTimeTotal - fees;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[500px] bg-gray-900 border-gray-700 text-white">
        <DialogHeader>
          <DialogTitle className="text-green-400 flex items-center gap-2">
            <CheckCircle className="h-5 w-5" />
            Valider le retrait
          </DialogTitle>
          <DialogDescription className="text-gray-400">
            Vous êtes sur le point de valider la demande de retrait pour <strong>{event?.title}</strong>.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="grid grid-cols-2 gap-4 p-4 bg-gray-800 rounded-lg border border-gray-700">
            <div>
              <p className="text-xs text-gray-400">Total Brut (Live)</p>
              <p className="text-xl font-bold text-white">
                {calculating ? <Loader2 className="h-4 w-4 animate-spin" /> : `${realTimeTotal} π`}
              </p>
            </div>
            <div>
              <p className="text-xs text-gray-400">Net Organisateur (90%)</p>
              <p className="text-xl font-bold text-green-400">
                {calculating ? "..." : `${netAmount} π`}
              </p>
            </div>
            <div className="col-span-2 border-t border-gray-700 pt-2 mt-2">
              <p className="text-xs text-gray-400 flex justify-between">
                <span>Frais Plateforme (10%)</span>
                <span>{fees} π</span>
              </p>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="notes">Note de validation (Optionnel)</Label>
            <Textarea
              id="notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Ex: Validation OK, virement effectué..."
              className="bg-gray-800 border-gray-600 text-white"
            />
          </div>

          {metrics?.thresholdStatus === 'critical' && (
            <div className="flex items-center gap-2 p-3 bg-amber-900/20 border border-amber-800 rounded text-amber-200 text-sm">
              <AlertTriangle className="h-4 w-4 flex-shrink-0" />
              <p>Attention : Le taux de scan est faible ({metrics.scanPercentage}%). Vérifiez avant de valider.</p>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={loading}>
            Annuler
          </Button>
          <Button 
            onClick={handleApprove} 
            disabled={loading || calculating}
            className="bg-green-600 hover:bg-green-700 text-white"
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <CheckCircle className="h-4 w-4 mr-2" />}
            Confirmer la validation
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default ApproveWithdrawalModal;