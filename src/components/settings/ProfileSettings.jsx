import React, { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { useData } from '@/contexts/DataContext';
import { supabase } from '@/lib/customSupabaseClient';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/components/ui/use-toast';
import { Loader2, User, Mail, Phone, MapPin, BadgeCheck, AlertTriangle, Send } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { COUNTRIES, CITIES_BY_COUNTRY } from '@/constants/countries';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';

const ProfileSettings = () => {
    const { user, setForceRefresh } = useAuth();
    const { userProfile } = useData();
    const { toast } = useToast();
    const [loading, setLoading] = useState(false);
    const [resendLoading, setResendLoading] = useState(false);
    const [cooldown, setCooldown] = useState(0);
    const [phoneError, setPhoneError] = useState("");

    // Source de verite : le profil enregistre (affiche aussi dans l'en-tete).
    // Les metadata d'inscription ne servent que de repli le temps du chargement.
    const meta = user?.user_metadata || {};
    const [fullName, setFullName] = useState(userProfile?.full_name || meta.full_name || '');
    const [phone, setPhone] = useState(userProfile?.phone || meta.phone || '');
    const [country, setCountry] = useState(userProfile?.country || meta.country || '');
    const [city, setCity] = useState(userProfile?.city || meta.city || '');
    const [bio, setBio] = useState(userProfile?.bio || meta.bio || '');
    const [cities, setCities] = useState([]);

    // Le profil peut arriver apres le montage : on synchronise les champs une
    // seule fois par utilisateur, sans ecraser une saisie en cours.
    useEffect(() => {
        if (!userProfile) return;
        setFullName(userProfile.full_name || meta.full_name || '');
        setPhone(userProfile.phone || meta.phone || '');
        setCountry(userProfile.country || meta.country || '');
        setCity(userProfile.city || meta.city || '');
        setBio(userProfile.bio || meta.bio || '');
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [userProfile?.id]);

    // Validation du téléphone
    const validatePhone = (phoneNumber) => {
        if (!phoneNumber) return true;
        const phoneRegex = /^[0-9]{8,12}$/;
        return phoneRegex.test(phoneNumber.replace(/\D/g, ''));
    };

    useEffect(() => {
        if (country) {
            setCities(CITIES_BY_COUNTRY[country] || []);
        }
    }, [country]);

    // Handle cooldown timer
    useEffect(() => {
        let interval;
        if (cooldown > 0) {
            interval = setInterval(() => {
                setCooldown((prev) => prev - 1);
            }, 1000);
        }
        return () => clearInterval(interval);
    }, [cooldown]);

    const handleUpdateProfile = async (e) => {
    e.preventDefault();
    
    // Validation du téléphone
    if (phone && !validatePhone(phone)) {
        setPhoneError("Numéro de téléphone invalide (8 à 12 chiffres)");
        return;
    }
    
    setPhoneError("");
    setLoading(true);

    try {
        const cleanPhone = phone ? phone.replace(/\D/g, '') : null;
        
        const updates = {
            full_name: fullName,
            phone: cleanPhone,
            country,
            city,
            bio,
            updated_at: new Date(),
        };

        // 1. Mettre à jour auth.users
        const { error: authError } = await supabase.auth.updateUser({
            data: updates
        });

        if (authError) throw authError;

        // 2. Mettre à jour profiles
        const { error: profileError } = await supabase
            .from('profiles')
            .update({
                full_name: fullName,
                phone: cleanPhone,
                country: country,
                city: city,
                bio: bio,
                updated_at: new Date()
            })
            .eq('id', user.id);

        if (profileError) {
            // Log l'erreur mais ne pas bloquer car auth.users est déjà à jour
            console.error("Profile update error:", profileError);
            toast({
                title: "Attention",
                description: "Profil mis à jour partiellement. Rechargez la page.",
                variant: "warning",
            });
        } else {
            toast({
                title: "Profil mis à jour",
                description: "Vos informations ont été enregistrées avec succès.",
            });
        }
        
        // Forcer le refresh des données
        setForceRefresh(prev => !prev);
        
    } catch (error) {
        console.error("Update error:", error);
        toast({
            title: "Erreur",
            description: error.message || "Erreur lors de la mise à jour",
            variant: "destructive",
        });
    } finally {
        setLoading(false);
    }
};

    const handleResendConfirmation = async () => {
        if (cooldown > 0) return;
        
        setResendLoading(true);
        try {
            const { error } = await supabase.auth.resend({
                type: 'signup',
                email: user.email,
                options: {
                    emailRedirectTo: window.location.origin + '/profile'
                }
            });

            if (error) throw error;

            toast({
                title: "Email envoyé",
                description: "Veuillez vérifier votre boîte de réception.",
                className: "bg-green-600 text-white"
            });
            
            setCooldown(60);

        } catch (error) {
            console.error("Resend error:", error);
            toast({
                title: "Erreur d'envoi",
                description: error.message || "Impossible d'envoyer l'email. Veuillez réessayer plus tard.",
                variant: "destructive"
            });
        } finally {
            setResendLoading(false);
        }
    };

    const isEmailVerified = user?.email_confirmed_at || user?.user_metadata?.email_verified;

    return (
        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
            {/* Email Verification Status Card */}
            <Card className={`border-l-4 ${isEmailVerified ? 'border-l-green-500' : 'border-l-yellow-500'}`}>
                <CardHeader className="pb-3">
                    <div className="flex items-center justify-between">
                        <div className="space-y-1">
                            <CardTitle className="text-lg flex items-center gap-2">
                                <Mail className="w-5 h-5" />
                                Statut de l'email
                            </CardTitle>
                            <CardDescription>
                                {user?.email}
                            </CardDescription>
                        </div>
                        {isEmailVerified ? (
                            <div className="flex items-center gap-2 text-green-600 bg-green-100 px-3 py-1 rounded-full text-sm font-bold">
                                <BadgeCheck className="w-4 h-4" />
                                Vérifié
                            </div>
                        ) : (
                            <div className="flex items-center gap-2 text-yellow-600 bg-yellow-100 px-3 py-1 rounded-full text-sm font-bold">
                                <AlertTriangle className="w-4 h-4" />
                                Non vérifié
                            </div>
                        )}
                    </div>
                </CardHeader>
                {!isEmailVerified && (
                    <CardContent>
                        <Alert className="bg-yellow-50 border-yellow-200 mb-4">
                            <AlertTitle className="text-yellow-800">Action requise</AlertTitle>
                            <AlertDescription className="text-yellow-700">
                                Veuillez confirmer votre adresse email pour sécuriser votre compte et accéder à toutes les fonctionnalités.
                            </AlertDescription>
                        </Alert>
                        
                        <div className="flex flex-col sm:flex-row gap-3 items-center">
                            <Button 
                                variant="outline" 
                                onClick={handleResendConfirmation} 
                                disabled={resendLoading || cooldown > 0}
                                className="w-full sm:w-auto"
                            >
                                {resendLoading ? (
                                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                ) : (
                                    <Send className="w-4 h-4 mr-2" />
                                )}
                                {cooldown > 0 ? `Réessayer dans ${cooldown}s` : "Renvoyer l'email de confirmation"}
                            </Button>
                            {cooldown > 0 && (
                                <span className="text-xs text-muted-foreground animate-pulse">
                                    Email envoyé ! Vérifiez vos spams.
                                </span>
                            )}
                        </div>
                    </CardContent>
                )}
            </Card>

            {/* Profile Information Form */}
            <Card>
                <CardHeader>
                    <CardTitle>Informations personnelles</CardTitle>
                    <CardDescription>
                        Mettez à jour vos informations publiques.
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <form onSubmit={handleUpdateProfile} className="space-y-4">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label htmlFor="fullName" className="flex items-center gap-2"><User className="w-4 h-4" /> Nom complet</Label>
                                <Input 
                                    id="fullName" 
                                    value={fullName} 
                                    onChange={(e) => setFullName(e.target.value)} 
                                    placeholder="Votre nom" 
                                />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="phone" className="flex items-center gap-2"><Phone className="w-4 h-4" /> Téléphone</Label>
                                <Input 
                                    id="phone" 
                                    value={phone} 
                                    onChange={(e) => setPhone(e.target.value)} 
                                    placeholder="Ex: 73790978" 
                                />
                                {phoneError && (
                                    <p className="text-xs text-destructive">{phoneError}</p>
                                )}
                                <p className="text-xs text-muted-foreground">
                                    Format: 8 à 12 chiffres (sans espaces ni indicatif)
                                </p>
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="country" className="flex items-center gap-2"><MapPin className="w-4 h-4" /> Pays</Label>
                                <Select value={country} onValueChange={setCountry}>
                                    <SelectTrigger>
                                        <SelectValue placeholder="Sélectionnez un pays" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {COUNTRIES.map((c) => (
                                            <SelectItem key={c.code} value={c.name}>
                                                {c.name}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="city" className="flex items-center gap-2"><MapPin className="w-4 h-4" /> Ville</Label>
                                <Select value={city} onValueChange={setCity} disabled={!country}>
                                    <SelectTrigger>
                                        <SelectValue placeholder={cities.length ? "Sélectionnez une ville" : "Sélectionnez d'abord un pays"} />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {cities.map((c) => (
                                            <SelectItem key={c} value={c}>
                                                {c}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                            <div className="space-y-2 md:col-span-2">
                                <Label htmlFor="bio">Bio</Label>
                                <Input 
                                    id="bio" 
                                    value={bio} 
                                    onChange={(e) => setBio(e.target.value)} 
                                    placeholder="Une courte description de vous..." 
                                />
                            </div>
                        </div>

                        <div className="pt-4 flex justify-end">
                            <Button type="submit" disabled={loading} className="w-full md:w-auto">
                                {loading ? (
                                    <>
                                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                        Enregistrement...
                                    </>
                                ) : (
                                    'Enregistrer les modifications'
                                )}
                            </Button>
                        </div>
                    </form>
                </CardContent>
            </Card>
        </div>
    );
};

export default ProfileSettings;