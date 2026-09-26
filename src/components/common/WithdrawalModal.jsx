import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, Calculator, AlertCircle, Coins, Ban } from 'lucide-react';
import { toast } from '@/components/ui/use-toast';
import { supabase } from '@/lib/customSupabaseClient';
import { useTranslation } from 'react-i18next';
import { Alert, AlertDescription } from '@/components/ui/alert';

const WithdrawalModal = ({ 
    open, 
    onOpenChange, 
    availableBalance = 0, 
    userType = 'organizer', 
    userId,
    onSuccess 
}) => {
    const { t } = useTranslation();
    const [amount, setAmount] = useState('');
    const [method, setMethod] = useState('');
    const [details, setDetails] = useState('');
    const [loading, setLoading] = useState(false);
    const [configLoading, setConfigLoading] = useState(true);
    
    // Valeurs de configuration récupérées depuis la BDD
    const [minWithdrawalPi, setMinWithdrawalPi] = useState(50); // valeur par défaut
    const [withdrawalDates, setWithdrawalDates] = useState([5, 20]);
    
    // Constantes
    const FEE_PERCENT = 0.05;
    const RATE = 10; // 1 Pi = 10 FCFA

    // Valeurs dérivées
    const availableBalancePI = Math.floor(availableBalance / RATE);
    const requestedAmountPI = parseInt(amount) || 0;
    const requestedAmountFCFA = requestedAmountPI * RATE;
    const feeAmountFCFA = Math.ceil(requestedAmountFCFA * FEE_PERCENT);
    const netAmountFCFA = requestedAmountFCFA - feeAmountFCFA;
    
    // Vérifier si le solde est suffisant pour le retrait minimum
    const isBalanceSufficient = availableBalancePI >= minWithdrawalPi;
    const minWithdrawalFCFA = minWithdrawalPi * RATE;

    const paymentMethods = [
        { code: 'orange', labelKey: 'withdrawalModal.methods.orange' },
        { code: 'mtn', labelKey: 'withdrawalModal.methods.mtn' },
        { code: 'moov', labelKey: 'withdrawalModal.methods.moov' },
        { code: 'wave', labelKey: 'withdrawalModal.methods.wave' },
        { code: 'bank', labelKey: 'withdrawalModal.methods.bank' }
    ];

    useEffect(() => {
        if (open) {
            fetchConfig();
        }
    }, [open]);

    const fetchConfig = async () => {
        setConfigLoading(true);
        try {
            const { data, error } = await supabase
                .from('admin_withdrawal_config')
                .select('min_withdrawal_pi, withdrawal_dates')
                .limit(1)
                .maybeSingle();

            if (error) throw error;

            if (data) {
                if (data.min_withdrawal_pi !== null && data.min_withdrawal_pi !== undefined) {
                    setMinWithdrawalPi(data.min_withdrawal_pi);
                }
                if (data.withdrawal_dates) {
                    setWithdrawalDates(data.withdrawal_dates);
                }
            }
        } catch (error) {
            console.error("Erreur lors du chargement de la config:", error);
        } finally {
            setConfigLoading(false);
        }
    };

    const handleSubmit = async () => {
        // Validation du solde
        if (requestedAmountPI > availableBalancePI) {
            toast({ 
                title: t('withdrawalModal.errors.insufficientBalance'), 
                description: t('withdrawalModal.errors.insufficientBalanceDesc'), 
                variant: "destructive" 
            });
            return;
        }

        // Validation du montant minimum (utilisation de la valeur dynamique)
        if (requestedAmountPI < minWithdrawalPi) {
            toast({ 
                title: t('withdrawalModal.errors.amountTooLow'), 
                description: t('withdrawalModal.errors.amountTooLowDesc', { 
                    minPi: minWithdrawalPi, 
                    minFcfa: (minWithdrawalPi * RATE).toLocaleString() 
                }), 
                variant: "destructive" 
            });
            return;
        }

        if (!method || !details) {
            toast({ 
                title: t('withdrawalModal.errors.missingFields'), 
                description: t('withdrawalModal.errors.missingFieldsDesc'), 
                variant: "destructive" 
            });
            return;
        }

        setLoading(true);
        try {
            const { data, error } = await supabase.rpc('request_organizer_withdrawal', {
                p_organizer_id: userId,
                p_amount_pi: requestedAmountPI,
                p_payment_details: { 
                    method, 
                    number: details, 
                    account_name: details,
                    fee_percent: FEE_PERCENT * 100,
                    fee_amount_fcfa: feeAmountFCFA,
                    net_amount_fcfa: netAmountFCFA
                }
            });

            if (error) throw error;
            if (!data.success) throw new Error(data.message);

            const newBalancePi = data.new_balance;
            const newBalanceFcfa = newBalancePi * RATE;

            toast({ 
                title: t('withdrawalModal.toast.success'), 
                description: t('withdrawalModal.toast.successDesc', { newBalanceFcfa: newBalanceFcfa.toLocaleString() }), 
                variant: "success" 
            });
            
            if (onSuccess) onSuccess();
            onOpenChange(false);
            setAmount('');
            setMethod('');
            setDetails('');
        } catch (error) {
            console.error("Withdrawal error:", error);
            toast({ 
                title: t('withdrawalModal.toast.error'), 
                description: error.message || t('withdrawalModal.toast.errorDesc'), 
                variant: "destructive" 
            });
        } finally {
            setLoading(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-[450px] w-[95vw] max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle>{t('withdrawalModal.title')}</DialogTitle>
                    <DialogDescription>
                        {t('withdrawalModal.balanceLabel')}{' '}
                        <span className="font-bold text-emerald-600">
                            {t('withdrawalModal.balanceValue', { 
                                balanceFcfa: availableBalance.toLocaleString(), 
                                balancePi: availableBalancePI 
                            })}
                        </span>
                    </DialogDescription>
                </DialogHeader>

                {configLoading ? (
                    <div className="py-8 flex justify-center"><Loader2 className="animate-spin" /></div>
                ) : (
                    <div className="space-y-4 py-2">
                        
                        {/* Message d'alerte si solde insuffisant */}
                        {!isBalanceSufficient && (
                            <Alert variant="destructive" className="bg-amber-50 border-amber-200 text-amber-800 dark:bg-amber-950/30 dark:border-amber-800 dark:text-amber-400">
                                <Ban className="h-5 w-5 text-amber-600" />
                                <AlertDescription className="space-y-2">
                                    <p className="font-semibold text-amber-800 dark:text-amber-400">
                                        ❌ Vous ne pouvez pas effectuer de retrait pour le moment
                                    </p>
                                    <p className="text-sm">
                                        Votre solde de <strong>{availableBalancePI} pièces</strong> ({availableBalance.toLocaleString()} FCFA) 
                                        est inférieur au minimum de retrait de <strong>{minWithdrawalPi} pièces</strong> ({minWithdrawalFCFA.toLocaleString()} FCFA).
                                    </p>
                                    <div className="flex items-center gap-2 mt-2 pt-2 border-t border-amber-200 dark:border-amber-800">
                                        <Coins className="w-4 h-4" />
                                        <span className="text-xs">
                                            Il vous manque <strong>{(minWithdrawalPi - availableBalancePI)} pièces</strong> ({(minWithdrawalFCFA - availableBalance).toLocaleString()} FCFA) 
                                            pour pouvoir effectuer un retrait.
                                        </span>
                                    </div>
                                </AlertDescription>
                            </Alert>
                        )}

                        {/* Message d'information sur le minimum de retrait */}
                        <div className="bg-emerald-50 dark:bg-emerald-950/30 p-3 rounded-lg border border-emerald-200 dark:border-emerald-800">
                            <div className="flex items-start gap-2">
                                <AlertCircle className="w-4 h-4 text-emerald-600 mt-0.5 flex-shrink-0" />
                                <div className="text-xs text-emerald-700 dark:text-emerald-400 space-y-1">
                                    <p className="font-medium">💰 Minimum de retrait</p>
                                    <p><strong>{minWithdrawalPi} pièces</strong> soit <strong>{minWithdrawalFCFA.toLocaleString()} FCFA</strong></p>
                                    <p className="text-emerald-600/80">Frais de transaction : {Math.round(FEE_PERCENT * 100)}% (déduits automatiquement)</p>
                                </div>
                            </div>
                        </div>

                        {isBalanceSufficient ? (
                            <>
                                <div className="grid gap-2">
                                    <Label htmlFor="amount">{t('withdrawalModal.amountLabel')}</Label>
                                    <div className="flex gap-2">
                                        <Input
                                            id="amount"
                                            type="number"
                                            value={amount}
                                            onChange={(e) => setAmount(e.target.value)}
                                            placeholder={t('withdrawalModal.amountPlaceholder')}
                                            className="flex-1"
                                            min={minWithdrawalPi}
                                            max={availableBalancePI}
                                        />
                                        <div className="bg-muted px-3 py-2 rounded-md border flex items-center min-w-[80px] justify-center font-medium text-xs sm:text-sm">
                                            {requestedAmountFCFA.toLocaleString()} F
                                        </div>
                                    </div>
                                    <p className="text-xs text-muted-foreground">
                                        {t('withdrawalModal.rateInfo', { rate: RATE })}
                                    </p>
                                    <p className="text-xs text-muted-foreground">
                                        Montant minimum : {minWithdrawalPi} pièces ({minWithdrawalFCFA.toLocaleString()} FCFA)
                                    </p>
                                </div>

                                {requestedAmountPI > 0 && (
                                    <div className="bg-slate-50 dark:bg-slate-900/50 p-3 rounded-lg border border-slate-200 dark:border-slate-700 space-y-2 text-sm">
                                        <div className="flex justify-between text-muted-foreground">
                                            <span>{t('withdrawalModal.calculation.gross')}:</span>
                                            <span>{requestedAmountFCFA.toLocaleString()} FCFA</span>
                                        </div>
                                        <div className="flex justify-between text-red-500">
                                            <span className="flex items-center gap-1">
                                                <Calculator className="w-3 h-3" /> 
                                                {t('withdrawalModal.calculation.fee', { percent: Math.round(FEE_PERCENT * 100) })}:
                                            </span>
                                            <span>- {feeAmountFCFA.toLocaleString()} FCFA</span>
                                        </div>
                                        <div className="border-t border-slate-200 dark:border-slate-700 pt-2 flex justify-between font-bold text-emerald-700 text-base">
                                            <span>{t('withdrawalModal.calculation.net')}:</span>
                                            <span>{netAmountFCFA.toLocaleString()} FCFA</span>
                                        </div>
                                    </div>
                                )}

                                <div className="grid gap-2">
                                    <Label htmlFor="method">{t('withdrawalModal.methodLabel')}</Label>
                                    <Select onValueChange={setMethod} value={method} disabled={!isBalanceSufficient}>
                                        <SelectTrigger>
                                            <SelectValue placeholder={t('withdrawalModal.methodPlaceholder')} />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {paymentMethods.map((pm) => (
                                                <SelectItem key={pm.code} value={pm.code}>
                                                    {t(pm.labelKey)}
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>

                                <div className="grid gap-2">
                                    <Label htmlFor="details">{t('withdrawalModal.detailsLabel')}</Label>
                                    <Input 
                                        id="details" 
                                        value={details} 
                                        onChange={(e) => setDetails(e.target.value)} 
                                        placeholder={t('withdrawalModal.detailsPlaceholder')}
                                        disabled={!isBalanceSufficient}
                                    />
                                </div>
                            </>
                        ) : (
                            <div className="py-4 text-center">
                                <div className="w-16 h-16 bg-amber-100 dark:bg-amber-900/50 rounded-full flex items-center justify-center mx-auto mb-3">
                                    <Ban className="w-8 h-8 text-amber-500" />
                                </div>
                                <p className="text-sm text-muted-foreground mb-2">
                                    Vous ne pouvez pas encore demander de retrait
                                </p>
                                <p className="text-xs text-muted-foreground">
                                    Accumulez au moins <strong>{minWithdrawalPi} pièces</strong> ({minWithdrawalFCFA.toLocaleString()} FCFA)
                                </p>
                                <div className="mt-4 p-3 bg-emerald-50 dark:bg-emerald-950/30 rounded-lg">
                                    <p className="text-xs text-emerald-700 dark:text-emerald-400">
                                        💡 Astuce : Continuez à partager vos codes promo pour augmenter vos gains !
                                    </p>
                                </div>
                            </div>
                        )}
                    </div>
                )}

                <DialogFooter className="gap-2 sm:gap-0">
                    <Button variant="outline" onClick={() => onOpenChange(false)}>
                        {t('withdrawalModal.buttons.cancel')}
                    </Button>
                    {isBalanceSufficient && (
                        <Button 
                            onClick={handleSubmit} 
                            disabled={loading || !amount || !method || requestedAmountPI <= 0 || requestedAmountPI < minWithdrawalPi} 
                            className="bg-emerald-600 text-white hover:bg-emerald-700 w-full sm:w-auto"
                        >
                            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                            {t('withdrawalModal.buttons.confirm')}
                        </Button>
                    )}
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
};

export default WithdrawalModal;