import React, { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Helmet } from 'react-helmet-async';
import { supabase } from '@/lib/customSupabaseClient';
import { useToast } from '@/components/ui/use-toast';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import {
    Loader2, ShieldCheck,
    Keyboard, Camera, LogOut, ArrowRightLeft,
    DoorClosed, ShieldAlert, User, Wallet, Scan, Trash2, RefreshCw, RotateCcw, Search, Calendar, CalendarDays
} from 'lucide-react';
import { useSearchParams, Link } from 'react-router-dom';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import QrScanner from '@/components/event/QrScanner';

const VerifyTicketPage = () => {
    const { user } = useAuth();
    const { toast, dismiss } = useToast();
    const [searchParams] = useSearchParams();

    // State
    const [ticketInput, setTicketInput] = useState('');
    const [verificationResult, setVerificationResult] = useState(null);
    const [loading, setLoading] = useState(false);
    const [activeTab, setActiveTab] = useState('scan');
    const [exitMode, setExitMode] = useState(false);
    const [scanHistory, setScanHistory] = useState([]);
    const [isResetting, setIsResetting] = useState(false);

    // Refs PRO
    const lastScanRef = useRef({ code: '', time: 0 });
    const isProcessingRef = useRef(false);
    const resultTimeoutRef = useRef(null);
    const audioPoolRef = useRef({});
    const lastSuccessTimeRef = useRef(0);

    // 🔥 Vider le cache local
    const clearLocalCache = () => {
        localStorage.removeItem('offline_scans');
        setScanHistory([]);
        toast({
            title: "🧹 Cache vidé",
            description: "Les données locales ont été réinitialisées",
            variant: "default",
            className: "bg-gray-700 text-white border-none"
        });
    };

    // 🔥 FORCER LA SYNCHRONISATION
    const forceSync = () => {
        localStorage.removeItem('offline_scans');
        setScanHistory([]);
        setVerificationResult(null);
        setTicketInput('');
        
        toast({
            title: "🔄 Synchronisation forcée",
            description: "Le cache a été vidé. Les données sont synchronisées avec la base.",
            variant: "default",
            className: "bg-green-600 text-white border-none"
        });
    };

    // 🔥 Réinitialiser le ticket dans la base de données
    const resetTicketInDatabase = async () => {
        if (!ticketInput) {
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
                p_ticket_identifier: ticketInput.toUpperCase()
            });

            if (error) throw error;

            toast({
                title: "🔄 Ticket réinitialisé",
                description: `Le ticket ${ticketInput.toUpperCase()} a été réinitialisé avec succès`,
                variant: "default",
                className: "bg-green-600 text-white border-none"
            });

            localStorage.removeItem('offline_scans');
            setScanHistory([]);
            setVerificationResult(null);
            setTicketInput('');

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

    // 🔥 VÉRIFIER L'ÉTAT DU TICKET (AMÉLIORÉ AVEC DATES)
    const checkTicketStatus = async () => {
        if (!ticketInput) {
            toast({
                title: "⚠️ Aucun code",
                description: "Entrez un code de billet à vérifier",
                variant: "destructive"
            });
            return;
        }

        try {
            const code = ticketInput.trim().toUpperCase();
            
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

            const statusEmoji = {
                'active': '🔴',
                'used': '🟢',
                'exited': '🟠',
                'cancelled': '🚫'
            };

            const statusText = {
                'active': 'Pas entré',
                'used': 'En salle',
                'exited': 'Sorti',
                'cancelled': 'Annulé'
            };

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

    // 🔊 PRELOAD AUDIO PRO + iOS unlock
    useEffect(() => {
        const sounds = {
            success: '/sounds/success.mp3',
            exit: '/sounds/exit.mp3',
            error: '/sounds/error.mp3',
            warning: '/sounds/warning.mp3'
        };

        Object.entries(sounds).forEach(([key, path]) => {
            const audio = new Audio(path);
            audio.preload = 'auto';
            audio.volume = 0.9;
            audioPoolRef.current[key] = audio;
        });

        const unlock = () => {
            Object.values(audioPoolRef.current).forEach(a => {
                a.play().then(() => {
                    a.pause();
                    a.currentTime = 0;
                }).catch(() => {});
            });
            window.removeEventListener('click', unlock);
            window.removeEventListener('touchstart', unlock);
        };

        window.addEventListener('click', unlock);
        window.addEventListener('touchstart', unlock);
    }, []);

    // Initial manual code from URL
    useEffect(() => {
        const ticketParam = searchParams.get('ticket');
        if (ticketParam) {
            setTicketInput(ticketParam);
            handleVerification(ticketParam, 'manual');
        }
        // eslint-disable-next-line
    }, [searchParams]);

    // 🔄 Toggle mode
    const toggleMode = () => {
        setExitMode(prev => !prev);
        setVerificationResult(null);

        toast({
            title: !exitMode ? "🚪 Mode SORTIE activé" : "✅ Mode ENTRÉE activé",
            description: !exitMode
                ? "Scannez pour enregistrer les sorties"
                : "Scannez pour valider les entrées",
            className: !exitMode
                ? "bg-blue-600 text-white border-none"
                : "bg-green-600 text-white border-none"
        });
    };

    // 🚀 PLAY SOUND PRO
    const playSound = useCallback((status) => {
        const map = {
            checkin: 'success',
            re_entry: 'success',
            exit_registered: 'exit',
            already_used: 'warning',
            already_exited: 'warning',
            not_entered: 'warning',
            event_finished: 'warning',
            cancelled: 'warning',
            not_valid_today: 'warning',
            expired_date: 'warning',
            error: 'error'
        };

        const key = map[status] || 'error';
        const audio = audioPoolRef.current[key];
        if (!audio) return;

        try {
            const now = Date.now();

            if (key === 'success' && now - lastSuccessTimeRef.current < 800) {
                return;
            }
            if (key === 'success') {
                lastSuccessTimeRef.current = now;
            }

            audio.currentTime = 0;
            audio.play().catch(() => {});

            if (navigator.vibrate) {
                if (key === 'success') navigator.vibrate(60);
                else if (key === 'exit') navigator.vibrate([40, 30, 40]);
                else navigator.vibrate([120]);
            }
        } catch (e) {
            console.warn('Audio error:', e);
        }
    }, []);

    // 🔥 NORMALISER LA RÉPONSE RPC - CORRIGÉ AVEC GESTION MONEYFUSION ET DATES
    const normalizeRPCResponse = (data) => {
        console.log('🔍 normalizeRPCResponse - Input:', JSON.stringify(data, null, 2));
        
        const rawData = Array.isArray(data) ? data[0] : data;
        if (!rawData) {
            console.log('❌ Pas de données');
            return null;
        }
        
        const response = rawData.verify_ticket_direct || rawData;
        console.log('📦 Response extraite:', JSON.stringify(response, null, 2));
        
        if (response.qr_code && !response.success && !response.message) {
            console.log('⚠️ Requête SELECT détectée, ignorée');
            return null;
        }

        const result = {
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
            valid_dates: response.valid_dates || null
        };
        
        console.log('✅ Résultat normalisé:', result);
        return result;
    };

    // 🔥 AFFICHER LE STATUT LISIBLE
    const getStatusDisplay = (statusCode, status) => {
        console.log('🔍 getStatusDisplay - statusCode:', statusCode, 'status:', status);
        switch (statusCode) {
            case 'checkin': return '✅ 1ère entrée';
            case 're_entry': return '🔄 Ré-entrée';
            case 'exit_registered': return '🚪 Sorti';
            case 'already_used': return '⚠️ Déjà à l\'intérieur';
            case 'already_exited': return '⚠️ Déjà sorti';
            case 'not_entered': return '❌ Pas encore entré';
            case 'event_finished': return '📅 Événement terminé';
            case 'cancelled': return '🚫 Billet annulé';
            case 'not_found': return '❌ Billet inconnu';
            case 'not_valid_today': return '📅 Pas valable aujourd\'hui';
            case 'expired_date': return '📅 Date expirée';
            default:
                if (status === 'active') return '🔴 Pas entré';
                if (status === 'used') return '🟢 En salle';
                if (status === 'exited') return '🟠 Sorti';
                return '❓ Inconnu';
        }
    };

    // 🔥 AFFICHER LES INFOS DU TICKET (AMÉLIORÉ AVEC DATES)
    const getTicketInfoDisplay = (result) => {
        if (!result) return null;
        
        const isGuest = result.is_guest || result.isGuest || false;
        const paymentMethod = result.payment_method || 'coins';
        const isMoneyFusion = paymentMethod === 'moneyfusion_ticket';
        const isMultiDay = result.is_multi_day || false;
        const ticketDate = result.ticket_date ? new Date(result.ticket_date).toLocaleDateString('fr-FR') : null;
        
        return (
            <div className={`mt-3 p-2 rounded-lg border ${
                isGuest 
                    ? 'bg-yellow-500/20 border-yellow-500/30' 
                    : isMoneyFusion 
                    ? 'bg-blue-500/20 border-blue-500/30' 
                    : isMultiDay
                    ? 'bg-purple-500/20 border-purple-500/30'
                    : 'bg-gray-800/50 border-gray-700'
            }`}>
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
                        {result.valid_dates && (
                            <span className="text-xs text-purple-300">
                                Valable du {new Date(result.valid_dates[0]).toLocaleDateString('fr-FR')} au {new Date(result.valid_dates[result.valid_dates.length - 1]).toLocaleDateString('fr-FR')}
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
                {result.attendee_name && result.attendee_name !== 'Inconnu' && (
                    <p className="text-sm font-medium text-white mt-1">
                        {result.attendee_name}
                    </p>
                )}
                {result.phone && (
                    <p className="text-xs text-gray-400 mt-0.5">
                        📱 {result.phone}
                    </p>
                )}
                {result.transaction_reference && (
                    <p className="text-xs text-gray-400 mt-0.5">
                        Réf: {result.transaction_reference.substring(0, 12)}...
                    </p>
                )}
                {result.entry_count !== undefined && (
                    <p className="text-xs text-gray-400 mt-0.5">
                        Entrées totales: {result.entry_count}
                    </p>
                )}
            </div>
        );
    };

    // 📋 GET STATUS TITLE
    const getStatusTitle = (code) => {
        switch (code) {
            case 'checkin': return '✅ ENTRÉE VALIDÉE';
            case 're_entry': return '🔄 RÉ-ENTRÉE AUTORISÉE';
            case 'exit_registered': return '🚪 SORTIE ENREGISTRÉE';
            case 'already_used': return '⚠️ DÉJÀ À L\'INTÉRIEUR';
            case 'already_exited': return '⚠️ DÉJÀ SORTI';
            case 'not_entered': return '❌ PAS ENCORE ENTRÉ';
            case 'event_finished': return '📅 ÉVÉNEMENT TERMINÉ';
            case 'cancelled': return '🚫 BILLET ANNULÉ';
            case 'not_found': return '❌ BILLET INCONNU';
            case 'unknown_status': return '❓ STATUT INCONNU';
            case 'error': return '❌ ERREUR TECHNIQUE';
            case 'not_valid_today': return '📅 PAS VALABLE AUJOURD\'HUI';
            case 'expired_date': return '📅 DATE EXPIRÉE';
            default: return '❓ INCONNU';
        }
    };

    // 🧠 Vérification billet (CORRIGÉE)
    const handleVerification = async (codeToVerify, method = 'manual') => {
        const cleanCode = codeToVerify?.trim().toUpperCase();
        if (!cleanCode) return;

        const now = Date.now();

        if (cleanCode === lastScanRef.current.code) {
            const delta = now - lastScanRef.current.time;
            if (delta < 2000) return;
        }

        if (isProcessingRef.current) return;

        isProcessingRef.current = true;
        lastScanRef.current = { code: cleanCode, time: now };
        setLoading(true);

        if (resultTimeoutRef.current) clearTimeout(resultTimeoutRef.current);
        dismiss();

        try {
            console.log('🔍 Vérification du code:', cleanCode);
            console.log('📋 Mode:', exitMode ? 'SORTIE' : 'ENTRÉE');
            
            const { data, error } = await supabase.rpc('verify_ticket_direct', {
                p_ticket_identifier: cleanCode,
                p_verification_method: method === 'qr_code' ? 'qr_scanner_web' : method,
                p_exit_mode: exitMode
            });

            if (error) {
                console.error("RPC Error:", error);
                throw error;
            }

            console.log('📦 Raw RPC Response:', JSON.stringify(data, null, 2));

            const normalizedData = normalizeRPCResponse(data);
            
            console.log('✅ Normalized Data:', normalizedData);
            
            if (!normalizedData) {
                throw new Error('Réponse invalide du serveur');
            }

            const enrichedData = {
                success: normalizedData.success || false,
                message: normalizedData.message || 'Action effectuée',
                status_code: normalizedData.status_code || 'unknown',
                status: normalizedData.status || 'unknown',
                attendee_name: normalizedData.attendee_name || 'Inconnu',
                phone: normalizedData.phone || null,
                is_guest: normalizedData.is_guest || normalizedData.isGuest || false,
                isGuest: normalizedData.is_guest || normalizedData.isGuest || false,
                payment_method: normalizedData.payment_method || 'coins',
                transaction_reference: normalizedData.transaction_reference || null,
                ticket_type: normalizedData.ticket_type || null,
                entry_count: normalizedData.entry_count || 0,
                ticket_date: normalizedData.ticket_date || null,
                is_multi_day: normalizedData.is_multi_day || false,
                valid_dates: normalizedData.valid_dates || null,
                code: cleanCode,
                method: method,
                timestamp: Date.now()
            };

            console.log('✅ Enriched Data:', enrichedData);

            setVerificationResult(enrichedData);
            setScanHistory(prev => [enrichedData, ...prev].slice(0, 10));

            playSound(enrichedData.status_code);
            showFeedbackToast(enrichedData);

            if (enrichedData.success && method === 'manual') {
                setTicketInput('');
            }

            resultTimeoutRef.current = setTimeout(() => {
                setVerificationResult(null);
            }, 3500);

        } catch (error) {
            console.error("❌ Scan error:", error);

            playSound('error');

            const errorData = {
                success: false,
                message: error.message || "Erreur serveur",
                status_code: 'error',
                is_guest: false,
                isGuest: false,
                payment_method: 'unknown',
                attendee_name: 'Erreur',
                code: cleanCode,
                method: method,
                timestamp: Date.now()
            };

            setVerificationResult(errorData);
            showFeedbackToast(errorData);

            resultTimeoutRef.current = setTimeout(() => {
                setVerificationResult(null);
            }, 3000);
        } finally {
            setLoading(false);
            setTimeout(() => { isProcessingRef.current = false; }, 500);
        }
    };

    // 💬 SHOW FEEDBACK TOAST
    const showFeedbackToast = (data) => {
        let variant = 'default';
        let className = '';

        if (data.success) {
            if (data.status_code === 'exit_registered') {
                className = 'bg-blue-600 text-white border-none';
            } else if (data.status_code === 're_entry') {
                className = 'bg-purple-600 text-white border-none';
            } else {
                className = 'bg-green-600 text-white border-none';
            }
        } else {
            variant = 'destructive';

            if (data.status_code === 'already_used' || 
                data.status_code === 'already_exited' || 
                data.status_code === 'not_entered') {
                className = 'bg-yellow-500 text-black border-none';
            } else if (data.status_code === 'not_valid_today' || data.status_code === 'expired_date') {
                className = 'bg-orange-500 text-white border-none';
            } else if (data.status_code === 'event_finished') {
                className = 'bg-red-600 text-white border-none';
            }
        }

        toast({
            title: getStatusTitle(data.status_code),
            description: data.message,
            variant,
            className,
            duration: 3000
        });
    };

    const closeResult = () => {
        setVerificationResult(null);
        setTicketInput('');
    };

    // 🔒 Non connecté
    if (!user) {
        return (
            <div className="min-h-screen bg-gray-950 text-white flex flex-col items-center justify-center p-6 text-center">
                <ShieldCheck className="w-16 h-16 text-primary mb-6" />
                <h1 className="text-3xl font-bold mb-4">Scanner</h1>
                <p className="text-gray-400 mb-8">
                    Veuillez vous connecter pour accéder au scanner.
                </p>
                <Button asChild>
                    <Link to="/auth">Connexion</Link>
                </Button>
            </div>
        );
    }

    // ================= UI =================
    return (
        <div className="min-h-screen bg-gray-950 text-white flex flex-col pt-4 pb-20 px-2 sm:px-4">
            <Helmet>
                <title>Scanner | BonPlanInfos</title>
            </Helmet>

            <div className="max-w-md mx-auto w-full space-y-4">

                {/* MODE BAR */}
                <Card className="bg-gray-900 border-gray-800 p-2 flex items-center justify-between shadow-lg">
                    <div className="flex items-center gap-2 pl-2">
                        <div className={`w-3 h-3 rounded-full ${exitMode ? 'bg-blue-500' : 'bg-green-500'} animate-pulse`} />
                        <span className={`font-bold text-sm ${exitMode ? 'text-blue-400' : 'text-green-400'}`}>
                            {exitMode ? '🚪 MODE SORTIE' : '✅ MODE ENTRÉE'}
                        </span>
                    </div>

                    <Button size="sm" variant="secondary" onClick={toggleMode}>
                        <ArrowRightLeft className="w-4 h-4 mr-2" />
                        Changer
                    </Button>
                </Card>

                {/* SCANNER */}
                <Card className="bg-black border-gray-800 overflow-hidden aspect-[3/4] relative rounded-xl">
                    <Tabs value={activeTab} onValueChange={setActiveTab} className="h-full flex flex-col">

                        <div className="absolute top-4 left-0 right-0 z-10 flex justify-center px-4">
                            <TabsList className="bg-gray-900/90 border w-full grid grid-cols-2">
                                <TabsTrigger value="scan"><Camera className="w-4 h-4 mr-2" /> Scan</TabsTrigger>
                                <TabsTrigger value="manual"><Keyboard className="w-4 h-4 mr-2" /> Code</TabsTrigger>
                            </TabsList>
                        </div>

                        <TabsContent value="scan" className="h-full mt-0 relative">
                            <QrScanner
                                onScan={(code) => handleVerification(code, 'qr_code')}
                                isScanning={activeTab === 'scan'}
                            />
                        </TabsContent>

                        <TabsContent value="manual" className="h-full mt-0 flex flex-col items-center justify-center p-8 bg-gray-900">
                            <div className="w-full space-y-6">
                                <div className="text-center text-sm text-gray-400">
                                    Entrez le code du billet
                                </div>
                                <div className="flex gap-2">
                                    <Input
                                        value={ticketInput}
                                        onChange={(e) => setTicketInput(e.target.value.toUpperCase())}
                                        placeholder="EX: 17880R"
                                        className="flex-1 text-center text-2xl font-mono h-20 bg-gray-800 border-gray-700"
                                        maxLength={50}
                                    />
                                    <Button
                                        onClick={checkTicketStatus}
                                        variant="outline"
                                        className="h-20 w-14 flex items-center justify-center border-blue-600 text-blue-400 hover:bg-blue-600/20"
                                        title="Vérifier l'état du ticket"
                                    >
                                        <Search className="w-6 h-6" />
                                    </Button>
                                </div>

                                <div className="flex gap-2">
                                    <Button
                                        onClick={() => handleVerification(ticketInput, 'manual')}
                                        className="flex-1 h-14 text-lg font-bold"
                                        disabled={!ticketInput || loading}
                                    >
                                        {loading ? <Loader2 className="animate-spin w-6 h-6" /> :
                                            (exitMode ? '🚪 VALIDER SORTIE' : '✅ VALIDER ENTRÉE')}
                                    </Button>
                                    <Button
                                        onClick={resetTicketInDatabase}
                                        variant="outline"
                                        className="h-14 w-14 flex items-center justify-center border-red-600 text-red-400 hover:bg-red-600/20"
                                        disabled={!ticketInput || isResetting}
                                        title="Réinitialiser le ticket en base"
                                    >
                                        {isResetting ? <Loader2 className="animate-spin w-5 h-5" /> : <RotateCcw className="w-5 h-5" />}
                                    </Button>
                                </div>
                            </div>
                        </TabsContent>
                    </Tabs>

                    <AnimatePresence>
                        {verificationResult && (
                            <motion.div
                                initial={{ opacity: 0, scale: 0.9 }}
                                animate={{ opacity: 1, scale: 1 }}
                                exit={{ opacity: 0, scale: 0.9 }}
                                className="absolute inset-0 bg-black/95 flex flex-col items-center justify-center text-center p-6"
                                onClick={closeResult}
                            >
                                <div className="w-full max-w-sm space-y-4">
                                    <div className={`p-4 rounded-lg ${
                                        verificationResult.success 
                                            ? verificationResult.status_code === 'exit_registered'
                                                ? 'bg-blue-500/20 border border-blue-500/30'
                                                : verificationResult.status_code === 're_entry'
                                                ? 'bg-purple-500/20 border border-purple-500/30'
                                                : 'bg-green-500/20 border border-green-500/30'
                                            : verificationResult.status_code === 'already_used' || 
                                              verificationResult.status_code === 'already_exited' || 
                                              verificationResult.status_code === 'not_entered'
                                            ? 'bg-yellow-500/20 border border-yellow-500/30'
                                            : verificationResult.status_code === 'not_valid_today' || 
                                              verificationResult.status_code === 'expired_date'
                                            ? 'bg-orange-500/20 border border-orange-500/30'
                                            : 'bg-red-500/20 border border-red-500/30'
                                    }`}>
                                        <h2 className={`text-2xl font-black ${
                                            verificationResult.success 
                                                ? verificationResult.status_code === 'exit_registered'
                                                    ? 'text-blue-400'
                                                    : verificationResult.status_code === 're_entry'
                                                    ? 'text-purple-400'
                                                    : 'text-green-400'
                                                : verificationResult.status_code === 'already_used' || 
                                                  verificationResult.status_code === 'already_exited' || 
                                                  verificationResult.status_code === 'not_entered'
                                                ? 'text-yellow-400'
                                                : verificationResult.status_code === 'not_valid_today' || 
                                                  verificationResult.status_code === 'expired_date'
                                                ? 'text-orange-400'
                                                : 'text-red-400'
                                        }`}>
                                            {getStatusTitle(verificationResult.status_code)}
                                        </h2>
                                        <p className="text-sm text-white mt-1">
                                            {verificationResult.message}
                                        </p>
                                    </div>

                                    {verificationResult.attendee_name && verificationResult.attendee_name !== 'Inconnu' && (
                                        <div className="bg-gray-800/50 rounded-lg p-3">
                                            <p className="text-sm font-medium text-white">
                                                {verificationResult.attendee_name}
                                            </p>
                                            {verificationResult.phone && (
                                                <p className="text-xs text-blue-400 mt-0.5">
                                                    📱 {verificationResult.phone}
                                                </p>
                                            )}
                                            {verificationResult.ticket_type && (
                                                <p className="text-xs text-gray-400">
                                                    {verificationResult.ticket_type}
                                                </p>
                                            )}
                                        </div>
                                    )}

                                    {getTicketInfoDisplay(verificationResult)}

                                    <div className="text-xs text-gray-400 bg-gray-800/30 rounded-lg p-2 space-y-1">
                                        <div>
                                            Statut: {getStatusDisplay(verificationResult.status_code, verificationResult.status)}
                                            {verificationResult.code && (
                                                <span className="ml-2 font-mono">#{verificationResult.code.substring(0, 12)}</span>
                                            )}
                                        </div>
                                        {verificationResult.entry_count !== undefined && (
                                            <div className="text-[10px] text-gray-500">
                                                Entrées totales: {verificationResult.entry_count}
                                            </div>
                                        )}
                                        {verificationResult.ticket_date && !verificationResult.is_multi_day && (
                                            <div className="text-[10px] text-blue-400">
                                                📅 {new Date(verificationResult.ticket_date).toLocaleDateString('fr-FR')}
                                            </div>
                                        )}
                                        {verificationResult.is_multi_day && (
                                            <div className="text-[10px] text-purple-400">
                                                📅 Pass Multi-Jours
                                            </div>
                                        )}
                                    </div>

                                    <Button
                                        onClick={closeResult}
                                        className="w-full"
                                        variant="outline"
                                    >
                                        <Scan className="w-4 h-4 mr-2" />
                                        Continuer
                                    </Button>
                                </div>
                            </motion.div>
                        )}
                    </AnimatePresence>
                </Card>

                {/* HISTORIQUE RAPIDE */}
                {scanHistory.length > 0 && (
                    <Card className="bg-gray-900/50 border-gray-800 p-3">
                        <div className="flex justify-between items-center mb-2 flex-wrap gap-2">
                            <p className="text-xs text-gray-400">📋 Derniers scans</p>
                            <div className="flex gap-1 flex-wrap">
                                <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={forceSync}
                                    className="text-xs text-blue-400 border-blue-600 hover:bg-blue-600/20"
                                >
                                    <RefreshCw className="w-3 h-3 mr-1" />
                                    Sync
                                </Button>
                                <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={clearLocalCache}
                                    className="text-xs text-yellow-400 border-yellow-600 hover:bg-yellow-600/20"
                                >
                                    <Trash2 className="w-3 h-3 mr-1" />
                                    Cache
                                </Button>
                            </div>
                        </div>
                        <div className="space-y-1 max-h-24 overflow-y-auto">
                            {scanHistory.slice(0, 5).map((s, i) => {
                                const isGuest = s.is_guest || false;
                                const isMoneyFusion = s.payment_method === 'moneyfusion_ticket';
                                const isMultiDay = s.is_multi_day || false;
                                
                                let badgeClass = '';
                                
                                if (s.success) {
                                    if (s.status_code === 'exit_registered') {
                                        badgeClass = 'bg-blue-500';
                                    } else if (s.status_code === 're_entry') {
                                        badgeClass = 'bg-purple-500';
                                    } else {
                                        badgeClass = 'bg-green-500';
                                    }
                                } else {
                                    if (s.status_code === 'already_used' || 
                                        s.status_code === 'already_exited' || 
                                        s.status_code === 'not_entered') {
                                        badgeClass = 'bg-yellow-500 text-black';
                                    } else if (s.status_code === 'not_valid_today' || 
                                               s.status_code === 'expired_date') {
                                        badgeClass = 'bg-orange-500 text-black';
                                    } else {
                                        badgeClass = 'bg-red-500';
                                    }
                                }
                                
                                return (
                                    <div key={i} className="flex justify-between items-center text-xs p-1 hover:bg-gray-800/50 rounded">
                                        <span className="truncate flex items-center gap-1 flex-wrap">
                                            <span>{s.attendee_name || s.code || 'Inconnu'}</span>
                                            {s.phone && (
                                                <span className="text-[8px] text-blue-400">
                                                    📱{s.phone}
                                                </span>
                                            )}
                                            {(isGuest || isMoneyFusion) && (
                                                <span className="text-[8px] text-yellow-500/70">
                                                    {isGuest ? '🎟️' : '💰'}
                                                </span>
                                            )}
                                            {isMultiDay && (
                                                <span className="text-[8px] text-purple-400">
                                                    📅 Multi
                                                </span>
                                            )}
                                            {s.ticket_date && !isMultiDay && (
                                                <span className="text-[8px] text-blue-400">
                                                    📅 {new Date(s.ticket_date).toLocaleDateString('fr-FR')}
                                                </span>
                                            )}
                                            {s.entry_count !== undefined && s.entry_count > 0 && (
                                                <span className="text-[8px] text-purple-400">
                                                    #{s.entry_count}
                                                </span>
                                            )}
                                            <span className="text-[8px] text-gray-500 font-mono">
                                                {s.code && s.code.substring(0, 8)}
                                            </span>
                                            <span className="text-[8px] text-gray-600">
                                                {s.status_code === 'checkin' ? '1ère' : 
                                                 s.status_code === 're_entry' ? 'Ré-entrée' : 
                                                 s.status_code === 'exit_registered' ? 'Sortie' : 
                                                 s.status_code === 'not_valid_today' ? '📅' : ''}
                                            </span>
                                        </span>
                                        <Badge 
                                            variant={s.success ? 'default' : 'destructive'} 
                                            className={`text-[10px] ${badgeClass}`}
                                        >
                                            {s.success ? '✅ OK' : '❌ NOK'}
                                        </Badge>
                                    </div>
                                );
                            })}
                        </div>
                    </Card>
                )}
            </div>
        </div>
    );
};

export default VerifyTicketPage;