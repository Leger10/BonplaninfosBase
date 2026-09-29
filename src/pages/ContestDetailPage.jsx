import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { motion } from 'framer-motion';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Trophy, Clock, Coins, Vote as VoteIcon, Loader2, Minus, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { useData } from '@/contexts/DataContext';
import { toast } from '@/components/ui/use-toast';
import { supabase } from '@/lib/customSupabaseClient';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import PaymentModal from '@/components/PaymentModal';
import { Input } from '@/components/ui/input';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import WalletInfoModal from '@/components/WalletInfoModal';
import USSDPaymentModal, { openBonplaninfosRelance, buildUSSDCode } from '@/components/payment/USSDPaymentModal';


const CandidateCard = ({ candidate, onVote, totalVotes }) => {
    const percentage = totalVotes > 0 ? ((candidate.vote_count / totalVotes) * 100).toFixed(2) : 0;

    return (
        <motion.div
            className="bg-gray-800/50 rounded-lg p-4 flex items-center justify-between"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
        >
            <div className="flex items-center gap-4 flex-1">
                <Avatar className="w-16 h-16 border-2 border-primary">
                    <AvatarImage src={candidate.photo_url} alt={candidate.name} />
                    <AvatarFallback>{candidate.name?.charAt(0)}</AvatarFallback>
                </Avatar>
                <div className="w-full">
                    <p className="font-bold text-lg text-white">{candidate.name}</p>
                    <div className="flex items-center gap-2 mt-1">
                        <div className="w-full bg-gray-700 rounded-full h-2.5">
                            <motion.div
                                className="bg-gradient-to-r from-amber-400 to-primary h-2.5 rounded-full"
                                initial={{ width: 0 }}
                                animate={{ width: `${percentage}%` }}
                                transition={{ duration: 0.5, ease: 'easeOut' }}
                            />
                        </div>
                        <span className="text-amber-400 font-bold text-sm min-w-[50px] text-right">{percentage}%</span>
                    </div>
                </div>
            </div>
            <Button onClick={onVote} size="sm" className="ml-4 gradient-gold text-background font-bold">Voter</Button>
        </motion.div>
    );
};

