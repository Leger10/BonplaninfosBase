import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/customSupabaseClient';
import { toast } from '@/components/ui/use-toast';
import { 
  Loader2, 
  Search, 
  Filter, 
  Download, 
  Calendar as CalendarIcon, 
  CreditCard, 
  CheckCircle, 
  XCircle, 
  UserCog, 
  LogIn, 
  LogOut, 
  FileText,
  ArrowRightLeft,
  Wallet,
  ShieldAlert,
  Trash2,
  Undo2,
  ChevronLeft,
  ChevronRight,
  Mail
} from 'lucide-react';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import { exportRowsToExcel } from "@/lib/excelExport";


const ITEMS_PER_PAGE = 10;

const ACTION_CONFIG = {
  user_credited: { 
    label: "Crédit Utilisateur", 
    color: "text-blue-600 bg-blue-50 border-blue-200", 
    icon: CreditCard 
  },
  manual_credit: { 
    label: "Crédit Manuel", 
    color: "text-blue-600 bg-blue-50 border-blue-200", 
    icon: CreditCard 
  },
  user_debited: { 
    label: "Débit Utilisateur", 
    color: "text-orange-600 bg-orange-50 border-orange-200", 
    icon: Wallet 
  },
  withdrawal_approved: { 
    label: "Retrait Approuvé", 
    color: "text-green-600 bg-green-50 border-green-200", 
    icon: CheckCircle 
  },
  withdrawal_rejected: { 
    label: "Retrait Rejeté", 
    color: "text-red-600 bg-red-50 border-red-200", 
    icon: XCircle 
  },
  withdrawal_requested: {
    label: "Retrait Demandé",
    color: "text-orange-600 bg-orange-50 border-orange-200",
    icon: Wallet
  },
  role_updated: { 
    label: "Rôle Modifié", 
    color: "text-purple-600 bg-purple-50 border-purple-200", 
    icon: UserCog 
  },
  user_deleted: {
    label: "Utilisateur Supprimé",
    color: "text-destructive bg-destructive/10 border-destructive/20",
    icon: Trash2
  },
  login: { 
    label: "Connexion", 
    color: "text-gray-600 bg-gray-50 border-gray-200", 
    icon: LogIn 
  },
  logout: { 
    label: "Déconnexion", 
    color: "text-gray-600 bg-gray-50 border-gray-200", 
    icon: LogOut 
  },
  credit_reversal: {
    label: "Annulation Crédit",
    color: "text-amber-600 bg-amber-50 border-amber-200",
    icon: Undo2
  },
  license_renewed: {
    label: "Licence Renouvelée",
    color: "text-indigo-600 bg-indigo-50 border-indigo-200",
    icon: FileText
  },
  default: { 
    label: "Action Admin", 
    color: "text-slate-600 bg-slate-50 border-slate-200", 
    icon: FileText 
  }
};

