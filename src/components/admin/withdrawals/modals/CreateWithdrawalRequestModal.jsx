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
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, PlayCircle } from "lucide-react";
import { supabase } from "@/lib/customSupabaseClient";
import { toast } from '@/components/ui/use-toast';

const CreateWithdrawalRequestModal = ({ isOpen, onClose, event, metrics, adminId, onConfirm }) => {
  const [loading, setLoading] = useState(false);
  const [amount, setAmount] = useState(0);
  const [method, setMethod] = useState("orange_money");
  const [maxAmount, setMaxAmount] = useState(0);
  const [calculating, setCalculating] = useState(false);

  useEffect(() => {
    if (isOpen && event?.id) {
      calculateMaxAmount();
    }
  }, [isOpen, event?.id]);

  const calculateMaxAmount = async () => {
    setCalculating(true);
    try {
      // CORRECTION: Utilisation de total_amount_pi
      const { data, error } = await supabase
        .from('tickets')
        .select('total_amount_pi')
        .eq('event_id', event.id)
        .neq('status', 'refunded');

      if (error) throw error;

      // Aggregation based on total_amount_pi
      const total = (data || []).reduce((sum, t) => sum + (t.total_amount_pi || 0), 0);
      const netEstimate = Math.floor(total * 0.9); // 90% for organizer
      
      setMaxAmount(netEstimate);
      setAmount(netEstimate); // Default to max
    } catch (err) {
      console.error("Error calculating max amount:", err);
    } finally {
      setCalculating(false);
    }
  };

  const handleSubmit = async () => {
    if (amount <= 0 || amount > maxAmount) {
      toast({ title: "Montant invalide", description: "Vérifiez le montant.", variant: "destructive" });
      return;
    }

    setLoading(true);
    try {
      // 1. Create request
      // We assume there's a table or function to handle this manually initiated request
      const { error } = await supabase
        .from('pending_withdrawals') // Assuming this table exists based on context
        .insert({
          event_id: event.id,
          organizer_id: event.organizer_id,
          amount_pi: amount,
          amount_fcfa: amount * 10, // Assuming 10 FCFA rate
          status: 'PENDING',
          created_at: new Date()
        });

      if (error) throw error;

      // 2. Log manual creation
      await supabase.from('event_validation_status').insert({
        event_id: event.id,
        event_type: 'withdrawal',
        validation_step: 'withdrawal',
        status: 'EN_ATTENTE',
        admin_notes: `Demande crǸǸe manuellement par Admin pour ${amount} �?`,
        validated_by: adminId,
        validated_at: new Date()
      });

      toast({
        title: "Demande créée",
        description: "La demande de retrait a été initiée avec succès.",
        className: "bg-blue-600 text-white"
      });
      
      onConfirm();
      onClose();
    } catch (err) {
      console.error("Error creating request:", err);
      toast({
        title: "Erreur",
        description: "Impossible de créer la demande: " + err.message,
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[425px] bg-gray-900 border-gray-700 text-white">
        <DialogHeader>
          <DialogTitle className="text-blue-400 flex items-center gap-2">
            <PlayCircle className="h-5 w-5" />
            Créer une demande de retrait
          </DialogTitle>
          <DialogDescription className="text-gray-400">
            Initier manuellement un retrait pour l'organisateur.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-4">
          <div className="grid gap-2">
            <Label htmlFor="amount">Montant à retirer (Max: {calculating ? "..." : maxAmount} π)</Label>
            <Input
              id="amount"
              type="number"
              value={amount}
              onChange={(e) => setAmount(Number(e.target.value))}
              className="bg-gray-800 border-gray-600 text-white"
              max={maxAmount}
            />
          </div>
          
          <div className="grid gap-2">
            <Label>Méthode de paiement (Simulée)</Label>
            <Select value={method} onValueChange={setMethod}>
              <SelectTrigger className="bg-gray-800 border-gray-600 text-white">
                <SelectValue placeholder="Choisir méthode" />
              </SelectTrigger>
              <SelectContent className="bg-gray-800 border-gray-700 text-white">
                <SelectItem value="orange_money">Orange Money</SelectItem>
                <SelectItem value="moov_money">Moov Money</SelectItem>
                <SelectItem value="wave">Wave</SelectItem>
                <SelectItem value="bank">Virement Bancaire</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={loading}>
            Annuler
          </Button>
          <Button 
            onClick={handleSubmit} 
            disabled={loading || calculating || amount <= 0}
            className="bg-blue-600 hover:bg-blue-700 text-white"
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
            Créer la demande
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default CreateWithdrawalRequestModal;