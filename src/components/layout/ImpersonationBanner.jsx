import React from 'react';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { Button } from '@/components/ui/button';
import { LogOut, UserCog } from 'lucide-react';

const ImpersonationBanner = () => {
  const { impersonatingUser, stopImpersonation } = useAuth();

  if (!impersonatingUser) {
    return null;
  }

  // Ne jamais faire de JSON.parse direct pendant le rendu : une valeur
  // corrompue dans localStorage ferait planter TOUTES les pages.
  let impersonationData = {};
  try {
    impersonationData = JSON.parse(localStorage.getItem('impersonating') || '{}') || {};
  } catch (_) {
    impersonationData = {};
  }

  return (
    <div className="fixed top-0 left-0 w-full bg-yellow-500 text-black p-2 text-center text-sm z-50 flex items-center justify-center gap-4">
      <UserCog className="w-5 h-5" />
      <span>
        Vous êtes en mode vue en tant que <strong>{impersonatingUser.name}</strong>.
      </span>
      <Button
        size="sm"
        variant="secondary"
        className="bg-black text-white hover:bg-gray-800"
        onClick={stopImpersonation}
      >
        <LogOut className="w-4 h-4 mr-2" />
        Retourner à mon compte ({impersonationData.originalUserName})
      </Button>
    </div>
  );
};

export default ImpersonationBanner;