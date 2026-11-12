import React, { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { supabase } from "@/lib/customSupabaseClient";
import { Crown } from "lucide-react";

const Footer = () => {
  const { t } = useTranslation();
  const year = new Date().getFullYear();
  const [sponsors, setSponsors] = useState([]);
  const [sponsorsLoading, setSponsorsLoading] = useState(true);

  useEffect(() => {
    const fetchSponsors = async () => {
      try {
        const { data, error } = await supabase
          .from("sponsors")
          .select("*")
          .eq("is_active", true)
          .eq("show_in_footer", true)
          .order("display_order", { ascending: true })
          .order("name", { ascending: true });

        if (error) {
          console.error("Error fetching sponsors:", error);
          return;
        }

        setSponsors(data || []);
      } catch (error) {
        console.error("Error in fetchSponsors:", error);
      } finally {
        setSponsorsLoading(false);
      }
    };

    fetchSponsors();
  }, []);

  const footerLinks = {
    platform: [
      { to: "/", text: t("footer.home") },
      { to: "/how-it-works", text: t("footer.how_it_works") },
      { to: "/aide", text: t("footer.help") },
      { to: "/faq", text: t("footer.faq") },
      { to: "/documentation", text: t("footer.documentation") },
      { to: "/help-center", text: t("footer.help_center") },
    ],
    company: [
      { to: "/about", text: t("footer.about") },
      { to: "/partner-signup", text: t("footer.partnership") },
      { to: "/contrat-partenariat", text: "Contrat de partenariat" },
      { to: "/sponsors", text: t("footer.sponsors") },
      {
        href: "mailto:support@bonplaninfos.net",
        text: "support@bonplaninfos.net",
      },
      {
        href: "https://chat.whatsapp.com/IcR0TttLYpU1lJXr3ifyvH",
        text: t("whatsapp_Groupe"),
      },
      { href: "tel:+2250712275374", text: "Tel: 002250712275374" },
    ],
    legal: [
      { to: "/politique-confidentialite", text: t("footer.privacy") },
      { to: "/conditions-utilisation", text: t("footer.terms") },
      { to: "/protection-donnees", text: t("footer.data_protection") },
      { to: "/legal-mentions", text: t("footer.legal_mentions") },
    ],
  };

  const getSponsorLevelClass = (level) => {
    switch (level) {
      case "gold":
        return "text-yellow-500 border-yellow-500 bg-yellow-50";
      case "silver":
        return "text-gray-600 border-gray-400 bg-gray-50";
      case "bronze":
        return "text-orange-700 border-orange-600 bg-orange-50";
      default:
        return "text-primary border-primary bg-muted";
    }
  };

  const getSponsorLevelName = (level) => {
    switch (level) {
      case "gold":
        return "Or";
      case "silver":
        return "Argent";
      case "bronze":
        return "Bronze";
      default:
        return null;
    }
  };

  const duplicatedSponsors =
    sponsors.length > 0 ? [...sponsors, ...sponsors, ...sponsors] : [];

  return (
    <footer className="bg-card border-t border-border/50">
      <div className="container py-12">
        {sponsors.length > 0 && (
          <div className="mb-12 pb-8 border-b border-border/50">
            <div className="flex items-center justify-center gap-3 mb-6">
              <Crown className="w-5 h-5 text-primary" />
              <h3 className="text-lg font-bold font-heading text-center text-foreground">
                {t("sponsors.title")}
              </h3>
              <Crown className="w-5 h-5 text-primary" />
            </div>

            {sponsorsLoading ? (
              <div className="flex justify-center">
                <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin"></div>
              </div>
            ) : (
              <div className="relative overflow-hidden">
                <div className="flex animate-scroll whitespace-nowrap">
                  {duplicatedSponsors.map((sponsor, index) => (
                    <a
                      href={sponsor.website_url || "#"}
                      target="_blank"
                      rel="noopener noreferrer"
                      key={`${sponsor.id}-${index}`}
                      className="flex flex-col items-center mx-4 group flex-shrink-0"
                    >
                      <div
                        className={`relative p-3 bg-background rounded-lg border-2 ${getSponsorLevelClass(sponsor.level)} transition-all duration-300 group-hover:scale-105 group-hover:shadow-md`}
                      >
                        {sponsor.logo_url ? (
                          <img
                            src={sponsor.logo_url}
                            alt={sponsor.name}
                            className="h-10 w-auto max-w-28 object-contain"
                          />
                        ) : (
                          <div
                            className={`h-10 w-28 flex items-center justify-center text-xs font-medium text-center ${getSponsorLevelClass(sponsor.level)}`}
                          >
                            {sponsor.name}
                          </div>
                        )}
                      </div>
                      {sponsor.level && (
                        <span
                          className={`mt-1 px-2 py-0.5 text-xs font-medium rounded-full border ${getSponsorLevelClass(sponsor.level)} capitalize`}
                        >
                          {getSponsorLevelName(sponsor.level)}
                        </span>
                      )}
                    </a>
                  ))}
                </div>

                <div className="absolute left-0 top-0 bottom-0 w-20 bg-gradient-to-r from-card to-transparent z-10"></div>
                <div className="absolute right-0 top-0 bottom-0 w-20 bg-gradient-to-l from-card to-transparent z-10"></div>
              </div>
            )}
          </div>
        )}

        <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
          <div className="col-span-2 md:col-span-1">
            <h3 className="font-bold font-heading text-lg mb-2 text-foreground">
              BonPlanInfos
            </h3>
            <p className="text-sm text-muted-foreground">
              {t("footer.tagline")}
            </p>
          </div>

          <div>
            <h4 className="font-semibold font-heading mb-3 text-foreground">
              {t("footer.platform")}
            </h4>
            <ul className="space-y-2 text-sm">
              {footerLinks.platform.map((link) => (
                <li key={link.to}>
                  <Link
                    to={link.to}
                    className="text-muted-foreground hover:text-primary"
                  >
                    {link.text}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h4 className="font-semibold font-heading mb-3 text-foreground">
              {t("footer.company")}
            </h4>
            <ul className="space-y-2 text-sm">
              {footerLinks.company.map((link) => (
                <li key={link.to || link.href}>
                  {link.to ? (
                    <Link
                      to={link.to}
                      className="text-muted-foreground hover:text-primary"
                    >
                      {link.text}
                    </Link>
                  ) : (
                    <a
                      href={link.href}
                      className="text-muted-foreground hover:text-primary"
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      {link.text}
                    </a>
                  )}
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h4 className="font-semibold font-heading mb-3 text-foreground">
              {t("footer.legal")}
            </h4>
            <ul className="space-y-2 text-sm">
              {footerLinks.legal.map((link) => (
                <li key={link.to}>
                  <Link
                    to={link.to}
                    className="text-muted-foreground hover:text-primary"
                  >
                    {link.text}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="mt-12 border-t border-border/50 pt-8 text-center text-xs text-muted-foreground">
          <p>
            © {year} BonPlanInfos — {t("Tous droits réservés")} |{" "}
            <Link
              to="/politique-confidentialite"
              className="hover:text-primary"
            >
              {t("footer.privacy")}
            </Link>{" "}
            |{" "}
            <Link to="/conditions-utilisation" className="hover:text-primary">
              {t("footer.terms")}
            </Link>
          </p>
          <p className="mt-2 text-sm leading-relaxed">
            support@bonplaninfos.net <br />
            WhatsApp :{" "}
            <a
              href="https://chat.whatsapp.com/IcR0TttLYpU1lJXr3ifyvH"
              className="hover:text-primary underline"
              target="_blank"
              rel="noopener noreferrer"
            >
              {t("whatsapp_community")}
            </a>
            <br />
            📞 Côte d’Ivoire :
            <a href="tel:+2250712275374" className="hover:text-primary ml-1">
              +225 07 12 27 53 74
            </a>
            <br />
            📞 Burkina Faso :
            <a href="tel:+22657184468" className="hover:text-primary ml-1">
              +226 57 18 44 68
            </a>{" "}
            /{" "}
            <a href="tel:+22673790978" className="hover:text-primary">
            73 79 09 78
            </a>
          </p>
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-muted/20 text-[9px] md:text-[10px] text-muted-foreground">
            <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse"></span>
            {t("version")} 1.0.0
            <span className="w-1 h-1 rounded-full bg-primary/30 mx-1"></span>
            Dernière mise à jour : {new Date().toLocaleDateString()}
          </span>
        </div>
      </div>
      {/* ✅ Styles corrigés - suppression de l'attribut jsx */}
      <style>{`
                @keyframes scroll {
                    0% { transform: translateX(0); }
                    100% { transform: translateX(-33.333%); }
                }
                .animate-scroll { animation: scroll 30s linear infinite; }
                .animate-scroll:hover { animation-play-state: paused; }
                
                @media (max-width: 768px) {
                    .animate-scroll { animation: scroll 20s linear infinite; }
                }
            `}</style>
    </footer>
  );
};

export default Footer;
