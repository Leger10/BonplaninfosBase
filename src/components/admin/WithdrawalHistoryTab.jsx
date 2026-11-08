import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/customSupabaseClient';
import { toast } from '@/components/ui/use-toast';
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Loader2, Coins, Search, RefreshCw } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

const WithdrawalHistoryTab = ({ actorId }) => {
    const [logs, setLogs] = useState([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');

    const fetchLogs = useCallback(async () => {
        setLoading(true);
        try {
            // Utiliser directement la table organizer_withdrawal_requests pour l'historique
            let query = supabase
                .from('organizer_withdrawal_requests')
                .select(`
          id,
          amount_pi,
          amount_fcfa,
          status,
          admin_notes,
          requested_at,
          reviewed_at,
          paid_at,
          organizer:organizer_id (full_name, email),
          reviewer:reviewed_by_admin (full_name),
          super_reviewer:reviewed_by_superadmin (full_name)
        `)
                .neq('status', 'pending') // Exclure les demandes en attente
                .order('requested_at', { ascending: false });

            if (actorId) {
                query = query.or(`reviewed_by_admin.eq.${actorId},reviewed_by_superadmin.eq.${actorId}`);
            }

            if (searchTerm) {
                query = query.or(`organizer.full_name.ilike.%${searchTerm}%,organizer.email.ilike.%${searchTerm}%`);
            }

            const { data, error } = await query;
            if (error) throw error;

            // Transformer les données pour correspondre à l'interface attendue
            const transformedLogs = (data || []).map(request => ({
                id: request.id,
                created_at: request.reviewed_at || request.requested_at,
                action_type: `withdrawal_${request.status}`,
                details: {
                    amount_pi: request.amount_pi,
                    amount_fcfa: request.amount_fcfa,
                    notes: request.admin_notes,
                    status: request.status
                },
                target_user: request.organizer,
                actor: request.reviewer || request.super_reviewer
            }));

            setLogs(transformedLogs);
        } catch (error) {
            console.error('Erreur chargement historique:', error);
            toast({
                title: 'Erreur',
                description: "Impossible de charger l'historique des retraits.",
                variant: 'destructive'
            });
        } finally {
            setLoading(false);
        }
    }, [actorId, searchTerm]);

    useEffect(() => {
        fetchLogs();
    }, [fetchLogs]);

    const getStatusBadge = (status) => {
        const statusConfig = {
            withdrawal_approved: { variant: 'default', label: 'Approuvé' },
            withdrawal_rejected: { variant: 'destructive', label: 'Rejeté' },
            withdrawal_paid: { variant: 'secondary', label: 'Payé' }
        };

        const config = statusConfig[status] || statusConfig.withdrawal_approved;
        return <Badge variant={config.variant}>{config.label}</Badge>;
    };

    return (
        <Card className="glass-effect shadow-lg">
            <CardHeader>
                <CardTitle className="flex items-center justify-between">
                    <span>Historique des Traitements de Retraits</span>
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={fetchLogs}
                        disabled={loading}
                        className="flex items-center gap-2"
                    >
                        <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
                        Actualiser
                    </Button>
                </CardTitle>
                <CardDescription>
                    Suivi des approbations et rejets de demandes de retrait.
                </CardDescription>
            </CardHeader>
            <CardContent>
                <div className="relative mb-4">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                        placeholder="Rechercher par nom ou email d'organisateur..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="pl-10"
                    />
                </div>

                {loading ? (
                    <div className="flex justify-center p-8">
                        <Loader2 className="h-8 w-8 animate-spin text-primary" />
                    </div>
                ) : (
                    <div className="rounded-md border">
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Organisateur</TableHead>
                                    <TableHead>Montant</TableHead>
                                    <TableHead>Action</TableHead>
                                    {!actorId && <TableHead>Traité par</TableHead>}
                                    <TableHead>Date traitement</TableHead>
                                    <TableHead>Notes</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {logs.length === 0 ? (
                                    <TableRow>
                                        <TableCell colSpan={actorId ? 5 : 6} className="text-center py-8">
                                            Aucun traitement de retrait trouvé.
                                        </TableCell>
                                    </TableRow>
                                ) : (
                                    logs.map(log => (
                                        <TableRow key={log.id}>
                                            <TableCell>
                                                <p className="font-semibold">{log.target_user?.full_name || 'N/A'}</p>
                                                <p className="text-xs text-muted-foreground">{log.target_user?.email || 'N/A'}</p>
                                            </TableCell>
                                            <TableCell>
                                                <div className="font-bold flex items-center gap-1">
                                                    {log.details?.amount_pi} <Coins className="w-4 h-4 text-yellow-400" />
                                                </div>
                                                <div className="text-xs text-muted-foreground">
                                                    {log.details?.amount_fcfa?.toLocaleString('fr-FR')} FCFA
                                                </div>
                                            </TableCell>
                                            <TableCell>
                                                {getStatusBadge(log.action_type)}
                                            </TableCell>
                                            {!actorId && (
                                                <TableCell>
                                                    <p className="text-sm">{log.actor?.full_name || 'Système'}</p>
                                                </TableCell>
                                            )}
                                            <TableCell>
                                                {new Date(log.created_at).toLocaleDateString('fr-FR')}
                                                <div className="text-xs text-muted-foreground">
                                                    {new Date(log.created_at).toLocaleTimeString('fr-FR')}
                                                </div>
                                            </TableCell>
                                            <TableCell>
                                                <div className="text-sm max-w-xs truncate" title={log.details?.notes}>
                                                    {log.details?.notes || '—'}
                                                </div>
                                            </TableCell>
                                        </TableRow>
                                    ))
                                )}
                            </TableBody>
                        </Table>
                    </div>
                )}
            </CardContent>
        </Card>
    );
};

export default WithdrawalHistoryTab;