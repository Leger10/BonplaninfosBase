// TransferModal.jsx
import React, { useState } from 'react';
import PropTypes from 'prop-types';
import { useTranslation } from 'react-i18next';
import { useData } from '@/contexts/DataContext';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Separator } from "@/components/ui/separator";
import { 
  Loader2, 
  AlertCircle, 
  CheckCircle2, 
  Wallet, 
  ArrowRight,
  Calculator,
  Shield,
  ChevronDown,
  ChevronUp
} from "lucide-react";

// Helper to format numbers with thousands separators
const formatNumber = (num) => num.toLocaleString();

const TransferModal = ({ 
  isOpen = false, 
  onClose = () => {}, 
  totalAmount = 0, 
  totalNetAmount = null, 
  loading = false, 
  onConfirm = () => {},
  exchangeRate = 10 // default 1 coin = 10 F CFA
}) => {
  const { t } = useTranslation();
  const { appSettings } = useData();

  const [showDetails, setShowDetails] = useState(false);
  const [showFeesInfo, setShowFeesInfo] = useState(false);
  

  // ⚠️ Le pourcentage est celui configuré par l'admin (onglet Configuration).
  // Avant, il était figé à 5% ici alors que le réglage admin n'était lu nulle
  // part : le client et le serveur pouvaient diverger.
  const configuredFeePercent = Number(appSettings?.platform_fee_percentage);
  const PLATFORM_FEE_PERCENT =
    Number.isFinite(configuredFeePercent) && configuredFeePercent > 0
      ? configuredFeePercent
      : 5;

  // 🔥 CALCUL DU TRANSFERT NET
  // 1. Frais de plateforme = totalAmount × 5% (arrondi au supérieur)
  const platformFee = Math.ceil(totalAmount * (PLATFORM_FEE_PERCENT / 100));
  
  // 2. Montant net = totalAmount - frais (arrondi à l'inférieur)
  const netAmount = totalNetAmount ?? Math.floor(totalAmount - platformFee);
  
  // 3. Conversion en FCFA (1 pièce = 10 FCFA)
  const grossCFA = totalAmount * exchangeRate;
  const feeCFA = platformFee * exchangeRate;
  const netCFA = netAmount * exchangeRate;

  if (!isOpen) return null;
  
  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-[95vw] sm:max-w-md mx-2 sm:mx-0 p-3 sm:p-6 rounded-lg sm:rounded-xl">
        <DialogHeader className="px-1 sm:px-0">
          <DialogTitle className="flex items-center gap-2 text-lg sm:text-xl">
            <Wallet className="w-5 h-5 sm:w-6 sm:h-6 text-primary" />
            {t('transferModal.title', 'Transférer les gains')}
          </DialogTitle>
          <DialogDescription className="text-xs sm:text-sm">
            {t('transferModal.description', 'Les frais de plateforme de {{percent}}% seront déduits.', { percent: PLATFORM_FEE_PERCENT })}
          </DialogDescription>
        </DialogHeader>

        <div className="py-2 sm:py-4 space-y-3 sm:space-y-4">
          {/* 🔥 MONTANT NET À RECEVOIR */}
          <div className="bg-gradient-to-br from-primary/10 to-primary/5 p-4 sm:p-6 rounded-xl border border-primary/20 text-center space-y-2">
            <p className="text-xs sm:text-sm text-muted-foreground uppercase font-semibold tracking-wider">
              {t('transferModal.netAmount', 'Montant net à recevoir')}
            </p>
            <div className="flex flex-col items-center justify-center">
              <div className="flex items-center">
                <span className="text-3xl sm:text-4xl md:text-5xl font-bold text-primary">
                  {formatNumber(netAmount)}
                </span>
                <span className="text-lg sm:text-2xl text-muted-foreground ml-2">
                  {t('transferModal.coins', 'pièces')}
                </span>
              </div>
              <span className="text-sm text-muted-foreground mt-1">
                ≈ {formatNumber(Math.floor(netCFA))} F CFA
              </span>
            </div>
            <p className="text-xs text-muted-foreground">
              {t('transferModal.afterFees', 'Après déduction des frais')}
            </p>
          </div>

          {/* 🔥 BOUTON AFFICHER/MASQUER LES DÉTAILS */}
          <Button 
            variant="outline" 
            className="w-full flex items-center justify-between text-sm sm:text-base"
            size="sm"
            onClick={() => setShowDetails(!showDetails)}
          >
            <span className="flex items-center gap-2">
              <Calculator className="w-4 h-4" />
              {showDetails 
                ? t('transferModal.hideDetails', 'Masquer les détails') 
                : t('transferModal.showDetails', 'Afficher les détails')}
            </span>
            {showDetails ? (
              <ChevronUp className="w-4 h-4" />
            ) : (
              <ChevronDown className="w-4 h-4" />
            )}
          </Button>
          
          {/* 🔥 DÉTAILS DU CALCUL */}
          {showDetails && (
            <div className="pt-3 space-y-2 animate-in fade-in-50">
              <div className="space-y-2">
                {/* Montant brut */}
                <div className="flex items-center justify-between p-2 sm:p-3 bg-green-50 text-green-800 rounded-lg border border-green-100 text-sm">
                  <span className="flex items-center gap-2">
                    <CheckCircle2 className="w-3 h-3 sm:w-4 sm:h-4" />
                    <span>{t('transferModal.details.gross', 'Montant brut')}</span>
                  </span>
                  <div className="text-right">
                    <div className="font-bold">+{formatNumber(totalAmount)}</div>
                    <div className="text-xs text-green-600">+{formatNumber(Math.floor(grossCFA))} F CFA</div>
                  </div>
                </div>
                
                {/* Frais */}
                <div className="flex items-center justify-between p-2 sm:p-3 bg-red-50 text-red-800 rounded-lg border border-red-100 text-sm">
                  <span className="flex items-center gap-2">
                    <AlertCircle className="w-3 h-3 sm:w-4 sm:h-4" />
                    <span className="whitespace-nowrap">
                      {t('transferModal.details.fee', 'Frais ({{percent}}%)', { percent: PLATFORM_FEE_PERCENT })}
                    </span>
                  </span>
                  <div className="text-right">
                    <div className="font-bold">-{formatNumber(platformFee)}</div>
                    <div className="text-xs text-red-600">-{formatNumber(Math.floor(feeCFA))} F CFA</div>
                  </div>
                </div>

                <Separator className="my-1 sm:my-2" />

                {/* Montant net */}
                <div className="flex items-center justify-between p-3 sm:p-4 bg-primary/10 text-primary font-bold rounded-lg border border-primary/20 text-sm sm:text-base">
                  <span className="flex items-center gap-2">
                    <Wallet className="w-4 h-4 sm:w-5 sm:h-5" />
                    <span>{t('transferModal.details.net', 'Montant net')}</span>
                  </span>
                  <div className="text-right">
                    <div className="text-sm sm:text-lg">+{formatNumber(netAmount)} pièces</div>
                    <div className="text-xs text-primary/80">+{formatNumber(Math.floor(netCFA))} F CFA</div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* 🔥 INFORMATION SUR LES FRAIS */}
          <div className="flex items-start gap-2">
            <Shield className="w-4 h-4 mt-0.5 text-muted-foreground flex-shrink-0" />
            <div className="flex-1">
              <button 
                onClick={() => setShowFeesInfo(!showFeesInfo)}
                className="text-xs sm:text-sm text-muted-foreground text-left hover:text-foreground transition-colors"
              >
                {showFeesInfo 
                  ? t('transferModal.feeInfo.hide', 'Masquer les détails des frais') 
                  : t('transferModal.feeInfo.button', 'Comment sont calculés les frais ?')}
              </button>
              
              {showFeesInfo && (
                <Alert className="mt-2 bg-blue-50 border-blue-100 text-blue-800 text-xs sm:text-sm animate-in fade-in-50">
                  <AlertDescription>
                    <ul className="list-disc pl-4 space-y-1">
                      <li className="leading-tight">
                        {t('transferModal.feeInfo.content.line1', 
                          'Une commission de {{percent}}% est appliquée sur le montant brut.', 
                          { percent: PLATFORM_FEE_PERCENT })}
                        {` (≈ ${formatNumber(Math.floor(feeCFA))} F CFA)`}
                      </li>
                      <li className="leading-tight">
                        {t('transferModal.feeInfo.content.line2', 
                          'Vous recevrez {{amount}} pièces après déduction des frais.', 
                          { amount: formatNumber(netAmount) })}
                        {` (≈ ${formatNumber(Math.floor(netCFA))} F CFA)`}
                      </li>
                      <li className="leading-tight">
                        {t('transferModal.feeInfo.content.line3', 
                          'Ces frais servent à maintenir et sécuriser la plateforme.')}
                      </li>
                    </ul>
                  </AlertDescription>
                </Alert>
              )}
            </div>
          </div>

          {/* 🔥 RÉSUMÉ */}
          <div className="bg-gray-50 p-3 rounded-lg border border-gray-200 text-xs sm:text-sm">
            <div className="grid grid-cols-2 gap-1 sm:gap-2">
              <div className="text-muted-foreground">{t('transferModal.summary.gross', 'Montant brut')}:</div>
              <div className="text-right font-medium">
                {formatNumber(totalAmount)} pièces
                <div className="text-xs text-muted-foreground">{formatNumber(Math.floor(grossCFA))} F CFA</div>
              </div>
              
              <div className="text-muted-foreground">{t('transferModal.summary.fee', 'Frais')}:</div>
              <div className="text-right font-medium text-red-600">
                -{formatNumber(platformFee)} pièces
                <div className="text-xs text-red-500">-{formatNumber(Math.floor(feeCFA))} F CFA</div>
              </div>
              
              <div className="col-span-2 border-t border-gray-300 pt-1 mt-1">
                <div className="flex justify-between font-bold">
                  <div>{t('transferModal.summary.net', 'Montant net')}:</div>
                  <div className="text-green-600 text-right">
                    +{formatNumber(netAmount)} pièces
                    <div className="text-xs text-green-500">+{formatNumber(Math.floor(netCFA))} F CFA</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <DialogFooter className="flex-col sm:flex-row gap-2 pt-2 sm:pt-0">
          <Button 
            variant="outline" 
            onClick={onClose} 
            disabled={loading}
            className="w-full sm:w-auto sm:flex-1 order-2 sm:order-1 text-sm sm:text-base py-2 sm:py-2"
            size="sm"
          >
            {t('transferModal.actions.cancel', 'Annuler')}
          </Button>
          <Button 
            onClick={onConfirm} 
            disabled={loading || netAmount <= 0}
            className="bg-primary hover:bg-primary/90 text-white w-full sm:w-auto sm:flex-1 min-w-[140px] order-1 sm:order-2 text-sm sm:text-base py-2 sm:py-2"
            size="sm"
          >
            {loading ? (
              <>
                <Loader2 className="mr-2 h-3 w-3 sm:h-4 sm:w-4 animate-spin" />
                <span className="text-xs sm:text-sm">{t('transferModal.actions.processing', 'Traitement...')}</span>
              </>
            ) : (
              <>
                <span className="text-xs sm:text-sm">
                  {t('transferModal.actions.transfer', 'Transférer {{amount}} pièces', { amount: formatNumber(netAmount) })}
                </span>
                <ArrowRight className="ml-2 h-3 w-3 sm:h-4 sm:w-4" />
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

TransferModal.propTypes = {
  isOpen: PropTypes.bool,
  onClose: PropTypes.func,
  totalAmount: PropTypes.number,
  totalNetAmount: PropTypes.number,
  loading: PropTypes.bool,
  onConfirm: PropTypes.func,
  exchangeRate: PropTypes.number,
};

export default TransferModal;