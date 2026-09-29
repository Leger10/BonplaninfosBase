import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import * as XLSX from "xlsx";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription
} from '@/components/ui/dialog';
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  QrCode, LogIn, LogOut, History, Scan, FileSpreadsheet, Trash2, User, Wallet, RotateCcw, Search, Loader2, RefreshCw, Calendar, CalendarDays
} from 'lucide-react';
import { supabase } from '@/lib/customSupabaseClient';
import QrScanner from '@/components/event/QrScanner';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import { useToast } from '@/components/ui/use-toast';

export default function TicketScannerDialog({ 
  isOpen, 
  onClose, 
  eventId,
  eventEndDate
}) {

  const { toast } = useToast();

  const [activeTab, setActiveTab] = useState('entry');
  const [scanResult, setScanResult] = useState(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [scanHistory, setScanHistory] = useState([]);
  const [flashColor, setFlashColor] = useState(null);
  const [manualCode, setManualCode] = useState('');
  const [isResetting, setIsResetting] = useState(false);
  const [debugInfo, setDebugInfo] = useState(null);

  const lockedRef = useRef(false);

  const isEventFinished = useMemo(() => {
    if (!eventEndDate) return false;
    return new Date(eventEndDate) < new Date();
  }, [eventEndDate]);

  const formattedEndDate = useMemo(() => {
    if (!eventEndDate) return '';
    return new Date(eventEndDate).toLocaleDateString('fr-FR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric'
    });
  }, [eventEndDate]);

  const sounds = useRef({
    entry: new Audio('/sounds/entry.mp3'),
    exit: new Audio('/sounds/exit.mp3'),
    error: new Audio('/sounds/error.mp3'),
  });

  const playFeedback = (type) => {
    sounds.current[type]?.play().catch(() => {});
    if (navigator.vibrate) {
      if (type === 'error') {
        navigator.vibrate(500);
      } else if (type === 'exit') {
        navigator.vibrate([40, 30, 40]);
      } else {
        navigator.vibrate(150);
      }
    }
    setFlashColor(type === 'error' ? 'red' : 'green');
    setTimeout(() => setFlashColor(null), 300);
  };

  useEffect(() => {
    if (isOpen) {
      setScanResult(null);
      setManualCode('');
      setDebugInfo(null);
      lockedRef.current = false;
    }
  }, [isOpen]);

  // FORCER LA SYNCHRONISATION
  const forceSync = () => {
    localStorage.removeItem('offline_scans');
    setScanHistory([]);
    setScanResult(null);
    setManualCode('');
    setDebugInfo(null);
    toast({
      title: "🔄 Synchronisation forcée",
      description: "Cache vidé, données synchronisées avec la base.",
      variant: "default",
      className: "bg-green-600 text-white border-none"
    });
  };

  const saveOffline = (scan) => {
    const list = JSON.parse(localStorage.getItem('offline_scans') || '[]');
    list.push(scan);
    localStorage.setItem('offline_scans', JSON.stringify(list));
  };

  const clearHistory = () => {
    setScanHistory([]);
    localStorage.removeItem('offline_scans');
  };

  // NORMALISER LA RÉPONSE RPC
 const normalizeRPCResponse = (data) => {
  const raw = Array.isArray(data) ? data[0] : data;
  if (!raw) return null;
  
  const response = raw.verify_ticket_direct || raw;
  
  return {
    success: response.success || false,
    message: response.message || 'Action effectuée',
    status_code: response.status_code || 'unknown',
    status: response.status || 'unknown',
    attendee_name: response.attendee_name || response.ticket?.attendee_name || response.ticket?.customer_name || 'Inconnu',
    phone: response.phone || response.ticket?.phone || null,
    is_guest: response.is_guest || response.isGuest || false,
    isGuest: response.is_guest || response.isGuest || false,
    payment_method: response.payment_method || 'coins',
    transaction_reference: response.transaction_reference || null,
    ticket_type: response.ticket_type || null,
    entry_count: response.entry_count || 0,
    ticket_date: response.ticket_date || null,
    is_multi_day: response.is_multi_day || false,
    valid_dates: response.valid_dates || null  // ✅ AJOUTER CETTE LIGNE
  };
};

  // RÉINITIALISER LE TICKET
  const resetTicketInDatabase = async () => {
    if (!manualCode) {
      toast({
        title: "⚠️ Aucun code",
        description: "Entrez un code de billet à réinitialiser",
        variant: "destructive"
      });
      return;
    }

    setIsResetting(true);

    try {
      const { data, error } = await supabase.rpc('reset_ticket', {
        p_ticket_identifier: manualCode.toUpperCase()
      });

      if (error) throw error;

      toast({
        title: "🔄 Ticket réinitialisé",
        description: `Le ticket ${manualCode.toUpperCase()} a été réinitialisé avec succès`,
        variant: "default",
        className: "bg-green-600 text-white border-none"
      });

      localStorage.removeItem('offline_scans');
      setScanHistory([]);
      setScanResult(null);
      setManualCode('');

    } catch (error) {
      console.error('❌ Erreur:', error);
      toast({
        title: "❌ Erreur",
        description: error.message || "Impossible de réinitialiser le ticket",
        variant: "destructive"
      });
    } finally {
      setIsResetting(false);
    }
  };

  // VÉRIFIER L'ÉTAT DU TICKET
  const checkTicketStatus = async () => {
    if (!manualCode) {
      toast({
        title: "⚠️ Aucun code",
        description: "Entrez un code de billet à vérifier",
        variant: "destructive"
      });
      return;
    }

    try {
      const code = manualCode.trim().toUpperCase();
      
      const { data, error } = await supabase
        .from('tickets')
        .select('qr_code, transaction_reference, ticket_number, status, entry_count, check_in_time, check_out_time, attendee_name, phone, payment_method, ticket_date, is_multi_day, valid_dates')
        .or(`qr_code.ilike.%${code}%,transaction_reference.ilike.%${code}%,ticket_number.ilike.%${code}%`)
        .maybeSingle();

      let ticketData = data;
      if (!ticketData) {
        const { data: exactData, error: exactError } = await supabase
          .from('tickets')
          .select('qr_code, transaction_reference, ticket_number, status, entry_count, check_in_time, check_out_time, attendee_name, phone, payment_method, ticket_date, is_multi_day, valid_dates')
          .eq('qr_code', code)
          .maybeSingle();
        
        if (!exactError && exactData) {
          ticketData = exactData;
        }
      }

      if (error && error.code !== 'PGRST116') throw error;

      if (!ticketData) {
        toast({
          title: "❌ Ticket non trouvé",
          description: `Aucun ticket trouvé pour "${code}"`,
          variant: "destructive"
        });
        return;
      }

      const statusEmoji = { 'active': '🔴', 'used': '🟢', 'exited': '🟠', 'cancelled': '🚫' };
      const statusText = { 'active': 'Pas entré', 'used': 'En salle', 'exited': 'Sorti', 'cancelled': 'Annulé' };
      const isMoneyFusion = ticketData.payment_method === 'moneyfusion_ticket';
      const isMultiDay = ticketData.is_multi_day || false;
      const ticketDate = ticketData.ticket_date ? new Date(ticketData.ticket_date).toLocaleDateString('fr-FR') : 'N/A';
      
      // Vérifier si le billet est valable aujourd'hui
      let isValidToday = true;
      let validityMessage = '';
      
      if (isMultiDay && ticketData.valid_dates) {
        const today = new Date().toISOString().split('T')[0];
        if (!ticketData.valid_dates.includes(today)) {
          isValidToday = false;
          validityMessage = 'Ce pass multi-jours n\'est pas valable aujourd\'hui';
        }
      } else if (ticketData.ticket_date) {
        const today = new Date().toISOString().split('T')[0];
        if (ticketData.ticket_date !== today) {
          isValidToday = false;
          validityMessage = `Ce billet est valable uniquement pour le ${ticketDate}`;
        }
      }

      toast({
        title: `📊 ${ticketData.attendee_name || 'Ticket'}`,
        description: (
          <div className="space-y-1">
            <div>Code: <span className="font-mono">{ticketData.qr_code || ticketData.transaction_reference}</span></div>
            {isMoneyFusion && <div className="text-blue-400">💰 Ticket MoneyFusion</div>}
            {isMultiDay && <div className="text-purple-400">📅 Pass Multi-Jours</div>}
            {ticketData.ticket_date && !isMultiDay && <div className="text-blue-400">📅 Valable le {ticketDate}</div>}
            <div>{statusEmoji[ticketData.status] || '❓'} Statut: {statusText[ticketData.status] || ticketData.status}</div>
            <div>Entrées totales: <span className="font-bold">{ticketData.entry_count || 0}</span></div>
            {!isValidToday && <div className="text-red-400">⚠️ {validityMessage}</div>}
            {ticketData.phone && <div>📱 {ticketData.phone}</div>}
            {ticketData.transaction_reference && <div className="text-xs text-gray-400">Réf: {ticketData.transaction_reference}</div>}
          </div>
        ),
        variant: "default",
        className: "bg-gray-800 text-white border-none",
        duration: 5000
      });

    } catch (error) {
      console.error('❌ Erreur:', error);
      toast({
        title: "❌ Erreur",
        description: error.message || "Impossible de vérifier le ticket",
        variant: "destructive"
      });
    }
  };

  const getDisplayMessage = (result) => {
    if (result.success) return result.message;
    if (isEventFinished) return `Cet événement est terminé depuis le ${formattedEndDate}.`;
    return result.message || 'Erreur lors du scan';
  };

  const getStatusTitle = (code) => {
    const titles = {
      'checkin': '✅ ENTRÉE VALIDÉE',
      're_entry': '🔄 RÉ-ENTRÉE AUTORISÉE',
      'exit_registered': '🚪 SORTIE ENREGISTRÉE',
      'already_used': '⚠️ DÉJÀ À L\'INTÉRIEUR',
      'already_exited': '⚠️ DÉJÀ SORTI',
      'not_entered': '❌ PAS ENCORE ENTRÉ',
      'event_finished': '📅 ÉVÉNEMENT TERMINÉ',
      'cancelled': '🚫 BILLET ANNULÉ',
      'not_found': '❌ BILLET INCONNU',
      'unknown_status': '❓ STATUT INCONNU',
      'error': '❌ ERREUR TECHNIQUE',
      'not_valid_today': '📅 PAS VALABLE AUJOURD\'HUI',
      'expired_date': '📅 DATE EXPIRÉE'
    };
    return titles[code] || '❓ INCONNU';
  };

  const getStatusDisplay = (statusCode, status) => {
    const displays = {
      'checkin': '✅ 1ère entrée',
      're_entry': '🔄 Ré-entrée',
      'exit_registered': '🚪 Sorti',
      'already_used': '⚠️ Déjà à l\'intérieur',
      'already_exited': '⚠️ Déjà sorti',
      'not_entered': '❌ Pas encore entré',
      'event_finished': '📅 Événement terminé',
      'cancelled': '🚫 Billet annulé',
      'not_found': '❌ Billet inconnu',
      'not_valid_today': '📅 Pas valable aujourd\'hui',
      'expired_date': '📅 Date expirée'
    };
    if (displays[statusCode]) return displays[statusCode];
    if (status === 'active') return '🔴 Pas entré';
    if (status === 'used') return '🟢 En salle';
    if (status === 'exited') return '🟠 Sorti';
    return '❓ Inconnu';
  };

  const getTicketInfoDisplay = (result) => {
    if (!result) return null;
    
    const isGuest = result.is_guest || result.isGuest || false;
    const paymentMethod = result.payment_method || 'coins';
    const isMoneyFusion = paymentMethod === 'moneyfusion_ticket';
    const isMultiDay = result.is_multi_day || false;
    const ticketDate = result.ticket_date ? new Date(result.ticket_date).toLocaleDateString('fr-FR') : null;
    
    return (
      <div className={`mt-2 p-2 rounded-lg border ${isGuest ? 'bg-yellow-500/20 border-yellow-500/30' : isMoneyFusion ? 'bg-blue-500/20 border-blue-500/30' : isMultiDay ? 'bg-purple-500/20 border-purple-500/30' : ''}`}>
        {isGuest && (
          <div className="flex items-center gap-2">
            <User className="w-4 h-4 text-yellow-400" />
            <p className="text-xs text-yellow-400 font-medium">
              {isMoneyFusion ? '💰 Billet externe (MoneyFusion)' : '🎟️ Billet sans compte'}
            </p>
          </div>
        )}
        {isMoneyFusion && !isGuest && (
          <div className="flex items-center gap-2">
            <Wallet className="w-4 h-4 text-blue-400" />
            <p className="text-xs text-blue-400 font-medium">💰 Paiement externe (MoneyFusion)</p>
          </div>
        )}
      {isMultiDay && (
  <div className="flex items-center gap-2">
    <CalendarDays className="w-4 h-4 text-purple-400" />
    <p className="text-xs text-purple-400 font-medium">📅 Pass Multi-Jours</p>
    {result.valid_dates && Array.isArray(result.valid_dates) && (
      <span className="text-xs text-purple-300">
        Valable du {new Date(result.valid_dates[0]).toLocaleDateString('fr-FR')} 
        au {new Date(result.valid_dates[result.valid_dates.length - 1]).toLocaleDateString('fr-FR')}
      </span>
    )}
  </div>
)}
        {ticketDate && !isMultiDay && (
          <div className="flex items-center gap-2">
            <Calendar className="w-4 h-4 text-blue-400" />
            <p className="text-xs text-blue-400 font-medium">📅 Valable le {ticketDate}</p>
          </div>
        )}
        {result.attendee_name && (
          <p className="text-sm text-white font-medium mt-1">{result.attendee_name}</p>
        )}
        {result.phone && (
          <p className="text-xs text-gray-400 mt-0.5">📱 {result.phone}</p>
        )}
        {result.transaction_reference && (
          <p className="text-xs text-gray-400 mt-0.5">Réf: {result.transaction_reference.substring(0, 12)}...</p>
        )}
        {result.entry_count !== undefined && (
          <p className="text-xs text-gray-400 mt-0.5">Entrées totales: {result.entry_count}</p>
        )}
      </div>
    );
  };

  // PROCESSUS DE VÉRIFICATION
  const processVerification = useCallback(async (code, isManual = false) => {
    if (!code || lockedRef.current || scanResult) return;

    lockedRef.current = true;
    setIsProcessing(true);
    setDebugInfo(null);

    try {
      const codeTrimmed = code.trim().toUpperCase();
      
      console.log('🔍 Vérification du code:', codeTrimmed);
      
      const { data, error } = await supabase.rpc('verify_ticket_direct', {
        p_ticket_identifier: codeTrimmed,
        p_verification_method: isManual ? 'manual_entry' : 'qr_scanner_web',
        p_exit_mode: activeTab === 'exit',
      });

      if (error) {
        console.error("RPC Error:", error);
        throw error;
      }

      console.log('📦 Réponse brute:', JSON.stringify(data, null, 2));

      const normalizedData = normalizeRPCResponse(data);
      
      console.log('✅ Données normalisées:', normalizedData);
      
      if (!normalizedData) {
        throw new Error('Réponse invalide du serveur');
      }

      const result = {
        code: codeTrimmed,
        success: normalizedData.success,
        message: normalizedData.message,
        attendee: normalizedData.attendee_name,
        attendee_name: normalizedData.attendee_name,
        phone: normalizedData.phone,
        ticketType: normalizedData.ticket_type || 'Standard',
        timestamp: Date.now(),
        mode: activeTab,
        isManual,
        is_guest: normalizedData.is_guest,
        isGuest: normalizedData.is_guest,
        payment_method: normalizedData.payment_method,
        transaction_reference: normalizedData.transaction_reference,
        status_code: normalizedData.status_code,
        status: normalizedData.status,
        entry_count: normalizedData.entry_count,
        ticket_date: normalizedData.ticket_date,
        is_multi_day: normalizedData.is_multi_day,
        valid_dates: normalizedData.valid_dates
      };

      console.log('✅ Résultat final:', result);

      setScanResult(result);
      setScanHistory(prev => [result, ...prev].slice(0, 50));
      saveOffline(result);

      if (result.success) {
        playFeedback(result.status_code === 'exit_registered' ? 'exit' : 'entry');
      } else {
        playFeedback('error');
      }

      if (!result.success && result.status_code === 'not_found') {
        setDebugInfo({
          searched_code: codeTrimmed,
          message: 'Ticket non trouvé en base. Vérifiez le code scanné.',
          suggestion: 'Essayez de saisir manuellement le code ou vérifiez que le ticket existe bien.'
        });
      }

    } catch (error) {
      console.error('❌ Erreur scan:', error);
      const errorResult = {
        code: code.trim().toUpperCase(),
        success: false,
        message: error.message || 'Erreur technique',
        timestamp: Date.now(),
        mode: activeTab,
        isManual,
        is_guest: false,
        isGuest: false,
        payment_method: 'unknown',
        attendee: 'Erreur',
        attendee_name: 'Erreur',
        phone: null,
        status_code: 'error',
        status: 'unknown',
        entry_count: 0
      };
      setScanResult(errorResult);
      setScanHistory(prev => [errorResult, ...prev].slice(0, 50));
      saveOffline(errorResult);
      playFeedback('error');
    } finally {
      setIsProcessing(false);
      setManualCode('');
      setTimeout(() => { lockedRef.current = false; }, 500);
    }
  }, [activeTab, scanResult]);

  const handleScan = (code) => {
    if (isProcessing || scanResult) return;
    processVerification(code, false);
  };

  const handleManualSubmit = () => {
    if (!manualCode.trim()) return;
    processVerification(manualCode, true);
  };

  const handleNextScan = () => {
    setScanResult(null);
    setDebugInfo(null);
    lockedRef.current = false;
  };

  // EXPORTS
  const exportScansToExcel = () => {
    if (scanHistory.length === 0) return;
    const data = scanHistory.map((s, i) => ({
      "#": i + 1,
      "Participant": s.attendee || "—",
      "Téléphone": s.phone || "—",
      "Code Billet": s.code,
      "Statut": s.success ? "VALIDÉ" : "REFUSÉ",
      "Sens": s.mode === 'entry' ? "ENTRÉE" : "SORTIE",
      "Méthode": s.isManual ? "Manuel" : "QR Code",
      "Message": s.message,
      "Heure": new Date(s.timestamp).toLocaleTimeString(),
      "Date": new Date(s.timestamp).toLocaleDateString(),
      "Type Billet": s.ticketType || "-",
      "Paiement": s.payment_method === 'moneyfusion_ticket' ? 'Externe' : (s.is_guest ? 'Sans compte' : 'Compte'),
      "Réf. Transaction": s.transaction_reference || "-",
      "Entrées totales": s.entry_count || 0,
      "Date billet": s.ticket_date || "-",
      "Multi-jours": s.is_multi_day ? "Oui" : "Non"
    }));
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Scans');
    XLSX.writeFile(wb, `scans_event_${eventId}_${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  // ============================================
// EXPORT PDF - Formatage en FCFA
// ============================================

const exportScansToPDF = () => {
  if (scanHistory.length === 0) return;
  const doc = new jsPDF('landscape', 'mm', 'a4');
  
  // En-tête
  doc.setFontSize(14);
  doc.text('Historique des scans - Billets', 14, 20);
  doc.setFontSize(10);
  doc.text(`Généré le ${new Date().toLocaleDateString('fr-FR')} à ${new Date().toLocaleTimeString('fr-FR')}`, 14, 28);
  
  autoTable(doc, {
    head: [[
      "#", 
      "Participant", 
      "Téléphone", 
      "Code Billet", 
      "Statut", 
      "Sens", 
      "Date Billet", 
      "Multi-jours", 
      "Entrées",
      "Type Billet",
      "Paiement"
    ]],
    body: scanHistory.map((s, i) => [
      i + 1,
      s.attendee || "—",
      s.phone || "—",
      s.code,
      s.success ? "VALIDÉ" : "REFUSÉ",
      s.mode === "entry" ? "ENTRÉE" : "SORTIE",
      s.ticket_date ? new Date(s.ticket_date).toLocaleDateString('fr-FR') : "-",
      s.is_multi_day ? "Oui" : "Non",
      s.entry_count || 0,
      s.ticketType || "-",
      s.payment_method === 'moneyfusion_ticket' ? 'Externe' : (s.is_guest ? 'Sans compte' : 'Compte')
    ]),
    startY: 35,
    styles: { fontSize: 7 },
    headStyles: { fillColor: [41, 128, 185], textColor: [255, 255, 255] },
    alternateRowStyles: { fillColor: [240, 240, 240] }
  });
  
  doc.save(`scans_event_${eventId}_${new Date().toISOString().slice(0,10)}.pdf`);
};

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md w-full bg-black text-white p-0 overflow-hidden max-h-screen">

        {flashColor && (
          <div className={cn(
            "absolute inset-0 z-50 pointer-events-none",
            flashColor === 'green' ? "bg-green-500/40" : "bg-red-500/40"
          )} />
        )}

        <DialogHeader className="p-4 border-b border-gray-800">
          <DialogTitle className="flex items-center gap-2 text-sm sm:text-base">
            <QrCode className="w-5 h-5 text-blue-400" /> Scanner Billets
          </DialogTitle>
          <DialogDescription className="text-xs sm:text-sm">
            {activeTab === 'entry' ? '✅ Mode Entrée' : '🚪 Mode Sortie'}
          </DialogDescription>
        </DialogHeader>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="p-2">
          <TabsList className="grid grid-cols-2 bg-gray-800">
            <TabsTrigger value="entry" className="data-[state=active]:bg-green-600 text-xs sm:text-sm">
              <LogIn className="w-4 h-4 mr-1" /> Entrée
            </TabsTrigger>
            <TabsTrigger value="exit" className="data-[state=active]:bg-blue-600 text-xs sm:text-sm">
              <LogOut className="w-4 h-4 mr-1" /> Sortie
            </TabsTrigger>
          </TabsList>
        </Tabs>

        <div className="px-3 pb-2">
          <div className="flex gap-2 flex-col sm:flex-row">
            <div className="flex-1 flex gap-2">
              <Input
                placeholder="Saisir code billet"
                value={manualCode}
                onChange={(e) => setManualCode(e.target.value)}
                disabled={!!scanResult}
                className="flex-1"
              />
              <Button
                onClick={checkTicketStatus}
                variant="outline"
                className="h-10 w-10 flex items-center justify-center border-blue-600 text-blue-400 hover:bg-blue-600/20"
                title="Vérifier l'état du ticket"
                disabled={!!scanResult}
              >
                <Search className="w-4 h-4" />
              </Button>
            </div>
          </div>
          <div className="flex gap-2 mt-2 flex-col sm:flex-row">
            <Button
              onClick={handleManualSubmit}
              disabled={!manualCode.trim() || !!scanResult}
              variant="outline"
              className="flex-1 flex items-center justify-center gap-1"
            >
              <span>Valider</span>
              <Scan className="w-4 h-4" />
            </Button>
            <Button
              onClick={resetTicketInDatabase}
              variant="outline"
              className="sm:w-auto flex items-center justify-center gap-1 border-red-600 text-red-400 hover:bg-red-600/20"
              disabled={!manualCode.trim() || !!scanResult || isResetting}
              title="Réinitialiser le ticket en base"
            >
              {isResetting ? <Loader2 className="animate-spin w-4 h-4" /> : <RotateCcw className="w-4 h-4" />}
              <span className="hidden sm:inline">Réinitialiser</span>
            </Button>
          </div>
          {debugInfo && (
            <div className="mt-2 p-2 bg-yellow-900/30 border border-yellow-600 rounded text-xs text-yellow-400">
              <p className="font-bold">🔍 Debug:</p>
              <p>Code recherché: {debugInfo.searched_code}</p>
              <p>{debugInfo.message}</p>
              {debugInfo.suggestion && <p className="text-yellow-300">💡 {debugInfo.suggestion}</p>}
            </div>
          )}
        </div>

        <div className="relative min-h-[260px] sm:min-h-[320px]">
          <QrScanner isScanning={isOpen && !scanResult} onScan={handleScan} />

          {scanResult && (
            <div className="absolute inset-x-0 bottom-0 p-4 bg-black/90">
              <div className={cn(
                "rounded-xl p-4 border-2",
                scanResult.success
                  ? scanResult.status_code === 'exit_registered'
                    ? "border-blue-500 bg-blue-900/40"
                    : scanResult.status_code === 're_entry'
                    ? "border-purple-500 bg-purple-900/40"
                    : "border-green-500 bg-green-900/40"
                  : scanResult.status_code === 'already_used' || scanResult.status_code === 'already_exited' || scanResult.status_code === 'not_entered'
                  ? "border-yellow-500 bg-yellow-900/40"
                  : scanResult.status_code === 'not_valid_today' || scanResult.status_code === 'expired_date'
                  ? "border-orange-500 bg-orange-900/40"
                  : "border-red-500 bg-red-900/40"
              )}>
                <h3 className={cn(
                  "font-bold text-lg text-center",
                  scanResult.success
                    ? scanResult.status_code === 'exit_registered'
                      ? "text-blue-400"
                      : scanResult.status_code === 're_entry'
                      ? "text-purple-400"
                      : "text-green-400"
                    : scanResult.status_code === 'already_used' || scanResult.status_code === 'already_exited' || scanResult.status_code === 'not_entered'
                    ? "text-yellow-400"
                    : scanResult.status_code === 'not_valid_today' || scanResult.status_code === 'expired_date'
                    ? "text-orange-400"
                    : "text-red-400"
                )}>
                  {getStatusTitle(scanResult.status_code)}
                </h3>
                <p className="text-sm text-center mt-1">{getDisplayMessage(scanResult)}</p>
                {getTicketInfoDisplay(scanResult)}
                <div className="text-xs text-gray-400 text-center mt-2">
                  Statut: {getStatusDisplay(scanResult.status_code, scanResult.status)}
                  {scanResult.entry_count > 0 && <span className="ml-2 text-purple-400">(#{scanResult.entry_count})</span>}
                  {scanResult.is_multi_day && <span className="ml-2 text-purple-400">📅 Multi-jours</span>}
                  {scanResult.ticket_date && !scanResult.is_multi_day && <span className="ml-2 text-blue-400">📅 {new Date(scanResult.ticket_date).toLocaleDateString('fr-FR')}</span>}
                </div>
                <Button onClick={handleNextScan} className="w-full mt-3" variant="outline">
                  <Scan className="w-4 h-4 mr-2" /> Continuer
                </Button>
              </div>
            </div>
          )}
        </div>

        <div className="h-[180px] sm:h-[200px] border-t border-gray-800 p-2 flex flex-col">
          <div className="flex justify-between items-center mb-1 flex-wrap gap-1">
            <span className="text-xs text-gray-400 flex items-center gap-1">
              <History className="w-3 h-3" /> Historique ({scanHistory.length})
            </span>
            <div className="flex gap-1 flex-wrap">
              <Button size="sm" variant="outline" onClick={forceSync} className="text-xs text-blue-400 border-blue-600 hover:bg-blue-600/20">
                <RefreshCw className="w-3 h-3 mr-1" /> Sync
              </Button>
              <Button size="sm" variant="outline" onClick={exportScansToExcel} disabled={scanHistory.length === 0} className="text-xs text-green-400 border-green-600">
                <FileSpreadsheet className="w-3 h-3" />
              </Button>
              <Button size="sm" variant="outline" onClick={exportScansToPDF} disabled={scanHistory.length === 0} className="text-xs text-blue-400 border-blue-600">
                PDF
              </Button>
              <Button size="sm" variant="outline" onClick={clearHistory} disabled={scanHistory.length === 0} className="text-xs text-red-400 border-red-600">
                <Trash2 className="w-3 h-3" />
              </Button>
            </div>
          </div>

          <ScrollArea className="flex-1">
            {scanHistory.length === 0 ? (
              <p className="text-xs text-gray-500 text-center mt-6">Aucun scan</p>
            ) : scanHistory.map((s, i) => {
              const isGuest = s.is_guest || false;
              const isMoneyFusion = s.payment_method === 'moneyfusion_ticket';
              const isMultiDay = s.is_multi_day || false;
              let badgeClass = '';
              if (s.success) {
                if (s.status_code === 'exit_registered') badgeClass = 'text-blue-400 border-blue-400';
                else if (s.status_code === 're_entry') badgeClass = 'text-purple-400 border-purple-400';
                else badgeClass = 'text-green-400 border-green-400';
              } else {
                if (s.status_code === 'already_used' || s.status_code === 'already_exited' || s.status_code === 'not_entered') {
                  badgeClass = 'text-yellow-400 border-yellow-400';
                } else if (s.status_code === 'not_valid_today' || s.status_code === 'expired_date') {
                  badgeClass = 'text-orange-400 border-orange-400';
                } else {
                  badgeClass = 'text-red-400 border-red-400';
                }
              }
              return (
                <div key={i} className="flex justify-between items-center text-xs p-1 border-b border-gray-800/50">
                  <div className="flex-1 min-w-0">
                    <span className="truncate block">{s.attendee || s.code}</span>
                    <div className="flex items-center gap-1 flex-wrap">
                      {s.phone && <span className="text-[8px] text-blue-400">📱{s.phone}</span>}
                      {(isGuest || isMoneyFusion) && <span className="text-[8px] text-yellow-500/70">{isGuest ? '🎟️' : '💰'}</span>}
                      {isMultiDay && <span className="text-[8px] text-purple-400">📅 Multi</span>}
                      {s.ticket_date && !isMultiDay && <span className="text-[8px] text-blue-400">📅 {new Date(s.ticket_date).toLocaleDateString('fr-FR')}</span>}
                      {s.entry_count > 0 && <span className="text-[8px] text-purple-400">#{s.entry_count}</span>}
                      <span className="text-[8px] text-gray-600">
                        {s.status_code === 'checkin' ? '1ère' : 
                         s.status_code === 're_entry' ? 'Ré-entrée' : 
                         s.status_code === 'exit_registered' ? 'Sortie' : 
                         s.status_code === 'not_valid_today' ? '📅' : ''}
                      </span>
                    </div>
                  </div>
                  <Badge variant="outline" className={badgeClass}>{s.success ? '✅ OK' : '❌ REFUS'}</Badge>
                </div>
              );
            })}
          </ScrollArea>
        </div>

      </DialogContent>
    </Dialog>
  );
}