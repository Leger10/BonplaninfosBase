import React, { useEffect, useState } from "react";
import { useAuth } from "@/contexts/SupabaseAuthContext";

// Assurez-vous que le CSS suivant est inclus globalement :
// .screen-watermark {
//   position: fixed;
//   inset: 0;
//   z-index: 9999;
//   pointer-events: none;
// }
// .screen-watermark span {
//   position: absolute;
//   font-size: 18px;
//   color: black;
//   opacity: 0.06;
//   white-space: nowrap;
//   user-select: none;
//   animation: watermarkFloat 10s linear infinite;
// }
// @keyframes watermarkFloat {
//   0% { transform: translateY(0px); }
//   50% { transform: translateY(-15px); }
//   100% { transform: translateY(0px); }
// }

const ScreenCaptureBlocker = () => {
  const { user } = useAuth();
  const [watermarks, setWatermarks] = useState([]);

  const generateText = () => {
    const email = user?.email || "Utilisateur";
    const id = user?.id?.slice(0, 6) || "unknown";
    const time = new Date().toLocaleTimeString();

    return `${email} • ${id} • ${time} • BonPlanInfos`;
  };

  const generateWatermarks = () => {
    const text = generateText();
    const items = [];

    // Nombre réduit de filigranes pour moins de gêne visuelle sur les pages
    // qui affichent déjà beaucoup d'informations (licences, salaires, etc.).
    for (let i = 0; i < 3; i++) {
      items.push({
        text,
        top: Math.random() * 100,
        left: Math.random() * 100,
        rotate: Math.random() * 60 - 30,
      });
    }

    setWatermarks(items);
  };

  useEffect(() => {
    if (!user) return;

    generateWatermarks();

    const interval = setInterval(() => {
      generateWatermarks();
    }, 15000); // repositionnement toutes les 15 secondes

    return () => clearInterval(interval);
  }, [user]);

  if (!user) return null;

  return (
    <div className="screen-watermark">
      {watermarks.map((wm, index) => (
        <span
          key={index}
          style={{
            top: `${wm.top}%`,
            left: `${wm.left}%`,
            transform: `rotate(${wm.rotate}deg)`,
          }}
        >
          {wm.text}
        </span>
      ))}
    </div>
  );
};

export default ScreenCaptureBlocker;