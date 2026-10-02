import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { useData } from '@/contexts/DataContext';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/components/ui/use-toast';
import { CouponService } from '@/services/CouponService';
import { Copy, Link2, Eye, EyeOff, Plus, RefreshCw, TrendingUp, Users, Calendar, Coins } from 'lucide-react';
import { formatDistanceToNow, format } from 'date-fns';
import { fr } from 'date-fns/locale';

const CouponsPage = () => {
  const { user } = useAuth();
  const { forceRefreshUserProfile } = useData();
  const { toast } = useToast();
  const [coupons, setCoupons] = useState([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);

  const loadCoupons = async () => {
    if (!user) return;
    setLoading(true);
    const { data, error } = await CouponService.getUserCoupons(user.id);
    if (error) {
      toast({ title: 'Erreur', description: 'Impossible de charger vos coupons.', variant: 'destructive' });
    } else {
      setCoupons(data || []);
    }
    setLoading(false);
  };

  useEffect(() => {
    loadCoupons();
  }, [user]);

  const handleCreateCoupon = async () => {
    setCreating(true);
    const { code, error } = await CouponService.createCoupon(user.id);
    setCreating(false);
    if (error) {
      toast({ title: 'Erreur', description: 'Échec de création du coupon.', variant: 'destructive' });
    } else {
      toast({ title: 'Succès', description: `Coupon ${code} créé !`, variant: 'default' });
      loadCoupons();
      forceRefreshUserProfile();
    }
  };

  const handleToggleActive = async (coupon) => {
    const action = coupon.active ? CouponService.deactivateCoupon : CouponService.activateCoupon;
    const { success, error } = await action(coupon.code);
    if (error) {
      toast({ title: 'Erreur', description: `Impossible de ${coupon.active ? 'désactiver' : 'activer'} le coupon.`, variant: 'destructive' });
    } else {
      toast({ title: 'Succès', description: `Coupon ${coupon.active ? 'désactivé' : 'activé'} !` });
      loadCoupons();
    }
  };

  const copyToClipboard = (text, label) => {
    navigator.clipboard.writeText(text);
    toast({ title: 'Copié', description: `${label} copié dans le presse-papier.`, variant: 'default' });
  };

  const getShareLink = (code) => `${window.location.origin}/packs?coupon=${code}`;

  const formatDate = (date) => {
    if (!date) return 'Jamais';
    return format(new Date(date), 'dd MMM yyyy', { locale: fr });
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-black py-12 px-4">
        <div className="max-w-7xl mx-auto space-y-8">
          <Skeleton className="h-12 w-64" />
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[1, 2, 3].map(i => <Skeleton key={i} className="h-64 rounded-xl" />)}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black py-12 px-4 text-gray-100">
      <div className="max-w-7xl mx-auto space-y-8">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div>
            <h1 className="text-3xl font-bold text-white">Mes Coupons de Parrainage</h1>
            <p className="text-gray-400 mt-1">
              Partagez vos codes, gagnez 2% de commission sur les achats de vos amis.
            </p>
          </div>
          <Button
            onClick={handleCreateCoupon}
            disabled={creating}
            className="bg-yellow-500 hover:bg-yellow-600 text-black"
          >
            {creating ? <RefreshCw className="w-4 h-4 animate-spin mr-2" /> : <Plus className="w-4 h-4 mr-2" />}
            Créer un coupon
          </Button>
        </div>

        {coupons.length === 0 ? (
          <Card className="bg-gray-900 border-gray-800 text-center py-12">
            <CardContent>
              <p className="text-gray-400 mb-4">Vous n'avez pas encore de coupon.</p>
              <Button onClick={handleCreateCoupon} variant="outline" className="border-gray-700 text-gray-300">
                Créer mon premier coupon
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {coupons.map((coupon) => (
              <motion.div
                key={coupon.code}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3 }}
              >
                <Card className="bg-gray-900 border-gray-800 hover:border-yellow-500/50 transition-all overflow-hidden">
                  <CardHeader className="pb-2">
                    <div className="flex justify-between items-start">
                      <div>
                        <CardTitle className="text-white font-mono text-xl">{coupon.code}</CardTitle>
                        <CardDescription className="text-gray-400">
                          Créé {formatDistanceToNow(new Date(coupon.created_at), { addSuffix: true, locale: fr })}
                        </CardDescription>
                      </div>
                      <Badge variant={coupon.active ? 'default' : 'secondary'} className={coupon.active ? 'bg-green-600' : 'bg-gray-600'}>
                        {coupon.active ? 'Actif' : 'Inactif'}
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="grid grid-cols-2 gap-2 text-sm">
                      <div className="flex items-center gap-2 text-gray-400">
                        <Users className="w-4 h-4" />
                        <span>Utilisations :</span>
                        <span className="text-white font-medium">{coupon.usage_count}</span>
                      </div>
                      <div className="flex items-center gap-2 text-gray-400">
                        <TrendingUp className="w-4 h-4" />
                        <span>Total généré :</span>
                        <span className="text-white font-medium">{Number(coupon.total_amount || 0).toLocaleString('fr-FR')} FCFA</span>
                      </div>
                      <div className="flex items-center gap-2 text-gray-400">
                        <Coins className="w-4 h-4" />
                        <span>Commission :</span>
                        <span className="text-green-400 font-medium">{Number(coupon.commission_earned || 0).toLocaleString('fr-FR')} FCFA</span>
                      </div>
                      <div className="flex items-center gap-2 text-gray-400">
                        <Calendar className="w-4 h-4" />
                        <span>Dernière util. :</span>
                        <span className="text-white">{formatDate(coupon.last_used_at)}</span>
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-2 pt-2">
                      <Button
                        size="sm"
                        variant="outline"
                        className="border-gray-700 text-gray-300 hover:bg-gray-800"
                        onClick={() => copyToClipboard(coupon.code, 'Code')}
                      >
                        <Copy className="w-4 h-4 mr-2" /> Code
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="border-gray-700 text-gray-300 hover:bg-gray-800"
                        onClick={() => copyToClipboard(getShareLink(coupon.code), 'Lien')}
                      >
                        <Link2 className="w-4 h-4 mr-2" /> Lien
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className={`border-gray-700 ${coupon.active ? 'text-red-400 hover:text-red-300' : 'text-green-400 hover:text-green-300'}`}
                        onClick={() => handleToggleActive(coupon)}
                      >
                        {coupon.active ? <EyeOff className="w-4 h-4 mr-2" /> : <Eye className="w-4 h-4 mr-2" />}
                        {coupon.active ? 'Désactiver' : 'Activer'}
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default CouponsPage;