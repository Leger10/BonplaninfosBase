import React from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import MyEventsTab from '@/components/profile/MyEventsTab';
import TransactionsTab from '@/components/profile/TransactionsTab';
import ReferralTab from '@/components/profile/ReferralTab';
import CreatorDashboardTab from '@/components/profile/CreatorDashboardTab';
import MyTicketsTab from '@/components/profile/MyTicketsTab';
import WithdrawalTab from '@/components/profile/WithdrawalTab';
import ScanAgentsManager from '@/components/profile/ScanAgentsManager';
import { Ticket, Calendar, History, Users, Wallet, Sparkles, UserCog } from 'lucide-react';

const ProfilePageContent = ({ 
  userProfile, 
  userEvents, 
  userTransactions, 
  loadingEvents, 
  referralData
}) => {
  const { t } = useTranslation();
  const [searchParams, setSearchParams] = useSearchParams();
  const currentTab = searchParams.get('tab') || 'events';

  const handleTabChange = (value) => {
    setSearchParams({ tab: value });
  };

  const isOrganizer = ['organizer', 'admin', 'super_admin'].includes(userProfile?.user_type);

  return (
    <Tabs value={currentTab} onValueChange={handleTabChange} className="w-full">
      <div className="w-full overflow-x-auto pb-2 scrollbar-hide -mx-4 px-4 md:mx-0 md:px-0">
        <TabsList className="inline-flex w-auto min-w-full md:w-full md:grid md:grid-cols-7 mb-4 h-auto p-1 bg-muted/50 rounded-xl gap-1">
          <TabsTrigger value="events" className="flex-1 min-w-[100px] data-[state=active]:bg-background data-[state=active]:shadow-sm rounded-lg py-2 md:py-3">
            <Calendar className="w-4 h-4 mr-2" />
            <span>{t('profileTabs.events')}</span>
          </TabsTrigger>
          
          {isOrganizer && (
            <TabsTrigger value="creator" className="flex-1 min-w-[100px] data-[state=active]:bg-background data-[state=active]:shadow-sm rounded-lg py-2 md:py-3">
              <Sparkles className="w-4 h-4 mr-2 text-indigo-500" />
              <span>{t('profileTabs.creator')}</span>
            </TabsTrigger>
          )}
          
          <TabsTrigger value="tickets" className="flex-1 min-w-[100px] data-[state=active]:bg-background data-[state=active]:shadow-sm rounded-lg py-2 md:py-3">
            <Ticket className="w-4 h-4 mr-2" />
            <span>{t('profileTabs.tickets')}</span>
          </TabsTrigger>

          <TabsTrigger value="transactions" className="flex-1 min-w-[100px] data-[state=active]:bg-background data-[state=active]:shadow-sm rounded-lg py-2 md:py-3">
            <History className="w-4 h-4 mr-2" />
            <span>{t('profileTabs.transactions')}</span>
          </TabsTrigger>

          <TabsTrigger value="referral" className="flex-1 min-w-[100px] data-[state=active]:bg-background data-[state=active]:shadow-sm rounded-lg py-2 md:py-3">
            <Users className="w-4 h-4 mr-2" />
            <span>{t('profileTabs.referral')}</span>
          </TabsTrigger>

          {isOrganizer && (
            <TabsTrigger value="withdrawals" className="flex-1 min-w-[100px] data-[state=active]:bg-background data-[state=active]:shadow-sm rounded-lg py-2 md:py-3">
              <Wallet className="w-4 h-4 mr-2" />
              <span>{t('profileTabs.withdrawals')}</span>
            </TabsTrigger>
          )}

          {isOrganizer && (
            <TabsTrigger value="scanners" className="flex-1 min-w-[100px] data-[state=active]:bg-background data-[state=active]:shadow-sm rounded-lg py-2 md:py-3">
              <UserCog className="w-4 h-4 mr-2 text-amber-500" />
              <span>{t('profileTabs.scanners')}</span>
            </TabsTrigger>
          )}
        </TabsList>
      </div>

      <TabsContent value="events" className="animate-in fade-in slide-in-from-bottom-4 duration-500 mt-0">
        <MyEventsTab 
          userProfile={userProfile} 
          userEvents={userEvents} 
          loadingEvents={loadingEvents} 
        />
      </TabsContent>

      {isOrganizer && (
        <TabsContent value="creator" className="animate-in fade-in slide-in-from-bottom-4 duration-500 mt-0">
          <CreatorDashboardTab />
        </TabsContent>
      )}

      <TabsContent value="tickets" className="animate-in fade-in slide-in-from-bottom-4 duration-500 mt-0">
        <MyTicketsTab />
      </TabsContent>

      <TabsContent value="transactions" className="animate-in fade-in slide-in-from-bottom-4 duration-500 mt-0">
        <TransactionsTab transactions={userTransactions} />
      </TabsContent>

      <TabsContent value="referral" className="animate-in fade-in slide-in-from-bottom-4 duration-500 mt-0">
        <ReferralTab userProfile={userProfile} referralData={referralData} />
      </TabsContent>

      {isOrganizer && (
        <TabsContent value="withdrawals" className="animate-in fade-in slide-in-from-bottom-4 duration-500 mt-0">
          <WithdrawalTab userProfile={userProfile} />
        </TabsContent>
      )}

      {isOrganizer && (
        <TabsContent value="scanners" className="animate-in fade-in slide-in-from-bottom-4 duration-500 mt-0">
          <ScanAgentsManager userProfile={userProfile} />
        </TabsContent>
      )}
    </Tabs>
  );
};

export default ProfilePageContent;