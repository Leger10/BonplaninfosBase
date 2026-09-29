import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/lib/customSupabaseClient';
import { toast } from '@/components/ui/use-toast';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Search, MoreVertical, Trash2, Edit, ToggleLeft, ToggleRight, Download, Loader2, Eye, Filter, Ticket, Vote, Gift, Store, Shield, FileText, AlertTriangle, Users } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuLabel,
  DropdownMenuSeparator
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { exportToExcel } from '@/lib/exportToExcel';
import { useNavigate } from 'react-router-dom';
import { extractStoragePath } from '@/lib/utils';

/**
 * Gestion des événements pour les administrateurs (super_admin, admin, secretary).
 * Ces rôles peuvent supprimer n'importe quel événement (y compris ceux des organisateurs).
 */

const EventsManagement = ({ events, userProfile, onRefresh }) => {
  const [filteredEvents, setFilteredEvents] = useState(events);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [typeFilter, setTypeFilter] = useState('all');
  const [selectedEventId, setSelectedEventId] = useState(null);
  const [isDeleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [scanAgents, setScanAgents] = useState([]);
  const navigate = useNavigate();

  // Toutes les délégations de scan, pour afficher l'équipe par organisateur.
  useEffect(() => {
    supabase.rpc('admin_list_scan_agents', {}).then(({ data, error }) => {
      if (!error) setScanAgents(data?.agents || []);
    });
  }, []);

  const agentsByOrganizer = useMemo(() => {
    const map = {};
    scanAgents.forEach((a) => {
      if (!map[a.organizer_id]) map[a.organizer_id] = [];
      map[a.organizer_id].push(a);
    });
    return map;
  }, [scanAgents]);

  useEffect(() => {
    let result = events;

    if (searchTerm) {
      const lowerTerm = searchTerm.toLowerCase();
      result = result.filter(event => 
        event.title?.toLowerCase().includes(lowerTerm) ||
        event.city?.toLowerCase().includes(lowerTerm) ||
        event.organizer?.full_name?.toLowerCase().includes(lowerTerm)
      );
    }

    if (statusFilter !== 'all') {
      result = result.filter(event => event.status === statusFilter);
    }

    if (typeFilter !== 'all') {
      result = result.filter(event => event.event_type === typeFilter);
    }

    setFilteredEvents(result);
  }, [searchTerm, statusFilter, typeFilter, events]);

  const handleToggleStatus = async (event) => {
    const newStatus = event.status === 'active' ? 'inactive' : 'active';
    try {
      const { error } = await supabase.from('events').update({ status: newStatus }).eq('id', event.id);
      if (error) throw error;
      toast({ 
        title: 'Statut mis à jour', 
        description: `L'événement est maintenant ${newStatus === 'active' ? 'actif' : 'inactif'}.` 
      });
      if (onRefresh) onRefresh();
    } catch (error) {
      toast({ title: "Erreur", description: error.message, variant: "destructive" });
    }
  };

  const handleDelete = async () => {
    if (!selectedEventId || !userProfile?.id) return;

    setIsDeleting(true);

    try {
      const eventToDelete = events.find(e => e.id === selectedEventId);

      // 1. Suppression de l'image de couverture
      if (eventToDelete?.cover_image) {
        const storageInfo = extractStoragePath(eventToDelete.cover_image);
        if (storageInfo) {
          await supabase.storage
            .from(storageInfo.bucket)
            .remove([storageInfo.path]);
        }
      }

      // 2. Appel du RPC de suppression
      const { data: result, error: deleteError } = await supabase.rpc('delete_event_completely', {
        p_event_id: selectedEventId
      });

      if (deleteError) throw deleteError;
      if (!result.success) throw new Error(result.message);

      // 3. Vérification que l'événement a disparu
      const { data: checkData, error: checkError } = await supabase
        .from('events')
        .select('id')
        .eq('id', selectedEventId)
        .maybeSingle();

      if (checkError) throw checkError;
      if (checkData) throw new Error("L'événement existe toujours après la suppression.");

      // 4. Notification
      const roleDisplay = userProfile.user_type === 'super_admin' ? 'Super Administrateur' : 
                          userProfile.user_type === 'secretary' ? 'Secrétaire' : 'Administrateur';

      toast({ 
        title: 'Suppression réussie', 
        description: `Action (${roleDisplay}) : ${result.counts?.votes_deleted || 0} votes, ${result.counts?.tickets_deleted || 0} tickets effacés.`,
        className: "bg-green-600 text-white border-green-700"
      });

      if (onRefresh) onRefresh();
      setDeleteDialogOpen(false);
      setSelectedEventId(null);

    } catch (error) {
      toast({ 
        title: "Échec de la suppression", 
        description: error.message || "Une erreur est survenue.", 
        variant: "destructive" 
      });
    } finally {
      setIsDeleting(false);
    }
  };

  const handleExport = () => {
    if (!filteredEvents || filteredEvents.length === 0) {
      toast({ title: 'Aucune donnée', description: 'Rien à exporter.', variant: 'destructive' });
      return;
    }
    const dataToExport = filteredEvents.map(e => ({
      ID: e.id,
      Titre: e.title,
      Type: e.event_type,
      Statut: e.status,
      Organisateur: e.organizer?.full_name || '',
      Ville: e.city || ''
    }));
    exportToExcel({ data: dataToExport, fileName: `evenements.xlsx`, sheetName: 'Événements' });
    toast({ title: "Exportation réussie" });
  };

  const getTypeBadge = (type) => {
    switch (type) {
      case 'ticketing': return <Badge variant="outline" className="border-blue-500 text-blue-500"><Ticket className="w-3 h-3 mr-1" /> Billetterie</Badge>;
      case 'voting': return <Badge variant="outline" className="border-green-500 text-green-500"><Vote className="w-3 h-3 mr-1" /> Vote</Badge>;
      case 'raffle': return <Badge variant="outline" className="border-purple-500 text-purple-500"><Gift className="w-3 h-3 mr-1" /> Tombola</Badge>;
      case 'stand_rental': return <Badge variant="outline" className="border-orange-500 text-orange-500"><Store className="w-3 h-3 mr-1" /> Stands</Badge>;
      case 'protected': return <Badge variant="outline" className="border-red-500 text-red-500"><Shield className="w-3 h-3 mr-1" /> Protégé</Badge>;
      default: return <Badge variant="outline" className="border-gray-500 text-gray-500"><FileText className="w-3 h-3 mr-1" /> Standard</Badge>;
    }
  };

  const getStatusBadgeVariant = (status) => {
    switch (status) {
      case 'active': return 'success';
      case 'inactive': return 'secondary';
      case 'completed': return 'default';
      default: return 'outline';
    }
  };

  // Seuls les utilisateurs ayant le rôle super_admin, admin ou secretary peuvent supprimer
  const canDeleteEvents = userProfile && ['super_admin', 'admin', 'secretary'].includes(userProfile.user_type);

  return (
    <Card className="glass-effect shadow-lg border-none">
      <CardHeader className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 border-b border-border/10 pb-6">
        <div>
          <CardTitle className="text-2xl font-bold">Gestion des Événements</CardTitle>
          <p className="text-sm text-muted-foreground mt-1">Gérez tous les événements de la plateforme</p>
        </div>
        <div className="flex gap-2 w-full md:w-auto">
          <Button onClick={onRefresh} variant="ghost" size="sm">
            <Loader2 className={`h-4 w-4 ${false ? 'animate-spin' : ''}`} />
          </Button>
          <Button onClick={handleExport} variant="outline" size="sm" className="ml-auto">
            <Download className="mr-2 h-4 w-4" /> Exporter
          </Button>
        </div>
      </CardHeader>

      <CardContent className="pt-6">
        {/* Filtres */}
        <div className="grid grid-cols-1 md:grid-cols-12 gap-4 mb-6">
          <div className="md:col-span-5 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Rechercher (titre, ville, organisateur)..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10"
            />
          </div>

          <div className="md:col-span-3">
            <Select value={typeFilter} onValueChange={setTypeFilter}>
              <SelectTrigger>
                <div className="flex items-center gap-2">
                  <Filter className="w-4 h-4 text-muted-foreground" />
                  <SelectValue placeholder="Type d'événement" />
                </div>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tous les types</SelectItem>
                <SelectItem value="standard">Standard</SelectItem>
                <SelectItem value="ticketing">Billetterie</SelectItem>
                <SelectItem value="voting">Vote</SelectItem>
                <SelectItem value="raffle">Tombola</SelectItem>
                <SelectItem value="stand_rental">Location Stands</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="md:col-span-4">
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger>
                <SelectValue placeholder="Statut" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tous les statuts</SelectItem>
                <SelectItem value="active">Actif</SelectItem>
                <SelectItem value="inactive">Inactif</SelectItem>
                <SelectItem value="completed">Terminé</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Tableau */}
        <div className="rounded-md border border-border/50 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50">
                <tr className="text-left text-muted-foreground border-b border-border/50">
                  <th className="p-4 font-medium">Événement</th>
                  <th className="p-4 font-medium hidden md:table-cell">Type</th>
                  <th className="p-4 font-medium hidden sm:table-cell">Organisateur</th>
                  <th className="p-4 font-medium hidden lg:table-cell">Date</th>
                  <th className="p-4 font-medium hidden sm:table-cell">Statut</th>
                  <th className="p-4 font-medium hidden md:table-cell">Équipe de scan</th>
                  <th className="p-4 font-medium text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/50">
                {filteredEvents.length === 0 ? (
                  <tr>
                    <td colSpan="7" className="p-8 text-center text-muted-foreground">
                      Aucun événement trouvé pour ces critères.
                    </td>
                  </tr>
                ) : (
                  filteredEvents.map(event => (
                    <tr key={event.id} className="hover:bg-muted/20 transition-colors">
                      <td className="p-4">
                        <div className="flex flex-col">
                          <span className="font-semibold text-foreground line-clamp-1">{event.title}</span>
                          <span className="text-xs text-muted-foreground md:hidden">{new Date(event.event_start_at).toLocaleDateString()}</span>
                        </div>
                      </td>
                      <td className="p-4 hidden md:table-cell">
                        {getTypeBadge(event.event_type)}
                      </td>
                      <td className="p-4 hidden sm:table-cell text-muted-foreground">
                        {event.organizer?.full_name || 'Inconnu'}
                      </td>
                      <td className="p-4 hidden lg:table-cell">
                        <span className="text-xs text-muted-foreground">
                          {new Date(event.event_start_at).toLocaleDateString('fr-FR')}
                        </span>
                      </td>
                      <td className="p-4">
                        <Badge variant={getStatusBadgeVariant(event.status)} className={event.status === 'active' ? 'bg-green-500/15 text-green-600' : ''}>
                          {event.status === 'active' ? 'Actif' : event.status === 'inactive' ? 'Inactif' : event.status}
                        </Badge>
                      </td>
                      <td className="p-4 hidden md:table-cell">
                        {(() => {
                          const agents = agentsByOrganizer[event.organizer_id || event.organizer?.id] || [];
                          if (agents.length === 0) return <span className="text-xs text-muted-foreground">Aucun</span>;
                          return (
                            <div className="flex flex-col gap-1">
                              {agents.slice(0, 2).map((a) => (
                                <span key={a.user_id} className="flex items-center gap-1.5 text-xs">
                                  <Users className="h-3 w-3 text-muted-foreground shrink-0" />
                                  <span className={`truncate max-w-[140px] ${a.is_active ? '' : 'line-through text-muted-foreground'}`}>
                                    {a.agent?.full_name || a.agent?.email || 'Compte supprimé'}
                                  </span>
                                  {a.is_active && <span className="h-1.5 w-1.5 rounded-full bg-green-500 shrink-0" />}
                                </span>
                              ))}
                              {agents.length > 2 && (
                                <span className="text-[10px] text-muted-foreground">+{agents.length - 2} autres</span>
                              )}
                            </div>
                          );
                        })()}
                      </td>
                      <td className="p-4 text-right">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-8 w-8 hover:bg-muted">
                              <MoreVertical className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuLabel>Actions</DropdownMenuLabel>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem onClick={() => navigate(`/event/${event.id}`)}>
                              <Eye className="mr-2 h-4 w-4" /> Voir détails
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => handleToggleStatus(event)}>
                              {event.status === 'active' ? 
                                <><ToggleLeft className="mr-2 h-4 w-4" /> Désactiver</> : 
                                <><ToggleRight className="mr-2 h-4 w-4" /> Activer</>
                              }
                            </DropdownMenuItem>
                            {/* Suppression réservée aux admins */}
                            {canDeleteEvents && (
                              <>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem
                                  className="text-red-600 focus:text-red-600 focus:bg-red-50 dark:focus:bg-red-950/20"
                                  onClick={() => { setSelectedEventId(event.id); setDeleteDialogOpen(true); }}
                                >
                                  <Trash2 className="mr-2 h-4 w-4" /> Supprimer
                                </DropdownMenuItem>
                              </>
                            )}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        <AlertDialog open={isDeleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
          <AlertDialogContent className="border-red-500/20">
            <AlertDialogHeader>
              <AlertDialogTitle className="flex items-center gap-2 text-red-600">
                <AlertTriangle className="h-5 w-5" />
                Suppression définitive
              </AlertDialogTitle>
              <AlertDialogDescription>
                Êtes-vous absolument sûr de vouloir supprimer cet événement ?<br/><br/>
                Cette action <strong>irréversible</strong> effacera l'événement ainsi que tous les billets, votes, participations et commentaires associés.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={isDeleting}>Annuler</AlertDialogCancel>
              <AlertDialogAction
                onClick={handleDelete}
                className="bg-red-600 hover:bg-red-700 text-white"
                disabled={isDeleting}
              >
                {isDeleting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Trash2 className="mr-2 h-4 w-4" />}
                Supprimer définitivement
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </CardContent>
    </Card>
  );
};

export default EventsManagement;