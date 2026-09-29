import React, { useEffect, useState, useCallback } from 'react';
import { Loader2, UserPlus, Trash2, Users, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { supabase } from '@/lib/customSupabaseClient';
import { toast } from '@/components/ui/use-toast';

/**
 * Gestion des agents terrain (scanners) délégués par l'organisateur.
 * Un agent invité peut scanner tous les événements de cet organisateur ;
 * seul l'organisateur peut réinitialiser un billet ou retirer un agent.
 */

const ScanAgentsManager = ({ userProfile }) => {
  const [agents, setAgents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [adding, setAdding] = useState(false);
  const [removingId, setRemovingId] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase.rpc('list_scan_agents', {});
    if (error) {
      toast({ title: 'Impossible de charger les agents', description: error.message, variant: 'destructive' });
    } else {
      setAgents(data?.agents || []);
    }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleAdd = async (e) => {
    e.preventDefault();
    const addr = email.trim();
    if (!addr) return;
    setAdding(true);
    const { data, error } = await supabase.rpc('add_scan_agent', { p_email: addr, p_phone: phone.trim() || undefined });
    setAdding(false);
    if (error) {
      toast({ title: "Délégation refusée", description: error.message, variant: 'destructive' });
      return;
    }
    toast({
      title: data?.already ? 'Agent déjà délégué' : data?.reactivated ? 'Agent réactivé' : 'Agent ajouté',
      description: data?.full_name ? `${data.full_name} peut scanner vos événements.` : 'Ce compte peut scanner vos événements.',
      className: 'bg-green-600 text-white border-green-700',
    });
    setEmail('');
    setPhone('');
    await load();
  };

  const handleRemove = async (agent) => {
    setRemovingId(agent.user_id);
    const { error } = await supabase.rpc('remove_scan_agent', { p_user_id: agent.user_id });
    setRemovingId(null);
    if (error) {
      toast({ title: 'Retrait impossible', description: error.message, variant: 'destructive' });
      return;
    }
    toast({
      title: 'Agent retiré',
      description: `${agent.profile?.full_name || agent.profile?.email || 'L\'agent'} ne scannera plus vos événements.`,
      className: 'bg-green-600 text-white border-green-700',
    });
    await load();
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center p-10">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {userProfile?.user_type === 'organizer' && (
        <Card className="glass-effect border-primary/20">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <UserPlus className="w-4 h-4 text-primary" />
              Inviter un agent de terrain
            </CardTitle>
            <CardDescription>
              L'agent reçoit le droit de scanner (entrée/sortie) tous vos événements. La réinitialisation des billets reste réservée à l'organisateur.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleAdd} className="flex flex-col md:flex-row gap-3">
              <Input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="email du compte à déléguer"
                required
                autoComplete="off"
              />
              <Input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="téléphone (optionnel, pour lever les doublons)"
                autoComplete="off"
              />
              <Button type="submit" disabled={adding || !email.trim()} className="gradient-gold text-background hover:opacity-90 shrink-0">
                {adding ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <UserPlus className="w-4 h-4 mr-2" />}
                Déléguer
              </Button>
            </form>
          </CardContent>
        </Card>
      )}

      <Card className="glass-effect border-primary/20">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Users className="w-4 h-4 text-primary" />
            Équipe de scan
          </CardTitle>
          <CardDescription>
            {agents.length === 0
              ? 'Aucun agent délégué pour le moment. Invitez un compte pour lui permettre de scanner vos événements.'
              : `${agents.length} agent${agents.length > 1 ? 's' : ''} délégué${agents.length > 1 ? 's' : ''}.`}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {agents.map((agent) => (
            <div key={agent.user_id} className="flex items-center justify-between gap-3 rounded-lg border border-border/60 bg-background/50 p-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-medium truncate">{agent.profile?.full_name || agent.profile?.email || 'Compte supprimé'}</span>
                  {agent.is_active
                    ? <Badge className="bg-green-500/15 text-green-600 border-green-500/30">actif</Badge>
                    : <Badge className="bg-muted text-muted-foreground border-border/60">désactivé</Badge>}
                </div>
                {agent.profile?.email && <p className="text-sm text-muted-foreground truncate">{agent.profile.email}{agent.profile?.phone ? ` · ${agent.profile.phone}` : ''}</p>}
                {agent.last_scanned_at && (
                  <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                    <ShieldCheck className="w-3 h-3" /> Dernier scan : {new Date(agent.last_scanned_at).toLocaleString('fr-FR')}
                  </p>
                )}
              </div>
              <Button
                variant="ghost"
                size="sm"
                className="text-red-600 hover:text-red-700 hover:bg-red-500/10 shrink-0"
                onClick={() => handleRemove(agent)}
                disabled={removingId === agent.user_id}
              >
                {removingId === agent.user_id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
              </Button>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
};

export default ScanAgentsManager;