const ActivityLogTab = () => {
    const [logs, setLogs] = useState([]);
    const [loading, setLoading] = useState(true);
    const [totalCount, setTotalCount] = useState(0);
    const [page, setPage] = useState(1);
    
    // Filters
    const [searchTerm, setSearchTerm] = useState('');
    const [actionType, setActionType] = useState('all');
    const [dateRange, setDateRange] = useState({ from: null, to: null });

    const fetchLogs = useCallback(async () => {
        setLoading(true);
        try {
            // Fetch logs with actor and target details
            let query = supabase
                .from('admin_logs')
                .select(`
                    *,
                    actor:actor_id (full_name, email, avatar_url, user_type),
                    target:target_id (full_name, email, avatar_url)
                `, { count: 'exact' });

            // Filters
            if (searchTerm) {
                // Search across multiple columns/relations is tricky in Supabase directly without complex views
                // We'll search on the log text fields and allow searching by stored names
                // Note: This relies on actor_name/target_name being populated in admin_logs for best performance
                const searchPattern = `%${searchTerm}%`;
                query = query.or(
                    `action_type.ilike.${searchPattern},actor_name.ilike.${searchPattern},target_name.ilike.${searchPattern},actor_email.ilike.${searchPattern}`
                );
            }

            if (actionType && actionType !== 'all') {
                query = query.eq('action_type', actionType);
            }

            if (dateRange?.from) {
                query = query.gte('created_at', dateRange.from.toISOString());
            }
            if (dateRange?.to) {
                // Set to end of day
                const toDate = new Date(dateRange.to);
                toDate.setHours(23, 59, 59, 999);
                query = query.lte('created_at', toDate.toISOString());
            }

            // Pagination
            const from = (page - 1) * ITEMS_PER_PAGE;
            const to = from + ITEMS_PER_PAGE - 1;
            
            const { data, error, count } = await query
                .order('created_at', { ascending: false })
                .range(from, to);

            if (error) throw error;
            
            setLogs(data || []);
            setTotalCount(count || 0);
        } catch (error) {
            console.error('Error fetching logs:', error);
            toast({ 
                title: "Erreur", 
                description: "Impossible de charger le journal d'activité.", 
                variant: "destructive" 
            });
        } finally {
            setLoading(false);
        }
    }, [page, searchTerm, actionType, dateRange]);

    useEffect(() => {
        const timer = setTimeout(() => {
            fetchLogs();
        }, 300); // Debounce search
        return () => clearTimeout(timer);
    }, [fetchLogs]);

    const handleExport = async () => {
        try {
            const exportData = logs.map(log => ({
                Date: format(new Date(log.created_at), 'dd/MM/yyyy HH:mm'),
                Action: ACTION_CONFIG[log.action_type]?.label || log.action_type,
                Acteur: log.actor?.full_name || log.actor_name || 'Système',
                Email_Acteur: log.actor?.email || log.actor_email || '-',
                Cible: log.target?.full_name || log.target_name || '-',
                Détails: JSON.stringify(log.details || {})
            }));

            await exportRowsToExcel({
                rows: exportData,
                name: "Journal Activité",
                fileName: `journal_activite_${format(new Date(), 'yyyyMMdd')}.xlsx`,
            });

            toast({ title: "Export réussi", description: "Le fichier a été téléchargé.", variant: "success" });
        } catch (error) {
            console.error("Export error:", error);
            toast({ title: "Erreur d'export", description: error.message, variant: "destructive" });
        }
    };

    const getActionStyle = (type) => ACTION_CONFIG[type] || ACTION_CONFIG.default;

    const renderDetails = (log) => {
        const details = log.details || {};
        const type = log.action_type;
        const isReversed = details.reversed === true;

        return (
            <div className="text-sm space-y-1.5">
                {/* Amount & Reason */}
                {(type === 'user_credited' || type === 'user_debited' || type === 'manual_credit') && (
                    <div className="flex flex-wrap gap-2 items-center">
                        <div className="flex items-center gap-1.5">
                            <span className="font-medium text-muted-foreground">Montant:</span>
                            <Badge variant="outline" className="font-mono text-sm font-bold">
                                {details.amount?.toLocaleString()} pièces
                            </Badge>
                        </div>
                        {details.reason && (
                            <div className="flex items-center gap-1.5">
                                <span className="font-medium text-muted-foreground">Raison:</span>
                                <span className="text-foreground font-medium">"{details.reason}"</span>
                            </div>
                        )}
                    </div>
                )}

                {/* Withdrawal Info */}
                {type === 'withdrawal_approved' && (
                    <div className="space-y-1">
                        <div className="flex flex-wrap gap-2 items-center">
                            <Badge className="bg-green-100 text-green-800 border-green-200 hover:bg-green-200">
                                {details.amount_pi?.toLocaleString()} pièces
                            </Badge>
                            {details.amount_fcfa && (
                                <span className="text-muted-foreground text-xs">
                                    ({details.amount_fcfa?.toLocaleString()} FCFA)
                                </span>
                            )}
                        </div>
                        {details.notes && <p className="text-xs text-muted-foreground italic">Notes: {details.notes}</p>}
                    </div>
                )}

                {/* Role Updates */}
                {type === 'role_updated' && (
                    <div className="flex items-center gap-2 flex-wrap">
                        <Badge variant="secondary" className="line-through opacity-70">{details.old_role || '?'}</Badge>
                        <ArrowRightLeft className="w-3 h-3 text-muted-foreground" />
                        <Badge variant="default" className="bg-purple-100 text-purple-800 hover:bg-purple-200 border-purple-200">
                            {details.new_role}
                        </Badge>
                    </div>
                )}

                {/* Reversal Status - Prominent Display */}
                {isReversed && (
                    <div className="mt-2 p-2 bg-red-50 border border-red-100 rounded-md flex items-start gap-2 text-xs text-red-700 animate-in fade-in slide-in-from-top-1">
                        <Undo2 className="w-4 h-4 mt-0.5 shrink-0" />
                        <div>
                            <p className="font-bold">❌ ANNULÉ</p>
                            <p>Le: {details.reversed_at ? format(new Date(details.reversed_at), 'dd/MM/yyyy HH:mm') : '-'}</p>
                            <p>Par: {details.reversed_by_name || 'Admin'}</p>
                        </div>
                    </div>
                )}
                
                {/* Fallback for generic details or JSON debug */}
                {!['user_credited', 'manual_credit', 'user_debited', 'withdrawal_approved', 'role_updated'].includes(type) && Object.keys(details).length > 0 && (
                    <div className="bg-muted/30 rounded p-1.5 text-xs font-mono text-muted-foreground overflow-x-auto">
                        {Object.entries(details).map(([key, value]) => (
                            key !== 'reversed' && key !== 'reversed_by' && key !== 'reversed_at' && (
                                <div key={key} className="flex gap-1">
                                    <span className="opacity-70">{key}:</span>
                                    <span className="font-semibold truncate">{typeof value === 'object' ? JSON.stringify(value) : String(value)}</span>
                                </div>
                            )
                        ))}
                    </div>
                )}
            </div>
        );
    };

    const totalPages = Math.ceil(totalCount / ITEMS_PER_PAGE);

    return (
        <div className="space-y-6">
            {/* Header & Filters */}
            <div className="flex flex-col md:flex-row justify-between gap-4 items-start md:items-center">
                <div>
                    <h2 className="text-2xl font-bold tracking-tight">Journal d'Activité</h2>
                    <p className="text-muted-foreground text-sm">
                        Historique complet des actions administratives et événements système.
                    </p>
                </div>
                <div className="flex items-center gap-2 self-end">
                    <Button variant="outline" size="sm" onClick={fetchLogs} disabled={loading}>
                        {loading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Filter className="w-4 h-4 mr-2" />}
                        Actualiser
                    </Button>
                    <Button variant="default" size="sm" onClick={handleExport} disabled={logs.length === 0}>
                        <Download className="w-4 h-4 mr-2" /> Exporter
                    </Button>
                </div>
            </div>

            <Card className="border-muted">
                <CardHeader className="pb-3 border-b bg-muted/10">
                    <div className="flex flex-col lg:flex-row gap-4">
                        {/* Search */}
                        <div className="relative flex-1 min-w-[200px]">
                            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                            <Input
                                placeholder="Rechercher (action, acteur, cible)..."
                                className="pl-9 bg-background"
                                value={searchTerm}
                                onChange={(e) => { setSearchTerm(e.target.value); setPage(1); }}
                            />
                        </div>

                        {/* Type Filter */}
                        <Select value={actionType} onValueChange={(val) => { setActionType(val); setPage(1); }}>
                            <SelectTrigger className="w-full lg:w-[220px] bg-background">
                                <SelectValue placeholder="Type d'action" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">Toutes les actions</SelectItem>
                                {Object.entries(ACTION_CONFIG).map(([key, config]) => (
                                    key !== 'default' && <SelectItem key={key} value={key}>{config.label}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>

                        {/* Date Filter */}
                        <Popover>
                            <PopoverTrigger asChild>
                                <Button variant="outline" className="w-full lg:w-[240px] justify-start text-left font-normal bg-background">
                                    <CalendarIcon className="mr-2 h-4 w-4" />
                                    {dateRange?.from ? (
                                        dateRange.to ? (
                                            <>
                                                {format(dateRange.from, "d MMM", { locale: fr })} -{" "}
                                                {format(dateRange.to, "d MMM", { locale: fr })}
                                            </>
                                        ) : (
                                            format(dateRange.from, "d MMM yyyy", { locale: fr })
                                        )
                                    ) : (
                                        <span>Filtrer par date</span>
                                    )}
                                </Button>
                            </PopoverTrigger>
                            <PopoverContent className="w-auto p-0" align="end">
                                <Calendar
                                    initialFocus
                                    mode="range"
                                    defaultMonth={dateRange?.from}
                                    selected={dateRange}
                                    onSelect={(range) => { setDateRange(range); setPage(1); }}
                                    numberOfMonths={2}
                                />
                            </PopoverContent>
                        </Popover>
                        
                        {/* Reset */}
                        {(searchTerm || actionType !== 'all' || dateRange?.from) && (
                            <Button 
                                variant="ghost" 
                                onClick={() => { setSearchTerm(''); setActionType('all'); setDateRange({ from: null, to: null }); }}
                                className="px-3 text-muted-foreground hover:text-foreground"
                            >
                                Réinitialiser
                            </Button>
                        )}
                    </div>
                </CardHeader>
                <CardContent className="p-0">
                    {loading && logs.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-20 space-y-4">
                            <Loader2 className="w-10 h-10 animate-spin text-primary/50" />
                            <p className="text-sm text-muted-foreground">Chargement du journal...</p>
                        </div>
                    ) : logs.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-20 text-center space-y-3 bg-muted/5">
                            <div className="w-16 h-16 bg-muted rounded-full flex items-center justify-center">
                                <ShieldAlert className="w-8 h-8 text-muted-foreground/50" />
                            </div>
                            <h3 className="text-lg font-semibold">Aucune activité trouvée</h3>
                            <p className="text-muted-foreground max-w-sm">
                                Aucun journal ne correspond à vos critères. Essayez de modifier les filtres ou la période.
                            </p>
                        </div>
                    ) : (
                        <div className="divide-y divide-border">
                            {logs.map((log) => {
                                const Style = getActionStyle(log.action_type);
                                const Icon = Style.icon;
                                
                                return (
                                    <div key={log.id} className="p-4 hover:bg-accent/5 transition-colors group">
                                        <div className="flex flex-col md:flex-row gap-4">
                                            
                                            {/* Left: Icon & Time */}
                                            <div className="md:w-[200px] shrink-0 flex md:flex-col items-center md:items-start gap-3 md:gap-1">
                                                <div className="flex items-center gap-2">
                                                    <div className={`w-8 h-8 rounded-full flex items-center justify-center border shadow-sm shrink-0 ${Style.color}`}>
                                                        <Icon className="w-4 h-4" />
                                                    </div>
                                                    <span className="font-semibold text-sm md:hidden">{Style.label}</span>
                                                </div>
                                                <div className="flex flex-col">
                                                    <span className="text-xs font-medium hidden md:inline-block mb-1 px-2 py-0.5 rounded-full bg-muted/50 w-fit">
                                                        {Style.label}
                                                    </span>
                                                    <span className="text-xs text-muted-foreground pl-1">
                                                        {format(new Date(log.created_at), "d MMM yyyy", { locale: fr })}
                                                    </span>
                                                    <span className="text-xs text-muted-foreground pl-1">
                                                        {format(new Date(log.created_at), "HH:mm", { locale: fr })}
                                                    </span>
                                                </div>
                                            </div>

                                            {/* Middle: Actors */}
                                            <div className="md:w-[300px] shrink-0 space-y-2.5 py-1">
                                                {/* Actor */}
                                                <div className="flex items-center gap-2">
                                                    <span className="text-[10px] uppercase tracking-wider text-muted-foreground w-10 shrink-0">Acteur</span>
                                                    <div className="flex items-center gap-2 bg-muted/30 px-2 py-1 rounded-full max-w-full">
                                                        <Avatar className="w-5 h-5 border">
                                                            <AvatarImage src={log.actor?.avatar_url} />
                                                            <AvatarFallback className="text-[8px] bg-primary/10 text-primary">
                                                                {(log.actor?.full_name?.[0] || log.actor_name?.[0] || 'S').toUpperCase()}
                                                            </AvatarFallback>
                                                        </Avatar>
                                                        <div className="flex flex-col overflow-hidden">
                                                            <span className="text-xs font-medium truncate max-w-[140px]" title={log.actor_email}>
                                                                {log.actor?.full_name || log.actor_name || 'Système'}
                                                            </span>
                                                        </div>
                                                    </div>
                                                </div>

                                                {/* Target */}
                                                {log.target_id && (
                                                    <div className="flex items-center gap-2">
                                                        <span className="text-[10px] uppercase tracking-wider text-muted-foreground w-10 shrink-0">Cible</span>
                                                        <div className="flex items-center gap-2 bg-muted/30 px-2 py-1 rounded-full max-w-full">
                                                            <Avatar className="w-5 h-5 border">
                                                                <AvatarImage src={log.target?.avatar_url} />
                                                                <AvatarFallback className="text-[8px] bg-indigo-50 text-indigo-600">
                                                                    {(log.target?.full_name?.[0] || log.target_name?.[0] || '?').toUpperCase()}
                                                                </AvatarFallback>
                                                            </Avatar>
                                                            <div className="flex flex-col overflow-hidden">
                                                                <span className="text-xs font-medium truncate max-w-[140px]" title={log.target_email}>
                                                                    {log.target?.full_name || log.target_name || 'Utilisateur'}
                                                                </span>
                                                            </div>
                                                        </div>
                                                    </div>
                                                )}
                                            </div>

                                            {/* Right: Details */}
                                            <div className="flex-1 min-w-0 py-1 border-l md:pl-4 md:border-l-border/50">
                                                <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Détails</div>
                                                {renderDetails(log)}
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}

                    {/* Pagination Footer */}
                    {totalCount > 0 && (
                        <div className="p-4 border-t bg-muted/5 flex items-center justify-between">
                            <p className="text-xs text-muted-foreground">
                                Affichage de <strong>{((page - 1) * ITEMS_PER_PAGE) + 1}</strong> à <strong>{Math.min(page * ITEMS_PER_PAGE, totalCount)}</strong> sur <strong>{totalCount}</strong> entrées
                            </p>
                            <div className="flex items-center gap-2">
                                <Button 
                                    variant="outline" 
                                    size="icon" 
                                    className="h-8 w-8"
                                    onClick={() => setPage(p => Math.max(1, p - 1))}
                                    disabled={page === 1}
                                >
                                    <ChevronLeft className="w-4 h-4" />
                                </Button>
                                <div className="text-xs font-medium px-2">
                                    Page {page} / {totalPages}
                                </div>
                                <Button 
                                    variant="outline" 
                                    size="icon" 
                                    className="h-8 w-8"
                                    onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                                    disabled={page === totalPages}
                                >
                                    <ChevronRight className="w-4 h-4" />
                                </Button>
                            </div>
                        </div>
                    )}
                </CardContent>
            </Card>
        </div>
    );
};

export default ActivityLogTab;