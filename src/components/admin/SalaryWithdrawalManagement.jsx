import React, { useState, useEffect } from 'react';
import { supabase } from '@/lib/customSupabaseClient';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from '@/components/ui/use-toast';
import { Loader2, Save, Check, X, Phone, Hash, User, CreditCard } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import { useAuth } from '@/contexts/SupabaseAuthContext';

// Super Admin Component to manage salary withdrawals
const SalaryWithdrawalManagement = () => {
    const [activeTab, setActiveTab] = useState('requests');

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center">
                <div>
                    <h2 className="text-2xl font-bold tracking-tight">Gestion des Retraits Salaires</h2>
                    <p className="text-muted-foreground">Supervisez et validez les demandes de salaire des administrateurs.</p>
                </div>
            </div>

            <Tabs value={activeTab} onValueChange={setActiveTab}>
                <TabsList>
                    <TabsTrigger value="requests">Demandes en attente</TabsTrigger>
                    <TabsTrigger value="history">Historique</TabsTrigger>
                    <TabsTrigger value="config">Configuration</TabsTrigger>
                </TabsList>

                <TabsContent value="requests" className="space-y-4 animate-in fade-in slide-in-from-left-2">
                    <RequestsTable status="pending" />
                </TabsContent>

                <TabsContent value="history" className="space-y-4 animate-in fade-in slide-in-from-left-2">
                    <RequestsTable status="history" />
                </TabsContent>

                <TabsContent value="config" className="space-y-4 animate-in fade-in slide-in-from-left-2">
                    <ConfigPanel />
                </TabsContent>
            </Tabs>
        </div>
    );
};

