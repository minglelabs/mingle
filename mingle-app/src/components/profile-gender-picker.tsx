"use client";

import { Mars, Venus } from "lucide-react";
import type { ProfileGenderCopy } from "@/i18n/profile-gender-copy";
import type { ProfileGender } from "@/lib/profile-gender";

const OPTIONS: ReadonlyArray<{
  gender: ProfileGender;
  Icon: typeof Venus;
  selectedClass: string;
  iconClass: string;
}> = [
  {
    gender: "female",
    Icon: Venus,
    selectedClass: "border-[#FF5E8E] bg-[#FFF0F5] text-[#E0336A] shadow-[0_12px_26px_rgba(255,94,142,0.18)]",
    iconClass: "text-[#FF5E8E]",
  },
  {
    gender: "male",
    Icon: Mars,
    selectedClass: "border-[#3B9BFF] bg-[#EEF6FF] text-[#1F7AE0] shadow-[0_12px_26px_rgba(59,155,255,0.18)]",
    iconClass: "text-[#3B9BFF]",
  },
];

/** Two big ♀ / ♂ buttons in the same pink / blue as the profile gender-age badge. */
export default function ProfileGenderPicker({
  value,
  onChange,
  copy,
  disabled = false,
  className = "",
}: {
  value: ProfileGender | null;
  onChange: (gender: ProfileGender) => void;
  copy: ProfileGenderCopy;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <div className={className}>
      <div role="radiogroup" aria-label={copy.label} className="grid grid-cols-2 gap-3">
        {OPTIONS.map(({ gender, Icon, selectedClass, iconClass }) => {
          const isSelected = value === gender;
          return (
            <button
              key={gender}
              type="button"
              role="radio"
              aria-checked={isSelected}
              disabled={disabled}
              onClick={() => onChange(gender)}
              className={`flex h-14 items-center justify-center gap-2 rounded-[1.2rem] border text-[0.98rem] font-semibold transition disabled:opacity-60 ${
                isSelected ? selectedClass : "border-[#ece6db] bg-white text-slate-700"
              }`}
            >
              <Icon size={20} strokeWidth={2.6} className={iconClass} aria-hidden="true" />
              {gender === "female" ? copy.female : copy.male}
            </button>
          );
        })}
      </div>
      <p className="mt-2 text-center text-[0.78rem] text-slate-500">{copy.publicHint}</p>
    </div>
  );
}
