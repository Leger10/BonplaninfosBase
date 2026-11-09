import React from "react";
import { motion } from "framer-motion";
import { Helmet } from "react-helmet-async";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Calendar,
  Ticket,
  Smartphone,
  ShieldCheck,
  MapPin,
  Users,
  TrendingUp,
  Wallet,
  Megaphone,
  QrCode,
  Building2,
  CheckCircle2,
  ArrowRight,
  Store,
  Vote,
} from "lucide-react";

const fadeUp = {
  hidden: { opacity: 0, y: 24 },
  show: (i = 0) => ({ opacity: 1, y: 0, transition: { duration: 0.5, delay: i * 0.08 } }),
};

const HowItWorksPage = () => {
  const navigate = useNavigate();

  const pillars = [
    {
      icon: <Ticket className="w-6 h-6" />,
      audience: "Pour les participants",
      color: "from-blue-500/20 to-cyan-500/10 border-blue-500/30",
      iconBg: "bg-blue-500/15 text-blue-400",
      points: [
        "Découvrez les événements, promotions et activités près de chez vous.",
        "Achetez vos billets, participez aux votes, réservez un stand ou prenez des tickets de tombola.",
        "Payez facilement par USSD / Mobile Money, avec suivi et validation du paiement.",
        "Recevez vos accès/billets et présentez-les simplement le jour J (QR code / preuve).",
      ],
      cta: { label: "Explorer les événements", to: "/" },
    },
    {
      icon: <Megaphone className="w-6 h-6" />,
      audience: "Pour les organisateurs",
      color: "from-amber-500/20 to-orange-500/10 border-amber-500/30",
      iconBg: "bg-amber-500/15 text-amber-400",
      points: [
        "Publiez et gérez vos événements, la billetterie, les votes, les stands et les tombolas.",
        "Centralisez les ventes et suivez vos revenus en toute transparence.",
        "Touchez une audience locale ciblée (pays/ville) grâce au réseau de la plateforme.",
        "Demandez le retrait de vos gains selon les règles de la plateforme, avec un suivi clair.",
      ],
      cta: { label: "Créer un compte organisateur", to: "/auth", state: { isRegistering: true } },
    },
    {
      icon: <Building2 className="w-6 h-6" />,
      audience: "Pour les partenaires (ville / pays)",
      color: "from-emerald-500/20 to-teal-500/10 border-emerald-500/30",
      iconBg: "bg-emerald-500/15 text-emerald-400",
      points: [
        "Devenez partenaire avec un pack adapté à votre zone (ville, région ou pays).",
        "Paiement du pack par USSD, vérifié et validé par le super administrateur.",
        "Après validation : activation de la licence et nomination administrateur/partenaire sur votre zone.",
        "Contribuez au développement local de la plateforme et bénéficiez des commissions prévues par votre pack.",
      ],
      cta: { label: "Devenir partenaire", to: "/partner-signup" },
    },
  ];

  const flow = [
    { icon: <MapPin className="w-5 h-5" />, title: "Découvrir", text: "Trouvez des événements et offres pertinents autour de vous." },
    { icon: <Ticket className="w-5 h-5" />, title: "Choisir", text: "Billet, vote, stand ou tombola — selon l’événement." },
    { icon: <Smartphone className="w-5 h-5" />, title: "Payer par USSD", text: "Payez via Mobile Money et envoyez la preuve du dépôt." },
    { icon: <ShieldCheck className="w-5 h-5" />, title: "Validation sécurisée", text: "Le paiement est contrôlé avant la livraison des accès/gains." },
    { icon: <QrCode className="w-5 h-5" />, title: "Accéder / Participer", text: "Utilisez votre billet ou confirmation le jour de l’événement." },
    { icon: <Wallet className="w-5 h-5" />, title: "Suivre les gains", text: "Organisateurs et partenaires suivent leurs revenus et retraits." },
  ];

  const valueProps = [
    { icon: <Smartphone className="w-5 h-5" />, title: "Paiement USSD / Mobile Money", text: "Un parcours de paiement accessible, avec preuve de dépôt et validation." },
    { icon: <ShieldCheck className="w-5 h-5" />, title: "Confiance & contrôle", text: "Vérification des paiements et traçabilité des opérations sensibles." },
    { icon: <MapPin className="w-5 h-5" />, title: "Ancrage local", text: "Une logique par pays et par ville pour une couverture de terrain réelle." },
    { icon: <TrendingUp className="w-5 h-5" />, title: "Valeur pour tout l’écosystème", text: "Participants, organisateurs et partenaires trouvent chacun un bénéfice concret." },
  ];

  return (
    <div className="bg-background text-foreground">
      <Helmet>
        <title>Comment ça marche — BonPlanInfos</title>
        <meta
          name="description"
          content="Découvrez BonPlanInfos : trouvez des événements, achetez billets/votes/stands par USSD Mobile Money, organisez et suivez vos revenus, ou devenez partenaire par zone (ville/pays)."
        />
      </Helmet>

      <main className="container mx-auto px-4 py-10 sm:py-14">
        {/* Hero */}
        <motion.section
          initial="hidden"
          animate="show"
          variants={fadeUp}
          className="text-center mb-12 sm:mb-16"
        >
          <Badge variant="outline" className="mb-4 border-primary/40 text-primary bg-primary/10">
            La plateforme des bons plans & événements
          </Badge>
          <h1 className="text-3xl sm:text-4xl md:text-5xl font-extrabold text-primary mb-4 leading-tight">
            BonPlanInfos connecte le public, les organisateurs et les partenaires locaux
          </h1>
          <p className="text-base sm:text-lg md:text-xl text-muted-foreground max-w-3xl mx-auto">
            Découvrez et participez à des événements, payez facilement par <strong className="text-foreground">USSD / Mobile Money</strong>,
            et donnez aux organisateurs comme aux partenaires les outils pour créer de la valeur — en toute transparence.
          </p>
          <div className="mt-8 flex flex-col sm:flex-row gap-3 justify-center">
            <Button size="lg" className="gradient-gold text-background" onClick={() => navigate("/")}>
              <Calendar className="w-4 h-4 mr-2" /> Voir les événements
            </Button>
            <Button size="lg" variant="outline" className="border-primary/40" onClick={() => navigate("/partner-signup")}>
              <Building2 className="w-4 h-4 mr-2" /> Devenir partenaire
            </Button>
          </div>
        </motion.section>

        {/* Value props */}
        <motion.section
          initial="hidden"
          whileInView="show"
          viewport={{ once: true, amount: 0.2 }}
          className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-14"
        >
          {valueProps.map((v, i) => (
            <motion.div key={v.title} variants={fadeUp} custom={i}>
              <Card className="h-full glass-effect border-border/60">
                <CardContent className="p-5">
                  <div className="w-10 h-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center mb-3">
                    {v.icon}
                  </div>
                  <h3 className="font-semibold text-foreground mb-1">{v.title}</h3>
                  <p className="text-sm text-muted-foreground">{v.text}</p>
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </motion.section>

        {/* Pillars */}
        <section className="mb-16">
          <motion.div initial="hidden" whileInView="show" viewport={{ once: true }} variants={fadeUp} className="text-center mb-8">
            <h2 className="text-2xl sm:text-3xl font-bold text-foreground mb-2">Une valeur claire pour chaque acteur</h2>
            <p className="text-muted-foreground max-w-2xl mx-auto">BonPlanInfos n’est pas qu’une vitrine : c’est un parcours complet, de la découverte au paiement et au suivi.</p>
          </motion.div>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
            {pillars.map((p, i) => (
              <motion.div key={p.audience} initial="hidden" whileInView="show" viewport={{ once: true, amount: 0.2 }} variants={fadeUp} custom={i}>
                <Card className={`h-full bg-gradient-to-b ${p.color}`}>
                  <CardHeader className="pb-3">
                    <div className={`w-11 h-11 rounded-xl flex items-center justify-center mb-2 ${p.iconBg}`}>{p.icon}</div>
                    <CardTitle className="text-lg text-foreground">{p.audience}</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <ul className="space-y-2.5">
                      {p.points.map((pt) => (
                        <li key={pt} className="flex items-start gap-2 text-sm text-muted-foreground">
                          <CheckCircle2 className="w-4 h-4 text-primary mt-0.5 flex-shrink-0" />
                          <span>{pt}</span>
                        </li>
                      ))}
                    </ul>
                    <Button
                      variant="outline"
                      className="w-full border-border/70"
                      onClick={() => navigate(p.cta.to, p.cta.state ? { state: p.cta.state } : undefined)}
                    >
                      {p.cta.label} <ArrowRight className="w-4 h-4 ml-2" />
                    </Button>
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </div>
        </section>

        {/* Flow */}
        <section className="mb-16">
          <motion.div initial="hidden" whileInView="show" viewport={{ once: true }} variants={fadeUp} className="text-center mb-8">
            <h2 className="text-2xl sm:text-3xl font-bold text-foreground mb-2">Le parcours, en 6 étapes</h2>
            <p className="text-muted-foreground">Simple pour l’utilisateur, structuré pour les organisateurs et les partenaires.</p>
          </motion.div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {flow.map((s, i) => (
              <motion.div key={s.title} initial="hidden" whileInView="show" viewport={{ once: true, amount: 0.2 }} variants={fadeUp} custom={i}>
                <Card className="h-full border-border/60">
                  <CardContent className="p-5 flex gap-4">
                    <div className="w-10 h-10 rounded-full bg-primary text-primary-foreground flex items-center justify-center flex-shrink-0 font-bold text-sm">
                      {i + 1}
                    </div>
                    <div>
                      <div className="flex items-center gap-2 font-semibold text-foreground mb-1">
                        <span className="text-primary">{s.icon}</span>
                        {s.title}
                      </div>
                      <p className="text-sm text-muted-foreground">{s.text}</p>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </div>
        </section>

        {/* Concrete use cases */}
        <motion.section initial="hidden" whileInView="show" viewport={{ once: true }} variants={fadeUp} className="mb-16">
          <Card className="border-primary/20 bg-gradient-to-r from-primary/5 via-transparent to-amber-500/5">
            <CardContent className="p-6 sm:p-8">
              <h2 className="text-xl sm:text-2xl font-bold text-foreground mb-4">Concrètement, sur BonPlanInfos vous pouvez…</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm text-muted-foreground">
                {[
                  { icon: <Calendar className="w-4 h-4" />, t: "Publier et promouvoir un événement (concert, conférence, soirée, activité…)." },
                  { icon: <Ticket className="w-4 h-4" />, t: "Vendre des billets et gérer les accès des participants." },
                  { icon: <Vote className="w-4 h-4" />, t: "Organiser des votes/concours liés à un événement." },
                  { icon: <Store className="w-4 h-4" />, t: "Proposer des stands et gérer des tickets de tombola." },
                  { icon: <Smartphone className="w-4 h-4" />, t: "Encaisser via USSD/Mobile Money avec validation du paiement." },
                  { icon: <Users className="w-4 h-4" />, t: "Déployer la plateforme par zone (ville/pays) via des partenaires nommés." },
                ].map((x) => (
                  <div key={x.t} className="flex items-start gap-2 rounded-lg border border-border/50 bg-background/40 p-3">
                    <span className="text-primary mt-0.5">{x.icon}</span>
                    <span>{x.t}</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </motion.section>

        {/* CTA */}
        <motion.section
          initial="hidden"
          whileInView="show"
          viewport={{ once: true, amount: 0.4 }}
          variants={fadeUp}
          className="text-center"
        >
          <h2 className="text-2xl sm:text-3xl font-bold mb-3">Prêt à utiliser BonPlanInfos ?</h2>
          <p className="text-muted-foreground mb-7 max-w-xl mx-auto">
            Que vous soyez participant, organisateur ou partenaire, la plateforme est pensée pour créer de la valeur locale réelle.
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Button size="lg" className="gradient-gold text-background" onClick={() => navigate("/auth", { state: { isRegistering: true } })}>
              Créer un compte
            </Button>
            <Button size="lg" variant="outline" className="border-primary/40" onClick={() => navigate("/partner-signup")}>
              Voir les packs partenaires
            </Button>
          </div>
        </motion.section>
      </main>
    </div>
  );
};

export default HowItWorksPage;