const RequestsTable = ({ status }) => {
    const { user } = useAuth();
    const [requests, setRequests] = useState([]);
    const [loading, setLoading] = useState(true);
    const [processingId, setProcessingId] = useState(null);

    const fetchRequests = async () => {
        setLoading(true);
        try {
            // Fetch request with related admin profile details
            let query = supabase
                .from('admin_withdrawal_requests')
                .select(`
                    *,
                    admin:admin_id (
                        full_name,
                        email,
                        phone,
                        city,
                        country
                    )
                `)
                .order('requested_at', { ascending: false });

            if (status === 'pending') {
                query = query.eq('status', 'pending');
            } else {
                query = query.neq('status', 'pending');
            }

            const { data, error } = await query;
            if (error) throw error;
            setRequests(data || []);
        } catch (error) {
            console.error("Error fetching requests:", error);
            toast({ title: "Erreur", description: "Impossible de charger les demandes.", variant: "destructive" });
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchRequests();
    }, [status]);

    const handleAction = async (id, action) => {
        setProcessingId(id);
        try {
            if (action === 'approved') {
                const { data, error } = await supabase.rpc('approve_admin_withdrawal', { 
                    p_request_id: id, 
                    p_processed_by: user.id 
                });

                if (error) throw error;
                if (!data.success) throw new Error(data.message);

                toast({ title: "Succès", description: "Demande approuvée et solde mis à jour.", variant: "success" });
            } else {
                const { error } = await supabase
                    .from('admin_withdrawal_requests')
                    .update({ 
                        status: 'rejected', 
                        processed_at: new Date().toISOString(),
                        processed_by: user.id
                    })
                    .eq('id', id);
                
                if (error) throw error;
                toast({ title: "Rejeté", description: "Demande rejetée." });
            }
            fetchRequests();
        } catch (error) {
            console.error("Processing error:", error);
            toast({ title: "Erreur", description: error.message, variant: "destructive" });
        } finally {
            setProcessingId(null);
        }
    };

    if (loading) return <div className="flex justify-center py-10"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;

    return (
        <Card>
            <CardHeader>
                <CardTitle>{status === 'pending' ? 'Validations requises' : 'Historique complet'}</CardTitle>
                <CardDescription>Vérifiez les identifiants de paiement avant de valider.</CardDescription>
            </CardHeader>
            <CardContent>
                <div className="overflow-x-auto">
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Demandeur</TableHead>
                                <TableHead>Montant</TableHead>
                                <TableHead>Détails Paiement</TableHead>
                                <TableHead>Infos Contact</TableHead>
                                <TableHead>Date</TableHead>
                                <TableHead>Statut</TableHead>
                                {status === 'pending' && <TableHead className="text-right">Actions</TableHead>}
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {requests.length === 0 ? (
                                <TableRow>
                                    <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                                        Aucune demande trouvée.
                                    </TableCell>
                                </TableRow>
                            ) : requests.map(req => (
                                <TableRow key={req.id} className={req.status === 'pending' ? 'bg-muted/20' : ''}>
                                    <TableCell>
                                        <div className="flex items-center gap-2">
                                            <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold">
                                                {req.admin?.full_name?.charAt(0) || 'A'}
                                            </div>
                                            <div>
                                                <div className="font-semibold">{req.admin?.full_name}</div>
                                                <div className="text-xs text-muted-foreground">{req.admin?.email}</div>
                                            </div>
                                        </div>
                                    </TableCell>
                                    <TableCell>
                                        <span className="font-bold text-lg text-primary">
                                            {req.amount_fcfa?.toLocaleString('fr-FR')}
                                        </span> 
                                        <span className="text-xs text-muted-foreground ml-1">FCFA</span>
                                    </TableCell>
                                    <TableCell>
                                        <div className="flex flex-col gap-1">
                                            <Badge variant="outline" className="w-fit capitalize">
                                                {req.method?.replace('_', ' ')}
                                            </Badge>
                                            <div className="flex items-center gap-1.5 text-sm font-medium">
                                                {req.method?.includes('bank') ? (
                                                    <>
                                                        <CreditCard className="h-3.5 w-3.5 text-muted-foreground" />
                                                        <span>{req.bank_name} - {req.account_number}</span>
                                                    </>
                                                ) : (
                                                    <>
                                                        <Hash className="h-3.5 w-3.5 text-muted-foreground" />
                                                        <span>{req.mobile_money_number || req.account_number}</span>
                                                    </>
                                                )}
                                            </div>
                                        </div>
                                    </TableCell>
                                    <TableCell>
                                        <div className="space-y-1">
                                            <div className="flex items-center gap-1.5 text-sm">
                                                <Phone className="h-3.5 w-3.5 text-muted-foreground" />
                                                <span>{req.admin?.phone || 'N/A'}</span>
                                            </div>
                                            <div className="text-xs text-muted-foreground">
                                                {req.admin?.city}, {req.admin?.country}
                                            </div>
                                        </div>
                                    </TableCell>
                                    <TableCell>
                                        <span className="text-sm whitespace-nowrap">
                                            {format(new Date(req.requested_at), 'dd MMM yyyy', { locale: fr })}
                                        </span>
                                        <div className="text-xs text-muted-foreground">
                                            {format(new Date(req.requested_at), 'HH:mm')}
                                        </div>
                                    </TableCell>
                                    <TableCell>
                                        <Badge variant={
                                            req.status === 'pending' ? 'secondary' : 
                                            req.status === 'approved' ? 'success' : 'destructive'
                                        }>
                                            {req.status === 'approved' ? 'Validé' : 
                                             req.status === 'pending' ? 'En attente' : 'Refusé'}
                                        </Badge>
                                    </TableCell>
                                    {status === 'pending' && (
                                        <TableCell className="text-right">
                                            <div className="flex justify-end gap-2">
                                                <Button 
                                                    size="sm" 
                                                    className="bg-green-600 hover:bg-green-700 text-white h-8 w-8 p-0" 
                                                    onClick={() => handleAction(req.id, 'approved')}
                                                    disabled={processingId === req.id}
                                                    title="Approuver"
                                                >
                                                    {processingId === req.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                                                </Button>
                                                <Button 
                                                    size="sm" 
                                                    variant="destructive" 
                                                    className="h-8 w-8 p-0"
                                                    onClick={() => handleAction(req.id, 'rejected')}
                                                    disabled={processingId === req.id}
                                                    title="Rejeter"
                                                >
                                                    {processingId === req.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <X className="h-4 w-4" />}
                                                </Button>
                                            </div>
                                        </TableCell>
                                    )}
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </div>
            </CardContent>
        </Card>
    );
};

const toDateInputValue = (day) => {
    const d = Math.min(28, Math.max(1, Number(day) || 5));
    const now = new Date();
    const dt = new Date(now.getFullYear(), now.getMonth(), d);
    const y = dt.getFullYear();
    const m = String(dt.getMonth() + 1).padStart(2, '0');
    const dd = String(dt.getDate()).padStart(2, '0');
    return `${y}-${m}-${dd}`;
};

const ConfigPanel = () => {
    const [config, setConfig] = useState(null);
    const [openingDate, setOpeningDate] = useState(toDateInputValue(5));
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);

    const fetchConfig = async () => {
        setLoading(true);
        try {
            const { data, error } = await supabase
                .from('admin_withdrawal_config')
                .select('*')
                .limit(1)
                .maybeSingle();
            if (error) throw error;
            if (data) {
                setConfig(data);
                setOpeningDate(toDateInputValue(data.withdrawal_available_date));
            } else {
                setConfig({
                    withdrawal_available_date: 5,
                    min_withdrawal_amount: 1000,
                    max_withdrawal_amount: 500000,
                    withdrawal_methods: ['Orange Money', 'Bank Transfer'],
                    min_withdrawal_pi: 50,
                    withdrawal_dates: [5],
                });
                setOpeningDate(toDateInputValue(5));
            }
        } catch (e) {
            console.error("Error config:", e);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { fetchConfig(); }, []);

    const handleSave = async () => {
        setSaving(true);
        try {
            const day = Math.min(28, Math.max(1, new Date(openingDate).getDate() || 5));
            const methodsRaw = config?.withdrawal_methods;
            const methods = Array.isArray(methodsRaw)
                ? methodsRaw
                : String(methodsRaw || 'Orange Money, Bank Transfer').split(',').map(s => s.trim()).filter(Boolean);
            const payload = {
                withdrawal_available_date: day,
                min_withdrawal_amount: Number(config?.min_withdrawal_amount ?? 1000),
                max_withdrawal_amount: Number(config?.max_withdrawal_amount ?? 500000),
                withdrawal_methods: methods,
                min_withdrawal_pi: Number(config?.min_withdrawal_pi ?? 50),
                withdrawal_dates: Array.isArray(config?.withdrawal_dates) && config.withdrawal_dates.length ? config.withdrawal_dates : [day],
            };

            let error;
            if (config?.id) {
                ({ error } = await supabase.from('admin_withdrawal_config').update(payload).eq('id', config.id));
            } else {
                ({ error } = await supabase.from('admin_withdrawal_config').insert([payload]));
            }

            if (error) throw error;
            toast({ title: "Configuration sauvegardée", description: `Jour de retrait admin : le ${day} de chaque mois.`, variant: "success" });
            fetchConfig();
        } catch (error) {
            toast({ title: "Erreur", description: error.message, variant: "destructive" });
        } finally {
            setSaving(false);
        }
    };

    if (loading) return <div className="flex justify-center p-10"><Loader2 className="animate-spin" /></div>;

    return (
        <Card>
            <CardHeader>
                <CardTitle>Configuration du système</CardTitle>
                <CardDescription>Paramètres globaux pour les retraits administrateurs.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
                <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-2">
                        <Label htmlFor="salary-opening-date">Date / jour d'ouverture des retraits</Label>
                        <Input
                            id="salary-opening-date"
                            type="date"
                            value={openingDate}
                            onChange={(e) => setOpeningDate(e.target.value)}
                        />
                        <p className="text-xs text-muted-foreground">
                            Sélectionnez une date dans le calendrier : le <strong>{Math.min(28, Math.max(1, new Date(openingDate).getDate() || 5))}</strong> de chaque mois sera appliqué comme jour de retrait des administrateurs.
                        </p>
                    </div>
                    <div className="space-y-2">
                        <Label>Méthodes autorisées (virgule)</Label>
                        <Input 
                            value={Array.isArray(config?.withdrawal_methods) ? config.withdrawal_methods.join(', ') : (config?.withdrawal_methods || '')} 
                            onChange={e => setConfig({ ...(config || {}), withdrawal_methods: e.target.value.split(',') })} 
                        />
                    </div>
                    <div className="space-y-2">
                        <Label>Minimum (FCFA)</Label>
                        <Input 
                            type="number" 
                            value={config?.min_withdrawal_amount ?? 1000} 
                            onChange={e => setConfig({ ...(config || {}), min_withdrawal_amount: e.target.value })} 
                        />
                    </div>
                    <div className="space-y-2">
                        <Label>Maximum (FCFA)</Label>
                        <Input 
                            type="number" 
                            value={config?.max_withdrawal_amount ?? 500000} 
                            onChange={e => setConfig({ ...(config || {}), max_withdrawal_amount: e.target.value })} 
                        />
                    </div>
                </div>
                <div className="flex justify-end pt-4">
                    <Button onClick={handleSave} disabled={saving}>
                        {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                        <Save className="mr-2 h-4 w-4" /> Sauvegarder
                    </Button>
                </div>
            </CardContent>
        </Card>
    );
};

export default SalaryWithdrawalManagement;