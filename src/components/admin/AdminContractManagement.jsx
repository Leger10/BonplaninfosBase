import React, { useState, useEffect } from 'react';
import { supabase } from '@/lib/customSupabaseClient';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from "@/components/ui/table";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { 
  Search, 
  Download, 
  ExternalLink, 
  FileText, 
  CheckCircle, 
  XCircle, 
  Clock, 
  Trash2, 
  Save, 
  Copy,
  AlertTriangle,
  RefreshCw
} from 'lucide-react';
import { toast } from '@/components/ui/use-toast';
import { useCopyToClipboard } from '@/hooks/useCopyToClipboard';
import { exportRowsToExcel } from '@/lib/excelExport';

/**
 * CRITICAL CONFIGURATION NOTE:
 * This component requires a Supabase Storage bucket named 'contracts'.
 * Public access must be enabled for this bucket for the file previews and downloads to work correctly via public URLs.
 * 
 * Bucket Policy should allow:
 * - Public SELECT (read) access for authenticated users or public if desired (depends on privacy requirements)
 * - INSERT/UPDATE/DELETE for authenticated users (or specific roles)
 */

const ADMIN_EMAILS = ['bonplaninfos@gmail.com', 'digihouse10@gmail.com'];

const AdminContractManagement = () => {
  const { user } = useAuth();
  const [submissions, setSubmissions] = useState([]);
  const [filteredSubmissions, setFilteredSubmissions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedSubmission, setSelectedSubmission] = useState(null);
  const [isDetailsOpen, setIsDetailsOpen] = useState(false);
  const [notes, setNotes] = useState('');
  const [status, setStatus] = useState('');
  const [updating, setUpdating] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [copiedText, copy] = useCopyToClipboard();

  // Access Control
  const hasAccess = user && ADMIN_EMAILS.includes(user.email);

  useEffect(() => {
    if (hasAccess) {
      fetchSubmissions();
    }
  }, [hasAccess]);

  useEffect(() => {
    if (submissions) {
      const lowerTerm = searchTerm.toLowerCase();
      const filtered = submissions.filter(sub => 
        (sub.user_name?.toLowerCase() || '').includes(lowerTerm) ||
        (sub.contract_type?.toLowerCase() || '').includes(lowerTerm) ||
        (sub.user_email?.toLowerCase() || '').includes(lowerTerm)
      );
      setFilteredSubmissions(filtered);
    }
  }, [searchTerm, submissions]);

  const fetchSubmissions = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('contract_submissions')
        .select('*')
        .order('submitted_at', { ascending: false });

      if (error) throw error;
      setSubmissions(data || []);
      setFilteredSubmissions(data || []);
    } catch (error) {
      console.error('Error fetching contracts:', error);
      toast({
        title: "Erreur de chargement",
        description: "Impossible de récupérer les contrats.",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const handleRowClick = (submission) => {
    setSelectedSubmission(submission);
    setNotes(submission.admin_notes || '');
    setStatus(submission.status || 'pending');
    setIsDetailsOpen(true);
  };

  const handleUpdate = async () => {
    if (!selectedSubmission) return;
    setUpdating(true);
    try {
      const { error } = await supabase
        .from('contract_submissions')
        .update({ 
          status: status,
          admin_notes: notes,
          updated_at: new Date().toISOString(),
          reviewed_by: user.id
        })
        .eq('id', selectedSubmission.id);

      if (error) throw error;

      toast({
        title: "Mise à jour réussie",
        description: "Le statut et les notes ont été enregistrés.",
        className: "bg-green-600 text-white"
      });
      
      const updatedSubmissions = submissions.map(s => 
        s.id === selectedSubmission.id ? { ...s, status, admin_notes: notes } : s
      );
      setSubmissions(updatedSubmissions);
      setIsDetailsOpen(false);
    } catch (error) {
      console.error('Update error:', error);
      toast({
        title: "Erreur de mise à jour",
        description: error.message,
        variant: "destructive"
      });
    } finally {
      setUpdating(false);
    }
  };

  const handleDelete = async () => {
    if (!selectedSubmission || !confirm("Êtes-vous sûr de vouloir supprimer ce contrat ? Cette action est irréversible.")) return;
    
    setUpdating(true);
    try {
      const { error } = await supabase
        .from('contract_submissions')
        .delete()
        .eq('id', selectedSubmission.id);

      if (error) throw error;

      toast({
        title: "Contrat supprimé",
        description: "L'enregistrement a été supprimé avec succès."
      });

      setSubmissions(submissions.filter(s => s.id !== selectedSubmission.id));
      setIsDetailsOpen(false);
    } catch (error) {
      console.error('Delete error:', error);
      toast({
        title: "Erreur de suppression",
        description: error.message,
        variant: "destructive"
      });
    } finally {
      setUpdating(false);
    }
  };

  const handleRobustDownload = async (url, filename) => {
    if (!url) return;
    setDownloading(true);
    
    try {
      // 1. Try simple fetch to check if accessible
      const response = await fetch(url, { method: 'GET' });
      
      if (!response.ok) {
        throw new Error(`Le fichier n'est pas accessible (Status: ${response.status})`);
      }

      // 2. Download as blob
      const blob = await response.blob();
      const blobUrl = window.URL.createObjectURL(blob);
      
      // 3. Trigger download
      const link = document.createElement('a');
      link.href = blobUrl;
      link.download = filename || 'contrat.pdf';
      document.body.appendChild(link);
      link.click();
      
      // 4. Cleanup
      document.body.removeChild(link);
      window.URL.revokeObjectURL(blobUrl);
      
      toast({
        title: "Téléchargement réussi",
        description: "Le fichier a été téléchargé.",
        className: "bg-green-600 text-white"
      });
    } catch (error) {
      console.error("Download failed:", error);
      toast({
        title: "Échec du téléchargement",
        description: "Impossible de télécharger le fichier. Essayez de l'ouvrir dans un nouvel onglet.",
        variant: "destructive",
        action: (
          <Button variant="outline" size="sm" onClick={() => window.open(url, '_blank')}>
            Ouvrir l'URL
          </Button>
        )
      });
    } finally {
      setDownloading(false);
    }
  };

  const exportToExcel = async () => {
    const rows = submissions.map(s => ({
      ID: s.id,
      Date: new Date(s.submitted_at).toLocaleDateString('fr-FR'),
      Nom: s.user_name,
      Email: s.user_email,
      Téléphone: s.user_phone,
      Type: s.contract_type,
      Statut: s.status,
      Notes: s.admin_notes,
      Fichier: s.contract_file_url
    }));

    try {
      await exportRowsToExcel({ rows, name: "Contrats", fileName: "contrats_export.xlsx" });
    } catch (error) {
      console.error("Erreur export Excel contrats:", error);
    }
  };

  const getStatusBadge = (status) => {
    switch(status) {
      case 'approved': return <Badge className="bg-green-600 hover:bg-green-700"><CheckCircle className="w-3 h-3 mr-1"/> Approuvé</Badge>;
      case 'rejected': return <Badge className="bg-red-600 hover:bg-red-700"><XCircle className="w-3 h-3 mr-1"/> Rejeté</Badge>;
      default: return <Badge className="bg-yellow-600 hover:bg-yellow-700"><Clock className="w-3 h-3 mr-1"/> En attente</Badge>;
    }
  };

  // Helper to validate URL format
  const isValidContractUrl = (url) => {
    if (!url) return false;
    // Check if it points to 'contracts' bucket or is a valid public URL
    return url.includes('/contracts/') || url.includes('supabase.co/storage');
  };

  const renderFilePreview = (url) => {
    if (!url) {
      return (
        <div className="flex flex-col items-center justify-center h-full text-gray-500 bg-gray-900/50 p-8 rounded border border-gray-800 border-dashed">
          <AlertTriangle className="w-12 h-12 mb-2 text-yellow-500" />
          <p>URL du fichier manquante</p>
        </div>
      );
    }

    if (!isValidContractUrl(url)) {
      return (
        <div className="flex flex-col items-center justify-center h-full text-gray-500 bg-gray-900/50 p-8 rounded border border-gray-800 border-dashed">
          <AlertTriangle className="w-12 h-12 mb-2 text-orange-500" />
          <p className="text-center">Format d'URL potentiellement incorrect.<br/>Vérifiez le bucket 'contracts'.</p>
          <Button variant="link" className="mt-2 text-blue-400" onClick={() => window.open(url, '_blank')}>
            Tenter d'ouvrir
          </Button>
        </div>
      );
    }

    const isPdf = url.toLowerCase().includes('.pdf');
    const isImage = url.match(/\.(jpeg|jpg|png|gif|webp)$/i);

    if (isPdf) {
      return (
        <div className="w-full h-full relative bg-gray-800 rounded-md overflow-hidden">
          <iframe 
            src={`${url}#toolbar=0&navpanes=0`} 
            className="w-full h-full absolute inset-0 bg-white"
            title="Aperçu du contrat PDF"
            onError={(e) => {
              // Note: iframe onError is limited due to CORS, but helpful for basic network failures
              console.error("Iframe load error", e);
            }}
          />
          <div className="absolute top-2 right-2 bg-black/50 p-1 rounded">
             <Button size="xs" variant="ghost" onClick={() => window.open(url, '_blank')} className="text-white hover:text-blue-300">
               <ExternalLink className="w-4 h-4" />
             </Button>
          </div>
        </div>
      );
    }
    
    if (isImage) {
      return (
        <div className="flex items-center justify-center h-full bg-gray-900 overflow-hidden rounded-md relative group">
          <img 
            src={url} 
            alt="Aperçu" 
            className="max-w-full max-h-full object-contain"
            onError={(e) => { 
              e.target.style.display = 'none'; 
              e.target.parentElement.innerHTML = '<div class="text-red-400 p-4 text-center">Erreur de chargement de l\'image (404 ou accès refusé)</div>';
            }}
          />
          <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-all pointer-events-none" />
        </div>
      );
    }

    return (
      <div className="flex flex-col items-center justify-center h-full text-gray-400 bg-gray-900 p-8 rounded border border-gray-700">
        <FileText className="w-16 h-16 mb-4 text-blue-500" />
        <p className="mb-4 text-center">L'aperçu n'est pas disponible pour ce type de fichier.</p>
        <Button onClick={() => window.open(url, '_blank')} variant="outline">
          <ExternalLink className="w-4 h-4 mr-2" /> Ouvrir le fichier
        </Button>
      </div>
    );
  };

  if (!user) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-center p-4">
        <h2 className="text-2xl font-bold text-white mb-4">Accès Restreint</h2>
        <p className="text-gray-400 mb-6">Veuillez vous connecter pour accéder à cette page.</p>
        <Button onClick={() => window.location.href = '/auth'}>Se connecter</Button>
      </div>
    );
  }

  if (!hasAccess) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-center p-4">
        <div className="bg-red-900/20 p-6 rounded-full mb-6 border border-red-500/30">
          <XCircle className="w-16 h-16 text-red-500" />
        </div>
        <h2 className="text-3xl font-bold text-white mb-2">Accès Refusé</h2>
        <p className="text-gray-400 max-w-md">
          Vous n'avez pas les permissions nécessaires pour accéder au panneau d'administration des contrats.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-4 md:p-8 bg-[#0A0A0A] min-h-screen text-gray-100">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-8">
        <div>
          <h1 className="text-3xl font-bold text-white flex items-center gap-2">
            <FileText className="w-8 h-8 text-blue-500" />
            Gestion des Contrats
          </h1>
          <p className="text-gray-400 mt-1">
            {submissions.length} soumissions au total
          </p>
        </div>
        <div className="flex gap-2 w-full md:w-auto">
          <Button variant="outline" className="border-gray-700 text-gray-300 hover:bg-gray-800" onClick={fetchSubmissions}>
            <RefreshCw className="w-4 h-4 mr-2" /> Actualiser
          </Button>
          <Button variant="outline" className="border-green-700 text-green-400 hover:bg-green-900/20" onClick={exportToExcel}>
            <Download className="w-4 h-4 mr-2" /> Exporter Excel
          </Button>
        </div>
      </div>

      <Card className="bg-[#111111] border-gray-800">
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2 bg-gray-800/50 p-2 rounded-md border border-gray-700 w-full md:w-96">
            <Search className="w-4 h-4 text-gray-400" />
            <Input 
              placeholder="Rechercher par nom, email ou type..." 
              className="border-none bg-transparent h-8 focus-visible:ring-0 placeholder:text-gray-500"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex justify-center py-12">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
            </div>
          ) : filteredSubmissions.length === 0 ? (
            <div className="text-center py-12 text-gray-500">
              Aucun contrat trouvé pour cette recherche.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader className="bg-gray-800/50">
                  <TableRow className="border-gray-700 hover:bg-transparent">
                    <TableHead className="text-gray-300">Date</TableHead>
                    <TableHead className="text-gray-300">Partenaire</TableHead>
                    <TableHead className="text-gray-300">Type de Contrat</TableHead>
                    <TableHead className="text-gray-300">Contact</TableHead>
                    <TableHead className="text-gray-300">Statut</TableHead>
                    <TableHead className="text-right text-gray-300">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredSubmissions.map((sub) => (
                    <TableRow 
                      key={sub.id} 
                      className="border-gray-800 hover:bg-gray-800/30 cursor-pointer transition-colors"
                      onClick={() => handleRowClick(sub)}
                    >
                      <TableCell className="font-medium text-gray-400">
                        {new Date(sub.submitted_at).toLocaleDateString()}
                      </TableCell>
                      <TableCell className="font-bold text-white">
                        {sub.user_name}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="border-blue-500/30 text-blue-400">
                          {sub.contract_type}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-gray-400 text-sm">
                        <div>{sub.user_email}</div>
                        <div className="text-xs text-gray-500">{sub.user_phone}</div>
                      </TableCell>
                      <TableCell>
                        {getStatusBadge(sub.status)}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button size="sm" variant="ghost" className="text-blue-400 hover:text-blue-300">
                          Détails
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* DETAILS MODAL */}
      <Dialog open={isDetailsOpen} onOpenChange={setIsDetailsOpen}>
        <DialogContent className="bg-[#111111] border-gray-800 text-gray-100 max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-2xl font-bold flex items-center gap-2">
              Détails du Contrat
              {selectedSubmission && getStatusBadge(selectedSubmission.status)}
            </DialogTitle>
            <DialogDescription className="text-gray-400">
              Soumis le {selectedSubmission && new Date(selectedSubmission.submitted_at).toLocaleString()}
            </DialogDescription>
          </DialogHeader>

          {selectedSubmission && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-4">
              {/* LEFT COLUMN: INFO & ACTIONS */}
              <div className="space-y-6">
                <Card className="bg-gray-900 border-gray-800">
                  <CardContent className="p-4 space-y-4">
                    <div>
                      <h4 className="text-sm font-medium text-gray-500 uppercase mb-1">Partenaire</h4>
                      <p className="text-lg font-bold text-white">{selectedSubmission.user_name}</p>
                      <p className="text-sm text-gray-400">{selectedSubmission.user_email}</p>
                      <p className="text-sm text-gray-400">{selectedSubmission.user_phone}</p>
                    </div>
                    
                    <div className="pt-4 border-t border-gray-800">
                      <h4 className="text-sm font-medium text-gray-500 uppercase mb-1">Message du partenaire</h4>
                      <p className="text-gray-300 italic bg-gray-800/50 p-3 rounded-md border border-gray-700">
                        "{selectedSubmission.message || 'Aucun message'}"
                      </p>
                    </div>

                    <div className="pt-4 border-t border-gray-800">
                      <h4 className="text-sm font-medium text-gray-500 uppercase mb-2">Fichier du contrat</h4>
                      <div className="flex items-center gap-3 bg-blue-900/20 border border-blue-500/30 p-3 rounded-md">
                        <FileText className="w-8 h-8 text-blue-400 flex-shrink-0" />
                        <div className="flex-grow min-w-0">
                          <p className="text-sm font-medium text-blue-300 truncate" title={selectedSubmission.contract_file_url}>
                            Contrat_{selectedSubmission.user_name}.pdf
                          </p>
                          <div className="flex gap-2 mt-1">
                            <button 
                              onClick={() => window.open(selectedSubmission.contract_file_url, '_blank')}
                              className="text-xs text-blue-400 hover:text-blue-300 hover:underline flex items-center"
                            >
                              <ExternalLink className="w-3 h-3 mr-1" /> Ouvrir
                            </button>
                            <span className="text-gray-600">|</span>
                            <button 
                              onClick={() => handleRobustDownload(selectedSubmission.contract_file_url, `Contrat_${selectedSubmission.user_name}.pdf`)}
                              className="text-xs text-green-400 hover:text-green-300 hover:underline flex items-center"
                              disabled={downloading}
                            >
                              {downloading ? <span className="animate-spin mr-1">⏳</span> : <Download className="w-3 h-3 mr-1" />}
                              Télécharger
                            </button>
                          </div>
                        </div>
                        <Button size="icon" variant="ghost" onClick={() => copy(selectedSubmission.contract_file_url)}>
                          <Copy className="w-4 h-4 text-gray-400" />
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card className="bg-gray-900 border-gray-800">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-lg">Administration</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="space-y-2">
                      <label className="text-sm font-medium text-gray-400">Statut</label>
                      <Select value={status} onValueChange={setStatus}>
                        <SelectTrigger className="bg-gray-800 border-gray-700 text-white">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent className="bg-gray-800 border-gray-700 text-white">
                          <SelectItem value="pending">En attente</SelectItem>
                          <SelectItem value="approved">Approuvé</SelectItem>
                          <SelectItem value="rejected">Rejeté</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-2">
                      <label className="text-sm font-medium text-gray-400">Notes Admin (Interne)</label>
                      <Textarea 
                        className="bg-gray-800 border-gray-700 text-white min-h-[100px]"
                        placeholder="Ajoutez des notes sur ce dossier..."
                        value={notes}
                        onChange={(e) => setNotes(e.target.value)}
                      />
                    </div>
                  </CardContent>
                </Card>
              </div>

              {/* RIGHT COLUMN: PREVIEW */}
              <div className="flex flex-col h-full min-h-[400px]">
                <h4 className="text-sm font-medium text-gray-500 uppercase mb-2">Aperçu du fichier</h4>
                <div className="flex-grow bg-white rounded-lg overflow-hidden border border-gray-700 relative">
                  {renderFilePreview(selectedSubmission.contract_file_url)}
                </div>
              </div>
            </div>
          )}

          <DialogFooter className="mt-6 flex justify-between items-center border-t border-gray-800 pt-4">
            <Button 
              variant="destructive" 
              onClick={handleDelete}
              disabled={updating}
              className="bg-red-900/50 hover:bg-red-900 text-red-200 border-none mr-auto"
            >
              <Trash2 className="w-4 h-4 mr-2" /> Supprimer
            </Button>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setIsDetailsOpen(false)} disabled={updating} className="border-gray-700 text-gray-300">
                Annuler
              </Button>
              <Button onClick={handleUpdate} disabled={updating} className="bg-blue-600 hover:bg-blue-700 text-white">
                {updating ? 'Enregistrement...' : (
                  <>
                    <Save className="w-4 h-4 mr-2" /> Enregistrer les modifications
                  </>
                )}
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default AdminContractManagement;