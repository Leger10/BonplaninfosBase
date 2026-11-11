import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Loader2, CheckCircle, XCircle, Search, FileText, Download } from 'lucide-react';
import { supabase } from '@/lib/customSupabaseClient';
import { useToast } from '@/components/ui/use-toast';
import { Input } from '@/components/ui/input';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { exportRowsToExcel } from "@/lib/excelExport";


const AdminPaymentsTab = () => {
  const [payments, setPayments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const { toast } = useToast();

  const fetchPayments = async () => {
    setLoading(true);
    try {
      // Fixed query: Simplified to remove incorrect nested relationship request
      // Instead of complex nested joins which were failing, we fetch the admin profile directly
      const { data, error } = await supabase
        .from('paiements_admin')
        .select(`
          id,
          mois,
          ca_zone,
          taux_commission,
          score,
          montant_a_payer,
          statut,
          paye_le,
          admin_id,
          admin:admin_id (
            full_name,
            email
          )
        `)
        .order('mois', { ascending: false });

      if (error) throw error;
      setPayments(data || []);
    } catch (error) {
      console.error('Error fetching admin payments:', error);
      toast({
        title: 'Erreur',
        description: 'Impossible de charger les paiements administrateurs.',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPayments();
  }, []);

  const handleMarkAsPaid = async (paymentId) => {
    try {
      const { error } = await supabase
        .from('paiements_admin')
        .update({
          statut: 'payé',
          paye_le: new Date().toISOString()
        })
        .eq('id', paymentId);

      if (error) throw error;

      setPayments(payments.map(p =>
        p.id === paymentId
          ? { ...p, statut: 'payé', paye_le: new Date().toISOString() }
          : p
      ));

      toast({
        title: 'Paiement mis à jour',
        description: 'Le statut a été changé en "Payé".',
        variant: 'success',
      });
    } catch (error) {
      toast({
        title: 'Erreur',
        description: 'Impossible de mettre à jour le paiement.',
        variant: 'destructive',
      });
    }
  };

  const exportToExcel = async () => {
    const dataToExport = filteredPayments.map(p => ({
      'Mois': format(new Date(p.mois), 'MMMM yyyy', { locale: fr }),
      'Administrateur': p.admin?.full_name || 'Inconnu',
      'Email': p.admin?.email || 'Inconnu',
      'CA Zone (FCFA)': p.ca_zone,
      'Taux Commission (%)': p.taux_commission,
      'Score Performance': p.score,
      'Montant à Payer (FCFA)': p.montant_a_payer,
      'Statut': p.statut === 'payé' ? 'Payé' : 'En attente',
      'Date Paiement': p.paye_le ? format(new Date(p.paye_le), 'dd/MM/yyyy') : '-'
    }));

    try {
      await exportRowsToExcel({
        rows: dataToExport,
        name: "Paiements Admin",
        fileName: `paiements_admin_${format(new Date(), 'dd-MM-yyyy')}.xlsx`,
      });
    } catch (error) {
      console.error("Erreur export Excel paiements:", error);
    }
  };

  const filteredPayments = payments.filter(payment => {
    const matchesSearch =
      (payment.admin?.full_name || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (payment.admin?.email || '').toLowerCase().includes(searchTerm.toLowerCase());

    const matchesStatus = statusFilter === 'all' || payment.statut === statusFilter;

    return matchesSearch && matchesStatus;
  });

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>Paiements Administrateurs</CardTitle>
        <Button onClick={exportToExcel} variant="outline" size="sm">
          <Download className="mr-2 h-4 w-4" />
          Exporter Excel
        </Button>
      </CardHeader>
      <CardContent>
        <div className="flex gap-4 mb-6">
          <div className="relative flex-1">
            <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Rechercher un administrateur..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-8"
            />
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Filtrer par statut" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tous les statuts</SelectItem>
              <SelectItem value="en_attente">En attente</SelectItem>
              <SelectItem value="payé">Payé</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {loading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : filteredPayments.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            Aucun paiement trouvé.
          </div>
        ) : (
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Mois</TableHead>
                  <TableHead>Administrateur</TableHead>
                  <TableHead>Performance</TableHead>
                  <TableHead className="text-right">Montant (FCFA)</TableHead>
                  <TableHead>Statut</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredPayments.map((payment) => (
                  <TableRow key={payment.id}>
                    <TableCell className="font-medium">
                      {format(new Date(payment.mois), 'MMMM yyyy', { locale: fr })}
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col">
                        <span className="font-medium">{payment.admin?.full_name || 'Inconnu'}</span>
                        <span className="text-xs text-muted-foreground">{payment.admin?.email}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col gap-1 text-xs">
                        <span>CA: {payment.ca_zone?.toLocaleString()} FCFA</span>
                        <span>Taux: {payment.taux_commission}%</span>
                        <span>Score: {payment.score}</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-right font-bold text-green-600">
                      {payment.montant_a_payer?.toLocaleString()} FCFA
                    </TableCell>
                    <TableCell>
                      <Badge variant={payment.statut === 'payé' ? 'success' : 'warning'}>
                        {payment.statut === 'payé' ? 'Payé' : 'En attente'}
                      </Badge>
                      {payment.paye_le && (
                        <div className="text-xs text-muted-foreground mt-1">
                          le {format(new Date(payment.paye_le), 'dd/MM/yyyy')}
                        </div>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      {payment.statut !== 'payé' && (
                        <Button
                          size="sm"
                          onClick={() => handleMarkAsPaid(payment.id)}
                          className="bg-green-600 hover:bg-green-700"
                        >
                          <CheckCircle className="mr-2 h-3 w-3" />
                          Marquer payé
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default AdminPaymentsTab;