import React, { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { useData } from '@/contexts/DataContext';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  Loader2, 
  User, 
  Calendar, 
  CreditCard, 
  History, 
  RotateCcw, 
  Wallet, 
  MapPin,
  Users,
  Smartphone
} from 'lucide-react';
import { supabase } from '@/lib/customSupabaseClient';
import { toast } from '@/components/ui/use-toast';
import { Button } from '@/components/ui/button';
import SecretaryUserManagementTab from '@/components/secretary/SecretaryUserManagementTab';
import CreditManagement from '@/components/admin/CreditManagement';
import WithdrawalManagement from '@/components/admin/WithdrawalManagement';
import WithdrawalHistoryTab from '@/components/admin/WithdrawalHistoryTab';
import ReversedCreditsTab from '@/components/admin/ReversedCreditsTab';
import SecretaryEventLocationModerationTab from '@/components/secretary/SecretaryEventLocationModerationTab';
import SecretaryRefundModal from '@/components/secretary/SecretaryRefundModal';
import USSDPaymentsTab from '@/components/admin/USSDPaymentsTab';

const SecretaryDashboard = () => {
    const { t } = useTranslation();
    const { user } = useAuth();
    const { userProfile, loadingProfile, profileLoaded } = useData();
    const [allUsers, setAllUsers] = useState([]);
    const [loadingData, setLoadingData] = useState(true);
    const [refundModalOpen, setRefundModalOpen] = useState(false);
    const isAppointedBySuperAdmin = userProfile?.user_type === 'secretary' && userProfile?.appointed_by_super_admin;

    const fetchData = useCallback(async () => {
        if (!userProfile?.country) {
            setLoadingData(false);
            return;
        }
        setLoadingData(true);
        try {
            const { data: usersData, error: usersError } = await supabase
                .from('profiles')
                .select('*')
                .eq('country', userProfile.country);

            if (usersError) throw usersError;

            setAllUsers(usersData || []);
        } catch (error) {
            toast({ 
                title: t('common.error_title'), 
                description: "Impossible de charger les données.", 
                variant: 'destructive' 
            });
        } finally {
            setLoadingData(false);
        }
    }, [userProfile?.country, t]);

    useEffect(() => {
        if (userProfile) {
            fetchData();
        } else if (profileLoaded) {
            // Profil introuvable : on ne reste pas bloqué sur le spinner.
            setLoadingData(false);
        }
    }, [userProfile, profileLoaded, fetchData]);

    if (loadingProfile || loadingData) {
        return (
            <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 text-white p-4 md:p-8 flex items-center justify-center">
                <Loader2 className="w-8 h-8 animate-spin text-blue-400" />
            </div>
        );
    }

    if (profileLoaded && !userProfile) {
        return (
            <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 text-white p-4 md:p-8 flex flex-col items-center justify-center gap-4">
                <h1 className="text-2xl font-bold">Profil introuvable</h1>
                <p className="text-gray-400">Le chargement de votre profil a échoué. Réessayez.</p>
                <button
                    onClick={() => window.location.reload()}
                    className="px-4 py-2 rounded-md bg-blue-600 hover:bg-blue-500"
                >
                    Réessayer
                </button>
            </div>
        );
    }
    
    if (!user || userProfile?.user_type !== 'secretary') {
        return (
            <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 text-white p-4 md:p-8">
                <h1 className="text-2xl text-red-400">{t('admin_dashboard.unauthorized_title')}</h1>
                <p className="text-gray-400">{t('admin_dashboard.unauthorized_desc')}</p>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 text-white p-4 md:p-8">
            {/* Header avec bouton de remboursement */}
            <header className="mb-8">
                <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                    <div>
                        <h1 className="text-3xl font-bold bg-gradient-to-r from-blue-400 to-purple-400 bg-clip-text text-transparent">
                            {t('secretary_dashboard.title')}
                        </h1>
                        <p className="text-gray-400 mt-1">
                            {t('secretary_dashboard.welcome', { name: userProfile.full_name || user.email })}
                        </p>
                        <p className="text-sm text-blue-400 flex items-center gap-1 mt-1">
                            <MapPin className="h-4 w-4" />
                            {t('secretary_dashboard.competence_zone', { country: userProfile.country })}
                        </p>
                    </div>
                    {/* <Button
                        onClick={() => setRefundModalOpen(true)}
                        className="bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-700 hover:to-orange-700 text-white border-0 shadow-lg"
                    >
                        <RotateCcw className="mr-2 h-4 w-4" />
                        Rembourser des participants
                    </Button> */}
                </div>
            </header>

            {/* Tabs de navigation */}
            <Tabs defaultValue="moderation" className="w-full">
                <TabsList className="grid w-full grid-cols-2 md:grid-cols-6 bg-gray-800/50 backdrop-blur-xl border border-gray-700/50 p-1 rounded-lg">
                    <TabsTrigger 
                        value="moderation" 
                        className="data-[state=active]:bg-gradient-to-r data-[state=active]:from-blue-600 data-[state=active]:to-purple-600 data-[state=active]:text-white text-gray-300"
                    >
                        <Calendar className="w-4 h-4 mr-2" />
                        {t('secretary_dashboard.tabs.event_moderation')}
                    </TabsTrigger>
                    <TabsTrigger 
                        value="users"
                        className="data-[state=active]:bg-gradient-to-r data-[state=active]:from-blue-600 data-[state=active]:to-purple-600 data-[state=active]:text-white text-gray-300"
                    >
                        <User className="w-4 h-4 mr-2" />
                        {t('secretary_dashboard.tabs.user_management')}
                    </TabsTrigger>
                    <TabsTrigger 
                        value="credits"
                        className="data-[state=active]:bg-gradient-to-r data-[state=active]:from-blue-600 data-[state=active]:to-purple-600 data-[state=active]:text-white text-gray-300"
                    >
                        <CreditCard className="w-4 h-4 mr-2" />
                        {t('secretary_dashboard.tabs.credit_management')}
                    </TabsTrigger>
                    <TabsTrigger 
                        value="reversed_credits"
                        className="data-[state=active]:bg-gradient-to-r data-[state=active]:from-blue-600 data-[state=active]:to-purple-600 data-[state=active]:text-white text-gray-300"
                    >
                        <RotateCcw className="w-4 h-4 mr-2" />
                        {t('secretary_dashboard.tabs.reversed_credits')}
                    </TabsTrigger>
                    <TabsTrigger 
                        value="withdrawals"
                        className="data-[state=active]:bg-gradient-to-r data-[state=active]:from-blue-600 data-[state=active]:to-purple-600 data-[state=active]:text-white text-gray-300"
                    >
                        <Wallet className="w-4 h-4 mr-2" />
                        {t('secretary_dashboard.tabs.withdrawal_management')}
                    </TabsTrigger>
                    {isAppointedBySuperAdmin && (
                        <TabsTrigger 
                            value="ussd_payments"
                            className="data-[state=active]:bg-gradient-to-r data-[state=active]:from-blue-600 data-[state=active]:to-purple-600 data-[state=active]:text-white text-gray-300"
                        >
                            <Smartphone className="w-4 h-4 mr-2" />
                            Paiements USSD
                        </TabsTrigger>
                    )}
                </TabsList>
                
                {/* Contenu des onglets */}
                <TabsContent value="moderation" className="mt-6">
                    <div className="bg-gray-800/50 backdrop-blur-xl border border-gray-700/50 rounded-lg p-6">
                        <SecretaryEventLocationModerationTab />
                    </div>
                </TabsContent>
                
                <TabsContent value="users" className="mt-6">
                    <div className="bg-gray-800/50 backdrop-blur-xl border border-gray-700/50 rounded-lg p-6">
                        <SecretaryUserManagementTab users={allUsers} onRefresh={fetchData} />
                    </div>
                </TabsContent>
                
                <TabsContent value="credits" className="mt-6">
                    <div className="bg-gray-800/50 backdrop-blur-xl border border-gray-700/50 rounded-lg p-6">
                        <CreditManagement 
                            users={allUsers} 
                            onRefresh={fetchData} 
                            userProfile={userProfile}
                        />
                    </div>
                </TabsContent>
                
                <TabsContent value="reversed_credits" className="mt-6">
                    <div className="bg-gray-800/50 backdrop-blur-xl border border-gray-700/50 rounded-lg p-6">
                        <ReversedCreditsTab 
                            isSuperAdmin={false} 
                            country={userProfile.country} 
                            actorId={user.id} 
                        />
                    </div>
                </TabsContent>
                
                <TabsContent value="withdrawals" className="mt-6">
                    <div className="bg-gray-800/50 backdrop-blur-xl border border-gray-700/50 rounded-lg p-6">
                        <WithdrawalManagement />
                    </div>
                </TabsContent>
                
                {isAppointedBySuperAdmin && (
                    <TabsContent value="ussd_payments" className="mt-6">
                        <div className="bg-gray-800/50 backdrop-blur-xl border border-gray-700/50 rounded-lg p-6">
                            <USSDPaymentsTab actorId={userProfile?.id} />
                        </div>
                    </TabsContent>
                )}
            </Tabs>

            {/* Modal de remboursement */}
            <SecretaryRefundModal
                isOpen={refundModalOpen}
                onClose={() => setRefundModalOpen(false)}
                secretaryId={user?.id}
                country={userProfile?.country}
                onSuccess={() => {
                    // Rafraîchir les données si nécessaire
                    fetchData();
                }}
            />
        </div>
    );
};

export default SecretaryDashboard;