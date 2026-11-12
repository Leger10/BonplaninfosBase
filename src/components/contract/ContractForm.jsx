import React from "react";
import { BadgeCheck, RotateCcw, User, Wand2 } from "lucide-react";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ALL_FIELDS, FIELD_GROUPS } from "@/lib/contract/fields";

const EMPTY_OPTION = "__empty__";

const fieldDomId = (key) => `contract-field-${key.replace(/[^a-zA-Z0-9_-]/g, "-")}`;

function FieldControl({ field, value, onChange }) {
  const id = fieldDomId(field.key);
  const commonProps = {
    id,
    value: value ?? "",
    onChange: (event) => onChange(field.key, event.target.value),
    placeholder: field.placeholder,
    autoComplete: field.autoComplete || "off",
  };

  if (field.type === "select") {
    return (
      <Select
        value={value || ''}
        onValueChange={(next) =>
          onChange(field.key, next === EMPTY_OPTION ? "" : next)
        }
      >
        <SelectTrigger id={id} className="h-11">
          <SelectValue placeholder="Non renseigné" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={EMPTY_OPTION}>Non renseigné (entre crochets)</SelectItem>
          {field.options.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    );
  }

  return (
    <Input
      {...commonProps}
      type={field.type || "text"}
      min={field.min}
      max={field.max}
      inputMode={field.type === "number" ? "numeric" : undefined}
    />
  );
}

/**
 * Formulaire de saisie du contrat de partenariat.
 * Toutes les valeurs sont facultatives : un champ vide conserve le texte
 * de repli prévu dans le contrat (entre crochets).
 */
const ContractForm = ({
  values,
  onChange,
  onPrefillProfile,
  onReset,
  canPrefillProfile = false,
}) => {
  const filledCount = ALL_FIELDS.filter((field) => {
    const value = values?.[field.key];
    return value !== undefined && value !== null && String(value).trim() !== "";
  }).length;

  const totalFields = ALL_FIELDS.length;
  const percent = totalFields === 0 ? 0 : Math.round((filledCount / totalFields) * 100);

  return (
    <div className="space-y-5">
      <div className="rounded-xl border bg-card p-5 shadow-sm">
        <div className="flex items-center gap-2">
          <BadgeCheck className="h-5 w-5 text-primary" />
          <h2 className="text-base font-semibold">Compléter le contrat</h2>
        </div>
        <p className="mt-1.5 text-sm text-muted-foreground">
          Les champs sont facultatifs. Ceux laissés vides restent affichés entre
          crochets, pour être complétés à la main sur l’exemplaire signé.
        </p>

        <div className="mt-4 space-y-1.5">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>
              {filledCount} / {totalFields} champs renseignés
            </span>
            <span>{percent} %</span>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-primary transition-all"
              style={{ width: `${percent}%` }}
            />
          </div>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          {canPrefillProfile && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onPrefillProfile}
            >
              <User className="mr-1.5 h-4 w-4" />
              Pré-remplir ma partie
            </Button>
          )}
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onReset}
            className="text-muted-foreground"
          >
            <RotateCcw className="mr-1.5 h-4 w-4" />
            Réinitialiser
          </Button>
        </div>

        <p className="mt-3 flex items-start gap-1.5 text-xs text-muted-foreground">
          <Wand2 className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          La saisie est enregistrée automatiquement dans ce navigateur. Aucune
          donnée n’est envoyée à un serveur.
        </p>
      </div>

      <Accordion
        type="multiple"
        defaultValue={["partie-a", "partie-b", "conditions"]}
        className="rounded-xl border bg-card px-4 shadow-sm"
      >
        {FIELD_GROUPS.map((group) => (
          <AccordionItem key={group.id} value={group.id}>
            <AccordionTrigger className="text-left">
              <span className="flex flex-col gap-0.5">
                <span className="text-sm font-semibold">{group.title}</span>
                {group.description && (
                  <span className="text-xs font-normal text-muted-foreground">
                    {group.description}
                  </span>
                )}
              </span>
            </AccordionTrigger>
            <AccordionContent>
              <div className="grid gap-4 sm:grid-cols-2">
                {group.fields.map((field) => (
                  <div
                    key={field.key}
                    className={field.type === "select" ? "sm:col-span-2" : undefined}
                  >
                    <Label htmlFor={fieldDomId(field.key)} className="mb-1.5 block">
                      {field.label}
                    </Label>
                    <FieldControl
                      field={field}
                      value={values?.[field.key]}
                      onChange={onChange}
                    />
                    {field.hint && (
                      <p className="mt-1 text-xs text-muted-foreground">{field.hint}</p>
                    )}
                  </div>
                ))}
              </div>
            </AccordionContent>
          </AccordionItem>
        ))}
      </Accordion>
    </div>
  );
};

export default ContractForm;
