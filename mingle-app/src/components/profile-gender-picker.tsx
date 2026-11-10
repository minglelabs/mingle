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

/**
 * Two big ♀ / ♂ buttons in the same pink / blue as the profile gender-age badge.
 * `size="large"` is the onboarding screen: tall cards that fill the width, so
 * one thumb tap anywhere on them picks the gender.
 */
export default function ProfileGenderPicker({
  value,
  onChange,
  copy,
  disabled = false,
  className = "",
  size = "regular",
}: {
  value: ProfileGender | null;
  onChange: (gender: ProfileGender) => void;
  copy: ProfileGenderCopy;
  disabled?: boolean;
  className?: string;
  size?: "regular" | "large";
}) {
  const isLarge = size === "large";
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
              className={`flex items-center justify-center border font-semibold transition active:scale-[0.97] disabled:opacity-60 ${
                isLarge
                  ? "h-40 flex-col gap-3 rounded-[1.6rem] text-[1.1rem]"
                  : "h-14 gap-2 rounded-[1.2rem] text-[0.98rem]"
              } ${
                isSelected ? selectedClass : "border-[#ece6db] bg-white text-slate-700"
              }`}
            >
              <Icon size={isLarge ? 44 : 20} strokeWidth={2.6} className={iconClass} aria-hidden="true" />
              {gender === "female" ? copy.female : copy.male}
            </button>
          );
        })}
      </div>
      <p className={`${isLarge ? "mt-4" : "mt-2"} text-center text-[0.78rem] text-slate-500`}>{copy.publicHint}</p>
    </div>
  );
}