const ContestDetailPage = () => {
    const { id } = useParams();
    const navigate = useNavigate();
    const { user } = useAuth();
    const { userProfile, forceRefreshUserProfile, adminConfig } = useData();
    const coinRate = adminConfig?.coin_to_fcfa_rate || 10;
    const [contest, setContest] = useState(null);
    const [candidates, setCandidates] = useState([]);
    const [loading, setLoading] = useState(true);
    const [showPaymentModal, setShowPaymentModal] = useState(false);
    const [showWalletInfoModal, setShowWalletInfoModal] = useState(false);
    const [voteState, setVoteState] = useState({ isOpen: false, candidate: null, quantity: 1 });
    const [actionLoading, setActionLoading] = useState(false);
    const [votePaymentMethod, setVotePaymentMethod] = useState('coins');
    const [showUSSDModal, setShowUSSDModal] = useState(false);
    const [ussdAmount, setUssdAmount] = useState(0);
    const [ussdSuccess, setUssdSuccess] = useState(false);
    const [ussdVoteData, setUssdVoteData] = useState(null);

    const fetchContestData = useCallback(async () => {
        const { data: contestData, error: contestError } = await supabase
            .from('contests')
            .select('*')
            .eq('id', id)
            .single();

        if (contestError || !contestData) {
            toast({ title: "Erreur", description: "Concours non trouvé.", variant: "destructive" });
            navigate('/contests');
            return;
        }
        setContest(contestData);

        const { data: candidatesData, error: candidatesError } = await supabase
            .from('candidates')
            .select('*')
            .eq('contest_id', id)
            .order('vote_count', { ascending: false });

        if (candidatesError) {
            toast({ title: "Erreur", description: "Impossible de charger les candidats.", variant: "destructive" });
        } else {
            setCandidates(candidatesData);
        }
    }, [id, navigate]);

    useEffect(() => {
        setLoading(true);
        fetchContestData().finally(() => setLoading(false));
    }, [fetchContestData]);

    useEffect(() => {
        const channel = supabase
            .channel(`contest-${id}`)
            .on('postgres_changes', { event: '*', schema: 'public', table: 'candidates', filter: `contest_id=eq.${id}` },
                () => {
                    fetchContestData();
                }
            )
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, [id, fetchContestData]);

    const handleVote = async () => {
        if (!user) {
            toast({ title: "Connexion requise", variant: "destructive" });
            navigate('/auth');
            return;
        }
        const { candidate, quantity } = voteState;

        // Paiement par USSD : ouvrir la modale USSD au lieu de débiter les pièces
        if (votePaymentMethod === 'ussd') {
            setVoteState(prev => ({ ...prev, isOpen: false }));
            setUssdSuccess(false);
            setUssdVoteData({ candidate, quantity });
            setUssdAmount(contest.vote_cost_coins * quantity * coinRate);
            setShowUSSDModal(true);
            return;
        }

        setActionLoading(true);
        setVoteState(prev => ({ ...prev, isOpen: false }));

        // VOTE PAYANT ATOMIQUE : paiement + inscription + journal se font en une
        // seule transaction serveur (cast_contest_votes). Avant, le débit était
        // séparé (CoinService.debitCoins) puis increment_vote_count ajoutait les
        // voix : une panne entre les deux faisait perdre les pièces SANS voix, et
        // increment_vote_count pouvait être appelé seul pour fabriquer des voix
        // gratuites. Plus AUCUNE écriture directe ici : si la RPC échoue, rien
        // n'est débité.
        try {
            const { data: voteData, error: voteError } = await supabase.rpc('cast_contest_votes', {
                p_user_id: user.id,
                p_event_id: contest.id,
                p_votes: [{ candidate_id: candidate.id, vote_count: quantity }],
                p_idempotency_key:
                    (typeof crypto !== 'undefined' && crypto.randomUUID)
                        ? crypto.randomUUID()
                        : `${Date.now()}-${Math.random().toString(36).slice(2, 12)}`,
            });
            if (voteError) throw voteError;
            if (!voteData?.success) {
                const err = { code: voteData?.error?.code || 'VOTE_FAILED', message: voteData?.error?.message || voteData?.message || 'Échec du vote' };
                throw err;
            }
            await forceRefreshUserProfile();
            toast({ title: "Vote réussi!", description: `Vous avez donné ${quantity} voix à ${candidate.name}.` });
        } catch (error) {
            if (String(error?.code || '').includes('INSUFFICIENT')) {
                setShowWalletInfoModal(true);
            } else {
                toast({ title: "Erreur de vote", description: error?.message || error, variant: "destructive" });
            }
        } finally {
            setActionLoading(false);
        }
    };

    const openVoteDialog = (candidate) => {
        setVoteState({ isOpen: true, candidate, quantity: 1 });
    };

    const updateVoteQuantity = (amount) => {
        setVoteState(prev => ({ ...prev, quantity: Math.max(1, prev.quantity + amount) }));
    };

    const confirmVoteUSSD = async (proofDataUrl, phoneInput) => {
        const txnId = `ussd_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
        const response = await fetch('/.netlify/functions/ussd-payment', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
            body: JSON.stringify({
                action: 'submit',
                type: 'votes',
                proofDataUrl: proofDataUrl || null,
                amountFcfa: ussdAmount,
                phone: phoneInput || userProfile?.phone || '',
                transactionId: txnId,
                userId: user?.id,
                eventId: null,
                contestId: id,
                organizerId: contest?.organizer_id || null,
                candidateId: ussdVoteData?.candidate?.id,
                voteCount: ussdVoteData?.quantity || 1,
                votePricePi: contest?.vote_cost_coins || 1,
                attendeeName: userProfile?.full_name || user?.email || 'Inconnu',
                userEmail: user?.email || null,
                isGuest: !user,
            }),
        });
        const text = await response.text();
        let result;
        try {
            result = JSON.parse(text);
        } catch (e) {
            result = null;
        }
        if (!result && response.status === 404) {
            // Fallback dev : la Netlify Function n'est pas disponible en vite pur,
            // rappeler d'utiliser le serveur netlify dev. On refuse pour éviter un faux positif.
            throw new Error("Paiement USSD indisponible sur ce serveur. Utilisez http://localhost:8090 (netlify dev).");
        }
        if (!response.ok || !result?.success) {
            throw new Error(result?.message || `Erreur HTTP ${response.status}`);
        }
        setUssdSuccess(true);
        return true;
    };

    const totalVotes = useMemo(() => candidates.reduce((acc, c) => acc + c.vote_count, 0), [candidates]);

    if (loading && !contest) return <div className="min-h-screen bg-black flex items-center justify-center"><Loader2 className="w-12 h-12 animate-spin text-primary" /></div>;
    if (!contest) return null;

    return (
        <div className="min-h-screen bg-black text-white" style={{ background: 'linear-gradient(180deg, #1a1a1a 0%, #000000 100%)' }}>
            <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
                <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="mb-6">
                    <Button variant="ghost" onClick={() => navigate('/contests')} className="text-gray-400 hover:text-white"><ArrowLeft className="w-4 h-4 mr-2" />Retour</Button>
                </motion.div>

                <Card className="bg-transparent border-0 shadow-none text-center mb-8">
                    <CardContent className="p-0">
                        <h1 className="text-4xl font-extrabold text-amber-400 tracking-tight uppercase">{contest.title}</h1>
                        <p className="text-gray-300 mt-2 max-w-2xl mx-auto">{contest.description}</p>
                        <div className="flex flex-wrap gap-x-6 gap-y-2 justify-center mt-4 text-sm text-gray-400">
                            <div className="flex items-center"><Trophy className="w-4 h-4 mr-2 text-amber-400" /> Coût: <strong className="ml-1.5 flex items-center text-white">{contest.vote_cost_coins} <Coins className="w-3 h-3 ml-1 text-amber-400" />
                                        <span className="ml-1 text-gray-400 font-normal">({contest.vote_cost_coins * coinRate} FCFA)</span>
                                    </strong></div>
                            <div className="flex items-center"><Clock className="w-4 h-4 mr-2 text-amber-400" /> Fin: <strong className="ml-1.5 text-white">{new Date(contest.event_end_at).toLocaleDateString('fr-FR')}</strong></div>
                        </div>
                    </CardContent>
                </Card>

                <div className="space-y-4">
                    {loading && candidates.length === 0 ? (
                        <div className="flex justify-center items-center h-64"><Loader2 className="w-12 h-12 animate-spin text-primary" /></div>
                    ) : (
                        candidates.map((candidate) => (
                            <CandidateCard key={candidate.id} candidate={candidate} onVote={() => openVoteDialog(candidate)} totalVotes={totalVotes} />
                        ))
                    )}
                </div>
            </main>

            <PaymentModal isOpen={showPaymentModal} onClose={() => setShowPaymentModal(false)} />
            <WalletInfoModal isOpen={showWalletInfoModal} onClose={() => setShowWalletInfoModal(false)} onProceed={() => { setShowWalletInfoModal(false); setShowPaymentModal(true); }} />

            <AlertDialog open={voteState.isOpen} onOpenChange={() => setVoteState({ isOpen: false, candidate: null, quantity: 1 })}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Voter pour {voteState.candidate?.name}</AlertDialogTitle>
                        <AlertDialogDescription>
                            Chaque vote coûte {contest.vote_cost_coins} pièces ({contest.vote_cost_coins * coinRate} FCFA). Combien de voix souhaitez-vous donner ?
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <div className="flex items-center justify-center gap-4 my-4">
                        <Button variant="outline" size="icon" onClick={() => updateVoteQuantity(-1)}><Minus className="w-4 h-4" /></Button>
                        <Input type="number" value={voteState.quantity} readOnly className="w-20 text-center text-lg font-bold" />
                        <Button variant="outline" size="icon" onClick={() => updateVoteQuantity(1)}><Plus className="w-4 h-4" /></Button>
                    </div>
                    <div className="flex gap-2 justify-center my-3">
                        <Button
                            variant={votePaymentMethod === 'coins' ? 'default' : 'outline'}
                            onClick={() => setVotePaymentMethod('coins')}
                            className="flex-1"
                        >
                            <Coins className="w-4 h-4 mr-2" /> Pièces
                        </Button>
                        <Button
                            variant={votePaymentMethod === 'ussd' ? 'default' : 'outline'}
                            onClick={() => setVotePaymentMethod('ussd')}
                            className="flex-1"
                        >
                            <Trophy className="w-4 h-4 mr-2" /> USSD
                        </Button>
                    </div>
                    {votePaymentMethod === 'coins' ? (
                        <p className="text-center font-semibold">
                            Coût total : {contest.vote_cost_coins * voteState.quantity} pièces ({contest.vote_cost_coins * voteState.quantity * coinRate} FCFA)
                        </p>
                    ) : (
                        <div className="text-center">
                            <p className="font-semibold">
                                Coût total : {(contest.vote_cost_coins * voteState.quantity * coinRate).toLocaleString('fr-FR')} FCFA
                            </p>
                            <p className="mt-2 font-mono text-base sm:text-lg font-bold text-amber-400 tracking-wider break-all select-all">
                                {buildUSSDCode(contest.vote_cost_coins * voteState.quantity * coinRate)}
                            </p>
                            <p className="text-[10px] text-gray-500 mt-1">
                                Composez ce code sur votre téléphone, validez avec votre code secret, puis confirmez.
                            </p>
                        </div>
                    )}
                    <AlertDialogFooter>
                        <AlertDialogCancel>Annuler</AlertDialogCancel>
                        <AlertDialogAction onClick={handleVote} disabled={actionLoading}>
                            {actionLoading ? <Loader2 className="animate-spin" /> : `Confirmer ${voteState.quantity} voix`}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>

            <USSDPaymentModal
                open={showUSSDModal}
                onClose={() => {
                    setShowUSSDModal(false);
                    if (ussdSuccess) {
                        setUssdSuccess(false);
                        setUssdVoteData(null);
                    } else {
                        openBonplaninfosRelance(ussdAmount);
                    }
                }}
                amountFcfa={ussdAmount}
                title="Paiement du vote par Mobile Money"
                subtitle="Payez par USSD puis confirmez avec la référence reçue par SMS. Vos voix seront ajoutées après validation par l'équipe."
                submitLabel="J'ai payé mes voix"
                requirePhone={true}
                initialPhone={userProfile?.phone || ''}
                onConfirm={confirmVoteUSSD}
            />
        </div>
    );
};

export default ContestDetailPage;